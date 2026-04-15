/**
 * MRP Theme — gestione tema colori e accessibilita.
 * Pannello slide-in per personalizzazione colori,
 * preset per daltonismo e alto contrasto,
 * mini-picker contestuale in modalita edit.
 */
const MrpTheme = (() => {

    // --------------------------------------------------------
    // COLOR GROUPS (30 variabili CSS)
    // --------------------------------------------------------

    const COLOR_GROUPS = [
        {
            id: 'ui',
            label: 'Interfaccia Base',
            vars: [
                { name: '--header-bg', label: 'Barra superiore', default: '#2563a8' },
                { name: '--primary', label: 'Colore primario', default: '#2563a8' },
                { name: '--primary-dark', label: 'Primario scuro', default: '#1a4d82' },
                { name: '--primary-light', label: 'Primario chiaro', default: '#e3eef8' },
                { name: '--bg', label: 'Sfondo pagina', default: '#f0f2f5' },
                { name: '--bg-content', label: 'Sfondo contenuto', default: '#ffffff' },
                { name: '--text', label: 'Testo principale', default: '#1e293b' },
                { name: '--text-muted', label: 'Testo secondario', default: '#64748b' },
                { name: '--border', label: 'Bordi', default: '#cbd5e1' },
                { name: '--input-bg', label: 'Sfondo input', default: '#f8fafc' },
                { name: '--danger', label: 'Pericolo / Errore', default: '#e11d48' },
                { name: '--success', label: 'Successo / Conferma', default: '#16a34a' },
                { name: '--warning', label: 'Avviso', default: '#f59e0b' }
            ]
        },
        {
            id: 'rows',
            label: 'Righe Griglia',
            vars: [
                { name: '--row-padre', label: 'Riga padre (sfondo)', default: '#006040' },
                { name: '--row-padre-text', label: 'Riga padre (testo)', default: '#ffffff' },
                { name: '--row-magazzino', label: 'Riga magazzino (sfondo)', default: '#c8e6c0' },
                { name: '--row-magazzino-text', label: 'Riga magazzino (testo)', default: '#1e293b' },
                { name: '--row-totale', label: 'Riga totale (sfondo)', default: '#fff176' },
                { name: '--row-totale-text', label: 'Riga totale (testo)', default: '#1e293b' },
                { name: '--row-figlio', label: 'Riga figlio (sfondo)', default: '#e8f5e9' },
                { name: '--row-figlio-text', label: 'Riga figlio (testo)', default: '#1e293b' },
                { name: '--row-figlio-alt', label: 'Riga figlio alternata', default: '#f1f8e9' },
                { name: '--row-esaurito', label: 'Riga esaurito (sfondo)', default: '#fff3e0' },
                { name: '--row-esaurito-text', label: 'Riga esaurito (testo)', default: '#bf360c' }
            ]
        },
        {
            id: 'table',
            label: 'Struttura Tabella',
            vars: [
                { name: '--table-header-bg', label: 'Testata tabella (sfondo)', default: '#334155' },
                { name: '--table-header-border', label: 'Testata tabella (bordo)', default: '#475569' },
                { name: '--table-border-color', label: 'Bordi celle', default: '#e2e8f0' }
            ]
        },
        {
            id: 'mrp',
            label: 'Blocchi MRP',
            vars: [
                { name: '--mrp-blocco-esaurimento', label: 'Esaurimento', default: '#e65100' },
                { name: '--mrp-blocco-sostitutivo', label: 'Sostitutivo', default: '#c62828' },
                { name: '--mrp-blocco-combinato', label: 'Combinato', default: '#ad1457' },
                { name: '--mrp-row-totale-cross', label: 'Totale cross-fase', default: '#e53935' },
                { name: '--mrp-row-generale-totale', label: 'Totale generale', default: '#1e293b' }
            ]
        },
        {
            id: 'fornitori',
            label: 'Classificazione Fornitori',
            vars: [
                { name: '--forn-it', label: 'Italia', default: '#2e7d32' },
                { name: '--forn-ue', label: 'Unione Europea', default: '#1565c0' },
                { name: '--forn-extra-ue', label: 'Extra UE', default: '#e65100' }
            ]
        },
        {
            id: 'storico',
            label: 'Storico Ordini',
            vars: [
                { name: '--storico-accettata', label: 'P.O.F. Accettata', default: '#16a34a' },
                { name: '--storico-modificata', label: 'P.O.F. Modificata', default: '#d97706' },
                { name: '--storico-misto', label: 'Ordine Misto', default: '#7c3aed' },
                { name: '--storico-indipendente', label: 'Ordine Indipendente', default: '#2563eb' }
            ]
        },
        {
            id: 'typography',
            label: 'Tipografia',
            vars: [
                { name: '--font', label: 'Font principale', default: '"Segoe UI", system-ui, -apple-system, sans-serif', type: 'font' }
            ]
        },
        {
            id: 'layout',
            label: 'Layout',
            vars: [
                { name: '--radius', label: 'Arrotondamento card', default: '8px', type: 'radius' },
                { name: '--radius-sm', label: 'Arrotondamento piccolo', default: '4px', type: 'radius' }
            ]
        }
    ];

    // Lista font disponibili per il selettore
    const FONT_OPTIONS = [
        { label: 'Segoe UI', value: '"Segoe UI", system-ui, -apple-system, sans-serif' },
        { label: 'Inter', value: '"Inter", system-ui, sans-serif' },
        { label: 'Roboto', value: '"Roboto", system-ui, sans-serif' },
        { label: 'Open Sans', value: '"Open Sans", system-ui, sans-serif' },
        { label: 'Lato', value: '"Lato", system-ui, sans-serif' },
        { label: 'Source Sans Pro', value: '"Source Sans Pro", system-ui, sans-serif' },
        { label: 'Montserrat', value: '"Montserrat", system-ui, sans-serif' },
        { label: 'Poppins', value: '"Poppins", system-ui, sans-serif' },
        { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
        { label: 'Monospace', value: '"Cascadia Code", "Fira Code", monospace' }
    ];

    // --------------------------------------------------------
    // PRESETS
    // --------------------------------------------------------

    const PRESETS = {
        default: {},
        deuteranopia: {
            '--danger': '#d55e00', '--success': '#0072b2', '--warning': '#e69f00',
            '--row-padre': '#004060', '--row-magazzino': '#e6f0f9',
            '--row-totale': '#f0e442', '--row-figlio': '#e6f0f9',
            '--row-figlio-alt': '#f0f6fc', '--row-esaurito': '#fef0d9',
            '--row-esaurito-text': '#d55e00',
            '--mrp-blocco-esaurimento': '#d55e00', '--mrp-blocco-sostitutivo': '#0072b2',
            '--mrp-blocco-combinato': '#cc79a7', '--mrp-row-totale-cross': '#d55e00'
        },
        protanopia: {
            '--danger': '#b35900', '--success': '#0072b2', '--warning': '#e69f00',
            '--primary': '#0072b2', '--primary-dark': '#005080', '--primary-light': '#d6eaf8',
            '--row-padre': '#003050', '--row-magazzino': '#d6eaf8',
            '--row-totale': '#f0e442', '--row-figlio': '#d6eaf8',
            '--row-figlio-alt': '#e8f4fc', '--row-esaurito': '#fff2cc',
            '--row-esaurito-text': '#b35900',
            '--mrp-blocco-esaurimento': '#b35900', '--mrp-blocco-sostitutivo': '#0072b2',
            '--mrp-blocco-combinato': '#9467bd', '--mrp-row-totale-cross': '#b35900'
        },
        'high-contrast': {
            '--primary': '#0050a0', '--primary-dark': '#003070', '--primary-light': '#cce0ff',
            '--bg': '#ffffff', '--bg-content': '#ffffff', '--text': '#000000',
            '--text-muted': '#333333', '--border': '#000000', '--input-bg': '#ffffff',
            '--danger': '#cc0000', '--success': '#006600', '--warning': '#cc6600',
            '--row-padre': '#000000', '--row-padre-text': '#ffffff',
            '--row-magazzino': '#e6ffe6', '--row-magazzino-text': '#000000',
            '--row-totale': '#ffff00', '--row-totale-text': '#000000',
            '--row-figlio': '#f0f0f0', '--row-figlio-text': '#000000',
            '--row-figlio-alt': '#e8e8e8',
            '--row-esaurito': '#ffe0cc', '--row-esaurito-text': '#cc0000',
            '--table-header-bg': '#000000', '--table-header-border': '#333333',
            '--table-border-color': '#000000',
            '--mrp-blocco-esaurimento': '#cc6600', '--mrp-blocco-sostitutivo': '#0000cc',
            '--mrp-blocco-combinato': '#660066', '--mrp-row-totale-cross': '#cc0000',
            '--mrp-row-generale-totale': '#000000',
            '--radius': '4px', '--radius-sm': '2px'
        }
    };

    // --------------------------------------------------------
    // ELEMENT → CSS VARIABLE mapping (per click contestuale)
    // Ordinato per specificita: i piu specifici prima, i fallback globali alla fine.
    // --------------------------------------------------------

    const ELEMENT_VAR_MAP = [
        // === RIGHE GRIGLIA (alta specificita) ===
        { selector: '.row-padre', label: 'Riga padre', vars: [
            { varName: '--row-padre', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        { selector: '.row-magazzino', label: 'Riga magazzino', vars: [
            { varName: '--row-magazzino', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        { selector: '.mrp-row-totale', label: 'Riga totale', vars: [
            { varName: '--row-totale', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        { selector: '.row-figlio', label: 'Riga figlio', vars: [
            { varName: '--row-figlio', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        { selector: '.row-figlio-alt', label: 'Riga figlio alternata', vars: [
            { varName: '--row-figlio-alt', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.row-esaurito', label: 'Riga esaurito', vars: [
            { varName: '--row-esaurito', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        // Blocchi MRP
        { selector: '.mrp-row-totale-cross', label: 'Totale cross-fase', vars: [
            { varName: '--mrp-row-totale-cross', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.mrp-row-generale-totale', label: 'Totale generale', vars: [
            { varName: '--mrp-row-generale-totale', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.mrp-blocco-esaurimento', label: 'Blocco esaurimento', vars: [
            { varName: '--mrp-blocco-esaurimento', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.mrp-blocco-sostitutivo', label: 'Blocco sostitutivo', vars: [
            { varName: '--mrp-blocco-sostitutivo', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.mrp-blocco-combinato', label: 'Blocco combinato', vars: [
            { varName: '--mrp-blocco-combinato', controlType: 'color', label: 'Sfondo' }
        ]},
        // Righe modali
        { selector: '.modal-row-impprod', label: 'Modale: imp. produzione', vars: [
            { varName: '--row-esaurito', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        { selector: '.modal-row-ordprod', label: 'Modale: ord. produzione', vars: [
            { varName: '--row-totale', controlType: 'color-pair', label: 'Sfondo / Testo' }
        ]},
        { selector: '.modal-row-ordforn', label: 'Modale: ord. fornitore', vars: [
            { varName: '--bg-content', controlType: 'color', label: 'Sfondo' }
        ]},

        // === HOME (view-parametri) ===
        { selector: '.mrp-control', label: 'Input / Select', vars: [
            { varName: '--input-bg', controlType: 'color', label: 'Sfondo' },
            { varName: '--border', controlType: 'color', label: 'Bordo' },
            { varName: '--text', controlType: 'color', label: 'Testo' },
            { varName: '--radius-sm', controlType: 'radius', label: 'Arrotondamento' },
            { varName: '--font', controlType: 'font', label: 'Font' }
        ]},
        { selector: '.mrp-btn-primary', label: 'Pulsante primario', vars: [
            { varName: '--primary', controlType: 'color', label: 'Sfondo' },
            { varName: '--primary-dark', controlType: 'color', label: 'Sfondo hover' },
            { varName: '--font', controlType: 'font', label: 'Font' }
        ]},
        { selector: '.mrp-btn-secondary', label: 'Pulsante secondario', vars: [
            { varName: '--bg', controlType: 'color', label: 'Sfondo' },
            { varName: '--text', controlType: 'color', label: 'Testo' },
            { varName: '--border', controlType: 'color', label: 'Bordo' },
            { varName: '--radius-sm', controlType: 'radius', label: 'Arrotondamento' }
        ]},
        { selector: '.mrp-dropdown', label: 'Dropdown autocomplete', vars: [
            { varName: '--bg-content', controlType: 'color', label: 'Sfondo' },
            { varName: '--primary', controlType: 'color', label: 'Evidenziazione' },
            { varName: '--radius-sm', controlType: 'radius', label: 'Arrotondamento' }
        ]},
        { selector: '.mrp-opzioni-fieldset', label: 'Fieldset opzioni', vars: [
            { varName: '--border', controlType: 'color', label: 'Bordo' },
            { varName: '--radius-sm', controlType: 'radius', label: 'Arrotondamento' }
        ]},
        { selector: '.mrp-label', label: 'Etichetta', vars: [
            { varName: '--text', controlType: 'color', label: 'Colore testo' }
        ]},
        { selector: '.mrp-status', label: 'Stato', vars: [
            { varName: '--text-muted', controlType: 'color', label: 'Colore testo' }
        ]},

        // === PROGRESSIVI ===
        { selector: '.mrp-table th', label: 'Testata tabella', vars: [
            { varName: '--table-header-bg', controlType: 'color', label: 'Sfondo' },
            { varName: '--table-header-border', controlType: 'color', label: 'Bordo' }
        ]},
        { selector: '.mrp-table td', label: 'Cella tabella', vars: [
            { varName: '--table-border-color', controlType: 'color', label: 'Bordi celle' }
        ]},
        { selector: '.btn-matrioska', label: 'Pulsante matrioska', vars: [
            { varName: '--primary', controlType: 'color', label: 'Sfondo' },
            { varName: '--primary-dark', controlType: 'color', label: 'Hover' }
        ]},
        { selector: '.mrp-table-wrapper', label: 'Wrapper tabella', vars: [
            { varName: '--border', controlType: 'color', label: 'Bordo' },
            { varName: '--radius-sm', controlType: 'radius', label: 'Arrotondamento' }
        ]},
        { selector: '.mrp-progressivi-title', label: 'Titolo progressivi', vars: [
            { varName: '--text', controlType: 'color', label: 'Colore testo' }
        ]},

        // === MODALI ===
        { selector: '.mrp-modal-header', label: 'Testata modale', vars: [
            { varName: '--primary-light', controlType: 'color', label: 'Sfondo' },
            { varName: '--primary-dark', controlType: 'color', label: 'Testo titolo' },
            { varName: '--border', controlType: 'color', label: 'Bordo' }
        ]},
        { selector: '.mrp-modal', label: 'Finestra modale', vars: [
            { varName: '--bg-content', controlType: 'color', label: 'Sfondo' },
            { varName: '--radius', controlType: 'radius', label: 'Arrotondamento' }
        ]},

        // === PROPOSTA ===
        { selector: '.proposta-fornitore-header', label: 'Header fornitore', vars: [
            { varName: '--primary', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.proposta-stats', label: 'Statistiche proposta', vars: [
            { varName: '--text-muted', controlType: 'color', label: 'Testo' },
            { varName: '--border', controlType: 'color', label: 'Bordo' }
        ]},
        { selector: '.btn-emetti-ordine', label: 'Pulsante emetti ordine', vars: [
            { varName: '--success', controlType: 'color', label: 'Colore' }
        ]},
        { selector: '.storico-tabella th', label: 'Testata storico', vars: [
            { varName: '--table-header-bg', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.proposta-fornitore', label: 'Card fornitore', vars: [
            { varName: '--border', controlType: 'color', label: 'Bordo' }
        ]},

        // === DECISIONE ===
        { selector: '.mrp-btn-conferma', label: 'Pulsante conferma', vars: [
            { varName: '--success', controlType: 'color', label: 'Sfondo' },
            { varName: '--font', controlType: 'font', label: 'Font' }
        ]},
        { selector: '.decisione-header', label: 'Header decisione', vars: [
            { varName: '--success', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.mrp-decisione-panel', label: 'Pannello decisione', vars: [
            { varName: '--success', controlType: 'color', label: 'Bordo' },
            { varName: '--radius', controlType: 'radius', label: 'Arrotondamento' }
        ]},

        // === DBCONFIG ===
        { selector: '.mrp-db-badge', label: 'Badge database', vars: [
            { varName: '--bg', controlType: 'color', label: 'Sfondo' },
            { varName: '--text', controlType: 'color', label: 'Testo' },
            { varName: '--border', controlType: 'color', label: 'Bordo' }
        ]},
        { selector: '.cfg-tab', label: 'Tab configurazione', vars: [
            { varName: '--text-muted', controlType: 'color', label: 'Testo' },
            { varName: '--primary', controlType: 'color', label: 'Attivo' }
        ]},

        // === GLOBALI (bassa specificita — ultima priorita) ===
        { selector: '.mrp-header', label: 'Barra superiore', vars: [
            { varName: '--header-bg', controlType: 'color', label: 'Sfondo' }
        ]},
        { selector: '.mrp-card', label: 'Card', vars: [
            { varName: '--bg-content', controlType: 'color', label: 'Sfondo' },
            { varName: '--border', controlType: 'color', label: 'Bordo' },
            { varName: '--radius', controlType: 'radius', label: 'Arrotondamento' }
        ]},
        { selector: '.mrp-main', label: 'Area principale', vars: [
            { varName: '--bg', controlType: 'color', label: 'Sfondo pagina' },
            { varName: '--text', controlType: 'color', label: 'Testo' },
            { varName: '--font', controlType: 'font', label: 'Font' }
        ]}
    ];

    // --------------------------------------------------------
    // PRESET LABELS (per dropdown)
    // --------------------------------------------------------

    const PRESET_LABELS = {
        default: 'Predefinito',
        deuteranopia: 'Deuteranopia',
        protanopia: 'Protanopia',
        'high-contrast': 'Alto contrasto',
        custom: 'Personalizzato'
    };

    // --------------------------------------------------------
    // STATO PRIVATO
    // --------------------------------------------------------

    let currentPreset = 'default';
    let customColors = {};
    let customLabels = {};
    let dirty = false;
    let panelOpen = false;
    let editMode = false;
    let miniPicker = null;

    // Flat lookup: varName → default value
    const defaultMap = {};
    COLOR_GROUPS.forEach(g => g.vars.forEach(v => { defaultMap[v.name] = v.default; }));

    // --------------------------------------------------------
    // INIT
    // --------------------------------------------------------

    function init() {
        // 1. Carica da localStorage (sincrono)
        const cached = localStorage.getItem('mrp-theme');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                currentPreset = data.colorPreset || 'default';
                customColors = data.customColors || {};
                customLabels = data.customLabels || {};
                applyPresetInternal(currentPreset, customColors);
            } catch (e) {
                console.warn('[MrpTheme] Cache locale corrotta, uso default');
            }
        }

        // 2. Fetch preferenze server in background
        fetchServerPreferences();

        // 3. Listener globali
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('click', onBodyClick, true);

        // 4. Bottone apertura pannello
        const btnOpen = document.getElementById('btnOpenTheme');
        if (btnOpen) btnOpen.addEventListener('click', openPanel);
    }

    function fetchServerPreferences() {
        const base = (typeof MrpApp !== 'undefined' && MrpApp.API_BASE) ? MrpApp.API_BASE : '/api/mrp';
        fetch(base + '/user/preferences', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                if (!data) return;
                const serverPreset = data.colorPreset || 'default';
                const serverColors = data.customColors || {};
                const serverLabels = data.customLabels || {};

                // Confronta con cache: se diverso, aggiorna
                const cacheStr = JSON.stringify({ colorPreset: currentPreset, customColors, customLabels });
                const serverStr = JSON.stringify({ colorPreset: serverPreset, customColors: serverColors, customLabels: serverLabels });
                if (cacheStr !== serverStr) {
                    currentPreset = serverPreset;
                    customColors = serverColors;
                    customLabels = serverLabels;
                    applyPresetInternal(currentPreset, customColors);
                    updateLocalStorage();
                }
            })
            .catch(() => {
                // Non loggato o dev mode — continua con cache/default
            });
    }

    // --------------------------------------------------------
    // APPLY COLORS
    // --------------------------------------------------------

    function applyColors(colors) {
        const root = document.documentElement;
        Object.keys(colors).forEach(key => {
            // Salta chiavi interne (es. _columnPrefs) — non sono variabili CSS
            if (key.startsWith('_')) return;
            if (colors[key]) {
                root.style.setProperty(key, colors[key]);
            } else {
                root.style.removeProperty(key);
            }
        });
    }

    function removeAllOverrides() {
        const root = document.documentElement;
        COLOR_GROUPS.forEach(g => g.vars.forEach(v => {
            root.style.removeProperty(v.name);
        }));
    }

    // --------------------------------------------------------
    // APPLY PRESET
    // --------------------------------------------------------

    function applyPreset(presetName) {
        if (presetName === 'custom') {
            document.documentElement.removeAttribute('data-theme');
            removeAllOverrides();
            applyColors(customColors);
        } else if (presetName === 'default') {
            document.documentElement.removeAttribute('data-theme');
            removeAllOverrides();
        } else if (PRESETS[presetName]) {
            document.documentElement.dataset.theme = presetName;
            removeAllOverrides();
            applyColors(PRESETS[presetName]);
        }
        currentPreset = presetName;
        updateLocalStorage();
        updatePanelPresetDropdown();
    }

    /** Applica preset + customColors opzionali (usato da init) */
    function applyPresetInternal(presetName, colors) {
        if (presetName === 'custom') {
            document.documentElement.removeAttribute('data-theme');
            removeAllOverrides();
            applyColors(colors || {});
        } else if (presetName === 'default') {
            document.documentElement.removeAttribute('data-theme');
            removeAllOverrides();
        } else if (PRESETS[presetName]) {
            document.documentElement.dataset.theme = presetName;
            removeAllOverrides();
            applyColors(PRESETS[presetName]);
            // Applica anche eventuali custom su preset
            if (colors && Object.keys(colors).length) {
                applyColors(colors);
            }
        }
        currentPreset = presetName;
    }

    // --------------------------------------------------------
    // SET COLOR (singola variabile)
    // --------------------------------------------------------

    function setColor(varName, value) {
        document.documentElement.style.setProperty(varName, value);
        customColors[varName] = value;
        dirty = true;

        // Auto-switch a "custom" se non lo e' gia'
        if (currentPreset !== 'custom') {
            currentPreset = 'custom';
            document.documentElement.removeAttribute('data-theme');
            updatePanelPresetDropdown();
        }

        // Aggiorna riga panel se visibile
        updatePanelRow(varName, value);

        // Aggiorna mini-picker se mostra la stessa variabile (sfondo o testo)
        if (miniPicker) {
            const baseVar = miniPicker.dataset.varName;
            if (baseVar === varName) {
                const input = miniPicker.querySelector('.mrp-mini-swatch:not(.mrp-mini-swatch-text)');
                const hex = miniPicker.querySelector('.mrp-mini-hex:not(.mrp-mini-hex-text)');
                if (input) input.value = value;
                if (hex) hex.value = value;
            } else if (baseVar + '-text' === varName) {
                const input = miniPicker.querySelector('.mrp-mini-swatch-text');
                const hex = miniPicker.querySelector('.mrp-mini-hex-text');
                if (input) input.value = value;
                if (hex) hex.value = value;
            }
        }

        updateLocalStorage();
    }

    // --------------------------------------------------------
    // LOCALSTORAGE
    // --------------------------------------------------------

    function updateLocalStorage() {
        localStorage.setItem('mrp-theme', JSON.stringify({
            colorPreset: currentPreset,
            customColors,
            customLabels
        }));
    }

    // --------------------------------------------------------
    // GET CURRENT VALUE
    // --------------------------------------------------------

    function getCurrentValue(varName) {
        // 1. Override in customColors (se preset custom)
        if (currentPreset === 'custom' && customColors[varName]) {
            return customColors[varName];
        }
        // 2. Valore dal preset corrente
        if (PRESETS[currentPreset] && PRESETS[currentPreset][varName]) {
            return PRESETS[currentPreset][varName];
        }
        // 3. Computed style
        const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (computed) return computed;
        // 4. Default dalla definizione
        return defaultMap[varName] || '#000000';
    }

    // --------------------------------------------------------
    // PANEL — OPEN / CLOSE
    // --------------------------------------------------------

    function openPanel() {
        let panel = document.getElementById('mrpThemePanel');
        if (!panel) {
            panel = buildPanel();
            document.body.appendChild(panel);
        }
        populatePanel();
        requestAnimationFrame(() => {
            panel.classList.add('open');
        });
        panelOpen = true;
        // Sincronizza stato checkbox con editMode corrente
        const toggle = document.getElementById('mrpThemeEditToggle');
        if (toggle) toggle.checked = editMode;
    }

    function closePanel() {
        const panel = document.getElementById('mrpThemePanel');
        if (panel) panel.classList.remove('open');
        document.body.classList.remove('theme-edit-mode');
        panelOpen = false;
        editMode = false;
        removeMiniPicker();
        // Auto-save alla chiusura
        if (dirty) {
            save();
            dirty = false;
        }
    }

    // --------------------------------------------------------
    // PANEL — BUILD HTML
    // --------------------------------------------------------

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'mrpThemePanel';
        panel.className = 'mrp-theme-panel';

        panel.innerHTML = `
            <div class="mrp-theme-panel-header">
                <h3>Personalizzazione Tema</h3>
                <button class="mrp-theme-close" title="Chiudi">&times;</button>
            </div>
            <div class="mrp-theme-panel-body">
                <div class="mrp-theme-preset-row">
                    <label>Preset:</label>
                    <select id="mrpThemePresetSelect">
                        ${Object.keys(PRESET_LABELS).map(k =>
                            `<option value="${k}"${k === currentPreset ? ' selected' : ''}>${PRESET_LABELS[k]}</option>`
                        ).join('')}
                    </select>
                </div>
                <div id="mrpThemeGroups"></div>
            </div>
            <div class="mrp-theme-panel-footer">
                <label class="mrp-theme-edit-toggle">
                    <input type="checkbox" id="mrpThemeEditToggle" />
                    <span>Seleziona elemento</span>
                </label>
                <button class="mrp-theme-btn mrp-theme-btn-reset" id="mrpThemeResetAll">Reset</button>
                <span class="mrp-theme-feedback" id="mrpThemeFeedback"></span>
            </div>
        `;

        // Bind eventi panel
        panel.querySelector('.mrp-theme-close').addEventListener('click', closePanel);
        panel.querySelector('#mrpThemeEditToggle').addEventListener('change', (e) => {
            editMode = e.target.checked;
            if (editMode) {
                document.body.classList.add('theme-edit-mode');
            } else {
                document.body.classList.remove('theme-edit-mode');
                removeMiniPicker();
            }
        });
        panel.querySelector('#mrpThemePresetSelect').addEventListener('change', (e) => {
            applyPreset(e.target.value);
            populatePanel();
        });
        panel.querySelector('#mrpThemeResetAll').addEventListener('click', () => {
            reset();
            populatePanel();
            dirty = true;
        });

        // Floating action button per aprire il tema sopra i modali
        if (!document.getElementById('themeEditFab')) {
            const fab = document.createElement('button');
            fab.id = 'themeEditFab';
            fab.className = 'theme-edit-fab';
            fab.title = 'Apri tema';
            fab.textContent = '🎨';
            fab.addEventListener('click', (e) => {
                e.stopPropagation();
                openPanel();
            });
            document.body.appendChild(fab);
        }

        return panel;
    }

    // --------------------------------------------------------
    // PANEL — POPULATE
    // --------------------------------------------------------

    function populatePanel() {
        const container = document.getElementById('mrpThemeGroups');
        if (!container) return;
        container.innerHTML = '';

        COLOR_GROUPS.forEach(group => {
            const section = document.createElement('div');
            section.className = 'mrp-theme-group';
            section.dataset.groupId = group.id;

            const header = document.createElement('div');
            header.className = 'mrp-theme-group-header';
            header.innerHTML = `<span class="mrp-theme-chevron">&#9660;</span> ${group.label}`;
            header.addEventListener('click', () => {
                section.classList.toggle('collapsed');
            });

            const body = document.createElement('div');
            body.className = 'mrp-theme-group-body';

            group.vars.forEach(v => {
                const val = getCurrentValue(v.name);
                const displayLabel = customLabels[v.name] || v.label;
                const row = document.createElement('div');
                row.dataset.varName = v.name;

                const varType = v.type || 'color';

                if (varType === 'font') {
                    row.className = 'mrp-theme-row mrp-theme-row-font';
                    const options = FONT_OPTIONS.map(f => {
                        const sel = val.includes(f.label) ? ' selected' : '';
                        return `<option value="${f.value}"${sel}>${f.label}</option>`;
                    }).join('');
                    row.innerHTML = `
                        <span class="mrp-theme-label" title="${v.name} — doppio click per rinominare">${displayLabel}</span>
                        <select class="mrp-theme-font-select" data-var="${v.name}">${options}</select>
                        <button class="mrp-theme-row-reset" data-var="${v.name}" title="Ripristina default">&circlearrowright;</button>
                    `;
                } else if (varType === 'radius') {
                    row.className = 'mrp-theme-row mrp-theme-row-radius';
                    const numVal = parseInt(val) || 0;
                    row.innerHTML = `
                        <span class="mrp-theme-label" title="${v.name} — doppio click per rinominare">${displayLabel}</span>
                        <input type="range" class="mrp-theme-radius-slider" data-var="${v.name}" min="0" max="24" step="1" value="${numVal}">
                        <span class="mrp-theme-radius-value" data-var="${v.name}">${numVal}px</span>
                        <button class="mrp-theme-row-reset" data-var="${v.name}" title="Ripristina default">&circlearrowright;</button>
                    `;
                } else {
                    row.className = 'mrp-theme-row';
                    row.innerHTML = `
                        <span class="mrp-theme-label" title="${v.name} — doppio click per rinominare">${displayLabel}</span>
                        <div class="mrp-theme-swatch-wrap">
                            <input type="color" class="mrp-theme-swatch" value="${normalizeHex(val)}" data-var="${v.name}">
                        </div>
                        <input type="text" class="mrp-theme-hex" value="${normalizeHex(val)}" data-var="${v.name}" maxlength="7" spellcheck="false">
                        <button class="mrp-theme-row-reset" data-var="${v.name}" title="Ripristina default">&circlearrowright;</button>
                    `;
                }

                // Label editabile con doppio click
                const labelSpan = row.querySelector('.mrp-theme-label');
                function attachLabelEdit(span) {
                    span.addEventListener('dblclick', function onDblClick() {
                        const currentText = customLabels[v.name] || v.label;
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'mrp-theme-label-edit';
                        input.value = currentText;
                        input.style.cssText = 'width:100%;font-size:0.78rem;padding:2px 4px;border:1px solid var(--primary);border-radius:3px;outline:none;';
                        span.replaceWith(input);
                        input.focus();
                        input.select();

                        function commitLabel() {
                            const newLabel = input.value.trim() || v.label;
                            if (newLabel !== v.label) {
                                customLabels[v.name] = newLabel;
                            } else {
                                delete customLabels[v.name];
                            }
                            const newSpan = document.createElement('span');
                            newSpan.className = 'mrp-theme-label';
                            newSpan.title = v.name + ' \u2014 doppio click per rinominare';
                            newSpan.textContent = newLabel;
                            input.replaceWith(newSpan);
                            attachLabelEdit(newSpan);
                            dirty = true;
                            updateLocalStorage();
                        }
                        input.addEventListener('blur', commitLabel);
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                            if (e.key === 'Escape') { input.value = v.label; input.blur(); }
                        });
                    });
                }
                attachLabelEdit(labelSpan);

                if (varType === 'font') {
                    // Font select change
                    const fontSel = row.querySelector('.mrp-theme-font-select');
                    fontSel.addEventListener('change', () => {
                        setColor(v.name, fontSel.value);
                        dirty = true;
                    });
                } else if (varType === 'radius') {
                    // Radius slider change
                    const slider = row.querySelector('.mrp-theme-radius-slider');
                    const display = row.querySelector('.mrp-theme-radius-value');
                    slider.addEventListener('input', () => {
                        const val = slider.value + 'px';
                        setColor(v.name, val);
                        display.textContent = val;
                        dirty = true;
                    });
                } else {
                    // Swatch change (color)
                    const swatch = row.querySelector('.mrp-theme-swatch');
                    swatch.addEventListener('input', (e) => {
                        const color = e.target.value;
                        setColor(v.name, color);
                        row.querySelector('.mrp-theme-hex').value = color;
                        dirty = true;
                    });

                    // Hex input
                    const hexInput = row.querySelector('.mrp-theme-hex');
                    hexInput.addEventListener('input', () => {
                        const raw = hexInput.value.trim();
                        if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                            setColor(v.name, raw);
                            swatch.value = raw;
                            dirty = true;
                        }
                    });
                }

                // Row reset (tutti i tipi)
                row.querySelector('.mrp-theme-row-reset').addEventListener('click', () => {
                    delete customColors[v.name];
                    document.documentElement.style.removeProperty(v.name);
                    if (currentPreset !== 'custom' && PRESETS[currentPreset] && PRESETS[currentPreset][v.name]) {
                        document.documentElement.style.setProperty(v.name, PRESETS[currentPreset][v.name]);
                    }
                    const defVal = getResetValue(v.name);
                    if (varType === 'font') {
                        const fontSel = row.querySelector('.mrp-theme-font-select');
                        FONT_OPTIONS.forEach((f, i) => { fontSel.options[i].selected = defVal.includes(f.label); });
                    } else if (varType === 'radius') {
                        const slider = row.querySelector('.mrp-theme-radius-slider');
                        const display = row.querySelector('.mrp-theme-radius-value');
                        const numVal = parseInt(defVal) || 0;
                        slider.value = numVal;
                        display.textContent = numVal + 'px';
                    } else {
                        row.querySelector('.mrp-theme-swatch').value = normalizeHex(defVal);
                        row.querySelector('.mrp-theme-hex').value = normalizeHex(defVal);
                    }
                    dirty = true;
                    updateLocalStorage();
                });

                body.appendChild(row);
            });

            section.appendChild(header);
            section.appendChild(body);
            container.appendChild(section);
        });
    }

    /** Valore a cui resettare la singola variabile */
    function getResetValue(varName) {
        if (currentPreset !== 'default' && currentPreset !== 'custom' && PRESETS[currentPreset] && PRESETS[currentPreset][varName]) {
            return PRESETS[currentPreset][varName];
        }
        return defaultMap[varName] || '#000000';
    }

    // --------------------------------------------------------
    // PANEL — UPDATE HELPERS
    // --------------------------------------------------------

    function updatePanelRow(varName, value) {
        // Font select
        const fontSel = document.querySelector(`.mrp-theme-font-select[data-var="${varName}"]`);
        if (fontSel) {
            for (const opt of fontSel.options) { opt.selected = value.includes(opt.text); }
            return;
        }
        // Radius slider
        const slider = document.querySelector(`.mrp-theme-radius-slider[data-var="${varName}"]`);
        if (slider) {
            const numVal = parseInt(value) || 0;
            slider.value = numVal;
            const display = document.querySelector(`.mrp-theme-radius-value[data-var="${varName}"]`);
            if (display) display.textContent = numVal + 'px';
            return;
        }
        // Color swatch + hex
        const swatch = document.querySelector(`.mrp-theme-swatch[data-var="${varName}"]`);
        const hex = document.querySelector(`.mrp-theme-hex[data-var="${varName}"]`);
        if (swatch) swatch.value = normalizeHex(value);
        if (hex) hex.value = normalizeHex(value);
    }

    function updatePanelPresetDropdown() {
        const sel = document.getElementById('mrpThemePresetSelect');
        if (sel) sel.value = currentPreset;
    }

    // --------------------------------------------------------
    // MINI-PICKER (click contestuale in edit mode)
    // --------------------------------------------------------

    function findElementMapping(target) {
        for (const entry of ELEMENT_VAR_MAP) {
            const el = target.closest(entry.selector);
            if (el) return { element: el, mapping: entry };
        }
        return null;
    }

    function onBodyClick(e) {
        if (!editMode) return;

        // Ignora click dentro il panel tema
        const panel = document.getElementById('mrpThemePanel');
        if (panel && panel.contains(e.target)) return;

        // Ignora click dentro mini-picker
        if (miniPicker && miniPicker.contains(e.target)) return;

        // Ignora click sul fab button
        const fab = document.getElementById('themeEditFab');
        if (fab && fab.contains(e.target)) return;

        // Cerca match nell'ELEMENT_VAR_MAP
        const match = findElementMapping(e.target);
        if (!match) {
            e.preventDefault();
            e.stopImmediatePropagation();
            removeMiniPicker();
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        showMiniPicker(match.element, match.mapping);
    }

    // Genera una riga color-picker (swatch + hex input)
    function buildColorControl(varName, label) {
        const val = getCurrentValue(varName);
        return `
            <div class="mrp-mini-section">
                <span class="mrp-mini-section-label">${label}</span>
                <div class="mrp-mini-color-row">
                    <input type="color" class="mrp-mini-swatch" data-var="${varName}" value="${normalizeHex(val)}">
                    <input type="text" class="mrp-mini-hex" data-var="${varName}" value="${normalizeHex(val)}" maxlength="7" spellcheck="false">
                </div>
            </div>
        `;
    }

    // Genera una coppia sfondo + testo
    function buildColorPairControl(varName, label) {
        const bgVal = getCurrentValue(varName);
        const textVarName = varName + '-text';
        const textVal = getCurrentValue(textVarName);
        return `
            <div class="mrp-mini-section">
                <span class="mrp-mini-section-label">${label}</span>
                <div class="mrp-mini-color-row">
                    <span class="mrp-mini-sublabel">Sfondo</span>
                    <input type="color" class="mrp-mini-swatch" data-var="${varName}" value="${normalizeHex(bgVal)}">
                    <input type="text" class="mrp-mini-hex" data-var="${varName}" value="${normalizeHex(bgVal)}" maxlength="7" spellcheck="false">
                </div>
                <div class="mrp-mini-color-row">
                    <span class="mrp-mini-sublabel">Testo</span>
                    <input type="color" class="mrp-mini-swatch" data-var="${textVarName}" value="${normalizeHex(textVal)}">
                    <input type="text" class="mrp-mini-hex" data-var="${textVarName}" value="${normalizeHex(textVal)}" maxlength="7" spellcheck="false">
                </div>
            </div>
        `;
    }

    // Genera un selettore font
    function buildFontControl(varName, label) {
        const currentVal = getCurrentValue(varName);
        const options = FONT_OPTIONS.map(f => {
            const sel = currentVal.includes(f.label) ? ' selected' : '';
            return `<option value="${f.value}"${sel} style="font-family:${f.value}">${f.label}</option>`;
        }).join('');
        return `
            <div class="mrp-mini-section">
                <span class="mrp-mini-section-label">${label}</span>
                <select class="mrp-mini-font-select" data-var="${varName}">${options}</select>
            </div>
        `;
    }

    // Genera uno slider radius
    function buildRadiusControl(varName, label) {
        const currentVal = getCurrentValue(varName);
        const numVal = parseInt(currentVal) || 0;
        return `
            <div class="mrp-mini-section">
                <span class="mrp-mini-section-label">${label}</span>
                <div class="mrp-mini-radius-row">
                    <input type="range" class="mrp-mini-radius-slider" data-var="${varName}" min="0" max="24" step="1" value="${numVal}">
                    <span class="mrp-mini-radius-value">${numVal}px</span>
                </div>
            </div>
        `;
    }

    function showMiniPicker(element, mapping) {
        removeMiniPicker();

        miniPicker = document.createElement('div');
        miniPicker.className = 'mrp-mini-picker';

        // Genera i controlli per ogni variabile nella mapping
        let controlsHtml = '';
        for (const v of mapping.vars) {
            switch (v.controlType) {
                case 'color-pair':
                    controlsHtml += buildColorPairControl(v.varName, v.label);
                    break;
                case 'font':
                    controlsHtml += buildFontControl(v.varName, v.label);
                    break;
                case 'radius':
                    controlsHtml += buildRadiusControl(v.varName, v.label);
                    break;
                default: // 'color'
                    controlsHtml += buildColorControl(v.varName, v.label);
                    break;
            }
        }

        miniPicker.innerHTML = `
            <div class="mrp-mini-picker-header">
                <span>${mapping.label}</span>
                <button class="mrp-mini-picker-close">&times;</button>
            </div>
            <div class="mrp-mini-picker-controls">
                ${controlsHtml}
            </div>
        `;

        // Posiziona sotto l'elemento cliccato
        const rect = element.getBoundingClientRect();
        miniPicker.style.position = 'fixed';
        miniPicker.style.zIndex = '100001';

        // Posizionamento orizzontale: cerca di non uscire dallo schermo
        const pickerWidth = 280;
        let left = rect.left;
        if (left + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 8;
        if (left < 8) left = 8;
        miniPicker.style.left = left + 'px';

        // Posizionamento verticale: sotto l'elemento, o sopra se non c'e spazio
        let top = rect.bottom + 4;
        if (top + 200 > window.innerHeight) top = Math.max(8, rect.top - 200);
        miniPicker.style.top = top + 'px';

        document.body.appendChild(miniPicker);

        // Bind: close button
        miniPicker.querySelector('.mrp-mini-picker-close').addEventListener('click', removeMiniPicker);

        // Bind: tutti i color swatch + hex
        miniPicker.querySelectorAll('.mrp-mini-swatch').forEach(swatch => {
            swatch.addEventListener('input', () => {
                const varN = swatch.dataset.var;
                setColor(varN, swatch.value);
                const hex = miniPicker.querySelector(`.mrp-mini-hex[data-var="${varN}"]`);
                if (hex) hex.value = swatch.value;
            });
        });
        miniPicker.querySelectorAll('.mrp-mini-hex').forEach(hex => {
            hex.addEventListener('input', () => {
                const raw = hex.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                    const varN = hex.dataset.var;
                    setColor(varN, raw);
                    const swatch = miniPicker.querySelector(`.mrp-mini-swatch[data-var="${varN}"]`);
                    if (swatch) swatch.value = raw;
                }
            });
        });

        // Bind: font selects
        miniPicker.querySelectorAll('.mrp-mini-font-select').forEach(sel => {
            sel.addEventListener('change', () => {
                setColor(sel.dataset.var, sel.value);
            });
        });

        // Bind: radius sliders
        miniPicker.querySelectorAll('.mrp-mini-radius-slider').forEach(slider => {
            slider.addEventListener('input', () => {
                const val = slider.value + 'px';
                setColor(slider.dataset.var, val);
                const display = slider.closest('.mrp-mini-radius-row').querySelector('.mrp-mini-radius-value');
                if (display) display.textContent = val;
            });
        });
    }

    function removeMiniPicker() {
        if (miniPicker) {
            miniPicker.remove();
            miniPicker = null;
        }
    }

    // --------------------------------------------------------
    // KEYBOARD
    // --------------------------------------------------------

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            if (miniPicker) {
                removeMiniPicker();
            } else if (panelOpen) {
                closePanel();
            }
        }
    }

    // --------------------------------------------------------
    // SAVE
    // --------------------------------------------------------

    function save() {
        const payload = {
            colorPreset: currentPreset,
            customColors,
            customLabels
        };

        updateLocalStorage();

        const base = (typeof MrpApp !== 'undefined' && MrpApp.API_BASE) ? MrpApp.API_BASE : '/api/mrp';
        fetch(base + '/user/preferences', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                showFeedback('Salvato!', 'success');
            })
            .catch(() => {
                // Salvato comunque in localStorage
                showFeedback('Salvato in locale', 'warning');
            });
    }

    function showFeedback(msg, type) {
        const el = document.getElementById('mrpThemeFeedback');
        if (!el) return;
        el.textContent = msg;
        el.className = 'mrp-theme-feedback ' + (type || '');
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, 2000);
    }

    // --------------------------------------------------------
    // RESET
    // --------------------------------------------------------

    function reset() {
        customColors = {};
        applyPreset(currentPreset === 'custom' ? 'default' : currentPreset);
    }

    // --------------------------------------------------------
    // UTILITY
    // --------------------------------------------------------

    function normalizeHex(val) {
        if (!val) return '#000000';
        val = val.trim();
        // Non processare valori non-colore (font strings, px values, ecc.)
        if (val && !val.startsWith('#') && !val.startsWith('rgb')) return val;
        // Se e' gia' #rrggbb
        if (/^#[0-9a-fA-F]{6}$/.test(val)) return val.toLowerCase();
        // Se e' #rgb → espandi
        if (/^#[0-9a-fA-F]{3}$/.test(val)) {
            return ('#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3]).toLowerCase();
        }
        // Se e' rgb(r,g,b)
        const rgbMatch = val.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        // Fallback
        return val || '#000000';
    }

    function findVarDef(varName) {
        for (const group of COLOR_GROUPS) {
            for (const v of group.vars) {
                if (v.name === varName) return v;
            }
        }
        return null;
    }

    // --------------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------------

    function getCustomColors() { return customColors; }

    // Salva dati custom (es. _columnPrefs) senza trattarli come variabili CSS
    function setCustomData(key, value) {
        customColors[key] = value;
        dirty = true;
    }

    return {
        init,
        openPanel,
        closePanel,
        save,
        reset,
        setColor,
        getCustomColors,
        setCustomData
    };

})();
