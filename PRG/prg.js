const API_BASE = '/api/prg';
let tuttiIProgetti = [];
let gridState = {
  search: '',
  sortCol: null,
  sortDir: 'asc',
  filters: { area: [], priorita: [], stato: [] },
};

document.addEventListener('securityReady', initApp);

async function initApp() {
  const formCreaProgetto = document.getElementById('formCreaProgetto');
  const searchInput = document.getElementById('searchNomeProgetto');
  const modalCreaProgetto = document.getElementById('modalCreaProgetto');

  formCreaProgetto.addEventListener('submit', onSubmitNuovoProgetto);
  if (modalCreaProgetto) {
    modalCreaProgetto.addEventListener('show.bs.modal', () => {
      // Reset prima di impostare la data (evita valori residui tra aperture)
      formCreaProgetto.reset();
      const elDataProgetto = document.getElementById('dataProgetto');
      if (elDataProgetto) {
        elDataProgetto.value = new Date().toISOString().slice(0, 10);
      }
    });
  }
  setupFilterCheckboxHandlers();
  setupSortHeaderHandlers();

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      gridState.search = searchInput.value || '';
      applicaFiltriEOrdina();
    });
  }

  try {
    hideError();
    await loadProgetti();
  } catch (error) {
    showError(error.message);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || 'Errore durante la chiamata API.');
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loadProgetti() {
  const payload = await requestJson(`${API_BASE}/progetti`);
  tuttiIProgetti = Array.isArray(payload.data) ? payload.data : [];
  popolaFiltriDaProgetti(tuttiIProgetti);
  applicaFiltriEOrdina();
}

function getAreaDisplay(progetto) {
  return (progetto?.nome_area || '').toString().trim() || 'Senza Area';
}

function getPrioritaDisplay(progetto) {
  const v = (progetto?.priorita || '').toString().trim();
  return v || 'N/D';
}

function getStatoDisplay(progetto) {
  const v = (progetto?.stato || '').toString().trim();
  return v || 'Bozza';
}

