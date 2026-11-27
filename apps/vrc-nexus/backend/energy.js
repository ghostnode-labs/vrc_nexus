'use strict';
/*
 * 8.0.1: 🔋 Energie-Modus für Laptops, Steam Deck und Akku.
 *   aus / automatisch (bei Akkubetrieb) / immer an.
 *   Wirkt als Drossel: Hintergrund-Takte, die nichts mit Sicherheit zu tun haben (Automatik, Dashboard, Komfort, Auswertungen,
 *   Uhr-Abgleich, Stream-Beobachtung …), laufen nur noch alle N-mal so selten. In der Oberfläche: weniger Animationen.
 *   NIE gedrosselt: Spielzeug, Panik, Safeword, Puls, OSC-Empfang, Spiel-Log-Ereignisse, Check-in.
 */
const { str, int, UserError } = require('./util');

const DEF = { mode: 'auto', factor: 3, ui_eco: true };

class Energy {
    constructor(app) { this.app = app; this.last = {}; this.skipped = 0; }
    cfg() { let c = {}; try { c = JSON.parse(this.app.db.setting('energy_cfg', '{}')) || {}; } catch (e) { c = {}; } return Object.assign({}, DEF, c); }
    saveCfg(input) {
        const c = { mode: ['off', 'auto', 'on'].includes(str(input.mode)) ? str(input.mode) : 'auto', factor: Math.max(2, Math.min(6, int(input.factor) || 3)),
            ui_eco: input.ui_eco === true || ['1', 'true', 'on'].includes(str(input.ui_eco)) };
        this.app.db.setSetting('energy_cfg', JSON.stringify(c));
        return c;
    }
    battery() { const h = this.app.tools && this.app.tools.host; try { return !!(h && h.onBattery && h.onBattery()); } catch (e) { return false; } }
    active() { const c = this.cfg(); return c.mode === 'on' || (c.mode === 'auto' && this.battery()); }
    /**
     * Soll ein Takt jetzt ausfallen? key = Name des Takts, base = sein normaler Abstand.
     * Ohne Energie-Modus nie; mit Energie-Modus nur jeder N-te (N = factor).
     */
    skip(key, base, now = Date.now()) {
        if (!this.active()) return false;
        const f = this.cfg().factor, last = this.last[key] || 0;
        if (now - last < base * f - Math.min(500, base / 2)) { this.skipped++; return true; }
        this.last[key] = now;
        return false;
    }
    status() { const c = this.cfg(); return { cfg: c, active: this.active(), battery: this.battery(), skipped: this.skipped, supported: !!(this.app.tools && this.app.tools.host && this.app.tools.host.onBattery) }; }
    async action(act, input) {
        switch (act) {
            case 'energy_status': return this.status();
            case 'energy_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: '🔋 Gespeichert.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Energy, DEF };
