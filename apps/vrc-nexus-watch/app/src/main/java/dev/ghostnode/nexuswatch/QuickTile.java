package dev.ghostnode.nexuswatch;

import androidx.wear.protolayout.LayoutElementBuilders;

import org.json.JSONObject;

/** 8.2: Kachel „Schnellaktionen“ – Schlafmodus direkt, dazu Puls, Chatbox-Schnelltexte und Makros (öffnen die App an der richtigen Stelle). */
public class QuickTile extends TileBase {
    @Override String key() { return "quick"; }

    @Override String onClick(String name) throws Exception {
        if ("sleep".equals(name)) {
            boolean on = !Live.state(this).optBoolean("sleeping");
            JSONObject r = Live.act(this, Live.body("sleep", "on", on));
            return r.optString("msg", on ? "💤" : "☀️");
        }
        if ("chat0".equals(name)) {   // erster Schnelltext direkt in die Chatbox
            JSONObject r = Live.act(this, Live.body("chat", "i", 0));
            return r.optString("msg", "💬");
        }
        return "";
    }

    @Override LayoutElementBuilders.LayoutElement layout(String msg) {
        if (!Nexus.paired(this)) return notPaired();
        JSONObject s = Live.state(this);
        boolean sleeping = s.optBoolean("sleeping");
        String first = s.optJSONArray("quick") != null && s.optJSONArray("quick").length() > 0 ? s.optJSONArray("quick").optString(0) : "";
        LayoutElementBuilders.Column.Builder c = column()
            .addContent(text("⚡ Schnell", 13, GOLD, true)).addContent(gap(6))
            .addContent(row()
                .addContent(button(sleeping ? "☀️" : "💤", "sleep", CYAN, 52, 52, 20, false)).addContent(gap(6))
                .addContent(launchButton("♥", "heart", RED, 52, 52, 20)).addContent(gap(6))
                .addContent(launchButton("⚡", "shortcuts", GOLD, 52, 52, 20)).build())
            .addContent(gap(6))
            .addContent(row()
                .addContent(launchButton("💬", "chat", CYAN, 52, 52, 20)).addContent(gap(6))
                .addContent(first.isEmpty() ? gap(1) : button(first.length() > 12 ? first.substring(0, 11) + "…" : first, "chat0", MUTED, 104, 52, 12, false)).build());
        c.addContent(gap(4)).addContent(text(!msg.isEmpty() ? msg : sleeping ? "💤 schläft" : "", 11, msg.startsWith("⚠") ? GOLD : MUTED, false));
        return c.build();
    }
}
