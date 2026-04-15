/**
 * GB2 PendingSync — safety-net per "Conferma per ordine".
 *
 * Pattern: localStorage-first per massima reattività UX, con sync asincrono
 * verso [GB2].[dbo].[ordini_confermati_pending] per non perdere il lavoro in
 * caso di F5, crash, chiusura browser, cambio PC.
 *
 * Contratto:
 *   - La Map RAM (MrpApp.state.ordiniConfermati) resta fonte di verità per
 *     la reattività UI. PendingSync viaggia in parallelo.
 *   - localStorage key: ocp_<elaborazione_id>
 *     Valore: { <key>: { quantita, prezzo, deleted, synced, updated_at }, ... }
 *     Dove <key> = `${forn}|${codart}|${fase}|${magaz}`.
 *   - Tombstones: le delete non rimuovono l'entry da LS, ma la marcano
 *     { deleted: true, synced: false }. Solo dopo sync ACK la entry viene
 *     rimossa dal LS definitivamente. Impedisce "resurrezione" al refresh
 *     se il DB non è stato ancora aggiornato.
 *   - Debounce 250ms per chiave: confermi 30 volte in 5 secondi → 1 upsert.
 *   - Backoff esponenziale su errore rete: 1s, 2s, 5s, 15s, 60s, 300s.
 *   - sendBeacon() su pagehide come last-chance flush.
 *   - 409 ELABORAZIONE_CHANGED → wipe LS e hard reload della proposta.
 *   - onStateChange(cb) permette all'indicatore globale di rifletterere lo stato.
 *
 * Uso:
 *   PendingSync.init({ elaborazioneId, userId })
 *   PendingSync.upsert(key, { quantita_confermata, prezzo_override, fornitore_codice, codart, fase, magaz })
 *   PendingSync.remove(key, { fornitore_codice, codart, fase, magaz })
 *   PendingSync.hydrateFromDB(ordini_confermati_pending, { mergeIntoMap })
 *   PendingSync.clearForKeys(keys)  // post-emissione
 *   PendingSync.getState()          // { status: 'ok'|'pending'|'error', pending: N, lastError }
 *   PendingSync.onStateChange(cb)
 */
