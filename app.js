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
  currentOperator: null
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
  populateOperatorDatalist();
  populateMachineDatalist();
  renderLogList(state.logs);
  renderSimpleList(operatorListEl, state.operators, pickOperatorFromList);
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
    option.value = item.name;
    option.textContent = `${item.id} - ${item.name}`;
    select.appendChild(option);
  });
}

const RESTRICTED_ACTIONS = ['add-operator', 'add-machine', 'delete-log', 'edit-from-detail'];

function applyPermissions() {
  const isAdmin = state.currentOperator?.isAdmin === true;
  document.querySelectorAll('[data-action]').forEach((el) => {
    if (RESTRICTED_ACTIONS.includes(el.dataset.action)) {
      el.style.display = isAdmin ? '' : 'none';
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

  const hiddenOp = document.getElementById('IDOperator');
  const hiddenMach = document.getElementById('IDMachine');
  const opInput = document.getElementById('operatorSearch');
  const machInput = document.getElementById('machineSearch');

  const idOp = record.IDOperator != null ? Number(record.IDOperator) : null;
  const idMach = record.IDMachine != null ? Number(record.IDMachine) : null;
  state.formDraft.IDOperator = idOp;
  state.formDraft.IDMachine = idMach;

  const op = state.operators.find((o) => Number(o.id) === idOp);
  const mach = state.machines.find((m) => Number(m.id) === idMach);

  if (hiddenOp) hiddenOp.value = idOp != null ? String(idOp) : '';
  if (hiddenMach) hiddenMach.value = idMach != null ? String(idMach) : '';
  if (opInput) opInput.value = op ? op.name : (record.operator ?? '');
  if (machInput) machInput.value = mach ? mach.name : (record.machine ?? '');

  state.currentOperator = op ?? null;
  applyPermissions();
}

function formToPayload() {
  const hiddenOp = document.getElementById('IDOperator');
  const hiddenMach = document.getElementById('IDMachine');
  const idOp = hiddenOp && hiddenOp.value !== '' ? parseInt(hiddenOp.value, 10) : null;
  const idMach = hiddenMach && hiddenMach.value !== '' ? parseInt(hiddenMach.value, 10) : null;

  state.formDraft.IDOperator = idOp;
  state.formDraft.IDMachine = idMach;

  return {
    date: new Date().toISOString(),
    rawCode: form.rawCode.value,
    lot: form.lot.value,
    quantity: form.quantity.value ? Number(form.quantity.value) : 0,
    notes: form.notes.value,
    rollId: form.rollId.value,
    IDOperator: idOp,
    IDMachine: idMach
  };
}

// Ordine campi come in [CMP].[dbo].[Log]: IDLog, Date, IDOperator, IDMachine, Codart, Lot, Quantity, Notes, IDRoll
function renderLogDetail(record) {
  const rows = [
    ['ID Record', record.uniqueRecordId],
    ['Data', displayDate(record.date)],
    ['Operatore', record.operator ?? '-'],
    ['Macchina', record.machine ?? '-'],
    ['Codice Articolo', record.rawCode ?? '-'],
    ['Lotto', record.lot ?? '-'],
    ['Quantità', record.quantity != null ? String(record.quantity) : '-'],
    ['Note', record.notes ?? '-'],
    ['ID Bobina', record.rollId ?? '-']
  ];

  detailGrid.innerHTML = '';
  rows.forEach(([k, v]) => {
    const key = document.createElement('p');
    key.className = 'k';
    key.textContent = k;

    const value = document.createElement('p');
    value.className = 'v';
    value.textContent = v;

    detailGrid.append(key, value);
  });
}

function renderLogList(items) {
  logListEl.innerHTML = '';
  items.forEach((log) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${log.uniqueRecordId}<br /><small>${displayDate(log.date)}</small></span><span>›</span>`;
    li.addEventListener('click', async () => {
      state.selectedLog = log;
      renderLogDetail(log);
      setScreen('log-detail');
      try {
        const fetched = await fetchData(`/logs/${log.uniqueRecordId}`);
        state.selectedLog = fetched;
        renderLogDetail(fetched);
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
    li.innerHTML = `<span><strong>${item.id}</strong> ${item.name}</span><span>›</span>`;
    li.addEventListener('click', () => onPick(item));
    rootEl.appendChild(li);
  });
}

function populateOperatorDatalist() {
  const dl = document.getElementById('operatorList');
  if (!dl) return;
  dl.innerHTML = '';
  state.operators
    .filter((op) => !op.isAdmin && op.isAdmin !== 1)
    .forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op.name;
      opt.dataset.id = op.id != null ? String(op.id) : '';
      opt.dataset.barcode = op.barcode != null ? String(op.barcode) : '';
      dl.appendChild(opt);
    });
}

function populateMachineDatalist() {
  const dl = document.getElementById('machineList');
  if (!dl) return;
  dl.innerHTML = '';
  state.machines.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.dataset.id = m.id != null ? String(m.id) : '';
    opt.dataset.barcode = m.barcode != null ? String(m.barcode) : '';
    dl.appendChild(opt);
  });
}

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
  const hiddenOp = document.getElementById('IDOperator');
  const hiddenMach = document.getElementById('IDMachine');
  const opInput = document.getElementById('operatorSearch');
  const machInput = document.getElementById('machineSearch');
  if (hiddenOp) hiddenOp.value = '';
  if (hiddenMach) hiddenMach.value = '';
  if (opInput) opInput.value = '';
  if (machInput) machInput.value = '';
  state.currentOperator = null;
  updateDynamicRollId();
  applyPermissions();
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
      resetForm();
      setScreen('log-list');
      alert('Salvataggio completato.');
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
    try {
      const res = await fetch(`${API_URL}/logs/${state.selectedLog.uniqueRecordId}`, { method: 'DELETE' });
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

  if (action === 'edit-from-detail') {
    fillForm(state.selectedLog);
    setScreen('log-edit');
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
      populateOperatorDatalist();
      renderSimpleList(operatorListEl, state.operators, pickOperatorFromList);
    } catch (err) {
      alert('Errore aggiornamento operatori: ' + (err.message || err));
    }
    return;
  }

  if (action === 'sort-operator-list') {
    sortByName('operators');
    renderSimpleList(operatorListEl, state.operators, pickOperatorFromList);
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
      populateOperatorDatalist();
      renderSimpleList(operatorListEl, state.operators, pickOperatorFromList);
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
      populateMachineDatalist();
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
      populateMachineDatalist();
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
  const hiddenOp = document.getElementById('IDOperator');
  const opInput = document.getElementById('operatorSearch');
  if (hiddenOp) hiddenOp.value = operator.id != null ? String(operator.id) : '';
  if (opInput) opInput.value = operator.name;
  applyPermissions();
  if (state.returnFromLookupTo === 'log-edit') setScreen('log-edit');
}

function pickMachineFromList(machine) {
  state.formDraft.IDMachine = machine.id != null ? Number(machine.id) : machine.id;
  const hiddenMach = document.getElementById('IDMachine');
  const machInput = document.getElementById('machineSearch');
  if (hiddenMach) hiddenMach.value = machine.id != null ? String(machine.id) : '';
  if (machInput) machInput.value = machine.name;
  if (state.returnFromLookupTo === 'log-edit') setScreen('log-edit');
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.returnFromLookupTo = null;
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
  'scan-operator': 'operatorSearch',
  'scan-machine': 'machineSearch'
};

let barcodeScannerInstance = null;

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
  if (barcodeScannerInstance && typeof barcodeScannerInstance.stop === 'function') {
    barcodeScannerInstance.stop().catch(() => {});
    barcodeScannerInstance = null;
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
    const cleaned = String(decodedText).trim();

    // 1) prova come barcode operatore (inclusi Admin)
    const op = state.operators.find((o) => String(o.barcode || '').trim() === cleaned);
    if (op) {
      const hiddenOp = document.getElementById('IDOperator');
      const opInput = document.getElementById('operatorSearch');
      if (hiddenOp) hiddenOp.value = op.id != null ? String(op.id) : '';
      if (opInput) opInput.value = op.name;
      state.formDraft.IDOperator = op.id != null ? Number(op.id) : op.id;
      state.currentOperator = op;
      applyPermissions();
      closeBarcodeScanner();
      return;
    }

    // 2) altrimenti prova come barcode macchina
    const mach = state.machines.find((m) => String(m.barcode || '').trim() === cleaned);
    if (mach) {
      const hiddenMach = document.getElementById('IDMachine');
      const machInput = document.getElementById('machineSearch');
      if (hiddenMach) hiddenMach.value = mach.id != null ? String(mach.id) : '';
      if (machInput) machInput.value = mach.name;
      state.formDraft.IDMachine = mach.id != null ? Number(mach.id) : mach.id;
      closeBarcodeScanner();
      return;
    }

    // 3) fallback: scrivi nel campo target originale (es. rawCode / lot)
    {
      const field = document.getElementById(targetFieldId);
      if (field) field.value = decodedText;
      if (targetFieldId === 'rawCode' || targetFieldId === 'lot') updateDynamicRollId();
    }
    closeBarcodeScanner();
  };

  barcodeScannerInstance = new Html5Qrcode('scannerContainer');
  const config = { fps: 10, qrbox: { width: 260, height: 120 } };

  barcodeScannerInstance
    .start({ facingMode: 'environment' }, config, onSuccess)
    .catch((err) => {
      closeBarcodeScanner();
      alert('Impossibile accedere alla fotocamera. Verifica i permessi o usa un dispositivo con fotocamera.');
      console.warn(err);
    });
}

document.getElementById('scannerModal').addEventListener('click', (e) => {
  if (e.target.id === 'scannerCancel' || e.target.closest('#scannerCancel') || e.target.id === 'scannerModal') {
    e.preventDefault();
    e.stopPropagation();
    closeBarcodeScanner();
  }
});

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

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

function handleOperatorSearchInput() {
  const input = document.getElementById('operatorSearch');
  const hiddenOp = document.getElementById('IDOperator');
  if (!input || !hiddenOp) return;
  const value = input.value.trim();
  if (!value) {
    hiddenOp.value = '';
    state.formDraft.IDOperator = undefined;
    state.currentOperator = null;
    applyPermissions();
    return;
  }

  // 1) match barcode (tutti gli operatori, inclusi Admin)
  const byBarcode = state.operators.find((o) => String(o.barcode || '').trim() === value);
  if (byBarcode) {
    hiddenOp.value = byBarcode.id != null ? String(byBarcode.id) : '';
    input.value = byBarcode.name;
    state.formDraft.IDOperator = byBarcode.id != null ? Number(byBarcode.id) : byBarcode.id;
    state.currentOperator = byBarcode;
    applyPermissions();
    return;
  }

  // 2) match nome (solo non admin dal datalist)
  const byName = state.operators.find((o) => !o.isAdmin && o.name === value);
  if (byName) {
    hiddenOp.value = byName.id != null ? String(byName.id) : '';
    state.formDraft.IDOperator = byName.id != null ? Number(byName.id) : byName.id;
    state.currentOperator = byName;
    applyPermissions();
    return;
  }

  // nessuna corrispondenza
  hiddenOp.value = '';
  state.formDraft.IDOperator = undefined;
  state.currentOperator = null;
  applyPermissions();
}

function handleMachineSearchInput() {
  const input = document.getElementById('machineSearch');
  const hiddenMach = document.getElementById('IDMachine');
  if (!input || !hiddenMach) return;
  const value = input.value.trim();
  if (!value) {
    hiddenMach.value = '';
    state.formDraft.IDMachine = undefined;
    return;
  }

  // 1) match barcode
  const byBarcode = state.machines.find((m) => String(m.barcode || '').trim() === value);
  if (byBarcode) {
    hiddenMach.value = byBarcode.id != null ? String(byBarcode.id) : '';
    input.value = byBarcode.name;
    state.formDraft.IDMachine = byBarcode.id != null ? Number(byBarcode.id) : byBarcode.id;
    return;
  }

  // 2) match nome
  const byName = state.machines.find((m) => m.name === value);
  if (byName) {
    hiddenMach.value = byName.id != null ? String(byName.id) : '';
    state.formDraft.IDMachine = byName.id != null ? Number(byName.id) : byName.id;
    return;
  }

  hiddenMach.value = '';
  state.formDraft.IDMachine = undefined;
}

document.getElementById('operatorListSearch').addEventListener('input', () => {
  applySearch('operatorListSearch', state.operators, (list) => {
    renderSimpleList(operatorListEl, list, pickOperatorFromList);
  });
});

document.getElementById('machineListSearch').addEventListener('input', () => {
  applySearch('machineListSearch', state.machines, (list) => {
    renderSimpleList(machineListEl, list, pickMachineFromList);
  });
});

document.getElementById('operatorSearch').addEventListener('input', handleOperatorSearchInput);
document.getElementById('operatorSearch').addEventListener('change', handleOperatorSearchInput);
document.getElementById('machineSearch').addEventListener('input', handleMachineSearchInput);
document.getElementById('machineSearch').addEventListener('change', handleMachineSearchInput);

initApp();
