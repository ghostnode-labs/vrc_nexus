package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * 7.0.1: Widget „Schnellzugriff“ – Freunde, Events, Clubs, Knöpfe und PC mit einem Tippen; dazu 🛑 Panik für den gekoppelten PC
 * (stoppt dort sofort Spielzeug, Szenen und NSFW – also nur in die sichere Richtung). Die App führt es nach dem Öffnen aus.
 */
public class QuickWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_quick);
        JSONObject o = WidgetKit.data(ctx);
        v.setTextViewText(R.id.wq_friends, "👥\n" + WidgetKit.L(o, "q_friends", "Freunde"));
        v.setTextViewText(R.id.wq_events, "📅\n" + WidgetKit.L(o, "q_events", "Events"));
        v.setTextViewText(R.id.wq_clubs, "🏠\n" + WidgetKit.L(o, "q_clubs", "Clubs"));
        v.setTextViewText(R.id.wq_buttons, "🎛\n" + WidgetKit.L(o, "q_buttons", "Knöpfe"));
        v.setTextViewText(R.id.wq_panic, "🛑\n" + WidgetKit.L(o, "q_panic", "Panik"));
        v.setOnClickPendingIntent(R.id.wq_friends, WidgetKit.open(ctx, "open", "friends"));
        v.setOnClickPendingIntent(R.id.wq_events, WidgetKit.open(ctx, "open", "calendar"));
        v.setOnClickPendingIntent(R.id.wq_clubs, WidgetKit.open(ctx, "open", "clubs"));
        v.setOnClickPendingIntent(R.id.wq_buttons, WidgetKit.open(ctx, "open", "buttons"));
        v.setOnClickPendingIntent(R.id.wq_panic, WidgetKit.open(ctx, "act", "panic"));
        return v;
    }
}
