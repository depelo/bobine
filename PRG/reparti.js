const API_BASE = '/api/prg';
let editingRepartoId = null;

document.addEventListener('securityReady', initApp);

function initApp() {
  document.getElementById('formReparto').addEventListener('submit', onSubmitReparto);
  document.getElementById('btnNuovoReparto').addEventListener('click', openCreateModal);
  loadReparti();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || 'Errore durante la chiamata API.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadReparti() {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/reparti`);
    const reparti = Array.isArray(payload.data) ? payload.data : [];
    const tbody = document.getElementById('listaReparti');
    tbody.innerHTML = '';

    if (!reparti.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-muted">Nessun reparto disponibile.</td></tr>';
      return;
    }

    reparti.forEach((reparto) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(reparto.nome_reparto || `Reparto ${reparto.id_reparto}`)}</td>
        <td>${escapeHtml(reparto.descrizione || '-')}</td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-primary btn-sm me-2" data-action="edit">Modifica</button>
          <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">Elimina</button>
        </td>
      `;

      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openEditModal(reparto);
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        onDeleteReparto(reparto.id_reparto);
      });
      tbody.appendChild(row);
    });
  } catch (error) {
    showError(error.message);
  }
}

function openCreateModal() {
  editingRepartoId = null;
  document.getElementById('modalRepartoLabel').textContent = 'Nuovo Reparto';
  document.getElementById('idReparto').value = '';
  document.getElementById('nomeReparto').value = '';
  document.getElementById('descrizioneReparto').value = '';
}

function openEditModal(reparto) {
  editingRepartoId = Number(reparto.id_reparto);
  document.getElementById('modalRepartoLabel').textContent = 'Modifica Reparto';
  document.getElementById('idReparto').value = String(reparto.id_reparto);
  document.getElementById('nomeReparto').value = reparto.nome_reparto || '';
  document.getElementById('descrizioneReparto').value = reparto.descrizione || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalReparto')).show();
}

async function onSubmitReparto(event) {
  event.preventDefault();

  const body = {
    nome_reparto: document.getElementById('nomeReparto').value.trim(),
    descrizione: document.getElementById('descrizioneReparto').value.trim(),
  };

  if (!body.nome_reparto) {
    showError('Il nome reparto e obbligatorio.');
    return;
  }

  try {
    hideError();
    if (editingRepartoId) {
      await requestJson(`${API_BASE}/reparti/${editingRepartoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await requestJson(`${API_BASE}/reparti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    closeModal('modalReparto');
    await loadReparti();
  } catch (error) {
    showError(error.message);
  }
}

async function onDeleteReparto(idReparto) {
  const conferma = confirm('Confermi l eliminazione del reparto?');
  if (!conferma) return;

  try {
    hideError();
    await requestJson(`${API_BASE}/reparti/${idReparto}`, { method: 'DELETE' });
    await loadReparti();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
