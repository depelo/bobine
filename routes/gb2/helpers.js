/**
 * GB2 Route Helpers — funzioni condivise tra i moduli route.
 * Deploy SQL, naming SP, compilazione template, utility.
 */
const path = require('path');
const fs = require('fs');

function createHelpers({ sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
    getTestHasRiep, PRODUCTION_PROFILE }) {

    // Calcola il prefisso cross-database per raggiungere UJET11 nelle SP
    function getUjet11Ref(profile) {
        if (!profile) return '[UJET11].[dbo]';
        const linkedServer = (profile.server_ujet11 || profile.server || '').trim();
        const dbName = (profile.database_ujet11 || 'UJET11').trim();
        if (linkedServer) {
            return `[${linkedServer}].[${dbName}].[dbo]`;
        }
        return `[${dbName}].[dbo]`;
    }

    function getSpSuffix(profile) {
        if (!profile || !profile._testDbId) return '';
        return '_T' + profile._testDbId;
    }

    function getSpName(baseName, profile) {
        return baseName + getSpSuffix(profile);
    }

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

    function compilaTemplate(testo, dati) {
        return testo
            .replace(/\{fornitore\}/g, dati.fornitore || '')
            .replace(/\{numord\}/g, dati.numord || '')
            .replace(/\{data_ordine\}/g, dati.data_ordine || '')
            .replace(/\{num_articoli\}/g, String(dati.num_articoli || 0))
            .replace(/\{totale\}/g, dati.totale || '')
            .replace(/\{operatore\}/g, dati.operatore || '')
            .replace(/\{firma\}/g, dati.firma || '');
    }

    // Versione deploy — incrementare quando si modificano le SP o le tabelle
    const DEPLOY_VERSION = '2.1';

    /**
     * Deploy SP e tabelle nel DB [GB2] del server di destinazione.
     * Le SP stanno sullo stesso server di [UJET11] — zero linked server.
     * Con versioning: se la versione e uguale, skip (~50ms).
     *
     * @param {ConnectionPool} poolTarget — pool verso il server di destinazione (BCUBE2 o prova)
     * @param {ConnectionPool} poolProd — pool MRP@163 (per tabelle locali GB2: Operators, ecc.)
     * @param {string} [suffix=''] — suffisso SP per prova (es. '_T1')
     */
    async function deploySPToTarget(poolTarget, suffix) {
        const sqlDir = path.join(__dirname, '..', '..', 'sql', 'mrp');
        const results = [];

        // 1. Crea DB [GB2] sul server di destinazione se non esiste
        try {
            await poolTarget.request().batch(`
                IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name='GB2')
                    CREATE DATABASE [GB2]
            `);
        } catch (e) {
            // DB potrebbe gia esistere o permessi insufficienti
            console.warn('[Deploy] Creazione DB GB2:', e.message);
        }

        // 2. Crea tabella DeployVersion se non esiste
        try {
            await poolTarget.request().batch(`
                IF NOT EXISTS (SELECT 1 FROM [GB2].sys.tables WHERE name='DeployVersion')
                BEGIN
                    CREATE TABLE [GB2].[dbo].[DeployVersion] (Versione VARCHAR(10) NOT NULL, DeployedAt DATETIME NOT NULL DEFAULT GETDATE());
                    INSERT INTO [GB2].[dbo].[DeployVersion] (Versione) VALUES ('0.0');
                END
            `);
        } catch (_) {}

        // 3. Check versione — skip se gia deployata
        const versionKey = DEPLOY_VERSION + (suffix || '');
        try {
            const verRes = await poolTarget.request().query(
                "SELECT Versione FROM [GB2].[dbo].[DeployVersion]"
            );
            const currentVersion = verRes.recordset.length ? (verRes.recordset[0].Versione || '').trim() : '0.0';
            if (currentVersion === versionKey) {
                return { skipped: true, version: versionKey };
            }
        } catch (_) {}

        // 4. Deploy SP nel DB [GB2] — connessione diretta al DB [GB2] (non USE prefix)
        // Apriamo un pool temporaneo connesso direttamente a [GB2] sullo stesso server
        let poolGB2Target = null;
        try {
            const serverAddr = poolTarget.config.server;
            poolGB2Target = await new sql.ConnectionPool({
                server: serverAddr, database: 'GB2',
                user: poolTarget.config.user, password: poolTarget.config.password,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
            }).connect();
        } catch (connErr) {
            console.warn('[Deploy] Connessione a [GB2] fallita:', connErr.message);
            return { skipped: false, version: versionKey, results: [{ file: 'GB2 conn', status: 'error', error: connErr.message }] };
        }

        try {
            for (const file of ['usp_CreaOrdineFornitore.sql', 'usp_AggiornaStatoInvioOrdine.sql']) {
                const filePath = path.join(sqlDir, file);
                if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
                try {
                    let sqlText = fs.readFileSync(filePath, 'utf-8');
                    if (suffix) {
                        sqlText = sqlText.replace(/usp_CreaOrdineFornitore/g, 'usp_CreaOrdineFornitore' + suffix);
                        sqlText = sqlText.replace(/usp_AggiornaStatoInvioOrdine/g, 'usp_AggiornaStatoInvioOrdine' + suffix);
                    }
                    const batches = sqlText.split(/^\s*GO\s*$/im).filter(b => b.trim());
                    for (const b of batches) {
                        if (b.trim()) await poolGB2Target.request().batch(b);
                    }
                    results.push({ file, status: 'ok', suffix: suffix || '' });
                } catch (err) { results.push({ file, status: 'error', error: err.message }); }
            }
        } finally {
            try { await poolGB2Target.close(); } catch (_) {}
        }

        // 5. Deploy ordini_emessi sul server di destinazione (se non in MRP locale)
        const oeFile = path.join(sqlDir, 'create_ordini_emessi.sql');
        if (fs.existsSync(oeFile) && suffix) {
            // In prova: ordini_emessi va su UJET11 del server prova
            try {
                let oeSql = fs.readFileSync(oeFile, 'utf-8');
                oeSql = oeSql.replace(/\[MRP\]\.\[dbo\]/g, '[dbo]');
                const batches = oeSql.split(/^\s*GO\s*$/im).filter(b => b.trim());
                for (const b of batches) { if (b.trim()) await poolTarget.request().batch(b); }
                results.push({ file: 'create_ordini_emessi.sql', status: 'ok' });
            } catch (err) { results.push({ file: 'create_ordini_emessi.sql', status: 'error', error: err.message }); }
        }

        // 6. Aggiorna versione
        try {
            await poolTarget.request()
                .input('ver', sql.VarChar(10), versionKey)
                .query("UPDATE [GB2].[dbo].[DeployVersion] SET Versione=@ver, DeployedAt=GETDATE()");
        } catch (_) {}

        return { skipped: false, version: versionKey, results };
    }

    /**
     * Deploy completo produzione:
     * - SP sul server di destinazione (BCUBE2 via poolTarget)
     * - Tabelle locali su MRP@163 (poolProd)
     */
    async function deployProductionObjects(poolProd, poolTarget) {
        const sqlDir = path.join(__dirname, '..', '..', 'sql', 'mrp');
        const results = [];

        // Tabelle locali GB2 su MRP@163 (Operators, Preferences, ecc.)
        for (const file of ['create_test_profiles.sql', 'create_user_preferences.sql', 'create_elaborazioni_mrp.sql', 'create_snapshot_proposte.sql', 'create_email_templates.sql', 'create_email_template_assegnazioni.sql']) {
            const filePath = path.join(sqlDir, file);
            if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
            try {
                await executeSqlFile(poolProd, filePath);
                results.push({ file, status: 'ok' });
            } catch (err) { results.push({ file, status: 'error', error: err.message }); }
        }

        // ordini_emessi su MRP@163
        const oeFile = path.join(sqlDir, 'create_ordini_emessi.sql');
        if (fs.existsSync(oeFile)) {
            try {
                await executeSqlFile(poolProd, oeFile);
                results.push({ file: 'create_ordini_emessi.sql', status: 'ok' });
            } catch (err) { results.push({ file: 'create_ordini_emessi.sql', status: 'error', error: err.message }); }
        }

        // SP sul server di destinazione (con versioning)
        if (poolTarget) {
            const spDeploy = await deploySPToTarget(poolTarget, '');
            if (spDeploy.skipped) {
                results.push({ file: 'SP', status: 'skip (v' + spDeploy.version + ')' });
            } else {
                results.push(...(spDeploy.results || []));
            }
        }

        return results;
    }

    /**
     * Deploy per profilo di prova:
     * - SP suffissate nel [GB2] del server prova (poolTest)
     * - ordini_emessi su UJET11 del server prova
     */
    async function deployTestObjects(poolProd, poolTest, testProfile) {
        const suffix = '_T' + testProfile._testDbId;

        // SP sul server di prova (con versioning + suffisso)
        const spDeploy = await deploySPToTarget(poolTest, suffix);

        // Check Riep
        let hasRiep = false;
        try {
            const riepCheck = await poolTest.request()
                .query("SELECT 1 AS ok FROM sys.objects WHERE name='Riep' AND type IN ('U','V')");
            hasRiep = riepCheck.recordset.length > 0;
        } catch (_) {}

        return {
            results: spDeploy.skipped
                ? [{ file: 'SP', status: 'skip (v' + spDeploy.version + ')' }]
                : (spDeploy.results || []),
            hasRiep
        };
    }

    async function dropTestSPs(poolTarget, testDbId) {
        const suffix = '_T' + testDbId;
        const spNames = ['usp_CreaOrdineFornitore' + suffix, 'usp_AggiornaStatoInvioOrdine' + suffix];
        for (const sp of spNames) {
            try {
                await poolTarget.request().batch(
                    `IF EXISTS (SELECT 1 FROM [GB2].sys.objects WHERE name='${sp}' AND type='P') DROP PROCEDURE [GB2].[dbo].[${sp}]`
                );
            } catch (_) {}
        }
    }

    async function checkSpExists(pool, spName) {
        // Supporta nomi con prefisso [GB2].[dbo]. — cerca nel DB corretto
        const cleanName = spName.replace(/^\[GB2\]\.\[dbo\]\./, '');
        const r = await pool.request()
            .input('name', sql.NVarChar, cleanName)
            .query("SELECT 1 AS ok FROM [GB2].sys.objects WHERE name=@name AND type='P'");
        return r.recordset.length > 0;
    }

    function getUserId(req) {
        // JWT payload: globalId = IDUser (da GA.dbo.Users), id = IDOperator
        return (req.user && (req.user.globalId || req.user.IDUser)) || 0;
    }

    async function getPoolRiep(userId) {
        if (isProduction(userId) || getTestHasRiep(userId)) return getPoolMRP(userId);
        return getPoolProd();
    }

    function getPoliticaRiordino(art) {
        const pol = (art.ar_polriord || '').trim().toUpperCase();
        const map = { 'M': 'a punto di riordino', 'F': 'fabbisogno puro', 'L': 'a lotto fisso', 'N': 'nessuna politica' };
        let descr = map[pol] || pol;
        if (pol === 'M' && art.ar_scomin) {
            descr += ` (scorta min. ${art.ar_scomin}, lotto ${art.ar_ggrior || 0}, s.lotto 0)`;
        }
        if (pol === 'F') {
            const desint = (art.ar_desint || '').trim();
            if (desint) descr += ` (${desint})`;
        }
        return descr;
    }

    return {
        getUjet11Ref, getSpSuffix, getSpName,
        executeSqlFile, compilaTemplate,
        deployProductionObjects, deployTestObjects, dropTestSPs,
        checkSpExists, getUserId, getPoolRiep, getPoliticaRiordino
    };
}

module.exports = createHelpers;
