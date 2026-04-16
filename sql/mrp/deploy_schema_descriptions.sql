-- ============================================================
-- DESCRIZIONI SCHEMA [GB2] — ms_description su tabelle e colonne
-- Scopo: documentare il DB [GB2] per chiunque lo navighi in SSMS
-- Deploy: eseguire su [GB2] nel server 163
-- Data: 13 Aprile 2026
-- ============================================================

-- Helper: procedura per aggiungere o aggiornare ms_description
-- (evita errori se la description esiste gia)
IF OBJECT_ID('tempdb..#AddDesc') IS NOT NULL DROP PROCEDURE #AddDesc;
GO
CREATE PROCEDURE #AddDesc
    @schema SYSNAME, @table SYSNAME, @column SYSNAME = NULL, @desc NVARCHAR(2000)
AS
BEGIN
    IF @column IS NULL
    BEGIN
        -- Descrizione tabella
        IF EXISTS (SELECT 1 FROM sys.extended_properties ep
                   JOIN sys.tables t ON ep.major_id = t.object_id
                   WHERE t.name = @table AND ep.minor_id = 0 AND ep.name = 'MS_Description')
            EXEC sp_updateextendedproperty 'MS_Description', @desc, 'SCHEMA', @schema, 'TABLE', @table;
        ELSE
            EXEC sp_addextendedproperty 'MS_Description', @desc, 'SCHEMA', @schema, 'TABLE', @table;
    END
    ELSE
    BEGIN
        -- Descrizione colonna
        IF EXISTS (SELECT 1 FROM sys.extended_properties ep
                   JOIN sys.tables t ON ep.major_id = t.object_id
                   JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
                   WHERE t.name = @table AND c.name = @column AND ep.name = 'MS_Description')
            EXEC sp_updateextendedproperty 'MS_Description', @desc, 'SCHEMA', @schema, 'TABLE', @table, 'COLUMN', @column;
        ELSE
            EXEC sp_addextendedproperty 'MS_Description', @desc, 'SCHEMA', @schema, 'TABLE', @table, 'COLUMN', @column;
    END
END;
GO

-- ============================================================
-- 1. DeployVersion
-- ============================================================
EXEC #AddDesc 'dbo', 'DeployVersion', NULL,
    'Versioning delle stored procedure deployate da GB2. Una sola riga. Al boot l''app confronta DEPLOY_VERSION (costante in helpers.js) con Versione: se diversa, ri-deploya le SP nel DB [GB2] del server di destinazione (BCUBE2 o prova).';
EXEC #AddDesc 'dbo', 'DeployVersion', 'Versione',
    'Versione corrente delle SP deployate (es. "2.1"). Confrontata con la costante DEPLOY_VERSION nel codice Node.js.';
EXEC #AddDesc 'dbo', 'DeployVersion', 'DeployedAt',
    'Timestamp dell''ultimo deploy riuscito.';

-- ============================================================
-- 2. ElaborazioniMRP
-- ============================================================
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', NULL,
    'Tracciamento batch MRP. Ogni notte BCube ricalcola ordlist e tutte le proposte condividono lo stesso ol_ultagg (fingerprint). Quando l''app rileva un nuovo fingerprint, crea una riga qui e una foto delle proposte in SnapshotProposte.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'ID',
    'Chiave primaria identity. Usato come elaborazione_id in ordini_emessi e SnapshotProposte.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'Fingerprint',
    'Data dell''elaborazione MRP notturna di BCube. Corrisponde a ordlist.ol_ultagg. Tutte le proposte di un batch hanno lo stesso valore.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'RilevatoIl',
    'Quando l''app ha rilevato questo batch per la prima volta (GET /proposta-ordini).';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'TotaleProposte',
    'Numero totale di proposte nel batch al momento del rilevamento.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'TotaleGestite',
    'Numero di proposte per le quali e stato emesso un ordine. Aggiornato ad ogni emissione/annullamento.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'IDUser',
    'IDUser (da GA.dbo.Users) dell''operatore che ha rilevato il batch. Piu operatori possono lavorare sullo stesso batch.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'Note',
    'Note libere dell''operatore (non ancora usato nell''UI).';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'CreatedAt',
    'Timestamp creazione record.';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'UpdatedAt',
    'Timestamp ultimo aggiornamento (es. aggiornamento TotaleGestite).';
