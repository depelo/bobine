const API_BASE = '/api/prg';
let currentProjectId = null;
let currentProjectData = null;
let currentTeamMember = null;

document.addEventListener('securityReady', initApp);

async function initApp() {
  const params = new URLSearchParams(window.location.search);
  currentProjectId = Number(params.get('id'));

  if (!currentProjectId) {
    showError('ID progetto non valido.');
    return;
  }

  const formAssegnaPersona = document.getElementById('formAssegnaPersona');
  const modalAssegnaPersona = document.getElementById('modalAssegnaPersona');
  const formModificaProgetto = document.getElementById('formModificaProgetto');
  const modalModificaProgetto = document.getElementById('modalModificaProgetto');
  const btnEliminaProgetto = document.getElementById('btnEliminaProgetto');
  const formGestisciMembro = document.getElementById('formGestisciMembro');
  const btnRimuoviMembroProgetto = document.getElementById('btnRimuoviMembroProgetto');

  formAssegnaPersona.addEventListener('submit', onSubmitAssegnaPersona);
  modalAssegnaPersona.addEventListener('show.bs.modal', loadPersoneSelect);
  formModificaProgetto.addEventListener('submit', onSubmitModificaProgetto);
  modalModificaProgetto.addEventListener('show.bs.modal', onOpenModificaProgettoModal);
  btnEliminaProgetto.addEventListener('click', eliminaProgetto);
  formGestisciMembro.addEventListener('submit', onSubmitModificaRuoloMembro);
  btnRimuoviMembroProgetto.addEventListener('click', onRimuoviMembroProgetto);

  await loadDettaglioProgetto(currentProjectId);
  await loadTeam(currentProjectId);
}

