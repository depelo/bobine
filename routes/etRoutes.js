const express = require('express');
const { sql, getPoolET } = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

function serializeLabelRow(row) {
    const out = {};
    for (const key of Object.keys(row)) {
        const val = row[key];
        if (val == null) {
            out[key] = '';
        } else if (val instanceof Date) {
            out[key] = val.toISOString();
        } else if (typeof val === 'number' || typeof val === 'boolean') {
            out[key] = val;
        } else {
            out[key] = String(val);
        }
    }
    return out;
}

router.get('/products', async (req, res) => {
    const q = (req.query.q || '').trim();
    try {
        const pool = await getPoolET();
        const likeTerm = q === '' ? '%' : `${q}%`;
        const result = await pool.request()
            .input('q', sql.NVarChar, q)
            .input('likeTerm', sql.NVarChar, likeTerm)
            .query(`
            SELECT DISTINCT TOP 50 MD_coddb AS cod
            FROM [ET].[dbo].[Prodotti_Padre]
            WHERE (@q = '' OR MD_coddb LIKE @likeTerm)
            ORDER BY MD_coddb
        `);
        const products = result.recordset.map(r => r.cod).filter(c => c != null);
        res.json({ products });
    } catch (err) {
        console.error('GET /products ET:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/components/:padre', async (req, res) => {
    const padre = req.params.padre;
    try {
        const pool = await getPoolET();
        const result = await pool.request()
            .input('padre', sql.NVarChar, padre)
            .query(`
            SELECT MD_codfigli
            FROM [ET].[dbo].[Componenti_Figli]
            WHERE MD_coddb = @padre AND MD_codfigli IS NOT NULL
            ORDER BY MD_codfigli
        `);
        const components = result.recordset.map(r => ({ MD_codfigli: r.MD_codfigli }));
        res.json({ components });
    } catch (err) {
        console.error('GET /components ET:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/label', async (req, res) => {
    const kcodart = (req.query.et_kcodart || '').trim();
    const kcodart_layer = (req.query.et_kcodart_layer || '').trim();
    if (!kcodart || !kcodart_layer) {
        return res.status(400).json({ error: 'Parametri et_kcodart e et_kcodart_layer obbligatori.' });
    }
    try {
        const pool = await getPoolET();
        const result = await pool.request()
            .input('et_kcodart', sql.NVarChar, kcodart)
            .input('et_kcodart_layer', sql.NVarChar, kcodart_layer)
            .query(`
            SELECT TOP 1 *
            FROM [ET].[dbo].[UJ_etichette3]
            WHERE et_kcodart = @et_kcodart AND et_kcodart_layer = @et_kcodart_layer
        `);
        if (!result.recordset || result.recordset.length === 0) {
            return res.status(404).json({ error: 'Nessun record trovato per i codici specificati' });
        }
        res.json(serializeLabelRow(result.recordset[0]));
    } catch (err) {
        console.error('GET /label ET:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/etichette/salva', authenticateToken, async (req, res) => {
    const CodicePadre = req.body && req.body.CodicePadre != null ? String(req.body.CodicePadre).trim() : '';
    const Descrizione = req.body && req.body.Descrizione != null ? String(req.body.Descrizione) : '';
    const globalId = req.user && req.user.globalId != null ? parseInt(req.user.globalId, 10) : null;

    if (!CodicePadre) {
        return res.status(400).json({ error: 'CodicePadre obbligatorio.' });
    }
    if (globalId == null || Number.isNaN(globalId)) {
        return res.status(400).json({ error: 'Identità globale non disponibile nel token.' });
    }

    try {
        const pool = await getPoolET();
        await pool.request()
            .input('CodicePadre', sql.NVarChar, CodicePadre)
            .input('Descrizione', sql.NVarChar, Descrizione)
            .input('IDUser', sql.Int, globalId)
            .execute('[ET].[dbo].[sp_SalvaEtichetta]');

        res.status(200).json({ message: 'Salvataggio completato con successo.' });
    } catch (err) {
        console.error('POST /etichette/salva ET:', err);
        res.status(500).json({ error: err.message || 'Errore durante il salvataggio.' });
    }
});

module.exports = router;
