---
name: dashboard-operativa-anagrafica
overview: Aggiungere una mini dashboard operativa sopra l’anagrafica utenti in captain.html con contatori, ricerca e filtri, aggiornando il rendering della tabella senza distruggere l’header.
todos:
  - id: update-header
    content: Sostituire l’header della view `view-utenti` con il nuovo layout dashboard e rimuovere il testo placeholder sotto l’header.
    status: completed
  - id: hook-filter-app-loadModules
    content: Estendere `loadModules` per popolare il select `filterAppSelect` con l’elenco moduli disponibili.
    status: completed
  - id: refactor-renderUsersTable-filters
    content: Refactor di `renderUsersTable` per aggiornare contatori, applicare ricerca/filtri su `globalUsers`, generare `filteredUsers` e riscrivere solo `#usersTableWrapper` mantenendo SortableJS.
    status: completed
  - id: wire-filter-events
    content: Aggiungere i listener agli input di ricerca e select filtri nel blocco `DOMContentLoaded` per richiamare `renderUsersTable` a ogni cambiamento.
    status: completed
isProject: false
---

### Obiettivo

Implementare in `captain.html` una "Dashboard Operativa" sopra la tabella Anagrafica Globale con contatori di stato, barra di ricerca e filtri per App/Stato, aggiornando la logica JS affinché la tabella reagisca ai filtri senza ricreare l’header.

### Passi principali

- **Aggiornare l’header HTML dell’anagrafica**
  - Nella view `view-utenti` in `[captain.html](captain.html)`, sostituire il blocco esistente `div.data-card-header` e il paragrafo di placeholder con il nuovo layout fornito:
    - Contiene titolo "Anagrafica Globale (Passaporti)" e bottone `+ Nuovo Utente` con `onclick="openNewUserModal()"`.
    - Aggiunge i tre pannelli contatore con `id="statTotalUsers"`, `id="statOnlineUsers"`, `id="statAlarmUsers"`.
    - Aggiunge input di ricerca `id="globalSearchInput"` e select `id="filterAppSelect"`, `id="filterStatusSelect"`.
    - Mantiene lo spazio sotto l’header per l’inserimento dinamico della tabella (nessun header tabellare generato da JS).
- **Popolare il filtro App in `loadModules`**
  - All’interno della funzione `loadModules` in `[captain.html](captain.html)`, al termine del blocco `try` (subito prima del `catch`), usare l’array `modules` già calcolato per popolare `#filterAppSelect`:
    - Recuperare l’elemento con `document.getElementById('filterAppSelect')`.
    - Salvare il valore corrente, ricostruire le option partendo da `"Tutte le App"`, poi una option per ciascun `mod.id`/`mod.name`.
    - Ripristinare il valore selezionato se ancora valido, altrimenti default `ALL`.
- **Refactor di `renderUsersTable` per filtri e contatori**
  - All’inizio di `renderUsersTable` in `[captain.html](captain.html):
    - Usare `globalUsers` per aggiornare i contatori nei tre elementi `statTotalUsers`, `statOnlineUsers`, `statAlarmUsers`.
    - Leggere i valori di ricerca e dei due select (`globalSearchInput`, `filterAppSelect`, `filterStatusSelect`) con fallback a stringhe vuote/`ALL`.
    - Calcolare `filteredUsers` filtrando `globalUsers` per testo (nome o barcode), App (presenza di un `apps.moduleId == appFilt` quando `appFilt != 'ALL'`) e stato (ONLINE, OFFLINE, ALARM) secondo le regole specificate.
    - Conservare un riferimento all’eventuale wrapper `#usersTableWrapper` esistente.
  - Ricostruire il markup HTML solo per il wrapper/tabella:
    - Iniziare `let html = \ ``...` `  
    con thead identico all’attuale ma senza l’header anagrafica.
    - Se `filteredUsers.length === 0`, inserire una riga singola con messaggio "Nessun utente corrisponde ai filtri di ricerca.".
    - Altrimenti iterare su `filteredUsers.forEach(u => ...)` (non più su `globalUsers`) per costruire le righe, riutilizzando la logica esistente per App, Ruoli, Stato, icone di alert/reset e bottone `Gestisci`.
  - Chiusura e inserimento nel DOM:
    - Chiudere il markup con `html += '</tbody></table></div>';`.
    - Se `#usersTableWrapper` esiste, sostituirlo via `wrapper.outerHTML = html;`, altrimenti fare `container.insertAdjacentHTML('beforeend', html);`.
    - Dopo l’inserimento, re-selezionare `#usersTableBody` e re-inizializzare SortableJS come già fatto (stessa configurazione, ma ora dopo l’aggiornamento del wrapper anziché dopo `container.innerHTML = html`).
    - Eliminare l’assegnazione `container.innerHTML = html;` originaria per non distruggere la dashboard in alto.
- **Event listeners per ricerca e filtri**
  - Nel blocco `DOMContentLoaded` esistente in `[captain.html](captain.html), dopo i listener già presenti:
    - Aggiungere `addEventListener` su `#globalSearchInput` (evento `input`) per chiamare `renderUsersTable` a ogni modifica del testo.
    - Aggiungere `addEventListener` su `#filterAppSelect` e `#filterStatusSelect` (evento `change`) per richiamare `renderUsersTable` al cambio di selezione.
  - Assicurarsi che i listener vengano registrati dopo il caricamento dell’HTML dell’header (in questo file lo sono, perché lo script è in fondo alla pagina).

### Todo

- **update-header**: Sostituire l’header `view-utenti` con il nuovo layout dashboard e rimuovere il paragrafo placeholder.
- **hook-filter-app-loadModules**: Estendere `loadModules` per popolare il select `filterAppSelect` usando l’elenco moduli.
- **refactor-renderUsersTable-filters**: Aggiornare `renderUsersTable` per usare `filteredUsers`, aggiornare i contatori e riscrivere solo `#usersTableWrapper` mantenendo Sortable.
- **wire-filter-events**: Agganciare gli event listener di ricerca e filtri in `DOMContentLoaded` per ridisegnare dinamicamente la tabella.

