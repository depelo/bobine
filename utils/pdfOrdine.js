/**
 * Generazione PDF Ordine Fornitore — replica layout BCube (Crystal Reports)
 * Layout verificato su Ujetorfo.rpt (Italia) e Ujetorfv.rpt (Estero).
 * Usa pdfmake per generare un Buffer PDF server-side — layout dichiarativo a tabelle.
 * Formato pagina: A4.
 *
 * Riferimento completo: gb2/BCUBE-PDF-ORDINI-REFERENCE.md
 */

const PdfPrinter = require('pdfmake/src/printer');
const path = require('path');
const fs = require('fs');

// ============================================================
// FONT
// ============================================================
const fonts = {
    Helvetica: {
        normal: 'Helvetica', bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique'
    }
};
const printer = new PdfPrinter(fonts);

// ============================================================
// ASSETS (caricati una volta al boot)
// ============================================================
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const LOGO_B64 = (() => {
    const p = path.join(ASSETS_DIR, 'logo-ujet.jpeg');
    return fs.existsSync(p) ? 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64') : null;
})();
const FIRMA_B64 = (() => {
    const p = path.join(ASSETS_DIR, 'firma-tardioli.png');
    return fs.existsSync(p) ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64') : null;
})();

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
// FORMATTER HELPERS (identici al vecchio pdfOrdine)
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

function ss(val) { return (val || '').toString().replace(/\r/g, '').replace(/\u00d0/g, '').trim(); }

// ============================================================
// LAYOUT BORDI — sottili e neri, stile Crystal Reports
// ============================================================
const thinBorders = {
    hLineWidth: () => 0.4,
    vLineWidth: () => 0.4,
    hLineColor: () => '#000',
    vLineColor: () => '#000',
    paddingLeft: () => 3,
    paddingRight: () => 3,
    paddingTop: () => 2,
    paddingBottom: () => 2
};

const thinBordersPadded = {
    ...thinBorders,
    paddingTop: () => 2,
    paddingBottom: () => 4
};

// Helper: cella con label grigia sopra e valore bold sotto
function labelValue(label, value) {
    return { text: [{ text: label + '\n', fontSize: 6.5, color: '#555' }, { text: value || '', fontSize: 8, bold: true }] };
}

