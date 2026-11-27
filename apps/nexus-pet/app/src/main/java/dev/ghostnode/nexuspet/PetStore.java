package dev.ghostnode.nexuspet;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.Properties;

/** Spielstand in den SharedPreferences (nur diese App kann ihn lesen). Ein Lock, weil Wecker und Oberfläche gleichzeitig laufen können. */
final class PetStore {
    static final String PREFS = "nexus_pet";
    static final Object LOCK = new Object();

    private PetStore() {}

    static PetModel load(Context ctx) {
        synchronized (LOCK) {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString("state", "");
            long now = System.currentTimeMillis();
            if (raw == null || raw.isEmpty()) return PetModel.fresh(now);
            Properties p = new Properties();
            try { p.load(new StringReader(raw)); } catch (Exception e) { return PetModel.fresh(now); }
            return PetModel.fromProps(p, now);
        }
    }

    static void save(Context ctx, PetModel m) {
        synchronized (LOCK) {
            StringWriter w = new StringWriter();
            try { m.toProps().store(w, null); } catch (Exception e) { return; }
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("state", w.toString()).apply();
        }
    }

    /** laden, Zeit nachrechnen, speichern */
    static PetModel loadTicked(Context ctx) {
        PetModel m = load(ctx);
        m.tick(System.currentTimeMillis());
        save(ctx, m);
        return m;
    }

    static boolean flag(Context ctx, String k, boolean def) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(k, def); }
    static void setFlag(Context ctx, String k, boolean v) { ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(k, v).apply(); }
}
