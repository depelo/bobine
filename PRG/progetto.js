const API_BASE = '/api/prg';
let currentProjectId = null;
let currentProjectData = null;
let currentTeamMember = null;
let currentTeam = [];
let currentTasks = [];
let currentTaskStructure = [];
const KANBAN_STATI = ['Da Fare', 'In Corso', 'Revisione', 'Completato'];

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
  const formGestioneTask = document.getElementById('formGestioneTask');
  const btnNuovoTask = document.getElementById('btnNuovoTask');
  const btnEliminaTask = document.getElementById('btnEliminaTask');
  const tabPianoOperativo = document.getElementById('tab-piano-operativo');
  const tabElencoTask = document.getElementById('tab-elenco-task');
  const btnAggiungiTaskDaElenco = document.getElementById('btnAggiungiTaskDaElenco');

  formAssegnaPersona.addEventListener('submit', onSubmitAssegnaPersona);
  modalAssegnaPersona.addEventListener('show.bs.modal', loadPersoneSelect);
  formModificaProgetto.addEventListener('submit', onSubmitModificaProgetto);
  modalModificaProgetto.addEventListener('show.bs.modal', onOpenModificaProgettoModal);
  btnEliminaProgetto.addEventListener('click', eliminaProgetto);
  formGestisciMembro.addEventListener('submit', onSubmitModificaRuoloMembro);
  btnRimuoviMembroProgetto.addEventListener('click', onRimuoviMembroProgetto);
  formGestioneTask.addEventListener('submit', onSubmitGestioneTask);
  btnNuovoTask.addEventListener('click', onOpenNuovoTaskModal);
  btnEliminaTask.addEventListener('click', onDeleteTaskCorrente);
  tabPianoOperativo.addEventListener('shown.bs.tab', onOpenPianoOperativoTab);
  tabElencoTask.addEventListener('shown.bs.tab', onOpenElencoTaskTab);
  btnAggiungiTaskDaElenco.addEventListener('click', openModalNuovoTaskFromElenco);

  await loadDettaglioProgetto(currentProjectId);
  await loadTeam(currentProjectId);
  initKanbanDnD();
}

async function requestJson(url, options = {}) {
  const requestOptions = {
    credentials: 'include',
    ...options,
  };
  const response = await fetch(url, requestOptions);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || payload.message || 'Errore durante la chiamata API.');
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

    document.getElementById('titoloPaginaProgetto').textContent = progetto.nome_progetto || `Progetto ${progetto.id_progetto}`;
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
    currentTeam = team;
    renderTeam(team);
    hideError();
  } catch (error) {
    if (error.status === 404) {
      currentTeam = [];
      renderTeam([]);
      hideError();
      return;
    }
    currentTeam = [];
    renderTeam([]);
    console.error('[ERRORE UI]:', error);
    showError(error.message || 'Errore durante il caricamento del team.');
  }
}

async function onOpenPianoOperativoTab() {
  await loadTasks(currentProjectId);
}

async function onOpenElencoTaskTab() {
  await loadStrutturaTasks(currentProjectId);
}

async function loadTasks(projectId) {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/progetti/${projectId}/tasks`);
    currentTasks = Array.isArray(payload.data) ? payload.data : [];
    renderKanban(currentTasks);
  } catch (error) {
    currentTasks = [];
    renderKanban([]);
    showError(error.message || 'Errore durante il caricamento task.');
  }
}

async function loadStrutturaTasks(projectId) {
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/progetti/${projectId}/struttura-tasks`);
    currentTaskStructure = Array.isArray(payload.data) ? payload.data : [];
    renderElencoTask(currentTaskStructure);
  } catch (error) {
    currentTaskStructure = [];
    renderElencoTask([]);
    showError(error.message || 'Errore durante il caricamento elenco task.');
  }
}

