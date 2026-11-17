package __PKG__;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Mélodie : supprimer des morceaux, les partager, en faire une sonnerie (appel, notification, alarme, contact),
 * ou découper un passage de 30 secondes pour la sonnerie.
 * Exposé à la page sous window.MAGMelodie ; résultats asynchrones par window.melodieEvent(json).
 *  - suppression : Android 11+ demande de confirmation du système (MediaStore.createDeleteRequest) ;
 *    Android 10 : confirmation par fichier (RecoverableSecurityException) ; avant : suppression directe.
 *  - sonnerie : autorisation « Modifier les paramètres système » (Settings.System.canWrite), demandée une fois.
 *  - sonnerie d'un contact : sélection du contact, autorisation « Contacts » (écriture), champ CUSTOM_RINGTONE.
 */
public class MelodieBridge {
    static final int RQ_DEL = 7301, RQ_CONTACT = 7302, RQ_PERM_CONTACT = 7303;
    final Activity a; final WebView wv;
    String pendingRing = null;          // « id|kind » en attente de l'autorisation des paramètres système
    String pendingContact = null;       // id du morceau pour la sonnerie d'un contact
    List<Uri> delQueue = new ArrayList<>(); int delDone = 0;

    public MelodieBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    void emit(final JSONObject o) {
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript("window.melodieEvent&&melodieEvent(" + JSONObject.quote(o.toString()) + ")", null); } catch (Throwable t) { } } });
    }
    static Uri uriOf(long id) { return ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id); }
    static List<Uri> uris(String idsJson) {
        List<Uri> l = new ArrayList<>();
        try { JSONArray x = new JSONArray(idsJson); for (int i = 0; i < x.length(); i++) l.add(uriOf(Long.parseLong(x.getString(i)))); } catch (Throwable t) { }
        return l;
    }

    // ================= Suppression =================
    @JavascriptInterface public void delete(final String idsJson) {
        final List<Uri> l = uris(idsJson);
        if (l.isEmpty()) return;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    android.app.PendingIntent pi = MediaStore.createDeleteRequest(a.getContentResolver(), l);
                    a.startIntentSenderForResult(pi.getIntentSender(), RQ_DEL, null, 0, 0, 0);
                    return;
                }
                delQueue = new ArrayList<>(l); delDone = 0; delNext();
            } catch (Throwable t) { emit(ev("deleted").put2("ok", false).put2("err", String.valueOf(t.getMessage()))); }
        } });
    }
    /** Android 10 et avant : un fichier à la fois ; Android 10 demande la confirmation de chaque fichier */
    void delNext() {
        while (!delQueue.isEmpty()) {
            Uri u = delQueue.get(0);
            try { if (a.getContentResolver().delete(u, null, null) > 0) delDone++; delQueue.remove(0); }
            catch (SecurityException se) {
                if (Build.VERSION.SDK_INT >= 29 && se instanceof android.app.RecoverableSecurityException) {
                    try { a.startIntentSenderForResult(((android.app.RecoverableSecurityException) se).getUserAction().getActionIntent().getIntentSender(), RQ_DEL, null, 0, 0, 0); return; }
                    catch (Throwable t) { delQueue.remove(0); }
                } else delQueue.remove(0);
            } catch (Throwable t) { delQueue.remove(0); }
        }
        emit(ev("deleted").put2("ok", delDone > 0).put2("n", delDone));
    }

    // ================= Partage =================
    @JavascriptInterface public void share(String idsJson) {
        final List<Uri> l = uris(idsJson);
        if (l.isEmpty()) return;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                Intent i;
                if (l.size() == 1) i = new Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, l.get(0));
                else i = new Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, new ArrayList<Uri>(l));
                i.setType("audio/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(Intent.createChooser(i, "Envoyer"));
            } catch (Throwable t) { }
        } });
    }

    // ================= Sonneries =================
    static int typeOf(String kind) { return "notification".equals(kind) ? RingtoneManager.TYPE_NOTIFICATION : "alarm".equals(kind) ? RingtoneManager.TYPE_ALARM : RingtoneManager.TYPE_RINGTONE; }
    /** id du morceau (MediaStore) ou uri complète (passage découpé) ; kind : ringtone, notification, alarm → "ok", "perm" (autorisation demandée) ou "err" */
    @JavascriptInterface public String setRingtone(String id, String kind) {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.System.canWrite(a)) {
            pendingRing = id + "|" + kind;
            a.runOnUiThread(new Runnable() { public void run() {
                try { a.startActivity(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable t) { }
            } });
            return "perm";
        }
        try {
            Uri u = id.startsWith("content:") ? Uri.parse(id) : uriOf(Long.parseLong(id));
            RingtoneManager.setActualDefaultRingtoneUri(a, typeOf(kind), u);
            return "ok";
        } catch (Throwable t) { return "err"; }
    }
    /** Sonneries actuelles : ids des morceaux de Mélodie s'ils sont utilisés */
    @JavascriptInterface public String ringState() {
        JSONObject o = new JSONObject();
        try {
            for (String k : new String[]{ "ringtone", "notification", "alarm" }) {
                Uri u = RingtoneManager.getActualDefaultRingtoneUri(a, typeOf(k));
                o.put(k, u == null ? "" : u.toString());
            }
            o.put("canWrite", Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(a));
        } catch (Throwable t) { }
        return o.toString();
    }
    public void onResume() {
        if (pendingRing != null && (Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(a))) {
            String[] p = pendingRing.split("\\|"); pendingRing = null;
            String r = setRingtone(p[0], p[1]);
            emit(ev("ring").put2("r", r).put2("kind", p[1]).put2("id", p[0]));
        } else if (pendingRing != null) { pendingRing = null; emit(ev("ring").put2("r", "refus")); }
    }

    // ---- sonnerie d'un contact ----
    @JavascriptInterface public void contactRingtone(String id) {
        pendingContact = id;
        if (Build.VERSION.SDK_INT >= 23 && a.checkSelfPermission("android.permission.WRITE_CONTACTS") != PackageManager.PERMISSION_GRANTED) {
            a.requestPermissions(new String[]{ "android.permission.WRITE_CONTACTS", "android.permission.READ_CONTACTS" }, RQ_PERM_CONTACT);
            return;
        }
        pickContact();
    }
    void pickContact() {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivityForResult(new Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI), RQ_CONTACT); } catch (Throwable t) { emit(ev("contact").put2("ok", false)); }
        } });
    }
    public void onPermissions(int code) {
        if (code != RQ_PERM_CONTACT || pendingContact == null) return;
        if (Build.VERSION.SDK_INT < 23 || a.checkSelfPermission("android.permission.WRITE_CONTACTS") == PackageManager.PERMISSION_GRANTED) pickContact();
        else { pendingContact = null; emit(ev("contact").put2("ok", false).put2("err", "perm")); }
    }
    public void onResult(int code, int res, Intent data) {
        if (code == RQ_DEL) {
            if (Build.VERSION.SDK_INT >= 30) { emit(ev("deleted").put2("ok", res == Activity.RESULT_OK)); return; }
            if (res != Activity.RESULT_OK && !delQueue.isEmpty()) delQueue.remove(0);
            delNext();
            return;
        }
        if (code == RQ_CONTACT) {
            String id = pendingContact; pendingContact = null;
            if (res != Activity.RESULT_OK || data == null || data.getData() == null || id == null) { emit(ev("contact").put2("ok", false)); return; }
            try {
                Uri cu = data.getData(); String name = "";
                try (Cursor c = a.getContentResolver().query(cu, new String[]{ ContactsContract.Contacts.DISPLAY_NAME }, null, null, null)) { if (c != null && c.moveToFirst()) name = c.getString(0); }
                Uri ru = id.startsWith("content:") ? Uri.parse(id) : uriOf(Long.parseLong(id));
                ContentValues v = new ContentValues(); v.put(ContactsContract.Contacts.CUSTOM_RINGTONE, ru.toString());
                int n = a.getContentResolver().update(cu, v, null, null);
                emit(ev("contact").put2("ok", n > 0).put2("name", name));
            } catch (Throwable t) { emit(ev("contact").put2("ok", false).put2("err", String.valueOf(t.getMessage()))); }
        }
    }

    // ================= Passage pour la sonnerie (sans réencodage) =================
    /** Découpe [startMs, startMs + lenMs] du morceau dans Sonneries/ (ou Notifications/, Alarms/) ; résultat : événement « cut » {ok, uri, name} */
    @JavascriptInterface public void cut(final String id, final int startMs, final int lenMs, final String title, final String kind) {
        new Thread(new Runnable() { public void run() {
            try {
                Uri src = uriOf(Long.parseLong(id));
                String mime = a.getContentResolver().getType(src); if (mime == null) mime = "";
                String base = (title == null || title.trim().isEmpty() ? "Sonnerie" : title.trim()).replaceAll("[\\\\/:*?\"<>|]", "_");
                if (base.length() > 60) base = base.substring(0, 60);
                File tmp = new File(a.getCacheDir(), "decoupe.tmp"); tmp.delete();
                String ext;
                if (mime.contains("mpeg") || mime.contains("mp3")) { ext = "mp3"; cutMp3(src, startMs, lenMs, tmp); }
                else { ext = "m4a"; cutMp4(src, startMs, lenMs, tmp); }
                String folder = "notification".equals(kind) ? "Notifications" : "alarm".equals(kind) ? "Alarms" : "Ringtones";
                ContentValues v = new ContentValues();
                v.put(MediaStore.Audio.Media.DISPLAY_NAME, base + " (sonnerie)." + ext);
                v.put(MediaStore.Audio.Media.TITLE, base + " (sonnerie)");
                v.put(MediaStore.Audio.Media.MIME_TYPE, "mp3".equals(ext) ? "audio/mpeg" : "audio/mp4");
                v.put(MediaStore.Audio.Media.IS_RINGTONE, "ringtone".equals(kind) ? 1 : 0);
                v.put(MediaStore.Audio.Media.IS_NOTIFICATION, "notification".equals(kind) ? 1 : 0);
                v.put(MediaStore.Audio.Media.IS_ALARM, "alarm".equals(kind) ? 1 : 0);
                v.put(MediaStore.Audio.Media.IS_MUSIC, 0);
                Uri dst;
                if (Build.VERSION.SDK_INT >= 29) {
                    v.put(MediaStore.Audio.Media.RELATIVE_PATH, folder + "/");
                    v.put(MediaStore.Audio.Media.IS_PENDING, 1);
                    dst = a.getContentResolver().insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, v);
                } else {
                    File dir = new File(android.os.Environment.getExternalStoragePublicDirectory(folder), ""); dir.mkdirs();
                    File f = new File(dir, base + " (sonnerie)." + ext);
                    v.put(MediaStore.Audio.Media.DATA, f.getAbsolutePath());
                    dst = a.getContentResolver().insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, v);
                }
                if (dst == null) throw new Exception("enregistrement refusé");
                try (InputStream in = new FileInputStream(tmp); OutputStream out = a.getContentResolver().openOutputStream(dst)) {
                    byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n);
                }
                if (Build.VERSION.SDK_INT >= 29) { ContentValues d = new ContentValues(); d.put(MediaStore.Audio.Media.IS_PENDING, 0); a.getContentResolver().update(dst, d, null, null); }
                tmp.delete();
                emit(ev("cut").put2("ok", true).put2("uri", dst.toString()).put2("name", base + " (sonnerie)").put2("kind", kind));
            } catch (Throwable t) { emit(ev("cut").put2("ok", false).put2("err", String.valueOf(t.getMessage()))); }
        } }).start();
    }
    /** MP3 : trames indépendantes ; on copie les octets du passage, en partant d'un début de trame (synchro 0xFFE) */
    void cutMp3(Uri src, int startMs, int lenMs, File out) throws Exception {
        long size; long durMs = 0;
        try (android.content.res.AssetFileDescriptor fd = a.getContentResolver().openAssetFileDescriptor(src, "r")) { size = fd.getLength(); }
        try (Cursor c = a.getContentResolver().query(src, new String[]{ MediaStore.Audio.Media.DURATION }, null, null, null)) { if (c != null && c.moveToFirst()) durMs = c.getLong(0); }
        if (size <= 0 || durMs <= 0) throw new Exception("durée inconnue");
        byte[] all;
        try (InputStream in = a.getContentResolver().openInputStream(src)) { all = readAll(in, (int) Math.min(size, 60L * 1024 * 1024)); }
        int audioStart = 0;
        if (all.length > 10 && all[0] == 'I' && all[1] == 'D' && all[2] == '3') audioStart = 10 + ((all[6] & 0x7f) << 21 | (all[7] & 0x7f) << 14 | (all[8] & 0x7f) << 7 | (all[9] & 0x7f));
        long audioLen = all.length - audioStart;
        int from = audioStart + (int) (audioLen * Math.max(0, startMs) / durMs), to = (int) Math.min(all.length, from + audioLen * Math.max(5000, lenMs) / durMs);
        while (from < to - 4 && !((all[from] & 0xff) == 0xff && (all[from + 1] & 0xe0) == 0xe0 && (all[from + 2] & 0xf0) != 0xf0)) from++;
        try (OutputStream o = new java.io.FileOutputStream(out)) { o.write(all, from, Math.max(0, to - from)); }
    }
    /** AAC / M4A : remuxage des échantillons du passage (MediaExtractor → MediaMuxer), sans réencodage */
    void cutMp4(Uri src, int startMs, int lenMs, File out) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        ex.setDataSource(a, src, null);
        int track = -1;
        for (int i = 0; i < ex.getTrackCount(); i++) { String m = ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME); if (m != null && m.startsWith("audio/")) { track = i; break; } }
        if (track < 0) throw new Exception("pas de piste audio");
        ex.selectTrack(track);
        MediaFormat f = ex.getTrackFormat(track);
        MediaMuxer mx = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        int ti = mx.addTrack(f); mx.start();
        long s = startMs * 1000L, e = s + Math.max(5000, lenMs) * 1000L;
        ex.seekTo(s, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
        ByteBuffer buf = ByteBuffer.allocate(f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) : 1 << 20);
        android.media.MediaCodec.BufferInfo bi = new android.media.MediaCodec.BufferInfo();
        long t0 = -1;
        while (true) {
            int n = ex.readSampleData(buf, 0); if (n < 0) break;
            long t = ex.getSampleTime(); if (t > e) break;
            if (t0 < 0) t0 = t;
            bi.offset = 0; bi.size = n; bi.presentationTimeUs = t - t0; bi.flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? android.media.MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
            mx.writeSampleData(ti, buf, bi);
            ex.advance();
        }
        mx.stop(); mx.release(); ex.release();
    }
    static byte[] readAll(InputStream in, int max) throws Exception {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] x = new byte[65536]; int n, tot = 0;
        while ((n = in.read(x)) > 0 && tot < max) { b.write(x, 0, n); tot += n; }
        return b.toByteArray();
    }

    // petit assistant JSON chaînable
    static final class J extends JSONObject { J put2(String k, Object v) { try { put(k, v); } catch (Throwable t) { } return this; } }
    static J ev(String op) { return new J().put2("op", op); }
}
