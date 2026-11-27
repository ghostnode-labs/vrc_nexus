package dev.ghostnode.nexuswatch;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** 6.5: Antwort-Knopf einer Benachrichtigung → an den PC schicken (im Hintergrund) und die Meldung schließen */
public class NoteReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        final long id = i.getLongExtra("id", 0);
        final String reply = i.getStringExtra("reply");
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                JSONObject b = new JSONObject();
                b.put("a", "note_reply"); b.put("id", id); b.put("reply", reply == null ? "ok" : reply);
                Nexus.call(c, "/watch/action", b);
            } catch (Exception ignored) { /* PC nicht erreichbar – Meldung trotzdem schließen */ }
            finally {
                try { c.getSystemService(NotificationManager.class).cancel((int) (1000 + id % 100000)); } catch (Exception ignored) { }
                pr.finish();
            }
        }).start();
    }
}