// ============================================================
// BUILDER: HEADER (logo + azienda SX | destinatario DX)
// ============================================================
function buildHeader(ordine, isEstero, isProva) {
    // Dati azienda colonna sinistra
    const aziendaStack = [];
    if (LOGO_B64) {
        aziendaStack.push({ image: LOGO_B64, fit: [140, 45], margin: [0, 0, 0, 4] });
    } else {
        aziendaStack.push({ text: 'U.Jet', fontSize: 18, bold: true });
    }
    aziendaStack.push({ text: AZIENDA.nome, bold: true, fontSize: 8 });
    aziendaStack.push({ text: AZIENDA.indirizzo, fontSize: 7.5 });
    aziendaStack.push({ text: AZIENDA.cap_citta, fontSize: 7.5 });
    aziendaStack.push({ text: 'Tel: ' + AZIENDA.tel + ' - Fax: ' + AZIENDA.fax, fontSize: 7.5 });

    if (!isEstero) {
        aziendaStack.push({ text: 'Mail: ' + AZIENDA.email, fontSize: 7.5 });
        aziendaStack.push({ text: 'PEC: ' + AZIENDA.pec, fontSize: 7.5 });
        aziendaStack.push({ text: 'Website: ' + AZIENDA.web, fontSize: 7.5, margin: [0, 0, 0, 3] });
    }

    aziendaStack.push({ text: AZIENDA.capsoc, fontSize: 6 });
    aziendaStack.push({ text: AZIENDA.registro, fontSize: 6 });

    if (!isEstero) {
        aziendaStack.push({ text: 'Codice destinatario univoco (SDI): ' + AZIENDA.sdi, fontSize: 6 });
    }

    // Destinatario colonna destra
    const destStack = [];

    // "PROVA" + "ORDINE D'ACQUISTO"
    if (isProva) {
        destStack.push({ text: 'PROVA', fontSize: 10, bold: true, color: '#cc0000', alignment: 'right' });
    }
    destStack.push({ text: 'ORDINE D\'ACQUISTO', fontSize: 11, bold: true, alignment: 'right', margin: [0, 0, 0, 10] });

    destStack.push({ text: 'Destinatario :', fontSize: 7, color: '#555' });

    // Nome fornitore + ( categoria )
    const nomeFornitore = ss(ordine.fornitore_nome).toUpperCase();
    const categ = ordine.fornitore_categ ? '( ' + ordine.fornitore_categ + ' )' : '';
    if (categ) {
        destStack.push({
            columns: [
                { text: nomeFornitore, fontSize: 10, bold: true, width: '*' },
                { text: categ, fontSize: 8, color: '#555', width: 35, alignment: 'right' }
            ],
            margin: [0, 2, 0, 0]
        });
    } else {
        destStack.push({ text: nomeFornitore, fontSize: 10, bold: true, margin: [0, 2, 0, 0] });
    }

    // Indirizzo
    if (ss(ordine.fornitore_indirizzo)) {
        destStack.push({ text: ss(ordine.fornitore_indirizzo), fontSize: 8, margin: [0, 2, 0, 0] });
    }

    // CAP Citta (Prov) — formula @CITTAPROV
    const cittaParts = [ss(ordine.fornitore_cap), ss(ordine.fornitore_citta).toUpperCase()];
    if (ss(ordine.fornitore_prov)) cittaParts.push('(' + ss(ordine.fornitore_prov) + ')');
    destStack.push({ text: cittaParts.filter(Boolean).join(' '), fontSize: 8 });

    // Fax
    if (ss(ordine.fornitore_fax)) {
        destStack.push({
            columns: [
                { text: 'Fax :', fontSize: 7, color: '#555', width: 28 },
                { text: ss(ordine.fornitore_fax), fontSize: 8, width: '*' }
            ],
            margin: [0, 4, 0, 0]
        });
    }

    // Luogo di destinazione (DESTDIV) — se presente
    if (ss(ordine.dest_nome)) {
        destStack.push({ text: '', margin: [0, 4, 0, 0] });
        destStack.push({ text: 'Luogo di destinazione :', fontSize: 7, color: '#555' });
        destStack.push({ text: ss(ordine.dest_nome), fontSize: 8, bold: true });
        if (ss(ordine.dest_indirizzo)) {
            destStack.push({ text: ss(ordine.dest_indirizzo), fontSize: 8 });
        }
        const destCitta = [ss(ordine.dest_cap), ss(ordine.dest_citta)];
        if (ss(ordine.dest_prov)) destCitta.push('(' + ss(ordine.dest_prov) + ')');
        destStack.push({ text: destCitta.filter(Boolean).join(' '), fontSize: 8 });
    }

    return {
        columns: [
            { width: 230, stack: aziendaStack },
            { width: '*', stack: destStack }
        ],
        columnGap: 20,
        margin: [0, 0, 0, 8]
    };
}

