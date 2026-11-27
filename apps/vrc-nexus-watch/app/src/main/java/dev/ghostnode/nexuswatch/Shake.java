package dev.ghostnode.nexuswatch;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

/**
 * 8.2: Gesten an der Uhr – kräftig schütteln (3 Ausschläge in 1,2 s) löst die am PC gewählte Aktion aus
 * (Spielzeug stoppen oder Safeword). Nur solange die App im Vordergrund ist; braucht keine Berechtigung.
 */
final class Shake implements SensorEventListener {
    interface Hit { void run(); }
    private static final float LIMIT = 24f;      // m/s² (Erdbeschleunigung ≈ 9,8)
    private static final long WINDOW = 1200, COOLDOWN = 4000;
    private final SensorManager sm;
    private final Hit hit;
    private final long[] peaks = new long[3];
    private int n = 0;
    private long last = 0, lastPeak = 0;
    private boolean on = false;

    Shake(Context c, Hit hit) { this.sm = (SensorManager) c.getSystemService(Context.SENSOR_SERVICE); this.hit = hit; }

    void enable(boolean want) {
        if (want == on || sm == null) return;
        Sensor acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (acc == null) return;
        if (want) sm.registerListener(this, acc, SensorManager.SENSOR_DELAY_UI); else sm.unregisterListener(this);
        on = want; n = 0;
    }

    @Override public void onSensorChanged(SensorEvent e) {
        float x = e.values[0], y = e.values[1], z = e.values[2];
        double g = Math.sqrt(x * x + y * y + z * z);
        long t = System.currentTimeMillis();
        if (g < LIMIT || t - lastPeak < 150) return;   // ein Ausschlag zählt nur einmal
        lastPeak = t;
        peaks[n % 3] = t; n++;
        if (n >= 3 && t - peaks[(n - 3) % 3] <= WINDOW && t - last > COOLDOWN) { last = t; n = 0; hit.run(); }
    }
    @Override public void onAccuracyChanged(Sensor s, int a) { }
}
