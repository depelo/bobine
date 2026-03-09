---
name: modulo-bobine-refactor-e-profilo
overview: Aggiornare lo schema SQL del modulo Bobine, estendere il payload di login con StartTime e introdurre nel frontend il profilo utente con cambio password per Admin, senza toccare Socket/WebSockets.
todos:
  - id: doc-update-schema-bobine
    content: Aggiornare riferimenti [dbo]→[Bobine] per Operators/Log/Machines in conoscenze.txt
    status: completed
  - id: backend-refactor-schema-bobine
    content: Sostituire [CMP].[dbo] con [CMP].[Bobine] per Operators/Log/Machines in serverbobine.js, preservando gli altri schemi
    status: completed
  - id: backend-login-starttime
    content: Estendere query e payload JWT del login con StartTime e nuovo schema Operators
    status: completed
  - id: backend-password-change-endpoint
    content: Aggiungere rotta PUT /api/users/me/password con verifica oldPassword e update sicuro della nuova password
    status: completed
  - id: frontend-profile-modal-ui
    content: Aggiungere bottone menu e modale Profilo in index.html
    status: completed
  - id: frontend-profile-logic
    content: Implementare in app.js openProfileModal, wiring menu, chiamata PUT cambio password e logout forzato
    status: completed
isProject: false
---

### Obiettivi principali

- **Aggiornare riferimenti di schema** per le tabelle `Operators`, `Log`, `Machines` spostate in `[Bobine]` sia in documentazione sia nel backend.
- **Estendere il login** per includere `StartTime` nel payload JWT e nel frontend.
- **Introdurre UI e logica di "Profilo Utente"** che permetta agli Admin di cambiare la propria password tramite nuovo endpoint protetto.

### STEP 1: Aggiornamento documentazione (`conoscenze.txt`)

- **Individuare riferimenti da cambiare**: usare una ricerca testuale in `[conoscenze.txt](c:\Users\depel\Documents\progetto\ujet\bobine\conoscenze.txt)` per tutte le occorrenze di `[dbo].[Operators]`, `[dbo].[Log]`, `[dbo].[Machines]`.
- **Aggiornare lo schema**: sostituire ciascun riferimento con `[Bobine].[Operators]`, `[Bobine].[Log]`, `[Bobine].[Machines]` lasciando invariati `Users`, `Modules`, `Captains`, `SystemConfig`.
- **Verifica coerenza narrativa**: controllare che la sezione "Tabelle Dipartimentali (I Visti)" e le descrizioni di Log/Machines restino semanticamente corrette dopo il cambio di schema.

### STEP 2: Refactoring delle query SQL nel backend (`serverbobine.js`)

- **Mappare tutte le query interessate** in `[serverbobine.js](c:\Users\depel\Documents\progetto\ujet\bobine\serverbobine.js)` che puntano alle tabelle:
  - `[CMP].[dbo].[Operators]`
  - `[CMP].[dbo].[Log]`
  - `[CMP].[dbo].[Machines]`
- **Applicare sostituzione mirata di schema**:
  - Cambiare `[CMP].[dbo].[Operators]` in `[CMP].[Bobine].[Operators]` in tutti i punti (GET/POST/PUT/DELETE operatori, join in log, amministrazione moduli, uso in `FOR SYSTEM_TIME ALL`, ecc.).
  - Cambiare `[CMP].[dbo].[Log]` in `[CMP].[Bobine].[Log]` in select, insert, update, soft delete, history, patch.
  - Cambiare `[CMP].[dbo].[Machines]` in `[CMP].[Bobine].[Machines]` in endpoint macchine e join nei log.
- **Non toccare altre tabelle**: mantenere riferimenti a `[CMP].[dbo].[Users]`, `[CMP].[dbo].[Modules]`, `[CMP].[dbo].[Captains]`, `[CMP].[dbo].[SystemConfig]`, `[dbo].[sp_DeleteLogOperatore]` invariati.

### STEP 3: Aggiornamento endpoint di login (backend)

- **Modificare la query della rotta `POST /api/login`** in `serverbobine.js`:
  - Estendere la SELECT per includere `O.StartTime`.
  - Aggiornare il `LEFT JOIN` su `Operators` a `[CMP].[Bobine].[Operators]` come da nuova struttura.
  - Lasciare i join su `Users` e `Captains` sullo schema `dbo` esistente.
- **Aggiornare il payload JWT**:
  - Estendere l'oggetto `payload` con `startTime`, formattando `row.StartTime` in `HH:mm` locale con `toISOString().substring(11, 16)` se valorizzato, altrimenti `null`.
  - Mantenere invariate logica di distinzione Admin/Superuser, richiesta password per Admin e cookie JWT.
- **Propagare il nuovo campo al frontend**: garantire che l’oggetto `user` restituito dal login includa `startTime` per essere disponibile in `state.currentOperator`.

### STEP 4: Nuovo endpoint cambio password (backend)

