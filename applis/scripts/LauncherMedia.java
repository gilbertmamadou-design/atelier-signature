package __PKG__;

// Socle : accès aux lecteurs de musique en cours (titre, artiste, pochette, commandes) pour la tuile Musique,
// et résumé des notifications par appli pour les tuiles d'applis (appels manqués, messages non lus : nombre,
// dernier titre). Android ne donne ces accès qu'à un « service d'écoute des notifications ». Rien n'est
// enregistré ni envoyé : le résumé est lu à la demande de l'écran d'accueil et reste sur le téléphone.

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;

public class LauncherMedia extends NotificationListenerService {
    static volatile boolean connected = false;
    static volatile LauncherMedia inst = null;

    @Override public void onListenerConnected() { connected = true; inst = this; }
    @Override public void onListenerDisconnected() { connected = false; inst = null; }

    // { "paquet": { "n": nombre, "title": dernier titre, "text": dernier texte, "t": heure } }
    // seulement les notifications qu'on peut effacer (pas les « en cours » : musique, navigation, téléchargements…)
    // et pas les résumés de groupe (sinon un message compterait deux fois)
    static String counts() {
        JSONObject o = new JSONObject();
        try {
            LauncherMedia s = inst;
            if (s == null) return "{\"off\":true}";
            StatusBarNotification[] l = s.getActiveNotifications();
            if (l == null) return o.toString();
            for (StatusBarNotification sb : l) {
                Notification n = sb.getNotification();
                if (n == null || !sb.isClearable() || sb.isOngoing()) continue;
                if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) continue;
                String pkg = sb.getPackageName();
                Bundle e = n.extras;
                String title = e == null ? "" : String.valueOf(e.getCharSequence(Notification.EXTRA_TITLE, ""));
                String text = e == null ? "" : String.valueOf(e.getCharSequence(Notification.EXTRA_TEXT, ""));
                JSONObject p = o.optJSONObject(pkg);
                if (p == null) { p = new JSONObject(); p.put("n", 0); p.put("t", 0L); o.put(pkg, p); }
                p.put("n", p.optInt("n") + Math.max(1, n.number > 0 && n.number < 1000 ? n.number : 1));
                if (sb.getPostTime() >= p.optLong("t")) { p.put("t", sb.getPostTime()); p.put("title", title); p.put("text", text.length() > 120 ? text.substring(0, 120) : text); }
            }
        } catch (Throwable t) { }
        return o.toString();
    }
}
