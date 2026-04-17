// Mappatura conoscenza distribuita — prospettiva ufficio acquisti
// ================================================================
// Obiettivo: mappare "dove vive" l'informazione operativa per gli articoli
// che effettivamente acquistiamo (ultimi 12 mesi), non per l'anagrafica secca.
//
// Popolazione:
//   - fornitori attivi: quelli a cui abbiamo emesso ordini fornitore (td_tipork='O')
//                       negli ultimi 365 giorni
//   - articoli attivi:  quelli presenti in movord di quegli ordini
//   - coppie attive:    distinct (fornitore, articolo) degli ordini suddetti
//
// Poi su questa popolazione conta il popolamento dei campi operativi:
//   artico:  ar_minord, ar_scomin, ar_scomax, ar_rrfence, ar_polriord,
//            ar_desint, ar_note (totale + righe >5), ar_forn, ar_forn2,
//            ar_approv, ar_sottolotto/lottomax, ar_ggantic/ggpost/ggraggr,
//            ar_perraggr, ar_fattlt, ar_ripfor, ar_mrp
//   anagra:  an_note, an_note2, an_listino, an_pagamento, an_porto, an_vettore
//   codarfo: righe per coppie attive, caf_codarfo, caf_desnote
//   listini: coppie attive con almeno un record valido oggi
//
// L'obiettivo del report e' guidare la decisione di quali campi DB merita
// strutturare in tabelle nostre (GB2).

const { getPoolITT } = require('./config/db.js');