function parseDateOrMin(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

function setupFilterCheckboxHandlers() {
  const menuIds = ['filterMenuArea', 'filterMenuPriorita', 'filterMenuStato'];
  menuIds.forEach((menuId) => {
    const menuEl = document.getElementById(menuId);
    if (!menuEl) return;

    menuEl.addEventListener('change', (event) => {
      const checkbox = event.target;
      if (!checkbox || !checkbox.matches('input[type="checkbox"][data-filter-key]')) return;

      const filterKey = checkbox.dataset.filterKey;
      const value = checkbox.value;
      if (!gridState.filters[filterKey]) return;

      const selected = gridState.filters[filterKey];
      if (checkbox.checked) {
        if (!selected.includes(value)) selected.push(value);
      } else {
        gridState.filters[filterKey] = selected.filter((v) => v !== value);
      }

      applicaFiltriEOrdina();
    });
  });
}

function setFilterMenuCheckboxes(menuEl, filterKey, values) {
  if (!menuEl) return;
  menuEl.innerHTML = '';

  if (!values.length) {
    menuEl.innerHTML = '<div class="text-muted small">Nessun valore disponibile.</div>';
    return;
  }

  const selectedSet = new Set(gridState.filters[filterKey] || []);
  values.forEach((value, idx) => {
    const row = document.createElement('div');
    row.className = 'form-check';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'form-check-input';
    input.id = `${filterKey}-chk-${idx}`;
    input.value = value;
    input.dataset.filterKey = filterKey;
    input.checked = selectedSet.has(value);

    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = input.id;
    label.textContent = value;

    row.appendChild(input);
    row.appendChild(label);
    menuEl.appendChild(row);
  });
}

function popolaFiltriDaProgetti(progetti) {
  const areeUniche = Array.from(
    new Set(progetti.map((p) => getAreaDisplay(p)))
  ).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  const prioritaUniche = Array.from(
    new Set(progetti.map((p) => getPrioritaDisplay(p)))
  ).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  const statiUnici = Array.from(
    new Set(progetti.map((p) => getStatoDisplay(p)))
  ).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  // Evita uno stato "incoerente" se dopo reload alcuni valori non esistono più
  gridState.filters.area = gridState.filters.area.filter((v) => areeUniche.includes(v));
  gridState.filters.priorita = gridState.filters.priorita.filter((v) => prioritaUniche.includes(v));
  gridState.filters.stato = gridState.filters.stato.filter((v) => statiUnici.includes(v));

  setFilterMenuCheckboxes(document.getElementById('filterMenuArea'), 'area', areeUniche);
  setFilterMenuCheckboxes(document.getElementById('filterMenuPriorita'), 'priorita', prioritaUniche);
  setFilterMenuCheckboxes(document.getElementById('filterMenuStato'), 'stato', statiUnici);
}

function compareProgetti(a, b, colKey) {
  switch (colKey) {
    case 'nome_progetto':
      return String(a.nome_progetto || '').localeCompare(String(b.nome_progetto || ''), 'it', { sensitivity: 'base' });
    case 'nome_area':
      return getAreaDisplay(a).localeCompare(getAreaDisplay(b), 'it', { sensitivity: 'base' });
    case 'data_inizio': {
      const ta = parseDateOrMin(a.data_inizio);
      const tb = parseDateOrMin(b.data_inizio);
      if (ta === tb) return 0;
      return ta < tb ? -1 : 1;
    }
    case 'priorita':
      return getPrioritaDisplay(a).localeCompare(getPrioritaDisplay(b), 'it', { sensitivity: 'base' });
    case 'stato':
      return getStatoDisplay(a).localeCompare(getStatoDisplay(b), 'it', { sensitivity: 'base' });
    case 'id_progetto':
      return Number(a.id_progetto) - Number(b.id_progetto);
    default:
      return 0;
  }
}

function applicaFiltriEOrdina() {
  let progetti = [...tuttiIProgetti];

  const search = (gridState.search || '').trim().toLowerCase();
  if (search) {
    progetti = progetti.filter((p) => String(p.nome_progetto || '').toLowerCase().includes(search));
  }

  const areaSet = new Set(gridState.filters.area);
  if (areaSet.size) {
    progetti = progetti.filter((p) => areaSet.has(getAreaDisplay(p)));
  }

  const prioritaSet = new Set(gridState.filters.priorita);
  if (prioritaSet.size) {
    progetti = progetti.filter((p) => prioritaSet.has(getPrioritaDisplay(p)));
  }

  const statoSet = new Set(gridState.filters.stato);
  if (statoSet.size) {
    progetti = progetti.filter((p) => statoSet.has(getStatoDisplay(p)));
  }

  if (gridState.sortCol) {
    const { sortCol, sortDir } = gridState;
    const dirMultiplier = sortDir === 'asc' ? 1 : -1;

    progetti.sort((a, b) => {
      const base = compareProgetti(a, b, sortCol);
      if (base !== 0) return dirMultiplier * base;
      return dirMultiplier * (Number(a.id_progetto) - Number(b.id_progetto));
    });
  }

  renderTabellaProgetti(progetti);
}

function aggiornaIconeOrdinamento() {
  const icons = document.querySelectorAll('i[data-sort-icon]');
  icons.forEach((icon) => {
    const colKey = icon.dataset.sortIcon;
    icon.classList.remove('bi-arrow-up', 'bi-arrow-down', 'bi-arrow-down-up');

    if (gridState.sortCol === colKey) {
      if (gridState.sortDir === 'asc') icon.classList.add('bi-arrow-up');
      else if (gridState.sortDir === 'desc') icon.classList.add('bi-arrow-down');
      else icon.classList.add('bi-arrow-down-up');
    } else {
      icon.classList.add('bi-arrow-down-up');
    }
  });
}

function onGridSort(colKey) {
  if (!colKey) return;

  if (gridState.sortCol !== colKey) {
    gridState.sortCol = colKey;
    gridState.sortDir = 'asc';
  } else {
    if (gridState.sortDir === 'asc') {
      gridState.sortDir = 'desc';
    } else if (gridState.sortDir === 'desc') {
      gridState.sortCol = null;
      gridState.sortDir = 'asc';
    } else {
      gridState.sortCol = null;
      gridState.sortDir = 'asc';
    }
  }

  aggiornaIconeOrdinamento();
  applicaFiltriEOrdina();
}

window.onGridSort = onGridSort;

function setupSortHeaderHandlers() {
  const sortButtons = document.querySelectorAll('.sort-header[data-col]');
  sortButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const colKey = btn.dataset.col;
      onGridSort(colKey);
    });
  });

  aggiornaIconeOrdinamento();
}

