const path = require('path');
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const dbConfig = {
    user: 'sa',
    password: 'Risk0804',
    server: 'localhost',
    database: 'CMP',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

// --- API OPERATORI ---

// Recupera todos los operadores, incluyendo il codice di barras e l'orario di inizio turno
app.get('/api/operators', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(
            `SELECT
                IDOperator as id,
                Operator as name,
                Admin as isAdmin,
                Barcode as barcode,
                CONVERT(varchar(5), StartTime, 108) as startTime
             FROM [CMP].[dbo].[Operators]`
        );
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.patch('/api/operators/:id/time', async (req, res) => {
    const { startTime } = req.body; // Formato "HH:mm" o stringa vuota
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('ID', sql.Int, parseInt(req.params.id, 10))
            .input('StartTime', sql.VarChar, startTime || null)
            .query('UPDATE [CMP].[dbo].[Operators] SET StartTime = @StartTime WHERE IDOperator = @ID');
        res.status(200).send({ message: 'Orario aggiornato' });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Añade un nuevo operador con código de barras
app.post('/api/operators', async (req, res) => {
    const { name, isAdmin, barcode } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Operator', sql.NVarChar, name)
            .input('Admin', sql.Bit, isAdmin ? 1 : 0)
            .input('Barcode', sql.NVarChar, barcode)
            .query(`INSERT INTO [CMP].[dbo].[Operators] (IDOperator, Operator, Admin, Barcode)
VALUES ((SELECT ISNULL(MAX(IDOperator), 0) + 1 FROM [CMP].[dbo].[Operators]), @Operator, @Admin, @Barcode)`);
        res.status(201).send({ message: 'Operatore aggiunto' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- API MACCHINE ---

// Recupera todas las máquinas, incluyendo el código de barras
app.get('/api/machines', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query('SELECT IDMachine as id, Machine as name, Barcode as barcode FROM [CMP].[dbo].[Machines]');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Añade una nueva máquina con código de barras
app.post('/api/machines', async (req, res) => {
    const { name, barcode } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Machine', sql.NVarChar, name)
            .input('Barcode', sql.NVarChar, barcode)
            .query('INSERT INTO [CMP].[dbo].[Machines] (Machine, Barcode) VALUES (@Machine, @Barcode)');
        res.status(201).send({ message: 'Macchina aggiunta' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- API LOG (REGISTRO) ---

app.get('/api/logs', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let query = `
            SELECT
                L.IDLog as uniqueRecordId,
                CONVERT(varchar(23), L.[Date], 126) as date,
                O.Operator as operator,
                L.IDOperator,
                M.Machine as machine,
                L.IDMachine,
                L.Codart as rawCode,
                L.Lot as lot,
                L.Quantity as quantity,
                L.Notes as notes,
                L.IDRoll as rollId,
                L.NumeroModifiche,
                L.bobina_finita
            FROM [CMP].[dbo].[Log] L
            LEFT JOIN [CMP].[dbo].[Operators] O ON L.IDOperator = O.IDOperator
            LEFT JOIN [CMP].[dbo].[Machines] M ON L.IDMachine = M.IDMachine
            WHERE L.Eliminato = 0
            ORDER BY L.Date DESC
        `;
        let result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/logs/:id', async (req, res) => {
    const id = req.params.id;
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('IDLog', sql.Int, id)
            .query(`
                SELECT
                    L.IDLog as uniqueRecordId,
                    CONVERT(varchar(23), L.[Date], 126) as date,
                    O.Operator as operator,
                    L.IDOperator,
                    M.Machine as machine,
                    L.IDMachine,
                    L.Codart as rawCode,
                    L.Lot as lot,
                    L.Quantity as quantity,
                    L.Notes as notes,
                    L.IDRoll as rollId,
                    L.NumeroModifiche,
                    L.bobina_finita
                FROM [CMP].[dbo].[Log] L
                LEFT JOIN [CMP].[dbo].[Operators] O ON L.IDOperator = O.IDOperator
                LEFT JOIN [CMP].[dbo].[Machines] M ON L.IDMachine = M.IDMachine
                WHERE L.IDLog = @IDLog AND L.Eliminato = 0
            `);
        if (!result.recordset || result.recordset.length === 0) {
            res.status(404).send('Log non trovato');
            return;
        }
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/logs/:id/history', async (req, res) => {
    const id = req.params.id;
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('IDLog', sql.Int, id)
            .query(`
                SELECT 
                    L.Quantity AS quantity,
                    L.Codart AS rawCode,
                    L.Lot AS lot,
                    L.Notes AS notes,
                    CONVERT(varchar(23), DATEADD(minute, DATEDIFF(minute, GETUTCDATE(), GETDATE()), L.ValidFrom), 126) AS validFrom,
                    ISNULL(O_Mod.Operator, O_Crea.Operator) AS operatorName,
                    L.NumeroModifiche
                FROM [CMP].[dbo].[Log] FOR SYSTEM_TIME ALL AS L
                LEFT JOIN [CMP].[dbo].[Operators] O_Mod ON L.ModificatoDa = O_Mod.IDOperator
                LEFT JOIN [CMP].[dbo].[Operators] O_Crea ON L.IDOperator = O_Crea.IDOperator
                WHERE L.IDLog = @IDLog
                ORDER BY L.ValidFrom ASC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/logs', async (req, res) => {
    const { date, IDOperator, IDMachine, rawCode, lot, quantity, notes, rollId } = req.body;
    const dateToSave = date ? new Date(date) : new Date();
    const idOperator = IDOperator != null ? parseInt(IDOperator, 10) : null;
    const idMachine = IDMachine != null ? parseInt(IDMachine, 10) : null;
    const qty = quantity != null ? parseFloat(quantity) : 0;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Date', sql.DateTime, dateToSave)
            .input('IDOperator', sql.Int, idOperator)
            .input('IDMachine', sql.Int, idMachine)
            .input('Codart', sql.NVarChar, rawCode)
            .input('Lot', sql.NVarChar, lot)
            .input('Quantity', sql.Decimal, qty)
            .input('Notes', sql.NVarChar, notes)
            .input('IDRoll', sql.NVarChar, rollId)
            .query(`
                INSERT INTO [CMP].[dbo].[Log]
                (IDLog, Date, IDOperator, IDMachine, Codart, Lot, Quantity, Notes, IDRoll)
                VALUES
                ((SELECT ISNULL(MAX(IDLog), 0) + 1 FROM [CMP].[dbo].[Log]), @Date, @IDOperator, @IDMachine, @Codart, @Lot, @Quantity, @Notes, @IDRoll)
            `);
        res.status(201).send({ message: 'Log registrato con successo' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/api/logs/:id', async (req, res) => {
    const id = req.params.id;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('IDLog', sql.Int, id)
            .input('Codart', sql.NVarChar, req.body.rawCode)
            .input('Lot', sql.NVarChar, req.body.lot)
            .input('Quantity', sql.Decimal, req.body.quantity != null ? parseFloat(req.body.quantity) : 0)
            .input('Notes', sql.NVarChar, req.body.notes)
            .input('ModificatoDa', sql.Int, req.body.modifyingOperatorId || null)
            .query(`
                UPDATE [CMP].[dbo].[Log]
                SET Codart = @Codart,
                    Lot = @Lot,
                    Quantity = @Quantity,
                    Notes = @Notes,
                    ModificatoDa = @ModificatoDa,
                    NumeroModifiche = NumeroModifiche + 1
                WHERE IDLog = @IDLog
            `);
        res.status(200).send({ message: 'Log aggiornato' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/api/logs/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const operatorId = req.query.operatorId ? parseInt(req.query.operatorId, 10) : null;

    if (Number.isNaN(id)) {
        return res.status(400).send('ID log non valido');
    }
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('IDLog', sql.Int, id)
            .input('ModificatoDa', sql.Int, operatorId)
            .query(`
                UPDATE [CMP].[dbo].[Log]
                SET Eliminato = 1,
                    ModificatoDa = @ModificatoDa,
                    NumeroModifiche = NumeroModifiche + 1
                WHERE IDLog = @IDLog
            `);
        res.status(200).send({ message: 'Log eliminato logicamente' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.patch('/api/logs/:id/bobina-finita', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { bobina_finita } = req.body; // true = 1 (Sì), false = 0 (No)
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('IDLog', sql.Int, id)
            .input('BobinaFinita', sql.Bit, bobina_finita)
            .query(`UPDATE [CMP].[dbo].[Log] SET bobina_finita = @BobinaFinita WHERE IDLog = @IDLog`);
        res.status(200).send({ message: 'Stato bobina aggiornato' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server API in ascolto sulla porta ${PORT}`);
});
