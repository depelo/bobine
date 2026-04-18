// Cosa diavolo sono i caf_hh* — interrogo lo schema BCube
const { getPoolITT } = require('./config/db.js');

(async () => {
    const pool = await getPoolITT();

    // 1. Cerca extended properties (descrizioni colonna) per le colonne caf_hh*
    console.log('\n=== [1] Extended properties per colonne caf_hh* ===\n');
    let r = await pool.request().query(`
        SELECT
            c.name AS colonna,
            ep.value AS descrizione
        FROM sys.extended_properties ep
        JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
        JOIN sys.tables t ON c.object_id = t.object_id
        WHERE t.name = 'codarfo' AND c.name LIKE 'caf[_]hh%'
        ORDER BY c.name
    `);
    if (r.recordset.length === 0) {
        console.log('  (nessuna extended property trovata)');
    } else {
        r.recordset.forEach(x => console.log(`  ${x.colonna.padEnd(25)} -> ${x.descrizione}`));
    }

    // 2. Esistono OVUNQUE altri campi con prefisso "hh" in altre tabelle BCube?
    console.log('\n=== [2] Tutte le colonne con "hh" nel nome (anywhere in DB) ===\n');
    r = await pool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE COLUMN_NAME LIKE '%[_]hh%' OR COLUMN_NAME LIKE 'hh%'
        ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    const byTab = {};
    r.recordset.forEach(x => {
        byTab[x.TABLE_NAME] = byTab[x.TABLE_NAME] || [];
        byTab[x.TABLE_NAME].push(x.COLUMN_NAME + ' (' + x.DATA_TYPE + ')');
    });
    for (const t of Object.keys(byTab).sort()) {
        console.log(`  ${t}:`);
        byTab[t].forEach(c => console.log(`     ${c}`));
    }

    // 3. Esiste una tabella "fabbricanti" o simili che potrebbe spiegare hhFabb?
    console.log('\n=== [3] Tabelle BCube che contengono "fabb" / "udi" / "rdm" / "eudamed" / "notifi" ===\n');
    r = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE='BASE TABLE'
          AND (TABLE_NAME LIKE '%fabb%' OR TABLE_NAME LIKE '%udi%'
               OR TABLE_NAME LIKE '%rdm%' OR TABLE_NAME LIKE '%eudamed%'
               OR TABLE_NAME LIKE '%notif%' OR TABLE_NAME LIKE '%medical%'
               OR TABLE_NAME LIKE '%dispo%' OR TABLE_NAME LIKE 'hh%')
        ORDER BY TABLE_NAME
    `);
    if (r.recordset.length === 0) console.log('  (nessuna)');
    r.recordset.forEach(x => console.log(`  - ${x.TABLE_NAME}`));

    // 4. Tabelle con extended property descrittiva (caso BCube documenta a livello di tabella)
    console.log('\n=== [4] Extended properties a livello TABELLA per nomi sospetti ===\n');
    r = await pool.request().query(`
        SELECT t.name AS tabella, ep.value AS descrizione
        FROM sys.extended_properties ep
        JOIN sys.tables t ON ep.major_id = t.object_id AND ep.minor_id = 0
        WHERE t.name LIKE '%fabb%' OR t.name LIKE 'hh%' OR t.name = 'codarfo'
    `);
    if (r.recordset.length === 0) console.log('  (nessuna)');
    r.recordset.forEach(x => console.log(`  ${x.tabella}: ${x.descrizione}`));

    await pool.close();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
