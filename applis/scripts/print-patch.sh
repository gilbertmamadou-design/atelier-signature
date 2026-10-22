#!/usr/bin/env bash
# Pont Android pour la Suite et QHSE Pro :
#  - MAGPrint.printHtml(html, titre) : imprimer une page (imprimante ou « Enregistrer en PDF »)
#  - MAGPrint.printPdf(base64, nom)   : imprimer un PDF
#  - MAGPrint.fileMenu(base64, nom, type, à, objet, texte) : enregistrer dans un dossier, envoyer par e-mail, partager, imprimer
#  - MAGPrint.notifyUser(titre, texte) : notification du téléphone
#  - MAGPrint.home…() : Socle, écran d'accueil (LauncherService.java, LauncherA11y.java)
#  - MAGPrint.wp…() : Toile, fonds d'écran automatiques recadrés (WallpaperJob.java, WallpaperTile.java)
#  - MAGPrint.weatherWatch(lat, lng, lieu, actif) : surveillance du vent et des orages, même application fermée (toutes les 30 min)
set -e
F=$(find android/app/src/main/java -name MainActivity.java | head -1)
PKG=$(sed -n 's/^package \(.*\);/\1/p' "$F")
cat > "$F" <<'JAVA'
package __PKG__;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import android.speech.tts.TextToSpeech;
import android.view.WindowManager;
import java.util.Locale;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private WebView printView;
    private byte[] pendingData;
    private boolean bridgeReloaded = false;
    private static final int REQ_SAVE = 4242;
    private static final int REQ_WP_FOLDER = 4250, REQ_WP_IMAGE = 4251;

    public class MagPrint {
        @JavascriptInterface
        public void printHtml(final String html, final String title) {
            runOnUiThread(new Runnable() { public void run() { doPrint(html, title); } });
        }
        @JavascriptInterface
        public void printPdf(final String b64, final String name) {
            runOnUiThread(new Runnable() { public void run() { printBytes(Base64.decode(b64, Base64.DEFAULT), name); } });
        }
        @JavascriptInterface
        public void openFile(final String b64, final String name, final String mime) {
            runOnUiThread(new Runnable() { public void run() { try { view(Base64.decode(b64, Base64.DEFAULT), name, mime); } catch (Exception e) { toast("Fichier illisible"); } } });
        }
        @JavascriptInterface
        public String version() { return "3"; }
        @JavascriptInterface
        public void notifyUser(final String title, final String text) {
            runOnUiThread(new Runnable() { public void run() { askNotif(); postNotif(MainActivity.this, title, text, 7001); } });
        }
        @JavascriptInterface
        public void weatherWatch(final double lat, final double lng, final String name, final boolean on) {
            runOnUiThread(new Runnable() { public void run() { setWatch(lat, lng, name, on); } });
        }
        @JavascriptInterface
        public void scheduleNotif(final double delayMs, final String title, final String text, final int id) {
            runOnUiThread(new Runnable() { public void run() {
                askNotif();
                Data d = new Data.Builder().putString("t", title).putString("x", text).putInt("id", id).build();
                OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(NotifWorker.class).setInitialDelay((long) delayMs, TimeUnit.MILLISECONDS).setInputData(d).build();
                WorkManager.getInstance(getApplicationContext()).enqueueUniqueWork("notif" + id, ExistingWorkPolicy.REPLACE, r);
            } });
        }
        @JavascriptInterface
        public void speak(final String text) { runOnUiThread(new Runnable() { public void run() { say(text); } }); }
        @JavascriptInterface
        public void keepScreen(final boolean on) { runOnUiThread(new Runnable() { public void run() { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } }); }
        @JavascriptInterface
        public void trackStart() { runOnUiThread(new Runnable() { public void run() { askLoc(); askNotif(); try { TrackService.start(MainActivity.this); } catch (Exception e) { toast("Enregistrement en arrière-plan impossible : " + e.getMessage()); } } }); }
        @JavascriptInterface
        public void trackStop() { runOnUiThread(new Runnable() { public void run() { TrackService.stop(MainActivity.this); } }); }
        @JavascriptInterface
        public String trackSince(int from) { return TrackService.since(from); }
        @JavascriptInterface
        public void trackClear() { TrackService.clear(); }
        @JavascriptInterface
        public boolean trackRunning() { return TrackService.running; }
        @JavascriptInterface
        public void cancelNotif(final int id) { WorkManager.getInstance(getApplicationContext()).cancelUniqueWork("notif" + id); }
        @JavascriptInterface
        public boolean hasWeatherWatch() { return getSharedPreferences("magwx", MODE_PRIVATE).getBoolean("on", false); }
        @JavascriptInterface
        public void askLocation() {
            runOnUiThread(new Runnable() { public void run() { askLoc(); } });
        }
        @JavascriptInterface
        public boolean musicHasPerm() { return hasAudioPerm(); }
        @JavascriptInterface
        public void musicAsk() { runOnUiThread(new Runnable() { public void run() { askAudio(); askNotif(); } }); }
        @JavascriptInterface
        public String musicScan() { return MusicService.scan(MainActivity.this); }
        @JavascriptInterface
        public String musicArt(String albumId, int size) { return MusicService.art(MainActivity.this, Long.parseLong(albumId), -1, size); }
        @JavascriptInterface
        public String musicArt2(String albumId, String trackId, int size) { return MusicService.art(MainActivity.this, Long.parseLong(albumId), Long.parseLong(trackId), size); }
        @JavascriptInterface
        public void musicCoverSearch(String albumId, String artist, String album, String title, boolean force) { MusicService.coverSearch(getApplicationContext(), Long.parseLong(albumId), artist, album, title, force); }
        @JavascriptInterface
        public String musicCoverState() { return MusicService.coverState(); }
        @JavascriptInterface
        public void musicCoverDelete(String albumId) { MusicService.coverDelete(getApplicationContext(), Long.parseLong(albumId)); }
        @JavascriptInterface
        public void musicPlay(final String queueJson, final int index, final int posMs) {
            runOnUiThread(new Runnable() { public void run() { askNotif(); MusicService.setQueue(queueJson); MusicService.cmd(MainActivity.this, "play", index, posMs); } });
        }
        @JavascriptInterface
        public void musicQueue(String queueJson, int index) { MusicService.updateQueue(queueJson, index); }
        @JavascriptInterface
        public void musicCmd(final String action, final int a) { runOnUiThread(new Runnable() { public void run() { MusicService.cmd(MainActivity.this, action, a, 0); } }); }
        @JavascriptInterface
        public String musicState() { return MusicService.state(); }
        @JavascriptInterface
        public String musicVolState() { return MelodieVolume.state(getApplicationContext()); }
        @JavascriptInterface
        public void musicVolMode(int m) { MelodieVolume.setMode(getApplicationContext(), m); }
        @JavascriptInterface
        public void musicVolScan(String ids) {
            try { org.json.JSONArray a = new org.json.JSONArray(ids); long[] l = new long[a.length()]; for (int k = 0; k < l.length; k++) l[k] = a.getLong(k); MelodieVolume.scanAll(getApplicationContext(), l); } catch (Exception e) { }
        }
        @JavascriptInterface
        public void musicVolStop() { MelodieVolume.scanStop = true; }
        @JavascriptInterface
        public boolean fsHasAll() { return FileService.hasAll(MainActivity.this); }
        @JavascriptInterface
        public void fsAskAll() { runOnUiThread(new Runnable() { public void run() { askAllFiles(); } }); }
        @JavascriptInterface
        public String fsRoot() { return FileService.ROOT; }
        @JavascriptInterface
        public String fsRoots() { return FileService.roots(MainActivity.this); }
        @JavascriptInterface
        public String fsList(String path) { return FileService.list(path); }
        @JavascriptInterface
        public boolean fsOp(String kind, String json, String dest) { return FileService.start(getApplicationContext(), kind, json, dest); }
        @JavascriptInterface
        public String fsOpState() { return FileService.opState(); }
        @JavascriptInterface
        public void fsOpCancel() { FileService.opCancel = true; }
        @JavascriptInterface
        public String fsScanChunk(int i) { return FileService.scanChunk(i); }
        @JavascriptInterface
        public void fsScanFree() { FileService.scanOut = new StringBuilder(); }
        @JavascriptInterface
        public String fsTrashList() { return FileService.trashList(); }
        @JavascriptInterface
        public String fsRename(String path, String name) { return FileService.rename(getApplicationContext(), path, name); }
        @JavascriptInterface
        public String fsMkdir(String parent, String name) { return FileService.mkdir(parent, name); }
        @JavascriptInterface
        public String fsThumb(String path, int size) { return FileService.thumb(getApplicationContext(), path, size); }
        @JavascriptInterface
        public String fsApps() { return FileService.apps(getApplicationContext()); }
        @JavascriptInterface
        public String fsAppIcon(String pkg, int size) { return FileService.appIcon(getApplicationContext(), pkg, size); }
        @JavascriptInterface
        public void fsOpen(final String path) { runOnUiThread(new Runnable() { public void run() { openPath(path); } }); }
        @JavascriptInterface
        public void fsShare(final String json) { runOnUiThread(new Runnable() { public void run() { sharePaths(json); } }); }
        @JavascriptInterface
        public void fsUninstall(final String pkg) { runOnUiThread(new Runnable() { public void run() { try { startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg))); } catch (Exception e) { toast("Désinstallation impossible"); } } }); }
        @JavascriptInterface
        public void fsAppSettings(final String pkg) { runOnUiThread(new Runnable() { public void run() { try { startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))); } catch (Exception e) { toast("Réglages indisponibles"); } } }); }
        @JavascriptInterface
        public void fsStorageSettings() { runOnUiThread(new Runnable() { public void run() { try { startActivity(new Intent(android.provider.Settings.ACTION_INTERNAL_STORAGE_SETTINGS)); } catch (Exception e) { toast("Réglages indisponibles"); } } }); }
        @JavascriptInterface
        public void httpFetch(final String key, final String url) { VeilleWorker.fetchAsync(key, url); }
        @JavascriptInterface
        public String httpTake(String key) { return VeilleWorker.take(key); }
        @JavascriptInterface
        public void veilleSetup(final String json) { runOnUiThread(new Runnable() { public void run() { if (VeilleWorker.setup(getApplicationContext(), json)) askNotif(); } }); }
        @JavascriptInterface
        public void meteoWatch(final String json) { runOnUiThread(new Runnable() { public void run() { if (MeteoWorker.setup(getApplicationContext(), json)) askNotif(); } }); }
        @JavascriptInterface
        public String veilleTake() { return VeilleWorker.takeNew(getApplicationContext()); }
        // ----- Aube : réveil, lumière, musique d'endormissement -----
        @JavascriptInterface
        public void alarmSave(final String json) { AlarmService.save(getApplicationContext(), json); }
        @JavascriptInterface
        public String alarmList() { return AlarmService.list(getApplicationContext()); }
        @JavascriptInterface
        public String alarmState() { return AlarmService.state(); }
        @JavascriptInterface
        public long alarmNext() { return AlarmService.prefs(getApplicationContext()).getLong("next", 0); }
        @JavascriptInterface
        public long alarmSnoozeAt() { return AlarmService.prefs(getApplicationContext()).getLong("snoozeAt", 0); }
        @JavascriptInterface
        public void alarmCancelSnooze() { sendBroadcast(new Intent(MainActivity.this, AlarmReceiver.class).setAction("aube.UNSNOOZE")); }
        @JavascriptInterface
        public void alarmCmd(final String action, final String json) { runOnUiThread(new Runnable() { public void run() { try { AlarmService.cmd(MainActivity.this, action, json); } catch (Exception e) { toast("Action impossible : " + e.getMessage()); } } }); }
        @JavascriptInterface
        public void dawnClear() { AlarmService.dawnId = -1; AlarmService.dawnAt = 0; }
        @JavascriptInterface
        public String alarmPerms() { return aubePerms(); }
        @JavascriptInterface
        public void alarmFix(final String what) { runOnUiThread(new Runnable() { public void run() { aubeFix(what); } }); }
        @JavascriptInterface
        public void setBright(final float v) { runOnUiThread(new Runnable() { public void run() { WindowManager.LayoutParams lp = getWindow().getAttributes(); lp.screenBrightness = v < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(0.004f, Math.min(1f, v)); getWindow().setAttributes(lp); } }); }
        @JavascriptInterface
        public void lockShow(final boolean on) { runOnUiThread(new Runnable() { public void run() { showOnLock(on); } }); }
        // ----- Tuiles Socle : chaque appli publie un résumé, et reçoit les actions des tuiles -----
        @JavascriptInterface
        public void widgetPut(String json) { WidgetProvider.put(getApplicationContext(), json); }
        @JavascriptInterface
        public void backupPut(String json) { WidgetProvider.putBackup(getApplicationContext(), json); }
        @JavascriptInterface
        public String takeSocle() { String s = pendingSocle; pendingSocle = ""; return s == null ? "" : s; }
        @JavascriptInterface
        public void appBack() { runOnUiThread(new Runnable() { public void run() { try { moveTaskToBack(true); } catch (Exception e) { } } }); }
        // ----- Socle : écran d'accueil en tableau de bord -----
        @JavascriptInterface
        public String homeApps() { return LauncherService.apps(getApplicationContext()); }
        @JavascriptInterface
        public String homeIcon(String pkg, String cls, int size, double upd) { return LauncherService.icon(getApplicationContext(), pkg, cls, size, (long) upd); }
        @JavascriptInterface
        public void homeLaunch(final String pkg, final String cls) { runOnUiThread(new Runnable() { public void run() { if (!LauncherService.launch(MainActivity.this, pkg, cls)) toast("Impossible d'ouvrir cette application"); } }); }
        @JavascriptInterface
        public void homeOpen(final String what, final String arg) { runOnUiThread(new Runnable() { public void run() { if (!LauncherService.open(MainActivity.this, what, arg)) toast("Aucune application pour cette action"); } }); }
        @JavascriptInterface
        public void homeOpenIn(final String what, final String arg, final String pkg) { runOnUiThread(new Runnable() { public void run() { if (!LauncherService.open(MainActivity.this, what, arg, pkg)) toast("Aucune application pour cette action"); } }); }
        @JavascriptInterface
        public String homeInstalled(String pkg) { return LauncherService.installed(getApplicationContext(), pkg); }
        @JavascriptInterface
        public String homeBattery() { return LauncherService.battery(getApplicationContext()); }
        @JavascriptInterface
        public String homeAlarm() { return LauncherService.nextAlarm(getApplicationContext()); }
        @JavascriptInterface
        public String homeAgenda(int days) { return LauncherService.agenda(getApplicationContext(), days); }
        @JavascriptInterface
        public String homeContacts(String q) { return LauncherService.contacts(getApplicationContext(), q); }
        @JavascriptInterface
        public String homeTorch(boolean on) { return LauncherService.torch(getApplicationContext(), on); }
        @JavascriptInterface
        public boolean homeTorchState() { return LauncherService.torchOn; }
        @JavascriptInterface
        public String homeColors() { return LauncherService.colors(getApplicationContext()); }
        @JavascriptInterface
        public String homePerms() { return LauncherService.perms(getApplicationContext()); }
        @JavascriptInterface
        public String homePlace(double lat, double lon) {
            // Nom de la commune pour la météo « ma position » (géocodeur d'Android)
            try {
                if (!android.location.Geocoder.isPresent()) return "";
                java.util.List<android.location.Address> l = new android.location.Geocoder(getApplicationContext(), java.util.Locale.FRANCE).getFromLocation(lat, lon, 1);
                if (l == null || l.isEmpty()) return "";
                android.location.Address a = l.get(0);
                String n = a.getLocality(); if (n == null || n.isEmpty()) n = a.getSubLocality(); if (n == null || n.isEmpty()) n = a.getSubAdminArea();
                return n == null ? "" : n;
            } catch (Throwable t) { return ""; }
        }
        @JavascriptInterface
        public void homeAsk(final String what) { runOnUiThread(new Runnable() { public void run() { socleAsk(what); } }); }
        @JavascriptInterface
        public boolean homeLock() { return LauncherService.lock(); }
        @JavascriptInterface
        public boolean homeNotif(boolean quick) { return LauncherService.notifications(getApplicationContext(), quick); }
        @JavascriptInterface
        public String homeMedia(String knownArt) { return LauncherService.media(getApplicationContext(), knownArt); }
        @JavascriptInterface
        public boolean homeMediaCmd(String cmd, double arg) { return LauncherService.mediaCmd(getApplicationContext(), cmd, (long) arg); }
        @JavascriptInterface
        public void homeMediaAccess() { runOnUiThread(new Runnable() { public void run() { LauncherService.openMediaAccess(MainActivity.this); } }); }
        @JavascriptInterface
        public String homeWidget(String pkg) { return LauncherService.widget(getApplicationContext(), pkg); }
        @JavascriptInterface
        public boolean homeWidgetCall(String pkg, String method, String arg) { return LauncherService.widgetCall(getApplicationContext(), pkg, method, arg); }
        @JavascriptInterface
        public void homeLaunchWith(final String pkg, final String action) { runOnUiThread(new Runnable() { public void run() { if (!LauncherService.launchWith(MainActivity.this, pkg, action)) toast("Appli non installée"); } }); }
        @JavascriptInterface
        public String homePhotos(int n, int size) { return LauncherService.photos(getApplicationContext(), n, size); }
        @JavascriptInterface
        public void homeOpenPhoto(final String uri, final String pkg) { runOnUiThread(new Runnable() { public void run() { if (!LauncherService.openPhoto(MainActivity.this, uri, pkg)) toast("Impossible d'ouvrir la photo"); } }); }
        @JavascriptInterface
        public String homeFavContacts(int n) { return LauncherService.favContacts(getApplicationContext(), n); }
        @JavascriptInterface
        public void homeStatusBar(final boolean hide) { getSharedPreferences("socle", MODE_PRIVATE).edit().putBoolean("hideBar", hide).apply(); runOnUiThread(new Runnable() { public void run() { socleBars(); } }); }
        @JavascriptInterface
        public String homeInsets() { return LauncherService.insets(MainActivity.this); }
        // ----- Toile : fonds d'écran automatiques recadrés -----
        @JavascriptInterface
        public String wpSettings() { return WallpaperJob.settings(getApplicationContext()).toString(); }
        @JavascriptInterface
        public void wpSave(String json) { WallpaperJob.saveSettings(getApplicationContext(), json); }
        @JavascriptInterface
        public String wpState() { return WallpaperJob.state(getApplicationContext()); }
        @JavascriptInterface
        public void wpPickFolder() { runOnUiThread(new Runnable() { public void run() {
            try { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION); startActivityForResult(i, REQ_WP_FOLDER); }
            catch (Exception e) { toast("Sélecteur de dossier indisponible"); }
        } }); }
        @JavascriptInterface
        public void wpPickImage() { runOnUiThread(new Runnable() { public void run() {
            try { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("image/*"); startActivityForResult(i, REQ_WP_IMAGE); }
            catch (Exception e) { toast("Sélecteur d'images indisponible"); }
        } }); }
        @JavascriptInterface
        public void wpScan() { final Context c = getApplicationContext(); wpRun("scan", new java.util.concurrent.Callable<String>() { public String call() throws Exception { return String.valueOf(WallpaperJob.list(c).size()); } }); }
        @JavascriptInterface
        public void wpChange() { final Context c = getApplicationContext(); wpRun("change", new java.util.concurrent.Callable<String>() { public String call() throws Exception { return WallpaperJob.change(c); } }); }
        @JavascriptInterface
        public void wpPrevious() { final Context c = getApplicationContext(); wpRun("previous", new java.util.concurrent.Callable<String>() { public String call() throws Exception { return WallpaperJob.previous(c); } }); }
        @JavascriptInterface
        public void wpPreview(final String uri) { final Context c = getApplicationContext(); wpRun("preview", new java.util.concurrent.Callable<String>() { public String call() throws Exception { return WallpaperJob.preview(c, uri); } }); }
        @JavascriptInterface
        public void wpApply(final String uri) { final Context c = getApplicationContext(); wpRun("apply", new java.util.concurrent.Callable<String>() { public String call() throws Exception { return WallpaperJob.applyUri(c, Uri.parse(uri)); } }); }
        @JavascriptInterface
        public void wpAddTile() { runOnUiThread(new Runnable() { public void run() { wpTile(); } }); }
        @JavascriptInterface
        public void fileMenu(final String b64, final String name, final String mime, final String to, final String subject, final String body) {
            runOnUiThread(new Runnable() { public void run() { showFileMenu(b64, name, mime, to, subject, body); } });
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final WebView wv = getBridge().getWebView();
        wv.addJavascriptInterface(new MagPrint(), "MAGPrint");
        loadExtraBridges(wv);
        // Le texte ne suit pas l'agrandissement de police d'Android : la mise en page reste dans la largeur de l'écran
        wv.getSettings().setTextZoom(100);
        // Sur certains téléphones la page est déjà chargée avant l'ajout du pont : on vérifie et on recharge une fois
        wv.postDelayed(new Runnable() { public void run() {
            wv.evaluateJavascript("(function(){return typeof window.MAGPrint})()", new android.webkit.ValueCallback<String>() {
                public void onReceiveValue(String v) { if (v == null || v.contains("undefined")) { if (!bridgeReloaded) { bridgeReloaded = true; wv.reload(); } } }
            });
        } }, 1500);
        aubeIntent(getIntent());
        socleIntent(getIntent(), 1200);
        if (isSocle()) socleSetup(wv);
    }
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); aubeIntent(intent);
        extraCall("onIntent", new Class<?>[]{ Intent.class }, intent);
        socleIntent(intent, 50);
        if (isSocle() && intent != null && intent.hasCategory(Intent.CATEGORY_HOME)) socleJs("window.accueilHome&&accueilHome()");
    }
    // ----- Ponts supplémentaires (Galerie, Agenda, Contacts) : une classe par appli, chargée si elle existe -----
    private final java.util.List<Object> extraBridges = new java.util.ArrayList<Object>();
    private void loadExtraBridges(WebView wv) {
        String pkg = MainActivity.class.getPackage().getName();
        for (String n : new String[]{ "GalerieBridge", "AgendaBridge", "ContactsBridge", "OndesBridge", "PhotoBridge", "ScanBridge", "MesureBridge", "SauvegardeBridge", "EcranBridge", "UrgenceBridge", "CoffreBridge", "QrBridge", "LiseuseBridge", "BudgetBridge", "DictaBridge", "MeteoBridge", "ReseauBridge", "LecteurBridge", "PdfBridge" }) {
            try {
                Class<?> k = Class.forName(pkg + "." + n);
                Object o = k.getConstructor(android.app.Activity.class, WebView.class).newInstance(this, wv);
                wv.addJavascriptInterface(o, "MAG" + n.replace("Bridge", ""));
                extraBridges.add(o);
            } catch (Throwable t) { }
        }
    }
    private void extraCall(String m, Class<?>[] types, Object... args) {
        for (Object o : extraBridges) { try { o.getClass().getMethod(m, types).invoke(o, args); } catch (Throwable t) { } }
    }
    // ----- Action envoyée par une tuile de Socle (extra « socle ») -----
    private String pendingSocle = "";
    private void socleIntent(Intent i, long delay) {
        if (i == null || i.getStringExtra("socle") == null) return;
        pendingSocle = i.getStringExtra("socle");
        i.removeExtra("socle");
        final String js = "if(window.onSocle){var a=MAGPrint.takeSocle();if(a)onSocle(a);}";
        getBridge().getWebView().postDelayed(new Runnable() { public void run() { try { getBridge().getWebView().evaluateJavascript(js, null); } catch (Exception e) { } } }, delay);
    }
    // ----- Socle : l'application sert d'écran d'accueil -----
    private boolean isSocle() { return getPackageName().endsWith(".socle"); }
    private void socleJs(final String js) {
        runOnUiThread(new Runnable() { public void run() { try { getBridge().getWebView().evaluateJavascript(js, null); } catch (Exception e) { } } });
    }
    // Socle : barre du haut masquée sur l'accueil (elle réapparaît un instant en glissant depuis le haut)
    private void socleBars() {
        if (!isSocle()) return;
        boolean hide = getSharedPreferences("socle", MODE_PRIVATE).getBoolean("hideBar", false);
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                android.view.WindowInsetsController c = getWindow().getInsetsController();
                if (c == null) return;
                if (hide) { c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); c.hide(android.view.WindowInsets.Type.statusBars()); }
                else c.show(android.view.WindowInsets.Type.statusBars());
            } else {
                int f = android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                if (hide) f |= android.view.View.SYSTEM_UI_FLAG_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                getWindow().getDecorView().setSystemUiVisibility(f);
            }
        } catch (Exception e) { }
    }
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isSocle()) socleBars();
    }
    private void socleSetup(WebView wv) {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
        wv.setBackgroundColor(0);
        try { ((android.view.View) wv.getParent()).setBackgroundColor(0); } catch (Exception e) { }
        getWindow().setStatusBarColor(0);
        getWindow().setNavigationBarColor(0);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        if (Build.VERSION.SDK_INT >= 29) { getWindow().setNavigationBarContrastEnforced(false); getWindow().setStatusBarContrastEnforced(false); }
        if (Build.VERSION.SDK_INT >= 27) {
            try {
                android.app.WallpaperManager.getInstance(this).addOnColorsChangedListener(new android.app.WallpaperManager.OnColorsChangedListener() {
                    public void onColorsChanged(android.app.WallpaperColors c, int which) { socleJs("window.accueilColors&&accueilColors()"); }
                }, new android.os.Handler(android.os.Looper.getMainLooper()));
            } catch (Exception e) { }
        }
    }
    private void socleAsk(String what) {
        String[] p;
        if ("calendar".equals(what)) p = new String[]{ Manifest.permission.READ_CALENDAR };
        else if ("contacts".equals(what)) p = new String[]{ Manifest.permission.READ_CONTACTS };
        else if ("location".equals(what)) p = new String[]{ Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION };
        else if ("photos".equals(what)) p = Build.VERSION.SDK_INT >= 33 ? new String[]{ "android.permission.READ_MEDIA_IMAGES" } : new String[]{ Manifest.permission.READ_EXTERNAL_STORAGE };
        else return;
        ActivityCompat.requestPermissions(this, p, 4310);
    }
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        extraCall("onPermissions", new Class<?>[]{ int.class }, requestCode);
        if (isSocle()) socleJs("window.accueilPerms&&accueilPerms()");
    }
    @Override
    public void onResume() {
        super.onResume();
        extraCall("onResume", new Class<?>[]{});
        if (pendingApk != null && (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) { final String ap = pendingApk; getWindow().getDecorView().postDelayed(new Runnable() { public void run() { installApk(ap); } }, 400); }
        if (isSocle()) { socleBars(); socleJs("window.accueilResume&&accueilResume()"); }
    }
    @Override
    public void onBackPressed() {
        if (isSocle()) { socleJs("window.accueilBack&&accueilBack()"); return; }
        super.onBackPressed();
    }
    private void aubeIntent(Intent i) {
        if (i == null || i.getStringExtra("aube") == null) return;
        showOnLock(true);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private void showOnLock(boolean on) {
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(on); setTurnScreenOn(on); }
        else if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    }
    private String aubePerms() {
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("notif", Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
            o.put("exact", AlarmService.canExact(this));
            boolean fs = true;
            if (Build.VERSION.SDK_INT >= 34) { try { fs = ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).canUseFullScreenIntent(); } catch (Exception e) { } }
            o.put("full", fs);
            boolean bat = true;
            try { bat = ((android.os.PowerManager) getSystemService(POWER_SERVICE)).isIgnoringBatteryOptimizations(getPackageName()); } catch (Exception e) { }
            o.put("battery", bat);
            o.put("audio", hasAudioPerm());
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    private void aubeFix(String what) {
        try {
            switch (what) {
                case "notif": askNotif(); break;
                case "audio": askAudio(); break;
                case "exact": if (Build.VERSION.SDK_INT >= 31) startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()))); break;
                case "full": if (Build.VERSION.SDK_INT >= 34) startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()))); break;
                case "battery": startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); break;
                default: startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            }
        } catch (Exception e) {
            try { startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception e2) { toast("Ouvrez Paramètres > Applications > Aube"); }
        }
    }

    public static final String CH = "meteo";
    static void channel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "Alertes météo et chantier", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Vent, rafales, orages : levage, nacelles, travail en hauteur");
            ((NotificationManager) c.getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }
    static void postNotif(Context c, String title, String text, int id) {
        try {
            channel(c);
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            PendingIntent pi = PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH)
                .setSmallIcon(c.getApplicationInfo().icon)
                .setContentTitle(title).setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(pi);
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (Exception e) { }
    }
    private void askNotif() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4301);
    }
    private boolean hasAudioPerm() {
        String p = Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_AUDIO" : Manifest.permission.READ_EXTERNAL_STORAGE;
        return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED;
    }
    private void askAudio() {
        if (hasAudioPerm()) return;
        String p = Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_AUDIO" : Manifest.permission.READ_EXTERNAL_STORAGE;
        ActivityCompat.requestPermissions(this, new String[]{p}, 4303);
    }
    private void askAllFiles() {
        if (FileService.hasAll(this)) return;
        if (Build.VERSION.SDK_INT >= 30) {
            try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); } catch (Exception e2) { toast("Ouvrez Paramètres > Applications > Rangement > Autorisations"); } }
        } else ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, 4304);
    }
    private Uri fileUri(java.io.File f) { return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f); }
    // APK : Android exige l'autorisation « Installer des applis inconnues » ; on l'ouvre puis on reprend au retour
    private String pendingApk = null;
    private void installApk(String path) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingApk = path;
            toast("Autorise « Installer des applis inconnues » pour cette appli, puis reviens : l'installation reprendra");
            try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { try { startActivity(new Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS)); } catch (Exception e2) { } }
            return;
        }
        pendingApk = null;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(fileUri(new java.io.File(path)), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) { toast("Installation impossible : " + e.getMessage()); }
    }
    private void openPath(String path) {
        if (path != null && path.toLowerCase().endsWith(".apk")) { installApk(path); return; }
        try {
            java.io.File f = new java.io.File(path);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(fileUri(f), FileService.mime(path));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(i, "Ouvrir avec"));
        } catch (Exception e) { toast("Aucune application pour ouvrir ce fichier"); }
    }
    private void sharePaths(String json) {
        try {
            org.json.JSONArray a = new org.json.JSONArray(json);
            ArrayList<Uri> us = new ArrayList<Uri>(); String m = null;
            for (int k = 0; k < a.length(); k++) {
                java.io.File f = new java.io.File(a.getString(k)); if (f.isDirectory()) continue;
                us.add(fileUri(f)); String mm = FileService.mime(f.getName());
                m = m == null ? mm : (m.equals(mm) ? m : (m.split("/")[0].equals(mm.split("/")[0]) ? m.split("/")[0] + "/*" : "*/*"));
            }
            if (us.isEmpty()) { toast("Les dossiers ne peuvent pas être partagés"); return; }
            Intent i = new Intent(us.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
            i.setType(m == null ? "*/*" : m);
            if (us.size() == 1) i.putExtra(Intent.EXTRA_STREAM, us.get(0)); else i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, us);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "Partager"));
        } catch (Exception e) { toast("Partage impossible : " + e.getMessage()); }
    }
    private void askLoc() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 4302);
    }
    private void setWatch(double lat, double lng, String name, boolean on) {
        SharedPreferences.Editor e = getSharedPreferences("magwx", MODE_PRIVATE).edit();
        e.putBoolean("on", on).putString("lat", String.valueOf(lat)).putString("lng", String.valueOf(lng)).putString("name", name == null ? "" : name).putInt("last", -1).apply();
        WorkManager wm = WorkManager.getInstance(getApplicationContext());
        if (on) {
            askNotif();
            PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(WeatherWorker.class, 30, TimeUnit.MINUTES).build();
            wm.enqueueUniquePeriodicWork("magwx", ExistingPeriodicWorkPolicy.UPDATE, r);
            toast("Surveillance météo activée : vous serez prévenu même application fermée");
        } else {
            wm.cancelUniqueWork("magwx");
            toast("Surveillance météo arrêtée");
        }
    }

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private void say(final String text) {
        if (tts == null) {
            tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() { public void onInit(int st) { if (st == TextToSpeech.SUCCESS) { tts.setLanguage(Locale.FRANCE); ttsReady = true; tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mag"); } } });
            return;
        }
        if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mag");
    }

    private void toast(String t) { Toast.makeText(this, t, Toast.LENGTH_LONG).show(); }

    private void doPrint(String html, String title) {
        final String t = (title == null || title.isEmpty()) ? "MAG Formation 13" : title;
        WebView w = new WebView(this);
        printView = w;
        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                pm.print(t, view.createPrintDocumentAdapter(t),
                    new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }
        });
        w.getSettings().setJavaScriptEnabled(false);
        w.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
    }

    private void printBytes(final byte[] data, String name) {
        try {
            final String t = (name == null || name.isEmpty()) ? "document.pdf" : name;
            PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
            pm.print(t, new PrintDocumentAdapter() {
                @Override
                public void onLayout(PrintAttributes oldA, PrintAttributes newA, android.os.CancellationSignal cs, LayoutResultCallback cb, Bundle extras) {
                    if (cs.isCanceled()) { cb.onLayoutCancelled(); return; }
                    cb.onLayoutFinished(new PrintDocumentInfo.Builder(t).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
                }
                @Override
                public void onWrite(PageRange[] pages, android.os.ParcelFileDescriptor dest, android.os.CancellationSignal cs, WriteResultCallback cb) {
                    try (java.io.FileOutputStream out = new java.io.FileOutputStream(dest.getFileDescriptor())) {
                        out.write(data);
                        cb.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                    } catch (Exception ex) { cb.onWriteFailed(ex.getMessage()); }
                }
            }, null);
        } catch (Exception e) { toast("Impression impossible"); }
    }

    private void showFileMenu(String b64, String name, String mime, final String to, final String subject, final String body) {
        final byte[] data;
        try { data = Base64.decode(b64, Base64.DEFAULT); } catch (Exception e) { toast("Fichier illisible"); return; }
        final String n = (name == null || name.isEmpty()) ? "document" : name;
        final String m = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
        final boolean pdf = m.contains("pdf") || n.toLowerCase().endsWith(".pdf");
        final ArrayList<String> items = new ArrayList<String>();
        items.add(pdf ? "Ouvrir / voir le PDF" : "Ouvrir le fichier");
        items.add("Enregistrer dans un dossier...");
        items.add("Envoyer par e-mail");
        items.add("Partager (Drive, WhatsApp, Bluetooth...)");
        if (pdf) items.add("Imprimer");
        new AlertDialog.Builder(this).setTitle(n)
            .setItems(items.toArray(new String[0]), new android.content.DialogInterface.OnClickListener() {
                public void onClick(android.content.DialogInterface d, int w) {
                    if (w == 0) view(data, n, m);
                    else if (w == 1) saveAs(data, n, m);
                    else if (w == 2) send(data, n, m, true, to, subject, body);
                    else if (w == 3) send(data, n, m, false, null, null, null);
                    else printBytes(data, n);
                }
            })
            .setNegativeButton("Annuler", null).show();
    }

    private void saveAs(byte[] data, String n, String m) {
        pendingData = data;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(m);
        i.putExtra(Intent.EXTRA_TITLE, n);
        try { startActivityForResult(i, REQ_SAVE); } catch (Exception e) { toast("Enregistrement impossible sur cet appareil"); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SAVE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingData != null) {
                try (java.io.OutputStream o = getContentResolver().openOutputStream(data.getData())) {
                    o.write(pendingData);
                    toast("Fichier enregistré");
                } catch (Exception e) { toast("Enregistrement impossible"); }
            }
            pendingData = null;
        }
        extraCall("onResult", new Class<?>[]{ int.class, int.class, Intent.class }, requestCode, resultCode, data);
        if ((requestCode == REQ_WP_FOLDER || requestCode == REQ_WP_IMAGE) && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri u = data.getData();
            try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { }
            if (requestCode == REQ_WP_FOLDER) {
                WallpaperJob.setFolder(getApplicationContext(), u);
                wpEmit("folder", true, WallpaperJob.folderName(u.toString()));
            } else wpEmit("image", true, u.toString());
        }
    }

    // Toile : travail en arrière-plan, résultat renvoyé à la page par toileEvent(type, ok, données)
    private void wpRun(final String kind, final java.util.concurrent.Callable<String> job) {
        new Thread(new Runnable() { public void run() {
            String r; boolean ok;
            try { r = job.call(); ok = true; }
            catch (Throwable t) {
                r = WallpaperJob.msg(t); ok = false;
                if (!"preview".equals(kind) && !"scan".equals(kind)) WallpaperJob.status(getApplicationContext(), r);
            }
            wpEmit(kind, ok, r);
        } }).start();
    }
    private void wpEmit(String kind, boolean ok, String data) {
        final String js = "window.toileEvent&&toileEvent(" + org.json.JSONObject.quote(kind) + "," + ok + "," + org.json.JSONObject.quote(data == null ? "" : data) + ")";
        runOnUiThread(new Runnable() { public void run() { getBridge().getWebView().evaluateJavascript(js, null); } });
    }
    private void wpTile() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                android.app.StatusBarManager sb = getSystemService(android.app.StatusBarManager.class);
                sb.requestAddTileService(new android.content.ComponentName(this, WallpaperTile.class), "Fond suivant",
                    android.graphics.drawable.Icon.createWithResource(this, getApplicationInfo().icon), getMainExecutor(),
                    new java.util.function.Consumer<Integer>() { public void accept(Integer r) {
                        if (r != null && r == android.app.StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED) toast("La tuile « Fond suivant » est déjà dans les réglages rapides");
                        else if (r != null && r == android.app.StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED) toast("Tuile ajoutée : glisse le volet du haut pour changer de fond");
                    } });
                return;
            } catch (Exception e) { }
        }
        toast("Ouvre les réglages rapides (volet du haut), touche le crayon et fais glisser la tuile « Fond suivant »");
    }

    private Uri cacheUri(byte[] data, String n) throws Exception {
        java.io.File dir = new java.io.File(getCacheDir(), "partage");
        dir.mkdirs();
        java.io.File f = new java.io.File(dir, n.replaceAll("[^A-Za-z0-9._ -]", "_"));
        try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(data); }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
    }
    private void view(byte[] data, String n, String m) {
        try {
            Uri u = cacheUri(data, n == null || n.isEmpty() ? "document" : n);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, m == null || m.isEmpty() ? "application/octet-stream" : m);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try { startActivity(i); }
            catch (ActivityNotFoundException ex) {
                toast(m != null && m.contains("pdf") ? "Aucune application pour lire les PDF : installez Google Drive ou Adobe Acrobat, ou choisissez Enregistrer" : "Aucune application pour ouvrir ce fichier");
            }
        } catch (Exception e) { toast("Ouverture impossible : " + e.getMessage()); }
    }

    private void send(byte[] data, String n, String m, boolean mail, String to, String subject, String body) {
        try {
            java.io.File dir = new java.io.File(getCacheDir(), "partage");
            dir.mkdirs();
            String safe = n.replaceAll("[^A-Za-z0-9._ -]", "_");
            java.io.File f = new java.io.File(dir, safe);
            try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(data); }
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(m);
            i.putExtra(Intent.EXTRA_STREAM, u);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (mail) {
                if (to != null && !to.trim().isEmpty()) i.putExtra(Intent.EXTRA_EMAIL, to.trim().split("[,;\\s]+"));
                if (subject != null && !subject.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, subject);
                if (body != null && !body.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, body);
                Intent sel = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
                i.setSelector(sel);
                try { startActivity(i); return; } catch (ActivityNotFoundException ex) { i.setSelector(null); }
            }
            startActivity(Intent.createChooser(i, mail ? "Envoyer par e-mail" : "Partager"));
        } catch (Exception e) { toast("Partage impossible : " + e.getMessage()); }
    }
}
JAVA
sed -i "s/__PKG__/$PKG/" "$F"
# Tâche de fond : vérifie le vent et les orages toutes les 30 minutes
W="$(dirname "$F")/WeatherWorker.java"
cat > "$W" <<'JAVA'
package __PKG__;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

