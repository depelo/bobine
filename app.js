const API_URL = '/api';

const screenMeta = {
  'log-edit': {
    title: 'Registro',
    leftActions: [
      { icon: '✕', action: 'cancel-log', title: 'Annulla' }
    ],
    rightActions: [
      { icon: '✓', action: 'save-log', title: 'Salva' }
    ]
  },
  'log-detail': {
    title: 'Dettaglio log',
    leftActions: [
      { icon: '‹', action: 'back-to-list', title: 'Indietro' }
    ],
    rightActions: [
      { icon: '🗑', action: 'delete-log', title: 'Elimina' },
      { icon: '✎', action: 'edit-from-detail', title: 'Modifica' }
    ]
  },
  'log-list': {
    title: 'Dettagli log',
    leftActions: [
      { icon: '↻', action: 'refresh-log-list', title: 'Aggiorna' }
    ],
    rightActions: [
      { icon: '↕', action: 'sort-log-list', title: 'Ordina' }
    ]
  },
  'operator-list': {
    title: 'Operatori',
    leftActions: [
      { icon: '↻', action: 'refresh-operator-list', title: 'Aggiorna' }
    ],
    rightActions: [
      { icon: '↕', action: 'sort-operator-list', title: 'Ordina' },
      { icon: '+', action: 'add-operator', title: 'Aggiungi operatore' }
    ]
  },
  'machine-list': {
    title: 'Macchine',
    leftActions: [
      { icon: '↻', action: 'refresh-machine-list', title: 'Aggiorna' }
    ],
    rightActions: [
      { icon: '↕', action: 'sort-machine-list', title: 'Ordina' },
      { icon: '+', action: 'add-machine', title: 'Aggiungi macchina' }
    ]
  }
};

const state = {
  currentScreen: 'log-edit',
  sortAsc: true,
  selectedLog: null,
  returnFromLookupTo: null,
  formDraft: {},
  operators: [],
  machines: [],
  logs: [],
  currentOperator: null,
  detailEditMode: false
};

