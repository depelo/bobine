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
    database: 'GA',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        useUTC: false
    }
};

// Funzione Helper per calcolare le "Regole Effettive" della password (Globali vs Override)
async function getEffectivePwdRules(pool, userId) {
    // 1. Legge le regole globali
    const confRes = await pool.request().query(
        "SELECT ConfigKey, ConfigValue FROM [GA].[dbo].[SystemConfig] WHERE ConfigKey IN ('PwdMinLength', 'PwdRequireNumber', 'PwdRequireUpper', 'PwdRequireSpecial')"
    );
    let globals = { PwdMinLength: 6, PwdRequireNumber: true, PwdRequireUpper: false, PwdRequireSpecial: false };
    confRes.recordset.forEach(r => {
        if (r.ConfigKey === 'PwdMinLength') {
            const parsed = parseInt(r.ConfigValue, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                globals.PwdMinLength = parsed;
            }
        } else if (r.ConfigKey in globals) {
            globals[r.ConfigKey] = r.ConfigValue === '1';
        }
    });

    // 2. Legge gli override dell'utente
    const userRes = await pool.request()
        .input('id', sql.Int, userId)
        .query(`
            SELECT PwdMinLengthOverride, PwdRequireNumberOverride, PwdRequireUpperOverride, PwdRequireSpecialOverride
            FROM [GA].[dbo].[Users]
            WHERE IDUser = @id
        `);
    const overrides = userRes.recordset[0] || {};

    const numOverride = (val, fallback) =>
        val !== null && val !== undefined && !Number.isNaN(parseInt(val, 10)) ? parseInt(val, 10) : fallback;
    const boolOverride = (val, fallback) =>
        val !== null && val !== undefined
            ? (val === true || val === 1 || val === '1')
            : fallback;

    // 3. Fonde i risultati (vince l'override se non è NULL)
    return {
        minLength: numOverride(overrides.PwdMinLengthOverride, globals.PwdMinLength),
        requireNum: boolOverride(overrides.PwdRequireNumberOverride, globals.PwdRequireNumber),
        requireUpp: boolOverride(overrides.PwdRequireUpperOverride, globals.PwdRequireUpper),
        requireSpec: boolOverride(overrides.PwdRequireSpecialOverride, globals.PwdRequireSpecial)
    };
}

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
        // Se il token richiede un cambio password e la rotta NON è quella per cambiare la password o fare logout
        if (req.user && req.user.forcePwdChange) {
            const isAllowedPath = req.path === '/api/users/me/password' || req.path === '/api/logout';
            if (!isAllowedPath) {
                return res.status(403).json({ requiresPasswordChange: true, message: 'Cambio password obbligatorio' });
            }
        }
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
app.get('/api/operators', authenticateToken, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT 
                O.IDOperator AS id, 
                U.IDUser as globalId,
                U.Name AS name, 
                U.Barcode AS barcode, 
                O.Admin AS isAdmin,
                U.ResetRequested as resetRequested,
                CONVERT(varchar(5), O.StartTime, 108) AS startTime
            FROM [BOB].[dbo].[Operators] O
            INNER JOIN [GA].[dbo].[Users] U ON O.IDUser = U.IDUser
            WHERE U.IsActive = 1
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.patch('/api/operators/:id/time', authenticateToken, async (req, res) => {
    const { startTime } = req.body; // Formato "HH:mm" o stringa vuota
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('ID', sql.Int, parseInt(req.params.id, 10))
            .input('StartTime', sql.VarChar, startTime || null)
            .query('UPDATE [BOB].[dbo].[Operators] SET StartTime = @StartTime WHERE IDOperator = @ID');
        res.status(200).send({ message: 'Orario aggiornato' });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Utenti globali disponibili (Passaporti senza Visto Bobine attivo)
app.get('/api/operators/available', authenticateToken, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT IDUser as id, Name as name, Barcode as barcode 
            FROM [GA].[dbo].[Users] 
            WHERE IsActive = 1 
            AND IDUser NOT IN (SELECT IDUser FROM [BOB].[dbo].[Operators] WHERE IsActive = 1)
            ORDER BY Name ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Añade/riattiva un operatore Bobine assegnando un Visto a un Passaporto esistente
app.post('/api/operators', authenticateToken, async (req, res) => {
    const { globalId, admin, startTime } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('idUser', sql.Int, globalId)
            .input('admin', sql.Bit, admin ? 1 : 0)
            .input('startTime', sql.VarChar, startTime || null)
            .query(`
                IF EXISTS (SELECT 1 FROM [BOB].[dbo].[Operators] WHERE IDUser = @idUser)
                BEGIN
                    UPDATE [BOB].[dbo].[Operators] 
                    SET IsActive = 1, Admin = @admin, StartTime = @startTime 
                    WHERE IDUser = @idUser
                END
                ELSE
                BEGIN
                    INSERT INTO [BOB].[dbo].[Operators] (IDUser, Admin, StartTime, IsActive) 
                    VALUES (@idUser, @admin, @startTime, 1)
                END
            `);
        res.status(201).send({ message: 'Visto assegnato con successo' });
    } catch (err) {
        console.error('Errore POST /api/operators:', err);
        res.status(500).send(err.message);
    }
});

// Aggiorna solo il Visto Bobine (Admin/StartTime), non il Passaporto globale
app.put('/api/operators/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { admin, startTime } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('idOp', sql.Int, id)
            .input('admin', sql.Bit, admin ? 1 : 0)
            .input('startTime', sql.VarChar, startTime || null)
            .query(`
                UPDATE [BOB].[dbo].[Operators]
                SET Admin = @admin, StartTime = @startTime
                WHERE IDOperator = @idOp
            `);
        res.status(200).send({ message: 'Operatore aggiornato' });
    } catch (err) {
        console.error('Errore PUT /api/operators:', err);
        res.status(500).send(err.message);
    }
});

// Revoca il Visto Bobine lasciando intatto il Passaporto globale
app.delete('/api/operators/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('idOp', sql.Int, id)
            .query(`
                UPDATE [BOB].[dbo].[Operators] 
                SET IsActive = 0 
                WHERE IDOperator = @idOp
            `);
        res.status(200).send({ message: 'Operatore disattivato logicamente' });
    } catch (err) {
        console.error('Errore DELETE /api/operators:', err);
        res.status(500).send(err.message);
    }
});

