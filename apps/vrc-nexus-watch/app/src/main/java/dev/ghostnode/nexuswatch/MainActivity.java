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
import android.view.InputDevice;
import android.view.MotionEvent;
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
    // 8.0.5: Zifferblätter (Uhr-App 2.0) – Auswahl hier oder am PC unter Werkzeuge → Nexus Watch
    private static final String[] FACES = { "classic", "big", "analog", "minimal", "stats", "friends" };
    private static final String[] FACE_NAMES = { "Klassisch", "Große Uhrzeit", "Analog", "Minimal", "Gesundheit", "Freunde" };
    private boolean menuOpen = false;
    private int lastSteps = -1;
    private long stepsAt = 0;
    private ScrollView sv;
    private long lastBuzz = 0;
    private static final int[] INTERVALS = { 1, 2, 5, 10 };
    private static final int[] HR_ALARMS = { 0, 120, 140, 160, 180 };   // 8.2
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private JSONObject state, upd;
    private Shake shake;   // 8.2: Schüttel-Geste
    private String err = "", screen = "main", updMsg = "";
    private long panicArmed = 0;
    private boolean resumed;
    // 8.2: Spielzeug-Fernbedienung (Drehkrone/Wischen), Schnelltexte, Makros
    private LevelDial dial;
    private int localLevel = -1;
    private long localLevelAt = 0;
    private JSONObject shortcuts;
    private boolean shortcutsBusy;
    private final Runnable levelSend = this::sendLevel;
    private static final java.util.Set<String> SCREENS = new java.util.HashSet<>(java.util.Arrays.asList("main", "heart", "safe", "comfort", "toys", "chat", "shortcuts"));
    private final Runnable poll = new Runnable() { @Override public void run() { if (resumed && Nexus.paired(MainActivity.this) && !"settings".equals(screen)) refresh(); ui.postDelayed(this, 5000); } };

    private SharedPreferences p() { return Nexus.prefs(this); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Nexus.wantWifi(this);
        if (android.os.Build.VERSION.SDK_INT >= 33 && Nexus.paired(this) && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 8);   // 6.5: Meldungen vom PC
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
        applyDiscreet();
        try { String lk = p().getString("look", ""); if (!lk.isEmpty()) applyLook(new JSONObject(lk), false); } catch (Exception ignored) { }
        UpdateJob.schedule(this);
        // Puls automatisch starten (Einstellung)
        if (Nexus.paired(this) && p().getBoolean("auto_heart", false) && !HeartService.running
            && checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) startForegroundService(new Intent(this, HeartService.class));
        // Updates höchstens alle 12 h von selbst prüfen
        if (p().getBoolean("auto_update", true) && System.currentTimeMillis() - p().getLong("upd_checked", 0) > 12 * 3600 * 1000L) checkUpdate(false);
        openFrom(getIntent());
        render();
    }
    /** 8.2: Kacheln/Komplikationen öffnen die App direkt auf einer Seite */
    private void openFrom(Intent i) {
        String sc = i != null ? i.getStringExtra("screen") : null;
        if (sc != null && SCREENS.contains(sc)) screen = sc;
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); openFrom(i); if (root != null) { render(); refresh(); } }
    /** 8.2: diskreter Modus – 🔞-Seiten nicht im Hintergrund/Always-On stehen lassen, kein Vorschaubild in „Zuletzt verwendet“ */
    @Override protected void onStop() {
        super.onStop();
        if (Live.discreet(this) && ("safe".equals(screen) || "toys".equals(screen))) { screen = "main"; render(); }
    }
    private void applyDiscreet() { if (android.os.Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(!Live.discreet(this)); }
    /** 8.2: Drehkrone – auf der Spielzeug-Seite die Stärke ändern (sonst normal scrollen) */
    @Override public boolean dispatchGenericMotionEvent(MotionEvent ev) {   // vor der ScrollView abfangen (die scrollt sonst mit der Krone)
        if (ev.getAction() == MotionEvent.ACTION_SCROLL && ev.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER) && "toys".equals(screen) && dial != null && Live.adult(this)) {
            float v = -ev.getAxisValue(MotionEvent.AXIS_SCROLL);
            if (v != 0) { setLevel(curLevel() + (v > 0 ? 2 : -2)); return true; }
        }
        return super.dispatchGenericMotionEvent(ev);
    }
    @Override protected void onResume() { super.onResume(); resumed = true; ui.removeCallbacks(poll); ui.post(poll); syncShake(); }
    @Override protected void onPause() { super.onPause(); resumed = false; ui.removeCallbacks(poll); if (shake != null) shake.enable(false); }
    /** 8.2: Schüttel-Geste nach Einstellung am PC („shake“: off / stop / safeword) */
    private void syncShake() {
        String g = state != null ? state.optString("shake", "off") : "off";
        if (shake == null) shake = new Shake(this, () -> ui.post(() -> {
            String mode = state != null ? state.optString("shake", "off") : "off";
            if ("stop".equals(mode)) { buzz(300); act("toys_stop", null, null); }
            else if ("safeword".equals(mode)) { buzz(600); act("safeword", null, null); }
        }));
        shake.enable(resumed && !"off".equals(g));
    }
    @Override protected void onDestroy() { net.shutdownNow(); super.onDestroy(); }
    @Override public void onBackPressed() { if (!"main".equals(screen)) go("main"); else super.onBackPressed(); }

    /** 8.0.5: Schrittzähler braucht ab Android 10 die Erlaubnis „Körperliche Aktivität“ */
    private void askSteps() {
        if (p().getBoolean("steps", false) && android.os.Build.VERSION.SDK_INT >= 29 && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{ Manifest.permission.ACTIVITY_RECOGNITION }, 9);
    }
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
    private String faceKey() { try { return new JSONObject(p().getString("look", "{}")).optString("face", "classic"); } catch (Exception e) { return "classic"; } }
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
        if ("gallery".equals(screen)) { renderGallery(); return; }
        if (!Nexus.paired(this) || p().getBoolean("lost", false)) { renderPair(); return; }
        switch (screen) {
            case "heart": renderHeart(); return;
            case "safe": renderSafe(); return;
            case "comfort": renderComfort(); return;
            case "toys": renderToys(); return;          // 8.2
            case "chat": renderChat(); return;          // 8.2
            case "shortcuts": renderShortcuts(); return;   // 8.2
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
        if (upd != null) text("⬆ Update " + upd.optString("version") + " – am PC installieren", 11, GOLD, true);   // 8.0.19: Installation nur noch vom PC (ADB)
        String face = faceKey(), now = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.GERMANY).format(new java.util.Date());
        int bpm = curBpm();
        JSONObject hs = state != null ? state.optJSONObject("health") : null;
        switch (face) {
            case "big": text(now, 46, Color.WHITE, true); text(bpm > 0 ? "♥ " + bpm : "♥ –", 20, bpm > 0 ? RED : MUTED, true); status(); break;
            case "analog": {
                AnalogFace af = new AnalogFace(this); af.accent = CYAN; af.hi = GOLD; af.red = RED; af.muted = MUTED; af.bpm = bpm;
                root.addView(af, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                status(); break;
            }
            case "minimal":
                text(now, 40, Color.WHITE, true); text(bpm > 0 ? "♥ " + bpm : "♥ –", 16, bpm > 0 ? RED : MUTED, false);
                if (!menuOpen) { button("☰", MUTED, v -> { menuOpen = true; render(); }); return; }
                break;
            case "stats": {
                text(now + "  ♥ " + (bpm > 0 ? bpm : "–"), 20, Color.WHITE, true);
                int vr = hs != null ? hs.optInt("vr") : 0, br = hs != null ? hs.optInt("breaks") : 0;
                int st = Steps.today >= 0 ? Steps.today : hs != null ? hs.optInt("steps") : 0;
                text("🥽 " + (vr >= 60 ? vr / 60 + " h " + vr % 60 + " min" : vr + " min") + " VR heute", 12, CYAN, false);
                text("🌿 " + br + " Pausen" + (state != null && !state.isNull("coach_next") && state.optInt("coach_next", -1) >= 0 ? " · nächste in " + state.optInt("coach_next") + " min" : ""), 12, GREEN, false);
                text("🚶 " + (st > 0 ? st + " Schritte" : Steps.allowed(this) ? "0 Schritte" : "Schritte: Einstellungen"), 12, GOLD, false);
                break;
            }
            case "friends": {
                text(now, 26, Color.WHITE, true);
                text("👥 " + (state != null ? state.optInt("friends") : 0) + " Freunde online", 14, CYAN, true);
                status();
                text(bpm > 0 ? "♥ " + bpm : "", 12, RED, false);
                break;
            }
            default:
                text("◈ NEXUS · " + now, 11, CYAN, true);
                text(bpm > 0 ? "♥ " + bpm : "♥ –", 30, bpm > 0 ? RED : MUTED, true);
                status();
        }
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        JSONObject s = state;
        boolean nsfw = s != null && s.optBoolean("nsfw");
        // 8.2: Kacheln als Liste, immer zwei pro Reihe
        java.util.List<Object[]> ts = new java.util.ArrayList<>();
        ts.add(new Object[]{ "♥", "Puls", HeartService.running ? "sendet" : "aus", HeartService.running ? RED : MUTED, (View.OnClickListener) v -> go("heart") });
        if (nsfw) ts.add(new Object[]{ "🔞", "Notfall", s.optBoolean("private") ? "privat" : "", RED, (View.OnClickListener) v -> go("safe") });
        JSONObject ty = nsfw ? s.optJSONObject("toys") : null;
        if (ty != null) ts.add(new Object[]{ "〰", "Spielzeug", Math.max(ty.optInt("level"), ty.optInt("out")) + " % " + Live.consentIcon(ty.optString("consent")), CYAN, (View.OnClickListener) v -> go("toys") });
        ts.add(new Object[]{ "💤", "Komfort", s != null && s.optBoolean("sleeping") ? "schläft" : "", CYAN, (View.OnClickListener) v -> go("comfort") });
        ts.add(new Object[]{ "💬", "Chatbox", "", CYAN, (View.OnClickListener) v -> go("chat") });
        ts.add(new Object[]{ "⚡", "Aktionen", "", GOLD, (View.OnClickListener) v -> { shortcuts = null; go("shortcuts"); } });
        ts.add(new Object[]{ "⚙", "Einstellungen", "", MUTED, (View.OnClickListener) v -> go("settings") });
        LinearLayout tr = null;
        for (int i = 0; i < ts.size(); i++) {
            if (i % 2 == 0) tr = tileRow();
            Object[] x = ts.get(i);
            tile(tr, (String) x[0], (String) x[1], (String) x[2], (Integer) x[3], (View.OnClickListener) x[4]);
        }
        if (s != null && !nsfw && !s.optString("nsfw_reason").isEmpty()) text("🔞 gesperrt: " + s.optString("nsfw_reason"), 9, MUTED, false);
        if (s != null && s.optInt("friends") > 0 && !"friends".equals(face)) text("👥 " + s.optInt("friends") + " Freunde im Spiel", 10, MUTED, false);
        if (menuOpen && "minimal".equals(face)) button("✕", MUTED, v -> { menuOpen = false; render(); });
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
        button("🛑 Safeword", GOLD, v -> { buzz(120); act("safeword", null, null); });   // 6.7: gleicher Ablauf wie am PC
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
            button("〰 Fernbedienung", MUTED, v -> go("toys"));   // 8.2
        }
        button("← Menü", MUTED, v -> go("main"));
    }

    private void renderComfort() {
        JSONObject s = state;
        text("💤 Komfort", 14, CYAN, true);
        status();
        boolean sleeping = s != null && s.optBoolean("sleeping");
        button(sleeping ? "☀️ Aufwachen" : "💤 Schlafmodus", CYAN, v -> act("sleep", "on", !sleeping));
        if (!sleeping) button("⏰ Wecker 8 h", MUTED, v -> act("sleep_alarm", null, null));
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
        button("🖼 Hintergrund aus Galerie", CYAN, v -> go("gallery"));
        String fk = faceKey(); int fi = 0; while (fi < FACES.length && !FACES[fi].equals(fk)) fi++;
        final int fnext = (fi + 1) % FACES.length;
        button("⌚ Zifferblatt: " + FACE_NAMES[fi % FACES.length], CYAN, v -> act("face", "face", FACES[fnext]));   // 8.0.5
        toggle("🚶 Schritte zählen (Gesundheit am PC)", "steps", false, this::askSteps);
        toggle("Puls beim Start senden", "auto_heart", false, null);
        toggle("Bildschirm anlassen", "screen_on", false, this::applyScreenOn);
        toggle("Vibration", "vibrate", true, null);
        toggle("Meldungen vom PC", "notes", true, null);   // 6.5
        toggle("Panik doppelt tippen", "panic_confirm", true, null);
        toggle("🕶 Diskret (Kacheln & Zifferblatt neutral)", "discreet", true, () -> { applyDiscreet(); Live.push(this, true); });   // 8.2
        int al = p().getInt("hr_alarm", 0);   // 8.2: Puls-Alarm (nur mit Senden vom Uhr-Sensor)
        button("⚠ Puls-Alarm: " + (al > 0 ? "über " + al : "aus"), al > 0 ? GOLD : MUTED, v -> {
            int i = 0; while (i < HR_ALARMS.length && HR_ALARMS[i] != al) i++;
            p().edit().putInt("hr_alarm", HR_ALARMS[(i + 1) % HR_ALARMS.length]).apply(); render();
        });
        toggle("Updates automatisch suchen", "auto_update", true, null);

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
        if (upd != null) text("Installieren: am PC in VRC Nexus → Werkzeuge → 📡 Geräte → „Uhr-App installieren“ (WLAN-Debugging der Uhr).", 10, MUTED, false);
        button("🔄 Nach Updates suchen", CYAN, v -> checkUpdate(true));

        if (Nexus.paired(this)) button("Entkoppeln", RED, v -> {
            // 8.2: zuerst am PC abmelden (damit auch die 18+-Freigabe dort verschwindet), dann lokal löschen – auch wenn der PC nicht erreichbar ist
            stopService(new Intent(this, HeartService.class));
            final android.content.Context app = getApplicationContext();
            net.execute(() -> {
                try { Nexus.call(app, "/watch/action", Live.body("unpair")); } catch (Exception ignored) { /* PC aus – dort bleibt sie bis zum Entfernen gelistet */ }
                ui.post(() -> { Nexus.unpair(app); Live.clear(app); state = null; screen = "main"; render(); });
            });
        });
        button("← Menü", MUTED, v -> go("main"));
    }

    private EditText hostIn, pinIn;
    private void renderPair() {
        text("Nexus Watch", 18, GOLD, true);
        text("Mit VRC Nexus koppeln:\nam PC unter Werkzeuge → Nexus Watch die Verbindung erlauben und den Code eingeben.", 11, MUTED, false);
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
                JSONObject pr = Nexus.pair(this, host, port, pin);
                final boolean adult = pr.optBoolean("adult");
                ui.post(() -> { buzz(60); toast(adult && !Live.discreet(this) ? "✔ Gekoppelt · 🔞 Freigabe übernommen" : "✔ Gekoppelt"); render(); refresh(); });
            } catch (Exception e) { err = String.valueOf(e.getMessage()); ui.post(this::render); }
        });
    }
    private void refresh() {
        // 8.0.5: Schritte höchstens einmal pro Minute lesen und (nur bei Änderung) an den PC schicken
        if (Steps.allowed(this) && System.currentTimeMillis() - stepsAt > 60000) {
            stepsAt = System.currentTimeMillis();
            Steps.read(this, () -> net.execute(() -> {
                try { if (Steps.today >= 0 && Steps.today != lastSteps) { JSONObject b = new JSONObject(); b.put("a", "steps"); b.put("steps", Steps.today); Nexus.call(this, "/watch/action", b); lastSteps = Steps.today; } }
                catch (Exception ignored) { }
            }));
        }
        net.execute(() -> {
            try { state = Nexus.call(this, "/watch/state", null); err = ""; Live.save(this, state); Notes.handle(this, state); ui.post(this::syncShake); }
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
                if (!"settings".equals(screen) && !(dial != null && dial.dragging) && System.currentTimeMillis() - localLevelAt > 1500) render();
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
                if (r.has("state")) { state = r.getJSONObject("state"); Live.save(this, state); }
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
        if (code == 9) { gallery = null; render(); return; }
        if (code == 7 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) toggleHeart();
        else if (code == 7) toast("Ohne Sensor-Erlaubnis kein Puls.");
    }

    // ---------- 5.2.4: Hintergrund aus der Galerie der Uhr ----------
    private java.util.List<Object[]> gallery;   // {Uri, Bitmap}
    private boolean galleryBusy;
    private String galPerm() { return android.os.Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_IMAGES" : Manifest.permission.READ_EXTERNAL_STORAGE; }
    private void renderGallery() {
        text("🖼 Galerie", 16, GOLD, true);
        if (checkSelfPermission(galPerm()) != PackageManager.PERMISSION_GRANTED) {
            text("Nexus Watch braucht Zugriff auf deine Fotos, um eins als Hintergrund zu nehmen.", 11, MUTED, false);
            button("Zugriff erlauben", GOLD, v -> requestPermissions(new String[]{ galPerm() }, 9));
            button("← Zurück", MUTED, v -> go("settings"));
            return;
        }
        if (gallery == null) {
            text("Lade Fotos …", 11, MUTED, false);
            if (!galleryBusy) { galleryBusy = true; net.execute(this::loadGallery); }
        } else if (gallery.isEmpty()) text("Keine Fotos auf der Uhr gefunden.", 11, MUTED, false);
        else {
            LinearLayout r = null;
            for (int i = 0; i < gallery.size(); i++) {
                if (i % 2 == 0) r = tileRow();
                final Uri u = (Uri) gallery.get(i)[0];
                android.widget.ImageView iv = new android.widget.ImageView(this);
                iv.setImageBitmap((android.graphics.Bitmap) gallery.get(i)[1]);
                iv.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
                GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setStroke(dp(2), CYAN);
                iv.setBackground(g); iv.setClipToOutline(true);
                int size = dp(74);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size); lp.leftMargin = dp(5); lp.rightMargin = dp(5);
                iv.setLayoutParams(lp);
                iv.setOnClickListener(v -> { buzz(20); useImage(u); });
                r.addView(iv);
            }
        }
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        button("← Zurück", MUTED, v -> { gallery = null; go("settings"); });
    }
    private void loadGallery() {
        java.util.List<Object[]> out = new java.util.ArrayList<>();
        String[] cols = { android.provider.MediaStore.Images.Media._ID };
        try (android.database.Cursor cur = getContentResolver().query(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols, null, null,
                android.provider.MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            while (cur != null && cur.moveToNext() && out.size() < 24) {
                Uri u = android.content.ContentUris.withAppendedId(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cur.getLong(0));
                try { out.add(new Object[]{ u, getContentResolver().loadThumbnail(u, new android.util.Size(160, 160), null) }); } catch (Exception ignored) { }
            }
        } catch (Exception e) { err = "Galerie nicht lesbar: " + e.getMessage(); }
        gallery = out; galleryBusy = false;
        ui.post(() -> { if ("gallery".equals(screen)) render(); });
    }
    /** Foto auf Uhrgröße bringen (quadratisch, max. 480 px, JPEG) und an den PC schicken → kommt als Hintergrund zurück */
    private void useImage(Uri u) {
        toast("Wird übernommen …");
        net.execute(() -> {
            try {
                android.graphics.Bitmap src;
                if (android.os.Build.VERSION.SDK_INT >= 28) src = android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(getContentResolver(), u), (dec, info, s) -> {
                    int max = Math.max(info.getSize().getWidth(), info.getSize().getHeight()); if (max > 960) dec.setTargetSampleSize(max / 960);
                    dec.setAllocator(android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE);
                });
                else throw new Exception("zu altes Android");
                int side = Math.min(src.getWidth(), src.getHeight());
                android.graphics.Bitmap sq = android.graphics.Bitmap.createBitmap(src, (src.getWidth() - side) / 2, (src.getHeight() - side) / 2, side, side);
                android.graphics.Bitmap out = android.graphics.Bitmap.createScaledBitmap(sq, Math.min(480, side), Math.min(480, side), true);
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                out.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, bo);
                JSONObject b = new JSONObject();
                b.put("data", "data:image/jpeg;base64," + android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP));
                JSONObject r = Nexus.call(this, "/watch/bg", b);
                // sofort lokal setzen (ohne erneuten Download)
                java.io.File f = new java.io.File(getFilesDir(), "bg.img");
                try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(bo.toByteArray()); }
                JSONObject st = r.optJSONObject("state");
                if (st != null) { state = st; JSONObject lk = st.optJSONObject("look"); if (lk != null) p().edit().putString("bg_rev", lk.optString("bg_rev")).apply(); }
                err = "";
                ui.post(() -> { toast("🖼 Hintergrund gesetzt"); if (state != null) applyLook(state.optJSONObject("look"), false); gallery = null; go("main"); });
            } catch (Exception e) { err = String.valueOf(e.getMessage()); ui.post(this::render); }
        });
    }

    // ---------- 8.2: 🔞 Spielzeug-Fernbedienung ----------
    private int curLevel() {
        if (localLevel >= 0 && System.currentTimeMillis() - localLevelAt < 3000) return localLevel;
        JSONObject t = state != null ? state.optJSONObject("toys") : null;
        return t != null ? t.optInt("level") : 0;
    }
    /** Stärke lokal sofort zeigen, gesendet wird gebündelt (alle 250 ms höchstens einmal) */
    private void setLevel(int lv) {
        lv = Math.max(0, Math.min(100, lv));
        if (lv == curLevel() && localLevel >= 0) return;
        localLevel = lv; localLevelAt = System.currentTimeMillis();
        if (dial != null) { dial.level = lv; dial.invalidate(); }
        if (lv % 10 == 0) buzz(12);
        ui.removeCallbacks(levelSend); ui.postDelayed(levelSend, 250);
    }
    private void sendLevel() {
        final int lv = localLevel;
        if (lv < 0) return;
        net.execute(() -> {
            try { JSONObject r = Live.act(this, Live.body("toy_level", "level", lv)); if (r.has("state")) state = r.getJSONObject("state"); err = ""; }
            catch (Exception e) { err = String.valueOf(e.getMessage()); ui.post(() -> { buzz(200); render(); }); }
        });
    }
    private void renderToys() {
        JSONObject s = state, t = s != null && s.optBoolean("nsfw") ? s.optJSONObject("toys") : null;
        dial = null;
        text("〰 Fernbedienung", 14, CYAN, true);
        if (t == null) {
            text(s != null && !s.optString("nsfw_reason").isEmpty() ? s.optString("nsfw_reason") : "Nicht freigeschaltet.", 10, MUTED, false);
            button("⏹ STOPP", RED, v -> { buzz(150); act("toys_stop", null, null); });   // Stopp geht immer
            button("← Menü", MUTED, v -> go("main"));
            return;
        }
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        String consent = t.optString("consent", "green");
        dial = new LevelDial(this);
        dial.level = curLevel(); dial.out = t.optInt("out"); dial.accent = "red".equals(consent) ? RED : "yellow".equals(consent) ? GOLD : CYAN; dial.muted = MUTED;
        dial.listener = lv -> setLevel(lv);
        root.addView(dial, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        JSONObject pat = t.optJSONObject("pattern");
        String sub = t.optInt("devices") == 0 ? "kein Gerät verbunden" : "red".equals(consent) ? "🔴 Pause (Ampel rot)" : t.optBoolean("paused") ? "⏸ Pause" : pat != null ? "〰 " + pat.optString("name") + (pat.optInt("left") > 0 ? " · " + pat.optInt("left") + " s" : "") : "Krone drehen oder wischen";
        text(sub, 10, MUTED, false);
        Button stop = button("⏹ STOPP", RED, v -> { buzz(150); localLevel = 0; localLevelAt = System.currentTimeMillis(); ui.removeCallbacks(levelSend); act("toys_stop", null, null); });
        stop.setMinHeight(dp(58)); stop.setTextSize(18);
        button("🌅 Ausklingen (15 s)", MUTED, v -> { ui.removeCallbacks(levelSend); localLevel = -1; act("toy_fade", "fade_s", 15); });   // 8.2: Spielzeug-Labor
        LinearLayout r = row();
        chip(r, "−10", CYAN, v -> setLevel(curLevel() - 10));
        chip(r, "+10", CYAN, v -> setLevel(curLevel() + 10));
        text("Ampel · jetzt " + Live.consentIcon(consent), 10, MUTED, false);
        LinearLayout a = row();
        chip(a, "🟢", GREEN, v -> act("consent", "light", "green"));
        chip(a, "🟡", GOLD, v -> act("consent", "light", "yellow"));
        chip(a, "🔴", RED, v -> { buzz(150); act("consent", "light", "red"); });
        if (pat != null) button("⏹ Muster aus", MUTED, v -> act("toy_pattern_stop", null, null));
        button("🎁 Überraschung", GOLD, v -> act("toy_surprise", null, null));
        org.json.JSONArray pl = t.optJSONArray("patterns");
        if (pl != null && pl.length() > 0) {
            text("Muster", 10, MUTED, false);
            LinearLayout pr = null;
            for (int i = 0; i < pl.length(); i++) {
                JSONObject x = pl.optJSONObject(i); if (x == null) continue;
                if (i % 2 == 0) pr = row();
                final String id = x.optString("id");
                boolean on = pat != null && id.equals(pat.optString("id"));
                Button pb = new Button(this);
                pb.setText(x.optString("name")); pb.setAllCaps(false); pb.setTextSize(11); pb.setTextColor(Color.WHITE); pb.setPadding(dp(4), 0, dp(4), 0);
                GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(22)); g.setColor(on ? 0xFF1E3A44 : 0xFF16202B); g.setStroke(dp(on ? 2 : 1), on ? CYAN : MUTED);
                pb.setBackground(g);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1); lp.leftMargin = dp(2); lp.rightMargin = dp(2);
                pb.setLayoutParams(lp);
                pb.setOnClickListener(v -> { buzz(20); act("toy_pattern", "id", id); });
                pr.addView(pb);
            }
        }
        boolean armed = System.currentTimeMillis() - panicArmed < 3000;
        button(armed ? "🚨 NOCHMAL = PANIK" : "🚨 Panik", RED, v -> panic());
        button("← Menü", MUTED, v -> go("main"));
    }

    // ---------- 8.2: Chatbox-Schnelltexte ----------
    private void renderChat() {
        text("💬 Chatbox", 14, CYAN, true);
        text("Tippen = in die VRChat-Chatbox (Texte am PC unter Geräte änderbar)", 9, MUTED, false);
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        org.json.JSONArray q = state != null ? state.optJSONArray("quick") : null;
        if (q == null || q.length() == 0) text(state == null ? "Lade …" : "Keine Schnelltexte.", 11, MUTED, false);
        else for (int i = 0; i < q.length(); i++) { final int k = i; button(q.optString(i), MUTED, v -> act("chat", "i", k)); }
        button("← Menü", MUTED, v -> go("main"));
    }

    // ---------- 8.2: Makros & Avatar-Presets ----------
    private void renderShortcuts() {
        text("⚡ Aktionen", 14, GOLD, true);
        if (!err.isEmpty()) text("⚠ " + err, 10, GOLD, false);
        if (shortcuts == null) {
            text("Lade …", 11, MUTED, false);
            if (!shortcutsBusy) {
                shortcutsBusy = true;
                net.execute(() -> {
                    try { JSONObject r = Live.act(this, Live.body("shortcuts")); shortcuts = r; err = ""; }
                    catch (Exception e) { err = String.valueOf(e.getMessage()); shortcuts = new JSONObject(); }
                    shortcutsBusy = false;
                    ui.post(() -> { if ("shortcuts".equals(screen)) render(); });
                });
            }
        } else {
            org.json.JSONArray m = shortcuts.optJSONArray("macros"), ps = shortcuts.optJSONArray("presets");
            if (m != null && m.length() > 0) {
                text("Makros", 10, MUTED, false);
                for (int i = 0; i < m.length(); i++) { JSONObject x = m.optJSONObject(i); if (x == null) continue; final String id = x.optString("id"); button("⚡ " + x.optString("name"), CYAN, v -> act("macro", "id", id)); }
            }
            if (ps != null && ps.length() > 0) {
                text("Avatar-Presets" + (shortcuts.optString("avatar").isEmpty() ? "" : " · " + shortcuts.optString("avatar")), 10, MUTED, false);
                for (int i = 0; i < ps.length(); i++) { JSONObject x = ps.optJSONObject(i); if (x == null) continue; final String id = x.optString("id"); button("🎭 " + x.optString("name"), MUTED, v -> act("preset", "id", id)); }
            }
            if ((m == null || m.length() == 0) && (ps == null || ps.length() == 0)) text("Noch keine Makros oder Presets – am PC anlegen.", 10, MUTED, false);
            button("🔄 Neu laden", MUTED, v -> { shortcuts = null; render(); });
        }
        button("← Menü", MUTED, v -> go("main"));
    }

    // ---------- Updater ----------
    private void checkUpdate(boolean manual) {
        if (manual) { updMsg = "Suche Updates …"; render(); }
        net.execute(() -> {
            try {
                JSONObject l = Updater.latest();
                p().edit().putLong("upd_checked", System.currentTimeMillis()).apply();
                if (l != null && l.getInt("code") > Updater.installedCode(this)) { upd = l; updMsg = "Neue Version " + l.getString("version") + " verfügbar – am PC installieren."; }
                else { upd = null; updMsg = "✔ Aktuell (" + Updater.installedName(this) + ")"; }
            } catch (Exception e) { updMsg = manual ? "Update-Suche: " + e.getMessage() : ""; }   // automatische Suche: Fehler still
            ui.post(this::render);
        });
    }
}
