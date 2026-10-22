package __PKG__;

// Mélodie : volume égal entre les morceaux (et mode doux).
// 1) Mesure du volume perçu de chaque morceau (sonie LUFS, norme EBU R128 / ITU BS.1770 :
//    filtre K, blocs de 400 ms, seuils -70 LUFS puis -10 LU), sur 8 extraits répartis dans le morceau.
//    Résultat gardé en mémoire (préférences « melodie_loud ») : chaque morceau n'est mesuré qu'une fois.
// 2) Correction pendant l'écoute avec l'effet audio Android DynamicsProcessing (Android 9+) :
//    gain d'entrée = cible - sonie mesurée, limiteur pour ne jamais saturer,
//    et en mode doux un compresseur qui calme les passages forts à l'intérieur d'un même morceau.
//    Repli sans DynamicsProcessing : LoudnessEnhancer pour monter, volume du lecteur pour baisser.

import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import org.json.JSONObject;

public class MelodieVolume {
    static final float TARGET = -16f;          // LUFS visés (confortable à faible volume, marge pour monter les morceaux faibles)
    static final float MAX_UP = 9f, MAX_DOWN = -15f;
    static float baseVol = 1f;                 // volume du lecteur (repli sans DynamicsProcessing), utilisé aussi pour l'atténuation « duck »
    static float curGain = 0f;
    static long curId = -1;
    static volatile String scanState = "{}";
    static volatile boolean scanning = false, scanStop = false;

