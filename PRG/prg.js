const API_BASE = '/api/prg';

document.addEventListener('securityReady', initApp);

function initApp() {
  const formCreaProgetto = document.getElementById('formCreaProgetto');

  formCreaProgetto.addEventListener('submit', onSubmitNuovoProgetto);

  loadProgetti();
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
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/progetti`);
    const progetti = Array.isArray(payload.data) ? payload.data : [];
    renderAccordionReparti(progetti);
  } catch (error) {
    showError(error.message);
  }
}

function renderAccordionReparti(progetti) {
  const accordion = document.getElementById('accordionReparti');
  accordion.innerHTML = '';

  if (!progetti.length) {
    accordion.innerHTML = '<div class="text-muted">Nessun progetto disponibile.</div>';
    return;
  }

  const grouped = groupProgettiByReparto(progetti);
  grouped.forEach((group, index) => {
    accordion.appendChild(buildAccordionItem(group, index));
  });
}

function groupProgettiByReparto(progetti) {
  const map = new Map();
  const NULL_KEY = 'null-reparto';

  progetti.forEach((progetto) => {
    const hasReparto = progetto.id_reparto !== null && progetto.id_reparto !== undefined;
    const key = hasReparto ? String(progetto.id_reparto) : NULL_KEY;

    if (!map.has(key)) {
      map.set(key, {
        key,
        id_reparto: hasReparto ? progetto.id_reparto : null,
        nome_reparto: hasReparto
          ? (progetto.nome_reparto || `Reparto ${progetto.id_reparto}`)
          : 'Senza Reparto',
        progetti: [],
      });
    }

    map.get(key).progetti.push(progetto);
  });

  const items = Array.from(map.values());
  items.sort((a, b) => {
    if (a.id_reparto === null) return 1;
    if (b.id_reparto === null) return -1;
    return a.nome_reparto.localeCompare(b.nome_reparto, 'it', { sensitivity: 'base' });
  });
  return items;
}

function buildAccordionItem(group, index) {
  const item = document.createElement('div');
  item.className = 'accordion-item';

  const headingId = `heading-reparto-${index}`;
  const collapseId = `collapse-reparto-${index}`;
  const isFirst = index === 0;

  item.innerHTML = `
    <h2 class="accordion-header" id="${headingId}">
      <button
        class="accordion-button ${isFirst ? '' : 'collapsed'}"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#${collapseId}"
        aria-expanded="${isFirst ? 'true' : 'false'}"
        aria-controls="${collapseId}"
      >
        ${escapeHtml(group.nome_reparto)} <span class="ms-2 badge text-bg-secondary">${group.progetti.length}</span>
      </button>
    </h2>
    <div
      id="${collapseId}"
      class="accordion-collapse collapse ${isFirst ? 'show' : ''}"
      aria-labelledby="${headingId}"
      data-bs-parent="#accordionReparti"
    >
      <div class="accordion-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Data Inizio</th>
                <th scope="col">Priorità</th>
                <th scope="col">Stato</th>
                <th scope="col" class="text-end" style="width: 1%; white-space: nowrap;">Azioni</th>
              </tr>
            </thead>
            <tbody>${buildRowsProgetti(group.progetti)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  item.querySelectorAll('.progetto-row').forEach((row) => {
    const goToDettaglio = () => {
      const idProgetto = row.getAttribute('data-id-progetto');
      window.location.href = `progetto.html?id=${encodeURIComponent(idProgetto)}`;
    };
    row.addEventListener('click', (event) => {
      // If future interactive controls are added inside the row, use stopPropagation on them.
      if (event.target.closest('button, a, input, select, textarea, [data-stop-row-nav]')) return;
      goToDettaglio();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goToDettaglio();
      }
    });
  });

  return item;
}

function buildRowsProgetti(progetti) {
  return progetti
    .map((progetto) => {
      const stato = progetto.stato || 'Bozza';
      const pVal = progetto.priorita || '';
      return `
        <tr class="progetto-row" data-id-progetto="${escapeHtml(progetto.id_progetto)}" tabindex="0" role="link" aria-label="Apri progetto ${escapeHtml(progetto.nome_progetto || `Progetto ${progetto.id_progetto}`)}">
          <td>${escapeHtml(progetto.nome_progetto || `Progetto ${progetto.id_progetto}`)}</td>
          <td>${formatDate(progetto.data_inizio)}</td>
          <td><span class="badge ${getPrioritaBadgeClass(pVal)}">${escapeHtml(pVal || 'N/D')}</span></td>
          <td><span class="badge ${getStatoBadgeClass(stato)}">${escapeHtml(stato)}</span></td>
          <td class="align-middle text-end">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="text-primary" viewBox="0 0 16 16">
              <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </td>
        </tr>
      `;
    })
    .join('');
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
