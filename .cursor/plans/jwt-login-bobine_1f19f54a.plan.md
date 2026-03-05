---
name: jwt-login-bobine
overview: Introdurre autenticazione JWT con login via barcode/password e proteggere le API del registro, aggiornando backend Node/Express e frontend vanilla JS senza riscrivere i file interi.
todos:
  - id: backend-auth-imports
    content: Aggiungere import `jsonwebtoken`, `bcrypt` e costante `JWT_SECRET` in serverbobine.js
    status: completed
  - id: backend-auth-middleware
    content: Implementare middleware authenticateToken in serverbobine.js e applicarlo alle rotte log sensibili
    status: completed
  - id: backend-login-endpoint
    content: Implementare endpoint POST /api/login con logica barcode-only per utenti standard e password obbligatoria per Admin/Superuser
    status: completed
  - id: backend-delete-update
    content: Sostituire la route DELETE /api/logs/:id con la versione che usa req.user e sp_DeleteLogOperatore
    status: completed
  - id: frontend-operator-ui
    content: Sostituire la tendina operatore in index.html con campo readonly e pulsante logout/cambia utente; aggiornare CSS se necessario
    status: completed
  - id: frontend-login-modal
    content: Aggiungere modale di login in index.html e stili dedicati in styles.css
    status: completed
  - id: frontend-fetch-jwt
    content: Aggiornare fetchData e tutte le fetch in app.js per includere il JWT e gestire 401/403 con handleAuthError
    status: completed
  - id: frontend-login-logic
    content: Implementare in app.js la logica di login/logout, aggiornamento state.currentOperator e visualizzazione operatore corrente, rimuovendo la vecchia selezione operatore
    status: completed
  - id: manual-test-flow
    content: "Testare manualmente i flussi: login operatore standard, login admin con password, logout, accesso a rotte protette e gestione 401/403"
    status: completed
isProject: false
---

## Obiettivi

- **Backend**: aggiungere autenticazione JWT con `jsonwebtoken` e `bcrypt`, creare `/api/login`, proteggere le rotte log sensibili, aggiornare la `DELETE /api/logs/:id` alla nuova logica con stored procedure.
- **Frontend**: rimuovere la selezione operatore a tendina, introdurre login via barcode/password con modale dedicata, memorizzare il token JWT in `sessionStorage` e iniettarlo in tutte le chiamate `fetch`, gestendo in modo uniforme 401/403.

## File coinvolti

- **Backend**: `[serverbobine.js](serverbobine.js)`
- **Frontend**: `[index.html](index.html)`, `[styles.css](styles.css)`, `[app.js](app.js)`

## Piano dettagliato

### 1. Backend: setup JWT e middleware

- **1.1 Import e costante segreta**
  - In cima a `serverbobine.js`, subito dopo gli altri `require`, **aggiungere**:
    - `const jwt = require('jsonwebtoken');`
    - `const bcrypt = require('bcrypt');`
    - `const JWT_SECRET = 'UJet_Super_Secret_Key_2026';`
- **1.2 Funzione `authenticateToken`**
  - **Aggiungere** in `serverbobine.js` una funzione middleware:
    - Legge l’header `Authorization` (`Bearer <token>`).
    - Se assente → `res.status(401).send('Token mancante')`.
    - Verifica il token con `jwt.verify(token, JWT_SECRET)`.
    - Se valido, assegna a `req.user` un oggetto con almeno: `id`, `name`, `isAdmin`, `isSuperuser`, `barcode` (le stesse chiavi che useremo nel payload JWT).
    - In caso di errore di verifica → `res.status(403).send('Token non valido')`.

### 2. Backend: endpoint `/api/login`

- **2.1 Query utente per barcode**
  - **Aggiungere** in `serverbobine.js` un handler `app.post('/api/login', async (req, res) => { ... })` prima delle rotte log.
  - Estrarre `{ barcode, password }` dal body.
  - Connettersi a SQL Server usando `dbConfig` già esistente.
  - Eseguire una query parametrizzata simile a:
    - `SELECT IDOperator, Operator, Admin, Barcode, PasswordHash, IsSuperuser FROM [CMP].[dbo].[Operators] WHERE Barcode = @Barcode AND IsActive = 1`.