async function fetchData(endpoint) {
  const res = await fetch(`${API_URL}${endpoint}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function initApp() {
  try {
    const [operators, machines, logs] = await Promise.all([
      fetchData('/operators'),
      fetchData('/machines'),
      fetchData('/logs')
    ]);
    state.operators = operators;
    state.machines = machines;
    state.logs = logs;
  } catch (err) {
    console.error(err);
    alert('Impossibile caricare i dati. Verifica che il backend sia avviato su http://localhost:3000');
    state.operators = [];
    state.machines = [];
    state.logs = [];
  }
  populateOperatorSelect();
  populateMachineSelect();
  renderLogList(state.logs);
  renderOperatorList(state.operators);
  renderSimpleList(machineListEl, state.machines, pickMachineFromList);
  resetForm();
  applyPermissions();
  setScreen('log-edit');
}

const titleEl = document.getElementById('screenTitle');
const actionsLeftEl = document.getElementById('topbarActionsLeft');
const actionsRightEl = document.getElementById('topbarActionsRight');
const topbarEl = document.getElementById('topbar');
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.side-btn');
const form = document.getElementById('logForm');
const detailGrid = document.getElementById('detailGrid');
const logListEl = document.getElementById('logList');
const operatorListEl = document.getElementById('operatorListView');
const machineListEl = document.getElementById('machineListView');
const operatorSelect = document.getElementById('operatorSelect');
const machineSelect = document.getElementById('machineSelect');

function toDateInputValue(dateString) {
  const datePart = dateString.split(' ')[0];
  const [day, month, year] = datePart.split('/');
  return `${year}-${month}-${day}`;
}

// IDRoll progressivo condizionale: stesso (Codart, Lot) => ultimo IDRoll + 1; altrimenti 0
function updateDynamicRollId() {
  const rawCode = (form.rawCode && form.rawCode.value ? form.rawCode.value : '').trim();
  const lot = (form.lot && form.lot.value ? form.lot.value : '').trim();
  const rollInput = document.getElementById('rollId');
  if (!rollInput) return;

  if (!state.logs || state.logs.length === 0) {
    rollInput.value = '0';
    return;
  }

  const sorted = [...state.logs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastLog = sorted[0];
  const lastCodart = (lastLog.rawCode != null ? String(lastLog.rawCode) : '').trim();
  const lastLot = (lastLog.lot != null ? String(lastLog.lot) : '').trim();

  if (rawCode === lastCodart && lot === lastLot) {
    const lastRoll = parseInt(lastLog.rollId, 10);
    const next = (Number.isNaN(lastRoll) ? 0 : lastRoll) + 1;
    rollInput.value = String(next);
  } else {
    rollInput.value = '0';
  }
}

// Tratta la stringa dal server come ora locale (evita offset UTC del browser)
function displayDate(dateStr) {
  if (dateStr == null || dateStr === '') return '-';
  const cleanDateStr = String(dateStr).replace('Z', '');
  const d = new Date(cleanDateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function initCombobox(inputId, dropdownId, getItems, getValueFromItem, clearOptionLabel, onSelectItem, onClear) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const wrap = input.closest('.combobox-wrap');

  function filterItems(query) {
    const q = (query || '').trim().toLowerCase();
    const items = getItems();
    if (!q) return items;
    return items.filter(
      (item) =>
        String(item.id).toLowerCase().includes(q) ||
        String(item.name).toLowerCase().includes(q)
    );
  }

  function renderDropdown() {
    const query = input.value.trim();
    const filtered = filterItems(query);
    dropdown.innerHTML = '';

    if (clearOptionLabel) {
      const clearOpt = document.createElement('div');
      clearOpt.setAttribute('role', 'option');
      clearOpt.className = 'combobox-clear';
      clearOpt.textContent = clearOptionLabel;
      clearOpt.addEventListener('click', () => {
        input.value = '';
        if (typeof onClear === 'function') onClear();
        wrap.classList.remove('is-open');
        dropdown.setAttribute('aria-hidden', 'true');
      });
      dropdown.appendChild(clearOpt);
    }

    filtered.forEach((item) => {
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.textContent = `${item.id} - ${item.name}`;
      opt.addEventListener('click', () => {
        input.value = getValueFromItem(item);
        if (typeof onSelectItem === 'function') onSelectItem(item);
        wrap.classList.remove('is-open');
        dropdown.setAttribute('aria-hidden', 'true');
      });
      dropdown.appendChild(opt);
    });
    dropdown.setAttribute('aria-hidden', dropdown.children.length === 0 ? 'true' : 'false');
  }

  function openDropdown() {
    wrap.classList.add('is-open');
    renderDropdown();
  }

  function closeDropdown() {
    wrap.classList.remove('is-open');
    dropdown.setAttribute('aria-hidden', 'true');
  }

  input.addEventListener('focus', openDropdown);
  input.addEventListener('input', () => {
    openDropdown();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  document.addEventListener('click', (e) => {
    if (wrap.contains(e.target)) return;
    closeDropdown();
  });
}

function populateSelect(select, items, placeholderLabel) {
  if (!select) return;
  select.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholderLabel;
  select.appendChild(ph);

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id != null ? String(item.id) : '';
    option.textContent = item.name;
    select.appendChild(option);
  });
}

function populateOperatorSelect() {
  if (!operatorSelect) return;
  const visibleOps = state.operators.filter((op) => !op.isAdmin && op.isAdmin !== 1);
  const sortedOperators = visibleOps.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));
  populateSelect(operatorSelect, sortedOperators, 'Seleziona operatore');
}

function populateMachineSelect() {
  if (!machineSelect) return;
  populateSelect(machineSelect, state.machines, 'Seleziona macchina');
}

const ADMIN_ONLY_ACTIONS = ['add-operator', 'add-machine'];

function applyPermissions() {
  const isAdmin = state.currentOperator?.isAdmin === true;
  const hasOperator = state.currentOperator != null;

  const lastLogByID = state.logs.length > 0
    ? state.logs.reduce((a, b) => (Number(a.uniqueRecordId) > Number(b.uniqueRecordId) ? a : b))
    : null;
  const isLastRecord = state.selectedLog && lastLogByID &&
    Number(state.selectedLog.uniqueRecordId) === Number(lastLogByID.uniqueRecordId);

  document.querySelectorAll('[data-action]').forEach((el) => {
    const action = el.dataset.action;
    if (ADMIN_ONLY_ACTIONS.includes(action)) {
      el.style.display = isAdmin ? '' : 'none';
      return;
    }
    if (action === 'edit-from-detail') {
      el.style.display = hasOperator ? '' : 'none';
      el.disabled = !hasOperator;
      return;
    }
    if (action === 'delete-log') {
      const canDelete = isAdmin || isLastRecord;
      el.style.display = canDelete ? '' : 'none';
      el.disabled = !canDelete;
      return;
    }
  });
}

function createActionButtons(leftActions, rightActions) {
  actionsLeftEl.innerHTML = '';
  actionsRightEl.innerHTML = '';
  (leftActions || []).forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.type = 'button';
    btn.textContent = item.icon;
    btn.title = item.title;
    btn.dataset.action = item.action;
    actionsLeftEl.appendChild(btn);
  });
  (rightActions || []).forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.type = 'button';
    btn.textContent = item.icon;
    btn.title = item.title;
    btn.dataset.action = item.action;
    actionsRightEl.appendChild(btn);
  });
  applyPermissions();
}

function setScreen(name) {
  state.currentScreen = name;
  if (name !== 'log-detail') state.detailEditMode = false;

  screens.forEach((section) => {
    section.classList.toggle('is-visible', section.dataset.screen === name);
  });

  navButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.screenTarget === name);
  });

  const meta = screenMeta[name] ?? { title: 'Registro', leftActions: [], rightActions: [] };
  titleEl.textContent = meta.title;
  createActionButtons(meta.leftActions, meta.rightActions);
}

function fillForm(record) {
  form.date.value = toDateInputValue(record.date);
  form.rawCode.value = record.rawCode ?? '';
  form.lot.value = record.lot ?? '';
  form.quantity.value = record.quantity ?? '';
  form.notes.value = record.notes ?? '';
  form.rollId.value = record.rollId ?? '';

  const idOp = record.IDOperator != null ? Number(record.IDOperator) : null;
  const idMach = record.IDMachine != null ? Number(record.IDMachine) : null;
  state.formDraft.IDOperator = idOp;
  state.formDraft.IDMachine = idMach;

  const op = state.operators.find((o) => Number(o.id) === idOp);
  const mach = state.machines.find((m) => Number(m.id) === idMach);

  if (operatorSelect) operatorSelect.value = idOp != null ? String(idOp) : '';
  if (machineSelect) machineSelect.value = idMach != null ? String(idMach) : '';

  state.currentOperator = op ?? null;
  applyPermissions();
}

function formToPayload() {
  const opId = operatorSelect && operatorSelect.value !== '' ? parseInt(operatorSelect.value, 10) : null;
  const machId = machineSelect && machineSelect.value !== '' ? parseInt(machineSelect.value, 10) : null;

  state.formDraft.IDOperator = opId;
  state.formDraft.IDMachine = machId;

  return {
    date: new Date().toISOString(),
    rawCode: form.rawCode.value,
    lot: form.lot.value,
    quantity: form.quantity.value ? Number(form.quantity.value) : 0,
    notes: form.notes.value,
    rollId: form.rollId.value,
    IDOperator: opId,
    IDMachine: machId
  };
}

function renderLogDetail(record) {
  detailGrid.innerHTML = '';

  const dateContainer = document.createElement('div');
  dateContainer.textContent = displayDate(record.date);

  if (state.currentOperator?.isAdmin && record.NumeroModifiche > 0) {
    const historyLink = document.createElement('span');
    historyLink.className = 'history-link';
    historyLink.textContent = `(modificato ${record.NumeroModifiche} volte)`;
    historyLink.onclick = () => openHistoryModal(record.uniqueRecordId);
    dateContainer.appendChild(historyLink);
  }

  const rows = [
    ['Data', dateContainer],
    ['Operatore', record.operator ?? '-'],
    ['Macchina', record.machine ?? '-'],
    ['Codice Articolo', record.rawCode ?? '-'],
    ['Lotto', record.lot ?? '-'],
    ['Quantità', record.quantity != null ? String(record.quantity) : '-'],
    ['Note', record.notes ?? '-'],
    ['ID Bobina', record.rollId ?? '-'],
    ['Bobina Finita', record.bobina_finita === true ? 'Sì' : record.bobina_finita === false ? 'No' : '-']
  ];

  rows.forEach(([k, v]) => {
    const key = document.createElement('p');
    key.className = 'k';
    key.textContent = k;

    const value = document.createElement('div');
    value.className = 'v';
    if (v instanceof HTMLElement) {
      value.appendChild(v);
    } else {
      value.textContent = v;
    }

    detailGrid.append(key, value);
  });
}

function renderLogDetailEditMode(record) {
  const staticRows = [
    ['Data', displayDate(record.date)],
    ['Operatore Originale', record.operator ?? '-'],
    ['ID Bobina', record.rollId ?? '-']
  ];

  detailGrid.innerHTML = '';
  staticRows.forEach(([k, v]) => {
    const key = document.createElement('p');
    key.className = 'k';
    key.textContent = k;
    const value = document.createElement('p');
    value.className = 'v';
    value.textContent = v;
    detailGrid.append(key, value);
  });

  const editableRows = [
    ['Quantità', 'quantity', 'number', record.quantity != null ? String(record.quantity) : ''],
    ['Codice Articolo', 'rawCode', 'text', record.rawCode ?? ''],
    ['Lotto', 'lot', 'text', record.lot ?? ''],
    ['Note', 'notes', 'textarea', record.notes ?? ''],
    ['Bobina Finita', 'bobinaFinita', 'select', record.bobina_finita == null ? '' : String(record.bobina_finita)]
  ];

  editableRows.forEach(([label, fieldId, type, val]) => {
    const key = document.createElement('p');
    key.className = 'k';
    key.textContent = label;
    const valueWrap = document.createElement('div');
    valueWrap.className = 'v';
    if (type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.id = `detailEdit-${fieldId}`;
      ta.rows = 4;
      ta.value = val;
      valueWrap.appendChild(ta);
    } else if (type === 'select') {
      const sel = document.createElement('select');
      sel.id = `detailEdit-${fieldId}`;
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Da definire';
      const opt1 = document.createElement('option');
      opt1.value = 'true';
      opt1.textContent = 'Sì';
      const opt2 = document.createElement('option');
      opt2.value = 'false';
      opt2.textContent = 'No';
      sel.append(opt0, opt1, opt2);
      sel.value = val;
      valueWrap.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.id = `detailEdit-${fieldId}`;
      inp.type = type;
      inp.value = val;
      if (type === 'number') inp.min = '0';
      valueWrap.appendChild(inp);
    }
    detailGrid.append(key, valueWrap);
  });
}

function exitDetailEditMode() {
  state.detailEditMode = false;
  if (state.selectedLog) {
    renderLogDetail(state.selectedLog);
  }
  const meta = screenMeta['log-detail'] ?? { leftActions: [], rightActions: [] };
  createActionButtons(meta.leftActions, meta.rightActions);
  applyPermissions();
}

function renderLogList(items) {
  logListEl.innerHTML = '';
  items.forEach((log) => {
    const li = document.createElement('li');

    // 1. Estrai solo la data (senza l'ora) dividendo la stringa
    const dateOnly = displayDate(log.date).split(' ')[0];

    // 2. Prepara le variabili con fallback se vuote
    const machineName = log.machine || '-';
    const code = log.rawCode || '-';
    const lot = log.lot || '-';
    const qty = log.quantity != null ? log.quantity : '-';

    // 3. Verifica le condizioni per colorare la riga in blu (Admin + Record modificato)
    const isAdmin = state.currentOperator?.isAdmin === true || state.currentOperator?.isAdmin === 1;
    if (isAdmin && log.NumeroModifiche > 0) {
      li.classList.add('is-modified-admin');
    }

    // 4. Costruisci il nuovo layout
    li.innerHTML = `
      <div class="log-card-content">
        <div class="log-card-row">
          <span class="log-date">${dateOnly}</span>
          <span class="log-machine">${machineName}</span>
        </div>
        <div class="log-card-row">
          <span class="log-code-lot">${code} | L. ${lot}</span>
          <span class="log-qty">${qty}</span>
        </div>
      </div>
    `;

    // 5. Mantieni la logica del click invariata
    li.addEventListener('click', async () => {
      state.selectedLog = log;
      renderLogDetail(log);
      setScreen('log-detail');
      applyPermissions();
      try {
        const fetched = await fetchData(`/logs/${log.uniqueRecordId}`);
        state.selectedLog = fetched;
        renderLogDetail(fetched);
        applyPermissions();
      } catch (err) {
        console.error(err);
        alert('Impossibile caricare il dettaglio. Verifica connessione.');
      }
    });

    logListEl.appendChild(li);
  });
}

function renderSimpleList(rootEl, items, onPick) {
  rootEl.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.name}</span>`;
    rootEl.appendChild(li);
  });
}

