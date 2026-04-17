/**
 * MRP App — Orchestratore principale
 * Gestisce navigazione tra view e stato globale
 */
const MrpApp = (() => {
    const API_BASE = '/api/mrp';

    // Stato condiviso tra moduli
    const state = {
        articoloSelezionato: null,  // { ar_codart, ar_codalt, ar_descr, ... }
        parametri: {
            codart: '',
            magaz: '',
            fase: '',
            modo: '2',         // default: Progr. Art D.Base + MRP
            sintetico: false
        },
        ultimoRisultato: null,
        // Chiave: "fornitore_codice|ol_codart|ol_fase|ol_magaz"
        // Valore: { fornitore_codice, fornitore_nome, ol_codart, ar_codalt, ar_descr,
        //           ol_fase, ol_magaz, ol_unmis, quantita_confermata, data_consegna,
        //           quantita_proposta, prezzo, escluso, timestamp_conferma }
        ordiniConfermati: new Map(),
        // Contesto della riga proposta da cui si è navigato ai progressivi
        propostaCorrente: null,
        // Elaborazione MRP corrente (rilevata dal server)
        elaborazioneId: null,       // ID intero come stringa
        elaborazione: null          // { id, fingerprint, totaleProposte, totaleGestite }
    };

    function init() {
        // Init tema colori (prima di tutto per prevenire FOUC)
        MrpTheme.init();

        // Init configurazione DB (badge + modale profili)
        MrpDbConfig.init();

        // Navigazione tra view via nav buttons
        document.querySelectorAll('.mrp-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchView(btn.dataset.view);
            });
        });

        // Health check iniziale
        fetch(`${API_BASE}/health`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'ok') {
                    console.log('[MRP] Connessione DB OK — UJET11:', data.ujet11, '| MRP:', data.mrp);
                } else {
                    console.error('[MRP] DB non raggiungibile:', data);
                }
            })
            .catch(err => console.error('[MRP] Health check fallito:', err));

        // Init moduli
        MrpParametri.init();
    }

    function switchView(viewName) {
        document.querySelectorAll('.mrp-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.mrp-nav-btn').forEach(b => b.classList.remove('active'));

        const targetView = document.getElementById('view-' + viewName);
        const targetBtn = document.querySelector(`.mrp-nav-btn[data-view="${viewName}"]`);

        if (targetView) targetView.classList.add('active');
        if (targetBtn) targetBtn.classList.add('active');

        // Traccia la vista corrente in state — usata da features cross-view
        // (es. drawer Selezione Articolo decide reset vs push breadcrumb in base
        // a viewActive='progressivi' = continua catena, altrimenti = reset).
        state.viewActive = viewName;

        // Mostra il contesto "Pianificazione Fabbisogni Materiali" solo nella vista progressivi
        const ctxLabel = document.getElementById('headerContextLabel');
        if (ctxLabel) ctxLabel.style.display = (viewName === 'progressivi') ? '' : 'none';
    }

    /**
     * Conferma un ordine per una specifica riga proposta (ol_progr).
     * La chiave della Map è String(ol_progr) — univoca per elaborazione.
     */
    function confermaOrdine(key, datiOrdine) {
        state.ordiniConfermati.set(key, datiOrdine);
        // Safety-net: persisti su DB via PendingSync (localStorage-first + debounce).
        try {
            if (window.PendingSync && datiOrdine) {
                PendingSync.upsert(key, {
                    ol_progr: datiOrdine.ol_progr,
                    fornitore_codice: datiOrdine.fornitore_codice,
                    codart: datiOrdine.ol_codart,
                    fase: datiOrdine.ol_fase,
                    magaz: datiOrdine.ol_magaz,
                    data_consegna: datiOrdine.data_consegna,
                    quantita_confermata: datiOrdine.quantita_confermata,
                    prezzo: datiOrdine.prezzo,
                    prezzo_override: datiOrdine.prezzo_override
                });
            }
        } catch (_) {}
    }

    function rimuoviOrdine(key) {
        state.ordiniConfermati.delete(key);
        try { if (window.PendingSync) PendingSync.remove(key); } catch (_) {}
    }

    function getOrdiniConfermati() {
        return state.ordiniConfermati;
    }

    function isArticoloConfermato(key) {
        return state.ordiniConfermati.has(key);
    }

    /**
     * Chiave legacy per raggruppamento visivo (NON per Map ordiniConfermati).
     * Usata solo per verificare se un fornitore+codart ha conferme attive.
     */
    function getKeyOrdine(fornitore_codice, ol_codart, ol_fase, ol_magaz) {
        return `${fornitore_codice}|${ol_codart}|${ol_fase}|${ol_magaz}`;
    }

    /**
     * Chiave primaria per ordiniConfermati: ol_progr come stringa.
     */
    function getKeyByProgr(ol_progr) {
        return String(ol_progr);
    }

    return { init, switchView, state, API_BASE, confermaOrdine, rimuoviOrdine, getOrdiniConfermati, isArticoloConfermato, getKeyOrdine, getKeyByProgr };
})();

document.addEventListener('DOMContentLoaded', () => {
    MrpApp.init();

    // PendingSync indicator wiring
    if (window.PendingSync) {
        const el = document.getElementById('pendingSyncIndicator');
        if (el) {
            const labelEl = el.querySelector('.psi-label');
            PendingSync.onStateChange(s => {
                el.classList.remove('psi-ok', 'psi-pending', 'psi-error');
                if (s.status === 'ok' && s.pending === 0) {
                    el.style.display = 'none';
                    return;
                }
                el.style.display = '';
                if (s.status === 'error') {
                    el.classList.add('psi-error');
                    if (labelEl) labelEl.textContent = '⚠ ' + s.pending + ' non salv.';
                    el.title = 'Errore di sincronizzazione con il DB!\n' +
                               (s.lastError || '') + '\n\n' +
                               '⚠ NON aggiornare la pagina: il lavoro in corso verrebbe perso.\n' +
                               'Riprovo automaticamente in background.';
                } else if (s.status === 'pending') {
                    el.classList.add('psi-pending');
                    if (labelEl) labelEl.textContent = '↻ ' + s.pending + ' in salvataggio';
                    el.title = s.pending + ' modifica/e in corso di salvataggio sul DB...';
                } else {
                    el.classList.add('psi-ok');
                    if (labelEl) labelEl.textContent = '✓ salvato';
                    el.title = 'Tutte le modifiche sono state salvate sul DB.';
                }
            });
        }
    }

    // Inizializza color picker nelle legende e gestisce cambi colore
    function initLegendaColorPickers() {
        document.querySelectorAll('.legenda-color-picker').forEach(picker => {
            const cssVar = picker.dataset.var;
            if (cssVar) {
                const current = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
                if (current) picker.value = current;
            }
        });
    }
    initLegendaColorPickers();

    // Delegazione globale per i color picker nelle legende
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('legenda-color-picker')) {
            const cssVar = e.target.dataset.var;
            if (cssVar && typeof MrpTheme !== 'undefined' && MrpTheme.setColor) {
                MrpTheme.setColor(cssVar, e.target.value);
            }
        }
    });

    // Re-inizializza picker quando un modale si apre (i valori potrebbero essere cambiati)
    const observer = new MutationObserver(() => initLegendaColorPickers());
    document.querySelectorAll('.mrp-modal-overlay').forEach(overlay => {
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    });
});
