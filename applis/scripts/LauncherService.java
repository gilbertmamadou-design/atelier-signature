package __PKG__;

// Socle : écran d'accueil en tableau de bord.
// Liste et lancement des applis, icônes (cache disque), batterie, prochain réveil, agenda,
// contacts, lampe torche, couleurs du fond d'écran, verrouillage et volet (service d'accessibilité).

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.util.List;

public class LauncherService {
    static volatile boolean torchOn = false;
    private static String torchId = null;
    private static boolean torchCb = false;

    // ---------- Applis ----------
    static String apps(Context c) {
        JSONArray a = new JSONArray();
        PackageManager pm = c.getPackageManager();
        try {
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> l = pm.queryIntentActivities(i, 0);
            for (ResolveInfo r : l) {
                if (r.activityInfo == null) continue;
                String pkg = r.activityInfo.packageName;
                if (pkg.equals(c.getPackageName())) continue;
                ApplicationInfo ai = r.activityInfo.applicationInfo;
                JSONObject o = new JSONObject();
                o.put("pkg", pkg);
                o.put("cls", r.activityInfo.name);
                o.put("label", String.valueOf(r.loadLabel(pm)));
                o.put("cat", Build.VERSION.SDK_INT >= 26 && ai != null ? ai.category : -1);
                o.put("sys", ai != null && (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                long upd = 0;
                try { upd = pm.getPackageInfo(pkg, 0).lastUpdateTime; } catch (Exception e) { }
                o.put("upd", upd);
                a.put(o);
            }
        } catch (Exception e) { }
        return a.toString();
    }

    static String icon(Context c, String pkg, String cls, int size, long upd) {
        try {
            File dir = new File(c.getCacheDir(), "icones");
            dir.mkdirs();
            File f = new File(dir, (pkg + "_" + cls).replaceAll("[^A-Za-z0-9._]", "_") + "_" + size + "_" + upd + ".png");
            byte[] bytes;
            if (f.exists()) bytes = Files.readAllBytes(f.toPath());
            else {
                PackageManager pm = c.getPackageManager();
                Drawable d;
                try { d = pm.getActivityIcon(new ComponentName(pkg, cls)); } catch (Exception e) { d = pm.getApplicationIcon(pkg); }
                Bitmap b = toBitmap(d, size);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.PNG, 100, bo);
                bytes = bo.toByteArray();
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); } catch (Exception e) { }
            }
            return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Throwable e) { return ""; }
    }

    private static Bitmap toBitmap(Drawable d, int size) {
        if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
            Bitmap b = ((BitmapDrawable) d).getBitmap();
            return b.getWidth() == size ? b : Bitmap.createScaledBitmap(b, size, size, true);
        }
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        d.setBounds(0, 0, size, size);
        d.draw(cv);
        return b;
    }

    static boolean launch(Activity a, String pkg, String cls) {
        try {
            Intent i;
            if (cls != null && !cls.isEmpty()) {
                i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(new ComponentName(pkg, cls));
            } else {
                i = a.getPackageManager().getLaunchIntentForPackage(pkg);
                if (i == null) return false;
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            a.startActivity(i);
            return true;
        } catch (Exception e) { return false; }
    }

    static String installed(Context c, String pkg) {
        try { c.getPackageManager().getPackageInfo(pkg, 0); return "1"; } catch (Exception e) { return ""; }
    }

    // Ouvre une appli du système par son rôle : téléphone, messages, appareil photo, réveil, agenda, réglages…
    static boolean open(Activity a, String what, String arg) { return open(a, what, arg, null); }

    // Même chose, mais dans l'appli pkg si elle sait le faire (sinon l'appli par défaut du téléphone)
    static boolean open(Activity a, String what, String arg, String pkg) {
        try {
            Intent i;
            switch (what) {
                case "dial": i = new Intent(Intent.ACTION_DIAL, arg == null || arg.isEmpty() ? null : Uri.parse("tel:" + Uri.encode(arg))); break;
                case "smsto": i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(arg == null ? "" : arg))); break;
                case "sms": i = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MESSAGING); break;
                case "camera": i = new Intent(android.provider.MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA); break;
                case "alarms": i = new Intent(android.provider.AlarmClock.ACTION_SHOW_ALARMS); break;
                case "calendar": {
                    Uri.Builder b = CalendarContract.CONTENT_URI.buildUpon().appendPath("time");
                    ContentUris.appendId(b, System.currentTimeMillis());
                    i = new Intent(Intent.ACTION_VIEW).setData(b.build());
                    break;
                }
                case "event": i = new Intent(Intent.ACTION_VIEW, ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(arg))); break;
                case "event-new": i = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI); break;
                case "contact": i = new Intent(Intent.ACTION_VIEW, Uri.parse(arg)); break;
                case "web": i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(arg))); break;
                case "url": i = new Intent(Intent.ACTION_VIEW, Uri.parse(arg)); break;
                case "settings": i = new Intent(Settings.ACTION_SETTINGS); break;
                case "home": i = new Intent(Settings.ACTION_HOME_SETTINGS); break;
                case "wallpaper": i = new Intent(Intent.ACTION_SET_WALLPAPER); break;
                case "a11y": i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS); break;
                case "appinfo": i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + (arg == null || arg.isEmpty() ? a.getPackageName() : arg))); break;
                case "uninstall": i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + arg)); break;
                case "battery": i = new Intent(Intent.ACTION_POWER_USAGE_SUMMARY); break;
                case "storage": i = new Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS); break;
                default: return false;
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null && !pkg.isEmpty()) {
                Intent j = new Intent(i).setPackage(pkg);
                if (j.resolveActivity(a.getPackageManager()) != null) { a.startActivity(j); return true; }
                Intent l = a.getPackageManager().getLaunchIntentForPackage(pkg);
                if (l != null && ("calendar".equals(what) || "alarms".equals(what))) { l.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(l); return true; }
            }
            a.startActivity(i);
            return true;
        } catch (Exception e) {
            if (pkg != null && !pkg.isEmpty()) return open(a, what, arg, null);
            if ("home".equals(what)) return open(a, "settings", null);
            return false;
        }
    }

    // ---------- Batterie et réveil ----------
    static String battery(Context c) {
        try {
            Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            JSONObject o = new JSONObject();
            int lvl = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), sc = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            o.put("level", lvl < 0 ? -1 : Math.round(lvl * 100f / sc));
            o.put("plugged", b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0);
            int st = b.getIntExtra(BatteryManager.EXTRA_STATUS, 0);
            o.put("full", st == BatteryManager.BATTERY_STATUS_FULL);
            o.put("temp", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
            BatteryManager bm = c.getSystemService(BatteryManager.class);
            long left = Build.VERSION.SDK_INT >= 28 ? bm.computeChargeTimeRemaining() : -1;
            o.put("chargeLeft", left);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    static String nextAlarm(Context c) {
        try {
            AlarmManager am = c.getSystemService(AlarmManager.class);
            AlarmManager.AlarmClockInfo n = am.getNextAlarmClock();
            JSONObject o = new JSONObject();
            o.put("at", n == null ? 0 : n.getTriggerTime());
            String pkg = "";
            try { if (n != null && n.getShowIntent() != null) pkg = n.getShowIntent().getCreatorPackage(); } catch (Exception e) { }
            o.put("pkg", pkg == null ? "" : pkg);
            return o.toString();
        } catch (Exception e) { return "{\"at\":0}"; }
    }

    // ---------- Agenda et contacts ----------
    static boolean has(Context c, String perm) { return c.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }

    static String agenda(Context c, int days) {
        JSONArray a = new JSONArray();
        if (!has(c, Manifest.permission.READ_CALENDAR)) return "null";
        long now = System.currentTimeMillis();
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0); cal.set(java.util.Calendar.MINUTE, 0); cal.set(java.util.Calendar.SECOND, 0);
        long start = cal.getTimeInMillis(), end = start + days * 86400000L;
        // Jours entiers : Android les range en UTC (minuit à minuit) ; celui d'hier déborde sur ce matin en heure locale
        java.util.Calendar u = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
        u.clear(); u.set(cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH), cal.get(java.util.Calendar.DAY_OF_MONTH));
        long todayUtc = u.getTimeInMillis();
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, start);
        ContentUris.appendId(b, end);
        String[] cols = { CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.DISPLAY_COLOR, CalendarContract.Instances.EVENT_LOCATION };
        try (Cursor cur = c.getContentResolver().query(b.build(), cols, CalendarContract.Instances.VISIBLE + "=1", null, CalendarContract.Instances.BEGIN + " ASC")) {
            while (cur != null && cur.moveToNext() && a.length() < 30) {
                long en = cur.getLong(3);
                boolean all = cur.getInt(4) == 1;
                if (!all && en < now) continue;
                if (all && en <= todayUtc) continue;
                JSONObject o = new JSONObject();
                o.put("id", cur.getLong(0)); o.put("title", cur.getString(1) == null ? "(sans titre)" : cur.getString(1));
                o.put("begin", cur.getLong(2)); o.put("end", en); o.put("all", all);
                o.put("color", String.format("#%06X", cur.getInt(5) & 0xFFFFFF));
                o.put("place", cur.getString(6) == null ? "" : cur.getString(6));
                a.put(o);
            }
        } catch (Exception e) { }
        return a.toString();
    }

    static String contacts(Context c, String q) {
        JSONArray a = new JSONArray();
        if (!has(c, Manifest.permission.READ_CONTACTS)) return "null";
        if (q == null || q.trim().isEmpty()) return "[]";
        Uri u = Uri.withAppendedPath(ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI, Uri.encode(q.trim()));
        String[] cols = { ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.LOOKUP_KEY,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER };
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        try (Cursor cur = c.getContentResolver().query(u, cols, null, null, null)) {
            while (cur != null && cur.moveToNext() && a.length() < 6) {
                String id = cur.getString(0);
                if (!seen.add(id)) continue;
                JSONObject o = new JSONObject();
                o.put("name", cur.getString(2)); o.put("num", cur.getString(3));
                o.put("uri", ContactsContract.Contacts.getLookupUri(Long.parseLong(id), cur.getString(1)).toString());
                a.put(o);
            }
        } catch (Exception e) { }
        return a.toString();
    }

    // ---------- Lampe torche ----------
    static String torch(Context c, boolean on) {
        try {
            CameraManager cm = c.getSystemService(CameraManager.class);
            if (torchId == null) {
                for (String id : cm.getCameraIdList()) {
                    Boolean f = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer face = cm.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
                    if (f != null && f && (face == null || face == CameraCharacteristics.LENS_FACING_BACK)) { torchId = id; break; }
                }
            }
            if (torchId == null) return "Pas de lampe sur ce téléphone";
            if (!torchCb) {
                torchCb = true;
                cm.registerTorchCallback(new CameraManager.TorchCallback() {
                    @Override public void onTorchModeChanged(String id, boolean enabled) { if (id.equals(torchId)) torchOn = enabled; }
                }, new android.os.Handler(android.os.Looper.getMainLooper()));
            }
            cm.setTorchMode(torchId, on);
            torchOn = on;
            return "";
        } catch (Exception e) { return "Lampe indisponible : " + e.getMessage(); }
    }

    // ---------- Couleurs du fond d'écran ----------
    static String colors(Context c) {
        try {
            if (Build.VERSION.SDK_INT < 27) return "{}";
            WallpaperColors w = WallpaperManager.getInstance(c).getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
            if (w == null) return "{}";
            JSONObject o = new JSONObject();
            o.put("p", hex(w.getPrimaryColor().toArgb()));
            if (w.getSecondaryColor() != null) o.put("s", hex(w.getSecondaryColor().toArgb()));
            if (w.getTertiaryColor() != null) o.put("t", hex(w.getTertiaryColor().toArgb()));
            o.put("light", Build.VERSION.SDK_INT >= 31 && (w.getColorHints() & WallpaperColors.HINT_SUPPORTS_DARK_TEXT) != 0);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    private static String hex(int c) { return String.format("#%06X", c & 0xFFFFFF); }

    // ---------- Verrouillage et volet ----------
    static String perms(Context c) {
        try {
            JSONObject o = new JSONObject();
            o.put("calendar", has(c, Manifest.permission.READ_CALENDAR));
            o.put("contacts", has(c, Manifest.permission.READ_CONTACTS));
            o.put("location", has(c, Manifest.permission.ACCESS_COARSE_LOCATION) || has(c, Manifest.permission.ACCESS_FINE_LOCATION));
            o.put("a11y", LauncherA11y.instance != null);
            o.put("home", isDefaultHome(c));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    static boolean isDefaultHome(Context c) {
        try {
            ResolveInfo r = c.getPackageManager().resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY);
            return r != null && r.activityInfo != null && c.getPackageName().equals(r.activityInfo.packageName);
        } catch (Exception e) { return false; }
    }

    static boolean lock() {
        LauncherA11y s = LauncherA11y.instance;
        if (s == null || Build.VERSION.SDK_INT < 28) return false;
        return s.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN);
    }

    static boolean power() {
        LauncherA11y s = LauncherA11y.instance;
        if (s == null) return false;
        return s.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_POWER_DIALOG);
    }

    static boolean notifications(Context c, boolean quick) {
        LauncherA11y s = LauncherA11y.instance;
        if (s != null) return s.performGlobalAction(quick ? android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS : android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS);
        try {
            Object sb = c.getSystemService("statusbar");
            Class<?> k = Class.forName("android.app.StatusBarManager");
            k.getMethod(quick ? "expandSettingsPanel" : "expandNotificationsPanel").invoke(sb);
            return true;
        } catch (Throwable e) { return false; }
    }

    static String insets(Activity a) {
        try {
            float d = a.getResources().getDisplayMetrics().density;
            int top = 0, bot = 0;
            if (Build.VERSION.SDK_INT >= 23 && a.getWindow().getDecorView().getRootWindowInsets() != null) {
                android.view.WindowInsets wi = a.getWindow().getDecorView().getRootWindowInsets();
                top = wi.getSystemWindowInsetTop(); bot = wi.getSystemWindowInsetBottom();
            }
            if (top == 0) { int id = a.getResources().getIdentifier("status_bar_height", "dimen", "android"); if (id > 0) top = a.getResources().getDimensionPixelSize(id); }
            if (bot == 0) { int id = a.getResources().getIdentifier("navigation_bar_height", "dimen", "android"); if (id > 0) bot = a.getResources().getDimensionPixelSize(id); }
            return "{\"top\":" + Math.round(top / d) + ",\"bottom\":" + Math.round(bot / d) + "}";
        } catch (Exception e) { return "{\"top\":24,\"bottom\":24}"; }
    }

    // ---------- Musique en cours (tuile Musique) ----------
    private static String artKey = "", artData = "";

    static boolean mediaAccess(Context c) {
        try {
            String l = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
            return l != null && l.contains(new ComponentName(c, LauncherMedia.class).flattenToString());
        } catch (Exception e) { return false; }
    }

    private static android.media.session.MediaController controller(Context c) {
        if (!mediaAccess(c)) return null;
        try {
            android.media.session.MediaSessionManager m = c.getSystemService(android.media.session.MediaSessionManager.class);
            List<android.media.session.MediaController> l = m.getActiveSessions(new ComponentName(c, LauncherMedia.class));
            if (l == null || l.isEmpty()) return null;
            for (android.media.session.MediaController mc : l) {
                android.media.session.PlaybackState st = mc.getPlaybackState();
                if (st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING) return mc;
            }
            return l.get(0);
        } catch (Exception e) { return null; }
    }

    /** Morceau en cours : {access, playing, pkg, app, title, artist, album, pos, dur, speed, at, artKey, art (si changée)} */
    static String media(Context c, String knownArt) {
        try {
            JSONObject o = new JSONObject();
            o.put("access", mediaAccess(c));
            android.media.session.MediaController mc = controller(c);
            if (mc == null) { o.put("none", true); return o.toString(); }
            PackageManager pm = c.getPackageManager();
            String pkg = mc.getPackageName();
            o.put("pkg", pkg);
            try { o.put("app", String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)))); } catch (Exception e) { o.put("app", pkg); }
            android.media.MediaMetadata md = mc.getMetadata();
            if (md != null) {
                o.put("title", nz(md.getString(android.media.MediaMetadata.METADATA_KEY_TITLE), md.getString(android.media.MediaMetadata.METADATA_KEY_DISPLAY_TITLE)));
                o.put("artist", nz(md.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST), md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST)));
                o.put("album", nz(md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM), ""));
                o.put("dur", md.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION));
                Bitmap b = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART);
                if (b == null) b = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ART);
                if (b == null) b = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_DISPLAY_ICON);
                String key = pkg + "|" + o.optString("title") + "|" + o.optString("album") + "|" + (b == null ? 0 : b.getWidth() * 31 + b.getHeight());
                if (!key.equals(artKey)) {
                    artKey = key; artData = "";
                    if (b != null) {
                        Bitmap s = Bitmap.createScaledBitmap(b, 192, Math.max(1, Math.round(192f * b.getHeight() / b.getWidth())), true);
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        s.compress(Bitmap.CompressFormat.JPEG, 85, bo);
                        artData = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                    }
                }
                o.put("artKey", artKey);
                if (!artKey.equals(knownArt)) o.put("art", artData);
            }
            android.media.session.PlaybackState st = mc.getPlaybackState();
            if (st != null) {
                o.put("playing", st.getState() == android.media.session.PlaybackState.STATE_PLAYING || st.getState() == android.media.session.PlaybackState.STATE_BUFFERING);
                o.put("pos", st.getPosition()); o.put("speed", st.getPlaybackSpeed()); o.put("at", st.getLastPositionUpdateTime());
                o.put("now", android.os.SystemClock.elapsedRealtime());
                long act = st.getActions();
                o.put("canPrev", (act & android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
                o.put("canNext", (act & android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
                o.put("canSeek", (act & android.media.session.PlaybackState.ACTION_SEEK_TO) != 0);
            }
            return o.toString();
        } catch (Throwable t) { return "{\"none\":true}"; }
    }
    private static String nz(String a, String b) { return a != null && !a.isEmpty() ? a : (b == null ? "" : b); }

    /** Commandes : play, pause, toggle, next, prev, seek (arg = ms). Sans accès, passe par les touches multimédia du système. */
    static boolean mediaCmd(Context c, String cmd, long arg) {
        android.media.session.MediaController mc = controller(c);
        if (mc != null) {
            android.media.session.MediaController.TransportControls t = mc.getTransportControls();
            android.media.session.PlaybackState st = mc.getPlaybackState();
            boolean playing = st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING;
            switch (cmd) {
                case "toggle": if (playing) t.pause(); else t.play(); return true;
                case "play": t.play(); return true;
                case "pause": t.pause(); return true;
                case "next": t.skipToNext(); return true;
                case "prev": t.skipToPrevious(); return true;
                case "seek": t.seekTo(arg); return true;
            }
            return false;
        }
        int code = "next".equals(cmd) ? android.view.KeyEvent.KEYCODE_MEDIA_NEXT : "prev".equals(cmd) ? android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
            : "play".equals(cmd) ? android.view.KeyEvent.KEYCODE_MEDIA_PLAY : "pause".equals(cmd) ? android.view.KeyEvent.KEYCODE_MEDIA_PAUSE : android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        if ("seek".equals(cmd)) return false;
        try {
            android.media.AudioManager am = c.getSystemService(android.media.AudioManager.class);
            am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, code));
            am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, code));
            return true;
        } catch (Exception e) { return false; }
    }

    static void openMediaAccess(Activity a) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 30) i = new Intent("android.settings.NOTIFICATION_LISTENER_DETAIL_SETTINGS").putExtra("android.provider.extra.NOTIFICATION_LISTENER_COMPONENT_NAME", new ComponentName(a, LauncherMedia.class).flattenToString());
            else i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            try { a.startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e2) { }
        }
    }

    // ---------- Tuiles des applis MAG (canal privé WidgetProvider) ----------
    static String widget(Context c, String pkg) {
        try (Cursor cur = c.getContentResolver().query(Uri.parse("content://" + pkg + ".widget/data"), null, null, null, null)) {
            if (cur != null && cur.moveToFirst()) return cur.getString(0);
        } catch (Throwable t) { }
        return "";
    }

    static boolean widgetCall(Context c, String pkg, String method, String arg) {
        try {
            android.os.Bundle b = c.getContentResolver().call(Uri.parse("content://" + pkg + ".widget"), method, arg, null);
            return b != null && b.getBoolean("ok");
        } catch (Throwable t) { return false; }
    }

    /** Ouvre une appli MAG en lui passant une action (lue par la page avec onSocle / MAGPrint.takeSocle) */
    static boolean launchWith(Activity a, String pkg, String action) {
        try {
            Intent i = a.getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            i.putExtra("socle", action);
            a.startActivity(i);
            return true;
        } catch (Exception e) { return false; }
    }

    /** Dernières photos : [{id, uri, thumb}] (null si l'autorisation manque) */
    static String photos(Context c, int n, int size) {
        String perm = Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_IMAGES" : Manifest.permission.READ_EXTERNAL_STORAGE;
        boolean partial = Build.VERSION.SDK_INT >= 34 && has(c, "android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
        if (!has(c, perm) && !partial) return "null";
        JSONArray a = new JSONArray();
        Uri base = android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] cols = { android.provider.MediaStore.Images.Media._ID, android.provider.MediaStore.Images.Media.DATE_TAKEN, android.provider.MediaStore.Images.Media.DATE_ADDED };
        try (Cursor cur = c.getContentResolver().query(base, cols, null, null, android.provider.MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            while (cur != null && cur.moveToNext() && a.length() < n) {
                long id = cur.getLong(0);
                Uri u = ContentUris.withAppendedId(base, id);
                String th = "";
                try {
                    File dir = new File(c.getCacheDir(), "photos"); dir.mkdirs();
                    File f = new File(dir, id + "_" + size + ".jpg");
                    byte[] bytes;
                    if (f.exists()) bytes = Files.readAllBytes(f.toPath());
                    else {
                        Bitmap b = Build.VERSION.SDK_INT >= 29 ? c.getContentResolver().loadThumbnail(u, new android.util.Size(size, size), null)
                            : android.provider.MediaStore.Images.Thumbnails.getThumbnail(c.getContentResolver(), id, android.provider.MediaStore.Images.Thumbnails.MINI_KIND, null);
                        if (b == null) continue;
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        b.compress(Bitmap.CompressFormat.JPEG, 82, bo);
                        bytes = bo.toByteArray();
                        try (FileOutputStream o = new FileOutputStream(f)) { o.write(bytes); } catch (Exception e) { }
                    }
                    th = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                } catch (Throwable t) { continue; }
                JSONObject o = new JSONObject();
                o.put("id", id); o.put("uri", u.toString()); o.put("thumb", th); o.put("t", cur.getLong(1) > 0 ? cur.getLong(1) : cur.getLong(2) * 1000);
                a.put(o);
            }
        } catch (Throwable t) { }
        return a.toString();
    }

    /** Ouvre une photo dans Galerie (sinon dans l'appli par défaut) */
    static boolean openPhoto(Activity a, String uri, String pkg) {
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), "image/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try { if (pkg != null && !pkg.isEmpty()) { a.startActivity(new Intent(i).setPackage(pkg)); return true; } } catch (Exception e) { }
        try { a.startActivity(i); return true; } catch (Exception e) { return false; }
    }

    /** Contacts favoris : [{id, name, num, uri, photo}] (null si l'autorisation manque) */
    static String favContacts(Context c, int n) {
        if (!has(c, Manifest.permission.READ_CONTACTS)) return "null";
        JSONArray a = new JSONArray();
        String[] cols = { ContactsContract.Contacts._ID, ContactsContract.Contacts.LOOKUP_KEY, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY, ContactsContract.Contacts.PHOTO_THUMBNAIL_URI, ContactsContract.Contacts.HAS_PHONE_NUMBER };
        try (Cursor cur = c.getContentResolver().query(ContactsContract.Contacts.CONTENT_URI, cols, ContactsContract.Contacts.STARRED + "=1", null, ContactsContract.Contacts.TIMES_CONTACTED + " DESC, " + ContactsContract.Contacts.DISPLAY_NAME_PRIMARY + " ASC")) {
            while (cur != null && cur.moveToNext() && a.length() < n) {
                long id = cur.getLong(0);
                JSONObject o = new JSONObject();
                o.put("id", id); o.put("name", cur.getString(2) == null ? "" : cur.getString(2));
                o.put("uri", ContactsContract.Contacts.getLookupUri(id, cur.getString(1)).toString());
                String num = "";
                if (cur.getInt(4) > 0) {
                    try (Cursor p = c.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, new String[]{ ContactsContract.CommonDataKinds.Phone.NUMBER },
                            ContactsContract.CommonDataKinds.Phone.CONTACT_ID + "=?", new String[]{ String.valueOf(id) }, ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY + " DESC")) {
                        if (p != null && p.moveToFirst()) num = p.getString(0);
                    }
                }
                o.put("num", num);
                String ph = "";
                String pu = cur.getString(3);
                if (pu != null) {
                    try (java.io.InputStream in = c.getContentResolver().openInputStream(Uri.parse(pu))) {
                        ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int k;
                        while ((k = in.read(buf)) > 0) bo.write(buf, 0, k);
                        ph = "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                    } catch (Exception e) { }
                }
                o.put("photo", ph);
                a.put(o);
            }
        } catch (Throwable t) { }
        return a.toString();
    }
}
