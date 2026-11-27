package dev.ghostnode.nexuspet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Startbildschirm-Widget: der Geistling mit Hunger, Laune und Ruf. Tippen öffnet die App. */
public class PetWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        PetModel m = PetStore.loadTicked(ctx);
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, m));
    }

    static void updateAll(Context ctx, PetModel m) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PetWidget.class));
        if (ids == null) return;
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, m));
    }

    static RemoteViews build(Context ctx, PetModel m) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.pet_widget);
        v.setImageViewBitmap(R.id.pw_img, PetView.bitmap(m, 96));
        v.setTextViewText(R.id.pw_name, m.name);
        String line;
        if (m.stage == PetModel.Stage.GONE) line = "🕯 im Geisterwald";
        else if (m.stage == PetModel.Stage.EGG) line = "🥚 schlüpft gleich";
        else if (m.paused) line = "🏖 Urlaub";
        else if (m.needsAttention()) line = "❗ " + m.callText();
        else line = "🍙 " + MainActivity.hearts(m.hunger) + "  😊 " + MainActivity.hearts(m.happy) + (m.poops > 0 ? "  💩" : "") + (m.sick ? "  🤒" : "") + (m.sleeping ? "  😴" : "");
        v.setTextViewText(R.id.pw_line, line);
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.pw_root, PendingIntent.getActivity(ctx, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
