package __PKG__;

// Socle (écran d'accueil) : démarrage rapide et stabilité. Exposé en JavaScript sous window.MAGSocle.
// Copié dans toutes les applis comme les autres ponts, mais le constructeur refuse toute autre appli que Socle
// (MainActivity l'ignore alors) : rien ne change pour les autres applis.
//  - écran natif immédiat : heure et date affichées pendant que la page se charge, retirées par ready()
//  - ready() : la page est à l'écran ; mesure du temps de démarrage, notée dans le journal
//  - récupération : si le moteur d'affichage (WebView) meurt (plantage ou manque de mémoire), Socle se relance
//    proprement au lieu de rester blanc ou de planter ; au retour sur l'accueil, une page vide ou bloquée est rechargée
//  - journal : erreurs JavaScript, plantages Java (même ceux qui tuent l'appli), redémarrages, temps de démarrage
//    (log, logRead, logClear) ; consultable dans Réglages › Journal et démarrage
//  - stateSave / stateLoad : copie de secours de la disposition (pages, tuiles, notes rapides) hors du stockage web
//  - storage() : stockage interne et mémoire vive (panneau « Batterie et stockage »)
//  - appsVersion() : change quand une appli est installée / désinstallée (la liste n'est relue qu'à ce moment-là)
// Toutes les méthodes appelées par la page attrapent leurs erreurs : une erreur ici ne peut pas faire planter Socle.

