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
        }
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
            '--mrp-row-generale-totale': '#000000'
        }
    };

    // --------------------------------------------------------
    // CLASS → CSS VARIABLE mapping (per click contestuale)
    // --------------------------------------------------------

    const CLASS_TO_VAR = {
        'row-padre': '--row-padre',
        'row-magazzino': '--row-magazzino',
        'mrp-row-totale': '--row-totale',
        'row-figlio': '--row-figlio',
        'row-figlio-alt': '--row-figlio-alt',
        'row-esaurito': '--row-esaurito',
        'mrp-row-totale-cross': '--mrp-row-totale-cross',
        'mrp-row-generale-totale': '--mrp-row-generale-totale',
        'mrp-blocco-esaurimento': '--mrp-blocco-esaurimento',
        'mrp-blocco-sostitutivo': '--mrp-blocco-sostitutivo',
        'mrp-blocco-combinato': '--mrp-blocco-combinato',
        // Righe modali
        'modal-row-impprod': '--row-esaurito',
        'modal-row-ordprod': '--row-totale',
        'modal-row-ordforn': '--bg-content'
    };

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
                row.className = 'mrp-theme-row';
                row.dataset.varName = v.name;

                row.innerHTML = `
                    <span class="mrp-theme-label" title="${v.name} — doppio click per rinominare">${displayLabel}</span>
                    <div class="mrp-theme-swatch-wrap">
                        <input type="color" class="mrp-theme-swatch" value="${normalizeHex(val)}" data-var="${v.name}">
                    </div>
                    <input type="text" class="mrp-theme-hex" value="${normalizeHex(val)}" data-var="${v.name}" maxlength="7" spellcheck="false">
                    <button class="mrp-theme-row-reset" data-var="${v.name}" title="Ripristina default">&circlearrowright;</button>
                `;

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

                // Swatch change
                row.querySelector('.mrp-theme-swatch').addEventListener('input', (e) => {
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
                        row.querySelector('.mrp-theme-swatch').value = raw;
                        dirty = true;
                    }
                });

                // Row reset
                row.querySelector('.mrp-theme-row-reset').addEventListener('click', () => {
                    delete customColors[v.name];
                    document.documentElement.style.removeProperty(v.name);
                    if (currentPreset !== 'custom' && PRESETS[currentPreset] && PRESETS[currentPreset][v.name]) {
                        document.documentElement.style.setProperty(v.name, PRESETS[currentPreset][v.name]);
                    }
                    const defVal = getResetValue(v.name);
                    row.querySelector('.mrp-theme-swatch').value = normalizeHex(defVal);
                    hexInput.value = normalizeHex(defVal);
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
        const row = document.querySelector(`.mrp-theme-row[data-var-name="${varName}"]`);
        if (!row) {
            // Alternativa: cerca tramite data-var sugli input
            const swatch = document.querySelector(`.mrp-theme-swatch[data-var="${varName}"]`);
            const hex = document.querySelector(`.mrp-theme-hex[data-var="${varName}"]`);
            if (swatch) swatch.value = normalizeHex(value);
            if (hex) hex.value = normalizeHex(value);
            return;
        }
        const swatch = row.querySelector('.mrp-theme-swatch');
        const hex = row.querySelector('.mrp-theme-hex');
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

        // Cerca tr, th, header, o elementi modale con colore noto
        const tr = e.target.closest('tr') || e.target.closest('th');
        const modalRow = e.target.closest('.modal-row-impprod, .modal-row-ordprod, .modal-row-ordforn');
        const header = e.target.closest('.mrp-header');

        const target = tr || modalRow || header;
        if (!target) {
            removeMiniPicker();
            return;
        }

        // Header → variabile --header-bg
        if (header) {
            e.preventDefault();
            e.stopImmediatePropagation();
            showMiniPicker(header, '--header-bg', 'mrp-header');
            return;
        }

        // Cerca match classe → variabile
        let matchedVar = null;
        let matchedClass = null;
        for (const cls of Object.keys(CLASS_TO_VAR)) {
            if (target.classList.contains(cls)) {
                matchedVar = CLASS_TO_VAR[cls];
                matchedClass = cls;
                break;
            }
        }

        if (!matchedVar) {
            const classList = Array.from(target.classList);
            for (const cls of Object.keys(CLASS_TO_VAR)) {
                if (classList.some(c => c.includes(cls))) {
                    matchedVar = CLASS_TO_VAR[cls];
                    matchedClass = cls;
                    break;
                }
            }
        }

        if (!matchedVar) {
            // In edit mode, blocca comunque la propagazione per evitare azioni indesiderate
            e.preventDefault();
            e.stopImmediatePropagation();
            removeMiniPicker();
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        showMiniPicker(target, matchedVar, matchedClass);
    }

    function showMiniPicker(element, varName, className) {
        removeMiniPicker();

        const varDef = findVarDef(varName);
        const label = varDef ? varDef.label : varName;
        const currentVal = getCurrentValue(varName);

        // Controlla se esiste una variabile testo associata (es. --row-padre → --row-padre-text)
        const textVarName = varName + '-text';
        const textVarDef = findVarDef(textVarName);
        const hasTextVar = !!textVarDef;
        const currentTextVal = hasTextVar ? getCurrentValue(textVarName) : null;

        miniPicker = document.createElement('div');
        miniPicker.className = 'mrp-mini-picker';
        miniPicker.dataset.varName = varName;

        let textRowHtml = '';
        if (hasTextVar) {
            textRowHtml = `
                <div class="mrp-mini-picker-body" style="margin-top:6px;">
                    <span style="font-size:0.75rem;font-weight:600;color:var(--text-muted);min-width:40px;">Testo</span>
                    <input type="color" class="mrp-mini-swatch mrp-mini-swatch-text" value="${normalizeHex(currentTextVal)}">
                    <input type="text" class="mrp-mini-hex mrp-mini-hex-text" value="${normalizeHex(currentTextVal)}" maxlength="7" spellcheck="false">
                </div>
            `;
        }

        miniPicker.innerHTML = `
            <div class="mrp-mini-picker-header">
                <span>${label}</span>
                <button class="mrp-mini-picker-close">&times;</button>
            </div>
            <div class="mrp-mini-picker-body">
                ${hasTextVar ? '<span style="font-size:0.75rem;font-weight:600;color:var(--text-muted);min-width:40px;">Sfondo</span>' : ''}
                <input type="color" class="mrp-mini-swatch" value="${normalizeHex(currentVal)}">
                <input type="text" class="mrp-mini-hex" value="${normalizeHex(currentVal)}" maxlength="7" spellcheck="false">
            </div>
            ${textRowHtml}
        `;

        // Posiziona sotto l'elemento cliccato
        const rect = element.getBoundingClientRect();
        miniPicker.style.position = 'fixed';
        miniPicker.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
        miniPicker.style.top = (rect.bottom + 4) + 'px';
        miniPicker.style.zIndex = '100001';

        document.body.appendChild(miniPicker);

        // Bind eventi
        miniPicker.querySelector('.mrp-mini-picker-close').addEventListener('click', removeMiniPicker);

        // Sfondo
        miniPicker.querySelector('.mrp-mini-swatch').addEventListener('input', (e) => {
            const color = e.target.value;
            setColor(varName, color);
            miniPicker.querySelector('.mrp-mini-hex').value = color;
        });

        const hexInput = miniPicker.querySelector('.mrp-mini-hex');
        hexInput.addEventListener('input', () => {
            const raw = hexInput.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                setColor(varName, raw);
                miniPicker.querySelector('.mrp-mini-swatch').value = raw;
            }
        });

        // Testo (se presente)
        if (hasTextVar) {
            miniPicker.querySelector('.mrp-mini-swatch-text').addEventListener('input', (e) => {
                const color = e.target.value;
                setColor(textVarName, color);
                miniPicker.querySelector('.mrp-mini-hex-text').value = color;
            });

            const textHexInput = miniPicker.querySelector('.mrp-mini-hex-text');
            textHexInput.addEventListener('input', () => {
                const raw = textHexInput.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
                    setColor(textVarName, raw);
                    miniPicker.querySelector('.mrp-mini-swatch-text').value = raw;
                }
            });
        }
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

    return {
        init,
        openPanel,
        closePanel,
        save,
        reset
    };

})();
