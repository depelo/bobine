const API_BASE = '/api/prg';
let currentProjectId = null;
let currentProjectData = null;
let currentTeamMember = null;
let currentTeam = [];
let currentTasks = [];
let currentTaskStructure = [];
let currentKanbanColumns = [];
let currentEditingColumnId = null;
let selectedColumnColor = '#f8f9fa';

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
  const btnEliminaTask = document.getElementById('btnEliminaTask');
  const tabInfo = document.getElementById('tab-info');
  const tabPianoOperativo = document.getElementById('tab-piano-operativo');
  const tabElencoTask = document.getElementById('tab-elenco-task');
  const tabTeam = document.getElementById('tab-team');
  const btnContextModifica = document.getElementById('btnContextModifica');
  const btnContextNuovoTask = document.getElementById('btnContextNuovoTask');
  const btnContextAssegna = document.getElementById('btnContextAssegna');
  const formModificaColonna = document.getElementById('formModificaColonna');
  const paletteButtons = document.querySelectorAll('#colonnaPalette [data-colore]');

  formAssegnaPersona.addEventListener('submit', onSubmitAssegnaPersona);
  modalAssegnaPersona.addEventListener('show.bs.modal', loadPersoneSelect);
  formModificaProgetto.addEventListener('submit', onSubmitModificaProgetto);
  modalModificaProgetto.addEventListener('show.bs.modal', onOpenModificaProgettoModal);
  btnEliminaProgetto.addEventListener('click', eliminaProgetto);
  formGestisciMembro.addEventListener('submit', onSubmitModificaRuoloMembro);
  btnRimuoviMembroProgetto.addEventListener('click', onRimuoviMembroProgetto);
  formGestioneTask.addEventListener('submit', onSubmitGestioneTask);
  btnEliminaTask.addEventListener('click', onDeleteTaskCorrente);
  tabPianoOperativo.addEventListener('shown.bs.tab', onOpenPianoOperativoTab);
  tabElencoTask.addEventListener('shown.bs.tab', onOpenElencoTaskTab);
  tabInfo.addEventListener('shown.bs.tab', onAnyTabShown);
  tabPianoOperativo.addEventListener('shown.bs.tab', onAnyTabShown);
  tabElencoTask.addEventListener('shown.bs.tab', onAnyTabShown);
  tabTeam.addEventListener('shown.bs.tab', onAnyTabShown);
  btnContextModifica.addEventListener('click', () => {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalModificaProgetto')).show();
  });
  btnContextNuovoTask.addEventListener('click', openModalNuovoTaskFromElenco);
  btnContextAssegna.addEventListener('click', () => {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAssegnaPersona')).show();
  });
  formModificaColonna.addEventListener('submit', onSubmitModificaColonna);
  paletteButtons.forEach((btn) => {
    btn.addEventListener('click', () => setSelectedColumnColor(btn.dataset.colore || '#f8f9fa'));
  });

  await loadDettaglioProgetto(currentProjectId);
  await loadTeam(currentProjectId);
  updateContextualActionBar(tabInfo.id);
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
  await loadKanbanColumns(currentProjectId);
  await loadStrutturaTasks(currentProjectId, { skipRender: true });
  await loadTasks(currentProjectId);
}

async function onOpenElencoTaskTab() {
  await loadStrutturaTasks(currentProjectId);
}

function onAnyTabShown(event) {
  const activeTabId = event?.target?.id || '';
  updateContextualActionBar(activeTabId);
}

function updateContextualActionBar(activeTabId) {
  const btnContextModifica = document.getElementById('btnContextModifica');
  const btnContextNuovoTask = document.getElementById('btnContextNuovoTask');
  const btnContextAssegna = document.getElementById('btnContextAssegna');
  btnContextModifica.classList.add('d-none');
  btnContextNuovoTask.classList.add('d-none');
  btnContextAssegna.classList.add('d-none');

  if (activeTabId === 'tab-info') {
    btnContextModifica.classList.remove('d-none');
    return;
  }
  if (activeTabId === 'tab-piano-operativo' || activeTabId === 'tab-elenco-task') {
    btnContextNuovoTask.classList.remove('d-none');
    return;
  }
  if (activeTabId === 'tab-team') {
    btnContextAssegna.classList.remove('d-none');
  }
}

