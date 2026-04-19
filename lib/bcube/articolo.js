/**
 * lib/bcube/articolo.js — Anti-Corruption Layer per dbo.artico (BCube)
 *
 * Il problema: BCube spalma il "nome articolo" su DUE colonne (ar_descr 40c +
 * ar_desint 40c) perché il primo è limitato. Il PDF al fornitore generato dalle
 * SP usa entrambe le colonne, ma l'app GB2 in 13+ punti mostra solo ar_descr,
 * lasciando l'operatore con un nome monco. Esempio: "FOGLIO A4" senza
 * "PER STAMPA LASER".
 *
 * Inoltre BCube classifica le politiche di riordino con codici (F/G/M/N/O)
 * tradotti dalla tabella canonica dbo._Politica. L'app aveva 3 mapping
 * inline diversi e tutti incompleti/sbagliati (vedi politica.js).
 *
 * Questo modulo è l'unico punto di traduzione "riga grezza BCube" → "Articolo
 * canonico GB2": tutti gli endpoint dovrebbero passare di qui.
 *
 * API:
 *   - ARTICO_FIELDS_SQL : lista colonne standard da SELECT
 *   - normalize(row)    : trasforma riga grezza in Articolo canonico
 *   - nomeCompleto(row) : solo il nome (descr + desint)
 *   - politicaDisplay(row) : solo la stringa display politica (drop-in
 *                           replacement per la vecchia getPoliticaRiordino)
 *   - findByCodart(pool, codart, sql) : fetch + normalize
 */

const politicaRepo = require('./politica');

// SELECT standard per artico — tutte le colonne usate dal normalize.
// Usalo come `SELECT ${ARTICO_FIELDS_SQL} FROM dbo.artico ...`
const ARTICO_FIELDS_SQL = `
    ar_codart, ar_codalt, ar_descr, ar_desint, ar_unmis, ar_perqta,
    ar_polriord, ar_scomin, ar_minord, ar_rrfence,
    ar_forn, ar_forn2, ar_inesaur, ar_blocco
`.trim();

/**
 * Compone il nome canonico dell'articolo concatenando descr + desint.
 * BCube spezza il nome su 2 campi da 40c perché ar_descr è limitato.
 * Restituisce stringa già trim, mai null.
 */
function composeNome(descr, desint) {
    const d = (descr || '').trim();
    const di = (desint || '').trim();
    if (!d) return di;
    if (!di) return d;
    return `${d} ${di}`;
}

/**
 * Costruisce l'oggetto politica leggendo da _Politica (cache).
 *
 * REGOLA DI DISPLAY (chiarita 18/04/2026): il NOME della politica E LA REGOLA.
 * Mostra in parentesi solo i parametri che la politica "dichiara" + sono popolati:
 *
 *   F  "fabbisogno con lotto"               → lotto se popolato
 *   G  "fabbisogno senza lotto"             → niente in parentesi (esplicito)
 *   M  "scorta minimo con lotto"            → scorta_min, lotto, lead time
 *   N  "scorta minima senza lotto"          → scorta_min, lead time (NO lotto)
 *   O  "scorta minima con multiplo di lotto"→ scorta_min, lotto, lead time
 *
 * Verifica empirica DB: il 62,6% degli articoli con polriord='G' ha
 * ar_minord > 0 (talvolta valori molto alti). Mostrare quel valore
 * IGNORANDO il "senza lotto" del nome politica inganna l'operatore: l'MRP
 * di BCube non lo usa per quella politica.
 *
 * Restituisce sempre un oggetto, anche per codici sconosciuti (degrada
 * mostrando il codice grezzo come display).
 */
