package __PKG__;

import android.Manifest;
import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AuthenticatorDescription;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentProviderOperation;
import android.content.ContentProviderResult;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SyncAdapterType;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.ContactsContract.AggregationExceptions;
import android.provider.ContactsContract.CommonDataKinds.Email;
import android.provider.ContactsContract.CommonDataKinds.Event;
import android.provider.ContactsContract.CommonDataKinds.Note;
import android.provider.ContactsContract.CommonDataKinds.Organization;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.Photo;
import android.provider.ContactsContract.CommonDataKinds.StructuredName;
import android.provider.ContactsContract.CommonDataKinds.StructuredPostal;
import android.provider.ContactsContract.CommonDataKinds.Website;
import android.provider.ContactsContract.Contacts;
import android.provider.ContactsContract.Data;
import android.provider.ContactsContract.RawContacts;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;

/**
 * Contacts : pont entre la page www-contacts et le carnet d'adresses d'Android (ContactsContract).
 * Exposé en JS sous window.MAGContacts. Aucun effet de bord au chargement.
 * Événements asynchrones : window.contactsEvent(type, texte).
 */
public class ContactsBridge {
    private static final int REQ_PERM = 5301, REQ_PHOTO = 5310, REQ_FILE = 5311;
    private final Activity a;
    private final WebView wv;
    private Intent handled;

    public ContactsBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Outils ----------
    private ContentResolver cr() { return a.getContentResolver(); }
    private boolean can(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void toast(final String t) { ui(() -> Toast.makeText(a, t, Toast.LENGTH_SHORT).show()); }
    private void emit(String kind, String data) {
        final String js = "window.contactsEvent&&contactsEvent(" + JSONObject.quote(kind) + "," + JSONObject.quote(data == null ? "" : data) + ")";
        ui(() -> { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } });
    }
    private static String err(Throwable t) {
        try { return new JSONObject().put("ok", false).put("err", t.getMessage() == null ? t.toString() : t.getMessage()).toString(); } catch (Exception e) { return "{\"ok\":false}"; }
    }
    private static String s(Cursor c, int i) { String v = c.isNull(i) ? null : c.getString(i); return v == null ? "" : v; }
    private static String str(String v) { return v == null ? "" : v; }

    // ---------- Autorisations ----------
    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public boolean perm() { return can(Manifest.permission.READ_CONTACTS) && can(Manifest.permission.WRITE_CONTACTS); }
    @JavascriptInterface public void ask() {
        ui(() -> a.requestPermissions(new String[]{ Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS }, REQ_PERM));
    }
    @JavascriptInterface public boolean blocked() { return !perm() && !a.shouldShowRequestPermissionRationale(Manifest.permission.READ_CONTACTS); }

    // ---------- Comptes de destination ----------
    /** Comptes où l'on peut enregistrer un contact : Google et autres comptes synchronisés + « Téléphone » (compte local, name/type vides) */
    @JavascriptInterface public String accounts() {
        JSONArray r = new JSONArray();
        LinkedHashMap<String, String[]> m = new LinkedHashMap<>();
        HashMap<String, String> labels = new HashMap<>();
        try {
            AccountManager am = AccountManager.get(a);
            for (AuthenticatorDescription d : am.getAuthenticatorTypes()) {
                try { labels.put(d.type, a.getPackageManager().getResourcesForApplication(d.packageName).getString(d.labelId)); } catch (Exception e) { }
            }
            HashSet<String> writable = new HashSet<>();
            for (SyncAdapterType t : ContentResolver.getSyncAdapterTypes()) {
                if (ContactsContract.AUTHORITY.equals(t.authority) && t.supportsUploading()) writable.add(t.accountType);
            }
            for (Account ac : am.getAccounts()) if (writable.contains(ac.type)) m.put(ac.name + "\n" + ac.type, new String[]{ ac.name, ac.type });
        } catch (Exception e) { }
        // Comptes déjà présents dans le carnet (visibles même sans accès à AccountManager)
        if (perm()) {
            try (Cursor c = cr().query(RawContacts.CONTENT_URI, new String[]{ RawContacts.ACCOUNT_NAME, RawContacts.ACCOUNT_TYPE }, RawContacts.DELETED + "=0", null, null)) {
                while (c != null && c.moveToNext()) {
                    String n = s(c, 0), t = s(c, 1);
                    if (t.equals("com.google") && !n.isEmpty()) m.put(n + "\n" + t, new String[]{ n, t });
                }
            } catch (Exception e) { }
        }
        try {
            for (String[] x : m.values()) {
                JSONObject o = new JSONObject().put("name", x[0]).put("type", x[1]);
                o.put("label", x[1].equals("com.google") ? "Google" : labels.containsKey(x[1]) ? labels.get(x[1]) : x[1]);
                r.put(o);
            }
            r.put(new JSONObject().put("name", "").put("type", "").put("label", "Téléphone"));
        } catch (Exception e) { }
        return r.toString();
    }

