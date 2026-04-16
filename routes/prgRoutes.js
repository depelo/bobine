const express = require('express');
const { sql, getPoolPRG } = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();
const DEFAULT_KANBAN_COLUMNS = [
    { nome: 'Da Fare', ordine: 0, colore: '#f8f9fa' },
    { nome: 'In Corso', ordine: 1, colore: '#e0f2fe' },
    { nome: 'Revisione', ordine: 2, colore: '#fef08a' },
    { nome: 'Completato', ordine: 3, colore: '#dcfce3' },
];

async function resolveSubTasksColumns(pool) {
    const columnsResult = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'sub_tasks'
    `);
    const names = new Set(columnsResult.recordset.map((row) => String(row.COLUMN_NAME).toLowerCase()));

    const idColumn = names.has('id_sub_task')
        ? 'id_sub_task'
        : names.has('id_subtask')
            ? 'id_subtask'
            : names.has('id_sub_tasks')
                ? 'id_sub_tasks'
                : null;

    const parentColumn = names.has('id_task_padre')
        ? 'id_task_padre'
        : names.has('id_task')
            ? 'id_task'
            : null;

    if (!idColumn || !parentColumn) {
        throw new Error('Schema sub_tasks non riconosciuto: colonne id o parent mancanti.');
    }

    return { idColumn, parentColumn };
}

router.get('/progetti', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPRG();
        const result = await pool.request().query(`
            SELECT
                p.id_progetto, p.nome_progetto, p.descrizione,
                p.data_inizio, p.data_fine, p.stato,
                p.obbiettivi, p.priorita, p.budget,
                p.id_area, a.nome_area
            FROM progetti p
            LEFT JOIN aree a ON p.id_area = a.id_area
            WHERE p.is_active = 1
        `);
        const safeData = result.recordset.map(row => ({
            ...row,
            priorita: row.priorita ?? null,
            budget: row.budget ?? null
        }));
        res.json({ ok: true, data: safeData });
    } catch (err) {
        console.error('GET /api/prg/progetti:', err);
        res.status(500).json({ ok: false, message: 'Errore nel recupero progetti.', error: err.message });
    }
});

router.post('/progetti', authenticateToken, async (req, res) => {
    let transaction;
    try {
        const { nome_progetto, descrizione, data_inizio, id_area } = req.body;
        transaction = new sql.Transaction(await getPoolPRG());
        await transaction.begin();
        const result = await new sql.Request(transaction)
            .input('nome_progetto', sql.NVarChar(255), nome_progetto)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .input('data_inizio', sql.Date, data_inizio)
            .input('id_area', sql.Int, id_area || null)
            .query(`
                INSERT INTO dbo.progetti (nome_progetto, descrizione, data_inizio, id_area)
                OUTPUT INSERTED.*
                VALUES (@nome_progetto, @descrizione, @data_inizio, @id_area)
            `);
        const nuovoProgetto = result.recordset[0];
        const idNuovoProgetto = Number(nuovoProgetto.id_progetto);

        for (const colonna of DEFAULT_KANBAN_COLUMNS) {
            await new sql.Request(transaction)
                .input('id_progetto', sql.Int, idNuovoProgetto)
                .input('nome', sql.NVarChar(100), colonna.nome)
                .input('ordine', sql.Int, colonna.ordine)
                .input('colore', sql.NVarChar(20), colonna.colore)
                .query(`
                    INSERT INTO dbo.colonne_kanban (id_progetto, nome, ordine, colore)
                    VALUES (@id_progetto, @nome, @ordine, @colore)
                `);
        }

        await transaction.commit();
        res.status(201).json({ ok: true, data: nuovoProgetto });
    } catch (err) {
        if (transaction && transaction._aborted !== true) {
            await transaction.rollback().catch(() => {});
        }
        console.error('POST /api/prg/progetti:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione progetto.', error: err.message });
    }
});

router.get('/progetti/:id/colonne', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`
                SELECT id_colonna, id_progetto, nome, ordine, colore
                FROM dbo.colonne_kanban
                WHERE id_progetto = @id_progetto
                ORDER BY ordine ASC, id_colonna ASC
            `);
        res.json({ ok: true, data: result.recordset });
    } catch (error) {
        console.error('[ERRORE API]:', error);
        res.status(500).json({ ok: false, message: 'Errore nel recupero colonne kanban.', error: error.message });
    }
});

router.post('/progetti/:id/colonne', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const nome = req.body.nome ?? req.body.nome_colonna;
        const colore = req.body.colore || '#f8f9fa';
        if (!nome || !String(nome).trim()) {
            return res.status(400).json({ ok: false, message: 'Nome colonna obbligatorio.' });
        }

        const pool = await getPoolPRG();
        const ordineResult = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`
                SELECT ISNULL(MAX(ordine), -1) + 1 AS prossimo_ordine
                FROM dbo.colonne_kanban
                WHERE id_progetto = @id_progetto
            `);

        const prossimoOrdine = Number(ordineResult.recordset[0]?.prossimo_ordine ?? 0);
        const insertResult = await pool.request()
            .input('id_progetto', sql.Int, id)
            .input('nome', sql.NVarChar(100), String(nome).trim())
            .input('ordine', sql.Int, prossimoOrdine)
            .input('colore', sql.NVarChar(20), colore)
            .query(`
                INSERT INTO dbo.colonne_kanban (id_progetto, nome, ordine, colore)
                OUTPUT INSERTED.id_colonna, INSERTED.id_progetto, INSERTED.nome, INSERTED.ordine, INSERTED.colore
                VALUES (@id_progetto, @nome, @ordine, @colore)
            `);
        res.status(201).json({ ok: true, data: insertResult.recordset[0] });
    } catch (error) {
        console.error('[ERRORE API]:', error);
        res.status(500).json({ ok: false, message: 'Errore nella creazione colonna kanban.', error: error.message });
    }
});

router.put('/colonne/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const nome = req.body.nome ?? req.body.nome_colonna;
        const colore = req.body.colore ?? null;
        const ordineParsed = req.body.ordine !== undefined && req.body.ordine !== null && req.body.ordine !== ''
            ? Number(req.body.ordine)
            : null;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_colonna', sql.Int, id)
            .input('nome', sql.NVarChar(100), nome ?? null)
            .input('ordine', sql.Int, Number.isInteger(ordineParsed) ? ordineParsed : null)
            .input('colore', sql.NVarChar(20), colore)
            .query(`
                UPDATE dbo.colonne_kanban
                SET nome = COALESCE(@nome, nome),
                    ordine = COALESCE(@ordine, ordine),
                    colore = COALESCE(@colore, colore)
                WHERE id_colonna = @id_colonna
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Colonna non trovata.' });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('[ERRORE API]:', error);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento colonna kanban.', error: error.message });
    }
});

