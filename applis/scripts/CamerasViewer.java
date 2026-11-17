package __PKG__;

/* Caméras : mosaïque plein écran de toutes les caméras (flux RTSP réduits), un toucher = caméra en grand (flux principal,
   avec le son), retour = mosaïque. Lecteur ExoPlayer d'AndroidX Media3 (Apache 2.0), RTP sur TCP (plus sûr en Wi-Fi),
   reconnexion automatique toutes les 5 s si une caméra décroche. Ouvert par CamerasBridge.show(). */

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.rtsp.RtspMediaSource;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class CamerasViewer extends Activity {
    static final class Cam { String name, main, sub; JSONObject raw; boolean ptz() { return raw != null && !raw.optString("ptz").isEmpty() && !raw.optString("token").isEmpty(); } }
    final class Tile {
        Cam cam; boolean big, useSub; FrameLayout box; Fit fit; SurfaceView sv; TextView label, status; ExoPlayer p; int fails;
        final Runnable retry = new Runnable() { public void run() { start(Tile.this); } };
        final Runnable fallback = new Runnable() { public void run() { if (p == null || p.getPlaybackState() != Player.STATE_READY) { useSub = true; status.setText("Image allégée…"); start(Tile.this); } } };
    }
    /** Cadre qui garde les proportions de l'image (bandes noires autour) */
    static final class Fit extends FrameLayout {
        float ratio = 16f / 9f;
        Fit(android.content.Context c) { super(c); }
        @Override protected void onMeasure(int w, int h) {
            int W = MeasureSpec.getSize(w), Hh = MeasureSpec.getSize(h);
            if (W > 0 && Hh > 0) { if (W / (float) Hh > ratio) W = Math.round(Hh * ratio); else Hh = Math.round(W / ratio); }
            super.onMeasure(MeasureSpec.makeMeasureSpec(W, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(Hh, MeasureSpec.EXACTLY));
        }
    }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<Cam> cams = new ArrayList<>();
    private final List<Tile> tiles = new ArrayList<>();
    private FrameLayout root; private LinearLayout grid; private Tile single;
    private int start = -1;

    int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // alerte de mouvement en plein écran : visible même téléphone verrouillé
        if (android.os.Build.VERSION.SDK_INT >= 27) { try { setShowWhenLocked(true); setTurnScreenOn(true); } catch (Throwable t) { } }
        try {
            // depuis la page : liste fournie ; depuis Majordome (« montre les caméras ») : liste gardée par CamerasBridge.store()
            String js = getIntent().getStringExtra("cams");
            if (js == null || js.isEmpty()) js = getSharedPreferences("cameras", MODE_PRIVATE).getString("cams", "[]");
            JSONArray a = new JSONArray(js);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i); Cam c = new Cam();
                c.name = o.optString("name", "Caméra " + (i + 1)); c.main = o.optString("main"); c.sub = o.optString("sub", ""); c.raw = o;
                if (!c.main.isEmpty()) cams.add(c);
            }
        } catch (Throwable t) { }
        start = getIntent().getIntExtra("start", -1);
        String want = getIntent().getStringExtra("name");   // « montre la caméra de la cuisine »
        if (want != null && !want.trim().isEmpty()) {
            String w = norm(want);
            for (int i = 0; i < cams.size(); i++) { String n = norm(cams.get(i).name); if (n.equals(w) || n.contains(w) || w.contains(n)) { start = i; break; } }
        }
        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        immersive();
        if (cams.isEmpty()) { TextView t = text("Aucune caméra réglée", 18); root.addView(t, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER)); }
    }
    static String norm(String s) { return java.text.Normalizer.normalize(String.valueOf(s), java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim(); }
    /** Bouton « fermer » (en haut à droite), toujours au-dessus des images */
    void closeBtn() {
        TextView x = text("✕", 20); x.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable(); bg.setShape(GradientDrawable.OVAL); bg.setColor(0x99000000); bg.setStroke(dp(1), 0x55FFFFFF); x.setBackground(bg);
        x.setContentDescription("Fermer les caméras");
        x.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(44), dp(44), Gravity.TOP | Gravity.END); lp.setMargins(0, dp(10), dp(10), 0);
        root.addView(x, lp);
    }
    void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }

    @Override protected void onStart() {
        super.onStart();
        if (cams.isEmpty()) return;
        if (start >= 0 && start < cams.size() && single == null) showSingle(cams.get(start));
        else if (single != null) { start(single); }
        else showGrid();
    }
    @Override protected void onStop() { super.onStop(); releaseAll(); }
    @Override protected void onDestroy() { releaseAll(); super.onDestroy(); }

    TextView text(String s, float sp) {
        TextView t = new TextView(this); t.setText(s); t.setTextColor(Color.WHITE); t.setTextSize(sp); t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setShadowLayer(4, 0, 1, Color.BLACK); return t;
    }

    Tile tile(Cam c, boolean big) {
        Tile t = new Tile(); t.cam = c; t.big = big;
        t.box = new FrameLayout(this); t.box.setBackgroundColor(Color.BLACK);
        t.fit = new Fit(this); t.sv = new SurfaceView(this);
        t.fit.addView(t.sv, new FrameLayout.LayoutParams(-1, -1));
        t.box.addView(t.fit, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        t.label = text(c.name, big ? 16 : 13);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(0x99000000); bg.setCornerRadius(dp(8)); t.label.setBackground(bg); t.label.setPadding(dp(8), dp(3), dp(8), dp(3));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START); lp.setMargins(dp(8), dp(8), 0, 0);
        t.box.addView(t.label, lp);
        t.status = text("Connexion…", 13); t.status.setTextColor(0xFFB3B9C9);
        t.box.addView(t.status, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        return t;
    }

    void start(final Tile t) {
        stop(t);
        String url = (t.big && !t.useSub) || t.cam.sub.isEmpty() ? t.cam.main : t.cam.sub;
        // en grand : flux principal ; s'il ne démarre pas en 8 s (trop lourd, H.265…), flux réduit
        if (t.big && !t.useSub && !t.cam.sub.isEmpty()) ui.postDelayed(t.fallback, 8000);
        try {
            final ExoPlayer p = new ExoPlayer.Builder(this).build();
            t.p = p;
            p.setVideoSurfaceView(t.sv);
            p.setVolume(t.big ? 1f : 0f);
            p.setMediaSource(new RtspMediaSource.Factory().setForceUseRtpTcp(true).setTimeoutMs(8000).createMediaSource(MediaItem.fromUri(Uri.parse(url))));
            p.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int st) {
                    if (st == Player.STATE_READY) { t.fails = 0; ui.removeCallbacks(t.fallback); t.status.setVisibility(View.GONE); }
                    else if (st == Player.STATE_BUFFERING) { t.status.setText("Connexion…"); }
                }
                @Override public void onVideoSizeChanged(VideoSize v) {
                    if (v.width > 0 && v.height > 0) { t.fit.ratio = v.width * v.pixelWidthHeightRatio / v.height; t.fit.requestLayout(); }
                }
                @Override public void onPlayerError(PlaybackException e) {
                    t.fails++;
                    if (t.big && !t.useSub && !t.cam.sub.isEmpty()) { ui.removeCallbacks(t.fallback); t.useSub = true; t.status.setText("Image allégée…"); ui.postDelayed(t.retry, 300); return; }
                    t.status.setVisibility(View.VISIBLE);
                    t.status.setText("Caméra injoignable, nouvel essai…");
                    ui.removeCallbacks(t.retry); ui.postDelayed(t.retry, Math.min(30000, 4000L * t.fails));
                }
            });
            p.setPlayWhenReady(true);
            p.prepare();
        } catch (Throwable e) { t.status.setText("Lecture impossible"); }
    }
    void stop(Tile t) { ui.removeCallbacks(t.retry); ui.removeCallbacks(t.fallback); if (t.p != null) { try { t.p.release(); } catch (Throwable e) { } t.p = null; } }
    void releaseAll() { for (Tile t : tiles) stop(t); if (single != null) stop(single); }

    void showGrid() {
        if (single != null) { stop(single); single = null; }
        root.removeAllViews(); tiles.clear();
        int n = cams.size(), cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = (n + cols - 1) / cols;
        boolean land = getResources().getDisplayMetrics().widthPixels > getResources().getDisplayMetrics().heightPixels;
        if (!land && n > 1) { cols = n <= 2 ? 1 : 2; rows = (n + cols - 1) / cols; }
        grid = new LinearLayout(this); grid.setOrientation(LinearLayout.VERTICAL);
        int k = 0;
        for (int r = 0; r < rows; r++) {
            LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL);
            for (int c = 0; c < cols; c++) {
                if (k < n) {
                    final Cam cam = cams.get(k++); Tile t = tile(cam, false); tiles.add(t);
                    t.box.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { showSingle(cam); } });
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1); lp.setMargins(dp(1), dp(1), dp(1), dp(1));
                    row.addView(t.box, lp);
                } else row.addView(new View(this), new LinearLayout.LayoutParams(0, -1, 1));
            }
            grid.addView(row, new LinearLayout.LayoutParams(-1, 0, 1));
        }
        root.addView(grid, new FrameLayout.LayoutParams(-1, -1));
        closeBtn();
        for (Tile t : tiles) start(t);
    }

    void showSingle(Cam cam) {
        for (Tile t : tiles) stop(t);
        tiles.clear(); root.removeAllViews();
        single = tile(cam, true);
        root.addView(single.box, new FrameLayout.LayoutParams(-1, -1));
        closeBtn();
        if (cams.size() > 1) {
            final TextView hint = text("Toucher : retour à la mosaïque", 12); hint.setTextColor(0xCCFFFFFF);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL); lp.bottomMargin = dp(14);
            single.box.addView(hint, lp);
            ui.postDelayed(new Runnable() { public void run() { hint.animate().alpha(0f).setDuration(600).start(); } }, 3500);
            single.box.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { start = -1; showGrid(); } });
        }
        if (cam.ptz()) ptzPad(cam);
        start(single);
        // « Jarvis, tourne la caméra du jardin à gauche » : un petit mouvement à l'ouverture
        final String mv = getIntent().getStringExtra("move");
        if (mv != null && !mv.isEmpty() && cam.ptz()) { getIntent().removeExtra("move"); final JSONObject r = cam.raw; new Thread(new Runnable() { public void run() { CamerasBridge.ptz(r, mv, 900); } }).start(); }
    }
    /** Croix de commande d'une caméra motorisée : appuyer = bouger, relâcher = arrêter */
    void ptzPad(final Cam cam) {
        android.widget.GridLayout g = new android.widget.GridLayout(this); g.setColumnCount(3); g.setRowCount(3);
        String[][] k = { { "", "▲", "" }, { "◀", "", "▶" }, { "－", "▼", "＋" } };
        String[][] d = { { "", "up", "" }, { "left", "", "right" }, { "out", "down", "in" } };
        for (int r = 0; r < 3; r++) for (int c = 0; c < 3; c++) {
            TextView b = text(k[r][c], 20); b.setGravity(Gravity.CENTER);
            final String dir = d[r][c];
            if (!dir.isEmpty()) {
                GradientDrawable bg = new GradientDrawable(); bg.setShape(GradientDrawable.OVAL); bg.setColor(0x88000000); bg.setStroke(dp(1), 0x55FFFFFF); b.setBackground(bg);
                b.setContentDescription(dir);
                b.setOnTouchListener(new View.OnTouchListener() { public boolean onTouch(View v, android.view.MotionEvent e) {
                    final JSONObject raw = cam.raw;
                    if (e.getAction() == android.view.MotionEvent.ACTION_DOWN) { v.setAlpha(.6f); new Thread(new Runnable() { public void run() { CamerasBridge.ptz(raw, dir, 0); } }).start(); }
                    else if (e.getAction() == android.view.MotionEvent.ACTION_UP || e.getAction() == android.view.MotionEvent.ACTION_CANCEL) { v.setAlpha(1f); new Thread(new Runnable() { public void run() { CamerasBridge.ptz(raw, "stop", 0); } }).start(); }
                    return true;
                } });
            }
            android.widget.GridLayout.LayoutParams lp = new android.widget.GridLayout.LayoutParams(android.widget.GridLayout.spec(r), android.widget.GridLayout.spec(c));
            lp.width = dp(52); lp.height = dp(52); lp.setMargins(dp(3), dp(3), dp(3), dp(3));
            g.addView(b, lp);
        }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END); lp.setMargins(0, 0, dp(14), dp(14));
        root.addView(g, lp);
    }

    @Override public void onConfigurationChanged(android.content.res.Configuration c) {
        super.onConfigurationChanged(c);
        if (single == null && !cams.isEmpty()) { for (Tile t : tiles) stop(t); showGrid(); }   // mosaïque remise en page (portrait / paysage)
    }
    @Override public void onBackPressed() {
        if (single != null && cams.size() > 1 && start < 0) { showGrid(); return; }
        super.onBackPressed();
    }
}
