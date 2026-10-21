package __PKG__;

// QR : pont natif exposé sous window.MAGQr
//  - « Partager vers QR » (SEND text/plain) : onIntent() met le texte en file, pending() le rend à la page,
//    événement qrEvent("shared", {count}) quand l'appli est déjà ouverte
//  - Wi-Fi : wifiConnect(ssid, motDePasse, type, caché) → fenêtre système « Enregistrer ce réseau » (Android 11+),
//    suggestion de réseau (Android 10), ajout direct (Android 9 et avant), sinon réglages Wi-Fi avec le mot de passe copié.
//    Résultat : qrEvent("wifi", {ok, how, msg})
//  - Contacts, agenda, e-mail, SMS, téléphone, liens, cartes : intents standard (aucune autorisation de lecture)
//  - Images : shareImage(base64, nom, texte) et saveImage(base64, nom) → Images/QR, résultat qrEvent("saved", {...})
//  - vibrate(ms), beep(), copy(texte, sensible), shareText(texte)
// Le constructeur ne fait rien : la classe est chargée dans toutes les applis de la suite.

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSuggestion;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.os.PersistableBundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

public class QrBridge {
    private static final int REQ_WIFI = 6001, REQ_CONTACT = 6002, REQ_EVENT = 6003;

    private final Activity a;
    private final WebView wv;
    private final ConcurrentLinkedQueue<String> queue = new ConcurrentLinkedQueue<String>();
    private boolean launchChecked = false;
    private String pendingWifiPass = null;

    public QrBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ================= Réception « Partager vers QR » =================
    @JavascriptInterface
    public String version() { return "1"; }

    @JavascriptInterface
    public int sdk() { return Build.VERSION.SDK_INT; }

    /** Textes reçus en attente : tableau JSON de {"text","subject"} ; la file est vidée. */
    @JavascriptInterface
    public String pending() {
        checkLaunch();
        JSONArray arr = new JSONArray();
        String s;
        while ((s = queue.poll()) != null) { try { arr.put(new JSONObject(s)); } catch (Exception e) { } }
        return arr.toString();
    }

    private synchronized void checkLaunch() {
        if (launchChecked) return;
        launchChecked = true;
        try {
            Intent i = a.getIntent();
            if (take(i)) i.setAction(Intent.ACTION_MAIN); // ne pas reprendre le texte au rechargement de la page
        } catch (Exception e) { }
    }

    private boolean take(Intent i) {
        if (i == null || !Intent.ACTION_SEND.equals(i.getAction())) return false;
        String type = i.getType();
        if (type != null && !type.startsWith("text/")) return false;
        CharSequence cs = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (cs == null || cs.length() == 0) return false;
        try {
            JSONObject o = new JSONObject();
            o.put("text", cs.toString());
            String sub = i.getStringExtra(Intent.EXTRA_SUBJECT);
            o.put("subject", sub == null ? "" : sub);
            queue.add(o.toString());
            return true;
        } catch (Exception e) { return false; }
    }

    // ================= Liens, téléphone, messages =================
    /** Ouvre une adresse (https:, geo:, tel:, mailto:, market:…). false si aucune appli ne sait l'ouvrir. */
    @JavascriptInterface
    public boolean openUrl(String url) {
        if (url == null || url.trim().isEmpty()) return false;
        Uri u = Uri.parse(url.trim());
        Intent i = new Intent(Intent.ACTION_VIEW, u);
        String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (sc.equals("http") || sc.equals("https")) i.addCategory(Intent.CATEGORY_BROWSABLE);
        if (sc.equals("tel")) i = new Intent(Intent.ACTION_DIAL, u);
        return start(i);
    }

