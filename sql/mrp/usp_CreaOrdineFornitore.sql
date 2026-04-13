-- ============================================================
-- SP: usp_CreaOrdineFornitore
-- Database: [GB2_SP] sul server di destinazione (BCUBE2 o prova)
-- Scopo: Crea un ordine fornitore atomico (testord + movord)
--         con lock applicativo per gestire concorrenza
-- ============================================================
-- Deploy: deployata nel DB [GB2_SP] del server di destinazione.
--         Referenzia [UJET11].[dbo] che e cross-database LOCALE
--         (stesso server). Zero linked server, zero MSDTC.
-- Compatibilita: SQL Server 2016+ (OPENJSON richiede compat level 130)
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'usp_CreaOrdineFornitore' AND type = 'P')
    DROP PROCEDURE dbo.usp_CreaOrdineFornitore;
GO

CREATE PROCEDURE dbo.usp_CreaOrdineFornitore
    @json_articoli  NVARCHAR(MAX),      -- [{codart, fase, magaz, quantita, data_consegna, prezzo, unmis, ol_progr}]
    @fornitore_codice INT,
    @operatore      VARCHAR(20) = 'mrpweb',
    @codditt        VARCHAR(12) = 'UJET11',
    @serie          VARCHAR(3)  = 'F',
    @elaborazione_id VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @anno       SMALLINT = YEAR(GETDATE());
    DECLARE @numord     INT;
    DECLARE @oggi       DATETIME = GETDATE();
    DECLARE @primo_mese DATETIME = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
    DECLARE @ora_creaz  DECIMAL(18,6) = DATEPART(HOUR, GETDATE()) + (DATEPART(MINUTE, GETDATE()) / 100.0);
    DECLARE @lock_name  VARCHAR(50) = 'OrdFornitore_' + CAST(@anno AS VARCHAR) + '_' + @serie;
    DECLARE @lock_result INT;
    DECLARE @err_msg    NVARCHAR(500);

    -- Variabili fornitore
    DECLARE @forn_nome      VARCHAR(100);
    DECLARE @forn_indir     VARCHAR(100);
    DECLARE @forn_cap       VARCHAR(10);
    DECLARE @forn_citta     VARCHAR(50);
    DECLARE @forn_prov      VARCHAR(5);
    DECLARE @forn_pariva    VARCHAR(30);
    DECLARE @forn_codpag    SMALLINT;
    DECLARE @forn_porto     VARCHAR(3);
    DECLARE @forn_abi       INT;
    DECLARE @forn_cab       INT;
    DECLARE @forn_banc1     VARCHAR(50);
    DECLARE @forn_banc2     VARCHAR(50);
    DECLARE @forn_codbanc   SMALLINT;
    DECLARE @forn_email     VARCHAR(255);
    DECLARE @forn_fax       VARCHAR(50);
    DECLARE @pag_descr      VARCHAR(100);

    -- Variabili totali
    DECLARE @tot_merce      MONEY = 0;
    DECLARE @tot_imposta    MONEY = 0;
    DECLARE @tot_doc        MONEY = 0;
    DECLARE @primo_magaz    SMALLINT = 1;
    DECLARE @data_cons_min  DATETIME;

    -- ============================================================
    -- 0. Validazione input
    -- ============================================================
    IF @fornitore_codice IS NULL OR @fornitore_codice = 0
    BEGIN
        RAISERROR('Codice fornitore obbligatorio', 16, 1);
        RETURN;
    END

    IF @json_articoli IS NULL OR LEN(@json_articoli) < 3
    BEGIN
        RAISERROR('Lista articoli vuota', 16, 1);
        RETURN;
    END

    -- ============================================================
    -- 1. Parse JSON articoli in tabella temporanea
    -- ============================================================
    CREATE TABLE #articoli (
        riga        INT IDENTITY(1,1),
        codart      VARCHAR(50),
        fase        SMALLINT,
        magaz       SMALLINT,
        quantita    DECIMAL(18,9),
        data_consegna DATE,
        prezzo      DECIMAL(18,6),
        perqta      DECIMAL(18,6),   -- Prezzo per quantita (es. 250 = prezzo per 250 PZ)
        unmis       VARCHAR(3),
        ol_progr    INT,            -- Progressivo ordlist (per registro ordini_emessi)
        -- Campi arricchiti da artico
        ar_descr    VARCHAR(255),
        ar_desint   VARCHAR(40),
        ar_codiva   SMALLINT,
        ar_controa  SMALLINT,
        -- Fallback da ordini esistenti
        contocontr  INT,
        -- Calcolati
        valore      MONEY
    );

    INSERT INTO #articoli (codart, fase, magaz, quantita, data_consegna, prezzo, perqta, unmis, ol_progr)
    SELECT codart, fase, magaz, quantita, data_consegna, prezzo, ISNULL(perqta, 1), unmis, ISNULL(ol_progr, 0)
    FROM OPENJSON(@json_articoli)
    WITH (
        codart          VARCHAR(50)     '$.codart',
        fase            SMALLINT        '$.fase',
        magaz           SMALLINT        '$.magaz',
        quantita        DECIMAL(18,9)   '$.quantita',
        data_consegna   DATE            '$.data_consegna',
        prezzo          DECIMAL(18,6)   '$.prezzo',
        perqta          DECIMAL(18,6)   '$.perqta',
        unmis           VARCHAR(3)      '$.unmis',
        ol_progr        INT             '$.ol_progr'
    );

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR('Nessun articolo valido nel JSON', 16, 1);
        RETURN;
    END

    -- ============================================================
    -- 2. Arricchisci da artico + fallback contocontr
    -- ============================================================
    UPDATE a
    SET a.ar_descr   = COALESCE(ar.ar_descr, ''),
        a.ar_desint  = COALESCE(ar.ar_desint, ''),
        a.ar_codiva  = COALESCE(ar.ar_codiva, 0),
        a.ar_controa = COALESCE(ar.ar_controa, 0),
        a.valore     = a.quantita * a.prezzo / ISNULL(NULLIF(a.perqta, 0), 1)
    FROM #articoli a
    LEFT JOIN [UJET11].[dbo].[artico] ar ON a.codart = ar.ar_codart;

    -- Fallback per contocontr: prende da ultimo ordine dello stesso articolo
    UPDATE a
    SET a.contocontr = COALESCE(sub.mo_contocontr, 0)
    FROM #articoli a
    OUTER APPLY (
        SELECT TOP 1 mo.mo_contocontr
        FROM [UJET11].[dbo].[movord] mo
        WHERE mo.mo_codart = a.codart
          AND mo.mo_tipork = 'O'
          AND mo.mo_contocontr > 0
        ORDER BY mo.mo_anno DESC, mo.mo_numord DESC
    ) sub;

    -- ============================================================
    -- 3. Leggi dati fornitore da anagra
    -- ============================================================
    SELECT
        @forn_nome    = COALESCE(an_descr1, ''),
        @forn_indir   = COALESCE(an_indir, ''),
        @forn_cap     = COALESCE(an_cap, ''),
        @forn_citta   = COALESCE(an_citta, ''),
        @forn_prov    = COALESCE(an_prov, ''),
        @forn_pariva  = COALESCE(an_pariva, ''),
        @forn_codpag  = COALESCE(an_codpag, 0),
        @forn_porto   = COALESCE(an_porto, ''),
        @forn_abi     = COALESCE(an_abi, 0),
        @forn_cab     = COALESCE(an_cab, 0),
        @forn_banc1   = an_banc1,
        @forn_banc2   = an_banc2,
        @forn_codbanc = COALESCE(an_codbanc, 0),
        @forn_email   = COALESCE(an_email, ''),
        @forn_fax     = COALESCE(an_faxtlx, '')
    FROM [UJET11].[dbo].[anagra]
    WHERE an_conto = @fornitore_codice;

    IF @forn_nome IS NULL OR @forn_nome = ''
    BEGIN
        SET @err_msg = 'Fornitore ' + CAST(@fornitore_codice AS VARCHAR) + ' non trovato in anagra';
        RAISERROR(@err_msg, 16, 1);
        RETURN;
    END

    -- Descrizione condizioni di pagamento
    SET @pag_descr = '';
    BEGIN TRY
        IF OBJECT_ID('[UJET11].[dbo].[codpaga]', 'U') IS NOT NULL
            EXEC sp_executesql N'SELECT @d = COALESCE(cp_descr, '''') FROM [UJET11].[dbo].[codpaga] WHERE cp_codpaga = @c',
                N'@c SMALLINT, @d VARCHAR(100) OUTPUT', @c = @forn_codpag, @d = @pag_descr OUTPUT;
        ELSE IF OBJECT_ID('[UJET11].[dbo].[tabpaga]', 'U') IS NOT NULL
            EXEC sp_executesql N'SELECT @d = COALESCE(tp_descr, '''') FROM [UJET11].[dbo].[tabpaga] WHERE tp_codpaga = @c',
                N'@c SMALLINT, @d VARCHAR(100) OUTPUT', @c = @forn_codpag, @d = @pag_descr OUTPUT;
    END TRY
    BEGIN CATCH
        SET @pag_descr = '';
    END CATCH
    IF @pag_descr IS NULL SET @pag_descr = '';

    -- ============================================================
    -- 4. Calcola totali e castelletto IVA
    -- ============================================================
    SELECT @tot_merce = SUM(valore) FROM #articoli;
    SELECT @data_cons_min = MIN(data_consegna) FROM #articoli;
    SELECT TOP 1 @primo_magaz = magaz FROM #articoli ORDER BY riga;

    -- Castelletto IVA (supporta fino a 8 aliquote diverse)
    CREATE TABLE #iva_lookup (
        codiva      SMALLINT PRIMARY KEY,
        perc_iva    DECIMAL(5,2)
    );

    BEGIN TRY
        IF OBJECT_ID('[UJET11].[dbo].[tabciva]', 'U') IS NOT NULL
        BEGIN
            EXEC sp_executesql N'
                INSERT INTO #iva_lookup (codiva, perc_iva)
                SELECT DISTINCT a.ar_codiva, COALESCE(iv.ci_perc, 22.00)
                FROM #articoli a
                LEFT JOIN [UJET11].[dbo].[tabciva] iv ON a.ar_codiva = iv.ci_codiva
            ';
        END
    END TRY
    BEGIN CATCH
        DELETE FROM #iva_lookup;
    END CATCH

    CREATE TABLE #iva_riepilogo (
        pos         INT IDENTITY(1,1),
        codiva      SMALLINT,
        imponibile  MONEY,
        perc_iva    DECIMAL(5,2),
        imposta     MONEY
    );

    INSERT INTO #iva_riepilogo (codiva, imponibile, perc_iva, imposta)
    SELECT
        a.ar_codiva,
        SUM(a.valore),
        COALESCE(il.perc_iva, 22.00),
        ROUND(SUM(a.valore) * COALESCE(il.perc_iva, 22.00) / 100.0, 2)
    FROM #articoli a
    LEFT JOIN #iva_lookup il ON a.ar_codiva = il.codiva
    GROUP BY a.ar_codiva, il.perc_iva;

    SELECT @tot_imposta = COALESCE(SUM(imposta), 0) FROM #iva_riepilogo;
    SET @tot_doc = @tot_merce + @tot_imposta;

    -- ============================================================
    -- 5. LOCK + NUMERAZIONE DA TABNUMA + INSERT (sezione critica)
    -- ============================================================
    BEGIN TRANSACTION;

    -- Lock applicativo: serializza la numerazione
    EXEC @lock_result = sp_getapplock
        @Resource = @lock_name,
        @LockMode = 'Exclusive',
        @LockTimeout = 5000;

    IF @lock_result < 0
    BEGIN
        ROLLBACK;
        RAISERROR('Impossibile ottenere il lock per la numerazione ordini. Riprovare.', 16, 1);
        RETURN;
    END

    -- Prossimo numero ordine da tabnuma (fonte autoritativa BCube)
    SELECT @numord = tb_numprog + 1
    FROM [UJET11].[dbo].[tabnuma]
    WHERE codditt  = @codditt
      AND tb_numtipo  = 'O'
      AND tb_numserie = @serie
      AND tb_numcodl  = @anno;

    -- Se non esiste riga in tabnuma per quest'anno, fallback da testord + crea riga
    IF @numord IS NULL
    BEGIN
        SELECT @numord = ISNULL(MAX(td_numord), 0) + 1
        FROM [UJET11].[dbo].[testord]
        WHERE codditt   = @codditt
          AND td_tipork  = 'O'
          AND td_anno    = @anno
          AND td_serie   = @serie;

        INSERT INTO [UJET11].[dbo].[tabnuma]
            (codditt, tb_numtipo, tb_numserie, tb_numcodl, tb_numprog)
        VALUES
            (@codditt, 'O', @serie, @anno, @numord);
    END
    ELSE
    BEGIN
        -- Aggiorna tabnuma con il nuovo progressivo
        UPDATE [UJET11].[dbo].[tabnuma]
        SET tb_numprog = @numord
        WHERE codditt  = @codditt
          AND tb_numtipo  = 'O'
          AND tb_numserie = @serie
          AND tb_numcodl  = @anno;
    END

    -- ============================================================
    -- 5a. INSERT testord
    -- ============================================================
    INSERT INTO [UJET11].[dbo].[testord] (
        codditt, td_tipork, td_anno, td_serie, td_numord,
        td_conto, td_datord, td_tipobf, td_datcons,
        td_codpaga, td_datapag,
        td_magaz, td_caustra, td_porto,
        td_codcena,
        td_abi, td_cab, td_banc1, td_banc2, td_codbanc,
        td_flevas, td_flstam, td_confermato, td_rilasciato,
        td_aperto, td_sospeso, td_scorpo, td_blocco, td_soloasa,
        td_contodest, td_opnome, td_opcreaz, td_datcreaz, td_orcreaz,
        td_ultagg,
        td_totmerce, td_totlordo, td_totdoc,
        td_codiva_1, td_imponib_1, td_imposta_1,
        td_codiva_2, td_imponib_2, td_imposta_2,
        td_codiva_3, td_imponib_3, td_imposta_3,
        td_codivaspeinc,
        td_przstp
    )
    VALUES (
        @codditt, 'O', @anno, @serie, @numord,
        @fornitore_codice, @oggi, 3, @data_cons_min,
        @forn_codpag, @oggi,
        @primo_magaz, 6, @forn_porto,
        101,
        @forn_abi, @forn_cab, @forn_banc1, @forn_banc2, @forn_codbanc,
        'N', 'N', 'N', 'N',
        'N', 'N', 'N', 'N', 'N',
        @fornitore_codice, @operatore, @operatore, @oggi, @ora_creaz,
        @oggi,
        @tot_merce, @tot_merce, @tot_doc,
        -- Castelletto IVA (fino a 3 aliquote, estendibile)
        COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 1), 0),
        COALESCE((SELECT imponibile FROM #iva_riepilogo WHERE pos = 1), 0),
        COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 1), 0),
        COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 2), 0),
        COALESCE((SELECT imponibile FROM #iva_riepilogo WHERE pos = 2), 0),
        COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 2), 0),
        COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 3), 0),
        COALESCE((SELECT imponibile FROM #iva_riepilogo WHERE pos = 3), 0),
        COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 3), 0),
        COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 1), 0),
        3  -- td_przstp default
    );

    -- ============================================================
    -- 5b. INSERT movord (N righe)
    -- ============================================================
    INSERT INTO [UJET11].[dbo].[movord] (
        codditt, mo_tipork, mo_anno, mo_serie, mo_numord, mo_riga,
        mo_codart, mo_datcons, mo_magaz, mo_unmis,
        mo_descr, mo_desint,
        mo_quant, mo_prezzo, mo_valore,
        mo_codiva, mo_controp, mo_contocontr,
        mo_codcena,
        mo_stasino, mo_flevas, mo_flevapre,
        mo_confermato, mo_rilasciato, mo_aperto, mo_ricimp,
        mo_perqta, mo_datconsor, mo_ump,
        mo_fase,
        mo_datini, mo_datfin,
        mo_ultagg
    )
    SELECT
        @codditt, 'O', @anno, @serie, @numord, a.riga,
        a.codart, a.data_consegna, a.magaz, a.unmis,
        a.ar_descr, a.ar_desint,
        a.quantita, a.prezzo, a.valore,
        a.ar_codiva, a.ar_controa, a.contocontr,
        101,
        'S', 'C', 'C',
        'N', 'N', 'N', 'N',
        ISNULL(a.perqta, 1), a.data_consegna, a.unmis,
        a.fase,
        @primo_mese, @primo_mese,
        @oggi
    FROM #articoli a
    ORDER BY a.riga;

    -- ============================================================
    -- 5c. AGGIORNAMENTO SALDI BCube (keyord + artpro + artprox + lotcpro)
    -- Chiama la SP orchestra di BCube che popola keyord e aggiorna i saldi.
    -- Funziona perche la SP sta su [GB2_SP] dello stesso server di [UJET11] — locale.
    -- ============================================================
    EXEC [UJET11].[dbo].bussp_bsorgsor9_faggiorn2
        'O', @anno, @serie, @numord, @codditt, @oggi, @operatore;

    -- Rilascia lock
    EXEC sp_releaseapplock @Resource = @lock_name;

    COMMIT TRANSACTION;

    -- ============================================================
    -- NOTA ARCHITETTURALE — ordini_emessi
    -- ============================================================
    -- La tabella ordini_emessi NON vive su questo server.
    -- E' il registro delle emissioni della nostra app e risiede su
    -- MRP@163 ([MRP].[dbo].[ordini_emessi]) — il server dell'applicazione.
    -- L'INSERT in ordini_emessi viene fatto da Node.js DOPO il successo
    -- di questa SP, usando il pool verso 163.
    -- Non tentare mai di scrivere ordini_emessi da qui: questa SP gira
    -- su [GB2_SP] del server destinazione, e non ha visibilita su 163.
    -- ============================================================

    -- ============================================================
    -- 6. Resultset di ritorno per Node.js
    -- ============================================================

    -- Resultset 1: dati testata + fornitore (per PDF e frontend)
    SELECT
        @numord             AS numord,
        @anno               AS anno,
        @serie              AS serie,
        @fornitore_codice   AS fornitore_codice,
        @forn_nome          AS fornitore_nome,
        @forn_indir         AS fornitore_indirizzo,
        @forn_cap           AS fornitore_cap,
        @forn_citta         AS fornitore_citta,
        @forn_prov          AS fornitore_prov,
        @forn_pariva        AS fornitore_pariva,
        @forn_email         AS fornitore_email,
        @forn_fax           AS fornitore_fax,
        @forn_porto         AS porto,
        @pag_descr          AS pagamento_descr,
        @forn_codpag        AS pagamento_codice,
        @tot_merce          AS totale_merce,
        @tot_imposta        AS totale_imposta,
        @tot_doc            AS totale_documento,
        @oggi               AS data_ordine;

    -- Resultset 2: righe articolo inserite (per PDF + registrazione ordini_emessi da Node.js)
    SELECT
        a.riga              AS mo_riga,
        a.codart            AS mo_codart,
        a.ar_descr          AS mo_descr,
        a.ar_desint         AS mo_desint,
        a.unmis             AS mo_unmis,
        a.quantita          AS mo_quant,
        a.prezzo            AS mo_prezzo,
        a.valore            AS mo_valore,
        a.data_consegna     AS mo_datcons,
        a.fase              AS mo_fase,
        a.magaz             AS mo_magaz,
        a.ol_progr          AS ol_progr
    FROM #articoli a
    ORDER BY a.riga;

    -- Cleanup
    DROP TABLE #articoli;
    DROP TABLE #iva_lookup;
    DROP TABLE #iva_riepilogo;
END;
GO
