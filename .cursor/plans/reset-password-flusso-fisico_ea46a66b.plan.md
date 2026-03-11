---
name: reset-password-flusso-fisico
overview: Migrare il recupero password da modello legacy a flusso fisico con notifica Captain Console, pulendo i modali profilo inline e aggiornando il routing verso la nuova pagina standalone di profilo.
todos:
  - id: step1-profile-js
    content: Aggiornare il submit di `recoverPwdForm` in profile.js con il nuovo blocco try/catch che mostra solo un messaggio statico e resetta il form su successo.
    status: completed
  - id: step2-backend-endpoint-recover
    content: Introdurre in serverbobine.js l’endpoint POST /api/users/recover che valida il barcode su CMP.dbo.Users e invia l’evento Socket.io pwd_reset_request ai Captain.
    status: completed
  - id: step3-captain-listener
    content: In captain.html aggiungere nel blocco Socket.io il listener captainSocket.on('pwd_reset_request', ...) che apre un alert visivo nel Captain Error Modal.
    status: completed
  - id: step4-rimozione-profile-modal-html
    content: Eliminare i modali inline Il Mio Profilo (profileModal) da bobine.html e index.html, mantenendo gli altri modali funzionanti.
    status: completed
  - id: step5-routing-e-cleanup-bobine-portal
    content: In bobine.js e portal.js rimuovere le funzioni openProfileModal/closeProfileModal e i listener legacy, sostituendo l’azione open-profile con redirect a /profile.html.
    status: completed
isProject: false
---

### Obiettivi

- **Allineare il recupero password** in `profile.html`/`profile.js` al nuovo modello fisico (richiesta → alert Captain → password temporanea comunicata a voce), evitando qualsiasi ritorno di credenziali al client.
- **Aggiungere un endpoint backend dedicato** che valida il badge e notifica i Captain via Socket.io, integrandosi con lo schema `Users` esistente e con la stanza `captains_room`.
- **Integrare la Captain Console** per mostrare un alert visivo quando arriva una richiesta di reset password.
- **Rimuovere codice morto legacy** relativo ai vecchi modali "Il Mio Profilo" integrati in `bobine.html`, `index.html` e `captain.html`.
- **Aggiornare il routing frontend** perché tutti i pulsanti profilo puntino alla nuova pagina standalone `profile.html`.

### STEP 1 – Aggiornare il recupero in `profile.js`

- **Contesto attuale**: in `[profile.js](c:/Users/depel/Documents/progetto/ujet/bobine/profile.js)` il listener del form di recupero è:

```47:71:c:/Users/depel/Documents/progetto/ujet/bobine/profile.js
    document.getElementById('recoverPwdForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const barcode = document.getElementById('recoverBarcode').value;
        const msgEl = document.getElementById('recoverMsg');

        try {
            const res = await fetch(`${API_URL}/users/recover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode })
            });

            const data = await res.json();
            if (res.ok) {
                msgEl.style.color = 'var(--success)';
                msgEl.textContent = data.message || 'Richiesta inviata. Contatta il Captain o controlla la mail.';
            } else {
                msgEl.style.color = 'var(--danger)';
                msgEl.textContent = data.message || 'Errore nella richiesta di recupero.';
            }
        } catch (err) {
            msgEl.textContent = 'Errore di rete.';
        }
    });
