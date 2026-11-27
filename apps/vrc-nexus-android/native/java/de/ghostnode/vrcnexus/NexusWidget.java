package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Homescreen-Widget: Freunde im Spiel/online, ungelesene Benachrichtigungen, die ersten Freunde mit Welt. Tippen öffnet die App.
 * 7.3.3 Einstellungen: Design, Schriftgröße, Anzahl Freunde (0–8), Status-Punkt, Benachrichtigungen in der Zeile, „Stand“, Ziel beim Tippen.
 */
public class NexusWidget extends AppWidgetProvider {
    static final String PREFS = WidgetKit.PREFS;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) { WidgetCfg.forget(ctx, ids); }

    static void refreshAll(Context ctx) { WidgetKit.refreshAll(ctx); }

    static RemoteViews build(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget);
        JSONObject o = WidgetKit.data(ctx);
        int rows = WidgetCfg.num(ctx, id, "rows", 5, 0, 8);
        String head = "VRC Nexus öffnen", line = WidgetKit.L(o, "no_data", "Noch keine Daten – App einmal öffnen."), list = "";
        if (o != null) {
            String me = o.optString("me", "");
            head = me.isEmpty() ? "VRC Nexus" : me + (WidgetCfg.on(ctx, id, "dot", true) ? statusDot(o.optString("status", "")) : "");
            // Zeile in der gewählten App-Sprache (kommt fertig aus der App), sonst Deutsch
            line = o.optString("line", o.optInt("in_game", 0) + " im Spiel · " + o.optInt("online", 0) + " online")
                + (WidgetCfg.on(ctx, id, "bell", true) && o.optInt("notifs", 0) > 0 ? " · 🔔 " + o.optInt("notifs", 0) : "");
            JSONArray top = o.optJSONArray("top");
            StringBuilder sb = new StringBuilder();
            if (top != null) for (int i = 0; i < top.length() && i < rows; i++) sb.append(i > 0 ? "\n" : "").append("• ").append(top.optString(i));
            list = sb.toString();
        }
        v.setTextViewText(R.id.w_head, head);
        v.setTextViewText(R.id.w_line, line);
        v.setTextViewText(R.id.w_list, list);
        v.setTextViewText(R.id.w_foot, WidgetCfg.on(ctx, id, "foot", true) ? WidgetKit.foot(o) : "");
        WidgetCfg.style(ctx, v, id, R.id.w_root, new int[][] { { R.id.w_head, WidgetCfg.HEAD, 15 }, { R.id.w_line, WidgetCfg.ACCENT, 13 }, { R.id.w_list, WidgetCfg.TEXT, 12 }, { R.id.w_foot, WidgetCfg.MUTED, 10 }, { R.id.w_cfg, WidgetCfg.MUTED, 12 } });
        v.setOnClickPendingIntent(R.id.w_root, WidgetKit.open(ctx, "open", WidgetCfg.tap(ctx, id, "friends")));
        v.setOnClickPendingIntent(R.id.w_cfg, WidgetCfg.settings(ctx, id));
        return v;
    }

    private static String statusDot(String s) {
        switch (s) {
            case "join me": return "  🔵";
            case "active": return "  🟢";
            case "ask me": return "  🟠";
            case "busy": return "  🔴";
            default: return "";
        }
    }
}
