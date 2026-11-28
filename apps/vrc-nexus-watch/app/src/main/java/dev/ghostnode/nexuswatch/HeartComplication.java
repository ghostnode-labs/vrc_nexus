package dev.ghostnode.nexuswatch;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationType;

/** 8.2: Komplikation „Puls (Nexus)“ – eigener Sensor oder der Puls, den VRC Nexus am PC gerade nutzt (z. B. HypeRate). */
public class HeartComplication extends Comp {
    @Override ComplicationData build(ComplicationType type, boolean preview) {
        int bpm = preview ? 72 : Live.bpm(this);
        String t = bpm > 0 ? String.valueOf(bpm) : "–";
        if (type == ComplicationType.RANGED_VALUE) return ranged(bpm, 40, 200, t, "Puls " + t, R.drawable.ic_heart, open("heart", 31));
        if (type == ComplicationType.SHORT_TEXT) return shortText(t, "bpm", "Puls " + t, R.drawable.ic_heart, open("heart", 31));
        return null;
    }
}
