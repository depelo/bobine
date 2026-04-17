/**
 * MRP Parametri — Maschera selezione articolo (frmParRMP)
 *
 * 2 combo (codart, codalt):
 * - codart: cerca per CODICE (LIKE 'q%') E per DESCRIZIONE (LIKE '%q%').
 *   Match codice prioritari nell'ordinamento. La descrizione e' visibile
 *   nei suggerimenti del dropdown.
 * - codalt: cerca per codice alternativo (LIKE '%q%').
 * Selezione (click o Enter) → popola entrambi i campi + carica le fasi.
 * Enter senza click: accetta il primo suggerimento e lancia direttamente Esegui.
 * Il bottone Esegui lancia la vista progressivi.
 */
const MrpParametri = (() => {
    let debounceTimer = null;

    function init() {
        // Solo 2 combo: codart (cerca anche per descrizione) + codalt
        setupCombo('paramCodart', 'paramCodartDropdown', 'codart');
        setupCombo('paramCodalt', 'paramCodaltDropdown', 'codalt');

        document.getElementById('btnEsegui').addEventListener('click', () => {
            // Se siamo gia nella vista progressivi (drawer aperto sopra),
            // la nuova ricerca CONTINUA la catena breadcrumb
            const chained = (MrpApp.state.viewActive === 'progressivi');
            esegui({ chained });
        });

        // Chiudi dropdown quando si clicca fuori
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.mrp-field-input')) {
                document.querySelectorAll('.mrp-dropdown').forEach(d => d.classList.remove('open'));
            }
        });
    }

    function setupCombo(inputId, dropdownId, field) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const q = input.value.trim();
                if (q.length < 2) { dropdown.classList.remove('open'); return; }
                searchArticoli(q, field, dropdown);
            }, 250);
        });

        input.addEventListener('focus', () => {
            const q = input.value.trim();
            if (q.length >= 2) {
                searchArticoli(q, field, dropdown);
            }
        });

        // Navigazione tastiera nel dropdown:
        //   ArrowDown / ArrowUp → scorre i suggerimenti, evidenzia con .highlighted
        //   Enter → seleziona l'evidenziato (o il primo se nessuno) + Esegui
        //   Escape → chiude il dropdown
        input.addEventListener('keydown', async (e) => {
            const items = getValidItems(dropdown);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!dropdown.classList.contains('open')) {
                    // Se il dropdown e' chiuso ma c'e' del testo: aprilo prima
                    const q = input.value.trim();
                    if (q.length >= 2) {
                        clearTimeout(debounceTimer);
                        await searchArticoli(q, field, dropdown);
                    }
                }
                moveHighlight(dropdown, +1);
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveHighlight(dropdown, -1);
                return;
            }

            if (e.key === 'Escape') {
                dropdown.classList.remove('open');
                clearHighlight(dropdown);
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                await acceptHighlightedOrFirstAndRun(input, field, dropdown);
                return;
            }
        });
    }

    /** Restituisce gli item "selezionabili" del dropdown (esclude "Nessun risultato"). */
    function getValidItems(dropdown) {
        return Array.from(dropdown.querySelectorAll('.mrp-dropdown-item'))
            .filter(it => it.querySelector('.dd-code')); // i validi hanno la pillola codice
    }

    /** Trova l'item attualmente evidenziato (o -1 se nessuno). */
    function getHighlightedIndex(dropdown) {
        const items = getValidItems(dropdown);
        return items.findIndex(it => it.classList.contains('highlighted'));
    }

    /** Pulisce qualsiasi highlight precedente. */
    function clearHighlight(dropdown) {
        dropdown.querySelectorAll('.mrp-dropdown-item.highlighted').forEach(it => it.classList.remove('highlighted'));
    }

    /** Sposta l'highlight di +1 o -1 con wrap-around. Scrolla per tenerlo in vista. */
    function moveHighlight(dropdown, delta) {
        const items = getValidItems(dropdown);
        if (items.length === 0) return;
        const cur = getHighlightedIndex(dropdown);
        // Se nessun highlight: ArrowDown va al primo (0), ArrowUp va all'ultimo
        let next;
        if (cur === -1) {
            next = delta > 0 ? 0 : items.length - 1;
        } else {
            next = (cur + delta + items.length) % items.length;
        }
        clearHighlight(dropdown);
        items[next].classList.add('highlighted');
        // Scroll in vista (block: 'nearest' non scrolla se gia visibile)
        items[next].scrollIntoView({ block: 'nearest' });
    }

    /**
     * Accetta l'item EVIDENZIATO da tastiera nel dropdown; se nessuno e'
     * evidenziato (= utente ha solo digitato + Enter senza scorrere) ripiega
     * sul PRIMO suggerimento valido. Poi lancia esegui().
     * Se il dropdown e' chiuso ma c'e' una query, fa un fetch sincrono prima
     * (supporta "digita codice + invio rapido" prima del debounce).
     */
    async function acceptHighlightedOrFirstAndRun(input, field, dropdown) {
        const q = input.value.trim();
        if (!q || q.length < 2) {
            // Nessuna query utile: se c'e' gia un articolo selezionato in stato, esegui
            if (MrpApp.state.parametri && MrpApp.state.parametri.codart) esegui();
            return;
        }

        // Se il dropdown non e' aperto (es. utente ha digitato e premuto Enter
        // prima del debounce di 250ms) → forzare il fetch ora per avere i risultati
        if (!dropdown.classList.contains('open')) {
            clearTimeout(debounceTimer);
            await searchArticoli(q, field, dropdown);
        }

        const items = getValidItems(dropdown);
        if (items.length === 0) {
            // Nessun match utile — non fare nulla (evita esegui con codice inesistente)
            return;
        }

        // Priorita: item evidenziato da tastiera, fallback al primo.
        // target.click() innesca selezionaArticolo che ora si occupa di:
        //   - popolare input
        //   - chiudere dropdown + drawer
        //   - blur dell'input
        //   - lanciare esegui({chained}) basato su viewActive
        // Quindi qui basta il click — niente codice duplicato.
        const idxHigh = getHighlightedIndex(dropdown);
        const target = idxHigh >= 0 ? items[idxHigh] : items[0];
        target.click();
    }

    async function searchArticoli(q, field, dropdown) {
        try {
            const res = await fetch(`${MrpApp.API_BASE}/articoli/search?q=${encodeURIComponent(q)}&field=${field}`, { credentials: 'include' });
            const data = await res.json();

            dropdown.innerHTML = '';
            if (data.length === 0) {
                dropdown.innerHTML = '<div class="mrp-dropdown-item" style="color:var(--text-muted)">Nessun risultato</div>';
                dropdown.classList.add('open');
                return;
            }

            data.forEach(art => {
                const item = document.createElement('div');
                item.className = 'mrp-dropdown-item';
                item.innerHTML = `
                    <span class="dd-code">${art.ar_codart}</span>
                    <span class="dd-descr">${art.ar_descr || ''}</span>
                    <span class="dd-alt">${art.ar_codalt || ''}</span>
                `;
                item.addEventListener('click', () => selezionaArticolo(art, dropdown));
                // Mouse hover azzera l'highlight tastiera (evita doppio focus visivo)
                item.addEventListener('mousemove', () => clearHighlight(dropdown));
                dropdown.appendChild(item);
            });

            // L'innerHTML qui sopra ha rigenerato il dropdown -> nessun highlight residuo
            dropdown.classList.add('open');
        } catch (err) {
            console.error('[Parametri] Errore ricerca:', err);
        }
    }

    async function selezionaArticolo(art, dropdown) {
        // Popola codart + codalt (descrizione mostrata nel suggerimento, non in input dedicato)
        document.getElementById('paramCodart').value = art.ar_codart;
        document.getElementById('paramCodalt').value = art.ar_codalt || '';

        // Chiudi tutti i dropdown
        document.querySelectorAll('.mrp-dropdown').forEach(d => d.classList.remove('open'));

        // Salva nello stato
        MrpApp.state.articoloSelezionato = art;
        MrpApp.state.parametri.codart = art.ar_codart;
        MrpApp.state.parametri._lastDescr = art.ar_descr || '';

        // Carica le fasi
        await caricaFasi(art.ar_codart);

        // Status
        setStatus(`Articolo selezionato: ${art.ar_codart} — ${art.ar_descr}`);

        // Imposta propostaCorrente per ABILITARE il pannello "Decisione Ordine"
        // anche da apertura via drawer. Il fornitore default e' ar_forn (scelta
        // operativa di Pietro su anagrafica BCube — coincide al 100% col fornitore
        // delle proposte MRP). Se ar_forn manca (~articoli storici/dismessi),
        // niente pannello: l'articolo non e' mai stato ordinato (verificato 99,8%).
        if (art.forn1_codice && Number(art.forn1_codice) > 0) {
            MrpApp.state.propostaCorrente = {
                fornitore_codice: Number(art.forn1_codice),
                fornitore_nome: art.forn1_nome || '',
                ol_codart: art.ar_codart,
                ar_codalt: art.ar_codalt || '',
                ar_descr: art.ar_descr || '',
                ol_fase: 0,
                ol_magaz: 1,
                ol_unmis: art.ar_unmis || 'PZ',
                ol_progr: 0,
                ol_prezzo: 0,
                ol_perqta: Number(art.ar_perqta) || 1,
                righe: []   // modalita "catalogo": no righe ordlist, solo bottone "+ Aggiungi"
            };
        } else {
            // Articolo senza fornitore principale: nessun pannello decisione
            MrpApp.state.propostaCorrente = null;
        }

        // Click suggerimento = "type-and-go": chiudi il drawer + lancia esegui.
        // Usa MrpProposta.togglePanelSelezione(false) per coerenza: chiude +
        // resetta gli input + blur, esattamente come Tab toggle off.
        const chained = (MrpApp.state.viewActive === 'progressivi');
        if (typeof MrpProposta !== 'undefined' && MrpProposta.togglePanelSelezione) {
            MrpProposta.togglePanelSelezione(false);
        }
        esegui({ chained });
    }

    async function caricaFasi(codart) {
        const select = document.getElementById('paramFase');
        select.innerHTML = '<option value="">Tutte</option>';

        try {
            const res = await fetch(`${MrpApp.API_BASE}/articoli/${encodeURIComponent(codart)}/fasi`, { credentials: 'include' });
            const fasi = await res.json();

            fasi.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.af_fase;
                opt.textContent = `${f.af_fase} — ${f.af_descr || ''}`;
                select.appendChild(opt);
            });
        } catch (err) {
            console.error('[Parametri] Errore caricamento fasi:', err);
        }
    }

    async function esegui(opts) {
        opts = opts || {};
        const codart = MrpApp.state.parametri.codart;
        if (!codart) {
            setStatus('Seleziona prima un articolo', true);
            return;
        }

        const magaz = document.getElementById('paramMagaz').value.trim();
        const fase = document.getElementById('paramFase').value;
        const modo = document.querySelector('input[name="paramModo"]:checked')?.value || '2';
        const sintetico = document.getElementById('paramSintetico').checked ? '1' : '0';

        // Aggiorna stato
        MrpApp.state.parametri = { codart, magaz, fase, modo, sintetico };

        // Gestione breadcrumb (catena di esplorazione):
        // - chained=true (drawer aperto durante esplorazione progressivi):
        //   NON resettare lo stack — render() aggiungera' il nuovo articolo come
        //   continuazione della catena (push se non duplicato).
        // - chained=false (default — nuova ricerca da form):
        //   resetta lo stack — l'articolo appena cercato sara' il PRIMO della catena.
        if (typeof MrpProgressivi !== 'undefined' && MrpProgressivi.resetBreadcrumb) {
            if (!opts.chained) MrpProgressivi.resetBreadcrumb();
        }

        document.getElementById('btnEsegui').disabled = true;

        // Switch IMMEDIATO alla vista progressivi con skeleton
        const descr = MrpApp.state.parametri._lastDescr || codart;
        document.getElementById('progressiviTitle').textContent = descr + ' (' + codart + ')';
        const tbody = document.getElementById('tblProgressiviBody');
        if (tbody) {
            tbody.innerHTML =
                '<tr><td colspan="16" style="padding:0;border:none;">' +
                '<div class="progressivi-skeleton">' +
                    '<div class="skeleton-bar" style="width:60%;height:20px;margin-bottom:8px;"></div>' +
                    '<div class="skeleton-bar" style="width:100%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:100%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:90%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:100%;height:20px;margin-top:6px;margin-bottom:8px;"></div>' +
                    '<div class="skeleton-bar" style="width:100%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:85%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:95%;height:16px;"></div>' +
                '</div>' +
                '</td></tr>';
        }
        MrpApp.switchView('progressivi');

        try {
            const params = new URLSearchParams({ codart, magaz, fase, modo, sintetico });
            const res = await fetch(`${MrpApp.API_BASE}/progressivi?${params}`, { credentials: 'include' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Errore server');

            MrpApp.state.ultimoRisultato = data;

            // Dati arrivati — sostituisci skeleton con griglia reale
            MrpProgressivi.render(data);

            setStatus('');
        } catch (err) {
            setStatus('Errore: ' + err.message, true);
            console.error('[Parametri] Errore esegui:', err);
            // Torna alla home in caso di errore
            MrpApp.switchView('parametri');
        } finally {
            document.getElementById('btnEsegui').disabled = false;
        }
    }

    /**
     * Esecuzione diretta dei progressivi senza passare dal form DOM.
     * Usato dal click su codart nella proposta — evita fetch ridondante,
     * scritture DOM inutili e simulazione click.
     *
     * opts: { codart, magaz, fase, modo, sintetico, descr, chained }
     *   chained=true  → NON resetta breadcrumb (continua catena)
     *   chained=false → reset breadcrumb (default — nuova esplorazione)
     */
    async function eseguiDiretto(opts) {
        const codart = opts.codart;
        if (!codart) return;

        const magaz = opts.magaz || '';
        const fase = opts.fase || '';
        const modo = opts.modo || '2';
        const sintetico = opts.sintetico || '0';

        MrpApp.state.parametri = { codart, magaz, fase, modo, sintetico };

        // Gestione breadcrumb: vedi commento in esegui().
        if (typeof MrpProgressivi !== 'undefined' && MrpProgressivi.resetBreadcrumb) {
            if (!opts.chained) MrpProgressivi.resetBreadcrumb();
        }

        // Switch immediato alla vista progressivi con skeleton
        const descr = opts.descr || codart;
        document.getElementById('progressiviTitle').textContent = descr + ' (' + codart + ')';
        const tbody = document.getElementById('tblProgressiviBody');
        if (tbody) {
            tbody.innerHTML =
                '<tr><td colspan="16" style="padding:0;border:none;">' +
                '<div class="progressivi-skeleton">' +
                    '<div class="skeleton-bar" style="width:60%;height:20px;margin-bottom:8px;"></div>' +
                    '<div class="skeleton-bar" style="width:100%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:100%;height:16px;"></div>' +
                    '<div class="skeleton-bar" style="width:90%;height:16px;"></div>' +
                '</div>' +
                '</td></tr>';
        }
        MrpApp.switchView('progressivi');

        try {
            const params = new URLSearchParams({ codart, magaz, fase, modo, sintetico });
            const res = await fetch(`${MrpApp.API_BASE}/progressivi?${params}`, { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Errore server');

            MrpApp.state.ultimoRisultato = data;
            MrpProgressivi.render(data);
        } catch (err) {
            console.error('[Parametri] Errore eseguiDiretto:', err);
            MrpApp.switchView('parametri');
        }
    }

    function setStatus(msg, isError = false) {
        const el = document.getElementById('paramStatus');
        el.textContent = msg;
        el.className = 'mrp-status' + (isError ? ' error' : '');
    }

    return { init, caricaFasi, eseguiDiretto };
})();
