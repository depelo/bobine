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
  - campo nome ridondante rimosso da Team & Info;
  - modale modifica con select `id_area`;
  - pulsante elimina spostato nel footer modale.
- Kanban task (tab `Piano Operativo`):
  - colonne `Da Fare`, `In Corso`, `Revisione`, `Completato`;
  - drag&drop HTML5;
  - blocco dipendenze su avanzamento parent;
  - modale task unificato create/edit/delete.
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
- `POST /tasks`
- `PUT /tasks/:id/stato`
- `PUT /tasks/:id` (update parziale via `COALESCE`, incluso mapping `is_completato -> stato`)
- `DELETE /tasks/:id` (attualmente delete fisico)
- `GET /progetti/:id/struttura-tasks`
- `POST/PUT/DELETE /subtasks...`
- hardening schema `sub_tasks` con rilevazione dinamica colonne da `INFORMATION_SCHEMA`.

## Roadmap / Pendenti
- E2E regressione tasking:
  - create/edit/delete task e sub-task;
  - toggle completato/critico;
  - drag&drop kanban con dipendenze;
  - verifica refresh incrociato tra viste.
- Stabilizzazione schema DB `sub_tasks`:
  - convergere su naming canonico;
  - valutare migrazione SQL unica e rimozione fallback dinamico.
- Hardening API:
  - validazioni `400` su payload minimi;
  - messaggi business chiari su errori FK/constraint;
  - valutare soft-delete task al posto di delete fisico.
- UX futura:
  - ordinamento manuale sub-task (drag&drop WBS);
  - persistenza expand/collapse descrizioni;
  - ricerca full-text nell'elenco task.
