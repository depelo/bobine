-- ============================================================
-- Tabella: [GB2].[dbo].[ElaborazioniMRP]
-- Scopo: Registro delle elaborazioni MRP rilevate dall'app.
--         Ogni riga corrisponde a un batch MRP distinto, identificato
--         dall'impronta temporale condivisa (ol_ultagg in ordlist).
--         Serve per tracciare storico, confronti tra elaborazioni
--         e stato gestione delle proposte.
-- Database: GB2 (silos applicativo, paradigma 1 App = 1 Database)
-- ============================================================
-- Deploy: auto-deploy all'avvio dell'app
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'ElaborazioniMRP' AND type = 'U'
)
BEGIN
    CREATE TABLE [GB2].[dbo].[ElaborazioniMRP] (
        ID                  INT IDENTITY(1,1) PRIMARY KEY,

        -- Impronta temporale del batch MRP (valore di ol_ultagg condiviso
        -- dalla maggioranza delle righe ordlist dopo l'elaborazione notturna)
        Fingerprint         DATETIME NOT NULL,

        -- Quando l'app ha rilevato per la prima volta questa elaborazione
        RilevatoIl          DATETIME NOT NULL DEFAULT GETDATE(),

        -- Contatori snapshot al momento del rilevamento
        TotaleProposte      INT NOT NULL DEFAULT 0,
        TotaleGestite       INT NOT NULL DEFAULT 0,

        -- Operatore che ha triggerato il rilevamento
        IDUser              INT NOT NULL,

        -- Ambiente: 'produzione' o 'prova' (per separare elaborazioni test)
        Ambiente            VARCHAR(20) NOT NULL DEFAULT 'produzione',

        -- Note libere (es. "Elaborazione notturna standard")
        Note                NVARCHAR(500) NULL,

        -- Audit
        CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE()
    );

    -- Indice univoco: non puo esistere due volte la stessa fingerprint per ambiente
    CREATE UNIQUE INDEX UX_ElaborazioniMRP_Fingerprint_Ambiente
        ON [GB2].[dbo].[ElaborazioniMRP] (Fingerprint, Ambiente);

    -- Indice per ricerche per operatore
    CREATE INDEX IX_ElaborazioniMRP_IDUser
        ON [GB2].[dbo].[ElaborazioniMRP] (IDUser);

    -- Indice per ordinamento cronologico
    CREATE INDEX IX_ElaborazioniMRP_RilevatoIl
        ON [GB2].[dbo].[ElaborazioniMRP] (RilevatoIl DESC);

    PRINT 'Tabella [GB2].[dbo].[ElaborazioniMRP] creata.';
END
ELSE
BEGIN
    PRINT 'Tabella [GB2].[dbo].[ElaborazioniMRP] esiste gia.';

    -- Aggiunta colonna Ambiente se non esiste (aggiunta in v2)
    IF NOT EXISTS (
        SELECT 1 FROM [GB2].sys.columns
        WHERE object_id = OBJECT_ID('[GB2].[dbo].[ElaborazioniMRP]')
          AND name = 'Ambiente'
    )
    BEGIN
        ALTER TABLE [GB2].[dbo].[ElaborazioniMRP]
        ADD Ambiente VARCHAR(20) NOT NULL DEFAULT 'produzione';

        IF EXISTS (SELECT 1 FROM [GB2].sys.indexes WHERE name = 'UX_ElaborazioniMRP_Fingerprint' AND object_id = OBJECT_ID('[GB2].[dbo].[ElaborazioniMRP]'))
            DROP INDEX UX_ElaborazioniMRP_Fingerprint ON [GB2].[dbo].[ElaborazioniMRP];

        CREATE UNIQUE INDEX UX_ElaborazioniMRP_Fingerprint_Ambiente
            ON [GB2].[dbo].[ElaborazioniMRP] (Fingerprint, Ambiente);

        PRINT 'Colonna Ambiente aggiunta a ElaborazioniMRP.';
    END

    -- Aggiunta colonna NumeroElab se non esiste (v3: contatore per-ambiente)
    IF NOT EXISTS (
        SELECT 1 FROM [GB2].sys.columns
        WHERE object_id = OBJECT_ID('[GB2].[dbo].[ElaborazioniMRP]')
          AND name = 'NumeroElab'
    )
    BEGIN
        ALTER TABLE [GB2].[dbo].[ElaborazioniMRP]
        ADD NumeroElab INT NULL;

        -- Popola retroattivamente per le righe esistenti
        ;WITH cte AS (
            SELECT ID, ROW_NUMBER() OVER (PARTITION BY Ambiente ORDER BY ID) AS rn
            FROM [GB2].[dbo].[ElaborazioniMRP]
        )
        UPDATE cte SET NumeroElab = rn;

        PRINT 'Colonna NumeroElab aggiunta e popolata retroattivamente.';
    END
END
GO
