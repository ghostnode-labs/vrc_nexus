package de.ghostnode.vrcnexus;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.appwidget.AppWidgetManager;
import android.util.TypedValue;
import android.widget.RemoteViews;

/**
 * 7.3.3: Einstellungen je Widget (jede Instanz eigene Werte, gespeichert unter „<id>.<schlüssel>“).
 * Gemeinsam: Design (dunkel / hell / durchsichtig), Schriftgröße, „Stand“-Zeile, Ziel beim Tippen.
 * Dazu je Widget eigene Optionen (siehe WidgetConfigActivity). Die Werte werden beim Lesen immer geprüft.
 */
final class WidgetCfg {
    static final String PREFS = "nexus_widget_cfg";
    static final String[] THEMES = { "dark", "light", "clear" };
    static final String[] SIZES = { "s", "m", "l" };
    /** Rollen für die Textfarbe */
    static final int HEAD = 0, ACCENT = 1, TEXT = 2, MUTED = 3, ALERT = 4;
    private static final int[] DARK = { 0xFFF3C262, 0xFF38D5E6, 0xFFE2E8F0, 0xFF7A8794, 0xFFFF5C7A };
    private static final int[] LIGHT = { 0xFF9A6700, 0xFF0E7490, 0xFF1E293B, 0xFF64748B, 0xFFBE123C };

    private WidgetCfg() {}

    private static SharedPreferences p(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String str(Context ctx, int id, String key, String def, String[] allowed) {
        String v = p(ctx).getString(id + "." + key, def);
        if (allowed != null) { for (String a : allowed) if (a.equals(v)) return v; return def; }
        return v == null ? def : v;
    }
    static int num(Context ctx, int id, String key, int def, int min, int max) {
        int v = p(ctx).getInt(id + "." + key, def);
        return v < min ? min : v > max ? max : v;
    }
    static boolean on(Context ctx, int id, String key, boolean def) { return p(ctx).getBoolean(id + "." + key, def); }

    static void putStr(SharedPreferences.Editor e, int id, String key, String v) { e.putString(id + "." + key, v); }
    static void putNum(SharedPreferences.Editor e, int id, String key, int v) { e.putInt(id + "." + key, v); }
    static void putOn(SharedPreferences.Editor e, int id, String key, boolean v) { e.putBoolean(id + "." + key, v); }
    static SharedPreferences.Editor edit(Context ctx) { return p(ctx).edit(); }

    /** beim Entfernen eines Widgets seine Einstellungen löschen */
    static void forget(Context ctx, int[] ids) {
        SharedPreferences sp = p(ctx); SharedPreferences.Editor e = sp.edit();
        for (int id : ids) for (String k : sp.getAll().keySet()) if (k.startsWith(id + ".")) e.remove(k);
        e.apply();
    }

    /** Ziel beim Tippen: nur erlaubte Bereiche, sonst der Standard des Widgets */
    static String tap(Context ctx, int id, String def) { return str(ctx, id, "tap", def, WidgetKit.TABS); }

    static float scale(Context ctx, int id) {
        String s = str(ctx, id, "size", "m", SIZES);
        return "s".equals(s) ? 0.85f : "l".equals(s) ? 1.2f : 1f;
    }
    static boolean light(Context ctx, int id) { return "light".equals(str(ctx, id, "theme", "dark", THEMES)); }

    /**
     * Design anwenden: Hintergrund, Farben und Schriftgrößen.
     * views = { {viewId, Rolle, Grundgröße in sp}, … }
     */
    static void style(Context ctx, RemoteViews v, int id, int root, int[][] views) {
        String t = str(ctx, id, "theme", "dark", THEMES);
        int bg = "light".equals(t) ? R.drawable.nexus_widget_bg_light : "clear".equals(t) ? R.drawable.nexus_widget_bg_clear : R.drawable.nexus_widget_bg;
        v.setInt(root, "setBackgroundResource", bg);
        int[] pal = "light".equals(t) ? LIGHT : DARK;
        float k = scale(ctx, id);
        for (int[] x : views) {
            if (x[1] >= 0) v.setTextColor(x[0], pal[x[1]]);
            if (x[2] > 0) v.setTextViewTextSize(x[0], TypedValue.COMPLEX_UNIT_SP, x[2] * k);
        }
    }

    /** ⚙ im Widget: öffnet die Einstellungen genau dieser Instanz */
    static PendingIntent settings(Context ctx, int id) {
        Intent i = new Intent(ctx, WidgetConfigActivity.class);
        i.setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE);
        i.setData(Uri.parse("nexus://cfg/" + id));   // eigene Adresse je Instanz
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(ctx, 9000 + id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
