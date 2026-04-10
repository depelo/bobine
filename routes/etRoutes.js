const express = require('express');
const { sql, getPoolPE, getPoolET } = require('../config/db');
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
        const pool = await getPoolPE();
        const productsRes = await pool.request()
            .input('qRaw', sql.NVarChar, queryText)
            .input('qLike', sql.NVarChar, queryText ? `${queryText}%` : '')
            .query(`
            SELECT TOP 50 MD_coddb, MAX(ISNULL(DescrPadre, '')) AS DescrPadre
            FROM [PE].[dbo].[Vis_01_DBEtich]
            WHERE (@qRaw = '' OR MD_coddb LIKE @qLike)
            GROUP BY MD_coddb
            ORDER BY MD_coddb
        `);
        const products = (productsRes.recordset || [])
            .filter((row) => row.MD_coddb != null)
            .map((row) => ({
                codice: String(row.MD_coddb).trim(),
                descrizione: row.DescrPadre != null ? String(row.DescrPadre) : ''
            }));
        res.json({ products });
    } catch (err) {
        console.error('GET /products PE:', err);
        res.status(500).json({ error: err.message });
    }
});

// Recupero lista Form per la combobox (stesso router di /products, /components, /label → /api/form-list)
router.get('/form-list', async (req, res) => {
    try {
        const pool = await getPoolPE();
        const result = await pool.request().query('SELECT * FROM [PE].[dbo].[Form] WHERE Valido = 1');
        res.json(result.recordset || []);
    } catch (error) {
        console.error('Errore recupero tabella Form:', error);
        res.status(500).json({ error: 'Errore recupero form' });
    }
});

// Metadati MS_Description sulla tabella fisica [ET].[dbo].[UJ_Etichette] (connessione al catalogo ET su BCUBE2)
async function queryUjEtichetteMetadata(pool) {
    const result = await pool.request().query(`
        SELECT
            CAST(c.name AS VARCHAR(255)) AS Campo,
            CAST(ep.value AS NVARCHAR(MAX)) AS Descrizione
        FROM sys.extended_properties AS ep
        INNER JOIN sys.columns AS c
            ON ep.major_id = c.object_id
            AND ep.minor_id = c.column_id
        WHERE ep.name = N'MS_Description'
          AND ep.major_id = OBJECT_ID(N'[dbo].[UJ_Etichette]')
    `);
    return result.recordset || [];
}

router.get('/et/metadata', async (req, res) => {
    try {
        const pool = await getPoolET();
        const rows = await queryUjEtichetteMetadata(pool);
        res.json(rows);
    } catch (err) {
        console.error('GET /et/metadata:', err);
        res.status(500).json({ error: err.message });
    }
});

