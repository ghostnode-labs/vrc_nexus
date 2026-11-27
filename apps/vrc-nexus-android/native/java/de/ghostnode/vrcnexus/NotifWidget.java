package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** 7.0.1: Widget „Benachrichtigungen“ – Anzahl ungelesen und die letzten Einladungen/Anfragen. */
public class NotifWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_notifs);
        JSONObject o = WidgetKit.data(ctx);
        int n = o == null ? 0 : o.optInt("notifs", 0);
        String head = "🔔 " + WidgetKit.L(o, "notifs", "Benachrichtigungen");
        StringBuilder sb = new StringBuilder();
        JSONArray it = o == null ? null : o.optJSONArray("notif_items");
        if (it != null) for (int i = 0; i < it.length() && i < 4; i++) {
            JSONObject x = it.optJSONObject(i);
            if (x == null) continue;
            String m = x.optString("message", "");
            sb.append(sb.length() > 0 ? "\n" : "").append("• ").append(x.optString("title", "")).append(m.isEmpty() ? "" : ": " + m);
        }
        if (sb.length() == 0) sb.append(o == null ? WidgetKit.L(o, "no_data", "Noch keine Daten – App einmal öffnen.") : WidgetKit.L(o, "no_notifs", "Alles gelesen 🎉"));
        v.setTextViewText(R.id.wn_head, head);
        v.setTextViewText(R.id.wn_count, n > 0 ? String.valueOf(n) : "");
        v.setTextViewText(R.id.wn_list, sb.toString());
        v.setTextViewText(R.id.wn_foot, WidgetKit.foot(o));
        v.setOnClickPendingIntent(R.id.wn_root, WidgetKit.open(ctx, "open", "notifs"));
        return v;
    }
}
