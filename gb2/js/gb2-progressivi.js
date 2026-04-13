/**
 * MRP Progressivi — Matrioska: tabella principale + box nidificato (MRP + BOM ricorsivo).
 */
const MrpProgressivi = (() => {

    const expandFetched = {};
    let splitSostData = null;

    // ── Breadcrumb navigazione articoli ──
    let _navStack = []; // [{ codart, descr }]

    const MRP_COL_COUNT = 14;

    // Stato interno modale ordini
    let currentModalContext = null; // { codart, magaz, fase, descMagazzino }
    let consumiChartInstance = null;
    let consumiMarathonController = null;
    let currentCodartConsumi = null;
    const consumiCache = {};
    const granLevels = ['anno', 'semestre', 'trimestre', 'mese', 'settimana', 'giorno'];
    const BI_PALETTE = [
        '#2563a8', '#f59e0b', '#16a34a', '#e11d48', '#8b5cf6', '#0ea5e9', '#d946ef', '#f97316',
        '#14b8a6', '#6366f1', '#84cc16', '#ef4444', '#3b82f6', '#f43f5e', '#10b981', '#a855f7',
        '#06b6d4', '#ec4899', '#22c55e', '#64748b', '#0f766e', '#be123c', '#4338ca', '#b45309',
        '#15803d', '#a21caf', '#1d4ed8', '#c2410c', '#047857', '#6d28d9', '#0369a1', '#be185d'
    ];

    let biState = {
        granularity: 'anno',
        filter: null,
        isYoY: false,
        selectedYears: new Set(),
        chartKeysMap: [],
        yearColors: {}
    };

    function hexToRgba(hex, alpha) {
        if (!hex || !/^#[0-9A-Fa-f]{6}$/i.test(hex)) return `rgba(37,99,168,${alpha})`;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function getTbody() {
        return document.getElementById('tblProgressiviBody');
    }

    function getColspan() {
        return document.querySelectorAll('#tblProgressivi thead th').length || 16;
    }

    function init() {
        // Inizializza ColumnManager per la personalizzazione colonne
        if (typeof ColumnManager !== 'undefined') {
            ColumnManager.init();
            ColumnManager.setSortCallback((tableId, col, asc) => {
                _ordiniModaleSortCol = col;
                _ordiniModaleSortAsc = asc;
                if (_ordiniModaleData.length > 0 && _currentRenderFn) {
                    const sorted = _sortData(_ordiniModaleData, col, asc);
                    _currentRenderFn(sorted);
                    // Rigenera header per aggiornare freccia
                    const thead = document.querySelector('#tblModalOrdini thead tr');
                    if (thead && _currentTableId) ColumnManager.buildHeader(_currentTableId, thead);
                    if (_currentTableId) ColumnManager.applyToBody(_currentTableId, document.getElementById('modalOrdiniBody'));
                }
            });
            ColumnManager.setRefreshCallback((tableId) => {
                // Rigenera header + body con le preferenze aggiornate
                const thead = document.querySelector('#tblModalOrdini thead tr');
                if (thead) ColumnManager.buildHeader(tableId, thead);
                if (_ordiniModaleData.length > 0 && _currentRenderFn) {
                    _currentRenderFn(_ordiniModaleData);
                    ColumnManager.applyToBody(tableId, document.getElementById('modalOrdiniBody'));
                }
                _updateHiddenColsBtn(tableId);
            });
        }

        document.getElementById('btnBackToParams').addEventListener('click', () => {
            MrpApp.state.propostaCorrente = null;
            MrpApp.switchView('parametri');
        });

        // Pannello decisionale ordine
        const btnConferma = document.getElementById('btnConfermaOrdine');
        const btnEscludi = document.getElementById('btnEscludiOrdine');
        const btnSkip = document.getElementById('btnSkipOrdine');
        const inputQtaDec = document.getElementById('decisioneQta');

        if (btnConferma) btnConferma.addEventListener('click', confermaOrdineHandler);
        if (btnEscludi) btnEscludi.addEventListener('click', escludiOrdineHandler);
        if (btnSkip) btnSkip.addEventListener('click', skipOrdineHandler);
        if (inputQtaDec) inputQtaDec.addEventListener('input', aggiornaValoreDecisione);

        document.getElementById('btnRefresh').addEventListener('click', async () => {
            Object.keys(expandFetched).forEach(k => delete expandFetched[k]);
            if (MrpApp.state.ultimoRisultato) {
                const p = MrpApp.state.parametri;
                try {
                    const res = await fetch(`${MrpApp.API_BASE}/progressivi?${new URLSearchParams(p)}`, { credentials: 'include' });
                    const data = await res.json();
                    if (res.ok) {
                        MrpApp.state.ultimoRisultato = data;
                        _resetBreadcrumb(); // Nuova ricerca — reset navigazione
                        render(data);
                    }
                } catch (err) { console.error('[Progressivi] Errore refresh:', err); }
            }
        });

        document.getElementById('modalOrdiniClose').addEventListener('click', chiudiModale);
        document.getElementById('modalOrdiniOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) chiudiModale();
        });

        const modalConsumiClose = document.getElementById('modalConsumiClose');
        const modalConsumiOverlay = document.getElementById('modalConsumiOverlay');
        if (modalConsumiClose) {
            modalConsumiClose.addEventListener('click', chiudiModaleConsumi);
        }
        if (modalConsumiOverlay) {
            modalConsumiOverlay.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) chiudiModaleConsumi();
            });
        }

        const biConfrontoYoY = document.getElementById('biConfrontoYoY');
        if (biConfrontoYoY) biConfrontoYoY.addEventListener('change', onBiConfrontoYoYChange);
        const biGranularita = document.getElementById('biGranularita');
        if (biGranularita) biGranularita.addEventListener('change', onBiGranularitaChange);
        const chartConsumi = document.getElementById('chartConsumi');
        if (chartConsumi) chartConsumi.addEventListener('wheel', onConsumiOlapWheel, { passive: false });

        const btnCopy = document.getElementById('btn-copy-tree');
        if (btnCopy) {
            btnCopy.addEventListener('click', exportTreeToClipboard);
        }

        const tbl = document.getElementById('tblProgressivi');
        if (tbl) {
            tbl.addEventListener('click', onTableClick);
        }

        const splitMrpTable = document.querySelector('#viewContainerSplit .matrioska-table');
        if (splitMrpTable) {
            splitMrpTable.addEventListener('click', onTableClick);
        }

        const btnViewMatrioska = document.getElementById('btnViewMatrioska');
        const btnViewSplit = document.getElementById('btnViewSplit');
        const viewContainerMatrioska = document.getElementById('viewContainerMatrioska');
        const viewContainerSplit = document.getElementById('viewContainerSplit');

        if (btnViewMatrioska && btnViewSplit) {
            btnViewMatrioska.addEventListener('click', () => {
                btnViewMatrioska.classList.add('active');
                btnViewMatrioska.style.background = 'var(--primary)';
                btnViewMatrioska.style.color = 'white';
                
                btnViewSplit.classList.remove('active');
                btnViewSplit.style.background = 'transparent';
                btnViewSplit.style.color = 'var(--text)';

                viewContainerMatrioska.style.display = 'block';
                viewContainerSplit.style.display = 'none';
            });
            btnViewSplit.addEventListener('click', () => {
                btnViewSplit.classList.add('active');
                btnViewSplit.style.background = 'var(--primary)';
                btnViewSplit.style.color = 'white';
                
                btnViewMatrioska.classList.remove('active');
                btnViewMatrioska.style.background = 'transparent';
                btnViewMatrioska.style.color = 'var(--text)';

                viewContainerMatrioska.style.display = 'none';
                viewContainerSplit.style.display = 'flex';
            });
        }

        const chkScaduti = document.getElementById('chkShowScaduti');
        if (chkScaduti) {
            chkScaduti.addEventListener('change', (e) => {
                if (e.target.checked) {
                    document.body.classList.add('show-scaduti');
                } else {
                    document.body.classList.remove('show-scaduti');
                    document.querySelectorAll('.row-scaduto').forEach(tr => {
                        const btnM = tr.querySelector('.toggle-matrioska');
                        if (btnM && btnM.textContent.includes('Chiudi')) {
                            handleToggleMatrioska(btnM);
                        }
                        const nested = tr.nextElementSibling;
                        if (nested && nested.classList.contains('matrioska-nested-row')) {
                            nested.style.display = 'none';
                        }
                    });
                }
            });
        }

        // --- MODALE: Drill-through su bottone 🔍 Imp.Prod ---
        const tblModal = document.getElementById('tblModalOrdini');
        if (tblModal) {
            tblModal.addEventListener('click', (e) => {
                const drillBtnRmp = e.target.closest('.btn-drill-padre-rmp');
                if (drillBtnRmp) {
                    e.preventDefault();
                    apriDrillPadreRmp(drillBtnRmp.dataset.codart, drillBtnRmp.dataset.magaz, drillBtnRmp.dataset.fase);
                    return;
                }
                const drillBtn = e.target.closest('.btn-drill-padre');
                if (drillBtn) {
                    e.preventDefault();
                    apriDrillPadre(drillBtn.dataset.codart, drillBtn.dataset.magaz, drillBtn.dataset.fase);
                    return;
                }
                const drillRow = e.target.closest('.rmp-drill-row');
                if (drillRow) {
                    e.preventDefault();
                    apriDrillPadreRmp(drillRow.dataset.codart, drillRow.dataset.magaz, drillRow.dataset.fase);
                    return;
                }
                const rmpRow = e.target.closest('.rmp-row-clickable');
                if (rmpRow) {
                    e.preventDefault();
                    navigaProgressiviDaRmp(rmpRow.dataset.codart);
                }
            });
        }

        // --- MODALE: Bottone Indietro dal drill-through ---
        const modalOrdiniBtnBack = document.getElementById('modalOrdiniBtnBack');
        if (modalOrdiniBtnBack) {
            modalOrdiniBtnBack.addEventListener('click', () => {
                const activeTab = document.querySelector('.modal-ordini-tabs .modal-tab.active');
                const isRmpTab = activeTab && activeTab.id === 'modalTabRmp';
                if (isRmpTab && currentModalContext) {
                    // Torna al tab RMP (lista impegni)
                    const { codart, fase } = currentModalContext;
                    caricaRmpModale(codart, fase || '');
                    const btnBack = document.getElementById('modalOrdiniBtnBack');
                    if (btnBack) btnBack.style.display = 'none';
                } else if (currentModalContext && currentModalContext.type === 'rmp') {
                    apriModaleOrdiniRmp(currentModalContext.codart, currentModalContext.fase);
                } else if (currentModalContext) {
                    const { codart, magaz, fase } = currentModalContext;
                    const filtro = document.getElementById('modalFiltroMagToggle');
                    modalOrdiniBtnBack.style.display = 'none';
                    const filtroLabel = document.getElementById('modalFiltroMagLabel');
                    if (filtroLabel) filtroLabel.style.display = 'flex';
                    caricaOrdiniModale(codart, filtro && filtro.checked ? magaz : '', filtro && filtro.checked ? fase : '');
                }
            });
        }

        // --- MODALE: Toggle filtro magazzino ---
        const modalFiltroMagToggle = document.getElementById('modalFiltroMagToggle');
        if (modalFiltroMagToggle) {
            modalFiltroMagToggle.addEventListener('change', () => {
                if (currentModalContext) {
                    const { codart, magaz, fase } = currentModalContext;
                    const filtro = document.getElementById('modalFiltroMagToggle');
                    caricaOrdiniModale(codart, filtro.checked ? magaz : '', filtro.checked ? fase : '');
                }
            });
        }

        // --- MODALE: Tab Ordini / RMP ---
        const modalTabOrdini = document.getElementById('modalTabOrdini');
        const modalTabRmp = document.getElementById('modalTabRmp');
        if (modalTabOrdini) {
            modalTabOrdini.addEventListener('click', () => {
                if (!currentModalContext || currentModalContext.type === 'rmp-only') return;
                setActiveTab('modalTabOrdini');
                ripristinaHeaderModale();
                const btnBack = document.getElementById('modalOrdiniBtnBack');
                if (btnBack) btnBack.style.display = 'none';
                const filtroLabel = document.getElementById('modalFiltroMagLabel');
                if (filtroLabel) filtroLabel.style.display = 'flex';
                const { codart, magaz, fase } = currentModalContext;
                const filtro = document.getElementById('modalFiltroMagToggle');
                caricaOrdiniModale(codart, filtro && filtro.checked ? magaz : '', filtro && filtro.checked ? fase : '');
            });
        }
        if (modalTabRmp) {
            modalTabRmp.addEventListener('click', () => {
                if (!currentModalContext) return;
                setActiveTab('modalTabRmp');
                const { codart, fase } = currentModalContext;
                const filtroLabel = document.getElementById('modalFiltroMagLabel');
                if (filtroLabel) filtroLabel.style.display = 'none';
                const btnBack = document.getElementById('modalOrdiniBtnBack');
                if (btnBack) btnBack.style.display = 'none';
                caricaRmpModale(codart, fase || '');
            });
        }

        // --- SPLIT VIEW: Toggle pannello ordini ---
        const splitOrdiniToggle = document.getElementById('splitOrdiniToggle');
        if (splitOrdiniToggle) {
            splitOrdiniToggle.addEventListener('click', () => {
                const content = document.getElementById('splitOrdiniContent');
                const arrow = document.getElementById('splitOrdiniArrow');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    arrow.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    arrow.textContent = '▶';
                }
            });
        }

        // --- SPLIT VIEW: Handler delegato per drill-through ---
        const tblSplitOrdini = document.getElementById('tblSplitOrdini');
        if (tblSplitOrdini) {
            tblSplitOrdini.addEventListener('click', (e) => {
                const drillBtn = e.target.closest('.btn-drill-padre');
                if (drillBtn) {
                    e.preventDefault();
                    // Apro il modale in modalità drill-through direttamente
                    const overlay = document.getElementById('modalOrdiniOverlay');
                    overlay.classList.add('open');
                    document.getElementById('modalOrdiniBtnBack').style.display = 'none';
                    document.getElementById('modalFiltroMagLabel').style.display = 'none';
                    apriDrillPadre(drillBtn.dataset.codart, drillBtn.dataset.magaz, drillBtn.dataset.fase);
                }
            });
        }
    }

    function onTableClick(e) {
        const btnConsumi = e.target.closest('.btn-consumi');
        if (btnConsumi) {
            e.preventDefault();
            e.stopPropagation();
            apriModaleConsumi(btnConsumi.dataset.codart, btnConsumi.dataset.descr);
            return;
        }

        const magRow = e.target.closest('.mrp-nested-mag-click');
        if (magRow) {
            e.preventDefault();
            // Nella tabella flat: nome magazzino (descMagazzino) è in .col-pol (intestazione "Politica Riordino").
            // Nella sotto-tabella matrioska: stessa info è nella 3ª cella (Mag, Fase, Magazzino) senza .col-pol.
            let descMag = '';
            const polCell = magRow.querySelector('.col-pol');
            if (polCell) {
                descMag = (polCell.textContent || '').trim();
            }
            if (!descMag) {
                const cells = magRow.querySelectorAll('td');
                if (cells.length >= 3) {
                    descMag = (cells[2].textContent || '').trim();
                }
            }
            apriModaleOrdini(magRow.dataset.codart, magRow.dataset.magaz, magRow.dataset.fase, descMag);
            return;
        }

        const totRow = e.target.closest('.mrp-totale-click');
        if (totRow) {
            e.preventDefault();
            apriModaleOrdiniRmp(totRow.dataset.codart, totRow.dataset.fase);
            return;
        }

        const btnM = e.target.closest('.toggle-matrioska');
        if (btnM) {
            e.preventDefault();
            e.stopPropagation();
            handleToggleMatrioska(btnM);
        }
    }

    function segmentProgressivi(righe) {
        const out = [];
        if (!righe.length || righe[0].tipo !== 'padre') return out;
        let i = 1;
        const mrpPadre = [];
        while (i < righe.length && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')) {
            mrpPadre.push(righe[i]);
            i++;
        }
        out.push({ articolo: righe[0], mrp: mrpPadre });
        while (i < righe.length) {
            if (righe[i].tipo === 'componente') {
                const comp = righe[i];
                i++;
                const mrp = [];
                while (i < righe.length && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')) {
                    mrp.push(righe[i]);
                    i++;
                }
                out.push({ articolo: comp, mrp });
            } else {
                i++;
            }
        }
        return out;
    }

    /** Parser righe quando il backend invia vista esaurimento + sostitutivo + combinato. */
    function segmentProgressiviSostitutivo(righe) {
        if (!righe.length || righe[0].tipo !== 'padre') return null;
        let i = 1;
        const mrpEsaur = [];
        while (
            i < righe.length
            && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')
            && righe[i].etichettaBlocco === 'esaurimento'
        ) {
            mrpEsaur.push(righe[i]);
            i++;
        }
        if (i >= righe.length || righe[i].tipo !== 'sostitutivo-header') return null;
        const sostHeader = righe[i];
        i++;
        const mrpSost = [];
        while (
            i < righe.length
            && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')
            && righe[i].etichettaBlocco === 'sostitutivo'
        ) {
            mrpSost.push(righe[i]);
            i++;
        }
        const mrpComb = [];
        while (
            i < righe.length
            && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')
            && righe[i].etichettaBlocco === 'combinato'
        ) {
            mrpComb.push(righe[i]);
            i++;
        }
        let generaleRow = null;
        if (i < righe.length && righe[i].tipo === 'generale-totale') {
            generaleRow = righe[i];
            i++;
        }
        const componentSegments = [];
        while (i < righe.length) {
            if (righe[i].tipo === 'componente') {
                const comp = righe[i];
                i++;
                const mrp = [];
                while (i < righe.length && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')) {
                    mrp.push(righe[i]);
                    i++;
                }
                componentSegments.push({ articolo: comp, mrp });
            } else {
                i++;
            }
        }
        return {
            articoloEsaur: righe[0],
            mrpEsaur,
            sostHeader,
            mrpSost,
            mrpComb,
            generaleRow,
            componentSegments
        };
    }

    function righePerAlberoSostitutivo(righe) {
        const idx = righe.findIndex((r, j) => j > 0 && r.tipo === 'componente');
        if (idx < 0) return [righe[0]];
        return [righe[0], ...righe.slice(idx)];
    }

    function parseExpandRighe(righe) {
        const mrp = [];
        let i = 0;
        while (i < righe.length && (righe[i].tipo === 'magazzino' || righe[i].tipo === 'totale' || righe[i].tipo === 'totale-cross-fase')) {
            mrp.push(righe[i]);
            i++;
        }
        const components = [];
        while (i < righe.length) {
            if (righe[i].tipo === 'componente') components.push(righe[i]);
            i++;
        }
        return { mrp, components };
    }

    async function fetchExpand(codart, livello) {
        const params = new URLSearchParams({ codart, livello: String(livello) });
        const res = await fetch(`${MrpApp.API_BASE}/progressivi/expand?${params}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Errore expand');
        return parseExpandRighe(data.righe || []);
    }

    function dispNettaFromNumerici(row) {
        const d = row.disponibilita || 0;
        const opc = row.opc || 0;
        const ipc = row.ipc || 0;
        const ip = row.ip || 0;
        return d + opc - ipc - ip;
    }

    function classeBloccoMrp(etichettaBlocco) {
        if (etichettaBlocco === 'esaurimento') return 'mrp-blocco-esaurimento';
        if (etichettaBlocco === 'sostitutivo') return 'mrp-blocco-sostitutivo';
        if (etichettaBlocco === 'combinato') return 'mrp-blocco-combinato';
        return '';
    }

    function parteLabelTotaleFlat(r) {
        return r.labelTotale ? esc(r.labelTotale) : `${esc(r.codart)} TOTALE`;
    }

    function syncSplitSostBanner(data) {
        const el = document.getElementById('splitSostBanner');
        if (!el) return;
        if (data && data.sostitutivo) {
            el.style.display = 'block';
            el.innerHTML =
                `⚠️ In esaurimento — Sost.: <strong>${esc(data.sostitutivo.ar_codart)}</strong> (${esc(data.sostitutivo.ar_descr || '')})`;
        } else {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    }

    function splitCodartComposito(codart) {
        if (codart == null || codart === '') return [];
        const s = String(codart);
        if (!s.includes('+')) return [s.trim()];
        return s.split('+').map((c) => c.trim()).filter(Boolean);
    }

    function splitMrpSectionHeader(htmlInner, blocClass) {
        return `<tr class="split-mrp-section-header ${blocClass || ''}"><td colspan="${MRP_COL_COUNT}">${htmlInner}</td></tr>`;
    }

    function buildGeneraleTotaleRowTr(row, vistaSostitutivo) {
        const genDispNetta = dispNettaFromNumerici(row);
        const trGen = document.createElement('tr');
        trGen.className = vistaSostitutivo
            ? 'mrp-row-generale-totale mrp-row-generale-totale-sost'
            : 'mrp-row-generale-totale';
        trGen.innerHTML = `
                <td class="col-row"></td>
                <td class="col-parte" style="padding-left:8px;"><strong>Generale TOTALE</strong></td>
                <td class="col-mag"></td>
                <td class="col-fase"></td>
                <td class="col-pol"></td>
                <td class="col-um">${esc(row.um || 'PZ')}</td>
                <td class="col-num">${fmt(row.esistenza)}</td>
                <td class="col-num">${fmt(row.ordinato)}</td>
                <td class="col-num">${fmt(row.impegnato)}</td>
                <td class="col-num">${fmt(row.disponibilita)}</td>
                <td class="col-date"></td>
                <td class="col-num">${fmt(row.opc)}</td>
                <td class="col-num">${fmt(row.op)}</td>
                <td class="col-num">${fmt(row.ipc)}</td>
                <td class="col-num">${fmt(row.ip)}</td>
                <td class="col-num cell-generale-disp-netta">${fmt(genDispNetta)}</td>
            `;
        return trGen;
    }

    function setupSplitView(segments, options = {}) {
        const treeRoot = document.getElementById('splitTreeRoot');
        if (!treeRoot || !segments.length) return;

        const rootMrp = options.rootMrpOverride != null ? options.rootMrpOverride : segments[0].mrp;
        const rootArticolo = segments[0].articolo;

        treeRoot.innerHTML = '';
        const li = buildTreeItem(rootArticolo, rootMrp, 0);
        treeRoot.appendChild(li);

        const ulFigli = li.querySelector('ul');
        for (let s = 1; s < segments.length; s++) {
            const seg = segments[s];
            const liv = seg.articolo.livello != null ? seg.articolo.livello : 1;
            const childLi = buildTreeItem(seg.articolo, seg.mrp, liv);
            ulFigli.appendChild(childLi);
        }

        if (segments.length > 1) {
            const togIcon = li.querySelector('.tree-toggle-icon');
            if (togIcon) togIcon.textContent = '▼';
        }

        const firstNode = li.querySelector('.tree-node');
        if (firstNode) {
            firstNode.click();
        }
    }

    function renderProgressiviConSostitutivo(data, p, tbody, rootCodart) {
        const {
            articoloEsaur, mrpEsaur, sostHeader, mrpSost, mrpComb, generaleRow, componentSegments
        } = p;

        const { articleTr, nestedTr } = createArticoloPair(articoloEsaur, mrpEsaur, {
            rowNum: 1,
            bomParentCodart: '',
            livello: 0,
            isRoot: true
        });
        articleTr.classList.add('mrp-blocco-esaurimento');
        if (mrpEsaur.length) {
            articleTr.dataset.mrpLoaded = '1';
        }
        expandFetched[rootCodart] = true;
        tbody.appendChild(articleTr);
        if (mrpEsaur.length) {
            tbody.insertAdjacentHTML('beforeend', renderFlatMrp(mrpEsaur));
        }

        let rn = 2;
        const sostArt = { ...sostHeader, tipo: 'sostitutivo-header', espandibile: false };
        const { articleTr: trS } = createArticoloPair(sostArt, mrpSost, {
            rowNum: rn++,
            bomParentCodart: rootCodart,
            livello: 0,
            soloFlatMrp: true,
            mrpPreFetched: true
        });
        trS.classList.add('mrp-blocco-sostitutivo');
        trS.dataset.mrpLoaded = '1';
        expandFetched[sostArt.codart] = true;
        tbody.appendChild(trS);
        if (mrpSost.length) {
            tbody.insertAdjacentHTML('beforeend', renderFlatMrp(mrpSost));
        }
        if (mrpComb.length) {
            tbody.insertAdjacentHTML('beforeend', renderFlatMrp(mrpComb));
        }
        if (generaleRow) {
            tbody.appendChild(buildGeneraleTotaleRowTr(generaleRow, true));
        }

        for (const seg of componentSegments) {
            const { articleTr: ch, nestedTr: chN } = createArticoloPair(seg.articolo, seg.mrp, {
                rowNum: rn++,
                bomParentCodart: rootCodart,
                livello: seg.articolo.livello != null ? seg.articolo.livello : 1,
                mrpPreFetched: true
            });
            ch.dataset.mrpLoaded = '1';
            if (!seg.articolo.espandibile) {
                expandFetched[ch.dataset.codart] = true;
            }
            tbody.appendChild(ch);
            tbody.appendChild(chN);
        }
    }

    function render(data) {
        const tbody = getTbody();
        tbody.innerHTML = '';
        Object.keys(expandFetched).forEach(k => delete expandFetched[k]);
        splitSostData = null;

        const { articolo, righe } = data;
        document.getElementById('progressiviTitle').textContent =
            `${articolo.ar_descr} (${articolo.ar_codart})`;

        // Breadcrumb: aggiorna descrizione dell'ultimo elemento (poteva essere stato pushato con solo codart)
        if (_navStack.length === 0) {
            _pushBreadcrumb(articolo.ar_codart, articolo.ar_descr);
        } else {
            const last = _navStack[_navStack.length - 1];
            if (last && last.codart === articolo.ar_codart) {
                last.descr = articolo.ar_descr;
                _renderBreadcrumb();
            }
        }

        const rootCodart = articolo.ar_codart;

        if (data.sostitutivo) {
            const sostParsed = segmentProgressiviSostitutivo(righe);
            if (sostParsed) {
                renderProgressiviConSostitutivo(data, sostParsed, tbody, rootCodart);
                renumberRows();
                splitSostData = {
                    header: sostParsed.sostHeader,
                    mrp: sostParsed.mrpSost,
                    mrpComb: sostParsed.mrpComb,
                    generaleRow: sostParsed.generaleRow
                };
                const treeSeg = segmentProgressivi(righePerAlberoSostitutivo(righe));
                if (treeSeg.length) {
                    setupSplitView(treeSeg, { rootMrpOverride: sostParsed.mrpEsaur });
                }
                syncSplitSostBanner(data);
                mostraPanelDecisione();
                return;
            }
        }

        const segments = segmentProgressivi(righe);
        if (!segments.length) {
            syncSplitSostBanner(data);
            mostraPanelDecisione();
            return;
        }

        const rootSeg = segments[0];
        const { articleTr, nestedTr } = createArticoloPair(rootSeg.articolo, rootSeg.mrp, {
            rowNum: 1,
            bomParentCodart: '',
            livello: 0,
            isRoot: true
        });
        if (rootSeg.mrp.length) {
            articleTr.dataset.mrpLoaded = '1';
        }
        expandFetched[rootCodart] = true;

        tbody.appendChild(articleTr);

        if (rootSeg.mrp && rootSeg.mrp.length > 0) {
            tbody.insertAdjacentHTML('beforeend', renderFlatMrp(rootSeg.mrp));
        }

        let rn = 2;
        for (let s = 1; s < segments.length; s++) {
            const seg = segments[s];
            const { articleTr: ch, nestedTr: chN } = createArticoloPair(seg.articolo, seg.mrp, {
                rowNum: rn++,
                bomParentCodart: rootCodart,
                livello: seg.articolo.livello != null ? seg.articolo.livello : 1,
                mrpPreFetched: true
            });

            ch.dataset.mrpLoaded = '1';

            if (!seg.articolo.espandibile) {
                expandFetched[ch.dataset.codart] = true;
            }

            tbody.appendChild(ch);
            tbody.appendChild(chN);
        }

        if (segments.length > 1 && rootSeg.mrp.length > 0) {
            const genTot = calcolaTotaliMrp(rootSeg.mrp);
            const trGen = buildGeneraleTotaleRowTr({
                esistenza: genTot.esistenza,
                ordinato: genTot.ordinato,
                impegnato: genTot.impegnato,
                disponibilita: genTot.disponibilita,
                opc: genTot.opc,
                op: genTot.op,
                ipc: genTot.ipc,
                ip: genTot.ip
            }, false);
            tbody.appendChild(trGen);
        }

        renumberRows();

        setupSplitView(segments);
        syncSplitSostBanner(data);
        mostraPanelDecisione();
    }

    function mostraPanelDecisione() {
        const proposta = MrpApp.state.propostaCorrente;
        const panel = document.getElementById('panelDecisione');
        if (!panel) return;

        if (!proposta) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        document.getElementById('decisioneFornitore').textContent =
            proposta.fornitore_nome + (proposta.fornitore_codice ? ' (' + proposta.fornitore_codice + ')' : '');
        document.getElementById('decisioneArticolo').textContent =
            proposta.ol_codart + (proposta.ar_descr ? ' \u2014 ' + proposta.ar_descr : '');
        document.getElementById('decisioneQtaProposta').textContent =
            Number(proposta.ol_quant).toLocaleString('it-IT');
        document.getElementById('decisioneUM').textContent = proposta.ol_unmis || 'PZ';
        document.getElementById('decisionePrezzo').textContent =
            proposta.ol_prezzo && Number(proposta.ol_prezzo) > 0
                ? Number(proposta.ol_prezzo).toFixed(4) : '-';

        const inputQta = document.getElementById('decisioneQta');
        const inputData = document.getElementById('decisioneData');

        // Se già confermato, mostra i valori confermati; altrimenti precompila dalla proposta
        const key = MrpApp.getKeyOrdine(proposta.fornitore_codice, proposta.ol_codart, proposta.ol_fase, proposta.ol_magaz);
        const esistente = MrpApp.state.ordiniConfermati.get(key);

        if (esistente && !esistente.escluso) {
            inputQta.value = esistente.quantita_confermata;
            inputData.value = esistente.data_consegna;
        } else {
            inputQta.value = Math.round(Number(proposta.ol_quant) || 0);
            if (proposta.ol_datcons) {
                const d = new Date(proposta.ol_datcons);
                if (!isNaN(d.getTime())) {
                    inputData.value = d.toISOString().split('T')[0];
                }
            }
        }

        aggiornaValoreDecisione();
    }

    function aggiornaValoreDecisione() {
        const qta = Number(document.getElementById('decisioneQta').value) || 0;
        const proposta = MrpApp.state.propostaCorrente;
        const prezzo = proposta ? Number(proposta.ol_prezzo) || 0 : 0;
        const perqta = proposta ? Number(proposta.ol_perqta) || 1 : 1;
        const valore = qta * prezzo / perqta;
        document.getElementById('decisioneValore').textContent =
            valore > 0
                ? '\u20ac ' + valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '-';
    }

    function confermaOrdineHandler() {
        const proposta = MrpApp.state.propostaCorrente;
        if (!proposta) return;

        const qta = Number(document.getElementById('decisioneQta').value);
        const data = document.getElementById('decisioneData').value;

        if (!qta || qta <= 0) { alert('Inserire una quantità valida'); return; }
        if (!data) { alert('Inserire una data di consegna'); return; }

        const key = MrpApp.getKeyOrdine(proposta.fornitore_codice, proposta.ol_codart, proposta.ol_fase, proposta.ol_magaz);

        MrpApp.confermaOrdine(key, {
            fornitore_codice: proposta.fornitore_codice,
            fornitore_nome: proposta.fornitore_nome,
            ol_codart: proposta.ol_codart,
            ar_codalt: proposta.ar_codalt,
            ar_descr: proposta.ar_descr,
            ol_fase: proposta.ol_fase,
            ol_magaz: proposta.ol_magaz,
            ol_unmis: proposta.ol_unmis,
            ol_progr: proposta.ol_progr || 0,
            quantita_confermata: qta,
            data_consegna: data,
            quantita_proposta: Number(proposta.ol_quant) || 0,
            prezzo: Number(proposta.ol_prezzo) || 0,
            perqta: Number(proposta.ol_perqta) || 1,
            timestamp_conferma: new Date().toISOString()
        });

        MrpApp.state.propostaCorrente = null;
        MrpApp.switchView('parametri');

        if (typeof MrpProposta !== 'undefined' && MrpProposta.aggiornaStatoVisivo) {
            MrpProposta.aggiornaStatoVisivo();
        }
    }

    function escludiOrdineHandler() {
        const proposta = MrpApp.state.propostaCorrente;
        if (!proposta) return;

        const key = MrpApp.getKeyOrdine(proposta.fornitore_codice, proposta.ol_codart, proposta.ol_fase, proposta.ol_magaz);

        MrpApp.confermaOrdine(key, {
            fornitore_codice: proposta.fornitore_codice,
            fornitore_nome: proposta.fornitore_nome,
            ol_codart: proposta.ol_codart,
            ar_codalt: proposta.ar_codalt,
            ar_descr: proposta.ar_descr,
            ol_fase: proposta.ol_fase,
            ol_magaz: proposta.ol_magaz,
            ol_unmis: proposta.ol_unmis,
            ol_progr: proposta.ol_progr || 0,
            quantita_confermata: 0,
            data_consegna: '',
            quantita_proposta: Number(proposta.ol_quant) || 0,
            prezzo: Number(proposta.ol_prezzo) || 0,
            perqta: Number(proposta.ol_perqta) || 1,
            escluso: true,
            timestamp_conferma: new Date().toISOString()
        });

        MrpApp.state.propostaCorrente = null;
        MrpApp.switchView('parametri');

        if (typeof MrpProposta !== 'undefined' && MrpProposta.aggiornaStatoVisivo) {
            MrpProposta.aggiornaStatoVisivo();
        }
    }

    function skipOrdineHandler() {
        MrpApp.state.propostaCorrente = null;
        document.getElementById('panelDecisione').style.display = 'none';
        MrpApp.switchView('parametri');
    }

    function buildTreeItem(articolo, mrpRows, livello) {
        const li = document.createElement('li');
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'tree-node';
        
        nodeDiv.dataset.codart = articolo.codart;
        nodeDiv.dataset.descr = articolo.descr || '';
        nodeDiv.dataset.livello = livello;
        
        // Icona + o spazio
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'tree-toggle-icon';
        if (articolo.espandibile) {
            toggleIcon.textContent = '▶';
            toggleIcon.style.cursor = 'pointer';
            
            toggleIcon.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ul = li.querySelector('ul');
                if (toggleIcon.textContent === '▼') {
                    // Chiudi
                    toggleIcon.textContent = '▶';
                    ul.style.display = 'none';
                } else {
                    // Apri
                    toggleIcon.textContent = '▼';
                    ul.style.display = 'block';
                    
                    if (!ul.hasChildNodes() && !expandFetched[nodeDiv.dataset.codart]) {
                        try {
                            const { mrp, components } = await fetchExpand(articolo.codart, livello);
                            expandFetched[articolo.codart] = true;
                            // Salvo i dati MRP su dataset
                            nodeDiv.dataset.mrpJson = JSON.stringify(mrp);
                            
                            components.forEach(comp => {
                                const childLiv = comp.livello != null ? comp.livello : livello + 1;
                                const childLi = buildTreeItem(comp, [], childLiv);
                                ul.appendChild(childLi);
                            });
                            
                            // Se era già selezionato, aggiorno la griglia
                            if (nodeDiv.classList.contains('selected')) {
                                updateSplitMrpGrid(mrp, null);
                                caricaOrdiniSplitView(articolo.codart);
                            }
                        } catch (err) {
                            console.error('[SplitView] Errore espansione nodo:', err);
                            toggleIcon.textContent = '▶'; // revert
                        }
                    }
                }
            });
        } else {
            toggleIcon.textContent = ' ';
        }
        
        const iconaDoc = articolo.espandibile ? '📁' : '📄';
        
        const labelSpan = document.createElement('span');
        labelSpan.innerHTML = `&nbsp;${iconaDoc} ${esc(articolo.descr)} <span class="code-dim">${esc(articolo.codart)}</span>`;
        
        nodeDiv.appendChild(toggleIcon);
        nodeDiv.appendChild(labelSpan);
        li.appendChild(nodeDiv);
        
        const ulContainer = document.createElement('ul');
        ulContainer.style.display = 'block'; // Di default figli visibili perché li aggiungiamo noi per root o vengono togglati
        if (livello > 0 && mrpRows.length === 0) {
            ulContainer.style.display = 'none';
        }
        li.appendChild(ulContainer);
        
        // Salvataggio dei dati mrp ricevuti subito
        if (mrpRows && mrpRows.length > 0) {
            nodeDiv.dataset.mrpJson = JSON.stringify(mrpRows);
        }

        // Click logic per selezionare
        nodeDiv.addEventListener('click', async (e) => {
            document.querySelectorAll('#splitTreeRoot .tree-node').forEach(n => n.classList.remove('selected'));
            nodeDiv.classList.add('selected');
            
            // Popola Dettaglio con pulsante Consumi
            const titleEl = document.getElementById('splitDetailTitle');
            if (titleEl) {
                const btnConsumi = `<button type="button" class="btn-consumi" data-codart="${esc(articolo.codart)}" data-descr="${esc(articolo.descr)}" style="background:none;border:none;cursor:pointer;font-size:16px;margin-left:10px;vertical-align:middle;" title="Vedi Consumi Storici">📊</button>`;
                titleEl.innerHTML = `${esc(articolo.descr)} <span class="code-dim">(${esc(articolo.codart)})</span> ${btnConsumi}`;
                const bc = titleEl.querySelector('.btn-consumi');
                if (bc) {
                    bc.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        apriModaleConsumi(bc.dataset.codart, bc.dataset.descr);
                    });
                }
            }
            
            const dbEl = document.getElementById('splitDetDB');
            if (dbEl) dbEl.textContent = articolo.descr; // Come da specifiche, qua si mette la descrizione
            // Tutti gli altri per ora "-"
            ['splitDetNote', 'splitDetFornitore', 'splitDetImballo', 'splitDetSost'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '-';
            });
            
            // Popola griglia MRP
            let mrpSel = [];
            if (nodeDiv.dataset.mrpJson) {
                try {
                    mrpSel = JSON.parse(nodeDiv.dataset.mrpJson);
                } catch (_) {
                    mrpSel = [];
                }
            }
            const sostCtx = (livello === 0 && splitSostData) ? splitSostData : null;
            if (nodeDiv.dataset.mrpJson) {
                updateSplitMrpGrid(mrpSel, sostCtx);
                caricaOrdiniSplitView(articolo.codart);
            } else {
                updateSplitMrpGrid([], sostCtx);
                try {
                    const params = new URLSearchParams({ codart: articolo.codart, livello: String(livello) });
                    const res = await fetch(`${MrpApp.API_BASE}/progressivi/expand?${params}`, { credentials: 'include' });
                    const data = await res.json();

                    if (res.ok) {
                        const { mrp } = parseExpandRighe(data.righe || []);
                        nodeDiv.dataset.mrpJson = JSON.stringify(mrp);
                        updateSplitMrpGrid(mrp, (livello === 0 && splitSostData) ? splitSostData : null);
                        caricaOrdiniSplitView(articolo.codart);
                    }
                } catch (err) {
                    console.error('[SplitView] Errore caricamento mrp dettaglio:', err);
                }
            }
        });
        
        return li;
    }

    async function caricaOrdiniSplitView(codart) {
        const card = document.getElementById('splitOrdiniCard');
        const tbody = document.getElementById('splitOrdiniBody');
        const countEl = document.getElementById('splitOrdiniCount');
        if (!card || !tbody) return;

        card.style.display = 'block';
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:12px;">Caricamento...</td></tr>';

        try {
            const params = new URLSearchParams({ codart });
            const res = await fetch(`${MrpApp.API_BASE}/ordini-dettaglio?${params}`, { credentials: 'include' });
            const data = await res.json();

            if (!res.ok || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:16px;">Nessun ordine/impegno attivo</td></tr>';
                if (countEl) countEl.textContent = '';
                return;
            }

            if (countEl) countEl.textContent = `(${data.length})`;
            tbody.innerHTML = '';

            data.forEach(o => {
                const tr = document.createElement('tr');
                if (o.mo_tipork === 'Y') {
                    tr.className = 'modal-row-impprod';
                } else if (o.mo_tipork === 'H' || o.mo_tipork === 'R') {
                    tr.className = 'modal-row-ordprod';
                } else {
                    tr.className = 'modal-row-ordforn';
                }

                const drillBtn = o.mo_tipork === 'Y'
                    ? `<button class="btn-drill-padre" title="Mostra ordini produzione padre" data-codart="${esc(o.mo_codart)}" data-magaz="${esc(String(o.mo_magaz || ''))}" data-fase="${esc(String(o.mo_fase || ''))}">🔍</button>`
                    : '';

                tr.innerHTML = `
                    <td style="text-align:center">${drillBtn}</td>
                    <td>${esc(o.desc_tipo || o.mo_tipork)}</td>
                    <td style="text-align:center">${esc(o.mo_magaz)}</td>
                    <td>${esc(o.mo_anno)}</td>
                    <td>${esc(o.mo_serie)}</td>
                    <td>${esc(o.mo_numord)}</td>
                    <td>${fmtDate(o.mo_datcons)}</td>
                    <td style="text-align:right">${fmt(o.mo_quant)}</td>
                    <td style="text-align:right">${fmt(o.mo_quaeva)}</td>
                    <td>${esc(o.mo_flevas)}</td>
                    <td>${esc(o.fornitore || '')}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--danger);padding:16px;">Errore caricamento ordini</td></tr>';
        }
    }
    
    function updateSplitMrpGrid(mrpRows, sostData) {
        const bodyEl = document.getElementById('splitMrpBody');
        if (!bodyEl) return;

        if (!sostData) {
            bodyEl.innerHTML = nestedTbodyFromMrp(mrpRows, { emptyMode: mrpRows.length ? 'none' : 'fetched-empty' });
            return;
        }

        let html = '';
        html += splitMrpSectionHeader(
            `<span style="font-weight:700;padding:8px;display:block;background:#fff3e0;">📦 Articolo in esaurimento</span>`,
            'mrp-blocco-esaurimento'
        );
        html += nestedTbodyFromMrp(mrpRows, { emptyMode: mrpRows.length ? 'none' : 'fetched-empty' });

        const h = sostData.header || {};
        html += splitMrpSectionHeader(
            `<span style="font-weight:700;padding:8px;display:block;background:#e8f5e9;">🔄 Sostitutivo: ${esc(h.descr || '')} (${esc(h.codart || '')})</span>`,
            'mrp-blocco-sostitutivo'
        );
        html += nestedTbodyFromMrp(sostData.mrp || [], { emptyMode: (sostData.mrp && sostData.mrp.length) ? 'none' : 'fetched-empty' });

        if (sostData.mrpComb && sostData.mrpComb.length) {
            html += splitMrpSectionHeader(
                `<span style="font-weight:700;padding:8px;display:block;background:#fce4ec;">📊 Esaur + Sostit combinato</span>`,
                'mrp-blocco-combinato'
            );
            html += nestedTbodyFromMrp(sostData.mrpComb, { emptyMode: 'none' });
        }

        if (sostData.generaleRow) {
            const g = sostData.generaleRow;
            const dnet = dispNettaFromNumerici(g);
            html += `<tr class="mrp-row-generale-totale mrp-row-generale-totale-sost">` +
                `<td>All</td><td>All</td><td></td><td></td>` +
                `<td style="text-align:right">${fmt(g.esistenza)}</td>` +
                `<td style="text-align:right">${fmt(g.ordinato)}</td>` +
                `<td style="text-align:right">${fmt(g.impegnato)}</td>` +
                `<td style="text-align:right;font-weight:bold">${fmt(g.disponibilita)}</td>` +
                `<td></td>` +
                `<td style="text-align:right">${fmt(g.opc)}</td>` +
                `<td style="text-align:right">${fmt(g.op)}</td>` +
                `<td style="text-align:right">${fmt(g.ipc)}</td>` +
                `<td style="text-align:right">${fmt(g.ip)}</td>` +
                `<td style="text-align:right;font-weight:bold">${fmt(dnet)}</td>` +
                `</tr>`;
        }

        bodyEl.innerHTML = html;
    }

    /** Disp. netta Access: Disponibilità + OPC − IPC − IP (OP generati è solo informativo) */
    function dispNettaMrpRow(r) {
        const d = r.disponibilita || 0;
        const opc = r.opc || 0;
        const ipc = r.ipc || 0;
        const ip = r.ip || 0;
        return d + opc - ipc - ip;
    }

    function calcolaTotaliMrp(mrpRows) {
        let esistenza = 0;
        let ordinato = 0;
        let impegnato = 0;
        let disponibilita = 0;
        let opc = 0;
        let op = 0;
        let ipc = 0;
        let ip = 0;
        const crossFase = mrpRows.filter(r => r.tipo === 'totale-cross-fase');
        const source = crossFase.length > 0 ? crossFase : mrpRows.filter(r => r.tipo === 'totale');
        source.forEach(t => {
            esistenza += (t.esistenza || 0);
            ordinato += (t.ordinato || 0);
            impegnato += (t.impegnato || 0);
            disponibilita += (t.disponibilita || 0);
            opc += (t.opc || 0);
            op += (t.op || 0);
            ipc += (t.ipc || 0);
            ip += (t.ip || 0);
        });
        const dispNetta = disponibilita + opc - ipc - ip;
        return { esistenza, ordinato, impegnato, disponibilita, opc, op, ipc, ip, dispNetta };
    }

    function applyTotaliToArticoloRow(tr, mrpRows) {
        const tot = calcolaTotaliMrp(mrpRows);
        const cellE = tr.querySelector('.cell-esistenza');
        const cellO = tr.querySelector('.cell-ordinato');
        const cellI = tr.querySelector('.cell-impegnato');
        if (cellE) cellE.textContent = fmt(tot.esistenza);
        if (cellO) cellO.textContent = fmt(tot.ordinato);
        if (cellI) cellI.textContent = fmt(tot.impegnato);
        const cellDisp = tr.querySelector('.cell-disponibilita');
        if (cellDisp) cellDisp.textContent = fmt(tot.disponibilita);
        const cellNet = tr.querySelector('.cell-disp-netta');
        if (cellNet) cellNet.textContent = fmt(tot.dispNetta);
    }

    function isScaduto(a) {
        return a.tipo === 'componente' && (a.scaduto === 1 || a.scaduto === true);
    }

    function createArticoloPair(articolo, mrpRows, ctx) {
        const { rowNum, bomParentCodart, livello, isRoot, soloFlatMrp, mrpPreFetched } = ctx;
        const liv = livello != null ? livello : 0;

        const tr = document.createElement('tr');
        tr.className = 'mrp-row-articolo';
        if (isScaduto(articolo)) tr.classList.add('row-scaduto');
        if (isRoot) tr.dataset.isRoot = '1';

        tr.dataset.codart = articolo.codart;
        tr.dataset.livello = String(liv);
        tr.dataset.espandibile = articolo.espandibile ? '1' : '0';
        if (bomParentCodart) tr.dataset.bomParent = bomParentCodart;

        const btnEspandi = (isRoot || soloFlatMrp) ? '' : '<button type="button" class="btn-matrioska toggle-matrioska">Espandi ▼</button>';
        const scadutoBadge = isScaduto(articolo) ? '<span class="scaduto-badge">SCADUTO</span>' : '';
        const descrStrong = (articolo.tipo === 'padre' || articolo.tipo === 'sostitutivo-header' || isRoot)
            ? `<strong>${esc(articolo.descr)}</strong>`
            : esc(articolo.descr);
        const btnConsumi = `<button type="button" class="btn-consumi" data-codart="${esc(articolo.codart)}" data-descr="${esc(articolo.descr)}" style="background:none;border:none;cursor:pointer;font-size:14px;margin-left:4px;" title="Vedi Consumi Storici">📊</button>`;

        const marginL = (isRoot || soloFlatMrp) ? '0' : '8px';
        const sostPref = articolo.tipo === 'sostitutivo-header'
            ? '<span class="mrp-sostitutivo-prefix">Sostitutivo:</span> '
            : '';
        const parteInner = `${btnEspandi} <span class="mrp-desc-articolo" style="margin-left:${marginL}">${sostPref}${descrStrong} <span class="code-dim">${esc(articolo.codart)}</span> ${btnConsumi}</span> ${scadutoBadge}`;

        // Totali mostrati solo nella riga TOTALE in fondo, non nella riga padre
        tr.innerHTML = rigaArticoloHTML(rowNum, parteInner, articolo, null);

        if (isScaduto(articolo)) {
            tr.title = 'Componente distinta non più valido (data fine validità).';
        }

        const nestedTr = document.createElement('tr');
        nestedTr.className = 'matrioska-nested-row';
        nestedTr.style.display = 'none';

        const cs = getColspan();
        const bomDisplay = (soloFlatMrp || !articolo.espandibile) ? 'none' : 'flex';
        const bomTableDisplay = (soloFlatMrp || !articolo.espandibile) ? 'none' : 'table';

        nestedTr.innerHTML = `
            <td colspan="${cs}">
                <div class="matrioska-box">
                    <div class="matrioska-section-title">📦 Giacenze e Ordini</div>
                    <table class="matrioska-table table-mrp-data">
                        <thead>
                            <tr>
                                <th>Mag</th><th>Fase</th><th>Magazzino</th><th>UM</th>
                                <th>Esistenza</th><th>Ordin.</th><th>Impegn.</th><th>Dispon.</th>
                                <th>Data cons.</th><th>Or.P/F Co</th><th>Or.P/F Ge</th>
                                <th>Ip.Pr Co</th><th>Ip.Pr Ge</th><th>Disp. netta</th>
                            </tr>
                        </thead>
                        <tbody class="mrp-nested-tbody">${nestedTbodyFromMrp(mrpRows, { emptyMode: mrpRows.length ? 'none' : 'awaiting' })}</tbody>
                    </table>
                    <div class="matrioska-section-title" style="display:${bomDisplay}">⚙️ Componenti Distinta Base</div>
                    <table class="matrioska-table table-bom-data" style="display:${bomTableDisplay}; border-left:3px solid #64748b;">
                        <thead>
                            <tr>
                                <th>#</th><th>Parte</th><th>Mag</th><th>Fase</th><th>Politica Riordino</th><th>UM</th>
                                <th>Esistenza</th><th>Ordin.</th><th>Impegn.</th><th>Dispon.</th><th>Data Cons</th>
                                <th>Or.P/F.Co</th><th>Or.P/F.Ge</th><th>Ip.Pr.Co</th><th>Ip.Pr.Ge</th><th>Disp.Netta</th>
                            </tr>
                        </thead>
                        <tbody class="bom-nested-tbody"></tbody>
                    </table>
                </div>
            </td>`;

        return { articleTr: tr, nestedTr };
    }

    function rigaArticoloHTML(num, parteCell, articolo, totali) {
        const faseD = articolo.tipo === 'componente' && articolo.faseDistinta != null && articolo.faseDistinta !== ''
            ? esc(String(articolo.faseDistinta))
            : '';
        const pol = articolo.polriord != null ? esc(String(articolo.polriord)) : '';
        const um = esc(articolo.um || 'PZ');

        const txtEsist = totali ? fmt(totali.esistenza) : '';
        const txtOrd = totali ? fmt(totali.ordinato) : '';
        const txtImp = totali ? fmt(totali.impegnato) : '';
        const txtDisp = totali ? fmt(totali.disponibilita) : '';
        const txtDispNetta = totali && totali.dispNetta != null ? fmt(totali.dispNetta) : '';

        return `
            <td class="col-row">${num}</td>
            <td class="col-parte">${parteCell}</td>
            <td class="col-mag"></td>
            <td class="col-fase">${faseD}</td>
            <td class="col-pol">${pol}</td>
            <td class="col-um">${um}</td>
            <td class="col-num cell-valore-totale cell-esistenza">${txtEsist}</td>
            <td class="col-num cell-valore-totale cell-ordinato">${txtOrd}</td>
            <td class="col-num cell-valore-totale cell-impegnato">${txtImp}</td>
            <td class="col-num cell-valore-totale cell-disponibilita">${txtDisp}</td>
            <td class="col-date"></td>
            <td class="col-num"></td>
            <td class="col-num"></td>
            <td class="col-num"></td>
            <td class="col-num"></td>
            <td class="col-num cell-valore-totale cell-disp-netta">${txtDispNetta}</td>
        `;
    }

    function nestedTbodyFromMrp(rows, opts = {}) {
        const emptyMode = opts.emptyMode || (rows.length ? 'none' : 'awaiting');
        if (!rows.length) {
            const msg = emptyMode === 'fetched-empty'
                ? 'Nessun movimento magazzino'
                : 'Nessun dato magazzino (espandi per caricare)';
            return `<tr><td colspan="${MRP_COL_COUNT}" style="text-align:center;color:var(--text-muted);padding:12px;">${msg}</td></tr>`;
        }
        let html = '';
        for (const r of rows) {
            if (r.tipo === 'magazzino') {
                const dnet = dispNettaMrpRow(r);
                const bloc = classeBloccoMrp(r.etichettaBlocco);
                const clickMag = ' mrp-nested-mag-click';
                let cls = (r.inesaur === 'S' ? 'row-magazzino row-esaurito' : 'row-magazzino') + clickMag;
                if (bloc) cls += ` ${bloc}`;
                const showG = r.mostraGiacenze !== false;
                const cellEs = showG && r.esistenza != null ? fmt(r.esistenza) : '';
                const cellOr = showG && r.ordinato != null ? fmt(r.ordinato) : '';
                const cellIm = showG && r.impegnato != null ? fmt(r.impegnato) : '';
                const cellDisp = showG && r.disponibilita != null ? fmt(r.disponibilita) : '';
                const dispStyle = showG && r.disponibilita != null ? 'text-align:right;font-weight:bold' : 'text-align:right';
                html += `<tr class="${cls}" data-codart="${esc(r.codart)}" data-magaz="${esc(r.magaz)}" data-fase="${esc(r.fase)}">` +
                    `<td>${esc(r.magaz)}</td>` +
                    `<td>${esc(r.fase)}</td>` +
                    `<td>${esc(r.descMagazzino || '')}</td>` +
                    `<td>${esc(r.um || 'PZ')}</td>` +
                    `<td style="text-align:right">${cellEs}</td>` +
                    `<td style="text-align:right">${cellOr}</td>` +
                    `<td style="text-align:right">${cellIm}</td>` +
                    `<td style="${dispStyle}">${cellDisp}</td>` +
                    `<td>${fmtDate(r.dataCons)}</td>` +
                    `<td style="text-align:right">${fmt(r.opc)}</td>` +
                    `<td style="text-align:right">${fmt(r.op)}</td>` +
                    `<td style="text-align:right">${fmt(r.ipc)}</td>` +
                    `<td style="text-align:right">${fmt(r.ip)}</td>` +
                    `<td style="text-align:right">${fmt(dnet)}</td></tr>`;
            } else if (r.tipo === 'totale') {
                const dispT = r.disponibilita || 0;
                const dnetT = dispNettaMrpRow(r);
                const bloc = classeBloccoMrp(r.etichettaBlocco);
                const clickTot = ' mrp-totale-click';
                const clsTot = `mrp-row-totale${clickTot}${bloc ? ` ${bloc}` : ''}`;
                html += `<tr class="${clsTot}" data-codart="${esc(r.codart)}" data-fase="${esc(r.fase)}" data-disp-netta="${dnetT}">` +
                    `<td>All</td>` +
                    `<td>${esc(r.fase)}</td>` +
                    `<td></td>` +
                    `<td>${esc(r.um || 'PZ')}</td>` +
                    `<td style="text-align:right">${fmt(r.esistenza)}</td>` +
                    `<td style="text-align:right">${fmt(r.ordinato)}</td>` +
                    `<td style="text-align:right">${fmt(r.impegnato)}</td>` +
                    `<td style="text-align:right">${fmt(dispT)}</td>` +
                    `<td></td>` +
                    `<td style="text-align:right">${fmt(r.opc)}</td>` +
                    `<td style="text-align:right">${fmt(r.op)}</td>` +
                    `<td style="text-align:right">${fmt(r.ipc)}</td>` +
                    `<td style="text-align:right">${fmt(r.ip)}</td>` +
                    `<td style="text-align:right">${fmt(dnetT)}</td></tr>`;
            } else if (r.tipo === 'totale-cross-fase') {
                const dispCF = r.disponibilita || 0;
                const dnetCF = dispNettaMrpRow(r);
                const blocCf = classeBloccoMrp(r.etichettaBlocco);
                const clickCf = ' mrp-totale-click';
                const clsCf = `mrp-row-totale-cross${clickCf}${blocCf ? ` ${blocCf}` : ''}`;
                html += `<tr class="${clsCf}" data-codart="${esc(r.codart)}" data-fase="${esc(r.fase)}" data-disp-netta="${dnetCF}">` +
                    `<td>All</td>` +
                    `<td>All</td>` +
                    `<td></td>` +
                    `<td></td>` +
                    `<td style="text-align:right">${fmt(r.esistenza)}</td>` +
                    `<td style="text-align:right">${fmt(r.ordinato)}</td>` +
                    `<td style="text-align:right">${fmt(r.impegnato)}</td>` +
                    `<td style="text-align:right">${fmt(dispCF)}</td>` +
                    `<td></td>` +
                    `<td style="text-align:right">${fmt(r.opc)}</td>` +
                    `<td style="text-align:right">${fmt(r.op)}</td>` +
                    `<td style="text-align:right">${fmt(r.ipc)}</td>` +
                    `<td style="text-align:right">${fmt(r.ip)}</td>` +
                    `<td style="text-align:right">${fmt(dnetCF)}</td></tr>`;
            }
        }
        return html;
    }

    function renderFlatMrp(mrpRows) {
        let html = '';
        for (const r of mrpRows) {
            if (r.tipo === 'magazzino') {
                const dnet = dispNettaMrpRow(r);
                const bloc = classeBloccoMrp(r.etichettaBlocco);
                const clickMag = ' mrp-nested-mag-click';
                let cls = (r.inesaur === 'S' ? 'row-magazzino row-esaurito' : 'row-magazzino') + clickMag;
                if (bloc) cls += ` ${bloc}`;
                const showG = r.mostraGiacenze !== false;
                const dispStyle = showG && r.disponibilita != null ? 'font-weight:bold;' : '';
                html += `<tr class="${cls}" data-codart="${esc(r.codart)}" data-magaz="${esc(r.magaz)}" data-fase="${esc(r.fase)}">
                    <td class="col-row"></td>
                    <td class="col-parte" style="padding-left:30px; color:var(--text-muted);">${esc(r.codart)}</td>
                    <td class="col-mag">${esc(r.magaz)}</td>
                    <td class="col-fase">${esc(r.fase)}</td>
                    <td class="col-pol">${esc(r.descMagazzino || '')}</td>
                    <td class="col-um">${esc(r.um || 'PZ')}</td>
                    <td class="col-num cell-esistenza">${showG && r.esistenza != null ? fmt(r.esistenza) : ''}</td>
                    <td class="col-num cell-ordinato">${showG && r.ordinato != null ? fmt(r.ordinato) : ''}</td>
                    <td class="col-num cell-impegnato">${showG && r.impegnato != null ? fmt(r.impegnato) : ''}</td>
                    <td class="col-num cell-disponibilita" style="${dispStyle}">${showG && r.disponibilita != null ? fmt(r.disponibilita) : ''}</td>
                    <td class="col-date">${fmtDate(r.dataCons)}</td>
                    <td class="col-num">${fmt(r.opc)}</td>
                    <td class="col-num">${fmt(r.op)}</td>
                    <td class="col-num">${fmt(r.ipc)}</td>
                    <td class="col-num">${fmt(r.ip)}</td>
                    <td class="col-num cell-disp-netta" style="font-weight:bold;">${fmt(dnet)}</td>
                </tr>`;
            } else if (r.tipo === 'totale') {
                const disp = r.disponibilita || 0;
                const dnet = dispNettaMrpRow(r);
                const bloc = classeBloccoMrp(r.etichettaBlocco);
                const clickTot = ' mrp-totale-click';
                const clsTot = `mrp-row-totale${clickTot}${bloc ? ` ${bloc}` : ''}`;
                html += `<tr class="${clsTot}" data-codart="${esc(r.codart)}" data-fase="${esc(r.fase)}" data-disp-netta="${dnet}">
                    <td class="col-row"></td>
                    <td class="col-parte" style="padding-left:30px; font-weight:bold;">${parteLabelTotaleFlat(r)}</td>
                    <td class="col-mag">All</td>
                    <td class="col-fase">${esc(r.fase)}</td>
                    <td class="col-pol"></td>
                    <td class="col-um">${esc(r.um || 'PZ')}</td>
                    <td class="col-num">${fmt(r.esistenza)}</td>
                    <td class="col-num">${fmt(r.ordinato)}</td>
                    <td class="col-num">${fmt(r.impegnato)}</td>
                    <td class="col-num">${fmt(disp)}</td>
                    <td class="col-date"></td>
                    <td class="col-num">${fmt(r.opc)}</td>
                    <td class="col-num">${fmt(r.op)}</td>
                    <td class="col-num">${fmt(r.ipc)}</td>
                    <td class="col-num">${fmt(r.ip)}</td>
                    <td class="col-num">${fmt(dnet)}</td>
                </tr>`;
            } else if (r.tipo === 'totale-cross-fase') {
                const disp = r.disponibilita || 0;
                const dnet = dispNettaMrpRow(r);
                const blocCf = classeBloccoMrp(r.etichettaBlocco);
                const clickCf = ' mrp-totale-click';
                const clsCf = `mrp-row-totale-cross${clickCf}${blocCf ? ` ${blocCf}` : ''}`;
                html += `<tr class="${clsCf}" data-codart="${esc(r.codart)}" data-fase="${esc(r.fase)}" data-disp-netta="${dnet}">
                    <td class="col-row"></td>
                    <td class="col-parte" style="padding-left:30px; font-weight:bold;">${parteLabelTotaleFlat(r)}</td>
                    <td class="col-mag">All</td>
                    <td class="col-fase">All</td>
                    <td class="col-pol"></td>
                    <td class="col-um">${esc(r.um || 'PZ')}</td>
                    <td class="col-num">${fmt(r.esistenza)}</td>
                    <td class="col-num">${fmt(r.ordinato)}</td>
                    <td class="col-num">${fmt(r.impegnato)}</td>
                    <td class="col-num">${fmt(disp)}</td>
                    <td class="col-date"></td>
                    <td class="col-num">${fmt(r.opc)}</td>
                    <td class="col-num">${fmt(r.op)}</td>
                    <td class="col-num">${fmt(r.ipc)}</td>
                    <td class="col-num">${fmt(r.ip)}</td>
                    <td class="col-num">${fmt(dnet)}</td>
                </tr>`;
            }
        }
        return html;
    }

    function fillNestedTbody(tbody, mrpRows) {
        if (!tbody) return;
        const emptyMode = mrpRows.length ? 'none' : 'fetched-empty';
        tbody.innerHTML = nestedTbodyFromMrp(mrpRows, { emptyMode });
    }

    function childPairExistsIn(bomTbody, parentCodart, childCodart) {
        if (!bomTbody) return false;
        return [...bomTbody.querySelectorAll('tr.mrp-row-articolo')].some(
            tr => tr.dataset.bomParent === parentCodart && tr.dataset.codart === childCodart
        );
    }

    /**
     * Appende coppie (riga articolo + riga matrioska) nel tbody BOM della sotto-tabella.
     */
    function appendBomChildrenTo(bomTbody, parentCodart, components, { hide }) {
        if (!bomTbody || !components.length) {
            renumberRows();
            return;
        }
        for (const c of components) {
            if (childPairExistsIn(bomTbody, parentCodart, c.codart)) continue;
            const livello = c.livello != null ? c.livello : 1;
            const { articleTr, nestedTr } = createArticoloPair(c, [], {
                rowNum: '',
                bomParentCodart: parentCodart,
                livello
            });
            bomTbody.appendChild(articleTr);
            bomTbody.appendChild(nestedTr);
            if (hide) {
                articleTr.style.display = 'none';
                nestedTr.style.display = 'none';
            }
        }
        renumberRows();
    }

    function renumberRows() {
        const tbl = document.getElementById('tblProgressivi');
        if (!tbl) return;
        let n = 1;
        for (const tr of tbl.querySelectorAll('tr.mrp-row-articolo')) {
            const cell = tr.querySelector('td.col-row');
            if (cell) cell.textContent = String(n++);
        }
    }

    function isMatrioskaOpen(nestedTr) {
        return nestedTr && nestedTr.style.display === 'table-row';
    }

    async function handleToggleMatrioska(btn) {
        const tr = btn.closest('tr.mrp-row-articolo');
        if (!tr) return;
        const nestedTr = tr.nextElementSibling;
        if (!nestedTr || !nestedTr.classList.contains('matrioska-nested-row')) return;

        const codart = tr.dataset.codart;
        const livello = parseInt(tr.dataset.livello || '0', 10);
        const mrpInner = nestedTr.querySelector('.mrp-nested-tbody');
        const bomInner = nestedTr.querySelector('.bom-nested-tbody');

        if (isMatrioskaOpen(nestedTr)) {
            nestedTr.style.display = 'none';
            btn.textContent = 'Espandi ▼';
            return;
        }

        if (expandFetched[codart]) {
            nestedTr.style.display = 'table-row';
            btn.textContent = 'Chiudi ▲';
            return;
        }

        const prevLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
            const { mrp, components } = await fetchExpand(codart, livello);
            fillNestedTbody(mrpInner, mrp);
            tr.dataset.mrpLoaded = '1';
            applyTotaliToArticoloRow(tr, mrp);
            if (bomInner && components.length) {
                appendBomChildrenTo(bomInner, codart, components, { hide: false });
            }
            expandFetched[codart] = true;
        } catch (err) {
            console.error('[Progressivi] Matrioska:', err);
            btn.textContent = prevLabel;
            btn.disabled = false;
            return;
        }
        btn.textContent = 'Chiudi ▲';
        btn.disabled = false;
        nestedTr.style.display = 'table-row';
    }

    function setActiveTab(tabId) {
        document.querySelectorAll('.modal-ordini-tabs .modal-tab').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
    }

    async function apriModaleOrdini(codart, magaz, fase, descMagazzino) {
        const overlay = document.getElementById('modalOrdiniOverlay');
        const btnBack = document.getElementById('modalOrdiniBtnBack');
        const filtroToggle = document.getElementById('modalFiltroMagToggle');
        const filtroLabel = document.getElementById('modalFiltroMagLabel');
        const filtroText = document.getElementById('modalFiltroMagText');

        currentModalContext = { codart, magaz, fase, descMagazzino: descMagazzino || '' };

        if (btnBack) btnBack.style.display = 'none';
        if (filtroLabel) filtroLabel.style.display = 'flex';
        ripristinaHeaderModale();
        setActiveTab('modalTabOrdini');

        if (filtroToggle) filtroToggle.checked = false;
        if (filtroText) {
            filtroText.textContent = descMagazzino
                ? `Solo ${descMagazzino}`
                : `Solo Mag. ${magaz || '?'}`;
        }

        overlay.classList.add('open');

        await caricaOrdiniModale(codart, '', '');
    }

    // ── Breadcrumb funzioni ──
    function _pushBreadcrumb(codart, descr) {
        // Non aggiungere duplicato se siamo già su questo articolo
        if (_navStack.length > 0 && _navStack[_navStack.length - 1].codart === codart) return;
        _navStack.push({ codart, descr: descr || codart });
        _renderBreadcrumb();
    }

    function _resetBreadcrumb() {
        _navStack = [];
        _renderBreadcrumb();
    }

    function _renderBreadcrumb() {
        const el = document.getElementById('progressiviBreadcrumb');
        if (!el) return;
        if (_navStack.length <= 1) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'flex';
        el.innerHTML = '';

        _navStack.forEach((item, idx) => {
            if (idx > 0) {
                const sep = document.createElement('span');
                sep.className = 'breadcrumb-separator';
                sep.textContent = '\u25B6';
                el.appendChild(sep);
            }

            const span = document.createElement('span');
            const isLast = idx === _navStack.length - 1;
            span.className = 'breadcrumb-item' + (isLast ? ' current' : '');

            // Mostra codice + descrizione troncata
            const label = item.codart + (item.descr && item.descr !== item.codart ? ' \u2014 ' + item.descr.substring(0, 30) : '');
            span.textContent = (idx === 0 ? '\u21A9 ' : '') + label;
            span.title = item.descr || item.codart;

            if (!isLast) {
                span.addEventListener('click', () => {
                    // Torna a questo livello — tronca lo stack
                    _navStack = _navStack.slice(0, idx + 1);
                    _renderBreadcrumb();
                    // Naviga a quell'articolo
                    navigaProgressiviDaRmp(item.codart);
                });
            }

            el.appendChild(span);
        });
    }

    // ── Ordinamento e personalizzazione tabelle nel ciclo esplorativo ──
    let _ordiniModaleData = [];
    let _ordiniModaleSortCol = null;
    let _ordiniModaleSortAsc = true;
    let _currentRenderFn = null;
    let _currentTableId = null; // ID tabella attiva per ColumnManager

    function _sortData(data, col, asc) {
        return [...data].sort((a, b) => {
            let va = a[col], vb = b[col];
            if (va === null || va === undefined) va = '';
            if (vb === null || vb === undefined) vb = '';
            if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
            if (col.includes('dat')) { const da = new Date(va || 0), db = new Date(vb || 0); return asc ? da - db : db - da; }
            const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
            return asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
    }

    function _updateHiddenColsBtn(tableId) {
        const btn = document.getElementById('btnHiddenColsOrdini');
        if (!btn || typeof ColumnManager === 'undefined') return;
        const hidden = ColumnManager.getHiddenColumns(tableId);
        if (hidden.length > 0) {
            btn.style.display = '';
            btn.innerHTML = '\uD83D\uDC41<span class="hidden-count">' + hidden.length + '</span>';
            btn.onclick = (e) => {
                e.stopPropagation();
                // Toggle dropdown
                let dd = btn.querySelector('.hidden-cols-dropdown');
                if (dd) { dd.remove(); return; }
                dd = document.createElement('div');
                dd.className = 'hidden-cols-dropdown';
                hidden.forEach(h => {
                    const item = document.createElement('div');
                    item.className = 'hidden-cols-item';
                    item.innerHTML = '\uD83D\uDC41 ' + (h.label || h.id);
                    item.addEventListener('click', () => { ColumnManager.unhideColumn(tableId, h.id); });
                    dd.appendChild(item);
                });
                btn.appendChild(dd);
                setTimeout(() => document.addEventListener('click', () => { if (dd.parentNode) dd.remove(); }, { once: true }), 10);
            };
        } else {
            btn.style.display = 'none';
        }
    }

    function _renderOrdiniModaleRows(data) {
        const tbody = document.getElementById('modalOrdiniBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        data.forEach(o => {
            const tr = document.createElement('tr');
            if (o.mo_tipork === 'Y') tr.className = 'modal-row-impprod';
            else if (o.mo_tipork === 'H' || o.mo_tipork === 'R') tr.className = 'modal-row-ordprod';
            else tr.className = 'modal-row-ordforn';

            const drillBtn = o.mo_tipork === 'Y'
                ? `<button class="btn-drill-padre" title="Mostra ordini produzione padre" data-codart="${esc(o.mo_codart)}" data-magaz="${esc(String(o.mo_magaz || ''))}" data-fase="${esc(String(o.mo_fase || ''))}">🔍</button>`
                : '';

            tr.innerHTML = `
                <td style="text-align:center">${drillBtn}</td>
                <td>${esc(o.desc_tipo || o.mo_tipork)}</td>
                <td>${esc(o.mo_anno)}</td>
                <td>${esc(o.mo_serie)}</td>
                <td>${esc(o.mo_numord)}</td>
                <td>${esc(o.mo_riga)}</td>
                <td style="text-align:center">${esc(o.mo_magaz)}</td>
                <td style="text-align:center">${esc(o.mo_fase)}</td>
                <td>${fmtDate(o.mo_datcons)}</td>
                <td style="text-align:right">${fmt(o.mo_quant)}</td>
                <td style="text-align:right">${fmt(o.mo_quaeva)}</td>
                <td>${esc(o.mo_flevas)}</td>
                <td>${esc(o.fornitore || '')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderRmpRows(data) {
        const tbody = document.getElementById('modalOrdiniBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        data.forEach(o => {
            const tr = document.createElement('tr');
            if (o.ol_tipork === 'Y') {
                tr.className = 'modal-row-impprod rmp-drill-row';
                tr.dataset.codart = o.ol_codart || '';
                tr.dataset.magaz = String(o.ol_magaz || '');
                tr.dataset.fase = String(o.ol_fase || '');
                tr.title = 'Clicca per vedere gli ordini produzione padre';
            } else if (o.ol_tipork === 'H' || o.ol_tipork === 'R') {
                tr.className = 'modal-row-ordprod';
            } else {
                tr.className = 'modal-row-ordforn';
            }
            const badgeColor = o.conf_gen === 'Confermato' ? 'background:#16a34a;color:white;' : 'background:#f59e0b;color:white;';
            const badge = '<span style="border-radius:3px;padding:2px 6px;font-size:0.75rem;font-weight:bold;' + badgeColor + '">' + esc(o.conf_gen || '') + '</span>';
            tr.innerHTML = '<td style="text-align:center">' + esc(o.ol_magaz) + '</td>'
                + '<td style="text-align:center">' + esc(o.ol_fase) + '</td>'
                + '<td>' + fmtDate(o.ol_datcons) + '</td>'
                + '<td>' + esc(o.desc_tipo || o.ol_tipork) + '</td>'
                + '<td style="text-align:right"><strong>' + fmt(o.quantita) + '</strong></td>'
                + '<td style="text-align:center">' + badge + '</td>'
                + '<td>' + esc(o.fornitore || '') + '</td>';
            tbody.appendChild(tr);
        });
    }

    function _renderDrillPadreRows(data) {
        const tbody = document.getElementById('modalOrdiniBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        data.forEach(o => {
            const tr = document.createElement('tr');
            tr.className = 'modal-row-ordprod';
            tr.innerHTML = '<td></td>'
                + '<td>' + esc(o.padre_desc_tipo || o.padre_tipork) + '</td>'
                + '<td>' + esc(o.padre_anno) + '</td>'
                + '<td>' + esc(o.padre_serie) + '</td>'
                + '<td>' + esc(o.padre_numord) + '</td>'
                + '<td>' + esc(o.padre_riga) + '</td>'
                + '<td><strong>' + esc(o.padre_codart) + '</strong></td>'
                + '<td>' + esc(o.padre_descr) + '</td>'
                + '<td style="text-align:center">' + esc(o.padre_magaz) + '</td>'
                + '<td style="text-align:center">' + esc(o.padre_fase) + '</td>'
                + '<td>' + fmtDate(o.padre_datcons) + '</td>'
                + '<td style="text-align:right">' + fmt(o.padre_quant) + '</td>'
                + '<td>' + esc(o.padre_fornitore || '') + '</td>';
            tbody.appendChild(tr);
        });
    }

    function _renderDrillPadreRmpRows(data) {
        const tbody = document.getElementById('modalOrdiniBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        data.forEach(o => {
            const tr = document.createElement('tr');
            tr.className = 'modal-row-ordprod rmp-row-clickable';
            tr.dataset.codart = o.padre_codart;
            const badgeColor = o.padre_conf_gen === 'Confermato' ? 'background:#16a34a;color:white;' : 'background:#f59e0b;color:white;';
            const badge = '<span style="border-radius:3px;padding:2px 6px;font-size:0.75rem;font-weight:bold;' + badgeColor + '">' + esc(o.padre_conf_gen || '') + '</span>';
            tr.innerHTML = '<td><strong>' + esc(o.padre_codart) + '</strong></td>'
                + '<td style="text-align:center">' + esc(o.padre_magaz) + '</td>'
                + '<td style="text-align:center">' + esc(o.padre_fase) + '</td>'
                + '<td>' + esc(o.padre_descr) + '</td>'
                + '<td>' + fmtDate(o.datcons) + '</td>'
                + '<td>' + esc(o.padre_desc_tipo || o.padre_tipork) + '</td>'
                + '<td style="text-align:right"><strong>' + fmt(o.quantita) + '</strong></td>'
                + '<td style="text-align:center">' + badge + '</td>'
                + '<td>' + esc(o.padre_fornitore || '') + '</td>';
            tbody.appendChild(tr);
        });
    }

    function _sortOrdiniModale(col) {
        if (_ordiniModaleSortCol === col) {
            _ordiniModaleSortAsc = !_ordiniModaleSortAsc;
        } else {
            _ordiniModaleSortCol = col;
            _ordiniModaleSortAsc = true;
        }
        const sorted = [..._ordiniModaleData].sort((a, b) => {
            let va = a[col], vb = b[col];
            if (va === null || va === undefined) va = '';
            if (vb === null || vb === undefined) vb = '';
            // Numeri
            if (typeof va === 'number' && typeof vb === 'number') return _ordiniModaleSortAsc ? va - vb : vb - va;
            // Date
            if (col === 'mo_datcons') {
                const da = new Date(va || 0), db = new Date(vb || 0);
                return _ordiniModaleSortAsc ? da - db : db - da;
            }
            // Stringhe
            const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
            return _ordiniModaleSortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
        (_currentRenderFn || _renderOrdiniModaleRows)(sorted);

        // Aggiorna indicatori nelle intestazioni
        document.querySelectorAll('#tblModalOrdini thead th[data-sort]').forEach(th => {
            const base = th.textContent.replace(/ [▲▼⇅]$/, '');
            if (th.dataset.sort === col) {
                th.textContent = base + (_ordiniModaleSortAsc ? ' ▲' : ' ▼');
            } else {
                th.textContent = base + ' ⇅';
            }
        });
    }

    // Delegazione click sulle intestazioni
    (function initOrdiniSort() {
        document.addEventListener('click', (e) => {
            const th = e.target.closest('#tblModalOrdini thead th[data-sort]');
            if (th && _ordiniModaleData.length > 0) {
                _sortOrdiniModale(th.dataset.sort);
            }
        });
    })();

    async function caricaOrdiniModale(codart, magaz, fase) {
        const tbody = document.getElementById('modalOrdiniBody');
        const loading = document.getElementById('modalOrdiniLoading');
        const titolo = document.getElementById('modalOrdiniTitolo');

        const codartList = splitCodartComposito(codart);
        const titoloCod = codartList.length > 1 ? codartList.join(' + ') : codart;

        tbody.innerHTML = '';
        loading.style.display = 'block';
        titolo.textContent = `Ordini/Impegni: ${titoloCod} — ${magaz ? 'Mag ' + magaz : 'Tutti i magazzini'}${fase ? ', Fase ' + fase : ''}`;

        try {
            let data;
            let anyErr = null;
            if (codartList.length > 1) {
                const chunks = await Promise.all(codartList.map(async (cod) => {
                    const params = new URLSearchParams({ codart: cod });
                    if (magaz) params.set('magaz', magaz);
                    if (fase) params.set('fase', fase);
                    const res = await fetch(`${MrpApp.API_BASE}/ordini-dettaglio?${params}`, { credentials: 'include' });
                    const d = await res.json();
                    if (!res.ok) {
                        anyErr = d.error || 'Errore';
                        return [];
                    }
                    return Array.isArray(d) ? d : [];
                }));
                data = chunks.flat();
            } else {
                const params = new URLSearchParams({ codart });
                if (magaz) params.set('magaz', magaz);
                if (fase) params.set('fase', fase);
                const res = await fetch(`${MrpApp.API_BASE}/ordini-dettaglio?${params}`, { credentials: 'include' });
                data = await res.json();
                if (!res.ok) {
                    loading.style.display = 'none';
                    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--danger)">Errore: ${esc(data.error || '')}</td></tr>`;
                    return;
                }
            }

            loading.style.display = 'none';

            if (anyErr && codartList.length > 1) {
                tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--danger)">Errore: ${esc(anyErr)}</td></tr>`;
                return;
            }
            if (!Array.isArray(data) || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:24px;">Nessun ordine/impegno attivo</td></tr>';
                return;
            }

            _ordiniModaleData = data;
            _ordiniModaleSortCol = null;
            _ordiniModaleSortAsc = true;
            _currentRenderFn = _renderOrdiniModaleRows;
            _currentTableId = 'ordini_impegni';
            // Header via ColumnManager (se disponibile)
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.buildHeader('ordini_impegni', document.querySelector('#tblModalOrdini thead tr'));
            }
            _renderOrdiniModaleRows(data);
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.applyToBody('ordini_impegni', document.getElementById('modalOrdiniBody'));
                _updateHiddenColsBtn('ordini_impegni');
            }
        } catch (err) {
            loading.style.display = 'none';
            tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--danger)">Errore di connessione</td></tr>`;
        }
    }

    async function caricaRmpModale(codart, fase) {
        const tbody = document.getElementById('modalOrdiniBody');
        const loading = document.getElementById('modalOrdiniLoading');
        const titolo = document.getElementById('modalOrdiniTitolo');

        const codartList = splitCodartComposito(codart);
        const titoloCod = codartList.length > 1 ? codartList.join(' + ') : codart;
        titolo.textContent = `MRP (Generati/Confermati): ${titoloCod}`;

        const thead = document.querySelector('#tblModalOrdini thead tr');
        if (thead) {
            thead.innerHTML = `
                <th data-sort="ol_magaz" style="cursor:pointer;">Mag \u21C5</th>
                <th data-sort="ol_fase" style="cursor:pointer;">Fase \u21C5</th>
                <th data-sort="ol_datcons" style="cursor:pointer;">Data Cons. \u21C5</th>
                <th data-sort="desc_tipo" style="cursor:pointer;">Operazione \u21C5</th>
                <th data-sort="quantita" style="cursor:pointer;">Q.t\u00e0 Ordinata \u21C5</th>
                <th data-sort="conf_gen" style="cursor:pointer;">Stato \u21C5</th>
                <th data-sort="fornitore" style="cursor:pointer;">Fornitore \u21C5</th>
            `;
        }

        tbody.innerHTML = '';
        loading.style.display = 'block';

        try {
            const allData = await Promise.all(codartList.map(async (cod) => {
                const params = new URLSearchParams({ codart: cod });
                if (fase) params.set('fase', fase);
                const res = await fetch(`${MrpApp.API_BASE}/ordini-rmp?${params}`, { credentials: 'include' });
                const rowset = await res.json();
                if (!res.ok) return { ok: false, err: rowset };
                return { ok: true, rows: Array.isArray(rowset) ? rowset : [] };
            }));

            const failed = allData.find(x => x && x.ok === false);
            if (failed) {
                loading.style.display = 'none';
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">Errore: ${esc((failed.err || {}).error || '')}</td></tr>`;
                return;
            }

            const data = allData.flatMap(x => (x.rows || []));
            loading.style.display = 'none';

            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nessun dato RMP trovato</td></tr>';
                return;
            }

            _ordiniModaleData = data;
            _ordiniModaleSortCol = null;
            _ordiniModaleSortAsc = true;
            _currentRenderFn = _renderRmpRows;
            _currentTableId = 'rmp';
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.buildHeader('rmp', document.querySelector('#tblModalOrdini thead tr'));
            }
            _renderRmpRows(data);
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.applyToBody('rmp', document.getElementById('modalOrdiniBody'));
                _updateHiddenColsBtn('rmp');
            }
        } catch (err) {
            loading.style.display = 'none';
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger)">Errore di connessione</td></tr>';
        }
    }

    async function apriDrillPadre(codart, magaz, fase) {
        const tbody = document.getElementById('modalOrdiniBody');
        const loading = document.getElementById('modalOrdiniLoading');
        const titolo = document.getElementById('modalOrdiniTitolo');
        const btnBack = document.getElementById('modalOrdiniBtnBack');
        const filtroLabel = document.getElementById('modalFiltroMagLabel');

        if (btnBack) btnBack.style.display = 'inline-flex';
        if (filtroLabel) filtroLabel.style.display = 'none';
        titolo.textContent = `Produzione che consuma: ${codart} — Mag: ${magaz || 'Tutti'}`;

        const thead = document.querySelector('#tblModalOrdini thead tr');
        if (thead) {
            thead.innerHTML = `
            <th style="width:30px;"></th>
            <th data-sort="padre_desc_tipo" style="cursor:pointer;">Operazione \u21C5</th>
            <th data-sort="padre_anno" style="cursor:pointer;">Anno \u21C5</th>
            <th data-sort="padre_serie" style="cursor:pointer;">Ser \u21C5</th>
            <th data-sort="padre_numord" style="cursor:pointer;">Num.Doc \u21C5</th>
            <th data-sort="padre_riga" style="cursor:pointer;">Riga \u21C5</th>
            <th data-sort="padre_codart" style="cursor:pointer;">Cod. Art. Padre \u21C5</th>
            <th data-sort="padre_descr" style="cursor:pointer;">Descrizione Articolo \u21C5</th>
            <th data-sort="padre_magaz" style="cursor:pointer;">Mag \u21C5</th>
            <th data-sort="padre_fase" style="cursor:pointer;">Fase \u21C5</th>
            <th data-sort="padre_datcons" style="cursor:pointer;">Data Cons. \u21C5</th>
            <th data-sort="padre_quant" style="cursor:pointer;">Q.t\u00e0 \u21C5</th>
            <th data-sort="padre_fornitore" style="cursor:pointer;">Fornitore \u21C5</th>
        `;
        }

        tbody.innerHTML = '';
        loading.style.display = 'block';

        try {
            const params = new URLSearchParams({ codart });
            if (magaz) params.set('magaz', magaz);
            if (fase) params.set('fase', fase);

            const res = await fetch(`${MrpApp.API_BASE}/ordini-padre?${params}`, { credentials: 'include' });
            const data = await res.json();
            loading.style.display = 'none';

            if (!res.ok) {
                tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--danger)">Errore: ${esc(data.error || '')}</td></tr>`;
                return;
            }
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:24px;">Nessun ordine produzione padre trovato</td></tr>';
                return;
            }

            _ordiniModaleData = data;
            _ordiniModaleSortCol = null;
            _ordiniModaleSortAsc = true;
            _currentRenderFn = _renderDrillPadreRows;
            _currentTableId = 'drill_padre';
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.buildHeader('drill_padre', document.querySelector('#tblModalOrdini thead tr'));
            }
            _renderDrillPadreRows(data);
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.applyToBody('drill_padre', document.getElementById('modalOrdiniBody'));
                _updateHiddenColsBtn('drill_padre');
            }
        } catch (err) {
            loading.style.display = 'none';
            tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--danger)">Errore di connessione</td></tr>`;
        }
    }

    async function apriDrillPadreRmp(codart, magaz, fase) {
        const tbody = document.getElementById('modalOrdiniBody');
        const loading = document.getElementById('modalOrdiniLoading');
        const titolo = document.getElementById('modalOrdiniTitolo');
        const btnBack = document.getElementById('modalOrdiniBtnBack');
        const filtroLabel = document.getElementById('modalFiltroMagLabel');

        if (btnBack) btnBack.style.display = 'inline-flex';
        if (filtroLabel) filtroLabel.style.display = 'none';
        titolo.textContent = `Produzione che consuma: ${codart} — Mag: ${magaz || 'Tutti'}`;

        const thead = document.querySelector('#tblModalOrdini thead tr');
        if (thead) {
            thead.innerHTML = `
            <th data-sort="padre_codart" style="cursor:pointer;">Cod. Art. \u21C5</th>
            <th data-sort="padre_magaz" style="cursor:pointer;">Mag \u21C5</th>
            <th data-sort="padre_fase" style="cursor:pointer;">Fase \u21C5</th>
            <th data-sort="padre_descr" style="cursor:pointer;">Descrizione Articolo \u21C5</th>
            <th data-sort="datcons" style="cursor:pointer;">Data Cons. \u21C5</th>
            <th data-sort="padre_desc_tipo" style="cursor:pointer;">Operazione \u21C5</th>
            <th data-sort="quantita" style="cursor:pointer;">Q.t\u00e0 Ordinata \u21C5</th>
            <th data-sort="padre_conf_gen" style="cursor:pointer;">Stato \u21C5</th>
            <th data-sort="padre_fornitore" style="cursor:pointer;">Fornitore \u21C5</th>
        `;
        }

        tbody.innerHTML = '';
        loading.style.display = 'block';

        try {
            const params = new URLSearchParams({ codart });
            if (magaz) params.set('magaz', magaz);
            if (fase) params.set('fase', fase);

            const res = await fetch(`${MrpApp.API_BASE}/ordini-padre-rmp?${params}`, { credentials: 'include' });
            const data = await res.json();
            loading.style.display = 'none';

            if (!res.ok) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger)">Errore: ${esc(data.error || '')}</td></tr>`;
                return;
            }
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">Nessun ordine produzione padre trovato</td></tr>';
                return;
            }

            _ordiniModaleData = data;
            _ordiniModaleSortCol = null;
            _ordiniModaleSortAsc = true;
            _currentRenderFn = _renderDrillPadreRmpRows;
            _currentTableId = 'drill_padre_rmp';
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.buildHeader('drill_padre_rmp', document.querySelector('#tblModalOrdini thead tr'));
            }
            _renderDrillPadreRmpRows(data);
            if (typeof ColumnManager !== 'undefined') {
                ColumnManager.applyToBody('drill_padre_rmp', document.getElementById('modalOrdiniBody'));
                _updateHiddenColsBtn('drill_padre_rmp');
            }
        } catch (err) {
            loading.style.display = 'none';
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger)">Errore di connessione</td></tr>`;
        }
    }

    function ripristinaHeaderModale() {
        const thead = document.querySelector('#tblModalOrdini thead tr');
        if (!thead) return;
        _currentTableId = 'ordini_impegni';
        if (typeof ColumnManager !== 'undefined') {
            ColumnManager.buildHeader('ordini_impegni', thead);
        } else {
            thead.innerHTML = `
                <th style="width:30px;"></th>
                <th style="cursor:pointer;">Operazione</th>
                <th style="cursor:pointer;">Anno</th>
                <th style="cursor:pointer;">Ser</th>
                <th style="cursor:pointer;">Num.Doc</th>
                <th style="cursor:pointer;">Riga</th>
                <th style="cursor:pointer;">Mag</th>
                <th style="cursor:pointer;">Fase</th>
                <th style="cursor:pointer;">Data Cons.</th>
                <th style="cursor:pointer;">Q.t\u00e0 Ordinata</th>
                <th style="cursor:pointer;">Q.t\u00e0 Evasa</th>
                <th style="cursor:pointer;">Stato</th>
                <th style="cursor:pointer;">Fornitore</th>
            `;
        }
    }

    function chiudiModale() {
        document.getElementById('modalOrdiniOverlay').classList.remove('open');
        currentModalContext = null;
        ripristinaHeaderModale();
    }

    function onBiConfrontoYoYChange(e) {
        biState.isYoY = e.target.checked;
        if (biState.isYoY && biState.selectedYears.size === 0) biState.selectedYears.add(new Date().getFullYear().toString());
        const rawData = consumiCache[currentCodartConsumi];
        if (rawData) {
            const anniSet = new Set();
            (rawData.past || []).concat(rawData.future || []).forEach((r) => {
                if (r.DataMov && String(r.DataMov).length >= 4) anniSet.add(String(r.DataMov).slice(0, 4));
            });
            popolaSidebarAnni(Array.from(anniSet));
        }
        aggiornaGraficoBI();
    }

    function onBiGranularitaChange() {
        const sel = document.getElementById('biGranularita');
        if (!sel) return;
        const v = sel.value;
        if (!granLevels.includes(v)) return;
        biState.granularity = v;
        if (!biState.isYoY) {
            if (biState.granularity === 'anno') biState.filter = null;
            else if (biState.granularity === 'mese' && biState.filter && biState.filter.length > 4) biState.filter = biState.filter.slice(0, 4);
        }

        const rawData = consumiCache[currentCodartConsumi];
        if (rawData) {
            const anniSet = new Set();
            (rawData.past || []).concat(rawData.future || []).forEach((r) => {
                if (r.DataMov && String(r.DataMov).length >= 4) anniSet.add(String(r.DataMov).slice(0, 4));
            });
            popolaSidebarAnni(Array.from(anniSet));
        }
        aggiornaGraficoBI();
    }

    function syncBiGranularitaSelect() {
        const sel = document.getElementById('biGranularita');
        if (!sel) return;
        sel.disabled = false;
        if (granLevels.includes(biState.granularity)) sel.value = biState.granularity;
    }

    function onConsumiOlapWheel(e) {
        if (!consumiCache[currentCodartConsumi]) return;
        e.preventDefault();
        const gIdx = granLevels.indexOf(biState.granularity);

        if (e.deltaY > 0) {
            if (gIdx > 0) {
                biState.granularity = granLevels[gIdx - 1];
                if (!biState.isYoY) {
                    if (biState.granularity === 'anno') biState.filter = null;
                    else if (biState.granularity === 'mese' && biState.filter && biState.filter.length > 4) biState.filter = biState.filter.slice(0, 4);
                }
            }
        } else if (gIdx < granLevels.length - 1) {
            biState.granularity = granLevels[gIdx + 1];
        }

        const rawData = consumiCache[currentCodartConsumi];
        const anniSet = new Set();
        (rawData.past || []).concat(rawData.future || []).forEach((r) => {
            if (r.DataMov && String(r.DataMov).length >= 4) anniSet.add(String(r.DataMov).slice(0, 4));
        });
        popolaSidebarAnni(Array.from(anniSet));
        aggiornaGraficoBI();
    }

    function chiudiModaleConsumi() {
        if (consumiMarathonController) {
            consumiMarathonController.abort();
            consumiMarathonController = null;
        }
        const overlay = document.getElementById('modalConsumiOverlay');
        if (overlay) overlay.classList.remove('open');
        const errEl = document.getElementById('modalConsumiError');
        if (errEl) {
            errEl.style.display = 'none';
            errEl.textContent = '';
        }
        if (consumiChartInstance) {
            consumiChartInstance.destroy();
            consumiChartInstance = null;
        }
    }

    function getMonday(d) {
        const day = d.getDay() || 7;
        const res = new Date(d);
        res.setDate(d.getDate() - day + 1);
        return res;
    }

    function buildSortKey(dStr, gran) {
        const d = new Date(dStr);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = ('0' + (d.getMonth() + 1)).slice(-2);
        const day = ('0' + d.getDate()).slice(-2);
        const q = Math.ceil((d.getMonth() + 1) / 3);
        const s = Math.ceil((d.getMonth() + 1) / 6);
        if (gran === 'anno') return `${y}`;
        if (gran === 'semestre') return `${y}-S${s}`;
        if (gran === 'trimestre') return `${y}-Q${q}`;
        if (gran === 'mese') return `${y}-${m}`;
        if (gran === 'settimana') {
            const mon = getMonday(d);
            return `${mon.getFullYear()}-${('0' + (mon.getMonth() + 1)).slice(-2)}-${('0' + mon.getDate()).slice(-2)}`;
        }
        return `${y}-${m}-${day}`;
    }

    function yoyBucketKey(dStr, gran) {
        const d = new Date(dStr);
        if (Number.isNaN(d.getTime())) return '';
        const m = ('0' + (d.getMonth() + 1)).slice(-2);
        if (gran === 'mese') return m;
        if (gran === 'trimestre') return 'Q' + Math.ceil((d.getMonth() + 1) / 3);
        if (gran === 'semestre') return 'S' + Math.ceil((d.getMonth() + 1) / 6);
        if (gran === 'settimana') {
            const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
            const pastDaysOfYear = (d - firstDayOfYear) / 86400000;
            const w = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
            return 'W' + ('0' + w).slice(-2);
        }
        if (gran === 'giorno') return m + '-' + ('0' + d.getDate()).slice(-2);
        if (gran === 'anno') return 'TOT';
        return '';
    }

    function formatDisplayLabel(key, gran, isYoY) {
        if (isYoY) {
            if (gran === 'anno' && key === 'TOT') return 'TOTALE ANNUO';
            if (gran === 'mese') {
                const mesi = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
                const idx = parseInt(key.split('-').pop(), 10) - 1;
                return mesi[idx >= 0 && idx < 12 ? idx : 0] || key;
            }
            if (gran === 'settimana' && key.startsWith('W')) return key;
            if (gran === 'giorno' && key.includes('-')) {
                const p = key.split('-');
                return `${p[1]}/${p[0]}`;
            }
            if (gran === 'trimestre' || gran === 'semestre') return key;
        }
        if (gran === 'anno') return key;
        if (gran === 'semestre' || gran === 'trimestre') return key.includes('-') ? key.split('-').reverse().join(' ') : key;
        if (gran === 'mese') {
            const mesi = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
            const p = key.split('-');
            return `${mesi[parseInt(p[1], 10) - 1]} ${p[0].slice(2)}`;
        }
        if (gran === 'settimana') return `${key.slice(8, 10)}/${key.slice(5, 7)} (W)`;
        return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
    }

    function popolaSidebarAnni(anni) {
        const sidebar = document.getElementById('biSidebarAnni');
        if (!sidebar) return;

        sidebar.innerHTML = '<div style="font-size:0.7rem; font-weight:bold; color:var(--text-muted); text-align:center; margin-bottom:4px;">ANNI</div>';

        if (!biState.isYoY) {
            const btnAll = document.createElement('button');
            btnAll.className = 'mrp-nav-btn' + (!biState.filter ? ' active' : '');
            btnAll.style.width = '100%';
            btnAll.style.marginBottom = '6px';
            btnAll.style.padding = '4px';
            btnAll.textContent = 'Tutto';
            btnAll.onclick = () => {
                biState.filter = null;
                biState.granularity = 'anno';
                popolaSidebarAnni(anni);
                aggiornaGraficoBI();
            };
            sidebar.appendChild(btnAll);
        }

        let colorIdx = Object.keys(biState.yearColors).length;

        anni.sort().reverse().forEach((anno) => {
            if (!biState.yearColors[anno]) {
                biState.yearColors[anno] = BI_PALETTE[colorIdx % BI_PALETTE.length];
                colorIdx++;
            }

            const rowDiv = document.createElement('div');
            rowDiv.style.display = 'flex';
            rowDiv.style.gap = '4px';
            rowDiv.style.marginBottom = '4px';
            rowDiv.style.alignItems = 'stretch';

            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = biState.yearColors[anno];
            colorPicker.style.width = '20px';
            colorPicker.style.padding = '0';
            colorPicker.style.border = 'none';
            colorPicker.style.cursor = 'pointer';
            colorPicker.style.backgroundColor = 'transparent';
            colorPicker.title = `Cambia colore per il ${anno}`;
            colorPicker.onchange = (e) => {
                biState.yearColors[anno] = e.target.value;
                aggiornaGraficoBI();
            };

            const btn = document.createElement('button');
            const isActive = biState.isYoY ? biState.selectedYears.has(anno) : (biState.filter && biState.filter.startsWith(anno));
            btn.className = 'mrp-nav-btn' + (isActive ? ' active' : '');
            btn.style.flex = '1';
            btn.style.padding = '4px';
            btn.textContent = anno;
            btn.onclick = () => {
                if (biState.isYoY) {
                    if (biState.selectedYears.has(anno)) biState.selectedYears.delete(anno);
                    else biState.selectedYears.add(anno);
                } else {
                    biState.filter = anno;
                    biState.granularity = 'mese';
                }
                popolaSidebarAnni(anni);
                aggiornaGraficoBI();
            };

            rowDiv.appendChild(colorPicker);
            rowDiv.appendChild(btn);
            sidebar.appendChild(rowDiv);
        });
    }

    function aggiornaGraficoBI() {
        const rawData = consumiCache[currentCodartConsumi];
        if (!rawData) return;

        const labGran = document.getElementById('biGranularitaLabel');
        const breadcrumb = document.getElementById('biBreadcrumb');
        const canvas = document.getElementById('chartConsumi');
        if (labGran) labGran.textContent = biState.granularity.toUpperCase();
        if (breadcrumb) {
            breadcrumb.textContent = biState.isYoY ? 'Confronto Linee' : (biState.filter ? `Filtro: ${biState.filter}` : 'Tutto lo Storico');
        }
        syncBiGranularitaSelect();
        if (!canvas || typeof Chart === 'undefined') return;

        const anniSet = new Set();
        (rawData.past || []).concat(rawData.future || []).forEach((r) => {
            if (r.DataMov && String(r.DataMov).length >= 4) anniSet.add(String(r.DataMov).slice(0, 4));
        });

        const gran = biState.granularity;
        const mapData = {};
        const yoyMap = {};

        const processArray = (arr, isFuture) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((row) => {
                if (!row.DataMov) return;
                const rowAnno = String(row.DataMov).slice(0, 4);

                if (biState.isYoY) {
                    if (!biState.selectedYears.has(rowAnno)) return;
                    const bk = yoyBucketKey(row.DataMov, biState.granularity);
                    if (!bk) return;
                    const ck = `${rowAnno}::${bk}`;
                    if (!yoyMap[ck]) yoyMap[ck] = 0;
                    yoyMap[ck] += Number(row.Qta);
                } else {
                    if (biState.filter && !String(row.DataMov).startsWith(biState.filter)) return;
                    const key = buildSortKey(row.DataMov, gran);
                    if (!key) return;
                    if (!mapData[key]) mapData[key] = { past: 0, future: 0 };
                    if (isFuture) mapData[key].future += Number(row.Qta);
                    else mapData[key].past += Number(row.Qta);
                }
            });
        };

        processArray(rawData.past || [], false);
        processArray(rawData.future || [], true);

        const sortedKeys = Object.keys(mapData).sort();
        biState.chartKeysMap = biState.isYoY ? [] : sortedKeys;

        let labels = [];
        let datasets = [];

        if (biState.isYoY) {
            let orderedBuckets = [];
            if (biState.granularity === 'mese') {
                for (let i = 1; i <= 12; i++) orderedBuckets.push(('0' + i).slice(-2));
            } else if (biState.granularity === 'trimestre') {
                orderedBuckets = ['Q1', 'Q2', 'Q3', 'Q4'];
            } else if (biState.granularity === 'semestre') {
                orderedBuckets = ['S1', 'S2'];
            } else if (biState.granularity === 'anno') {
                orderedBuckets = ['TOT'];
            } else {
                const bs = new Set();
                Object.keys(yoyMap).forEach((composite) => {
                    const parts = composite.split('::');
                    if (parts.length >= 2) bs.add(parts.slice(1).join('::'));
                });
                orderedBuckets = Array.from(bs).sort();
            }
            labels = orderedBuckets.map((b) => formatDisplayLabel(b, biState.granularity, true));

            Array.from(biState.selectedYears).sort().forEach((anno) => {
                const dataPoints = orderedBuckets.map((b) => yoyMap[`${anno}::${b}`] || 0);
                datasets.push({
                    label: `Anno ${anno}`,
                    data: dataPoints,
                    borderColor: biState.yearColors[anno] || '#2563a8',
                    backgroundColor: biState.yearColors[anno] || '#2563a8',
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 4,
                    fill: false
                });
            });
        } else {
            labels = sortedKeys.map(k => formatDisplayLabel(k, gran, false));

            const pastColors = [];
            const futureColors = [];
            const futureBorders = [];

            sortedKeys.forEach((k) => {
                const year = k.slice(0, 4);
                const color = biState.yearColors[year] || '#2563a8';
                pastColors.push(color);
                futureColors.push(hexToRgba(color, 0.4));
                futureBorders.push(color);
            });

            datasets = [
                {
                    label: 'Storico (Consumi)',
                    data: sortedKeys.map(k => mapData[k].past),
                    backgroundColor: pastColors,
                    borderRadius: 4
                },
                {
                    label: 'Previsionale (Impegni)',
                    data: sortedKeys.map(k => mapData[k].future),
                    backgroundColor: futureColors,
                    borderColor: futureBorders,
                    borderWidth: 2,
                    borderDash: [4, 4],
                    borderSkipped: false,
                    borderRadius: 4
                }
            ];
        }

        const ctx = canvas.getContext('2d');
        if (consumiChartInstance) consumiChartInstance.destroy();

        consumiChartInstance = new Chart(ctx, {
            type: biState.isYoY ? 'line' : 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: datasets.length > 1 },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const y = ctx.parsed && ctx.parsed.y != null ? ctx.parsed.y : ctx.raw;
                                const prefix = ctx.dataset && ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                                return prefix + fmt(y) + ' pz';
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: !biState.isYoY, grid: { display: false } },
                    y: { stacked: !biState.isYoY, beginAtZero: true, grid: { color: '#e2e8f0' } }
                },
                onClick: (evt, elements) => {
                    if (biState.isYoY || !elements.length) return;
                    const clickedKey = biState.chartKeysMap[elements[0].index];
                    if (!clickedKey) return;

                    if (gran === 'anno') {
                        biState.filter = clickedKey;
                        biState.granularity = 'mese';
                    } else if (gran === 'semestre' || gran === 'trimestre') {
                        biState.filter = clickedKey.slice(0, 4);
                        biState.granularity = 'mese';
                    } else if (gran === 'mese') {
                        biState.filter = clickedKey;
                        biState.granularity = 'settimana';
                    } else if (gran === 'settimana') {
                        biState.filter = clickedKey.slice(0, 7);
                        biState.granularity = 'giorno';
                    }

                    popolaSidebarAnni(Array.from(anniSet));
                    aggiornaGraficoBI();
                }
            }
        });
    }

    async function apriModaleConsumi(codart, descr) {
        const overlay = document.getElementById('modalConsumiOverlay');
        const titolo = document.getElementById('modalConsumiTitolo');
        const loading = document.getElementById('modalConsumiLoading');
        const content = document.getElementById('modalConsumiContent');
        const errorDiv = document.getElementById('modalConsumiError');
        const toolbar = document.getElementById('toolbarConsumi');
        const syncStatus = document.getElementById('biSyncStatus');
        const sidebar = document.getElementById('biSidebarAnni');
        const yoy = document.getElementById('biConfrontoYoY');
        const canvas = document.getElementById('chartConsumi');

        if (!overlay || !titolo || !loading || !content) return;

        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
        loading.textContent = 'Caricamento dati di consumo...';

        const lastResult = MrpApp.state.ultimoRisultato;
        const codartEsaur = lastResult?.articolo?.ar_codart;
        const codartSost = lastResult?.sostitutivo?.ar_codart;
        const isAccorpato = !!(codartSost && codartEsaur && String(codart) === String(codartEsaur));
        const codartCacheKey = isAccorpato ? `${codartEsaur},${codartSost}` : codart;
        const descrDisplay = isAccorpato
            ? `${descr} (${codart}) + ${lastResult.sostitutivo.ar_descr} (${codartSost})`
            : `${descr} (${codart})`;

        titolo.textContent = `Analisi Consumi e Previsioni: ${descrDisplay}`;
        currentCodartConsumi = codartCacheKey;

        biState = {
            granularity: 'mese',
            filter: null,
            isYoY: false,
            selectedYears: new Set([new Date().getFullYear().toString()]),
            chartKeysMap: [],
            yearColors: {}
        };
        if (yoy) yoy.checked = false;
        const biGranSel = document.getElementById('biGranularita');
        if (biGranSel) {
            biGranSel.value = 'mese';
            biGranSel.disabled = false;
        }
        if (toolbar) {
            toolbar.style.opacity = '0.5';
            toolbar.style.pointerEvents = 'none';
        }
        if (sidebar) {
            sidebar.style.opacity = '0.5';
            sidebar.style.pointerEvents = 'none';
        }
        if (syncStatus) {
            syncStatus.style.display = 'block';
            syncStatus.textContent = '⏳ Download in corso...';
        }

        loading.style.display = 'block';
        content.style.display = 'none';
        overlay.classList.add('open');

        try {
            const sprintUrl = isAccorpato
                ? `${MrpApp.API_BASE}/consumi/sprint-multi?codarts=${encodeURIComponent(codartCacheKey)}`
                : `${MrpApp.API_BASE}/consumi/sprint/${encodeURIComponent(codart)}`;
            const res = await fetch(sprintUrl, { credentials: 'include' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Errore caricamento');

            loading.style.display = 'none';
            content.style.display = 'flex';

            document.getElementById('kpiR12').textContent = fmt(data.kpi.R12);
            document.getElementById('kpiYTD').textContent = fmt(data.kpi.YTD);
            document.getElementById('kpiLYTD').textContent = fmt(data.kpi.LYTD);

            const trend = Array.isArray(data.trend) ? data.trend : [];
            const labels = trend.map(d => formatDisplayLabel(d.Mese, 'mese', false));

            if (canvas && typeof Chart !== 'undefined') {
                const ctx = canvas.getContext('2d');
                if (consumiChartInstance) consumiChartInstance.destroy();
                consumiChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Storico', data: trend.map(d => d.Totale), backgroundColor: '#2563a8', borderRadius: 4 }] },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label(ctx) {
                                        const y = ctx.parsed && ctx.parsed.y != null ? ctx.parsed.y : ctx.raw;
                                        return fmt(y) + ' pz';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#e2e8f0' } },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }

            if (!consumiCache[codartCacheKey]) {
                consumiMarathonController = new AbortController();
                try {
                    const marathonUrl = isAccorpato
                        ? `${MrpApp.API_BASE}/consumi/marathon-multi?codarts=${encodeURIComponent(codartCacheKey)}`
                        : `${MrpApp.API_BASE}/consumi/marathon/${encodeURIComponent(codart)}`;
                    const mRes = await fetch(marathonUrl, { credentials: 'include', signal: consumiMarathonController.signal });
                    const mData = await mRes.json();
                    if (mRes.ok && mData && typeof mData === 'object' && !Array.isArray(mData)) {
                        consumiCache[codartCacheKey] = {
                            past: Array.isArray(mData.past) ? mData.past : [],
                            future: Array.isArray(mData.future) ? mData.future : []
                        };
                    } else {
                        consumiCache[codartCacheKey] = null;
                    }
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.error('[Consumi] Marathon:', err);
                    consumiCache[codartCacheKey] = null;
                    if (syncStatus) {
                        syncStatus.style.display = 'block';
                        syncStatus.textContent = '⚠ Dati BI non disponibili';
                    }
                } finally {
                    consumiMarathonController = null;
                }
            }

            if (consumiCache[codartCacheKey]) {
                if (toolbar) {
                    toolbar.style.opacity = '1';
                    toolbar.style.pointerEvents = 'auto';
                }
                if (sidebar) {
                    sidebar.style.opacity = '1';
                    sidebar.style.pointerEvents = 'auto';
                }
                if (syncStatus) syncStatus.style.display = 'none';

                const anniSet = new Set();
                (consumiCache[codartCacheKey].past || []).forEach((r) => {
                    if (r.DataMov && String(r.DataMov).length >= 4) anniSet.add(String(r.DataMov).slice(0, 4));
                });
                (consumiCache[codartCacheKey].future || []).forEach((r) => {
                    if (r.DataMov && String(r.DataMov).length >= 4) anniSet.add(String(r.DataMov).slice(0, 4));
                });
                popolaSidebarAnni(Array.from(anniSet));
                aggiornaGraficoBI();
            } else if (syncStatus) {
                syncStatus.style.display = 'block';
                syncStatus.textContent = '⚠ Dati BI non disponibili';
            }
        } catch (err) {
            console.error('[Consumi] Sprint:', err);
            loading.style.display = 'none';
            content.style.display = 'none';
            if (errorDiv) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = `Errore caricamento dati: ${err.message}`;
            }
        }
    }

    async function apriModaleOrdiniRmp(codart, fase) {
        const overlay = document.getElementById('modalOrdiniOverlay');
        const btnBack = document.getElementById('modalOrdiniBtnBack');
        const filtroLabel = document.getElementById('modalFiltroMagLabel');

        currentModalContext = { type: 'rmp', codart, fase };
        if (btnBack) btnBack.style.display = 'none';
        if (filtroLabel) filtroLabel.style.display = 'none';
        setActiveTab('modalTabRmp');

        if (!overlay) return;
        overlay.classList.add('open');

        await caricaRmpModale(codart, fase != null ? String(fase) : '');
    }

    async function navigaProgressiviDaRmp(codartTarget) {
        chiudiModale();
        // Push nella breadcrumb (la descrizione verrà aggiornata dopo il fetch)
        _pushBreadcrumb(codartTarget, codartTarget);
        const inputCodart = document.getElementById('inputCodart');
        if (inputCodart) inputCodart.value = codartTarget;
        try {
            // Skeleton immediato — l'utente vede subito la transizione
            const tbody = getTbody();
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
                    '</div></td></tr>';
            }
            document.getElementById('progressiviTitle').textContent = codartTarget;
            MrpApp.switchView('progressivi');

            const params = new URLSearchParams({ codart: codartTarget, magaz: '', fase: '', modo: '2', sintetico: '0' });
            const res = await fetch(`${MrpApp.API_BASE}/progressivi?${params}`, { credentials: 'include' });
            const data = await res.json();
            if (res.ok) {
                MrpApp.state.parametri = { codart: codartTarget, magaz: '', fase: '', modo: '2', sintetico: '0' };
                MrpApp.state.ultimoRisultato = data;
                render(data);
            }
        } catch (err) {
            console.error('[RMP] Errore navigazione progressivi:', err);
        }
    }

    function nestedDispSummary(nestedTr) {
        const totals = nestedTr.querySelectorAll('tr.mrp-row-totale[data-disp-netta], tr.mrp-row-totale-cross[data-disp-netta]');
        const parts = [];
        totals.forEach(t => {
            const v = t.getAttribute('data-disp-netta');
            const fase = t.querySelector('td:nth-child(2)');
            const fz = fase ? fase.textContent.trim() : '';
            if (v != null && v !== '') parts.push(`Fase ${fz || '?'}: Disp.netta=${fmt(Number(v))}`);
        });
        return parts.length ? parts.join('; ') : '';
    }

    function exportTreeToClipboard() {
        const rows = document.querySelectorAll('#tblProgressivi tr.mrp-row-articolo, #tblProgressivi tr.row-magazzino, #tblProgressivi tr.mrp-row-totale, #tblProgressivi tr.mrp-row-totale-cross, #tblProgressivi tr.mrp-row-generale-totale');
        const showScaduti = document.body.classList.contains('show-scaduti');
        let output = "ESTRAZIONE ALBERO MRP\n=====================\n";

        const ths = document.querySelectorAll('#tblProgressivi thead th');
        const headers = [];
        ths.forEach(th => headers.push(th.innerText.replace(/\s+/g, ' ').trim()));
        if (headers.length > 0) {
            output += 'COLONNE: ' + headers.join(' | ') + "\n---------------------\n";
        }

        rows.forEach((row) => {
            if (!showScaduti && row.classList.contains('row-scaduto')) return;
            if (row.style.display === 'none') return;

            const livello = parseInt(row.getAttribute('data-livello') || '0', 10);
            const indent = '    '.repeat(livello);

            const cells = row.querySelectorAll(':scope > td');
            const cellTexts = [];
            cells.forEach(cell => {
                let text = cell.innerText
                    .replace(/Espandi ▼|Chiudi ▲|⏳/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                cellTexts.push(text === '' ? '-' : text);
            });

            let rigaTesto = `${indent}[L${livello}] ` + cellTexts.join(' | ');
            if (row.dataset.espandibile === '1') {
                rigaTesto += ' [+ DISTINTA]';
            }

            const nestedTr = row.nextElementSibling;
            if (nestedTr && nestedTr.classList.contains('matrioska-nested-row') && isMatrioskaOpen(nestedTr)) {
                const sum = nestedDispSummary(nestedTr);
                if (sum) {
                    rigaTesto += '\n' + indent + '    [Magazzini: ' + sum + ']';
                }
            }

            output += rigaTesto + '\n';
        });

        navigator.clipboard.writeText(output).then(() => {
            alert('Albero testuale (completo) copiato negli appunti! Puoi incollarlo nella chat IA.');
        }).catch(err => {
            console.error('Errore durante la copia:', err);
            alert('Errore durante la copia. Controlla la console.');
        });
    }

    function fmt(n) {
        if (n === '' || n === null || n === undefined) return '';
        const num = Number(n);
        if (isNaN(num)) return '';
        return num === 0 ? '0' : num.toLocaleString('it-IT');
    }

    function fmtDate(d) {
        if (!d) return '';
        const dt = (d instanceof Date) ? d : new Date(d);
        if (isNaN(dt.getTime())) return '';
        return dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.addEventListener('DOMContentLoaded', init);
    return { render };
})();
