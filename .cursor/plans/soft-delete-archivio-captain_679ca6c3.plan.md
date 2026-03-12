---
name: soft-delete-archivio-captain
overview: Aggiungere gestione Archivio/Cestino utenti con soft delete, ripristino e fuzzy check anti-doppione nella Captain Console, toccando backend Node/SQL e frontend HTML/JS.
todos:
  - id: backend-rotte-archivio-restore-fuzzy
    content: Aggiungere in serverbobine.js, dopo DELETE /api/admin/users/:id, le tre nuove rotte /admin/users/deleted, /admin/users/:id/restore e /admin/users/check-duplicate con la logica SQL fornita.
    status: pending
  - id: frontend-ui-archivio
    content: Aggiornare captain.html per aggiungere voce Archivio nella sidebar e nuova sezione view-archivio con data-card e wrapper deletedUsersWrapper.
    status: pending
  - id: frontend-js-cestino
    content: In captain.html, aggiungere funzioni loadDeletedUsers e restoreUser, richiamare loadDeletedUsers da loadData e collegare la view Archivio.
    status: pending
  - id: frontend-js-fuzzy-check
    content: "Integrare nel listener di #adminUserSaveBtn la logica di fuzzy check anti-doppione prima della chiamata di creazione utente, usando le nuove API."
    status: pending
isProject: false
---

# Soft delete e Archivio Captain Console

## Obiettivi

- **Archivio/Cestino**: esporre via API e UI tutti gli utenti `IsActive = 0` e permetterne il ripristino forzando il cambio password.
- **Fuzzy check anti-doppione**: intercettare, in fase di creazione nuovo utente, omonimi/parziali presenti nel cestino e guidare l’admin al ripristino.

## File coinvolti

- **Backend**: `[serverbobine.js](serverbobine.js)`
- **Frontend Captain Console**: `[captain.html](captain.html)`

## Passi backend (`serverbobine.js`)

- **1. Inserimento nuove rotte Archivio/Ripristino/Fuzzy**
  - Subito dopo la rotta esistente `DELETE /api/admin/users/:id` (soft delete globale, già presente alle linee ~686–695), aggiungere il blocco fornito:
    - `GET /api/admin/users/deleted` per restituire `id`, `name`, `barcode` degli utenti con `IsActive = 0` ordinati per nome.
    - `PUT /api/admin/users/:id/restore` per riportare `IsActive = 1` e impostare `ForcePwdChange = 1` sull’utente, usando `authenticateCaptain` e la stessa connessione SQL (`dbConfig`).
    - `POST /api/admin/users/check-duplicate` che riceve `{ name }`, spezza il nome in parole (ignorando token di 1 carattere), costruisce una query `LIKE` con tutte le parole in `AND` e ritorna al massimo 5 utenti disattivati compatibili.
  - Verificare che usino le stesse dipendenze già importate in testa (`sql`, `dbConfig`, `authenticateCaptain`) senza introdurre nuove librerie.
- **2. Coerenza con modello dati esistente**
  - Assumere che la tabella `[CMP].[dbo].[Users]` abbia già le colonne `IsActive`, `ForcePwdChange`, `Name`, `Barcode` coerenti con le altre query già presenti.
  - Mantenere il soft delete esistente (non toccare la `DELETE /api/admin/users/:id`), usando solo le nuove rotte per lettura/ripristino e fuzzy check.

## Passi frontend UI (`captain.html`)

### 3. Nuova voce "Archivio" nella sidebar

- Nel blocco `<nav class="sidebar-nav">` aggiungere come **ultima** voce il nuovo elemento:
  - `<div class="nav-item" data-target="archivio"><span>⚰️</span><span>Archivio</span></div>` (rispettando lo stile delle altre voci e l’uso di `data-target`).
- Il router JS sidebar esistente (listener su `.nav-item[data-target]`) già mostra/nasconde `#view-<target>`, quindi non richiede modifiche: basterà creare `#view-archivio`.

### 4. Nuova sezione view Archivio

- Nel contenitore principale `<main class="main-content">` individuare l’area delle view principali:
  - `#view-utenti`, `#view-moduli`, `#view-impostazioni`, `#view-audit` (già marcate con classi `console-view` o simili).
- Aggiungere una nuova sezione **accanto alle altre** (ad es. dopo `#view-impostazioni` o `#view-audit`), con struttura:
  - `<section id="view-archivio" class="view-section">` contenente una `data-card` e l’header descrittivo fornito, più un `div` vuoto con `id="deletedUsersWrapper"` dove verrà iniettata la tabella.
- Non cambiare il layout globale; mantenere gli stessi token di design (`data-card`, `var(--text-muted)`, `var(--border)` ecc.).

## Passi frontend logica JS (`captain.html`)

### 5. Funzioni per caricamento e ripristino dal Cestino

