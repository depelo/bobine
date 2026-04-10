-- ============================================================
-- Tabella: EmailTemplates
-- Database: GB2
-- Scopo: Template email personalizzabili per operatore.
--         Supporta variabili {fornitore}, {numord}, {data_ordine},
--         {num_articoli}, {totale}, {operatore}, {firma}.
-- ============================================================
-- Deploy: eseguire su GB2
-- Auto-deploy: l'app la crea se non esiste
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM [GB2].[sys].[tables] WHERE name = 'EmailTemplates')
BEGIN
    CREATE TABLE [GB2].[dbo].[EmailTemplates] (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        IDUser          INT NULL,               -- NULL = template di sistema (visibile a tutti)
        Nome            NVARCHAR(100) NOT NULL,
        Oggetto         NVARCHAR(200) NOT NULL DEFAULT 'Ordine {numord} - U.Jet S.r.l.',
        Corpo           NVARCHAR(MAX) NOT NULL,
        IsDefault       BIT NOT NULL DEFAULT 0,  -- 1 = predefinito globale per l'operatore
        IsSystem        BIT NOT NULL DEFAULT 0,  -- 1 = non eliminabile, visibile a tutti
        Lingua          VARCHAR(10) NOT NULL DEFAULT 'it',
        IsActive        BIT NOT NULL DEFAULT 1,  -- soft delete: 0 = disattivato
        Ordine          INT NOT NULL DEFAULT 0,
        CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt       DATETIME NOT NULL DEFAULT GETDATE()
    );

    CREATE INDEX IX_EmailTemplates_IDUser ON [GB2].[dbo].[EmailTemplates] (IDUser);
    CREATE INDEX IX_EmailTemplates_Active ON [GB2].[dbo].[EmailTemplates] (IsActive) WHERE IsActive = 1;

    -- Template di sistema: Standard Italiano
    INSERT INTO [GB2].[dbo].[EmailTemplates] (IDUser, Nome, Oggetto, Corpo, IsDefault, IsSystem, Lingua, Ordine)
    VALUES (NULL, 'Standard Italiano', 'Ordine {numord} - U.Jet S.r.l.',
        'Gentile {fornitore},

in allegato l''ordine n. {numord} del {data_ordine} per un totale di {totale}.

Vi preghiamo di confermare ricezione e tempi di consegna rispondendo a questa email.

Cordiali saluti,
{firma}',
        0, 1, 'it', 1);

    -- Template di sistema: Standard English
    INSERT INTO [GB2].[dbo].[EmailTemplates] (IDUser, Nome, Oggetto, Corpo, IsDefault, IsSystem, Lingua, Ordine)
    VALUES (NULL, 'Standard English', 'Purchase Order {numord} - U.Jet S.r.l.',
        'Dear {fornitore},

please find attached our purchase order no. {numord} dated {data_ordine}, total amount {totale}.

Kindly confirm receipt and expected delivery dates by replying to this email.

Best regards,
{firma}',
        0, 1, 'en', 2);

    -- Template di sistema: Urgente
    INSERT INTO [GB2].[dbo].[EmailTemplates] (IDUser, Nome, Oggetto, Corpo, IsDefault, IsSystem, Lingua, Ordine)
    VALUES (NULL, 'Urgente', 'URGENTE - Ordine {numord} - U.Jet S.r.l.',
        'Gentile {fornitore},

in allegato l''ordine URGENTE n. {numord} del {data_ordine} per un totale di {totale}.

Vi chiediamo cortesemente di dare priorita'' a questo ordine e di confermare al piu'' presto ricezione e tempi di consegna.

Cordiali saluti,
{firma}',
        0, 1, 'it', 3);

    PRINT 'Tabella EmailTemplates creata con 3 template di sistema.';
END
ELSE
BEGIN
    PRINT 'Tabella EmailTemplates esiste gia.';

    -- v2: aggiunta colonna IsActive (soft delete)
    IF NOT EXISTS (SELECT 1 FROM [GB2].sys.columns WHERE object_id = OBJECT_ID('[GB2].[dbo].[EmailTemplates]') AND name = 'IsActive')
    BEGIN
        ALTER TABLE [GB2].[dbo].[EmailTemplates] ADD IsActive BIT NOT NULL DEFAULT 1;
        CREATE INDEX IX_EmailTemplates_Active ON [GB2].[dbo].[EmailTemplates] (IsActive) WHERE IsActive = 1;
        PRINT 'Colonna IsActive aggiunta a EmailTemplates.';
    END

    -- v3: aggiunta colonna FornitoreCode (messaggi personalizzati per fornitore)
    IF NOT EXISTS (SELECT 1 FROM [GB2].sys.columns WHERE object_id = OBJECT_ID('[GB2].[dbo].[EmailTemplates]') AND name = 'FornitoreCode')
    BEGIN
        ALTER TABLE [GB2].[dbo].[EmailTemplates] ADD FornitoreCode INT NULL;
        CREATE INDEX IX_EmailTemplates_FornitoreCode ON [GB2].[dbo].[EmailTemplates] (FornitoreCode) WHERE FornitoreCode IS NOT NULL;
        PRINT 'Colonna FornitoreCode aggiunta a EmailTemplates.';
    END
END
GO
