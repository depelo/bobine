/**
 * GB2 Routes — Emissione ordini + PDF + storico + duplicati
 */
const { generaPdfOrdine } = require('../../utils/pdfOrdine');
module.exports = function(router, deps) {
    const { sql, getPoolDest, getPool163, getActiveProfile,
            PRODUCTION_PROFILE, authMiddleware } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const getSpName = helpers.getSpName;
    const checkSpExists = helpers.checkSpExists;
    const deployProductionObjects = helpers.deployProductionObjects;
    const deployTestObjects = helpers.deployTestObjects;

router.get('/health', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolDest(getUserId(req));
        const result = await pool.request().query('SELECT 1 AS ok');
        const poolMRP = await getPoolDest(getUserId(req));
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
        const poolProd = await getPool163();
        const uid = getUserId(req);
        const profile = getActiveProfile(uid);
        const poolTarget = await getPoolDest(uid);
        const deploy = await deployTestObjects(poolProd, poolTarget, profile);
        res.json({ success: true, results: deploy.results, hasRiep: deploy.hasRiep });
    } catch (err) {
        res.status(500).json({ error: err.message, detail: 'Errore durante il deploy delle stored procedure' });
    }
});

// Verifica esistenza SP senza fare nulla
router.get('/check-sp', authMiddleware, async (req, res) => {
    try {
        const uid = getUserId(req);
        const poolSP = await getPoolDest(uid);
        const profile = getActiveProfile(uid);
        const spName = getSpName('usp_CreaOrdineFornitore', profile);
        const spExists = await checkSpExists(poolSP, spName);
        // ordini_emessi sta su 163/MRP — non sul server destinazione
        const pool163 = await getPool163();
        const tblResult = await pool163.request().query(
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

        // Le SP vivono nel DB [GB2] del server di destinazione (BCUBE2 o prova)
        const uid = getUserId(req);
        const poolSP = await getPoolDest(uid);
        const profile = getActiveProfile(uid);
        const spName = '[GB2_SP].[dbo].' + getSpName('usp_CreaOrdineFornitore', profile);

        // Check SP esiste
        const spExists = await checkSpExists(poolSP, spName);
        if (!spExists) {
            return res.status(409).json({
                error: 'SP_NOT_FOUND',
                sp: spName,
                message: `La stored procedure ${spName} non esiste. Deployare prima con POST /api/mrp/deploy-sp`
            });
        }

        // Chiama la SP — con firma operatore GB2{IDUser}
        const { elaborazione_id } = req.body;
        const operatoreCode = uid ? 'GB2' + uid : 'GB2IDerror';
        const result = await poolSP.request()
            .input('json_articoli', sql.NVarChar(sql.MAX), JSON.stringify(articoli))
            .input('fornitore_codice', sql.Int, parseInt(fornitore_codice, 10))
            .input('operatore', sql.VarChar(20), operatoreCode)
            .input('elaborazione_id', sql.VarChar(50), elaborazione_id || '')
            .execute(spName);

        if (!result.recordsets || !result.recordsets[0] || !result.recordsets[0][0]) {
            return res.status(500).json({ error: 'La stored procedure non ha restituito dati' });
        }

        const ordine = result.recordsets[0][0];
        const righeOrdine = result.recordsets[1] || [];

        // Genera PDF (con label PROVA se non in server default)
        const dbProfile = getActiveProfile(getUserId(req));
        const serverDest = (dbProfile.server || 'BCUBE2').trim();
        const isProva = !!(dbProfile._testDbId);
        const pdfBuffer = await generaPdfOrdine(ordine, righeOrdine, { ambiente: isProva ? 'prova' : 'produzione' });

        // Aggiornamento saldi BCube (keyord+artpro) avviene DENTRO la SP stessa
        // (EXEC [UJET11].[dbo].bussp_bsorgsor9_faggiorn2 — locale, zero MSDTC)

        // ── Registrazione in ordini_emessi ──
        // ordini_emessi vive SEMPRE su MRP@163 (poolProd) — il server dell'applicazione.
        // La SP su BCUBE2/prova non ha visibilita su 163, quindi l'INSERT lo fa Node.js.
        const poolOE = await getPool163();
        const oeIds = []; // ID inseriti, servono per SnapshotProposte
        try {
            for (const riga of righeOrdine) {
                if (!riga.ol_progr || riga.ol_progr <= 0) continue;
                const insRes = await poolOE.request()
                    .input('ol_progr', sql.Int, riga.ol_progr)
                    .input('ol_codart', sql.NVarChar, riga.mo_codart)
                    .input('ol_conto', sql.Int, parseInt(fornitore_codice, 10))
                    .input('ol_quant', sql.Decimal(18, 9), riga.mo_quant)
                    .input('ol_fase', sql.SmallInt, riga.mo_fase || 0)
                    .input('ol_magaz', sql.SmallInt, riga.mo_magaz || 1)
                    .input('ord_anno', sql.SmallInt, ordine.anno)
                    .input('ord_serie', sql.VarChar(3), ordine.serie)
                    .input('ord_numord', sql.Int, ordine.numord)
                    .input('ord_riga', sql.Int, riga.mo_riga)
                    .input('quantita_ordinata', sql.Decimal(18, 9), riga.mo_quant)
                    .input('elaborazione_id', sql.VarChar(50), elaborazione_id || '')
                    .input('operatore', sql.VarChar(20), operatoreCode)
                    .input('ambiente', sql.VarChar(20), serverDest)
                    .query(`INSERT INTO dbo.ordini_emessi
                        (ol_progr, ol_tipork, ol_codart, ol_conto, ol_quant, ol_fase, ol_magaz,
                         ord_anno, ord_serie, ord_numord, ord_riga,
                         quantita_ordinata, elaborazione_id, data_emissione, operatore, ambiente)
                        VALUES (@ol_progr, 'O', @ol_codart, @ol_conto, @ol_quant, @ol_fase, @ol_magaz,
                                @ord_anno, @ord_serie, @ord_numord, @ord_riga,
                                @quantita_ordinata, @elaborazione_id, GETDATE(), @operatore, @ambiente);
                        SELECT SCOPE_IDENTITY() AS id`);
                const newId = insRes.recordset[0]?.id;
                if (newId) oeIds.push({ id: newId, ol_progr: riga.ol_progr });
            }
        } catch (oeErr) {
            console.warn('[Emetti Ordine] INSERT ordini_emessi fallito (ordine BCube creato):', oeErr.message);
        }

        // ── Aggiorna SnapshotProposte: segna le proposte come gestite ──
        if (elaborazione_id && oeIds.length > 0) {
            try {
                for (const oe of oeIds) {
                    await poolOE.request()
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
                const cntRes = await poolOE.request()
                    .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                    .query(`SELECT COUNT(*) AS cnt FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID=@eid AND Gestita=1`);
                await poolOE.request()
                    .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                    .input('gestite', sql.Int, cntRes.recordset[0].cnt)
                    .query(`UPDATE [GB2].[dbo].[ElaborazioniMRP] SET TotaleGestite=@gestite, UpdatedAt=GETDATE() WHERE ID=@eid`);
            } catch (snapErr) {
                console.warn('[Emetti Ordine] Aggiornamento snapshot fallito (continuo):', snapErr.message);
            }
        }

        res.json({
            success: true,
            ambiente: serverDest,
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

        const uid = getUserId(req);
        const poolSP = await getPoolDest(uid);
        const operatoreCode = uid ? 'GB2' + uid : 'GB2IDerror';
        const profile = getActiveProfile(uid);
        const spName = '[GB2_SP].[dbo].' + getSpName('usp_CreaOrdineFornitore', profile);
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
                    .input('operatore', sql.VarChar(20), operatoreCode)
                    .input('elaborazione_id', sql.VarChar(50), req.body.elaborazione_id || '')
                    .execute(spName);

                const ordine = result.recordsets[0][0];
                const righeOrdine = result.recordsets[1] || [];
                const dbProf = getActiveProfile(getUserId(req));
                const serverDestBatch = (dbProf.server || 'BCUBE2').trim();
                const isProvaBatch = !!(dbProf._testDbId);
                const pdfBuffer = await generaPdfOrdine(ordine, righeOrdine, { ambiente: isProvaBatch ? 'prova' : 'produzione' });

                // Marca ambiente
                try {
                    await poolSP.request()
                        .input('anno', sql.SmallInt, ordine.anno)
                        .input('serie', sql.VarChar(3), ordine.serie)
                        .input('numord', sql.Int, ordine.numord)
                        .input('ambiente', sql.VarChar(20), serverDestBatch)
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

// ============================================================
// Modifica un ordine fornitore ESISTENTE aggiungendo N righe nuove
// (merge "Unisci" — preserva numord, ricalcola totali, rinfresca BCube)
// ============================================================
router.post('/modifica-ordine', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord, fornitore_codice, articoli, elaborazione_id } = req.body;

        if (!anno || !serie || !numord) return res.status(400).json({ error: 'anno/serie/numord obbligatori' });
        if (!fornitore_codice) return res.status(400).json({ error: 'fornitore_codice obbligatorio' });
        if (!Array.isArray(articoli) || articoli.length === 0) return res.status(400).json({ error: 'articoli vuoto' });

        const uid = getUserId(req);
        const annoInt = parseInt(anno, 10);
        const numordInt = parseInt(numord, 10);
        const fornCodeInt = parseInt(fornitore_codice, 10);

        const poolSP = await getPoolDest(uid);
        const profile = getActiveProfile(uid);
        const spName = '[GB2_SP].[dbo].' + getSpName('usp_AggiungiRigheOrdineFornitore', profile);

        // Check SP esiste (auto-deploy lato client via 409)
        const spExists = await checkSpExists(poolSP, spName);
        if (!spExists) {
            return res.status(409).json({
                error: 'SP_NOT_FOUND',
                sp: spName,
                message: `La stored procedure ${spName} non esiste. Deployare prima con POST /api/mrp/deploy-sp`
            });
        }

        // Pre-check su ordine (stato + fornitore coerente) — errori chiari prima di chiamare la SP
        const preCheck = await poolSP.request()
            .input('anno', sql.SmallInt, annoInt)
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, numordInt)
            .query(`SELECT td_conto, td_flevas FROM dbo.testord
                    WHERE codditt='UJET11' AND td_tipork='O'
                      AND td_anno=@anno AND td_serie=@serie AND td_numord=@numord`);
        if (!preCheck.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato' });
        }
        if (preCheck.recordset[0].td_conto !== fornCodeInt) {
            return res.status(409).json({
                error: 'FORNITORE_MISMATCH',
                message: 'Il fornitore dell\'ordine esistente non corrisponde a quello degli articoli da aggiungere'
            });
        }
        if (preCheck.recordset[0].td_flevas !== 'N') {
            return res.status(409).json({
                error: 'ORDINE_IN_EVASIONE',
                message: 'Ordine in evasione: non modificabile'
            });
        }

        const evasCheck = await poolSP.request()
            .input('anno', sql.SmallInt, annoInt)
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, numordInt)
            .query(`SELECT COUNT(*) AS cnt FROM dbo.movord
                    WHERE codditt='UJET11' AND mo_tipork='O'
                      AND mo_anno=@anno AND mo_serie=@serie AND mo_numord=@numord
                      AND (mo_quaeva > 0 OR mo_quapre > 0)`);
        if (evasCheck.recordset[0].cnt > 0) {
            return res.status(409).json({
                error: 'MERCE_EVASA',
                message: 'Ordine con righe evase o prenotate: non modificabile'
            });
        }

        // Verifica email_inviata su ordini_emessi@163 — safety net per il merge
        const poolOE = await getPool163();
        const emailCheck = await poolOE.request()
            .input('anno', sql.SmallInt, annoInt)
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, numordInt)
            .query(`SELECT TOP 1 ISNULL(email_inviata, 0) AS email_inviata
                    FROM dbo.ordini_emessi
                    WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord
                    ORDER BY email_inviata DESC`);
        if (emailCheck.recordset.length && emailCheck.recordset[0].email_inviata) {
            return res.status(409).json({
                error: 'EMAIL_GIA_INVIATA',
                message: 'Email gia inviata per questo ordine: non modificabile. Crea un ordine separato.'
            });
        }

        // Chiama la SP
        const operatoreCode = uid ? 'GB2' + uid : 'GB2IDerror';
        const spReq = poolSP.request();
        spReq.timeout = 60000;
        const result = await spReq
            .input('json_articoli', sql.NVarChar(sql.MAX), JSON.stringify(articoli))
            .input('anno', sql.SmallInt, annoInt)
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, numordInt)
            .input('operatore', sql.VarChar(20), operatoreCode)
            .input('elaborazione_id', sql.VarChar(50), elaborazione_id || '')
            .execute(spName);

        if (!result.recordsets || !result.recordsets[0] || !result.recordsets[0][0]) {
            return res.status(500).json({ error: 'La stored procedure non ha restituito dati' });
        }

        const ordine = result.recordsets[0][0];
        const righeOrdine = result.recordsets[1] || [];
        const righeNuove = righeOrdine.filter(r => r.is_new === 1 || r.is_new === true);

        // PDF rigenerato con TUTTE le righe (vecchie + nuove)
        const dbProfile = getActiveProfile(uid);
        const serverDest = (dbProfile.server || 'BCUBE2').trim();
        const isProva = !!(dbProfile._testDbId);
        const pdfBuffer = await generaPdfOrdine(ordine, righeOrdine, { ambiente: isProva ? 'prova' : 'produzione' });

        // ── Registrazione SOLO delle nuove righe in ordini_emessi@163 ──
        const oeIds = [];
        try {
            for (const riga of righeNuove) {
                if (!riga.ol_progr || riga.ol_progr <= 0) continue;
                const insRes = await poolOE.request()
                    .input('ol_progr', sql.Int, riga.ol_progr)
                    .input('ol_codart', sql.NVarChar, riga.mo_codart)
                    .input('ol_conto', sql.Int, fornCodeInt)
                    .input('ol_quant', sql.Decimal(18, 9), riga.mo_quant)
                    .input('ol_fase', sql.SmallInt, riga.mo_fase || 0)
                    .input('ol_magaz', sql.SmallInt, riga.mo_magaz || 1)
                    .input('ord_anno', sql.SmallInt, ordine.anno)
                    .input('ord_serie', sql.VarChar(3), ordine.serie)
                    .input('ord_numord', sql.Int, ordine.numord)
                    .input('ord_riga', sql.Int, riga.mo_riga)
                    .input('quantita_ordinata', sql.Decimal(18, 9), riga.mo_quant)
                    .input('elaborazione_id', sql.VarChar(50), elaborazione_id || '')
                    .input('operatore', sql.VarChar(20), operatoreCode)
                    .input('ambiente', sql.VarChar(20), serverDest)
                    .query(`INSERT INTO dbo.ordini_emessi
                        (ol_progr, ol_tipork, ol_codart, ol_conto, ol_quant, ol_fase, ol_magaz,
                         ord_anno, ord_serie, ord_numord, ord_riga,
                         quantita_ordinata, elaborazione_id, data_emissione, operatore, ambiente)
                        VALUES (@ol_progr, 'O', @ol_codart, @ol_conto, @ol_quant, @ol_fase, @ol_magaz,
                                @ord_anno, @ord_serie, @ord_numord, @ord_riga,
                                @quantita_ordinata, @elaborazione_id, GETDATE(), @operatore, @ambiente);
                        SELECT SCOPE_IDENTITY() AS id`);
                const newId = insRes.recordset[0]?.id;
                if (newId) oeIds.push({ id: newId, ol_progr: riga.ol_progr });
            }
        } catch (oeErr) {
            console.warn('[Modifica Ordine] INSERT ordini_emessi fallito (ordine BCube modificato):', oeErr.message);
        }

        // ── Aggiorna SnapshotProposte per le nuove righe ──
        if (elaborazione_id && oeIds.length > 0) {
            try {
                for (const oe of oeIds) {
                    await poolOE.request()
                        .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                        .input('progr', sql.Int, oe.ol_progr)
                        .input('oeId', sql.Int, oe.id)
                        .query(`
                            UPDATE [GB2].[dbo].[SnapshotProposte]
                            SET Gestita = 1, OrdineEmessoID = @oeId, UpdatedAt = GETDATE()
                            WHERE ElaborazioneID = @eid AND ol_progr = @progr
                        `);
                }
                const cntRes = await poolOE.request()
                    .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                    .query(`SELECT COUNT(*) AS cnt FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID=@eid AND Gestita=1`);
                await poolOE.request()
                    .input('eid', sql.Int, parseInt(elaborazione_id, 10))
                    .input('gestite', sql.Int, cntRes.recordset[0].cnt)
                    .query(`UPDATE [GB2].[dbo].[ElaborazioniMRP] SET TotaleGestite=@gestite, UpdatedAt=GETDATE() WHERE ID=@eid`);
            } catch (snapErr) {
                console.warn('[Modifica Ordine] Aggiornamento snapshot fallito (continuo):', snapErr.message);
            }
        }

        res.json({
            success: true,
            ambiente: serverDest,
            modificato: true,
            righe_aggiunte: righeNuove.length,
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
        console.error('[Modifica Ordine] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Annulla un ordine fornitore gia emesso
// Chiama la SP BCube bussp_bsorgsor9_fcancella che fa DELETE fisico + storno saldi
router.post('/annulla-ordine', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord } = req.body;
        if (!anno || !serie || !numord) return res.status(400).json({ error: 'anno, serie e numord obbligatori' });

        const uid = getUserId(req);
        const annoInt = parseInt(anno, 10);
        const numordInt = parseInt(numord, 10);

        const poolERP = await getPoolDest(uid);

        {
            // 1. Verifica che l'ordine esista
            const checkOrd = await poolERP.request()
                .input('anno', sql.SmallInt, annoInt)
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, numordInt)
                .query(`SELECT td_numord, td_flevas FROM dbo.testord
                        WHERE codditt='UJET11' AND td_tipork='O'
                          AND td_anno=@anno AND td_serie=@serie AND td_numord=@numord`);
            if (!checkOrd.recordset.length) {
                return res.status(404).json({ error: 'Ordine non trovato' });
            }

            // 2. Verifica nessuna merce evasa/prenotata
            const checkEvas = await poolERP.request()
                .input('anno', sql.SmallInt, annoInt)
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, numordInt)
                .query(`SELECT COUNT(*) AS cnt FROM dbo.movord
                        WHERE codditt='UJET11' AND mo_tipork='O'
                          AND mo_anno=@anno AND mo_serie=@serie AND mo_numord=@numord
                          AND (mo_quaeva > 0 OR mo_quapre > 0)`);
            if (checkEvas.recordset[0].cnt > 0) {
                return res.status(409).json({
                    error: 'MERCE_EVASA',
                    message: 'Impossibile annullare: l\'ordine ha righe con merce già evasa o prenotata. Annullare da BCube.'
                });
            }

            // 3. Recupera numerazione (come DelNuma di BCube)
            // Solo se l'ordine è l'ultimo progressivo
            const numaCheck = await poolERP.request()
                .input('anno', sql.SmallInt, annoInt)
                .input('serie', sql.VarChar(3), serie)
                .query(`SELECT tb_numprog FROM dbo.tabnuma
                        WHERE codditt='UJET11' AND tb_numtipo='O' AND tb_numserie=@serie AND tb_numcodl=@anno`);
            if (numaCheck.recordset.length && numaCheck.recordset[0].tb_numprog === numordInt) {
                await poolERP.request()
                    .input('anno', sql.SmallInt, annoInt)
                    .input('serie', sql.VarChar(3), serie)
                    .query(`UPDATE dbo.tabnuma SET tb_numprog = tb_numprog - 1
                            WHERE codditt='UJET11' AND tb_numtipo='O' AND tb_numserie=@serie AND tb_numcodl=@anno`);
                console.log('[Annulla] Numerazione recuperata: tabnuma decrementato');
            }

            // 4. Chiama SP BCube di cancellazione
            const oggi = new Date();
            const profile = getActiveProfile(uid);
            const operatore = (profile && profile.user) || 'mrpweb';
            const reqCanc = poolERP.request();
            reqCanc.timeout = 60000; // 60 secondi — la SP BCube di cancellazione è pesante
            await reqCanc
                .input('tipodoc', sql.VarChar(1), 'O')
                .input('anno', sql.SmallInt, annoInt)
                .input('serie', sql.VarChar(3), serie)
                .input('numdoc', sql.Int, numordInt)
                .input('codditt', sql.VarChar(12), 'UJET11')
                .input('bModTCO', sql.VarChar(1), 'N')
                .input('dtData', sql.DateTime, oggi)
                .input('stropnome', sql.VarChar(20), operatore)
                .execute('bussp_bsorgsor9_fcancella');

            console.log('[Annulla] Ordine', numordInt + '/' + serie + '/' + annoInt, 'cancellato da SP BCube');

            // 5. Pulizia nostra: ordini_emessi + SnapshotProposte
            // ordini_emessi vive SEMPRE su MRP@163 (poolProd) — il server dell'applicazione.
            // ORDINE CRITICO: prima riapri SnapshotProposte (servono gli ID), poi cancella.
            const poolProd = await getPool163();

            try {
                // 5a. Riapri le proposte nello snapshot PRIMA di cancellare ordini_emessi
                await poolProd.request()
                    .input('anno', sql.SmallInt, annoInt)
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, numordInt)
                    .query(`UPDATE [GB2].[dbo].[SnapshotProposte]
                            SET Gestita=0, OrdineEmessoID=NULL, UpdatedAt=GETDATE()
                            WHERE OrdineEmessoID IN (
                                SELECT id FROM dbo.ordini_emessi
                                WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord
                            )`);
            } catch (_) {}

            try {
                // 5b. Aggiorna contatore gestite nell'elaborazione
                // Recupera l'elaborazione_id dall'ordine che stiamo cancellando
                const elab = await poolProd.request()
                    .input('anno', sql.SmallInt, annoInt)
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, numordInt)
                    .query(`SELECT DISTINCT elaborazione_id FROM dbo.ordini_emessi
                            WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord
                              AND elaborazione_id <> ''`);
                for (const row of elab.recordset) {
                    const eid = parseInt(row.elaborazione_id, 10);
                    if (!eid) continue;
                    const cntRes = await poolProd.request()
                        .input('eid', sql.Int, eid)
                        .query(`SELECT COUNT(*) AS cnt FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID=@eid AND Gestita=1`);
                    await poolProd.request()
                        .input('eid', sql.Int, eid)
                        .input('gestite', sql.Int, cntRes.recordset[0].cnt)
                        .query(`UPDATE [GB2].[dbo].[ElaborazioniMRP] SET TotaleGestite=@gestite, UpdatedAt=GETDATE() WHERE ID=@eid`);
                }
            } catch (_) {}

            try {
                // 5c. ORA cancella da ordini_emessi (dopo aver usato gli ID sopra)
                await poolProd.request()
                    .input('anno', sql.SmallInt, annoInt)
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, numordInt)
                    .query(`DELETE FROM dbo.ordini_emessi
                            WHERE ord_anno=@anno AND ord_serie=@serie AND ord_numord=@numord`);
            } catch (_) {}

            res.json({ success: true, message: 'Ordine ' + numordInt + '/' + serie + ' annullato' });
        }
    } catch (err) {
        console.error('[Annulla] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Genera/scarica PDF di un ordine gia esistente
router.get('/ordine-pdf/:anno/:serie/:numord', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord } = req.params;
        const uid = getUserId(req);
        const pool = await getPoolDest(uid);
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
                ORDER BY m.mo_riga
            `);

        const dbProfPdf = getActiveProfile(uid);
        const isProvaPdf = !!(dbProfPdf._testDbId);
        const pdfBuffer = await generaPdfOrdine(ordine, righeRes.recordset, { ambiente: isProvaPdf ? 'prova' : 'produzione' });

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

// Ultimi N ordini fornitore per tool di test PDF — letti direttamente da testord (BCube),
// NON da ordini_emessi (che conterrebbe solo quelli emessi da GB2).
router.get('/ultimi-ordini-pdf', authMiddleware, async (req, res) => {
    try {
        const uid = getUserId(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const pool = await getPoolDest(uid);
        const result = await pool.request()
            .input('lim', sql.Int, limit)
            .query(`
                SELECT TOP (@lim)
                       t.td_anno AS ord_anno, t.td_serie AS ord_serie, t.td_numord AS ord_numord,
                       t.td_conto AS fornitore_codice, t.td_datord AS data_emissione,
                       a.an_descr1 AS fornitore_nome
                FROM dbo.testord t
                LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                ORDER BY t.td_datord DESC, t.td_numord DESC
            `);
        res.json({ ordini: result.recordset });
    } catch (err) {
        console.error('[ultimi-ordini-pdf]', err);
        res.status(500).json({ error: err.message });
    }
});

// Lookup ordine per numord (tool test PDF): cerca l'ordine più recente con quel numord
router.get('/cerca-ordine-pdf/:numord', authMiddleware, async (req, res) => {
    try {
        const numord = parseInt(req.params.numord, 10);
        if (!numord) return res.status(400).json({ error: 'Numero ordine non valido' });
        const uid = getUserId(req);
        const pool = await getPoolDest(uid);
        const result = await pool.request()
            .input('numord', sql.Int, numord)
            .query(`
                SELECT TOP 5 t.td_anno AS anno, t.td_serie AS serie, t.td_numord AS numord,
                       t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                       a.an_descr1 AS fornitore_nome
                FROM dbo.testord t
                LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O' AND t.td_numord = @numord
                ORDER BY t.td_anno DESC, t.td_serie DESC
            `);
        if (!result.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato' });
        }
        res.json({ ordini: result.recordset });
    } catch (err) {
        console.error('[cerca-ordine-pdf]', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API: CONFIGURAZIONE SMTP PER OPERATORE
// Ogni operatore ha la propria config SMTP in [GB2].[dbo].[UserPreferences]
// ============================================================

router.get('/storico-ordini', authMiddleware, async (req, res) => {
    try {
        const uid = getUserId(req);
        const profile = getActiveProfile(uid);
        const ambiente = (profile.server || 'BCUBE2').trim();
        const { elaborazione_id, fornitore, da, a } = req.query;

        // Query 1: ordini_emessi + elaborazioni (su 163/MRP — tabelle app)
        const poolApp = await getPool163();
        let where = 'oe.ambiente = @ambiente';
        const rq = poolApp.request();
        rq.input('ambiente', sql.VarChar(20), ambiente);

        if (elaborazione_id) {
            where += ' AND oe.elaborazione_id = @eid';
            rq.input('eid', sql.VarChar(50), elaborazione_id);
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

        const oeResult = await rq.query(`
            SELECT ord_anno, ord_serie, ord_numord, ol_conto AS fornitore_codice,
                   MIN(data_emissione) AS data_emissione, elaborazione_id,
                   COUNT(*) AS num_righe, operatore,
                   MAX(CAST(ISNULL(email_inviata, 0) AS INT)) AS email_inviata,
                   MAX(email_inviata_il) AS email_inviata_il,
                   ISNULL(origine, 'gb2') AS origine
            FROM dbo.ordini_emessi oe
            WHERE ${where}
            GROUP BY ord_anno, ord_serie, ord_numord, ol_conto, elaborazione_id, operatore, ISNULL(origine, 'gb2')
            ORDER BY MIN(data_emissione) DESC
        `);

        const ordini = oeResult.recordset;

        // Query 2: nomi fornitori + totali ordine (su BCube/UJET11 — connessione diretta)
        if (ordini.length > 0) {
            try {
                const poolErp = await getPoolDest(uid);
                const conti = [...new Set(ordini.map(o => o.fornitore_codice))];
                const ordKeys = [...new Set(ordini.map(o => o.ord_anno + '-' + o.ord_serie + '-' + o.ord_numord))];

                // Nomi fornitori — query semplice con IN (no OPENJSON per compatibilità)
                const anagMap = {};
                if (conti.length > 0) {
                    const placeholders = conti.map((_, i) => '@c' + i).join(',');
                    const rqAnag = poolErp.request();
                    conti.forEach((c, i) => rqAnag.input('c' + i, sql.Int, c));
                    const anagRes = await rqAnag.query('SELECT an_conto, an_descr1 FROM dbo.anagra WHERE an_conto IN (' + placeholders + ')');
                    anagRes.recordset.forEach(r => { anagMap[r.an_conto] = r.an_descr1; });
                }

                // Totali documenti — query semplice con IN
                const totMap = {};
                if (ordKeys.length > 0 && ordKeys.length <= 200) {
                    const rqTot = poolErp.request();
                    const conditions = [];
                    ordKeys.forEach((k, i) => {
                        const p = k.split('-');
                        rqTot.input('a' + i, sql.SmallInt, parseInt(p[0]));
                        rqTot.input('s' + i, sql.VarChar(3), p[1]);
                        rqTot.input('n' + i, sql.Int, parseInt(p[2]));
                        conditions.push('(t.td_anno=@a' + i + ' AND t.td_serie=@s' + i + ' AND t.td_numord=@n' + i + ')');
                    });
                    const totRes = await rqTot.query(
                        'SELECT t.td_anno, t.td_serie, t.td_numord, t.td_totdoc FROM dbo.testord t WHERE t.codditt=\'UJET11\' AND t.td_tipork=\'O\' AND (' + conditions.join(' OR ') + ')'
                    );
                    totRes.recordset.forEach(r => { totMap[r.td_anno + '-' + r.td_serie + '-' + r.td_numord] = r.td_totdoc; });
                }

                ordini.forEach(o => {
                    o.fornitore_nome = anagMap[o.fornitore_codice] || '';
                    o.totale_documento = totMap[o.ord_anno + '-' + o.ord_serie + '-' + o.ord_numord] || 0;
                });
            } catch (erpErr) {
                console.warn('[Storico] Enrichment ERP fallito (continuo senza nomi/totali):', erpErr.message);
            }
        }

        // Query 3: elaborazioni + snapshot fornitori per classificazione ordini
        let elaborazioni = [];
        try {
            // Elaborazioni base
            const elabRes = await poolApp.request()
                .input('ambiente2', sql.VarChar(20), ambiente)
                .query(`
                    SELECT e.ID, e.Fingerprint, e.TotaleProposte, e.TotaleGestite, e.RilevatoIl
                    FROM [GB2].[dbo].[ElaborazioniMRP] e
                    WHERE e.Ambiente = @ambiente2
                    ORDER BY e.Fingerprint DESC
                `);

            // Per ogni elaborazione, calcola conteggi confrontando ordini vs snapshot
            for (const e of elabRes.recordset) {
                const eid = e.ID;

                // Fornitori + articoli nello snapshot (le proposte MRP)
                const snapRes = await poolApp.request()
                    .input('eid', sql.Int, eid)
                    .query(`SELECT ol_conto, ol_codart, ol_quant FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID = @eid`);

                // Set di fornitori proposti e mappa articolo→quantita per match
                const fornProposti = new Set(snapRes.recordset.map(s => s.ol_conto));
                const proposteMap = {}; // key: conto_codart → ol_quant
                snapRes.recordset.forEach(s => {
                    proposteMap[s.ol_conto + '_' + s.ol_codart] = s.ol_quant;
                });

                // Ordini emessi per questa elaborazione
                const oeRes = await poolApp.request()
                    .input('eid2', sql.VarChar(50), String(eid))
                    .input('amb', sql.VarChar(20), ambiente)
                    .query(`
                        SELECT ord_anno, ord_serie, ord_numord, ol_conto, ol_codart, quantita_ordinata
                        FROM dbo.ordini_emessi
                        WHERE elaborazione_id = @eid2 AND ambiente = @amb
                    `);

                // Raggruppa per ordine e classifica
                const ordiniMap = {};
                oeRes.recordset.forEach(r => {
                    const key = r.ord_anno + '-' + r.ord_serie + '-' + r.ord_numord;
                    if (!ordiniMap[key]) ordiniMap[key] = { conto: r.ol_conto, righe: [] };
                    ordiniMap[key].righe.push(r);
                });

                let numOrdini = 0, numAccettati = 0, numModificati = 0, numIndipendenti = 0, numMisti = 0;
                let numPofIgnorate = (e.TotaleProposte || 0) - (e.TotaleGestite || 0);

                for (const ord of Object.values(ordiniMap)) {
                    numOrdini++;
                    const fornNelleProp = fornProposti.has(ord.conto);

                    if (!fornNelleProp) {
                        // Fornitore non nelle proposte → ordine indipendente
                        numIndipendenti++;
                        continue;
                    }

                    // Fornitore nelle proposte → classifica per riga
                    let righeAccettate = 0, righeModificate = 0, righeIndip = 0;
                    for (const r of ord.righe) {
                        const propKey = r.ol_conto + '_' + r.ol_codart;
                        const propQta = proposteMap[propKey];
                        if (propQta === undefined) {
                            righeIndip++; // articolo non nella proposta
                        } else if (Number(propQta) === Number(r.quantita_ordinata)) {
                            righeAccettate++;
                        } else {
                            righeModificate++;
                        }
                    }

                    if (righeIndip > 0 && (righeAccettate > 0 || righeModificate > 0)) {
                        numMisti++;
                    } else if (righeModificate > 0) {
                        numModificati++;
                    } else if (righeAccettate > 0) {
                        numAccettati++;
                    } else {
                        numIndipendenti++; // tutte le righe indipendenti
                    }
                }

                e.num_ordini = numOrdini;
                e.num_accettati = numAccettati;
                e.num_modificati = numModificati;
                e.num_indipendenti = numIndipendenti;
                e.num_misti = numMisti;
                e.num_pof_ignorate = numPofIgnorate;

                // Salva classificazione per ogni ordine (key → categoria)
                for (const [key, ord] of Object.entries(ordiniMap)) {
                    const fornNelleProp = fornProposti.has(ord.conto);
                    let cat;
                    if (!fornNelleProp) {
                        cat = 'indipendente';
                    } else {
                        let ra = 0, rm = 0, ri = 0;
                        for (const r of ord.righe) {
                            const pq = proposteMap[r.ol_conto + '_' + r.ol_codart];
                            if (pq === undefined) ri++;
                            else if (Number(pq) === Number(r.quantita_ordinata)) ra++;
                            else rm++;
                        }
                        if (ri > 0 && (ra > 0 || rm > 0)) cat = 'misto';
                        else if (rm > 0) cat = 'modificata';
                        else if (ra > 0) cat = 'accettata';
                        else cat = 'indipendente';
                    }
                    // Applica agli ordini raggruppati
                    const ordMatch = ordini.find(o =>
                        o.ord_anno + '-' + o.ord_serie + '-' + o.ord_numord === key &&
                        String(o.elaborazione_id) === String(eid)
                    );
                    if (ordMatch) ordMatch.categoria = cat;
                }
            }

            elaborazioni = elabRes.recordset;
        } catch (elabErr) {
            console.warn('[Storico] Calcolo elaborazioni fallito:', elabErr.message);
        }

        // Ordini senza elaborazione → indipendente
        ordini.forEach(o => { if (!o.categoria) o.categoria = 'indipendente'; });

        res.json({ ordini, elaborazioni });
    } catch (err) {
        console.error('[Storico Ordini] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Dettaglio completo di un'elaborazione MRP (snapshot proposte + ordini emessi)
router.get('/elaborazione-dettaglio/:id', authMiddleware, async (req, res) => {
    try {
        const elabId = parseInt(req.params.id, 10);
        const pool = await getPool163();
        const uid = getUserId(req);
        const profile = getActiveProfile(uid);
        const ambiente = (profile.server || 'BCUBE2').trim();

        // Testata elaborazione
        const elabRes = await pool.request()
            .input('eid', sql.Int, elabId)
            .input('ambiente', sql.VarChar(20), ambiente)
            .query(`
                SELECT ID, Fingerprint, TotaleProposte, TotaleGestite, RilevatoIl, Ambiente
                FROM [GB2].[dbo].[ElaborazioniMRP]
                WHERE ID = @eid AND Ambiente = @ambiente
            `);
        if (!elabRes.recordset.length) {
            return res.status(404).json({ error: 'Elaborazione non trovata' });
        }
        const elab = elabRes.recordset[0];

        // Query 1: snapshot + ordini_emessi (su 163 — tabelle app)
        const dettaglioApp = await pool.request()
            .input('eid', sql.Int, elabId)
            .query(`
                SELECT sp.ol_progr, sp.ol_codart, sp.ol_conto, sp.ol_quant, sp.ol_datcons,
                       sp.ol_unmis, sp.ol_fase, sp.ol_magaz, sp.Gestita, sp.OrdineEmessoID,
                       oe.ord_anno, oe.ord_serie, oe.ord_numord, oe.ord_riga,
                       oe.quantita_ordinata, oe.data_emissione, oe.operatore,
                       ISNULL(oe.origine, 'gb2') AS origine
                FROM [GB2].[dbo].[SnapshotProposte] sp
                LEFT JOIN dbo.ordini_emessi oe ON sp.OrdineEmessoID = oe.id
                WHERE sp.ElaborazioneID = @eid
                ORDER BY sp.ol_conto, sp.ol_codart, sp.ol_datcons
            `);

        // Query 2: nomi fornitori + descrizioni articoli (su BCube/UJET11 — connessione diretta)
        const poolErp = await getPoolDest(uid);
        const conti = [...new Set(dettaglioApp.recordset.map(r => r.ol_conto))];
        const codarts = [...new Set(dettaglioApp.recordset.map(r => r.ol_codart))];

        const anagMap = {}, artMap = {};
        try {
            if (conti.length > 0) {
                const rqA = poolErp.request();
                conti.forEach((c, i) => rqA.input('c' + i, sql.Int, c));
                const anagRes = await rqA.query('SELECT an_conto, an_descr1 FROM dbo.anagra WHERE an_conto IN (' + conti.map((_, i) => '@c' + i).join(',') + ')');
                anagRes.recordset.forEach(r => { anagMap[r.an_conto] = r.an_descr1; });
            }
            if (codarts.length > 0) {
                const rqAr = poolErp.request();
                codarts.forEach((c, i) => rqAr.input('a' + i, sql.NVarChar, c));
                const artRes = await rqAr.query('SELECT ar_codart, ar_descr FROM dbo.artico WHERE ar_codart IN (' + codarts.map((_, i) => '@a' + i).join(',') + ')');
                artRes.recordset.forEach(r => { artMap[r.ar_codart] = r.ar_descr; });
            }
        } catch (erpErr) {
            console.warn('[Elab Dettaglio] Enrichment ERP fallito:', erpErr.message);
        }

        // Merge in Node.js
        const dettaglio = { recordset: dettaglioApp.recordset.map(r => ({
            ...r,
            fornitore_nome: anagMap[r.ol_conto] || '',
            articolo_descr: artMap[r.ol_codart] || ''
        })) };

        // Conteggi
        const proposte = dettaglio.recordset;
        const gestite = proposte.filter(p => p.Gestita);
        const ignorate = proposte.filter(p => !p.Gestita);
        const modificate = gestite.filter(p => p.quantita_ordinata && p.ol_quant !== p.quantita_ordinata);

        // Raggruppa per fornitore
        const fornitori = {};
        for (const p of proposte) {
            const fk = String(p.ol_conto);
            if (!fornitori[fk]) {
                fornitori[fk] = {
                    codice: p.ol_conto,
                    nome: p.fornitore_nome || fk,
                    proposte: []
                };
            }
            fornitori[fk].proposte.push(p);
        }

        res.json({
            elaborazione: {
                id: elab.ID,
                fingerprint: elab.Fingerprint,
                totaleProposte: elab.TotaleProposte,
                totaleGestite: elab.TotaleGestite,
                rilevatoIl: elab.RilevatoIl,
                numOrdini: [...new Set(gestite.map(g => g.ord_numord))].length,
                numModificate: modificate.length,
                numIgnorate: ignorate.length
            },
            fornitori: Object.values(fornitori)
        });
    } catch (err) {
        console.error('[Elaborazione Dettaglio] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// Dettaglio singolo ordine (per riapertura modale risultato)
router.get('/ordine-dettaglio/:anno/:serie/:numord', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord } = req.params;
        const uid = getUserId(req);
        // testord/movord/anagra → connessione diretta a UJET11 (BCube)
        const poolErp = await getPoolDest(uid);
        // ordini_emessi → sempre su 163
        const poolApp = await getPool163();

        // Testata ordine + fornitore + pagamento + porto (su BCube diretto, arricchita per PDF)
        const testata = await poolErp.request()
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .query(`
                SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                       t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                       t.td_datcons, t.td_codpaga, t.td_porto,
                       t.td_banc1 AS banca_appoggio_1, t.td_banc2 AS banca_appoggio_2,
                       t.td_riferim AS riferimento, t.td_valuta AS valuta_codice,
                       CAST(t.td_note AS VARCHAR(MAX)) AS note_ordine,
                       t.td_totmerce AS totale_merce, t.td_totdoc AS totale_documento,
                       t.td_totdoc - t.td_totmerce AS totale_imposta,
                       a.an_descr1 AS fornitore_nome, a.an_indir AS fornitore_indirizzo,
                       a.an_cap AS fornitore_cap, a.an_citta AS fornitore_citta,
                       a.an_prov AS fornitore_prov, a.an_pariva AS fornitore_pariva,
                       a.an_email AS fornitore_email, a.an_faxtlx AS fornitore_fax,
                       a.an_categ AS fornitore_categ,
                       a.an_banc1 AS fornitore_banca_1, a.an_banc2 AS fornitore_banca_2,
                       CAST(a.an_note AS VARCHAR(500)) AS fornitore_note,
                       CAST(a.an_note2 AS VARCHAR(500)) AS fornitore_note2,
                       ISNULL(p.tb_despaga, '') AS pagamento_descr,
                       ISNULL(pt.tb_desport, '') AS porto_descr,
                       ISNULL(v.tb_desvalu, 'EUR') AS valuta_sigla,
                       ISNULL(v.tb_nomvalu, 'Euro') AS valuta_nome
                FROM dbo.testord t
                LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                LEFT JOIN dbo.tabpaga p ON t.td_codpaga = p.tb_codpaga
                LEFT JOIN dbo.tabport pt ON t.td_porto = pt.tb_codport
                LEFT JOIN dbo.tabvalu v ON t.td_valuta = v.tb_codvalu
                WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                  AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
            `);

        if (!testata.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato' });
        }

        const ordine = testata.recordset[0];

        // Righe ordine arricchite (su BCube diretto — con CODARFO e artico per PDF)
        const righeRes = await poolErp.request()
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .input('fornitore', sql.Int, ordine.fornitore_codice)
            .query(`
                SELECT m.mo_riga, m.mo_codart, m.mo_descr, m.mo_desint,
                       m.mo_unmis, m.mo_ump, m.mo_quant, m.mo_colli,
                       m.mo_prezzo, m.mo_valore, m.mo_datcons,
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
                ORDER BY m.mo_riga
            `);

        // Stato email da ordini_emessi (su 163)
        let emailInviata = false, emailInviataIl = null;
        try {
            const oeRes = await poolApp.request()
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
        const dbProfileDet = getActiveProfile(getUserId(req));
        const isProvaDet = !!(dbProfileDet._testDbId);
        const pdfBuffer = await generaPdfOrdine(ordine, righeRes.recordset, { ambiente: isProvaDet ? 'prova' : 'produzione' });

        res.json({
            success: true,
            ambiente: (dbProfileDet.server || 'BCUBE2').trim(),
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
        const pool = await getPool163();
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
