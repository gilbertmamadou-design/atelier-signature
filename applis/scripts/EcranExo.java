package __PKG__;

// Écran : lecture par ExoPlayer (AndroidX Media3, Apache 2.0) pour les formats que MediaPlayer ne lit pas (AVI : DivX,
// XviD…). Copié seulement dans l'appli Écran, avec la bibliothèque Media3 (scripts/print-patch.sh).

import android.content.Context;
import android.net.Uri;
import android.view.SurfaceHolder;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.extractor.DefaultExtractorsFactory;
import java.util.Map;

public class EcranExo implements EcranMedia.Backend {
    private ExoPlayer p;
    private EcranMedia.Events ev;
    private boolean ready = false;

    public EcranExo() { }

    public void open(Context c, Uri u, Map<String, String> headers, EcranMedia.Events e) {
        ev = e;
        p = new ExoPlayer.Builder(c).build();
        p.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), false);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true);
        if (headers != null) { String ua = headers.get("User-Agent"); if (ua != null) http.setUserAgent(ua); }
        DefaultExtractorsFactory ex = new DefaultExtractorsFactory().setConstantBitrateSeekingEnabled(true);
        p.setMediaSource(new ProgressiveMediaSource.Factory(new DefaultDataSource.Factory(c, http), ex).createMediaSource(MediaItem.fromUri(u)));
        p.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int st) {
                if (ev == null) return;
                if (st == Player.STATE_READY) { if (!ready) { ready = true; ev.onPrepared(); } else ev.onBuffering(false); }
                else if (st == Player.STATE_BUFFERING && ready) ev.onBuffering(true);
                else if (st == Player.STATE_ENDED) ev.onCompletion();
            }
            @Override public void onVideoSizeChanged(VideoSize v) {
                if (ev != null && v.width > 0 && v.height > 0) ev.onSize(Math.round(v.width * (v.pixelWidthHeightRatio > 0 ? v.pixelWidthHeightRatio : 1f)), v.height);
            }
            @Override public void onPlayerError(PlaybackException err) { if (ev != null) ev.onError(); }
        });
        p.setPlayWhenReady(false);
        p.prepare();
    }
    public void setDisplay(SurfaceHolder h) { if (h == null) p.clearVideoSurface(); else p.setVideoSurfaceHolder(h); }
    public void start() { if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(0); p.play(); }
    public void pause() { p.pause(); }
    public boolean isPlaying() { return p.getPlayWhenReady() && p.getPlaybackState() != Player.STATE_ENDED && p.getPlaybackState() != Player.STATE_IDLE; }
    public void seekTo(int ms, boolean exact) { p.setSeekParameters(exact ? SeekParameters.EXACT : SeekParameters.DEFAULT); p.seekTo(ms); }
    public int getCurrentPosition() { return (int) Math.max(0, p.getCurrentPosition()); }
    public int getDuration() { long d = p.getDuration(); return d == C.TIME_UNSET ? -1 : (int) d; }
    public int getVideoWidth() { VideoSize v = p.getVideoSize(); return Math.round(v.width * (v.pixelWidthHeightRatio > 0 ? v.pixelWidthHeightRatio : 1f)); }
    public int getVideoHeight() { return p.getVideoSize().height; }
    public void setSpeed(float s) { p.setPlaybackSpeed(s); }
    public void release() { ev = null; try { p.release(); } catch (Exception e) { } }
}
