package __PKG__;

// Carnet de voyage (Suite MAG) : lieu (GPS) et date d'origine des photos choisies dans la galerie, et liaison avec l'appli Photo.
// Exposé en JavaScript sous window.MAGVoyage. Les photos de la galerie passent par MAGOffice (OfficeBridge.java : sélecteur
// d'Android, plusieurs à la fois, lecture par morceaux) ; Android retire la position GPS des fichiers transmis aux applis qui
// n'ont pas l'autorisation « Accès à la position des contenus multimédias » (ACCESS_MEDIA_LOCATION, déclarée pour toutes les
// applis par print-patch.sh). Ce pont la demande (une fois, sur action de l'utilisateur) et relit les métadonnées d'origine
// (MediaStore.setRequireOriginal) avec android.media.ExifInterface.
//
// Mode voyage (Photo ↔ Carnet de voyage), entre applis signées de la même clé seulement :
//  - fournisseur VoyageBridge$Carnets (content://fr.magformation13.voyage.carnets, déclaré dans l'appli Carnet de voyage seule,
//    permission « signature » fr.magformation13.permission.WIDGET et signature de l'appelant vérifiée) : liste des carnets en
//    lecture seule (id, titre, dates, couverture), publiée par la page du Carnet (publier) ; une seule écriture possible,
//    call("creer") : un carnet « en attente » (titre, dates) que la page crée à sa prochaine ouverture, avec le même id ;
//  - côté clients (Photo, Majordome) : carnets(), creer() lisent ce fournisseur ; photos(), photoLire(), vignettes(),
//    photoEtat(), photoMode() lisent le fournisseur de Photo (PhotoBridge$Voyage : photos du voyage, voyage.json, mode).
// La classe est copiée dans toutes les applis et ne fait rien tant que la page ne l'appelle pas. Aucun accès réseau
// (sauf le géocodeur d'Android, ville(), qui peut en utiliser un selon le téléphone).
// Événements vers la page : window.voyageEvent(type, json) — « perm », « photo », « vignette », « ville ».

