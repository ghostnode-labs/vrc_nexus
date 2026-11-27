package de.ghostnode.vrcnexus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * 7.0.1: Widget „Schnellzugriff“ – vier Bereiche mit einem Tippen; dazu 🛑 Panik für den gekoppelten PC
 * (stoppt dort sofort Spielzeug, Szenen und NSFW – also nur in die sichere Richtung). Die App führt es nach dem Öffnen aus.
 * 7.3.3 Einstellungen: welche vier Bereiche, Panik-Knopf ein/aus, Design, Schriftgröße.
 */
public class QuickWidget extends AppWidgetProvider {
    /** wählbare Knöpfe: Bereich → Symbol + Text-Schlüssel */
    static final String[] SLOTS = { "friends", "calendar", "clubs", "buttons", "community", "notifs", "pc", "home", "settings" };
    static final String[] DEFAULTS = { "friends", "calendar", "clubs", "buttons" };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) { WidgetCfg.forget(ctx, ids); }

    static String icon(String tab) {
        switch (tab) {
            case "friends": return "👥"; case "calendar": return "📅"; case "clubs": return "🏠"; case "buttons": return "🎛";
            case "community": return "🫂"; case "notifs": return "🔔"; case "pc": return "🖥"; case "home": return "🏠"; default: return "⚙";
        }
    }
    static String label(JSONObject o, String tab) {
        switch (tab) {
            case "friends": return WidgetKit.L(o, "q_friends", "Freunde"); case "calendar": return WidgetKit.L(o, "q_events", "Events");
            case "clubs": return WidgetKit.L(o, "q_clubs", "Clubs"); case "buttons": return WidgetKit.L(o, "q_buttons", "Knöpfe");
            case "community": return WidgetKit.L(o, "q_community", "Community"); case "notifs": return WidgetKit.L(o, "q_notifs", "Meldungen");
            case "pc": return WidgetKit.L(o, "q_pc", "PC"); case "home": return WidgetKit.L(o, "q_home", "Start"); default: return WidgetKit.L(o, "q_settings", "Einstellungen");
        }
    }

    static RemoteViews build(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.nexus_widget_quick);
        JSONObject o = WidgetKit.data(ctx);
        int[] btn = { R.id.wq_friends, R.id.wq_events, R.id.wq_clubs, R.id.wq_buttons };
        int[][] st = new int[btn.length + 2][];
        for (int i = 0; i < btn.length; i++) {
            String tab = WidgetCfg.str(ctx, id, "b" + (i + 1), DEFAULTS[i], SLOTS);
            v.setTextViewText(btn[i], icon(tab) + "\n" + label(o, tab));
            v.setOnClickPendingIntent(btn[i], WidgetKit.open(ctx, "open", tab));
            st[i] = new int[] { btn[i], WidgetCfg.TEXT, 11 };
        }
        boolean panic = WidgetCfg.on(ctx, id, "panic", true);
        v.setViewVisibility(R.id.wq_panic, panic ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.wq_panic, "🛑\n" + WidgetKit.L(o, "q_panic", "Panik"));
        v.setOnClickPendingIntent(R.id.wq_panic, WidgetKit.open(ctx, "act", "panic"));
        st[btn.length] = new int[] { R.id.wq_panic, WidgetCfg.ALERT, 11 };
        st[btn.length + 1] = new int[] { R.id.wq_cfg, WidgetCfg.MUTED, 12 };
        WidgetCfg.style(ctx, v, id, R.id.wq_root, st);
        v.setOnClickPendingIntent(R.id.wq_cfg, WidgetCfg.settings(ctx, id));
        return v;
    }
}
