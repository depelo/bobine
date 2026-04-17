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
    // 3.3 — Gestione valuta estera: SP CreaOrdine + AggiungiRighe ora popolano
    //       td_valuta/td_cambio/td_totmercev/td_totdocv + mo_prezvalc.
    //       Senza questa SP gli ordini USD avrebbero td_valuta=0 (= EUR) e PDF rotto.
    const DEPLOY_VERSION = '3.3';

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
            for (const file of ['usp_CreaOrdineFornitore.sql', 'usp_AggiornaStatoInvioOrdine.sql', 'usp_AggiungiRigheOrdineFornitore.sql', 'usp_RimuoviRigaOrdineFornitore.sql']) {
                const filePath = path.join(sqlDir, file);
                if (!fs.existsSync(filePath)) { results.push({ file, status: 'skip' }); continue; }
                try {
                    let sqlText = fs.readFileSync(filePath, 'utf-8');
                    if (suffix) {
                        sqlText = sqlText.replace(/usp_AggiungiRigheOrdineFornitore/g, 'usp_AggiungiRigheOrdineFornitore' + suffix);
                        sqlText = sqlText.replace(/usp_CreaOrdineFornitore/g, 'usp_CreaOrdineFornitore' + suffix);
                        sqlText = sqlText.replace(/usp_AggiornaStatoInvioOrdine/g, 'usp_AggiornaStatoInvioOrdine' + suffix);
                        sqlText = sqlText.replace(/usp_RimuoviRigaOrdineFornitore/g, 'usp_RimuoviRigaOrdineFornitore' + suffix);
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
        for (const file of ['create_test_profiles.sql', 'create_user_preferences.sql', 'create_elaborazioni_mrp.sql', 'create_snapshot_proposte.sql', 'create_email_templates.sql', 'create_email_template_assegnazioni.sql', 'create_ordini_confermati_pending.sql', 'migrate_ocp_ol_progr.sql']) {
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

    /**
     * Cleanup fire-and-forget al boot: rimuove le entry di
     * ordini_confermati_pending legate a elaborazioni non piu correnti.
     * "Corrente" = MAX(ID) per ciascun Ambiente in ElaborazioniMRP.
     * Gira con DEADLOCK_PRIORITY LOW per non interferire col lavoro utente.
     */
    async function cleanupStaleConfermatiPending(pool163) {
        if (!pool163) return { cleaned: 0, skipped: true };
        try {
            const r = await pool163.request().batch(`
                SET DEADLOCK_PRIORITY LOW;
                IF EXISTS (SELECT 1 FROM [GB2].sys.objects WHERE name='ordini_confermati_pending' AND type='U')
                BEGIN
                    DELETE FROM [GB2].[dbo].[ordini_confermati_pending]
                    WHERE elaborazione_id NOT IN (
                        SELECT MAX(ID) FROM [GB2].[dbo].[ElaborazioniMRP] GROUP BY Ambiente
                    );
                    SELECT @@ROWCOUNT AS cleaned;
                END
                ELSE
                    SELECT 0 AS cleaned;
            `);
            const cleaned = (r.recordset && r.recordset[0] && r.recordset[0].cleaned) || 0;
            if (cleaned > 0) {
                console.log('[Cleanup] ordini_confermati_pending: rimosse ' + cleaned + ' entry orfane');
            }
            return { cleaned, skipped: false };
        } catch (err) {
            console.warn('[Cleanup] ordini_confermati_pending fallito (non bloccante):', err.message);
            return { cleaned: 0, error: err.message };
        }
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

    /**
     * Fetch completo ordine + righe dal DB con tutte le JOIN necessarie al PDF:
     * banca, porto, valuta, destinazione, codarfo, note articolo.
     * Usato da /emetti-ordine, /modifica-ordine, /ordine-pdf, /invia-ordine-email.
     */
    async function fetchOrdineCompleto(pool, anno, serie, numord) {
        let testata;
        try {
            testata = await pool.request()
                .input('anno', sql.SmallInt, anno)
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, numord)
                .query(`
                    SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                           t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                           t.td_codpaga AS pagamento_codice,
                           t.td_banc1 AS banca_appoggio_1, t.td_banc2 AS banca_appoggio_2,
                           t.td_porto AS porto_codice, t.td_valuta AS valuta_codice,
                           t.td_riferim AS riferimento,
                           CAST(t.td_note AS VARCHAR(MAX)) AS note_ordine,
                           t.td_vettor AS vettore_codice,
                           t.td_totmerce AS totale_merce, t.td_totdoc AS totale_documento,
                           t.td_totmercev AS totale_merce_valuta, t.td_totdocv AS totale_documento_valuta,
                           t.td_cambio AS cambio,
                           t.td_acuradi AS acuradi,
                           t.td_coddest AS coddest, t.td_contodest AS contodest,
                           a.an_descr1 AS fornitore_nome, a.an_indir AS fornitore_indirizzo,
                           a.an_cap AS fornitore_cap, a.an_citta AS fornitore_citta,
                           a.an_prov AS fornitore_prov, a.an_pariva AS fornitore_pariva,
                           a.an_email AS fornitore_email, a.an_faxtlx AS fornitore_fax,
                           a.an_categ AS fornitore_categ,
                           a.HH_TipoReport AS fornitore_tipo,
                           a.an_banc1 AS fornitore_banca_1, a.an_banc2 AS fornitore_banca_2,
                           CAST(a.an_note AS VARCHAR(MAX)) AS fornitore_note,
                           CAST(a.an_note2 AS VARCHAR(MAX)) AS fornitore_note2,
                           p.tb_despaga AS pagamento_descr,
                           pt.tb_desport AS porto_descr,
                           v.tb_desvalu AS valuta_sigla, v.tb_nomvalu AS valuta_nome,
                           d.dd_nomdest AS dest_nome, d.dd_inddest AS dest_indirizzo,
                           d.dd_capdest AS dest_cap, d.dd_locdest AS dest_citta,
                           d.dd_prodest AS dest_prov
                    FROM dbo.testord t
                    LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                    LEFT JOIN dbo.tabpaga p ON t.td_codpaga = p.tb_codpaga
                    LEFT JOIN dbo.tabport pt ON t.codditt = pt.codditt AND t.td_porto = pt.tb_codport
                    LEFT JOIN dbo.tabvalu v ON t.td_valuta = v.tb_codvalu
                    LEFT JOIN dbo.destdiv d ON t.codditt = d.codditt
                                             AND t.td_contodest = d.dd_conto
                                             AND t.td_coddest = d.dd_coddest
                    WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                      AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
                `);
        } catch (colErr) {
            if (colErr.message.includes('HH_TipoReport')) {
                testata = await pool.request()
                    .input('anno', sql.SmallInt, anno)
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, numord)
                    .query(`
                        SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                               t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                               t.td_codpaga AS pagamento_codice,
                               t.td_banc1 AS banca_appoggio_1, t.td_banc2 AS banca_appoggio_2,
                               t.td_porto AS porto_codice, t.td_valuta AS valuta_codice,
                               t.td_riferim AS riferimento,
                               CAST(t.td_note AS VARCHAR(MAX)) AS note_ordine,
                               t.td_vettor AS vettore_codice,
                               t.td_totmerce AS totale_merce, t.td_totdoc AS totale_documento,
                           t.td_totmercev AS totale_merce_valuta, t.td_totdocv AS totale_documento_valuta,
                           t.td_cambio AS cambio,
                               t.td_acuradi AS acuradi,
                               t.td_coddest AS coddest, t.td_contodest AS contodest,
                               a.an_descr1 AS fornitore_nome, a.an_indir AS fornitore_indirizzo,
                               a.an_cap AS fornitore_cap, a.an_citta AS fornitore_citta,
                               a.an_prov AS fornitore_prov, a.an_pariva AS fornitore_pariva,
                               a.an_email AS fornitore_email, a.an_faxtlx AS fornitore_fax,
                               a.an_categ AS fornitore_categ,
                               'IT' AS fornitore_tipo,
                               a.an_banc1 AS fornitore_banca_1, a.an_banc2 AS fornitore_banca_2,
                               CAST(a.an_note AS VARCHAR(MAX)) AS fornitore_note,
                               CAST(a.an_note2 AS VARCHAR(MAX)) AS fornitore_note2,
                               p.tb_despaga AS pagamento_descr,
                               pt.tb_desport AS porto_descr,
                               v.tb_desvalu AS valuta_sigla, v.tb_nomvalu AS valuta_nome,
                               d.dd_nomdest AS dest_nome, d.dd_inddest AS dest_indirizzo,
                               d.dd_capdest AS dest_cap, d.dd_locdest AS dest_citta,
                               d.dd_prodest AS dest_prov
                        FROM dbo.testord t
                        LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                        LEFT JOIN dbo.tabpaga p ON t.td_codpaga = p.tb_codpaga
                        LEFT JOIN dbo.tabport pt ON t.codditt = pt.codditt AND t.td_porto = pt.tb_codport
                        LEFT JOIN dbo.tabvalu v ON t.td_valuta = v.tb_codvalu
                        LEFT JOIN dbo.destdiv d ON t.codditt = d.codditt
                                                 AND t.td_contodest = d.dd_conto
                                                 AND t.td_coddest = d.dd_coddest
                        WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                          AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
                    `);
            } else throw colErr;
        }

        if (!testata.recordset.length) return null;
        const ordine = testata.recordset[0];

        const righeRes = await pool.request()
            .input('anno', sql.SmallInt, anno)
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, numord)
            .input('fornitore', sql.Int, ordine.fornitore_codice)
            .query(`
                SELECT m.mo_riga, m.mo_codart, m.mo_descr, m.mo_desint,
                       m.mo_unmis, m.mo_ump, m.mo_quant, m.mo_colli,
                       m.mo_prezzo, m.mo_prezvalc, m.mo_valore, m.mo_datcons,
                       m.mo_fase, m.mo_magaz, m.mo_lotto,
                       m.mo_scont1, m.mo_scont2, m.mo_scont3,
                       m.mo_perqta,
                       CAST(m.mo_note AS VARCHAR(MAX)) AS mo_note,
                       c.caf_codarfo AS rif_fornitore,
                       c.caf_desnote AS rif_note,
                       CAST(ar.ar_note AS VARCHAR(MAX)) AS ar_note,
                       ar.ar_conver, ar.ar_codalt, ar.ar_unmis AS ar_un
                FROM dbo.movord m
                LEFT JOIN dbo.codarfo c ON c.codditt = 'UJET11'
                    AND c.caf_conto = @fornitore AND c.caf_codart = m.mo_codart
                LEFT JOIN dbo.artico ar ON ar.codditt = 'UJET11' AND ar.ar_codart = m.mo_codart
                WHERE m.codditt = 'UJET11' AND m.mo_tipork = 'O'
                  AND m.mo_anno = @anno AND m.mo_serie = @serie AND m.mo_numord = @numord
                  AND m.mo_stasino <> 'N'
                ORDER BY m.mo_datcons, m.mo_riga
            `);

        return { ordine, righe: righeRes.recordset };
    }

    return {
        getSpSuffix, getSpName,
        executeSqlFile, compilaTemplate,
        deployProductionObjects, deployTestObjects, dropTestSPs, cleanupStaleConfermatiPending,
        checkSpExists, getUserId, getPoolRiep, getPoliticaRiordino,
        getServerDest, fetchOrdineCompleto
    };
}

module.exports = createHelpers;
