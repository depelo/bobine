-- ============================================================
-- Tabella: EmailTemplateAssegnazioni
-- Database: GB2
-- Scopo: Associazione fornitore -> template email per operatore.
--         Ogni operatore puo' avere un template diverso per ogni fornitore.
--         Se non c'e' associazione, si usa il template predefinito (IsDefault=1).
-- ============================================================
-- Deploy: eseguire su GB2
-- Auto-deploy: l'app la crea se non esiste
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM [GB2].[sys].[tables] WHERE name = 'EmailTemplateAssegnazioni')
BEGIN
    CREATE TABLE [GB2].[dbo].[EmailTemplateAssegnazioni] (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        IDUser          INT NOT NULL,
        FornitoreCode   INT NOT NULL,               -- an_conto del fornitore
        TemplateID      INT NOT NULL,
        CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_EmailTemplateAssegnazioni_Template
            FOREIGN KEY (TemplateID) REFERENCES [GB2].[dbo].[EmailTemplates] (ID)
    );

    -- Un operatore puo' avere al massimo un'associazione per fornitore
    CREATE UNIQUE INDEX UX_EmailTemplateAssegnazioni_User_Fornitore
        ON [GB2].[dbo].[EmailTemplateAssegnazioni] (IDUser, FornitoreCode);

    PRINT 'Tabella EmailTemplateAssegnazioni creata.';
END
ELSE
BEGIN
    PRINT 'Tabella EmailTemplateAssegnazioni esiste gia.';
END
GO