router.delete('/colonne/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const colonnaResult = await pool.request()
            .input('id_colonna', sql.Int, id)
            .query(`
                SELECT nome
                FROM dbo.colonne_kanban
                WHERE id_colonna = @id_colonna
            `);

        if (!colonnaResult.recordset.length) {
            return res.status(404).json({ ok: false, error: 'Colonna non trovata.' });
        }

        const nomeColonna = String(colonnaResult.recordset[0].nome || '').trim();
        const colonneBase = ['Da Fare', 'In Corso', 'Revisione', 'Completato'];
        if (colonneBase.includes(nomeColonna)) {
            return res.status(403).json({
                ok: false,
                error: 'Le colonne di base del sistema non possono essere eliminate.',
            });
        }

        const countResult = await pool.request()
            .input('id_colonna', sql.Int, id)
            .query(`
                SELECT COUNT(*) AS totale
                FROM dbo.tasks
                WHERE id_colonna = @id_colonna AND is_active = 1
            `);

        const totale = Number(countResult.recordset[0]?.totale ?? 0);
        if (totale > 0) {
            return res.status(400).json({
                ok: false,
                error: 'Sposta i task prima di eliminare la colonna',
            });
        }

        const deleteResult = await pool.request()
            .input('id_colonna', sql.Int, id)
            .query(`DELETE FROM dbo.colonne_kanban WHERE id_colonna = @id_colonna`);
        if (deleteResult.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, error: 'Colonna non trovata.' });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('[ERRORE API]:', error);
        res.status(500).json({ ok: false, message: 'Errore nella cancellazione colonna kanban.', error: error.message });
    }
});

