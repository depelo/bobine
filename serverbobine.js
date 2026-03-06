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

// --- API ADMIN / CAPTAIN CONSOLE ---

// Middleware per verificare i privilegi di Superuser
function authenticateCaptain(req, res, next) {
    authenticateToken(req, res, () => {
        if (!req.user || !req.user.isSuperuser) {
            return res.status(403).json({ message: 'Accesso negato: richiesti privilegi di Captain' });
        }
        next();
    });
}

// --- API OPERATORI ---

// Recupera todos los operadores, incluyendo il codice di barras e l'orario di inizio turno
app.get('/api/operators', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT 
                O.IDOperator AS id, 
                U.Name AS name, 
                U.Barcode AS barcode, 
                O.Admin AS isAdmin,
                CONVERT(varchar(5), O.StartTime, 108) AS startTime
            FROM [CMP].[dbo].[Operators] O
            INNER JOIN [CMP].[dbo].[Users] U ON O.IDUser = U.IDUser
            WHERE U.IsActive = 1
        `);
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
    try {
        const operator = req.body?.operator ?? req.body?.name;
        const admin = req.body?.admin ?? req.body?.isAdmin;
        const barcode = req.body?.barcode;
        const startTime = req.body?.startTime ?? null;
        const password = req.body?.password;

        const hash = await bcrypt.hash(password || '123456', 10); // Default password if empty
        let pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Insert into Users (Passport)
            const userReq = new sql.Request(transaction);
            userReq.input('name', sql.NVarChar, operator);
            userReq.input('barcode', sql.NVarChar, barcode);
            userReq.input('pwd', sql.NVarChar, hash);
            const userRes = await userReq.query(`
                INSERT INTO [CMP].[dbo].[Users] (Name, Barcode, PasswordHash, IsActive)
                OUTPUT INSERTED.IDUser
                VALUES (@name, @barcode, @pwd, 1)
            `);
            const newUserId = userRes.recordset[0].IDUser;

            // 2. Insert into Operators (Visa)
            const opReq = new sql.Request(transaction);
            opReq.input('idUser', sql.Int, newUserId);
            opReq.input('admin', sql.Bit, admin);
            opReq.input('startTime', sql.VarChar, startTime);
            await opReq.query(`
                INSERT INTO [CMP].[dbo].[Operators] (IDUser, Admin, StartTime)
                VALUES (@idUser, @admin, @startTime)
            `);

            await transaction.commit();
            res.status(201).send({ message: 'Operatore creato con successo' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (err) {
        console.error('Errore POST /api/operators:', err);
        res.status(500).send(err.message);
    }
});

app.put('/api/operators/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { operator, admin, barcode, startTime, password } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Get the linked IDUser
            const getReq = new sql.Request(transaction);
            getReq.input('idOp', sql.Int, id);
            const getRes = await getReq.query(`SELECT IDUser FROM [CMP].[dbo].[Operators] WHERE IDOperator = @idOp`);
            if (getRes.recordset.length === 0) throw new Error("Operatore non trovato");
            const idUser = getRes.recordset[0].IDUser;

            // Update Users
            const userReq = new sql.Request(transaction);
            userReq.input('idUser', sql.Int, idUser);
            userReq.input('name', sql.NVarChar, operator);
            userReq.input('barcode', sql.NVarChar, barcode);

            let pwdQuery = '';
            if (password && password.trim() !== '') {
                const hash = await bcrypt.hash(password, 10);
                userReq.input('pwd', sql.NVarChar, hash);
                pwdQuery = ', PasswordHash = @pwd, LastPasswordChange = GETDATE()';
            }

            await userReq.query(`
                UPDATE [CMP].[dbo].[Users] 
                SET Name = @name, Barcode = @barcode ${pwdQuery}
                WHERE IDUser = @idUser
            `);

            // Update Operators
            const opReq = new sql.Request(transaction);
            opReq.input('idOp', sql.Int, id);
            opReq.input('admin', sql.Bit, admin);
            opReq.input('startTime', sql.VarChar, startTime);
            await opReq.query(`
                UPDATE [CMP].[dbo].[Operators]
                SET Admin = @admin, StartTime = @startTime
                WHERE IDOperator = @idOp
            `);

            await transaction.commit();
            res.status(200).send({ message: 'Operatore aggiornato' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (err) {
        console.error('Errore PUT /api/operators:', err);
        res.status(500).send(err.message);
    }
});

app.delete('/api/operators/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('idOp', sql.Int, id)
            .query(`
                UPDATE U
                SET U.IsActive = 0
                FROM [CMP].[dbo].[Users] U
                INNER JOIN [CMP].[dbo].[Operators] O ON U.IDUser = O.IDUser
                WHERE O.IDOperator = @idOp
            `);
        res.status(200).send({ message: 'Operatore disattivato logicamente' });
    } catch (err) {
        console.error('Errore DELETE /api/operators:', err);
        res.status(500).send(err.message);
    }
});

// --- API ADMIN / CAPTAIN CONSOLE ---

// 1. Recupera tutti gli utenti globali (Passaporti)
app.get('/api/admin/users', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT 
                IDUser as id, 
                Name as name, 
                Barcode as barcode, 
                IsActive as isActive,
                SessionHoursOverride as sessionHoursOverride,
                ForcePwdChange as forcePwdChange,
                PwdExpiryDaysOverride as pwdExpiryDaysOverride,
                LastPasswordChange as lastPasswordChange
            FROM [CMP].[dbo].[Users]
            ORDER BY Name ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 2. Aggiorna utente (identità e sicurezza - Passaporto)
app.put('/api/admin/users/:id', authenticateCaptain, async (req, res) => {
    const idUser = parseInt(req.params.id, 10);
    const { name, barcode, password, forcePwdChange, pwdExpiryDaysOverride } = req.body;

    try {
        let pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input('idUser', sql.Int, idUser);
        request.input('name', sql.NVarChar, name);
        request.input('barcode', sql.NVarChar, barcode);
        request.input('forcePwdChange', sql.Bit, forcePwdChange ? 1 : 0);
        request.input('pwdExpiry', sql.Int, pwdExpiryDaysOverride ? parseInt(pwdExpiryDaysOverride, 10) : null);

        let pwdQuery = '';
        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            request.input('pwd', sql.NVarChar, hash);
            pwdQuery = ', PasswordHash = @pwd, LastPasswordChange = GETDATE()';
        }

        await request.query(`
            UPDATE [CMP].[dbo].[Users] 
            SET Name = @name, 
                Barcode = @barcode,
                ForcePwdChange = @forcePwdChange,
                PwdExpiryDaysOverride = @pwdExpiry
                ${pwdQuery}
            WHERE IDUser = @idUser
        `);

        res.status(200).json({ message: 'Impostazioni di sicurezza aggiornate con successo.' });
    } catch (err) {
        console.error('Errore PUT /api/admin/users/:id:', err);
        res.status(500).send(err.message);
    }
});

// 3. Recupera i moduli e i ruoli autodefiniti
app.get('/api/admin/modules', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT 
                IDModule as id, 
                ModuleName as name, 
                TargetTable as targetTable,
                RoleDefinition as roleDefinition
            FROM [CMP].[dbo].[Modules]
        `);
        
        // Parse the JSON string from the database for the frontend
        const modules = result.recordset.map(mod => ({
            ...mod,
            roleDefinition: JSON.parse(mod.roleDefinition)
        }));
        
        res.json(modules);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 4. Creazione utente con transazione (Passaporto + Visti)
