package __PKG__;

// Socle : démarrage du téléphone.
//  - LOCKED_BOOT_COMPLETED (avant le premier déverrouillage) : ce récepteur est « directBootAware » ; le recevoir suffit
//    à lancer le processus de Socle à l'avance. Rien d'autre n'est fait ici : les données de Socle (stockage chiffré)
//    ne sont pas encore lisibles. Après le déverrouillage, Android ouvre l'accueil dans ce processus déjà prêt.
//  - BOOT_COMPLETED (après le déverrouillage) : si l'écran d'accueil n'est pas encore créé, on précharge le moteur
//    d'affichage (WebView) pour qu'il soit prêt quand Socle s'affiche.

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class SocleBoot extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        try {
            if (i == null || !Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())) return;
            if (SocleBridge.created) return;
            android.webkit.WebSettings.getDefaultUserAgent(c);
        } catch (Throwable t) { }
    }
}