- **2.2 Logica di autenticazione**
  - Se nessun record → `res.status(401).json({ message: 'Credenziali non valide' })`.
  - Se l’utente ha `Admin = 0` **e** `IsSuperuser = 0` (utente standard):
    - **Non richiede password**: accetta login con solo barcode.
    - Crea il payload JWT `{ id, name, isAdmin, isSuperuser, barcode }`.
    - `jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' })`.
    - Restituisce `res.json({ token, user: payload })`.
  - Se l’utente ha `Admin = 1` **o** `IsSuperuser = 1` (Admin/Superuser):
    - Se `!password` nel body:
      - Rispondere con **HTTP 401** e JSON esattamente del tipo:
        - `{ requiresPassword: true, message: 'Password richiesta' }`.
    - Altrimenti, usare `bcrypt.compare(password, row.PasswordHash)`.
      - Se il confronto fallisce → `res.status(401).json({ message: 'Credenziali non valide' })`.
      - Se ok, generare JWT con lo stesso payload `{ id, name, isAdmin, isSuperuser, barcode }` e scadenza 12h.
      - Restituire `res.json({ token, user: payload })`.

### 3. Backend: protezione rotte log e nuova DELETE

- **3.1 Applicare `authenticateToken` alle rotte sensibili**
  - Attualmente `POST /api/logs`, `PUT /api/logs/:id`, `PATCH /api/logs/:id/bobina-finita`, `DELETE /api/logs/:id` sono aperte.
  - Per ognuna di queste, **modificare la definizione** da:
    - `app.post('/api/logs', async (req, res) => { ... })`
  - a:
    - `app.post('/api/logs', authenticateToken, async (req, res) => { ... })` (analogamente per `put`, `patch`, `delete`).
- **3.2 Usare l’operatore da `req.user` nelle scritture**
  - **POST `/api/logs`**:
    - Invece di prendere `IDOperator` dal body come valore di input utente, utilizzare `req.user.id` come operatore di inserimento (se vuoi mantenere `IDMachine` dal form ma l’operatore dal login).
    - Aggiornare il payload/parsing solo se necessario: il piano minimo può lasciare l’ID operatore nel body ma, per coerenza sicurezza, è preferibile sovrascrivere con `req.user.id` nel momento del salvataggio.
  - **PUT `/api/logs/:id`**:
    - Già usa `req.body.modifyingOperatorId`; in ottica JWT, conviene **sostituire** quel valore con `req.user.id` nel `request.input('ModificatoDa', ...)`.
  - **PATCH `/api/logs/:id/bobina-finita`**:
    - Non richiede necessariamente l’ID operatore, ma è coerente proteggerla col token; non servono altre modifiche logiche.
- **3.3 Sostituire completamente la `DELETE /api/logs/:id`**
  - **Rimpiazzare** l’handler esistente con la versione richiesta, aggiungendo il middleware:
    - Firma: `app.delete('/api/logs/:id', authenticateToken, async (req, res) => { ... })`.
    - Corpo esattamente come specificato:
      - Usa `const logId = parseInt(req.params.id, 10);`
      - Usa `const operatorId = req.user.id;`
      - Admin/Superuser → `UPDATE` diretto con `Eliminato = 1`.
      - Utente normale → chiamata `pool.request().execute('[dbo].[sp_DeleteLogOperatore]')` con parametri `@IDLog` e `@IDOperator`.
      - Mappa gli errori SQL con `err.number >= 50000 ? 403 : 500`.

### 4. Frontend: rimuovere selettore operatore e mostrare utente loggato

- **4.1 Sostituire campo Operatore in `index.html`**
  - Nel `form` con `id="logForm"` in `index.html`, individuare il blocco esistente:
    - `label for="operatorSelect"` + `div.control.with-dual-btn` con bottone tastiera, `select#operatorSelect`, bottone scanner.
  - **Sostituire** quel blocco con:
    - Una label per l’operatore corrente (es. `label for="currentOperatorDisplay"` "Operatore loggato").
    - Una `div.control` contenente:
      - Un input readonly (es. `input id="currentOperatorDisplay" readonly`), che mostra nome e ruolo corrente.
      - Un pulsante (o due pulsanti accoppiati) tipo "Cambia utente" / "Logout" (es. `button type="button" id="logoutBtn"` o `data-action="logout"`).
  - Lasciare invariato il selettore macchina e gli altri campi.

### 5. Frontend: modale di Login in `index.html` e stile in `styles.css`

