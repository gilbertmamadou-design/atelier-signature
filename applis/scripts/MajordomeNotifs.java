package __PKG__;

/* =====================================================================
   Majordome › messages reçus : lecture des notifications de messagerie (WhatsApp, SMS, Messenger, Telegram, Signal,
   Outlook, Gmail, Teams…), copié dans Majordome seulement (print-patch.sh).
   - Il faut autoriser Majordome dans Android › Accès aux notifications (bouton dans Réglages › Messages).
   - Chaque message (expéditeur, texte, heure, appli) est gardé dans l'appli seulement (préférences « mj_notifs »,
     80 au plus, 4 jours au plus) ; rien ne part ailleurs. MajordomeBridge les lit (notifList) et répond (notifReply).
   - Réponse : par le bouton « Répondre » de la notification (RemoteInput), tant qu'elle est affichée.
   - Nouveau message : événement « notif » vers la page si Majordome est ouvert (annonce à voix haute selon les réglages).
   ===================================================================== */

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class MajordomeNotifs extends NotificationListenerService {
    static final String PREF = "mj_notifs";
    static final int MAX = 80;
    static final long AGE = 4L * 24 * 3600 * 1000;
    static volatile MajordomeNotifs live = null;
    /** clé de la notification → action « Répondre » (perdue si la notification disparaît) */
    static final Map<String, Notification.Action> REPLY = new ConcurrentHashMap<>();
    static final Set<String> APPS = new HashSet<>(Arrays.asList(
        "com.whatsapp", "com.whatsapp.w4b", "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
        "com.facebook.orca", "com.facebook.mlite", "org.telegram.messenger", "org.thoughtcrime.securesms", "com.instagram.android",
        "com.microsoft.office.outlook", "com.google.android.gm", "com.microsoft.teams", "com.samsung.android.email.provider",
        "com.android.email", "ch.protonmail.android", "com.viber.voip", "com.snapchat.android", "com.discord", "com.Slack"));
    static final Object LOCK = new Object();

    @Override public void onListenerConnected() {
        live = this;
        try { StatusBarNotification[] l = getActiveNotifications(); if (l != null) for (StatusBarNotification s : l) ingest(s, false); } catch (Throwable t) { }
    }
    @Override public void onListenerDisconnected() { live = null; }
    @Override public void onNotificationPosted(StatusBarNotification sbn) { try { ingest(sbn, true); } catch (Throwable t) { } }
    @Override public void onNotificationRemoved(StatusBarNotification sbn) { try { REPLY.remove(sbn.getKey()); } catch (Throwable t) { } }

    static String cs(CharSequence c) { return c == null ? null : c.toString().trim(); }

    private String label(String pkg) {
        try { PackageManager pm = getPackageManager(); return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString(); } catch (Throwable t) { return pkg; }
    }

    void ingest(StatusBarNotification sbn, boolean announce) throws Exception {
        String pkg = sbn.getPackageName();
        if (pkg == null || pkg.equals(getPackageName()) || sbn.isOngoing()) return;
        Notification n = sbn.getNotification(); if (n == null) return;
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle x = n.extras; if (x == null) return;
        String cat = n.category;
        boolean style = x.containsKey(Notification.EXTRA_MESSAGES);
        boolean mail = Notification.CATEGORY_EMAIL.equals(cat) || pkg.contains("outlook") || pkg.equals("com.google.android.gm") || pkg.contains(".email") || pkg.contains("mail");
        if (!(style || APPS.contains(pkg) || Notification.CATEGORY_MESSAGE.equals(cat) || mail)) return;
        String app = label(pkg);
        String conv = cs(x.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE));
        String title = cs(x.getCharSequence(Notification.EXTRA_TITLE));
        boolean group = conv != null;
        if (Build.VERSION.SDK_INT >= 28) group = group && x.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, true);
        JSONArray add = new JSONArray();
        Parcelable[] ms = x.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (ms != null && ms.length > 0) {
            for (Parcelable p : ms) {
                if (!(p instanceof Bundle)) continue;
                Bundle b = (Bundle) p;
                String text = cs(b.getCharSequence("text"));
                String from = cs(b.getCharSequence("sender"));
                if (from == null && Build.VERSION.SDK_INT >= 28) {
                    try { android.app.Person ps = b.getParcelable("sender_person"); if (ps != null) from = cs(ps.getName()); } catch (Throwable t) { }
                }
                if (text == null || text.isEmpty() || from == null) continue;      // sans expéditeur : c'est un message envoyé par soi-même
                long time = b.getLong("time", sbn.getPostTime());
                add.put(item(pkg, app, from, group ? conv : null, text, time, mail, sbn.getKey()));
            }
        } else {
            CharSequence[] lines = x.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null && lines.length > 0) {
                for (CharSequence l : lines) { String s = cs(l); if (s != null && !s.isEmpty()) add.put(item(pkg, app, title, null, s, sbn.getPostTime(), mail, sbn.getKey())); }
            } else {
                String text = cs(x.getCharSequence(Notification.EXTRA_BIG_TEXT));
                if (text == null) text = cs(x.getCharSequence(Notification.EXTRA_TEXT));
                if (title == null || text == null || text.isEmpty()) return;
                if (mail) { String sub = cs(x.getCharSequence(Notification.EXTRA_TEXT)); if (sub != null && !text.startsWith(sub)) text = sub + ". " + text; }
                add.put(item(pkg, app, title, null, text, sbn.getPostTime(), mail, sbn.getKey()));
            }
        }
        if (add.length() == 0) return;
        // bouton « Répondre » de la notification
        if (n.actions != null) for (Notification.Action a : n.actions) {
            RemoteInput[] ri = a.getRemoteInputs();
            if (ri != null && ri.length > 0 && a.actionIntent != null) { boolean free = false; for (RemoteInput r : ri) if (r.getAllowFreeFormInput()) free = true; if (free) { REPLY.put(sbn.getKey(), a); break; } }
        }
        boolean canReply = REPLY.containsKey(sbn.getKey());
        JSONArray fresh = store(this, add, canReply);
        if (announce && fresh.length() > 0) MajordomeBridge.send("notif", fresh.toString());
    }

    static JSONObject item(String pkg, String app, String from, String conv, String text, long time, boolean mail, String key) throws Exception {
        JSONObject o = new JSONObject();
        o.put("pkg", pkg); o.put("app", app); o.put("from", from); if (conv != null && !conv.equals(from)) o.put("conv", conv);
        o.put("text", text.length() > 1200 ? text.substring(0, 1200) + "…" : text); o.put("t", time); o.put("mail", mail); o.put("key", key);
        o.put("id", Integer.toHexString((pkg + "|" + from + "|" + text + "|" + (time / 1000)).hashCode()));
        return o;
    }

    /** Ajoute les messages nouveaux ; renvoie ceux qui l'étaient vraiment */
    static JSONArray store(Context c, JSONArray add, boolean canReply) throws Exception {
        synchronized (LOCK) {
            SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(p.getString("l", "[]")), out = new JSONArray(), fresh = new JSONArray();
            Set<String> ids = new HashSet<>();
            long now = System.currentTimeMillis();
            for (int i = 0; i < old.length(); i++) { JSONObject o = old.getJSONObject(i); if (now - o.optLong("t") < AGE) { ids.add(o.optString("id")); out.put(o); } }
            for (int i = 0; i < add.length(); i++) {
                JSONObject o = add.getJSONObject(i); o.put("reply", canReply);
                if (ids.contains(o.optString("id"))) {
                    // même message déjà connu : on met à jour la clé de la notification (pour répondre)
                    for (int k = 0; k < out.length(); k++) { JSONObject e = out.getJSONObject(k); if (e.optString("id").equals(o.optString("id"))) { e.put("key", o.optString("key")); e.put("reply", canReply); } }
                    continue;
                }
                ids.add(o.optString("id")); out.put(o); fresh.put(o);
            }
            // les plus récents seulement
            JSONArray trimmed = new JSONArray(); int start = Math.max(0, out.length() - MAX);
            for (int i = start; i < out.length(); i++) trimmed.put(out.get(i));
            p.edit().putString("l", trimmed.toString()).apply();
            return fresh;
        }
    }

    static String list(Context c) { return c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString("l", "[]"); }
    static void clear(Context c) { c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().remove("l").apply(); }

    /** Répond par le bouton « Répondre » de la notification : ok | absent | erreur */
    static String reply(Context c, String key, String text) {
        Notification.Action a = REPLY.get(key);
        if (a == null) return "absent";
        try {
            RemoteInput[] ri = a.getRemoteInputs();
            Intent i = new Intent(); Bundle b = new Bundle();
            for (RemoteInput r : ri) b.putCharSequence(r.getResultKey(), text);
            RemoteInput.addResultsToIntent(ri, i, b);
            a.actionIntent.send(c, 0, i);
            return "ok";
        } catch (PendingIntent.CanceledException e) { REPLY.remove(key); return "absent"; }
        catch (Throwable t) { return "erreur"; }
    }
}