public class WeatherWorker extends Worker {
    static final int[] LIM = {35, 45, 60, 72};
    static final String[] TXT = {
        "Levage à la grue mobile : limite souvent atteinte (35 km/h).",
        "Nacelles et échafaudages roulants : arrêt (45 km/h).",
        "Travail en hauteur et montage d'échafaudage : arrêt selon consigne (60 km/h).",
        "Grues à tour : mise en girouette (72 km/h)."};
    public WeatherWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
    @NonNull @Override
    public Result doWork() {
        Context c = getApplicationContext();
        SharedPreferences sp = c.getSharedPreferences("magwx", Context.MODE_PRIVATE);
        if (!sp.getBoolean("on", false)) return Result.success();
        try {
            String u = "https://api.open-meteo.com/v1/forecast?latitude=" + sp.getString("lat", "0") + "&longitude=" + sp.getString("lng", "0")
                + "&current=wind_speed_10m,wind_gusts_10m,weather_code&hourly=wind_gusts_10m,weather_code&forecast_hours=3&wind_speed_unit=kmh&timezone=auto";
            HttpURLConnection h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(15000); h.setReadTimeout(15000);
            BufferedReader r = new BufferedReader(new InputStreamReader(h.getInputStream(), "UTF-8"));
            StringBuilder b = new StringBuilder(); String l; while ((l = r.readLine()) != null) b.append(l); r.close();
            JSONObject j = new JSONObject(b.toString()), cur = j.getJSONObject("current"), hr = j.getJSONObject("hourly");
            double gNow = Math.max(cur.optDouble("wind_gusts_10m", 0), cur.optDouble("wind_speed_10m", 0));
            boolean storm = cur.optInt("weather_code", 0) >= 95;
            JSONArray hg = hr.getJSONArray("wind_gusts_10m"), hc = hr.getJSONArray("weather_code");
            double gSoon = 0; boolean stormSoon = false;
            for (int i = 0; i < hg.length(); i++) { gSoon = Math.max(gSoon, hg.optDouble(i, 0)); if (hc.optInt(i, 0) >= 95) stormSoon = true; }
            int lvNow = level(gNow), lvSoon = level(gSoon);
            int code = storm ? 9 : lvNow >= 0 ? lvNow : (stormSoon ? 8 : (lvSoon >= 0 ? 4 + lvSoon : -1));
            int last = sp.getInt("last", -1);
            String place = sp.getString("name", "");
            if (code != last) {
                sp.edit().putInt("last", code).apply();
                if (code == 9) MainActivity.postNotif(c, "⚡ Orage" + (place.isEmpty() ? "" : " – " + place), "Arrêt des travaux en hauteur, sur toiture, du levage et des grues. Mettre le personnel à l'abri.", 7101);
                else if (code >= 0 && code <= 3) MainActivity.postNotif(c, "🌬 Rafales " + Math.round(gNow) + " km/h" + (place.isEmpty() ? "" : " – " + place), allUpTo(lvNow), 7101);
                else if (code == 8) MainActivity.postNotif(c, "⚡ Orage prévu dans les 3 heures", "Prévoir l'arrêt des travaux en hauteur, du levage et des grues.", 7101);
                else if (code >= 4) MainActivity.postNotif(c, "🌬 Rafales jusqu'à " + Math.round(gSoon) + " km/h d'ici 3 h", "À prévoir : " + allUpTo(lvSoon), 7101);
            }
        } catch (Exception e) { return Result.retry(); }
        return Result.success();
    }
    static int level(double g) { int lv = -1; for (int i = 0; i < LIM.length; i++) if (g >= LIM[i]) lv = i; return lv; }
    static String allUpTo(int lv) { StringBuilder s = new StringBuilder(); for (int i = 0; i <= lv; i++) { if (s.length() > 0) s.append(" "); s.append(TXT[i]); } return s.toString(); }
}
JAVA
sed -i "s/__PKG__/$PKG/" "$W"
# Rappels programmés (battues, fin de chasse…)
NW="$(dirname "$F")/NotifWorker.java"
cat > "$NW" <<'JAVA'
package __PKG__;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class NotifWorker extends Worker {
    public NotifWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
    @NonNull @Override
    public Result doWork() {
        MainActivity.postNotif(getApplicationContext(), getInputData().getString("t"), getInputData().getString("x"), getInputData().getInt("id", 7200));
        return Result.success();
    }
}
JAVA
sed -i "s/__PKG__/$PKG/" "$NW"
# Enregistrement du parcours en arrière-plan (écran éteint)
TS="$(dirname "$F")/TrackService.java"
cat > "$TS" <<'JAVA'
package __PKG__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;

