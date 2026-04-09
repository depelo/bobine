-- ============================================================
-- Tabella: [GB2].[dbo].[SnapshotProposte]
-- Scopo: Fotografia delle proposte MRP al momento del rilevamento
--         di una nuova elaborazione. Ogni riga corrisponde a una
--         riga ordlist rilevante, con lo stato di gestione
--         (ordine emesso si/no) e il riferimento all'ordine reale.
-- Database: GB2 (silos applicativo, paradigma 1 App = 1 Database)
-- ============================================================
-- Deploy: auto-deploy all'avvio dell'app
-- Dipendenza: ElaborazioniMRP (FK su ElaborazioneID)
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM [GB2].sys.objects
    WHERE name = 'SnapshotProposte' AND type = 'U'
)
BEGIN
    CREATE TABLE [GB2].[dbo].[SnapshotProposte] (
        ID                  INT IDENTITY(1,1) PRIMARY KEY,

        -- FK verso l'elaborazione di appartenenza
        ElaborazioneID      INT NOT NULL,

        -- Dati della proposta (copiati da ordlist al momento dello snapshot)
        ol_progr            INT NOT NULL,
        ol_codart           VARCHAR(50) NOT NULL,
        ol_conto            INT NOT NULL,
        ol_magaz            SMALLINT NOT NULL DEFAULT 1,
        ol_fase             SMALLINT NOT NULL DEFAULT 0,
        ol_quant            DECIMAL(18,9) NOT NULL DEFAULT 0,
        ol_datcons          DATETIME NULL,
        ol_unmis            VARCHAR(10) NULL,

        -- Stato gestione
        Gestita             BIT NOT NULL DEFAULT 0,

        -- Riferimento all'ordine emesso (NULL se non gestita)
        OrdineEmessoID      INT NULL,

        -- Audit
        CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE(),

        -- FK verso ElaborazioniMRP
        CONSTRAINT FK_SnapshotProposte_Elaborazione
            FOREIGN KEY (ElaborazioneID)
            REFERENCES [GB2].[dbo].[ElaborazioniMRP] (ID)
    );

    -- Indice per query per elaborazione (il piu frequente)
    CREATE INDEX IX_SnapshotProposte_ElaborazioneID
        ON [GB2].[dbo].[SnapshotProposte] (ElaborazioneID);

    -- Indice per ricerca per articolo (storico proposte)
    CREATE INDEX IX_SnapshotProposte_Codart
        ON [GB2].[dbo].[SnapshotProposte] (ol_codart);

    -- Indice per ricerca per fornitore (storico per conto)
    CREATE INDEX IX_SnapshotProposte_Conto
        ON [GB2].[dbo].[SnapshotProposte] (ol_conto);

    -- Indice per stato gestione (filtro proposte non gestite)
    CREATE INDEX IX_SnapshotProposte_Gestita
        ON [GB2].[dbo].[SnapshotProposte] (Gestita)
        WHERE Gestita = 0;

    PRINT 'Tabella [GB2].[dbo].[SnapshotProposte] creata.';
END
ELSE
    PRINT 'Tabella [GB2].[dbo].[SnapshotProposte] esiste gia.';
GO
