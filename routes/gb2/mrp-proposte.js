/**
 * GB2 Routes — Proposte ordini MRP + consumi storici
 */
module.exports = function(router, deps) {
    const { sql, getPoolDest, getPool163, getActiveProfile,
            PRODUCTION_PROFILE, authMiddleware } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const getPoolRiep = helpers.getPoolRiep;

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
        const poolData = await getPoolDest(uid);
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
        const poolData = await getPoolDest(uid);

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
        const userId = getUserId(req);
        const profile = getActiveProfile(userId);
        const serverDest = (profile.server || 'BCUBE2').trim();
        const poolGB2 = await getPool163();
        const pool = await getPoolDest(userId);

        // ─── 5 query in PARALLELO (indipendenti tra loro) ───
        const [result, fpRes, emissioniRes, ordiniBcubeRes, pendingRes] = await Promise.all([
            // 1) Query principale: ordlist + JOIN (diretto BCUBE2 in prod: ~200ms vs ~1s via viste)
            pool.request().query(`
                SELECT
                    ol.ol_progr,
                    ol.ol_conto                           AS fornitore_codice,
                    COALESCE(an.an_descr1, '')            AS fornitore_nome,
                    COALESCE(an.an_email, '')             AS fornitore_email,
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
                    ISNULL(ol.ol_perqta, 1)                AS ol_perqta,
                    ol.ol_datord                           AS dt_min_ord
                FROM dbo.ordlist ol
                LEFT JOIN dbo.anagra an ON ol.ol_conto = an.an_conto
                LEFT JOIN dbo.artico a ON ol.ol_codart = a.ar_codart
                LEFT JOIN dbo.artfasi af ON ol.ol_codart = af.af_codart AND ol.ol_fase = af.af_fase
                WHERE ol.ol_tipork = 'O'
                ORDER BY ol.ol_conto, ol.ol_codart, ol.ol_datcons
            `),
            // 2) Fingerprint (0.4s) — in parallelo
            pool.request().query(`
                SELECT TOP 1 ol_ultagg AS fingerprint, COUNT(*) AS cnt
                FROM dbo.ordlist WHERE ol_tipork = 'O'
                GROUP BY ol_ultagg ORDER BY cnt DESC
            `),
            // 3) Emissioni (0.1s) — in parallelo
            (async () => {
                try {
                    return await poolGB2.request()
                        .input('amb', sql.VarChar(20), serverDest)
                        .query(`
                            SELECT ol_progr, ord_anno, ord_serie, ord_numord, ord_riga, ol_codart, ol_conto,
                                   quantita_ordinata, data_emissione, elaborazione_id,
                                   ISNULL(email_inviata, 0) AS email_inviata, email_inviata_il,
                                   ISNULL(origine, 'gb2') AS origine
                            FROM dbo.ordini_emessi
                            WHERE ambiente = @amb
                        `);
                } catch (_) {
                    try {
                        return await poolGB2.request().query(`
                            SELECT ol_progr, ord_anno, ord_serie, ord_numord, ord_riga, ol_codart, ol_conto,
                                   quantita_ordinata, data_emissione, elaborazione_id,
                                   0 AS email_inviata, NULL AS email_inviata_il,
                                   'gb2' AS origine
                            FROM dbo.ordini_emessi
                        `);
                    } catch (_2) { return { recordset: [] }; }
                }
            })(),
            // 4) Ordini BCube recenti (729ms in parallelo — zero impatto)
            (async () => {
                try {
                    return await pool.request().query(`
                        SELECT t.td_conto, mo.mo_codart,
                               t.td_anno, t.td_serie, t.td_numord, t.td_datord, t.td_ultagg,
                               mo.mo_quant, mo.mo_datcons, mo.mo_prezzo, mo.mo_riga,
                               mo.mo_magaz, mo.mo_fase
                        FROM dbo.testord t
                        JOIN dbo.movord mo ON mo.mo_numord=t.td_numord AND mo.mo_serie=t.td_serie
                            AND mo.mo_anno=t.td_anno AND mo.mo_tipork=t.td_tipork AND mo.codditt=t.codditt
                        WHERE t.codditt='UJET11' AND t.td_tipork='O' AND mo.mo_stasino<>'N'
                          AND t.td_datord >= DATEADD(MONTH, -3, GETDATE())
                    `);
                } catch (_) { return { recordset: [] }; }
            })(),
            // 5) Ordini confermati pending (safety-net) — in parallelo.
            //    Filtro "elaborazione corrente" inline via subquery MAX(ID) per Ambiente,
            //    cosi non dipende dalla rilevazione sequenziale di elaborazione piu avanti.
            (async () => {
                try {
                    return await poolGB2.request()
                        .input('uid', sql.Int, userId)
                        .input('amb', sql.VarChar(20), serverDest)
                        .query(`
                            SELECT ol_progr, fornitore_codice, codart, fase, magaz,
                                   data_consegna, quantita_confermata, prezzo_override, updated_at
                            FROM [GB2].[dbo].[ordini_confermati_pending]
                            WHERE user_id = @uid
                              AND elaborazione_id = (
                                  SELECT MAX(ID) FROM [GB2].[dbo].[ElaborazioniMRP] WHERE Ambiente = @amb
                              )
                        `);
                } catch (_) { return { recordset: [] }; }
            })()
        ]);

        // ─── Rilevazione Elaborazione MRP (sequenziale — dipende da fingerprint) ───
        let elaborazione = null;

        try {

            if (fpRes.recordset.length > 0) {
                const fingerprint = fpRes.recordset[0].fingerprint;

                // 2) Check se elaborazione già registrata
                let elabRes;
                try {
                    elabRes = await poolGB2.request()
                        .input('fp', sql.DateTime, fingerprint)
                        .input('amb', sql.VarChar(20), serverDest)
                        .query(`
                            SELECT ID, TotaleProposte, TotaleGestite, Fingerprint, RilevatoIl, NumeroElab
                            FROM [GB2].[dbo].[ElaborazioniMRP]
                            WHERE Fingerprint = @fp AND Ambiente = @amb
                        `);
                } catch (colErr) {
                    if (colErr.message.includes('NumeroElab')) {
                        elabRes = await poolGB2.request()
                            .input('fp', sql.DateTime, fingerprint)
                            .input('amb', sql.VarChar(20), serverDest)
                            .query(`
                                SELECT ID, TotaleProposte, TotaleGestite, Fingerprint, RilevatoIl, NULL AS NumeroElab
                                FROM [GB2].[dbo].[ElaborazioniMRP]
                                WHERE Fingerprint = @fp AND Ambiente = @amb
                            `);
                    } else throw colErr;
                }

                let elabId;
                if (elabRes.recordset.length === 0) {
                    // 3) Nuova elaborazione: INSERT + Snapshot proposte
                    try {
                        let insRes;
                        try {
                            insRes = await poolGB2.request()
                                .input('fp', sql.DateTime, fingerprint)
                                .input('tot', sql.Int, result.recordset.length)
                                .input('uid', sql.Int, userId)
                                .input('amb', sql.VarChar(20), serverDest)
                                .query(`
                                    DECLARE @nextNum INT = ISNULL(
                                        (SELECT MAX(NumeroElab) FROM [GB2].[dbo].[ElaborazioniMRP] WHERE Ambiente = @amb),
                                        0) + 1;
                                    INSERT INTO [GB2].[dbo].[ElaborazioniMRP]
                                        (Fingerprint, TotaleProposte, TotaleGestite, IDUser, Ambiente, NumeroElab)
                                    VALUES (@fp, @tot, 0, @uid, @amb, @nextNum);
                                    SELECT SCOPE_IDENTITY() AS newId, @nextNum AS numElab;
                                `);
                        } catch (numElabErr) {
                            // Fallback: colonna NumeroElab potrebbe non esistere ancora
                            if (numElabErr.message.includes('NumeroElab')) {
                                insRes = await poolGB2.request()
                                    .input('fp', sql.DateTime, fingerprint)
                                    .input('tot', sql.Int, result.recordset.length)
                                    .input('uid', sql.Int, userId)
                                    .input('amb', sql.VarChar(20), serverDest)
                                    .query(`
                                        INSERT INTO [GB2].[dbo].[ElaborazioniMRP]
                                            (Fingerprint, TotaleProposte, TotaleGestite, IDUser, Ambiente)
                                        VALUES (@fp, @tot, 0, @uid, @amb);
                                        SELECT SCOPE_IDENTITY() AS newId, 0 AS numElab;
                                    `);
                            } else throw numElabErr;
                        }
                        elabId = insRes.recordset[0].newId;
                    } catch (dupErr) {
                        // Concorrenza: altro utente ha inserito la stessa fingerprint
                        if (dupErr.number === 2601 || dupErr.number === 2627) {
                            const retry = await poolGB2.request()
                                .input('fp', sql.DateTime, fingerprint)
                                .input('amb', sql.VarChar(20), serverDest)
                                .query(`SELECT ID FROM [GB2].[dbo].[ElaborazioniMRP] WHERE Fingerprint=@fp AND Ambiente=@amb`);
                            elabId = retry.recordset[0].ID;
                        } else {
                            throw dupErr;
                        }
                    }

                    // Bulk INSERT snapshot (chunked a 100 righe)
                    const rows = result.recordset;
                    const CHUNK = 100;
                    for (let i = 0; i < rows.length; i += CHUNK) {
                        const chunk = rows.slice(i, i + CHUNK);
                        const values = chunk.map((r, idx) =>
                            `(@eid, @progr${idx}, @codart${idx}, @conto${idx}, @magaz${idx}, @fase${idx}, @quant${idx}, @datcons${idx}, @unmis${idx})`
                        ).join(',');
                        const rq = poolGB2.request().input('eid', sql.Int, elabId);
                        chunk.forEach((r, idx) => {
                            rq.input(`progr${idx}`, sql.Int, r.ol_progr);
                            rq.input(`codart${idx}`, sql.VarChar(50), r.ol_codart);
                            rq.input(`conto${idx}`, sql.Int, r.fornitore_codice);
                            rq.input(`magaz${idx}`, sql.SmallInt, r.ol_magaz || 1);
                            rq.input(`fase${idx}`, sql.SmallInt, r.ol_fase || 0);
                            rq.input(`quant${idx}`, sql.Decimal(18, 9), r.ol_quant || 0);
                            rq.input(`datcons${idx}`, sql.DateTime, r.ol_datcons || null);
                            rq.input(`unmis${idx}`, sql.VarChar(10), r.ol_unmis || null);
                        });
                        await rq.query(`
                            INSERT INTO [GB2].[dbo].[SnapshotProposte]
                                (ElaborazioneID, ol_progr, ol_codart, ol_conto, ol_magaz, ol_fase, ol_quant, ol_datcons, ol_unmis)
                            VALUES ${values}
                        `);
                    }

                    const numElab = insRes.recordset[0].numElab || elabId;
                    elaborazione = { id: elabId, numeroElab: numElab, fingerprint, totaleProposte: rows.length, totaleGestite: 0 };
                } else {
                    // Elaborazione esistente
                    elabId = elabRes.recordset[0].ID;
                    elaborazione = {
                        id: elabId,
                        numeroElab: elabRes.recordset[0].NumeroElab || elabId,
                        fingerprint: elabRes.recordset[0].Fingerprint,
                        totaleProposte: elabRes.recordset[0].TotaleProposte,
                        totaleGestite: elabRes.recordset[0].TotaleGestite
                    };
                }

                // 4) Riconciliazione: marca le proposte gia emesse in questa elaborazione.
                //    PRIMA: loop con N+3 roundtrip sequenziali (SELECT + N UPDATE + COUNT + UPDATE contatore).
                //    Con 50-80 emissioni e latenza ~200ms/query → 15-25s di stallo al load.
                //    ORA: un'unica batch SQL con JOIN-UPDATE + COUNT + UPDATE contatore → 1 roundtrip.
                try {
                    const ricRes = await poolGB2.request()
                        .input('eid', sql.Int, elabId)
                        .input('eidStr', sql.VarChar(50), String(elabId))
                        .query(`
                            UPDATE sp
                            SET Gestita = 1,
                                OrdineEmessoID = oe.id,
                                UpdatedAt = GETDATE()
                            FROM [GB2].[dbo].[SnapshotProposte] sp
                            INNER JOIN dbo.ordini_emessi oe
                                ON oe.ol_progr = sp.ol_progr
                            WHERE sp.ElaborazioneID = @eid
                              AND oe.elaborazione_id = @eidStr
                              AND sp.Gestita = 0;

                            DECLARE @gestite INT = (
                                SELECT COUNT(*) FROM [GB2].[dbo].[SnapshotProposte]
                                WHERE ElaborazioneID = @eid AND Gestita = 1
                            );

                            UPDATE [GB2].[dbo].[ElaborazioniMRP]
                            SET TotaleGestite = @gestite, UpdatedAt = GETDATE()
                            WHERE ID = @eid;

                            SELECT @gestite AS gestite;
                        `);
                    const gestiteRow = ricRes.recordset && ricRes.recordset[0];
                    if (gestiteRow && typeof gestiteRow.gestite === 'number') {
                        elaborazione.totaleGestite = gestiteRow.gestite;
                    }
                } catch (ricErr) {
                    console.warn('[API] Riconciliazione snapshot fallita (continuo):', ricErr.message);
                }
            }
        } catch (elabErr) {
            console.warn('[API] Rilevazione elaborazione fallita (continuo senza):', elabErr.message);
        }

        // ─── Emissioni (gia caricate in parallelo sopra) ───
        const emissioni = emissioniRes.recordset || [];

        // ─── Rilevamento ordini BCube (match + registrazione) ───
        try {
            const fingerprint = fpRes.recordset.length > 0 ? fpRes.recordset[0].fingerprint : null;
            if (fingerprint && ordiniBcubeRes.recordset.length > 0) {
                // Set di ordini gia registrati in ordini_emessi (per evitare duplicati)
                const giaSalvati = new Set(emissioni.map(e =>
                    `${e.ord_anno}_${e.ord_serie}_${e.ord_numord}_${e.ol_codart || ''}`
                ));

                // Set di proposte attuali (per matchare solo quelle rilevanti)
                const proposteSet = new Set(result.recordset.map(r =>
                    `${r.fornitore_codice}_${r.ol_codart}`
                ));

                // Filtra ordini BCube: emessi dopo elaborazione + matchano con proposte + non gia registrati
                const nuoviBcube = ordiniBcubeRes.recordset.filter(o => {
                    const emessoDopo = o.td_datord > fingerprint;
                    const matchaProposta = proposteSet.has(`${o.td_conto}_${o.mo_codart}`);
                    const giaRegistrato = giaSalvati.has(`${o.td_anno}_${o.td_serie}_${o.td_numord}_${o.mo_codart}`);
                    return emessoDopo && matchaProposta && !giaRegistrato;
                });

                // INSERT in ordini_emessi + aggiungi all'array emissioni (fire-and-forget per gli INSERT)
                for (const o of nuoviBcube) {
                    // Aggiungi subito all'array emissioni (per il frontend)
                    emissioni.push({
                        ol_progr: 0,
                        ol_codart: o.mo_codart,
                        ol_conto: o.td_conto,
                        ord_anno: o.td_anno, ord_serie: o.td_serie, ord_numord: o.td_numord,
                        ord_riga: o.mo_riga || 0,
                        quantita_ordinata: o.mo_quant,
                        data_emissione: o.td_datord,
                        elaborazione_id: '',
                        email_inviata: 0, email_inviata_il: null,
                        origine: 'bcube'
                    });

                    // INSERT in DB (fire-and-forget — non blocca la risposta)
                    poolGB2.request()
                        .input('codart', sql.VarChar(50), o.mo_codart)
                        .input('conto', sql.Int, o.td_conto)
                        .input('magaz', sql.SmallInt, o.mo_magaz || 1)
                        .input('fase', sql.SmallInt, o.mo_fase || 0)
                        .input('anno', sql.SmallInt, o.td_anno)
                        .input('serie', sql.VarChar(3), o.td_serie)
                        .input('numord', sql.Int, o.td_numord)
                        .input('riga', sql.Int, o.mo_riga || 0)
                        .input('qta', sql.Decimal(18, 9), o.mo_quant || 0)
                        .input('amb', sql.VarChar(20), serverDest)
                        .query(`INSERT INTO dbo.ordini_emessi
                            (ol_progr, ol_codart, ol_conto, ol_magaz, ol_fase,
                             ord_anno, ord_serie, ord_numord, ord_riga, quantita_ordinata,
                             ambiente, origine)
                            VALUES (0, @codart, @conto, @magaz, @fase,
                                    @anno, @serie, @numord, @riga, @qta, @amb, 'bcube')`)
                        .catch(e => console.warn('[BCube] INSERT ordine_emessi fallito (possibile duplicato):', e.message));
                }

                if (nuoviBcube.length > 0) {
                    console.log('[BCube] Rilevati', nuoviBcube.length, 'ordini BCube nuovi, registrati in ordini_emessi');
                }
            }
        } catch (bcubeErr) {
            console.warn('[BCube] Rilevamento ordini BCube fallito (continuo senza):', bcubeErr.message);
        }

        // ─── Match emissioni → proposte ───
        // Mappa per ol_progr (ordini gb2) + mappa per conto+codart (ordini bcube)
        const emissioniByProgr = new Map();
        const emissioniByCodart = new Map(); // chiave: conto_codart → array di emissioni
        for (const em of emissioni) {
            if (em.ol_progr && em.ol_progr > 0) {
                emissioniByProgr.set(em.ol_progr, em);
            }
            if (em.ol_conto && em.ol_codart) {
                const key = `${em.ol_conto}_${em.ol_codart}`;
                if (!emissioniByCodart.has(key)) emissioniByCodart.set(key, []);
                emissioniByCodart.get(key).push(em);
            }
        }

        const righe = result.recordset.map(r => {
            // Match per ol_progr (ordini gb2)
            let em = emissioniByProgr.get(r.ol_progr);

            // Fallback: match per conto+codart (ordini bcube o gb2 senza ol_progr)
            if (!em) {
                const key = `${r.fornitore_codice}_${r.ol_codart}`;
                const candidates = emissioniByCodart.get(key);
                if (candidates && candidates.length > 0) {
                    em = candidates[0]; // prendi il primo match
                }
            }

            if (em) {
                r.emesso = true;
                r.ord_anno = em.ord_anno;
                r.ord_serie = em.ord_serie;
                r.ord_numord = em.ord_numord;
                r.ord_riga = em.ord_riga || 0;
                r.quantita_ordinata = em.quantita_ordinata;
                r.data_emissione = em.data_emissione;
                r.elaborazione_id = em.elaborazione_id;
                r.email_inviata = !!em.email_inviata;
                r.email_inviata_il = em.email_inviata_il;
                r.origine = em.origine || 'gb2';
            } else {
                r.emesso = false;
            }
            return r;
        });

        // Le entry pending sono gia state caricate in parallelo sopra (pendingRes).
        // Filtro "elaborazione corrente" gia applicato via subquery MAX(ID) per Ambiente.
        const ordini_confermati_pending = (pendingRes && pendingRes.recordset) || [];

        res.json({ elaborazione, righe, ordini_confermati_pending });
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
        descr += ` (scorta min. ${art.ar_scomin}, lotto ${art.ar_minord || 0}, lead time ${art.ar_rrfence || 0} gg)`;
    }
    if (pol === 'F') {
        const desint = (art.ar_desint || '').trim();
        if (desint) descr += ` (${desint})`;
    }
    return descr;
}

