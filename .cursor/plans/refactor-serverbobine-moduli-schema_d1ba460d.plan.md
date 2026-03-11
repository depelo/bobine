---
name: refactor-serverbobine-moduli-schema
overview: Rifattorizzare le quattro rotte chiave di serverbobine.js per usare TargetSchema/TargetTable e il paradigma 1 App = 1 Schema, con soft-revoke via IsActive.
todos:
  - id: refactor-login-moduli-schema
    content: Aggiornare POST /api/login in serverbobine.js per usare Captain.Captains, TargetSchema/TargetTable e soft-revoke basato su IsActive.
    status: completed
  - id: refactor-admin-users-fetch
    content: Rifattorizzare GET /api/admin/users per popolare i permessi dinamicamente usando TargetSchema/TargetTable.
    status: completed
  - id: refactor-admin-users-roles-upsert
    content: Riscrivere PUT /api/admin/users/:id/roles per usare il catalogo Modules e applicare sempre soft-revoke.
    status: completed
  - id: refactor-admin-users-create-roles
    content: Aggiornare POST /api/admin/users per creare ruoli/visti dinamicamente in base a TargetSchema/TargetTable.
    status: completed
isProject: false
---

## Obiettivo

Rifattorizzare le principali rotte di autenticazione e gestione permessi in `[c:/Users/depel/Documents/progetto/ujet/bobine/serverbobine.js]` per aderire pienamente al paradigma **"1 App = 1 Schema"**, utilizzando `TargetSchema`/`TargetTable` definiti in `[dbo].[Modules]` e imponendo ovunque la logica di **soft‑revoke (IsActive = 0)** invece di eliminazioni fisiche.

## Contesto attuale

- La rotta `POST /api/login` costruisce la lista dei moduli autorizzati interrogando solo tabelle hardcodate (`[Bobine].[Operators]`) e la tabella `Captains` in `[dbo]`, con calcolo `isSuperuser` basato su una `LEFT JOIN` in query di login.
- La rotta `GET /api/admin/users` popola le app/ruoli degli utenti leggendo dal solo schema `[Bobine]`, con `validTables` hardcodata.
- La rotta `PUT /api/admin/users/:id/roles` fa upsert dei visti partendo da una whitelist di tabelle (`Operators`, `Operators_Man`), senza usare `TargetSchema`.
- La rotta `POST /api/admin/users` inserisce i visti solo in `[Bobine].[Operators]` in base ai ruoli inviati, sempre senza usare `TargetSchema`.

## Piano dettagliato per rotta

### 1. `POST /api/login` – Calcolo identità e JWT

1. **Calcolo isSuperuser basato su `[Captain].[Captains]`**
  - Dopo aver letto l’utente (`row`), sostituire l’attuale logica di calcolo `isSuperuser` con il blocco formale:
    - `SELECT 1 FROM [CMP].[Captain].[Captains] WHERE IDUser = @idUser AND IsActive = 1`.
    - Se la `recordset.length > 0`, `isSuperuser = true`, altrimenti `false`.
  - Questo sposta l’identità dei Captain dentro lo schema di app `[Captain]` e richiede la colonna `IsActive` per il soft‑revoke dei permessi.
2. **Lettura dinamica dei moduli con `TargetSchema`**
  - Aggiornare la query sui moduli in login da `SELECT IDModule, ModuleName, TargetTable, RoleDefinition` a:
    - `SELECT IDModule, ModuleName, TargetSchema, TargetTable, RoleDefinition, AppSettings FROM [CMP].[dbo].[Modules]`.
  - Nel ciclo `for (let mod of modulesRes.recordset) { ... }`:
    - Saltare i moduli che non hanno `TargetSchema` o `TargetTable` valorizzati.
    - Calcolare `fullTableName = [CMP].[${mod.TargetSchema}].[${mod.TargetTable}]` da interpolare nelle query.
