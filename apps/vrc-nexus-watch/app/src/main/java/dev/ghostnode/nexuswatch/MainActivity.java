package dev.ghostnode.nexuswatch;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Nexus Watch – ein Bildschirm: Koppeln, Puls, Status und schnelle Knöpfe (Panik, Ampel, Spielzeug, Schlafmodus). */
public class MainActivity extends Activity {
    private static final int CYAN = 0xFF38D5E6, GOLD = 0xFFF3C262, RED = 0xFFFF5555, BG = 0xFF0B1016, MUTED = 0xFF8A93A6;
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private JSONObject state;
    private String err = "";
    private boolean resumed;
    private final Runnable poll = new Runnable() { @Override public void run() { if (resumed && Nexus.paired(MainActivity.this)) refresh(); ui.postDelayed(this, 5000); } };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Nexus.wantWifi(this);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        sv.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        int side = (int) (getResources().getDisplayMetrics().widthPixels * 0.12), top = dp(26);
        root.setPadding(side, top, side, dp(40));
        sv.addView(root);
        setContentView(sv);
        render();
    }
    @Override protected void onResume() { super.onResume(); resumed = true; ui.removeCallbacks(poll); ui.post(poll); }
    @Override protected void onPause() { super.onPause(); resumed = false; ui.removeCallbacks(poll); }
    @Override protected void onDestroy() { net.shutdownNow(); super.onDestroy(); }

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
        g.setCornerRadius(dp(22)); g.setColor(color == GOLD ? GOLD : 0xFF16202B); g.setStroke(dp(1), color);
        btn.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        lp.topMargin = dp(6);
        btn.setLayoutParams(lp);
        btn.setOnClickListener(v -> { buzz(20); l.onClick(v); });
        root.addView(btn);
        return btn;
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
    private void buzz(long ms) { try { getSystemService(Vibrator.class).vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)); } catch (Exception ignored) { } }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    // ---------- Anzeige ----------
    private void render() {
        root.removeAllViews();
        if (!Nexus.paired(this) || Nexus.prefs(this).getBoolean("lost", false)) { renderPair(); return; }
        text("⌚ ↔ " + Nexus.prefs(this).getString("pc", "PC"), 12, CYAN, false);
        JSONObject s = state;
        int bpm = HeartService.running && HeartService.bpm > 0 ? HeartService.bpm : (s != null ? s.optInt("bpm") : 0);
        text(bpm > 0 ? "♥ " + bpm : "♥ –", 34, bpm > 0 ? RED : MUTED, true);
        if (s != null) {
            String w = s.optBoolean("private") ? "🕶 Privat-Modus" : s.optBoolean("running") ? (s.optString("world").isEmpty() ? "VRChat läuft" : s.optString("world")) + " · " + s.optInt("players") + " 👥" : "VRChat läuft nicht";
            text(w, 12, Color.WHITE, false);
        }
        if (!err.isEmpty()) text("⚠ " + err, 11, GOLD, false);
        if (!HeartService.error.isEmpty() && HeartService.running) text("⚠ " + HeartService.error, 11, GOLD, false);

        button(HeartService.running ? "⏹ Puls-Senden stoppen" : "♥ Puls senden", HeartService.running ? CYAN : GOLD, v -> toggleHeart());
        if (s != null && "watch".equals(s.optString("hr_src")) == false && HeartService.running) text("In VRC Nexus „VRC Nexus Watch“ als Puls-Quelle wählen.", 10, MUTED, false);

        boolean sleeping = s != null && s.optBoolean("sleeping");
        button(sleeping ? "☀️ Aufwachen" : "💤 Schlafmodus", CYAN, v -> act("sleep", "on", !sleeping));

        if (s != null && s.optBoolean("nsfw")) {
            text("🔞", 12, MUTED, false);
            button("🚨 PANIK", RED, v -> { buzz(120); act("panic", null, null); });
            JSONObject t = s.optJSONObject("toys");
            if (t != null) {
                LinearLayout r = row();
                chip(r, "🟢", 0xFF3DDC84, v -> act("consent", "light", "green"));
                chip(r, "🟡", GOLD, v -> act("consent", "light", "yellow"));
                chip(r, "🔴", RED, v -> act("consent", "light", "red"));
                button("⏹ Spielzeug stoppen", CYAN, v -> act("toys_stop", null, null));
            }
        }
        if (s != null && s.optBoolean("private")) button("✅ Entwarnung", CYAN, v -> act("allclear", null, null));
        else if (s != null && s.optBoolean("nsfw")) button("🕶 Privat-Modus", CYAN, v -> act("private", "on", true));

        text(" ", 6, MUTED, false);
        button("Entkoppeln", MUTED, v -> { stopService(new Intent(this, HeartService.class)); Nexus.unpair(this); state = null; render(); });
    }

    private EditText hostIn, pinIn;
    private void renderPair() {
        text("Nexus Watch", 18, GOLD, true);
        text("Mit VRC Nexus koppeln:\nam PC unter 💓 Puls → „VRC Nexus Watch“ einschalten und den Code eingeben.", 11, MUTED, false);
        if (Nexus.prefs(this).getBoolean("lost", false)) text("Die Kopplung wurde am PC entfernt.", 11, GOLD, false);
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
                    String[] p = manual.replaceFirst("^https?://", "").split(":");
                    host = p[0]; if (p.length > 1) port = Integer.parseInt(p[1].replaceAll("\\D", ""));
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
            ui.post(this::render);
        });
    }
    private void act(String a, String key, Object val) {
        net.execute(() -> {
            try {
                JSONObject b = new JSONObject(); b.put("a", a); if (key != null) b.put(key, val);
                JSONObject r = Nexus.call(this, "/watch/action", b);
                if (r.has("state")) state = r.getJSONObject("state");
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
    @Override public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        super.onRequestPermissionsResult(code, p, r);
        if (code == 7 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) toggleHeart();
        else if (code == 7) toast("Ohne Sensor-Erlaubnis kein Puls.");
    }
}
