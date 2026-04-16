-- ============================================================
-- Migration: ordini_confermati_pending → chiave ol_progr
-- Scopo: supportare conferme multi-data per lo stesso articolo.
--         Oggi la PK e (elab, user, forn, codart, fase, magaz) che
--         collassa piu date in una sola entry. Con ol_progr ogni riga
--         ordlist e indipendente.
--
-- Strategia: DROP + recreate perche le entry pending sono effimere
-- (sopravvivono solo per la sessione di lavoro corrente, cancellate
-- dopo emissione o dal cleanup al boot). Nessun dato critico perso.
-- ============================================================

-- 1. Drop tabella e indici esistenti
IF EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'ordini_confermati_pending' AND type = 'U'
)
BEGIN
    DROP TABLE [GB2].[dbo].[ordini_confermati_pending];
    PRINT 'Tabella [ordini_confermati_pending] vecchia rimossa.';
END
GO

-- 2. Ricrea con nuova PK basata su ol_progr
CREATE TABLE [GB2].[dbo].[ordini_confermati_pending] (
    elaborazione_id     INT           NOT NULL,
    user_id             INT           NOT NULL,
    ol_progr            INT           NOT NULL,   -- PK riga ordlist (univoca per elaborazione)

    -- Colonne denormalizzate per filtro/display (non in PK)
    fornitore_codice    VARCHAR(20)   NOT NULL,
    codart              VARCHAR(50)   NOT NULL,
    fase                SMALLINT      NOT NULL DEFAULT 0,
    magaz               SMALLINT      NOT NULL DEFAULT 1,
    data_consegna       DATE          NULL,

    -- Dati editati dall'operatore nel pannello decisione
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

PRINT 'Tabella [ordini_confermati_pending] ricreata con PK ol_progr.';
GO