// ============================================================
// BUILDER: METADATI (titolo + griglia conto/pagamento/porto)
// ============================================================
function buildMetadati(ordine, isEstero) {
    const numSerie = ss(ordine.serie) ? ordine.numord + '/' + ss(ordine.serie) : String(ordine.numord);
    const titolo = 'Ordine d\'Acquisto n\u00b0 ' + numSerie + ' del ' + fmtData(ordine.data_ordine);

    // Banca — Italia: da testord (banca appoggio azienda), Estero: da anagra (banca fornitore)
    const banca1 = isEstero ? ss(ordine.fornitore_banca_1) : ss(ordine.banca_appoggio_1);
    const banca2 = isEstero ? ss(ordine.fornitore_banca_2) : ss(ordine.banca_appoggio_2);
    const bancaStr = [banca1, banca2].filter(Boolean).join(' - ');

    // Porto descrizione
    const portoDescr = ss(ordine.porto_descr);

    // Valuta
    const valutaLabel = isEstero ? ss(ordine.valuta_nome) : (ss(ordine.valuta_sigla) || 'EUR');

    return [
        // Tabella titolo + rif
        {
            table: {
                widths: ['*', 90],
                body: [[
                    { text: titolo, fontSize: 9.5, bold: true },
                    { text: 'Rif. / Ref.' + (ss(ordine.riferimento) ? '\n' + ss(ordine.riferimento) : ''), fontSize: 7, bold: true }
                ]]
            },
            layout: thinBorders
        },
        // Tabella conto | pagamento | banca
        {
            table: {
                widths: [52, 175, '*'],
                body: [[
                    labelValue('conto', String(ordine.fornitore_codice || '')),
                    labelValue('pagamento / terms', ss(ordine.pagamento_descr)),
                    labelValue('banca d\'appoggio / bank', bancaStr)
                ]]
            },
            layout: thinBordersPadded,
            margin: [0, -0.4, 0, 0]
        },
        // Tabella spedizione | vettore
        {
            table: {
                widths: ['*', '*'],
                body: [[
                    { text: 'spedizione a mezzo del / despatch by', fontSize: 6.5, color: '#555' },
                    { text: 'vettore', fontSize: 6.5, color: '#555' }
                ]]
            },
            layout: thinBorders,
            margin: [0, -0.4, 0, 0]
        },
        // Tabella porto | valuta | imballo
        {
            table: {
                widths: [165, 115, '*'],
                body: [[
                    labelValue('porto', portoDescr),
                    labelValue('valuta', valutaLabel),
                    { text: [{ text: 'imballo / packaging\n', fontSize: 6.5, color: '#555' }, { text: 'GRATIS', fontSize: 8, bold: true }], alignment: 'right' }
                ]]
            },
            layout: thinBordersPadded,
            margin: [0, -0.4, 0, 0]
        }
    ];
}

// ============================================================
// BUILDER: DESCRIZIONE RIGA (con tutte le sotto-righe Crystal)
// ============================================================
function buildDescrizioneRiga(r, isEstero) {
    const parts = [];
    const isDescRiga = ss(r.mo_codart) === 'D';

    // Descrizione principale
    parts.push({ text: ss(r.mo_descr), fontSize: 8 });

    // Descrizione integrativa
    if (ss(r.mo_desint)) {
        const desintParts = [];
        // Codice alternativo (solo Italia, nella stessa riga della desint)
        if (!isEstero && ss(r.ar_codalt) && ss(r.ar_codalt) !== 'D') {
            desintParts.push({ text: '(' + ss(r.ar_codalt) + ') ', fontSize: 6.5, color: '#555' });
        }
        desintParts.push({ text: ss(r.mo_desint), fontSize: 6.5, color: '#555' });
        parts.push({ text: desintParts });
    }

    // LOT (solo se lotto > 0)
    if (r.mo_lotto && Number(r.mo_lotto) > 0) {
        parts.push({ text: 'LOT ' + r.mo_lotto, fontSize: 6.5, color: '#555' });
    }

    // Note articolo (ar_note) — max 5 righe come Crystal Reports (Can Grow, max lines = 5)
    if (ss(r.ar_note)) {
        const arNoteLines = ss(r.ar_note).split(/\r?\n/).slice(0, 5).join('\n').trim();
        if (arNoteLines) parts.push({ text: arNoteLines, fontSize: 6, color: '#555' });
    }

    // N.B. note riga (mo_note)
    if (ss(r.mo_note)) {
        parts.push({ text: [{ text: 'N.B.: ', bold: true, fontSize: 6.5, color: '#555' }, { text: ss(r.mo_note), fontSize: 6.5, color: '#555' }] });
    }

    // Riferimenti fornitore (tabella CODARFO)
    if (ss(r.rif_fornitore)) {
        let rifStr = 'Riferimenti fornitore: ' + ss(r.rif_fornitore);
        if (ss(r.rif_note)) rifStr += '    ' + ss(r.rif_note);
        parts.push({ text: rifStr, fontSize: 6.5, color: '#555' });
    }

    // Conversione UM (solo Italia, se UM diverse)
    if (!isEstero && ss(r.mo_unmis) !== ss(r.mo_ump) && r.ar_conver && Number(r.ar_conver) !== 0) {
        const conv = Math.round(1 / Number(r.ar_conver));
        parts.push({ text: '1 ' + ss(r.mo_unmis) + ' = ' + conv + ' ' + ss(r.mo_ump), fontSize: 6, color: '#555' });
    }

    return { stack: parts };
}

