// STEP 1 — Riparazione SP mancanti per Gabriel (e tutti gli operatori in produzione)
//
// Cosa fa, in ordine:
//  1. Apre connessione a [GB2_SP] su BCUBE2 con credenziali ITT (sa)
//  2. Droppa le 4 SP fantasma con suffisso _Tundefined (artefatti del bug Crea-e-Riprova)
//  3. Esegue i file SQL usp_CreaOrdineFornitore.sql e usp_AggiungiRigheOrdineFornitore.sql
//     (hanno IF EXISTS DROP + CREATE → idempotenti)
//  4. Verifica che le 4 SP "vere" esistano e listale
//
// NON tocca PM2, NON tocca DeployVersion (resta a 3.3 — coerente).

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

(async () => {
  const server   = process.env.DB_SERVER_ITT || 'BCUBE2';
  const user     = process.env.DB_USER || 'sa';
  const password = process.env.DB_PASSWORD_ITT || process.env.DB_PASSWORD_ET || 'Risk0804';

  console.log('Connessione a [GB2_SP]@' + server + ' come ' + user + ' ...');
  const pool = await new sql.ConnectionPool({
    server, database: 'GB2_SP', user, password,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  }).connect();
  console.log('OK\n');

  // ---------- Step 1.1: pulizia SP fantasma _Tundefined ----------
  console.log('--- 1.1 Cleanup SP fantasma _Tundefined ---');
  const ghost = [
    'usp_CreaOrdineFornitore_Tundefined',
    'usp_AggiungiRigheOrdineFornitore_Tundefined',
    'usp_AggiornaStatoInvioOrdine_Tundefined',
    'usp_RimuoviRigaOrdineFornitore_Tundefined'
  ];
  for (const g of ghost) {
    try {
      await pool.request().batch(
        `IF EXISTS (SELECT 1 FROM sys.objects WHERE name='${g}' AND type='P') DROP PROCEDURE dbo.[${g}];`
      );
      console.log('  drop OK  :', g);
    } catch (e) {
      console.log('  drop FAIL:', g, '|', e.message);
    }
  }

  // ---------- Step 1.2: deploy 2 SP mancanti ----------
  console.log('\n--- 1.2 Deploy SP mancanti dai file SQL ---');
  const sqlDir = path.join(__dirname, 'sql', 'mrp');
  const targets = [
    'usp_CreaOrdineFornitore.sql',
    'usp_AggiungiRigheOrdineFornitore.sql'
  ];
  for (const file of targets) {
    const filePath = path.join(sqlDir, file);
    console.log('\n>> ' + file);
    if (!fs.existsSync(filePath)) {
      console.log('   FILE MANCANTE');
      continue;
    }
    const sqlText = fs.readFileSync(filePath, 'utf-8');
    const batches = sqlText.split(/^\s*GO\s*$/im).filter(b => b.trim());
    let i = 0, ok = true;
    for (const b of batches) {
      i++;
      try {
        await pool.request().batch(b);
        console.log('   batch ' + i + '/' + batches.length + ' OK (' + b.trim().slice(0, 60).replace(/\s+/g, ' ') + ' ...)');
      } catch (e) {
        ok = false;
        console.log('   batch ' + i + '/' + batches.length + ' FAIL:', e.message);
        console.log('   primo blocco fallito:', b.trim().slice(0, 200));
        break;
      }
    }
    console.log('   risultato file:', ok ? 'OK' : 'FALLITO');
  }

  // ---------- Step 1.3: verifica finale ----------
  console.log('\n--- 1.3 Verifica finale: oggetti in [GB2_SP] ---');
  const r = await pool.request().query(`
    SELECT name, type_desc, modify_date
    FROM sys.objects WHERE type IN ('P','U') ORDER BY name
  `);
  r.recordset.forEach(o => console.log('  ', o.type_desc.padEnd(20), o.name, '|', o.modify_date.toISOString()));

  const required = [
    'usp_CreaOrdineFornitore',
    'usp_AggiungiRigheOrdineFornitore',
    'usp_AggiornaStatoInvioOrdine',
    'usp_RimuoviRigaOrdineFornitore'
  ];
  console.log('\nRequired SP check:');
  let allOK = true;
  for (const req of required) {
    const found = r.recordset.find(o => o.name === req && o.type_desc === 'SQL_STORED_PROCEDURE');
    console.log('  ' + (found ? 'OK   ' : 'MISS!') + ' ' + req);
    if (!found) allOK = false;
  }
  console.log('\n=> Stato finale:', allOK ? 'GABRIEL PUO\' EMETTERE ORDINI' : 'ANCORA PROBLEMI — VERIFICA OUTPUT SOPRA');

  await pool.close();
  process.exit(allOK ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
