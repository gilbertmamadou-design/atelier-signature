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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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

    // ================= ONVIF : adresse officielle du flux (GetCapabilities › GetProfiles › GetStreamUri) =================
    static final class Http { int code; String head = "", body = ""; }
    /** POST HTTP/1.0 sur une connexion simple (réseau local), identification HTTP Digest si la caméra la demande */
    static Http post(String url, String xml, String user, String pwd) throws Exception {
        java.net.URI u = new java.net.URI(url);
        String host = u.getHost(); int port = u.getPort() > 0 ? u.getPort() : 80;
        String path = (u.getRawPath() == null || u.getRawPath().isEmpty() ? "/" : u.getRawPath()) + (u.getRawQuery() != null ? "?" + u.getRawQuery() : "");
        if (!privateIp(host)) throw new Exception("ip");
        String auth = null;
        for (int round = 0; round < 2; round++) {
            Socket so = new Socket();
            try {
                so.connect(new InetSocketAddress(host, port), 2500); so.setSoTimeout(5000);
                byte[] b = xml.getBytes("UTF-8");
                String req = "POST " + path + " HTTP/1.0\r\nHost: " + host + ":" + port + "\r\nContent-Type: application/soap+xml; charset=utf-8\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n" + (auth != null ? "Authorization: " + auth + "\r\n" : "") + "\r\n";
                OutputStream o = so.getOutputStream(); o.write(req.getBytes("UTF-8")); o.write(b); o.flush();
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); InputStream in = so.getInputStream(); byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) > 0 && bo.size() < 2000000) bo.write(buf, 0, n);
                String all = new String(bo.toByteArray(), "UTF-8"); int sep = all.indexOf("\r\n\r\n");
                Http h = new Http(); h.head = sep >= 0 ? all.substring(0, sep) : all; h.body = sep >= 0 ? all.substring(sep + 4) : "";
                Matcher st = Pattern.compile("^HTTP/1\\.\\d (\\d{3})").matcher(h.head); h.code = st.find() ? Integer.parseInt(st.group(1)) : 0;
                if (h.code != 401 || auth != null || user == null || user.isEmpty()) return h;
                Matcher w = Pattern.compile("(?im)^WWW-Authenticate:\\s*Digest\\s+(.+)$").matcher(h.head);
                if (!w.find()) return h;
                String d = w.group(1), realm = param(d, "realm"), nonce = param(d, "nonce"), qop = param(d, "qop"), cn = Long.toHexString(System.nanoTime());
                String ha1 = md5(user + ":" + realm + ":" + pwd), ha2 = md5("POST:" + path);
                if (qop.contains("auth")) auth = "Digest username=\"" + user + "\", realm=\"" + realm + "\", nonce=\"" + nonce + "\", uri=\"" + path + "\", qop=auth, nc=00000001, cnonce=\"" + cn + "\", response=\"" + md5(ha1 + ":" + nonce + ":00000001:" + cn + ":auth:" + ha2) + "\"";
                else auth = "Digest username=\"" + user + "\", realm=\"" + realm + "\", nonce=\"" + nonce + "\", uri=\"" + path + "\", response=\"" + md5(ha1 + ":" + nonce + ":" + ha2) + "\"";
            } finally { try { so.close(); } catch (Throwable t) { } }
        }
        return new Http();
    }
    /** Enveloppe SOAP avec jeton WS-Security (UsernameToken, mot de passe condensé) */
    static String soap(String body, String user, String pwd) throws Exception {
        String sec = "";
        if (user != null && !user.isEmpty()) {
            byte[] nonce = new byte[16]; new java.security.SecureRandom().nextBytes(nonce);
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US); f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            String created = f.format(new java.util.Date());
            MessageDigest sha = MessageDigest.getInstance("SHA-1"); sha.update(nonce); sha.update(created.getBytes("UTF-8")); sha.update(pwd.getBytes("UTF-8"));
            String dg = android.util.Base64.encodeToString(sha.digest(), android.util.Base64.NO_WRAP), nb = android.util.Base64.encodeToString(nonce, android.util.Base64.NO_WRAP);
            sec = "<s:Header><Security s:mustUnderstand=\"1\" xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\"><UsernameToken><Username>" + xmlEsc(user) + "</Username>"
                + "<Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest\">" + dg + "</Password>"
                + "<Nonce EncodingType=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary\">" + nb + "</Nonce>"
                + "<Created xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd\">" + created + "</Created></UsernameToken></Security></s:Header>";
        }
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\">" + sec + "<s:Body>" + body + "</s:Body></s:Envelope>";
    }
    static String xmlEsc(String s) { return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
    static String unXml(String s) { return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").trim(); }
    static Http call(String url, String body, String user, String pwd) throws Exception { return post(url, soap(body, user, pwd), user, pwd); }

    /** Adresses RTSP par ONVIF ; null si la caméra ne répond pas en ONVIF. diag : ce qui s'est passé */
    static String[] onvif(String ip, String xaddr, String user, String pwd, StringBuilder diag) {
        List<String> devs = new ArrayList<>();
        if (xaddr != null && xaddr.startsWith("http")) devs.add(xaddr);
        for (int p : new int[]{ 8000, 80, 8080, 2020, 6688, 8899, 5000 }) devs.add("http://" + ip + (p == 80 ? "" : ":" + p) + "/onvif/device_service");
        for (String dev : devs) {
            try {
                String host = new java.net.URI(dev).getHost(); int port = new java.net.URI(dev).getPort(); if (port <= 0) port = 80;
                if (!ip.equals(host) || !open(ip, port)) continue;
                Http h = call(dev, "<GetCapabilities xmlns=\"http://www.onvif.org/ver10/device/wsdl\"><Category>Media</Category></GetCapabilities>", user, pwd);
                diag.append("ONVIF ").append(port).append(" : ").append(h.code).append("; ");
                if (h.code == 401 || h.body.contains("NotAuthorized")) { diag.append("refus; "); return new String[]{ "auth" }; }
                String media = dev;
                Matcher m = Pattern.compile("Media>\\s*<[^>]*XAddr>([^<]+)<").matcher(h.body); if (m.find()) media = unXml(m.group(1));
                try { java.net.URI mu = new java.net.URI(media); if (!ip.equals(mu.getHost())) media = "http://" + ip + ":" + (mu.getPort() > 0 ? mu.getPort() : 80) + mu.getRawPath(); } catch (Throwable t) { media = dev; }
                Http pr = call(media, "<GetProfiles xmlns=\"http://www.onvif.org/ver10/media/wsdl\"/>", user, pwd);
                if (pr.code == 401 || pr.body.contains("NotAuthorized")) { diag.append("profils refusés; "); return new String[]{ "auth" }; }
                Matcher tk = Pattern.compile("Profiles[^>]*token=\"([^\"]+)\"").matcher(pr.body);
                List<String> tokens = new ArrayList<>(); while (tk.find()) if (!tokens.contains(tk.group(1))) tokens.add(tk.group(1));
                diag.append(tokens.size()).append(" profil(s); ");
                List<String> uris = new ArrayList<>();
                for (String t : tokens) {
                    Http su = call(media, "<GetStreamUri xmlns=\"http://www.onvif.org/ver10/media/wsdl\"><StreamSetup><Stream xmlns=\"http://www.onvif.org/ver10/schema\">RTP-Unicast</Stream><Transport xmlns=\"http://www.onvif.org/ver10/schema\"><Protocol>RTSP</Protocol></Transport></StreamSetup><ProfileToken>" + xmlEsc(t) + "</ProfileToken></GetStreamUri>", user, pwd);
                    Matcher um = Pattern.compile("<[^>]*Uri>([^<]+)<").matcher(su.body);
                    if (um.find()) uris.add(unXml(um.group(1)));
                    if (uris.size() >= 2) break;
                }
                if (!uris.isEmpty()) { diag.append("flux : ").append(uris.get(0).replaceAll("//[^@/]*@", "//")); return uris.toArray(new String[0]); }
            } catch (Throwable t) { diag.append("erreur ").append(t.getClass().getSimpleName()).append("; "); }
        }
        return null;
    }

    @JavascriptInterface public void probe(final String id, final String ip, final String user, final String pwd, final String xaddr) {
        new Thread(new Runnable() { public void run() {
            JSONObject ev = new JSONObject(); StringBuilder diag = new StringBuilder();
            try {
                ev.put("op", "probe").put("id", id);
                if (!privateIp(ip)) { ev.put("ok", false).put("err", "ip"); emit(ev); return; }
                boolean refused = false;
                // 1. ONVIF : la caméra donne elle-même l'adresse de ses flux
                String[] u = onvif(ip, xaddr, user, pwd, diag);
                if (u != null && u.length == 1 && "auth".equals(u[0])) refused = true;
                else if (u != null) {
                    java.net.URI m = new java.net.URI(u[0]);
                    String main = (m.getRawPath() == null ? "/" : m.getRawPath()) + (m.getRawQuery() != null ? "?" + m.getRawQuery() : "");
                    int port = m.getPort() > 0 ? m.getPort() : 554, code = describe(ip, port, main, user, pwd);
                    diag.append(" | DESCRIBE ").append(code);
                    String sub = "";
                    if (u.length > 1) { java.net.URI sm = new java.net.URI(u[1]); if ((sm.getPort() > 0 ? sm.getPort() : 554) == port) sub = (sm.getRawPath() == null ? "/" : sm.getRawPath()) + (sm.getRawQuery() != null ? "?" + sm.getRawQuery() : ""); }
                    if (code == 401) refused = true;
                    else { ev.put("ok", true).put("port", port).put("main", main).put("sub", sub).put("diag", diag.toString()); emit(ev); return; }
                }
                // 2. adresses habituelles
                boolean any = false;
                for (int port : new int[]{ 8554, 554 }) {
                    if (!open(ip, port)) continue;
                    any = true; diag.append(" | RTSP ").append(port).append(" :");
                    for (int i = 0; i < MAIN.length; i++) {
                        int c = describe(ip, port, MAIN[i], user, pwd);
                        diag.append(' ').append(c);
                        if (c == 401) { refused = true; continue; }
                        if (c == 200) {
                            String sub = "";
                            if (!SUB[i].isEmpty() && describe(ip, port, SUB[i], user, pwd) == 200) sub = SUB[i];
                            ev.put("ok", true).put("port", port).put("main", MAIN[i]).put("sub", sub).put("diag", diag.toString());
                            emit(ev); return;
                        }
                    }
                }
                ev.put("ok", false).put("err", refused ? "auth" : !any && u == null ? "closed" : "path").put("diag", diag.toString());
            } catch (Throwable t) { try { ev.put("ok", false).put("err", "closed").put("diag", diag.append(t.getClass().getSimpleName()).toString()); } catch (Throwable e) { } }
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
