package __PKG__;

/* Wi-Fi : état de la connexion (signal, bande, canal, débit du lien, box), réseaux voisins et occupation des canaux,
   test de débit (Cloudflare) et de réactivité (internet et box). Page : MAGWifi ; événements window.wifiEvent(json).
   Android ne laisse pas une appli régler la box : l'appli mesure et conseille, les réglages se font dans l'interface de la box. */

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.util.List;

public class WifiBridge {
    private static final int REQ = 7351;
    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile boolean testing = false;

    public WifiBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv;
        IntentFilter f = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
        f.addAction(WifiManager.RSSI_CHANGED_ACTION); f.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        try { if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(rx, f, Context.RECEIVER_EXPORTED); else a.registerReceiver(rx, f); } catch (Throwable t) { }
    }
    private WifiManager wm() { return (WifiManager) a.getApplicationContext().getSystemService(Context.WIFI_SERVICE); }
    private boolean has(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private String[] needed() {
        if (Build.VERSION.SDK_INT >= 33) return new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, "android.permission.NEARBY_WIFI_DEVICES" };
        return new String[]{ Manifest.permission.ACCESS_FINE_LOCATION };
    }
    private boolean perms() { for (String p : needed()) if (!has(p)) return false; return true; }
    private boolean locOn() {
        try { LocationManager lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE); return Build.VERSION.SDK_INT >= 28 ? lm.isLocationEnabled() : lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); }
        catch (Throwable t) { return true; }
    }
    private void emit(final JSONObject o) {
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript("window.wifiEvent&&wifiEvent(" + JSONObject.quote(o.toString()) + ")", null); } catch (Throwable t) { } } });
    }
    private void emit(String op) { try { emit(new JSONObject().put("op", op)); } catch (Throwable t) { } }

    private final BroadcastReceiver rx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String act = i.getAction();
            if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(act)) emit("scan");
            else emit("changed");
        }
    };

    static int channelOf(int f) {
        if (f == 2484) return 14;
        if (f >= 2412 && f <= 2472) return (f - 2407) / 5;
        if (f >= 5000 && f <= 5900) return (f - 5000) / 5;
        if (f >= 5955 && f <= 7115) return (f - 5950) / 5;
        return 0;
    }
    static String band(int f) { return f < 3000 ? "2,4 GHz" : f < 5925 ? "5 GHz" : "6 GHz"; }
    static String clean(String s) { if (s == null) return ""; s = s.trim(); if (s.startsWith("\"") && s.endsWith("\"") && s.length() > 1) s = s.substring(1, s.length() - 1); return "<unknown ssid>".equals(s) ? "" : s; }
    static String ip4(int ip) { return (ip & 255) + "." + (ip >> 8 & 255) + "." + (ip >> 16 & 255) + "." + (ip >> 24 & 255); }
    static String sec(String caps) {
        if (caps == null) return "?";
        if (caps.contains("WPA3") || caps.contains("SAE")) return caps.contains("PSK") ? "WPA2/WPA3" : "WPA3";
        if (caps.contains("WPA2") || caps.contains("RSN")) return "WPA2";
        if (caps.contains("WPA")) return "WPA";
        if (caps.contains("WEP")) return "WEP";
        return "ouvert";
    }
    static int width(ScanResult r) {
        if (Build.VERSION.SDK_INT < 23) return 20;
        switch (r.channelWidth) { case ScanResult.CHANNEL_WIDTH_40MHZ: return 40; case ScanResult.CHANNEL_WIDTH_80MHZ: return 80; case ScanResult.CHANNEL_WIDTH_160MHZ: return 160; case ScanResult.CHANNEL_WIDTH_80MHZ_PLUS_MHZ: return 160; default: return Build.VERSION.SDK_INT >= 33 && r.channelWidth == 5 ? 320 : 20; }
    }

    @JavascriptInterface public String state() {
        JSONObject o = new JSONObject();
        try {
            WifiManager w = wm();
            o.put("on", w != null && w.isWifiEnabled()).put("perm", perms()).put("loc", locOn()).put("sdk", Build.VERSION.SDK_INT);
            o.put("has5", w != null && w.is5GHzBandSupported());
            if (Build.VERSION.SDK_INT >= 30 && w != null) o.put("has6", w.is6GHzBandSupported());
            if (w == null || !w.isWifiEnabled()) return o.toString();
            WifiInfo i = w.getConnectionInfo();
            if (i != null && i.getNetworkId() != -1 || i != null && i.getRssi() > -127 && i.getFrequency() > 0) {
                JSONObject c = new JSONObject();
                c.put("ssid", clean(i.getSSID())).put("bssid", i.getBSSID() == null || i.getBSSID().startsWith("02:00:00") ? "" : i.getBSSID())
                 .put("rssi", i.getRssi()).put("freq", i.getFrequency()).put("ch", channelOf(i.getFrequency())).put("band", band(i.getFrequency()))
                 .put("link", i.getLinkSpeed()).put("ip", ip4(i.getIpAddress()));
                if (Build.VERSION.SDK_INT >= 29) { c.put("tx", i.getTxLinkSpeedMbps()).put("rx", i.getRxLinkSpeedMbps()); }
                if (Build.VERSION.SDK_INT >= 30) c.put("std", i.getWifiStandard());
                // passerelle (la box) et DNS
                try {
                    ConnectivityManager cm = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
                    for (Network n : cm.getAllNetworks()) {
                        NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                        if (nc == null || !nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
                        LinkProperties lp = cm.getLinkProperties(n); if (lp == null) continue;
                        for (RouteInfo r : lp.getRoutes()) if (r.isDefaultRoute() && r.getGateway() != null && r.getGateway().getAddress().length == 4) c.put("gw", r.getGateway().getHostAddress());
                        if (lp.getDomains() != null) c.put("domain", lp.getDomains());
                        c.put("validated", nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                    }
                } catch (Throwable t) { }
                if (!c.has("gw")) try { c.put("gw", ip4(w.getDhcpInfo().gateway)); } catch (Throwable t) { }
                o.put("conn", c);
            }
        } catch (Throwable t) { }
        return o.toString();
    }

    @JavascriptInterface public void askPerm() { a.requestPermissions(needed(), REQ); }
    public void onPermissions(int code) { if (code == REQ) emit("perm"); }
    @JavascriptInterface public void locSettings() { ui.post(new Runnable() { public void run() { try { a.startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)); } catch (Throwable t) { } } }); }
    @JavascriptInterface public void wifiSettings() { ui.post(new Runnable() { public void run() { try { a.startActivity(new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_WIFI : Settings.ACTION_WIFI_SETTINGS)); } catch (Throwable t) { try { a.startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)); } catch (Throwable e) { } } } }); }
    @JavascriptInterface public void openUrl(final String u) { ui.post(new Runnable() { public void run() { try { a.startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Throwable t) { } } }); }
    @JavascriptInterface public void quit() { ui.post(new Runnable() { public void run() { try { a.finishAndRemoveTask(); } catch (Throwable t) { a.finish(); } } }); }

    /** Lance une recherche ; Android limite à 4 recherches toutes les 2 minutes : sinon on reprend les derniers résultats → "ok" | "throttle" | "perm" */
    @JavascriptInterface public String scan() {
        if (!perms()) return "perm";
        try { @SuppressWarnings("deprecation") boolean ok = wm().startScan(); return ok ? "ok" : "throttle"; } catch (Throwable t) { return "throttle"; }
    }
    @JavascriptInterface public String results() {
        JSONArray l = new JSONArray();
        try {
            List<ScanResult> rs = wm().getScanResults();
            long now = android.os.SystemClock.elapsedRealtime() * 1000;
            for (ScanResult r : rs) {
                JSONObject o = new JSONObject();
                String ssid = Build.VERSION.SDK_INT >= 33 && r.getWifiSsid() != null ? clean(r.getWifiSsid().toString()) : clean(r.SSID);
                o.put("ssid", ssid).put("bssid", r.BSSID).put("rssi", r.level).put("freq", r.frequency).put("ch", channelOf(r.frequency)).put("band", band(r.frequency))
                 .put("sec", sec(r.capabilities)).put("w", width(r)).put("age", Math.max(0, (now - r.timestamp) / 1000000));
                if (Build.VERSION.SDK_INT >= 23 && r.centerFreq0 > 0) o.put("cf", r.centerFreq0);
                if (Build.VERSION.SDK_INT >= 30) o.put("std", r.getWifiStandard());
                l.put(o);
            }
        } catch (Throwable t) { }
        return l.toString();
    }

    // ================= Tests : réactivité (box, internet) et débit =================
    static long tcpMs(String host, int port, int timeout) {
        Socket s = new Socket();
        try { long t0 = System.nanoTime(); s.connect(new InetSocketAddress(host, port), timeout); return (System.nanoTime() - t0) / 1000000; }
        catch (Throwable t) { return -1; } finally { try { s.close(); } catch (Throwable t) { } }
    }
    static long median(long[] v) { java.util.Arrays.sort(v); int n = 0; for (long x : v) if (x >= 0) n++; if (n == 0) return -1; long[] w = new long[n]; int k = 0; for (long x : v) if (x >= 0) w[k++] = x; return w[n / 2]; }
    @JavascriptInterface public void speedTest(final String gw) {
        if (testing) return; testing = true;
        new Thread(new Runnable() { public void run() {
            JSONObject res = new JSONObject();
            try {
                prog("ping", 0);
                long[] pb = new long[5], pi = new long[5];
                for (int k = 0; k < 5; k++) {
                    pb[k] = gw == null || gw.isEmpty() ? -1 : Math.max(tcpMs(gw, 80, 1500), -1); if (pb[k] < 0 && gw != null && !gw.isEmpty()) pb[k] = tcpMs(gw, 443, 1500);
                    pi[k] = tcpMs("1.1.1.1", 443, 2500);
                }
                long jb = 0; { long mn = Long.MAX_VALUE, mx = 0; for (long x : pi) if (x >= 0) { mn = Math.min(mn, x); mx = Math.max(mx, x); } jb = mx >= mn ? mx - mn : 0; }
                res.put("pingBox", median(pb)).put("ping", median(pi)).put("jitter", jb);
                prog("down", 0);
                res.put("down", down());
                prog("up", 0);
                res.put("up", up());
                res.put("op", "speed").put("ok", true);
            } catch (Throwable t) { try { res.put("op", "speed").put("ok", false).put("err", String.valueOf(t.getMessage())); } catch (Throwable e) { } }
            testing = false; emit(res);
        } }, "wifi-test").start();
    }
    private void prog(String phase, double v) { try { emit(new JSONObject().put("op", "prog").put("phase", phase).put("v", v)); } catch (Throwable t) { } }
    /** Débit descendant (Mbit/s) : téléchargements successifs pendant ~8 s */
    private double down() throws Exception {
        long t0 = System.nanoTime(), bytes = 0, end = t0 + 8_000_000_000L, lastEmit = 0;
        byte[] b = new byte[64 * 1024];
        while (System.nanoTime() < end) {
            HttpURLConnection h = (HttpURLConnection) new URL("https://speed.cloudflare.com/__down?bytes=25000000").openConnection();
            h.setConnectTimeout(5000); h.setReadTimeout(5000); h.setUseCaches(false);
            try (InputStream in = h.getInputStream()) {
                int n; while ((n = in.read(b)) > 0) { bytes += n; long now = System.nanoTime(); if (now - lastEmit > 400_000_000L) { lastEmit = now; prog("down", bytes * 8 / ((now - t0) / 1e9) / 1e6); } if (now > end) break; }
            } finally { h.disconnect(); }
        }
        return bytes * 8 / ((System.nanoTime() - t0) / 1e9) / 1e6;
    }
    /** Débit montant (Mbit/s) : envois successifs pendant ~6 s */
    private double up() throws Exception {
        long t0 = System.nanoTime(), bytes = 0, end = t0 + 6_000_000_000L, lastEmit = 0;
        byte[] chunk = new byte[64 * 1024]; new java.util.Random(7).nextBytes(chunk);
        while (System.nanoTime() < end) {
            HttpURLConnection h = (HttpURLConnection) new URL("https://speed.cloudflare.com/__up").openConnection();
            h.setConnectTimeout(5000); h.setReadTimeout(8000); h.setDoOutput(true); h.setRequestMethod("POST");
            h.setFixedLengthStreamingMode(4 * 1024 * 1024); h.setRequestProperty("Content-Type", "application/octet-stream");
            try (OutputStream o = h.getOutputStream()) {
                for (int k = 0; k < 64; k++) { o.write(chunk); bytes += chunk.length; long now = System.nanoTime(); if (now - lastEmit > 400_000_000L) { lastEmit = now; prog("up", bytes * 8 / ((now - t0) / 1e9) / 1e6); } }
            }
            try { h.getResponseCode(); } finally { h.disconnect(); }
        }
        return bytes * 8 / ((System.nanoTime() - t0) / 1e9) / 1e6;
    }
}
