package dev.ghostnode.nexuswatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 6.5: Benachrichtigungen vom PC (z. B. „Freund ist online“) als Uhr-Benachrichtigung mit Antwort-Knöpfen
 * (🚪 Hin = Einladung an mich, 🙋 Einladen lassen, 👍). Neue Meldungen erkennt die Uhr an der fortlaufenden Nummer.
 */
final class Notes {
    static final String CH = "notes";
    private Notes() { }

    /** aus einer Antwort des PCs (state oder heart) die neuen Meldungen anzeigen */
    static void handle(Context c, JSONObject r) {
        if (r == null || !Nexus.prefs(c).getBoolean("notes", true)) return;
        JSONArray a = r.optJSONArray("notes");
        if (a == null || a.length() == 0) return;
        long last = Nexus.prefs(c).getLong("note_last", 0), max = last;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH, "Meldungen von VRC Nexus", NotificationManager.IMPORTANCE_HIGH));
        for (int i = 0; i < a.length(); i++) {
            JSONObject n = a.optJSONObject(i);
            if (n == null) continue;
            long id = n.optLong("id");
            if (id <= last) continue;
            max = Math.max(max, id);
            Notification.Builder b = new Notification.Builder(c, CH).setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(n.optString("title")).setContentText(n.optString("body")).setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE));
            JSONArray rep = n.optJSONArray("replies");
            if (rep != null) for (int k = 0; k < rep.length() && k < 3; k++) {
                JSONArray x = rep.optJSONArray(k);
                if (x == null) continue;
                Intent it = new Intent(c, NoteReceiver.class).putExtra("id", id).putExtra("reply", x.optString(0));
                PendingIntent pi = PendingIntent.getBroadcast(c, (int) (id * 10 + k), it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_launcher), x.optString(1), pi).build());
            }
            nm.notify((int) (1000 + id % 100000), b.build());
        }
        if (max > last) Nexus.prefs(c).edit().putLong("note_last", max).apply();
    }
}
