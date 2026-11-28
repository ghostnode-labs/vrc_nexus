package dev.ghostnode.nexuswatch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;

import androidx.wear.watchface.complications.data.ComplicationData;
import androidx.wear.watchface.complications.data.ComplicationText;
import androidx.wear.watchface.complications.data.ComplicationType;
import androidx.wear.watchface.complications.data.LongTextComplicationData;
import androidx.wear.watchface.complications.data.MonochromaticImage;
import androidx.wear.watchface.complications.data.NoDataComplicationData;
import androidx.wear.watchface.complications.data.PlainComplicationText;
import androidx.wear.watchface.complications.data.RangedValueComplicationData;
import androidx.wear.watchface.complications.data.ShortTextComplicationData;
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService;
import androidx.wear.watchface.complications.datasource.ComplicationRequest;

/**
 * 8.2: gemeinsame Teile der Komplikations-Datenquellen (Felder auf jedem Zifferblatt).
 * Antwortet sofort aus dem letzten bekannten Zustand; ist der älter als 1 min, wird im Hintergrund nachgeladen
 * (danach meldet Live.save die neuen Werte von selbst).
 */
abstract class Comp extends ComplicationDataSourceService {
    /** Inhalt für den angefragten Typ (null = keine Daten) */
    abstract ComplicationData build(ComplicationType type, boolean preview);

    @Override public void onComplicationRequest(ComplicationRequest req, ComplicationRequestListener listener) {
        ComplicationData d = null;
        try { d = build(req.getComplicationType(), false); } catch (Exception ignored) { }
        try { listener.onComplicationData(d != null ? d : new NoDataComplicationData()); } catch (Exception ignored) { }
        final Context app = getApplicationContext();
        if (Nexus.paired(app) && System.currentTimeMillis() - Live.stateAt(app) > 60000) {
            Nexus.wantWifi(app);
            new Thread(() -> { try { Live.fetch(app); } catch (Exception ignored) { } }, "nexus-comp").start();
        }
    }
    @Override public ComplicationData getPreviewData(ComplicationType type) {
        try { return build(type, true); } catch (Exception e) { return null; }
    }

    static ComplicationText txt(CharSequence s) { return new PlainComplicationText.Builder(s).build(); }
    MonochromaticImage icon(int res) { return new MonochromaticImage.Builder(Icon.createWithResource(this, res)).build(); }
    PendingIntent open(String screen, int code) {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (screen != null) i.putExtra("screen", screen);
        return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    ShortTextComplicationData shortText(String text, String title, String desc, int iconRes, PendingIntent tap) {
        ShortTextComplicationData.Builder b = new ShortTextComplicationData.Builder(txt(text), txt(desc)).setMonochromaticImage(icon(iconRes)).setTapAction(tap);
        if (title != null && !title.isEmpty()) b.setTitle(txt(title));
        return b.build();
    }
    RangedValueComplicationData ranged(float value, float min, float max, String text, String desc, int iconRes, PendingIntent tap) {
        return new RangedValueComplicationData.Builder(Math.max(min, Math.min(max, value)), min, max, txt(desc))
            .setText(txt(text)).setMonochromaticImage(icon(iconRes)).setTapAction(tap).build();
    }
    LongTextComplicationData longText(String text, String title, String desc, int iconRes, PendingIntent tap) {
        LongTextComplicationData.Builder b = new LongTextComplicationData.Builder(txt(text), txt(desc)).setMonochromaticImage(icon(iconRes)).setTapAction(tap);
        if (title != null && !title.isEmpty()) b.setTitle(txt(title));
        return b.build();
    }
}
