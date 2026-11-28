package dev.ghostnode.nexuswatch;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

/**
 * 8.2: Stärke-Rad für die Spielzeug-Fernbedienung. Ring = eingestellte Stärke, dünner Innenring = was gerade ankommt.
 * Wischen (hoch/rechts = stärker, runter/links = schwächer) ändert die Stärke; die Drehkrone regelt MainActivity.
 */
final class LevelDial extends View {
    interface Listener { void onLevel(int level); }
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    int level = 0, out = 0, accent = 0xFF38D5E6, muted = 0xFF8A93A6;
    Listener listener;
    boolean dragging = false;
    private float lastX, lastY, acc;

    LevelDial(Context c) { super(c); setClickable(true); setContentDescription("Stärke"); }

    @Override protected void onMeasure(int w, int h) { int s = MeasureSpec.getSize(w); setMeasuredDimension(s, (int) (s * 0.62f)); }

    @Override protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight(), cx = w / 2f, cy = h / 2f, rad = Math.min(w, h) / 2f - 8;
        r.set(cx - rad, cy - rad, cx + rad, cy + rad);
        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeWidth(rad * 0.14f);
        p.setColor((muted & 0x00FFFFFF) | 0x33000000); c.drawArc(r, 135, 270, false, p);
        if (level > 0) { p.setColor(accent); c.drawArc(r, 135, 270f * level / 100f, false, p); }
        float in = rad * 0.78f;
        r.set(cx - in, cy - in, cx + in, cy + in);
        p.setStrokeWidth(rad * 0.04f); p.setColor((accent & 0x00FFFFFF) | 0x88000000);
        if (out > 0) c.drawArc(r, 135, 270f * Math.min(100, out) / 100f, false, p);
        p.setStyle(Paint.Style.FILL); p.setTextAlign(Paint.Align.CENTER); p.setFakeBoldText(true);
        p.setTextSize(rad * 0.52f); p.setColor(0xFFFFFFFF);
        c.drawText(level + "%", cx, cy + rad * 0.18f, p);
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragging = true; lastX = e.getX(); lastY = e.getY(); acc = 0;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                return true;
            case MotionEvent.ACTION_MOVE: {
                float d = (e.getX() - lastX) - (e.getY() - lastY);
                lastX = e.getX(); lastY = e.getY();
                acc += d / Math.max(1f, getWidth()) * 120f;   // ganze Breite ≈ 120 %
                int step = (int) acc;
                if (step != 0) { acc -= step; if (listener != null) listener.onLevel(Math.max(0, Math.min(100, level + step))); }
                return true;
            }
            case MotionEvent.ACTION_UP: case MotionEvent.ACTION_CANCEL:
                dragging = false;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
                performClick();
                return true;
        }
        return super.onTouchEvent(e);
    }
    @Override public boolean performClick() { return super.performClick(); }
}
