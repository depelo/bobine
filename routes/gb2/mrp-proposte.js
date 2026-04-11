/**
 * GB2 Routes — Proposte ordini MRP + consumi storici
 */
module.exports = function(router, deps) {
    const { sql, getPoolMRP, getPoolProd, getActiveProfile, isProduction,
            PRODUCTION_PROFILE, authMiddleware, getPoolBcube } = deps;
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
        const userId = getUserId(req);
        const profile = getActiveProfile(userId);
        const ambiente = (profile && profile.ambiente) || 'produzione';
        const isProd = isProduction(userId);
        const poolGB2 = await getPoolProd();

        // In produzione: usa poolBcube (diretto a BCUBE2, JOIN 5x piu veloci).
        // In prova: usa getPoolMRP (diretto a UJET11 del server prova).
        // Fallback: se poolBcube non disponibile, usa getPoolMRP (viste MRP).
        let pool;
        if (isProd) {
            pool = await getPoolBcube() || await getPoolMRP(userId);
        } else {
            pool = await getPoolMRP(userId);
        }

        // ─── 3 query in PARALLELO (indipendenti tra loro) ───
        const [result, fpRes, emissioniRes] = await Promise.all([
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
                        .input('amb', sql.VarChar(20), ambiente)
                        .query(`
                            SELECT ol_progr, ord_anno, ord_serie, ord_numord, quantita_ordinata,
                                   data_emissione, elaborazione_id,
                                   ISNULL(email_inviata, 0) AS email_inviata, email_inviata_il
                            FROM dbo.ordini_emessi
                            WHERE ISNULL(ambiente, 'produzione') = @amb
                        `);
                } catch (_) {
                    try {
                        return await poolGB2.request().query(`
                            SELECT ol_progr, ord_anno, ord_serie, ord_numord, quantita_ordinata,
                                   data_emissione, elaborazione_id,
                                   0 AS email_inviata, NULL AS email_inviata_il
                            FROM dbo.ordini_emessi
                        `);
                    } catch (_2) { return { recordset: [] }; }
                }
            })()
        ]);

        // ─── Rilevazione Elaborazione MRP (sequenziale — dipende da fingerprint) ───
        let elaborazione = null;

        try {

            if (fpRes.recordset.length > 0) {
                const fingerprint = fpRes.recordset[0].fingerprint;

                // 2) Check se elaborazione già registrata
                let elabRes = await poolGB2.request()
                    .input('fp', sql.DateTime, fingerprint)
                    .input('amb', sql.VarChar(20), ambiente)
                    .query(`
                        SELECT ID, TotaleProposte, TotaleGestite, Fingerprint, RilevatoIl
                        FROM [GB2].[dbo].[ElaborazioniMRP]
                        WHERE Fingerprint = @fp AND Ambiente = @amb
                    `);

                let elabId;
                if (elabRes.recordset.length === 0) {
                    // 3) Nuova elaborazione: INSERT + Snapshot proposte
                    try {
                        const insRes = await poolGB2.request()
                            .input('fp', sql.DateTime, fingerprint)
                            .input('tot', sql.Int, result.recordset.length)
                            .input('uid', sql.Int, userId)
                            .input('amb', sql.VarChar(20), ambiente)
                            .query(`
                                INSERT INTO [GB2].[dbo].[ElaborazioniMRP]
                                    (Fingerprint, TotaleProposte, TotaleGestite, IDUser, Ambiente)
                                VALUES (@fp, @tot, 0, @uid, @amb);
                                SELECT SCOPE_IDENTITY() AS newId;
                            `);
                        elabId = insRes.recordset[0].newId;
                    } catch (dupErr) {
                        // Concorrenza: altro utente ha inserito la stessa fingerprint
                        if (dupErr.number === 2601 || dupErr.number === 2627) {
                            const retry = await poolGB2.request()
                                .input('fp', sql.DateTime, fingerprint)
                                .input('amb', sql.VarChar(20), ambiente)
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

                    elaborazione = { id: elabId, fingerprint, totaleProposte: rows.length, totaleGestite: 0 };
                } else {
                    // Elaborazione esistente
                    elabId = elabRes.recordset[0].ID;
                    elaborazione = {
                        id: elabId,
                        fingerprint: elabRes.recordset[0].Fingerprint,
                        totaleProposte: elabRes.recordset[0].TotaleProposte,
                        totaleGestite: elabRes.recordset[0].TotaleGestite
                    };
                }

                // 4) Riconciliazione: marca le proposte già emesse in questa elaborazione
                try {
                    const emessiRes = await pool.request()
                        .input('eid', sql.VarChar(50), String(elabId))
                        .query(`SELECT id, ol_progr FROM dbo.ordini_emessi WHERE elaborazione_id = @eid`);

                    if (emessiRes.recordset.length > 0) {
                        for (const em of emessiRes.recordset) {
                            await poolGB2.request()
                                .input('eid', sql.Int, elabId)
                                .input('progr', sql.Int, em.ol_progr)
                                .input('oeId', sql.Int, em.id)
                                .query(`
                                    UPDATE [GB2].[dbo].[SnapshotProposte]
                                    SET Gestita = 1, OrdineEmessoID = @oeId, UpdatedAt = GETDATE()
                                    WHERE ElaborazioneID = @eid AND ol_progr = @progr AND Gestita = 0
                                `);
                        }
                        // Aggiorna contatore
                        const cntRes = await poolGB2.request()
                            .input('eid', sql.Int, elabId)
                            .query(`SELECT COUNT(*) AS cnt FROM [GB2].[dbo].[SnapshotProposte] WHERE ElaborazioneID=@eid AND Gestita=1`);
                        const gestite = cntRes.recordset[0].cnt;
                        await poolGB2.request()
                            .input('eid', sql.Int, elabId)
                            .input('gestite', sql.Int, gestite)
                            .query(`UPDATE [GB2].[dbo].[ElaborazioniMRP] SET TotaleGestite=@gestite, UpdatedAt=GETDATE() WHERE ID=@eid`);
                        elaborazione.totaleGestite = gestite;
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

        const emissioniMap = new Map();
        for (const em of emissioni) {
            emissioniMap.set(em.ol_progr, em);
        }

        const righe = result.recordset.map(r => {
            const em = emissioniMap.get(r.ol_progr);
            if (em) {
                r.emesso = true;
                r.ord_anno = em.ord_anno;
                r.ord_serie = em.ord_serie;
                r.ord_numord = em.ord_numord;
                r.quantita_ordinata = em.quantita_ordinata;
                r.data_emissione = em.data_emissione;
                r.elaborazione_id = em.elaborazione_id;
                r.email_inviata = !!em.email_inviata;
                r.email_inviata_il = em.email_inviata_il;
            } else {
                r.emesso = false;
            }
            return r;
        });

        res.json({ elaborazione, righe });
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
};
