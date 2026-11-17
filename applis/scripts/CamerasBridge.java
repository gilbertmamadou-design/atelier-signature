package __PKG__;

/* Caméras : pont de la page (MAGCameras), appli Caméras seulement.
   - discover() : recherche ONVIF sur le Wi-Fi (WS-Discovery, multicast 239.255.255.250:3702), 4 s → adresses des caméras ;
   - probe(id, ip, user, pwd) : trouve l'adresse RTSP du flux principal et du flux réduit (requête DESCRIBE, identification
     Basic ou Digest) sur les ports 8554 et 554 ;
   - show(json, index) : ouvre la mosaïque plein écran (CamerasViewer, lecteur ExoPlayer RTSP) ; index ≥ 0 : une caméra.
   Réseau local seulement (adresses privées) ; identifiants gardés par la page dans le stockage privé de l'appli. */

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class CamerasBridge {
    private final Activity a;
    private final WebView wv;

    public CamerasBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    private void emit(final JSONObject o) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { wv.evaluateJavascript("window.camerasEvent&&camerasEvent(" + JSONObject.quote(o.toString()) + ")", null); } catch (Throwable t) { }
        } });
    }

    static boolean privateIp(String ip) {
        if (ip == null || !ip.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
        String[] p = ip.split("\\."); int a0 = Integer.parseInt(p[0]), a1 = Integer.parseInt(p[1]);
        return a0 == 10 || (a0 == 192 && a1 == 168) || (a0 == 172 && a1 >= 16 && a1 <= 31);
    }

    // ================= Recherche ONVIF (WS-Discovery) =================
    @JavascriptInterface public void discover() {
        new Thread(new Runnable() { public void run() {
            JSONObject ev = new JSONObject(); JSONArray list = new JSONArray();
            WifiManager.MulticastLock lock = null; MulticastSocket s = null;
            try {
                WifiManager wm = (WifiManager) a.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) { lock = wm.createMulticastLock("cameras"); lock.setReferenceCounted(false); lock.acquire(); }
                String msg = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><e:Envelope xmlns:e=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:w=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\" xmlns:d=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\" xmlns:dn=\"http://www.onvif.org/ver10/network/wsdl\">"
                    + "<e:Header><w:MessageID>uuid:" + UUID.randomUUID() + "</w:MessageID><w:To e:mustUnderstand=\"true\">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand=\"true\">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>"
                    + "<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>";
                byte[] b = msg.getBytes("UTF-8");
                s = new MulticastSocket(); s.setSoTimeout(600);
                InetAddress grp = InetAddress.getByName("239.255.255.250");
                for (int i = 0; i < 2; i++) s.send(new DatagramPacket(b, b.length, grp, 3702));
                long end = System.currentTimeMillis() + 4000;
                Map<String, JSONObject> seen = new LinkedHashMap<>();
                byte[] buf = new byte[65535];
                while (System.currentTimeMillis() < end) {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try { s.receive(p); } catch (SocketTimeoutException e) { continue; }
                    String ip = p.getAddress().getHostAddress();
                    if (!privateIp(ip) || seen.containsKey(ip)) continue;
                    String x = new String(p.getData(), 0, p.getLength(), "UTF-8");
                    JSONObject o = new JSONObject().put("ip", ip);
                    Matcher m = Pattern.compile("<[^>]*XAddrs>([^<]+)<").matcher(x); if (m.find()) o.put("xaddr", m.group(1).trim().split("\\s+")[0]);
                    Matcher sc = Pattern.compile("<[^>]*Scopes[^>]*>([^<]+)<").matcher(x);
                    if (sc.find()) {
                        for (String scope : sc.group(1).trim().split("\\s+")) {
                            String low = scope.toLowerCase(Locale.ROOT);
                            if (low.contains("/name/")) o.put("name", java.net.URLDecoder.decode(scope.substring(low.indexOf("/name/") + 6), "UTF-8"));
                            if (low.contains("/hardware/")) o.put("model", java.net.URLDecoder.decode(scope.substring(low.indexOf("/hardware/") + 10), "UTF-8"));
                        }
                    }
                    seen.put(ip, o);
                }
                for (JSONObject o : seen.values()) list.put(o);
                ev.put("op", "discover").put("list", list);
            } catch (Throwable t) { try { ev.put("op", "discover").put("list", list).put("err", String.valueOf(t.getMessage())); } catch (Throwable e) { } }
            finally { try { if (s != null) s.close(); } catch (Throwable t) { } try { if (lock != null) lock.release(); } catch (Throwable t) { } }
            emit(ev);
        } }, "cameras-discover").start();
    }

    // ================= Adresse RTSP du flux =================
    static final String[] MAIN = { "/Streaming/Channels/101", "/stream1", "/onvif1", "/live/ch00_0", "/11", "/h264_stream", "/live/main", "/live", "/" };
    static final String[] SUB  = { "/Streaming/Channels/102", "/stream2", "/onvif2", "/live/ch00_1", "/12", "", "/live/sub", "", "" };

    static String md5(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("MD5").digest(s.getBytes("UTF-8"));
        StringBuilder b = new StringBuilder(); for (byte x : d) b.append(String.format("%02x", x)); return b.toString();
    }
    static String param(String h, String k) { Matcher m = Pattern.compile(k + "=\"([^\"]*)\"").matcher(h); return m.find() ? m.group(1) : ""; }

    /** DESCRIBE : 200 trouvé, 404 absent, 401 refusé (mauvais mot de passe), 0 injoignable */
    static int describe(String ip, int port, String path, String user, String pwd) {
        String uri = "rtsp://" + ip + ":" + port + path;
        String auth = null;
        for (int round = 0; round < 2; round++) {
            Socket so = new Socket();
            try {
                so.connect(new InetSocketAddress(ip, port), 2500); so.setSoTimeout(3000);
                OutputStream o = so.getOutputStream(); InputStream in = so.getInputStream();
                String req = "DESCRIBE " + uri + " RTSP/1.0\r\nCSeq: " + (round + 1) + "\r\nAccept: application/sdp\r\nUser-Agent: MAG-Cameras\r\n" + (auth != null ? "Authorization: " + auth + "\r\n" : "") + "\r\n";
                o.write(req.getBytes("UTF-8")); o.flush();
                StringBuilder h = new StringBuilder(); int c, nl = 0;
                while ((c = in.read()) >= 0 && h.length() < 8192) { h.append((char) c); if (c == '\n') { if (++nl >= 2) break; } else if (c != '\r') nl = 0; }
                String head = h.toString();
                Matcher st = Pattern.compile("^RTSP/1\\.\\d (\\d{3})").matcher(head);
                int code = st.find() ? Integer.parseInt(st.group(1)) : 0;
                if (code != 401) return code;
                if (auth != null || user == null || user.isEmpty()) return 401;
                Matcher w = Pattern.compile("(?im)^WWW-Authenticate:\\s*(.+)$").matcher(head);
                String digest = null, basic = null;
                while (w.find()) { String v = w.group(1).trim(); if (v.regionMatches(true, 0, "Digest", 0, 6)) digest = v; else if (v.regionMatches(true, 0, "Basic", 0, 5)) basic = v; }
                if (digest != null) {
                    String realm = param(digest, "realm"), nonce = param(digest, "nonce");
                    String resp = md5(md5(user + ":" + realm + ":" + pwd) + ":" + nonce + ":" + md5("DESCRIBE:" + uri));
                    auth = "Digest username=\"" + user + "\", realm=\"" + realm + "\", nonce=\"" + nonce + "\", uri=\"" + uri + "\", response=\"" + resp + "\"";
                } else if (basic != null) auth = "Basic " + android.util.Base64.encodeToString((user + ":" + pwd).getBytes("UTF-8"), android.util.Base64.NO_WRAP);
                else return 401;
            } catch (Throwable t) { return 0; }
            finally { try { so.close(); } catch (Throwable t) { } }
        }
        return 401;
    }
    static boolean open(String ip, int port) {
        Socket so = new Socket();
        try { so.connect(new InetSocketAddress(ip, port), 2000); return true; } catch (Throwable t) { return false; } finally { try { so.close(); } catch (Throwable t) { } }
    }

    @JavascriptInterface public void probe(final String id, final String ip, final String user, final String pwd) {
        new Thread(new Runnable() { public void run() {
            JSONObject ev = new JSONObject();
            try {
                ev.put("op", "probe").put("id", id);
                if (!privateIp(ip)) { ev.put("ok", false).put("err", "ip"); emit(ev); return; }
                boolean any = false, refused = false;
                for (int port : new int[]{ 8554, 554 }) {
                    if (!open(ip, port)) continue;
                    any = true;
                    for (int i = 0; i < MAIN.length; i++) {
                        int c = describe(ip, port, MAIN[i], user, pwd);
                        if (c == 401) { refused = true; continue; }
                        if (c == 200) {
                            String sub = "";
                            if (!SUB[i].isEmpty() && describe(ip, port, SUB[i], user, pwd) == 200) sub = SUB[i];
                            ev.put("ok", true).put("port", port).put("main", MAIN[i]).put("sub", sub);
                            emit(ev); return;
                        }
                    }
                }
                ev.put("ok", false).put("err", !any ? "closed" : refused ? "auth" : "path");
            } catch (Throwable t) { try { ev.put("ok", false).put("err", "closed"); } catch (Throwable e) { } }
            emit(ev);
        } }, "cameras-probe").start();
    }

    // ================= Mosaïque =================
    @JavascriptInterface public boolean show(final String json, final int index) {
        try {
            Class<?> k = Class.forName(CamerasBridge.class.getName().replace("CamerasBridge", "CamerasViewer"));
            Intent i = new Intent(a, k).putExtra("cams", json).putExtra("start", index);
            a.startActivity(i);
            return true;
        } catch (Throwable t) { return false; }
    }
}
