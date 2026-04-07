-- ============================================================
-- Tabella: ordini_emessi
-- Database: MRP
-- Scopo: Registro persistente delle emissioni ordini dal MRP Web.
--         Collega le proposte di ordlist agli ordini reali in testord/movord.
-- ============================================================
-- Deploy: eseguire su MRP
-- Auto-deploy: l'app la crea se non esiste
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini_emessi')
BEGIN
    CREATE TABLE dbo.ordini_emessi (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        -- Collegamento alla proposta MRP (ordlist)
        ol_progr            INT NOT NULL,
        ol_tipork           VARCHAR(1) NOT NULL DEFAULT 'O',
        ol_codart           VARCHAR(50) NOT NULL,
        ol_conto            INT NOT NULL,
        ol_quant            DECIMAL(18,9) NOT NULL DEFAULT 0,
        ol_fase             SMALLINT NOT NULL DEFAULT 0,
        ol_magaz            SMALLINT NOT NULL DEFAULT 1,
        -- Collegamento all'ordine reale (testord/movord)
        ord_anno            SMALLINT NOT NULL,
        ord_serie           VARCHAR(3) NOT NULL,
        ord_numord          INT NOT NULL,
        ord_riga            INT NOT NULL,
        quantita_ordinata   DECIMAL(18,9) NOT NULL DEFAULT 0,
        -- Tracciabilita
        elaborazione_id     VARCHAR(50) NOT NULL DEFAULT '',
        data_emissione      DATETIME NOT NULL DEFAULT GETDATE(),
        operatore           VARCHAR(20) NOT NULL DEFAULT 'mrpweb'
    );

    -- Indice per JOIN con ordlist (griglia corrente)
    CREATE INDEX IX_ordini_emessi_ol_progr
        ON dbo.ordini_emessi (ol_progr);

    -- Indice per query di storico per articolo
    CREATE INDEX IX_ordini_emessi_codart_anno
        ON dbo.ordini_emessi (ol_codart, ord_anno);

    -- Indice per filtro elaborazione corrente
    CREATE INDEX IX_ordini_emessi_elaborazione
        ON dbo.ordini_emessi (elaborazione_id);

    PRINT 'Tabella ordini_emessi creata con successo.';
END
ELSE
BEGIN
    PRINT 'Tabella ordini_emessi esiste gia.';
END
GO
