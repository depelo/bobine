const express = require('express');
const bcrypt = require('bcrypt');
const { sql, getPoolGA } = require('../config/db');
const { authenticateCaptain } = require('../middlewares/auth');

module.exports = function createAdminRoutes({ io, activeUserSockets }) {
    const router = express.Router();

    router.get('/users', authenticateCaptain, async (req, res) => {
        try {
            const pool = await getPoolGA();

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

            const allAccessRes = await pool.request().query(`
            SELECT
                V.IDUser, M.IDModule as moduleId, M.ModuleName as moduleName,
                GR.RoleCode as roleKey, GR.DefaultLabel as roleLabel
            FROM [GA].[dbo].[vw_UserAccess] V
            INNER JOIN [GA].[dbo].[Modules] M ON V.IDModule = M.IDModule
            INNER JOIN [GA].[dbo].[GlobalRoles] GR ON V.IDGlobalRole = GR.IDGlobalRole
            WHERE V.IsActive = 1
        `);

            for (let u of users) {
                u.apps = allAccessRes.recordset.filter(a => a.IDUser === u.id);
                u.authorizedModuleIds = u.apps.map(a => a.moduleId);
                u.hasActiveSession = activeUserSockets.has(u.id);
            }
            res.json(users);
        } catch (err) {
            console.error('Errore GET /api/admin/users:', err);
            res.status(500).send(err.message);
        }
    });

    router.put('/users/reorder', authenticateCaptain, async (req, res) => {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) return res.status(400).send('Array orderedIds non valido');
        try {
            const pool = await getPoolGA();
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

    router.put('/users/:id', authenticateCaptain, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { name, barcode, password, forcePwdChange, pwdExpiryDaysOverride, defaultModuleId, pwdMinLengthOverride, pwdRequireNumberOverride, pwdRequireUpperOverride, pwdRequireSpecialOverride } = req.body;

        try {
            const pool = await getPoolGA();

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

            if (io) {
                io.emit('pwd_reset_resolved');
            }

            res.status(200).json({ message: 'Impostazioni di sicurezza aggiornate con successo.' });
        } catch (err) {
            console.error('Errore PUT /api/admin/users/:id:', err);
            res.status(500).send(err.message);
        }
    });

    router.put('/users/:id/roles', authenticateCaptain, async (req, res) => {
        const idUser = parseInt(req.params.id, 10);
        const { roles } = req.body;

        try {
            const pool = await getPoolGA();

            const modulesRes = await pool.request().query(`SELECT TargetDb, TargetTable FROM [GA].[dbo].[Modules]`);
            const validModules = modulesRes.recordset;
            const submittedRoles = roles || [];

            for (const mod of validModules) {
                const table = mod.TargetTable;
                const dbName = mod.TargetDb;
                if (!dbName || !table) continue;

                // Match per targetDb (univoco) — non per targetTable che è condiviso tra BOB/PE/GB2
                const assignedRole = submittedRoles.find(r => r.targetDb === dbName);
                const fullTable = `[${dbName}].[dbo].[${table}]`;

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

                    // Se è il visto GB2, crea operatore in ARCPROC.OPERAT per BCube (fire-and-forget)
                    if (dbName === 'GB2') {
                        try {
                            const opCode = 'GB2' + idUser;
                            const nameRes = await pool.request().input('uid', sql.Int, idUser)
                                .query("SELECT Name FROM [GA].[dbo].[Users] WHERE IDUser=@uid");
                            const userName = nameRes.recordset.length ? (nameRes.recordset[0].Name || '') : '';
                            await pool.request()
                                .input('op', sql.VarChar(20), opCode)
                                .input('nome', sql.VarChar(30), 'GB2 ' + userName)
                                .input('cognome', sql.VarChar(20), '')
                                .query(`
                                    IF NOT EXISTS (SELECT 1 FROM [BCUBE2].[ARCPROC].[dbo].[OPERAT] WHERE OpNome=@op)
                                    INSERT INTO [BCUBE2].[ARCPROC].[dbo].[OPERAT]
                                        (OpNome, OpGruppo, OpLoginaccess, OpLoginsql, OpPasssql,
                                         OpRuolo, OpAbil, OpAbilcamb, OpAzienda, OpDescont, OpDescont2,
                                         OpNetOnly, OpSutipouser, OpSulimiti, OpMsgSistema, OpTipoAuth,
                                         OpIscrmus, OpDatscad, OpDatulac, OpCodling, OpCodcaa, OpLoginErrati)
                                    VALUES (@op, 24, 'Admin', 'sa', 'G24c03p1952',
                                            'P', 'S', 'S', 'UJET11', @nome, @cognome,
                                            'N', 'N', 'N', 'S', 'P',
                                            'N', '2099-12-31', GETDATE(), 0, 0, 0)
                                `);
                        } catch (arcErr) {
                            console.warn('[Admin] Creazione operatore ARCPROC fallita (non critico):', arcErr.message);
                        }
                    }
                } else {
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

    router.get('/modules', authenticateCaptain, async (req, res) => {
        try {
            const pool = await getPoolGA();
            const modRes = await pool.request().query(`
            SELECT IDModule as id, ModuleName as name, TargetDb as targetDb, TargetTable as targetTable, AppSettings as appSettings 
            FROM [GA].[dbo].[Modules]
        `);

            const rolesRes = await pool.request().query(`
            SELECT AR.IDModule, GR.RoleCode as roleKey, GR.DefaultLabel as label, AR.RequiresPassword as requiresPassword, AR.SessionHours as sessionHours, AR.PwdExpiryDays as pwdExpiryDays
            FROM [GA].[dbo].[AppRoles] AR
            INNER JOIN [GA].[dbo].[GlobalRoles] GR ON AR.IDGlobalRole = GR.IDGlobalRole
        `);

            const modules = modRes.recordset.map(mod => {
                let aSet = {};
                try { aSet = mod.appSettings ? JSON.parse(mod.appSettings) : {}; } catch (e) { /* ignore */ }
                return {
                    ...mod,
                    roles: rolesRes.recordset.filter(r => r.IDModule === mod.id),
                    appSettings: aSet
                };
            });
            res.json(modules);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.put('/modules/:id', authenticateCaptain, async (req, res) => {
        const idModule = parseInt(req.params.id, 10);
        const { appSettings } = req.body;

        try {
            const pool = await getPoolGA();
            await pool.request()
                .input('idModule', sql.Int, idModule)
                .input('appSet', sql.NVarChar, JSON.stringify(appSettings || {}))
                .query(`UPDATE [GA].[dbo].[Modules] SET AppSettings = @appSet WHERE IDModule = @idModule`);

            res.status(200).json({ message: 'Impostazioni App aggiornate con successo.' });
        } catch (err) {
            console.error('Errore PUT /api/admin/modules/:id:', err);
            res.status(500).send(err.message);
        }
    });

    router.get('/config', authenticateCaptain, async (req, res) => {
        try {
            const pool = await getPoolGA();
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

    router.put('/config', authenticateCaptain, async (req, res) => {
        const configs = req.body;
        try {
            const pool = await getPoolGA();
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

    router.post('/users', authenticateCaptain, async (req, res) => {
        const { name, barcode, password, forcePwdChange, defaultModuleId, roles } = req.body;
        try {
            const pool = await getPoolGA();
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
                            // Se è il visto GB2, crea operatore ARCPROC per BCube (fire-and-forget)
                            if (dbName === 'GB2') {
                                try {
                                    const opCode = 'GB2' + newUserId;
                                    const arcReq = new sql.Request(transaction);
                                    arcReq.input('op', sql.VarChar(20), opCode);
                                    arcReq.input('nome', sql.VarChar(30), 'GB2 ' + (name || ''));
                                    arcReq.input('cognome', sql.VarChar(20), '');
                                    await arcReq.query(`
                                        IF NOT EXISTS (SELECT 1 FROM [BCUBE2].[ARCPROC].[dbo].[OPERAT] WHERE OpNome=@op)
                                        INSERT INTO [BCUBE2].[ARCPROC].[dbo].[OPERAT]
                                            (OpNome, OpGruppo, OpLoginaccess, OpLoginsql, OpPasssql,
                                             OpRuolo, OpAbil, OpAbilcamb, OpAzienda, OpDescont, OpDescont2,
                                             OpNetOnly, OpSutipouser, OpSulimiti, OpMsgSistema, OpTipoAuth,
                                             OpIscrmus, OpDatscad, OpDatulac, OpCodling, OpCodcaa, OpLoginErrati)
                                        VALUES (@op, 24, 'Admin', 'sa', 'G24c03p1952',
                                                'P', 'S', 'S', 'UJET11', @nome, @cognome,
                                                'N', 'N', 'N', 'S', 'P',
                                                'N', '2099-12-31', GETDATE(), 0, 0, 0)
                                    `);
                                } catch (arcErr) {
                                    console.warn('[Admin] Creazione operatore ARCPROC fallita (non critico):', arcErr.message);
                                }
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

    router.delete('/users/:id', authenticateCaptain, async (req, res) => {
        const idUser = parseInt(req.params.id, 10);
        try {
            const pool = await getPoolGA();
            await pool.request()
                .input('idUser', sql.Int, idUser)
                .query(`UPDATE [GA].[dbo].[Users] SET IsActive = 0 WHERE IDUser = @idUser`);
            res.status(200).json({ message: 'Utente disattivato logicamente.' });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.get('/users/deleted', authenticateCaptain, async (req, res) => {
        try {
            const pool = await getPoolGA();
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

    router.put('/users/:id/restore', authenticateCaptain, async (req, res) => {
        try {
            const pool = await getPoolGA();
            await pool.request()
                .input('id', sql.Int, req.params.id)
                .query(`UPDATE [GA].[dbo].[Users] SET IsActive = 1, ForcePwdChange = 1 WHERE IDUser = @id`);
            res.status(200).json({ message: 'OK' });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.post('/users/check-duplicate', authenticateCaptain, async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.json([]);

            const words = name.trim().split(/\s+/).filter(w => w.length > 1);
            if (words.length === 0) return res.json([]);

            const pool = await getPoolGA();
            let reqSql = pool.request();

            let conditions = [];
            words.forEach((w, i) => {
                reqSql.input(`w${i}`, sql.NVarChar, `%${w}%`);
                conditions.push(`Name LIKE @w${i}`);
            });

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

    return router;
};
