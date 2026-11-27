package dev.ghostnode.nexuspet;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import java.util.Random;

/** Spielfeld: Zimmer, der Geistling (wandert, blinzelt, hüpft), Häufchen, Krankheit, Schlaf, Ruf-Blase, Licht aus. */
public class PetView extends View {
    private PetModel m;
    private final Paint p = new Paint(), text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private float px = 0.5f, target = 0.5f;   // Position 0…1
    private int frame = 0, blink = 0, jump = 0, eat = 0;
    private boolean facingLeft = false;
    private boolean running = false;

    private final Runnable anim = new Runnable() {
        @Override public void run() {
            if (!running) return;
            frame ^= 1;
            if (m != null && !m.sleeping && m.stage != PetModel.Stage.EGG && m.stage != PetModel.Stage.GONE && eat == 0) {
                if (Math.abs(px - target) < 0.02f && rnd.nextInt(4) == 0) target = 0.2f + rnd.nextFloat() * 0.6f;
                float d = target - px;
                if (Math.abs(d) > 0.01f) { facingLeft = d < 0; px += Math.signum(d) * Math.min(Math.abs(d), 0.04f); }
            }
            if (blink > 0) blink--; else if (rnd.nextInt(8) == 0) blink = 1;
            if (jump > 0) jump--;
            if (eat > 0) eat--;
            invalidate();
            h.postDelayed(this, 450);
        }
    };

    public PetView(Context c) { super(c); p.setAntiAlias(false); text.setTypeface(Typeface.DEFAULT_BOLD); }

