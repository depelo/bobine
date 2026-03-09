---
name: zero-trust-password-cage
overview: Implementare una gabbia Zero-Trust per cambio password obbligatorio in Bobine, con calcolo scadenza lato backend, blocco middleware su JWT e flusso modale forzato lato frontend senza richiedere un nuovo login.
todos:
  - id: backend-login-expiry-logic
    content: Estendere POST /api/login per calcolare scadenza password e impostare forcePwdChange nel payload JWT usando SystemConfig.AdminPwdExpiryDays e PwdExpiryDaysOverride.
    status: completed
  - id: backend-zero-trust-middleware
    content: Aggiornare authenticateToken per bloccare tutte le API (403 requiresPasswordChange) quando req.user.forcePwdChange è true tranne PUT /api/users/me/password e POST /api/logout.
    status: completed
  - id: backend-renew-jwt-on-password-change
    content: Modificare PUT /api/users/me/password per generare un nuovo JWT con forcePwdChange=false, aggiornare il cookie e restituire il nuovo payload utente.
    status: completed
  - id: frontend-profile-modal-forced-mode
    content: Aggiornare openProfileModal e UI associata per supportare la modalità di sequestro (isForced=true) disabilitando la chiusura e mostrando un messaggio di cambio password obbligatorio.
    status: completed
  - id: frontend-login-and-fetchdata-integration
    content: Modificare performLogin e fetchData per usare user.forcePwdChange, aprire il profilo forzato dopo login o 403 requiresPasswordChange e non tornare al login in questi casi.
    status: completed
  - id: frontend-password-change-resume-flow
    content: Aggiornare il listener profileSavePwdBtn per usare la nuova risposta backend, aggiornare state.currentOperator, chiudere il profilo e rilanciare loadInitialData tornando alla schermata log-edit senza nuovo login.
    status: completed
isProject: false
---

### Implementazione gabbia Zero-Trust cambio password

#### 1. Backend: estendere il login con logica di scadenza (STEP 1)

- **Analisi rotta login attuale**: in `[serverbobine.js](c:/Users/depel/Documents/progetto/ujet/bobine/serverbobine.js)` la rotta `POST /api/login` (L505–L579) recupera dati utente da `Users` + `Operators` + `Captains`, ma non considera `ForcePwdChange`, `LastPasswordChange` o `PwdExpiryDaysOverride` e non legge la config globale.
- **Estendere la SELECT principale**: aggiungere alle colonne selezionate:
  - `U.ForcePwdChange`, `U.LastPasswordChange`, `U.PwdExpiryDaysOverride`.
- **Leggere la configurazione globale di scadenza**:
  - Dopo il `SELECT` utente, nello stesso handler, usare lo stesso `pool` per eseguire:
    - `SELECT ConfigValue FROM [CMP].[dbo].[SystemConfig] WHERE ConfigKey = 'AdminPwdExpiryDays'`.
  - Interpretare `ConfigValue` come intero (giorni), usando un default (es. 90) se: nessuna riga, `ConfigValue` nullo o parsing fallito.
- **Calcolo scadenza in Node.js**:
  - Calcolare i giorni effettivi di scadenza:
    - `expiryDays = row.PwdExpiryDaysOverride != null ? row.PwdExpiryDaysOverride : globalExpiryDays`.
  - Determinare se la password è scaduta:
    - Se `row.LastPasswordChange` è valorizzato: `const expired = now > lastChange + expiryDays`.
    - Se `LastPasswordChange` è nullo, decidere un comportamento conservativo (es. considerare non scaduta per retrocompatibilità) oppure trattarla come scaduta; nel piano operativo possiamo optare per "non scaduta" per non bloccare vecchi utenti.
  - Calcolare `needsPasswordChange` come:
    - `const needsPasswordChange = (row.ForcePwdChange === 1) || expired;`.
- **Arricchire il payload JWT**:
  - Estendere `payload` (L539–L546) aggiungendo `forcePwdChange: needsPasswordChange`.
  - Usare lo stesso `payload` arricchito sia per il ramo non-admin (senza password) sia per il ramo admin/superuser (dopo verifica password), così `req.user` conterrà sempre il flag.

#### 2. Backend: middleware Zero-Trust sul JWT (STEP 2)

