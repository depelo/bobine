---
name: profile-modals-ruolo-password
overview: Aggiornare il flusso profilo utente per esporre il nome visibile del ruolo, gestire il requisito password via JWT e mostrare modali isolati di successo/errore in profile.html/profile.js.
todos:
  - id: backend-jwt-rolelabel
    content: Aggiornare il blocco if (hasAccess) in /api/login per includere roleLabel e requiresPassword in authorizedApps, preservando la logica globalRequiresPassword.
    status: completed
  - id: frontend-profile-html-css
    content: Aggiornare profile.html con nuovo blocco <style>, nuovo bottone Indietro in alto, wrapper passwordSectionWrapper e inserimento modali profSuccess/profError a fondo body.
    status: completed
  - id: frontend-profile-js-logic
    content: Sostituire profile.js con la nuova logica che legge authorizedApps dal token, calcola il nome visibile del ruolo, decide se nascondere la sezione password e usa i modali isolati per successi/errori.
    status: completed
isProject: false
---

## Obiettivo

Allineare backend e frontend del modulo profilo per: arricchire il JWT con `roleLabel` e `requiresPassword`, mostrare il nome visibile del ruolo, nascondere dinamicamente la sezione password se non necessaria e sostituire i messaggi inline con modali isolati di successo/errore, includendo un pulsante "Indietro" in alto.

## Step 1: Backend – Arricchire il JWT in `serverbobine.js`

- **Localizzare endpoint login**: Usare l’endpoint `POST /api/login` in `[serverbobine.js](c:/Users/depel/Documents/progetto/ujet/bobine/serverbobine.js)` dove viene popolato l’array `authorizedApps` nel ciclo `for (let mod of modulesRes.recordset)`.
- **Sostituire blocco `if (hasAccess)`**: Intorno alle righe 713–750, sostituire l’attuale blocco:
  - che oggi fa solo `authorizedApps.push({ id, name, target, roleKey })` e separatamente valuta `RoleDefinition` per impostare `globalRequiresPassword`.
  - con il blocco che hai fornito, che per ogni app calcola `roleLabel` e `requiresPassword`, gestisce il parsing di `RoleDefinition` con try/catch, aggiorna `globalRequiresPassword` se necessario e pusha in `authorizedApps` un oggetto esteso `{ id, name, target, roleKey, roleLabel, requiresPassword }`.
- **Mantenere logica High Watermark**: Assicurarsi che la nuova valutazione `requiresPassword` per singola app sia compatibile con l’attuale uso di `globalRequiresPassword` (la nuova implementazione continua a elevarlo a true quando almeno un ruolo lo richiede).
- **Verifica rapida**: Controllare che il payload JWT finale (proprietà `authorizedApps` nel `payload` costruito verso le righe 794–805) rifletta le nuove proprietà senza rompere campi esistenti usati da altre parti dell’app.

## Step 2: Frontend – HTML e CSS isolato in `profile.html`

- **Sostituire lo `<style>` interno**: In `[profile.html](c:/Users/depel/Documents/progetto/ujet/bobine/profile.html)`, rimpiazzare integralmente il blocco `<style>...</style>` nell’`<head>` con il CSS fornito, che:
  - estende `.profile-container` con `position: relative;`, aggiunge `.back-btn-top` in alto a sinistra e definisce tutte le classi dei modali isolate con prefisso `prof-` (`.prof-modal-overlay`, `.prof-modal-box`, ecc.), evitando collisioni con altri fogli di stile.
- **Inserire il pulsante "Indietro" in alto**: Dentro il `div.profile-container`, subito all’inizio:
  - aggiungere il bottone:
    - `button.back-btn-top` con `id="btnGoBack"` e l’icona SVG della freccia, testo "Indietro".
  - rimuovere il bottone "Indietro" in fondo pagina (il blocco `div` con `onclick="window.history.back()"`).
- **Wrappare la sezione password**:
  - Racchiudere il titolo "Cambia Password", il `form#changePwdForm`, il titolo "Recupero Password" e il `form#recoverPwdForm` all’interno di un `div` contenitore con `id="passwordSectionWrapper"`, lasciando invariata la struttura interna dei form.
  - Il nuovo wrapper permetterà a `profile.js` di nascondere l’intero blocco con `style.display = 'none'` quando la password non è richiesta.
- **Aggiungere i modali isolati a fondo `body`**:
  - Prima del tag `<script src="profile.js"></script>`, inserire i due blocchi HTML forniti per `#profSuccessModal` e `#profErrorModal`, usando solo le classi CSS locali (`prof-modal-*`) e gli id (`profSuccessMsg`, `profErrorMsg`) che saranno pilotati da `profile.js`.

## Step 3: Frontend – Logica in `profile.js`

- **Sostituire interamente `profile.js`**: In `[profile.js](c:/Users/depel/Documents/progetto/ujet/bobine/profile.js)`, rimuovere il contenuto attuale e incollare il nuovo script che hai fornito, che implementa:
  - le funzioni `showProfSuccess`, `showProfError`, `closeProfModals` che gestiscono l’apertura/chiusura dei modali tramite l’aggiunta/rimozione della classe `is-active` sui `prof-modal-overlay`.
  - il listener `DOMContentLoaded` che:
    - collega il click di `#btnGoBack` alla navigazione condizionata su `/captain.html` se `currentUser.defaultModuleId === 2`, altrimenti `/bobine.html`.
    - esegue `GET /api/me` (con `credentials: 'include'`), popola `#profName` e calcola il ruolo principale leggendo `currentUser.authorizedApps`:
      - sceglie l’app di default (id uguale a `defaultModuleId`) o la prima,
      - usa `roleLabel` se presente, altrimenti `roleKey`,
      - forza un’etichetta speciale per `isSuperuser` (`"Superuser (Master)"`).
    - valuta il flag `needsPassword` come `true` se l’utente è superuser o se **almeno una** delle app in `authorizedApps` ha `requiresPassword === true`.
    - se `needsPassword` è `false`, imposta `display: 'none'` su `#passwordSectionWrapper`, nascondendo completamente la sezione cambio/recupero password.
    - in caso di errore nel fetch profilo, mostra un modale di errore con `showProfError`.
  - la gestione del submit di `#changePwdForm`:
    - invia `PUT /api/users/me/password` con `{ oldPassword, newPassword }`, resetta il form in caso di successo e mostra un modale di successo, oppure mostra un modale di errore con il messaggio restituito dal server.
  - la gestione del submit di `#recoverPwdForm`:
    - invia `POST /api/users/recover` con `{ barcode }`, resetta il form e mostra un modale di successo, oppure un modale di errore con messaggio del server.
- **Coerenza con il JWT**: Verificare che `currentUser.authorizedApps` restituito da `/api/me` contenga effettivamente `roleLabel` e `requiresPassword` dopo le modifiche del backend, così che la logica `needsPassword` e l’etichetta ruolo funzionino come previsto.

## Note di verifica

- **Test login e profilo**:
  - Effettuare un login con utente base, admin e superuser per verificare che il titolo "Ruolo Primario" mostri il `roleLabel` corretto (es. "Caporeparto") e che la sezione password venga nascosta/mostrata correttamente in base alle regole.
- **Test modali**:
  - Forzare sia successi che errori nelle chiamate cambio password e recupero password (ad esempio inviando password vecchia sbagliata o barcode non valido) per assicurarsi che i due modali funzionino e che non restino bloccati.
- **Compatibilità UI**:
  - Controllare che il nuovo pulsante "Indietro" non copra altri elementi su schermi piccoli e che il CSS isolato non introduca regressioni su altre pagine che usano `index.css`.