EXEC #AddDesc 'dbo', 'ElaborazioniMRP', 'Ambiente',
    'Distingue elaborazioni di produzione da quelle di prova. Valori: "produzione" o "prova". Parte dell''indice univoco (Fingerprint, Ambiente).';

-- ============================================================
-- 3. EmailDrafts
-- ============================================================
EXEC #AddDesc 'dbo', 'EmailDrafts', NULL,
    'Bozze email personalizzate per ordine. Quando l''operatore modifica oggetto/corpo di una email prima di inviarla, la bozza viene salvata qui. Al prossimo invio/apertura la bozza viene riproposta. Cancellata dopo l''invio riuscito.';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'ID', 'PK identity.';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'IDUser',
    'Operatore proprietario della bozza. FK verso GA.dbo.Users.IDUser.';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'Anno',
    'Anno ordine (td_anno in testord). Parte della chiave logica ordine.';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'Serie',
    'Serie ordine (td_serie, es. "F"). Parte della chiave logica ordine.';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'NumOrd',
    'Numero ordine (td_numord). Insieme ad Anno e Serie identifica univocamente l''ordine.';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'OggettoCustom',
    'Oggetto email personalizzato dall''operatore (sovrascrive il template).';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'CorpoCustom',
    'Corpo email personalizzato dall''operatore (NVARCHAR MAX, puo contenere HTML).';
EXEC #AddDesc 'dbo', 'EmailDrafts', 'DataModifica',
    'Ultimo salvataggio della bozza.';

-- ============================================================
-- 4. EmailTemplateAssegnazioni
-- ============================================================
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', NULL,
    'Associazione fornitore → template email per operatore. Quando l''operatore sceglie un template per un fornitore, la scelta viene salvata qui. Al prossimo ordine per lo stesso fornitore, il template viene pre-selezionato.';
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', 'ID', 'PK identity.';
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', 'IDUser',
    'Operatore. Ogni operatore ha le sue assegnazioni indipendenti.';
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', 'FornitoreCode',
    'Codice fornitore BCube (an_conto in anagra). Identifica il fornitore.';
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', 'TemplateID',
    'FK verso EmailTemplates.ID. Il template assegnato a questo fornitore per questo operatore.';
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', 'CreatedAt', 'Timestamp prima assegnazione.';
EXEC #AddDesc 'dbo', 'EmailTemplateAssegnazioni', 'UpdatedAt', 'Timestamp ultima modifica assegnazione.';

-- ============================================================
-- 5. EmailTemplates
-- ============================================================
EXEC #AddDesc 'dbo', 'EmailTemplates', NULL,
    'Template email per ordini fornitore. Tre tipi: (1) System (IsSystem=1): Standard Italiano, English, Urgente — creati al primo accesso di ogni utente come copie personali modificabili. (2) Generici (FornitoreCode NULL): template dell''operatore usabili per qualsiasi fornitore. (3) Personalizzati (FornitoreCode valorizzato): template specifici per un fornitore. Placeholder disponibili: {fornitore}, {numord}, {data_ordine}, {num_articoli}, {totale}, {operatore}, {firma}.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'ID', 'PK identity.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'IDUser',
    'Operatore proprietario. NULL per template condivisi (non usato attualmente, tutti hanno un IDUser).';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'Nome',
    'Nome visualizzato nel dropdown template (es. "Standard Italiano", "Urgente").';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'Oggetto',
    'Oggetto email con placeholder. Es: "Ordine {numord} - U.Jet S.r.l.". Compilato a runtime con i dati dell''ordine.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'Corpo',
    'Corpo email (NVARCHAR MAX) con placeholder. Testo libero che viene compilato sostituendo {fornitore}, {numord}, ecc.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'IsDefault',
    'Template predefinito dell''operatore. Se nessun template e assegnato al fornitore, viene usato questo.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'IsSystem',
    'Template di sistema (Standard Italiano, English, Urgente). Creati automaticamente per ogni nuovo utente. Ogni utente ha le sue copie editabili.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'Lingua',
    'Codice lingua del template: "it" (italiano), "en" (inglese), "ur" (urgente). Usato per icone/badge nell''UI.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'Ordine',
    'Ordine di visualizzazione nel dropdown (i system appaiono per primi).';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'CreatedAt', 'Timestamp creazione.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'UpdatedAt', 'Timestamp ultima modifica.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'IsActive',
    'Soft-delete: 0 = template disattivato, non appare nel dropdown.';
