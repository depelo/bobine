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

    async function deployProductionObjects(poolProd) {
        const sqlDir = path.join(__dirname, '..', '..', 'sql', 'mrp');
        const profile = getActiveProfile();
        const ujet11Ref = getUjet11Ref(profile);
        const results = [];

        for (const file of ['create_test_profiles.sql', 'create_user_preferences.sql', 'create_elaborazioni_mrp.sql', 'create_snapshot_proposte.sql', 'create_email_templates.sql', 'create_email_template_assegnazioni.sql']) {
            const filePath = path.join(sqlDir, file);
            if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
            try {
                await executeSqlFile(poolProd, filePath);
                results.push({ file, status: 'ok' });
            } catch (err) { results.push({ file, status: 'error', error: err.message }); }
        }

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

    async function deployTestObjects(poolProd, poolTest, testProfile) {
        const sqlDir = path.join(__dirname, '..', '..', 'sql', 'mrp');
        const suffix = '_T' + testProfile._testDbId;
        const dbName = (testProfile.database_ujet11 || 'UJET11').trim();
        const testServer = (testProfile.server || '').trim();
        const mrpServer = (PRODUCTION_PROFILE.server || '').trim();

        const isSameServer = testServer.toLowerCase() === mrpServer.toLowerCase();
        const ujet11Ref = isSameServer
            ? `[${dbName}].[dbo]`
            : `[${testServer}].[${dbName}].[dbo]`;
        const results = [];

        const oeFile = path.join(sqlDir, 'create_ordini_emessi.sql');
        if (fs.existsSync(oeFile)) {
            try {
                let oeSql = fs.readFileSync(oeFile, 'utf-8');
                oeSql = oeSql.replace(/\[MRP\]\.\[dbo\]/g, '[dbo]');
                const batches = oeSql.split(/^\s*GO\s*$/im).filter(b => b.trim());
                for (const b of batches) { if (b.trim()) await poolTest.request().batch(b); }
                results.push({ file: 'create_ordini_emessi.sql', status: 'ok', target: 'test_ujet11' });
            } catch (err) { results.push({ file: 'create_ordini_emessi.sql', status: 'error', error: err.message }); }
        }

        for (const file of ['usp_CreaOrdineFornitore.sql', 'usp_AggiornaStatoInvioOrdine.sql']) {
            const filePath = path.join(sqlDir, file);
            if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
            try {
                let sqlText = fs.readFileSync(filePath, 'utf-8');
                sqlText = sqlText.replace(/\{\{UJET11_REF\}\}/g, ujet11Ref);
                sqlText = sqlText.replace(/usp_CreaOrdineFornitore/g, 'usp_CreaOrdineFornitore' + suffix);
                sqlText = sqlText.replace(/usp_AggiornaStatoInvioOrdine/g, 'usp_AggiornaStatoInvioOrdine' + suffix);
                const batches = sqlText.split(/^\s*GO\s*$/im).filter(b => b.trim());
                for (const b of batches) { if (b.trim()) await poolProd.request().batch(b); }
                results.push({ file, status: 'ok', spSuffix: suffix, ujet11Ref });
            } catch (err) { results.push({ file, status: 'error', error: err.message }); }
        }

        let hasRiep = false;
        try {
            const riepCheck = await poolTest.request()
                .query("SELECT 1 AS ok FROM sys.objects WHERE name='Riep' AND type IN ('U','V')");
            hasRiep = riepCheck.recordset.length > 0;
        } catch (_) {}

        return { results, hasRiep };
    }

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

    async function checkSpExists(pool, spName) {
        const r = await pool.request()
            .input('name', sql.NVarChar, spName)
            .query("SELECT 1 AS ok FROM sys.objects WHERE name=@name AND type='P'");
        return r.recordset.length > 0;
    }

    function getUserId(req) {
        return (req.user && req.user.IDUser) || 0;
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