// ============================================================
// API: ANALISI ARTICOLO (replica QlikView)
// Ritorna tutti i movimenti di un articolo da Riep per cross-filtering frontend
// ============================================================
router.get('/analisi-articolo', authMiddleware, async (req, res) => {
    try {
        const codart = (req.query.codart || '').trim();
        if (!codart) return res.status(400).json({ error: 'codart obbligatorio' });

        const pool = await getPoolRiep(getUserId(req));

        // Tutti i movimenti per questo articolo — il frontend filtra client-side
        const result = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT [Date], Tipork, Anno, Serie, Numdoc, Riga, Codart,
                       Descrizione, ID_Famiglia, [Qtà], Famiglia, Sostitutivo, Sostituito,
                       In_esaurimento, UM, Politica, Gr_Politica, ID_Politica,
                       Scorta, RRFence, LeadTime, A_Fasi, Fase, Magazzino,
                       Tipo_mov, Tipobf, Causale, Conto, Tipo_C_F, RagSoc,
                       SM_A_fasi, Min_ord, Forn1, Forn2
                FROM dbo.Riep
                WHERE Codart = @codart
                ORDER BY [Date]
            `);

        if (!result.recordset.length) {
            return res.json({ articolo: null, movimenti: [] });
        }

        // Info articolo dal primo record (campi fissi per codart)
        const first = result.recordset[0];
        const articolo = {
            codart: first.Codart,
            descrizione: (first.Descrizione || '').trim(),
            famiglia: (first.Famiglia || '').trim(),
            id_famiglia: first.ID_Famiglia,
            sostitutivo: first.Sostitutivo ? first.Sostitutivo.trim() : null,
            sostituito: first.Sostituito ? first.Sostituito.trim() : null,
            in_esaurimento: first.In_esaurimento,
            um: (first.UM || '').trim(),
            politica: (first.Politica || '').trim(),
            gr_politica: (first.Gr_Politica || '').trim(),
            scorta: first.Scorta,
            rrfence: first.RRFence,
            lead_time: first.LeadTime,
            a_fasi: first.A_Fasi,
            sm_a_fasi: first.SM_A_fasi,
            min_ord: first.Min_ord,
            forn1: first.Forn1 ? first.Forn1.trim() : null,
            forn2: first.Forn2 ? first.Forn2.trim() : null
        };

        // Movimenti — tutti i campi necessari per il cross-filtering
        const movimenti = result.recordset.map(r => ({
            date: r.Date,
            anno: r.Anno,
            tipo_mov: r.Tipo_mov,
            qta: r['Qtà'],
            serie: (r.Serie || '').trim(),
            fase: r.Fase,
            magazzino: r.Magazzino,
            conto: r.Conto,
            tipo_cf: r.Tipo_C_F,
            ragsoc: (r.RagSoc || '').trim(),
            causale: (r.Causale || '').trim(),
            tipobf: (r.Tipobf || '').trim()
        }));

        res.json({ articolo, movimenti });
    } catch (err) {
        console.error('[Analisi Articolo] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

};
