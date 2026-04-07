/**
 * Generazione PDF Ordine Fornitore — replica layout BCube
 * Usa PDFKit per generare un Buffer PDF server-side.
 * Formato pagina: A4 (595x841 pt), come il PDF BCube originale.
 */

const PDFDocument = require('pdfkit');

// ============================================================
// DATI AZIENDA (hardcodati da PDF reale BCube)
// ============================================================
const AZIENDA = {
    nome: 'U. Jet  s.r.l.',
    indirizzo: 'via san Francescuccio de\' Mietitori, 32',
    cap_citta: '06083 Bastia Umbra  (PG)',
    tel: '(075) 8004025 r.a.',
    fax: '(075) 8004180',
    email: 'info@ujet.it',
    pec: 'ujet.pec@pec.it',
    web: 'www.ujet.it',
    capsoc: 'Cap.Soc. Eur 200.000 i.v. - R.E.A. PG n. 312389',
    registro: 'Registro Imprese di Perugia, P.IVA e Cod. Fisc. IT 03766750545',
    sdi: '1N74KED',
    firma_nome: 'Pietro Tardioli',
    modulo: 'Mod. 105/2'
};

// ============================================================
// NOTE LEGALI (testo fisso dal PDF reale)
// ============================================================
const NOTE_LEGALI = 'SI AVVERTE CHE, QUALORA QUESTO ORDINE NON VENISSE CONFERMATO ENTRO 8 GIORNI DALLA DATA DI INVIO, SI CONSIDERANO ACCETTATE TUTTE LE CONDIZIONI IN ESSO CONTENUTE.\n\nIMPORTANTE:\nIndicare sempre il numero d\'ordine sia in fattura che nelle bolle di consegna.\nP.O. Number must be indicated on invoice - delivery note.\n\nPer i dispositivi in ordine si chiede di inviare lotti preferibilmente univoci, tassativamente con il massimo di residuo di vita, quantomeno mai inferiore ai 2/3 della sua shelf-life.\n\nIl fornitore dichiara di conoscere il contenuto del Decreto Legislativo 8 giugno 2001 n. 231 e si impegna ad astenersi da comportamenti idonei a configurare le ipotesi di reato di cui al Decreto medesimo (a prescindere dalla effettiva consumazione del reato o dalla punibilita\' dello stesso). L\'inosservanza da parte del fornitore di tale impegno e\' considerato dalle Parti un inadempimento grave e motivo di risoluzione del contratto per inadempimento ai sensi dell\'art. 1453 c.c. e legittimera\' U.Jet Srl a risolvere lo stesso con effetto immediato. Il presente ordine si intende accettato integralmente per tutte le condizioni in esso riportate ed in tutte le sue clausole, ivi comprese espressamente quelle relative alle condizioni economiche, ai tempi di consegna ed ai termini di pagamento.';

// ============================================================
// Formatter helpers
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
    return num.toLocaleString('it-IT', {
        minimumFractionDigits: decimali,
        maximumFractionDigits: decimali
    });
}

