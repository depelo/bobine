---
name: allinea-websocket-globalid-e-modale-captain
overview: Applicare modifiche mirate a backend, middleware e UI (captain.html) usando solo sostituzioni testuali esatte e inserimenti, per allineare i WebSocket al global ID, correggere ARIA e aggiungere un modale di successo.
todos:
  - id: update-backend-payload-globalid
    content: Aggiornare il payload WebSocket in serverbobine.js per includere globalId nel campo payload.
    status: completed
  - id: update-middleware-userid-priority
    content: Modificare derivazione userId in sicurezza.js per dare priorità a user.globalId rispettando il fallback esistente.
    status: completed
  - id: update-captain-ui-kick-button
    content: Rimuovere il vecchio bottone Kick e inserire il nuovo bottone Kick nell'header in captain.html.
    status: completed
  - id: add-captain-success-modal-markup
    content: Inserire il markup HTML del modale di successo immediatamente prima del tag <script> in captain.html.
    status: completed
  - id: inject-captain-success-functions
    content: Sostituire il blocco listener umpCloseBtn con le nuove funzioni showCaptainSuccess e listener ARIA-safe in captain.html.
    status: completed
  - id: replace-alerts-with-showcaptainsuccess
    content: Sostituire le chiamate alert(...) con showCaptainSuccess(...) nello script di captain.html.
    status: completed
  - id: verify-websocket-and-ui-behavior
    content: Testare rapidamente WebSocket e flusso UI captain per confermare uso di globalId e funzionamento del nuovo modale di successo.
    status: completed
isProject: false
---

## Obiettivo

Allineare i WebSocket all'ID globale dell'utente, aggiornare il middleware di sicurezza, riposizionare il bottone di "Kick" nella UI captain e sostituire gli `alert` con un modale di successo accessibile, usando **solo** operazioni di "Trova e Sostituisci" o inserimenti testuali esatti.

## Contesto file principali

- Backend: `[serverbobine.js](serverbobine.js)`
- Middleware sicurezza: `[sicurezza.js](sicurezza.js)`
- Frontend captain: `[captain.html](captain.html)`

## Piano dettagliato

### 1. Backend: allineare payload WebSocket al global ID (`serverbobine.js`)

- **1.1** Aprire `serverbobine.js` e cercare il blocco esatto:
  - `const payload = {`  
    `id: row.IDOperator,`  
    `name: row.Operator,`  
    `isAdmin,`
- **1.2** Sostituirlo con il blocco esatto:
  - `const payload = {`  
    `id: row.IDOperator,`  
    `globalId: row.IDUser,`  
    `name: row.Operator,`  
    `isAdmin,`
- **1.3** Verificare che **non** vengano modificati altri payload simili; la sostituzione deve avvenire solo dove il blocco combacia al 100%.

### 2. Middleware: usare `globalId` come chiave principale (`sicurezza.js`)

- **2.1** Aprire `sicurezza.js` e cercare il blocco esatto:
  - `if (typeof io !== 'undefined') {`  
    `const socket = io();`  
    `const userId = user.id || user.IDUser || user.IDOperator;`
- **2.2** Sostituirlo con:
  - `if (typeof io !== 'undefined') {`  
    `const socket = io();`  
    `const userId = user.globalId || user.IDUser || user.id || user.IDOperator;`
- **2.3** Controllare che non restino altri punti in cui l'ID utente per i WebSocket viene derivato senza considerare `globalId`.

### 3. Captain UI: bottone Kick e modale di successo (`captain.html`)

#### 3.1 Rimozione vecchio bottone Kick

- **3.1.1** In `captain.html`, cercare ed eliminare **interamente** il blocco esatto:
  - `<button type="button" id="umpKickBtn" style="background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Espelli immediatamente l'utente">`  
  `<span style="font-size: 1.2rem;">🦵</span> Kick Utente`  
  `</button>`
- **3.1.2** Lasciare lo spazio risultante vuoto, senza inserire altro contenuto.

#### 3.2 Inserimento nuovo bottone Kick nell'header

- **3.2.1** Cercare il blocco esatto nell'header modale:
  - `<div>`  
  `<h2 style="margin: 0; font-size: 1.4rem;" id="umpUserName">Nome Utente</h2>`  
  `<span style="font-family: monospace; color: var(--text-muted);" id="umpUserBarcode">Barcode</span>`  
  `</div>`  
  `<button class="scanner-cancel" id="umpCloseBtn" style="width: auto; padding: 8px 16px;">Chiudi</button>`  
  `</div>`
