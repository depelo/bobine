const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const dbConfig = {
    user: 'sa',
    password: 'Uwey-2735',
    server: 'localhost',
    database: 'CMP',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// --- API OPERATORI ---

// Recupera todos los operadores, incluyendo el código de barras
app.get('/api/operators', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query('SELECT IDOperator as id, Operator as name, Admin as isAdmin, Barcode as barcode FROM [CMP].[dbo].[Operators]');
        res.json(result.recordset);
    } catch (err) {
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
            .query('INSERT INTO [CMP].[dbo].[Operators] (Operator, Admin, Barcode) VALUES (@Operator, @Admin, @Barcode)');
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
                L.Date as date,
                O.Operator as operator,
                L.IDOperator,
                M.Machine as machine,
                L.IDMachine,
                L.Codart as rawCode,
                L.Lot as lot,
                L.Quantity as quantity,
                L.Notes as notes,
                L.IDRoll as rollId
            FROM [CMP].[dbo].[Log] L
            LEFT JOIN [CMP].[dbo].[Operators] O ON L.IDOperator = O.IDOperator
            LEFT JOIN [CMP].[dbo].[Machines] M ON L.IDMachine = M.IDMachine
            ORDER BY L.Date DESC
        `;
        let result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/logs', async (req, res) => {
    const { date, IDOperator, IDMachine, rawCode, lot, quantity, notes, rollId } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Date', sql.DateTime, date)
            .input('IDOperator', sql.Int, IDOperator)
            .input('IDMachine', sql.Int, IDMachine)
            .input('Codart', sql.NVarChar, rawCode)
            .input('Lot', sql.NVarChar, lot)
            .input('Quantity', sql.Decimal, quantity)
            .input('Notes', sql.NVarChar, notes)
            .input('IDRoll', sql.NVarChar, rollId)
            .query(`
                INSERT INTO [CMP].[dbo].[Log]
                (Date, IDOperator, IDMachine, Codart, Lot, Quantity, Notes, IDRoll)
                VALUES (@Date, @IDOperator, @IDMachine, @Codart, @Lot, @Quantity, @Notes, @IDRoll)
            `);
        res.status(201).send({ message: 'Log registrato con successo' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/api/logs/:id', async (req, res) => {
    const id = req.params.id;
    const { date, IDOperator, IDMachine, rawCode, lot, quantity, notes, rollId } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('IDLog', sql.Int, id)
            .input('Date', sql.DateTime, date)
            .input('IDOperator', sql.Int, IDOperator)
            .input('IDMachine', sql.Int, IDMachine)
            .input('Codart', sql.NVarChar, rawCode)
            .input('Lot', sql.NVarChar, lot)
            .input('Quantity', sql.Decimal, quantity)
            .input('Notes', sql.NVarChar, notes)
            .input('IDRoll', sql.NVarChar, rollId)
            .query(`
                UPDATE [CMP].[dbo].[Log]
                SET Date = @Date, IDOperator = @IDOperator, IDMachine = @IDMachine,
                    Codart = @Codart, Lot = @Lot, Quantity = @Quantity,
                    Notes = @Notes, IDRoll = @IDRoll
                WHERE IDLog = @IDLog
            `);
        res.status(200).send({ message: 'Log aggiornato' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/api/logs/:id', async (req, res) => {
    const id = req.params.id;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('IDLog', sql.Int, id)
            .query('DELETE FROM [CMP].[dbo].[Log] WHERE IDLog = @IDLog');
        res.status(200).send({ message: 'Log eliminato' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server API in ascolto sulla porta ${PORT}`);
});
