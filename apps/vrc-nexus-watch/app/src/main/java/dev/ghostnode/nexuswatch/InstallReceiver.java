package dev.ghostnode.nexuswatch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/** Rückmeldung des Paket-Installers: Bestätigung auf der Uhr anzeigen bzw. Ergebnis melden. */
public class InstallReceiver extends BroadcastReceiver {
    @SuppressWarnings("deprecation")   // getParcelableExtra(String, Class) erst ab Android 13 – Wear OS 3 braucht die alte Form
    @Override public void onReceive(Context c, Intent i) {
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = (Intent) i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) return;
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { c.startActivity(confirm); } catch (Exception ignored) { /* aus dem Hintergrund nicht erlaubt → Benachrichtigung */ }
            // zusätzlich als Benachrichtigung (Hintergrund-Updates dürfen keine Fenster öffnen)
            android.app.NotificationManager nm = c.getSystemService(android.app.NotificationManager.class);
            nm.createNotificationChannel(new android.app.NotificationChannel("update", "Updates", android.app.NotificationManager.IMPORTANCE_DEFAULT));
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(c, 2, confirm, android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT);
            nm.notify(2, new android.app.Notification.Builder(c, "update").setSmallIcon(R.drawable.ic_launcher).setContentTitle("Nexus Watch-Update bereit")
                .setContentText("Tippen zum Installieren").setContentIntent(pi).setAutoCancel(true).build());
        } else if (st == PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(c, "✔ Nexus Watch aktualisiert", Toast.LENGTH_LONG).show();
        } else {
            String m = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(c, "Update fehlgeschlagen" + (m != null ? ": " + m : ""), Toast.LENGTH_LONG).show();
        }
    }
}
