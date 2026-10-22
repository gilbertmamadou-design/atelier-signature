package __PKG__;

// Réseau : état de la connexion (wifi et mobile 4G/5G), test de débit, wifi autour, appareils du réseau local, outils (ping, DNS, port).
// Exposé en JavaScript sous window.MAGReseau. Aucun effet au chargement : rien ne démarre tant que la page n'appelle pas.
// Événements : window.reseauEvent(type, json).
// Codes de requête : 6250 (position), 6251 (état du téléphone).

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.RouteInfo;
import android.net.Uri;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.CellIdentityLte;
import android.telephony.CellIdentityNr;
import android.telephony.CellInfo;
import android.telephony.CellInfoLte;
import android.telephony.CellInfoNr;
import android.telephony.CellSignalStrength;
import android.telephony.CellSignalStrengthGsm;
import android.telephony.CellSignalStrengthLte;
import android.telephony.CellSignalStrengthNr;
import android.telephony.CellSignalStrengthWcdma;
import android.telephony.PhoneStateListener;
import android.telephony.SignalStrength;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyDisplayInfo;
import android.telephony.TelephonyManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.SocketChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ReseauBridge {
    static final int REQ_LOC = 6250, REQ_PHONE = 6251;
    static final String PREFS = "reseau";
    private static final String UA = "Mozilla/5.0 (Linux; Android 15) Reseau/1.0";
    private static final String CF = "https://speed.cloudflare.com";
    // Ports essayés pour repérer un appareil (une réponse « refusé » prouve aussi qu'il est là)
    private static final int[] PORTS = { 80, 443, 22, 554, 8080, 62078, 7000, 8008, 9100, 445, 631, 5000 };
    private static final String[] NSD_TYPES = { "_http._tcp.", "_ipp._tcp.", "_ipps._tcp.", "_printer._tcp.", "_pdl-datastream._tcp.", "_googlecast._tcp.",
        "_airplay._tcp.", "_raop._tcp.", "_companion-link._tcp.", "_smb._tcp.", "_hap._tcp.", "_spotify-connect._tcp.", "_sonos._tcp.", "_device-info._tcp.", "_workstation._tcp." };

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    public ReseauBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) {
        if (requestCode != REQ_LOC && requestCode != REQ_PHONE) return;
        emit("perm", permState());
        if (requestCode == REQ_LOC && pendingLocate) { pendingLocate = false; if (hasLoc()) locateNow(); else emit("location", "{\"ok\":false,\"err\":\"perm\"}"); }
        if (requestCode == REQ_LOC && pendingScan) { pendingScan = false; scan(); }
        if (watching) { stopWatchInner(); startWatchInner(); }
    }
    public void onResume() { if (watching) { stopWatchInner(); startWatchInner(); } emit("resume", "{}"); }
    public void onIntent(Intent i) { }

    private void emit(final String type, final String json) {
        final String js = "window.reseauEvent&&reseauEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "{}" : json) + ")";
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }
    private SharedPreferences prefs() { return a.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private ConnectivityManager cm() { return (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE); }
    private WifiManager wm() { return (WifiManager) a.getApplicationContext().getSystemService(Context.WIFI_SERVICE); }
    private TelephonyManager tm() {
        TelephonyManager t = (TelephonyManager) a.getSystemService(Context.TELEPHONY_SERVICE);
        try { int id = SubscriptionManager.getDefaultDataSubscriptionId(); if (t != null && id != SubscriptionManager.INVALID_SUBSCRIPTION_ID) t = t.createForSubscriptionId(id); } catch (Throwable e) { }
        return t;
    }
    private static String err(Throwable t, String def) { return t == null || t.getMessage() == null ? def : t.getMessage(); }

    @JavascriptInterface public String version() { return "1"; }

    // ---------- Autorisations ----------
    private boolean granted(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private boolean hasLoc() { return granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION); }
    private boolean hasFine() { return granted(Manifest.permission.ACCESS_FINE_LOCATION); }
    private boolean hasPhone() { return granted(Manifest.permission.READ_PHONE_STATE); }
    private String state(String perm, String key) {
        if (granted(perm)) return "granted";
        if (prefs().getBoolean(key, false) && !a.shouldShowRequestPermissionRationale(perm)) return "blocked";
        return "ask";
    }
    private boolean locOn() {
        try {
            LocationManager lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
            return lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) || lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Throwable t) { return false; }
    }
    /** {loc, fine, phone : "granted"|"ask"|"blocked", locOn} */
    @JavascriptInterface public String permState() {
        JSONObject o = new JSONObject();
        try {
            o.put("loc", hasFine() ? "granted" : state(Manifest.permission.ACCESS_FINE_LOCATION, "locAsked"));
            o.put("coarseOnly", !hasFine() && hasLoc());
            o.put("phone", state(Manifest.permission.READ_PHONE_STATE, "phoneAsked"));
            o.put("locOn", locOn());
            o.put("sdk", Build.VERSION.SDK_INT);
        } catch (Exception e) { }
        return o.toString();
    }
    /** what : "loc" ou "phone". Réponse par l'événement « perm ». */
    @JavascriptInterface public void askPerm(final String what) {
        ui.post(new Runnable() { public void run() {
            try {
                if ("phone".equals(what)) {
                    prefs().edit().putBoolean("phoneAsked", true).apply();
                    a.requestPermissions(new String[]{ Manifest.permission.READ_PHONE_STATE }, REQ_PHONE);
                } else {
                    prefs().edit().putBoolean("locAsked", true).apply();
                    a.requestPermissions(new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOC);
                }
            } catch (Throwable t) { emit("perm", permState()); }
        } });
    }

    // ---------- État de la connexion ----------
    private static int chan(int f) {
        if (f == 2484) return 14;
        if (f >= 2412 && f <= 2472) return (f - 2407) / 5;
        if (f >= 5160 && f <= 5885) return (f - 5000) / 5;
        if (f >= 5955 && f <= 7115) return (f - 5950) / 5;
        return 0;
    }
    private static String band(int f) { return f < 3000 ? "2.4" : f < 5925 ? "5" : "6"; }
    private static String unq(String s) {
        if (s == null) return "";
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) s = s.substring(1, s.length() - 1);
        if ("<unknown ssid>".equals(s) || "0x".equals(s)) return "";
        return s;
    }
    private volatile WifiInfo cbWifi = null;      // WifiInfo reçu par le rappel réseau (SSID visible sur Android 12+)
    private volatile int override = -1;           // TelephonyDisplayInfo : 4G+, 5G NSA…
    private volatile int dispNet = -1;

    private Network findNet(int transport) {
        try {
            Network act = cm().getActiveNetwork();
            NetworkCapabilities c = act == null ? null : cm().getNetworkCapabilities(act);
            if (c != null && c.hasTransport(transport)) return act;
            for (Network n : cm().getAllNetworks()) { NetworkCapabilities k = cm().getNetworkCapabilities(n); if (k != null && k.hasTransport(transport)) return n; }
        } catch (Throwable t) { }
        return null;
    }

    /** Photographie de la connexion. Rapide : la page peut l'appeler toutes les quelques secondes. */
    @SuppressWarnings({"deprecation", "MissingPermission"})
    @JavascriptInterface public String status() {
        JSONObject o = new JSONObject();
        try {
            ConnectivityManager c = cm();
            Network act = c.getActiveNetwork();
            NetworkCapabilities caps = act == null ? null : c.getNetworkCapabilities(act);
            String type = "none";
            boolean vpn = false;
            if (caps != null) {
                vpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) type = "wifi";
                else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) type = "mobile";
                else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) type = "ethernet";
                else if (vpn) { type = findNet(NetworkCapabilities.TRANSPORT_WIFI) != null ? "wifi" : findNet(NetworkCapabilities.TRANSPORT_CELLULAR) != null ? "mobile" : "other"; }
                else type = "other";
                o.put("validated", caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                o.put("metered", !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED));
                o.put("downKbps", caps.getLinkDownstreamBandwidthKbps());
                o.put("upKbps", caps.getLinkUpstreamBandwidthKbps());
            }
            o.put("type", type); o.put("vpn", vpn);
            try { o.put("airplane", Settings.Global.getInt(a.getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, 0) == 1); } catch (Throwable t) { }

            // Adresses (réseau actif, ou wifi s'il n'y a qu'un VPN devant)
            Network ipNet = act;
            if (vpn) { Network w = findNet("wifi".equals(type) ? NetworkCapabilities.TRANSPORT_WIFI : NetworkCapabilities.TRANSPORT_CELLULAR); if (w != null) ipNet = w; }
            o.put("ip", ipJson(ipNet));

            // Wifi
            JSONObject w = new JSONObject();
            WifiManager wmg = wm();
            w.put("on", wmg != null && wmg.isWifiEnabled());
            Network wn = findNet(NetworkCapabilities.TRANSPORT_WIFI);
            if (wn != null && wmg != null) {
                WifiInfo wi = cbWifi;
                WifiInfo wi2 = null;
                try { wi2 = wmg.getConnectionInfo(); } catch (Throwable t) { }
                if (wi == null || (wi2 != null && wi2.getRssi() > -127 && unq(wi.getSSID()).isEmpty())) wi = wi2;
                if (wi != null) {
                    w.put("connected", true);
                    String ssid = unq(wi.getSSID());
                    if (ssid.isEmpty() && wi2 != null) ssid = unq(wi2.getSSID());
                    if (ssid.isEmpty() && cbWifi != null) ssid = unq(cbWifi.getSSID());
                    w.put("ssid", ssid);
                    String b = wi.getBSSID();
                    if (b != null && !"02:00:00:00:00:00".equals(b)) w.put("bssid", b);
                    int rssi = wi.getRssi();
                    if (wi2 != null && wi2.getRssi() > -127) rssi = wi2.getRssi();
                    w.put("rssi", rssi);
                    w.put("level", Build.VERSION.SDK_INT >= 30 ? wmg.calculateSignalLevel(rssi) * 4 / Math.max(1, wmg.getMaxSignalLevel()) : WifiManager.calculateSignalLevel(rssi, 5));
                    int f = wi.getFrequency();
                    w.put("freq", f); w.put("band", band(f)); w.put("channel", chan(f));
                    w.put("link", wi.getLinkSpeed());
                    if (Build.VERSION.SDK_INT >= 29) { w.put("tx", wi.getTxLinkSpeedMbps()); w.put("rx", wi.getRxLinkSpeedMbps()); }
                    if (Build.VERSION.SDK_INT >= 30) w.put("std", wi.getWifiStandard());
                    if (Build.VERSION.SDK_INT >= 31) { try { w.put("sec", wi.getCurrentSecurityType()); } catch (Throwable t) { } }
                    w.put("hidden", wi.getHiddenSSID());
                }
            } else w.put("connected", false);
            o.put("wifi", w);

            o.put("mobile", mobileJson());
            o.put("perms", new JSONObject(permState()));
        } catch (Throwable t) { try { o.put("err", err(t, "état indisponible")); } catch (Exception e) { } }
        return o.toString();
    }

    private JSONObject ipJson(Network n) {
        JSONObject o = new JSONObject();
        try {
            if (n == null) return o;
            LinkProperties lp = cm().getLinkProperties(n);
            if (lp == null) return o;
            JSONArray v4 = new JSONArray(), v6 = new JSONArray(), dns = new JSONArray();
            for (LinkAddress la : lp.getLinkAddresses()) {
                InetAddress ad = la.getAddress();
                if (ad instanceof Inet4Address) { v4.put(ad.getHostAddress()); if (!o.has("prefix")) o.put("prefix", la.getPrefixLength()); }
                else if (ad instanceof Inet6Address && !ad.isLinkLocalAddress()) v6.put(ad.getHostAddress().replaceAll("%.*$", ""));
            }
            for (InetAddress d : lp.getDnsServers()) dns.put(d.getHostAddress().replaceAll("%.*$", ""));
            for (RouteInfo r : lp.getRoutes()) {
                InetAddress g = r.getGateway();
                if (r.isDefaultRoute() && g != null && g instanceof Inet4Address && !g.isAnyLocalAddress()) { o.put("gateway", g.getHostAddress()); break; }
            }
            if (!o.has("gateway")) for (RouteInfo r : lp.getRoutes()) { InetAddress g = r.getGateway(); if (r.isDefaultRoute() && g != null && !g.isAnyLocalAddress()) { o.put("gateway", g.getHostAddress().replaceAll("%.*$", "")); break; } }
            o.put("v4", v4); o.put("v6", v6); o.put("dns", dns);
            o.put("iface", lp.getInterfaceName());
            if (Build.VERSION.SDK_INT >= 28) { o.put("privateDns", lp.isPrivateDnsActive()); if (lp.getPrivateDnsServerName() != null) o.put("privateDnsName", lp.getPrivateDnsServerName()); }
        } catch (Throwable t) { }
        return o;
    }

    private static boolean ok(int v) { return v != Integer.MAX_VALUE && v != CellInfo.UNAVAILABLE; }

    @SuppressWarnings({"deprecation", "MissingPermission"})
    private JSONObject mobileJson() {
        JSONObject m = new JSONObject();
        try {
            TelephonyManager t = tm();
            if (t == null || t.getPhoneType() == TelephonyManager.PHONE_TYPE_NONE) { m.put("sim", false); m.put("noPhone", true); return m; }
            int simState = t.getSimState();
            m.put("sim", simState == TelephonyManager.SIM_STATE_READY);
            m.put("simState", simState);
            m.put("operator", t.getNetworkOperatorName());
            m.put("simOperator", t.getSimOperatorName());
            m.put("mccmnc", t.getNetworkOperator());
            m.put("country", t.getNetworkCountryIso());
            m.put("roaming", t.isNetworkRoaming());
            if (Build.VERSION.SDK_INT >= 26) { try { m.put("dataOn", t.isDataEnabled()); } catch (Throwable e) { } }
            int nt = -1;
            if (hasPhone()) { try { nt = t.getDataNetworkType(); } catch (Throwable e) { } }
            if (nt <= 0 && dispNet > 0) nt = dispNet;
            m.put("netType", nt);
            m.put("override", override);

            // Puissance du signal (sans autorisation)
            boolean hasLte = false, hasNr = false;
            JSONObject sig = new JSONObject();
            if (Build.VERSION.SDK_INT >= 28) {
                SignalStrength ss = t.getSignalStrength();
                if (ss != null) {
                    sig.put("level", ss.getLevel());
                    if (Build.VERSION.SDK_INT >= 29) {
                        for (CellSignalStrength cs : ss.getCellSignalStrengths()) {
                            if (cs instanceof CellSignalStrengthNr) {
                                CellSignalStrengthNr n = (CellSignalStrengthNr) cs;
                                if (!ok(n.getSsRsrp())) continue;
                                hasNr = true;
                                JSONObject j = new JSONObject();
                                j.put("rsrp", n.getSsRsrp()); if (ok(n.getSsRsrq())) j.put("rsrq", n.getSsRsrq()); if (ok(n.getSsSinr())) j.put("sinr", n.getSsSinr());
                                j.put("dbm", n.getDbm()); j.put("level", n.getLevel());
                                sig.put("nr", j);
                            } else if (cs instanceof CellSignalStrengthLte) {
                                CellSignalStrengthLte l = (CellSignalStrengthLte) cs;
                                if (!ok(l.getRsrp())) continue;
                                hasLte = true;
                                JSONObject j = new JSONObject();
                                j.put("rsrp", l.getRsrp()); if (ok(l.getRsrq())) j.put("rsrq", l.getRsrq()); if (ok(l.getRssnr())) j.put("sinr", l.getRssnr());
                                if (ok(l.getRssi())) j.put("rssi", l.getRssi());
                                j.put("dbm", l.getDbm()); j.put("level", l.getLevel());
                                sig.put("lte", j);
                            } else if (cs instanceof CellSignalStrengthWcdma || cs instanceof CellSignalStrengthGsm) {
                                if (!ok(cs.getDbm())) continue;
                                JSONObject j = new JSONObject();
                                j.put("dbm", cs.getDbm()); j.put("level", cs.getLevel());
                                sig.put(cs instanceof CellSignalStrengthGsm ? "gsm" : "wcdma", j);
                            }
                        }
                    }
                }
            }
            m.put("signal", sig);
            m.put("hasLte", hasLte); m.put("hasNr", hasNr);

            // Antenne servante (nécessite la position précise)
            if (hasFine() && Build.VERSION.SDK_INT >= 29) {
                try {
                    List<CellInfo> cells = t.getAllCellInfo();
                    JSONArray reg = new JSONArray(); int neigh = 0;
                    if (cells != null) for (CellInfo ci : cells) {
                        if (!ci.isRegistered()) { neigh++; continue; }
                        JSONObject j = new JSONObject();
                        if (ci instanceof CellInfoLte) {
                            CellIdentityLte id = ((CellInfoLte) ci).getCellIdentity();
                            j.put("kind", "LTE"); if (ok(id.getEarfcn())) j.put("arfcn", id.getEarfcn()); if (ok(id.getPci())) j.put("pci", id.getPci());
                            if (ok(id.getTac())) j.put("tac", id.getTac()); if (ok(id.getCi())) j.put("ci", id.getCi());
                            if (Build.VERSION.SDK_INT >= 30) { JSONArray bb = new JSONArray(); for (int x : id.getBands()) bb.put(x); j.put("bands", bb); }
                            if (ok(id.getBandwidth())) j.put("bw", id.getBandwidth());
                        } else if (ci instanceof CellInfoNr) {
                            CellIdentityNr id = (CellIdentityNr) ((CellInfoNr) ci).getCellIdentity();
                            j.put("kind", "NR"); if (ok(id.getNrarfcn())) j.put("arfcn", id.getNrarfcn()); if (ok(id.getPci())) j.put("pci", id.getPci());
                            if (ok(id.getTac())) j.put("tac", id.getTac()); if (id.getNci() != Long.MAX_VALUE && id.getNci() != CellInfo.UNAVAILABLE_LONG) j.put("nci", id.getNci());
                            if (Build.VERSION.SDK_INT >= 30) { JSONArray bb = new JSONArray(); for (int x : id.getBands()) bb.put(x); j.put("bands", bb); }
                        } else continue;
                        reg.put(j);
                    }
                    m.put("cells", reg); m.put("neighbours", neigh);
                } catch (Throwable e) { }
            }
            m.put("gen", gen(nt, override, hasLte, hasNr));
        } catch (Throwable t) { try { m.put("err", err(t, "")); } catch (Exception e) { } }
        return m;
    }

    /** Génération lisible : "5G SA", "5G", "5G+", "4G+", "4G", "3G+", "3G", "2G", "" */
    static String gen(int nt, int ov, boolean lte, boolean nr) {
        if (nt == 20) return "5G SA";
        if (ov == 3) return "5G";
        if (ov == 4 || ov == 5) return "5G+";
        if (ov == 1 || ov == 2) return "4G+";
        switch (nt) {
            case 19: return "4G+";
            case 13: return nr ? "5G" : "4G";
            case 15: return "3G+";
            case 3: case 8: case 9: case 10: case 17: return "3G";
            case 1: case 2: case 16: case 4: case 7: case 11: return "2G";
            case 18: return "Wi-Fi";
        }
        if (nr && !lte) return "5G SA";
        if (nr) return "5G";
        if (lte) return "4G";
        return "";
    }

    // ---------- Surveillance (pendant que la page est ouverte) ----------
    private boolean watching = false;
    private ConnectivityManager.NetworkCallback netCb;
    private BroadcastReceiver rx;
    private Object telCbA, telCbB;
    private PhoneStateListener psl;
    private long lastNetEmit = 0;

    /** Démarre l'écoute des changements (wifi, réseau mobile, résultats de scan). Événements « net » et « scan ». */
    @JavascriptInterface public void startWatch() { ui.post(new Runnable() { public void run() { if (watching) return; watching = true; startWatchInner(); } }); }
    @JavascriptInterface public void stopWatch() { ui.post(new Runnable() { public void run() { watching = false; stopWatchInner(); } }); }

    private void netChanged() {
        long now = System.currentTimeMillis();
        if (now - lastNetEmit < 700) return;
        lastNetEmit = now;
        emit("net", "{}");
    }

    @SuppressWarnings({"deprecation", "MissingPermission"})
    private void startWatchInner() {
        try {
            NetworkRequest req = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            if (Build.VERSION.SDK_INT >= 31) {
                netCb = new ConnectivityManager.NetworkCallback(ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO) {
                    @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) {
                        Object ti = c.getTransportInfo();
                        if (ti instanceof WifiInfo) cbWifi = (WifiInfo) ti;
                        netChanged();
                    }
                    @Override public void onLost(Network n) { cbWifi = null; netChanged(); }
                };
            } else {
                netCb = new ConnectivityManager.NetworkCallback() {
                    @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) { netChanged(); }
                    @Override public void onLost(Network n) { netChanged(); }
                };
            }
            cm().registerNetworkCallback(req, netCb);
        } catch (Throwable t) { netCb = null; }
        try {
            rx = new BroadcastReceiver() {
                @Override public void onReceive(Context ctx, Intent i) {
                    String ac = i.getAction();
                    if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(ac)) {
                        boolean fresh = i.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, true);
                        emitScan(fresh, false);
                    } else netChanged();
                }
            };
            IntentFilter f = new IntentFilter();
            f.addAction(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
            f.addAction(WifiManager.RSSI_CHANGED_ACTION);
            f.addAction(WifiManager.WIFI_STATE_CHANGED_ACTION);
            f.addAction(ConnectivityManager.CONNECTIVITY_ACTION);
            f.addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED);
            if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(rx, f, 2 /* RECEIVER_EXPORTED : diffusions système */);
            else a.registerReceiver(rx, f);
        } catch (Throwable t) { rx = null; }
        TelephonyManager t = tm();
        if (t == null) return;
        if (Build.VERSION.SDK_INT >= 31) {
            try { TelSig s = new TelSig(this); t.registerTelephonyCallback(a.getMainExecutor(), s); telCbA = s; } catch (Throwable e) { telCbA = null; }
            try { TelDisp d = new TelDisp(this); t.registerTelephonyCallback(a.getMainExecutor(), d); telCbB = d; } catch (Throwable e) { telCbB = null; }
        } else {
            try {
                psl = new Psl(this);
                int ev = PhoneStateListener.LISTEN_SIGNAL_STRENGTHS;
                if (Build.VERSION.SDK_INT >= 30 && hasPhone()) ev |= PhoneStateListener.LISTEN_DISPLAY_INFO_CHANGED;
                t.listen(psl, ev);
            } catch (Throwable e) { psl = null; }
        }
    }

    @SuppressWarnings("deprecation")
    private void stopWatchInner() {
        try { if (netCb != null) cm().unregisterNetworkCallback(netCb); } catch (Throwable t) { }
        netCb = null;
        try { if (rx != null) a.unregisterReceiver(rx); } catch (Throwable t) { }
        rx = null;
        TelephonyManager t = tm();
        if (Build.VERSION.SDK_INT >= 31) {
            try { if (telCbA != null && t != null) t.unregisterTelephonyCallback((TelephonyCallback) telCbA); } catch (Throwable e) { }
            try { if (telCbB != null && t != null) t.unregisterTelephonyCallback((TelephonyCallback) telCbB); } catch (Throwable e) { }
        }
        telCbA = null; telCbB = null;
        try { if (psl != null && t != null) t.listen(psl, PhoneStateListener.LISTEN_NONE); } catch (Throwable e) { }
        psl = null;
    }

    void onDisplay(TelephonyDisplayInfo d) {
        if (d == null) return;
        override = d.getOverrideNetworkType();
        dispNet = d.getNetworkType();
        netChanged();
    }

    public static class TelSig extends TelephonyCallback implements TelephonyCallback.SignalStrengthsListener {
        final ReseauBridge b;
        public TelSig(ReseauBridge b) { this.b = b; }
        @Override public void onSignalStrengthsChanged(SignalStrength s) { b.netChanged(); }
    }
    public static class TelDisp extends TelephonyCallback implements TelephonyCallback.DisplayInfoListener {
        final ReseauBridge b;
        public TelDisp(ReseauBridge b) { this.b = b; }
        @Override public void onDisplayInfoChanged(TelephonyDisplayInfo d) { b.onDisplay(d); }
    }
    @SuppressWarnings("deprecation")
    public static class Psl extends PhoneStateListener {
        final ReseauBridge b;
        public Psl(ReseauBridge b) { this.b = b; }
        @Override public void onSignalStrengthsChanged(SignalStrength s) { b.netChanged(); }
        @Override public void onDisplayInfoChanged(TelephonyDisplayInfo d) { b.onDisplay(d); }
    }

    // ---------- Wifi autour ----------
    private boolean pendingScan = false;

    /** Lance un scan. Événement « scan » {ok, fresh, throttled, list} ; err : "perm" | "locoff" | "wifioff". */
    @SuppressWarnings("deprecation")
    @JavascriptInterface public void scan() {
        ui.post(new Runnable() { public void run() {
            try {
                WifiManager w = wm();
                if (w == null) { emit("scan", "{\"ok\":false,\"err\":\"nowifi\"}"); return; }
                if (!w.isWifiEnabled()) { emit("scan", "{\"ok\":false,\"err\":\"wifioff\"}"); return; }
                if (!hasFine()) { emit("scan", "{\"ok\":false,\"err\":\"perm\"}"); return; }
                if (!locOn()) { emit("scan", "{\"ok\":false,\"err\":\"locoff\"}"); return; }
                if (!watching) { watching = true; startWatchInner(); }
                boolean started = false;
                try { started = w.startScan(); } catch (Throwable t) { }
                if (!started) emitScan(false, true);
                else {
                    // Sans réponse en 12 s (scan ignoré par le système), on renvoie la dernière liste connue
                    final long at = System.currentTimeMillis(); lastScanAsk = at;
                    ui.postDelayed(new Runnable() { public void run() { if (lastScanAsk == at && lastScanEmit < at) emitScan(false, true); } }, 12000);
                }
            } catch (Throwable t) { emit("scan", "{\"ok\":false,\"err\":" + JSONObject.quote(err(t, "scan impossible")) + "}"); }
        } });
    }
    private volatile long lastScanAsk = 0, lastScanEmit = 0;

    @SuppressWarnings({"deprecation", "MissingPermission"})
    private void emitScan(boolean fresh, boolean throttled) {
        JSONObject o = new JSONObject();
        try {
            lastScanEmit = System.currentTimeMillis();
            o.put("ok", true); o.put("fresh", fresh); o.put("throttled", throttled);
            WifiManager w = wm();
            if (Build.VERSION.SDK_INT >= 30) { try { o.put("throttleOn", w.isScanThrottleEnabled()); } catch (Throwable t) { } }
            String cur = null;
            try { WifiInfo wi = cbWifi != null ? cbWifi : w.getConnectionInfo(); if (wi != null) cur = wi.getBSSID(); } catch (Throwable t) { }
            JSONArray l = new JSONArray();
            List<ScanResult> rs = hasFine() ? w.getScanResults() : null;
            long boot = android.os.SystemClock.elapsedRealtime();
            if (rs != null) for (ScanResult r : rs) {
                JSONObject j = new JSONObject();
                String ssid = r.SSID == null ? "" : r.SSID;
                if (Build.VERSION.SDK_INT >= 33) { try { if (r.getWifiSsid() != null) ssid = unq(r.getWifiSsid().toString()); } catch (Throwable t) { } }
                j.put("ssid", ssid);
                j.put("bssid", r.BSSID);
                j.put("rssi", r.level);
                j.put("freq", r.frequency);
                j.put("band", band(r.frequency));
                j.put("channel", chan(r.frequency));
                int cw = r.channelWidth; // 0:20 1:40 2:80 3:160 4:80+80 5:320
                j.put("width", cw == 1 ? 40 : cw == 2 ? 80 : cw == 3 || cw == 4 ? 160 : cw == 5 ? 320 : 20);
                if (r.centerFreq0 > 0) j.put("center", chan(r.centerFreq0));
                j.put("sec", r.capabilities == null ? "" : r.capabilities);
                if (Build.VERSION.SDK_INT >= 30) j.put("std", r.getWifiStandard());
                j.put("age", Math.max(0, (boot - r.timestamp / 1000) / 1000));
                j.put("me", cur != null && cur.equalsIgnoreCase(r.BSSID));
                l.put(j);
            }
            o.put("list", l);
        } catch (Throwable t) { try { o.put("ok", false); o.put("err", err(t, "")); } catch (Exception e) { } }
        emit("scan", o.toString());
    }

    // ---------- Adresse IP publique ----------
    private static String httpGet(String url, int max) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000); c.setReadTimeout(10000);
        c.setRequestProperty("User-Agent", UA); c.setRequestProperty("Accept", "application/json, text/plain, */*");
        int code = c.getResponseCode();
        if (code >= 400) { c.disconnect(); throw new Exception("HTTP " + code); }
        InputStream in = c.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > max) break; }
        in.close(); c.disconnect();
        return new String(bo.toByteArray(), "UTF-8");
    }

    /** Événement « publicip » {ok, ip, org, city, country, src} */
    @JavascriptInterface public void publicIp() {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                try {
                    JSONObject j = new JSONObject(httpGet("https://ipinfo.io/json", 20000));
                    o.put("ip", j.optString("ip")); o.put("org", j.optString("org").replaceFirst("^AS\\d+\\s+", ""));
                    o.put("city", j.optString("city")); o.put("country", j.optString("country")); o.put("src", "ipinfo.io");
                } catch (Throwable t) {
                    JSONObject j = new JSONObject(httpGet("https://api.ipify.org?format=json", 4000));
                    o.put("ip", j.optString("ip")); o.put("src", "ipify.org");
                }
                o.put("ok", o.optString("ip").length() > 0);
            } catch (Throwable t) { try { o.put("ok", false); o.put("err", err(t, "Pas de connexion")); } catch (Exception e) { } }
            emit("publicip", o.toString());
        } }).start();
    }

    // ---------- Test de débit (Cloudflare) ----------
    private volatile boolean speedRun = false, speedStop = false;
    private final List<HttpURLConnection> live = Collections.synchronizedList(new ArrayList<HttpURLConnection>());

    @JavascriptInterface public boolean speedRunning() { return speedRun; }
    @JavascriptInterface public void speedStop() { speedStop = true; killLive(); }
    private void killLive() { synchronized (live) { for (HttpURLConnection c : live) { try { c.disconnect(); } catch (Throwable t) { } } live.clear(); } }

    /** opts {dur: s par sens (3-15), streams (1-8), maxMB (0 = sans limite), down, up}. Événements « speed » (progression) et « speedDone ». */
    @JavascriptInterface public boolean speedStart(String opts) {
        if (speedRun) return false;
        JSONObject op; try { op = new JSONObject(opts == null || opts.isEmpty() ? "{}" : opts); } catch (Exception e) { op = new JSONObject(); }
        final int dur = Math.max(3, Math.min(15, op.optInt("dur", 10)));
        final int streams = Math.max(1, Math.min(8, op.optInt("streams", 4)));
        final long maxB = (long) (Math.max(0, op.optDouble("maxMB", 0)) * 1e6);
        final boolean doDown = op.optBoolean("down", true), doUp = op.optBoolean("up", true);
        speedRun = true; speedStop = false;
        new Thread(new Runnable() { public void run() {
            JSONObject res = new JSONObject();
            long used = 0;
            try {
                speedEmit("prep", 0, 0, 0, 0);
                // Serveur (ville du point Cloudflare) et IP publique vue par le serveur
                try {
                    String tr = httpGet(CF + "/cdn-cgi/trace", 4000);
                    for (String line : tr.split("\n")) {
                        if (line.startsWith("colo=")) res.put("colo", line.substring(5).trim());
                        else if (line.startsWith("ip=")) res.put("ip", line.substring(3).trim());
                        else if (line.startsWith("loc=")) res.put("loc", line.substring(4).trim());
                    }
                } catch (Throwable t) { }
                if (speedStop) throw new InterruptedException();
                // Latence : requêtes vides sur une connexion gardée ouverte
                List<Double> lat = new ArrayList<>();
                for (int i = 0; i < 16 && !speedStop; i++) {
                    long t0 = System.nanoTime();
                    HttpURLConnection c = (HttpURLConnection) new URL(CF + "/__down?bytes=0").openConnection();
                    c.setConnectTimeout(8000); c.setReadTimeout(8000);
                    c.setRequestProperty("User-Agent", UA); c.setRequestProperty("Accept-Encoding", "identity");
                    c.setUseCaches(false);
                    InputStream in = c.getInputStream(); byte[] b = new byte[256]; while (in.read(b) > 0) { } in.close();
                    double ms = (System.nanoTime() - t0) / 1e6;
                    // Cloudflare indique son temps de traitement : on le retire
                    try { String st = c.getHeaderField("Server-Timing"); if (st != null) { Matcher m = Pattern.compile("dur=([\\d.]+)").matcher(st); if (m.find()) ms = Math.max(0.5, ms - Double.parseDouble(m.group(1))); } } catch (Throwable t) { }
                    if (i > 0) lat.add(ms);    // la première ouvre la connexion : ignorée
                    speedEmit("ping", ms, 0, (i + 1) / 16.0, 0);
                }
                if (lat.isEmpty()) throw new InterruptedException();
                List<Double> sorted = new ArrayList<>(lat); Collections.sort(sorted);
                double ping = sorted.get(sorted.size() / 2);
                double jit = 0; for (int i = 1; i < lat.size(); i++) jit += Math.abs(lat.get(i) - lat.get(i - 1));
                jit = lat.size() > 1 ? jit / (lat.size() - 1) : 0;
                res.put("ping", round1(ping)); res.put("jitter", round1(jit));
                speedEmit("pingDone", ping, jit, 1, 0);
                if (doDown && !speedStop) { double[] r = transfer(true, dur, streams, maxB > 0 ? (long) (maxB * (doUp ? 0.7 : 1)) : 0); res.put("down", round1(r[0])); used += (long) r[1]; }
                if (doUp && !speedStop) { double[] r = transfer(false, dur, streams, maxB > 0 ? Math.max(4_000_000L, maxB - used) : 0); res.put("up", round1(r[0])); used += (long) r[1]; }
                res.put("ok", !speedStop);
                if (speedStop) res.put("stopped", true);
            } catch (InterruptedException ie) {
                try { res.put("ok", false); res.put("stopped", true); } catch (Exception e) { }
            } catch (Throwable t) {
                try { res.put("ok", false); res.put("err", err(t, "Pas de connexion")); } catch (Exception e) { }
            }
            try { res.put("mb", round1(used / 1e6)); } catch (Exception e) { }
            killLive();
            speedRun = false;
            emit("speedDone", res.toString());
        } }).start();
        return true;
    }
    private static double round1(double v) { return Math.round(v * 10) / 10.0; }
    private void speedEmit(String phase, double v, double v2, double pct, double mb) {
        try {
            JSONObject o = new JSONObject();
            o.put("phase", phase); o.put("v", round1(v)); if (v2 > 0) o.put("v2", round1(v2)); o.put("pct", Math.round(pct * 1000) / 1000.0); if (mb > 0) o.put("mb", round1(mb));
            emit("speed", o.toString());
        } catch (Exception e) { }
    }

    /** Un sens (réception ou envoi) : plusieurs connexions en parallèle pendant « dur » secondes. Retourne {Mb/s, octets}. */
    private double[] transfer(final boolean down, int dur, int streams, final long maxB) throws Exception {
        final AtomicLong bytes = new AtomicLong();
        final AtomicInteger fails = new AtomicInteger();
        final long[] stopFlag = { 0 };
        final String phase = down ? "down" : "up";
        speedEmit(phase, 0, 0, 0, 0);
        Thread[] th = new Thread[streams];
        for (int s = 0; s < streams; s++) {
            th[s] = new Thread(new Runnable() { public void run() {
                byte[] buf = new byte[65536];
                while (stopFlag[0] == 0 && !speedStop) {
                    HttpURLConnection c = null;
                    try {
                        if (down) {
                            c = (HttpURLConnection) new URL(CF + "/__down?bytes=25000000").openConnection();
                            c.setConnectTimeout(8000); c.setReadTimeout(8000);
                            c.setRequestProperty("User-Agent", UA); c.setRequestProperty("Accept-Encoding", "identity"); c.setUseCaches(false);
                            live.add(c);
                            InputStream in = c.getInputStream(); int n;
                            while (stopFlag[0] == 0 && !speedStop && (n = in.read(buf)) > 0) bytes.addAndGet(n);
                            in.close();
                        } else {
                            final int size = 4_000_000;
                            c = (HttpURLConnection) new URL(CF + "/__up").openConnection();
                            c.setConnectTimeout(8000); c.setReadTimeout(15000);
                            c.setDoOutput(true); c.setRequestMethod("POST"); c.setFixedLengthStreamingMode(size);
                            c.setRequestProperty("User-Agent", UA); c.setRequestProperty("Content-Type", "application/octet-stream"); c.setUseCaches(false);
                            live.add(c);
                            OutputStream out = c.getOutputStream(); int sent = 0;
                            while (sent < size && stopFlag[0] == 0 && !speedStop) { int n = Math.min(buf.length, size - sent); out.write(buf, 0, n); sent += n; bytes.addAndGet(n); }
                            if (sent < size) break;
                            out.close();
                            InputStream in = c.getInputStream(); while (in.read(buf) > 0) { } in.close();
                        }
                    } catch (Throwable t) {
                        if (stopFlag[0] == 0 && !speedStop && fails.incrementAndGet() > 12) break;
                        try { Thread.sleep(150); } catch (InterruptedException e) { break; }
                    } finally { if (c != null) { live.remove(c); if (stopFlag[0] != 0 || speedStop) try { c.disconnect(); } catch (Throwable t) { } } }
                }
            } });
            th[s].start();
        }
        long t0 = System.nanoTime(), durNs = dur * 1_000_000_000L;
        long warmNs = Math.min(2_000_000_000L, durNs / 5);
        long warmB = -1, warmT = 0;
        long[] winT = new long[64], winB = new long[64]; int wi = 0;
        long lastEmit = 0;
        while (true) {
            Thread.sleep(100);
            long now = System.nanoTime() - t0, b = bytes.get();
            winT[wi % 64] = now; winB[wi % 64] = b; wi++;
            if (warmB < 0 && now >= warmNs) { warmB = b; warmT = now; }
            boolean end = now >= durNs || speedStop || (maxB > 0 && b >= maxB) || fails.get() > 12 * streams;
            if (now - lastEmit >= 200 || end) {
                lastEmit = now;
                int back = Math.min(wi - 1, 10);   // fenêtre glissante d'environ 1 s
                long tA = winT[(wi - 1 - back) % 64], bA = winB[(wi - 1 - back) % 64];
                double inst = now > tA ? (b - bA) * 8 / ((now - tA) / 1e9) / 1e6 : 0;
                speedEmit(phase, inst, 0, Math.min(1, now / (double) durNs), b / 1e6);
            }
            if (end) break;
        }
        stopFlag[0] = 1;
        long totalT = System.nanoTime() - t0, totalB = bytes.get();
        killLive();
        for (Thread x : th) { try { x.join(1500); } catch (InterruptedException e) { } }
        if (fails.get() > 12 * streams && totalB < 100_000) throw new Exception(down ? "Réception impossible" : "Envoi impossible");
        double mbps;
        if (warmB >= 0 && totalT - warmT > 500_000_000L) mbps = (totalB - warmB) * 8 / ((totalT - warmT) / 1e9) / 1e6;
        else mbps = totalT > 0 ? totalB * 8 / (totalT / 1e9) / 1e6 : 0;
        speedEmit(phase + "Done", mbps, 0, 1, totalB / 1e6);
        return new double[]{ mbps, totalB };
    }

    // ---------- Appareils du réseau local ----------
    private volatile boolean lanRun = false, lanStop = false;
    private NsdManager nsd;
    private final List<NsdManager.DiscoveryListener> nsdL = new ArrayList<>();
    private final LinkedList<NsdServiceInfo> resolveQ = new LinkedList<>();
    private boolean resolving = false;
    private WifiManager.MulticastLock mlock;

    @JavascriptInterface public boolean lanRunning() { return lanRun; }
    @JavascriptInterface public void lanStop() { lanStop = true; }

    private static int ipInt(InetAddress a) { byte[] b = a.getAddress(); return ((b[0] & 255) << 24) | ((b[1] & 255) << 16) | ((b[2] & 255) << 8) | (b[3] & 255); }
    private static String ipStr(int v) { return ((v >>> 24) & 255) + "." + ((v >>> 16) & 255) + "." + ((v >>> 8) & 255) + "." + (v & 255); }

    /** Balayage du réseau wifi (/24). Événements « lanHost », « lanProgress », « lanService », « lanDone ». */
    @JavascriptInterface public boolean lanStart() {
        if (lanRun) return false;
        final Network wn = findNet(NetworkCapabilities.TRANSPORT_WIFI);
        if (wn == null) { emit("lanDone", "{\"ok\":false,\"err\":\"nowifi\"}"); return false; }
        LinkProperties lp = cm().getLinkProperties(wn);
        Inet4Address me = null; int prefix = 24;
        if (lp != null) for (LinkAddress la : lp.getLinkAddresses()) if (la.getAddress() instanceof Inet4Address) { me = (Inet4Address) la.getAddress(); prefix = la.getPrefixLength(); break; }
        if (me == null) { emit("lanDone", "{\"ok\":false,\"err\":\"noip\"}"); return false; }
        String gw = null;
        for (RouteInfo r : lp.getRoutes()) if (r.isDefaultRoute() && r.getGateway() instanceof Inet4Address) { gw = r.getGateway().getHostAddress(); break; }
        final int myIp = ipInt(me);
        final int pfx = Math.max(24, Math.min(30, prefix));
        final int mask = pfx == 0 ? 0 : (int) (0xffffffffL << (32 - pfx));
        final int net = myIp & mask, count = (1 << (32 - pfx)) - 2;
        final String myS = me.getHostAddress(), gwS = gw;
        lanRun = true; lanStop = false;
        try { mlock = wm().createMulticastLock("reseau"); mlock.setReferenceCounted(false); mlock.acquire(); } catch (Throwable t) { mlock = null; }
        ui.post(new Runnable() { public void run() { nsdStart(); } });
        new Thread(new Runnable() { public void run() { ssdp(wn); } }).start();
        new Thread(new Runnable() { public void run() {
            final AtomicInteger done = new AtomicInteger(), found = new AtomicInteger();
            final List<String> alive = Collections.synchronizedList(new ArrayList<String>());
            ExecutorService pool = Executors.newFixedThreadPool(32);
            try {
                emit("lanProgress", "{\"done\":0,\"total\":" + count + ",\"me\":" + JSONObject.quote(myS) + ",\"gw\":" + JSONObject.quote(gwS == null ? "" : gwS) + ",\"prefix\":" + pfx + "}");
                for (int i = 1; i <= count; i++) {
                    final String ip = ipStr(net + i);
                    pool.execute(new Runnable() { public void run() {
                        if (lanStop) return;
                        try {
                            JSONObject h = probeHost(ip, ip.equals(myS));
                            if (h != null) {
                                h.put("me", ip.equals(myS)); h.put("gw", ip.equals(gwS));
                                alive.add(ip); found.incrementAndGet();
                                emit("lanHost", h.toString());
                            }
                        } catch (Throwable t) { }
                        int d = done.incrementAndGet();
                        if (d % 8 == 0 || d == count) emit("lanProgress", "{\"done\":" + d + ",\"total\":" + count + ",\"found\":" + found.get() + "}");
                    } });
                }
                pool.shutdown();
                pool.awaitTermination(90, TimeUnit.SECONDS);
                // Noms donnés par la box (DNS inverse), quand elle les connaît
                if (!lanStop) {
                    ExecutorService p2 = Executors.newFixedThreadPool(12);
                    for (final String ip : new ArrayList<>(alive)) p2.execute(new Runnable() { public void run() {
                        if (lanStop) return;
                        try {
                            String n = InetAddress.getByName(ip).getCanonicalHostName();
                            if (n != null && !n.equals(ip) && !n.isEmpty()) emit("lanService", new JSONObject().put("ip", ip).put("host", n).put("src", "dns").toString());
                        } catch (Throwable t) { }
                    } });
                    p2.shutdown(); p2.awaitTermination(12, TimeUnit.SECONDS); p2.shutdownNow();
                }
                // Laisse un peu de temps à mDNS et UPnP
                for (int i = 0; i < 30 && !lanStop && (resolving || !resolveQ.isEmpty()); i++) Thread.sleep(200);
            } catch (Throwable t) { }
            pool.shutdownNow();
            ui.post(new Runnable() { public void run() { nsdStop(); } });
            try { if (mlock != null) mlock.release(); } catch (Throwable t) { }
            mlock = null;
            lanRun = false;
            emit("lanDone", "{\"ok\":true,\"stopped\":" + lanStop + ",\"found\":" + found.get() + "}");
        } }).start();
        return true;
    }

    /** Présence d'un appareil : connexions TCP non bloquantes sur quelques ports (ouvert ou refusé = présent), puis ping ICMP. */
    private JSONObject probeHost(String ip, boolean self) throws Exception {
        InetAddress ad = InetAddress.getByName(ip);
        JSONArray open = new JSONArray();
        boolean alive = self; long rtt = -1;
        Selector sel = Selector.open();
        List<SocketChannel> chs = new ArrayList<>();
        long t0 = System.nanoTime();
        boolean unreach = false;
        try {
            for (int p : PORTS) {
                SocketChannel ch = SocketChannel.open(); ch.configureBlocking(false); chs.add(ch);
                try {
                    if (ch.connect(new InetSocketAddress(ad, p))) { open.put(p); alive = true; }
                    else ch.register(sel, SelectionKey.OP_CONNECT, p);
                } catch (IOException e) { String m = String.valueOf(e.getMessage()); if (m.contains("refused")) alive = true; }
            }
            long deadline = System.currentTimeMillis() + 900;
            while (!sel.keys().isEmpty() && !unreach) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) break;
                if (sel.select(left) == 0) continue;
                Iterator<SelectionKey> it = sel.selectedKeys().iterator();
                while (it.hasNext()) {
                    SelectionKey k = it.next(); it.remove();
                    SocketChannel ch = (SocketChannel) k.channel();
                    try { if (ch.finishConnect()) { open.put((int) (Integer) k.attachment()); alive = true; if (rtt < 0) rtt = (System.nanoTime() - t0) / 1_000_000; } }
                    catch (IOException e) {
                        String m = String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT);
                        if (m.contains("refused") || m.contains("reset")) { alive = true; if (rtt < 0) rtt = (System.nanoTime() - t0) / 1_000_000; }
                        else if (m.contains("unreachable") || m.contains("no route")) unreach = true;
                    }
                    k.cancel();
                }
            }
        } finally {
            for (SocketChannel ch : chs) { try { ch.close(); } catch (Throwable t) { } }
            try { sel.close(); } catch (Throwable t) { }
        }
        if (!alive && !unreach) {
            long t1 = System.nanoTime();
            try { if (ad.isReachable(700)) { alive = true; rtt = (System.nanoTime() - t1) / 1_000_000; } } catch (Throwable t) { }
        }
        if (!alive) return null;
        JSONObject o = new JSONObject();
        o.put("ip", ip); o.put("ports", open); if (rtt >= 0) o.put("ms", rtt);
        return o;
    }

    private void nsdStart() {
        try {
            nsd = (NsdManager) a.getSystemService(Context.NSD_SERVICE);
            for (String type : NSD_TYPES) {
                NsdManager.DiscoveryListener l = new NsdManager.DiscoveryListener() {
                    public void onStartDiscoveryFailed(String s, int e) { }
                    public void onStopDiscoveryFailed(String s, int e) { }
                    public void onDiscoveryStarted(String s) { }
                    public void onDiscoveryStopped(String s) { }
                    public void onServiceFound(NsdServiceInfo si) { synchronized (resolveQ) { resolveQ.add(si); } ui.post(new Runnable() { public void run() { nextResolve(); } }); }
                    public void onServiceLost(NsdServiceInfo si) { }
                };
                nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l);
                nsdL.add(l);
            }
        } catch (Throwable t) { }
    }
    private void nsdStop() {
        try { for (NsdManager.DiscoveryListener l : nsdL) { try { nsd.stopServiceDiscovery(l); } catch (Throwable t) { } } } catch (Throwable t) { }
        nsdL.clear();
        synchronized (resolveQ) { resolveQ.clear(); }
    }
    // Une résolution à la fois (limite d'Android avant la version 14)
    @SuppressWarnings("deprecation")
    private void nextResolve() {
        if (resolving || nsd == null) return;
        final NsdServiceInfo si;
        synchronized (resolveQ) { si = resolveQ.poll(); }
        if (si == null) return;
        resolving = true;
        final Runnable guard = new Runnable() { public void run() { resolving = false; nextResolve(); } };
        ui.postDelayed(guard, 4000);
        try {
            nsd.resolveService(si, new NsdManager.ResolveListener() {
                public void onResolveFailed(NsdServiceInfo s, int e) { ui.removeCallbacks(guard); resolving = false; ui.post(new Runnable() { public void run() { nextResolve(); } }); }
                public void onServiceResolved(NsdServiceInfo s) {
                    ui.removeCallbacks(guard);
                    try {
                        InetAddress h = s.getHost();
                        if (h instanceof Inet4Address) {
                            JSONObject o = new JSONObject();
                            o.put("ip", h.getHostAddress()); o.put("name", s.getServiceName()); o.put("type", s.getServiceType()); o.put("src", "mdns"); o.put("port", s.getPort());
                            Map<String, byte[]> at = s.getAttributes();
                            JSONObject txt = new JSONObject();
                            if (at != null) for (String k : new String[]{ "fn", "md", "model", "ty", "product", "usb_MDL", "manufacturer", "usb_MFG", "am", "n" }) {
                                byte[] v = at.get(k); if (v != null && v.length > 0 && v.length < 200) txt.put(k, new String(v, "UTF-8"));
                            }
                            o.put("txt", txt);
                            emit("lanService", o.toString());
                        }
                    } catch (Throwable t) { }
                    resolving = false;
                    ui.post(new Runnable() { public void run() { nextResolve(); } });
                }
            });
        } catch (Throwable t) { ui.removeCallbacks(guard); resolving = false; }
    }

    /** SSDP / UPnP : M-SEARCH en multidiffusion, puis lecture du nom dans la description de l'appareil. */
    private void ssdp(Network wn) {
        DatagramSocket s = null;
        HashSet<String> seen = new HashSet<>();
        try {
            s = new DatagramSocket();
            try { wn.bindSocket(s); } catch (Throwable t) { }
            s.setSoTimeout(800);
            String msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\nUSER-AGENT: Android/15 UPnP/1.1 Reseau/1.0\r\n\r\n";
            byte[] m = msg.getBytes("US-ASCII");
            InetAddress grp = InetAddress.getByName("239.255.255.250");
            long end = System.currentTimeMillis() + 7000;
            int sent = 0;
            byte[] buf = new byte[4096];
            while (System.currentTimeMillis() < end && !lanStop) {
                if (sent < 3 && System.currentTimeMillis() > end - 7000 + sent * 1500) { s.send(new DatagramPacket(m, m.length, grp, 1900)); sent++; }
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    String r = new String(p.getData(), 0, p.getLength(), "UTF-8");
                    String loc = header(r, "LOCATION");
                    String ip = p.getAddress().getHostAddress();
                    if (loc == null || !seen.add(loc)) continue;
                    final String fl = loc, fip = ip, server = header(r, "SERVER");
                    new Thread(new Runnable() { public void run() { upnpDesc(fip, fl, server); } }).start();
                } catch (SocketTimeoutException e) { }
            }
        } catch (Throwable t) { }
        finally { if (s != null) s.close(); }
    }
    private static String header(String r, String h) {
        for (String line : r.split("\r?\n")) { int i = line.indexOf(':'); if (i > 0 && line.substring(0, i).trim().equalsIgnoreCase(h)) return line.substring(i + 1).trim(); }
        return null;
    }
    private static String tag(String x, String t) {
        Matcher m = Pattern.compile("<" + t + ">\\s*([^<]{1,120}?)\\s*</" + t + ">", Pattern.CASE_INSENSITIVE).matcher(x);
        return m.find() ? m.group(1).replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", "\"").trim() : null;
    }
    private void upnpDesc(String ip, String loc, String server) {
        try {
            JSONObject o = new JSONObject();
            o.put("ip", ip); o.put("src", "upnp");
            if (server != null) o.put("server", server);
            Uri u = Uri.parse(loc);
            if ("http".equals(u.getScheme()) && u.getHost() != null) {
                // Lecture en HTTP brut : le trafic en clair vers la box est souvent bloqué par la politique réseau de l'appli
                Socket so = new Socket();
                so.connect(new InetSocketAddress(u.getHost(), u.getPort() > 0 ? u.getPort() : 80), 2000);
                so.setSoTimeout(2500);
                String path = u.getEncodedPath() == null || u.getEncodedPath().isEmpty() ? "/" : u.getEncodedPath() + (u.getEncodedQuery() != null ? "?" + u.getEncodedQuery() : "");
                OutputStream out = so.getOutputStream();
                out.write(("GET " + path + " HTTP/1.0\r\nHost: " + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "") + "\r\nUser-Agent: Reseau/1.0\r\nConnection: close\r\n\r\n").getBytes("US-ASCII"));
                out.flush();
                InputStream in = so.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
                while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > 65536) break; }
                so.close();
                String x = new String(bo.toByteArray(), "UTF-8");
                String fn = tag(x, "friendlyName"), mf = tag(x, "manufacturer"), md = tag(x, "modelName"), dt = tag(x, "deviceType");
                if (fn != null) o.put("name", fn);
                if (mf != null) o.put("maker", mf);
                if (md != null) o.put("model", md);
                if (dt != null) o.put("type", dt);
            }
            emit("lanService", o.toString());
        } catch (Throwable t) {
            try { emit("lanService", new JSONObject().put("ip", ip).put("src", "upnp").put("server", server == null ? "" : server).toString()); } catch (Exception e) { }
        }
    }

    // ---------- Outils ----------
    private volatile Process pingProc = null;
    private volatile boolean toolStop = false;
    private static final Pattern HOST_OK = Pattern.compile("^[A-Za-z0-9._:\\-]{1,253}$");

    @JavascriptInterface public void toolStop() { toolStop = true; Process p = pingProc; if (p != null) try { p.destroy(); } catch (Throwable t) { } }

    private static String pingBin(boolean v6) {
        String[] c = v6 ? new String[]{ "/system/bin/ping6", "/system/bin/ping" } : new String[]{ "/system/bin/ping" };
        for (String s : c) if (new java.io.File(s).exists()) return s;
        return null;
    }

    /** Ping. Événements « ping » {seq, ms | lost, ip} et « pingDone » {ok, sent, recv, loss, min, avg, max, ip, method} */
    @JavascriptInterface public void ping(final String host, final int countIn) {
        toolStop = false;
        new Thread(new Runnable() { public void run() {
            int count = Math.max(1, Math.min(50, countIn));
            JSONObject done = new JSONObject();
            try {
                String h = host == null ? "" : host.trim();
                if (!HOST_OK.matcher(h).matches()) throw new UnknownHostException("Adresse invalide");
                InetAddress ad = InetAddress.getByName(h);
                String ip = ad.getHostAddress();
                done.put("ip", ip);
                String bin = pingBin(ad instanceof Inet6Address);
                boolean viaBin = false;
                List<Double> times = new ArrayList<>();
                int sent = 0;
                if (bin != null) {
                    try {
                        Process p = new ProcessBuilder(bin, "-c", String.valueOf(count), "-W", "2", "-i", "1", ip).redirectErrorStream(true).start();
                        pingProc = p;
                        BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
                        String line; Pattern pt = Pattern.compile("icmp_seq=(\\d+).*time[=<]([\\d.]+)");
                        Pattern tx = Pattern.compile("(\\d+) packets transmitted");
                        int lastSeq = 0;
                        while ((line = br.readLine()) != null) {
                            Matcher m = pt.matcher(line);
                            if (m.find()) {
                                viaBin = true;
                                int seq = Integer.parseInt(m.group(1)); double ms = Double.parseDouble(m.group(2));
                                for (int k = lastSeq + 1; k < seq; k++) emit("ping", "{\"seq\":" + k + ",\"lost\":true}");
                                lastSeq = seq; times.add(ms);
                                emit("ping", "{\"seq\":" + seq + ",\"ms\":" + ms + "}");
                            }
                            Matcher t2 = tx.matcher(line); if (t2.find()) { sent = Integer.parseInt(t2.group(1)); viaBin = true; }
                        }
                        p.waitFor();
                        pingProc = null;
                        for (int k = lastSeq + 1; k <= sent; k++) emit("ping", "{\"seq\":" + k + ",\"lost\":true}");
                    } catch (Throwable t) { viaBin = false; times.clear(); }
                }
                if (!viaBin && !toolStop) {
                    // Repli : InetAddress.isReachable (ICMP si possible, sinon TCP port 7)
                    sent = 0; times.clear();
                    for (int i = 1; i <= count && !toolStop; i++) {
                        long t0 = System.nanoTime(); sent++;
                        boolean r = false; try { r = ad.isReachable(2000); } catch (Throwable t) { }
                        double ms = (System.nanoTime() - t0) / 1e6;
                        if (r) { times.add(round1(ms)); emit("ping", "{\"seq\":" + i + ",\"ms\":" + round1(ms) + "}"); }
                        else emit("ping", "{\"seq\":" + i + ",\"lost\":true}");
                        long wait = 1000 - (long) ms; if (wait > 0 && i < count) Thread.sleep(wait);
                    }
                    done.put("method", "isReachable");
                } else done.put("method", "ping");
                if (sent == 0) sent = Math.max(times.size(), count);
                done.put("ok", true); done.put("sent", sent); done.put("recv", times.size());
                done.put("loss", Math.round((sent - times.size()) * 100.0 / sent));
                if (!times.isEmpty()) {
                    double mn = 1e9, mx = 0, sum = 0; for (double v : times) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; }
                    done.put("min", round1(mn)); done.put("avg", round1(sum / times.size())); done.put("max", round1(mx));
                }
                if (toolStop) done.put("stopped", true);
            } catch (UnknownHostException e) {
                try { done.put("ok", false); done.put("err", "unknownhost"); } catch (Exception x) { }
            } catch (Throwable t) {
                try { done.put("ok", false); done.put("err", err(t, "Échec")); } catch (Exception x) { }
            }
            pingProc = null;
            emit("pingDone", done.toString());
        } }).start();
    }

    /** Traceroute par ping à durée de vie croissante (sans root). « trace » {ttl, ip, ms} puis « traceDone » {ok, reached, err:"unsupported"} */
    @JavascriptInterface public void traceroute(final String host) {
        toolStop = false;
        new Thread(new Runnable() { public void run() {
            JSONObject done = new JSONObject();
            try {
                String h = host == null ? "" : host.trim();
                if (!HOST_OK.matcher(h).matches()) throw new UnknownHostException();
                InetAddress ad = null;
                for (InetAddress x : InetAddress.getAllByName(h)) if (x instanceof Inet4Address) { ad = x; break; }
                if (ad == null) throw new UnknownHostException();
                String ip = ad.getHostAddress(); done.put("ip", ip);
                String bin = pingBin(false);
                if (bin == null) { done.put("ok", false); done.put("err", "unsupported"); emit("traceDone", done.toString()); return; }
                Pattern from = Pattern.compile("[Ff]rom ([0-9.]+)"), reply = Pattern.compile("bytes from ([0-9.]+).*time[=<]([\\d.]+)");
                boolean reached = false; int answered = 0;
                for (int ttl = 1; ttl <= 30 && !toolStop && !reached; ttl++) {
                    long t0 = System.nanoTime();
                    Process p = new ProcessBuilder(bin, "-c", "1", "-W", "2", "-t", String.valueOf(ttl), ip).redirectErrorStream(true).start();
                    pingProc = p;
                    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
                    String line, hop = null; double ms = -1;
                    while ((line = br.readLine()) != null) {
                        Matcher r = reply.matcher(line);
                        if (r.find()) { hop = r.group(1); ms = Double.parseDouble(r.group(2)); reached = true; continue; }
                        Matcher f = from.matcher(line);
                        if (f.find() && hop == null && !line.contains("bytes from")) { hop = f.group(1); ms = (System.nanoTime() - t0) / 1e6; }
                    }
                    p.waitFor(); pingProc = null;
                    if (hop != null) answered++;
                    JSONObject o = new JSONObject(); o.put("ttl", ttl); if (hop != null) o.put("ip", hop); if (ms >= 0) o.put("ms", round1(ms)); if (reached) o.put("end", true);
                    emit("trace", o.toString());
                    if (ttl == 4 && answered == 0) { done.put("ok", false); done.put("err", "unsupported"); emit("traceDone", done.toString()); return; }
                }
                done.put("ok", true); done.put("reached", reached); if (toolStop) done.put("stopped", true);
            } catch (UnknownHostException e) { try { done.put("ok", false); done.put("err", "unknownhost"); } catch (Exception x) { } }
            catch (Throwable t) { try { done.put("ok", false); done.put("err", err(t, "unsupported")); } catch (Exception x) { } }
            pingProc = null;
            emit("traceDone", done.toString());
        } }).start();
    }

    /** Recherche DNS. Événement « dns » {ok, host, v4:[], v6:[], ms, name} */
    @JavascriptInterface public void dns(final String host) {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                String h = host == null ? "" : host.trim();
                o.put("host", h);
                if (!HOST_OK.matcher(h).matches()) throw new UnknownHostException();
                long t0 = System.nanoTime();
                InetAddress[] all = InetAddress.getAllByName(h);
                o.put("ms", round1((System.nanoTime() - t0) / 1e6));
                JSONArray v4 = new JSONArray(), v6 = new JSONArray();
                for (InetAddress x : all) { if (x instanceof Inet4Address) v4.put(x.getHostAddress()); else v6.put(x.getHostAddress().replaceAll("%.*$", "")); }
                o.put("v4", v4); o.put("v6", v6);
                if (h.matches("^[0-9.]+$") || h.contains(":")) { String n = all[0].getCanonicalHostName(); if (n != null && !n.equals(h)) o.put("name", n); }
                o.put("ok", true);
            } catch (UnknownHostException e) { try { o.put("ok", false); o.put("err", "unknownhost"); } catch (Exception x) { } }
            catch (Throwable t) { try { o.put("ok", false); o.put("err", err(t, "Échec")); } catch (Exception x) { } }
            emit("dns", o.toString());
        } }).start();
    }

    /** Test d'un port TCP. Événement « port » {ok, state: open|closed|timeout|unreach, ms, ip} ou {ok:false, err:"unknownhost"} */
    @JavascriptInterface public void portTest(final String host, final int port, final int timeoutMs) {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("host", host); o.put("port", port);
                String h = host == null ? "" : host.trim();
                if (!HOST_OK.matcher(h).matches() || port < 1 || port > 65535) throw new UnknownHostException();
                InetAddress ad = InetAddress.getByName(h);
                o.put("ip", ad.getHostAddress());
                Socket s = new Socket();
                long t0 = System.nanoTime();
                try { s.connect(new InetSocketAddress(ad, port), Math.max(500, Math.min(10000, timeoutMs))); o.put("state", "open"); }
                catch (SocketTimeoutException e) { o.put("state", "timeout"); }
                catch (IOException e) { String m = String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT); o.put("state", m.contains("refused") ? "closed" : "unreach"); }
                finally { try { s.close(); } catch (Throwable t) { } }
                o.put("ms", round1((System.nanoTime() - t0) / 1e6));
                o.put("ok", true);
            } catch (UnknownHostException e) { try { o.put("ok", false); o.put("err", "unknownhost"); } catch (Exception x) { } }
            catch (Throwable t) { try { o.put("ok", false); o.put("err", err(t, "Échec")); } catch (Exception x) { } }
            emit("port", o.toString());
        } }).start();
    }

    // ---------- Position (relevés de couverture, lien ARCEP) ----------
    private boolean pendingLocate = false, locBusy = false;

    /** Événement « location » {ok, lat, lon, acc, at} ou {ok:false, err:"perm"|"off"|"timeout"} */
    @JavascriptInterface public void locate() {
        ui.post(new Runnable() { public void run() {
            if (hasLoc()) { locateNow(); return; }
            pendingLocate = true;
            prefs().edit().putBoolean("locAsked", true).apply();
            try { a.requestPermissions(new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOC); }
            catch (Throwable t) { pendingLocate = false; emit("location", "{\"ok\":false,\"err\":\"perm\"}"); }
        } });
    }

    @SuppressWarnings({"MissingPermission", "deprecation"})
    private void locateNow() {
        if (locBusy) return;
        if (!locOn()) { emit("location", "{\"ok\":false,\"err\":\"off\"}"); return; }
        final LocationManager lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
        locBusy = true;
        final boolean[] sent = { false };
        final LocationListener[] hold = { null };
        final Runnable timeout = new Runnable() { public void run() {
            if (sent[0]) return;
            sent[0] = true; locBusy = false;
            try { if (hold[0] != null) lm.removeUpdates(hold[0]); } catch (Throwable t) { }
            Location best = null;
            try { for (String p : lm.getProviders(true)) { Location l = lm.getLastKnownLocation(p); if (l != null && (best == null || l.getTime() > best.getTime())) best = l; } } catch (Throwable t) { }
            if (best != null) sendLoc(best, true); else emit("location", "{\"ok\":false,\"err\":\"timeout\"}");
        } };
        try {
            LocationListener ll = new LocationListener() {
                public void onLocationChanged(Location l) {
                    if (sent[0] || l == null) return;
                    if (l.hasAccuracy() && l.getAccuracy() > 60 && l.getProvider() != null && l.getProvider().equals(LocationManager.NETWORK_PROVIDER)) { sendLoc(l, false); return; }
                    sent[0] = true; locBusy = false; ui.removeCallbacks(timeout);
                    try { lm.removeUpdates(this); } catch (Throwable t) { }
                    sendLoc(l, false);
                }
                public void onStatusChanged(String p, int s, Bundle b) { }
                public void onProviderEnabled(String p) { }
                public void onProviderDisabled(String p) { }
            };
            hold[0] = ll;
            boolean any = false;
            for (String p : new String[]{ LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                try { if (lm.isProviderEnabled(p) && (hasFine() || !LocationManager.GPS_PROVIDER.equals(p))) { lm.requestLocationUpdates(p, 1000, 0, ll, Looper.getMainLooper()); any = true; } } catch (Throwable t) { }
            }
            ui.postDelayed(timeout, any ? 20000 : 10);
        } catch (Throwable t) { ui.post(timeout); }
    }
    private void sendLoc(Location l, boolean old) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", true); o.put("lat", l.getLatitude()); o.put("lon", l.getLongitude());
            o.put("acc", l.hasAccuracy() ? Math.round(l.getAccuracy()) : -1); o.put("at", l.getTime()); o.put("old", old);
            emit("location", o.toString());
        } catch (Exception e) { }
    }

    // ---------- Réglages Android, partage, liens ----------
    /** what : wifi | data | hotspot | airplane | vpn | location | app | internet | roaming */
    @JavascriptInterface public void openSettings(final String what) {
        ui.post(new Runnable() { public void run() {
            List<Intent> l = new ArrayList<>();
            if ("wifi".equals(what)) { if (Build.VERSION.SDK_INT >= 29) l.add(new Intent(Settings.Panel.ACTION_WIFI)); l.add(new Intent(Settings.ACTION_WIFI_SETTINGS)); }
            else if ("internet".equals(what)) { if (Build.VERSION.SDK_INT >= 29) l.add(new Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)); l.add(new Intent(Settings.ACTION_WIRELESS_SETTINGS)); }
            else if ("data".equals(what)) { l.add(new Intent("android.settings.NETWORK_OPERATOR_SETTINGS")); l.add(new Intent(Settings.ACTION_DATA_ROAMING_SETTINGS)); l.add(new Intent(Settings.ACTION_WIRELESS_SETTINGS)); }
            else if ("roaming".equals(what)) { l.add(new Intent(Settings.ACTION_DATA_ROAMING_SETTINGS)); }
            else if ("hotspot".equals(what)) {
                l.add(new Intent("android.settings.TETHER_SETTINGS"));
                l.add(new Intent().setClassName("com.android.settings", "com.android.settings.TetherSettings"));
                l.add(new Intent().setClassName("com.android.settings", "com.android.settings.Settings$TetherSettingsActivity"));
                l.add(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
            }
            else if ("airplane".equals(what)) l.add(new Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS));
            else if ("vpn".equals(what)) l.add(new Intent(Settings.ACTION_VPN_SETTINGS));
            else if ("location".equals(what)) l.add(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            else if ("app".equals(what)) l.add(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName())));
            l.add(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
            l.add(new Intent(Settings.ACTION_SETTINGS));
            for (Intent i : l) {
                try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(i); return; } catch (Throwable t) { }
            }
            toast("Réglage introuvable sur ce téléphone");
        } });
    }

    @JavascriptInterface public void share(final String text) {
        ui.post(new Runnable() { public void run() {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Partager")); } catch (Throwable t) { toast("Partage impossible"); }
        } });
    }

    @JavascriptInterface public void openUrl(final String url) {
        ui.post(new Runnable() { public void run() {
            try {
                if (url == null || !url.startsWith("https://")) return;
                a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable t) { toast("Impossible d'ouvrir le lien"); }
        } });
    }

    private void toast(final String t) { ui.post(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } }); }
}
