package __PKG__;

import android.Manifest;
import android.accounts.Account;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Attendees;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;
import android.provider.CalendarContract.Reminders;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.TimeZone;

/**
 * Agenda : pont entre la page www-agenda et le fournisseur d'agenda d'Android (CalendarContract).
 * Exposé en JS sous window.MAGAgenda. Aucun effet de bord au chargement : rien n'est lu ni demandé
 * tant que la page n'appelle pas une méthode. Événements asynchrones : window.agendaEvent(type, texte).
 */
public class AgendaBridge {
    private static final int REQ_PERM = 5201, REQ_FILE = 5210;
    private static final String LOCAL_NAME = "Sur ce téléphone";
    private final Activity a;
    private final WebView wv;
    private Intent handled;

    public AgendaBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Outils ----------
    private ContentResolver cr() { return a.getContentResolver(); }
    private boolean can(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void toast(final String t) { ui(() -> Toast.makeText(a, t, Toast.LENGTH_SHORT).show()); }
    private void emit(String kind, String data) {
        final String js = "window.agendaEvent&&agendaEvent(" + JSONObject.quote(kind) + "," + JSONObject.quote(data == null ? "" : data) + ")";
        ui(() -> { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } });
    }
    private static String err(Throwable t) {
        try { return new JSONObject().put("ok", false).put("err", t.getMessage() == null ? t.toString() : t.getMessage()).toString(); } catch (Exception e) { return "{\"ok\":false}"; }
    }
    private static String s(Cursor c, int i) { String v = c.isNull(i) ? null : c.getString(i); return v == null ? "" : v; }
    private static String hex(int color) { return String.format("#%06X", color & 0xFFFFFF); }

    // ---------- Autorisations ----------
    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public boolean perm() { return can(Manifest.permission.READ_CALENDAR) && can(Manifest.permission.WRITE_CALENDAR); }
    @JavascriptInterface public void ask() {
        ui(() -> a.requestPermissions(new String[]{ Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }, REQ_PERM));
    }
    /** true si Android n'affichera plus la fenêtre d'autorisation (refus définitif) : il faut passer par les réglages */
    @JavascriptInterface public boolean blocked() {
        return !perm() && !a.shouldShowRequestPermissionRationale(Manifest.permission.READ_CALENDAR);
    }

    // ---------- Agendas ----------
    @JavascriptInterface public String calendars() {
        JSONArray r = new JSONArray();
        if (!perm()) return "[]";
        String[] p = { Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE, Calendars.CALENDAR_COLOR,
            Calendars.VISIBLE, Calendars.CALENDAR_ACCESS_LEVEL, Calendars.OWNER_ACCOUNT, Calendars.ALLOWED_REMINDERS };
        try (Cursor c = cr().query(Calendars.CONTENT_URI, p, null, null, Calendars.ACCOUNT_NAME + " ASC")) {
            while (c != null && c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("name", s(c, 1));
                o.put("account", s(c, 2));
                o.put("type", s(c, 3));
                o.put("color", hex(c.getInt(4)));
                o.put("visible", c.getInt(5) == 1);
                o.put("write", c.getInt(6) >= Calendars.CAL_ACCESS_CONTRIBUTOR);
                o.put("primary", s(c, 2).equals(s(c, 7)));
                o.put("local", CalendarContract.ACCOUNT_TYPE_LOCAL.equals(s(c, 3)));
                r.put(o);
            }
        } catch (Exception e) { }
        return r.toString();
    }

