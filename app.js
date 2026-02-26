const placeholderData = {
  operators: [
    { id: '1002', name: 'Abdessamad Mchaoury' },
    { id: '1003', name: 'Alessio Venanzi' },
    { id: '1000', name: 'Daniele Boattelli' },
    { id: '1001', name: 'Stefano Mancinelli' }
  ],
  machines: [
    { id: '3007', name: 'GFM Fasce Laterali' },
    { id: '3005', name: 'GFM Main' },
    { id: '3006', name: 'GFM Reinforcement' }
  ],
  logs: [
    {
      uniqueRecordId: '00001019',
      date: '23/06/2023 00:00',
      operator: 'Daniele Boattelli',
      machine: 'GFM Main',
      rawCode: '12',
      lot: '12',
      quantity: '12',
      notes: 'Test 1',
      rollId: '12'
    },
    {
      uniqueRecordId: '00001020',
      date: '23/06/2023 00:00',
      operator: 'Stefano Mancinelli',
      machine: 'GFM Reinforcement',
      rawCode: 'RM-07',
      lot: 'L-20',
      quantity: '9',
      notes: 'Controllo qualità OK',
      rollId: 'R-20'
    },
    {
      uniqueRecordId: '00001021',
      date: '22/06/2023 20:30',
      operator: 'Alessio Venanzi',
      machine: 'GFM Main',
      rawCode: 'RM-31',
      lot: 'L-44',
      quantity: '16',
      notes: 'Cambio bobina',
      rollId: 'R-44'
    }
  ]
};

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
      { icon: '↕', action: 'sort-operator-list', title: 'Ordina' }
    ]
  },
  'machine-list': {
    title: 'Macchine',
    leftActions: [
      { icon: '↻', action: 'refresh-machine-list', title: 'Aggiorna' }
    ],
    rightActions: [
      { icon: '↕', action: 'sort-machine-list', title: 'Ordina' }
    ]
  }
};

const state = {
  currentScreen: 'log-edit',
  sortAsc: true,
  selectedLog: placeholderData.logs[0],
  returnFromLookupTo: null,
  formDraft: null
};

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

function initCombobox(inputId, dropdownId, getItems, getValueFromItem, clearOptionLabel) {
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
  form.operator.value = record.operator;
  form.machine.value = record.machine;
  form.rawCode.value = record.rawCode;
  form.lot.value = record.lot;
  form.quantity.value = record.quantity;
  form.notes.value = record.notes;
  form.rollId.value = record.rollId;
}

function formToRecord() {
  const formattedDate = form.date.value ? `${form.date.value.split('-').reverse().join('/')} 00:00` : '';
  return {
    uniqueRecordId: state.selectedLog?.uniqueRecordId ?? `TMP${Date.now()}`,
    date: formattedDate,
    operator: form.operator.value,
    machine: form.machine.value,
    rawCode: form.rawCode.value,
    lot: form.lot.value,
    quantity: form.quantity.value,
    notes: form.notes.value,
    rollId: form.rollId.value
  };
}

function renderDetail(record) {
  const rows = [
    ['Codice materia prima', record.rawCode],
    ['Lotto', record.lot],
    ['Macchina', record.machine],
    ['Note', record.notes],
    ['Operatore', record.operator],
    ['Quantità', record.quantity],
    ['ID rotolo', record.rollId],
    ['Data', record.date],
    ['ID record', record.uniqueRecordId]
  ];

  detailGrid.innerHTML = '';
  rows.forEach(([k, v]) => {
    const key = document.createElement('p');
    key.className = 'k';
    key.textContent = k;

    const value = document.createElement('p');
    value.className = 'v';
    value.textContent = v || '-';

    detailGrid.append(key, value);
  });
}

