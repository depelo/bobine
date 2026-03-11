---
name: captain-console-permessi-switcher
overview: Ristrutturare il modale Gestisci Utente per spostare la gestione dei permessi nel Tab 3 con una vera logica di ruoli dipartimentali, e aggiungere un App Switcher laterale basato sui permessi presenti nel JWT del Captain.
todos:
  - id: frontend-tabs
    content: Aggiornare markup e JS di captain.html per nuovi Tab 1/Tab 3 e App Switcher
    status: completed
  - id: backend-roles-route
    content: Implementare nuova rotta PUT /api/admin/users/:id/roles in serverbobine.js
    status: completed
  - id: backend-cleanup-users-put
    content: Pulire rotta PUT /api/admin/users/:id rimuovendo logica Bobine hardcoded e campi permessi
    status: completed
  - id: manual-test-flow
    content: Testare flussi di modifica utente e App Switcher nella Captain Console
    status: completed
isProject: false
---

## Obiettivo generale

- **Modale Gestisci Utente**: spostare tutta la gestione dei permessi/visti nel Tab 3, riusando la logica di `RoleDefinition` già usata nel form "Nuovo Utente", e separare nettamente i dati di sicurezza (Tab 1) da permessi e default app (Tab 3).
- **Backend**: introdurre una nuova rotta dedicata all'upsert dei ruoli dipartimentali e del `DefaultModuleID`, rimuovendo la vecchia logica hardcoded per Bobine dalla rotta PUT esistente.
- **App Switcher**: far comparire nella sidebar l'elenco delle app operative accessibili al Captain, leggendo `authorizedApps` dal JWT (`/api/login` + `/api/me`).

## Modifiche a `captain.html`

- **Pulizia Tab 1 (Sicurezza)**
  - **Rinomina tab 3**: nel blocco dei bottoni tab (intorno a L130–L134 di `[captain.html](c:\Users\depel\Documents\progetto\ujet\bobine\captain.html)`), sostituire il testo del bottone con `data-tab="ump-acc"` da **"🛂 3. Accessi (Visti)"** a **"🛂 3. Permessi (Visti)"**, lasciando invariati attributi e stile.
  - **Rimuovi gestione app da Tab 1**: nel contenuto `id="ump-sec"` (circa L138–L189), eliminare completamente il `div` dalla L178 alla L186 che contiene:
    - l'etichetta **"App Autorizzate"** con il container `id="umpAuthorizedApps"`.
    - l'etichetta **"App di Destinazione Principale"** e la `select id="umpDefaultModule"`.
  - **Lascia invariata** la sezione `pwdManagementSection` e il bottone `umpSaveSecBtn` (useremo poi solo i campi di sicurezza nel payload JS).
- **Ricostruzione Tab 3 (Permessi)**
  - Nel blocco `div id="ump-acc"` (L196–L199), sostituire completamente il contenuto con il nuovo markup fornito:
    - Titolo **"Permessi Dipartimentali (Visti)"**.
    - Container `id="umpEditRolesContainer"` per i ruoli, organizzato a colonne come nel form Nuovo Utente.
    - `select id="umpEditDefaultModule"` con opzione placeholder `-- Seleziona prima i Visti --`.
    - Bottone `id="umpSaveAccBtn"` per il salvataggio dei permessi.
- **Sidebar: App Switcher**
  - All’interno di `<aside class="sidebar">` (L20–L30), subito dopo la chiusura di `</nav>` e prima del `div id="backToAppBtn"`, inserire il blocco:
    - `div id="captainAppSwitcher"` con header "Le tue App".
    - `div id="captainAppLinks"` vuoto, che verrà popolato da JS con link/bottoni stile `nav-item`.
- **Logica JS: initCaptainConsole() (App Switcher)**
  - In `initCaptainConsole` (L293–L309 in `captain.html`):
    - Mantenere l’attuale flusso (fetch `/api/me`, controllo `isSuperuser`, `await loadData();`).
    - Subito dopo `await loadData();`, aggiungere la logica fornita per popolare l’App Switcher:
      - Recuperare `const appLinksContainer = document.getElementById('captainAppLinks');`.
      - Iterare `me.authorizedApps` (proprietà già presente nel JWT via `/api/login` e resa da `/api/me`).
      - Per ciascun `app`, mappare `app.target === 'Operators'` su `bobine.html` (lasciando un commento in JS per future app) e, se `url` non vuoto, creare un `div.nav-item` con icona 🚀 + `app.name`, e `onclick` che fa `window.location.href = url`.
