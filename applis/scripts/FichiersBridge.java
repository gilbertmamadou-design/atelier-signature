package __PKG__;

import android.app.Activity;
import android.graphics.BitmapFactory;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.File;
import org.json.JSONObject;

/** Rangement : propriétés détaillées d'un fichier (dimensions, durée, prise de vue). Lecture seule. */
public class FichiersBridge {
    final Activity a; final WebView wv;
    public FichiersBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    @JavascriptInterface
    public String meta(String path) {
        JSONObject o = new JSONObject();
        try {
            File f = new File(path);
            if (!f.isFile()) return o.toString();
            String n = path.toLowerCase();
            if (n.matches(".*\\.(jpe?g|png|gif|webp|bmp|heic|heif|dng)$")) {
                BitmapFactory.Options op = new BitmapFactory.Options(); op.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(path, op);
                int w = op.outWidth, h = op.outHeight;
                try {
                    ExifInterface ex = new ExifInterface(path);
                    int or = ex.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
                    if (or >= 5 && or <= 8) { int t = w; w = h; h = t; }
                    String dt = ex.getAttribute("DateTimeOriginal");
                    if (dt == null) dt = ex.getAttribute(ExifInterface.TAG_DATETIME);
                    if (dt != null) o.put("taken", dt);
                    String mk = ex.getAttribute(ExifInterface.TAG_MAKE), md = ex.getAttribute(ExifInterface.TAG_MODEL);
                    String cam = ((mk == null ? "" : mk.trim()) + " " + (md == null ? "" : md.trim())).trim();
                    if (!cam.isEmpty()) o.put("camera", cam);
                } catch (Throwable e) { }
                if (w > 0 && h > 0) { o.put("w", w); o.put("h", h); }
            } else if (n.matches(".*\\.(mp4|mkv|mov|3gp|webm|avi|m4v|mp3|m4a|aac|flac|ogg|oga|opus|wav|amr|3ga)$")) {
                MediaMetadataRetriever r = new MediaMetadataRetriever();
                try {
                    r.setDataSource(path);
                    String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                    if (d != null) o.put("dur", Long.parseLong(d));
                    String w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH), h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                    String rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                    if (w != null && h != null) {
                        int W = Integer.parseInt(w), H = Integer.parseInt(h);
                        if ("90".equals(rot) || "270".equals(rot)) { int t = W; W = H; H = t; }
                        o.put("w", W); o.put("h", H);
                    }
                    String ti = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE), ar = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                    if (ti != null) o.put("title", ti);
                    if (ar != null) o.put("artist", ar);
                } catch (Throwable e) { }
                try { r.release(); } catch (Throwable e) { }
            }
        } catch (Throwable e) { }
        return o.toString();
    }
}