function fmtPrezzo(n) {
    const num = Number(n);
    if (!num && num !== 0) return '';
    return num.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// ============================================================
// Colori e dimensioni
// ============================================================
const C = {
    nero: '#000000',
    grigio: '#666666',
    grigioChiaro: '#999999',
    lineaGrigio: '#BBBBBB',
    lineaScuro: '#666666'
};

const MARGIN = { left: 30, top: 30, right: 30, bottom: 30 };
const PAGE_W = 595 - MARGIN.left - MARGIN.right; // ~535 pt utili

// ============================================================
// GENERA PDF
// ============================================================
/**
 * @param {Object} ordine - Dati testata dal resultset 1 della SP
 * @param {Array} righe - Array righe dal resultset 2 della SP
 * @returns {Promise<Buffer>} PDF buffer
 */
/**
 * @param {Object} ordine - Dati testata dal resultset 1 della SP
 * @param {Array} righe - Array righe dal resultset 2 della SP
 * @param {Object} [options] - Opzioni: { ambiente: 'prova'|'produzione' }
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generaPdfOrdine(ordine, righe, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const isProva = options.ambiente === 'prova';
            const doc = new PDFDocument({
                size: 'A4',
                margins: MARGIN,
                info: {
                    Title: `${isProva ? '[PROVA] ' : ''}Ordine ${ordine.numord}/${ordine.serie} - ${ordine.fornitore_nome || ''}`,
                    Author: 'U.Jet s.r.l. - MRP Web',
                    Subject: 'Ordine d\'Acquisto Fornitore'
                }
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', err => reject(err));

            // Watermark PROVA su ogni pagina
            if (isProva) {
                addWatermark(doc);
                doc.on('pageAdded', () => addWatermark(doc));
            }

            renderPdf(doc, ordine, righe);

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Disegna watermark "PROVA" diagonale semitrasparente sulla pagina corrente
 */
function addWatermark(doc) {
    doc.save();
    doc.opacity(0.10);
    doc.fontSize(100).font('Helvetica-Bold').fillColor('#ff0000');
    // Centro pagina A4: 297.5, 420.5
    doc.translate(297, 420);
    doc.rotate(-45, { origin: [0, 0] });
    doc.text('PROVA', -200, -50, { width: 400, align: 'center' });
    doc.restore();
    // Reset opacity per il contenuto che segue
    doc.opacity(1);
}

function renderPdf(doc, ordine, righe) {
    const x0 = MARGIN.left;
    const xMid = x0 + PAGE_W / 2 + 10;
    let y = MARGIN.top;

    // ============================================================
    // INTESTAZIONE — due colonne
    // ============================================================

    // Colonna SX: destinatario
    doc.fontSize(7).fillColor(C.grigio).text('Destinatario :', x0, y);
    y += 12;
    doc.fontSize(10).fillColor(C.nero).font('Helvetica-Bold')
        .text((ordine.fornitore_nome || '').toUpperCase(), x0, y);
    y += 14;
    doc.fontSize(8).font('Helvetica')
        .text(ordine.fornitore_indirizzo || '', x0, y);
    y += 11;

    const cittaStr = [
        ordine.fornitore_cap || '',
        (ordine.fornitore_citta || '').toUpperCase(),
        ordine.fornitore_prov ? `(${ordine.fornitore_prov})` : ''
    ].filter(Boolean).join(' ');
    doc.text(cittaStr, x0, y);
    y += 11;

    if (ordine.fornitore_fax) {
        doc.fontSize(7).fillColor(C.grigio).text('Fax :', x0, y);
        doc.fontSize(8).fillColor(C.nero).text(ordine.fornitore_fax, x0 + 25, y);
        y += 11;
    }

    // Colonna DX: dati azienda
    let yDx = MARGIN.top;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
        .text('ORDINE D\'ACQUISTO', xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 18;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.nero)
        .text(AZIENDA.nome, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 14;
    doc.fontSize(7.5).font('Helvetica')
        .text(AZIENDA.indirizzo, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 10;
    doc.text(AZIENDA.cap_citta, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 10;
    doc.text(`Tel: ${AZIENDA.tel} - Fax: ${AZIENDA.fax}`, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 10;
    doc.text(`Mail: ${AZIENDA.email}`, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 10;
    doc.text(`PEC: ${AZIENDA.pec}`, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 10;
    doc.text(`Website: ${AZIENDA.web}`, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 12;
    doc.fontSize(6.5).fillColor('#555555')
        .text(AZIENDA.capsoc, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 8;
    doc.text(AZIENDA.registro, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });
    yDx += 8;
    doc.text(`Codice destinatario univoco (SDI): ${AZIENDA.sdi}`, xMid, yDx, { width: PAGE_W / 2 - 10, align: 'right' });

    y = Math.max(y, yDx) + 16;

    // ============================================================
    // TITOLO ORDINE
    // ============================================================
    const numOrd = `${ordine.numord}/${ordine.serie}`;
    const datOrd = fmtData(ordine.data_ordine);
    const titolo = `Ordine d'Acquisto n\u00b0 ${numOrd} del ${datOrd}`;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.nero)
        .text(titolo, x0, y);
    // Sottolineatura
    const titoloW = doc.widthOfString(titolo);
    doc.moveTo(x0, y + 13).lineTo(x0 + titoloW, y + 13)
        .lineWidth(0.5).strokeColor(C.nero).stroke();
    y += 20;

    // ============================================================
    // METADATI (conto, pagamento, porto, valuta)
    // ============================================================
    doc.fontSize(7).font('Helvetica').fillColor(C.grigio);
    doc.text('conto', x0, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
        .text(` ${ordine.fornitore_codice}`, x0 + 30, y);

    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('pagamento / terms', x0 + 110, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
        .text(ordine.pagamento_descr || '', x0 + 210, y, { width: 180 });

    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('porto', x0 + 400, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
        .text(ordine.porto || '', x0 + 425, y);

    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('valuta', x0 + 475, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
        .text('EUR', x0 + 500, y);

    y += 18;

    // ============================================================
    // TABELLA ARTICOLI
    // ============================================================
    const cols = [
        { label: 'Cod.articolo\nOur Code',      x: x0,       w: 65,  align: 'left' },
        { label: 'Descrizione\nDescription',     x: x0 + 65,  w: 195, align: 'left' },
        { label: 'UM\nUnit',                     x: x0 + 260, w: 25,  align: 'center' },
        { label: 'Quantit\u00e0\nQuantity',      x: x0 + 285, w: 70,  align: 'right' },
        { label: 'Prezzo\nUnit Price',           x: x0 + 355, w: 55,  align: 'right' },
        { label: 'Sconti\nDiscount',             x: x0 + 410, w: 40,  align: 'right' },
        { label: 'Data Spedizione\nShipping Date',x: x0 + 450, w: 85,  align: 'center' }
    ];

    // Header riga
    const headerH = 22;
    doc.rect(x0, y, PAGE_W, headerH).fillAndStroke('#F0F0F0', C.lineaGrigio);
    doc.fillColor('#333333').fontSize(6).font('Helvetica-Bold');
    for (const col of cols) {
        const lines = col.label.split('\n');
        doc.text(lines[0], col.x + 2, y + 3, { width: col.w - 4, align: col.align });
        if (lines[1]) {
            doc.fontSize(5).font('Helvetica').fillColor(C.grigio)
                .text(lines[1], col.x + 2, y + 11, { width: col.w - 4, align: col.align });
        }
    }
    y += headerH;

    // Righe articolo
    for (const r of righe) {
        const descr = (r.mo_descr || '');
        const desint = (r.mo_desint || '').trim();
        const fullDescr = desint ? `${descr}\n${desint}` : descr;

        // Calcola altezza necessaria
        doc.fontSize(7.5).font('Helvetica');
        const descrH = doc.heightOfString(fullDescr, { width: cols[1].w - 4 });
        const rowH = Math.max(descrH + 6, 16);

        // Controlla se serve nuova pagina
        if (y + rowH > 780) {
            doc.addPage();
            y = MARGIN.top;
        }

        // Linea sotto
        doc.moveTo(x0, y + rowH).lineTo(x0 + PAGE_W, y + rowH)
            .lineWidth(0.3).strokeColor(C.lineaGrigio).stroke();

        // Valori
        doc.fontSize(7.5).font('Helvetica').fillColor(C.nero);
        doc.text(r.mo_codart || '',         cols[0].x + 2, y + 3, { width: cols[0].w - 4 });
        doc.text(fullDescr,                 cols[1].x + 2, y + 3, { width: cols[1].w - 4 });
        doc.text(r.mo_unmis || '',          cols[2].x + 2, y + 3, { width: cols[2].w - 4, align: 'center' });
        doc.text(fmtNum(r.mo_quant, 2),     cols[3].x + 2, y + 3, { width: cols[3].w - 4, align: 'right' });
        doc.text(fmtPrezzo(r.mo_prezzo),    cols[4].x + 2, y + 3, { width: cols[4].w - 4, align: 'right' });
        doc.text('',                        cols[5].x + 2, y + 3, { width: cols[5].w - 4, align: 'right' });
        doc.text(fmtData(r.mo_datcons),     cols[6].x + 2, y + 3, { width: cols[6].w - 4, align: 'center' });

        y += rowH;
    }

    // Linea finale tabella
    doc.moveTo(x0, y).lineTo(x0 + PAGE_W, y).lineWidth(0.5).strokeColor(C.lineaScuro).stroke();
    y += 12;

    // ============================================================
    // TOTALE ORDINE
    // ============================================================
    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('totale ordine', x0 + 350, y);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.nero)
        .text(fmtNum(ordine.totale_merce, 2), x0 + 430, y - 1, { width: 105, align: 'right' });
    y += 20;

    // ============================================================
    // CHIUSURA
    // ============================================================
    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('Distinti saluti / Regards', x0, y);
    y += 10;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C.nero)
        .text(AZIENDA.nome, x0, y);
    y += 11;
    doc.fontSize(8).font('Helvetica').fillColor(C.nero)
        .text(AZIENDA.firma_nome, x0, y);
    y += 14;
    doc.fontSize(6).fillColor(C.grigioChiaro)
        .text(AZIENDA.modulo, x0, y);
    y += 16;

    // ============================================================
    // NOTE LEGALI
    // ============================================================
    // Controlla spazio disponibile
    if (y > 600) {
        doc.addPage();
        y = MARGIN.top;
    }

    doc.fontSize(7).font('Helvetica').fillColor(C.grigio)
        .text('note / remarks', x0, y);
    y += 10;
    doc.fontSize(6).font('Helvetica').fillColor('#444444')
        .text(NOTE_LEGALI, x0, y, { width: PAGE_W, lineGap: 1.5 });
}

module.exports = { generaPdfOrdine, AZIENDA };