router.put('/progetti/:id/ordine-colonne', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { colonne } = req.body;
        if (!Array.isArray(colonne) || !colonne.length) {
            return res.status(400).json({ ok: false, message: 'Payload colonne non valido.' });
        }

        const transaction = new sql.Transaction(await getPoolPRG());
        await transaction.begin();
        try {
            for (const colonna of colonne) {
                if (!Number.isInteger(Number(colonna.id_colonna)) || !Number.isInteger(Number(colonna.ordine))) {
                    throw new Error('Elemento ordine colonne non valido.');
                }
                await new sql.Request(transaction)
                    .input('id_progetto', sql.Int, id)
                    .input('id_colonna', sql.Int, Number(colonna.id_colonna))
                    .input('ordine', sql.Int, Number(colonna.ordine))
                    .query(`
                        UPDATE dbo.colonne_kanban
                        SET ordine = @ordine
                        WHERE id_colonna = @id_colonna AND id_progetto = @id_progetto
                    `);
            }
            await transaction.commit();
            res.json({ ok: true });
        } catch (innerError) {
            if (transaction._aborted !== true) {
                await transaction.rollback().catch(() => {});
            }
            throw innerError;
        }
    } catch (error) {
        console.error('[ERRORE API]:', error);
        res.status(500).json({ ok: false, message: 'Errore nel salvataggio ordine colonne.', error: error.message });
    }
});

router.put('/progetti/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome_progetto, descrizione, data_inizio, data_fine, obbiettivi, priorita, budget, stato, id_area } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id)
            .input('nome_progetto', sql.NVarChar(255), nome_progetto)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .input('data_inizio', sql.Date, data_inizio || null)
            .input('data_fine', sql.Date, data_fine || null)
            .input('obbiettivi', sql.NVarChar(sql.MAX), obbiettivi || null)
            .input('priorita', sql.NVarChar(50), priorita || null)
            .input('budget', sql.Decimal(18, 2), budget ?? null)
            .input('stato', sql.NVarChar(50), stato || null)
            .input('id_area', sql.Int, id_area || null)
            .query(`
                UPDATE dbo.progetti
                SET nome_progetto = @nome_progetto, descrizione = @descrizione,
                    data_inizio = @data_inizio, data_fine = @data_fine,
                    obbiettivi = @obbiettivi, priorita = @priorita,
                    budget = @budget, stato = @stato, id_area = @id_area
                WHERE id_progetto = @id_progetto AND is_active = 1
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Progetto non trovato o eliminato.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/progetti/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento progetto.', error: err.message });
    }
});

router.delete('/progetti/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`UPDATE dbo.progetti SET is_active = 0 WHERE id_progetto = @id_progetto AND is_active = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Progetto non trovato o gia eliminato.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/progetti/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nel soft-delete progetto.', error: err.message });
    }
});

router.get('/persone', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPRG();
        const result = await pool.request().query(`
            SELECT id_persona, nome, cognome, email, ruolo_aziendale
            FROM dbo.persone WHERE is_active = 1
        `);
        res.json({ ok: true, data: result.recordset });
    } catch (err) {
        console.error('GET /api/prg/persone:', err);
        res.status(500).json({ ok: false, message: 'Errore nel recupero persone.', error: err.message });
    }
});

router.get('/persone/:id/progetti', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_persona', sql.Int, id)
            .query(`
                SELECT p.id_progetto, p.nome_progetto, p.stato, p.priorita, a.ruolo_nel_progetto
                FROM assegnazioni_progetti a
                INNER JOIN progetti p ON a.id_progetto = p.id_progetto
                WHERE a.id_persona = @id_persona AND p.is_active = 1
            `);
        res.json({ ok: true, data: result.recordset });
    } catch (err) {
        console.error('GET /api/prg/persone/:id/progetti:', err);
        res.status(500).json({ ok: false, message: 'Errore nel recupero progetti della persona.', error: err.message });
    }
});

router.post('/persone', authenticateToken, async (req, res) => {
    try {
        const { nome, cognome, email, ruolo_aziendale } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('nome', sql.NVarChar(100), nome)
            .input('cognome', sql.NVarChar(100), cognome)
            .input('email', sql.NVarChar(255), email || null)
            .input('ruolo_aziendale', sql.NVarChar(150), ruolo_aziendale)
            .query(`
                INSERT INTO dbo.persone (nome, cognome, email, ruolo_aziendale)
                OUTPUT INSERTED.*
                VALUES (@nome, @cognome, @email, @ruolo_aziendale)
            `);
        res.status(201).json({ ok: true, data: result.recordset[0] });
    } catch (err) {
        console.error('POST /api/prg/persone:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione persona.', error: err.message });
    }
});