async function loadKanbanColumns(projectId) {
  try {
    const payload = await requestJson(`${API_BASE}/progetti/${projectId}/colonne`);
    currentKanbanColumns = Array.isArray(payload.data) ? payload.data : [];
    if (!currentKanbanColumns.length) {
      showError('Nessuna colonna Kanban disponibile per questo progetto.');
    }
  } catch (error) {
    currentKanbanColumns = [];
    showError(error.message || 'Errore durante il caricamento colonne Kanban.');
  }
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

async function loadStrutturaTasks(projectId, options = {}) {
  const { skipRender = false } = options;
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/progetti/${projectId}/struttura-tasks`);
    currentTaskStructure = Array.isArray(payload.data) ? payload.data : [];
    if (!skipRender) {
      renderElencoTask(currentTaskStructure);
    }
  } catch (error) {
    currentTaskStructure = [];
    if (!skipRender) {
      renderElencoTask([]);
    }
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
  await Promise.all([
    loadKanbanColumns(currentProjectId),
    loadStrutturaTasks(currentProjectId),
    loadTasks(currentProjectId),
  ]);
}

function renderKanban(tasks) {
  const board = document.getElementById('kanbanBoard');
  board.innerHTML = '';

  const colonneOrdinate = [...currentKanbanColumns].sort((a, b) => Number(a.ordine) - Number(b.ordine));

  colonneOrdinate.forEach((colonna) => {
    const colWrapper = document.createElement('div');
    colWrapper.className = 'kanban-column-item';
    colWrapper.dataset.idColonna = String(colonna.id_colonna);
    colWrapper.draggable = false;
    colWrapper.addEventListener('dragstart', onColumnDragStart);
    colWrapper.addEventListener('dragend', onColumnDragEnd);
    colWrapper.addEventListener('dragover', onColumnDragOver);
    colWrapper.addEventListener('drop', onColumnDrop);

    const card = document.createElement('div');
    card.className = 'card kanban-column h-100';
    card.style.backgroundColor = colonna.colore || '#f8f9fa';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header bg-light d-flex justify-content-between align-items-center';

    const title = document.createElement('strong');
    title.textContent = colonna.nome || `Colonna ${colonna.id_colonna}`;

    const actions = document.createElement('div');
    actions.className = 'd-flex align-items-center gap-2';
    actions.innerHTML = `
      <span class="kanban-grip drag-handle" title="Trascina colonna">☰</span>
      <button type="button" class="task-action-btn" title="Rinomina colonna" data-action="rinomina-colonna">✏️</button>
      <button type="button" class="task-action-btn text-danger" title="Elimina colonna" data-action="elimina-colonna">🗑</button>
    `;
    bindColumnDragHandle(actions.querySelector('.drag-handle'), colWrapper);
    actions.querySelector('[data-action="rinomina-colonna"]').addEventListener('click', () => onRinominaColonna(colonna));
    actions.querySelector('[data-action="elimina-colonna"]').addEventListener('click', () => onEliminaColonna(colonna));

    cardHeader.appendChild(title);
    cardHeader.appendChild(actions);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body kanban-task-list';
    cardBody.dataset.idColonna = String(colonna.id_colonna);
    cardBody.dataset.nomeColonna = colonna.nome || '';
    bindKanbanDnD(cardBody);

    const tasksColonna = tasks.filter((task) => Number(task.id_colonna) === Number(colonna.id_colonna));
    if (!tasksColonna.length) {
      cardBody.innerHTML = '<div class="text-muted small">Nessun task</div>';
    } else {
      tasksColonna.forEach((task) => {
        cardBody.appendChild(createTaskCard(task));
      });
    }

    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    colWrapper.appendChild(card);
    board.appendChild(colWrapper);
  });

  const addColWrapper = document.createElement('div');
  addColWrapper.className = 'kanban-column-item';
  addColWrapper.innerHTML = `
    <div class="card h-100 d-flex align-items-center justify-content-center border-dashed">
      <div class="card-body d-flex align-items-center justify-content-center">
        <button type="button" class="btn btn-outline-primary btn-sm" id="btnAggiungiColonnaKanban">+ Aggiungi Colonna</button>
      </div>
    </div>
  `;
  addColWrapper.querySelector('#btnAggiungiColonnaKanban').addEventListener('click', onAggiungiColonnaKanban);
  board.appendChild(addColWrapper);
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
  const subTasks = getSubtasksForTask(task.id_task);
  const subTasksCompletate = subTasks.filter((item) => Boolean(item.is_completato)).length;
  const collapseId = `task-subtasks-${task.id_task}`;

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
      ${subTasks.length ? `
        <div class="mt-2">
          <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false">
            <span data-subtask-counter>${subTasksCompletate}/${subTasks.length} Sub-task completate</span>
          </button>
          <div class="collapse mt-2" id="${collapseId}">
            <div class="small d-flex flex-column gap-1" data-subtask-list>
              ${subTasks.map((subtask) => `
                <label class="d-flex align-items-center gap-2">
                  <input class="form-check-input" type="checkbox" data-subtask-id="${subtask.id_sub_task}" ${subtask.is_completato ? 'checked' : ''}>
                  <span class="${subtask.is_completato ? 'task-barrato' : ''}">${escapeHtml(subtask.titolo || `Sub-task ${subtask.id_sub_task}`)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  card.addEventListener('dragstart', onTaskDragStart);
  card.addEventListener('dragend', onTaskDragEnd);
  card.querySelectorAll('[data-subtask-id]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const idSubTask = Number(checkbox.dataset.subtaskId);
      const checked = checkbox.checked;
      const labelText = checkbox.parentElement?.querySelector('span');
      try {
        hideError();
        await updateSubtaskField(idSubTask, { is_completato: checked ? 1 : 0 });
        if (labelText) {
          labelText.classList.toggle('task-barrato', checked);
        }
        patchSubtaskCompletionInMemory(task.id_task, idSubTask, checked ? 1 : 0);
        updateCardSubtaskCounter(card, task.id_task);
      } catch (error) {
        checkbox.checked = !checked;
        showError(error.message || 'Errore durante aggiornamento sub-task.');
      }
    });
  });
  return card;
}

function bindKanbanDnD(list) {
  list.addEventListener('dragover', onKanbanDragOver);
  list.addEventListener('dragleave', onKanbanDragLeave);
  list.addEventListener('drop', onKanbanDrop);
}

function onTaskDragStart(event) {
  event.stopPropagation();
  const idTask = event.currentTarget.dataset.idTask;
  event.dataTransfer.setData('application/x-task-id', String(idTask));
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
  const idTask = Number(event.dataTransfer.getData('application/x-task-id'));
  const idColonnaDragged = Number(event.dataTransfer.getData('application/x-col-id'));
  if (idColonnaDragged) return;
  const nuovoIdColonna = Number(container.dataset.idColonna);
  const nuovoStato = container.dataset.nomeColonna || '';
  if (!idTask || !nuovoIdColonna) return;

  const task = currentTasks.find((item) => Number(item.id_task) === idTask);
  if (!task) return;
  if (Number(task.id_colonna) === nuovoIdColonna) return;

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
      body: JSON.stringify({ id_colonna: nuovoIdColonna }),
    });
    task.id_colonna = nuovoIdColonna;
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
  return (value || '').toString().trim();
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

function getSubtasksForTask(idTask) {
  const taskNode = currentTaskStructure.find((item) => Number(item.id_task) === Number(idTask));
  return Array.isArray(taskNode?.sub_tasks) ? taskNode.sub_tasks : [];
}

function patchSubtaskCompletionInMemory(idTask, idSubTask, isCompletato) {
  const taskNode = currentTaskStructure.find((item) => Number(item.id_task) === Number(idTask));
  if (!taskNode || !Array.isArray(taskNode.sub_tasks)) return;
  const subtask = taskNode.sub_tasks.find((item) => Number(item.id_sub_task) === Number(idSubTask));
  if (!subtask) return;
  subtask.is_completato = isCompletato;
}

function updateCardSubtaskCounter(card, idTask) {
  const counter = card.querySelector('[data-subtask-counter]');
  if (!counter) return;
  const subtasks = getSubtasksForTask(idTask);
  const completate = subtasks.filter((item) => Boolean(item.is_completato)).length;
  counter.textContent = `${completate}/${subtasks.length} Sub-task completate`;
}

function onAggiungiColonnaKanban() {
  openColumnModal();
}

function onRinominaColonna(colonna) {
  openColumnModal(colonna);
}

async function onSubmitModificaColonna(event) {
  event.preventDefault();
  const nome = document.getElementById('colonnaNomeInput').value.trim();
  if (!nome) {
    showError('Il nome colonna e obbligatorio.');
    return;
  }
  try {
    hideError();
    if (currentEditingColumnId) {
      await requestJson(`${API_BASE}/colonne/${currentEditingColumnId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, colore: selectedColumnColor }),
      });
    } else {
      await requestJson(`${API_BASE}/progetti/${currentProjectId}/colonne`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, colore: selectedColumnColor }),
      });
    }
    closeModal('modalModificaColonna');
    await refreshTaskViews();
  } catch (error) {
    showError(error.message || 'Errore durante salvataggio colonna.');
  }
}