function renderTabellaProgetti(progetti) {
  const tbody = document.getElementById('tabellaProgettiBody');
  tbody.innerHTML = '';

  if (!progetti.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Nessun progetto disponibile.</td></tr>';
    return;
  }

  progetti.forEach((progetto) => {
    const row = document.createElement('tr');
    row.className = 'progetto-row';
    row.setAttribute('data-id-progetto', String(progetto.id_progetto));
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'link');
    row.setAttribute('aria-label', `Apri progetto ${progetto.nome_progetto || `Progetto ${progetto.id_progetto}`}`);

    const stato = progetto.stato || 'Bozza';
    const priorita = progetto.priorita || '';
    const nomeArea = progetto.nome_area || 'Senza Area';

    row.innerHTML = `
      <td>${escapeHtml(progetto.nome_progetto || `Progetto ${progetto.id_progetto}`)}</td>
      <td>${escapeHtml(nomeArea)}</td>
      <td>${formatDate(progetto.data_inizio)}</td>
      <td><span class="badge ${getPrioritaBadgeClass(priorita)}">${escapeHtml(priorita || 'N/D')}</span></td>
      <td><span class="badge ${getStatoBadgeClass(stato)}">${escapeHtml(stato)}</span></td>
      <td class="align-middle text-end">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="text-primary" viewBox="0 0 16 16">
          <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </td>
    `;

    const goToDettaglio = () => {
      window.location.href = `progetto.html?id=${encodeURIComponent(progetto.id_progetto)}`;
    };
    row.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea, [data-stop-row-nav]')) return;
      goToDettaglio();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goToDettaglio();
      }
    });
    tbody.appendChild(row);
  });
}

async function onSubmitNuovoProgetto(event) {
  event.preventDefault();

  const body = {
    nome_progetto: document.getElementById('nomeProgetto').value.trim(),
    descrizione: document.getElementById('descrizioneProgetto').value.trim(),
    data_inizio: document.getElementById('dataProgetto').value || null,
  };

  try {
    hideError();
    await requestJson(`${API_BASE}/progetti`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    document.getElementById('formCreaProgetto').reset();
    closeModal('modalCreaProgetto');
    await loadProgetti();
  } catch (error) {
    showError(error.message);
  }
}

function closeModal(modalId) {
  const modalElement = document.getElementById(modalId);
  const modal = bootstrap.Modal.getInstance(modalElement);
  if (modal) {
    modal.hide();
  }
}

function showError(message) {
  const appAlert = document.getElementById('appAlert');
  appAlert.textContent = message;
  appAlert.classList.remove('d-none');
}

function hideError() {
  const appAlert = document.getElementById('appAlert');
  appAlert.textContent = '';
  appAlert.classList.add('d-none');
}

function formatDate(value) {
  if (!value) return '--/--/----';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getStatoBadgeClass(stato) {
  if (stato === 'Attivo') return 'text-bg-success';
  if (stato === 'Bozza') return 'text-bg-secondary';
  if (stato === 'Completato') return 'text-bg-primary';
  if (stato === 'In Pausa') return 'text-bg-warning';
  return 'text-bg-light';
}

function getPrioritaBadgeClass(priorita) {
  if (!priorita) return 'text-bg-light';
  const p = priorita.toString().trim().toLowerCase();
  if (p === 'bassa') return 'text-bg-success';
  if (p === 'media') return 'text-bg-warning';
  if (p === 'alta') return 'text-bg-orange';
  if (p === 'critica') return 'text-bg-danger';
  return 'text-bg-light';
}
