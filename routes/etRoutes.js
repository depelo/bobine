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
    const queryText = (req.query.q || '').trim();
    try {
        const pool = await getPoolET();
        const productsRes = await pool.request()
            .input('qRaw', sql.NVarChar, queryText)
            .input('qLike', sql.NVarChar, queryText ? `${queryText}%` : '')
            .query(`
            SELECT DISTINCT TOP 50 MD_coddb
            FROM [ET].[dbo].[Vis_01_DBEtich]
            WHERE (@qRaw = '' OR MD_coddb LIKE @qLike)
            ORDER BY MD_coddb
        `);
        const products = (productsRes.recordset || []).map((row) => row.MD_coddb).filter((c) => c != null);
        res.json({ products });
    } catch (err) {
        console.error('GET /products ET:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/components/:padre', async (req, res) => {
    try {
        const pool = await getPoolET();
        const compRes = await pool.request()
            .input('padre', sql.NVarChar, req.params.padre)
            .query(`
            SELECT DISTINCT et_kcodart_layer AS MD_codfigli, et_layer_nriga
            FROM [ET].[dbo].[UJ_etichette]
            WHERE et_kcodart = @padre AND originedati = 'A'
            ORDER BY et_kcodart_layer, et_layer_nriga
        `);
        const components = (compRes.recordset || []).map((row) => ({
            MD_codfigli: row.MD_codfigli,
            et_kcodart_layer: row.MD_codfigli,
            et_layer_nriga: row.et_layer_nriga
        }));
        res.json({ components });
    } catch (err) {
        console.error('GET /components ET:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/label', async (req, res) => {
    const kcodart = (req.query.et_kcodart || '').trim();
    const kcodart_layer = (req.query.et_kcodart_layer || '').trim();
    const et_layer_nriga = req.query.et_layer_nriga;
    const etLayerRigaNum = Number(et_layer_nriga);
    if (!kcodart || !kcodart_layer || et_layer_nriga == null || String(et_layer_nriga).trim() === '') {
        return res.status(400).json({ error: 'Parametri et_kcodart, et_kcodart_layer e et_layer_nriga obbligatori.' });
    }
    if (Number.isNaN(etLayerRigaNum)) {
        return res.status(400).json({ error: 'Parametro et_layer_nriga non valido.' });
    }
    try {
        const pool = await getPoolET();
        const result = await pool.request()
            .input('et_kcodart', sql.NVarChar, kcodart)
            .input('et_kcodart_layer', sql.NVarChar, kcodart_layer)
            .input('et_layer_nriga', sql.Real, etLayerRigaNum)
            .query(`
            SELECT TOP 1 *
            FROM [ET].[dbo].[UJ_etichette]
            WHERE et_kcodart = @et_kcodart AND et_kcodart_layer = @et_kcodart_layer AND et_layer_nriga = @et_layer_nriga
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
    const CodiceFiglio = req.body && req.body.CodiceFiglio != null ? String(req.body.CodiceFiglio).trim() : '';
    const Riga = req.body && req.body.Riga != null ? Number(req.body.Riga) : NaN;
    const DatiEtichetta = req.body && typeof req.body.DatiEtichetta === 'object' && req.body.DatiEtichetta !== null
        ? req.body.DatiEtichetta
        : null;
    const globalId = req.user && req.user.globalId != null ? parseInt(req.user.globalId, 10) : null;

    if (!CodicePadre) {
        return res.status(400).json({ error: 'CodicePadre obbligatorio.' });
    }
    if (!CodiceFiglio) {
        return res.status(400).json({ error: 'CodiceFiglio obbligatorio.' });
    }
    if (Number.isNaN(Riga)) {
        return res.status(400).json({ error: 'Riga obbligatoria e numerica.' });
    }
    if (!DatiEtichetta) {
        return res.status(400).json({ error: 'DatiEtichetta obbligatorio (oggetto JSON).' });
    }
    if (globalId == null || Number.isNaN(globalId)) {
        return res.status(400).json({ error: 'Identità globale non disponibile nel token.' });
    }

    try {
        const pool = await getPoolET();
        await pool.request()
            .input('IDUser', sql.Int, globalId)
            .input('CodicePadre', sql.VarChar, CodicePadre)
            .input('CodiceFiglio', sql.VarChar, CodiceFiglio)
            .input('Riga', sql.Real, Riga)
            .input('JsonDati', sql.NVarChar, JSON.stringify(DatiEtichetta))
            .execute('[ET].[dbo].[sp_SalvaEtichetta]');

        res.status(200).json({ message: 'Salvataggio completato con successo.' });
    } catch (err) {
        console.error('POST /etichette/salva ET:', err);
        res.status(500).json({ error: err.message || 'Errore durante il salvataggio.' });
    }
});

module.exports = router;
