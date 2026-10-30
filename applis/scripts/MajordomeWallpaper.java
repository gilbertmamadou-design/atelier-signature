package __PKG__;

// Majordome : fond d'écran animé « sphère » (WallpaperService, rendu Canvas), visible derrière les icônes de n'importe quel lanceur.
//  - même sphère que l'appli (points sur une spirale de Fibonacci, perspective, bruit lisse, halo), code propre au projet
//  - réagit doucement au toucher (pulsation, léger déplacement) et au défilement des pages du lanceur (parallaxe)
//  - pause complète quand le fond n'est pas visible (écran éteint, appli ouverte par-dessus : onVisibilityChanged)
//  - 15 images/s au repos, 30 pendant 4 s après un toucher ou pendant que Majordome parle, 8 en économie d'énergie ;
//    « Supprimer les animations » d'Android : une image fixe
//  - pulse quand Majordome parle (appel direct dans le même processus, depuis la synthèse vocale de MajordomeBridge)
//  - réglages (couleur, densité, vitesse, pulsation) dans Majordome › Réglages › Fond d'écran animé
// Sphere : les calculs de la sphère, sans Android (aussi utilisés pour l'image du widget, et testables sur PC).

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.service.wallpaper.WallpaperService;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import org.json.JSONObject;

public class MajordomeWallpaper extends WallpaperService {
    static final String PREFS = "mj_wallpaper";
    // Couleurs proposées : aucune couleur de marque, celles de l'appli et quelques variantes neutres
    static final String[] COLOR_IDS = { "turquoise", "bleu", "violet", "vert", "ambre", "blanc" };
    static final int[] COLORS = { 0xFF46D9C2, 0xFF7DC8FF, 0xFF9680FF, 0xFF60FFA0, 0xFFFFC46B, 0xFFE6F0F0 };

    static volatile boolean speaking = false;
    static volatile long voiceAt = 0;
    /** Majordome parle (début / fin d'une phrase) : la sphère du fond d'écran pulse */
    static void voice(boolean on) { speaking = on; voiceAt = SystemClock.uptimeMillis(); }

