// Investigazione conoscenza distribuita: ar_note (rige 6+) + an_note/an_note2
// Obiettivo: confermare che gli articoli/fornitori "vivi" hanno questi campi
// pieni di info utili (MOQ, parametri, vincoli, settaggi reparto, ecc.)
const { getPoolITT } = require('./config/db.js');

// Replica esatta della logica usata in pdfOrdine.js per splittare le righe note
function splitNoteRows(raw) {
    if (!raw) return [];
    // come in pdfOrdine: rimuovi \r e \u00d0 (Ð), poi split su \n
    const cleaned = raw.toString().replace(/\r/g, '').replace(/\u00d0/g, '');
    return cleaned.split('\n');
}

async function main() {
    const pool = await getPoolITT();

    console.log('========================================================');
    console.log(' INVESTIGAZIONE CONOSCENZA DISTRIBUITA - ar_note / an_note');
    console.log('========================================================\n');

    // ----------------------------------------------------------
    // SEZIONE A — ar_note: scopri quanti articoli "vivi" usano riga 6+
    // ----------------------------------------------------------
    console.log('--- SEZIONE A: ar_note (note articolo) ---\n');

    // A1. Quanti articoli "vivi" totali (ar_forn > 0 OR ordinato negli ultimi 18 mesi)
    let r = await pool.request().query(`
        SELECT COUNT(DISTINCT a.ar_codart) AS articoli_vivi
        FROM dbo.artico a
        WHERE a.codditt = 'UJET11'
          AND ((a.ar_forn IS NOT NULL AND a.ar_forn > 0)
               OR EXISTS (
                   SELECT 1 FROM dbo.ordlist o
                   WHERE o.codditt = 'UJET11' AND o.ol_codart = a.ar_codart
                     AND o.ol_datord >= DATEADD(month, -18, GETDATE())
               ))
    `);
    const totVivi = r.recordset[0].articoli_vivi;
    console.log(`Articoli "vivi" (con ar_forn o ordinati negli ultimi 18 mesi): ${totVivi}`);

    // A2. Di questi, quanti hanno ar_note popolato (non NULL e non solo whitespace)?
    r = await pool.request().query(`
        SELECT COUNT(DISTINCT a.ar_codart) AS con_arnote
        FROM dbo.artico a
        WHERE a.codditt = 'UJET11'
          AND a.ar_note IS NOT NULL AND LEN(LTRIM(RTRIM(a.ar_note))) > 0
          AND ((a.ar_forn IS NOT NULL AND a.ar_forn > 0)
               OR EXISTS (
                   SELECT 1 FROM dbo.ordlist o
                   WHERE o.codditt = 'UJET11' AND o.ol_codart = a.ar_codart
                     AND o.ol_datord >= DATEADD(month, -18, GETDATE())
               ))
    `);
    const conArnote = r.recordset[0].con_arnote;
    console.log(`Di cui con ar_note popolato: ${conArnote}  (${(conArnote*100/totVivi).toFixed(1)}%)`);

    // A3. Distribuzione del NUMERO di righe nel campo ar_note (per i vivi)
    //     Lo facciamo lato JS perché lo split deve replicare la logica PDF
    console.log('\nDistribuzione righe nel campo ar_note (articoli vivi):');
    r = await pool.request().query(`
        SELECT a.ar_codart, a.ar_note
        FROM dbo.artico a
        WHERE a.codditt = 'UJET11'
          AND a.ar_note IS NOT NULL AND LEN(LTRIM(RTRIM(a.ar_note))) > 0
          AND ((a.ar_forn IS NOT NULL AND a.ar_forn > 0)
               OR EXISTS (
                   SELECT 1 FROM dbo.ordlist o
                   WHERE o.codditt = 'UJET11' AND o.ol_codart = a.ar_codart
                     AND o.ol_datord >= DATEADD(month, -18, GETDATE())
               ))
    `);
    const buckets = { '1': 0, '2-3': 0, '4-5': 0, '6-10': 0, '11-20': 0, '21+': 0 };
    let conRiga6Plus = 0;
    let totalRows = 0;
    let maxRows = 0;
    let articoliRiga6Plus = []; // sample
    for (const row of r.recordset) {
        const lines = splitNoteRows(row.ar_note);
        // togli righe completamente vuote SOLO ai bordi (per non distorcere)
        // ma manteniamo righe vuote interne — sono parte del layout
        // Conta righe "non whitespace" totali
        const nonEmpty = lines.filter(l => l.trim().length > 0).length;
        if (nonEmpty === 0) continue;
        totalRows++;
        if (lines.length > maxRows) maxRows = lines.length;
        // bucket per numero di righe LOGICHE (lines.length, incluse vuote)
        const n = lines.length;
        if (n === 1) buckets['1']++;
        else if (n <= 3) buckets['2-3']++;
        else if (n <= 5) buckets['4-5']++;
        else if (n <= 10) buckets['6-10']++;
        else if (n <= 20) buckets['11-20']++;
        else buckets['21+']++;
        // ha contenuto reale alla riga 6 o oltre?
        let hasRow6Content = false;
        for (let i = 5; i < lines.length; i++) {
            if (lines[i].trim().length > 0) { hasRow6Content = true; break; }
        }
        if (hasRow6Content) {
            conRiga6Plus++;
            if (articoliRiga6Plus.length < 10) {
                articoliRiga6Plus.push({ codart: row.ar_codart, note: row.ar_note });
            }
        }
    }
    console.log(`  Articoli analizzati: ${totalRows} (max ${maxRows} righe)`);
    for (const [k, v] of Object.entries(buckets)) {
        console.log(`    ${k.padStart(6)} righe: ${String(v).padStart(5)}  (${(v*100/totalRows).toFixed(1)}%)`);
    }
    console.log(`\n  >>> Articoli vivi con CONTENUTO reale alla riga 6+: ${conRiga6Plus}  (${(conRiga6Plus*100/totalRows).toFixed(1)}% degli articoli con note)`);

    // A4. CAMPIONI: 10 articoli vivi con riga 6+ piena di contenuto
    console.log('\n--- CAMPIONI ar_note con contenuto interno (righe 6+) ---');
    for (const s of articoliRiga6Plus) {
        const lines = splitNoteRows(s.note);
        console.log(`\n[${s.codart}]  (${lines.length} righe)`);
        lines.forEach((l, i) => {
            const marker = (i < 5) ? '  PUB' : ' INT*';
            console.log(`  ${marker} ${String(i+1).padStart(2)}: ${l}`);
        });
    }

    // ----------------------------------------------------------
    // SEZIONE B — an_note / an_note2: note fornitori
    // ----------------------------------------------------------
    console.log('\n\n--- SEZIONE B: an_note / an_note2 (note fornitore) ---\n');

    // B1. Fornitori "vivi" = quelli con almeno un ordlist o riferiti da artico.ar_forn
    r = await pool.request().query(`
        SELECT COUNT(*) AS forn_vivi
        FROM dbo.anagra a
        WHERE a.codditt = 'UJET11'
          AND (
              EXISTS (SELECT 1 FROM dbo.artico ar WHERE ar.codditt='UJET11' AND ar.ar_forn = a.an_conto)
              OR EXISTS (
                  SELECT 1 FROM dbo.ordlist o
                  WHERE o.codditt='UJET11' AND o.ol_conto = a.an_conto
                    AND o.ol_datord >= DATEADD(month, -18, GETDATE())
              )
          )
    `);
    const fornVivi = r.recordset[0].forn_vivi;
    console.log(`Fornitori "vivi" (riferiti da ar_forn o con ordini ultimi 18 mesi): ${fornVivi}`);

    r = await pool.request().query(`
        SELECT
            SUM(CASE WHEN a.an_note  IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_note)))  > 0 THEN 1 ELSE 0 END) AS con_note1,
            SUM(CASE WHEN a.an_note2 IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_note2))) > 0 THEN 1 ELSE 0 END) AS con_note2
        FROM dbo.anagra a
        WHERE a.codditt = 'UJET11'
          AND (
              EXISTS (SELECT 1 FROM dbo.artico ar WHERE ar.codditt='UJET11' AND ar.ar_forn = a.an_conto)
              OR EXISTS (
                  SELECT 1 FROM dbo.ordlist o
                  WHERE o.codditt='UJET11' AND o.ol_conto = a.an_conto
                    AND o.ol_datord >= DATEADD(month, -18, GETDATE())
              )
          )
    `);
    const cn1 = r.recordset[0].con_note1, cn2 = r.recordset[0].con_note2;
    console.log(`Di cui con an_note  popolato: ${cn1}  (${(cn1*100/fornVivi).toFixed(1)}%)`);
    console.log(`Di cui con an_note2 popolato: ${cn2}  (${(cn2*100/fornVivi).toFixed(1)}%)`);

    // B2. CAMPIONI: 10 fornitori vivi con an_note/an_note2 popolato
    r = await pool.request().query(`
        SELECT TOP 15 a.an_conto, a.an_descr1, a.an_note, a.an_note2
        FROM dbo.anagra a
        WHERE a.codditt = 'UJET11'
          AND ((a.an_note IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_note))) > 0)
               OR (a.an_note2 IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_note2))) > 0))
          AND EXISTS (
              SELECT 1 FROM dbo.ordlist o
              WHERE o.codditt='UJET11' AND o.ol_conto = a.an_conto
                AND o.ol_datord >= DATEADD(month, -18, GETDATE())
          )
        ORDER BY a.an_conto
    `);
    console.log(`\n--- CAMPIONI an_note / an_note2 (fornitori vivi, ${r.recordset.length} esempi) ---`);
    for (const f of r.recordset) {
        console.log(`\n[${f.an_conto}] ${(f.an_descr1||'').trim()}`);
        if (f.an_note && f.an_note.trim()) {
            console.log('  an_note:');
            splitNoteRows(f.an_note).forEach((l,i)=>console.log(`    ${String(i+1).padStart(2)}: ${l}`));
        }
        if (f.an_note2 && f.an_note2.trim()) {
            console.log('  an_note2:');
            splitNoteRows(f.an_note2).forEach((l,i)=>console.log(`    ${String(i+1).padStart(2)}: ${l}`));
        }
    }

    // ----------------------------------------------------------
    // SEZIONE C — Lunghezza media e statistiche di ricchezza
    // ----------------------------------------------------------
    console.log('\n\n--- SEZIONE C: ricchezza media (lunghezza char) ---\n');
    r = await pool.request().query(`
        SELECT
            AVG(CAST(LEN(a.ar_note) AS FLOAT)) AS avg_len,
            MAX(LEN(a.ar_note)) AS max_len
        FROM dbo.artico a
        WHERE a.codditt='UJET11'
          AND a.ar_note IS NOT NULL AND LEN(LTRIM(RTRIM(a.ar_note))) > 0
          AND ((a.ar_forn IS NOT NULL AND a.ar_forn > 0)
               OR EXISTS (SELECT 1 FROM dbo.ordlist o WHERE o.codditt='UJET11' AND o.ol_codart = a.ar_codart AND o.ol_datord >= DATEADD(month, -18, GETDATE())))
    `);
    console.log(`ar_note  — lunghezza media: ${Math.round(r.recordset[0].avg_len)} char, max: ${r.recordset[0].max_len}`);

    r = await pool.request().query(`
        SELECT
            AVG(CAST(LEN(a.an_note) AS FLOAT)) AS avg_len1,
            MAX(LEN(a.an_note)) AS max_len1,
            AVG(CAST(LEN(a.an_note2) AS FLOAT)) AS avg_len2,
            MAX(LEN(a.an_note2)) AS max_len2
        FROM dbo.anagra a
        WHERE a.codditt='UJET11'
          AND ((a.an_note IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_note))) > 0)
               OR (a.an_note2 IS NOT NULL AND LEN(LTRIM(RTRIM(a.an_note2))) > 0))
    `);
    const c = r.recordset[0];
    console.log(`an_note  — lunghezza media: ${Math.round(c.avg_len1||0)} char, max: ${c.max_len1||0}`);
    console.log(`an_note2 — lunghezza media: ${Math.round(c.avg_len2||0)} char, max: ${c.max_len2||0}`);

    console.log('\n\n========== FINE INVESTIGAZIONE ==========');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
