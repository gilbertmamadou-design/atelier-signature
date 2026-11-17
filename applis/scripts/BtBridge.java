package __PKG__;

/* Bluetooth : appareils jumelés, recherche des appareils proches (Bluetooth classique et basse consommation), jumelage,
   connexion des appareils audio, oubli. Page : MAGBt ; événements window.btEvent(json).
   Android ne donne pas aux applis le droit de « brancher » un casque ou une enceinte déjà jumelés : la connexion est tentée par
   la méthode cachée du profil audio quand le téléphone l'accepte, sinon le réglage Bluetooth s'ouvre (un toucher sur l'appareil). */

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class BtBridge {
    private static final int REQ = 7341;
    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, JSONObject> found = new HashMap<>();
    private BluetoothProfile a2dp, headset;
    private boolean scanning = false;
    private ScanCallback le;

    public BtBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv;
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_FOUND); f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        f.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED); f.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED); f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        f.addAction(BluetoothDevice.ACTION_NAME_CHANGED);
        try { if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(rx, f, Context.RECEIVER_EXPORTED); else a.registerReceiver(rx, f); } catch (Throwable t) { }
        proxies();
    }

    private BluetoothAdapter ad() { try { BluetoothManager m = (BluetoothManager) a.getSystemService(Context.BLUETOOTH_SERVICE); return m == null ? null : m.getAdapter(); } catch (Throwable t) { return null; } }
    private boolean has(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private String[] needed() {
        if (Build.VERSION.SDK_INT >= 31) return new String[]{ "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT" };
        return new String[]{ Manifest.permission.ACCESS_FINE_LOCATION };
    }
    private boolean perms() { for (String p : needed()) if (!has(p)) return false; return true; }

    private void emit(final JSONObject o) {
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript("window.btEvent&&btEvent(" + JSONObject.quote(o.toString()) + ")", null); } catch (Throwable t) { } } });
    }
    private void emit(String op) { try { emit(new JSONObject().put("op", op)); } catch (Throwable t) { } }

    private void proxies() {
        BluetoothAdapter b = ad(); if (b == null || !perms()) return;
        BluetoothProfile.ServiceListener l = new BluetoothProfile.ServiceListener() {
            public void onServiceConnected(int p, BluetoothProfile proxy) { if (p == BluetoothProfile.A2DP) a2dp = proxy; else if (p == BluetoothProfile.HEADSET) headset = proxy; emit("changed"); }
            public void onServiceDisconnected(int p) { if (p == BluetoothProfile.A2DP) a2dp = null; else if (p == BluetoothProfile.HEADSET) headset = null; }
        };
        try { if (a2dp == null) b.getProfileProxy(a, l, BluetoothProfile.A2DP); if (headset == null) b.getProfileProxy(a, l, BluetoothProfile.HEADSET); } catch (Throwable t) { }
    }

    private final BroadcastReceiver rx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String act = i.getAction();
            try {
                if (BluetoothDevice.ACTION_FOUND.equals(act)) {
                    BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    short rssi = i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);
                    if (d != null) { JSONObject o = dev(d); if (rssi != Short.MIN_VALUE) o.put("rssi", rssi); found.put(d.getAddress(), o); emit(new JSONObject().put("op", "found").put("dev", o)); }
                } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(act)) {
                    // le Bluetooth classique a fini ; la recherche basse consommation continue jusqu'à la fin des 15 s
                } else if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(act)) {
                    BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    int st = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1);
                    emit(new JSONObject().put("op", "bond").put("addr", d == null ? "" : d.getAddress()).put("state", st == BluetoothDevice.BOND_BONDED ? "bonded" : st == BluetoothDevice.BOND_BONDING ? "bonding" : "none"));
                } else emit("changed");
            } catch (Throwable t) { }
        }
    };

    /** Type d'appareil lisible (casque, enceinte, téléphone, montre, voiture…) d'après sa classe Bluetooth */
    static String kind(BluetoothDevice d) {
        try {
            BluetoothClass k = d.getBluetoothClass(); if (k == null) return d.getType() == BluetoothDevice.DEVICE_TYPE_LE ? "ble" : "autre";
            int dc = k.getDeviceClass(), mc = k.getMajorDeviceClass();
            if (dc == BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO || dc == BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE) return "voiture";
            if (dc == BluetoothClass.Device.AUDIO_VIDEO_WEARABLE_HEADSET || dc == BluetoothClass.Device.AUDIO_VIDEO_HEADPHONES) return "casque";
            if (dc == BluetoothClass.Device.AUDIO_VIDEO_LOUDSPEAKER || dc == BluetoothClass.Device.AUDIO_VIDEO_PORTABLE_AUDIO || dc == BluetoothClass.Device.AUDIO_VIDEO_HIFI_AUDIO) return "enceinte";
            if (dc == BluetoothClass.Device.AUDIO_VIDEO_VIDEO_DISPLAY_AND_LOUDSPEAKER || dc == BluetoothClass.Device.AUDIO_VIDEO_VIDEO_MONITOR) return "tv";
            if (mc == BluetoothClass.Device.Major.AUDIO_VIDEO) return "audio";
            if (mc == BluetoothClass.Device.Major.PHONE) return "telephone";
            if (mc == BluetoothClass.Device.Major.COMPUTER) return "ordinateur";
            if (mc == BluetoothClass.Device.Major.WEARABLE) return "montre";
            if (mc == BluetoothClass.Device.Major.PERIPHERAL) return "peripherique";
            if (mc == BluetoothClass.Device.Major.HEALTH) return "sante";
            if (mc == BluetoothClass.Device.Major.IMAGING) return "imprimante";
            return d.getType() == BluetoothDevice.DEVICE_TYPE_LE ? "ble" : "autre";
        } catch (Throwable t) { return "autre"; }
    }
    private boolean audioConnected(BluetoothDevice d) {
        try { if (a2dp != null && a2dp.getConnectionState(d) == BluetoothProfile.STATE_CONNECTED) return true; } catch (Throwable t) { }
        try { if (headset != null && headset.getConnectionState(d) == BluetoothProfile.STATE_CONNECTED) return true; } catch (Throwable t) { }
        return false;
    }
    private boolean connected(BluetoothDevice d) {
        if (audioConnected(d)) return true;
        try { return (Boolean) d.getClass().getMethod("isConnected").invoke(d); } catch (Throwable t) { return false; }
    }
    private JSONObject dev(BluetoothDevice d) throws Exception {
        String n = null; try { n = d.getName(); } catch (Throwable t) { }
        if (Build.VERSION.SDK_INT >= 30) { try { String al = d.getAlias(); if (al != null && !al.isEmpty()) n = al; } catch (Throwable t) { } }
        JSONObject o = new JSONObject().put("addr", d.getAddress()).put("name", n == null ? "" : n).put("kind", kind(d))
            .put("bonded", d.getBondState() == BluetoothDevice.BOND_BONDED).put("le", d.getType() == BluetoothDevice.DEVICE_TYPE_LE);
        if (d.getBondState() == BluetoothDevice.BOND_BONDED) o.put("connected", connected(d)).put("audio", audioConnected(d));
        try { int bat = (Integer) d.getClass().getMethod("getBatteryLevel").invoke(d); if (bat >= 0) o.put("battery", bat); } catch (Throwable t) { }
        return o;
    }

    // ================= Page =================
    @JavascriptInterface public void quit() { a.runOnUiThread(new Runnable() { public void run() { try { a.finishAndRemoveTask(); } catch (Throwable t) { a.finish(); } } }); }
    @JavascriptInterface public String state() {
        try {
            BluetoothAdapter b = ad();
            JSONObject o = new JSONObject().put("present", b != null).put("perm", perms());
            if (b == null) return o.toString();
            o.put("on", perms() || Build.VERSION.SDK_INT < 31 ? b.isEnabled() : false);
            if (perms()) { try { o.put("name", b.getName()); } catch (Throwable t) { } o.put("scanning", scanning); }
            return o.toString();
        } catch (Throwable t) { return "{\"present\":false}"; }
    }
    @JavascriptInterface public void askPerm() { try { a.requestPermissions(needed(), REQ); } catch (Throwable t) { } }
    public void onPermissions(int code) { if (code == REQ) { proxies(); emit("perm"); } }
    @JavascriptInterface public void enable() {
        ui.post(new Runnable() { public void run() {
            try { a.startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)); }
            catch (Throwable t) { settings(); }
        } });
    }
    @JavascriptInterface public void settings() {
        ui.post(new Runnable() { public void run() { try { a.startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Throwable t) { } } });
    }
    /** Appareils jumelés : [{addr, name, kind, bonded, connected, audio, battery?}] */
    @JavascriptInterface public String paired() {
        JSONArray l = new JSONArray();
        try { BluetoothAdapter b = ad(); if (b != null && perms()) for (BluetoothDevice d : b.getBondedDevices()) l.put(dev(d)); } catch (Throwable t) { }
        return l.toString();
    }
    /** Recherche 15 s : appareils classiques (casques, enceintes, voitures) et basse consommation (montres, capteurs) */
    @JavascriptInterface public void scan() {
        final BluetoothAdapter b = ad(); if (b == null || !perms()) { emit("perm"); return; }
        ui.post(new Runnable() { public void run() {
            try {
                found.clear(); scanning = true; emit("scanstart");
                try { if (b.isDiscovering()) b.cancelDiscovery(); b.startDiscovery(); } catch (Throwable t) { }
                try {
                    if (b.getBluetoothLeScanner() != null) {
                        le = new ScanCallback() {
                            @Override public void onScanResult(int type, ScanResult r) {
                                try {
                                    BluetoothDevice d = r.getDevice(); if (d == null) return;
                                    String n = r.getScanRecord() != null ? r.getScanRecord().getDeviceName() : null;
                                    JSONObject o = found.get(d.getAddress());
                                    if (o == null) { o = dev(d); if ((n != null) && o.optString("name").isEmpty()) o.put("name", n); }
                                    o.put("rssi", r.getRssi());
                                    if (o.optString("name").isEmpty()) return;   // balises anonymes : on ne les liste pas
                                    found.put(d.getAddress(), o);
                                    emit(new JSONObject().put("op", "found").put("dev", o));
                                } catch (Throwable t) { }
                            }
                        };
                        b.getBluetoothLeScanner().startScan(null, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), le);
                    }
                } catch (Throwable t) { }
                ui.postDelayed(new Runnable() { public void run() { stopScan(); } }, 15000);
            } catch (Throwable t) { scanning = false; emit("scanend"); }
        } });
    }
    @JavascriptInterface public void stopScan() {
        BluetoothAdapter b = ad();
        try { if (b != null && b.isDiscovering()) b.cancelDiscovery(); } catch (Throwable t) { }
        try { if (b != null && le != null && b.getBluetoothLeScanner() != null) b.getBluetoothLeScanner().stopScan(le); } catch (Throwable t) { }
        le = null; if (scanning) { scanning = false; emit("scanend"); }
    }
    private BluetoothDevice device(String addr) { BluetoothAdapter b = ad(); try { return b == null || addr == null ? null : b.getRemoteDevice(addr); } catch (Throwable t) { return null; } }
    /** Jumelage : Android affiche sa fenêtre de confirmation (code éventuel) */
    @JavascriptInterface public boolean pair(String addr) {
        BluetoothDevice d = device(addr); if (d == null || !perms()) return false;
        try { BluetoothAdapter b = ad(); if (b != null && b.isDiscovering()) b.cancelDiscovery(); } catch (Throwable t) { }
        try { return d.createBond(); } catch (Throwable t) { return false; }
    }
    /** Connexion audio d'un appareil jumelé ; "ok" | "settings" (le réglage Bluetooth s'ouvre) */
    @JavascriptInterface public String connect(String addr) {
        BluetoothDevice d = device(addr); if (d == null || !perms()) return "err";
        boolean done = false;
        for (BluetoothProfile p : new BluetoothProfile[]{ a2dp, headset }) {
            if (p == null) continue;
            try { Object r = p.getClass().getMethod("connect", BluetoothDevice.class).invoke(p, d); if (Boolean.TRUE.equals(r)) done = true; } catch (Throwable t) { }
        }
        if (done) return "ok";
        settings(); return "settings";
    }
    @JavascriptInterface public String disconnect(String addr) {
        BluetoothDevice d = device(addr); if (d == null || !perms()) return "err";
        boolean done = false;
        for (BluetoothProfile p : new BluetoothProfile[]{ a2dp, headset }) {
            if (p == null) continue;
            try { Object r = p.getClass().getMethod("disconnect", BluetoothDevice.class).invoke(p, d); if (Boolean.TRUE.equals(r)) done = true; } catch (Throwable t) { }
        }
        if (done) return "ok";
        settings(); return "settings";
    }
    /** Oublier un appareil jumelé (méthode cachée quand le téléphone l'accepte, sinon le réglage Bluetooth) */
    @JavascriptInterface public String forget(String addr) {
        BluetoothDevice d = device(addr); if (d == null || !perms()) return "err";
        try { Object r = d.getClass().getMethod("removeBond").invoke(d); if (Boolean.TRUE.equals(r)) return "ok"; } catch (Throwable t) { }
        settings(); return "settings";
    }
    @JavascriptInterface public boolean rename(String addr, String name) {
        BluetoothDevice d = device(addr); if (d == null || !perms() || Build.VERSION.SDK_INT < 31) return false;
        try { return d.setAlias(name) == 0; } catch (Throwable t) { return false; }
    }
}
