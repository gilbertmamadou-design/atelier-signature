package __PKG__;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Égaliseur de Mélodie (effets audio d'Android sur la session du lecteur) : préréglages du téléphone ou bandes
 * réglées à la main, renfort des basses. Réglages dans les préférences « melodie_eq » ; MusicService appelle
 * attach() à chaque morceau prêt, MelodieBridge lit et modifie les réglages (eqInfo, eqSet).
 */
public class MelodieEq {
    static Equalizer eq; static BassBoost bb; static int session = -1;

    static SharedPreferences p(Context c) { return c.getSharedPreferences("melodie_eq", Context.MODE_PRIVATE); }

    static synchronized void attach(Context c, int s) {
        if (s != session) { release(); session = s; }
        apply(c);
    }
    static synchronized void apply(Context c) {
        SharedPreferences pr = p(c);
        if (!pr.getBoolean("on", false) || session < 0) { release(); return; }
        try { if (eq == null) eq = new Equalizer(0, session); } catch (Throwable t) { eq = null; }
        try { if (bb == null) bb = new BassBoost(0, session); } catch (Throwable t) { bb = null; }
        if (eq != null) try {
            int preset = pr.getInt("preset", -1);
            if (preset >= 0 && preset < eq.getNumberOfPresets()) eq.usePreset((short) preset);
            else {
                String[] l = pr.getString("bands", "").split(",");
                short[] r = eq.getBandLevelRange();
                for (short b = 0; b < eq.getNumberOfBands() && b < l.length; b++) {
                    try { int v = Integer.parseInt(l[b].trim()); eq.setBandLevel(b, (short) Math.max(r[0], Math.min(r[1], v))); } catch (Throwable t) { }
                }
            }
            eq.setEnabled(true);
        } catch (Throwable t) { }
        if (bb != null) try {
            int s = Math.max(0, Math.min(1000, pr.getInt("bass", 0)));
            if (bb.getStrengthSupported()) bb.setStrength((short) s);
            bb.setEnabled(s > 0);
        } catch (Throwable t) { }
    }
    static synchronized void release() {
        try { if (eq != null) eq.release(); } catch (Throwable t) { }
        try { if (bb != null) bb.release(); } catch (Throwable t) { }
        eq = null; bb = null;
    }
    /** Description pour la page : bandes (Hz, niveau en millibels), plage, préréglages, basses */
    static synchronized String info(Context c) {
        JSONObject o = new JSONObject();
        Equalizer e = eq, tmp = null;
        try {
            SharedPreferences pr = p(c);
            o.put("on", pr.getBoolean("on", false)).put("preset", pr.getInt("preset", -1)).put("bass", pr.getInt("bass", 0)).put("playing", session >= 0);
            if (e == null) { try { tmp = new Equalizer(0, session >= 0 ? session : 0); e = tmp; } catch (Throwable t) { e = null; } }
            if (e != null) {
                short[] r = e.getBandLevelRange(); o.put("min", r[0]).put("max", r[1]);
                JSONArray ps = new JSONArray(); for (short i = 0; i < e.getNumberOfPresets(); i++) ps.put(e.getPresetName(i)); o.put("presets", ps);
                String[] saved = pr.getString("bands", "").split(",");
                JSONArray bs = new JSONArray();
                for (short b = 0; b < e.getNumberOfBands(); b++) {
                    int lv = 0; try { lv = b < saved.length && !saved[b].trim().isEmpty() ? Integer.parseInt(saved[b].trim()) : 0; } catch (Throwable t) { }
                    if (tmp == null && pr.getInt("preset", -1) >= 0) lv = e.getBandLevel(b);
                    bs.put(new JSONObject().put("hz", e.getCenterFreq(b) / 1000).put("level", lv));
                }
                o.put("bands", bs);
            } else o.put("unsupported", true);
        } catch (Throwable t) { }
        finally { try { if (tmp != null) tmp.release(); } catch (Throwable t) { } }
        return o.toString();
    }
    /** {on, preset, bands:[mB…], bass} : champs absents inchangés */
    static void set(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json); SharedPreferences.Editor ed = p(c).edit();
            if (o.has("on")) ed.putBoolean("on", o.getBoolean("on"));
            if (o.has("preset")) ed.putInt("preset", o.getInt("preset"));
            if (o.has("bass")) ed.putInt("bass", o.getInt("bass"));
            if (o.has("bands")) { JSONArray b = o.getJSONArray("bands"); StringBuilder s = new StringBuilder(); for (int i = 0; i < b.length(); i++) { if (i > 0) s.append(','); s.append(b.getInt(i)); } ed.putString("bands", s.toString()); }
            ed.apply();
        } catch (Throwable t) { }
        apply(c);
    }
}
