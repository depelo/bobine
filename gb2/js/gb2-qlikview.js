/**
 * QlikView Replica — Analisi per articolo
 * Cross-filtering client-side con Chart.js
 */
const QlikView = (() => {
    const MONTHS = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

    let _rawData = null;      // { articolo, movimenti[] }
    let _filters = {};        // { field: Set(values) }
    let _chartMonthly = null;
    let _chartYearly = null;

    function _resetFilters() {
        _filters = {
            years: new Set(),
            months: new Set(),
            tipo_mov: new Set(),
            serie: new Set(),
            fase: new Set(),
            a_fasi: new Set(),
            tipo_cf: new Set(),
            forn1: new Set(),
            forn2: new Set(),
            in_esaurimento: new Set(),
            gr_politica: new Set(),
            magazzino: new Set(),
            sm_a_fasi: new Set(),
            min_ord: new Set()
        };
    }

    // ── Apri modale ──
    async function open(codart) {
        if (!codart) return;
        _resetFilters();
        const overlay = document.getElementById('qvOverlay');
        if (!overlay) return;
        overlay.classList.add('open');

        // Chiudi cliccando fuori dal modale
        overlay.addEventListener('click', _onOverlayClick);

        const content = document.getElementById('qvContent');
        if (content) content.innerHTML = '<div class="qv-loading">Caricamento dati...</div>';

        try {
            const res = await fetch(`${MrpApp.API_BASE}/analisi-articolo?codart=${encodeURIComponent(codart)}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.articolo) {
                if (content) content.innerHTML = '<div class="qv-loading">Nessun dato trovato per ' + codart + '</div>';
                return;
            }
            _rawData = data;
            _render();
        } catch (err) {
            if (content) content.innerHTML = '<div class="qv-loading" style="color:var(--danger);">Errore: ' + err.message + '</div>';
        }
    }

    function _onOverlayClick(e) {
        // Chiudi solo se il click è direttamente sull'overlay (backdrop)
        if (e.target === e.currentTarget) close();
    }

    function close() {
        const overlay = document.getElementById('qvOverlay');
        if (overlay) {
            overlay.classList.remove('open');
            overlay.removeEventListener('click', _onOverlayClick);
        }
        if (_chartMonthly) { _chartMonthly.destroy(); _chartMonthly = null; }
        if (_chartYearly) { _chartYearly.destroy(); _chartYearly = null; }
        _rawData = null;
    }

    // ── Filtro dati ──
    function _getFilteredData() {
        if (!_rawData) return [];
        return _rawData.movimenti.filter(m => {
            // Parse anno e mese dalla data (formato DD/MM/YYYY)
            const parts = (m.date || '').split('/');
            const mese = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
            const anno = m.anno || (parts.length >= 3 ? parseInt(parts[2], 10) : 0);

            if (_filters.years.size > 0 && !_filters.years.has(anno)) return false;
            if (_filters.months.size > 0 && !_filters.months.has(mese)) return false;
            if (_filters.tipo_mov.size > 0 && !_filters.tipo_mov.has(m.tipo_mov)) return false;
            if (_filters.serie.size > 0 && !_filters.serie.has(m.serie)) return false;
            if (_filters.fase.size > 0 && !_filters.fase.has(m.fase)) return false;
            if (_filters.tipo_cf.size > 0 && !_filters.tipo_cf.has(m.tipo_cf)) return false;
            if (_filters.magazzino.size > 0 && !_filters.magazzino.has(m.magazzino)) return false;
            return true;
        });
    }

    function _getDistinctValues(field) {
        if (!_rawData) return [];
        const vals = new Set();
        _rawData.movimenti.forEach(m => {
            const v = m[field];
            if (v !== null && v !== undefined && v !== '') vals.add(v);
        });
        return [...vals].sort();
    }

    function _getDistinctYears() {
        if (!_rawData) return [];
        const years = new Set();
        _rawData.movimenti.forEach(m => {
            const anno = m.anno || parseInt((m.date || '').split('/')[2], 10);
            if (anno) years.add(anno);
        });
        return [...years].sort((a, b) => b - a);
    }

    // ── Toggle filtro ──
    function _toggleFilter(field, value) {
        if (!_filters[field]) _filters[field] = new Set();
        if (_filters[field].has(value)) {
            _filters[field].delete(value);
        } else {
            _filters[field].add(value);
        }
        _updateAll();
    }

    function _updateAll() {
        _renderTimeBar();
        _renderFiltersContent();
        _renderSelections();
        _renderKPI();
        _renderTable();
        _renderCharts();
    }

    // ── Render principale ──
    function _render() {
        const content = document.getElementById('qvContent');
        if (!content || !_rawData) return;

        const art = _rawData.articolo;

        content.innerHTML = `
            <div class="qv-article-info" id="qvArticleInfo">
                <div class="qv-info-cell"><div class="qv-info-label">Famiglia</div><div class="qv-info-value">${_esc(art.famiglia)}</div></div>
                <div class="qv-info-cell"><div class="qv-info-label">Codart</div><div class="qv-info-value" style="background:#4a9c4a;color:white;padding:1px 4px;">${_esc(art.codart)}</div></div>
                <div class="qv-info-cell" style="flex:1;"><div class="qv-info-label">Descrizione</div><div class="qv-info-value">${_esc(art.descrizione)}</div></div>
                <div class="qv-info-cell"><div class="qv-info-label">Sostituito</div><div class="qv-info-value">${_esc(art.sostituito || '')}</div></div>
                <div class="qv-info-cell"><div class="qv-info-label">Sostitutivo</div><div class="qv-info-value">${_esc(art.sostitutivo || '')}</div></div>
                <div class="qv-info-cell"><div class="qv-info-label">Scorta</div><div class="qv-info-value">${_fmtNum(art.scorta)}</div></div>
                <div class="qv-info-cell"><div class="qv-info-label">RRFence</div><div class="qv-info-value">${art.rrfence || 0}</div></div>
                <div class="qv-info-cell"><div class="qv-info-label">UM</div><div class="qv-info-value">${_esc(art.um)}</div></div>
            </div>
            <div class="qv-main">
                <div class="qv-filters-panel" id="qvFiltersPanel"></div>
                <div class="qv-charts-panel" id="qvChartsPanel">
                    <div style="grid-column:1/-1;display:flex;gap:4px;padding:4px;">
                        <div class="qv-selections-box" id="qvSelections" style="flex:0 0 200px;"></div>
                        <div class="qv-kpi-box" id="qvKPI" style="flex:0 0 120px;"></div>
                        <div class="qv-table-box" id="qvTableBox" style="flex:0 0 200px;"></div>
                    </div>
                    <div class="qv-chart-container" id="qvChartMonthlyBox">
                        <div class="qv-chart-title">Qt\u00e0</div>
                        <canvas id="qvChartMonthly"></canvas>
                    </div>
                    <div class="qv-chart-container qv-chart-yearly" id="qvChartYearlyBox">
                        <div class="qv-chart-title">Qt\u00e0</div>
                        <canvas id="qvChartYearly"></canvas>
                    </div>
                </div>
            </div>
        `;

        _renderTimeBar();
        _renderFiltersContent();
        _renderSelections();
        _renderKPI();
        _renderTable();
        _renderCharts();
    }

    // ── Time bar (mesi + anni) ──
    function _renderTimeBar() {
        const bar = document.getElementById('qvTimeBar');
        if (!bar) return;
        const years = _getDistinctYears();

        let html = '';
        MONTHS.forEach((m, i) => {
            const num = i + 1;
            const active = _filters.months.has(num) ? ' active' : '';
            html += `<span class="qv-month${active}" data-month="${num}">${m}</span>`;
        });
        html += '<span class="qv-separator"></span>';
        years.forEach(y => {
            const active = _filters.years.has(y) ? ' active' : '';
            html += `<span class="qv-year${active}" data-year="${y}">${y}</span>`;
        });

        bar.innerHTML = html + '<button class="qv-close-btn" id="qvCloseBtn">\u2715</button>';

        // Handlers
        bar.querySelectorAll('.qv-month').forEach(el => {
            el.addEventListener('click', () => _toggleFilter('months', parseInt(el.dataset.month, 10)));
        });
        bar.querySelectorAll('.qv-year').forEach(el => {
            el.addEventListener('click', () => _toggleFilter('years', parseInt(el.dataset.year, 10)));
        });
        const closeBtn = document.getElementById('qvCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', close);
    }

    // ── Filtri panel ──
    function _renderFiltersContent() {
        const panel = document.getElementById('qvFiltersPanel');
        if (!panel) return;

        // Layout filtri — stesso ordine di QlikView
        // Colonna 1: In_esaurimento, Gr_Politica, Tipo_mov, Fase
        // Colonna 2: Serie, A_Fasi, Tipo_C_F, Magazzino
        // Colonna 3: SM_A_fasi, Min_ord
        // Colonna 4: Forn1, Forn2
        const filterDefs = [
            { field: 'in_esaurimento', label: 'In_esaurimento', values: ['N', 'S'] },
            { field: 'gr_politica', label: 'Gr_Politica', values: ['Fabb', 'Scorta'] },
            { field: 'tipo_mov', label: 'Tipo_mov', dataField: 'tipo_mov' },
            { field: 'fase', label: 'Fase', dataField: 'fase' },
            { field: 'serie', label: 'Serie', dataField: 'serie' },
            { field: 'a_fasi', label: 'A_Fasi', values: ['N', 'S'] },
            { field: 'tipo_cf', label: 'Tipo_C_F', dataField: 'tipo_cf' },
            { field: 'magazzino', label: 'Magazzino', dataField: 'magazzino' }
        ];

        let html = '';

        filterDefs.forEach(fd => {
            const values = fd.values || _getDistinctValues(fd.dataField);
            html += _renderFilterBox(fd.field, fd.label, values);
        });

        // SM_A_fasi — valori distinti dall'articolo (campo fisso, non dai movimenti)
        const smAfasiVals = [];
        if (_rawData.articolo.sm_a_fasi !== null && _rawData.articolo.sm_a_fasi !== undefined) {
            smAfasiVals.push(_rawData.articolo.sm_a_fasi);
        }
        html += _renderFilterBox('sm_a_fasi', 'SM_A_fasi', smAfasiVals);

        // Min_ord — dall'articolo
        const minOrdVals = [];
        if (_rawData.articolo.min_ord !== null && _rawData.articolo.min_ord !== undefined) {
            minOrdVals.push(_rawData.articolo.min_ord);
        }
        html += _renderFilterBox('min_ord', 'Min_ord', minOrdVals);

        // Forn1 — valori distinti dalle ragsoc dei movimenti
        const forn1Values = new Set();
        _rawData.movimenti.forEach(m => { if (m.ragsoc) forn1Values.add(m.ragsoc); });
        html += _renderFilterBox('forn1', 'Forn1', [...forn1Values].sort());

        // Forn2 — dall'articolo (campo fisso)
        const forn2Values = [];
        if (_rawData.articolo.forn2) forn2Values.push(_rawData.articolo.forn2);
        html += _renderFilterBox('forn2', 'Forn2', forn2Values);

        panel.innerHTML = html;

        // Attach click handlers
        panel.querySelectorAll('.qv-filter-item').forEach(item => {
            item.addEventListener('click', () => {
                const field = item.dataset.field;
                let value = item.dataset.value;
                // Parse numeri se necessario
                if (['fase', 'magazzino', 'years', 'months'].includes(field)) value = parseInt(value, 10);
                _toggleFilter(field, value);
            });
        });
    }

    function _renderFilterBox(field, label, values) {
        let html = '<div class="qv-filter-box">';
        html += '<div class="qv-filter-header"><span>' + _esc(label) + '</span><span class="qv-filter-search">\uD83D\uDD0D</span></div>';
        html += '<div class="qv-filter-list">';
        values.forEach(v => {
            const selected = _filters[field] && _filters[field].has(v) ? ' selected' : '';
            html += '<div class="qv-filter-item' + selected + '" data-field="' + field + '" data-value="' + _escAttr(String(v)) + '">' + _esc(String(v)) + '</div>';
        });
        html += '</div></div>';
        return html;
    }

    // ── Selezioni correnti ──
    function _renderSelections() {
        const box = document.getElementById('qvSelections');
        if (!box) return;
        let html = '<div class="qv-selections-title">Selezioni correnti</div>';
        let hasFilters = false;

        for (const [field, values] of Object.entries(_filters)) {
            if (values.size > 0) {
                hasFilters = true;
                const label = field.charAt(0).toUpperCase() + field.slice(1);
                const valStr = [...values].join(', ');
                html += '<div class="qv-selection-row"><span class="qv-selection-dot"></span><span class="qv-selection-field">' + _esc(label) + '</span><span class="qv-selection-value">' + _esc(valStr) + '</span></div>';
            }
        }
        if (!hasFilters) html += '<div style="color:#888;font-size:0.68rem;">Nessun filtro attivo</div>';
        if (_rawData && _rawData.articolo) {
            html += '<div class="qv-selection-row"><span class="qv-selection-dot"></span><span class="qv-selection-field">Codart</span><span class="qv-selection-value">' + _esc(_rawData.articolo.codart) + '</span></div>';
        }
        box.innerHTML = html;
    }

    // ── KPI ──
    function _renderKPI() {
        const box = document.getElementById('qvKPI');
        if (!box) return;
        const data = _getFilteredData();
        const totalQta = data.reduce((s, m) => s + (Number(m.qta) || 0), 0);
        const numMovimenti = data.length;
        const media = numMovimenti > 0 ? (totalQta / numMovimenti) : 0;

        box.innerHTML = '<div class="qv-kpi-label">Media per scarico</div><div class="qv-kpi-value">' + _fmtNum(media, 1) + '</div>';
    }

    // ── Tabella Qtà ──
    function _renderTable() {
        const box = document.getElementById('qvTableBox');
        if (!box) return;
        const data = _getFilteredData();

        // Raggruppa per anno
        const byYear = {};
        data.forEach(m => {
            const anno = m.anno || parseInt((m.date || '').split('/')[2], 10);
            if (!anno) return;
            if (!byYear[anno]) byYear[anno] = { qta: 0, count: 0, um: '' };
            byYear[anno].qta += Number(m.qta) || 0;
            byYear[anno].count++;
        });
        // UM dall'articolo
        const um = _rawData ? (_rawData.articolo.um || '') : '';

        const years = Object.keys(byYear).sort((a, b) => a - b);
        let totalQta = 0, totalCount = 0;

        let html = '<div class="qv-table-title">Qt\u00e0</div>';
        html += '<table class="qv-table"><thead><tr><th>Year</th><th>\u25CF</th><th>UM</th><th class="num">Qt\u00e0</th><th class="num">Numero</th></tr></thead><tbody>';
        years.forEach(y => {
            const row = byYear[y];
            totalQta += row.qta;
            totalCount += row.count;
            html += '<tr><td>' + y + '</td><td>\u25A2</td><td>' + _esc(um) + '</td><td class="num">' + _fmtNum(row.qta, 1) + '</td><td class="num">' + row.count + '</td></tr>';
        });
        html += '<tr class="total"><td>Totale</td><td></td><td></td><td class="num">' + _fmtNum(totalQta, 1) + '</td><td class="num">' + totalCount + '</td></tr>';
        html += '</tbody></table>';
        box.innerHTML = html;
    }

    // ── Grafici ──
    function _renderCharts() {
        _renderChartMonthly();
        _renderChartYearly();
    }

    function _renderChartMonthly() {
        const canvas = document.getElementById('qvChartMonthly');
        if (!canvas) return;
        if (_chartMonthly) { _chartMonthly.destroy(); _chartMonthly = null; }

        const data = _getFilteredData();
        const byMonth = {};
        data.forEach(m => {
            const parts = (m.date || '').split('/');
            const mese = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
            if (mese >= 1 && mese <= 12) {
                byMonth[mese] = (byMonth[mese] || 0) + (Number(m.qta) || 0);
            }
        });

        const labels = [];
        const values = [];
        for (let i = 1; i <= 12; i++) {
            labels.push(String(i).padStart(2, '0'));
            values.push(byMonth[i] || 0);
        }

        _chartMonthly = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Qt\u00e0',
                    data: values,
                    backgroundColor: '#a8c4e0',
                    borderColor: '#7ba3c9',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false }
                },
                scales: {
                    x: { title: { display: true, text: 'Month (#)' }, grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' } }
                }
            }
        });
    }

    function _renderChartYearly() {
        const canvas = document.getElementById('qvChartYearly');
        if (!canvas) return;
        if (_chartYearly) { _chartYearly.destroy(); _chartYearly = null; }

        const data = _getFilteredData();
        const byYear = {};
        data.forEach(m => {
            const anno = m.anno || parseInt((m.date || '').split('/')[2], 10);
            if (anno) byYear[anno] = (byYear[anno] || 0) + (Number(m.qta) || 0);
        });

        const years = Object.keys(byYear).sort();
        const values = years.map(y => byYear[y]);

        _chartYearly = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: years,
                datasets: [{
                    label: 'Qt\u00e0',
                    data: values,
                    backgroundColor: '#a8c4e0',
                    borderColor: '#7ba3c9',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false }
                },
                scales: {
                    x: { title: { display: true, text: 'Anno' }, grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' } }
                }
            }
        });
    }

    // ── Helpers ──
    function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function _escAttr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _fmtNum(n, dec) {
        if (n === null || n === undefined) return '';
        return Number(n).toLocaleString('it-IT', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
    }

    return { open, close };
})();