// ============================================================
// BUILDER: TABELLA ARTICOLI
// ============================================================
function buildTabellaArticoli(righe, isEstero) {
    // Header colonne (con label IT + EN)
    const mkHeader = (it, en, align) => ({
        text: [{ text: it + '\n', bold: true, fontSize: 7 }, { text: en, fontSize: 5.5, color: '#555' }],
        alignment: align || 'left'
    });

    const headerRow = isEstero
        ? [
            mkHeader('Cod.articolo', 'Our Code'),
            mkHeader('Descrizione', 'Description'),
            mkHeader('UM', 'Unit', 'center'),
            mkHeader('Q.t\u00e0', 'Quantity', 'right'),
            mkHeader('Prezzo', 'Unit Price', 'right'),
            mkHeader('Sconti', 'Disc.', 'right'),
            mkHeader('Cons.', 'Deliv.time', 'center'),
            mkHeader('Note', 'Remarks')
        ]
        : [
            mkHeader('Cod.articolo', 'Our Code'),
            mkHeader('Descrizione', 'Description'),
            mkHeader('UM', 'Unit', 'center'),
            mkHeader('Quantit\u00e0', 'Quantity', 'right'),
            mkHeader('Prezzo', 'Unit Price', 'right'),
            mkHeader('Sconti', 'Discount', 'right'),
            mkHeader('Data Spedizione', 'Shipping Date', 'center'),
            mkHeader('Note', 'Remarks')
        ];

    const body = [headerRow];

    for (const r of righe) {
        const isDescRiga = ss(r.mo_codart) === 'D';

        // Formula @UM
        let um = '';
        if (!isDescRiga) {
            if (isEstero) {
                um = ss(r.mo_unmis);
            } else {
                um = (ss(r.mo_unmis) === ss(r.mo_ump)) ? ss(r.mo_ump) : ss(r.mo_unmis);
            }
        }

        // Formula @QUANT
        let quant = '';
        if (!isDescRiga) {
            if (isEstero) {
                quant = fmtNum(r.mo_quant, 2);
            } else {
                quant = fmtNum((ss(r.mo_unmis) === ss(r.mo_ump)) ? r.mo_quant : r.mo_colli, 2);
            }
        }

        body.push([
            { text: isDescRiga ? '' : ss(r.mo_codart), fontSize: 8 },
            buildDescrizioneRiga(r, isEstero),
            { text: um, fontSize: 8, alignment: 'center' },
            { text: quant, fontSize: 8, alignment: 'right' },
            { text: isDescRiga ? '' : fmtPrezzo(r.mo_prezzo), fontSize: 8, alignment: 'right' },
            { text: isDescRiga ? '' : fmtSconti(r.mo_scont1, r.mo_scont2, r.mo_scont3), fontSize: 6, alignment: 'right' },
            { text: isDescRiga ? '' : fmtData(r.mo_datcons), fontSize: 7, alignment: 'center' },
            { text: '', fontSize: 7 } // Note/Remarks (colonna per uso futuro)
        ]);
    }

    return {
        table: {
            headerRows: 1, // pdfmake ripete l'header su ogni pagina automaticamente
            widths: [52, '*', 20, 58, 45, 28, 65, 28],
            body
        },
        layout: thinBorders
    };
}

