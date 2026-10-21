package __PKG__;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import androidx.core.app.NotificationCompat;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Aube : réveils (AlarmManager.setAlarmClock), sonnerie sur la musique du téléphone avec montée progressive,
 * répétition, lever de soleil avant le réveil, musique d'endormissement qui baisse doucement, écoute d'essai.
 */
public class AlarmService extends Service implements AudioManager.OnAudioFocusChangeListener {
    static final String PREF = "aube";
    static final String CH_RING = "aube_reveil", CH_INFO = "aube_info", CH_SLEEP = "aube_soir";
    static final int N_RING = 7601, N_SNOOZE = 7602, N_DAWN = 7603, N_SLEEP = 7604, N_MISSED = 7605;

    static volatile boolean ringing = false, sleeping = false, previewing = false;
    static volatile int ringId = -1;
    static volatile long ringSince = 0, sleepEnd = 0, sleepStart = 0;
    static volatile String ringLabel = "", ringTrack = "";
    static volatile int dawnId = -1; static volatile long dawnAt = 0, dawnRing = 0;
    static AlarmService inst;

    final Handler h = new Handler(Looper.getMainLooper());
    private MediaPlayer ring, media;
    private AudioManager am;
    private AudioFocusRequest afr;
    private Vibrator vib;
    private int savedAlarmVol = -1;
    private JSONObject cur;
    private float target = 1f;
    private long fadeMs = 0;
    private JSONArray sleepIds; private int sleepIdx = 0; private float sleepVol = 0.6f;

