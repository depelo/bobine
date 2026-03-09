---
name: fix-layer-security-bobine
overview: Rafforzare la sicurezza e l’integrazione tra Layer di sicurezza e modulo Bobine, rimuovendo scorciatoie non autorizzate e riallineando lo stato utente/UI al nuovo modello.
todos:
  - id: remove-hardcoded-captain-button
    content: Rimuovere il bottone statico "Captain Console" dal menu drawer in bobine.html lasciando solo le voci dinamicamente gestite.
    status: pending
  - id: add-rbac-guard-sicurezza
    content: Estendere initSecurity in sicurezza.js con il blocco RBAC su pathname prima di impostare window.SecurityData e dispatchare securityReady.
    status: pending
  - id: hydrate-operator-from-securitydata
    content: Collegare bobine.js all’evento securityReady, idratare state.currentOperator da window.SecurityData.user, aggiornare display operatore e permessi, e rimuovere l’initApp() diretto.
    status: pending
isProject: false
---

## Fix sicurezza e integrazione Layer per modulo Bobine

### 1. Pulizia Captain Console hardcodata in `bobine.html`

- **Rimozione bottone statico Captain Console**: in `[bobine.html](bobine.html)`, dentro il blocco `div.menu-drawer-actions`, eliminare fisicamente il bottone:
  - Da:

```12:28:c:\Users\depel\Documents\progetto\ujet\bobine\bobine.html
      <div class="menu-drawer-actions">
        <button type="button" class="menu-drawer-btn" data-menu-action="placeholder1">Opzione 1</button>
        <button type="button" class="menu-drawer-btn" data-menu-action="open-profile">👤 Il Mio Profilo</button>
        <button type="button" class="menu-drawer-btn" data-menu-action="open-captain">⚙️ Captain Console</button>
        <button type="button" class="menu-drawer-btn menu-drawer-btn-primary" id="menuAddToHome" data-menu-action="add-to-home">Aggiungi a Home</button>
      </div>
```

- A (rimuovendo solo la riga `open-captain`):

```html
      <div class="menu-drawer-actions">
        <button type="button" class="menu-drawer-btn" data-menu-action="placeholder1">Opzione 1</button>
        <button type="button" class="menu-drawer-btn" data-menu-action="open-profile">👤 Il Mio Profilo</button>
        <button type="button" class="menu-drawer-btn menu-drawer-btn-primary" id="menuAddToHome" data-menu-action="add-to-home">Aggiungi a Home</button>
      </div>
```

- **Motivazione**: il link alla Captain Console rimarrà disponibile solo se iniettato dinamicamente dallo strato di sicurezza o da JS centrale, evitando scorciatoie HTML che bypassano il controllo permessi.

### 2. Blindare il buttafuori in `sicurezza.js` (RBAC su URL)

- **Punto di inserimento**: in `[sicurezza.js](sicurezza.js)`, dentro `async function initSecurity()`, subito dopo `const data = await res.json();` e mantenendo l’attuale controllo `403 + requiresPasswordChange` prima di esporre i dati globali.
- **Modifica dettagliata**: trasformare il blocco attuale:

```3:21:c:\Users\depel\Documents\progetto\ujet\bobine\sicurezza.js
async function initSecurity() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/'; // Kick to Layer 1
      return false;
    }
    
    const data = await res.json();
    
    if (res.status === 403 && data.requiresPasswordChange) {
      showPasswordCurtain();
      return false; // Ferma l'inizializzazione dell'app
    }
    
    if (res.ok) {
      window.SecurityData = data;
      document.dispatchEvent(new Event('securityReady')); // Avvisa il Layer 2
      return true;
    }
```

- In un blocco che, dopo `const data = await res.json();`, aggiunge il controllo RBAC, ma **prima** del ramo `if (res.ok)` che popola `window.SecurityData`:

```javascript
    const data = await res.json();

    if (res.status === 403 && data.requiresPasswordChange) {
      showPasswordCurtain();
      return false; // Ferma l'inizializzazione dell'app
    }

    // --- CONTROLLO ACCESSO AI MODULI (RBAC) ---
    const user = data.user;
    const currentPath = window.location.pathname.toLowerCase();

    // Escludiamo il root e il gateway dal controllo
    if (currentPath !== '/' && currentPath !== '/index.html') {
      if (user && !user.isSuperuser) {
        // Se tenta di accedere alla captain console
        if (currentPath.includes('captain')) {
          alert('Accesso negato alla Captain Console.');
          window.location.href = '/';
          return false;
        }

        // Se tenta di accedere a bobine
        if (currentPath.includes('bobine')) {
          // Cerca se ha l'autorizzazione per la TargetTable 'Operators'
          const hasBobineAccess = Array.isArray(user.authorizedApps)
            && user.authorizedApps.some(app => app.target === 'Operators');
          if (!hasBobineAccess) {
            alert('Non sei autorizzato ad accedere al modulo Bobine.');
            window.location.href = '/';
            return false;
          }
        }
      }
    }

    if (res.ok) {
      window.SecurityData = data;
      document.dispatchEvent(new Event('securityReady')); // Avvisa il Layer 2
      return true;
    }
```

