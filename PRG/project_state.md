# Project State - PortalUjet PRG

## Visione e Obiettivi
- Modulo web PRG (Project Resource Governance) su stack Node.js + pagine statiche per:
  - gestione anagrafica progetti (`progetti`)
  - gestione anagrafica persone (`persone`)
  - assegnazioni persona-progetto (`assegnazioni_progetti`)
- Obiettivo operativo: dashboard separata per dominio (`Progetti`, `Persone`) + workspace dettaglio (`progetto`, `persona`) con CRUD/soft-delete e vista relazioni.

## Stack Tecnologico e Vincoli
- Backend: `Node.js`, `Express`, `mssql`, `dotenv`, `cors`, `cookie-parser`, `socket.io`.
- Frontend: HTML statico + Bootstrap 5 CDN + Vanilla JS (`fetch`, `async/await`).
- Sicurezza PortalUjet:
  - obbligo `sicurezza.js` in `<head>`
  - inizializzazione JS solo su `document.addEventListener('securityReady', initApp)`.
- DB SQL Server:
  - database `PRG`, pool isolato `getPoolPRG()` (no `sql.connect` globale).
- Convenzioni chiave:
  - PK/FK con nomi DB: `id_progetto`, `id_persona`
  - colonna `obbiettivi` (doppia `b`)
- soft-delete con `is_active = 0`.

## Logiche Fondamentali
- API read devono filtrare record attivi (`is_active = 1`) dove previsto.
- Soft-delete:
  - `DELETE /progetti/:id` -> `UPDATE is_active = 0`
  - `DELETE /persone/:id` -> `UPDATE is_active = 0`.
- Badge deterministici:
  - Stato: `Attivo=green`, `Bozza=secondary`, `Completato=primary`, `In Pausa=warning`.
  - Priorita (case-insensitive): `Bassa=green`, `Media=warning`, `Alta=orange(custom)`, `Critica=danger`.
- Priorita con classe custom:
  - `.text-bg-orange { background-color: #fd7e14; color: #fff; }`.
- Fetch frontend con `credentials: 'include'` (middleware sicurezza).
- Error handling backend:
  - `console.error('[ERRORE API]:', error)` in tutti i `catch`.

## Stato dell'Implementazione
- Backend PRG attivo in `routes/prgRoutes.js`:
  - Progetti: `GET` (con join `reparti`), `POST`/`PUT` con `id_reparto`, `DELETE(soft)`.
  - Persone: `GET`, `POST`, `PUT`, `DELETE(soft)`.
  - Reparti: `GET`, `POST`, `PUT`, `DELETE(soft con is_active=0)`.
  - Assegnazioni: `POST /assegna`, `GET /progetti/:id/team` (con `id_persona`), `PUT /progetti/:id_progetto/team/:id_persona`, `DELETE /progetti/:id_progetto/team/:id_persona`, `GET /persone/:id/progetti`.
- Frontend completato:
  - `prg.html` + `prg.js`: dashboard progetti raggruppata per reparto con accordion (`Senza Reparto` per `id_reparto` nullo), badge dinamici, tasto `Gestisci`.
  - UX tabella progetti aggiornata: riga interamente cliccabile (anche tastiera), hover dedicato `.progetto-row`, colonna azioni con icona freccia compatta.
  - `progetto.html` + `progetto.js`: dettaglio progetto, team, assegna persona, modifica/elimina progetto + select reparto in modal modifica + gestione membro team (modifica ruolo / rimozione assegnazione).
  - `persone.html` + `persone.js`: dashboard anagrafica persone + creazione + `Gestisci`.
  - `reparti.html` + `reparti.js`: dashboard reparti con tabella, modal crea/modifica, eliminazione soft-delete.
  - Navbar condivisa rifattorizzata: branding con placeholder menu, logo `/asset/logo.png`, titolo `Ujet Progetti`, link globali separati dalle CTA di pagina.
  - Uniformazione bottoni tabelle: azioni `Modifica/Gestisci/Elimina` con stile `outline` coerente per ridurre rumore visivo.
  - Scheda `persona.html` allineata al pattern UX: back-link contestuale in alto a sinistra e azioni dati separate.
- Static assets backend: esposta cartella `/assets` via `express.static` in `server.js`, logo navbar su `/assets/logo-ujet.jpeg`.
  - `persona.html` + `persona.js`: dettaglio persona, progetti associati, modifica/elimina persona.
- Navigazione globale aggiunta: link `Progetti` / `Persone` nelle navbar.

## Task Pendenti e Roadmap
- Verifica DB schema reale allineato:
  - `is_active` su `persone`
  - `ruolo_nel_progetto`, `data_assegnazione` su `assegnazioni_progetti`
  - tipi (`budget` decimal, date fields).
- E2E test manuale (happy path + edge):
  - creazione/aggiornamento/eliminazione progetto
  - creazione/aggiornamento/eliminazione persona
  - assegnazione persona-progetto e riflesso su entrambe le schede.
- Hardening consigliato:
  - validazioni backend (400 su payload incompleto)
  - vincoli univoci assegnazioni duplicate
  - messaggistica errore frontend più granulare.
