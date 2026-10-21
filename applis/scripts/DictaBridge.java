package __PKG__;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.app.RecoverableSecurityException;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.graphics.drawable.Icon;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Dictaphone : pont exposé sous window.MAGDicta.
 * L'enregistrement et la lecture tournent dans DictaService (appelé par réflexion : ce pont compile et se charge
 * aussi dans les applis qui n'ont pas ce service). Événements : window.dictaEvent(type, objet).
 * Codes de requête : 6150 autorisations, 6162 renommage (accès en écriture), 6163 suppression.
 */
public class DictaBridge {
    static final int REQ_PERM = 6150, REQ_WRITE = 6162, REQ_DELETE = 6163;
    static final String PREFS = "dicta";
    static final String CARNET = "fr.magformation13.carnet";
    static final int SDK = Build.VERSION.SDK_INT;

    private final Activity a;
    private final WebView wv;
    private boolean sinkSet = false;
    private Runnable pendingWrite;
    private long pendingDeleteId = -1;

    public DictaBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ================= Outils =================
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void js(final String js) { ui(() -> { try { wv.evaluateJavascript(js, null); } catch (Throwable e) { } }); }
    private void emit(String type, String json) {
        js("window.dictaEvent&&dictaEvent(" + JSONObject.quote(type) + "," + (json == null || json.isEmpty() ? "{}" : json) + ")");
    }
    private void emit(String type, JSONObject o) { emit(type, o == null ? "{}" : o.toString()); }
    private static JSONObject o(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception e) { }
        return o;
    }
    private boolean can(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private SharedPreferences prefs() { return a.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ----- Service (réflexion) -----
    private Class<?> svcClass() {
        try { return Class.forName(DictaBridge.class.getPackage().getName() + ".DictaService"); } catch (Throwable e) { return null; }
    }
    private void ensureSink() {
        if (sinkSet) return;
        Class<?> k = svcClass();
        if (k == null) return;
        try {
            ValueCallback<String> cb = new ValueCallback<String>() {
                public void onReceiveValue(String v) {
                    int i = v.indexOf('\u0001');
                    if (i < 0) return;
                    String type = v.substring(0, i);
                    // Niveaux et position de lecture : inutiles quand l'appli n'est pas à l'écran
                    if (("level".equals(type) || "play".equals(type) && !v.contains("\"ended\"")) && wv.getWindowVisibility() != View.VISIBLE) return;
                    try { wv.evaluateJavascript("window.dictaEvent&&dictaEvent(" + JSONObject.quote(type) + "," + v.substring(i + 1) + ")", null); } catch (Throwable e) { }
                }
            };
            k.getMethod("setSink", ValueCallback.class).invoke(null, cb);
            sinkSet = true;
        } catch (Throwable e) { }
    }
    private String svc(String action, String arg) {
        Class<?> k = svcClass();
        if (k == null) return "nosvc";
        ensureSink();
        try { Object r = k.getMethod("cmd", Context.class, String.class, String.class).invoke(null, a.getApplicationContext(), action, arg); return r == null ? "" : r.toString(); }
        catch (Throwable e) { return "err:" + e.getMessage(); }
    }

    // ================= Infos et autorisations =================
    @JavascriptInterface public String info() {
        ensureSink();
        boolean speech = false, onDevice = false;
        try { speech = SpeechRecognizer.isRecognitionAvailable(a); } catch (Throwable e) { }
        try { if (SDK >= 31) onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(a); } catch (Throwable e) { }
        boolean carnet = false;
        try { a.getPackageManager().getPackageInfo(CARNET, 0); carnet = true; } catch (Throwable e) { }
        return o("sdk", SDK, "mic", can(Manifest.permission.RECORD_AUDIO), "notif", SDK < 33 || can("android.permission.POST_NOTIFICATIONS"),
                "pause", SDK >= 24, "svc", svcClass() != null, "speech", speech || onDevice, "onDevice", onDevice,
                "carnet", carnet, "free", freeBytes(), "folder", SDK >= 31 ? "Recordings/Dictaphone" : "Music/Dictaphone").toString();
    }
    @JavascriptInterface public boolean hasMic() { return can(Manifest.permission.RECORD_AUDIO); }
    /** Demande micro + notifications + lecture des fichiers audio (pour retrouver les notes après une réinstallation) */
    @JavascriptInterface public void askPerms() {
        ui(() -> {
            List<String> need = new ArrayList<>();
            if (!can(Manifest.permission.RECORD_AUDIO)) need.add(Manifest.permission.RECORD_AUDIO);
            if (SDK >= 33 && !can("android.permission.POST_NOTIFICATIONS")) need.add("android.permission.POST_NOTIFICATIONS");
            if (SDK >= 33 && !can("android.permission.READ_MEDIA_AUDIO")) need.add("android.permission.READ_MEDIA_AUDIO");
            if (SDK < 33 && !can(Manifest.permission.READ_EXTERNAL_STORAGE)) need.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (SDK < 29 && !can(Manifest.permission.WRITE_EXTERNAL_STORAGE)) need.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            if (need.isEmpty()) { emit("perm", o("mic", true)); return; }
            a.requestPermissions(need.toArray(new String[0]), REQ_PERM);
        });
    }
    @JavascriptInterface public void openSettings() {
        ui(() -> { try { a.startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable e) { } });
    }
    @JavascriptInterface public void keepScreen(final boolean on) {
        ui(() -> { if (on) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
    }
    @JavascriptInterface public double freeSpace() { return freeBytes(); }
    static long freeBytes() {
        try { return new StatFs(Environment.getExternalStorageDirectory().getPath()).getAvailableBytes(); } catch (Throwable e) { return -1; }
    }

    // ================= Enregistrement =================
    /** q : "voice" (AAC 64 kb/s), "hq" (AAC 128 kb/s), "wav". Retour : ok, perm (autorisation demandée), nosvc, fgs, busy */
    @JavascriptInterface public String recStart(String q) {
        if (!can(Manifest.permission.RECORD_AUDIO)) { askPerms(); return "perm"; }
        if (speechOn) return "busy";
        if (SDK < 29 && !can(Manifest.permission.WRITE_EXTERNAL_STORAGE)) { askPerms(); return "perm"; }
        return svc("start", q);
    }
    @JavascriptInterface public void recPause() { svc("pause", ""); }
    @JavascriptInterface public void recResume() { svc("resume", ""); }
    @JavascriptInterface public void recStop() { svc("stop", ""); }
    @JavascriptInterface public void recDiscard() { svc("discard", ""); }
    /** Pose un marqueur à l'instant présent ; retourne son numéro (-1 si pas d'enregistrement) */
    @JavascriptInterface public int recMark(String note) { try { return Integer.parseInt(svc("mark", note == null ? "" : note)); } catch (Exception e) { return -1; } }
    @JavascriptInterface public void recNote(int i, String note) { svc("note", i + "\n" + (note == null ? "" : note)); }
    @JavascriptInterface public String recState() { String s = svc("state", ""); return s.startsWith("{") ? s : "{\"rec\":false}"; }
    /** Résultat du dernier enregistrement terminé (utile si l'appli était fermée à ce moment-là) */
    @JavascriptInterface public String recLast() { String s = svc("last", ""); return s.startsWith("{") ? s : ""; }

    // ================= Liste (MediaStore) =================
    private Uri collection() {
        return SDK >= 29 ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL) : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
    }
    private String[] selection() {
        if (SDK >= 29) return new String[]{ MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? OR " + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?", Environment.DIRECTORY_MUSIC + "/Dictaphone%", "Recordings/Dictaphone%" };
        return new String[]{ MediaStore.MediaColumns.DATA + " LIKE ?", "%/Music/Dictaphone/%" };
    }
    private Uri itemUri(long id) { return ContentUris.withAppendedId(collection(), id); }
    private JSONObject meta(long id) {
        try { String s = prefs().getString("m_" + id, null); if (s != null) return new JSONObject(s); } catch (Exception e) { }
        return new JSONObject();
    }

    /** [{id, uri, name, file, date, dur, size, mime, markers, tags, chantier, q}] du plus récent au plus ancien */
    @JavascriptInterface public String list() {
        JSONArray out = new JSONArray();
        String[] s = selection();
        String[] proj = { MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.MIME_TYPE, MediaStore.Audio.AudioColumns.DURATION };
        String[] args = java.util.Arrays.copyOfRange(s, 1, s.length);
        try (Cursor c = a.getContentResolver().query(collection(), proj, s[0], args, MediaStore.MediaColumns.DATE_ADDED + " DESC")) {
            if (c != null) while (c.moveToNext()) {
                long id = c.getLong(0);
                String file = c.getString(1) == null ? "" : c.getString(1);
                JSONObject m = meta(id);
                long dur = c.isNull(6) ? 0 : c.getLong(6);
                if (dur <= 0) dur = m.optLong("dur", 0);
                long date = m.optLong("date", 0);
                if (date <= 0) date = c.getLong(3) * 1000L;
                if (date <= 0) date = c.getLong(4) * 1000L;
                JSONObject r = new JSONObject();
                r.put("id", id); r.put("uri", itemUri(id).toString()); r.put("file", file);
                r.put("name", file.replaceFirst("\\.[A-Za-z0-9]{2,4}$", ""));
                r.put("date", date); r.put("dur", dur); r.put("size", c.getLong(2)); r.put("mime", c.getString(5) == null ? "" : c.getString(5));
                r.put("markers", m.optJSONArray("markers") == null ? new JSONArray() : m.optJSONArray("markers"));
                r.put("tags", m.optJSONArray("tags") == null ? new JSONArray() : m.optJSONArray("tags"));
                r.put("chantier", m.optString("chantier", ""));
                r.put("q", m.optString("q", file.toLowerCase().endsWith(".wav") ? "wav" : ""));
                out.put(r);
            }
        } catch (Throwable e) { return "[]"; }
        return out.toString();
    }

    /** Chantier et étiquettes à appliquer aux prochaines notes (lus par le service à la fin de l'enregistrement) */
    @JavascriptInterface public void setNext(String json) {
        try { new JSONObject(json); prefs().edit().putString("nextMeta", json).apply(); } catch (Throwable e) { }
    }

    /** Fusionne json ({markers, tags, chantier}) dans les infos de la note */
    @JavascriptInterface public boolean setMeta(String id, String json) {
        try {
            long k = Long.parseLong(id);
            JSONObject m = meta(k), n = new JSONObject(json);
            Iterator<String> it = n.keys();
            while (it.hasNext()) { String key = it.next(); m.put(key, n.get(key)); }
            prefs().edit().putString("m_" + k, m.toString()).apply();
            return true;
        } catch (Throwable e) { return false; }
    }

    /** Renomme (le nom de fichier garde son extension). Retour : ok, wait (Android demande l'accord), err */
    @JavascriptInterface public String rename(final String id, final String name) {
        final String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\n\\r]", " ").trim();
        if (clean.isEmpty()) return "err";
        final long k;
        try { k = Long.parseLong(id); } catch (Exception e) { return "err"; }
        final Uri u = itemUri(k);
        String ext = ".m4a";
        try (Cursor c = a.getContentResolver().query(u, new String[]{ MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.DATA }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String f = c.getString(0);
                int dot = f == null ? -1 : f.lastIndexOf('.');
                if (dot > 0) ext = f.substring(dot);
                if (SDK < 29) {
                    File old = new File(c.getString(1)), nf = new File(old.getParentFile(), clean + ext);
                    if (nf.exists()) return "exists";
                    if (!old.renameTo(nf)) return "err";
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DATA, nf.getAbsolutePath()); v.put(MediaStore.MediaColumns.DISPLAY_NAME, clean + ext); v.put(MediaStore.MediaColumns.TITLE, clean);
                    a.getContentResolver().update(u, v, null, null);
                    return "ok";
                }
            }
        } catch (Throwable e) { }
        final ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, clean + ext);
        v.put(MediaStore.MediaColumns.TITLE, clean);
        try {
            a.getContentResolver().update(u, v, null, null);
            return "ok";
        } catch (SecurityException se) {
            pendingWrite = () -> {
                try { a.getContentResolver().update(u, v, null, null); emit("renamed", o("id", k, "name", clean, "ok", true)); }
                catch (Throwable e) { emit("renamed", o("id", k, "ok", false)); }
            };
            try {
                PendingIntent pi = null;
                if (SDK >= 30) { List<Uri> l = new ArrayList<>(); l.add(u); pi = MediaStore.createWriteRequest(a.getContentResolver(), l); }
                else if (SDK >= 29 && se instanceof RecoverableSecurityException) pi = ((RecoverableSecurityException) se).getUserAction().getActionIntent();
                if (pi == null) { pendingWrite = null; return "err"; }
                final PendingIntent fpi = pi;
                ui(() -> { try { a.startIntentSenderForResult(fpi.getIntentSender(), REQ_WRITE, null, 0, 0, 0); } catch (Throwable e) { } });
                return "wait";
            } catch (Throwable e) { pendingWrite = null; return "err"; }
        } catch (Throwable e) { return "err"; }
    }

    /** Supprime la note. Retour : ok, wait (confirmation Android), err */
    @JavascriptInterface public String remove(String id) {
        final long k;
        try { k = Long.parseLong(id); } catch (Exception e) { return "err"; }
        Uri u = itemUri(k);
        try {
            if (SDK < 29) {
                try (Cursor c = a.getContentResolver().query(u, new String[]{ MediaStore.MediaColumns.DATA }, null, null, null)) {
                    if (c != null && c.moveToFirst() && c.getString(0) != null) new File(c.getString(0)).delete();
                }
            }
            a.getContentResolver().delete(u, null, null);
            prefs().edit().remove("m_" + k).apply();
            return "ok";
        } catch (SecurityException se) {
            try {
                PendingIntent pi = null;
                if (SDK >= 30) { List<Uri> l = new ArrayList<>(); l.add(u); pi = MediaStore.createDeleteRequest(a.getContentResolver(), l); }
                else if (SDK >= 29 && se instanceof RecoverableSecurityException) pi = ((RecoverableSecurityException) se).getUserAction().getActionIntent();
                if (pi == null) return "err";
                pendingDeleteId = k;
                final PendingIntent fpi = pi;
                ui(() -> { try { a.startIntentSenderForResult(fpi.getIntentSender(), REQ_DELETE, null, 0, 0, 0); } catch (Throwable e) { } });
                return "wait";
            } catch (Throwable e) { return "err"; }
        } catch (Throwable e) { return "err"; }
    }

    // ================= Partage, Carnet =================
    /** ids : tableau JSON d'identifiants. text : message joint (nom, marqueurs…) */
    @JavascriptInterface public boolean share(String ids, final String text) {
        try {
            JSONArray l = new JSONArray(ids);
            final ArrayList<Uri> uris = new ArrayList<>();
            boolean wav = false, m4a = false;
            for (int i = 0; i < l.length(); i++) uris.add(itemUri(l.getLong(i)));
            for (Uri u : uris) { String t = a.getContentResolver().getType(u); if (t != null && t.contains("wav")) wav = true; else m4a = true; }
            if (uris.isEmpty()) return false;
            final String type = wav && m4a ? "audio/*" : wav ? "audio/x-wav" : "audio/mp4";
            ui(() -> {
                Intent i;
                if (uris.size() == 1) { i = new Intent(Intent.ACTION_SEND); i.putExtra(Intent.EXTRA_STREAM, uris.get(0)); }
                else { i = new Intent(Intent.ACTION_SEND_MULTIPLE); i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris); }
                i.setType(type);
                if (text != null && !text.isEmpty()) { i.putExtra(Intent.EXTRA_TEXT, text); i.putExtra(Intent.EXTRA_SUBJECT, text.split("\n")[0]); }
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { a.startActivity(Intent.createChooser(i, "Envoyer la note")); } catch (Throwable e) { emit("error", o("msg", "Aucune appli pour partager")); }
            });
            return true;
        } catch (Throwable e) { return false; }
    }
    /** Envoie un texte à Carnet (si installé et carnet=true), sinon au partage Android. Retour : carnet, share, err */
    @JavascriptInterface public String sendText(final String text, final String title, boolean carnet) {
        final Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
        if (title != null && !title.isEmpty()) { i.putExtra(Intent.EXTRA_SUBJECT, title); i.putExtra(Intent.EXTRA_TITLE, title); }
        if (carnet) {
            Intent c = new Intent(i).setPackage(CARNET);
            try { a.startActivity(c); return "carnet"; } catch (ActivityNotFoundException e) { } catch (Throwable e) { }
        }
        try { a.startActivity(Intent.createChooser(i, "Envoyer le texte")); return "share"; } catch (Throwable e) { return "err"; }
    }

    // ================= Lecture (dans le service : continue en arrière-plan) =================
    @JavascriptInterface public String play(String id, String name, int posMs, float speed) {
        try {
            long k = Long.parseLong(id);
            return svc("play", o("id", k, "uri", itemUri(k).toString(), "name", name, "pos", posMs, "speed", (double) speed).toString());
        } catch (Throwable e) { return "err"; }
    }
    /** action : toggle, seek (ms), skip (± ms), speed (0.5–2), pstop */
    @JavascriptInterface public void playCmd(String action, String arg) { svc(action, arg == null ? "" : arg); }
    @JavascriptInterface public String playState() { String s = svc("pstate", ""); return s.startsWith("{") ? s : "{}"; }

    // ================= Forme d'onde (calculée en natif, envoyée en JSON) =================
    /** Calcule n pics (0..1) en tâche de fond ; événement "wave" {id, peaks, dur} */
    @JavascriptInterface public void wave(final String id, final int n) {
        new Thread(() -> {
            long k = -1;
            try {
                k = Long.parseLong(id);
                int nb = Math.max(50, Math.min(2000, n));
                Uri u = itemUri(k);
                long size = 0; String mime = "";
                try (Cursor c = a.getContentResolver().query(u, new String[]{ MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.MIME_TYPE }, null, null, null)) {
                    if (c != null && c.moveToFirst()) { size = c.getLong(0); mime = c.getString(1) == null ? "" : c.getString(1); }
                }
                File cache = new File(a.getCacheDir(), "wave_" + k + "_" + size + "_" + nb + ".json");
                if (cache.exists()) { emit("wave", new String(readAll(new FileInputStream(cache)), "UTF-8")); return; }
                float[] pk; long durMs;
                if (mime.contains("wav")) { long[] d = new long[1]; pk = wavPeaks(u, nb, d); durMs = d[0]; }
                else { long[] d = new long[1]; pk = codecPeaks(u, nb, d); durMs = d[0]; }
                JSONArray arr = new JSONArray();
                for (float f : pk) arr.put(Math.round(f * 1000) / 1000.0);
                String json = o("id", k, "peaks", arr, "dur", durMs).toString();
                try (FileOutputStream fo = new FileOutputStream(cache)) { fo.write(json.getBytes("UTF-8")); } catch (Throwable e) { }
                emit("wave", json);
            } catch (Throwable e) {
                emit("wave", o("id", k, "error", String.valueOf(e.getMessage())));
            }
        }, "dicta-wave").start();
    }

    private float[] codecPeaks(Uri u, int n, long[] durOut) throws Exception {
        float[] pk = new float[n];
        MediaExtractor ex = new MediaExtractor();
        MediaCodec dec = null;
        try {
            ex.setDataSource(a, u, null);
            int tr = -1; MediaFormat f = null;
            for (int i = 0; i < ex.getTrackCount(); i++) { MediaFormat g = ex.getTrackFormat(i); String m = g.getString(MediaFormat.KEY_MIME); if (m != null && m.startsWith("audio/")) { tr = i; f = g; break; } }
            if (tr < 0) throw new Exception("pas de piste audio");
            ex.selectTrack(tr);
            long durUs = f.containsKey(MediaFormat.KEY_DURATION) ? f.getLong(MediaFormat.KEY_DURATION) : 0;
            if (durUs <= 0) throw new Exception("durée inconnue");
            durOut[0] = durUs / 1000;
            // Notes longues : on ne décode qu'une trame sur « stride » (assez pour dessiner)
            int stride = (int) Math.max(1, Math.ceil(durUs / 600e6));
            dec = MediaCodec.createDecoderByType(f.getString(MediaFormat.KEY_MIME));
            dec.configure(f, null, null, 0);
            dec.start();
            int rate = f.containsKey(MediaFormat.KEY_SAMPLE_RATE) ? f.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 44100;
            int ch = f.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? f.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
            boolean inEnd = false, outEnd = false;
            long frame = 0, t0 = System.currentTimeMillis();
            while (!outEnd && System.currentTimeMillis() - t0 < 90000) {
                if (!inEnd) {
                    int ii = dec.dequeueInputBuffer(5000);
                    if (ii >= 0) {
                        ByteBuffer ib = dec.getInputBuffer(ii);
                        int sz = -1; long ts = 0;
                        while (true) {
                            sz = ex.readSampleData(ib, 0);
                            if (sz < 0) break;
                            ts = ex.getSampleTime();
                            boolean keep = (frame++ % stride) == 0;
                            if (keep) break;
                            ex.advance();
                        }
                        if (sz < 0) { dec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEnd = true; }
                        else { dec.queueInputBuffer(ii, 0, sz, ts, 0); ex.advance(); }
                    }
                }
                int oi = dec.dequeueOutputBuffer(bi, 5000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = dec.getOutputFormat();
                    if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                } else if (oi >= 0) {
                    ByteBuffer ob = dec.getOutputBuffer(oi);
                    if (ob != null && bi.size > 0) {
                        ob.position(bi.offset); ob.limit(bi.offset + bi.size);
                        java.nio.ShortBuffer sb = ob.slice().order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();
                        int frames = sb.remaining() / Math.max(1, ch);
                        for (int j = 0; j < frames; j++) {
                            int v = Math.abs((int) sb.get(j * ch));
                            long t = bi.presentationTimeUs + (long) j * 1000000L / Math.max(1, rate);
                            int b = (int) (t * n / durUs);
                            if (b >= 0 && b < n && v > pk[b] * 32767f) pk[b] = v / 32767f;
                        }
                    }
                    dec.releaseOutputBuffer(oi, false);
                    if ((bi.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEnd = true;
                }
            }
        } finally {
            try { if (dec != null) { dec.stop(); dec.release(); } } catch (Throwable e) { }
            ex.release();
        }
        fillGaps(pk);
        return pk;
    }
    private static void fillGaps(float[] pk) {
        for (int i = 0; i < pk.length; i++) if (pk[i] == 0) { float l = i > 0 ? pk[i - 1] : 0, r = i + 1 < pk.length ? pk[i + 1] : 0; pk[i] = (l + r) / 2; }
    }

    /** En-tête WAV : {offset données, taille données, fréquence, canaux, bits} */
    private static long[] wavInfo(FileChannel ch) throws Exception {
        ByteBuffer h = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN);
        ch.position(0); ch.read(h); h.flip();
        if (h.getInt(0) != 0x46464952 || h.getInt(8) != 0x45564157) throw new Exception("WAV illisible");
        long pos = 12, rate = 44100, chs = 1, bits = 16;
        ByteBuffer c = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        while (pos + 8 <= ch.size()) {
            c.clear(); ch.position(pos); if (ch.read(c) < 8) break; c.flip();
            int id = c.getInt(0); long len = c.getInt(4) & 0xFFFFFFFFL;
            if (id == 0x20746d66) { // "fmt "
                ByteBuffer fm = ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN); ch.position(pos + 8); ch.read(fm); fm.flip();
                chs = fm.getShort(2); rate = fm.getInt(4); bits = fm.getShort(14);
            } else if (id == 0x61746164) { // "data"
                long avail = ch.size() - pos - 8;
                if (len == 0 || len > avail) len = avail;
                return new long[]{ pos + 8, len, rate, Math.max(1, chs), bits };
            }
            pos += 8 + len + (len & 1);
        }
        throw new Exception("WAV sans données");
    }
    private float[] wavPeaks(Uri u, int n, long[] durOut) throws Exception {
        float[] pk = new float[n];
        try (ParcelFileDescriptor p = a.getContentResolver().openFileDescriptor(u, "r");
             FileInputStream in = new FileInputStream(p.getFileDescriptor())) {
            FileChannel ch = in.getChannel();
            long[] w = wavInfo(ch);
            int fb = (int) (w[3] * w[4] / 8);
            long frames = w[1] / Math.max(1, fb);
            durOut[0] = frames * 1000 / Math.max(1, w[2]);
            ByteBuffer buf = ByteBuffer.allocate(16384 * fb).order(ByteOrder.LITTLE_ENDIAN);
            for (int b = 0; b < n; b++) {
                long f0 = frames * b / n, f1 = frames * (b + 1) / n;
                long cnt = Math.min(f1 - f0, 16384);
                if (cnt <= 0) continue;
                buf.clear(); buf.limit((int) (cnt * fb));
                ch.position(w[0] + f0 * fb); ch.read(buf); buf.flip();
                int max = 0;
                if (w[4] == 16) while (buf.remaining() >= fb) { int v = Math.abs((int) buf.getShort(buf.position())); if (v > max) max = v; buf.position(buf.position() + fb); }
                else if (w[4] == 8) while (buf.remaining() >= fb) { int v = Math.abs(((buf.get(buf.position()) & 0xff) - 128) << 8); if (v > max) max = v; buf.position(buf.position() + fb); }
                pk[b] = Math.min(1f, max / 32767f);
            }
        }
        return pk;
    }

    // ================= Découpe (garder une portion) =================
    /** Garde [startMs, endMs] dans une nouvelle note « … (extrait) ». Événement "trim" {ok, id, name} */
    @JavascriptInterface public void trim(final String id, final double startMs, final double endMs) {
        new Thread(() -> {
            File tmp = null;
            try {
                long k = Long.parseLong(id);
                Uri u = itemUri(k);
                String file = "", mime = "";
                try (Cursor c = a.getContentResolver().query(u, new String[]{ MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.MIME_TYPE }, null, null, null)) {
                    if (c != null && c.moveToFirst()) { file = c.getString(0); mime = c.getString(1) == null ? "" : c.getString(1); }
                }
                String base = file.replaceFirst("\\.[A-Za-z0-9]{2,4}$", "");
                boolean wav = mime.contains("wav");
                long s = (long) Math.max(0, startMs), e = (long) endMs;
                if (e - s < 500) throw new Exception("portion trop courte");
                tmp = new File(a.getCacheDir(), "decoupe." + (wav ? "wav" : "m4a"));
                if (wav) trimWav(u, tmp, s, e); else trimM4a(u, tmp, s * 1000, e * 1000);
                String name = base + " (extrait)";
                long nid = saveCopy(tmp, name, wav ? "wav" : "m4a", wav ? "audio/x-wav" : "audio/mp4");
                if (nid >= 0) {
                    JSONObject m = meta(k), nm = new JSONObject();
                    JSONArray mk = m.optJSONArray("markers"), out = new JSONArray();
                    if (mk != null) for (int i = 0; i < mk.length(); i++) {
                        JSONObject x = mk.getJSONObject(i); long t = x.optLong("t");
                        if (t >= s && t <= e) out.put(new JSONObject().put("t", t - s).put("note", x.optString("note")));
                    }
                    nm.put("markers", out); nm.put("tags", m.optJSONArray("tags") == null ? new JSONArray() : m.optJSONArray("tags"));
                    nm.put("chantier", m.optString("chantier")); nm.put("dur", e - s); nm.put("date", System.currentTimeMillis()); nm.put("q", m.optString("q"));
                    prefs().edit().putString("m_" + nid, nm.toString()).apply();
                }
                emit("trim", o("ok", true, "id", nid, "name", name));
            } catch (Throwable ex) {
                emit("trim", o("ok", false, "msg", String.valueOf(ex.getMessage())));
            } finally { if (tmp != null) tmp.delete(); }
        }, "dicta-trim").start();
    }
    private void trimM4a(Uri u, File out, long sUs, long eUs) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mx = null;
        try {
            ex.setDataSource(a, u, null);
            int tr = -1; MediaFormat f = null;
            for (int i = 0; i < ex.getTrackCount(); i++) { MediaFormat g = ex.getTrackFormat(i); String m = g.getString(MediaFormat.KEY_MIME); if (m != null && m.startsWith("audio/")) { tr = i; f = g; break; } }
            if (tr < 0) throw new Exception("pas de piste audio");
            ex.selectTrack(tr);
            mx = new MediaMuxer(out.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int ot = mx.addTrack(f);
            mx.start();
            int cap = f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) : 0;
            ByteBuffer buf = ByteBuffer.allocate(Math.max(cap, 256 * 1024));
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
            ex.seekTo(sUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            long first = -1; int n = 0;
            while (true) {
                int sz = ex.readSampleData(buf, 0);
                if (sz < 0) break;
                long ts = ex.getSampleTime();
                if (ts > eUs) break;
                if (ts >= sUs - 30000) {
                    if (first < 0) first = ts;
                    bi.set(0, sz, ts - first, (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
                    mx.writeSampleData(ot, buf, bi); n++;
                }
                ex.advance();
            }
            if (n == 0) throw new Exception("portion vide");
        } finally {
            try { if (mx != null) { mx.stop(); mx.release(); } } catch (Throwable e) { }
            ex.release();
        }
    }
    private void trimWav(Uri u, File out, long sMs, long eMs) throws Exception {
        try (ParcelFileDescriptor p = a.getContentResolver().openFileDescriptor(u, "r");
             FileInputStream in = new FileInputStream(p.getFileDescriptor());
             FileOutputStream fo = new FileOutputStream(out)) {
            FileChannel ch = in.getChannel();
            long[] w = wavInfo(ch);
            int fb = (int) (w[3] * w[4] / 8);
            long f0 = sMs * w[2] / 1000, f1 = Math.min(w[1] / fb, eMs * w[2] / 1000);
            long len = Math.max(0, f1 - f0) * fb;
            ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
            h.put(new byte[]{'R', 'I', 'F', 'F'}); h.putInt((int) (len + 36)); h.put(new byte[]{'W', 'A', 'V', 'E', 'f', 'm', 't', ' '});
            h.putInt(16); h.putShort((short) 1); h.putShort((short) w[3]); h.putInt((int) w[2]); h.putInt((int) (w[2] * fb)); h.putShort((short) fb); h.putShort((short) w[4]);
            h.put(new byte[]{'d', 'a', 't', 'a'}); h.putInt((int) len);
            fo.write(h.array());
            ch.transferTo(w[0] + f0 * fb, len, fo.getChannel());
        }
    }
    /** Copie un fichier dans Recordings/Dictaphone (ou Music/Dictaphone) ; retourne l'identifiant MediaStore */
    private long saveCopy(File src, String name, String ext, String mime) throws Exception {
        if (SDK >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name + "." + ext);
            v.put(MediaStore.MediaColumns.TITLE, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, (SDK >= 31 ? Environment.DIRECTORY_RECORDINGS : Environment.DIRECTORY_MUSIC) + "/Dictaphone");
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri u = a.getContentResolver().insert(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (u == null) throw new Exception("MediaStore refuse le fichier");
            try (OutputStream os = a.getContentResolver().openOutputStream(u); InputStream is = new FileInputStream(src)) { copy(is, os); }
            catch (Exception e) { a.getContentResolver().delete(u, null, null); throw e; }
            ContentValues d = new ContentValues(); d.put(MediaStore.MediaColumns.IS_PENDING, 0);
            a.getContentResolver().update(u, d, null, null);
            return ContentUris.parseId(u);
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "Dictaphone");
        dir.mkdirs();
        File f = new File(dir, name + "." + ext);
        for (int k = 1; f.exists(); k++) f = new File(dir, name + " (" + k + ")." + ext);
        try (OutputStream os = new FileOutputStream(f); InputStream is = new FileInputStream(src)) { copy(is, os); }
        final Uri[] res = new Uri[1];
        final Object lock = new Object();
        MediaScannerConnection.scanFile(a, new String[]{ f.getAbsolutePath() }, new String[]{ mime }, (path, uri) -> { synchronized (lock) { res[0] = uri; lock.notifyAll(); } });
        synchronized (lock) { if (res[0] == null) lock.wait(8000); }
        return res[0] == null ? -1 : ContentUris.parseId(res[0]);
    }
    private static void copy(InputStream is, OutputStream os) throws Exception {
        byte[] b = new byte[65536]; int n;
        while ((n = is.read(b)) > 0) os.write(b, 0, n);
    }
    private static byte[] readAll(InputStream is) throws Exception {
        try (InputStream in = is) {
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            copy(in, bo);
            return bo.toByteArray();
        }
    }

    // ================= Dictée en direct (SpeechRecognizer) =================
    private SpeechRecognizer sr;
    private volatile boolean speechOn = false;
    private boolean speechOnDevice = false, speechOffline = true;
    private long lastRms = 0;

    /** Dictée en direct en français. offline : préfère la reconnaissance sur l'appareil. Retour : ok, perm, busy, none */
    @JavascriptInterface public String speechStart(final boolean offline) {
        if (!can(Manifest.permission.RECORD_AUDIO)) { askPerms(); return "perm"; }
        try { if (recState().contains("\"rec\":true")) return "busy"; } catch (Throwable e) { }
        boolean any = false;
        try { any = SpeechRecognizer.isRecognitionAvailable(a) || (SDK >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(a)); } catch (Throwable e) { }
        if (!any) return "none";
        speechOffline = offline;
        ui(() -> { speechOn = true; createRecognizer(offline && SDK >= 31 && onDeviceOk()); listen(); });
        return "ok";
    }
    private boolean onDeviceOk() { try { return SDK >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(a); } catch (Throwable e) { return false; } }
    @JavascriptInterface public void speechStop() {
        ui(() -> {
            speechOn = false;
            if (sr != null) { try { sr.stopListening(); } catch (Throwable e) { } }
            wv.postDelayed(() -> { if (!speechOn) destroyRecognizer(); }, 1500);
            emit("speech", o("state", "stop"));
        });
    }
    private void destroyRecognizer() { if (sr != null) { try { sr.destroy(); } catch (Throwable e) { } sr = null; } }
    private void createRecognizer(boolean onDevice) {
        destroyRecognizer();
        speechOnDevice = onDevice;
        sr = onDevice ? SpeechRecognizer.createOnDeviceSpeechRecognizer(a) : SpeechRecognizer.createSpeechRecognizer(a);
        sr.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle b) { emit("speech", o("state", "listen", "onDevice", speechOnDevice)); }
            public void onBeginningOfSpeech() { }
            public void onRmsChanged(float db) {
                long now = System.currentTimeMillis();
                if (now - lastRms < 70) return;
                lastRms = now;
                emit("slevel", o("l", Math.max(0, Math.min(1, (db + 2) / 12.0))));
            }
            public void onBufferReceived(byte[] b) { }
            public void onEndOfSpeech() { }
            public void onError(int err) {
                if (!speechOn) return;
                // Silence ou rien compris : on relance pour une dictée continue
                if (err == SpeechRecognizer.ERROR_NO_MATCH || err == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) { restart(150); return; }
                if (err == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || err == SpeechRecognizer.ERROR_CLIENT) { if (sr != null) try { sr.cancel(); } catch (Throwable e) { } restart(400); return; }
                // Langue absente sur l'appareil : repli sur le service de reconnaissance standard (hors ligne si le pack français est installé)
                if (speechOnDevice && (err == 12 || err == 13)) { createRecognizer(false); restart(200); return; }
                speechOn = false;
                String m;
                switch (err) {
                    case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: case SpeechRecognizer.ERROR_SERVER:
                        m = "Pas de réseau et le français hors ligne n'est pas installé. Installe-le : Paramètres › Système › Langue › Reconnaissance vocale hors connexion."; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: m = "Autorisation du micro refusée"; break;
                    case SpeechRecognizer.ERROR_AUDIO: m = "Micro occupé par une autre appli"; break;
                    case 12: case 13: m = "Le français n'est pas disponible pour la dictée sur ce téléphone"; break;
                    default: m = "Dictée interrompue (code " + err + ")";
                }
                emit("speech", o("state", "error", "msg", m, "code", err));
                destroyRecognizer();
            }
            public void onResults(Bundle b) {
                ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) emit("speech", o("final", r.get(0)));
                if (speechOn) restart(60);
            }
            public void onPartialResults(Bundle b) {
                ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (r != null && !r.isEmpty()) emit("speech", o("partial", r.get(0)));
            }
            public void onEvent(int t, Bundle b) { }
        });
    }
    private void restart(long delay) { wv.postDelayed(() -> { if (speechOn) listen(); }, delay); }
    private void listen() {
        if (sr == null) return;
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fr-FR");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, speechOffline);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, a.getPackageName());
        try { sr.startListening(i); } catch (Throwable e) { emit("speech", o("state", "error", "msg", "Dictée impossible : " + e.getMessage())); speechOn = false; }
    }

    // ================= Raccourci « Nouvel enregistrement » =================
    @JavascriptInterface public boolean setupShortcut() {
        if (SDK < 25) return false;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null) return false;
            List<ShortcutInfo> l = new ArrayList<>();
            l.add(shortcut());
            sm.setDynamicShortcuts(l);
            return true;
        } catch (Throwable e) { return false; }
    }
    @JavascriptInterface public boolean pinShortcut() {
        if (SDK < 26) return false;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null || !sm.isRequestPinShortcutSupported()) return false;
            return sm.requestPinShortcut(shortcut(), null);
        } catch (Throwable e) { return false; }
    }
    private ShortcutInfo shortcut() {
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.setClassName(a.getPackageName(), a.getClass().getName());
        i.putExtra("socle", "{\"rec\":1}");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        ShortcutInfo.Builder b = new ShortcutInfo.Builder(a, "dicta-rec")
                .setShortLabel("Enregistrer").setLongLabel("Nouvel enregistrement").setIntent(i);
        try { b.setIcon(Icon.createWithResource(a, a.getApplicationInfo().icon)); } catch (Throwable e) { }
        return b.build();
    }

    // ================= Cycle de vie (appelé par MainActivity) =================
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_WRITE) {
            Runnable r = pendingWrite; pendingWrite = null;
            if (resultCode == Activity.RESULT_OK && r != null) new Thread(r).start();
            else emit("renamed", o("ok", false));
        } else if (requestCode == REQ_DELETE) {
            long k = pendingDeleteId; pendingDeleteId = -1;
            boolean ok = resultCode == Activity.RESULT_OK;
            if (ok && k >= 0) {
                if (SDK < 30) { try { a.getContentResolver().delete(itemUri(k), null, null); } catch (Throwable e) { ok = false; } }
                if (ok) prefs().edit().remove("m_" + k).apply();
            }
            emit("removed", o("id", k, "ok", ok));
        }
    }
    public void onPermissions(int requestCode) {
        if (requestCode == REQ_PERM) emit("perm", o("mic", can(Manifest.permission.RECORD_AUDIO)));
    }
    public void onResume() {
        if (svcClass() == null) return;
        ensureSink();
        emit("resume", o("rec", safeJson(recState()), "play", safeJson(playState())));
    }
    public void onIntent(Intent i) { }
    private static Object safeJson(String s) { try { return new JSONObject(s); } catch (Throwable e) { return new JSONObject(); } }
}
