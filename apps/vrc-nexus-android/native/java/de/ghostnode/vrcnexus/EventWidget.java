package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 7.0.1: Widget „Nächste Events“ – kommende Gruppen-Events mit Countdown, darunter Jubiläen und Geburtstage.
 * 7.3.3 Einstellungen: Design, Schriftgröße, Anzahl Events (1–6), nur ⭐ gefolgte, Jubiläen/Geburtstage, „Stand“, Ziel beim Tippen.
 */
public class EventWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) { WidgetCfg.forget(ctx, ids); }

    static RemoteViews build(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_events);
        JSONObject o = WidgetKit.data(ctx);
        int count = WidgetCfg.num(ctx, id, "count", 3, 1, 6);
        boolean star = WidgetCfg.on(ctx, id, "star", false), anniv = WidgetCfg.on(ctx, id, "anniv", true);
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
            if (star && !e.optBoolean("following", false)) continue;
            String t = (e.optBoolean("following", false) ? "⭐ " : "") + e.optString("title", "");
            if (shown == 0) { first = t; firstSub = WidgetKit.until(o, s, en) + (e.optString("group", "").isEmpty() ? "" : " · " + e.optString("group")); }
            else if (shown < count) rest.append(rest.length() > 0 ? "\n" : "").append("• ").append(WidgetKit.day(s)).append("  ").append(t);
            shown++;
        }
        JSONArray an = o == null || !anniv ? null : o.optJSONArray("anniv");
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
        v.setTextViewText(R.id.we_foot, WidgetCfg.on(ctx, id, "foot", true) ? WidgetKit.foot(o) : "");
        WidgetCfg.style(ctx, v, id, R.id.we_root, new int[][] { { R.id.we_head, WidgetCfg.MUTED, 11 }, { R.id.we_title, WidgetCfg.HEAD, 15 }, { R.id.we_when, WidgetCfg.ACCENT, 12 }, { R.id.we_list, WidgetCfg.TEXT, 11 }, { R.id.we_foot, WidgetCfg.MUTED, 10 }, { R.id.we_cfg, WidgetCfg.MUTED, 12 } });
        v.setOnClickPendingIntent(R.id.we_root, WidgetKit.open(ctx, "open", WidgetCfg.tap(ctx, id, "calendar")));
        v.setOnClickPendingIntent(R.id.we_cfg, WidgetCfg.settings(ctx, id));
        return v;
    }
}