- **Logica JS: openUserManager(id)**
  - Nella funzione `openUserManager` (L500–L571 circa in `captain.html`):
    - Lasciare invariata la parte iniziale che:
      - Refresh `globalUsers` via `/api/admin/users`.
      - Popola etichette, hidden `umpUserId`, campi `umpInputName`, `umpInputBarcode`, sezione password (`pwdManagementSection`) e reset dei tab.
    - **Rimuovere** il blocco esistente che gestisce `appsContainer` e `defaultSelect` (L557–L570) legato a `umpAuthorizedApps` e `umpDefaultModule`.
    - **Al suo posto**, inserire il nuovo blocco per la generazione dinamica del Tab 3:
      - Selezionare `rolesContainer = document.getElementById('umpEditRolesContainer')` e `defModSelect = document.getElementById('umpEditDefaultModule')`.
      - Svuotare entrambi e inizializzare `defModSelect` con `-- Seleziona --`.
      - Popolare `defModSelect` iterando `globalModules` (`opt.value = mod.id`, `opt.textContent = mod.name`), impostando `defModSelect.value` su `u.defaultModuleId` se presente.
      - Per ogni `mod` con `mod.roleDefinition`:
        - Creare un gruppo `div` con titolo `mod.name`.
        - Iterare `Object.entries(mod.roleDefinition)` per creare checkbox:
          - `cb.className = 'edit-role-checkbox'`, `cb.dataset.targetTable = mod.targetTable`, `cb.dataset.roleKey = roleKey`.
          - Pre-selezionare (`checked = true`) se `u.apps` contiene una entry con `moduleId === mod.id` e `roleKey` uguale.
          - Aggiungere listener `change` che, se il checkbox viene selezionato, deseleziona gli altri `.edit-role-checkbox` nel medesimo `modGroup` per garantire mutua esclusione all’interno del modulo.
        - Appendere il gruppo al `rolesContainer`.
- **Listener Salvataggio Tab 1 (Sicurezza)**
  - Nel listener associato a `document.getElementById('umpSaveSecBtn').addEventListener('click', async () => { ... })` (L863–L917):
    - **Rimuovere** tutta la parte che legge `umpAuthorizedApps` e `umpDefaultModule`:
      - Eliminare le variabili `appsContainer`, `defaultSelect`, `authorizedModuleIds`, `defaultModuleId` e la relativa logica (L872–L885).
    - Modificare il `body` del `fetch` `PUT /api/admin/users/:id` in modo che invii solo i campi di sicurezza:
      - `name`, `barcode`, `password: password || undefined`, `forcePwdChange`, `pwdExpiryDaysOverride`.
    - Lasciare intatto il resto (gestione errori 401/403, `loadData()`, chiusura panel, toast di successo/errore).
- **Nuovo Listener Salvataggio Tab 3 (Permessi)**
  - Subito sotto il listener di `umpSaveSecBtn`, aggiungere un nuovo blocco JS:
    - Listener click su `umpSaveAccBtn` che:
      - Legge `id` da `umpUserId`.
      - Legge `defaultModuleId` da `umpEditDefaultModule`.
      - Costruisce `selectedRoles` facendo `querySelectorAll('.edit-role-checkbox:checked')` e mappando `{ targetTable: cb.dataset.targetTable, roleKey: cb.dataset.roleKey }`.
      - Esegue un `fetch` `PUT` verso `${API_URL}/admin/users/${id}/roles` con header JSON e body:
        - `defaultModuleId: defaultModuleId ? parseInt(defaultModuleId, 10) : null`.
        - `roles: selectedRoles`.
      - In caso di `!res.ok` lancia errore con `await res.text()`.
      - In successo: `await loadData();`, mostra `showCaptainSuccess('Permessi e Visti aggiornati con successo.')` e chiude il panel `userManagePanel` (rimuovendo `is-open` e impostando `aria-hidden` a `true`).
      - In errore: `showCaptainError('Errore salvataggio permessi: ' + err.message);`.

## Modifiche a `serverbobine.js`