// Reset password di reparto per un operatore Bobine (risolve l'allarme Captain)
app.put('/api/operators/:id/reset-password', authenticateToken, async (req, res) => {
    const idOp = parseInt(req.params.id, 10);
    const { newPassword, forcePwdChange } = req.body;
    
    if (!req.user.isAdmin && !req.user.isSuperuser) return res.status(403).send('Solo gli Admin possono resettare le password');
    if (!newPassword) return res.status(400).send('Password obbligatoria');

    try {
        let pool = await sql.connect(dbConfig);
        
        // Verifica che l'operatore appartenga a Bobine e recupera IDUser globale
        const getRes = await pool.request()
            .input('idOp', sql.Int, idOp)
            .query(`SELECT IDUser FROM [BOB].[dbo].[Operators] WHERE IDOperator = @idOp`);
            
        if (getRes.recordset.length === 0) return res.status(404).send('Operatore non trovato in questo reparto');
        const idUser = getRes.recordset[0].IDUser;

        const hash = await bcrypt.hash(newPassword, 10);
        
        await pool.request()
            .input('idUser', sql.Int, idUser)
            .input('hash', sql.NVarChar, hash)
            .input('force', sql.Bit, forcePwdChange ? 1 : 0)
            .query(`
                UPDATE [GA].[dbo].[Users] 
                SET PasswordHash = @hash, LastPasswordChange = GETDATE(), ForcePwdChange = @force, ResetRequested = 0 
                WHERE IDUser = @idUser
            `);

        // Avvisa in tempo reale tutta la rete che un allarme è stato risolto
        if (typeof io !== 'undefined') {
            io.emit('pwd_reset_resolved');
        }

        res.status(200).send({ message: 'Password resettata con successo' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- API ADMIN / CAPTAIN CONSOLE ---

// 1. Recupera tutti gli utenti globali (Passaporti) con Visti aggregati
app.get('/api/admin/users', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);

        // 1. Recupera gli utenti attivi (Passaporto)
        const usersRes = await pool.request().query(`
            SELECT IDUser as id, Name as name, Barcode as barcode, IsActive as isActive,
                   SessionHoursOverride as sessionHoursOverride, ForcePwdChange as forcePwdChange,
                   PwdExpiryDaysOverride as pwdExpiryDaysOverride,
                   LastPasswordChange as LastPasswordChange,
                   LastLogin as LastLogin,
                   LastBarcodeChange as LastBarcodeChange,
                   DefaultModuleID,
                   ResetRequested as resetRequested,
                   PwdMinLengthOverride as pwdMinLengthOverride,
                   PwdRequireNumberOverride as pwdRequireNumberOverride,
                   PwdRequireUpperOverride as pwdRequireUpperOverride,
                   PwdRequireSpecialOverride as pwdRequireSpecialOverride,
                   SortOrder as sortOrder
            FROM [GA].[dbo].[Users]
            WHERE IsActive = 1
            ORDER BY SortOrder ASC, Name ASC
        `);
        let users = usersRes.recordset.map(u => ({
            ...u,
            forcePwdChange: !!u.forcePwdChange && u.forcePwdChange !== 0 && u.forcePwdChange !== '0',
            resetRequested: !!u.resetRequested && u.resetRequested !== 0 && u.resetRequested !== '0',
            pwdRequireNumberOverride: u.pwdRequireNumberOverride === null || u.pwdRequireNumberOverride === undefined ? null : (!!u.pwdRequireNumberOverride && u.pwdRequireNumberOverride !== 0 && u.pwdRequireNumberOverride !== '0'),
            pwdRequireUpperOverride: u.pwdRequireUpperOverride === null || u.pwdRequireUpperOverride === undefined ? null : (!!u.pwdRequireUpperOverride && u.pwdRequireUpperOverride !== 0 && u.pwdRequireUpperOverride !== '0'),
            pwdRequireSpecialOverride: u.pwdRequireSpecialOverride === null || u.pwdRequireSpecialOverride === undefined ? null : (!!u.pwdRequireSpecialOverride && u.pwdRequireSpecialOverride !== 0 && u.pwdRequireSpecialOverride !== '0'),
            defaultModuleId: u.DefaultModuleID,
            lastLogin: u.LastLogin,
            lastBarcodeChange: u.LastBarcodeChange,
            lastPasswordChange: u.LastPasswordChange
        }));

        // 2. Recupera i moduli (Visti disponibili)
        const modRes = await pool.request().query(`SELECT IDModule, ModuleName, TargetDb, TargetTable, RoleDefinition FROM [GA].[dbo].[Modules]`);
        const modules = modRes.recordset;

        // Inizializza gli array per ogni utente
        for (let u of users) {
            u.apps = [];
            // IDs dei moduli autorizzati (Meta-App)
            u.authorizedModuleIds = [];
            // Stato di sessione calcolato in RAM tramite Socket.io
            u.hasActiveSession = activeUserSockets.has(u.id);
        }

        // 3. Popola le autorizzazioni sfruttando TargetSchema
        for (let mod of modules) {
            if (!mod.TargetDb || !mod.TargetTable) continue;

            let roleDef = {};
            try { roleDef = JSON.parse(mod.RoleDefinition); } catch (e) {}

            const fullTableName = `[${mod.TargetDb}].[dbo].[${mod.TargetTable}]`;
            let roleRes;

            try {
                if (mod.TargetTable === 'Operators') {
                    roleRes = await pool.request().query(`SELECT IDUser, Admin FROM ${fullTableName} WHERE IsActive = 1`);
                } else if (mod.TargetTable === 'Captains') {
                    roleRes = await pool.request().query(`SELECT IDUser, 1 as Admin FROM ${fullTableName} WHERE IsActive = 1`);
                } else {
                    continue;
                }
            } catch (err) {
                console.error(`Errore su ${fullTableName}:`, err.message);
                continue;
            }

            if (roleRes && roleRes.recordset) {
                for (let row of roleRes.recordset) {
                    let user = users.find(x => x.id === row.IDUser);
                    if (user) {
                        let rKey = mod.TargetTable === 'Operators'
                            ? (row.Admin ? 'Admin' : 'Base')
                            : 'Master';
                        let rLabel = roleDef[rKey] ? roleDef[rKey].label : rKey;
                        user.apps.push({
                            moduleId: mod.IDModule,
                            moduleName: mod.ModuleName,
                            roleKey: rKey,
                            roleLabel: rLabel
                        });
                        if (!user.authorizedModuleIds.includes(mod.IDModule)) {
                            user.authorizedModuleIds.push(mod.IDModule);
                        }
                    }
                }
            }
        }
        res.json(users);
    } catch (err) {
        console.error('Errore GET /api/admin/users:', err);
        res.status(500).send(err.message);
    }
});

// 6. Salvataggio ordine personalizzato utenti (Drag & Drop)
app.put('/api/admin/users/reorder', authenticateCaptain, async (req, res) => {
    const { orderedIds } = req.body; // Array di ID in ordine
    if (!orderedIds || !Array.isArray(orderedIds)) return res.status(400).send('Array orderedIds non valido');
    try {
        let pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            for (let i = 0; i < orderedIds.length; i++) {
                const reqSort = new sql.Request(transaction);
                reqSort.input('id', sql.Int, orderedIds[i]);
                reqSort.input('sort', sql.Int, i);
                await reqSort.query(`UPDATE [GA].[dbo].[Users] SET SortOrder = @sort WHERE IDUser = @id`);
            }
            await transaction.commit();
            res.status(200).json({ message: 'Ordine aggiornato' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 2. Aggiorna utente (identità e sicurezza - Passaporto)
app.put('/api/admin/users/:id', authenticateCaptain, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, barcode, password, forcePwdChange, pwdExpiryDaysOverride, defaultModuleId, pwdMinLengthOverride, pwdRequireNumberOverride, pwdRequireUpperOverride, pwdRequireSpecialOverride } = req.body;

    try {
        let pool = await sql.connect(dbConfig);

        // Controlla se il barcode è cambiato
        const oldUserRes = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT Barcode FROM [GA].[dbo].[Users] WHERE IDUser = @id`);
            
        let barcodeChanged = false;
        if (oldUserRes.recordset.length > 0 && oldUserRes.recordset[0].Barcode !== barcode) {
            barcodeChanged = true;
        }

        const request = pool.request();
        request.input('id', sql.Int, id);
        request.input('name', sql.NVarChar, name);
        request.input('barcode', sql.NVarChar, barcode);
        request.input('forcePwdChange', sql.Bit, forcePwdChange ? 1 : 0);
        request.input('pwdExpiry', sql.Int, pwdExpiryDaysOverride ? parseInt(pwdExpiryDaysOverride, 10) : null);
        request.input('defaultModuleId', sql.Int, defaultModuleId ? parseInt(defaultModuleId, 10) : null);
        request.input('pwdMinLength', sql.Int, pwdMinLengthOverride !== '' && pwdMinLengthOverride !== null && pwdMinLengthOverride !== undefined ? parseInt(pwdMinLengthOverride, 10) : null);
        request.input('pwdReqNum', sql.Bit, pwdRequireNumberOverride !== null && pwdRequireNumberOverride !== undefined ? (pwdRequireNumberOverride ? 1 : 0) : null);
        request.input('pwdReqUpp', sql.Bit, pwdRequireUpperOverride !== null && pwdRequireUpperOverride !== undefined ? (pwdRequireUpperOverride ? 1 : 0) : null);
        request.input('pwdReqSpec', sql.Bit, pwdRequireSpecialOverride !== null && pwdRequireSpecialOverride !== undefined ? (pwdRequireSpecialOverride ? 1 : 0) : null);

        let updateQuery = `
            UPDATE [GA].[dbo].[Users] 
            SET Name = @name, 
                Barcode = @barcode,
                ForcePwdChange = @forcePwdChange,
                PwdExpiryDaysOverride = @pwdExpiry,
                DefaultModuleID = @defaultModuleId,
                ResetRequested = 0,
                PwdMinLengthOverride = @pwdMinLength,
                PwdRequireNumberOverride = @pwdReqNum,
                PwdRequireUpperOverride = @pwdReqUpp,
                PwdRequireSpecialOverride = @pwdReqSpec
        `;

        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            request.input('pwd', sql.NVarChar, hash);
            updateQuery += `, PasswordHash = @pwd, LastPasswordChange = GETDATE() `;
        }
        
        if (barcodeChanged) {
            updateQuery += `, LastBarcodeChange = GETDATE() `;
        }

        updateQuery += ` WHERE IDUser = @id`;

        await request.query(updateQuery);

        // Se il Captain ha azzerato ResetRequested o modificato password/flag, notifichiamo tutta la rete
        if (typeof io !== 'undefined') {
            io.emit('pwd_reset_resolved');
        }

        res.status(200).json({ message: 'Impostazioni di sicurezza aggiornate con successo.' });
    } catch (err) {
        console.error('Errore PUT /api/admin/users/:id:', err);
        res.status(500).send(err.message);
    }
});

// 2b. Upsert Permessi e Ruoli (Tab 3 - Visti)
app.put('/api/admin/users/:id/roles', authenticateCaptain, async (req, res) => {
    const idUser = parseInt(req.params.id, 10);
    const { roles } = req.body;

    try {
        let pool = await sql.connect(dbConfig);

        // 2. Upsert nelle tabelle dipartimentali 100% Dinamico
        const modulesRes = await pool.request().query(`SELECT TargetDb, TargetTable FROM [GA].[dbo].[Modules]`);
        const validModules = modulesRes.recordset;
        const submittedRoles = roles || [];

        for (const mod of validModules) {
            const table = mod.TargetTable;
            const dbName = mod.TargetDb;
            if (!dbName || !table) continue;

            const assignedRole = submittedRoles.find(r => r.targetTable === table);
            const fullTable = `[${dbName}].[dbo].[${table}]`;

            // Adattamento dinamico alla colonna Ruolo tra le App
            let roleCol = table === 'Captains' ? 'Role' : 'Admin';

            if (assignedRole) {
                await pool.request()
                    .input('id', sql.Int, idUser)
                    .input('adminVal', sql.Int, assignedRole.roleKey === 'Admin' ? 1 : 0)
                    .query(`
                    IF EXISTS (SELECT 1 FROM ${fullTable} WHERE IDUser = @id)
                    BEGIN
                        UPDATE ${fullTable} SET IsActive = 1, ${roleCol} = ${table === 'Captains' ? "'Master'" : '@adminVal'} WHERE IDUser = @id
                    END
                    ELSE
                    BEGIN
                        INSERT INTO ${fullTable} (IDUser, ${roleCol}, IsActive) 
                        VALUES (@id, ${table === 'Captains' ? "'Master'" : '@adminVal'}, 1)
                    END
                `);
            } else {
                // Nessun ruolo inviato = Revoca (IsActive = 0)
                await pool.request()
                    .input('id', sql.Int, idUser)
                    .query(`
                    UPDATE ${fullTable} SET IsActive = 0 WHERE IDUser = @id
                `);
            }
        }

        res.status(200).json({ message: 'Permessi aggiornati con successo.' });
    } catch (err) {
        console.error('Errore PUT /api/admin/users/:id/roles:', err);
        res.status(500).send(err.message);
    }
});

// 3. Recupera i moduli e i ruoli autodefiniti
app.get('/api/admin/modules', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT IDModule as id, ModuleName as name, TargetDb as targetDb, TargetTable as targetTable, RoleDefinition as roleDefinition, AppSettings as appSettings FROM [GA].[dbo].[Modules]
        `);

        const modules = result.recordset.map(mod => {
            let rDef = {}, aSet = {};
            try { rDef = mod.roleDefinition ? JSON.parse(mod.roleDefinition) : {}; } catch (e) {}
            try { aSet = mod.appSettings ? JSON.parse(mod.appSettings) : {}; } catch (e) {}
            return { ...mod, roleDefinition: rDef, appSettings: aSet };
        });
        res.json(modules);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 3b. Aggiorna RoleDefinition e AppSettings del modulo
app.put('/api/admin/modules/:id', authenticateCaptain, async (req, res) => {
    const idModule = parseInt(req.params.id, 10);
    const { roleDefinition, appSettings } = req.body;

    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('idModule', sql.Int, idModule)
            .input('roleDef', sql.NVarChar, JSON.stringify(roleDefinition))
            .input('appSet', sql.NVarChar, JSON.stringify(appSettings || {}))
            .query(`UPDATE [GA].[dbo].[Modules] SET RoleDefinition = @roleDef, AppSettings = @appSet WHERE IDModule = @idModule`);

        res.status(200).json({ message: 'Regole e Impostazioni App aggiornate con successo.' });
    } catch (err) {
        console.error('Errore PUT /api/admin/modules/:id:', err);
        res.status(500).send(err.message);
    }
});

app.get('/api/admin/config', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT ConfigKey, ConfigValue, Description
            FROM [GA].[dbo].[SystemConfig]
            ORDER BY ConfigKey ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/api/admin/config', authenticateCaptain, async (req, res) => {
    const configs = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const item of configs) {
                const sqlReq = new sql.Request(transaction);
                sqlReq.input('key', sql.VarChar, item.key);
                sqlReq.input('val', sql.VarChar, item.value !== null && item.value !== '' ? String(item.value) : null);

                await sqlReq.query(`
                    IF EXISTS (SELECT 1 FROM [GA].[dbo].[SystemConfig] WHERE ConfigKey = @key)
                        UPDATE [GA].[dbo].[SystemConfig] SET ConfigValue = @val WHERE ConfigKey = @key
                    ELSE
                        INSERT INTO [GA].[dbo].[SystemConfig] (ConfigKey, ConfigValue) VALUES (@key, @val)
                `);
            }
            await transaction.commit();
            res.status(200).json({ message: 'Configurazioni aggiornate' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (err) {
        console.error('Errore PUT /api/admin/config:', err);
        res.status(500).send(err.message);
    }
});

// 4. Creazione utente con transazione (Passaporto + Visti)
app.post('/api/admin/users', authenticateCaptain, async (req, res) => {
    const { name, barcode, password, forcePwdChange, defaultModuleId, roles } = req.body;
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
            userReq.input('forcePwdChange', sql.Bit, forcePwdChange ? 1 : 0);
            userReq.input('defaultModuleId', sql.Int, defaultModuleId ? parseInt(defaultModuleId, 10) : null);

            const userRes = await userReq.query(`
                INSERT INTO [GA].[dbo].[Users] (Name, Barcode, PasswordHash, IsActive, ForcePwdChange, DefaultModuleID, LastBarcodeChange)
                OUTPUT INSERTED.IDUser
                VALUES (@name, @barcode, @pwd, 1, @forcePwdChange, @defaultModuleId, GETDATE())
            `);
            const newUserId = userRes.recordset[0].IDUser;

            if (roles && roles.length > 0) {
                const modReq = new sql.Request(transaction);
                const modRes = await modReq.query(`SELECT TargetDb, TargetTable FROM [GA].[dbo].[Modules]`);
                const modules = modRes.recordset || [];

                for (const role of roles) {
                    const modDef = modules.find(m => m.TargetTable === role.targetTable);
                    if (!modDef || !modDef.TargetDb || !modDef.TargetTable) continue;

                    const dbName = modDef.TargetDb;
                    const table = modDef.TargetTable;
                    const fullTable = `[${dbName}].[dbo].[${table}]`;

                    const isAdmin = role.roleKey === 'Admin' ? 1 : 0;
                    const roleCol = table === 'Captains' ? 'Role' : 'Admin';

                    try {
                        const insReq = new sql.Request(transaction);
                        insReq.input('idUser', sql.Int, newUserId);
                        
                        if (table === 'Captains') {
                            await insReq.query(`
                                INSERT INTO ${fullTable} (IDUser, ${roleCol}, IsActive)
                                VALUES (@idUser, 'Master', 1)
                            `);
                        } else {
                            insReq.input('admin', sql.Bit, isAdmin);
                            await insReq.query(`
                                INSERT INTO ${fullTable} (IDUser, ${roleCol}, IsActive)
                                VALUES (@idUser, @admin, 1)
                            `);
                        }
                    } catch (e) {
                        console.error('Errore creazione visto per', fullTable, e.message);
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
            .query(`UPDATE [GA].[dbo].[Users] SET IsActive = 0 WHERE IDUser = @idUser`);
        res.status(200).json({ message: 'Utente disattivato logicamente.' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- INIZIO ROTTE ARCHIVIO E RIPRISTINO ---
// A. Recupera tutti gli utenti disattivati (Cestino)
app.get('/api/admin/users/deleted', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT IDUser as id, Name as name, Barcode as barcode
            FROM [GA].[dbo].[Users]
            WHERE IsActive = 0
            ORDER BY Name ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// B. Ripristina un utente (Forzando il cambio password per sicurezza)
app.put('/api/admin/users/:id/restore', authenticateCaptain, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`UPDATE [GA].[dbo].[Users] SET IsActive = 1, ForcePwdChange = 1 WHERE IDUser = @id`);
        res.status(200).json({ message: 'OK' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// C. Fuzzy Check Anti-Doppione
app.post('/api/admin/users/check-duplicate', authenticateCaptain, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.json([]);
        
        // Divide il nome in parole chiave (ignorando singole lettere)
        const words = name.trim().split(/\s+/).filter(w => w.length > 1);
        if (words.length === 0) return res.json([]);

        let pool = await sql.connect(dbConfig);
        let reqSql = pool.request();
        
        let conditions = [];
        words.forEach((w, i) => {
            reqSql.input(`w${i}`, sql.NVarChar, `%${w}%`);
            conditions.push(`Name LIKE @w${i}`);
        });

        // Cerca utenti disattivati che contengono TUTTE le parole cercate (in qualsiasi ordine)
        const query = `
            SELECT TOP 5 IDUser as id, Name as name, Barcode as barcode 
            FROM [GA].[dbo].[Users] 
            WHERE IsActive = 0 AND ${conditions.join(' AND ')}
        `;
        
        const result = await reqSql.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});
// --- FINE ROTTE ARCHIVIO E RIPRISTINO ---

// --- API MACCHINE ---

// Recupera todas las máquinas, incluyendo el código de barras
app.get('/api/machines', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query('SELECT IDMachine as id, Machine as name, Barcode as barcode FROM [BOB].[dbo].[Machines]');
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
            .query('INSERT INTO [BOB].[dbo].[Machines] (Machine, Barcode) VALUES (@Machine, @Barcode)');
        res.status(201).send({ message: 'Macchina aggiunta' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/login', async (req, res) => {
    const { barcode, password } = req.body || {};
    if (!barcode) {
        return res.status(400).json({ message: 'QR Code richiesto' });
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
                    U.ForcePwdChange,
                    U.LastPasswordChange,
                    U.PwdExpiryDaysOverride,
                    U.DefaultModuleID,
                    O.IDOperator,
                    O.Admin,
                    O.StartTime
                FROM [GA].[dbo].[Users] U
                LEFT JOIN [BOB].[dbo].[Operators] O ON U.IDUser = O.IDUser
                WHERE U.Barcode = @barcode AND U.IsActive = 1
            `);

        if (!result.recordset || result.recordset.length === 0) {
            return res.status(401).json({ message: 'Credenziali non valide' });
        }

        const row = result.recordset[0];
        const isAdmin = row.Admin === true || row.Admin === 1;

        // Controllo Superuser (usando il nuovo schema e IsActive)
        const captainRes = await pool.request()
            .input('idUser', sql.Int, row.IDUser)
            .query(`SELECT 1 FROM [CAP].[dbo].[Captains] WHERE IDUser = @idUser AND IsActive = 1`);
        const isSuperuser = captainRes.recordset.length > 0;

        // Calcolo scadenza password / cambio forzato
        let globalExpiryDays = 90;
        try {
            const cfgRes = await pool.request().query(`
                SELECT ConfigValue 
                FROM [GA].[dbo].[SystemConfig] 
                WHERE ConfigKey = 'AdminPwdExpiryDays'
            `);
            if (cfgRes.recordset && cfgRes.recordset.length > 0) {
                const rawVal = cfgRes.recordset[0].ConfigValue;
                if (rawVal !== null && rawVal !== undefined) {
                    const parsed = parseInt(rawVal, 10);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                        globalExpiryDays = parsed;
                    }
                }
            }
        } catch (cfgErr) {
            console.error('Errore lettura AdminPwdExpiryDays:', cfgErr);
        }

        // --- CALCOLO MODULI AUTORIZZATI E LIVELLO DI SICUREZZA (HIGH WATERMARK) ---
        const modulesRes = await pool.request().query(`SELECT IDModule, ModuleName, TargetDb, TargetTable, RoleDefinition, AppSettings FROM [GA].[dbo].[Modules]`);
        const authorizedApps = [];
        let globalRequiresPassword = isSuperuser; // Il Superuser richiede sempre la password di default

        for (let mod of modulesRes.recordset) {
            if (!mod.TargetDb || !mod.TargetTable) continue;

            let hasAccess = false;
            let localRoleKey = 'Base';
            const fullTableName = `[${mod.TargetDb}].[dbo].[${mod.TargetTable}]`;

            if (mod.TargetTable === 'Operators') {
                const roleRes = await pool.request()
                    .input('id', sql.Int, row.IDUser)
                    .query(`SELECT Admin FROM ${fullTableName} WHERE IDUser = @id AND IsActive = 1`);
                if (roleRes.recordset.length > 0) {
                    hasAccess = true;
                    localRoleKey = roleRes.recordset[0].Admin ? 'Admin' : 'Base';
                }
            } else if (mod.TargetTable === 'Captains') {
                if (isSuperuser) {
                    hasAccess = true;
                    localRoleKey = 'Master';
                }
            }

            if (hasAccess) {
                let roleLabel = localRoleKey;
                let requiresPassword = false;

                // Valutazione High Watermark e recupero Label dal RoleDefinition
                if (mod.RoleDefinition) {
                    try {
                        const rDef = JSON.parse(mod.RoleDefinition);
                        if (rDef[localRoleKey]) {
                            roleLabel = rDef[localRoleKey].label || localRoleKey;
                            if (rDef[localRoleKey].requiresPassword) {
                                requiresPassword = true;
                                globalRequiresPassword = true;
                            }
                        }
                    } catch (e) {
                        console.error('Errore parsing RoleDefinition per modulo', mod.IDModule);
                    }
                }
                authorizedApps.push({
                    id: mod.IDModule,
                    name: mod.ModuleName,
                    target: mod.TargetTable,
                    roleKey: localRoleKey,
                    roleLabel: roleLabel,
                    requiresPassword: requiresPassword
                });
            }
        }

        let needsPasswordChange = false;

        // Eseguiamo i controlli di sicurezza SOLO se l'High Watermark richiede la password
        if (globalRequiresPassword) {
            const overrideDays = row.PwdExpiryDaysOverride != null ? parseInt(row.PwdExpiryDaysOverride, 10) : null;
            const expiryDays = !Number.isNaN(overrideDays) && overrideDays > 0 ? overrideDays : globalExpiryDays;

            let expired = false;
            if (row.LastPasswordChange && expiryDays > 0) {
                const lastChangeDate = new Date(row.LastPasswordChange);
                if (!Number.isNaN(lastChangeDate.getTime())) {
                    const expiryDate = new Date(lastChangeDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);
                    if (new Date() > expiryDate) {
                        expired = true;
                    }
                }
            }

            const forceFlag = row.ForcePwdChange === true || row.ForcePwdChange === 1;
            needsPasswordChange = forceFlag || expired;

            // Verifica presenza e correttezza della password
            if (!password) {
                return res.status(401).json({ requiresPassword: true, message: 'Password richiesta per il tuo livello di accesso' });
            }

            const passwordOk = await bcrypt.compare(password, row.PasswordHash || '');
            if (!passwordOk) {
                return res.status(401).json({ message: 'Credenziali non valide' });
            }
        }

        // Calcola le regole password effettive per il frontend
        const pwdRules = await getEffectivePwdRules(pool, row.IDUser);

        // Aggiorna LastLogin
        try {
            const pool2 = await sql.connect(dbConfig);
            await pool2.request()
                .input('idUser', sql.Int, row.IDUser)
                .query(`UPDATE [GA].[dbo].[Users] SET LastLogin = GETDATE() WHERE IDUser = @idUser`);
        } catch (dbErr) {
            console.error('Errore aggiornamento LastLogin:', dbErr);
        }

        // Creazione del payload JWT comune a tutti
        const payload = {
            id: row.IDOperator,
            globalId: row.IDUser,
            name: row.Operator,
            isAdmin, // Mantenuto per retrocompatibilità temporanea con bobine.js
            isSuperuser,
            barcode: row.Barcode,
            startTime: row.StartTime ? row.StartTime.toISOString().substring(11, 16) : null,
            forcePwdChange: needsPasswordChange,
            defaultModuleId: row.DefaultModuleID,
            authorizedApps: authorizedApps
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
        res.cookie('jwt_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 12 * 60 * 60 * 1000
        });
        
        return res.json({ user: payload, pwdRules });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        const userRes = await pool.request()
            .input('idUser', sql.Int, req.user.globalId)
            .query(`SELECT IsActive, ForcePwdChange FROM [GA].[dbo].[Users] WHERE IDUser = @idUser`);

        // Se l'utente non esiste più o è stato disattivato
        if (userRes.recordset.length === 0 || !userRes.recordset[0].IsActive) {
            res.clearCookie('jwt_token');
            return res.status(401).send('Utente disattivato o inesistente');
        }

        // Calcola le regole effettive fresche dal DB
        const pwdRules = await getEffectivePwdRules(pool, req.user.globalId);

        const isForcePwdDB = (userRes.recordset[0].ForcePwdChange === true || userRes.recordset[0].ForcePwdChange === 1);

        // Se il DB impone il cambio password, ma il JWT attuale dell'utente non lo sa (es. post-F5)
        if (isForcePwdDB && !req.user.forcePwdChange) {
            return res.status(403).json({ requiresPasswordChange: true, message: 'Cambio password obbligatorio innescato dall\'amministratore', pwdRules: pwdRules });
        }

        res.json({ ...req.user, pwdRules });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('jwt_token');
    res.json({ message: 'Logout eseguito' });
});

app.put('/api/users/me/password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword, currentPassword } = req.body;
    const effectiveOldPassword = currentPassword !== undefined ? currentPassword : oldPassword;
    if (!newPassword) return res.status(400).json({ message: 'La nuova password è obbligatoria.' });

    try {
        let pool = await sql.connect(dbConfig);
        // Ricava il PasswordHash attuale da Users usando l'IDUser tramite la relazione con Operators
        let userRes = await pool.request()
            .input('idUser', sql.Int, req.user.globalId)
            .query(`
                SELECT IDUser, PasswordHash 
                FROM [GA].[dbo].[Users]
                WHERE IDUser = @idUser
            `);

        if (userRes.recordset.length === 0) return res.status(404).send('Utente non trovato');
        const dbUser = userRes.recordset[0];

        // Verifica vecchia password
        const passwordOk = await bcrypt.compare(effectiveOldPassword, dbUser.PasswordHash || '');
        if (!passwordOk) return res.status(401).json({ message: 'Vecchia password errata' });

        // Calcola regole e valida rigorosamente la nuova password
        const rules = await getEffectivePwdRules(pool, dbUser.IDUser);
        if (newPassword.length < rules.minLength) {
            return res.status(400).json({ message: `La password deve essere lunga almeno ${rules.minLength} caratteri.` });
        }
        if (rules.requireNum && !/\d/.test(newPassword)) {
            return res.status(400).json({ message: 'La password deve contenere almeno un numero.' });
        }
        if (rules.requireUpp && !/[A-Z]/.test(newPassword)) {
            return res.status(400).json({ message: 'La password deve contenere almeno una lettera maiuscola.' });
        }
        if (rules.requireSpec && !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            return res.status(400).json({ message: 'La password deve contenere almeno un carattere speciale (!@#...).' });
        }

        // Salva nuova password
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.request()
            .input('idUser', sql.Int, dbUser.IDUser)
            .input('hash', sql.NVarChar, hash)
            .query(`
                UPDATE [GA].[dbo].[Users] 
                SET PasswordHash = @hash, LastPasswordChange = GETDATE(), ForcePwdChange = 0 
                WHERE IDUser = @idUser
            `);

        // Estrai e scarta 'iat' ed 'exp' dal vecchio token, mantieni il resto in 'cleanUser'
        const { iat, exp, ...cleanUser } = req.user;
        
        // Genera un nuovo token JWT aggiornato che non richiede più il cambio password
        const newPayload = {
            ...cleanUser,
            forcePwdChange: false
        };

        const newToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: '12h' });
        res.cookie('jwt_token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 12 * 60 * 60 * 1000
        });

        res.status(200).json({ user: newPayload });
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
            FROM [BOB].[dbo].[Log] L
            LEFT JOIN [BOB].[dbo].[Operators] O ON L.IDOperator = O.IDOperator
            LEFT JOIN [GA].[dbo].[Users] U ON O.IDUser = U.IDUser
            LEFT JOIN [BOB].[dbo].[Machines] M ON L.IDMachine = M.IDMachine
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
                FROM [BOB].[dbo].[Log] L
                LEFT JOIN [BOB].[dbo].[Operators] O ON L.IDOperator = O.IDOperator
                LEFT JOIN [GA].[dbo].[Users] U ON O.IDUser = U.IDUser
                LEFT JOIN [BOB].[dbo].[Machines] M ON L.IDMachine = M.IDMachine
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
                    FROM [BOB].[dbo].[Log] FOR SYSTEM_TIME ALL AS L
                    LEFT JOIN [BOB].[dbo].[Operators] O_Mod ON L.ModificatoDa = O_Mod.IDOperator
                    LEFT JOIN [GA].[dbo].[Users] U_Mod ON O_Mod.IDUser = U_Mod.IDUser
                    LEFT JOIN [BOB].[dbo].[Operators] O_Crea ON L.IDOperator = O_Crea.IDOperator
                    LEFT JOIN [GA].[dbo].[Users] U_Crea ON O_Crea.IDUser = U_Crea.IDUser
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
                INSERT INTO [BOB].[dbo].[Log]
                (Date, IDOperator, IDMachine, Codart, Lot, Quantity, Notes, IDRoll, bobina_finita)
                VALUES
                (@Date, @IDOperator, @IDMachine, @Codart, @Lot, @Quantity, @Notes, @IDRoll, NULL)
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
                UPDATE [BOB].[dbo].[Log]
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
                .query(`UPDATE [BOB].[dbo].[Log] SET Eliminato = 1, ModificatoDa = @ModificatoDa, NumeroModifiche = NumeroModifiche + 1 WHERE IDLog = @IDLog`);
            return res.status(200).send({ message: 'Log eliminato da Admin' });
        }
        await pool.request()
            .input('IDLog', sql.Int, logId)
            .input('IDOperator', sql.Int, operatorId)
            .execute('[BOB].[dbo].[sp_DeleteLogOperatore]');
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
            .query(`UPDATE [BOB].[dbo].[Log] SET bobina_finita = @BobinaFinita WHERE IDLog = @IDLog`);
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

const { Server } = require('socket.io');

// Avvio del server in HTTPS sulla porta standard 443
const PORT = 443;
const server = https.createServer(sslOptions, app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Mappa per tracciare gli utenti online. Chiave: userId, Valore: Set di socket.id (per gestire multi-tab)
const activeUserSockets = new Map();

// Endpoint per richiesta di recupero password (invia notifica al Captain)
app.post('/api/users/recover', async (req, res) => {
    const { barcode } = req.body;
    if (!barcode) return res.status(400).json({ message: 'Barcode obbligatorio' });

    try {
        let pool = await sql.connect(dbConfig);
        
        // Verifica se l'utente esiste ed è attivo
        let userRes = await pool.request()
            .input('barcode', sql.NVarChar, barcode)
            .query(`
                UPDATE [GA].[dbo].[Users] SET ResetRequested = 1 WHERE Barcode = @barcode AND IsActive = 1;
                SELECT IDUser, Name FROM [GA].[dbo].[Users] WHERE Barcode = @barcode AND IsActive = 1;
            `);

        if (userRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Badge non riconosciuto o utente disattivato' });
        }

        const userName = userRes.recordset[0].Name;

        // Emette l'avviso in tempo reale a tutti i client connessi
        if (typeof io !== 'undefined') {
            io.emit('pwd_reset_request', { 
                userName: userName, 
                barcode: barcode,
                time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
            });
        }

        res.status(200).json({ message: 'Richiesta inviata con successo.' });
    } catch (err) {
        console.error('Errore recupero password:', err);
        res.status(500).json({ message: 'Errore interno del server' });
    }
});

io.on('connection', (socket) => {
    let currentUserId = null;

    // Registrazione
    socket.on('register', (data) => {
        if (!data || !data.userId) return;
        currentUserId = data.userId;
        
        // FONDAMENTALE: L'utente entra nella sua stanza privata per ricevere Kick/Sipario mirati
        socket.join('user_' + currentUserId);

        if (!activeUserSockets.has(currentUserId)) {
            activeUserSockets.set(currentUserId, new Set());
            io.to('captains_room').emit('user_status_changed', { userId: currentUserId, isOnline: true });
        }
        activeUserSockets.get(currentUserId).add(socket.id);
    });

    // Registrazione console Captain
    socket.on('register_captain', () => {
        socket.join('captains_room');
        // Invia immediatamente al Captain appena connesso la lista di chi è già online
        const onlineUsers = Array.from(activeUserSockets.keys());
        socket.emit('initial_online_users', onlineUsers);
    });

    // Eventi mirati (Sipario, Kick) - DEVONO USARE io.to() E I NOMI ORIGINALI
    socket.on('force_pwd_curtain', (data) => {
        if (data && data.targetUserId) {
            io.to('user_' + data.targetUserId).emit('show_pwd_curtain', data);
        }
    });
    
    socket.on('kick_user', (data) => {
        if (data && data.targetUserId) {
            io.to('user_' + data.targetUserId).emit('force_logout', data);
        }
    });

    // Disconnessione
    socket.on('disconnect', () => {
        if (currentUserId && activeUserSockets.has(currentUserId)) {
            const sockets = activeUserSockets.get(currentUserId);
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                activeUserSockets.delete(currentUserId);
                io.to('captains_room').emit('user_status_changed', { userId: currentUserId, isOnline: false });
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server API in ascolto in HTTPS sulla porta ${PORT} all'indirizzo https://rotoli.ujet.it`);
});
