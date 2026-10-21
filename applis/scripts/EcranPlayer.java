package __PKG__;

// Écran : lecteur vidéo natif plein écran (MediaPlayer + SurfaceView), interface construite en code.
// Lit content://, fichiers, http(s) progressif et HLS (.m3u8). Ouvert par EcranBridge.play() ou par « Ouvrir avec Écran ».

import android.app.Activity;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Rational;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class EcranPlayer extends Activity implements SurfaceHolder.Callback {
    static final String PREFS = EcranBridge.PREFS;
    private static final String ACT_PIP = "ecran.PIP";
    private static final int ACC = 0xFFFF8F70;
    private static final float[] SPEEDS = { 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f };
    private static final String[] FORMATS = { "Ajuster", "Remplir", "Zoom" };
    private static final String[] ROTS = { "Rotation selon la vidéo", "Rotation libre", "Rotation verrouillée" };

    private final Handler h = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private JSONArray list = new JSONArray();
    private int index = 0;
    private JSONObject item;
    private String key = "";

    private MediaPlayer mp;
    private boolean prepared = false, wantPlay = true, surfaceOk = false, external = false, completed = false;
    private int vw = 0, vh = 0, dur = 0, startAt = 0;
    private float speed = 1f;
    private int format = 0, rot = 0;
    private boolean locked = false, controlsOn = true, inPip = false;
    private long lastSave = 0;
    private List<long[]> subT = null; private List<String> subX = null; private boolean subOn = true;

    // Vues
    private FrameLayout root, box, ctl, speedPanel;
    private SurfaceView sv;
    private TextView title, sub, tCur, tDur, indicator, subs, resumeChip, bSpeed, nextBox, err;
    private View bPlay, bPrev, bNext, bLock, bUnlock, bPip, bSubs;
    private IconDrawable playIcon;
    private SeekBar seek;
    private ProgressBar spin;
    private boolean seeking = false;
    private float density;
    private AudioManager am;
    private BroadcastReceiver noisy, pipRx;

    // =====================================================================
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        density = getResources().getDisplayMetrics().density;
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        am = (AudioManager) getSystemService(AUDIO_SERVICE);
        speed = prefs.getFloat("speed", 1f);
        format = prefs.getInt("format", 0);
        rot = prefs.getInt("rot", 0);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.BLACK));
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        buildUi();
        immersive();
        applyRotation();
        noisy = new BroadcastReceiver() { public void onReceive(Context c, Intent i) { if (mp != null && prepared && mp.isPlaying()) pause(); } };
        try { registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)); } catch (Exception e) { }
        if (!readIntent(getIntent())) { finish(); return; }
        load(index);
        h.post(tick);
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        savePos(true);
        if (readIntent(i)) load(index);
    }

    /** Liste depuis le pont (extra « list ») ou un seul fichier depuis une autre appli (ACTION_VIEW) */
    private boolean readIntent(Intent i) {
        try {
            if (i.getStringExtra("list") != null) {
                list = new JSONArray(i.getStringExtra("list"));
                index = Math.max(0, Math.min(list.length() - 1, i.getIntExtra("index", 0)));
                external = false;
                return list.length() > 0;
            }
            Uri u = i.getData();
            if (u == null) return false;
            JSONObject o = new JSONObject();
            o.put("url", u.toString());
            o.put("id", "ext:" + u.toString());
            String name = displayName(u);
            o.put("title", name.isEmpty() ? "Vidéo" : name.replaceAll("\\.[A-Za-z0-9]{2,4}$", ""));
            o.put("sub", "Ouverte depuis une autre appli");
            list = new JSONArray().put(o);
            index = 0;
            external = true;
            return true;
        } catch (Exception e) { return false; }
    }

    private String displayName(Uri u) {
        if ("content".equals(u.getScheme())) {
            try (Cursor c = getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
            } catch (Exception e) { }
        }
        String s = u.getLastPathSegment();
        return s == null ? "" : Uri.decode(s);
    }

    // =====================================================================
    // Interface
    private int dp(float v) { return Math.round(v * density); }

    private TextView text(float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        return t;
    }

    private View iconBtn(String path, float size, String desc, View.OnClickListener l) {
        FrameLayout f = new FrameLayout(this);
        View v = new View(this);
        IconDrawable d = new IconDrawable(path, Color.WHITE, 1.9f);
        v.setBackground(d);
        int s = dp(size);
        f.addView(v, new FrameLayout.LayoutParams(dp(size * 0.5f), dp(size * 0.5f), Gravity.CENTER));
        GradientDrawable bg = new GradientDrawable(); bg.setShape(GradientDrawable.OVAL); bg.setColor(0x00000000);
        f.setBackground(bg);
        f.setLayoutParams(new LinearLayout.LayoutParams(s, s));
        f.setContentDescription(desc);
        f.setOnClickListener(l);
        f.setTag(d);
        return f;
    }

    private GradientDrawable round(int color, float r) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(r)); return g; }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        box = new FrameLayout(this);
        box.setClipChildren(true);
        root.addView(box, new FrameLayout.LayoutParams(-1, -1));
        sv = new SurfaceView(this);
        sv.getHolder().addCallback(this);
        box.addView(sv, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));

        // Sous-titres
        subs = new TextView(this);
        subs.setTextColor(Color.WHITE);
        subs.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        subs.setGravity(Gravity.CENTER);
        subs.setShadowLayer(dp(3), 0, dp(1), Color.BLACK);
        subs.setBackground(round(0x88000000, 8));
        subs.setPadding(dp(10), dp(3), dp(10), dp(4));
        subs.setVisibility(View.GONE);
        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        slp.bottomMargin = dp(36); slp.leftMargin = slp.rightMargin = dp(24);
        root.addView(subs, slp);

        spin = new ProgressBar(this);
        spin.setIndeterminateTintList(ColorStateList.valueOf(Color.WHITE));
        root.addView(spin, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER));

        indicator = text(16, Color.WHITE, true);
        indicator.setBackground(round(0xCC15171E, 16));
        indicator.setPadding(dp(18), dp(12), dp(18), dp(12));
        indicator.setGravity(Gravity.CENTER);
        indicator.setCompoundDrawablePadding(dp(10));
        indicator.setVisibility(View.GONE);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        ilp.bottomMargin = dp(120);
        root.addView(indicator, ilp);

        // ---- Commandes ----
        ctl = new FrameLayout(this);
        root.addView(ctl, new FrameLayout.LayoutParams(-1, -1));
        View dim = new View(this); dim.setBackgroundColor(0x40000000); dim.setClickable(false);
        ctl.addView(dim, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(6), dp(10), dp(6), dp(26));
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{ 0xC0000000, 0x00000000 }));
        top.addView(iconBtn("M15 6L9 12L15 18", 48, "Retour", new View.OnClickListener() { public void onClick(View v) { finish(); } }));
        LinearLayout tt = new LinearLayout(this); tt.setOrientation(LinearLayout.VERTICAL);
        title = text(16, Color.WHITE, true); sub = text(12.5f, 0xFFB4B8C7, false);
        tt.addView(title); tt.addView(sub);
        top.addView(tt, new LinearLayout.LayoutParams(0, -2, 1));
        bSubs = iconBtn("M3 6Q3 5 4 5H20Q21 5 21 6V18Q21 19 20 19H4Q3 19 3 18ZM7 11H10M7 15H13M15 15H17M12 11H17", 44, "Sous-titres", new View.OnClickListener() { public void onClick(View v) {
            subOn = !subOn; flash(subOn ? "Sous-titres affichés" : "Sous-titres masqués"); if (!subOn) subs.setVisibility(View.GONE); showControls(); } });
        bSubs.setVisibility(View.GONE);
        top.addView(bSubs);
        top.addView(iconBtn("M4 9V5H8M16 5H20V9M20 15V19H16M8 19H4V15", 44, "Format de l'image", new View.OnClickListener() { public void onClick(View v) {
            format = (format + 1) % 3; prefs.edit().putInt("format", format).apply(); layoutVideo(); flash(FORMATS[format]); showControls(); } }));
        top.addView(iconBtn("M4 12A8 8 0 0 1 18 6.7M20 12A8 8 0 0 1 6 17.3M18 3V7H14M6 21V17H10", 44, "Rotation", new View.OnClickListener() { public void onClick(View v) {
            rot = (rot + 1) % 3; prefs.edit().putInt("rot", rot).apply(); applyRotation(); flash(ROTS[rot]); showControls(); } }));
        if (Build.VERSION.SDK_INT >= 26 && getPackageManager().hasSystemFeature("android.software.picture_in_picture")) {
            bPip = iconBtn("M3 6Q3 5 4 5H20Q21 5 21 6V18Q21 19 20 19H4Q3 19 3 18ZM12 12H18V16H12Z", 44, "Image dans l'image", new View.OnClickListener() { public void onClick(View v) { enterPip(); } });
            top.addView(bPip);
        }
        bLock = iconBtn("M6 11H18V20H6ZM8.5 11V8A3.5 3.5 0 0 1 15.5 8V11", 44, "Verrouiller l'écran tactile", new View.OnClickListener() { public void onClick(View v) { setLocked(true); } });
        top.addView(bLock);
        ctl.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // Centre : précédente, -10, lecture, +10, suivante
        LinearLayout mid = new LinearLayout(this);
        mid.setGravity(Gravity.CENTER);
        bPrev = iconBtn("M18 6V18L9 12ZM6 6V18", 52, "Vidéo précédente", new View.OnClickListener() { public void onClick(View v) { go(index - 1); } });
        mid.addView(bPrev);
        mid.addView(space(14));
        View r10 = iconBtn("R12 12 8 -60 -280M5.2 5V9.2H9.4", 58, "Reculer de 10 secondes", new View.OnClickListener() { public void onClick(View v) { skip(-10000); showControls(); } });
        ((IconDrawable) r10.getTag()).label = "10";
        mid.addView(r10);
        mid.addView(space(18));
        FrameLayout pp = (FrameLayout) iconBtn("M8 5V19L19 12Z", 76, "Lecture ou pause", new View.OnClickListener() { public void onClick(View v) { toggle(); showControls(); } });
        playIcon = (IconDrawable) pp.getTag();
        playIcon.fill = true;
        GradientDrawable ppBg = new GradientDrawable(); ppBg.setShape(GradientDrawable.OVAL); ppBg.setColor(0x33FFFFFF); pp.setBackground(ppBg);
        bPlay = pp;
        mid.addView(pp);
        mid.addView(space(18));
        View f10 = iconBtn("R12 12 8 240 280M18.8 5V9.2H14.6", 58, "Avancer de 10 secondes", new View.OnClickListener() { public void onClick(View v) { skip(10000); showControls(); } });
        ((IconDrawable) f10.getTag()).label = "10";
        mid.addView(f10);
        mid.addView(space(14));
        bNext = iconBtn("M6 6V18L15 12ZM18 6V18", 52, "Vidéo suivante", new View.OnClickListener() { public void onClick(View v) { go(index + 1); } });
        mid.addView(bNext);
        ctl.addView(mid, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));

        // Bas : temps, barre, vitesse
        LinearLayout bot = new LinearLayout(this);
        bot.setOrientation(LinearLayout.VERTICAL);
        bot.setPadding(dp(16), dp(30), dp(16), dp(14));
        bot.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{ 0xD0000000, 0x00000000 }));
        speedPanel = new FrameLayout(this);
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout chips = new LinearLayout(this);
        for (final float s : SPEEDS) {
            TextView c = text(14, Color.WHITE, true);
            c.setText(fmtSpeed(s));
            c.setPadding(dp(14), dp(8), dp(14), dp(8));
            c.setTag(s);
            c.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { setSpeed(s); speedPanel.setVisibility(View.GONE); showControls(); } });
            LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(-2, -2); cl.rightMargin = dp(8);
            chips.addView(c, cl);
        }
        hs.addView(chips);
        speedPanel.addView(hs);
        speedPanel.setVisibility(View.GONE);
        speedPanel.setPadding(0, 0, 0, dp(10));
        bot.addView(speedPanel);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        tCur = text(13, Color.WHITE, true); tCur.setFontFeatureSettings("tnum");
        tDur = text(13, 0xFFB4B8C7, false); tDur.setFontFeatureSettings("tnum");
        seek = new SeekBar(this);
        seek.setMax(1000);
        seek.setProgressTintList(ColorStateList.valueOf(ACC));
        seek.setThumbTintList(ColorStateList.valueOf(ACC));
        seek.setProgressBackgroundTintList(ColorStateList.valueOf(0x66FFFFFF));
        seek.setSecondaryProgressTintList(ColorStateList.valueOf(0x99FFFFFF));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) { tCur.setText(fmt((long) dur * p / 1000)); showControls(); } }
            public void onStartTrackingTouch(SeekBar s) { seeking = true; h.removeCallbacks(hideCtl); }
            public void onStopTrackingTouch(SeekBar s) { seeking = false; seekTo((int) ((long) dur * s.getProgress() / 1000)); showControls(); }
        });
        bSpeed = text(13.5f, Color.WHITE, true);
        bSpeed.setBackground(round(0x33FFFFFF, 12));
        bSpeed.setPadding(dp(10), dp(6), dp(10), dp(6));
        bSpeed.setContentDescription("Vitesse de lecture");
        bSpeed.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            speedPanel.setVisibility(speedPanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE); markSpeed(); showControls(); } });
        row.addView(tCur);
        row.addView(seek, new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(tDur);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-2, -2); sp.leftMargin = dp(10);
        row.addView(bSpeed, sp);
        bot.addView(row);
        ctl.addView(bot, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        // Reprise : « Reprise à 12:34 · Reprendre au début »
        resumeChip = text(14, Color.WHITE, true);
        resumeChip.setBackground(round(0xE62B3042, 14));
        resumeChip.setPadding(dp(14), dp(10), dp(14), dp(10));
        resumeChip.setVisibility(View.GONE);
        resumeChip.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { seekTo(0); resumeChip.setVisibility(View.GONE); } });
        FrameLayout.LayoutParams rl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        rl.leftMargin = dp(16); rl.bottomMargin = dp(96);
        root.addView(resumeChip, rl);

        // Vidéo suivante
        nextBox = text(14, Color.WHITE, true);
        nextBox.setSingleLine(false); nextBox.setMaxLines(3);
        nextBox.setBackground(round(0xE62B3042, 14));
        nextBox.setPadding(dp(16), dp(12), dp(16), dp(12));
        nextBox.setVisibility(View.GONE);
        nextBox.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { h.removeCallbacks(autoNext); nextBox.setVisibility(View.GONE); showControls(); } });
        FrameLayout.LayoutParams nl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        nl.rightMargin = dp(16); nl.bottomMargin = dp(96);
        root.addView(nextBox, nl);

        // Erreur
        err = text(15, Color.WHITE, false);
        err.setSingleLine(false); err.setMaxLines(6); err.setGravity(Gravity.CENTER);
        err.setBackground(round(0xF02B3042, 16));
        err.setPadding(dp(20), dp(16), dp(20), dp(16));
        err.setVisibility(View.GONE);
        err.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openElsewhere(); } });
        FrameLayout.LayoutParams el = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER); el.leftMargin = el.rightMargin = dp(28);
        root.addView(err, el);

        // Déverrouillage (seul bouton visible quand l'écran tactile est verrouillé)
        bUnlock = iconBtn("M6 11H18V20H6ZM8.5 11V8A3.5 3.5 0 0 1 15 6.5", 56, "Déverrouiller", new View.OnClickListener() { public void onClick(View v) { setLocked(false); } });
        bUnlock.setBackground(round(0xCC2B3042, 28));
        bUnlock.setVisibility(View.GONE);
        FrameLayout.LayoutParams ul = new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.CENTER_VERTICAL | Gravity.START); ul.leftMargin = dp(24);
        root.addView(bUnlock, ul);

        setContentView(root);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int l = 0, t = 0, r = 0, bt = 0;
                if (Build.VERSION.SDK_INT >= 28 && in.getDisplayCutout() != null) {
                    l = in.getDisplayCutout().getSafeInsetLeft(); t = in.getDisplayCutout().getSafeInsetTop();
                    r = in.getDisplayCutout().getSafeInsetRight(); bt = in.getDisplayCutout().getSafeInsetBottom();
                }
                ctl.setPadding(l, t, r, bt);
                return in;
            }
        });
        setupGestures();
        setPlayIcon(false);
    }

    private View space(int w) { View v = new View(this); v.setLayoutParams(new LinearLayout.LayoutParams(dp(w), 1)); return v; }

    private void immersive() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }

    // =====================================================================
    // Gestes : appui = commandes, double appui gauche/droite = ±10 s, glisser vertical = luminosité (gauche) / volume (droite),
    // glisser horizontal = avancer/reculer
    private float bright = -1f, volAcc = 0f;
    private int gestMode = 0;    // 0 rien, 1 luminosité, 2 volume, 3 position
    private int seekTarget = 0, seekStart = 0;

    private void setupGestures() {
        final GestureDetector gd = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { gestMode = 0; return true; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                if (locked) { flashUnlock(); return true; }
                if (speedPanel.getVisibility() == View.VISIBLE) { speedPanel.setVisibility(View.GONE); return true; }
                if (controlsOn) hideControls(); else showControls();
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                if (locked) { flashUnlock(); return true; }
                float x = e.getX() / root.getWidth();
                if (x < 0.38f) { skip(-10000); flash("-10 s"); }
                else if (x > 0.62f) { skip(10000); flash("+10 s"); }
                else toggle();
                return true;
            }
            @Override public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (locked || e1 == null) return false;
                int W = root.getWidth(), H = root.getHeight();
                if (e1.getY() < H * 0.08f || e1.getY() > H * 0.92f) return false;   // bords : gestes système
                if (gestMode == 0) {
                    float ax = Math.abs(e2.getX() - e1.getX()), ay = Math.abs(e2.getY() - e1.getY());
                    if (ax < dp(12) && ay < dp(12)) return true;
                    if (ay > ax) gestMode = e1.getX() < W / 2f ? 1 : 2;
                    else if (prepared && dur > 0) { gestMode = 3; seekStart = position(); seekTarget = seekStart; }
                    else gestMode = -1;
                }
                if (gestMode == 1) {
                    if (bright < 0) bright = currentBrightness();
                    bright = Math.max(0.01f, Math.min(1f, bright + dy / (H * 0.7f)));
                    WindowManager.LayoutParams lp = getWindow().getAttributes(); lp.screenBrightness = bright; getWindow().setAttributes(lp);
                    flashLevel(IconDrawable.SUN, "Luminosité", bright);
                } else if (gestMode == 2) {
                    int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    volAcc += dy / (H * 0.7f) * max;
                    int cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                    if (Math.abs(volAcc) >= 1) {
                        int step = (int) volAcc; volAcc -= step;
                        cur = Math.max(0, Math.min(max, cur + step));
                        try { am.setStreamVolume(AudioManager.STREAM_MUSIC, cur, 0); } catch (Exception x) { }
                    }
                    flashLevel(IconDrawable.VOL, "Volume", max == 0 ? 0 : (float) cur / max);
                } else if (gestMode == 3) {
                    float d = (e2.getX() - e1.getX()) / W;
                    int range = Math.min(dur, Math.max(90000, dur / 3));
                    seekTarget = Math.max(0, Math.min(dur, seekStart + (int) (d * range)));
                    int diff = (seekTarget - seekStart) / 1000;
                    flash(fmt(seekTarget) + "  (" + (diff >= 0 ? "+" : "−") + Math.abs(diff) + " s)");
                }
                return true;
            }
        });
        gd.setIsLongpressEnabled(false);
        root.setOnTouchListener(new View.OnTouchListener() {
            public boolean onTouch(View v, MotionEvent e) {
                gd.onTouchEvent(e);
                if ((e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL)) {
                    if (gestMode == 3) seekTo(seekTarget);
                    gestMode = 0; volAcc = 0;
                }
                return true;
            }
        });
        // La couche de commandes n'absorbe pas les touchers : les gestes arrivent à root hors des boutons
        ctl.setClickable(false);
    }

    private float currentBrightness() {
        float b = getWindow().getAttributes().screenBrightness;
        if (b >= 0) return b;
        try { return Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS) / 255f; } catch (Exception e) { return 0.5f; }
    }

    private final Runnable hideInd = new Runnable() { public void run() { indicator.setVisibility(View.GONE); } };
    private void flash(String t) {
        indicator.setCompoundDrawables(null, null, null, null);
        indicator.setText(t);
        indicator.setVisibility(View.VISIBLE);
        h.removeCallbacks(hideInd); h.postDelayed(hideInd, 900);
    }
    private void flashLevel(String icon, String what, float v) {
        IconDrawable d = new IconDrawable(icon, Color.WHITE, 1.9f);
        d.setBounds(0, 0, dp(22), dp(22));
        indicator.setCompoundDrawables(d, null, null, null);
        indicator.setText(what + "  " + Math.round(v * 100) + " %");
        indicator.setVisibility(View.VISIBLE);
        h.removeCallbacks(hideInd); h.postDelayed(hideInd, 900);
    }

    private final Runnable hideCtl = new Runnable() { public void run() { if (!seeking && mp != null && prepared && mp.isPlaying() && speedPanel.getVisibility() != View.VISIBLE) hideControls(); } };
    private void showControls() {
        if (locked || inPip) return;
        controlsOn = true;
        ctl.setVisibility(View.VISIBLE);
        ctl.animate().alpha(1f).setDuration(150).start();
        h.removeCallbacks(hideCtl); h.postDelayed(hideCtl, 3500);
    }
    private void hideControls() {
        controlsOn = false;
        speedPanel.setVisibility(View.GONE);
        ctl.animate().alpha(0f).setDuration(200).withEndAction(new Runnable() { public void run() { if (!controlsOn) ctl.setVisibility(View.GONE); } }).start();
    }

    private final Runnable hideUnlock = new Runnable() { public void run() { if (locked) bUnlock.setVisibility(View.GONE); } };
    private void flashUnlock() { bUnlock.setVisibility(View.VISIBLE); h.removeCallbacks(hideUnlock); h.postDelayed(hideUnlock, 2500); }
    private void setLocked(boolean on) {
        locked = on;
        if (on) { hideControls(); flash("Écran tactile verrouillé"); flashUnlock(); }
        else { bUnlock.setVisibility(View.GONE); showControls(); }
    }

    @Override public void onBackPressed() {
        if (locked) { flashUnlock(); flash("Déverrouille d'abord l'écran"); return; }
        if (speedPanel.getVisibility() == View.VISIBLE) { speedPanel.setVisibility(View.GONE); return; }
        super.onBackPressed();
    }

    // =====================================================================
    // Lecture
    private void go(int i) {
        if (i < 0 || i >= list.length()) return;
        savePos(true);
        load(i);
    }

    private void load(int i) {
        h.removeCallbacks(autoNext);
        nextBox.setVisibility(View.GONE);
        err.setVisibility(View.GONE);
        resumeChip.setVisibility(View.GONE);
        release();
        index = i;
        item = list.optJSONObject(i);
        if (item == null) { finish(); return; }
        key = item.optString("id", "");
        if (key.isEmpty()) key = item.optString("url");
        title.setText(item.optString("title", "Vidéo"));
        sub.setText(item.optString("sub", ""));
        sub.setVisibility(item.optString("sub", "").isEmpty() ? View.GONE : View.VISIBLE);
        bPrev.setAlpha(i > 0 ? 1f : 0.3f); bPrev.setEnabled(i > 0);
        bNext.setAlpha(i < list.length() - 1 ? 1f : 0.3f); bNext.setEnabled(i < list.length() - 1);
        bSpeed.setText(fmtSpeed(speed));
        prepared = false; completed = false; vw = vh = 0; dur = 0; wantPlay = true;
        spin.setVisibility(View.VISIBLE);
        subT = null; subX = null; subs.setVisibility(View.GONE); bSubs.setVisibility(View.GONE);

        // Position mémorisée
        startAt = 0;
        try {
            JSONObject p = new JSONObject(prefs.getString("p:" + key, "{}"));
            if (!p.optBoolean("done") && p.optLong("pos") > 5000) startAt = (int) p.optLong("pos");
        } catch (Exception e) { }
        if (!external) {
            try { prefs.edit().putString("last", new JSONObject().put("list", list).put("index", i).toString()).apply(); } catch (Exception e) { }
        }

        String url = item.optString("url");
        if (EcranBridge.noStream(url)) { showError("Cette source ne peut pas être lue ici."); return; }
        mp = new MediaPlayer();
        try {
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            HashMap<String, String> hd = new HashMap<>();
            hd.put("User-Agent", "Mozilla/5.0 (Linux; Android 15) Ecran/1.0");
            mp.setDataSource(this, Uri.parse(url), hd);
            if (surfaceOk) mp.setDisplay(sv.getHolder());
            mp.setScreenOnWhilePlaying(true);
            mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() { public void onPrepared(MediaPlayer m) { onReady(); } });
            mp.setOnVideoSizeChangedListener(new MediaPlayer.OnVideoSizeChangedListener() { public void onVideoSizeChanged(MediaPlayer m, int w, int hh) {
                if (w > 0 && hh > 0 && (w != vw || hh != vh)) { vw = w; vh = hh; layoutVideo(); applyRotation(); updatePip(); } } });
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() { public void onCompletion(MediaPlayer m) { onEnd(); } });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() { public boolean onError(MediaPlayer m, int what, int extra) {
                showError(isNet(url) ? "Lecture impossible : la vidéo n'est pas disponible ou la connexion est coupée." : "Ce fichier ne peut pas être lu (format non pris en charge)."); return true; } });
            mp.setOnInfoListener(new MediaPlayer.OnInfoListener() { public boolean onInfo(MediaPlayer m, int what, int extra) {
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) spin.setVisibility(View.VISIBLE);
                else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) spin.setVisibility(View.GONE);
                return false; } });
            mp.setOnBufferingUpdateListener(new MediaPlayer.OnBufferingUpdateListener() { public void onBufferingUpdate(MediaPlayer m, int pct) { seek.setSecondaryProgress(pct * 10); } });
            mp.prepareAsync();
        } catch (Exception e) {
            showError("Impossible d'ouvrir cette vidéo.");
        }
        String srt = item.optString("srt", "");
        if (!srt.isEmpty()) loadSrt(srt);
        showControls();
    }

    private static boolean isNet(String u) { return u.startsWith("http"); }

    private void onReady() {
        prepared = true;
        dur = Math.max(0, mp.getDuration());
        tDur.setText(dur > 0 ? fmt(dur) : "Direct");
        seek.setEnabled(dur > 0);
        spin.setVisibility(View.GONE);
        if (vw == 0) { vw = mp.getVideoWidth(); vh = mp.getVideoHeight(); layoutVideo(); applyRotation(); }
        if (startAt > 0 && dur > 0 && startAt < dur - 5000) {
            mp.seekTo(startAt);
            resumeChip.setText("Reprise à " + fmt(startAt) + "  ·  Reprendre au début");
            resumeChip.setVisibility(View.VISIBLE);
            h.postDelayed(new Runnable() { public void run() { resumeChip.setVisibility(View.GONE); } }, 6000);
        }
        if (wantPlay) play(); else setPlayIcon(false);
        updatePip();
    }

    private boolean focus() {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                return am.requestAudioFocus(new android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
                    .setOnAudioFocusChangeListener(focusL).build()) != AudioManager.AUDIOFOCUS_REQUEST_FAILED;
            }
            return am.requestAudioFocus(focusL, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) != AudioManager.AUDIOFOCUS_REQUEST_FAILED;
        } catch (Exception e) { return true; }
    }
    private final AudioManager.OnAudioFocusChangeListener focusL = new AudioManager.OnAudioFocusChangeListener() {
        public void onAudioFocusChange(int f) { if (f == AudioManager.AUDIOFOCUS_LOSS || f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { if (mp != null && prepared && mp.isPlaying()) pause(); } }
    };

    private void play() {
        if (mp == null || !prepared) { wantPlay = true; return; }
        if (completed) { mp.seekTo(0); completed = false; }
        focus();
        try { mp.start(); } catch (Exception e) { }
        applySpeed();
        wantPlay = true;
        setPlayIcon(true);
        updatePip();
        h.removeCallbacks(hideCtl); h.postDelayed(hideCtl, 3000);
    }
    private void pause() {
        wantPlay = false;
        if (mp != null && prepared) { try { mp.pause(); } catch (Exception e) { } }
        setPlayIcon(false);
        savePos(true);
        updatePip();
        if (!locked) showControls();
    }
    private void toggle() { if (mp != null && prepared && mp.isPlaying()) pause(); else play(); }

    private int position() { try { return mp != null && prepared ? mp.getCurrentPosition() : 0; } catch (Exception e) { return 0; } }
    private void skip(int ms) { if (mp == null || !prepared || dur <= 0) return; seekTo(Math.max(0, Math.min(dur - 500, position() + ms))); }
    private void seekTo(int ms) {
        if (mp == null || !prepared) return;
        completed = false;
        try {
            if (Build.VERSION.SDK_INT >= 26 && !isNet(item.optString("url"))) mp.seekTo(ms, MediaPlayer.SEEK_CLOSEST);
            else mp.seekTo(ms);
        } catch (Exception e) { }
        tCur.setText(fmt(ms));
    }

    private void setSpeed(float s) {
        speed = s; prefs.edit().putFloat("speed", s).apply();
        bSpeed.setText(fmtSpeed(s));
        if (mp != null && prepared && mp.isPlaying()) applySpeed();
        flash("Vitesse " + fmtSpeed(s));
    }
    private void applySpeed() {
        if (mp == null || !prepared || !mp.isPlaying()) return;
        try { mp.setPlaybackParams(mp.getPlaybackParams().setSpeed(speed)); } catch (Exception e) { }
    }
    private void markSpeed() {
        LinearLayout chips = (LinearLayout) ((HorizontalScrollView) speedPanel.getChildAt(0)).getChildAt(0);
        for (int i = 0; i < chips.getChildCount(); i++) {
            TextView c = (TextView) chips.getChildAt(i);
            boolean on = Math.abs((Float) c.getTag() - speed) < 0.01f;
            c.setBackground(round(on ? ACC : 0x33FFFFFF, 16));
            c.setTextColor(on ? 0xFF1A0F0A : Color.WHITE);
        }
    }
    private static String fmtSpeed(float s) { String t = s == (int) s ? String.valueOf((int) s) : String.valueOf(s).replace('.', ','); return t + "×"; }

    private void setPlayIcon(boolean playing) {
        playIcon.setPath(playing ? "M8 5H10.5V19H8ZM13.5 5H16V19H13.5Z" : "M8 5V19L19 12Z");
        bPlay.setContentDescription(playing ? "Pause" : "Lecture");
    }

    private void onEnd() {
        completed = true;
        setPlayIcon(false);
        markDone();
        updatePip();
        if (index < list.length() - 1) {
            final JSONObject n = list.optJSONObject(index + 1);
            nextBox.setText("À suivre dans 5 s\n" + (n == null ? "" : n.optString("title")) + "\nToucher pour annuler");
            nextBox.setVisibility(View.VISIBLE);
            h.postDelayed(autoNext, 5000);
        } else { showControls(); }
    }
    private final Runnable autoNext = new Runnable() { public void run() { nextBox.setVisibility(View.GONE); load(index + 1); } };

    private void showError(String t) {
        spin.setVisibility(View.GONE);
        prepared = false;
        String u = item == null ? "" : item.optString("url");
        err.setText(t + (u.isEmpty() ? "" : "\n\nToucher ici pour l'ouvrir avec une autre appli"));
        err.setVisibility(View.VISIBLE);
        showControls();
    }
    private void openElsewhere() {
        try {
            String u = item.optString("url");
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(u), u.contains(".m3u8") ? "application/x-mpegURL" : "video/*");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "Ouvrir avec"));
        } catch (Exception e) { }
    }

    private void release() {
        if (mp != null) {
            try { mp.setOnErrorListener(null); mp.stop(); } catch (Exception e) { }
            try { mp.release(); } catch (Exception e) { }
            mp = null;
        }
        prepared = false;
    }

    // ---------- Mémorisation de la position ----------
    private void savePos(boolean force) {
        if (mp == null || !prepared || dur <= 0 || key.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (!force && now - lastSave < 5000) return;
        lastSave = now;
        int pos = position();
        if (pos < 3000 && !completed) return;
        boolean done = completed || pos > dur - Math.min(30000, dur * 0.05);
        writePos(done ? 0 : pos, done);
    }
    private void markDone() { if (dur > 0) writePos(0, true); }
    private void writePos(int pos, boolean done) {
        try {
            JSONObject o = new JSONObject();
            o.put("pos", pos); o.put("dur", dur); o.put("at", System.currentTimeMillis()); o.put("done", done);
            JSONObject it = new JSONObject();
            it.put("url", item.optString("url")); it.put("title", item.optString("title")); it.put("sub", item.optString("sub"));
            String th = item.optString("thumb", ""); if (th.startsWith("http")) it.put("thumb", th);
            if (external) it.put("ext", true);
            o.put("item", it);
            prefs.edit().putString("p:" + key, o.toString()).apply();
            EcranBridge b = EcranBridge.current == null ? null : EcranBridge.current.get();
            if (b != null) b.progressChanged();
        } catch (Exception e) { }
    }

    private final Runnable tick = new Runnable() { public void run() {
        try {
            if (mp != null && prepared) {
                int p = position();
                if (!seeking && dur > 0) { seek.setProgress((int) ((long) p * 1000 / dur)); tCur.setText(fmt(p)); }
                else if (dur <= 0) tCur.setText(fmt(p));
                if (mp.isPlaying()) savePos(false);
                if (subT != null && subOn) showSub(p);
            }
        } catch (Exception e) { }
        h.postDelayed(this, 250);
    } };

    static String fmt(long ms) {
        long s = Math.max(0, ms / 1000), hh = s / 3600, m = s % 3600 / 60, x = s % 60;
        return hh > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", hh, m, x) : String.format(Locale.ROOT, "%d:%02d", m, x);
    }

    // ---------- Format et rotation ----------
    private void layoutVideo() {
        if (vw <= 0 || vh <= 0) return;
        int W = root.getWidth(), H = root.getHeight();
        if (W == 0 || H == 0) { root.post(new Runnable() { public void run() { layoutVideo(); } }); return; }
        float va = (float) vw / vh, sa = (float) W / H;
        int w, hh;
        if (format == 1) { w = W; hh = H; }                                   // Remplir (étiré)
        else if ((format == 2) == (va > sa)) { hh = H; w = Math.round(H * va); } // Zoom : couvre l'écran / Ajuster : tient en hauteur
        else { w = W; hh = Math.round(W / va); }
        if (format == 0 && w > W) { w = W; hh = Math.round(W / va); }
        if (format == 0 && hh > H) { hh = H; w = Math.round(H * va); }
        sv.setLayoutParams(new FrameLayout.LayoutParams(w, hh, Gravity.CENTER));
    }

    private void applyRotation() {
        int o;
        if (rot == 1) o = ActivityInfo.SCREEN_ORIENTATION_FULL_USER;
        else if (rot == 2) o = ActivityInfo.SCREEN_ORIENTATION_LOCKED;
        else if (vw > 0 && vh > 0) o = vw > vh * 1.05f ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        else o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
        if (getRequestedOrientation() != o) setRequestedOrientation(o);
    }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        root.post(new Runnable() { public void run() { layoutVideo(); } });
    }

    // ---------- Surface ----------
    public void surfaceCreated(SurfaceHolder holder) { surfaceOk = true; if (mp != null) { try { mp.setDisplay(holder); } catch (Exception e) { } } }
    public void surfaceChanged(SurfaceHolder holder, int f, int w, int hh) { }
    public void surfaceDestroyed(SurfaceHolder holder) { surfaceOk = false; if (mp != null) { try { mp.setDisplay(null); } catch (Exception e) { } } }

    // ---------- Image dans l'image ----------
    private void enterPip() {
        if (Build.VERSION.SDK_INT < 26) return;
        try { enterPictureInPictureMode(pipParams()); } catch (Exception e) { flash("Image dans l'image indisponible"); }
    }
    private PictureInPictureParams pipParams() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder();
        if (vw > 0 && vh > 0) {
            float r = Math.max(1 / 2.39f, Math.min(2.39f, (float) vw / vh));
            b.setAspectRatio(new Rational(Math.round(r * 1000), 1000));
        }
        ArrayList<RemoteAction> acts = new ArrayList<>();
        acts.add(action("R12 12 8 -60 -280M5.2 5V9.2H9.4", "Reculer de 10 s", 1));
        boolean playing = mp != null && prepared && mp.isPlaying();
        acts.add(action(playing ? "M8 5H10.5V19H8ZM13.5 5H16V19H13.5Z" : "M8 5V19L19 12Z", playing ? "Pause" : "Lecture", 2));
        acts.add(action("R12 12 8 240 280M18.8 5V9.2H14.6", "Avancer de 10 s", 3));
        b.setActions(acts);
        if (Build.VERSION.SDK_INT >= 31) { b.setAutoEnterEnabled(playing); b.setSeamlessResizeEnabled(true); }
        return b.build();
    }
    private RemoteAction action(String path, String label, int code) {
        android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(96, 96, android.graphics.Bitmap.Config.ARGB_8888);
        IconDrawable d = new IconDrawable(path, Color.WHITE, 2f);
        d.setBounds(0, 0, 96, 96);
        d.draw(new Canvas(bm));
        Intent i = new Intent(ACT_PIP).setPackage(getPackageName()).putExtra("c", code);
        PendingIntent pi = PendingIntent.getBroadcast(this, 5850 + code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new RemoteAction(Icon.createWithBitmap(bm), label, label, pi);
    }
    private void updatePip() {
        if (Build.VERSION.SDK_INT < 26 || bPip == null) return;
        try { setPictureInPictureParams(pipParams()); } catch (Exception e) { }
    }
    @Override protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= 26 && Build.VERSION.SDK_INT < 31 && bPip != null && mp != null && prepared && mp.isPlaying()) enterPip();
    }
    @Override public void onPictureInPictureModeChanged(boolean pip, Configuration c) {
        super.onPictureInPictureModeChanged(pip, c);
        inPip = pip;
        if (pip) {
            ctl.setVisibility(View.GONE); indicator.setVisibility(View.GONE); resumeChip.setVisibility(View.GONE); bUnlock.setVisibility(View.GONE);
            if (pipRx == null) {
                pipRx = new BroadcastReceiver() { public void onReceive(Context cx, Intent i) {
                    int code = i.getIntExtra("c", 0);
                    if (code == 1) skip(-10000); else if (code == 3) skip(10000); else if (code == 2) toggle();
                } };
                if (Build.VERSION.SDK_INT >= 33) registerReceiver(pipRx, new IntentFilter(ACT_PIP), Context.RECEIVER_NOT_EXPORTED);
                else registerReceiver(pipRx, new IntentFilter(ACT_PIP));
            }
        } else {
            if (pipRx != null) { try { unregisterReceiver(pipRx); } catch (Exception e) { } pipRx = null; }
            immersive();
            if (!isFinishing()) showControls();
        }
        root.post(new Runnable() { public void run() { layoutVideo(); } });
    }

    // ---------- Cycle de vie ----------
    @Override protected void onPause() {
        super.onPause();
        boolean pip = Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode();
        if (!pip && mp != null && prepared && mp.isPlaying()) pause();
        savePos(true);
    }
    @Override protected void onStop() {
        super.onStop();
        savePos(true);
        // Fenêtre image-dans-l'image fermée : on arrête
        if (inPip) { if (mp != null && prepared) { try { mp.pause(); } catch (Exception e) { } } finish(); }
    }
    @Override protected void onDestroy() {
        savePos(true);
        h.removeCallbacksAndMessages(null);
        release();
        try { if (noisy != null) unregisterReceiver(noisy); } catch (Exception e) { }
        try { if (pipRx != null) unregisterReceiver(pipRx); } catch (Exception e) { }
        try { am.abandonAudioFocus(focusL); } catch (Exception e) { }
        EcranBridge b = EcranBridge.current == null ? null : EcranBridge.current.get();
        if (b != null) b.emit("closed", positionsSafe(b));
        super.onDestroy();
    }
    private static String positionsSafe(EcranBridge b) { try { return b.positions(); } catch (Exception e) { return "{}"; } }

    // ---------- Sous-titres .srt ----------
    private void loadSrt(final String src) {
        new Thread(new Runnable() { public void run() {
            try {
                InputStream in;
                HttpURLConnection c = null;
                if (src.startsWith("http")) {
                    c = (HttpURLConnection) new URL(src).openConnection();
                    c.setConnectTimeout(12000); c.setReadTimeout(20000);
                    in = c.getInputStream();
                } else in = getContentResolver().openInputStream(Uri.parse(src));
                BufferedReader r = new BufferedReader(new InputStreamReader(in, "UTF-8"));
                StringBuilder sb = new StringBuilder(); String line;
                while ((line = r.readLine()) != null) sb.append(line).append('\n');
                r.close(); if (c != null) c.disconnect();
                final List<long[]> t = new ArrayList<>(); final List<String> x = new ArrayList<>();
                Pattern p = Pattern.compile("(\\d+):(\\d+):(\\d+)[,.](\\d+)\\s*-->\\s*(\\d+):(\\d+):(\\d+)[,.](\\d+)");
                for (String blk : sb.toString().replace("\r", "").replace("﻿", "").split("\n\\s*\n")) {
                    Matcher m = p.matcher(blk);
                    if (!m.find()) continue;
                    long a = ms(m, 1), b = ms(m, 5);
                    String txt = blk.substring(m.end()).trim().replaceAll("<[^>]+>", "").replaceAll("\\{[^}]+\\}", "");
                    if (txt.isEmpty()) continue;
                    t.add(new long[]{ a, b }); x.add(txt);
                }
                if (t.isEmpty()) return;
                h.post(new Runnable() { public void run() { subT = t; subX = x; bSubs.setVisibility(View.VISIBLE); } });
            } catch (Exception e) { }
        } }).start();
    }
    private static long ms(Matcher m, int g) {
        String f = m.group(g + 3); while (f.length() < 3) f += "0";
        return (Long.parseLong(m.group(g)) * 3600 + Long.parseLong(m.group(g + 1)) * 60 + Long.parseLong(m.group(g + 2))) * 1000 + Long.parseLong(f.substring(0, 3));
    }
    private void showSub(int p) {
        String s = null;
        for (int i = 0; i < subT.size(); i++) { long[] r = subT.get(i); if (p >= r[0] && p <= r[1]) { s = subX.get(i); break; } if (r[0] > p) break; }
        if (s == null) { subs.setVisibility(View.GONE); return; }
        if (!s.contentEquals(subs.getText())) subs.setText(s);
        subs.setVisibility(View.VISIBLE);
    }

    // =====================================================================
    /** Icône en traits (mini-langage de chemin dans une grille 24×24) :
     *  M L H V C Q Z comme en SVG (majuscules, absolu), A rx ry rot large sweep x y (arc), R cx cy r départ balayage (arc en degrés), O cx cy r (cercle). */
    static class IconDrawable extends Drawable {
        static final String SUN = "O12 12 4M12 2V4M12 20V22M2 12H4M20 12H22M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9";
        static final String VOL = "M4 9H8L13 5V19L8 15H4ZM16.5 9A4 4 0 0 1 16.5 15M19 6.5A7.5 7.5 0 0 1 19 17.5";
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        private Path path;
        private final float stroke;
        String label = null;
        boolean fill = false;
        IconDrawable(String d, int color, float stroke) {
            this.stroke = stroke;
            p.setColor(color); p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND);
            tp.setColor(color); tp.setTextAlign(Paint.Align.CENTER); tp.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
            path = parse(d);
        }
        void setPath(String d) { path = parse(d); invalidateSelf(); }
        static Path parse(String d) {
            Path pa = new Path();
            Matcher m = Pattern.compile("([MLHVCQZAROmlhvcqzaro])([^MLHVCQZAROmlhvcqzaro]*)").matcher(d);
            float cx = 0, cy = 0;
            while (m.find()) {
                char c = Character.toUpperCase(m.group(1).charAt(0));
                String[] s = m.group(2).trim().isEmpty() ? new String[0] : m.group(2).trim().split("[\\s,]+");
                float[] v = new float[s.length];
                for (int i = 0; i < s.length; i++) v[i] = Float.parseFloat(s[i]);
                switch (c) {
                    case 'M': pa.moveTo(cx = v[0], cy = v[1]); for (int i = 2; i + 1 < v.length; i += 2) pa.lineTo(cx = v[i], cy = v[i + 1]); break;
                    case 'L': for (int i = 0; i + 1 < v.length; i += 2) pa.lineTo(cx = v[i], cy = v[i + 1]); break;
                    case 'H': pa.lineTo(cx = v[0], cy); break;
                    case 'V': pa.lineTo(cx, cy = v[0]); break;
                    case 'C': pa.cubicTo(v[0], v[1], v[2], v[3], cx = v[4], cy = v[5]); break;
                    case 'Q': pa.quadTo(v[0], v[1], cx = v[2], cy = v[3]); break;
                    case 'Z': pa.close(); break;
                    case 'O': pa.addCircle(v[0], v[1], v[2], Path.Direction.CW); break;
                    case 'R': { RectF r = new RectF(v[0] - v[2], v[1] - v[2], v[0] + v[2], v[1] + v[2]); pa.arcTo(r, v[3], v[4], true);
                        double e = Math.toRadians(v[3] + v[4]); cx = (float) (v[0] + v[2] * Math.cos(e)); cy = (float) (v[1] + v[2] * Math.sin(e)); break; }
                    case 'A': { float[] e = arc(pa, cx, cy, v[0], v[1], v[3] != 0, v[4] != 0, v[5], v[6]); cx = e[0]; cy = e[1]; break; }
                    default: break;
                }
            }
            return pa;
        }
        /** Arc SVG (rayons égaux suffisent ici) converti en arcTo */
        private static float[] arc(Path pa, float x1, float y1, float rx, float ry, boolean large, boolean sweep, float x2, float y2) {
            float r = Math.max(rx, ry);
            double dx = (x2 - x1) / 2.0, dy = (y2 - y1) / 2.0, d2 = dx * dx + dy * dy;
            if (d2 == 0) return new float[]{ x2, y2 };
            if (r * r < d2) r = (float) Math.sqrt(d2);
            double k = Math.sqrt(Math.max(0, r * r - d2) / d2) * (large == sweep ? -1 : 1);
            double mx = (x1 + x2) / 2.0, my = (y1 + y2) / 2.0;
            double ccx = mx - k * dy, ccy = my + k * dx;
            double a1 = Math.toDegrees(Math.atan2(y1 - ccy, x1 - ccx)), a2 = Math.toDegrees(Math.atan2(y2 - ccy, x2 - ccx));
            double sw = a2 - a1;
            if (sweep && sw < 0) sw += 360; if (!sweep && sw > 0) sw -= 360;
            pa.arcTo(new RectF((float) (ccx - r), (float) (ccy - r), (float) (ccx + r), (float) (ccy + r)), (float) a1, (float) sw, false);
            return new float[]{ x2, y2 };
        }
        @Override public void draw(Canvas c) {
            android.graphics.Rect b = getBounds();
            float s = Math.min(b.width(), b.height()) / 24f;
            c.save();
            c.translate(b.left + (b.width() - 24 * s) / 2f, b.top + (b.height() - 24 * s) / 2f);
            c.scale(s, s);
            p.setStrokeWidth(stroke);
            if (fill) { p.setStyle(Paint.Style.FILL_AND_STROKE); } else p.setStyle(Paint.Style.STROKE);
            c.drawPath(path, p);
            if (label != null) { tp.setTextSize(6.6f); c.drawText(label, 12, 14.4f, tp); }
            c.restore();
        }
        @Override public void setAlpha(int a) { p.setAlpha(a); tp.setAlpha(a); }
        @Override public void setColorFilter(ColorFilter cf) { p.setColorFilter(cf); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
