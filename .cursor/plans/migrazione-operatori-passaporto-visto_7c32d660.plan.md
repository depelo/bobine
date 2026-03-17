---
name: migrazione-operatori-passaporto-visto
overview: Aggiornare le API degli operatori Bobine per utilizzare utenti globali esistenti (Passaporti) con sola assegnazione di Visti e introdurre il reset password di reparto con spegnimento allarmi Captain Console.
todos:
  - id: update-get-operators
    content: Aggiornare la rotta GET /api/operators in serverbobine.js con i nuovi campi (globalId, resetRequested) e protezione JWT.
    status: pending
  - id: add-available-operators-route
    content: Aggiungere la rotta GET /api/operators/available in serverbobine.js per elencare utenti globali attivi senza Visto Bobine.
    status: pending
  - id: replace-operators-post-with-visa-assign
    content: Sostituire la logica POST /api/operators in serverbobine.js per assegnare/riattivare il Visto usando globalId invece di creare nuovi utenti.
    status: pending
  - id: add-operator-reset-password-route
    content: Implementare PUT /api/operators/:id/reset-password in serverbobine.js per consentire ad Admin/Superuser il reset password di reparto e spegnere ResetRequested.
    status: pending
  - id: wire-captain-socket-reset-resolved
    content: Collegare in captain.html l’evento socket pwd_reset_resolved alla funzione loadData() per aggiornare silenziosamente la Captain Console.
    status: pending
  - id: protect-passport-put-operator
    content: Modificare PUT /api/operators/:id in serverbobine.js per aggiornare solo [BOB].[dbo].[Operators] (Admin, StartTime) senza più toccare [GA].[dbo].[Users], applicando authenticateToken.
    status: pending
  - id: revoke-visa-delete-operator
    content: Modificare DELETE /api/operators/:id in serverbobine.js per revocare solo il Visto locale impostando IsActive = 0 su [BOB].[dbo].[Operators] e non più su [GA].[dbo].[Users], applicando authenticateToken.
    status: pending
isProject: false
---

### Obiettivi principali

- **Allineare le API degli operatori Bobine** al modello Passaporto/Visto, eliminando la creazione di utenti globali dal reparto.
- **Esporre gli utenti globali disponibili** per l’assegnazione come operatori Bobine.
- **Permettere agli Admin di reparto** di resettare la password dei propri operatori, azzerando `ResetRequested` e aggiornando la Captain Console in tempo reale.

### Contesto attuale

- **File backend principale**: `[serverbobine.js](serverbobine.js)`
  - Rotta attuale `GET /api/operators` legge operatori joinando `BOB.Operators` con `GA.Users` ma **non include** `ResetRequested`.
  - Rotta `POST /api/operators` crea sia l’utente globale (`GA.Users`) sia l’operatore (`BOB.Operators`) in transazione, violando il nuovo paradigma.
  - Esiste già un sistema JWT (`authenticateToken`) e ruoli (`isAdmin`, `isSuperuser`) nel payload.
  - Esiste infrastruttura Socket.IO (`io`, `captains_room`) e un endpoint `/api/users/recover` che imposta `ResetRequested = 1` su `GA.Users` ed emette `pwd_reset_request`.
- **Captain Console frontend**: `[captain.html](captain.html)`
  - In `initial_online_users` viene inizializzato `captainSocket` e già gestiti gli eventi `user_status_changed` e `pwd_reset_request`.
  - La funzione `loadData()` chiama `/api/admin/users` e usa `resetRequested` per mostrare il contatore di richieste (campanella `pwdAlertBell`).

### Piano dettagliato di modifiche

#### 1. Aggiornare `GET /api/operators` in `serverbobine.js`

- **Obiettivo**: includere nel payload anche `globalId` e `resetRequested` per ogni operatore, aderendo al modello Passaporto/Visto.
- **Azioni**:
  - Sostituire il body della query SQL della rotta esistente con la query fornita:
    - Selezionare: `O.IDOperator AS id`, `U.IDUser as globalId`, `U.Name AS name`, `U.Barcode AS barcode`, `O.Admin AS isAdmin`, `U.ResetRequested as resetRequested`, `CONVERT(varchar(5), O.StartTime, 108) AS startTime`.
    - Join: `FROM [BOB].[dbo].[Operators] O INNER JOIN [GA].[dbo].[Users] U ON O.IDUser = U.IDUser`.
    - Filtro: `WHERE U.IsActive = 1`.
  - **Mantenere la firma della rotta** e aggiungere il middleware `authenticateToken` in modo coerente con il resto delle API di reparto: `app.get('/api/operators', authenticateToken, async (req, res) => { ... })`.
  - Verificare che il frontend Bobine che consuma `/api/operators` gestisca senza rotture i nuovi campi aggiuntivi (i vecchi nomi restano invariati).

