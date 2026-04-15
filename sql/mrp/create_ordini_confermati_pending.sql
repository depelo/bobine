-- ============================================================
-- Tabella: [GB2].[dbo].[ordini_confermati_pending]
-- Scopo: Persistenza dello stato "confermato per ordine" cliccato
--        dall'operatore nel pannello decisione, prima dell'emissione
--        effettiva. Serve come safety-net contro F5/crash/cambio PC
--        per non perdere il lavoro in corso.
--
-- Pattern: localStorage-first (reattività UX) + flush asincrono qui
--          (persistenza cross-device / cross-browser).
--
-- Lifecycle:
--   - Inserita/aggiornata dall'endpoint POST /conferma-pending/upsert
--     al termine del debounce client (250ms per chiave).
--   - Cancellata transazionalmente da /emetti-ordine quando le chiavi
--     diventano ordini reali.
--   - Ripulita al boot del server dal cleanup fire-and-forget
--     (entry legate a elaborazioni non piu correnti).
--
-- Chiave logica: (elaborazione_id, user_id, fornitore, codart, fase, magaz)
-- Database: GB2 su pool163 (stesso del SnapshotProposte / ElaborazioniMRP)
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'ordini_confermati_pending' AND type = 'U'
)
BEGIN
    CREATE TABLE [GB2].[dbo].[ordini_confermati_pending] (
        elaborazione_id     INT           NOT NULL,
        user_id             INT           NOT NULL,
        fornitore_codice    VARCHAR(20)   NOT NULL,
        codart              VARCHAR(50)   NOT NULL,
        fase                SMALLINT      NOT NULL DEFAULT 0,
        magaz               SMALLINT      NOT NULL DEFAULT 1,

        -- Dati editati dall'operatore nel pannello decisione
        quantita_confermata DECIMAL(18,3) NOT NULL,
        prezzo_override     DECIMAL(18,5) NULL,

        updated_at          DATETIME      NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_ordini_confermati_pending
            PRIMARY KEY (elaborazione_id, user_id, fornitore_codice, codart, fase, magaz),

        CONSTRAINT FK_ocp_Elaborazione
            FOREIGN KEY (elaborazione_id)
            REFERENCES [GB2].[dbo].[ElaborazioniMRP] (ID)
            ON DELETE CASCADE
    );

    CREATE INDEX IX_ocp_elab
        ON [GB2].[dbo].[ordini_confermati_pending] (elaborazione_id);

    CREATE INDEX IX_ocp_user_elab
        ON [GB2].[dbo].[ordini_confermati_pending] (user_id, elaborazione_id);

    PRINT 'Tabella [GB2].[dbo].[ordini_confermati_pending] creata.';
END
ELSE
    PRINT 'Tabella [GB2].[dbo].[ordini_confermati_pending] esiste gia.';
GO
