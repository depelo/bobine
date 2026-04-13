/**
 * GB2 Routes — Ricerca articoli + progressivi + caricaMRP
 */
module.exports = function(router, deps) {
    const { sql, getPoolDest, getPool163, getActiveProfile,
            PRODUCTION_PROFILE, authMiddleware } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const getPoliticaRiordino = helpers.getPoliticaRiordino;

router.get('/articoli/search', authMiddleware, async (req, res) => {
    try {
        const { q, field } = req.query; // field: 'codart' | 'codalt' | 'descr'
        const pool = await getPoolDest(getUserId(req));

        let where = '';
        if (q && q.trim()) {
            const term = q.trim();
            if (field === 'codart') {
                where = `WHERE a.ar_codart LIKE @term + '%'`;
            } else if (field === 'codalt') {
                where = `WHERE a.ar_codalt LIKE '%' + @term + '%'`;
            } else {
                where = `WHERE a.ar_descr LIKE '%' + @term + '%'`;
            }
        }

        const result = await pool.request()
            .input('term', sql.NVarChar, q ? q.trim() : '')
            .query(`
                SELECT TOP 50
                    a.ar_codart,
                    a.ar_codalt,
                    a.ar_descr,
                    a.ar_tipo,
                    a.ar_desint
                FROM dbo.artico a
                ${where}
                ORDER BY a.ar_descr
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ricerca articoli:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 2: FASI DI UN ARTICOLO (per la combo Fase)
// Traduzione della Sub load_fasi() VBA in frmParRMP
// ============================================================
router.get('/articoli/:codart/fasi', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolDest(getUserId(req));
        const result = await pool.request()
            .input('codart', sql.NVarChar, req.params.codart)
            .query(`
                SELECT af_codart, af_fase, af_descr
                FROM dbo.artfasi
                WHERE af_codart = @codart
                ORDER BY af_fase DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore fasi articolo:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 3: MAGAZZINI DISPONIBILI (per la combo Magazzino)
// ============================================================
router.get('/magazzini', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolDest(getUserId(req));
        const result = await pool.request()
            .query(`
                SELECT tb_codmaga, tb_desmaga
                FROM dbo.tabmaga
                ORDER BY tb_codmaga
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore magazzini:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Carica righe MRP (magazzino + totali) per un singolo articolo.
 * Usata dal caricamento iniziale e dall'expand on-demand.
 */
async function caricaMRP(pool, codart, filtroMagaz, filtroFase) {
    const righe = [];

    // Costruisci i filtri SQL (condivisi tra query 1 e 3)
    let filtroSQL = '';
    let filtroOrdSQL = '';
    const magaz = filtroMagaz ? parseInt(filtroMagaz, 10) : null;
    const fase = filtroFase ? parseInt(filtroFase, 10) : null;
    if (magaz) filtroSQL += ' AND ap.ap_magaz = ' + magaz;
    if (fase) filtroSQL += ' AND ap.ap_fase = ' + fase;
    if (magaz) filtroOrdSQL += ' AND ol.ol_magaz = ' + magaz;
    if (fase) filtroOrdSQL += ' AND ol.ol_fase = ' + fase;

    // --- 3 QUERY IN PARALLELO (indipendenti) ---
    const [artproRes, emessiRes, ordRes] = await Promise.all([
        // 1) Giacenze da artpro + tabmaga + artfasi + artico
        pool.request().input('codart', sql.NVarChar, codart).query(`
            SELECT
                ap.ap_codart, ap.ap_magaz, ap.ap_fase,
                ap.ap_esist, ap.ap_prenot, ap.ap_ordin, ap.ap_impeg,
                tm.tb_desmaga AS desc_magazzino,
                COALESCE(af.af_descr, '') AS desc_fase,
                a.ar_unmis, a.ar_inesaur
            FROM dbo.artpro ap
            LEFT JOIN dbo.tabmaga tm ON ap.ap_magaz = tm.tb_codmaga
            LEFT JOIN dbo.artfasi af ON ap.ap_codart = af.af_codart AND ap.ap_fase = af.af_fase
            LEFT JOIN dbo.artico a ON ap.ap_codart = a.ar_codart
            WHERE ap.ap_codart = @codart ${filtroSQL}
            ORDER BY ap.ap_magaz, ap.ap_fase
        `),

        // 2) Emissioni dalla nostra app (ordini_emessi su MRP@163)
        (async () => {
            try {
                const poolEmessi = await getPool163();
                return await poolEmessi.request()
                    .input('codart_em', sql.NVarChar, codart)
                    .query(`
                        SELECT ol_magaz, ol_fase, SUM(quantita_ordinata) AS qta_emessa
                        FROM dbo.ordini_emessi
                        WHERE ol_codart = @codart_em
                        GROUP BY ol_magaz, ol_fase
                    `);
            } catch (_) { return { recordset: [] }; }
        })(),

        // 3) Ordini/impegni da ordlist
        pool.request().input('codart', sql.NVarChar, codart).query(`
            SELECT
                ol.ol_codart, ol.ol_magaz, ol.ol_fase,
                ol.ol_tipork, ol.ol_stato,
                MIN(ol.ol_datcons) AS min_datcons,
                SUM(CASE WHEN ol.ol_tipork IN ('H','O') AND ol.ol_stato = 'S' THEN ol.ol_quant ELSE 0 END) AS opc,
                SUM(CASE WHEN ol.ol_tipork IN ('H','O') AND ol.ol_stato <> 'S' THEN ol.ol_quant ELSE 0 END) AS op,
                SUM(CASE WHEN ol.ol_tipork = 'Y' AND ol.ol_stato = 'S' THEN ol.ol_quant ELSE 0 END) AS ipc,
                SUM(CASE WHEN ol.ol_tipork = 'Y' AND ol.ol_stato <> 'S' THEN ol.ol_quant ELSE 0 END) AS ip
            FROM dbo.ordlist ol
            WHERE ol.ol_codart = @codart
              AND ol.ol_tipork IN ('H','O','Y')
              ${filtroOrdSQL}
            GROUP BY ol.ol_codart, ol.ol_magaz, ol.ol_fase, ol.ol_tipork, ol.ol_stato, ol.ol_stasino
            ORDER BY ol.ol_magaz, ol.ol_fase, MIN(ol.ol_datcons)
        `)
    ]);

    // Mappa emissioni per chiave magaz_fase
    const emessiPerMagFase = new Map();
    for (const row of emessiRes.recordset) {
        emessiPerMagFase.set(`${row.ol_magaz}_${row.ol_fase}`, row.qta_emessa || 0);
    }

    // Arricchisci ap_ordin con le quantita emesse dalla nostra app
    for (const ap of artproRes.recordset) {
        const chiave = `${ap.ap_magaz}_${ap.ap_fase}`;
        const qtaEmessa = emessiPerMagFase.get(chiave) || 0;
        if (qtaEmessa > 0) {
            ap.ap_ordin = (ap.ap_ordin || 0) + qtaEmessa;
        }
    }

    const totaliFase = {};

    for (const ap of artproRes.recordset) {
        const ordiniMagFase = ordRes.recordset.filter(
            o => Number(o.ol_magaz) === Number(ap.ap_magaz)
                && Number(o.ol_fase) === Number(ap.ap_fase)
        );

        if (ordiniMagFase.length === 0) {
            const dispon = (ap.ap_esist || 0) + (ap.ap_ordin || 0) - (ap.ap_impeg || 0);
            righe.push({
                tipo: 'magazzino',
                primaRigaGruppo: true,
                codart: ap.ap_codart,
                magaz: ap.ap_magaz,
                fase: ap.ap_fase,
                descMagazzino: ap.desc_magazzino,
                descFase: ap.desc_fase,
                um: ap.ar_unmis || 'PZ',
                esistenza: ap.ap_esist,
                prenotato: ap.ap_prenot,
                ordinato: ap.ap_ordin,
                impegnato: ap.ap_impeg,
                disponibilita: dispon,
                mostraGiacenze: true,
                dataCons: null,
                opc: 0,
                op: 0,
                ipc: 0,
                ip: 0,
                inesaur: ap.ar_inesaur
            });
        } else {
            const disponBase = (ap.ap_esist || 0) + (ap.ap_ordin || 0) - (ap.ap_impeg || 0);
            ordiniMagFase.forEach((ord, idx) => {
                const isPrima = idx === 0;

                righe.push({
                    tipo: 'magazzino',
                    primaRigaGruppo: isPrima,
                    codart: ap.ap_codart,
                    magaz: ap.ap_magaz,
                    fase: ap.ap_fase,
                    descMagazzino: ap.desc_magazzino,
                    descFase: ap.desc_fase,
                    um: ap.ar_unmis || 'PZ',
                    esistenza: isPrima ? ap.ap_esist : null,
                    prenotato: isPrima ? ap.ap_prenot : null,
                    ordinato: isPrima ? ap.ap_ordin : null,
                    impegnato: isPrima ? ap.ap_impeg : null,
                    disponibilita: disponBase,
                    mostraGiacenze: isPrima,
                    dataCons: ord.min_datcons,
                    opc: ord.opc || 0,
                    op: ord.op || 0,
                    ipc: ord.ipc || 0,
                    ip: ord.ip || 0,
                    inesaur: ap.ar_inesaur
                });
            });
        }

        const fk = ap.ap_fase;
        if (!totaliFase[fk]) {
            totaliFase[fk] = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        }
        const t = totaliFase[fk];
        t.esistenza += (ap.ap_esist || 0);
        t.ordinato += (ap.ap_ordin || 0);
        t.impegnato += (ap.ap_impeg || 0);
        ordiniMagFase.forEach(ord => {
            t.opc += (ord.opc || 0);
            t.op += (ord.op || 0);
            t.ipc += (ord.ipc || 0);
            t.ip += (ord.ip || 0);
        });
    }

    // UM dell'articolo padre (dalla prima riga magazzino)
    const umPadre = righe.find(r => r.tipo === 'magazzino')?.um || 'PZ';

    for (const [faseKey, t] of Object.entries(totaliFase)) {
        righe.push({
            tipo: 'totale',
            codart,
            fase: parseInt(faseKey, 10),
            um: umPadre,
            esistenza: t.esistenza,
            ordinato: t.ordinato,
            impegnato: t.impegnato,
            disponibilita: t.esistenza + t.ordinato - t.impegnato,
            opc: t.opc,
            op: t.op,
            ipc: t.ipc,
            ip: t.ip
        });
    }

    const fasiDistinte = Object.keys(totaliFase);
    if (fasiDistinte.length > 1) {
        const crossTot = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        for (const t of Object.values(totaliFase)) {
            crossTot.esistenza += t.esistenza;
            crossTot.ordinato += t.ordinato;
            crossTot.impegnato += t.impegnato;
            crossTot.opc += t.opc;
            crossTot.op += t.op;
            crossTot.ipc += t.ipc;
            crossTot.ip += t.ip;
        }
        righe.push({
            tipo: 'totale-cross-fase',
            codart,
            fase: 'All',
            um: umPadre,
            esistenza: crossTot.esistenza,
            ordinato: crossTot.ordinato,
            impegnato: crossTot.impegnato,
            disponibilita: crossTot.esistenza + crossTot.ordinato - crossTot.impegnato,
            opc: crossTot.opc,
            op: crossTot.op,
            ipc: crossTot.ipc,
            ip: crossTot.ip
        });
    }

    return righe;
}

/** Una riga magazzino aggregata per (magaz, fase) -- necessario per il blocco combinato. */
function normalizzaMagazzinoPerChiave(mrpRighe) {
    const magRows = mrpRighe.filter((r) => r.tipo === 'magazzino');
    const groups = new Map();
    for (const r of magRows) {
        const key = `${Number(r.magaz)}_${Number(r.fase)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    const out = new Map();
    for (const [key, rows] of groups) {
        const first = rows[0];
        let esistenza = 0;
        let ordinato = 0;
        let impegnato = 0;
        for (const row of rows) {
            if (row.mostraGiacenze !== false && row.esistenza != null) {
                esistenza = row.esistenza || 0;
                ordinato = row.ordinato || 0;
                impegnato = row.impegnato || 0;
                break;
            }
        }
        let opc = 0;
        let op = 0;
        let ipc = 0;
        let ip = 0;
        for (const row of rows) {
            opc += row.opc || 0;
            op += row.op || 0;
            ipc += row.ipc || 0;
            ip += row.ip || 0;
        }
        const disponibilita = esistenza + ordinato - impegnato;
        out.set(key, {
            magaz: first.magaz,
            fase: first.fase,
            descMagazzino: first.descMagazzino,
            descFase: first.descFase,
            um: first.um || 'PZ',
            codart: first.codart,
            esistenza,
            ordinato,
            impegnato,
            disponibilita,
            opc,
            op,
            ipc,
            ip,
            inesaur: first.inesaur
        });
    }
    return out;
}

function sortMagFaseKeys(keys) {
    return keys.sort((a, b) => {
        const [ma, fa] = a.split('_').map(Number);
        const [mb, fb] = b.split('_').map(Number);
        if (ma !== mb) return ma - mb;
        return fa - fb;
    });
}

/**
 * Merge normalizzato esaurimento + sostitutivo -> righe magazzino + totali (stessa logica di caricaMRP).
 */
function costruisciCombinatoRighe(mapEsaur, mapSost, codEsaur, codSost) {
    const codComb = `${codSost}+${codEsaur}`;
    const allKeys = sortMagFaseKeys([...new Set([...mapEsaur.keys(), ...mapSost.keys()])]);
    const magRows = [];
    for (const key of allKeys) {
        const e = mapEsaur.get(key);
        const s = mapSost.get(key);
        const esistenza = (e?.esistenza || 0) + (s?.esistenza || 0);
        const ordinato = (e?.ordinato || 0) + (s?.ordinato || 0);
        const impegnato = (e?.impegnato || 0) + (s?.impegnato || 0);
        const opc = (e?.opc || 0) + (s?.opc || 0);
        const op = (e?.op || 0) + (s?.op || 0);
        const ipc = (e?.ipc || 0) + (s?.ipc || 0);
        const ip = (e?.ip || 0) + (s?.ip || 0);
        const disponibilita = esistenza + ordinato - impegnato;
        const src = e || s;
        magRows.push({
            tipo: 'magazzino',
            primaRigaGruppo: true,
            codart: codComb,
            magaz: src.magaz,
            fase: src.fase,
            descMagazzino: src.descMagazzino,
            descFase: src.descFase,
            um: (s || e).um || 'PZ',
            esistenza,
            ordinato,
            impegnato,
            disponibilita,
            mostraGiacenze: true,
            dataCons: null,
            opc,
            op,
            ipc,
            ip,
            inesaur: 'N',
            etichettaBlocco: 'combinato'
        });
    }

    const totaliFase = {};
    for (const row of magRows) {
        const fk = row.fase;
        if (!totaliFase[fk]) {
            totaliFase[fk] = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        }
        const t = totaliFase[fk];
        t.esistenza += row.esistenza;
        t.ordinato += row.ordinato;
        t.impegnato += row.impegnato;
        t.opc += row.opc;
        t.op += row.op;
        t.ipc += row.ipc;
        t.ip += row.ip;
    }

    const righe = [...magRows];
    const umComb = magRows[0]?.um || 'PZ';
    for (const [faseKey, t] of Object.entries(totaliFase)) {
        righe.push({
            tipo: 'totale',
            codart: codComb,
            fase: parseInt(faseKey, 10),
            um: umComb,
            esistenza: t.esistenza,
            ordinato: t.ordinato,
            impegnato: t.impegnato,
            disponibilita: t.esistenza + t.ordinato - t.impegnato,
            opc: t.opc,
            op: t.op,
            ipc: t.ipc,
            ip: t.ip,
            etichettaBlocco: 'combinato',
            labelTotale: 'In Esaur + Sostit TOTALE'
        });
    }

    const fasiDistinte = Object.keys(totaliFase);
    if (fasiDistinte.length > 1) {
        const crossTot = { esistenza: 0, ordinato: 0, impegnato: 0, opc: 0, op: 0, ipc: 0, ip: 0 };
        for (const t of Object.values(totaliFase)) {
            crossTot.esistenza += t.esistenza;
            crossTot.ordinato += t.ordinato;
            crossTot.impegnato += t.impegnato;
            crossTot.opc += t.opc;
            crossTot.op += t.op;
            crossTot.ipc += t.ipc;
            crossTot.ip += t.ip;
        }
        righe.push({
            tipo: 'totale-cross-fase',
            codart: codComb,
            fase: 'All',
            um: umComb,
            esistenza: crossTot.esistenza,
            ordinato: crossTot.ordinato,
            impegnato: crossTot.impegnato,
            disponibilita: crossTot.esistenza + crossTot.ordinato - crossTot.impegnato,
            opc: crossTot.opc,
            op: crossTot.op,
            ipc: crossTot.ipc,
            ip: crossTot.ip,
            etichettaBlocco: 'combinato',
            labelTotale: 'In Esaur + Sostit TOTALE'
        });
    }

    return righe;
}

/**
 * Dopo caricaMRP: imposta etichettaBlocco e labelTotale sulle righe (non modificare caricaMRP).
 * labelTotale su totale e totale-cross-fase: "{codart} In Esaurimento TOTALE" / "{codSost} Sostitutivo TOTALE".
 */
function taggaMrpBlocco(mrpRighe, blocco, codLabel) {
    const labelTot = blocco === 'esaurimento'
        ? `${codLabel} In Esaurimento TOTALE`
        : `${codLabel} Sostitutivo TOTALE`;
    for (const r of mrpRighe) {
        r.etichettaBlocco = blocco;
        if (r.tipo === 'totale' || r.tipo === 'totale-cross-fase') {
            r.labelTotale = labelTot;
        }
    }
}

function buildGeneraleTotaleRow(combinatoRighe) {
    const cross = combinatoRighe.find((r) => r.tipo === 'totale-cross-fase');
    let src = cross;
    if (!src) {
        const totali = combinatoRighe.filter((r) => r.tipo === 'totale');
        src = totali.length ? totali[totali.length - 1] : null;
    }
    // UM dal primo magazzino disponibile
    const umGen = combinatoRighe.find(r => r.um)?.um || 'PZ';
    if (!src) {
        return {
            tipo: 'generale-totale',
            livello: 0,
            um: umGen,
            esistenza: 0,
            ordinato: 0,
            impegnato: 0,
            disponibilita: 0,
            opc: 0,
            op: 0,
            ipc: 0,
            ip: 0
        };
    }
    return {
        tipo: 'generale-totale',
        livello: 0,
        um: src.um || umGen,
        esistenza: src.esistenza,
        ordinato: src.ordinato,
        impegnato: src.impegnato,
        disponibilita: src.disponibilita,
        opc: src.opc,
        op: src.op,
        ipc: src.ipc,
        ip: src.ip
    };
}

// ============================================================
// API 4: VISTA PROGRESSIVI -- Caricamento iniziale (solo livello 0 + figli livello 1)
// ============================================================
router.get('/progressivi', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolDest(getUserId(req));

        const artResult = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT ar_codart, ar_codalt, ar_descr, ar_tipo, ar_desint,
                       ar_polriord, ar_gesfasi, ar_ultfase, ar_scomin, ar_ggrior,
                       ar_gruppo, ar_sostit, ar_sostituito, ar_inesaur, ar_unmis
                FROM dbo.artico
                WHERE ar_codart = @codart
            `);

        if (artResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Articolo non trovato' });
        }
        const articolo = artResult.recordset[0];

        const righe = [];

        const codSostCand = String(articolo.ar_sostit || '').trim();
        const inEsaur = String(articolo.ar_inesaur || '').trim() === 'S';
        let sostitutivo = null;
        if (inEsaur && codSostCand) {
            const sostRes = await pool.request()
                .input('codart', sql.NVarChar, codSostCand)
                .query(`
                    SELECT ar_codart, ar_codalt, ar_descr, ar_tipo, ar_desint,
                           ar_polriord, ar_gesfasi, ar_ultfase, ar_scomin, ar_ggrior,
                           ar_gruppo, ar_sostit, ar_sostituito, ar_inesaur, ar_unmis
                    FROM dbo.artico
                    WHERE ar_codart = @codart
                `);
            if (sostRes.recordset.length > 0) {
                sostitutivo = sostRes.recordset[0];
            }
        }
        const vistaSostitutivo = !!sostitutivo;

        righe.push({
            tipo: 'padre',
            livello: 0,
            codart: articolo.ar_codart,
            codalt: articolo.ar_codalt,
            descr: articolo.ar_descr,
            polriord: getPoliticaRiordino(articolo),
            um: articolo.ar_unmis || 'PZ',
            inesaur: articolo.ar_inesaur,
            ...(vistaSostitutivo ? { etichettaBlocco: 'esaurimento' } : {})
        });

        let _prefetchedFigli = null;

        if (!vistaSostitutivo) {
            // caricaMRP padre e query figli in PARALLELO (indipendenti)
            const [mrpRighe, figliRes] = await Promise.all([
                caricaMRP(pool, codart, magaz, fase),
                pool.request().input('codart_figli', sql.NVarChar, codart).query(`
                    SELECT
                        d.md_coddb, d.md_riga, d.md_codfigli, d.md_fasefigli,
                        d.md_quant, d.md_unmis, d.md_quantump, d.md_ump,
                        a.ar_codalt AS figlio_codalt, a.ar_descr AS figlio_descr,
                        a.ar_polriord AS figlio_polriord, a.ar_gesfasi AS figlio_gesfasi,
                        a.ar_scomin AS figlio_scomin, a.ar_ggrior AS figlio_ggrior,
                        a.ar_desint AS figlio_desint, a.ar_inesaur AS figlio_inesaur,
                        a.ar_unmis AS figlio_unmis,
                        CASE WHEN EXISTS (
                            SELECT 1 FROM dbo.movdis sub WHERE sub.md_coddb = d.md_codfigli
                        ) THEN 1 ELSE 0 END AS espandibile,
                        CASE WHEN d.md_dtfival < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS scaduto
                    FROM dbo.movdis d
                    INNER JOIN dbo.artico a ON d.md_codfigli = a.ar_codart
                    WHERE d.md_coddb = @codart_figli
                    ORDER BY d.md_riga
                `)
            ]);
            mrpRighe.forEach((r) => { r.livello = 0; righe.push(r); });

            // Processa figli (il codice sotto usa figliRes gia caricato)
            // Salta la query figli duplicata piu avanti
            _prefetchedFigli = figliRes;
        } else {
            const mrpEsaur = await caricaMRP(pool, codart, magaz, fase);
            taggaMrpBlocco(mrpEsaur, 'esaurimento', articolo.ar_codart);
            mrpEsaur.forEach((r) => {
                r.livello = 0;
                righe.push(r);
            });

            righe.push({
                tipo: 'sostitutivo-header',
                livello: 0,
                codart: sostitutivo.ar_codart,
                codalt: sostitutivo.ar_codalt,
                descr: sostitutivo.ar_descr,
                polriord: getPoliticaRiordino(sostitutivo),
                um: sostitutivo.ar_unmis || 'PZ',
                inesaur: sostitutivo.ar_inesaur,
                etichettaBlocco: 'sostitutivo',
                espandibile: false
            });

            const mrpSost = await caricaMRP(pool, sostitutivo.ar_codart, magaz, fase);
            taggaMrpBlocco(mrpSost, 'sostitutivo', sostitutivo.ar_codart);
            mrpSost.forEach((r) => {
                r.livello = 0;
                righe.push(r);
            });

            const normE = normalizzaMagazzinoPerChiave(mrpEsaur);
            const normS = normalizzaMagazzinoPerChiave(mrpSost);
            const combRighe = costruisciCombinatoRighe(
                normE,
                normS,
                articolo.ar_codart,
                sostitutivo.ar_codart
            );
            combRighe.forEach((r) => {
                r.livello = 0;
                righe.push(r);
            });

            righe.push(buildGeneraleTotaleRow(combRighe));
        }

        // Se i figli sono gia stati caricati in parallelo (caso senza sostitutivo), usa quelli
        const figliRes = _prefetchedFigli || await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT
                    d.md_coddb,
                    d.md_riga,
                    d.md_codfigli,
                    d.md_fasefigli,
                    d.md_quant,
                    d.md_unmis,
                    d.md_quantump,
                    d.md_ump,
                    a.ar_codalt AS figlio_codalt,
                    a.ar_descr AS figlio_descr,
                    a.ar_polriord AS figlio_polriord,
                    a.ar_gesfasi AS figlio_gesfasi,
                    a.ar_scomin AS figlio_scomin,
                    a.ar_ggrior AS figlio_ggrior,
                    a.ar_desint AS figlio_desint,
                    a.ar_inesaur AS figlio_inesaur,
                    a.ar_unmis AS figlio_unmis,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM dbo.movdis sub
                        WHERE sub.md_coddb = d.md_codfigli
                    ) THEN 1 ELSE 0 END AS espandibile,
                    CASE WHEN d.md_dtfival < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS scaduto
                FROM dbo.movdis d
                INNER JOIN dbo.artico a ON d.md_codfigli = a.ar_codart
                WHERE d.md_coddb = @codart
                ORDER BY d.md_riga
            `);

        // Costruiamo un array di Promise per processare tutti i figli in parallelo
        const figliPromises = figliRes.recordset.map(async (f) => {
            const comp = {
                tipo: 'componente',
                livello: 1,
                codart: f.md_codfigli,
                codalt: f.figlio_codalt,
                descr: f.figlio_descr,
                faseDistinta: f.md_fasefigli,
                quantDistinta: f.md_quant,
                umDistinta: f.md_unmis || f.md_ump || 'PZ',
                polriord: getPoliticaRiordino({
                    ar_polriord: f.figlio_polriord,
                    ar_scomin: f.figlio_scomin,
                    ar_ggrior: f.figlio_ggrior,
                    ar_desint: f.figlio_desint
                }),
                um: f.figlio_unmis || 'PZ',
                inesaur: f.figlio_inesaur,
                espandibile: f.espandibile === 1,
                scaduto: f.scaduto === 1
            };

            // Carica i progressivi MRP per questo figlio in parallelo
            const mrpFiglio = await caricaMRP(pool, f.md_codfigli, magaz, fase);
            return { comp, mrp: mrpFiglio };
        });

        // Attendiamo che tutte le query MRP parallele finiscano
        const figliRisultati = await Promise.all(figliPromises);

        // Inseriamo i risultati nell'array righe in ordine (Componente -> Suoi Movimenti MRP)
        for (const res of figliRisultati) {
            righe.push(res.comp);
            res.mrp.forEach(r => {
                r.livello = 1;
                righe.push(r);
            });
        }

        righe[0].espandibile = figliRes.recordset.length > 0;

        const payload = {
            articolo,
            politicaRiordino: getPoliticaRiordino(articolo),
            righe
        };
        if (sostitutivo) payload.sostitutivo = sostitutivo;
        res.json(payload);
    } catch (err) {
        console.error('[API] Errore progressivi:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 4B: ESPANSIONE ON-DEMAND di un nodo della distinta
// ============================================================
router.get('/progressivi/expand', authMiddleware, async (req, res) => {
    try {
        const { codart, livello } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolDest(getUserId(req));
        const liv = parseInt(livello, 10) || 1;
        const righe = [];

        const mrpRighe = await caricaMRP(pool, codart, '', '');
        mrpRighe.forEach((r) => { r.livello = liv; righe.push(r); });

        const figliRes = await pool.request()
            .input('codart', sql.NVarChar, codart)
            .query(`
                SELECT
                    d.md_codfigli,
                    d.md_riga,
                    d.md_fasefigli,
                    d.md_quant,
                    d.md_unmis,
                    d.md_ump,
                    a.ar_codalt AS figlio_codalt,
                    a.ar_descr AS figlio_descr,
                    a.ar_polriord AS figlio_polriord,
                    a.ar_scomin AS figlio_scomin,
                    a.ar_ggrior AS figlio_ggrior,
                    a.ar_desint AS figlio_desint,
                    a.ar_inesaur AS figlio_inesaur,
                    a.ar_unmis AS figlio_unmis,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM dbo.movdis sub
                        WHERE sub.md_coddb = d.md_codfigli
                    ) THEN 1 ELSE 0 END AS espandibile,
                    CASE WHEN d.md_dtfival < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS scaduto
                FROM dbo.movdis d
                INNER JOIN dbo.artico a ON d.md_codfigli = a.ar_codart
                WHERE d.md_coddb = @codart
                ORDER BY d.md_riga
            `);

        for (const f of figliRes.recordset) {
            righe.push({
                tipo: 'componente',
                livello: liv + 1,
                codart: f.md_codfigli,
                codalt: f.figlio_codalt,
                descr: f.figlio_descr,
                faseDistinta: f.md_fasefigli,
                quantDistinta: f.md_quant,
                umDistinta: f.md_unmis || f.md_ump || 'PZ',
                polriord: getPoliticaRiordino({
                    ar_polriord: f.figlio_polriord,
                    ar_scomin: f.figlio_scomin,
                    ar_ggrior: f.figlio_ggrior,
                    ar_desint: f.figlio_desint
                }),
                um: f.figlio_unmis || 'PZ',
                inesaur: f.figlio_inesaur,
                espandibile: f.espandibile === 1,
                scaduto: f.scaduto === 1
            });
        }

        res.json({ righe });
    } catch (err) {
        console.error('[API] Errore expand:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 6: DETTAGLIO ORDINI/IMPEGNI per un articolo+magazzino+fase
// Traduzione di: qryEstArt_ord del blueprint Access
// Si apre nel modale quando l'utente clicca su una riga della griglia
// ============================================================
router.get('/ordini-dettaglio', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolDest(getUserId(req));
        const request = pool.request()
            .input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (magaz) {
            request.input('magaz', sql.SmallInt, parseInt(magaz));
            filtri += ' AND mo.mo_magaz = @magaz';
        }
        if (fase) {
            request.input('fase', sql.SmallInt, parseInt(fase));
            filtri += ' AND mo.mo_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                a.ar_codalt,
                mo.mo_tipork,
                mo.mo_codart,
                mo.mo_magaz,
                mo.mo_fase,
                mo.mo_datcons,
                a.ar_descr,
                mo.mo_anno,
                mo.mo_serie,
                mo.mo_numord,
                mo.mo_riga,
                mo.mo_quant,
                mo.mo_quaeva,
                mo.mo_flevas,
                an.an_descr1 AS fornitore,
                mt.cb_modesrk AS desc_tipo,
                a.ar_sostit,
                a.ar_sostituito,
                a.ar_inesaur
            FROM dbo.movord mo
            INNER JOIN dbo.testord t ON mo.mo_tipork = t.td_tipork
                AND mo.mo_anno = t.td_anno AND mo.mo_serie = t.td_serie
                AND mo.mo_numord = t.td_numord
            INNER JOIN dbo.anagra an ON t.td_conto = an.an_conto
            INNER JOIN dbo.artico a ON mo.mo_codart = a.ar_codart
            INNER JOIN dbo.__MOTIPORK mt ON mo.mo_tipork = mt.cb_motipork
            WHERE mo.mo_codart = @codart
              AND mo.mo_tipork IN ('H','O','R','Y')
              AND mo.mo_flevas <> 'S'
              ${filtri}
            ORDER BY mo.mo_tipork, mo.mo_codart, mo.mo_magaz, mo.mo_fase, mo.mo_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-dettaglio:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 6B: DETTAGLIO RMP SUI TOTALI (Generati vs Confermati)
// Traduzione di: qryEstArt_list (legge da ordlist)
// ============================================================
router.get('/ordini-rmp', authMiddleware, async (req, res) => {
    try {
        const { codart, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolDest(getUserId(req));
        const request = pool.request().input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (fase && fase !== 'All') {
            request.input('fase', sql.SmallInt, parseInt(fase, 10));
            filtri += ' AND ol.ol_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                ol.ol_codart,
                ol.ol_tipork,
                ol.ol_magaz,
                ol.ol_fase,
                ol.ol_datcons,
                ol.ol_oranno AS anno,
                ol.ol_orserie AS serie,
                ol.ol_ornum AS numord,
                ol.ol_orriga AS riga,
                SUM(ol.ol_quant) AS quantita,
                mt.cb_modesrk AS desc_tipo,
                an.an_descr1 AS fornitore,
                ol.ol_stato,
                CASE WHEN ol.ol_stato = 'S' THEN 'Confermato' ELSE 'Generato' END AS conf_gen
            FROM dbo.ordlist ol
            INNER JOIN dbo.__MOTIPORK mt ON ol.ol_tipork = mt.cb_motipork
            LEFT JOIN dbo.anagra an ON ol.ol_conto = an.an_conto
            WHERE ol.ol_codart = @codart
              AND ol.ol_tipork IN ('H','O','R','Y')
              ${filtri}
            GROUP BY ol.ol_codart, ol.ol_magaz, ol.ol_fase, ol.ol_tipork, mt.cb_modesrk,
                     ol.ol_datcons, ol.ol_oranno, ol.ol_orserie, ol.ol_ornum, ol.ol_orriga,
                     an.an_descr1, ol.ol_stato
            ORDER BY ol.ol_tipork, ol.ol_codart, ol.ol_magaz, ol.ol_fase, ol.ol_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-rmp:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 7: ORDINI PRODUZIONE PADRE (per Drill-through sugli impegni)
// Traduzione di: qryEstArt_ordPadre del vecchio Access.
// Dato un articolo + magaz + fase, restituisce gli ordini di produzione
// PADRE che consumano quell'articolo come componente.
// ============================================================
router.get('/ordini-padre', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolDest(getUserId(req));
        const request = pool.request()
            .input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (magaz) {
            request.input('magaz', sql.SmallInt, parseInt(magaz));
            filtri += ' AND mo.mo_magaz = @magaz';
        }
        if (fase) {
            request.input('fase', sql.SmallInt, parseInt(fase));
            filtri += ' AND mo.mo_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                mo.mo_codart,
                mo.mo_magaz,
                mo.mo_fase,
                a_figlio.ar_codalt AS figlio_codalt,
                a_figlio.ar_descr AS figlio_descr,
                -- Dati dell'ordine PADRE
                mop.mo_tipork  AS padre_tipork,
                mop.mo_anno    AS padre_anno,
                mop.mo_serie   AS padre_serie,
                mop.mo_numord  AS padre_numord,
                mop.mo_riga    AS padre_riga,
                mop.mo_codart  AS padre_codart,
                a_padre.ar_codalt  AS padre_codalt_alt,
                a_padre.ar_descr   AS padre_descr,
                mt.cb_modesrk      AS padre_desc_tipo,
                an.an_descr1       AS padre_fornitore,
                mop.mo_quant   AS padre_quant,
                mop.mo_quaeva  AS padre_quaeva,
                mop.mo_flevas  AS padre_flevas,
                mop.mo_magaz   AS padre_magaz,
                mop.mo_fase    AS padre_fase,
                mop.mo_datcons AS padre_datcons
            FROM dbo.movord mo
            INNER JOIN dbo.movord mop
                ON mo.mo_rigaor    = mop.mo_riga
               AND mo.mo_numordor  = mop.mo_numord
               AND mo.mo_serieor   = mop.mo_serie
               AND mo.mo_annoor    = mop.mo_anno
               AND mo.mo_tiporkor  = mop.mo_tipork
            INNER JOIN dbo.testord t
                ON mop.mo_numord = t.td_numord
               AND mop.mo_serie  = t.td_serie
               AND mop.mo_anno   = t.td_anno
               AND mop.mo_tipork = t.td_tipork
            INNER JOIN dbo.anagra an ON t.td_conto = an.an_conto
            INNER JOIN dbo.artico a_figlio ON mo.mo_codart = a_figlio.ar_codart
            INNER JOIN dbo.artico a_padre  ON mop.mo_codart = a_padre.ar_codart
            INNER JOIN dbo.__MOTIPORK mt   ON mop.mo_tipork = mt.cb_motipork
            WHERE mo.mo_codart = @codart
              AND mop.mo_flevas = 'C'
              ${filtri}
            ORDER BY mop.mo_tipork, mop.mo_codart, mop.mo_magaz, mop.mo_fase, mop.mo_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-padre:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 7B: ORDINI PADRE da ordlist (self-join ol_olprogr → ol_progr)
// Usato dal modale RMP. Diverso da /ordini-padre che usa movord.
// ============================================================
router.get('/ordini-padre-rmp', authMiddleware, async (req, res) => {
    try {
        const { codart, magaz, fase } = req.query;
        if (!codart) return res.status(400).json({ error: 'codart richiesto' });

        const pool = await getPoolDest(getUserId(req));
        const request = pool.request()
            .input('codart', sql.NVarChar, codart);

        let filtri = '';
        if (magaz) {
            request.input('magaz', sql.SmallInt, parseInt(magaz));
            filtri += ' AND figlio.ol_magaz = @magaz';
        }
        if (fase && fase !== 'All') {
            request.input('fase', sql.SmallInt, parseInt(fase));
            filtri += ' AND figlio.ol_fase = @fase';
        }

        const result = await request.query(`
            SELECT
                padre.ol_codart   AS padre_codart,
                padre.ol_magaz    AS padre_magaz,
                padre.ol_fase     AS padre_fase,
                ar.ar_descr       AS padre_descr,
                ar.ar_codalt      AS padre_codalt,
                figlio.ol_datcons AS datcons,
                padre.ol_tipork   AS padre_tipork,
                mt.cb_modesrk     AS padre_desc_tipo,
                SUM(figlio.ol_quant) AS quantita,
                CASE WHEN padre.ol_stato = 'S' THEN 'Confermato' ELSE 'Generato' END AS padre_conf_gen,
                an.an_descr1      AS padre_fornitore
            FROM dbo.ordlist figlio
            INNER JOIN dbo.ordlist padre ON figlio.ol_olprogr = padre.ol_progr
            INNER JOIN dbo.artico ar ON padre.ol_codart = ar.ar_codart
            INNER JOIN dbo.__MOTIPORK mt ON padre.ol_tipork = mt.cb_motipork
            LEFT JOIN dbo.anagra an ON padre.ol_conto = an.an_conto
            WHERE figlio.ol_codart = @codart
              AND figlio.ol_tipork IN ('Y','R')
              ${filtri}
            GROUP BY padre.ol_codart, padre.ol_magaz, padre.ol_fase, ar.ar_descr, ar.ar_codalt,
                     figlio.ol_datcons, padre.ol_tipork, mt.cb_modesrk, padre.ol_stato, an.an_descr1
            ORDER BY padre.ol_tipork, padre.ol_codart, padre.ol_magaz, padre.ol_fase, figlio.ol_datcons
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Errore ordini-padre-rmp:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API 8A-multi: CONSUMI SPRINT multi-articolo (esaurimento + sostitutivo)
};
