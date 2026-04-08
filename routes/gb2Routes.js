const express = require('express');
const path = require('path');
const fs = require('fs');
const { getPoolMRP, getPoolProd, sql, getActiveProfile, isProduction, switchToTest, switchToProduction, setTestHasRiep, getTestHasRiep, PRODUCTION_PROFILE } = require('../config/db-gb2');
const { encrypt, decrypt } = require('../config/crypto');
const smtp = require('../config/smtp-gb2');
const { authenticateToken } = require('../middlewares/auth');

// ============================================================
// DEPLOY E NAMING DEGLI OGGETTI SQL
// ============================================================

// Calcola il prefisso cross-database per raggiungere UJET11 nelle SP.
// - Produzione (SP su MRP@163, UJET11 su BCUBE2): [BCUBE2].[UJET11].[dbo]
// - Prova (SP su MRP@163, UJET11 su server prova): [SERVER_PROVA].[UJET11].[dbo]
function getUjet11Ref(profile) {
    if (!profile) return '[UJET11].[dbo]';
    const linkedServer = (profile.server_ujet11 || profile.server || '').trim();
    const dbName = (profile.database_ujet11 || 'UJET11').trim();
    if (linkedServer) {
        return `[${linkedServer}].[${dbName}].[dbo]`;
    }
    return `[${dbName}].[dbo]`;
}

// Restituisce il suffisso SP per un profilo: '' per produzione, '_T3' per test ID 3
function getSpSuffix(profile) {
    if (!profile || !profile._testDbId) return '';
    return '_T' + profile._testDbId;
}

// Nome completo della SP dato il nome base e il profilo attivo
function getSpName(baseName, profile) {
    return baseName + getSpSuffix(profile);
}

