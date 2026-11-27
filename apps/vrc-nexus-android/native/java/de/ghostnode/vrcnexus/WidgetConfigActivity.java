package de.ghostnode.vrcnexus;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.RemoteViews;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * 7.3.3: Einstellungen für ein einzelnes Homescreen-Widget.
 * Öffnet sich beim Hinzufügen (ältere Android-Versionen), über „Widget anpassen“ (Android 12+) und über ⚙ im Widget.
 * Zurück ohne Speichern behält das Widget mit den bisherigen Werten. Texte kommen übersetzt aus der App (Feld „L“), sonst Deutsch.
 */
public class WidgetConfigActivity extends Activity {
    private int id = AppWidgetManager.INVALID_APPWIDGET_ID;
    private String kind = "";
    private JSONObject o;
    private final List<Runnable> savers = new ArrayList<>();
    private static final int BG = 0xFF080D14, CARD = 0xFF101826, FG = 0xFFE2E8F0, MUTED = 0xFF7A8794, GOLD = 0xFFF3C262, CYAN = 0xFF38D5E6;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent in = getIntent();
        if (in != null && in.getExtras() != null) id = in.getExtras().getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        // Zurück ohne Speichern: Widget bleibt (mit Standardwerten) – nicht wie sonst wieder entfernen
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id);
        kind = info == null || info.provider == null ? "" : info.provider.getShortClassName().replace(".", "");
        o = WidgetKit.data(this);
        setContentView(ui());
    }

    private String L(String k, String def) { return WidgetKit.L(o, k, def); }

    private View ui() {
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(16);
        root.setPadding(p, p, p, p);
        sv.addView(root);
        TextView t = text(L("cfg_title", "Widget-Einstellungen") + " – " + title(), 20, GOLD);
        t.setPadding(0, 0, 0, dp(10));
        root.addView(t);

        LinearLayout look = card(root, "🎨 " + L("cfg_look", "Aussehen"));
        radio(look, L("cfg_theme", "Design"), "theme", WidgetCfg.THEMES, new String[] { L("theme_dark", "Dunkel"), L("theme_light", "Hell"), L("theme_clear", "Durchsichtig") }, "dark");
        radio(look, L("cfg_size", "Schriftgröße"), "size", WidgetCfg.SIZES, new String[] { L("size_s", "Klein"), L("size_m", "Normal"), L("size_l", "Groß") }, "m");
        if (!"QuickWidget".equals(kind)) check(look, L("cfg_foot", "„Stand“ (Uhrzeit der Daten) zeigen"), "foot", true);

        LinearLayout c = card(root, "⚙ " + L("cfg_content", "Inhalt"));
        switch (kind) {
            case "NexusWidget":
                slider(c, L("cfg_rows", "Freunde in der Liste"), "rows", 5, 0, 8);
                check(c, L("cfg_dot", "Status-Punkt hinter dem Namen"), "dot", true);
                check(c, L("cfg_bell", "Ungelesene Benachrichtigungen zeigen"), "bell", true);
                tap(c, "friends");
                break;
            case "PulseWidget":
                check(c, L("cfg_world", "Welt zeigen (nie im Privat-Modus)"), "world", true);
                check(c, L("cfg_players", "Spielerzahl zeigen"), "players", true);
                check(c, L("cfg_sleep", "Hinweis „Schlafmodus an“"), "sleep", true);
                tap(c, "pc");
                break;
            case "EventWidget":
                slider(c, L("cfg_count", "Anzahl Events"), "count", 3, 1, 6);
                check(c, L("cfg_star", "Nur Gruppen, denen ich folge (⭐)"), "star", false);
                check(c, L("cfg_anniv", "Jubiläen und Geburtstage"), "anniv", true);
                tap(c, "calendar");
                break;
            case "NotifWidget":
                slider(c, L("cfg_count2", "Anzahl Einträge"), "count", 4, 1, 6);
                check(c, L("cfg_msg", "Nachrichtentext zeigen"), "msg", true);
                check(c, L("cfg_badge", "Zähler oben rechts"), "badge", true);
                tap(c, "notifs");
                break;
            case "QuickWidget":
                String[] labels = new String[QuickWidget.SLOTS.length];
                for (int i = 0; i < labels.length; i++) labels[i] = QuickWidget.icon(QuickWidget.SLOTS[i]) + " " + QuickWidget.label(o, QuickWidget.SLOTS[i]);
                for (int i = 0; i < 4; i++) spinner(c, L("cfg_btn", "Knopf") + " " + (i + 1), "b" + (i + 1), QuickWidget.SLOTS, labels, QuickWidget.DEFAULTS[i]);
                check(c, L("cfg_panic", "🛑 Panik-Knopf zeigen"), "panic", true);
                break;
            default:
                c.addView(text(L("cfg_unknown", "Dieses Widget hat keine weiteren Einstellungen."), 13, MUTED));
        }

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.END);
        row.setPadding(0, dp(12), 0, 0);
        Button cancel = button(L("cancel", "Abbrechen"), false), save = button(L("save", "Speichern"), true);
        cancel.setOnClickListener(v -> finish());
        save.setOnClickListener(v -> save());
        row.addView(cancel); row.addView(save);
        root.addView(row);
        return sv;
    }

    private String title() {
        switch (kind) {
            case "NexusWidget": return L("w_friends", "Freunde online");
            case "PulseWidget": return L("w_pulse", "Puls & PC");
            case "EventWidget": return L("w_events", "Nächste Events");
            case "NotifWidget": return L("w_notifs", "Benachrichtigungen");
            case "QuickWidget": return L("w_quick", "Schnellzugriff & Panik");
            default: return "VRC Nexus";
        }
    }

    private void save() {
        SharedPreferences.Editor e = WidgetCfg.edit(this);
        for (Runnable r : savers) r.run();
        e.apply();
        Context ctx = getApplicationContext();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        RemoteViews v = null;
        switch (kind) {
            case "NexusWidget": v = NexusWidget.build(ctx, id); break;
            case "PulseWidget": v = PulseWidget.build(ctx, id); break;
            case "EventWidget": v = EventWidget.build(ctx, id); break;
            case "NotifWidget": v = NotifWidget.build(ctx, id); break;
            case "QuickWidget": v = QuickWidget.build(ctx, id); break;
            default: break;
        }
        if (v != null) mgr.updateAppWidget(id, v);
        finish();
    }

    // ---------- kleine Bausteine (ohne Bibliotheken) ----------
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        return t;
    }

    private LinearLayout card(LinearLayout parent, String head) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        int p = dp(12);
        c.setPadding(p, p, p, p);
        GradientDrawable g = new GradientDrawable();
        g.setColor(CARD); g.setCornerRadius(dp(12)); g.setStroke(dp(1), 0x5538D5E6);
        c.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(12);
        parent.addView(c, lp);
        TextView h = text(head, 15, CYAN);
        h.setPadding(0, 0, 0, dp(6));
        c.addView(h);
        return c;
    }

    private void label(LinearLayout c, String s) { TextView t = text(s, 13, MUTED); t.setPadding(0, dp(6), 0, dp(2)); c.addView(t); }

    private void radio(LinearLayout c, String lab, String key, String[] vals, String[] names, String def) {
        label(c, lab);
        RadioGroup g = new RadioGroup(this);
        g.setOrientation(RadioGroup.HORIZONTAL);
        String cur = WidgetCfg.str(this, id, key, def, vals);
        for (int i = 0; i < vals.length; i++) {
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId()); r.setText(names[i]); r.setTextColor(FG); r.setTag(vals[i]);
            g.addView(r);
            if (vals[i].equals(cur)) r.setChecked(true);
        }
        c.addView(g);
        savers.add(() -> { View r = g.findViewById(g.getCheckedRadioButtonId()); if (r != null) WidgetCfg.edit(this).putString(id + "." + key, (String) r.getTag()).apply(); });
    }

    private void check(LinearLayout c, String lab, String key, boolean def) {
        CheckBox b = new CheckBox(this);
        b.setText(lab); b.setTextColor(FG); b.setChecked(WidgetCfg.on(this, id, key, def));
        c.addView(b);
        savers.add(() -> WidgetCfg.edit(this).putBoolean(id + "." + key, b.isChecked()).apply());
    }

    private void slider(LinearLayout c, String lab, String key, int def, int min, int max) {
        TextView t = text("", 13, MUTED);
        t.setPadding(0, dp(6), 0, 0);
        c.addView(t);
        SeekBar s = new SeekBar(this);
        s.setMax(max - min);
        s.setProgress(WidgetCfg.num(this, id, key, def, min, max) - min);
        Runnable show = () -> t.setText(lab + ": " + (s.getProgress() + min));
        show.run();
        s.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int v, boolean user) { show.run(); }
            @Override public void onStartTrackingTouch(SeekBar bar) {}
            @Override public void onStopTrackingTouch(SeekBar bar) {}
        });
        c.addView(s);
        savers.add(() -> WidgetCfg.edit(this).putInt(id + "." + key, s.getProgress() + min).apply());
    }

    private void spinner(LinearLayout c, String lab, String key, String[] vals, String[] names, String def) {
        label(c, lab);
        Spinner sp = new Spinner(this);
        ArrayAdapter<String> ad = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, names);
        ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        sp.setAdapter(ad);
        String cur = WidgetCfg.str(this, id, key, def, vals);
        for (int i = 0; i < vals.length; i++) if (vals[i].equals(cur)) sp.setSelection(i);
        sp.setBackgroundColor(0xFF1A2436);
        c.addView(sp);
        savers.add(() -> { int i = sp.getSelectedItemPosition(); if (i >= 0 && i < vals.length) WidgetCfg.edit(this).putString(id + "." + key, vals[i]).apply(); });
    }

    /** Ziel beim Tippen aufs Widget */
    private void tap(LinearLayout c, String def) {
        String[] tabs = WidgetKit.TABS, names = new String[tabs.length];
        for (int i = 0; i < tabs.length; i++) names[i] = L("tab_" + tabs[i], tabName(tabs[i]));
        spinner(c, L("cfg_tap", "Beim Tippen öffnen"), "tap", tabs, names, def);
    }
    private static String tabName(String t) {
        switch (t) {
            case "home": return "🏠 Start"; case "friends": return "👥 Freunde"; case "community": return "🫂 Community"; case "clubs": return "🏠 Clubs";
            case "calendar": return "📅 Kalender"; case "notifs": return "🔔 Benachrichtigungen"; case "buttons": return "🎛 Knöpfe"; case "pc": return "🖥 PC";
            case "nsfw": return "🔞 18+"; case "settings": return "⚙ Einstellungen"; default: return t;
        }
    }

    private Button button(String s, boolean main) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false);
        b.setTextColor(main ? Color.BLACK : FG);
        GradientDrawable g = new GradientDrawable();
        g.setColor(main ? GOLD : 0xFF1A2436); g.setCornerRadius(dp(10));
        b.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(8);
        b.setLayoutParams(lp);
        b.setPadding(dp(18), dp(8), dp(18), dp(8));
        return b;
    }
}
