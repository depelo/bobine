/**
 * Gestione pool DB per GB2 — architettura a 2 pool.
 *
 * POOL 163 (getPool163):
 *   Singleton verso MRP@192.168.0.163. Per tabelle app: ordini_emessi,
 *   [GB2].[dbo].[...], [GA].[dbo].[...]. Non cambia mai.
 *
 * POOL DEST (getPoolDest):
 *   Connessione diretta a UJET11 sul server destinazione dell'operatore.
 *   Cache per server: se piu operatori usano lo stesso server, condividono il pool.
 *   L'operatore sceglie il server (BCUBE2 in produzione, qualsiasi altro in prova).
 *   L'app non distingue "produzione" da "prova" — tratta tutti i server allo stesso modo.
 *
 * Ogni operatore ha il suo stato (profilo attivo, hasRiep) nella Map userStates.
 * Il pool verso il server destinazione e condiviso nella Map poolDestCache.
 */
const sql = require('mssql');

// ============================================================
// CONFIGURAZIONE (da .env)
// ============================================================

const PRODUCTION_PROFILE = {
    id: 'produzione',
    label: 'PRODUZIONE',
    server: process.env.DB_SERVER_MRP || '192.168.0.163',
    server_ujet11: process.env.DB_SERVER_UJET11 || 'BCUBE2',
    database_mrp: process.env.DB_NAME_MRP || 'MRP',
    database_ujet11: process.env.DB_UJET11 || 'UJET11',
    user: process.env.DB_USER_MRP || 'sa',
    password: process.env.DB_PASSWORD_MRP || '',
    color: '#e11d48',
    ambiente: 'produzione'
};

const POOL_MAX_163 = 30;    // Pool app (163) — condiviso tra tutti
const POOL_MAX_DEST = 10;   // Pool destinazione — per server
const POOL_MAX_TEST = 5;    // Fallback per pool individuali
const POOL_IDLE_MS = 30000;
const USER_POOL_TTL = 30 * 60 * 1000; // 30 min inattivita

function buildPoolConfig(server, database, user, password, maxConns) {
    return {
        server, database, user, password,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        pool: { max: maxConns || POOL_MAX_TEST, min: 0, idleTimeoutMillis: POOL_IDLE_MS }
    };
}

// ============================================================
// POOL 163 — singleton (tabelle app: MRP, GB2, GA)
// ============================================================

let pool163 = null;
let pool163Connecting = null;

async function getPool163() {
    if (pool163) return pool163;
    if (pool163Connecting) return pool163Connecting;
    pool163Connecting = (async () => {
        pool163 = await new sql.ConnectionPool(
            buildPoolConfig(PRODUCTION_PROFILE.server, PRODUCTION_PROFILE.database_mrp,
                PRODUCTION_PROFILE.user, PRODUCTION_PROFILE.password, POOL_MAX_163)
        ).connect();
        console.log('[DB] Pool 163 connesso — ' + PRODUCTION_PROFILE.server + '/' + PRODUCTION_PROFILE.database_mrp + ' (max ' + POOL_MAX_163 + ')');
        pool163Connecting = null;
        return pool163;
    })();
    return pool163Connecting;
}

console.log('[DB] Configurazione app:', PRODUCTION_PROFILE.server + '/' + PRODUCTION_PROFILE.database_mrp);
console.log('[DB] Server destinazione default:', PRODUCTION_PROFILE.server_ujet11 + '/' + PRODUCTION_PROFILE.database_ujet11);

// ============================================================
// POOL DEST — cache per server (connessione diretta a UJET11)
// ============================================================

const poolDestCache = new Map(); // key = server hostname, value = { pool, connectingPromise, lastUsed }

async function _getOrCreatePoolDest(server, database, user, password) {
    const key = (server || '').trim().toLowerCase();
    const entry = poolDestCache.get(key);

    if (entry && entry.pool) {
        entry.lastUsed = Date.now();
        return entry.pool;
    }

    if (entry && entry.connectingPromise) {
        return entry.connectingPromise;
    }

    const connectingPromise = (async () => {
        try {
            const pool = await new sql.ConnectionPool(
                buildPoolConfig(server, database, user, password, POOL_MAX_DEST)
            ).connect();
            poolDestCache.set(key, { pool, connectingPromise: null, lastUsed: Date.now() });
            console.log('[DB] Pool Dest connesso — ' + server + '/' + database + ' (max ' + POOL_MAX_DEST + ')');
            return pool;
        } catch (err) {
            poolDestCache.delete(key);
            throw err;
        }
    })();

    poolDestCache.set(key, { pool: null, connectingPromise, lastUsed: Date.now() });
    return connectingPromise;
}

// ============================================================
// STATO PER UTENTE — Map<userId, UserState>
// ============================================================