    private static Object dp;                  // android.media.audiofx.DynamicsProcessing (Android 9+)
    private static int dpSession = -1, dpMode = -1;
    private static android.media.audiofx.LoudnessEnhancer le;
    private static int leSession = -1;
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static Runnable ramp;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("melodie_loud", Context.MODE_PRIVATE); }
    /** 0 = désactivé, 1 = égaliser les morceaux, 2 = égaliser + mode doux */
    static int mode(Context c) { return prefs(c).getInt("mode", 0); }

    static String state(Context c) {
        try {
            JSONObject o = new JSONObject(scanState);
            o.put("mode", mode(c)); o.put("gain", Math.round(curGain * 10) / 10.0); o.put("id", curId);
            o.put("dp", Build.VERSION.SDK_INT >= 28);
            o.put("known", prefs(c).getAll().size() - (prefs(c).contains("mode") ? 1 : 0));
            o.put("scanning", scanning);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    static void setMode(Context c, int m) {
        prefs(c).edit().putInt("mode", Math.max(0, Math.min(2, m))).apply();
        final MusicService s = MusicService.inst;
        if (s != null) s.h.post(new Runnable() { public void run() { s.applyVolume(); } });
    }

    static Float cached(Context c, long id) {
        String k = "t" + id;
        SharedPreferences p = prefs(c);
        return p.contains(k) ? p.getFloat(k, TARGET) : null;
    }

    /** Applique la correction pour le morceau en cours (appelé sur le fil principal quand le lecteur est prêt). */
    static void apply(final Context c, final MediaPlayer mp, final long id, final long[] upcoming) {
        if (mp == null) return;
        final int m = mode(c);
        curId = id;
        if (m == 0) { setGain(mp, 0f, m, false); release(); return; }
        Float l = cached(c, id);
        if (l != null) setGain(mp, gainFor(l), m, false);
        else {
            // Pas encore mesuré : prudence (-4 dB), puis glissement doux vers le bon niveau dès que la mesure est faite (1 à 2 s)
            setGain(mp, -4f, m, false);
            new Thread(new Runnable() { public void run() {
                final float lu = measureAndStore(c, id);
                H.post(new Runnable() { public void run() {
                    if (curId == id && mode(c) != 0 && !Float.isNaN(lu)) setGain(mp, gainFor(lu), mode(c), true);
                } });
            } }, "melodie-volume").start();
        }
        // Mesure à l'avance des morceaux suivants, pour un enchaînement sans ajustement
        if (upcoming != null && upcoming.length > 0) new Thread(new Runnable() { public void run() {
            for (long u : upcoming) if (u >= 0 && !scanning && cached(c, u) == null) measureAndStore(c, u);
        } }, "melodie-volume-suivants").start();
    }

    static float gainFor(float lufs) { return Math.max(MAX_DOWN, Math.min(MAX_UP, TARGET - lufs)); }

    private static void setGain(final MediaPlayer mp, final float target, final int m, boolean smooth) {
        if (ramp != null) { H.removeCallbacks(ramp); ramp = null; }
        if (!smooth || Math.abs(target - curGain) < 0.5f) { curGain = target; push(mp, target, m); return; }
        final float from = curGain;
        ramp = new Runnable() {
            int k = 0;
            public void run() {
                k++;
                float g = from + (target - from) * k / 15f;
                curGain = g; push(mp, g, m);
                if (k < 15) H.postDelayed(this, 100); else ramp = null;
            }
        };
        H.post(ramp);
    }

    private static void push(MediaPlayer mp, float gain, int m) {
        int session;
        try { session = mp.getAudioSessionId(); } catch (Exception e) { return; }
        if (m == 0) { baseVol = 1f; release(); try { mp.setVolume(1f, 1f); } catch (Exception e) { } return; }
        if (Build.VERSION.SDK_INT >= 28 && dynamics(session, m, gain)) { baseVol = 1f; try { mp.setVolume(1f, 1f); } catch (Exception e) { } return; }
        // Repli : monter avec LoudnessEnhancer, baisser avec le volume du lecteur
        try {
            if (gain > 0) {
                if (le == null || leSession != session) { if (le != null) le.release(); le = new android.media.audiofx.LoudnessEnhancer(session); leSession = session; }
                le.setTargetGain(Math.round(gain * 100)); le.setEnabled(true);
                baseVol = 1f;
            } else {
                if (le != null) le.setEnabled(false);
                baseVol = (float) Math.pow(10, gain / 20);
            }
            mp.setVolume(baseVol, baseVol);
        } catch (Throwable t) { }
    }

    @android.annotation.TargetApi(28)
    private static boolean dynamics(int session, int m, float gain) {
        try {
            android.media.audiofx.DynamicsProcessing d = (android.media.audiofx.DynamicsProcessing) dp;
            if (d == null || dpSession != session || dpMode != m) {
                if (d != null) { try { d.release(); } catch (Throwable t) { } }
                boolean soft = m == 2;
                android.media.audiofx.DynamicsProcessing.Config cfg = new android.media.audiofx.DynamicsProcessing.Config.Builder(
                    android.media.audiofx.DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                    false, 0, soft, soft ? 1 : 0, false, 0, true).build();
                if (soft) {
                    // Compresseur doux large bande : au-dessus de -26 dB, les montées sont divisées par 3
                    cfg.setMbcBandAllChannelsTo(0, new android.media.audiofx.DynamicsProcessing.MbcBand(
                        true, 20000f, 15f, 400f, 3f, -26f, 8f, -90f, 1f, 0f, 5f));
                }
                // Limiteur : jamais de saturation, même quand on monte un morceau faible
                cfg.setLimiterAllChannelsTo(new android.media.audiofx.DynamicsProcessing.Limiter(true, true, 0, 1f, 80f, 10f, -1.5f, 0f));
                d = new android.media.audiofx.DynamicsProcessing(0, session, cfg);
                dp = d; dpSession = session; dpMode = m;
            }
            d.setInputGainAllChannelsTo(gain);
            d.setEnabled(true);
            if (le != null) { try { le.setEnabled(false); } catch (Throwable t) { } }
            return true;
        } catch (Throwable t) { dp = null; dpSession = -1; return false; }
    }

    static void release() {
        if (ramp != null) { H.removeCallbacks(ramp); ramp = null; }
        if (Build.VERSION.SDK_INT >= 28 && dp != null) { try { ((android.media.audiofx.DynamicsProcessing) dp).release(); } catch (Throwable t) { } }
        dp = null; dpSession = -1; dpMode = -1;
        if (le != null) { try { le.release(); } catch (Throwable t) { } le = null; leSession = -1; }
        curGain = 0f;
    }

    // ---------- Mesure de la sonie (LUFS) ----------
    static float measureAndStore(Context c, long id) {
        float l = measure(c, id);
        if (!Float.isNaN(l)) prefs(c).edit().putFloat("t" + id, l).apply();
        return l;
    }

    /** Analyse de toute la bibliothèque, en arrière-plan (ids fournis par la page). */
    static void scanAll(final Context c, final long[] ids) {
        if (scanning) return;
        scanning = true; scanStop = false;
        new Thread(new Runnable() { public void run() {
            int done = 0, todo = 0;
            for (long id : ids) if (cached(c, id) == null) todo++;
            for (long id : ids) {
                if (scanStop) break;
                if (cached(c, id) != null) continue;
                measureAndStore(c, id); done++;
                scanState = "{\"done\":" + done + ",\"todo\":" + todo + "}";
            }
            scanState = "{\"done\":" + done + ",\"todo\":" + todo + ",\"end\":true}";
            scanning = false;
        } }, "melodie-volume-tout").start();
    }

    static float measure(Context c, long id) {
        MediaExtractor ex = new MediaExtractor();
        MediaCodec dec = null;
        try {
            Uri u = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
            ex.setDataSource(c, u, null);
            int tr = -1; MediaFormat f = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat g = ex.getTrackFormat(i);
                String mime = g.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { tr = i; f = g; break; }
            }
            if (tr < 0) return Float.NaN;
            ex.selectTrack(tr);
            long durUs = f.containsKey(MediaFormat.KEY_DURATION) ? f.getLong(MediaFormat.KEY_DURATION) : 0;
            int rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int ch = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            dec = MediaCodec.createDecoderByType(f.getString(MediaFormat.KEY_MIME));
            dec.configure(f, null, null, 0);
            dec.start();

            // 8 extraits de 6 s répartis entre 8 % et 92 % du morceau (ou le morceau entier s'il est court)
            int segs = durUs > 60_000_000L ? 8 : 1;
            long segUs = segs == 1 ? Math.max(durUs, 1) : 6_000_000L;
            ArrayList<Double> blocks = new ArrayList<Double>();
            long t0 = System.currentTimeMillis();
            boolean isFloat = false;
            for (int s = 0; s < segs; s++) {
                if (System.currentTimeMillis() - t0 > 6000) break;   // garde-fou : jamais plus de 6 s d'analyse
                long start = segs == 1 ? 0 : (long) (durUs * (0.08 + 0.84 * s / (segs - 1.0)));
                ex.seekTo(start, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
                dec.flush();
                KFilter kf = new KFilter(rate, ch);
                int blockLen = Math.max(1, rate * 4 / 10), hop = Math.max(1, rate / 10); // blocs de 400 ms, pas de 100 ms
                double[] ring = new double[blockLen]; int ri = 0, filled = 0, sinceHop = 0;
                long frames = 0, warm = rate / 5;                      // 200 ms de mise en route du filtre ignorés
                long maxFrames = segs == 1 ? Long.MAX_VALUE : rate * (segUs / 1_000_000L);
                double win = 0;
                boolean inEos = false, outEos = false;
                MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
                int outCh = ch;
                while (!outEos && frames < maxFrames + warm) {
                    if (!inEos) {
                        int ii = dec.dequeueInputBuffer(5000);
                        if (ii >= 0) {
                            ByteBuffer ib = dec.getInputBuffer(ii);
                            int n = ex.readSampleData(ib, 0);
                            if (n < 0) { dec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEos = true; }
                            else { dec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0); ex.advance(); }
                        }
                    }
                    int oi = dec.dequeueOutputBuffer(bi, 5000);
                    if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        MediaFormat of = dec.getOutputFormat();
                        if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) outCh = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                        if (Build.VERSION.SDK_INT >= 24 && of.containsKey(MediaFormat.KEY_PCM_ENCODING)) isFloat = of.getInteger(MediaFormat.KEY_PCM_ENCODING) == 4;
                        if (outCh != kf.ch) kf = new KFilter(rate, outCh);
                        continue;
                    }
                    if (oi < 0) { if (inEos && oi == MediaCodec.INFO_TRY_AGAIN_LATER && System.currentTimeMillis() - t0 > 7000) break; continue; }
                    ByteBuffer ob = dec.getOutputBuffer(oi);
                    if (ob != null && bi.size > 0) {
                        ob.position(bi.offset); ob.limit(bi.offset + bi.size);
                        ByteBuffer b = ob.slice().order(ByteOrder.nativeOrder());
                        int bytes = isFloat ? 4 : 2;
                        int nFrames = bi.size / (bytes * outCh);
                        for (int fr = 0; fr < nFrames; fr++) {
                            double e = 0;
                            for (int k = 0; k < outCh; k++) {
                                double x = isFloat ? b.getFloat() : b.getShort() / 32768.0;
                                double y = kf.run(k, x);
                                if (k < 2 || outCh <= 2) e += y * y;   // canaux principaux (pondération 1)
                            }
                            frames++;
                            if (frames <= warm) continue;
                            win += e - ring[ri]; ring[ri] = e; ri = (ri + 1) % blockLen;
                            if (filled < blockLen) filled++;
                            if (++sinceHop >= hop) { sinceHop = 0; if (filled == blockLen) blocks.add(Math.max(win, 0) / blockLen); }
                        }
                    }
                    dec.releaseOutputBuffer(oi, false);
                    if ((bi.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
                }
            }
            if (blocks.isEmpty()) return Float.NaN;
            // Seuil absolu -70 LUFS puis seuil relatif -10 LU
            double absT = Math.pow(10, (-70 + 0.691) / 10), sum = 0; int n = 0;
            for (double z : blocks) if (z > absT) { sum += z; n++; }
            if (n == 0) return -70f;
            double relT = (sum / n) * Math.pow(10, -10 / 10.0); sum = 0; n = 0;
            for (double z : blocks) if (z > absT && z > relT) { sum += z; n++; }
            if (n == 0) return -70f;
            return (float) (-0.691 + 10 * Math.log10(sum / n));
        } catch (Throwable t) {
            return Float.NaN;
        } finally {
            try { if (dec != null) { dec.stop(); dec.release(); } } catch (Throwable t) { }
            try { ex.release(); } catch (Throwable t) { }
        }
    }

    /** Filtre K de la norme ITU-R BS.1770 (plateau aigu + passe-haut), recalculé pour la fréquence du fichier. */
    static class KFilter {
        final int ch;
        final double b0, b1, b2, a1, a2, c1, c2;           // étage 1 (plateau) ; étage 2 : passe-haut b = [1,-2,1]
        final double[] x1, x2, y1, y2, u1, u2, z1, z2;
        KFilter(int rate, int ch) {
            this.ch = Math.max(1, ch);
            double f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
            double K = Math.tan(Math.PI * f0 / rate), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
            double a0 = 1 + K / Q + K * K;
            b0 = (Vh + Vb * K / Q + K * K) / a0; b1 = 2 * (K * K - Vh) / a0; b2 = (Vh - Vb * K / Q + K * K) / a0;
            a1 = 2 * (K * K - 1) / a0; a2 = (1 - K / Q + K * K) / a0;
            double f1 = 38.13547087602444, Q1 = 0.5003270373238773, K1 = Math.tan(Math.PI * f1 / rate);
            double d0 = 1 + K1 / Q1 + K1 * K1;
            c1 = 2 * (K1 * K1 - 1) / d0; c2 = (1 - K1 / Q1 + K1 * K1) / d0;
            x1 = new double[this.ch]; x2 = new double[this.ch]; y1 = new double[this.ch]; y2 = new double[this.ch];
            u1 = new double[this.ch]; u2 = new double[this.ch]; z1 = new double[this.ch]; z2 = new double[this.ch];
        }
        double run(int k, double x) {
            if (k >= ch) return 0;
            double y = b0 * x + b1 * x1[k] + b2 * x2[k] - a1 * y1[k] - a2 * y2[k];
            x2[k] = x1[k]; x1[k] = x; y2[k] = y1[k]; y1[k] = y;
            double z = y - 2 * u1[k] + u2[k] - c1 * z1[k] - c2 * z2[k];
            u2[k] = u1[k]; u1[k] = y; z2[k] = z1[k]; z1[k] = z;
            return z;
        }
    }
}
