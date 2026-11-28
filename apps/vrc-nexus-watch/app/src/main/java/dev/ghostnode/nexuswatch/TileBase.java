package dev.ghostnode.nexuswatch;

import androidx.annotation.NonNull;
import androidx.concurrent.futures.CallbackToFutureAdapter;
import androidx.wear.protolayout.ActionBuilders;
import androidx.wear.protolayout.ColorBuilders;
import androidx.wear.protolayout.DimensionBuilders;
import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.ModifiersBuilders;
import androidx.wear.protolayout.ResourceBuilders;
import androidx.wear.protolayout.TimelineBuilders;
import androidx.wear.tiles.RequestBuilders;
import androidx.wear.tiles.TileBuilders;
import androidx.wear.tiles.TileService;

import com.google.common.util.concurrent.ListenableFuture;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * 8.2: Grundlage der Kacheln (Wear OS Tiles). Eigene Umsetzung mit den ProtoLayout-Bausteinen (ohne Material-Bibliothek).
 * Knöpfe sind „LoadAction“-Klicks: das System fragt die Kachel neu an und nennt die gedrückte Kennung – die Aktion läuft
 * dann hier im Dienst (höchstens ~3 s warten, sonst Ergebnis beim nächsten Neuzeichnen). Jede Darstellung bekommt neue
 * Kennungen (Zeitstempel), damit ein Klick nie doppelt ausgeführt wird.
 */
abstract class TileBase extends TileService {
    static final String RES = "1";
    static final int CYAN = 0xFF38D5E6, GOLD = 0xFFF3C262, RED = 0xFFFF5555, GREEN = 0xFF3DDC84, MUTED = 0xFF8A93A6, WHITE = 0xFFE2E8F0, CHIP = 0xFF16202B, DARK = 0xFF0B1016;
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final ExecutorService net = Executors.newCachedThreadPool();
    protected String stamp = "";

    @Override public void onCreate() { super.onCreate(); Nexus.wantWifi(this); }
    @Override public void onDestroy() { bg.shutdown(); net.shutdown(); super.onDestroy(); }

    /** Name der Kachel für die Klick-Merker */
    abstract String key();
    /** Klick ausführen (Hintergrund, darf blockieren) → kurze Meldung für die Kachel oder "" */
    abstract String onClick(String name) throws Exception;
    /** Kachel-Inhalt aus Live-Zustand */
    abstract LayoutElementBuilders.LayoutElement layout(String msg);
    long freshness() { return 60000; }

    @NonNull @Override
    protected ListenableFuture<TileBuilders.Tile> onTileRequest(@NonNull RequestBuilders.TileRequest req) {
        String clicked = "";
        try { clicked = req.getCurrentState().getLastClickableId(); } catch (Exception ignored) { }
        final String id = clicked == null ? "" : clicked;
        return CallbackToFutureAdapter.getFuture(done -> {
            bg.execute(() -> {
                String msg = "";
                try {
                    String last = Nexus.prefs(this).getString("tile_click_" + key(), "");
                    if (!id.isEmpty() && id.contains("#") && !id.equals(last)) {
                        Nexus.prefs(this).edit().putString("tile_click_" + key(), id).apply();
                        final String name = id.substring(0, id.indexOf('#'));
                        msg = limited(() -> onClick(name), 3500, "⏳ gesendet …");
                    } else if (Nexus.paired(this) && System.currentTimeMillis() - Live.stateAt(this) > 15000) {
                        limited(() -> { Live.fetch(this); return ""; }, 2500, "");   // nicht zu lange warten – kommt später per Neuzeichnen
                    }
                } catch (Exception e) { msg = "⚠ " + e.getMessage(); }
                try { done.set(tile(msg)); } catch (Exception e) { done.setException(e); }
            });
            return "nexus-tile-" + key();
        });
    }

    @NonNull @Override
    protected ListenableFuture<ResourceBuilders.Resources> onTileResourcesRequest(@NonNull RequestBuilders.ResourcesRequest req) {
        return CallbackToFutureAdapter.getFuture(done -> { done.set(new ResourceBuilders.Resources.Builder().setVersion(RES).build()); return "nexus-res"; });
    }

