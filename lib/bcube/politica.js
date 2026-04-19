/**
 * lib/bcube/politica.js — Anti-Corruption Layer per dbo._Politica (BCube)
 *
 * _Politica è la tabella canonica BCube che traduce i codici polriord
 * (F, G, M, N, O) in nome leggibile + classificazione MTO/MTS.
 *
 * Contenuto attuale (5 righe, immutabile come dominio):
 *   F  fabbisogno con lotto                  MTO  A fabbisogno
 *   G  fabbisogno senza lotto                MTO  A fabbisogno
 *   M  scorta minimo con lotto               MTS  A scorta minima
 *   N  scorta minima senza lotto             MTS  A scorta minima
 *   O  scorta minima con multiplo di lotto   MTS  A scorta minima
 *
 * Il vecchio mapping in routes/gb2/helpers.js:313 era incompleto/sbagliato:
 *  - 'G' mancava (94 articoli attivi mostravano solo "G" all'operatore)
 *  - 'L' non esiste in BCube
 *  - 'N' tradotto in modo errato
 *  - 'O' mancante
 *
 * Cache: in-memory, lifetime processo. _Politica è dominio: per cambiarla
 * serve modificare BCube → riavvio del processo è accettabile.
 */

let _cache = null;        // Map<polriord, { polriord, politica, pol, tipo_pol }>
let _loadingPromise = null; // dedup concurrent first-loads

/**
 * Carica (e cacha) il contenuto di dbo._Politica.
 * Richiede un pool puntato a UJET11.
 */
async function loadPolitica(pool) {
    if (_cache) return _cache;
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = (async () => {
        const r = await pool.request().query(`
            SELECT polriord, politica, pol, tipo_pol
            FROM dbo._Politica
            ORDER BY polriord
        `);
        const map = new Map();
        for (const row of r.recordset) {
            const code = (row.polriord || '').trim().toUpperCase();
            if (!code) continue;
            map.set(code, {
                polriord: code,
                politica: (row.politica || '').trim(),    // nome leggibile
                pol: (row.pol || '').trim(),              // MTO | MTS
                tipoPol: (row.tipo_pol || '').trim(),     // "A fabbisogno" | "A scorta minima"
            });
        }
        _cache = map;
        _loadingPromise = null;
        return map;
    })();

    return _loadingPromise;
}

/**
 * Lookup sincrono — richiede che loadPolitica sia stata chiamata prima.
 * Ritorna null se il codice non esiste o cache non inizializzata.
 */
function lookupSync(polriord) {
    if (!_cache) return null;
    const code = (polriord || '').trim().toUpperCase();
    if (!code) return null;
    return _cache.get(code) || null;
}

/**
 * Restituisce l'array di tutte le politiche cachate, in ordine alfabetico
 * di codice. Pensata per le UI che devono popolare un dropdown.
 * Se la cache non e ancora inizializzata, restituisce array vuoto (chi
 * chiama dovrebbe aver fatto loadPolitica prima — bootstrap o lazy).
 */
function listSync() {
    if (!_cache) return [];
    return [..._cache.values()].sort((a, b) => a.polriord.localeCompare(b.polriord));
}

/**
 * Reset cache — solo per test o per forzare re-fetch.
 */
function _resetCache() {
    _cache = null;
    _loadingPromise = null;
}

module.exports = {
    loadPolitica,
    lookupSync,
    listSync,
    _resetCache,
};