```

- **Modifica pianificata**:
  - Sostituire l’intero blocco `try { ... } catch { ... }` con il codice fornito nella specifica, che:
    - Non legge più il body in caso di `res.ok`.
    - Imposta sempre un messaggio fisso: “Richiesta inviata in amministrazione. Recati in ufficio per ricevere la tua password temporanea.”.
    - Reset del form su esito positivo.
  - Mantenere invariate le intestazioni e l’URL (`/api/users/recover`) per compatibilità con il backend che andremo ad aggiungere.

### STEP 2 – Endpoint backend con notifica Socket.io in `serverbobine.js`

- **Contesto attuale**: in `[serverbobine.js](c:/Users/depel/Documents/progetto/ujet/bobine/serverbobine.js)` la configurazione Socket.io è a fondo file:

```1136:1152:c:/Users/depel/Documents/progetto/ujet/bobine/serverbobine.js
const { Server } = require('socket.io');
...
const server = https.createServer(sslOptions, app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
...
io.on('connection', (socket) => {
    let currentUserId = null;
    ...
});
```

- **Implementazione pianificata**:
  - Inserire, **subito prima** del blocco `io.on('connection', ...)`, l’endpoint:
    - `POST /api/users/recover` che:
      - Legge `barcode` da `req.body` e valida presenza.
      - Usa `sql.connect(dbConfig)` e la tabella `[CMP].[dbo].[Users]` (già usata per login/admin) per verificare esistenza utente attivo (`IsActive = 1`).
      - Prende `Name` come `userName`.
      - Emette su `io.to('captains_room')` l’evento `pwd_reset_request` con `{ userName, barcode, time }`, dove `time` è un orario locale formattato `HH:mm` in it-IT.
      - Restituisce `200` con messaggio generico di successo; `404` se badge sconosciuto/disattivato; `500` su errore.
  - Assicurarsi che l’endpoint non richieda autenticazione JWT, coerente col flusso fisico basato su badge (ma senza esporre informazioni sensibili al client).

### STEP 3 – Listener Socket.io nella Captain Console (`captain.html`)

- **Contesto attuale**: in `[captain.html](c:/Users/depel/Documents/progetto/ujet/bobine/captain.html)` la funzione `initCaptainConsole()` crea `captainSocket` e gestisce `register_captain` e `user_status_changed`:

```364:429:c:/Users/depel/Documents/progetto/ujet/bobine/captain.html
    async function initCaptainConsole() {
      ...
        if (typeof io !== 'undefined') {
            if (!captainSocket) captainSocket = io();
            
            // Unisciti alla stanza dei Captain
            captainSocket.emit('register_captain');
            
            // Ascolta i cambiamenti di stato
            captainSocket.on('user_status_changed', (data) => {
                ...
            });
        }
      ...
    }
```

- **Implementazione pianificata**:
  - All’interno del blocco `if (typeof io !== 'undefined') { ... }`, **subito dopo** la chiusura del listener `captainSocket.on('user_status_changed', ...)`, aggiungere il listener:
    - `captainSocket.on('pwd_reset_request', (data) => { ... });` esattamente come da snippet fornito:
      - Chiama `showCaptainError(...)` con un messaggio dettagliato che indica nome operatore, badge e orario.
      - Modifica dinamicamente il titolo e il colore del modale `captainErrorModal` (`.scanner-title` e bottone `#captainErrorBtnClose`) per farlo sembrare un alert di sistema.
  - Non toccare altro comportamento della console.

### STEP 4 – Rimozione modali profilo legacy in HTML

- **Contesto attuale**:
  - In `[bobine.html](c:/Users/depel/Documents/progetto/ujet/bobine/bobine.html)` è presente un modale profilo inline:

```217:255:c:/Users/depel/Documents/progetto/ujet/bobine/bobine.html
    <div class="scanner-modal" id="profileModal" aria-hidden="true">
      ... contenuto profilo operatore ...
    </div>
```

- In `[index.html](c:/Users/depel/Documents/progetto/ujet/bobine/index.html)` esiste un modale profilo quasi identico, dopo il box di login.
- In `[captain.html](c:/Users/depel/Documents/progetto/ujet/bobine/captain.html)` **non** esiste un `profileModal`, quindi qui non sono necessarie rimozioni per il profilo (solo modali Captain specifici).
- **Modifica pianificata**:
  - In `bobine.html`:
    - Eliminare completamente il blocco `<div class="scanner-modal" id="profileModal" ...> ... </div>` dedicato al profilo operatore, lasciando intatti gli altri modali (`scannerModal`, `historyModal`, `bobinaModal`, `successModal`, `editSuccessModal`, `dynamicPromptModal`, `machinePromptModal`).
  - In `index.html`:
    - Eliminare allo stesso modo l’intero blocco `profileModal` (modale profilo) sotto il `loginModal`.
  - In `captain.html` non è necessario alcun intervento di rimozione profilo, in quanto la gestione utente è già demandata ai pannelli interni della console.

### STEP 5 – Routing frontend verso `profile.html` & cleanup funzioni legacy

- **Contesto attuale in `bobine.js`**: il menu laterale apre un modale profilo interno.

```1273:1315:c:/Users/depel/Documents/progetto/ujet/bobine/bobine.js
document.getElementById('menuDrawer').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu-action]');
  if (!btn) return;
  const action = btn.dataset.menuAction;
  ...
  if (action === 'open-profile') {
    closeMenuDrawer();
    openProfileModal();
    return;
  }
  ...
});
...
function openProfileModal(isForced = false) {
  ... // usa state.currentOperator e modale inline #profileModal
}

function closeProfileModal() {
  ...
}

// Listener su profileCloseBtn, profileSavePwdBtn già cablati al modale inline
```

- **Contesto attuale in `portal.js`**: gestione simile del profilo per il gateway (modale inline in index).
- **Modifiche pianificate in `bobine.js`**:
  - Nel listener del `menuDrawer`:
    - Sostituire il ramo `if (action === 'open-profile') { ... }` con:
      - `closeMenuDrawer();`
      - `window.location.href = '/profile.html';`
  - Eliminare completamente:
    - La funzione `openProfileModal()`.
    - La funzione `closeProfileModal()`.
    - Tutti i listener che si riferiscono a `profileCloseBtn`, `profileSavePwdBtn` o ad elementi del vecchio `#profileModal` integrato.
  - Verificare che non restino riferimenti a `profileModal` in `bobine.js` (per evitare errori a runtime).
- **Modifiche pianificate in `portal.js`**:
  - Siccome `profile.html` e `profile.js` sono ora lo standard per la gestione del profilo e del cambio password, la logica del profilo nel gateway viene centralizzata:
    - Rimuovere funzioni `openProfileModal()`/`closeProfileModal()` eventualmente presenti e relativi listener verso `profileModal` (inline in `index.html`).
    - Se esistono entrypoint (bottoni/menu) che richiamano il profilo utente dal gateway, sostituirli con `window.location.href = '/profile.html';` (ad esempio, futuri pulsanti “Il mio profilo” nel login/gateway).
  - Mantenere intatto il flusso di login con Sipario di Sicurezza (`showGatewayPasswordCurtain`) e routing verso `bobine.html`/`captain.html`.

### Coerenza di sicurezza Zero-Trust

- **Nessuna password o hash** verrà mai restituita in chiaro al browser nel nuovo flusso di recupero: il client riceve solo conferma generica e l’operatore deve rivolgersi fisicamente all’ufficio.
- **Segnalazione real-time** è confinata alla stanza `captains_room` via `io.to('captains_room')`, già usata per monitorare sessioni; ciò integra il nuovo evento `pwd_reset_request` negli stessi canali di osservabilità della Captain Console.
- **Forza reset** rimane gestito a livello Captain Console (flag `ForcePwdChange` e Sipario di Sicurezza) e tramite password temporanee impostate manualmente, in coerenza con il paradigma "Passaporto e Visti".

### Todos principali

- **step1-profile-js**: Sostituire il blocco `try...catch` del submit `recoverPwdForm` in `profile.js` con la nuova logica di messaggistica lato client.
- **step2-backend-endpoint-recover**: Aggiungere in `serverbobine.js` l’endpoint `/api/users/recover` subito prima di `io.on('connection', ...)`, con query su `[CMP].[dbo].[Users]` e `io.to('captains_room').emit('pwd_reset_request', ...)`.
- **step3-captain-listener**: Estendere `initCaptainConsole()` in `captain.html` aggiungendo il listener `pwd_reset_request` dopo `user_status_changed`.
- **step4-rimozione-profile-modal-html**: Rimuovere i blocchi `profileModal` da `bobine.html` e `index.html`, lasciando intatti tutti gli altri modali.
- **step5-routing-e-cleanup-bobine-portal**: Aggiornare il ramo `open-profile` in `bobine.js` per redirect a `profile.html`, eliminare funzioni/handler legacy di profilo sia in `bobine.js` che in `portal.js`.

