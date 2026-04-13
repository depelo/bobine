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
        // Fire-and-forget: check colonna classificazione fornitori
        checkAnagraColumn();
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
        loadTemplates();
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

                // Pulisci le viste correnti
                const tbody = document.getElementById('tblProgressiviBody');
                if (tbody) tbody.innerHTML = '';
                const splitTree = document.getElementById('splitTreeBody');
                if (splitTree) splitTree.innerHTML = '';

                // Torna alla home se siamo nella vista progressivi
                if (typeof MrpApp !== 'undefined') MrpApp.switchView('parametri');

                showFormStatus('&#10003; Profilo attivato: ' + data.activeProfile.label, 'var(--success)');

                // Tutto il resto in parallelo e non bloccante
                refreshBadge();
                loadProfilesList();
                if (typeof MrpProposta !== 'undefined' && MrpProposta.init) MrpProposta.init();
                checkAnagraColumn();
                loadAssegnazioni();

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

            // Carica firma nella sezione template
            const firmaEl = document.getElementById('firmaEmail');
            if (firmaEl) firmaEl.value = c.firma || '';
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

            // Includi firma attuale per non sovrascriverla
            const firmaEl = document.getElementById('firmaEmail');
            if (firmaEl) smtpData.firma = firmaEl.value.trim();

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

    // --------------------------------------------------------
    // TEMPLATE EMAIL — gestione template e firma
    // --------------------------------------------------------

    let _editingTemplateId = null; // null = nuovo, numero = modifica

    async function loadTemplates() {
        const container = document.getElementById('templateList');
        if (!container) return;
        try {
            const res = await fetch('/api/mrp/email-templates?include_inactive=1');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const templates = data.templates || [];

            if (templates.length === 0) {
                container.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); text-align:center; padding:16px;">Nessun template trovato</div>';
                return;
            }

            container.innerHTML = templates.map(t => {
                const isSystem = t.isSystem;
                const isMine = t.isMine;
                const isActive = t.isActive !== false && t.isActive !== 0;
                const corpoPreview = (t.corpo || '').substring(0, 120).replace(/\n/g, ' ');

                let cardClass = 'tpl-card';
                if (!isActive) cardClass += ' tpl-card-inactive';
                if (isSystem) cardClass += ' tpl-card-system';
                else if (isMine) cardClass += ' tpl-card-own';
                else cardClass += ' tpl-card-readonly';

                let badges = '';
                if (isSystem) badges += '<span class="tpl-badge tpl-badge-sistema">Sistema</span>';
                if (t.isDefault) badges += '<span class="tpl-badge tpl-badge-default">Predefinito</span>';
                badges += '<span class="tpl-badge tpl-badge-lingua">' + esc(t.lingua || 'it') + '</span>';
                if (!isSystem && !isMine && t.nomeOperatore) {
                    badges += '<span class="tpl-badge tpl-badge-operatore">' + esc(t.nomeOperatore) + '</span>';
                }
                if (!isActive) badges += '<span class="tpl-badge tpl-badge-inattivo">Disattivato</span>';
                if (t.fornitoreCode) badges += '<span class="tpl-badge" style="background:#dbeafe;color:#1d4ed8;">\u2605 Fornitore #' + t.fornitoreCode + '</span>';

                let actions = '';
                if (isMine && !isSystem) {
                    actions += '<button onclick="MrpDbConfig.editTemplate(' + t.id + ')">Modifica</button>';
                    if (isActive) {
                        actions += '<button class="tpl-btn-danger" onclick="MrpDbConfig.deleteTemplate(' + t.id + ')">Disattiva</button>';
                    } else {
                        actions += '<button onclick="MrpDbConfig.reactivateTemplate(' + t.id + ')">Riattiva</button>';
                    }
                }

                return `<div class="${cardClass}">
                    <div class="tpl-card-info">
                        <div class="tpl-card-nome">${esc(t.nome)}</div>
                        <div class="tpl-card-oggetto">${esc(t.oggetto)}</div>
                        <div class="tpl-card-corpo-preview">${esc(corpoPreview)}</div>
                        <div class="tpl-card-badges">${badges}</div>
                    </div>
                    <div class="tpl-card-actions">${actions}</div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('[Templates] Errore caricamento:', err);
            container.innerHTML = '<div style="color:var(--danger); font-size:0.82rem;">Errore caricamento template</div>';
        }
    }

    function openTemplateEditor(id) {
        _editingTemplateId = id || null;
        const editor = document.getElementById('templateEditor');
        const title = document.getElementById('tplEditorTitle');
        const varBar = document.getElementById('tplVariabiliBar');
        const corpoEl = document.getElementById('tplCorpo');
        editor.style.display = 'block';

        if (id) {
            title.textContent = 'Modifica template';
            fetch('/api/mrp/email-templates/' + id)
                .then(r => r.json())
                .then(data => {
                    const t = data.template;
                    if (!t) return;
                    document.getElementById('tplNome').value = t.nome || '';
                    document.getElementById('tplLingua').value = t.lingua || 'it';
                    document.getElementById('tplOggetto').value = t.oggetto || '';
                    corpoEl.innerHTML = _textToChips(t.corpo || '');
                    document.getElementById('tplDefault').checked = !!t.isDefault;
                    // Nascondi variabili per messaggi personalizzati (hanno fornitoreCode)
                    if (varBar) varBar.style.display = t.fornitoreCode ? 'none' : '';
                })
                .catch(err => {
                    console.error('[Templates] Errore fetch template:', err);
                    showTplStatus('Errore caricamento template', 'var(--danger)');
                });
        } else {
            title.textContent = 'Nuovo template';
            document.getElementById('tplNome').value = '';
            document.getElementById('tplLingua').value = 'it';
            document.getElementById('tplOggetto').value = 'Ordine {numord} - U.Jet S.r.l.';
            corpoEl.innerHTML = '';
            document.getElementById('tplDefault').checked = false;
            // Mostra variabili per nuovi template
            if (varBar) varBar.style.display = '';
        }

        // Scroll editor into view
        setTimeout(() => editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }

    function closeTemplateEditor() {
        _editingTemplateId = null;
        document.getElementById('templateEditor').style.display = 'none';
        document.getElementById('tplEditorStatus').textContent = '';
    }

    async function saveTemplate() {
        const nome = document.getElementById('tplNome').value.trim();
        const lingua = document.getElementById('tplLingua').value;
        const oggetto = document.getElementById('tplOggetto').value.trim();
        const corpoEl = document.getElementById('tplCorpo');
        const corpo = _chipsToText(corpoEl).trim();
        const isDefault = document.getElementById('tplDefault').checked;

        if (!nome || !oggetto || !corpo) {
            showTplStatus('Nome, oggetto e corpo sono obbligatori', 'var(--warning)');
            return;
        }

        const payload = { nome, lingua, oggetto, corpo, isDefault };

        try {
            let res;
            if (_editingTemplateId) {
                res = await fetch('/api/mrp/email-templates/' + _editingTemplateId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/mrp/email-templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            const data = await res.json();
            if (res.ok && (data.success || data.template)) {
                showTplStatus('\u2713 Template salvato', 'var(--success)');
                closeTemplateEditor();
                await loadTemplates();
            } else {
                showTplStatus(data.error || 'Errore salvataggio', 'var(--danger)');
            }
        } catch (err) {
            showTplStatus(err.message, 'var(--danger)');
        }
    }

    async function deleteTemplate(id) {
        const ok = await modalConfirm({
            titolo: 'Disattiva template',
            icona: '\u26A0\uFE0F',
            messaggio: 'Disattivare questo template? Non sara\u0300 piu\u0300 disponibile per l\'invio email, ma restera\u0300 visibile nella lista.',
            labelOk: 'Disattiva',
            colorOk: 'var(--warning)'
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/mrp/email-templates/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
                await loadTemplates();
            } else {
                showTplStatus(data.error || 'Errore', 'var(--danger)');
            }
        } catch (err) {
            showTplStatus(err.message, 'var(--danger)');
        }
    }

    async function reactivateTemplate(id) {
        try {
            const res = await fetch('/api/mrp/email-templates/' + id + '/reactivate', { method: 'PUT' });
            const data = await res.json();
            if (res.ok && data.success) {
                await loadTemplates();
            } else {
                showTplStatus(data.error || 'Errore', 'var(--danger)');
            }
        } catch (err) {
            showTplStatus(err.message, 'var(--danger)');
        }
    }

    async function saveFirma() {
        const firma = document.getElementById('firmaEmail').value.trim();
        const statusEl = document.getElementById('firmaStatus');
        try {
            // Leggi config SMTP corrente per non sovrascriverla
            const cfgRes = await fetch('/api/mrp/smtp/config');
            const cfgData = await cfgRes.json();
            const c = cfgData.config || {};

            const payload = {
                host: c.host || '',
                port: c.port || 587,
                secure: c.secure || false,
                user: c.user || '',
                from_address: c.from_address || '',
                from_name: c.from_name || 'U.Jet s.r.l.',
                firma: firma
            };

            const res = await fetch('/api/mrp/smtp/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                statusEl.textContent = '\u2713 Firma salvata';
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

    function previewTemplate() {
        const oggetto = document.getElementById('tplOggetto').value;
        const corpo = _chipsToText(document.getElementById('tplCorpo'));
        const firma = document.getElementById('firmaEmail').value || 'Mario Rossi - Ufficio Acquisti';

        const dati = {
            fornitore: 'ESEMPIO S.R.L.',
            numord: '123/F',
            data_ordine: '09/04/2026',
            num_articoli: '5',
            totale: '\u20AC 1.234,56',
            operatore: 'Mario Rossi',
            firma: firma
        };

        function compila(testo) {
            return testo
                .replace(/\{fornitore\}/g, dati.fornitore)
                .replace(/\{numord\}/g, dati.numord)
                .replace(/\{data_ordine\}/g, dati.data_ordine)
                .replace(/\{num_articoli\}/g, dati.num_articoli)
                .replace(/\{totale\}/g, dati.totale)
                .replace(/\{operatore\}/g, dati.operatore)
                .replace(/\{firma\}/g, dati.firma);
        }

        const oggettoCompilato = compila(oggetto);
        const corpoCompilato = compila(corpo);

        // Mostra nel modale generico
        const overlay = document.getElementById('modalGenericOverlay');
        const titolo = document.getElementById('modalGenericTitolo');
        const icona = document.getElementById('modalGenericIcona');
        const msg = document.getElementById('modalGenericMessaggio');
        const azioni = document.getElementById('modalGenericAzioni');

        titolo.textContent = 'Anteprima Email';
        icona.textContent = '\uD83D\uDCE7';
        msg.innerHTML = '<div style="text-align:left;">' +
            '<div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:4px;">Oggetto:</div>' +
            '<div style="font-weight:700; font-size:0.92rem; margin-bottom:12px; padding:8px; background:var(--bg); border-radius:var(--radius-sm);">' + esc(oggettoCompilato) + '</div>' +
            '<div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:4px;">Corpo:</div>' +
            '<pre style="white-space:pre-wrap; font-family:inherit; font-size:0.85rem; padding:12px; background:var(--bg); border-radius:var(--radius-sm); border:1px solid var(--border); max-height:300px; overflow-y:auto;">' + esc(corpoCompilato) + '</pre>' +
            '</div>';
        azioni.innerHTML = '';
        const btnChiudi = document.createElement('button');
        btnChiudi.textContent = 'Chiudi';
        btnChiudi.className = 'mrp-btn mrp-btn-secondary';
        btnChiudi.style.cssText = 'padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;font-size:0.85rem;';
        btnChiudi.addEventListener('click', () => overlay.classList.remove('open'));
        azioni.appendChild(btnChiudi);
        overlay.classList.add('open');
    }

    // --- Helpers chip placeholder ---
    function _chipHtml(varName) {
        // varName = "{fornitore}" o "fornitore"
        const v = varName.replace(/[{}]/g, '');
        return '<span class="tpl-chip" contenteditable="false" data-var="' + v + '">{' + v + '}</span>';
    }

    function _textToChips(text) {
        // Converte "{fornitore}" nel testo in chip HTML, preservando newline
        return (text || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\{(\w+)\}/g, (_, v) => _chipHtml(v))
            .replace(/\n/g, '<br>');
    }

    function _chipsToText(editorEl) {
        // Serializza il contenteditable in testo con {variabile}
        let result = '';
        editorEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeName === 'BR') {
                result += '\n';
            } else if (node.classList && node.classList.contains('tpl-chip')) {
                result += '{' + (node.dataset.var || '') + '}';
            } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
                // Chrome wraps lines in divs
                if (result.length > 0 && !result.endsWith('\n')) result += '\n';
                node.childNodes.forEach(child => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        result += child.textContent;
                    } else if (child.nodeName === 'BR') {
                        result += '\n';
                    } else if (child.classList && child.classList.contains('tpl-chip')) {
                        result += '{' + (child.dataset.var || '') + '}';
                    }
                });
            }
        });
        return result;
    }

    function insertVariable(varName) {
        const editor = document.getElementById('tplCorpo');
        if (!editor) return;
        editor.focus();
        // Inserisci chip alla posizione del cursore
        const chip = _chipHtml(varName);
        document.execCommand('insertHTML', false, chip);
    }

    function showTplStatus(msg, color) {
        const el = document.getElementById('tplEditorStatus') || document.getElementById('templateSectionStatus');
        if (el) {
            el.textContent = msg;
            el.style.color = color || 'var(--text)';
        }
    }

    // --------------------------------------------------------
    // ASSEGNAZIONI FORNITORI — tab configurazione
    // --------------------------------------------------------

    let _assegnFornitoriData = []; // cache dati caricati (arricchiti con email, banca, ecc.)
    let _assegnTemplatesList = []; // cache template per i select
    let _assegnCurrentMode = 'ultima_scelta';
    let _classificazioneMap = {};  // cache codice → tipo (IT/UE/EXTRA_UE)
    let _classificazioneFornitori = []; // tutti i fornitori dalla classificazione
    let _classificazioneDisponibile = false;
    let _filtroTipoAttivi = new Set(); // filtri tipo attivi (toggle cumulativo)
    let _mostraTuttiFornitori = false; // flag: mostra anche fornitori senza ordini
    let _ordinamento = { campo: 'nome', dir: 'asc' }; // ordinamento corrente
    let _filtroAvvisoAttivo = null; // 'no_email' | 'rim_no_banca' | null
    let _expandedCodice = null; // codice fornitore con pannello espanso aperto

    // --------------------------------------------------------
    // CHECK COLONNA HH_TipoReport — fire-and-forget al boot
    // --------------------------------------------------------

    function checkAnagraColumn() {
        fetch('/api/mrp/check-anagra-column', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (!data.exists) showDeployColumnModal();
            })
            .catch(() => {}); // silenzioso
    }

    function showConfirmModal(titolo, contenutoHtml) {
        const id = 'confirmModal_' + Date.now();
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'mrp-modal-overlay open';
        overlay.innerHTML = `
            <div class="mrp-modal" style="max-width:420px;">
                <div class="mrp-modal-header">
                    <h3>${titolo}</h3>
                    <button class="mrp-modal-close" onclick="document.getElementById('${id}').remove()">&times;</button>
                </div>
                <div style="padding:18px 20px;">
                    ${contenutoHtml}
                    <div style="text-align:right; margin-top:16px;">
                        <button class="mrp-btn-primary" style="padding:6px 20px;" onclick="document.getElementById('${id}').remove()">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function showDeployColumnModal() {
        // Evita duplicati
        if (document.getElementById('deployColumnOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'deployColumnOverlay';
        overlay.className = 'mrp-modal-overlay open';
        overlay.innerHTML = `
            <div class="mrp-modal" style="max-width:520px;">
                <div class="mrp-modal-header">
                    <h3>Classificazione fornitori mancante</h3>
                    <button class="mrp-modal-close" id="deployColClose">&times;</button>
                </div>
                <div style="padding:20px; font-size:0.88rem; line-height:1.6;">
                    <p>Nel database attivo manca la colonna <strong>HH_TipoReport</strong> nella tabella ANAGRA.</p>
                    <p style="margin-top:10px;">Questa colonna serve per generare correttamente i PDF degli ordini fornitore con il layout appropriato (Italia vs Estero).</p>
                    <p style="margin-top:10px;">Se la creo, ogni fornitore viene classificato automaticamente come <strong style="color:#2e7d32;">IT</strong>, <strong style="color:#1565c0;">UE</strong> o <strong style="color:#e65100;">EXTRA_UE</strong> in base ai dati anagrafici.</p>
                    <p style="margin-top:10px; color:var(--text-muted); font-size:0.8rem;">Potrai correggere i valori in Impostazioni &rarr; Fornitori.</p>
                    <div style="display:flex; gap:10px; margin-top:20px; justify-content:flex-end;">
                        <button class="mrp-btn-secondary" id="deployColSkip">Non ora</button>
                        <button class="mrp-btn-primary" id="deployColConfirm">Crea colonna</button>
                    </div>
                    <p id="deployColStatus" style="margin-top:10px; font-size:0.8rem; display:none;"></p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('deployColClose').addEventListener('click', () => overlay.remove());
        document.getElementById('deployColSkip').addEventListener('click', () => overlay.remove());
        document.getElementById('deployColConfirm').addEventListener('click', async () => {
            const btn = document.getElementById('deployColConfirm');
            const status = document.getElementById('deployColStatus');
            btn.disabled = true;
            btn.textContent = 'Creazione in corso...';
            status.style.display = 'block';
            status.style.color = 'var(--text-muted)';
            status.textContent = 'Aggiunta colonna e classificazione fornitori...';
            try {
                const res = await fetch('/api/mrp/deploy-anagra-column', { method: 'POST', credentials: 'include' });
                const data = await res.json();
                if (data.success) {
                    status.style.color = 'var(--success)';
                    status.textContent = 'Completato! ' + (data.rowsUpdated || 0) + ' fornitori classificati.';
                    setTimeout(() => {
                        overlay.remove();
                        loadAssegnazioni(); // ricarica tab fornitori con i nuovi dati
                    }, 1500);
                } else {
                    throw new Error(data.error || 'Errore sconosciuto');
                }
            } catch (err) {
                status.style.color = 'var(--danger)';
                status.textContent = 'Errore: ' + err.message;
                btn.disabled = false;
                btn.textContent = 'Riprova';
            }
        });
    }

    // --------------------------------------------------------
    // ASSEGNAZIONI + CLASSIFICAZIONE FORNITORI
    // --------------------------------------------------------

    async function loadAssegnazioni() {
        const container = document.getElementById('assegnFornitoriList');
        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.82rem;">Caricamento fornitori...</div>';

        try {
            // Carica fornitori+assegnazioni, template, e classificazione in parallelo
            const [fornRes, tplRes, classRes] = await Promise.all([
                fetch('/api/mrp/fornitori-template', { credentials: 'include' }),
                fetch('/api/mrp/email-templates', { credentials: 'include' }),
                fetch('/api/mrp/fornitori-classificazione', { credentials: 'include' })
            ]);

            if (!fornRes.ok) throw new Error('HTTP ' + fornRes.status);
            const fornData = await fornRes.json();
            _assegnFornitoriData = fornData.fornitori || [];
            _assegnCurrentMode = fornData.templateMode || 'ultima_scelta';

            if (tplRes.ok) {
                const tplData = await tplRes.json();
                _assegnTemplatesList = (tplData.templates || []).filter(t => t.isActive !== false && t.isActive !== 0);
            }

            // Classificazione
            _classificazioneMap = {};
            _classificazioneFornitori = [];
            _classificazioneDisponibile = false;
            if (classRes.ok) {
                const classData = await classRes.json();
                if (!classData.columnMissing && classData.fornitori) {
                    _classificazioneDisponibile = true;
                    _classificazioneFornitori = classData.fornitori;
                    classData.fornitori.forEach(f => { _classificazioneMap[f.codice] = f.tipo; });
                }
            }

            // Imposta radio button modalita
            const radio = document.querySelector(`input[name="templateMode"][value="${_assegnCurrentMode}"]`);
            if (radio) radio.checked = true;
            aggiornaDescrizioneMode(_assegnCurrentMode);

            // Reset state
            _filtroTipoAttivi.clear();
            _mostraTuttiFornitori = false;
            _filtroAvvisoAttivo = null;
            _expandedCodice = null;
            _ordinamento = { campo: 'nome', dir: 'asc' };

            // Render dashboard avvisi
            renderDashboardAvvisi();

            // Render filtri classificazione + leggenda
            renderClassificazioneFiltri();

            // Render toolbar ordinamento
            bindSortToolbar();

            // Render lista
            renderAssegnazioni(getListaOrdinata());
        } catch (err) {
            console.error('[Assegnazioni] Errore:', err);
            container.innerHTML = '<div style="color:var(--danger); font-size:0.82rem;">Errore caricamento: ' + esc(err.message) + '</div>';
        }
    }

    function renderAssegnazioni(fornitori) {
        const container = document.getElementById('assegnFornitoriList');
        if (!container) return;

        if (!fornitori.length) {
            container.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.82rem;">Nessun fornitore trovato</div>';
            return;
        }

        const optionsHtml = '<option value="">(Nessun predefinito)</option>' +
            _assegnTemplatesList.map(t => {
                const badge = t.isSystem ? ' [S]' : '';
                return '<option value="' + t.id + '">' + esc(t.nome) + badge + '</option>';
            }).join('');

        container.innerHTML = fornitori.map(f => {
            const selected = f.templateId || '';
            const tipo = _classificazioneMap[f.codice] || '';
            const hasEmail = !!(f.email && f.email.trim());
            const emailIcon = '<span class="assegn-email-icon ' + (hasEmail ? 'has-email' : 'no-email') + '" title="' + (hasEmail ? esc(f.email) : 'Email mancante') + '">\u2709</span>';

            // Ultimo ordine: non disponibile al caricamento (caricato lazy nel pannello espanso)
            const ultimoHtml = '';

            // Select classificazione
            let tipoHtml = '';
            if (_classificazioneDisponibile) {
                tipoHtml = '<select class="assegn-forn-tipo" data-forn="' + f.codice + '" data-tipo="' + tipo + '">' +
                    '<option value="IT"' + (tipo === 'IT' ? ' selected' : '') + '>IT</option>' +
                    '<option value="UE"' + (tipo === 'UE' ? ' selected' : '') + '>UE</option>' +
                    '<option value="EXTRA_UE"' + (tipo === 'EXTRA_UE' ? ' selected' : '') + '>Extra UE</option>' +
                    '</select>';
            }

            return '<div class="assegn-forn-row" data-codice="' + f.codice + '" data-nome="' + esc(f.nome || '') + '"' +
                (tipo ? ' data-tipo="' + tipo + '"' : '') +
                ' data-email="' + (hasEmail ? '1' : '0') + '"' +
                ' data-banca="' + ((f.banca1 || '').trim() ? '1' : '0') + '"' +
                ' data-pagamento="' + esc(f.pagamento || '') + '">' +
                tipoHtml +
                '<span class="assegn-forn-codice">' + f.codice + '</span>' +
                '<span class="assegn-forn-nome" title="' + esc(f.nome || '') + '">' + esc(f.nome || '(senza nome)') + '</span>' +
                emailIcon +
                ultimoHtml +
                '<select class="assegn-forn-select" data-forn="' + f.codice + '">' +
                optionsHtml.replace('value="' + selected + '"', 'value="' + selected + '" selected') +
                '</select>' +
                '</div>';
        }).join('');

        // Bind: template select
        container.querySelectorAll('.assegn-forn-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                e.stopPropagation();
                const forn = sel.dataset.forn;
                const tid = sel.value ? parseInt(sel.value, 10) : null;
                sel.style.borderColor = 'var(--warning)';
                try {
                    const res = await fetch('/api/mrp/email-template-assegnazione/' + forn, {
                        method: 'PUT', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ templateId: tid })
                    });
                    const data = await res.json();
                    sel.style.borderColor = data.success ? 'var(--success)' : 'var(--danger)';
                    setTimeout(() => { sel.style.borderColor = ''; }, 1500);
                    const f = _assegnFornitoriData.find(x => String(x.codice) === forn);
                    if (f) f.templateId = tid;
                } catch (err) {
                    sel.style.borderColor = 'var(--danger)';
                }
            });
        });

        // Bind: classificazione select
        container.querySelectorAll('.assegn-forn-tipo').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                e.stopPropagation();
                const forn = sel.dataset.forn;
                const newTipo = sel.value;
                const row = sel.closest('.assegn-forn-row');
                sel.dataset.tipo = newTipo;
                if (row) row.dataset.tipo = newTipo;
                try {
                    const res = await fetch('/api/mrp/fornitore-classificazione/' + forn, {
                        method: 'PUT', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tipo: newTipo })
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error('Errore');
                    _classificazioneMap[forn] = newTipo;
                } catch (err) {
                    sel.style.outline = '2px solid var(--danger)';
                    setTimeout(() => { sel.style.outline = ''; }, 1500);
                }
            });
        });

        // Bind: click sulla riga → espandi dettagli
        container.querySelectorAll('.assegn-forn-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('select') || e.target.closest('button') || e.target.closest('input')) return;
                toggleDetailPanel(row);
            });
        });
    }

    // --------------------------------------------------------
    // FORM BANCARIO STRUTTURATO (riutilizzabile)
    // --------------------------------------------------------

    function buildBankFormHtml(codice, dati) {
        const b1 = esc(dati.banca1 || '');
        const b2 = esc(dati.banca2 || '');
        const abi = dati.abi && dati.abi > 0 ? String(dati.abi).padStart(5, '0') : '';
        const cab = dati.cab && dati.cab > 0 ? String(dati.cab).padStart(5, '0') : '';
        const iban = esc(dati.iban || '');
        const swift = esc(dati.swift || '');

        return '<div class="bank-form" data-codice="' + codice + '">' +
            '<div class="bank-form-title">\uD83C\uDFE6 Dati bancari</div>' +
            '<div class="bank-form-row"><label>Banca</label><input type="text" name="banca1" value="' + b1 + '" placeholder="Nome banca"></div>' +
            '<div class="bank-form-row"><label>Filiale</label><input type="text" name="banca2" value="' + b2 + '" placeholder="Filiale / Agenzia"></div>' +
            '<div class="bank-form-row-double">' +
                '<div><label>ABI</label><input type="text" name="abi" value="' + abi + '" maxlength="5" placeholder="00000"></div>' +
                '<div><label>CAB</label><input type="text" name="cab" value="' + cab + '" maxlength="5" placeholder="00000"></div>' +
            '</div>' +
            '<div class="bank-form-row"><label>IBAN</label><input type="text" name="iban" value="' + iban + '" placeholder="IT00X0000000000000000000000" style="font-family:monospace;letter-spacing:1px;"></div>' +
            '<div class="bank-form-row"><label>SWIFT</label><input type="text" name="swift" value="' + swift + '" maxlength="14" placeholder="BPPIITRRXXX" style="font-family:monospace;"></div>' +
            '<div class="bank-form-actions"><button class="bank-form-save" data-codice="' + codice + '">Salva dati bancari</button></div>' +
        '</div>';
    }

    function bindBankFormSave(container, onSuccess) {
        const btn = container.querySelector('.bank-form-save');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const form = container.querySelector('.bank-form');
            const codice = form.dataset.codice;
            btn.disabled = true;
            btn.textContent = 'Salvataggio...';
            try {
                const body = {
                    banca1: form.querySelector('[name="banca1"]').value.trim(),
                    banca2: form.querySelector('[name="banca2"]').value.trim(),
                    abi: form.querySelector('[name="abi"]').value.trim(),
                    cab: form.querySelector('[name="cab"]').value.trim(),
                    iban: form.querySelector('[name="iban"]').value.trim().replace(/\s/g, ''),
                    swift: form.querySelector('[name="swift"]').value.trim()
                };
                const res = await fetch('/api/mrp/fornitore-anagrafica/' + codice, {
                    method: 'PUT', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Errore');

                // Aggiorna cache locale
                const f = _assegnFornitoriData.find(x => String(x.codice) === codice);
                if (f) {
                    f.banca1 = body.banca1; f.banca2 = body.banca2;
                    f.abi = parseInt(body.abi) || 0; f.cab = parseInt(body.cab) || 0;
                    f.iban = body.iban; f.swift = body.swift;
                }

                btn.textContent = '\u2713 Salvato!';
                btn.className = 'bank-form-save success';
                form.querySelectorAll('input').forEach(i => i.classList.add('saved'));
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = 'Salva dati bancari';
                    btn.className = 'bank-form-save';
                    form.querySelectorAll('input').forEach(i => i.classList.remove('saved'));
                }, 2000);

                if (onSuccess) onSuccess(data);
            } catch (err) {
                btn.textContent = 'Errore!';
                btn.style.background = 'var(--danger)';
                btn.style.borderColor = 'var(--danger)';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = 'Salva dati bancari';
                    btn.style.background = '';
                    btn.style.borderColor = '';
                }, 2000);
            }
        });
    }

    // --------------------------------------------------------
    // PANNELLO DETTAGLI ESPANDIBILE
    // --------------------------------------------------------

    function toggleDetailPanel(row) {
        const codice = row.dataset.codice;
        const existing = row.nextElementSibling;

        // Chiudi qualsiasi pannello aperto
        document.querySelectorAll('.assegn-forn-detail').forEach(d => d.remove());
        document.querySelectorAll('.assegn-forn-row.expanded').forEach(r => r.classList.remove('expanded'));

        if (_expandedCodice === codice) {
            _expandedCodice = null;
            return;
        }

        _expandedCodice = codice;
        row.classList.add('expanded');

        const f = _assegnFornitoriData.find(x => String(x.codice) === codice) ||
                  _classificazioneFornitori.find(x => String(x.codice) === parseInt(codice));
        if (!f) return;

        const hasEmail = !!(f.email && f.email.trim());
        const citta = [f.cap, (f.citta || '').toUpperCase(), f.prov ? '(' + f.prov + ')' : ''].filter(Boolean).join(' ');
        const ultimoStr = f.ultimo_ordine ? new Date(f.ultimo_ordine).toLocaleDateString('it-IT') : 'caricamento...';

        const panel = document.createElement('div');
        panel.className = 'assegn-forn-detail';
        panel.style.display = 'block'; // override grid per layout misto
        panel.innerHTML =
            // Riga info: indirizzo + pagamento + ultimo ordine
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; margin-bottom:8px;">' +
                '<div class="assegn-detail-field" style="grid-column:1/3;">' +
                    '<span class="assegn-detail-icon">\uD83D\uDCCD</span>' +
                    '<span class="assegn-detail-value">' + esc(f.indirizzo || '') + (citta ? ', ' + esc(citta) : '') + '</span>' +
                '</div>' +
                '<div class="assegn-detail-field">' +
                    '<span class="assegn-detail-icon">\u2709</span>' +
                    '<span class="assegn-detail-label">Email</span>' +
                    '<span class="assegn-detail-value' + (hasEmail ? '' : ' empty') + '" id="detailEmail_' + codice + '">' + (hasEmail ? esc(f.email) : 'non impostata') + '</span>' +
                    '<button class="assegn-detail-edit-btn" data-field="email" data-codice="' + codice + '">\u270F</button>' +
                '</div>' +
                '<div class="assegn-detail-field">' +
                    '<span class="assegn-detail-icon">\uD83D\uDCB3</span>' +
                    '<span class="assegn-detail-label">Pag.</span>' +
                    '<span class="assegn-detail-value">' + esc(f.pagamento || 'N/D') + '</span>' +
                '</div>' +
                '<div class="assegn-detail-field">' +
                    '<span class="assegn-detail-icon">\uD83D\uDCC5</span>' +
                    '<span class="assegn-detail-label">Ultimo</span>' +
                    '<span class="assegn-detail-value">' + ultimoStr + '</span>' +
                '</div>' +
                (f.pariva ? '<div class="assegn-detail-field"><span class="assegn-detail-label" style="margin-left:24px;">P.IVA</span><span class="assegn-detail-value">' + esc(f.pariva) + '</span></div>' : '') +
            '</div>' +
            // Form bancario strutturato
            buildBankFormHtml(codice, f);

        row.after(panel);

        // Bind edit button per email
        panel.querySelectorAll('.assegn-detail-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => startInlineEdit(btn.dataset.codice, btn.dataset.field));
        });

        // Bind salvataggio form bancario
        bindBankFormSave(panel, () => {
            renderDashboardAvvisi();
        });

        // Carica ultimo ordine lazy
        if (!f.ultimo_ordine) {
            fetch('/api/mrp/fornitore-ultimo-ordine/' + codice, { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    panel.querySelectorAll('.assegn-detail-field').forEach(field => {
                        const label = field.querySelector('.assegn-detail-label');
                        if (label && label.textContent === 'Ultimo') {
                            const val = field.querySelector('.assegn-detail-value');
                            if (val) {
                                val.textContent = data.ultimo_ordine ? new Date(data.ultimo_ordine).toLocaleDateString('it-IT') : 'Nessuno';
                                f.ultimo_ordine = data.ultimo_ordine;
                            }
                        }
                    });
                })
                .catch(() => {});
        }
    }

    // --------------------------------------------------------
    // MODIFICA INLINE EMAIL / BANCA
    // --------------------------------------------------------

    function startInlineEdit(codice, field) {
        const f = _assegnFornitoriData.find(x => String(x.codice) === codice);
        if (!f) return;

        let currentValue, elId, placeholder;
        if (field === 'email') {
            currentValue = f.email || '';
            elId = 'detailEmail_' + codice;
            placeholder = 'email@fornitore.it';
        } else {
            currentValue = [f.banca1, f.banca2].filter(Boolean).join(' - ');
            elId = 'detailBanca_' + codice;
            placeholder = 'Nome banca - Filiale';
        }

        const span = document.getElementById(elId);
        if (!span) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'assegn-detail-input';
        input.value = currentValue;
        input.placeholder = placeholder;
        span.replaceWith(input);
        input.focus();
        input.select();

        let _saving = false;
        async function save() {
            if (_saving) return;
            _saving = true;
            const newVal = input.value.trim();
            try {
                const body = {};
                if (field === 'email') {
                    body.email = newVal;
                } else {
                    const parts = newVal.split(/\s*-\s*/);
                    body.banca1 = parts[0] || '';
                    body.banca2 = parts[1] || '';
                }
                const res = await fetch('/api/mrp/fornitore-anagrafica/' + codice, {
                    method: 'PUT', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Errore salvataggio');

                // Mostra modale conferma con verifica dal server
                const conferma = data.verifica || {};
                const fieldLabel = field === 'email' ? 'Email' : 'Banca';
                const valoreDB = field === 'email' ? conferma.email : [conferma.banca1, conferma.banca2].filter(Boolean).join(' - ');
                showConfirmModal(
                    '\u2705 ' + fieldLabel + ' aggiornata',
                    '<div style="font-size:0.85rem; line-height:1.8;">' +
                    '<strong>Fornitore:</strong> ' + codice + '<br>' +
                    '<strong>Valore salvato:</strong> ' + esc(valoreDB || '(vuoto)') + '<br>' +
                    '<strong>Righe modificate:</strong> ' + (data.rowsAffected || 0) + '<br>' +
                    '<strong>Server:</strong> ' + esc(data.server || 'N/D') + '<br>' +
                    '<strong>Ambiente:</strong> ' + esc(data.ambiente || 'N/D') +
                    '</div>'
                );

                // Aggiorna cache
                if (field === 'email') f.email = newVal;
                else { f.banca1 = body.banca1; f.banca2 = body.banca2; }

                input.className = 'assegn-detail-input success';
                setTimeout(() => {
                    const newSpan = document.createElement('span');
                    newSpan.className = 'assegn-detail-value' + (newVal ? '' : ' empty');
                    newSpan.id = elId;
                    newSpan.textContent = newVal || 'non impostata';
                    input.replaceWith(newSpan);
                    if (field === 'email') {
                        const row = document.querySelector('.assegn-forn-row[data-codice="' + codice + '"]');
                        if (row) {
                            const icon = row.querySelector('.assegn-email-icon');
                            if (icon) {
                                icon.className = 'assegn-email-icon ' + (newVal ? 'has-email' : 'no-email');
                                icon.title = newVal || 'Email mancante';
                            }
                            row.dataset.email = newVal ? '1' : '0';
                        }
                        renderDashboardAvvisi();
                    }
                }, 300);
            } catch (err) {
                input.className = 'assegn-detail-input error';
            }
        }

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') {
                const newSpan = document.createElement('span');
                newSpan.className = 'assegn-detail-value' + (currentValue ? '' : ' empty');
                newSpan.id = elId;
                newSpan.textContent = currentValue || 'non impostata';
                input.replaceWith(newSpan);
            }
        });
    }

    // --------------------------------------------------------
    // DASHBOARD AVVISI
    // --------------------------------------------------------

    function renderDashboardAvvisi() {
        const dashboard = document.getElementById('assegnDashboard');
        if (!dashboard) return;

        const lista = getListaFornitoriCorrente();
        const senzaEmail = lista.filter(f => !(f.email && f.email.trim()));
        const rimSenzaBanca = lista.filter(f => {
            const pag = (f.pagamento || '').toUpperCase();
            const isRim = (pag.includes('RIM') && pag.includes('DIR')) || pag.includes('RIMESSA');
            const noBanca = !((f.banca1 || '').trim());
            return isRim && noBanca;
        });

        const avvisi = [];
        if (senzaEmail.length) avvisi.push({ tipo: 'no_email', text: senzaEmail.length + ' fornitori senza email', count: senzaEmail.length });
        if (rimSenzaBanca.length) avvisi.push({ tipo: 'rim_no_banca', text: rimSenzaBanca.length + ' fornitori con Rimessa Diretta senza banca', count: rimSenzaBanca.length });

        if (!avvisi.length) {
            dashboard.style.display = 'none';
            return;
        }

        dashboard.style.display = '';
        dashboard.innerHTML = avvisi.map(a =>
            '<div class="assegn-avviso' + (_filtroAvvisoAttivo === a.tipo ? ' active' : '') + '" data-avviso="' + a.tipo + '">' +
            '<span class="assegn-avviso-icon">\u26A0\uFE0F</span>' +
            '<span>' + a.text + '</span></div>'
        ).join('');

        dashboard.querySelectorAll('.assegn-avviso').forEach(el => {
            el.addEventListener('click', () => {
                const tipo = el.dataset.avviso;
                if (_filtroAvvisoAttivo === tipo) {
                    _filtroAvvisoAttivo = null;
                    el.classList.remove('active');
                } else {
                    _filtroAvvisoAttivo = tipo;
                    dashboard.querySelectorAll('.assegn-avviso').forEach(a => a.classList.remove('active'));
                    el.classList.add('active');
                }
                applicaFiltri();
            });
        });
    }

    // --------------------------------------------------------
    // ORDINAMENTO
    // --------------------------------------------------------

    function bindSortToolbar() {
        document.querySelectorAll('.assegn-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const campo = btn.dataset.sort;
                if (_ordinamento.campo === campo) {
                    _ordinamento.dir = _ordinamento.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    _ordinamento = { campo, dir: 'asc' };
                }
                document.querySelectorAll('.assegn-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Aggiorna freccia
                document.querySelectorAll('.assegn-sort-btn').forEach(b => {
                    const arrow = b.querySelector('.assegn-sort-arrow');
                    if (arrow) arrow.remove();
                });
                btn.innerHTML += '<span class="assegn-sort-arrow">' + (_ordinamento.dir === 'asc' ? ' \u25B2' : ' \u25BC') + '</span>';
                renderAssegnazioni(getListaOrdinata());
            });
        });
    }

    function getListaOrdinata() {
        const lista = [...getListaFornitoriCorrente()];
        const { campo, dir } = _ordinamento;
        const mult = dir === 'asc' ? 1 : -1;

        lista.sort((a, b) => {
            let va, vb;
            switch (campo) {
                case 'codice':
                    return (a.codice - b.codice) * mult;
                case 'tipo':
                    va = _classificazioneMap[a.codice] || 'ZZZ';
                    vb = _classificazioneMap[b.codice] || 'ZZZ';
                    return va.localeCompare(vb) * mult;
                case 'ultimo_ordine':
                    va = a.ultimo_ordine ? new Date(a.ultimo_ordine).getTime() : 0;
                    vb = b.ultimo_ordine ? new Date(b.ultimo_ordine).getTime() : 0;
                    return (va - vb) * mult;
                default: // nome
                    va = (a.nome || '').toLowerCase();
                    vb = (b.nome || '').toLowerCase();
                    return va.localeCompare(vb) * mult;
            }
        });
        return lista;
    }

    // --------------------------------------------------------
    // APPLICA TEMPLATE IN BATCH
    // --------------------------------------------------------

    function renderBatchBar() {
        // Rimuovi barra precedente
        const old = document.getElementById('assegnBatchBar');
        if (old) old.remove();

        // Conta quanti fornitori visibili
        const righeVisibili = document.querySelectorAll('.assegn-forn-row:not([style*="display: none"])');
        const count = righeVisibili.length;
        const hasFiltri = _filtroTipoAttivi.size > 0 || _filtroAvvisoAttivo ||
                          (document.getElementById('assegnFiltro').value || '').trim();

        // Mostra la barra solo se ci sono filtri attivi e almeno 1 fornitore visibile
        if (!hasFiltri || count === 0) return;

        const optionsHtml = '<option value="">(Scegli template)</option>' +
            _assegnTemplatesList.map(t => '<option value="' + t.id + '">' + esc(t.nome) + (t.isSystem ? ' [S]' : '') + '</option>').join('') +
            '<option value="__REMOVE__">\u274C Rimuovi assegnazione</option>';

        const bar = document.createElement('div');
        bar.id = 'assegnBatchBar';
        bar.className = 'assegn-batch-bar';
        bar.innerHTML =
            '<span class="assegn-batch-info">\uD83C\uDFAF <strong>' + count + '</strong> fornitori selezionati dai filtri</span>' +
            '<select class="assegn-batch-select" id="batchTemplateSelect">' + optionsHtml + '</select>' +
            '<button class="assegn-batch-btn" id="btnApplicaBatch">Applica a tutti</button>';

        const container = document.getElementById('assegnFornitoriList');
        container.parentNode.insertBefore(bar, container);

        document.getElementById('btnApplicaBatch').addEventListener('click', eseguiBatchAssegnazione);
    }

    async function eseguiBatchAssegnazione() {
        const select = document.getElementById('batchTemplateSelect');
        const btn = document.getElementById('btnApplicaBatch');
        if (!select || !select.value) return;

        const isRemove = select.value === '__REMOVE__';
        const templateId = isRemove ? null : parseInt(select.value, 10);

        // Raccogli i codici dei fornitori VISIBILI
        const codici = [];
        document.querySelectorAll('.assegn-forn-row:not([style*="display: none"])').forEach(row => {
            codici.push(row.dataset.codice);
        });

        if (!codici.length) return;

        btn.disabled = true;
        let fakeCount = 0;
        const total = codici.length;
        btn.textContent = 'Applicando... (0/' + total + ')';
        const fakeInterval = setInterval(() => {
            if (fakeCount < total - 1) {
                fakeCount++;
                btn.textContent = 'Applicando... (' + fakeCount + '/' + total + ')';
            }
        }, 3);

        try {
            const res = await fetch('/api/mrp/template-assegnazione-batch', {
                method: 'PUT', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codici, templateId })
            });
            const data = await res.json();
            clearInterval(fakeInterval);
            if (!data.success) throw new Error(data.error || 'Errore');

            btn.textContent = '\u2713 ' + data.count + ' aggiornati!';
            btn.style.background = 'var(--success)';
            btn.style.borderColor = 'var(--success)';

            // Aggiorna cache locale e select nelle righe
            codici.forEach(c => {
                const f = _assegnFornitoriData.find(x => String(x.codice) === c);
                if (f) f.templateId = templateId;
                const sel = document.querySelector('.assegn-forn-select[data-forn="' + c + '"]');
                if (sel) sel.value = templateId || '';
            });

            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = 'Applica a tutti';
                btn.style.background = '';
                btn.style.borderColor = '';
            }, 2000);
        } catch (err) {
            clearInterval(fakeInterval);
            btn.textContent = 'Errore!';
            btn.style.background = 'var(--danger)';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = 'Applica a tutti';
                btn.style.background = '';
                btn.style.borderColor = '';
            }, 2000);
        }
    }

    // --------------------------------------------------------
    // CLASSIFICAZIONE — Filtri chip + leggenda
    // --------------------------------------------------------

    function getListaFornitoriCorrente() {
        // Default: solo fornitori con ordini. Flag "Mostra tutti": include anche quelli senza ordini.
        if (_mostraTuttiFornitori) {
            return _assegnFornitoriData; // tutti (ha_ordini=0 e ha_ordini=1)
        }
        return _assegnFornitoriData.filter(f => f.ha_ordini);
    }

    function contaPerTipo(listaFornitori) {
        const codici = new Set(listaFornitori.map(f => String(f.codice)));
        return {
            IT: Object.entries(_classificazioneMap).filter(([k, v]) => v === 'IT' && codici.has(k)).length,
            UE: Object.entries(_classificazioneMap).filter(([k, v]) => v === 'UE' && codici.has(k)).length,
            EXTRA_UE: Object.entries(_classificazioneMap).filter(([k, v]) => v === 'EXTRA_UE' && codici.has(k)).length
        };
    }

    function renderClassificazioneFiltri() {
        const infoEl = document.getElementById('assegnInfo');
        if (!infoEl) return;

        if (!_classificazioneDisponibile) {
            infoEl.innerHTML = '<span style="color:var(--text-muted);">' + _assegnFornitoriData.length + ' fornitori</span>';
            return;
        }

        const lista = getListaFornitoriCorrente();
        const counts = contaPerTipo(lista);
        const conOrdini = _assegnFornitoriData.filter(f => f.ha_ordini).length;
        const nascosti = _assegnFornitoriData.length - conOrdini;

        infoEl.innerHTML =
            '<div class="assegn-filtro-bar">' +
                '<div class="assegn-filtro-chips">' +
                    '<span class="assegn-filtro-chip" data-filtro="IT">IT <strong>' + counts.IT + '</strong></span>' +
                    '<span class="assegn-filtro-chip" data-filtro="UE">UE <strong>' + counts.UE + '</strong></span>' +
                    '<span class="assegn-filtro-chip" data-filtro="EXTRA_UE">Extra UE <strong>' + counts.EXTRA_UE + '</strong></span>' +
                '</div>' +
                '<div class="assegn-legenda">' +
                    '<label class="assegn-legenda-item" data-tipo="IT"><input type="color" class="assegn-legenda-color" data-tipo="IT" value="#2e7d32"><span>Italia</span></label>' +
                    '<label class="assegn-legenda-item" data-tipo="UE"><input type="color" class="assegn-legenda-color" data-tipo="UE" value="#1565c0"><span>UE</span></label>' +
                    '<label class="assegn-legenda-item" data-tipo="EXTRA_UE"><input type="color" class="assegn-legenda-color" data-tipo="EXTRA_UE" value="#e65100"><span>Extra UE</span></label>' +
                '</div>' +
            '</div>' +
            (nascosti > 0 ? '<div class="assegn-mostra-tutti">' +
                '<label class="assegn-mostra-tutti-label">' +
                    '<input type="checkbox" id="chkMostraTutti"' + (_mostraTuttiFornitori ? ' checked' : '') + '>' +
                    '<span>Mostra tutti i fornitori</span>' +
                    '<span class="assegn-nascosti-count">(' + nascosti + ' senza ordini nascosti)</span>' +
                '</label>' +
            '</div>' : '');

        // Bind: color picker leggenda
        infoEl.querySelectorAll('.assegn-legenda-color').forEach(picker => {
            const tipo = picker.dataset.tipo;
            const varName = '--forn-' + tipo.toLowerCase().replace('_', '-');
            const current = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (current && current.startsWith('#')) picker.value = current;

            picker.addEventListener('input', () => {
                const color = picker.value;
                document.documentElement.style.setProperty(varName, color);
                aggiornaColoriFornitori();
                if (typeof MrpTheme !== 'undefined' && MrpTheme.setColor) {
                    MrpTheme.setColor(varName, color);
                }
            });
        });

        // Bind: chip filtro toggle
        infoEl.querySelectorAll('.assegn-filtro-chip').forEach(chip => {
            // Ripristina stato attivo se era gia selezionato
            if (_filtroTipoAttivi.has(chip.dataset.filtro)) chip.classList.add('active');

            chip.addEventListener('click', () => {
                const tipo = chip.dataset.filtro;
                if (_filtroTipoAttivi.has(tipo)) {
                    _filtroTipoAttivi.delete(tipo);
                    chip.classList.remove('active');
                } else {
                    _filtroTipoAttivi.add(tipo);
                    chip.classList.add('active');
                }
                applicaFiltri();
            });
        });

        // Bind: checkbox mostra tutti
        const chk = document.getElementById('chkMostraTutti');
        if (chk) {
            chk.addEventListener('change', () => {
                _mostraTuttiFornitori = chk.checked;
                renderAssegnazioni(getListaOrdinata());
                renderDashboardAvvisi();
                renderClassificazioneFiltri();
            });
        }
    }

    function aggiornaColoriFornitori() {
        // Rilegge le CSS vars e aggiorna i colori inline su righe e chip
        const colorIT = getComputedStyle(document.documentElement).getPropertyValue('--forn-it').trim() || '#2e7d32';
        const colorUE = getComputedStyle(document.documentElement).getPropertyValue('--forn-ue').trim() || '#1565c0';
        const colorEX = getComputedStyle(document.documentElement).getPropertyValue('--forn-extra-ue').trim() || '#e65100';

        const map = { IT: colorIT, UE: colorUE, EXTRA_UE: colorEX };

        document.querySelectorAll('.assegn-forn-row[data-tipo]').forEach(row => {
            const c = map[row.dataset.tipo];
            if (c) row.style.borderLeftColor = c;
        });
        document.querySelectorAll('.assegn-forn-tipo[data-tipo]').forEach(sel => {
            const c = map[sel.dataset.tipo];
            if (c) {
                sel.style.color = c;
                sel.style.backgroundColor = c + '18'; // alpha ~10%
            }
        });
    }

    function applicaFiltri() {
        const filtroTesto = (document.getElementById('assegnFiltro').value || '').toLowerCase();
        const hasFiltroTipo = _filtroTipoAttivi.size > 0;

        document.querySelectorAll('.assegn-forn-row').forEach(row => {
            const nome = (row.dataset.nome || '').toLowerCase();
            const codice = (row.dataset.codice || '').toLowerCase();
            const tipo = row.dataset.tipo || '';

            const matchTesto = !filtroTesto || nome.includes(filtroTesto) || codice.includes(filtroTesto);
            const matchTipo = !hasFiltroTipo || _filtroTipoAttivi.has(tipo);

            // Filtro avviso
            let matchAvviso = true;
            if (_filtroAvvisoAttivo === 'no_email') {
                matchAvviso = row.dataset.email === '0';
            } else if (_filtroAvvisoAttivo === 'rim_no_banca') {
                const pag = (row.dataset.pagamento || '').toUpperCase();
                const isRim = (pag.includes('RIM') && pag.includes('DIR')) || pag.includes('RIMESSA');
                matchAvviso = isRim && row.dataset.banca === '0';
            }

            row.style.display = (matchTesto && matchTipo && matchAvviso) ? '' : 'none';
        });

        // Aggiorna barra batch dopo ogni filtro
        renderBatchBar();
    }

    function filtroAssegnazioni() {
        applicaFiltri();
    }

    async function salvaTemplateMode(mode) {
        _assegnCurrentMode = mode;
        aggiornaDescrizioneMode(mode);
        try {
            await fetch('/api/mrp/template-mode', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
        } catch (err) {
            console.error('[TemplateMode] Errore salvataggio:', err);
        }
    }

    function aggiornaDescrizioneMode(mode) {
        const desc = document.getElementById('templateModeDesc');
        if (!desc) return;
        if (mode === 'ultima_scelta') {
            desc.textContent = 'Ogni cambio del template nel widget fornitore aggiorna automaticamente anche questa lista.';
        } else {
            desc.textContent = 'Usa i template assegnati qui sotto. Il dropdown nel widget fornitore non modifica queste assegnazioni.';
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('.cfg-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.cfg-tab-panel').forEach(p => p.classList.remove('active'));
        const tab = document.querySelector(`.cfg-tab[data-tab="${tabId}"]`);
        const panel = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
        if (panel) panel.classList.add('active');

        // Carica dati del pannello al primo accesso
        if (tabId === 'tabTemplates') loadTemplates();
        if (tabId === 'tabAssegnazioni') loadAssegnazioni();
    }

    function bindEvents() {
        document.getElementById('btnDbProfile').addEventListener('click', openModal);
        document.getElementById('modalDbClose').addEventListener('click', closeModal);
        document.getElementById('modalDbOverlay').addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });

        // Tab switching
        document.querySelectorAll('.cfg-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });
        document.getElementById('btnDbSave').addEventListener('click', saveProfile);
        document.getElementById('btnDbTestConn').addEventListener('click', testConnection);
        document.getElementById('btnDbCancelEdit').addEventListener('click', resetForm);
        const btnSmtpSave = document.getElementById('btnSmtpSave');
        if (btnSmtpSave) btnSmtpSave.addEventListener('click', saveSmtp);
        const btnSmtpTest = document.getElementById('btnSmtpTest');
        if (btnSmtpTest) btnSmtpTest.addEventListener('click', testSmtp);

        // Template events
        const btnNuovo = document.getElementById('btnNuovoTemplate');
        if (btnNuovo) btnNuovo.addEventListener('click', () => openTemplateEditor(null));
        const btnTplSalva = document.getElementById('btnTplSalva');
        if (btnTplSalva) btnTplSalva.addEventListener('click', saveTemplate);
        const btnTplAnnulla = document.getElementById('btnTplAnnulla');
        if (btnTplAnnulla) btnTplAnnulla.addEventListener('click', closeTemplateEditor);
        const btnTplAnteprima = document.getElementById('btnTplAnteprima');
        if (btnTplAnteprima) btnTplAnteprima.addEventListener('click', previewTemplate);
        const btnSalvaFirma = document.getElementById('btnSalvaFirma');
        if (btnSalvaFirma) btnSalvaFirma.addEventListener('click', saveFirma);

        // Variabili cliccabili — inserisci nel textarea
        document.querySelectorAll('.tpl-var-btn').forEach(btn => {
            btn.addEventListener('click', () => insertVariable(btn.dataset.var));
        });

        // Assegnazioni fornitori
        const assegnFiltro = document.getElementById('assegnFiltro');
        if (assegnFiltro) assegnFiltro.addEventListener('input', filtroAssegnazioni);

        // Radio mode
        document.querySelectorAll('input[name="templateMode"]').forEach(radio => {
            radio.addEventListener('change', () => salvaTemplateMode(radio.value));
        });
    }

    return { init, refreshBadge, switchTo, editProfile, removeProfile, editTemplate: openTemplateEditor, deleteTemplate, reactivateTemplate };
})();
