package __PKG__;

// Urgence : SOS par SMS avec position, contacts d'urgence, fiche médicale lisible écran verrouillé,
// lampe SOS, sirène, partage de position et détection de chute (service au premier plan).
// Exposé en JavaScript sous window.MAGUrgence. Le constructeur ne fait rien : cette classe est chargée
// dans toutes les applis MAG ; rien ne démarre tant que la page Urgence ne le demande pas.
//
// Deux classes imbriquées (dans ce fichier pour ne pas casser la compilation des autres applis, qui copient
// tous les *Bridge.java) ; à déclarer dans le manifeste de l'appli Urgence seulement (voir urgence-manifest.txt) :
//   UrgenceBridge$Fiche  activité native « Infos médicales », affichée par-dessus l'écran verrouillé
//   UrgenceBridge$Veille service au premier plan (type location) : partage de position et détection de chute
//
// Événements poussés à la page : window.urgenceEvent(type, objet), toujours sur le fil UI
//   loc     {lat,lng,acc,age,prov,fresh}   position (meilleure connue, puis améliorations)
//   locend  {ok,lat,lng,acc,age,gpsOff}    fin de la recherche (précision suffisante ou délai écoulé)
//   perm    {...info()}                    après une demande d'autorisation
//   contact {name,num} | {err}             contact choisi dans le carnet
//   sms     {num,ok,err,part,parts,tag}    accusé d'envoi de chaque partie de SMS (envoi direct)
//   lamp    {on}                           chaque allumage / extinction de la torche (pour synchroniser l'écran)
//   track   {...trackState()}              partage de position : état
//   fall    {...fallState()}               détection de chute : état
//   resume  {}                             l'appli revient au premier plan

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.telephony.TelephonyManager;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.ref.WeakReference;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;

