const path = require('path');
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(express.static(__dirname));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET non è definito nelle variabili di ambiente.');
}

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

function authenticateToken(req, res, next) {
    const token = req.cookies && req.cookies.jwt_token;
    if (!token) {
        return res.status(401).send('Token mancante');
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).send('Token non valido');
        }
        req.user = user;
        next();
    });
}

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

app.post('/api/login', async (req, res) => {
    const { barcode, password } = req.body || {};
    if (!barcode) {
        return res.status(400).json({ message: 'Barcode richiesto' });
    }
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('Barcode', sql.NVarChar, barcode)
            .query(`
                SELECT TOP 1
                    IDOperator,
                    Operator,
                    Admin,
                    Barcode,
                    PasswordHash,
                    IsSuperuser
                FROM [CMP].[dbo].[Operators]
                WHERE Barcode = @Barcode AND IsActive = 1
            `);

        if (!result.recordset || result.recordset.length === 0) {
            return res.status(401).json({ message: 'Credenziali non valide' });
        }

        const row = result.recordset[0];
        const isAdmin = row.Admin === true || row.Admin === 1;
        const isSuperuser = row.IsSuperuser === true || row.IsSuperuser === 1;

        const payload = {
            id: row.IDOperator,
            name: row.Operator,
            isAdmin,
            isSuperuser,
            barcode: row.Barcode
        };

        if (!isAdmin && !isSuperuser) {
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
            res.cookie('jwt_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 12 * 60 * 60 * 1000
            });
            return res.json({ user: payload });
        }

        if (!password) {
            return res.status(401).json({ requiresPassword: true, message: 'Password richiesta' });
        }

        const passwordOk = await bcrypt.compare(password, row.PasswordHash || '');
        if (!passwordOk) {
            return res.status(401).json({ message: 'Credenziali non valide' });
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
        res.cookie('jwt_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 12 * 60 * 60 * 1000
        });
        return res.json({ user: payload });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('jwt_token');
    res.json({ message: 'Logout eseguito' });
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
                WITH HistoryCTE AS (
                    SELECT 
                        L.Quantity AS quantity,
                        L.Codart AS rawCode,
                        L.Lot AS lot,
                        L.Notes AS notes,
                        L.ValidFrom,
                        ISNULL(O_Mod.Operator, O_Crea.Operator) AS operatorName,
                        L.NumeroModifiche,
                        LAG(L.Quantity) OVER (ORDER BY L.ValidFrom) AS prev_quantity,
                        LAG(L.Codart) OVER (ORDER BY L.ValidFrom) AS prev_rawCode,
                        LAG(L.Lot) OVER (ORDER BY L.ValidFrom) AS prev_lot,
                        LAG(L.Notes) OVER (ORDER BY L.ValidFrom) AS prev_notes
                    FROM [CMP].[dbo].[Log] FOR SYSTEM_TIME ALL AS L
                    LEFT JOIN [CMP].[dbo].[Operators] O_Mod ON L.ModificatoDa = O_Mod.IDOperator
                    LEFT JOIN [CMP].[dbo].[Operators] O_Crea ON L.IDOperator = O_Crea.IDOperator
                    WHERE L.IDLog = @IDLog
                )
                SELECT 
                    quantity,
                    rawCode,
                    lot,
                    notes,
                    CONVERT(varchar(23), DATEADD(minute, DATEDIFF(minute, GETUTCDATE(), GETDATE()), ValidFrom), 126) AS validFrom,
                    operatorName,
                    NumeroModifiche
                FROM HistoryCTE
                WHERE prev_quantity IS NULL 
                   OR quantity <> prev_quantity
                   OR ISNULL(rawCode, '') <> ISNULL(prev_rawCode, '')
                   OR ISNULL(lot, '') <> ISNULL(prev_lot, '')
                   OR ISNULL(notes, '') <> ISNULL(prev_notes, '')
                ORDER BY ValidFrom ASC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/logs', authenticateToken, async (req, res) => {
    const { date, IDMachine, rawCode, lot, quantity, notes, rollId } = req.body;
    const dateToSave = date ? new Date(date) : new Date();
    const idOperator = req.user && req.user.id != null ? parseInt(req.user.id, 10) : null;
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
                (IDLog, Date, IDOperator, IDMachine, Codart, Lot, Quantity, Notes, IDRoll, bobina_finita)
                VALUES
                ((SELECT ISNULL(MAX(IDLog), 0) + 1 FROM [CMP].[dbo].[Log]), @Date, @IDOperator, @IDMachine, @Codart, @Lot, @Quantity, @Notes, @IDRoll, NULL)
            `);
        res.status(201).send({ message: 'Log registrato con successo' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/api/logs/:id', authenticateToken, async (req, res) => {
    const id = req.params.id;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('IDLog', sql.Int, id)
            .input('Codart', sql.NVarChar, req.body.rawCode)
            .input('Lot', sql.NVarChar, req.body.lot)
            .input('Quantity', sql.Decimal, req.body.quantity != null ? parseFloat(req.body.quantity) : 0)
            .input('Notes', sql.NVarChar, req.body.notes)
            .input('ModificatoDa', sql.Int, req.user && req.user.id != null ? parseInt(req.user.id, 10) : null)
            .input('BobinaFinita', sql.Bit, req.body.bobina_finita !== undefined ? req.body.bobina_finita : null)
            .query(`
                UPDATE [CMP].[dbo].[Log]
                SET Codart = @Codart,
                    Lot = @Lot,
                    Quantity = @Quantity,
                    Notes = @Notes,
                    ModificatoDa = @ModificatoDa,
                    bobina_finita = @BobinaFinita,
                    NumeroModifiche = NumeroModifiche + 1
                WHERE IDLog = @IDLog
            `);
        res.status(200).send({ message: 'Log aggiornato' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/api/logs/:id', authenticateToken, async (req, res) => {
    const logId = parseInt(req.params.id, 10);
    const operatorId = req.user.id;
    if (Number.isNaN(logId)) return res.status(400).send('ID log non valido');
    try {
        let pool = await sql.connect(dbConfig);
        if (req.user.isAdmin || req.user.isSuperuser) {
            await pool.request()
                .input('IDLog', sql.Int, logId)
                .input('ModificatoDa', sql.Int, operatorId)
                .query(`UPDATE [CMP].[dbo].[Log] SET Eliminato = 1, ModificatoDa = @ModificatoDa, NumeroModifiche = NumeroModifiche + 1 WHERE IDLog = @IDLog`);
            return res.status(200).send({ message: 'Log eliminato da Admin' });
        }
        await pool.request()
            .input('IDLog', sql.Int, logId)
            .input('IDOperator', sql.Int, operatorId)
            .execute('[dbo].[sp_DeleteLogOperatore]');
        res.status(200).send({ message: 'Log eliminato logicamente' });
    } catch (err) {
        const status = err.number >= 50000 ? 403 : 500;
        res.status(status).send(err.message);
    }
});

app.patch('/api/logs/:id/bobina-finita', authenticateToken, async (req, res) => {
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
