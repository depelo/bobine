const express = require('express');
const { sql, getPoolPRG } = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

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
    try {
        const { nome_progetto, descrizione, data_inizio, id_area } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('nome_progetto', sql.NVarChar(255), nome_progetto)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .input('data_inizio', sql.Date, data_inizio)
            .input('id_area', sql.Int, id_area || null)
            .query(`
                INSERT INTO dbo.progetti (nome_progetto, descrizione, data_inizio, id_area)
                OUTPUT INSERTED.*
                VALUES (@nome_progetto, @descrizione, @data_inizio, @id_area)
            `);
        res.status(201).json({ ok: true, data: result.recordset[0] });
    } catch (err) {
        console.error('POST /api/prg/progetti:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione progetto.', error: err.message });
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
                    t.priorita, t.descrizione, t.scadenza, t.stato, t.dipende_da_id,
                    p.nome AS nome_assegnato, p.cognome AS cognome_assegnato,
                    td.titolo AS titolo_dipendenza
                FROM dbo.tasks t
                LEFT JOIN persone p ON t.id_persona = p.id_persona
                LEFT JOIN dbo.tasks td ON t.dipende_da_id = td.id_task
                WHERE t.id_progetto = @id_progetto AND t.is_active = 1
                ORDER BY t.id_task ASC
            `);

        const tasks = result.recordset.map((task) => ({
            ...task,
            nome_assegnato: [task.nome_assegnato, task.cognome_assegnato].filter(Boolean).join(' ').trim(),
            stato: task.stato || 'Da Fare'
        }));
        res.json({ ok: true, data: tasks });
    } catch (error) {
        console.error('[ERRORE API TASKS]:', error);
        res.status(500).json({ ok: false, message: 'Errore nel recupero task del progetto.', error: error.message });
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
                INSERT INTO dbo.tasks (
                    id_progetto, titolo, id_persona, descrizione,
                    priorita, scadenza, stato, dipende_da_id, is_active
                )
                OUTPUT INSERTED.*
                VALUES (
                    @id_progetto, @titolo, @id_persona, @descrizione,
                    @priorita, @scadenza, 'Da Fare', @dipende_da_id, 1
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
        const { stato } = req.body;
        const statiValidi = ['Da Fare', 'In Corso', 'Revisione', 'Completato'];
        if (!statiValidi.includes(stato)) {
            return res.status(400).json({ ok: false, message: 'Stato task non valido.' });
        }

        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_task', sql.Int, id)
            .input('stato', sql.NVarChar(50), stato)
            .query(`
                UPDATE dbo.tasks
                SET stato = @stato
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
        const { titolo, id_persona, priorita, descrizione, dipende_da_id } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_task', sql.Int, id)
            .input('titolo', sql.NVarChar(255), titolo)
            .input('id_persona', sql.Int, id_persona)
            .input('priorita', sql.NVarChar(50), priorita || 'Media')
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .input('dipende_da_id', sql.Int, dipende_da_id || null)
            .query(`
                UPDATE dbo.tasks
                SET titolo = @titolo,
                    id_persona = @id_persona,
                    priorita = @priorita,
                    descrizione = @descrizione,
                    dipende_da_id = @dipende_da_id
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
