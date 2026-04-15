const API_BASE = '/api/prg';
let editingAreaId = null;

document.addEventListener('securityReady', initApp);

function initApp() {
  document.getElementById('formArea').addEventListener('submit', onSubmitArea);
  document.getElementById('btnNuovaArea').addEventListener('click', openCreateModal);
  loadAree();
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

async function loadAree() {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/aree`);
    const aree = Array.isArray(payload.data) ? payload.data : [];
    const tbody = document.getElementById('listaAree');
    tbody.innerHTML = '';

    if (!aree.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-muted">Nessuna area disponibile.</td></tr>';
      return;
    }

    aree.forEach((area) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(area.nome_area || `Area ${area.id_area}`)}</td>
        <td>${escapeHtml(area.descrizione || '-')}</td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-primary btn-sm me-2" data-action="edit">Modifica</button>
          <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">Elimina</button>
        </td>
      `;

      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openEditModal(area);
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        onDeleteArea(area.id_area);
      });
      tbody.appendChild(row);
    });
  } catch (error) {
    showError(error.message);
  }
}

function openCreateModal() {
  editingAreaId = null;
  document.getElementById('modalAreaLabel').textContent = 'Nuova Area';
  document.getElementById('idArea').value = '';
  document.getElementById('nomeArea').value = '';
  document.getElementById('descrizioneArea').value = '';
}

function openEditModal(area) {
  editingAreaId = Number(area.id_area);
  document.getElementById('modalAreaLabel').textContent = 'Modifica Area';
  document.getElementById('idArea').value = String(area.id_area);
  document.getElementById('nomeArea').value = area.nome_area || '';
  document.getElementById('descrizioneArea').value = area.descrizione || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalArea')).show();
}

async function onSubmitArea(event) {
  event.preventDefault();

  const body = {
    nome_area: document.getElementById('nomeArea').value.trim(),
    descrizione: document.getElementById('descrizioneArea').value.trim(),
  };

  if (!body.nome_area) {
    showError('Il nome area e obbligatorio.');
    return;
  }

  try {
    hideError();
    if (editingAreaId) {
      await requestJson(`${API_BASE}/aree/${editingAreaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await requestJson(`${API_BASE}/aree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    closeModal('modalArea');
    await loadAree();
  } catch (error) {
    showError(error.message);
  }
}

async function onDeleteArea(idArea) {
  const conferma = confirm('Confermi l eliminazione dell area?');
  if (!conferma) return;

  try {
    hideError();
    await requestJson(`${API_BASE}/aree/${idArea}`, { method: 'DELETE' });
    await loadAree();
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
