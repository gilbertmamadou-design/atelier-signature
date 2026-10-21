package __PKG__;

// Mesure : outils de chantier (règle, niveau, inclinomètre, visée, sonomètre, luxmètre, boussole).
// Exposé en JavaScript sous window.MAGMesure. Le constructeur ne fait rien : aucun capteur, aucun micro
// n'est ouvert tant que la page ne le demande pas avec start(type).
//
// Événements poussés à la page : window.mesureEvent(type, objet)
//   motion  {x,y,z,n}           gravité en m/s² (moyenne des échantillons reçus depuis le dernier envoi)
//   compass {az,cam,acc,src}    cap en degrés (haut de l'écran, à plat), cap de l'appareil photo (téléphone debout), précision 0..3
//   light   {lux}
//   prox    {cm,near,max}
//   sound   {a,z,pk,ms}         niveaux en dBFS sur ~125 ms : pondéré A approché, non pondéré (Z), crête
//   perm    {mic}               réponse à la demande d'autorisation du micro
//   stopped {why}               tout a été arrêté (application en pause, page muette)
//   resume  {}                  l'application revient au premier plan : la page relance ce qu'elle affiche
//   error   {type,msg}
// Au plus 15 envois par seconde et par type, toujours sur le fil UI.

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.location.Location;
import android.location.LocationManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.DisplayMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Locale;

public class MesureBridge {
    private static final int REQ_MIC = 5601;
    private static final long MIN_GAP = 67;          // 15 envois par seconde au plus
    private static final long WATCHDOG = 6000;       // la page doit appeler ping() au moins toutes les 6 s

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private SensorManager sm;
    private final HashMap<String, SensorEventListener> on = new HashMap<>();
    private final HashMap<String, Long> lastEmit = new HashMap<>();
    private volatile long lastPing = 0;
    private boolean lifecycleHooked = false;
    private boolean paused = false;

    // Son
    private volatile boolean soundRun = false;
    private Thread soundThread;
    private boolean wantSoundAfterPerm = false;

    // Torche
    private String torchId = null;

    public MesureBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onResult(int requestCode, int resultCode, Intent data) { }

    public void onPermissions(int requestCode) {
        if (requestCode != REQ_MIC) return;
        boolean ok = hasMic();
        emit("perm", "{\"mic\":" + ok + "}");
        if (ok && wantSoundAfterPerm) { wantSoundAfterPerm = false; startSound(); }
        wantSoundAfterPerm = false;
    }

    public void onResume() {
        paused = false;
        lastPing = System.currentTimeMillis();
        if (lifecycleHooked) emit("resume", "{}");
    }

    public void onIntent(Intent i) { }

