/**
 * GB2 Route Helpers — funzioni condivise tra i moduli route.
 * Deploy SQL, naming SP, compilazione template, utility.
 */
const path = require('path');
const fs = require('fs');

function createHelpers({ sql, getPool163, getPoolDest, getActiveProfile, getServerDest,
    getTestHasRiep, PRODUCTION_PROFILE }) {

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
            if (batch.trim()) await pool.request().batch(batch);
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
    const DEPLOY_VERSION = '2.7';

    /**
     * Deploy SP e tabelle nel DB [GB2_SP] del server di destinazione.
     * Le SP stanno sullo stesso server di [UJET11] — zero linked server.
     * Il DB si chiama sempre GB2_SP, sia su BCUBE2 che su qualsiasi server prova.
     * Con versioning: se la versione e uguale, skip (~50ms).
     */
    async function deploySPToTarget(poolTarget, suffix) {
        const sqlDir = path.join(__dirname, '..', '..', 'sql', 'mrp');
        const results = [];

        // 1. Crea DB [GB2_SP] sul server di destinazione se non esiste
        try {
            await poolTarget.request().batch(`
                IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name='GB2_SP')
                    CREATE DATABASE [GB2_SP]
            `);
        } catch (e) {
            console.warn('[Deploy] Creazione DB GB2_SP:', e.message);
        }

        // 2. Crea tabella DeployVersion se non esiste
        try {
            await poolTarget.request().batch(`
                IF NOT EXISTS (SELECT 1 FROM [GB2_SP].sys.tables WHERE name='DeployVersion')
                BEGIN
                    CREATE TABLE [GB2_SP].[dbo].[DeployVersion] (Versione VARCHAR(10) NOT NULL, DeployedAt DATETIME NOT NULL DEFAULT GETDATE());
                    INSERT INTO [GB2_SP].[dbo].[DeployVersion] (Versione) VALUES ('0.0');
                END
            `);
        } catch (_) {}

        // 3. Check versione — skip se gia deployata
        const versionKey = DEPLOY_VERSION + (suffix || '');
        try {
            const verRes = await poolTarget.request().query(
                "SELECT Versione FROM [GB2_SP].[dbo].[DeployVersion]"
            );
            const currentVersion = verRes.recordset.length ? (verRes.recordset[0].Versione || '').trim() : '0.0';
            if (currentVersion === versionKey) {
                return { skipped: true, version: versionKey };
            }
        } catch (_) {}

        // 4. Deploy SP nel DB [GB2_SP] — connessione diretta
        let poolSPTarget = null;
        try {
            const serverAddr = poolTarget.config.server;
            poolSPTarget = await new sql.ConnectionPool({
                server: serverAddr, database: 'GB2_SP',
                user: poolTarget.config.user, password: poolTarget.config.password,
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
            }).connect();
        } catch (connErr) {
            console.warn('[Deploy] Connessione a [GB2_SP] fallita:', connErr.message);
            return { skipped: false, version: versionKey, results: [{ file: 'GB2_SP conn', status: 'error', error: connErr.message }] };
        }

        try {
            for (const file of ['usp_CreaOrdineFornitore.sql', 'usp_AggiornaStatoInvioOrdine.sql', 'usp_AggiungiRigheOrdineFornitore.sql']) {
                const filePath = path.join(sqlDir, file);
                if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
                try {
                    let sqlText = fs.readFileSync(filePath, 'utf-8');
                    if (suffix) {
                        sqlText = sqlText.replace(/usp_AggiungiRigheOrdineFornitore/g, 'usp_AggiungiRigheOrdineFornitore' + suffix);
                        sqlText = sqlText.replace(/usp_CreaOrdineFornitore/g, 'usp_CreaOrdineFornitore' + suffix);
                        sqlText = sqlText.replace(/usp_AggiornaStatoInvioOrdine/g, 'usp_AggiornaStatoInvioOrdine' + suffix);
                    }
                    const batches = sqlText.split(/^\s*GO\s*$/im).filter(b => b.trim());
                    for (const b of batches) {
                        if (b.trim()) await poolSPTarget.request().batch(b);
                    }
                    results.push({ file, status: 'ok', suffix: suffix || '' });
                } catch (err) { results.push({ file, status: 'error', error: err.message }); }
            }
        } finally {
            try { await poolSPTarget.close(); } catch (_) {}
        }

        // 5. Aggiorna versione SOLO se tutti i file sono OK (niente errori).
        //    Altrimenti un errore transitorio (es. SP che non compila) resta congelato
        //    con version=OK finche qualcuno non bumpa manualmente DEPLOY_VERSION.
        const hasErrors = results.some(r => r.status === 'error');
        if (!hasErrors) {
            try {
                await poolTarget.request()
                    .input('ver', sql.VarChar(10), versionKey)
                    .query("UPDATE [GB2_SP].[dbo].[DeployVersion] SET Versione=@ver, DeployedAt=GETDATE()");
            } catch (_) {}
        } else {
            console.warn('[Deploy] Errori nel deploy SP — DeployVersion NON aggiornata:',
                results.filter(r => r.status === 'error').map(r => r.file + ': ' + r.error).join('; '));
        }

        return { skipped: false, version: versionKey, results };
    }

    /**
     * Deploy completo (al boot):
     * - Tabelle app su MRP@163 (pool163)
     * - SP sul server di destinazione default (poolTarget)
     */
    async function deployProductionObjects(pool163, poolTarget) {
        const sqlDir = path.join(__dirname, '..', '..', 'sql', 'mrp');
        const results = [];

        // Tabelle app su MRP@163
        for (const file of ['create_test_profiles.sql', 'create_user_preferences.sql', 'create_elaborazioni_mrp.sql', 'create_snapshot_proposte.sql', 'create_email_templates.sql', 'create_email_template_assegnazioni.sql']) {
            const filePath = path.join(sqlDir, file);
            if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
            try {
                await executeSqlFile(pool163, filePath);
                results.push({ file, status: 'ok' });
            } catch (err) { results.push({ file, status: 'error', error: err.message }); }
        }

        // ordini_emessi su MRP@163
        const oeFile = path.join(sqlDir, 'create_ordini_emessi.sql');
        if (fs.existsSync(oeFile)) {
            try {
                await executeSqlFile(pool163, oeFile);
                results.push({ file: 'create_ordini_emessi.sql', status: 'ok' });
            } catch (err) { results.push({ file: 'create_ordini_emessi.sql', status: 'error', error: err.message }); }
        }

        // SP sul server destinazione (con versioning)
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
     * - SP suffissate nel [GB2_SP] del server prova
     */
    async function deployTestObjects(pool163, poolTest, testProfile) {
        const suffix = '_T' + testProfile._testDbId;
        const spDeploy = await deploySPToTarget(poolTest, suffix);

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
        const spNames = ['usp_CreaOrdineFornitore' + suffix, 'usp_AggiornaStatoInvioOrdine' + suffix, 'usp_AggiungiRigheOrdineFornitore' + suffix];
        for (const sp of spNames) {
            try {
                await poolTarget.request().batch(
                    `IF EXISTS (SELECT 1 FROM [GB2_SP].sys.objects WHERE name='${sp}' AND type='P') DROP PROCEDURE [GB2_SP].[dbo].[${sp}]`
                );
            } catch (_) {}
        }
    }

    async function checkSpExists(pool, spName) {
        const cleanName = spName.replace(/^\[GB2_SP\]\.\[dbo\]\./, '').replace(/^\[GB2\]\.\[dbo\]\./, '');
        const r = await pool.request()
            .input('name', sql.NVarChar, cleanName)
            .query("SELECT 1 AS ok FROM [GB2_SP].sys.objects WHERE name=@name AND type='P'");
        return r.recordset.length > 0;
    }

    function getUserId(req) {
        return (req.user && (req.user.globalId || req.user.IDUser)) || 0;
    }

    async function getPoolRiep(userId) {
        if (getTestHasRiep(userId)) return getPoolDest(userId);
        // Default: Riep e raggiungibile da pool163 (vista verso Analisi_scorte su BCUBE2)
        return getPool163();
    }

    function getPoliticaRiordino(art) {
        const pol = (art.ar_polriord || '').trim().toUpperCase();
        const map = { 'M': 'a punto di riordino', 'F': 'fabbisogno puro', 'L': 'a lotto fisso', 'N': 'nessuna politica' };
        let descr = map[pol] || pol;
        if (pol === 'M' && art.ar_scomin) {
            descr += ` (scorta min. ${art.ar_scomin}, lotto ${art.ar_minord || 0}, lead time ${art.ar_rrfence || 0} gg)`;
        }
        if (pol === 'F') {
            const desint = (art.ar_desint || '').trim();
            if (desint) descr += ` (${desint})`;
        }
        return descr;
    }

    return {
        getSpSuffix, getSpName,
        executeSqlFile, compilaTemplate,
        deployProductionObjects, deployTestObjects, dropTestSPs,
        checkSpExists, getUserId, getPoolRiep, getPoliticaRiordino,
        getServerDest
    };
}

module.exports = createHelpers;