    @JavascriptInterface
    public boolean dial(String number) { return start(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(n(number))))); }

    @JavascriptInterface
    public boolean sms(String number, String body) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(n(number))));
        if (body != null && !body.isEmpty()) i.putExtra("sms_body", body);
        return start(i);
    }

    @JavascriptInterface
    public boolean email(String to, String subject, String body) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
        if (to != null && !to.isEmpty()) i.putExtra(Intent.EXTRA_EMAIL, to.split("\\s*[,;]\\s*"));
        if (subject != null && !subject.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, subject);
        if (body != null && !body.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, body);
        if (start(i)) return true;
        return start(new Intent(Intent.ACTION_VIEW, Uri.parse("mailto:" + n(to))));
    }

    /** Recherche web du texte (codes produits) : appli de recherche, sinon navigateur. */
    @JavascriptInterface
    public boolean searchWeb(String q) {
        Intent i = new Intent(Intent.ACTION_WEB_SEARCH);
        i.putExtra(android.app.SearchManager.QUERY, n(q));
        if (start(i)) return true;
        return openUrl("https://www.google.com/search?q=" + Uri.encode(n(q)));
    }

    // ================= Contacts et agenda =================
    /** json : {name, org, title, phones:[{v,t}], emails:[…], urls:[…], adr, note} ; t = "cell" | "work" | "home". */
    @JavascriptInterface
    public boolean addContact(String json) {
        try {
            JSONObject o = new JSONObject(json);
            Intent i = new Intent(ContactsContract.Intents.Insert.ACTION);
            i.setType(ContactsContract.RawContacts.CONTENT_TYPE);
            i.putExtra("finishActivityOnSaveCompleted", true);
            put(i, ContactsContract.Intents.Insert.NAME, o.optString("name"));
            put(i, ContactsContract.Intents.Insert.COMPANY, o.optString("org"));
            put(i, ContactsContract.Intents.Insert.JOB_TITLE, o.optString("title"));
            put(i, ContactsContract.Intents.Insert.POSTAL, o.optString("adr"));
            put(i, ContactsContract.Intents.Insert.NOTES, o.optString("note"));
            ArrayList<ContentValues> rows = new ArrayList<ContentValues>();
            JSONArray ph = o.optJSONArray("phones");
            if (ph != null) for (int k = 0; k < ph.length(); k++) {
                JSONObject p = ph.optJSONObject(k); if (p == null || p.optString("v").isEmpty()) continue;
                ContentValues v = new ContentValues();
                v.put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE);
                v.put(ContactsContract.CommonDataKinds.Phone.NUMBER, p.optString("v"));
                String t = p.optString("t");
                v.put(ContactsContract.CommonDataKinds.Phone.TYPE, "work".equals(t) ? ContactsContract.CommonDataKinds.Phone.TYPE_WORK
                        : "home".equals(t) ? ContactsContract.CommonDataKinds.Phone.TYPE_HOME
                        : "fax".equals(t) ? ContactsContract.CommonDataKinds.Phone.TYPE_FAX_WORK
                        : ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE);
                rows.add(v);
            }
            JSONArray em = o.optJSONArray("emails");
            if (em != null) for (int k = 0; k < em.length(); k++) {
                String e = em.optString(k); if (e.isEmpty()) continue;
                ContentValues v = new ContentValues();
                v.put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE);
                v.put(ContactsContract.CommonDataKinds.Email.ADDRESS, e);
                v.put(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_OTHER);
                rows.add(v);
            }
            JSONArray ur = o.optJSONArray("urls");
            if (ur != null) for (int k = 0; k < ur.length(); k++) {
                String e = ur.optString(k); if (e.isEmpty()) continue;
                ContentValues v = new ContentValues();
                v.put(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Website.CONTENT_ITEM_TYPE);
                v.put(ContactsContract.CommonDataKinds.Website.URL, e);
                v.put(ContactsContract.CommonDataKinds.Website.TYPE, ContactsContract.CommonDataKinds.Website.TYPE_OTHER);
                rows.add(v);
            }
            if (!rows.isEmpty()) i.putParcelableArrayListExtra(ContactsContract.Intents.Insert.DATA, rows);
            return startForResult(i, REQ_CONTACT);
        } catch (Exception e) { return false; }
    }

    /** json : {title, start (ms), end (ms), allDay, location, description}. */
    @JavascriptInterface
    public boolean addEvent(String json) {
        try {
            JSONObject o = new JSONObject(json);
            Intent i = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
            put(i, CalendarContract.Events.TITLE, o.optString("title"));
            put(i, CalendarContract.Events.EVENT_LOCATION, o.optString("location"));
            put(i, CalendarContract.Events.DESCRIPTION, o.optString("description"));
            long st = o.optLong("start", 0), en = o.optLong("end", 0);
            if (st > 0) i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, st);
            if (en > 0) i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, en);
            if (o.optBoolean("allDay", false)) i.putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true);
            return startForResult(i, REQ_EVENT);
        } catch (Exception e) { return false; }
    }

    // ================= Wi-Fi =================
    /** type : "WPA", "WPA2", "WPA3", "SAE", "WEP", "nopass" (ou vide). Résultat : qrEvent("wifi", …). */
    @JavascriptInterface
    public void wifiConnect(final String ssid, final String pass, final String type, final boolean hidden) {
        ui(new Runnable() { public void run() { doWifi(n(ssid), n(pass), n(type).toUpperCase(), hidden); } });
    }

    /** Ouvre les réglages Wi-Fi ; copie d'abord le mot de passe s'il y en a un. */
    @JavascriptInterface
    public void wifiSettings(final String pass) {
        ui(new Runnable() { public void run() {
            if (pass != null && !pass.isEmpty()) clip(pass, true);
            openWifiSettings();
        } });
    }

    private void doWifi(String ssid, String pass, String type, boolean hidden) {
        if (ssid.isEmpty()) { emitWifi(false, "error", "Nom du réseau manquant"); return; }
        boolean open = type.isEmpty() || type.equals("NOPASS") || pass.isEmpty();
        boolean wep = type.equals("WEP");
        boolean eap = type.contains("EAP");
        WifiManager wm = (WifiManager) a.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null || eap || (wep && Build.VERSION.SDK_INT >= 29)) { fallbackWifi(pass, eap ? "Réseau d'entreprise : configure-le dans les réglages" : wep ? "Réseau WEP (ancien) : connecte-toi dans les réglages" : "Wi-Fi indisponible"); return; }
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                WifiNetworkSuggestion.Builder b = new WifiNetworkSuggestion.Builder().setSsid(ssid);
                if (!open) { if (type.equals("WPA3") || type.equals("SAE")) b.setWpa3Passphrase(pass); else b.setWpa2Passphrase(pass); }
                if (hidden) b.setIsHiddenSsid(true);
                WifiNetworkSuggestion sug = b.build();
                if (Build.VERSION.SDK_INT >= 30) {
                    // Fenêtre système : « Enregistrer ce réseau ? »
                    ArrayList<Parcelable> list = new ArrayList<Parcelable>();
                    list.add(sug);
                    Intent i = new Intent(Settings.ACTION_WIFI_ADD_NETWORKS);
                    i.putParcelableArrayListExtra(Settings.EXTRA_WIFI_NETWORK_LIST, list);
                    pendingWifiPass = pass;
                    try { a.startActivityForResult(i, REQ_WIFI); return; }
                    catch (Exception e) { pendingWifiPass = null; }
                }
                List<WifiNetworkSuggestion> l = new ArrayList<WifiNetworkSuggestion>();
                l.add(sug);
                int st = wm.addNetworkSuggestions(l);
                if (st == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS || st == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE) {
                    emitWifi(true, "suggested", wm.isWifiEnabled() ? "Réseau proposé : accepte la notification d'Android si elle apparaît" : "Réseau proposé : active le Wi-Fi pour te connecter");
                } else fallbackWifi(pass, "Android a refusé l'ajout automatique");
                return;
            }
            legacyWifi(wm, ssid, pass, open, wep, hidden);
        } catch (Throwable t) { fallbackWifi(pass, "Ajout automatique impossible"); }
    }

    @SuppressWarnings("deprecation")
    private void legacyWifi(WifiManager wm, String ssid, String pass, boolean open, boolean wep, boolean hidden) {
        try { if (!wm.isWifiEnabled()) wm.setWifiEnabled(true); } catch (Throwable t) { }
        WifiConfiguration c = new WifiConfiguration();
        c.SSID = "\"" + ssid + "\"";
        c.hiddenSSID = hidden;
        if (open) c.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
        else if (wep) {
            c.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
            c.allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.OPEN);
            c.allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.SHARED);
            c.wepKeys[0] = pass.matches("[0-9A-Fa-f]{10}|[0-9A-Fa-f]{26}") ? pass : "\"" + pass + "\"";
            c.wepTxKeyIndex = 0;
        } else c.preSharedKey = "\"" + pass + "\"";
        int id = wm.addNetwork(c);
        if (id < 0) { fallbackWifi(pass, "Ajout automatique impossible"); return; }
        wm.disconnect();
        wm.enableNetwork(id, true);
        wm.reconnect();
        emitWifi(true, "connected", "Connexion à « " + ssid + " » en cours");
    }

    private void fallbackWifi(String pass, String why) {
        if (pass != null && !pass.isEmpty()) clip(pass, true);
        openWifiSettings();
        emitWifi(false, "settings", why + (pass != null && !pass.isEmpty() ? ". Mot de passe copié : colle-le dans les réglages" : ""));
    }

    private void openWifiSettings() {
        if (Build.VERSION.SDK_INT >= 29 && start(new Intent(Settings.Panel.ACTION_WIFI))) return;
        start(new Intent(Settings.ACTION_WIFI_SETTINGS));
    }

    private void emitWifi(boolean ok, String how, String msg) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok); o.put("how", how); o.put("msg", msg);
            emit("wifi", o.toString());
        } catch (Exception e) { }
    }

    // ================= Presse-papiers, partage, images =================
    @JavascriptInterface
    public void copy(final String text, final boolean sensitive) {
        ui(new Runnable() { public void run() { clip(text, sensitive); } });
    }

    private void clip(String text, boolean sensitive) {
        try {
            ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData cd = ClipData.newPlainText("QR", text == null ? "" : text);
            if (sensitive && Build.VERSION.SDK_INT >= 24) {
                PersistableBundle b = new PersistableBundle();
                b.putBoolean("android.content.extra.IS_SENSITIVE", true);
                cd.getDescription().setExtras(b);
            }
            cm.setPrimaryClip(cd);
        } catch (Exception e) { }
    }

    @JavascriptInterface
    public void shareText(final String text) {
        ui(new Runnable() { public void run() {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, n(text));
            start(Intent.createChooser(i, "Partager"));
        } });
    }

    /** Partage une image PNG (base64 sans en-tête). false si le partage n'a pas pu être préparé. */
    @JavascriptInterface
    public boolean shareImage(String b64, String name, final String text) {
        try {
            byte[] data = Base64.decode(strip(b64), Base64.DEFAULT);
            File dir = new File(a.getCacheDir(), "qr");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 3600000L) f.delete();
            File f = new File(dir, clean(name));
            FileOutputStream fo = new FileOutputStream(f);
            try { fo.write(data); } finally { fo.close(); }
            // FileProvider d'androidx (déclaré par print-patch.sh), appelé sans dépendance de compilation
            final Uri u = (Uri) Class.forName("androidx.core.content.FileProvider")
                .getMethod("getUriForFile", Context.class, String.class, File.class)
                .invoke(null, a, a.getPackageName() + ".fileprovider", f);
            ui(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, u);
                if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
                i.setClipData(ClipData.newRawUri("QR", u));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                start(Intent.createChooser(i, "Partager le QR code"));
            } });
            return true;
        } catch (Throwable t) { return false; }
    }

    /** Enregistre une image PNG dans Images/QR. Résultat : qrEvent("saved", {ok, name, error}). */
    @JavascriptInterface
    public void saveImage(final String b64, final String name) {
        new Thread(new Runnable() { public void run() {
            JSONObject r = new JSONObject();
            String nm = clean(name);
            try {
                byte[] data = Base64.decode(strip(b64), Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, nm);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "image/png");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/QR");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri u = a.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new Exception("insert");
                    OutputStream o = a.getContentResolver().openOutputStream(u);
                    try { o.write(data); } finally { o.close(); }
                    v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    a.getContentResolver().update(u, v, null, null);
                } else {
                    @SuppressWarnings("deprecation")
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "QR");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, nm);
                    FileOutputStream fo = new FileOutputStream(f);
                    try { fo.write(data); } finally { fo.close(); }
                    a.sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(f)));
                }
                r.put("ok", true); r.put("name", nm);
            } catch (Throwable t) {
                try { r.put("ok", false); r.put("name", nm); r.put("error", String.valueOf(t.getMessage())); } catch (Exception e) { }
            }
            emit("saved", r.toString());
        } }).start();
    }

    // ================= Retour sensoriel =================
    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public void vibrate(int ms) {
        try {
            Vibrator v = (Vibrator) a.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            int d = Math.max(10, Math.min(ms, 400));
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(d);
        } catch (Throwable t) { }
    }

    @JavascriptInterface
    public void beep() {
        try {
            final ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70);
            tg.startTone(ToneGenerator.TONE_PROP_BEEP, 120);
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() { public void run() { try { tg.release(); } catch (Throwable t) { } } }, 400);
        } catch (Throwable t) { }
    }

    // ================= Cycle de vie (appelé par MainActivity) =================
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_WIFI) {
            String pass = pendingWifiPass; pendingWifiPass = null;
            if (resultCode != Activity.RESULT_OK) { emitWifi(false, "cancel", "Ajout du réseau annulé"); return; }
            int res = 0;
            try {
                if (data != null && Build.VERSION.SDK_INT >= 30) {
                    ArrayList<Integer> l = data.getIntegerArrayListExtra(Settings.EXTRA_WIFI_NETWORK_RESULT_LIST);
                    if (l != null && !l.isEmpty()) res = l.get(0);
                }
            } catch (Exception e) { }
            if (res == Settings.ADD_WIFI_RESULT_ADD_OR_UPDATE_FAILED) fallbackWifi(pass, "Android n'a pas pu enregistrer le réseau");
            else emitWifi(true, res == Settings.ADD_WIFI_RESULT_ALREADY_EXISTS ? "exists" : "added", res == Settings.ADD_WIFI_RESULT_ALREADY_EXISTS ? "Ce réseau est déjà enregistré" : "Réseau enregistré : le téléphone s'y connecte");
        } else if (requestCode == REQ_CONTACT || requestCode == REQ_EVENT) {
            try {
                JSONObject o = new JSONObject();
                o.put("ok", resultCode == Activity.RESULT_OK);
                emit(requestCode == REQ_CONTACT ? "contact" : "event", o.toString());
            } catch (Exception e) { }
        }
    }

    public void onPermissions(int requestCode) { }

    public void onResume() { }

    public void onIntent(Intent i) {
        if (take(i)) {
            try { i.setAction(Intent.ACTION_MAIN); } catch (Exception e) { }
            emit("shared", "{\"count\":" + queue.size() + "}");
        }
    }

    // ================= Outils =================
    private static String n(String s) { return s == null ? "" : s; }

    private static void put(Intent i, String k, String v) { if (v != null && !v.isEmpty()) i.putExtra(k, v); }

    private static String strip(String b64) { int c = b64 == null ? -1 : b64.indexOf(','); return c >= 0 && b64.startsWith("data:") ? b64.substring(c + 1) : n(b64); }

    private static String clean(String name) {
        String s = n(name).replaceAll("[\\\\/:*?\"<>|\\n\\r\\t]+", " ").trim();
        if (s.isEmpty()) s = "QR code";
        if (!s.toLowerCase().endsWith(".png")) s += ".png";
        return s;
    }

    private boolean start(Intent i) {
        try { a.startActivity(i); return true; }
        catch (ActivityNotFoundException e) { return false; }
        catch (Exception e) { return false; }
    }

    private boolean startForResult(Intent i, int code) {
        try { a.startActivityForResult(i, code); return true; }
        catch (ActivityNotFoundException e) { return false; }
        catch (Exception e) { return false; }
    }

    private void ui(Runnable r) { a.runOnUiThread(r); }

    private void emit(final String type, final String json) {
        final String js = "window.qrEvent&&qrEvent(" + JSONObject.quote(type) + "," + json + ")";
        ui(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }

    @SuppressWarnings("unused")
    private void toast(final String t) { ui(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_SHORT).show(); } }); }
}
