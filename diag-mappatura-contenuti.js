// Mappatura CONTENUTO dei campi già esplorati
// =============================================
// Per ogni campo gia mappato in diag-mappatura-acquisti.js,
// guardiamo dentro i valori per capire cosa contiene davvero.
//
// Strategia per categoria:
//   - Numeri intoeri/decimali  -> distribuzione (TOP 15) + min/max/avg
//                                -> distinzione tra "default" e "configurato"
//   - Codici (FK)              -> TOP 15 valori + cardinality
//   - Flag/categorici (CHAR(1))-> distribuzione completa
//   - Testo libero             -> stats su lunghezza + 5 campioni reali
//   - Date                     -> range (min/max)
//
// Popolazione: stessa di diag-mappatura-acquisti.js (ultimi 365 gg, td_tipork='O')

const { getPoolITT } = require('./config/db.js');

(async () => {
    const pool = await getPoolITT();
    const hr = (c='-') => console.log(c.repeat(76));
    const trunc = (s, n) => {
        if (s == null) return '';
        const t = String(s).replace(/\r/g,'').replace(/\u00d0/g,' | ').replace(/\n/g,' \\n ');
        return t.length > n ? t.slice(0, n) + '..' : t;
    };

    // CTE riusabile per popolazione attiva ----------------------------------
    const CTE_POP = `
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH attivi_ord AS (
            SELECT t.td_conto AS conto, m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        ),
        forn AS (SELECT DISTINCT conto FROM attivi_ord),
        art  AS (SELECT DISTINCT codart FROM attivi_ord),
        cop  AS (SELECT DISTINCT conto, codart FROM attivi_ord)
    `;

    console.log('\n');
    hr('=');
    console.log(' MAPPATURA CONTENUTI — cosa ci sta DENTRO i campi popolati');
    hr('=');

    // ====================================================================
    // ANAGRA — fornitori attivi
    // ====================================================================
    console.log('\n');
    hr('#');
    console.log(' ANAGRA  (fornitori attivi)');
    hr('#');

    // an_listino — distribuzione (quanti listini diversi vengono usati?)
    console.log('\n[ANAGRA.an_listino]  numero listino BCube assegnato al fornitore');
    let r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 a.an_listino AS valore, COUNT(*) AS n
        FROM forn f JOIN dbo.anagra a ON a.an_conto=f.conto
        GROUP BY a.an_listino
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   listino=${String(x.valore).padStart(4)}  fornitori=${x.n}`));

    // an_codpag — codice pagamento BCube
    console.log('\n[ANAGRA.an_codpag]  codice pagamento BCube — TOP 15');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 a.an_codpag AS valore, COUNT(*) AS n
        FROM forn f JOIN dbo.anagra a ON a.an_conto=f.conto
        WHERE a.an_codpag > 0
        GROUP BY a.an_codpag
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   pagamento=${String(x.valore).padStart(5)}  fornitori=${x.n}`));

    // an_porto — porto franco/assegnato
    console.log('\n[ANAGRA.an_porto]  codice porto — distribuzione completa');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT a.an_porto AS valore, COUNT(*) AS n
        FROM forn f JOIN dbo.anagra a ON a.an_conto=f.conto
        WHERE a.an_porto IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_porto)))>0
        GROUP BY a.an_porto
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   porto="${x.valore}"  fornitori=${x.n}`));

    // an_vett — vettore (sappiamo gia che e quasi vuoto, vediamo i pochi)
    console.log('\n[ANAGRA.an_vett]  codice vettore — TOP 10 (anche se rarissimo)');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 10 a.an_vett AS valore, COUNT(*) AS n
        FROM forn f JOIN dbo.anagra a ON a.an_conto=f.conto
        WHERE a.an_vett > 0
        GROUP BY a.an_vett
        ORDER BY COUNT(*) DESC
    `);
    if (r.recordset.length === 0) console.log('   (nessuno)');
    r.recordset.forEach(x => console.log(`   vettore=${String(x.valore).padStart(6)}  fornitori=${x.n}`));

    // an_note — campioni reali
    console.log('\n[ANAGRA.an_note]  testo libero (note brevi / interne) — 5 campioni');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 5
            f.conto, a.an_descr1,
            LEN(CAST(a.an_note AS VARCHAR(MAX))) AS lunghezza,
            CAST(a.an_note AS VARCHAR(MAX)) AS contenuto
        FROM forn f JOIN dbo.anagra a ON a.an_conto=f.conto
        WHERE a.an_note IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(a.an_note AS VARCHAR(MAX)))))>0
        ORDER BY LEN(CAST(a.an_note AS VARCHAR(MAX))) DESC
    `);
    r.recordset.forEach(x => {
        console.log(`   conto=${x.conto} (${trunc(x.an_descr1,30)}) len=${x.lunghezza}`);
        console.log(`     "${trunc(x.contenuto, 200)}"`);
    });

    // an_note2 — campioni reali
    console.log('\n[ANAGRA.an_note2]  testo libero (note estese — quello che usano) — 5 campioni');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 5
            f.conto, a.an_descr1,
            LEN(CAST(a.an_note2 AS VARCHAR(MAX))) AS lunghezza,
            CAST(a.an_note2 AS VARCHAR(MAX)) AS contenuto
        FROM forn f JOIN dbo.anagra a ON a.an_conto=f.conto
        WHERE a.an_note2 IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(a.an_note2 AS VARCHAR(MAX)))))>0
        ORDER BY LEN(CAST(a.an_note2 AS VARCHAR(MAX))) DESC
    `);
    r.recordset.forEach(x => {
        console.log(`   conto=${x.conto} (${trunc(x.an_descr1,30)}) len=${x.lunghezza}`);
        console.log(`     "${trunc(x.contenuto, 280)}"`);
    });

    // ====================================================================
    // ARTICO — articoli attivi
    // ====================================================================
    console.log('\n');
    hr('#');
    console.log(' ARTICO  (articoli attivi)');
    hr('#');

    // ar_polriord — gia visto, ma rifacciamo per completezza
    console.log('\n[ARTICO.ar_polriord]  politica di riordino — distribuzione completa');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT ar.ar_polriord AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        GROUP BY ar.ar_polriord
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   polriord="${x.valore}"  articoli=${x.n}`));

    // ar_consmrp — flag (CHAR(1))
    console.log('\n[ARTICO.ar_consmrp]  flag "considera in MRP" — distribuzione completa');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT ar.ar_consmrp AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        GROUP BY ar.ar_consmrp
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   consmrp="${x.valore}"  articoli=${x.n}`));

    // ar_minord — quantita lotto
    console.log('\n[ARTICO.ar_minord]  Qta Lotto — TOP 15 valori + statistiche');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 ar.ar_minord AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_minord > 0
        GROUP BY ar.ar_minord
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   qta=${String(x.valore).padStart(12)}  articoli=${x.n}`));
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT MIN(ar.ar_minord) AS minv, MAX(ar.ar_minord) AS maxv, AVG(ar.ar_minord) AS avgv
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_minord > 0
    `);
    console.log(`   stats: min=${r.recordset[0].minv}  max=${r.recordset[0].maxv}  avg=${Number(r.recordset[0].avgv).toFixed(2)}`);

    // ar_scomin / ar_scomax
    console.log('\n[ARTICO.ar_scomin]  scorta minima — TOP 10');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 10 ar.ar_scomin AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_scomin > 0
        GROUP BY ar.ar_scomin
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   scomin=${String(x.valore).padStart(12)}  articoli=${x.n}`));

    console.log('\n[ARTICO.ar_scomax]  scorta massima — TOP 10');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 10 ar.ar_scomax AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_scomax > 0
        GROUP BY ar.ar_scomax
        ORDER BY COUNT(*) DESC
    `);
    if (r.recordset.length === 0) console.log('   (nessuno con valore > 0)');
    r.recordset.forEach(x => console.log(`   scomax=${String(x.valore).padStart(12)}  articoli=${x.n}`));

    // ar_sublotto / ar_maxlotto
    console.log('\n[ARTICO.ar_sublotto]  sub-lotto — TOP 10');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 10 ar.ar_sublotto AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_sublotto > 0
        GROUP BY ar.ar_sublotto
        ORDER BY COUNT(*) DESC
    `);
    if (r.recordset.length === 0) console.log('   (nessuno)');
    r.recordset.forEach(x => console.log(`   sublotto=${String(x.valore).padStart(10)}  articoli=${x.n}`));

    // ar_rrfence — Release Required fence (giorni?)
    console.log('\n[ARTICO.ar_rrfence]  RR fence — TOP 15');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 ar.ar_rrfence AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_rrfence > 0
        GROUP BY ar.ar_rrfence
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   rrfence=${String(x.valore).padStart(8)}  articoli=${x.n}`));
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT MIN(ar.ar_rrfence) AS minv, MAX(ar.ar_rrfence) AS maxv, AVG(ar.ar_rrfence) AS avgv
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_rrfence > 0
    `);
    console.log(`   stats: min=${r.recordset[0].minv}  max=${r.recordset[0].maxv}  avg=${Number(r.recordset[0].avgv).toFixed(2)}`);

    // **VITALE**: ar_ggant / ar_ggpost / ar_ggragg — sono default BCube?
    console.log('\n[ARTICO.ar_ggant]  giorni anticipo — TOP 15  (sospetto default 999)');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 ar.ar_ggant AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_ggant > 0
        GROUP BY ar.ar_ggant
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   ggant=${String(x.valore).padStart(8)}  articoli=${x.n}`));

    console.log('\n[ARTICO.ar_ggpost]  giorni posticipo — TOP 15');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 ar.ar_ggpost AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_ggpost > 0
        GROUP BY ar.ar_ggpost
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   ggpost=${String(x.valore).padStart(8)}  articoli=${x.n}`));

    console.log('\n[ARTICO.ar_ggragg]  giorni raggruppamento — TOP 15');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 ar.ar_ggragg AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_ggragg > 0
        GROUP BY ar.ar_ggragg
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   ggragg=${String(x.valore).padStart(8)}  articoli=${x.n}`));

    console.log('\n[ARTICO.ar_perragg]  periodo raggruppamento — distribuzione completa');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT ar.ar_perragg AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_perragg IS NOT NULL AND LEN(LTRIM(RTRIM(ar.ar_perragg)))>0
        GROUP BY ar.ar_perragg
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   perragg="${x.valore}"  articoli=${x.n}`));

    // ar_forn / ar_forn2 — FK a fornitore (verifica che siano validi)
    console.log('\n[ARTICO.ar_forn]  fornitore primario — verifica validita FK');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT
            COUNT(*) AS n_art_con_forn,
            SUM(CASE WHEN an.an_conto IS NOT NULL THEN 1 ELSE 0 END) AS n_forn_validi
        FROM art a
        JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        LEFT JOIN dbo.anagra an ON an.an_conto = ar.ar_forn
        WHERE ar.ar_forn > 0
    `);
    console.log(`   articoli con ar_forn>0: ${r.recordset[0].n_art_con_forn}, di cui FK valida: ${r.recordset[0].n_forn_validi}`);
    // Quanti puntano a un fornitore CHE E' QUELLO usato per gli ordini?
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT COUNT(DISTINCT ao.codart) AS n_match
        FROM attivi_ord ao
        JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=ao.codart
        WHERE ar.ar_forn = ao.conto
    `);
    console.log(`   articoli dove ar_forn = fornitore EFFETTIVO degli ordini: ${r.recordset[0].n_match}`);

    // ar_desint — descrizione interna
    console.log('\n[ARTICO.ar_desint]  descrizione interna — 5 campioni piu lunghi');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 5 ar.ar_codart, ar.ar_descr,
               LEN(LTRIM(RTRIM(ar.ar_desint))) AS len_desint, ar.ar_desint
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE LEN(LTRIM(RTRIM(ar.ar_desint))) > 0
        ORDER BY LEN(LTRIM(RTRIM(ar.ar_desint))) DESC
    `);
    r.recordset.forEach(x => {
        console.log(`   art=${x.ar_codart} descr="${trunc(x.ar_descr,40)}" len=${x.len_desint}`);
        console.log(`     desint: "${trunc(x.ar_desint, 200)}"`);
    });

    // ar_unmis — distribuzione UM
    console.log('\n[ARTICO.ar_unmis]  unita di misura — distribuzione completa');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT ar.ar_unmis AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE LEN(LTRIM(RTRIM(ar.ar_unmis)))>0
        GROUP BY ar.ar_unmis
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   um="${x.valore}"  articoli=${x.n}`));

    // ar_conver — conversione UM
    console.log('\n[ARTICO.ar_conver]  conversione UM (peso/lung. per pezzo) — TOP 15');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 15 ar.ar_conver AS valore, COUNT(*) AS n
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_conver > 0
        GROUP BY ar.ar_conver
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   conver=${String(x.valore).padStart(15)}  articoli=${x.n}`));

    // ar_codalt — codice alternativo
    console.log('\n[ARTICO.ar_codalt]  codice alternativo — 5 campioni');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 5 ar.ar_codart, ar.ar_codalt, ar.ar_descr
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE LEN(LTRIM(RTRIM(ar.ar_codalt))) > 0
    `);
    r.recordset.forEach(x => console.log(`   art=${x.ar_codart}  codalt="${x.ar_codalt}"  descr="${trunc(x.ar_descr,40)}"`));

    // ar_note — campioni del contenuto OLTRE riga 5 (gia rilevato 25.2%)
    console.log('\n[ARTICO.ar_note]  contenuto reale OLTRE riga 5 — 5 campioni piu lunghi');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT ar.ar_codart, ar.ar_descr, CAST(ar.ar_note AS VARCHAR(MAX)) AS note
        FROM art a JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=a.codart
        WHERE ar.ar_note IS NOT NULL
    `);
    const conOltre5 = [];
    for (const row of r.recordset) {
        const raw = (row.note || '').toString().replace(/\r/g,'').replace(/\u00d0/g,'\n');
        const righe = raw.split('\n');
        const dopo5 = righe.slice(5).join('\n').trim();
        if (dopo5.length > 0) {
            conOltre5.push({ codart: row.ar_codart, descr: row.ar_descr, len: dopo5.length, dopo5 });
        }
    }
    conOltre5.sort((a,b) => b.len - a.len).slice(0, 5).forEach(x => {
        console.log(`   art=${x.codart}  descr="${trunc(x.descr,35)}"  len_oltre5=${x.len}`);
        console.log(`     "${trunc(x.dopo5, 280)}"`);
    });

    // ====================================================================
    // CODARFO — coppie articolo/fornitore
    // ====================================================================
    console.log('\n');
    hr('#');
    console.log(' CODARFO  (coppie articolo-fornitore attive)');
    hr('#');

    console.log('\n[CODARFO.caf_codarfo]  codice fornitore dell articolo — 8 campioni');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 8 c.caf_conto, c.caf_codart, c.caf_codarfo, ar.ar_descr
        FROM cop p
        JOIN dbo.codarfo c ON c.codditt='UJET11' AND c.caf_conto=p.conto AND c.caf_codart=p.codart
        LEFT JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=p.codart
        WHERE LEN(LTRIM(RTRIM(c.caf_codarfo))) > 0
    `);
    r.recordset.forEach(x => console.log(`   forn=${x.caf_conto}  art=${x.caf_codart}  caf_codarfo="${x.caf_codarfo}"  (${trunc(x.ar_descr,30)})`));

    console.log('\n[CODARFO.caf_desnote]  note specifiche coppia — 6 campioni piu lunghi');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 6
            c.caf_conto, c.caf_codart, ar.ar_descr,
            LEN(CAST(c.caf_desnote AS VARCHAR(MAX))) AS len_note,
            CAST(c.caf_desnote AS VARCHAR(MAX)) AS contenuto
        FROM cop p
        JOIN dbo.codarfo c ON c.codditt='UJET11' AND c.caf_conto=p.conto AND c.caf_codart=p.codart
        LEFT JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart=p.codart
        WHERE c.caf_desnote IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(c.caf_desnote AS VARCHAR(MAX)))))>0
        ORDER BY LEN(CAST(c.caf_desnote AS VARCHAR(MAX))) DESC
    `);
    r.recordset.forEach(x => {
        console.log(`   forn=${x.caf_conto} art=${x.caf_codart} (${trunc(x.ar_descr,30)})  len=${x.len_note}`);
        console.log(`     "${trunc(x.contenuto, 280)}"`);
    });

    // Verifica se in codarfo esistono altre colonne potenzialmente interessanti
    console.log('\n[CODARFO.altre colonne] — popolamento di tutte le colonne caf_* sulle coppie attive');
    r = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME='codarfo' AND COLUMN_NAME LIKE 'caf[_]%'
        ORDER BY ORDINAL_POSITION
    `);
    const cafCols = r.recordset.filter(c => !['caf_codart','caf_conto','caf_codarfo','caf_desnote'].includes(c.COLUMN_NAME));
    if (cafCols.length === 0) console.log('   (nessun altro campo caf_*)');
    for (const col of cafCols) {
        let q;
        const isNum = ['int','decimal','numeric','smallint','tinyint','bigint','float','real','money'].includes(col.DATA_TYPE);
        const isText = ['varchar','nvarchar','char','nchar','text','ntext'].includes(col.DATA_TYPE);
        const isDate = ['date','datetime','smalldatetime','datetime2'].includes(col.DATA_TYPE);
        if (isNum) {
            q = `${CTE_POP}
                SELECT
                    SUM(CASE WHEN c.${col.COLUMN_NAME} IS NOT NULL AND c.${col.COLUMN_NAME} <> 0 THEN 1 ELSE 0 END) AS pop,
                    COUNT(*) AS tot
                FROM cop p JOIN dbo.codarfo c ON c.codditt='UJET11' AND c.caf_conto=p.conto AND c.caf_codart=p.codart`;
        } else if (isText) {
            q = `${CTE_POP}
                SELECT
                    SUM(CASE WHEN c.${col.COLUMN_NAME} IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(c.${col.COLUMN_NAME} AS VARCHAR(MAX)))))>0 THEN 1 ELSE 0 END) AS pop,
                    COUNT(*) AS tot
                FROM cop p JOIN dbo.codarfo c ON c.codditt='UJET11' AND c.caf_conto=p.conto AND c.caf_codart=p.codart`;
        } else if (isDate) {
            q = `${CTE_POP}
                SELECT
                    SUM(CASE WHEN c.${col.COLUMN_NAME} IS NOT NULL AND c.${col.COLUMN_NAME} > '1900-01-01' THEN 1 ELSE 0 END) AS pop,
                    COUNT(*) AS tot
                FROM cop p JOIN dbo.codarfo c ON c.codditt='UJET11' AND c.caf_conto=p.conto AND c.caf_codart=p.codart`;
        } else continue;
        try {
            const rr = await pool.request().query(q);
            const x = rr.recordset[0];
            const pctv = x.tot ? ((x.pop * 100) / x.tot).toFixed(1) + '%' : '-';
            const flag = x.pop > 0 ? '  *' : '';
            console.log(`   ${col.COLUMN_NAME.padEnd(20)} (${col.DATA_TYPE.padEnd(10)})  popolato=${String(x.pop).padStart(4)}/${x.tot}  ${pctv}${flag}`);
        } catch (e) {
            console.log(`   ${col.COLUMN_NAME.padEnd(20)} ERRORE: ${e.message}`);
        }
    }

    // ====================================================================
    // LISTINI — gia ben coperto, qui solo qualche dettaglio scaglioni
    // ====================================================================
    console.log('\n');
    hr('#');
    console.log(' LISTINI  (scaglioni prezzo)');
    hr('#');

    console.log('\n[LISTINI] quanti scaglioni ha in media un articolo per fornitore?');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT n_scaglioni, COUNT(*) AS n_coppie
        FROM (
            SELECT p.codart, p.conto, COUNT(*) AS n_scaglioni
            FROM cop p
            JOIN dbo.listini l ON l.codditt='UJET11' AND l.lc_codart=p.codart AND l.lc_conto=p.conto
            WHERE CAST(GETDATE() AS DATE) BETWEEN l.lc_datagg AND l.lc_datscad
              AND l.lc_codvalu=0 AND l.lc_codlavo=0
            GROUP BY p.codart, p.conto
        ) x
        GROUP BY n_scaglioni
        ORDER BY n_scaglioni
    `);
    r.recordset.forEach(x => console.log(`   ${x.n_scaglioni} scaglione/i  ->  ${x.n_coppie} coppie`));

    console.log('\n[LISTINI.lc_perqta]  prezzo per quanti pezzi — distribuzione (perqta>1 = prezzo per pacco)');
    r = await pool.request().query(`
        ${CTE_POP}
        SELECT TOP 10 l.lc_perqta AS valore, COUNT(*) AS n
        FROM cop p
        JOIN dbo.listini l ON l.codditt='UJET11' AND l.lc_codart=p.codart AND l.lc_conto=p.conto
        WHERE CAST(GETDATE() AS DATE) BETWEEN l.lc_datagg AND l.lc_datscad
        GROUP BY l.lc_perqta
        ORDER BY COUNT(*) DESC
    `);
    r.recordset.forEach(x => console.log(`   perqta=${String(x.valore).padStart(8)}  righe=${x.n}`));

    hr('=');
    console.log(' FINE — adesso compongo la tabella riassuntiva nel report finale');
    hr('=');

    await pool.close();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); process.exit(1); });
