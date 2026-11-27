/* VRC Nexus Twitch-Erweiterung – gemeinsame Helfer. Alle Texte werden nur als Text eingesetzt (nie als HTML). */
'use strict';
var NX = (function () {
    var EBS = 'https://ghostnode-labs.dev/twitchext.php';
    var token = '';
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
    function call(action, body) {
        var opt = { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token } };
        if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        return fetch(EBS + '?a=' + action, opt).then(function (r) { return r.json().then(function (d) { if (!r.ok || d.error) throw new Error(d.error || ('Fehler ' + r.status)); return d; }); });
    }
    function onAuth(cb) {
        if (!window.Twitch || !window.Twitch.ext) return;
        window.Twitch.ext.onAuthorized(function (auth) { token = auth.token; cb(auth); });
    }
    function fmtTime(since) { var s = Math.max(0, Math.floor(Date.now() / 1000 - since)); return Math.floor(s / 3600) + ':' + ('0' + Math.floor(s / 60) % 60).slice(-2) + ' h'; }
    return { el: el, call: call, onAuth: onAuth, fmtTime: fmtTime };
})();
