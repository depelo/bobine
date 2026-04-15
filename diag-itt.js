/* Diagnostica: perché ITT non compare in authorizedApps per IDUser=20 */
require('dotenv').config();
const sql = require('mssql');

const IDUSER = 20;

const cfgGA = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD_GA || 'Risk0804',
  server: process.env.DB_SERVER_GA || 'localhost',
  database: 'GA',
  options: { encrypt: false, trustServerCertificate: true }
};

(async () => {
  const pool = await new sql.ConnectionPool(cfgGA).connect();

  console.log('\n=== 1) Modulo ITT in [GA].[dbo].[Modules] ===');
  const mods = await pool.request().query(`
    SELECT IDModule, ModuleName, TargetDb, TargetTable
    FROM [GA].[dbo].[Modules]
    WHERE TargetDb IN ('ITT','UJET11','PRG') OR ModuleName LIKE '%ITT%' OR ModuleName LIKE '%Progetti%'
  `);
  console.table(mods.recordset);

  console.log('\n=== 2) Righe di vw_UserAccess per IDUser=20 ===');
  const acc = await pool.request()
    .input('u', sql.Int, IDUSER)
    .query(`SELECT * FROM [GA].[dbo].[vw_UserAccess] WHERE IDUser = @u`);
  console.table(acc.recordset);

  console.log('\n=== 3) Definizione corrente di vw_UserAccess ===');
  const viewDef = await pool.request().query(`
    SELECT OBJECT_DEFINITION(OBJECT_ID('GA.dbo.vw_UserAccess')) AS def
  `);
  console.log(viewDef.recordset[0].def);

  console.log('\n=== 4) Esiste [ITT].[dbo].[Operators] sul server GA? ===');
  try {
    const itt = await pool.request().query(`
      SELECT DB_ID('ITT') AS ittDbId,
             OBJECT_ID('ITT.dbo.Operators') AS ittOpId
    `);
    console.table(itt.recordset);

    if (itt.recordset[0].ittDbId !== null) {
      const rows = await pool.request()
        .input('u', sql.Int, IDUSER)
        .query(`SELECT * FROM [ITT].[dbo].[Operators] WHERE IDUser = @u`);
      console.log('Righe in [ITT].[dbo].[Operators] per IDUser=20:');
      console.table(rows.recordset);

      const all = await pool.request().query(`SELECT TOP 20 * FROM [ITT].[dbo].[Operators]`);
      console.log('Tutte le righe di [ITT].[dbo].[Operators] (max 20):');
      console.table(all.recordset);
    }
  } catch (e) {
    console.log('Errore accesso [ITT].[dbo].[Operators]:', e.message);
  }

  console.log('\n=== 5) AppRoles per il modulo ITT ===');
  const ar = await pool.request().query(`
    SELECT AR.*, M.ModuleName
    FROM [GA].[dbo].[AppRoles] AR
    INNER JOIN [GA].[dbo].[Modules] M ON AR.IDModule = M.IDModule
    WHERE M.TargetDb = 'ITT' OR M.ModuleName LIKE '%ITT%'
  `);
  console.table(ar.recordset);

  await pool.close();
})().catch(e => { console.error(e); process.exit(1); });
