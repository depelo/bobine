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

    -- Aggiunta colonne tracciamento email (v2)
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('ordini_emessi') AND name = 'email_inviata')
    BEGIN
        ALTER TABLE dbo.ordini_emessi ADD email_inviata BIT NOT NULL DEFAULT 0;
        PRINT 'Colonna email_inviata aggiunta.';
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('ordini_emessi') AND name = 'email_inviata_il')
    BEGIN
        ALTER TABLE dbo.ordini_emessi ADD email_inviata_il DATETIME NULL;
        PRINT 'Colonna email_inviata_il aggiunta.';
    END

    -- Aggiunta colonna ambiente (v3): distingue ordini produzione da prova
    -- NOTA: ALTER TABLE + UPDATE nella stessa colonna richiedono batch separati
    -- oppure SQL dinamico, perché SQL Server compila il batch prima di eseguirlo.
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('ordini_emessi') AND name = 'ambiente')
    BEGIN
        ALTER TABLE dbo.ordini_emessi ADD ambiente VARCHAR(20) NOT NULL DEFAULT 'produzione';
        PRINT 'Colonna ambiente aggiunta.';
    END
END
GO

-- Batch separato: indice e migrazione retroattiva (la colonna ora esiste)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('ordini_emessi') AND name = 'ambiente')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('ordini_emessi') AND name = 'IX_ordini_emessi_ambiente')
    BEGIN
        CREATE INDEX IX_ordini_emessi_ambiente ON dbo.ordini_emessi (ambiente);
        PRINT 'Indice IX_ordini_emessi_ambiente creato.';
    END

    -- Migrazione retroattiva RIMOSSA (13/04/2026):
    -- Il vecchio codice convertiva tutti i 'produzione' in 'prova' ad ogni deploy.
    -- Questo era sbagliato perche cancellava i dati produzione reali.
    -- La colonna ambiente viene ora valorizzata correttamente al momento dell'INSERT.

    -- Colonna origine: 'gb2' (emesso dalla nostra app) o 'bcube' (emesso da BCube, rilevato da noi)
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('ordini_emessi') AND name = 'origine')
    BEGIN
        ALTER TABLE dbo.ordini_emessi ADD origine VARCHAR(10) NOT NULL DEFAULT 'gb2';
        PRINT 'Colonna origine aggiunta.';
    END
END
GO