- **Punto di integrazione**: la funzione `authenticateToken(req, res, next)` (L33–L45 in `serverbobine.js`) oggi:
  - Recupera il cookie `jwt_token`.
  - Verifica il token.
  - Popola `req.user` e chiama `next()` senza ulteriori controlli.
- **Aggiunta blocco gabbia**:
  - Subito dopo `req.user = user;` (L42), introdurre la logica:

```javascript
    // Se il token richiede un cambio password e la rotta NON è quella per cambiare la password o fare logout
    if (req.user.forcePwdChange) {
        const isAllowedPath = req.path === '/api/users/me/password' || req.path === '/api/logout';
        if (!isAllowedPath) {
            return res.status(403).json({ requiresPasswordChange: true, message: 'Cambio password obbligatorio' });
        }
    }
    

```

- Lasciare invariata la firma del middleware e i casi di token mancante/errato.
- Verificare che tutte le API business critiche (`/api/logs`, `/api/machines`, `/api/operators`, ecc.) usino già `authenticateToken`; in caso di API non protette che devono essere bloccate in gabbia, estendere l’uso del middleware.

#### 3. Backend: rinnovo trasparente del JWT dopo cambio password (STEP 3)

- **Endpoint esistente**: `PUT /api/users/me/password` (L590–L628 in `serverbobine.js`):
  - Verifica `oldPassword` vs `PasswordHash`.
  - Aggiorna `PasswordHash`, `LastPasswordChange = GETDATE()`, `ForcePwdChange = 0`.
  - Restituisce solo `{ message: 'Password aggiornata con successo' }` e NON aggiorna il JWT.
- **Obiettivo**: dopo cambio password riuscito, rilasciare nuovo JWT senza richiedere un nuovo login.
- **Modifiche pianificate**:
  - Lasciare inalterata la logica di verifica di `oldPassword` e l’UPDATE su `Users` (comportamento di sicurezza esistente).
  - Dopo l’UPDATE, costruire un nuovo payload utente basato su `req.user`:
    - Clonare `req.user` (disaccoppiandolo dall’oggetto originale) e forzare `forcePwdChange: false`.
    - Mantenere id, name, isAdmin, isSuperuser, barcode, startTime come in `POST /api/login`.
  - Firmare un nuovo token con `jwt.sign(newPayload, JWT_SECRET, { expiresIn: '12h' })`.
  - Aggiornare il cookie `jwt_token` con le stesse opzioni di `/api/login` (httpOnly, secure in produzione, sameSite strict, maxAge 12h).
  - Restituire `200 OK` con `res.json({ user: newPayload })` invece del solo messaggio testuale.

#### 4. Frontend: openProfileModal in modalità "sequestro" (STEP 4a)

- **Stato attuale**: in `[app.js](c:/Users/depel/Documents/progetto/ujet/bobine/app.js)`:
  - `openProfileModal()` (L355–L385) non accetta parametri e:
    - Mostra info nome/ruolo/orario.
    - Mostra la sezione cambio password (`profilePwdSection`) solo per admin.
    - Apre il modale senza differenziare casi forzati.
  - `profileCloseBtn` (L303) chiude il modale tramite `closeProfileModal()` (L1676–L1680).
  - Non c’è un listener di chiusura sullo sfondo per `#profileModal`.
- **Modifica dell’API di `openProfileModal`**:
  - Cambiare firma in `function openProfileModal(isForced = false) { ... }`.
  - All’interno:
    - Memorizzare `isForced` in una proprietà (es. `profileModal.dataset.forced = isForced ? 'true' : 'false';`) oppure usarlo immediatamente.
    - Se `isForced` è `true`:
      - Nascondere o disabilitare `#profileCloseBtn` (ad es. `style.display = 'none'` o `disabled = true`).
      - Mostrare un messaggio testuale ben visibile nel modale (può riutilizzare `profilePwdMsg` oppure un elemento dedicato) con il testo tipo: "Password scaduta o reset forzato dall'amministratore. Inserisci una nuova password per continuare.".
    - Se `isForced` è `false`:
      - Ripristinare lo stato di `profileCloseBtn` (ri-mostrare/riabilitare) e nascondere il messaggio di avviso.
