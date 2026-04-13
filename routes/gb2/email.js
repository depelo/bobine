/**
 * GB2 Routes — SMTP + invio email + preview + template + drafts
 */
const { encrypt, decrypt } = require('../../config/crypto');
const smtp = require('../../config/smtp-gb2');
const { generaPdfOrdine } = require('../../utils/pdfOrdine');
module.exports = function(router, deps) {
    const { sql, getPoolMRP, getPoolProd, getPoolBcube, getActiveProfile, isProduction,
            PRODUCTION_PROFILE, authMiddleware } = deps;
    const helpers = deps.helpers;
    const getUserId = helpers.getUserId;
    const compilaTemplate = helpers.compilaTemplate;

    async function getPoolERP(userId) {
        if (isProduction(userId)) {
            const bcube = await getPoolBcube();
            if (bcube) return bcube;
        }
        return getPoolMRP(userId);
    }

router.get('/smtp/config', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const poolProd = await getPoolProd();
        const result = await poolProd.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT SmtpHost, SmtpPort, SmtpSecure, SmtpUser,
                           SmtpFromAddress, SmtpFromName, FirmaEmail,
                           ISNULL(TemplateMode, 'ultima_scelta') AS TemplateMode
                    FROM [GB2].[dbo].[UserPreferences]
                    WHERE IDUser = @userId`);

        if (!result.recordset.length) {
            return res.json({ configured: false, config: {} });
        }

        const row = result.recordset[0];
        const config = {
            host: row.SmtpHost || '',
            port: row.SmtpPort || 587,
            secure: !!row.SmtpSecure,
            user: row.SmtpUser || '',
            from_address: row.SmtpFromAddress || '',
            from_name: row.SmtpFromName || 'U.Jet s.r.l.',
            firma: row.FirmaEmail || '',
            templateMode: row.TemplateMode || 'ultima_scelta'
        };
        res.json({ configured: !!(config.host && config.from_address), config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Salva config SMTP dell'operatore loggato
router.post('/smtp/config', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { host, port, secure, user, password, from_address, from_name, firma } = req.body;

        const encPassword = (password && password.trim()) ? encrypt(password) : null;
        const poolProd = await getPoolProd();

        // Upsert: se la riga UserPreferences esiste, aggiorna; altrimenti crea
        const exists = await poolProd.request()
            .input('userId', sql.Int, userId)
            .query('SELECT 1 FROM [GB2].[dbo].[UserPreferences] WHERE IDUser = @userId');

        if (exists.recordset.length) {
            const req2 = poolProd.request()
                .input('userId', sql.Int, userId)
                .input('host', sql.VarChar(100), host || null)
                .input('port', sql.Int, port || 587)
                .input('secure', sql.Bit, secure ? 1 : 0)
                .input('user', sql.VarChar(100), user || null)
                .input('from_address', sql.VarChar(255), from_address || null)
                .input('from_name', sql.VarChar(100), from_name || 'U.Jet s.r.l.')
                .input('firma', sql.NVarChar(500), firma || null);

            let pwdClause = '';
            if (encPassword) {
                req2.input('pwd', sql.VarBinary(512), encPassword);
                pwdClause = ', SmtpPassword = @pwd';
            }

            await req2.query(`UPDATE [GB2].[dbo].[UserPreferences]
                SET SmtpHost = @host, SmtpPort = @port, SmtpSecure = @secure,
                    SmtpUser = @user, SmtpFromAddress = @from_address,
                    SmtpFromName = @from_name, FirmaEmail = @firma${pwdClause}, UpdatedAt = GETDATE()
                WHERE IDUser = @userId`);
        } else {
            const req2 = poolProd.request()
                .input('userId', sql.Int, userId)
                .input('host', sql.VarChar(100), host || null)
                .input('port', sql.Int, port || 587)
                .input('secure', sql.Bit, secure ? 1 : 0)
                .input('user', sql.VarChar(100), user || null)
                .input('pwd', sql.VarBinary(512), encPassword)
                .input('from_address', sql.VarChar(255), from_address || null)
                .input('from_name', sql.VarChar(100), from_name || 'U.Jet s.r.l.')
                .input('firma', sql.NVarChar(500), firma || null);

            await req2.query(`INSERT INTO [GB2].[dbo].[UserPreferences]
                (IDUser, SmtpHost, SmtpPort, SmtpSecure, SmtpUser, SmtpPassword,
                 SmtpFromAddress, SmtpFromName, FirmaEmail)
                VALUES (@userId, @host, @port, @secure, @user, @pwd, @from_address, @from_name, @firma)`);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test connessione SMTP dell'operatore loggato
router.post('/smtp/test', authMiddleware, async (req, res) => {
    try {
        const userId = getUserId(req);
        const smtpConfig = await smtp.getSmtpConfigForUser(userId);
        if (!smtpConfig || !smtpConfig.host) {
            return res.status(400).json({ success: false, error: 'SMTP non configurato. Configura prima host e credenziali.' });
        }
        const transporter = smtp.createTransporterFromConfig(smtpConfig);
        await transporter.verify();
        res.json({ success: true, message: 'Connessione SMTP verificata con successo' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// API: INVIO EMAIL ORDINE FORNITORE
// ============================================================

// Funzione interna: compila template per un ordine (usata da preview e invio)
async function _compilaEmailOrdine(userId, anno, serie, numord, template_id) {
    const pool = await getPoolProd();         // tabelle app (GB2, EmailTemplates, ecc.)
    const poolErp = await getPoolERP(userId); // tabelle BCube (testord, anagra, tabpaga)

    // Dati ordine (testata) — su BCube diretto, arricchita con campi bancari e pagamento
    const ordRes = await poolErp.request()
        .input('anno', sql.SmallInt, parseInt(anno, 10))
        .input('serie', sql.VarChar(3), serie)
        .input('numord', sql.Int, parseInt(numord, 10))
        .query(`
            SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                   t.td_conto, t.td_datord, t.td_totdoc,
                   t.td_banc1 AS ord_banc1,
                   a.an_descr1 AS fornitore_nome, a.an_email AS fornitore_email,
                   RTRIM(ISNULL(a.an_indir,'')) AS fornitore_indirizzo,
                   RTRIM(ISNULL(a.an_cap,'')) AS fornitore_cap,
                   RTRIM(ISNULL(a.an_citta,'')) AS fornitore_citta,
                   RTRIM(ISNULL(a.an_prov,'')) AS fornitore_prov,
                   RTRIM(ISNULL(a.an_banc1,'')) AS fornitore_banc1,
                   RTRIM(ISNULL(a.an_banc2,'')) AS fornitore_banc2,
                   ISNULL(a.an_abi,0) AS fornitore_abi,
                   ISNULL(a.an_cab,0) AS fornitore_cab,
                   RTRIM(ISNULL(a.an_iban,'')) AS fornitore_iban,
                   RTRIM(ISNULL(a.an_swift,'')) AS fornitore_swift,
                   RTRIM(ISNULL(p.tb_despaga,'')) AS fornitore_pagamento
            FROM dbo.testord t
            LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
            LEFT JOIN dbo.tabpaga p ON t.td_codpaga = p.tb_codpaga
            WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
              AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
        `);
    if (!ordRes.recordset.length) throw new Error('Ordine non trovato');
    const ordine = ordRes.recordset[0];

    // Risoluzione template (cascade)
    let template = null;

    let isPersonalizzato = false;

    if (template_id) {
        const tplRes = await pool.request()
            .input('tid', sql.Int, template_id)
            .query(`SELECT Oggetto, Corpo, FornitoreCode FROM [GB2].[dbo].[EmailTemplates] WHERE ID = @tid AND IsActive = 1`);
        if (tplRes.recordset.length) {
            template = tplRes.recordset[0];
            isPersonalizzato = template.FornitoreCode != null;
        }
    }

    if (!template) {
        const assRes = await pool.request()
            .input('uid', sql.Int, userId)
            .input('forn', sql.Int, ordine.td_conto)
            .query(`
                SELECT t.Oggetto, t.Corpo
                FROM [GB2].[dbo].[EmailTemplateAssegnazioni] a
                JOIN [GB2].[dbo].[EmailTemplates] t ON a.TemplateID = t.ID
                WHERE a.IDUser = @uid AND a.FornitoreCode = @forn AND t.IsActive = 1
            `);
        if (assRes.recordset.length) template = assRes.recordset[0];
    }

    if (!template) {
        const defRes = await pool.request()
            .input('uid', sql.Int, userId)
            .query(`SELECT Oggetto, Corpo FROM [GB2].[dbo].[EmailTemplates] WHERE IDUser = @uid AND IsDefault = 1 AND IsActive = 1`);
        if (defRes.recordset.length) template = defRes.recordset[0];
    }

    if (!template) {
        const sysRes = await pool.request()
            .query(`SELECT TOP 1 Oggetto, Corpo FROM [GB2].[dbo].[EmailTemplates] WHERE IsSystem = 1 AND Lingua = 'it' AND IsActive = 1 ORDER BY Ordine ASC`);
        if (sysRes.recordset.length) template = sysRes.recordset[0];
    }

    // Firma + nome operatore
    const prefRes = await pool.request()
        .input('uid', sql.Int, userId)
        .query(`SELECT FirmaEmail FROM [GB2].[dbo].[UserPreferences] WHERE IDUser = @uid`);
    const firmaEmail = (prefRes.recordset.length && prefRes.recordset[0].FirmaEmail) || '';

    const operRes = await pool.request()
        .input('uid', sql.Int, userId)
        .query(`SELECT Name AS NomeCompleto FROM [GA].[dbo].[Users] WHERE IDUser = @uid`);
    const nomeOperatore = (operRes.recordset.length && operRes.recordset[0].NomeCompleto) || '';

    // Conteggio righe (su BCube diretto)
    const righeCount = await poolErp.request()
        .input('anno', sql.SmallInt, parseInt(anno, 10))
        .input('serie', sql.VarChar(3), serie)
        .input('numord', sql.Int, parseInt(numord, 10))
        .query(`SELECT COUNT(*) AS cnt FROM dbo.movord WHERE codditt = 'UJET11' AND mo_tipork = 'O' AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord`);

    const dataOrdine = ordine.td_datord ? new Date(ordine.td_datord).toLocaleDateString('it-IT') : '';
    const totaleDoc = ordine.td_totdoc != null ? Number(ordine.td_totdoc).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : '';
    const datiTemplate = {
        fornitore: ordine.fornitore_nome || '',
        numord: `${numord}/${serie}`,
        data_ordine: dataOrdine,
        num_articoli: String(righeCount.recordset[0].cnt),
        totale: totaleDoc,
        operatore: nomeOperatore.trim(),
        firma: firmaEmail
    };

    let oggetto, corpo;
    if (template && isPersonalizzato) {
        // Messaggio personalizzato: testo fisso, nessuna compilazione placeholder
        oggetto = template.Oggetto;
        corpo = template.Corpo;
    } else if (template) {
        oggetto = compilaTemplate(template.Oggetto, datiTemplate);
        corpo = compilaTemplate(template.Corpo, datiTemplate);
    } else {
        oggetto = `NS/ ORDINE ${numord}_${serie} - ${ordine.fornitore_nome || ''}`;
        corpo = `Spett.le ${ordine.fornitore_nome || ''},\n\nin allegato l'ordine d'acquisto n. ${numord}/${serie}.\n\nCordiali saluti,\nU.Jet s.r.l.`;
    }

    return {
        oggetto,
        corpo,
        fornitore_nome: ordine.fornitore_nome || '',
        fornitore_email: ordine.fornitore_email || '',
        fornitore_codice: ordine.td_conto,
        _ordine: ordine  // dati grezzi per warning banca (evita query aggiuntiva)
    };
}

// Preview email ordine (compila template senza inviare)
router.post('/preview-ordine-email', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord, template_id } = req.body;
        if (!anno || !serie || !numord) return res.status(400).json({ error: 'anno, serie e numord obbligatori' });
        const userId = getUserId(req);

        const preview = await _compilaEmailOrdine(userId, anno, serie, numord, template_id);

        // Info ambiente
        const dbProfile = getActiveProfile(userId);
        const ambiente = dbProfile.ambiente || 'produzione';
        let destinatario = preview.fornitore_email;
        if (ambiente === 'prova') {
            destinatario = (dbProfile.email_prova || '').trim() || '(email prova non configurata)';
        }

        // Check banca mancante — usa i dati gia caricati da _compilaEmailOrdine (nessuna query aggiuntiva)
        let warningBanca = null;
        let fornitoreDati = null;
        if (preview._ordine) {
            const o = preview._ordine;
            const pag = (o.fornitore_pagamento || '').toUpperCase();
            const isRimDiretta = (pag.includes('RIM') && pag.includes('DIR')) || pag.includes('RIMESSA');
            const bancaVuota = !((o.ord_banc1 || '').trim()) && !((o.fornitore_banc1 || '').trim());
            if (isRimDiretta && bancaVuota) {
                warningBanca = 'Questo fornitore ha pagamento a Rimessa Diretta ma non ha dati bancari registrati.';
            }
            const cittaStr = [o.fornitore_cap, (o.fornitore_citta || '').toUpperCase(),
                o.fornitore_prov ? '(' + o.fornitore_prov + ')' : ''].filter(Boolean).join(' ');
            fornitoreDati = {
                codice: o.td_conto,
                nome: o.fornitore_nome,
                indirizzo: o.fornitore_indirizzo || '',
                citta: cittaStr,
                email: o.fornitore_email || '',
                pagamento: (o.fornitore_pagamento || '').trim(),
                banca1: o.fornitore_banc1 || '', banca2: o.fornitore_banc2 || '',
                abi: o.fornitore_abi || 0, cab: o.fornitore_cab || 0,
                iban: o.fornitore_iban || '', swift: o.fornitore_swift || ''
            };
        }

        res.json({
            oggetto: preview.oggetto,
            corpo: preview.corpo,
            fornitore_nome: preview.fornitore_nome,
            destinatario,
            ambiente,
            warning_banca: warningBanca,
            fornitore_dati: fornitoreDati
        });
    } catch (err) {
        console.error('[Preview Email] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/invia-ordine-email', authMiddleware, async (req, res) => {
    try {
        const { anno, serie, numord, pdf_base64, pdf_filename, email_override, template_id, oggetto_custom, corpo_custom } = req.body;

        if (!anno || !serie || !numord) {
            return res.status(400).json({ error: 'anno, serie e numord sono obbligatori' });
        }

        // Carica config SMTP dell'operatore loggato
        const userId = getUserId(req);
        const smtpConfig = await smtp.getSmtpConfigForUser(userId);
        if (!smtpConfig || !smtpConfig.host || !smtpConfig.from_address) {
            return res.status(409).json({ error: 'SMTP_NOT_CONFIGURED', message: 'SMTP non configurato per il tuo utente. Configura host e email mittente nelle impostazioni.' });
        }

        // Leggi dati ordine per email (fornitore, articoli)
        const pool = await getPoolERP(getUserId(req));
        const testataRes = await pool.request()
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(3), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .query(`
                SELECT t.td_conto, a.an_descr1 AS fornitore_nome, a.an_email AS fornitore_email,
                       t.td_totdoc, t.td_datord
                FROM dbo.testord t
                LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                  AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
            `);

        if (!testataRes.recordset.length) {
            return res.status(404).json({ error: 'Ordine non trovato nel DB' });
        }

        const ordine = testataRes.recordset[0];
        const emailDest = email_override || ordine.fornitore_email || '';

        if (!emailDest || !emailDest.trim()) {
            return res.status(400).json({ error: 'EMAIL_MISSING', message: 'Il fornitore non ha un indirizzo email configurato in anagrafica' });
        }

        // Splitta email multiple (separatore ;)
        const destinatariReali = emailDest.split(';').map(e => e.trim()).filter(Boolean);

        // Redirect email in ambiente prova
        const dbProfile = getActiveProfile(getUserId(req));
        const ambiente = dbProfile.ambiente || 'produzione';
        let destinatari = destinatariReali;
        let emailReale = destinatariReali.join(', ');

        if (ambiente === 'prova') {
            const emailProva = (dbProfile.email_prova || '').trim();
            if (!emailProva) {
                return res.status(400).json({
                    error: 'EMAIL_PROVA_MISSING',
                    message: 'Ambiente di prova: il campo "Email di prova" non è configurato nel profilo DB. Configurarlo prima di inviare email.'
                });
            }
            destinatari = [emailProva];
        }

        // PDF: usa quello passato dal frontend, o genera al volo
        let pdfBuf;
        if (pdf_base64) {
            pdfBuf = Buffer.from(pdf_base64, 'base64');
        } else {
            // Genera al volo
            const righeRes = await pool.request()
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`
                    SELECT mo_riga, mo_codart, mo_descr, mo_desint, mo_unmis,
                           mo_quant, mo_prezzo, mo_valore, mo_datcons, mo_fase, mo_magaz
                    FROM dbo.movord
                    WHERE codditt = 'UJET11' AND mo_tipork = 'O'
                      AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
                    ORDER BY mo_riga
                `);

            // Necessita dati testata completi per il PDF
            const testataFull = await pool.request()
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`
                    SELECT t.td_numord AS numord, t.td_anno AS anno, t.td_serie AS serie,
                           t.td_conto AS fornitore_codice, t.td_datord AS data_ordine,
                           t.td_porto AS porto, t.td_totmerce AS totale_merce,
                           t.td_totdoc AS totale_documento,
                           t.td_totdoc - t.td_totmerce AS totale_imposta,
                           a.an_descr1 AS fornitore_nome, a.an_indir AS fornitore_indirizzo,
                           a.an_cap AS fornitore_cap, a.an_citta AS fornitore_citta,
                           a.an_prov AS fornitore_prov, a.an_pariva AS fornitore_pariva,
                           a.an_email AS fornitore_email, a.an_faxtlx AS fornitore_fax
                    FROM dbo.testord t
                    LEFT JOIN dbo.anagra a ON t.td_conto = a.an_conto
                    WHERE t.codditt = 'UJET11' AND t.td_tipork = 'O'
                      AND t.td_anno = @anno AND t.td_serie = @serie AND t.td_numord = @numord
                `);

            pdfBuf = await generaPdfOrdine(testataFull.recordset[0], righeRes.recordset, { ambiente });
        }

        const nomeFile = pdf_filename || `OrdineForn${anno}${serie}${String(numord).padStart(6,'0')}.pdf`;
        const prefissoProva = ambiente === 'prova' ? '[PROVA] ' : '';

        // --- Compilazione oggetto e corpo email ---
        let oggetto, corpoHtml;

        if (oggetto_custom && corpo_custom) {
            // Override dal modale di anteprima editabile
            oggetto = prefissoProva + oggetto_custom;
            corpoHtml = corpo_custom.replace(/\n/g, '<br>');
        } else {
            // Compilazione automatica da template (cascade)
            const compiled = await _compilaEmailOrdine(userId, anno, serie, numord, template_id);
            oggetto = prefissoProva + compiled.oggetto;
            corpoHtml = compiled.corpo.replace(/\n/g, '<br>');
        }

        // Avviso prova in testa
        const avvisoProva = ambiente === 'prova'
            ? `<div style="background:#fff3cd; padding:10px 14px; border:1px solid #ffc107; border-radius:4px; margin-bottom:16px;">
                <strong>⚠️ ORDINE DI PROVA</strong> — Il destinatario reale sarebbe stato: <strong>${emailReale}</strong>
               </div>`
            : '';
        corpoHtml = avvisoProva + corpoHtml;

        // Invia con SMTP dell'operatore
        const transporter = smtp.createTransporterFromConfig(smtpConfig);
        const from = smtpConfig.from_name
            ? `"${smtpConfig.from_name}" <${smtpConfig.from_address}>`
            : smtpConfig.from_address;

        const info = await transporter.sendMail({
            from,
            to: destinatari.join(', '),
            subject: oggetto,
            html: corpoHtml,
            attachments: [{
                filename: nomeFile,
                content: pdfBuf,
                contentType: 'application/pdf'
            }]
        });

        // Aggiorna stato invio nel DB (SP su MRP@163)
        try {
            const poolSP = await getPoolProd();
            const spNameAggiorna = getSpName('usp_AggiornaStatoInvioOrdine', getActiveProfile(getUserId(req)));
            const spExists = await checkSpExists(poolSP, spNameAggiorna);
            if (spExists) {
                await poolSP.request()
                    .input('anno', sql.SmallInt, parseInt(anno, 10))
                    .input('serie', sql.VarChar(3), serie)
                    .input('numord', sql.Int, parseInt(numord, 10))
                    .input('stato', sql.VarChar(1), 'S')
                    .execute('dbo.' + spNameAggiorna);
            }
        } catch (errAggiorna) {
            console.warn('[Email] Ordine inviato ma errore aggiornamento stato:', errAggiorna.message);
        }

        // Aggiorna tracciamento email in ordini_emessi (sempre su MRP@163)
        try {
            const poolOE = await getPoolProd();
            await poolOE.request()
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(3), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`
                    UPDATE dbo.ordini_emessi
                    SET email_inviata = 1, email_inviata_il = GETDATE()
                    WHERE ord_anno = @anno AND ord_serie = @serie AND ord_numord = @numord
                `);
        } catch (errEmail) {
            console.warn('[Email] Tracciamento email_inviata fallito:', errEmail.message);
        }

        const risposta = {
            success: true,
            message_id: info.messageId,
            destinatari,
            ordine: { anno, serie, numord, fornitore: ordine.fornitore_nome }
        };

        if (ambiente === 'prova') {
            risposta.ambiente = 'prova';
            risposta.email_reale = emailReale;
            risposta.email_prova = destinatari.join(', ');
        }

        // Cancella eventuale bozza dopo invio riuscito
        try {
            const poolDraft = await getPoolProd();
            await poolDraft.request()
                .input('uid', sql.Int, userId)
                .input('anno', sql.SmallInt, parseInt(anno, 10))
                .input('serie', sql.VarChar(5), serie)
                .input('numord', sql.Int, parseInt(numord, 10))
                .query(`DELETE FROM [GB2].[dbo].[EmailDrafts] WHERE IDUser = @uid AND Anno = @anno AND Serie = @serie AND NumOrd = @numord`);
        } catch (errDraft) {
            console.warn('[Email] Pulizia bozza fallita:', errDraft.message);
        }

        res.json(risposta);
    } catch (err) {
        console.error('[Invia Email] Errore:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// API: EMAIL DRAFTS (bozze email personalizzate)
// ============================================================

// GET /email-drafts — tutte le bozze dell'operatore (o filtrate per ordine)
router.get('/email-drafts', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const { anno, serie, numord } = req.query;

        let query = `SELECT ID, Anno, Serie, NumOrd, OggettoCustom, CorpoCustom, DataModifica
                      FROM [GB2].[dbo].[EmailDrafts] WHERE IDUser = @uid`;
        const request = pool.request().input('uid', sql.Int, userId);

        if (anno && serie && numord) {
            query += ` AND Anno = @anno AND Serie = @serie AND NumOrd = @numord`;
            request.input('anno', sql.SmallInt, parseInt(anno, 10));
            request.input('serie', sql.VarChar(5), serie);
            request.input('numord', sql.Int, parseInt(numord, 10));
        }

        const result = await request.query(query);
        res.json({ drafts: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /email-drafts — upsert bozza (salva o aggiorna)
router.put('/email-drafts', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const { anno, serie, numord, oggetto, corpo } = req.body;

        if (!anno || !serie || !numord || !oggetto || !corpo) {
            return res.status(400).json({ error: 'anno, serie, numord, oggetto e corpo sono obbligatori' });
        }

        await pool.request()
            .input('uid', sql.Int, userId)
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(5), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .input('oggetto', sql.NVarChar(500), oggetto)
            .input('corpo', sql.NVarChar(sql.MAX), corpo)
            .query(`
                MERGE [GB2].[dbo].[EmailDrafts] AS target
                USING (SELECT @uid AS IDUser, @anno AS Anno, @serie AS Serie, @numord AS NumOrd) AS source
                ON target.IDUser = source.IDUser AND target.Anno = source.Anno AND target.Serie = source.Serie AND target.NumOrd = source.NumOrd
                WHEN MATCHED THEN UPDATE SET OggettoCustom = @oggetto, CorpoCustom = @corpo, DataModifica = GETDATE()
                WHEN NOT MATCHED THEN INSERT (IDUser, Anno, Serie, NumOrd, OggettoCustom, CorpoCustom) VALUES (@uid, @anno, @serie, @numord, @oggetto, @corpo);
            `);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /email-drafts — cancella bozza specifica
router.delete('/email-drafts', authMiddleware, async (req, res) => {
    try {
        const pool = await getPoolProd();
        const userId = getUserId(req);
        const { anno, serie, numord } = req.body;

        await pool.request()
            .input('uid', sql.Int, userId)
            .input('anno', sql.SmallInt, parseInt(anno, 10))
            .input('serie', sql.VarChar(5), serie)
            .input('numord', sql.Int, parseInt(numord, 10))
            .query(`DELETE FROM [GB2].[dbo].[EmailDrafts] WHERE IDUser = @uid AND Anno = @anno AND Serie = @serie AND NumOrd = @numord`);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
};
