-- ============================================================
-- SP: usp_RimuoviRigaOrdineFornitore
-- Database: [GB2_SP] sul server di destinazione (BCUBE2 o prova)
-- Scopo: Rimuovere UNA riga da un ordine fornitore esistente,
--         ricalcolare totali testata + castelletto IVA, e
--         aggiornare i saldi BCube (keyord/artpro) sottraendo i delta.
--         Se dopo la rimozione l'ordine resta vuoto (0 righe),
--         l'intero ordine viene cancellato e tabnuma ripristinato.
-- ============================================================
-- Vincoli:
--   * L'ordine deve esistere, td_flevas='N', riga non evasa/prenotata.
--   * Applock per-ordine per protezione concorrenza.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'usp_RimuoviRigaOrdineFornitore' AND type = 'P')
    DROP PROCEDURE dbo.usp_RimuoviRigaOrdineFornitore;
GO

CREATE PROCEDURE dbo.usp_RimuoviRigaOrdineFornitore
    @anno            SMALLINT,
    @serie           VARCHAR(3),
    @numord          INT,
    @riga            INT,               -- mo_riga da rimuovere
    @operatore       VARCHAR(20) = 'mrpweb',
    @codditt         VARCHAR(12) = 'UJET11'
AS
BEGIN
    SET NOCOUNT ON;
    -- NB: NON usiamo XACT_ABORT ON perche il fallback IVA (ci_periva -> ci_perc)
    -- usa TRY/CATCH annidati che con XACT_ABORT doomano la transazione.

    DECLARE @lock_name VARCHAR(100) = 'ModOrd_' + CAST(@anno AS VARCHAR) + '_' + @serie + '_' + CAST(@numord AS VARCHAR);
    DECLARE @lock_result INT;
    DECLARE @td_conto INT;
    DECLARE @righe_rimanenti INT;
    DECLARE @tot_merce MONEY = 0;
    DECLARE @tot_imposta MONEY = 0;
    DECLARE @tot_doc MONEY = 0;
    DECLARE @data_cons_min DATETIME;

    BEGIN TRANSACTION;

    EXEC @lock_result = sp_getapplock
        @Resource    = @lock_name,
        @LockMode    = 'Exclusive',
        @LockTimeout = 5000;

    IF @lock_result < 0
    BEGIN
        ROLLBACK;
        RAISERROR('Impossibile ottenere il lock per la modifica ordine.', 16, 1);
        RETURN;
    END

    -- Verifica esistenza ordine
    SELECT @td_conto = td_conto
    FROM [UJET11].[dbo].[testord]
    WHERE codditt = @codditt AND td_tipork = 'O'
      AND td_anno = @anno AND td_serie = @serie AND td_numord = @numord
      AND td_flevas = 'N';

    IF @td_conto IS NULL
    BEGIN
        EXEC sp_releaseapplock @Resource = @lock_name;
        ROLLBACK;
        RAISERROR('Ordine non trovato o in evasione', 16, 1);
        RETURN;
    END

    -- Verifica che la riga esista e non sia evasa
    IF NOT EXISTS (
        SELECT 1 FROM [UJET11].[dbo].[movord]
        WHERE codditt = @codditt AND mo_tipork = 'O'
          AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
          AND mo_riga = @riga AND mo_quaeva = 0 AND mo_quapre = 0
    )
    BEGIN
        EXEC sp_releaseapplock @Resource = @lock_name;
        ROLLBACK;
        RAISERROR('Riga non trovata o gia evasa/prenotata', 16, 1);
        RETURN;
    END

    -- ============================================================
    -- 1. Calcola delta saldi da SOTTRARRE (prima di cancellare)
    -- ============================================================
    CREATE TABLE #deltas (
        codart VARCHAR(50), magaz SMALLINT, fase SMALLINT,
        commeca INT, lotto INT, ubicaz VARCHAR(18),
        d_ordin DECIMAL(27,9), d_vordin MONEY,
        d_impeg DECIMAL(27,9), d_vimpeg MONEY
    );

    INSERT INTO #deltas
    SELECT
        ko.ko_codart, ko.ko_magaz, ko.ko_fase,
        ko.ko_commecap, ko.ko_lottop, ko.ko_ubicaz,
        (mo.mo_quant - mo.mo_quaeva) * ko.ko_ordin,
        mo.mo_valore * ko.ko_ordin,
        (mo.mo_quant - mo.mo_quaeva) * ko.ko_impeg,
        mo.mo_valore * ko.ko_impeg
    FROM [UJET11].[dbo].[keyord] ko
    JOIN [UJET11].[dbo].[movord] mo
      ON mo.codditt = ko.codditt AND mo.mo_tipork = ko.ko_tipork
     AND mo.mo_anno = ko.ko_anno AND mo.mo_serie = ko.ko_serie
     AND mo.mo_numord = ko.ko_numord AND mo.mo_riga = ko.ko_riga
    WHERE ko.codditt = @codditt AND ko.ko_tipork = 'O'
      AND ko.ko_anno = @anno AND ko.ko_serie = @serie AND ko.ko_numord = @numord
      AND ko.ko_riga = @riga
      AND mo.mo_flevas = 'C' AND mo.mo_quant <> 0;

    -- 2. SOTTRARRE delta da artpro
    UPDATE ap
    SET ap.ap_ordin  = ap.ap_ordin  - agg.d_ordin,
        ap.ap_impeg  = ap.ap_impeg  - agg.d_impeg,
        ap.ap_vordin = ap.ap_vordin - agg.d_vordin,
        ap.ap_vimpeg = ap.ap_vimpeg - agg.d_vimpeg,
        ap.ap_ultagg = GETDATE()
    FROM [UJET11].[dbo].[artpro] ap
    JOIN (
        SELECT codart, magaz, fase,
               SUM(d_ordin) AS d_ordin, SUM(d_vordin) AS d_vordin,
               SUM(d_impeg) AS d_impeg, SUM(d_vimpeg) AS d_vimpeg
        FROM #deltas GROUP BY codart, magaz, fase
    ) agg ON ap.ap_codart = agg.codart AND ap.ap_magaz = agg.magaz AND ap.ap_fase = agg.fase
    WHERE ap.codditt = @codditt;

    -- 3. SOTTRARRE delta da artprox
    UPDATE apx
    SET apx.apx_ordin  = apx.apx_ordin  - agg.d_ordin,
        apx.apx_impeg  = apx.apx_impeg  - agg.d_impeg,
        apx.apx_vordin = apx.apx_vordin - agg.d_vordin,
        apx.apx_vimpeg = apx.apx_vimpeg - agg.d_vimpeg,
        apx.apx_ultagg = GETDATE()
    FROM [UJET11].[dbo].[artprox] apx
    JOIN (
        SELECT codart, fase,
               SUM(d_ordin) AS d_ordin, SUM(d_vordin) AS d_vordin,
               SUM(d_impeg) AS d_impeg, SUM(d_vimpeg) AS d_vimpeg
        FROM #deltas GROUP BY codart, fase
    ) agg ON apx.apx_codart = agg.codart AND apx.apx_fase = agg.fase
    WHERE apx.codditt = @codditt;

    -- 4. SOTTRARRE delta da lotcpro
    UPDATE lp
    SET lp.lp_ordin  = lp.lp_ordin  - agg.d_ordin,
        lp.lp_impeg  = lp.lp_impeg  - agg.d_impeg,
        lp.lp_vordin = lp.lp_vordin - agg.d_vordin,
        lp.lp_vimpeg = lp.lp_vimpeg - agg.d_vimpeg,
        lp.lp_ultagg = GETDATE()
    FROM [UJET11].[dbo].[lotcpro] lp
    JOIN (
        SELECT codart, magaz, fase, commeca, lotto, ubicaz,
               SUM(d_ordin) AS d_ordin, SUM(d_vordin) AS d_vordin,
               SUM(d_impeg) AS d_impeg, SUM(d_vimpeg) AS d_vimpeg
        FROM #deltas GROUP BY codart, magaz, fase, commeca, lotto, ubicaz
    ) agg ON lp.lp_codart = agg.codart AND lp.lp_magaz = agg.magaz
         AND lp.lp_fase = agg.fase AND lp.lp_commeca = agg.commeca
         AND lp.lp_lotto = agg.lotto AND lp.lp_ubicaz = agg.ubicaz
    WHERE lp.codditt = @codditt;

    -- 5. DELETE keyord per la riga
    DELETE FROM [UJET11].[dbo].[keyord]
    WHERE codditt = @codditt AND ko_tipork = 'O'
      AND ko_anno = @anno AND ko_serie = @serie AND ko_numord = @numord
      AND ko_riga = @riga;

    -- 6. DELETE movord riga
    DELETE FROM [UJET11].[dbo].[movord]
    WHERE codditt = @codditt AND mo_tipork = 'O'
      AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
      AND mo_riga = @riga;

    -- 7. Conta righe rimanenti
    SELECT @righe_rimanenti = COUNT(*)
    FROM [UJET11].[dbo].[movord]
    WHERE codditt = @codditt AND mo_tipork = 'O'
      AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
      AND mo_stasino <> 'N';

    IF @righe_rimanenti = 0
    BEGIN
        -- Ordine vuoto: cancella testord + ripristina tabnuma (come annulla-ordine)
        DELETE FROM [UJET11].[dbo].[movord]
        WHERE codditt = @codditt AND mo_tipork = 'O'
          AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord;

        DELETE FROM [UJET11].[dbo].[testord]
        WHERE codditt = @codditt AND td_tipork = 'O'
          AND td_anno = @anno AND td_serie = @serie AND td_numord = @numord;

        -- Ripristina tabnuma se era l'ultimo progressivo
        DECLARE @maxnum INT;
        SELECT @maxnum = ISNULL(tb_numprog, 0)
        FROM [UJET11].[dbo].[tabnuma]
        WHERE codditt = @codditt AND tb_numtipo = 'O' AND tb_numserie = @serie AND tb_numcodl = @anno;

        IF @maxnum = @numord
        BEGIN
            UPDATE [UJET11].[dbo].[tabnuma]
            SET tb_numprog = @numord - 1
            WHERE codditt = @codditt AND tb_numtipo = 'O' AND tb_numserie = @serie AND tb_numcodl = @anno;
        END

        EXEC sp_releaseapplock @Resource = @lock_name;
        COMMIT;
        SELECT 1 AS success, 'ordine_cancellato' AS risultato, 0 AS righe_rimanenti;
        RETURN;
    END

    -- 8. Ricalcola totali (ordine ancora vivo con righe rimanenti)
    SELECT @tot_merce = COALESCE(SUM(mo_valore), 0),
           @data_cons_min = MIN(mo_datcons)
    FROM [UJET11].[dbo].[movord]
    WHERE codditt = @codditt AND mo_tipork = 'O'
      AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
      AND mo_stasino <> 'N';

    -- Castelletto IVA
    CREATE TABLE #iva_lookup (codiva SMALLINT, perc_iva DECIMAL(5,2));
    BEGIN TRY
        BEGIN TRY
            INSERT INTO #iva_lookup (codiva, perc_iva)
            EXEC sp_executesql N'
                SELECT DISTINCT ISNULL(ar.ar_codiva, 0), COALESCE(iv.ci_periva, 22.00)
                FROM [UJET11].[dbo].[movord] mo
                JOIN [UJET11].[dbo].[artico] ar ON ar.ar_codart = mo.mo_codart
                LEFT JOIN [UJET11].[dbo].[tabciva] iv ON ar.ar_codiva = iv.ci_codiva
                WHERE mo.codditt = @codditt AND mo.mo_tipork = ''O''
                  AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
            ', N'@codditt VARCHAR(12), @anno SMALLINT, @serie VARCHAR(3), @numord INT',
               @codditt = @codditt, @anno = @anno, @serie = @serie, @numord = @numord;
        END TRY
        BEGIN CATCH
            DELETE FROM #iva_lookup;
            INSERT INTO #iva_lookup (codiva, perc_iva)
            EXEC sp_executesql N'
                SELECT DISTINCT ISNULL(ar.ar_codiva, 0), COALESCE(iv.ci_perc, 22.00)
                FROM [UJET11].[dbo].[movord] mo
                JOIN [UJET11].[dbo].[artico] ar ON ar.ar_codart = mo.mo_codart
                LEFT JOIN [UJET11].[dbo].[tabciva] iv ON ar.ar_codiva = iv.ci_codiva
                WHERE mo.codditt = @codditt AND mo.mo_tipork = ''O''
                  AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
            ', N'@codditt VARCHAR(12), @anno SMALLINT, @serie VARCHAR(3), @numord INT',
               @codditt = @codditt, @anno = @anno, @serie = @serie, @numord = @numord;
        END CATCH
    END TRY
    BEGIN CATCH
        DELETE FROM #iva_lookup;
    END CATCH

    CREATE TABLE #iva_riepilogo (pos INT IDENTITY(1,1), codiva SMALLINT, imponibile MONEY, perc_iva DECIMAL(5,2), imposta MONEY);
    INSERT INTO #iva_riepilogo (codiva, imponibile, perc_iva, imposta)
    SELECT ISNULL(ar.ar_codiva, 0), SUM(mo.mo_valore),
           COALESCE(il.perc_iva, 22.00),
           ROUND(SUM(mo.mo_valore) * COALESCE(il.perc_iva, 22.00) / 100.0, 2)
    FROM [UJET11].[dbo].[movord] mo
    JOIN [UJET11].[dbo].[artico] ar ON ar.ar_codart = mo.mo_codart
    LEFT JOIN #iva_lookup il ON ISNULL(ar.ar_codiva, 0) = il.codiva
    WHERE mo.codditt = @codditt AND mo.mo_tipork = 'O'
      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
    GROUP BY ISNULL(ar.ar_codiva, 0), il.perc_iva;

    SELECT @tot_imposta = COALESCE(SUM(imposta), 0) FROM #iva_riepilogo;
    SET @tot_doc = @tot_merce + @tot_imposta;

    UPDATE [UJET11].[dbo].[testord]
    SET td_totmerce = @tot_merce,
        td_totlordo = @tot_merce,
        td_totdoc   = @tot_doc,
        td_datcons  = @data_cons_min,
        td_ultagg   = GETDATE(),
        td_codiva_1  = COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 1), 0),
        td_imponib_1 = COALESCE((SELECT imponibile FROM #iva_riepilogo WHERE pos = 1), 0),
        td_imposta_1 = COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 1), 0),
        td_codiva_2  = COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 2), 0),
        td_imponib_2 = COALESCE((SELECT imponibile FROM #iva_riepilogo WHERE pos = 2), 0),
        td_imposta_2 = COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 2), 0),
        td_codiva_3  = COALESCE((SELECT codiva     FROM #iva_riepilogo WHERE pos = 3), 0),
        td_imponib_3 = COALESCE((SELECT imponibile FROM #iva_riepilogo WHERE pos = 3), 0),
        td_imposta_3 = COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 3), 0)
    WHERE codditt = @codditt AND td_tipork = 'O'
      AND td_anno = @anno AND td_serie = @serie AND td_numord = @numord;

    EXEC sp_releaseapplock @Resource = @lock_name;
    COMMIT;

    SELECT 1 AS success, 'riga_rimossa' AS risultato, @righe_rimanenti AS righe_rimanenti;
END
GO
