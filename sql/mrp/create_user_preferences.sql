-- UserPreferences: preferenze utente per l'app GB2/MRP (colori, layout, ecc.)
-- Risiede nel silos [GB2] seguendo il paradigma 1 App = 1 Database
IF NOT EXISTS (SELECT 1 FROM [GB2].sys.objects WHERE name = 'UserPreferences' AND type = 'U')
BEGIN
    CREATE TABLE [GB2].[dbo].[UserPreferences] (
        IDUser       INT           PRIMARY KEY,
        ColorPreset  VARCHAR(50)   NOT NULL DEFAULT 'default',
        CustomColors NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        UpdatedAt    DATETIME      NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Tabella [GB2].[dbo].[UserPreferences] creata.';
END
ELSE
BEGIN
    PRINT 'Tabella [GB2].[dbo].[UserPreferences] esiste gia.';
END
GO

-- Aggiunta colonna CustomLabels se non esiste
IF NOT EXISTS (
    SELECT 1 FROM [GB2].sys.columns
    WHERE object_id = OBJECT_ID('[GB2].[dbo].[UserPreferences]')
      AND name = 'CustomLabels'
)
BEGIN
    ALTER TABLE [GB2].[dbo].[UserPreferences]
    ADD CustomLabels NVARCHAR(MAX) NOT NULL DEFAULT '{}';
    PRINT 'Colonna CustomLabels aggiunta.';
END
