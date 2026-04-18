// Smoke test del nuovo Anti-Corruption Layer lib/bcube
// Verifica:
//  1) Cache _Politica caricata (5 codici F/G/M/N/O)
//  2) Articolo 0010862 (caso "G nudo") ora ha politica leggibile + nome composto
//  3) politicaDisplay() drop-in replacement della vecchia helpers.getPoliticaRiordino()
//     restituisce stringhe diverse e CORRETTE rispetto alla vecchia mappa
const { getPoolITT } = require('./config/db.js');
const sql = require('mssql');
const bcube = require('./lib/bcube');

(async () => {
    const pool = await getPoolITT();

    // 1) Bootstrap cache
    console.log('\n=== [1] Bootstrap cache _Politica ===');
    const polMap = await bcube.politica.loadPolitica(pool);
    console.log(`Codici caricati: ${[...polMap.keys()].join(', ')}`);
    for (const [code, row] of polMap) {
        console.log(`  ${code} -> "${row.politica}" (${row.pol}, ${row.tipoPol})`);
    }

    // 2) Articolo 0010862 - il caso che ha aperto tutto questo
    console.log('\n=== [2] Articolo 0010862 (caso "G nudo") ===');
    const art = await bcube.articolo.findByCodart(pool, '0010862', sql);
    if (!art) {
        console.log('  ARTICOLO NON TROVATO (skip)');
    } else {
        console.log('  codart       :', art.codart);
        console.log('  descr (1a)   :', JSON.stringify(art.descr));
        console.log('  desint (2a)  :', JSON.stringify(art.desint));
        console.log('  NOME canonico:', JSON.stringify(art.nome));
        console.log('  unmis        :', art.unmis);
        console.log('  fornitore    :', art.fornitore);
        console.log('  fornitore2   :', art.fornitoreSecondario);
        console.log('  politica:');
        console.log('    codice    :', art.politica.codice);
        console.log('    nome      :', art.politica.nome);
        console.log('    mode      :', art.politica.mode);
        console.log('    categoria :', art.politica.categoria);
        console.log('    descr UI  :', art.politica.descr);
    }

    // 3) Test drop-in vs vecchia logica per i 5 codici di _Politica
    console.log('\n=== [3] politicaDisplay - tutti i 5 codici ===');
    const samples = [
        { ar_polriord: 'F', ar_desint: 'qualcosa', ar_scomin: 0, ar_minord: 0, ar_rrfence: 0 },
        { ar_polriord: 'G', ar_desint: 'PER STAMPA LASER', ar_scomin: 0, ar_minord: 0, ar_rrfence: 0 },
        { ar_polriord: 'M', ar_desint: '', ar_scomin: 100, ar_minord: 50, ar_rrfence: 30 },
        { ar_polriord: 'N', ar_desint: '', ar_scomin: 5, ar_minord: 0, ar_rrfence: 0 },
        { ar_polriord: 'O', ar_desint: '', ar_scomin: 10, ar_minord: 5, ar_rrfence: 14 },
        { ar_polriord: 'XX', ar_desint: '', ar_scomin: 0, ar_minord: 0, ar_rrfence: 0 }, // sconosciuto
        { ar_polriord: '',   ar_desint: '', ar_scomin: 0, ar_minord: 0, ar_rrfence: 0 }, // vuoto
    ];
    for (const s of samples) {
        const out = bcube.articolo.politicaDisplay(s);
        console.log(`  '${s.ar_polriord || '(vuoto)'}' -> "${out}"`);
    }

    // 4) Confronto col vecchio comportamento per evidenziare le correzioni
    console.log('\n=== [4] CONFRONTO vecchio vs nuovo (helpers.getPoliticaRiordino) ===');
    const vecchiaMappa = { 'M': 'a punto di riordino', 'F': 'fabbisogno puro', 'L': 'a lotto fisso', 'N': 'nessuna politica' };
    const polLabelArt = { G: 'A fabbisogno', M: 'Manuale', F: 'Lotto fisso', O: 'On-demand' };
    for (const code of ['F', 'G', 'M', 'N', 'O']) {
        const vecchio = vecchiaMappa[code] || code;
        const inlineArt = polLabelArt[code] || '';
        const nuovo = bcube.articolo.politicaDisplay({ ar_polriord: code });
        const cambio = (vecchio !== nuovo || inlineArt !== nuovo) ? '*** CORRETTO ***' : 'identico';
        console.log(`  ${code}: helpers.js="${vecchio}"  articoli.js.polLabel="${inlineArt}"  ACL="${nuovo}"  ${cambio}`);
    }

    // 5) Test composizione nome
    console.log('\n=== [5] composeNome (descr + desint) ===');
    const cases = [
        ['FOGLIO A4', 'PER STAMPA LASER'],
        ['BULLONE M8', ''],
        ['', 'SOLO DESINT'],
        [null, null],
    ];
    for (const [d, di] of cases) {
        const out = bcube.articolo.composeNome(d, di);
        console.log(`  descr=${JSON.stringify(d)} + desint=${JSON.stringify(di)} -> ${JSON.stringify(out)}`);
    }

    await pool.close();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); process.exit(1); });
