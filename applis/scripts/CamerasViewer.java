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
    static final class Cam { String name, main, sub; }
    final class Tile {
        Cam cam; boolean big; FrameLayout box; Fit fit; SurfaceView sv; TextView label, status; ExoPlayer p; int fails;
        final Runnable retry = new Runnable() { public void run() { start(Tile.this); } };
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
        try {
            JSONArray a = new JSONArray(getIntent().getStringExtra("cams"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i); Cam c = new Cam();
                c.name = o.optString("name", "Caméra " + (i + 1)); c.main = o.optString("main"); c.sub = o.optString("sub", "");
                if (!c.main.isEmpty()) cams.add(c);
            }
        } catch (Throwable t) { }
        start = getIntent().getIntExtra("start", -1);
        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        immersive();
        if (cams.isEmpty()) { TextView t = text("Aucune caméra réglée", 18); root.addView(t, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER)); }
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
        String url = t.big || t.cam.sub.isEmpty() ? t.cam.main : t.cam.sub;
        try {
            final ExoPlayer p = new ExoPlayer.Builder(this).build();
            t.p = p;
            p.setVideoSurfaceView(t.sv);
            p.setVolume(t.big ? 1f : 0f);
            p.setMediaSource(new RtspMediaSource.Factory().setForceUseRtpTcp(true).setTimeoutMs(8000).createMediaSource(MediaItem.fromUri(Uri.parse(url))));
            p.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int st) {
                    if (st == Player.STATE_READY) { t.fails = 0; t.status.setVisibility(View.GONE); }
                    else if (st == Player.STATE_BUFFERING) { t.status.setText("Connexion…"); }
                }
                @Override public void onVideoSizeChanged(VideoSize v) {
                    if (v.width > 0 && v.height > 0) { t.fit.ratio = v.width * v.pixelWidthHeightRatio / v.height; t.fit.requestLayout(); }
                }
                @Override public void onPlayerError(PlaybackException e) {
                    t.fails++;
                    t.status.setVisibility(View.VISIBLE);
                    t.status.setText("Caméra injoignable, nouvel essai…");
                    ui.removeCallbacks(t.retry); ui.postDelayed(t.retry, Math.min(30000, 4000L * t.fails));
                }
            });
            p.setPlayWhenReady(true);
            p.prepare();
        } catch (Throwable e) { t.status.setText("Lecture impossible"); }
    }
    void stop(Tile t) { ui.removeCallbacks(t.retry); if (t.p != null) { try { t.p.release(); } catch (Throwable e) { } t.p = null; } }
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
        for (Tile t : tiles) start(t);
    }

    void showSingle(Cam cam) {
        for (Tile t : tiles) stop(t);
        tiles.clear(); root.removeAllViews();
        single = tile(cam, true);
        root.addView(single.box, new FrameLayout.LayoutParams(-1, -1));
        if (cams.size() > 1) {
            final TextView hint = text("Toucher : retour à la mosaïque", 12); hint.setTextColor(0xCCFFFFFF);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL); lp.bottomMargin = dp(14);
            single.box.addView(hint, lp);
            ui.postDelayed(new Runnable() { public void run() { hint.animate().alpha(0f).setDuration(600).start(); } }, 3500);
            single.box.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { start = -1; showGrid(); } });
        }
        start(single);
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