// Esegue i batch SQL di un file
async function executeSqlFile(pool, filePath, replacements) {
    let sqlText = fs.readFileSync(filePath, 'utf-8');
    for (const [placeholder, value] of Object.entries(replacements || {})) {
        sqlText = sqlText.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    const batches = sqlText.split(/^\s*GO\s*$/im).filter(b => b.trim());
    for (const batch of batches) {
        if (batch.trim()) {
            await pool.request().batch(batch);
        }
    }
}

/**
 * Deploy oggetti SQL di produzione — su MRP@163 e GB2@163.
 * SP con prefisso [BCUBE2].[UJET11].[dbo], nomi senza suffisso.
 */
async function deployProductionObjects(poolProd) {
    const sqlDir = path.join(__dirname, '..', 'sql', 'mrp');
    const profile = getActiveProfile();
    const ujet11Ref = getUjet11Ref(profile);
    const results = [];

    // Tabelle GB2 (sempre su pool produzione)
    for (const file of ['create_test_profiles.sql', 'create_user_preferences.sql']) {
        const filePath = path.join(sqlDir, file);
        if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
        try {
            await executeSqlFile(poolProd, filePath);
            results.push({ file, status: 'ok' });
        } catch (err) { results.push({ file, status: 'error', error: err.message }); }
    }

    // Tabelle e SP su MRP (pool produzione)
    for (const file of ['create_ordini_emessi.sql', 'usp_CreaOrdineFornitore.sql', 'usp_AggiornaStatoInvioOrdine.sql']) {
        const filePath = path.join(sqlDir, file);
        if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
        try {
            await executeSqlFile(poolProd, filePath, { '{{UJET11_REF}}': ujet11Ref });
            results.push({ file, status: 'ok', ujet11Ref });
        } catch (err) { results.push({ file, status: 'error', error: err.message }); }
    }

    return results;
}

/**
 * Deploy oggetti SQL per un profilo di prova.
 * - SP su MRP@163 con suffisso _T{id} e prefisso [SERVER_PROVA].[UJET11].[dbo]
 * - Tabella ordini_emessi su UJET11@server_prova (pool test)
 * Restituisce anche il flag hasRiep (se dbo.Riep esiste nel server di prova).
 */
async function deployTestObjects(poolProd, poolTest, testProfile) {
    const sqlDir = path.join(__dirname, '..', 'sql', 'mrp');
    const suffix = '_T' + testProfile._testDbId;
    // Per le SP: il server di prova come linked server, UJET11 come database
    const ujet11Ref = `[${testProfile.server}].[${testProfile.database_ujet11 || 'UJET11'}].[dbo]`;
    const results = [];

    // 1. Deploy ordini_emessi su UJET11 del server di prova (pool test)
    const oeFile = path.join(sqlDir, 'create_ordini_emessi.sql');
    if (fs.existsSync(oeFile)) {
        try {
            // Adatta: la tabella va su UJET11 di prova, non MRP
            let oeSql = fs.readFileSync(oeFile, 'utf-8');
            // Rimuovi eventuali prefissi [MRP]. — la tabella va nel DB corrente (UJET11)
            oeSql = oeSql.replace(/\[MRP\]\.\[dbo\]/g, '[dbo]');
            const batches = oeSql.split(/^\s*GO\s*$/im).filter(b => b.trim());
            for (const b of batches) { if (b.trim()) await poolTest.request().batch(b); }
            results.push({ file: 'create_ordini_emessi.sql', status: 'ok', target: 'test_ujet11' });
        } catch (err) { results.push({ file: 'create_ordini_emessi.sql', status: 'error', error: err.message }); }
    }

    // 2. Deploy SP su MRP@163 (pool produzione) con suffisso e prefisso server prova
    for (const file of ['usp_CreaOrdineFornitore.sql', 'usp_AggiornaStatoInvioOrdine.sql']) {
        const filePath = path.join(sqlDir, file);
        if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
        try {
            let sqlText = fs.readFileSync(filePath, 'utf-8');
            sqlText = sqlText.replace(/\{\{UJET11_REF\}\}/g, ujet11Ref);
            // Rinomina la SP con il suffisso: usp_NomeSP → usp_NomeSP_T{id}
            sqlText = sqlText.replace(
                /usp_CreaOrdineFornitore/g, 'usp_CreaOrdineFornitore' + suffix
            );
            sqlText = sqlText.replace(
                /usp_AggiornaStatoInvioOrdine/g, 'usp_AggiornaStatoInvioOrdine' + suffix
            );
            const batches = sqlText.split(/^\s*GO\s*$/im).filter(b => b.trim());
            for (const b of batches) { if (b.trim()) await poolProd.request().batch(b); }
            results.push({ file, status: 'ok', spSuffix: suffix, ujet11Ref });
        } catch (err) { results.push({ file, status: 'error', error: err.message }); }
    }

    // 3. Verifica se dbo.Riep esiste nel server di prova
    let hasRiep = false;
    try {
        const riepCheck = await poolTest.request()
            .query("SELECT 1 AS ok FROM sys.objects WHERE name='Riep' AND type IN ('U','V')");
        hasRiep = riepCheck.recordset.length > 0;
    } catch (_) {}

    return { results, hasRiep };
}

/**
 * Rimuove le SP di un profilo di prova eliminato (pulizia).
 */
async function dropTestSPs(poolProd, testDbId) {
    const suffix = '_T' + testDbId;
    const spNames = ['usp_CreaOrdineFornitore' + suffix, 'usp_AggiornaStatoInvioOrdine' + suffix];
    for (const sp of spNames) {
        try {
            await poolProd.request().batch(
                `IF EXISTS (SELECT 1 FROM sys.objects WHERE name='${sp}' AND type='P') DROP PROCEDURE dbo.[${sp}]`
            );
        } catch (_) {}
    }
}

function createGb2Routes({ io, skipAuth } = {}) {
    const router = express.Router();
    const authMiddleware = skipAuth ? (req, res, next) => next() : authenticateToken;

// ============================================================
// API: GESTIONE PROFILI CONNESSIONE DB
// Produzione: hardcoded da .env (PRODUCTION_PROFILE)
// Prova: per operatore, da [GB2].[dbo].[TestProfiles]
// ============================================================

// Helper: legge IDUser dalla sessione (o default per skipAuth/dev)
// Pool per query su Riep: usa produzione se in prova senza Riep locale
async function getPoolRiep(userId) {
    if (isProduction(userId) || getTestHasRiep(userId)) return getPoolMRP(userId);
    return getPoolProd();
}

function getUserId(req) {
    return (req.user && req.user.IDUser) || 0;
}

// Profilo attivo (usato dal frontend per il badge)
router.get('/db/active-profile', authMiddleware, (req, res) => {
    try {
        res.json(getActiveProfile(getUserId(req)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lista profili dell'operatore: produzione (sempre) + i suoi profili di prova dal DB
router.get('/db/profiles', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const poolProd = await getPoolProd();

        // Profilo produzione (senza password)
        const { password: _, ...prodSafe } = PRODUCTION_PROFILE;
        const profiles = [prodSafe];

        // Profili di prova dell'operatore
        const result = await poolProd.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT ID, IDUser, ProfileLabel, Server, DatabaseMRP, DatabaseUJET11,
                           DbUser, EmailProva, Color, IsActive, CreatedAt, UpdatedAt
                    FROM [GB2].[dbo].[TestProfiles]
                    WHERE IDUser = @userId
                    ORDER BY ProfileLabel`);

        for (const row of result.recordset) {
            profiles.push({
                id: 'test_' + row.ID,
                _dbId: row.ID,
                label: row.ProfileLabel,
                server: row.Server,
                database_mrp: row.DatabaseMRP,
                database_ujet11: row.DatabaseUJET11,
                user: row.DbUser,
                email_prova: row.EmailProva || '',
                color: row.Color || '#16a34a',
                is_active: !!row.IsActive,
                ambiente: 'prova'
            });
        }

        res.json(profiles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Switch a produzione
router.post('/db/switch-production', authMiddleware, async (req, res) => {
    try {
        const profile = await switchToProduction(getUserId(req));
        res.json({ success: true, activeProfile: profile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Switch a profilo di prova (per ID dalla tabella TestProfiles)
router.post('/db/switch-test', authMiddleware, async (req, res) => {
    try {
        const { testProfileId } = req.body;
        if (!testProfileId) return res.status(400).json({ error: 'testProfileId richiesto' });

        const userId = getUserId(req);
        const poolProd = await getPoolProd();

        // Leggi il profilo dal DB (inclusa password crittata)
        const result = await poolProd.request()
            .input('id', sql.Int, testProfileId)
            .input('userId', sql.Int, userId)
            .query(`SELECT * FROM [GB2].[dbo].[TestProfiles]
                    WHERE ID = @id AND IDUser = @userId`);

        if (!result.recordset.length) {
            return res.status(404).json({ error: 'Profilo di prova non trovato' });
        }

        const row = result.recordset[0];
        const decryptedPassword = decrypt(row.DbPassword);

        const testProfile = {
            id: 'test_' + row.ID,
            _testDbId: row.ID,
            label: row.ProfileLabel,
            server: row.Server,
            database_mrp: row.DatabaseMRP,
            database_ujet11: row.DatabaseUJET11,
            user: row.DbUser,
            password: decryptedPassword,
            color: row.Color || '#16a34a',
            email_prova: row.EmailProva || ''
        };

        const uid = getUserId(req);
        const profile = await switchToTest(uid, testProfile);

        // Deploy SP suffissate su MRP@163 + ordini_emessi su UJET11@prova
        const warnings = [];
        try {
            const poolTest = await getPoolMRP(uid); // ora punta a UJET11 del server di prova
            const deploy = await deployTestObjects(poolProd, poolTest, testProfile);
            setTestHasRiep(uid, deploy.hasRiep);
            console.log('[GB2] Deploy test objects per profilo T' + row.ID + ':', deploy.results.map(r => `${r.file}: ${r.status}`).join(', '), '| hasRiep:', deploy.hasRiep);
            if (!deploy.hasRiep) {
                warnings.push('La tabella dbo.Riep non esiste nel server di prova. I grafici consumi/previsioni useranno i dati di produzione.');
            }
        } catch (deployErr) {
            console.warn('[GB2] Deploy test objects non riuscito:', deployErr.message);
            warnings.push('Deploy oggetti di prova non riuscito: ' + deployErr.message);
        }

        // Aggiorna IsActive nel DB
        await poolProd.request()
            .input('activeId', sql.Int, testProfileId)
            .input('userId2', sql.Int, userId)
            .query(`UPDATE [GB2].[dbo].[TestProfiles] SET IsActive = 0 WHERE IDUser = @userId2;
                    UPDATE [GB2].[dbo].[TestProfiles] SET IsActive = 1 WHERE ID = @activeId`);

        res.json({ success: true, activeProfile: profile, warnings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crea profilo di prova
router.post('/db/profiles', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { label, server, database_mrp, database_ujet11, user, password,
                email_prova, color } = req.body;

        if (!label || !server || !user || !password) {
            return res.status(400).json({ error: 'label, server, user e password sono obbligatori' });
        }

        const encPassword = encrypt(password);

        const poolProd = await getPoolProd();
        const result = await poolProd.request()
            .input('userId', sql.Int, userId)
            .input('label', sql.VarChar(100), label)
            .input('server', sql.VarChar(100), server)
            .input('dbMrp', sql.VarChar(50), database_mrp || 'MRP')
            .input('dbUjet', sql.VarChar(50), database_ujet11 || 'UJET11')
            .input('dbUser', sql.VarChar(50), user)
            .input('dbPass', sql.VarBinary(512), encPassword)
            .input('emailProva', sql.VarChar(255), email_prova || null)
            .input('color', sql.VarChar(20), color || '#16a34a')
            .query(`INSERT INTO [GB2].[dbo].[TestProfiles]
                    (IDUser, ProfileLabel, Server, DatabaseMRP, DatabaseUJET11,
                     DbUser, DbPassword, EmailProva, Color)
                    OUTPUT INSERTED.ID
                    VALUES (@userId, @label, @server, @dbMrp, @dbUjet,
                            @dbUser, @dbPass, @emailProva, @color)`);

        const newId = result.recordset[0].ID;
        res.json({
            success: true,
            profile: {
                id: 'test_' + newId, _dbId: newId, label, server,
                database_mrp: database_mrp || 'MRP', database_ujet11: database_ujet11 || 'UJET11',
                user, color: color || '#16a34a', email_prova: email_prova || '', ambiente: 'prova'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aggiorna profilo di prova
router.put('/db/profiles/:id', authMiddleware, async (req, res) => {
    try {
        const dbId = parseInt(req.params.id, 10);
        const userId = getUserId(req);
        const poolProd = await getPoolProd();

        // Verifica che il profilo appartenga all'utente
        const check = await poolProd.request()
            .input('id', sql.Int, dbId)
            .input('userId', sql.Int, userId)
            .query('SELECT ID, DbPassword FROM [GB2].[dbo].[TestProfiles] WHERE ID = @id AND IDUser = @userId');

        if (!check.recordset.length) {
            return res.status(404).json({ error: 'Profilo non trovato' });
        }

        const existing = check.recordset[0];
        const { label, server, database_mrp, database_ujet11, user, password,
                email_prova, color } = req.body;

        // Se password vuota, mantieni quella esistente
        const encPassword = (password && password.trim()) ? encrypt(password) : existing.DbPassword;

        await poolProd.request()
            .input('id', sql.Int, dbId)
            .input('label', sql.VarChar(100), label)
            .input('server', sql.VarChar(100), server)
            .input('dbMrp', sql.VarChar(50), database_mrp || 'MRP')
            .input('dbUjet', sql.VarChar(50), database_ujet11 || 'UJET11')
            .input('dbUser', sql.VarChar(50), user)
            .input('dbPass', sql.VarBinary(512), encPassword)
            .input('emailProva', sql.VarChar(255), email_prova || null)
            .input('color', sql.VarChar(20), color || '#16a34a')
            .query(`UPDATE [GB2].[dbo].[TestProfiles]
                    SET ProfileLabel = @label, Server = @server,
                        DatabaseMRP = @dbMrp, DatabaseUJET11 = @dbUjet,
                        DbUser = @dbUser, DbPassword = @dbPass,
                        EmailProva = @emailProva, Color = @color,
                        UpdatedAt = GETDATE()
                    WHERE ID = @id`);

        res.json({
            success: true,
            profile: {
                id: 'test_' + dbId, _dbId: dbId, label, server,
                database_mrp: database_mrp || 'MRP', database_ujet11: database_ujet11 || 'UJET11',
                user, color: color || '#16a34a', email_prova: email_prova || '', ambiente: 'prova'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Elimina profilo di prova
router.delete('/db/profiles/:id', authMiddleware, async (req, res) => {
    try {
        const dbId = parseInt(req.params.id, 10);
        const userId = getUserId(req);
        const poolProd = await getPoolProd();

        const result = await poolProd.request()
            .input('id', sql.Int, dbId)
            .input('userId', sql.Int, userId)
            .query('DELETE FROM [GB2].[dbo].[TestProfiles] WHERE ID = @id AND IDUser = @userId');

        if (!result.rowsAffected[0]) {
            return res.status(404).json({ error: 'Profilo non trovato' });
        }

        // Pulizia: droppa le SP suffissate di questo profilo
        try { await dropTestSPs(poolProd, dbId); } catch (_) {}

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test connessione (senza switchare)
router.post('/db/test-connection', authMiddleware, async (req, res) => {
    let testPool = null;
    try {
        const { server, database_mrp, user, password } = req.body;
        if (!server || !user || !password) {
            return res.status(400).json({ success: false, message: 'server, user e password richiesti' });
        }

        testPool = new sql.ConnectionPool({
            server, database: database_mrp || 'MRP', user, password,
            options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
            connectionTimeout: 5000
        });
        await testPool.connect();
        await testPool.request().query('SELECT 1 AS ok');
        res.json({ success: true, message: 'Connessione riuscita' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    } finally {
        if (testPool) { try { await testPool.close(); } catch(e) {} }
    }
});

// ============================================================
// API 1: RICERCA ARTICOLI (per le 3 combo della maschera parametri)
// Traduzione di: QryArticolo
// Serve la combo Cod.Articolo, Cod.Articolo Alt, Descr.Articolo
// ============================================================
router.get('/articoli/search', authMiddleware, async (req, res) => {
    try {
        const { q, field } = req.query; // field: 'codart' | 'codalt' | 'descr'
        const pool = await getPoolMRP(getUserId(req));

        let where = '';
        if (q && q.trim()) {
            const term = q.trim();
            if (field === 'codart') {
                where = `WHERE a.ar_codart LIKE @term + '%'`;
            } else if (field === 'codalt') {
                where = `WHERE a.ar_codalt LIKE '%' + @term + '%'`;
            } else {
                where = `WHERE a.ar_descr LIKE '%' + @term + '%'`;
            }
        }

        const result = await pool.request()
            .input('term', sql.NVarChar, q ? q.trim() : '')
            .query(`
                SELECT TOP 50
                    a.ar_codart,
                    a.ar_codalt,
                    a.ar_descr,
                    a.ar_tipo,
                    a.ar_desint
                FROM dbo.artico a
                ${where}
                ORDER BY a.ar_descr
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ricerca articoli:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 2: FASI DI UN ARTICOLO (per la combo Fase)
// Traduzione della Sub load_fasi() VBA in frmParRMP
// ============================================================
router.get('/articoli/:codart/fasi', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolMRP(getUserId(req));
        const result = await pool.request()
            .input('codart', sql.NVarChar, req.params.codart)
            .query(`
                SELECT af_codart, af_fase, af_descr
                FROM dbo.artfasi
                WHERE af_codart = @codart
                ORDER BY af_fase DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore fasi articolo:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 3: MAGAZZINI DISPONIBILI (per la combo Magazzino)
// ============================================================
router.get('/magazzini', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolMRP(getUserId(req));
        const result = await pool.request()
            .query(`
                SELECT tb_codmaga, tb_desmaga
                FROM dbo.tabmaga
                ORDER BY tb_codmaga
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore magazzini:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Carica righe MRP (magazzino + totali) per un singolo articolo.
 * Usata dal caricamento iniziale e dall'expand on-demand.
 */
async function caricaMRP(pool, codart, filtroMagaz, filtroFase) {
    const righe = [];

    let filtroSQL = '';
    const artproReq = pool.request().input('codart', sql.NVarChar, codart);
    if (filtroMagaz) {
        artproReq.input('magaz', sql.SmallInt, parseInt(filtroMagaz, 10));
        filtroSQL += ' AND ap.ap_magaz = @magaz';
    }
    if (filtroFase) {
        artproReq.input('fase', sql.SmallInt, parseInt(filtroFase, 10));
        filtroSQL += ' AND ap.ap_fase = @fase';
    }

    const artproRes = await artproReq.query(`
        SELECT
            ap.ap_codart, ap.ap_magaz, ap.ap_fase,
            ap.ap_esist, ap.ap_prenot, ap.ap_ordin, ap.ap_impeg,
            tm.tb_desmaga AS desc_magazzino,
            COALESCE(af.af_descr, '') AS desc_fase,
            a.ar_unmis, a.ar_inesaur
        FROM dbo.artpro ap
        LEFT JOIN dbo.tabmaga tm ON ap.ap_magaz = tm.tb_codmaga
        LEFT JOIN dbo.artfasi af ON ap.ap_codart = af.af_codart AND ap.ap_fase = af.af_fase
        LEFT JOIN dbo.artico a ON ap.ap_codart = a.ar_codart
        WHERE ap.ap_codart = @codart ${filtroSQL}
        ORDER BY ap.ap_magaz, ap.ap_fase
    `);

    // Leggi quantita emesse dalla nostra app (ordini_emessi su MRP@163)
    // per aggiornare il campo "ordinato" oltre lo snapshot di BCube.
    // Usa sempre getPoolProd() perche' ordini_emessi risiede solo in MRP, mai in UJET11 di prova.
    let emessiPerMagFase = new Map(); // key "magaz_fase" -> somma quantita_ordinata
    try {
        const poolEmessi = await getPoolProd();
        const emRes = await poolEmessi.request()
            .input('codart_em', sql.NVarChar, codart)
            .query(`
                SELECT ol_magaz, ol_fase, SUM(quantita_ordinata) AS qta_emessa
                FROM dbo.ordini_emessi
                WHERE ol_codart = @codart_em
                GROUP BY ol_magaz, ol_fase
            `);
        for (const row of emRes.recordset) {
            emessiPerMagFase.set(`${row.ol_magaz}_${row.ol_fase}`, row.qta_emessa || 0);
        }
    } catch (e) {
        // ordini_emessi non disponibile -- procedi con solo ap_ordin
    }

    // Arricchisci ap_ordin con le quantita emesse dalla nostra app
    for (const ap of artproRes.recordset) {
        const chiave = `${ap.ap_magaz}_${ap.ap_fase}`;
        const qtaEmessa = emessiPerMagFase.get(chiave) || 0;
        if (qtaEmessa > 0) {
            ap.ap_ordin = (ap.ap_ordin || 0) + qtaEmessa;
        }
    }

    let filtroOrdSQL = '';
    const ordReq = pool.request().input('codart', sql.NVarChar, codart);
    if (filtroMagaz) {
        ordReq.input('magaz_ord', sql.SmallInt, parseInt(filtroMagaz, 10));
        filtroOrdSQL += ' AND ol.ol_magaz = @magaz_ord';
    }
    if (filtroFase) {
        ordReq.input('fase_ord', sql.SmallInt, parseInt(filtroFase, 10));
        filtroOrdSQL += ' AND ol.ol_fase = @fase_ord';
    }

    const ordRes = await ordReq.query(`
        SELECT
            ol.ol_codart, ol.ol_magaz, ol.ol_fase,
            ol.ol_tipork, ol.ol_stato,
            MIN(ol.ol_datcons) AS min_datcons,
            SUM(CASE WHEN ol.ol_tipork IN ('H','O') AND ol.ol_stato = 'S' THEN ol.ol_quant ELSE 0 END) AS opc,
            SUM(CASE WHEN ol.ol_tipork IN ('H','O') AND ol.ol_stato <> 'S' THEN ol.ol_quant ELSE 0 END) AS op,
            SUM(CASE WHEN ol.ol_tipork = 'Y' AND ol.ol_stato = 'S' THEN ol.ol_quant ELSE 0 END) AS ipc,
            SUM(CASE WHEN ol.ol_tipork = 'Y' AND ol.ol_stato <> 'S' THEN ol.ol_quant ELSE 0 END) AS ip
        FROM dbo.ordlist ol
        WHERE ol.ol_codart = @codart
          AND ol.ol_tipork IN ('H','O','Y')
          ${filtroOrdSQL}
        GROUP BY ol.ol_codart, ol.ol_magaz, ol.ol_fase, ol.ol_tipork, ol.ol_stato, ol.ol_stasino
        ORDER BY ol.ol_magaz, ol.ol_fase, MIN(ol.ol_datcons)
    `);

    const totaliFase = {};

    for (const ap of artproRes.recordset) {
        const ordiniMagFase = ordRes.recordset.filter(
            o => Number(o.ol_magaz) === Number(ap.ap_magaz)
                && Number(o.ol_fase) === Number(ap.ap_fase)
        );

        if (ordiniMagFase.length === 0) {
            const dispon = (ap.ap_esist || 0) + (ap.ap_ordin || 0) - (ap.ap_impeg || 0);
            righe.push({
                tipo: 'magazzino',
                primaRigaGruppo: true,
                codart: ap.ap_codart,
                magaz: ap.ap_magaz,
                fase: ap.ap_fase,
                descMagazzino: ap.desc_magazzino,
                descFase: ap.desc_fase,
                um: ap.ar_unmis || 'PZ',
                esistenza: ap.ap_esist,
                prenotato: ap.ap_prenot,
                ordinato: ap.ap_ordin,
                impegnato: ap.ap_impeg,
                disponibilita: dispon,
                mostraGiacenze: true,
                dataCons: null,
                opc: 0,
                op: 0,
                ipc: 0,
                ip: 0,
                inesaur: ap.ar_inesaur
            });
        } else {
            const disponBase = (ap.ap_esist || 0) + (ap.ap_ordin || 0) - (ap.ap_impeg || 0);
            ordiniMagFase.forEach((ord, idx) => {
                const isPrima = idx === 0;

                righe.push({
                    tipo: 'magazzino',
                    primaRigaGruppo: isPrima,
                    codart: ap.ap_codart,
                    magaz: ap.ap_magaz,
                    fase: ap.ap_fase,
                    descMagazzino: ap.desc_magazzino,
                    descFase: ap.desc_fase,
                    um: ap.ar_unmis || 'PZ',
                    esistenza: isPrima ? ap.ap_esist : null,
                    prenotato: isPrima ? ap.ap_prenot : null,
                    ordinato: isPrima ? ap.ap_ordin : null,
                    impegnato: isPrima ? ap.ap_impeg : null,
                    disponibilita: disponBase,
                    mostraGiacenze: isPrima,
                    dataCons: ord.min_datcons,
                    opc: ord.opc || 0,
                    op: ord.op || 0,
                    ipc: ord.ipc || 0,
                    ip: ord.ip || 0,
                    inesaur: ap.ar_inesaur
                });
            });
        }

        const fk = ap.ap_fase;
        if (!totaliFase[fk]) {
            totaliFase[fk] = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        }
        const t = totaliFase[fk];
        t.esistenza += (ap.ap_esist || 0);
        t.ordinato += (ap.ap_ordin || 0);
        t.impegnato += (ap.ap_impeg || 0);
        ordiniMagFase.forEach(ord => {
            t.opc += (ord.opc || 0);
            t.op += (ord.op || 0);
            t.ipc += (ord.ipc || 0);
            t.ip += (ord.ip || 0);
        });
    }

    for (const [faseKey, t] of Object.entries(totaliFase)) {
        righe.push({
            tipo: 'totale',
            codart,
            fase: parseInt(faseKey, 10),
            esistenza: t.esistenza,
            ordinato: t.ordinato,
            impegnato: t.impegnato,
            disponibilita: t.esistenza + t.ordinato - t.impegnato,
            opc: t.opc,
            op: t.op,
            ipc: t.ipc,
            ip: t.ip
        });
    }

    const fasiDistinte = Object.keys(totaliFase);
    if (fasiDistinte.length > 1) {
        const crossTot = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        for (const t of Object.values(totaliFase)) {
            crossTot.esistenza += t.esistenza;
            crossTot.ordinato += t.ordinato;
            crossTot.impegnato += t.impegnato;
            crossTot.opc += t.opc;
            crossTot.op += t.op;
            crossTot.ipc += t.ipc;
            crossTot.ip += t.ip;
        }
        righe.push({
            tipo: 'totale-cross-fase',
            codart,
            fase: 'All',
            esistenza: crossTot.esistenza,
            ordinato: crossTot.ordinato,
            impegnato: crossTot.impegnato,
            disponibilita: crossTot.esistenza + crossTot.ordinato - crossTot.impegnato,
            opc: crossTot.opc,
            op: crossTot.op,
            ipc: crossTot.ipc,
            ip: crossTot.ip
        });
    }

    return righe;
}

/** Una riga magazzino aggregata per (magaz, fase) -- necessario per il blocco combinato. */
function normalizzaMagazzinoPerChiave(mrpRighe) {
    const magRows = mrpRighe.filter((r) => r.tipo === 'magazzino');
    const groups = new Map();
    for (const r of magRows) {
        const key = `${Number(r.magaz)}_${Number(r.fase)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    const out = new Map();
    for (const [key, rows] of groups) {
        const first = rows[0];
        let esistenza = 0;
        let ordinato = 0;
        let impegnato = 0;
        for (const row of rows) {
            if (row.mostraGiacenze !== false && row.esistenza != null) {
                esistenza = row.esistenza || 0;
                ordinato = row.ordinato || 0;
                impegnato = row.impegnato || 0;
                break;
            }
        }
        let opc = 0;
        let op = 0;
        let ipc = 0;
        let ip = 0;
        for (const row of rows) {
            opc += row.opc || 0;
            op += row.op || 0;
            ipc += row.ipc || 0;
            ip += row.ip || 0;
        }
        const disponibilita = esistenza + ordinato - impegnato;
        out.set(key, {
            magaz: first.magaz,
            fase: first.fase,
            descMagazzino: first.descMagazzino,
            descFase: first.descFase,
            um: first.um || 'PZ',
            codart: first.codart,
            esistenza,
            ordinato,
            impegnato,
            disponibilita,
            opc,
            op,
            ipc,
            ip,
            inesaur: first.inesaur
        });
    }
    return out;
}

function sortMagFaseKeys(keys) {
    return keys.sort((a, b) => {
        const [ma, fa] = a.split('_').map(Number);
        const [mb, fb] = b.split('_').map(Number);
        if (ma !== mb) return ma - mb;
        return fa - fb;
    });
}

/**
 * Merge normalizzato esaurimento + sostitutivo -> righe magazzino + totali (stessa logica di caricaMRP).
 */
function costruisciCombinatoRighe(mapEsaur, mapSost, codEsaur, codSost) {
    const codComb = `${codSost}+${codEsaur}`;
    const allKeys = sortMagFaseKeys([...new Set([...mapEsaur.keys(), ...mapSost.keys()])]);
    const magRows = [];
    for (const key of allKeys) {
        const e = mapEsaur.get(key);
        const s = mapSost.get(key);
        const esistenza = (e?.esistenza || 0) + (s?.esistenza || 0);
        const ordinato = (e?.ordinato || 0) + (s?.ordinato || 0);
        const impegnato = (e?.impegnato || 0) + (s?.impegnato || 0);
        const opc = (e?.opc || 0) + (s?.opc || 0);
        const op = (e?.op || 0) + (s?.op || 0);
        const ipc = (e?.ipc || 0) + (s?.ipc || 0);
        const ip = (e?.ip || 0) + (s?.ip || 0);
        const disponibilita = esistenza + ordinato - impegnato;
        const src = e || s;
        magRows.push({
            tipo: 'magazzino',
            primaRigaGruppo: true,
            codart: codComb,
            magaz: src.magaz,
            fase: src.fase,
            descMagazzino: src.descMagazzino,
            descFase: src.descFase,
            um: (s || e).um || 'PZ',
            esistenza,
            ordinato,
            impegnato,
            disponibilita,
            mostraGiacenze: true,
            dataCons: null,
            opc,
            op,
            ipc,
            ip,
            inesaur: 'N',
            etichettaBlocco: 'combinato'
        });
    }

    const totaliFase = {};
    for (const row of magRows) {
        const fk = row.fase;
        if (!totaliFase[fk]) {
            totaliFase[fk] = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        }
        const t = totaliFase[fk];
        t.esistenza += row.esistenza;
        t.ordinato += row.ordinato;
        t.impegnato += row.impegnato;
        t.opc += row.opc;
        t.op += row.op;
        t.ipc += row.ipc;
        t.ip += row.ip;
    }

    const righe = [...magRows];
    for (const [faseKey, t] of Object.entries(totaliFase)) {
        righe.push({
            tipo: 'totale',
            codart: codComb,
            fase: parseInt(faseKey, 10),
            esistenza: t.esistenza,
            ordinato: t.ordinato,
            impegnato: t.impegnato,
            disponibilita: t.esistenza + t.ordinato - t.impegnato,
            opc: t.opc,
            op: t.op,
            ipc: t.ipc,
            ip: t.ip,
            etichettaBlocco: 'combinato',
            labelTotale: 'In Esaur + Sostit TOTALE'
        });
    }

    const fasiDistinte = Object.keys(totaliFase);
    if (fasiDistinte.length > 1) {
        const crossTot = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        for (const t of Object.values(totaliFase)) {
            crossTot.esistenza += t.esistenza;
            crossTot.ordinato += t.ordinato;
            crossTot.impegnato += t.impegnato;
            crossTot.opc += t.opc;
            crossTot.op += t.op;
            crossTot.ipc += t.ipc;
            crossTot.ip += t.ip;
        }
        righe.push({
            tipo: 'totale-cross-fase',
            codart: codComb,
            fase: 'All',
            esistenza: crossTot.esistenza,
            ordinato: crossTot.ordinato,
            impegnato: crossTot.impegnato,
            disponibilita: crossTot.esistenza + crossTot.ordinato - crossTot.impegnato,
            opc: crossTot.opc,
            op: crossTot.op,
            ipc: crossTot.ipc,
            ip: crossTot.ip,
            etichettaBlocco: 'combinato',
            labelTotale: 'In Esaur + Sostit TOTALE'
        });
    }

    return righe;
}

/**
 * Dopo caricaMRP: imposta etichettaBlocco e labelTotale sulle righe (non modificare caricaMRP).
 * labelTotale su totale e totale-cross-fase: "{codart} In Esaurimento TOTALE" / "{codSost} Sostitutivo TOTALE".
 */
function taggaMrpBlocco(mrpRighe, blocco, codLabel) {
    const labelTot = blocco === 'esaurimento'
        ? `${codLabel} In Esaurimento TOTALE`
        : `${codLabel} Sostitutivo TOTALE`;
    for (const r of mrpRighe) {
        r.etichettaBlocco = blocco;
        if (r.tipo === 'totale' || r.tipo === 'totale-cross-fase') {
            r.labelTotale = labelTot;
        }
    }
}

function buildGeneraleTotaleRow(combinatoRighe) {
    const cross = combinatoRighe.find((r) => r.tipo === 'totale-cross-fase');
    let src = cross;
    if (!src) {
        const totali = combinatoRighe.filter((r) => r.tipo === 'totale');
        src = totali.length ? totali[totali.length - 1] : null;
    }
    if (!src) {
        return {
            tipo: 'generale-totale',
            livello: 0,
            esistenza: 0,
            ordinato: 0,
            impegnato: 0,
            disponibilita: 0,
            opc: 0,
            op: 0,
            ipc: 0,
            ip: 0
        };
    }
    return {
        tipo: 'generale-totale',
        livello: 0,
        esistenza: src.esistenza,
        ordinato: src.ordinato,
        impegnato: src.impegnato,
        disponibilita: src.disponibilita,
        opc: src.opc,
        op: src.op,
        ipc: src.ipc,
        ip: src.ip
    };
}

// ============================================================
// API 4: VISTA PROGRESSIVI -- Caricamento iniziale (solo livello 0 + figli livello 1)
// ============================================================
router.get('/progressivi', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolMRP(getUserId(req));

        const artResult = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT ar_codart, ar_codalt, ar_descr, ar_tipo, ar_desint,
                       ar_polriord, ar_gesfasi, ar_ultfase, ar_scomin, ar_ggrior,
                       ar_gruppo, ar_sostit, ar_sostituito, ar_inesaur, ar_unmis
                FROM dbo.artico
                WHERE ar_codart = @codart
            `);

        if (artResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Articolo non trovato' });
        }
        const articolo = artResult.recordset[0];

        const righe = [];

        const codSostCand = String(articolo.ar_sostit || '').trim();
        const inEsaur = String(articolo.ar_inesaur || '').trim() === 'S';
        let sostitutivo = null;
        if (inEsaur && codSostCand) {
            const sostRes = await pool.request()
                .input('codart', sql.NVarChar, codSostCand)
                .query(`
                    SELECT ar_codart, ar_codalt, ar_descr, ar_tipo, ar_desint,
                           ar_polriord, ar_gesfasi, ar_ultfase, ar_scomin, ar_ggrior,
                           ar_gruppo, ar_sostit, ar_sostituito, ar_inesaur, ar_unmis
                    FROM dbo.artico
                    WHERE ar_codart = @codart
                `);
            if (sostRes.recordset.length > 0) {
                sostitutivo = sostRes.recordset[0];
            }
        }
        const vistaSostitutivo = !!sostitutivo;

        righe.push({
            tipo: 'padre',
            livello: 0,
            codart: articolo.ar_codart,
            codalt: articolo.ar_codalt,
            descr: articolo.ar_descr,
            polriord: getPoliticaRiordino(articolo),
            um: articolo.ar_unmis || 'PZ',
            inesaur: articolo.ar_inesaur,
            ...(vistaSostitutivo ? { etichettaBlocco: 'esaurimento' } : {})
        });

        if (!vistaSostitutivo) {
            const mrpRighe = await caricaMRP(pool, codart, magaz, fase);
            mrpRighe.forEach((r) => { r.livello = 0; righe.push(r); });
        } else {
            const mrpEsaur = await caricaMRP(pool, codart, magaz, fase);
            taggaMrpBlocco(mrpEsaur, 'esaurimento', articolo.ar_codart);
            mrpEsaur.forEach((r) => {
                r.livello = 0;
                righe.push(r);
            });

            righe.push({
                tipo: 'sostitutivo-header',
                livello: 0,
                codart: sostitutivo.ar_codart,
                codalt: sostitutivo.ar_codalt,
                descr: sostitutivo.ar_descr,
                polriord: getPoliticaRiordino(sostitutivo),
                um: sostitutivo.ar_unmis || 'PZ',
                inesaur: sostitutivo.ar_inesaur,
                etichettaBlocco: 'sostitutivo',
                espandibile: false
            });

            const mrpSost = await caricaMRP(pool, sostitutivo.ar_codart, magaz, fase);
            taggaMrpBlocco(mrpSost, 'sostitutivo', sostitutivo.ar_codart);
            mrpSost.forEach((r) => {
                r.livello = 0;
                righe.push(r);
            });

            const normE = normalizzaMagazzinoPerChiave(mrpEsaur);
            const normS = normalizzaMagazzinoPerChiave(mrpSost);
            const combRighe = costruisciCombinatoRighe(
                normE,
                normS,
                articolo.ar_codart,
                sostitutivo.ar_codart
            );
            combRighe.forEach((r) => {
                r.livello = 0;
                righe.push(r);
            });

            righe.push(buildGeneraleTotaleRow(combRighe));
        }

        const figliRes = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT
                    d.md_coddb,
                    d.md_riga,
                    d.md_codfigli,
                    d.md_fasefigli,
                    d.md_quant,
                    d.md_unmis,
                    d.md_quantump,
                    d.md_ump,
                    a.ar_codalt AS figlio_codalt,
                    a.ar_descr AS figlio_descr,
                    a.ar_polriord AS figlio_polriord,
                    a.ar_gesfasi AS figlio_gesfasi,
                    a.ar_scomin AS figlio_scomin,
                    a.ar_ggrior AS figlio_ggrior,
                    a.ar_desint AS figlio_desint,
                    a.ar_inesaur AS figlio_inesaur,
                    a.ar_unmis AS figlio_unmis,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM dbo.movdis sub
                        WHERE sub.md_coddb = d.md_codfigli
                    ) THEN 1 ELSE 0 END AS espandibile,
                    CASE WHEN d.md_dtfival < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS scaduto
                FROM dbo.movdis d
                INNER JOIN dbo.artico a ON d.md_codfigli = a.ar_codart
                WHERE d.md_coddb = @codart
                ORDER BY d.md_riga
            `);

        // Costruiamo un array di Promise per processare tutti i figli in parallelo
        const figliPromises = figliRes.recordset.map(async (f) => {
            const comp = {
                tipo: 'componente',
                livello: 1,
                codart: f.md_codfigli,
                codalt: f.figlio_codalt,
                descr: f.figlio_descr,
                faseDistinta: f.md_fasefigli,
                quantDistinta: f.md_quant,
                umDistinta: f.md_unmis || f.md_ump || 'PZ',
                polriord: getPoliticaRiordino({
                    ar_polriord: f.figlio_polriord,
                    ar_scomin: f.figlio_scomin,
                    ar_ggrior: f.figlio_ggrior,
                    ar_desint: f.figlio_desint
                }),
                um: f.figlio_unmis || 'PZ',
                inesaur: f.figlio_inesaur,
                espandibile: f.espandibile === 1,
                scaduto: f.scaduto === 1
            };

            // Carica i progressivi MRP per questo figlio in parallelo
            const mrpFiglio = await caricaMRP(pool, f.md_codfigli, magaz, fase);
            return { comp, mrp: mrpFiglio };
        });

        // Attendiamo che tutte le query MRP parallele finiscano
        const figliRisultati = await Promise.all(figliPromises);

        // Inseriamo i risultati nell'array righe in ordine (Componente -> Suoi Movimenti MRP)
        for (const res of figliRisultati) {
            righe.push(res.comp);
            res.mrp.forEach(r => {
                r.livello = 1;
                righe.push(r);
            });
        }

        righe[0].espandibile = figliRes.recordset.length > 0;

        const payload = {
            articolo,
            politicaRiordino: getPoliticaRiordino(articolo),
            righe
        };
        if (sostitutivo) payload.sostitutivo = sostitutivo;
        res.json(payload);
    } catch (err) {
        console.error('[API] Errore progressivi:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 4B: ESPANSIONE ON-DEMAND di un nodo della distinta
// ============================================================
router.get('/progressivi/expand', authMiddleware, async (req, res) => {
    try {
        const { codart, livello } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolMRP(getUserId(req));
        const liv = parseInt(livello, 10) || 1;
        const righe = [];

        const mrpRighe = await caricaMRP(pool, codart, '', '');
        mrpRighe.forEach((r) => { r.livello = liv; righe.push(r); });

        const figliRes = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT
                    d.md_codfigli,
                    d.md_riga,
                    d.md_fasefigli,
                    d.md_quant,
                    d.md_unmis,
                    d.md_ump,
                    a.ar_codalt AS figlio_codalt,
                    a.ar_descr AS figlio_descr,
                    a.ar_polriord AS figlio_polriord,
                    a.ar_scomin AS figlio_scomin,
                    a.ar_ggrior AS figlio_ggrior,
                    a.ar_desint AS figlio_desint,
                    a.ar_inesaur AS figlio_inesaur,
                    a.ar_unmis AS figlio_unmis,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM dbo.movdis sub
                        WHERE sub.md_coddb = d.md_codfigli
                    ) THEN 1 ELSE 0 END AS espandibile,
                    CASE WHEN d.md_dtfival < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS scaduto
                FROM dbo.movdis d
                INNER JOIN dbo.artico a ON d.md_codfigli = a.ar_codart
                WHERE d.md_coddb = @codart
                ORDER BY d.md_riga
            `);

        for (const f of figliRes.recordset) {
            righe.push({
                tipo: 'componente',
                livello: liv + 1,
                codart: f.md_codfigli,
                codalt: f.figlio_codalt,
                descr: f.figlio_descr,
                faseDistinta: f.md_fasefigli,
                quantDistinta: f.md_quant,
                umDistinta: f.md_unmis || f.md_ump || 'PZ',
                polriord: getPoliticaRiordino({
                    ar_polriord: f.figlio_polriord,
                    ar_scomin: f.figlio_scomin,
                    ar_ggrior: f.figlio_ggrior,
                    ar_desint: f.figlio_desint
                }),
                um: f.figlio_unmis || 'PZ',
                inesaur: f.figlio_inesaur,
                espandibile: f.espandibile === 1,
                scaduto: f.scaduto === 1
            });
        }

        res.json({ righe });
    } catch (err) {
        console.error('[API] Errore expand:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 6: DETTAGLIO ORDINI/IMPEGNI per un articolo+magazzino+fase
// Traduzione di: qryEstArt_ord del blueprint Access
// Si apre nel modale quando l'utente clicca su una riga della griglia
// ============================================================
router.get('/ordini-dettaglio', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolMRP(getUserId(req));
        const request = pool.request()
            .input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (magaz) {
            request.input('magaz', sql.SmallInt, parseInt(magaz));
            filtri += ' AND mo.mo_magaz = @magaz';
        }
        if (fase) {
            request.input('fase', sql.SmallInt, parseInt(fase));
            filtri += ' AND mo.mo_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                a.ar_codalt,
                mo.mo_tipork,
                mo.mo_codart,
                mo.mo_magaz,
                mo.mo_fase,
                mo.mo_datcons,
                a.ar_descr,
                mo.mo_anno,
                mo.mo_serie,
                mo.mo_numord,
                mo.mo_riga,
                mo.mo_quant,
                mo.mo_quaeva,
                mo.mo_flevas,
                an.an_descr1 AS fornitore,
                mt.cb_modesrk AS desc_tipo,
                a.ar_sostit,
                a.ar_sostituito,
                a.ar_inesaur
            FROM dbo.movord mo
            INNER JOIN dbo.testord t ON mo.mo_tipork = t.td_tipork
                AND mo.mo_anno = t.td_anno AND mo.mo_serie = t.td_serie
                AND mo.mo_numord = t.td_numord
            INNER JOIN dbo.anagra an ON t.td_conto = an.an_conto
            INNER JOIN dbo.artico a ON mo.mo_codart = a.ar_codart
            INNER JOIN dbo.__MOTIPORK mt ON mo.mo_tipork = mt.cb_motipork
            WHERE mo.mo_codart = @codart
              AND mo.mo_tipork IN ('H','O','R','Y')
              AND mo.mo_flevas <> 'S'
              ${filtri}
            ORDER BY mo.mo_tipork, mo.mo_codart, mo.mo_magaz, mo.mo_fase, mo.mo_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-dettaglio:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 6B: DETTAGLIO RMP SUI TOTALI (Generati vs Confermati)
// Traduzione di: qryEstArt_list (legge da ordlist)
// ============================================================
router.get('/ordini-rmp', authMiddleware, async (req, res) => {
    try {
        const { codart, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolMRP(getUserId(req));
        const request = pool.request().input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (fase && fase !== 'All') {
            request.input('fase', sql.SmallInt, parseInt(fase, 10));
            filtri += ' AND ol.ol_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                ol.ol_codart,
                ol.ol_tipork,
                ol.ol_magaz,
                ol.ol_fase,
                ol.ol_datcons,
                ol.ol_oranno AS anno,
                ol.ol_orserie AS serie,
                ol.ol_ornum AS numord,
                ol.ol_orriga AS riga,
                SUM(ol.ol_quant) AS quantita,
                mt.cb_modesrk AS desc_tipo,
                an.an_descr1 AS fornitore,
                ol.ol_stato,
                CASE WHEN ol.ol_stato = 'S' THEN 'Confermato' ELSE 'Generato' END AS conf_gen
            FROM dbo.ordlist ol
            INNER JOIN dbo.__MOTIPORK mt ON ol.ol_tipork = mt.cb_motipork
            LEFT JOIN dbo.anagra an ON ol.ol_conto = an.an_conto
            WHERE ol.ol_codart = @codart
              AND ol.ol_tipork IN ('H','O','R','Y')
              ${filtri}
            GROUP BY ol.ol_codart, ol.ol_magaz, ol.ol_fase, ol.ol_tipork, mt.cb_modesrk,
                     ol.ol_datcons, ol.ol_oranno, ol.ol_orserie, ol.ol_ornum, ol.ol_orriga,
                     an.an_descr1, ol.ol_stato
            ORDER BY ol.ol_tipork, ol.ol_codart, ol.ol_magaz, ol.ol_fase, ol.ol_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-rmp:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 7: ORDINI PRODUZIONE PADRE (per Drill-through sugli impegni)
// Traduzione di: qryEstArt_ordPadre del vecchio Access.
// Dato un articolo + magaz + fase, restituisce gli ordini di produzione
// PADRE che consumano quell'articolo come componente.
// ============================================================
router.get('/ordini-padre', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolMRP(getUserId(req));
        const request = pool.request()
            .input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (magaz) {
            request.input('magaz', sql.SmallInt, parseInt(magaz));
            filtri += ' AND mo.mo_magaz = @magaz';
        }
        if (fase) {
            request.input('fase', sql.SmallInt, parseInt(fase));
            filtri += ' AND mo.mo_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                mo.mo_codart,
                mo.mo_magaz,
                mo.mo_fase,
                a_figlio.ar_codalt AS figlio_codalt,
                a_figlio.ar_descr AS figlio_descr,
                -- Dati dell'ordine PADRE
                mop.mo_tipork  AS padre_tipork,
                mop.mo_anno    AS padre_anno,
                mop.mo_serie   AS padre_serie,
                mop.mo_numord  AS padre_numord,
                mop.mo_riga    AS padre_riga,
                mop.mo_codart  AS padre_codart,
                a_padre.ar_codalt  AS padre_codalt_alt,
                a_padre.ar_descr   AS padre_descr,
                mt.cb_modesrk      AS padre_desc_tipo,
                an.an_descr1       AS padre_fornitore,
                mop.mo_quant   AS padre_quant,
                mop.mo_quaeva  AS padre_quaeva,
                mop.mo_flevas  AS padre_flevas,
                mop.mo_magaz   AS padre_magaz,
                mop.mo_fase    AS padre_fase,
                mop.mo_datcons AS padre_datcons
            FROM dbo.movord mo
            INNER JOIN dbo.movord mop
                ON mo.mo_rigaor    = mop.mo_riga
               AND mo.mo_numordor  = mop.mo_numord
               AND mo.mo_serieor   = mop.mo_serie
               AND mo.mo_annoor    = mop.mo_anno
               AND mo.mo_tiporkor  = mop.mo_tipork
            INNER JOIN dbo.testord t
                ON mop.mo_numord = t.td_numord
               AND mop.mo_serie  = t.td_serie
               AND mop.mo_anno   = t.td_anno
               AND mop.mo_tipork = t.td_tipork
            INNER JOIN dbo.anagra an ON t.td_conto = an.an_conto
            INNER JOIN dbo.artico a_figlio ON mo.mo_codart = a_figlio.ar_codart
            INNER JOIN dbo.artico a_padre  ON mop.mo_codart = a_padre.ar_codart
            INNER JOIN dbo.__MOTIPORK mt   ON mop.mo_tipork = mt.cb_motipork
            WHERE mo.mo_codart = @codart
              AND mop.mo_flevas = 'C'
              ${filtri}
            ORDER BY mop.mo_tipork, mop.mo_codart, mop.mo_magaz, mop.mo_fase, mop.mo_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-padre:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 7B: ORDINI PADRE da ordlist (self-join ol_olprogr → ol_progr)
// Usato dal modale RMP. Diverso da /ordini-padre che usa movord.
// ============================================================
router.get('/ordini-padre-rmp', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolMRP(getUserId(req));
        const request = pool.request()
            .input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (magaz) {
            request.input('magaz', sql.SmallInt, parseInt(magaz));
            filtri += ' AND figlio.ol_magaz = @magaz';
        }
        if (fase && fase !== 'All') {
            request.input('fase', sql.SmallInt, parseInt(fase));
            filtri += ' AND figlio.ol_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                figlio.ol_codart,
                figlio.ol_magaz,
                figlio.ol_fase,
                figlio.ol_quant   AS figlio_quant,
                figlio.ol_datcons AS figlio_datcons,
                padre.ol_codart   AS padre_codart,
                padre.ol_tipork   AS padre_tipork,
                padre.ol_magaz    AS padre_magaz,
                padre.ol_fase     AS padre_fase,
                padre.ol_quant    AS padre_quant,
                padre.ol_datcons  AS padre_datcons,
                CASE WHEN padre.ol_stato = 'S' THEN 'Confermato' ELSE 'Generato' END AS padre_conf_gen,
                ar.ar_descr       AS padre_descr,
                ar.ar_codalt      AS padre_codalt,
                mt.cb_modesrk     AS padre_desc_tipo,
                an.an_descr1      AS padre_fornitore
            FROM dbo.ordlist figlio
            INNER JOIN dbo.ordlist padre ON figlio.ol_olprogr = padre.ol_progr
            INNER JOIN dbo.artico ar ON padre.ol_codart = ar.ar_codart
            INNER JOIN dbo.__MOTIPORK mt ON padre.ol_tipork = mt.cb_motipork
            LEFT JOIN dbo.anagra an ON padre.ol_conto = an.an_conto
            WHERE figlio.ol_codart = @codart
              AND figlio.ol_tipork IN ('Y','R')
              ${filtri}
            ORDER BY padre.ol_tipork, padre.ol_codart, padre.ol_magaz, padre.ol_fase, padre.ol_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-padre-rmp:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 8A-multi: CONSUMI SPRINT multi-articolo (esaurimento + sostitutivo)
// ============================================================
router.get('/consumi/sprint-multi', authMiddleware, async (req, res) => {
    try {
        const codarts = String(req.query.codarts || '')
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 20);
        if (!codarts.length) return res.status(400).json({ error: 'codarts richiesto' });

        const pool = await getPoolRiep(getUserId(req));
        const request = pool.request();
        const placeholders = codarts.map((_, i) => `@c${i}`).join(', ');
        codarts.forEach((cod, i) => {
            request.input(`c${i}`, sql.NVarChar, cod);
        });

        const result = await request.query(`
                DECLARE @Oggi DATETIME = GETDATE();
                DECLARE @AnnoCorrente INT = YEAR(@Oggi);

                SELECT
                    ISNULL(SUM(CASE WHEN CONVERT(DATETIME, [Date], 103) >= DATEADD(month, -12, @Oggi) AND CONVERT(DATETIME, [Date], 103) <= @Oggi THEN [Qtà] ELSE 0 END), 0) AS R12,
                    ISNULL(SUM(CASE WHEN YEAR(CONVERT(DATETIME, [Date], 103)) = @AnnoCorrente AND CONVERT(DATETIME, [Date], 103) <= @Oggi THEN [Qtà] ELSE 0 END), 0) AS YTD,
                    ISNULL(SUM(CASE WHEN YEAR(CONVERT(DATETIME, [Date], 103)) = @AnnoCorrente - 1 AND CONVERT(DATETIME, [Date], 103) <= DATEADD(year, -1, @Oggi) THEN [Qtà] ELSE 0 END), 0) AS LYTD
                INTO #TempKPI
                FROM dbo.Riep
                WHERE Codart IN (${placeholders}) AND Tipo_mov IN ('Vendite', 'Scarico_prod');

                SELECT
                    CONVERT(varchar(7), CONVERT(DATETIME, [Date], 103), 126) AS Mese,
                    SUM([Qtà]) AS Totale
                INTO #TempTrend
                FROM dbo.Riep
                WHERE Codart IN (${placeholders})
                  AND Tipo_mov IN ('Vendite', 'Scarico_prod')
                  AND CONVERT(DATETIME, [Date], 103) >= DATEADD(month, -24, @Oggi)
                GROUP BY CONVERT(varchar(7), CONVERT(DATETIME, [Date], 103), 126);

                SELECT * FROM #TempKPI;
                SELECT * FROM #TempTrend ORDER BY Mese;

                DROP TABLE #TempKPI;
                DROP TABLE #TempTrend;
            `);

        const rs = result.recordsets || [];
        const kpi = rs[0] && rs[0][0] ? rs[0][0] : null;
        const trend = Array.isArray(rs[1]) ? rs[1] : [];

        res.json({
            kpi: kpi || { R12: 0, YTD: 0, LYTD: 0 },
            trend
        });
    } catch (err) {
        console.error('[API] Errore consumi sprint-multi:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 8B-multi: CONSUMI MARATHON multi-articolo
// ============================================================
router.get('/consumi/marathon-multi', authMiddleware, async (req, res) => {
    try {
        const codarts = String(req.query.codarts || '')
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 20);
        if (!codarts.length) return res.status(400).json({ error: 'codarts richiesto' });

        const uid = getUserId(req);
        const poolRiep = await getPoolRiep(uid);
        const poolData = await getPoolMRP(uid);
        const placeholders = codarts.map((_, i) => `@c${i}`).join(', ');

        // Query Riep (potrebbe essere su pool produzione)
        const reqRiep = poolRiep.request();
        codarts.forEach((cod, i) => { reqRiep.input(`c${i}`, sql.NVarChar, cod); });
        const riepResult = await reqRiep.query(`
                SELECT
                    CONVERT(varchar(10), CONVERT(DATETIME, [Date], 103), 126) AS DataMov,
                    SUM([Qtà]) AS Qta
                FROM dbo.Riep
                WHERE Codart IN (${placeholders})
                  AND Tipo_mov IN ('Vendite', 'Scarico_prod')
                  AND CONVERT(DATETIME, [Date], 103) >= DATEADD(year, -10, GETDATE())
                GROUP BY CONVERT(varchar(10), CONVERT(DATETIME, [Date], 103), 126)
                ORDER BY DataMov`);

        // Query ordlist (sempre sul pool attivo)
        const reqOrd = poolData.request();
        codarts.forEach((cod, i) => { reqOrd.input(`c${i}`, sql.NVarChar, cod); });
        const ordResult = await reqOrd.query(`
                SELECT
                    CONVERT(varchar(10), ol_datcons, 126) AS DataMov,
                    SUM(ol_quant) AS Qta
                FROM dbo.ordlist
                WHERE ol_codart IN (${placeholders})
                  AND ol_tipork = 'Y'
                  AND ol_datcons >= CAST(GETDATE() AS DATE)
                GROUP BY CONVERT(varchar(10), ol_datcons, 126)
                ORDER BY DataMov`);

        res.json({
            past: riepResult.recordset || [],
            future: ordResult.recordset || []
        });
    } catch (err) {
        console.error('[API] Errore consumi marathon-multi:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 8A: CONSUMI SPRINT (KPI + trend veloce, vista Riep su MRP)
// ============================================================
router.get('/consumi/sprint/:codart', authMiddleware, async (req, res) => {
    try {
        const codart = req.params.codart;
        const pool = await getPoolRiep(getUserId(req));

        const result = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                DECLARE @Oggi DATETIME = GETDATE();
                DECLARE @AnnoCorrente INT = YEAR(@Oggi);

                SELECT
                    ISNULL(SUM(CASE WHEN CONVERT(DATETIME, [Date], 103) >= DATEADD(month, -12, @Oggi) AND CONVERT(DATETIME, [Date], 103) <= @Oggi THEN [Qtà] ELSE 0 END), 0) AS R12,
                    ISNULL(SUM(CASE WHEN YEAR(CONVERT(DATETIME, [Date], 103)) = @AnnoCorrente AND CONVERT(DATETIME, [Date], 103) <= @Oggi THEN [Qtà] ELSE 0 END), 0) AS YTD,
                    ISNULL(SUM(CASE WHEN YEAR(CONVERT(DATETIME, [Date], 103)) = @AnnoCorrente - 1 AND CONVERT(DATETIME, [Date], 103) <= DATEADD(year, -1, @Oggi) THEN [Qtà] ELSE 0 END), 0) AS LYTD
                INTO #TempKPI
                FROM dbo.Riep
                WHERE Codart = @codart AND Tipo_mov IN ('Vendite', 'Scarico_prod');

                SELECT
                    CONVERT(varchar(7), CONVERT(DATETIME, [Date], 103), 126) AS Mese,
                    SUM([Qtà]) AS Totale
                INTO #TempTrend
                FROM dbo.Riep
                WHERE Codart = @codart
                  AND Tipo_mov IN ('Vendite', 'Scarico_prod')
                  AND CONVERT(DATETIME, [Date], 103) >= DATEADD(month, -24, @Oggi)
                GROUP BY CONVERT(varchar(7), CONVERT(DATETIME, [Date], 103), 126);

                SELECT * FROM #TempKPI;
                SELECT * FROM #TempTrend ORDER BY Mese;

                DROP TABLE #TempKPI;
                DROP TABLE #TempTrend;
            `);

        const rs = result.recordsets || [];
        const kpi = rs[0] && rs[0][0] ? rs[0][0] : null;
        const trend = Array.isArray(rs[1]) ? rs[1] : [];

        res.json({
            kpi: kpi || { R12: 0, YTD: 0, LYTD: 0 },
            trend
        });
    } catch (err) {
        console.error('[API] Errore consumi sprint:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 8B: CONSUMI MARATHON (Storico 10 Anni + Impegni Futuri)
// ============================================================
router.get('/consumi/marathon/:codart', authMiddleware, async (req, res) => {
    try {
        const codart = req.params.codart;
        const uid = getUserId(req);
        const poolRiepData = await getPoolRiep(uid);
        const poolData = await getPoolMRP(uid);

        const riepResult = await poolRiepData.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT
                    CONVERT(varchar(10), CONVERT(DATETIME, [Date], 103), 126) AS DataMov,
                    SUM([Qtà]) AS Qta
                FROM dbo.Riep
                WHERE Codart = @codart
                  AND Tipo_mov IN ('Vendite', 'Scarico_prod')
                  AND CONVERT(DATETIME, [Date], 103) >= DATEADD(year, -10, GETDATE())
                GROUP BY CONVERT(varchar(10), CONVERT(DATETIME, [Date], 103), 126)
                ORDER BY DataMov`);

        const ordResult = await poolData.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT
                    CONVERT(varchar(10), ol_datcons, 126) AS DataMov,
                    SUM(ol_quant) AS Qta
                FROM dbo.ordlist
                WHERE ol_codart = @codart
                  AND ol_tipork = 'Y'
                  AND ol_datcons >= CAST(GETDATE() AS DATE)
                GROUP BY CONVERT(varchar(10), ol_datcons, 126)
                ORDER BY DataMov`);

        res.json({
            past: riepResult.recordset || [],
            future: ordResult.recordset || []
        });
    } catch (err) {
        console.error('[API] Errore consumi marathon:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API: PROPOSTA ORDINI FORNITORI (Gestione Lista Ordini / ordlist)
// ============================================================
router.get('/proposta-ordini', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolMRP(getUserId(req));
        const result = await pool.request().query(`
            SELECT
                ol.ol_progr,
                ol.ol_conto                           AS fornitore_codice,
                COALESCE(an.an_descr1, '')            AS fornitore_nome,
                ol.ol_codart,
                COALESCE(a.ar_codalt, '')              AS ar_codalt,
                COALESCE(a.ar_descr, '')               AS ar_descr,
                COALESCE(a.ar_inesaur, 'N')            AS ar_inesaur,
                COALESCE(a.ar_blocco, 'N')             AS ar_blocco,
                COALESCE(a.ar_polriord, '')             AS ar_polriord,
                ol.ol_fase,
                COALESCE(af.af_descr, '')              AS fase_descr,
                ol.ol_datcons,
                COALESCE(ol.ol_unmis, '')               AS ol_unmis,
                ISNULL(ol.ol_colli, 0)                 AS ol_colli,
                COALESCE(ol.ol_ump, '')                AS ol_ump,
                ISNULL(ol.ol_quant, 0)                 AS ol_quant,
                COALESCE(ol.ol_stato, '')               AS ol_stato,
                ISNULL(ol.ol_magaz, 0)                 AS ol_magaz,
                ISNULL(ol.ol_prezzo, 0)                AS ol_prezzo,
                ol.ol_datord                           AS dt_min_ord
            FROM dbo.ordlist ol
            LEFT JOIN dbo.anagra an ON ol.ol_conto = an.an_conto
            LEFT JOIN dbo.artico a ON ol.ol_codart = a.ar_codart
            LEFT JOIN dbo.artfasi af ON ol.ol_codart = af.af_codart AND ol.ol_fase = af.af_fase
            WHERE ol.ol_tipork = 'O'
            ORDER BY ol.ol_conto, ol.ol_codart, ol.ol_datcons
        `);

        // Arricchisci con info emissioni da ordini_emessi (DB MRP)
        let emissioni = [];
        try {
            const poolMRP = await getPoolMRP(getUserId(req));
            const emRes = await poolMRP.request().query(`
                SELECT ol_progr, ord_anno, ord_serie, ord_numord, quantita_ordinata, data_emissione
                FROM dbo.ordini_emessi
            `);
            emissioni = emRes.recordset;
        } catch (e) {
            console.warn('[API] ordini_emessi non disponibile (continuo senza):', e.message);
        }

        // Mappa ol_progr -> emissione
        const emissioniMap = new Map();
        for (const em of emissioni) {
            emissioniMap.set(em.ol_progr, em);
        }

        // Annota ogni riga ordlist con info emissione
        const righe = result.recordset.map(r => {
            const em = emissioniMap.get(r.ol_progr);
            if (em) {
                r.emesso = true;
                r.ord_anno = em.ord_anno;
                r.ord_serie = em.ord_serie;
                r.ord_numord = em.ord_numord;
                r.quantita_ordinata = em.quantita_ordinata;
                r.data_emissione = em.data_emissione;
            } else {
                r.emesso = false;
            }
            return r;
        });

        res.json(righe);
    } catch (err) {
        console.error('[API] Errore proposta-ordini:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper: descrizione politica riordino (traduzione logica Access)
function getPoliticaRiordino(art) {
    const pol = (art.ar_polriord || '').trim().toUpperCase();
    const map = {
        'M': 'a punto di riordino',
        'F': 'fabbisogno puro',
        'L': 'a lotto fisso',
        'N': 'nessuna politica'
    };
    let descr = map[pol] || pol;

    // Aggiungi dettagli scorta minima e lotto se presenti
    if (pol === 'M' && art.ar_scomin) {
        descr += ` (scorta min. ${art.ar_scomin}, lotto ${art.ar_ggrior || 0}, s.lotto 0)`;
    }
    if (pol === 'F') {
        const desint = (art.ar_desint || '').trim();
        if (desint) descr += ` (${desint})`;
    }
    return descr;
}

// ============================================================
// API 5: HEALTH CHECK -- verifica connessione DB
// ============================================================
router.get('/health', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolMRP(getUserId(req));
        const result = await pool.request().query('SELECT 1 AS ok');
        const poolMRP = await getPoolMRP(getUserId(req));
        const resultMRP = await poolMRP.request().query('SELECT 1 AS ok');
        res.json({
            status: 'ok',
            ujet11: result.recordset[0].ok === 1,
            mrp: resultMRP.recordset[0].ok === 1,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// ============================================================
// API 6: USER PREFERENCES (color themes)
// ============================================================

router.get('/user/preferences', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.globalId;
        if (!userId) {
            return res.json({ colorPreset: 'default', customColors: {}, customLabels: {} });
        }
        const pool = await getPoolMRP(getUserId(req));
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query('SELECT ColorPreset, CustomColors, CustomLabels FROM [GB2].[dbo].[UserPreferences] WHERE IDUser = @userId');

        if (result.recordset.length === 0) {
            return res.json({ colorPreset: 'default', customColors: {}, customLabels: {} });
        }

        const row = result.recordset[0];
        let customColors = {};
        let customLabels = {};
        try { customColors = JSON.parse(row.CustomColors || '{}'); } catch (e) {}
        try { customLabels = JSON.parse(row.CustomLabels || '{}'); } catch (e) {}

        res.json({
            colorPreset: row.ColorPreset || 'default',
            customColors,
            customLabels
        });
    } catch (err) {
        console.error('[GB2] Errore GET /user/preferences:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/user/preferences', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.globalId;
        if (!userId) {
            return res.json({ success: true });
        }
        const { colorPreset, customColors, customLabels } = req.body;
        const pool = await getPoolMRP(getUserId(req));

        const colorsJson = JSON.stringify(customColors || {});
        const labelsJson = JSON.stringify(customLabels || {});

        await pool.request()
            .input('userId', sql.Int, userId)
            .input('preset', sql.VarChar(50), colorPreset || 'default')
            .input('colors', sql.NVarChar(sql.MAX), colorsJson)
            .input('labels', sql.NVarChar(sql.MAX), labelsJson)
            .query(`
                MERGE [GB2].[dbo].[UserPreferences] AS target
                USING (SELECT @userId AS IDUser) AS source
                ON target.IDUser = source.IDUser
                WHEN MATCHED THEN
                    UPDATE SET ColorPreset = @preset, CustomColors = @colors, CustomLabels = @labels, UpdatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (IDUser, ColorPreset, CustomColors, CustomLabels, UpdatedAt)
                    VALUES (@userId, @preset, @colors, @labels, GETDATE());
            `);

        res.json({ success: true });
    } catch (err) {
        console.error('[GB2] Errore POST /user/preferences:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API: EMISSIONE ORDINI FORNITORE
// ============================================================

const fs = require('fs');
const { generaPdfOrdine } = require('../utils/pdfOrdine');

// Helper: verifica se una SP esiste nel DB MRP corrente
async function checkSpExists(pool, spName) {
    const r = await pool.request()
        .input('name', sql.NVarChar, spName)
        .query("SELECT 1 AS ok FROM sys.objects WHERE name=@name AND type='P'");
    return r.recordset.length > 0;
}

// Deploy stored procedures manuale
router.post('/deploy-sp', authMiddleware, async (req, res) => {
    try {
        const poolProd = await getPoolProd();
        const uid = getUserId(req);
        if (isProduction(uid)) {
            const results = await deployProductionObjects(poolProd);
            res.json({ success: true, results });
        } else {
            const profile = getActiveProfile(uid);
            const poolTest = await getPoolMRP(uid);
            const deploy = await deployTestObjects(poolProd, poolTest, profile);
            res.json({ success: true, results: deploy.results, hasRiep: deploy.hasRiep });
        }
    } catch (err) {
        res.status(500).json({ error: err.message, detail: 'Errore durante il deploy delle stored procedure' });
    }
});

// Verifica esistenza SP senza fare nulla
router.get('/check-sp', authMiddleware, async (req, res) => {
    try {
        const poolSP = await getPoolProd();
        const uid = getUserId(req);
        const profile = getActiveProfile(uid);
        const spName = getSpName('usp_CreaOrdineFornitore', profile);
        const spExists = await checkSpExists(poolSP, spName);
        // Verifica anche che la tabella ordini_emessi esista (nel pool attivo)
        const poolData = await getPoolMRP(uid);
        const tblResult = await poolData.request().query(
            "SELECT OBJECT_ID('dbo.ordini_emessi', 'U') AS id"
        );
        const tblExists = tblResult.recordset[0].id !== null;
        res.json({ exists: spExists && tblExists });
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

// Emetti un ordine per un singolo fornitore
router.post('/emetti-ordine', authMiddleware, async (req, res) => {
    try {
        const { fornitore_codice, articoli } = req.body;

        if (!fornitore_codice) return res.status(400).json({ error: 'fornitore_codice obbligatorio' });
        if (!Array.isArray(articoli) || articoli.length === 0) return res.status(400).json({ error: 'articoli vuoto' });

        // Le SP vivono sempre su MRP@163 (pool produzione), con suffisso per profili di prova
        const poolSP = await getPoolProd();
        const profile = getActiveProfile(getUserId(req));
        const spName = getSpName('usp_CreaOrdineFornitore', profile);

        // Check SP esiste
        const spExists = await checkSpExists(poolSP, spName);
        if (!spExists) {
            return res.status(409).json({
                error: 'SP_NOT_FOUND',
                sp: spName,
                message: `La stored procedure ${spName} non esiste. Deployare prima con POST /api/mrp/deploy-sp`
            });
        }

        // Chiama la SP
        const { elaborazione_id } = req.body;
        const result = await poolSP.request()
            .input('json_articoli', sql.NVarChar(sql.MAX), JSON.stringify(articoli))
            .input('fornitore_codice', sql.Int, parseInt(fornitore_codice, 10))
            .input('operatore', sql.VarChar(20), 'mrpweb')
            .input('elaborazione_id', sql.VarChar(50), elaborazione_id || '')
            .execute('dbo.' + spName);

        if (!result.recordsets || !result.recordsets[0] || !result.recordsets[0][0]) {
            return res.status(500).json({ error: 'La stored procedure non ha restituito dati' });
        }

        const ordine = result.recordsets[0][0];
        const righeOrdine = result.recordsets[1] || [];

        // Genera PDF (con watermark se in ambiente prova)
        const dbProfile = getActiveProfile(getUserId(req));
        const ambiente = dbProfile.ambiente || 'produzione';
        const pdfBuffer = await generaPdfOrdine(ordine, righeOrdine, { ambiente });

        res.json({
            success: true,
            ambiente,
            ordine: {
                anno: ordine.anno,
                serie: ordine.serie,
                numord: ordine.numord,
                fornitore_codice: ordine.fornitore_codice,
                fornitore_nome: ordine.fornitore_nome,
                fornitore_email: ordine.fornitore_email,
                totale_merce: ordine.totale_merce,
                totale_documento: ordine.totale_documento,
                data_ordine: ordine.data_ordine,
                num_righe: righeOrdine.length
            },
            pdf_base64: pdfBuffer.toString('base64'),
            pdf_filename: `OrdineForn${ordine.anno}${ordine.serie}${String(ordine.numord).padStart(6,'0')}.pdf`
        });
    } catch (err) {
        console.error('[Emetti Ordine] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Emetti ordini per multipli fornitori (batch)
router.post('/emetti-ordini-batch', authMiddleware, async (req, res) => {
    try {
        const { ordini } = req.body; // array di { fornitore_codice, articoli[] }
        if (!Array.isArray(ordini) || ordini.length === 0) {
            return res.status(400).json({ error: 'Nessun ordine da emettere' });
        }

        const poolSP = await getPoolProd();
        const profile = getActiveProfile(getUserId(req));
        const spName = getSpName('usp_CreaOrdineFornitore', profile);
        const spExists = await checkSpExists(poolSP, spName);
        if (!spExists) {
            return res.status(409).json({ error: 'SP_NOT_FOUND', sp: spName });
        }

        const risultati = [];
        for (const ord of ordini) {
            try {
                const result = await poolSP.request()
                    .input('json_articoli', sql.NVarChar(sql.MAX), JSON.stringify(ord.articoli))
                    .input('fornitore_codice', sql.Int, parseInt(ord.fornitore_codice, 10))
                    .input('operatore', sql.VarChar(20), 'mrpweb')
                    .input('elaborazione_id', sql.VarChar(50), req.body.elaborazione_id || '')
                    .execute('dbo.' + spName);

                const ordine = result.recordsets[0][0];
                const righeOrdine = result.recordsets[1] || [];
                const dbProf = getActiveProfile(getUserId(req));
                const pdfBuffer = await generaPdfOrdine(ordine, righeOrdine, { ambiente: dbProf.ambiente || 'produzione' });

                risultati.push({
                    success: true,
                    fornitore_codice: ord.fornitore_codice,
                    fornitore_nome: ordine.fornitore_nome,
                    numord: ordine.numord,
                    anno: ordine.anno,
                    serie: ordine.serie,
                    totale: ordine.totale_documento,
                    email: ordine.fornitore_email,
                    pdf_base64: pdfBuffer.toString('base64'),
                    pdf_filename: `OrdineForn${ordine.anno}${ordine.serie}${String(ordine.numord).padStart(6,'0')}.pdf`
                });
            } catch (err) {
                risultati.push({
                    success: false,
                    fornitore_codice: ord.fornitore_codice,
                    error: err.message
                });
            }
        }

        const successi = risultati.filter(r => r.success).length;
        res.json({
            success: successi > 0,
            totale: ordini.length,
            emessi: successi,
            falliti: ordini.length - successi,
            risultati
        });
    } catch (err) {
        console.error('[Emetti Batch] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Genera/scarica PDF di un ordine gia esistente
router.get('/ordine-pdf/:anno/:serie/:numord', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord } = req.params;
        const pool = await getPoolMRP(getUserId(req));

        // Leggi testata
        const testata = await pool.request()
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .query(`
                SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                       t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                       t.td_datcons, t.td_codpaga, t.td_porto AS porto,
                       t.td_totmerce AS totale_merce, t.td_totdoc AS totale_documento,
                       a.an_descr1 AS fornitore_nome, a.an_indir AS fornitore_indirizzo,
                       a.an_cap AS fornitore_cap, a.an_citta AS fornitore_citta,
                       a.an_prov AS fornitore_prov, a.an_pariva AS fornitore_pariva,
                       a.an_email AS fornitore_email, a.an_faxtlx AS fornitore_fax,
                       t.td_totdoc - t.td_totmerce AS totale_imposta
                FROM dbo.testord t
                LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                  AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
            `);

        if (!testata.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato' });
        }

        // Descrizione pagamento
        let pag_descr = '';
        try {
            const pag = await pool.request()
                .input('codpaga', sql.SmallInt, testata.recordset[0].td_codpaga)
                .query("SELECT tb_descr AS cp_descr FROM dbo.tabpaga WHERE tb_codpaga = @codpaga");
            if (pag.recordset.length) pag_descr = pag.recordset[0].cp_descr || '';
        } catch (_) { /* codpaga potrebbe non esistere */ }

        const ordine = { ...testata.recordset[0], pagamento_descr: pag_descr };

        // Leggi righe
        const righeRes = await pool.request()
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .query(`
                SELECT mo_riga, mo_codart, mo_descr, mo_desint, mo_unmis,
                       mo_quant, mo_prezzo, mo_valore, mo_datcons, mo_fase, mo_magaz
                FROM dbo.movord
                WHERE codditt = 'UJET11' AND mo_tipork = 'O'
                  AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
                ORDER BY mo_riga
            `);

        const pdfBuffer = await generaPdfOrdine(ordine, righeRes.recordset);

        const filename = `OrdineForn${anno}${serie}${String(numord).padStart(6,'0')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[Ordine PDF] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API: CONFIGURAZIONE SMTP PER OPERATORE
// Ogni operatore ha la propria config SMTP in [GB2].[dbo].[UserPreferences]
// ============================================================

// Leggi config SMTP dell'operatore loggato
router.get('/smtp/config', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const poolProd = await getPoolProd();
        const result = await poolProd.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT SmtpHost, SmtpPort, SmtpSecure, SmtpUser,
                           SmtpFromAddress, SmtpFromName
                    FROM [GB2].[dbo].[UserPreferences]
                    WHERE IDUser = @userId`);

        if (!result.recordset.length) {
            return res.json({ configured: false, config: {} });
        }

        const row = result.recordset[0];
        const config = {
            host: row.SmtpHost || '',
            port: row.SmtpPort || 587,
            secure: !!row.SmtpSecure,
            user: row.SmtpUser || '',
            from_address: row.SmtpFromAddress || '',
            from_name: row.SmtpFromName || 'U.Jet s.r.l.'
        };
        res.json({ configured: !!(config.host && config.from_address), config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Salva config SMTP dell'operatore loggato
router.post('/smtp/config', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { host, port, secure, user, password, from_address, from_name } = req.body;

        const encPassword = (password && password.trim()) ? encrypt(password) : null;
        const poolProd = await getPoolProd();

        // Upsert: se la riga UserPreferences esiste, aggiorna; altrimenti crea
        const exists = await poolProd.request()
            .input('userId', sql.Int, userId)
            .query('SELECT 1 FROM [GB2].[dbo].[UserPreferences] WHERE IDUser = @userId');

        if (exists.recordset.length) {
            const req2 = poolProd.request()
                .input('userId', sql.Int, userId)
                .input('host', sql.VarChar(100), host || null)
                .input('port', sql.Int, port || 587)
                .input('secure', sql.Bit, secure ? 1 : 0)
                .input('user', sql.VarChar(100), user || null)
                .input('from_address', sql.VarChar(255), from_address || null)
                .input('from_name', sql.VarChar(100), from_name || 'U.Jet s.r.l.');

            let pwdClause = '';
            if (encPassword) {
                req2.input('pwd', sql.VarBinary(512), encPassword);
                pwdClause = ', SmtpPassword = @pwd';
            }

            await req2.query(`UPDATE [GB2].[dbo].[UserPreferences]
                SET SmtpHost = @host, SmtpPort = @port, SmtpSecure = @secure,
                    SmtpUser = @user, SmtpFromAddress = @from_address,
                    SmtpFromName = @from_name${pwdClause}, UpdatedAt = GETDATE()
                WHERE IDUser = @userId`);
        } else {
            const req2 = poolProd.request()
                .input('userId', sql.Int, userId)
                .input('host', sql.VarChar(100), host || null)
                .input('port', sql.Int, port || 587)
                .input('secure', sql.Bit, secure ? 1 : 0)
                .input('user', sql.VarChar(100), user || null)
                .input('pwd', sql.VarBinary(512), encPassword)
                .input('from_address', sql.VarChar(255), from_address || null)
                .input('from_name', sql.VarChar(100), from_name || 'U.Jet s.r.l.');

            await req2.query(`INSERT INTO [GB2].[dbo].[UserPreferences]
                (IDUser, SmtpHost, SmtpPort, SmtpSecure, SmtpUser, SmtpPassword,
                 SmtpFromAddress, SmtpFromName)
                VALUES (@userId, @host, @port, @secure, @user, @pwd, @from_address, @from_name)`);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test connessione SMTP dell'operatore loggato
router.post('/smtp/test', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const smtpConfig = await smtp.getSmtpConfigForUser(userId);
        if (!smtpConfig || !smtpConfig.host) {
            return res.status(400).json({ success: false, error: 'SMTP non configurato. Configura prima host e credenziali.' });
        }
        const transporter = smtp.createTransporterFromConfig(smtpConfig);
        await transporter.verify();
        res.json({ success: true, message: 'Connessione SMTP verificata con successo' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// API: INVIO EMAIL ORDINE FORNITORE
// ============================================================

router.post('/invia-ordine-email', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord, pdf_base64, pdf_filename, email_override } = req.body;

        if (!anno || !serie || !numord) {
            return res.status(400).json({ error: 'anno, serie e numord sono obbligatori' });
        }

        // Carica config SMTP dell'operatore loggato
        const userId = getUserId(req);
        const smtpConfig = await smtp.getSmtpConfigForUser(userId);
        if (!smtpConfig || !smtpConfig.host || !smtpConfig.from_address) {
            return res.status(409).json({ error: 'SMTP_NOT_CONFIGURED', message: 'SMTP non configurato per il tuo utente. Configura host e email mittente nelle impostazioni.' });
        }

        // Leggi dati ordine per email (fornitore, articoli)
        const pool = await getPoolMRP(getUserId(req));
        const testataRes = await pool.request()
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .query(`
                SELECT t.td_conto, a.an_descr1 AS fornitore_nome, a.an_email AS fornitore_email,
                       t.td_totdoc, t.td_datord
                FROM dbo.testord t
                LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                  AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
            `);

        if (!testataRes.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato nel DB' });
        }

        const ordine = testataRes.recordset[0];
        const emailDest = email_override || ordine.fornitore_email || '';

        if (!emailDest || !emailDest.trim()) {
            return res.status(400).json({ error: 'EMAIL_MISSING', message: 'Il fornitore non ha un indirizzo email configurato in anagrafica' });
        }

        // Splitta email multiple (separatore ;)
        const destinatariReali = emailDest.split(';').map(e => e.trim()).filter(Boolean);

        // Redirect email in ambiente prova
        const dbProfile = getActiveProfile(getUserId(req));
        const ambiente = dbProfile.ambiente || 'produzione';
        let destinatari = destinatariReali;
        let emailReale = destinatariReali.join(', ');

        if (ambiente === 'prova') {
            const emailProva = (dbProfile.email_prova || '').trim();
            if (!emailProva) {
                return res.status(400).json({
                    error: 'EMAIL_PROVA_MISSING',
                    message: 'Ambiente di prova: il campo "Email di prova" non è configurato nel profilo DB. Configurarlo prima di inviare email.'
                });
            }
            destinatari = [emailProva];
        }

        // PDF: usa quello passato dal frontend, o genera al volo
        let pdfBuf;
        if (pdf_base64) {
            pdfBuf = Buffer.from(pdf_base64, 'base64');
        } else {
            // Genera al volo
            const righeRes = await pool.request()
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`
                    SELECT mo_riga, mo_codart, mo_descr, mo_desint, mo_unmis,
                           mo_quant, mo_prezzo, mo_valore, mo_datcons, mo_fase, mo_magaz
                    FROM dbo.movord
                    WHERE codditt = 'UJET11' AND mo_tipork = 'O'
                      AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
                    ORDER BY mo_riga
                `);

            // Necessita dati testata completi per il PDF
            const testataFull = await pool.request()
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`
                    SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                           t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                           t.td_porto AS porto, t.td_totmerce AS totale_merce,
                           t.td_totdoc AS totale_documento,
                           t.td_totdoc - t.td_totmerce AS totale_imposta,
                           a.an_descr1 AS fornitore_nome, a.an_indir AS fornitore_indirizzo,
                           a.an_cap AS fornitore_cap, a.an_citta AS fornitore_citta,
                           a.an_prov AS fornitore_prov, a.an_pariva AS fornitore_pariva,
                           a.an_email AS fornitore_email, a.an_faxtlx AS fornitore_fax
                    FROM dbo.testord t
                    LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                    WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                      AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
                `);

            pdfBuf = await generaPdfOrdine(testataFull.recordset[0], righeRes.recordset, { ambiente });
        }

        const nomeFile = pdf_filename || `OrdineForn${anno}${serie}${String(numord).padStart(6,'0')}.pdf`;
        const prefissoProva = ambiente === 'prova' ? '[PROVA] ' : '';
        const oggetto = `${prefissoProva}NS/ ORDINE ${numord}_${serie} - ${ordine.fornitore_nome || ''}`;

        // Corpo email HTML
        const avvisoProva = ambiente === 'prova'
            ? `<div style="background:#fff3cd; padding:10px 14px; border:1px solid #ffc107; border-radius:4px; margin-bottom:16px;">
                <strong>⚠️ ORDINE DI PROVA</strong> — Il destinatario reale sarebbe stato: <strong>${emailReale}</strong>
               </div>`
            : '';

        const corpoHtml = `
            ${avvisoProva}
            <p>Spett.le <strong>${ordine.fornitore_nome || ''}</strong>,</p>
            <p>in allegato l'ordine d'acquisto n. <strong>${numord}/${serie}</strong>.</p>
            <p>Cordiali saluti,<br><strong>U.Jet s.r.l.</strong></p>
        `;

        // Invia con SMTP dell'operatore
        const transporter = smtp.createTransporterFromConfig(smtpConfig);
        const from = smtpConfig.from_name
            ? `"${smtpConfig.from_name}" <${smtpConfig.from_address}>`
            : smtpConfig.from_address;

        const info = await transporter.sendMail({
            from,
            to: destinatari.join(', '),
            subject: oggetto,
            html: corpoHtml,
            attachments: [{
                filename: nomeFile,
                content: pdfBuf,
                contentType: 'application/pdf'
            }]
        });

        // Aggiorna stato invio nel DB (SP su MRP@163)
        try {
            const poolSP = await getPoolProd();
            const spNameAggiorna = getSpName('usp_AggiornaStatoInvioOrdine', getActiveProfile(getUserId(req)));
            const spExists = await checkSpExists(poolSP, spNameAggiorna);
            if (spExists) {
                await poolSP.request()
                    .input('anno', sql.SmallInt, parseInt(anno, 10))
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, parseInt(numord, 10))
                    .input('stato', sql.VarChar(1), 'S')
                    .execute('dbo.' + spNameAggiorna);
            }
        } catch (errAggiorna) {
            console.warn('[Email] Ordine inviato ma errore aggiornamento stato:', errAggiorna.message);
        }

        const risposta = {
            success: true,
            message_id: info.messageId,
            destinatari,
            ordine: { anno, serie, numord, fornitore: ordine.fornitore_nome }
        };

        if (ambiente === 'prova') {
            risposta.ambiente = 'prova';
            risposta.email_reale = emailReale;
            risposta.email_prova = destinatari.join(', ');
        }

        res.json(risposta);
    } catch (err) {
        console.error('[Invia Email] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

    return router;
}

createGb2Routes.deployProductionObjects = deployProductionObjects;
module.exports = createGb2Routes;
