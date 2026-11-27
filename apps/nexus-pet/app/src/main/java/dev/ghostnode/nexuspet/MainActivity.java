package dev.ghostnode.nexuspet;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Random;

/** Hauptbildschirm: Werte oben, Spielfeld in der Mitte, Pflege-Knöpfe unten. Alles im Code gebaut (keine Zusatzbibliotheken). */
public class MainActivity extends Activity {
    static final int CYAN = 0xFF38D5E6, GOLD = 0xFFF3C262, TEXT = 0xFFE2E8F0, MUTED = 0xFF7A8794, BG = 0xFF080D14, PANEL = 0xFF0F1724, RED = 0xFFFF5C7A;

    private PetModel m;
    private PetView view;
    private TextView head, sub, stats, msg;
    private Button bLights, bEgg;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private final Runnable refresh = new Runnable() {
        @Override public void run() { if (m != null) { m.tick(now()); PetStore.save(MainActivity.this, m); render(); } h.postDelayed(this, 15000); }
    };

    static long now() { return System.currentTimeMillis(); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        m = PetStore.loadTicked(this);
        setContentView(build());
        render();
        PetAlarm.schedule(this);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        if (!PetStore.flag(this, "intro", false)) { PetStore.setFlag(this, "intro", true); help(); }
    }

    @Override protected void onResume() { super.onResume(); m = PetStore.loadTicked(this); view.setModel(m); render(); h.removeCallbacks(refresh); h.postDelayed(refresh, 15000); PetAlarm.clearNote(this); }
    @Override protected void onPause() { h.removeCallbacks(refresh); m.tick(now()); PetStore.save(this, m); PetWidget.updateAll(this, m); super.onPause(); }

