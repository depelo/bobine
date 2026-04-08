/**
 * Gestione pool MRP — architettura per utente.
 *
 * PRODUZIONE: pool fisso condiviso (MRP@163, max 30 connessioni).
 *             Tutti gli operatori in produzione usano lo stesso pool.
 *
 * PROVA: un pool dedicato per ogni utente (UJET11@server_prova, max 5 connessioni).
 *        Lo switch di un operatore NON impatta gli altri.
 *        Pool chiusi automaticamente dopo 30 minuti di inattivita.
 *
 * Ogni operatore ha il suo "stato" (profilo attivo, hasRiep) in userStates Map.
 * Le route passano userId a getPoolMRP(userId) per ottenere il pool giusto.
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

const POOL_MAX_PROD = 30;   // Condiviso tra tutti gli operatori in produzione
const POOL_MAX_TEST = 5;    // Uno per operatore, 1-2 connessioni reali
const POOL_IDLE_MS = 30000; // Timeout connessione inattiva dentro il pool
const USER_POOL_TTL = 30 * 60 * 1000; // 30 minuti: chiudi pool utente se inattivo

function buildPoolConfig(server, database, user, password, maxConns) {
    return {
        server,
        database,
        user,
        password,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        pool: {
            max: maxConns || POOL_MAX_TEST,
            min: 0,
            idleTimeoutMillis: POOL_IDLE_MS
        }
    };
}

// ============================================================
// POOL PRODUZIONE — singleton condiviso (MRP@163)
// ============================================================

let poolProd = null;

async function getPoolProd() {
    if (!poolProd) {
        poolProd = await new sql.ConnectionPool(
            buildPoolConfig(PRODUCTION_PROFILE.server, PRODUCTION_PROFILE.database_mrp,
                PRODUCTION_PROFILE.user, PRODUCTION_PROFILE.password, POOL_MAX_PROD)
        ).connect();
        console.log('[DB] Pool PRODUZIONE connesso — ' + PRODUCTION_PROFILE.server + '/' + PRODUCTION_PROFILE.database_mrp + ' (max ' + POOL_MAX_PROD + ')');
    }
    return poolProd;
}

console.log('[DB] Configurazione produzione:', PRODUCTION_PROFILE.label, '—', PRODUCTION_PROFILE.server + '/' + PRODUCTION_PROFILE.database_mrp);

// ============================================================
// STATO PER UTENTE — Map<userId, UserState>
// ============================================================

/**
 * Ogni utente ha il suo stato:
 * {
 *   pool:       ConnectionPool | null    — pool verso UJET11 del server di prova
 *   profile:    Object | null            — profilo di prova attivo (senza password)
 *   hasRiep:    boolean                  — dbo.Riep esiste nel server di prova?
 *   lastActive: number                   — timestamp ultimo utilizzo (per cleanup)
 *   switching:  boolean                  — mutex per switch in corso
 * }
 */
const userStates = new Map();

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            pool: null,
            profile: null,
            hasRiep: false,
            lastActive: Date.now(),
            switching: false
        });
    }
    const state = userStates.get(userId);
    state.lastActive = Date.now();
    return state;
}

// ============================================================
// POOL PER UTENTE — getPoolMRP(userId)
// ============================================================

/**
 * Restituisce il pool attivo per l'utente:
 * - Se l'utente ha un pool di prova attivo → restituisce quello
 * - Altrimenti → restituisce il pool produzione (condiviso)
 *
 * @param {number} userId — IDUser dell'operatore (0 = default/dev)
 */
async function getPoolMRP(userId) {
    const state = getUserState(userId || 0);
    if (state.switching) throw new Error('Switch profilo in corso, riprova tra un momento');
    if (state.pool) return state.pool;
    return getPoolProd();
}

// ============================================================
// PROFILO ATTIVO PER UTENTE
// ============================================================

function getActiveProfile(userId) {
    const state = getUserState(userId || 0);
    if (state.profile) return state.profile;
    const { password, ...safe } = PRODUCTION_PROFILE;
    return safe;
}

function isProduction(userId) {
    const state = getUserState(userId || 0);
    return !state.profile;
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
// SWITCH A PROVA — per utente
// ============================================================

async function switchToTest(userId, testProfile) {
    const state = getUserState(userId || 0);
    if (state.switching) throw new Error('Switch gia in corso');
    state.switching = true;
    try {
        // Tenta connessione a UJET11 sul server di prova
        const newPool = await new sql.ConnectionPool(
            buildPoolConfig(testProfile.server, testProfile.database_ujet11 || 'UJET11',
                testProfile.user, testProfile.password, POOL_MAX_TEST)
        ).connect();

        // Connessione riuscita — chiudi pool precedente di questo utente
        if (state.pool) { try { await state.pool.close(); } catch(e) {} }
        state.pool = newPool;
        state.hasRiep = false;

        // Salva profilo attivo senza password
        const { password, DbPassword, ...safe } = testProfile;
        state.profile = { ...safe, ambiente: 'prova' };

        console.log('[DB] User ' + userId + ' switch a PROVA:', testProfile.label, '—', testProfile.server);
        return state.profile;
    } catch (err) {
        throw new Error('Impossibile connettersi al server di prova (' + testProfile.server + '): ' + err.message);
    } finally {
        state.switching = false;
    }
}

// ============================================================
// SWITCH A PRODUZIONE — per utente
// ============================================================

async function switchToProduction(userId) {
    const state = getUserState(userId || 0);
    if (state.switching) throw new Error('Switch gia in corso');
    state.switching = true;
    try {
        if (state.pool) { try { await state.pool.close(); } catch(e) {} }
        state.pool = null;
        state.profile = null;
        state.hasRiep = false;

        await getPoolProd();

        console.log('[DB] User ' + userId + ' switch a PRODUZIONE');
        const { password, ...safe } = PRODUCTION_PROFILE;
        return safe;
    } finally {
        state.switching = false;
    }
}

// ============================================================
// CLEANUP — chiude pool inattivi ogni 5 minuti
// ============================================================

setInterval(async () => {
    const now = Date.now();
    for (const [userId, state] of userStates.entries()) {
        if (state.pool && (now - state.lastActive) > USER_POOL_TTL) {
            console.log('[DB] Cleanup: chiudo pool inattivo per user ' + userId + ' (inattivo da ' + Math.round((now - state.lastActive) / 60000) + ' min)');
            try { await state.pool.close(); } catch(e) {}
            state.pool = null;
            state.profile = null;
            state.hasRiep = false;
        }
    }
}, 5 * 60 * 1000); // ogni 5 minuti

// ============================================================
// GRACEFUL SHUTDOWN — chiude tutti i pool
// ============================================================

async function closeAll() {
    if (poolProd) { try { await poolProd.close(); } catch(e) {} }
    for (const [, state] of userStates.entries()) {
        if (state.pool) { try { await state.pool.close(); } catch(e) {} }
    }
}

process.on('SIGINT', closeAll);
process.on('SIGTERM', closeAll);

module.exports = {
    sql,
    getPoolMRP,
    getPoolProd,
    getActiveProfile,
    isProduction,
    switchToTest,
    switchToProduction,
    setTestHasRiep,
    getTestHasRiep,
    PRODUCTION_PROFILE
};
