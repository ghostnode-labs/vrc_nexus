package dev.ghostnode.nexuswatch;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Update-Prüfung: sucht in den GitHub-Releases von VRC Nexus die neueste „VRC-Nexus-Watch-x.y.z-wearos.apk“.
 * 8.0.19: Die Uhr installiert nicht mehr selbst (Wear OS blockiert Installationen aus dem Hintergrund oft) –
 * sie zeigt nur an, dass es ein Update gibt. Installiert wird am PC über ADB (VRC Nexus → Geräte → Uhr-App installieren).
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
        int rc = h.getResponseCode();
        if (rc == 403 || rc == 429) throw new Exception("GitHub begrenzt gerade die Abfragen – später noch einmal");
        if (rc != 200) throw new Exception("GitHub antwortet nicht (" + rc + ")");
        try (InputStream in = h.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > max) break; }
            return bo.toString("UTF-8");
        } finally { h.disconnect(); }
    }
}