- **5.1 Aggiungere modale login nel body**
  - In fondo al `body` di `index.html`, subito prima degli script, **aggiungere** un nuovo blocco:
    - `div.scanner-modal#loginModal` (riuso stile base dei modali esistenti) con struttura:
      - Titolo (es. "Login operatore").
      - Campo input per barcode (`input id="loginBarcode"` tipo `text` o `password`, eventualmente con pulsante per aprire lo scanner esistente se desiderato in una fase successiva).
      - Campo input password (`input id="loginPassword" type="password"`) inizialmente nascosto via CSS o inline (classe tipo `.is-hidden`).
      - Messaggio di stato/errore discreto (`div id="loginMessage"`).
      - Pulsante `Login` (`button id="loginSubmitBtn"`).
- **5.2 Aggiornare CSS per il nuovo modale**
  - In `styles.css`, **riutilizzare** le classi esistenti `.scanner-modal` e `.scanner-modal-inner` per consistenza.
  - **Aggiungere**, se serve, piccole regole:
    - Margini e layout verticale per i campi del login (es. `.login-field`, `.login-actions`).
    - Una classe utility `.is-hidden { display: none !important; }` per gestire il campo password.

### 6. Frontend: fetch con JWT e intercettazione 401/403

- **6.1 Estendere `fetchData(endpoint)`**
  - In `app.js`, modificare la funzione `fetchData(endpoint)` per:
    - Recuperare `const token = sessionStorage.getItem('jwt_token');`.
    - Includere negli headers `Authorization: token ? 'Bearer ' + token : undefined` (solo se presente).
    - Gestire risposte non OK: se `res.status === 401 || res.status === 403`, chiamare una funzione comune (`handleAuthError()`) che:
      - Pulisce il `sessionStorage` (`removeItem('jwt_token')`).
      - Reimposta `state.currentOperator = null` e aggiorna l’interfaccia (campo `currentOperatorDisplay` vuoto).
      - Mostra il modale di login (`openLoginModal()`).
      - Lancia un errore per interrompere il flusso chiamante.
- **6.2 Aggiornare tutte le `fetch` manuali**
  - Nel file `app.js` ci sono diverse `fetch()` dirette per:
    - Salvataggio log (`save-log` → `POST`/`PUT /logs`).
    - Eliminazione log (`DELETE /logs/:id`).
    - Update stato bobina (`PATCH /logs/:id/bobina-finita`).
    - CRUD di operatori e macchine (`POST /operators`, `POST /machines`, refresh liste se decidiamo di proteggerle in futuro).
  - **Per ognuna**:
    - Leggere il token da `sessionStorage.getItem('jwt_token')`.
    - Aggiungere l’header `Authorization: 'Bearer ' + token` se esiste, insieme a `Content-Type` dove già presente.
    - In caso di risposta con `status === 401 || status === 403`, invocare `handleAuthError()` come in `fetchData`.

### 7. Frontend: gestione login/logout e stato utente

- **7.1 Stato utente e display operatore**
  - Aggiungere in `app.js` riferimenti DOM ai nuovi elementi:
    - `const currentOperatorDisplay = document.getElementById('currentOperatorDisplay');`
    - `const loginModal = document.getElementById('loginModal');`, `loginBarcode`, `loginPassword`, `loginMessage`, `loginSubmitBtn`, `logoutBtn`.
  - Creare una funzione `updateCurrentOperatorUI()` che:
    - Se `state.currentOperator` presente: mostra in `currentOperatorDisplay.value` qualcosa come `"<Nome> (Admin)"` o `"<Nome>"`.
    - Se assente: svuota l’input e forza una UI coerente (es. niente permessi admin).
- **7.2 Apertura modale login all’avvio**
  - All’interno di `initApp()` (dopo l’inizializzazione dei dati), **modificare il flusso**:
    - Prima di chiamare `populateOperatorSelect()` (che verrà poi rimosso), verificare se `sessionStorage.getItem('jwt_token')` è presente.
    - Se **non** c’è token:
      - Non impostare `state.currentOperator`.
      - Chiamare `openLoginModal()` per forzare l’utente a loggarsi.
    - Se c’è un token (opzionale, se in futuro vorrai decodificarlo): potremmo decodificarlo lato client per mostrare nome e ruolo, o in alternativa chiedere al backend un `/api/me` protetto. Per ora il piano minimo è decodificare il payload JWT lato client con `JSON.parse(atob(token.split('.')[1]))` (senza validazione crittografica) per ricostruire `state.currentOperator` alla partenza.
