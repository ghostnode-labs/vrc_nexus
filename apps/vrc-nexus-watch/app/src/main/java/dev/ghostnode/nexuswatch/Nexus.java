package dev.ghostnode.nexuswatch;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Verbindung zur VRC-Nexus-Windows-App im Heimnetz (eigene Umsetzung, ohne Bibliotheken).
 * Suche per UDP-Broadcast „NXW?1“ (Port 17873), danach HTTP mit eigenem Schlüssel je Uhr (Kopf „X-Nexus-Watch“).
 */
final class Nexus {
    static final int DISC_PORT = 17873, DEF_PORT = 17874;
    private static volatile Network wifi;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("nexus", Context.MODE_PRIVATE); }
    static boolean paired(Context c) { return !prefs(c).getString("token", "").isEmpty(); }
    static String host(Context c) { return prefs(c).getString("host", ""); }
    static int port(Context c) { return prefs(c).getInt("port", DEF_PORT); }

    /** Wear OS nimmt sonst gern die Bluetooth-Verbindung übers Handy – für das Heimnetz WLAN anfordern */
    static void wantWifi(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkRequest req = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build();
            cm.requestNetwork(req, new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network n) { wifi = n; }
                @Override public void onLost(Network n) { if (n.equals(wifi)) wifi = null; }
            });
        } catch (Exception ignored) { /* ohne WLAN-Anforderung weiter */ }
    }

    /** PC im Heimnetz suchen: liefert {host, port, name} oder null */
    static JSONObject discover() {
        try (DatagramSocket s = new DatagramSocket()) {
            if (wifi != null) wifi.bindSocket(s);
            s.setBroadcast(true);
            s.setSoTimeout(1500);
            byte[] q = "NXW?1".getBytes(StandardCharsets.UTF_8);
            s.send(new DatagramPacket(q, q.length, InetAddress.getByName("255.255.255.255"), DISC_PORT));
            byte[] buf = new byte[512];
            DatagramPacket p = new DatagramPacket(buf, buf.length);
            s.receive(p);
            JSONObject j = new JSONObject(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
            if (!"watch".equals(j.optString("nexus"))) return null;
            j.put("host", p.getAddress().getHostAddress());
            return j;
        } catch (Exception e) { return null; }
    }

    /** HTTP-Anfrage; body == null → GET. Wirft mit lesbarer Meldung. */
    static JSONObject call(Context c, String host, int port, String path, JSONObject body) throws Exception {
        URL u = new URL("http://" + host + ":" + port + path);
        HttpURLConnection h = (HttpURLConnection) (wifi != null ? wifi.openConnection(u) : u.openConnection());
        h.setConnectTimeout(5000); h.setReadTimeout(15000);
        h.setRequestProperty("Content-Type", "application/json");
        String tok = prefs(c).getString("token", "");
        if (!tok.isEmpty()) h.setRequestProperty("X-Nexus-Watch", tok);
        h.setRequestProperty("X-Nexus-Watch-Version", Updater.installedName(c));
        try {   // 8.2: Akkustand für den Geräte-Hub am PC (ohne Berechtigung, „sticky“ Broadcast)
            android.content.Intent bi = c.registerReceiver(null, new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED));
            if (bi != null) { int lv = bi.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1), sc = bi.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1); if (lv >= 0 && sc > 0) h.setRequestProperty("X-Nexus-Battery", String.valueOf(Math.round(lv * 100f / sc))); }
        } catch (Exception e) { /* ohne Akkustand */ }
        if (body != null) {
            h.setRequestMethod("POST"); h.setDoOutput(true);
            try (OutputStream o = h.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        }
        int code = h.getResponseCode();
        InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) { byte[] b = new byte[2048]; int n; while ((n = in.read(b)) > 0 && bo.size() < 65536) bo.write(b, 0, n); in.close(); }
        h.disconnect();
        JSONObject j = bo.size() > 0 ? new JSONObject(bo.toString("UTF-8")) : new JSONObject();
        if (code == 401) { prefs(c).edit().putBoolean("lost", true).apply(); throw new Exception("Nicht mehr gekoppelt – bitte neu koppeln."); }
        if (code >= 400) throw new Exception(j.optString("error", "Fehler " + code));
        return j;
    }
    static JSONObject call(Context c, String path, JSONObject body) throws Exception {
        String host = host(c);
        if (host.isEmpty()) throw new Exception("Noch nicht gekoppelt.");
        try { return call(c, host, port(c), path, body); }
        catch (java.io.IOException e) {
            // PC hat evtl. eine neue Adresse bekommen → neu suchen und einmal wiederholen
            JSONObject d = discover();
            if (d == null) throw new Exception("PC nicht erreichbar – läuft VRC Nexus?");
            prefs(c).edit().putString("host", d.optString("host")).putInt("port", d.optInt("port", DEF_PORT)).apply();
            return call(c, d.optString("host"), d.optInt("port", DEF_PORT), path, body);
        }
    }

    /** Hintergrundbild vom PC holen (nur gekoppelt), höchstens 4 MB */
    static byte[] bytes(Context c, String path) throws Exception {
        URL u = new URL("http://" + host(c) + ":" + port(c) + path);
        HttpURLConnection h = (HttpURLConnection) (wifi != null ? wifi.openConnection(u) : u.openConnection());
        h.setConnectTimeout(5000); h.setReadTimeout(20000);
        h.setRequestProperty("X-Nexus-Watch", prefs(c).getString("token", ""));
        try {
            if (h.getResponseCode() != 200) throw new Exception("Bild nicht verfügbar (" + h.getResponseCode() + ")");
            try (InputStream in = h.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n;
                while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > 4 * 1024 * 1024) throw new Exception("Bild zu groß."); }
                return bo.toByteArray();
            }
        } finally { h.disconnect(); }
    }

    static JSONObject pair(Context c, String host, int port, String pin) throws Exception {
        JSONObject b = new JSONObject();
        b.put("pin", pin);
        b.put("name", android.os.Build.MODEL);
        prefs(c).edit().remove("token").apply();
        JSONObject r = call(c, host, port, "/watch/pair", b);
        prefs(c).edit().putString("host", host).putInt("port", port).putString("token", r.getString("token"))
            .putString("pc", r.optString("name", "PC")).putBoolean("lost", false).apply();
        return r;
    }
    static void unpair(Context c) { prefs(c).edit().clear().apply(); }
}