    // ---------- Liste ----------
    /**
     * Tous les contacts visibles, en un seul passage : [{id, k (lookup), n, alt, st (favori), ph (a une photo), g, f, tel:[], mail:[], org}]
     */
    @JavascriptInterface public String list() {
        JSONArray r = new JSONArray();
        if (!perm()) return "[]";
        HashMap<Long, JSONObject> by = new HashMap<>();
        try {
            String[] p = { Contacts._ID, Contacts.LOOKUP_KEY, Contacts.DISPLAY_NAME_PRIMARY, Contacts.DISPLAY_NAME_ALTERNATIVE, Contacts.STARRED, Contacts.PHOTO_THUMBNAIL_URI };
            try (Cursor c = cr().query(Contacts.CONTENT_URI, p, null, null, Contacts.SORT_KEY_PRIMARY + " ASC")) {
                while (c != null && c.moveToNext()) {
                    JSONObject o = new JSONObject();
                    long id = c.getLong(0);
                    o.put("id", id); o.put("k", s(c, 1)); o.put("n", s(c, 2)); o.put("alt", s(c, 3));
                    o.put("st", c.getInt(4) == 1); o.put("ph", !c.isNull(5));
                    o.put("tel", new JSONArray()); o.put("mail", new JSONArray()); o.put("org", ""); o.put("g", ""); o.put("f", "");
                    by.put(id, o); r.put(o);
                }
            }
            String sel = Data.MIMETYPE + " IN (?,?,?,?)";
            String[] args = { Phone.CONTENT_ITEM_TYPE, Email.CONTENT_ITEM_TYPE, Organization.CONTENT_ITEM_TYPE, StructuredName.CONTENT_ITEM_TYPE };
            try (Cursor c = cr().query(Data.CONTENT_URI, new String[]{ Data.CONTACT_ID, Data.MIMETYPE, Data.DATA1, Data.DATA2, Data.DATA3 }, sel, args, null)) {
                while (c != null && c.moveToNext()) {
                    JSONObject o = by.get(c.getLong(0));
                    if (o == null) continue;
                    String mt = s(c, 1), v = s(c, 2);
                    if (mt.equals(Phone.CONTENT_ITEM_TYPE)) { if (!v.isEmpty()) o.getJSONArray("tel").put(v); }
                    else if (mt.equals(Email.CONTENT_ITEM_TYPE)) { if (!v.isEmpty()) o.getJSONArray("mail").put(v); }
                    else if (mt.equals(Organization.CONTENT_ITEM_TYPE)) { if (o.optString("org").isEmpty()) o.put("org", v); }
                    else { if (o.optString("g").isEmpty() && o.optString("f").isEmpty()) { o.put("g", s(c, 3)); o.put("f", s(c, 4)); } }
                }
            }
        } catch (Exception e) { }
        return r.toString();
    }

