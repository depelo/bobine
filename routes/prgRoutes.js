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
                p.id_reparto, r.nome_reparto
            FROM progetti p
            LEFT JOIN reparti r ON p.id_reparto = r.id_reparto
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
        const { nome_progetto, descrizione, data_inizio, id_reparto } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('nome_progetto', sql.NVarChar(255), nome_progetto)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .input('data_inizio', sql.Date, data_inizio)
            .input('id_reparto', sql.Int, id_reparto || null)
            .query(`
                INSERT INTO dbo.progetti (nome_progetto, descrizione, data_inizio, id_reparto)
                OUTPUT INSERTED.*
                VALUES (@nome_progetto, @descrizione, @data_inizio, @id_reparto)
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
        const { nome_progetto, descrizione, data_inizio, data_fine, obbiettivi, priorita, budget, stato, id_reparto } = req.body;
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
            .input('id_reparto', sql.Int, id_reparto || null)
            .query(`
                UPDATE dbo.progetti
                SET nome_progetto = @nome_progetto, descrizione = @descrizione,
                    data_inizio = @data_inizio, data_fine = @data_fine,
                    obbiettivi = @obbiettivi, priorita = @priorita,
                    budget = @budget, stato = @stato, id_reparto = @id_reparto
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

router.get('/reparti', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPRG();
        const result = await pool.request().query(`
            SELECT id_reparto, nome_reparto, descrizione
            FROM dbo.reparti WHERE is_active = 1 ORDER BY nome_reparto ASC
        `);
        res.json({ ok: true, data: result.recordset });
    } catch (err) {
        console.error('GET /api/prg/reparti:', err);
        res.status(500).json({ ok: false, message: 'Errore nel recupero reparti.', error: err.message });
    }
});

router.post('/reparti', authenticateToken, async (req, res) => {
    try {
        const { nome_reparto, descrizione } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('nome_reparto', sql.NVarChar(150), nome_reparto)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .query(`
                INSERT INTO dbo.reparti (nome_reparto, descrizione, is_active)
                OUTPUT INSERTED.*
                VALUES (@nome_reparto, @descrizione, 1)
            `);
        res.status(201).json({ ok: true, data: result.recordset[0] });
    } catch (err) {
        console.error('POST /api/prg/reparti:', err);
        res.status(500).json({ ok: false, message: 'Errore nella creazione reparto.', error: err.message });
    }
});

router.put('/reparti/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome_reparto, descrizione } = req.body;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_reparto', sql.Int, id)
            .input('nome_reparto', sql.NVarChar(150), nome_reparto)
            .input('descrizione', sql.NVarChar(sql.MAX), descrizione || null)
            .query(`
                UPDATE dbo.reparti SET nome_reparto = @nome_reparto, descrizione = @descrizione
                WHERE id_reparto = @id_reparto AND is_active = 1
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Reparto non trovato o non attivo.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('PUT /api/prg/reparti/:id:', err);
        res.status(500).json({ ok: false, message: 'Errore nell aggiornamento reparto.', error: err.message });
    }
});

router.delete('/reparti/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPoolPRG();
        const result = await pool.request()
            .input('id_reparto', sql.Int, id)
            .query(`UPDATE dbo.reparti SET is_active = 0 WHERE id_reparto = @id_reparto AND is_active = 1`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ ok: false, message: 'Reparto non trovato o gia disattivato.' });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/prg/reparti/:id:', err);
        if (err.number === 547) {
            return res.status(409).json({ ok: false, message: 'Impossibile eliminare il reparto: sposta prima i progetti associati.' });
        }
        res.status(500).json({ ok: false, message: 'Errore nel soft-delete reparto.', error: err.message });
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

module.exports = router;