function renderElencoTask(struttura) {
  const container = document.getElementById('contenitoreElencoTask');
  container.innerHTML = '';

  if (!struttura.length) {
    container.innerHTML = '<div class="text-muted">Nessun task disponibile.</div>';
    return;
  }

  struttura.forEach((task) => {
    container.appendChild(buildTaskRow(task, false));
    const subtasks = Array.isArray(task.sub_tasks) ? task.sub_tasks : [];
    subtasks.forEach((subtask) => {
      container.appendChild(buildTaskRow(subtask, true, task.id_task));
    });

    const btnAddSubtask = document.createElement('button');
    btnAddSubtask.type = 'button';
    btnAddSubtask.className = 'btn btn-link btn-sm text-decoration-none ms-4';
    btnAddSubtask.textContent = '+ Aggiungi sotto-attivita';
    btnAddSubtask.addEventListener('click', () => onAggiungiSubtask(task.id_task));
    container.appendChild(btnAddSubtask);
  });
}

function buildTaskRow(item, isSubtask, parentTaskId = null) {
  const wrapper = document.createElement('div');
  wrapper.className = `border rounded p-2 mb-2 ${isSubtask ? 'subtask-row' : ''}`;

  const row = document.createElement('div');
  row.className = 'd-flex align-items-center gap-2';

  const descRowId = `${isSubtask ? 'sub' : 'task'}-desc-${isSubtask ? item.id_sub_task : item.id_task}`;
  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = 'task-action-btn';
  chevron.textContent = '▸';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'form-check-input rounded-circle';
  checkbox.checked = Boolean(item.is_completato);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = `task-inline-input fw-semibold ${item.is_completato ? 'task-barrato' : ''}`;
  titleInput.value = item.titolo || '';

  const prioritaBadge = document.createElement('span');
  prioritaBadge.className = `badge ${getPrioritaBadgeClass(item.priorita || 'Media')}`;
  prioritaBadge.textContent = item.priorita || 'Media';

  const editTaskBtn = document.createElement('button');
  editTaskBtn.type = 'button';
  editTaskBtn.className = 'task-action-btn';
  editTaskBtn.title = 'Modifica task';
  editTaskBtn.textContent = '✏️';
  editTaskBtn.addEventListener('click', () => apriModaleModificaTask(item.id_task));

  const fiammaBtn = document.createElement('button');
  fiammaBtn.type = 'button';
  fiammaBtn.className = `task-action-btn fiamma-icon ${item.is_critico ? 'fiamma-accesa' : 'fiamma-spenta'}`;
  fiammaBtn.textContent = '🔥';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'task-action-btn text-danger';
  deleteBtn.textContent = '🗑';

  row.appendChild(chevron);
  row.appendChild(checkbox);
  row.appendChild(titleInput);
  if (isSubtask) {
    row.appendChild(fiammaBtn);
  } else {
    row.appendChild(prioritaBadge);
    row.appendChild(editTaskBtn);
  }
  row.appendChild(deleteBtn);

  const descWrap = document.createElement('div');
  descWrap.id = descRowId;
  descWrap.className = 'd-none mt-2';
  descWrap.innerHTML = `
    <textarea class="form-control task-desc-area" rows="3">${escapeHtml(item.descrizione || '')}</textarea>
  `;

  chevron.addEventListener('click', () => {
    const isHidden = descWrap.classList.toggle('d-none');
    chevron.textContent = isHidden ? '▸' : '▾';
  });

  checkbox.addEventListener('change', async () => {
    try {
      hideError();
      const nuovoValore = checkbox.checked ? 1 : 0;
      if (isSubtask) {
        await updateSubtaskField(item.id_sub_task, { is_completato: nuovoValore });
      } else {
        await updateTaskField(item.id_task, { stato: nuovoValore ? 'Completato' : 'Da Fare' });
      }
      titleInput.classList.toggle('task-barrato', checkbox.checked);
      await refreshTaskViews();
    } catch (error) {
      showError(error.message);
      checkbox.checked = !checkbox.checked;
    }
  });

  titleInput.addEventListener('blur', async () => {
    const titolo = titleInput.value.trim();
    if (!titolo) return;
    try {
      hideError();
      if (isSubtask) {
        await updateSubtaskField(item.id_sub_task, { titolo });
      } else {
        await updateTaskField(item.id_task, { titolo });
      }
      await refreshTaskViews();
    } catch (error) {
      showError(error.message);
    }
  });

  if (isSubtask) {
    fiammaBtn.addEventListener('click', async () => {
      const isCritico = fiammaBtn.classList.contains('fiamma-accesa') ? 0 : 1;
      try {
        hideError();
        await updateSubtaskField(item.id_sub_task, { is_critico: isCritico });
        if (isCritico) {
          fiammaBtn.classList.add('fiamma-accesa');
          fiammaBtn.classList.remove('fiamma-spenta');
        } else {
          fiammaBtn.classList.remove('fiamma-accesa');
          fiammaBtn.classList.add('fiamma-spenta');
        }
        await refreshTaskViews();
      } catch (error) {
        showError(error.message);
      }
    });
  }

  deleteBtn.addEventListener('click', async () => {
    const conferma = confirm(`Confermi l eliminazione ${isSubtask ? 'della sotto-attivita' : 'del task'}?`);
    if (!conferma) return;
    try {
      hideError();
      if (isSubtask) {
        await requestJson(`${API_BASE}/subtasks/${item.id_sub_task}`, { method: 'DELETE' });
      } else {
        await requestJson(`${API_BASE}/tasks/${item.id_task}`, { method: 'DELETE' });
      }
      await refreshTaskViews();
    } catch (error) {
      showError(error.message);
    }
  });

  const textarea = descWrap.querySelector('textarea');
  textarea.value = item.descrizione || '';
  textarea.addEventListener('blur', async () => {
    try {
      hideError();
      const descrizione = textarea.value.trim();
      if (isSubtask) {
        await updateSubtaskField(item.id_sub_task, { descrizione });
      } else {
        await updateTaskField(item.id_task, { descrizione });
      }
      await refreshTaskViews();
    } catch (error) {
      showError(error.message);
    }
  });

  wrapper.appendChild(row);
  wrapper.appendChild(descWrap);
  return wrapper;
}

