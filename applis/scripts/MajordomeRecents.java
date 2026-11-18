package __PKG__;

// Majordome : widgets Android « Applis récentes » (tout le téléphone) et « Ma Suite récente » (applis fr.magformation13.*).
//  - 8 cases (2 rangées de 4) : icône et nom ; un appui ouvre l'appli ; bouton ↻ pour rafraîchir.
//  - Ordre récent : statistiques d'utilisation d'Android (UsageStatsManager, 7 derniers jours). Elles demandent l'« accès à
//    l'utilisation », donné une fois par l'utilisateur dans les réglages d'Android (le widget affiche un lien tant qu'il manque).
//    Sans cet accès : « Applis récentes » n'affiche que le lien ; « Ma Suite » affiche les applis de la Suite par ordre alphabétique.
//  - Mises à jour : toutes les 30 min au plus (système), au retour dans Majordome, et avec le bouton ↻. Aucune requête réseau,
//    rien n'est envoyé : seuls les noms des applis récentes servent à l'affichage.

import android.app.AppOpsManager;
import android.app.PendingIntent;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.view.View;
import android.widget.RemoteViews;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class MajordomeRecents extends AppWidgetProvider {
    static final String REFRESH = "__PKG__.RECENTS_REFRESH";
    static final String SUITE = "fr.magformation13.";
    static final int N = 8;

    boolean suite() { return false; }
    /** Variante « Ma Suite récente » : même code, filtrée sur les applis de la Suite */
    public static class Suite extends MajordomeRecents { @Override boolean suite() { return true; } }

    static int res(Context c, String type, String name) { return c.getResources().getIdentifier(name, type, c.getPackageName()); }

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = build(c, suite());
        for (int id : ids) try { m.updateAppWidget(id, v); } catch (Throwable t) { }
    }
    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (REFRESH.equals(i.getAction())) refreshAll(c);
    }
    /** Met à jour tous les widgets des deux sortes (appelé aussi au retour dans Majordome) */
    static void refreshAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] a = m.getAppWidgetIds(new ComponentName(c, MajordomeRecents.class));
            int[] b = m.getAppWidgetIds(new ComponentName(c, Suite.class));
            if (a.length > 0) { RemoteViews v = build(c, false); for (int id : a) m.updateAppWidget(id, v); }
            if (b.length > 0) { RemoteViews v = build(c, true); for (int id : b) m.updateAppWidget(id, v); }
        } catch (Throwable t) { }
    }

    static boolean usageOk(Context c) {
        try {
            AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            int mode = Build.VERSION.SDK_INT >= 29 ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
                                                   : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Throwable t) { return false; }
    }

    /** Applis qu'on peut ouvrir (icône dans le lanceur), sans le lanceur lui-même ni Majordome */
    static Set<String> launchable(Context c) {
        PackageManager pm = c.getPackageManager();
        Set<String> out = new HashSet<>();
        Intent li = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo r : pm.queryIntentActivities(li, 0)) out.add(r.activityInfo.packageName);
        try {
            ResolveInfo home = pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY);
            if (home != null) out.remove(home.activityInfo.packageName);
        } catch (Throwable t) { }
        out.remove(c.getPackageName());
        return out;
    }

    static List<String> recent(Context c, boolean suite) {
        final PackageManager pm = c.getPackageManager();
        Set<String> ok = launchable(c);
        List<String> out = new ArrayList<>();
        if (usageOk(c)) {
            UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
            long now = System.currentTimeMillis();
            final Map<String, Long> last = new HashMap<>();
            List<UsageStats> l = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 7L * 86400000L, now);
            if (l != null) for (UsageStats u : l) {
                String p = u.getPackageName();
                if (u.getLastTimeUsed() <= 0 || !ok.contains(p) || (suite && !p.startsWith(SUITE))) continue;
                Long o = last.get(p); if (o == null || u.getLastTimeUsed() > o) last.put(p, u.getLastTimeUsed());
            }
            out.addAll(last.keySet());
            Collections.sort(out, new Comparator<String>() { public int compare(String x, String y) { return Long.compare(last.get(y), last.get(x)); } });
        }
        if (out.isEmpty() && suite) {   // sans accès à l'utilisation : la Suite par ordre alphabétique
            for (String p : ok) if (p.startsWith(SUITE)) out.add(p);
            final Collator col = Collator.getInstance(Locale.FRENCH);
            Collections.sort(out, new Comparator<String>() { public int compare(String x, String y) { return col.compare(label(pm, x), label(pm, y)); } });
        }
        return out.size() > N ? out.subList(0, N) : out;
    }
    static String label(PackageManager pm, String p) {
        try { ApplicationInfo ai = pm.getApplicationInfo(p, 0); return String.valueOf(pm.getApplicationLabel(ai)); } catch (Throwable t) { return p; }
    }
    static Bitmap icon(PackageManager pm, String p, int px) {
        try {
            Drawable d = pm.getApplicationIcon(p);
            Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(b); d.setBounds(0, 0, px, px); d.draw(cv);
            return b;
        } catch (Throwable t) { return null; }
    }

    static RemoteViews build(Context c, boolean suite) {
        PackageManager pm = c.getPackageManager();
        RemoteViews v = new RemoteViews(c.getPackageName(), res(c, "layout", "mj_recents"));
        v.setTextViewText(res(c, "id", "rec_title"), suite ? "Ma Suite · récentes" : "Applis récentes");
        boolean perm = usageOk(c);
        List<String> l = recent(c, suite);
        int px = (int) (44 * c.getResources().getDisplayMetrics().density);
        for (int i = 0; i < N; i++) {
            int slot = res(c, "id", "rec_s" + i), ic = res(c, "id", "rec_i" + i), tx = res(c, "id", "rec_t" + i);
            if (i < l.size()) {
                String p = l.get(i);
                Bitmap b = icon(pm, p, px);
                if (b != null) v.setImageViewBitmap(ic, b);
                v.setTextViewText(tx, label(pm, p));
                Intent li = pm.getLaunchIntentForPackage(p);
                if (li != null) {
                    li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    v.setOnClickPendingIntent(slot, PendingIntent.getActivity(c, (suite ? 100 : 0) + i, li, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
                }
                v.setViewVisibility(slot, View.VISIBLE);
            } else v.setViewVisibility(slot, View.INVISIBLE);
        }
        int hint = res(c, "id", "rec_hint");
        if (!perm) {
            v.setTextViewText(hint, suite ? "Ordre alphabétique : touchez ici et autorisez Majordome dans « Accès à l'utilisation » pour voir les plus récentes."
                                          : "Touchez ici et autorisez Majordome dans « Accès à l'utilisation » pour afficher vos applis récentes.");
            Intent s = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(hint, PendingIntent.getActivity(c, suite ? 291 : 290, s, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            v.setViewVisibility(hint, View.VISIBLE);
        } else if (l.isEmpty()) {
            v.setTextViewText(hint, "Aucune appli utilisée ces 7 derniers jours.");
            v.setViewVisibility(hint, View.VISIBLE);
        } else v.setViewVisibility(hint, View.GONE);
        Intent r = new Intent(c, MajordomeRecents.class).setAction(REFRESH);
        v.setOnClickPendingIntent(res(c, "id", "rec_refresh"), PendingIntent.getBroadcast(c, suite ? 281 : 280, r, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