public class UrgenceBridge {
    static final String PREFS = "urgence";
    static final int REQ_SMS = 5901, REQ_CALL = 5902, REQ_LOC = 5903, REQ_NOTIF = 5904, REQ_PICK = 5905;
    static final int NOTIF_FICHE = 5920, NOTIF_VEILLE = 5921, NOTIF_ALARME = 5922;
    static final String CH_FICHE = "urgence_fiche", CH_VEILLE = "urgence_veille", CH_ALARME = "urgence_alarme";

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());
    static volatile WeakReference<UrgenceBridge> live = new WeakReference<UrgenceBridge>(null);

    public UrgenceBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ================= Cycle de vie (appelé par MainActivity) =================
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_PICK) return;
        JSONObject o = new JSONObject();
        try {
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) { o.put("err", "cancel"); emit("contact", o); return; }
            Cursor c = a.getContentResolver().query(data.getData(), new String[]{ ContactsContract.Contacts.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER }, null, null, null);
            if (c != null) {
                try { if (c.moveToFirst()) { o.put("name", s(c.getString(0))); o.put("num", s(c.getString(1))); } }
                finally { c.close(); }
            }
            if (!o.has("num")) o.put("err", "Numéro introuvable pour ce contact");
        } catch (Exception e) { try { o.put("err", "Lecture du contact impossible"); } catch (Exception x) { } }
        emit("contact", o);
    }

    public void onPermissions(int requestCode) {
        if (requestCode < REQ_SMS || requestCode > REQ_NOTIF) return;
        try {
            JSONObject o = new JSONObject(info());
            o.put("asked", requestCode == REQ_SMS ? "sms" : requestCode == REQ_CALL ? "call" : requestCode == REQ_LOC ? "loc" : "notif");
            emit("perm", o);
            if (requestCode == REQ_NOTIF && prefs(a).getBoolean("medNotif", false)) postFiche(a);
        } catch (Exception e) { }
    }

    public void onResume() {
        // Rien dans les autres applis : ces réglages n'existent que dans l'appli Urgence
        SharedPreferences p = prefs(a);
        if (!p.contains("data")) return;
        if (p.getBoolean("medNotif", false)) postFiche(a);
        emit("resume", new JSONObject());
    }

    public void onIntent(Intent i) { }

    // ================= État et autorisations =================
    @JavascriptInterface
    public String info() {
        live = new WeakReference<UrgenceBridge>(this);
        JSONObject o = new JSONObject();
        try {
            PackageManager pm = a.getPackageManager();
            boolean tel = pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
            o.put("tel", tel);
            boolean sim = false;
            try { TelephonyManager tm = (TelephonyManager) a.getSystemService(Context.TELEPHONY_SERVICE); sim = tm != null && tm.getSimState() == TelephonyManager.SIM_STATE_READY; } catch (Exception e) { }
            o.put("sim", sim);
            o.put("sms", permState(Manifest.permission.SEND_SMS, tel));
            o.put("call", permState(Manifest.permission.CALL_PHONE, tel));
            o.put("loc", has(a, Manifest.permission.ACCESS_FINE_LOCATION) ? "granted" : has(a, Manifest.permission.ACCESS_COARSE_LOCATION) ? "coarse" : permState(Manifest.permission.ACCESS_FINE_LOCATION, true));
            o.put("notif", Build.VERSION.SDK_INT < 33 ? "granted" : permState("android.permission.POST_NOTIFICATIONS", true));
            boolean gps = false;
            try { gps = ((LocationManager) a.getSystemService(Context.LOCATION_SERVICE)).isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception e) { }
            o.put("gps", gps);
            o.put("torch", torchId() != null);
            o.put("medNotif", prefs(a).getBoolean("medNotif", false));
            o.put("fiche", declared(a, "activity", Fiche.class.getName()));
            o.put("service", declared(a, "service", Veille.class.getName()));
            o.put("fullScreen", canFullScreen(a));
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("battery", battery(a));
        } catch (Exception e) { }
        return o.toString();
    }

    // granted | ask (jamais demandée) | denied (refusée, on peut redemander) | blocked (refus définitif ou paramètre restreint) | undeclared | none (pas de téléphonie)
    private String permState(String p, boolean feature) {
        if (!feature) return "none";
        if (!requested(a, p)) return "undeclared";
        if (has(a, p)) return "granted";
        boolean asked = prefs(a).getBoolean("asked_" + p, false);
        if (!asked) return "ask";
        if (Build.VERSION.SDK_INT >= 23 && a.shouldShowRequestPermissionRationale(p)) return "denied";
        return "blocked";
    }

    @JavascriptInterface
    public void ask(final String what) {
        ui.post(new Runnable() { public void run() {
            String[] p; int code;
            if ("sms".equals(what)) { p = new String[]{ Manifest.permission.SEND_SMS }; code = REQ_SMS; }
            else if ("call".equals(what)) { p = new String[]{ Manifest.permission.CALL_PHONE }; code = REQ_CALL; }
            else if ("loc".equals(what)) { p = new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }; code = REQ_LOC; }
            else if ("notif".equals(what) && Build.VERSION.SDK_INT >= 33) { p = new String[]{ "android.permission.POST_NOTIFICATIONS" }; code = REQ_NOTIF; }
            else return;
            SharedPreferences.Editor e = prefs(a).edit();
            for (String x : p) e.putBoolean("asked_" + x, true);
            e.apply();
            if (Build.VERSION.SDK_INT >= 23) a.requestPermissions(p, code); else onPermissions(code);
        } });
    }

    @JavascriptInterface
    public void openSettings(final String what) {
        ui.post(new Runnable() { public void run() {
            Intent i;
            if ("gps".equals(what)) i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            else if ("fullscreen".equals(what) && Build.VERSION.SDK_INT >= 34) i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", Uri.parse("package:" + a.getPackageName()));
            else if ("notif".equals(what) && Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName());
            else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()));
            try { a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (Exception e) { try { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } catch (Exception x) { } }
        } });
    }

    // ================= Contacts =================
    @JavascriptInterface
    public void pickContact() {
        ui.post(new Runnable() { public void run() {
            try { a.startActivityForResult(new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI), REQ_PICK); }
            catch (Exception e) { JSONObject o = new JSONObject(); try { o.put("err", "Carnet d'adresses indisponible"); } catch (Exception x) { } emit("contact", o); }
        } });
    }

    // ================= Position =================
    private LocationManager lm;
    private LocationListener ll;
    private Location best;
    private final Runnable locTimeout = new Runnable() { public void run() { endLocate(false); } };

    @JavascriptInterface
    public void locate(final int maxMs) {
        ui.post(new Runnable() { public void run() {
            stopLoc();
            if (!has(a, Manifest.permission.ACCESS_FINE_LOCATION) && !has(a, Manifest.permission.ACCESS_COARSE_LOCATION)) {
                JSONObject o = new JSONObject(); try { o.put("ok", false); o.put("err", "perm"); } catch (Exception e) { } emit("locend", o); return;
            }
            lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
            best = lastKnown(lm);
            if (best != null) emitLoc("loc", best, false);
            ll = new LocationListener() {
                public void onLocationChanged(Location l) {
                    if (better(l, best)) { best = l; emitLoc("loc", l, true); }
                    if (LocationManager.GPS_PROVIDER.equals(l.getProvider()) && l.hasAccuracy() && l.getAccuracy() <= 12) endLocate(true);
                }
                public void onStatusChanged(String p, int s, Bundle e) { }
                public void onProviderEnabled(String p) { }
                public void onProviderDisabled(String p) { }
            };
            try {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0, 0, ll, Looper.getMainLooper());
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0, 0, ll, Looper.getMainLooper());
            } catch (SecurityException e) { } catch (Exception e) { }
            ui.postDelayed(locTimeout, Math.max(3000, Math.min(maxMs, 180000)));
        } });
    }

    @JavascriptInterface
    public void stopLocate() { ui.post(new Runnable() { public void run() { stopLoc(); } }); }

    private void endLocate(boolean precise) {
        boolean gpsOff = false;
        try { gpsOff = lm != null && !lm.isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception e) { }
        stopLoc();
        JSONObject o = best != null ? locJson(best, true) : new JSONObject();
        try { o.put("ok", best != null); o.put("precise", precise); o.put("gpsOff", gpsOff); } catch (Exception e) { }
        emit("locend", o);
    }

    private void stopLoc() {
        ui.removeCallbacks(locTimeout);
        if (lm != null && ll != null) { try { lm.removeUpdates(ll); } catch (Exception e) { } }
        ll = null;
    }

    static Location lastKnown(LocationManager lm) {
        Location b = null;
        try { for (String p : lm.getProviders(true)) { try { Location l = lm.getLastKnownLocation(p); if (better(l, b)) b = l; } catch (SecurityException e) { } } } catch (Exception e) { }
        return b;
    }

    static long ageMs(Location l) {
        if (Build.VERSION.SDK_INT >= 17 && l.getElapsedRealtimeNanos() > 0) return Math.max(0, (SystemClock.elapsedRealtimeNanos() - l.getElapsedRealtimeNanos()) / 1000000L);
        return Math.max(0, System.currentTimeMillis() - l.getTime());
    }

    static boolean better(Location l, Location cur) {
        if (l == null) return false;
        if (cur == null) return true;
        long d = ageMs(cur) - ageMs(l);           // > 0 : l est plus récente
        if (d > 120000) return true;
        if (d < -120000) return false;
        float al = l.hasAccuracy() ? l.getAccuracy() : 9999, ac = cur.hasAccuracy() ? cur.getAccuracy() : 9999;
        if (al < ac) return true;
        return d > 0 && al <= ac * 1.5f;
    }

    private JSONObject locJson(Location l, boolean fresh) {
        JSONObject o = new JSONObject();
        try {
            o.put("lat", l.getLatitude()); o.put("lng", l.getLongitude());
            o.put("acc", l.hasAccuracy() ? Math.round(l.getAccuracy()) : -1);
            o.put("age", ageMs(l)); o.put("prov", s(l.getProvider())); o.put("fresh", fresh);
        } catch (Exception e) { }
        return o;
    }
    private void emitLoc(String type, Location l, boolean fresh) { emit(type, locJson(l, fresh)); }

    @JavascriptInterface
    public int battery() { return battery(a); }

    static int battery(Context c) {
        try { BatteryManager bm = (BatteryManager) c.getSystemService(Context.BATTERY_SERVICE); int v = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY); if (v > 0 && v <= 100) return v; } catch (Exception e) { }
        try { Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED)); int l = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), sc = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100); if (l >= 0) return Math.round(100f * l / sc); } catch (Exception e) { }
        return -1;
    }

    // ================= SMS =================
    private static final String SMS_SENT = ".URGENCE_SMS_SENT";
    private BroadcastReceiver smsRx;
    private static int smsReq = 1;

    // Envoie le texte aux numéros (tableau JSON). Retour : "direct" (envoi par le téléphone, accusés par l'événement sms),
    // "app:<raison>" (appli SMS ouverte avec le message prérempli : l'utilisateur doit appuyer sur Envoyer), "error:<message>".
    @JavascriptInterface
    public String sendSms(String numbersJson, String text, String tag) {
        List<String> nums = numbers(numbersJson);
        if (nums.isEmpty()) return "error:Aucun numéro";
        String why = smsBlocker(a);
        if (why == null) {
            try {
                registerSmsRx();
                SmsManager sm = smsManager(a);
                ArrayList<String> parts = sm.divideMessage(text);
                for (String n : nums) {
                    ArrayList<PendingIntent> sent = new ArrayList<PendingIntent>();
                    for (int k = 0; k < parts.size(); k++) {
                        Intent i = new Intent(a.getPackageName() + SMS_SENT).setPackage(a.getPackageName())
                            .putExtra("num", n).putExtra("part", k).putExtra("parts", parts.size()).putExtra("tag", tag == null ? "" : tag);
                        sent.add(PendingIntent.getBroadcast(a, 5900 + (smsReq++ % 5000), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_ONE_SHOT));
                    }
                    sm.sendMultipartTextMessage(n, null, parts, sent, null);
                }
                return "direct";
            } catch (Exception e) {
                why = "Envoi direct refusé par le téléphone (" + s(e.getMessage()) + ")";
            }
        }
        if (openSmsApp(nums, text)) return "app:" + why;
        return "error:Aucune appli SMS trouvée";
    }

    @JavascriptInterface
    public boolean openSms(String numbersJson, String text) { return openSmsApp(numbers(numbersJson), text); }

    private boolean openSmsApp(List<String> nums, String text) {
        try {
            Intent i = smsAppIntent(nums, text);
            a.startActivity(i);
            return true;
        } catch (Exception e) {
            try { // Repli : partage du texte, l'utilisateur choisit l'appli
                Intent s = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                a.startActivity(Intent.createChooser(s, "Envoyer l'alerte"));
                return true;
            } catch (Exception x) { return false; }
        }
    }

    static Intent smsAppIntent(List<String> nums, String text) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + TextUtils.join(";", nums)));
        i.putExtra("sms_body", text);
        i.putExtra(Intent.EXTRA_TEXT, text);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    // null si l'envoi direct est possible, sinon la raison en clair
    static String smsBlocker(Context c) {
        PackageManager pm = c.getPackageManager();
        if (!pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) return "ce téléphone ne gère pas les SMS";
        if (!requested(c, Manifest.permission.SEND_SMS)) return "l'envoi direct n'est pas prévu dans cette version de l'appli";
        if (!has(c, Manifest.permission.SEND_SMS)) return "autorisation SMS non accordée";
        return null;
    }

    static SmsManager smsManager(Context c) {
        SmsManager sm = null;
        if (Build.VERSION.SDK_INT >= 31) { try { sm = c.getSystemService(SmsManager.class); } catch (Exception e) { } }
        return sm != null ? sm : SmsManager.getDefault();
    }

    // Envoi direct sans retour (service) : nombre de destinataires traités
    static int sendDirect(Context c, List<String> nums, String text) {
        if (smsBlocker(c) != null || nums.isEmpty()) return 0;
        int n = 0;
        try {
            SmsManager sm = smsManager(c);
            ArrayList<String> parts = sm.divideMessage(text);
            for (String x : nums) { try { sm.sendMultipartTextMessage(x, null, parts, null, null); n++; } catch (Exception e) { } }
        } catch (Exception e) { }
        return n;
    }

    private void registerSmsRx() {
        if (smsRx != null) return;
        smsRx = new BroadcastReceiver() {
            public void onReceive(Context c, Intent i) {
                int r = getResultCode();
                JSONObject o = new JSONObject();
                try {
                    o.put("num", s(i.getStringExtra("num"))); o.put("part", i.getIntExtra("part", 0)); o.put("parts", i.getIntExtra("parts", 1));
                    o.put("tag", s(i.getStringExtra("tag")));
                    o.put("ok", r == Activity.RESULT_OK);
                    if (r != Activity.RESULT_OK) o.put("err",
                        r == SmsManager.RESULT_ERROR_RADIO_OFF ? "Mode avion ou réseau coupé" :
                        r == SmsManager.RESULT_ERROR_NO_SERVICE ? "Pas de réseau" :
                        r == SmsManager.RESULT_ERROR_NULL_PDU ? "Message refusé" : "Échec de l'envoi (code " + r + ")");
                } catch (Exception e) { }
                emit("sms", o);
            }
        };
        IntentFilter f = new IntentFilter(a.getPackageName() + SMS_SENT);
        Context ac = a.getApplicationContext();
        if (Build.VERSION.SDK_INT >= 33) ac.registerReceiver(smsRx, f, Context.RECEIVER_NOT_EXPORTED);
        else ac.registerReceiver(smsRx, f);
    }

    // ================= Appels =================
    // direct=true : appel immédiat si l'autorisation CALL_PHONE est accordée (les numéros d'urgence passent toujours par le composeur)
    @JavascriptInterface
    public String call(final String number, final boolean direct) {
        final String n = clean(number);
        if (n.isEmpty()) return "error";
        final String[] r = { "dial" };
        final boolean canCall = direct && has(a, Manifest.permission.CALL_PHONE) && a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
        ui.post(new Runnable() { public void run() {
            try { a.startActivity(new Intent(canCall ? Intent.ACTION_CALL : Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(n)))); }
            catch (Exception e) { try { a.startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(n)))); } catch (Exception x) { } }
        } });
        return canCall ? "call" : r[0];
    }

    // ================= Lampe, sirène, vibreur, luminosité =================
    private volatile String lampMode = "off";
    private Thread lampT;
    private String torch;

    private String torchId() {
        if (torch != null) return torch;
        try {
            CameraManager cm = (CameraManager) a.getSystemService(Context.CAMERA_SERVICE);
            String any = null;
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                Boolean f = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (f == null || !f) continue;
                Integer face = ch.get(CameraCharacteristics.LENS_FACING);
                if (face != null && face == CameraCharacteristics.LENS_FACING_BACK) { torch = id; return id; }
                if (any == null) any = id;
            }
            torch = any;
        } catch (Exception e) { }
        return torch;
    }

    private void setTorch(boolean on) {
        try { String id = torchId(); if (id != null && Build.VERSION.SDK_INT >= 23) ((CameraManager) a.getSystemService(Context.CAMERA_SERVICE)).setTorchMode(id, on); } catch (Exception e) { }
    }

    // mode : off | on | sos (morse ··· ––– ···) | strobe. Retourne false si le téléphone n'a pas de torche.
    @JavascriptInterface
    public boolean lamp(String mode) {
        lampMode = mode == null ? "off" : mode;
        if (torchId() == null) return false;
        if ("off".equals(lampMode)) { if (lampT != null) lampT.interrupt(); lampT = null; setTorch(false); return true; }
        if (lampT == null || !lampT.isAlive()) {
            lampT = new Thread(new Runnable() { public void run() { lampLoop(); } }, "urgence-lampe");
            lampT.start();
        }
        return true;
    }

    private static final int U = 220; // durée d'un point morse (ms)
    private static final int[] SOS = { 1, -1, 1, -1, 1, -3, 3, -1, 3, -1, 3, -3, 1, -1, 1, -1, 1, -7 };

    private void lampLoop() {
        boolean state = false;
        try {
            while (!Thread.currentThread().isInterrupted()) {
                String m = lampMode;
                if ("off".equals(m)) break;
                if ("on".equals(m)) { if (!state) { setTorch(true); state = true; lampEmit(true); } Thread.sleep(150); continue; }
                if ("strobe".equals(m)) { setTorch(true); lampEmit(true); Thread.sleep(70); setTorch(false); lampEmit(false); Thread.sleep(130); state = false; continue; }
                for (int k = 0; k < SOS.length && m.equals(lampMode); k++) {
                    boolean on = SOS[k] > 0;
                    setTorch(on); state = on; lampEmit(on);
                    Thread.sleep(Math.abs(SOS[k]) * U);
                }
            }
        } catch (InterruptedException e) { }
        setTorch(false); lampEmit(false);
    }

    private long lastLampEmit = 0;
    private void lampEmit(boolean on) {
        JSONObject o = new JSONObject(); try { o.put("on", on); o.put("mode", lampMode); } catch (Exception e) { }
        emit("lamp", o);
    }

    @JavascriptInterface
    public void siren(boolean on) { if (on) Siren.start(a.getApplicationContext()); else Siren.stop(a.getApplicationContext()); }

    @JavascriptInterface
    public boolean sirenOn() { return Siren.on(); }

    @JavascriptInterface
    public void vibrate(int ms) { buzz(a, new long[]{ 0, Math.max(10, Math.min(ms, 5000)) }); }

    static void buzz(Context c, long[] pattern) {
        try {
            Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1)); else v.vibrate(pattern, -1);
        } catch (Exception e) { }
    }

    @JavascriptInterface
    public void brightness(final boolean max) {
        ui.post(new Runnable() { public void run() {
            try { WindowManager.LayoutParams lp = a.getWindow().getAttributes(); lp.screenBrightness = max ? 1f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE; a.getWindow().setAttributes(lp); } catch (Exception e) { }
        } });
    }

    @JavascriptInterface
    public void stopAll() { lamp("off"); Siren.stop(a.getApplicationContext()); stopLocate(); brightness(false); }

    // ================= Données, fiche médicale, notification, raccourcis =================
    // json : {contacts:[{name,num,on}], fiche:{...}, set:{...}} ; lu par la fiche native et le service
    @JavascriptInterface
    public void saveData(String json) {
        try { new JSONObject(json); } catch (Exception e) { return; }
        prefs(a).edit().putString("data", json).apply();
        if (prefs(a).getBoolean("medNotif", false)) postFiche(a);
        if (declared(a, "activity", Fiche.class.getName())) ui.post(new Runnable() { public void run() { shortcuts(); } });
    }

    // on=true : notification permanente « Infos médicales » visible sur l'écran verrouillé. Retour : ok | perm | error
    @JavascriptInterface
    public String medNotif(boolean on) {
        prefs(a).edit().putBoolean("medNotif", on).apply();
        if (!on) { try { ((NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIF_FICHE); } catch (Exception e) { } return "ok"; }
        if (Build.VERSION.SDK_INT >= 33 && !has(a, "android.permission.POST_NOTIFICATIONS")) { ask("notif"); return "perm"; }
        return postFiche(a) ? "ok" : "error";
    }

    static boolean postFiche(Context c) {
        try {
            if (!declared(c, "activity", Fiche.class.getName())) return false;
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(CH_FICHE, "Infos médicales (écran verrouillé)", NotificationManager.IMPORTANCE_LOW);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            JSONObject f = data(c).optJSONObject("fiche");
            if (f == null) f = new JSONObject();
            StringBuilder t = new StringBuilder();
            if (!f.optString("nom").isEmpty()) t.append(f.optString("nom"));
            if (!f.optString("sang").isEmpty()) t.append(t.length() > 0 ? " · " : "").append("Groupe ").append(f.optString("sang"));
            if (!f.optString("allergies").isEmpty()) t.append(t.length() > 0 ? " · " : "").append("Allergies : ").append(f.optString("allergies"));
            if (t.length() == 0) t.append("Touche pour afficher la fiche médicale");
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_FICHE) : new Notification.Builder(c);
            b.setSmallIcon(c.getApplicationInfo().icon)
                .setContentTitle("Infos médicales · Medical info")
                .setContentText(t.toString())
                .setStyle(new Notification.BigTextStyle().bigText(t.toString() + "\nTouche pour ouvrir la fiche, même téléphone verrouillé."))
                .setOngoing(true).setShowWhen(false).setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_STATUS)
                .setContentIntent(ficheIntent(c, 1));
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
            nm.notify(NOTIF_FICHE, b.build());
            return true;
        } catch (Exception e) { return false; }
    }

    static PendingIntent ficheIntent(Context c, int req) {
        Intent i = new Intent(c, Fiche.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 5900 + req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @JavascriptInterface
    public boolean openFiche() {
        if (!declared(a, "activity", Fiche.class.getName())) return false;
        ui.post(new Runnable() { public void run() { try { a.startActivity(new Intent(a, Fiche.class)); } catch (Exception e) { } } });
        return true;
    }

    private void shortcuts() {
        if (Build.VERSION.SDK_INT < 25) return;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null) return;
            Icon ic = Icon.createWithResource(a, a.getApplicationInfo().icon);
            Intent fi = new Intent(a, Fiche.class).setAction(Intent.ACTION_VIEW);
            Intent si = a.getPackageManager().getLaunchIntentForPackage(a.getPackageName());
            if (si == null) return;
            si.setAction(Intent.ACTION_VIEW).putExtra("socle", "{\"sos\":1}").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            List<ShortcutInfo> l = new ArrayList<ShortcutInfo>();
            l.add(new ShortcutInfo.Builder(a, "sos").setShortLabel("SOS").setLongLabel("Écran SOS").setIcon(ic).setIntent(si).setRank(0).build());
            l.add(new ShortcutInfo.Builder(a, "fiche").setShortLabel("Infos médicales").setLongLabel("Fiche médicale").setIcon(ic).setIntent(fi).setRank(1).build());
            sm.setDynamicShortcuts(l);
        } catch (Exception e) { }
    }

    // Raccourci « Infos médicales » épinglé sur l'écran d'accueil
    @JavascriptInterface
    public boolean pinShortcut() {
        if (Build.VERSION.SDK_INT < 26 || !declared(a, "activity", Fiche.class.getName())) return false;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null || !sm.isRequestPinShortcutSupported()) return false;
            ShortcutInfo si = new ShortcutInfo.Builder(a, "fiche_pin").setShortLabel("Infos médicales")
                .setIcon(Icon.createWithResource(a, a.getApplicationInfo().icon))
                .setIntent(new Intent(a, Fiche.class).setAction(Intent.ACTION_VIEW)).build();
            return sm.requestPinShortcut(si, null);
        } catch (Exception e) { return false; }
    }

    // ================= Partage de position et détection de chute (service) =================
    // Retour : ok | loc (autorisation position manquante, demandée) | sms (envoi direct impossible) | service (non déclaré) | error:…
    @JavascriptInterface
    public String trackStart(String numbersJson, int everyMin, int durationMin) {
        if (!declared(a, "service", Veille.class.getName())) return "service";
        if (!has(a, Manifest.permission.ACCESS_FINE_LOCATION) && !has(a, Manifest.permission.ACCESS_COARSE_LOCATION)) { ask("loc"); return "loc"; }
        if (smsBlocker(a) != null) return "sms";
        if (numbers(numbersJson).isEmpty()) return "error:Aucun contact";
        if (Build.VERSION.SDK_INT >= 33 && !has(a, "android.permission.POST_NOTIFICATIONS")) ask("notif");
        Intent i = new Intent(a, Veille.class).setAction(Veille.A_TRACK)
            .putExtra("nums", numbersJson).putExtra("every", Math.max(2, Math.min(everyMin, 120))).putExtra("dur", Math.max(5, Math.min(durationMin, 24 * 60)));
        return startVeille(i);
    }

    @JavascriptInterface
    public void trackStop() { if (Veille.trackOn) startVeille(new Intent(a, Veille.class).setAction(Veille.A_TRACK_STOP)); }

    @JavascriptInterface
    public String trackState() { live = new WeakReference<UrgenceBridge>(this); return Veille.trackJson().toString(); }

    @JavascriptInterface
    public String fallWatch(boolean on) {
        if (!on) { if (Veille.fallOn) startVeille(new Intent(a, Veille.class).setAction(Veille.A_FALL_OFF)); prefs(a).edit().putBoolean("fall", false).apply(); return "ok"; }
        if (!declared(a, "service", Veille.class.getName())) return "service";
        if (!has(a, Manifest.permission.ACCESS_FINE_LOCATION) && !has(a, Manifest.permission.ACCESS_COARSE_LOCATION)) { ask("loc"); return "loc"; }
        SensorManager sm = (SensorManager) a.getSystemService(Context.SENSOR_SERVICE);
        if (sm == null || sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) == null) return "error:Pas d'accéléromètre sur ce téléphone";
        if (Build.VERSION.SDK_INT >= 33 && !has(a, "android.permission.POST_NOTIFICATIONS")) ask("notif");
        String r = startVeille(new Intent(a, Veille.class).setAction(Veille.A_FALL_ON));
        if ("ok".equals(r)) prefs(a).edit().putBoolean("fall", true).apply();
        return r;
    }

    @JavascriptInterface
    public String fallState() { live = new WeakReference<UrgenceBridge>(this); return Veille.fallJson().toString(); }

    @JavascriptInterface
    public void fallCancel() { if (Veille.fallOn) startVeille(new Intent(a, Veille.class).setAction(Veille.A_CANCEL)); }

    // Essai : simule une chute (alarme et compte à rebours, sans envoi : l'essai s'arrête avant)
    @JavascriptInterface
    public void fallTest() { if (Veille.fallOn) startVeille(new Intent(a, Veille.class).setAction(Veille.A_TEST)); }

    private String startVeille(Intent i) {
        try {
            if (Build.VERSION.SDK_INT >= 26) a.startForegroundService(i); else a.startService(i);
            return "ok";
        } catch (Exception e) { return "error:" + s(e.getMessage()); }
    }

    static void notifyPage(final String type, final JSONObject o) {
        UrgenceBridge b = live.get();
        if (b != null) b.emit(type, o);
    }

    // ================= Outils =================
    private void emit(String type, JSONObject o) {
        final String js = "window.urgenceEvent&&urgenceEvent(" + JSONObject.quote(type) + "," + (o == null ? "{}" : o.toString()) + ")";
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static JSONObject data(Context c) { try { return new JSONObject(prefs(c).getString("data", "{}")); } catch (Exception e) { return new JSONObject(); } }

    static boolean has(Context c, String p) { return Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    static boolean requested(Context c, String p) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), PackageManager.GET_PERMISSIONS);
            if (pi.requestedPermissions != null) for (String x : pi.requestedPermissions) if (p.equals(x)) return true;
        } catch (Exception e) { }
        return false;
    }

    static boolean declared(Context c, String kind, String cls) {
        try {
            ComponentName cn = new ComponentName(c, cls);
            if ("service".equals(kind)) c.getPackageManager().getServiceInfo(cn, 0); else c.getPackageManager().getActivityInfo(cn, 0);
            return true;
        } catch (Exception e) { return false; }
    }

    static boolean canFullScreen(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        try { NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); return (Boolean) nm.getClass().getMethod("canUseFullScreenIntent").invoke(nm); } catch (Throwable e) { return false; }
    }

    static String s(String x) { return x == null ? "" : x; }
    static String clean(String n) { return n == null ? "" : n.replaceAll("[^0-9+*#]", ""); }

    static List<String> numbers(String json) {
        List<String> l = new ArrayList<String>();
        try { JSONArray a = new JSONArray(json); for (int i = 0; i < a.length(); i++) { String n = clean(a.optString(i)); if (!n.isEmpty() && !l.contains(n)) l.add(n); } } catch (Exception e) { }
        return l;
    }

    // Numéros des contacts cochés (pour le service)
    static List<String> savedNumbers(Context c) {
        List<String> l = new ArrayList<String>();
        JSONArray a = data(c).optJSONArray("contacts");
        if (a != null) for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null || !o.optBoolean("on", true)) continue;
            String n = clean(o.optString("num")); if (!n.isEmpty() && !l.contains(n)) l.add(n);
        }
        return l;
    }

    // Même format que la page : « J'ai besoin d'aide. Ma position : https://… (précision ± X m), batterie N % »
    static String compose(Context c, String head, Location l) {
        StringBuilder b = new StringBuilder(head);
        if (l != null) {
            String la = String.format(Locale.US, "%.5f", l.getLatitude()), lo = String.format(Locale.US, "%.5f", l.getLongitude());
            b.append(" Ma position : https://www.openstreetmap.org/?mlat=").append(la).append("&mlon=").append(lo).append("#map=17/").append(la).append('/').append(lo);
            if (l.hasAccuracy()) b.append(" (précision ± ").append(Math.round(l.getAccuracy())).append(" m)");
            long age = ageMs(l) / 60000;
            if (age >= 2) b.append(", relevée il y a ").append(age < 120 ? age + " min" : (age / 60) + " h");
        } else b.append(" Ma position : inconnue (pas de signal GPS)");
        int bat = battery(c);
        if (bat >= 0) b.append(", batterie ").append(bat).append(" %");
        b.append('.');
        String extra = data(c).optJSONObject("set") != null ? data(c).optJSONObject("set").optString("extra", "").trim() : "";
        if (!extra.isEmpty()) b.append(' ').append(extra);
        return b.toString();
    }

    // ================= Sirène (flux alarme, volume au maximum) =================
    static final class Siren {
        private static AudioTrack t;
        private static int prevVol = -1;
        static synchronized boolean on() { return t != null; }
        static synchronized void start(Context c) {
            if (t != null) return;
            try {
                AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
                try { prevVol = am.getStreamVolume(AudioManager.STREAM_ALARM); am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0); } catch (Exception e) { prevVol = -1; }
                int rate = 22050, frames = rate * 2;          // 2 s : montée puis descente (sirène « hululante »)
                short[] pcm = new short[frames];
                double ph = 0;
                for (int k = 0; k < frames; k++) {
                    double x = (double) k / frames;
                    double f = 650 + 900 * (x < 0.5 ? x * 2 : (1 - x) * 2);
                    ph += 2 * Math.PI * f / rate;
                    double v = Math.tanh(2.2 * Math.sin(ph)) / Math.tanh(2.2);   // sinus saturé : plus fort sur un petit haut-parleur
                    pcm[k] = (short) (v * 32000);
                }
                AudioTrack at = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setBufferSizeInBytes(frames * 2).setTransferMode(AudioTrack.MODE_STATIC).build();
                at.write(pcm, 0, frames);
                at.setLoopPoints(0, frames, -1);
                at.setVolume(1f);
                at.play();
                t = at;
            } catch (Exception e) { t = null; }
        }
        static synchronized void stop(Context c) {
            if (t != null) { try { t.stop(); } catch (Exception e) { } try { t.release(); } catch (Exception e) { } t = null; }
            if (prevVol >= 0) { try { ((AudioManager) c.getSystemService(Context.AUDIO_SERVICE)).setStreamVolume(AudioManager.STREAM_ALARM, prevVol, 0); } catch (Exception e) { } prevVol = -1; }
        }
    }

    // =====================================================================================
    // Activité native « Infos médicales » : s'affiche par-dessus l'écran verrouillé (showWhenLocked)
    // =====================================================================================
    public static class Fiche extends Activity {
        private final Handler h = new Handler(Looper.getMainLooper());
        private TextView alarmTxt;
        private View alarmBox;
        private float d;

        private int dp(float v) { return Math.round(v * d); }

        @Override
        protected void onCreate(Bundle b) {
            super.onCreate(b);
            d = getResources().getDisplayMetrics().density;
            if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
            else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            Window w = getWindow();
            w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            w.setStatusBarColor(0xFF9E1C1C);
            w.setNavigationBarColor(0xFF0F1116);
            WindowManager.LayoutParams lp = w.getAttributes(); lp.screenBrightness = 1f; w.setAttributes(lp);
            build();
        }

        @Override
        protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); build(); }

        @Override protected void onResume() { super.onResume(); tick.run(); }
        @Override protected void onPause() { super.onPause(); h.removeCallbacks(tick); }

        private final Runnable tick = new Runnable() { public void run() {
            h.removeCallbacks(this);
            if (alarmBox == null) return;
            String ph = Veille.phase;
            boolean al = "alarm".equals(ph) || "test".equals(ph);
            boolean sent = "sent".equals(ph);
            alarmBox.setVisibility(al || sent ? View.VISIBLE : View.GONE);
            if (al) {
                long left = Math.max(0, (Veille.alarmEnd - System.currentTimeMillis() + 999) / 1000);
                alarmTxt.setText(("test".equals(ph) ? "ESSAI · " : "") + "Chute détectée.\nAlerte envoyée aux contacts dans " + left + " s.");
            } else if (sent) alarmTxt.setText(Veille.fallMsg);
            h.postDelayed(this, 500);
        } };

        private TextView tv(String t, float sp, int color, boolean bold) {
            TextView v = new TextView(this);
            v.setText(t); v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); v.setTextColor(color);
            if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
            v.setLineSpacing(0, 1.12f);
            return v;
        }

        private GradientDrawable round(int color, float r, int stroke) {
            GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(r));
            if (stroke != 0) g.setStroke(dp(1), stroke);
            return g;
        }

        private Button btn(String t, int bg, int fg) {
            Button v = new Button(this);
            v.setText(t); v.setAllCaps(false); v.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19); v.setTypeface(Typeface.DEFAULT_BOLD);
            v.setTextColor(fg); v.setBackground(round(bg, 16, 0)); v.setMinHeight(dp(64)); v.setPadding(dp(14), dp(10), dp(14), dp(10));
            if (Build.VERSION.SDK_INT >= 21) v.setStateListAnimator(null);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(10); v.setLayoutParams(lp);
            return v;
        }

        private void field(LinearLayout p, String label, String value, boolean big) {
            if (value == null || value.trim().isEmpty()) return;
            LinearLayout c = new LinearLayout(this);
            c.setOrientation(LinearLayout.VERTICAL);
            c.setBackground(round(0xFF181B23, 16, 0x24FFFFFF));
            c.setPadding(dp(16), dp(12), dp(16), dp(14));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(10); c.setLayoutParams(lp);
            TextView l = tv(label.toUpperCase(Locale.FRANCE), 12.5f, 0xFF9AA0B4, true); l.setLetterSpacing(0.06f);
            c.addView(l);
            TextView v = tv(value.trim(), big ? 30 : 21, 0xFFFFFFFF, true);
            v.setPadding(0, dp(4), 0, 0);
            c.addView(v);
            p.addView(c);
        }

        private void build() {
            JSONObject all = data(this);
            JSONObject f = all.optJSONObject("fiche"); if (f == null) f = new JSONObject();
            ScrollView sv = new ScrollView(this);
            sv.setBackgroundColor(0xFF0F1116); sv.setFillViewport(true);
            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            sv.addView(root);

            LinearLayout head = new LinearLayout(this);
            head.setOrientation(LinearLayout.VERTICAL);
            head.setBackgroundColor(0xFF9E1C1C);
            head.setPadding(dp(18), dp(18), dp(18), dp(18));
            head.addView(tv("INFORMATIONS MÉDICALES", 22, 0xFFFFFFFF, true));
            head.addView(tv("Medical information · Información médica", 14, 0xFFFFD9D9, false));
            root.addView(head);

            LinearLayout body = new LinearLayout(this);
            body.setOrientation(LinearLayout.VERTICAL);
            body.setPadding(dp(14), dp(4), dp(14), dp(24));
            root.addView(body);

            // Alarme de chute en cours
            LinearLayout ab = new LinearLayout(this);
            ab.setOrientation(LinearLayout.VERTICAL);
            ab.setBackground(round(0xFFFF4D4D, 18, 0));
            ab.setPadding(dp(16), dp(14), dp(16), dp(14));
            LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            alp.topMargin = dp(12); ab.setLayoutParams(alp);
            alarmTxt = tv("", 21, 0xFFFFFFFF, true);
            ab.addView(alarmTxt);
            Button ok = btn("Je vais bien, annuler", 0xFFFFFFFF, 0xFF9E1C1C);
            ok.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
                try { Intent i = new Intent(Fiche.this, Veille.class).setAction(Veille.A_CANCEL); if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i); } catch (Exception e) { }
                Siren.stop(getApplicationContext());
            } });
            ab.addView(ok);
            ab.setVisibility(View.GONE);
            alarmBox = ab;
            body.addView(ab);

            String nom = f.optString("nom").trim();
            String nais = f.optString("naissance").trim();
            boolean empty = true;
            if (!nom.isEmpty()) { TextView n = tv(nom, 30, 0xFFFFFFFF, true); n.setPadding(dp(2), dp(16), 0, 0); body.addView(n); empty = false; }
            if (!nais.isEmpty()) { TextView n = tv("Né(e) le " + dateFr(nais) + age(nais), 18, 0xFFB4B8C7, false); n.setPadding(dp(2), dp(2), 0, dp(4)); body.addView(n); empty = false; }
            String[][] F = {
                { "sang", "Groupe sanguin · Blood type", "1" },
                { "allergies", "Allergies", "" },
                { "traitements", "Traitements · Medication", "" },
                { "maladies", "Maladies · Medical conditions", "" },
                { "notes", "Notes", "" },
            };
            for (String[] x : F) { String v = f.optString(x[0]); if (!v.trim().isEmpty()) empty = false; field(body, x[1], v, "1".equals(x[2])); }
            final String pTel = clean(f.optString("prevenirTel")), mTel = clean(f.optString("medecinTel"));
            String pv = (f.optString("prevenirNom").trim() + (pTel.isEmpty() ? "" : "\n" + f.optString("prevenirTel").trim())).trim();
            String md = (f.optString("medecinNom").trim() + (mTel.isEmpty() ? "" : "\n" + f.optString("medecinTel").trim())).trim();
            if (!pv.isEmpty()) empty = false;
            field(body, "Personne à prévenir · Emergency contact", pv, false);
            field(body, "Médecin traitant · Doctor", md, false);
            if (empty) { TextView e = tv("Aucune information saisie. Remplis ta fiche dans l'appli Urgence.", 18, 0xFFB4B8C7, false); e.setPadding(dp(2), dp(20), 0, dp(10)); body.addView(e); }

            Button b112 = btn("Appeler le 112", 0xFFE53935, 0xFFFFFFFF);
            b112.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { dialEmergency("112"); } });
            body.addView(b112);
            if (!pTel.isEmpty()) {
                String who = f.optString("prevenirNom").trim();
                Button bp = btn("Appeler " + (who.isEmpty() ? "la personne à prévenir" : who), 0xFF222632, 0xFFFFFFFF);
                bp.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { callNum(pTel); } });
                body.addView(bp);
            }
            Button close = btn("Fermer", 0xFF181B23, 0xFFB4B8C7);
            close.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });
            body.addView(close);
            TextView foot = tv("Fiche affichée par l'appli Urgence, sans déverrouiller le téléphone.", 13, 0xFF7D8294, false);
            foot.setGravity(Gravity.CENTER); foot.setPadding(dp(8), dp(14), dp(8), 0);
            body.addView(foot);
            setContentView(sv);
            tick.run();
        }

        private void dialEmergency(String n) {
            Uri u = Uri.parse("tel:" + n);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                // Composeur d'urgence : utilisable sans déverrouiller
                try { startActivity(new Intent("com.android.phone.EmergencyDialer.DIAL", u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception e) { }
            }
            try { startActivity(new Intent(Intent.ACTION_DIAL, u)); } catch (Exception e) { }
        }

        private void callNum(String n) {
            Uri u = Uri.parse("tel:" + Uri.encode(n));
            boolean can = has(this, Manifest.permission.CALL_PHONE);
            try { startActivity(new Intent(can ? Intent.ACTION_CALL : Intent.ACTION_DIAL, u)); } catch (Exception e) { try { startActivity(new Intent(Intent.ACTION_DIAL, u)); } catch (Exception x) { } }
        }

        private static String dateFr(String iso) {
            String[] p = iso.split("-");
            if (p.length == 3) return p[2] + "/" + p[1] + "/" + p[0];
            return iso;
        }
        private static String age(String iso) {
            try {
                String[] p = iso.split("-");
                java.util.Calendar c = java.util.Calendar.getInstance();
                int y = c.get(java.util.Calendar.YEAR) - Integer.parseInt(p[0]);
                int m = c.get(java.util.Calendar.MONTH) + 1, dd = c.get(java.util.Calendar.DAY_OF_MONTH);
                if (m < Integer.parseInt(p[1]) || (m == Integer.parseInt(p[1]) && dd < Integer.parseInt(p[2]))) y--;
                return y >= 0 && y < 130 ? " (" + y + " ans)" : "";
            } catch (Exception e) { return ""; }
        }
    }

    // =====================================================================================
    // Service au premier plan : partage de position par SMS et détection de chute
    // =====================================================================================
    public static class Veille extends Service implements SensorEventListener, LocationListener {
        static final String A_TRACK = "urgence.track", A_TRACK_STOP = "urgence.trackStop", A_FALL_ON = "urgence.fallOn", A_FALL_OFF = "urgence.fallOff",
            A_CANCEL = "urgence.cancel", A_SEND = "urgence.send", A_TEST = "urgence.test", A_SIREN = "urgence.siren";
        static final long STILL_MS = 30000, COUNTDOWN_MS = 30000, SIREN_MS = 180000;

        // Partage de position
        static volatile boolean trackOn = false;
        static volatile long trackUntil = 0, trackNext = 0, trackLast = 0;
        static volatile int trackEvery = 10, trackSent = 0;
        static volatile String trackErr = "";
        private List<String> trackNums = new ArrayList<String>();
        // Chute : off | watch | still (choc, on attend 30 s d'immobilité) | alarm | test | sent
        static volatile boolean fallOn = false;
        static volatile String phase = "off";
        static volatile long alarmEnd = 0, phaseAt = 0;
        static volatile String fallMsg = "";

        private final Handler h = new Handler(Looper.getMainLooper());
        private LocationManager lm;
        private Location best;
        private SensorManager sm;
        private PowerManager.WakeLock wl;
        private String locMode = "";
        // Détecteur
        private long ffStart = 0, armedAt = 0, stillFrom = 0, winStart = 0;
        private int moves = 0;

        static JSONObject trackJson() {
            JSONObject o = new JSONObject();
            try { o.put("on", trackOn); o.put("until", trackUntil); o.put("next", trackNext); o.put("last", trackLast); o.put("every", trackEvery); o.put("sent", trackSent); o.put("err", trackErr); } catch (Exception e) { }
            return o;
        }
        static JSONObject fallJson() {
            JSONObject o = new JSONObject();
            try { o.put("on", fallOn); o.put("phase", phase); o.put("end", alarmEnd); o.put("msg", fallMsg); } catch (Exception e) { }
            return o;
        }

        @Override public IBinder onBind(Intent i) { return null; }

        @Override
        public void onCreate() {
            super.onCreate();
            lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            sm = (SensorManager) getSystemService(SENSOR_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                NotificationChannel a = new NotificationChannel(CH_VEILLE, "Partage de position et veille de chute", NotificationManager.IMPORTANCE_LOW);
                a.setShowBadge(false); a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(a);
                NotificationChannel b = new NotificationChannel(CH_ALARME, "Alarme de chute", NotificationManager.IMPORTANCE_HIGH);
                b.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC); b.setSound(null, null); b.enableVibration(false);
                nm.createNotificationChannel(b);
            }
        }

        @Override
        public int onStartCommand(Intent intent, int flags, int startId) {
            String act = intent == null ? null : intent.getAction();
            // Toujours passer au premier plan d'abord (obligatoire après startForegroundService)
            if (!foreground()) { stopSelf(); return START_NOT_STICKY; }
            if (act == null) restore();
            else if (A_TRACK.equals(act)) startTrack(intent);
            else if (A_TRACK_STOP.equals(act)) stopTrack("");
            else if (A_FALL_ON.equals(act)) startFall();
            else if (A_FALL_OFF.equals(act)) stopFall();
            else if (A_CANCEL.equals(act)) cancelAlarm();
            else if (A_SEND.equals(act)) { if ("alarm".equals(phase)) sendFall(); }
            else if (A_TEST.equals(act)) { if (fallOn) alarm(true); }
            else if (A_SIREN.equals(act)) { Siren.stop(getApplicationContext()); }
            if (!trackOn && !fallOn) { finish(); return START_NOT_STICKY; }
            updateLoc(); foreground();
            return START_STICKY;
        }

        private void restore() {
            SharedPreferences p = prefs(this);
            if (p.getBoolean("fall", false) && !fallOn) startFall();
            long until = p.getLong("trackUntil", 0);
            if (!trackOn && until > System.currentTimeMillis()) {
                trackUntil = until; trackEvery = p.getInt("trackEvery", 10);
                trackNums = numbers(p.getString("trackNums", "[]"));
                if (!trackNums.isEmpty()) { trackOn = true; trackNext = System.currentTimeMillis() + 60000; h.postDelayed(trackTick, 60000); }
            }
        }

        private boolean foreground() {
            StringBuilder t = new StringBuilder();
            if (trackOn) t.append("Position envoyée toutes les ").append(trackEvery).append(" min jusqu'à ").append(hm(trackUntil)).append(" (").append(trackSent).append(" envoi").append(trackSent > 1 ? "s" : "").append(")");
            if (fallOn) t.append(t.length() > 0 ? "\n" : "").append("Détection de chute active");
            if (t.length() == 0) t.append("Urgence");
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_VEILLE) : new Notification.Builder(this);
            b.setSmallIcon(getApplicationInfo().icon).setContentTitle(trackOn ? "Partage de position en cours" : "Veille de chute")
                .setContentText(t.toString()).setStyle(new Notification.BigTextStyle().bigText(t.toString()))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false).setVisibility(Notification.VISIBILITY_PUBLIC);
            if (open != null) b.setContentIntent(PendingIntent.getActivity(this, 5930, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            if (trackOn) b.addAction(new Notification.Action.Builder(null, "Arrêter le partage", svc(A_TRACK_STOP, 5931)).build());
            if (fallOn) b.addAction(new Notification.Action.Builder(null, "Arrêter la veille", svc(A_FALL_OFF, 5932)).build());
            try {
                if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_VEILLE, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                else startForeground(NOTIF_VEILLE, b.build());
                return true;
            } catch (Exception e) {
                trackErr = "Service refusé par Android : " + s(e.getMessage());
                trackOn = false; fallOn = false; phase = "off";
                notifyPage("track", trackJson()); notifyPage("fall", fallJson());
                return false;
            }
        }

        private PendingIntent svc(String action, int req) {
            Intent i = new Intent(this, Veille.class).setAction(action);
            if (Build.VERSION.SDK_INT >= 26) return PendingIntent.getForegroundService(this, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            return PendingIntent.getService(this, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }

        private static String hm(long t) { return new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date(t)); }

        // ---------- Position ----------
        private void updateLoc() {
            String want = ("alarm".equals(phase) || "test".equals(phase) || "still".equals(phase) || trackOn) ? "fast" : fallOn ? "slow" : "";
            if (want.equals(locMode)) return;
            try { lm.removeUpdates(this); } catch (Exception e) { }
            locMode = want;
            if (want.isEmpty()) return;
            if (best == null) best = lastKnown(lm);
            long gpsMs = "fast".equals(want) ? 10000 : 180000;
            try { if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, gpsMs, 0, this, Looper.getMainLooper()); } catch (Exception e) { }
            try { if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60000, 0, this, Looper.getMainLooper()); } catch (Exception e) { }
        }
        @Override public void onLocationChanged(Location l) { if (better(l, best)) best = l; }
        @Override public void onStatusChanged(String p, int st, Bundle e) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }

        private Location bestNow() { Location l = lastKnown(lm); return better(best, l) ? best : l; }

        // ---------- Partage de position ----------
        private void startTrack(Intent i) {
            trackNums = numbers(i.getStringExtra("nums"));
            trackEvery = i.getIntExtra("every", 10);
            trackUntil = System.currentTimeMillis() + i.getIntExtra("dur", 60) * 60000L;
            trackSent = 0; trackErr = ""; trackLast = 0; trackOn = !trackNums.isEmpty();
            prefs(this).edit().putLong("trackUntil", trackUntil).putInt("trackEvery", trackEvery).putString("trackNums", new JSONArray(trackNums).toString()).apply();
            h.removeCallbacks(trackTick);
            updateLoc();
            // Premier envoi après 20 s au plus, le temps d'avoir une position fraîche
            trackNext = System.currentTimeMillis() + 20000;
            h.postDelayed(trackTick, 20000);
            notifyPage("track", trackJson());
        }

        private final Runnable trackTick = new Runnable() { public void run() {
            if (!trackOn) return;
            long now = System.currentTimeMillis();
            if (now >= trackUntil) { stopTrack("Fin du partage"); return; }
            Location l = bestNow();
            String head = trackSent == 0
                ? "Je partage ma position toutes les " + trackEvery + " min jusqu'à " + hm(trackUntil) + "."
                : "Partage de position (" + hm(now) + ").";
            if (sendDirect(Veille.this, trackNums, compose(Veille.this, head, l)) == 0) { stopTrack("Envoi SMS impossible : partage arrêté"); return; }
            trackSent++; trackLast = now;
            trackNext = now + trackEvery * 60000L;
            h.postDelayed(this, trackEvery * 60000L);
            foreground();
            notifyPage("track", trackJson());
        } };

        private void stopTrack(String why) {
            trackOn = false; trackErr = why; h.removeCallbacks(trackTick);
            prefs(this).edit().remove("trackUntil").apply();
            notifyPage("track", trackJson());
            if (!fallOn) finish(); else { locMode = "?"; updateLoc(); foreground(); }
        }

        // ---------- Détection de chute ----------
        // Chute libre (|a| < 0,45 g pendant 100 ms au moins), puis choc (> 2,5 g dans la seconde qui suit),
        // puis immobilité 30 s (aucun mouvement net après 2 s de stabilisation) → alarme + compte à rebours 30 s → SOS.
        private void startFall() {
            if (fallOn) return;
            Sensor acc = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (acc == null) return;
            fallOn = true; setPhase("watch");
            sm.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME);
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "urgence:chute");
                wl.setReferenceCounted(false);
                wl.acquire(14 * 3600 * 1000L);
            } catch (Exception e) { }
            prefs(this).edit().putBoolean("fall", true).apply();
        }

        private void stopFall() {
            fallOn = false; h.removeCallbacks(countdown); Siren.stop(getApplicationContext());
            try { sm.unregisterListener(this); } catch (Exception e) { }
            try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { }
            cancelNotif(NOTIF_ALARME);
            prefs(this).edit().putBoolean("fall", false).apply();
            setPhase("off");
        }

        private void setPhase(String p) {
            phase = p; phaseAt = System.currentTimeMillis();
            if (!"alarm".equals(p) && !"test".equals(p)) { ffStart = 0; armedAt = 0; }
            updateLoc();
            notifyPage("fall", fallJson());
        }

        @Override public void onAccuracyChanged(Sensor s, int a) { }

        @Override
        public void onSensorChanged(SensorEvent e) {
            if (!fallOn) return;
            float x = e.values[0], y = e.values[1], z = e.values[2];
            double g = Math.sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH;
            long t = SystemClock.elapsedRealtime();
            String p = phase;
            if ("watch".equals(p)) {
                if (g < 0.45) { if (ffStart == 0) ffStart = t; }
                else { if (ffStart != 0 && t - ffStart >= 100) armedAt = t; ffStart = 0; }
                if (armedAt != 0) {
                    if (g > 2.5) { stillFrom = t + 2000; winStart = t; moves = 0; setPhase("still"); }
                    else if (t - armedAt > 1000) armedAt = 0;
                }
            } else if ("still".equals(p)) {
                if (t < stillFrom) return;
                if (t - winStart > 1000) { winStart = t; moves = 0; }
                if (Math.abs(g - 1) > 0.3 && ++moves >= 4) { setPhase("watch"); return; }   // la personne bouge : pas d'alarme
                if (t - stillFrom >= STILL_MS) alarm(false);
            }
        }

        private void alarm(boolean test) {
            setPhase(test ? "test" : "alarm");
            alarmEnd = System.currentTimeMillis() + (test ? 10000 : COUNTDOWN_MS);
            Siren.start(getApplicationContext());
            buzz(this, new long[]{ 0, 600, 300, 600, 300, 600, 300, 600 });
            alarmNotif(test ? "Essai : alarme de chute" : "Chute détectée", "Alerte envoyée aux contacts dans " + (test ? 10 : COUNTDOWN_MS / 1000) + " s. Touche « Je vais bien » pour annuler.", true);
            h.removeCallbacks(countdown);
            h.postDelayed(countdown, 1000);
        }

        private final Runnable countdown = new Runnable() { public void run() {
            String p = phase;
            if (!"alarm".equals(p) && !"test".equals(p)) return;
            long left = alarmEnd - System.currentTimeMillis();
            if (left <= 0) {
                if ("test".equals(p)) { Siren.stop(getApplicationContext()); cancelNotif(NOTIF_ALARME); fallMsg = ""; setPhase("watch"); return; }
                sendFall(); return;
            }
            if (((left / 1000) % 5) == 0) buzz(Veille.this, new long[]{ 0, 400 });
            h.postDelayed(this, 1000);
        } };

        private void sendFall() {
            h.removeCallbacks(countdown);
            List<String> nums = savedNumbers(this);
            String msg = compose(this, "Alerte automatique : chute détectée et aucune réaction depuis plus d'une minute. J'ai besoin d'aide.", bestNow());
            int n = sendDirect(this, nums, msg);
            if (n > 0) {
                fallMsg = "Alerte envoyée à " + n + " contact" + (n > 1 ? "s" : "") + ".";
                alarmNotif("Alerte de chute envoyée", fallMsg + " La sirène continue 3 min pour aider les secours à te trouver.", false);
            } else {
                fallMsg = nums.isEmpty() ? "Aucun contact d'urgence : appelle le 112." : "Envoi automatique impossible : touche la notification pour envoyer l'alerte.";
                alarmNotifSms(nums, msg);
            }
            setPhase("sent");
            h.postDelayed(new Runnable() { public void run() { Siren.stop(getApplicationContext()); if ("sent".equals(phase)) setPhase(fallOn ? "watch" : "off"); } }, SIREN_MS);
        }

        private void cancelAlarm() {
            h.removeCallbacks(countdown);
            Siren.stop(getApplicationContext());
            cancelNotif(NOTIF_ALARME);
            fallMsg = "";
            setPhase(fallOn ? "watch" : "off");
        }

        private void alarmNotif(String title, String text, boolean full) {
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_ALARME) : new Notification.Builder(this);
            PendingIntent fi = ficheIntent(this, 2);
            b.setSmallIcon(getApplicationInfo().icon).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(fi)
                .addAction(new Notification.Action.Builder(null, full ? "Je vais bien" : "Arrêter la sirène", svc(full ? A_CANCEL : A_SIREN, 5933)).build());
            if (full) {
                b.addAction(new Notification.Action.Builder(null, "Envoyer maintenant", svc(A_SEND, 5934)).build());
                b.setFullScreenIntent(fi, true);
            }
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX);
            try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ALARME, b.build()); } catch (Exception e) { }
        }

        private void alarmNotifSms(List<String> nums, String msg) {
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_ALARME) : new Notification.Builder(this);
            PendingIntent pi = nums.isEmpty()
                ? PendingIntent.getActivity(this, 5935, new Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
                : PendingIntent.getActivity(this, 5935, smsAppIntent(nums, msg), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            b.setSmallIcon(getApplicationInfo().icon).setContentTitle("Chute détectée : envoie l'alerte").setContentText(fallMsg)
                .setStyle(new Notification.BigTextStyle().bigText(fallMsg))
                .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true).setContentIntent(pi).setAutoCancel(true)
                .addAction(new Notification.Action.Builder(null, "Arrêter la sirène", svc(A_SIREN, 5933)).build());
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX);
            try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ALARME, b.build()); } catch (Exception e) { }
        }

        private void cancelNotif(int id) { try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(id); } catch (Exception e) { } }

        private void finish() {
            try { lm.removeUpdates(this); } catch (Exception e) { }
            locMode = "";
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
            stopSelf();
        }

        @Override
        public void onDestroy() {
            h.removeCallbacksAndMessages(null);
            try { lm.removeUpdates(this); } catch (Exception e) { }
            try { sm.unregisterListener(this); } catch (Exception e) { }
            try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { }
            Siren.stop(getApplicationContext());
            trackOn = false; fallOn = false; phase = "off";
            notifyPage("track", trackJson()); notifyPage("fall", fallJson());
            super.onDestroy();
        }
    }
}
