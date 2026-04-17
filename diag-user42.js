// Cosa vede il backend per Gabriel (IDUser=42)
const sql = require('mssql');
require('dotenv').config();

(async () => {
  // Connessione MRP@163 dove sta GB2.TestProfiles
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER_163 || '192.168.0.163',
    database: 'MRP',
    user: process.env.DB_USER_163,
    password: process.env.DB_PASSWORD_163,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  }).connect();

  // 1. Profili di prova di Gabriel
  let r = await pool.request().query(`
    SELECT ID, IDUser, ProfileLabel, Server, DatabaseMRP, DatabaseUJET11,
           DbUser, IsActive, CreatedAt, UpdatedAt
    FROM [GB2].[dbo].[TestProfiles]
    WHERE IDUser = 42
  `);
  console.log('[1] Profili di prova di Gabriel (IDUser=42):');
  if (!r.recordset.length) {
    console.log('   NESSUN PROFILO DI PROVA — Gabriel lavora sul profilo PRODUZIONE');
  } else {
    r.recordset.forEach(p => console.log('   ', JSON.stringify(p)));
    const active = r.recordset.find(p => p.IsActive);
    console.log('   --> Profilo ATTIVO al login:', active ? `T${active.ID} (${active.ProfileLabel})` : 'nessuno → fallback PRODUZIONE');
  }

  // 2. Verifica anche tutti gli utenti che hanno profili attivi (per contesto)
  r = await pool.request().query(`
    SELECT IDUser, COUNT(*) AS profili, SUM(CASE WHEN IsActive=1 THEN 1 ELSE 0 END) AS attivi
    FROM [GB2].[dbo].[TestProfiles]
    GROUP BY IDUser
    ORDER BY IDUser
  `);
  console.log('\n[2] Tutti gli utenti con profili di prova:');
  r.recordset.forEach(u => console.log('   ', JSON.stringify(u)));

  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
