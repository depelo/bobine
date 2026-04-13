/**
 * ColumnManager — Personalizzazione colonne tabelle GB2
 * Menu contestuale, colori colonna, nascondi/mostra, riordinamento.
 * Persistenza in MrpTheme customColors._columnPrefs.
 */
const ColumnManager = (() => {
    // ── Palette colori colonna (8 colori tenui + trasparente) ──
    const PALETTE = [
        { color: '#3b82f614', label: 'Azzurro' },
        { color: '#16a34a14', label: 'Verde' },
        { color: '#eab30814', label: 'Giallo' },
        { color: '#f9731614', label: 'Arancione' },
        { color: '#ec489914', label: 'Rosa' },
        { color: '#8b5cf614', label: 'Viola' },
        { color: '#6b728014', label: 'Grigio' },
        { color: 'transparent', label: 'Nessuno' }
    ];

    // ── Registry colonne per ogni tabella ──
    const REGISTRY = {
        ordini_impegni: [
            { id: '_drill', label: '', sortable: false, fixed: true },
            { id: 'desc_tipo', label: 'Operazione', sortable: true },
            { id: 'mo_anno', label: 'Anno', sortable: true },
            { id: 'mo_serie', label: 'Ser', sortable: true },
            { id: 'mo_numord', label: 'Num.Doc', sortable: true },
            { id: 'mo_riga', label: 'Riga', sortable: true },
            { id: 'mo_magaz', label: 'Mag', sortable: true },
            { id: 'mo_fase', label: 'Fase', sortable: true },
            { id: 'mo_datcons', label: 'Data Cons.', sortable: true },
            { id: 'mo_quant', label: 'Q.t\u00e0 Ordinata', sortable: true },
            { id: 'mo_quaeva', label: 'Q.t\u00e0 Evasa', sortable: true },
            { id: 'mo_flevas', label: 'Stato', sortable: true },
            { id: 'fornitore', label: 'Fornitore', sortable: true }
        ],
        rmp: [
            { id: 'ol_magaz', label: 'Mag', sortable: true },
            { id: 'ol_fase', label: 'Fase', sortable: true },
            { id: 'ol_datcons', label: 'Data Cons.', sortable: true },
            { id: 'desc_tipo', label: 'Operazione', sortable: true },
            { id: 'quantita', label: 'Q.t\u00e0 Ordinata', sortable: true },
            { id: 'conf_gen', label: 'Stato', sortable: true },
            { id: 'fornitore', label: 'Fornitore', sortable: true }
        ],
        drill_padre: [
            { id: '_empty', label: '', sortable: false, fixed: true },
            { id: 'padre_desc_tipo', label: 'Operazione', sortable: true },
            { id: 'padre_anno', label: 'Anno', sortable: true },
            { id: 'padre_serie', label: 'Ser', sortable: true },
            { id: 'padre_numord', label: 'Num.Doc', sortable: true },
            { id: 'padre_riga', label: 'Riga', sortable: true },
            { id: 'padre_codart', label: 'Cod. Art. Padre', sortable: true },
            { id: 'padre_descr', label: 'Descrizione', sortable: true },
            { id: 'padre_magaz', label: 'Mag', sortable: true },
            { id: 'padre_fase', label: 'Fase', sortable: true },
            { id: 'padre_datcons', label: 'Data Cons.', sortable: true },
            { id: 'padre_quant', label: 'Q.t\u00e0', sortable: true },
            { id: 'padre_fornitore', label: 'Fornitore', sortable: true }
        ],
        progressivi: [
            { id: '_row', label: '#', sortable: false, fixed: true },
            { id: 'parte', label: 'Parte', sortable: false },
            { id: 'magaz', label: 'Mag', sortable: false },
            { id: 'fase', label: 'Fase', sortable: false },
            { id: 'politica', label: 'Politica Riordino', sortable: false },
            { id: 'um', label: 'UM', sortable: false },
            { id: 'esistenza', label: 'Utilizzo Esistenza', sortable: false },
            { id: 'ordinato', label: 'Ordin.', sortable: false },
            { id: 'impegnato', label: 'Impegn.', sortable: false },
            { id: 'disponibilita', label: 'Dispon.', sortable: false },
            { id: 'dataCons', label: 'Data Cons', sortable: false },
            { id: 'opc', label: 'Or.P/F.Co', sortable: false },
            { id: 'op', label: 'Or.P/F.Ge', sortable: false },
            { id: 'ipc', label: 'Ip.Pr.Co', sortable: false },
            { id: 'ip', label: 'Ip.Pr.Ge', sortable: false },
            { id: 'dispNetta', label: 'Disp.Netta', sortable: false }
        ],
        drill_padre_rmp: [
            { id: 'padre_codart', label: 'Cod. Art.', sortable: true },
            { id: 'padre_magaz', label: 'Mag', sortable: true },
            { id: 'padre_fase', label: 'Fase', sortable: true },
            { id: 'padre_descr', label: 'Descrizione', sortable: true },
            { id: 'datcons', label: 'Data Cons.', sortable: true },
            { id: 'padre_desc_tipo', label: 'Operazione', sortable: true },
            { id: 'quantita', label: 'Q.t\u00e0 Ordinata', sortable: true },
            { id: 'padre_conf_gen', label: 'Stato', sortable: true },
            { id: 'padre_fornitore', label: 'Fornitore', sortable: true }
        ]
    };

    let _prefs = {}; // { tableId: { order:[], hidden:[], colors:{}, sort:{} } }

    // ── Load/Save ──
    function load() {
        if (typeof MrpTheme !== 'undefined' && MrpTheme.getCustomColors) {
            const cc = MrpTheme.getCustomColors();
            _prefs = (cc && cc._columnPrefs) ? JSON.parse(JSON.stringify(cc._columnPrefs)) : {};
        }
    }

    function save() {
        if (typeof MrpTheme !== 'undefined' && MrpTheme.setCustomData) {
            MrpTheme.setCustomData('_columnPrefs', JSON.parse(JSON.stringify(_prefs)));
            MrpTheme.save();
        }
    }

    function _getPrefs(tableId) {
        if (!_prefs[tableId]) _prefs[tableId] = { order: [], hidden: [], colors: {}, textColors: {}, sort: {} };
        return _prefs[tableId];
    }

    // ── Column order ──
    function getOrderedColumns(tableId) {
        const reg = REGISTRY[tableId];
        if (!reg) return [];
        const prefs = _getPrefs(tableId);
        if (!prefs.order || !prefs.order.length) return reg.slice();
        // Reorder according to prefs, fallback to registry order for missing
        const ordered = [];
        prefs.order.forEach(id => {
            const col = reg.find(c => c.id === id);
            if (col) ordered.push(col);
        });
        // Add any columns not in prefs (new columns added after prefs were saved)
        reg.forEach(c => { if (!ordered.find(o => o.id === c.id)) ordered.push(c); });
        return ordered;
    }

    function isHidden(tableId, colId) {
        const prefs = _getPrefs(tableId);
        return prefs.hidden && prefs.hidden.includes(colId);
    }

    function getColor(tableId, colId) {
        const prefs = _getPrefs(tableId);
        return (prefs.colors && prefs.colors[colId]) || '';
    }

    function getTextColor(tableId, colId) {
        const prefs = _getPrefs(tableId);
        return (prefs.textColors && prefs.textColors[colId]) || '';
    }

    // ── Build header ──
    function buildHeader(tableId, theadTr) {
        if (!theadTr) return;
        const cols = getOrderedColumns(tableId);
        const prefs = _getPrefs(tableId);
        const sortCol = prefs.sort ? prefs.sort.col : null;
        const sortAsc = prefs.sort ? prefs.sort.asc : true;

        theadTr.innerHTML = '';
        cols.forEach(col => {
            if (isHidden(tableId, col.id)) return;
            const th = document.createElement('th');
            th.dataset.col = col.id;
            th.dataset.table = tableId;
            if (col.sortable) {
                th.style.cursor = 'pointer';
                const arrow = (sortCol === col.id) ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';
                th.textContent = col.label + arrow;
            } else {
                th.textContent = col.label;
                if (col.id === '_drill' || col.id === '_empty') th.style.width = '30px';
            }
            // Non colorare l'intestazione — solo il body

            // Click sinistro = ordina (se sortable)
            if (col.sortable) {
                th.addEventListener('click', (e) => {
                    if (e.button !== 0) return;
                    _handleSort(tableId, col.id);
                });
            }
            // Click destro = menu contestuale
            th.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, tableId, col.id);
            });

            theadTr.appendChild(th);
        });
    }

    // ── Apply column prefs to rendered tbody ──
    function applyToBody(tableId, tbody) {
        if (!tbody) return;
        const cols = getOrderedColumns(tableId);
        tbody.querySelectorAll('tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            let visIdx = 0;
            cols.forEach(col => {
                if (isHidden(tableId, col.id)) return;
                const td = tds[visIdx];
                if (td) {
                    const bgColor = getColor(tableId, col.id);
                    if (bgColor && bgColor !== 'transparent') {
                        td.style.backgroundColor = bgColor;
                    }
                    const txtColor = getTextColor(tableId, col.id);
                    if (txtColor) {
                        td.style.color = txtColor;
                    }
                }
                visIdx++;
            });
        });
    }

    // ── Sort handler ──
    let _sortCallback = null;
    function setSortCallback(fn) { _sortCallback = fn; }

    function _handleSort(tableId, colId) {
        const prefs = _getPrefs(tableId);
        if (prefs.sort && prefs.sort.col === colId) {
            prefs.sort.asc = !prefs.sort.asc;
        } else {
            prefs.sort = { col: colId, asc: true };
        }
        save();
        if (_sortCallback) _sortCallback(tableId, colId, prefs.sort.asc);
    }

    // ── Context menu ──
    let _activeMenu = null;

    function _closeMenu() {
        if (_activeMenu) { _activeMenu.remove(); _activeMenu = null; }
    }

    function showContextMenu(e, tableId, colId) {
        _closeMenu();
        const reg = REGISTRY[tableId];
        if (!reg) return;
        const col = reg.find(c => c.id === colId);
        if (!col || col.fixed) return;

        const menu = document.createElement('div');
        menu.className = 'col-context-menu';

        // Titolo
        const title = document.createElement('div');
        title.className = 'col-context-title';
        title.textContent = '\uD83D\uDCCA ' + col.label;
        menu.appendChild(title);

        // Ordina
        if (col.sortable) {
            const sortAsc = document.createElement('div');
            sortAsc.className = 'col-context-item';
            sortAsc.innerHTML = '\u25B2 Ordina crescente';
            sortAsc.addEventListener('click', () => { _getPrefs(tableId).sort = { col: colId, asc: true }; save(); if (_sortCallback) _sortCallback(tableId, colId, true); _closeMenu(); });
            menu.appendChild(sortAsc);

            const sortDesc = document.createElement('div');
            sortDesc.className = 'col-context-item';
            sortDesc.innerHTML = '\u25BC Ordina decrescente';
            sortDesc.addEventListener('click', () => { _getPrefs(tableId).sort = { col: colId, asc: false }; save(); if (_sortCallback) _sortCallback(tableId, colId, false); _closeMenu(); });
            menu.appendChild(sortDesc);

            menu.appendChild(_sep());
        }

        // Colore
        const colorLabel = document.createElement('div');
        colorLabel.className = 'col-context-item';
        colorLabel.style.pointerEvents = 'none';
        colorLabel.innerHTML = '\uD83C\uDFA8 Colore colonna';
        menu.appendChild(colorLabel);

        const palette = document.createElement('div');
        palette.className = 'col-context-palette';
        const currentColor = getColor(tableId, colId);
        PALETTE.forEach(p => {
            const sw = document.createElement('div');
            sw.className = 'col-context-swatch' + ((currentColor === p.color || (!currentColor && p.color === 'transparent')) ? ' active' : '');
            sw.style.background = p.color === 'transparent' ? 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50% / 8px 8px' : p.color.replace('14', 'aa');
            sw.title = p.label;
            sw.addEventListener('click', () => {
                const prefs = _getPrefs(tableId);
                if (!prefs.colors) prefs.colors = {};
                if (p.color === 'transparent') { delete prefs.colors[colId]; } else { prefs.colors[colId] = p.color; }
                save();
                _refreshTable(tableId);
                _closeMenu();
            });
            palette.appendChild(sw);
        });
        menu.appendChild(palette);

        // Colore testo
        const TEXT_PALETTE = [
            { color: '#000000', label: 'Nero' },
            { color: '#1e293b', label: 'Grigio scuro' },
            { color: '#ffffff', label: 'Bianco' },
            { color: '#1d4ed8', label: 'Blu' },
            { color: '#15803d', label: 'Verde' },
            { color: '#b91c1c', label: 'Rosso' },
            { color: '#92400e', label: 'Marrone' },
            { color: '', label: 'Default' }
        ];
        const textLabel = document.createElement('div');
        textLabel.className = 'col-context-item';
        textLabel.style.pointerEvents = 'none';
        textLabel.style.fontSize = '0.75rem';
        textLabel.style.color = 'var(--text-muted)';
        textLabel.innerHTML = 'Colore testo';
        menu.appendChild(textLabel);

        const textPalette = document.createElement('div');
        textPalette.className = 'col-context-palette';
        const currentTextColor = getTextColor(tableId, colId);
        TEXT_PALETTE.forEach(p => {
            const sw = document.createElement('div');
            sw.className = 'col-context-swatch' + ((currentTextColor === p.color || (!currentTextColor && !p.color)) ? ' active' : '');
            sw.style.background = p.color || 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50% / 8px 8px';
            sw.title = p.label;
            sw.addEventListener('click', () => {
                const prefs = _getPrefs(tableId);
                if (!prefs.textColors) prefs.textColors = {};
                if (!p.color) { delete prefs.textColors[colId]; } else { prefs.textColors[colId] = p.color; }
                save();
                _refreshTable(tableId);
                _closeMenu();
            });
            textPalette.appendChild(sw);
        });
        menu.appendChild(textPalette);

        menu.appendChild(_sep());

        // Nascondi
        const hideItem = document.createElement('div');
        hideItem.className = 'col-context-item';
        hideItem.innerHTML = '\uD83D\uDC41 Nascondi colonna';
        hideItem.addEventListener('click', () => {
            const prefs = _getPrefs(tableId);
            if (!prefs.hidden) prefs.hidden = [];
            if (!prefs.hidden.includes(colId)) prefs.hidden.push(colId);
            save();
            _refreshTable(tableId);
            _closeMenu();
        });
        menu.appendChild(hideItem);

        // Posizionamento
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        let x = e.clientX, y = e.clientY;
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        _activeMenu = menu;

        // Click fuori chiude
        setTimeout(() => {
            document.addEventListener('click', _closeMenu, { once: true });
        }, 10);
    }

    function _sep() {
        const s = document.createElement('div');
        s.className = 'col-context-separator';
        return s;
    }

    function _moveColumn(tableId, colId, direction) {
        const prefs = _getPrefs(tableId);
        const reg = REGISTRY[tableId];
        if (!reg) return;
        // Ensure order array is populated
        if (!prefs.order || !prefs.order.length) {
            prefs.order = reg.map(c => c.id);
        }
        const idx = prefs.order.indexOf(colId);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= prefs.order.length) return;
        // Swap
        [prefs.order[idx], prefs.order[newIdx]] = [prefs.order[newIdx], prefs.order[idx]];
        save();
        _refreshTable(tableId);
    }

    // ── Unhide ──
    function unhideColumn(tableId, colId) {
        const prefs = _getPrefs(tableId);
        if (prefs.hidden) prefs.hidden = prefs.hidden.filter(h => h !== colId);
        save();
        _refreshTable(tableId);
    }

    function getHiddenColumns(tableId) {
        const prefs = _getPrefs(tableId);
        const reg = REGISTRY[tableId] || [];
        return (prefs.hidden || []).map(id => {
            const col = reg.find(c => c.id === id);
            return col ? { id, label: col.label } : { id, label: id };
        });
    }

    // ── Refresh callback ──
    let _refreshCallback = null;
    function setRefreshCallback(fn) { _refreshCallback = fn; }
    function _refreshTable(tableId) { if (_refreshCallback) _refreshCallback(tableId); }

    // ── Init ──
    function init() { load(); }

    return {
        init, load, save,
        REGISTRY,
        getOrderedColumns, isHidden, getColor, getHiddenColumns,
        buildHeader, applyToBody,
        showContextMenu, setSortCallback, setRefreshCallback,
        unhideColumn
    };
})();