(async () => {
    const pool = await getPoolITT();
    const pct = (n, t) => t ? ((n * 100) / t).toFixed(1) + '%' : '-';
    const hr = () => console.log('-'.repeat(72));

    // --------------------------------------------------------------------
    // STEP 0: schema discovery — quali colonne esistono davvero in artico/anagra
    // --------------------------------------------------------------------
    console.log('\n=== [0] SCHEMA artico/anagra/codarfo/listini — colonne rilevanti ===\n');
    const schemaRes = await pool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME IN ('artico','anagra','codarfo','listini')
          AND (
              COLUMN_NAME LIKE 'ar[_]%' OR COLUMN_NAME LIKE 'an[_]%'
              OR COLUMN_NAME LIKE 'caf[_]%' OR COLUMN_NAME LIKE 'lc[_]%'
          )
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
    const byTable = {};
    schemaRes.recordset.forEach(r => {
        byTable[r.TABLE_NAME] = byTable[r.TABLE_NAME] || [];
        byTable[r.TABLE_NAME].push(r.COLUMN_NAME);
    });
    for (const t of ['artico','anagra','codarfo','listini']) {
        const cols = byTable[t] || [];
        console.log(`${t}  (${cols.length} colonne):`);
        for (let i = 0; i < cols.length; i += 6) {
            console.log('  ' + cols.slice(i, i + 6).join(', '));
        }
        console.log('');
    }

    // --------------------------------------------------------------------
    // STEP 1: popolazione attiva lato acquisti (ultimi 365 gg)
    // --------------------------------------------------------------------
    console.log('\n=== [1] POPOLAZIONE ATTIVA (ultimi 365 gg, td_tipork=O) ===\n');
    const popRes = await pool.request().batch(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());

        SELECT COUNT(DISTINCT td_conto) AS n_fornitori_attivi
        FROM dbo.testord
        WHERE codditt='UJET11' AND td_tipork='O' AND td_datord >= @d;

        SELECT COUNT(DISTINCT m.mo_codart) AS n_articoli_attivi
        FROM dbo.movord m
        JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
          AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
        WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d;

        SELECT COUNT(*) AS n_coppie_attive
        FROM (
            SELECT DISTINCT t.td_conto, m.mo_codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        ) x;

        SELECT COUNT(DISTINCT t.td_numord) AS n_ordini_ultimi_365gg,
               COUNT(DISTINCT CAST(t.td_datord AS DATE)) AS n_giorni_con_emissione
        FROM dbo.testord t
        WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d;
    `);
    const fornAttivi = popRes.recordsets[0][0].n_fornitori_attivi;
    const artAttivi  = popRes.recordsets[1][0].n_articoli_attivi;
    const coppieAtt  = popRes.recordsets[2][0].n_coppie_attive;
    const nOrdini    = popRes.recordsets[3][0].n_ordini_ultimi_365gg;
    const nGiorni    = popRes.recordsets[3][0].n_giorni_con_emissione;
    console.log(`  fornitori attivi (td_conto distinct): ${fornAttivi}`);
    console.log(`  articoli  attivi (mo_codart distinct): ${artAttivi}`);
    console.log(`  coppie (fornitore, articolo) distinte: ${coppieAtt}`);
    console.log(`  ordini fornitore emessi: ${nOrdini}  su ${nGiorni} giornate distinte`);

    // --------------------------------------------------------------------
    // STEP 2: popolamento campi anagra per fornitori attivi
    // --------------------------------------------------------------------
    console.log('\n=== [2] ANAGRA — popolamento su fornitori ATTIVI ===\n');
    const anagRes = await pool.request().batch(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());

        WITH f AS (
            SELECT DISTINCT td_conto AS conto
            FROM dbo.testord
            WHERE codditt='UJET11' AND td_tipork='O' AND td_datord >= @d
        )
        SELECT
            SUM(CASE WHEN a.an_note IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(a.an_note AS VARCHAR(MAX)))))>0 THEN 1 ELSE 0 END) AS an_note_popolato,
            SUM(CASE WHEN a.an_note2 IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(a.an_note2 AS VARCHAR(MAX)))))>0 THEN 1 ELSE 0 END) AS an_note2_popolato,
            SUM(CASE WHEN a.an_listino IS NOT NULL AND a.an_listino > 0 THEN 1 ELSE 0 END) AS an_listino_popolato,
            SUM(CASE WHEN a.an_codpag IS NOT NULL AND a.an_codpag > 0 THEN 1 ELSE 0 END) AS an_pagamento_popolato,
            SUM(CASE WHEN a.an_porto IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_porto)))>0 THEN 1 ELSE 0 END) AS an_porto_popolato,
            SUM(CASE WHEN a.an_vett IS NOT NULL AND a.an_vett > 0 THEN 1 ELSE 0 END) AS an_vettore_popolato,
            SUM(CASE WHEN a.an_email IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_email)))>0 THEN 1 ELSE 0 END) AS an_email_popolato,
            COUNT(*) AS n_fornitori_join
        FROM f
        JOIN dbo.anagra a ON a.an_conto = f.conto;
    `);
    const a = anagRes.recordsets[0][0];
    console.log(`  totale fornitori attivi trovati in anagra: ${a.n_fornitori_join}`);
    console.log(`  an_note popolato      : ${a.an_note_popolato} (${pct(a.an_note_popolato, a.n_fornitori_join)})`);
    console.log(`  an_note2 popolato     : ${a.an_note2_popolato} (${pct(a.an_note2_popolato, a.n_fornitori_join)})`);
    console.log(`  an_listino > 0        : ${a.an_listino_popolato} (${pct(a.an_listino_popolato, a.n_fornitori_join)})`);
    console.log(`  an_codpaga > 0        : ${a.an_pagamento_popolato} (${pct(a.an_pagamento_popolato, a.n_fornitori_join)})`);
    console.log(`  an_porto popolato     : ${a.an_porto_popolato} (${pct(a.an_porto_popolato, a.n_fornitori_join)})`);
    console.log(`  an_vettor > 0         : ${a.an_vettore_popolato} (${pct(a.an_vettore_popolato, a.n_fornitori_join)})`);
    console.log(`  an_email popolato     : ${a.an_email_popolato} (${pct(a.an_email_popolato, a.n_fornitori_join)})`);

    // --------------------------------------------------------------------
    // STEP 3: popolamento campi artico per articoli attivi
    // --------------------------------------------------------------------
    console.log('\n=== [3] ARTICO — popolamento su articoli ATTIVI ===\n');
    const artRes = await pool.request().batch(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());

        WITH aa AS (
            SELECT DISTINCT m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        )
        SELECT
            COUNT(*) AS n_art_join,
            SUM(CASE WHEN ar.ar_minord IS NOT NULL AND ar.ar_minord > 0 THEN 1 ELSE 0 END) AS ar_minord_popolato,
            SUM(CASE WHEN ar.ar_scomin IS NOT NULL AND ar.ar_scomin > 0 THEN 1 ELSE 0 END) AS ar_scomin_popolato,
            SUM(CASE WHEN ar.ar_scomax IS NOT NULL AND ar.ar_scomax > 0 THEN 1 ELSE 0 END) AS ar_scomax_popolato,
            SUM(CASE WHEN ar.ar_sublotto IS NOT NULL AND ar.ar_sublotto > 0 THEN 1 ELSE 0 END) AS ar_sublotto_popolato,
            SUM(CASE WHEN ar.ar_maxlotto IS NOT NULL AND ar.ar_maxlotto > 0 THEN 1 ELSE 0 END) AS ar_maxlotto_popolato,
            SUM(CASE WHEN ar.ar_rrfence IS NOT NULL AND ar.ar_rrfence > 0 THEN 1 ELSE 0 END) AS ar_rrfence_popolato,
            SUM(CASE WHEN ar.ar_fpfence IS NOT NULL AND ar.ar_fpfence > 0 THEN 1 ELSE 0 END) AS ar_fpfence_popolato,
            SUM(CASE WHEN ar.ar_ggant IS NOT NULL AND ar.ar_ggant > 0 THEN 1 ELSE 0 END) AS ar_ggant_popolato,
            SUM(CASE WHEN ar.ar_ggpost IS NOT NULL AND ar.ar_ggpost > 0 THEN 1 ELSE 0 END) AS ar_ggpost_popolato,
            SUM(CASE WHEN ar.ar_ggragg IS NOT NULL AND ar.ar_ggragg > 0 THEN 1 ELSE 0 END) AS ar_ggragg_popolato,
            SUM(CASE WHEN ar.ar_perragg IS NOT NULL AND LEN(LTRIM(RTRIM(ar.ar_perragg)))>0 THEN 1 ELSE 0 END) AS ar_perragg_popolato,
            SUM(CASE WHEN ar.ar_fcorrlt IS NOT NULL AND ar.ar_fcorrlt <> 0 THEN 1 ELSE 0 END) AS ar_fcorrlt_popolato,
            SUM(CASE WHEN ar.ar_polriord IS NOT NULL AND LEN(LTRIM(RTRIM(ar.ar_polriord)))>0 THEN 1 ELSE 0 END) AS ar_polriord_popolato,
            SUM(CASE WHEN ar.ar_desint IS NOT NULL AND LEN(LTRIM(RTRIM(ar.ar_desint)))>0 THEN 1 ELSE 0 END) AS ar_desint_popolato,
            SUM(CASE WHEN ar.ar_forn IS NOT NULL AND ar.ar_forn > 0 THEN 1 ELSE 0 END) AS ar_forn_popolato,
            SUM(CASE WHEN ar.ar_forn2 IS NOT NULL AND ar.ar_forn2 > 0 THEN 1 ELSE 0 END) AS ar_forn2_popolato,
            SUM(CASE WHEN ar.ar_codappr IS NOT NULL AND ar.ar_codappr > 0 THEN 1 ELSE 0 END) AS ar_codappr_popolato,
            SUM(CASE WHEN ar.ar_ripriord IS NOT NULL AND ar.ar_ripriord IN ('S','1','Y','X') THEN 1 ELSE 0 END) AS ar_ripriord_popolato,
            SUM(CASE WHEN ar.ar_consmrp IS NOT NULL AND ar.ar_consmrp IN ('S','1','Y','X') THEN 1 ELSE 0 END) AS ar_consmrp_popolato,
            SUM(CASE WHEN ar.ar_note IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(ar.ar_note AS VARCHAR(MAX)))))>0 THEN 1 ELSE 0 END) AS ar_note_popolato,
            SUM(CASE WHEN ar.ar_unmis IS NOT NULL AND LEN(LTRIM(RTRIM(ar.ar_unmis)))>0 THEN 1 ELSE 0 END) AS ar_unmis_popolato,
            SUM(CASE WHEN ar.ar_conver IS NOT NULL AND ar.ar_conver > 0 THEN 1 ELSE 0 END) AS ar_conver_popolato,
            SUM(CASE WHEN ar.ar_codalt IS NOT NULL AND LEN(LTRIM(RTRIM(ar.ar_codalt)))>0 THEN 1 ELSE 0 END) AS ar_codalt_popolato
        FROM aa
        JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart = aa.codart;
    `);
    const ar = artRes.recordsets[0][0];
    console.log(`  articoli attivi trovati in artico: ${ar.n_art_join}\n`);
    console.log(`  -- politica e forecast --`);
    console.log(`  ar_polriord (pol. riord.): ${ar.ar_polriord_popolato} (${pct(ar.ar_polriord_popolato, ar.n_art_join)})`);
    console.log(`  ar_consmrp (considera MRP): ${ar.ar_consmrp_popolato} (${pct(ar.ar_consmrp_popolato, ar.n_art_join)})`);
    console.log(`  -- quantita/lotto --`);
    console.log(`  ar_minord > 0 (Qta Lotto): ${ar.ar_minord_popolato} (${pct(ar.ar_minord_popolato, ar.n_art_join)})`);
    console.log(`  ar_scomin > 0            : ${ar.ar_scomin_popolato} (${pct(ar.ar_scomin_popolato, ar.n_art_join)})`);
    console.log(`  ar_scomax > 0            : ${ar.ar_scomax_popolato} (${pct(ar.ar_scomax_popolato, ar.n_art_join)})`);
    console.log(`  ar_sublotto > 0          : ${ar.ar_sublotto_popolato} (${pct(ar.ar_sublotto_popolato, ar.n_art_join)})`);
    console.log(`  ar_maxlotto > 0          : ${ar.ar_maxlotto_popolato} (${pct(ar.ar_maxlotto_popolato, ar.n_art_join)})`);
    console.log(`  -- tempi --`);
    console.log(`  ar_rrfence > 0 (RR)      : ${ar.ar_rrfence_popolato} (${pct(ar.ar_rrfence_popolato, ar.n_art_join)})`);
    console.log(`  ar_fpfence > 0 (FP)      : ${ar.ar_fpfence_popolato} (${pct(ar.ar_fpfence_popolato, ar.n_art_join)})`);
    console.log(`  ar_ggant > 0  (anticipo) : ${ar.ar_ggant_popolato} (${pct(ar.ar_ggant_popolato, ar.n_art_join)})`);
    console.log(`  ar_ggpost > 0 (posticipo): ${ar.ar_ggpost_popolato} (${pct(ar.ar_ggpost_popolato, ar.n_art_join)})`);
    console.log(`  ar_ggragg > 0 (gg ragg.) : ${ar.ar_ggragg_popolato} (${pct(ar.ar_ggragg_popolato, ar.n_art_join)})`);
    console.log(`  ar_perragg (per. ragg.)  : ${ar.ar_perragg_popolato} (${pct(ar.ar_perragg_popolato, ar.n_art_join)})`);
    console.log(`  ar_fcorrlt (fatt.corr.LT): ${ar.ar_fcorrlt_popolato} (${pct(ar.ar_fcorrlt_popolato, ar.n_art_join)})`);
    console.log(`  -- fornitori e approvv. --`);
    console.log(`  ar_forn > 0  (forn. 1)   : ${ar.ar_forn_popolato} (${pct(ar.ar_forn_popolato, ar.n_art_join)})`);
    console.log(`  ar_forn2 > 0 (forn. 2)   : ${ar.ar_forn2_popolato} (${pct(ar.ar_forn2_popolato, ar.n_art_join)})`);
    console.log(`  ar_codappr (approvv.)    : ${ar.ar_codappr_popolato} (${pct(ar.ar_codappr_popolato, ar.n_art_join)})`);
    console.log(`  ar_ripriord (ripart.)    : ${ar.ar_ripriord_popolato} (${pct(ar.ar_ripriord_popolato, ar.n_art_join)})`);
    console.log(`  -- descrittivi/altro --`);
    console.log(`  ar_desint popolato       : ${ar.ar_desint_popolato} (${pct(ar.ar_desint_popolato, ar.n_art_join)})`);
    console.log(`  ar_note (TOTALE)         : ${ar.ar_note_popolato} (${pct(ar.ar_note_popolato, ar.n_art_join)})`);
    console.log(`  ar_unmis popolato        : ${ar.ar_unmis_popolato} (${pct(ar.ar_unmis_popolato, ar.n_art_join)})`);
    console.log(`  ar_conver > 0 (conv. UM) : ${ar.ar_conver_popolato} (${pct(ar.ar_conver_popolato, ar.n_art_join)})`);
    console.log(`  ar_codalt popolato       : ${ar.ar_codalt_popolato} (${pct(ar.ar_codalt_popolato, ar.n_art_join)})`);

    // --------------------------------------------------------------------
    // STEP 3b: ar_note — articoli con contenuto oltre riga 5
    // --------------------------------------------------------------------
    console.log('\n=== [3b] ar_note — quanti articoli ATTIVI con contenuto DOPO riga 5 ===\n');
    const noteRes = await pool.request().query(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH aa AS (
            SELECT DISTINCT m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        )
        SELECT ar.ar_codart, CAST(ar.ar_note AS VARCHAR(MAX)) AS note
        FROM aa
        JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart = aa.codart
        WHERE ar.ar_note IS NOT NULL
    `);
    let nTot=0, nConNote=0, nOltre5=0, nSoloDopo5=0;
    const campioni = [];
    for (const row of noteRes.recordset) {
        nTot++;
        const raw = (row.note || '').toString().replace(/\r/g,'').replace(/\u00d0/g,'');
        if (!raw.trim()) continue;
        nConNote++;
        const righe = raw.split('\n');
        const prime5 = righe.slice(0, 5).join('\n').trim();
        const dopo5  = righe.slice(5).join('\n').trim();
        if (dopo5.length > 0) {
            nOltre5++;
            if (!prime5) nSoloDopo5++;
            if (campioni.length < 4) campioni.push({
                codart: row.ar_codart,
                righe_tot: righe.length,
                primeHead: prime5.slice(0, 80),
                dopo5Head: dopo5.slice(0, 120)
            });
        }
    }
    console.log(`  articoli attivi con ar_note non vuoto (post-clean): ${nConNote}`);
    console.log(`  di cui con CONTENUTO oltre riga 5:                   ${nOltre5} (${pct(nOltre5, nConNote)})`);
    console.log(`  di cui con SOLO info dopo riga 5 (nulla ai fornit.): ${nSoloDopo5} (${pct(nSoloDopo5, nConNote)})`);
    if (campioni.length) {
        console.log('\n  Campioni (primo contenuto oltre riga 5):');
        campioni.forEach(c => {
            console.log(`   - codart=${c.codart} righe=${c.righe_tot}`);
            console.log(`       righe1-5: "${c.primeHead}"`);
            console.log(`       oltre 5: "${c.dopo5Head}"`);
        });
    }

    // --------------------------------------------------------------------
    // STEP 4: codarfo — note specifiche coppia articolo-fornitore
    // --------------------------------------------------------------------
    console.log('\n=== [4] CODARFO — coppie attive con riga in codarfo ===\n');
    const cafRes = await pool.request().batch(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH cp AS (
            SELECT DISTINCT t.td_conto AS conto, m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        )
        SELECT
            COUNT(*) AS coppie_totali,
            SUM(CASE WHEN c.caf_codart IS NOT NULL THEN 1 ELSE 0 END) AS coppie_con_codarfo_row,
            SUM(CASE WHEN c.caf_codarfo IS NOT NULL AND LEN(LTRIM(RTRIM(c.caf_codarfo)))>0 THEN 1 ELSE 0 END) AS coppie_con_caf_codarfo,
            SUM(CASE WHEN c.caf_desnote IS NOT NULL AND LEN(LTRIM(RTRIM(CAST(c.caf_desnote AS VARCHAR(MAX)))))>0 THEN 1 ELSE 0 END) AS coppie_con_caf_desnote
        FROM cp
        LEFT JOIN dbo.codarfo c ON c.codditt='UJET11' AND c.caf_conto = cp.conto AND c.caf_codart = cp.codart;
    `);
    const cf = cafRes.recordsets[0][0];
    console.log(`  coppie attive totali                 : ${cf.coppie_totali}`);
    console.log(`  con riga in codarfo                  : ${cf.coppie_con_codarfo_row} (${pct(cf.coppie_con_codarfo_row, cf.coppie_totali)})`);
    console.log(`  con caf_codarfo (codice fornitore)   : ${cf.coppie_con_caf_codarfo} (${pct(cf.coppie_con_caf_codarfo, cf.coppie_totali)})`);
    console.log(`  con caf_desnote (note coppia)        : ${cf.coppie_con_caf_desnote} (${pct(cf.coppie_con_caf_desnote, cf.coppie_totali)})`);

    // --------------------------------------------------------------------
    // STEP 5: listini — scaglioni prezzo
    // --------------------------------------------------------------------
    console.log('\n=== [5] LISTINI — copertura su coppie attive ===\n');
    const lisRes = await pool.request().batch(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH cp AS (
            SELECT DISTINCT t.td_conto AS conto, m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        ),
        lis_f AS (
            SELECT DISTINCT l.lc_codart AS codart, l.lc_conto AS conto
            FROM dbo.listini l
            WHERE l.codditt='UJET11' AND l.lc_conto > 0
              AND CAST(GETDATE() AS DATE) BETWEEN l.lc_datagg AND l.lc_datscad
        ),
        lis_g AS (
            SELECT DISTINCT l.lc_codart AS codart, l.lc_listino AS n_list
            FROM dbo.listini l
            WHERE l.codditt='UJET11' AND l.lc_conto = 0 AND l.lc_listino > 0
              AND CAST(GETDATE() AS DATE) BETWEEN l.lc_datagg AND l.lc_datscad
        )
        SELECT
            (SELECT COUNT(*) FROM cp) AS coppie_attive,
            (SELECT COUNT(*) FROM cp c WHERE EXISTS (SELECT 1 FROM lis_f lf WHERE lf.codart=c.codart AND lf.conto=c.conto)) AS coppie_con_prezzo_fornitore_specifico,
            (SELECT COUNT(DISTINCT c.codart) FROM cp c WHERE EXISTS (SELECT 1 FROM lis_g lg WHERE lg.codart=c.codart)) AS articoli_con_listino_generico;
    `);
    const li = lisRes.recordsets[0][0];
    console.log(`  coppie attive                        : ${li.coppie_attive}`);
    console.log(`  coppie con prezzo specifico fornit.  : ${li.coppie_con_prezzo_fornitore_specifico} (${pct(li.coppie_con_prezzo_fornitore_specifico, li.coppie_attive)})`);
    console.log(`  articoli con listino generico valido : ${li.articoli_con_listino_generico} (${pct(li.articoli_con_listino_generico, artAttivi)} dei ${artAttivi} articoli attivi)`);

    // --------------------------------------------------------------------
    // STEP 6: distribuzione ar_polriord
    // --------------------------------------------------------------------
    console.log('\n=== [6] ar_polriord — distribuzione su articoli attivi ===\n');
    const polRes = await pool.request().query(`
        DECLARE @d DATE = DATEADD(day, -365, GETDATE());
        WITH aa AS (
            SELECT DISTINCT m.mo_codart AS codart
            FROM dbo.movord m
            JOIN dbo.testord t ON m.codditt=t.codditt AND m.mo_tipork=t.td_tipork
              AND m.mo_anno=t.td_anno AND m.mo_serie=t.td_serie AND m.mo_numord=t.td_numord
            WHERE t.codditt='UJET11' AND t.td_tipork='O' AND t.td_datord >= @d
        )
        SELECT ISNULL(NULLIF(LTRIM(RTRIM(ar.ar_polriord)),''), '(vuoto)') AS politica,
               COUNT(*) AS n
        FROM aa
        JOIN dbo.artico ar ON ar.codditt='UJET11' AND ar.ar_codart = aa.codart
        GROUP BY ar.ar_polriord
        ORDER BY COUNT(*) DESC
    `);
    polRes.recordset.forEach(p => {
        console.log(`  ${p.politica.padEnd(15)} ${p.n.toString().padStart(6)} (${pct(p.n, artAttivi)})`);
    });

    hr();
    console.log('FINE REPORT');
    await pool.close();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); process.exit(1); });