async function onEliminaColonna(colonna) {
  const conferma = confirm(`Confermi eliminazione della colonna "${colonna.nome}"?`);
  if (!conferma) return;
  try {
    hideError();
    const payload = await requestJson(`${API_BASE}/colonne/${colonna.id_colonna}`, {
      method: 'DELETE',
    });
    if (payload?.ok === true) {
      await refreshTaskViews();
    }
  } catch (error) {
    alert(error.message || 'Errore durante eliminazione colonna.');
    showError(error.message || 'Errore durante eliminazione colonna.');
  }
}

function openColumnModal(colonna = null) {
  currentEditingColumnId = colonna ? Number(colonna.id_colonna) : null;
  const modalTitle = document.getElementById('modalModificaColonnaLabel');
  const inputNome = document.getElementById('colonnaNomeInput');
  modalTitle.textContent = currentEditingColumnId ? 'Modifica Colonna' : 'Nuova Colonna';
  inputNome.value = colonna?.nome || '';
  setSelectedColumnColor(colonna?.colore || '#f8f9fa');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalModificaColonna')).show();
}

function setSelectedColumnColor(colorHex) {
  selectedColumnColor = colorHex || '#f8f9fa';
  document.querySelectorAll('#colonnaPalette [data-colore]').forEach((button) => {
    button.classList.toggle('active', button.dataset.colore === selectedColumnColor);
  });
}

