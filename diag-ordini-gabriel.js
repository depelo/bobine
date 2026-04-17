// Vedo io gli ordini di Gabriel?
const { getPoolITT } = require('./config/db.js');

(async () => {
  const pool = await getPoolITT();

  // Tutti gli ordini fornitore EMESSI OGGI
  let r = await pool.request().query(`
    SELECT TOP 50 td_anno, td_serie, td_numord, td_datord, td_conto, td_opnome,
                  td_totmercev, td_totdocv, td_valuta, td_cambio, td_flevas
    FROM dbo.testord
    WHERE codditt='UJET11' AND td_tipork='O'
      AND CAST(td_datord AS DATE) = CAST(GETDATE() AS DATE)
    ORDER BY td_anno DESC, td_numord DESC
  `);
  console.log('Ordini fornitore EMESSI OGGI (' + r.recordset.length + '):');
  r.recordset.forEach(o => console.log(' ', JSON.stringify(o)));

  // Solo ordini con operatore GB242 (Gabriel) — di tutti i tempi recenti
  r = await pool.request().query(`
    SELECT TOP 30 td_anno, td_serie, td_numord, td_datord, td_conto, td_opnome,
                  td_totmercev, td_totdocv, td_valuta, td_flevas
    FROM dbo.testord
    WHERE codditt='UJET11' AND td_tipork='O'
      AND td_opnome = 'GB242'
    ORDER BY td_datord DESC, td_numord DESC
  `);
  console.log('\nOrdini emessi da GABRIEL (td_opnome=GB242, ultimi 30):');
  r.recordset.forEach(o => console.log(' ', JSON.stringify(o)));

  // Distribuzione operatori GB2* recenti (ultimi 7 giorni)
  r = await pool.request().query(`
    SELECT td_opnome, COUNT(*) AS n_ordini, MAX(td_datord) AS ultimo
    FROM dbo.testord
    WHERE codditt='UJET11' AND td_tipork='O'
      AND td_opnome LIKE 'GB2%'
      AND td_datord >= DATEADD(day, -7, GETDATE())
    GROUP BY td_opnome
    ORDER BY MAX(td_datord) DESC
  `);
  console.log('\nOperatori GB2* attivi negli ultimi 7gg:');
  r.recordset.forEach(o => console.log(' ', JSON.stringify(o)));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