async function requestJson(url, options = {}) {
  const requestOptions = {
    credentials: 'include',
    ...options,
  };
  const response = await fetch(url, requestOptions);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || 'Errore durante la chiamata API.');
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loadDettaglioProgetto(projectId) {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/progetti`);
    const progetti = Array.isArray(payload.data) ? payload.data : [];
    const progetto = progetti.find((item) => Number(item.id_progetto) === Number(projectId));

    if (!progetto) {
      showError('Progetto non trovato.');
      return;
    }
    currentProjectData = progetto;

    document.getElementById('dettaglioNome').textContent = progetto.nome_progetto || `Progetto ${progetto.id_progetto}`;
    document.getElementById('dettaglioDescrizione').textContent = progetto.descrizione || 'Nessuna descrizione disponibile.';
    document.getElementById('dettaglioData').textContent = formatDate(progetto.data_inizio);
    document.getElementById('dettaglioDataFine').textContent = formatDate(progetto.data_fine);
    document.getElementById('dettaglioObbiettivi').textContent = progetto.obbiettivi || 'Nessun obbiettivo specificato.';
    document.getElementById('dettaglioBudget').textContent = formatCurrency(progetto.budget);
    const stato = progetto.stato || 'Bozza';
    const pVal = progetto.priorita || 'Media';
    document.getElementById('dettaglioStato').innerHTML = `<span class="badge ${getStatoBadgeClass(stato)}">${escapeHtml(stato)}</span>`;
    const elPriorita = document.getElementById('dettaglioPriorita');
    elPriorita.innerHTML = `<span class="badge ${getPrioritaBadgeClass(pVal)}">${escapeHtml(pVal)}</span>`;
  } catch (error) {
    console.error('[ERRORE UI]:', error);
    showError(error.message);
  }
}

async function loadPersoneSelect() {
  try {
    const payload = await requestJson(`${API_BASE}/persone`);
    const persone = Array.isArray(payload.data) ? payload.data : [];
    const selectPersona = document.getElementById('selectPersona');

    selectPersona.innerHTML = '<option value="">Seleziona una persona</option>';
    persone.forEach((persona) => {
      const option = document.createElement('option');
      option.value = String(persona.id_persona);
      option.textContent = `${persona.nome} ${persona.cognome}`;
      selectPersona.appendChild(option);
    });
  } catch (error) {
    console.error('[ERRORE UI]:', error);
    showError(error.message);
  }
}

async function loadTeam(projectId) {
  try {
    const payload = await requestJson(`${API_BASE}/progetti/${projectId}/team`);
    const team = Array.isArray(payload.data) ? payload.data : [];
    renderTeam(team);
    hideError();
  } catch (error) {
    if (error.status === 404) {
      renderTeam([]);
      hideError();
      return;
    }
    renderTeam([]);
    console.error('[ERRORE UI]:', error);
    showError(error.message || 'Errore durante il caricamento del team.');
  }
}

async function onSubmitAssegnaPersona(event) {
  event.preventDefault();

  const idPersona = Number(document.getElementById('selectPersona').value);
  const ruoloNelProgetto = document.getElementById('ruoloNelProgetto').value.trim();

  if (!idPersona) {
    showError('Seleziona una persona da assegnare.');
    return;
  }

  try {
    hideError();
    await requestJson(`${API_BASE}/assegna`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_progetto: currentProjectId,
        id_persona: idPersona,
        ruolo_nel_progetto: ruoloNelProgetto,
      }),
    });

    document.getElementById('formAssegnaPersona').reset();
    closeModal('modalAssegnaPersona');
    await loadTeam(currentProjectId);
  } catch (error) {
    console.error('[ERRORE UI]:', error);
    showError(error.message);
  }
}

async function onOpenModificaProgettoModal() {
  if (!currentProjectData) return;

  try {
    await loadRepartiSelect(currentProjectData.id_reparto);
  } catch (error) {
    showError(error.message);
  }

  document.getElementById('editNomeProgetto').value = currentProjectData.nome_progetto || '';
  document.getElementById('editDescrizioneProgetto').value = currentProjectData.descrizione || '';
  document.getElementById('editObbiettiviProgetto').value = currentProjectData.obbiettivi || '';
  document.getElementById('editDataInizioProgetto').value = toDateInputValue(currentProjectData.data_inizio);
  document.getElementById('editDataFineProgetto').value = toDateInputValue(currentProjectData.data_fine);
  const prioritaSelect = document.getElementById('prioritaProgetto');
  if (prioritaSelect && currentProjectData.priorita) {
    const prioritaDb = currentProjectData.priorita.toString().trim().toLowerCase();
    Array.from(prioritaSelect.options).forEach((opt) => {
      if (opt.value.toLowerCase() === prioritaDb) {
        prioritaSelect.value = opt.value;
      }
    });
  } else if (prioritaSelect) {
    prioritaSelect.value = '';
  }
  document.getElementById('editBudgetProgetto').value = currentProjectData.budget ?? '';
  document.getElementById('statoProgetto').value = currentProjectData.stato || 'Bozza';
}

async function loadRepartiSelect(selectedRepartoId) {
  const selectReparto = document.getElementById('id_reparto');
  selectReparto.innerHTML = '<option value="">Senza Reparto</option>';

  const payload = await requestJson(`${API_BASE}/reparti`);
  const reparti = Array.isArray(payload.data) ? payload.data : [];

  reparti.forEach((reparto) => {
    const option = document.createElement('option');
    option.value = String(reparto.id_reparto);
    option.textContent = reparto.nome_reparto || `Reparto ${reparto.id_reparto}`;
    selectReparto.appendChild(option);
  });

  if (selectedRepartoId === null || selectedRepartoId === undefined || selectedRepartoId === '') {
    selectReparto.value = '';
  } else {
    selectReparto.value = String(selectedRepartoId);
  }
}

async function onSubmitModificaProgetto(event) {
  event.preventDefault();

  const rawBudget = document.getElementById('editBudgetProgetto').value.trim().replace(',', '.');
  const parsedBudget = rawBudget ? parseFloat(rawBudget) : null;

  if (rawBudget && Number.isNaN(parsedBudget)) {
    showError('Budget non valido.');
    return;
  }

  const payload = {
    nome_progetto: document.getElementById('editNomeProgetto').value.trim(),
    descrizione: document.getElementById('editDescrizioneProgetto').value.trim(),
    obbiettivi: document.getElementById('editObbiettiviProgetto').value.trim(),
    data_inizio: document.getElementById('editDataInizioProgetto').value || null,
    data_fine: document.getElementById('editDataFineProgetto').value || null,
    priorita: document.getElementById('prioritaProgetto').value || null,
    budget: parsedBudget,
    stato: document.getElementById('statoProgetto').value || null,
    id_reparto: document.getElementById('id_reparto').value
      ? Number(document.getElementById('id_reparto').value)
      : null,
  };

  try {
    hideError();
    await requestJson(`${API_BASE}/progetti/${currentProjectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal('modalModificaProgetto');
    await loadDettaglioProgetto(currentProjectId);
  } catch (error) {
    console.error('[ERRORE UI]:', error);
    showError(error.message);
  }
}