- Nel blocco `<script>` principale, subito dopo funzioni generali come `loadData()` o in una zona di utilities correlate alla gestione utenti, aggiungere le due funzioni async fornite:
  - `loadDeletedUsers()`:
    - Chiama `apiFetch('/admin/users/deleted')`.
    - Se la lista è vuota, mostra un messaggio "Il cestino è vuoto" nel `#deletedUsersWrapper`.
    - Altrimenti costruisce una tabella HTML con colonne Nome, Barcode, Azioni, includendo un pulsante "🪄 Ripristina" per ogni riga che invoca `restoreUser(id, name)`.
  - `restoreUser(id, name)`:
    - Usa `askCaptainConfirm(...)` per chiedere conferma sul ripristino e spiegare l’effetto su stato e password.
    - Se confermato, invia `PUT /admin/users/:id/restore` via `apiFetch`, mostra una notifica di successo via `showCaptainSuccess`, quindi ricarica sia il cestino (`loadDeletedUsers`) sia i dati principali (`loadData`) per mantenere sincronizzate statistiche e anagrafica.
- Nella funzione `loadData()` esistente (linee ~707–735):
  - Aggiungere una chiamata `await loadDeletedUsers();` **dopo** il caricamento di `globalUsers`, `globalModules` e della config, oppure in coda alla funzione, così che all’apertura della console il cestino venga popolato automaticamente.

### 6. Wiring della view Archivio alla logica

- La navigazione sidebar già mostra/nasconde viste basate su `data-target` e id `view-<target>`:
  - Garantire che `#view-archivio` sia inizialmente nascosta (stile simile a `display: none;` delle altre view non attive) per evitare flicker.
  - Quando si clicca sulla voce Archivio nella sidebar, verrà mostrato `#view-archivio`; il contenuto sarà già pronto perché `loadDeletedUsers()` è richiamata da `loadData()` e dopo ogni ripristino.

### 7. Fuzzy check anti-doppione nella creazione utente

- Nel listener già esistente su `#adminUserSaveBtn` (linee ~1411–1459):
  - Dopo aver letto `name`, `barcode`, `password`, `forcePwdChange`, `defaultModuleId` ma **prima** della `apiFetch('/admin/users', ...)` che crea l’utente, inserire il blocco fornito di fuzzy check:
    - Chiamata `apiFetch('/admin/users/check-duplicate', { method: 'POST', body: JSON.stringify({ name }) })`.
    - Se l’array `duplicates` non è vuoto, prendere `duplicates[0]` e costruire il messaggio di warning multi-linea (inclusa emoji e spiegazione sullo storico produttivo).
    - Usare `askCaptainConfirm(msg)` per chiedere:
      - Conferma = annullare la creazione, inviare `PUT /admin/users/:id/restore` sul candidato suggerito, mostrare successo, chiudere il modal di creazione (`#adminUserModal`), poi chiamare `loadData()` e `loadDeletedUsers()`, **return** per interrompere il flusso di creazione.
      - Annulla = proseguire normalmente con la creazione del nuovo utente (nessun ulteriore codice richiesto oltre a lasciare correre il flusso.
    - Wrappare la logica in un `try/catch` che in caso di errore faccia solo `console.warn` senza bloccare la creazione: il fuzzy check è un plus non bloccante.

### 8. Verifiche post-implementazione

- **Backend**
  - Testare via strumenti come `curl` o Postman:
    - `GET /api/admin/users/deleted` (con un utente soft-deleted) per verificare che ritorni i campi attesi.
    - `PUT /api/admin/users/:id/restore` per ripristinare un utente eliminato e controllare su DB che `IsActive = 1` e `ForcePwdChange = 1`.
    - `POST /api/admin/users/check-duplicate` con vari input (`"Rossi Mario"`, `"M. Rossi"`, ecc.) per assicurarsi che la ricerca per parole funzioni correttamente solo su utenti `IsActive = 0`.
- **Frontend**
  - Aprire la Captain Console come superuser e verificare:
    - Presenza della voce "Archivio" nella sidebar e corretto highlight quando selezionata.
    - Rendering della nuova view Archivio con messaggio "cestino vuoto" o tabella utenti disattivati.
    - Flusso di ripristino: click su "🪄 Ripristina" → conferma → utente riappare nella lista principale, sparisce dall’Archivio e al login è forzato al cambio password (grazie a `ForcePwdChange = 1`).
    - Flusso fuzzy: creare un utente con nome simile a uno nel cestino → comparsa del messaggio di attenzione → ramo di ripristino (con chiusura modale) e ramo di ignorare la segnalazione (nuovo utente creato comunque).

## Diagramma di flusso (alto livello)

```mermaid
flowchart TD
  createUser[createUser click "Crea Utente"] --> fuzzyCheck["POST /admin/users/check-duplicate"]
  fuzzyCheck --> noDup["duplicates vuoto"]
  fuzzyCheck --> hasDup["duplicates non vuoto"]
  noDup --> createApi["POST /admin/users"]
  hasDup --> confirmRestore[askCaptainConfirm]
  confirmRestore -->|Conferma| restoreApi["PUT /admin/users/:id/restore"]
  confirmRestore -->|Annulla| createApi
  restoreApi --> reloadData[loadData + loadDeletedUsers]
```



