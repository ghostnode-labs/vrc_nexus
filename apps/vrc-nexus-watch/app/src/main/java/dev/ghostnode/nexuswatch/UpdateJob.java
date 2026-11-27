package dev.ghostnode.nexuswatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/**
 * Update-Prüfung im Hintergrund: etwa alle 12 h mit Netz. Neue Version → einmal pro Version eine Benachrichtigung
 * „Update verfügbar – am PC installieren“. 8.0.19: kein Herunterladen/Installieren mehr auf der Uhr.
 */
public class UpdateJob extends JobService {
    static final int ID = 4711;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        JobInfo old = js.getPendingJob(ID);
        if (!Nexus.prefs(c).getBoolean("auto_update", true)) { js.cancel(ID); return; }
        if (old != null && !old.isRequireCharging()) return;   // alter Job (nur beim Laden) → neu anlegen
        js.schedule(new JobInfo.Builder(ID, new ComponentName(c, UpdateJob.class))
            .setPeriodic(12 * 60 * 60 * 1000L)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .build());
    }

    static void notifyUpdate(Context c, JSONObject l) {
        String v = l.optString("version");
        if (v.isEmpty() || v.equals(Nexus.prefs(c).getString("upd_notified", ""))) return;
        Nexus.prefs(c).edit().putString("upd_notified", v).apply();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("update", "Updates", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent pi = PendingIntent.getActivity(c, 2, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        nm.notify(2, new Notification.Builder(c, "update").setSmallIcon(R.drawable.ic_launcher).setContentTitle("Nexus Watch " + v + " verfügbar")
            .setContentText("Am PC installieren: VRC Nexus → Geräte → Uhr-App installieren").setStyle(new Notification.BigTextStyle()
                .bigText("Am PC installieren: VRC Nexus → Werkzeuge → 📡 Geräte → „Uhr-App installieren“ (über das WLAN-Debugging der Uhr)."))
            .setContentIntent(pi).setAutoCancel(true).build());
    }

    @Override public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                JSONObject l = Updater.latest();
                Nexus.prefs(this).edit().putLong("upd_checked", System.currentTimeMillis()).apply();
                if (l != null && l.getInt("code") > Updater.installedCode(this)) notifyUpdate(this, l);
            } catch (Exception ignored) { /* nächster Versuch beim nächsten Lauf */ }
            jobFinished(params, false);
        }).start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }
}
