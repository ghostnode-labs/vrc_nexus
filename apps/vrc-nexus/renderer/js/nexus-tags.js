/* VRC Nexus – 🏷 Tags (8.4): Anzeige der Rollen und optischen Tags aus signierten NXK1-Schlüsseln.
 * Nur Darstellung – Rechte entscheidet allein das Backend (Rolle „mod“), optische Tags geben nie Rechte.
 * „owner“ kommt nur vom Owner-Lock (nie aus einem Schlüssel) und ist nicht vergebbar. */
(function () {
    const T = s => (window.t ? window.t(s) : s);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // Schlüssel → [Icon, Name, Farbe, Art] – Art: role = Rolle (mod gibt Moderator-Rechte), look = rein optisch
    const META = {
        owner: ['👑', 'Besitzerin', '#f3c262', 'owner'],
        supporter: ['💖', 'Supporter', '#ff6b9d', 'role'],
        mod: ['🛡', 'Moderator', '#38d5e6', 'role'],
        creator: ['🎨', 'Creator', '#a78bfa', 'role'],
        beta: ['🧪', 'Beta-Tester', '#4ade80', 'role'],
        vip: ['⭐', 'VIP', '#f5c242', 'look'],
        partner: ['🤝', 'Partner', '#60a5fa', 'look'],
        event: ['🎉', 'Event-Team', '#fb923c', 'look'],
        artist: ['🖌', 'Künstler:in', '#f472b6', 'look'],
    };
    /** vergebbar im Admin – „owner“ bewusst NICHT */
    const ISSUABLE = ['supporter', 'mod', 'creator', 'beta', 'vip', 'partner', 'event', 'artist'];
    const name = k => (META[k] ? T(META[k][1]) : k);
    function chip(k, extra) {
        const m = META[k];
        if (!m) return '';
        return '<span class="vx-pill nx-tag" style="--pc:' + m[2] + '"' + (extra || '') + '>' + m[0] + ' ' + esc(T(m[1])) + '</span>';
    }
    const chips = list => [...new Set(list || [])].filter(k => META[k]).map(k => chip(k)).join('');
    window.NexusTags = { META, ISSUABLE, chip, chips, name };
})();
