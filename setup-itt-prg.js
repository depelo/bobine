/**
 * Script di setup: crea i database/tabelle per ITT e PRG e li registra nell'ecosistema PortalUjet.
 * Eseguire una sola volta: node setup-itt-prg.js
 */
const sql = require('mssql');

const config163 = {
    server: '192.168.0.163',
    user: 'sa',
    password: 'Risk0804',
    options: { encrypt: false, trustServerCertificate: true }
};

const configPRG = {
    server: 'pc-sviluppo',
    user: 'sa',
    password: 'Risk0804',
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
};

async function run() {
    let pool;
    const step = (n, total, msg) => console.log(`[${n}/${total}] ${msg}`);
    const TOTAL = 9;

    try {
        // ============================================================
        // A1. Creare database ITT su 192.168.0.163
        // ============================================================
        pool = await new sql.ConnectionPool({ ...config163, database: 'master' }).connect();
        step(1, TOTAL, 'Connesso a 192.168.0.163/master');

        const ittDbExists = await pool.request().query(`SELECT DB_ID('ITT') AS id`);
        if (ittDbExists.recordset[0].id === null) {
            await pool.request().query(`CREATE DATABASE [ITT]`);
            step(2, TOTAL, 'Database ITT creato su 192.168.0.163');
        } else {
            step(2, TOTAL, 'Database ITT esiste gia, skip');
        }
        await pool.close();

        // Creare tabella Operators in ITT
        pool = await new sql.ConnectionPool({ ...config163, database: 'ITT' }).connect();
        const ittTableExists = await pool.request().query(`SELECT OBJECT_ID('dbo.Operators') AS id`);
        if (ittTableExists.recordset[0].id === null) {
            await pool.request().query(`
                CREATE TABLE [dbo].[Operators] (
                    IDOperator INT IDENTITY(1,1) PRIMARY KEY,
                    IDUser     INT NOT NULL,
                    Admin      BIT NOT NULL DEFAULT 1,
                    IsActive   BIT NOT NULL DEFAULT 1
                )
            `);
            await pool.request().query(`
                CREATE UNIQUE INDEX UQ_Operators_ActiveUser
                ON [dbo].[Operators](IDUser) WHERE IsActive = 1
            `);
            step(3, TOTAL, 'Tabella ITT.dbo.Operators creata con indice univoco');
        } else {
            step(3, TOTAL, 'Tabella ITT.dbo.Operators esiste gia, skip');
        }
        await pool.close();

        // ============================================================
        // A2. Aggiungere tabella Operators al database PRG su pc-sviluppo
        // ============================================================
        try {
            pool = await new sql.ConnectionPool({ ...configPRG, database: 'PRG' }).connect();
            step(4, TOTAL, 'Connesso a pc-sviluppo/PRG');

            const prgTableExists = await pool.request().query(`SELECT OBJECT_ID('dbo.Operators') AS id`);
            if (prgTableExists.recordset[0].id === null) {
                await pool.request().query(`
                    CREATE TABLE [dbo].[Operators] (
                        IDOperator INT IDENTITY(1,1) PRIMARY KEY,
                        IDUser     INT NOT NULL,
                        Admin      BIT NOT NULL DEFAULT 1,
                        IsActive   BIT NOT NULL DEFAULT 1
                    )
                `);
                await pool.request().query(`
                    CREATE UNIQUE INDEX UQ_Operators_ActiveUser
                    ON [dbo].[Operators](IDUser) WHERE IsActive = 1
                `);
                step(4, TOTAL, 'Tabella PRG.dbo.Operators creata su pc-sviluppo');
            } else {
                step(4, TOTAL, 'Tabella PRG.dbo.Operators esiste gia su pc-sviluppo, skip');
            }
            await pool.close();
        } catch (prgErr) {
            console.warn(`[4/${TOTAL}] ATTENZIONE: impossibile connettersi a pc-sviluppo/PRG: ${prgErr.message}`);
            console.warn('         Dovrai creare la tabella Operators manualmente su PRG.');
        }

        // ============================================================
        // A3. Registrare i moduli nel catalogo GA
        // ============================================================
        pool = await new sql.ConnectionPool({ ...config163, database: 'GA' }).connect();
        step(5, TOTAL, 'Connesso a 192.168.0.163/GA');

        // ITT
        let idITT;
        const ittModExists = await pool.request().query(`SELECT IDModule FROM [dbo].[Modules] WHERE TargetDb = 'ITT'`);
        if (ittModExists.recordset.length === 0) {
            const ittModRes = await pool.request().query(`
                INSERT INTO [dbo].[Modules] (ModuleName, TargetDb, TargetTable, RoleDefinition, AppSettings)
                OUTPUT INSERTED.IDModule
                VALUES (
                    'Classificazione ITT',
                    'ITT',
                    'Operators',
                    '{"Admin":{"label":"Admin ITT","requiresPassword":true,"sessionHours":12,"pwdExpiryDays":90}}',
                    '{}'
                )
            `);
            idITT = ittModRes.recordset[0].IDModule;
            step(5, TOTAL, `Modulo ITT registrato con IDModule=${idITT}`);
        } else {
            idITT = ittModExists.recordset[0].IDModule;
            step(5, TOTAL, `Modulo ITT gia registrato, IDModule=${idITT}`);
        }

        // PRG
        let idPRG;
        const prgModExists = await pool.request().query(`SELECT IDModule FROM [dbo].[Modules] WHERE TargetDb = 'PRG'`);
        if (prgModExists.recordset.length === 0) {
            const prgModRes = await pool.request().query(`
                INSERT INTO [dbo].[Modules] (ModuleName, TargetDb, TargetTable, RoleDefinition, AppSettings)
                OUTPUT INSERTED.IDModule
                VALUES (
                    'Ujet Progetti',
                    'PRG',
                    'Operators',
                    '{"Admin":{"label":"Admin PRG","requiresPassword":true,"sessionHours":12,"pwdExpiryDays":90}}',
                    '{}'
                )
            `);
            idPRG = prgModRes.recordset[0].IDModule;
            step(6, TOTAL, `Modulo PRG registrato con IDModule=${idPRG}`);
        } else {
            idPRG = prgModExists.recordset[0].IDModule;
            step(6, TOTAL, `Modulo PRG gia registrato, IDModule=${idPRG}`);
        }

        // ============================================================
        // A4. Dichiarare AppRoles (solo Admin, con password)
        // ============================================================
        const ittRolesExist = await pool.request()
            .input('idModule', sql.Int, idITT)
            .query(`SELECT IDAppRole FROM [dbo].[AppRoles] WHERE IDModule = @idModule`);
        if (ittRolesExist.recordset.length === 0) {
            await pool.request()
                .input('idModule', sql.Int, idITT)
                .query(`INSERT INTO [dbo].[AppRoles] (IDModule, IDGlobalRole, RequiresPassword, SessionHours, PwdExpiryDays) VALUES (@idModule, 1, 1, 12, 90)`);
            step(7, TOTAL, 'AppRole ITT Admin registrata');
        } else {
            step(7, TOTAL, 'AppRole ITT gia registrata, skip');
        }

        const prgRolesExist = await pool.request()
            .input('idModule', sql.Int, idPRG)
            .query(`SELECT IDAppRole FROM [dbo].[AppRoles] WHERE IDModule = @idModule`);
        if (prgRolesExist.recordset.length === 0) {
            await pool.request()
                .input('idModule', sql.Int, idPRG)
                .query(`INSERT INTO [dbo].[AppRoles] (IDModule, IDGlobalRole, RequiresPassword, SessionHours, PwdExpiryDays) VALUES (@idModule, 1, 1, 12, 90)`);
            step(7, TOTAL, 'AppRole PRG Admin registrata');
        } else {
            step(7, TOTAL, 'AppRole PRG gia registrata, skip');
        }

        // ============================================================
        // A6. Verificare linked server per PRG (pc-sviluppo)
        // ============================================================
        const linkedServers = await pool.request().query(`SELECT name FROM sys.servers WHERE name != @@SERVERNAME`);
        const serverNames = linkedServers.recordset.map(r => r.name.toLowerCase());
        const prgLinked = serverNames.includes('pc-sviluppo');
        step(8, TOTAL, `Linked servers trovati: [${linkedServers.recordset.map(r => r.name).join(', ')}]`);

        if (!prgLinked) {
            console.warn(`[8/${TOTAL}] ATTENZIONE: pc-sviluppo NON e un linked server su 192.168.0.163.`);
            console.warn('         La vw_UserAccess per PRG usera [PRG].[dbo].[Operators] — funziona');
            console.warn('         SOLO se il database PRG e anche su 192.168.0.163.');
            console.warn('         Se PRG e solo su pc-sviluppo, dovrai creare un linked server');
            console.warn('         oppure creare il DB PRG (con la sola tabella Operators) anche su 192.168.0.163.');
        }

        // ============================================================
        // A5. Aggiornare vw_UserAccess (aggiunge rami ITT e PRG)
        // ============================================================

        // Se PRG e su linked server, usiamo la sintassi a 4 parti; altrimenti nome DB locale
        const prgRef = prgLinked ? '[pc-sviluppo].[PRG].[dbo].[Operators]' : '[PRG].[dbo].[Operators]';

        await pool.request().query(`
            ALTER VIEW [dbo].[vw_UserAccess] AS
            /* 1. CAPTAIN */
            SELECT c.IDUser, 2 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles] WHERE RoleCode = c.Role) AS IDGlobalRole,
                c.Role AS RoleCode, c.IsActive
            FROM [CAP].[dbo].[Captains] c
            UNION ALL
            /* 2. BOBINE */
            SELECT o.IDUser, 1 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = CASE WHEN o.Admin = 1 THEN 'Admin' ELSE 'Base' END) AS IDGlobalRole,
                CASE WHEN o.Admin = 1 THEN 'Admin' ELSE 'Base' END AS RoleCode, o.IsActive
            FROM [BOB].[dbo].[Operators] o
            UNION ALL
            /* 3. ETICHETTE */
            SELECT e.IDUser, 3 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = CASE WHEN e.Admin = 1 THEN 'Admin' ELSE 'Base' END) AS IDGlobalRole,
                CASE WHEN e.Admin = 1 THEN 'Admin' ELSE 'Base' END AS RoleCode, e.IsActive
            FROM [PE].[dbo].[Operators] e
            UNION ALL
            /* 4. GABRIELE 2.0 */
            SELECT g.IDUser, 4 AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = CASE WHEN g.Admin = 1 THEN 'Admin' ELSE 'Base' END) AS IDGlobalRole,
                CASE WHEN g.Admin = 1 THEN 'Admin' ELSE 'Base' END AS RoleCode, g.IsActive
            FROM [GB2].[dbo].[Operators] g
            UNION ALL
            /* 5. ITT (Classificazione) */
            SELECT i.IDUser, ${idITT} AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = 'Admin') AS IDGlobalRole,
                'Admin' AS RoleCode, i.IsActive
            FROM [ITT].[dbo].[Operators] i
            UNION ALL
            /* 6. PRG (Ujet Progetti) */
            SELECT p.IDUser, ${idPRG} AS IDModule,
                (SELECT TOP 1 IDGlobalRole FROM [GA].[dbo].[GlobalRoles]
                 WHERE RoleCode = 'Admin') AS IDGlobalRole,
                'Admin' AS RoleCode, p.IsActive
            FROM ${prgRef} p
        `);
        step(9, TOTAL, 'Vista vw_UserAccess aggiornata con rami ITT e PRG');

        await pool.close();

        // ============================================================
        // RISULTATO
        // ============================================================
        console.log('\n=== SETUP ITT + PRG COMPLETATO ===');
        console.log(`ITT -> IDModule: ${idITT}`);
        console.log(`PRG -> IDModule: ${idPRG}`);
        console.log('Ruoli: solo Admin (con password, 12h sessione, 90gg scadenza)');
        console.log('Prossimo passo: assegnare i visti dal Captain Console.');

        // Verifica che gli ID corrispondano a quelli hardcodati nel codice
        if (idITT !== 5) console.warn(`\nATTENZIONE: IDModule ITT = ${idITT} (nel codice e hardcodato 5). Aggiorna portal.js, sicurezza.js, captain.html, bobine.js, ET.html, gb2-bootstrap.js.`);
        if (idPRG !== 6) console.warn(`ATTENZIONE: IDModule PRG = ${idPRG} (nel codice e hardcodato 6). Aggiorna portal.js, sicurezza.js, captain.html, bobine.js, ET.html, gb2-bootstrap.js.`);

    } catch (err) {
        console.error('ERRORE:', err.message);
        console.error(err);
    } finally {
        if (pool) { try { await pool.close(); } catch (e) {} }
        process.exit(0);
    }
}

run();
