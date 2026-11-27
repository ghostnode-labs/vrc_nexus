package dev.ghostnode.nexuswatch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

import java.util.Calendar;

/** 8.0.5: analoges Zifferblatt mit Puls-Ring (Ring füllt sich von 40 bis 200 bpm, Farbe = Puls-Farbe). */
final class AnalogFace extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    int accent = 0xFF38D5E6, hi = 0xFFF3C262, red = 0xFFFF5555, muted = 0xFF8A93A6, bpm = 0;

    AnalogFace(Context c) { super(c); }

    @Override protected void onMeasure(int w, int h) { int s = MeasureSpec.getSize(w); setMeasuredDimension(s, (int) (s * 0.82f)); }

    @Override protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), cx = w / 2f, cy = h / 2f, rad = Math.min(w, h) / 2f - 6;
        // Puls-Ring
        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(rad * 0.08f);
        r.set(cx - rad, cy - rad, cx + rad, cy + rad);
        p.setColor((muted & 0x00FFFFFF) | 0x33000000); c.drawArc(r, 0, 360, false, p);
        if (bpm > 0) { p.setColor(red); c.drawArc(r, -90, 360f * Math.max(0.02f, Math.min(1f, (bpm - 40) / 160f)), false, p); }
        // Striche
        p.setStrokeWidth(3); p.setColor(muted);
        for (int i = 0; i < 12; i++) {
            double a = Math.PI * 2 * i / 12; float o = rad * 0.84f, in = rad * (i % 3 == 0 ? 0.70f : 0.76f);
            c.drawLine(cx + (float) Math.sin(a) * in, cy - (float) Math.cos(a) * in, cx + (float) Math.sin(a) * o, cy - (float) Math.cos(a) * o, p);
        }
        Calendar k = Calendar.getInstance();
        float min = k.get(Calendar.MINUTE), hr = k.get(Calendar.HOUR) + min / 60f;
        hand(c, cx, cy, hr / 12f, rad * 0.45f, rad * 0.07f, hi);
        hand(c, cx, cy, min / 60f, rad * 0.66f, rad * 0.045f, accent);
        p.setStyle(Paint.Style.FILL); p.setColor(accent); c.drawCircle(cx, cy, rad * 0.05f, p);
        // Puls in der Mitte unten
        p.setTextAlign(Paint.Align.CENTER); p.setTextSize(rad * 0.22f); p.setFakeBoldText(true); p.setColor(bpm > 0 ? red : muted);
        c.drawText(bpm > 0 ? "♥ " + bpm : "♥ –", cx, cy + rad * 0.48f, p);
    }
    private void hand(Canvas c, float cx, float cy, float f, float len, float wid, int col) {
        double a = Math.PI * 2 * f;
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(wid); p.setColor(col);
        c.drawLine(cx, cy, cx + (float) Math.sin(a) * len, cy - (float) Math.cos(a) * len, p);
    }
}
