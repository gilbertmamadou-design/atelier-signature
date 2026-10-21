package __PKG__;

// Socle : service d'accessibilité minimal, utilisé seulement pour verrouiller l'écran (double appui)
// et ouvrir le volet des notifications (glisser vers le bas). Il ne lit pas le contenu de l'écran.

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

public class LauncherA11y extends AccessibilityService {
    static volatile LauncherA11y instance;

    @Override
    protected void onServiceConnected() { instance = this; }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) { }

    @Override
    public void onInterrupt() { }

    @Override
    public void onDestroy() { instance = null; super.onDestroy(); }

    @Override
    public boolean onUnbind(android.content.Intent i) { instance = null; return super.onUnbind(i); }
}
