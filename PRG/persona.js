const API_BASE = '/api/prg';
let currentPersonaId = null;
let currentPersonaData = null;

document.addEventListener('securityReady', initApp);

async function initApp() {
  const params = new URLSearchParams(window.location.search);
  currentPersonaId = Number(params.get('id'));
  if (!currentPersonaId) {
    showError('ID persona non valido.');
    return;
  }

  document.getElementById('formModificaPersona').addEventListener('submit', onSubmitModificaPersona);
  document.getElementById('modalModificaPersona').addEventListener('show.bs.modal', prefillModificaPersona);
  document.getElementById('btnEliminaPersona').addEventListener('click', eliminaPersona);

  await loadDettaglioPersona();
  await loadProgettiPersona();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || 'Errore durante la chiamata API.');
  }
  return payload;
}

async function loadDettaglioPersona() {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/persone`);
    const persone = Array.isArray(payload.data) ? payload.data : [];
    const persona = persone.find((item) => Number(item.id_persona) === Number(currentPersonaId));
    if (!persona) {
      showError('Persona non trovata.');
      return;
    }

    currentPersonaData = persona;
    document.getElementById('dettaglioNome').textContent = persona.nome || '-';
    document.getElementById('dettaglioCognome').textContent = persona.cognome || '-';
    document.getElementById('dettaglioRuolo').textContent = persona.ruolo_aziendale || '-';
    document.getElementById('dettaglioEmail').textContent = persona.email || '-';
  } catch (error) {
    showError(error.message);
  }
}

async function loadProgettiPersona() {
  try {
    const payload = await requestJson(`${API_BASE}/persone/${currentPersonaId}/progetti`);
    const progetti = Array.isArray(payload.data) ? payload.data : [];
    const tbody = document.getElementById('listaProgettiPersona');
    tbody.innerHTML = '';

    if (!progetti.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Nessun progetto assegnato.</td></tr>';
      return;
    }

    progetti.forEach((progetto) => {
      const stato = progetto.stato || 'Bozza';
      const priorita = progetto.priorita || '';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(progetto.nome_progetto || `Progetto ${progetto.id_progetto}`)}</td>
        <td>${escapeHtml(progetto.ruolo_nel_progetto || '-')}</td>
        <td><span class="badge ${getPrioritaBadgeClass(priorita)}">${escapeHtml(priorita || 'N/D')}</span></td>
        <td><span class="badge ${getStatoBadgeClass(stato)}">${escapeHtml(stato)}</span></td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    showError(error.message);
  }
}

function prefillModificaPersona() {
  if (!currentPersonaData) return;
  document.getElementById('editNomePersona').value = currentPersonaData.nome || '';
  document.getElementById('editCognomePersona').value = currentPersonaData.cognome || '';
  document.getElementById('editEmailPersona').value = currentPersonaData.email || '';
  document.getElementById('editRuoloPersona').value = currentPersonaData.ruolo_aziendale || '';
}

async function onSubmitModificaPersona(event) {
  event.preventDefault();
  const payload = {
    nome: document.getElementById('editNomePersona').value.trim(),
    cognome: document.getElementById('editCognomePersona').value.trim(),
    email: document.getElementById('editEmailPersona').value.trim(),
    ruolo_aziendale: document.getElementById('editRuoloPersona').value.trim(),
  };

  try {
    hideError();
    await requestJson(`${API_BASE}/persone/${currentPersonaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal('modalModificaPersona');
    await loadDettaglioPersona();
  } catch (error) {
    showError(error.message);
  }
}

async function eliminaPersona() {
  if (!confirm('Confermi l\'eliminazione della persona?')) return;
  try {
    hideError();
    await requestJson(`${API_BASE}/persone/${currentPersonaId}`, { method: 'DELETE' });
    window.location.href = 'persone.html';
  } catch (error) {
    showError(error.message);
  }
}

function closeModal(modalId) {
  const modalElement = document.getElementById(modalId);
  const modal = bootstrap.Modal.getInstance(modalElement);
  if (modal) modal.hide();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