router.put('/persone/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cognome, email, ruolo_aziendale } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_persona', sql.Int, id)
            .input('nome', sql.NVarChar(100), nome)
            .input('cognome', sql.NVarChar(100), cognome)
            .input('email', sql.NVarChar(255), email || null)
            .input('ruolo_aziendale', sql.NVarChar(150), ruolo_aziendale)
            .query(`
                UPDATE dbo.persone
                SET nome = @nome, cognome = @cognome, email = @email, ruolo_aziendale = @ruolo_aziendale
                WHERE id_persona = @id_persona AND is_active = 1
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Persona non trovata o eliminata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/persone/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento persona.', error: err.message });
    }
});

router.delete('/persone/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_persona', sql.Int, id)
            .query(`UPDATE dbo.persone SET is_active = 0 WHERE id_persona = @id_persona AND is_active = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Persona non trovata o gia eliminata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/persone/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nel soft-delete persona.', error: err.message });
    }
});

router.get('/aree', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPRG();
        const result = await pool.request().query(`
            SELECT id_area, nome_area, descrizione
            FROM dbo.aree WHERE is_active = 1 ORDER BY nome_area ASC
        `);
        res.json({ ok: true, data: result.recordset });
    } catch (err) {
        console.error('GET /api/prg/aree:', err);
        res.status(500).json({ ok: false, message: 'Errore nel recupero aree.', error: err.message });
    }
});

router.post('/aree', authenticateToken, async (req, res) => {
    try {
        const { nome_area, descrizione } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('nome_area', sql.NVarChar(150), nome_area)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .query(`
                INSERT INTO dbo.aree (nome_area, descrizione, is_active)
                OUTPUT INSERTED.*
                VALUES (@nome_area, @descrizione, 1)
            `);
        res.status(201).json({ ok: true, data: result.recordset[0] });
    } catch (err) {
        console.error('POST /api/prg/aree:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione area.', error: err.message });
    }
});

router.put('/aree/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome_area, descrizione } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_area', sql.Int, id)
            .input('nome_area', sql.NVarChar(150), nome_area)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .query(`
                UPDATE dbo.aree SET nome_area = @nome_area, descrizione = @descrizione
                WHERE id_area = @id_area AND is_active = 1
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Area non trovata o non attiva.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/aree/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento area.', error: err.message });
    }
});

router.delete('/aree/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_area', sql.Int, id)
            .query(`UPDATE dbo.aree SET is_active = 0 WHERE id_area = @id_area AND is_active = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Area non trovata o gia disattivata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/aree/:id:', err);
        if (err.number === 547) {
            return res.status(409).json({ ok: false, message: 'Impossibile eliminare l area: sposta prima i progetti associati.' });
        }
        res.status(500).json({ ok: false, message: 'Errore nel soft-delete area.', error: err.message });
    }
});

router.post('/assegna', authenticateToken, async (req, res) => {
    try {
        const { id_progetto, id_persona, ruolo_nel_progetto } = req.body;
        const pool = await getPoolPRG();
        await pool.request()
            .input('id_progetto', sql.Int, id_progetto)
            .input('id_persona', sql.Int, id_persona)
            .input('ruolo_nel_progetto', sql.NVarChar(150), ruolo_nel_progetto ? String(ruolo_nel_progetto).trim() : null)
            .query(`
                INSERT INTO assegnazioni_progetti (id_progetto, id_persona, ruolo_nel_progetto, data_assegnazione)
                VALUES (@id_progetto, @id_persona, @ruolo_nel_progetto, GETDATE())
            `);
        res.status(201).json({ ok: true });
    } catch (err) {
        console.error('POST /api/prg/assegna:', err);
        res.status(500).json({ ok: false, message: 'Errore nell assegnazione persona al progetto.', error: err.message });
    }
});

router.get('/progetti/:id/team', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`
                SELECT pe.id_persona, pe.nome, pe.cognome, a.ruolo_nel_progetto AS ruolo
                FROM assegnazioni_progetti a
                INNER JOIN persone pe ON a.id_persona = pe.id_persona
                WHERE a.id_progetto = @id_progetto
            `);
        res.json({ ok: true, data: result.recordset });
    } catch (err) {
        console.error('GET /api/prg/progetti/:id/team:', err);
        res.status(500).json({ ok: false, message: 'Errore nel recupero team progetto.', error: err.message });
    }
});

