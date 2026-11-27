package dev.ghostnode.nexuswatch;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

/**
 * 8.0.5: Schritte des Tages aus dem Schrittzähler der Uhr (TYPE_STEP_COUNTER zählt seit dem Neustart).
 * Tageswert = gemerkter Stand vor einem Neustart + (aktueller Zähler − Zähler zu Tagesbeginn). Nur wenn eingeschaltet und erlaubt.
 */
final class Steps {
    static volatile int today = -1;
    private Steps() { }

    static boolean allowed(Context c) {
        if (!Nexus.prefs(c).getBoolean("steps", false)) return false;
        return android.os.Build.VERSION.SDK_INT < 29 || c.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }
    private static String day() { return new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).format(new java.util.Date()); }

    /** Zählerstand verrechnen → Tageswert */
    static synchronized int update(Context c, long v) {
        SharedPreferences p = Nexus.prefs(c);
        String d = day();
        long base = p.getLong("st_base", -1), last = p.getLong("st_last", -1), acc = p.getLong("st_acc", 0);
        if (!d.equals(p.getString("st_day", ""))) { acc = 0; base = last >= 0 && v >= last ? last : v; }   // neuer Tag
        else if (last >= 0 && v < last) { acc += Math.max(0, last - Math.max(0, base)); base = 0; }          // Uhr neu gestartet
        if (base < 0) base = v;
        int n = (int) Math.max(0, Math.min(200000, acc + v - base));
        p.edit().putString("st_day", d).putLong("st_base", base).putLong("st_last", v).putLong("st_acc", acc).apply();
        today = n;
        return n;
    }

    /** einmal lesen (Sensor meldet beim Anmelden sofort den Stand), dann wieder abmelden */
    static void read(Context c, Runnable done) {
        if (!allowed(c)) { today = -1; if (done != null) done.run(); return; }
        SensorManager sm = c.getSystemService(SensorManager.class);
        Sensor s = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (s == null) { today = -1; if (done != null) done.run(); return; }
        final Context app = c.getApplicationContext();
        sm.registerListener(new SensorEventListener() {
            boolean got = false;
            @Override public void onSensorChanged(SensorEvent e) {
                if (got) return;
                got = true;
                sm.unregisterListener(this);
                update(app, (long) e.values[0]);
                if (done != null) done.run();
            }
            @Override public void onAccuracyChanged(Sensor x, int a) { }
        }, s, SensorManager.SENSOR_DELAY_NORMAL);
    }
}
