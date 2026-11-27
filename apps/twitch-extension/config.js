/* Einrichtung (nur für den Kanal selbst): Verbindungscode für VRC Nexus erzeugen und Status anzeigen. */
'use strict';
(function () {
    var st = document.getElementById('status'), box = document.getElementById('codeBox'), code = document.getElementById('code');
    function status() {
        NX.call('linked').then(function (d) {
            st.textContent = !d.linked ? 'Noch nicht verbunden.' : d.live ? '🟢 Verbunden – VRC Nexus schickt gerade Daten.' : '🟡 Verbunden – zuletzt Daten: ' + (d.updated ? new Date(d.updated * 1000).toLocaleString('de-DE') : 'noch nie');
        }).catch(function (e) { st.textContent = '⚠ ' + e.message; });
    }
    document.getElementById('gen').addEventListener('click', function () {
        if (box.hidden === false && !confirm('Neuen Code erzeugen? Der alte funktioniert dann nicht mehr.')) return;
        NX.call('link', {}).then(function (d) { code.value = d.code; box.hidden = false; st.textContent = d.msg; }).catch(function (e) { st.textContent = '⚠ ' + e.message; });
    });
    document.getElementById('copy').addEventListener('click', function () { code.select(); try { document.execCommand('copy'); } catch (e) { /* egal */ } });
    NX.onAuth(function () { status(); setInterval(status, 30000); });
})();
