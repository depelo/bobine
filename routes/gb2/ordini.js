/**
 * GB2 Routes — Emissione ordini + PDF + storico + duplicati
 */
const { generaPdfOrdine } = require('../../utils/pdfOrdine');
module.exports = function(router, deps) {
    const { sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
            PRODUCTION_PROFILE, authMiddleware, getPoolBcube } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const getSpName = helpers.getSpName;
    const checkSpExists = helpers.checkSpExists;
    const deployProductionObjects = helpers.deployProductionObjects;
    const deployTestObjects = helpers.deployTestObjects;

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

// ============================================================

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

        // Marca l'ambiente sulle righe ordini_emessi appena create dalla SP
        try {
            await poolSP.request()
                .input('anno', sql.SmallInt, ordine.anno)
                .input('serie', sql.VarChar(3), ordine.serie)
                .input('numord', sql.Int, ordine.numord)
                .input('ambiente', sql.VarChar(20), ambiente)
                .query(`UPDATE dbo.ordini_emessi SET ambiente=@ambiente WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord`);
        } catch (ambErr) {
            console.warn('[Emetti Ordine] Update ambiente fallito (colonna potrebbe non esistere):', ambErr.message);
        }

        // Aggiorna SnapshotProposte: segna le proposte come gestite
        if (elaborazione_id) {
            try {
                const poolGB2 = await getPoolProd();
                // Recupera gli ordini_emessi appena inseriti dalla SP
                const oeRes = await poolSP.request()
                    .input('anno', sql.SmallInt, ordine.anno)
                    .input('serie', sql.VarChar(3), ordine.serie)
                    .input('numord', sql.Int, ordine.numord)
                    .query(`SELECT id, ol_progr FROM dbo.ordini_emessi WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord`);

                for (const oe of oeRes.recordset) {
                    await poolGB2.request()
                        .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                        .input('progr', sql.Int, oe.ol_progr)
                        .input('oeId', sql.Int, oe.id)
                        .query(`
                            UPDATE [GB2].[dbo].[SnapshotProposte]
                            SET Gestita = 1, OrdineEmessoID = @oeId, UpdatedAt = GETDATE()
                            WHERE ElaborazioneID = @eid AND ol_progr = @progr
                        `);
                }

                // Aggiorna contatore gestite
                const cntRes = await poolGB2.request()
                    .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                    .query(`SELECT COUNT(*) AS cnt FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID=@eid AND Gestita=1`);
                await poolGB2.request()
                    .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                    .input('gestite', sql.Int, cntRes.recordset[0].cnt)
                    .query(`UPDATE [GB2].[dbo].[ElaborazioniMRP] SET TotaleGestite=@gestite, UpdatedAt=GETDATE() WHERE ID=@eid`);
            } catch (snapErr) {
                console.warn('[Emetti Ordine] Aggiornamento snapshot fallito (continuo):', snapErr.message);
            }
        }

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
                const ambienteBatch = dbProf.ambiente || 'produzione';
                const pdfBuffer = await generaPdfOrdine(ordine, righeOrdine, { ambiente: ambienteBatch });

                // Marca ambiente
                try {
                    await poolSP.request()
                        .input('anno', sql.SmallInt, ordine.anno)
                        .input('serie', sql.VarChar(3), ordine.serie)
                        .input('numord', sql.Int, ordine.numord)
                        .input('ambiente', sql.VarChar(20), ambienteBatch)
                        .query(`UPDATE dbo.ordini_emessi SET ambiente=@ambiente WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord`);
                } catch (_) {}

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
        const uid = getUserId(req);
        const annoInt = parseInt(anno, 10);
        const numordInt = parseInt(numord, 10);

        // Query testata arricchita — tutti i JOIN necessari per il PDF completo.
        // In prova: tutte le tabelle sono in UJET11 direttamente.
        // In produzione: le viste MRP devono includere tabport, tabvalu, destdiv
        // (se mancano, Fabrizio le crea come le altre 21 gia esistenti).
        // Fallback solo per HH_TipoReport che potrebbe non essere ancora deployata.
        let testata;
        try {
            testata = await pool.request()
                .input('anno', sql.SmallInt, annoInt)
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, numordInt)
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
            // Fallback: se HH_TipoReport non esiste, retry con 'IT' come default
            if (colErr.message.includes('HH_TipoReport')) {
                testata = await pool.request()
                    .input('anno', sql.SmallInt, annoInt)
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, numordInt)
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

        if (!testata.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato' });
        }

        const ordine = testata.recordset[0];

        // Query righe arricchita — con note, lotto, sconti, rif. fornitore, note articolo
        // In prova: tutte le tabelle sono disponibili direttamente.
        // In produzione: servono viste per codarfo e artico (Fabrizio le crea se mancano).
        const righeRes = await pool.request()
            .input('anno', sql.SmallInt, annoInt)
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, numordInt)
            .input('fornitore', sql.Int, ordine.fornitore_codice)
            .query(`
                SELECT m.mo_riga, m.mo_codart, m.mo_descr, m.mo_desint,
                       m.mo_unmis, m.mo_ump, m.mo_quant, m.mo_colli,
                       m.mo_prezzo, m.mo_valore, m.mo_datcons,
                       m.mo_fase, m.mo_magaz, m.mo_lotto,
                       m.mo_scont1, m.mo_scont2, m.mo_scont3,
                       CAST(m.mo_note AS VARCHAR(MAX)) AS mo_note,
                       c.caf_codarfo AS rif_fornitore,
                       c.caf_desnote AS rif_note,
                       CAST(ar.ar_note AS VARCHAR(500)) AS ar_note,
                       ar.ar_conver, ar.ar_codalt
                FROM dbo.movord m
                LEFT JOIN dbo.codarfo c ON c.codditt = 'UJET11'
                    AND c.caf_conto = @fornitore AND c.caf_codart = m.mo_codart
                LEFT JOIN dbo.artico ar ON ar.codditt = 'UJET11' AND ar.ar_codart = m.mo_codart
                WHERE m.codditt = 'UJET11' AND m.mo_tipork = 'O'
                  AND m.mo_anno = @anno AND m.mo_serie = @serie AND m.mo_numord = @numord
                  AND m.mo_stasino <> 'N'
                ORDER BY m.mo_riga
            `);

        const ambiente = isProduction(uid) ? 'produzione' : 'prova';
        const pdfBuffer = await generaPdfOrdine(ordine, righeRes.recordset, { ambiente });

        // Nome file formato BCube
        const fornNome = (ordine.fornitore_nome || '').trim().replace(/[\\/:*?"<>|]/g, '_');
        const dataElab = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `OrdineForn${anno}${serie}${String(numord).padStart(6, '0')}${ordine.fornitore_codice}${fornNome}${dataElab}.PDF`;
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

router.get('/storico-ordini', authMiddleware, async (req, res) => {
    try {
        // ordini_emessi + testord + anagra vivono in MRP@163 (sempre, anche per profili prova)
        const pool = await getPoolProd();
        const { elaborazione_id, fornitore, da, a } = req.query;
        const profile = getActiveProfile(getUserId(req));
        const ambiente = (profile && profile.ambiente) || 'produzione';

        let where = '1=1';
        const rq = pool.request();

        // Filtra per ambiente corrente (produzione/prova)
        // Usa try nella query principale; nel fallback si omette se colonna non esiste
        let hasAmbienteFilter = true;
        where += ' AND ISNULL(oe.ambiente, \'produzione\') = @ambiente';
        rq.input('ambiente', sql.VarChar(20), ambiente);

        if (elaborazione_id) {
            // Filtra per ordini le cui proposte (ol_progr) fanno parte della snapshot
            // dell'elaborazione corrente — non per elaborazione_id testuale che può
            // avere formato diverso (vecchio timestamp vs nuovo ID intero)
            where += ' AND oe.ol_progr IN (SELECT ol_progr FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID = @eid)';
            rq.input('eid', sql.Int, parseInt(elaborazione_id, 10));
        }
        if (fornitore) {
            where += ' AND oe.ol_conto = @forn';
            rq.input('forn', sql.Int, parseInt(fornitore, 10));
        }
        if (da) {
            where += ' AND oe.data_emissione >= @da';
            rq.input('da', sql.DateTime, new Date(da));
        }
        if (a) {
            where += ' AND oe.data_emissione <= @a';
            rq.input('a', sql.DateTime, new Date(a));
        }

        // Query con fallback per colonne email (potrebbero non esistere ancora)
        let queryResult;
        try {
            queryResult = await rq.query(`
                SELECT
                    oe.ord_anno, oe.ord_serie, oe.ord_numord,
                    oe.ol_conto AS fornitore_codice,
                    MAX(an.an_descr1) AS fornitore_nome,
                    MIN(oe.data_emissione) AS data_emissione,
                    oe.elaborazione_id,
                    COUNT(*) AS num_righe,
                    MAX(t.td_totdoc) AS totale_documento,
                    oe.operatore,
                    MAX(CAST(ISNULL(oe.email_inviata, 0) AS INT)) AS email_inviata,
                    MAX(oe.email_inviata_il) AS email_inviata_il
                FROM dbo.ordini_emessi oe
                LEFT JOIN dbo.testord t
                    ON t.codditt='UJET11' AND t.td_tipork='O'
                    AND t.td_anno=oe.ord_anno AND t.td_serie=oe.ord_serie AND t.td_numord=oe.ord_numord
                LEFT JOIN dbo.anagra an ON oe.ol_conto = an.an_conto
                WHERE ${where}
                GROUP BY oe.ord_anno, oe.ord_serie, oe.ord_numord, oe.ol_conto, oe.elaborazione_id, oe.operatore
                ORDER BY MIN(oe.data_emissione) DESC
            `);
        } catch (colErr) {
            // Fallback senza colonne email/ambiente (pre-deploy: colonne non esistono ancora)
            const where2 = where.replace(/ AND ISNULL\(oe\.ambiente.*?@ambiente\)/, '');
            const rq2 = pool.request();
            if (elaborazione_id) rq2.input('eid', sql.Int, parseInt(elaborazione_id, 10));
            if (fornitore) rq2.input('forn', sql.Int, parseInt(fornitore, 10));
            if (da) rq2.input('da', sql.DateTime, new Date(da));
            if (a) rq2.input('a', sql.DateTime, new Date(a));
            queryResult = await rq2.query(`
                SELECT
                    oe.ord_anno, oe.ord_serie, oe.ord_numord,
                    oe.ol_conto AS fornitore_codice,
                    MAX(an.an_descr1) AS fornitore_nome,
                    MIN(oe.data_emissione) AS data_emissione,
                    oe.elaborazione_id,
                    COUNT(*) AS num_righe,
                    MAX(t.td_totdoc) AS totale_documento,
                    oe.operatore,
                    0 AS email_inviata,
                    NULL AS email_inviata_il
                FROM dbo.ordini_emessi oe
                LEFT JOIN dbo.testord t
                    ON t.codditt='UJET11' AND t.td_tipork='O'
                    AND t.td_anno=oe.ord_anno AND t.td_serie=oe.ord_serie AND t.td_numord=oe.ord_numord
                LEFT JOIN dbo.anagra an ON oe.ol_conto = an.an_conto
                WHERE ${where2}
                GROUP BY oe.ord_anno, oe.ord_serie, oe.ord_numord, oe.ol_conto, oe.elaborazione_id, oe.operatore
                ORDER BY MIN(oe.data_emissione) DESC
            `);
        }

        res.json({ ordini: queryResult.recordset });
    } catch (err) {
        console.error('[Storico Ordini] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Dettaglio singolo ordine (per riapertura modale risultato)
router.get('/ordine-dettaglio/:anno/:serie/:numord', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord } = req.params;
        // testord/movord/anagra/ordini_emessi sono su MRP@163 (sempre)
        const pool = await getPoolProd();

        // Testata ordine + fornitore
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
        } catch (_) {}

        const ordine = { ...testata.recordset[0], pagamento_descr: pag_descr };

        // Righe ordine
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

        // Stato email da ordini_emessi
        let emailInviata = false, emailInviataIl = null;
        try {
            const oeRes = await pool.request()
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`
                    SELECT TOP 1 ISNULL(email_inviata, 0) AS email_inviata, email_inviata_il
                    FROM dbo.ordini_emessi
                    WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord
                `);
            if (oeRes.recordset.length) {
                emailInviata = !!oeRes.recordset[0].email_inviata;
                emailInviataIl = oeRes.recordset[0].email_inviata_il;
            }
        } catch (_) {}

        // Genera PDF
        const dbProfile = getActiveProfile(getUserId(req));
        const ambiente = (dbProfile && dbProfile.ambiente) || 'produzione';
        const pdfBuffer = await generaPdfOrdine(ordine, righeRes.recordset, { ambiente });

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
                num_righe: righeRes.recordset.length,
                email_inviata: emailInviata,
                email_inviata_il: emailInviataIl
            },
            righe: righeRes.recordset,
            pdf_base64: pdfBuffer.toString('base64'),
            pdf_filename: `OrdineForn${ordine.anno}${ordine.serie}${String(ordine.numord).padStart(6,'0')}.pdf`
        });
    } catch (err) {
        console.error('[Ordine Dettaglio] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Controllo duplicati pre-emissione
router.post('/controlla-duplicato', authMiddleware, async (req, res) => {
    try {
        const { fornitore_codice, elaborazione_id, articoli } = req.body;
        if (!fornitore_codice || !elaborazione_id || !Array.isArray(articoli)) {
            return res.json({ hasDuplicati: false, duplicati: [] });
        }

        // ordini_emessi è sempre su MRP@163
        const pool = await getPoolProd();
        const oeRes = await pool.request()
            .input('forn', sql.Int, parseInt(fornitore_codice, 10))
            .input('eid', sql.VarChar(50), String(elaborazione_id))
            .query(`
                SELECT ol_codart, ol_fase, ol_magaz, ord_numord, ord_serie, data_emissione
                FROM dbo.ordini_emessi
                WHERE ol_conto = @forn AND elaborazione_id = @eid
            `);

        // Confronta con articoli richiesti
        const emessiSet = new Set(oeRes.recordset.map(r => `${r.ol_codart}|${r.ol_fase}|${r.ol_magaz}`));
        const duplicati = [];
        for (const art of articoli) {
            const key = `${art.codart}|${art.fase || 0}|${art.magaz || 1}`;
            if (emessiSet.has(key)) {
                const match = oeRes.recordset.find(r => `${r.ol_codart}|${r.ol_fase}|${r.ol_magaz}` === key);
                duplicati.push({
                    codart: art.codart,
                    fase: art.fase || 0,
                    magaz: art.magaz || 1,
                    ordine: `${match.ord_numord}/${match.ord_serie}`,
                    data: match.data_emissione
                });
            }
        }

        res.json({ hasDuplicati: duplicati.length > 0, duplicati });
    } catch (err) {
        console.error('[Controlla Duplicato] Errore:', err);
        res.json({ hasDuplicati: false, duplicati: [] });
    }
});

};
