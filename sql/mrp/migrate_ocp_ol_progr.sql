-- ============================================================
-- Migration: ordini_confermati_pending → chiave ol_progr
-- Esegue il DROP+RECREATE SOLO se la tabella ha ancora il vecchio
-- schema (senza colonna ol_progr nella PK). Se la tabella è già
-- migrata, non fa niente — preserva i dati pending.
-- ============================================================

-- Controlla se la tabella esiste E se ha già la colonna ol_progr
IF EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'ordini_confermati_pending' AND type = 'U'
)
AND NOT EXISTS (
    SELECT 1 FROM [GB2].INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ordini_confermati_pending'
      AND TABLE_SCHEMA = 'dbo'
      AND COLUMN_NAME = 'ol_progr'
)
BEGIN
    -- Vecchio schema: DROP e ricrea
    DROP TABLE [GB2].[dbo].[ordini_confermati_pending];
    PRINT 'Tabella [ordini_confermati_pending] vecchia rimossa (migrazione a ol_progr).';
END
GO

-- Crea la tabella SOLO se non esiste (dopo il DROP sopra, o primo deploy)
IF NOT EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'ordini_confermati_pending' AND type = 'U'
)
BEGIN
    CREATE TABLE [GB2].[dbo].[ordini_confermati_pending] (
        elaborazione_id     INT           NOT NULL,
        user_id             INT           NOT NULL,
        ol_progr            INT           NOT NULL,

        fornitore_codice    VARCHAR(20)   NOT NULL,
        codart              VARCHAR(50)   NOT NULL,
        fase                SMALLINT      NOT NULL DEFAULT 0,
        magaz               SMALLINT      NOT NULL DEFAULT 1,
        data_consegna       DATE          NULL,

        quantita_confermata DECIMAL(18,3) NOT NULL,
        prezzo_override     DECIMAL(18,5) NULL,

        updated_at          DATETIME      NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_ordini_confermati_pending
            PRIMARY KEY (elaborazione_id, user_id, ol_progr),

        CONSTRAINT FK_ocp_Elaborazione
            FOREIGN KEY (elaborazione_id)
            REFERENCES [GB2].[dbo].[ElaborazioniMRP] (ID)
            ON DELETE CASCADE
    );

    CREATE INDEX IX_ocp_elab
        ON [GB2].[dbo].[ordini_confermati_pending] (elaborazione_id);

    CREATE INDEX IX_ocp_user_elab
        ON [GB2].[dbo].[ordini_confermati_pending] (user_id, elaborazione_id);

    CREATE INDEX IX_ocp_forn
        ON [GB2].[dbo].[ordini_confermati_pending] (fornitore_codice);

    PRINT 'Tabella [ordini_confermati_pending] creata con PK ol_progr.';
END
ELSE
    PRINT 'Tabella [ordini_confermati_pending] gia presente con schema corretto — skip.';
GO
