package __PKG__;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.MeteringRectangle;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.ExifInterface;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaActionSound;
import android.media.MediaRecorder;
import android.media.ThumbnailUtils;
import android.media.ToneGenerator;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Range;
import android.util.Size;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.OrientationEventListener;
import android.view.ScaleGestureDetector;
import android.view.GestureDetector;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Photo : appareil photo de chantier (Camera2), plein écran, interface construite en code.
 * Enregistre dans DCIM/Photo (ou DCIM/Photo/<Chantier> en mode chantier) via MediaStore,
 * avec EXIF (date, orientation, GPS) et bandeau incrusté (date, adresse, chantier, note).
 * Réglages partagés avec la page (PhotoBridge) : SharedPreferences « photo ».
 */
public class PhotoCamera extends Activity {
    static final String PREFS = "photo";
    static final String ROOT = "DCIM/Photo";
    private static final int REQ_PERMS = 5401, REQ_AUDIO = 5402;
    private static final int SDK = Build.VERSION.SDK_INT;
    private static final int ST_PREVIEW = 0, ST_LOCK = 1, ST_PRE = 2, ST_NONPRE = 3, ST_SHOT = 4;
    static final String NIGHT_MSG = "La caméra de vision de nuit n'est pas proposée par Android aux autres applications sur ce téléphone : seule l'appli photo d'origine du fabricant peut l'utiliser. Pour la vision de nuit, ouvre l'appli photo d'origine.";

    // Couleurs maison
    private static final int C_BG = 0xff0f1116, C_BG2 = 0xff181b23, C_BG3 = 0xff222632, C_ACC = 0xff8fb4ff, C_TX = 0xfff2f3f7, C_TX2 = 0xffb4b8c7, C_OK = 0xff6fd6a4, C_BAD = 0xffff6b6b;

    // ================= Objectifs =================
    static final class Lens {
        String key, openId, physId, role = "autre", label, conf = "";
        CameraCharacteristics c, lc;
        int facing, sensorOri;
        Size std, max; boolean ultra, mono, nir, flash, usable, logical, fixedFocus;
        float focal, minFocus; long px;
    }

    static long area(Size s) { return s == null ? 0 : (long) s.getWidth() * s.getHeight(); }
    static Size biggest(Size[] a) { Size b = null; if (a != null) for (Size s : a) if (area(s) > area(b)) b = s; return b; }
    static boolean hasCap(CameraCharacteristics c, int cap) {
        int[] caps = c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
        if (caps != null) for (int x : caps) if (x == cap) return true;
        return false;
    }
    static String mp(Size s) {
        double m = area(s) / 1e6;
        return m >= 10 ? String.valueOf(Math.round(m)) : String.format(Locale.FRANCE, "%.1f", m);
    }