app.post('/api/admin/users', authenticateCaptain, async (req, res) => {
    const { name, barcode, password, roles } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const hash = await bcrypt.hash(password || '123456', 10);
            const userReq = new sql.Request(transaction);
            userReq.input('name', sql.NVarChar, name);
            userReq.input('barcode', sql.NVarChar, barcode);
            userReq.input('pwd', sql.NVarChar, hash);

            const userRes = await userReq.query(`
                INSERT INTO [CMP].[dbo].[Users] (Name, Barcode, PasswordHash, IsActive)
                OUTPUT INSERTED.IDUser
                VALUES (@name, @barcode, @pwd, 1)
            `);
            const newUserId = userRes.recordset[0].IDUser;

            if (roles && roles.length > 0) {
                const validTables = ['Operators', 'Operators_Man'];
                for (const role of roles) {
                    if (!validTables.includes(role.targetTable)) continue;

                    const roleReq = new sql.Request(transaction);
                    roleReq.input('idUser', sql.Int, newUserId);

                    if (role.targetTable === 'Operators') {
                        const isAdmin = role.roleKey === 'Admin' ? 1 : 0;
                        roleReq.input('admin', sql.Bit, isAdmin);
                        await roleReq.query(`
                            INSERT INTO [CMP].[dbo].[Operators] (IDUser, Admin)
                            VALUES (@idUser, @admin)
                        `);
                    }
                }
            }

            await transaction.commit();
            res.status(201).json({ message: 'Utente globale e visti creati con successo.' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (err) {
        console.error('Errore POST /api/admin/users:', err);
        res.status(500).send(err.message);
    }
});

// 5. Soft delete globale utente
app.delete('/api/admin/users/:id', authenticateCaptain, async (req, res) => {
    const idUser = parseInt(req.params.id, 10);
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('idUser', sql.Int, idUser)
            .query(`UPDATE [CMP].[dbo].[Users] SET IsActive = 0 WHERE IDUser = @idUser`);
        res.status(200).json({ message: 'Utente disattivato logicamente.' });
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
            .input('barcode', sql.NVarChar, barcode)
            .query(`
                SELECT 
                    U.IDUser, 
                    U.Name AS Operator, 
                    U.Barcode, 
                    U.PasswordHash, 
                    U.IsActive,
                    O.IDOperator,
                    O.Admin,
                    CASE WHEN C.IDCaptain IS NOT NULL THEN 1 ELSE 0 END AS IsSuperuser
                FROM [CMP].[dbo].[Users] U
                LEFT JOIN [CMP].[dbo].[Operators] O ON U.IDUser = O.IDUser
                LEFT JOIN [CMP].[dbo].[Captains] C ON U.IDUser = C.IDUser
                WHERE U.Barcode = @barcode AND U.IsActive = 1
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
                U.Name as operator,
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
            LEFT JOIN [CMP].[dbo].[Users] U ON O.IDUser = U.IDUser
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
                    U.Name as operator,
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
                LEFT JOIN [CMP].[dbo].[Users] U ON O.IDUser = U.IDUser
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
                        ISNULL(U_Mod.Name, U_Crea.Name) AS operatorName,
                        L.NumeroModifiche,
                        LAG(L.Quantity) OVER (ORDER BY L.ValidFrom) AS prev_quantity,
                        LAG(L.Codart) OVER (ORDER BY L.ValidFrom) AS prev_rawCode,
                        LAG(L.Lot) OVER (ORDER BY L.ValidFrom) AS prev_lot,
                        LAG(L.Notes) OVER (ORDER BY L.ValidFrom) AS prev_notes
                    FROM [CMP].[dbo].[Log] FOR SYSTEM_TIME ALL AS L
                    LEFT JOIN [CMP].[dbo].[Operators] O_Mod ON L.ModificatoDa = O_Mod.IDOperator
                    LEFT JOIN [CMP].[dbo].[Users] U_Mod ON O_Mod.IDUser = U_Mod.IDUser
                    LEFT JOIN [CMP].[dbo].[Operators] O_Crea ON L.IDOperator = O_Crea.IDOperator
                    LEFT JOIN [CMP].[dbo].[Users] U_Crea ON O_Crea.IDUser = U_Crea.IDUser
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

const https = require('https');
const fs = require('fs');

// Percorsi assoluti dei certificati SSL generati in locale
const sslOptions = {
    key: fs.readFileSync('C:\\Acme\\certificati_ssl\\rotoli.ujet.it-key.pem'),
    cert: fs.readFileSync('C:\\Acme\\certificati_ssl\\rotoli.ujet.it-chain.pem')
};

// Avvio del server in HTTPS sulla porta standard 443
const PORT = 443;
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Server API in ascolto in HTTPS sulla porta ${PORT} all'indirizzo https://rotoli.ujet.it`);
});
