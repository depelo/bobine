/**
 * GB2 Routes — Classificazione fornitori + anagrafica + template assegnazioni
 */
module.exports = function(router, deps) {
    const { sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
            PRODUCTION_PROFILE, authMiddleware, getPoolBcube } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const executeSqlFile = helpers.executeSqlFile;
    const path = require('path');
    const fs = require('fs');

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
// API: EMAIL TEMPLATES (CRUD)
// ============================================================

// Lista template visibili all'operatore
router.get('/email-templates', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const includeInactive = req.query.include_inactive === '1';

        let whereActive = includeInactive ? '' : 'AND t.IsActive = 1';

        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT t.ID as id, t.IDUser as idUser, t.Nome as nome, t.Oggetto as oggetto,
                       t.Corpo as corpo, t.Lingua as lingua, t.IsDefault as isDefault,
                       t.IsSystem as isSystem, t.IsActive as isActive, t.Ordine as ordine,
                       t.FornitoreCode as fornitoreCode,
                       u.Name AS nomeOperatore
                FROM [GB2].[dbo].[EmailTemplates] t
                LEFT JOIN [GA].[dbo].[Users] u ON t.IDUser = u.IDUser
                WHERE (t.IsSystem = 1 OR t.IDUser IS NOT NULL) ${whereActive}
                ORDER BY t.IsSystem DESC, t.FornitoreCode ASC, t.Ordine ASC, t.Nome ASC
            `);

        // Aggiunge flag isMine per il frontend
        const templates = result.recordset.map(t => ({
            ...t,
            isMine: t.idUser === userId
        }));
        res.json({ templates });
    } catch (err) {
        console.error('[Email Templates] Errore lista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Singolo template per ID
router.get('/email-templates/:id', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const result = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`
                SELECT t.ID as id, t.IDUser as idUser, t.Nome as nome, t.Oggetto as oggetto,
                       t.Corpo as corpo, t.Lingua as lingua, t.IsDefault as isDefault,
                       t.IsSystem as isSystem, t.IsActive as isActive,
                       t.FornitoreCode as fornitoreCode,
                       u.Name AS nomeOperatore
                FROM [GB2].[dbo].[EmailTemplates] t
                LEFT JOIN [GA].[dbo].[Users] u ON t.IDUser = u.IDUser
                WHERE t.ID = @id
            `);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Template non trovato' });
        res.json({ template: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crea template personale
router.post('/email-templates', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const { nome, oggetto, corpo, lingua, isDefault, fornitoreCode } = req.body;

        if (!nome || !corpo) return res.status(400).json({ error: 'Nome e corpo obbligatori' });

        // If setting as default, reset others first
        if (isDefault) {
            await pool.request().input('uid', sql.Int, userId).query(
                `UPDATE [GB2].[dbo].[EmailTemplates] SET IsDefault = 0 WHERE IDUser = @uid`
            );
        }

        const result = await pool.request()
            .input('uid', sql.Int, userId)
            .input('nome', sql.NVarChar(100), nome)
            .input('oggetto', sql.NVarChar(200), oggetto || 'Ordine {numord} - U.Jet S.r.l.')
            .input('corpo', sql.NVarChar(sql.MAX), corpo)
            .input('lingua', sql.VarChar(10), lingua || 'it')
            .input('isDefault', sql.Bit, isDefault ? 1 : 0)
            .input('fornCode', sql.Int, fornitoreCode || null)
            .query(`
                INSERT INTO [GB2].[dbo].[EmailTemplates] (IDUser, Nome, Oggetto, Corpo, Lingua, IsDefault, IsSystem, IsActive, FornitoreCode)
                OUTPUT INSERTED.ID as id
                VALUES (@uid, @nome, @oggetto, @corpo, @lingua, @isDefault, 0, 1, @fornCode)
            `);

        res.json({ success: true, id: result.recordset[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aggiorna template (solo propri, non di sistema)
router.put('/email-templates/:id', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const templateId = parseInt(req.params.id, 10);
        const { nome, oggetto, corpo, lingua, isDefault } = req.body;

        // Verify ownership
        const check = await pool.request().input('id', sql.Int, templateId).query(
            `SELECT IDUser, IsSystem FROM [GB2].[dbo].[EmailTemplates] WHERE ID = @id`
        );
        if (check.recordset.length === 0) return res.status(404).json({ error: 'Template non trovato' });
        if (check.recordset[0].IsSystem) return res.status(403).json({ error: 'Non puoi modificare un template di sistema' });
        if (check.recordset[0].IDUser !== userId) return res.status(403).json({ error: 'Non puoi modificare template di altri operatori' });

        if (isDefault) {
            await pool.request().input('uid', sql.Int, userId).query(
                `UPDATE [GB2].[dbo].[EmailTemplates] SET IsDefault = 0 WHERE IDUser = @uid`
            );
        }

        await pool.request()
            .input('id', sql.Int, templateId)
            .input('nome', sql.NVarChar(100), nome)
            .input('oggetto', sql.NVarChar(200), oggetto || 'Ordine {numord} - U.Jet S.r.l.')
            .input('corpo', sql.NVarChar(sql.MAX), corpo)
            .input('lingua', sql.VarChar(10), lingua || 'it')
            .input('isDefault', sql.Bit, isDefault ? 1 : 0)
            .query(`
                UPDATE [GB2].[dbo].[EmailTemplates]
                SET Nome = @nome, Oggetto = @oggetto, Corpo = @corpo, Lingua = @lingua,
                    IsDefault = @isDefault, UpdatedAt = GETDATE()
                WHERE ID = @id
            `);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Elimina template (soft delete: IsActive=0)
router.delete('/email-templates/:id', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const templateId = parseInt(req.params.id, 10);

        const check = await pool.request().input('id', sql.Int, templateId).query(
            `SELECT IDUser, IsSystem FROM [GB2].[dbo].[EmailTemplates] WHERE ID = @id`
        );
        if (check.recordset.length === 0) return res.status(404).json({ error: 'Template non trovato' });
        if (check.recordset[0].IsSystem) return res.status(403).json({ error: 'Non puoi eliminare un template di sistema' });
        if (check.recordset[0].IDUser !== userId) return res.status(403).json({ error: 'Non puoi eliminare template di altri operatori' });

        await pool.request().input('id', sql.Int, templateId).query(
            `UPDATE [GB2].[dbo].[EmailTemplates] SET IsActive = 0, UpdatedAt = GETDATE() WHERE ID = @id`
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Riattiva template disattivato
router.put('/email-templates/:id/reactivate', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const templateId = parseInt(req.params.id, 10);

        const check = await pool.request().input('id', sql.Int, templateId).query(
            `SELECT IDUser FROM [GB2].[dbo].[EmailTemplates] WHERE ID = @id`
        );
        if (check.recordset.length === 0) return res.status(404).json({ error: 'Template non trovato' });
        if (check.recordset[0].IDUser !== userId) return res.status(403).json({ error: 'Non puoi riattivare template di altri operatori' });

        await pool.request().input('id', sql.Int, templateId).query(
            `UPDATE [GB2].[dbo].[EmailTemplates] SET IsActive = 1, UpdatedAt = GETDATE() WHERE ID = @id`
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API: EMAIL TEMPLATE ASSEGNAZIONI FORNITORE
// ============================================================

// Lista assegnazioni fornitore-template dell'operatore
router.get('/email-template-assegnazioni', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);

        const result = await pool.request()
            .input('uid', sql.Int, userId)
            .query(`
                SELECT a.FornitoreCode as fornitoreCode, a.TemplateID as templateId
                FROM [GB2].[dbo].[EmailTemplateAssegnazioni] a
                WHERE a.IDUser = @uid
            `);

        res.json({ assegnazioni: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upsert assegnazione fornitore-template
router.put('/email-template-assegnazione/:fornitoreCode', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const fornitoreCode = parseInt(req.params.fornitoreCode, 10);
        const { templateId } = req.body;

        if (!templateId) {
            // Remove assignment
            await pool.request()
                .input('uid', sql.Int, userId)
                .input('forn', sql.Int, fornitoreCode)
                .query(`DELETE FROM [GB2].[dbo].[EmailTemplateAssegnazioni] WHERE IDUser = @uid AND FornitoreCode = @forn`);
        } else {
            // Upsert
            await pool.request()
                .input('uid', sql.Int, userId)
                .input('forn', sql.Int, fornitoreCode)
                .input('tid', sql.Int, templateId)
                .query(`
                    MERGE [GB2].[dbo].[EmailTemplateAssegnazioni] AS target
                    USING (SELECT @uid AS IDUser, @forn AS FornitoreCode) AS source
                    ON target.IDUser = source.IDUser AND target.FornitoreCode = source.FornitoreCode
                    WHEN MATCHED THEN UPDATE SET TemplateID = @tid, UpdatedAt = GETDATE()
                    WHEN NOT MATCHED THEN INSERT (IDUser, FornitoreCode, TemplateID) VALUES (@uid, @forn, @tid);
                `);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lista fornitori attivi (da ordini) con assegnazione template
router.get('/fornitori-template', authMiddleware, async (req, res) => {
    try {
        const poolProd = await getPoolProd();
        const userId = getUserId(req);

        // Query leggera su anagra (tipo F) + pagamento — senza CTE su ordlist/testord che sono lente
        // Il campo ultimo_ordine viene recuperato on-demand nel pannello espanso
        const poolERP = await getPoolMRP(userId);

        const erpResult = await poolERP.request().query(`
            SELECT an.an_conto AS codice, RTRIM(an.an_descr1) AS nome,
                   RTRIM(ISNULL(an.an_email,'')) AS email,
                   RTRIM(ISNULL(an.an_banc1,'')) AS banca1,
                   RTRIM(ISNULL(an.an_banc2,'')) AS banca2,
                   RTRIM(ISNULL(an.an_faxtlx,'')) AS fax,
                   RTRIM(ISNULL(an.an_indir,'')) AS indirizzo,
                   RTRIM(ISNULL(an.an_cap,'')) AS cap,
                   RTRIM(ISNULL(an.an_citta,'')) AS citta,
                   RTRIM(ISNULL(an.an_prov,'')) AS prov,
                   RTRIM(ISNULL(an.an_pariva,'')) AS pariva,
                   ISNULL(an.an_abi, 0) AS abi,
                   ISNULL(an.an_cab, 0) AS cab,
                   RTRIM(ISNULL(an.an_iban,'')) AS iban,
                   RTRIM(ISNULL(an.an_swift,'')) AS swift,
                   RTRIM(ISNULL(p.tb_despaga,'')) AS pagamento,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM dbo.testord t
                       WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_conto=an.an_conto
                   ) THEN 1 ELSE 0 END AS ha_ordini
            FROM dbo.anagra an
            LEFT JOIN dbo.tabpaga p ON an.an_codpag = p.tb_codpaga
            WHERE an.an_tipo = 'F' AND an.an_conto <> 0
            ORDER BY an.an_descr1
        `);

        // Query assegnazioni template da GB2 (sempre su 163)
        const gb2Result = await poolProd.request()
            .input('uid', sql.Int, userId)
            .query(`
                SELECT FornitoreCode AS codice, TemplateID AS templateId
                FROM [GB2].[dbo].[EmailTemplateAssegnazioni]
                WHERE IDUser = @uid
            `);

        // Merge: arricchisci fornitori con templateId
        const templateMap = {};
        gb2Result.recordset.forEach(r => { templateMap[r.codice] = r.templateId; });
        const fornitori = erpResult.recordset.map(r => ({ ...r, templateId: templateMap[r.codice] || null }));

        const result = { recordset: fornitori };

        // Template mode dall'utente
        const modeRes = await poolProd.request()
            .input('uid', sql.Int, userId)
            .query(`SELECT ISNULL(TemplateMode, 'ultima_scelta') AS templateMode
                    FROM [GB2].[dbo].[UserPreferences] WHERE IDUser = @uid`);
        const templateMode = modeRes.recordset.length ? modeRes.recordset[0].templateMode : 'ultima_scelta';

        res.json({
            fornitori: result.recordset,
            templateMode
        });
    } catch (err) {
        console.error('[Fornitori Template] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Salva modalità template (predefiniti / ultima_scelta)
// Assegna template in batch a una lista di fornitori
router.put('/template-assegnazione-batch', authMiddleware, async (req, res) => {
    try {
        const { codici, templateId } = req.body;
        if (!Array.isArray(codici) || !codici.length) return res.status(400).json({ error: 'codici obbligatorio (array)' });
        const tid = templateId ? parseInt(templateId, 10) : null;
        const userId = getUserId(req);
        const poolProd = await getPoolProd();

        let count = 0;
        for (const codice of codici) {
            if (tid) {
                await poolProd.request()
                    .input('uid', sql.Int, userId)
                    .input('forn', sql.Int, parseInt(codice, 10))
                    .input('tid', sql.Int, tid)
                    .query(`
                        MERGE [GB2].[dbo].[EmailTemplateAssegnazioni] AS target
                        USING (SELECT @uid AS IDUser, @forn AS FornitoreCode) AS source
                        ON target.IDUser = source.IDUser AND target.FornitoreCode = source.FornitoreCode
                        WHEN MATCHED THEN UPDATE SET TemplateID = @tid, UpdatedAt = GETDATE()
                        WHEN NOT MATCHED THEN INSERT (IDUser, FornitoreCode, TemplateID) VALUES (@uid, @forn, @tid);
                    `);
            } else {
                await poolProd.request()
                    .input('uid', sql.Int, userId)
                    .input('forn', sql.Int, parseInt(codice, 10))
                    .query('DELETE FROM [GB2].[dbo].[EmailTemplateAssegnazioni] WHERE IDUser = @uid AND FornitoreCode = @forn');
            }
            count++;
        }
        res.json({ success: true, count });
    } catch (err) {
        console.error('[Template Batch] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/template-mode', authMiddleware, async (req, res) => {
    try {
        const poolProd = await getPoolProd();
        const userId = getUserId(req);
        const { mode } = req.body;

        if (!['predefiniti', 'ultima_scelta'].includes(mode)) {
            return res.status(400).json({ error: 'Modalità non valida' });
        }

        const exists = await poolProd.request()
            .input('uid', sql.Int, userId)
            .query('SELECT 1 FROM [GB2].[dbo].[UserPreferences] WHERE IDUser = @uid');

        if (exists.recordset.length) {
            await poolProd.request()
                .input('uid', sql.Int, userId)
                .input('mode', sql.VarChar(20), mode)
                .query('UPDATE [GB2].[dbo].[UserPreferences] SET TemplateMode = @mode, UpdatedAt = GETDATE() WHERE IDUser = @uid');
        } else {
            await poolProd.request()
                .input('uid', sql.Int, userId)
                .input('mode', sql.VarChar(20), mode)
                .query('INSERT INTO [GB2].[dbo].[UserPreferences] (IDUser, TemplateMode) VALUES (@uid, @mode)');
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/check-anagra-column', authMiddleware, async (req, res) => {
    try {
        const uid = getUserId(req);
        const isProd = isProduction(uid);
        let exists = false;

        if (isProd) {
            // Produzione: check sulla tabella reale in BCUBE2 via poolProd cross-server
            const poolProd = await getPoolProd();
            const profile = getActiveProfile(uid);
            const linkedServer = (profile.server_ujet11 || PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim();
            const dbName = (profile.database_ujet11 || PRODUCTION_PROFILE.database_ujet11 || 'UJET11').trim();
            const r = await poolProd.request().query(
                `SELECT 1 AS ok FROM [${linkedServer}].[${dbName}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='anagra' AND COLUMN_NAME='HH_TipoReport'`
            );
            exists = r.recordset.length > 0;
        } else {
            // Prova: check diretto su UJET11
            const pool = await getPoolMRP(uid);
            const r = await pool.request().query(
                "SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='anagra' AND COLUMN_NAME='HH_TipoReport'"
            );
            exists = r.recordset.length > 0;
        }

        res.json({ exists, isProduction: isProd });
    } catch (err) {
        console.error('[GB2] check-anagra-column error:', err.message);
        res.json({ exists: false, error: err.message });
    }
});

// Crea la colonna HH_TipoReport in anagra e la popola con la regola automatica
router.post('/deploy-anagra-column', authMiddleware, async (req, res) => {
    try {
        const uid = getUserId(req);
        const isProd = isProduction(uid);

        if (isProd) {
            // PRODUZIONE: DDL (ALTER TABLE) richiede connessione DIRETTA a BCUBE2
            // perche SQL Server non supporta ALTER TABLE cross-server via linked server.
            // Dopo il DDL, refresh della vista in MRP e UPDATE via la vista.
            const poolProd = await getPoolProd();
            const profile = getActiveProfile(uid);
            const remoteServer = (profile.server_ujet11 || PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim();
            const dbName = (profile.database_ujet11 || PRODUCTION_PROFILE.database_ujet11 || 'UJET11').trim();

            // 1. Verifica che non esista gia (via linked server — SELECT funziona)
            const check = await poolProd.request().query(
                `SELECT 1 AS ok FROM [${remoteServer}].[${dbName}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='anagra' AND COLUMN_NAME='HH_TipoReport'`
            );
            if (check.recordset.length === 0) {
                // 2. Connessione diretta temporanea a BCUBE2 per il DDL
                const directPool = await new sql.ConnectionPool({
                    server: remoteServer,
                    database: dbName,
                    user: PRODUCTION_PROFILE.user,
                    password: PRODUCTION_PROFILE.password,
                    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
                }).connect();

                try {
                    // 2a. ALTER TABLE diretto
                    await directPool.request().batch('ALTER TABLE dbo.anagra ADD HH_TipoReport VARCHAR(10) NULL');
                    console.log('[GB2] Colonna HH_TipoReport creata su ' + remoteServer + '/' + dbName);

                    // 2b. ms_description
                    try {
                        await directPool.request().batch(
                            "EXEC sp_addextendedproperty " +
                            "@name=N'MS_Description', " +
                            "@value=N'GB2: classificazione fornitore per layout PDF ordine (IT/UE/EXTRA_UE). Creata da GB2.', " +
                            "@level0type=N'SCHEMA', @level0name=N'dbo', " +
                            "@level1type=N'TABLE', @level1name=N'anagra', " +
                            "@level2type=N'COLUMN', @level2name=N'HH_TipoReport'"
                        );
                    } catch (descErr) {
                        console.warn('[GB2] ms_description non aggiunta (non critico):', descErr.message);
                    }
                } finally {
                    try { await directPool.close(); } catch (_) {}
                }

                // 3. Refresh vista in MRP per renderla visibile
                await poolProd.request().batch("EXEC sp_refreshview 'dbo.anagra'");
                console.log('[GB2] Vista anagra refreshata dopo ALTER TABLE su ' + remoteServer);
            }

            // 4. Popola via la vista (ora aggiornata) — usa il file SQL logica UPDATE
            const updateResult = await poolProd.request().query(`
                UPDATE dbo.anagra
                SET HH_TipoReport = CASE
                    WHEN RTRIM(ISNULL(an_nazion1, '')) IN ('A','B','BG','CZ','DK','DE','EW','E','F','FIN','GR','H','HR','IRL','L','LT','LV','M','NL','P','PL','RO','S','SK','SLO') THEN 'UE'
                    WHEN RTRIM(ISNULL(an_nazion1, '')) <> '' THEN 'EXTRA_UE'
                    WHEN LEN(RTRIM(ISNULL(an_prov, ''))) = 2 THEN 'IT'
                    WHEN RTRIM(ISNULL(an_pariva, '')) = '' THEN 'IT'
                    WHEN LEN(RTRIM(an_pariva)) = 11 AND ISNUMERIC(RTRIM(an_pariva)) = 1 THEN 'IT'
                    ELSE 'EXTRA_UE'
                END
                WHERE an_tipo = 'F' AND HH_TipoReport IS NULL
            `);
            res.json({ success: true, rowsUpdated: updateResult.rowsAffected[0] || 0, mode: 'production' });

        } else {
            // PROVA: esegue il file SQL direttamente su UJET11
            const pool = await getPoolMRP(uid);
            const sqlDir = path.join(__dirname, '..', 'sql', 'mrp');
            const filePath = path.join(sqlDir, 'deploy_anagra_hh_tiporeport.sql');
            if (!fs.existsSync(filePath)) {
                return res.status(500).json({ error: 'File SQL non trovato: deploy_anagra_hh_tiporeport.sql' });
            }
            await executeSqlFile(pool, filePath);
            // Conta quanti aggiornati
            const cnt = await pool.request().query(
                "SELECT COUNT(*) AS cnt FROM dbo.anagra WHERE an_tipo='F' AND HH_TipoReport IS NOT NULL"
            );
            res.json({ success: true, rowsUpdated: cnt.recordset[0].cnt, mode: 'test' });
        }
    } catch (err) {
        console.error('[GB2] deploy-anagra-column error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Lista fornitori con classificazione HH_TipoReport
router.get('/fornitori-classificazione', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolMRP(getUserId(req));
        // Verifica prima se la colonna esiste
        const colCheck = await pool.request().query(
            "SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='anagra' AND COLUMN_NAME='HH_TipoReport'"
        );
        if (colCheck.recordset.length === 0) {
            return res.json({ fornitori: [], columnMissing: true });
        }
        const r = await pool.request().query(`
            SELECT an_conto AS codice, RTRIM(an_descr1) AS nome, RTRIM(ISNULL(HH_TipoReport,'')) AS tipo
            FROM dbo.anagra
            WHERE an_tipo = 'F'
            ORDER BY an_descr1
        `);
        res.json({ fornitori: r.recordset, columnMissing: false });
    } catch (err) {
        console.error('[GB2] fornitori-classificazione error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Aggiorna classificazione di un singolo fornitore
// Stesso pattern produzione/prova di fornitore-anagrafica
router.put('/fornitore-classificazione/:codice', authMiddleware, async (req, res) => {
    try {
        const { tipo } = req.body;
        const codice = parseInt(req.params.codice, 10);
        if (!['IT', 'UE', 'EXTRA_UE'].includes(tipo)) {
            return res.status(400).json({ error: 'tipo deve essere IT, UE o EXTRA_UE' });
        }
        if (!codice || isNaN(codice)) {
            return res.status(400).json({ error: 'codice fornitore non valido' });
        }
        const uid = getUserId(req);
        const isProd = isProduction(uid);

        let pool;
        let tempPool = null;
        if (isProd) {
            const remoteServer = (PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim();
            const dbName = (PRODUCTION_PROFILE.database_ujet11 || 'UJET11').trim();
            tempPool = await new sql.ConnectionPool({
                server: remoteServer, database: dbName,
                user: PRODUCTION_PROFILE.user, password: PRODUCTION_PROFILE.password,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
            }).connect();
            pool = tempPool;
        } else {
            pool = await getPoolMRP(uid);
        }

        try {
            await pool.request()
                .input('tipo', sql.VarChar, tipo)
                .input('codice', sql.Int, codice)
                .query('UPDATE dbo.anagra SET HH_TipoReport = @tipo WHERE an_conto = @codice');
            res.json({ success: true });
        } finally {
            if (tempPool) try { await tempPool.close(); } catch (_) {}
        }
    } catch (err) {
        console.error('[GB2] fornitore-classificazione PUT error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Ultimo ordine di un fornitore (query leggera, chiamata on-demand dal pannello espanso)
router.get('/fornitore-ultimo-ordine/:codice', authMiddleware, async (req, res) => {
    try {
        const codice = parseInt(req.params.codice, 10);
        const pool = await getPoolMRP(getUserId(req));
        const r = await pool.request()
            .input('codice', sql.Int, codice)
            .query("SELECT TOP 1 td_datord AS ultimo_ordine FROM dbo.testord WHERE codditt='UJET11' AND td_tipork='O' AND td_conto=@codice ORDER BY td_datord DESC");
        const ultimo = r.recordset.length ? r.recordset[0].ultimo_ordine : null;
        res.json({ ultimo_ordine: ultimo });
    } catch (err) {
        res.json({ ultimo_ordine: null });
    }
});

// Aggiorna email e/o banca di un fornitore in anagrafica
// In prova: scrive direttamente su UJET11 del server di prova via getPoolMRP
// In produzione: connessione diretta temporanea a BCUBE2 (ALTER/UPDATE non passa via linked server viste)
router.put('/fornitore-anagrafica/:codice', authMiddleware, async (req, res) => {
    try {
        const codice = parseInt(req.params.codice, 10);
        if (!codice || isNaN(codice)) return res.status(400).json({ error: 'codice non valido' });

        const { email, banca1, banca2, abi, cab, iban, swift } = req.body;
        const uid = getUserId(req);
        const isProd = isProduction(uid);

        const sets = [];
        const params = { codice };
        if (email !== undefined) { params.email = email || ''; sets.push('an_email = @email'); }
        if (banca1 !== undefined) { params.banca1 = banca1 || ''; sets.push('an_banc1 = @banca1'); }
        if (banca2 !== undefined) { params.banca2 = banca2 || ''; sets.push('an_banc2 = @banca2'); }
        if (abi !== undefined) { params.abi = parseInt(abi) || 0; sets.push('an_abi = @abi'); }
        if (cab !== undefined) { params.cab = parseInt(cab) || 0; sets.push('an_cab = @cab'); }
        if (iban !== undefined) { params.iban = (iban || '').trim(); sets.push('an_iban = @iban'); }
        if (swift !== undefined) { params.swift = (swift || '').trim(); sets.push('an_swift = @swift'); }
        if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

        let pool;
        let tempPool = null;
        if (isProd) {
            // Produzione: connessione diretta a BCUBE2
            const remoteServer = (PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2').trim();
            const dbName = (PRODUCTION_PROFILE.database_ujet11 || 'UJET11').trim();
            tempPool = await new sql.ConnectionPool({
                server: remoteServer, database: dbName,
                user: PRODUCTION_PROFILE.user, password: PRODUCTION_PROFILE.password,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
            }).connect();
            pool = tempPool;
        } else {
            pool = await getPoolMRP(uid);
        }

        try {
            const request = pool.request().input('codice', sql.Int, codice);
            if (params.email !== undefined) request.input('email', sql.VarChar, params.email);
            if (params.banca1 !== undefined) request.input('banca1', sql.VarChar, params.banca1);
            if (params.banca2 !== undefined) request.input('banca2', sql.VarChar, params.banca2);
            if (params.abi !== undefined) request.input('abi', sql.Int, params.abi);
            if (params.cab !== undefined) request.input('cab', sql.Int, params.cab);
            if (params.iban !== undefined) request.input('iban', sql.VarChar, params.iban);
            if (params.swift !== undefined) request.input('swift', sql.VarChar, params.swift);
            const updateResult = await request.query(`UPDATE dbo.anagra SET ${sets.join(', ')} WHERE an_conto = @codice`);
            const rowsAffected = updateResult.rowsAffected[0] || 0;
            console.log('[GB2] fornitore-anagrafica UPDATE:', codice, '| sets:', sets.join(', '), '| rows:', rowsAffected, '| isProd:', isProd);

            const verifica = await pool.request().input('codice', sql.Int, codice)
                .query(`SELECT RTRIM(ISNULL(an_email,'')) AS email, RTRIM(ISNULL(an_banc1,'')) AS banca1,
                        RTRIM(ISNULL(an_banc2,'')) AS banca2, ISNULL(an_abi,0) AS abi, ISNULL(an_cab,0) AS cab,
                        RTRIM(ISNULL(an_iban,'')) AS iban, RTRIM(ISNULL(an_swift,'')) AS swift
                        FROM dbo.anagra WHERE an_conto = @codice`);
            const dopo = verifica.recordset[0] || {};

            // Info connessione per il modale di conferma
            const profile = getActiveProfile(uid);
            const serverInfo = isProd
                ? (PRODUCTION_PROFILE.server_ujet11 || 'BCUBE2') + ' / ' + (PRODUCTION_PROFILE.database_ujet11 || 'UJET11')
                : (profile.server || '192.168.0.163') + ' / ' + (profile.database_ujet11 || 'UJET11');

            res.json({ success: true, rowsAffected, verifica: dopo, server: serverInfo, ambiente: isProd ? 'produzione' : 'prova' });
        } finally {
            if (tempPool) try { await tempPool.close(); } catch (_) {}
        }
    } catch (err) {
        console.error('[GB2] fornitore-anagrafica PUT error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
};