3. **Determinazione dei ruoli per Operators e Captains**
  - Per i moduli con `TargetTable === 'Operators'`:
    - Eseguire `SELECT Admin FROM ${fullTableName} WHERE IDUser = @id AND IsActive = 1`.
    - Se presente, `hasAccess = true` e `localRoleKey = 'Admin' | 'Base'` in base al bit `Admin`.
  - Per i moduli con `TargetTable === 'Captains'`:
    - Usare `isSuperuser` già calcolato: se `true`, `hasAccess = true`, `localRoleKey = 'Master'`.
  - Lasciare inalterata la logica di popolamento `authorizedApps.push(...)` e la lettura di `RoleDefinition` per `requiresPassword`, così da mantenere in piedi l’High Watermark di sicurezza.
4. **Soft-revoke implicito**
  - Poiché tutte le letture dei visti usano `IsActive = 1`, gli utenti la cui riga in `[Captain].[Captains]` o nelle altre tabelle app ha `IsActive = 0` risultano automaticamente senza accesso a quel modulo, senza necessità di delete fisici.

### 2. `GET /api/admin/users` – Fetch utenti per Captain Console

1. **Moduli con `TargetSchema`**
  - Aggiornare la query moduli a:
    - `SELECT IDModule, ModuleName, TargetSchema, TargetTable, RoleDefinition FROM [CMP].[dbo].[Modules]`.
  - Sostituire la vecchia whitelist `validTables = ['Operators', 'Operators_Man']` con un loop sui `modules` appena letti.
2. **Popolamento dinamico dei permessi**
  - Per ogni `mod`:
    - Se `!mod.TargetSchema || !mod.TargetTable`, `continue`.
    - Costruire `fullTableName = [CMP].[${mod.TargetSchema}].[${mod.TargetTable}]`.
    - In base a `TargetTable`:
      - `Operators`: `SELECT IDUser, Admin FROM ${fullTableName} WHERE IsActive = 1`.
      - `Captains`: `SELECT IDUser, 1 AS Admin FROM ${fullTableName} WHERE IsActive = 1` (ruolo fisso "Master").
    - Gestire eventuali errori con `try/catch` loggando l’errore senza interrompere il fetch complessivo.
  - Per ogni riga di `roleRes.recordset`:
    - Trovare `user` in `users` per `IDUser`.
    - Calcolare `rKey`:
      - `Operators`: `'Admin'` o `'Base'` in base al bit `Admin`.
      - `Captains`: `'Master'`.
    - Aggiungere a `user.apps` un oggetto con `moduleId`, `moduleName`, `roleKey`, `roleLabel` (usando `roleDef[rKey]?.label || rKey`).
    - Aggiornare `user.authorizedModuleIds` aggiungendo `mod.IDModule` se non presente.
3. **Soft-Revoke**
  - L’uso sistematico di `IsActive = 1` nelle query di ruolo garantisce che i permessi revocati (IsActive = 0) spariscano dall’interfaccia senza delete fisici.

### 3. `PUT /api/admin/users/:id/roles` – Upsert dinamico dei permessi

1. **Lettura moduli dal catalogo**
  - Rimuovere completamente la vecchia logica basata su `validTables = ['Operators', 'Operators_Man']`.
  - Eseguire:
    - `SELECT TargetSchema, TargetTable FROM [CMP].[dbo].[Modules]`.
  - Per ogni modulo (`TargetSchema`, `TargetTable`) con valori non nulli:
    - Trovare nel payload `roles` l’eventuale ruolo assegnato per quella `TargetTable`.
    - Calcolare `fullTable = [CMP].[${schema}].[${table}]`.
2. **Adattamento dinamico a PK e colonna ruolo**
  - Per ogni `table`:
    - Se `table === 'Captains'`:
      - `idCol = 'IDCaptain'`, `roleCol = 'Role'`, ruolo persistito sempre come stringa `'Master'`.
    - Altrimenti (es. `Operators`):
      - `idCol = 'IDOperator'`, `roleCol = 'Admin'`, ruolo bit `@adminVal` (1 per Admin, 0 per Base).