// ============================================================
// BUILDER: FOOTER (totale + note + firma + note legali)
// ============================================================
function buildFooter(ordine, isEstero) {
    const valSigla = ss(ordine.valuta_sigla) || 'EUR';

    // Note ordine — solo td_note (note ordine inserite dall'operatore).
    // an_note e an_note2 sono contatti interni del fornitore e NON vanno stampati.
    const noteText = ss(ordine.note_ordine);

    const content = [];

    // Totale ordine
    content.push({
        columns: [
            { text: '', width: '*' },
            { text: 'totale ordine', fontSize: 7, color: '#555', width: 'auto', margin: [0, 5, 12, 0] },
            { text: valSigla + '  ' + fmtNum(ordine.totale_merce, 2), fontSize: 11, bold: true, width: 'auto', alignment: 'right' }
        ],
        margin: [0, 8, 0, 0]
    });

    // "Si autorizza l'emissione..."
    content.push({
        text: 'Si autorizza l\'emissione del presente ordine in deroga alla procedura 005 D.G.',
        fontSize: 6.5, margin: [0, 10, 0, 0]
    });

    // Tabella note/remarks | saluti + firma
    const firmaStack = [
        { text: 'Distinti saluti / Regards', fontSize: 7, color: '#555', alignment: 'right' },
        { text: AZIENDA.nome, fontSize: 8, bold: true, margin: [0, 3, 0, 0], alignment: 'right' },
        { text: AZIENDA.firma_nome, fontSize: 8, margin: [0, 1, 0, 0], alignment: 'right' }
    ];
    if (FIRMA_B64) {
        firmaStack.push({ image: FIRMA_B64, fit: [90, 30], alignment: 'right', margin: [0, 4, 0, 0] });
    }

    content.push({
        table: {
            widths: ['*', 180],
            body: [[
                {
                    stack: [
                        { text: 'note / remarks', fontSize: 7, color: '#555' },
                        noteText ? { text: noteText, fontSize: 6.5, margin: [0, 4, 0, 0] } : {}
                    ]
                },
                { stack: firmaStack }
            ]]
        },
        layout: { ...thinBorders, paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 8, 0, 0]
    });

    // Nota DM/shelf-life (bold, solo Italia)
    if (!isEstero) {
        content.push({
            text: 'Per i dispositivi in ordine si chiede di inviare lotti preferibilmente univoci, tassativamente con il massimo di residuo di vita, quantomeno mai inferiore ai 2/3 della sua shelf-life.',
            fontSize: 6, bold: true, margin: [0, 10, 0, 0]
        });
    }

    // Note legali
    const noteLegali = isEstero ? NOTE_LEGALI_EX : NOTE_LEGALI_IT;
    // Rimuovi la frase shelf-life dalle note legali IT per non duplicarla
    const noteLegaliClean = isEstero ? noteLegali :
        noteLegali.replace(/\n\nPer i dispositivi.*shelf-life\./s, '');

    content.push({ text: noteLegaliClean, fontSize: 5.5, margin: [0, 6, 0, 0], lineHeight: 1.15 });

    return content;
}

// ============================================================
// FUNZIONE PRINCIPALE
// ============================================================
async function generaPdfOrdine(ordine, righe, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const isProva = options.ambiente === 'prova';
            const isEstero = ss(ordine.fornitore_tipo) === 'EXTRA_UE';

            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [30, 28, 30, 30],
                defaultStyle: { font: 'Helvetica', fontSize: 7.5, lineHeight: 1.15 },
                info: {
                    title: (isProva ? '[PROVA] ' : '') + 'Ordine ' + ordine.numord + '/' + ss(ordine.serie) + ' - ' + ss(ordine.fornitore_nome),
                    author: 'U.Jet s.r.l. - GB2',
                    subject: 'Ordine d\'Acquisto Fornitore'
                },
                content: [
                    buildHeader(ordine, isEstero, isProva),
                    ...buildMetadati(ordine, isEstero),
                    buildTabellaArticoli(righe, isEstero),
                    ...buildFooter(ordine, isEstero)
                ]
            };

            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', err => reject(err));
            pdfDoc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generaPdfOrdine, AZIENDA };