function buildPolitica(polCode, art) {
    const code = (polCode || '').trim().toUpperCase();
    if (!code) {
        return { codice: '', nome: null, mode: null, categoria: null, descr: '' };
    }
    const row = politicaRepo.lookupSync(code);
    if (!row) {
        // Cache non inizializzata o codice non in _Politica.
        // Degrada gracefully: mostra il codice cosi com'e.
        return { codice: code, nome: null, mode: null, categoria: null, descr: code };
    }

    let descr = row.politica;

    // Determina cosa la politica "dichiara" leggendo il nome canonico.
    const includeLotto = !/senza\s+lotto/i.test(row.politica);
    const isMTS = row.pol === 'MTS';

    const parts = [];
    // Scorta minima: rilevante solo per le politiche MTS (M/N/O)
    if (isMTS && art.ar_scomin) {
        parts.push(`scorta min. ${art.ar_scomin}`);
    }
    // Lotto: solo se la politica NON dice "senza lotto" e il valore e popolato
    if (includeLotto && art.ar_minord) {
        parts.push(`lotto ${art.ar_minord}`);
    }
    // Lead time: e il tempo di consegna del fornitore — SEMPRE rilevante,
    // indipendentemente dalla politica. Mostralo se popolato.
    if (art.ar_rrfence) {
        parts.push(`lead time ${art.ar_rrfence} gg`);
    }
    if (parts.length) descr += ` (${parts.join(', ')})`;

    return {
        codice: code,
        nome: row.politica,        // es. "fabbisogno senza lotto"
        mode: row.pol,             // 'MTO' | 'MTS'
        categoria: row.tipoPol,    // 'A fabbisogno' | 'A scorta minima'
        descr                      // stringa pronta per UI
    };
}

/**
 * Trasforma una riga grezza dbo.artico nell'oggetto Articolo canonico.
 * La riga deve contenere le colonne in ARTICO_FIELDS_SQL (o sottoinsieme:
 * il normalize è tollerante a campi mancanti).
 *
 * Restituisce null se la riga è null/undefined.
 */
function normalize(row) {
    if (!row) return null;

    const descr = (row.ar_descr || '').trim();
    const desint = (row.ar_desint || '').trim();

    return {
        codart: (row.ar_codart || '').trim(),
        codalt: (row.ar_codalt || '').trim(),
        descr,                                        // 1a meta (legacy)
        desint,                                       // 2a meta (legacy)
        nome: composeNome(descr, desint),             // <-- canonico, da usare ovunque
        unmis: (row.ar_unmis || '').trim() || 'PZ',
        perqta: Number(row.ar_perqta) || 1,
        fornitore: row.ar_forn != null ? Number(row.ar_forn) : null,
        fornitoreSecondario: row.ar_forn2 != null ? Number(row.ar_forn2) : null,
        inEsaurimento: row.ar_inesaur === 'S',
        bloccato: !!(row.ar_blocco && row.ar_blocco !== 'N'),
        politica: buildPolitica(row.ar_polriord, row),
        scorta: {
            min: Number(row.ar_scomin) || 0,
            lotto: Number(row.ar_minord) || 0,
            leadTimeGg: Number(row.ar_rrfence) || 0,
        }
    };
}

/**
 * Versione retrocompatibile per chi vuole solo il nome composto.
 * Accetta la riga grezza (con ar_descr e ar_desint).
 */
function nomeCompleto(row) {
    if (!row) return '';
    return composeNome(row.ar_descr, row.ar_desint);
}

/**
 * Versione retrocompatibile per chi vuole solo la stringa display
 * della politica. Drop-in replacement per la vecchia
 * helpers.getPoliticaRiordino() — stessa firma, stesso tipo di ritorno.
 */
function politicaDisplay(row) {
    if (!row) return '';
    return buildPolitica(row.ar_polriord, row).descr;
}

/**
 * Fetch per codart e restituisci l'Articolo canonico (o null se non trovato).
 * Il pool deve puntare a UJET11.
 */
async function findByCodart(pool, codart, sql) {
    if (!codart) return null;
    const r = await pool.request()
        .input('c', sql.VarChar(50), codart)
        .query(`
            SELECT ${ARTICO_FIELDS_SQL}
            FROM dbo.artico
            WHERE codditt = 'UJET11' AND ar_codart = @c
        `);
    return normalize(r.recordset[0]);
}

module.exports = {
    ARTICO_FIELDS_SQL,
    composeNome,
    normalize,
    nomeCompleto,
    politicaDisplay,
    findByCodart,
};