function renderLogList(items) {
  logListEl.innerHTML = '';
  items.forEach((log) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${log.uniqueRecordId}<br /><small>${log.date}</small></span><span>›</span>`;
    li.addEventListener('click', () => {
      state.selectedLog = log;
      renderDetail(log);
      setScreen('log-detail');
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
  placeholderData[listKey].sort((a, b) => {
    const result = a.name.localeCompare(b.name, 'it');
    return state.sortAsc ? result : -result;
  });
  state.sortAsc = !state.sortAsc;
}

function applySearch(inputId, data, renderFn) {
  const query = document.getElementById(inputId).value.trim().toLowerCase();
  const filtered = data.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  renderFn(filtered);
}

function resetFormWithPlaceholders() {
  form.reset();
  form.date.value = new Date().toISOString().slice(0, 10);
}

function handleTopbarAction(action) {
  if (action === 'cancel-log') {
    if (state.formDraft) {
      fillForm(state.formDraft);
    } else {
      resetFormWithPlaceholders();
    }
    return;
  }

  if (action === 'save-log') {
    const record = formToRecord();
    const existingIndex = placeholderData.logs.findIndex((l) => l.uniqueRecordId === record.uniqueRecordId);
    if (existingIndex >= 0) {
      placeholderData.logs[existingIndex] = record;
    } else {
      placeholderData.logs.unshift(record);
    }
    state.selectedLog = record;
    state.formDraft = record;
    renderLogList(placeholderData.logs);
    renderDetail(record);
    alert('Salvataggio placeholder completato (in memoria, non DB).');
    return;
  }

  if (action === 'back-to-list') {
    setScreen('log-list');
    return;
  }

  if (action === 'delete-log') {
    if (!state.selectedLog) {
      return;
    }
    placeholderData.logs = placeholderData.logs.filter(
      (item) => item.uniqueRecordId !== state.selectedLog.uniqueRecordId
    );
    renderLogList(placeholderData.logs);
    setScreen('log-list');
    return;
  }

  if (action === 'edit-from-detail') {
    fillForm(state.selectedLog);
    setScreen('log-edit');
    return;
  }

  if (action === 'refresh-log-list') {
    renderLogList(placeholderData.logs);
    return;
  }

  if (action === 'sort-log-list') {
    placeholderData.logs.reverse();
    renderLogList(placeholderData.logs);
    return;
  }

  if (action === 'refresh-operator-list') {
    renderSimpleList(operatorListEl, placeholderData.operators, pickOperatorFromList);
    return;
  }

  if (action === 'sort-operator-list') {
    sortByName('operators');
    renderSimpleList(operatorListEl, placeholderData.operators, pickOperatorFromList);
    return;
  }

  if (action === 'add-operator-placeholder') {
    const id = `1${Math.floor(Math.random() * 900 + 100)}`;
    placeholderData.operators.push({ id, name: `Nuovo Operatore ${id}` });
    renderSimpleList(operatorListEl, placeholderData.operators, pickOperatorFromList);
    return;
  }

  if (action === 'refresh-machine-list') {
    renderSimpleList(machineListEl, placeholderData.machines, pickMachineFromList);
    return;
  }

  if (action === 'sort-machine-list') {
    sortByName('machines');
    renderSimpleList(machineListEl, placeholderData.machines, pickMachineFromList);
    return;
  }

  if (action === 'add-machine-placeholder') {
    const id = `3${Math.floor(Math.random() * 900 + 100)}`;
    placeholderData.machines.push({ id, name: `Nuova Macchina ${id}` });
    renderSimpleList(machineListEl, placeholderData.machines, pickMachineFromList);
  }
}

function pickOperatorFromList(operator) {
  form.operator.value = operator.name;
  if (state.returnFromLookupTo === 'log-edit') {
    setScreen('log-edit');
  }
}

function pickMachineFromList(machine) {
  form.machine.value = machine.name;
  if (state.returnFromLookupTo === 'log-edit') {
    setScreen('log-edit');
  }
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
  if (!action) {
    return;
  }
  handleTopbarAction(action);
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
    const field = document.getElementById(targetFieldId);
    if (field) field.value = decodedText;
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
  if (!action) {
    return;
  }

  const fieldId = scanActionToFieldId[action];
  if (fieldId) {
    openBarcodeScanner(fieldId);
    return;
  }
});

document.getElementById('logDatePickerBtn').addEventListener('click', () => {
  document.getElementById('logDate').showPicker?.();
});

document.getElementById('logSearch').addEventListener('input', () => {
  applySearch('logSearch', placeholderData.logs, renderLogList);
});

document.getElementById('operatorSearch').addEventListener('input', () => {
  applySearch('operatorSearch', placeholderData.operators, (list) => {
    renderSimpleList(operatorListEl, list, pickOperatorFromList);
  });
});

document.getElementById('machineSearch').addEventListener('input', () => {
  applySearch('machineSearch', placeholderData.machines, (list) => {
    renderSimpleList(machineListEl, list, pickMachineFromList);
  });
});

initCombobox(
  'logOperator',
  'logOperatorDropdown',
  () => placeholderData.operators,
  (item) => item.name,
  'Seleziona operatore'
);
initCombobox(
  'logMachine',
  'logMachineDropdown',
  () => placeholderData.machines,
  (item) => item.name,
  'Seleziona macchina'
);
renderLogList(placeholderData.logs);
renderSimpleList(operatorListEl, placeholderData.operators, pickOperatorFromList);
renderSimpleList(machineListEl, placeholderData.machines, pickMachineFromList);
state.formDraft = placeholderData.logs[0];
fillForm(placeholderData.logs[0]);
form.operator.value = '';
form.machine.value = '';
form.rawCode.value = '';
form.lot.value = '';
form.quantity.value = '';
form.notes.value = '';
form.rollId.value = '';
renderDetail(placeholderData.logs[0]);
setScreen('log-edit');
