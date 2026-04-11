/**
 * GB2 Routes — Gestione profili connessione DB
 */
const { encrypt, decrypt } = require('../../config/crypto');
module.exports = function(router, deps) {
    const { sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
            PRODUCTION_PROFILE, authMiddleware, switchToTest, switchToProduction, setTestHasRiep } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const deployTestObjects = helpers.deployTestObjects;
    const dropTestSPs = helpers.dropTestSPs;

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

        // Aggiorna IsActive nel DB (veloce, bloccante)
        await poolProd.request()
            .input('activeId', sql.Int, testProfileId)
            .input('userId2', sql.Int, userId)
            .query(`UPDATE [GB2].[dbo].[TestProfiles] SET IsActive = 0 WHERE IDUser = @userId2;
                    UPDATE [GB2].[dbo].[TestProfiles] SET IsActive = 1 WHERE ID = @activeId`);

        // Rispondi SUBITO — l'operatore non deve attendere il deploy
        res.json({ success: true, activeProfile: profile, warnings: [] });

        // Deploy SP + tabelle in BACKGROUND (fire-and-forget)
        // Le SP servono solo al momento dell'emissione ordine, non adesso.
        (async () => {
            try {
                const poolTest = await getPoolMRP(uid);
                const deploy = await deployTestObjects(poolProd, poolTest, testProfile);
                setTestHasRiep(uid, deploy.hasRiep);
                console.log('[GB2] Deploy background T' + row.ID + ':', deploy.results.map(r => `${r.file}: ${r.status}`).join(', '), '| hasRiep:', deploy.hasRiep);
                if (!deploy.hasRiep) {
                    console.log('[GB2] Riep non presente nel server di prova — grafici consumi useranno dati produzione');
                }
            } catch (deployErr) {
                console.warn('[GB2] Deploy background non riuscito:', deployErr.message);
            }
        })();
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
};