window.PendingSync = (function() {
    const API = '/api/mrp';
    const DEBOUNCE_MS = 250;
    const BACKOFF_SCHEDULE = [1000, 2000, 5000, 15000, 60000, 300000];

    let elaborazioneId = null;
    let userId = null;
    let lsKey = null;

    // Stato interno
    const timers = new Map();         // key -> setTimeout id (debounce)
    const inflight = new Set();       // keys attualmente in fetch
    const retryAt = new Map();        // key -> timestamp prossimo retry
    const retryCount = new Map();     // key -> n retry consecutivi
    let globalRetryTimer = null;

    let status = 'ok';                // 'ok' | 'pending' | 'error'
    let lastError = null;
    const listeners = new Set();

    // ───────────────────────── localStorage helpers ─────────────────────────

    function readLS() {
        if (!lsKey) return {};
        try { return JSON.parse(localStorage.getItem(lsKey) || '{}'); }
        catch (_) { return {}; }
    }

    function writeLS(obj) {
        if (!lsKey) return;
        try { localStorage.setItem(lsKey, JSON.stringify(obj)); }
        catch (e) { console.warn('[PendingSync] writeLS fallito:', e.message); }
    }

    function writeEntry(key, entry) {
        const s = readLS();
        s[key] = entry;
        writeLS(s);
    }

    function removeEntry(key) {
        const s = readLS();
        delete s[key];
        writeLS(s);
    }

    function wipeLS() {
        if (!lsKey) return;
        try { localStorage.removeItem(lsKey); } catch (_) {}
    }

    // ───────────────────────── stato globale ─────────────────────────

    function recomputeStatus() {
        const s = readLS();
        let hasPending = false;
        for (const k in s) {
            if (s[k] && s[k].synced === false) { hasPending = true; break; }
        }
        if (lastError && hasPending) status = 'error';
        else if (hasPending) status = 'pending';
        else status = 'ok';
        emitState();
    }

    function emitState() {
        const snap = getState();
        listeners.forEach(cb => { try { cb(snap); } catch (_) {} });
    }

    function getState() {
        const s = readLS();
        let pending = 0;
        for (const k in s) if (s[k] && s[k].synced === false) pending++;
        return { status, pending, lastError };
    }

    function onStateChange(cb) {
        listeners.add(cb);
        try { cb(getState()); } catch (_) {}
        return () => listeners.delete(cb);
    }

    // ───────────────────────── sync core ─────────────────────────

    function parseKey(key) {
        const [fornitore_codice, codart, fase, magaz] = (key || '').split('|');
        return {
            fornitore_codice,
            codart,
            fase: parseInt(fase || 0, 10),
            magaz: parseInt(magaz || 1, 10)
        };
    }

    async function syncKey(key) {
        if (!elaborazioneId || !lsKey) return;
        if (inflight.has(key)) return;

        const s = readLS();
        const entry = s[key];
        if (!entry || entry.synced === true) return;

        // Respect backoff
        const now = Date.now();
        const nextAt = retryAt.get(key) || 0;
        if (now < nextAt) return;

        inflight.add(key);
        const parsed = parseKey(key);
        const isDelete = entry.deleted === true;

        try {
            const url = API + (isDelete ? '/conferma-pending/delete' : '/conferma-pending/upsert');
            const payload = {
                elaborazione_id: elaborazioneId,
                fornitore_codice: parsed.fornitore_codice,
                codart: parsed.codart,
                fase: parsed.fase,
                magaz: parsed.magaz
            };
            if (!isDelete) {
                payload.quantita_confermata = entry.quantita;
                payload.prezzo_override = entry.prezzo == null ? null : entry.prezzo;
            }
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            if (r.status === 409) {
                const body = await r.json().catch(() => ({}));
                if (body.error === 'ELABORAZIONE_CHANGED') {
                    handleElaborazioneChanged();
                    return;
                }
                if (body.error === 'CHIAVE_NON_VALIDA') {
                    // Chiave non in SnapshotProposte: entry orfana, rimuovi dal LS.
                    removeEntry(key);
                    retryAt.delete(key);
                    retryCount.delete(key);
                    recomputeStatus();
                    return;
                }
            }

            if (!r.ok) throw new Error('HTTP ' + r.status);

            // Successo: se era delete → rimuovi l'entry definitivamente.
            // Se era upsert → marca synced=true (resta in LS per consistenza con DB).
            if (isDelete) {
                removeEntry(key);
            } else {
                const cur = readLS()[key];
                if (cur) {
                    writeEntry(key, Object.assign({}, cur, { synced: true }));
                }
            }
            retryAt.delete(key);
            retryCount.delete(key);
            lastError = null;
            recomputeStatus();
        } catch (err) {
            // Errore → schedula retry con backoff
            const n = (retryCount.get(key) || 0);
            const delay = BACKOFF_SCHEDULE[Math.min(n, BACKOFF_SCHEDULE.length - 1)];
            retryCount.set(key, n + 1);
            retryAt.set(key, Date.now() + delay);
            lastError = err.message || String(err);
            console.warn('[PendingSync] sync fallito per', key, '→ retry in', delay, 'ms:', lastError);
            recomputeStatus();
            scheduleGlobalRetry();
        } finally {
            inflight.delete(key);
        }
    }

    function scheduleGlobalRetry() {
        if (globalRetryTimer) return;
        // Trova il prossimo retryAt più vicino
        let minAt = Infinity;
        retryAt.forEach(t => { if (t < minAt) minAt = t; });
        if (!isFinite(minAt)) return;
        const delay = Math.max(100, minAt - Date.now());
        globalRetryTimer = setTimeout(() => {
            globalRetryTimer = null;
            // Retry tutto ciò che è scaduto
            const s = readLS();
            Object.keys(s).forEach(k => {
                if (s[k] && s[k].synced === false) syncKey(k);
            });
        }, delay);
    }

    function handleElaborazioneChanged() {
        console.warn('[PendingSync] ELABORAZIONE_CHANGED: wipe LS e reload proposta');
        wipeLS();
        timers.clear();
        retryAt.clear();
        retryCount.clear();
        lastError = 'Elaborazione cambiata: ricarico la proposta...';
        recomputeStatus();
        // Ricarica la proposta — se MrpApp espone un hook lo chiamo, altrimenti reload.
        try {
            if (window.MrpApp && typeof MrpApp.reloadProposta === 'function') {
                MrpApp.reloadProposta();
            } else {
                location.reload();
            }
        } catch (_) { location.reload(); }
    }

    // ───────────────────────── API pubblica ─────────────────────────

    function init(opts) {
        elaborazioneId = opts && opts.elaborazioneId;
        userId = opts && opts.userId;
        lsKey = elaborazioneId ? 'ocp_' + elaborazioneId : null;

        // Invalidazione al cambio elaborazione: pulisci tutte le chiavi
        // ocp_* che NON corrispondono alla corrente.
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.startsWith('ocp_') && k !== lsKey) {
                    localStorage.removeItem(k);
                }
            }
        } catch (_) {}

        // Kick iniziale: se ci sono entry non sincronizzate rimaste da una
        // sessione precedente (crash/reload), prova a flusharle.
        const s = readLS();
        Object.keys(s).forEach(k => {
            if (s[k] && s[k].synced === false) {
                // Debounce leggero per non stressare al boot
                setTimeout(() => syncKey(k), 100);
            }
        });
        recomputeStatus();
    }

    /**
     * Idrata Map RAM + LS dai dati server. Strategia merge:
     *   - Per ogni entry DB: se LS ha la stessa chiave con synced=false,
     *     LS vince (lavoro in corso non ancora flushato).
     *   - Altrimenti DB vince: scrivi in LS con synced=true.
     */
    function hydrateFromDB(dbRows, opts) {
        if (!Array.isArray(dbRows)) return;
        const s = readLS();
        const mergeMap = opts && opts.mergeIntoMap;

        for (const row of dbRows) {
            const key = `${row.fornitore_codice}|${row.codart}|${row.fase || 0}|${row.magaz || 1}`;
            const lsEntry = s[key];

            if (lsEntry && lsEntry.synced === false) {
                // LS wins: lavoro utente non ancora confermato dal server.
                // Se è un tombstone, non reinserire in Map.
                if (!lsEntry.deleted && mergeMap) {
                    mergeMap.set(key, {
                        fornitore_codice: row.fornitore_codice,
                        ol_codart: row.codart,
                        ol_fase: row.fase || 0,
                        ol_magaz: row.magaz || 1,
                        quantita_confermata: lsEntry.quantita,
                        prezzo: lsEntry.prezzo
                    });
                }
                continue;
            }

            // DB wins
            s[key] = {
                quantita: Number(row.quantita_confermata),
                prezzo: row.prezzo_override == null ? null : Number(row.prezzo_override),
                deleted: false,
                synced: true,
                updated_at: row.updated_at
            };
            if (mergeMap) {
                mergeMap.set(key, {
                    fornitore_codice: row.fornitore_codice,
                    ol_codart: row.codart,
                    ol_fase: row.fase || 0,
                    ol_magaz: row.magaz || 1,
                    quantita_confermata: Number(row.quantita_confermata),
                    prezzo: row.prezzo_override == null ? null : Number(row.prezzo_override)
                });
            }
        }

        // Entry in LS non presenti in DB e synced=true → stale: rimuovi.
        const dbKeySet = new Set(dbRows.map(r =>
            `${r.fornitore_codice}|${r.codart}|${r.fase || 0}|${r.magaz || 1}`
        ));
        Object.keys(s).forEach(k => {
            if (s[k] && s[k].synced === true && !dbKeySet.has(k)) {
                delete s[k];
            }
        });

        writeLS(s);
        recomputeStatus();
    }

    function upsert(key, dati) {
        if (!lsKey) return;
        const entry = {
            quantita: Number(dati.quantita_confermata),
            prezzo: dati.prezzo == null ? (dati.prezzo_override == null ? null : Number(dati.prezzo_override)) : Number(dati.prezzo),
            deleted: false,
            synced: false,
            updated_at: new Date().toISOString()
        };
        writeEntry(key, entry);
        recomputeStatus();

        // Debounce per chiave
        if (timers.has(key)) clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => {
            timers.delete(key);
            // Reset backoff su nuova edit esplicita
            retryAt.delete(key);
            retryCount.delete(key);
            syncKey(key);
        }, DEBOUNCE_MS));
    }

    function remove(key) {
        if (!lsKey) return;
        const s = readLS();
        const cur = s[key];

        // Se l'entry non era mai stata sincronizzata e non esiste in DB
        // possiamo rimuoverla direttamente senza tombstone.
        if (!cur || (cur.synced === false && cur.deleted === false && !cur._wasOnServer)) {
            // Se non è mai stata syncata al server, basta cancellare
            if (!cur || !cur.synced) {
                removeEntry(key);
                recomputeStatus();
                return;
            }
        }

        // Tombstone
        writeEntry(key, {
            quantita: cur ? cur.quantita : 0,
            prezzo: cur ? cur.prezzo : null,
            deleted: true,
            synced: false,
            updated_at: new Date().toISOString()
        });
        recomputeStatus();

        if (timers.has(key)) clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => {
            timers.delete(key);
            retryAt.delete(key);
            retryCount.delete(key);
            syncKey(key);
        }, DEBOUNCE_MS));
    }

    /**
     * Rimuove in blocco un set di chiavi dal LS. Usato post-emissione
     * (il backend ha già DELETE-ato le righe lato DB).
     */
    function clearForKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return;
        const s = readLS();
        let changed = false;
        for (const k of keys) {
            if (s[k]) { delete s[k]; changed = true; }
            if (timers.has(k)) { clearTimeout(timers.get(k)); timers.delete(k); }
            retryAt.delete(k);
            retryCount.delete(k);
        }
        if (changed) {
            writeLS(s);
            recomputeStatus();
        }
    }

    /**
     * Flush sincrono via sendBeacon su pagehide. Last-chance: se fallisce,
     * le entry restano in LS con synced=false e verranno retentate al reload.
     */
    function flushAllBeacon() {
        if (!lsKey || !elaborazioneId) return;
        const s = readLS();
        const ops = [];
        Object.keys(s).forEach(k => {
            const e = s[k];
            if (!e || e.synced === true) return;
            const parsed = parseKey(k);
            if (e.deleted) {
                ops.push({
                    action: 'delete',
                    fornitore_codice: parsed.fornitore_codice,
                    codart: parsed.codart,
                    fase: parsed.fase,
                    magaz: parsed.magaz
                });
            } else {
                ops.push({
                    action: 'upsert',
                    fornitore_codice: parsed.fornitore_codice,
                    codart: parsed.codart,
                    fase: parsed.fase,
                    magaz: parsed.magaz,
                    quantita_confermata: e.quantita,
                    prezzo_override: e.prezzo
                });
            }
        });
        if (ops.length === 0) return;
        try {
            const blob = new Blob(
                [JSON.stringify({ elaborazione_id: elaborazioneId, ops })],
                { type: 'application/json' }
            );
            navigator.sendBeacon(API + '/conferma-pending/flush-batch', blob);
        } catch (e) {
            console.warn('[PendingSync] sendBeacon fallito:', e.message);
        }
    }

    // Pagehide handler — registrato una sola volta.
    window.addEventListener('pagehide', flushAllBeacon);
    // beforeunload come backup (Safari iOS non sempre fa pagehide)
    window.addEventListener('beforeunload', flushAllBeacon);

    return {
        init, hydrateFromDB,
        upsert, remove, clearForKeys,
        flushAllBeacon,
        getState, onStateChange
    };
})();