// Alias retrocompatibile — stesso payload array { Campo, Descrizione }
router.get('/uj-etichette-column-descriptions', async (req, res) => {
    try {
        const pool = await getPoolET();
        const rows = await queryUjEtichetteMetadata(pool);
        res.json(rows);
    } catch (err) {
        console.error('GET /uj-etichette-column-descriptions:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/components/:padre', async (req, res) => {
    try {
        const pool = await getPoolPE();

        // 1. Recupero la descrizione del padre dalla vista (con ISNULL per evitare valori nulli e alias esplicito)
        const descRes = await pool.request()
            .input('padre', sql.NVarChar, req.params.padre)
            .query(`SELECT TOP 1 ISNULL(DescrPadre, 'NESSUNA DESCRIZIONE') AS DescrizioneDato FROM [PE].[dbo].[Vis_01_DBEtich] WHERE MD_coddb = @padre`);

        const padreDesc = descRes.recordset.length > 0 ? descRes.recordset[0].DescrizioneDato : 'CODICE NON TROVATO IN VIS_01';
        console.log(`[DEBUG] Ricerca padre: ${req.params.padre} | Descrizione trovata: ${padreDesc}`); // Log backend

        // 2. Recupero componenti dalla vista (BOM) e verifico esistenza in UJ_etichette
        const compRes = await pool.request()
            .input('padre', sql.NVarChar, req.params.padre.trim())
            .query(`
            SELECT
                LTRIM(RTRIM(v.MD_codfigli)) AS MD_codfigli,
                v.md_riga AS et_layer_nriga,
                ISNULL(v.DescrFiglio, '') AS figlioDesc,
                CASE WHEN u.et_kcodart_layer IS NOT NULL THEN 1 ELSE 0 END AS IsConfigurata,
                u.et_kcodart_form AS Form,
                u.et_kcodart_form_pos AS FormPos
            FROM [PE].[dbo].[Vis_01_DBEtich] v
            LEFT JOIN [PE].[dbo].[UJ_etichette] u
                ON LTRIM(RTRIM(v.MD_coddb)) = LTRIM(RTRIM(u.et_kcodart))
               AND LTRIM(RTRIM(v.MD_codfigli)) = LTRIM(RTRIM(u.et_kcodart_layer))
               AND v.md_riga = u.et_layer_nriga
               AND u.originedati = 'A'
            WHERE LTRIM(RTRIM(v.MD_coddb)) = @padre
            ORDER BY MD_codfigli, et_layer_nriga
        `);

        const components = (compRes.recordset || []).map((row) => ({
            MD_codfigli: row.MD_codfigli,
            et_layer_nriga: row.et_layer_nriga,
            figlioDesc: row.figlioDesc,
            IsConfigurata: row.IsConfigurata,
            Form: row.Form != null ? String(row.Form) : '',
            FormPos: row.FormPos != null ? String(row.FormPos) : ''
        }));

        res.json({ components, padreDesc });
    } catch (err) {
        console.error('GET /components PE:', err);
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
        const pool = await getPoolPE();
        const result = await pool.request()
            .input('et_kcodart', sql.NVarChar, kcodart)
            .input('et_kcodart_layer', sql.NVarChar, kcodart_layer)
            .input('et_layer_nriga', sql.Real, etLayerRigaNum)
            .query(`
            SELECT TOP 1 *
            FROM [PE].[dbo].[UJ_etichette]
            WHERE et_kcodart = @et_kcodart AND et_kcodart_layer = @et_kcodart_layer AND et_layer_nriga = @et_layer_nriga
        `);
        if (!result.recordset || result.recordset.length === 0) {
            return res.status(404).json({ error: 'Nessun record trovato per i codici specificati' });
        }
        res.json(serializeLabelRow(result.recordset[0]));
    } catch (err) {
        console.error('GET /label PE:', err);
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
        const pool = await getPoolPE();

        // 2. Trasformazione del payload in stringa JSON
        const jsonDati = JSON.stringify(DatiEtichetta);

        // 3. Esecuzione con ESATTAMENTE i 5 parametri previsti dal database
        await pool.request()
            .input('IDUser', sql.Int, globalId)
            .input('CodicePadre', sql.VarChar, CodicePadre)
            .input('CodiceFiglio', sql.VarChar, CodiceFiglio)
            .input('Riga', sql.Real, Riga)
            .input('JsonDati', sql.NVarChar, jsonDati)
            .execute('[PE].[dbo].[sp_SalvaEtichetta]');

        res.status(200).json({ message: 'Salvataggio completato con successo.' });
    } catch (err) {
        console.error('POST /etichette/salva PE:', err);
        res.status(500).json({ error: err.message || 'Errore durante il salvataggio.' });
    }
});

// --- CRUD TABELLA FORM (PULITO E CORRETTO) ---

router.get('/forms', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPE();
        const result = await pool.request().query(`
            SELECT IDForm, Form, Valido, Note 
            FROM [PE].[dbo].[Form] 
            ORDER BY IDForm DESC
        `);
        res.json(result.recordset || []);
    } catch (err) {
        console.error('GET /forms error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/forms', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPE();
        await pool.request()
            .input('Form', sql.VarChar, req.body.Form)
            .input('Valido', sql.Bit, req.body.Valido ? 1 : 0)
            .input('Note', sql.VarChar, req.body.Note || '')
            .query(`
                INSERT INTO [PE].[dbo].[Form] (Form, Valido, Note) 
                VALUES (@Form, @Valido, @Note)
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('POST /forms error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/forms/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPE();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('Form', sql.VarChar, req.body.Form)
            .input('Valido', sql.Bit, req.body.Valido ? 1 : 0)
            .input('Note', sql.VarChar, req.body.Note || '')
            .query(`
                UPDATE [PE].[dbo].[Form] 
                SET Form = @Form, Valido = @Valido, Note = @Note 
                WHERE IDForm = @id
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /forms error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/forms/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await getPoolPE();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                UPDATE [PE].[dbo].[Form] 
                SET Valido = 0 
                WHERE IDForm = @id
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /forms error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
