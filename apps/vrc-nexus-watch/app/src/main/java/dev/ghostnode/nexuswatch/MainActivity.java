package dev.ghostnode.nexuswatch;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Nexus Watch – Hauptseite (Puls, Status, schnelle Knöpfe), Koppeln, Einstellungen und Updater. */
public class MainActivity extends Activity {
    // Farben kommen aus dem Thema (am PC unter Werkzeuge → Nexus Watch oder hier in den Einstellungen)
    private int CYAN = 0xFF38D5E6, GOLD = 0xFFF3C262, RED = 0xFFFF5555, BG = 0xFF0B1016, MUTED = 0xFF8A93A6;
    private static final int GREEN = 0xFF3DDC84;
    private static final String[] THEMES = { "cyber", "neon", "ocean", "forest", "sunset", "amoled" };
    private static final String[] THEME_NAMES = { "Cyber", "Neon", "Ozean", "Wald", "Sonnenuntergang", "AMOLED" };
    private ScrollView sv;
    private long lastBuzz = 0;
    private static final int[] INTERVALS = { 1, 2, 5, 10 };
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private JSONObject state, upd;
    private String err = "", screen = "main", updMsg = "";
    private int updPct = -1;
    private long panicArmed = 0;
    private boolean resumed;
    private final Runnable poll = new Runnable() { @Override public void run() { if (resumed && Nexus.paired(MainActivity.this) && !"settings".equals(screen)) refresh(); ui.postDelayed(this, 5000); } };

    private SharedPreferences p() { return Nexus.prefs(this); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Nexus.wantWifi(this);
        sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        sv.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        int side = (int) (getResources().getDisplayMetrics().widthPixels * 0.12);
        root.setPadding(side, dp(26), side, dp(40));
        sv.addView(root);
        setContentView(sv);
        applyScreenOn();
        try { String lk = p().getString("look", ""); if (!lk.isEmpty()) applyLook(new JSONObject(lk), false); } catch (Exception ignored) { }
        UpdateJob.schedule(this);
        // Puls automatisch starten (Einstellung)
        if (Nexus.paired(this) && p().getBoolean("auto_heart", false) && !HeartService.running
            && checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) startForegroundService(new Intent(this, HeartService.class));
        // Updates höchstens alle 12 h von selbst prüfen
        if (p().getBoolean("auto_update", true) && System.currentTimeMillis() - p().getLong("upd_checked", 0) > 12 * 3600 * 1000L) checkUpdate(false);
        render();
    }
    @Override protected void onResume() { super.onResume(); resumed = true; ui.removeCallbacks(poll); ui.post(poll); }
    @Override protected void onPause() { super.onPause(); resumed = false; ui.removeCallbacks(poll); }
    @Override protected void onDestroy() { net.shutdownNow(); super.onDestroy(); }
    @Override public void onBackPressed() { if (!"main".equals(screen)) go("main"); else super.onBackPressed(); }

