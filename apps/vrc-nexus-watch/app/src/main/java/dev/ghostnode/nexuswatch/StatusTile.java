package dev.ghostnode.nexuswatch;

import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.ModifiersBuilders;

import org.json.JSONObject;

/** 8.2: Kachel „Nexus“ – Puls mit Ring (40–200 bpm), VRChat-Status, Freunde online. Tippen öffnet die App. */
public class StatusTile extends TileBase {
    @Override String key() { return "status"; }
    @Override long freshness() { return 30000; }
    @Override String onClick(String name) { return ""; }

    @Override LayoutElementBuilders.LayoutElement layout(String msg) {
        if (!Nexus.paired(this)) return notPaired();
        JSONObject s = Live.state(this);
        int bpm = Live.bpm(this);
        boolean fresh = Live.fresh(this);
        String w = !fresh ? "PC nicht erreichbar" : s.optBoolean("private") ? "🕶 Privat-Modus"
            : s.optBoolean("running") ? (s.optString("world").isEmpty() ? "VRChat läuft" : s.optString("world")) + " · " + s.optInt("players") + " 👥" : "VRChat läuft nicht";
        LayoutElementBuilders.Column.Builder c = column()
            .addContent(text("◈ NEXUS", 12, CYAN, true)).addContent(gap(2))
            .addContent(text(bpm > 0 ? "♥ " + bpm : "♥ –", 34, bpm > 0 ? RED : MUTED, true))
            .addContent(text("bpm", 10, MUTED, false)).addContent(gap(4))
            .addContent(text(w, 12, WHITE, false));
        if (fresh && s.optInt("friends") > 0) c.addContent(text("👥 " + s.optInt("friends") + " Freunde online", 11, CYAN, false));
        if (s.optBoolean("sleeping")) c.addContent(text("💤 Schlafmodus", 11, MUTED, false));
        if (!fresh) c.addContent(text("zuletzt " + ago(Live.stateAt(this)), 10, MUTED, false));
        c.setModifiers(new ModifiersBuilders.Modifiers.Builder().setClickable(launch("")).build());
        return withRing(c.build(), bpm > 0 ? (bpm - 40) / 160f : 0f, RED);
    }
}
