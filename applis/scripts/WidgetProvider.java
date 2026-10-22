package __PKG__;

// Canal privé entre les applis MAG et Socle (tuiles de l'écran d'accueil).
// Chaque appli publie un petit résumé (JSON) avec MAGPrint.widgetPut(json) ; Socle le lit ici.
// Accès réservé aux applis signées avec la même clé (permission « signature » fr.magformation13.permission.WIDGET).

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONObject;

public class WidgetProvider extends ContentProvider {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("socle_widget", Context.MODE_PRIVATE); }

    static void put(Context c, String json) {
        try { new JSONObject(json); } catch (Exception e) { return; }
        prefs(c).edit().putString("data", json).putLong("at", System.currentTimeMillis()).apply();
        try { c.getContentResolver().notifyChange(Uri.parse("content://" + c.getPackageName() + ".widget/data"), null); } catch (Exception e) { }
    }

    // Sauvegarde : chaque appli MAG peut déposer une copie complète de ses données (JSON), lue par l'appli Sauvegarde
    static void putBackup(Context c, String json) {
        prefs(c).edit().putString("backup", json).putLong("backupAt", System.currentTimeMillis()).apply();
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        Context c = getContext();
        MatrixCursor m = new MatrixCursor(new String[]{ "json" });
        if ("backup".equals(uri.getLastPathSegment())) {
            String b = prefs(c).getString("backup", "");
            m.addRow(new Object[]{ b.isEmpty() ? "" : "{\"at\":" + prefs(c).getLong("backupAt", 0) + ",\"data\":" + b + "}" });
            return m;
        }
        try {
            JSONObject o;
            try { o = new JSONObject(prefs(c).getString("data", "{}")); } catch (Exception e) { o = new JSONObject(); }
            o.put("at", prefs(c).getLong("at", 0));
            // Toile : état du fond d'écran, tenu par la partie native
            SharedPreferences t = c.getSharedPreferences("toile", Context.MODE_PRIVATE);
            if (t.contains("folder") || t.contains("msg")) {
                JSONObject w = new JSONObject();
                w.put("msg", t.getString("msg", "")); w.put("at", t.getLong("at", 0));
                w.put("thumb", t.getString("thumb", "")); w.put("name", t.getString("thumbName", ""));
                w.put("folder", t.getString("folder", null) != null);
                o.put("toile", w);
            }
            m.addRow(new Object[]{ o.toString() });
        } catch (Exception e) { m.addRow(new Object[]{ "{}" }); }
        return m;
    }

    // Actions sans ouvrir l'appli (ex. Toile : fond suivant / précédent)
    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        Bundle b = new Bundle();
        Context c = getContext();
        try {
            if ("wp_next".equals(method)) { WallpaperJob.runSoon(c, WallpaperJob.JOB_NOW); b.putBoolean("ok", true); }
            else if ("wp_prev".equals(method)) { WallpaperJob.runSoon(c, WallpaperJob.JOB_PREV); b.putBoolean("ok", true); }
            // Mélodie : le lecteur tourne-t-il vraiment ? (après un arrêt d'Android, la tuile garderait un état périmé)
            else if ("music_alive".equals(method)) {
                Class<?> k = Class.forName(c.getPackageName() + ".MusicService");
                b.putBoolean("ok", k.getDeclaredField("alive").getBoolean(null));
            }
            else b.putBoolean("ok", false);
        } catch (Throwable t) { b.putBoolean("ok", false); b.putString("err", String.valueOf(t.getMessage())); }
        return b;
    }

    @Override public String getType(Uri uri) { return "application/json"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