- **3.2.2** Sostituire l'intero blocco con:
  - `<div>`  
  `<h2 style="margin: 0; font-size: 1.4rem;" id="umpUserName">Nome Utente</h2>`  
  `<span style="font-family: monospace; color: var(--text-muted);" id="umpUserBarcode">Barcode</span>`  
  `</div>`  
  `<div style="display: flex; gap: 12px; align-items: center;">`  
  `<button type="button" id="umpKickBtn" style="background: var(--danger); color: white; border: none; padding: 8px 16px; border-radius: var(--radius); font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Espelli forzatamente l'utente">`  
    `<span style="font-size: 1.2rem;">⚡</span> Kick`  
  `</button>`  
  `<button class="scanner-cancel" id="umpCloseBtn" style="width: auto; padding: 8px 16px; margin: 0;">Chiudi</button>`  
  `</div>`  
  `</div>`

#### 3.3 Inserimento markup del modale di successo

- **3.3.1** Scorrere verso il fondo di `captain.html` e trovare il primo tag `<script>` principale della pagina.
- **3.3.2** Individuare la riga che contiene **esattamente**:
  - `<script>`
- **3.3.3** Inserire **immediatamente prima** di quella riga il blocco HTML del modale:
  - `<div class="scanner-modal" id="captainSuccessModal" aria-hidden="true">`  
  `<div class="scanner-modal-inner" style="text-align: center;">`  
    `<h2 class="scanner-title" id="captainSuccessTitle" style="color: var(--success); font-size: 1.6rem; margin-bottom: 24px;">Operazione completata!</h2>`  
    `<button type="button" class="scanner-cancel" id="captainSuccessBtnClose" style="background-color: var(--primary); color: white; border: none;">OK</button>`  
  `</div>`  
  `</div>`

### 4. Captain JS: funzioni modale e sostituzione alert (`captain.html` dentro `<script>`)

#### 4.1 Iniezione funzioni UI + fix ARIA

- **4.1.1** All'interno del tag `<script>` di `captain.html`, cercare il blocco esatto:
  - `document.getElementById('umpCloseBtn').addEventListener('click', () => {`  
  `const panel = document.getElementById('userManagePanel');`
- **4.1.2** Sostituirlo con il nuovo blocco che include la funzione di successo e il fix ARIA:
  - `function showCaptainSuccess(msg) {`  
  `document.getElementById('captainSuccessTitle').textContent = msg;`  
  `const modal = document.getElementById('captainSuccessModal');`  
  `modal.classList.add('is-open');`  
  `modal.setAttribute('aria-hidden', 'false');`  
  `}`  
  `\` document.getElementById('captainSuccessBtnClose').addEventListener('click', () => {`\`   document.activeElement?.blur();`\`   const modal = document.getElementById('captainSuccessModal');`\`   modal.classList.remove('is-open');`\`   modal.setAttribute('aria-hidden', 'true');`\` });`\ `  
  `document.getElementById('umpCloseBtn').addEventListener('click', () => {`  
  `document.activeElement?.blur();`  
  `const panel = document.getElementById('userManagePanel');`
- **4.1.3** Assicurarsi che il blocco rimanente dopo `const panel = ...` rimanga invariato (chiusura del listener e logica esistente).

#### 4.2 Sostituzione massiva degli `alert` con `showCaptainSuccess`

- **4.2.1** Sempre nello `<script>` di `captain.html`, applicare le seguenti sostituzioni testuali **puntuali**:
  - `alert('Utente globale e visti creati con successo.');` → `showCaptainSuccess('Utente creato con successo.');`
  - `alert('Impostazioni di sicurezza aggiornate con successo.');` → `showCaptainSuccess('Impostazioni aggiornate.');`
  - `alert('Configurazione App salvata con successo.');` → `showCaptainSuccess('Configurazione salvata.');`
  - `alert(\Segnale di espulsione inviato alla rete per ${userName}.`);`→`showCaptainSuccess(`Segnale inviato per ${userName}.`);`
  - `alert('Segnale di espulsione inviato con successo.');` → `showCaptainSuccess('Segnale di espulsione inviato.');`
- **4.2.2** Verificare che ogni `alert(...)` corrisponda esattamente alle stringhe indicate prima di sostituirle, per evitare cambi involontari.

### 5. Verifiche finali

- **5.1** Fare un controllo visivo su `captain.html` per confermare:
  - Presenza del nuovo markup del modale di successo.
  - Presenza del nuovo bottone Kick nell'header e assenza del vecchio bottone nel corpo.
- **5.2** Controllare rapidamente che il nuovo `showCaptainSuccess` sia definito **una sola volta** e che tutte le chiamate `showCaptainSuccess(...)` usino messaggi coerenti.
- **5.3** Se possibile, in esecuzione locale:
  - Verificare che la connessione WebSocket usi `globalId` dove atteso (log di backend / client).
  - Eseguire una creazione utente, salvataggio configurazione e invio kick per accertarsi che compaia il nuovo modale di successo, che si chiuda con il pulsante OK e che non compaiano più `alert()` nativi.

