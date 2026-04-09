/**
 * MRP DB Config — gestione profili connessione database.
 * Produzione: hardcoded, non modificabile.
 * Prova: profili per operatore salvati in [GB2].[dbo].[TestProfiles].
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
            document.getElementById('dbBadgeServer').textContent = profile.server + ' / ' + (profile.database_mrp || 'MRP');

            const header = document.querySelector('.mrp-header');
            header.style.borderBottomColor = profile.color || 'var(--border)';
            header.style.borderBottomWidth = '3px';

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

    // Cache profili caricati per edit/switch
    let _cachedProfiles = [];

    async function loadProfilesList() {
        try {
            const [profilesRes, activeRes] = await Promise.all([
                fetch(API + '/profiles'),
                fetch(API + '/active-profile')
            ]);
            const profiles = await profilesRes.json();
            const active = await activeRes.json();
            _cachedProfiles = profiles;

            const container = document.getElementById('dbProfilesList');

            container.innerHTML = profiles.map(p => {
                const isProd = p.id === 'produzione';
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
                            ${esc(p.server)} / ${esc(p.database_mrp || 'MRP')}
                        </span>
                        ${isProd
                            ? '<span style="font-size:0.7rem; background:#dc2626; color:white; padding:2px 8px; border-radius:10px; margin-left:6px;">PRODUZIONE</span>'
                            : '<span style="font-size:0.7rem; background:#f59e0b; color:white; padding:2px 8px; border-radius:10px; margin-left:6px;">PROVA</span>'
                        }
                        ${isActive ? '<span style="font-size:0.75rem; background:#16a34a; color:white; padding:2px 8px; border-radius:10px; margin-left:4px;">ATTIVO</span>' : ''}
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${!isActive ? `<button class="mrp-btn-primary" style="font-size:0.75rem; padding:4px 10px;" onclick="MrpDbConfig.switchTo('${esc(p.id)}')">Attiva</button>` : ''}
                        ${!isProd ? `<button class="mrp-btn-secondary" style="font-size:0.75rem; padding:4px 10px;" onclick="MrpDbConfig.editProfile('${esc(p.id)}')">&#9998;</button>` : ''}
                        ${!isProd && !isActive ? `<button class="mrp-btn-secondary" style="font-size:0.75rem; padding:4px 10px; color:var(--danger);" onclick="MrpDbConfig.removeProfile(${p._dbId})">&#128465;</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('[DbConfig] Errore caricamento profili:', err);
        }
    }

    async function switchTo(profileId) {
        const isProd = profileId === 'produzione';
        const profile = _cachedProfiles.find(p => p.id === profileId);

        if (isProd) {
            const ok1 = await modalConfirm({
                titolo: 'Passaggio a PRODUZIONE',
                icona: '\u26A0\uFE0F',
                messaggio: 'Stai per passare all\'ambiente di <strong>PRODUZIONE</strong>.<br>Gli ordini emessi saranno <strong>REALI</strong> e le email arriveranno ai <strong>FORNITORI</strong>.',
                labelOk: 'Continua',
                colorOk: 'var(--warning)'
            });
            if (!ok1) return;
            const ok2 = await modalConfirm({
                titolo: 'Conferma definitiva',
                icona: '\u26A1',
                messaggio: 'Sei <strong>SICURO</strong> di voler operare in <strong>PRODUZIONE</strong>?',
                labelOk: 'Confermo, vai in produzione',
                colorOk: 'var(--danger)'
            });
            if (!ok2) return;
        } else {
            const label = profile ? profile.label : profileId;
            const ok = await modalConfirm({
                titolo: 'Cambio profilo',
                icona: '🔄',
                messaggio: 'Passare al profilo <strong>"' + esc(label) + '"</strong>?<br>I dati attualmente visualizzati verranno cancellati.',
                labelOk: 'Cambia profilo'
            });
            if (!ok) return;
        }

        try {
            let res;
            if (isProd) {
                res = await fetch(API + '/switch-production', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
            } else {
                const dbId = profile ? profile._dbId : null;
                if (!dbId) { showFormStatus('Profilo non trovato', 'var(--danger)'); return; }
                res = await fetch(API + '/switch-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testProfileId: dbId })
                });
            }
            const data = await res.json();
            if (data.success) {
                // Chiudi tutti i modali aperti
                document.querySelectorAll('.mrp-modal-overlay.open').forEach(m => m.classList.remove('open'));

                await refreshBadge();
                await loadProfilesList();

                const tbody = document.getElementById('tblProgressiviBody');
                if (tbody) tbody.innerHTML = '';
                const splitTree = document.getElementById('splitTreeBody');
                if (splitTree) splitTree.innerHTML = '';

                // Torna alla home se siamo nella vista progressivi
                if (typeof MrpApp !== 'undefined') MrpApp.switchView('parametri');

                if (typeof MrpProposta !== 'undefined' && MrpProposta.init) MrpProposta.init();

                showFormStatus('&#10003; Profilo attivato: ' + data.activeProfile.label, 'var(--success)');

                // Mostra avvisi (es. Riep mancante)
                if (data.warnings && data.warnings.length > 0) {
                    showWarningModal(data.warnings);
                }
            } else {
                showFormStatus('Errore: ' + (data.error || 'sconosciuto'), 'var(--danger)');
            }
        } catch (err) {
            showFormStatus('Errore di rete: ' + err.message, 'var(--danger)');
        }
    }

    async function editProfile(profileId) {
        const p = _cachedProfiles.find(x => x.id === profileId);
        if (!p || p.id === 'produzione') return;

        document.getElementById('dbFormEditId').value = p._dbId || '';
        document.getElementById('dbFormLabel').value = p.label;
        document.getElementById('dbFormServer').value = p.server;
        document.getElementById('dbFormUjet11').value = p.database_ujet11 || 'UJET11';
        document.getElementById('dbFormUser').value = p.user || '';
        document.getElementById('dbFormPassword').value = '';
        document.getElementById('dbFormColor').value = p.color || '#16a34a';
        document.getElementById('dbFormEmailProva').value = p.email_prova || '';
        document.getElementById('dbFormTitle').textContent = 'Modifica profilo: ' + p.label;
        document.getElementById('btnDbCancelEdit').style.display = '';
    }

    function resetForm() {
        document.getElementById('dbFormEditId').value = '';
        document.getElementById('dbFormLabel').value = '';
        document.getElementById('dbFormServer').value = '';
        document.getElementById('dbFormUjet11').value = 'UJET11';
        document.getElementById('dbFormUser').value = '';
        document.getElementById('dbFormPassword').value = '';
        document.getElementById('dbFormColor').value = '#16a34a';
        document.getElementById('dbFormEmailProva').value = '';
        document.getElementById('dbFormTitle').textContent = 'Nuovo profilo di prova';
        document.getElementById('btnDbCancelEdit').style.display = 'none';
        document.getElementById('dbFormStatus').textContent = '';
    }

    async function saveProfile() {
        const editId = document.getElementById('dbFormEditId').value;
        const profileData = {
            label: document.getElementById('dbFormLabel').value.trim().toUpperCase(),
            server: document.getElementById('dbFormServer').value.trim(),
            database_ujet11: document.getElementById('dbFormUjet11').value.trim() || 'UJET11',
            user: document.getElementById('dbFormUser').value.trim(),
            password: document.getElementById('dbFormPassword').value,
            color: document.getElementById('dbFormColor').value,
            email_prova: document.getElementById('dbFormEmailProva').value.trim()
        };

        if (!profileData.label || !profileData.server || !profileData.user) {
            showFormStatus('Compila almeno Etichetta, Server e Utente DB', 'var(--warning)');
            return;
        }

        try {
            let res;
            if (editId) {
                if (!profileData.password) delete profileData.password;
                res = await fetch(API + '/profiles/' + editId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profileData)
                });
            } else {
                if (!profileData.password) {
                    showFormStatus('La password e obbligatoria per un nuovo profilo', 'var(--warning)');
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
            } else {
                showFormStatus(data.error || 'Errore', 'var(--danger)');
            }
        } catch (err) {
            showFormStatus(err.message, 'var(--danger)');
        }
    }

    async function removeProfile(dbId) {
        const ok = await modalConfirm({
            titolo: 'Elimina profilo',
            icona: '🗑️',
            messaggio: 'Eliminare questo profilo di prova?',
            labelOk: 'Elimina',
            colorOk: 'var(--danger)'
        });
        if (!ok) return;
        try {
            const res = await fetch(API + '/profiles/' + dbId, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                await loadProfilesList();
            } else {
                showFormStatus('Errore: ' + (data.error || 'sconosciuto'), 'var(--danger)');
            }
        } catch (err) {
            showFormStatus('Errore: ' + err.message, 'var(--danger)');
        }
    }

    async function testConnection() {
        showFormStatus('Test connessione in corso...', 'var(--warning)');
        try {
            const payload = {
                server: document.getElementById('dbFormServer').value.trim(),
                database_mrp: 'MRP',
                user: document.getElementById('dbFormUser').value.trim(),
                password: document.getElementById('dbFormPassword').value
            };

            if (!payload.server || !payload.user || !payload.password) {
                showFormStatus('Server, utente e password richiesti per il test', 'var(--warning)');
                return;
            }

            const res = await fetch(API + '/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            showFormStatus(data.message, data.success ? 'var(--success)' : 'var(--danger)');
        } catch (err) {
            showFormStatus(err.message, 'var(--danger)');
        }
    }

    function showWarningModal(warnings) {
        const overlay = document.getElementById('modalGenericOverlay');
        const titolo = document.getElementById('modalGenericTitolo');
        const icona = document.getElementById('modalGenericIcona');
        const msg = document.getElementById('modalGenericMessaggio');
        const azioni = document.getElementById('modalGenericAzioni');
        if (!overlay || !msg) return;

        titolo.textContent = 'Avviso ambiente di prova';
        icona.textContent = '\u26A0\uFE0F';
        msg.innerHTML = warnings.map(w => '<p style="margin:8px 0; font-size:0.9rem;">' + esc(w) + '</p>').join('');
        if (azioni) azioni.innerHTML = '';
        overlay.classList.add('open');
    }

    function showFormStatus(msg, color) {
        const el = document.getElementById('dbFormStatus');
        el.innerHTML = msg;
        el.style.color = color || 'var(--text)';
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    /** Mostra un modale di conferma al posto di confirm() nativo. Restituisce una Promise<boolean>. */
    function modalConfirm({ titolo, icona, messaggio, labelOk, labelCancel, colorOk }) {
        return new Promise(resolve => {
            const overlay = document.getElementById('modalGenericOverlay');
            const elTitolo = document.getElementById('modalGenericTitolo');
            const elIcona = document.getElementById('modalGenericIcona');
            const elMsg = document.getElementById('modalGenericMessaggio');
            const elAzioni = document.getElementById('modalGenericAzioni');
            if (!overlay) { resolve(false); return; }

            elTitolo.textContent = titolo || 'Conferma';
            elIcona.textContent = icona || '';
            elMsg.innerHTML = messaggio || '';
            elAzioni.innerHTML = '';

            const btnCancel = document.createElement('button');
            btnCancel.textContent = labelCancel || 'Annulla';
            btnCancel.className = 'mrp-btn mrp-btn-secondary';
            btnCancel.style.cssText = 'padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;font-size:0.85rem;';

            const btnOk = document.createElement('button');
            btnOk.textContent = labelOk || 'Conferma';
            btnOk.className = 'mrp-btn mrp-btn-primary';
            btnOk.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:' + (colorOk || 'var(--primary)') + ';color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';

            const cleanup = (result) => {
                overlay.classList.remove('open');
                resolve(result);
            };

            btnCancel.addEventListener('click', () => cleanup(false));
            btnOk.addEventListener('click', () => cleanup(true));

            elAzioni.appendChild(btnCancel);
            elAzioni.appendChild(btnOk);
            overlay.classList.add('open');

            // Chiudi con X
            const closeBtn = document.getElementById('modalGenericClose');
            const closeHandler = () => { cleanup(false); closeBtn.removeEventListener('click', closeHandler); };
            closeBtn.addEventListener('click', closeHandler);
        });
    }

    // --------------------------------------------------------
    // SMTP — configurazione personale dell'operatore
    // Indipendente dal profilo DB (ogni operatore ha la sua email)
    // --------------------------------------------------------

    async function loadSmtpForm() {
        try {
            const res = await fetch('/api/mrp/smtp/config');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const c = data.config || {};

            document.getElementById('smtpFormHost').value = c.host || '';
            document.getElementById('smtpFormPort').value = c.port || 587;
            document.getElementById('smtpFormSecure').checked = c.secure === true;
            document.getElementById('smtpFormUser').value = c.user || '';
            document.getElementById('smtpFormPassword').value = '';
            document.getElementById('smtpFormFromAddress').value = c.from_address || '';
            document.getElementById('smtpFormFromName').value = c.from_name || 'U.Jet s.r.l.';
        } catch (err) {
            console.error('[SMTP] Errore caricamento:', err);
        }
    }

    async function saveSmtp() {
        const statusEl = document.getElementById('smtpFormStatus');
        try {
            const smtpData = {
                host: document.getElementById('smtpFormHost').value.trim(),
                port: parseInt(document.getElementById('smtpFormPort').value, 10) || 587,
                secure: document.getElementById('smtpFormSecure').checked,
                user: document.getElementById('smtpFormUser').value.trim(),
                from_address: document.getElementById('smtpFormFromAddress').value.trim(),
                from_name: document.getElementById('smtpFormFromName').value.trim() || 'U.Jet s.r.l.'
            };

            const pwd = document.getElementById('smtpFormPassword').value;
            if (pwd) smtpData.password = pwd;

            if (!smtpData.host || !smtpData.from_address) {
                statusEl.textContent = 'Host SMTP e email mittente sono obbligatori';
                statusEl.style.color = 'var(--warning)';
                return;
            }

            const res = await fetch('/api/mrp/smtp/config', {
                method: 'POST',
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
        const btnSmtpSave = document.getElementById('btnSmtpSave');
        if (btnSmtpSave) btnSmtpSave.addEventListener('click', saveSmtp);
        const btnSmtpTest = document.getElementById('btnSmtpTest');
        if (btnSmtpTest) btnSmtpTest.addEventListener('click', testSmtp);
    }

    return { init, refreshBadge, switchTo, editProfile, removeProfile };
})();
