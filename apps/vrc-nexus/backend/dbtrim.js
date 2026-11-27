'use strict';
/*
 * 7.3.1: Datenbank auf dem Handy klein halten.
 * Am Handy liegt die ganze SQLite-Datei im Speicher (sql.js) und wird bei jeder Sicherung komplett kopiert.
 * Wächst sie über Monate (Freunde-Verlauf, Messwerte, Zwischenspeicher), friert die App beim Start und alle paar Sekunden ein.
 * Lösung: Verläufe am Handy kürzer halten und die Datei danach verkleinern (VACUUM).
 */
const DAY = 86400;
const PHONE = { feed: 30, stats: 60, notifs: 60, cache: 7, history: 90 };
const BIG = 8 * 1024 * 1024;   // ab 8 MB beim Start aufräumen

function trimForPhone(db, opts) {
    const o = Object.assign({ now: Math.floor(Date.now() / 1000), vacuum: true }, opts || {});
    const days = Object.assign({}, PHONE, o.days || {});
    const cut = d => o.now - d * DAY;
    const del = (sql, ...a) => { try { return db.prepare(sql).run(...a).changes || 0; } catch (e) { return 0; } };
    const out = {
        feed: del('DELETE FROM feed WHERE ts < ?', cut(days.feed)),
        gamelog: del('DELETE FROM game_log WHERE ts < ?', cut(days.feed)),
        stats: del('DELETE FROM stats WHERE ts < ?', cut(days.stats)) + del('DELETE FROM global_stats WHERE ts < ?', cut(days.stats)),
        notifs: del('DELETE FROM notif_log WHERE active = 0 AND created < ?', cut(days.notifs)),
        cache: del('DELETE FROM user_cache WHERE fetched < ?', cut(days.cache)) + del('DELETE FROM mutual_cache WHERE fetched < ?', cut(days.cache)),
        history: del('DELETE FROM vrc_history WHERE ts < ?', cut(days.history)),
        osc: del('DELETE FROM osc_queue WHERE created < ?', cut(7)),
    };
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    if (o.vacuum && (total || o.force)) { try { db.exec('VACUUM'); } catch (e) { /* egal */ } }
    return { removed: out, total };
}
module.exports = { trimForPhone, PHONE, BIG };