    /** Photo d'un contact en data: URL (vignette ou grande), "" s'il n'y en a pas */
    @JavascriptInterface public String photo(double idd, boolean big) {
        long id = (long) idd;
        try (InputStream in = Contacts.openContactPhotoInputStream(cr(), ContentUris.withAppendedId(Contacts.CONTENT_URI, id), big)) {
            if (in == null) return "";
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            byte[] b = bo.toByteArray();
            String mime = b.length > 3 && (b[0] & 0xFF) == 0x89 ? "image/png" : "image/jpeg";
            return "data:" + mime + ";base64," + Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }

    // ---------- Fiche ----------
    private static final String[] DATA_COLS = { Data.RAW_CONTACT_ID, Data.MIMETYPE, Data.DATA1, Data.DATA2, Data.DATA3, Data.DATA4, Data.DATA5, Data.DATA6,
        Data.DATA7, Data.DATA8, Data.DATA9, Data.DATA10, Data._ID, Data.IS_SUPER_PRIMARY };

    private void putData(JSONObject o, Cursor c) throws Exception {
        String mt = s(c, 1);
        switch (mt) {
            case StructuredName.CONTENT_ITEM_TYPE:
                if (!o.has("name")) o.put("name", new JSONObject().put("full", s(c, 2)).put("g", s(c, 3)).put("f", s(c, 4)).put("pre", s(c, 5)).put("mid", s(c, 6)).put("suf", s(c, 7)));
                break;
            case Phone.CONTENT_ITEM_TYPE:
                o.getJSONArray("tel").put(new JSONObject().put("v", s(c, 2)).put("t", c.isNull(3) ? 2 : c.getInt(3)).put("l", s(c, 4)).put("p", c.getInt(13) == 1));
                break;
            case Email.CONTENT_ITEM_TYPE:
                o.getJSONArray("mail").put(new JSONObject().put("v", s(c, 2)).put("t", c.isNull(3) ? 1 : c.getInt(3)).put("l", s(c, 4)));
                break;
            case StructuredPostal.CONTENT_ITEM_TYPE:
                o.getJSONArray("adr").put(new JSONObject().put("v", s(c, 2)).put("t", c.isNull(3) ? 1 : c.getInt(3)).put("l", s(c, 4))
                    .put("street", s(c, 5)).put("city", s(c, 8)).put("zip", s(c, 10)).put("country", s(c, 11)));
                break;
            case Organization.CONTENT_ITEM_TYPE:
                if (!o.has("org")) o.put("org", new JSONObject().put("co", s(c, 2)).put("job", s(c, 5)).put("dep", s(c, 6)));
                break;
            case Event.CONTENT_ITEM_TYPE:
                o.getJSONArray("ev").put(new JSONObject().put("v", s(c, 2)).put("t", c.isNull(3) ? 3 : c.getInt(3)).put("l", s(c, 4)));
                break;
            case Note.CONTENT_ITEM_TYPE:
                if (!s(c, 2).isEmpty()) o.put("note", o.optString("note").isEmpty() ? s(c, 2) : o.optString("note") + "\n" + s(c, 2));
                break;
            case Website.CONTENT_ITEM_TYPE:
                o.getJSONArray("web").put(s(c, 2));
                break;
            default:
                if (mt.contains("whatsapp") && mt.contains("profile")) o.put("wa", true);
                else if (mt.contains("whatsapp") && mt.contains("voip")) o.put("wa", true);
        }
    }
    private JSONObject emptyCard() throws Exception {
        return new JSONObject().put("tel", new JSONArray()).put("mail", new JSONArray()).put("adr", new JSONArray()).put("ev", new JSONArray()).put("web", new JSONArray()).put("note", "");
    }

    /**
     * Fiche complète : données regroupées de tous les comptes (pour l'affichage) et, dans « edit », celles du seul contact brut modifiable
     * (Google ou téléphone) avec son identifiant « raw » et son compte.
     */
    @JavascriptInterface public String contact(double idd) {
        long id = (long) idd;
        try {
            if (!perm()) return "null";
            JSONObject o = emptyCard();
            try (Cursor c = cr().query(ContentUris.withAppendedId(Contacts.CONTENT_URI, id), new String[]{ Contacts.LOOKUP_KEY, Contacts.DISPLAY_NAME_PRIMARY, Contacts.STARRED, Contacts.PHOTO_URI, Contacts.CUSTOM_RINGTONE }, null, null, null)) {
                if (c == null || !c.moveToFirst()) return "null";
                o.put("id", id); o.put("k", s(c, 0)); o.put("n", s(c, 1)); o.put("st", c.getInt(2) == 1); o.put("ph", !c.isNull(3));
            }
            // Contacts bruts et comptes
            JSONArray raws = new JSONArray();
            long editRaw = -1; int editScore = -1; String editAcc = "", editType = "";
            try (Cursor c = cr().query(RawContacts.CONTENT_URI, new String[]{ RawContacts._ID, RawContacts.ACCOUNT_NAME, RawContacts.ACCOUNT_TYPE }, RawContacts.CONTACT_ID + "=? AND " + RawContacts.DELETED + "=0", new String[]{ String.valueOf(id) }, null)) {
                while (c != null && c.moveToNext()) {
                    String n = s(c, 1), t = s(c, 2);
                    raws.put(new JSONObject().put("raw", c.getLong(0)).put("name", n).put("type", t));
                    int score = t.equals("com.google") ? 3 : t.isEmpty() || t.contains("local") || t.contains("phone") || t.contains("sim") ? 2 : t.contains("whatsapp") || t.contains("telegram") || t.contains("signal") ? 0 : 1;
                    if (score > editScore) { editScore = score; editRaw = c.getLong(0); editAcc = n; editType = t; }
                }
            }
            o.put("raws", raws);
            JSONObject ed = emptyCard();
            ed.put("raw", editRaw).put("acc", editAcc).put("type", editType);
            HashSet<String> seenTel = new HashSet<>(), seenMail = new HashSet<>();
            try (Cursor c = cr().query(Data.CONTENT_URI, DATA_COLS, Data.CONTACT_ID + "=?", new String[]{ String.valueOf(id) }, Data.IS_SUPER_PRIMARY + " DESC, " + Data._ID + " ASC")) {
                while (c != null && c.moveToNext()) {
                    String mt = s(c, 1);
                    if (c.getLong(0) == editRaw) putData(ed, c);
                    // Pas de doublons à l'affichage (même numéro dans Google et WhatsApp, par exemple)
                    if (mt.equals(Phone.CONTENT_ITEM_TYPE) && !seenTel.add(s(c, 2).replaceAll("[^0-9+]", "").replaceFirst("^\\+33", "0"))) continue;
                    if (mt.equals(Email.CONTENT_ITEM_TYPE) && !seenMail.add(s(c, 2).toLowerCase())) continue;
                    if (mt.equals(Website.CONTENT_ITEM_TYPE) && o.getJSONArray("web").toString().contains(JSONObject.quote(s(c, 2)))) continue;
                    putData(o, c);
                }
            }
            o.put("edit", ed);
            return o.toString();
        } catch (Throwable t) { return "null"; }
    }

    // ---------- Écriture ----------
    private static final String[] MANAGED = { StructuredName.CONTENT_ITEM_TYPE, Phone.CONTENT_ITEM_TYPE, Email.CONTENT_ITEM_TYPE, StructuredPostal.CONTENT_ITEM_TYPE,
        Organization.CONTENT_ITEM_TYPE, Event.CONTENT_ITEM_TYPE, Note.CONTENT_ITEM_TYPE, Website.CONTENT_ITEM_TYPE };

    private ContentProviderOperation.Builder ins(long raw, int backRef) {
        ContentProviderOperation.Builder b = ContentProviderOperation.newInsert(Data.CONTENT_URI);
        if (raw > 0) b.withValue(Data.RAW_CONTACT_ID, raw); else b.withValueBackReference(Data.RAW_CONTACT_ID, backRef);
        return b;
    }
    private void addRows(ArrayList<ContentProviderOperation> ops, long raw, int ref, JSONObject o) throws Exception {
        String g = o.optString("g").trim(), f = o.optString("f").trim(), mid = o.optString("mid").trim(), pre = o.optString("pre").trim(), suf = o.optString("suf").trim();
        if (!(g + f + mid + pre + suf).isEmpty()) {
            ops.add(ins(raw, ref).withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
                .withValue(StructuredName.GIVEN_NAME, g).withValue(StructuredName.FAMILY_NAME, f)
                .withValue(StructuredName.MIDDLE_NAME, mid.isEmpty() ? null : mid).withValue(StructuredName.PREFIX, pre.isEmpty() ? null : pre)
                .withValue(StructuredName.SUFFIX, suf.isEmpty() ? null : suf).build());
        }
        JSONArray t = o.optJSONArray("tel");
        for (int i = 0; t != null && i < t.length(); i++) {
            JSONObject x = t.getJSONObject(i); String v = x.optString("v").trim(); if (v.isEmpty()) continue;
            int ty = x.optInt("t", Phone.TYPE_MOBILE);
            ContentProviderOperation.Builder b = ins(raw, ref).withValue(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE).withValue(Phone.NUMBER, v).withValue(Phone.TYPE, ty);
            if (ty == Phone.TYPE_CUSTOM) b.withValue(Phone.LABEL, x.optString("l"));
            if (x.optBoolean("p")) b.withValue(Data.IS_PRIMARY, 1).withValue(Data.IS_SUPER_PRIMARY, 1);
            ops.add(b.build());
        }
        JSONArray m = o.optJSONArray("mail");
        for (int i = 0; m != null && i < m.length(); i++) {
            JSONObject x = m.getJSONObject(i); String v = x.optString("v").trim(); if (v.isEmpty()) continue;
            int ty = x.optInt("t", Email.TYPE_HOME);
            ContentProviderOperation.Builder b = ins(raw, ref).withValue(Data.MIMETYPE, Email.CONTENT_ITEM_TYPE).withValue(Email.ADDRESS, v).withValue(Email.TYPE, ty);
            if (ty == Email.TYPE_CUSTOM) b.withValue(Email.LABEL, x.optString("l"));
            ops.add(b.build());
        }
        JSONArray ad = o.optJSONArray("adr");
        for (int i = 0; ad != null && i < ad.length(); i++) {
            JSONObject x = ad.getJSONObject(i);
            String street = x.optString("street").trim(), city = x.optString("city").trim(), zip = x.optString("zip").trim(), country = x.optString("country").trim(), v = x.optString("v").trim();
            if ((street + city + zip + country + v).isEmpty()) continue;
            ContentProviderOperation.Builder b = ins(raw, ref).withValue(Data.MIMETYPE, StructuredPostal.CONTENT_ITEM_TYPE).withValue(StructuredPostal.TYPE, x.optInt("t", StructuredPostal.TYPE_HOME));
            if ((street + city + zip + country).isEmpty()) b.withValue(StructuredPostal.FORMATTED_ADDRESS, v);
            else b.withValue(StructuredPostal.STREET, street).withValue(StructuredPostal.CITY, city).withValue(StructuredPostal.POSTCODE, zip).withValue(StructuredPostal.COUNTRY, country);
            ops.add(b.build());
        }
        String co = o.optString("co").trim(), job = o.optString("job").trim();
        if (!(co + job).isEmpty()) ops.add(ins(raw, ref).withValue(Data.MIMETYPE, Organization.CONTENT_ITEM_TYPE).withValue(Organization.COMPANY, co).withValue(Organization.TITLE, job).withValue(Organization.TYPE, Organization.TYPE_WORK).build());
        JSONArray ev = o.optJSONArray("ev");
        for (int i = 0; ev != null && i < ev.length(); i++) {
            JSONObject x = ev.getJSONObject(i); String v = x.optString("v").trim(); if (v.isEmpty()) continue;
            ops.add(ins(raw, ref).withValue(Data.MIMETYPE, Event.CONTENT_ITEM_TYPE).withValue(Event.START_DATE, v).withValue(Event.TYPE, x.optInt("t", Event.TYPE_BIRTHDAY)).build());
        }
        String note = o.optString("note").trim();
        if (!note.isEmpty()) ops.add(ins(raw, ref).withValue(Data.MIMETYPE, Note.CONTENT_ITEM_TYPE).withValue(Note.NOTE, note).build());
        JSONArray w = o.optJSONArray("web");
        for (int i = 0; w != null && i < w.length(); i++) {
            String v = w.optString(i).trim(); if (v.isEmpty()) continue;
            ops.add(ins(raw, ref).withValue(Data.MIMETYPE, Website.CONTENT_ITEM_TYPE).withValue(Website.URL, v).withValue(Website.TYPE, Website.TYPE_HOMEPAGE).build());
        }
        String photo = o.optString("photo");
        if (photo.equals("-")) { if (raw > 0) ops.add(ContentProviderOperation.newDelete(Data.CONTENT_URI).withSelection(Data.RAW_CONTACT_ID + "=? AND " + Data.MIMETYPE + "=?", new String[]{ String.valueOf(raw), Photo.CONTENT_ITEM_TYPE }).build()); }
        else if (photo.startsWith("data:")) {
            byte[] b = Base64.decode(photo.substring(photo.indexOf(',') + 1), Base64.DEFAULT);
            if (raw > 0) ops.add(ContentProviderOperation.newDelete(Data.CONTENT_URI).withSelection(Data.RAW_CONTACT_ID + "=? AND " + Data.MIMETYPE + "=?", new String[]{ String.valueOf(raw), Photo.CONTENT_ITEM_TYPE }).build());
            ops.add(ins(raw, ref).withValue(Data.MIMETYPE, Photo.CONTENT_ITEM_TYPE).withValue(Data.IS_SUPER_PRIMARY, 1).withValue(Photo.PHOTO, b).build());
        }
    }

    /**
     * Crée ou modifie. JSON : {raw (contact brut à modifier, 0 = nouveau), acc, type (compte pour un nouveau contact), g, f, mid, pre, suf,
     * tel:[{v,t,l,p}], mail:[{v,t,l}], adr:[{street,city,zip,country,t} ou {v}], co, job, ev:[{v:"1980-05-12" ou "--05-12", t}], note, web:[], photo ("data:…" | "-" pour retirer | "" inchangée), st}
     * Renvoie {ok, id (contact)}.
     */
    @JavascriptInterface public String save(String json) {
        try {
            if (!perm()) return err(new Exception("Autorisation manquante"));
            JSONObject o = new JSONObject(json);
            long raw = o.optLong("raw", 0);
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            if (raw > 0) {
                StringBuilder q = new StringBuilder(Data.RAW_CONTACT_ID + "=? AND " + Data.MIMETYPE + " IN (");
                for (int i = 0; i < MANAGED.length; i++) q.append(i == 0 ? "?" : ",?");
                q.append(")");
                String[] args = new String[MANAGED.length + 1];
                args[0] = String.valueOf(raw);
                System.arraycopy(MANAGED, 0, args, 1, MANAGED.length);
                ops.add(ContentProviderOperation.newDelete(Data.CONTENT_URI).withSelection(q.toString(), args).build());
                addRows(ops, raw, 0, o);
            } else {
                String acc = o.optString("acc"), type = o.optString("type");
                ops.add(ContentProviderOperation.newInsert(RawContacts.CONTENT_URI)
                    .withValue(RawContacts.ACCOUNT_NAME, acc.isEmpty() ? null : acc)
                    .withValue(RawContacts.ACCOUNT_TYPE, type.isEmpty() ? null : type)
                    .withValue(RawContacts.STARRED, o.optBoolean("st") ? 1 : 0).build());
                addRows(ops, 0, 0, o);
            }
            ContentProviderResult[] res = cr().applyBatch(ContactsContract.AUTHORITY, ops);
            long rawId = raw > 0 ? raw : ContentUris.parseId(res[0].uri);
            long cid = 0;
            try (Cursor c = cr().query(ContentUris.withAppendedId(RawContacts.CONTENT_URI, rawId), new String[]{ RawContacts.CONTACT_ID }, null, null, null)) {
                if (c != null && c.moveToFirst()) cid = c.getLong(0);
            }
            if (raw > 0 && o.has("st") && cid > 0) star(cid, o.optBoolean("st"));
            return new JSONObject().put("ok", true).put("id", cid).put("raw", rawId).toString();
        } catch (Throwable t) { return err(t); }
    }

    /** Enregistre plusieurs contacts (import .vcf) dans le compte donné. Renvoie le nombre créé. */
    @JavascriptInterface public String saveMany(String json, String acc, String type) {
        int ok = 0, ko = 0;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                o.put("raw", 0); o.put("acc", acc == null ? "" : acc); o.put("type", type == null ? "" : type);
                if (new JSONObject(save(o.toString())).optBoolean("ok")) ok++; else ko++;
            }
        } catch (Throwable t) { }
        return "{\"ok\":" + ok + ",\"ko\":" + ko + "}";
    }

    @JavascriptInterface public boolean star(double idd, boolean on) {
        try {
            android.content.ContentValues v = new android.content.ContentValues();
            v.put(Contacts.STARRED, on ? 1 : 0);
            return cr().update(ContentUris.withAppendedId(Contacts.CONTENT_URI, (long) idd), v, null, null) > 0;
        } catch (Exception e) { return false; }
    }

    @JavascriptInterface public String remove(String ids) {
        try {
            int n = 0;
            for (String x : ids.split(",")) {
                try { n += cr().delete(ContentUris.withAppendedId(Contacts.CONTENT_URI, Long.parseLong(x.trim())), null, null); } catch (Exception e) { }
            }
            return "{\"ok\":true,\"n\":" + n + "}";
        } catch (Throwable t) { return err(t); }
    }

    /** Fusionne des contacts (identifiants « 1,2,3 ») : leurs contacts bruts sont gardés ensemble, comme « Associer » dans Google Contacts */
    @JavascriptInterface public String merge(String ids) { return mergeKeep(ids, 0); }

    /** Fusionne et garde le nom (et la photo, s'il y en a une) de la fiche keepId */
    @JavascriptInterface public String mergeKeep(String ids, double keepIdD) {
        long keepId = (long) keepIdD;
        try {
            ArrayList<Long> keepRaws = new ArrayList<>();
            if (keepId > 0) {
                try (Cursor c = cr().query(RawContacts.CONTENT_URI, new String[]{ RawContacts._ID }, RawContacts.CONTACT_ID + "=? AND " + RawContacts.DELETED + "=0", new String[]{ String.valueOf(keepId) }, null)) {
                    while (c != null && c.moveToNext()) keepRaws.add(c.getLong(0));
                }
            }
            String r = mergeRaw(ids);
            if (!r.contains("\"ok\":true") || keepRaws.isEmpty()) return r;
            JSONObject res = new JSONObject(r);
            long cid = res.optLong("id");
            String keepIn = android.text.TextUtils.join(",", keepRaws);
            for (String mime : new String[]{ StructuredName.CONTENT_ITEM_TYPE, Photo.CONTENT_ITEM_TYPE }) {
                boolean keepHas = false;
                try (Cursor c = cr().query(Data.CONTENT_URI, new String[]{ Data._ID }, Data.RAW_CONTACT_ID + " IN (" + keepIn + ") AND " + Data.MIMETYPE + "=?", new String[]{ mime }, null)) {
                    keepHas = c != null && c.getCount() > 0;
                }
                if (!keepHas) continue;
                ContentValues off = new ContentValues(); off.put(Data.IS_SUPER_PRIMARY, 0);
                cr().update(Data.CONTENT_URI, off, Data.CONTACT_ID + "=? AND " + Data.MIMETYPE + "=?", new String[]{ String.valueOf(cid), mime });
                ContentValues on = new ContentValues(); on.put(Data.IS_PRIMARY, 1); on.put(Data.IS_SUPER_PRIMARY, 1);
                long first = -1;
                try (Cursor c = cr().query(Data.CONTENT_URI, new String[]{ Data._ID }, Data.RAW_CONTACT_ID + " IN (" + keepIn + ") AND " + Data.MIMETYPE + "=?", new String[]{ mime }, Data._ID + " ASC")) {
                    if (c != null && c.moveToFirst()) first = c.getLong(0);
                }
                if (first > 0) cr().update(ContentUris.withAppendedId(Data.CONTENT_URI, first), on, null, null);
            }
            try (Cursor c = cr().query(ContentUris.withAppendedId(RawContacts.CONTENT_URI, keepRaws.get(0)), new String[]{ RawContacts.CONTACT_ID }, null, null, null)) {
                if (c != null && c.moveToFirst()) cid = c.getLong(0);
            }
            return new JSONObject().put("ok", true).put("id", cid).toString();
        } catch (Throwable t) { return err(t); }
    }

    /** Noms des différentes fiches réunies dans un contact : [{raw, n, on}] */
    @JavascriptInterface public String names(double idD) {
        long id = (long) idD;
        JSONArray a = new JSONArray();
        try (Cursor c = cr().query(Data.CONTENT_URI, new String[]{ Data.RAW_CONTACT_ID, StructuredName.DISPLAY_NAME, Data.IS_SUPER_PRIMARY },
                Data.CONTACT_ID + "=? AND " + Data.MIMETYPE + "=?", new String[]{ String.valueOf(id), StructuredName.CONTENT_ITEM_TYPE }, Data._ID + " ASC")) {
            java.util.HashSet<String> seen = new java.util.HashSet<>();
            while (c != null && c.moveToNext()) {
                String n = c.getString(1);
                if (n == null || n.trim().isEmpty() || !seen.add(n.trim().toLowerCase())) continue;
                a.put(new JSONObject().put("raw", c.getLong(0)).put("n", n.trim()).put("on", c.getInt(2) == 1));
            }
        } catch (Throwable t) { }
        return a.toString();
    }

    /** Choisit le nom affiché d'un contact fusionné (celui de la fiche brute raw) */
    @JavascriptInterface public String setName(double idD, double rawD) {
        long id = (long) idD, raw = (long) rawD;
        try {
            ContentValues off = new ContentValues(); off.put(Data.IS_SUPER_PRIMARY, 0);
            cr().update(Data.CONTENT_URI, off, Data.CONTACT_ID + "=? AND " + Data.MIMETYPE + "=?", new String[]{ String.valueOf(id), StructuredName.CONTENT_ITEM_TYPE });
            ContentValues on = new ContentValues(); on.put(Data.IS_PRIMARY, 1); on.put(Data.IS_SUPER_PRIMARY, 1);
            cr().update(Data.CONTENT_URI, on, Data.RAW_CONTACT_ID + "=? AND " + Data.MIMETYPE + "=?", new String[]{ String.valueOf(raw), StructuredName.CONTENT_ITEM_TYPE });
            return "{\"ok\":true}";
        } catch (Throwable t) { return err(t); }
    }

    private String mergeRaw(String ids) {
        try {
            ArrayList<Long> raws = new ArrayList<>();
            for (String x : ids.split(",")) {
                try (Cursor c = cr().query(RawContacts.CONTENT_URI, new String[]{ RawContacts._ID }, RawContacts.CONTACT_ID + "=? AND " + RawContacts.DELETED + "=0", new String[]{ String.valueOf(Long.parseLong(x.trim())) }, null)) {
                    while (c != null && c.moveToNext()) raws.add(c.getLong(0));
                }
            }
            if (raws.size() < 2) return err(new Exception("Rien à fusionner"));
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            for (int i = 1; i < raws.size(); i++) {
                ops.add(ContentProviderOperation.newUpdate(AggregationExceptions.CONTENT_URI)
                    .withValue(AggregationExceptions.TYPE, AggregationExceptions.TYPE_KEEP_TOGETHER)
                    .withValue(AggregationExceptions.RAW_CONTACT_ID1, raws.get(0))
                    .withValue(AggregationExceptions.RAW_CONTACT_ID2, raws.get(i)).build());
            }
            cr().applyBatch(ContactsContract.AUTHORITY, ops);
            long cid = 0;
            try (Cursor c = cr().query(ContentUris.withAppendedId(RawContacts.CONTENT_URI, raws.get(0)), new String[]{ RawContacts.CONTACT_ID }, null, null, null)) {
                if (c != null && c.moveToFirst()) cid = c.getLong(0);
            }
            return new JSONObject().put("ok", true).put("id", cid).toString();
        } catch (Throwable t) { return err(t); }
    }

    // ---------- vCard ----------
    /** Texte vCard produit par Android pour les clés de recherche (lookup) données « k1:k2:k3 » ; vide = tout le carnet */
    @JavascriptInterface public String vcard(String keys) {
        try {
            String k = keys == null ? "" : keys.trim();
            if (k.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                try (Cursor c = cr().query(Contacts.CONTENT_URI, new String[]{ Contacts.LOOKUP_KEY }, null, null, null)) {
                    while (c != null && c.moveToNext()) { if (sb.length() > 0) sb.append(':'); sb.append(s(c, 0)); }
                }
                k = sb.toString();
                if (k.isEmpty()) return "";
            }
            Uri u = k.contains(":") ? Uri.withAppendedPath(Contacts.CONTENT_MULTI_VCARD_URI, Uri.encode(k)) : Uri.withAppendedPath(Contacts.CONTENT_VCARD_URI, k);
            try (InputStream in = cr().openAssetFileDescriptor(u, "r").createInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return new String(bo.toByteArray(), "UTF-8");
            }
        } catch (Throwable t) { return ""; }
    }

    // ---------- Applis externes ----------
    @JavascriptInterface public boolean hasWhatsApp() {
        for (String p : new String[]{ "com.whatsapp", "com.whatsapp.w4b" }) {
            try { a.getPackageManager().getPackageInfo(p, 0); return true; } catch (Exception e) { }
        }
        return false;
    }
    /** kind : tel, sms, wa (WhatsApp), mail, geo, url, share (texte), settings */
    @JavascriptInterface public void open(final String kind, final String arg) {
        ui(() -> {
            try {
                String x = arg == null ? "" : arg;
                Intent i;
                switch (kind) {
                    case "tel": i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(x))); break;
                    case "sms": i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(x))); break;
                    case "wa": {
                        String n = x.replaceAll("[^0-9+]", "");
                        if (n.startsWith("00")) n = n.substring(2);
                        else if (n.startsWith("+")) n = n.substring(1);
                        else if (n.startsWith("0")) n = "33" + n.substring(1);
                        i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=" + n));
                        if (hasWhatsApp()) {
                            try { a.getPackageManager().getPackageInfo("com.whatsapp", 0); i.setPackage("com.whatsapp"); } catch (Exception e) { i.setPackage("com.whatsapp.w4b"); }
                        }
                        break;
                    }
                    case "mail": i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + x)); break;
                    case "geo": i = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(x))); break;
                    case "url": i = new Intent(Intent.ACTION_VIEW, Uri.parse(x.matches("(?i)^[a-z]+:.*") ? x : "https://" + x)); break;
                    case "share": i = Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, x), "Partager"); break;
                    case "settings": i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName())); break;
                    default: return;
                }
                a.startActivity(i);
            } catch (ActivityNotFoundException e) { toast("Aucune application pour ouvrir ceci"); }
            catch (Exception e) { toast("Ouverture impossible"); }
        });
    }

    /** Photo depuis la galerie, réduite à 720 px : réponse contactsEvent("photo", "data:image/jpeg;base64,…") */
    @JavascriptInterface public void pickPhoto() {
        ui(() -> {
            try { a.startActivityForResult(Intent.createChooser(new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE), "Photo du contact"), REQ_PHOTO); }
            catch (Exception e) { toast("Galerie indisponible"); }
        });
    }
    /** Fichier .vcf à importer : réponse contactsEvent("file", texte) */
    @JavascriptInterface public void pickFile() {
        ui(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "text/x-vcard", "text/vcard", "text/directory", "text/plain", "application/octet-stream" });
                a.startActivityForResult(Intent.createChooser(i, "Fichier de contacts (.vcf)"), REQ_FILE);
            } catch (Exception e) { toast("Sélecteur de fichiers indisponible"); }
        });
    }

    private byte[] readBytes(Uri u, int max) throws Exception {
        try (InputStream in = cr().openInputStream(u)) {
            if (in == null) throw new Exception("Fichier illisible");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > max) throw new Exception("Fichier trop gros"); }
            return bo.toByteArray();
        }
    }
    private String scaled(Uri u) throws Exception {
        byte[] b = readBytes(u, 40 * 1024 * 1024);
        BitmapFactory.Options op = new BitmapFactory.Options();
        op.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(b, 0, b.length, op);
        int side = Math.max(op.outWidth, op.outHeight), sample = 1;
        while (side / (sample * 2) >= 720) sample *= 2;
        op = new BitmapFactory.Options(); op.inSampleSize = sample;
        Bitmap bm = BitmapFactory.decodeByteArray(b, 0, b.length, op);
        if (bm == null) throw new Exception("Image illisible");
        int rot = 0;
        try (InputStream in = cr().openInputStream(u)) {
            if (in != null) {
                int o = new android.media.ExifInterface(in).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
                rot = o == 6 ? 90 : o == 3 ? 180 : o == 8 ? 270 : 0;
            }
        } catch (Throwable e) { }
        // Recadrage carré centré, 720 px maximum
        int w = bm.getWidth(), h = bm.getHeight(), sq = Math.min(w, h);
        float sc = Math.min(1f, 720f / sq);
        Matrix m = new Matrix(); m.postScale(sc, sc); if (rot != 0) m.postRotate(rot);
        Bitmap out = Bitmap.createBitmap(bm, (w - sq) / 2, (h - sq) / 2, sq, sq, m, true);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 86, bo);
        return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    // ---------- Intents reçus ----------
    private long contactIdFrom(Uri d) {
        try {
            if (d == null || !ContactsContract.AUTHORITY.equals(d.getAuthority())) return 0;
            String p = d.getPath() == null ? "" : d.getPath();
            if (p.startsWith("/raw_contacts/")) {
                Uri l = RawContacts.getContactLookupUri(cr(), d);
                if (l != null) d = l; else return 0;
            }
            if (p.startsWith("/data/")) {
                try (Cursor c = cr().query(d, new String[]{ Data.CONTACT_ID }, null, null, null)) { if (c != null && c.moveToFirst()) return c.getLong(0); }
                return 0;
            }
            Uri lu = Contacts.lookupContact(cr(), d);
            if (lu != null) return ContentUris.parseId(lu);
            try { return ContentUris.parseId(d); } catch (Exception e) { return 0; }
        } catch (Exception e) { return 0; }
    }
    private String parse(Intent i) {
        try {
            if (i == null || i.getAction() == null) return "";
            String act = i.getAction();
            Uri d = i.getData();
            String type = i.getType();
            if (type == null && d != null && "content".equals(d.getScheme())) { try { type = cr().getType(d); } catch (Exception e) { } }
            JSONObject o = new JSONObject();
            boolean isContact = (type != null && (type.contains("contact") || type.contains("person"))) || (d != null && ContactsContract.AUTHORITY.equals(d.getAuthority()));
            boolean isVcf = (type != null && (type.contains("vcard") || type.contains("directory"))) || (d != null && d.getLastPathSegment() != null && d.getLastPathSegment().toLowerCase().endsWith(".vcf"));
            if (Intent.ACTION_VIEW.equals(act) && isVcf && d != null) {
                o.put("k", "vcf"); o.put("text", new String(readBytes(d, 15 * 1024 * 1024), "UTF-8"));
                return o.toString();
            }
            if (!isContact && !Intent.ACTION_INSERT_OR_EDIT.equals(act)) return "";
            if ((Intent.ACTION_VIEW.equals(act) || Intent.ACTION_EDIT.equals(act)) && d != null) {
                long id = contactIdFrom(d);
                if (id > 0) {
                    o.put("k", Intent.ACTION_EDIT.equals(act) ? "edit" : "view"); o.put("id", id);
                    o.put("extra", extras(i));
                    return o.toString();
                }
            }
            if (Intent.ACTION_INSERT.equals(act) || Intent.ACTION_INSERT_OR_EDIT.equals(act) || Intent.ACTION_EDIT.equals(act)) {
                o.put("k", Intent.ACTION_INSERT.equals(act) ? "insert" : "insertOrEdit");
                o.put("extra", extras(i));
                return o.toString();
            }
        } catch (Throwable t) { }
        return "";
    }
    private JSONObject extras(Intent i) throws Exception {
        JSONObject x = new JSONObject();
        x.put("name", str(i.getStringExtra(ContactsContract.Intents.Insert.NAME)));
        x.put("co", str(i.getStringExtra(ContactsContract.Intents.Insert.COMPANY)));
        x.put("job", str(i.getStringExtra(ContactsContract.Intents.Insert.JOB_TITLE)));
        x.put("note", str(i.getStringExtra(ContactsContract.Intents.Insert.NOTES)));
        x.put("adr", str(i.getStringExtra(ContactsContract.Intents.Insert.POSTAL)));
        JSONArray tel = new JSONArray();
        for (String k : new String[]{ ContactsContract.Intents.Insert.PHONE, ContactsContract.Intents.Insert.SECONDARY_PHONE, ContactsContract.Intents.Insert.TERTIARY_PHONE }) {
            String v = i.getStringExtra(k); if (v != null && !v.trim().isEmpty()) tel.put(v.trim());
        }
        x.put("tel", tel);
        JSONArray mail = new JSONArray();
        for (String k : new String[]{ ContactsContract.Intents.Insert.EMAIL, ContactsContract.Intents.Insert.SECONDARY_EMAIL, ContactsContract.Intents.Insert.TERTIARY_EMAIL }) {
            String v = i.getStringExtra(k); if (v != null && !v.trim().isEmpty()) mail.put(v.trim());
        }
        x.put("mail", mail);
        // Données structurées (ArrayList<ContentValues>) envoyées par certaines applis
        try {
            ArrayList<android.content.ContentValues> data = i.getParcelableArrayListExtra(ContactsContract.Intents.Insert.DATA);
            if (data != null) for (android.content.ContentValues v : data) {
                String mt = v.getAsString(Data.MIMETYPE);
                if (Phone.CONTENT_ITEM_TYPE.equals(mt) && v.getAsString(Phone.NUMBER) != null) tel.put(v.getAsString(Phone.NUMBER));
                else if (Email.CONTENT_ITEM_TYPE.equals(mt) && v.getAsString(Email.ADDRESS) != null) mail.put(v.getAsString(Email.ADDRESS));
                else if (Website.CONTENT_ITEM_TYPE.equals(mt) && v.getAsString(Website.URL) != null) x.put("web", v.getAsString(Website.URL));
            }
        } catch (Throwable t) { }
        return x;
    }

    /** Intent qui a ouvert l'appli (une seule fois) : JSON {k: view|edit|insert|insertOrEdit|vcf, …} ou "" */
    @JavascriptInterface public String pending() {
        Intent i = a.getIntent();
        if (i == null || i == handled) return "";
        String r = parse(i);
        handled = i;
        return r;
    }
    /** À appeler quand la page a fini de traiter un intent INSERT / EDIT venu d'une autre appli : on lui rend la main */
    @JavascriptInterface public void done(final boolean saved, final double contactId) {
        ui(() -> {
            Intent i = handled != null ? handled : a.getIntent();
            if (i == null || i.getAction() == null) return;
            String act = i.getAction();
            if (Intent.ACTION_INSERT.equals(act) || Intent.ACTION_INSERT_OR_EDIT.equals(act) || Intent.ACTION_EDIT.equals(act)) {
                Intent r = new Intent();
                if (saved && contactId > 0) r.setData(ContentUris.withAppendedId(Contacts.CONTENT_URI, (long) contactId));
                a.setResult(saved ? Activity.RESULT_OK : Activity.RESULT_CANCELED, r);
                if (a.getCallingActivity() != null || i.getBooleanExtra("finishActivityOnSaveCompleted", false)) a.finish();
            }
        });
    }

    // ---------- Rappels de MainActivity ----------
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_PHOTO && requestCode != REQ_FILE) return;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) return;
        final Uri u = data.getData();
        final boolean photo = requestCode == REQ_PHOTO;
        new Thread(() -> {
            try {
                if (photo) emit("photo", scaled(u));
                else emit("file", new String(readBytes(u, 15 * 1024 * 1024), "UTF-8"));
            } catch (Throwable e) { toast(photo ? "Image illisible" : "Lecture du fichier impossible"); }
        }).start();
    }
    public void onPermissions(int requestCode) { if (requestCode == REQ_PERM) emit("perm", perm() ? "1" : "0"); }
    public void onResume() { emit("resume", ""); }
    public void onIntent(final Intent i) {
        if (i == null) return;
        new Thread(() -> {
            String r = parse(i);
            if (!r.isEmpty()) { handled = i; emit("intent", r); }
        }).start();
    }
}