    private void applyScreenOn() {
        if (p().getBoolean("screen_on", false)) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // ---------- Design (Thema & Hintergrund) ----------
    private static int col(JSONObject c, String k, int def) { try { return Color.parseColor(c.getString(k)); } catch (Exception e) { return def; } }
    private void applyLook(JSONObject look, boolean fetch) {
        if (look == null) return;
        JSONObject c = look.optJSONObject("colors");
        if (c != null) { BG = col(c, "bg", BG); CYAN = col(c, "accent", CYAN); GOLD = col(c, "hi", GOLD); RED = col(c, "danger", RED); MUTED = col(c, "muted", MUTED); }
        p().edit().putString("look", look.toString()).apply();
        String bg = look.optString("bg", "none"), rev = look.optString("bg_rev");
        int dim = Math.max(0, Math.min(85, look.optInt("bg_dim", 55)));
        android.graphics.drawable.Drawable base;
        if ("gradient".equals(bg) && c != null) {
            org.json.JSONArray g = c.optJSONArray("grad");
            int a = BG, b = BG; try { a = Color.parseColor(g.getString(0)); b = Color.parseColor(g.getString(1)); } catch (Exception ignored) { }
            GradientDrawable gd = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{ b, a });
            gd.setGradientType(GradientDrawable.RADIAL_GRADIENT); gd.setGradientRadius(getResources().getDisplayMetrics().widthPixels * 0.75f);
            gd.setGradientCenter(0.5f, 0.2f);
            base = gd;
        } else if ("image".equals(bg) && !rev.isEmpty()) {
            java.io.File f = new java.io.File(getFilesDir(), "bg.img");
            if (rev.equals(p().getString("bg_rev", "")) && f.exists()) {
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options(); o.inSampleSize = 1;
                android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeFile(f.getPath(), o);
                base = bm != null ? new android.graphics.drawable.BitmapDrawable(getResources(), bm) : new android.graphics.drawable.ColorDrawable(BG);
            } else {
                base = new android.graphics.drawable.ColorDrawable(BG);
                if (fetch) net.execute(() -> {   // neues Bild vom PC holen
                    try {
                        byte[] b = Nexus.bytes(this, "/watch/bg");
                        try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(b); }
                        p().edit().putString("bg_rev", rev).apply();
                        ui.post(() -> applyLook(look, false));
                    } catch (Exception ignored) { }
                });
            }
        } else base = new android.graphics.drawable.ColorDrawable(BG);
        if (!"none".equals(bg) && dim > 0) {
            android.graphics.drawable.ColorDrawable shade = new android.graphics.drawable.ColorDrawable(Color.argb(Math.round(dim * 2.55f), 0, 0, 0));
            sv.setBackground(new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{ base, shade }));
        } else sv.setBackground(base);
    }
    private String themeKey() { try { return new JSONObject(p().getString("look", "{}")).optString("theme", "cyber"); } catch (Exception e) { return "cyber"; } }

    // ---------- kleine Bausteine ----------
    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(2), 0, dp(2));
        root.addView(t);
        return t;
    }
    private Button button(String s, int color, View.OnClickListener l) {
        Button btn = new Button(this);
        btn.setText(s); btn.setAllCaps(false); btn.setTextSize(14); btn.setTextColor(color == GOLD ? BG : Color.WHITE);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(22)); g.setColor(color == GOLD ? GOLD : 0xD016202B); g.setStroke(dp(1), color);
        btn.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(6);
        btn.setMinHeight(dp(44));
        btn.setLayoutParams(lp);
        btn.setOnClickListener(v -> { buzz(20); l.onClick(v); });
        root.addView(btn);
        return btn;
    }
    private void toggle(String label, String key, boolean def, Runnable after) {
        boolean on = p().getBoolean(key, def);
        button((on ? "✅ " : "⬜ ") + label, on ? CYAN : MUTED, v -> { p().edit().putBoolean(key, !on).apply(); if (after != null) after.run(); render(); });
    }
    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        lp.topMargin = dp(6);
        r.setLayoutParams(lp);
        root.addView(r);
        return r;
    }
    private void chip(LinearLayout r, String s, int color, View.OnClickListener l) {
        Button btn = new Button(this);
        btn.setText(s); btn.setTextSize(16); btn.setPadding(0, 0, 0, 0);
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(22)); g.setColor(0xFF16202B); g.setStroke(dp(2), color);
        btn.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1);
        lp.leftMargin = dp(2); lp.rightMargin = dp(2);
        btn.setLayoutParams(lp);
        btn.setOnClickListener(v -> { buzz(20); l.onClick(v); });
        r.addView(btn);
    }
    /** runde Menü-Kachel (2 pro Reihe) */
    private void tile(LinearLayout r, String icon, String label, String sub, int color, View.OnClickListener l) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL); t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(0xD016202B); g.setStroke(dp(2), color);
        t.setBackground(g);
        int size = dp(74);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size); lp.leftMargin = dp(5); lp.rightMargin = dp(5);
        t.setLayoutParams(lp);
        TextView i = new TextView(this); i.setText(icon); i.setTextSize(22); i.setGravity(Gravity.CENTER); t.addView(i);
        TextView n = new TextView(this); n.setText(label); n.setTextSize(10); n.setTextColor(Color.WHITE); n.setGravity(Gravity.CENTER); t.addView(n);
        if (sub != null && !sub.isEmpty()) { TextView x = new TextView(this); x.setText(sub); x.setTextSize(8); x.setTextColor(color); x.setGravity(Gravity.CENTER); t.addView(x); }
        t.setClickable(true);
        t.setOnClickListener(v -> { buzz(20); l.onClick(v); });
        r.addView(t);
    }
    private LinearLayout tileRow() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL); r.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        r.setLayoutParams(lp);
        root.addView(r);
        return r;
    }
    private void go(String sc) { screen = sc; render(); if ("main".equals(sc)) refresh(); }
    private void buzz(long ms) {
        if (!p().getBoolean("vibrate", true)) return;
        try { getSystemService(Vibrator.class).vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)); } catch (Exception ignored) { }
    }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    // ---------- Anzeige ----------
    private void render() {
        root.removeAllViews();
        if ("settings".equals(screen)) { renderSettings(); return; }
        if (!Nexus.paired(this) || p().getBoolean("lost", false)) { renderPair(); return; }
        switch (screen) {
            case "heart": renderHeart(); return;
            case "safe": renderSafe(); return;
            case "comfort": renderComfort(); return;
            default: renderHome();
        }
    }
    private int curBpm() { JSONObject s = state; return HeartService.running && HeartService.bpm > 0 ? HeartService.bpm : (s != null ? s.optInt("bpm") : 0); }
    private void status() {
        JSONObject s = state;
        if (s == null) return;
        String w = s.optBoolean("private") ? "🕶 Privat-Modus" : s.optBoolean("running") ? (s.optString("world").isEmpty() ? "VRChat läuft" : s.optString("world")) + " · " + s.optInt("players") + " 👥" : "VRChat läuft nicht";
        text(w, 11, Color.WHITE, false);
    }

    /** Hauptmenü: Kopf mit Puls & Status, darunter runde Kacheln */
    private void renderHome() {
        if (upd != null) button(updPct >= 0 ? "⬇ Update " + updPct + " %" : "⬆ Update " + upd.optString("version"), GOLD, v -> startUpdate());
        text("◈ NEXUS", 11, CYAN, true);
        int bpm = curBpm();
        text(bpm > 0 ? "♥ " + bpm : "♥ –", 30, bpm > 0 ? RED : MUTED, true);
        status();
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        JSONObject s = state;
        boolean nsfw = s != null && s.optBoolean("nsfw");
        LinearLayout r1 = tileRow();
        tile(r1, "♥", "Puls", HeartService.running ? "sendet" : "aus", HeartService.running ? RED : MUTED, v -> go("heart"));
        if (nsfw) tile(r1, "🔞", "Notfall", s.optBoolean("private") ? "privat" : "", RED, v -> go("safe"));
        else tile(r1, "💤", "Komfort", s != null && s.optBoolean("sleeping") ? "schläft" : "", CYAN, v -> go("comfort"));
        LinearLayout r2 = tileRow();
        if (nsfw) tile(r2, "💤", "Komfort", s.optBoolean("sleeping") ? "schläft" : "", CYAN, v -> go("comfort"));
        tile(r2, "⚙", "Einstellungen", "", MUTED, v -> go("settings"));
        if (s != null && !nsfw && !s.optString("nsfw_reason").isEmpty()) text("🔞 gesperrt: " + s.optString("nsfw_reason"), 9, MUTED, false);
        text("⌚ ↔ " + p().getString("pc", "PC"), 9, MUTED, false);
    }

    private void renderHeart() {
        text("♥ Puls", 14, RED, true);
        int bpm = curBpm();
        text(bpm > 0 ? String.valueOf(bpm) : "–", 40, bpm > 0 ? RED : MUTED, true);
        text("bpm", 10, MUTED, false);
        if (HeartService.running) {
            long ago = HeartService.sentAt > 0 ? (System.currentTimeMillis() - HeartService.sentAt) / 1000 : -1;
            text("alle " + p().getInt("interval", 2) + " s · " + (ago < 0 ? "noch nicht gesendet" : "gesendet vor " + ago + " s"), 10, MUTED, false);
            if (!HeartService.error.isEmpty()) text("⚠ " + HeartService.error, 10, GOLD, false);
        }
        if (state != null && !"watch".equals(state.optString("hr_src")) && HeartService.running) text("Am PC ist „" + state.optString("hr_src") + "“ als Quelle gewählt – die Uhr übernimmt, sobald die nichts liefert.", 9, MUTED, false);
        button(HeartService.running ? "⏹ Senden stoppen" : "♥ Puls senden", HeartService.running ? CYAN : GOLD, v -> toggleHeart());
        int cur = p().getInt("interval", 2);
        button("⏱ alle " + cur + " s", MUTED, v -> {
            int i = 0; while (i < INTERVALS.length && INTERVALS[i] != cur) i++;
            p().edit().putInt("interval", INTERVALS[(i + 1) % INTERVALS.length]).apply(); render();
        });
        button("← Menü", MUTED, v -> go("main"));
    }

    private void renderSafe() {
        JSONObject s = state;
        text("🔞 Notfall", 14, RED, true);
        if (s == null || !s.optBoolean("nsfw")) { text("Nicht freigeschaltet.", 11, MUTED, false); button("← Menü", MUTED, v -> go("main")); return; }
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        boolean armed = System.currentTimeMillis() - panicArmed < 3000;
        button(armed ? "🚨 NOCHMAL = PANIK" : "🚨 PANIK", RED, v -> panic());
        if (s.optBoolean("private")) button("✅ Entwarnung", GREEN, v -> act("allclear", null, null));
        else button("🕶 Privat-Modus", CYAN, v -> act("private", "on", true));
        JSONObject t = s.optJSONObject("toys");
        if (t != null) {
            text("Ampel" + (t.optString("consent").isEmpty() ? "" : " · jetzt " + ("red".equals(t.optString("consent")) ? "🔴" : "yellow".equals(t.optString("consent")) ? "🟡" : "🟢")), 10, MUTED, false);
            LinearLayout r = row();
            chip(r, "🟢", GREEN, v -> act("consent", "light", "green"));
            chip(r, "🟡", GOLD, v -> act("consent", "light", "yellow"));
            chip(r, "🔴", RED, v -> act("consent", "light", "red"));
            button("⏹ Spielzeug stoppen", CYAN, v -> act("toys_stop", null, null));
        }
        button("← Menü", MUTED, v -> go("main"));
    }

    private void renderComfort() {
        JSONObject s = state;
        text("💤 Komfort", 14, CYAN, true);
        status();
        boolean sleeping = s != null && s.optBoolean("sleeping");
        button(sleeping ? "☀️ Aufwachen" : "💤 Schlafmodus", CYAN, v -> act("sleep", "on", !sleeping));
        if (!sleeping) button("💤 Schlafen + Wecker 8 h", MUTED, v -> act("sleep_alarm", null, null));
        button("← Menü", MUTED, v -> go("main"));
    }

    private void renderSettings() {
        text("⚙ Einstellungen", 16, GOLD, true);
        int cur = p().getInt("interval", 2);
        button("⏱ Puls alle " + cur + " s", CYAN, v -> {
            int i = 0; while (i < INTERVALS.length && INTERVALS[i] != cur) i++;
            p().edit().putInt("interval", INTERVALS[(i + 1) % INTERVALS.length]).apply(); render();
        });
        String tk = themeKey(); int ti = 0; while (ti < THEMES.length && !THEMES[ti].equals(tk)) ti++;
        final int next = (ti + 1) % THEMES.length;
        button("🎨 Thema: " + THEME_NAMES[ti % THEMES.length], CYAN, v -> act("theme", "theme", THEMES[next]));
        toggle("Puls beim Start senden", "auto_heart", false, null);
        toggle("Bildschirm anlassen", "screen_on", false, this::applyScreenOn);
        toggle("Vibration", "vibrate", true, null);
        toggle("Panik doppelt tippen", "panic_confirm", true, null);
        toggle("Updates automatisch suchen", "auto_update", true, null);
        toggle("Updates im Hintergrund installieren", "auto_install", true, () -> UpdateJob.schedule(this));

        text("PC-Adresse", 11, MUTED, false);
        EditText host = new EditText(this);
        host.setText(Nexus.host(this).isEmpty() ? "" : Nexus.host(this) + ":" + Nexus.port(this));
        host.setHint("192.168.x.x:17874"); host.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        host.setGravity(Gravity.CENTER); host.setTextColor(Color.WHITE); host.setHintTextColor(MUTED); host.setTextSize(12);
        root.addView(host);
        button("💾 Adresse speichern", MUTED, v -> {
            String[] x = host.getText().toString().trim().replaceFirst("^https?://", "").split(":");
            if (x[0].isEmpty()) { toast("Adresse fehlt."); return; }
            int port = Nexus.DEF_PORT;
            try { if (x.length > 1) port = Integer.parseInt(x[1].replaceAll("\\D", "")); } catch (Exception ignored) { }
            p().edit().putString("host", x[0]).putInt("port", port).apply(); toast("Gespeichert.");
        });

        text("Version " + Updater.installedName(this), 11, MUTED, false);
        if (!updMsg.isEmpty()) text(updMsg, 11, upd != null ? GOLD : MUTED, false);
        if (upd != null) button(updPct >= 0 ? "⬇ " + updPct + " %" : "⬆ Update auf " + upd.optString("version"), GOLD, v -> startUpdate());
        else button("🔄 Nach Updates suchen", CYAN, v -> checkUpdate(true));

        if (Nexus.paired(this)) button("Entkoppeln", RED, v -> {
            stopService(new Intent(this, HeartService.class)); Nexus.unpair(this); state = null; screen = "main"; render();
        });
        button("← Menü", MUTED, v -> go("main"));
    }

    private EditText hostIn, pinIn;
    private void renderPair() {
        text("Nexus Watch", 18, GOLD, true);
        text("Mit VRC Nexus koppeln:\nam PC unter 💓 Puls → „VRC Nexus Watch“ einschalten und den Code eingeben.", 11, MUTED, false);
        if (p().getBoolean("lost", false)) text("Die Kopplung wurde am PC entfernt.", 11, GOLD, false);
        pinIn = new EditText(this);
        pinIn.setHint("Code (6 Ziffern)"); pinIn.setInputType(InputType.TYPE_CLASS_NUMBER); pinIn.setGravity(Gravity.CENTER);
        pinIn.setTextColor(Color.WHITE); pinIn.setHintTextColor(MUTED); pinIn.setTextSize(18);
        root.addView(pinIn);
        hostIn = new EditText(this);
        hostIn.setHint("PC-Adresse (leer = suchen)"); hostIn.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        hostIn.setGravity(Gravity.CENTER); hostIn.setTextColor(Color.WHITE); hostIn.setHintTextColor(MUTED); hostIn.setTextSize(12);
        root.addView(hostIn);
        if (!err.isEmpty()) text("⚠ " + err, 11, GOLD, false);
        button("🔗 Koppeln", GOLD, v -> pair());
        button("⚙ Einstellungen", MUTED, v -> { screen = "settings"; render(); });
    }

    // ---------- Aktionen ----------
    private void pair() {
        String pin = pinIn.getText().toString().replaceAll("\\D", ""), manual = hostIn.getText().toString().trim();
        if (pin.length() != 6) { toast("Bitte den 6-stelligen Code eingeben."); return; }
        err = ""; toast("Suche VRC Nexus …");
        net.execute(() -> {
            try {
                String host; int port = Nexus.DEF_PORT;
                if (!manual.isEmpty()) {
                    String[] x = manual.replaceFirst("^https?://", "").split(":");
                    host = x[0]; if (x.length > 1) port = Integer.parseInt(x[1].replaceAll("\\D", ""));
                } else {
                    JSONObject d = Nexus.discover();
                    if (d == null) throw new Exception("PC nicht gefunden – gleiches WLAN? Sonst die Adresse eintragen (steht am PC).");
                    host = d.getString("host"); port = d.optInt("port", Nexus.DEF_PORT);
                }
                Nexus.pair(this, host, port, pin);
                ui.post(() -> { buzz(60); toast("✔ Gekoppelt"); render(); refresh(); });
            } catch (Exception e) { err = String.valueOf(e.getMessage()); ui.post(this::render); }
        });
    }
    private void refresh() {
        net.execute(() -> {
            try { state = Nexus.call(this, "/watch/state", null); err = ""; }
            catch (Exception e) { err = String.valueOf(e.getMessage()); }
            ui.post(() -> {
                if (state != null) {
                    JSONObject lk = state.optJSONObject("look");
                    if (lk != null && !lk.toString().equals(p().getString("look", ""))) applyLook(lk, true);
                    else if (lk != null && "image".equals(lk.optString("bg")) && !lk.optString("bg_rev").equals(p().getString("bg_rev", ""))) applyLook(lk, true);
                    long bz = state.optLong("buzz", 0);
                    if (bz > 0 && bz != lastBuzz) {   // 🔔 „Uhr finden“ vom PC
                        lastBuzz = bz;
                        try { getSystemService(Vibrator.class).vibrate(VibrationEffect.createWaveform(new long[]{ 0, 400, 200, 400, 200, 800 }, -1)); } catch (Exception ignored) { }
                        toast("🔔 Hier bin ich!");
                    }
                }
                if (!"settings".equals(screen)) render();
            });
        });
    }
    private void panic() {
        if (p().getBoolean("panic_confirm", true) && System.currentTimeMillis() - panicArmed > 3000) {
            panicArmed = System.currentTimeMillis(); buzz(60); render();
            ui.postDelayed(this::render, 3100);
            return;
        }
        panicArmed = 0; buzz(250);
        act("panic", null, null);
    }
    private void act(String a, String key, Object val) {
        net.execute(() -> {
            try {
                JSONObject b = new JSONObject();
                if ("sleep_alarm".equals(a)) { b.put("a", "sleep"); b.put("on", true); b.put("wake", 480); }
                else { b.put("a", a); if (key != null) b.put(key, val); }
                JSONObject r = Nexus.call(this, "/watch/action", b);
                if (r.has("state")) state = r.getJSONObject("state");
                JSONObject lk = state != null ? state.optJSONObject("look") : null;
                if (lk != null) ui.post(() -> applyLook(lk, true));
                String m = r.optString("msg"); err = "";
                ui.post(() -> { if (!m.isEmpty()) toast(m); render(); });
            } catch (Exception e) { err = String.valueOf(e.getMessage()); ui.post(() -> { buzz(200); render(); }); }
        });
    }
    private void toggleHeart() {
        if (HeartService.running) { stopService(new Intent(this, HeartService.class)); ui.postDelayed(this::render, 300); return; }
        if (checkSelfPermission(Manifest.permission.BODY_SENSORS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.BODY_SENSORS, Manifest.permission.POST_NOTIFICATIONS }, 7);
            return;
        }
        startForegroundService(new Intent(this, HeartService.class));
        ui.postDelayed(this::render, 800);
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] r) {
        super.onRequestPermissionsResult(code, perms, r);
        if (code == 7 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) toggleHeart();
        else if (code == 7) toast("Ohne Sensor-Erlaubnis kein Puls.");
    }

    // ---------- Updater ----------
    private void checkUpdate(boolean manual) {
        if (manual) { updMsg = "Suche Updates …"; render(); }
        net.execute(() -> {
            try {
                JSONObject l = Updater.latest();
                p().edit().putLong("upd_checked", System.currentTimeMillis()).apply();
                if (l != null && l.getInt("code") > Updater.installedCode(this)) { upd = l; updMsg = "Neue Version " + l.getString("version") + " verfügbar."; }
                else { upd = null; updMsg = "✔ Aktuell (" + Updater.installedName(this) + ")"; }
            } catch (Exception e) { updMsg = "Update-Suche: " + e.getMessage(); }
            ui.post(this::render);
        });
    }
    private void startUpdate() {
        if (upd == null || updPct >= 0) return;
        if (!getPackageManager().canRequestPackageInstalls()) {
            toast("Bitte „Unbekannte Apps installieren“ für Nexus Watch erlauben.");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        updPct = 0; render();
        JSONObject u = upd;
        net.execute(() -> {
            try {
                Updater.install(this, u, pct -> { updPct = pct; ui.post(this::render); });
                updMsg = "Installation wird bestätigt …";
            } catch (Exception e) { updMsg = "Update fehlgeschlagen: " + e.getMessage(); }
            updPct = -1;
            ui.post(this::render);
        });
    }
}