EXEC #AddDesc 'dbo', 'EmailTemplates', 'FornitoreCode',
    'Se valorizzato (es. 20010260): template personalizzato per quel fornitore specifico. NULL = template generico. Corrisponde a anagra.an_conto. I template personalizzati appaiono sotto "★ Personalizzati" nel dropdown.';

-- ============================================================
-- 6. Operators
-- ============================================================
EXEC #AddDesc 'dbo', 'Operators', NULL,
    'Tabella visto GB2. Ogni riga rappresenta un operatore autorizzato ad usare il modulo GB2 (MRP web). Creata dal Captain quando assegna il visto GB2 a un utente. Quando viene creata, il sistema crea automaticamente anche un operatore BCube in [BCUBE2].[ARCPROC].[dbo].[OPERAT] con codice GB2{IDUser}.';
EXEC #AddDesc 'dbo', 'Operators', 'IDOperator', 'PK identity.';
EXEC #AddDesc 'dbo', 'Operators', 'IDUser',
    'FK verso GA.dbo.Users.IDUser. Identifica l''utente del portale.';
EXEC #AddDesc 'dbo', 'Operators', 'Admin',
    'Livello di accesso: 1 = UAD (Admin, puo gestire configurazione), 0 = UAC (Base, solo operativita).';
EXEC #AddDesc 'dbo', 'Operators', 'IsActive',
    'Soft-delete: 0 = visto revocato, l''utente non puo accedere a GB2.';

-- ============================================================
-- 7. ordini_emessi
-- ============================================================
EXEC #AddDesc 'dbo', 'ordini_emessi', NULL,
    'Registro di tutti gli ordini emessi tramite GB2 (e quelli rilevati da BCube). Collega le proposte MRP (ordlist.ol_progr) agli ordini reali (testord/movord) su BCUBE2. ATTENZIONE: questa tabella vive su MRP@163, non su BCUBE2. Le SP su BCUBE2 NON la vedono — Node.js la alimenta dopo il successo della SP.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'id',
    'PK identity. Usato come OrdineEmessoID in SnapshotProposte.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_progr',
    'FK logica verso ordlist.ol_progr (la proposta MRP che ha generato questo ordine). 0 se l''ordine e stato rilevato da BCube (non generato da GB2).';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_tipork',
    'Tipo documento: sempre "O" (ordine fornitore). Coerente con testord.td_tipork.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_codart',
    'Codice articolo BCube. FK logica verso artico.ar_codart su UJET11.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_conto',
    'Codice fornitore BCube. FK logica verso anagra.an_conto su UJET11.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_quant',
    'Quantita proposta dall''MRP (da ordlist.ol_quant). Puo differire da quantita_ordinata se l''operatore ha modificato.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_fase',
    'Fase di lavorazione (da ordlist.ol_fase). 0 = nessuna fase.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ol_magaz',
    'Codice magazzino (da ordlist.ol_magaz). 1 = magazzino principale.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ord_anno',
    'Anno dell''ordine emesso in BCube (testord.td_anno). Parte della chiave logica ordine.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ord_serie',
    'Serie dell''ordine emesso (testord.td_serie, es. "F"). Parte della chiave logica ordine.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ord_numord',
    'Numero progressivo ordine in BCube (testord.td_numord). Assegnato dalla SP con lock su tabnuma. Insieme a ord_anno e ord_serie identifica univocamente l''ordine.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'ord_riga',
    'Numero riga nell''ordine (movord.mo_riga). Inizia da 1.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'quantita_ordinata',
    'Quantita effettivamente ordinata al fornitore (puo essere diversa da ol_quant se l''operatore ha modificato nel pannello decisionale).';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'elaborazione_id',
    'ID dell''elaborazione MRP (FK logica verso ElaborazioniMRP.ID, come stringa). Vuoto se l''ordine non e legato a un batch MRP.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'data_emissione',
    'Timestamp di emissione dell''ordine da GB2.';
