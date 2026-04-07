/**
 * MRP DB Config — gestione profili connessione database.
 * Badge sempre visibile nell'header + modale configurazione.
 */
const MrpDbConfig = (() => {
    const API = '/api/mrp/db';

    async function init() {
        await refreshBadge();
        bindEvents();
    }

    // --------------------------------------------------------
    // BADGE
    // --------------------------------------------------------

    async function refreshBadge() {
        try {
            const res = await fetch(API + '/active-profile');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const profile = await res.json();

            document.getElementById('dbBadgeDot').style.background = profile.color || '#16a34a';
            document.getElementById('dbBadgeLabel').textContent = profile.label || profile.id;
            document.getElementById('dbBadgeServer').textContent = profile.server + ' / ' + profile.database_ujet11;

            const header = document.querySelector('.mrp-header');
            header.style.borderBottomColor = profile.color || 'var(--border)';
            header.style.borderBottomWidth = '3px';

            // Aggiorna banner ambiente
            aggiornaAmbienteBanner(profile);
        } catch (err) {
            console.error('[DbConfig] Errore refresh badge:', err);
            document.getElementById('dbBadgeDot').style.background = '#e11d48';
            document.getElementById('dbBadgeLabel').textContent = 'ERRORE';
            document.getElementById('dbBadgeServer').textContent = 'connessione non disponibile';
        }
    }

    function aggiornaAmbienteBanner(profile) {
        const banner = document.getElementById('ambienteBanner');
        if (!banner) return;

        const ambiente = profile.ambiente || 'produzione';

        // Rendi accessibile globalmente per gli altri moduli
        window.MrpAmbiente = {
            ambiente: ambiente,
            email_prova: profile.email_prova || ''
        };

        if (ambiente === 'prova') {
            const email = profile.email_prova || '';
            banner.style.display = 'block';
            banner.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
            banner.style.color = 'white';
            banner.style.textAlign = 'center';
            banner.style.padding = '8px 16px';
            banner.style.fontWeight = '700';
            banner.style.fontSize = '0.85rem';
            banner.style.letterSpacing = '0.5px';
            banner.style.zIndex = '100';
            if (email) {
                banner.innerHTML = '\uD83D\uDD27 AMBIENTE DI PROVA \u2014 Le email vengono inviate a <strong>' + esc(email) + '</strong> invece che ai fornitori';
            } else {
                banner.innerHTML = '\uD83D\uDD27 AMBIENTE DI PROVA \u2014 <span style="background:rgba(255,255,255,0.25); padding:2px 8px; border-radius:4px;">\u26A0\uFE0F Email di prova non configurata</span>';
            }
        } else {
            banner.style.display = 'block';
            banner.style.background = '#fee2e2';
            banner.style.color = '#991b1b';
            banner.style.textAlign = 'center';
            banner.style.padding = '5px 16px';
            banner.style.fontWeight = '600';
            banner.style.fontSize = '0.78rem';
            banner.style.zIndex = '100';
            banner.innerHTML = '\u26A1 PRODUZIONE';
        }
    }

    // --------------------------------------------------------
    // MODALE
    // --------------------------------------------------------

    function openModal() {
        document.getElementById('modalDbOverlay').classList.add('open');
        loadProfilesList();
        resetForm();
        loadSmtpForm();
    }

    function closeModal() {
        document.getElementById('modalDbOverlay').classList.remove('open');
    }

    async function loadProfilesList() {
        try {
            const [profilesRes, activeRes] = await Promise.all([
                fetch(API + '/profiles'),
                fetch(API + '/active-profile')
            ]);
            const profiles = await profilesRes.json();
            const active = await activeRes.json();
            const container = document.getElementById('dbProfilesList');

            container.innerHTML = profiles.map(p => {
                const isActive = p.id === active.id;
                return `
                <div style="display:flex; align-items:center; gap:12px; padding:10px 14px;
                    border:1px solid ${isActive ? (p.color || 'var(--primary)') : 'var(--border)'};
                    border-left:4px solid ${p.color || '#999'};
                    border-radius:var(--radius-sm); margin-bottom:8px;
                    background:${isActive ? 'var(--primary-light)' : 'white'};">
                    <div style="flex:1;">
                        <strong style="color:${p.color || 'var(--text)'};">${esc(p.label)}</strong>
                        <span style="font-size:0.8rem; color:var(--text-muted); margin-left:8px;">
                            ${esc(p.server)} / ${esc(p.database_ujet11)}
                        </span>
                        ${p.ambiente === 'prova'
                            ? '<span style="font-size:0.7rem; background:#f59e0b; color:white; padding:2px 8px; border-radius:10px; margin-left:6px;">PROVA</span>'
                            : '<span style="font-size:0.7rem; background:#dc2626; color:white; padding:2px 8px; border-radius:10px; margin-left:6px;">PRODUZIONE</span>'
                        }
                        ${isActive ? '<span style="font-size:0.75rem; background:#16a34a; color:white; padding:2px 8px; border-radius:10px; margin-left:4px;">ATTIVO</span>' : ''}
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${!isActive ? `<button class="mrp-btn-primary" style="font-size:0.75rem; padding:4px 10px;" onclick="MrpDbConfig.switchTo('${esc(p.id)}')">Attiva</button>` : ''}
                        <button class="mrp-btn-secondary" style="font-size:0.75rem; padding:4px 10px;" onclick="MrpDbConfig.editProfile('${esc(p.id)}')">&#9998;</button>
                        ${!isActive ? `<button class="mrp-btn-secondary" style="font-size:0.75rem; padding:4px 10px; color:var(--danger);" onclick="MrpDbConfig.removeProfile('${esc(p.id)}')">&#128465;</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('[DbConfig] Errore caricamento profili:', err);
        }
    }

    async function switchTo(profileId) {
        // Recupera info profilo target per doppia conferma su produzione
        let targetAmbiente = 'prova';
        try {
            const profRes = await fetch(API + '/profiles');
            const profili = await profRes.json();
            const target = profili.find(p => p.id === profileId);
            if (target) targetAmbiente = target.ambiente || 'produzione';
        } catch (_) {}

        if (targetAmbiente === 'produzione') {
            if (!confirm('\u26A0\uFE0F Stai per passare all\'ambiente di PRODUZIONE.\nGli ordini emessi saranno REALI e le email arriveranno ai FORNITORI.\n\nContinuare?')) return;
            if (!confirm('\u26A1 CONFERMA DEFINITIVA:\nSei SICURO di voler operare in PRODUZIONE?')) return;
        } else {
            if (!confirm('Switchare al profilo "' + profileId + '"?\nI dati attualmente visualizzati verranno cancellati.')) return;
        }
        try {
            const res = await fetch(API + '/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId })
            });
            const data = await res.json();
            if (data.success) {
                await refreshBadge();
                await loadProfilesList();

                // Pulisci i dati della vista progressivi (erano del DB precedente)
                const tbody = document.getElementById('tblProgressiviBody');
                if (tbody) tbody.innerHTML = '';
                const splitTree = document.getElementById('splitTreeBody');
                if (splitTree) splitTree.innerHTML = '';

                // Reinizializza la proposta ordini
                if (typeof MrpProposta !== 'undefined' && MrpProposta.init) MrpProposta.init();

                showFormStatus('&#10003; Profilo attivato: ' + data.activeProfile.label, 'var(--success)');
            } else {
                showFormStatus('Errore: ' + (data.error || 'sconosciuto'), 'var(--danger)');
            }
        } catch (err) {
            showFormStatus('Errore di rete: ' + err.message, 'var(--danger)');
        }
    }

    async function editProfile(profileId) {
        try {
            const res = await fetch(API + '/profiles');
            const profiles = await res.json();
            const p = profiles.find(x => x.id === profileId);
            if (!p) return;

            document.getElementById('dbFormEditId').value = p.id;
            document.getElementById('dbFormId').value = p.id;
            document.getElementById('dbFormId').disabled = true;
            document.getElementById('dbFormLabel').value = p.label;
            document.getElementById('dbFormServer').value = p.server;
            document.getElementById('dbFormUjet11').value = p.database_ujet11;
            document.getElementById('dbFormMrp').value = p.database_mrp || '';
            document.getElementById('dbFormUser').value = p.user || '';
            document.getElementById('dbFormPassword').value = '';
            document.getElementById('dbFormColor').value = p.color || '#16a34a';
            document.getElementById('dbFormAmbiente').value = p.ambiente || 'prova';
            document.getElementById('dbFormEmailProva').value = p.email_prova || '';
            toggleEmailProvaVisibility();
            document.getElementById('dbFormTitle').textContent = 'Modifica profilo: ' + p.label;
            document.getElementById('btnDbCancelEdit').style.display = '';
        } catch (err) {
            console.error('[DbConfig] editProfile error:', err);
        }
    }

    function resetForm() {
        document.getElementById('dbFormEditId').value = '';
        document.getElementById('dbFormId').value = '';
        document.getElementById('dbFormId').disabled = false;
        document.getElementById('dbFormLabel').value = '';
        document.getElementById('dbFormServer').value = '';
        document.getElementById('dbFormUjet11').value = '';
        document.getElementById('dbFormMrp').value = '';
        document.getElementById('dbFormUser').value = '';
        document.getElementById('dbFormPassword').value = '';
        document.getElementById('dbFormColor').value = '#16a34a';
        document.getElementById('dbFormAmbiente').value = 'prova';
        document.getElementById('dbFormEmailProva').value = '';
        toggleEmailProvaVisibility();
        document.getElementById('dbFormTitle').textContent = 'Nuovo profilo';
        document.getElementById('btnDbCancelEdit').style.display = 'none';
        document.getElementById('dbFormStatus').textContent = '';
    }

    async function saveProfile() {
        const editId = document.getElementById('dbFormEditId').value;
        const profileData = {
            id: document.getElementById('dbFormId').value.trim().toLowerCase().replace(/\s+/g, '_'),
            label: document.getElementById('dbFormLabel').value.trim().toUpperCase(),
            server: document.getElementById('dbFormServer').value.trim(),
            database_ujet11: document.getElementById('dbFormUjet11').value.trim(),
            database_mrp: document.getElementById('dbFormMrp').value.trim(),
            user: document.getElementById('dbFormUser').value.trim(),
            password: document.getElementById('dbFormPassword').value,
            color: document.getElementById('dbFormColor').value,
            ambiente: document.getElementById('dbFormAmbiente').value,
            email_prova: document.getElementById('dbFormEmailProva').value.trim()
        };

        if (!profileData.id || !profileData.label || !profileData.server || !profileData.database_ujet11) {
            showFormStatus('Compila almeno ID, Etichetta, Server e DB UJET11', 'var(--warning)');
            return;
        }

        try {
            let res;
            if (editId) {
                // Se password vuota in modifica, non inviarla (mantiene quella esistente)
                if (!profileData.password) delete profileData.password;
                res = await fetch(API + '/profiles/' + editId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profileData)
                });
            } else {
                if (!profileData.password) {
                    showFormStatus('La password è obbligatoria per un nuovo profilo', 'var(--warning)');
                    return;
                }
                res = await fetch(API + '/profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profileData)
                });
            }
            const data = await res.json();
            if (data.success) {
                showFormStatus('Profilo salvato', 'var(--success)');
                resetForm();
                await loadProfilesList();
                await refreshBadge();
            } else {
                showFormStatus(data.error || 'Errore', 'var(--danger)');
            }
        } catch (err) {
            showFormStatus(err.message, 'var(--danger)');
        }
    }

    async function removeProfile(profileId) {
        if (!confirm('Eliminare il profilo "' + profileId + '"?')) return;
        try {
            const res = await fetch(API + '/profiles/' + profileId, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                await loadProfilesList();
            } else {
                alert('Errore: ' + (data.error || 'sconosciuto'));
            }
        } catch (err) {
            alert('Errore: ' + err.message);
        }
    }

    async function testConnection() {
        showFormStatus('Test connessione in corso...', 'var(--warning)');
        try {
            const editId = document.getElementById('dbFormEditId').value;
            const password = document.getElementById('dbFormPassword').value;

            // Se in edit mode e password vuota, manda il profileId
            // così il backend usa le credenziali salvate
            const payload = {
                server: document.getElementById('dbFormServer').value.trim(),
                database_ujet11: document.getElementById('dbFormUjet11').value.trim(),
                user: document.getElementById('dbFormUser').value.trim(),
                password
            };
            if (editId && !password) {
                payload.profileId = editId;
                delete payload.password;
            }

            const res = await fetch(API + '/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showFormStatus(data.message, 'var(--success)');
            } else {
                showFormStatus(data.message, 'var(--danger)');
            }
        } catch (err) {
            showFormStatus(err.message, 'var(--danger)');
        }
    }

    function showFormStatus(msg, color) {
        const el = document.getElementById('dbFormStatus');
        el.textContent = msg;
        el.style.color = color || 'var(--text)';
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    function toggleEmailProvaVisibility() {
        const ambiente = document.getElementById('dbFormAmbiente').value;
        const wrap = document.getElementById('dbFormEmailProvaWrap');
        if (wrap) {
            wrap.style.display = ambiente === 'prova' ? '' : 'none';
        }
    }

    // --------------------------------------------------------
    // SMTP (legato al profilo DB attivo)
    // --------------------------------------------------------

    async function loadSmtpForm() {
        try {
            const res = await fetch(API + '/active-profile');
            const profile = await res.json();
            const label = document.getElementById('smtpCurrentProfile');
            if (label) label.innerHTML = 'Profilo attivo: <strong>' + esc(profile.label || profile.id) + '</strong>';

            document.getElementById('smtpFormHost').value = profile.smtp_host || '';
            document.getElementById('smtpFormPort').value = profile.smtp_port || 587;
            document.getElementById('smtpFormSecure').checked = profile.smtp_secure === true;
            document.getElementById('smtpFormUser').value = profile.smtp_user || '';
            document.getElementById('smtpFormPassword').value = '';  // mai pre-compilare password
            document.getElementById('smtpFormFromAddress').value = profile.smtp_from_address || '';
            document.getElementById('smtpFormFromName').value = profile.smtp_from_name || 'U.Jet s.r.l.';
        } catch (err) {
            console.error('[SMTP] Errore caricamento:', err);
        }
    }

    async function saveSmtp() {
        const statusEl = document.getElementById('smtpFormStatus');
        try {
            // Leggi il profilo attivo per sapere quale aggiornare
            const activeRes = await fetch(API + '/active-profile');
            const active = await activeRes.json();

            const smtpData = {
                smtp_host: document.getElementById('smtpFormHost').value.trim(),
                smtp_port: parseInt(document.getElementById('smtpFormPort').value, 10) || 587,
                smtp_secure: document.getElementById('smtpFormSecure').checked,
                smtp_user: document.getElementById('smtpFormUser').value.trim(),
                smtp_from_address: document.getElementById('smtpFormFromAddress').value.trim(),
                smtp_from_name: document.getElementById('smtpFormFromName').value.trim() || 'U.Jet s.r.l.'
            };

            const pwd = document.getElementById('smtpFormPassword').value;
            if (pwd) smtpData.smtp_password = pwd;

            const res = await fetch(API + '/profiles/' + active.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(smtpData)
            });
            const data = await res.json();

            if (data.success) {
                statusEl.textContent = '\u2713 Configurazione SMTP salvata';
                statusEl.style.color = 'var(--success)';
            } else {
                statusEl.textContent = data.error || 'Errore';
                statusEl.style.color = 'var(--danger)';
            }
        } catch (err) {
            statusEl.textContent = err.message;
            statusEl.style.color = 'var(--danger)';
        }
    }

    async function testSmtp() {
        const statusEl = document.getElementById('smtpFormStatus');
        statusEl.textContent = 'Test connessione SMTP in corso...';
        statusEl.style.color = 'var(--warning)';
        try {
            const res = await fetch('/api/mrp/smtp/test', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                statusEl.textContent = '\u2713 ' + data.message;
                statusEl.style.color = 'var(--success)';
            } else {
                statusEl.textContent = '\u2717 ' + (data.error || 'Errore');
                statusEl.style.color = 'var(--danger)';
            }
        } catch (err) {
            statusEl.textContent = '\u2717 ' + err.message;
            statusEl.style.color = 'var(--danger)';
        }
    }

    function bindEvents() {
        document.getElementById('btnDbProfile').addEventListener('click', openModal);
        document.getElementById('modalDbClose').addEventListener('click', closeModal);
        document.getElementById('modalDbOverlay').addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });
        document.getElementById('btnDbSave').addEventListener('click', saveProfile);
        document.getElementById('btnDbTestConn').addEventListener('click', testConnection);
        document.getElementById('btnDbCancelEdit').addEventListener('click', resetForm);
        document.getElementById('dbFormAmbiente').addEventListener('change', toggleEmailProvaVisibility);
        document.getElementById('btnSmtpSave').addEventListener('click', saveSmtp);
        document.getElementById('btnSmtpTest').addEventListener('click', testSmtp);
    }

    return { init, refreshBadge, switchTo, editProfile, removeProfile };
})();
