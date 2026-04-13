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

        // Mostra il contesto "Pianificazione Fabbisogni Materiali" solo nella vista progressivi
        const ctxLabel = document.getElementById('headerContextLabel');
        if (ctxLabel) ctxLabel.style.display = (viewName === 'progressivi') ? '' : 'none';
    }

    function confermaOrdine(key, datiOrdine) {
        state.ordiniConfermati.set(key, datiOrdine);
    }

    function rimuoviOrdine(key) {
        state.ordiniConfermati.delete(key);
    }

    function getOrdiniConfermati() {
        return state.ordiniConfermati;
    }

    function isArticoloConfermato(key) {
        return state.ordiniConfermati.has(key);
    }

    function getKeyOrdine(fornitore_codice, ol_codart, ol_fase, ol_magaz) {
        return `${fornitore_codice}|${ol_codart}|${ol_fase}|${ol_magaz}`;
    }

    return { init, switchView, state, API_BASE, confermaOrdine, rimuoviOrdine, getOrdiniConfermati, isArticoloConfermato, getKeyOrdine };
})();

document.addEventListener('DOMContentLoaded', () => {
    MrpApp.init();

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
