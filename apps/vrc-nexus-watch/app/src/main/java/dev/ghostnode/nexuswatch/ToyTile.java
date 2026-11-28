package dev.ghostnode.nexuswatch;

import androidx.wear.protolayout.LayoutElementBuilders;

import org.json.JSONObject;

/**
 * 8.2: 🔞-Kachel „Spielzeug“ – Stärke mit Ring, − / STOPP / +, Consent-Ampel und Panik.
 * Nur mit Freigabe (PC + Kopplung); STOPP, Ampel Rot und Panik sind immer da. Im diskreten Modus ohne 🔞-Wörter.
 */
public class ToyTile extends TileBase {
    @Override String key() { return "toys"; }
    @Override long freshness() { return 20000; }

    @Override String onClick(String name) throws Exception {
        switch (name) {
            case "stop": return Live.act(this, Live.body("toys_stop")).optString("msg", "⏹");
            case "red": return Live.act(this, Live.body("consent", "light", "red")).optString("msg", "🔴");
            case "panic": {
                boolean confirm = Nexus.prefs(this).getBoolean("panic_confirm", true);
                long armed = Nexus.prefs(this).getLong("tile_panic_armed", 0);
                if (confirm && System.currentTimeMillis() - armed > 4000) { Nexus.prefs(this).edit().putLong("tile_panic_armed", System.currentTimeMillis()).apply(); return "🚨 nochmal tippen = Panik"; }
                Nexus.prefs(this).edit().putLong("tile_panic_armed", 0).apply();
                return Live.act(this, Live.body("panic")).optString("msg", "🚨");
            }
        }
        if (!Live.adult(this)) return "";
        JSONObject t = Live.toys(this);
        int lv = t != null ? t.optInt("level") : 0;
        switch (name) {
            case "minus": return Live.act(this, Live.body("toy_level", "level", Math.max(0, lv - 10))).optString("msg");
            case "plus": return Live.act(this, Live.body("toy_level", "level", Math.min(100, lv + 10))).optString("msg");
            case "green": case "yellow": return Live.act(this, Live.body("consent", "light", name)).optString("msg");
        }
        return "";
    }

    @Override LayoutElementBuilders.LayoutElement layout(String msg) {
        if (!Nexus.paired(this)) return notPaired();
        boolean d = Live.discreet(this), adult = Live.adult(this);
        JSONObject t = Live.toys(this);
        LayoutElementBuilders.Column.Builder c = column();
        boolean armed = System.currentTimeMillis() - Nexus.prefs(this).getLong("tile_panic_armed", 0) < 4000;
        if (!adult || t == null) {
            c.addContent(text(d ? "◈ Nexus" : "🔞 Spielzeug", 13, MUTED, true)).addContent(gap(4))
                .addContent(text(d ? "gesperrt – Freigabe am PC" : "nicht freigegeben", 11, MUTED, false)).addContent(gap(8))
                .addContent(button("⏹ STOPP", "stop", RED, 130, 50, 16, true)).addContent(gap(6))
                .addContent(button(armed ? "🚨 nochmal!" : "🚨 Panik", "panic", RED, 110, 36, 12, armed));
            if (!msg.isEmpty()) c.addContent(gap(2)).addContent(text(msg, 10, GOLD, false));
            return c.build();
        }
        int lv = t.optInt("level"), out = t.optInt("out");
        String consent = t.optString("consent", "green");
        JSONObject pat = t.optJSONObject("pattern");
        String sub = "red".equals(consent) ? "🔴 Pause" : t.optBoolean("paused") ? "⏸ Pause" : pat != null ? (d ? "〰" : "〰 " + pat.optString("name")) : t.optInt("devices") == 0 ? (d ? "–" : "kein Gerät") : "";
        c.addContent(text((d ? "◈ " : "🔞 ") + Live.consentIcon(consent), 12, MUTED, true))
            .addContent(box(text(Math.max(lv, out) + " %", 26, WHITE, true), 96, 34, 0x00000000, 0x00000000, launch("toys"), "Spielzeug öffnen"))
            .addContent(text(sub, 10, MUTED, false)).addContent(gap(4))
            .addContent(row()
                .addContent(button("−", "minus", CYAN, 44, 44, 22, false)).addContent(gap(4))
                .addContent(button("⏹ STOPP", "stop", RED, 84, 50, 14, true)).addContent(gap(4))
                .addContent(button("+", "plus", CYAN, 44, 44, 22, false)).build())
            .addContent(gap(5))
            .addContent(row()
                .addContent(button("🟢", "green", GREEN, 34, 34, 14, false)).addContent(gap(3))
                .addContent(button("🟡", "yellow", GOLD, 34, 34, 14, false)).addContent(gap(3))
                .addContent(button("🔴", "red", RED, 34, 34, 14, false)).addContent(gap(3))
                .addContent(button(armed ? "‼" : "🚨", "panic", RED, 34, 34, 14, armed)).build());
        if (!msg.isEmpty()) c.addContent(text(d && !msg.startsWith("⚠") ? "✓" : msg, 10, msg.startsWith("⚠") ? GOLD : MUTED, false));
        return withRing(c.build(), Math.max(lv, out) / 100f, "red".equals(consent) ? RED : CYAN);
    }
}
