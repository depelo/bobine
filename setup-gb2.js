/**
 * Script di setup: crea il database GB2 e registra il modulo nell'ecosistema PortalUjet.
 * Eseguire una sola volta: node setup-gb2.js
 */
const sql = require('mssql');

const config = {
    server: '192.168.0.163',
    user: 'sa',
    password: 'Risk0804',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function run() {
    let pool;
    try {
        // Connessione al server (senza database specifico per CREATE DATABASE)
        pool = await new sql.ConnectionPool({ ...config, database: 'master' }).connect();
        console.log('[1/6] Connesso a master');

        // 1. Creare database GB2
        const dbExists = await pool.request().query(`SELECT DB_ID('GB2') AS id`);
        if (dbExists.recordset[0].id === null) {
            await pool.request().query(`CREATE DATABASE [GB2]`);
            console.log('[2/6] Database GB2 creato');
        } else {
            console.log('[2/6] Database GB2 esiste gia, skip');
        }
        await pool.close();

        // 2. Connettersi a GB2 per creare la tabella Operators
        pool = await new sql.ConnectionPool({ ...config, database: 'GB2' }).connect();

        const tableExists = await pool.request().query(`
            SELECT OBJECT_ID('dbo.Operators') AS id
        `);
        if (tableExists.recordset[0].id === null) {
            await pool.request().query(`
                CREATE TABLE [dbo].[Operators] (
                    IDOperator INT IDENTITY(1,1) PRIMARY KEY,
                    IDUser     INT NOT NULL,
                    Admin      BIT NOT NULL DEFAULT 0,
                    IsActive   BIT NOT NULL DEFAULT 1
                )
            `);
            await pool.request().query(`
                CREATE UNIQUE INDEX UQ_Operators_ActiveUser
                ON [dbo].[Operators](IDUser) WHERE IsActive = 1
            `);
            console.log('[3/6] Tabella GB2.dbo.Operators creata con indice univoco');
        } else {
            console.log('[3/6] Tabella Operators esiste gia, skip');
        }
        await pool.close();

        // 3. Connettersi a GA per registrare il modulo
        pool = await new sql.ConnectionPool({ ...config, database: 'GA' }).connect();

        // Verificare se il modulo e gia registrato
        const modExists = await pool.request().query(`
            SELECT IDModule FROM [dbo].[Modules] WHERE TargetDb = 'GB2'
        `);
        let idModule;
        if (modExists.recordset.length === 0) {
            const modRes = await pool.request().query(`
                INSERT INTO [dbo].[Modules] (ModuleName, TargetDb, TargetTable, RoleDefinition, AppSettings)
                OUTPUT INSERTED.IDModule
                VALUES (
                    'Gabriele 2.0',
                    'GB2',
                    'Operators',
                    '{"Admin":{"label":"Ufficio Admin (UAD)","requiresPassword":true,"sessionHours":12,"pwdExpiryDays":90},"Base":{"label":"Ufficio Acquisti (UAC)","requiresPassword":true,"sessionHours":8,"pwdExpiryDays":90}}',
                    '{}'
                )
            `);
            idModule = modRes.recordset[0].IDModule;
            console.log(`[4/6] Modulo registrato in GA.dbo.Modules con IDModule=${idModule}`);
        } else {
            idModule = modExists.recordset[0].IDModule;
            console.log(`[4/6] Modulo gia registrato, IDModule=${idModule}`);
        }

        // 4. Registrare AppRoles
        const rolesExist = await pool.request()
            .input('idModule', sql.Int, idModule)
            .query(`SELECT IDAppRole FROM [dbo].[AppRoles] WHERE IDModule = @idModule`);

        if (rolesExist.recordset.length === 0) {
            // Admin (IDGlobalRole=1): password richiesta, 12h sessione, 90gg scadenza
            await pool.request()
                .input('idModule', sql.Int, idModule)
                .query(`
                    INSERT INTO [dbo].[AppRoles] (IDModule, IDGlobalRole, RequiresPassword, SessionHours, PwdExpiryDays)
                    VALUES (@idModule, 1, 1, 12, 90)
                `);
            // Base (IDGlobalRole=2): password richiesta, 8h sessione, 90gg scadenza
            await pool.request()
                .input('idModule', sql.Int, idModule)
                .query(`
                    INSERT INTO [dbo].[AppRoles] (IDModule, IDGlobalRole, RequiresPassword, SessionHours, PwdExpiryDays)
                    VALUES (@idModule, 2, 1, 8, 90)
                `);
            console.log('[5/6] AppRoles registrate (Admin + Base, entrambe con password)');
        } else {
            console.log('[5/6] AppRoles gia registrate, skip');
        }

        // 5. Aggiornare vw_UserAccess
        await pool.request().query(`
            ALTER VIEW [dbo].[vw_UserAccess] AS
            /* 1. Accessi CAPTAIN */
            SELECT c.IDUser, 2 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = c.Role) AS IDGlobalRole,
                c.Role AS RoleCode, c.IsActive
            FROM [CAP].[dbo].[Captains] c
            UNION ALL
            /* 2. Accessi BOBINE */
            SELECT o.IDUser, 1 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = CASE WHEN o.Admin = 1 THEN 'Admin' ELSE 'Base' END) AS IDGlobalRole,
                CASE WHEN o.Admin = 1 THEN 'Admin' ELSE 'Base' END AS RoleCode, o.IsActive
            FROM [BOB].[dbo].[Operators] o
            UNION ALL
            /* 3. Accessi ETICHETTE */
            SELECT e.IDUser, 3 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = CASE WHEN e.Admin = 1 THEN 'Admin' ELSE 'Base' END) AS IDGlobalRole,
                CASE WHEN e.Admin = 1 THEN 'Admin' ELSE 'Base' END AS RoleCode, e.IsActive
            FROM [PE].[dbo].[Operators] e
            UNION ALL
            /* 4. Accessi GABRIELE 2.0 (MRP) */
            SELECT g.IDUser, ${idModule} AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = CASE WHEN g.Admin = 1 THEN 'Admin' ELSE 'Base' END) AS IDGlobalRole,
                CASE WHEN g.Admin = 1 THEN 'Admin' ELSE 'Base' END AS RoleCode, g.IsActive
            FROM [GB2].[dbo].[Operators] g
        `);
        console.log('[6/6] Vista vw_UserAccess aggiornata con ramo GB2');

        console.log('\n=== SETUP GB2 COMPLETATO ===');
        console.log(`IDModule: ${idModule}`);
        console.log('Ruoli: Admin (UAD) + Base (UAC), entrambi con password');
        console.log('Prossimo passo: assegnare visti dal Captain Console');

    } catch (err) {
        console.error('ERRORE:', err.message);
        console.error(err);
    } finally {
        if (pool) await pool.close();
        process.exit(0);
    }
}

run();
