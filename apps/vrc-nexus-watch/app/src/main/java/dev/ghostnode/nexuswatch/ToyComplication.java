package dev.ghostnode.nexuswatch;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;

import org.json.JSONObject;

/**
 * 8.2: 🔞-Komplikation „Spielzeug (Nexus)“ – Stärke und Ampel. Nur mit Freigabe; sonst leer.
 * Im diskreten Modus neutral („◈“ statt 🔞, keine Musternamen) – das Zifferblatt zeigt sie auch im Always-On.
 */
public class ToyComplication extends Comp {
    @Override ComplicationData build(ComplicationType type, boolean preview) {
        JSONObject t = preview ? null : Live.toys(this);
        if (!preview && t == null) return null;
        int lv = preview ? 40 : Math.max(t.optInt("level"), t.optInt("out"));
        String consent = preview ? "green" : t.optString("consent", "green");
        boolean d = preview || Live.discreet(this);
        String text = lv + "%", desc = d ? "Nexus " + lv + " %" : "Spielzeug " + lv + " %";
        String title = "red".equals(consent) ? "■" : d ? "◈" : Live.consentIcon(consent);
        if (type == ComplicationType.RANGED_VALUE) return ranged(lv, 0, 100, text, desc, R.drawable.ic_nexus, open("toys", 33));
        if (type == ComplicationType.SHORT_TEXT) return shortText(text, title, desc, R.drawable.ic_nexus, open("toys", 33));
        return null;
    }
}
