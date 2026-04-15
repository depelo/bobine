/**
 * GB2 Routes — ordini_confermati_pending
 *
 * Safety-net per il pulsante "Conferma per ordine" del pannello decisione.
 * Pattern: localStorage-first (reattività client) + flush asincrono qui
 * (persistenza cross-device / cross-browser).
 *
 * Tabella: [GB2].[dbo].[ordini_confermati_pending] su pool163.
 * PK logica: (elaborazione_id, user_id, fornitore_codice, codart, fase, magaz)
 *
 * Contratto verso il client:
 *   - Ogni endpoint valida che l'elaborazione_id indicato sia "corrente" per
 *     l'ambiente attivo dell'utente (server dest del profilo DB). Se non lo è,
 *     ritorna 409 ELABORAZIONE_CHANGED — il client deve wipeare localStorage,
 *     ricaricare e abbandonare lo stato in RAM.
 *   - "Corrente" = MAX(ID) in ElaborazioniMRP per lo stesso Ambiente.
 */
module.exports = function(router, deps) {
    const { sql, getPool163, getActiveProfile, authMiddleware } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;

    /**
     * Check se @eid e l'elaborazione corrente per l'ambiente dell'utente.
     * Ritorna true/false.
     */
    async function isElaborazioneCorrente(pool, eid, serverDest) {
        const r = await pool.request()
            .input('eid', sql.Int, eid)
            .input('amb', sql.VarChar(20), serverDest)
            .query(`
                SELECT CASE WHEN @eid = (
                    SELECT MAX(ID) FROM [GB2].[dbo].[ElaborazioniMRP] WHERE Ambiente = @amb
                ) THEN 1 ELSE 0 END AS ok
            `);
        return !!(r.recordset[0] && r.recordset[0].ok);
    }

    /**
     * Validazione riga: verifica che (fornitore, codart, fase, magaz) sia una
     * proposta effettiva di questa elaborazione (SnapshotProposte). Previene
     * injection di chiavi spurie via client manomesso.
     */
    async function chiaveValidaInSnapshot(pool, eid, forn, codart, fase, magaz) {
        const r = await pool.request()
            .input('eid', sql.Int, eid)
            .input('forn', sql.Int, parseInt(forn, 10))
            .input('codart', sql.VarChar(50), codart)
            .input('fase', sql.SmallInt, fase)
            .input('magaz', sql.SmallInt, magaz)
            .query(`
                SELECT TOP 1 1 AS ok
                FROM [GB2].[dbo].[SnapshotProposte]
                WHERE ElaborazioneID = @eid
                  AND ol_conto = @forn
                  AND ol_codart = @codart
                  AND ol_fase = @fase
                  AND ol_magaz = @magaz
            `);
        return r.recordset.length > 0;
    }

    // ─────────────────────────────────────────────────────────────
    // POST /conferma-pending/upsert — upsert singolo
    // Body: { elaborazione_id, fornitore_codice, codart, fase, magaz,
    //         quantita_confermata, prezzo_override }
    // ─────────────────────────────────────────────────────────────
    router.post('/conferma-pending/upsert', authMiddleware, async (req, res) => {
        try {
            const uid = getUserId(req);
            const profile = getActiveProfile(uid);
            const serverDest = (profile.server || 'BCUBE2').trim();
            const pool = await getPool163();

            const b = req.body || {};
            const eid = parseInt(b.elaborazione_id, 10);
            if (!eid) return res.status(400).json({ error: 'elaborazione_id obbligatorio' });
            if (!b.fornitore_codice) return res.status(400).json({ error: 'fornitore_codice obbligatorio' });
            if (!b.codart) return res.status(400).json({ error: 'codart obbligatorio' });
            if (b.quantita_confermata == null) return res.status(400).json({ error: 'quantita_confermata obbligatorio' });

            const fase = parseInt(b.fase || 0, 10);
            const magaz = parseInt(b.magaz || 1, 10);

            // Guard-rail 1: elaborazione corrente
            if (!(await isElaborazioneCorrente(pool, eid, serverDest))) {
                return res.status(409).json({
                    error: 'ELABORAZIONE_CHANGED',
                    message: 'L\'elaborazione indicata non e piu corrente: wipe localStorage e ricarica.'
                });
            }

            // Guard-rail 2: chiave esiste nello snapshot (previene dati spuri)
            if (!(await chiaveValidaInSnapshot(pool, eid, b.fornitore_codice, b.codart, fase, magaz))) {
                return res.status(409).json({
                    error: 'CHIAVE_NON_VALIDA',
                    message: 'La chiave non corrisponde ad alcuna proposta di questa elaborazione.'
                });
            }

            // MERGE atomico: una sola roundtrip, zero race con altri tab dello stesso utente.
            await pool.request()
                .input('eid', sql.Int, eid)
                .input('uid', sql.Int, uid)
                .input('forn', sql.VarChar(20), String(b.fornitore_codice))
                .input('codart', sql.VarChar(50), b.codart)
                .input('fase', sql.SmallInt, fase)
                .input('magaz', sql.SmallInt, magaz)
                .input('quant', sql.Decimal(18, 3), b.quantita_confermata)
                .input('prezzo', sql.Decimal(18, 5), b.prezzo_override == null ? null : b.prezzo_override)
                .query(`
                    MERGE [GB2].[dbo].[ordini_confermati_pending] WITH (HOLDLOCK) AS t
                    USING (SELECT @eid AS elaborazione_id, @uid AS user_id,
                                  @forn AS fornitore_codice, @codart AS codart,
                                  @fase AS fase, @magaz AS magaz) AS s
                      ON t.elaborazione_id = s.elaborazione_id
                     AND t.user_id = s.user_id
                     AND t.fornitore_codice = s.fornitore_codice
                     AND t.codart = s.codart
                     AND t.fase = s.fase
                     AND t.magaz = s.magaz
                    WHEN MATCHED THEN
                      UPDATE SET quantita_confermata = @quant,
                                 prezzo_override = @prezzo,
                                 updated_at = GETDATE()
                    WHEN NOT MATCHED THEN
                      INSERT (elaborazione_id, user_id, fornitore_codice, codart, fase, magaz,
                              quantita_confermata, prezzo_override, updated_at)
                      VALUES (@eid, @uid, @forn, @codart, @fase, @magaz,
                              @quant, @prezzo, GETDATE());
                `);

            res.json({ success: true });
        } catch (err) {
            console.error('[conferma-pending/upsert] Errore:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────────
    // POST /conferma-pending/delete — delete singolo
    // Body: { elaborazione_id, fornitore_codice, codart, fase, magaz }
    // ─────────────────────────────────────────────────────────────
    router.post('/conferma-pending/delete', authMiddleware, async (req, res) => {
        try {
            const uid = getUserId(req);
            const profile = getActiveProfile(uid);
            const serverDest = (profile.server || 'BCUBE2').trim();
            const pool = await getPool163();

            const b = req.body || {};
            const eid = parseInt(b.elaborazione_id, 10);
            if (!eid) return res.status(400).json({ error: 'elaborazione_id obbligatorio' });
            if (!b.fornitore_codice) return res.status(400).json({ error: 'fornitore_codice obbligatorio' });
            if (!b.codart) return res.status(400).json({ error: 'codart obbligatorio' });

            if (!(await isElaborazioneCorrente(pool, eid, serverDest))) {
                return res.status(409).json({ error: 'ELABORAZIONE_CHANGED' });
            }

            await pool.request()
                .input('eid', sql.Int, eid)
                .input('uid', sql.Int, uid)
                .input('forn', sql.VarChar(20), String(b.fornitore_codice))
                .input('codart', sql.VarChar(50), b.codart)
                .input('fase', sql.SmallInt, parseInt(b.fase || 0, 10))
                .input('magaz', sql.SmallInt, parseInt(b.magaz || 1, 10))
                .query(`
                    DELETE FROM [GB2].[dbo].[ordini_confermati_pending]
                    WHERE elaborazione_id=@eid AND user_id=@uid
                      AND fornitore_codice=@forn AND codart=@codart
                      AND fase=@fase AND magaz=@magaz
                `);

            res.json({ success: true });
        } catch (err) {
            console.error('[conferma-pending/delete] Errore:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────────
    // POST /conferma-pending/flush-batch — flush di piu operazioni
    // Usato da sendBeacon() su pagehide come last-chance flush.
    // Body: {
    //   elaborazione_id,
    //   ops: [{ action: 'upsert'|'delete', fornitore_codice, codart, fase, magaz,
    //           quantita_confermata?, prezzo_override? }, ...]
    // }
    // Risposta: 200 con { success, applied, skipped, errors }.
    // Errori parziali NON fallano il batch — il client gestisce via indicatore.
    // ─────────────────────────────────────────────────────────────
    router.post('/conferma-pending/flush-batch', authMiddleware, async (req, res) => {
        try {
            const uid = getUserId(req);
            const profile = getActiveProfile(uid);
            const serverDest = (profile.server || 'BCUBE2').trim();
            const pool = await getPool163();

            const b = req.body || {};
            const eid = parseInt(b.elaborazione_id, 10);
            const ops = Array.isArray(b.ops) ? b.ops : [];
            if (!eid) return res.status(400).json({ error: 'elaborazione_id obbligatorio' });
            if (ops.length === 0) return res.json({ success: true, applied: 0, skipped: 0, errors: [] });

            if (!(await isElaborazioneCorrente(pool, eid, serverDest))) {
                return res.status(409).json({ error: 'ELABORAZIONE_CHANGED' });
            }

            let applied = 0;
            let skipped = 0;
            const errors = [];

            // Batch sequenziale su singolo pool — nessuna transazione esplicita
            // perche l'errore di una riga non deve rollbackare le altre
            // (le ops sono idempotenti per chiave).
            for (const op of ops) {
                try {
                    const fase = parseInt(op.fase || 0, 10);
                    const magaz = parseInt(op.magaz || 1, 10);

                    if (op.action === 'delete') {
                        await pool.request()
                            .input('eid', sql.Int, eid)
                            .input('uid', sql.Int, uid)
                            .input('forn', sql.VarChar(20), String(op.fornitore_codice))
                            .input('codart', sql.VarChar(50), op.codart)
                            .input('fase', sql.SmallInt, fase)
                            .input('magaz', sql.SmallInt, magaz)
                            .query(`
                                DELETE FROM [GB2].[dbo].[ordini_confermati_pending]
                                WHERE elaborazione_id=@eid AND user_id=@uid
                                  AND fornitore_codice=@forn AND codart=@codart
                                  AND fase=@fase AND magaz=@magaz
                            `);
                        applied++;
                    } else if (op.action === 'upsert') {
                        // Validazione chiave in snapshot per upsert
                        const ok = await chiaveValidaInSnapshot(pool, eid, op.fornitore_codice, op.codart, fase, magaz);
                        if (!ok) { skipped++; continue; }

                        await pool.request()
                            .input('eid', sql.Int, eid)
                            .input('uid', sql.Int, uid)
                            .input('forn', sql.VarChar(20), String(op.fornitore_codice))
                            .input('codart', sql.VarChar(50), op.codart)
                            .input('fase', sql.SmallInt, fase)
                            .input('magaz', sql.SmallInt, magaz)
                            .input('quant', sql.Decimal(18, 3), op.quantita_confermata)
                            .input('prezzo', sql.Decimal(18, 5), op.prezzo_override == null ? null : op.prezzo_override)
                            .query(`
                                MERGE [GB2].[dbo].[ordini_confermati_pending] WITH (HOLDLOCK) AS t
                                USING (SELECT @eid AS elaborazione_id, @uid AS user_id,
                                              @forn AS fornitore_codice, @codart AS codart,
                                              @fase AS fase, @magaz AS magaz) AS s
                                  ON t.elaborazione_id = s.elaborazione_id
                                 AND t.user_id = s.user_id
                                 AND t.fornitore_codice = s.fornitore_codice
                                 AND t.codart = s.codart
                                 AND t.fase = s.fase
                                 AND t.magaz = s.magaz
                                WHEN MATCHED THEN
                                  UPDATE SET quantita_confermata = @quant,
                                             prezzo_override = @prezzo,
                                             updated_at = GETDATE()
                                WHEN NOT MATCHED THEN
                                  INSERT (elaborazione_id, user_id, fornitore_codice, codart, fase, magaz,
                                          quantita_confermata, prezzo_override, updated_at)
                                  VALUES (@eid, @uid, @forn, @codart, @fase, @magaz,
                                          @quant, @prezzo, GETDATE());
                            `);
                        applied++;
                    } else {
                        skipped++;
                    }
                } catch (opErr) {
                    errors.push({ op, error: opErr.message });
                }
            }

            res.json({ success: errors.length === 0, applied, skipped, errors });
        } catch (err) {
            console.error('[conferma-pending/flush-batch] Errore:', err);
            res.status(500).json({ error: err.message });
        }
    });
};