    // ---------- Oberfläche ----------
    View build() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(14), dp(16), dp(14), dp(12));

        head = tv(22, GOLD, true); sub = tv(13, MUTED, false); stats = tv(15, TEXT, false);
        root.addView(head); root.addView(sub);
        stats.setPadding(0, dp(6), 0, dp(6));
        root.addView(stats);

        view = new PetView(this);
        view.setModel(m);
        GradientDrawable frame = new GradientDrawable();
        frame.setCornerRadius(dp(18)); frame.setStroke(dp(1), 0x8038D5E6); frame.setColor(PANEL);
        view.setBackground(frame);
        view.setClipToOutline(true);
        view.setOnClickListener(v -> { if (m.stage != PetModel.Stage.GONE) say(m.cuddle(now())); view.happyJump(); });
        root.addView(view, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        msg = tv(14, CYAN, false);
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(0, dp(8), 0, dp(8));
        msg.setMinLines(2);
        root.addView(msg);

        GridLayout g = new GridLayout(this);
        g.setColumnCount(4);
        addBtn(g, "🍙", "Füttern", v -> feedMenu());
        addBtn(g, "🎮", "Spielen", v -> playMenu());
        addBtn(g, "🧽", "Putzen", v -> act(m.clean(now()), false));
        addBtn(g, "💊", "Medizin", v -> act(m.medicine(now()), false));
        bLights = addBtn(g, "💡", "Licht", v -> act(m.toggleLights(now()), false));
        addBtn(g, "📣", "Erziehen", v -> act(m.scold(now()), false));
        addBtn(g, "🤗", "Kuscheln", v -> { act(m.cuddle(now()), false); view.happyJump(); });
        bEgg = addBtn(g, "⋯", "Mehr", v -> moreMenu());
        root.addView(g);
        return root;
    }

    Button addBtn(GridLayout g, String icon, String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(icon + "\n" + label);
        b.setAllCaps(false);
        b.setTextColor(TEXT);
        b.setTextSize(12);
        b.setPadding(0, dp(8), 0, dp(8));
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(12)); d.setColor(0x1A38D5E6); d.setStroke(dp(1), 0x5538D5E6);
        b.setBackground(d);
        b.setOnClickListener(v -> { v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY); l.onClick(v); });
        GridLayout.LayoutParams lp = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED, 1f), GridLayout.spec(GridLayout.UNDEFINED, 1f));
        lp.width = 0; lp.setMargins(dp(3), dp(3), dp(3), dp(3));
        g.addView(b, lp);
        return b;
    }

    TextView tv(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }
    int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    static String hearts(int n) { StringBuilder s = new StringBuilder(); for (int i = 0; i < PetModel.MAX_HEARTS; i++) s.append(i < n ? "♥" : "♡"); return s.toString(); }

    void render() {
        if (m == null) return;
        view.setModel(m);
        head.setText(m.name + "  ·  " + PetModel.formName(m.form));
        sub.setText(m.stageName() + (m.stage == PetModel.Stage.EGG ? " – schlüpft gleich" : " · " + m.ageDays() + " " + (m.ageDays() == 1 ? "Tag" : "Tage") + " · " + m.weight + " g")
                + " · Generation " + m.generation + (m.gentle ? " · Sanft" : " · Klassisch"));
        stats.setText(m.stage == PetModel.Stage.EGG || m.stage == PetModel.Stage.GONE ? "" :
                "🍙 " + hearts(m.hunger) + "   😊 " + hearts(m.happy) + "   📣 " + m.discipline + " %" + (m.poops > 0 ? "   💩 " + m.poops : "") + (m.sick ? "   🤒" : ""));
        if (m.needsAttention()) { msg.setTextColor(GOLD); msg.setText("❗ " + m.callText()); }
        bLights.setText((m.lightsOff ? "🌙" : "💡") + "\nLicht");
        bEgg.setText(m.stage == PetModel.Stage.GONE ? "🥚\nNeues Ei" : "⋯\nMehr");
    }

    void say(String s) { msg.setTextColor(CYAN); msg.setText(s); }

    void act(String result, boolean eating) {
        say(result);
        if (eating) view.eating();
        PetStore.save(this, m);
        render();
        if (!m.needsAttention()) say(result);
    }

    // ---------- Füttern ----------
    void feedMenu() {
        new AlertDialog.Builder(this).setTitle("Füttern")
                .setItems(new String[] { "🍙 Mahlzeit (macht satt)", "🍰 Snack (macht froh, macht dick)" }, (d, w) -> act(m.feed(w == 1, now()), true))
                .show();
    }

    // ---------- Spielen ----------
    void playMenu() {
        if (!m.canPlay()) { say(m.play(0, 5, now())); return; }
        new AlertDialog.Builder(this).setTitle("Spielen")
                .setItems(new String[] { "↔ Links oder Rechts? (rate die Blickrichtung)", "🔢 Höher oder Tiefer?" }, (d, w) -> { if (w == 0) leftRight(0, 0); else higherLower(0, 0, 1 + rnd.nextInt(9)); })
                .show();
    }

    void leftRight(int round, int won) {
        if (round == 5) { finishGame(won); return; }
        new AlertDialog.Builder(this).setTitle("Runde " + (round + 1) + "/5 · " + won + " richtig")
                .setMessage("Wohin schaut " + m.name + " gleich?")
                .setCancelable(false)
                .setNegativeButton("⬅ Links", (d, w) -> lrGuess(round, won, true))
                .setPositiveButton("Rechts ➡", (d, w) -> lrGuess(round, won, false))
                .show();
    }
    void lrGuess(int round, int won, boolean left) {
        boolean pet = rnd.nextBoolean();
        view.look(pet);
        boolean hit = pet == left;
        say((hit ? "✅ Richtig! " : "❌ Daneben – ") + "Schaut nach " + (pet ? "links." : "rechts."));
        h.postDelayed(() -> leftRight(round + 1, won + (hit ? 1 : 0)), 900);
    }

    void higherLower(int round, int won, int cur) {
        if (round == 5) { finishGame(won); return; }
        new AlertDialog.Builder(this).setTitle("Runde " + (round + 1) + "/5 · " + won + " richtig")
                .setMessage("Die Zahl ist " + cur + ". Ist die nächste (1–9) höher oder tiefer?")
                .setCancelable(false)
                .setNegativeButton("⬇ Tiefer", (d, w) -> hlGuess(round, won, cur, false))
                .setPositiveButton("Höher ⬆", (d, w) -> hlGuess(round, won, cur, true))
                .show();
    }
    void hlGuess(int round, int won, int cur, boolean higher) {
        int next; do { next = 1 + rnd.nextInt(9); } while (next == cur);
        boolean hit = (next > cur) == higher;
        say((hit ? "✅ Richtig! " : "❌ Daneben – ") + "Es war die " + next + ".");
        if (hit) view.happyJump();
        final int n = next;
        h.postDelayed(() -> higherLower(round + 1, won + (hit ? 1 : 0), n), 700);
    }

    void finishGame(int won) {
        String r = m.play(won, 5, now());
        if (won >= 3) view.happyJump();
        act(r, false);
    }

    // ---------- Mehr ----------
    void moreMenu() {
        if (m.stage == PetModel.Stage.GONE) { newEgg(); return; }
        String[] items = { "📊 Status & Statistik", "📖 Sammlung & Erinnerungen", "✏ Umbenennen", m.paused ? "🏠 Urlaub beenden" : "🏖 Urlaub (Zeit anhalten)",
                "🌙 Schlafenszeit verschieben", m.gentle ? "⚔ Klassischer Modus (strenger)" : "🕊 Sanfter Modus", (PetStore.flag(this, "notify", true) ? "🔕 Benachrichtigungen aus" : "🔔 Benachrichtigungen an"),
                "🥚 Neu anfangen", "❓ Anleitung" };
        new AlertDialog.Builder(this).setTitle("Mehr").setItems(items, (d, w) -> {
            switch (w) {
                case 0: status(); break;
                case 1: collection(); break;
                case 2: rename(); break;
                case 3: act(m.setPaused(!m.paused, now()), false); break;
                case 4: shiftSleep(); break;
                case 5: toggleMode(); break;
                case 6: { boolean on = !PetStore.flag(this, "notify", true); PetStore.setFlag(this, "notify", on); say(on ? "🔔 Benachrichtigungen an." : "🔕 Benachrichtigungen aus."); break; }
                case 7: new AlertDialog.Builder(this).setTitle("Wirklich neu anfangen?").setMessage(m.name + " zieht dann in den Geisterwald. Die Sammlung bleibt.")
                        .setPositiveButton("Ja", (x, y) -> { m.leaveNow(now()); newEgg(); }).setNegativeButton("Nein", null).show(); break;
                default: help();
            }
        }).show();
    }

    void status() {
        String s = "Form: " + PetModel.formName(m.form) + " (" + m.stageName() + ")\n"
                + "Alter: " + m.ageDays() + " Tage · Gewicht: " + m.weight + " g\n"
                + "Hunger: " + hearts(m.hunger) + "\nLaune: " + hearts(m.happy) + "\n"
                + "Disziplin: " + m.discipline + " %\n"
                + "Pflegefehler: " + m.totalMistakes + " (diese Stufe: " + m.stageMistakes + ")\n"
                + (m.sick ? "🤒 krank\n" : "") + (m.sleeping ? "😴 schläft\n" : "")
                + "\nGefüttert: " + m.fed + " · Snacks: " + m.snacks + "\nGeputzt: " + m.cleaned + " · Geheilt: " + m.cured
                + "\nSpiele: " + m.gamesWon + "/" + m.gamesPlayed + " gewonnen · Erzogen: " + m.scolded
                + "\nSchlafenszeit: " + (m.sleepShift == 0 ? "normal" : (m.sleepShift > 0 ? "+" : "") + m.sleepShift + " h");
        new AlertDialog.Builder(this).setTitle("📊 " + m.name).setMessage(s).setPositiveButton("OK", null).show();
    }

    void collection() {
        StringBuilder s = new StringBuilder();
        int got = 0;
        for (String f : PetModel.ALL_FORMS) { boolean has = m.seen.contains(f); if (has) got++; s.append(has ? "✅ " + PetModel.formName(f) : "❔ ???").append('\n'); }
        s.insert(0, got + " von " + PetModel.ALL_FORMS.length + " Formen entdeckt\n\n");
        if (!m.history.isEmpty()) {
            s.append("\n🕯 Erinnerungen\n");
            for (String hst : m.history) {
                String[] p = hst.split("\\|");
                if (p.length >= 4) s.append("• ").append(p[0]).append(" – ").append(PetModel.formName(p[1])).append(", ").append(p[2]).append(" Tage (").append(p[3]).append(")\n");
            }
        }
        ScrollView sv = new ScrollView(this);
        TextView t = tv(15, TEXT, false); t.setText(s.toString()); t.setPadding(dp(20), dp(12), dp(20), dp(12));
        sv.addView(t);
        new AlertDialog.Builder(this).setTitle("📖 Sammlung").setView(sv).setPositiveButton("OK", null).show();
    }

    void rename() {
        EditText e = new EditText(this);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        e.setText(m.name); e.setSelection(m.name.length());
        new AlertDialog.Builder(this).setTitle("Name (höchstens 16 Zeichen)").setView(e)
                .setPositiveButton("Speichern", (d, w) -> { m.name = PetModel.cleanName(e.getText().toString()); act("✏ Hallo, " + m.name + "!", false); })
                .setNegativeButton("Abbrechen", null).show();
    }

    void shiftSleep() {
        String[] o = { "3 h früher", "2 h früher", "1 h früher", "normal", "1 h später", "2 h später", "3 h später" };
        new AlertDialog.Builder(this).setTitle("Schlafenszeit").setSingleChoiceItems(o, m.sleepShift + 3, (d, w) -> {
            m.sleepShift = w - 3; d.dismiss(); act("🌙 Schlafenszeit: " + o[w] + ".", false);
        }).show();
    }

    void toggleMode() {
        String txt = m.gentle
                ? "Klassisch: Rufe musst du in 15 Minuten beantworten. Wer lange hungert oder krank bleibt, verlässt dich – und Pflegefehler verkürzen das Leben."
                : "Sanft: 30 Minuten Zeit für Rufe, dein Geistling verlässt dich nie wegen Vernachlässigung.";
        new AlertDialog.Builder(this).setTitle(m.gentle ? "Klassischer Modus" : "Sanfter Modus").setMessage(txt)
                .setPositiveButton("Umschalten", (d, w) -> { m.gentle = !m.gentle; act(m.gentle ? "🕊 Sanfter Modus." : "⚔ Klassischer Modus.", false); })
                .setNegativeButton("Abbrechen", null).show();
    }

    void newEgg() {
        EditText e = new EditText(this);
        e.setHint("Name");
        e.setText(m.stage == PetModel.Stage.GONE ? "" : m.name);
        new AlertDialog.Builder(this).setTitle("🥚 Neues Ei – wie soll es heißen?").setView(e).setCancelable(false)
                .setPositiveButton("Los", (d, w) -> { m.reset(now(), m.generation + 1, e.getText().toString()); act("🥚 Ein neues Ei! Es schlüpft in 5 Minuten.", false); })
                .show();
    }

    void help() {
        String s = "Dein Geistling lebt in Echtzeit – auch wenn die App zu ist.\n\n"
                + "🍙 Füttern: Mahlzeit gegen Hunger, Snack für gute Laune (zu viele machen krank).\n"
                + "🎮 Spielen: Mini-Spiele heben die Laune und halten fit.\n"
                + "🧽 Putzen: Häufchen wegmachen – sonst wird er krank.\n"
                + "💊 Medizin: hilft, wenn er krank ist (manchmal zwei Mal).\n"
                + "💡 Licht: Abends wird er müde – mach das Licht aus.\n"
                + "📣 Erziehen: Ruft er ohne Grund? Dann erziehen! Sonst macht es ihn traurig.\n"
                + "🤗 Kuscheln: Tippen aufs Bild oder den Knopf.\n\n"
                + "❗ Ruft er, hast du 30 Minuten (sanft) bzw. 15 Minuten (klassisch) – sonst zählt ein Pflegefehler.\n"
                + "Pflege, Erziehung und Gewicht entscheiden, wozu er sich entwickelt. Es gibt 13 Formen – eine davon ist geheim.\n\n"
                + "🏖 Urlaub hält die Zeit an. Das Widget zeigt ihn auf dem Startbildschirm.";
        new AlertDialog.Builder(this).setTitle("👻 Nexus Pet").setMessage(s).setPositiveButton("Los geht's", null).show();
    }
}