- **Gestione click sullo sfondo**:
  - Se in futuro si aggiunge un listener di chiusura al click su `#profileModal` (simile a quello di `loginModal` L1639–L1648), prevedere la condizione:
    - Non chiudere se `state.currentOperator?.forcePwdChange === true` (o se `profileModal.dataset.forced === 'true'`).
  - Nel piano operativo, aggiungere un listener opzionale solo se serve, con l’if di protezione integrato.

#### 5. Frontend: integrazione con performLogin e stato utente (STEP 4b)

- **Stato attuale di `performLogin`** (L393–L453 in `app.js`):
  - Esegue `POST /api/login` con barcode e password opzionale.
  - Se 401 con `requiresPassword`, chiede la password e resta nel login.
  - Su risposta `ok`:
    - Se `data.user.isSuperuser`, redirect a `captain.html`.
    - Altrimenti imposta `state.currentOperator = data.user`, aggiorna la UI, chiude il login, applica permessi.
    - Carica i dati solo se `state.logs` è vuoto (`if (!state.logs || state.logs.length === 0) await loadInitialData();`).
  - Il payload utente attuale non contiene `forcePwdChange`.
- **Modifiche pianificate**:
  - Assumendo che il backend includa `forcePwdChange` nel payload JWT e nella risposta JSON, aggiornare `performLogin` per:
    - Salvare sempre `state.currentOperator = data.user` (ora con `forcePwdChange`).
    - Subito dopo, verificare:

```javascript
      if (data.user.forcePwdChange) {
        openProfileModal(true);
        return; // non caricare i dati finché la password non è cambiata
      }
      

```

```
- Solo se `forcePwdChange` è `false` procedere con `await loadInitialData();` (senza più la condizione su `state.logs`, così il primo login dopo cambio password ricarica sempre lo stato coerente).
```

- Mantenere invariato il redirect a `captain.html` per i superuser; se anche i superuser saranno soggetti a gabbia, il backend dovrà includere `forcePwdChange` anche per loro e il frontend potrà eventualmente applicare la stessa logica prima del redirect (questo può essere chiarito in una fase successiva).

#### 6. Frontend: gestione fetchData con risposta 403 "cambio password obbligatorio" (STEP 2 lato UI)

- **Stato attuale di `fetchData`** (L207–L217 in `app.js`):
  - Per status 401 o 403 chiama `handleAuthError()` (che azzera l’operatore e riapre il login) e poi lancia un errore).
  - Questo comportamento non distingue tra token scaduto e gabbia per cambio password.
- **Modifica per Zero-Trust password cage**:
  - Cambiare il ramo `if (res.status === 401 || res.status === 403)` in qualcosa del tipo:
    - Se `res.status === 403`:
      - Tentare `const data = await res.json().catch(() => null);`.
      - Se `data?.requiresPasswordChange` è `true`:
        - Impostare `state.currentOperator = state.currentOperator || {};` e marcare `state.currentOperator.forcePwdChange = true;` (se non già presente).
        - Chiamare `openProfileModal(true);` senza `alert`.
        - Lanciare comunque un `Error` per interrompere la logica chiamante, ma **non** chiamare `handleAuthError()` (niente ritorno al login).
      - Altrimenti (403 generici): comportarsi come prima, chiamando `handleAuthError()`.
    - Se `res.status === 401`: mantenere il comportamento esistente (`handleAuthError()` → login).
  - In questo modo, quando qualsiasi chiamata API viene bloccata dalla gabbia, l’unico feedback visibile sarà il modale di cambio password, come richiesto.

#### 7. Frontend: flusso di salvataggio password e ripresa operatività (STEP 5)

- **Stato attuale listener `profileSavePwdBtn`** (L1683–L1739 in `app.js`):
  - Verifica che l’utente sia loggato.
  - Se manca `newPassword`, mostra messaggio.
  - Chiama `PUT /api/users/me/password`.
  - In caso di errore, mostra messaggio.
  - In caso di successo:
    - Mostra `alert('Password aggiornata con successo. Sarai disconnesso e dovrai eseguire nuovamente il login.');`.
    - Chiama `/api/logout`.
    - Chiude il profilo e chiama `handleAuthError()` (tornando al login).