router.put('/progetti/:id_progetto/team/:id_persona', authenticateToken, async (req, res) => {
    try {
        const { id_progetto, id_persona } = req.params;
        const { ruolo } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id_progetto)
            .input('id_persona', sql.Int, id_persona)
            .input('ruolo', sql.NVarChar(150), ruolo || null)
            .query(`UPDATE assegnazioni_progetti SET ruolo_nel_progetto = @ruolo WHERE id_progetto = @id_progetto AND id_persona = @id_persona`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Assegnazione non trovata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/progetti/:id/team/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento ruolo membro team.', error: err.message });
    }
});

router.delete('/progetti/:id_progetto/team/:id_persona', authenticateToken, async (req, res) => {
    try {
        const { id_progetto, id_persona } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id_progetto)
            .input('id_persona', sql.Int, id_persona)
            .query(`DELETE FROM assegnazioni_progetti WHERE id_progetto = @id_progetto AND id_persona = @id_persona`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Assegnazione non trovata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/progetti/:id/team/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nella rimozione membro dal progetto.', error: err.message });
    }
});

router.get('/progetti/:id/tasks', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`
                SELECT
                    t.id_task, t.id_progetto, t.titolo, t.id_persona,
                    t.priorita, t.descrizione, t.scadenza, t.id_colonna, t.stato, t.dipende_da_id,
                    ck.nome,
                    p.nome AS nome_assegnato, p.cognome AS cognome_assegnato,
                    td.titolo AS titolo_dipendenza
                FROM dbo.tasks t
                LEFT JOIN persone p ON t.id_persona = p.id_persona
                LEFT JOIN dbo.tasks td ON t.dipende_da_id = td.id_task
                LEFT JOIN dbo.colonne_kanban ck ON t.id_colonna = ck.id_colonna
                WHERE t.id_progetto = @id_progetto AND t.is_active = 1
                ORDER BY t.id_task ASC
            `);

        const tasks = result.recordset.map((task) => ({
            ...task,
            nome_assegnato: [task.nome_assegnato, task.cognome_assegnato].filter(Boolean).join(' ').trim(),
            stato: task.nome || task.stato || 'Da Fare'
        }));
        res.json({ ok: true, data: tasks });
    } catch (error) {
        console.error('[ERRORE API TASKS]:', error);
        res.status(500).json({ ok: false, message: 'Errore nel recupero task del progetto.', error: error.message });
    }
});

router.get('/progetti/:id/struttura-tasks', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const { idColumn, parentColumn } = await resolveSubTasksColumns(pool);

        const tasksResult = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`
                SELECT
                    t.id_task, t.id_progetto, t.titolo, t.descrizione,
                    t.id_persona, t.priorita, t.stato, t.id_colonna, t.dipende_da_id,
                    ck.nome
                FROM dbo.tasks t
                LEFT JOIN dbo.colonne_kanban ck ON t.id_colonna = ck.id_colonna
                WHERE t.id_progetto = @id_progetto AND t.is_active = 1
                ORDER BY t.id_task ASC
            `);

        const subtasksResult = await pool.request()
            .input('id_progetto', sql.Int, id)
            .query(`
                SELECT
                    st.${idColumn} AS id_sub_task,
                    st.${parentColumn} AS id_task_padre,
                    st.titolo, st.descrizione,
                    st.is_completato, st.is_critico
                FROM dbo.sub_tasks st
                INNER JOIN dbo.tasks t ON st.${parentColumn} = t.id_task
                WHERE t.id_progetto = @id_progetto
                ORDER BY st.${idColumn} ASC
            `);

        const subtasksByTask = new Map();
        subtasksResult.recordset.forEach((subtask) => {
            const key = Number(subtask.id_task_padre);
            if (!subtasksByTask.has(key)) subtasksByTask.set(key, []);
            subtasksByTask.get(key).push(subtask);
        });

        const data = tasksResult.recordset.map((task) => ({
            ...task,
            is_completato: (task.stato || '').toString().trim().toLowerCase() === 'completato' ? 1 : 0,
            is_critico: 0,
            sub_tasks: subtasksByTask.get(Number(task.id_task)) || []
        }));

        res.json({ ok: true, data });
    } catch (error) {
        console.error('[ERRORE WBS]:', error.message);
        res.status(500).json({ ok: false, message: 'Errore nel recupero struttura task.', error: error.message });
    }
});

