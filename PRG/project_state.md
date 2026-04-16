# Project State - PortalUjet PRG

## Riferimento Ufficiale
- Fonte architetturale primaria: `C:/Users/andry/Desktop/bobine/conoscenze.txt`.
- Questo file mantiene lo stato operativo del modulo PRG, ma deve restare sempre coerente con quel riferimento.

## Vincoli Architetturali da Rispettare (Allineati a conoscenze)
- Paradigma piattaforma: `1 App = 1 Database = 1 Visto` (silos per dominio).
- Gateway unico: `server.js` (HTTPS, REST API, statici, WebSocket).
- Sicurezza centralizzata e zero-trust:
  - nessun login locale nelle pagine Layer 2;
  - uso obbligatorio di `sicurezza.js`;
  - inizializzazione UI solo dopo evento `securityReady`.
- Connessioni SQL:
  - vietato `sql.connect(config)` globale;
  - obbligo di pool isolati da `config/db.js` (per PRG: `getPoolPRG()`).
- Pattern router:
  - logica di dominio nei router dedicati (`routes/prgRoutes.js`);
  - evitare aggiunta di business logic diretta in `server.js`.
- Regole DB:
  - soft-delete dove previsto (`is_active = 0`);
  - PK in identity gestite dal DB (mai `MAX(id)+1`);
  - no insert manuale delle PK.

## Scope Funzionale PRG
- Gestione anagrafica progetti (`progetti`).
- Gestione anagrafica persone (`persone`).
- Assegnazioni persona-progetto (`assegnazioni_progetti`).
- Workspace di dettaglio (`progetto`, `persona`) con CRUD, relazioni e tasking operativo.

## Convenzioni PRG
- Naming chiavi: `id_progetto`, `id_persona`.
- Campo legacy da preservare: `obbiettivi` (doppia `b`).
- API read: filtro record attivi (`is_active = 1`) dove applicabile.
- Frontend fetch con `credentials: 'include'`.
- Error handling backend standard: `console.error('[ERRORE API]:', error)` nei `catch`.
- Badge deterministici:
  - Stato: `Attivo=green`, `Bozza=secondary`, `Completato=primary`, `In Pausa=warning`.
  - Priorita (case-insensitive): `Bassa=green`, `Media=warning`, `Alta=orange`, `Critica=danger`.
  - classe custom: `.text-bg-orange { background-color: #fd7e14; color: #fff; }`.

## Stato Implementazione Corrente
- Refactor dominio completato: `reparti` -> `aree`.
  - endpoint migrati su `/aree`;
  - query progetti con join su `aree`;
  - frontend rinominato `aree.html` + `aree.js`.
- Dashboard progetti (`prg.html`, `prg.js`):
  - tabella piatta con colonna `Area`;
  - filtri globali area/priorita/stato;
  - filtro priorita robusto (trim + case-insensitive);
  - righe cliccabili con chevron.
- Dettaglio progetto (`progetto.html`, `progetto.js`):
  - titolo pagina dinamico (`titoloPaginaProgetto`);
  - tab refactor in 4 viste: `Info`, `Piano Operativo`, `Elenco Task`, `Team`;
  - action bar contestuale in header tab:
    - `Modifica Progetto` visibile su `Info`
    - `Nuovo Task` visibile su `Piano Operativo` e `Elenco Task`
    - `Assegna Persona` visibile su `Team`
  - modale modifica con select `id_area`;
  - pulsante elimina spostato nel footer modale.
- Kanban task (tab `Piano Operativo`):
  - board dinamica da tabella `colonne_kanban` (non piu statica hardcoded);
  - creazione colonne default su creazione progetto (`Da Fare`, `In Corso`, `Revisione`, `Completato`);
  - CRUD colonne con:
    - rename + colore (`colore`), add colonna, delete colonna;
    - protezione colonne base non eliminabili;
    - blocco delete se presenti task associati;
  - drag&drop task su `id_colonna` (payload dedicato e isolamento eventi task/colonna);
  - drag&drop colonne con handle dedicato `☰` e persistenza ordine;
  - layout orizzontale con scroll (`kanban-board-scroll`) e card colonna a larghezza fissa;
  - blocco dipendenze su avanzamento parent + blocco completamento se sub-task incomplete;
  - modale task unificato create/edit/delete.
- Card Kanban (UX):
  - descrizione non piu stampata full inline;
  - toggle descrizione su icona testo;
  - badge priorita solo per eccezioni (`Alta`, `Critica`);
  - footer compatto con lock dipendenza + stato sub-task + avatar iniziali assegnatario;
  - lock dipendenza dinamico:
    - rosso se task padre non completato
    - grigio se task padre completato (dipendenza storica non bloccante).
- Elenco task WBS (tab `Elenco Task`):
  - albero task/sub-task;
  - edit inline titolo e descrizione;
  - toggle completato;
  - toggle criticita sub-task con icona fiamma;
  - creazione sotto-attivita e delete riga.
- Sidebar PortalUjet condivisa:
  - `assets/components/sidebar.html`;
  - `assets/js/portal-sidebar.js`;
  - integrazione PRG con `#menuBtn` e attivazione voce su percorsi `/PRG/`.

## Backend PRG - Endpoint Principali
- `GET /progetti/:id/tasks`
- `GET /progetti/:id/colonne`
- `POST /progetti/:id/colonne`
- `PUT /colonne/:id`
- `DELETE /colonne/:id`
- `PUT /progetti/:id/ordine-colonne`
- `POST /tasks`
- `PUT /tasks/:id/stato` (update su `id_colonna`, con fallback mapping da nome colonna)
- `PUT /tasks/:id` (update parziale via `COALESCE`, incluso mapping `is_completato -> stato`)
- `DELETE /tasks/:id` (attualmente delete fisico)
- `GET /progetti/:id/struttura-tasks`
- `POST/PUT/DELETE /subtasks...`
- hardening schema `sub_tasks` con rilevazione dinamica colonne da `INFORMATION_SCHEMA`.
- nota DB `colonne_kanban`: campo nome colonna corretto = `nome` (non `nome_colonna`).

## Roadmap / Pendenti
- E2E regressione tasking:
  - create/edit/delete task e sub-task;
  - toggle completato/critico;
  - drag&drop kanban task + colonne con persistenza ordine;
  - validazioni blocco completamento (dipendenze + sub-task incomplete);
  - verifica refresh incrociato tra viste.
- Stabilizzazione schema DB `sub_tasks`:
  - convergere su naming canonico;
  - valutare migrazione SQL unica e rimozione fallback dinamico.
- Hardening API:
  - validazioni `400` su payload minimi;
  - messaggi business chiari su errori FK/constraint;
  - valutare soft-delete task al posto di delete fisico.
- Hardening logica task:
  - impedire dipendenze circolari multi-livello (attualmente bloccato self-dependency in UI);
  - aggiungere validazione server-side su self-dependency e dipendenze invalide.
- UX futura:
  - ordinamento manuale sub-task (drag&drop WBS);
  - persistenza expand/collapse descrizioni;
  - ricerca full-text nell'elenco task.