- **7.3 Funzioni `openLoginModal`, `closeLoginModal`, `performLogin`**
  - Implementare in `app.js`:
    - `openLoginModal(initialRequiresPassword = false)`:
      - Mostra il modale (aggiunge classe `is-open`, `aria-hidden="false"`).
      - Pulisce i campi, nasconde il campo password salvo quando `initialRequiresPassword` è `true`.
      - Imposta focus sul campo barcode.
    - `closeLoginModal()`:
      - Nasconde il modale.
    - `async function performLogin({ barcode, password })`:
      - Chiama `fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode, password }) })`.
      - Se `res.status === 401`, legge il JSON.
        - Se `data.requiresPassword === true`, **non** mostra un errore ma:
          - Mostra il campo password nel modale.
          - Aggiorna `loginMessage` con un testo tipo "Inserisci la password per questo utente".
        - Altrimenti mostra `loginMessage` come errore.
      - Se `res.ok`:
        - Legge `{ token, user }`.
        - Salva `sessionStorage.setItem('jwt_token', token);`.
        - Imposta `state.currentOperator = user;`.
        - Chiama `updateCurrentOperatorUI();` e `applyPermissions();`.
        - Chiude il modale.
      - Gestisce eventuali errori di rete aggiornando `loginMessage`.
- **7.4 Event handlers per login e logout**
  - Collegare il pulsante `loginSubmitBtn` a `performLogin` passando i valori degli input.
  - Aggiungere listener `keydown` (invio) sui campi barcode/password per avviare il login.
  - Implementare handler per `logoutBtn` che:
    - Rimuove `jwt_token` da `sessionStorage`.
    - Reimposta `state.currentOperator = null`, chiama `updateCurrentOperatorUI()` e `applyPermissions()`.
    - Mostra nuovamente il modale di login.
- **7.5 Rimozione della logica di selezione operatore**
  - In `app.js`:
    - **Eliminare** o commentare l’uso di `populateOperatorSelect()` e funzioni strettamente legate alla scelta operatore tramite `select` (es. `operatorSelect` change listener, parte di `loginByBarcode` per tipo `operator` che aggiorna direttamente il `select`).
    - Adattare `loginByBarcode` (se decidi di riutilizzarlo per login):
      - Invece di scrivere nel `select`, potrebbe diventare un helper che precompila il campo `loginBarcode` del modale, oppure può venire dismesso se non ti serve più per il login.

### 8. Frontend: gestione uniforme di 401/403

- **8.1 Funzione `handleAuthError()`**
  - Aggiungere in `app.js` una funzione comune:
    - Pulisce `sessionStorage.removeItem('jwt_token')`.
    - Imposta `state.currentOperator = null` e chiama `updateCurrentOperatorUI()` e `applyPermissions()`.
    - Chiama `openLoginModal()`.
- **8.2 Applicare `handleAuthError` ovunque**
  - In tutte le funzioni che fanno `fetch` o `fetchData`:
    - Se la risposta è 401 o 403, chiamare `handleAuthError()` e interrompere l’operazione corrente.
    - Per le azioni utente (es. cancellazione log), se la chiamata fallisce per auth, evitare `alert` di errore rumorosi e lasciare che il login venga richiesto di nuovo.

### 9. Diagramma di flusso (alto livello)

```mermaid
flowchart TD
  start[openApp] --> checkToken[check sessionStorage jwt_token]
  checkToken -->|token assente| showLogin[openLoginModal]
  checkToken -->|token presente| initData[initApp: fetch operators/machines/logs]

  showLogin --> submitLogin[utente invia barcode/password]
  submitLogin --> loginAPI[/POST /api/login/]

  loginAPI -->|user standard| issueToken[JWT 12h + user]
  loginAPI -->|admin senza password| resp401Password[401 {requiresPassword:true}]
  loginAPI -->|admin con password ok| issueToken

  resp401Password --> showPwd[mostra campo password nel modal]
  showPwd --> submitLogin

  issueToken --> saveToken[sessionStorage.setItem jwt_token]
  saveToken --> setUser[state.currentOperator = user]
  setUser --> initData

  anyFetch[API protetta] --> checkRes[controlla status]
  checkRes -->|401/403| handleAuth[handleAuthError: clear token + open modal]
```



Questo piano mantiene le modifiche localizzate a blocchi, sostituendo solo le parti necessarie dei file esistenti (selezione operatore, fetch, rotte backend) e introducendo il login JWT con gestione differenziata per operatori standard e Admin/Superuser.