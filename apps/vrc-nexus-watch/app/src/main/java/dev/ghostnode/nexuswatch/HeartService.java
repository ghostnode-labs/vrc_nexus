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
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONObject;

/**
 * Misst den Puls mit dem Uhr-Sensor und schickt ihn im eingestellten Intervall an VRC Nexus
 * (Einstellung „interval“ in Sekunden: 1, 2, 5, 10). Werte älter als 15 s werden nicht gesendet (Sensor sucht noch).
 */
public class HeartService extends Service implements SensorEventListener {
    static volatile int bpm = 0;
    static volatile long bpmAt = 0, sentAt = 0;
    static volatile String error = "";
    static volatile boolean running = false;
    private SensorManager sm;
    private PowerManager.WakeLock lock;
    private HandlerThread thread;
    private Handler bg;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            send();
            bg.postDelayed(this, Math.max(1, Nexus.prefs(HeartService.this).getInt("interval", 2)) * 1000L);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("heart", "Puls an VRC Nexus", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "heart").setContentTitle("Nexus Watch").setContentText("Puls wird an VRC Nexus gesendet")
            .setSmallIcon(R.drawable.ic_launcher).setOngoing(true).setContentIntent(open).build();
        // Dienst-Typ „health“ gibt es erst ab Android 14 (Wear OS 5) – ältere Uhren starten ohne Typ
        if (android.os.Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH);
        else startForeground(1, n);
        PowerManager pm = getSystemService(PowerManager.class);
        lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nexuswatch:heart");
        lock.acquire(6 * 60 * 60 * 1000L);   // höchstens 6 h am Stück
        sm = getSystemService(SensorManager.class);
        Sensor hr = sm.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        if (hr == null) { error = "Diese Uhr hat keinen Pulssensor."; stopSelf(); return; }
        sm.registerListener(this, hr, SensorManager.SENSOR_DELAY_NORMAL);
        thread = new HandlerThread("nexus-heart");
        thread.start();
        bg = new Handler(thread.getLooper());
        bg.postDelayed(tick, 1000);
        running = true; error = "";
    }

    @Override public void onSensorChanged(SensorEvent e) {
        int v = Math.round(e.values[0]);
        if (v < 25 || v > 250) return;   // 0 = Sensor sucht noch
        bpm = v; bpmAt = System.currentTimeMillis();
    }
    @Override public void onAccuracyChanged(Sensor s, int a) { }

    /** im Hintergrund-Thread: aktuellen Wert senden (nur frische Werte) */
    private void send() {
        if (bpm <= 0 || System.currentTimeMillis() - bpmAt > 15000) { error = bpm <= 0 ? "Sensor misst noch …" : "Kein frischer Messwert – Uhr enger tragen."; return; }
        try {
            JSONObject b = new JSONObject(); b.put("bpm", bpm);
            if (Steps.today >= 0) b.put("steps", Steps.today);   // 8.0.5
            JSONObject r = Nexus.call(this, "/watch/heart", b);
            error = r.optBoolean("ignored") ? r.optString("msg") : "";
            Notes.handle(this, r);   // 6.5: Meldungen vom PC auch im Hintergrund
            sentAt = System.currentTimeMillis();
        } catch (Exception ex) { error = String.valueOf(ex.getMessage()); }
    }

    @Override public void onDestroy() {
        running = false; bpm = 0;
        if (sm != null) sm.unregisterListener(this);
        if (bg != null) bg.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (lock != null && lock.isHeld()) lock.release();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
