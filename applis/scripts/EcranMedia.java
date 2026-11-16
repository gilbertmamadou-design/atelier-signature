package __PKG__;

// Écran : moteur de lecture interchangeable.
// - Natif (android.media.MediaPlayer) : MP4, MKV, WebM, 3GP, HLS… ;
// - ExoPlayer (Media3, classe EcranExo, présente seulement dans l'appli Écran) : formats que MediaPlayer ne lit pas,
//   comme l'AVI (DivX, XviD), et second essai quand un fichier local refuse de s'ouvrir.

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.view.SurfaceHolder;
import java.util.Map;

public class EcranMedia {
    public interface Events {
        void onPrepared();
        void onSize(int w, int h);
        void onCompletion();
        void onError();
        void onBuffering(boolean on);
        void onBufferPct(int pct);
    }
    public interface Backend {
        void open(Context c, Uri u, Map<String, String> headers, Events ev) throws Exception;
        void setDisplay(SurfaceHolder h);
        void start();
        void pause();
        boolean isPlaying();
        void seekTo(int ms, boolean exact);
        int getCurrentPosition();
        int getDuration();
        int getVideoWidth();
        int getVideoHeight();
        void setSpeed(float s);
        void release();
    }

    /** ExoPlayer disponible (appli Écran) ? */
    public static boolean hasExo() {
        try { Class.forName(EcranMedia.class.getPackage().getName() + ".EcranExo"); return true; } catch (Throwable t) { return false; }
    }
    public static Backend create(boolean exo) {
        if (exo) {
            try { return (Backend) Class.forName(EcranMedia.class.getPackage().getName() + ".EcranExo").getConstructor().newInstance(); } catch (Throwable t) { }
        }
        return new Native();
    }

    /** Lecteur natif d'Android */
    public static class Native implements Backend {
        private MediaPlayer mp;
        private Events ev;
        public void open(Context c, Uri u, Map<String, String> headers, Events e) throws Exception {
            ev = e;
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            mp.setDataSource(c, u, headers);
            mp.setScreenOnWhilePlaying(true);
            mp.setOnPreparedListener(m -> { if (ev != null) ev.onPrepared(); });
            mp.setOnVideoSizeChangedListener((m, w, h) -> { if (ev != null) ev.onSize(w, h); });
            mp.setOnCompletionListener(m -> { if (ev != null) ev.onCompletion(); });
            mp.setOnErrorListener((m, what, extra) -> { if (ev != null) ev.onError(); return true; });
            mp.setOnInfoListener((m, what, extra) -> {
                if (ev == null) return false;
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) ev.onBuffering(true);
                else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) ev.onBuffering(false);
                return false;
            });
            mp.setOnBufferingUpdateListener((m, pct) -> { if (ev != null) ev.onBufferPct(pct); });
            mp.prepareAsync();
        }
        public void setDisplay(SurfaceHolder h) { try { mp.setDisplay(h); } catch (Exception e) { } }
        public void start() { mp.start(); }
        public void pause() { mp.pause(); }
        public boolean isPlaying() { try { return mp.isPlaying(); } catch (Exception e) { return false; } }
        public void seekTo(int ms, boolean exact) {
            if (exact && Build.VERSION.SDK_INT >= 26) mp.seekTo(ms, MediaPlayer.SEEK_CLOSEST); else mp.seekTo(ms);
        }
        public int getCurrentPosition() { return mp.getCurrentPosition(); }
        public int getDuration() { return mp.getDuration(); }
        public int getVideoWidth() { return mp.getVideoWidth(); }
        public int getVideoHeight() { return mp.getVideoHeight(); }
        public void setSpeed(float s) { try { mp.setPlaybackParams(mp.getPlaybackParams().setSpeed(s)); } catch (Exception e) { } }
        public void release() { ev = null; try { mp.stop(); } catch (Exception e) { } try { mp.release(); } catch (Exception e) { } }
    }
}
