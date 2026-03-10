---
name: captain-console-qr-password
overview: Potenziare il modale "Nuovo Utente" della Captain Console con generazione automatica di QR Code, gestione dinamica dell’obbligatorietà della password, flag di reset al primo login e selezione dell’app di destinazione principale, allineando il backend per salvare i nuovi campi.
todos:
  - id: backend-body-and-insert-update
    content: Aggiornare in serverbobine.js la rotta POST /api/admin/users per includere forcePwdChange e defaultModuleId e estendere l’INSERT su [CMP].[dbo].[Users].
    status: completed
  - id: frontend-modal-layout-and-qrcode
    content: Aggiornare in captain.html l’HTML del modale adminUserModal, includere la libreria qrcode.js e aggiungere la logica JS per generare, rigenerare e stampare il QR Code.
    status: completed
  - id: frontend-high-watermark-and-save
    content: Implementare in captain.html la funzione updateNewUserDynamicFields, riscrivere openNewUserModal e il listener di salvataggio adminUserSaveBtn per gestire password obbligatoria, flag di reset e App di Destinazione Principale.
    status: completed
  - id: manual-e2e-testing
    content: Eseguire test manuali dell’interfaccia e del flusso end-to-end per la creazione utente, verificando i valori salvati di ForcePwdChange e DefaultModuleID.
    status: completed
isProject: false
---

## Obiettivo

Implementare nel flusso "Nuovo Utente" della Captain Console un login via QR Code generato lato client, un comportamento dinamico della password basato sui visti (High Watermark), un flag per il reset password al primo login e la scelta dell’App di Destinazione Principale, sincronizzando questi dati con il backend `serverbobine.js`.

## Assunzioni

- La rotta backend di creazione utente esiste già come `app.post('/api/admin/users', authenticateCaptain, async (req, res) => { ... })` in `[c:/Users/depel/Documents/progetto/ujet/serverbobine.js](c:/Users/depel/Documents/progetto/ujet/serverbobine.js)`.
- Il frontend Captain Console è definito in `[c:/Users/depel/Documents/progetto/ujet/captain.html](c:/Users/depel/Documents/progetto/ujet/captain.html)` e utilizza già un modale con id `adminUserModal` per "Nuovo Utente".
- Esistono in database le colonne `ForcePwdChange` (BIT) e `DefaultModuleID` (INT) nella tabella `[CMP].[dbo].[Users]`; in caso contrario servirà una migrazione separata.

## Piano dettagliato

### 1. Backend: allineare la rotta di creazione utente

- **Estensione dei campi del body**
  - Nella rotta `app.post('/api/admin/users', ...)` in `serverbobine.js`, modificare la destrutturazione iniziale del `req.body` sostituendo:
    - `const { name, barcode, password, roles } = req.body;`
    - con `const { name, barcode, password, forcePwdChange, defaultModuleId, roles } = req.body;`.
- **Aggiornare l’INSERT su `[CMP].[dbo].[Users]`**
  - Individuare il blocco che usa `new sql.Request(transaction)` per inserire l’utente.
  - Sostituire il blocco corrente che gestisce solo `Name`, `Barcode`, `PasswordHash`, `IsActive` con la versione estesa che aggiunge:
    - input `forcePwdChange` come `sql.Bit` mappato a `forcePwdChange ? 1 : 0`.
    - input `defaultModuleId` come `sql.Int` mappato a `defaultModuleId ? parseInt(defaultModuleId, 10) : null`.
    - query `INSERT` che popola anche le colonne `ForcePwdChange` e `DefaultModuleID` secondo lo snippet fornito nel prompt.
- **Controlli di robustezza**
  - Lasciare inalterata la gestione transazionale ed eventuali controlli esistenti sulla password opzionale / default (es. hashing, password di default) per non rompere la logica preesistente.

### 2. Frontend: includere la libreria QRCode e aggiornare il layout del modale

- **Includere qrcode.js**
  - In `captain.html`, all’interno del tag `<head>`, subito dopo l’inclusione di `sicurezza.js`, aggiungere:
    - `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>`.
- **Sostituire il contenuto del modale `adminUserModal`**
  - Cercare il blocco `<div class="scanner-modal" id="adminUserModal" aria-hidden="true">`.
  - All’interno, individuare `div.scanner-modal-inner` e, dal suo inizio fino ai bottoni di salvataggio esistenti, sostituire l’HTML con lo snippet completo fornito nel prompt, che include:
    - campo `Nome Completo` (`#adminNewName`).
    - sezione "QR Code Login" con input `#adminNewBarcode` in sola lettura, pulsanti `#adminRegenerateQRBtn` e `#adminPrintQRBtn` e contenitore `#adminNewQRCodeContainer` per il QR.
    - contenitore `#dynamicRolesContainer` per i visti generati dinamicamente.
    - campo password con label dinamica `#adminNewPwdLabel` e input `#adminNewPassword`.
    - checkbox `#adminNewForcePwd` "Forza reset password al primo login" selezionato di default.
    - select `#adminNewDefaultModule` per l’App di Destinazione Principale con placeholder `-- Seleziona prima i Visti --`.
    - pulsanti `#adminUserCancelBtn` e `#adminUserSaveBtn` per annulla/crea utente.

