const { getPoolITT } = require('./config/db.js');
(async () => {
  const pool = await getPoolITT();
  const r = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='anagra' AND (COLUMN_NAME LIKE 'an_%')
  `);
  console.log('movord cols:', r.recordset.map(x=>x.COLUMN_NAME).join(', '));
  process.exit(0);
})();
