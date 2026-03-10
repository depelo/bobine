---
name: login-high-watermark-bobine
overview: Aggiornare la rotta POST /api/login in serverbobine.js per usare la logica High Watermark sui RoleDefinition dei moduli, sostituendo l’attuale controllo hardcoded su isAdmin/isSuperuser e unificando la gestione della password e del JWT.
todos:
  - id: update-moduli-high-watermark
    content: Sostituire il blocco di calcolo moduli autorizzati in /api/login con il nuovo codice che legge RoleDefinition e calcola globalRequiresPassword.
    status: completed
  - id: update-login-security-jwt
    content: Sostituire la logica di controllo password e creazione JWT in /api/login con quella basata su globalRequiresPassword e High Watermark.
    status: completed
  - id: manual-review-login-flow
    content: Rivedere manualmente i percorsi di login per ruoli base, admin e superuser per confermare che la logica High Watermark si comporti come atteso.
    status: completed
isProject: false
---

## Obiettivo

Aggiornare la rotta `app.post('/api/login', ...)` in `serverbobine.js` per:

- **Calcolare i moduli autorizzati** usando la tabella `Modules` (includendo `RoleDefinition`) e costruire `authorizedApps` con `roleKey`.
- **Determinare il livello di sicurezza High Watermark**: se almeno un ruolo autorizzato ha `requiresPassword: true`, allora attivare i controlli password.
- **Unificare la logica di sicurezza e JWT**: usare `globalRequiresPassword` al posto del controllo hardcoded `isAdmin || isSuperuser` e avere un unico flusso di emissione token/risposta.

## Passi del piano

- **1. Aggiornare la query dei moduli e il loop di autorizzazione**
  - Nella rotta `/api/login`, trovare il blocco commentato `// --- CALCOLO MODULI AUTORIZZATI / META-APP ---`.
  - Sostituire l’intero blocco, dalla dichiarazione di `modulesRes` fino alla chiusura del ciclo `for (let mod of modulesRes.recordset) { ... }`, con il nuovo codice fornito che:
    - Legge anche `RoleDefinition` da `[CMP].[dbo].[Modules]`.
    - Costruisce `authorizedApps` come array di `{ id, name, target, roleKey }`.
    - Inizializza `globalRequiresPassword` a `isSuperuser` (Superuser richiede sempre password).
    - Per ogni modulo a cui l’utente ha accesso, fa `JSON.parse(mod.RoleDefinition)` e, se il ruolo corrente ha `requiresPassword: true`, imposta `globalRequiresPassword = true`.
- **2. Rimpiazzare la vecchia logica password/JWT con quella High Watermark**
  - Subito dopo il nuovo blocco di calcolo moduli, individuare l’attuale sezione che inizia con `let needsPasswordChange = false;` e che contiene:
    - Il calcolo di scadenza password basato su `isAdmin || isSuperuser`.
    - I due rami di flusso separati per admin/non-admin, con due diversi `jwt.sign` e `return res.json({ user: payload });`.
  - Sostituire TUTTO questo blocco (da `let needsPasswordChange = false;` fino all’ultima `return res.json({ user: payload });` prima del `} catch (err) { ... }`) con il codice fornito che:
    - Esegue controlli di scadenza e `ForcePwdChange` solo se `globalRequiresPassword` è true.
    - Verifica la presenza e correttezza della `password` solo in quel caso, restituendo `401` con `requiresPassword: true` se manca.
    - Costruisce un unico `payload` JWT (inclusi `isAdmin`, `isSuperuser`, `authorizedApps`, `forcePwdChange` calcolato) e firma un solo `token`.
    - Imposta il cookie `jwt_token` e ritorna `res.json({ user: payload })` una sola volta.
- **3. Verifiche di consistenza e compatibilità**
  - Confermare che:
    - `globalExpiryDays` resta definito prima del nuovo blocco (già presente nel codice attuale).
    - Le proprietà usate nel nuovo blocco (`PwdExpiryDaysOverride`, `LastPasswordChange`, `ForcePwdChange`, `DefaultModuleID`, `IDUser`, `IDOperator`, ecc.) sono già selezionate nella query utente iniziale (come in `serverbobine.js` attuale).
    - Il payload mantiene `isAdmin` per retrocompatibilità con il frontend `bobine.js`.
  - Controllare visivamente che il blocco `catch (err) { res.status(500)... }` alla fine della rotta non venga alterato.

## Todo

- **update-moduli-high-watermark**: Sostituire il blocco di calcolo moduli con la nuova versione che include `RoleDefinition` e `globalRequiresPassword`.
- **update-login-security-jwt**: Rimpiazzare la sezione di controllo password/JWT con la versione guidata dall’High Watermark, garantendo un unico flusso di risposta.
- **manual-review-login-flow**: Verificare manualmente che i casi (utente solo base, utente con ruolo che richiede password, superuser) si comportino correttamente con la nuova logica.

