package dev.ghostnode.nexuswatch;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;

import org.json.JSONObject;

/** 8.2: Komplikation „VRChat (Nexus)“ – kurz: Freunde online; lang: Welt · Spieler (im Privat-Modus ohne Welt). */
public class StatusComplication extends Comp {
    @Override ComplicationData build(ComplicationType type, boolean preview) {
        JSONObject s = preview ? new JSONObject() : Live.state(this);
        boolean fresh = preview || Live.fresh(this);
        int friends = preview ? 4 : s.optInt("friends");
        String world = preview ? "Club · 8 👥" : !fresh ? "PC nicht erreichbar" : s.optBoolean("private") ? "Privat-Modus"
            : s.optBoolean("running") ? (s.optString("world").isEmpty() ? "VRChat" : s.optString("world")) + " · " + s.optInt("players") + " 👥" : "VRChat aus";
        if (type == ComplicationType.SHORT_TEXT) return shortText(fresh ? String.valueOf(friends) : "–", "online", friends + " Freunde online", R.drawable.ic_nexus, open("", 32));
        if (type == ComplicationType.LONG_TEXT) return longText(world, fresh ? "👥 " + friends + " online" : "", world, R.drawable.ic_nexus, open("", 32));
        return null;
    }
}