public class TrackService extends Service implements LocationListener {
    static final ArrayList<double[]> PTS = new ArrayList<double[]>();
    static volatile boolean running = false;
    private LocationManager lm;

    public static void start(Context c) {
        Intent i = new Intent(c, TrackService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    public static void stop(Context c) { c.stopService(new Intent(c, TrackService.class)); }
    public static synchronized void clear() { PTS.clear(); }
    public static synchronized String since(int from) {
        StringBuilder b = new StringBuilder("[");
        for (int k = Math.max(0, from); k < PTS.size(); k++) {
            double[] p = PTS.get(k);
            if (b.length() > 1) b.append(',');
            b.append('[');
            for (int j = 0; j < p.length; j++) { if (j > 0) b.append(','); b.append(p[j]); }
            b.append(']');
        }
        return b.append(']').toString();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("trace", "Enregistrement du parcours", NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, "trace").setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Enregistrement du parcours").setContentText("Votre trace s'enregistre, même écran éteint.")
            .setOngoing(true).setContentIntent(pi).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(9301, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION); else startForeground(9301, n);
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 3, this); running = true; }
        catch (SecurityException e) { stopSelf(); }
        return START_STICKY;
    }
    @Override
    public void onLocationChanged(Location l) {
        synchronized (TrackService.class) {
            PTS.add(new double[]{ l.getLatitude(), l.getLongitude(), l.hasAltitude() ? l.getAltitude() : -9999, (double) l.getTime(), l.getAccuracy(), l.hasSpeed() ? l.getSpeed() : -1 });
        }
    }
    @Override public void onStatusChanged(String p, int s, Bundle e) { }
    @Override public void onProviderEnabled(String p) { }
    @Override public void onProviderDisabled(String p) { }
    @Override
    public void onDestroy() { running = false; if (lm != null) lm.removeUpdates(this); super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
JAVA
sed -i "s/__PKG__/$PKG/" "$TS"
# Lecteur de musique : service en arrière-plan, écran verrouillé, casque et Bluetooth
MS="$(dirname "$F")/MusicService.java"
cat > "$MS" <<'JAVA'
package __PKG__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import android.util.Size;
import androidx.core.app.NotificationCompat;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Random;
import org.json.JSONArray;
import org.json.JSONObject;

public class MusicService extends Service implements MediaPlayer.OnPreparedListener, MediaPlayer.OnCompletionListener, MediaPlayer.OnErrorListener, AudioManager.OnAudioFocusChangeListener {
    static final ArrayList<long[]> Q = new ArrayList<long[]>();      // {id, albumId, durée}
    static final ArrayList<String[]> QT = new ArrayList<String[]>(); // {titre, artiste, album}
    static final ArrayList<Integer> ORDER = new ArrayList<Integer>();
    static int pos = 0;              // position dans ORDER
    static boolean shuffle = false;
    static int repeat = 0;           // 0 non, 1 tout, 2 un
    static long sleepAt = 0;
    static volatile boolean playing = false, prepared = false, alive = false;
    static MusicService inst;
    static int pendingSeek = 0;

    private MediaPlayer mp;
    private MediaSessionCompat ms;
    private AudioManager am;
    private AudioFocusRequest afr;
    private boolean resumeOnFocus = false;
    final Handler h = new Handler(Looper.getMainLooper());
    private Bitmap art;
    private final BroadcastReceiver noisy = new BroadcastReceiver() { public void onReceive(Context c, Intent i) { if (playing) pause(); } };
    private final Runnable sleeper = new Runnable() { public void run() { if (sleepAt > 0 && System.currentTimeMillis() >= sleepAt) { sleepAt = 0; pause(); } else if (sleepAt > 0) h.postDelayed(this, 5000); } };

    // ---------- Bibliothèque ----------
    static String scan(Context c) {
        JSONArray out = new JSONArray();
        String[] col = Build.VERSION.SDK_INT >= 29
            ? new String[]{MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.ALBUM_ID, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.TRACK, MediaStore.Audio.Media.YEAR, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.RELATIVE_PATH, MediaStore.Audio.Media.DISPLAY_NAME}
            : new String[]{MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.ALBUM_ID, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.TRACK, MediaStore.Audio.Media.YEAR, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DATA, MediaStore.Audio.Media.DISPLAY_NAME};
        try (Cursor cu = c.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, col,
                MediaStore.Audio.Media.IS_MUSIC + "!=0 OR " + MediaStore.Audio.Media.DURATION + ">=90000", null, MediaStore.Audio.Media.TITLE + " COLLATE NOCASE")) {
            if (cu == null) return "[]";
            while (cu.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", cu.getLong(0)); o.put("t", cu.getString(1)); o.put("a", cu.getString(2)); o.put("al", cu.getString(3));
                o.put("alb", cu.getLong(4)); o.put("d", cu.getLong(5)); o.put("tr", cu.getInt(6)); o.put("y", cu.getInt(7)); o.put("add", cu.getLong(8));
                String path = cu.getString(9); if (path == null) path = "";
                if (Build.VERSION.SDK_INT < 29) { int k = path.lastIndexOf('/'); path = k > 0 ? path.substring(0, k) : path; }
                o.put("f", path.replaceAll("^/storage/emulated/0/?", "").replaceAll("/$", ""));
                o.put("fn", cu.getString(10));
                out.put(o);
            }
        } catch (Exception e) { return "[]"; }
        return out.toString();
    }
    // Pochette : 1) téléchargée par Mélodie  2) intégrée au morceau  3) pochette de l'album connue d'Android
    static java.io.File coverFile(Context c, long albumId) { java.io.File d = new java.io.File(c.getFilesDir(), "pochettes"); d.mkdirs(); return new java.io.File(d, albumId + ".jpg"); }
    static Bitmap scaled(Bitmap b, int size) {
        if (b == null) return null;
        if (b.getWidth() <= size * 1.3 && b.getHeight() <= size * 1.3) return b;
        float r = (float) size / Math.max(b.getWidth(), b.getHeight());
        return Bitmap.createScaledBitmap(b, Math.max(1, (int) (b.getWidth() * r)), Math.max(1, (int) (b.getHeight() * r)), true);
    }
    static Bitmap decodeSampled(byte[] data, int size) {
        BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, o);
        int s = 1; while (o.outWidth / (s * 2) >= size && o.outHeight / (s * 2) >= size) s *= 2;
        o = new BitmapFactory.Options(); o.inSampleSize = s;
        return scaled(BitmapFactory.decodeByteArray(data, 0, data.length, o), size);
    }
    static Bitmap artBitmap(Context c, long albumId, long trackId, int size) {
        try {
            java.io.File f = coverFile(c, albumId);
            if (f.exists() && f.length() > 0) { Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath()); if (b != null) return scaled(b, size); }
        } catch (Throwable e) { }
        if (trackId > 0) {
            Uri tu = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, trackId);
            if (Build.VERSION.SDK_INT >= 29) { try { Bitmap b = c.getContentResolver().loadThumbnail(tu, new Size(size, size), null); if (b != null) return b; } catch (Throwable e) { } }
            android.media.MediaMetadataRetriever mr = new android.media.MediaMetadataRetriever();
            try { mr.setDataSource(c, tu); byte[] pic = mr.getEmbeddedPicture(); if (pic != null) { Bitmap b = decodeSampled(pic, size); if (b != null) return b; } }
            catch (Throwable e) { }
            finally { try { mr.release(); } catch (Throwable e) { } }
        }
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                Uri u = ContentUris.withAppendedId(MediaStore.Audio.Albums.EXTERNAL_CONTENT_URI, albumId);
                return c.getContentResolver().loadThumbnail(u, new Size(size, size), null);
            }
            Uri u = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId);
            try (java.io.InputStream is = c.getContentResolver().openInputStream(u)) { return scaled(BitmapFactory.decodeStream(is), size); }
        } catch (Throwable e) { return null; }
    }
    static String art(Context c, long albumId, long trackId, int size) {
        Bitmap b = artBitmap(c, albumId, trackId, size <= 0 ? 300 : size);
        if (b == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 85, bo);
        return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    // ---------- Recherche des pochettes manquantes sur Internet (iTunes, puis Deezer) ----------
    static final JSONObject COVERS = new JSONObject();   // albumId -> "wait" | "ok" | "none" | "err"
    static final java.util.concurrent.ExecutorService NET = java.util.concurrent.Executors.newFixedThreadPool(3);
    static String coverState() { synchronized (COVERS) { return COVERS.toString(); } }
    static void coverSet(long id, String v) { synchronized (COVERS) { try { COVERS.put(String.valueOf(id), v); } catch (Exception e) { } } }
    static void coverDelete(Context c, long albumId) { coverFile(c, albumId).delete(); coverSet(albumId, "none"); }
    static void coverSearch(final Context c, final long albumId, final String artist, final String album, final String title, final boolean force) {
        if (!force && coverFile(c, albumId).exists()) { coverSet(albumId, "ok"); return; }
        coverSet(albumId, "wait");
        NET.execute(new Runnable() { public void run() {
            try {
                String url = findCover(artist, album, title);
                if (url == null) { coverSet(albumId, "none"); return; }
                byte[] img = get(url);
                Bitmap b = img == null ? null : decodeSampled(img, 600);
                if (b == null) { coverSet(albumId, "none"); return; }
                try (java.io.FileOutputStream o = new java.io.FileOutputStream(coverFile(c, albumId))) { b.compress(Bitmap.CompressFormat.JPEG, 88, o); }
                coverSet(albumId, "ok");
                if (inst != null && cur() >= 0 && cur() < Q.size() && Q.get(cur())[1] == albumId) inst.h.post(new Runnable() { public void run() { if (inst != null) inst.refreshArt(); } });
            } catch (Throwable e) { coverSet(albumId, "err"); }
        } });
    }
    static byte[] get(String u) {
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
            h.setConnectTimeout(12000); h.setReadTimeout(15000); h.setRequestProperty("User-Agent", "Melodie/1.0 (Android)");
            h.setInstanceFollowRedirects(true);
            if (h.getResponseCode() >= 400) return null;
            try (java.io.InputStream in = h.getInputStream()) { ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); return bo.toByteArray(); }
        } catch (Throwable e) { return null; }
    }
    static String norm(String s) { if (s == null) return ""; return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase().replaceAll("\\(.*?\\)|\\[.*?\\]", "").replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim(); }
    static boolean close(String a, String b) { a = norm(a); b = norm(b); return !a.isEmpty() && !b.isEmpty() && (a.contains(b) || b.contains(a)); }
    static String enc(String s) { try { return java.net.URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; } }
    static String findCover(String artist, String album, String title) throws Exception {
        boolean noArtist = artist == null || artist.isEmpty() || artist.startsWith("<") || norm(artist).equals("artiste inconnu");
        boolean noAlbum = album == null || album.isEmpty() || norm(album).equals("album inconnu") || norm(album).equals("download") || norm(album).equals("music");
        String a = noArtist ? "" : artist.split("[;,/&]| feat| ft\\.")[0].trim();
        // 1) iTunes : album
        if (!noAlbum) {
            byte[] r = get("https://itunes.apple.com/search?media=music&entity=album&limit=10&term=" + enc((a + " " + album).trim()));
            if (r != null) {
                JSONArray res = new JSONObject(new String(r, "UTF-8")).optJSONArray("results");
                if (res != null) for (int i = 0; i < res.length(); i++) {
                    JSONObject o = res.getJSONObject(i);
                    if (close(o.optString("collectionName"), album) && (noArtist || close(o.optString("artistName"), a))) return big(o.optString("artworkUrl100"));
                }
            }
        }
        // 2) iTunes : titre du morceau
        if (title != null && !title.isEmpty() && !noArtist) {
            byte[] r = get("https://itunes.apple.com/search?media=music&entity=song&limit=10&term=" + enc(a + " " + title));
            if (r != null) {
                JSONArray res = new JSONObject(new String(r, "UTF-8")).optJSONArray("results");
                if (res != null) for (int i = 0; i < res.length(); i++) {
                    JSONObject o = res.getJSONObject(i);
                    if (close(o.optString("trackName"), title) && close(o.optString("artistName"), a)) return big(o.optString("artworkUrl100"));
                }
            }
        }
        // 3) Deezer
        if (!noArtist) {
            String q = noAlbum ? "artist:\"" + a + "\" track:\"" + title + "\"" : "artist:\"" + a + "\" album:\"" + album + "\"";
            byte[] r = get("https://api.deezer.com/search" + (noAlbum ? "" : "/album") + "?limit=10&q=" + enc(q));
            if (r != null) {
                JSONArray res = new JSONObject(new String(r, "UTF-8")).optJSONArray("data");
                if (res != null) for (int i = 0; i < res.length(); i++) {
                    JSONObject o = res.getJSONObject(i);
                    JSONObject al = noAlbum ? o.optJSONObject("album") : o;
                    JSONObject ar = o.optJSONObject("artist");
                    if (al == null) continue;
                    boolean okA = ar == null || close(ar.optString("name"), a);
                    boolean okT = noAlbum ? close(o.optString("title"), title) : close(al.optString("title"), album);
                    if (okA && okT) { String u = al.optString("cover_xl", al.optString("cover_big", "")); if (!u.isEmpty()) return u; }
                }
            }
        }
        return null;
    }
    static String big(String u) { return u == null || u.isEmpty() ? null : u.replace("100x100bb", "600x600bb"); }

    // ---------- Commandes depuis la page ----------
    static synchronized void setQueue(String json) {
        try {
            JSONArray a = new JSONArray(json);
            Q.clear(); QT.clear();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                Q.add(new long[]{o.getLong("id"), o.optLong("alb", -1), o.optLong("d", 0)});
                QT.add(new String[]{o.optString("t", ""), o.optString("a", ""), o.optString("al", "")});
            }
        } catch (Exception e) { }
    }
    static synchronized void updateQueue(String json, int idx) {
        setQueue(json);
        ORDER.clear();
        for (int i = 0; i < Q.size(); i++) ORDER.add(i);
        if (shuffle && Q.size() > 1) { Collections.shuffle(ORDER, new Random()); ORDER.remove(Integer.valueOf(idx)); ORDER.add(0, idx); pos = 0; }
        else pos = Math.max(0, Math.min(idx, Q.size() - 1));
    }
    static void cmd(Context c, String action, int a, int b) {
        if ("play".equals(action)) {
            buildOrder(a);
            pendingSeek = Math.max(0, b);
        }
        if (inst == null) {
            if ("shuffle".equals(action)) { shuffle = a == 1; return; }
            if ("repeat".equals(action)) { repeat = a; return; }
            if ("stop".equals(action) || "sleep".equals(action) || "seek".equals(action) || "pause".equals(action)) { if ("sleep".equals(action)) sleepAt = 0; return; }
        }
        Intent i = new Intent(c, MusicService.class).setAction(action).putExtra("a", a);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static synchronized void buildOrder(int startIndex) {
        ORDER.clear();
        for (int i = 0; i < Q.size(); i++) ORDER.add(i);
        if (shuffle && Q.size() > 1) {
            Collections.shuffle(ORDER, new Random());
            ORDER.remove(Integer.valueOf(startIndex)); ORDER.add(0, startIndex);
            pos = 0;
        } else pos = Math.max(0, Math.min(startIndex, Q.size() - 1));
    }
    static int cur() { return ORDER.isEmpty() ? -1 : ORDER.get(Math.max(0, Math.min(pos, ORDER.size() - 1))); }
    static synchronized String state() {
        try {
            JSONObject o = new JSONObject();
            int i = cur();
            o.put("alive", alive); o.put("playing", playing); o.put("i", i);
            o.put("id", i >= 0 && i < Q.size() ? Q.get(i)[0] : -1);
            int p = 0, d = 0;
            if (inst != null && inst.mp != null && prepared) { try { p = inst.mp.getCurrentPosition(); d = inst.mp.getDuration(); } catch (Exception e) { } }
            o.put("pos", p); o.put("dur", d); o.put("n", Q.size());
            o.put("shuffle", shuffle); o.put("repeat", repeat); o.put("sleep", sleepAt);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    // ---------- Service ----------
    @Override
    public void onCreate() {
        super.onCreate();
        inst = this; alive = true;
        am = (AudioManager) getSystemService(AUDIO_SERVICE);
        ms = new MediaSessionCompat(this, "Melodie");
        ms.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { next(true); }
            @Override public void onSkipToPrevious() { prev(); }
            @Override public void onSeekTo(long p) { seek((int) p); }
            @Override public void onStop() { stopAll(); }
        });
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        ms.setSessionActivity(PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        ms.setActive(true);
        registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("musique", "Lecture en cours", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        notifyNow(); // obligatoire très vite après startForegroundService
        String a = intent == null ? null : intent.getAction();
        int x = intent == null ? 0 : intent.getIntExtra("a", 0);
        if (a == null) return START_NOT_STICKY;
        switch (a) {
            case "play": load(true); break;
            case "toggle": if (playing) pause(); else resume(); break;
            case "pause": pause(); break;
            case "resume": resume(); break;
            case "next": next(true); break;
            case "prev": prev(); break;
            case "seek": seek(x); break;
            case "jump": synchronized (MusicService.class) { int k = ORDER.indexOf(x); if (k >= 0) pos = k; else buildOrder(x); } pendingSeek = 0; load(true); break;
            case "shuffle": setShuffle(x == 1); break;
            case "repeat": repeat = x; break;
            case "sleep": sleepAt = x > 0 ? System.currentTimeMillis() + x * 60000L : 0; h.removeCallbacks(sleeper); if (x > 0) h.postDelayed(sleeper, 5000); break;
            case "stop": stopAll(); break;
        }
        return START_NOT_STICKY;
    }
    static synchronized void setShuffle(boolean on) {
        shuffle = on;
        int c = cur();
        if (c < 0) return;
        ORDER.clear();
        for (int i = 0; i < Q.size(); i++) ORDER.add(i);
        if (on) { Collections.shuffle(ORDER, new Random()); ORDER.remove(Integer.valueOf(c)); ORDER.add(0, c); pos = 0; }
        else pos = c;
    }
    private void load(boolean start) {
        int i = cur();
        if (i < 0 || i >= Q.size()) { stopAll(); return; }
        prepared = false;
        try {
            if (mp == null) {
                mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                mp.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
                mp.setOnPreparedListener(this); mp.setOnCompletionListener(this); mp.setOnErrorListener(this);
            } else mp.reset();
            Uri u = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, Q.get(i)[0]);
            mp.setDataSource(getApplicationContext(), u);
            playing = start;
            art = artBitmap(this, Q.get(i)[1], Q.get(i)[0], 512);
            String[] t = QT.get(i);
            ms.setMetadata(new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, t[0]).putString(MediaMetadataCompat.METADATA_KEY_ARTIST, t[1])
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, t[2]).putLong(MediaMetadataCompat.METADATA_KEY_DURATION, Q.get(i)[2])
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art).build());
            publishWidget();
            mp.prepareAsync();
            notifyNow();
        } catch (Exception e) { h.postDelayed(new Runnable() { public void run() { next(false); } }, 300); }
    }
    void refreshArt() {
        int i = cur(); if (i < 0 || i >= Q.size()) return;
        art = artBitmap(this, Q.get(i)[1], Q.get(i)[0], 512);
        String[] t = QT.get(i);
        ms.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, t[0]).putString(MediaMetadataCompat.METADATA_KEY_ARTIST, t[1])
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, t[2]).putLong(MediaMetadataCompat.METADATA_KEY_DURATION, Q.get(i)[2])
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art).build());
        wArtKey = ""; publishWidget();
        notifyNow();
    }
    @Override public void onPrepared(MediaPlayer m) {
        prepared = true;
        applyVolume();
        if (pendingSeek > 0) { try { m.seekTo(pendingSeek); } catch (Exception e) { } pendingSeek = 0; }
        if (playing && focus()) m.start(); else playing = false;
        updateState(); notifyNow();
    }
    @Override public void onCompletion(MediaPlayer m) {
        if (repeat == 2) { m.seekTo(0); m.start(); return; }
        next(false);
    }
    @Override public boolean onError(MediaPlayer m, int what, int extra) { prepared = false; h.postDelayed(new Runnable() { public void run() { next(false); } }, 500); return true; }
    private boolean focus() {
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (afr == null) afr = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setOnAudioFocusChangeListener(this)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).build();
            r = am.requestAudioFocus(afr);
        } else r = am.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        return r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }
    @Override public void onAudioFocusChange(int f) {
        if (mp == null) return;
        if (f == AudioManager.AUDIOFOCUS_LOSS) { resumeOnFocus = false; pause(); }
        else if (f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { if (playing) { resumeOnFocus = true; pause(); } }
        else if (f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) { if (playing) mp.setVolume(0.25f * MelodieVolume.baseVol, 0.25f * MelodieVolume.baseVol); }
        else if (f == AudioManager.AUDIOFOCUS_GAIN) { mp.setVolume(MelodieVolume.baseVol, MelodieVolume.baseVol); if (resumeOnFocus) { resumeOnFocus = false; resume(); } }
    }
    // Volume égal entre les morceaux (MelodieVolume) : mesure + correction du morceau prêt, mesure à l'avance des 2 suivants
    void applyVolume() {
        if (mp == null || !prepared) return;
        int i = cur(); if (i < 0 || i >= Q.size()) return;
        long[] up;
        synchronized (MusicService.class) {
            int n = Math.max(0, Math.min(2, ORDER.size() - pos - 1));
            up = new long[n];
            for (int k = 0; k < n; k++) { int j = ORDER.get(pos + 1 + k); up[k] = j < Q.size() ? Q.get(j)[0] : -1; }
        }
        try { MelodieVolume.apply(this, mp, Q.get(i)[0], up); } catch (Throwable t) { }
    }
    void pause() { if (mp != null && prepared && mp.isPlaying()) mp.pause(); playing = false; updateState(); notifyNow(); }
    void resume() {
        if (mp == null || cur() < 0) { if (cur() >= 0) load(true); return; }
        if (!prepared) { playing = true; return; }
        if (focus()) { mp.start(); playing = true; }
        updateState(); notifyNow();
    }
    void next(boolean user) {
        synchronized (MusicService.class) {
            if (ORDER.isEmpty()) { stopAll(); return; }
            if (pos + 1 < ORDER.size()) pos++;
            else if (repeat == 1 || user) pos = 0;
            else { pos = 0; pendingSeek = 0; load(false); return; }
        }
        pendingSeek = 0; load(true);
    }
    void prev() {
        if (mp != null && prepared && mp.getCurrentPosition() > 4000) { seek(0); return; }
        synchronized (MusicService.class) { pos = pos > 0 ? pos - 1 : (repeat == 1 ? ORDER.size() - 1 : 0); }
        pendingSeek = 0; load(true);
    }
    void seek(int p) { if (mp != null && prepared) { mp.seekTo(p); updateState(); } else pendingSeek = p; }
    void updateState() {
        long p = 0; try { if (mp != null && prepared) p = mp.getCurrentPosition(); } catch (Exception e) { }
        ms.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_SEEK_TO | PlaybackStateCompat.ACTION_STOP)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, p, 1f).build());
        publishWidget();
    }
    // Morceau en cours et pochette pour la tuile Musique de Socle (canal privé WidgetProvider)
    private String wArtKey = "", wArt = "";
    void publishWidget() {
        try {
            int i = cur(); if (i < 0 || i >= Q.size() || i >= QT.size()) return;
            String[] t = QT.get(i);
            String key = String.valueOf(Q.get(i)[0]);
            if (!key.equals(wArtKey)) {
                wArtKey = key; wArt = "";
                if (art != null) {
                    Bitmap sc = Bitmap.createScaledBitmap(art, 192, Math.max(1, Math.round(192f * art.getHeight() / art.getWidth())), true);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    sc.compress(Bitmap.CompressFormat.JPEG, 82, bo);
                    wArt = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                }
            }
            long pos = 0; try { if (mp != null && prepared) pos = mp.getCurrentPosition(); } catch (Exception e) { }
            JSONObject m = new JSONObject();
            m.put("title", t[0]); m.put("artist", t[1]); m.put("album", t[2]); m.put("dur", Q.get(i)[2]);
            m.put("pos", pos); m.put("playing", playing); m.put("at", System.currentTimeMillis()); m.put("art", wArt);
            WidgetProvider.put(this, new JSONObject().put("music", m).toString());
        } catch (Throwable e) { }
    }
    private PendingIntent act(String a, int rc) {
        return PendingIntent.getService(this, rc, new Intent(this, MusicService.class).setAction(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    void notifyNow() {
        int i = cur();
        String[] t = i >= 0 && i < QT.size() ? QT.get(i) : new String[]{"Mélodie", "", ""};
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "musique")
            .setSmallIcon(getApplicationInfo().icon).setContentTitle(t[0]).setContentText(t[1] + (t[2].isEmpty() ? "" : " · " + t[2]))
            .setLargeIcon(art).setContentIntent(ms.getController().getSessionActivity()).setDeleteIntent(act("stop", 15))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOnlyAlertOnce(true).setShowWhen(false).setOngoing(playing)
            .addAction(android.R.drawable.ic_media_previous, "Précédent", act("prev", 11))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Lecture", act("toggle", 12))
            .addAction(android.R.drawable.ic_media_next, "Suivant", act("next", 13))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Fermer", act("stop", 14))
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle().setMediaSession(ms.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        Notification n = b.build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(9401, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK); else startForeground(9401, n);
        } catch (Exception e) { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(9401, n); }
        if (!playing && Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_DETACH);
    }
    void stopAll() {
        playing = false; publishWidget(); prepared = false;
        if (mp != null) { try { mp.release(); } catch (Exception e) { } mp = null; }
        if (Build.VERSION.SDK_INT >= 26 && afr != null) am.abandonAudioFocusRequest(afr); else am.abandonAudioFocus(this);
        stopForeground(true);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(9401);
        stopSelf();
    }
    @Override public void onTaskRemoved(Intent i) { if (!playing) stopAll(); super.onTaskRemoved(i); }
    @Override public void onDestroy() {
        alive = false; inst = null; playing = false; prepared = false;
        h.removeCallbacksAndMessages(null);
        try { unregisterReceiver(noisy); } catch (Exception e) { }
        if (mp != null) { try { mp.release(); } catch (Exception e) { } mp = null; }
        try { MelodieVolume.release(); } catch (Throwable t) { }
        ms.setActive(false); ms.release();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
JAVA
sed -i "s/__PKG__/$PKG/" "$MS"
# Veille réglementaire : recherche des nouveaux textes 2 fois par jour, même application fermée
VW="$(dirname "$F")/VeilleWorker.java"
cat > "$VW" <<'JAVA'
package __PKG__;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

public class VeilleWorker extends Worker {
    public VeilleWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    // ---- téléchargement pour la page (sans les blocages du navigateur) ----
    static final HashMap<String, String> RES = new HashMap<String, String>();
    static final ExecutorService NET = Executors.newFixedThreadPool(3);
    static void fetchAsync(final String key, final String url) {
        synchronized (RES) { RES.put(key, "__wait__"); }
        NET.execute(new Runnable() { public void run() { String t = get(url); synchronized (RES) { RES.put(key, t == null ? "__err__" : t); } } });
    }
    static String take(String key) { synchronized (RES) { String v = RES.get(key); if (v != null && !"__wait__".equals(v)) RES.remove(key); return v; } }
    static String get(String u) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(15000); h.setReadTimeout(20000);
            h.setRequestProperty("User-Agent", "QHSE-Pro/1.0 (Android; veille reglementaire)");
            h.setRequestProperty("Accept", "application/atom+xml, application/rss+xml, application/xml, text/xml, */*");
            h.setInstanceFollowRedirects(true);
            int code = h.getResponseCode();
            if (code >= 300 && code < 400) { String loc = h.getHeaderField("Location"); if (loc != null) return get(new URL(new URL(u), loc).toString()); }
            if (code >= 400) return null;
            try (InputStream in = h.getInputStream()) { ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > 4000000) break; } return bo.toString("UTF-8"); }
        } catch (Throwable e) { return null; }
    }

    // ---- réglages envoyés par la page ----
    static boolean setup(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences sp = c.getSharedPreferences("magveille", Context.MODE_PRIVATE);
            JSONArray seen = o.optJSONArray("seen");
            HashSet<String> s = new HashSet<String>(sp.getStringSet("seen", new HashSet<String>()));
            if (seen != null) for (int i = 0; i < seen.length(); i++) s.add(seen.getString(i));
            sp.edit().putBoolean("on", o.optBoolean("on", true)).putString("feeds", String.valueOf(o.optJSONArray("feeds")))
                .putString("inc", o.optString("inc", "")).putString("exc", o.optString("exc", "")).putStringSet("seen", trim(s)).apply();
            WorkManager wm = WorkManager.getInstance(c);
            if (o.optBoolean("on", true)) {
                Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
                PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(VeilleWorker.class, 12, TimeUnit.HOURS).setConstraints(cs).build();
                wm.enqueueUniquePeriodicWork("magveille", ExistingPeriodicWorkPolicy.KEEP, r);
                return true;
            } else { wm.cancelUniqueWork("magveille"); return false; }
        } catch (Exception e) { return false; }
    }
    static HashSet<String> trim(HashSet<String> s) { if (s.size() <= 3000) return s; HashSet<String> t = new HashSet<String>(); int i = 0; for (String x : s) { if (i++ >= s.size() - 2500) t.add(x); } return t; }
    static String takeNew(Context c) {
        SharedPreferences sp = c.getSharedPreferences("magveille", Context.MODE_PRIVATE);
        String v = sp.getString("new", "[]"); sp.edit().putString("new", "[]").apply(); return v;
    }
    static String norm(String s) { return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase().replace('’', '\'').replace('‘', '\''); }
    static String unesc(String s) {
        if (s == null) return "";
        s = s.replaceAll("(?s)<!\\[CDATA\\[(.*?)\\]\\]>", "$1");
        s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&#39;", "'").replace("&nbsp;", " ");
        Matcher m = Pattern.compile("&#(x?)([0-9a-fA-F]+);").matcher(s); StringBuffer b = new StringBuffer();
        while (m.find()) { int cp; try { cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16); } catch (Exception e) { cp = 32; } m.appendReplacement(b, Matcher.quoteReplacement(new String(Character.toChars(cp)))); }
        m.appendTail(b);
        return b.toString().replace("&amp;", "&").replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
    }
    static String tag(String block, String name) {
        Matcher m = Pattern.compile("(?s)<" + name + "(?:\\s[^>]*)?>(.*?)</" + name + ">").matcher(block);
        return m.find() ? unesc(m.group(1)) : "";
    }

    @NonNull @Override
    public Result doWork() {
        Context c = getApplicationContext();
        SharedPreferences sp = c.getSharedPreferences("magveille", Context.MODE_PRIVATE);
        if (!sp.getBoolean("on", true)) return Result.success();
        try {
            JSONArray feeds = new JSONArray(sp.getString("feeds", "[]"));
            Pattern inc = Pattern.compile(sp.getString("inc", "x^"));
            String excS = sp.getString("exc", "");
            Pattern exc = excS.isEmpty() ? null : Pattern.compile(excS);
            HashSet<String> seen = new HashSet<String>(sp.getStringSet("seen", new HashSet<String>()));
            JSONArray fresh = new JSONArray(sp.getString("new", "[]"));
            int added = 0; StringBuilder first = new StringBuilder();
            Pattern block = Pattern.compile("(?s)<(entry|item)(?:\\s[^>]*)?>(.*?)</\\1>");
            Pattern href = Pattern.compile("<link[^>]*href=\"([^\"]+)\"");
            for (int i = 0; i < feeds.length(); i++) {
                String xml = get(feeds.getString(i));
                if (xml == null) continue;
                Matcher m = block.matcher(xml);
                while (m.find()) {
                    String b = m.group(2);
                    String title = tag(b, "title");
                    String link = tag(b, "link");
                    Matcher hm = href.matcher(b); if (link.isEmpty() && hm.find()) link = hm.group(1).replace("&amp;", "&");
                    String id = tag(b, "id"); if (id.isEmpty()) id = tag(b, "guid"); if (id.isEmpty()) id = link;
                    if (title.isEmpty() || id.isEmpty() || seen.contains(id)) continue;
                    seen.add(id);
                    String n = " " + norm(title) + " ";
                    if (exc != null && exc.matcher(n).find()) continue;
                    if (!inc.matcher(n).find()) continue;
                    String date = tag(b, "updated"); if (date.isEmpty()) date = tag(b, "published"); if (date.isEmpty()) date = tag(b, "dc:date");
                    JSONObject o = new JSONObject();
                    o.put("id", id); o.put("title", title); o.put("link", link); o.put("date", date.length() >= 10 ? date.substring(0, 10) : "");
                    o.put("src", feeds.getString(i).contains("service-public") ? "Service-public Entreprendre" : "Journal officiel");
                    fresh.put(o); added++;
                    if (added <= 3) first.append(added > 1 ? "\n• " : "• ").append(title.length() > 110 ? title.substring(0, 108) + "…" : title);
                }
            }
            while (fresh.length() > 200) fresh.remove(0);
            sp.edit().putStringSet("seen", trim(seen)).putString("new", fresh.toString()).apply();
            if (added > 0) MainActivity.postNotif(c, "📜 Veille réglementaire : " + added + (added > 1 ? " nouveaux textes" : " nouveau texte"), first.toString(), 7301);
        } catch (Exception e) { return Result.retry(); }
        return Result.success();
    }
}
JAVA
sed -i "s/__PKG__/$PKG/" "$VW"
# Météo du chantier : alerte météo même application fermée (Échafaudage)
cp scripts/MeteoWorker.java "$(dirname "$F")/MeteoWorker.java"; sed -i "s/__PKG__/$PKG/" "$(dirname "$F")/MeteoWorker.java"
# Gestionnaire de fichiers et nettoyage (application Rangement)
FSV="$(dirname "$F")/FileService.java"
cp scripts/FileService.java "$FSV"
sed -i "s/__PKG__/$PKG/" "$FSV"
# Réveil, lever de soleil et endormissement (application Aube)
for J in $(ls scripts/*Bridge.java 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\.java$//' | grep -vx 'PdfBridge'); do cp scripts/$J.java "$(dirname "$F")/$J.java"; sed -i "s/__PKG__/$PKG/" "$(dirname "$F")/$J.java"; done
for J in AlarmService AlarmReceiver WallpaperJob WallpaperTile LauncherService LauncherA11y LauncherMedia WidgetProvider SauvegardeJob PhotoCamera EcranPlayer DictaService MeteoPersoJob MelodieVolume; do cp scripts/$J.java "$(dirname "$F")/$J.java"; sed -i "s/__PKG__/$PKG/" "$(dirname "$F")/$J.java"; done
# Bibliothèque des tâches de fond
G=android/app/build.gradle
grep -q "androidx.work:work-runtime" "$G" || sed -i '0,/^dependencies {/s//dependencies {\n    implementation "androidx.work:work-runtime:2.9.1"/' "$G"
grep -q "androidx.media:media" "$G" || sed -i '0,/^dependencies {/s//dependencies {\n    implementation "androidx.media:media:1.7.0"/' "$G"
grep -n "work-runtime\|androidx.media" "$G"
# Fournisseur de fichiers pour le partage et l'e-mail
mkdir -p android/app/src/main/res/xml
cat > android/app/src/main/res/xml/file_paths.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="cache" path="." />
    <files-path name="files" path="." />
    <external-path name="external" path="." />
    <root-path name="root" path="." />
</paths>
XML
MAN=android/app/src/main/AndroidManifest.xml
if ! grep -q "fileprovider" "$MAN"; then
  sed -i 's#</application>#    <provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" /></provider>\n    </application>#' "$MAN"
fi
grep -n "fileprovider" "$MAN"
# Droits : position (photos géolocalisées, météo), notifications
if ! grep -q "TrackService" "$MAN"; then
  sed -i 's#</application>#    <service android:name=".TrackService" android:foregroundServiceType="location" android:exported="false" />\n    </application>#' "$MAN"
fi
if [ "$APP" = "musique" ] && ! grep -q "MusicService" "$MAN"; then
  sed -i 's#</application>#    <service android:name=".MusicService" android:foregroundServiceType="mediaPlayback" android:exported="false" />\n    </application>#' "$MAN"
  for P in READ_MEDIA_AUDIO WAKE_LOCK FOREGROUND_SERVICE_MEDIA_PLAYBACK; do
    sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"
  done
  sed -i 's#</manifest>#    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n</manifest>#' "$MAN"
fi
if [ "$APP" = "fichiers" ] && ! grep -q "MANAGE_EXTERNAL_STORAGE" "$MAN"; then
  for P in MANAGE_EXTERNAL_STORAGE READ_MEDIA_IMAGES READ_MEDIA_VIDEO READ_MEDIA_AUDIO QUERY_ALL_PACKAGES REQUEST_DELETE_PACKAGES REQUEST_INSTALL_PACKAGES; do
    sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"
  done
  sed -i 's#</manifest>#    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n</manifest>#' "$MAN"
  sed -i '0,/<application/s//<application android:requestLegacyExternalStorage="true"/' "$MAN"
fi
if [ "$APP" = "reveil" ] && ! grep -q "AlarmService" "$MAN"; then
  sed -i 's#</application>#    <service android:name=".AlarmService" android:foregroundServiceType="mediaPlayback" android:exported="false" />\n        <receiver android:name=".AlarmReceiver" android:exported="true"><intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /><action android:name="android.intent.action.TIME_SET" /><action android:name="android.intent.action.TIMEZONE_CHANGED" /><action android:name="android.intent.action.MY_PACKAGE_REPLACED" /></intent-filter></receiver>\n    </application>#' "$MAN"
  for P in READ_MEDIA_AUDIO WAKE_LOCK FOREGROUND_SERVICE_MEDIA_PLAYBACK USE_EXACT_ALARM USE_FULL_SCREEN_INTENT RECEIVE_BOOT_COMPLETED VIBRATE REQUEST_IGNORE_BATTERY_OPTIMIZATIONS; do
    sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"
  done
  sed -i 's#</manifest>#    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />\n</manifest>#' "$MAN"
fi
# Canal privé des tuiles Socle (toutes les applis MAG, accès réservé aux applis signées avec la même clé)
if ! grep -q "permission.WIDGET" "$MAN"; then
  sed -i 's#<application#<permission android:name="fr.magformation13.permission.WIDGET" android:protectionLevel="signature" />\n    <uses-permission android:name="fr.magformation13.permission.WIDGET" />\n    <application#' "$MAN"
  sed -i 's#</application>#    <provider android:name=".WidgetProvider" android:authorities="${applicationId}.widget" android:exported="true" android:permission="fr.magformation13.permission.WIDGET" />\n    </application>#' "$MAN"
fi
# Socle : écran d'accueil (catégorie HOME, agenda, contacts, service d'accessibilité pour les gestes)
if [ "$APP" = "accueil" ] && ! grep -q "category.HOME" "$MAN"; then
  sed -i -E 's#<category android:name="android.intent.category.LAUNCHER" ?/>#<category android:name="android.intent.category.LAUNCHER" />\n                <category android:name="android.intent.category.HOME" />\n                <category android:name="android.intent.category.DEFAULT" />#' "$MAN"
  mkdir -p android/app/src/main/res/xml android/app/src/main/res/values
  cat > android/app/src/main/res/xml/socle_a11y.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAnnouncement"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="1000"
    android:canRetrieveWindowContent="false"
    android:description="@string/socle_a11y_desc" />
XML
  cat > android/app/src/main/res/values/socle.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="socle_a11y_desc">Permet à Socle de verrouiller l’écran par un double appui et d’ouvrir le volet des notifications en glissant vers le bas. Socle ne lit jamais le contenu de l’écran.</string>
</resources>
XML
  sed -i 's#</application>#    <service android:name=".LauncherA11y" android:label="Socle : gestes" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" android:exported="false"><intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter><meta-data android:name="android.accessibilityservice" android:resource="@xml/socle_a11y" /></service>\n        <service android:name=".LauncherMedia" android:label="Socle : musique" android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" android:exported="true"><intent-filter><action android:name="android.service.notification.NotificationListenerService" /></intent-filter></service>\n    </application>#' "$MAN"
  sed -i 's#</manifest>#    <queries><intent><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent></queries>\n</manifest>#' "$MAN"
  for P in READ_CALENDAR READ_CONTACTS EXPAND_STATUS_BAR READ_MEDIA_IMAGES READ_MEDIA_VISUAL_USER_SELECTED; do
    grep -q "android.permission.$P" "$MAN" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"
  done
  grep -n "category" "$MAN"
fi
# Agenda, Contacts, Galerie : autorisations et « Ouvrir avec » (filtres d'intent sur MainActivity)
addperm() { for P in "$@"; do grep -q "android.permission.$P\"" "$MAN" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"; done; }
addfilters() { python3 - "$MAN" "$1" <<'PYM'
import sys
p, x = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if x not in s:
    i = s.index('</activity>')
    s = s[:i] + x + '\n        ' + s[i:]
    open(p, 'w', encoding='utf-8').write(s)
PYM
}
if [ "$APP" = "agenda" ]; then
  addperm READ_CALENDAR WRITE_CALENDAR
  addfilters '<intent-filter><action android:name="android.intent.action.VIEW"/><action android:name="android.intent.action.EDIT"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="vnd.android.cursor.item/event"/></intent-filter><intent-filter><action android:name="android.intent.action.INSERT"/><action android:name="android.intent.action.EDIT"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="vnd.android.cursor.dir/event"/></intent-filter><intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><data android:scheme="content" android:host="com.android.calendar" android:pathPrefix="/time"/></intent-filter><intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="text/calendar"/></intent-filter>'
fi
if [ "$APP" = "contacts" ]; then
  addperm READ_CONTACTS WRITE_CONTACTS
  addfilters '<intent-filter><action android:name="android.intent.action.VIEW"/><action android:name="android.intent.action.EDIT"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="vnd.android.cursor.item/contact"/><data android:mimeType="vnd.android.cursor.item/person"/><data android:mimeType="vnd.android.cursor.item/raw_contact"/></intent-filter><intent-filter><action android:name="android.intent.action.INSERT"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="vnd.android.cursor.dir/contact"/><data android:mimeType="vnd.android.cursor.dir/person"/><data android:mimeType="vnd.android.cursor.dir/raw_contact"/></intent-filter><intent-filter><action android:name="android.intent.action.INSERT_OR_EDIT"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="vnd.android.cursor.item/contact"/><data android:mimeType="vnd.android.cursor.item/person"/><data android:mimeType="vnd.android.cursor.item/raw_contact"/></intent-filter><intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="text/x-vcard"/><data android:mimeType="text/vcard"/></intent-filter>'
  grep -q 'com.whatsapp"' "$MAN" || sed -i 's#</manifest>#    <queries><package android:name="com.whatsapp" /><package android:name="com.whatsapp.w4b" /></queries>\n</manifest>#' "$MAN"
fi
if [ "$APP" = "mesure" ]; then
  addperm RECORD_AUDIO CAMERA VIBRATE
fi
if [ "$APP" = "scan" ]; then
  addperm CAMERA
  addfilters '<intent-filter><action android:name="android.intent.action.SEND"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="image/*"/><data android:mimeType="application/pdf"/></intent-filter><intent-filter><action android:name="android.intent.action.SEND_MULTIPLE"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="image/*"/><data android:mimeType="application/pdf"/></intent-filter>'
fi
# Photo et Écran : activités natives (appareil photo, lecteur vidéo) ajoutées dans <application>
addactivity() { python3 - "$MAN" "$1" <<'PYM'
import sys
p, x = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if x.split('"')[1] not in s:
    i = s.rindex('</application>')
    s = s[:i] + '    ' + x + '\n    ' + s[i:]
    open(p, 'w', encoding='utf-8').write(s)
PYM
}
addraw() { python3 - "$MAN" "$1" <<'PYM'
import sys
p, x = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if x not in s:
    i = s.rindex('</manifest>')
    s = s[:i] + '    ' + x + '\n' + s[i:]
    open(p, 'w', encoding='utf-8').write(s)
PYM
}
if [ "$APP" = "photo" ]; then
  addperm CAMERA RECORD_AUDIO ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION ACCESS_MEDIA_LOCATION READ_MEDIA_IMAGES READ_MEDIA_VIDEO
  grep -q 'READ_EXTERNAL_STORAGE' "$MAN" || addraw '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" /><uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />'
  addraw '<uses-feature android:name="android.hardware.camera.any" android:required="false" /><queries><intent><action android:name="android.media.action.STILL_IMAGE_CAMERA" /></intent></queries>'
  addactivity '<activity android:name=".PhotoCamera" android:exported="true" android:label="Appareil photo" android:screenOrientation="portrait" android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize" android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" android:windowSoftInputMode="adjustPan"><intent-filter><action android:name="android.media.action.STILL_IMAGE_CAMERA" /><category android:name="android.intent.category.DEFAULT" /></intent-filter><intent-filter><action android:name="android.media.action.IMAGE_CAPTURE" /><category android:name="android.intent.category.DEFAULT" /></intent-filter></activity>'
fi
if [ "$APP" = "ecran" ]; then
  addperm INTERNET READ_MEDIA_VIDEO
  grep -q 'READ_EXTERNAL_STORAGE' "$MAN" || addraw '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />'
  addraw '<queries><package android:name="com.google.android.youtube" /><package android:name="fr.francetv.pluzz" /><package android:name="tv.arte.plus7" /><package android:name="fr.tf1.mytf1" /><package android:name="fr.m6.m6replay" /><package android:name="com.dotscreen.tv5mondeplus.mobile" /><package android:name="fr.artestudio.arteradio.mobile" /><package android:name="fr.anidn" /><package android:name="com.crunchyroll.crunchyroid" /><package android:name="com.netflix.mediaclient" /><package android:name="com.amazon.avod.thirdpartyclient" /><package android:name="com.disney.disneyplus" /><package android:name="tv.pluto.android" /><package android:name="fr.francetv.zouzous" /><package android:name="fr.magformation13.ondes" /><package android:name="fr.magformation13.galerie" /><intent><action android:name="android.intent.action.VIEW" /><data android:scheme="market" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="video/*" /></intent></queries>'
  addactivity '<activity android:name=".EcranPlayer" android:label="Écran" android:exported="true" android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" android:screenOrientation="sensorLandscape" android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden|navigation|uiMode|density" android:supportsPictureInPicture="true" android:resizeableActivity="true" android:launchMode="singleTask" android:taskAffinity="ecran.lecteur" android:autoRemoveFromRecents="true"><intent-filter android:label="Ouvrir avec Écran"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><data android:scheme="content" android:mimeType="video/*" /><data android:scheme="file" android:mimeType="video/*" /></intent-filter><intent-filter android:label="Ouvrir avec Écran"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="http" android:mimeType="video/*" /><data android:scheme="https" android:mimeType="video/*" /><data android:scheme="https" android:mimeType="application/x-mpegURL" /><data android:scheme="https" android:mimeType="application/vnd.apple.mpegurl" /></intent-filter></activity>'
fi
if [ "$APP" = "urgence" ]; then
  addperm SEND_SMS CALL_PHONE VIBRATE WAKE_LOCK USE_FULL_SCREEN_INTENT
  addraw '<uses-feature android:name="android.hardware.telephony" android:required="false" /><uses-feature android:name="android.hardware.camera.flash" android:required="false" /><queries><intent><action android:name="android.intent.action.SENDTO" /><data android:scheme="smsto" /></intent><intent><action android:name="android.intent.action.DIAL" /><data android:scheme="tel" /></intent><intent><action android:name="android.intent.action.PICK" /><data android:mimeType="vnd.android.cursor.dir/phone_v2" /></intent></queries>'
  addactivity '<activity android:name=".UrgenceBridge$Fiche" android:label="Infos médicales" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true" android:launchMode="singleTask" android:taskAffinity="urgence.fiche" android:excludeFromRecents="true" android:screenOrientation="portrait" android:theme="@android:style/Theme.Material.NoActionBar" />'
  addactivity '<service android:name=".UrgenceBridge$Veille" android:foregroundServiceType="location" android:exported="false" />'
fi
if [ "$APP" = "coffre" ]; then
  addperm USE_BIOMETRIC
  grep -q 'USE_FINGERPRINT' "$MAN" || addraw '<uses-permission android:name="android.permission.USE_FINGERPRINT" android:maxSdkVersion="28" />'
  # Le coffre ne part jamais dans une sauvegarde Google
  sed -i 's/android:allowBackup="true"/android:allowBackup="false"/' "$MAN"
  grep -q 'android:allowBackup=' "$MAN" || sed -i '0,/<application/s//<application android:allowBackup="false"/' "$MAN"
  grep -q 'fullBackupContent' "$MAN" || sed -i '0,/<application/s//<application android:fullBackupContent="false"/' "$MAN"
fi
if [ "$APP" = "liseuse" ]; then
  addperm INTERNET
  addraw '<queries><intent><action android:name="android.intent.action.TTS_SERVICE" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="text/plain" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent><package android:name="fr.magformation13.fichiers" /><package android:name="fr.magformation13.socle" /></queries>'
  addfilters '<intent-filter android:label="Ouvrir avec Liseuse"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="content" /><data android:scheme="file" /><data android:mimeType="application/epub+zip" /><data android:mimeType="application/pdf" /></intent-filter><intent-filter android:label="Ouvrir avec Liseuse"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><data android:scheme="content" /><data android:scheme="file" /><data android:host="*" /><data android:mimeType="application/octet-stream" /><data android:pathPattern=".*\\.epub" /><data android:pathPattern=".*\\..*\\.epub" /><data android:pathPattern=".*\\..*\\..*\\.epub" /></intent-filter><intent-filter android:label="Liseuse"><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/epub+zip" /><data android:mimeType="application/pdf" /></intent-filter>'
fi
if [ "$APP" = "qr" ]; then
  addperm CAMERA VIBRATE ACCESS_WIFI_STATE CHANGE_WIFI_STATE ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION
  grep -q 'WRITE_EXTERNAL_STORAGE' "$MAN" || addraw '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />'
  addraw '<uses-feature android:name="android.hardware.camera.any" android:required="false" /><uses-feature android:name="android.hardware.wifi" android:required="false" /><queries><intent><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="https" /></intent><intent><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="http" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:scheme="geo" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:scheme="market" /></intent><intent><action android:name="android.intent.action.DIAL" /><data android:scheme="tel" /></intent><intent><action android:name="android.intent.action.SENDTO" /><data android:scheme="mailto" /></intent><intent><action android:name="android.intent.action.SENDTO" /><data android:scheme="smsto" /></intent><intent><action android:name="android.intent.action.INSERT" /><data android:mimeType="vnd.android.cursor.dir/raw_contact" /></intent><intent><action android:name="android.intent.action.INSERT" /><data android:mimeType="vnd.android.cursor.dir/event" /></intent><intent><action android:name="android.intent.action.WEB_SEARCH" /></intent><intent><action android:name="android.settings.WIFI_ADD_NETWORKS" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="image/png" /></intent></queries>'
  addfilters '<intent-filter android:label="Créer un QR code"><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="text/plain" /></intent-filter>'
fi
if [ "$APP" = "reseau" ]; then
  addperm INTERNET ACCESS_NETWORK_STATE ACCESS_WIFI_STATE CHANGE_WIFI_STATE CHANGE_WIFI_MULTICAST_STATE ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION READ_PHONE_STATE
  addraw '<uses-feature android:name="android.hardware.wifi" android:required="false" /><uses-feature android:name="android.hardware.telephony" android:required="false" /><uses-feature android:name="android.hardware.location" android:required="false" /><queries><intent><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="https" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="text/plain" /></intent><intent><action android:name="android.settings.WIFI_ADD_NETWORKS" /></intent><intent><action android:name="android.settings.panel.action.WIFI" /></intent></queries>'
fi
# Lecteur PDF : « Ouvrir avec » / « Partager » pour les PDF, synthèse vocale, ouverture d'Atelier PDF (LecteurBridge.java),
# protection de « ma signature » par empreinte / visage / code du téléphone (USE_BIOMETRIC, BiometricPrompt)
if [ "$APP" = "lecteur" ]; then
  addperm USE_BIOMETRIC
  addraw '<queries><intent><action android:name="android.intent.action.TTS_SERVICE" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="application/pdf" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="application/pdf" /></intent><package android:name="fr.magformation13.pdf" /><package android:name="fr.magformation13.socle" /></queries>'
  addfilters '<intent-filter android:label="Ouvrir avec Lecteur PDF"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="content" /><data android:scheme="file" /><data android:mimeType="application/pdf" /><data android:mimeType="application/x-pdf" /></intent-filter><intent-filter android:label="Ouvrir avec Lecteur PDF"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><data android:scheme="content" /><data android:scheme="file" /><data android:host="*" /><data android:mimeType="application/octet-stream" /><data android:pathPattern=".*\\.pdf" /><data android:pathPattern=".*\\..*\\.pdf" /><data android:pathPattern=".*\\..*\\..*\\.pdf" /></intent-filter><intent-filter android:label="Ouvrir avec Lecteur PDF"><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/pdf" /></intent-filter>'
fi
# Atelier PDF : reconnaissance de texte hors ligne (ML Kit, modèle latin embarqué, sans Google Play Services),
# mot de passe (PDFBox-Android, Apache 2.0), PDF reçus par « Partager » (depuis Lecteur PDF, Fichiers…) : PdfBridge.java,
# copié ici seulement car il dépend de ces deux bibliothèques (ajoutées à cette appli seule).
if [ "$APP" = "pdf" ]; then
  cp scripts/PdfBridge.java "$(dirname "$F")/PdfBridge.java"; sed -i "s/__PKG__/$PKG/" "$(dirname "$F")/PdfBridge.java"
  grep -q "com.google.mlkit:text-recognition" "$G" || sed -i '0,/^dependencies {/s//dependencies {\n    implementation "com.google.mlkit:text-recognition:16.0.1"\n    implementation "com.tom-roush:pdfbox-android:2.0.27.0"/' "$G"
  # ML Kit demande Android 6 (API 23) au minimum ; le téléphone visé est sous Android 15
  sed -i 's/minSdkVersion = 2[0-2]$/minSdkVersion = 23/' android/variables.gradle
  cat >> "$G" <<'GRADLE'

android {
    // Bibliothèque native d'ML Kit : seulement pour les processeurs ARM des téléphones (APK plus léger)
    defaultConfig { ndk { abiFilters "arm64-v8a", "armeabi-v7a" } }
    packaging { resources { excludes += ["META-INF/versions/9/OSGI-INF/MANIFEST.MF", "META-INF/DEPENDENCIES", "META-INF/LICENSE.md", "META-INF/NOTICE.md"] } }
}
GRADLE
  grep -n "mlkit\|pdfbox" "$G"; grep -n "minSdkVersion" android/variables.gradle
  addfilters '<intent-filter android:label="Atelier PDF"><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/pdf" /></intent-filter><intent-filter android:label="Atelier PDF"><action android:name="android.intent.action.SEND_MULTIPLE" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/pdf" /></intent-filter>'
fi
if [ "$APP" = "meteo" ]; then
  addperm ACCESS_NETWORK_STATE RECEIVE_BOOT_COMPLETED INTERNET
  addactivity '<service android:name=".MeteoPersoJob" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />'
fi
if [ "$APP" = "dicta" ]; then
  addperm RECORD_AUDIO FOREGROUND_SERVICE FOREGROUND_SERVICE_MICROPHONE FOREGROUND_SERVICE_MEDIA_PLAYBACK WAKE_LOCK READ_MEDIA_AUDIO
  grep -q 'READ_EXTERNAL_STORAGE' "$MAN" || addraw '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" /><uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />'
  addraw '<uses-feature android:name="android.hardware.microphone" android:required="true" /><queries><package android:name="fr.magformation13.carnet" /><intent><action android:name="android.speech.RecognitionService" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="text/plain" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="audio/*" /></intent></queries>'
  addactivity '<service android:name=".DictaService" android:foregroundServiceType="microphone|mediaPlayback" android:exported="false" />'
fi
if [ "$APP" = "sauvegarde" ]; then
  sed -i 's#</application>#    <service android:name=".SauvegardeJob" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />\n    </application>#' "$MAN"
  addperm RECEIVE_BOOT_COMPLETED READ_CONTACTS READ_CALENDAR READ_MEDIA_IMAGES READ_MEDIA_VIDEO READ_MEDIA_AUDIO READ_MEDIA_VISUAL_USER_SELECTED MANAGE_EXTERNAL_STORAGE
  grep -q 'READ_EXTERNAL_STORAGE' "$MAN" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />\n</manifest>#' "$MAN"
  Q='<queries><intent><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="text/x-vcard" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="text/calendar" /></intent><intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="application/json" /></intent><intent><action android:name="android.intent.action.SEND" /><data android:mimeType="*/*" /></intent>'
  for K in carnet scan mesure photo ondes toile socle suite qhse chasse sentiers vigie petitspas reveil musique fichiers ciel pdf echafaudage galerie agenda contacts calcul ecran lecteur; do Q="$Q<package android:name=\"fr.magformation13.$K\" />"; done
  sed -i "s#</manifest>#    $Q</queries>\n</manifest>#" "$MAN"
fi
if [ "$APP" = "ondes" ]; then
  addfilters '<intent-filter><action android:name="android.intent.action.SEND"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="text/plain"/></intent-filter>'
fi
if [ "$APP" = "galerie" ]; then
  addperm READ_MEDIA_IMAGES READ_MEDIA_VIDEO READ_MEDIA_VISUAL_USER_SELECTED SET_WALLPAPER
  grep -q 'READ_EXTERNAL_STORAGE' "$MAN" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n</manifest>#' "$MAN"
  addfilters '<intent-filter><action android:name="android.intent.action.VIEW"/><action android:name="com.android.camera.action.REVIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:mimeType="image/*"/><data android:mimeType="video/*"/></intent-filter><intent-filter><action android:name="android.intent.action.SEND"/><category android:name="android.intent.category.DEFAULT"/><data android:mimeType="image/*"/></intent-filter>'
  grep -q 'ATTACH_DATA' "$MAN" || sed -i 's#</manifest>#    <queries><intent><action android:name="android.intent.action.VIEW" /><data android:mimeType="image/*" /></intent><intent><action android:name="android.intent.action.EDIT" /><data android:mimeType="image/*" /></intent><intent><action android:name="android.intent.action.ATTACH_DATA" /><data android:mimeType="image/*" /></intent></queries>\n</manifest>#' "$MAN"
fi
# Toile : fonds d'écran automatiques (tâche planifiée et tuile des réglages rapides)
if [ "$APP" = "fonds" ] && ! grep -q "WallpaperJob" "$MAN"; then
  mkdir -p android/app/src/main/res/drawable
  cat > android/app/src/main/res/drawable/ic_toile_tile.xml <<'XML'
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M3,3h5v2H5v3H3V3zM16,3h5v5h-2V5h-3V3zM3,16h2v3h3v2H3v-5zM19,16h2v5h-5v-2h3v-3zM7,16l3,-4 2.2,2.8L15,11l3,5H7z"/>
  <path android:fillColor="#FFFFFFFF" android:pathData="M9,8.5a1.5,1.5 0,1 0,3 0a1.5,1.5 0,1 0,-3 0"/>
</vector>
XML
  sed -i 's#</application>#    <service android:name=".WallpaperJob" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />\n        <service android:name=".WallpaperTile" android:label="Fond suivant" android:icon="@drawable/ic_toile_tile" android:permission="android.permission.BIND_QUICK_SETTINGS_TILE" android:exported="true"><intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter></service>\n    </application>#' "$MAN"
  for P in SET_WALLPAPER RECEIVE_BOOT_COMPLETED; do
    grep -q "android.permission.$P" "$MAN" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"
  done
fi
for P in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION POST_NOTIFICATIONS ACCESS_MEDIA_LOCATION FOREGROUND_SERVICE FOREGROUND_SERVICE_LOCATION; do
  grep -q "android.permission.$P" "$MAN" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$P\" />\n</manifest>#" "$MAN"
done
grep -n "uses-permission" "$MAN"
echo "MainActivity : impression, enregistrement, e-mail et partage ajoutés ($F)"
# Signature fixe : les mises à jour s'installent par-dessus l'ancienne version (sans désinstaller, données conservées)
mkdir -p ~/.android && cp keystore/debug.keystore ~/.android/debug.keystore
cat >> android/app/build.gradle <<'GRADLE'

android {
    signingConfigs {
        debug {
            storeFile file("${rootDir}/../keystore/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
}
GRADLE
echo "Signature fixe configurée"
# Numéro de version qui augmente à chaque fabrication (mise à jour acceptée par Android)
# Dépôt public : numérotation au-dessus de celle de l'ancien dépôt privé (sinon Android refuse la mise à jour)
VC=$((1000 + ${GITHUB_RUN_NUMBER:-0}))
sed -i "s/versionCode 1$/versionCode $VC/; s/versionName \"1.0\"/versionName \"2.${GITHUB_RUN_NUMBER:-0}\"/" android/app/build.gradle
grep -n "versionCode\|versionName" android/app/build.gradle | head -2