router.post('/tasks', authenticateToken, async (req, res) => {
    try {
        const { id_progetto, titolo, id_persona, priorita, descrizione, scadenza, dipende_da_id } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_progetto', sql.Int, id_progetto)
            .input('titolo', sql.NVarChar(255), titolo)
            .input('id_persona', sql.Int, id_persona)
            .input('priorita', sql.NVarChar(50), priorita || 'Media')
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .input('scadenza', sql.Date, scadenza || null)
            .input('dipende_da_id', sql.Int, dipende_da_id || null)
            .query(`
                DECLARE @default_id_colonna INT;
                SELECT TOP 1 @default_id_colonna = id_colonna
                FROM dbo.colonne_kanban
                WHERE id_progetto = @id_progetto
                ORDER BY ordine ASC, id_colonna ASC;

                INSERT INTO dbo.tasks (
                    id_progetto, titolo, id_persona, descrizione,
                    priorita, scadenza, stato, id_colonna, dipende_da_id, is_active
                )
                OUTPUT INSERTED.*
                VALUES (
                    @id_progetto, @titolo, @id_persona, @descrizione,
                    @priorita, @scadenza, 'Da Fare', @default_id_colonna, @dipende_da_id, 1
                )
            `);

        res.status(201).json({ ok: true, data: result.recordset[0] });
    } catch (err) {
        console.error('POST /api/prg/tasks:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione task.', error: err.message });
    }
});

router.put('/tasks/:id/stato', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { id_colonna, stato } = req.body;
        if (!id_colonna && !stato) {
            return res.status(400).json({ ok: false, message: 'id_colonna obbligatorio.' });
        }

        const pool = await getPoolPRG();
        let idColonnaFinale = id_colonna ? Number(id_colonna) : null;
        let nomeColonnaFinale = null;

        if (!idColonnaFinale && stato) {
            const mapResult = await pool.request()
                .input('id_task', sql.Int, id)
                .input('nome', sql.NVarChar(100), stato)
                .query(`
                    SELECT TOP 1 ck.id_colonna, ck.nome
                    FROM dbo.tasks t
                    INNER JOIN dbo.colonne_kanban ck ON ck.id_progetto = t.id_progetto
                    WHERE t.id_task = @id_task AND ck.nome = @nome
                    ORDER BY ck.ordine ASC, ck.id_colonna ASC
                `);
            if (!mapResult.recordset.length) {
                return res.status(400).json({ ok: false, message: 'Colonna target non valida per il task.' });
            }
            idColonnaFinale = Number(mapResult.recordset[0].id_colonna);
            nomeColonnaFinale = mapResult.recordset[0].nome;
        }

        const colonnaResult = await pool.request()
            .input('id_colonna', sql.Int, idColonnaFinale)
            .query(`SELECT id_colonna, nome FROM dbo.colonne_kanban WHERE id_colonna = @id_colonna`);
        if (!colonnaResult.recordset.length) {
            return res.status(400).json({ ok: false, message: 'Colonna target non valida.' });
        }
        if (!nomeColonnaFinale) {
            nomeColonnaFinale = colonnaResult.recordset[0].nome;
        }

        const result = await pool.request()
            .input('id_task', sql.Int, id)
            .input('id_colonna', sql.Int, idColonnaFinale)
            .input('stato', sql.NVarChar(50), nomeColonnaFinale)
            .query(`
                UPDATE dbo.tasks
                SET id_colonna = @id_colonna,
                    stato = @stato
                WHERE id_task = @id_task AND is_active = 1
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Task non trovato o non attivo.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/tasks/:id/stato:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento stato task.', error: err.message });
    }
});

router.put('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { titolo, id_persona, priorita, descrizione, dipende_da_id, stato, id_colonna, is_completato } = req.body;
        const pool = await getPoolPRG();
        let statoFinale = stato ?? null;

        if (id_colonna !== undefined && id_colonna !== null) {
            const colonnaResult = await pool.request()
                .input('id_colonna', sql.Int, id_colonna)
                .query(`SELECT nome FROM dbo.colonne_kanban WHERE id_colonna = @id_colonna`);
            if (!colonnaResult.recordset.length) {
                return res.status(400).json({ ok: false, message: 'Colonna non valida.' });
            }
            statoFinale = colonnaResult.recordset[0].nome;
        }

        const result = await pool.request()
            .input('id_task', sql.Int, id)
            .input('titolo', sql.NVarChar(255), titolo ?? null)
            .input('id_persona', sql.Int, id_persona ?? null)
            .input('priorita', sql.NVarChar(50), priorita ?? null)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione ?? null)
            .input('dipende_da_id', sql.Int, dipende_da_id ?? null)
            .input('id_colonna', sql.Int, id_colonna ?? null)
            .input('stato', sql.NVarChar(50), statoFinale)
            .input('is_completato', sql.Bit, is_completato ?? null)
            .query(`
                UPDATE dbo.tasks
                SET titolo = COALESCE(@titolo, titolo),
                    id_persona = COALESCE(@id_persona, id_persona),
                    priorita = COALESCE(@priorita, priorita),
                    descrizione = COALESCE(@descrizione, descrizione),
                    dipende_da_id = COALESCE(@dipende_da_id, dipende_da_id),
                    id_colonna = COALESCE(@id_colonna, id_colonna),
                    stato = COALESCE(
                        @stato,
                        CASE
                            WHEN @is_completato IS NULL THEN stato
                            WHEN @is_completato = 1 THEN 'Completato'
                            ELSE 'Da Fare'
                        END
                    )
                WHERE id_task = @id_task AND is_active = 1
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Task non trovato o non attivo.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/tasks/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento task.', error: err.message });
    }
});