    /** Crée l'agenda « Sur ce téléphone » (compte local, jamais synchronisé). Renvoie son identifiant. */
    @JavascriptInterface public String createLocal(String name, String color) {
        try {
            if (!perm()) return err(new Exception("Autorisation manquante"));
            String n = name == null || name.trim().isEmpty() ? LOCAL_NAME : name.trim();
            Uri u = Calendars.CONTENT_URI.buildUpon()
                .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
                .appendQueryParameter(Calendars.ACCOUNT_NAME, LOCAL_NAME)
                .appendQueryParameter(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build();
            ContentValues v = new ContentValues();
            v.put(Calendars.ACCOUNT_NAME, LOCAL_NAME);
            v.put(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
            v.put(Calendars.NAME, n);
            v.put(Calendars.CALENDAR_DISPLAY_NAME, n);
            int col = 0xFF33B679;
            try { if (color != null && color.startsWith("#")) col = 0xFF000000 | Integer.parseInt(color.substring(1), 16); } catch (Exception e) { }
            v.put(Calendars.CALENDAR_COLOR, col);
            v.put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER);
            v.put(Calendars.OWNER_ACCOUNT, LOCAL_NAME);
            v.put(Calendars.VISIBLE, 1);
            v.put(Calendars.SYNC_EVENTS, 1);
            v.put(Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().getID());
            v.put(Calendars.ALLOWED_REMINDERS, "0,1");
            v.put(Calendars.ALLOWED_AVAILABILITY, "0,1");
            v.put(Calendars.ALLOWED_ATTENDEE_TYPES, "0,1,2");
            Uri r = cr().insert(u, v);
            return new JSONObject().put("ok", true).put("id", ContentUris.parseId(r)).toString();
        } catch (Throwable t) { return err(t); }
    }

    /** Supprime un agenda local (et tous ses événements). Refusé pour les agendas Google. */
    @JavascriptInterface public String deleteLocal(long id) {
        try {
            String type = "", acc = "";
            try (Cursor c = cr().query(ContentUris.withAppendedId(Calendars.CONTENT_URI, id), new String[]{ Calendars.ACCOUNT_TYPE, Calendars.ACCOUNT_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) { type = s(c, 0); acc = s(c, 1); }
            }
            if (!CalendarContract.ACCOUNT_TYPE_LOCAL.equals(type)) return err(new Exception("Seuls les agendas du téléphone peuvent être supprimés ici"));
            Uri u = ContentUris.withAppendedId(Calendars.CONTENT_URI, id).buildUpon()
                .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
                .appendQueryParameter(Calendars.ACCOUNT_NAME, acc)
                .appendQueryParameter(Calendars.ACCOUNT_TYPE, type).build();
            cr().delete(u, null, null);
            return "{\"ok\":true}";
        } catch (Throwable t) { return err(t); }
    }

    /** Couleurs d'événement proposées par le compte (Google : clés 1 à 11). Vide pour un agenda local. */
    @JavascriptInterface public String colors(long calId) {
        JSONArray r = new JSONArray();
        try {
            String acc = null, type = null;
            try (Cursor c = cr().query(ContentUris.withAppendedId(Calendars.CONTENT_URI, calId), new String[]{ Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE }, null, null, null)) {
                if (c != null && c.moveToFirst()) { acc = s(c, 0); type = s(c, 1); }
            }
            if (acc == null) return "[]";
            try (Cursor c = cr().query(CalendarContract.Colors.CONTENT_URI, new String[]{ CalendarContract.Colors.COLOR_KEY, CalendarContract.Colors.COLOR },
                    CalendarContract.Colors.ACCOUNT_NAME + "=? AND " + CalendarContract.Colors.ACCOUNT_TYPE + "=? AND " + CalendarContract.Colors.COLOR_TYPE + "=" + CalendarContract.Colors.TYPE_EVENT,
                    new String[]{ acc, type }, null)) {
                while (c != null && c.moveToNext()) r.put(new JSONObject().put("k", s(c, 0)).put("c", hex(c.getInt(1))));
            }
        } catch (Exception e) { }
        return r.toString();
    }

    /** Demande une synchronisation immédiate des comptes (Google…) */
    @JavascriptInterface public void sync() {
        try {
            HashSet<String> seen = new HashSet<>();
            try (Cursor c = cr().query(Calendars.CONTENT_URI, new String[]{ Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    String n = s(c, 0), t = s(c, 1);
                    if (t.equals(CalendarContract.ACCOUNT_TYPE_LOCAL) || !seen.add(n + "\n" + t)) continue;
                    Bundle b = new Bundle();
                    b.putBoolean(ContentResolver.SYNC_EXTRAS_MANUAL, true);
                    b.putBoolean(ContentResolver.SYNC_EXTRAS_EXPEDITED, true);
                    try { ContentResolver.requestSync(new Account(n, t), CalendarContract.AUTHORITY, b); } catch (Exception e) { }
                }
            }
        } catch (Exception e) { }
    }

    // ---------- Lecture des occurrences ----------
    private static final String[] INST = { Instances.EVENT_ID, Instances.BEGIN, Instances.END, Instances.ALL_DAY, Instances.TITLE,
        Instances.EVENT_LOCATION, Instances.DISPLAY_COLOR, Instances.CALENDAR_ID, Instances.RRULE, Instances.ORIGINAL_ID, Instances.HAS_ALARM, Instances.STATUS };

    private String readInstances(Uri u, int max) {
        JSONArray r = new JSONArray();
        try (Cursor c = cr().query(u, INST, null, null, Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext() && r.length() < max) {
                if (!c.isNull(11) && c.getInt(11) == Events.STATUS_CANCELED) continue;
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("b", c.getLong(1));
                o.put("e", c.getLong(2));
                o.put("all", c.getInt(3) == 1);
                o.put("t", s(c, 4));
                o.put("l", s(c, 5));
                o.put("c", hex(c.getInt(6)));
                o.put("cal", c.getLong(7));
                o.put("rec", !s(c, 8).isEmpty() || !c.isNull(9));
                if (!c.isNull(9)) o.put("oid", c.getLong(9));
                o.put("al", c.getInt(10) == 1);
                r.put(o);
            }
        } catch (Exception e) { }
        return r.toString();
    }
    /** Occurrences entre deux instants (ms). Tous agendas confondus : la page filtre selon ses réglages. */
    @JavascriptInterface public String instances(double from, double to) {
        if (!perm()) return "[]";
        Uri.Builder b = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, (long) from);
        ContentUris.appendId(b, (long) to);
        return readInstances(b.build(), 5000);
    }
    /** Recherche (titre, lieu, description, participants) entre deux instants */
    @JavascriptInterface public String search(String q, double from, double to) {
        if (!perm() || q == null || q.trim().isEmpty()) return "[]";
        Uri.Builder b = Instances.CONTENT_SEARCH_URI.buildUpon();
        ContentUris.appendId(b, (long) from);
        ContentUris.appendId(b, (long) to);
        b.appendPath(q.trim());
        return readInstances(b.build(), 300);
    }

    // ---------- Un événement complet ----------
    static long durMs(String d) {
        if (d == null || d.isEmpty()) return 0;
        long sign = 1, total = 0, n = 0; boolean time = false;
        for (char ch : d.toCharArray()) {
            if (ch == '-') sign = -1;
            else if (ch == 'T') time = true;
            else if (Character.isDigit(ch)) n = n * 10 + (ch - '0');
            else {
                switch (ch) {
                    case 'W': total += n * 604800000L; break;
                    case 'D': total += n * 86400000L; break;
                    case 'H': total += n * 3600000L; break;
                    case 'M': if (time) total += n * 60000L; break;
                    case 'S': total += n * 1000L; break;
                }
                n = 0;
            }
        }
        return sign * total;
    }

    @JavascriptInterface public String event(double idd) {
        long id = (long) idd;
        try {
            if (!perm()) return "null";
            String[] p = { Events.CALENDAR_ID, Events.TITLE, Events.DESCRIPTION, Events.EVENT_LOCATION, Events.DTSTART, Events.DTEND, Events.DURATION,
                Events.ALL_DAY, Events.RRULE, Events.EVENT_TIMEZONE, Events.EVENT_COLOR_KEY, Events.DISPLAY_COLOR, Events.ORIGINAL_ID,
                Events.ORIGINAL_INSTANCE_TIME, Events.ORGANIZER, Events.EVENT_COLOR, Events.UID_2445 };
            JSONObject o = new JSONObject();
            Cursor c = cr().query(ContentUris.withAppendedId(Events.CONTENT_URI, id), p, null, null, null);
            try {
                if (c == null || !c.moveToFirst()) return "null";
                long st = c.getLong(4);
                o.put("id", id);
                o.put("cal", c.getLong(0));
                o.put("t", s(c, 1));
                o.put("d", s(c, 2));
                o.put("l", s(c, 3));
                o.put("start", st);
                long en = c.isNull(5) ? st + durMs(s(c, 6)) : c.getLong(5);
                if (en < st) en = st;
                o.put("end", en);
                o.put("all", c.getInt(7) == 1);
                o.put("rrule", s(c, 8));
                o.put("tz", s(c, 9));
                o.put("ck", s(c, 10));
                o.put("c", hex(c.getInt(11)));
                o.put("own", !c.isNull(15) || !s(c, 10).isEmpty());
                if (!c.isNull(12)) { o.put("oid", c.getLong(12)); o.put("oit", c.getLong(13)); }
                o.put("org", s(c, 14));
                o.put("uid", s(c, 16));
            } finally { if (c != null) c.close(); }
            JSONArray rem = new JSONArray();
            try (Cursor r = cr().query(Reminders.CONTENT_URI, new String[]{ Reminders.MINUTES, Reminders.METHOD }, Reminders.EVENT_ID + "=?", new String[]{ String.valueOf(id) }, Reminders.MINUTES + " ASC")) {
                while (r != null && r.moveToNext()) rem.put(r.getInt(0));
            }
            o.put("rem", rem);
            JSONArray att = new JSONArray();
            try (Cursor r = cr().query(Attendees.CONTENT_URI, new String[]{ Attendees.ATTENDEE_NAME, Attendees.ATTENDEE_EMAIL, Attendees.ATTENDEE_STATUS }, Attendees.EVENT_ID + "=?", new String[]{ String.valueOf(id) }, null)) {
                while (r != null && r.moveToNext()) att.put(new JSONObject().put("n", s(r, 0)).put("m", s(r, 1)).put("s", r.getInt(2)));
            }
            o.put("att", att);
            return o.toString();
        } catch (Throwable t) { return "null"; }
    }

    // ---------- Écriture ----------
    private void setReminders(long id, JSONArray rem) {
        if (rem == null) return;
        cr().delete(Reminders.CONTENT_URI, Reminders.EVENT_ID + "=?", new String[]{ String.valueOf(id) });
        HashSet<Integer> seen = new HashSet<>();
        for (int i = 0; i < rem.length(); i++) {
            int m = rem.optInt(i, -1);
            if (m < 0 || !seen.add(m)) continue;
            ContentValues v = new ContentValues();
            v.put(Reminders.EVENT_ID, id);
            v.put(Reminders.MINUTES, m);
            v.put(Reminders.METHOD, Reminders.METHOD_ALERT);
            cr().insert(Reminders.CONTENT_URI, v);
        }
    }

    /**
     * Enregistre un événement. JSON : {id?, cal, t, l, d, start, end, all, rrule, rem:[min…], ck (clé couleur) ou c (#RRGGBB) ou "" pour la couleur de l'agenda,
     * mode: "all" (série entière / événement simple) ou "one" (cette occurrence seulement, avec ib = début de l'occurrence)}.
     * Pour un événement « journée entière », start et end sont des minuits UTC (end exclusif).
     */
    @JavascriptInterface public String save(String json) {
        try {
            if (!perm()) return err(new Exception("Autorisation manquante"));
            JSONObject o = new JSONObject(json);
            long id = o.optLong("id", 0), cal = o.optLong("cal", 0);
            String mode = o.optString("mode", "all");
            boolean all = o.optBoolean("all", false);
            long start = o.getLong("start"), end = o.getLong("end");
            if (end < start) end = start;
            String rrule = o.optString("rrule", "");
            long origId = 0, curCal = 0;
            if (id > 0) {
                try (Cursor c = cr().query(ContentUris.withAppendedId(Events.CONTENT_URI, id), new String[]{ Events.ORIGINAL_ID, Events.CALENDAR_ID }, null, null, null)) {
                    if (c == null || !c.moveToFirst()) return err(new Exception("Événement introuvable"));
                    if (!c.isNull(0)) origId = c.getLong(0);
                    curCal = c.getLong(1);
                }
            }
            boolean exception = id > 0 && "one".equals(mode) && origId == 0;   // nouvelle exception d'une série
            if (exception || origId > 0) rrule = "";
            // Changement d'agenda : on recrée l'événement dans le nouvel agenda puis on supprime l'ancien
            boolean move = id > 0 && !exception && cal > 0 && cal != curCal && origId == 0;

            ContentValues v = new ContentValues();
            v.put(Events.TITLE, o.optString("t", ""));
            v.put(Events.EVENT_LOCATION, o.optString("l", ""));
            v.put(Events.DESCRIPTION, o.optString("d", ""));
            v.put(Events.ALL_DAY, all ? 1 : 0);
            v.put(Events.DTSTART, start);
            v.put(Events.EVENT_TIMEZONE, all ? "UTC" : TimeZone.getDefault().getID());
            boolean insert = id == 0 || move;
            if (!rrule.isEmpty()) {
                v.put(Events.RRULE, rrule);
                v.put(Events.DURATION, all ? "P" + Math.max(1, Math.round((end - start) / 86400000.0)) + "D" : "P" + ((end - start) / 1000) + "S");
                if (!insert) v.putNull(Events.DTEND);
            } else {
                v.put(Events.DTEND, end);
                if (!insert && !exception) { v.putNull(Events.RRULE); v.putNull(Events.DURATION); }
            }
            String ck = o.optString("ck", ""), col = o.optString("c", "");
            if (!ck.isEmpty()) v.put(Events.EVENT_COLOR_KEY, ck);
            else if (col.startsWith("#")) v.put(Events.EVENT_COLOR, 0xFF000000 | Integer.parseInt(col.substring(1), 16));
            else if (!insert) { v.putNull(Events.EVENT_COLOR); v.putNull(Events.EVENT_COLOR_KEY); }

            long nid;
            if (exception) {
                v.put(Events.ORIGINAL_INSTANCE_TIME, o.getLong("ib"));
                v.put(Events.STATUS, Events.STATUS_CONFIRMED);
                Uri r = cr().insert(Uri.withAppendedPath(Events.CONTENT_EXCEPTION_URI, String.valueOf(id)), v);
                nid = ContentUris.parseId(r);
            } else if (insert) {
                v.put(Events.CALENDAR_ID, cal);
                Uri r;
                try { r = cr().insert(Events.CONTENT_URI, v); }
                catch (Exception colorRefused) {   // certains comptes refusent la couleur libre : on réessaie sans
                    v.remove(Events.EVENT_COLOR); v.remove(Events.EVENT_COLOR_KEY);
                    r = cr().insert(Events.CONTENT_URI, v);
                }
                nid = ContentUris.parseId(r);
                if (move) cr().delete(ContentUris.withAppendedId(Events.CONTENT_URI, id), null, null);
            } else {
                try { cr().update(ContentUris.withAppendedId(Events.CONTENT_URI, id), v, null, null); }
                catch (Exception colorRefused) {
                    v.remove(Events.EVENT_COLOR); v.remove(Events.EVENT_COLOR_KEY);
                    cr().update(ContentUris.withAppendedId(Events.CONTENT_URI, id), v, null, null);
                }
                nid = id;
            }
            setReminders(nid, o.optJSONArray("rem"));
            return new JSONObject().put("ok", true).put("id", nid).toString();
        } catch (Throwable t) { return err(t); }
    }

    /** Supprime : mode "all" = toute la série (ou l'événement simple), "one" = seulement l'occurrence qui commence à ib */
    @JavascriptInterface public String remove(double idd, String mode, double ib) {
        long id = (long) idd;
        try {
            if (!perm()) return err(new Exception("Autorisation manquante"));
            long origId = 0; boolean rec = false;
            try (Cursor c = cr().query(ContentUris.withAppendedId(Events.CONTENT_URI, id), new String[]{ Events.ORIGINAL_ID, Events.RRULE }, null, null, null)) {
                if (c != null && c.moveToFirst()) { if (!c.isNull(0)) origId = c.getLong(0); rec = !s(c, 1).isEmpty(); }
            }
            if ("one".equals(mode) && origId > 0) {
                ContentValues v = new ContentValues();
                v.put(Events.STATUS, Events.STATUS_CANCELED);
                cr().update(ContentUris.withAppendedId(Events.CONTENT_URI, id), v, null, null);
            } else if ("one".equals(mode) && rec) {
                ContentValues v = new ContentValues();
                v.put(Events.ORIGINAL_INSTANCE_TIME, (long) ib);
                v.put(Events.STATUS, Events.STATUS_CANCELED);
                cr().insert(Uri.withAppendedPath(Events.CONTENT_EXCEPTION_URI, String.valueOf(id)), v);
            } else {
                cr().delete(ContentUris.withAppendedId(Events.CONTENT_URI, origId > 0 && "all".equals(mode) ? origId : id), null, null);
            }
            return "{\"ok\":true}";
        } catch (Throwable t) { return err(t); }
    }

    /** Tous les événements (séries, pas les occurrences) des agendas donnés « 1,2,3 », pour l'export .ics */
    @JavascriptInterface public String dump(String calIds) {
        JSONArray r = new JSONArray();
        try {
            if (!perm()) return "[]";
            StringBuilder sel = new StringBuilder(Events.DELETED + "=0 AND " + Events.CALENDAR_ID + " IN (");
            String[] ids = calIds == null ? new String[0] : calIds.split(",");
            int n = 0;
            for (String x : ids) { try { long v = Long.parseLong(x.trim()); sel.append(n++ == 0 ? "" : ",").append(v); } catch (Exception e) { } }
            if (n == 0) return "[]";
            sel.append(")");
            android.util.LongSparseArray<JSONArray> rems = new android.util.LongSparseArray<>();
            try (Cursor c = cr().query(Reminders.CONTENT_URI, new String[]{ Reminders.EVENT_ID, Reminders.MINUTES }, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    JSONArray x = rems.get(c.getLong(0));
                    if (x == null) { x = new JSONArray(); rems.put(c.getLong(0), x); }
                    x.put(c.getInt(1));
                }
            } catch (Exception e) { }
            String[] p = { Events._ID, Events.TITLE, Events.DESCRIPTION, Events.EVENT_LOCATION, Events.DTSTART, Events.DTEND, Events.DURATION, Events.ALL_DAY,
                Events.RRULE, Events.ORIGINAL_ID, Events.ORIGINAL_INSTANCE_TIME, Events.STATUS, Events.EXDATE };
            try (Cursor c = cr().query(Events.CONTENT_URI, p, sel.toString(), null, Events.DTSTART + " ASC")) {
                while (c != null && c.moveToNext()) {
                    JSONObject o = new JSONObject();
                    long st = c.getLong(4);
                    o.put("id", c.getLong(0)); o.put("t", s(c, 1)); o.put("d", s(c, 2)); o.put("l", s(c, 3));
                    o.put("start", st);
                    o.put("end", c.isNull(5) ? st + durMs(s(c, 6)) : c.getLong(5));
                    o.put("all", c.getInt(7) == 1);
                    o.put("rrule", s(c, 8));
                    o.put("exdate", s(c, 12));
                    if (!c.isNull(9)) { o.put("oid", c.getLong(9)); o.put("oit", c.getLong(10)); }
                    o.put("cancel", !c.isNull(11) && c.getInt(11) == Events.STATUS_CANCELED);
                    JSONArray rm = rems.get(c.getLong(0));
                    o.put("rem", rm == null ? new JSONArray() : rm);
                    r.put(o);
                }
            }
        } catch (Exception e) { }
        return r.toString();
    }

    // ---------- Applis externes ----------
    /** kind : geo (adresse), tel, sms, mail, url, share (texte), settings (réglages de l'appli), calendarSettings */
    @JavascriptInterface public void open(final String kind, final String arg) {
        ui(() -> {
            try {
                Intent i;
                String x = arg == null ? "" : arg;
                switch (kind) {
                    case "geo": i = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(x))); break;
                    case "tel": i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(x))); break;
                    case "sms": i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(x))); break;
                    case "mail": i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + x)); break;
                    case "url": i = new Intent(Intent.ACTION_VIEW, Uri.parse(x.matches("(?i)^[a-z]+:.*") ? x : "https://" + x)); break;
                    case "share": {
                        Intent s = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, x);
                        i = Intent.createChooser(s, "Partager l'événement");
                        break;
                    }
                    case "settings": i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName())); break;
                    case "accounts": i = new Intent(Settings.ACTION_SYNC_SETTINGS); break;
                    default: return;
                }
                a.startActivity(i);
            } catch (ActivityNotFoundException e) { toast("Aucune application pour ouvrir ceci"); }
            catch (Exception e) { toast("Ouverture impossible"); }
        });
    }

    /** Choisir un fichier .ics à importer : réponse agendaEvent("file", contenu) */
    @JavascriptInterface public void pickFile() {
        ui(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "text/calendar", "text/x-vcalendar", "application/ics", "text/plain", "application/octet-stream" });
                a.startActivityForResult(Intent.createChooser(i, "Fichier agenda (.ics)"), REQ_FILE);
            } catch (Exception e) { toast("Sélecteur de fichiers indisponible"); }
        });
    }

    private String readText(Uri u) throws Exception {
        try (InputStream in = cr().openInputStream(u)) {
            if (in == null) throw new Exception("Fichier illisible");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 15 * 1024 * 1024) throw new Exception("Fichier trop gros"); }
            return new String(bo.toByteArray(), "UTF-8");
        }
    }

    // ---------- Intents reçus (VIEW / EDIT / INSERT) ----------
    private String parse(Intent i) {
        try {
            if (i == null) return "";
            String act = i.getAction();
            if (act == null) return "";
            Uri d = i.getData();
            String type = i.getType();
            if (type == null && d != null && "content".equals(d.getScheme())) { try { type = cr().getType(d); } catch (Exception e) { } }
            JSONObject o = new JSONObject();
            if (d != null && CalendarContract.AUTHORITY.equals(d.getAuthority())) {
                java.util.List<String> seg = d.getPathSegments();
                if (seg.size() >= 2 && "events".equals(seg.get(0)) && (Intent.ACTION_VIEW.equals(act) || Intent.ACTION_EDIT.equals(act))) {
                    o.put("k", Intent.ACTION_EDIT.equals(act) ? "edit" : "view");
                    o.put("id", Long.parseLong(seg.get(1)));
                    o.put("b", i.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, 0));
                    o.put("e", i.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, 0));
                    return o.toString();
                }
                if (seg.size() >= 2 && "time".equals(seg.get(0))) {
                    o.put("k", "time"); o.put("t", Long.parseLong(seg.get(1)));
                    return o.toString();
                }
            }
            boolean evType = type != null && type.contains("/event");
            boolean evData = d != null && CalendarContract.AUTHORITY.equals(d.getAuthority()) && d.getPath() != null && d.getPath().startsWith("/events");
            if ((Intent.ACTION_INSERT.equals(act) || Intent.ACTION_EDIT.equals(act)) && (evType || evData)) {
                o.put("k", "insert");
                o.put("t", str(i.getStringExtra(Events.TITLE)));
                o.put("l", str(i.getStringExtra(Events.EVENT_LOCATION)));
                o.put("d", str(i.getStringExtra(Events.DESCRIPTION)));
                o.put("b", i.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, 0));
                o.put("e", i.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, 0));
                o.put("all", i.getBooleanExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, false));
                o.put("rrule", str(i.getStringExtra(Events.RRULE)));
                o.put("mails", str(i.getStringExtra(Intent.EXTRA_EMAIL)));
                return o.toString();
            }
            if (Intent.ACTION_VIEW.equals(act) && d != null) {
                String p = d.getLastPathSegment() == null ? "" : d.getLastPathSegment().toLowerCase();
                boolean ics = (type != null && (type.contains("calendar") || type.equals("application/ics"))) || p.endsWith(".ics") || p.endsWith(".ical") || p.endsWith(".ifb");
                if (ics) { o.put("k", "ics"); o.put("text", readText(d)); return o.toString(); }
            }
        } catch (Throwable t) { }
        return "";
    }
    private static String str(String v) { return v == null ? "" : v; }

    /** Intent qui a ouvert l'appli (une seule fois) : JSON {k: view|edit|time|insert|ics, …} ou "" */
    @JavascriptInterface public String pending() {
        Intent i = a.getIntent();
        if (i == null || i == handled) return "";
        String r = parse(i);
        handled = i;
        return r;
    }

    // ---------- Rappels de MainActivity ----------
    public void onResult(int requestCode, int resultCode, final Intent data) {
        if (requestCode != REQ_FILE) return;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) return;
        final Uri u = data.getData();
        new Thread(() -> {
            try { emit("file", readText(u)); }
            catch (Exception e) { toast("Lecture du fichier impossible"); }
        }).start();
    }
    public void onPermissions(int requestCode) {
        if (requestCode == REQ_PERM) emit("perm", perm() ? "1" : "0");
    }
    public void onResume() { emit("resume", ""); }
    public void onIntent(final Intent i) {
        if (i == null) return;
        new Thread(() -> {
            String r = parse(i);
            if (!r.isEmpty()) { handled = i; emit("intent", r); }
        }).start();
    }
}