import android.app.Activity;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.location.Address;
import android.location.Geocoder;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class VoyageBridge {
    private static final int REQ_LOC = 6420;
    private static final String P_LOC = "android.permission.ACCESS_MEDIA_LOCATION";
    static final String VOY = "fr.magformation13.voyage", PHOTO = "fr.magformation13.photo";
    static final Uri CARNETS = Uri.parse("content://" + VOY + ".carnets/carnets");
    static final Uri PHOTO_VOY = Uri.parse("content://" + PHOTO + ".voyage");
    private final Activity a;
    private final WebView wv;
    private ExecutorService io;

    public VoyageBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }
    private synchronized ExecutorService io() { if (io == null) io = Executors.newFixedThreadPool(2); return io; }

    @JavascriptInterface public String version() { return "2"; }

    /** « na » (Android 9 et avant : rien n'est retiré), « granted » ou « ask » */
    @JavascriptInterface public String locState() {
        if (Build.VERSION.SDK_INT < 29) return "na";
        return a.checkSelfPermission(P_LOC) == PackageManager.PERMISSION_GRANTED ? "granted" : "ask";
    }

    /** Demande l'autorisation ; réponse : événement « perm » */
    @JavascriptInterface public void askLoc() {
        if (Build.VERSION.SDK_INT < 29 || a.checkSelfPermission(P_LOC) == PackageManager.PERMISSION_GRANTED) { emit("perm", "{\"state\":\"granted\"}"); return; }
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.requestPermissions(new String[]{ P_LOC }, REQ_LOC); }
            catch (Throwable t) { emit("perm", "{\"state\":\"denied\"}"); }
        } });
    }

    /** Appelé par MainActivity.onRequestPermissionsResult (extraCall « onPermissions ») */
    public void onPermissions(int code) {
        if (code != REQ_LOC) return;
        emit("perm", "{\"state\":\"" + ("granted".equals(locState()) ? "granted" : "denied") + "\"}");
    }

    /** Métadonnées d'origine d'une photo choisie : {"lat":…,"lon":…,"date":"2026:07:12 10:14:00"} ou "null" */
    @JavascriptInterface public String exif(String src) {
        if (src == null || !src.startsWith("content://") || Build.VERSION.SDK_INT < 24) return "null";
        Uri u = Uri.parse(src);
        InputStream in = null;
        try {
            Uri orig = u;
            if (Build.VERSION.SDK_INT >= 29 && "granted".equals(locState())) {
                try { Uri m = MediaStore.getMediaUri(a, u); if (m != null) orig = MediaStore.setRequireOriginal(m); } catch (Throwable t) { }
                if (orig == u) { try { orig = MediaStore.setRequireOriginal(u); } catch (Throwable t) { orig = u; } }
            }
            try { in = a.getContentResolver().openInputStream(orig); } catch (Throwable t) { in = null; }
            if (in == null) in = a.getContentResolver().openInputStream(u);
            if (in == null) return "null";
            ExifInterface ex = new ExifInterface(in);
            JSONObject o = new JSONObject();
            float[] ll = new float[2];
            if (ex.getLatLong(ll) && (ll[0] != 0 || ll[1] != 0)) { o.put("lat", (double) ll[0]); o.put("lon", (double) ll[1]); }
            String d = ex.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
            if (d == null) d = ex.getAttribute(ExifInterface.TAG_DATETIME);
            if (d != null) o.put("date", d);
            return o.length() > 0 ? o.toString() : "null";
        } catch (Throwable t) { return "null"; }
        finally { try { if (in != null) in.close(); } catch (Throwable t) { } }
    }

    // ================= Carnets (appli Carnet de voyage) =================
    static boolean isVoyageApp(Context c) { return c.getPackageName().endsWith(".voyage"); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("voyage_pont", Context.MODE_PRIVATE); }
    static JSONArray arr(String s) { try { return new JSONArray(s == null || s.isEmpty() ? "[]" : s); } catch (Throwable t) { return new JSONArray(); } }
    static String norm(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** Liste publiée + carnets demandés par Photo ou Majordome et pas encore créés par la page (attente:true) */
    static JSONArray localList(Context c) {
        SharedPreferences p = prefs(c);
        JSONArray l = arr(p.getString("carnets", "[]")), w = arr(p.getString("attente", "[]")), out = new JSONArray();
        java.util.HashSet<String> ids = new java.util.HashSet<>();
        for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (o != null) { out.put(o); ids.add(o.optString("id")); } }
        for (int i = 0; i < w.length(); i++) { JSONObject o = w.optJSONObject(i); if (o != null && !ids.contains(o.optString("id"))) { try { o.put("attente", true); } catch (Throwable t) { } out.put(o); } }
        return out;
    }
    /** Ajoute un carnet en attente (ou rend celui qui porte déjà ce titre) : {ok, id, titre, existe} */
    static synchronized JSONObject addPending(Context c, String titre, String debut, String fin, String src) {
        JSONObject r = new JSONObject();
        try {
            titre = titre == null ? "" : titre.trim();
            if (titre.isEmpty()) { r.put("ok", false); r.put("err", "titre vide"); return r; }
            if (titre.length() > 60) titre = titre.substring(0, 60).trim();
            JSONArray all = localList(c);
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.getJSONObject(i);
                if (norm(o.optString("titre")).equals(norm(titre))) { r.put("ok", true); r.put("id", o.optString("id")); r.put("titre", o.optString("titre")); r.put("existe", true); return r; }
            }
            JSONObject n = new JSONObject();
            String id = "c" + Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 46656), 36);
            n.put("id", id); n.put("titre", titre); n.put("debut", debut == null ? "" : debut); n.put("fin", fin == null ? "" : fin);
            n.put("source", src == null ? "" : src); n.put("cree", System.currentTimeMillis());
            JSONArray w = arr(prefs(c).getString("attente", "[]")); w.put(n);
            prefs(c).edit().putString("attente", w.toString()).apply();
            r.put("ok", true); r.put("id", id); r.put("titre", titre); r.put("existe", false);
        } catch (Throwable t) { try { r.put("ok", false); r.put("err", String.valueOf(t.getMessage())); } catch (Throwable x) { } }
        return r;
    }

    /** Page du Carnet : publie la liste des carnets [{id, titre, dates, debut, fin, style, couleur, vignette, maj, pages, photos}] */
    @JavascriptInterface public boolean publier(String json) {
        if (!isVoyageApp(a)) return false;
        try {
            JSONArray l = new JSONArray(json);
            java.util.HashSet<String> ids = new java.util.HashSet<>();
            for (int i = 0; i < l.length(); i++) ids.add(l.getJSONObject(i).optString("id"));
            JSONArray w = arr(prefs(a).getString("attente", "[]")), keep = new JSONArray();
            for (int i = 0; i < w.length(); i++) { JSONObject o = w.optJSONObject(i); if (o != null && !ids.contains(o.optString("id"))) keep.put(o); }
            prefs(a).edit().putString("carnets", l.toString()).putString("attente", keep.toString()).putLong("at", System.currentTimeMillis()).apply();
            try { a.getContentResolver().notifyChange(CARNETS, null); } catch (Throwable t) { }
            return true;
        } catch (Throwable t) { return false; }
    }
    /** Page du Carnet : carnets demandés par Photo ou Majordome, à créer (JSON) */
    @JavascriptInterface public String attente() { return isVoyageApp(a) ? prefs(a).getString("attente", "[]") : "[]"; }

    /** Clients (Photo, Majordome) : liste des carnets, ou « null » si l'appli Carnet de voyage manque (ou refuse) */
    @JavascriptInterface public String carnets() { JSONArray l = carnetsList(a); return l == null ? "null" : l.toString(); }
    static JSONArray carnetsList(Context c) {
        if (isVoyageApp(c)) return localList(c);
        try (Cursor k = c.getContentResolver().query(CARNETS, null, null, null, null)) {
            if (k == null) return null;
            JSONArray out = new JSONArray();
            int j = k.getColumnIndex("json");
            while (k.moveToNext()) { try { out.put(new JSONObject(k.getString(j))); } catch (Throwable t) { } }
            return out;
        } catch (Throwable t) { return null; }
    }
    /** Clients : crée (ou retrouve) un carnet {titre, debut, fin} → {ok, id, titre, existe} ou {ok:false, absent:true} */
    @JavascriptInterface public String creer(String json) {
        try { JSONObject o = new JSONObject(json); return creerCarnet(a, o.optString("titre"), o.optString("debut"), o.optString("fin"), o.optString("source", a.getPackageName())).toString(); }
        catch (Throwable t) { return "{\"ok\":false}"; }
    }
    static JSONObject creerCarnet(Context c, String titre, String debut, String fin, String src) {
        if (isVoyageApp(c)) return addPending(c, titre, debut, fin, src);
        try {
            Bundle x = new Bundle(); x.putString("titre", titre); x.putString("debut", debut); x.putString("fin", fin); x.putString("source", src);
            Bundle b = c.getContentResolver().call(CARNETS, "creer", null, x);
            if (b != null && b.getString("json") != null) return new JSONObject(b.getString("json"));
        } catch (Throwable t) { }
        try { JSONObject r = new JSONObject(); r.put("ok", false); r.put("absent", true); return r; } catch (Throwable t) { return new JSONObject(); }
    }

    /** Fournisseur de l'appli Carnet de voyage (déclaré dans son manifeste seulement) */
    public static class Carnets extends ContentProvider {
        @Override public boolean onCreate() { return true; }
        private void check() {
            int uid = android.os.Binder.getCallingUid();
            if (uid == android.os.Process.myUid()) return;
            if (getContext().getPackageManager().checkSignatures(uid, android.os.Process.myUid()) != PackageManager.SIGNATURE_MATCH) throw new SecurityException("réservé aux applis MAG");
        }
        @Override public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
            check();
            MatrixCursor m = new MatrixCursor(new String[]{ "id", "titre", "json" });
            JSONArray l = localList(getContext());
            for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (o != null) m.addRow(new Object[]{ o.optString("id"), o.optString("titre"), o.toString() }); }
            return m;
        }
        @Override public Bundle call(String method, String arg, Bundle extras) {
            check();
            Bundle b = new Bundle();
            if ("creer".equals(method) && extras != null) {
                JSONObject r = addPending(getContext(), extras.getString("titre"), extras.getString("debut"), extras.getString("fin"), extras.getString("source"));
                b.putString("json", r.toString());
                try { getContext().getContentResolver().notifyChange(CARNETS, null); } catch (Throwable t) { }
            } else if ("liste".equals(method)) b.putString("json", localList(getContext()).toString());
            return b;
        }
        @Override public String getType(Uri uri) { return "application/json"; }
        @Override public Uri insert(Uri uri, ContentValues v) { throw new SecurityException("lecture seule"); }
        @Override public int delete(Uri uri, String s, String[] a) { throw new SecurityException("lecture seule"); }
        @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new SecurityException("lecture seule"); }
    }

    // ================= Photos du voyage (fournisseur de l'appli Photo) =================
    /** État du mode voyage dans Photo : {mode, voyage:{id,titre,dir,…}} ou « null » si Photo manque */
    @JavascriptInterface public String photoEtat() { return photoCall("etat", null); }
    /** Change le mode de Photo : {mode:"voyage"|"normal", carnet:{id,titre,debut,fin}} → état, ou « null » */
    @JavascriptInterface public String photoMode(String json) { return photoCall("mode", json); }
    private String photoCall(String m, String arg) {
        try { Bundle b = a.getContentResolver().call(PHOTO_VOY, m, arg, null); if (b != null && b.getString("json") != null) return b.getString("json"); } catch (Throwable t) { }
        return "null";
    }
    /** Photos du voyage rangées par Photo (DCIM/Photo/Voyage/<titre>) pour un carnet : [{id, nom, chemin, dossier, date, lat, lng, lieu, ville, pays, legende, carnet, titre, w, h}] ou « null » */
    @JavascriptInterface public String photos(String carnet, String titre) {
        Uri u = PHOTO_VOY.buildUpon().appendPath("photos").appendQueryParameter("carnet", carnet == null ? "" : carnet).appendQueryParameter("titre", titre == null ? "" : titre).build();
        try (Cursor k = a.getContentResolver().query(u, null, null, null, null)) {
            if (k == null) return "null";
            JSONArray out = new JSONArray(); int j = k.getColumnIndex("json");
            while (k.moveToNext()) { try { out.put(new JSONObject(k.getString(j))); } catch (Throwable t) { } }
            return out.toString();
        } catch (Throwable t) { return "null"; }
    }
    /** Lit une photo du voyage (orientation appliquée, côté le plus long ≤ max, JPEG) : événement « photo » {req, id, ok, data, w, h} */
    @JavascriptInterface public void photoLire(final String req, final String id, final int max) {
        io().execute(new Runnable() { public void run() {
            JSONObject r = new JSONObject();
            File tmp = new File(a.getCacheDir(), "voy-" + System.nanoTime() + ".jpg");
            try {
                r.put("req", req); r.put("id", id);
                try (InputStream in = a.getContentResolver().openInputStream(PHOTO_VOY.buildUpon().appendPath("photo").appendPath(id).build()); FileOutputStream o = new FileOutputStream(tmp)) {
                    if (in == null) throw new Exception("photo absente");
                    byte[] b = new byte[1 << 16]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n);
                }
                int mx = Math.max(400, Math.min(max <= 0 ? 2048 : max, 4096));
                BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(tmp.getAbsolutePath(), o);
                int s = 1; while (Math.max(o.outWidth, o.outHeight) / (s * 2) >= mx) s *= 2;
                BitmapFactory.Options d = new BitmapFactory.Options(); d.inSampleSize = s;
                Bitmap bm = BitmapFactory.decodeFile(tmp.getAbsolutePath(), d);
                if (bm == null) throw new Exception("image illisible");
                int ori = new ExifInterface(tmp.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                int deg = ori == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : ori == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : ori == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
                float sc = Math.min(1f, (float) mx / Math.max(bm.getWidth(), bm.getHeight()));
                if (deg != 0 || sc < 1f) { Matrix m = new Matrix(); m.postScale(sc, sc); m.postRotate(deg); Bitmap x = Bitmap.createBitmap(bm, 0, 0, bm.getWidth(), bm.getHeight(), m, true); if (x != bm) bm.recycle(); bm = x; }
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                bm.compress(Bitmap.CompressFormat.JPEG, 88, bo);
                r.put("w", bm.getWidth()); r.put("h", bm.getHeight()); bm.recycle();
                r.put("data", "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                r.put("ok", true);
            } catch (OutOfMemoryError e) { try { r.put("ok", false); r.put("err", "mémoire insuffisante"); } catch (Throwable x) { } }
            catch (Throwable t) { try { r.put("ok", false); r.put("err", String.valueOf(t.getMessage())); } catch (Throwable x) { } }
            finally { tmp.delete(); }
            emit("photo", r.toString());
        } });
    }
    /** Vignettes carrées (Photo les fabrique) : un événement « vignette » {req, id, data} par photo */
    @JavascriptInterface public void vignettes(final String req, final String csv) {
        if (csv == null) return;
        for (final String id : csv.split(",")) {
            if (id.trim().isEmpty()) continue;
            io().execute(new Runnable() { public void run() {
                JSONObject r = new JSONObject();
                try {
                    r.put("req", req); r.put("id", id.trim());
                    Bundle b = a.getContentResolver().call(PHOTO_VOY, "vignette", id.trim(), null);
                    r.put("data", b == null ? "" : b.getString("data", ""));
                } catch (Throwable t) { try { r.put("data", ""); } catch (Throwable x) { } }
                emit("vignette", r.toString());
            } });
        }
    }
    /** Ville d'une position par le géocodeur d'Android : événement « ville » {req, ville, pays} (vide si inconnu) */
    @JavascriptInterface public void ville(final String req, final double lat, final double lon) {
        io().execute(new Runnable() { @SuppressWarnings("deprecation") public void run() {
            JSONObject r = new JSONObject();
            try {
                r.put("req", req);
                if (Geocoder.isPresent()) {
                    List<Address> l = new Geocoder(a, Locale.FRANCE).getFromLocation(lat, lon, 1);
                    if (l != null && !l.isEmpty()) { r.put("ville", villeDe(l.get(0))); r.put("pays", l.get(0).getCountryName() == null ? "" : l.get(0).getCountryName()); }
                }
            } catch (Throwable t) { }
            emit("ville", r.toString());
        } });
    }
    static String villeDe(Address x) {
        String v = x.getLocality();
        if (v == null || v.isEmpty()) v = x.getSubAdminArea();
        if (v == null || v.isEmpty()) v = x.getAdminArea();
        return v == null ? "" : v;
    }

    private void emit(final String type, final String json) {
        final String js = "window.voyageEvent&&voyageEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json) + ")";
        wv.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }
}
