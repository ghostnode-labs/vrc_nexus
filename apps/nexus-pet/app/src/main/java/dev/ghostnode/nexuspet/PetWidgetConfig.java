package dev.ghostnode.nexuspet;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

/** 1.1: Einstellungen für ein Geistling-Widget (Design, Schriftgröße, Name, Statuszeile, Zahlen statt Herzen). Zurück behält das Widget. */
public class PetWidgetConfig extends Activity {
    private int id = AppWidgetManager.INVALID_APPWIDGET_ID;
    private static final int BG = 0xFF080D14, CARD = 0xFF101826, FG = 0xFFE2E8F0, MUTED = 0xFF7A8794, GOLD = 0xFFF3C262;
    private RadioGroup theme, size;
    private CheckBox name, line, nums;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (getIntent() != null && getIntent().getExtras() != null) id = getIntent().getExtras().getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16); root.setPadding(p, p, p, p); sv.addView(root);
        root.addView(text("Geistling-Widget", 20, GOLD));
        LinearLayout c = card(root);
        c.addView(text("Design", 13, MUTED));
        theme = radios(c, PetWidget.THEMES, new String[] { "Dunkel", "Hell", "Durchsichtig" }, PetWidget.str(this, id, "theme", "dark", PetWidget.THEMES));
        c.addView(text("Schriftgröße", 13, MUTED));
        size = radios(c, PetWidget.SIZES, new String[] { "Klein", "Normal", "Groß" }, PetWidget.str(this, id, "size", "m", PetWidget.SIZES));
        name = check(c, "Namen zeigen", PetWidget.on(this, id, "name", true));
        line = check(c, "Hunger, Laune und Rufe zeigen", PetWidget.on(this, id, "line", true));
        nums = check(c, "Werte als Zahlen statt Herzen (z. B. 3/4)", PetWidget.on(this, id, "nums", false));
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.END); row.setPadding(0, dp(12), 0, 0);
        Button cancel = button("Abbrechen", false), save = button("Speichern", true);
        cancel.setOnClickListener(v -> finish());
        save.setOnClickListener(v -> save());
        row.addView(cancel); row.addView(save); root.addView(row);
        setContentView(sv);
    }

    private void save() {
        SharedPreferences.Editor e = getSharedPreferences(PetWidget.PREFS, MODE_PRIVATE).edit();
        View t = theme.findViewById(theme.getCheckedRadioButtonId()), s = size.findViewById(size.getCheckedRadioButtonId());
        if (t != null) e.putString(id + ".theme", (String) t.getTag());
        if (s != null) e.putString(id + ".size", (String) s.getTag());
        e.putBoolean(id + ".name", name.isChecked()).putBoolean(id + ".line", line.isChecked()).putBoolean(id + ".nums", nums.isChecked());
        e.commit();
        AppWidgetManager.getInstance(this).updateAppWidget(id, PetWidget.build(getApplicationContext(), PetStore.loadTicked(getApplicationContext()), id));
        finish();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private TextView text(String s, int sp, int color) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setPadding(0, dp(6), 0, dp(4)); return t; }
    private LinearLayout card(LinearLayout parent) {
        LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL);
        int p = dp(12); c.setPadding(p, p, p, p);
        GradientDrawable g = new GradientDrawable(); g.setColor(CARD); g.setCornerRadius(dp(12)); g.setStroke(dp(1), 0x5538D5E6); c.setBackground(g);
        parent.addView(c);
        return c;
    }
    private RadioGroup radios(LinearLayout c, String[] vals, String[] names, String cur) {
        RadioGroup g = new RadioGroup(this); g.setOrientation(RadioGroup.HORIZONTAL);
        for (int i = 0; i < vals.length; i++) {
            RadioButton r = new RadioButton(this); r.setId(View.generateViewId()); r.setText(names[i]); r.setTextColor(FG); r.setTag(vals[i]);
            g.addView(r); if (vals[i].equals(cur)) r.setChecked(true);
        }
        c.addView(g);
        return g;
    }
    private CheckBox check(LinearLayout c, String s, boolean on) { CheckBox b = new CheckBox(this); b.setText(s); b.setTextColor(FG); b.setChecked(on); c.addView(b); return b; }
    private Button button(String s, boolean main) {
        Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextColor(main ? Color.BLACK : FG);
        GradientDrawable g = new GradientDrawable(); g.setColor(main ? GOLD : 0xFF1A2436); g.setCornerRadius(dp(10)); b.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); lp.leftMargin = dp(8); b.setLayoutParams(lp);
        b.setPadding(dp(18), dp(8), dp(18), dp(8));
        return b;
    }
}
