package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * 7.0.1: Widget „Puls & PC“ – Puls, Welt und Spieler vom gekoppelten PC (Handy ↔ PC). Im Privat-Modus des PCs keine Welt.
 * 7.3.3 Einstellungen: Design, Schriftgröße, Welt zeigen, Spielerzahl, Schlafmodus-Hinweis, „Stand“, Ziel beim Tippen.
 */
public class PulseWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) { WidgetCfg.forget(ctx, ids); }

    static RemoteViews build(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_pulse);
        JSONObject o = WidgetKit.data(ctx), pc = o == null ? null : o.optJSONObject("pc");
        String big = "–", line = WidgetKit.L(o, "pc_none", "Nicht mit dem PC gekoppelt – tippen zum Koppeln"), sub = "";
        boolean world = WidgetCfg.on(ctx, id, "world", true), players = WidgetCfg.on(ctx, id, "players", true);
        if (pc != null && pc.optBoolean("paired", false)) {
            int bpm = pc.optInt("bpm", 0);
            big = bpm > 0 ? "❤ " + bpm : "❤ –";
            long now = System.currentTimeMillis() / 1000, at = pc.optLong("at", 0);
            String name = "🖥 " + pc.optString("name", "PC");
            if (!pc.optString("error", "").isEmpty()) line = "⚠ " + pc.optString("error");
            else if (at > 0 && now - at > 600) line = WidgetKit.L(o, "pc_old", "PC gerade nicht erreichbar");
            else if (!pc.optBoolean("running", false)) line = name + " · " + WidgetKit.L(o, "vrc_off", "VRChat aus");
            else if (pc.optBoolean("private", false)) line = name + " · 🔒 " + WidgetKit.L(o, "private", "Privat-Modus");
            else if (world) line = "🌐 " + pc.optString("world", "") + (players ? " · 👥 " + pc.optInt("players", 0) : "");
            else line = name + (players ? " · 👥 " + pc.optInt("players", 0) : "");
            if (pc.optBoolean("sleeping", false) && WidgetCfg.on(ctx, id, "sleep", true)) sub = "😴 " + WidgetKit.L(o, "sleep", "Schlafmodus an");
        }
        String foot = WidgetCfg.on(ctx, id, "foot", true) ? WidgetKit.foot(o) : "";
        v.setTextViewText(R.id.wp_bpm, big);
        v.setTextViewText(R.id.wp_line, line);
        v.setTextViewText(R.id.wp_sub, sub.isEmpty() ? foot : sub + (foot.isEmpty() ? "" : "   " + foot));
        WidgetCfg.style(ctx, v, id, R.id.wp_root, new int[][] { { R.id.wp_bpm, WidgetCfg.ALERT, 30 }, { R.id.wp_line, WidgetCfg.ACCENT, 12 }, { R.id.wp_sub, WidgetCfg.MUTED, 10 }, { R.id.wp_cfg, WidgetCfg.MUTED, 12 } });
        v.setOnClickPendingIntent(R.id.wp_root, WidgetKit.open(ctx, "open", WidgetCfg.tap(ctx, id, "pc")));
        v.setOnClickPendingIntent(R.id.wp_cfg, WidgetCfg.settings(ctx, id));
        return v;
    }
}
