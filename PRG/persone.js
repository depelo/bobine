const API_BASE = '/api/prg';

document.addEventListener('securityReady', initApp);

function initApp() {
  const formCreaPersonale = document.getElementById('formCreaPersonale');
  formCreaPersonale.addEventListener('submit', onSubmitNuovoPersonale);
  loadPersone();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || 'Errore durante la chiamata API.');
  }
  return payload;
}

async function loadPersone() {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/persone`);
    const persone = Array.isArray(payload.data) ? payload.data : [];
    const listaPersone = document.getElementById('listaPersone');
    listaPersone.innerHTML = '';

    if (!persone.length) {
      listaPersone.innerHTML = '<tr><td colspan="5" class="text-muted">Nessuna persona disponibile.</td></tr>';
      return;
    }

    persone.forEach((persona) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(persona.nome || '')}</td>
        <td>${escapeHtml(persona.cognome || '')}</td>
        <td>${escapeHtml(persona.ruolo_aziendale || '-')}</td>
        <td>${escapeHtml(persona.email || '-')}</td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-primary btn-sm" data-action="gestisci">Gestisci</button>
        </td>
      `;
      tr.querySelector('[data-action="gestisci"]').addEventListener('click', () => {
        window.location.href = `persona.html?id=${encodeURIComponent(persona.id_persona)}`;
      });
      listaPersone.appendChild(tr);
    });
  } catch (error) {
    showError(error.message);
  }
}

async function onSubmitNuovoPersonale(event) {
  event.preventDefault();
  const body = {
    nome: document.getElementById('nomePersona').value.trim(),
    cognome: document.getElementById('cognomePersona').value.trim(),
    email: document.getElementById('emailPersona').value.trim(),
    ruolo_aziendale: document.getElementById('ruoloPersona').value.trim(),
  };

  try {
    hideError();
    await requestJson(`${API_BASE}/persone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    document.getElementById('formCreaPersonale').reset();
    closeModal('modalCreaPersonale');
    await loadPersone();
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
