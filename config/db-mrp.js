/**
 * Gestione pool MRP.
 *
 * PRODUZIONE: configurazione hardcoded da .env, pool fisso.
 * PROVA:      profili per operatore in [GB2].[dbo].[TestProfiles],
 *             pool dinamico creato al momento dello switch.
 *
 * Per ora il pool attivo è globale (condiviso tra tutti gli utenti).
 * TODO: pool per sessione/utente per uso contemporaneo multi-operatore.
 */
const sql = require('mssql');

// ============================================================
// CONFIGURAZIONE PRODUZIONE (da .env, immutabile)
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

function buildPoolConfig(server, database, user, password) {
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
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
}

// ============================================================
// STATO DEL MODULO
// ============================================================

let poolProd = null;   // Pool produzione (lazy, fisso)
let poolTest = null;   // Pool prova (dinamico, un solo attivo alla volta)
let activeMode = 'produzione'; // 'produzione' | 'prova'
let activeTestProfile = null;  // Dati profilo di prova attivo (senza password)
let switching = false;

console.log('[DB] Configurazione produzione:', PRODUCTION_PROFILE.label, '—', PRODUCTION_PROFILE.server + '/' + PRODUCTION_PROFILE.database_mrp);

// ============================================================
// POOL PRODUZIONE (lazy, singleton)
// ============================================================

async function getPoolProd() {
    if (!poolProd) {
        poolProd = await new sql.ConnectionPool(
            buildPoolConfig(PRODUCTION_PROFILE.server, PRODUCTION_PROFILE.database_mrp, PRODUCTION_PROFILE.user, PRODUCTION_PROFILE.password)
        ).connect();
        console.log('[DB] Pool PRODUZIONE connesso —', PRODUCTION_PROFILE.server + '/' + PRODUCTION_PROFILE.database_mrp);
    }
    return poolProd;
}

// ============================================================
// POOL ATTIVO (produzione o prova)
// ============================================================

async function getPoolMRP() {
    if (switching) throw new Error('Switch profilo in corso, riprova tra un momento');
    if (activeMode === 'prova' && poolTest) return poolTest;
    return getPoolProd();
}

// ============================================================
// PROFILO ATTIVO
// ============================================================

function getActiveProfile() {
    if (activeMode === 'prova' && activeTestProfile) {
        return activeTestProfile;
    }
    // Produzione — ritorna senza password
    const { password, ...safe } = PRODUCTION_PROFILE;
    return safe;
}

function isProduction() {
    return activeMode === 'produzione';
}

// Flag: il server di prova ha dbo.Riep? Se no, i consumi leggono da produzione.
let testHasRiep = false;

function setTestHasRiep(val) { testHasRiep = !!val; }
function getTestHasRiep() { return testHasRiep; }

// ============================================================
// SWITCH A PROVA
// ============================================================

/**
 * Switcha a un profilo di prova. Riceve i dati già decriptati.
 * @param {Object} testProfile - { id, label, server, database_mrp, database_ujet11, user, password, color, email_prova, ... }
 */
async function switchToTest(testProfile) {
    if (switching) throw new Error('Switch già in corso');
    switching = true;
    try {
        // Tenta connessione a UJET11 sul server di prova (accesso diretto, senza viste MRP)
        const newPool = await new sql.ConnectionPool(
            buildPoolConfig(testProfile.server, testProfile.database_ujet11 || 'UJET11', testProfile.user, testProfile.password)
        ).connect();

        // Connessione riuscita — chiudi pool prova precedente (se c'è)
        if (poolTest) { try { await poolTest.close(); } catch(e) {} }
        poolTest = newPool;
        activeMode = 'prova';

        // Salva profilo attivo senza password
        const { password, DbPassword, ...safe } = testProfile;
        activeTestProfile = { ...safe, ambiente: 'prova' };

        console.log('[DB] Switch a PROVA:', testProfile.label, '—', testProfile.server);
        return activeTestProfile;
    } catch (err) {
        throw new Error('Impossibile connettersi al server di prova (' + testProfile.server + '): ' + err.message);
    } finally {
        switching = false;
    }
}

// ============================================================
// SWITCH A PRODUZIONE
// ============================================================

async function switchToProduction() {
    if (switching) throw new Error('Switch già in corso');
    switching = true;
    try {
        // Chiudi pool prova
        if (poolTest) { try { await poolTest.close(); } catch(e) {} }
        poolTest = null;
        activeTestProfile = null;
        activeMode = 'produzione';

        // Assicurati che il pool produzione sia attivo
        await getPoolProd();

        console.log('[DB] Switch a PRODUZIONE');
        const { password, ...safe } = PRODUCTION_PROFILE;
        return safe;
    } finally {
        switching = false;
    }
}

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
