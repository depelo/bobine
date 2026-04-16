const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql, getPoolGA } = require('../config/db');
const { authenticateToken, getEffectivePwdRules, JWT_SECRET } = require('../middlewares/auth');

module.exports = function createAuthRoutes({ io }) {
    const router = express.Router();

    router.post('/login', async (req, res) => {
        const { barcode, password } = req.body || {};
        if (!barcode) {
            return res.status(400).json({ message: 'QR Code richiesto' });
        }
        try {
            const pool = await getPoolGA();
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

            const captainRes = await pool.request()
                .input('idUser', sql.Int, row.IDUser)
                .query(`SELECT 1 FROM [CAP].[dbo].[Captains] WHERE IDUser = @idUser AND IsActive = 1`);
            const isSuperuser = captainRes.recordset.length > 0;

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

            const accessRes = await pool.request()
                .input('idUserLoggato', sql.Int, row.IDUser)
                .query(`
                SELECT 
                    M.IDModule as id,
                    M.ModuleName as name,
                    M.TargetTable as target,
                    GR.RoleCode as roleKey,
                    GR.DefaultLabel as roleLabel,
                    AR.RequiresPassword as requiresPassword
                FROM [GA].[dbo].[vw_UserAccess] V
                INNER JOIN [GA].[dbo].[Modules] M ON V.IDModule = M.IDModule
                INNER JOIN [GA].[dbo].[GlobalRoles] GR ON V.IDGlobalRole = GR.IDGlobalRole
                INNER JOIN [GA].[dbo].[AppRoles] AR ON V.IDModule = AR.IDModule AND V.IDGlobalRole = AR.IDGlobalRole
                WHERE V.IDUser = @idUserLoggato AND V.IsActive = 1
            `);

            const authorizedApps = accessRes.recordset;

            let globalRequiresPassword = isSuperuser;
            authorizedApps.forEach(app => {
                if (app.requiresPassword) globalRequiresPassword = true;
            });

            let needsPasswordChange = false;

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

                if (!password) {
                    return res.status(401).json({ requiresPassword: true, message: 'Password richiesta per il tuo livello di accesso' });
                }

                const passwordOk = await bcrypt.compare(password, row.PasswordHash || '');
                if (!passwordOk) {
                    return res.status(401).json({ message: 'Credenziali non valide' });
                }
            }

            const pwdRules = await getEffectivePwdRules(pool, row.IDUser);

            try {
                await pool.request()
                    .input('idUser', sql.Int, row.IDUser)
                    .query(`UPDATE [GA].[dbo].[Users] SET LastLogin = GETDATE() WHERE IDUser = @idUser`);
            } catch (dbErr) {
                console.error('Errore aggiornamento LastLogin:', dbErr);
            }

            const payload = {
                id: row.IDOperator,
                globalId: row.IDUser,
                name: row.Operator,
                isAdmin,
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

    router.get('/me', authenticateToken, async (req, res) => {
        try {
            const pool = await getPoolGA();
            const userRes = await pool.request()
                .input('idUser', sql.Int, req.user.globalId)
                .query(`SELECT IsActive, ForcePwdChange FROM [GA].[dbo].[Users] WHERE IDUser = @idUser`);

            if (userRes.recordset.length === 0 || !userRes.recordset[0].IsActive) {
                res.clearCookie('jwt_token');
                return res.status(401).send('Utente disattivato o inesistente');
            }

            const pwdRules = await getEffectivePwdRules(pool, req.user.globalId);

            const isForcePwdDB = (userRes.recordset[0].ForcePwdChange === true || userRes.recordset[0].ForcePwdChange === 1);

            if (isForcePwdDB && !req.user.forcePwdChange) {
                return res.status(403).json({ requiresPasswordChange: true, message: 'Cambio password obbligatorio innescato dall\'amministratore', pwdRules: pwdRules });
            }

            res.json({ ...req.user, pwdRules });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.post('/logout', (req, res) => {
        res.clearCookie('jwt_token');
        res.json({ message: 'Logout eseguito' });
    });

    router.put('/users/me/password', authenticateToken, async (req, res) => {
        const { oldPassword, newPassword, currentPassword } = req.body;
        const effectiveOldPassword = currentPassword !== undefined ? currentPassword : oldPassword;
        if (!newPassword) return res.status(400).json({ message: 'La nuova password è obbligatoria.' });

        try {
            const pool = await getPoolGA();
            let userRes = await pool.request()
                .input('idUser', sql.Int, req.user.globalId)
                .query(`
                SELECT IDUser, PasswordHash 
                FROM [GA].[dbo].[Users]
                WHERE IDUser = @idUser
            `);

            if (userRes.recordset.length === 0) return res.status(404).send('Utente non trovato');
            const dbUser = userRes.recordset[0];

            const passwordOk = await bcrypt.compare(effectiveOldPassword, dbUser.PasswordHash || '');
            if (!passwordOk) return res.status(401).json({ message: 'Vecchia password errata' });

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

            const hash = await bcrypt.hash(newPassword, 10);
            await pool.request()
                .input('idUser', sql.Int, dbUser.IDUser)
                .input('hash', sql.NVarChar, hash)
                .query(`
                UPDATE [GA].[dbo].[Users] 
                SET PasswordHash = @hash, LastPasswordChange = GETDATE(), ForcePwdChange = 0 
                WHERE IDUser = @idUser
            `);

            const { iat, exp, ...cleanUser } = req.user;

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

    router.post('/users/recover', async (req, res) => {
        const { barcode } = req.body;
        if (!barcode) return res.status(400).json({ message: 'Barcode obbligatorio' });

        try {
            const pool = await getPoolGA();

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

            if (io) {
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

    return router;
};
