package dev.ghostnode.nexuswatch;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import androidx.wear.tiles.TileService;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester;

import org.json.JSONObject;

/**
 * 8.2: letzter Zustand vom PC für Kacheln und Komplikationen (die laufen ohne geöffnete App).
 * Gespeichert in den Einstellungen („st_json“), höchstens alle paar Sekunden neu an Kacheln/Zifferblatt gemeldet.
 * Hier liegt auch die Regel, ob 🔞 auf dieser Uhr gerade gezeigt werden darf (PC-Freigabe + Kopplungs-Freigabe + diskreter Modus).
 */
final class Live {
    private static volatile JSONObject mem;
    private static volatile long pushedAt = 0;
    private static final Object LOCK = new Object();
    private Live() { }

    static SharedPreferences p(Context c) { return Nexus.prefs(c); }

    /** zuletzt bekannter Zustand (oder leeres Objekt) */
    static JSONObject state(Context c) {
        JSONObject m = mem;
        if (m != null) return m;
        try { m = new JSONObject(p(c).getString("st_json", "{}")); } catch (Exception e) { m = new JSONObject(); }
        mem = m;
        return m;
    }
    static long stateAt(Context c) { return p(c).getLong("st_at", 0); }
    /** Zustand ist frisch (≤ 2 min) – sonst zeigen Kacheln „–“ statt alter Werte */
    static boolean fresh(Context c) { return System.currentTimeMillis() - stateAt(c) < 120000; }

    static void save(Context c, JSONObject st) {
        if (st == null) return;
        JSONObject copy;
        try { copy = new JSONObject(st.toString()); copy.remove("notes"); copy.remove("buzz"); } catch (Exception e) { return; }
        mem = copy;
        p(c).edit().putString("st_json", copy.toString()).putLong("st_at", System.currentTimeMillis()).apply();
        push(c, false);
    }
    static void clear(Context c) { mem = null; p(c).edit().remove("st_json").remove("st_at").apply(); push(c, true); }

    /** Kacheln und Komplikationen neu zeichnen lassen (höchstens alle 5 s, außer force) */
    static void push(Context c, boolean force) {
        long now = System.currentTimeMillis();
        synchronized (LOCK) { if (!force && now - pushedAt < 5000) return; pushedAt = now; }
        Context app = c.getApplicationContext();
        try {
            TileService.getUpdater(app).requestUpdate(StatusTile.class);
            TileService.getUpdater(app).requestUpdate(QuickTile.class);
            TileService.getUpdater(app).requestUpdate(ToyTile.class);
        } catch (Exception ignored) { /* keine Kachel aktiv */ }
        for (Class<?> k : new Class<?>[]{ HeartComplication.class, ToyComplication.class, StatusComplication.class }) {
            try { ComplicationDataSourceUpdateRequester.create(app, new ComponentName(app, k)).requestUpdateAll(); } catch (Exception ignored) { /* nicht belegt */ }
        }
    }

    /** Zustand vom PC holen und merken (blockiert – nur im Hintergrund aufrufen) */
    static JSONObject fetch(Context c) throws Exception {
        JSONObject st = Nexus.call(c, "/watch/state", null);
        save(c, st);
        Notes.handle(c, st);
        return st;
    }
    /** Aktion an den PC (blockiert); liefert die Antwort, merkt den neuen Zustand */
    static JSONObject act(Context c, JSONObject body) throws Exception {
        JSONObject r = Nexus.call(c, "/watch/action", body);
        if (r.has("state")) save(c, r.optJSONObject("state"));
        return r;
    }
    static JSONObject body(String a, Object... kv) {
        JSONObject b = new JSONObject();
        try { b.put("a", a); for (int i = 0; i + 1 < kv.length; i += 2) b.put(String.valueOf(kv[i]), kv[i + 1]); } catch (Exception ignored) { }
        return b;
    }

    // ---------- Regeln ----------
    /** Puls: eigener Sensor (frisch) vor PC-Wert */
    static int bpm(Context c) {
        if (HeartService.running && HeartService.bpm > 0 && System.currentTimeMillis() - HeartService.bpmAt < 15000) return HeartService.bpm;
        return fresh(c) ? state(c).optInt("bpm") : 0;
    }
    /** 🔞 freigegeben (PC prüft Altersfreigabe, Geräte-Schalter und Kopplungs-Freigabe – die Uhr übernimmt nur das Ergebnis) */
    static boolean adult(Context c) { return Nexus.paired(c) && state(c).optBoolean("nsfw"); }
    /** diskreter Modus: keine 🔞-Wörter/-Symbole auf Kacheln, Komplikationen und Benachrichtigungen (Standard an) */
    static boolean discreet(Context c) { return p(c).getBoolean("discreet", true); }
    static JSONObject toys(Context c) { return adult(c) ? state(c).optJSONObject("toys") : null; }
    static String consentIcon(String l) { return "red".equals(l) ? "🔴" : "yellow".equals(l) ? "🟡" : "🟢"; }
}
