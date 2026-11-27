package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** 7.0.1: Widget „Nächste Events“ – kommende Gruppen-Events mit Countdown, darunter Jubiläen und Geburtstage. */
public class EventWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_events);
        JSONObject o = WidgetKit.data(ctx);
        String head = "📅 " + WidgetKit.L(o, "events", "Nächste Events"), first = WidgetKit.L(o, "no_events", "Keine Events geplant."), firstSub = "";
        StringBuilder rest = new StringBuilder();
        if (o == null) first = WidgetKit.L(o, "no_data", "Noch keine Daten – App einmal öffnen.");
        JSONArray ev = o == null ? null : o.optJSONArray("events");
        long now = System.currentTimeMillis() / 1000;
        int shown = 0;
        if (ev != null) for (int i = 0; i < ev.length(); i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e == null) continue;
            long s = e.optLong("start", 0), en = e.optLong("end", 0);
            if ((en > 0 ? en : s) < now) continue;   // inzwischen vorbei (Daten können bis 30 min alt sein)
            String t = (e.optBoolean("following", false) ? "⭐ " : "") + e.optString("title", "");
            if (shown == 0) { first = t; firstSub = WidgetKit.until(o, s, en) + (e.optString("group", "").isEmpty() ? "" : " · " + e.optString("group")); }
            else if (shown < 3) rest.append(rest.length() > 0 ? "\n" : "").append("• ").append(WidgetKit.day(s)).append("  ").append(t);
            shown++;
        }
        JSONArray an = o == null ? null : o.optJSONArray("anniv");
        if (an != null) for (int i = 0; i < an.length() && i < 2; i++) {
            JSONObject a = an.optJSONObject(i);
            if (a == null || a.optString("name", "").isEmpty()) continue;
            int d = a.optInt("in_days", 0);
            String when = d == 0 ? WidgetKit.L(o, "today", "heute") : WidgetKit.L(o, "in", "in") + " " + d + " " + WidgetKit.L(o, "days", "Tagen");
            String what = "birthday".equals(a.optString("kind")) ? "🎂 " + a.optString("name") : "💛 " + a.optString("name") + " · " + a.optInt("years", 0) + " " + WidgetKit.L(o, "years", "Jahre");
            rest.append(rest.length() > 0 ? "\n" : "").append(what).append(" – ").append(when);
        }
        v.setTextViewText(R.id.we_head, head);
        v.setTextViewText(R.id.we_title, first);
        v.setTextViewText(R.id.we_when, firstSub);
        v.setTextViewText(R.id.we_list, rest.toString());
        v.setTextViewText(R.id.we_foot, WidgetKit.foot(o));
        v.setOnClickPendingIntent(R.id.we_root, WidgetKit.open(ctx, "open", "calendar"));
        return v;
    }
}