3. **Upsert / Soft‑Revoke**
  - Se è presente `assignedRole` per quella `TargetTable`:
    - `IF EXISTS (SELECT 1 FROM fullTable WHERE IDUser = @id)`:
      - `UPDATE ... SET IsActive = 1, roleCol = (Master o @adminVal) WHERE IDUser = @id`.
    - `ELSE`:
      - Calcolare `@newId = ISNULL(MAX(idCol), 0) + 1` e `INSERT` con `IsActive = 1`.
  - Se NON è presente `assignedRole`:
    - Eseguire `UPDATE fullTable SET IsActive = 0 WHERE IDUser = @id` per soft-revoke.
  - Questo rende la rotta indipendente dagli schemi/tabelle specifiche, usando esclusivamente i metadati del catalogo moduli.

### 4. `POST /api/admin/users` – Creazione utente + visti dinamici

1. **Logica di creazione utente invariata**
  - Mantenere la `INSERT` in `[dbo].[Users]` (inclusi `LastBarcodeChange`, `ForcePwdChange`, `DefaultModuleID`, ecc.) e la gestione della transazione.
2. **Assegnazione ruoli nelle tabelle di Visto**
  - Sostituire il blocco `if (roles && roles.length > 0) { ... }` hardcodato con:
    - Lettura dei moduli: `SELECT TargetSchema, TargetTable FROM [CMP].[dbo].[Modules]` all’interno della transazione.
    - Per ciascun elemento di `roles` (dal body):
      - Trovare `modDef` il cui `TargetTable` coincide con `role.targetTable`.
      - Se `modDef` non ha `TargetSchema`, saltare.
      - Calcolare `fullTable = [CMP].[${modDef.TargetSchema}].[${modDef.TargetTable}]`.
      - Determinare `idCol` e `roleCol` come nella rotta `PUT /api/admin/users/:id/roles`:
        - `Captains`: `IDCaptain`, `Role = 'Master'`.
        - Altre tabelle: `IDOperator`, `Admin` bit da `role.roleKey`.
      - Effettuare `INSERT` con PK `@newId = ISNULL(MAX(idCol),0)+1`, `IDUser = newUserId`, ruolo e `IsActive = 1`.
  - Così ogni nuova app può estendere i propri visti aggiungendo solo righe in `Modules`, senza cambiare il codice JS.

## Considerazioni di sicurezza e consistenza

- **Soft-Revoke ovunque**: tutte le query di lettura dei ruoli usano `IsActive = 1`, mentre le "revoche" di permesso impostano `IsActive = 0` invece di cancellare righe.
- **Centralizzazione della configurazione**: `TargetSchema` e `TargetTable` diventano l’unica fonte di verità per il routing dei permessi, riducendo il rischio di discrepanze tra codice e DB.
- **Compatibilità retroattiva**: le tabelle esistenti (`[Bobine].[Operators]`) devono già possedere `IsActive`; per nuove app (`[Captain].[Captains]` e future) il requisito viene ora esplicitato in `conoscenze.txt`.

## Todo proposti

- **refactor-login-moduli-schema**: Aggiornare la rotta `POST /api/login` per usare `[Captain].[Captains]`, leggere i moduli con `TargetSchema` e calcolare dinamicamente `authorizedApps` e ruoli, preservando l’High Watermark.
- **refactor-admin-users-fetch**: Riscrivere `GET /api/admin/users` per leggere i ruoli da tutte le tabelle di visto basate su `TargetSchema`/`TargetTable` con filtro `IsActive = 1`.
- **refactor-admin-users-roles-upsert**: Sostituire la logica di `PUT /api/admin/users/:id/roles` con l’upsert dinamico per tutti i moduli usando le definizioni di `Modules`.
- **refactor-admin-users-create-roles**: Aggiornare `POST /api/admin/users` per creare i visti dipartimentali in qualunque schema/tabella definita dal catalogo moduli, usando sempre soft‑revoke via `IsActive` in futuro e nessuna delete fisica.