#### 2. Aggiungere `GET /api/operators/available` (utenti globali senza Visto Bobine)

- **Obiettivo**: permettere all’Admin Bobine di vedere i “Passaporti” attivi che non hanno ancora un “Visto” su Bobine.
- **Azioni**:
  - Aggiungere in `serverbobine.js` una nuova rotta, protetta da JWT: `app.get('/api/operators/available', authenticateToken, async (req, res) => { ... })`.
  - Usare la query SQL fornita:
    - `SELECT IDUser as id, Name as name, Barcode as barcode FROM [GA].[dbo].[Users] WHERE IsActive = 1 AND IDUser NOT IN (SELECT IDUser FROM [BOB].[dbo].[Operators] WHERE IsActive = 1) ORDER BY Name ASC`.
  - Gestire errori con `500` come da stile esistente nel file.
  - Definire chiaramente, a livello di commento (non obbligatorio se non desiderato), che questa rotta è usata dal frontend Bobine per popolare una lista di utenti selezionabili come nuovi operatori.

#### 3. Sostituire la creazione diretta di utenti con l’assegnazione del Visto (`POST /api/operators`)

- **Obiettivo**: impedire all’Admin Bobine di creare nuovi utenti globali; deve solo assegnare o riattivare il Visto Bobine a utenti esistenti.
- **Azioni**:
  - Individuare l’attuale implementazione di `app.post('/api/operators', ...)` in `serverbobine.js` che:
    - Calcola `operator`, `admin`, `barcode`, `startTime`, `password` da `req.body`.
    - Crea utente in `[GA].[dbo].[Users]` e poi operatore in `[BOB].[dbo].[Operators]` in transazione.
  - **Rimuovere o commentare l’attuale logica di inserimento utente** e sostituirla completamente con la versione a sola assegnazione Visto proposta:
    - Input: `const { globalId, admin } = req.body;`.
    - Query SQL con `IF EXISTS (SELECT 1 FROM [BOB].[dbo].[Operators] WHERE IDUser = @idUser) ... ELSE ...` che:
      - Se esiste una riga, fa `UPDATE ... SET IsActive = 1, Admin = @admin WHERE IDUser = @idUser`.
      - Altrimenti fa `INSERT INTO [BOB].[dbo].[Operators] (IDUser, Admin, IsActive) VALUES (@idUser, @admin, 1)`.
  - Valutare se **mantenere la possibilità di passare `startTime`** alla creazione del Visto:
    - Se richiesto, estendere la query per includere `StartTime` (input opzionale) nell’`INSERT`/`UPDATE` mantenendo compatibilità col modello: non toccare `GA.Users`.
  - Aggiornare i messaggi di risposta (201 + JSON `{ message: 'Visto assegnato con successo' }`).
  - Applicare `authenticateToken` anche a questa rotta, controllando lato client che solo utenti loggati possano assegnare Visti.

#### 4. Aggiungere la nuova rotta di reset password di reparto

- **Obiettivo**: consentire ad Admin Bobine e Superuser di resettare la password di un operatore del reparto, spegnendo la relativa richiesta di reset e notificando la Captain Console.
- **Azioni** in `serverbobine.js`:
  - Aggiungere la rotta `app.put('/api/operators/:id/reset-password', authenticateToken, async (req, res) => { ... })` come da codice proposto, riutilizzando `bcrypt` già importato.
  - All’inizio della rotta:
    - Validare che il chiamante sia `isAdmin` o `isSuperuser` dal JWT: `if (!req.user.isAdmin && !req.user.isSuperuser) return res.status(403)...`.
    - Validare `newPassword` non vuota nel body, con eventuale flag `forcePwdChange` per forzare cambio al prossimo login.
  - Tradurre `:id` della route come `IDOperator` Bobine:
    - Eseguire query: `SELECT IDUser FROM [BOB].[dbo].[Operators] WHERE IDOperator = @idOp`.
    - Se nessun record, rispondere 404 “Operatore non trovato in questo reparto”.
  - Aggiornare utente globale corrispondente in `[GA].[dbo].[Users]`:
    - Calcolare `hash = await bcrypt.hash(newPassword, 10)`.
    - Eseguire `UPDATE` che setta `PasswordHash = @hash`, `LastPasswordChange = GETDATE()`, `ForcePwdChange = @force`, `ResetRequested = 0`.
  - Dopo l’update, usare Socket.IO per avvisare i Captain:
    - `io.to('captains_room').emit('pwd_reset_resolved');` (con check `if (typeof io !== 'undefined') { ... }` per coerenza col codice esistente).
  - Restituire `200` con messaggio `Password resettata con successo` o `500` in caso di errore.

