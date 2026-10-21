package __PKG__;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import java.util.Calendar;
import org.json.JSONObject;

/** Aube : reçoit les alarmes programmées, le redémarrage du téléphone et les changements d'heure. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) {
        String a = in.getAction(); if (a == null) return;
        int id = in.getIntExtra("id", -1);
        try {
            switch (a) {
                case "aube.RING": {
                    JSONObject o = AlarmService.find(c, id);
                    if (o == null) { AlarmService.reschedule(c); return; }
                    // Réveil « une fois » : désactivé après avoir sonné ; « passer le prochain » : effacé
                    org.json.JSONArray d = o.optJSONArray("days");
                    if (d == null || d.length() == 0) o.put("on", false);
                    if (o.optString("skip", "").length() > 0 && o.optString("skip").compareTo(AlarmService.day(Calendar.getInstance())) <= 0) o.remove("skip");
                    if (o.optBoolean("tmp", false)) o.put("on", false);
                    AlarmService.put(c, o);
                    AlarmService.reschedule(c);
                    AlarmService.start(c, new Intent("ring").putExtra("id", id));
                    break;
                }
                case "aube.SNOOZE": {
                    String js = AlarmService.prefs(c).getString("snoozeAlarm", null);
                    AlarmService.prefs(c).edit().remove("snoozeAt").apply();
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(AlarmService.N_SNOOZE);
                    AlarmService.start(c, new Intent("test").putExtra("json", js == null ? "{\"label\":\"Réveil\"}" : js));
                    break;
                }
                case "aube.UNSNOOZE": {
                    android.app.AlarmManager m = (android.app.AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                    m.cancel(AlarmService.pi(c, "aube.SNOOZE", -1, 9000));
                    AlarmService.prefs(c).edit().remove("snoozeAt").apply();
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(AlarmService.N_SNOOZE);
                    break;
                }
                case "aube.DAWN": {
                    JSONObject o = AlarmService.find(c, id);
                    if (o == null || !o.optBoolean("on", false)) return;
                    int dawn = o.optInt("dawn", 0);
                    AlarmService.dawnId = id; AlarmService.dawnAt = System.currentTimeMillis();
                    AlarmService.dawnRing = System.currentTimeMillis() + dawn * 60000L;
                    AlarmService.channels(c);
                    Notification n = new NotificationCompat.Builder(c, AlarmService.CH_INFO)
                        .setSmallIcon(c.getApplicationInfo().icon).setContentTitle("🌅 Lever de soleil")
                        .setContentText("La lumière monte doucement avant votre réveil")
                        .setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_HIGH).setSilent(true)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setAutoCancel(true)
                        .setContentIntent(AlarmService.openApp(c, "dawn", 51)).setFullScreenIntent(AlarmService.openApp(c, "dawn", 52), true)
                        .setTimeoutAfter(dawn * 60000L + 60000L).build();
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(AlarmService.N_DAWN, n);
                    break;
                }
                default: // démarrage du téléphone, mise à jour, changement d'heure ou de fuseau
                    AlarmService.reschedule(c);
                    long at = AlarmService.prefs(c).getLong("snoozeAt", 0);
                    if (at > System.currentTimeMillis()) AlarmService.setAt(c, at, AlarmService.pi(c, "aube.SNOOZE", -1, 9000), true);
            }
        } catch (Exception e) { }
    }
}
