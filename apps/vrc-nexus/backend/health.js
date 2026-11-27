'use strict';
/*
 * 8.0.5: 📈 Gesundheit – Bewegungs- und Pausenstatistik aus Uhr und Spielzeit.
 *   Quelle: das Tages-Tagebuch (VR-Minuten, Pausen, längste Strecke vom Pausen-Coach; Puls minütlich) + Schritte von der Nexus Watch.
 *   Auswertung über 7 / 30 / 90 Tage mit freundlichen Hinweisen – keine Diagnose, kein erhobener Zeigefinger, alles nur auf diesem Gerät.
 */
const { int, UserError } = require('./util');
const { dayOf } = require('./diary');

const UID = 1;
const avg = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0;

class Health {
    constructor(app) { this.app = app; }
    /** Tage (älteste zuerst) mit allen Werten – fehlende Tage als 0 */
    days(n, now = Date.now()) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
            out.push(dayOf(d.getTime()));
        }
        const rows = {};
        for (const r of this.app.db.prepare('SELECT day, vr_min, breaks, longest, hr_min, hr_max, hr_sum, hr_n, steps FROM diary WHERE user_id = ? AND day >= ? AND day <= ?').all(UID, out[0], out[out.length - 1])) rows[r.day] = r;
        return out.map(day => {
            const r = rows[day] || {};
            return { day, vr: int(r.vr_min), breaks: int(r.breaks), longest: int(r.longest), steps: int(r.steps), hr: r.hr_n ? { avg: Math.round(r.hr_sum / r.hr_n), min: int(r.hr_min), max: int(r.hr_max) } : null };
        });
    }
    summary(n = 7, now = Date.now()) {
        n = [7, 30, 90].includes(int(n)) ? int(n) : 7;
        const days = this.days(n, now), played = days.filter(d => d.vr > 0), stepDays = days.filter(d => d.steps > 0), hrDays = days.filter(d => d.hr);
        const vr = days.reduce((s, d) => s + d.vr, 0), breaks = days.reduce((s, d) => s + d.breaks, 0);
        const t = {
            vr_total: vr, vr_avg: played.length ? Math.round(vr / played.length) : 0, play_days: played.length,
            breaks, breaks_per_h: vr ? Math.round(breaks / (vr / 60) * 10) / 10 : 0, longest: Math.max(0, ...days.map(d => d.longest)),
            steps_avg: avg(stepDays.map(d => d.steps)), steps_days: stepDays.length,
            hr_avg: avg(hrDays.map(d => d.hr.avg)), hr_rest: hrDays.length ? Math.min(...hrDays.map(d => d.hr.min)) : 0, hr_max: hrDays.length ? Math.max(...hrDays.map(d => d.hr.max)) : 0,
        };
        // Vergleich mit dem Zeitraum davor (gleich lang)
        const prev = this.days(n * 2, now).slice(0, n), pvr = prev.reduce((s, d) => s + d.vr, 0), pst = avg(prev.filter(d => d.steps > 0).map(d => d.steps));
        t.vr_trend = pvr ? Math.round((vr - pvr) / pvr * 100) : null;
        t.steps_trend = pst && t.steps_avg ? Math.round((t.steps_avg - pst) / pst * 100) : null;
        return { range: n, days, totals: t, tips: this.tips(t, days), today: days[days.length - 1] };
    }
    /** freundliche Hinweise (keine Diagnose) */
    tips(t, days) {
        const out = [];
        if (!t.play_days && !t.steps_days) return ['📭 Noch keine Daten – der Pausen-Coach zählt VR-Zeit und Pausen, die Nexus Watch liefert Puls und Schritte.'];
        if (t.vr_total >= 120 && t.breaks_per_h < 0.5) out.push('🌿 Im Schnitt weniger als eine Pause alle 2 Stunden – kurze Pausen tun Augen und Nacken gut.');
        if (t.breaks_per_h >= 1) out.push('✨ Gut gemacht: mindestens eine Pause pro Stunde VR.');
        if (t.longest >= 180) out.push('⏱ Längste Strecke ohne Pause: ' + Math.floor(t.longest / 60) + ' h ' + (t.longest % 60) + ' min.');
        if (t.steps_days && t.steps_avg < 3000) out.push('🚶 Wenig Schritte an den Tagen mit Uhr – ein kurzer Spaziergang zwischen zwei Sessions zählt schon.');
        if (t.steps_days && t.steps_avg >= 8000) out.push('🏃 Im Schnitt über 8000 Schritte – stark!');
        if (t.vr_trend !== null && t.vr_trend >= 50) out.push('📈 Deutlich mehr VR-Zeit als im Zeitraum davor (+' + t.vr_trend + ' %).');
        const late = days.slice(-3).filter(d => d.vr >= 360).length;
        if (late >= 2) out.push('😴 An mehreren der letzten Tage über 6 h in VR – genug Schlaf nicht vergessen.');
        if (!out.length) out.push('👍 Alles im grünen Bereich.');
        return out;
    }
    /** kurz für Uhr/Handy */
    today(now = Date.now()) { const d = this.days(1, now)[0]; return { vr: d.vr, breaks: d.breaks, steps: d.steps, hr: d.hr ? d.hr.avg : 0 }; }
    async action(act, input) {
        switch (act) {
            case 'health_summary': return this.summary(input.range);
            case 'health_csv': {
                const s = this.summary(input.range);
                return { csv: 'day;vr_min;breaks;longest_min;steps;hr_avg;hr_min;hr_max\n' + s.days.map(d => [d.day, d.vr, d.breaks, d.longest, d.steps, d.hr ? d.hr.avg : '', d.hr ? d.hr.min : '', d.hr ? d.hr.max : ''].join(';')).join('\n') + '\n' };
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Health };
