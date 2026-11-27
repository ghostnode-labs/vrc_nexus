package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** 7.0.1: Widget „Puls & PC“ – Puls, Welt und Spieler vom gekoppelten PC (Handy ↔ PC). Im Privat-Modus des PCs keine Welt. */
public class PulseWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_pulse);
        JSONObject o = WidgetKit.data(ctx), pc = o == null ? null : o.optJSONObject("pc");
        String big = "–", line = WidgetKit.L(o, "pc_none", "Nicht mit dem PC gekoppelt – tippen zum Koppeln"), sub = "";
        String target = "pc";
        if (pc != null && pc.optBoolean("paired", false)) {
            int bpm = pc.optInt("bpm", 0);
            big = bpm > 0 ? "❤ " + bpm : "❤ –";
            long now = System.currentTimeMillis() / 1000, at = pc.optLong("at", 0);
            if (!pc.optString("error", "").isEmpty()) line = "⚠ " + pc.optString("error");
            else if (at > 0 && now - at > 600) line = WidgetKit.L(o, "pc_old", "PC gerade nicht erreichbar");
            else if (!pc.optBoolean("running", false)) line = "🖥 " + pc.optString("name", "PC") + " · " + WidgetKit.L(o, "vrc_off", "VRChat aus");
            else if (pc.optBoolean("private", false)) line = "🖥 " + pc.optString("name", "PC") + " · 🔒 " + WidgetKit.L(o, "private", "Privat-Modus");
            else line = "🌐 " + pc.optString("world", "") + " · 👥 " + pc.optInt("players", 0);
            if (pc.optBoolean("sleeping", false)) sub = "😴 " + WidgetKit.L(o, "sleep", "Schlafmodus an");
        }
        v.setTextViewText(R.id.wp_bpm, big);
        v.setTextViewText(R.id.wp_line, line);
        v.setTextViewText(R.id.wp_sub, sub.isEmpty() ? WidgetKit.foot(o) : sub + "   " + WidgetKit.foot(o));
        v.setOnClickPendingIntent(R.id.wp_root, WidgetKit.open(ctx, "open", target));
        return v;
    }
}