function renderOperatorList(items) {
  operatorListEl.innerHTML = '';
  const sortedItems = items.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));
  sortedItems.forEach((op) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${op.name}</span>`;
    operatorListEl.appendChild(li);
  });
}

// (datalist helpers rimossi: ora usiamo <select> nativi per operatore/macchina)

function sortByName(listKey) {
  const list = listKey === 'operators' ? state.operators : state.machines;
  list.sort((a, b) => {
    const result = (a.name || '').localeCompare(b.name || '', 'it');
    return state.sortAsc ? result : -result;
  });
  state.sortAsc = !state.sortAsc;
}

function applySearch(inputId, data, renderFn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const query = el.value.trim().toLowerCase();
  const filtered = data.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  renderFn(filtered);
}

function resetForm() {
  form.reset();
  form.date.value = new Date().toISOString().slice(0, 10);
  state.formDraft = {};
  state.selectedLog = null;
  if (operatorSelect) operatorSelect.value = '';
  if (machineSelect) machineSelect.value = '';
  state.currentOperator = null;
  updateDynamicRollId();
  applyPermissions();
  bypassBobinaPrompt = false;
}

async function handleTopbarAction(action) {
  if (action === 'cancel-log') {
    if (state.selectedLog) {
      fillForm(state.selectedLog);
    } else {
      resetForm();
    }
    return;
  }

  if (action === 'save-log') {
    const payload = formToPayload();
    if (payload.IDOperator == null || payload.IDMachine == null) {
      alert('Seleziona operatore e macchina.');
      return;
    }
    try {
      if (state.selectedLog) {
        const res = await fetch(`${API_URL}/logs/${state.selectedLog.uniqueRecordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(`${API_URL}/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
      }
      state.logs = await fetchData('/logs');
      renderLogList(state.logs);

      if (state.selectedLog) {
        // --- ERA UNA MODIFICA ---
        resetForm();
        setScreen('log-list');
        showEditSuccessModal();
      } else {
        // --- È UN NUOVO INSERIMENTO ---
        // 1. Salviamo le selezioni attuali
        const savedOperator = state.currentOperator;
        const savedMachineVal = machineSelect ? machineSelect.value : '';

        // 2. Resettiamo il form (pulisce date, quantità, lotti, etc.)
        resetForm();

        // 3. Ripristiniamo Operatore e Macchina
        if (savedOperator && operatorSelect) {
          operatorSelect.value = savedOperator.id;
          state.currentOperator = savedOperator;
          state.formDraft.IDOperator = savedOperator.id;
        }
        if (savedMachineVal && machineSelect) {
          machineSelect.value = savedMachineVal;
          state.formDraft.IDMachine = parseInt(savedMachineVal, 10);
        }
        applyPermissions();

        // 4. Mostriamo il modale e NON cambiamo schermata
        showSuccessModal();
      }
    } catch (err) {
      console.error(err);
      alert('Errore durante il salvataggio: ' + (err.message || err));
    }
    return;
  }

  if (action === 'back-to-list') {
    setScreen('log-list');
    return;
  }

  if (action === 'delete-log') {
    if (!state.selectedLog) return;
    if (!confirm('Eliminare questo log?')) return;
    const operatorId = state.currentOperator?.id;
    const url = operatorId != null
      ? `${API_URL}/logs/${state.selectedLog.uniqueRecordId}?operatorId=${operatorId}`
      : `${API_URL}/logs/${state.selectedLog.uniqueRecordId}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      state.logs = await fetchData('/logs');
      renderLogList(state.logs);
      setScreen('log-list');
      alert('Log eliminato.');
    } catch (err) {
      console.error(err);
      alert('Errore durante l\'eliminazione: ' + (err.message || err));
    }
    return;
  }

  if (action === 'cancel-detail-edit') {
    exitDetailEditMode();
    return;
  }

  if (action === 'save-detail-edit') {
    if (!state.selectedLog || !state.currentOperator) {
      alert('Seleziona un operatore per poter modificare.');
      return;
    }
    const quantityEl = document.getElementById('detailEdit-quantity');
    const rawCodeEl = document.getElementById('detailEdit-rawCode');
    const lotEl = document.getElementById('detailEdit-lot');
    const notesEl = document.getElementById('detailEdit-notes');
    const bobinaFinitaEl = document.getElementById('detailEdit-bobinaFinita');

    if (!quantityEl || !rawCodeEl || !lotEl || !notesEl || !bobinaFinitaEl) return;

    const bobinaFinitaValue = bobinaFinitaEl.value === 'true' ? true : bobinaFinitaEl.value === 'false' ? false : null;

    const payload = {
      modifyingOperatorId: state.currentOperator.id,
      rawCode: rawCodeEl.value,
      lot: lotEl.value,
      quantity: quantityEl.value ? parseFloat(quantityEl.value) : 0,
      notes: notesEl.value,
      bobina_finita: bobinaFinitaValue
    };
    try {
      const res = await fetch(`${API_URL}/logs/${state.selectedLog.uniqueRecordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      state.logs = await fetchData('/logs');
      renderLogList(state.logs);
      const updated = await fetchData(`/logs/${state.selectedLog.uniqueRecordId}`);
      state.selectedLog = updated;
      state.detailEditMode = false;
      renderLogDetail(updated);
      const meta = screenMeta['log-detail'] ?? { leftActions: [], rightActions: [] };
      createActionButtons(meta.leftActions, meta.rightActions);
      applyPermissions();
      alert('Salvataggio completato.');
    } catch (err) {
      console.error(err);
      alert('Errore durante il salvataggio: ' + (err.message || err));
    }
    return;
  }

  if (action === 'edit-from-detail') {
    if (!state.currentOperator) {
      alert('Seleziona un operatore per poter modificare.');
      return;
    }
    state.detailEditMode = true;
    renderLogDetailEditMode(state.selectedLog);
    createActionButtons(
      [{ icon: '✕', action: 'cancel-detail-edit', title: 'Annulla' }],
      [{ icon: '✓', action: 'save-detail-edit', title: 'Salva' }]
    );
    return;
  }

  if (action === 'refresh-log-list') {
    try {
      state.logs = await fetchData('/logs');
      renderLogList(state.logs);
    } catch (err) {
      alert('Errore aggiornamento lista: ' + (err.message || err));
    }
    return;
  }

  if (action === 'sort-log-list') {
    state.logs = state.logs.slice().reverse();
    renderLogList(state.logs);
    return;
  }

  if (action === 'refresh-operator-list') {
    try {
      state.operators = await fetchData('/operators');
      populateOperatorSelect();
      renderOperatorList(state.operators);
    } catch (err) {
      alert('Errore aggiornamento operatori: ' + (err.message || err));
    }
    return;
  }

  if (action === 'sort-operator-list') {
    sortByName('operators');
    renderOperatorList(state.operators);
    return;
  }

  if (action === 'add-operator') {
    const name = prompt('Nome operatore');
    if (name == null || name.trim() === '') return;
    const barcode = prompt('Barcode');
    if (barcode == null) return;
    const isAdmin = window.confirm("L'operatore è un Amministratore?\n\nPremi 'OK' per Sì\nPremi 'Annulla' per No");
    try {
      const res = await fetch(`${API_URL}/operators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), barcode: barcode.trim(), isAdmin })
      });
      if (!res.ok) throw new Error(await res.text());
      state.operators = await fetchData('/operators');
      populateOperatorSelect();
      renderOperatorList(state.operators);
      alert('Operatore aggiunto.');
    } catch (err) {
      console.error(err);
      alert('Errore: ' + (err.message || err));
    }
    return;
  }

  if (action === 'refresh-machine-list') {
    try {
      state.machines = await fetchData('/machines');
      renderSimpleList(machineListEl, state.machines, pickMachineFromList);
      populateMachineSelect();
    } catch (err) {
      alert('Errore aggiornamento macchine: ' + (err.message || err));
    }
    return;
  }

  if (action === 'sort-machine-list') {
    sortByName('machines');
    renderSimpleList(machineListEl, state.machines, pickMachineFromList);
    return;
  }

  if (action === 'add-machine') {
    const name = prompt('Nome macchina');
    if (name == null || name.trim() === '') return;
    const barcode = prompt('Barcode');
    if (barcode == null) return;
    try {
      const res = await fetch(`${API_URL}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), barcode: barcode.trim() })
      });
      if (!res.ok) throw new Error(await res.text());
      state.machines = await fetchData('/machines');
      renderSimpleList(machineListEl, state.machines, pickMachineFromList);
      populateMachineSelect();
      alert('Macchina aggiunta.');
    } catch (err) {
      console.error(err);
      alert('Errore: ' + (err.message || err));
    }
  }
}

function pickOperatorFromList(operator) {
  state.formDraft.IDOperator = operator.id != null ? Number(operator.id) : operator.id;
  state.currentOperator = operator;
  applyPermissions();
}

function pickMachineFromList(machine) {
  state.formDraft.IDMachine = machine.id != null ? Number(machine.id) : machine.id;
  if (machineSelect) machineSelect.value = machine.id != null ? String(machine.id) : '';
  if (state.returnFromLookupTo === 'log-edit') setScreen('log-edit');
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.returnFromLookupTo = null;
    // Se torniamo alla schermata del registro principale, assicuriamoci di essere in modalità "Nuovo Inserimento"
    if (btn.dataset.screenTarget === 'log-edit') {
      state.selectedLog = null;
      bypassBobinaPrompt = false;
    }
    setScreen(btn.dataset.screenTarget);
  });
});

/* --- Menu drawer (barra laterale) --- */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function openMenuDrawer() {
  document.getElementById('menuDrawer').classList.add('is-open');
  document.getElementById('menuDrawer').setAttribute('aria-hidden', 'false');
  document.getElementById('menuDrawerBackdrop').classList.add('is-open');
  document.getElementById('menuDrawerBackdrop').setAttribute('aria-hidden', 'false');
}

function closeMenuDrawer() {
  document.getElementById('menuDrawer').classList.remove('is-open');
  document.getElementById('menuDrawer').setAttribute('aria-hidden', 'true');
  document.getElementById('menuDrawerBackdrop').classList.remove('is-open');
  document.getElementById('menuDrawerBackdrop').setAttribute('aria-hidden', 'true');
}

document.getElementById('menuBtn').addEventListener('click', openMenuDrawer);
document.getElementById('menuDrawerClose').addEventListener('click', closeMenuDrawer);
document.getElementById('menuDrawerBackdrop').addEventListener('click', closeMenuDrawer);

document.getElementById('menuDrawer').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu-action]');
  if (!btn) return;
  const action = btn.dataset.menuAction;
  if (action === 'placeholder1' || action === 'placeholder2') return;
  if (action === 'add-to-home') {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
      });
      closeMenuDrawer();
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        alert('Per aggiungere alla Home: tocca il pulsante Condividi (quadrato con freccia) in Safari, poi "Aggiungi a Home".');
      } else {
        alert('Usa il menu del browser (⋮) e scegli "Installa app" o "Aggiungi a Home".');
      }
      closeMenuDrawer();
    }
  }
});

topbarEl.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  void handleTopbarAction(action);
});

const scanActionToFieldId = {
  'scan-raw-code': 'rawCode',
  'scan-lot': 'lot',
  'scan-operator': 'operator',
  'scan-machine': 'machine'
};

let barcodeScannerInstance = null;
let isScannerRunning = false;

function loginByBarcode(barcode, type = 'operator') {
  const code = String(barcode || '').trim();
  if (!code) return;

  if (type === 'operator') {
    const user = state.operators.find((o) => String(o.barcode || '').trim() === code);
    if (!user) {
      alert('Operatore non trovato per il barcode fornito.');
      return;
    }
    if (!operatorSelect) return;

    let option = Array.from(operatorSelect.options).find((opt) => opt.value === String(user.id));
    if (!option) {
      option = document.createElement('option');
      option.value = user.id != null ? String(user.id) : '';
      option.textContent = `${user.id} - ${user.name}`;
      operatorSelect.appendChild(option);
    }

    operatorSelect.value = user.id != null ? String(user.id) : '';
    state.formDraft.IDOperator = user.id != null ? Number(user.id) : user.id;
    state.currentOperator = user;
    applyPermissions();
    renderLogList(state.logs);
    return;
  }

  if (type === 'machine') {
    const machine = state.machines.find((m) => String(m.barcode || '').trim() === code);
    if (!machine) {
      alert('Macchina non trovata per il barcode fornito.');
      return;
    }
    if (!machineSelect) return;

    let option = Array.from(machineSelect.options).find((opt) => opt.value === String(machine.id));
    if (!option) {
      option = document.createElement('option');
      option.value = machine.id != null ? String(machine.id) : '';
      option.textContent = `${machine.id} - ${machine.name}`;
      machineSelect.appendChild(option);
    }

    machineSelect.value = machine.id != null ? String(machine.id) : '';
    state.formDraft.IDMachine = machine.id != null ? Number(machine.id) : machine.id;
  }
}

function playBarcodeBeep() {
  const audio = document.getElementById('barcodeBeepSound');
  if (!audio) return;

  audio.currentTime = 0;
  audio.play().catch((error) => {
    console.warn("Impossibile riprodurre il beep:", error);
  });
}

function closeBarcodeScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (barcodeScannerInstance) {
    if (isScannerRunning) {
      try {
        barcodeScannerInstance.stop().catch(() => {});
      } catch (e) {}
    }
    barcodeScannerInstance = null;
    isScannerRunning = false;
  }
  const container = document.getElementById('scannerContainer');
  if (container) container.innerHTML = '';
}

function openBarcodeScanner(targetFieldId) {
  const modal = document.getElementById('scannerModal');
  const container = document.getElementById('scannerContainer');
  if (!modal || !container) return;

  if (typeof Html5Qrcode === 'undefined') {
    alert('Libreria scanner non disponibile. Controlla la connessione.');
    return;
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  container.innerHTML = '';

  const onSuccess = (decodedText) => {
    playBarcodeBeep();
    if (targetFieldId === 'operator') {
      loginByBarcode(decodedText, 'operator');
      closeBarcodeScanner();
      return;
    }
    if (targetFieldId === 'machine') {
      loginByBarcode(decodedText, 'machine');
      closeBarcodeScanner();
      return;
    }

    // Fallback: scrivi nel campo target originale (es. rawCode / lot)
    const field = document.getElementById(targetFieldId);
    if (field) field.value = decodedText;
    if (targetFieldId === 'rawCode' || targetFieldId === 'lot') updateDynamicRollId();
    closeBarcodeScanner();
  };

  barcodeScannerInstance = new Html5Qrcode('scannerContainer');
  const config = { fps: 10, qrbox: { width: 260, height: 120 } };

  barcodeScannerInstance
    .start({ facingMode: 'environment' }, config, onSuccess)
    .then(() => {
      isScannerRunning = true;
    })
    .catch((err) => {
      isScannerRunning = false;
      closeBarcodeScanner();
      alert('Impossibile accedere alla fotocamera. Verifica i permessi o controlla di avere un dispositivo video collegato.');
      console.warn('Errore fotocamera:', err);
    });
}

document.getElementById('scannerModal').addEventListener('click', (e) => {
  if (e.target.id === 'scannerCancel' || e.target.closest('#scannerCancel') || e.target.id === 'scannerModal') {
    e.preventDefault();
    e.stopPropagation();
    closeBarcodeScanner();
  }
});

async function openHistoryModal(logId) {
  try {
    const historyData = await fetchData(`/logs/${logId}/history`);
    const tbody = document.querySelector('#historyTable tbody');
    tbody.innerHTML = '';

    historyData.forEach(row => {
      const tr = document.createElement('tr');
      const dataLabel = row.NumeroModifiche === 0 ? 'Creazione Originale' : displayDate(row.validFrom);

      tr.innerHTML = `
        <td>${dataLabel}</td>
        <td>${row.operatorName ?? '-'}</td>
        <td>${row.quantity ?? '-'}</td>
        <td>${row.rawCode ?? '-'}</td>
        <td>${row.lot ?? '-'}</td>
        <td>${row.notes ?? '-'}</td>
      `;
      tbody.appendChild(tr);
    });

    const modal = document.getElementById('historyModal');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  } catch (err) {
    alert('Errore caricamento storico: ' + err.message);
  }
}

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

document.getElementById('historyModal').addEventListener('click', (e) => {
  if (e.target.id === 'historyCancel' || e.target.id === 'historyModal') {
    e.preventDefault();
    e.stopPropagation();
    closeHistoryModal();
  }
});

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  if (action === 'manual-operator-barcode') {
    const code = window.prompt("Inserisci o scansiona il codice a barre dell'operatore:");
    if (code) loginByBarcode(code, 'operator');
    return;
  }
  if (action === 'manual-machine-barcode') {
    const code = window.prompt("Inserisci o scansiona il codice a barre della macchina:");
    if (code) loginByBarcode(code, 'machine');
    return;
  }

  const fieldId = scanActionToFieldId[action];
  if (fieldId) {
    openBarcodeScanner(fieldId);
    return;
  }
  if (['add-operator', 'add-machine'].includes(action)) {
    void handleTopbarAction(action);
  }
});

document.getElementById('logDatePickerBtn').addEventListener('click', () => {
  document.getElementById('logDate').showPicker?.();
});

document.getElementById('rawCode').addEventListener('input', updateDynamicRollId);
document.getElementById('rawCode').addEventListener('change', updateDynamicRollId);
document.getElementById('lot').addEventListener('input', updateDynamicRollId);
document.getElementById('lot').addEventListener('change', updateDynamicRollId);

document.getElementById('logSearch').addEventListener('input', () => {
  applySearch('logSearch', state.logs, renderLogList);
});

document.getElementById('operatorListSearch').addEventListener('input', () => {
  applySearch('operatorListSearch', state.operators, (list) => {
    renderOperatorList(list);
  });
});

document.getElementById('machineListSearch').addEventListener('input', () => {
  applySearch('machineListSearch', state.machines, (list) => {
    renderSimpleList(machineListEl, list, pickMachineFromList);
  });
});

if (operatorSelect) {
  operatorSelect.addEventListener('change', () => {
    const val = operatorSelect.value;
    const id = val ? parseInt(val, 10) : null;
    const op = id != null ? state.operators.find((o) => Number(o.id) === id) : null;
    state.formDraft.IDOperator = id;
    state.currentOperator = op ?? null;
    applyPermissions();
    renderLogList(state.logs);
  });
}

if (machineSelect) {
  machineSelect.addEventListener('change', () => {
    const val = machineSelect.value;
    const id = val ? parseInt(val, 10) : null;
    state.formDraft.IDMachine = id;
  });
}

let pendingBobinaLogId = null;
let bypassBobinaPrompt = false;

const quantityInput = document.getElementById('quantity');
if (quantityInput) {
  quantityInput.addEventListener('focus', (e) => {
    if (!state.selectedLog && state.logs && state.logs.length > 0) {
      const lastLog = state.logs[0];
      if (lastLog.bobina_finita === null && !bypassBobinaPrompt) {
        // Blocca subito il trigger per evitare rientri
        bypassBobinaPrompt = true;
        pendingBobinaLogId = lastLog.uniqueRecordId;

        const modal = document.getElementById('bobinaModal');
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');

        // Togli il focus per chiudere la tastiera virtuale sui device mobile
        e.target.blur();
      }
    }
  });

  quantityInput.addEventListener('blur', () => {
    const modal = document.getElementById('bobinaModal');
    // Il timeout previene conflitti se l'evento blur scatta mentre il modale si sta aprendo
    setTimeout(() => {
      if (!modal.classList.contains('is-open')) {
        bypassBobinaPrompt = false;
      }
    }, 50);
  });
}

function chiudiBobinaModal() {
  const modal = document.getElementById('bobinaModal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  pendingBobinaLogId = null;
  bypassBobinaPrompt = true;

  setTimeout(() => {
    const qty = document.getElementById('quantity');
    if (qty) qty.focus();
  }, 100);
}

async function impostaStatoBobina(isFinita) {
  if (!pendingBobinaLogId) return chiudiBobinaModal();
  try {
    const res = await fetch(`${API_URL}/logs/${pendingBobinaLogId}/bobina-finita`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bobina_finita: isFinita })
    });
    if (!res.ok) throw new Error(await res.text());

    const lastLog = state.logs.find(l => l.uniqueRecordId === pendingBobinaLogId);
    if (lastLog) {
      lastLog.bobina_finita = isFinita;
    }
    chiudiBobinaModal();
  } catch (err) {
    alert('Errore durante l\'aggiornamento della bobina: ' + (err.message || err));
    chiudiBobinaModal();
  }
}

document.getElementById('bobinaBtnYes').addEventListener('click', () => impostaStatoBobina(true));
document.getElementById('bobinaBtnNo').addEventListener('click', () => impostaStatoBobina(false));
document.getElementById('bobinaBtnCancel').addEventListener('click', chiudiBobinaModal);

function showSuccessModal() {
  const modal = document.getElementById('successModal');
  if (modal) {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }
}

document.getElementById('successBtnClose')?.addEventListener('click', () => {
  const modal = document.getElementById('successModal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
});

function showEditSuccessModal() {
  const modal = document.getElementById('editSuccessModal');
  if (modal) {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }
}

document.getElementById('editSuccessBtnClose')?.addEventListener('click', () => {
  const modal = document.getElementById('editSuccessModal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
});

initApp();
