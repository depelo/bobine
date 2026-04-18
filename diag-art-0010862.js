// Cosa c'e nell'articolo 0010862 — focus su ar_desint e politica riordino
const { getPoolITT } = require('./config/db.js');

(async () => {
    const pool = await getPoolITT();

    const r = await pool.request()
        .input('c', '0010862')
        .query(`
            SELECT
                ar_codart, ar_codalt, ar_descr,
                ar_polriord, ar_desint, ar_scomin, ar_minord, ar_rrfence,
                ar_unmis, ar_forn, ar_forn2,
                LEN(LTRIM(RTRIM(ar_desint))) AS len_desint
            FROM dbo.artico
            WHERE codditt='UJET11' AND ar_codart=@c
        `);

    if (r.recordset.length === 0) {
        console.log('ARTICOLO NON TROVATO');
        process.exit(0);
    }
    const a = r.recordset[0];
    console.log('\n=== Articolo', a.ar_codart, '===\n');
    console.log('Descrizione      :', a.ar_descr);
    console.log('Codice alt.      :', a.ar_codalt);
    console.log('UM               :', a.ar_unmis);
    console.log('');
    console.log('ar_polriord      : "' + a.ar_polriord + '"');
    console.log('ar_desint (len ' + a.len_desint + '): "' + a.ar_desint + '"');
    console.log('ar_scomin        :', a.ar_scomin);
    console.log('ar_minord        :', a.ar_minord);
    console.log('ar_rrfence       :', a.ar_rrfence);
    console.log('ar_forn          :', a.ar_forn);
    console.log('ar_forn2         :', a.ar_forn2);

    // Anche: tutti gli altri 94 articoli con polriord='G' — vediamo se hanno ar_desint
    console.log('\n=== Tutti gli articoli con ar_polriord="G" e popolazione ar_desint ===\n');
    const r2 = await pool.request().query(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH aa AS (
            SELECT DISTINCT m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        )
        SELECT
            COUNT(*) AS tot_g,
            SUM(CASE WHEN LEN(LTRIM(RTRIM(ar.ar_desint)))>0 THEN 1 ELSE 0 END) AS g_con_desint
        FROM aa a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_polriord='G'
    `);
    console.log('Tot articoli attivi con polriord=G  :', r2.recordset[0].tot_g);
    console.log('Di cui con ar_desint compilato      :', r2.recordset[0].g_con_desint);

    // 5 campioni di articoli G con desint
    const r3 = await pool.request().query(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH aa AS (
            SELECT DISTINCT m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        )
        SELECT TOP 8 ar.ar_codart, ar.ar_descr, ar.ar_desint
        FROM aa a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_polriord='G' AND LEN(LTRIM(RTRIM(ar.ar_desint)))>0
        ORDER BY ar.ar_codart
    `);
    console.log('\nCampioni articoli G con ar_desint:');
    r3.recordset.forEach(x => console.log('  ' + x.ar_codart + '  desint="' + x.ar_desint + '"  (' + x.ar_descr + ')'));

    await pool.close();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
