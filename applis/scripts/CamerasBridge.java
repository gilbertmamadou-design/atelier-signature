package __PKG__;

/* Caméras : pont de la page (MAGCameras), appli Caméras seulement.
   - discover() : recherche ONVIF sur le Wi-Fi (WS-Discovery, multicast 239.255.255.250:3702), 4 s → adresses des caméras ;
   - probe(id, ip, user, pwd) : trouve l'adresse RTSP du flux principal et du flux réduit (requête DESCRIBE, identification
     Basic ou Digest) sur les ports 8554 et 554 ;
   - show(json, index) : ouvre la mosaïque plein écran (CamerasViewer, lecteur ExoPlayer RTSP) ; index ≥ 0 : une caméra.
   Réseau local seulement (adresses privées) ; identifiants gardés par la page dans le stockage privé de l'appli. */

import android.app.Activity;
import android.content.Context;
import android.app.PendingIntent;
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
    static final String[] MAIN = { "/Streaming/Channels/101", "/stream1", "/onvif1", "/live/ch00_0", "/11", "/h264_stream", "/live/main", "/av0_0", "/ch0_0.h264", "/0", "/live/0/MAIN", "/media/video1", "/h264/ch1/main/av_stream", "/cam/realmonitor?channel=1&subtype=0", "/videoMain", "/live1.sdp", "/ucast/11", "/profile0", "/mainstream", "/live", "/" };
    static final String[] SUB  = { "/Streaming/Channels/102", "/stream2", "/onvif2", "/live/ch00_1", "/12", "", "/live/sub", "/av0_1", "/ch0_1.h264", "/1", "/live/0/SUB", "/media/video2", "/h264/ch1/sub/av_stream", "/cam/realmonitor?channel=1&subtype=1", "/videoSub", "/live2.sdp", "/ucast/12", "/profile1", "/substream", "", "" };

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
    static String soap(String body, String user, String pwd) throws Exception { return soap(body, user, pwd, 0, 0); }
    /** mode 0 : mot de passe condensé (PasswordDigest) ; 1 : en clair (PasswordText, réseau local) ; 2 : sans en-tête. skew : écart d'horloge avec la caméra */
    static String soap(String body, String user, String pwd, int mode, long skew) throws Exception {
        String sec = "";
        if (mode == 1 && user != null && !user.isEmpty()) {
            sec = "<s:Header><Security s:mustUnderstand=\"1\" xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\"><UsernameToken><Username>" + xmlEsc(user) + "</Username>"
                + "<Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText\">" + xmlEsc(pwd) + "</Password></UsernameToken></Security></s:Header>";
        } else if (mode == 0 && user != null && !user.isEmpty()) {
            byte[] nonce = new byte[16]; new java.security.SecureRandom().nextBytes(nonce);
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US); f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            String created = f.format(new java.util.Date(System.currentTimeMillis() + skew));
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
    static Http call(String url, String body, String user, String pwd, int mode, long skew) throws Exception { return post(url, soap(body, user, pwd, mode, skew), user, pwd); }
    static boolean refused(Http h) { return h.code == 401 || h.body.contains("NotAuthorized") || h.body.contains("FailedAuthentication") || h.body.contains("Sender not Authorized"); }
    /** Écart entre l'horloge de la caméra et celle du téléphone (le jeton condensé est refusé si elles diffèrent trop) */
    static long skewOf(String dev) {
        try {
            Http h = post(dev, soap("<GetSystemDateAndTime xmlns=\"http://www.onvif.org/ver10/device/wsdl\"/>", null, null, 2, 0), null, null);
            Matcher u = Pattern.compile("UTCDateTime>([\\s\\S]*?)</[^>]*UTCDateTime>").matcher(h.body);
            if (!u.find()) return 0;
            String x = u.group(1);
            int[] v = new int[6]; String[] k = { "Year", "Month", "Day", "Hour", "Minute", "Second" };
            for (int i = 0; i < 6; i++) { Matcher m = Pattern.compile(k[i] + ">(\\d+)<").matcher(x); if (!m.find()) return 0; v[i] = Integer.parseInt(m.group(1)); }
            java.util.Calendar c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")); c.clear(); c.set(v[0], v[1] - 1, v[2], v[3], v[4], v[5]);
            return c.getTimeInMillis() - System.currentTimeMillis();
        } catch (Throwable t) { return 0; }
    }

    /** Adresses RTSP par ONVIF ; null si la caméra ne répond pas en ONVIF. diag : ce qui s'est passé */
    static String[] onvif(String ip, String xaddr, String user, String pwd, StringBuilder diag) { return onvif(ip, xaddr, user, pwd, diag, new JSONObject()); }
    static String[] onvif(String ip, String xaddr, String user, String pwd, StringBuilder diag, JSONObject ex) {
        List<String> devs = new ArrayList<>();
        if (xaddr != null && xaddr.startsWith("http")) devs.add(xaddr);
        for (int p : new int[]{ 10000, 8000, 80, 8080, 2020, 6688, 8899, 5000 }) devs.add("http://" + ip + (p == 80 ? "" : ":" + p) + "/onvif/device_service");
        for (String dev : devs) {
            try {
                String host = new java.net.URI(dev).getHost(); int port = new java.net.URI(dev).getPort(); if (port <= 0) port = 80;
                if (!ip.equals(host) || !open(ip, port)) continue;
                Http h = call(dev, "<GetCapabilities xmlns=\"http://www.onvif.org/ver10/device/wsdl\"><Category>All</Category></GetCapabilities>", user, pwd);
                if (!h.body.contains("XAddr")) h = call(dev, "<GetCapabilities xmlns=\"http://www.onvif.org/ver10/device/wsdl\"><Category>Media</Category></GetCapabilities>", user, pwd);
                diag.append("ONVIF ").append(port).append(" : ").append(h.code).append("; ");
                if (h.code != 200 && refused(h)) { diag.append("refus; "); }
                String media = dev;
                Matcher m = Pattern.compile("Media>\\s*<[^>]*XAddr>([^<]+)<").matcher(h.body); if (m.find()) media = unXml(m.group(1));
                try { java.net.URI mu = new java.net.URI(media); if (!ip.equals(mu.getHost())) media = "http://" + ip + ":" + (mu.getPort() > 0 ? mu.getPort() : 80) + mu.getRawPath(); } catch (Throwable t) { media = dev; }
                // profils : mot de passe condensé à l'heure de la caméra, puis en clair, puis sans identification
                long skew = skewOf(dev); if (Math.abs(skew) > 5000) diag.append("horloge ").append(skew / 1000).append(" s; ");
                Http pr = null; int mode = -1;
                for (int md = 0; md < 3; md++) {
                    Http t2 = call(media, "<GetProfiles xmlns=\"http://www.onvif.org/ver10/media/wsdl\"/>", user, pwd, md, skew);
                    if (!refused(t2) && t2.body.contains("token=")) { pr = t2; mode = md; break; }
                }
                if (pr == null) { diag.append("profils refusés (3 essais); "); return new String[]{ "auth" }; }
                // caméra motorisée (PTZ) et événements (détection de mouvement) : adresses des services, si la caméra en a
                try {
                    ex.put("dev", dev).put("mode", mode);
                    Matcher pz = Pattern.compile("PTZ>\\s*<[^>]*XAddr>([^<]+)<").matcher(h.body); if (pz.find()) ex.put("ptz", local(ip, unXml(pz.group(1))));
                    Matcher evm = Pattern.compile("Events>\\s*<[^>]*XAddr>([^<]+)<").matcher(h.body); if (evm.find()) ex.put("events", local(ip, unXml(evm.group(1))));
                } catch (Throwable t) { }
                diag.append("ident ").append(mode == 0 ? "condensée" : mode == 1 ? "en clair" : "aucune").append("; ");
                Matcher tk = Pattern.compile("Profiles[^>]*token=\"([^\"]+)\"").matcher(pr.body);
                List<String> tokens = new ArrayList<>(); while (tk.find()) if (!tokens.contains(tk.group(1))) tokens.add(tk.group(1));
                diag.append(tokens.size()).append(" profil(s); ");
                if (!tokens.isEmpty()) try { ex.put("token", tokens.get(0)); } catch (Throwable t) { }
                if (ex.has("ptz")) diag.append("motorisée; "); if (ex.has("events")) diag.append("événements; ");
                List<String> uris = new ArrayList<>();
                for (String t : tokens) {
                    Http su = call(media, "<GetStreamUri xmlns=\"http://www.onvif.org/ver10/media/wsdl\"><StreamSetup><Stream xmlns=\"http://www.onvif.org/ver10/schema\">RTP-Unicast</Stream><Transport xmlns=\"http://www.onvif.org/ver10/schema\"><Protocol>RTSP</Protocol></Transport></StreamSetup><ProfileToken>" + xmlEsc(t) + "</ProfileToken></GetStreamUri>", user, pwd, mode, skew);
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
                JSONObject ex = new JSONObject();
                String[] u = onvif(ip, xaddr, user, pwd, diag, ex);
                if (u != null && u.length == 1 && "auth".equals(u[0])) refused = true;
                else if (u != null) {
                    java.net.URI m = new java.net.URI(u[0]);
                    String main = (m.getRawPath() == null ? "/" : m.getRawPath()) + (m.getRawQuery() != null ? "?" + m.getRawQuery() : "");
                    int port = m.getPort() > 0 ? m.getPort() : 554, code = describe(ip, port, main, user, pwd);
                    diag.append(" | DESCRIBE ").append(code);
                    String sub = "";
                    if (u.length > 1) { java.net.URI sm = new java.net.URI(u[1]); if ((sm.getPort() > 0 ? sm.getPort() : 554) == port) sub = (sm.getRawPath() == null ? "/" : sm.getRawPath()) + (sm.getRawQuery() != null ? "?" + sm.getRawQuery() : ""); }
                    if (code == 401) refused = true;
                    else { ev.put("ok", true).put("port", port).put("main", main).put("sub", sub).put("diag", diag.toString()).put("onvif", ex); emit(ev); return; }
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

    /** Adresse d'un service ONVIF ramenée sur l'adresse IP connue de la caméra (certaines annoncent une autre adresse) */
    static String local(String ip, String url) {
        try { java.net.URI u = new java.net.URI(url); if (ip.equals(u.getHost())) return url; return "http://" + ip + ":" + (u.getPort() > 0 ? u.getPort() : 80) + u.getRawPath(); } catch (Throwable t) { return url; }
    }
    /** Enveloppe SOAP avec WS-Addressing (Action, To), exigé par les abonnements aux événements */
    static String soapWsa(String body, String user, String pwd, int mode, long skew, String action, String to) throws Exception {
        String x = soap(body, user, pwd, mode, skew);
        String wsa = "<wsa:Action xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + action + "</wsa:Action><wsa:To xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + xmlEsc(to) + "</wsa:To>";
        return x.contains("<s:Header>") ? x.replace("<s:Header>", "<s:Header>" + wsa) : x.replace("<s:Body>", "<s:Header>" + wsa + "</s:Header><s:Body>");
    }

    // ================= Caméra motorisée (ONVIF PTZ) =================
    /** dir : left, right, up, down, in, out ; ms > 0 : mouvement puis arrêt ; ms = 0 : mouvement continu ; "stop" : arrêt */
    static boolean ptz(JSONObject c, String dir, int ms) {
        try {
            String url = c.optString("ptz"), tok = c.optString("token"), user = c.optString("user"), pwd = c.optString("pwd");
            if (url.isEmpty() || tok.isEmpty()) return false;
            int mode = c.optInt("mode", 0); long skew = mode == 0 ? skewOf(c.optString("dev", url)) : 0;
            String ns = "http://www.onvif.org/ver20/ptz/wsdl", sc = "http://www.onvif.org/ver10/schema";
            if (!"stop".equals(dir)) {
                float x = "left".equals(dir) ? -0.5f : "right".equals(dir) ? 0.5f : 0f, y = "up".equals(dir) ? 0.5f : "down".equals(dir) ? -0.5f : 0f, z = "in".equals(dir) ? 0.5f : "out".equals(dir) ? -0.5f : 0f;
                String vel = (z != 0 ? "<Zoom x=\"" + z + "\" xmlns=\"" + sc + "\"/>" : "<PanTilt x=\"" + x + "\" y=\"" + y + "\" xmlns=\"" + sc + "\"/>");
                Http h = call(url, "<ContinuousMove xmlns=\"" + ns + "\"><ProfileToken>" + xmlEsc(tok) + "</ProfileToken><Velocity>" + vel + "</Velocity></ContinuousMove>", user, pwd, mode, skew);
                if (h.code >= 400 || refused(h)) return false;
                if (ms <= 0) return true;
                Thread.sleep(ms);
            }
            call(url, "<Stop xmlns=\"" + ns + "\"><ProfileToken>" + xmlEsc(tok) + "</ProfileToken><PanTilt>true</PanTilt><Zoom>true</Zoom></Stop>", user, pwd, mode, skew);
            return true;
        } catch (Throwable t) { return false; }
    }

    // ================= Détection de mouvement (événements ONVIF, abonnement « PullPoint ») =================
    static final String CH_MOVE = "cam_mouvement";
    static final Map<String, String> guardState = java.util.Collections.synchronizedMap(new LinkedHashMap<String, String>());
    static boolean guardOn(Context c) { return c.getSharedPreferences("cameras", Context.MODE_PRIVATE).getBoolean("guard", false); }
    @JavascriptInterface public void guard(boolean on) {
        Context c = a.getApplicationContext();
        c.getSharedPreferences("cameras", Context.MODE_PRIVATE).edit().putBoolean("guard", on).apply();
        if (on && android.os.Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            a.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, 4411);
        Garde.sync(c);
    }
    @JavascriptInterface public void guardFull(boolean on) { a.getSharedPreferences("cameras", Context.MODE_PRIVATE).edit().putBoolean("guardFull", on).apply(); }
    @JavascriptInterface public String guardInfo() { JSONObject o = new JSONObject(); try { o.put("on", guardOn(a)); JSONObject s = new JSONObject(); synchronized (guardState) { for (Map.Entry<String, String> e : guardState.entrySet()) s.put(e.getKey(), e.getValue()); } o.put("cams", s); } catch (Throwable t) { } return o.toString(); }
    @JavascriptInterface public boolean ptzMove(final String camJson, final String dir) {
        new Thread(new Runnable() { public void run() { try { ptz(new JSONObject(camJson), dir, 700); } catch (Throwable t) { } } }).start();
        return true;
    }

    public static class Boot extends android.content.BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) { if (guardOn(c)) Garde.sync(c); }
    }
    public static class Garde extends android.app.Service {
        static volatile boolean running; volatile boolean stop;
        android.os.PowerManager.WakeLock wl; WifiManager.WifiLock wfl;
        static void sync(Context c) {
            Intent i = new Intent(c, Garde.class);
            if (guardOn(c)) { try { if (android.os.Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); } catch (Throwable t) { } }
            else c.stopService(i);
        }
        @Override public android.os.IBinder onBind(Intent i) { return null; }
        android.app.Notification.Builder nb(String ch) { return android.os.Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(this, ch) : new android.app.Notification.Builder(this); }
        void channels() {
            if (android.os.Build.VERSION.SDK_INT < 26) return;
            android.app.NotificationManager m = getSystemService(android.app.NotificationManager.class);
            m.createNotificationChannel(new android.app.NotificationChannel("cam_garde", "Surveillance active", android.app.NotificationManager.IMPORTANCE_MIN));
            android.app.NotificationChannel mv = new android.app.NotificationChannel(CH_MOVE, "Mouvement détecté", android.app.NotificationManager.IMPORTANCE_HIGH); mv.enableVibration(true);
            m.createNotificationChannel(mv);
        }
        PendingIntent viewer(String name, int code) {
            Intent v = new Intent(this, CamerasViewer.class).putExtra("name", name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            return PendingIntent.getActivity(this, code, v, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        }
        @Override public int onStartCommand(Intent in, int f, int id) {
            channels();
            android.app.Notification n = nb("cam_garde").setSmallIcon(getApplicationInfo().icon).setContentTitle("Surveillance des caméras").setContentText("Alerte en cas de mouvement").setOngoing(true).setContentIntent(viewer("", 4400)).build();
            try { if (android.os.Build.VERSION.SDK_INT >= 29) startForeground(4401, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE); else startForeground(4401, n); } catch (Throwable t) { stopSelf(); return START_NOT_STICKY; }
            if (!running) {
                running = true; stop = false;
                try { wl = ((android.os.PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "cameras:garde"); wl.acquire(); } catch (Throwable t) { }
                try { wfl = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "cameras:garde"); wfl.acquire(); } catch (Throwable t) { }
                try {
                    JSONArray l = new JSONArray(getSharedPreferences("cameras", MODE_PRIVATE).getString("cams", "[]"));
                    guardState.clear();
                    for (int i = 0; i < l.length(); i++) {
                        final JSONObject c = l.getJSONObject(i);
                        if (c.optString("events").isEmpty()) { guardState.put(c.optString("name"), "sans détection (ONVIF)"); continue; }
                        if (!c.optBoolean("guard", true)) continue;
                        guardState.put(c.optString("name"), "connexion…");
                        new Thread(new Runnable() { public void run() { watch(c); } }, "cameras-garde").start();
                    }
                } catch (Throwable t) { }
            }
            return START_STICKY;
        }
        @Override public void onDestroy() {
            stop = true; running = false;
            try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable t) { }
            try { if (wfl != null && wfl.isHeld()) wfl.release(); } catch (Throwable t) { }
            super.onDestroy();
        }
        static final Pattern MOTION = Pattern.compile("(?i)Name=\"(IsMotion|State|Motion|MotionActive|MotionAlarm|Alarm)\"\\s+Value=\"(true|1)\"");
        void watch(JSONObject c) {
            String name = c.optString("name"), ev = c.optString("events"), user = c.optString("user"), pwd = c.optString("pwd");
            int mode = c.optInt("mode", 0), fails = 0; long lastAlert = 0;
            String ns = "http://www.onvif.org/ver10/events/wsdl";
            while (!stop) {
                try {
                    long skew = mode == 0 ? skewOf(c.optString("dev", ev)) : 0;
                    Http h = post(ev, soapWsa("<CreatePullPointSubscription xmlns=\"" + ns + "\"><InitialTerminationTime>PT600S</InitialTerminationTime></CreatePullPointSubscription>", user, pwd, mode, skew,
                        ns + "/EventPortType/CreatePullPointSubscriptionRequest", ev), user, pwd);
                    Matcher am = Pattern.compile("SubscriptionReference>[\\s\\S]*?Address>([^<]+)<").matcher(h.body);
                    if (h.code >= 400 || !am.find()) { guardState.put(name, refused(h) ? "identifiants refusés" : "détection non prise en charge"); fails++; Thread.sleep(Math.min(600000, 30000L * fails)); continue; }
                    String sub = local(c.optString("ip", new java.net.URI(ev).getHost()), unXml(am.group(1)));
                    guardState.put(name, "surveillée"); fails = 0;
                    long until = System.currentTimeMillis() + 8 * 60000L;
                    while (!stop && System.currentTimeMillis() < until) {
                        Http pm = post(sub, soapWsa("<PullMessages xmlns=\"" + ns + "\"><Timeout>PT3S</Timeout><MessageLimit>20</MessageLimit></PullMessages>", user, pwd, mode, skew,
                            ns + "/PullPointSubscription/PullMessagesRequest", sub), user, pwd);
                        if (pm.code >= 400 || pm.code == 0) throw new Exception("pull " + pm.code);
                        boolean motion = false;
                        for (String chunk : pm.body.split("NotificationMessage>")) if (chunk.toLowerCase(Locale.ROOT).contains("motion") && MOTION.matcher(chunk).find()) motion = true;
                        if (motion && System.currentTimeMillis() - lastAlert > 60000) { lastAlert = System.currentTimeMillis(); alert(name); }
                        Thread.sleep(500);
                    }
                    try { post(sub, soapWsa("<Unsubscribe xmlns=\"http://docs.oasis-open.org/wsn/b-2\"/>", user, pwd, mode, skew, "http://docs.oasis-open.org/wsn/bw-2/SubscriptionManager/UnsubscribeRequest", sub), user, pwd); } catch (Throwable t) { }
                } catch (Throwable t) {
                    guardState.put(name, "caméra injoignable, nouvel essai…"); fails++;
                    try { Thread.sleep(Math.min(300000, 15000L * fails)); } catch (Throwable e) { }
                }
            }
        }
        void alert(String name) {
            try {
                int code = 4500 + (name.hashCode() & 0xff);
                boolean full = getSharedPreferences("cameras", MODE_PRIVATE).getBoolean("guardFull", false);
                android.app.Notification.Builder b = nb(CH_MOVE).setSmallIcon(getApplicationInfo().icon).setContentTitle("Mouvement : " + name)
                    .setContentText("Touchez pour voir la caméra").setAutoCancel(true).setCategory(android.app.Notification.CATEGORY_ALARM)
                    .setContentIntent(viewer(name, code)).setVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                if (full) b.setFullScreenIntent(viewer(name, code + 1), true);
                ((android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(code, b.build());
            } catch (Throwable t) { }
        }
    }

    // ================= Mosaïque =================
    /** Liste des caméras prêtes, gardée dans les préférences privées de l'appli : Majordome ouvre la mosaïque sans passer par la page */
    @JavascriptInterface public void store(final String json) {
        try { new JSONArray(json); a.getSharedPreferences("cameras", Context.MODE_PRIVATE).edit().putString("cams", json).apply(); } catch (Throwable t) { }
    }
    @JavascriptInterface public void quit() { a.runOnUiThread(new Runnable() { public void run() { try { a.finishAndRemoveTask(); } catch (Throwable t) { a.finish(); } } }); }
    @JavascriptInterface public boolean show(final String json, final int index) {
        try {
            Class<?> k = Class.forName(CamerasBridge.class.getName().replace("CamerasBridge", "CamerasViewer"));
            store(json);
            Intent i = new Intent(a, k).putExtra("cams", json).putExtra("start", index);
            a.startActivity(i);
            return true;
        } catch (Throwable t) { return false; }
    }
}