async function eliminaProgetto() {
  const conferma = confirm('Confermi l\'eliminazione del progetto?');
  if (!conferma) return;

  try {
    hideError();
    await requestJson(`${API_BASE}/progetti/${currentProjectId}`, {
      method: 'DELETE',
    });
    window.location.href = 'prg.html';
  } catch (error) {
    console.error('[ERRORE UI]:', error);
    showError(error.message);
  }
}

function renderTeam(team) {
  const teamBody = document.getElementById('teamProgetto');
  teamBody.innerHTML = '';

  if (!team.length) {
    teamBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-muted">Nessuna persona assegnata</td>
      </tr>
    `;
    return;
  }

  team.forEach((persona) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(persona.nome || '')}</td>
      <td>${escapeHtml(persona.cognome || '')}</td>
      <td>${escapeHtml(persona.ruolo || '-')}</td>
      <td class="text-end">
        <button type="button" class="btn btn-outline-primary btn-sm" data-action="gestisci-membro">Gestisci</button>
      </td>
    `;
    row.querySelector('[data-action="gestisci-membro"]').addEventListener('click', () => {
      openGestisciMembroModal(persona);
    });
    teamBody.appendChild(row);
  });
}

function openGestisciMembroModal(persona) {
  currentTeamMember = {
    id_persona: Number(persona.id_persona),
    nome: persona.nome || '',
    cognome: persona.cognome || '',
  };

  document.getElementById('gestisciMembroPersona').value = `${currentTeamMember.nome} ${currentTeamMember.cognome}`.trim();
  document.getElementById('gestisciMembroRuolo').value = persona.ruolo || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalGestisciMembro')).show();
}

async function onSubmitModificaRuoloMembro(event) {
  event.preventDefault();
  if (!currentTeamMember || !currentTeamMember.id_persona) {
    showError('Membro non selezionato.');
    return;
  }

  const ruolo = document.getElementById('gestisciMembroRuolo').value.trim();

  try {
    hideError();
    await requestJson(`${API_BASE}/progetti/${currentProjectId}/team/${currentTeamMember.id_persona}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruolo }),
    });
    closeModal('modalGestisciMembro');
    await loadTeam(currentProjectId);
  } catch (error) {
    console.error('[ERRORE UI]:', error);
    showError(error.message);
  }
}

async function onRimuoviMembroProgetto() {
  if (!currentTeamMember || !currentTeamMember.id_persona) {
    showError('Membro non selezionato.');
    return;
  }

  const conferma = confirm('Vuoi davvero rimuovere questa persona dal progetto?');
  if (!conferma) return;

  try {
    hideError();
    await requestJson(`${API_BASE}/progetti/${currentProjectId}/team/${currentTeamMember.id_persona}`, {
      method: 'DELETE',
    });
    closeModal('modalGestisciMembro');
    await loadTeam(currentProjectId);
  } catch (error) {
    console.error('[ERRORE UI]:', error);
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

function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
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