- **Implementare rotta protetta** `PUT /api/users/me/password` in `serverbobine.js` dopo le rotte di autenticazione:
  - Usare `authenticateToken` per ricavare `req.user.id` (che è `IDOperator`).
  - Leggere `oldPassword` e `newPassword` dal body; validare che `newPassword` esista, altrimenti rispondere `400`.
  - Eseguire query su `[CMP].[dbo].[Users]` join `[CMP].[Bobine].[Operators]` per ricavare `IDUser` e `PasswordHash` dell’utente corrente.
  - Validare `oldPassword` con `bcrypt.compare`; in caso di mismatch, restituire `401` con messaggio adeguato.
  - Calcolare nuovo hash `bcrypt.hash(newPassword, 10)` e fare `UPDATE` di `[CMP].[dbo].[Users]` impostando `PasswordHash`, `LastPasswordChange = GETDATE()`, `ForcePwdChange = 0`.
  - Restituire `200` con messaggio di successo o `500` con messaggio d’errore se qualcosa fallisce.
- **Considerazioni di sicurezza**: assicurarsi che la rotta non permetta di cambiare password per altri utenti (usa solo `req.user.id`) e non esponga hash o dettagli superflui.

### STEP 5: Aggiornamento UI frontend (index.html)

- **Menu laterale** (`.menu-drawer-actions` in `[index.html](c:\Users\depel\Documents\progetto\ujet\bobine\index.html)`):
  - Inserire il bottone
    - `<button type="button" class="menu-drawer-btn" data-menu-action="open-profile">👤 Il Mio Profilo</button>`
    immediatamente prima del bottone "⚙️ Captain Console".
- **Aggiunta modale profilo**:
  - In fondo al body, nella sezione delle modali già presenti, aggiungere il markup del `div` con `id="profileModal"` e la struttura fornita (header, sezione info operatore, sezione cambio password `profilePwdSection`, messaggio `profilePwdMsg`, pulsanti `profileSavePwdBtn` e `profileCloseBtn`).
  - Assicurarsi che le classi riutilizzino quelle esistenti (`scanner-modal`, `scanner-modal-inner`, `login-field`, `action-btn`, ecc.) per coerenza visiva.

### STEP 6: Logica frontend per Profilo Utente (app.js)

- **Estendere il listener del menu drawer** in `[app.js](c:\Users\depel\Documents\progetto\ujet\bobine\app.js)`:
  - Nel blocco `document.getElementById('menuDrawer').addEventListener('click', ...)`, aggiungere il ramo:
    - Se `action === 'open-profile'`, chiamare `closeMenuDrawer()`, poi `openProfileModal()` e `return`.
- **Implementare `openProfileModal()`**:
  - Leggere `state.currentOperator`; se non presente, mostrare un alert e forzare `openLoginModal()`.
  - Aggiornare i testi di `profileNameDisplay`, `profileRoleDisplay`, `profileTimeDisplay` usando `state.currentOperator.name`, ruolo derivato da `isSuperuser`/`isAdmin` e `state.currentOperator.startTime` (o `'-'` se assente).
  - Mostrare la sezione `profilePwdSection` solo se `state.currentOperator.isAdmin === true` (o 1), altrimenti nasconderla.
  - Pulire i campi `profileOldPwd`, `profileNewPwd` e messaggio `profilePwdMsg`, quindi rendere visibile il modale impostando classi/`aria-hidden` analogamente alle altre modali.
- **Gestione eventi del modale profilo**:
  - Aggiungere listener su `profileCloseBtn` per chiudere il modale (rimuovere classe `is-open`, ripristinare `aria-hidden="true"`).
  - Aggiungere listener su `profileSavePwdBtn`:
    - Leggere `oldPassword` e `newPassword` dagli input; validare `newPassword` non vuota, aggiornando `profilePwdMsg` in caso di errore.
    - Effettuare chiamata `fetch` a `PUT ${API_URL}/users/me/password` con body JSON `{ oldPassword, newPassword }` e `credentials: 'include'`.
    - Se la risposta è `200 OK`, mostrare un `alert('Password aggiornata con successo. Sarai disconnesso...')`.
      - Chiamare `POST ${API_URL}/logout` per invalidare il cookie JWT.
      - Resettare `state.currentOperator`, UI operatore (`updateCurrentOperatorUI()`), chiudere il modale profilo e richiamare `openLoginModal()` per forzare un nuovo login.
    - In caso di `401` o altra risposta non OK, leggere il JSON o testo restituito e visualizzare il messaggio dentro `profilePwdMsg` (senza alert bloccante), mantenendo aperto il modale.
- **Sincronizzazione stato**:
  - Assicurare che `state.currentOperator` contenga il nuovo campo `startTime` dopo il login iniziale e dopo `fetch('/api/me')`, propagando il valore dal token JWT decodificato lato backend.

### Note di ambito

- **Nessun utilizzo di WebSockets/Socket.io**: tutte le modifiche rimangono su HTTP REST/HTTPS, senza introdurre logica realtime.
- **Compatibilità esistente**: non modificare la logica di business del registro log, macchine, o moduli admin oltre al cambio di schema e all’aggiunta delle funzionalità di login/profilo descritte.
- **Localizzazione**: mantenere testi UI ed errori in italiano, coerenti con lo stile già presente.

