/* VRC Nexus – Steckbrief im Community-Profil (3.1.1): für alle (Geschlecht, Orientierung, Beziehung) und 🔞 18+-Teil
 * (Rolle, Verhalten, Kontakte, Safer-Sex-Grundsatz, Gastgeber, Kinks mit „Erhalten“/„Geben“). Den 18+-Teil liefert der Server nur an
 * Verified 18+ mit NSFW an (und an die Person selbst). Gemeinsam genutzt vom Community-Profil und vom VRChat-Profil-Fenster. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, T = s => (window.t ? window.t(s) : s);
    const GENDERS = [['female', 'Weiblich'], ['male', 'Männlich'], ['trans_female', 'Trans-weiblich'], ['trans_male', 'Trans-männlich'], ['nonbinary', 'Nicht-binär']];
    const SETS = {
        orientation: ['Sexuelle Orientierung', [['', '– leer lassen –'], ['ace', 'Asexuell (Ace)'], ['hetero', 'Heterosexuell'], ['gay', 'Schwul'], ['bi', 'Bisexuell'], ['lesbian', 'Lesbisch'], ['pan', 'Pansexuell'], ['questioning', 'Questioning'], ['other', 'Andere']]],
        relationship: ['Beziehungsstatus', [['', '– leer lassen –'], ['single', 'Single'], ['taken', 'In einer Beziehung'], ['open', 'Offene Beziehung'], ['complicated', 'Es ist kompliziert'], ['married', 'Verheiratet']]],
        looking: ['Auf der Suche nach einem Partner', [['', '– leer lassen –'], ['yes', 'Ja'], ['no', 'Nein']]],
    };
    const NSETS = {
        position: ['Rolle', [['', '– leer lassen –'], ['top', 'Top'], ['vers_top', 'Vers Top'], ['versatile', 'Versatile'], ['vers_bottom', 'Vers Bottom'], ['bottom', 'Bottom'], ['side', 'Side']]],
        behavior: ['Verhalten', [['', '– leer lassen –'], ['dominant', 'Dominant'], ['submissive', 'Devot'], ['switch', 'Switch'], ['versatile', 'Vielseitig']]],
        open_contact: ['Offen für sexuelle Kontakte', [['', '– leer lassen –'], ['yes', 'Ja'], ['no', 'Nein'], ['ask', 'Frag mich']]],
        safer: ['Safer-Sex-Grundsatz', [['', '– leer lassen –'], ['always', 'Immer'], ['sometimes', 'Manchmal'], ['never', 'Nie'], ['talk', 'Lass uns reden']]],
    };
    const VIS = { visibility: ['Wer sieht mein 18+-Profil?', [['', 'Alle mit Verified 18+ und NSFW an'], ['hidden', 'Nur ich']]] };
    /* Kink-Liste: Schlüssel → Bezeichnung (die Bezeichnungen bleiben bewusst Englisch – so kennt man sie in der Community) */
    const KINKS = [
        ['Allgemein', [['condoms', 'Condoms'], ['feet', 'Feet'], ['foreplay', 'Foreplay'], ['inflatables', 'Inflatables'], ['toys', 'Sex Toys'], ['sweat', 'Sweat'], ['teasing', 'Teasing'], ['tickling', 'Tickling']]],
        ['Anal', [['anal', 'Anal Penetration'], ['double_pen', 'Double Penetration'], ['fingering_a', 'Fingering'], ['fisting', 'Fisting'], ['rimming', 'Rimming']]],
        ['Oral', [['oral_blow', 'Blowjobs'], ['oral_cunni', 'Cunnilingus'], ['facefucking', 'Facefucking'], ['facesitting', 'Facesitting'], ['fingers_mouth', 'Fingers in Mouth'], ['kissing', 'Kissing'], ['licking', 'Licking']]],
        ['Körper', [['body_hair', 'Body Hair'], ['cut', 'Cut'], ['piercings', 'Piercings'], ['pubic_hair', 'Pubic Hair'], ['uncut', 'Uncut']]],
        ['Cum Related', [['breeding', 'Breeding'], ['bukkake', 'Bukkake'], ['creampie', 'Creampie'], ['cum_marking', 'Cum Marking'], ['sloppy_seconds', 'Sloppy Seconds'], ['swallowing', 'Swallowing']]],
        ['BDSM', [['blindfolds', 'Blindfolds'], ['bondage', 'Bondage'], ['estim', 'E-Stim'], ['gags', 'Gags'], ['immobilization', 'Immobilization'], ['leash_collar', 'Leash / Collar'], ['orgasm_control', 'Orgasm Control / Denial'], ['sensory_dep', 'Sensory Deprivation'], ['whipping', 'Whipping']]],
        ['Dom / Sub', [['chastity', 'Chastity'], ['cnc', 'Consensual non-consent'], ['forced_nudity', 'Forced Nudity'], ['humiliation', 'Humiliation'], ['master_pet', 'Master / Pet'], ['master_slave', 'Master / Slave'], ['public_humil', 'Public Humiliation']]],
        ['Cock Play', [['cock_slapping', 'Cock Slapping'], ['docking', 'Docking'], ['frotting', 'Frotting'], ['ball_licking', 'Licking Balls'], ['sheath_play', 'Sheath Play'], ['sounding', 'Sounding']]],
        ['Themen & Settings', [['competition', 'Competition'], ['dating', 'Dating'], ['exhibitionism', 'Exhibitionism'], ['group', 'Group Sex'], ['hypnosis', 'Hypnosis'], ['inexperienced', 'Inexperienced Partners'], ['public', 'Public Sex'], ['vanilla', 'Vanilla Sex'], ['videotaping', 'Videotaping'], ['virgins', 'Virgins'], ['voyeurism', 'Voyeurism'], ['wet_messy', 'Wet & Messy'], ['wrestling', 'Wrestling']]],
        ['Outfits', [['crossdressing', 'Crossdressing'], ['diapers', 'Diapers'], ['femboy', 'Femboy'], ['leather', 'Leather'], ['muzzles', 'Muzzles'], ['puppy_gear', 'Puppy Gear'], ['rubber', 'Rubber'], ['underwear', 'Underwear'], ['uniforms', 'Uniforms']]],
        ['Vaginal', [['vag_double', 'Double Penetration'], ['fingering_v', 'Fingering'], ['scissoring', 'Scissoring'], ['squirting', 'Squirting'], ['vaginal', 'Vaginal Penetration']]],
        ['Roughness', [['biting', 'Biting'], ['breath_control', 'Breath Control'], ['choking', 'Choking'], ['hair_pulling', 'Hair Pulling'], ['scratching', 'Scratching'], ['spanking', 'Spanking']]],
        ['Bodily Fluids', [['bathroom_control', 'Bathroom Control'], ['farting', 'Farting'], ['scat', 'Scat'], ['watersports', 'Watersports'], ['wetting', 'Wetting']]],
    ];
    /* Bewertung: 2 = liebe ich, 1 = mag ich, 0 = vielleicht, -1 = nein, null = nicht angegeben */
    const RATE = { 2: ['♥', 'liebe ich', 'r-love'], 1: ['👍', 'mag ich', 'r-like'], 0: ['〜', 'vielleicht', 'r-maybe'], '-1': ['👎', 'nein', 'r-no'] };
    const NEXT = { null: 2, 2: 1, 1: 0, 0: -1, '-1': null };
    const rate = v => v === null || v === undefined ? '<span class="p18-r r-none" title="' + esc(T('nicht angegeben')) + '">·</span>' : '<span class="p18-r ' + RATE[v][2] + '" title="' + esc(T(RATE[v][1])) + '">' + RATE[v][0] + '</span>';
    const label = (sets, k, v) => { const o = (sets[k][1].find(x => x[0] === v) || [])[1]; return o ? T(o) : ''; };
    const sel = (name, sets, k, v) => '<label class="p18-f"><span>' + esc(T(sets[k][0])) + '</span><select name="' + name + '">' + sets[k][1].map(([val, l]) => '<option value="' + esc(val) + '"' + (val === (v || '') ? ' selected' : '') + '>' + esc(T(l)) + '</option>').join('') + '</select></label>';

    /** Steckbrief für alle – Anzeige */
    function factsView(f) {
        f = f || {};
        const g = (f.gender || []).map(x => T((GENDERS.find(y => y[0] === x) || [])[1] || '')).filter(Boolean).concat(f.gender_other ? [f.gender_other] : []);
        const rows = [['⚧', 'Geschlecht', g.join(' / ')], ['🌈', 'Sexuelle Orientierung', f.orientation ? label(SETS, 'orientation', f.orientation) : ''],
            ['💜', 'Beziehungsstatus', f.relationship ? label(SETS, 'relationship', f.relationship) : ''], ['💞', 'Auf der Suche nach einem Partner', f.looking ? label(SETS, 'looking', f.looking) : '']].filter(r => r[2]);
        return rows.length ? '<div class="p18-facts">' + rows.map(r => '<div><i>' + r[0] + '</i><span>' + esc(T(r[1])) + '</span><b>' + esc(r[2]) + '</b></div>').join('') + '</div>' : '';
    }
    /** Steckbrief für alle – Formularteil (im Profil-Formular) */
    function factsForm(f) {
        f = f || {};
        return '<fieldset class="p18-box"><legend>' + esc(T('Steckbrief')) + '</legend><div class="p18-f"><span>' + esc(T('Geschlecht')) + '</span><div class="p18-checks">'
            + GENDERS.map(([k, l]) => '<label class="check"><input type="checkbox" name="pf_gender" value="' + k + '"' + ((f.gender || []).includes(k) ? ' checked' : '') + '> ' + esc(T(l)) + '</label>').join('')
            + '</div><input type="text" name="pf_gender_other" maxlength="40" placeholder="' + esc(T('Anderes Geschlecht')) + '" value="' + esc(f.gender_other || '') + '"></div>'
            + sel('pf_orientation', SETS, 'orientation', f.orientation) + sel('pf_relationship', SETS, 'relationship', f.relationship) + sel('pf_looking', SETS, 'looking', f.looking) + '</fieldset>';
    }
    function readFacts(form) {
        const v = n => form.elements[n] ? form.elements[n].value : '';
        return { gender: [...form.querySelectorAll('[name=pf_gender]:checked')].map(x => x.value), gender_other: v('pf_gender_other'), orientation: v('pf_orientation'), relationship: v('pf_relationship'), looking: v('pf_looking') };
    }
    /** 5.1: NSFW-Avatare und -Welten im 18+-Profil (aus der eigenen Sammlung, Bilder öffnet der Dialog) */
    function items(nf) {
        const av = nf.avatars || [], wo = nf.worlds || [];
        const row = (list, icon, attr) => list.map(x => '<button type="button" class="chip p18-item" ' + attr + '="' + esc(x.id) + '" title="' + esc(x.note || '') + '">' + icon + ' ' + esc(x.name || x.id) + '</button>').join('');
        return (av.length ? '<div class="p18-items"><b>🎭 ' + esc(T('NSFW-Avatare')) + '</b><div class="chips">' + row(av, '🎭', 'data-p18av') + '</div></div>' : '')
            + (wo.length ? '<div class="p18-items"><b>🌍 ' + esc(T('NSFW-Welten')) + '</b><div class="chips">' + row(wo, '🌍', 'data-world') + '</div></div>' : '');
    }
    /** 🔞 18+-Teil – Anzeige (nur gesetzte Kinks, nach Bereich) */
    function nsfwView(nf, bio) {
        nf = nf || {};
        const rows = Object.keys(NSETS).map(k => nf[k] ? [NSETS[k][0], label(NSETS, k, nf[k])] : null).filter(Boolean);
        if (nf.can_host) rows.push(['Kann Gastgeber sein', T('🏡 Du kannst mich besuchen')]);
        if (nf.visibility === 'hidden') rows.unshift(['Wer sieht mein 18+-Profil?', '🔒 ' + T('Nur ich')]);
        const kk = nf.kinks || {};
        const cats = KINKS.map(([cat, list]) => [cat, list.filter(([k]) => kk[k])]).filter(c => c[1].length);
        return (bio ? '<p class="p18-bio">' + esc(bio).replace(/\n/g, '<br>') + '</p>' : '')
            + (rows.length ? '<div class="p18-facts">' + rows.map(r => '<div><i>🔥</i><span>' + esc(T(r[0])) + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' : '')
            + (cats.length ? '<div class="p18-legend small muted">' + esc(T('Erhalten')) + ' · ' + esc(T('Geben')) + ' — ♥ ' + esc(T('liebe ich')) + ' · 👍 ' + esc(T('mag ich')) + ' · 〜 ' + esc(T('vielleicht')) + ' · 👎 ' + esc(T('nein')) + '</div>'
                + cats.map(([cat, list]) => '<details class="p18-cat" open><summary>' + esc(T(cat)) + ' <small>' + list.length + '</small></summary>' + list.map(([k, l]) => '<div class="p18-k"><span>' + esc(l) + '</span>' + rate(kk[k][0]) + rate(kk[k][1]) + '</div>').join('') + '</details>').join('') : '')
            + items(nf)
            + (!bio && !rows.length && !cats.length && !(nf.avatars || []).length && !(nf.worlds || []).length ? '<p class="vx-empty">' + esc(T('Noch nichts angegeben.')) + '</p>' : '');
    }
    /** 🔞 18+-Teil – Bearbeiten (Kinks: antippen wechselt ♥ → 👍 → 〜 → 👎 → leer) */
    function nsfwEditor(nf, bio) {
        nf = nf || {};
        const kk = nf.kinks || {};
        const cell = (k, i) => { const v = kk[k] ? kk[k][i] : null; return '<button type="button" class="p18-rb" data-p18k="' + k + '" data-p18i="' + i + '" data-v="' + (v === null || v === undefined ? '' : v) + '">' + rate(v) + '</button>'; };
        return '<form class="p18-edit"><textarea name="nsfw_bio" rows="3" maxlength="1000" placeholder="🔞 ' + esc(T('18+-Profilteil (nur für Verified 18+ mit NSFW an sichtbar)')) + '">' + esc(bio || '') + '</textarea>'
            + '<fieldset class="p18-box"><legend>After Dark</legend>' + sel('nf_visibility', VIS, 'visibility', nf.visibility) + Object.keys(NSETS).map(k => sel('nf_' + k, NSETS, k, nf[k])).join('')
            + '<label class="check"><input type="checkbox" name="nf_can_host"' + (nf.can_host ? ' checked' : '') + '> 🏡 ' + esc(T('Kann Gastgeber sein')) + '</label></fieldset>'
            + '<p class="small muted">' + esc(T('Antippen wechselt: ♥ liebe ich → 👍 mag ich → 〜 vielleicht → 👎 nein → leer.')) + '</p>'
            + KINKS.map(([cat, list]) => '<details class="p18-cat"><summary>' + esc(T(cat)) + '</summary><div class="p18-k p18-kh"><span></span><b>' + esc(T('Erhalten')) + '</b><b>' + esc(T('Geben')) + '</b></div>'
                + list.map(([k, l]) => '<div class="p18-k"><span>' + esc(l) + '</span>' + cell(k, 0) + cell(k, 1) + '</div>').join('') + '</details>').join('')
            + '<div class="nc-row"><button class="btn btn-sm btn-gold" style="margin-left:auto">' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-p18cancel="1">' + esc(T('Abbrechen')) + '</button></div></form>';
    }
    function readNsfw(form) {
        const v = n => form.elements[n] ? form.elements[n].value : '';
        const out = { visibility: v('nf_visibility'), position: v('nf_position'), behavior: v('nf_behavior'), open_contact: v('nf_open_contact'), safer: v('nf_safer'), can_host: !!(form.elements.nf_can_host && form.elements.nf_can_host.checked), kinks: {} };
        form.querySelectorAll('[data-p18k]').forEach(b => {
            const k = b.dataset.p18k, i = +b.dataset.p18i, val = b.dataset.v === '' ? null : +b.dataset.v;
            if (val === null) return;
            (out.kinks[k] = out.kinks[k] || [null, null])[i] = val;
        });
        return out;
    }
    document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-p18av]'); if (a && UI.openAvatar) { e.preventDefault(); UI.openAvatar(a.dataset.p18av); } });
    // Antippen im Editor: Bewertung weiterschalten
    document.addEventListener('click', e => {
        const b = e.target.closest('.p18-rb');
        if (!b) return;
        const cur = b.dataset.v === '' ? null : +b.dataset.v, nx = NEXT[cur === null ? 'null' : cur];
        b.dataset.v = nx === null ? '' : nx;
        b.innerHTML = rate(nx);
    });
    const hasNsfw = nf => !!(nf && (Object.keys(nf.kinks || {}).length || Object.keys(NSETS).some(k => nf[k]) || nf.can_host));
    window.NexusProfile18 = { factsView, factsForm, readFacts, nsfwView, nsfwEditor, readNsfw, hasNsfw, KINKS };
})();