    private TileBuilders.Tile tile(String msg) {
        stamp = Long.toString(System.currentTimeMillis(), 36);
        return new TileBuilders.Tile.Builder()
            .setResourcesVersion(RES)
            .setFreshnessIntervalMillis(freshness())
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout(msg == null ? "" : msg)))
            .build();
    }

    interface Job { String run() throws Exception; }
    /** Netzwerk-Aufgabe höchstens ms Millisekunden abwarten (läuft danach weiter und zeichnet die Kachel dann neu) */
    String limited(Job j, long ms, String slow) throws Exception {
        Future<String> f = net.submit(() -> { try { return j.run(); } finally { Live.push(this, true); } });
        try { return f.get(ms, TimeUnit.MILLISECONDS); }
        catch (java.util.concurrent.TimeoutException e) { return slow; }
        catch (java.util.concurrent.ExecutionException e) { Throwable c = e.getCause(); throw c instanceof Exception ? (Exception) c : new Exception(String.valueOf(c)); }
    }

    // ---------- Bausteine ----------
    static LayoutElementBuilders.LayoutElement text(String s, float sp, int color, boolean bold) {
        return new LayoutElementBuilders.Text.Builder().setText(s).setMaxLines(2)
            .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
            .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END)
            .setFontStyle(new LayoutElementBuilders.FontStyle.Builder().setSize(DimensionBuilders.sp(sp)).setColor(ColorBuilders.argb(color))
                .setWeight(bold ? LayoutElementBuilders.FONT_WEIGHT_BOLD : LayoutElementBuilders.FONT_WEIGHT_NORMAL).build())
            .build();
    }
    static LayoutElementBuilders.LayoutElement gap(float dp) {
        return new LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(dp)).setWidth(DimensionBuilders.dp(dp)).build();
    }
    /** runder/abgerundeter Knopf; name = Klick-Kennung (ohne Zeitstempel) */
    LayoutElementBuilders.LayoutElement button(String label, String name, int color, float w, float h, float sp, boolean filled) {
        return box(text(label, sp, filled ? DARK : WHITE, true), w, h, filled ? color : CHIP, color, load(name), label);
    }
    /** Knopf, der die App auf einer Seite öffnet */
    LayoutElementBuilders.LayoutElement launchButton(String label, String screen, int color, float w, float h, float sp) {
        return box(text(label, sp, WHITE, true), w, h, CHIP, color, launch(screen), label);
    }
    static LayoutElementBuilders.LayoutElement box(LayoutElementBuilders.LayoutElement inner, float w, float h, int bgColor, int border, ModifiersBuilders.Clickable click, String desc) {
        ModifiersBuilders.Modifiers.Builder m = new ModifiersBuilders.Modifiers.Builder()
            .setBackground(new ModifiersBuilders.Background.Builder().setColor(ColorBuilders.argb(bgColor))
                .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(DimensionBuilders.dp(Math.min(w, h) / 2f)).build()).build())
            .setBorder(new ModifiersBuilders.Border.Builder().setWidth(DimensionBuilders.dp(2)).setColor(ColorBuilders.argb(border)).build())
            .setSemantics(new ModifiersBuilders.Semantics.Builder().setContentDescription(desc).build());
        if (click != null) m.setClickable(click);
        return new LayoutElementBuilders.Box.Builder().setWidth(DimensionBuilders.dp(w)).setHeight(DimensionBuilders.dp(h))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(m.build()).addContent(inner).build();
    }
    ModifiersBuilders.Clickable load(String name) {
        return new ModifiersBuilders.Clickable.Builder().setId(name + "#" + stamp)
            .setOnClick(new ActionBuilders.LoadAction.Builder().build()).build();
    }
    ModifiersBuilders.Clickable launch(String screen) {
        ActionBuilders.AndroidActivity.Builder a = new ActionBuilders.AndroidActivity.Builder()
            .setPackageName(getPackageName()).setClassName(MainActivity.class.getName());
        if (screen != null && !screen.isEmpty()) a.addKeyToExtraMapping("screen", new ActionBuilders.AndroidStringExtra.Builder().setValue(screen).build());
        return new ModifiersBuilders.Clickable.Builder().setId("open_" + (screen == null ? "" : screen))
            .setOnClick(new ActionBuilders.LaunchAction.Builder().setAndroidActivity(a.build()).build()).build();
    }
    static LayoutElementBuilders.Row.Builder row() {
        return new LayoutElementBuilders.Row.Builder().setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER);
    }
    static LayoutElementBuilders.Column.Builder column() {
        return new LayoutElementBuilders.Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER);
    }
    /** Ring am Rand: Anteil 0…1 in Farbe, Rest gedämpft (unter dem Inhalt) */
    static LayoutElementBuilders.LayoutElement withRing(LayoutElementBuilders.LayoutElement content, float frac, int color) {
        float f = Math.max(0f, Math.min(1f, frac));
        LayoutElementBuilders.Box.Builder b = new LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.expand()).setHeight(DimensionBuilders.expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(ring(360f, (color & 0x00FFFFFF) | 0x33000000));
        if (f > 0.005f) b.addContent(ring(360f * f, color));
        return b.addContent(content).build();
    }
    private static LayoutElementBuilders.LayoutElement ring(float deg, int color) {
        return new LayoutElementBuilders.Arc.Builder()
            .setAnchorAngle(DimensionBuilders.degrees(0)).setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
            .addContent(new LayoutElementBuilders.ArcLine.Builder().setLength(DimensionBuilders.degrees(deg))
                .setThickness(DimensionBuilders.dp(5)).setColor(ColorBuilders.argb(color))
                .setStrokeCap(LayoutElementBuilders.STROKE_CAP_ROUND).build())
            .build();
    }
    /** Hinweis, wenn nicht gekoppelt */
    LayoutElementBuilders.LayoutElement notPaired() {
        return column().addContent(text("◈ NEXUS", 12, CYAN, true)).addContent(gap(6))
            .addContent(text("Nicht gekoppelt", 14, WHITE, true)).addContent(gap(8))
            .addContent(launchButton("Öffnen", "", GOLD, 110, 40, 14)).build();
    }
    static String ago(long at) {
        if (at <= 0) return "noch nie";
        long s = (System.currentTimeMillis() - at) / 1000;
        return s < 60 ? "gerade" : s < 3600 ? "vor " + (s / 60) + " min" : "vor " + (s / 3600) + " h";
    }
}