const userStates = new Map();

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            profile: null,
            hasRiep: false,
            lastActive: Date.now()
        });
    }
    const state = userStates.get(userId);
    state.lastActive = Date.now();
    return state;
}

// ============================================================
// getPoolDest(userId) — pool verso il server destinazione dell'operatore
// ============================================================

async function getPoolDest(userId) {
    const state = getUserState(userId || 0);
    let server, database, user, password;

    if (state.profile) {
        // Operatore con profilo personalizzato (prova)
        server = state.profile.server;
        database = state.profile.database_ujet11 || 'UJET11';
        user = state.profile.user;
        password = state.profile.password;
    } else {
        // Profilo default (server produzione)
        server = (PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim();
        database = (PRODUCTION_PROFILE.database_ujet11 || 'UJET11').trim();
        user = PRODUCTION_PROFILE.user;
        password = PRODUCTION_PROFILE.password;
    }

    return _getOrCreatePoolDest(server, database, user, password);
}

// ============================================================
// PROFILO ATTIVO PER UTENTE
// ============================================================

function getActiveProfile(userId) {
    const state = getUserState(userId || 0);
    if (state.profile) return state.profile;
    // Profilo default: server_ujet11 come "server" per il campo ambiente
    const { password, ...safe } = PRODUCTION_PROFILE;
    return { ...safe, server: PRODUCTION_PROFILE.server_ujet11 };
}

function getServerDest(userId) {
    const profile = getActiveProfile(userId);
    return (profile.server || PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim();
}

function setTestHasRiep(userId, val) {
    const state = getUserState(userId || 0);
    state.hasRiep = !!val;
}

function getTestHasRiep(userId) {
    const state = getUserState(userId || 0);
    return state.hasRiep;
}

// ============================================================
// SWITCH A PROVA
// ============================================================

async function switchToTest(userId, testProfile) {
    const state = getUserState(userId || 0);

    // Testa la connessione al server prova (via poolDestCache)
    const server = testProfile.server;
    const database = testProfile.database_ujet11 || 'UJET11';
    await _getOrCreatePoolDest(server, database, testProfile.user, testProfile.password);

    // Salva profilo attivo
    const { password, DbPassword, ...safe } = testProfile;
    state.profile = { ...safe, user: testProfile.user, password: testProfile.password };
    state.hasRiep = false;

    console.log('[DB] User ' + userId + ' switch a:', testProfile.label, '—', server + '/' + database);
    return { ...safe };
}

// ============================================================
// SWITCH A PRODUZIONE (server default)
// ============================================================

async function switchToProduction(userId) {
    const state = getUserState(userId || 0);
    state.profile = null;
    state.hasRiep = false;

    // Assicura che il pool verso il server default esista
    await getPoolDest(userId);

    console.log('[DB] User ' + userId + ' switch a default (' + PRODUCTION_PROFILE.server_ujet11 + ')');
    const { password, ...safe } = PRODUCTION_PROFILE;
    return { ...safe, server: PRODUCTION_PROFILE.server_ujet11 };
}

// ============================================================
// CLEANUP — chiude pool destinazione non usati
// ============================================================

setInterval(async () => {
    const now = Date.now();
    // Trova quali server sono ancora in uso da almeno un utente
    const serversInUse = new Set();
    for (const [, state] of userStates.entries()) {
        if (state.profile) {
            serversInUse.add((state.profile.server || '').trim().toLowerCase());
        }
    }
    // Il server default e sempre in uso
    serversInUse.add((PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim().toLowerCase());

    // Chiudi pool di server non piu usati da nessuno e inattivi da 30 min
    for (const [key, entry] of poolDestCache.entries()) {
        if (!serversInUse.has(key) && entry.pool && (now - entry.lastUsed) > USER_POOL_TTL) {
            console.log('[DB] Cleanup: chiudo pool dest ' + key + ' (inattivo)');
            try { await entry.pool.close(); } catch (e) {}
            poolDestCache.delete(key);
        }
    }

    // Cleanup userStates inattivi
    for (const [userId, state] of userStates.entries()) {
        if ((now - state.lastActive) > USER_POOL_TTL) {
            state.profile = null;
            state.hasRiep = false;
        }
    }
}, 5 * 60 * 1000);

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function closeAll() {
    if (pool163) { try { await pool163.close(); } catch (e) {} }
    for (const [, entry] of poolDestCache.entries()) {
        if (entry.pool) { try { await entry.pool.close(); } catch (e) {} }
    }
}

process.on('SIGINT', closeAll);
process.on('SIGTERM', closeAll);

module.exports = {
    sql,
    getPool163,
    getPoolDest,
    getActiveProfile,
    getServerDest,
    switchToTest,
    switchToProduction,
    setTestHasRiep,
    getTestHasRiep,
    PRODUCTION_PROFILE
};