    // ================= Réglages et programmation =================
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREF, MODE_PRIVATE); }
    static JSONArray alarms(Context c) { try { return new JSONArray(prefs(c).getString("alarms", "[]")); } catch (Exception e) { return new JSONArray(); } }
    static String list(Context c) { return alarms(c).toString(); }
    static JSONObject find(Context c, int id) {
        JSONArray a = alarms(c);
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && o.optInt("id") == id) return o; }
        return null;
    }
    static void save(Context c, String json) {
        try { new JSONArray(json); } catch (Exception e) { return; }
        prefs(c).edit().putString("alarms", json).apply();
        reschedule(c);
    }
    static void put(Context c, JSONObject alarm) {
        try {
            JSONArray a = alarms(c), out = new JSONArray(); boolean done = false;
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); if (o.optInt("id") == alarm.optInt("id")) { out.put(alarm); done = true; } else out.put(o); }
            if (!done) out.put(alarm);
            prefs(c).edit().putString("alarms", out.toString()).apply();
        } catch (Exception e) { }
    }
    static String day(Calendar k) { return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH)); }
    /** Prochaine sonnerie (ms) d'un réveil, 0 si aucune. days : 1 = lundi … 7 = dimanche ; vide = une seule fois. */
    static long next(JSONObject o, long now) {
        if (o == null || !o.optBoolean("on", false)) return 0;
        JSONArray d = o.optJSONArray("days");
        boolean[] on = new boolean[8]; boolean any = false;
        if (d != null) for (int i = 0; i < d.length(); i++) { int x = d.optInt(i); if (x >= 1 && x <= 7) { on[x] = true; any = true; } }
        String skip = o.optString("skip", "");
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(now);
        k.set(Calendar.HOUR_OF_DAY, o.optInt("h", 7)); k.set(Calendar.MINUTE, o.optInt("m", 0)); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        for (int i = 0; i < 9; i++) {
            if (k.getTimeInMillis() > now + 500) {
                int dow = k.get(Calendar.DAY_OF_WEEK); int iso = dow == Calendar.SUNDAY ? 7 : dow - 1;
                if ((!any || on[iso]) && !skip.equals(day(k))) return k.getTimeInMillis();
            }
            k.add(Calendar.DAY_OF_MONTH, 1);
            k.set(Calendar.HOUR_OF_DAY, o.optInt("h", 7)); k.set(Calendar.MINUTE, o.optInt("m", 0));
        }
        return 0;
    }
    static PendingIntent pi(Context c, String action, int id, int rc) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(action).putExtra("id", id);
        return PendingIntent.getBroadcast(c, rc, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static PendingIntent openApp(Context c, String what, int rc) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (i == null) i = new Intent();
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (what != null) i.putExtra("aube", what);
        return PendingIntent.getActivity(c, rc, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        try { return ((AlarmManager) c.getSystemService(ALARM_SERVICE)).canScheduleExactAlarms(); } catch (Exception e) { return false; }
    }
    static void setAt(Context c, long at, PendingIntent p, boolean clock) {
        AlarmManager m = (AlarmManager) c.getSystemService(ALARM_SERVICE);
        try {
            if (clock) m.setAlarmClock(new AlarmManager.AlarmClockInfo(at, openApp(c, null, 3)), p);
            else if (Build.VERSION.SDK_INT >= 23 && canExact(c)) m.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else m.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        } catch (SecurityException e) {
            // Sans droit « alarmes exactes » : alarme approchée (quelques minutes de décalage possibles)
            try { m.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p); } catch (Exception e2) { }
        }
    }
    static void reschedule(Context c) {
        AlarmManager m = (AlarmManager) c.getSystemService(ALARM_SERVICE);
        SharedPreferences p = prefs(c);
        // annule les anciennes programmations
        try {
            JSONArray old = new JSONArray(p.getString("sched", "[]"));
            for (int i = 0; i < old.length(); i++) { int id = old.getInt(i); m.cancel(pi(c, "aube.RING", id, 1000 + id)); m.cancel(pi(c, "aube.DAWN", id, 3000 + id)); }
        } catch (Exception e) { }
        JSONArray a = alarms(c), sched = new JSONArray();
        long now = System.currentTimeMillis(), best = 0;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i); if (o == null) continue;
            int id = o.optInt("id"); long at = next(o, now);
            if (at <= 0) continue;
            sched.put(id);
            setAt(c, at, pi(c, "aube.RING", id, 1000 + id), true);
            int dawn = o.optInt("dawn", 0);
            if (dawn > 0 && at - dawn * 60000L > now + 5000) setAt(c, at - dawn * 60000L, pi(c, "aube.DAWN", id, 3000 + id), false);
            if (best == 0 || at < best) best = at;
        }
        p.edit().putString("sched", sched.toString()).putLong("next", best).apply();
    }
    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel r = new NotificationChannel(CH_RING, "Réveil qui sonne", NotificationManager.IMPORTANCE_HIGH);
        r.setSound(null, null); r.enableVibration(false); r.setBypassDnd(true); r.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(r);
        NotificationChannel i = new NotificationChannel(CH_INFO, "Répétition et lever de soleil", NotificationManager.IMPORTANCE_HIGH);
        i.setSound(null, null); i.enableVibration(false);
        nm.createNotificationChannel(i);
        NotificationChannel s = new NotificationChannel(CH_SLEEP, "Lumière du soir et endormissement", NotificationManager.IMPORTANCE_LOW);
        s.setShowBadge(false);
        nm.createNotificationChannel(s);
    }
    static String state() {
        try {
            JSONObject o = new JSONObject();
            o.put("ringing", ringing); o.put("id", ringId); o.put("since", ringSince); o.put("label", ringLabel); o.put("track", ringTrack);
            o.put("dawn", dawnId); o.put("dawnAt", dawnAt); o.put("dawnRing", dawnRing);
            o.put("sleeping", sleeping); o.put("sleepEnd", sleepEnd); o.put("sleepStart", sleepStart); o.put("preview", previewing);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    static void start(Context c, Intent i) {
        i.setClass(c, AlarmService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void cmd(Context c, String action, String json) {
        Intent i = new Intent(action); if (json != null) i.putExtra("json", json);
        if (inst == null && (action.equals("stop") || action.equals("snooze") || action.equals("sleepStop") || action.equals("previewStop"))) return;
        start(c, i);
    }

    // ================= Service =================
    @Override public void onCreate() {
        super.onCreate(); inst = this;
        am = (AudioManager) getSystemService(AUDIO_SERVICE);
        vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        channels(this);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        String js = intent == null ? null : intent.getStringExtra("json");
        int id = intent == null ? -1 : intent.getIntExtra("id", -1);
        foreground(a == null ? "" : a); // obligatoire très vite
        if (a == null) { finishIfIdle(); return START_NOT_STICKY; }
        try {
            switch (a) {
                case "ring": { JSONObject o = find(this, id); if (o == null) o = new JSONObject().put("id", id).put("label", "Réveil"); startRing(o); break; }
                case "test": startRing(new JSONObject(js)); break;
                case "stop": stopRing(true); break;
                case "snooze": snooze(); break;
                case "preview": startPreview(new JSONObject(js)); break;
                case "previewStop": stopMedia(); break;
                case "sleep": startSleep(new JSONObject(js)); break;
                case "sleepStop": stopMedia(); break;
            }
        } catch (Exception e) { }
        finishIfIdle();
        return START_NOT_STICKY;
    }
    private void foreground(String a) {
        Notification n;
        if (a.equals("ring") || a.equals("test") || ringing) n = ringNotif();
        else n = mediaNotif();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(N_RING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK); else startForeground(N_RING, n);
        } catch (Exception e) { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(N_RING, n); }
    }
    private PendingIntent act(String a, int rc) {
        return PendingIntent.getService(this, rc, new Intent(this, AlarmService.class).setAction(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private Notification ringNotif() {
        String t = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.FRANCE).format(new java.util.Date());
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_RING)
            .setSmallIcon(getApplicationInfo().icon).setContentTitle("⏰ " + t + (ringLabel.isEmpty() ? "" : " · " + ringLabel))
            .setContentText(ringTrack.isEmpty() ? "Bonjour !" : "♪ " + ringTrack)
            .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
            .setContentIntent(openApp(this, "ring", 21)).setFullScreenIntent(openApp(this, "ring", 22), true)
            .addAction(android.R.drawable.ic_lock_idle_alarm, "Répéter", act("snooze", 23))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", act("stop", 24));
        return b.build();
    }
    private Notification mediaNotif() {
        String txt = sleeping ? "Musique d'endormissement : arrêt vers " + new java.text.SimpleDateFormat("HH:mm", java.util.Locale.FRANCE).format(new java.util.Date(sleepEnd)) : "Écoute d'essai";
        return new NotificationCompat.Builder(this, CH_SLEEP)
            .setSmallIcon(getApplicationInfo().icon).setContentTitle("Aube").setContentText(txt)
            .setContentIntent(openApp(this, null, 31)).setOngoing(true).setSilent(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", act(sleeping ? "sleepStop" : "previewStop", 32)).build();
    }
    private void finishIfIdle() {
        if (!ringing && !sleeping && !previewing) { stopForeground(true); stopSelf(); }
    }

    // ---------- Sonnerie ----------
    static Uri trackUri(long id) { return ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id); }
    static Uri defaultTone() {
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return u;
    }
    private MediaPlayer player(int usage) {
        MediaPlayer p = new MediaPlayer();
        p.setAudioAttributes(new AudioAttributes.Builder().setUsage(usage).setContentType(usage == AudioAttributes.USAGE_ALARM ? AudioAttributes.CONTENT_TYPE_SONIFICATION : AudioAttributes.CONTENT_TYPE_MUSIC).build());
        p.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
        return p;
    }
    private void startRing(JSONObject o) {
        stopMedia(); stopRing(false);
        cur = o; ringing = true; ringId = o.optInt("id", -1); ringSince = System.currentTimeMillis();
        ringLabel = o.optString("label", "");
        JSONObject tr = o.optJSONObject("track");
        ringTrack = tr != null && o.optString("src", "music").equals("music") ? tr.optString("t", "") : "";
        dawnId = -1; dawnAt = 0;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.cancel(N_DAWN); nm.cancel(N_SNOOZE);
        prefs(this).edit().remove("snoozeAt").apply();
        // volume du réveil (rétabli à l'arrêt)
        int vol = Math.max(5, Math.min(100, o.optInt("vol", 80)));
        try {
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            savedAlarmVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
            am.setStreamVolume(AudioManager.STREAM_ALARM, Math.max(1, Math.round(max * vol / 100f)), 0);
        } catch (Exception e) { savedAlarmVol = -1; }
        target = 1f; fadeMs = Math.max(0, o.optInt("fade", 30)) * 1000L;
        Uri u = ringTrack.isEmpty() ? defaultTone() : trackUri(tr.optLong("id"));
        if (!play(u)) { ringTrack = ""; play(defaultTone()); }
        focus(AudioAttributes.USAGE_ALARM);
        if (o.optBoolean("vib", true)) vibrate();
        foreground("ring");
        h.post(fader);
        // sécurité : arrêt automatique au bout de 10 minutes
        h.postDelayed(timeout, 10 * 60000L);
        try { startActivity(openIntent("ring")); } catch (Exception e) { }
    }
    private Intent openIntent(String what) {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP); i.putExtra("aube", what); return i;
    }
    private boolean play(Uri u) {
        if (u == null) return false;
        try {
            if (ring != null) { try { ring.release(); } catch (Exception e) { } }
            ring = player(AudioAttributes.USAGE_ALARM);
            ring.setDataSource(getApplicationContext(), u);
            ring.setLooping(true);
            ring.setVolume(fadeMs > 0 ? 0.03f : 1f, fadeMs > 0 ? 0.03f : 1f);
            ring.setOnErrorListener(new MediaPlayer.OnErrorListener() { public boolean onError(MediaPlayer m, int w, int x) { if (!ringTrack.isEmpty()) { ringTrack = ""; play(defaultTone()); } return true; } });
            ring.prepare();
            ring.start();
            return true;
        } catch (Exception e) { return false; }
    }
    private final Runnable fader = new Runnable() { public void run() {
        if (!ringing || ring == null) return;
        long el = System.currentTimeMillis() - ringSince;
        float v = fadeMs <= 0 ? 1f : Math.min(1f, 0.03f + 0.97f * (float) el / fadeMs);
        v = v * v; // montée plus douce au début
        try { ring.setVolume(v * target, v * target); } catch (Exception e) { }
        if (v < 1f) h.postDelayed(this, 250);
    } };
    private final Runnable timeout = new Runnable() { public void run() {
        if (!ringing) return;
        String l = ringLabel;
        stopRing(true);
        MainActivity.postNotif(AlarmService.this, "Réveil non arrêté", "Le réveil" + (l.isEmpty() ? "" : " « " + l + " »") + " a sonné 10 minutes puis s'est arrêté.", N_MISSED);
    } };
    private void vibrate() {
        if (vib == null || !vib.hasVibrator()) return;
        long[] pat = {0, 600, 900, 600, 1800};
        try { if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, 0), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()); else vib.vibrate(pat, 0); } catch (Exception e) { }
    }
    private void stopRing(boolean finish) {
        h.removeCallbacks(fader); h.removeCallbacks(timeout);
        if (ring != null) { try { ring.stop(); } catch (Exception e) { } try { ring.release(); } catch (Exception e) { } ring = null; }
        try { if (vib != null) vib.cancel(); } catch (Exception e) { }
        if (savedAlarmVol >= 0) { try { am.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVol, 0); } catch (Exception e) { } savedAlarmVol = -1; }
        boolean was = ringing;
        ringing = false;
        if (was) abandon();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(N_RING);
        if (finish) finishIfIdle();
    }
    private void snooze() {
        if (!ringing) return;
        int min = cur == null ? 9 : Math.max(1, cur.optInt("snooze", 9));
        long at = System.currentTimeMillis() + min * 60000L;
        JSONObject o = cur;
        stopRing(false);
        try {
            prefs(this).edit().putString("snoozeAlarm", o == null ? "{}" : o.toString()).putLong("snoozeAt", at).apply();
            setAt(this, at, pi(this, "aube.SNOOZE", o == null ? -1 : o.optInt("id", -1), 9000), true);
            String t = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.FRANCE).format(new java.util.Date(at));
            Notification n = new NotificationCompat.Builder(this, CH_INFO).setSmallIcon(getApplicationInfo().icon)
                .setContentTitle("Répétition à " + t).setContentText("Encore " + min + " minutes de repos").setOngoing(true).setSilent(true)
                .setContentIntent(openApp(this, null, 41))
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Annuler la répétition", pi(this, "aube.UNSNOOZE", -1, 9001)).build();
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(N_SNOOZE, n);
        } catch (Exception e) { }
        finishIfIdle();
    }

    // ---------- Écoute d'essai et endormissement ----------
    private void startPreview(JSONObject o) {
        if (ringing) return;
        stopMedia();
        long id = o.optLong("id", 0);
        try {
            media = player(AudioAttributes.USAGE_MEDIA);
            media.setDataSource(getApplicationContext(), id > 0 ? trackUri(id) : defaultTone());
            media.prepare();
            if (id > 0 && media.getDuration() > 60000) media.seekTo(Math.min(30000, media.getDuration() / 4));
            float v = Math.max(0.05f, Math.min(1f, o.optInt("vol", 70) / 100f));
            media.setVolume(v, v);
            media.start(); previewing = true;
            focus(AudioAttributes.USAGE_MEDIA);
            foreground("preview");
            h.postDelayed(previewEnd, 20000);
        } catch (Exception e) { previewing = false; }
    }
    private final Runnable previewEnd = new Runnable() { public void run() { stopMedia(); finishIfIdle(); } };
    private void startSleep(JSONObject o) {
        if (ringing) return;
        stopMedia();
        sleepIds = o.optJSONArray("ids"); if (sleepIds == null || sleepIds.length() == 0) return;
        sleepIdx = 0; sleepVol = Math.max(0.05f, Math.min(1f, o.optInt("vol", 50) / 100f));
        sleepStart = System.currentTimeMillis(); sleepEnd = sleepStart + Math.max(1, o.optInt("min", 30)) * 60000L;
        sleeping = true;
        playSleep();
        focus(AudioAttributes.USAGE_MEDIA);
        foreground("sleep");
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(N_RING, mediaNotif());
        h.post(sleepFader);
    }
    private void playSleep() {
        try {
            if (media != null) { try { media.release(); } catch (Exception e) { } }
            media = player(AudioAttributes.USAGE_MEDIA);
            media.setDataSource(getApplicationContext(), trackUri(sleepIds.getLong(sleepIdx % sleepIds.length())));
            media.setOnCompletionListener(new MediaPlayer.OnCompletionListener() { public void onCompletion(MediaPlayer m) { if (sleeping) { sleepIdx++; playSleep(); } } });
            media.prepare(); media.setVolume(sleepVol, sleepVol); media.start();
        } catch (Exception e) { if (sleeping && sleepIdx < 50) { sleepIdx++; h.postDelayed(new Runnable() { public void run() { if (sleeping) playSleep(); } }, 400); } }
    }
    /** Volume constant la première moitié, puis baisse très progressive jusqu'au silence. */
    private final Runnable sleepFader = new Runnable() { public void run() {
        if (!sleeping) return;
        long now = System.currentTimeMillis(), tot = sleepEnd - sleepStart;
        if (now >= sleepEnd) { stopMedia(); finishIfIdle(); return; }
        float r = (float) (now - sleepStart) / tot;
        float v = r < 0.5f ? sleepVol : sleepVol * (1f - (r - 0.5f) * 2f);
        try { if (media != null) media.setVolume(v, v); } catch (Exception e) { }
        h.postDelayed(this, 1000);
    } };
    private void stopMedia() {
        h.removeCallbacks(previewEnd); h.removeCallbacks(sleepFader);
        boolean was = sleeping || previewing;
        sleeping = false; previewing = false; sleepEnd = 0;
        if (media != null) { try { media.stop(); } catch (Exception e) { } try { media.release(); } catch (Exception e) { } media = null; }
        if (was && !ringing) abandon();
    }

    // ---------- Focus audio ----------
    private void focus(int usage) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                afr = new AudioFocusRequest.Builder(usage == AudioAttributes.USAGE_ALARM ? AudioManager.AUDIOFOCUS_GAIN_TRANSIENT : AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(usage).build()).setOnAudioFocusChangeListener(this).build();
                am.requestAudioFocus(afr);
            } else am.requestAudioFocus(this, usage == AudioAttributes.USAGE_ALARM ? AudioManager.STREAM_ALARM : AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        } catch (Exception e) { }
    }
    private void abandon() {
        try { if (Build.VERSION.SDK_INT >= 26 && afr != null) am.abandonAudioFocusRequest(afr); else am.abandonAudioFocus(this); } catch (Exception e) { }
    }
    @Override public void onAudioFocusChange(int f) {
        // Un appel téléphonique : on baisse le réveil, on ne l'arrête pas
        if (ring != null && ringing) { target = f == AudioManager.AUDIOFOCUS_GAIN ? 1f : 0.15f; try { ring.setVolume(target, target); } catch (Exception e) { } }
        if (media != null && (sleeping || previewing) && f == AudioManager.AUDIOFOCUS_LOSS) { stopMedia(); finishIfIdle(); }
    }
    @Override public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        stopRing(false); stopMedia();
        inst = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
