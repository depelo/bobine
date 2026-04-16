const API_BASE = '/api/prg';
let tuttiIProgetti = [];
let tutteLeAree = [];

document.addEventListener('securityReady', initApp);

async function initApp() {
  const formCreaProgetto = document.getElementById('formCreaProgetto');
  const filtroArea = document.getElementById('filtroArea');
  const filtroPriorita = document.getElementById('filtroPriorita');
  const filtroStato = document.getElementById('filtroStato');

  formCreaProgetto.addEventListener('submit', onSubmitNuovoProgetto);
  filtroArea.addEventListener('change', applicaFiltri);
  filtroPriorita.addEventListener('change', applicaFiltri);
  filtroStato.addEventListener('change', applicaFiltri);

  try {
    hideError();
    await Promise.all([loadAree(), loadProgetti()]);
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
  popolaFiltroStato(tuttiIProgetti);
  applicaFiltri();
}

async function loadAree() {
  const payload = await requestJson(`${API_BASE}/aree`);
  tutteLeAree = Array.isArray(payload.data) ? payload.data : [];
  popolaFiltroAree(tutteLeAree);
}

function popolaFiltroAree(aree) {
  const select = document.getElementById('filtroArea');
  const selected = select.value;
  select.innerHTML = '<option value="">Tutte le Aree</option>';

  aree.forEach((area) => {
    const option = document.createElement('option');
    option.value = String(area.id_area);
    option.textContent = area.nome_area || `Area ${area.id_area}`;
    select.appendChild(option);
  });

  if (selected && Array.from(select.options).some((opt) => opt.value === selected)) {
    select.value = selected;
  }
}

function popolaFiltroStato(progetti) {
  const select = document.getElementById('filtroStato');
  const selected = select.value;
  const statiUnici = Array.from(
    new Set(
      progetti
        .map((progetto) => (progetto.stato || '').trim())
        .filter((stato) => stato)
    )
  ).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  select.innerHTML = '<option value="">Tutti gli Stati</option>';
  statiUnici.forEach((stato) => {
    const option = document.createElement('option');
    option.value = stato;
    option.textContent = stato;
    select.appendChild(option);
  });

  if (selected && Array.from(select.options).some((opt) => opt.value === selected)) {
    select.value = selected;
  }
}

function applicaFiltri() {
  const filtroArea = document.getElementById('filtroArea').value;
  const prioritaSelezionata = document.getElementById('filtroPriorita').value.trim().toLowerCase();
  const filtroStato = document.getElementById('filtroStato').value;

  const progettiFiltrati = tuttiIProgetti.filter((progetto) => {
    const prioritaProgetto = (progetto.priorita || '').trim().toLowerCase();
    const matchArea = !filtroArea || String(progetto.id_area ?? '') === filtroArea;
    const passaFiltroPriorita = prioritaSelezionata === '' || prioritaProgetto === prioritaSelezionata;
    const matchStato = !filtroStato || (progetto.stato || '') === filtroStato;
    return matchArea && passaFiltroPriorita && matchStato;
  });

  renderTabellaProgetti(progettiFiltrati);
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
    data_inizio: document.getElementById('dataProgetto').value,
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