router.post('/subtasks', authenticateToken, async (req, res) => {
    try {
        const { id_task, titolo, descrizione } = req.body;
        const pool = await getPoolPRG();
        const { idColumn, parentColumn } = await resolveSubTasksColumns(pool);
        const result = await pool.request()
            .input('id_task', sql.Int, id_task)
            .input('titolo', sql.NVarChar(255), titolo ?? '')
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .query(`
                INSERT INTO dbo.sub_tasks (${parentColumn}, titolo, descrizione, is_completato, is_critico)
                OUTPUT INSERTED.*
                VALUES (@id_task, @titolo, @descrizione, 0, 0)
            `);
        const inserted = result.recordset[0] || {};
        const normalized = {
            ...inserted,
            id_sub_task: inserted[idColumn] ?? inserted.id_sub_task,
            id_task_padre: inserted[parentColumn] ?? inserted.id_task_padre,
        };
        res.status(201).json({ ok: true, data: normalized });
    } catch (err) {
        console.error('POST /api/prg/subtasks:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione sotto-attivita.', error: err.message });
    }
});

router.put('/subtasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { titolo, descrizione, is_completato, is_critico } = req.body;
        const pool = await getPoolPRG();
        const { idColumn } = await resolveSubTasksColumns(pool);
        const result = await pool.request()
            .input('id_sub_task', sql.Int, id)
            .input('titolo', sql.NVarChar(255), titolo ?? null)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione ?? null)
            .input('is_completato', sql.Bit, is_completato ?? null)
            .input('is_critico', sql.Bit, is_critico ?? null)
            .query(`
                UPDATE dbo.sub_tasks
                SET titolo = COALESCE(@titolo, titolo),
                    descrizione = COALESCE(@descrizione, descrizione),
                    is_completato = COALESCE(@is_completato, is_completato),
                    is_critico = COALESCE(@is_critico, is_critico)
                WHERE ${idColumn} = @id_sub_task
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Sotto-attivita non trovata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/subtasks/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento sotto-attivita.', error: err.message });
    }
});

router.delete('/subtasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const { idColumn } = await resolveSubTasksColumns(pool);
        const result = await pool.request()
            .input('id_sub_task', sql.Int, id)
            .query(`DELETE FROM dbo.sub_tasks WHERE ${idColumn} = @id_sub_task`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Sotto-attivita non trovata.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/subtasks/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nella cancellazione sotto-attivita.', error: err.message });
    }
});

router.delete('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_task', sql.Int, id)
            .query(`DELETE FROM tasks WHERE id_task = @id_task`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Task non trovato.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/tasks/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nella cancellazione task.', error: err.message });
    }
});

module.exports = router;