import android.app.Activity;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.ref.WeakReference;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class SocleBridge {
    static volatile boolean created = false;
    private static volatile int appsVer = 0;
    private static boolean statics = false;
    private static WeakReference<SocleBridge> current = new WeakReference<SocleBridge>(null);
    private static long goneAt = 0;
    private static int goneCount = 0;

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final long t0 = SystemClock.elapsedRealtime();
    private View overlay;
    private volatile boolean readyDone = false, pageLoaded = false, dead = false;
    private int healthReloads = 0;

    public SocleBridge(Activity a, WebView wv) {
        if (!a.getPackageName().endsWith(".socle")) throw new IllegalStateException("Réservé à Socle");
        this.a = a; this.wv = wv;
        created = true;
        current = new WeakReference<SocleBridge>(this);
        Context app = a.getApplicationContext();
        installStatics(app);
        showOverlay();
        try {
            ((com.getcapacitor.BridgeActivity) a).getBridge().addWebViewListener(new com.getcapacitor.WebViewListener() {
                @Override public void onPageLoaded(WebView v) { pageLoaded = true; }
                @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) { return renderGone(d); }
            });
        } catch (Throwable t) { log(app, "Surveillance de l'affichage indisponible : " + t); }
        // Filet de sécurité : l'écran natif ne reste jamais plus de 6 s
        ui.postDelayed(new Runnable() { public void run() { hideOverlay(); } }, 6000);
    }

    // ---------- Une seule fois par processus : plantages notés, installations d'applis, mémoire basse ----------
    private static synchronized void installStatics(final Context app) {
        if (statics) return;
        statics = true;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            public void uncaughtException(Thread th, Throwable ex) {
                try {
                    StringBuilder b = new StringBuilder("Plantage (").append(th.getName()).append(") : ").append(ex);
                    StackTraceElement[] st = ex.getStackTrace();
                    for (int i = 0; i < Math.min(3, st.length); i++) b.append(" · ").append(st[i].getClassName().replaceAll("^.*\\.", "")).append('.').append(st[i].getMethodName()).append(':').append(st[i].getLineNumber());
                    write(app, b.toString(), "", true);
                } catch (Throwable t) { }
                if (prev != null) prev.uncaughtException(th, ex);
                else { android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10); }
            }
        });
        try {
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_PACKAGE_ADDED); f.addAction(Intent.ACTION_PACKAGE_REMOVED);
            f.addAction(Intent.ACTION_PACKAGE_CHANGED); f.addAction(Intent.ACTION_PACKAGE_REPLACED);
            f.addDataScheme("package");
            BroadcastReceiver r = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    appsVer++;
                    SocleBridge s = current.get();
                    if (s != null) s.js("window.accueilApps&&accueilApps()");
                }
            };
            if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED); else app.registerReceiver(r, f);
        } catch (Throwable t) { log(app, "Suivi des installations indisponible : " + t); }
        app.registerComponentCallbacks(new ComponentCallbacks2() {
            @Override public void onTrimMemory(int level) {
                if (level == TRIM_MEMORY_UI_HIDDEN || level < TRIM_MEMORY_RUNNING_LOW) return;
                SocleBridge s = current.get();
                if (s != null) s.js("window.accueilTrim&&accueilTrim()");
            }
            @Override public void onConfigurationChanged(Configuration c) { }
            @Override public void onLowMemory() { SocleBridge s = current.get(); if (s != null) s.js("window.accueilTrim&&accueilTrim()"); }
        });
    }

    // ---------- Écran natif immédiat (heure et date) ----------
    private void showOverlay() {
        try {
            float d = a.getResources().getDisplayMetrics().density;
            boolean hide = a.getSharedPreferences("socle", Context.MODE_PRIVATE).getBoolean("hideBar", true);
            int top = (int) (6 * d);
            if (!hide) { int id = a.getResources().getIdentifier("status_bar_height", "dimen", "android"); top = id > 0 ? a.getResources().getDimensionPixelSize(id) : (int) (24 * d); }
            LinearLayout box = new LinearLayout(a);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setPadding((int) (27 * d), top + (int) (24 * d), (int) (27 * d), 0);
            Date now = new Date();
            TextView time = new TextView(a);
            time.setText(new SimpleDateFormat("HH:mm", Locale.FRANCE).format(now));
            time.setTextColor(0xFFFFFFFF); time.setTextSize(58); time.setIncludeFontPadding(false);
            time.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
            time.setShadowLayer(3 * d, 0, d, 0x73000000);
            TextView date = new TextView(a);
            String ds = new SimpleDateFormat("EEEE d MMMM", Locale.FRANCE).format(now);
            date.setText(ds.isEmpty() ? ds : Character.toUpperCase(ds.charAt(0)) + ds.substring(1));
            date.setTextColor(0xC7FFFFFF); date.setTextSize(15);
            date.setShadowLayer(3 * d, 0, d, 0x73000000);
            date.setPadding(0, (int) (6 * d), 0, 0);
            box.addView(time); box.addView(date);
            FrameLayout fl = new FrameLayout(a);
            fl.addView(box);
            a.addContentView(fl, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            overlay = fl;
        } catch (Throwable t) { overlay = null; }
    }
    private void hideOverlay() {
        final View o = overlay;
        overlay = null;
        if (o == null) return;
        try {
            o.animate().alpha(0f).setDuration(160).withEndAction(new Runnable() { public void run() {
                try { ViewGroup p = (ViewGroup) o.getParent(); if (p != null) p.removeView(o); } catch (Throwable t) { }
            } }).start();
        } catch (Throwable t) { try { ((ViewGroup) o.getParent()).removeView(o); } catch (Throwable t2) { } }
    }

    // ---------- Moteur d'affichage arrêté : relance propre au lieu d'un écran blanc ou d'un plantage ----------
    private boolean renderGone(RenderProcessGoneDetail d) {
        if (dead) return true;
        dead = true;
        boolean crash = Build.VERSION.SDK_INT >= 26 && d != null && d.didCrash();
        log(a, crash ? "L'affichage a planté : Socle redémarre" : "Android a arrêté l'affichage (mémoire) : Socle redémarre");
        long now = SystemClock.elapsedRealtime();
        if (now - goneAt > 60000) goneCount = 0;
        goneAt = now; goneCount++;
        // La WebView morte ne doit plus être dessinée : on la retire, puis on recrée l'écran (nouvelle WebView)
        try { ViewGroup p = (ViewGroup) wv.getParent(); if (p != null) p.removeView(wv); } catch (Throwable t) { }
        ui.postDelayed(new Runnable() { public void run() {
            try { a.recreate(); } catch (Throwable t) { log(a, "Relance impossible : " + t); }
        } }, goneCount > 3 ? 5000 : 250);
        return true;
    }

    // Retour sur l'accueil (appelé par MainActivity.onResume) : page vide ou bloquée → rechargement
    public void onResume() {
        if (dead || !pageLoaded || !readyDone) return;
        try {
            if (wv.getProgress() < 100) return;
            final boolean[] answered = { false };
            wv.evaluateJavascript("(function(){try{return window.socleOk?socleOk():0}catch(e){return -1}})()", new android.webkit.ValueCallback<String>() {
                public void onReceiveValue(String v) {
                    answered[0] = true;
                    if ("1".equals(v)) { healthReloads = 0; return; }
                    reloadPage("Accueil vide détecté (" + v + ") : rechargement");
                }
            });
            ui.postDelayed(new Runnable() { public void run() { if (!answered[0] && !dead) reloadPage("Accueil bloqué : rechargement"); } }, 6000);
        } catch (Throwable t) { }
    }
    private void reloadPage(String why) {
        if (dead || healthReloads >= 2) return;
        healthReloads++;
        log(a, why);
        try { ((com.getcapacitor.BridgeActivity) a).getBridge().reload(); } catch (Throwable t) { try { wv.reload(); } catch (Throwable t2) { } }
    }

    void js(final String code) {
        ui.post(new Runnable() { public void run() { if (dead) return; try { wv.evaluateJavascript(code, null); } catch (Throwable t) { } } });
    }

    // ---------- Appelé par la page ----------
    @JavascriptInterface
    public void ready() {
        try {
            if (readyDone) return;
            readyDone = true;
            ui.post(new Runnable() { public void run() { hideOverlay(); } });
            long now = SystemClock.elapsedRealtime();
            long proc = Build.VERSION.SDK_INT >= 24 ? android.os.Process.getStartElapsedRealtime() : 0;
            StringBuilder m = new StringBuilder("Démarrage : accueil affiché en ").append(now - t0).append(" ms");
            if (proc > 0 && t0 - proc < 20000) m.append(" (").append(now - proc).append(" ms depuis le lancement de Socle)");
            if (now < 5 * 60000) m.append(" · après allumage du téléphone");
            write(a, m.toString(), "start", false);
        } catch (Throwable t) { }
    }
    @JavascriptInterface
    public void log(String m) { try { write(a, String.valueOf(m), "", false); } catch (Throwable t) { } }
    @JavascriptInterface
    public String logRead() { try { return prefs(a).getString("l", "[]"); } catch (Throwable t) { return "[]"; } }
    @JavascriptInterface
    public void logClear() { try { prefs(a).edit().putString("l", "[]").apply(); } catch (Throwable t) { } }
    @JavascriptInterface
    public void stateSave(String json) {
        try {
            if (json == null || json.length() > 2000000) return;
            new JSONObject(json);
            SharedPreferences p = a.getSharedPreferences("socle_state", Context.MODE_PRIVATE);
            p.edit().putString("s", json).putLong("at", System.currentTimeMillis()).apply();
        } catch (Throwable t) { }
    }
    @JavascriptInterface
    public String stateLoad() { try { return a.getSharedPreferences("socle_state", Context.MODE_PRIVATE).getString("s", ""); } catch (Throwable t) { return ""; } }
    @JavascriptInterface
    public String storage() {
        JSONObject o = new JSONObject();
        try {
            StatFs st = new StatFs(Environment.getDataDirectory().getPath());
            o.put("total", st.getTotalBytes()); o.put("free", st.getAvailableBytes());
            ActivityManager am = (ActivityManager) a.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            o.put("ramTotal", mi.totalMem); o.put("ramFree", mi.availMem);
        } catch (Throwable t) { }
        return o.toString();
    }
    @JavascriptInterface
    public int appsVersion() { return appsVer; }

    // ---------- Journal (80 dernières lignes, gardées par Android) ----------
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("socle_log", Context.MODE_PRIVATE); }
    static void log(Context c, String m) { try { write(c, m, "", false); } catch (Throwable t) { } }
    private static synchronized void write(Context c, String m, String kind, boolean now) {
        try {
            SharedPreferences p = prefs(c);
            JSONArray l;
            try { l = new JSONArray(p.getString("l", "[]")); } catch (Exception e) { l = new JSONArray(); }
            JSONObject o = new JSONObject();
            o.put("t", System.currentTimeMillis());
            o.put("m", m.length() > 600 ? m.substring(0, 600) : m);
            if (kind != null && !kind.isEmpty()) o.put("k", kind);
            l.put(o);
            JSONArray out = new JSONArray();
            for (int i = Math.max(0, l.length() - 80); i < l.length(); i++) out.put(l.get(i));
            SharedPreferences.Editor e = p.edit().putString("l", out.toString());
            if (now) e.commit(); else e.apply();
        } catch (Throwable t) { }
    }
}
