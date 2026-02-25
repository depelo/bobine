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
    title: 'Log',
    actions: [
      { icon: '✕', action: 'cancel-log', title: 'Annulla' },
      { icon: '✓', action: 'save-log', title: 'Salva' }
    ]
  },
  'log-detail': {
    title: 'Log Detail',
    actions: [
      { icon: '‹', action: 'back-to-list', title: 'Indietro' },
      { icon: '🗑', action: 'delete-log', title: 'Elimina' },
      { icon: '✎', action: 'edit-from-detail', title: 'Modifica' }
    ]
  },
  'log-list': {
    title: 'Log Details',
    actions: [
      { icon: '↻', action: 'refresh-log-list', title: 'Refresh' },
      { icon: '↕', action: 'sort-log-list', title: 'Ordina' },
      { icon: '+', action: 'new-log', title: 'Nuovo' }
    ]
  },
  'operator-list': {
    title: 'Operator Names',
    actions: [
      { icon: '↻', action: 'refresh-operator-list', title: 'Refresh' },
      { icon: '↕', action: 'sort-operator-list', title: 'Ordina' },
      { icon: '+', action: 'add-operator-placeholder', title: 'Aggiungi placeholder' }
    ]
  },
  'machine-list': {
    title: 'Machine Names',
    actions: [
      { icon: '↻', action: 'refresh-machine-list', title: 'Refresh' },
      { icon: '↕', action: 'sort-machine-list', title: 'Ordina' },
      { icon: '+', action: 'add-machine-placeholder', title: 'Aggiungi placeholder' }
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
const actionsEl = document.getElementById('topbarActions');
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.side-btn');
const form = document.getElementById('logForm');
const detailGrid = document.getElementById('detailGrid');
const operatorSelect = document.getElementById('logOperator');
const machineSelect = document.getElementById('logMachine');
const logListEl = document.getElementById('logList');
const operatorListEl = document.getElementById('operatorList');
const machineListEl = document.getElementById('machineList');

function toDateInputValue(dateString) {
  const datePart = dateString.split(' ')[0];
  const [day, month, year] = datePart.split('/');
  return `${year}-${month}-${day}`;
}

function populateSelect(select, items, placeholderLabel) {
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

function createActionButtons(actions) {
  actionsEl.innerHTML = '';
  actions.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.type = 'button';
    btn.textContent = item.icon;
    btn.title = item.title;
    btn.dataset.action = item.action;
    actionsEl.appendChild(btn);
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

  const meta = screenMeta[name] ?? { title: 'Log', actions: [] };
  titleEl.textContent = meta.title;
  createActionButtons(meta.actions);
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
    ['Article raw material code', record.rawCode],
    ['Lot', record.lot],
    ['Machine', record.machine],
    ['Notes', record.notes],
    ['Operator', record.operator],
    ['Quantity', record.quantity],
    ['Roll ID', record.rollId],
    ['Date', record.date],
    ['Unique Record ID', record.uniqueRecordId]
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

  if (action === 'new-log') {
    resetFormWithPlaceholders();
    setScreen('log-edit');
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
    populateSelect(operatorSelect, placeholderData.operators, 'Seleziona operatore');
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
    populateSelect(machineSelect, placeholderData.machines, 'Seleziona macchina');
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

actionsEl.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) {
    return;
  }
  handleTopbarAction(action);
});

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) {
    return;
  }

  if (action === 'open-operator-list') {
    state.returnFromLookupTo = 'log-edit';
    setScreen('operator-list');
  }

  if (action === 'open-machine-list') {
    state.returnFromLookupTo = 'log-edit';
    setScreen('machine-list');
  }

  if (action === 'scan-raw-code') {
    form.rawCode.value = `RM-${Math.floor(Math.random() * 900 + 100)}`;
  }

  if (action === 'scan-operator') {
    form.operator.value = placeholderData.operators[Math.floor(Math.random() * placeholderData.operators.length)].name;
  }

  if (action === 'scan-machine') {
    form.machine.value = placeholderData.machines[Math.floor(Math.random() * placeholderData.machines.length)].name;
  }

  if (action === 'pick-date') {
    form.date.showPicker?.();
  }
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

populateSelect(operatorSelect, placeholderData.operators, 'Seleziona operatore');
populateSelect(machineSelect, placeholderData.machines, 'Seleziona macchina');
renderLogList(placeholderData.logs);
renderSimpleList(operatorListEl, placeholderData.operators, pickOperatorFromList);
renderSimpleList(machineListEl, placeholderData.machines, pickMachineFromList);
state.formDraft = placeholderData.logs[0];
fillForm(placeholderData.logs[0]);
renderDetail(placeholderData.logs[0]);
setScreen('log-edit');