    // ---------- Réglages ----------
    static JSONObject settings(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject o = new JSONObject();
        try {
            o.put("color", p.getString("color", "turquoise")).put("density", p.getString("density", "normale"))
             .put("speed", p.getString("speed", "normale")).put("pulse", p.getBoolean("pulse", true)).put("black", p.getBoolean("black", false));
        } catch (Exception e) { }
        return o;
    }
    static void save(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            String col = o.optString("color", "turquoise"); boolean okc = false; for (String s : COLOR_IDS) if (s.equals(col)) okc = true;
            e.putString("color", okc ? col : "turquoise");
            String d = o.optString("density", "normale"); e.putString("density", d.matches("legere|normale|dense") ? d : "normale");
            String s = o.optString("speed", "normale"); e.putString("speed", s.matches("lente|normale|rapide") ? s : "normale");
            e.putBoolean("pulse", o.optBoolean("pulse", true)).putBoolean("black", o.optBoolean("black", false)).apply();
        } catch (Exception e) { }
    }
    static int colorOf(String id) { for (int i = 0; i < COLOR_IDS.length; i++) if (COLOR_IDS[i].equals(id)) return COLORS[i]; return COLORS[0]; }
    static int countOf(String d) { return "legere".equals(d) ? 260 : "dense".equals(d) ? 760 : 460; }
    static double speedOf(String s) { return "lente".equals(s) ? 0.5 : "rapide".equals(s) ? 1.7 : 1.0; }

    // ---------- Calculs de la sphère (Java pur) ----------
    static final class Sphere {
        final int n; final float[] p;   // x, y, z, phase, vitesse
        Sphere(int n, long seed) {
            this.n = n; p = new float[n * 5];
            java.util.Random r = new java.util.Random(seed);
            double ga = Math.PI * (3 - Math.sqrt(5));
            for (int i = 0; i < n; i++) {
                double y = 1 - (i / (double) (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = ga * i;
                p[i * 5] = (float) (Math.cos(th) * rr); p[i * 5 + 1] = (float) y; p[i * 5 + 2] = (float) (Math.sin(th) * rr);
                p[i * 5 + 3] = (float) (r.nextDouble() * 6.283); p[i * 5 + 4] = (float) (0.6 + r.nextDouble() * 0.8);
            }
        }
        /** Projette les points : out = [x, y, taille, opacité] par point ; t en secondes, amp = amplitude du bruit (0,05 au repos) */
        void project(double t, double rot, double tilt, double amp, float cx, float cy, float radius, float[] out) {
            double cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
            float sc = Math.max(1f, radius / 120f);
            for (int i = 0; i < n; i++) {
                int k = i * 5;
                double nz = amp == 0 ? 0 : Math.sin(t * p[k + 4] * 2.1 + p[k + 3]) * Math.sin(p[k + 1] * 4 + t * 1.3) * amp;
                double x = p[k] * (1 + nz), y = p[k + 1] * (1 + nz), z = p[k + 2] * (1 + nz);
                double x1 = x * cr + z * sr, z1 = -x * sr + z * cr, y1 = y * ct - z1 * st, z2 = y * st + z1 * ct;
                double persp = 1.9 / (2.6 - z2), depth = (z2 + 1) / 2;
                out[i * 4] = (float) (cx + x1 * radius * persp);
                out[i * 4 + 1] = (float) (cy + y1 * radius * persp);
                out[i * 4 + 2] = (float) ((0.8 + depth * 1.7) * sc);
                out[i * 4 + 3] = (float) (0.18 + depth * 0.72);
            }
        }
    }

    /** Dessine une sphère complète (halo + points) sur un Canvas Android : fond d'écran et image du widget */
    static void drawSphere(Canvas c, Sphere s, float[] buf, Paint paint, int color, double t, double rot, double amp, float cx, float cy, float radius, float glow) {
        int r = Color.red(color), g = Color.green(color), b = Color.blue(color);
        paint.setShader(new RadialGradient(cx, cy, radius * 1.6f, new int[]{ Color.argb((int) (255 * Math.min(0.5f, 0.1f + glow)), r, g, b), Color.argb(0, r, g, b) }, null, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, radius * 1.6f, paint);
        paint.setShader(null);
        s.project(t, rot, 0.35, amp, cx, cy, radius, buf);
        for (int i = 0; i < s.n; i++) {
            float x = buf[i * 4], y = buf[i * 4 + 1], z = buf[i * 4 + 2];
            paint.setColor(Color.argb((int) (255 * buf[i * 4 + 3]), r, g, b));
            c.drawRect(x - z / 2, y - z / 2, x + z / 2, y + z / 2, paint);
        }
    }

    @Override public Engine onCreateEngine() { return new E(); }

    class E extends Engine {
        final Handler h = new Handler(Looper.getMainLooper());
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Runnable tick = new Runnable() { public void run() { frame(); } };
        Sphere sphere; float[] buf;
        boolean visible = false, still = false, black = false, pulse = true;
        int color = COLORS[0]; double speed = 1, rot = 0, burst = 0, level = 0;
        float offX = 0.5f, touchX = 0, touchY = 0, shiftX = 0, shiftY = 0;
        long t0 = SystemClock.uptimeMillis(), last = 0, touchAt = 0, psAt = 0;
        boolean powerSave = false; Shader bg; int bgH;
        int w = 0, hh = 0;

        @Override public void onCreate(SurfaceHolder s) { super.onCreate(s); setTouchEventsEnabled(true); load(); }
        void load() {
            JSONObject o = settings(MajordomeWallpaper.this);
            color = colorOf(o.optString("color")); speed = speedOf(o.optString("speed")); pulse = o.optBoolean("pulse", true); black = o.optBoolean("black", false);
            int n = countOf(o.optString("density"));
            if (sphere == null || sphere.n != n) { sphere = new Sphere(n, 7); buf = new float[n * 4]; }
            try { still = Settings.Global.getFloat(getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f; } catch (Throwable t) { still = false; }
        }
        @Override public void onVisibilityChanged(boolean v) {
            visible = v;
            h.removeCallbacks(tick);
            if (v) { load(); last = 0; h.post(tick); }   // en pause dès qu'il est caché : plus aucun calcul
        }
        @Override public void onSurfaceChanged(SurfaceHolder s, int f, int width, int height) { super.onSurfaceChanged(s, f, width, height); w = width; hh = height; if (visible) { h.removeCallbacks(tick); h.post(tick); } }
        @Override public void onSurfaceDestroyed(SurfaceHolder s) { visible = false; h.removeCallbacks(tick); super.onSurfaceDestroyed(s); }
        @Override public void onDestroy() { h.removeCallbacks(tick); super.onDestroy(); }
        @Override public void onOffsetsChanged(float xo, float yo, float xs, float ys, int xp, int yp) { offX = xo; if (still && visible) { h.removeCallbacks(tick); h.post(tick); } }
        @Override public void onTouchEvent(MotionEvent e) {
            if (e.getAction() == MotionEvent.ACTION_DOWN) {
                burst = Math.min(0.5, burst + 0.25); touchAt = SystemClock.uptimeMillis();
                touchX = (e.getX() / Math.max(1, w) - 0.5f); touchY = (e.getY() / Math.max(1, hh) - 0.5f);
                if (visible && !still) { h.removeCallbacks(tick); h.post(tick); }
            }
        }
        void frame() {
            if (!visible) return;
            long now = SystemClock.uptimeMillis();
            double dt = last == 0 ? 0.033 : Math.min(0.2, (now - last) / 1000.0); last = now;
            boolean talk = pulse && (speaking || now - voiceAt < 600);
            double target = 0;
            if (talk) { double s = now - voiceAt; target = 0.35 + 0.3 * Math.abs(Math.sin(s / 95.0)) * (0.6 + 0.4 * Math.sin(s / 410.0)); }
            level += (target - level) * 0.2;
            burst *= 0.9;
            rot += dt * 0.25 * speed * (talk ? 1.6 : 1);
            // léger déplacement vers le dernier toucher, qui revient doucement au centre
            float k = now - touchAt < 2500 ? 0.06f : 0.03f, tx = now - touchAt < 2500 ? touchX * 0.06f : 0, ty = now - touchAt < 2500 ? touchY * 0.04f : 0;
            shiftX += (tx - shiftX) * k; shiftY += (ty - shiftY) * k;
            SurfaceHolder sh = getSurfaceHolder(); Canvas c = null;
            try {
                c = Build.VERSION.SDK_INT >= 26 ? sh.lockHardwareCanvas() : sh.lockCanvas();
                if (c != null) {
                    int W = c.getWidth(), H = c.getHeight();
                    if (black) c.drawColor(0xFF000000);
                    else {
                        if (bg == null || bgH != H) { bgH = H; bg = new android.graphics.LinearGradient(0, 0, 0, H, 0xFF06141A, 0xFF02070A, Shader.TileMode.CLAMP); }
                        paint.setShader(bg);
                        c.drawRect(0, 0, W, H, paint); paint.setShader(null);
                    }
                    float m = Math.min(W, H), radius = (float) (m * 0.30 * (1 + 0.025 * Math.sin((now - t0) / 1000.0 * 1.1) + level * 0.18 + burst * 0.2));
                    float cx = W / 2f + (0.5f - offX) * m * 0.12f + shiftX * W, cy = H * 0.42f + shiftY * H;
                    drawSphere(c, sphere, buf, paint, color, still ? 0 : (now - t0) / 1000.0 * speed, still ? 0.6 : rot, still ? 0 : 0.05 + level * 0.25 + burst * 0.3, cx, cy, radius, (float) (level * 0.25 + burst * 0.2));
                }
            } catch (Throwable t) { }
            finally { if (c != null) try { sh.unlockCanvasAndPost(c); } catch (Throwable t) { } }
            if (still) return;   // image fixe : redessinée seulement quand elle redevient visible ou que la page change
            int fps = talk || now - touchAt < 4000 || burst > 0.02 ? 30 : 15;
            if (now - psAt > 5000) { psAt = now; try { powerSave = ((PowerManager) getSystemService(POWER_SERVICE)).isPowerSaveMode(); } catch (Throwable t) { } }
            if (powerSave) fps = 8;
            h.postDelayed(tick, 1000 / fps);
        }
    }
}
