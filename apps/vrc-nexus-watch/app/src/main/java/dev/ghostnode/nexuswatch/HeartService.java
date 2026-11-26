package dev.ghostnode.nexuswatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Misst den Puls mit dem Uhr-Sensor und schickt ihn an VRC Nexus (bei Änderung, sonst alle 5 s als Lebenszeichen). */
public class HeartService extends Service implements SensorEventListener {
    static volatile int bpm = 0;
    static volatile String error = "";
    static volatile boolean running = false;
    private SensorManager sm;
    private PowerManager.WakeLock lock;
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private int lastSent = 0;
    private long lastAt = 0;
    private volatile boolean busy = false;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("heart", "Puls an VRC Nexus", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "heart").setContentTitle("Nexus Watch").setContentText("Puls wird an VRC Nexus gesendet")
            .setSmallIcon(R.drawable.ic_launcher).setOngoing(true).setContentIntent(open).build();
        startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH);
        PowerManager pm = getSystemService(PowerManager.class);
        lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nexuswatch:heart");
        lock.acquire(6 * 60 * 60 * 1000L);   // höchstens 6 h am Stück
        sm = getSystemService(SensorManager.class);
        Sensor hr = sm.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        if (hr == null) { error = "Diese Uhr hat keinen Pulssensor."; stopSelf(); return; }
        sm.registerListener(this, hr, SensorManager.SENSOR_DELAY_NORMAL);
        running = true; error = "";
    }

    @Override public void onSensorChanged(SensorEvent e) {
        int v = Math.round(e.values[0]);
        if (v < 25 || v > 250) return;   // 0 = Sensor sucht noch
        bpm = v;
        long t = System.currentTimeMillis();
        if (busy || (v == lastSent && t - lastAt < 5000) || t - lastAt < 1000) return;
        busy = true; lastSent = v; lastAt = t;
        net.execute(() -> {
            try { JSONObject b = new JSONObject(); b.put("bpm", v); Nexus.call(this, "/watch/heart", b); error = ""; }
            catch (Exception ex) { error = ex.getMessage(); }
            finally { busy = false; }
        });
    }
    @Override public void onAccuracyChanged(Sensor s, int a) { }

    @Override public void onDestroy() {
        running = false; bpm = 0;
        if (sm != null) sm.unregisterListener(this);
        if (lock != null && lock.isHeld()) lock.release();
        net.shutdownNow();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
