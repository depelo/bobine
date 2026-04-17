// Diagnostica stato GB2_SP su BCUBE2 (produzione)
// Uso getPoolITT che e' gia connesso a BCUBE2 con credenziali funzionanti
const { getPoolITT } = require('./config/db.js');

(async () => {
  const pool = await getPoolITT();

  // 1. Esiste il DB GB2_SP?
  let r = await pool.request().query(`
    SELECT name, create_date, state_desc
    FROM sys.databases WHERE name='GB2_SP'
  `);
  console.log('[1] DB GB2_SP:', r.recordset.length ? JSON.stringify(r.recordset[0]) : 'NON ESISTE');

  // 2. Tabella DeployVersion
  r = await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.databases WHERE name='GB2_SP')
      SELECT Versione, DeployedAt FROM [GB2_SP].[dbo].[DeployVersion]
    ELSE
      SELECT 'N/A' AS Versione, NULL AS DeployedAt
  `);
  console.log('[2] DeployVersion:', JSON.stringify(r.recordset));

  // 3. Lista TUTTE le SP nel DB GB2_SP
  r = await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.databases WHERE name='GB2_SP')
      SELECT name, type_desc, create_date, modify_date
      FROM [GB2_SP].sys.objects
      WHERE type IN ('P','U')
      ORDER BY name
  `);
  console.log('[3] Oggetti in GB2_SP:');
  r.recordset.forEach(o => console.log('   ', o.type_desc.padEnd(20), o.name, '|created', o.create_date, '|modified', o.modify_date));

  // 4. Specifico: la SP che il client cerca esiste?
  r = await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.databases WHERE name='GB2_SP')
      SELECT 1 AS ok FROM [GB2_SP].sys.objects WHERE name='usp_CreaOrdineFornitore' AND type='P'
    ELSE
      SELECT 0 AS ok
  `);
  console.log('[4] usp_CreaOrdineFornitore esiste?', r.recordset[0].ok === 1 ? 'SI' : 'NO');

  // 5. Server connesso
  console.log('[5] Pool config server:', pool.config.server, 'database:', pool.config.database);

  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