    private void hookLifecycle() {
        if (lifecycleHooked) return;
        lifecycleHooked = true;
        try {
            a.getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                public void onActivityPaused(Activity x) { if (x == a) { paused = true; stopEverything("pause"); } }
                public void onActivityResumed(Activity x) { if (x == a) paused = false; }
                public void onActivityCreated(Activity x, Bundle b) { }
                public void onActivityStarted(Activity x) { }
                public void onActivityStopped(Activity x) { if (x == a) stopEverything("pause"); }
                public void onActivitySaveInstanceState(Activity x, Bundle b) { }
                public void onActivityDestroyed(Activity x) { if (x == a) stopEverything("fin"); }
            });
        } catch (Throwable t) { }
        ui.postDelayed(watch, 2000);
    }

    private final Runnable watch = new Runnable() { public void run() {
        if (busy() && System.currentTimeMillis() - lastPing > WATCHDOG) stopEverything("silence");
        ui.postDelayed(this, 2000);
    } };

    private boolean busy() { synchronized (on) { return !on.isEmpty() || soundRun; } }

    // ---------- Envoi vers la page ----------
    private void emit(final String type, final String json) {
        final String js = "window.mesureEvent&&mesureEvent(" + JSONObject.quote(type) + "," + json + ")";
        if (Looper.myLooper() == Looper.getMainLooper()) { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } }
        else ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }

    private boolean due(String type) {
        long now = System.currentTimeMillis();
        Long l = lastEmit.get(type);
        if (l != null && now - l < MIN_GAP) return false;
        lastEmit.put(type, now);
        return true;
    }

    private static String f(double v) { return String.format(Locale.ROOT, "%.4f", v); }

    // ---------- Infos ----------
    /** Densité physique de l'écran : {xdpi, ydpi, density, dpi, wpx, hpx} */
    @JavascriptInterface public String display() {
        try {
            DisplayMetrics dm = new DisplayMetrics();
            a.getWindowManager().getDefaultDisplay().getRealMetrics(dm);
            JSONObject o = new JSONObject();
            o.put("xdpi", dm.xdpi); o.put("ydpi", dm.ydpi); o.put("density", dm.density);
            o.put("dpi", dm.densityDpi); o.put("wpx", dm.widthPixels); o.put("hpx", dm.heightPixels);
            o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            return o.toString();
        } catch (Throwable t) { return "{}"; }
    }

    /** Capteurs présents : {motion, gravity, gyro, compass, rotation, light, prox, mic, torch} */
    @JavascriptInterface public String sensors() {
        try {
            SensorManager s = sm();
            JSONObject o = new JSONObject();
            o.put("motion", s.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null);
            o.put("gravity", s.getDefaultSensor(Sensor.TYPE_GRAVITY) != null);
            o.put("gyro", s.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null);
            o.put("compass", s.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null);
            o.put("rotation", s.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null);
            Sensor l = s.getDefaultSensor(Sensor.TYPE_LIGHT);
            o.put("light", l != null);
            if (l != null) { o.put("lightMax", l.getMaximumRange()); o.put("lightName", l.getName()); }
            o.put("prox", s.getDefaultSensor(Sensor.TYPE_PROXIMITY) != null);
            o.put("mic", a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_MICROPHONE));
            o.put("micPerm", hasMic());
            o.put("torch", torchCam() != null);
            return o.toString();
        } catch (Throwable t) { return "{}"; }
    }

    private SensorManager sm() {
        if (sm == null) sm = (SensorManager) a.getSystemService(Context.SENSOR_SERVICE);
        return sm;
    }

    /** La page signale qu'elle est toujours là (à appeler toutes les 2 s pendant une mesure) */
    @JavascriptInterface public void ping() { lastPing = System.currentTimeMillis(); }

    // ---------- Démarrage / arrêt ----------
    /** type : motion | compass | light | prox | sound. Retourne false si le capteur manque. */
    @JavascriptInterface public boolean start(final String type) {
        lastPing = System.currentTimeMillis();
        ui.post(new Runnable() { public void run() { hookLifecycle(); } });
        if ("sound".equals(type)) {
            if (!hasMic()) { askMicThenSound(); return false; }
            startSound();
            return true;
        }
        synchronized (on) { if (on.containsKey(type)) return true; }
        SensorManager s = sm();
        if (s == null) return false;
        SensorEventListener l = null;
        boolean ok = false;
        if ("motion".equals(type)) {
            Sensor g = s.getDefaultSensor(Sensor.TYPE_GRAVITY);
            if (g == null) g = s.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (g == null) return false;
            l = motionListener();
            ok = s.registerListener(l, g, SensorManager.SENSOR_DELAY_GAME, ui);
        } else if ("compass".equals(type)) {
            Sensor rv = s.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            Sensor mag = s.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
            Sensor acc = s.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (mag == null) return false;
            CompassListener c = new CompassListener(rv != null);
            l = c;
            ok = s.registerListener(c, mag, SensorManager.SENSOR_DELAY_GAME, ui);
            if (rv != null) ok &= s.registerListener(c, rv, SensorManager.SENSOR_DELAY_GAME, ui);
            else if (acc != null) ok &= s.registerListener(c, acc, SensorManager.SENSOR_DELAY_GAME, ui);
            else ok = false;
        } else if ("light".equals(type)) {
            Sensor li = s.getDefaultSensor(Sensor.TYPE_LIGHT);
            if (li == null) return false;
            l = new SensorEventListener() {
                public void onSensorChanged(SensorEvent e) { if (due("light")) emit("light", "{\"lux\":" + f(e.values[0]) + "}"); }
                public void onAccuracyChanged(Sensor x, int acc) { }
            };
            ok = s.registerListener(l, li, SensorManager.SENSOR_DELAY_UI, ui);
        } else if ("prox".equals(type)) {
            final Sensor p = s.getDefaultSensor(Sensor.TYPE_PROXIMITY);
            if (p == null) return false;
            l = new SensorEventListener() {
                public void onSensorChanged(SensorEvent e) {
                    if (!due("prox")) return;
                    float v = e.values[0]; float max = p.getMaximumRange();
                    emit("prox", "{\"cm\":" + f(v) + ",\"max\":" + f(max) + ",\"near\":" + (v < max) + "}");
                }
                public void onAccuracyChanged(Sensor x, int acc) { }
            };
            ok = s.registerListener(l, p, SensorManager.SENSOR_DELAY_UI, ui);
        } else return false;
        if (!ok) { try { s.unregisterListener(l); } catch (Throwable t) { } return false; }
        synchronized (on) { on.put(type, l); }
        return true;
    }

    @JavascriptInterface public void stop(String type) {
        if ("sound".equals(type)) { soundRun = false; return; }
        SensorEventListener l;
        synchronized (on) { l = on.remove(type); }
        if (l != null) try { sm().unregisterListener(l); } catch (Throwable t) { }
    }

    @JavascriptInterface public void stopAll() { stopEverything(null); }

    /** Types en cours, séparés par des virgules */
    @JavascriptInterface public String running() {
        StringBuilder b = new StringBuilder();
        synchronized (on) { for (String k : on.keySet()) b.append(b.length() > 0 ? "," : "").append(k); }
        if (soundRun) b.append(b.length() > 0 ? "," : "").append("sound");
        return b.toString();
    }

    private void stopEverything(String why) {
        boolean was = busy();
        soundRun = false;
        synchronized (on) {
            for (SensorEventListener l : on.values()) try { sm().unregisterListener(l); } catch (Throwable t) { }
            on.clear();
        }
        if (why != null && was) emit("stopped", "{\"why\":" + JSONObject.quote(why) + "}");
    }

    // ---------- Gravité (niveau, inclinomètre, visée) ----------
    private SensorEventListener motionListener() {
        return new SensorEventListener() {
            double sx, sy, sz; int n;
            public void onSensorChanged(SensorEvent e) {
                sx += e.values[0]; sy += e.values[1]; sz += e.values[2]; n++;
                if (!due("motion")) return;
                emit("motion", "{\"x\":" + f(sx / n) + ",\"y\":" + f(sy / n) + ",\"z\":" + f(sz / n) + ",\"n\":" + n + "}");
                sx = sy = sz = 0; n = 0;
            }
            public void onAccuracyChanged(Sensor x, int acc) { }
        };
    }

    // ---------- Boussole ----------
    private class CompassListener implements SensorEventListener {
        final boolean useRv;
        final float[] grav = new float[3], mag = new float[3], R = new float[9], R2 = new float[9], o = new float[3];
        boolean hasG, hasM;
        int acc = 0;
        double sFs, sFc, sCs, sCc; int n;
        CompassListener(boolean rv) { useRv = rv; }
        public void onSensorChanged(SensorEvent e) {
            int t = e.sensor.getType();
            if (t == Sensor.TYPE_MAGNETIC_FIELD) { System.arraycopy(e.values, 0, mag, 0, 3); hasM = true; if (useRv) return; }
            else if (t == Sensor.TYPE_ACCELEROMETER) {
                for (int i = 0; i < 3; i++) grav[i] = hasG ? grav[i] * 0.85f + e.values[i] * 0.15f : e.values[i];
                hasG = true;
            } else if (t == Sensor.TYPE_ROTATION_VECTOR) {
                float[] v = e.values.length > 4 ? new float[]{ e.values[0], e.values[1], e.values[2], e.values[3] } : e.values;
                SensorManager.getRotationMatrixFromVector(R, v);
            }
            if (!useRv) { if (!hasG || !hasM || !SensorManager.getRotationMatrix(R, null, grav, mag)) return; }
            // À plat : direction du haut de l'écran
            SensorManager.getOrientation(R, o);
            double flat = o[0];
            // Debout : direction de l'appareil photo (axe -Z du téléphone projeté sur l'horizontale)
            double cam = Math.atan2(-R[2], -R[5]);
            sFs += Math.sin(flat); sFc += Math.cos(flat); sCs += Math.sin(cam); sCc += Math.cos(cam); n++;
            if (!due("compass")) return;
            double az = (Math.toDegrees(Math.atan2(sFs, sFc)) + 360) % 360;
            double cz = (Math.toDegrees(Math.atan2(sCs, sCc)) + 360) % 360;
            sFs = sFc = sCs = sCc = 0; n = 0;
            emit("compass", "{\"az\":" + f(az) + ",\"cam\":" + f(cz) + ",\"acc\":" + acc + ",\"src\":\"" + (useRv ? "rv" : "am") + "\"}");
        }
        public void onAccuracyChanged(Sensor s, int a2) { if (s.getType() == Sensor.TYPE_MAGNETIC_FIELD) acc = a2; }
    }

    /** Déclinaison magnétique (degrés, positive vers l'est) pour une position donnée */
    @JavascriptInterface public double declination(double lat, double lon, double altM) {
        try { return new GeomagneticField((float) lat, (float) lon, (float) altM, System.currentTimeMillis()).getDeclination(); }
        catch (Throwable t) { return 0; }
    }

    /** Dernière position connue si l'autorisation est déjà donnée : {ok, lat, lon, alt, age} ; ne demande rien */
    @JavascriptInterface public String lastLocation() {
        try {
            boolean fine = a.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean coarse = a.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (!fine && !coarse) return "{\"ok\":false,\"why\":\"perm\"}";
            LocationManager lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
            Location best = null;
            for (String p : lm.getProviders(true)) {
                try { Location l = lm.getLastKnownLocation(p); if (l != null && (best == null || l.getTime() > best.getTime())) best = l; } catch (SecurityException e) { }
            }
            if (best == null) return "{\"ok\":false,\"why\":\"none\"}";
            return "{\"ok\":true,\"lat\":" + best.getLatitude() + ",\"lon\":" + best.getLongitude() + ",\"alt\":" + best.getAltitude()
                + ",\"age\":" + (System.currentTimeMillis() - best.getTime()) + "}";
        } catch (Throwable t) { return "{\"ok\":false,\"why\":\"err\"}"; }
    }

    // ---------- Micro / sonomètre ----------
    @JavascriptInterface public boolean hasMic() {
        return a.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface public void askMic() {
        ui.post(new Runnable() { public void run() {
            try { a.requestPermissions(new String[]{ android.Manifest.permission.RECORD_AUDIO }, REQ_MIC); }
            catch (Throwable t) { emit("perm", "{\"mic\":false}"); }
        } });
    }

    private void askMicThenSound() { wantSoundAfterPerm = true; askMic(); }

    private void startSound() {
        if (soundRun) return;
        lastPing = System.currentTimeMillis();
        soundRun = true;
        soundThread = new Thread(new Runnable() { public void run() { soundLoop(); } }, "mesure-son");
        soundThread.start();
    }

    private int audioSource() {
        try {
            AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
            if (Build.VERSION.SDK_INT >= 24 && "true".equals(am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED)))
                return MediaRecorder.AudioSource.UNPROCESSED;
        } catch (Throwable t) { }
        return MediaRecorder.AudioSource.VOICE_RECOGNITION;   // sans contrôle automatique de gain sur la plupart des téléphones
    }

    // Filtre de pondération A : 4 passe-haut + 2 passe-bas du premier ordre (transformée bilinéaire avec pré-distorsion),
    // normalisé à 0 dB à 1 kHz. Écart à la norme : quelques dB au-dessus de 10 kHz.
    private static final class Section {
        final double b0, b1, a1; double x1, y1;
        Section(double b0, double b1, double a1) { this.b0 = b0; this.b1 = b1; this.a1 = a1; }
        double run(double x) { double y = b0 * x + b1 * x1 - a1 * y1; x1 = x; y1 = y; return y; }
        double mag(double w) {   // |H(e^jw)|
            double nr = b0 + b1 * Math.cos(w), ni = -b1 * Math.sin(w);
            double dr = 1 + a1 * Math.cos(w), di = -a1 * Math.sin(w);
            return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
        }
    }
    private static Section firstOrder(boolean high, double fHz, double fs) {
        double K = 2 * fs, w = 2 * fs * Math.tan(Math.PI * fHz / fs);
        double d = K + w;
        return high ? new Section(K / d, -K / d, (w - K) / d) : new Section(w / d, w / d, (w - K) / d);
    }

    private void soundLoop() {
        final int fs = 44100;
        AudioRecord rec = null;
        try {
            int min = AudioRecord.getMinBufferSize(fs, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (min <= 0) throw new Exception("Micro indisponible");
            rec = new AudioRecord(audioSource(), fs, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 2, 8192));
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
                rec.release();
                rec = new AudioRecord(MediaRecorder.AudioSource.MIC, fs, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 2, 8192));
                if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new Exception("Micro occupé par une autre appli");
            }
            Section[] aw = { firstOrder(true, 20.598997, fs), firstOrder(true, 20.598997, fs), firstOrder(true, 107.65265, fs),
                             firstOrder(true, 737.86223, fs), firstOrder(false, 12194.217, fs), firstOrder(false, 12194.217, fs) };
            double g = 1, w1k = 2 * Math.PI * 1000 / fs;
            for (Section s : aw) g *= s.mag(w1k);
            final double norm = 1 / g;
            Section dc = firstOrder(true, 10, fs);
            short[] buf = new short[2048];
            final int block = fs / 8;              // 125 ms : constante « rapide » (Fast)
            double sumA = 0, sumZ = 0, pk = 0; int n = 0, skip = fs / 4;   // on ignore 250 ms au démarrage (stabilisation)
            rec.startRecording();
            while (soundRun) {
                int r = rec.read(buf, 0, buf.length);
                if (r <= 0) { if (r < 0) throw new Exception("Lecture du micro impossible"); continue; }
                for (int i = 0; i < r; i++) {
                    double x = buf[i] / 32768.0;
                    double z = dc.run(x);
                    double y = z;
                    for (Section s : aw) y = s.run(y);
                    y *= norm;
                    if (skip > 0) { skip--; continue; }
                    sumZ += z * z; sumA += y * y; if (Math.abs(z) > pk) pk = Math.abs(z); n++;
                    if (n >= block) {
                        double la = 10 * Math.log10(Math.max(sumA / n, 1e-14));
                        double lz = 10 * Math.log10(Math.max(sumZ / n, 1e-14));
                        double lp = 20 * Math.log10(Math.max(pk, 1e-7));
                        emit("sound", "{\"a\":" + f(la) + ",\"z\":" + f(lz) + ",\"pk\":" + f(lp) + ",\"ms\":125}");
                        sumA = sumZ = pk = 0; n = 0;
                    }
                }
            }
        } catch (Throwable t) {
            String m = t.getMessage() == null ? "Micro indisponible" : t.getMessage();
            emit("error", "{\"type\":\"sound\",\"msg\":" + JSONObject.quote(m) + "}");
        } finally {
            soundRun = false;
            if (rec != null) { try { rec.stop(); } catch (Throwable t) { } try { rec.release(); } catch (Throwable t) { } }
        }
    }

    // ---------- Retours : vibration, bip, torche ----------
    @JavascriptInterface public void vibrate(int ms) {
        try {
            Vibrator v = (Vibrator) a.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            int d = Math.max(10, Math.min(ms, 1500));
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(d);
        } catch (Throwable t) { }
    }

    @JavascriptInterface public void beep(int ms) {
        try {
            final ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90);
            int d = Math.max(30, Math.min(ms, 1000));
            tg.startTone(ToneGenerator.TONE_PROP_BEEP, d);
            ui.postDelayed(new Runnable() { public void run() { try { tg.release(); } catch (Throwable t) { } } }, d + 200);
        } catch (Throwable t) { }
    }

    private String torchCam() {
        if (torchId != null) return torchId;
        try {
            CameraManager cm = (CameraManager) a.getSystemService(Context.CAMERA_SERVICE);
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(id);
                Boolean fl = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer face = c.get(CameraCharacteristics.LENS_FACING);
                if (fl != null && fl && face != null && face == CameraCharacteristics.LENS_FACING_BACK) { torchId = id; break; }
            }
        } catch (Throwable t) { }
        return torchId;
    }

    /** Allume ou éteint la lampe (échoue si l'appareil photo est déjà utilisé par la page) */
    @JavascriptInterface public boolean torch(boolean onOff) {
        try {
            String id = torchCam();
            if (id == null || Build.VERSION.SDK_INT < 23) return false;
            ((CameraManager) a.getSystemService(Context.CAMERA_SERVICE)).setTorchMode(id, onOff);
            return true;
        } catch (Throwable t) { return false; }
    }

    /** Partage de texte (repli si MAGPrint.fileMenu est absent) */
    @JavascriptInterface public void share(final String text) {
        ui.post(new Runnable() { public void run() {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Partager")); } catch (Throwable t) { }
        } });
    }
}
