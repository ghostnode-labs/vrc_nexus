package dev.ghostnode.nexuswatch;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import org.json.JSONObject;

/**
 * Auto-Updater im Hintergrund: etwa alle 12 h, nur beim Laden und im WLAN.
 * Neue Version → herunterladen und installieren (ab Wear OS 4 ohne Rückfrage, sonst per Benachrichtigung bestätigen).
 */
public class UpdateJob extends JobService {
    static final int ID = 4711;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (!Nexus.prefs(c).getBoolean("auto_install", true)) { js.cancel(ID); return; }
        if (js.getPendingJob(ID) != null) return;
        js.schedule(new JobInfo.Builder(ID, new ComponentName(c, UpdateJob.class))
            .setPeriodic(12 * 60 * 60 * 1000L)
            .setRequiresCharging(true)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
            .setPersisted(true)
            .build());
    }

    @Override public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                JSONObject l = Updater.latest();
                Nexus.prefs(this).edit().putLong("upd_checked", System.currentTimeMillis()).apply();
                if (l != null && l.getInt("code") > Updater.installedCode(this) && Nexus.prefs(this).getBoolean("auto_install", true)) Updater.install(this, l, pct -> { });
            } catch (Exception ignored) { /* nächster Versuch beim nächsten Lauf */ }
            jobFinished(params, false);
        }).start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }
}