    static Lens lensOf(String openId, String physId, CameraCharacteristics c, CameraCharacteristics lc) {
        Lens l = new Lens();
        l.openId = openId; l.physId = physId; l.c = c; l.lc = lc;
        l.key = openId + (physId == null ? "" : "/" + physId);
        Integer f = c.get(CameraCharacteristics.LENS_FACING); l.facing = f == null ? CameraCharacteristics.LENS_FACING_BACK : f;
        Integer o = c.get(CameraCharacteristics.SENSOR_ORIENTATION); l.sensorOri = o == null ? 90 : o;
        l.usable = hasCap(c, CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE);
        StreamConfigurationMap m = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        if (m != null) {
            Size a = biggest(m.getOutputSizes(ImageFormat.JPEG));
            Size b = null; try { b = biggest(m.getHighResolutionOutputSizes(ImageFormat.JPEG)); } catch (Throwable e) { }
            l.std = area(b) > area(a) ? b : a;
        }
        if (l.std == null) l.usable = false;
        l.max = l.std;
        if (SDK >= 31 && hasCap(c, 16 /* ULTRA_HIGH_RESOLUTION_SENSOR */)) {
            try {
                StreamConfigurationMap um = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP_MAXIMUM_RESOLUTION);
                Size u = um == null ? null : biggest(um.getOutputSizes(ImageFormat.JPEG));
                if (area(u) > area(l.std)) { l.max = u; l.ultra = true; }
            } catch (Throwable e) { }
        }
        l.px = area(l.max);
        if (SDK >= 28) l.mono = hasCap(c, 12 /* MONOCHROME */);
        if (SDK >= 28) l.logical = hasCap(c, 11 /* LOGICAL_MULTI_CAMERA */);
        Integer cfa = c.get(CameraCharacteristics.SENSOR_INFO_COLOR_FILTER_ARRANGEMENT);
        if (cfa != null && cfa == 5) l.mono = true;
        if (cfa != null && cfa == 6) l.nir = true;
        float[] fl = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS); l.focal = fl != null && fl.length > 0 ? fl[0] : 0;
        Float mf = c.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE); l.minFocus = mf == null ? 0 : mf;
        l.fixedFocus = mf == null || mf == 0f;
        Boolean fa = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE); l.flash = fa != null && fa;
        return l;
    }

    static List<Lens> enumerate(CameraManager cm) {
        List<Lens> out = new ArrayList<>();
        try {
            String[] ids = cm.getCameraIdList();
            Set<String> known = new HashSet<>(Arrays.asList(ids));
            for (String id : ids) {
                try {
                    CameraCharacteristics c = cm.getCameraCharacteristics(id);
                    out.add(lensOf(id, null, c, c));
                    if (SDK >= 28 && hasCap(c, 11)) {
                        for (String pid : c.getPhysicalCameraIds()) {
                            if (known.contains(pid)) continue;
                            known.add(pid);
                            try { out.add(lensOf(id, pid, cm.getCameraCharacteristics(pid), c)); } catch (Throwable e) { }
                        }
                    }
                } catch (Throwable e) { }
            }
        } catch (Throwable e) { }
        assignRoles(out);
        return out;
    }

    static void assignRoles(List<Lens> ls) {
        Lens main = null, front = null, night = null, macro = null;
        for (Lens l : ls) {
            if (!l.usable) continue;
            if (l.facing == CameraCharacteristics.LENS_FACING_FRONT) { if (front == null || l.px > front.px) front = l; continue; }
            if (l.nir || l.mono) continue;
            if (main == null || l.px > main.px || (l.px == main.px && main.physId != null && l.physId == null)) main = l;
        }
        for (Lens l : ls) {
            if (!l.usable || l == main || l.facing == CameraCharacteristics.LENS_FACING_FRONT) continue;
            if (l.nir) { night = l; night.conf = "infrarouge"; break; }
        }
        if (night == null) for (Lens l : ls) {
            if (!l.usable || l == main || l.facing == CameraCharacteristics.LENS_FACING_FRONT) continue;
            if (l.mono) { night = l; night.conf = "monochrome"; break; }
        }
        // Repli : capteur arrière d'environ 8 Mpx (la vision de nuit de l'Oukitel WP60), sans certitude
        if (night == null) for (Lens l : ls) {
            if (!l.usable || l == main || l.facing == CameraCharacteristics.LENS_FACING_FRONT) continue;
            if (l.px >= 5_000_000L && l.px <= 20_000_000L && l.minFocus < 15f) { night = l; night.conf = "probable"; break; }
        }
        for (Lens l : ls) {
            if (!l.usable || l == main || l == night || l.facing == CameraCharacteristics.LENS_FACING_FRONT) continue;
            if (l.px <= 5_500_000L && (macro == null || l.minFocus > macro.minFocus)) macro = l;
        }
        int n = 1;
        for (Lens l : ls) {
            if (l == main) { l.role = "principal"; l.label = "Principal"; }
            else if (l == front) { l.role = "avant"; l.label = "Avant"; }
            else if (l == night) { l.role = "nuit"; l.label = "Nuit"; }
            else if (l == macro) { l.role = "macro"; l.label = "Macro"; }
            else { l.role = "autre"; l.label = "Objectif " + (++n); }
        }
    }

    static String facingName(int f) { return f == CameraCharacteristics.LENS_FACING_FRONT ? "avant" : f == CameraCharacteristics.LENS_FACING_BACK ? "arrière" : "externe"; }

    /** Description de tous les objectifs, en JSON (utilisé aussi par PhotoBridge, par réflexion). */
    public static String describe(Context ctx) {
        JSONObject r = new JSONObject();
        try {
            CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
            List<Lens> ls = enumerate(cm);
            JSONArray a = new JSONArray();
            boolean night = false;
            for (Lens l : ls) {
                JSONObject o = new JSONObject();
                o.put("key", l.key); o.put("id", l.openId); o.put("phys", l.physId == null ? "" : l.physId);
                o.put("role", l.role); o.put("label", l.label); o.put("conf", l.conf);
                o.put("facing", facingName(l.facing)); o.put("usable", l.usable); o.put("logical", l.logical);
                o.put("orientation", l.sensorOri);
                if (l.std != null) { o.put("w", l.std.getWidth()); o.put("h", l.std.getHeight()); o.put("mp", mp(l.std)); }
                if (l.max != null) { o.put("maxW", l.max.getWidth()); o.put("maxH", l.max.getHeight()); o.put("maxMp", mp(l.max)); }
                o.put("ultra", l.ultra); o.put("mono", l.mono); o.put("nir", l.nir); o.put("flash", l.flash);
                o.put("focal", Math.round(l.focal * 100) / 100.0);
                o.put("minFocusCm", l.minFocus > 0 ? Math.round(100.0 / l.minFocus) : 0);
                if ("nuit".equals(l.role)) night = true;
                a.put(o);
            }
            r.put("lenses", a); r.put("night", night); r.put("nightMsg", night ? "" : NIGHT_MSG);
            r.put("model", Build.MANUFACTURER + " " + Build.MODEL); r.put("sdk", SDK);
        } catch (Throwable e) { try { r.put("error", String.valueOf(e.getMessage())); } catch (Throwable x) { } }
        return r.toString();
    }

    // ================= État =================
    private SharedPreferences sp;
    private CameraManager cm;
    private List<Lens> lenses = new ArrayList<>();
    private Lens lens;
    private CameraDevice dev;
    private CameraCaptureSession session;
    private CaptureRequest.Builder pb;
    private ImageReader reader;
    private Surface previewSurface;
    private Size capSize, prevSize;
    private boolean ultra, ultraFailed;
    private HandlerThread bgT; private Handler bg;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService saver = Executors.newSingleThreadExecutor();
    private final ExecutorService geoEx = Executors.newSingleThreadExecutor();
    private final Semaphore lock = new Semaphore(1);
    private final ConcurrentLinkedQueue<Meta> metas = new ConcurrentLinkedQueue<>();
    private volatile int state = ST_PREVIEW;
    private int devOri = 0, uiRot = 0;
    private float zoom = 1f, zMin = 1f, zMax = 1f;
    private boolean useZoomRatio;
    private MeteringRectangle[] focusRegion;
    private boolean resumed, captureIntent;
    private int shots = 0;
    private Uri lastUri; private boolean lastVideo;

    // Vidéo
    private boolean videoMode, recording;
    private MediaRecorder rec; private ParcelFileDescriptor recPfd; private Uri recUri; private File recFile; private long recStart;

    // Position
    private LocationManager lm;
    private volatile Location loc; private volatile String addr; private volatile Location addrLoc;
    private long geoAt;

    // Capteurs
    private SensorManager sm;
    private float gx = 0, gy = 9.8f, gz = 0;
    private OrientationEventListener orient;
    private MediaActionSound sound;
    private ToneGenerator tone;

    // Interface
    private FrameLayout root;
    private TextureView tv;
    private Overlay ov;
    private View flashCurtain;
    private TextView hint, bFlashL, bTimerL, bGridL, bLevelL, bQualL, siteChip, noteChip, modeChip, zoom1, zoom2, mPhoto, mVideo, recTime;
    private Ico bFlashI;
    private LinearLayout lensRow, siteRow;
    private ImageView thumb;
    private Shutter shutter;
    private final List<View> rotating = new ArrayList<>();
    private int W, H, topH;
    private int countdown = 0;
    private final Runnable tick = new Runnable() { public void run() { countdownTick(); } };

    private float dp(float v) { return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
    private int dpi(float v) { return Math.round(dp(v)); }
    private boolean can(String p) { return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private String pref(String k, String d) { return sp.getString(k, d); }
    private boolean prefB(String k, boolean d) { return sp.getBoolean(k, d); }

    // ================= Cycle de vie =================
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        captureIntent = getIntent() != null && MediaStore.ACTION_IMAGE_CAPTURE.equals(getIntent().getAction());
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (SDK >= 28) { WindowManager.LayoutParams lp = w.getAttributes(); lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES; w.setAttributes(lp); }
        w.setStatusBarColor(Color.BLACK); w.setNavigationBarColor(Color.BLACK);
        DisplayMetrics dm = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(dm);
        W = Math.min(dm.widthPixels, dm.heightPixels); H = Math.max(dm.widthPixels, dm.heightPixels);
        topH = dpi(74);
        cm = (CameraManager) getSystemService(CAMERA_SERVICE);
        lenses = enumerate(cm);
        String want = pref("lens", "");
        for (Lens l : lenses) if (l.usable && l.key.equals(want)) lens = l;
        if (lens == null) for (Lens l : lenses) if ("principal".equals(l.role)) lens = l;
        if (lens == null) for (Lens l : lenses) if (l.usable) { lens = l; break; }
        try { sound = new MediaActionSound(); sound.load(MediaActionSound.SHUTTER_CLICK); } catch (Throwable e) { }
        try { tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70); } catch (Throwable e) { }
        sm = (SensorManager) getSystemService(SENSOR_SERVICE);
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        orient = new OrientationEventListener(this) {
            @Override public void onOrientationChanged(int o) {
                if (o == ORIENTATION_UNKNOWN) return;
                int r = ((o + 45) / 90 * 90) % 360;
                if (r != devOri) { devOri = r; rotateUi(); }
            }
        };
        buildUi();
        List<String> need = new ArrayList<>();
        if (!can(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
        if (prefB("geo", true) && !can(Manifest.permission.ACCESS_FINE_LOCATION)) { need.add(Manifest.permission.ACCESS_FINE_LOCATION); need.add(Manifest.permission.ACCESS_COARSE_LOCATION); }
        if (SDK <= 28 && !can(Manifest.permission.WRITE_EXTERNAL_STORAGE)) need.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_PERMS);
        lastFromPrefs();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        immersive();
        startBg();
        if (tv.isAvailable()) openCamera();
        if (orient.canDetectOrientation()) orient.enable();
        Sensor acc = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (acc != null) sm.registerListener(sensorL, acc, SensorManager.SENSOR_DELAY_UI);
        startLocation();
        refreshUi();
    }

    @Override protected void onPause() {
        resumed = false;
        cancelCountdown();
        if (recording) stopRecording(false);
        closeCamera();
        stopBg();
        orient.disable();
        if (sm != null) sm.unregisterListener(sensorL);
        stopLocation();
        super.onPause();
    }

    @Override protected void onDestroy() {
        try { if (sound != null) sound.release(); } catch (Throwable e) { }
        try { if (tone != null) tone.release(); } catch (Throwable e) { }
        saver.shutdown(); geoEx.shutdown();
        super.onDestroy();
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }

    @SuppressWarnings("deprecation")
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onRequestPermissionsResult(int req, String[] p, int[] r) {
        super.onRequestPermissionsResult(req, p, r);
        if (req == REQ_PERMS) {
            if (can(Manifest.permission.CAMERA)) { if (resumed && tv.isAvailable()) openCamera(); }
            else showBlocked();
            startLocation();
        } else if (req == REQ_AUDIO) {
            info(can(Manifest.permission.RECORD_AUDIO) ? "Micro autorisé : appuie pour filmer" : "Vidéo sans son (micro refusé)");
            sp.edit().putBoolean("audioAsked", true).apply();
        }
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_CAMERA) {
            if (e.getRepeatCount() == 0) shutterPressed();
            return true;
        }
        if (code == KeyEvent.KEYCODE_FOCUS) return true;
        return super.onKeyDown(code, e);
    }
    @Override public boolean onKeyUp(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_CAMERA) return true;
        return super.onKeyUp(code, e);
    }

    @Override public void onBackPressed() {
        if (countdown > 0) { cancelCountdown(); return; }
        if (recording) { stopRecording(true); return; }
        leave(false);
    }

    private void leave(boolean toApp) {
        Intent d = new Intent().putExtra("shots", shots);
        if (lastUri != null) d.putExtra("last", lastUri.toString());
        setResult(shots > 0 ? RESULT_OK : RESULT_CANCELED, d);
        if (toApp && isTaskRoot()) {
            try { Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName()); if (i != null) startActivity(i); } catch (Throwable e) { }
        }
        finish();
    }

    // ================= Fil de la caméra =================
    private void startBg() { if (bgT != null) return; bgT = new HandlerThread("photo-cam"); bgT.start(); bg = new Handler(bgT.getLooper()); }
    private void stopBg() {
        if (bgT == null) return;
        bgT.quitSafely();
        try { bgT.join(1500); } catch (InterruptedException e) { }
        bgT = null; bg = null;
    }

    // ================= Tailles =================
    private void chooseSizes() {
        StreamConfigurationMap map = lens.c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        boolean max = !"std".equals(pref("quality", "max"));
        ultra = false;
        if (max) {
            if (lens.ultra && !ultraFailed) { capSize = lens.max; ultra = true; }
            else capSize = lens.std;
        } else {
            // 12 Mpx (rapide) : la plus grande taille <= 13 Mpx au même format que le capteur
            double ar = (double) lens.std.getWidth() / lens.std.getHeight();
            Size best = null;
            List<Size> all = new ArrayList<>(Arrays.asList(map.getOutputSizes(ImageFormat.JPEG)));
            for (Size s : all) {
                if (area(s) > 13_000_000L) continue;
                if (Math.abs((double) s.getWidth() / s.getHeight() - ar) > 0.03) continue;
                if (area(s) > area(best)) best = s;
            }
            capSize = best != null ? best : lens.std;
        }
        double ar = (double) capSize.getWidth() / capSize.getHeight();
        Size bp = null, any = null;
        for (Size s : map.getOutputSizes(SurfaceTexture.class)) {
            if (s.getWidth() > 1920 || s.getHeight() > 1440) continue;
            if (area(s) > area(any)) any = s;
            if (Math.abs((double) s.getWidth() / s.getHeight() - ar) < 0.03 && area(s) > area(bp)) bp = s;
        }
        prevSize = bp != null ? bp : any != null ? any : new Size(1280, 960);
        // Zoom
        CameraCharacteristics zc = lens.lc;
        useZoomRatio = false; zMin = 1f; zMax = 1f;
        if (SDK >= 30 && lens.physId == null) {
            Range<Float> r = zc.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE);
            if (r != null) { useZoomRatio = true; zMin = Math.max(1f, r.getLower()); zMax = r.getUpper(); }
        }
        if (!useZoomRatio) { Float m = zc.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM); zMax = m == null ? 1f : m; }
        zoom = Math.max(zMin, Math.min(zoom, zMax));
    }

    private void layoutPreview() {
        boolean rot = lens.sensorOri == 90 || lens.sensorOri == 270;
        float pw = rot ? prevSize.getHeight() : prevSize.getWidth(), ph = rot ? prevSize.getWidth() : prevSize.getHeight();
        int vh = Math.round(W * ph / pw);
        int top = vh + topH <= H - dpi(220) ? topH : Math.max(0, (H - vh) / 2 - dpi(40));
        if (vh > H) top = 0;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(W, vh, Gravity.TOP);
        lp.topMargin = top;
        tv.setLayoutParams(lp);
        FrameLayout.LayoutParams lo = new FrameLayout.LayoutParams(W, vh, Gravity.TOP);
        lo.topMargin = top;
        ov.setLayoutParams(lo);
        flashCurtain.setLayoutParams(new FrameLayout.LayoutParams(W, vh, Gravity.TOP) {{ topMargin = lo.topMargin; }});
        FrameLayout.LayoutParams zl = (FrameLayout.LayoutParams) siteRow.getLayoutParams();
        zl.topMargin = top + dpi(10); siteRow.setLayoutParams(zl);
        FrameLayout.LayoutParams hl = (FrameLayout.LayoutParams) hint.getLayoutParams();
        hl.topMargin = top + dpi(58); hint.setLayoutParams(hl);
    }

    // ================= Ouverture =================
    private void openCamera() {
        if (!can(Manifest.permission.CAMERA) || dev != null || bg == null) return;
        if (lens == null) { info("Aucune caméra utilisable n'est déclarée par Android"); return; }
        try {
            chooseSizes();
            layoutPreview();
            refreshUi();
            if (!lock.tryAcquire(2500, TimeUnit.MILLISECONDS)) { info("Caméra occupée, réessaie"); return; }
            cm.openCamera(lens.openId, devCb, bg);
        } catch (SecurityException e) { lock.release(); showBlocked(); }
        catch (Throwable e) { lock.release(); info("Caméra indisponible : " + e.getMessage()); }
    }

    private final CameraDevice.StateCallback devCb = new CameraDevice.StateCallback() {
        @Override public void onOpened(CameraDevice d) { lock.release(); dev = d; createSession(false); }
        @Override public void onDisconnected(CameraDevice d) { lock.release(); d.close(); if (dev == d) dev = null; }
        @Override public void onError(CameraDevice d, int err) {
            lock.release(); d.close(); if (dev == d) dev = null;
            info(err == ERROR_CAMERA_IN_USE || err == ERROR_MAX_CAMERAS_IN_USE ? "Caméra utilisée par une autre application" : "Erreur de la caméra (" + err + ")");
        }
    };

    private void closeSession() {
        try { if (session != null) session.close(); } catch (Throwable e) { }
        session = null;
        try { if (reader != null) reader.close(); } catch (Throwable e) { }
        reader = null;
    }

    private void closeCamera() {
        try {
            lock.acquire();
            closeSession();
            try { if (dev != null) dev.close(); } catch (Throwable e) { }
            dev = null;
        } catch (InterruptedException e) { }
        finally { lock.release(); }
        state = ST_PREVIEW;
    }

    private void reopen() { closeCamera(); focusRegion = null; ui.postDelayed(new Runnable() { public void run() { if (resumed) openCamera(); } }, 60); }

    @SuppressWarnings("deprecation")
    private void createSession(final boolean forVideo) {
        if (dev == null) return;
        try {
            SurfaceTexture st = tv.getSurfaceTexture();
            if (st == null) return;
            st.setDefaultBufferSize(prevSize.getWidth(), prevSize.getHeight());
            previewSurface = new Surface(st);
            Surface second;
            if (forVideo) second = rec.getSurface();
            else {
                reader = ImageReader.newInstance(capSize.getWidth(), capSize.getHeight(), ImageFormat.JPEG, 2);
                reader.setOnImageAvailableListener(onJpeg, bg);
                second = reader.getSurface();
            }
            CameraCaptureSession.StateCallback cb = new CameraCaptureSession.StateCallback() {
                @Override public void onConfigured(CameraCaptureSession s) {
                    if (dev == null) return;
                    session = s;
                    try {
                        pb = dev.createCaptureRequest(forVideo ? CameraDevice.TEMPLATE_RECORD : CameraDevice.TEMPLATE_PREVIEW);
                        pb.addTarget(previewSurface);
                        if (forVideo) pb.addTarget(rec.getSurface());
                        applyCommon(pb, forVideo);
                        s.setRepeatingRequest(pb.build(), capCb, bg);
                        state = ST_PREVIEW;
                        if (forVideo) beginRecording();
                    } catch (Throwable e) { info("Aperçu impossible : " + e.getMessage()); }
                }
                @Override public void onConfigureFailed(CameraCaptureSession s) {
                    if (ultra && !forVideo) {
                        ultraFailed = true;
                        info("Pleine résolution refusée par le téléphone : retour à " + mp(lens.std) + " Mpx");
                        ui.post(new Runnable() { public void run() { reopen(); } });
                    } else info("Configuration de la caméra impossible");
                }
            };
            boolean cfg = SDK >= 24 && ((lens.physId != null && SDK >= 28) || ultra);
            if (cfg) {
                List<OutputConfiguration> outs = new ArrayList<>();
                OutputConfiguration p = new OutputConfiguration(previewSurface);
                OutputConfiguration j = new OutputConfiguration(second);
                if (lens.physId != null && SDK >= 28) { p.setPhysicalCameraId(lens.physId); j.setPhysicalCameraId(lens.physId); }
                if (ultra && SDK >= 31 && !forVideo) {
                    p.addSensorPixelModeUsed(CameraMetadata.SENSOR_PIXEL_MODE_DEFAULT);
                    j.addSensorPixelModeUsed(CameraMetadata.SENSOR_PIXEL_MODE_MAXIMUM_RESOLUTION);
                }
                outs.add(p); outs.add(j);
                dev.createCaptureSessionByOutputConfigurations(outs, cb, bg);
            } else dev.createCaptureSession(Arrays.asList(previewSurface, second), cb, bg);
        } catch (Throwable e) {
            if (ultra && !ultraFailed) { ultraFailed = true; info("Pleine résolution indisponible : retour à la taille standard"); ui.post(new Runnable() { public void run() { reopen(); } }); }
            else info("Session impossible : " + e.getMessage());
        }
    }

    private boolean afMode(int m) {
        int[] a = lens.lc.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
        if (a != null) for (int x : a) if (x == m) return true;
        return false;
    }

    private void applyCommon(CaptureRequest.Builder b, boolean forVideo) {
        b.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
        if (focusRegion != null && afMode(CameraMetadata.CONTROL_AF_MODE_AUTO)) b.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_AUTO);
        else if (!forVideo && afMode(CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE)) b.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
        else if (forVideo && afMode(CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO)) b.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO);
        applyFlash(b, forVideo);
        applyZoom(b);
        Integer maxAf = lens.lc.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF), maxAe = lens.lc.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AE);
        if (maxAf != null && maxAf > 0) b.set(CaptureRequest.CONTROL_AF_REGIONS, focusRegion);
        if (maxAe != null && maxAe > 0) b.set(CaptureRequest.CONTROL_AE_REGIONS, focusRegion);
    }

    private void applyFlash(CaptureRequest.Builder b, boolean forVideo) {
        String f = pref("flash", "auto");
        if (!lens.flash) { b.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON); return; }
        if ("torch".equals(f)) { b.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON); b.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_TORCH); }
        else if (forVideo || "off".equals(f)) { b.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON); b.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_OFF); }
        else if ("on".equals(f)) { b.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON_ALWAYS_FLASH); b.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_OFF); }
        else { b.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON_AUTO_FLASH); b.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_OFF); }
    }

    private Rect activeArray() { return lens.lc.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE); }
    private Rect cropFor(Rect a, float z) {
        int cw = Math.round(a.width() / z), ch = Math.round(a.height() / z);
        int l = a.left + (a.width() - cw) / 2, t = a.top + (a.height() - ch) / 2;
        return new Rect(l, t, l + cw, t + ch);
    }
    private void applyZoom(CaptureRequest.Builder b) {
        if (useZoomRatio && SDK >= 30) b.set(CaptureRequest.CONTROL_ZOOM_RATIO, zoom);
        else { Rect a = activeArray(); if (a != null) b.set(CaptureRequest.SCALER_CROP_REGION, zoom <= 1.001f ? a : cropFor(a, zoom)); }
    }

    private void repeat() {
        if (session == null || pb == null) return;
        try {
            pb.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_IDLE);
            pb.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_IDLE);
            session.setRepeatingRequest(pb.build(), capCb, bg);
        } catch (Throwable e) { }
    }

    private void setZoom(float z) {
        zoom = Math.max(zMin, Math.min(zMax, z));
        if (pb != null) { applyZoom(pb); repeat(); }
        ov.zoomShown = System.currentTimeMillis(); ov.invalidate();
        refreshZoomChips();
    }

    // ================= Mise au point au toucher =================
    private final Runnable focusReset = new Runnable() { public void run() { focusRegion = null; if (pb != null && bg != null) bg.post(new Runnable() { public void run() { if (pb != null) { applyCommon(pb, recording); repeat(); } } }); } };

    private void focusAt(float x, float y) {
        if (session == null || pb == null || state != ST_PREVIEW) return;
        Rect act = activeArray(); if (act == null) return;
        float nx = x / ov.getWidth(), ny = y / ov.getHeight();
        if (lens.facing == CameraCharacteristics.LENS_FACING_FRONT) nx = 1 - nx;
        float sx, sy;
        switch (lens.sensorOri) {
            case 90: sx = ny; sy = 1 - nx; break;
            case 270: sx = 1 - ny; sy = nx; break;
            case 180: sx = 1 - nx; sy = 1 - ny; break;
            default: sx = nx; sy = ny;
        }
        Rect crop = useZoomRatio ? act : cropFor(act, zoom);
        int cx = crop.left + Math.round(sx * crop.width()), cy = crop.top + Math.round(sy * crop.height());
        int half = Math.round(Math.min(crop.width(), crop.height()) * 0.08f);
        Rect r = new Rect(Math.max(act.left, cx - half), Math.max(act.top, cy - half), Math.min(act.right - 1, cx + half), Math.min(act.bottom - 1, cy + half));
        focusRegion = new MeteringRectangle[]{ new MeteringRectangle(r, MeteringRectangle.METERING_WEIGHT_MAX - 1) };
        ov.focus(x, y);
        final boolean vid = recording;
        bg.post(new Runnable() { public void run() {
            try {
                applyCommon(pb, vid);
                pb.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_CANCEL);
                session.capture(pb.build(), null, bg);
                if (!lens.fixedFocus) {
                    pb.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_START);
                    session.capture(pb.build(), capCb, bg);
                }
                repeat();
            } catch (Throwable e) { }
        } });
        ui.removeCallbacks(focusReset); ui.postDelayed(focusReset, 8000);
    }

    // ================= Prise de vue =================
    private final CameraCaptureSession.CaptureCallback capCb = new CameraCaptureSession.CaptureCallback() {
        private void process(CaptureResult r) {
            Integer af = r.get(CaptureResult.CONTROL_AF_STATE), ae = r.get(CaptureResult.CONTROL_AE_STATE);
            if (state == ST_PREVIEW) {
                if (focusRegion != null && af != null) ov.focusState(af == CaptureResult.CONTROL_AF_STATE_FOCUSED_LOCKED ? 1 : af == CaptureResult.CONTROL_AF_STATE_NOT_FOCUSED_LOCKED ? -1 : 0);
                return;
            }
            if (state == ST_LOCK) {
                if (af == null || af == CaptureResult.CONTROL_AF_STATE_FOCUSED_LOCKED || af == CaptureResult.CONTROL_AF_STATE_NOT_FOCUSED_LOCKED) {
                    if (needPrecapture(ae)) precapture(); else captureStill();
                }
            } else if (state == ST_PRE) {
                if (ae == null || ae == CaptureResult.CONTROL_AE_STATE_PRECAPTURE || ae == CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED || ae == CaptureResult.CONTROL_AE_STATE_CONVERGED) state = ST_NONPRE;
            } else if (state == ST_NONPRE) {
                if (ae == null || ae != CaptureResult.CONTROL_AE_STATE_PRECAPTURE) captureStill();
            }
        }
        @Override public void onCaptureProgressed(CameraCaptureSession s, CaptureRequest q, CaptureResult r) { process(r); }
        @Override public void onCaptureCompleted(CameraCaptureSession s, CaptureRequest q, TotalCaptureResult r) { process(r); }
    };

    private boolean needPrecapture(Integer ae) {
        String f = pref("flash", "auto");
        if (!lens.flash || "off".equals(f) || "torch".equals(f)) return false;
        if ("on".equals(f)) return true;
        return ae == null || ae == CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED || ae == CaptureResult.CONTROL_AE_STATE_SEARCHING;
    }

    private final Runnable shotTimeout = new Runnable() { public void run() { if (state == ST_LOCK || state == ST_PRE || state == ST_NONPRE) captureStill(); } };

    private void takePicture() {
        if (session == null || pb == null || reader == null || state != ST_PREVIEW) return;
        try {
            if (!lens.fixedFocus && focusRegion == null && afMode(CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE)) {
                state = ST_LOCK;
                pb.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_START);
                session.capture(pb.build(), capCb, bg);
                pb.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_IDLE);
            } else if (needPrecapture(null)) precapture();
            else { state = ST_LOCK; captureStill(); }
            bg.postDelayed(shotTimeout, 2500);
        } catch (Throwable e) { state = ST_PREVIEW; info("Prise de vue impossible"); }
    }

    private void precapture() {
        try {
            state = ST_PRE;
            pb.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_START);
            session.capture(pb.build(), capCb, bg);
            pb.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_IDLE);
        } catch (Throwable e) { captureStill(); }
    }

    private int jpegOrientation() {
        boolean front = lens.facing == CameraCharacteristics.LENS_FACING_FRONT;
        return (lens.sensorOri + (front ? -devOri : devOri) + 360) % 360;
    }

    private void captureStill() {
        if (state == ST_SHOT || state == ST_PREVIEW && reader == null) return;
        state = ST_SHOT;
        if (bg != null) bg.removeCallbacks(shotTimeout);
        try {
            CaptureRequest.Builder b = dev.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            b.addTarget(reader.getSurface());
            applyCommon(b, false);
            b.set(CaptureRequest.JPEG_ORIENTATION, jpegOrientation());
            b.set(CaptureRequest.JPEG_QUALITY, (byte) 95);
            Location l = loc;
            if (l != null && prefB("geo", true)) { try { b.set(CaptureRequest.JPEG_GPS_LOCATION, l); } catch (Throwable e) { } }
            if (ultra && SDK >= 31) {
                // Pleine résolution (capteur « Quad Bayer » 108 Mpx) : les zones de mesure seraient dans un autre repère, on les retire
                b.set(CaptureRequest.SENSOR_PIXEL_MODE, CameraMetadata.SENSOR_PIXEL_MODE_MAXIMUM_RESOLUTION);
                b.set(CaptureRequest.CONTROL_AF_REGIONS, null); b.set(CaptureRequest.CONTROL_AE_REGIONS, null);
            }
            metas.add(snapshot());
            session.capture(b.build(), new CameraCaptureSession.CaptureCallback() {
                @Override public void onCaptureStarted(CameraCaptureSession s, CaptureRequest q, long ts, long fn) {
                    if (prefB("sound", true) || MediaActionSound.mustPlayShutterSound()) { try { sound.play(MediaActionSound.SHUTTER_CLICK); } catch (Throwable e) { } }
                    ui.post(new Runnable() { public void run() { flashCurtain.setAlpha(0.85f); flashCurtain.animate().alpha(0f).setDuration(260).start(); } });
                }
                @Override public void onCaptureCompleted(CameraCaptureSession s, CaptureRequest q, TotalCaptureResult r) { unlock(); }
                @Override public void onCaptureFailed(CameraCaptureSession s, CaptureRequest q, android.hardware.camera2.CaptureFailure f) {
                    metas.poll(); unlock(); info("La photo a échoué, réessaie");
                }
            }, bg);
        } catch (Throwable e) { metas.poll(); unlock(); info("La photo a échoué : " + e.getMessage()); }
    }

    private void unlock() {
        try {
            if (pb != null && session != null && !lens.fixedFocus) {
                pb.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_CANCEL);
                session.capture(pb.build(), null, bg);
            }
        } catch (Throwable e) { }
        state = ST_PREVIEW;
        repeat();
    }

    private final ImageReader.OnImageAvailableListener onJpeg = new ImageReader.OnImageAvailableListener() {
        @Override public void onImageAvailable(ImageReader r) {
            Image img = null; byte[] data;
            try {
                img = r.acquireNextImage();
                if (img == null) return;
                ByteBuffer buf = img.getPlanes()[0].getBuffer();
                data = new byte[buf.remaining()]; buf.get(data);
            } catch (Throwable e) { info("Lecture de l'image impossible"); return; }
            finally { if (img != null) img.close(); }
            Meta m = metas.poll(); if (m == null) m = snapshot();
            final byte[] d = data; final Meta mm = m;
            ui.post(new Runnable() { public void run() { shutter.busy(true); } });
            saver.execute(new Runnable() { public void run() { save(d, mm); } });
        }
    };

    // ================= Minuteur =================
    private void shutterPressed() {
        if (videoMode) { if (recording) stopRecording(true); else startRecording(); return; }
        if (countdown > 0) { cancelCountdown(); return; }
        shutter.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        int t = sp.getInt("timer", 0);
        if (t > 0) { countdown = t; ov.count = t; ov.invalidate(); beep(); ui.postDelayed(tick, 1000); shutter.setCount(true); }
        else if (bg != null) bg.post(new Runnable() { public void run() { takePicture(); } });
    }
    private void countdownTick() {
        countdown--;
        ov.count = countdown; ov.invalidate();
        if (countdown <= 0) { shutter.setCount(false); if (bg != null) bg.post(new Runnable() { public void run() { takePicture(); } }); }
        else { beep(); ui.postDelayed(tick, 1000); }
    }
    private void cancelCountdown() { if (countdown <= 0) return; countdown = 0; ov.count = 0; ov.invalidate(); ui.removeCallbacks(tick); shutter.setCount(false); info("Minuteur annulé"); }
    private void beep() { try { if (tone != null) tone.startTone(ToneGenerator.TONE_PROP_BEEP, 120); } catch (Throwable e) { } }

    // ================= Métadonnées d'une prise =================
    static final class Meta {
        long t; Location l; String addr = "", site = "", siteDir = "", note = "", client = "";
        boolean siteMode, stamp, keepOrig, geo, front;
    }

    private Meta snapshot() {
        Meta m = new Meta();
        m.t = System.currentTimeMillis();
        m.geo = prefB("geo", true);
        m.l = m.geo ? loc : null;
        if (m.l != null && addrLoc != null && addr != null && m.l.distanceTo(addrLoc) < 80) m.addr = addr;
        m.siteMode = prefB("siteMode", false) && !captureIntent;
        try {
            JSONObject s = new JSONObject(pref("site", "{}"));
            m.site = s.optString("name", ""); m.siteDir = safeDir(s.optString("dir", m.site)); m.client = s.optString("client", "");
            if (m.addr.isEmpty() && m.l == null) m.addr = s.optString("addr", "");
        } catch (Throwable e) { }
        if (m.site.isEmpty()) m.siteMode = false;
        m.note = pref("note", "");
        m.stamp = prefB("stamp", true);
        m.keepOrig = prefB("keepOrig", true);
        m.front = lens != null && lens.facing == CameraCharacteristics.LENS_FACING_FRONT;
        return m;
    }

    static String safeDir(String s) {
        if (s == null) return "";
        s = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        while (s.startsWith(".")) s = s.substring(1);
        if (s.length() > 60) s = s.substring(0, 60).trim();
        return s;
    }

    static String locLine(Meta m) {
        if (m.addr != null && !m.addr.isEmpty()) return m.addr;
        if (m.l != null) return String.format(Locale.US, "GPS %.5f, %.5f (±%d m)", m.l.getLatitude(), m.l.getLongitude(), Math.round(m.l.getAccuracy()));
        return "";
    }

    static String[] bannerLines(Meta m) {
        List<String> l = new ArrayList<>();
        l.add(m.site.isEmpty() ? "Photo" : m.site + (m.client.isEmpty() ? "" : " · " + m.client));
        String d = new SimpleDateFormat("EEEE d MMMM yyyy · HH:mm", Locale.FRANCE).format(new Date(m.t));
        l.add(d.substring(0, 1).toUpperCase(Locale.FRANCE) + d.substring(1));
        String loc = locLine(m);
        l.add(loc.isEmpty() ? "Position inconnue" : loc);
        if (!m.note.trim().isEmpty()) l.add(m.note.trim());
        return l.toArray(new String[0]);
    }

    // ================= Enregistrement =================
    private void save(byte[] jpeg, Meta m) {
        File tmp = new File(getCacheDir(), "shot-" + m.t + ".jpg"), t2 = null;
        boolean ok = false;
        Uri main = null;
        try {
            try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(jpeg); }
            jpeg = null;
            ExifInterface ex = new ExifInterface(tmp.getAbsolutePath());
            int ori = ex.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (ori == ExifInterface.ORIENTATION_UNDEFINED) { ori = ExifInterface.ORIENTATION_NORMAL; }
            fillExif(ex, m);
            ex.saveAttributes();
            String name = "Photo_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date(m.t));
            String dir = m.siteMode ? m.siteDir : "";
            String desc = locLine(m) + (m.note.trim().isEmpty() ? "" : "\n" + m.note.trim());
            if (captureIntent) { deliverCapture(tmp); return; }
            if (m.siteMode && m.stamp) {
                t2 = new File(getCacheDir(), "stamp-" + m.t + ".jpg");
                stampFile(tmp, t2, ori, bannerLines(m));
                ExifInterface e2 = new ExifInterface(t2.getAbsolutePath());
                copyExif(ex, e2);
                e2.setAttribute(ExifInterface.TAG_ORIENTATION, String.valueOf(ori));
                e2.saveAttributes();
                main = insert(t2, name + ".jpg", dir, m.t, desc, false);
                if (m.keepOrig) insert(tmp, name + "_original.jpg", dir + "/Originaux", m.t, desc, false);
            } else main = insert(tmp, name + ".jpg", dir, m.t, desc, false);
            ok = main != null;
            if (ok) {
                shots++;
                lastUri = main; lastVideo = false;
                sp.edit().putString("lastUri", main.toString()).putLong("lastAt", m.t).putBoolean("lastVideo", false).apply();
                final Bitmap th = smallThumb(t2 != null ? t2 : tmp, ori);
                final String where = m.siteMode ? "Enregistrée dans " + m.site : "Enregistrée";
                ui.post(new Runnable() { public void run() { setThumb(th); info(where); } });
            }
        } catch (OutOfMemoryError e) {
            info("Mémoire insuffisante pour le bandeau : passe en 12 Mpx");
        } catch (Throwable e) {
            info("Enregistrement impossible : " + e.getMessage());
        } finally {
            tmp.delete(); if (t2 != null) t2.delete();
            ui.post(new Runnable() { public void run() { shutter.busy(false); } });
        }
    }

    private void deliverCapture(File f) {
        try {
            Uri out = getIntent().getParcelableExtra(MediaStore.EXTRA_OUTPUT);
            Intent r = new Intent();
            if (out != null) {
                try (InputStream in = new FileInputStream(f); OutputStream o = getContentResolver().openOutputStream(out)) { copy(in, o); }
            } else {
                Bitmap b = smallThumb(f, ExifInterface.ORIENTATION_NORMAL);
                r.putExtra("data", b);
            }
            setResult(RESULT_OK, r);
        } catch (Throwable e) { setResult(RESULT_CANCELED); }
        f.delete();
        ui.post(new Runnable() { public void run() { finish(); } });
    }

    static void copy(InputStream in, OutputStream o) throws java.io.IOException {
        byte[] b = new byte[1 << 16]; int n;
        while ((n = in.read(b)) > 0) o.write(b, 0, n);
    }

    /** Insère un fichier dans MediaStore, dans DCIM/Photo[/dir] */
    @SuppressWarnings("deprecation")
    private Uri insert(File f, String name, String dir, long t, String desc, boolean video) throws Exception {
        ContentResolver cr = getContentResolver();
        String rel = ROOT + (dir == null || dir.isEmpty() ? "" : "/" + dir);
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, video ? "video/mp4" : "image/jpeg");
        v.put(MediaStore.Images.ImageColumns.DATE_TAKEN, t);
        if (!video && desc != null) v.put(MediaStore.Images.ImageColumns.DESCRIPTION, desc);
        Uri u;
        if (SDK >= 29) {
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel + "/");
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            u = cr.insert(video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (u == null) throw new Exception("MediaStore refuse l'ajout");
            try (InputStream in = new FileInputStream(f); OutputStream o = cr.openOutputStream(u)) { copy(in, o); }
            ContentValues d = new ContentValues(); d.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(u, d, null, null);
        } else {
            File folder = new File(Environment.getExternalStorageDirectory(), rel);
            folder.mkdirs();
            File out = new File(folder, name);
            int i = 2; while (out.exists()) out = new File(folder, name.replaceFirst("(\\.[a-z0-9]+)$", "_" + (i++) + "$1"));
            try (InputStream in = new FileInputStream(f); OutputStream o = new FileOutputStream(out)) { copy(in, o); }
            v.put(MediaStore.MediaColumns.DATA, out.getAbsolutePath());
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, out.getName());
            u = cr.insert(video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        }
        return u;
    }

    // ================= EXIF =================
    static String ascii(String s) {
        if (s == null) return "";
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").replace("±", "+/-").replace("·", "-");
        return s.replaceAll("[^\\x20-\\x7E]", " ");
    }
    static String rational(double v) {
        v = Math.abs(v);
        int d = (int) v; v = (v - d) * 60; int mi = (int) v; v = (v - mi) * 60;
        return d + "/1," + mi + "/1," + Math.round(v * 10000) + "/10000";
    }
    void fillExif(ExifInterface ex, Meta m) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
        String d = f.format(new Date(m.t));
        ex.setAttribute(ExifInterface.TAG_DATETIME, d);
        ex.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, d);
        ex.setAttribute(ExifInterface.TAG_DATETIME_DIGITIZED, d);
        int off = TimeZone.getDefault().getOffset(m.t) / 60000;
        String os = String.format(Locale.US, "%s%02d:%02d", off < 0 ? "-" : "+", Math.abs(off) / 60, Math.abs(off) % 60);
        ex.setAttribute(ExifInterface.TAG_OFFSET_TIME, os);
        ex.setAttribute(ExifInterface.TAG_OFFSET_TIME_ORIGINAL, os);
        if (ex.getAttribute(ExifInterface.TAG_MAKE) == null) ex.setAttribute(ExifInterface.TAG_MAKE, Build.MANUFACTURER);
        if (ex.getAttribute(ExifInterface.TAG_MODEL) == null) ex.setAttribute(ExifInterface.TAG_MODEL, Build.MODEL);
        ex.setAttribute(ExifInterface.TAG_SOFTWARE, "Photo - MAG Formation 13");
        String author = sp.getString("author", "");
        if (!author.isEmpty()) ex.setAttribute(ExifInterface.TAG_ARTIST, ascii(author));
        String desc = (m.siteMode ? m.site + " - " : "") + locLine(m) + (m.note.isEmpty() ? "" : " - " + m.note);
        ex.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, ascii(desc));
        if (m.l != null) {
            double la = m.l.getLatitude(), lo = m.l.getLongitude();
            ex.setAttribute(ExifInterface.TAG_GPS_LATITUDE, rational(la));
            ex.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, la >= 0 ? "N" : "S");
            ex.setAttribute(ExifInterface.TAG_GPS_LONGITUDE, rational(lo));
            ex.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, lo >= 0 ? "E" : "W");
            if (m.l.hasAltitude()) {
                ex.setAttribute(ExifInterface.TAG_GPS_ALTITUDE, Math.round(Math.abs(m.l.getAltitude()) * 100) + "/100");
                ex.setAttribute(ExifInterface.TAG_GPS_ALTITUDE_REF, m.l.getAltitude() < 0 ? "1" : "0");
            }
            SimpleDateFormat g = new SimpleDateFormat("yyyy:MM:dd", Locale.US), h = new SimpleDateFormat("HH:mm:ss", Locale.US);
            g.setTimeZone(TimeZone.getTimeZone("UTC")); h.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date fix = new Date(m.l.getTime() > 0 ? m.l.getTime() : m.t);
            ex.setAttribute(ExifInterface.TAG_GPS_DATESTAMP, g.format(fix));
            String[] hp = h.format(fix).split(":");
            ex.setAttribute(ExifInterface.TAG_GPS_TIMESTAMP, hp[0] + "/1," + hp[1] + "/1," + hp[2] + "/1");
        }
    }
    static final String[] COPY_TAGS = {
        ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED, ExifInterface.TAG_OFFSET_TIME, ExifInterface.TAG_OFFSET_TIME_ORIGINAL,
        ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_SOFTWARE, ExifInterface.TAG_ARTIST, ExifInterface.TAG_IMAGE_DESCRIPTION,
        ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF,
        ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF, ExifInterface.TAG_GPS_DATESTAMP, ExifInterface.TAG_GPS_TIMESTAMP,
        ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_FLASH, ExifInterface.TAG_WHITE_BALANCE
    };
    static void copyExif(ExifInterface from, ExifInterface to) {
        for (String t : COPY_TAGS) { try { String v = from.getAttribute(t); if (v != null) to.setAttribute(t, v); } catch (Throwable e) { } }
        try { String v = from.getAttribute(ExifInterface.TAG_ISO_SPEED_RATINGS); if (v != null) to.setAttribute(ExifInterface.TAG_ISO_SPEED_RATINGS, v); } catch (Throwable e) { }
    }

    // ================= Bandeau incrusté =================
    /** Décode (réduit à 50 Mpx au plus), dessine le bandeau dans le sens d'affichage et réenregistre en JPEG. */
    static void stampFile(File in, File out, int ori, String[] lines) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(in.getAbsolutePath(), o);
        int s = 1;
        while ((long) (o.outWidth / s) * (o.outHeight / s) > 50_000_000L) s *= 2;
        Bitmap b = null;
        for (int tries = 0; b == null && tries < 3; tries++) {
            BitmapFactory.Options d = new BitmapFactory.Options();
            d.inSampleSize = s; d.inMutable = true; d.inPreferredConfig = Bitmap.Config.ARGB_8888;
            try { b = BitmapFactory.decodeFile(in.getAbsolutePath(), d); } catch (OutOfMemoryError e) { b = null; }
            if (b == null) s *= 2;
        }
        if (b == null) throw new Exception("image illisible");
        if (!b.isMutable()) { Bitmap c = b.copy(Bitmap.Config.ARGB_8888, true); b.recycle(); b = c; }
        drawBanner(new Canvas(b), b.getWidth(), b.getHeight(), ori, lines);
        try (FileOutputStream fo = new FileOutputStream(out)) { b.compress(Bitmap.CompressFormat.JPEG, 92, fo); }
        b.recycle();
    }

    /** Dessine le bandeau en bas de l'image telle qu'elle sera affichée (orientation EXIF prise en compte). */
    static void drawBanner(Canvas cv, int W, int H, int ori, String[] lines) {
        Matrix m = new Matrix(); int vw = W, vh = H;
        if (ori == ExifInterface.ORIENTATION_ROTATE_90) { m.setValues(new float[]{0, 1, 0, -1, 0, H, 0, 0, 1}); vw = H; vh = W; }
        else if (ori == ExifInterface.ORIENTATION_ROTATE_180) { m.setValues(new float[]{-1, 0, W, 0, -1, H, 0, 0, 1}); }
        else if (ori == ExifInterface.ORIENTATION_ROTATE_270) { m.setValues(new float[]{0, -1, W, 1, 0, 0, 0, 0, 1}); vw = H; vh = W; }
        cv.save(); cv.concat(m);
        float S = Math.min(vw, vh);
        float pad = S * 0.026f, acc = Math.max(3f, S * 0.008f);
        Paint t1 = new Paint(Paint.ANTI_ALIAS_FLAG); t1.setColor(Color.WHITE); t1.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD)); t1.setTextSize(S * 0.036f);
        Paint t2 = new Paint(Paint.ANTI_ALIAS_FLAG); t2.setColor(0xffe8ebf3); t2.setTextSize(S * 0.027f);
        float maxW = vw - pad * 3 - acc;
        List<String> ws = new ArrayList<>(); List<Paint> ps = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            Paint p = i == 0 ? t1 : t2;
            for (String w : wrap(p, lines[i], maxW, i == 0 ? 1 : 2)) { ws.add(w); ps.add(p); }
        }
        float h = pad * 2;
        for (int i = 0; i < ws.size(); i++) h += ps.get(i).getTextSize() * 1.32f;
        Paint bgp = new Paint(); bgp.setColor(0xc00b0d13);
        cv.drawRect(0, vh - h, vw, vh, bgp);
        Paint ap = new Paint(); ap.setColor(C_ACC);
        cv.drawRect(pad, vh - h + pad, pad + acc, vh - pad, ap);
        float y = vh - h + pad;
        for (int i = 0; i < ws.size(); i++) {
            Paint p = ps.get(i);
            y += p.getTextSize() * 1.32f;
            cv.drawText(ws.get(i), pad * 2 + acc, y - p.getTextSize() * 0.3f, p);
        }
        cv.restore();
    }

    static List<String> wrap(Paint p, String s, float maxW, int maxLines) {
        List<String> out = new ArrayList<>();
        String rest = s == null ? "" : s.trim();
        while (!rest.isEmpty() && out.size() < maxLines) {
            int n = p.breakText(rest, true, maxW, null);
            if (n >= rest.length()) { out.add(rest); rest = ""; break; }
            int cut = rest.lastIndexOf(' ', n);
            if (cut <= 0) cut = n;
            if (out.size() == maxLines - 1) {
                String l = rest;
                while (l.length() > 1 && p.measureText(l + "…") > maxW) l = l.substring(0, l.length() - 1);
                out.add(l.length() < rest.length() ? l.trim() + "…" : l); rest = ""; break;
            }
            out.add(rest.substring(0, cut).trim()); rest = rest.substring(cut).trim();
        }
        if (out.isEmpty()) out.add("");
        return out;
    }

    static Bitmap smallThumb(File f, int ori) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getAbsolutePath(), o);
            int s = 1; while (Math.min(o.outWidth, o.outHeight) / (s * 2) >= 200) s *= 2;
            BitmapFactory.Options d = new BitmapFactory.Options(); d.inSampleSize = s;
            Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath(), d);
            if (b == null) return null;
            int deg = ori == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : ori == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : ori == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            if (deg != 0) { Matrix m = new Matrix(); m.postRotate(deg); b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true); }
            return b;
        } catch (Throwable e) { return null; }
    }

    // ================= Vidéo =================
    private Size videoSize() {
        StreamConfigurationMap map = lens.c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size best = null, any = null;
        for (Size s : map.getOutputSizes(MediaRecorder.class)) {
            if (s.getWidth() > 1920 || s.getHeight() > 1080) continue;
            if (area(s) > area(any)) any = s;
            if (Math.abs((double) s.getWidth() / s.getHeight() - 16.0 / 9) < 0.02 && area(s) > area(best)) best = s;
        }
        return best != null ? best : any != null ? any : new Size(1280, 720);
    }

    @SuppressWarnings("deprecation")
    private void startRecording() {
        if (dev == null || recording) return;
        if (!can(Manifest.permission.RECORD_AUDIO) && !sp.getBoolean("audioAsked", false)) {
            requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_AUDIO); return;
        }
        final boolean audio = can(Manifest.permission.RECORD_AUDIO);
        final Meta m = snapshot();
        bg.post(new Runnable() { public void run() {
            try {
                closeSession();
                Size vs = videoSize();
                rec = SDK >= 31 ? new MediaRecorder(PhotoCamera.this) : new MediaRecorder();
                if (audio) rec.setAudioSource(MediaRecorder.AudioSource.CAMCORDER);
                rec.setVideoSource(MediaRecorder.VideoSource.SURFACE);
                rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                String name = "Video_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date(m.t)) + ".mp4";
                String rel = ROOT + (m.siteMode ? "/" + m.siteDir : "");
                if (SDK >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel + "/");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    v.put(MediaStore.Video.VideoColumns.DATE_TAKEN, m.t);
                    recUri = getContentResolver().insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                    recPfd = getContentResolver().openFileDescriptor(recUri, "w");
                    rec.setOutputFile(recPfd.getFileDescriptor());
                } else {
                    File folder = new File(Environment.getExternalStorageDirectory(), rel); folder.mkdirs();
                    recFile = new File(folder, name);
                    rec.setOutputFile(recFile.getAbsolutePath());
                }
                rec.setVideoEncodingBitRate(vs.getHeight() >= 1080 ? 16_000_000 : 8_000_000);
                rec.setVideoFrameRate(30);
                rec.setVideoSize(vs.getWidth(), vs.getHeight());
                rec.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
                if (audio) { rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); rec.setAudioEncodingBitRate(128000); rec.setAudioSamplingRate(44100); }
                rec.setOrientationHint(jpegOrientation());
                Location l = loc; if (l != null && m.geo) rec.setLocation((float) l.getLatitude(), (float) l.getLongitude());
                rec.prepare();
                createSession(true);
            } catch (Throwable e) {
                info("Vidéo impossible : " + e.getMessage());
                cleanupRecorder(true);
                createSession(false);
            }
        } });
    }

    private void beginRecording() {
        try {
            rec.start();
            recording = true; recStart = System.currentTimeMillis();
            ui.post(new Runnable() { public void run() { shutter.setRec(true); recTime.setVisibility(View.VISIBLE); updateRecTime(); refreshUi(); } });
        } catch (Throwable e) { info("Démarrage de la vidéo impossible"); cleanupRecorder(true); createSession(false); }
    }

    private void updateRecTime() {
        if (!recording) { recTime.setVisibility(View.GONE); return; }
        long s = (System.currentTimeMillis() - recStart) / 1000;
        recTime.setText(String.format(Locale.FRANCE, "%02d:%02d", s / 60, s % 60));
        ui.postDelayed(new Runnable() { public void run() { updateRecTime(); } }, 500);
    }

    private void stopRecording(final boolean reopenPhoto) {
        if (!recording) return;
        recording = false;
        Runnable r = new Runnable() { public void run() {
            boolean ok = true;
            try { session.stopRepeating(); } catch (Throwable e) { }
            try { rec.stop(); } catch (Throwable e) { ok = false; }
            cleanupRecorder(!ok);
            closeSession();
            if (ok) {
                shots++;
                Uri u = recUri;
                if (u != null) { lastUri = u; lastVideo = true; sp.edit().putString("lastUri", u.toString()).putBoolean("lastVideo", true).apply(); }
                final Bitmap th = videoThumb(u, recFile);
                ui.post(new Runnable() { public void run() { setThumb(th); info("Vidéo enregistrée"); } });
            } else info("Vidéo trop courte, non enregistrée");
            recUri = null; recFile = null;
            if (reopenPhoto && dev != null) createSession(false);
        } };
        ui.post(new Runnable() { public void run() { shutter.setRec(false); recTime.setVisibility(View.GONE); refreshUi(); } });
        if (bg != null && reopenPhoto) bg.post(r); else r.run();
    }

    private void cleanupRecorder(boolean failed) {
        try { if (rec != null) { rec.reset(); rec.release(); } } catch (Throwable e) { }
        rec = null;
        try { if (recPfd != null) recPfd.close(); } catch (Throwable e) { }
        recPfd = null;
        if (SDK >= 29 && recUri != null) {
            try {
                if (failed) { getContentResolver().delete(recUri, null, null); recUri = null; }
                else { ContentValues d = new ContentValues(); d.put(MediaStore.MediaColumns.IS_PENDING, 0); getContentResolver().update(recUri, d, null, null); }
            } catch (Throwable e) { }
        } else if (recFile != null) {
            if (failed) { recFile.delete(); recFile = null; }
            else {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DATA, recFile.getAbsolutePath());
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4");
                    recUri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
                } catch (Throwable e) { }
            }
        }
    }

    @SuppressWarnings("deprecation")
    private Bitmap videoThumb(Uri u, File f) {
        try {
            if (SDK >= 29 && u != null) return getContentResolver().loadThumbnail(u, new Size(300, 300), null);
            if (f != null) return ThumbnailUtils.createVideoThumbnail(f.getAbsolutePath(), MediaStore.Images.Thumbnails.MINI_KIND);
        } catch (Throwable e) { }
        return null;
    }

    // ================= Position =================
    private final LocationListener locL = new LocationListener() {
        @Override public void onLocationChanged(Location l) { gotLocation(l); }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
    };

    private void startLocation() {
        if (lm == null || !prefB("geo", true)) return;
        if (!can(Manifest.permission.ACCESS_FINE_LOCATION) && !can(Manifest.permission.ACCESS_COARSE_LOCATION)) return;
        try {
            for (String p : new String[]{ LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                if (!lm.isProviderEnabled(p)) continue;
                Location l = lm.getLastKnownLocation(p);
                if (l != null && System.currentTimeMillis() - l.getTime() < 10 * 60000L) gotLocation(l);
                lm.requestLocationUpdates(p, 2000, 0, locL, Looper.getMainLooper());
            }
        } catch (SecurityException e) { } catch (Throwable e) { }
    }
    private void stopLocation() { try { if (lm != null) lm.removeUpdates(locL); } catch (Throwable e) { } }

    private void gotLocation(Location l) {
        Location cur = loc;
        boolean better = cur == null || l.getTime() - cur.getTime() > 20000 || l.getAccuracy() <= cur.getAccuracy() + 5;
        if (!better) return;
        loc = l;
        ov.invalidate();
        long now = System.currentTimeMillis();
        if (!Geocoder.isPresent() || (addrLoc != null && l.distanceTo(addrLoc) < 25) || now - geoAt < 8000) return;
        geoAt = now;
        final Location q = new Location(l);
        geoEx.execute(new Runnable() { @SuppressWarnings("deprecation") public void run() {
            try {
                List<Address> r = new Geocoder(PhotoCamera.this, Locale.FRANCE).getFromLocation(q.getLatitude(), q.getLongitude(), 1);
                if (r != null && !r.isEmpty()) {
                    Address a = r.get(0);
                    String s = a.getMaxAddressLineIndex() >= 0 ? a.getAddressLine(0) : null;
                    if (s == null) {
                        StringBuilder b = new StringBuilder();
                        if (a.getSubThoroughfare() != null) b.append(a.getSubThoroughfare()).append(' ');
                        if (a.getThoroughfare() != null) b.append(a.getThoroughfare()).append(", ");
                        if (a.getPostalCode() != null) b.append(a.getPostalCode()).append(' ');
                        if (a.getLocality() != null) b.append(a.getLocality());
                        s = b.toString().trim();
                    }
                    s = s.replaceAll(",\\s*France$", "").trim();
                    if (!s.isEmpty()) { addr = s; addrLoc = q; ui.post(new Runnable() { public void run() { ov.invalidate(); } }); }
                }
            } catch (Throwable e) { }
        } });
    }

    // ================= Niveau =================
    private final SensorEventListener sensorL = new SensorEventListener() {
        @Override public void onSensorChanged(SensorEvent e) {
            float a = 0.15f;
            gx += (e.values[0] - gx) * a; gy += (e.values[1] - gy) * a; gz += (e.values[2] - gz) * a;
            if (prefB("level", true)) ov.invalidate();
        }
        @Override public void onAccuracyChanged(Sensor s, int a) { }
    };

    // ================= Interface =================
    private GradientDrawable round(int color, float r) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(r); return g; }
    private GradientDrawable round(int color, float r, int stroke) { GradientDrawable g = round(color, r); g.setStroke(dpi(1), stroke); return g; }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        t.setGravity(Gravity.CENTER); t.setSingleLine(true); t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        return t;
    }

    /** Bouton de la barre du haut : icône en traits + libellé (grand, utilisable avec des gants). */
    private LinearLayout tool(String path, String label, View.OnClickListener cl, Ico[] outIco, TextView[] outLab) {
        LinearLayout b = new LinearLayout(this);
        b.setOrientation(LinearLayout.VERTICAL); b.setGravity(Gravity.CENTER);
        b.setBackground(round(0x00000000, dp(14)));
        Ico ic = new Ico(this, path);
        b.addView(ic, new LinearLayout.LayoutParams(dpi(28), dpi(28)));
        TextView l = text(label, 11.5f, C_TX2, true);
        b.addView(l, new LinearLayout.LayoutParams(-2, -2));
        b.setOnClickListener(cl);
        b.setMinimumWidth(dpi(58)); b.setMinimumHeight(dpi(62));
        if (outIco != null) outIco[0] = ic;
        if (outLab != null) outLab[0] = l;
        rotating.add(ic);
        return b;
    }

    private TextView chip(String s, View.OnClickListener cl) {
        TextView t = text(s, 14, C_TX, true);
        t.setPadding(dpi(16), 0, dpi(16), 0);
        t.setMinHeight(dpi(46)); t.setMinWidth(dpi(56));
        t.setBackground(round(0x99181b23, dp(23), 0x22ffffff));
        t.setOnClickListener(cl);
        return t;
    }

    static final String P_FLASH = "M13 2 L4 14 H11 L10 22 L20 9 H13 Z";
    static final String P_FLASH_OFF = "M13 2 L4 14 H11 L10 22 L20 9 H13 Z M3 3 L21 21";
    static final String P_TORCH = "M7 3 H17 V7 L14 11 V21 H10 V11 L7 7 Z M12 14 V16";
    static final String P_TIMER = "O12 13 8 M12 9 V13 L14.5 15 M9.5 2.5 H14.5";
    static final String P_GRID = "M4 4 H20 V20 H4 Z M9.33 4 V20 M14.67 4 V20 M4 9.33 H20 M4 14.67 H20";
    static final String P_LEVEL = "M2 12 H8 M16 12 H22 O12 12 4 M12 8 V16";
    static final String P_SET = "M4 6 H20 M4 12 H20 M4 18 H20 O9 6 2.2 O15 12 2.2 O8 18 2.2";
    static final String P_DIR = "M3 6 H9 L11 8 H21 V19 H3 Z";
    static final String P_QUAL = "M4 5 H20 V19 H4 Z M8 9 V15 M8 12 H11 M11 9 V15 M14 9 V15 H17";

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        tv = new TextureView(this);
        tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture s, int w, int h) { if (resumed) openCamera(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture s, int w, int h) { }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture s) { return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture s) { }
        });
        root.addView(tv, new FrameLayout.LayoutParams(W, W * 4 / 3, Gravity.TOP) {{ topMargin = topH; }});
        ov = new Overlay(this);
        root.addView(ov, new FrameLayout.LayoutParams(W, W * 4 / 3, Gravity.TOP) {{ topMargin = topH; }});
        flashCurtain = new View(this); flashCurtain.setBackgroundColor(Color.BLACK); flashCurtain.setAlpha(0f);
        root.addView(flashCurtain, new FrameLayout.LayoutParams(W, W * 4 / 3, Gravity.TOP));

        // Barre du haut
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER_VERTICAL);
        top.setBackgroundColor(0xff000000);
        top.setPadding(dpi(4), dpi(4), dpi(4), dpi(4));
        Ico[] fi = new Ico[1]; TextView[] fl = new TextView[1];
        top.addView(tool(P_FLASH, "Auto", new View.OnClickListener() { public void onClick(View v) { cycleFlash(); } }, fi, fl), new LinearLayout.LayoutParams(0, -1, 1));
        bFlashI = fi[0]; bFlashL = fl[0];
        TextView[] tl = new TextView[1];
        top.addView(tool(P_TIMER, "Non", new View.OnClickListener() { public void onClick(View v) { cycleTimer(); } }, null, tl), new LinearLayout.LayoutParams(0, -1, 1));
        bTimerL = tl[0];
        TextView[] gl = new TextView[1];
        top.addView(tool(P_GRID, "Grille", new View.OnClickListener() { public void onClick(View v) { toggle("grid", false); } }, null, gl), new LinearLayout.LayoutParams(0, -1, 1));
        bGridL = gl[0];
        TextView[] ll = new TextView[1];
        top.addView(tool(P_LEVEL, "Niveau", new View.OnClickListener() { public void onClick(View v) { toggle("level", true); } }, null, ll), new LinearLayout.LayoutParams(0, -1, 1));
        bLevelL = ll[0];
        TextView[] ql = new TextView[1];
        top.addView(tool(P_QUAL, "108 Mpx", new View.OnClickListener() { public void onClick(View v) { cycleQuality(); } }, null, ql), new LinearLayout.LayoutParams(0, -1, 1));
        bQualL = ql[0];
        top.addView(tool(P_SET, "Réglages", new View.OnClickListener() { public void onClick(View v) { settingsDialog(); } }, null, null), new LinearLayout.LayoutParams(0, -1, 1));
        root.addView(top, new FrameLayout.LayoutParams(-1, topH, Gravity.TOP));

        // Mode chantier (sur l'aperçu, en haut)
        siteRow = new LinearLayout(this);
        siteRow.setOrientation(LinearLayout.HORIZONTAL); siteRow.setGravity(Gravity.CENTER_VERTICAL);
        siteRow.setPadding(dpi(10), 0, dpi(10), 0);
        modeChip = chip("Chantier", new View.OnClickListener() { public void onClick(View v) { toggleSiteMode(); } });
        siteRow.addView(modeChip, new LinearLayout.LayoutParams(-2, dpi(46)));
        siteChip = chip("Choisir", new View.OnClickListener() { public void onClick(View v) { chooseSite(); } });
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, dpi(46), 1); sl.leftMargin = dpi(8);
        siteRow.addView(siteChip, sl);
        noteChip = chip("Note", new View.OnClickListener() { public void onClick(View v) { editNote(); } });
        LinearLayout.LayoutParams nl = new LinearLayout.LayoutParams(-2, dpi(46)); nl.leftMargin = dpi(8);
        siteRow.addView(noteChip, nl);
        root.addView(siteRow, new FrameLayout.LayoutParams(-1, dpi(46), Gravity.TOP) {{ topMargin = topH + dpi(10); }});

        hint = text("", 14, C_TX, true);
        hint.setBackground(round(0xcc0f1116, dp(16)));
        hint.setPadding(dpi(14), dpi(8), dpi(14), dpi(8));
        hint.setSingleLine(false); hint.setMaxLines(4); hint.setAlpha(0f);
        root.addView(hint, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL) {{ topMargin = topH + dpi(58); leftMargin = dpi(20); rightMargin = dpi(20); }});

        recTime = text("00:00", 15, Color.WHITE, true);
        recTime.setBackground(round(0xddcc2b2b, dp(14)));
        recTime.setPadding(dpi(12), dpi(4), dpi(12), dpi(4));
        recTime.setVisibility(View.GONE);
        root.addView(recTime, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL) {{ topMargin = topH + dpi(62); }});

        // Bas : zoom, objectifs, mode, déclencheur
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL); bottom.setGravity(Gravity.CENTER_HORIZONTAL);
        bottom.setPadding(0, dpi(6), 0, dpi(14));
        GradientDrawable fade = new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{ 0xf0000000, 0xc0000000, 0x00000000 });
        bottom.setBackground(fade);

        LinearLayout zr = new LinearLayout(this); zr.setGravity(Gravity.CENTER);
        zoom1 = chip("1×", new View.OnClickListener() { public void onClick(View v) { setZoomSafe(1f); } });
        zoom2 = chip("2×", new View.OnClickListener() { public void onClick(View v) { setZoomSafe(2f); } });
        zr.addView(zoom1, new LinearLayout.LayoutParams(dpi(56), dpi(46)));
        LinearLayout.LayoutParams z2 = new LinearLayout.LayoutParams(dpi(56), dpi(46)); z2.leftMargin = dpi(12);
        zr.addView(zoom2, z2);
        bottom.addView(zr, new LinearLayout.LayoutParams(-2, -2));

        HorizontalScrollView hs = new HorizontalScrollView(this); hs.setHorizontalScrollBarEnabled(false);
        lensRow = new LinearLayout(this); lensRow.setOrientation(LinearLayout.HORIZONTAL); lensRow.setGravity(Gravity.CENTER);
        lensRow.setPadding(dpi(8), 0, dpi(8), 0);
        hs.addView(lensRow, new FrameLayout.LayoutParams(-2, -2));
        LinearLayout.LayoutParams hl = new LinearLayout.LayoutParams(-2, -2); hl.topMargin = dpi(10);
        bottom.addView(hs, hl);

        LinearLayout modes = new LinearLayout(this); modes.setGravity(Gravity.CENTER);
        mPhoto = text("PHOTO", 14, C_ACC, true); mVideo = text("VIDÉO", 14, C_TX2, true);
        mPhoto.setPadding(dpi(18), dpi(10), dpi(18), dpi(10)); mVideo.setPadding(dpi(18), dpi(10), dpi(18), dpi(10));
        mPhoto.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { setVideoMode(false); } });
        mVideo.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { setVideoMode(true); } });
        modes.addView(mPhoto); modes.addView(mVideo);
        LinearLayout.LayoutParams ml = new LinearLayout.LayoutParams(-2, -2); ml.topMargin = dpi(4);
        bottom.addView(modes, ml);

        FrameLayout row = new FrameLayout(this);
        thumb = new ImageView(this);
        thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
        thumb.setBackground(round(C_BG3, dp(18), 0x55ffffff));
        thumb.setClipToOutline(true);
        thumb.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openLast(); } });
        row.addView(thumb, new FrameLayout.LayoutParams(dpi(66), dpi(66), Gravity.CENTER_VERTICAL | Gravity.START) {{ leftMargin = dpi(26); }});
        rotating.add(thumb);
        shutter = new Shutter(this);
        shutter.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { shutterPressed(); } });
        row.addView(shutter, new FrameLayout.LayoutParams(dpi(98), dpi(98), Gravity.CENTER));
        LinearLayout back = tool(P_DIR, "Chantiers", new View.OnClickListener() { public void onClick(View v) { leave(true); } }, null, null);
        back.setBackground(round(0x33ffffff, dp(18)));
        row.addView(back, new FrameLayout.LayoutParams(dpi(78), dpi(70), Gravity.CENTER_VERTICAL | Gravity.END) {{ rightMargin = dpi(20); }});
        LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, dpi(104)); rl.topMargin = dpi(2);
        bottom.addView(row, rl);
        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        setContentView(root);
        buildLensRow();
        refreshUi();
    }

    private void buildLensRow() {
        lensRow.removeAllViews();
        String[] roles = { "principal", "macro", "nuit", "avant" };
        String[] names = { "Principal", "Macro", "Nuit", "Avant" };
        for (int i = 0; i < roles.length; i++) {
            Lens found = null;
            for (Lens l : lenses) if (roles[i].equals(l.role)) found = l;
            final Lens f = found; final String role = roles[i];
            TextView c = chip(names[i], new View.OnClickListener() { public void onClick(View v) {
                if (f == null) { if ("nuit".equals(role)) nightDialog(); else info("Pas d'objectif « " + role + " » déclaré par Android"); return; }
                selectLens(f);
            } });
            c.setTag(found);
            if (found == null) c.setAlpha(0.45f);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dpi(46)); p.rightMargin = dpi(8);
            lensRow.addView(c, p);
        }
        TextView all = chip("Tous", new View.OnClickListener() { public void onClick(View v) { lensDialog(); } });
        lensRow.addView(all, new LinearLayout.LayoutParams(-2, dpi(46)));
    }

    private void selectLens(Lens l) {
        if (l == lens || recording) return;
        lens = l; zoom = 1f; ultraFailed = false;
        sp.edit().putString("lens", l.key).apply();
        if ("nuit".equals(l.role) && "probable".equals(l.conf)) info("Objectif supposé de vision de nuit (8 Mpx). Vérifie dans le noir.");
        reopen(); refreshUi();
    }

    private void setZoomSafe(final float z) { if (bg != null) bg.post(new Runnable() { public void run() { setZoomBg(z); } }); }
    private void setZoomBg(float z) { zoom = Math.max(zMin, Math.min(zMax, z)); if (pb != null) { applyZoom(pb); repeat(); } ui.post(new Runnable() { public void run() { ov.zoomShown = System.currentTimeMillis(); ov.invalidate(); refreshZoomChips(); } }); }

    private void refreshZoomChips() {
        boolean one = zoom < 1.05f, two = Math.abs(zoom - 2f) < 0.05f;
        zoom1.setBackground(round(one ? 0xe6f2f3f7 : 0x99181b23, dp(23), 0x22ffffff)); zoom1.setTextColor(one ? 0xff10131c : C_TX);
        zoom2.setBackground(round(two ? 0xe6f2f3f7 : 0x99181b23, dp(23), 0x22ffffff)); zoom2.setTextColor(two ? 0xff10131c : C_TX);
        if (!one && !two) zoom2.setText(String.format(Locale.FRANCE, "%.1f×", zoom)); else zoom2.setText("2×");
        zoom2.setVisibility(zMax >= 1.9f ? View.VISIBLE : View.GONE);
    }

    private void refreshUi() {
        if (bFlashL == null || lens == null && lenses.isEmpty()) return;
        String f = pref("flash", "auto");
        boolean hasFlash = lens != null && lens.flash;
        bFlashL.setText(!hasFlash ? "Sans" : "torch".equals(f) ? "Torche" : "on".equals(f) ? "Oui" : "off".equals(f) ? "Non" : "Auto");
        bFlashI.setPath(!hasFlash || "off".equals(f) ? P_FLASH_OFF : "torch".equals(f) ? P_TORCH : P_FLASH);
        bFlashI.setColor(hasFlash && ("on".equals(f) || "torch".equals(f)) ? 0xffffd36b : C_TX);
        int t = sp.getInt("timer", 0);
        bTimerL.setText(t == 0 ? "Non" : t + " s"); bTimerL.setTextColor(t > 0 ? C_ACC : C_TX2);
        bGridL.setTextColor(prefB("grid", false) ? C_ACC : C_TX2);
        bLevelL.setTextColor(prefB("level", true) ? C_ACC : C_TX2);
        if (lens != null) {
            boolean max = !"std".equals(pref("quality", "max"));
            Size s = max ? (lens.ultra && !ultraFailed ? lens.max : lens.std) : capSize != null && !max ? capSize : lens.std;
            bQualL.setText(max ? mp(s) + " Mpx" : (capSize != null ? mp(capSize) : "12") + " Mpx");
            bQualL.setTextColor(max ? C_ACC : C_TX2);
        }
        boolean on = prefB("siteMode", false);
        String site = ""; try { site = new JSONObject(pref("site", "{}")).optString("name", ""); } catch (Throwable e) { }
        modeChip.setText(on ? "Chantier : oui" : "Chantier : non");
        modeChip.setBackground(round(on ? 0xff8fb4ff : 0x99181b23, dp(23), 0x22ffffff));
        modeChip.setTextColor(on ? 0xff10131c : C_TX);
        siteChip.setText(site.isEmpty() ? "Choisir un chantier" : site);
        siteChip.setVisibility(on ? View.VISIBLE : View.INVISIBLE);
        String note = pref("note", "");
        noteChip.setText(note.isEmpty() ? "Note" : "Note : oui");
        noteChip.setVisibility(on ? View.VISIBLE : View.INVISIBLE);
        siteRow.setVisibility(recording || captureIntent ? View.GONE : View.VISIBLE);
        for (int i = 0; i < lensRow.getChildCount(); i++) {
            View c = lensRow.getChildAt(i);
            boolean sel = c.getTag() != null && c.getTag() == lens;
            c.setBackground(round(sel ? 0xe6f2f3f7 : 0x99181b23, dp(23), 0x22ffffff));
            if (c instanceof TextView) ((TextView) c).setTextColor(sel ? 0xff10131c : C_TX);
        }
        mPhoto.setTextColor(videoMode ? C_TX2 : C_ACC); mVideo.setTextColor(videoMode ? C_ACC : C_TX2);
        shutter.setVideo(videoMode);
        refreshZoomChips();
        ov.invalidate();
    }

    private void rotateUi() {
        int target = (360 - devOri) % 360;
        int cur = uiRot;
        int delta = ((target - cur) % 360 + 540) % 360 - 180;
        uiRot = (cur + delta);
        for (View v : rotating) v.animate().rotation(uiRot).setDuration(220).start();
    }

    private void info(final String s) {
        ui.post(new Runnable() { public void run() {
            hint.setText(s); hint.animate().cancel(); hint.setAlpha(1f);
            hint.animate().alpha(0f).setStartDelay(2600).setDuration(400).start();
        } });
    }

    private void setThumb(Bitmap b) { if (b != null) thumb.setImageBitmap(b); }

    private void lastFromPrefs() {
        final String u = sp.getString("lastUri", "");
        if (u.isEmpty()) return;
        saver.execute(new Runnable() { @SuppressWarnings("deprecation") public void run() {
            try {
                Uri uri = Uri.parse(u);
                Bitmap b = null;
                if (SDK >= 29) b = getContentResolver().loadThumbnail(uri, new Size(240, 240), null);
                else {
                    long id = ContentUris.parseId(uri);
                    b = sp.getBoolean("lastVideo", false) ? MediaStore.Video.Thumbnails.getThumbnail(getContentResolver(), id, MediaStore.Video.Thumbnails.MINI_KIND, null)
                            : MediaStore.Images.Thumbnails.getThumbnail(getContentResolver(), id, MediaStore.Images.Thumbnails.MINI_KIND, null);
                }
                lastUri = uri; lastVideo = sp.getBoolean("lastVideo", false);
                final Bitmap fb = b;
                ui.post(new Runnable() { public void run() { setThumb(fb); } });
            } catch (Throwable e) { }
        } });
    }

    private void openLast() {
        if (lastUri == null) { info("Pas encore de photo"); return; }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(lastUri, lastVideo ? "video/*" : "image/*");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(i);
        } catch (Throwable e) { previewLast(); }
    }

    /** Aperçu intégré si aucune appli ne sait ouvrir la photo */
    private void previewLast() {
        try {
            Bitmap b;
            try (InputStream in = getContentResolver().openInputStream(lastUri)) {
                BitmapFactory.Options o = new BitmapFactory.Options(); o.inSampleSize = 4;
                b = BitmapFactory.decodeStream(in, null, o);
            }
            final FrameLayout f = new FrameLayout(this); f.setBackgroundColor(0xf0000000);
            ImageView iv = new ImageView(this); iv.setImageBitmap(b); iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            f.addView(iv, new FrameLayout.LayoutParams(-1, -1));
            f.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { root.removeView(f); } });
            root.addView(f, new FrameLayout.LayoutParams(-1, -1));
        } catch (Throwable e) { info("Impossible d'ouvrir la photo"); }
    }

    // ----- Actions de la barre -----
    private void cycleFlash() {
        if (lens == null || !lens.flash) { info("Pas de flash sur cet objectif"); return; }
        String f = pref("flash", "auto");
        String n = "auto".equals(f) ? "on" : "on".equals(f) ? "off" : "off".equals(f) ? "torch" : "auto";
        sp.edit().putString("flash", n).apply();
        info("auto".equals(n) ? "Flash automatique" : "on".equals(n) ? "Flash forcé" : "off".equals(n) ? "Flash coupé" : "Torche allumée");
        refreshUi();
        if (bg != null) bg.post(new Runnable() { public void run() { if (pb != null) { applyFlash(pb, recording); repeat(); } } });
    }
    private void cycleTimer() {
        int t = sp.getInt("timer", 0); int n = t == 0 ? 3 : t == 3 ? 10 : 0;
        sp.edit().putInt("timer", n).apply();
        info(n == 0 ? "Minuteur coupé" : "Minuteur " + n + " secondes");
        refreshUi();
    }
    private void toggle(String k, boolean def) { sp.edit().putBoolean(k, !prefB(k, def)).apply(); refreshUi(); }
    private void cycleQuality() {
        if (recording) return;
        boolean max = !"std".equals(pref("quality", "max"));
        sp.edit().putString("quality", max ? "std" : "max").apply();
        ultraFailed = false;
        info(max ? "Qualité rapide (12 Mpx)" : "Pleine résolution (" + mp(lens.ultra ? lens.max : lens.std) + " Mpx), enregistrement plus lent");
        reopen(); refreshUi();
    }
    private void setVideoMode(boolean v) {
        if (recording || v == videoMode) return;
        videoMode = v; refreshUi();
        if (v && !can(Manifest.permission.RECORD_AUDIO) && !sp.getBoolean("audioAsked", false))
            requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_AUDIO);
    }

    private AlertDialog.Builder dlg() { return new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert); }

    private void toggleSiteMode() {
        boolean on = !prefB("siteMode", false);
        String site = ""; try { site = new JSONObject(pref("site", "{}")).optString("name", ""); } catch (Throwable e) { }
        sp.edit().putBoolean("siteMode", on).apply();
        refreshUi();
        if (on && site.isEmpty()) chooseSite();
        else info(on ? "Mode chantier : photos classées dans « " + site + " » avec bandeau" : "Mode chantier coupé : photos dans DCIM/Photo");
    }

    private void chooseSite() {
        final List<JSONObject> list = new ArrayList<>();
        try { JSONArray a = new JSONArray(pref("sites", "[]")); for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); if (!o.optBoolean("archived")) list.add(o); } } catch (Throwable e) { }
        String[] names = new String[list.size() + 1];
        for (int i = 0; i < list.size(); i++) names[i] = list.get(i).optString("name");
        names[list.size()] = "Nouveau chantier…";
        dlg().setTitle("Chantier").setItems(names, (d, w) -> {
            if (w == list.size()) newSite();
            else { setSite(list.get(w)); }
        }).setNegativeButton("Fermer", null).show();
    }

    private void setSite(JSONObject o) {
        sp.edit().putString("site", o.toString()).putBoolean("siteMode", true).apply();
        info("Chantier actif : " + o.optString("name"));
        refreshUi();
    }

    private EditText field(String hintTxt, String value) {
        EditText e = new EditText(this);
        e.setHint(hintTxt); e.setText(value); e.setSingleLine(false); e.setMaxLines(3); e.setTextSize(18);
        e.setSelection(e.getText().length());
        return e;
    }
    private View padded(View v) { FrameLayout f = new FrameLayout(this); f.setPadding(dpi(22), dpi(8), dpi(22), 0); f.addView(v); return f; }

    private void newSite() {
        final EditText e = field("Nom du chantier (ex. Villa Martin)", "");
        dlg().setTitle("Nouveau chantier").setView(padded(e)).setPositiveButton("Créer", (d, w) -> {
            String n = e.getText().toString().trim();
            if (n.isEmpty()) return;
            try {
                JSONObject o = new JSONObject();
                o.put("id", "c" + System.currentTimeMillis()); o.put("name", n); o.put("dir", safeDir(n)); o.put("created", System.currentTimeMillis());
                o.put("addr", addr == null ? "" : addr); o.put("client", "");
                JSONArray a = new JSONArray(pref("sites", "[]")); a.put(o);
                sp.edit().putString("sites", a.toString()).apply();
                setSite(o);
            } catch (Throwable x) { }
        }).setNegativeButton("Annuler", null).show();
    }

    private void editNote() {
        final EditText e = field("Note sur la photo (ex. Fissure mur nord)", pref("note", ""));
        dlg().setTitle("Note incrustée").setMessage("Elle reste sur les photos suivantes jusqu'à ce que tu l'effaces.").setView(padded(e))
            .setPositiveButton("Valider", (d, w) -> { sp.edit().putString("note", e.getText().toString().trim()).apply(); refreshUi(); })
            .setNeutralButton("Effacer", (d, w) -> { sp.edit().putString("note", "").apply(); refreshUi(); })
            .setNegativeButton("Annuler", null).show();
    }

    private void settingsDialog() {
        final String[] keys = { "stamp", "keepOrig", "geo", "sound" };
        final boolean[] defs = { true, true, true, true };
        String[] labels = { "Incruster le bandeau en mode chantier", "Garder aussi l'original sans bandeau", "Enregistrer la position GPS", "Son du déclencheur" };
        final boolean[] vals = new boolean[keys.length];
        for (int i = 0; i < keys.length; i++) vals[i] = prefB(keys[i], defs[i]);
        dlg().setTitle("Réglages").setMultiChoiceItems(labels, vals, (d, w, c) -> vals[w] = c)
            .setPositiveButton("OK", (d, w) -> {
                SharedPreferences.Editor e = sp.edit();
                for (int i = 0; i < keys.length; i++) e.putBoolean(keys[i], vals[i]);
                e.apply();
                if (vals[2]) {
                    if (!can(Manifest.permission.ACCESS_FINE_LOCATION)) requestPermissions(new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_PERMS);
                    else startLocation();
                } else { stopLocation(); loc = null; }
                refreshUi();
            })
            .setNeutralButton("Objectifs", (d, w) -> lensDialog())
            .setNegativeButton("Annuler", null).show();
    }

    private String lensLine(Lens l) {
        StringBuilder b = new StringBuilder();
        b.append(l.label).append(" — caméra ").append(l.key).append(", ").append(facingName(l.facing));
        if (l.std != null) b.append("\n").append(mp(l.std)).append(" Mpx (").append(l.std.getWidth()).append("×").append(l.std.getHeight()).append(")");
        if (l.ultra) b.append(", pleine résolution ").append(mp(l.max)).append(" Mpx");
        if (l.focal > 0) b.append(String.format(Locale.FRANCE, ", focale %.2f mm", l.focal));
        if (l.minFocus > 0) b.append(", net dès ").append(Math.round(100 / l.minFocus)).append(" cm");
        else b.append(", mise au point fixe");
        if (l.nir) b.append(", infrarouge");
        if (l.mono) b.append(", monochrome");
        if ("probable".equals(l.conf)) b.append(" (nuit supposée)");
        if (!l.usable) b.append("\nNon utilisable pour la photo (profondeur ou capteur auxiliaire)");
        return b.toString();
    }

    private void lensDialog() {
        final List<Lens> ls = new ArrayList<>();
        for (Lens l : lenses) ls.add(l);
        String[] items = new String[ls.size()];
        boolean night = false;
        for (int i = 0; i < ls.size(); i++) { items[i] = lensLine(ls.get(i)); if ("nuit".equals(ls.get(i).role)) night = true; }
        AlertDialog.Builder b = dlg().setTitle(ls.size() + " objectif" + (ls.size() > 1 ? "s" : "") + " déclaré" + (ls.size() > 1 ? "s" : "") + " par Android")
            .setItems(items, (d, w) -> { Lens l = ls.get(w); if (l.usable) selectLens(l); else info("Cet objectif n'est pas utilisable pour la photo"); })
            .setNegativeButton("Fermer", null);
        if (!night) b.setNeutralButton("Vision de nuit ?", (d, w) -> nightDialog());
        b.show();
    }

    private void nightDialog() {
        AlertDialog.Builder b = dlg().setTitle("Vision de nuit").setMessage(NIGHT_MSG).setNegativeButton("OK", null);
        final Intent stock = stockCamera();
        if (stock != null) b.setPositiveButton("Ouvrir l'appli d'origine", (d, w) -> { try { startActivity(stock); } catch (Throwable e) { info("Impossible d'ouvrir l'appli d'origine"); } });
        b.show();
    }

    private Intent stockCamera() {
        try {
            Intent i = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
            for (ResolveInfo r : getPackageManager().queryIntentActivities(i, 0)) {
                if (r.activityInfo == null || getPackageName().equals(r.activityInfo.packageName)) continue;
                return new Intent(i).setClassName(r.activityInfo.packageName, r.activityInfo.name);
            }
        } catch (Throwable e) { }
        return null;
    }

    private void showBlocked() {
        ui.post(new Runnable() { public void run() {
            dlg().setTitle("Accès à la caméra").setMessage("Photo a besoin de la caméra pour prendre des photos. Autorise-la dans les réglages de l'application.")
                .setPositiveButton("Réglages", (d, w) -> { try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Throwable e) { } })
                .setNegativeButton("Fermer", (d, w) -> finish()).show();
        } });
    }

    // ================= Vues dessinées =================
    /** Icône en traits, décrite par un petit sous-ensemble de SVG (M L H V Z, plus « O cx cy r » pour un cercle). */
    static final class Ico extends View {
        private Path path = new Path(); private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Ico(Context c, String d) {
            super(c);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.9f); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND); p.setColor(C_TX);
            setPath(d);
        }
        void setColor(int c) { p.setColor(c); invalidate(); }
        void setPath(String d) {
            Path out = new Path();
            String[] t = d.replace(",", " ").trim().split("\\s+");
            char cmd = 'M'; float x = 0, y = 0, sx = 0, sy = 0; int i = 0;
            while (i < t.length) {
                String s = t[i];
                if (s.length() == 1 && Character.isLetter(s.charAt(0))) { cmd = s.charAt(0); i++; if (cmd == 'Z') { out.close(); x = sx; y = sy; } continue; }
                if (s.length() > 1 && Character.isLetter(s.charAt(0))) { cmd = s.charAt(0); t[i] = s.substring(1); s = t[i]; }
                switch (cmd) {
                    case 'M': x = Float.parseFloat(t[i]); y = Float.parseFloat(t[i + 1]); out.moveTo(x, y); sx = x; sy = y; i += 2; cmd = 'L'; break;
                    case 'L': x = Float.parseFloat(t[i]); y = Float.parseFloat(t[i + 1]); out.lineTo(x, y); i += 2; break;
                    case 'H': x = Float.parseFloat(t[i]); out.lineTo(x, y); i += 1; break;
                    case 'V': y = Float.parseFloat(t[i]); out.lineTo(x, y); i += 1; break;
                    case 'O': out.addCircle(Float.parseFloat(t[i]), Float.parseFloat(t[i + 1]), Float.parseFloat(t[i + 2]), Path.Direction.CW); i += 3; break;
                    default: i++;
                }
            }
            path = out; invalidate();
        }
        @Override protected void onDraw(Canvas c) {
            float s = Math.min(getWidth(), getHeight()) / 24f;
            c.save(); c.translate((getWidth() - 24 * s) / 2, (getHeight() - 24 * s) / 2); c.scale(s, s);
            c.drawPath(path, p); c.restore();
        }
    }

    /** Déclencheur : grand anneau blanc, rond rouge en vidéo, carré rouge pendant l'enregistrement. */
    final class Shutter extends View {
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private boolean video, rec, busy, count;
        Shutter(Context c) { super(c); ring.setStyle(Paint.Style.STROKE); ring.setColor(Color.WHITE); setClickable(true); setContentDescription("Déclencheur"); }
        void setVideo(boolean v) { video = v; invalidate(); }
        void setRec(boolean r) { rec = r; invalidate(); }
        void busy(boolean b) { busy = b; invalidate(); }
        void setCount(boolean b) { count = b; invalidate(); }
        @Override public boolean onTouchEvent(MotionEvent e) {
            if (e.getAction() == MotionEvent.ACTION_DOWN) animate().scaleX(0.9f).scaleY(0.9f).setDuration(80).start();
            else if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) animate().scaleX(1f).scaleY(1f).setDuration(120).start();
            return super.onTouchEvent(e);
        }
        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight(), r = Math.min(w, h) / 2f;
            ring.setStrokeWidth(r * 0.1f);
            c.drawCircle(w / 2, h / 2, r * 0.92f, ring);
            if (rec) { fill.setColor(0xffff4040); float q = r * 0.36f; c.drawRoundRect(new RectF(w / 2 - q, h / 2 - q, w / 2 + q, h / 2 + q), r * 0.1f, r * 0.1f, fill); }
            else {
                fill.setColor(video ? 0xffff4040 : count ? C_ACC : busy ? 0xffd0d4de : Color.WHITE);
                c.drawCircle(w / 2, h / 2, r * 0.74f, fill);
            }
        }
    }

    /** Surimpression : grille, niveau, mise au point, minuteur, zoom, aperçu du bandeau. */
    final class Overlay extends View {
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG), txt = new Paint(Paint.ANTI_ALIAS_FLAG), fp = new Paint(Paint.ANTI_ALIAS_FLAG), bp = new Paint();
        float fx = -1, fy = -1; long fAt; int fState; int count; long zoomShown;
        private final ScaleGestureDetector sg;
        private final GestureDetector gd;
        Overlay(Context c) {
            super(c);
            line.setStyle(Paint.Style.STROKE); line.setStrokeWidth(dp(1)); line.setColor(0x80ffffff);
            txt.setColor(Color.WHITE); txt.setTextAlign(Paint.Align.CENTER); txt.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            txt.setShadowLayer(dp(3), 0, 0, 0xaa000000);
            fp.setStyle(Paint.Style.STROKE); fp.setStrokeWidth(dp(2));
            sg = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScale(ScaleGestureDetector d) { final float z = zoom * d.getScaleFactor(); setZoomSafe(z); return true; }
            });
            gd = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onDown(MotionEvent e) { return true; }
                @Override public boolean onSingleTapUp(MotionEvent e) { focusAt(e.getX(), e.getY()); return true; }
            });
        }
        void focus(float x, float y) { fx = x; fy = y; fAt = System.currentTimeMillis(); fState = 0; invalidate(); }
        void focusState(int s) { if (s != fState) { fState = s; postInvalidate(); } }
        @Override public boolean onTouchEvent(MotionEvent e) { sg.onTouchEvent(e); if (!sg.isInProgress()) gd.onTouchEvent(e); return true; }

        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight();
            if (prefB("grid", false)) {
                for (int i = 1; i < 3; i++) { c.drawLine(w * i / 3, 0, w * i / 3, h, line); c.drawLine(0, h * i / 3, w, h * i / 3, line); }
            }
            if (prefB("level", true)) drawLevel(c, w, h);
            long now = System.currentTimeMillis();
            if (fx >= 0 && now - fAt < 2500) {
                fp.setColor(fState > 0 ? C_OK : fState < 0 ? C_BAD : Color.WHITE);
                float r = dp(36);
                c.drawCircle(fx, fy, r, fp);
                c.drawLine(fx - r - dp(8), fy, fx - r + dp(6), fy, fp); c.drawLine(fx + r - dp(6), fy, fx + r + dp(8), fy, fp);
                postInvalidateDelayed(120);
            }
            if (count > 0) { txt.setTextSize(dp(110)); c.drawText(String.valueOf(count), w / 2, h / 2 + dp(38), txt); }
            if (now - zoomShown < 1500) {
                txt.setTextSize(dp(22));
                c.drawText(String.format(Locale.FRANCE, "%.1f×", zoom), w / 2, h * 0.3f, txt);
                postInvalidateDelayed(200);
            }
            if (prefB("siteMode", false) && !captureIntent && !videoMode) drawBannerPreview(c, w, h);
            else if (prefB("geo", true)) {
                Location l = loc;
                txt.setTextSize(dp(12)); txt.setTextAlign(Paint.Align.LEFT);
                String s = l == null ? "Recherche GPS…" : "GPS ±" + Math.round(l.getAccuracy()) + " m" + (addr != null ? " · " + addr : "");
                c.drawText(trim(s, txt, w - dp(24)), dp(12), h - dp(12), txt);
                txt.setTextAlign(Paint.Align.CENTER);
            }
        }

        private String trim(String s, Paint p, float max) { if (p.measureText(s) <= max) return s; while (s.length() > 2 && p.measureText(s + "…") > max) s = s.substring(0, s.length() - 1); return s + "…"; }

        private void drawLevel(Canvas c, float w, float h) {
            float g = (float) Math.sqrt(gx * gx + gy * gy + gz * gz); if (g < 1) return;
            boolean flat = Math.abs(gz) / g > 0.9f;
            if (flat) {
                // Bulle : photo prise à plat (sol, plafond, plan)
                float R = dp(46), cx = w / 2, cy = h / 2;
                float tx = gx / g, ty = gy / g;
                double tilt = Math.toDegrees(Math.asin(Math.min(1, Math.sqrt(tx * tx + ty * ty))));
                boolean ok = tilt < 1.0;
                fp.setColor(ok ? C_OK : 0xccffffff);
                c.drawCircle(cx, cy, R, fp); c.drawCircle(cx, cy, dp(6), fp);
                Paint b = new Paint(Paint.ANTI_ALIAS_FLAG); b.setColor(ok ? C_OK : 0xddffd36b);
                float k = R * 4f;
                float bx = cx + Math.max(-R, Math.min(R, tx * k)), by = cy + Math.max(-R, Math.min(R, -ty * k));
                c.drawCircle(bx, by, dp(9), b);
                txt.setTextSize(dp(14)); c.drawText(String.format(Locale.FRANCE, "%.1f°", tilt), cx, cy + R + dp(22), txt);
                return;
            }
            double roll = Math.toDegrees(Math.atan2(gx, gy));
            double base = Math.round(roll / 90.0) * 90.0, dev = roll - base;
            boolean ok = Math.abs(dev) < 1.0;
            float cx = w / 2, cy = h / 2, L = Math.min(w, h) * 0.32f;
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setStrokeWidth(dp(2.5f)); p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor(ok ? C_OK : 0xe6ffffff);
            c.save(); c.rotate((float) roll, cx, cy);
            c.drawLine(cx - L, cy, cx - dp(14), cy, p); c.drawLine(cx + dp(14), cy, cx + L, cy, p);
            c.restore();
            p.setColor(ok ? C_OK : 0x99ffd36b); p.setStrokeWidth(dp(2));
            c.save(); c.rotate((float) base, cx, cy);
            c.drawLine(cx - L - dp(26), cy, cx - L - dp(8), cy, p); c.drawLine(cx + L + dp(8), cy, cx + L + dp(26), cy, p);
            c.restore();
            if (!ok) { txt.setTextSize(dp(13)); c.drawText(String.format(Locale.FRANCE, "%.1f°", Math.abs(dev)), cx, cy - dp(14), txt); }
        }

        private void drawBannerPreview(Canvas c, float w, float h) {
            Meta m = snapshot();
            if (!m.siteMode) return;
            if (!m.stamp) {
                txt.setTextSize(dp(12)); txt.setTextAlign(Paint.Align.LEFT);
                c.drawText("Classement : " + m.site + " (sans bandeau)", dp(12), h - dp(12), txt);
                txt.setTextAlign(Paint.Align.CENTER); return;
            }
            String[] ls = bannerLines(m);
            Paint a = new Paint(Paint.ANTI_ALIAS_FLAG); a.setColor(Color.WHITE); a.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD)); a.setTextSize(dp(13.5f));
            Paint b = new Paint(Paint.ANTI_ALIAS_FLAG); b.setColor(0xffe8ebf3); b.setTextSize(dp(11.5f));
            float pad = dp(8), acc = dp(3), lh = 1.32f;
            float bh = pad * 2 + a.getTextSize() * lh + (ls.length - 1) * b.getTextSize() * lh;
            bp.setColor(0xb00b0d13); c.drawRect(0, h - bh, w, h, bp);
            Paint ap = new Paint(); ap.setColor(C_ACC); c.drawRect(pad, h - bh + pad, pad + acc, h - pad, ap);
            float y = h - bh + pad;
            for (int i = 0; i < ls.length; i++) {
                Paint p = i == 0 ? a : b;
                y += p.getTextSize() * lh;
                c.drawText(trim(ls[i], p, w - pad * 3 - acc), pad * 2 + acc, y - p.getTextSize() * 0.3f, p);
            }
        }
    }
}
