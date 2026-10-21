package __PKG__;

// Coffre : gestionnaire de mots de passe hors ligne. Exposé en JavaScript sous window.MAGCoffre.
// Le constructeur ne fait rien (la classe est chargée dans toutes les applis) : la protection de la fenêtre,
// le suivi du premier plan et la biométrie ne démarrent que lorsque la page Coffre les demande.
//
// Méthodes (JavaScript -> Java) :
//   secure(bool)        FLAG_SECURE (pas de capture ni d'aperçu dans les applis récentes), pas d'autoremplissage Android,
//                       et suivi arrière-plan / premier plan pour le verrouillage automatique
//   bioState()          JSON {api, hw, enrolled, stored, invalid, sensitiveClip}
//   bioEnroll(b64)      chiffre la clé du coffre (32 octets) avec une clé AES du Keystore protégée par l'empreinte (BiometricPrompt + CryptoObject)
//   bioUnlock()         déchiffre cette copie après une empreinte reconnue ; la page la récupère ensuite par bioTake()
//   bioTake()           rend la clé déchiffrée une seule fois, puis l'oublie
//   bioCancel()         ferme la fenêtre d'empreinte
//   bioForget()         supprime la clé du Keystore et la copie chiffrée
//   copy(texte, sensible)  presse-papiers ; si sensible : marqué EXTRA_IS_SENSITIVE (Android 13+) et effacé après 30 s
//   clipClear()         efface tout de suite ce que Coffre a copié
//
// Événements (Java -> JavaScript), sur le fil UI : window.coffreEvent(type, objet)
//   bio-ok {}  bio-enrolled {}  bio-cancel {}  bio-error {code,msg}  bio-invalid {}  stop {}  resume {away}  clip {cleared}

