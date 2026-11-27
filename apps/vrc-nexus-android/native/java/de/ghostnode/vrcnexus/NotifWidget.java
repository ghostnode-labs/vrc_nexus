package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 7.0.1: Widget „Benachrichtigungen“ – Anzahl ungelesen und die letzten Einladungen/Anfragen.
 * 7.3.3 Einstellungen: Design, Schriftgröße, Anzahl Einträge (1–6), Nachrichtentext zeigen, Zähler, „Stand“, Ziel beim Tippen.
 */
public class NotifWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) { WidgetCfg.forget(ctx, ids); }

    static RemoteViews build(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_notifs);
        JSONObject o = WidgetKit.data(ctx);
        int n = o == null ? 0 : o.optInt("notifs", 0), count = WidgetCfg.num(ctx, id, "count", 4, 1, 6);
        boolean msg = WidgetCfg.on(ctx, id, "msg", true);
        String head = "🔔 " + WidgetKit.L(o, "notifs", "Benachrichtigungen");
        StringBuilder sb = new StringBuilder();
        JSONArray it = o == null ? null : o.optJSONArray("notif_items");
        if (it != null) for (int i = 0; i < it.length() && i < count; i++) {
            JSONObject x = it.optJSONObject(i);
            if (x == null) continue;
            String m = msg ? x.optString("message", "") : "";
            sb.append(sb.length() > 0 ? "\n" : "").append("• ").append(x.optString("title", "")).append(m.isEmpty() ? "" : ": " + m);
        }
        if (sb.length() == 0) sb.append(o == null ? WidgetKit.L(o, "no_data", "Noch keine Daten – App einmal öffnen.") : WidgetKit.L(o, "no_notifs", "Alles gelesen 🎉"));
        v.setTextViewText(R.id.wn_head, head);
        v.setTextViewText(R.id.wn_count, n > 0 && WidgetCfg.on(ctx, id, "badge", true) ? String.valueOf(n) : "");
        v.setTextViewText(R.id.wn_list, sb.toString());
        v.setTextViewText(R.id.wn_foot, WidgetCfg.on(ctx, id, "foot", true) ? WidgetKit.foot(o) : "");
        WidgetCfg.style(ctx, v, id, R.id.wn_root, new int[][] { { R.id.wn_head, WidgetCfg.HEAD, 14 }, { R.id.wn_count, -1, 12 }, { R.id.wn_list, WidgetCfg.TEXT, 12 }, { R.id.wn_foot, WidgetCfg.MUTED, 10 }, { R.id.wn_cfg, WidgetCfg.MUTED, 12 } });
        v.setOnClickPendingIntent(R.id.wn_root, WidgetKit.open(ctx, "open", WidgetCfg.tap(ctx, id, "notifs")));
        v.setOnClickPendingIntent(R.id.wn_cfg, WidgetCfg.settings(ctx, id));
        return v;
    }
}
