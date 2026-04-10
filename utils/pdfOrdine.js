/**
 * Generazione PDF Ordine Fornitore — replica layout BCube (Crystal Reports)
 * Layout verificato su Ujetorfo.rpt (Italia) e Ujetorfv.rpt (Estero).
 * Usa PDFKit per generare un Buffer PDF server-side.
 * Formato pagina: A4 (595x842 pt).
 *
 * Riferimento completo: gb2/BCUBE-PDF-ORDINI-REFERENCE.md
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ============================================================
// DATI AZIENDA (hardcodati, da PDF reale BCube)
// ============================================================
const AZIENDA = {
    nome: 'U. Jet  s.r.l.',
    indirizzo: 'via san Francescuccio de\' Mietitori, 32',
    cap_citta: '06083 Bastia Umbra (PG)',
    tel: '(075) 8004025 r.a.',
    fax: '(075) 8004180',
    email: 'info@ujet.it',
    pec: 'ujet.pec@pec.it',
    web: 'www.ujet.it',
    capsoc: 'Cap.Soc. Eur 200.000 i.v. - R.E.A. PG n. 312389',
    registro: 'Registro Imprese di Perugia, P.IVA e Cod. Fisc. IT 03766750545',
    sdi: '1N74KED',
    firma_nome: 'Pietro Tardioli'
};

// ============================================================
// NOTE LEGALI — due versioni (come nel Crystal Reports)
// ============================================================
const NOTE_LEGALI_IT = 'SI AVVERTE CHE, QUALORA QUESTO ORDINE NON VENISSE CONFERMATO ENTRO 8 GIORNI DALLA DATA DI INVIO, SI CONSIDERANO ACCETTATE TUTTE LE CONDIZIONI IN ESSO CONTENUTE.\nIMPORTANTE:  Indicare sempre il numero d\'ordine sia in fattura che nelle bolle di consegna.\nP.O. Number must be indicated on invoice - delivery note.\n\nPer i dispositivi in ordine si chiede di inviare lotti preferibilmente univoci, tassativamente con il massimo di residuo di vita, quantomeno mai inferiore ai 2/3 della sua shelf-life.\n\nIl fornitore dichiara di conoscere il contenuto del Decreto Legislativo 8 giugno 2001 n. 231 e si impegna ad astenersi da comportamenti idonei a configurare le ipotesi di reato di cui al Decreto medesimo (a prescindere dalla effettiva consumazione del reato o dalla punibilita\' dello stesso). L\'inosservanza da parte del fornitore di tale impegno e\' considerato dalle Parti un inadempimento grave e motivo di risoluzione del contratto per inadempimento ai sensi dell\'art. 1453 c.c. e legittimera\' U.Jet Srl a risolvere lo stesso con effetto immediato. Il presente ordine si intende accettato integralmente per tutte le condizioni in esso riportate ed in tutte le sue clausole, ivi comprese espressamente quelle relative alle condizioni economiche, ai tempi di consegna ed ai termini di pagamento.';

const NOTE_LEGALI_EX = 'SI AVVERTE CHE, QUALORA CODESTO ORDINE NON VENISSE CONFERMATO ENTRO 8 GIORNI DALLA DATA DI INVIO, TUTTE LE CONDIZIONI IN ESSO CONTENUTE SI CONSIDERANO ACCETTATE.\nIMPORTANTE:  Indicare sempre il numero d\'ordine sia in fattura che nelle bolle di consegna.\nP.O. Number must be indicated on invoice - delivery note.\nINVIARE FATTURA IN DUPLICE COPIA.';

// ============================================================
// FORMATTER HELPERS
// ============================================================
function fmtData(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtNum(n, decimali) {
    if (n === null || n === undefined) return '';
    const num = Number(n);
    if (isNaN(num)) return '';
    return num.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

function fmtPrezzo(n) {
    const num = Number(n);
    if (!num && num !== 0) return '';
    return num.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtSconti(sc1, sc2, sc3) {
    const sconti = [sc1, sc2, sc3].filter(s => s && Number(s) !== 0);
    if (!sconti.length) return '';
    return sconti.map(s => fmtNum(s, 2) + '%').join('+');
}

function s(val) { return (val || '').toString().trim(); }

// ============================================================
// COSTANTI LAYOUT
// ============================================================
const C = {
    nero: '#000000',
    grigio: '#666666',
    grigioChiaro: '#999999',
    lineaGrigio: '#BBBBBB',
    lineaScuro: '#666666'
};

const MARGIN = { left: 30, top: 28, right: 30, bottom: 30 };
const PAGE_W = 595 - MARGIN.left - MARGIN.right; // ~535 pt utili
const PAGE_BREAK_Y = 738; // soglia per page break (prima del footer)

// Percorsi assets (logo e firma)
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'logo-ujet.jpeg');
const FIRMA_PATH = path.join(ASSETS_DIR, 'firma-tardioli.jpeg');

// ============================================================
// FUNZIONE PRINCIPALE
// ============================================================
async function generaPdfOrdine(ordine, righe, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const isProva = options.ambiente === 'prova';
            const isEstero = s(ordine.fornitore_tipo) === 'EXTRA_UE';

            const doc = new PDFDocument({
                size: 'A4',
                margins: MARGIN,
                info: {
                    Title: `${isProva ? '[PROVA] ' : ''}Ordine ${ordine.numord}/${s(ordine.serie)} - ${s(ordine.fornitore_nome)}`,
                    Author: 'U.Jet s.r.l. - GB2',
                    Subject: 'Ordine d\'Acquisto Fornitore'
                }
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', err => reject(err));

            renderPdf(doc, ordine, righe, isEstero, isProva);
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// (Watermark diagonale rimosso — "PROVA" appare ora nel titolo dell'header)

// ============================================================
// SEZIONI RIUTILIZZABILI (ripetute su ogni pagina)
// ============================================================

function renderHeader(doc, ordine, isEstero, isProva) {
    const x0 = MARGIN.left;
    let y = MARGIN.top;

    // --- COLONNA SINISTRA: Dati azienda (come BCube) ---
    const xLeft = x0;
    const leftW = 280;
    let yL = y;

    // Logo (se disponibile, altrimenti testo grande)
    if (fs.existsSync(LOGO_PATH)) {
        try { doc.image(LOGO_PATH, xLeft, yL, { height: 50 }); } catch (_) {}
        yL += 55;
    } else {
        doc.fontSize(18).font('Helvetica-Bold').fillColor(C.nero)
            .text('U.Jet', xLeft, yL);
        yL += 24;
    }

    doc.fontSize(7.5).font('Helvetica').fillColor(C.nero);
    doc.text(AZIENDA.nome, xLeft, yL, { width: leftW }); yL += 10;
    doc.text(AZIENDA.indirizzo, xLeft, yL, { width: leftW }); yL += 9;
    doc.text(AZIENDA.cap_citta, xLeft, yL, { width: leftW }); yL += 9;
    doc.text(`Tel: ${AZIENDA.tel} - Fax: ${AZIENDA.fax}`, xLeft, yL, { width: leftW }); yL += 9;

    if (!isEstero) {
        doc.text(`Mail: ${AZIENDA.email}`, xLeft, yL, { width: leftW }); yL += 9;
        doc.text(`PEC: ${AZIENDA.pec}`, xLeft, yL, { width: leftW }); yL += 9;
        doc.text(`Website: ${AZIENDA.web}`, xLeft, yL, { width: leftW }); yL += 11;
    } else {
        yL += 11;
    }

    doc.fontSize(6.5).fillColor('#555555');
    doc.text(AZIENDA.capsoc, xLeft, yL, { width: leftW }); yL += 8;
    doc.text(AZIENDA.registro, xLeft, yL, { width: leftW }); yL += 8;

    if (!isEstero) {
        doc.text(`Codice destinatario univoco (SDI): ${AZIENDA.sdi}`, xLeft, yL, { width: leftW });
        yL += 8;
    }

    // --- COLONNA DESTRA: Destinatario + Destinazione ---
    const xRight = x0 + 290;
    const rightW = PAGE_W - 290;
    let yR = y;

    // "ORDINE D'ACQUISTO" (con prefisso PROVA in rosso se ambiente prova)
    if (isProva) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#cc0000')
            .text('PROVA', xRight, yR, { width: rightW, align: 'right', continued: false });
        yR += 13;
    }
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.nero)
        .text('ORDINE D\'ACQUISTO', xRight, yR, { width: rightW, align: 'right' });
    yR += 16;

    // Destinatario
    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('Destinatario :', xRight, yR);
    yR += 10;

    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.nero)
        .text(s(ordine.fornitore_nome).toUpperCase(), xRight, yR, { width: rightW - 50 });

    // ( an_categ ) a destra sulla stessa riga
    if (ordine.fornitore_categ) {
        doc.fontSize(8).font('Helvetica').fillColor(C.grigio)
            .text(`( ${ordine.fornitore_categ} )`, xRight + rightW - 45, yR, { width: 45, align: 'right' });
    }
    yR += 13;

    doc.fontSize(8).font('Helvetica').fillColor(C.nero);
    if (s(ordine.fornitore_indirizzo)) {
        doc.text(s(ordine.fornitore_indirizzo), xRight, yR, { width: rightW }); yR += 10;
    }

    // CAP Citta (Prov) — formula @CITTAPROV
    const cittaParts = [s(ordine.fornitore_cap), s(ordine.fornitore_citta).toUpperCase()];
    if (s(ordine.fornitore_prov)) cittaParts.push(`(${s(ordine.fornitore_prov)})`);
    doc.text(cittaParts.filter(Boolean).join(' '), xRight, yR, { width: rightW }); yR += 11;

    // Fax
    if (s(ordine.fornitore_fax)) {
        doc.fontSize(7).fillColor(C.grigio).text('Fax :', xRight, yR);
        doc.fontSize(8).fillColor(C.nero).text(s(ordine.fornitore_fax), xRight + 30, yR);
        yR += 11;
    }

    // Blocco "Luogo di destinazione" (se presente)
    if (s(ordine.dest_nome)) {
        yR += 4;
        doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
            .text('Luogo di destinazione :', xRight, yR);
        yR += 10;
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
            .text(s(ordine.dest_nome), xRight, yR, { width: rightW }); yR += 10;
        doc.font('Helvetica');
        if (s(ordine.dest_indirizzo)) {
            doc.text(s(ordine.dest_indirizzo), xRight, yR, { width: rightW }); yR += 10;
        }
        const destCitta = [s(ordine.dest_cap), s(ordine.dest_citta)];
        if (s(ordine.dest_prov)) destCitta.push(`(${s(ordine.dest_prov)})`);
        doc.text(destCitta.filter(Boolean).join(' '), xRight, yR, { width: rightW }); yR += 10;
    }

    return Math.max(yL, yR) + 8;
}

function renderMetadati(doc, ordine, isEstero) {
    const x0 = MARGIN.left;
    let y = doc._currentY || MARGIN.top;

    // Titolo ordine: "Ordine d'Acquisto n° 276/F del 03/04/2026"
    const numSerie = s(ordine.serie) ? `${ordine.numord}/${s(ordine.serie)}` : String(ordine.numord);
    const titolo = `Ordine d'Acquisto n\u00b0 ${numSerie} del ${fmtData(ordine.data_ordine)}`;

    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.nero).text(titolo, x0, y);

    // Rif. / Ref.
    if (s(ordine.riferimento)) {
        doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
            .text('Rif. / Ref.', x0 + 350, y);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
            .text(s(ordine.riferimento), x0 + 400, y, { width: 135 });
    }
    y += 15;

    // Linea sotto titolo
    doc.moveTo(x0, y).lineTo(x0 + PAGE_W, y).lineWidth(0.5).strokeColor(C.lineaScuro).stroke();
    y += 6;

    // --- Griglia metadati ---
    const labelFont = () => doc.fontSize(6.5).font('Helvetica').fillColor(C.grigio);
    const valueFont = () => doc.fontSize(7.5).font('Helvetica-Bold').fillColor(C.nero);

    // Riga 1: conto | pagamento | banca
    labelFont().text('conto', x0, y);
    valueFont().text(ordine.fornitore_codice || '', x0, y + 8);

    labelFont().text('pagamento / terms', x0 + 80, y);
    valueFont().text(s(ordine.pagamento_descr), x0 + 80, y + 8, { width: 180 });

    labelFont().text('banca d\'appoggio / bank', x0 + 330, y);
    // Italia: banca da ordine (testord), Estero: banca da anagrafica fornitore
    const banca1 = isEstero ? s(ordine.fornitore_banca_1) : s(ordine.banca_appoggio_1);
    const banca2 = isEstero ? s(ordine.fornitore_banca_2) : s(ordine.banca_appoggio_2);
    const bancaStr = [banca1, banca2].filter(Boolean).join(' - ');
    valueFont().text(bancaStr, x0 + 330, y + 8, { width: PAGE_W - 330 });

    y += 22;

    // Riga 2: spedizione a mezzo del | vettore
    labelFont().text('spedizione a mezzo del / despatch by', x0, y);

    // @TRASP: traduzione td_acuradi
    let trasp = '';
    const acuradi = s(ordine.acuradi);
    if (acuradi === 'D') trasp = 'Destinatario';
    else if (acuradi === 'V') trasp = 'Vettore';
    else if (acuradi === 'M') trasp = 'Mittente';
    valueFont().text(trasp, x0 + 170, y);

    labelFont().text('vettore', x0 + 330, y);
    // TODO: descrizione vettore da tabella vettori (tb_desvett)
    y += 16;

    // Riga 3: porto | valuta | imballo
    labelFont().text('porto', x0, y);
    valueFont().text(s(ordine.porto_descr), x0, y + 8, { width: 170 });

    labelFont().text('valuta', x0 + 200, y);
    const valutaLabel = isEstero ? s(ordine.valuta_nome) : s(ordine.valuta_sigla);
    valueFont().text(valutaLabel || 'EUR', x0 + 200, y + 8);

    labelFont().text('imballo / packaging', x0 + 400, y);
    valueFont().text('GRATIS', x0 + 400, y + 8);

    y += 22;

    // Linea sotto metadati
    doc.moveTo(x0, y).lineTo(x0 + PAGE_W, y).lineWidth(0.3).strokeColor(C.lineaGrigio).stroke();
    y += 4;

    return y;
}

function getColonne(isEstero) {
    const x0 = MARGIN.left;
    if (isEstero) {
        return [
            { it: 'Cod.articolo', en: 'Our Code',     x: x0,       w: 62,  align: 'left' },
            { it: 'Descrizione',  en: 'Description',   x: x0 + 62,  w: 185, align: 'left' },
            { it: 'UM',           en: 'Unit',           x: x0 + 247, w: 25,  align: 'center' },
            { it: 'Q.t\u00e0',   en: 'Quantity',       x: x0 + 272, w: 65,  align: 'right' },
            { it: 'Prezzo',       en: 'Unit Price',     x: x0 + 337, w: 55,  align: 'right' },
            { it: 'Sconti',       en: 'Disc.',          x: x0 + 392, w: 40,  align: 'right' },
            { it: 'Cons.',        en: 'Deliv.time',     x: x0 + 432, w: 58,  align: 'center' },
            { it: 'Note',         en: 'Remarks',        x: x0 + 490, w: 45,  align: 'left' }
        ];
    }
    return [
        { it: 'Cod.articolo', en: 'Our Code',     x: x0,       w: 62,  align: 'left' },
        { it: 'Descrizione',  en: 'Description',   x: x0 + 62,  w: 185, align: 'left' },
        { it: 'UM',           en: 'Unit',           x: x0 + 247, w: 25,  align: 'center' },
        { it: 'Quantit\u00e0',en: 'Quantity',       x: x0 + 272, w: 65,  align: 'right' },
        { it: 'Prezzo',       en: 'Unit Price',     x: x0 + 337, w: 55,  align: 'right' },
        { it: 'Sconti',       en: 'Discount',       x: x0 + 392, w: 40,  align: 'right' },
        { it: 'Data Spedizione', en: 'Shipping Date', x: x0 + 432, w: 58, align: 'center' },
        { it: 'Note',         en: 'Remarks',        x: x0 + 490, w: 45,  align: 'left' }
    ];
}

function renderColonneHeader(doc, isEstero) {
    const x0 = MARGIN.left;
    const cols = getColonne(isEstero);
    let y = doc._currentY || MARGIN.top;

    const headerH = 22;
    doc.rect(x0, y, PAGE_W, headerH).fillAndStroke('#F0F0F0', C.lineaGrigio);
    doc.fillColor('#333333').fontSize(6).font('Helvetica-Bold');
    for (const col of cols) {
        doc.text(col.it, col.x + 2, y + 3, { width: col.w - 4, align: col.align });
        doc.fontSize(5).font('Helvetica').fillColor(C.grigio)
            .text(col.en, col.x + 2, y + 12, { width: col.w - 4, align: col.align });
        doc.fillColor('#333333').fontSize(6).font('Helvetica-Bold');
    }

    return y + headerH;
}

// ============================================================
// RENDER PAGINA COMPLETA HEADER (per nuova pagina)
// ============================================================
function renderPageHeader(doc, ordine, isEstero, isProva) {
    let y = renderHeader(doc, ordine, isEstero, isProva);
    doc._currentY = y;
    y = renderMetadati(doc, ordine, isEstero);
    doc._currentY = y;
    y = renderColonneHeader(doc, isEstero);
    return y;
}

// ============================================================
// RENDER PDF COMPLETO
// ============================================================
function renderPdf(doc, ordine, righe, isEstero, isProva) {
    const x0 = MARGIN.left;
    const cols = getColonne(isEstero);

    // --- Prima pagina: header + metadati + colonne ---
    let y = renderPageHeader(doc, ordine, isEstero, isProva);

    // --- Righe articoli ---
    for (const r of righe) {
        const isDescRiga = s(r.mo_codart) === 'D'; // riga descrizione libera

        // Calcola altezza necessaria per questa riga (tutte le sotto-righe)
        doc.fontSize(7).font('Helvetica');
        const descr = s(r.mo_descr);
        const desint = s(r.mo_desint);
        const descrH = doc.heightOfString(descr, { width: cols[1].w - 4 });
        let rowH = Math.max(descrH + 4, 14);
        if (desint) rowH += 10;
        if (r.mo_lotto && Number(r.mo_lotto) > 0) rowH += 10;
        if (s(r.ar_note)) rowH += 10;
        if (s(r.mo_note)) rowH += 10;
        if (s(r.rif_fornitore)) rowH += 10;
        if (!isEstero && s(r.mo_unmis) !== s(r.mo_ump) && r.ar_conver) rowH += 10;

        // Page break se necessario
        if (y + rowH > PAGE_BREAK_Y) {
            doc.addPage();
            y = renderPageHeader(doc, ordine, isEstero, isProva);
        }

        // --- Riga b: codart | descr | UM | quant | prezzo | sconti | data ---
        const yRow = y;
        doc.fontSize(7).font('Helvetica').fillColor(C.nero);

        // Codice articolo (vuoto per righe tipo "D")
        if (!isDescRiga) {
            doc.text(s(r.mo_codart), cols[0].x + 2, y + 2, { width: cols[0].w - 4 });
        }

        // Descrizione
        doc.text(descr, cols[1].x + 2, y + 2, { width: cols[1].w - 4 });

        if (!isDescRiga) {
            // UM — formula @UM
            let um;
            if (isEstero) {
                um = s(r.mo_unmis);
            } else {
                um = (s(r.mo_unmis) === s(r.mo_ump)) ? s(r.mo_ump) : s(r.mo_unmis);
            }
            doc.text(um, cols[2].x + 2, y + 2, { width: cols[2].w - 4, align: 'center' });

            // Quantita — formula @QUANT
            let quant;
            if (isEstero) {
                quant = r.mo_quant;
            } else {
                quant = (s(r.mo_unmis) === s(r.mo_ump)) ? r.mo_quant : r.mo_colli;
            }
            doc.text(fmtNum(quant, 2), cols[3].x + 2, y + 2, { width: cols[3].w - 4, align: 'right' });

            // Prezzo
            doc.text(fmtPrezzo(r.mo_prezzo), cols[4].x + 2, y + 2, { width: cols[4].w - 4, align: 'right' });

            // Sconti
            const scontiStr = fmtSconti(r.mo_scont1, r.mo_scont2, r.mo_scont3);
            doc.fontSize(6).text(scontiStr, cols[5].x + 2, y + 2, { width: cols[5].w - 4, align: 'right' });

            // Data consegna
            doc.fontSize(7).text(fmtData(r.mo_datcons), cols[6].x + 2, y + 2, { width: cols[6].w - 4, align: 'center' });
        }

        y += Math.max(descrH + 4, 14);

        // --- Riga c: codice alternativo | descrizione integrativa ---
        if (desint) {
            doc.fontSize(6.5).fillColor(C.grigio);
            if (!isEstero && s(r.ar_codalt) && s(r.ar_codalt) !== 'D') {
                doc.text(`(${s(r.ar_codalt)})`, cols[0].x + 2, y, { width: cols[0].w - 4 });
            }
            doc.text(desint, cols[1].x + 2, y, { width: cols[1].w - 4 });
            y += 10;
        }

        // --- Riga d: LOT (solo se lotto > 0) ---
        if (r.mo_lotto && Number(r.mo_lotto) > 0) {
            doc.fontSize(6.5).fillColor(C.grigio)
                .text(`LOT ${r.mo_lotto}`, cols[1].x + 2, y, { width: cols[1].w - 4 });
            y += 10;
        }

        // --- Riga e: note articolo ---
        if (s(r.ar_note)) {
            doc.fontSize(6).fillColor(C.grigio)
                .text(s(r.ar_note), cols[1].x + 2, y, { width: cols[1].w + cols[2].w + cols[3].w - 4 });
            y += 10;
        }

        // --- Riga f: N.B. note riga ---
        if (s(r.mo_note)) {
            doc.fontSize(6.5).font('Helvetica-Bold').fillColor(C.grigio)
                .text('N.B.:', cols[0].x + 2, y);
            doc.font('Helvetica')
                .text(s(r.mo_note), cols[1].x + 2, y, { width: cols[1].w + cols[2].w + cols[3].w - 4 });
            y += 10;
        }

        // --- Riga g: Riferimenti fornitore ---
        if (s(r.rif_fornitore)) {
            doc.fontSize(6.5).font('Helvetica').fillColor(C.grigio);
            let rifStr = 'Riferimenti fornitore: ' + s(r.rif_fornitore);
            if (s(r.rif_note)) rifStr += '    ' + s(r.rif_note);
            doc.text(rifStr, cols[0].x + 2, y, { width: cols[1].x + cols[1].w - cols[0].x - 4 });
            y += 10;
        }

        // --- Riga h: Conversione UM (solo Italia, se UM diverse) ---
        if (!isEstero && s(r.mo_unmis) !== s(r.mo_ump) && r.ar_conver && Number(r.ar_conver) !== 0) {
            const conv = Math.round(1 / Number(r.ar_conver));
            doc.fontSize(6).fillColor(C.grigio)
                .text(`1 ${s(r.mo_unmis)} = ${conv} ${s(r.mo_ump)}`, cols[1].x + 2, y, { width: 200 });
            y += 10;
        }

        // Linea sotto la riga
        doc.moveTo(x0, y).lineTo(x0 + PAGE_W, y).lineWidth(0.3).strokeColor(C.lineaGrigio).stroke();
        y += 2;
    }

    // Linea finale tabella
    doc.moveTo(x0, y).lineTo(x0 + PAGE_W, y).lineWidth(0.5).strokeColor(C.lineaScuro).stroke();
    y += 12;

    // ============================================================
    // TOTALE ORDINE
    // ============================================================
    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('totale ordine', x0 + 350, y);
    const valSigla = s(ordine.valuta_sigla) || 'EUR';
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.nero)
        .text(`${valSigla}  ${fmtNum(ordine.totale_merce, 2)}`, x0 + 410, y - 1, { width: 125, align: 'right' });
    y += 20;

    // ============================================================
    // FOOTER — note, saluti, firma, note legali
    // ============================================================

    // Verifica spazio per footer (~200pt necessari)
    if (y > 580) {
        doc.addPage();
        y = MARGIN.top;
    }

    // "Si autorizza l'emissione..."
    doc.fontSize(6).font('Helvetica').fillColor(C.grigioChiaro)
        .text('Si autorizza l\'emissione del presente ordine in deroga alla procedura 005 D.G.', x0, y, { width: PAGE_W });
    y += 14;

    // Linea separazione
    doc.moveTo(x0, y).lineTo(x0 + PAGE_W, y).lineWidth(0.3).strokeColor(C.lineaGrigio).stroke();
    y += 6;

    // Note (an_note + an_note2 + td_note) a sinistra, Totale+Firma a destra
    const noteY = y;
    doc.fontSize(7).fillColor(C.grigio).text('note / remarks', x0, y);
    y += 10;

    const noteList = [s(ordine.fornitore_note), s(ordine.fornitore_note2), s(ordine.note_ordine)].filter(Boolean);
    const noteText = noteList.join('\n');
    let noteHeight = 0;
    if (noteText) {
        doc.fontSize(6.5).font('Helvetica');
        noteHeight = doc.heightOfString(noteText, { width: 300, lineGap: 1.5 });

        // Se le note sono troppo lunghe per stare sulla pagina, nuova pagina
        if (y + noteHeight + 80 > 810) {
            doc.addPage();
            y = MARGIN.top;
            doc.fontSize(7).fillColor(C.grigio).text('note / remarks (continua)', x0, y);
            y += 10;
        }

        doc.fontSize(6.5).font('Helvetica').fillColor('#444444')
            .text(noteText, x0, y, { width: 300, lineGap: 1.5 });
    }

    // Colonna destra: saluti + firma
    const xFirma = x0 + 370;
    let yF = noteY;
    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('Distinti saluti / Regards', xFirma, yF);
    yF += 12;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
        .text(AZIENDA.nome, xFirma, yF);
    yF += 11;
    doc.fontSize(8).font('Helvetica').fillColor(C.nero)
        .text(AZIENDA.firma_nome, xFirma, yF);
    yF += 18;

    y = Math.max(y + noteHeight + 6, yF) + 10;

    // Note legali
    doc.fontSize(5.5).font('Helvetica').fillColor('#444444');
    const noteLegali = isEstero ? NOTE_LEGALI_EX : NOTE_LEGALI_IT;
    doc.text(noteLegali, x0, y, { width: PAGE_W, lineGap: 1.2 });

}

module.exports = { generaPdfOrdine, AZIENDA };
