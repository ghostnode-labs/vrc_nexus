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
            if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(confirm); }
        } else if (st == PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(c, "✔ Nexus Watch aktualisiert", Toast.LENGTH_LONG).show();
        } else {
            String m = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(c, "Update fehlgeschlagen" + (m != null ? ": " + m : ""), Toast.LENGTH_LONG).show();
        }
    }
}