- **Modifiche pianificate**:
  - Allinearsi al nuovo comportamento backend (nuovo JWT + payload utente) eliminando il logout forzato:
    - Su risposta `res.ok`:
      - Leggere `const data = await res.json();` e aspettarsi `data.user` con il nuovo payload.
      - Aggiornare `state.currentOperator = data.user;` e chiamare `updateCurrentOperatorUI();`.
      - Azzerare `state.currentOperator.forcePwdChange` client-side se presente (dovrebbe già essere `false` da backend, ma meglio sincronizzare).
      - Pulire i campi del form (`profileOldPwdInput.value = ''`, `profileNewPwdInput.value = ''`) e qualsiasi messaggio.
      - Chiudere il modale profilo (`closeProfileModal();`).
      - Chiamare `await loadInitialData();` per ricaricare operatori, macchine e log alla luce del nuovo token ora accettato dal middleware.
      - Reimpostare la schermata principale con `setScreen('log-edit');`.
      - Evitare `alert` intrusivi; opzionalmente si può usare un messaggio discreto nel modale prima di chiuderlo (o nessun messaggio, essendo un flusso "fluido").
  - In caso di errore (es. vecchia password errata) mantenere la logica esistente di messaggistica su `profilePwdMsg`, senza alterare cookie o stato utente.

#### 8. Verifiche e test funzionali

- **Test backend**:
  - Caso A: utente admin con `ForcePwdChange = 1`, data non scaduta:
    - Login richiede password, ritorna `forcePwdChange = true` nel payload.
    - Qualsiasi chiamata a `/api/logs`, `/api/machines`, ecc. restituisce `403 { requiresPasswordChange: true, ... }`.
    - Chiamata a `PUT /api/users/me/password` è consentita e, dopo il cambio, nuova richiesta alle API torna `200`.
  - Caso B: utente admin con `ForcePwdChange = 0`, `LastPasswordChange` vecchia oltre soglia:
    - Stessa logica del caso A, ma `needsPasswordChange` deriva dalla scadenza.
  - Caso C: utente non admin/superuser:
    - Login continua a non richiedere password.
    - `forcePwdChange` presente ma idealmente sempre `false` (nessuna gabbia per operatori semplici, salvo policy diverse future).
- **Test frontend**:
  - Login di un utente con `forcePwdChange = true`:
    - Dopo `performLogin`, si chiude il login modal e si apre subito il profilo in modalità forzata.
    - Non vengono chiamate API di caricamento dati prima del cambio password.
    - Il bottone di chiusura del profilo è disabilitato/nascosto, non è possibile chiudere cliccando fuori.
  - Cambio password riuscito:
    - Nessun ritorno allo schermo di login.
    - `state.currentOperator.forcePwdChange` diventa `false`.
    - Il profilo si chiude, i dati (`logs`, `operators`, `machines`) vengono ricaricati e la UI torna su `log-edit` pronta all’uso.
  - Cambio password fallito:
    - Il modale resta aperto, si vede un messaggio di errore contestuale, nessun reset di login o redirect.
  - Chiamata API da UI durante la gabbia (es. tentativo di salvataggio log prima di cambiare password):
    - Il backend restituisce 403 con `requiresPasswordChange: true`.
    - `fetchData` intercetta, NON chiama `handleAuthError`, apre/riapre `openProfileModal(true)` e blocca silenziosamente l’operazione.

#### 9. Diagramma sintetico del flusso Zero-Trust

```mermaid
flowchart TD
  login[Login POST /api/login] --> jwt[JWT con forcePwdChange]
  jwt --> frontendLogin[performLogin app.js]
  frontendLogin -->|forcePwdChange true| forcedProfile[openProfileModal(true)]
  frontendLogin -->|forcePwdChange false| loadData[loadInitialData]

  anyApi[Chiamata API protetta] --> authMiddleware[authenticateToken]
  authMiddleware -->|forcePwdChange true & path != /password/logout| cage403[403 requiresPasswordChange]
  cage403 --> frontendFetch[fetchData]
  frontendFetch --> openForcedProfile[openProfileModal(true)]

  changePwd[PUT /api/users/me/password] --> newJwt[Nuovo JWT con forcePwdChange=false]
  newJwt --> frontendPwd[listener profileSavePwdBtn]
  frontendPwd --> updateState[aggiorna state.currentOperator]
  updateState --> reloadData[loadInitialData + setScreen('log-edit')]
```



