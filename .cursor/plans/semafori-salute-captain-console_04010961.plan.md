---
name: semafori-salute-captain-console
overview: Implementare il tracciamento LastLogin/LastBarcodeChange nel backend e visualizzarli come semaforini di salute nella Captain Console, spostando il pulsante Forza Pwd Ora e aggiornando il file conoscenze.txt.
todos:
  - id: aggiorna-conoscenze-users
    content: Aggiornare conoscenze.txt documentando le colonne LastLogin e LastBarcodeChange nella tabella Users.
    status: completed
  - id: backend-login-tracking
    content: Modificare serverbobine.js per tracciare LastLogin e LastBarcodeChange e esporli tramite GET /api/admin/users.
    status: completed
  - id: frontend-captain-health-ui
    content: Aggiornare captain.html per integrare i semaforini di salute e riposizionare il pulsante Forza Pwd Ora con la nuova icona.
    status: completed
isProject: false
---

## Obiettivo

Implementare in modo coerente nel backend e nella Captain Console il tracciamento di `LastLogin` e `LastBarcodeChange`, esporli via API, rappresentarli come "semaforini di salute" nel Tab 1 del pannello utente, spostare il pulsante "Forza Pwd Ora" dentro la sezione password con la nuova icona, e aggiornare la documentazione in `conoscenze.txt`.

## Contesto e flusso ad alto livello

```mermaid
flowchart LR
  loginReq[Login QR (/api/login)] --> dbUpdateLastLogin[UPDATE Users.LastLogin]
  dbUpdateLastLogin --> jwtIssue[JWT payload]

  captainCreateUser[Captain POST /api/admin/users] --> dbInsertUser[INSERT Users con LastBarcodeChange=GETDATE()]
  captainEditUser[Captain PUT /api/admin/users/:id] --> checkOldBarcode[SELECT Barcode esistente]
  checkOldBarcode --> decideChange{Barcode cambiato?}
  decideChange -->|No| simpleUpdate[UPDATE Users senza LastBarcodeChange]
  decideChange -->|Sì| updateWithChange[UPDATE Users con LastBarcodeChange=GETDATE()]

  dbUsers[SELECT admin/users con LastLogin, LastBarcodeChange] --> uiSemafori[Captain Tab 1: semaforini salute]
```



## Passi dettagliati per file

- **1. Aggiornare `conoscenze.txt` (documentazione DB)**
  - Nella sezione "Tabella [dbo].[Users] (Il Passaporto)" aggiungere due bullet per le nuove colonne:
    - `LastLogin (DATETIME)`: timestamp dell’ultimo login, aggiornato in `POST /api/login`.
    - `LastBarcodeChange (DATETIME)`: timestamp dell’ultima rigenerazione del Barcode/QR di login, aggiornato in creazione utente e in modifica se il QR cambia.
- **2. Aggiornare `serverbobine.js` (logica backend)**
  - **2.1 Rotta `POST /api/login`**
    - All’interno della rotta `/api/login`, subito prima della riga in cui viene creato il token JWT (`const token = jwt.sign(...);`), inserire il blocco fornito che esegue:
      - Connessione `sql.connect(dbConfig)`.
      - `UPDATE [CMP].[dbo].[Users] SET LastLogin = GETDATE() WHERE IDUser = @idUser` usando `row.IDUser` come parametro.
      - Gestione errori con `console.error('Errore aggiornamento LastLogin:', dbErr);` senza bloccare il login in caso di problemi DB.
  - **2.2 Rotta `POST /api/admin/users` (creazione utente)**
    - Modificare la query `INSERT` su `[CMP].[dbo].[Users]` per includere la colonna `LastBarcodeChange` e valorizzarla con `GETDATE()`:
      - Colonne: `(Name, Barcode, PasswordHash, IsActive, ForcePwdChange, DefaultModuleID, LastBarcodeChange)`.
      - Valori: `(@name, @barcode, @pwd, 1, @forcePwdChange, @defaultModuleId, GETDATE())`.
    - Mantenere invariata la logica di transazione e creazione dei visti dipartimentali.
  - **2.3 Rotta `PUT /api/admin/users/:id` (modifica passaporto)**
    - Sostituire l’attuale costruzione della query `UPDATE` con la logica descritta:
      - Risolvere la variabile `id` partendo dall’attuale `idUser = parseInt(req.params.id, 10)` (adattare i nomi mantenendo il significato).
      - Prima dell’`UPDATE`, fare una `SELECT Barcode FROM [CMP].[dbo].[Users] WHERE IDUser = @id` per capire se il barcode è cambiato rispetto al nuovo valore `barcode` ricevuto nel body.
      - Calcolare `barcodeChanged` confrontando il valore letto con il nuovo `barcode`.
      - Preparare un `request` con tutti gli input (`id`, `name`, `barcode`, `forcePwdChange`, `pwdExpiry`, `defaultModuleId`).
      - Costruire dinamicamente `updateQuery` come da snippet:
        - Aggiornare sempre `Name`, `Barcode`, `ForcePwdChange`, `PwdExpiryDaysOverride`, `DefaultModuleID`.
        - Se una nuova password è presente, hashare la password, aggiungere `PasswordHash` e `LastPasswordChange = GETDATE()`.
        - Se `barcodeChanged` è vero, aggiungere `LastBarcodeChange = GETDATE()`.
      - Eseguire `await request.query(updateQuery);` mantenendo lo stesso comportamento HTTP di successo/errore della rotta attuale.
  - **2.4 Rotta `GET /api/admin/users` (fetch utenti per Captain)**
    - Estendere la `SELECT` sugli utenti per includere anche `LastLogin` e `LastBarcodeChange` da `[CMP].[dbo].[Users]` (alias chiari per compatibilità con il mapping, es. `LastLogin as LastLogin, LastBarcodeChange as LastBarcodeChange`).
    - Nel mapping `usersRes.recordset.map(u => ({ ... }))`, aggiungere le proprietà:
      - `lastLogin: u.LastLogin`
      - `lastBarcodeChange: u.LastBarcodeChange`
    - Verificare che `activeUserSockets.has(u.id)` continui a funzionare come prima.
