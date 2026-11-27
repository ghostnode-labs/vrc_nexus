package dev.ghostnode.nexuspet;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Wecker alle ~15 Minuten (ungenau, schont den Akku): Zeit nachrechnen, Widget aktualisieren und melden,
 * wenn der Geistling ruft oder sich entwickelt hat. Nach dem Neustart des Handys wird der Wecker neu gestellt.
 */
public class PetAlarm extends BroadcastReceiver {
    static final String CH = "pet_calls";
    static final int NOTE_ID = 7;

    static void schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, new Intent(ctx, PetAlarm.class).setAction("dev.ghostnode.nexuspet.TICK"),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + AlarmManager.INTERVAL_FIFTEEN_MINUTES, AlarmManager.INTERVAL_FIFTEEN_MINUTES, pi);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent == null ? "" : String.valueOf(intent.getAction());
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.MY_PACKAGE_REPLACED".equals(a)) schedule(ctx);
        PetModel m = PetStore.load(ctx);
        String before = m.form;
        PetModel.Stage stBefore = m.stage;
        m.tick(System.currentTimeMillis());
        String note = null;
        if (m.stage == PetModel.Stage.GONE && stBefore != PetModel.Stage.GONE) note = m.name + " ist in den Geisterwald zurückgekehrt. 🕯";
        else if (!before.equals(m.form)) note = m.name + " hat sich zu " + PetModel.formName(m.form) + " entwickelt! ✨";
        else if (m.needsAttention() && m.notifiedCall != m.callSince) { note = m.callText(); m.notifiedCall = m.callSince; }
        PetStore.save(ctx, m);
        PetWidget.updateAll(ctx, m);
        if (note != null && PetStore.flag(ctx, "notify", true)) notify(ctx, m, note);
    }

    static void notify(Context ctx, PetModel m, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CH) == null) {
            NotificationChannel c = new NotificationChannel(CH, "Rufe deines Geistlings", NotificationManager.IMPORTANCE_DEFAULT);
            c.setDescription("Hunger, Laune, Licht aus und Entwicklungen");
            nm.createNotificationChannel(c);
        }
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(ctx, CH)
                .setSmallIcon(R.drawable.ic_stat_pet)
                .setLargeIcon(PetView.bitmap(m, 128))
                .setContentTitle("👻 " + m.name)
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try { nm.notify(NOTE_ID, n); } catch (SecurityException e) { /* keine Erlaubnis für Benachrichtigungen */ }
    }

    static void clearNote(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTE_ID);
    }
}