async function updateTaskField(idTask, fields) {
  await requestJson(`${API_BASE}/tasks/${idTask}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

async function updateSubtaskField(idSubtask, fields) {
  await requestJson(`${API_BASE}/subtasks/${idSubtask}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

async function onAggiungiSubtask(idTask) {
  try {
    hideError();
    await requestJson(`${API_BASE}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_task: idTask,
        titolo: 'Nuova sotto-attivita',
        descrizione: '',
      }),
    });
    await refreshTaskViews();
  } catch (error) {
    showError(error.message);
  }
}

async function refreshTaskViews() {
  await Promise.all([loadTasks(currentProjectId), loadStrutturaTasks(currentProjectId)]);
}

function renderKanban(tasks) {
  KANBAN_STATI.forEach((stato) => {
    const container = document.querySelector(`.kanban-task-list[data-stato="${stato}"]`);
    if (!container) return;
    container.innerHTML = '';

    const tasksColonna = tasks.filter((task) => normalizeTaskStato(task.stato) === stato);
    if (!tasksColonna.length) {
      container.innerHTML = '<div class="text-muted small">Nessun task</div>';
      return;
    }

    tasksColonna.forEach((task) => {
      container.appendChild(createTaskCard(task));
    });
  });
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'card task-card mb-2';
  card.draggable = true;
  card.dataset.idTask = String(task.id_task);
  const bloccato = isTaskBlocked(task, currentTasks);
  const priorita = task.priorita || 'Media';
  const persona = task.nome_assegnato || 'Non assegnato';
  const dipendenzaTitolo = task.titolo_dipendenza || '';

  card.innerHTML = `
    <div class="card-body p-2">
      <div class="d-flex justify-content-between align-items-start">
        <div class="fw-semibold">${escapeHtml(task.titolo || `Task ${task.id_task}`)}</div>
        <div class="d-flex align-items-center gap-2">
          ${bloccato ? '<span title="Task bloccato da dipendenza">🔒</span>' : ''}
          <i class="bi bi-pencil edit-task-icon" onclick="apriModaleModificaTask(${task.id_task})" title="Modifica task"></i>
        </div>
      </div>
      <div class="mt-2">
        <span class="badge ${getPrioritaBadgeClass(priorita)}">${escapeHtml(priorita)}</span>
      </div>
      <div class="small text-muted mt-2">${escapeHtml(persona)}</div>
      ${task.descrizione ? `<div class="small mt-1">${escapeHtml(task.descrizione)}</div>` : ''}
      ${bloccato && dipendenzaTitolo ? `<div class="small text-danger mt-1">Dipende da: ${escapeHtml(dipendenzaTitolo)}</div>` : ''}
    </div>
  `;

  card.addEventListener('dragstart', onTaskDragStart);
  card.addEventListener('dragend', onTaskDragEnd);
  return card;
}

function initKanbanDnD() {
  document.querySelectorAll('.kanban-task-list').forEach((list) => {
    list.addEventListener('dragover', onKanbanDragOver);
    list.addEventListener('dragleave', onKanbanDragLeave);
    list.addEventListener('drop', onKanbanDrop);
  });
}

function onTaskDragStart(event) {
  const idTask = event.currentTarget.dataset.idTask;
  event.dataTransfer.setData('text/plain', idTask);
  event.dataTransfer.effectAllowed = 'move';
}

function onTaskDragEnd(event) {
  event.currentTarget.classList.remove('opacity-50');
}

function onKanbanDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('kanban-drop-target');
  event.dataTransfer.dropEffect = 'move';
}

function onKanbanDragLeave(event) {
  event.currentTarget.classList.remove('kanban-drop-target');
}

async function onKanbanDrop(event) {
  event.preventDefault();
  const container = event.currentTarget;
  container.classList.remove('kanban-drop-target');
  const idTask = Number(event.dataTransfer.getData('text/plain'));
  const nuovoStato = container.dataset.stato;
  if (!idTask || !nuovoStato) return;

  const task = currentTasks.find((item) => Number(item.id_task) === idTask);
  if (!task) return;
  const statoAttuale = normalizeTaskStato(task.stato);
  if (statoAttuale === nuovoStato) return;

  const dependencyBlock = checkTaskDependencyBlock(task, nuovoStato, currentTasks);
  if (dependencyBlock.blocked) {
    showError(`Impossibile procedere: questo task dipende da [${dependencyBlock.parentTitle}].`);
    return;
  }

  try {
    hideError();
    await requestJson(`${API_BASE}/tasks/${idTask}/stato`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato: nuovoStato }),
    });
    task.stato = nuovoStato;
    renderKanban(currentTasks);
  } catch (error) {
    showError(error.message || 'Errore durante lo spostamento del task.');
  }
}

async function onOpenNuovoTaskModal() {
  if (!currentTasks.length) {
    await loadTasks(currentProjectId);
  }
  populateTaskAssigneeSelect();
  populateTaskDependenciesSelect();
  resetTaskModalForCreate();
}

function populateTaskAssigneeSelect() {
  const select = document.getElementById('taskAssegnato');
  select.innerHTML = '<option value="">Seleziona persona</option>';
  currentTeam.forEach((persona) => {
    const option = document.createElement('option');
    option.value = String(persona.id_persona);
    option.textContent = `${persona.nome || ''} ${persona.cognome || ''}`.trim();
    select.appendChild(option);
  });
}

function populateTaskDependenciesSelect() {
  const select = document.getElementById('taskDipendenza');
  select.innerHTML = '<option value="">Nessuna dipendenza</option>';
  currentTasks.forEach((task) => {
    const option = document.createElement('option');
    option.value = String(task.id_task);
    option.textContent = task.titolo || `Task ${task.id_task}`;
    select.appendChild(option);
  });
}

async function onSubmitGestioneTask(event) {
  event.preventDefault();
  const currentTaskId = Number(document.getElementById('taskIdCorrente').value);

  const idPersona = Number(document.getElementById('taskAssegnato').value);
  if (!idPersona) {
    showError('Seleziona una persona assegnata al task.');
    return;
  }

  const payload = {
    id_progetto: currentProjectId,
    titolo: document.getElementById('taskTitolo').value.trim(),
    id_persona: idPersona,
    priorita: document.getElementById('taskPriorita').value || 'Media',
    scadenza: document.getElementById('taskScadenza').value || null,
    descrizione: document.getElementById('taskDescrizione').value.trim(),
    dipende_da_id: document.getElementById('taskDipendenza').value
      ? Number(document.getElementById('taskDipendenza').value)
      : null,
  };

  if (!payload.titolo) {
    showError('Il titolo del task e obbligatorio.');
    return;
  }

  try {
    hideError();
    if (currentTaskId) {
      await requestJson(`${API_BASE}/tasks/${currentTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await requestJson(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    document.getElementById('formGestioneTask').reset();
    closeModal('modalGestioneTask');
    await refreshTaskViews();
  } catch (error) {
    showError(error.message || 'Errore durante il salvataggio del task.');
  }
}

function resetTaskModalForCreate() {
  document.getElementById('modalGestioneTaskLabel').textContent = 'Nuovo Task';
  document.getElementById('btnSalvaTask').textContent = 'Salva Task';
  document.getElementById('btnEliminaTask').classList.add('d-none');
  document.getElementById('taskIdCorrente').value = '';
  document.getElementById('formGestioneTask').reset();
}

function apriModaleModificaTask(idTask) {
  const task = currentTasks.find((item) => Number(item.id_task) === Number(idTask));
  if (!task) {
    showError('Task non trovato.');
    return;
  }

  populateTaskAssigneeSelect();
  populateTaskDependenciesSelect();

  document.getElementById('modalGestioneTaskLabel').textContent = 'Modifica Task';
  document.getElementById('btnSalvaTask').textContent = 'Salva Modifiche';
  document.getElementById('btnEliminaTask').classList.remove('d-none');
  document.getElementById('taskIdCorrente').value = String(task.id_task);
  document.getElementById('taskTitolo').value = task.titolo || '';
  document.getElementById('taskAssegnato').value = task.id_persona ? String(task.id_persona) : '';
  document.getElementById('taskPriorita').value = task.priorita || 'Media';
  document.getElementById('taskScadenza').value = toDateInputValue(task.scadenza);
  document.getElementById('taskDescrizione').value = task.descrizione || '';
  document.getElementById('taskDipendenza').value = task.dipende_da_id ? String(task.dipende_da_id) : '';

  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalGestioneTask')).show();
}

async function onDeleteTaskCorrente() {
  const idTask = Number(document.getElementById('taskIdCorrente').value);
  if (!idTask) return;
  const conferma = confirm('Confermi l eliminazione del task?');
  if (!conferma) return;

  try {
    hideError();
    await requestJson(`${API_BASE}/tasks/${idTask}`, { method: 'DELETE' });
    closeModal('modalGestioneTask');
    await refreshTaskViews();
  } catch (error) {
    showError(error.message || 'Errore durante eliminazione task.');
  }
}

window.apriModaleModificaTask = apriModaleModificaTask;

async function openModalNuovoTaskFromElenco() {
  await onOpenNuovoTaskModal();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalGestioneTask')).show();
}

function normalizeTaskStato(value) {
  if (!value) return 'Da Fare';
  return KANBAN_STATI.includes(value) ? value : 'Da Fare';
}

function checkTaskDependencyBlock(task, nuovoStato, tasks) {
  if (!['In Corso', 'Completato'].includes(nuovoStato)) {
    return { blocked: false, parentTitle: '' };
  }
  if (!task.dipende_da_id) {
    return { blocked: false, parentTitle: '' };
  }
  const parentTask = tasks.find((item) => Number(item.id_task) === Number(task.dipende_da_id));
  if (!parentTask) {
    return { blocked: true, parentTitle: 'task genitore non trovato' };
  }
  if (normalizeTaskStato(parentTask.stato) !== 'Completato') {
    return { blocked: true, parentTitle: parentTask.titolo || `Task ${parentTask.id_task}` };
  }
  return { blocked: false, parentTitle: '' };
}

function isTaskBlocked(task, tasks) {
  const check = checkTaskDependencyBlock(task, 'In Corso', tasks);
  return check.blocked;
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
    await loadAreeSelect(currentProjectData.id_area);
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

async function loadAreeSelect(selectedAreaId) {
  const selectArea = document.getElementById('id_area');
  selectArea.innerHTML = '<option value="">Senza Area</option>';

  const payload = await requestJson(`${API_BASE}/aree`);
  const aree = Array.isArray(payload.data) ? payload.data : [];

  aree.forEach((area) => {
    const option = document.createElement('option');
    option.value = String(area.id_area);
    option.textContent = area.nome_area || `Area ${area.id_area}`;
    selectArea.appendChild(option);
  });

  if (selectedAreaId === null || selectedAreaId === undefined || selectedAreaId === '') {
    selectArea.value = '';
  } else {
    selectArea.value = String(selectedAreaId);
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
    id_area: document.getElementById('id_area').value
      ? Number(document.getElementById('id_area').value)
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
