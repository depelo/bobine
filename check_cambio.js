const { getPoolITT } = require('./config/db.js');
async function main() {
  const pool = await getPoolITT();

  // 1. For article 0060515 supplier 20012281 (USD), show ALL ordlist rows with date and source info
  let r = await pool.request().query(`
    SELECT ol_progr, ol_codart, ol_conto, ol_codvalu, ol_prezzo, ol_prezvalc,
           ol_cambio, ol_quant, ol_datord, ol_datcons, ol_stato, ol_stasino
    FROM ordlist
    WHERE ol_codart = '0060515' AND ol_conto = 20012281
    ORDER BY ol_datord DESC
  `);
  console.log('=== Article 0060515 / Supplier 20012281 - ALL ordlist rows ===');
  r.recordset.forEach(row => console.log(JSON.stringify(row)));

  // 2. Check cambi table for USD on those dates
  r = await pool.request().query(`
    SELECT TOP 30 wx_codvalu, wx_dtvalid, wx_cambio
    FROM cambi
    WHERE wx_codvalu = 20
    ORDER BY wx_dtvalid DESC
  `);
  console.log('\n=== Recent USD exchange rates in cambi table ===');
  r.recordset.forEach(row => console.log(JSON.stringify(row)));

  // 3. Date range of cambi for USD
  r = await pool.request().query(`
    SELECT MIN(wx_dtvalid) as min_date, MAX(wx_dtvalid) as max_date, COUNT(*) as cnt
    FROM cambi WHERE wx_codvalu = 20
  `);
  console.log('\n=== USD cambi date coverage ===');
  console.log(JSON.stringify(r.recordset[0]));

  // 4. For each ol_cambio=1 row in foreign currency, was there a cambi entry for that date?
  r = await pool.request().query(`
    SELECT TOP 20 o.ol_codart, o.ol_conto, o.ol_codvalu, o.ol_prezzo, o.ol_prezvalc,
           o.ol_cambio, o.ol_datord,
           c.wx_cambio AS rate_in_cambi_table
    FROM ordlist o
    LEFT JOIN cambi c ON c.wx_codvalu = o.ol_codvalu
                     AND c.wx_dtvalid = (SELECT MAX(c2.wx_dtvalid)
                                          FROM cambi c2
                                          WHERE c2.wx_codvalu = o.ol_codvalu
                                            AND c2.wx_dtvalid <= o.ol_datord)
    WHERE o.ol_codvalu != 0 AND o.ol_cambio = 1
    ORDER BY o.ol_datord DESC
  `);
  console.log('\n=== ol_cambio=1 rows: was a rate available in cambi? ===');
  r.recordset.forEach(row => console.log(JSON.stringify(row)));

  // 5. Same for ol_cambio != 1 rows
  r = await pool.request().query(`
    SELECT TOP 20 o.ol_codart, o.ol_conto, o.ol_codvalu, o.ol_prezzo, o.ol_prezvalc,
           o.ol_cambio, o.ol_datord,
           c.wx_cambio AS rate_in_cambi_table
    FROM ordlist o
    LEFT JOIN cambi c ON c.wx_codvalu = o.ol_codvalu
                     AND c.wx_dtvalid = (SELECT MAX(c2.wx_dtvalid)
                                          FROM cambi c2
                                          WHERE c2.wx_codvalu = o.ol_codvalu
                                            AND c2.wx_dtvalid <= o.ol_datord)
    WHERE o.ol_codvalu != 0 AND o.ol_cambio != 1
    ORDER BY o.ol_datord DESC
  `);
  console.log('\n=== ol_cambio != 1 rows: rate vs cambi table ===');
  r.recordset.forEach(row => console.log(JSON.stringify(row)));

  // 6. Aggregate: how many ol_cambio=1 rows have/dont have a rate available
  r = await pool.request().query(`
    SELECT
      CASE WHEN o.ol_cambio = 1 THEN 'cambio=1' ELSE 'cambio!=1' END as tipo,
      CASE WHEN c.wx_cambio IS NULL THEN 'NO rate in cambi'
           WHEN c.wx_cambio = 1 THEN 'rate=1 in cambi'
           ELSE 'rate>1 in cambi' END as cambi_status,
      COUNT(*) AS cnt
    FROM ordlist o
    LEFT JOIN cambi c ON c.wx_codvalu = o.ol_codvalu
                     AND c.wx_dtvalid = (SELECT MAX(c2.wx_dtvalid)
                                          FROM cambi c2
                                          WHERE c2.wx_codvalu = o.ol_codvalu
                                            AND c2.wx_dtvalid <= o.ol_datord)
    WHERE o.ol_codvalu != 0
    GROUP BY
      CASE WHEN o.ol_cambio = 1 THEN 'cambio=1' ELSE 'cambio!=1' END,
      CASE WHEN c.wx_cambio IS NULL THEN 'NO rate in cambi'
           WHEN c.wx_cambio = 1 THEN 'rate=1 in cambi'
           ELSE 'rate>1 in cambi' END
    ORDER BY tipo, cambi_status
  `);
  console.log('\n=== Aggregate: ol_cambio vs cambi table availability ===');
  r.recordset.forEach(row => console.log(JSON.stringify(row)));

  // 7. Check ol_quant: smaller quantities = manual entries?
  r = await pool.request().query(`
    SELECT
      CASE WHEN ol_cambio = 1 THEN 'cambio=1' ELSE 'cambio!=1' END as tipo,
      COUNT(*) as cnt,
      AVG(ol_quant) as avg_qty,
      MIN(ol_quant) as min_qty,
      MAX(ol_quant) as max_qty
    FROM ordlist
    WHERE ol_codvalu != 0
    GROUP BY CASE WHEN ol_cambio = 1 THEN 'cambio=1' ELSE 'cambio!=1' END
  `);
  console.log('\n=== Quantity stats by cambio type ===');
  r.recordset.forEach(row => console.log(JSON.stringify(row)));

  await pool.close();
}
main().catch(e => { console.error(e.message); });
