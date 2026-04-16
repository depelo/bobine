-- ============================================================
-- Tabella: EmailDrafts
-- Database: GB2
-- Scopo: Bozze email personalizzate dall'operatore.
--         Funziona da polmone: la bozza viene cancellata
--         automaticamente dopo l'invio riuscito dell'email.
-- ============================================================
-- Deploy: eseguire su GB2
-- Auto-deploy: l'app la crea se non esiste
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM [GB2].[sys].[tables] WHERE name = 'EmailDrafts')
BEGIN
    CREATE TABLE [GB2].[dbo].[EmailDrafts] (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        IDUser          INT NOT NULL,
        Anno            INT NOT NULL,
        Serie           VARCHAR(5) NOT NULL,
        NumOrd          INT NOT NULL,
        OggettoCustom   NVARCHAR(500) NOT NULL,
        CorpoCustom     NVARCHAR(MAX) NOT NULL,
        DataModifica    DATETIME NOT NULL DEFAULT GETDATE()
    );

    CREATE UNIQUE INDEX UX_EmailDrafts_UserOrdine
        ON [GB2].[dbo].[EmailDrafts] (IDUser, Anno, Serie, NumOrd);

    PRINT 'Tabella EmailDrafts creata in GB2.';
END
ELSE
    PRINT 'Tabella EmailDrafts gia'' esistente.';