- **3. Aggiornare `captain.html` (UI Captain Console, Tab 1)**
  - **3.1 Header del modale `#userManagePanel`**
    - Nel blocco header del modale con `id="userManagePanel"`, rimuovere il vecchio pulsante `id="umpForcePwdNowBtn"` accanto al pulsante "Chiudi", lasciando solo il bottone "Chiudi".
    - Non modificare le funzioni JS esistenti che usano `umpForcePwdNowBtn`, perché verrà reintrodotto all’interno della sezione password.
  - **3.2 Sezione Tab 1 – Aggiunta box "Salute Credenziali"**
    - Nel contenuto della tab `div id="ump-sec"` (Impostazioni Passaporto), subito dopo l’`<input type="hidden" id="umpUserId">`, inserire il blocco `div` `id="umpHealthSection"` fornito, con due colonne:
      - Colonna "Ultimo Accesso" con `id="umpLastLoginDisplay"` inizialmente "-".
      - Colonna "Età QR Code Login" con `id="umpQRHealthDisplay"` inizialmente "-".
    - Mantenere gli stili inline suggeriti (flex, padding, colori basati sulle CSS custom properties già esistenti).
  - **3.3 Sezione `pwdManagementSection` e nuovo pulsante**
    - All’interno del `div id="pwdManagementSection"` (il box giallo), prima della chiusura `</div>` del blocco, incollare il markup del nuovo pannello azione password:
      - Wrapper con `margin-top`, `border-top` e `padding-top`.
      - Pulsante `button` con `id="umpForcePwdNowBtn"`, testo "Forza Pwd Ora e Blocca Schermo" e l’icona `<img src="images/cambio.png" ...>` con filtro per renderla bianca.
      - Mantenere gli handler inline `onmouseover`/`onmouseout` per l’effetto di luminosità e gli stili di layout full-width.
    - Questo garantirà che la logica JS già presente (listener su `#umpForcePwdNowBtn`) continui a funzionare ma contestualizzata dentro la gestione credenziali.
  - **3.4 Funzione JS `calculateHealthIndicators`**
    - Nel blocco `<script>` in fondo alla pagina, immediatamente prima della definizione di `function openUserManager(id)`, aggiungere la funzione `calculateHealthIndicators(lastLoginStr, lastBarcodeStr)` esattamente come da snippet:
      - Calcolo di ore/giorni rispetto a `now`.
      - Semaforo login:
        - Nessun login: `"🔴 Mai effettuato"`.
        - Login oltre 30 giorni: `🟡` e testo "X giorni fa".
        - Login entro 30 giorni o nelle ultime ore: `🟢` con testo basato su giorni/ore ("Poco fa" se 0 ore).
      - Semaforo QR Code:
        - Default: `🟢 Sconosciuta` se non disponibile.
        - Con data: `🟢/🟡/🔴` a seconda di `diffDaysQR` (soglie 90, 180 giorni) e testo con eventuale suffisso "(Consigliata rotazione)" o "(Cambio urgente)".
      - La funzione deve restituire un oggetto `{ loginHtml, qrHtml }` che contenga le stringhe pronte (emoji + testo).
  - **3.5 Popolamento semaforini in `openUserManager(id)`**
    - Dentro `openUserManager(id)`, subito dopo `document.getElementById('umpUserId').value = u.id;`, aggiungere:
      - Chiamata `const health = calculateHealthIndicators(u.lastLogin, u.lastBarcodeChange);`.
      - Assegnazione dei testi:
        - `document.getElementById('umpLastLoginDisplay').textContent = health.loginHtml;`
        - `document.getElementById('umpQRHealthDisplay').textContent = health.qrHtml;`
    - Questo sfrutterà i nuovi campi inviati dal backend nella rotta `GET /api/admin/users`.

## Todos principali

- **aggiorna-conoscenze-users**: Estendere `conoscenze.txt` documentando `LastLogin` e `LastBarcodeChange` nella sezione della tabella `Users`.
- **backend-login-tracking**: Aggiornare `serverbobine.js` per salvare `LastLogin` su `/api/login` e `LastBarcodeChange` su creazione/modifica utente, includendo i nuovi campi in `GET /api/admin/users`.
- **frontend-captain-health-ui**: Aggiornare `captain.html` per spostare il bottone "Forza Pwd Ora" nel `pwdManagementSection`, aggiungere la sezione "Salute Credenziali" con i semaforini e la funzione JS `calculateHealthIndicators`, e popolare i valori in `openUserManager(id)`.