    public void setModel(PetModel model) { m = model; invalidate(); }
    public void happyJump() { jump = 4; }
    public void eating() { eat = 5; }
    /** für Mini-Spiel „Links oder Rechts“: in eine Richtung schauen */
    public void look(boolean left) { facingLeft = left; jump = 2; invalidate(); }

    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); running = true; h.post(anim); }
    @Override protected void onDetachedFromWindow() { running = false; h.removeCallbacks(anim); super.onDetachedFromWindow(); }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), hh = getHeight();
        if (w == 0 || hh == 0) return;
        boolean night = m != null && (m.lightsOff || m.sleeping);
        // Hintergrund mit Verlauf + Boden
        p.setShader(new LinearGradient(0, 0, 0, hh, night ? 0xFF070A14 : 0xFF0E1B2E, night ? 0xFF0B1020 : 0xFF183048, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, hh, p);
        p.setShader(null);
        float floor = hh * 0.82f;
        p.setColor(night ? 0xFF10151F : 0xFF1C2A3A);
        c.drawRect(0, floor, w, hh, p);
        p.setColor(0x5538D5E6);
        c.drawRect(0, floor, w, floor + 3, p);
        // Sterne im Fenster
        p.setColor(night ? 0x99F3C262 : 0x5538D5E6);
        for (int i = 0; i < 7; i++) c.drawRect(w * (0.08f + i * 0.13f), hh * (0.08f + (i % 3) * 0.05f), w * (0.08f + i * 0.13f) + 4, hh * (0.08f + (i % 3) * 0.05f) + 4, p);
        if (m == null) return;

        if (m.stage == PetModel.Stage.GONE) {
            drawCentered(c, "👻", w / 2f, hh * 0.45f, hh * 0.16f, 0xFFFFFFFF);
            drawCentered(c, m.name + " ist in den Geisterwald zurückgekehrt.", w / 2f, hh * 0.62f, hh * 0.045f, 0xFFE2E8F0);
            drawCentered(c, "Unten: 🥚 Neues Ei", w / 2f, hh * 0.70f, hh * 0.04f, 0xFF38D5E6);
            return;
        }

        // Geistling
        Sprites.Mood mood = mood();
        int[][] px16 = Sprites.pixels(m.form, mood, frame);
        float scale = Math.min(w, hh) / 16f * scaleFor(m.stage);
        float sw = 16 * scale;
        float cx = (m.stage == PetModel.Stage.EGG ? 0.5f : px) * w;
        float bob = (frame == 0 ? 0 : scale * 0.4f) + (jump > 0 ? -scale * 2f * (jump % 2 == 0 ? 1 : 0.5f) : 0);
        if (m.stage == PetModel.Stage.EGG) bob = frame == 0 ? 0 : -scale * 0.3f;   // Ei wackelt
        float top = floor - sw + bob;
        float left = cx - sw / 2;
        for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
            int col = px16[y][facingLeft ? 15 - x : x];
            if (col == 0) continue;
            p.setColor(col);
            c.drawRect(left + x * scale, top + y * scale, left + (x + 1) * scale + 0.5f, top + (y + 1) * scale + 0.5f, p);
        }

        // Häufchen
        float ps = scale * 0.55f;
        for (int i = 0; i < m.poops; i++) {
            float pxx = w * (i % 2 == 0 ? 0.06f + i * 0.04f : 0.94f - i * 0.04f) - (i % 2 == 0 ? 0 : 8 * ps);
            drawSmall(c, Sprites.POOP, Sprites.POOP_PAL, pxx, floor - 6 * ps, ps);
            if (frame == 0) { p.setColor(0x887A8794); c.drawRect(pxx + 2 * ps, floor - 9 * ps, pxx + 3 * ps, floor - 8 * ps, p); }
        }
        // Symbole über dem Kopf
        float iconY = top - scale * 1.5f;
        if (m.sick) drawCentered(c, "🤒", cx + sw * 0.45f, iconY, scale * 3f, 0xFFFFFFFF);
        if (m.sleeping) drawCentered(c, frame == 0 ? "z Z" : "Z z", cx + sw * 0.35f, iconY, scale * 2.4f, 0xFFF3C262);
        if (m.needsAttention()) {
            float bx = cx - sw * 0.45f, by = iconY;
            p.setColor(0xEEF3C262); c.drawCircle(bx, by - scale, scale * 1.8f, p);
            drawCentered(c, "!", bx, by - scale * 0.2f, scale * 2.6f, 0xFF080D14);
        }
        if (m.paused) drawCentered(c, "🏖 Urlaub", w / 2f, hh * 0.18f, hh * 0.06f, 0xFF38D5E6);

        // Licht aus: alles abdunkeln
        if (m.lightsOff) { p.setColor(0xB0000000); c.drawRect(0, 0, w, hh, p); }
    }

    Sprites.Mood mood() {
        if (m.sleeping || m.paused) return Sprites.Mood.SLEEP;
        if (eat > 0) return Sprites.Mood.EAT;
        if (m.sick) return Sprites.Mood.SICK;
        if (jump > 0) return Sprites.Mood.HAPPY;
        if (m.happy <= 1 || m.hunger == 0) return Sprites.Mood.SAD;
        if (blink > 0) return Sprites.Mood.BLINK;
        return m.happy >= 3 ? Sprites.Mood.HAPPY : Sprites.Mood.NORMAL;
    }

    static float scaleFor(PetModel.Stage s) {
        switch (s) { case EGG: return 0.42f; case BABY: return 0.42f; case CHILD: return 0.48f; case TEEN: return 0.52f; default: return 0.56f; }
    }

    void drawSmall(Canvas c, String[] rows, int[] pal, float x0, float y0, float s) {
        for (int y = 0; y < rows.length; y++) for (int x = 0; x < rows[y].length(); x++) {
            int col = Sprites.color(rows[y].charAt(x), pal);
            if (col == 0) continue;
            p.setColor(col);
            c.drawRect(x0 + x * s, y0 + y * s, x0 + (x + 1) * s + 0.5f, y0 + (y + 1) * s + 0.5f, p);
        }
    }

    void drawCentered(Canvas c, String s, float x, float y, float size, int color) {
        text.setTextSize(size); text.setColor(color); text.setTextAlign(Paint.Align.CENTER);
        c.drawText(s, x, y, text);
    }

    /** Bild für Widget und Benachrichtigung */
    static Bitmap bitmap(PetModel m, int size) {
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Sprites.Mood mood = m.sleeping ? Sprites.Mood.SLEEP : m.sick ? Sprites.Mood.SICK : (m.happy <= 1 || m.hunger == 0) ? Sprites.Mood.SAD : Sprites.Mood.HAPPY;
        int[][] px = Sprites.pixels(m.stage == PetModel.Stage.GONE ? "urgeist" : m.form, m.stage == PetModel.Stage.GONE ? Sprites.Mood.SLEEP : mood, 0);
        float s = size / 16f;
        Paint pp = new Paint();
        for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
            if (px[y][x] == 0) continue;
            pp.setColor(m.stage == PetModel.Stage.GONE ? (px[y][x] & 0x00FFFFFF) | 0x66000000 : px[y][x]);
            c.drawRect(x * s, y * s, (x + 1) * s, (y + 1) * s, pp);
        }
        return b;
    }

}
