package __PKG__;

// Toile : tuile « Fond suivant » dans les réglages rapides (volet de notifications)

import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.widget.Toast;

public class WallpaperTile extends TileService {
    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setLabel("Fond suivant");
        t.setState(Tile.STATE_INACTIVE);
        t.updateTile();
    }

    @Override
    public void onClick() {
        try {
            WallpaperJob.runSoon(getApplicationContext(), WallpaperJob.JOB_NOW);
            Toast.makeText(getApplicationContext(), "Nouveau fond d'écran…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(getApplicationContext(), "Ouvre Toile pour choisir un dossier", Toast.LENGTH_LONG).show();
        }
    }
}
