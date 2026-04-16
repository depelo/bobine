const express = require('express');
const { sql, getPoolITT } = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/tipa', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolITT();
        const result = await pool.request().query(`
            SELECT
                tb_codtipa,
                tb_destipa,
                HH_tb_descr,
                HH_tb_AIdescr,
                HH_tb_AIcriter,
                HH_tb_AIgloss
            FROM [UJET11].[dbo].[tabtipa]
            ORDER BY tb_codtipa
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('GET /api/itt/tipa:', err);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

router.put('/tipa/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { HH_tb_AIdescr, HH_tb_AIcriter, HH_tb_AIgloss } = req.body || {};

        if (!id) {
            return res.status(400).json({ error: 'Parametro id mancante.' });
        }

        const pool = await getPoolITT();
        const result = await pool.request()
            .input('tb_codtipa', sql.VarChar, id)
            .input('HH_tb_AIdescr', sql.VarChar(sql.MAX), HH_tb_AIdescr ?? null)
            .input('HH_tb_AIcriter', sql.VarChar(sql.MAX), HH_tb_AIcriter ?? null)
            .input('HH_tb_AIgloss', sql.VarChar(sql.MAX), HH_tb_AIgloss ?? null)
            .query(`
                UPDATE [UJET11].[dbo].[tabtipa]
                SET
                    HH_tb_AIdescr = @HH_tb_AIdescr,
                    HH_tb_AIcriter = @HH_tb_AIcriter,
                    HH_tb_AIgloss = @HH_tb_AIgloss
                WHERE tb_codtipa = @tb_codtipa
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Record non trovato.' });
        }

        res.json({ message: 'Record aggiornato con successo.', tb_codtipa: id });
    } catch (err) {
        console.error('PUT /api/itt/tipa/:id:', err);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

module.exports = router;
