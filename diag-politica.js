// Leggi il contenuto di _Politica per il task
const { getPoolITT } = require('./config/db.js');

(async () => {
    const pool = await getPoolITT();
    const r = await pool.request().query(`
        SELECT polriord, politica, pol, tipo_pol
        FROM dbo._Politica
        ORDER BY polriord
    `);
    console.log('Righe trovate in _Politica:', r.recordset.length);
    console.log(JSON.stringify(r.recordset, null, 2));
    await pool.close();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
