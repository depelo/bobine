const API_URL = 'http://localhost:3000/api';

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
const operatorListEl = document.getElementById('operatorList');
const machineListEl = document.getElementById('machineList');

function toDateInputValue(dateString) {
  const datePart = dateString.split(' ')[0];
  const [day, month, year] = datePart.split('/');
  return `${year}-${month}-${day}`;
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
  const idOp = record.IDOperator != null ? Number(record.IDOperator) : null;
  const idMach = record.IDMachine != null ? Number(record.IDMachine) : null;
  state.formDraft.IDOperator = idOp;
  state.formDraft.IDMachine = idMach;
  const op = state.operators.find((o) => Number(o.id) === idOp);
  const mach = state.machines.find((m) => Number(m.id) === idMach);
  form.operator.value = op ? op.name : (record.operator ?? '');
  form.machine.value = mach ? mach.name : (record.machine ?? '');
  state.currentOperator = op ?? null;
  applyPermissions();
}

function formToPayload() {
  const formattedDate = form.date.value ? `${form.date.value.split('-').reverse().join('/')} 00:00` : '';
  return {
    date: formattedDate,
    rawCode: form.rawCode.value,
    lot: form.lot.value,
    quantity: form.quantity.value ? Number(form.quantity.value) : 0,
    notes: form.notes.value,
    rollId: form.rollId.value,
    IDOperator: state.formDraft.IDOperator != null ? Number(state.formDraft.IDOperator) : null,
    IDMachine: state.formDraft.IDMachine != null ? Number(state.formDraft.IDMachine) : null
  };
}

// Ordine campi come in [CMP].[dbo].[Log]: IDLog, Date, IDOperator, IDMachine, Codart, Lot, Quantity, Notes, IDRoll
function renderLogDetail(record) {
  const formatDate = (dateVal) => {
    if (dateVal == null || dateVal === '') return '-';
    const d = new Date(dateVal);
    return Number.isNaN(d.getTime()) ? String(dateVal) : d.toLocaleString('it-IT');
  };

  const rows = [
    ['ID Record', record.uniqueRecordId],
    ['Data', formatDate(record.date)],
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
    li.innerHTML = `<span>${log.uniqueRecordId}<br /><small>${log.date}</small></span><span>›</span>`;
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

function sortByName(listKey) {
  const list = listKey === 'operators' ? state.operators : state.machines;
  list.sort((a, b) => {
    const result = (a.name || '').localeCompare(b.name || '', 'it');
    return state.sortAsc ? result : -result;
  });
  state.sortAsc = !state.sortAsc;
}

function applySearch(inputId, data, renderFn) {
  const query = document.getElementById(inputId).value.trim().toLowerCase();
  const filtered = data.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  renderFn(filtered);
}

function resetForm() {
  form.reset();
  form.date.value = new Date().toISOString().slice(0, 10);
  state.formDraft = {};
  state.selectedLog = null;
  form.operator.value = '';
  form.machine.value = '';
  state.currentOperator = null;
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
    const isAdmin = confirm('Impostare come amministratore?');
    try {
      const res = await fetch(`${API_URL}/operators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), barcode: barcode.trim(), isAdmin })
      });
      if (!res.ok) throw new Error(await res.text());
      state.operators = await fetchData('/operators');
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
  form.operator.value = operator.name;
  applyPermissions();
  if (state.returnFromLookupTo === 'log-edit') setScreen('log-edit');
}

function pickMachineFromList(machine) {
  state.formDraft.IDMachine = machine.id != null ? Number(machine.id) : machine.id;
  form.machine.value = machine.name;
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
  'scan-operator': 'logOperator',
  'scan-machine': 'logMachine'
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
    if (targetFieldId === 'logOperator') {
      const op = state.operators.find((o) => String(o.barcode || o.id || '').trim() === String(decodedText).trim());
      if (op) {
        state.formDraft.IDOperator = op.id != null ? Number(op.id) : op.id;
        state.currentOperator = op;
        const input = document.getElementById('logOperator');
        if (input) input.value = op.name;
        applyPermissions();
      } else {
        const input = document.getElementById('logOperator');
        if (input) input.value = decodedText;
      }
    } else if (targetFieldId === 'logMachine') {
      const mach = state.machines.find((m) => String(m.barcode || m.id || '').trim() === String(decodedText).trim());
      if (mach) {
        state.formDraft.IDMachine = mach.id != null ? Number(mach.id) : mach.id;
        const input = document.getElementById('logMachine');
        if (input) input.value = mach.name;
      } else {
        const input = document.getElementById('logMachine');
        if (input) input.value = decodedText;
      }
    } else {
      const field = document.getElementById(targetFieldId);
      if (field) field.value = decodedText;
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

document.getElementById('logSearch').addEventListener('input', () => {
  applySearch('logSearch', state.logs, renderLogList);
});

document.getElementById('operatorSearch').addEventListener('input', () => {
  applySearch('operatorSearch', state.operators, (list) => {
    renderSimpleList(operatorListEl, list, pickOperatorFromList);
  });
});

document.getElementById('machineSearch').addEventListener('input', () => {
  applySearch('machineSearch', state.machines, (list) => {
    renderSimpleList(machineListEl, list, pickMachineFromList);
  });
});

initCombobox(
  'logOperator',
  'logOperatorDropdown',
  () => state.operators,
  (item) => item.name,
  'Seleziona operatore',
  (item) => {
    state.formDraft.IDOperator = item.id != null ? Number(item.id) : item.id;
    state.currentOperator = item;
    applyPermissions();
  },
  () => {
    state.formDraft.IDOperator = undefined;
    state.currentOperator = null;
    applyPermissions();
  }
);
initCombobox(
  'logMachine',
  'logMachineDropdown',
  () => state.machines,
  (item) => item.name,
  'Seleziona macchina',
  (item) => {
    state.formDraft.IDMachine = item.id != null ? Number(item.id) : item.id;
  },
  () => {
    state.formDraft.IDMachine = undefined;
  }
);

initApp();
