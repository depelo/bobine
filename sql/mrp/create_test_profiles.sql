-- ============================================================
-- Tabella: [GB2].[dbo].[TestProfiles]
-- Profili di prova per operatore (server + credenziali DB)
-- Le password sono crittate AES lato applicazione (Node.js)
-- SMTP NON e qui — e in UserPreferences (per operatore, non per profilo)
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'TestProfiles' AND type = 'U'
)
BEGIN
    CREATE TABLE [GB2].[dbo].[TestProfiles] (
        ID              INT IDENTITY(1,1) PRIMARY KEY,
        IDUser          INT NOT NULL,
        ProfileLabel    VARCHAR(100) NOT NULL,
        Server          VARCHAR(100) NOT NULL,
        DatabaseMRP     VARCHAR(50) NOT NULL DEFAULT 'MRP',
        DatabaseUJET11  VARCHAR(50) NOT NULL DEFAULT 'UJET11',
        DbUser          VARCHAR(50) NOT NULL,
        DbPassword      VARBINARY(512) NOT NULL,
        EmailProva      VARCHAR(255) NULL,
        Color           VARCHAR(20) NOT NULL DEFAULT '#16a34a',
        IsActive        BIT NOT NULL DEFAULT 0,
        CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt       DATETIME NOT NULL DEFAULT GETDATE()
    );

    CREATE INDEX IX_TestProfiles_IDUser ON [GB2].[dbo].[TestProfiles] (IDUser);

    PRINT 'Tabella [GB2].[dbo].[TestProfiles] creata.';
END
ELSE
    PRINT 'Tabella [GB2].[dbo].[TestProfiles] esiste gia.';