function onColumnDragStart(event) {
  if (event.currentTarget !== event.target.closest('.kanban-column-item')) {
    event.preventDefault();
    return;
  }
  if (event.currentTarget.dataset.columnDragArmed !== '1') {
    event.preventDefault();
    return;
  }
  const idColonna = event.currentTarget.dataset.idColonna;
  event.dataTransfer.setData('application/x-col-id', String(idColonna));
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.classList.add('dragging');
}

function onColumnDragEnd(event) {
  event.currentTarget.draggable = false;
  event.currentTarget.dataset.columnDragArmed = '0';
  event.currentTarget.classList.remove('dragging');
}

function onColumnDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

async function onColumnDrop(event) {
  event.preventDefault();
  const taskId = Number(event.dataTransfer.getData('application/x-task-id'));
  if (taskId) return;
  const sourceId = Number(event.dataTransfer.getData('application/x-col-id'));
  const targetId = Number(event.currentTarget.dataset.idColonna);
  if (!sourceId || !targetId || sourceId === targetId) return;

  const ordered = [...currentKanbanColumns].sort((a, b) => Number(a.ordine) - Number(b.ordine));
  const fromIndex = ordered.findIndex((col) => Number(col.id_colonna) === sourceId);
  const toIndex = ordered.findIndex((col) => Number(col.id_colonna) === targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  currentKanbanColumns = ordered.map((col, index) => ({ ...col, ordine: index }));
  renderKanban(currentTasks);

  try {
    await requestJson(`${API_BASE}/progetti/${currentProjectId}/ordine-colonne`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colonne: currentKanbanColumns.map((col) => ({
          id_colonna: Number(col.id_colonna),
          ordine: Number(col.ordine),
        })),
      }),
    });
  } catch (error) {
    showError(error.message || 'Errore durante riordinamento colonne.');
    await loadKanbanColumns(currentProjectId);
    renderKanban(currentTasks);
  }
}

function bindColumnDragHandle(handleEl, columnEl) {
  if (!handleEl || !columnEl) return;

  const armColumnDrag = () => {
    columnEl.draggable = true;
    columnEl.dataset.columnDragArmed = '1';
  };
  const disarmColumnDrag = () => {
    columnEl.draggable = false;
    columnEl.dataset.columnDragArmed = '0';
  };

  handleEl.addEventListener('mousedown', armColumnDrag);
  handleEl.addEventListener('touchstart', armColumnDrag, { passive: true });
  handleEl.addEventListener('mouseup', disarmColumnDrag);
  handleEl.addEventListener('mouseleave', disarmColumnDrag);
  handleEl.addEventListener('touchend', disarmColumnDrag);
  handleEl.addEventListener('touchcancel', disarmColumnDrag);
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