EXEC #AddDesc 'dbo', 'ordini_emessi', 'operatore',
    'Codice operatore BCube: "GB2{IDUser}" (es. GB220). Scritto anche in ARCPROC.OPERAT su BCUBE2.';

-- ============================================================
-- 8. SnapshotProposte
-- ============================================================
EXEC #AddDesc 'dbo', 'SnapshotProposte', NULL,
    'Foto delle proposte MRP al momento del rilevamento del batch. Ogni riga corrisponde a una proposta di ordlist. Serve per tracciare quali proposte sono state gestite (ordine emesso) e quali no. Popolata in bulk al primo rilevamento di un nuovo fingerprint.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ID', 'PK identity.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ElaborazioneID',
    'FK verso ElaborazioniMRP.ID. Identifica a quale batch appartiene questa proposta.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_progr',
    'Progressivo proposta (da ordlist.ol_progr). Chiave univoca della proposta nel batch.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_codart',
    'Codice articolo della proposta. Copiato da ordlist al momento dello snapshot.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_conto',
    'Codice fornitore proposto. Copiato da ordlist.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_magaz', 'Magazzino (da ordlist). Default 1.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_fase', 'Fase lavorazione (da ordlist). Default 0.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_quant', 'Quantita proposta dall''MRP.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_datcons', 'Data consegna proposta.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'ol_unmis', 'Unita di misura.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'Gestita',
    'Flag: 1 = ordine emesso per questa proposta, 0 = non ancora gestita. Usato per contare TotaleGestite e per colorare la riga di verde nell''UI.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'OrdineEmessoID',
    'FK verso ordini_emessi.id. NULL se non gestita. Collegamento diretto all''ordine emesso. ATTENZIONE: nell''annullamento ordine, prima si usa questo campo per riaprire lo snapshot (Gestita=0), poi si cancella da ordini_emessi.';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'CreatedAt', 'Timestamp creazione snapshot (bulk insert).';
EXEC #AddDesc 'dbo', 'SnapshotProposte', 'UpdatedAt', 'Timestamp ultimo aggiornamento (es. marcatura Gestita=1).';

-- ============================================================
-- 9. TestProfiles
-- ============================================================
EXEC #AddDesc 'dbo', 'TestProfiles', NULL,
    'Profili di connessione a database di prova. Ogni operatore puo creare piu profili che puntano a server UJET11 diversi per testare senza impattare la produzione. Lo switch avviene dall''UI (Impostazioni → Connessione DB). Le password sono crittate AES-256-GCM.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'ID', 'PK identity.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'IDUser',
    'Operatore proprietario del profilo. FK verso GA.dbo.Users.IDUser. Ogni operatore vede solo i suoi profili.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'ProfileLabel',
    'Etichetta visualizzata nell''UI (es. "PABLO", "TEST FABRIZIO"). Scelta dall''operatore.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'Server',
    'IP o hostname del server SQL di prova (es. "192.168.0.163", "BCUBE-TEST").';
EXEC #AddDesc 'dbo', 'TestProfiles', 'DatabaseMRP',
    'Nome database MRP sul server prova. Default "MRP". Usato per il deploy delle SP.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'DatabaseUJET11',
    'Nome database UJET11 sul server prova. Default "UJET11". Il pool di prova si connette qui.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'DbUser',
    'Utente SQL Server per la connessione al server prova.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'DbPassword',
    'Password SQL Server crittata AES-256-GCM. Chiave in .env (DB_ENCRYPTION_KEY). VARBINARY perche contiene IV + authTag + ciphertext.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpHost',
    'Server SMTP per invio email in prova. Se NULL, usa la config SMTP dell''operatore da UserPreferences.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpPort', 'Porta SMTP. Default 587 (STARTTLS).';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpSecure', 'SSL/TLS diretto: 0 = STARTTLS (porta 587), 1 = SSL (porta 465).';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpUser', 'Username SMTP per prova.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpPassword', 'Password SMTP crittata AES-256-GCM.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpFromAddress', 'Email mittente per prova.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'SmtpFromName', 'Nome mittente per prova. Default "U.Jet s.r.l.".';
