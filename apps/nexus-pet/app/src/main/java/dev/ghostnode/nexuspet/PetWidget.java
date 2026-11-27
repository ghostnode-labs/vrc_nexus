package dev.ghostnode.nexuspet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Startbildschirm-Widget: der Geistling mit Hunger, Laune und Ruf. Tippen öffnet die App.
 * 1.1: Einstellungen je Widget (⚙ im Widget, „Widget anpassen“ ab Android 12): Design, Name, Statuszeile, Werte als Zahlen, Schriftgröße.
 */
public class PetWidget extends AppWidgetProvider {
    static final String PREFS = "pet_widget_cfg";
    static final String[] THEMES = { "dark", "light", "clear" };
    static final String[] SIZES = { "s", "m", "l" };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        PetModel m = PetStore.loadTicked(ctx);
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, m, id));
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); SharedPreferences.Editor e = sp.edit();
        for (int id : ids) for (String k : sp.getAll().keySet()) if (k.startsWith(id + ".")) e.remove(k);
        e.apply();
    }

    static void updateAll(Context ctx, PetModel m) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PetWidget.class));
        if (ids == null) return;
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, m, id));
    }

    // ---------- Einstellungen (geprüft beim Lesen) ----------
    static String str(Context ctx, int id, String key, String def, String[] ok) {
        String v = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(id + "." + key, def);
        for (String a : ok) if (a.equals(v)) return v;
        return def;
    }
    static boolean on(Context ctx, int id, String key, boolean def) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(id + "." + key, def); }

    static String num(int n) { return n + "/" + PetModel.MAX_HEARTS; }

    static RemoteViews build(Context ctx, PetModel m, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.pet_widget);
        v.setImageViewBitmap(R.id.pw_img, PetView.bitmap(m, 96));
        boolean nums = on(ctx, id, "nums", false);
        v.setTextViewText(R.id.pw_name, m.name);
        v.setViewVisibility(R.id.pw_name, on(ctx, id, "name", true) ? View.VISIBLE : View.GONE);
        String line;
        if (m.stage == PetModel.Stage.GONE) line = "🕯 im Geisterwald";
        else if (m.stage == PetModel.Stage.EGG) line = "🥚 schlüpft gleich";
        else if (m.paused) line = "🏖 Urlaub";
        else if (m.needsAttention()) line = "❗ " + m.callText();
        else line = "🍙 " + (nums ? num(m.hunger) : MainActivity.hearts(m.hunger)) + "  😊 " + (nums ? num(m.happy) : MainActivity.hearts(m.happy))
            + (m.poops > 0 ? "  💩" : "") + (m.sick ? "  🤒" : "") + (m.sleeping ? "  😴" : "");
        v.setTextViewText(R.id.pw_line, line);
        v.setViewVisibility(R.id.pw_line, on(ctx, id, "line", true) ? View.VISIBLE : View.GONE);
        // Design
        String t = str(ctx, id, "theme", "dark", THEMES), s = str(ctx, id, "size", "m", SIZES);
        boolean light = "light".equals(t);
        v.setInt(R.id.pw_root, "setBackgroundResource", light ? R.drawable.pet_widget_bg_light : "clear".equals(t) ? R.drawable.pet_widget_bg_clear : R.drawable.pet_widget_bg);
        float k = "s".equals(s) ? 0.85f : "l".equals(s) ? 1.2f : 1f;
        v.setTextColor(R.id.pw_name, light ? 0xFF9A6700 : 0xFFF3C262);
        v.setTextColor(R.id.pw_line, light ? 0xFF1E293B : 0xFFE2E8F0);
        v.setTextColor(R.id.pw_cfg, light ? 0xFF64748B : 0xFF7A8794);
        v.setTextViewTextSize(R.id.pw_name, TypedValue.COMPLEX_UNIT_SP, 15 * k);
        v.setTextViewTextSize(R.id.pw_line, TypedValue.COMPLEX_UNIT_SP, 12 * k);
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.pw_root, PendingIntent.getActivity(ctx, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent cfg = new Intent(ctx, PetWidgetConfig.class).setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE).setData(Uri.parse("nexuspet://cfg/" + id))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        v.setOnClickPendingIntent(R.id.pw_cfg, PendingIntent.getActivity(ctx, 9000 + id, cfg, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
