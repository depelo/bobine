/**
 * MRP Proposta Ordini — Gestione Lista Ordini (proposte fornitori / ordlist)
 */
const MrpProposta = (() => {
    let data = [];

    // Multi-date support: mappa codart|fornitore → array righe originali
    // Popolata da renderProposta, usata dal pannello decisionale multi-data.
    const cardRowsData = new Map();

    async function waitForDB() {
        // Check singolo + 1 retry — il pool DB si connette durante il caricamento della pagina,
        // quindi e quasi sempre pronto. Max 1s di attesa invece dei precedenti 5s.
        try {
            const res = await fetch(`${MrpApp.API_BASE}/health`, { credentials: 'include' });
            const data = await res.json();
            if (data.status === 'ok') return;
        } catch (_) {}
        // 1 retry dopo 1s
        await new Promise(r => setTimeout(r, 1000));
        try {
            const res = await fetch(`${MrpApp.API_BASE}/health`, { credentials: 'include' });
            const data = await res.json();
            if (data.status === 'ok') return;
        } catch (_) {}
    }

    // ── Pannello Selezione Articolo (drawer laterale) ──
    function togglePanelSelezione(forceOpen) {
        const panel = document.getElementById('panelSelezione');
        const overlay = document.getElementById('selezioneOverlay');
        if (!panel) return;
        const isOpen = !panel.classList.contains('collapsed');
        const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
        if (shouldOpen) {
            panel.classList.remove('collapsed');
            if (overlay) overlay.classList.add('open');
        } else {
            panel.classList.add('collapsed');
            if (overlay) overlay.classList.remove('open');
        }
    }

    async function init() {
        const btnRefresh = document.getElementById('btnRefreshProposta');
        if (btnRefresh) btnRefresh.addEventListener('click', caricaProposta);

        const body = document.getElementById('propostaBody');
        if (body) body.addEventListener('click', onPropostaBodyClick);

        // Delegation per pulsanti modifica/rimuovi conferma nei badge articolo
        const listEl = document.getElementById('propostaList');
        if (listEl) {
            listEl.addEventListener('click', onPropostaListBadgeClick);
        }

        // Toggle pannello Selezione Articolo
        const btnToggle = document.getElementById('btnToggleSelezione');
        if (btnToggle) btnToggle.addEventListener('click', () => togglePanelSelezione());
        const overlay = document.getElementById('selezioneOverlay');
        if (overlay) overlay.addEventListener('click', () => togglePanelSelezione(false));

        initStorico();

        await waitForDB();
        caricaProposta();
    }

    function onPropostaListBadgeClick(e) {
        const btnModifica = e.target.closest('.btn-modifica-conferma');
        const btnRimuovi = e.target.closest('.btn-rimuovi-conferma');

        if (btnModifica) {
            e.stopPropagation();
            const key = btnModifica.dataset.key;
            const ordine = MrpApp.state.ordiniConfermati.get(key);
            if (!ordine) return;

            MrpApp.state.propostaCorrente = {
                fornitore_codice: ordine.fornitore_codice,
                fornitore_nome: ordine.fornitore_nome,
                ol_codart: ordine.ol_codart,
                ar_codalt: ordine.ar_codalt,
                ar_descr: ordine.ar_descr,
                ol_fase: ordine.ol_fase,
                ol_magaz: ordine.ol_magaz,
                ol_unmis: ordine.ol_unmis,
                ol_progr: ordine.ol_progr || 0,
                ol_quant: ordine.quantita_proposta,
                ol_prezzo: ordine.prezzo,
                ol_perqta: ordine.perqta || '1',
                ol_datcons: ordine.data_consegna,
                ol_colli: '0',
                ol_ump: '',
                ol_stato: '',
                fase_descr: ''
            };

            MrpParametri.eseguiDiretto({
                codart: ordine.ol_codart,
                fase: ordine.ol_fase || '',
                magaz: ordine.ol_magaz || '',
                descr: ordine.ar_descr || ''
            });
        }

        if (btnRimuovi) {
            e.stopPropagation();
            const key = btnRimuovi.dataset.key;
            modale('question', 'Conferma Rimozione',
                'Rimuovere la conferma per questo articolo?',
                [
                    { label: 'Rimuovi', value: true, style: 'danger' },
                    { label: 'Annulla', value: false, style: 'secondary' }
                ]
            ).then(ok => {
                if (ok) {
                    MrpApp.rimuoviOrdine(key);
                    aggiornaStatoVisivo();
                }
            });
        }
    }

    async function onPropostaBodyClick(e) {
        const header = e.target.closest('.proposta-fornitore-header');
        if (header) {
            const bodyEl = header.nextElementSibling;
            const toggle = header.querySelector('.forn-toggle');
            if (bodyEl && bodyEl.classList.contains('proposta-fornitore-body')) {
                if (bodyEl.style.display === 'none') {
                    bodyEl.style.display = 'block';
                    if (toggle) toggle.textContent = '▼';
                } else {
                    bodyEl.style.display = 'none';
                    if (toggle) toggle.textContent = '▶';
                }
            }
            return;
        }

        const codartEl = e.target.closest('.proposta-art-codart');
        if (!codartEl) return;

        // Pulsanti modifica/rimuovi conferma gestiti da delegation più in basso
        if (e.target.closest('.btn-modifica-conferma') || e.target.closest('.btn-rimuovi-conferma')) return;

        const codartRaw = codartEl.getAttribute('data-codart');
        if (!codartRaw) return;

        // Salva il contesto della riga proposta (usato dal pannello decisionale progressivi)
        MrpApp.state.propostaCorrente = {
            fornitore_codice: codartEl.dataset.fornitore || '',
            fornitore_nome: codartEl.dataset.fornitorenome || '',
            ol_codart: codartEl.dataset.codart || '',
            ar_codalt: codartEl.dataset.codalt || '',
            ar_descr: codartEl.dataset.descr || '',
            ol_fase: codartEl.dataset.fase || '0',
            ol_magaz: codartEl.dataset.magaz || '1',
            ol_unmis: codartEl.dataset.unmis || '',
            ol_progr: codartEl.dataset.olprogr || '0',
            ol_quant: codartEl.dataset.quant || '0',
            ol_prezzo: codartEl.dataset.prezzo || '0',
            ol_perqta: codartEl.dataset.perqta || '1',
            ol_datcons: codartEl.dataset.datcons || '',
            ol_colli: codartEl.dataset.colli || '0',
            ol_ump: codartEl.dataset.ump || '',
            ol_stato: codartEl.dataset.stato || '',
            fase_descr: codartEl.dataset.fasedescr || '',
            // Tutte le righe dell'articolo (multi-data support per pannello decisionale)
            righe: cardRowsData.get(codartRaw.trim() + '|' + (codartEl.dataset.fornitore || '')) || []
        };

        // Chiamata diretta ai progressivi — nessun ponte via form DOM
        MrpParametri.eseguiDiretto({
            codart: codartRaw.trim(),
            fase: codartEl.dataset.fase || '',
            magaz: codartEl.dataset.magaz || '',
            descr: codartEl.dataset.descr || ''
        });
    }

    async function caricaProposta() {
        const listEl = document.getElementById('propostaList');
        const loading = document.getElementById('propostaLoading');
        const stats = document.getElementById('propostaStats');

        if (!listEl) return;

        if (loading) loading.style.display = 'block';
        listEl.innerHTML = '';
        if (stats) stats.innerHTML = '';

        try {
            // Avvia fetch proposta + template email IN PARALLELO (non in serie)
            // I template servono per il render, ma possiamo caricarli mentre la query pesante gira
            const [res, _tplDone] = await Promise.all([
                fetch(`${MrpApp.API_BASE}/proposta-ordini`, { credentials: 'include' }),
                caricaTemplateEmail()
            ]);
            const payload = await res.json();

            if (loading) loading.style.display = 'none';

            if (!res.ok) {
                const msg = payload && payload.error ? payload.error : 'Sconosciuto';
                listEl.innerHTML = `<div class="proposta-loading" style="color:var(--danger)">Errore: ${esc(String(msg))}</div>`;
                return;
            }

            // La risposta è ora un oggetto { elaborazione, righe }
            const righe = payload.righe || payload;
            const elaborazione = payload.elaborazione || null;

            if (!Array.isArray(righe) || !righe.length) {
                listEl.innerHTML = '<div class="proposta-loading">Nessuna proposta ordine presente</div>';
                return;
            }

            data = righe;

            // Elaborazione MRP: usa l'ID dal server (non più generato client-side)
            const prevElabId = MrpApp.state.elaborazioneId;
            if (elaborazione) {
                MrpApp.state.elaborazioneId = String(elaborazione.id);
                MrpApp.state.elaborazione = elaborazione;
                // Se elaborazione cambiata → svuota conferme (nuova sessione MRP)
                if (prevElabId && prevElabId !== String(elaborazione.id)) {
                    MrpApp.state.ordiniConfermati.clear();
                }
            } else {
                // Fallback: genera ID client-side (retrocompatibilità)
                MrpApp.state.elaborazioneId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
                MrpApp.state.elaborazione = null;
            }

            // Inizializza PendingSync e idrata dai pending persistiti lato DB.
            // Nota: hydrateFromDB popola MrpApp.state.ordiniConfermati con le entry
            // non ancora emesse, così il refresh non perde il lavoro dell'operatore.
            try {
                if (window.PendingSync && elaborazione && elaborazione.id) {
                    PendingSync.init({
                        elaborazioneId: String(elaborazione.id),
                        userId: (MrpApp.state && MrpApp.state.userId) || 0
                    });
                    const pendingRows = Array.isArray(payload.ordini_confermati_pending)
                        ? payload.ordini_confermati_pending : [];
                    // Popola Map RAM a partire da SnapshotProposte + pendingRows.
                    // Per ogni row pending trovo la riga corrispondente nella proposta
                    // (usando ol_progr come chiave univoca) e ricostruisco il dato
                    // dell'ordine confermato.
                    const byProgr = new Map();
                    for (const r of data) {
                        if (r.ol_progr) byProgr.set(String(r.ol_progr), r);
                    }
                    for (const p of pendingRows) {
                        const key = String(p.ol_progr);
                        const riga = byProgr.get(key);
                        if (!riga) continue; // orfana → la cleanup al boot se ne occuperà
                        const prezzo = (p.prezzo_override != null) ? Number(p.prezzo_override) : Number(riga.ol_prezzo || 0);
                        MrpApp.state.ordiniConfermati.set(key, {
                            ol_progr: p.ol_progr,
                            fornitore_codice: riga.fornitore_codice,
                            fornitore_nome: riga.fornitore_nome,
                            fornitore_email: riga.fornitore_email,
                            ol_codart: riga.ol_codart,
                            ar_codalt: riga.ar_codalt,
                            ar_descr: riga.ar_descr,
                            ol_fase: riga.ol_fase || 0,
                            ol_magaz: riga.ol_magaz || 1,
                            quantita_confermata: Number(p.quantita_confermata),
                            data_consegna: p.data_consegna || riga.ol_datcons,
                            prezzo: prezzo,
                            perqta: Number(riga.ol_perqta || 1),
                            ol_unmis: riga.ol_unmis,
                            _fromPending: true
                        });
                    }
                    PendingSync.hydrateFromDB(pendingRows, { mergeIntoMap: null });
                }
            } catch (psErr) {
                console.warn('[Proposta] PendingSync init/hydrate fallito (continuo):', psErr.message);
            }

            // Popola ordiniEmessi/ordiniCongelati dal server — le righe con email_inviata
            // vengono filtrate via dalla vista per evitare che l'operatore le riusi per errore.
            const righeVisibili = ripristinaOrdiniEmessiDaServer(data);
            data = righeVisibili;

            renderProposta(righeVisibili, listEl, stats);
        } catch (err) {
            if (loading) loading.style.display = 'none';
            listEl.innerHTML = `<div class="proposta-loading" style="color:var(--danger)">Errore di connessione: ${esc(err.message)}</div>`;
        }
    }

    function renderProposta(righe, listEl, statsEl) {
        cardRowsData.clear();
        const fornitori = new Map();

        for (const r of righe) {
            const fk = String(r.fornitore_codice);
            if (!fornitori.has(fk)) {
                fornitori.set(fk, {
                    codice: fk,
                    nome: r.fornitore_nome || '',
                    articoli: new Map()
                });
            }
            const forn = fornitori.get(fk);
            const ak = r.ol_codart;
            if (!forn.articoli.has(ak)) {
                forn.articoli.set(ak, []);
            }
            forn.articoli.get(ak).push(r);
        }

        let totaleValore = 0;
        let totArticoli = 0;
        fornitori.forEach(f => {
            totArticoli += f.articoli.size;
            f.articoli.forEach(rows => {
                rows.forEach(r => {
                    totaleValore += (Number(r.ol_quant) || 0) * (Number(r.ol_prezzo) || 0) / (Number(r.ol_perqta) || 1);
                });
            });
        });

        if (statsEl) {
            const elab = MrpApp.state.elaborazione;
            let elabHtml = '';
            if (elab) {
                const elabDate = new Date(elab.fingerprint).toLocaleDateString('it-IT', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                elabHtml = `
                    <div class="proposta-stat-item proposta-stat-elab">
                        Elab. <span class="proposta-stat-value">#${elab.id}</span>
                        &mdash; Batch: <span class="proposta-stat-value">${elabDate}</span>
                        &mdash; Gestite: <span class="proposta-stat-value">${elab.totaleGestite}/${elab.totaleProposte}</span>
                    </div>
                `;
            }
            statsEl.innerHTML = `
                <div class="proposta-stat-item">Fornitori: <span class="proposta-stat-value">${fornitori.size}</span></div>
                <div class="proposta-stat-item">Articoli: <span class="proposta-stat-value">${totArticoli}</span></div>
                <div class="proposta-stat-item">Righe: <span class="proposta-stat-value">${righe.length}</span></div>
                <div class="proposta-stat-item">Valore totale: <span class="proposta-stat-value">€ ${fmtNum(totaleValore, 2)}</span></div>
                ${elabHtml}
            `;
        }

        // ─── Sort 4-tier (applicato solo al refresh della pagina) ───
        //   Tier 0: fornitori con almeno un articolo confermato (verdi, ordine da emettere)
        //   Tier 1: fornitori con ordini emessi ed email ancora da inviare
        //   Tier 2: fornitori con ordini congelati (email gia inviata, solo informazione)
        //   Tier 3: fornitori senza attivita
        // Dentro ogni tier: ordine per codice fornitore.
        function tierForForn(fk) {
            // Confermati pending hanno priorita: sono lavoro attivo da emettere.
            const confermati = MrpApp.state.ordiniConfermati;
            for (const [k, v] of confermati) {
                if (String(v && v.fornitore_codice) === fk) return 0;
            }
            if (ordiniEmessi.has(fk)) return 1;
            const extras = ordiniEmessiExtra.get(fk);
            if (extras && extras.length > 0) return 1;
            if (ordiniCongelati.has(fk)) return 2;
            return 3;
        }
        const fornitoriSorted = Array.from(fornitori.entries()).sort((a, b) => {
            const ta = tierForForn(a[0]);
            const tb = tierForForn(b[0]);
            if (ta !== tb) return ta - tb;
            return a[0].localeCompare(b[0], 'it');
        });

        let lastTier = -1;
        for (const [fkIter, forn] of fornitoriSorted) {
            const curTier = tierForForn(fkIter);
            if (lastTier !== -1 && curTier !== lastTier) {
                // Separator tra i tier
                const sep = document.createElement('div');
                sep.className = 'proposta-tier-divider';
                sep.dataset.fromTier = String(lastTier);
                sep.dataset.toTier = String(curTier);
                listEl.appendChild(sep);
            }
            lastTier = curTier;

            const div = document.createElement('div');
            div.className = 'proposta-fornitore';
            div.dataset.tier = String(curTier);

            let valoreFornitore = 0;
            let htmlArticoli = '';

            for (const [codart, rows] of forn.articoli) {
                const first = rows[0];
                // Salva righe originali per il pannello multi-data
                const cardKey = codart + '|' + forn.codice;
                cardRowsData.set(cardKey, rows);
                const flags = [];
                if (first.ar_inesaur === 'S') flags.push('<span class="proposta-flag-esaur">IN ESAUR.</span>');
                if (first.ar_blocco && first.ar_blocco !== 'N') flags.push('<span class="proposta-flag-blocco">BLOCCO</span>');

                const codaltStr = first.ar_codalt && String(first.ar_codalt).trim() !== '' && String(first.ar_codalt).toUpperCase() !== 'NULL'
                    ? `<span class="proposta-art-codalt">(${esc(first.ar_codalt)})</span>`
                    : '';

                const faseStr = first.ol_fase != null && Number(first.ol_fase) !== 0
                    ? `<span class="proposta-art-fase">Fase ${esc(String(first.ol_fase))}${first.fase_descr ? ' — ' + esc(first.fase_descr) : ''}</span>`
                    : '';

                const polStr = String(first.ar_polriord || '').trim().toUpperCase() === 'G'
                    ? '<span class="proposta-art-politica">A fabb</span>'
                    : '';

                let htmlRighe = '';
                let totColli = 0;
                let totQuant = 0;

                for (const r of rows) {
                    totColli += Number(r.ol_colli) || 0;
                    totQuant += Number(r.ol_quant) || 0;
                    valoreFornitore += (Number(r.ol_quant) || 0) * (Number(r.ol_prezzo) || 0) / (Number(r.ol_perqta) || 1);

                    let stato, statoClass;
                    if (r.emesso) {
                        const emailIcon = r.email_inviata ? ' \u2709' : '';
                        const bcubeTag = r.origine === 'bcube' ? ' <span class="proposta-badge-bcube">BCube</span>' : '';
                        stato = `Ordinato ${r.ord_numord || ''}/${r.ord_serie || 'F'}${emailIcon}${bcubeTag}`;
                        statoClass = 'proposta-stato-ordinato';
                    } else {
                        const statoRaw = (r.ol_stato || '').trim();
                        stato = statoRaw === '' ? 'Generato' : esc(statoRaw);
                        statoClass = '';
                    }

                    htmlRighe += `<tr class="${r.emesso ? 'proposta-riga-emessa' : ''}" data-progr="${escAttr(String(r.ol_progr || 0))}">
                        <td>${fmtDate(r.ol_datcons)}</td>
                        <td>${esc(r.ol_unmis)}</td>
                        <td class="num">${fmtNum(r.ol_colli, 3)}</td>
                        <td>${esc(r.ol_ump)}</td>
                        <td class="num">${fmtNum(r.ol_quant, 3)}</td>
                        <td class="${statoClass}">${stato}</td>
                        <td class="num">${r.ol_magaz != null ? esc(String(r.ol_magaz)) : ''}</td>
                        <td class="num">${fmtNum(r.ol_prezzo, 4)}</td>
                        <td>${fmtDate(r.dt_min_ord)}</td>
                    </tr>`;
                }

                const tutteEmesse = rows.every(r => r.emesso);
                const gestitaInElab = tutteEmesse && rows.some(r => r.elaborazione_id === MrpApp.state.elaborazioneId);
                // Raccolta di tutti gli ol_progr per questa card (multi-data support)
                const progrList = rows.map(r => String(r.ol_progr || 0)).filter(p => p !== '0');

                htmlArticoli += `
                <div class="proposta-articolo${gestitaInElab ? ' proposta-art-gestita' : ''}">
                    <div class="proposta-art-header">
                        <span class="proposta-art-codart"
                    data-codart="${escAttr(codart)}"
                    data-fornitore="${escAttr(forn.codice)}"
                    data-fornitorenome="${escAttr(forn.nome)}"
                    data-fase="${escAttr(String(first.ol_fase ?? '0'))}"
                    data-magaz="${escAttr(String(first.ol_magaz ?? '1'))}"
                    data-unmis="${escAttr(first.ol_unmis || '')}"
                    data-olprogr="${escAttr(String(first.ol_progr ?? '0'))}"
                    data-olprogrlist="${escAttr(progrList.join(','))}"
                    data-multidate="${rows.length > 1 ? '1' : '0'}"
                    data-quant="${escAttr(String(first.ol_quant ?? '0'))}"
                    data-prezzo="${escAttr(String(first.ol_prezzo ?? '0'))}"
                    data-perqta="${escAttr(String(first.ol_perqta ?? '1'))}"
                    data-datcons="${escAttr(first.ol_datcons || '')}"
                    data-colli="${escAttr(String(first.ol_colli ?? '0'))}"
                    data-ump="${escAttr(first.ol_ump || '')}"
                    data-stato="${escAttr(first.ol_stato || '')}"
                    data-descr="${escAttr(first.ar_descr || '')}"
                    data-codalt="${escAttr(first.ar_codalt || '')}"
                    data-fasedescr="${escAttr(first.fase_descr || '')}"
                    title="${rows.length > 1 ? 'Clicca per decisione multi-data (' + rows.length + ' date)' : 'Clicca per aprire i Progressivi'}">${esc(String(codart))}</span>
                        ${codaltStr}
                        <span class="proposta-art-descr">${esc(first.ar_descr)}</span>
                        ${rows.length > 1 ? '<span class="proposta-multidate-badge">' + rows.length + ' date</span>' : ''}
                        <span class="proposta-art-flags">${flags.join('')}</span>
                        ${faseStr}
                        ${polStr}
                    </div>
                    <table class="proposta-righe-table">
                        <thead>
                            <tr>
                                <th>Dt.Cons.</th>
                                <th>UM</th>
                                <th class="num">Colli</th>
                                <th>UMP</th>
                                <th class="num">Quantità</th>
                                <th>Stato</th>
                                <th class="num">Mag.</th>
                                <th class="num">Prezzo</th>
                                <th>Dt.M.Ord.</th>
                            </tr>
                        </thead>
                        <tbody>${htmlRighe}</tbody>
                        <tfoot>
                            <tr class="proposta-art-totale">
                                <td>Totale Articolo</td>
                                <td>${esc(rows[0].ol_unmis)}</td>
                                <td class="num">${fmtNum(totColli, 2)}</td>
                                <td>${esc(rows[0].ol_ump)}</td>
                                <td class="num">${fmtNum(totQuant, 2)}</td>
                                <td colspan="4"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>`;
            }

            const fornLabel = forn.nome
                ? `${esc(forn.codice)} — ${esc(forn.nome)}`
                : `Fornitore: ${esc(forn.codice)} (Senza ragione sociale)`;

            const isRelevant = String(forn.codice).startsWith('200');
            div.innerHTML = `
                <div class="proposta-fornitore-header" data-forn="${escAttr(forn.codice)}">
                    <span>${fornLabel}</span>
                    <span class="forn-toggle">${isRelevant ? '▼' : '▶'}</span>
                </div>
                <div class="proposta-fornitore-body" style="${isRelevant ? '' : 'display:none'}">
                    ${htmlArticoli}
                    <div class="proposta-forn-totale">
                        Totale valore fornitore → <span class="valore">€ ${fmtNum(valoreFornitore, 2)}</span>
                    </div>
                </div>
            `;

            listEl.appendChild(div);

            // Tutti gli ordini emessi (primo + extra) come sub-card dentro il body del padre.
            // Ogni ordine ha la sua pulsantiera — la barra blu resta pulita.
            const bodyEl = div.querySelector('.proposta-fornitore-body');
            if (bodyEl) {
                const primoEmesso = ordiniEmessi.get(fkIter);
                const extras = ordiniEmessiExtra.get(fkIter);
                // Inserisci in ordine inverso (insertBefore firstChild) così il primo resta in cima
                if (extras && extras.length > 0) {
                    for (let i = extras.length - 1; i >= 0; i--) {
                        const extraDiv = buildBloccoOrdineExtra(forn, extras[i]);
                        if (extraDiv) bodyEl.insertBefore(extraDiv, bodyEl.firstChild);
                    }
                }
                if (primoEmesso && primoEmesso.righe && primoEmesso.righe.length > 0) {
                    const primoDiv = buildBloccoOrdineExtra(forn, primoEmesso);
                    if (primoDiv) bodyEl.insertBefore(primoDiv, bodyEl.firstChild);
                }
            }
        }

        // Ripristina gli stati visivi degli ordini già confermati
        aggiornaStatoVisivo();
    }

    /**
     * Phase 6: Costruisce un sub-blocco per un ordine extra (2°+ ordine per lo stesso fornitore).
     * Renderizzato come sub-card indentata dentro il body del fornitore padre.
     */
    function buildBloccoOrdineExtra(forn, extra) {
        const righe = extra.righe || [];
        if (righe.length === 0) return null;

        const bcubeLabel = extra.origine === 'bcube' ? ' <span class="proposta-badge-bcube">BCube</span>' : '';

        let htmlRighe = '';
        let totaleValore = 0;
        for (const r of righe) {
            const valore = (Number(r.ol_quant) || 0) * (Number(r.ol_prezzo) || 0) / (Number(r.ol_perqta) || 1);
            totaleValore += valore;
            htmlRighe += `<tr>
                <td>${esc(r.ol_codart)}</td>
                <td>${esc(r.ar_descr || '')}</td>
                <td>${fmtDate(r.ol_datcons)}</td>
                <td>${esc(r.ol_unmis || 'PZ')}</td>
                <td class="num">${fmtNum(r.ol_quant, 3)}</td>
                <td class="num">${fmtNum(r.ol_prezzo, 4)}</td>
                <td class="num">\u20ac ${fmtNum(valore, 2)}</td>
            </tr>`;
        }

        const div = document.createElement('div');
        div.className = 'proposta-ordine-extra';
        div.innerHTML = `
            <div class="proposta-extra-header" data-forn="${escAttr(forn.codice)}"
                 data-extra-anno="${escAttr(String(extra.anno))}"
                 data-extra-serie="${escAttr(extra.serie)}"
                 data-extra-numord="${escAttr(String(extra.numord))}">
                <span class="extra-label">Ordine separato <strong>${esc(String(extra.numord))}/${esc(extra.serie)}</strong>${bcubeLabel}</span>
                <span class="extra-actions"></span>
            </div>
            <table class="proposta-extra-table">
                <thead>
                    <tr>
                        <th>Cod. Articolo</th>
                        <th>Descrizione</th>
                        <th>Dt.Cons.</th>
                        <th>UM</th>
                        <th class="num">Quantit\u00e0</th>
                        <th class="num">Prezzo</th>
                        <th class="num">Valore</th>
                    </tr>
                </thead>
                <tbody>${htmlRighe}</tbody>
            </table>
            <div class="extra-totale">
                Totale ordine \u2192 <strong>\u20ac ${fmtNum(totaleValore, 2)}</strong>
            </div>
        `;

        return div;
    }

    function fmtNum(n, decimals) {
        if (n === null || n === undefined) return '';
        const num = Number(n);
        if (Number.isNaN(num)) return '';
        return num.toLocaleString('it-IT', {
            minimumFractionDigits: decimals || 0,
            maximumFractionDigits: decimals || 0
        });
    }

    function fmtDate(d) {
        if (!d) return '';
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return '';
        return dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escAttr(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function aggiornaStatoVisivo() {
        const confermati = MrpApp.state.ordiniConfermati;

        // Rimuovi card scorporate dal ciclo precedente
        document.querySelectorAll('.proposta-scorporo').forEach(el => el.remove());

        document.querySelectorAll('.proposta-articolo').forEach(artEl => {
            const codartEl = artEl.querySelector('.proposta-art-codart');
            if (!codartEl) return;

            artEl.classList.remove('proposta-art-confermato');
            artEl.querySelectorAll('.proposta-conferma-badge').forEach(b => b.remove());

            // Ripristina righe nascoste dal ciclo precedente
            artEl.querySelectorAll('tr[data-progr]').forEach(tr => { tr.style.display = ''; });
            // Ripristina badge "N date" originale
            const mdBadge = artEl.querySelector('.proposta-multidate-badge');

            const progrList = (codartEl.dataset.olprogrlist || '').split(',').filter(Boolean);
            const ordiniCard = [];
            for (const p of progrList) {
                const ordine = confermati.get(p);
                if (ordine) ordiniCard.push({ key: p, ordine });
            }
            // Fallback card singola
            if (progrList.length === 0) {
                const singleProgr = codartEl.dataset.olprogr || '0';
                const ordine = confermati.get(singleProgr);
                if (ordine) ordiniCard.push({ key: singleProgr, ordine });
            }

            const isMulti = progrList.length > 1;
            const tuttiConfermati = isMulti && ordiniCard.length === progrList.length;
            const parziale = isMulti && ordiniCard.length > 0 && !tuttiConfermati;

            if (parziale) {
                // ── SCORPORO: conferme parziali su card multi-data ──
                // Nascondi le righe confermate nella tabella originale
                for (const { key } of ordiniCard) {
                    const tr = artEl.querySelector(`tr[data-progr="${key}"]`);
                    if (tr) tr.style.display = 'none';
                }
                // Aggiorna badge "N date" con il conteggio residuo
                const residue = progrList.length - ordiniCard.length;
                if (mdBadge) mdBadge.textContent = residue + ' date';

                // Ricalcola totale articolo visibile (solo righe non nascoste)
                _ricalcolaTotaleArticolo(artEl);

                // Crea mini-card scorporate per le righe confermate, inserite PRIMA della card
                for (const { key, ordine } of ordiniCard) {
                    const scorporo = _buildScorporoCard(ordine, key, codartEl);
                    artEl.parentElement.insertBefore(scorporo, artEl);
                }
            } else if (ordiniCard.length > 0) {
                // ── TUTTO CONFERMATO o SINGOLA ──
                artEl.classList.add('proposta-art-confermato');
                for (const { key, ordine } of ordiniCard) {
                    const badge = document.createElement('div');
                    badge.className = 'proposta-conferma-badge proposta-badge-confermato';
                    const dataFmt = ordine.data_consegna
                        ? new Date(ordine.data_consegna).toLocaleDateString('it-IT') : '';
                    const valore = ordine.quantita_confermata * ordine.prezzo / (Number(ordine.perqta) || 1);
                    badge.innerHTML =
                        '<span class="conferma-icon">&#x2713;</span> '
                        + '<strong>' + Number(ordine.quantita_confermata).toLocaleString('it-IT') + ' ' + esc(ordine.ol_unmis || 'PZ') + '</strong>'
                        + ' entro ' + esc(dataFmt)
                        + (valore > 0 ? ' &mdash; &euro; ' + valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
                        + ' <button class="btn-modifica-conferma" data-key="' + escAttr(key) + '" title="Modifica">&#9998;</button>'
                        + ' <button class="btn-rimuovi-conferma" data-key="' + escAttr(key) + '" title="Rimuovi conferma">&#128465;</button>';
                    artEl.appendChild(badge);
                }
            }
        });

        aggiornaBarreFornitori();
    }

    /**
     * Costruisce una mini-card "scorporata" per una riga confermata estratta
     * da una card multi-data. Stile coerente con le card articolo.
     */
    function _buildScorporoCard(ordine, key, codartEl) {
        const div = document.createElement('div');
        div.className = 'proposta-articolo proposta-scorporo proposta-art-confermato';

        const dataFmt = ordine.data_consegna
            ? new Date(ordine.data_consegna).toLocaleDateString('it-IT') : '';
        const valore = ordine.quantita_confermata * ordine.prezzo / (Number(ordine.perqta) || 1);

        div.innerHTML = `
            <div class="proposta-art-header">
                <span class="proposta-art-codart"
                    data-codart="${escAttr(ordine.ol_codart)}"
                    data-fornitore="${escAttr(ordine.fornitore_codice)}"
                    data-fornitorenome="${escAttr(ordine.fornitore_nome || '')}"
                    data-fase="${escAttr(String(ordine.ol_fase || '0'))}"
                    data-magaz="${escAttr(String(ordine.ol_magaz || '1'))}"
                    data-unmis="${escAttr(ordine.ol_unmis || 'PZ')}"
                    data-olprogr="${escAttr(String(ordine.ol_progr || 0))}"
                    data-olprogrlist="${escAttr(String(ordine.ol_progr || 0))}"
                    data-multidate="0"
                    data-quant="${escAttr(String(ordine.quantita_confermata))}"
                    data-prezzo="${escAttr(String(ordine.prezzo || 0))}"
                    data-perqta="${escAttr(String(ordine.perqta || 1))}"
                    data-datcons="${escAttr(ordine.data_consegna || '')}"
                    data-descr="${escAttr(ordine.ar_descr || '')}"
                    data-codalt="${escAttr(ordine.ar_codalt || '')}"
                    title="Clicca per aprire i Progressivi">${esc(ordine.ol_codart)}</span>
                <span class="proposta-art-descr">${esc(ordine.ar_descr || '')}</span>
                <span class="proposta-scorporo-label">consegna ${esc(dataFmt)}</span>
            </div>
            <div class="proposta-conferma-badge proposta-badge-confermato">
                <span class="conferma-icon">&#x2713;</span>
                <strong>${Number(ordine.quantita_confermata).toLocaleString('it-IT')} ${esc(ordine.ol_unmis || 'PZ')}</strong>
                entro ${esc(dataFmt)}
                ${valore > 0 ? ' &mdash; &euro; ' + valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                <button class="btn-modifica-conferma" data-key="${escAttr(key)}" title="Modifica">&#9998;</button>
                <button class="btn-rimuovi-conferma" data-key="${escAttr(key)}" title="Rimuovi conferma">&#128465;</button>
            </div>
        `;

        return div;
    }

    /**
     * Ricalcola il totale articolo nella card dopo aver nascosto righe scorporate.
     */
    function _ricalcolaTotaleArticolo(artEl) {
        const tfoot = artEl.querySelector('.proposta-art-totale');
        if (!tfoot) return;
        let totColli = 0, totQuant = 0;
        artEl.querySelectorAll('tbody tr[data-progr]').forEach(tr => {
            if (tr.style.display === 'none') return;
            const cells = tr.querySelectorAll('td');
            if (cells.length >= 5) {
                const colli = parseFloat((cells[2].textContent || '0').replace(/\./g, '').replace(',', '.')) || 0;
                const quant = parseFloat((cells[4].textContent || '0').replace(/\./g, '').replace(',', '.')) || 0;
                totColli += colli;
                totQuant += quant;
            }
        });
        const tds = tfoot.querySelectorAll('td');
        if (tds.length >= 5) {
            tds[2].textContent = fmtNum(totColli, 2);
            tds[4].textContent = fmtNum(totQuant, 2);
        }
    }

    function aggiornaBarreFornitori() {
        const confermati = MrpApp.state.ordiniConfermati;

        document.querySelectorAll('.proposta-fornitore').forEach(fornEl => {
            const header = fornEl.querySelector('.proposta-fornitore-header');
            const articoli = fornEl.querySelectorAll('.proposta-articolo');
            if (!header || articoli.length === 0) return;

            const fornCode = header.dataset.forn;
            let conteggioConfermati = 0;
            let totaleValore = 0;

            // Conta conferme per fornitore scorrendo tutti gli ol_progr confermati
            confermati.forEach((ordine, key) => {
                if (String(ordine.fornitore_codice) === String(fornCode)) {
                    conteggioConfermati++;
                    totaleValore += ordine.quantita_confermata * ordine.prezzo / (Number(ordine.perqta) || 1);
                }
            });

            header.classList.remove('fornitore-completato', 'fornitore-parziale', 'fornitore-emesso');

            let statoBadge = header.querySelector('.fornitore-stato-badge');
            if (!statoBadge) {
                statoBadge = document.createElement('span');
                statoBadge.className = 'fornitore-stato-badge';
                header.appendChild(statoBadge);
            }

            // Rimuovi vecchi pulsanti/badge
            const oldBtn = header.querySelector('.btn-emetti-ordine');
            if (oldBtn) oldBtn.remove();
            header.querySelectorAll('.fornitore-emesso-badge').forEach(el => el.remove());
            const oldCongelato = header.querySelector('.fornitore-congelato-badge');
            if (oldCongelato) oldCongelato.remove();

            // Badge informativo ordini già emessi + email inviata (congelati)
            const congelati = ordiniCongelati.get(fornCode);
            if (congelati && congelati.length > 0) {
                const congBadge = document.createElement('span');
                congBadge.className = 'fornitore-congelato-badge';
                const labels = congelati.map(c => {
                    const dt = c.email_inviata_il
                        ? ' il ' + new Date(c.email_inviata_il).toLocaleDateString('it-IT')
                        : '';
                    return '\u2709 ' + c.numord + '/' + c.serie + dt;
                }).join(' · ');
                congBadge.innerHTML = '\u2713 Ordine emesso e inviato: ' + esc(labels);
                congBadge.title = 'Articoli di questi ordini nascosti dalla vista (email già inviata)';
                header.appendChild(congBadge);
            }

            // Ordini emessi: i pulsanti PDF/Email/Annulla sono nei sub-blocchi dentro il body,
            // non nella barra blu. Qui aggiorniamo solo le pulsantiere dei sub-blocchi.
            const emesso = ordiniEmessi.get(fornCode);
            if (emesso) {
                header.classList.add('fornitore-emesso');
                aggiornaHeaderOrdineExtra(fornCode, emesso);
            }

            const extras = ordiniEmessiExtra.get(fornCode);
            if (extras && extras.length > 0) {
                for (const ex of extras) {
                    aggiornaHeaderOrdineExtra(fornCode, ex);
                }
            }

            // Nuova regola: basta 1 articolo confermato per sbloccare l'emissione.
            // Lo stato di emissione (nessuno/email_pending/email_sent) è esposto su dataset
            // per facilitare il batch handler "Emetti Tutti".
            let statoEmissione = 'nessuno';
            if (emesso) statoEmissione = 'email_pending';
            else if (congelati && congelati.length > 0) statoEmissione = 'email_sent';
            header.dataset.statoEmissione = statoEmissione;
            header.dataset.conteggioConfermati = String(conteggioConfermati);

            if (conteggioConfermati > 0) {
                header.classList.add('fornitore-completato');
                statoBadge.textContent = '\u2713 ' + conteggioConfermati + ' art. \u2014 \u20ac '
                    + totaleValore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                statoBadge.style.display = '';

                const btn = document.createElement('button');
                btn.className = 'btn-emetti-ordine';
                btn.textContent = 'Emetti (' + conteggioConfermati + ') \u2192';
                btn.dataset.forn = fornCode;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    apriModaleEmettiOrdine(fornCode);
                });
                header.appendChild(btn);
            } else {
                statoBadge.style.display = 'none';
            }
        });

        aggiornaBarraEmettiTutti();
    }

    // ============================================================
    // ORDINI GIA EMESSI (ripristinati dal server ad ogni caricamento)
    // ============================================================
    const ordiniEmessi = new Map(); // key = fornitore_codice, value = { anno, serie, numord, pdf_base64, pdf_filename, email, fornitore_nome }
    // 2° e successivi ordini pending per lo stesso fornitore (caso raro: operatore ha
    // emesso volontariamente più ordini separati). ordiniEmessi contiene il primo,
    // questa Map contiene gli extra. Ogni entry ha la stessa shape di ordiniEmessi.
    const ordiniEmessiExtra = new Map(); // key = fornitore_codice, value = Array<ordine>
    // Ordini "congelati" — già emessi E con email inviata. Righe escluse dalla vista proposta.
    const ordiniCongelati = new Map(); // key = fornitore_codice, value = [ { anno, serie, numord, email_inviata_il, fornitore_nome } ]

    // Cache PDF in memoria per la sessione (i PDF non sono nel DB, solo nel response dell'emissione)
    const pdfCache = new Map(); // key = "anno|serie|numord", value = { pdf_base64, pdf_filename }

    function pdfCacheKey(anno, serie, numord) {
        return `${anno}|${serie}|${numord}`;
    }

    /**
     * Ripristina ordiniEmessi + ordiniCongelati dalla risposta del server.
     * - Righe con emesso=true + email_inviata=false → ordiniEmessi (email-pending, mutabile via merge)
     * - Righe con emesso=true + email_inviata=true → ordiniCongelati (filtrate dalla vista)
     * Ritorna l'array di righe da mostrare (escluse le congelate).
     */
    function ripristinaOrdiniEmessiDaServer(righe) {
        ordiniEmessi.clear();
        ordiniEmessiExtra.clear();
        ordiniCongelati.clear();

        // Raggruppa righe emesse per fornitore e per (anno|serie|numord)
        const pendingByForn = new Map(); // fk -> { ordKey -> entry }
        const congelatiByForn = new Map(); // fk -> Map<ordKey, entry>
        const righeFiltrate = [];

        for (const r of righe) {
            if (r.emesso && r.email_inviata) {
                const fk = String(r.fornitore_codice);
                const ordKey = `${r.ord_anno}|${r.ord_serie}|${r.ord_numord}`;
                if (!congelatiByForn.has(fk)) congelatiByForn.set(fk, new Map());
                if (!congelatiByForn.get(fk).has(ordKey)) {
                    congelatiByForn.get(fk).set(ordKey, {
                        anno: r.ord_anno,
                        serie: r.ord_serie,
                        numord: r.ord_numord,
                        email_inviata_il: r.email_inviata_il || null,
                        fornitore_nome: r.fornitore_nome || '',
                        fornitore_codice: fk,
                        origine: r.origine || 'gb2'
                    });
                }
                // Riga nascosta dalla vista
                continue;
            }
            righeFiltrate.push(r);

            if (r.emesso && !r.email_inviata) {
                const fk = String(r.fornitore_codice);
                const ordKey = `${r.ord_anno}|${r.ord_serie}|${r.ord_numord}`;
                if (!pendingByForn.has(fk)) pendingByForn.set(fk, new Map());
                if (!pendingByForn.get(fk).has(ordKey)) {
                    pendingByForn.get(fk).set(ordKey, {
                        anno: r.ord_anno,
                        serie: r.ord_serie,
                        numord: r.ord_numord,
                        fornitore_nome: r.fornitore_nome || '',
                        fornitore_codice: fk,
                        fornitore_email: r.fornitore_email || '',
                        origine: r.origine || 'gb2',
                        righe: []
                    });
                }
                pendingByForn.get(fk).get(ordKey).righe.push(r);
            }
        }

        // Filtra da righeFiltrate TUTTE le righe emesse pending (primo + extra).
        // Ogni ordine emesso ha il proprio sub-blocco nel body del fornitore,
        // quindi le righe non devono apparire anche nella lista proposte.
        const emesseRigheSet = new Set();
        for (const [fk, ordMap] of pendingByForn) {
            for (const [ordKey, entry] of ordMap) {
                for (const r of entry.righe) {
                    emesseRigheSet.add(fk + '|' + String(r.ol_progr || r.ol_codart + '|' + (r.ol_fase || 0) + '|' + (r.ol_magaz || 1)));
                }
            }
        }
        const righeFiltrateFinal = righeFiltrate.filter(r => {
            if (!r.emesso) return true;
            const fk = String(r.fornitore_codice);
            const rKey = fk + '|' + String(r.ol_progr || r.ol_codart + '|' + (r.ol_fase || 0) + '|' + (r.ol_magaz || 1));
            return !emesseRigheSet.has(rKey);
        });

        // Popola ordiniEmessi con il primo ordine pending per fornitore e ordiniEmessiExtra
        // con eventuali successivi (caso raro: operatore ha creato più ordini separati).
        for (const [fk, ordMap] of pendingByForn) {
            const entries = Array.from(ordMap.values());
            const primo = entries[0];
            const cached = pdfCache.get(pdfCacheKey(primo.anno, primo.serie, primo.numord)) || {};
            ordiniEmessi.set(fk, {
                anno: primo.anno,
                serie: primo.serie,
                numord: primo.numord,
                pdf_base64: cached.pdf_base64 || null,
                pdf_filename: cached.pdf_filename || null,
                email: '',
                email_inviata: false,
                email_inviata_il: null,
                fornitore_nome: primo.fornitore_nome,
                fornitore_codice: fk,
                fornitore_email: primo.fornitore_email,
                origine: primo.origine,
                righe: primo.righe || []
            });
            if (entries.length > 1) {
                const extras = entries.slice(1).map(e => ({
                    anno: e.anno,
                    serie: e.serie,
                    numord: e.numord,
                    pdf_base64: null,
                    pdf_filename: null,
                    email: '',
                    email_inviata: false,
                    email_inviata_il: null,
                    fornitore_nome: e.fornitore_nome,
                    fornitore_codice: fk,
                    fornitore_email: e.fornitore_email,
                    origine: e.origine,
                    righe: e.righe || []
                }));
                ordiniEmessiExtra.set(fk, extras);
            }
        }

        // Popola ordiniCongelati
        for (const [fk, ordMap] of congelatiByForn) {
            ordiniCongelati.set(fk, Array.from(ordMap.values()));
        }

        return righeFiltrateFinal;
    }

    /**
     * Phase 6: Aggiunge pulsanti PDF/Email/Annulla al blocco ordine extra.
     * I pulsanti usano le stesse classi del badge ordine principale per coerenza visiva.
     */
    /**
     * Aggiunge pulsanti PDF / Template / Email / Annulla al sub-blocco ordine.
     * Usato sia per il primo ordine che per gli extra — stessa pulsantiera per tutti.
     */
    function aggiornaHeaderOrdineExtra(fornCode, emesso) {
        const sel = `.proposta-extra-header[data-forn="${fornCode}"][data-extra-numord="${emesso.numord}"][data-extra-serie="${emesso.serie}"]`;
        const headerEl = document.querySelector(sel);
        if (!headerEl) return;

        const actionsEl = headerEl.querySelector('.extra-actions');
        if (!actionsEl) return;
        actionsEl.innerHTML = '';

        // PDF
        const btnPdf = document.createElement('button');
        btnPdf.className = 'btn-scarica-pdf-forn';
        btnPdf.textContent = '\u2B07 PDF';
        btnPdf.title = 'Scarica PDF ordine';
        btnPdf.addEventListener('click', (e) => { e.stopPropagation(); scaricaPdf(emesso); });
        actionsEl.appendChild(btnPdf);

        // Template select
        const tplSelectHtml = buildTemplateSelect(fornCode);
        if (tplSelectHtml) {
            const tplWrapper = document.createElement('span');
            tplWrapper.innerHTML = tplSelectHtml;
            const selectEl = tplWrapper.firstElementChild;
            selectEl.addEventListener('click', (e) => e.stopPropagation());
            selectEl.addEventListener('change', (e) => {
                e.stopPropagation();
                onTemplateSelectChange(fornCode, parseInt(selectEl.value, 10));
            });
            actionsEl.appendChild(selectEl);
        }

        // Email
        const btnEmail = document.createElement('button');
        btnEmail.className = 'btn-invia-email-forn';
        if (emesso.email_inviata) {
            btnEmail.textContent = '\u2709 Re-invia Email';
            btnEmail.classList.add('email-gia-inviata');
        } else {
            btnEmail.textContent = '\u2709 Invia Email';
            btnEmail.classList.add('email-non-inviata');
        }
        btnEmail.addEventListener('click', (e) => {
            e.stopPropagation();
            const tplSel = actionsEl.querySelector('.select-template-forn');
            const templateId = tplSel ? parseInt(tplSel.value, 10) : null;
            inviaEmailOrdine(emesso, { template_id: templateId });
        });
        actionsEl.appendChild(btnEmail);

        // Annulla (solo se email non ancora inviata)
        if (!emesso.email_inviata) {
            const btnAnnulla = document.createElement('button');
            btnAnnulla.className = 'btn-annulla-ordine';
            btnAnnulla.textContent = '\u274C Annulla';
            btnAnnulla.title = 'Annulla ordine ' + emesso.numord + '/' + emesso.serie;
            btnAnnulla.addEventListener('click', (e) => {
                e.stopPropagation();
                apriModaleAnnullaOrdine(emesso);
            });
            actionsEl.appendChild(btnAnnulla);
        }
    }

    // ============================================================
    // BARRA GLOBALE "EMETTI TUTTI"
    // ============================================================
    function aggiornaBarraEmettiTutti() {
        const listEl = document.getElementById('propostaList');
        if (!listEl) return;

        let barraEl = document.getElementById('barraEmettiTutti');
        // Fornitori con >=1 articolo confermato (tutti potenzialmente emettibili).
        // Quelli email-pending faranno partire un dialog merge e vengono skippati dal batch,
        // ma li contiamo comunque come "pronti" per il wording del bottone.
        const completati = document.querySelectorAll('.proposta-fornitore-header.fornitore-completato');

        let fornitoriPronti = 0;
        completati.forEach(h => {
            if (Number(h.dataset.conteggioConfermati || '0') > 0) fornitoriPronti++;
        });

        // Conta email pendenti (emessi ma email non ancora inviata) — include anche gli extras.
        let emailPendenti = 0;
        ordiniEmessi.forEach(emesso => {
            if (!emesso.email_inviata) emailPendenti++;
        });
        ordiniEmessiExtra.forEach(arr => {
            for (const ex of arr) { if (!ex.email_inviata) emailPendenti++; }
        });

        if (fornitoriPronti === 0 && emailPendenti === 0) {
            if (barraEl) barraEl.style.display = 'none';
            return;
        }

        if (!barraEl) {
            barraEl = document.createElement('div');
            barraEl.id = 'barraEmettiTutti';
            barraEl.className = 'proposta-emetti-tutti-bar';
            listEl.parentNode.insertBefore(barraEl, listEl);
        }

        // Costruisci testo info dinamico
        const infoParts = [];
        if (fornitoriPronti > 0) {
            infoParts.push(`<span class="emetti-count">${fornitoriPronti}</span> pronto${fornitoriPronti > 1 ? 'i' : ''} per l'emissione`);
        }
        if (emailPendenti > 0) {
            infoParts.push(`<span class="emetti-count">${emailPendenti}</span> email da inviare`);
        }

        // Costruisci bottoni
        let bottoni = '';
        const emissioneAttiva = _batchUnifiedState.active && _batchUnifiedState.emissioneProgress.done < _batchUnifiedState.emissioneProgress.total;
        if (emissioneAttiva) {
            bottoni += `<button type="button" class="btn-emetti-tutti" id="btnMostraProgresso">\uD83D\uDCCA Mostra progresso</button>`;
        } else if (fornitoriPronti > 0) {
            bottoni += `<button type="button" class="btn-emetti-tutti" id="btnEmettiTutti">&#x1F4E8; Emetti Tutti</button>`;
        }
        if (emailPendenti > 0 && !emissioneAttiva) {
            bottoni += `<button type="button" class="btn-invia-tutte-email" id="btnInviaTutteEmail">\u2709\uFE0F Invia Tutte le Email</button>`;
        }

        barraEl.style.display = 'flex';
        barraEl.innerHTML = `
            <div class="emetti-tutti-info">${infoParts.join(' \u00B7 ')}</div>
            <div class="emetti-tutti-azioni">${bottoni}</div>
        `;

        const btnEmetti = document.getElementById('btnEmettiTutti');
        if (btnEmetti) btnEmetti.addEventListener('click', emettiTuttiHandler);
        const btnProgresso = document.getElementById('btnMostraProgresso');
        if (btnProgresso) btnProgresso.addEventListener('click', () => inviaTutteEmailHandler());
        const btnEmail = document.getElementById('btnInviaTutteEmail');
        if (btnEmail) btnEmail.addEventListener('click', inviaTutteEmailHandler);
    }

    // ============================================================
    // MODALE GENERICA (sostituisce alert/confirm)
    // ============================================================
    // Modale con scheda fornitore + form bancario editabile (per warning pre-email)
    function modaleBancaMancante(fornitore, warningMsg) {
        return new Promise(resolve => {
            const id = 'modalBancaWarn_' + Date.now();
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.className = 'mrp-modal-overlay open';

            const bankFormHtml =
                '<div class="bank-form" data-codice="' + fornitore.codice + '" style="margin-top:10px;">' +
                '<div class="bank-form-title">\uD83C\uDFE6 Dati bancari</div>' +
                '<div class="bank-form-row"><label>Banca</label><input type="text" name="banca1" value="' + esc(fornitore.banca1 || '') + '" placeholder="Nome banca"></div>' +
                '<div class="bank-form-row"><label>Filiale</label><input type="text" name="banca2" value="' + esc(fornitore.banca2 || '') + '" placeholder="Filiale / Agenzia"></div>' +
                '<div class="bank-form-row-double">' +
                    '<div><label>ABI</label><input type="text" name="abi" value="' + (fornitore.abi > 0 ? String(fornitore.abi).padStart(5,'0') : '') + '" maxlength="5" placeholder="00000"></div>' +
                    '<div><label>CAB</label><input type="text" name="cab" value="' + (fornitore.cab > 0 ? String(fornitore.cab).padStart(5,'0') : '') + '" maxlength="5" placeholder="00000"></div>' +
                '</div>' +
                '<div class="bank-form-row"><label>IBAN</label><input type="text" name="iban" value="' + esc(fornitore.iban || '') + '" placeholder="IT00X0000000000000000000000" style="font-family:monospace;letter-spacing:1px;"></div>' +
                '<div class="bank-form-row"><label>SWIFT</label><input type="text" name="swift" value="' + esc(fornitore.swift || '') + '" maxlength="14" placeholder="BPPIITRRXXX" style="font-family:monospace;"></div>' +
                '<div class="bank-form-actions"><button class="bank-form-save" id="' + id + '_save">Salva dati bancari</button></div>' +
                '</div>';

            overlay.innerHTML =
                '<div class="mrp-modal" style="max-width:520px;">' +
                    '<div class="mrp-modal-header"><h3>\u26A0\uFE0F Dati bancari mancanti</h3>' +
                    '<button class="mrp-modal-close" id="' + id + '_close">&times;</button></div>' +
                    '<div style="padding:16px 20px;">' +
                        '<div style="margin-bottom:12px;">' +
                            '<div style="font-size:1rem; font-weight:700;">' + esc(fornitore.nome || '') + '</div>' +
                            '<div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">' +
                                '\uD83D\uDCCD ' + esc(fornitore.indirizzo || '') + (fornitore.citta ? ' \u2014 ' + esc(fornitore.citta) : '') +
                            '</div>' +
                            (fornitore.email ? '<div style="font-size:0.78rem; margin-top:2px;">\u2709 ' + esc(fornitore.email) + '</div>' : '') +
                            '<div style="font-size:0.78rem; margin-top:2px;">\uD83D\uDCB3 ' + esc(fornitore.pagamento || 'N/D') + '</div>' +
                        '</div>' +
                        '<div style="font-size:0.82rem; color:var(--danger); margin-bottom:8px;">' + esc(warningMsg) + '</div>' +
                        bankFormHtml +
                        '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">' +
                            '<button class="mrp-btn-secondary" id="' + id + '_cancel">Annulla</button>' +
                            '<button class="mrp-btn-primary" id="' + id + '_send" style="background:var(--warning); border-color:var(--warning);">Invia senza banca</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Close / Cancel
            document.getElementById(id + '_close').addEventListener('click', () => { overlay.remove(); resolve('cancel'); });
            document.getElementById(id + '_cancel').addEventListener('click', () => { overlay.remove(); resolve('cancel'); });

            // Invia senza banca
            document.getElementById(id + '_send').addEventListener('click', () => { overlay.remove(); resolve('send_anyway'); });

            // Salva dati bancari
            document.getElementById(id + '_save').addEventListener('click', async () => {
                const form = overlay.querySelector('.bank-form');
                const btn = document.getElementById(id + '_save');
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
                    const res = await fetch(MrpApp.API_BASE + '/fornitore-anagrafica/' + fornitore.codice, {
                        method: 'PUT', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error('Errore');

                    btn.textContent = '\u2713 Salvato!';
                    btn.className = 'bank-form-save success';
                    form.querySelectorAll('input').forEach(i => i.classList.add('saved'));

                    // Cambia il bottone "Invia senza banca" in "Invia email"
                    const sendBtn = document.getElementById(id + '_send');
                    sendBtn.textContent = 'Invia email';
                    sendBtn.style.background = 'var(--primary)';
                    sendBtn.style.borderColor = 'var(--primary)';

                    // Click su "Invia email" → resolve saved
                    sendBtn.onclick = () => { overlay.remove(); resolve('saved'); };
                } catch (err) {
                    btn.textContent = 'Errore!';
                    btn.style.background = 'var(--danger)';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = 'Salva dati bancari';
                        btn.style.background = '';
                    }, 2000);
                }
            });
        });
    }

    function modale(tipo, titolo, messaggio, pulsanti) {
        return new Promise(resolve => {
            const overlay = document.getElementById('modalGenericOverlay');
            const titoloEl = document.getElementById('modalGenericTitolo');
            const iconaEl = document.getElementById('modalGenericIcona');
            const msgEl = document.getElementById('modalGenericMessaggio');
            const azioniEl = document.getElementById('modalGenericAzioni');

            titoloEl.textContent = titolo;
            msgEl.innerHTML = messaggio;

            const icone = { success: '\u2705', error: '\u274C', warning: '\u26A0\uFE0F', info: '\u2139\uFE0F', question: '\u2753' };
            iconaEl.textContent = icone[tipo] || '';

            azioniEl.innerHTML = '';
            (pulsanti || [{ label: 'OK', value: true, style: 'primary' }]).forEach(btn => {
                const b = document.createElement('button');
                b.className = 'modal-generic-btn modal-generic-btn-' + (btn.style || 'primary');
                b.textContent = btn.label;
                b.addEventListener('click', () => {
                    overlay.classList.remove('open');
                    resolve(btn.value);
                });
                azioniEl.appendChild(b);
            });

            document.getElementById('modalGenericClose').onclick = () => {
                overlay.classList.remove('open');
                resolve(null);
            };
            overlay.onclick = (e) => {
                if (e.target === overlay) { overlay.classList.remove('open'); resolve(null); }
            };
            overlay.classList.add('open');
        });
    }

    // ============================================================
    // HELPER: chiama API con auto-deploy SP
    // ============================================================
    async function chiamaConAutoDeploySP(url, body) {
        let resp = await fetch(url, { credentials: 'include',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let data = await resp.json();

        if (data.error === 'SP_NOT_FOUND') {
            const ok = await modale('warning',
                'Stored Procedure Mancante',
                `La stored procedure <strong>${esc(data.sp)}</strong> non esiste nel database MRP corrente.<br><br>Vuoi crearla automaticamente?`,
                [
                    { label: 'Crea e Riprova', value: true, style: 'success' },
                    { label: 'Annulla', value: false, style: 'secondary' }
                ]
            );
            if (ok) {
                const deployResp = await fetch(`${MrpApp.API_BASE}/deploy-sp`, { credentials: 'include', method: 'POST' });
                const deployData = await deployResp.json();
                if (deployData.success) {
                    resp = await fetch(url, { credentials: 'include',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    data = await resp.json();
                } else {
                    data = { error: 'Deploy SP fallito: ' + (deployData.error || 'Errore sconosciuto') };
                }
            } else {
                data = { error: 'Operazione annullata dall\'utente' };
            }
        }
        return data;
    }

    // ============================================================
    // VERIFICA E INSTALLA SP (sempre prima di aprire qualsiasi modal)
    // ============================================================
    async function assicuraSPEsiste() {
        try {
            const resp = await fetch(`${MrpApp.API_BASE}/check-sp`, { credentials: 'include' });
            const data = await resp.json();
            if (data.exists) return true;
        } catch (_) {
            // se il check fallisce, proviamo comunque a deployare
        }

        const ok = await modale('warning', 'Configurazione Database',
            'La stored procedure necessaria non \u00E8 ancora presente nel server di destinazione.<br><br>' +
            'Verr\u00E0 installata automaticamente (operazione da eseguire una sola volta).',
            [
                { label: 'Installa e Continua', value: true, style: 'success' },
                { label: 'Annulla', value: false, style: 'secondary' }
            ]);

        if (!ok) return false;

        try {
            const deployResp = await fetch(`${MrpApp.API_BASE}/deploy-sp`, { credentials: 'include', method: 'POST' });
            const deployData = await deployResp.json();
            if (deployData.success) return true;
            await modale('error', 'Errore Installazione',
                'Impossibile installare la stored procedure:<br><br>' + esc(deployData.error || 'Errore sconosciuto'),
                [{ label: 'OK', value: false, style: 'secondary' }]);
            return false;
        } catch (err) {
            await modale('error', 'Errore Installazione',
                'Errore di rete durante l\'installazione: ' + esc(err.message),
                [{ label: 'OK', value: false, style: 'secondary' }]);
            return false;
        }
    }

    // ============================================================
    // APRI MODALE EMETTI ORDINE (singolo fornitore)
    // ============================================================
    async function apriModaleAnnullaOrdine(emesso) {
        const ordLabel = emesso.numord + '/' + emesso.serie;
        const fornNome = emesso.fornitore_nome || 'Fornitore ' + emesso.fornitore_codice;
        const isBcube = emesso.origine === 'bcube';
        const emailAvviso = emesso.email_inviata
            ? '<br><br><strong style="color:var(--danger);">Attenzione:</strong> l\'email è già stata inviata al fornitore. Dovrai avvisarlo manualmente dell\'annullamento.'
            : '';
        const bcubeAvviso = isBcube
            ? '<br><br><span style="color:var(--primary);font-weight:600;">Questo ordine è stato emesso da BCube.</span> L\'annullamento lo rimuoverà anche dal gestionale.'
            : '';

        const risposta = await modale('warning', 'Annullamento ordine',
            'Sei sicuro di voler annullare l\'ordine <strong>' + esc(ordLabel) + '</strong> per <strong>' + esc(fornNome) + '</strong>?' +
            bcubeAvviso +
            '<br><br>L\'ordine verrà cancellato dal sistema.' +
            '<br><span style="font-size:0.8rem;color:var(--text-muted);">Il numero ordine sarà recuperato solo se è l\'ultimo emesso.</span>' +
            emailAvviso,
            [{ label: 'Annulla ordine', value: true, style: 'danger' },
             { label: 'Indietro', value: false, style: 'secondary' }]);

        if (!risposta) return;

        try {
            const res = await fetch(`${MrpApp.API_BASE}/annulla-ordine`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anno: emesso.anno, serie: emesso.serie, numord: emesso.numord })
            });
            const data = await res.json();

            if (data.error === 'MERCE_EVASA') {
                await modale('error', 'Annullamento impossibile', data.message);
                return;
            }
            if (!data.success) {
                await modale('error', 'Errore', 'Errore annullamento: ' + esc(data.error || 'sconosciuto'));
                return;
            }

            // Successo: rimuovi da Map e ricarica proposte.
            // Se l'ordine annullato era il primario, sgancia; altrimenti rimuovilo dagli extras.
            // (caricaProposta() subito sotto ri-popola comunque tutto, ma evitiamo stato inconsistente
            // nei ms prima che la refetch completi.)
            const fk = String(emesso.fornitore_codice);
            const primario = ordiniEmessi.get(fk);
            const matches = (e) => e && String(e.anno) === String(emesso.anno)
                && String(e.serie) === String(emesso.serie)
                && String(e.numord) === String(emesso.numord);
            if (matches(primario)) {
                ordiniEmessi.delete(fk);
            } else if (ordiniEmessiExtra.has(fk)) {
                const arr = ordiniEmessiExtra.get(fk).filter(e => !matches(e));
                if (arr.length > 0) ordiniEmessiExtra.set(fk, arr);
                else ordiniEmessiExtra.delete(fk);
            }
            await modale('success', 'Ordine annullato',
                'L\'ordine <strong>' + esc(ordLabel) + '</strong> è stato annullato con successo.');

            // Ricarica proposte per aggiornare la vista
            caricaProposta();
        } catch (err) {
            await modale('error', 'Errore di rete', 'Errore: <code>' + esc(err.message) + '</code>');
        }
    }

    // ============================================================
    // DIALOG DI DECISIONE MERGE (ordine email-pending + nuovi confermati)
    // ============================================================
    async function apriDialogMergeDecision(fornitore_codice, ordinePendente, articoliNuovi) {
        const ordLabel = ordinePendente.numord + '/' + ordinePendente.serie;

        // Verifica conflitto codart: se un articolo nuovo ha lo stesso (codart, fase, magaz)
        // di una riga nell'ordine pendente, la SP usp_AggiungiRigheOrdineFornitore fallirebbe.
        // In tal caso il merge è disabilitato.
        const righeOrdine = ordinePendente.righe || [];
        const keySetOrdine = new Set(righeOrdine.map(r =>
            `${r.ol_codart}|${r.ol_fase || 0}|${r.ol_magaz || 1}`
        ));
        const conflitti = articoliNuovi.filter(a =>
            keySetOrdine.has(`${a.ol_codart}|${a.ol_fase || 0}|${a.ol_magaz || 1}`)
        );
        const mergeDisabled = conflitti.length > 0;

        let msgConflitto = '';
        if (mergeDisabled) {
            const artList = conflitti.map(a => '\u2022 ' + esc(a.ol_codart)).join('<br>');
            msgConflitto =
                '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:4px; padding:8px; margin:8px 0; font-size:0.82rem;">' +
                '<strong style="color:#991b1b;">\u26A0 Merge non disponibile</strong><br>' +
                'L\'ordine ' + esc(ordLabel) + ' contiene già gli stessi articoli (codart+fase+magaz):<br>' +
                artList + '<br>' +
                'La stored procedure non ammette duplicati nello stesso ordine. ' +
                'Per date diverse, emetti un ordine separato.' +
                '</div>';
        }

        const msg =
            'Esiste già un ordine <strong>' + esc(ordLabel) + '</strong> per questo fornitore, ' +
            'emesso ma con email non ancora inviata.<br><br>' +
            'Hai confermato <strong>' + articoliNuovi.length + '</strong> nuov' +
            (articoliNuovi.length === 1 ? 'o articolo' : 'i articoli') + '. Cosa vuoi fare?' +
            msgConflitto +
            '<br><div style="text-align:left; font-size:0.82rem; color:var(--text-muted);">' +
            '\u2022 <strong>Unisci</strong>: aggiunge i nuovi articoli all\'ordine ' + esc(ordLabel) + ' esistente. ' +
            'L\'ordine viene modificato in-place: stesso numero, totali ricalcolati, PDF aggiornato.<br>' +
            '\u2022 <strong>Separato</strong>: crea un secondo ordine solo con i nuovi articoli. ' +
            'L\'ordine esistente rimane invariato.<br>' +
            '</div>';

        const pulsanti = [
            { label: '\uD83D\uDD04 Unisci all\'ordine ' + ordLabel, value: 'merge', style: mergeDisabled ? 'disabled' : 'primary' },
            { label: '\u2795 Emetti ordine separato', value: 'separate', style: 'secondary' },
            { label: 'Annulla', value: null, style: 'secondary' }
        ];

        // Se merge è disabilitato, impediamo la selezione
        if (mergeDisabled) {
            return await modale('question', 'Ordine pendente per questo fornitore', msg, [
                { label: '\u2795 Emetti ordine separato', value: 'separate', style: 'primary' },
                { label: 'Annulla', value: null, style: 'secondary' }
            ]);
        }

        return await modale('question', 'Ordine pendente per questo fornitore', msg, pulsanti);
    }

    /**
     * Raggruppa articoli confermati per data_consegna.
     * Articoli con la stessa data vanno nello stesso ordine.
     * Date diverse → ordini separati (PDF + email distinti).
     */
    function raggruppaPerData(articoli) {
        const gruppi = new Map();
        for (const a of articoli) {
            const dt = a.data_consegna || 'no-date';
            if (!gruppi.has(dt)) gruppi.set(dt, []);
            gruppi.get(dt).push(a);
        }
        return Array.from(gruppi.entries()).map(([data, arts]) => ({ data, articoli: arts }));
    }

    async function apriModaleEmettiOrdine(fornitore_codice) {
        if (!await assicuraSPEsiste()) return;
        const confermati = MrpApp.state.ordiniConfermati;
        const articoliFornitore = [];
        let fornitore_nome = '';

        confermati.forEach((ordine, key) => {
            if (String(ordine.fornitore_codice) === String(fornitore_codice)) {
                articoliFornitore.push(ordine);
                if (!fornitore_nome) fornitore_nome = ordine.fornitore_nome || '';
            }
        });

        if (articoliFornitore.length === 0) return;

        // Raggruppa per data consegna: date diverse → ordini separati
        const gruppiData = raggruppaPerData(articoliFornitore);
        const multiOrdine = gruppiData.length > 1;

        // Branch merge: se esiste un ordine email-pending per questo fornitore,
        // chiedi all'operatore se unire o emettere separato.
        // NOTA: merge è disabilitato quando ci sono date multiple (ordini separati obbligatori)
        const ordinePendente = ordiniEmessi.get(String(fornitore_codice));
        let mergeMode = null; // null | 'merge' | 'separate'
        if (ordinePendente && !ordinePendente.email_inviata && !multiOrdine) {
            const scelta = await apriDialogMergeDecision(fornitore_codice, ordinePendente, articoliFornitore);
            if (scelta === null) return;
            mergeMode = scelta;
        }

        // Check duplicati pre-emissione (skip in modalità merge)
        if (MrpApp.state.elaborazioneId && mergeMode !== 'merge') {
            try {
                const dupRes = await fetch(`${MrpApp.API_BASE}/controlla-duplicato`, {
                    credentials: 'include',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fornitore_codice: parseInt(fornitore_codice, 10),
                        elaborazione_id: MrpApp.state.elaborazioneId,
                        articoli: articoliFornitore.map(a => ({ codart: a.ol_codart, fase: parseInt(a.ol_fase, 10) || 0, magaz: parseInt(a.ol_magaz, 10) || 1 }))
                    })
                });
                const dupData = await dupRes.json();
                if (dupData.hasDuplicati) {
                    const lista = dupData.duplicati.map(d => {
                        const dt = d.data ? new Date(d.data).toLocaleDateString('it-IT') : '';
                        return `\u2022 ${esc(d.codart)} \u2192 Ordine ${esc(d.ordine)} del ${dt}`;
                    }).join('<br>');
                    const procedi = await modale('warning', 'Ordine Duplicato',
                        `Attenzione: un ordine per questo fornitore con gli stessi articoli \u00e8 gi\u00e0 stato emesso in questa elaborazione.<br><br>${lista}<br><br>Procedere comunque?`,
                        [
                            { label: 'Procedi Comunque', value: true, style: 'warning' },
                            { label: 'Annulla', value: false, style: 'secondary' }
                        ]);
                    if (!procedi) return;
                }
            } catch (dupErr) {
                console.warn('[Proposta] Check duplicato fallito (continuo):', dupErr.message);
            }
        }

        const totale = articoliFornitore.reduce((s, a) => s + a.quantita_confermata * a.prezzo / (Number(a.perqta) || 1), 0);

        // Riepilogo — mostra raggruppamento per data se multi-ordine
        let riepilogoHtml = `<div class="emetti-riepilogo-fornitore">${esc(fornitore_nome)} (${esc(String(fornitore_codice))})</div>`;

        if (multiOrdine) {
            riepilogoHtml += `<div class="emetti-multiordine-avviso">
                Date di consegna diverse &rarr; verranno emessi <strong>${gruppiData.length} ordini separati</strong>,
                ciascuno con il proprio PDF e la propria email.
            </div>`;
        }

        for (const gruppo of gruppiData) {
            const dataLabel = gruppo.data !== 'no-date'
                ? new Date(gruppo.data).toLocaleDateString('it-IT')
                : 'Senza data';
            const totGruppo = gruppo.articoli.reduce((s, a) => s + a.quantita_confermata * a.prezzo / (Number(a.perqta) || 1), 0);

            if (multiOrdine) {
                riepilogoHtml += `<div class="emetti-gruppo-data-header">Ordine per consegna: <strong>${esc(dataLabel)}</strong></div>`;
            }

            riepilogoHtml += `
            <table class="emetti-riepilogo-table">
                <thead><tr><th>Cod. Articolo</th><th>Descrizione</th><th class="num">Qt\u00e0</th><th>UM</th><th class="num">Prezzo</th><th class="num">Valore</th><th>Data Cons.</th></tr></thead>
                <tbody>
                ${gruppo.articoli.map(a => `<tr>
                    <td>${esc(a.ol_codart)}</td>
                    <td>${esc(a.ar_descr || '')}</td>
                    <td class="num">${Number(a.quantita_confermata).toLocaleString('it-IT')}</td>
                    <td>${esc(a.ol_unmis || 'PZ')}</td>
                    <td class="num">${Number(a.prezzo).toLocaleString('it-IT', { minimumFractionDigits: 4 })}</td>
                    <td class="num">\u20ac ${(a.quantita_confermata * a.prezzo / (Number(a.perqta) || 1)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${a.data_consegna ? new Date(a.data_consegna).toLocaleDateString('it-IT') : ''}</td>
                </tr>`).join('')}
                </tbody>
            </table>`;

            if (multiOrdine) {
                riepilogoHtml += `<div class="emetti-gruppo-data-totale">Totale ordine: \u20ac ${totGruppo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`;
            }
        }

        riepilogoHtml += `<div class="emetti-riepilogo-totale">Totale complessivo: \u20ac ${totale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`;

        const riepilogoEl = document.getElementById('emettiRiepilogo');
        riepilogoEl.innerHTML = riepilogoHtml;

        const overlay = document.getElementById('modalEmettiOverlay');
        overlay.classList.add('open');

        // Listeners
        document.getElementById('btnEmettiAnnulla').onclick = () => overlay.classList.remove('open');
        document.getElementById('modalEmettiClose').onclick = () => overlay.classList.remove('open');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('open'); };

        document.getElementById('btnEmettiConferma').onclick = () => {
            overlay.classList.remove('open');
            if (multiOrdine) {
                // Emetti N ordini separati, uno per gruppo data
                emettiOrdiniMultiData(fornitore_codice, fornitore_nome, gruppiData);
            } else {
                const opts = {};
                if (mergeMode === 'merge' && ordinePendente) {
                    opts.mergeWith = {
                        anno: ordinePendente.anno,
                        serie: ordinePendente.serie,
                        numord: ordinePendente.numord
                    };
                }
                eseguiEmissioneOrdine(fornitore_codice, articoliFornitore, fornitore_nome, opts);
            }
        };
    }

    /**
     * Emette N ordini separati per lo stesso fornitore, uno per ogni data di consegna.
     * Ogni ordine genera un proprio PDF e una propria email.
     */
    async function emettiOrdiniMultiData(fornitore_codice, fornitore_nome, gruppiData) {
        const risultati = [];
        for (const gruppo of gruppiData) {
            try {
                const dataLabel = gruppo.data !== 'no-date'
                    ? new Date(gruppo.data).toLocaleDateString('it-IT')
                    : 'senza data';
                console.log(`[Proposta] Emissione ordine per ${fornitore_codice} — consegna ${dataLabel} (${gruppo.articoli.length} art.)`);
                await eseguiEmissioneOrdine(fornitore_codice, gruppo.articoli, fornitore_nome, {});
                risultati.push({ data: gruppo.data, ok: true });
            } catch (err) {
                risultati.push({ data: gruppo.data, ok: false, error: err.message });
            }
        }

        // Riepilogo finale se ci sono stati errori
        const falliti = risultati.filter(r => !r.ok);
        if (falliti.length > 0) {
            const msg = falliti.map(f => {
                const dl = f.data !== 'no-date' ? new Date(f.data).toLocaleDateString('it-IT') : 'senza data';
                return `\u2022 Consegna ${dl}: ${f.error}`;
            }).join('<br>');
            await modale('warning', 'Emissione Parziale',
                `${risultati.length - falliti.length} di ${risultati.length} ordini emessi con successo.<br><br>Errori:<br>${msg}`);
        }
    }

    // ============================================================
    // ESEGUI EMISSIONE (chiama API)
    // ============================================================
    async function eseguiEmissioneOrdine(fornitore_codice, articoliFornitore, fornitore_nome, opts) {
        opts = opts || {};
        const articoliFinali = articoliFornitore.slice();

        // Mappa articoli → payload SP (formato comune a /emetti-ordine e /modifica-ordine)
        const mapArticoloToApi = (a) => ({
            codart: a.ol_codart,
            fase: parseInt(a.ol_fase, 10) || 0,
            magaz: parseInt(a.ol_magaz, 10) || 1,
            quantita: a.quantita_confermata,
            data_consegna: a.data_consegna,
            prezzo: a.prezzo,
            perqta: Number(a.perqta) || 1,
            unmis: a.ol_unmis || 'PZ',
            ol_progr: parseInt(a.ol_progr, 10) || 0
        });

        // Modalità merge: chiama /modifica-ordine che AGGIUNGE righe all'ordine
        // esistente in-place (preserva numord, ricalcola totali, NON annulla).
        // Passiamo SOLO gli articoli nuovi — la SP conosce già le righe esistenti.
        let resp;
        if (opts.mergeWith) {
            const bodyMod = {
                anno: opts.mergeWith.anno,
                serie: opts.mergeWith.serie,
                numord: opts.mergeWith.numord,
                fornitore_codice: parseInt(fornitore_codice, 10),
                elaborazione_id: MrpApp.state.elaborazioneId || '',
                articoli: articoliFinali.map(mapArticoloToApi)
            };
            resp = await chiamaConAutoDeploySP(`${MrpApp.API_BASE}/modifica-ordine`, bodyMod);
        } else {
            const body = {
                fornitore_codice: parseInt(fornitore_codice, 10),
                elaborazione_id: MrpApp.state.elaborazioneId || '',
                articoli: articoliFinali.map(mapArticoloToApi)
            };
            resp = await chiamaConAutoDeploySP(`${MrpApp.API_BASE}/emetti-ordine`, body);
        }

        if (resp.success) {
            // Salva PDF in memoria per download immediato (non disponibile dal server dopo)
            pdfCache.set(pdfCacheKey(resp.ordine.anno, resp.ordine.serie, resp.ordine.numord), {
                pdf_base64: resp.pdf_base64,
                pdf_filename: resp.pdf_filename
            });

            // Rimuovi dalle conferme gli articoli appena emessi — così il loro badge
            // "Confermato" non ricompare sulla riga ora marcata "Ordinato".
            for (const a of articoliFinali) {
                const k = String(a.ol_progr || 0);
                if (k !== '0') MrpApp.rimuoviOrdine(k);
            }

            // Ricarica proposta dal DB — l'UI riflette lo stato reale
            await caricaProposta();

            mostraRisultatoEmissione(resp, fornitore_nome);
        } else {
            await modale('error', 'Errore Emissione', `Impossibile emettere l'ordine per <strong>${esc(fornitore_nome)}</strong>.<br><br><code>${esc(resp.error || 'Errore sconosciuto')}</code>`);
        }
    }

    // ============================================================
    // MODALE RISULTATO EMISSIONE
    // ============================================================
    function mostraRisultatoEmissione(data, fornitore_nome) {
        const overlay = document.getElementById('modalRisultatoOverlay');
        const contenuto = document.getElementById('risultatoContenuto');
        const azioni = document.getElementById('risultatoAzioni');

        contenuto.innerHTML = `
            <div class="risultato-ok-icon">\u2705</div>
            <div class="risultato-ordine-num">Ordine n. ${data.ordine.numord}/${data.ordine.serie}</div>
            <div class="risultato-ordine-forn">${esc(fornitore_nome)}</div>
            <div style="text-align:center; font-size:0.85rem; color:var(--text-muted);">
                ${data.ordine.num_righe} articol${data.ordine.num_righe > 1 ? 'i' : 'o'} &mdash;
                Totale \u20ac ${Number(data.ordine.totale_documento || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </div>
            <div class="unified-warning-box" style="margin-top:10px;">\u26A0\uFE0F L'ordine \u00E8 stato registrato nel gestionale ma il fornitore non lo ricever\u00E0 finch\u00E9 non invii l'email.</div>
        `;

        azioni.innerHTML = '';

        // Pulsante scarica PDF
        const btnPdf = document.createElement('button');
        btnPdf.className = 'modal-generic-btn modal-generic-btn-primary';
        btnPdf.innerHTML = '\u2B07 Scarica PDF';
        btnPdf.addEventListener('click', () => {
            scaricaPdfBase64(data.pdf_base64, data.pdf_filename);
        });
        azioni.appendChild(btnPdf);

        // Pulsante invia email
        if (data.ordine.fornitore_email) {
            const btnEmail = document.createElement('button');
            btnEmail.className = 'modal-generic-btn modal-generic-btn-success';
            btnEmail.innerHTML = '\u2709 Invia Email al Fornitore';
            btnEmail.addEventListener('click', async () => {
                btnEmail.disabled = true;
                btnEmail.textContent = 'Invio in corso...';
                // Chiudi il modal risultato per non coprire eventuali messaggi
                overlay.classList.remove('open');
                // Costruisci oggetto emesso dai dati del response (non dalla Map)
                const emessoData = {
                    anno: data.ordine.anno,
                    serie: data.ordine.serie,
                    numord: data.ordine.numord,
                    pdf_base64: data.pdf_base64 || null,
                    pdf_filename: data.pdf_filename || null,
                    fornitore_nome: fornitore_nome
                };
                await inviaEmailOrdine(emessoData);
            });
            azioni.appendChild(btnEmail);
        }

        // Pulsante annulla ordine
        const btnAnnullaRis = document.createElement('button');
        btnAnnullaRis.className = 'modal-generic-btn modal-generic-btn-danger';
        btnAnnullaRis.textContent = '\u274C Annulla Ordine';
        btnAnnullaRis.style.fontSize = '0.78rem';
        btnAnnullaRis.addEventListener('click', () => {
            overlay.classList.remove('open');
            apriModaleAnnullaOrdine({
                anno: data.ordine.anno, serie: data.ordine.serie, numord: data.ordine.numord,
                fornitore_nome: fornitore_nome,
                fornitore_codice: data.ordine.fornitore_codice,
                email_inviata: false, origine: 'gb2'
            });
        });
        azioni.appendChild(btnAnnullaRis);

        // Pulsante chiudi
        const btnChiudi = document.createElement('button');
        btnChiudi.className = 'modal-generic-btn modal-generic-btn-secondary';
        btnChiudi.textContent = 'Chiudi';
        btnChiudi.addEventListener('click', () => overlay.classList.remove('open'));
        azioni.appendChild(btnChiudi);

        document.getElementById('modalRisultatoClose').onclick = () => overlay.classList.remove('open');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('open'); };
        overlay.classList.add('open');
    }

    // ============================================================
    // SCARICA PDF
    // ============================================================
    function scaricaPdfBase64(base64, filename) {
        const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'ordine.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function scaricaPdf(emesso) {
        // Cerca prima nella cache per chiave ordine (non per fornitore)
        const ck = pdfCacheKey(emesso.anno, emesso.serie, emesso.numord);
        const cached = pdfCache.get(ck);
        if (cached && cached.pdf_base64) {
            scaricaPdfBase64(cached.pdf_base64, cached.pdf_filename);
        } else if (emesso.pdf_base64) {
            scaricaPdfBase64(emesso.pdf_base64, emesso.pdf_filename);
        } else {
            window.open(`${MrpApp.API_BASE}/ordine-pdf/${emesso.anno}/${emesso.serie}/${emesso.numord}`, '_blank');
        }
    }

    // ============================================================
    // INVIA EMAIL ORDINE
    // ============================================================
    /**
     * Invia email ordine a un fornitore.
     * In modalità NON silent: mostra modale anteprima editabile prima di inviare.
     * In modalità silent (batch "Invia Tutte"): invia direttamente.
     */
    async function inviaEmailOrdine(emesso, opts = {}) {
        const silent = opts.silent || false;
        const templateId = opts.template_id || null;

        // --- MODALITÀ INTERATTIVA: mostra anteprima editabile ---
        if (!silent) {
            return await inviaEmailInterattiva(emesso, templateId);
        }

        // --- MODALITÀ SILENT (batch) ---
        return await _inviaEmailDirect(emesso, { template_id: templateId });
    }

    /** Modale anteprima editabile per invio singolo */
    async function inviaEmailInterattiva(emesso, templateId) {
        // 1) Chiedi preview al backend
        try {
            const prevResp = await fetch(`${MrpApp.API_BASE}/preview-ordine-email`, {
                credentials: 'include', method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    anno: emesso.anno, serie: emesso.serie, numord: emesso.numord,
                    template_id: templateId
                })
            });
            const prevData = await prevResp.json();

            if (prevData.error === 'SMTP_NOT_CONFIGURED') {
                await modale('warning', 'SMTP Non Configurato',
                    'Per inviare email \u00e8 necessario configurare un profilo SMTP nelle impostazioni.',
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return { success: false, error: 'SMTP_NOT_CONFIGURED' };
            }
            if (prevData.error) {
                await modale('error', 'Errore', esc(prevData.error));
                return { success: false, error: prevData.error };
            }

            // 2) Controlla se esiste una bozza salvata per questo ordine
            let oggettoPreview = prevData.oggetto;
            let corpoPreview = prevData.corpo;
            try {
                const draftResp = await fetch(`${MrpApp.API_BASE}/email-drafts?anno=${emesso.anno}&serie=${emesso.serie}&numord=${emesso.numord}`, { credentials: 'include' });
                const draftData = await draftResp.json();
                if (draftData.drafts && draftData.drafts.length > 0) {
                    oggettoPreview = draftData.drafts[0].OggettoCustom;
                    corpoPreview = draftData.drafts[0].CorpoCustom;
                }
            } catch (_) { /* ignora */ }

            // 3) Avviso banca mancante per rimessa diretta — con scheda fornitore editabile
            if (prevData.warning_banca && prevData.fornitore_dati) {
                const fd = prevData.fornitore_dati;
                const risposta = await modaleBancaMancante(fd, prevData.warning_banca);
                if (risposta === 'cancel') return { success: false, error: 'CANCELLED' };
                // Se ha salvato i dati bancari, 'saved' → procedi normalmente
                // Se ha scelto 'send_anyway' → procedi
            } else if (prevData.warning_banca) {
                // Fallback semplice se fornitore_dati non disponibile
                const risposta = await modale('warning', 'Dati bancari mancanti',
                    prevData.warning_banca + '<br><br>Vuoi procedere comunque con l\'invio?',
                    [{ label: 'Invia comunque', value: true, style: 'primary' },
                     { label: 'Annulla', value: false, style: 'secondary' }]);
                if (!risposta) return { success: false, error: 'CANCELLED' };
            }

            // 4) Mostra modale editabile
            const risultato = await modaleAnteprimaEmail({
                ordine: `${emesso.numord}/${emesso.serie}`,
                fornitore: prevData.fornitore_nome,
                destinatario: prevData.destinatario,
                ambiente: prevData.ambiente,
                oggetto: oggettoPreview,
                corpo: corpoPreview,
                anno: emesso.anno,
                serie: emesso.serie,
                numord: emesso.numord,
                fornitore_codice: emesso.fornitore_codice || emesso.ol_conto
            });

            if (!risultato) return { success: false, error: 'CANCELLED' };

            // 4) Invia con i dati (eventualmente editati)
            return await _inviaEmailDirect(emesso, {
                template_id: templateId,
                oggetto_custom: risultato.oggetto,
                corpo_custom: risultato.corpo
            });

        } catch (err) {
            await modale('error', 'Errore di Rete', `Errore: <code>${esc(err.message)}</code>`);
            return { success: false, error: err.message };
        }
    }

    /** Modale con anteprima email editabile. Restituisce { oggetto, corpo } oppure null se annullato */
    function modaleAnteprimaEmail({ ordine, fornitore, destinatario, ambiente, oggetto, corpo, batchMode, anno, serie, numord, fornitore_codice }) {
        return new Promise(resolve => {
            // Usa overlay dedicato (layer sopra il batch/generic)
            const overlay = document.getElementById('modalAnteprimaOverlay');
            const elTitolo = document.getElementById('modalAnteprimaTitolo');
            const elIcona = document.getElementById('modalAnteprimaIcona');
            const elMsg = document.getElementById('modalAnteprimaMessaggio');
            const elAzioni = document.getElementById('modalAnteprimaAzioni');
            if (!overlay) { resolve(null); return; }

            const ambienteBadge = ambiente === 'prova'
                ? '<span style="background:#f59e0b; color:white; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:600;">PROVA</span>'
                : '';

            // Pulsante "Salva come personalizzato" in alto — nascosto, appare solo dopo modifiche
            const salvaPersHtml = fornitore_codice
                ? '<div id="prevSalvaPersonalizzato" style="display:none; gap:6px; align-items:center; margin-bottom:12px; padding:8px 10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; position:relative;">' +
                    '<span id="prevPersHelp" style="cursor:pointer; font-size:0.85rem; color:#3b82f6; line-height:1; user-select:none;" title="Info">\u2753</span>' +
                    '<input type="text" id="prevPersNome" class="mrp-control" placeholder="Nome del messaggio..." style="flex:1; font-size:0.8rem; padding:4px 8px;" />' +
                    '<button id="btnSalvaPersonalizzato" style="white-space:nowrap; font-size:0.78rem; padding:5px 12px; border-radius:5px; border:1px solid #3b82f6; background:#3b82f6; color:white; cursor:pointer; font-weight:600;">\u2605 Salva personalizzato per ' + esc(fornitore) + '</button>' +
                    '<div id="prevPersTip" style="display:none; position:absolute; top:calc(100% + 8px); left:0; right:0; background:white; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; box-shadow:0 4px 16px rgba(0,0,0,0.12); font-size:0.76rem; line-height:1.55; color:var(--text); z-index:10;">' +
                        '<div style="position:absolute; top:-6px; left:24px; width:12px; height:12px; background:white; border-left:1px solid #cbd5e1; border-top:1px solid #cbd5e1; transform:rotate(45deg);"></div>' +
                        '<div style="margin-bottom:6px;"><strong>Salva come personalizzato</strong></div>' +
                        'Salva questo messaggio <strong>cos\u00ec com\'\u00e8</strong> per riutilizzarlo<br>con questo fornitore ai prossimi invii.<br><br>' +
                        'Lo troverai nel <strong>menu di selezione</strong> sotto<br>la voce <em>\u2605 Personalizzati</em>.<br><br>' +
                        'Se invece vuoi un messaggio che si <strong>adatti<br>automaticamente</strong> (nome fornitore, numero ordine,<br>totale, ecc.) vai in <strong>Impostazioni \u2192 Template Email</strong>.' +
                    '</div>' +
                  '</div>'
                : '';
            const _origOggetto = oggetto;
            const _origCorpo = corpo;

            elTitolo.textContent = batchMode ? 'Modifica Email' : 'Anteprima Email';
            elIcona.textContent = batchMode ? '\u270E' : '\u2709';
            elMsg.innerHTML =
                '<div style="text-align:left;">' +
                    '<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">' +
                        '<span style="font-size:0.82rem; color:var(--text-muted);">Ordine <strong>' + esc(ordine) + '</strong> \u2014 ' + esc(fornitore) + '</span>' +
                        ambienteBadge +
                    '</div>' +
                    '<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:8px;">Destinatario: <strong>' + esc(destinatario) + '</strong></div>' +
                    salvaPersHtml +
                    '<label style="font-size:0.78rem; font-weight:600; color:var(--text-muted);">Oggetto</label>' +
                    '<input type="text" id="prevEmailOggetto" class="mrp-control" value="' + escAttr(oggetto) + '" style="font-size:0.88rem; font-weight:600; margin-bottom:10px;" />' +
                    '<label style="font-size:0.78rem; font-weight:600; color:var(--text-muted);">Corpo</label>' +
                    '<textarea id="prevEmailCorpo" class="mrp-control" rows="14" style="resize:vertical; font-size:0.85rem; font-family:inherit; line-height:1.5;">' + esc(corpo) + '</textarea>' +
                '</div>';

            elAzioni.innerHTML = '';

            let resolved = false;
            function cleanup(result) {
                if (resolved) return;
                resolved = true;
                overlay.classList.remove('open');
                resolve(result);
            }

            function getEditValues() {
                const o = document.getElementById('prevEmailOggetto').value.trim();
                const c = document.getElementById('prevEmailCorpo').value.trim();
                return (o && c) ? { oggetto: o, corpo: c } : null;
            }

            // --- Bottone Annulla ---
            const btnAnnulla = document.createElement('button');
            btnAnnulla.textContent = 'Annulla';
            btnAnnulla.className = 'mrp-btn mrp-btn-secondary';
            btnAnnulla.style.cssText = 'padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnAnnulla.addEventListener('click', () => cleanup(null));

            // --- Bottone Salva Bozza (solo in modalità singola) ---
            if (!batchMode && anno && serie && numord) {
                const btnSalva = document.createElement('button');
                btnSalva.textContent = '\uD83D\uDCBE Salva Bozza';
                btnSalva.className = 'mrp-btn';
                btnSalva.style.cssText = 'padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:#f0fdf4;color:#16a34a;cursor:pointer;font-weight:600;font-size:0.85rem;';
                btnSalva.addEventListener('click', async () => {
                    const vals = getEditValues();
                    if (!vals) return;
                    btnSalva.disabled = true; btnSalva.textContent = 'Salvataggio...';
                    try {
                        const resp = await fetch(`${MrpApp.API_BASE}/email-drafts`, {
                            credentials: 'include', method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ anno, serie, numord, oggetto: vals.oggetto, corpo: vals.corpo })
                        });
                        if (!resp.ok) {
                            const errData = await resp.json().catch(() => ({}));
                            throw new Error(errData.error || 'Errore HTTP ' + resp.status);
                        }
                        btnSalva.textContent = '\u2714 Bozza Salvata';
                        btnSalva.style.background = '#dcfce7';
                        btnSalva.style.borderColor = '#16a34a';
                        setTimeout(() => {
                            btnSalva.disabled = false;
                            btnSalva.textContent = '\uD83D\uDCBE Salva Bozza';
                            btnSalva.style.background = '#f0fdf4';
                            btnSalva.style.borderColor = 'var(--border)';
                        }, 1500);
                    } catch (err) {
                        btnSalva.disabled = false;
                        btnSalva.textContent = '\uD83D\uDCBE Salva Bozza';
                        alert('Errore salvataggio bozza: ' + err.message);
                    }
                });
                elAzioni.appendChild(btnAnnulla);
                elAzioni.appendChild(btnSalva);
            } else {
                elAzioni.appendChild(btnAnnulla);
            }

            // --- Bottone principale ---
            const btnPrimario = document.createElement('button');
            if (batchMode) {
                btnPrimario.textContent = '\u2714 Salva Modifiche';
                btnPrimario.className = 'mrp-btn mrp-btn-primary';
                btnPrimario.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--success, #16a34a);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            } else {
                btnPrimario.textContent = '\u2709 Invia Email';
                btnPrimario.className = 'mrp-btn mrp-btn-primary';
                btnPrimario.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            }
            btnPrimario.addEventListener('click', () => {
                const vals = getEditValues();
                if (!vals) return;
                cleanup({ oggetto: vals.oggetto, corpo: vals.corpo, action: batchMode ? 'save' : 'send' });
            });
            elAzioni.appendChild(btnPrimario);

            overlay.classList.add('open');

            // --- Mostra/nascondi barra "Salva personalizzato" solo dopo modifiche ---
            const salvaPersDiv = document.getElementById('prevSalvaPersonalizzato');
            if (salvaPersDiv) {
                const checkModifiche = () => {
                    const curOgg = document.getElementById('prevEmailOggetto').value.trim();
                    const curCorpo = document.getElementById('prevEmailCorpo').value.trim();
                    const modificato = curOgg !== _origOggetto || curCorpo !== _origCorpo;
                    salvaPersDiv.style.display = modificato ? 'flex' : 'none';
                };
                document.getElementById('prevEmailOggetto').addEventListener('input', checkModifiche);
                document.getElementById('prevEmailCorpo').addEventListener('input', checkModifiche);

                // --- Tooltip toggle al click su ❓ ---
                const helpBtn = document.getElementById('prevPersHelp');
                const tip = document.getElementById('prevPersTip');
                if (helpBtn && tip) {
                    helpBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        tip.style.display = tip.style.display === 'block' ? 'none' : 'block';
                    });
                    // Chiudi cliccando altrove
                    overlay.addEventListener('click', () => { tip.style.display = 'none'; });
                }
            }

            // --- Listener "Salva come personalizzato" ---
            const btnSalvaPers = document.getElementById('btnSalvaPersonalizzato');
            if (btnSalvaPers) {
                btnSalvaPers.addEventListener('click', async () => {
                    const nomeInput = document.getElementById('prevPersNome');
                    const nome = (nomeInput && nomeInput.value.trim()) || '';
                    if (!nome) { nomeInput.style.borderColor = 'var(--danger)'; nomeInput.focus(); return; }
                    nomeInput.style.borderColor = '';

                    const vals = getEditValues();
                    if (!vals) return;

                    btnSalvaPers.disabled = true;
                    btnSalvaPers.textContent = 'Salvataggio...';
                    try {
                        const resp = await fetch(`${MrpApp.API_BASE}/email-templates`, {
                            credentials: 'include', method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                nome: nome,
                                oggetto: vals.oggetto,
                                corpo: vals.corpo,
                                lingua: 'it',
                                isDefault: false,
                                fornitoreCode: fornitore_codice
                            })
                        });
                        if (!resp.ok) {
                            const errData = await resp.json().catch(() => ({}));
                            throw new Error(errData.error || 'Errore HTTP ' + resp.status);
                        }
                        const savedData = await resp.json();
                        const newId = savedData.id;
                        btnSalvaPers.textContent = '\u2714 Salvato!';
                        btnSalvaPers.style.background = '#16a34a';
                        // Ricarica i template per aggiornare i dropdown
                        await caricaTemplateEmail();
                        // Aggiorna e seleziona nel dropdown del widget fornitore
                        const fk = String(fornitore_codice);
                        const widgetSel = document.querySelector('.select-template-forn[data-forn="' + fk + '"]');
                        if (widgetSel && newId) {
                            // Ricostruisci le options con optgroup
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = buildTemplateSelect(fk);
                            const newSelect = tempDiv.querySelector('select');
                            if (newSelect) {
                                widgetSel.innerHTML = newSelect.innerHTML;
                                widgetSel.value = String(newId);
                            }
                            // Salva assegnazione
                            onTemplateSelectChange(fk, newId);
                        }
                        // Aggiorna anche i valori originali per nascondere la barra
                        if (salvaPersDiv) salvaPersDiv.style.display = 'none';
                        setTimeout(() => {
                            btnSalvaPers.disabled = false;
                            btnSalvaPers.textContent = '\u2605 Salva personalizzato per ' + fornitore;
                            btnSalvaPers.style.background = '#3b82f6';
                        }, 2000);
                    } catch (err) {
                        btnSalvaPers.disabled = false;
                        btnSalvaPers.textContent = '\u2605 Salva personalizzato per ' + fornitore;
                        btnSalvaPers.style.background = '#3b82f6';
                        alert('Errore: ' + err.message);
                    }
                });
            }

            // Chiudi con X
            const closeBtn = document.getElementById('modalAnteprimaClose');
            const closeHandler = () => { cleanup(null); closeBtn.removeEventListener('click', closeHandler); };
            closeBtn.addEventListener('click', closeHandler);
        });
    }

    /** Invio diretto email (usato sia da interattivo post-conferma che da batch silent) */
    async function _inviaEmailDirect(emesso, overrides = {}) {
        const body = {
            anno: emesso.anno,
            serie: emesso.serie,
            numord: emesso.numord,
            pdf_base64: emesso.pdf_base64 || null,
            pdf_filename: emesso.pdf_filename || null
        };
        if (overrides.template_id) body.template_id = overrides.template_id;
        if (overrides.oggetto_custom) body.oggetto_custom = overrides.oggetto_custom;
        if (overrides.corpo_custom) body.corpo_custom = overrides.corpo_custom;

        const silent = !!overrides.oggetto_custom; // se ha custom = viene da interattivo, non mostrare modali extra

        try {
            const resp = await fetch(`${MrpApp.API_BASE}/invia-ordine-email`, { credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await resp.json();

            if (data.error === 'SMTP_NOT_CONFIGURED') {
                if (!silent) await modale('warning', 'SMTP Non Configurato',
                    'Per inviare email \u00e8 necessario configurare un profilo SMTP nelle impostazioni.',
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return { success: false, error: 'SMTP_NOT_CONFIGURED' };
            }

            if (data.error === 'EMAIL_MISSING') {
                if (!silent) await modale('warning', 'Email Mancante',
                    `Il fornitore <strong>${esc(emesso.fornitore_nome || '')}</strong> non ha un indirizzo email configurato in anagrafica.`,
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return { success: false, error: 'EMAIL_MISSING', fornitore: emesso.fornitore_nome };
            }

            if (data.error === 'EMAIL_PROVA_MISSING') {
                if (!silent) await modale('warning', 'Email di Prova Non Configurata',
                    'Sei in ambiente di prova ma il campo <strong>Email di prova</strong> non \u00e8 compilato nel profilo DB.<br><br>Configuralo nella sezione connessione database.',
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return { success: false, error: 'EMAIL_PROVA_MISSING' };
            }

            if (data.success) {
                // Aggiorna stato email nella Map giusta — può essere primario o extra.
                const fk = String(emesso.fornitore_codice || emesso.ol_conto || '');
                const matchOrd = (e) =>
                    String(e.anno) === String(emesso.anno) &&
                    String(e.serie) === String(emesso.serie) &&
                    String(e.numord) === String(emesso.numord);
                if (fk && ordiniEmessi.has(fk) && matchOrd(ordiniEmessi.get(fk))) {
                    const entry = ordiniEmessi.get(fk);
                    entry.email_inviata = true;
                    entry.email_inviata_il = new Date().toISOString();
                } else if (fk && ordiniEmessiExtra.has(fk)) {
                    const arr = ordiniEmessiExtra.get(fk);
                    const entry = arr.find(matchOrd);
                    if (entry) {
                        entry.email_inviata = true;
                        entry.email_inviata_il = new Date().toISOString();
                    }
                }
                // Ri-renderizza i badge del fornitore per riflettere lo stato aggiornato
                // (l'intero set di bottoni dipende dal flag email_inviata)
                aggiornaBarreFornitori();
                // In modalità 'ultima_scelta', salva il template usato per questo fornitore
                if (_templateMode === 'ultima_scelta' && body.template_id && fk) {
                    onTemplateSelectChange(fk, body.template_id);
                }
                // Aggiorna barra azioni (conteggio email pendenti)
                aggiornaBarraEmettiTutti();
                return { success: true };
            } else {
                if (!silent) await modale('error', 'Errore Invio Email',
                    `Impossibile inviare l'email.<br><br><code>${esc(data.error || 'Errore sconosciuto')}</code>`);
                return { success: false, error: data.error || 'Errore sconosciuto' };
            }
        } catch (err) {
            if (!silent) await modale('error', 'Errore di Rete', `Errore nella comunicazione con il server:<br><br><code>${esc(err.message)}</code>`);
            return { success: false, error: err.message };
        }
    }

    // ============================================================
    // INVIA TUTTE LE EMAIL (batch con tabella interattiva)
    // ============================================================

    // Map temporanea per override manuali nel batch (fornCode → { oggetto_custom, corpo_custom })
    let _batchCustomOverrides = new Map();

    async function inviaTutteEmailHandler() {
        const pendenti = [];
        // Email gia pendenti (ordini emessi in precedenza, email non ancora inviata).
        // NOTA: gli ordini extra (2°+ ordine pending per lo stesso fornitore) sono gestiti
        // solo tramite i loro bottoni Invia Email individuali nella header. Il flusso batch
        // usa fornitore_codice come id DOM/riga ed è incompatibile con più righe per fk
        // senza un refactor più grosso del modaleBatchEmail. Caso raro, limitazione nota.
        ordiniEmessi.forEach((emesso, fk) => {
            if (!emesso.email_inviata) {
                pendenti.push({ ...emesso, fornitore_codice: fk });
            }
        });

        // Se c'e un'emissione in corso, aggiungi anche i fornitori in attesa
        // (verranno mostrati come righe waiting nella tabella)
        if (_batchUnifiedState.active) {
            _batchUnifiedState.fornitori.forEach(f => {
                const fk = String(f.fornitore_codice);
                // Non aggiungere se gia presente nei pendenti (gia emesso e in ordiniEmessi)
                if (pendenti.some(p => String(p.fornitore_codice) === fk)) return;
                if (f.status === 'emit_failed') return; // non mostrare i falliti
                pendenti.push({
                    fornitore_codice: fk,
                    fornitore_nome: f.nome,
                    fornitore_email: f.emissioneResult ? f.emissioneResult.fornitore_email : '',
                    numord: f.emissioneResult ? f.emissioneResult.numord : null,
                    serie: f.emissioneResult ? f.emissioneResult.serie : null,
                    anno: f.emissioneResult ? f.emissioneResult.anno : null,
                    _emissioneInCorso: (f.status === 'waiting' || f.status === 'emitting')
                });
            });
        }

        if (pendenti.length === 0 && !_batchUnifiedState.active) return;

        _batchCustomOverrides.clear();

        // Mostra modale — se c'e emissione in corso, attiva modalita emissione (barra avanzamento + stati riga)
        const risultato = await modaleBatchEmail(pendenti, { emissioneMode: _batchUnifiedState.active });
        if (!risultato) return;

        const { righeSelezionate } = risultato;
        if (righeSelezionate.length === 0) return;

        // --- FASE INVIO (il modale resta aperto, mostra progresso) ---
        const elAzioni = document.getElementById('modalGenericAzioni');
        let successi = 0, falliti = 0;

        for (const riga of righeSelezionate) {
            const statusCell = document.getElementById('batchSt_' + riga.fornitore_codice);
            if (statusCell) statusCell.innerHTML = '<span style="color:var(--warning);">\u23F3</span>';

            const override = _batchCustomOverrides.get(String(riga.fornitore_codice)) || {};
            const sendOpts = { template_id: riga.templateId };
            if (override.oggetto_custom) {
                sendOpts.oggetto_custom = override.oggetto_custom;
                sendOpts.corpo_custom = override.corpo_custom;
            }

            const result = await _inviaEmailDirect(riga, sendOpts);

            if (result.success) {
                successi++;
                if (statusCell) statusCell.innerHTML = '<span style="color:var(--success); font-weight:900;">\u2714</span>';
                if (_templateMode === 'ultima_scelta' && riga.templateId) {
                    onTemplateSelectChange(String(riga.fornitore_codice), riga.templateId);
                }
            } else {
                falliti++;
                if (statusCell) statusCell.innerHTML = '<span style="color:var(--danger); font-weight:900;">\u2716</span>';
                if (result.error === 'SMTP_NOT_CONFIGURED' || result.error === 'EMAIL_PROVA_MISSING') {
                    const idx = righeSelezionate.indexOf(riga);
                    for (let i = idx + 1; i < righeSelezionate.length; i++) {
                        const sc = document.getElementById('batchSt_' + righeSelezionate[i].fornitore_codice);
                        if (sc) sc.innerHTML = '<span style="color:var(--text-muted);">\u2014</span>';
                    }
                    break;
                }
            }
            aggiornaBarraEmettiTutti();
        }

        // Riepilogo finale: sostituisci azioni con "Chiudi"
        if (elAzioni) {
            elAzioni.innerHTML = '';
            let msgR = '';
            if (successi > 0) msgR += `<span style="color:var(--success);font-weight:600;">${successi} inviate</span>`;
            if (successi > 0 && falliti > 0) msgR += ' \u2014 ';
            if (falliti > 0) msgR += `<span style="color:var(--danger);font-weight:600;">${falliti} fallite</span>`;

            const rSpan = document.createElement('span');
            rSpan.style.cssText = 'font-size:0.85rem;margin-right:auto;';
            rSpan.innerHTML = msgR;
            elAzioni.appendChild(rSpan);

            const btnChiudi = document.createElement('button');
            btnChiudi.textContent = 'Chiudi';
            btnChiudi.className = 'mrp-btn mrp-btn-primary';
            btnChiudi.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnChiudi.addEventListener('click', () => document.getElementById('modalGenericOverlay').classList.remove('open'));
            elAzioni.appendChild(btnChiudi);
        }
    }

    /** Modale batch: tabella con checkbox, dropdown template, modifica manuale */
    /**
     * Modale batch email — usata sia per "Invia Tutte le Email" (modalità normale)
     * sia per "Emetti Tutti" (modalità emissione: righe partono in stato waiting,
     * barra avanzamento in cima, si accendono man mano che gli ordini vengono emessi).
     *
     * @param {Array} pendenti - array di oggetti fornitore (con dati ordine se disponibili)
     * @param {Object} opts - { emissioneMode: boolean }
     *   In emissioneMode le righe non hanno ancora anno/serie/numord, checkbox e controlli
     *   sono disabilitati finché lo stato non diventa 'emitted'.
     */
    async function modaleBatchEmail(pendenti, opts = {}) {
        const emissioneMode = !!opts.emissioneMode;

        // Carica bozze salvate dal DB per pre-popolare overrides e badge (solo se non in emissione)
        if (!emissioneMode) {
            try {
                const draftResp = await fetch(`${MrpApp.API_BASE}/email-drafts`, { credentials: 'include' });
                const draftData = await draftResp.json();
                if (draftData.drafts) {
                    draftData.drafts.forEach(d => {
                        const key = pendenti.find(p =>
                            String(p.anno) === String(d.Anno) &&
                            String(p.serie).trim() === String(d.Serie).trim() &&
                            String(p.numord) === String(d.NumOrd)
                        );
                        if (key) {
                            const fk = String(key.fornitore_codice || '');
                            if (!_batchCustomOverrides.has(fk)) {
                                _batchCustomOverrides.set(fk, { oggetto_custom: d.OggettoCustom, corpo_custom: d.CorpoCustom });
                            }
                        }
                    });
                }
            } catch (_) { /* ignora */ }
        }

        return new Promise(resolve => {
            const overlay = document.getElementById('modalGenericOverlay');
            const elTitolo = document.getElementById('modalGenericTitolo');
            const elIcona = document.getElementById('modalGenericIcona');
            const elMsg = document.getElementById('modalGenericMessaggio');
            const elAzioni = document.getElementById('modalGenericAzioni');
            if (!overlay) { resolve(null); return; }

            function buildBatchOptions(fk, selectedTid) {
                const personalizzati = _emailTemplates.filter(t => String(t.fornitoreCode) === fk);
                const generici = _emailTemplates.filter(t => !t.fornitoreCode);
                let html = '';
                if (personalizzati.length) {
                    html += '<optgroup label="\u2605 Personalizzati">';
                    personalizzati.forEach(t => {
                        const sel = String(t.id) === selectedTid ? ' selected' : '';
                        html += '<option value="' + t.id + '"' + sel + '>' + esc(t.nome) + '</option>';
                    });
                    html += '</optgroup>';
                }
                html += '<optgroup label="Template">';
                generici.forEach(t => {
                    const sel = String(t.id) === selectedTid ? ' selected' : '';
                    const badge = t.isSystem ? ' [S]' : '';
                    html += '<option value="' + t.id + '"' + sel + '>' + esc(t.nome) + badge + '</option>';
                });
                html += '</optgroup>';
                return html;
            }

            const righeHtml = pendenti.map(p => {
                const fk = String(p.fornitore_codice || '');
                const selWidget = document.querySelector('.select-template-forn[data-forn="' + fk + '"]');
                const selectedTid = selWidget ? selWidget.value : String(getTemplateIdPerFornitore(fk) || '');
                const email = p.fornitore_email || p.email_fornitore || '';
                // In emissioneMode le righe partono disabilitate (waiting)
                const isWaiting = emissioneMode && !p.numord;
                const chkDisabled = isWaiting || !email ? ' disabled' : '';
                const chkChecked = !isWaiting && email ? ' checked' : '';
                const ctrlDisabled = isWaiting ? ' disabled' : '';
                const rowClass = isWaiting ? ' class="unified-row-waiting"' : '';
                const ordLabel = p.numord ? esc(p.numord + '/' + p.serie) : '\u2014';
                const emailLabel = isWaiting ? '\u2014' : (email ? esc(email) : '<em>mancante</em>');
                const emailColor = isWaiting ? 'var(--text-muted)' : (email ? 'var(--text-muted)' : 'var(--danger)');
                const statusIcon = isWaiting ? '<span class="unified-status" style="color:var(--text-muted);">\u23F3</span>' : '';

                const selHtml = '<select class="batch-tpl-sel" data-forn="' + escAttr(fk) + '" style="font-size:0.76rem;padding:2px 6px;border:1px solid var(--border);border-radius:4px;max-width:150px;"' + ctrlDisabled + '>' +
                    buildBatchOptions(fk, selectedTid) + '</select>';

                return '<tr id="batchRow_' + escAttr(fk) + '"' + rowClass + ' data-forn="' + escAttr(fk) + '">' +
                    '<td style="text-align:center;"><input type="checkbox" class="batch-chk" id="batchChk_' + escAttr(fk) + '" data-forn="' + escAttr(fk) + '"' + chkDisabled + chkChecked + ' style="accent-color:var(--primary);" /></td>' +
                    '<td id="batchOrd_' + escAttr(fk) + '"><strong>' + ordLabel + '</strong></td>' +
                    '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escAttr(p.fornitore_nome || '') + '">' + esc(p.fornitore_nome || fk) + '</td>' +
                    '<td id="batchEmail_' + escAttr(fk) + '" style="font-size:0.73rem;color:' + emailColor + ';max-width:160px;overflow:hidden;text-overflow:ellipsis;" title="' + escAttr(email) + '">' + emailLabel + '</td>' +
                    '<td>' + selHtml + '</td>' +
                    '<td style="text-align:center;white-space:nowrap;">' +
                        '<button class="batch-edit-btn" id="batchEdit_' + escAttr(fk) + '" data-forn="' + escAttr(fk) + '" style="font-size:0.72rem;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:white;cursor:pointer;" title="Modifica manuale"' + ctrlDisabled + '>\u270E</button>' +
                        '<span class="batch-edit-badge" data-forn="' + escAttr(fk) + '" style="display:' + ((_batchCustomOverrides.has(fk) || _emailTemplates.some(t => String(t.id) === selectedTid && t.fornitoreCode)) ? 'inline' : 'none') + ';font-size:0.66rem;background:#dbeafe;color:var(--primary);padding:1px 6px;border-radius:8px;margin-left:3px;font-weight:600;">Personalizzato</span>' +
                    '</td>' +
                    '<td id="batchSt_' + escAttr(fk) + '" style="text-align:center;width:32px;">' + statusIcon + '</td>' +
                    '</tr>';
            }).join('');

            elTitolo.textContent = 'Invia Tutte le Email';
            elIcona.textContent = '\u2709';

            // Barra avanzamento (solo in emissioneMode)
            const progressHtml = emissioneMode ?
                '<div class="unified-progress-section" id="unifiedProgressSection">' +
                    '<div class="unified-progress-label" id="unifiedProgressLabel">Emissione: 0/' + pendenti.length + '</div>' +
                    '<div class="unified-progress-track"><div class="unified-progress-bar" id="unifiedProgressBar"></div></div>' +
                '</div>' : '';

            // Info riga
            const infoHtml = emissioneMode
                ? '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;"><strong>' + pendenti.length + '</strong> ordini in emissione. Seleziona e invia le email appena pronti.</div>'
                : '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;"><strong>' + pendenti.length + '</strong> email pronte. Seleziona, personalizza e invia.</div>';

            // Avviso email (solo in emissioneMode)
            const warningHtml = emissioneMode
                ? '<div class="unified-warning-box">\u26A0\uFE0F Gli ordini vengono registrati nel gestionale ma i fornitori non li riceveranno finch\u00E9 non invii le email.</div>'
                : '';

            elMsg.innerHTML =
                '<div style="text-align:left;">' +
                    progressHtml +
                    infoHtml +
                    '<div style="max-height:380px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
                        '<table class="emetti-riepilogo-table" style="width:100%;margin:0;">' +
                            '<thead><tr>' +
                                '<th style="width:28px;text-align:center;"><input type="checkbox" id="batchChkAll" checked style="accent-color:var(--primary);" /></th>' +
                                '<th>Ordine</th><th>Fornitore</th><th>Email</th><th>Template</th><th style="text-align:center;">Azioni</th><th style="width:32px;"></th>' +
                            '</tr></thead>' +
                            '<tbody>' + righeHtml + '</tbody>' +
                        '</table>' +
                    '</div>' +
                    warningHtml +
                '</div>';

            if (emissioneMode) _batchUnifiedState.modalOpen = true;

            elAzioni.innerHTML = '';

            // --- Checkbox "seleziona tutto" ---
            const chkAll = document.getElementById('batchChkAll');
            if (chkAll) chkAll.addEventListener('change', () => {
                document.querySelectorAll('.batch-chk:not(:disabled)').forEach(cb => { cb.checked = chkAll.checked; });
                aggiornaContoBatch();
            });
            document.querySelectorAll('.batch-chk').forEach(cb => cb.addEventListener('change', aggiornaContoBatch));

            // --- Cambio template: aggiorna badge personalizzato ---
            document.querySelectorAll('.batch-tpl-sel').forEach(sel => {
                sel.addEventListener('change', () => {
                    const fk = sel.dataset.forn;
                    const badge = document.querySelector('.batch-edit-badge[data-forn="' + fk + '"]');
                    if (_batchCustomOverrides.has(fk)) _batchCustomOverrides.delete(fk);
                    const tid = parseInt(sel.value, 10);
                    const tpl = _emailTemplates.find(t => t.id === tid);
                    if (badge) badge.style.display = (tpl && tpl.fornitoreCode) ? 'inline' : 'none';
                    // Salva selezione nello stato unificato
                    if (emissioneMode) {
                        const f = _batchUnifiedState.fornitori.find(x => String(x.fornitore_codice) === fk);
                        if (f) f.selectedTemplateId = sel.value;
                    }
                });
            });

            // --- Bottoni modifica manuale ---
            document.querySelectorAll('.batch-edit-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fk = btn.dataset.forn;
                    // In emissioneMode, l'emesso e nello stato unificato
                    let emesso;
                    if (emissioneMode) {
                        const f = _batchUnifiedState.fornitori.find(x => String(x.fornitore_codice) === fk);
                        emesso = f ? f.emissioneResult : null;
                    } else {
                        emesso = pendenti.find(p => String(p.fornitore_codice) === fk);
                    }
                    if (!emesso) return;

                    const tplSel = document.querySelector('.batch-tpl-sel[data-forn="' + fk + '"]');
                    const tid = tplSel ? parseInt(tplSel.value, 10) : null;

                    const origText = btn.textContent;
                    btn.classList.add('loading');
                    btn.textContent = '\u23F3';

                    try {
                        const prevResp = await fetch(`${MrpApp.API_BASE}/preview-ordine-email`, {
                            credentials: 'include', method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ anno: emesso.anno, serie: emesso.serie, numord: emesso.numord, template_id: tid })
                        });
                        const prevData = await prevResp.json();

                        btn.classList.remove('loading');
                        btn.textContent = origText;

                        if (prevData.error) { alert('Errore: ' + prevData.error); return; }

                        const esistente = _batchCustomOverrides.get(fk);
                        const risultato = await modaleAnteprimaEmail({
                            ordine: emesso.numord + '/' + emesso.serie,
                            fornitore: prevData.fornitore_nome,
                            destinatario: prevData.destinatario,
                            ambiente: prevData.ambiente,
                            oggetto: esistente ? esistente.oggetto_custom : prevData.oggetto,
                            corpo: esistente ? esistente.corpo_custom : prevData.corpo,
                            batchMode: true,
                            fornitore_codice: parseInt(fk, 10) || null
                        });

                        if (risultato) {
                            _batchCustomOverrides.set(fk, { oggetto_custom: risultato.oggetto, corpo_custom: risultato.corpo });
                            const badge = document.querySelector('.batch-edit-badge[data-forn="' + fk + '"]');
                            if (badge) { badge.style.display = 'inline'; badge.title = risultato.oggetto.substring(0, 60); }
                            try {
                                await fetch(`${MrpApp.API_BASE}/email-drafts`, {
                                    credentials: 'include', method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ anno: emesso.anno, serie: emesso.serie, numord: emesso.numord, oggetto: risultato.oggetto, corpo: risultato.corpo })
                                });
                            } catch (_) {}
                        }
                    } catch (err) {
                        btn.classList.remove('loading');
                        btn.textContent = origText;
                        alert('Errore: ' + err.message);
                    }
                });
            });

            // --- Conteggio + Azioni ---
            const contoSpan = document.createElement('span');
            contoSpan.id = 'batchConto';
            contoSpan.style.cssText = 'font-size:0.82rem;color:var(--text-muted);margin-right:auto;';

            function aggiornaContoBatch() {
                const n = document.querySelectorAll('.batch-chk:checked').length;
                contoSpan.textContent = n + ' selezionate';
                if (btnInvia) {
                    btnInvia.disabled = n === 0;
                    btnInvia.style.opacity = n === 0 ? '0.5' : '1';
                }
            }
            contoSpan.textContent = document.querySelectorAll('.batch-chk:checked').length + ' selezionate';

            function cleanup(result) {
                if (emissioneMode) {
                    chiudiModaleUnificato();
                } else {
                    overlay.classList.remove('open');
                }
                resolve(result);
            }

            const btnAnnulla = document.createElement('button');
            btnAnnulla.textContent = emissioneMode ? 'Chiudi' : 'Annulla';
            btnAnnulla.className = 'mrp-btn mrp-btn-secondary';
            btnAnnulla.style.cssText = 'padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnAnnulla.addEventListener('click', () => cleanup(null));

            const btnInvia = document.createElement('button');
            btnInvia.id = 'unifiedBtnInvia';
            btnInvia.textContent = '\u2709 Invia Selezionate';
            btnInvia.className = 'mrp-btn mrp-btn-primary';
            btnInvia.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnInvia.addEventListener('click', () => {
                if (emissioneMode) {
                    // Modalita unificata: gestione queue
                    gestisciInviaSelezionate();
                } else {
                    // Modalita normale: raccogli e risolvi
                    const righeSelezionate = [];
                    document.querySelectorAll('.batch-chk:checked').forEach(cb => {
                        const fk = cb.dataset.forn;
                        const emesso = pendenti.find(p => String(p.fornitore_codice) === fk);
                        if (!emesso) return;
                        const tplSel = document.querySelector('.batch-tpl-sel[data-forn="' + fk + '"]');
                        const tid = tplSel ? parseInt(tplSel.value, 10) : null;
                        righeSelezionate.push({ ...emesso, templateId: tid });
                    });
                    document.querySelectorAll('.batch-chk,.batch-tpl-sel,.batch-edit-btn,#batchChkAll').forEach(el => el.disabled = true);
                    btnInvia.disabled = true; btnInvia.style.opacity = '0.5'; btnInvia.textContent = 'Invio in corso...';
                    btnAnnulla.disabled = true; btnAnnulla.style.opacity = '0.5';
                    resolve({ righeSelezionate });
                }
            });

            elAzioni.appendChild(contoSpan);
            elAzioni.appendChild(btnAnnulla);
            elAzioni.appendChild(btnInvia);
            overlay.classList.add('open');

            const closeBtn = document.getElementById('modalGenericClose');
            const closeHandler = () => { cleanup(null); closeBtn.removeEventListener('click', closeHandler); };
            closeBtn.addEventListener('click', closeHandler);

            aggiornaContoBatch();
        });
    }

    // ============================================================
    // MODALE UNIFICATA — Emetti Tutti + Invia Email
    // State machine a livello modulo (sopravvive a close/reopen)
    // ============================================================

    const _batchUnifiedState = {
        active: false,
        fornitori: [],       // { fornitore_codice, nome, articoli, status, emissioneResult, selectedTemplateId, emailError }
        autoSendSet: new Set(),
        autoSendAll: false,
        modalOpen: false,
        emissioneProgress: { done: 0, total: 0, successi: 0, falliti: 0 },
        emailProgress: { done: 0, total: 0, successi: 0, falliti: 0 }
    };

    function _resetBatchState() {
        _batchUnifiedState.active = false;
        _batchUnifiedState.fornitori = [];
        _batchUnifiedState.autoSendSet.clear();
        _batchUnifiedState.autoSendAll = false;
        _batchUnifiedState.modalOpen = false;
        _batchUnifiedState.emissioneProgress = { done: 0, total: 0, successi: 0, falliti: 0 };
        _batchUnifiedState.emailProgress = { done: 0, total: 0, successi: 0, falliti: 0 };
    }

    /** Genera le options HTML per il dropdown template di un fornitore */
    function _buildUnifiedTplOptions(fk, selectedTid) {
        const personalizzati = _emailTemplates.filter(t => String(t.fornitoreCode) === fk);
        const generici = _emailTemplates.filter(t => !t.fornitoreCode);
        let html = '';
        if (personalizzati.length) {
            html += '<optgroup label="\u2605 Personalizzati">';
            personalizzati.forEach(t => {
                const sel = String(t.id) === selectedTid ? ' selected' : '';
                html += '<option value="' + t.id + '"' + sel + '>' + esc(t.nome) + '</option>';
            });
            html += '</optgroup>';
        }
        html += '<optgroup label="Template">';
        generici.forEach(t => {
            const sel = String(t.id) === selectedTid ? ' selected' : '';
            const badge = t.isSystem ? ' [S]' : '';
            html += '<option value="' + t.id + '"' + sel + '>' + esc(t.nome) + badge + '</option>';
        });
        html += '</optgroup>';
        return html;
    }

    /** Icone per ogni stato */
    function _statusIcon(status) {
        switch (status) {
            case 'waiting':       return '<span class="unified-status" style="color:var(--text-muted);">\u23F3</span>';
            case 'emitting':      return '<span class="unified-status">\uD83D\uDD04</span>';
            case 'emitted':       return '<span class="unified-status">\u2705</span>';
            case 'emit_failed':   return '<span class="unified-status">\u274C</span>';
            case 'sending_email': return '<span class="unified-status">\u23F3</span>';
            case 'email_sent':    return '<span class="unified-status">\uD83D\uDCE8</span>';
            case 'email_failed':  return '<span class="unified-status">\u274C\uFE0F</span>';
            default:              return '';
        }
    }

    // renderRigaUnificata rimossa — ora le righe sono generate da modaleBatchEmail()

    /** Aggiorna in-place una singola riga senza re-render completo */
    function aggiornaRigaUnificata(fk) {
        if (!_batchUnifiedState.modalOpen) return;
        const f = _batchUnifiedState.fornitori.find(x => String(x.fornitore_codice) === String(fk));
        if (!f) return;
        const row = document.getElementById('batchRow_' + fk);
        if (!row) return;

        const isReady = f.status === 'emitted' || f.status === 'email_failed';
        const email = f.emissioneResult ? (f.emissioneResult.fornitore_email || '') : '';

        // CSS class riga
        row.className = 'unified-row-' + f.status.replace('_', '-');

        // Icona status
        const stCell = document.getElementById('batchSt_' + fk);
        if (stCell) stCell.innerHTML = _statusIcon(f.status);

        // Ordine label
        const ordCell = document.getElementById('batchOrd_' + fk);
        if (ordCell && f.emissioneResult) {
            ordCell.innerHTML = '<strong>' + esc(f.emissioneResult.numord + '/' + f.emissioneResult.serie) + '</strong>';
        }

        // Email
        const emailCell = document.getElementById('batchEmail_' + fk);
        if (emailCell && f.emissioneResult) {
            emailCell.style.color = email ? 'var(--text-muted)' : 'var(--danger)';
            emailCell.title = email;
            emailCell.innerHTML = email ? esc(email) : '<em>mancante</em>';
        }

        // Checkbox
        const chk = document.getElementById('batchChk_' + fk);
        if (chk) {
            chk.disabled = !isReady || !email;
            if (isReady && email && f.status === 'emitted') chk.checked = true;
            if (f.status === 'email_sent' || f.status === 'sending_email') chk.disabled = true;
        }

        // Template select + edit button
        const tplSel = document.querySelector('.batch-tpl-sel[data-forn="' + fk + '"]');
        const editBtn = document.getElementById('batchEdit_' + fk);
        if (tplSel) tplSel.disabled = !isReady;
        if (editBtn) editBtn.disabled = !isReady;

        // Aggiorna conteggio selezionate e stato bottone invia
        const contoEl = document.getElementById('batchConto');
        const btnInviaEl = document.getElementById('unifiedBtnInvia');
        if (contoEl) {
            const n = document.querySelectorAll('.batch-chk:checked').length;
            contoEl.textContent = n + ' selezionate';
            if (btnInviaEl && btnInviaEl.textContent !== 'Invio in corso...') {
                btnInviaEl.disabled = n === 0;
                btnInviaEl.style.opacity = n === 0 ? '0.5' : '1';
            }
        }
    }

    /** Aggiorna barra avanzamento emissione */
    function aggiornaProgressoEmissione() {
        if (!_batchUnifiedState.modalOpen) return;
        const p = _batchUnifiedState.emissioneProgress;
        const bar = document.getElementById('unifiedProgressBar');
        const label = document.getElementById('unifiedProgressLabel');
        if (!bar || !label) return;

        const perc = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        bar.style.width = perc + '%';

        if (p.done >= p.total) {
            label.innerHTML = '<strong>Emissione completata</strong> \u2014 ' +
                '<span style="color:var(--success);">' + p.successi + ' emess' + (p.successi > 1 ? 'i' : 'o') + '</span>' +
                (p.falliti > 0 ? ' \u2014 <span style="color:var(--danger);">' + p.falliti + ' fallit' + (p.falliti > 1 ? 'i' : 'o') + '</span>' : '');
        } else {
            const current = _batchUnifiedState.fornitori.find(f => f.status === 'emitting');
            label.textContent = 'Emissione: ' + p.done + '/' + p.total + (current ? ' \u2014 ' + current.nome : '');
        }
    }

    // _aggiornaContoUnificato e apriModaleUnificato rimossi — ora usa modaleBatchEmail(pendenti, {emissioneMode: true})

    /** Loop emissione batch — gira in background, indipendente dalla modale */
    async function eseguiEmissioneBatch() {
        const st = _batchUnifiedState;

        for (let i = 0; i < st.fornitori.length; i++) {
            const f = st.fornitori[i];
            if (f.status !== 'waiting') continue;

            f.status = 'emitting';
            aggiornaRigaUnificata(f.fornitore_codice);
            aggiornaProgressoEmissione();

            const body = {
                fornitore_codice: parseInt(f.fornitore_codice, 10),
                elaborazione_id: MrpApp.state.elaborazioneId || '',
                articoli: f.articoli.map(a => ({
                    codart: a.ol_codart,
                    fase: parseInt(a.ol_fase, 10) || 0,
                    magaz: parseInt(a.ol_magaz, 10) || 1,
                    quantita: a.quantita_confermata,
                    data_consegna: a.data_consegna,
                    prezzo: a.prezzo,
                    perqta: Number(a.perqta) || 1,
                    unmis: a.ol_unmis || 'PZ',
                    ol_progr: parseInt(a.ol_progr, 10) || 0
                }))
            };

            try {
                const data = await chiamaConAutoDeploySP(`${MrpApp.API_BASE}/emetti-ordine`, body);

                if (data.success) {
                    f.status = 'emitted';
                    f.emissioneResult = {
                        anno: data.ordine.anno,
                        serie: data.ordine.serie,
                        numord: data.ordine.numord,
                        fornitore_codice: f.fornitore_codice,
                        fornitore_nome: f.nome,
                        fornitore_email: data.ordine.fornitore_email || '',
                        pdf_base64: data.pdf_base64,
                        pdf_filename: data.pdf_filename,
                        totale_documento: data.ordine.totale_documento
                    };
                    pdfCache.set(pdfCacheKey(data.ordine.anno, data.ordine.serie, data.ordine.numord), { pdf_base64: data.pdf_base64, pdf_filename: data.pdf_filename });
                    st.emissioneProgress.successi++;

                    // Auto-send se richiesto
                    if ((st.autoSendAll || st.autoSendSet.has(String(f.fornitore_codice))) && f.emissioneResult.fornitore_email) {
                        _inviaEmailPerFornitore(String(f.fornitore_codice)); // fire-and-forget
                    }
                } else {
                    f.status = 'emit_failed';
                    f.emailError = data.error || 'Errore emissione';
                    st.emissioneProgress.falliti++;
                }
            } catch (err) {
                f.status = 'emit_failed';
                f.emailError = err.message;
                st.emissioneProgress.falliti++;
            }

            st.emissioneProgress.done++;
            aggiornaRigaUnificata(f.fornitore_codice);
            aggiornaProgressoEmissione();
        }

        // Emissione completata — ricarica proposte in background
        caricaProposta().catch(() => {});

        // Se la modale e chiusa e tutte le email sono state inviate (o non richieste), riapri
        _checkCompletamentoUnificato();
    }

    /** Gestisce click su "Invia Selezionate" */
    function gestisciInviaSelezionate() {
        const st = _batchUnifiedState;

        // Raccogli righe checked
        document.querySelectorAll('.unified-chk:checked').forEach(cb => {
            const fk = cb.dataset.forn;
            const f = st.fornitori.find(x => String(x.fornitore_codice) === fk);
            if (!f) return;

            // Salva template selezionato nello stato
            const tplSel = document.getElementById('unified_tpl_' + fk);
            if (tplSel) f.selectedTemplateId = tplSel.value;

            if (f.status === 'emitted') {
                // Gia emesso: invia subito
                _inviaEmailPerFornitore(fk);
            } else if (f.status === 'waiting' || f.status === 'emitting') {
                // Non ancora emesso: metti in coda
                st.autoSendSet.add(fk);
            }
        });

        // Se select-all e checked, marca autoSendAll
        const chkAll = document.getElementById('unifiedChkAll');
        if (chkAll && chkAll.checked) st.autoSendAll = true;

        // Feedback visuale
        const btnInvia = document.getElementById('unifiedBtnInvia');
        if (btnInvia) {
            btnInvia.textContent = 'Invio in corso...';
            btnInvia.disabled = true;
            btnInvia.style.opacity = '0.5';
        }
    }

    /** Invia email per un singolo fornitore (usa _inviaEmailDirect esistente) */
    async function _inviaEmailPerFornitore(fk) {
        const st = _batchUnifiedState;
        const f = st.fornitori.find(x => String(x.fornitore_codice) === String(fk));
        if (!f || !f.emissioneResult) return;

        f.status = 'sending_email';
        aggiornaRigaUnificata(fk);

        const override = _batchCustomOverrides.get(String(fk)) || {};
        const tplSel = document.getElementById('unified_tpl_' + fk);
        const tid = f.selectedTemplateId || (tplSel ? tplSel.value : null);
        const sendOpts = { template_id: tid ? parseInt(tid, 10) : null };
        if (override.oggetto_custom) {
            sendOpts.oggetto_custom = override.oggetto_custom;
            sendOpts.corpo_custom = override.corpo_custom;
        }

        const emesso = f.emissioneResult;
        const result = await _inviaEmailDirect(emesso, sendOpts);

        if (result.success) {
            f.status = 'email_sent';
            st.emailProgress.successi++;
            if (_templateMode === 'ultima_scelta' && tid) {
                onTemplateSelectChange(String(fk), parseInt(tid, 10));
            }
        } else {
            f.status = 'email_failed';
            f.emailError = result.error || 'Errore invio';
            st.emailProgress.falliti++;
        }

        st.emailProgress.done++;
        aggiornaRigaUnificata(fk);
        aggiornaBarraEmettiTutti();
        _checkCompletamentoUnificato();
    }

    /** Verifica se tutto e completato e gestisce riapertura modale */
    function _checkCompletamentoUnificato() {
        const st = _batchUnifiedState;
        const emissioneFinita = st.emissioneProgress.done >= st.emissioneProgress.total;
        if (!emissioneFinita) return;

        // Controlla se ci sono ancora email in volo
        const emailInVolo = st.fornitori.some(f => f.status === 'sending_email');
        if (emailInVolo) return;

        // Ci sono ancora email da inviare? (righe emesse ma non ancora inviate)
        const emailDaInviare = st.fornitori.some(f => f.status === 'emitted');
        if (emailDaInviare) return; // l'utente non ha ancora inviato — lascia i bottoni

        // Tutto completato (emissione + email inviate o nessuna email richiesta)
        if (!st.modalOpen) {
            riaperiModaleUnificato();
        } else {
            _mostraRiepilogoFinale();
        }
    }

    /** Riapre la modale dallo stato corrente (dopo close durante operazioni) */
    function riaperiModaleUnificato() {
        // Riapre "Invia Tutte le Email" — raccogliera pendenti + stato emissione
        inviaTutteEmailHandler();
    }

    /** Mostra riepilogo finale nel footer della modale */
    function _mostraRiepilogoFinale() {
        const st = _batchUnifiedState;
        const elAzioni = document.getElementById('modalGenericAzioni');
        if (!elAzioni) return;

        elAzioni.innerHTML = '';

        let msgR = '';
        const ep = st.emissioneProgress;
        const mp = st.emailProgress;
        if (ep.successi > 0) msgR += '<span style="color:var(--success);font-weight:600;">' + ep.successi + ' emess' + (ep.successi > 1 ? 'i' : 'o') + '</span>';
        if (mp.successi > 0) msgR += ' \u2014 <span style="color:#7c3aed;font-weight:600;">' + mp.successi + ' email inviat' + (mp.successi > 1 ? 'e' : 'a') + '</span>';
        if (ep.falliti > 0) msgR += ' \u2014 <span style="color:var(--danger);font-weight:600;">' + ep.falliti + ' errori emissione</span>';
        if (mp.falliti > 0) msgR += ' \u2014 <span style="color:var(--danger);font-weight:600;">' + mp.falliti + ' errori email</span>';

        const rSpan = document.createElement('span');
        rSpan.style.cssText = 'font-size:0.85rem;margin-right:auto;';
        rSpan.innerHTML = msgR;
        elAzioni.appendChild(rSpan);

        const btnChiudi = document.createElement('button');
        btnChiudi.textContent = 'Chiudi';
        btnChiudi.className = 'mrp-btn mrp-btn-primary';
        btnChiudi.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
        btnChiudi.addEventListener('click', () => {
            _batchUnifiedState.modalOpen = false;
            document.getElementById('modalGenericOverlay').classList.remove('open');
            _resetBatchState();
            aggiornaBarraEmettiTutti();
        });
        elAzioni.appendChild(btnChiudi);
    }

    /** Chiude la modale ma le operazioni continuano in background */
    function chiudiModaleUnificato() {
        _batchUnifiedState.modalOpen = false;
        const overlay = document.getElementById('modalGenericOverlay');
        if (overlay) overlay.classList.remove('open');

        // Se l'emissione e finita, resetta SEMPRE lo stato quando l'utente chiude.
        // Le email non inviate restano in ordiniEmessi e si possono inviare
        // con il bottone "Invia Tutte le Email" che legge da ordiniEmessi (dati freschi).
        const emissioneFinita = _batchUnifiedState.emissioneProgress.done >= _batchUnifiedState.emissioneProgress.total;
        const emailInVolo = _batchUnifiedState.fornitori.some(f => f.status === 'sending_email');
        if (emissioneFinita && !emailInVolo) {
            _resetBatchState();
        }
        // Se emissione ancora in corso, le operazioni continuano in background.
        // _checkCompletamentoUnificato() riaprira la modale al completamento.
        aggiornaBarraEmettiTutti();
    }

    // ============================================================
    // EMETTI TUTTI (batch) — flusso unificato emissione + email
    // ============================================================
    async function emettiTuttiHandler() {
        if (_batchUnifiedState.active) return; // gia in corso

        if (!await assicuraSPEsiste()) return;

        const completati = document.querySelectorAll('.proposta-fornitore-header.fornitore-completato');
        const fornitori = [];
        const skippedEmailPending = []; // richiedono merge dialog manuale

        completati.forEach(h => {
            const fc = h.dataset.forn;
            const confermati = MrpApp.state.ordiniConfermati;
            const articoliFornitore = [];
            confermati.forEach((ordine, key) => {
                if (String(ordine.fornitore_codice) === String(fc)) {
                    articoliFornitore.push(ordine);
                }
            });
            if (articoliFornitore.length === 0) return;

            const nome = articoliFornitore[0].fornitore_nome || fc;

            // Se esiste un ordine email-pending per questo fornitore, richiede una
            // decisione manuale (merge vs separato) — lo escludiamo dal batch automatico.
            if (ordiniEmessi.has(fc)) {
                skippedEmailPending.push({ fornitore_codice: fc, nome });
                return;
            }

            // Raggruppa per data: date diverse → ordini separati
            const gruppi = raggruppaPerData(articoliFornitore);
            for (const gruppo of gruppi) {
                const dataLabel = gruppo.data !== 'no-date'
                    ? new Date(gruppo.data).toLocaleDateString('it-IT')
                    : '';
                const nomeGruppo = gruppi.length > 1 && dataLabel
                    ? nome + ' (cons. ' + dataLabel + ')'
                    : nome;
                fornitori.push({ fornitore_codice: fc, articoli: gruppo.articoli, nome: nomeGruppo });
            }
        });

        if (fornitori.length === 0 && skippedEmailPending.length === 0) return;

        if (fornitori.length === 0 && skippedEmailPending.length > 0) {
            await modale('warning', 'Nessun ordine processabile in batch',
                'Tutti i fornitori con articoli confermati hanno già un ordine con email da inviare.<br>' +
                'Usa il pulsante <strong>Emetti</strong> del singolo fornitore per decidere se unire o creare un ordine separato.<br><br>' +
                skippedEmailPending.map(f => '\u2022 ' + esc(f.nome)).join('<br>'));
            return;
        }

        let msgSkip = '';
        if (skippedEmailPending.length > 0) {
            msgSkip = '<br><br><strong style="color:var(--warning);">Esclusi dal batch (richiedono scelta manuale unisci/separato):</strong><br>'
                + skippedEmailPending.map(f => '\u2022 ' + esc(f.nome)).join('<br>');
        }

        const conferma = await modale('question', 'Conferma Emissione Batch',
            `Stai per emettere <strong>${fornitori.length} ordini</strong> per i seguenti fornitori:<br><br>`
            + fornitori.map(f => `\u2022 ${esc(f.nome)}`).join('<br>')
            + msgSkip
            + '<br><br>Procedere?',
            [
                { label: 'Emetti Tutti', value: true, style: 'success' },
                { label: 'Annulla', value: false, style: 'secondary' }
            ]);

        if (!conferma) return;

        // Inizializza stato unificato per tracciare emissione
        _resetBatchState();
        _batchUnifiedState.active = true;
        _batchUnifiedState.emissioneProgress.total = fornitori.length;
        _batchUnifiedState.fornitori = fornitori.map(f => ({
            fornitore_codice: f.fornitore_codice,
            nome: f.nome,
            articoli: f.articoli,
            status: 'waiting',
            emissioneResult: null,
            selectedTemplateId: String(getTemplateIdPerFornitore(f.fornitore_codice) || ''),
            emailError: null
        }));

        // Lancia emissione in background
        eseguiEmissioneBatch();

        // Apri il modale "Invia Tutte le Email" — mostrera le email gia pendenti
        // + le nuove che si aggiungono man mano dall'emissione
        inviaTutteEmailHandler();
    }

    // ============================================================
    // VISUALIZZA ORDINE EMESSO (riapre modale risultato)
    // ============================================================
    async function apriDettaglioOrdine(anno, serie, numord) {
        try {
            const res = await fetch(`${MrpApp.API_BASE}/ordine-dettaglio/${anno}/${serie}/${numord}`, { credentials: 'include' });
            const data = await res.json();
            if (res.ok && data.success) {
                // Cache il PDF per download futuro
                pdfCache.set(pdfCacheKey(data.ordine.anno, data.ordine.serie, data.ordine.numord), {
                    pdf_base64: data.pdf_base64,
                    pdf_filename: data.pdf_filename
                });
                mostraRisultatoEmissione(data, data.ordine.fornitore_nome);
            } else {
                await modale('error', 'Errore', esc(data.error || 'Impossibile caricare il dettaglio ordine'));
            }
        } catch (err) {
            await modale('error', 'Errore', 'Errore di connessione: ' + esc(err.message));
        }
    }

    // ============================================================
    // STORICO ORDINI EMESSI
    // ============================================================
    async function apriStorico() {
        const overlay = document.getElementById('modalStoricoOverlay');
        if (!overlay) return;
        overlay.classList.add('open');
        // Default: elaborazione corrente selezionata
        const currentElabId = MrpApp.state.elaborazione ? String(MrpApp.state.elaborazione.id) : null;
        _storicoFiltri.elaborazioneId = currentElabId;
        await caricaStorico();
    }

    // ── Stato filtri storico ──
    const _storicoFiltri = {
        elaborazioneId: null,
        categorie: new Set(['accettata', 'modificata', 'misto', 'indipendente']),
        elabCollapsed: new Set()
    };
    let _storicoData = null; // cache dati per filtri client-side

    const _catConfig = {
        accettata:     { label: 'P.O.F. Accettate',  cssVar: '--storico-accettata',     tip: 'Ordini emessi verso fornitori proposti, con quantit\u00E0 identiche alla proposta MRP' },
        modificata:    { label: 'P.O.F. Modificate',  cssVar: '--storico-modificata',    tip: 'Ordini verso fornitori proposti, ma con quantit\u00E0 diverse dalla proposta MRP' },
        misto:         { label: 'Misti',              cssVar: '--storico-misto',          tip: 'Ordini con sia articoli dalla proposta MRP che articoli aggiunti manualmente' },
        indipendente:  { label: 'Indipendenti',       cssVar: '--storico-indipendente',  tip: 'Ordini verso fornitori non presenti nelle proposte MRP' }
    };

    function _renderOrdineRow(o) {
        const dataStr = o.data_emissione ? new Date(o.data_emissione).toLocaleDateString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '';
        const totale = Number(o.totale_documento || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const emailIcon = o.email_inviata
            ? '<span class="storico-email-ok" title="Email inviata">\u2714</span>'
            : '<span class="storico-email-no" title="Email non inviata">\u2716</span>';
        const origBadge = o.origine === 'bcube' ? '<span style="font-size:0.65rem;background:#dbeafe;color:#7c3aed;padding:1px 5px;border-radius:4px;margin-left:4px;">BCube</span>' : '';
        const cat = o.categoria || 'indipendente';
        const catCfg = _catConfig[cat] || _catConfig.indipendente;
        const catBadge = '<span class="storico-cat-badge cat-' + cat + '" title="' + escAttr(catCfg.tip) + '">' + esc(catCfg.label) + '</span>';

        return '<tr class="storico-row-' + cat + ' storico-elab-rows" data-cat="' + cat + '" data-elab="' + escAttr(o.elaborazione_id || '') + '">' +
            '<td>' + dataStr + '</td>' +
            '<td><strong>' + o.ord_numord + '/' + o.ord_serie + '</strong>' + origBadge + catBadge + '</td>' +
            '<td>' + esc(o.fornitore_nome || '') + ' <small>(' + o.fornitore_codice + ')</small></td>' +
            '<td class="num">' + o.num_righe + '</td>' +
            '<td class="num">\u20ac ' + totale + '</td>' +
            '<td class="center">' + emailIcon + '</td>' +
            '<td>' +
                '<button class="btn-storico-visualizza" data-anno="' + o.ord_anno + '" data-serie="' + escAttr(o.ord_serie) + '" data-numord="' + o.ord_numord + '" title="Visualizza ordine">\uD83D\uDD0D</button>' +
                '<button class="btn-storico-pdf" data-anno="' + o.ord_anno + '" data-serie="' + escAttr(o.ord_serie) + '" data-numord="' + o.ord_numord + '" title="Scarica PDF">\u2B07</button>' +
            '</td></tr>';
    }

    function _renderElabHeader(e) {
        const fpDate = e.Fingerprint ? new Date(e.Fingerprint).toLocaleDateString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '?';
        const ordini = e.num_ordini || 0;
        const accettati = e.num_accettati || 0;
        const modificati = e.num_modificati || 0;
        const indipendenti = e.num_indipendenti || 0;
        const misti = e.num_misti || 0;
        const pofIgnorate = e.num_pof_ignorate || 0;

        let stats = e.TotaleProposte + ' proposte \u00B7 <strong>' + ordini + '</strong> ordini';
        const detOrd = [];
        if (accettati > 0) detOrd.push('<span title="' + escAttr(_catConfig.accettata.tip) + '" style="cursor:help;">' + accettati + ' P.O.F. accettate</span>');
        if (modificati > 0) detOrd.push('<span title="' + escAttr(_catConfig.modificata.tip) + '" style="color:var(--warning);cursor:help;">' + modificati + ' P.O.F. modificate</span>');
        if (misti > 0) detOrd.push('<span title="' + escAttr(_catConfig.misto.tip) + '" style="color:#7c3aed;cursor:help;">' + misti + ' misti</span>');
        if (indipendenti > 0) detOrd.push('<span title="' + escAttr(_catConfig.indipendente.tip) + '" style="cursor:help;">' + indipendenti + ' indipendenti</span>');
        if (detOrd.length > 0) stats += ' (' + detOrd.join(', ') + ')';
        stats += ' \u00B7 <span title="Proposte MRP non evase" style="cursor:help;">' + pofIgnorate + ' ignorate</span>';

        const isCollapsed = _storicoFiltri.elabCollapsed.has(String(e.ID));
        const toggleClass = isCollapsed ? ' collapsed' : '';

        return '<tr class="storico-elab-header" data-elab-id="' + e.ID + '">' +
            '<td colspan="7" style="background:var(--bg);padding:10px 8px;border-bottom:2px solid var(--primary);">' +
                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                    '<span class="storico-elab-toggle' + toggleClass + '">\u25BC</span>' +
                    '<strong style="font-size:0.9rem;">Elaborazione del ' + fpDate + '</strong>' +
                    '<span style="font-size:0.78rem;color:var(--text-muted);">' + stats + '</span>' +
                    '<button class="btn-storico-dettaglio-elab" data-elab-id="' + e.ID + '" style="margin-left:auto;font-size:0.73rem;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:white;cursor:pointer;" title="Dettaglio elaborazione">\uD83D\uDCC4 Dettaglio</button>' +
                '</div>' +
            '</td></tr>';
    }

    function _renderStoricoKPI(ordini) {
        const kpi = document.getElementById('storicoKPI');
        if (!kpi) return;
        // Filtra ordini visibili in base a elaborazione e categorie selezionate
        const filtrati = ordini.filter(o => {
            const catOk = _storicoFiltri.categorie.has(o.categoria || 'indipendente');
            const elabOk = !_storicoFiltri.elaborazioneId || String(o.elaborazione_id) === _storicoFiltri.elaborazioneId;
            return catOk && elabOk;
        });
        const totOrdini = filtrati.length;
        const totValore = filtrati.reduce((s, o) => s + Number(o.totale_documento || 0), 0);
        const totFornitori = new Set(filtrati.map(o => o.fornitore_codice)).size;
        kpi.innerHTML =
            '<div class="storico-kpi-item"><span class="storico-kpi-value">' + totOrdini + '</span> ordini</div>' +
            '<div class="storico-kpi-item">\u20ac <span class="storico-kpi-value">' + totValore.toLocaleString('it-IT', { minimumFractionDigits: 2 }) + '</span></div>' +
            '<div class="storico-kpi-item"><span class="storico-kpi-value">' + totFornitori + '</span> fornitori</div>';
    }

    function _renderStoricoChips(ordini) {
        const container = document.getElementById('storicoChips');
        if (!container) return;
        const filtrati = ordini.filter(o =>
            !_storicoFiltri.elaborazioneId || String(o.elaborazione_id) === _storicoFiltri.elaborazioneId
        );
        const counts = { accettata: 0, modificata: 0, misto: 0, indipendente: 0 };
        filtrati.forEach(o => { counts[o.categoria || 'indipendente']++; });

        container.innerHTML = '';
        for (const [cat, cfg] of Object.entries(_catConfig)) {
            const isActive = _storicoFiltri.categorie.has(cat);
            const currentColor = getComputedStyle(document.documentElement).getPropertyValue(cfg.cssVar).trim();

            const chip = document.createElement('span');
            chip.className = 'storico-chip' + (isActive ? ' active' : '');
            chip.dataset.cat = cat;
            chip.title = cfg.tip;

            // Testo del chip
            const textSpan = document.createElement('span');
            textSpan.innerHTML = '<strong>' + counts[cat] + '</strong> ' + cfg.label;
            chip.appendChild(textSpan);

            // Color picker inline
            const picker = document.createElement('input');
            picker.type = 'color';
            picker.className = 'storico-chip-color';
            picker.value = currentColor || '#000000';
            picker.title = 'Cambia colore: ' + cfg.label;
            picker.addEventListener('input', (e) => {
                e.stopPropagation();
                if (typeof MrpTheme !== 'undefined' && MrpTheme.setColor) {
                    MrpTheme.setColor(cfg.cssVar, e.target.value);
                } else {
                    document.documentElement.style.setProperty(cfg.cssVar, e.target.value);
                }
            });
            picker.addEventListener('click', (e) => e.stopPropagation()); // non toggle il chip
            chip.appendChild(picker);

            // Click sul chip (non sul picker) → toggle filtro
            textSpan.addEventListener('click', () => {
                if (_storicoFiltri.categorie.has(cat)) {
                    _storicoFiltri.categorie.delete(cat);
                    chip.classList.remove('active');
                } else {
                    _storicoFiltri.categorie.add(cat);
                    chip.classList.add('active');
                }
                _applicaFiltriStorico();
            });

            container.appendChild(chip);
        }
    }

    function _renderStoricoElabDropdown(elaborazioni) {
        const sel = document.getElementById('storicoFiltroElab');
        if (!sel) return;
        const currentElabId = MrpApp.state.elaborazione ? String(MrpApp.state.elaborazione.id) : null;
        sel.innerHTML = '<option value="">Tutte le elaborazioni</option>';
        elaborazioni.forEach(e => {
            const fpDate = e.Fingerprint ? new Date(e.Fingerprint).toLocaleDateString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '?';
            const isCurrent = currentElabId && String(e.ID) === currentElabId;
            const star = isCurrent ? '\u2B50 ' : '';
            sel.innerHTML += '<option value="' + e.ID + '">' + star + fpDate + ' (' + (e.num_ordini || 0) + ' ordini)</option>';
        });
        sel.value = _storicoFiltri.elaborazioneId || '';
        sel.addEventListener('change', () => {
            _storicoFiltri.elaborazioneId = sel.value || null;
            _applicaFiltriStorico();
            if (_storicoData) _renderStoricoKPI(_storicoData.ordini || []);
        });
    }

    function _applicaFiltriStorico() {
        const rows = document.querySelectorAll('.storico-elab-rows');
        const headers = document.querySelectorAll('.storico-elab-header');

        rows.forEach(row => {
            const cat = row.dataset.cat;
            const elab = row.dataset.elab;
            const catOk = _storicoFiltri.categorie.has(cat);
            const elabOk = !_storicoFiltri.elaborazioneId || elab === _storicoFiltri.elaborazioneId;
            const collapsed = _storicoFiltri.elabCollapsed.has(elab);
            row.style.display = (catOk && elabOk && !collapsed) ? '' : 'none';
        });

        headers.forEach(h => {
            const eid = h.dataset.elabId;
            const elabOk = !_storicoFiltri.elaborazioneId || eid === _storicoFiltri.elaborazioneId;
            h.style.display = elabOk ? '' : 'none';
        });

        // Aggiorna KPI e conteggi chip in base ai filtri
        if (_storicoData) {
            _renderStoricoKPI(_storicoData.ordini || []);
            // Ricalcola conteggi chip per l'elaborazione selezionata
            const ordiniPerConteggio = (_storicoData.ordini || []).filter(o =>
                !_storicoFiltri.elaborazioneId || String(o.elaborazione_id) === _storicoFiltri.elaborazioneId
            );
            const counts = { accettata: 0, modificata: 0, misto: 0, indipendente: 0 };
            ordiniPerConteggio.forEach(o => { counts[o.categoria || 'indipendente']++; });
            document.querySelectorAll('.storico-chip').forEach(chip => {
                const cat = chip.dataset.cat;
                const strong = chip.querySelector('strong');
                if (strong) strong.textContent = counts[cat] || 0;
            });
        }
    }

    async function caricaStorico(filtri = {}) {
        const body = document.getElementById('storicoBody');
        const loading = document.getElementById('storicoLoading');
        if (!body) return;

        if (loading) loading.style.display = '';
        body.innerHTML = '';

        try {
            const params = new URLSearchParams();
            if (filtri.fornitore) params.set('fornitore', filtri.fornitore);
            if (filtri.da) params.set('da', filtri.da);
            if (filtri.a) params.set('a', filtri.a);

            const res = await fetch(`${MrpApp.API_BASE}/storico-ordini?${params}`, { credentials: 'include' });
            const data = await res.json();
            if (loading) loading.style.display = 'none';

            const ordini = data.ordini || [];
            const elaborazioni = data.elaborazioni || [];
            _storicoData = data;

            if (ordini.length === 0 && elaborazioni.length === 0) {
                body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Nessun ordine emesso</td></tr>';
                document.getElementById('storicoKPI').innerHTML = '';
                document.getElementById('storicoChips').innerHTML = '';
                return;
            }

            // KPI, Chips, Dropdown
            _renderStoricoKPI(ordini);
            _renderStoricoChips(ordini);
            _renderStoricoElabDropdown(elaborazioni);

            // Raggruppamento per elaborazione
            const ordiniPerElab = {};
            const ordiniSenzaElab = [];
            ordini.forEach(o => {
                const eid = o.elaborazione_id;
                if (eid && eid !== '' && eid !== '0') {
                    if (!ordiniPerElab[eid]) ordiniPerElab[eid] = [];
                    ordiniPerElab[eid].push(o);
                } else {
                    ordiniSenzaElab.push(o);
                }
            });

            let html = '';
            for (const e of elaborazioni) {
                const eid = String(e.ID);
                const ordiniElab = ordiniPerElab[eid] || [];
                if (ordiniElab.length === 0) continue;
                html += _renderElabHeader(e);
                html += ordiniElab.map(o => _renderOrdineRow(o)).join('');
            }
            if (ordiniSenzaElab.length > 0) {
                html += '<tr class="storico-elab-header" data-elab-id="none"><td colspan="7" style="background:var(--bg);padding:10px 8px;border-bottom:2px solid var(--text-muted);"><strong style="font-size:0.9rem;color:var(--text-muted);">Ordini senza elaborazione</strong></td></tr>';
                html += ordiniSenzaElab.map(o => _renderOrdineRow(o)).join('');
            }
            body.innerHTML = html;

            // Applica filtri correnti (collapse, categorie)
            _applicaFiltriStorico();
        } catch (err) {
            if (loading) loading.style.display = 'none';
            body.innerHTML = '<tr><td colspan="7" style="color:var(--danger); padding:12px;">Errore: ' + esc(err.message) + '</td></tr>';
        }
    }

    function initStorico() {
        const closeBtn = document.getElementById('modalStoricoClose');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            document.getElementById('modalStoricoOverlay').classList.remove('open');
        });

        const overlay = document.getElementById('modalStoricoOverlay');
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });

        const btnApri = document.getElementById('btnApriStorico');
        if (btnApri) btnApri.addEventListener('click', apriStorico);

        // Delegazione click sulla tabella storico
        const tbody = document.getElementById('storicoBody');
        if (tbody) tbody.addEventListener('click', async (e) => {
            const btnVis = e.target.closest('.btn-storico-visualizza');
            if (btnVis) {
                e.stopPropagation();
                await apriDettaglioOrdine(btnVis.dataset.anno, btnVis.dataset.serie, btnVis.dataset.numord);
                return;
            }
            const btnPdf = e.target.closest('.btn-storico-pdf');
            if (btnPdf) {
                e.stopPropagation();
                window.open(`${MrpApp.API_BASE}/ordine-pdf/${btnPdf.dataset.anno}/${btnPdf.dataset.serie}/${btnPdf.dataset.numord}`, '_blank');
                return;
            }
            const btnDetElab = e.target.closest('.btn-storico-dettaglio-elab');
            if (btnDetElab) {
                e.stopPropagation();
                await apriDettaglioElaborazione(parseInt(btnDetElab.dataset.elabId, 10));
                return;
            }
            // Click su testata elaborazione → collassa/espande
            const elabHeader = e.target.closest('.storico-elab-header');
            if (elabHeader && !e.target.closest('button')) {
                const eid = elabHeader.dataset.elabId;
                if (!eid) return;
                const toggle = elabHeader.querySelector('.storico-elab-toggle');
                if (_storicoFiltri.elabCollapsed.has(eid)) {
                    _storicoFiltri.elabCollapsed.delete(eid);
                    if (toggle) toggle.classList.remove('collapsed');
                } else {
                    _storicoFiltri.elabCollapsed.add(eid);
                    if (toggle) toggle.classList.add('collapsed');
                }
                _applicaFiltriStorico();
            }
        });
    }

    // ============================================================
    // DETTAGLIO ELABORAZIONE (modale con proposte raggruppate per fornitore)
    // ============================================================
    async function apriDettaglioElaborazione(elabId) {
        const overlay = document.getElementById('modalGenericOverlay');
        const elTitolo = document.getElementById('modalGenericTitolo');
        const elIcona = document.getElementById('modalGenericIcona');
        const elMsg = document.getElementById('modalGenericMessaggio');
        const elAzioni = document.getElementById('modalGenericAzioni');
        if (!overlay) return;

        elTitolo.textContent = 'Dettaglio Elaborazione';
        elIcona.textContent = '\uD83D\uDCCB';

        // Aggancia close sulla croce
        const closeBtn = document.getElementById('modalGenericClose');
        if (closeBtn) {
            const handler = () => { overlay.classList.remove('open'); closeBtn.removeEventListener('click', handler); };
            closeBtn.addEventListener('click', handler);
        }
        elMsg.innerHTML = '<div style="text-align:center;padding:24px;"><span style="animation:unifiedPulse 1.2s infinite;">Caricamento...</span></div>';
        elAzioni.innerHTML = '';
        overlay.classList.add('open');

        try {
            const res = await fetch(`${MrpApp.API_BASE}/elaborazione-dettaglio/${elabId}`, { credentials: 'include' });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            const e = data.elaborazione;
            const fornitori = data.fornitori || [];
            const fpDate = e.fingerprint ? new Date(e.fingerprint).toLocaleDateString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '';

            // Testata
            let html = '<div style="text-align:left;">';
            html += '<div style="margin-bottom:12px;padding:8px 12px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">';
            html += '<strong>Elaborazione MRP del ' + esc(fpDate) + '</strong><br>';
            html += '<span style="font-size:0.82rem;color:var(--text-muted);">';
            html += e.totaleProposte + ' proposte \u00B7 <strong>' + e.numOrdini + '</strong> ordini emessi \u00B7 ';
            html += e.totaleGestite + ' gestite \u00B7 ' + e.numIgnorate + ' ignorate';
            if (e.numModificate > 0) html += ' \u00B7 <span style="color:var(--warning);">' + e.numModificate + ' modificate</span>';
            html += '</span></div>';

            // Lista fornitori con proposte
            html += '<div style="max-height:450px;overflow-y:auto;">';
            for (const f of fornitori) {
                const gestiteF = f.proposte.filter(p => p.Gestita);
                const ignorateF = f.proposte.filter(p => !p.Gestita);
                const badge = gestiteF.length > 0
                    ? '<span style="font-size:0.7rem;background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:4px;">' + gestiteF.length + ' ordinate</span>'
                    : '<span style="font-size:0.7rem;background:#fee2e2;color:var(--danger);padding:1px 6px;border-radius:4px;">ignorate</span>';

                html += '<div style="margin-bottom:8px;border:1px solid var(--border);border-radius:6px;overflow:hidden;">';
                html += '<div style="padding:6px 10px;background:var(--bg);font-weight:600;font-size:0.85rem;display:flex;align-items:center;gap:6px;">';
                html += esc(f.nome) + ' <small style="color:var(--text-muted);">(' + f.codice + ')</small> ' + badge;
                html += '</div>';

                // Righe proposte
                html += '<table style="width:100%;font-size:0.78rem;border-collapse:collapse;">';
                for (const p of f.proposte) {
                    let statusIcon, rowBg;
                    if (p.Gestita && p.quantita_ordinata && p.ol_quant !== p.quantita_ordinata) {
                        statusIcon = '\u26A0\uFE0F'; // modificata
                        rowBg = '#fffbeb';
                    } else if (p.Gestita) {
                        statusIcon = '\u2705';
                        rowBg = '#f0fdf4';
                    } else {
                        statusIcon = '\u274C';
                        rowBg = '#fef2f2';
                    }

                    const dataCons = p.ol_datcons ? new Date(p.ol_datcons).toLocaleDateString('it-IT') : '';
                    const qta = Number(p.ol_quant || 0).toLocaleString('it-IT', { minimumFractionDigits: 0 });

                    html += '<tr style="background:' + rowBg + ';border-top:1px solid #f0f0f0;">';
                    html += '<td style="padding:4px 8px;width:24px;">' + statusIcon + '</td>';
                    html += '<td style="padding:4px 4px;font-family:monospace;">' + esc(p.ol_codart) + '</td>';
                    html += '<td style="padding:4px 4px;">' + esc(p.articolo_descr || '') + '</td>';
                    html += '<td style="padding:4px 4px;text-align:right;white-space:nowrap;">' + qta + ' ' + esc(p.ol_unmis || '') + '</td>';
                    html += '<td style="padding:4px 4px;text-align:center;">' + dataCons + '</td>';

                    if (p.Gestita && p.ord_numord) {
                        let ordInfo = '\u2192 <strong>' + p.ord_numord + '/' + esc(p.ord_serie || '') + '</strong>';
                        if (p.quantita_ordinata && p.ol_quant !== p.quantita_ordinata) {
                            const qtaOrd = Number(p.quantita_ordinata).toLocaleString('it-IT', { minimumFractionDigits: 0 });
                            ordInfo += ' <span style="color:var(--warning);font-size:0.72rem;">(ordinato: ' + qtaOrd + ')</span>';
                        }
                        const origBadge = p.origine === 'bcube' ? ' <span style="font-size:0.6rem;background:#dbeafe;color:#7c3aed;padding:0 4px;border-radius:3px;">BCube</span>' : '';
                        html += '<td style="padding:4px 8px;font-size:0.75rem;">' + ordInfo + origBadge + '</td>';
                    } else {
                        html += '<td style="padding:4px 8px;color:var(--text-muted);font-size:0.72rem;">non ordinata</td>';
                    }
                    html += '</tr>';
                }
                html += '</table></div>';
            }
            html += '</div></div>';

            elMsg.innerHTML = html;

            // Bottone chiudi
            const btnChiudi = document.createElement('button');
            btnChiudi.textContent = 'Chiudi';
            btnChiudi.className = 'mrp-btn mrp-btn-primary';
            btnChiudi.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnChiudi.addEventListener('click', () => overlay.classList.remove('open'));
            elAzioni.appendChild(btnChiudi);

        } catch (err) {
            elMsg.innerHTML = '<div style="color:var(--danger);padding:12px;">Errore: ' + esc(err.message) + '</div>';
            const btnChiudi = document.createElement('button');
            btnChiudi.textContent = 'Chiudi';
            btnChiudi.className = 'mrp-btn mrp-btn-primary';
            btnChiudi.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnChiudi.addEventListener('click', () => overlay.classList.remove('open'));
            elAzioni.appendChild(btnChiudi);
        }
    }

    // ============================================================
    // TEMPLATE EMAIL — dropdown per fornitore
    // ============================================================

    let _emailTemplates = [];
    let _templateAssegnazioni = new Map(); // fornitoreCode → templateId
    let _templateMode = 'ultima_scelta'; // 'predefiniti' | 'ultima_scelta'

    async function caricaTemplateEmail() {
        try {
            const [tplRes, assRes, cfgRes] = await Promise.all([
                fetch(`${MrpApp.API_BASE}/email-templates`, { credentials: 'include' }),
                fetch(`${MrpApp.API_BASE}/email-template-assegnazioni`, { credentials: 'include' }),
                fetch(`${MrpApp.API_BASE}/smtp/config`, { credentials: 'include' })
            ]);
            if (tplRes.ok) {
                const tplData = await tplRes.json();
                _emailTemplates = (tplData.templates || []).filter(t => t.isActive !== false && t.isActive !== 0);
            }
            if (assRes.ok) {
                const assData = await assRes.json();
                _templateAssegnazioni.clear();
                (assData.assegnazioni || []).forEach(a => {
                    _templateAssegnazioni.set(String(a.fornitoreCode), a.templateId);
                });
            }
            if (cfgRes.ok) {
                const cfgData = await cfgRes.json();
                _templateMode = (cfgData.config && cfgData.config.templateMode) || 'ultima_scelta';
            }
        } catch (err) {
            console.warn('[Templates] Errore caricamento template email:', err);
        }
    }

    function getTemplateIdPerFornitore(fornCode) {
        // 1. Assegnazione specifica
        if (_templateAssegnazioni.has(fornCode)) return _templateAssegnazioni.get(fornCode);
        // 2. Template predefinito dell'operatore
        const myDefault = _emailTemplates.find(t => t.isMine && t.isDefault);
        if (myDefault) return myDefault.id;
        // 3. Primo template sistema italiano
        const sistema = _emailTemplates.find(t => t.isSystem && t.lingua === 'it');
        if (sistema) return sistema.id;
        // 4. Qualsiasi template
        return _emailTemplates.length > 0 ? _emailTemplates[0].id : null;
    }

    async function onTemplateSelectChange(fornCode, templateId) {
        // In modalità 'ultima_scelta' → salva automaticamente l'assegnazione
        // In modalità 'predefiniti' → il dropdown cambia solo per questo invio, non salva
        if (_templateMode === 'ultima_scelta') {
            try {
                await fetch(`${MrpApp.API_BASE}/email-template-assegnazione/${fornCode}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ templateId })
                });
                _templateAssegnazioni.set(fornCode, templateId);
                // Also update the config tab select if visible
                const cfgSelect = document.querySelector(`#assegnFornitoriList .assegn-forn-select[data-forn="${fornCode}"]`);
                if (cfgSelect) cfgSelect.value = String(templateId);
            } catch (err) {
                console.warn('[Templates] Errore salvataggio assegnazione:', err);
            }
        }
        // In entrambe le modalità, il valore del select viene letto al momento dell'invio
    }

    function buildTemplateSelect(fornCode) {
        if (!_emailTemplates.length) return '';
        const selectedId = getTemplateIdPerFornitore(fornCode);
        const fk = String(fornCode);

        // Separa template generici da messaggi personalizzati per questo fornitore
        const generici = _emailTemplates.filter(t => !t.fornitoreCode);
        const personalizzati = _emailTemplates.filter(t => String(t.fornitoreCode) === fk);

        let html = '';
        if (personalizzati.length) {
            html += '<optgroup label="\u2605 Personalizzati">';
            personalizzati.forEach(t => {
                const sel = t.id === selectedId ? ' selected' : '';
                html += `<option value="${t.id}"${sel}>${esc(t.nome)}</option>`;
            });
            html += '</optgroup>';
        }
        html += '<optgroup label="Template">';
        generici.forEach(t => {
            const sel = t.id === selectedId ? ' selected' : '';
            const badge = t.isSystem ? ' [S]' : '';
            html += `<option value="${t.id}"${sel}>${esc(t.nome)}${badge}</option>`;
        });
        html += '</optgroup>';

        return `<select class="select-template-forn" data-forn="${escAttr(fornCode)}" title="Template email">${html}</select>`;
    }

    return { init, aggiornaStatoVisivo, apriStorico, apriDettaglioOrdine };
})();

document.addEventListener('DOMContentLoaded', MrpProposta.init);
