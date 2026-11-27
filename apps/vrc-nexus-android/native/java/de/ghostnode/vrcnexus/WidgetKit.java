package de.ghostnode.vrcnexus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/**
 * 7.0.1: Gemeinsame Helfer für alle Homescreen-Widgets.
 * Die App schreibt eine kurze Zusammenfassung (JSON, Texte schon in der App-Sprache) in die SharedPreferences;
 * Tippen auf ein Widget öffnet die App über nexus://open/<bereich> oder führt nexus://act/<aktion> aus (die App erledigt den Rest).
 */
final class WidgetKit {
    static final String PREFS = "nexus_widget";
    static final Class<?>[] PROVIDERS = { NexusWidget.class, PulseWidget.class, EventWidget.class, NotifWidget.class, QuickWidget.class };
    /** erlaubte Ziele – alles andere wird verworfen */
    static final String[] TABS = { "home", "friends", "community", "clubs", "calendar", "notifs", "buttons", "pc", "nsfw", "settings" };
    static final String[] ACTS = { "panic" };

    private WidgetKit() {}

    static JSONObject data(Context ctx) {
        String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "");
        try { return raw != null && raw.length() > 2 ? new JSONObject(raw) : null; } catch (Exception e) { return null; }
    }

    /** übersetzter Text aus der App (Feld „L“), sonst deutscher Standard */
    static String L(JSONObject o, String key, String def) {
        if (o == null) return def;
        JSONObject l = o.optJSONObject("L");
        String s = l != null ? l.optString(key, "") : "";
        return s.isEmpty() ? def : s;
    }

    static PendingIntent open(Context ctx, String kind, String what) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse("nexus://" + kind + "/" + what));   // eigene Adresse je Ziel, sonst überschreibt Android die PendingIntents
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, (kind + what).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** alle Widgets neu zeichnen (nach neuen Daten aus der App) */
    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (Class<?> k : PROVIDERS) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, k));
            if (ids == null || ids.length == 0) continue;
            Intent i = new Intent(ctx, k);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        }
    }

    /** Ziel aus einem Widget-Tippen merken – die App holt es ab (WidgetBridge.takePending) */
    static void stash(Context ctx, Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri u = intent.getData();
        if (!"nexus".equals(u.getScheme())) return;
        String kind = u.getHost(), what = u.getPath() == null ? "" : u.getPath().replace("/", "");
        String[] ok = "act".equals(kind) ? ACTS : "open".equals(kind) ? TABS : new String[0];
        boolean allowed = false;
        for (String s : ok) if (s.equals(what)) allowed = true;
        if (!allowed) return;
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("pending", kind + ":" + what).putLong("pending_at", System.currentTimeMillis()).apply();
        WidgetBridge.ping();
    }

    static String hm(long ts) { return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(ts * 1000)); }
    static String day(long ts) { return new SimpleDateFormat("EEE dd.MM. HH:mm", Locale.getDefault()).format(new Date(ts * 1000)); }

    /** „in 2 h 10 min“ / „läuft“ – Wörter kommen übersetzt aus der App */
    static String until(JSONObject o, long start, long end) {
        long now = System.currentTimeMillis() / 1000, d = start - now;
        if (d <= 0) return end > now ? L(o, "live", "läuft gerade") : "";
        if (d < 3600) return L(o, "in", "in") + " " + Math.max(1, d / 60) + " min";
        if (d < 86400) return L(o, "in", "in") + " " + (d / 3600) + " h " + ((d % 3600) / 60) + " min";
        return day(start);
    }

    static String foot(JSONObject o) {
        long ts = o == null ? 0 : o.optLong("ts", 0);
        return ts > 0 ? L(o, "stand", "Stand") + " " + hm(ts) : "";
    }
}