EXEC #AddDesc 'dbo', 'TestProfiles', 'EmailProva',
    'Indirizzo email di redirect in prova. TUTTE le email ordine vengono inviate qui invece che al fornitore. Sicurezza: evita di inviare ordini di prova ai fornitori reali.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'Color',
    'Colore CSS del badge profilo nell''header dell''app (es. "#16a34a" verde). Permette di distinguere visivamente i profili.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'IsActive',
    'Profilo attualmente attivo per questo operatore. Solo uno alla volta puo essere attivo (gli altri vengono disattivati allo switch).';
EXEC #AddDesc 'dbo', 'TestProfiles', 'CreatedAt', 'Timestamp creazione profilo.';
EXEC #AddDesc 'dbo', 'TestProfiles', 'UpdatedAt', 'Timestamp ultima modifica.';

-- ============================================================
-- 10. UserPreferences
-- ============================================================
EXEC #AddDesc 'dbo', 'UserPreferences', NULL,
    'Preferenze utente GB2: personalizzazione tema (colori, label) e configurazione SMTP per invio email ordini. Ogni operatore ha una riga, creata automaticamente al primo accesso. La chiave primaria e IDUser. NOTA: in futuro la sezione SMTP sara sostituita da Microsoft Graph API (OAuth 2.0).';
EXEC #AddDesc 'dbo', 'UserPreferences', 'IDUser',
    'PK. FK verso GA.dbo.Users.IDUser. Ogni operatore ha una sola riga.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'ColorPreset',
    'Preset tema attivo: "default", "deuteranopia", "protanopia", "high-contrast", "custom". Se "custom", i colori sono in CustomColors.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'CustomColors',
    'JSON con override variabili CSS del tema. Es: {"--primary":"#2563eb","--success":"#16a34a"}. Applicato al body come style inline.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'CustomLabels',
    'JSON con nomi personalizzati delle variabili CSS (per il pannello tema). Es: {"--primary":"Colore principale"}.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'UpdatedAt', 'Timestamp ultima modifica preferenze.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpHost',
    'Server SMTP dell''operatore per invio email ordini. Es: "smtp.office365.com". NULL = non configurato.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpPort', 'Porta SMTP. Default 587 (STARTTLS).';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpSecure', 'SSL/TLS diretto: 0 = STARTTLS (porta 587), 1 = SSL (porta 465).';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpUser',
    'Username SMTP (es. "gabriel.ilas@ujet.it"). Di solito coincide con SmtpFromAddress.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpPassword',
    'Password SMTP crittata AES-256-GCM. VARBINARY perche contiene IV + authTag + ciphertext. Chiave in .env.';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpFromAddress',
    'Email mittente (campo "Da:" nell''email). Es: "gabriel.ilas@ujet.it".';
EXEC #AddDesc 'dbo', 'UserPreferences', 'SmtpFromName',
    'Nome mittente (campo "Da:" nell''email). Default "U.Jet s.r.l.".';
EXEC #AddDesc 'dbo', 'UserPreferences', 'FirmaEmail',
    'Firma HTML in calce all''email (non ancora implementato nell''UI, predisposto).';
EXEC #AddDesc 'dbo', 'UserPreferences', 'TemplateMode',
    'Modalita selezione template: "ultima_scelta" = salva automaticamente la scelta per fornitore in EmailTemplateAssegnazioni. "predefiniti" = usa sempre il template default senza salvare scelte.';

-- Cleanup
DROP PROCEDURE #AddDesc;
GO

PRINT 'Descrizioni schema [GB2] applicate con successo.';
GO
