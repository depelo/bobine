// Naviga MRP@163 con la stessa password di BCUBE2
const sql = require('mssql');
require('dotenv').config();

(async () => {
  const password = process.env.DB_PASSWORD_ITT || process.env.DB_PASSWORD_ET || 'Risk0804';
  const pool = await new sql.ConnectionPool({
    server: '192.168.0.163', database: 'MRP', user: 'sa', password,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  }).connect();
  console.log('Connesso a 192.168.0.163/MRP\n');

  // 1. Profilo attivo dell'utente 20 (tu)
  let r = await pool.request().query(`
    SELECT ID, IDUser, ProfileLabel, Server, DatabaseMRP, DatabaseUJET11, DbUser, IsActive, UpdatedAt
    FROM [GB2].[dbo].[TestProfiles]
    WHERE IDUser = 20
    ORDER BY IsActive DESC, ID
  `);
  console.log('[1] Profili di USER 20 (tu):');
  if (!r.recordset.length) console.log('   nessuno → lavori sempre in PRODUZIONE');
  else r.recordset.forEach(p => console.log(' ', JSON.stringify(p)));

  // 2. Profilo attivo di Gabriel (42)
  r = await pool.request().query(`
    SELECT ID, IDUser, ProfileLabel, Server, IsActive
    FROM [GB2].[dbo].[TestProfiles]
    WHERE IDUser = 42
  `);
  console.log('\n[2] Profili di GABRIEL (user 42):');
  if (!r.recordset.length) console.log('   nessuno → lavora sempre in PRODUZIONE');
  else r.recordset.forEach(p => console.log(' ', JSON.stringify(p)));

  // 3. Schema reale di ordini_confermati_pending
  r = await pool.request().query(`
    SELECT COLUMN_NAME FROM [GB2].INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='ordini_confermati_pending' ORDER BY ORDINAL_POSITION
  `);
  console.log('\n[schema ordini_confermati_pending]:', r.recordset.map(c=>c.COLUMN_NAME).join(', '));

  // 3b. Conferme pending di Gabriel
  r = await pool.request().query(`
    SELECT TOP 100 *
    FROM [GB2].[dbo].[ordini_confermati_pending]
    WHERE user_id = 42
    ORDER BY updated_at DESC
  `);
  console.log('\n[3] Conferme PENDING di Gabriel (user_id=42) — carrello pre-emissione:');
  console.log('    Totale righe pending:', r.recordset.length);
  r.recordset.slice(0, 20).forEach(o => console.log(' ', JSON.stringify(o)));

  // 4. Elaborazione MRP corrente per ambiente produzione
  r = await pool.request().query(`
    SELECT TOP 5 ID, Fingerprint, RilevatoIl, TotaleProposte, TotaleGestite, IDUser, Ambiente, NumeroElab
    FROM [GB2].[dbo].[ElaborazioniMRP]
    WHERE Ambiente = 'produzione'
    ORDER BY ID DESC
  `);
  console.log('\n[4] Elaborazioni MRP recenti (ambiente produzione):');
  r.recordset.forEach(o => console.log(' ', JSON.stringify(o)));

  // 5. schema ordini_emessi
  r = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='ordini_emessi' ORDER BY ORDINAL_POSITION
  `);
  console.log('\n[schema ordini_emessi]:', r.recordset.map(c=>c.COLUMN_NAME).join(', '));

  // 5b. ordini_emessi ultimi 7gg
  r = await pool.request().query(`
    SELECT TOP 30 *
    FROM dbo.ordini_emessi
    WHERE data_emissione >= DATEADD(day, -7, GETDATE())
    ORDER BY data_emissione DESC, id DESC
  `);
  console.log('\n[5] ordini_emessi ultimi 7 gg (tutti):');
  r.recordset.forEach(o => console.log(' ', JSON.stringify(o)));

  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