#### 5. Aggiornare la Captain Console (`captain.html`) per spegnere la campanella

- **Obiettivo**: quando un Admin di reparto resetta una password, la Captain Console deve aggiornare silenziosamente i dati, facendo sparire l’allarme `ResetRequested`.
- **Azioni** in `captain.html`:
  - Nell’area dove viene inizializzato `captainSocket` (subito dopo l’`on('initial_online_users', ...)` e gli altri listener), aggiungere un nuovo listener:
    - `captainSocket.on('pwd_reset_resolved', () => { loadData(); });`
  - Mantenere lo stile esistente: nessun popup aggiuntivo, solo richiamo silente di `loadData()`.
  - Verificare che `loadData()` già richiami `/api/admin/users` e aggiorni la campanella usando `resetRequested` (già implementato):
    - Se il reset è andato a buon fine, e la rotta backend ha posto `ResetRequested = 0`, la campanella si spegnerà automaticamente.

#### 6. Coerenza di sicurezza e ruoli

- **Obiettivo**: garantire che le nuove/aggiornate rotte rispettino il modello di sicurezza esistente.
- **Azioni**:
  - Applicare `authenticateToken` a:
    - `GET /api/operators`.
    - `GET /api/operators/available`.
    - `POST /api/operators` (assegnazione Visto).
    - `PUT /api/operators/:id/reset-password`.
    - `PUT /api/operators/:id` (solo update Visto Bobine).
    - `DELETE /api/operators/:id` (revoca Visto Bobine).
  - Per `reset-password` imporre il controllo su `req.user.isAdmin || req.user.isSuperuser` come da snippet.
  - Mantenere il resto delle rotte (`/api/admin/users`, `/api/users/recover`, ecc.) invariate per non impattare altri moduli.

#### 7. Verifiche funzionali post-modifica (manualmente o via test esistenti)

- **Test Passaporto/Visto operatori**:
  - Con almeno un utente globale attivo senza record in `BOB.Operators`, chiamare `GET /api/operators/available` e verificare che compaia.
  - Eseguire `POST /api/operators` con `globalId` e `admin` per assegnare il Visto; verificare che:
    - Venga creato/riattivato il record in `[BOB].[dbo].[Operators]` senza modificare `[GA].[dbo].[Users]`.
    - `GET /api/operators` includa il nuovo operatore con `globalId`, `resetRequested` corretto.
- **Test reset password di reparto**:
  - Generare una richiesta tramite `/api/users/recover` (o dal flusso operativo standard) in modo che `ResetRequested = 1` e la campanella si accenda.
  - Da un utente JWT con `isAdmin` o `isSuperuser`, chiamare `PUT /api/operators/:id/reset-password` con `newPassword` e `forcePwdChange` desiderato.
  - Verificare che:
    - In `[GA].[dbo].[Users]` `PasswordHash`, `LastPasswordChange`, `ForcePwdChange`, `ResetRequested` siano aggiornati.
    - La Captain Console riceva `pwd_reset_resolved` e, tramite `loadData()`, la campanella e il contatore richieste si azzerino.

### Todo sintetici

- **update-get-operators**: Aggiornare la rotta `GET /api/operators` in `serverbobine.js` con i nuovi campi e protezione JWT.
- **add-available-operators-route**: Aggiungere `GET /api/operators/available` in `serverbobine.js` con la query fornita e protezione JWT.
- **replace-operators-post-with-visa-assign**: Sostituire la logica di `POST /api/operators` per usare `globalId` e assegnare/riattivare il Visto senza creare utenti.
- **add-operator-reset-password-route**: Implementare `PUT /api/operators/:id/reset-password` con controllo ruoli, update su `GA.Users`, `ResetRequested = 0` e socket `pwd_reset_resolved`.
- **wire-captain-socket-reset-resolved**: Aggiungere in `captain.html` il listener `captainSocket.on('pwd_reset_resolved', () => loadData());` per spegnere la campanella.
- **protect-passport-put-operator**: Aggiornare `PUT /api/operators/:id` per toccare solo `BOB.Operators` (Admin, StartTime) lasciando intatto il Passaporto globale in `GA.Users`.
- **revoke-visa-delete-operator**: Aggiornare `DELETE /api/operators/:id` per impostare solo `IsActive = 0` su `BOB.Operators`, senza più disattivare l’utente globale.