import android.app.Activity;
import android.app.Application;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class CoffreBridge {
    private static final String ALIAS = "coffre_bio_v1";
    private static final String PREFS = "coffre_bio";
    private static final String KS = "AndroidKeyStore";
    private static final long CLIP_MS = 30000;
    private static final String CLIP_LABEL = "Coffre";

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private volatile boolean secured = false;
    private long stoppedAt = 0;
    private Application.ActivityLifecycleCallbacks life;
    private CancellationSignal cancel;
    private volatile String pendingKey;
    private Runnable clipTask;

    public CoffreBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------------------------------------------------------------- Fenêtre protégée
    @JavascriptInterface
    public void secure(final boolean on) {
        secured = on;
        ui.post(new Runnable() { public void run() {
            try {
                if (on) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                if (Build.VERSION.SDK_INT >= 33) a.setRecentsScreenshotEnabled(!on);
                if (Build.VERSION.SDK_INT >= 26) wv.setImportantForAutofill(on ? View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS : View.IMPORTANT_FOR_AUTOFILL_AUTO);
                if (on && life == null) {
                    life = new Application.ActivityLifecycleCallbacks() {
                        public void onActivityStopped(Activity x) { if (x == a && secured) { stoppedAt = SystemClock.elapsedRealtime(); emit("stop", "{}"); } }
                        public void onActivityCreated(Activity x, Bundle b) { }
                        public void onActivityStarted(Activity x) { }
                        public void onActivityResumed(Activity x) { }
                        public void onActivityPaused(Activity x) { }
                        public void onActivitySaveInstanceState(Activity x, Bundle b) { }
                        public void onActivityDestroyed(Activity x) { if (x == a) { try { a.getApplication().unregisterActivityLifecycleCallbacks(this); } catch (Exception e) { } life = null; } }
                    };
                    a.getApplication().registerActivityLifecycleCallbacks(life);
                }
            } catch (Exception e) { }
        } });
    }

    // ---------------------------------------------------------------- Empreinte
    private SharedPreferences prefs() { return a.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private SecretKey loadKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KS); ks.load(null);
        return ks.containsAlias(ALIAS) ? (SecretKey) ks.getKey(ALIAS, null) : null;
    }

    private void deleteAll() {
        try { KeyStore ks = KeyStore.getInstance(KS); ks.load(null); if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS); } catch (Exception e) { }
        prefs().edit().clear().apply();
    }

    private boolean hasBlob() { return prefs().contains("ct") && prefs().contains("iv"); }

    @SuppressWarnings("deprecation")
    @JavascriptInterface
    public String bioState() {
        JSONObject o = new JSONObject();
        int api = Build.VERSION.SDK_INT;
        boolean hw = false, enrolled = false, stored = false, invalid = false;
        try {
            if (api >= 29) {
                android.hardware.biometrics.BiometricManager bm = a.getSystemService(android.hardware.biometrics.BiometricManager.class);
                int r = api >= 30 ? bm.canAuthenticate(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG) : bm.canAuthenticate();
                hw = r != android.hardware.biometrics.BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE && r != android.hardware.biometrics.BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE;
                enrolled = r == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
            } else if (api == 28) {
                hw = a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
                enrolled = hw;
                try {
                    android.hardware.fingerprint.FingerprintManager fm = a.getSystemService(android.hardware.fingerprint.FingerprintManager.class);
                    if (fm != null) { hw = fm.isHardwareDetected(); enrolled = fm.hasEnrolledFingerprints(); }
                } catch (Throwable t) { }
            }
            if (api >= 28 && hasBlob()) {
                SecretKey k = loadKey();
                if (k == null) { deleteAll(); invalid = true; }
                else {
                    // Une clé invalidée (empreinte ajoutée ou supprimée) refuse dès l'initialisation, sans demander le doigt
                    try { Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(prefs().getString("iv", ""), Base64.NO_WRAP))); stored = true; }
                    catch (KeyPermanentlyInvalidatedException e) { deleteAll(); invalid = true; }
                    catch (Exception e) { stored = true; }
                }
            }
            o.put("api", api); o.put("hw", hw); o.put("enrolled", enrolled); o.put("stored", stored); o.put("invalid", invalid);
            o.put("sensitiveClip", api >= 33);
        } catch (Exception e) { }
        return o.toString();
    }

    private SecretKey newKey() throws Exception {
        deleteAll();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KS);
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= 24) b.setInvalidatedByBiometricEnrollment(true);
        // Authentification à chaque usage, par empreinte forte uniquement (pas de code de l'écran de verrouillage)
        if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        kg.init(b.build());
        return kg.generateKey();
    }

    @JavascriptInterface
    public void bioEnroll(final String dekB64) {
        final byte[] dek;
        try { dek = Base64.decode(dekB64, Base64.DEFAULT); } catch (Exception e) { emit("bio-error", err(0, "Clé illisible")); return; }
        if (dek.length != 32 || Build.VERSION.SDK_INT < 28) { Arrays.fill(dek, (byte) 0); emit("bio-error", err(0, "Empreinte indisponible sur cet appareil")); return; }
        ui.post(new Runnable() { public void run() {
            final Cipher c;
            try {
                SecretKey k = newKey();
                c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.ENCRYPT_MODE, k);   // IV choisi par le Keystore (aléatoire, 12 octets)
            } catch (Exception e) { Arrays.fill(dek, (byte) 0); deleteAll(); emit("bio-error", err(0, "Clé d'empreinte impossible à créer : " + e.getClass().getSimpleName())); return; }
            prompt(c, "Activer l'empreinte", "Pose ton doigt sur le bouton latéral", "Annuler", new Done() {
                public void ok(Cipher ci) {
                    try {
                        byte[] ct = ci.doFinal(dek);
                        prefs().edit().putString("iv", Base64.encodeToString(ci.getIV(), Base64.NO_WRAP)).putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP)).apply();
                        emit("bio-enrolled", "{}");
                    } catch (Exception e) { deleteAll(); emit("bio-error", err(0, "Empreinte non enregistrée")); }
                    finally { Arrays.fill(dek, (byte) 0); }
                }
                public void fail() { Arrays.fill(dek, (byte) 0); deleteAll(); }
            });
        } });
    }

    @JavascriptInterface
    public void bioUnlock() {
        if (Build.VERSION.SDK_INT < 28) { emit("bio-error", err(0, "Empreinte indisponible sur cet appareil")); return; }
        ui.post(new Runnable() { public void run() {
            final byte[] iv, ct; final Cipher c;
            try {
                SecretKey k = loadKey();
                if (k == null || !hasBlob()) { deleteAll(); emit("bio-invalid", "{}"); return; }
                iv = Base64.decode(prefs().getString("iv", ""), Base64.NO_WRAP);
                ct = Base64.decode(prefs().getString("ct", ""), Base64.NO_WRAP);
                c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, iv));
            } catch (KeyPermanentlyInvalidatedException e) { deleteAll(); emit("bio-invalid", "{}"); return; }
            catch (Exception e) { emit("bio-error", err(0, "Empreinte indisponible, utilise ton mot de passe.")); return; }
            prompt(c, "Ouvrir le coffre", "Pose ton doigt sur le bouton latéral", "Mot de passe", new Done() {
                public void ok(Cipher ci) {
                    try {
                        byte[] dek = ci.doFinal(ct);
                        pendingKey = Base64.encodeToString(dek, Base64.NO_WRAP);
                        Arrays.fill(dek, (byte) 0);
                        emit("bio-ok", "{}");
                        // La page doit la prendre tout de suite ; sinon elle est oubliée
                        ui.postDelayed(new Runnable() { public void run() { pendingKey = null; } }, 5000);
                    } catch (Exception e) { emit("bio-error", err(0, "Lecture impossible, utilise ton mot de passe.")); }
                }
                public void fail() { }
            });
        } });
    }

    @JavascriptInterface
    public String bioTake() { String k = pendingKey; pendingKey = null; return k == null ? "" : k; }

    @JavascriptInterface
    public void bioCancel() { ui.post(new Runnable() { public void run() { try { if (cancel != null) cancel.cancel(); } catch (Exception e) { } } }); }

    @JavascriptInterface
    public void bioForget() { pendingKey = null; deleteAll(); }

    private interface Done { void ok(Cipher c); void fail(); }

    private void prompt(Cipher c, String title, String sub, String neg, final Done done) {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            final boolean[] over = { false };
            android.hardware.biometrics.BiometricPrompt.Builder pb = new android.hardware.biometrics.BiometricPrompt.Builder(a)
                .setTitle(title).setSubtitle(sub)
                .setNegativeButton(neg, a.getMainExecutor(), new android.content.DialogInterface.OnClickListener() {
                    public void onClick(android.content.DialogInterface d, int w) { if (!over[0]) { over[0] = true; done.fail(); emit("bio-cancel", "{}"); } }
                });
            if (Build.VERSION.SDK_INT >= 29) pb.setConfirmationRequired(false);
            if (Build.VERSION.SDK_INT >= 30) pb.setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG);
            cancel = new CancellationSignal();
            pb.build().authenticate(new android.hardware.biometrics.BiometricPrompt.CryptoObject(c), cancel, a.getMainExecutor(),
                new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult r) {
                        if (over[0]) return; over[0] = true;
                        Cipher ci = r.getCryptoObject() != null ? r.getCryptoObject().getCipher() : null;
                        if (ci == null) { done.fail(); emit("bio-error", err(0, "Empreinte non liée à la clé")); return; }
                        done.ok(ci);
                    }
                    @Override public void onAuthenticationError(int code, CharSequence msg) {
                        if (over[0]) return; over[0] = true; done.fail();
                        if (code == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                            || code == android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_CANCELED
                            || code == 13 /* bouton négatif (valeur fixe d'Android) */) emit("bio-cancel", "{}");
                        else emit("bio-error", err(code, msg == null ? "Empreinte indisponible" : msg.toString()));
                    }
                    // onAuthenticationFailed : doigt non reconnu, la fenêtre reste ouverte et Android affiche le message
                });
        } catch (Exception e) { done.fail(); emit("bio-error", err(0, "Empreinte indisponible : " + e.getClass().getSimpleName())); }
    }

    // ---------------------------------------------------------------- Presse-papiers
    @JavascriptInterface
    public void copy(final String text, final boolean sensitive) {
        ui.post(new Runnable() { public void run() {
            try {
                ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData cd = ClipData.newPlainText(CLIP_LABEL, text);
                if (sensitive && Build.VERSION.SDK_INT >= 24) {
                    PersistableBundle ex = new PersistableBundle();
                    ex.putBoolean(Build.VERSION.SDK_INT >= 33 ? ClipDescription.EXTRA_IS_SENSITIVE : "android.content.extra.IS_SENSITIVE", true);
                    cd.getDescription().setExtras(ex);
                }
                cm.setPrimaryClip(cd);
                if (clipTask != null) ui.removeCallbacks(clipTask);
                clipTask = null;
                if (sensitive) {
                    clipTask = new Runnable() { public void run() { clipTask = null; clearOurs(false); } };
                    ui.postDelayed(clipTask, CLIP_MS);
                }
            } catch (Exception e) { }
        } });
    }

    @JavascriptInterface
    public void clipClear() {
        ui.post(new Runnable() { public void run() { if (clipTask != null) { ui.removeCallbacks(clipTask); clipTask = null; } clearOurs(true); } });
    }

    // Efface le presse-papiers s'il contient encore ce que Coffre y a mis. En arrière-plan, Android 10+ cache le contenu
    // aux applis : on efface alors sans pouvoir vérifier (au pire, un texte copié entre-temps ailleurs est perdu).
    private void clearOurs(boolean now) {
        try {
            ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipDescription d = cm.getPrimaryClipDescription();
            if (d != null && d.getLabel() != null && !CLIP_LABEL.contentEquals(d.getLabel())) return;
            if (Build.VERSION.SDK_INT >= 28) cm.clearPrimaryClip();
            else cm.setPrimaryClip(ClipData.newPlainText("", ""));
            emit("clip", "{\"cleared\":true}");
        } catch (Exception e) { }
    }

    // ---------------------------------------------------------------- Cycle de vie (appelé par MainActivity)
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { }
    public void onResume() {
        if (!secured) return;
        long away = stoppedAt > 0 ? SystemClock.elapsedRealtime() - stoppedAt : 0;
        stoppedAt = 0;
        emit("resume", "{\"away\":" + away + "}");
    }
    public void onIntent(Intent i) { }

    // ---------------------------------------------------------------- Outils
    private static String err(int code, String msg) {
        try { JSONObject o = new JSONObject(); o.put("code", code); o.put("msg", msg); return o.toString(); } catch (Exception e) { return "{}"; }
    }
    private void emit(final String type, final String json) {
        final String js = "window.coffreEvent&&coffreEvent(" + JSONObject.quote(type) + "," + json + ")";
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }
}
