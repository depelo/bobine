/**
 * MRP Proposta Ordini — Gestione Lista Ordini (proposte fornitori / ordlist)
 */
const MrpProposta = (() => {
    let data = [];

    async function waitForDB(maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await fetch(`${MrpApp.API_BASE}/health`, { credentials: 'include' });
                const dataHealth = await res.json();
                if (dataHealth.status === 'ok') return;
            } catch (e) { /* ignore */ }
            await new Promise(r => setTimeout(r, 1000));
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
                ol_datcons: ordine.data_consegna,
                ol_colli: '0',
                ol_ump: '',
                ol_stato: '',
                fase_descr: ''
            };

            document.getElementById('paramCodart').value = ordine.ol_codart;
            if (typeof MrpParametri !== 'undefined' && MrpParametri.caricaFasi) {
                MrpParametri.caricaFasi(ordine.ol_codart);
            }
            setTimeout(() => document.getElementById('btnEsegui').click(), 100);
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

        // Salva il contesto della riga proposta prima di navigare ai progressivi
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
            ol_datcons: codartEl.dataset.datcons || '',
            ol_colli: codartEl.dataset.colli || '0',
            ol_ump: codartEl.dataset.ump || '',
            ol_stato: codartEl.dataset.stato || '',
            fase_descr: codartEl.dataset.fasedescr || ''
        };

        const codart = codartRaw.trim();
        document.getElementById('paramCodart').value = codart;

        try {
            const res = await fetch(`${MrpApp.API_BASE}/articoli/search?q=${encodeURIComponent(codart)}&field=codart`, { credentials: 'include' });
            const results = await res.json();
            if (res.ok && Array.isArray(results) && results.length > 0) {
                const art = results.find(r => String(r.ar_codart).trim() === codart) || results[0];
                document.getElementById('paramCodalt').value = art.ar_codalt || '';
                document.getElementById('paramDescr').value = art.ar_descr || '';
                MrpApp.state.articoloSelezionato = art;
                MrpApp.state.parametri.codart = art.ar_codart;
                await MrpParametri.caricaFasi(art.ar_codart);
            } else {
                document.getElementById('paramCodalt').value = '';
                document.getElementById('paramDescr').value = '';
                MrpApp.state.articoloSelezionato = null;
                MrpApp.state.parametri.codart = codart;
                await MrpParametri.caricaFasi(codart);
            }
        } catch (err) {
            console.error('[Proposta] ricerca articolo:', err);
            MrpApp.state.articoloSelezionato = null;
            MrpApp.state.parametri.codart = codart;
            try {
                await MrpParametri.caricaFasi(codart);
            } catch (_) { /* ignore */ }
        }

        document.getElementById('btnEsegui').click();
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
            const res = await fetch(`${MrpApp.API_BASE}/proposta-ordini`, { credentials: 'include' });
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

            // Popola ordiniEmessi dal server (righe già emesse persistite in ordini_emessi)
            ripristinaOrdiniEmessiDaServer(data);

            // Carica template email e assegnazioni (bloccante: servono prima del render)
            await caricaTemplateEmail();

            renderProposta(data, listEl, stats);
        } catch (err) {
            if (loading) loading.style.display = 'none';
            listEl.innerHTML = `<div class="proposta-loading" style="color:var(--danger)">Errore di connessione: ${esc(err.message)}</div>`;
        }
    }

    function renderProposta(righe, listEl, statsEl) {
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
                    totaleValore += (Number(r.ol_quant) || 0) * (Number(r.ol_prezzo) || 0);
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

        for (const [, forn] of fornitori) {
            const div = document.createElement('div');
            div.className = 'proposta-fornitore';

            let valoreFornitore = 0;
            let htmlArticoli = '';

            for (const [codart, rows] of forn.articoli) {
                const first = rows[0];
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
                    valoreFornitore += (Number(r.ol_quant) || 0) * (Number(r.ol_prezzo) || 0);

                    let stato, statoClass;
                    if (r.emesso) {
                        const emailIcon = r.email_inviata ? ' \u2709' : '';
                        stato = `Ordinato ${r.ord_numord || ''}/${r.ord_serie || 'F'}${emailIcon}`;
                        statoClass = 'proposta-stato-ordinato';
                    } else {
                        const statoRaw = (r.ol_stato || '').trim();
                        stato = statoRaw === '' ? 'Generato' : esc(statoRaw);
                        statoClass = '';
                    }

                    htmlRighe += `<tr class="${r.emesso ? 'proposta-riga-emessa' : ''}">
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
                    data-quant="${escAttr(String(first.ol_quant ?? '0'))}"
                    data-prezzo="${escAttr(String(first.ol_prezzo ?? '0'))}"
                    data-datcons="${escAttr(first.ol_datcons || '')}"
                    data-colli="${escAttr(String(first.ol_colli ?? '0'))}"
                    data-ump="${escAttr(first.ol_ump || '')}"
                    data-stato="${escAttr(first.ol_stato || '')}"
                    data-descr="${escAttr(first.ar_descr || '')}"
                    data-codalt="${escAttr(first.ar_codalt || '')}"
                    data-fasedescr="${escAttr(first.fase_descr || '')}"
                    title="Clicca per aprire i Progressivi">${esc(String(codart))}</span>
                        ${codaltStr}
                        <span class="proposta-art-descr">${esc(first.ar_descr)}</span>
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
        }

        // Ripristina gli stati visivi degli ordini già confermati
        aggiornaStatoVisivo();
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

        document.querySelectorAll('.proposta-articolo').forEach(artEl => {
            const codartEl = artEl.querySelector('.proposta-art-codart');
            if (!codartEl) return;

            const key = MrpApp.getKeyOrdine(
                codartEl.dataset.fornitore,
                codartEl.dataset.codart,
                codartEl.dataset.fase || '0',
                codartEl.dataset.magaz || '1'
            );
            const ordine = confermati.get(key);

            artEl.classList.remove('proposta-art-confermato', 'proposta-art-escluso');
            const oldBadge = artEl.querySelector('.proposta-conferma-badge');
            if (oldBadge) oldBadge.remove();

            if (ordine) {
                const badge = document.createElement('div');
                badge.className = 'proposta-conferma-badge';
                if (ordine.escluso) {
                    artEl.classList.add('proposta-art-escluso');
                    badge.classList.add('proposta-badge-escluso');
                    badge.innerHTML = '&#x2717; Escluso'
                        + ' <button class="btn-rimuovi-conferma" data-key="' + escAttr(key) + '" title="Rimuovi esclusione">&#128465;</button>';
                } else {
                    artEl.classList.add('proposta-art-confermato');
                    badge.classList.add('proposta-badge-confermato');
                    const dataFmt = ordine.data_consegna
                        ? new Date(ordine.data_consegna).toLocaleDateString('it-IT') : '';
                    const valore = ordine.quantita_confermata * ordine.prezzo;
                    badge.innerHTML =
                        '<span class="conferma-icon">&#x2713;</span> '
                        + '<strong>' + Number(ordine.quantita_confermata).toLocaleString('it-IT') + ' ' + esc(ordine.ol_unmis || 'PZ') + '</strong>'
                        + ' entro ' + esc(dataFmt)
                        + (valore > 0 ? ' &mdash; &euro; ' + valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
                        + ' <button class="btn-modifica-conferma" data-key="' + escAttr(key) + '" title="Modifica">&#9998;</button>'
                        + ' <button class="btn-rimuovi-conferma" data-key="' + escAttr(key) + '" title="Rimuovi conferma">&#128465;</button>';
                }
                artEl.appendChild(badge);
            }
        });

        aggiornaBarreFornitori();
    }

    function aggiornaBarreFornitori() {
        const confermati = MrpApp.state.ordiniConfermati;

        document.querySelectorAll('.proposta-fornitore').forEach(fornEl => {
            const header = fornEl.querySelector('.proposta-fornitore-header');
            const articoli = fornEl.querySelectorAll('.proposta-articolo');
            if (!header || articoli.length === 0) return;

            const fornCode = header.dataset.forn;
            let tuttiGestiti = true;
            let conteggioConfermati = 0;
            let conteggioEsclusi = 0;
            let totaleValore = 0;

            articoli.forEach(artEl => {
                const codartEl = artEl.querySelector('.proposta-art-codart');
                if (!codartEl) { tuttiGestiti = false; return; }
                const key = MrpApp.getKeyOrdine(
                    codartEl.dataset.fornitore,
                    codartEl.dataset.codart,
                    codartEl.dataset.fase || '0',
                    codartEl.dataset.magaz || '1'
                );
                const ordine = confermati.get(key);
                if (!ordine) {
                    tuttiGestiti = false;
                } else if (ordine.escluso) {
                    conteggioEsclusi++;
                } else {
                    conteggioConfermati++;
                    totaleValore += ordine.quantita_confermata * ordine.prezzo;
                }
            });

            header.classList.remove('fornitore-completato', 'fornitore-parziale', 'fornitore-emesso');

            let statoBadge = header.querySelector('.fornitore-stato-badge');
            if (!statoBadge) {
                statoBadge = document.createElement('span');
                statoBadge.className = 'fornitore-stato-badge';
                header.appendChild(statoBadge);
            }

            // Rimuovi vecchi pulsanti emetti
            const oldBtn = header.querySelector('.btn-emetti-ordine');
            if (oldBtn) oldBtn.remove();
            const oldEmesso = header.querySelector('.fornitore-emesso-badge');
            if (oldEmesso) oldEmesso.remove();

            // Controlla se ordine gia emesso
            const emesso = ordiniEmessi.get(fornCode);
            if (emesso) {
                header.classList.add('fornitore-emesso');
                statoBadge.style.display = 'none';
                const emessoBadge = document.createElement('span');
                emessoBadge.className = 'fornitore-emesso-badge';

                const emailIcon = emesso.email_inviata ? ' \u2709' : '';
                emessoBadge.innerHTML = '&#x1F4C4; Ordine ' + emesso.numord + '/' + emesso.serie + emailIcon;

                const btnPdf = document.createElement('button');
                btnPdf.className = 'btn-scarica-pdf-forn';
                btnPdf.textContent = '\u2B07 PDF';
                btnPdf.title = 'Scarica PDF ordine';
                btnPdf.addEventListener('click', (e) => { e.stopPropagation(); scaricaPdf(emesso); });
                emessoBadge.appendChild(btnPdf);

                // Dropdown template email
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
                    emessoBadge.appendChild(selectEl);
                }

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
                    const sel = header.querySelector('.select-template-forn');
                    const templateId = sel ? parseInt(sel.value, 10) : null;
                    inviaEmailOrdine(emesso, { template_id: templateId });
                });
                emessoBadge.appendChild(btnEmail);

                header.appendChild(emessoBadge);
                return;
            }

            const gestiti = conteggioConfermati + conteggioEsclusi;
            if (tuttiGestiti && gestiti > 0) {
                header.classList.add('fornitore-completato');
                statoBadge.textContent = '\u2713 ' + conteggioConfermati + ' art. \u2014 \u20ac '
                    + totaleValore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                statoBadge.style.display = '';

                // Aggiungi pulsante "Emetti Ordine"
                if (conteggioConfermati > 0) {
                    const btn = document.createElement('button');
                    btn.className = 'btn-emetti-ordine';
                    btn.textContent = 'Emetti Ordine \u2192';
                    btn.dataset.forn = fornCode;
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        apriModaleEmettiOrdine(fornCode);
                    });
                    header.appendChild(btn);
                }
            } else if (gestiti > 0) {
                header.classList.add('fornitore-parziale');
                statoBadge.textContent = gestiti + '/' + articoli.length + ' gestiti';
                statoBadge.style.display = '';
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

    // Cache PDF in memoria per la sessione (i PDF non sono nel DB, solo nel response dell'emissione)
    const pdfCache = new Map(); // key = fornitore_codice, value = { pdf_base64, pdf_filename }

    /**
     * Ripristina ordiniEmessi dalla risposta del server (righe con emesso=true).
     * Raggruppa per fornitore: se TUTTE le righe di un fornitore sono emesse,
     * marca il fornitore come emesso nella Map.
     * Questa è l'unica fonte di verità per lo stato "emesso".
     */
    function ripristinaOrdiniEmessiDaServer(righe) {
        // Svuota la Map — verrà ripopolata interamente dal server
        ordiniEmessi.clear();

        // Raggruppa righe per fornitore
        const fornitori = new Map();
        for (const r of righe) {
            const fk = String(r.fornitore_codice);
            if (!fornitori.has(fk)) fornitori.set(fk, { righe: [], nome: r.fornitore_nome || '' });
            fornitori.get(fk).righe.push(r);
        }

        for (const [fk, info] of fornitori) {
            const tutteEmesse = info.righe.every(r => r.emesso === true);
            if (tutteEmesse && info.righe.length > 0) {
                const primo = info.righe[0];
                const cached = pdfCache.get(fk) || {};
                ordiniEmessi.set(fk, {
                    anno: primo.ord_anno,
                    serie: primo.ord_serie,
                    numord: primo.ord_numord,
                    pdf_base64: cached.pdf_base64 || null,
                    pdf_filename: cached.pdf_filename || null,
                    email: '', // il pulsante email appare sempre, il server verificherà
                    email_inviata: !!primo.email_inviata,
                    email_inviata_il: primo.email_inviata_il || null,
                    fornitore_nome: info.nome,
                    fornitore_codice: fk,
                    fornitore_email: info.righe[0].fornitore_email || ''
                });
            }
        }
    }

    // ============================================================
    // BARRA GLOBALE "EMETTI TUTTI"
    // ============================================================
    function aggiornaBarraEmettiTutti() {
        const listEl = document.getElementById('propostaList');
        if (!listEl) return;

        let barraEl = document.getElementById('barraEmettiTutti');
        const completati = document.querySelectorAll('.proposta-fornitore-header.fornitore-completato');

        // Conta fornitori pronti (completati e non ancora emessi)
        let fornitoriPronti = 0;
        completati.forEach(h => {
            const fc = h.dataset.forn;
            if (!ordiniEmessi.has(fc)) fornitoriPronti++;
        });

        // Conta email pendenti (emessi ma email non ancora inviata)
        let emailPendenti = 0;
        ordiniEmessi.forEach(emesso => {
            if (!emesso.email_inviata) emailPendenti++;
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
        if (fornitoriPronti > 0) {
            bottoni += `<button type="button" class="btn-emetti-tutti" id="btnEmettiTutti">&#x1F4E8; Emetti Tutti</button>`;
        }
        if (emailPendenti > 0) {
            bottoni += `<button type="button" class="btn-invia-tutte-email" id="btnInviaTutteEmail">\u2709\uFE0F Invia Tutte le Email</button>`;
        }

        barraEl.style.display = 'flex';
        barraEl.innerHTML = `
            <div class="emetti-tutti-info">${infoParts.join(' \u00B7 ')}</div>
            <div class="emetti-tutti-azioni">${bottoni}</div>
        `;

        const btnEmetti = document.getElementById('btnEmettiTutti');
        if (btnEmetti) btnEmetti.addEventListener('click', emettiTuttiHandler);
        const btnEmail = document.getElementById('btnInviaTutteEmail');
        if (btnEmail) btnEmail.addEventListener('click', inviaTutteEmailHandler);
    }

    // ============================================================
    // MODALE GENERICA (sostituisce alert/confirm)
    // ============================================================
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
            'La stored procedure necessaria non è ancora presente nel database MRP.<br><br>' +
            'Verrà installata automaticamente (operazione da eseguire una sola volta).',
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
    async function apriModaleEmettiOrdine(fornitore_codice) {
        if (!await assicuraSPEsiste()) return;
        const confermati = MrpApp.state.ordiniConfermati;
        const articoliFornitore = [];
        let fornitore_nome = '';

        confermati.forEach((ordine, key) => {
            if (String(ordine.fornitore_codice) === String(fornitore_codice) && !ordine.escluso) {
                articoliFornitore.push(ordine);
                if (!fornitore_nome) fornitore_nome = ordine.fornitore_nome || '';
            }
        });

        if (articoliFornitore.length === 0) return;

        // Check duplicati pre-emissione
        if (MrpApp.state.elaborazioneId) {
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

        const totale = articoliFornitore.reduce((s, a) => s + a.quantita_confermata * a.prezzo, 0);

        const riepilogoEl = document.getElementById('emettiRiepilogo');
        riepilogoEl.innerHTML = `
            <div class="emetti-riepilogo-fornitore">${esc(fornitore_nome)} (${esc(String(fornitore_codice))})</div>
            <table class="emetti-riepilogo-table">
                <thead><tr><th>Cod. Articolo</th><th>Descrizione</th><th class="num">Qt\u00e0</th><th>UM</th><th class="num">Prezzo</th><th class="num">Valore</th><th>Data Cons.</th></tr></thead>
                <tbody>
                ${articoliFornitore.map(a => `<tr>
                    <td>${esc(a.ol_codart)}</td>
                    <td>${esc(a.ar_descr || '')}</td>
                    <td class="num">${Number(a.quantita_confermata).toLocaleString('it-IT')}</td>
                    <td>${esc(a.ol_unmis || 'PZ')}</td>
                    <td class="num">${Number(a.prezzo).toLocaleString('it-IT', { minimumFractionDigits: 4 })}</td>
                    <td class="num">\u20ac ${(a.quantita_confermata * a.prezzo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${a.data_consegna ? new Date(a.data_consegna).toLocaleDateString('it-IT') : ''}</td>
                </tr>`).join('')}
                </tbody>
            </table>
            <div class="emetti-riepilogo-totale">Totale ordine: \u20ac ${totale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        `;

        const overlay = document.getElementById('modalEmettiOverlay');
        overlay.classList.add('open');

        // Listeners
        document.getElementById('btnEmettiAnnulla').onclick = () => overlay.classList.remove('open');
        document.getElementById('modalEmettiClose').onclick = () => overlay.classList.remove('open');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('open'); };

        document.getElementById('btnEmettiConferma').onclick = () => {
            overlay.classList.remove('open');
            eseguiEmissioneOrdine(fornitore_codice, articoliFornitore, fornitore_nome);
        };
    }

    // ============================================================
    // ESEGUI EMISSIONE (chiama API)
    // ============================================================
    async function eseguiEmissioneOrdine(fornitore_codice, articoliFornitore, fornitore_nome) {
        const body = {
            fornitore_codice: parseInt(fornitore_codice, 10),
            elaborazione_id: MrpApp.state.elaborazioneId || '',
            articoli: articoliFornitore.map(a => ({
                codart: a.ol_codart,
                fase: parseInt(a.ol_fase, 10) || 0,
                magaz: parseInt(a.ol_magaz, 10) || 1,
                quantita: a.quantita_confermata,
                data_consegna: a.data_consegna,
                prezzo: a.prezzo,
                unmis: a.ol_unmis || 'PZ',
                ol_progr: parseInt(a.ol_progr, 10) || 0
            }))
        };

        const data = await chiamaConAutoDeploySP(`${MrpApp.API_BASE}/emetti-ordine`, body);

        if (data.success) {
            // Salva PDF in memoria per download immediato (non disponibile dal server dopo)
            pdfCache.set(String(fornitore_codice), {
                pdf_base64: data.pdf_base64,
                pdf_filename: data.pdf_filename
            });

            // Ricarica proposta dal DB — l'UI riflette lo stato reale
            await caricaProposta();

            mostraRisultatoEmissione(data, fornitore_nome);
        } else {
            await modale('error', 'Errore Emissione', `Impossibile emettere l'ordine per <strong>${esc(fornitore_nome)}</strong>.<br><br><code>${esc(data.error || 'Errore sconosciuto')}</code>`);
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
        if (emesso.pdf_base64) {
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

            // 3) Avviso banca mancante per rimessa diretta
            if (prevData.warning_banca) {
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
                // Aggiorna stato email nella Map ordiniEmessi e nel DOM
                const fk = String(emesso.fornitore_codice || emesso.ol_conto || '');
                if (fk && ordiniEmessi.has(fk)) {
                    const entry = ordiniEmessi.get(fk);
                    entry.email_inviata = true;
                    entry.email_inviata_il = new Date().toISOString();
                }
                // Aggiorna bottone email nel DOM (da "Invia" a "Re-invia")
                document.querySelectorAll('.btn-invia-email-forn').forEach(btn => {
                    const header = btn.closest('.proposta-fornitore-header');
                    if (header && header.dataset.forn === fk) {
                        btn.textContent = '\u2709 Re-invia Email';
                        btn.classList.remove('email-non-inviata');
                        btn.classList.add('email-gia-inviata');
                    }
                });
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
        ordiniEmessi.forEach((emesso, fk) => {
            if (!emesso.email_inviata) {
                pendenti.push({ ...emesso, fornitore_codice: fk });
            }
        });
        if (pendenti.length === 0) return;

        _batchCustomOverrides.clear();

        // Mostra modale riepilogativa con tabella interattiva
        const risultato = await modaleBatchEmail(pendenti);
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
    async function modaleBatchEmail(pendenti) {
        // Carica bozze salvate dal DB per pre-popolare overrides e badge
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

        return new Promise(resolve => {
            const overlay = document.getElementById('modalGenericOverlay');
            const elTitolo = document.getElementById('modalGenericTitolo');
            const elIcona = document.getElementById('modalGenericIcona');
            const elMsg = document.getElementById('modalGenericMessaggio');
            const elAzioni = document.getElementById('modalGenericAzioni');
            if (!overlay) { resolve(null); return; }

            // Genera options HTML con optgroup per fornitore
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

                const selHtml = '<select class="batch-tpl-sel" data-forn="' + escAttr(fk) + '" style="font-size:0.76rem;padding:2px 6px;border:1px solid var(--border);border-radius:4px;max-width:150px;">' +
                    buildBatchOptions(fk, selectedTid) + '</select>';

                return '<tr data-forn="' + escAttr(fk) + '">' +
                    '<td style="text-align:center;"><input type="checkbox" class="batch-chk" data-forn="' + escAttr(fk) + '" checked style="accent-color:var(--primary);" /></td>' +
                    '<td><strong>' + esc(p.numord + '/' + p.serie) + '</strong></td>' +
                    '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escAttr(p.fornitore_nome || '') + '">' + esc(p.fornitore_nome || fk) + '</td>' +
                    '<td style="font-size:0.73rem;color:' + (email ? 'var(--text-muted)' : 'var(--danger)') + ';max-width:160px;overflow:hidden;text-overflow:ellipsis;" title="' + escAttr(email) + '">' + (email ? esc(email) : '<em>mancante</em>') + '</td>' +
                    '<td>' + selHtml + '</td>' +
                    '<td style="text-align:center;white-space:nowrap;">' +
                        '<button class="batch-edit-btn" data-forn="' + escAttr(fk) + '" style="font-size:0.72rem;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:white;cursor:pointer;" title="Modifica manuale">\u270E</button>' +
                        '<span class="batch-edit-badge" data-forn="' + escAttr(fk) + '" style="display:' + ((_batchCustomOverrides.has(fk) || _emailTemplates.some(t => String(t.id) === selectedTid && t.fornitoreCode)) ? 'inline' : 'none') + ';font-size:0.66rem;background:#dbeafe;color:var(--primary);padding:1px 6px;border-radius:8px;margin-left:3px;font-weight:600;">Personalizzato</span>' +
                    '</td>' +
                    '<td id="batchSt_' + escAttr(fk) + '" style="text-align:center;width:28px;"></td>' +
                    '</tr>';
            }).join('');

            elTitolo.textContent = 'Invia Tutte le Email';
            elIcona.textContent = '\u2709';
            elMsg.innerHTML =
                '<div style="text-align:left;">' +
                    '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;"><strong>' + pendenti.length + '</strong> email pronte. Seleziona, personalizza e invia.</div>' +
                    '<div style="max-height:380px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
                        '<table class="emetti-riepilogo-table" style="width:100%;margin:0;">' +
                            '<thead><tr>' +
                                '<th style="width:28px;text-align:center;"><input type="checkbox" id="batchChkAll" checked style="accent-color:var(--primary);" /></th>' +
                                '<th>Ordine</th><th>Fornitore</th><th>Email</th><th>Template</th><th style="text-align:center;">Azioni</th><th style="width:28px;"></th>' +
                            '</tr></thead>' +
                            '<tbody>' + righeHtml + '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>';

            elAzioni.innerHTML = '';

            // --- Checkbox "seleziona tutto" ---
            const chkAll = document.getElementById('batchChkAll');
            if (chkAll) chkAll.addEventListener('change', () => {
                document.querySelectorAll('.batch-chk').forEach(cb => { cb.checked = chkAll.checked; });
                aggiornaContoBatch();
            });
            document.querySelectorAll('.batch-chk').forEach(cb => cb.addEventListener('change', aggiornaContoBatch));

            // --- Cambio template: aggiorna badge personalizzato ---
            document.querySelectorAll('.batch-tpl-sel').forEach(sel => {
                sel.addEventListener('change', () => {
                    const fk = sel.dataset.forn;
                    const badge = document.querySelector('.batch-edit-badge[data-forn="' + fk + '"]');
                    // Rimuove bozza se presente
                    if (_batchCustomOverrides.has(fk)) {
                        _batchCustomOverrides.delete(fk);
                    }
                    // Mostra badge se è un messaggio personalizzato (ha fornitoreCode)
                    const tid = parseInt(sel.value, 10);
                    const tpl = _emailTemplates.find(t => t.id === tid);
                    if (badge) {
                        badge.style.display = (tpl && tpl.fornitoreCode) ? 'inline' : 'none';
                    }
                });
            });

            // --- Bottoni modifica manuale ---
            document.querySelectorAll('.batch-edit-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fk = btn.dataset.forn;
                    const emesso = pendenti.find(p => String(p.fornitore_codice) === fk);
                    if (!emesso) return;

                    const tplSel = document.querySelector('.batch-tpl-sel[data-forn="' + fk + '"]');
                    const tid = tplSel ? parseInt(tplSel.value, 10) : null;

                    // Feedback visivo: loading
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

                        if (prevData.error) {
                            alert('Errore: ' + prevData.error);
                            return;
                        }

                        const esistente = _batchCustomOverrides.get(fk);
                        // Si apre su modalAnteprimaOverlay (z-index 1150), sopra il batch (z-index 1100)
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
                            if (badge) {
                                badge.style.display = 'inline';
                                badge.title = risultato.oggetto.substring(0, 60);
                            }
                            // Salva bozza nel DB per persistenza
                            try {
                                await fetch(`${MrpApp.API_BASE}/email-drafts`, {
                                    credentials: 'include', method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ anno: emesso.anno, serie: emesso.serie, numord: emesso.numord, oggetto: risultato.oggetto, corpo: risultato.corpo })
                                });
                            } catch (_) { /* best-effort */ }
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
            contoSpan.textContent = pendenti.length + ' selezionate';

            function aggiornaContoBatch() {
                const n = document.querySelectorAll('.batch-chk:checked').length;
                contoSpan.textContent = n + ' selezionate';
                btnInvia.disabled = n === 0;
                btnInvia.style.opacity = n === 0 ? '0.5' : '1';
            }

            function cleanup(result) {
                overlay.classList.remove('open');
                resolve(result);
            }

            const btnAnnulla = document.createElement('button');
            btnAnnulla.textContent = 'Annulla';
            btnAnnulla.className = 'mrp-btn mrp-btn-secondary';
            btnAnnulla.style.cssText = 'padding:8px 20px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnAnnulla.addEventListener('click', () => cleanup(null));

            const btnInvia = document.createElement('button');
            btnInvia.textContent = '\u2709 Invia Selezionate';
            btnInvia.className = 'mrp-btn mrp-btn-primary';
            btnInvia.style.cssText = 'padding:8px 20px;border-radius:6px;border:none;background:var(--primary);color:white;cursor:pointer;font-weight:600;font-size:0.85rem;';
            btnInvia.addEventListener('click', () => {
                const righeSelezionate = [];
                document.querySelectorAll('.batch-chk:checked').forEach(cb => {
                    const fk = cb.dataset.forn;
                    const emesso = pendenti.find(p => String(p.fornitore_codice) === fk);
                    if (!emesso) return;
                    const tplSel = document.querySelector('.batch-tpl-sel[data-forn="' + fk + '"]');
                    const tid = tplSel ? parseInt(tplSel.value, 10) : null;
                    righeSelezionate.push({ ...emesso, templateId: tid });
                });
                // Disabilita tutto
                document.querySelectorAll('.batch-chk,.batch-tpl-sel,.batch-edit-btn,#batchChkAll').forEach(el => el.disabled = true);
                btnInvia.disabled = true; btnInvia.style.opacity = '0.5'; btnInvia.textContent = 'Invio in corso...';
                btnAnnulla.disabled = true; btnAnnulla.style.opacity = '0.5';
                resolve({ righeSelezionate });
            });

            elAzioni.appendChild(contoSpan);
            elAzioni.appendChild(btnAnnulla);
            elAzioni.appendChild(btnInvia);
            overlay.classList.add('open');

            const closeBtn = document.getElementById('modalGenericClose');
            const closeHandler = () => { cleanup(null); closeBtn.removeEventListener('click', closeHandler); };
            closeBtn.addEventListener('click', closeHandler);
        });
    }

    // ============================================================
    // EMETTI TUTTI (batch)
    // ============================================================
    async function emettiTuttiHandler() {
        if (!await assicuraSPEsiste()) return;

        const completati = document.querySelectorAll('.proposta-fornitore-header.fornitore-completato');
        const fornitori = [];

        completati.forEach(h => {
            const fc = h.dataset.forn;
            if (ordiniEmessi.has(fc)) return; // gia emesso
            const articoliFornitore = [];
            const confermati = MrpApp.state.ordiniConfermati;
            confermati.forEach((ordine, key) => {
                if (String(ordine.fornitore_codice) === String(fc) && !ordine.escluso) {
                    articoliFornitore.push(ordine);
                }
            });
            if (articoliFornitore.length > 0) {
                fornitori.push({ fornitore_codice: fc, articoli: articoliFornitore, nome: articoliFornitore[0].fornitore_nome || fc });
            }
        });

        if (fornitori.length === 0) return;

        const conferma = await modale('question', 'Conferma Emissione Batch',
            `Stai per emettere <strong>${fornitori.length} ordini</strong> per i seguenti fornitori:<br><br>`
            + fornitori.map(f => `\u2022 ${esc(f.nome)}`).join('<br>')
            + '<br><br>Procedere?',
            [
                { label: 'Emetti Tutti', value: true, style: 'success' },
                { label: 'Annulla', value: false, style: 'secondary' }
            ]);

        if (!conferma) return;

        // Apri modale progresso
        const overlay = document.getElementById('modalBatchOverlay');
        const progressBar = document.getElementById('batchProgressBar');
        const progressLabel = document.getElementById('batchProgressLabel');
        const logEl = document.getElementById('batchLog');
        const risultatoEl = document.getElementById('batchRisultato');
        const btnChiudi = document.getElementById('btnBatchChiudi');

        progressBar.style.width = '0%';
        logEl.innerHTML = '';
        risultatoEl.style.display = 'none';
        btnChiudi.style.display = 'none';
        overlay.classList.add('open');

        let successi = 0, falliti = 0;

        for (let i = 0; i < fornitori.length; i++) {
            const f = fornitori[i];
            const perc = Math.round(((i + 1) / fornitori.length) * 100);
            progressLabel.textContent = `${i + 1}/${fornitori.length} \u2014 ${f.nome}`;
            progressBar.style.width = perc + '%';

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
                    unmis: a.ol_unmis || 'PZ',
                    ol_progr: parseInt(a.ol_progr, 10) || 0
                }))
            };

            const data = await chiamaConAutoDeploySP(`${MrpApp.API_BASE}/emetti-ordine`, body);

            if (data.success) {
                successi++;
                // Salva PDF in cache per download immediato
                pdfCache.set(String(f.fornitore_codice), {
                    pdf_base64: data.pdf_base64,
                    pdf_filename: data.pdf_filename
                });
                logEl.innerHTML += `<div style="color:var(--success);">\u2713 ${esc(f.nome)} \u2014 Ordine ${data.ordine.numord}/${data.ordine.serie}</div>`;
            } else {
                falliti++;
                logEl.innerHTML += `<div style="color:var(--danger);">\u2717 ${esc(f.nome)} \u2014 ${esc(data.error || 'Errore')}</div>`;
            }

            logEl.scrollTop = logEl.scrollHeight;
        }

        // Ricarica proposta dal DB — l'UI riflette lo stato reale
        await caricaProposta();

        progressLabel.textContent = 'Completato';
        progressBar.style.width = '100%';
        risultatoEl.style.display = 'block';
        risultatoEl.innerHTML = `
            <div style="text-align:center; margin-top:12px; font-size:0.95rem;">
                <strong style="color:var(--success);">${successi} emess${successi > 1 ? 'i' : 'o'}</strong>
                ${falliti > 0 ? ` &mdash; <strong style="color:var(--danger);">${falliti} fallit${falliti > 1 ? 'i' : 'o'}</strong>` : ''}
            </div>
        `;
        btnChiudi.style.display = '';
        btnChiudi.onclick = () => overlay.classList.remove('open');
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
                pdfCache.set(String(data.ordine.fornitore_codice), {
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
        // Applica filtro checkbox corrente (solo se elaborazione è un ID server, non timestamp client)
        const chk = document.getElementById('storicoFiltroElab');
        const filtri = {};
        const elab = MrpApp.state.elaborazione;
        if (chk && chk.checked && elab && elab.id) {
            filtri.elaborazione_id = String(elab.id);
        }
        await caricaStorico(filtri);
    }

    async function caricaStorico(filtri = {}) {
        const body = document.getElementById('storicoBody');
        const loading = document.getElementById('storicoLoading');
        if (!body) return;

        if (loading) loading.style.display = '';
        body.innerHTML = '';

        try {
            const params = new URLSearchParams();
            if (filtri.elaborazione_id) params.set('elaborazione_id', filtri.elaborazione_id);
            if (filtri.fornitore) params.set('fornitore', filtri.fornitore);
            if (filtri.da) params.set('da', filtri.da);
            if (filtri.a) params.set('a', filtri.a);

            const res = await fetch(`${MrpApp.API_BASE}/storico-ordini?${params}`, { credentials: 'include' });
            const data = await res.json();
            if (loading) loading.style.display = 'none';

            if (!data.ordini || data.ordini.length === 0) {
                body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Nessun ordine emesso</td></tr>';
                return;
            }

            body.innerHTML = data.ordini.map(o => {
                const dataStr = o.data_emissione ? new Date(o.data_emissione).toLocaleDateString('it-IT', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : '';
                const totale = Number(o.totale_documento || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const emailIcon = o.email_inviata
                    ? '<span class="storico-email-ok" title="Email inviata">\u2714</span>'
                    : '<span class="storico-email-no" title="Email non inviata">\u2716</span>';

                return `<tr>
                    <td>${dataStr}</td>
                    <td><strong>${o.ord_numord}/${o.ord_serie}</strong></td>
                    <td>${esc(o.fornitore_nome || '')} <small>(${o.fornitore_codice})</small></td>
                    <td class="num">${o.num_righe}</td>
                    <td class="num">\u20ac ${totale}</td>
                    <td class="center">${emailIcon}</td>
                    <td>
                        <button class="btn-storico-visualizza" data-anno="${o.ord_anno}" data-serie="${escAttr(o.ord_serie)}" data-numord="${o.ord_numord}" title="Visualizza ordine">\uD83D\uDD0D</button>
                        <button class="btn-storico-pdf" data-anno="${o.ord_anno}" data-serie="${escAttr(o.ord_serie)}" data-numord="${o.ord_numord}" title="Scarica PDF">\u2B07</button>
                    </td>
                </tr>`;
            }).join('');
        } catch (err) {
            if (loading) loading.style.display = 'none';
            body.innerHTML = `<tr><td colspan="7" style="color:var(--danger); padding:12px;">Errore: ${esc(err.message)}</td></tr>`;
        }
    }

    function initStorico() {
        // Close button
        const closeBtn = document.getElementById('modalStoricoClose');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            document.getElementById('modalStoricoOverlay').classList.remove('open');
        });

        // Click su overlay
        const overlay = document.getElementById('modalStoricoOverlay');
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });

        // Bottone apri storico
        const btnApri = document.getElementById('btnApriStorico');
        if (btnApri) btnApri.addEventListener('click', apriStorico);

        // Filtro solo elaborazione corrente
        const chkElab = document.getElementById('storicoFiltroElab');
        if (chkElab) chkElab.addEventListener('change', () => {
            const filtri = {};
            if (chkElab.checked && MrpApp.state.elaborazioneId) {
                filtri.elaborazione_id = MrpApp.state.elaborazioneId;
            }
            caricaStorico(filtri);
        });

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
                // Scarica PDF via endpoint diretto
                window.open(`${MrpApp.API_BASE}/ordine-pdf/${btnPdf.dataset.anno}/${btnPdf.dataset.serie}/${btnPdf.dataset.numord}`, '_blank');
            }
        });
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