### 3. Frontend: logica JS per QR, High Watermark e salvataggio

- **Aggiungere generazione QR e listener di stampa**
  - Nel `<script>` finale di `captain.html`, poco prima della funzione `openNewUserModal`, dichiarare `let newAdminQRCode = null;` e incollare la funzione `generateNewUserQR()` fornita, che:
    - genera la stringa casuale sicura `UJ-XXXXXXXX`.
    - valorizza `#adminNewBarcode`.
    - pulisce e popola `#adminNewQRCodeContainer` usando `new QRCode(...)` se `QRCode` è disponibile, oppure mostra un messaggio di errore.
  - Subito dopo, aggiungere i listener ai pulsanti:
    - `#adminRegenerateQRBtn` → chiama `generateNewUserQR()`.
    - `#adminPrintQRBtn` → apre una nuova finestra, mostra il QR e il codice, e invoca `window.print()` all’onload.
- **High Watermark e popolamento dinamico della select App**
  - Inserire la funzione `updateNewUserDynamicFields()` come da snippet, che:
    - scansiona tutte le `.role-checkbox:checked`.
    - usa `globalModules` per determinare i moduli selezionati e, per ciascun ruolo, se `requiresPassword` è `true`.
    - imposta la label `#adminNewPwdLabel` su "Password (OBBLIGATORIA)" in rosso se almeno un ruolo richiede password, altrimenti "Password (Opzionale)".
    - popola `#adminNewDefaultModule` solo con i moduli corrispondenti ai visti selezionati, mantenendo il valore attuale se ancora valido oppure selezionando automaticamente la prima app disponibile.
- **Riscrivere `openNewUserModal()`**
  - Sostituire l’implementazione esistente di `openNewUserModal()` con quella fornita, che:
    - resetta i campi (nome, password, checkbox reset, select App e label password).
    - chiama `generateNewUserQR()` per creare subito un QR quando si apre il modale.
    - costruisce dinamicamente, per ogni elemento di `globalModules` con `roleDefinition`, un gruppo di checkbox ruoli all’interno di `#dynamicRolesContainer`.
    - collega l’evento `change` di ciascuna `.role-checkbox` alla funzione `updateNewUserDynamicFields()`.
    - apre il modale impostando le classi e l’attributo `aria-hidden`.
- **Aggiornare il listener di salvataggio `adminUserSaveBtn`**
  - Individuare `document.getElementById('adminUserSaveBtn').addEventListener('click', async () => { ... });` e sostituire l’intero listener con la nuova versione che:
    - legge `name`, `barcode`, `password`, `forcePwdChange`, `defaultModuleId` dai rispettivi elementi.
    - valida che `name` non sia vuoto.
    - determina se la password è obbligatoria leggendo il testo di `#adminNewPwdLabel` e, se obbligatoria ma assente, mostra un errore con `showCaptainError(...)`.
    - raccoglie i ruoli selezionati come array di oggetti `{ targetTable, roleKey }` dalle `.role-checkbox:checked`.
    - se ci sono ruoli selezionati ma nessuna App di Destinazione Principale (`defaultModuleId` vuoto), mostra un errore.
    - effettua `apiFetch('/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, barcode, password, forcePwdChange, defaultModuleId, roles: selectedRoles }) })`.
    - in caso di successo chiude il modale, richiama `loadData()` e mostra `showCaptainSuccess('Utente creato con successo!');`.
    - in caso di errore mostra `showCaptainError('Errore salvataggio: ' + err.message);`.

### 4. Verifiche manuali e di integrazione

- **Test manuale della UI**
  - Aprire la Captain Console e:
    - verificare che aprendo "Nuovo Utente" venga generato automaticamente un QR con codice in input readonly.
    - cliccare "Rigenera" più volte per controllare il refresh di QR e codice.
    - usare "Stampa" per assicurarsi che la stampa del badge funzioni (nuova finestra, QR e codice sotto, auto-print).
- **Test High Watermark e select App**
  - Selezionare diversi visti:
    - verificare che, quando viene selezionato un ruolo con `requiresPassword: true`, la label password diventi "OBBLIGATORIA" in rosso.
    - osservare che la select "App di Destinazione Principale" si popoli solo con le app abilitate dai visti correnti e aggiorni la selezione in modo coerente.
  - Provare a salvare con:
    - password mancante quando obbligatoria → deve dare errore lato frontend.
    - visti selezionati ma nessuna App di Destinazione → deve dare errore lato frontend.
- **Test end-to-end creazione utente**
  - Creare un utente con diversi scenari (con/senza password, con/senza visti) e verificare in database (o tramite API/strumenti admin) che:
    - `ForcePwdChange` rispecchi lo stato del checkbox.
    - `DefaultModuleID` sia valorizzato correttamente o `NULL` quando non applicabile.
    - non siano cambiate le logiche esistenti per utenti creati senza visti o con visti a bassa sicurezza.

