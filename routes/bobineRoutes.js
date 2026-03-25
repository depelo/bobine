const express = require('express');
const bcrypt = require('bcrypt');
const { sql, getPoolGA } = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

module.exports = function createBobineRoutes({ io }) {
    const router = express.Router();

    router.get('/operators', authenticateToken, async (req, res) => {
        try {
            const pool = await getPoolGA();
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
            INNER JOIN [BOB].[dbo].[vw_ext_GlobalUsers] U ON O.IDUser = U.IDUser
            WHERE U.IsActive = 1 AND O.IsActive = 1
        `);
            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.patch('/operators/:id/time', authenticateToken, async (req, res) => {
        const { startTime } = req.body;
        try {
            const pool = await getPoolGA();
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

    router.get('/operators/available', authenticateToken, async (req, res) => {
        try {
            const pool = await getPoolGA();
            let result = await pool.request().query(`
            SELECT 
                IDUser as id, 
                Name as name, 
                Barcode as barcode 
            FROM [BOB].[dbo].[vw_ext_GlobalUsers] 
            WHERE IsActive = 1 
            AND IDUser NOT IN (SELECT IDUser FROM [BOB].[dbo].[Operators] WHERE IsActive = 1)
            ORDER BY Name ASC
        `);
            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.post('/operators', authenticateToken, async (req, res) => {
        const { globalId, admin, startTime } = req.body;
        try {
            const pool = await getPoolGA();
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

    router.put('/operators/:id', authenticateToken, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { admin, startTime } = req.body;
        try {
            const pool = await getPoolGA();
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

    router.delete('/operators/:id', authenticateToken, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        try {
            const pool = await getPoolGA();
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

    router.put('/operators/:id/reset-password', authenticateToken, async (req, res) => {
        const idOp = parseInt(req.params.id, 10);
        const { newPassword, forcePwdChange } = req.body;

        if (!req.user.isAdmin && !req.user.isSuperuser) return res.status(403).send('Solo gli Admin possono resettare le password');
        if (!newPassword) return res.status(400).send('Password obbligatoria');

        try {
            const pool = await getPoolGA();
            const hash = await bcrypt.hash(newPassword, 10);

            await pool.request()
                .input('IDOperator', sql.Int, idOp)
                .input('NewPasswordHash', sql.NVarChar, hash)
                .input('ForcePwdChange', sql.Bit, forcePwdChange ? 1 : 0)
                .query(`EXEC [BOB].[dbo].[sp_ResetOperatorPassword] @IDOperator, @NewPasswordHash, @ForcePwdChange`);

            if (io) {
                io.emit('pwd_reset_resolved');
            }

            res.status(200).send({ message: 'Password resettata con successo tramite Stored Procedure' });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.get('/machines', async (req, res) => {
        try {
            const pool = await getPoolGA();
            let result = await pool.request().query('SELECT IDMachine as id, Machine as name, Barcode as barcode FROM [BOB].[dbo].[Machines]');
            res.json(result.recordset);
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.post('/machines', async (req, res) => {
        const { name, barcode } = req.body;
        try {
            const pool = await getPoolGA();
            await pool.request()
                .input('Machine', sql.NVarChar, name)
                .input('Barcode', sql.NVarChar, barcode)
                .query('INSERT INTO [BOB].[dbo].[Machines] (Machine, Barcode) VALUES (@Machine, @Barcode)');
            res.status(201).send({ message: 'Macchina aggiunta' });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    router.get('/logs', async (req, res) => {
        try {
            const pool = await getPoolGA();
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

    router.get('/logs/:id/history', async (req, res) => {
        const id = req.params.id;
        try {
            const pool = await getPoolGA();
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

    router.get('/logs/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const pool = await getPoolGA();
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

    router.post('/logs', authenticateToken, async (req, res) => {
        const { date, IDMachine, rawCode, lot, quantity, notes, rollId } = req.body;
        const dateToSave = date ? new Date(date) : new Date();
        const idOperator = req.user && req.user.id != null ? parseInt(req.user.id, 10) : null;
        const idMachine = IDMachine != null ? parseInt(IDMachine, 10) : null;
        const qty = quantity != null ? parseFloat(quantity) : 0;
        try {
            const pool = await getPoolGA();
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

    router.put('/logs/:id', authenticateToken, async (req, res) => {
        const id = req.params.id;
        try {
            const pool = await getPoolGA();
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

    router.delete('/logs/:id', authenticateToken, async (req, res) => {
        const logId = parseInt(req.params.id, 10);
        const operatorId = req.user.id;
        if (Number.isNaN(logId)) return res.status(400).send('ID log non valido');
        try {
            const pool = await getPoolGA();
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

    router.patch('/logs/:id/bobina-finita', authenticateToken, async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { bobina_finita } = req.body;
        try {
            const pool = await getPoolGA();
            await pool.request()
                .input('IDLog', sql.Int, id)
                .input('BobinaFinita', sql.Bit, bobina_finita)
                .query(`UPDATE [BOB].[dbo].[Log] SET bobina_finita = @BobinaFinita WHERE IDLog = @IDLog`);
            res.status(200).send({ message: 'Stato bobina aggiornato' });
        } catch (err) {
            res.status(500).send(err.message);
        }
    });

    return router;
};
