package dev.ghostnode.nexuswatch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Updater: sucht in den GitHub-Releases von VRC Nexus die neueste „VRC-Nexus-Watch-x.y.z-wearos.apk“,
 * lädt sie herunter und installiert sie über den Paket-Installer (Android fragt auf der Uhr nach Bestätigung).
 * Gleiche Signatur wie die installierte App → normales Update, Kopplung bleibt erhalten.
 */
final class Updater {
    static final String API = "https://api.github.com/repos/ghostnode-labs/vrc_nexus/releases?per_page=15";
    private static final Pattern NAME = Pattern.compile("^VRC-Nexus-Watch-(\\d+)\\.(\\d+)\\.(\\d+)-wearos\\.apk$");

    /** {version, url, size} der neuesten Uhr-APK oder null */
    static JSONObject latest() throws Exception {
        JSONArray rel = new JSONArray(get(API, 200000));
        JSONObject best = null; int bestV = -1;
        for (int i = 0; i < rel.length(); i++) {
            JSONObject r = rel.getJSONObject(i);
            if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue;
            JSONArray as = r.optJSONArray("assets");
            if (as == null) continue;
            for (int k = 0; k < as.length(); k++) {
                JSONObject a = as.getJSONObject(k);
                Matcher m = NAME.matcher(a.optString("name"));
                if (!m.matches()) continue;
                int v = Integer.parseInt(m.group(1)) * 10000 + Integer.parseInt(m.group(2)) * 100 + Integer.parseInt(m.group(3));
                if (v > bestV) { bestV = v; best = new JSONObject().put("code", v).put("version", m.group(1) + "." + m.group(2) + "." + m.group(3))
                    .put("url", a.getString("browser_download_url")).put("size", a.optLong("size")); }
            }
        }
        return best;
    }
    static int installedCode(Context c) {
        try { return (int) c.getPackageManager().getPackageInfo(c.getPackageName(), 0).getLongVersionCode(); } catch (Exception e) { return 0; }
    }
    static String installedName(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    private static String get(String url, int max) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(8000); h.setReadTimeout(15000);
        h.setRequestProperty("Accept", "application/vnd.github+json");
        h.setRequestProperty("User-Agent", "Nexus-Watch");
        if (h.getResponseCode() != 200) throw new Exception("GitHub antwortet nicht (" + h.getResponseCode() + ")");
        try (InputStream in = h.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > max) break; }
            return bo.toString("UTF-8");
        } finally { h.disconnect(); }
    }

    /** herunterladen und Installation starten (Fortschritt 0–100 über cb) */
    static void install(Context c, JSONObject u, java.util.function.IntConsumer cb) throws Exception {
        String url = u.getString("url");
        if (!url.startsWith("https://github.com/ghostnode-labs/vrc_nexus/releases/download/")) throw new Exception("Unerwartete Download-Adresse.");
        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setAppPackageName(c.getPackageName());
        int id = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setInstanceFollowRedirects(true);
            h.setConnectTimeout(8000); h.setReadTimeout(30000);
            h.setRequestProperty("User-Agent", "Nexus-Watch");
            long total = h.getContentLengthLong() > 0 ? h.getContentLengthLong() : u.optLong("size", -1), done = 0;
            if (total > 60L * 1024 * 1024) throw new Exception("Update zu groß.");
            try (InputStream in = h.getInputStream(); OutputStream out = s.openWrite("nexus-watch.apk", 0, total)) {
                byte[] b = new byte[65536]; int n, last = -1;
                while ((n = in.read(b)) > 0) {
                    out.write(b, 0, n); done += n;
                    int pct = total > 0 ? (int) (done * 100 / total) : 0;
                    if (pct != last) { last = pct; cb.accept(pct); }
                }
                s.fsync(out);
            } finally { h.disconnect(); }
            Intent i = new Intent(c, InstallReceiver.class);
            PendingIntent pend = PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            s.commit(pend.getIntentSender());
        } catch (Exception e) { pi.abandonSession(id); throw e; }
    }
}