- **Nuova rotta PUT per Permessi e Ruoli**
  - Subito sotto la rotta esistente `app.put('/api/admin/users/:id', ...)` (L303–L368 in `[serverbobine.js](c:\Users\depel\Documents\progetto\ujet\bobine\serverbobine.js)`), aggiungere la nuova rotta:
    - `app.put('/api/admin/users/:id/roles', authenticateCaptain, async (req, res) => { ... })` che:
      - Converte `req.params.id` in `idUser` (Int).
      - Legge `defaultModuleId` e `roles` dal body.
      - Apre una connessione (`let pool = await sql.connect(dbConfig);`).
      - Esegue un `UPDATE` su `[CMP].[dbo].[Users]` impostando `DefaultModuleID = @defaultModuleId` per l’utente (gestendo `null` correttamente tramite `.input('defaultModuleId', sql.Int, defaultModuleId)`).
      - Definisce una whitelist `validTables = ['Operators', 'Operators_Man'];` per evitare SQL injection.
      - Per ogni tabella in `validTables`:
        - Cerca `assignedRole` in `roles` con `r.targetTable === table`.
        - Se esiste:
          - Calcola `isAdmin = assignedRole.roleKey === 'Admin' ? 1 : 0`.
          - Esegue un blocco T-SQL `IF EXISTS` per fare upsert in `[CMP].[Bobine].[${table}]`:
            - Se esiste riga con `IDUser = @id`, fa `UPDATE` impostando `IsActive = 1` e `Admin = @admin`.
            - Altrimenti calcola `@newId = MAX(IDOperator)+1` e fa `INSERT` con `Admin = @admin` e `IsActive = 1`.
        - Se **non** esiste `assignedRole` per la tabella corrente:
          - Esegue soft-revoke: `UPDATE [CMP].[Bobine].[${table}] SET IsActive = 0 WHERE IDUser = @id` solo se esiste una riga.
      - Restituisce `200` JSON `{ message: 'Permessi aggiornati con successo.' }`.
      - In `catch`, logga "Errore PUT /api/admin/users/:id/roles:" e risponde `500` con `err.message`.
- **Pulizia vecchia rotta PUT /api/admin/users/:id**
  - Nella rotta esistente `app.put('/api/admin/users/:id', ...)`:
    - Aggiornare la destructuring iniziale per rimuovere `defaultModuleId` e `authorizedModuleIds` dal body, lasciando solo `name, barcode, password, forcePwdChange, pwdExpiryDaysOverride`.
    - Adeguare il `request.input('defaultModuleId', ...)` e la query SQL:
      - Rimuovere `defaultModuleId` tra gli input e cancellare `DefaultModuleID = @defaultModuleId` dalla `UPDATE`.
      - La rotta diventa dedicata solo a identità e parametri di sicurezza (nome, barcode, ForcePwdChange, PwdExpiryDaysOverride e, opzionalmente, PasswordHash/LastPasswordChange).
    - **Rimuovere completamente** il blocco Bobine hardcoded (L336–L361):
      - Eliminare la logica che rilegge `authorizedModuleIds` da `req.body`.
      - Eliminare il calcolo `hasBobineAccess = authorizedModuleIds.includes(1)`.
      - Eliminare il blocco T-SQL che fa upsert/soft-revoke su `[CMP].[Bobine].[Operators]` basato soltanto sul modulo 1.
    - Mantenere invariato il resto (hash password opzionale, gestione errori, messaggio di risposta).

## Sincronizzazione Frontend/Backend

- **Coerenza dei payload**
  - Il **Tab 1** (`umpSaveSecBtn`) invierà solo i dati di sicurezza alla rotta `PUT /api/admin/users/:id`.
  - Il **Tab 3** (`umpSaveAccBtn`) invierà sempre gli aggiornamenti di permessi/ruoli e `defaultModuleId` alla nuova rotta `PUT /api/admin/users/:id/roles`.
  - `openUserManager` caricherà lo stato corrente dei ruoli e del `defaultModuleId` a partire da:
    - `u.apps` (popolati da `/api/admin/users` sulla base delle tabelle dipartimentali whitelisted).
    - `u.defaultModuleId` già letto nel mapping utenti.
- **App Switcher e JWT**
  - Il login (`/api/login`) già costruisce `authorizedApps` nel payload JWT aggregando i visti dai moduli validi (`Modules` + tabelle dipartimentali).
  - `/api/me` ritorna `req.user`, quindi `initCaptainConsole` potrà usare `me.authorizedApps` per costruire in modo affidabile l’App Switcher.

## Todos

- **frontend-tabs**: Aggiornare markup e JS di `captain.html` (Tab 1, Tab 3, App Switcher, `initCaptainConsole`, `openUserManager`, listener `umpSaveSecBtn` e nuovo listener `umpSaveAccBtn`).
- **backend-roles-route**: Implementare nuova rotta `PUT /api/admin/users/:id/roles` in `serverbobine.js` con logica di upsert ruoli e aggiornamento `DefaultModuleID` sulle tabelle whitelisted.
- **backend-cleanup-users-put**: Pulire la rotta `PUT /api/admin/users/:id` rimuovendo gestione moduli/autorizzazioni e Bobine hardcoded, lasciandola focalizzata solo su identità e parametri di sicurezza.
- **manual-test-flow**: Testare manualmente flusso completo: apertura `Gestisci` utente, modifica password/scadenza (Tab 1), modifica permessi e default app (Tab 3), e uso App Switcher dalla sidebar sotto un Captain con `authorizedApps` popolati.

