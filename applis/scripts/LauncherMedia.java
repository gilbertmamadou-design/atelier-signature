package __PKG__;

// Socle : accès aux lecteurs de musique en cours (titre, artiste, pochette, commandes) pour la tuile Musique.
// Android ne donne cet accès qu'à un « service d'écoute des notifications » : celui-ci ne lit ni ne garde les notifications.

import android.service.notification.NotificationListenerService;

public class LauncherMedia extends NotificationListenerService {
    static volatile boolean connected = false;

    @Override public void onListenerConnected() { connected = true; }
    @Override public void onListenerDisconnected() { connected = false; }
}