- **Effetto**: qualsiasi tentativo di navigazione diretta a `captain*.html` o `*bobine*` da parte di un utente senza i permessi corretti viene bloccato prima che il Layer 2 riceva l’evento `securityReady`.

### 3. Idratazione stato/app in `bobine.js` da `window.SecurityData.user`

Qui ci adeguiamo all’architettura Layered, usando i dati di `sicurezza.js` invece di rifare il `GET /api/me` interno.

#### 3.1 Allineare inizializzazione all’evento `securityReady`

- **Obiettivo**: far sì che l’app Bobine si inizializzi solo **dopo** che il Layer di sicurezza ha completato `initSecurity()` e ha valorizzato `window.SecurityData`.
- **Passi in `[bobine.js](bobine.js)`**:
  - Lasciare intatta la logica esistente di `state`, `updateCurrentOperatorUI()`, `applyPermissions()`, `loadInitialData()` e dei flussi di login/logout interni (usati per cambiare operatore all’interno del modulo).
  - Modificare la parte finale del file dove oggi c’è una chiamata diretta a `initApp();`:

```1851:1856:c:\Users\depel\Documents\progetto\ujet\bobine\bobine.js
if (loginPasswordInput) {
  loginPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void performLogin();
    }
  });
}
...
initApp();
```

- Invece di chiamare subito `initApp()`, agganciare l’inizializzazione all’evento `securityReady` e usare `window.SecurityData.user` per popolare lo stato:

```javascript
document.addEventListener('securityReady', async () => {
  if (!window.SecurityData || !window.SecurityData.user) {
    // Se per qualche motivo manca l'utente, fallback alla logica attuale
    await initApp();
    return;
  }

  const user = window.SecurityData.user;

  // 1. Idratazione dello stato operatore nel modello esistente
  state.currentOperator = {
    ...(state.currentOperator || {}),
    ...user
  };

  // 2. Aggiornamento UI display operatore + colori Admin
  const displayObj = document.getElementById('currentOperatorDisplay');
  if (displayObj) {
    const name = state.currentOperator.name || user.username || user.Barcode || user.Nome || 'Operatore';
    const isAdmin = state.currentOperator.isAdmin === true || state.currentOperator.isAdmin === 1;

    displayObj.value = name;

    if (isAdmin) {
      displayObj.style.backgroundColor = '#d4edda'; // Verde tenue per admin
      displayObj.style.color = '#155724';
      displayObj.style.borderColor = '#c3e6cb';
    } else {
      displayObj.style.backgroundColor = '#e9ecef'; // Grigio standard per base
      displayObj.style.color = '#495057';
      displayObj.style.borderColor = '#ced4da';
    }
  }

  // 3. Ricalcolo permessi e caricamento dati iniziali
  applyPermissions();
  await loadInitialData();
  setScreen('log-edit');
});
```

- Commentare o rimuovere la chiamata diretta a `initApp();` in fondo al file, così l’avvio standard passa sempre dal Layer di sicurezza.

#### 3.2 Coerenza con la logica di salvataggio log

- **Allineamento con le variabili usate nel salvataggio**:
  - La funzione `formToPayload()` usa già `state.currentOperator.id` come `IDOperator`:

```722:737:c:\Users\depel\Documents\progetto\ujet\bobine\bobine.js
function formToPayload() {
  const opId = state.currentOperator && state.currentOperator.id != null ? Number(state.currentOperator.id) : null;
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
```

- Idratando `state.currentOperator` con `user` proveniente da `window.SecurityData.user`, `opId` verrà valorizzato correttamente (presupponendo che il token includa `id` o un campo equivalente già gestito a backend).
- `applyPermissions()` e le UI (es. log list blu per admin, pulsanti admin-only) si basano su `state.currentOperator.isAdmin`, che viene preservato nel merge dello stato e usato sia per i permessi sia per i colori del display operatore.

### 4. Verifica funzionale

- **Scenario 1 – Utente senza modulo Bobine**:
  - Autenticarsi con un utente privo di `authorizedApps` con `target === 'Operators'` e forzare l’URL `.../bobine.html`.
  - Atteso: alert "Non sei autorizzato ad accedere al modulo Bobine.", redirect a `/`, nessun `securityReady` per Bobine.
- **Scenario 2 – Utente non superuser che forza Captain Console**:
  - Autenticarsi come utente non superuser e digitare direttamente `.../captain.html` o simili.
  - Atteso: alert "Accesso negato alla Captain Console.", redirect a `/`.
- **Scenario 3 – Utente con permesso Bobine**:
  - Autenticarsi come utente con `authorizedApps` che include `target: 'Operators'`.
  - Atteso su `bobine.html`: `securityReady` scatta, `state.currentOperator` popolato, display operatore aggiornato, tasto Salva utilizzabile; se `isAdmin` true, colori Admin applicati e azioni Admin visibili.
- **Scenario 4 – Cambio operatore da dentro Bobine**:
  - Usare il flusso esistente di login interno (modale) per cambiare operatore.
  - Atteso: la nuova login continua a funzionare come prima, sovrascrivendo `state.currentOperator`, aggiornando UI e permessi senza interferenze con `window.SecurityData`.

