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

            if (!Array.isArray(payload) || !payload.length) {
                listEl.innerHTML = '<div class="proposta-loading">Nessuna proposta ordine presente</div>';
                return;
            }

            data = payload;
            // Genera un ID elaborazione unico per questa sessione di proposta
            MrpApp.state.elaborazioneId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

            // Popola ordiniEmessi dal server (righe già emesse persistite in ordini_emessi)
            ripristinaOrdiniEmessiDaServer(data);

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
            statsEl.innerHTML = `
                <div class="proposta-stat-item">Fornitori: <span class="proposta-stat-value">${fornitori.size}</span></div>
                <div class="proposta-stat-item">Articoli: <span class="proposta-stat-value">${totArticoli}</span></div>
                <div class="proposta-stat-item">Righe: <span class="proposta-stat-value">${righe.length}</span></div>
                <div class="proposta-stat-item">Valore totale: <span class="proposta-stat-value">€ ${fmtNum(totaleValore, 2)}</span></div>
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
                        stato = `Ordinato ${r.ord_numord || ''}/${r.ord_serie || 'F'}`;
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

                htmlArticoli += `
                <div class="proposta-articolo">
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

            div.innerHTML = `
                <div class="proposta-fornitore-header" data-forn="${escAttr(forn.codice)}">
                    <span>${fornLabel}</span>
                    <span class="forn-toggle">▼</span>
                </div>
                <div class="proposta-fornitore-body">
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
                emessoBadge.innerHTML = '&#x1F4C4; Ordine ' + emesso.numord + '/' + emesso.serie;

                const btnPdf = document.createElement('button');
                btnPdf.className = 'btn-scarica-pdf-forn';
                btnPdf.textContent = '\u2B07 PDF';
                btnPdf.title = 'Scarica PDF ordine';
                btnPdf.addEventListener('click', (e) => { e.stopPropagation(); scaricaPdf(emesso); });
                emessoBadge.appendChild(btnPdf);

                const btnEmail = document.createElement('button');
                btnEmail.className = 'btn-invia-email-forn';
                btnEmail.textContent = '\u2709 Invia Email';
                btnEmail.addEventListener('click', (e) => { e.stopPropagation(); inviaEmailOrdine(emesso); });
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
                    fornitore_nome: info.nome,
                    fornitore_codice: fk
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

        if (fornitoriPronti === 0) {
            if (barraEl) barraEl.style.display = 'none';
            return;
        }

        if (!barraEl) {
            barraEl = document.createElement('div');
            barraEl.id = 'barraEmettiTutti';
            barraEl.className = 'proposta-emetti-tutti-bar';
            listEl.parentNode.insertBefore(barraEl, listEl);
        }

        barraEl.style.display = 'flex';
        barraEl.innerHTML = `
            <div class="emetti-tutti-info">
                <span class="emetti-count">${fornitoriPronti}</span> fornitore${fornitoriPronti > 1 ? 'i' : ''} pronto${fornitoriPronti > 1 ? 'i' : ''} per l'emissione
            </div>
            <button type="button" class="btn-emetti-tutti" id="btnEmettiTutti">
                &#x1F4E8; Emetti Tutti gli Ordini
            </button>
        `;

        document.getElementById('btnEmettiTutti').addEventListener('click', emettiTuttiHandler);
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
    async function inviaEmailOrdine(emesso) {
        const body = {
            anno: emesso.anno,
            serie: emesso.serie,
            numord: emesso.numord,
            pdf_base64: emesso.pdf_base64 || null,
            pdf_filename: emesso.pdf_filename || null
        };

        try {
            const resp = await fetch(`${MrpApp.API_BASE}/invia-ordine-email`, { credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await resp.json();

            if (data.error === 'SMTP_NOT_CONFIGURED') {
                await modale('warning', 'SMTP Non Configurato',
                    'Per inviare email \u00e8 necessario configurare un profilo SMTP nelle impostazioni.',
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return;
            }

            if (data.error === 'EMAIL_MISSING') {
                await modale('warning', 'Email Mancante',
                    `Il fornitore <strong>${esc(emesso.fornitore_nome || '')}</strong> non ha un indirizzo email configurato in anagrafica.`,
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return;
            }

            if (data.error === 'EMAIL_PROVA_MISSING') {
                await modale('warning', 'Email di Prova Non Configurata',
                    'Sei in ambiente di prova ma il campo <strong>Email di prova</strong> non \u00e8 compilato nel profilo DB.<br><br>Configuralo nella sezione connessione database.',
                    [{ label: 'OK', value: true, style: 'primary' }]);
                return;
            }

            if (data.success) {
                if (data.ambiente === 'prova') {
                    await modale('success', 'Email Inviata (PROVA)',
                        `<div style="background:#fff3cd; padding:10px 14px; border-radius:6px; margin-bottom:12px; font-size:0.85rem;">
                            \u26A0\uFE0F Le email sono state <strong>dirottate</strong> all'indirizzo di prova.
                        </div>
                        <table class="emetti-riepilogo-table" style="width:100%; font-size:0.82rem;">
                            <thead><tr>
                                <th style="text-align:left;">Ordine</th>
                                <th style="text-align:left;">Fornitore</th>
                                <th style="text-align:left;">Email reale (non inviata)</th>
                                <th style="text-align:left;">Inviata a (prova)</th>
                            </tr></thead>
                            <tbody><tr>
                                <td><strong>${emesso.numord}/${emesso.serie}</strong></td>
                                <td>${esc(emesso.fornitore_nome || '')}</td>
                                <td style="color:var(--text-muted); text-decoration:line-through;">${esc(data.email_reale || '')}</td>
                                <td style="color:var(--success); font-weight:600;">${esc(data.email_prova || '')}</td>
                            </tr></tbody>
                        </table>`);
                } else {
                    await modale('success', 'Email Inviata',
                        `Ordine <strong>${emesso.numord}/${emesso.serie}</strong> inviato con successo a:<br><br><strong>${esc(data.destinatari.join(', '))}</strong>`);
                }
            } else {
                await modale('error', 'Errore Invio Email',
                    `Impossibile inviare l'email.<br><br><code>${esc(data.error || 'Errore sconosciuto')}</code>`);
            }
        } catch (err) {
            await modale('error', 'Errore di Rete', `Errore nella comunicazione con il server:<br><br><code>${esc(err.message)}</code>`);
        }
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

    return { init, aggiornaStatoVisivo };
})();

document.addEventListener('DOMContentLoaded', MrpProposta.init);
