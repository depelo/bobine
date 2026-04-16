-- ============================================================
-- SP: usp_AggiungiRigheOrdineFornitore
-- Database: [GB2_SP] sul server di destinazione (BCUBE2 o prova)
-- Scopo: Aggiungere N righe ad un ordine fornitore ESISTENTE preservando
--         numord, ricalcolando totali testata + castelletto IVA, e
--         rinfrescando i saldi BCube (keyord/artpro) per le nuove righe.
-- ============================================================
-- Perche esiste: /annulla-ordine recupera il numero solo se e' l'ultimo
-- progressivo (stessa regola di BCube). In ambiente multi-operatore non e'
-- garantito, quindi "annulla + riemetti" per fare merge rischia di lasciare
-- un buco in tabnuma e cambiare il numord. La modifica in-place non tocca
-- tabnuma: aggiunge righe, ricalcola totali, chiama faggiorn2.
-- ============================================================
-- Vincoli:
--   * L'ordine deve esistere, td_flevas='N', nessuna riga evasa/prenotata.
--   * Articoli duplicati (stessa chiave codart+fase+magaz gia' in movord):
--     CONSENTITI. Ogni riga e' indipendente (es. scaglioni prezzo, date diverse).
--   * Applock per-ordine 'ModOrd_{anno}_{serie}_{numord}' per permettere
--     modifiche parallele su ordini diversi.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'usp_AggiungiRigheOrdineFornitore' AND type = 'P')
    DROP PROCEDURE dbo.usp_AggiungiRigheOrdineFornitore;
GO

CREATE PROCEDURE dbo.usp_AggiungiRigheOrdineFornitore
    @json_articoli   NVARCHAR(MAX),      -- [{codart, fase, magaz, quantita, data_consegna, prezzo, perqta, unmis, ol_progr}]
    @anno            SMALLINT,
    @serie           VARCHAR(3),
    @numord          INT,
    @operatore       VARCHAR(20) = 'mrpweb',
    @codditt         VARCHAR(12) = 'UJET11',
    @elaborazione_id VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @oggi       DATETIME = CAST(GETDATE() AS DATE);
    DECLARE @primo_mese DATETIME = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
    DECLARE @lock_name  VARCHAR(100) = 'ModOrd_' + CAST(@anno AS VARCHAR) + '_' + @serie + '_' + CAST(@numord AS VARCHAR);
    DECLARE @lock_result INT;
    DECLARE @err_msg    NVARCHAR(500);

    DECLARE @riga_start     INT;
    DECLARE @td_flevas      VARCHAR(1);
    DECLARE @td_conto       INT;
    DECLARE @tot_merce      MONEY = 0;
    DECLARE @tot_imposta    MONEY = 0;
    DECLARE @tot_doc        MONEY = 0;
    DECLARE @data_cons_min  DATETIME;

    -- ============================================================
    -- 0. Validazione input
    -- ============================================================
    IF @anno IS NULL OR @serie IS NULL OR @numord IS NULL OR @numord <= 0
    BEGIN
        RAISERROR('anno/serie/numord obbligatori', 16, 1);
        RETURN;
    END

    IF @json_articoli IS NULL OR LEN(@json_articoli) < 3
    BEGIN
        RAISERROR('Lista articoli vuota', 16, 1);
        RETURN;
    END

    -- ============================================================
    -- 1. Parse JSON articoli in tabella temporanea (identico a usp_CreaOrdineFornitore)
    -- ============================================================
    CREATE TABLE #articoli (
        riga        INT IDENTITY(1,1),     -- riga locale temp (non e' mo_riga)
        codart      VARCHAR(50),
        fase        SMALLINT,
        magaz       SMALLINT,
        quantita    DECIMAL(18,9),
        data_consegna DATE,
        prezzo      DECIMAL(18,6),
        perqta      DECIMAL(18,6),
        unmis       VARCHAR(3),
        ol_progr    INT,
        ar_descr    VARCHAR(255),
        ar_desint   VARCHAR(40),
        ar_codiva   SMALLINT,
        ar_controa  SMALLINT,
        contocontr  INT,
        valore      MONEY,
        mo_riga_new INT                    -- mo_riga finale assegnata post-lock
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
    -- 3. LOCK + VERIFICHE STATO + INSERT + RICALCOLO (sezione critica)
    -- ============================================================
    BEGIN TRANSACTION;

    EXEC @lock_result = sp_getapplock
        @Resource    = @lock_name,
        @LockMode    = 'Exclusive',
        @LockTimeout = 5000;

    IF @lock_result < 0
    BEGIN
        ROLLBACK;
        RAISERROR('Impossibile ottenere il lock per la modifica ordine. Riprovare.', 16, 1);
        RETURN;
    END

    -- 3a. Verifica esistenza ordine + stato (dentro l'applock)
    SELECT @td_flevas = td_flevas, @td_conto = td_conto
    FROM [UJET11].[dbo].[testord]
    WHERE codditt = @codditt AND td_tipork = 'O'
      AND td_anno = @anno AND td_serie = @serie AND td_numord = @numord;

    IF @td_conto IS NULL
    BEGIN
        EXEC sp_releaseapplock @Resource = @lock_name;
        ROLLBACK;
        SET @err_msg = 'Ordine ' + CAST(@numord AS VARCHAR) + '/' + @serie + '/' + CAST(@anno AS VARCHAR) + ' non trovato';
        RAISERROR(@err_msg, 16, 1);
        RETURN;
    END

    IF @td_flevas <> 'N'
    BEGIN
        EXEC sp_releaseapplock @Resource = @lock_name;
        ROLLBACK;
        RAISERROR('Ordine in evasione: non modificabile', 16, 1);
        RETURN;
    END

    -- 3b. Verifica nessuna merce evasa/prenotata (ANY riga)
    IF EXISTS (
        SELECT 1 FROM [UJET11].[dbo].[movord]
        WHERE codditt = @codditt AND mo_tipork = 'O'
          AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord
          AND (mo_quaeva > 0 OR mo_quapre > 0)
    )
    BEGIN
        EXEC sp_releaseapplock @Resource = @lock_name;
        ROLLBACK;
        RAISERROR('Ordine con righe evase o prenotate: non modificabile', 16, 1);
        RETURN;
    END

    -- 3c. Duplicati codart+fase+magaz: CONSENTITI.
    -- BCube supporta nativamente piu righe dello stesso articolo nello stesso ordine
    -- (es. scaglioni prezzo, date diverse aggregate). La chiave di movord e' mo_riga,
    -- non codart. Ogni conferma dell'operatore diventa una riga indipendente.

    -- 3d. Calcola mo_riga di partenza (dentro l'applock — nessuno puo' inserirne altre)
    SELECT @riga_start = ISNULL(MAX(mo_riga), 0)
    FROM [UJET11].[dbo].[movord]
    WHERE codditt = @codditt AND mo_tipork = 'O'
      AND mo_anno = @anno AND mo_serie = @serie AND mo_numord = @numord;

    UPDATE #articoli
    SET mo_riga_new = @riga_start + riga;

    -- ============================================================
    -- 4. INSERT movord delle nuove righe
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
        @codditt, 'O', @anno, @serie, @numord, a.mo_riga_new,
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
    -- 5. Ricalcolo totali testata SU MOVORD COMPLETO (vecchie + nuove)
    -- ============================================================
    SELECT
        @tot_merce     = SUM(mo.mo_valore),
        @data_cons_min = MIN(mo.mo_datcons)
    FROM [UJET11].[dbo].[movord] mo
    WHERE mo.codditt = @codditt AND mo.mo_tipork = 'O'
      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord;

    -- ============================================================
    -- 5a. Castelletto IVA ricostruito da movord completo
    -- Stesso pattern di usp_CreaOrdineFornitore: sp_executesql in TRY/CATCH
    -- per tollerare schema tabciva variabile (ci_perc vs tb_aliq).
    -- ============================================================
    CREATE TABLE #iva_lookup (
        codiva      SMALLINT PRIMARY KEY,
        perc_iva    DECIMAL(5,2)
    );

    BEGIN TRY
        IF OBJECT_ID('[UJET11].[dbo].[tabciva]', 'U') IS NOT NULL
        BEGIN
            -- Prova schema "nuovo" BCube: tb_codciva + tb_aliq
            BEGIN TRY
                EXEC sp_executesql N'
                    INSERT INTO #iva_lookup (codiva, perc_iva)
                    SELECT DISTINCT ISNULL(ar.ar_codiva, 0), COALESCE(iv.tb_aliq, 22.00)
                    FROM [UJET11].[dbo].[movord] mo
                    JOIN [UJET11].[dbo].[artico] ar ON ar.ar_codart = mo.mo_codart
                    LEFT JOIN [UJET11].[dbo].[tabciva] iv ON ar.ar_codiva = iv.tb_codciva
                    WHERE mo.codditt = @codditt AND mo.mo_tipork = ''O''
                      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
                ', N'@codditt VARCHAR(12), @anno SMALLINT, @serie VARCHAR(3), @numord INT',
                   @codditt = @codditt, @anno = @anno, @serie = @serie, @numord = @numord;
            END TRY
            BEGIN CATCH
                -- Fallback schema "vecchio": ci_codiva + ci_perc
                DELETE FROM #iva_lookup;
                EXEC sp_executesql N'
                    INSERT INTO #iva_lookup (codiva, perc_iva)
                    SELECT DISTINCT ISNULL(ar.ar_codiva, 0), COALESCE(iv.ci_perc, 22.00)
                    FROM [UJET11].[dbo].[movord] mo
                    JOIN [UJET11].[dbo].[artico] ar ON ar.ar_codart = mo.mo_codart
                    LEFT JOIN [UJET11].[dbo].[tabciva] iv ON ar.ar_codiva = iv.ci_codiva
                    WHERE mo.codditt = @codditt AND mo.mo_tipork = ''O''
                      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
                ', N'@codditt VARCHAR(12), @anno SMALLINT, @serie VARCHAR(3), @numord INT',
                   @codditt = @codditt, @anno = @anno, @serie = @serie, @numord = @numord;
            END CATCH
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
        ISNULL(ar.ar_codiva, 0),
        SUM(mo.mo_valore),
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

    -- ============================================================
    -- 5b. UPDATE testord con nuovi totali
    -- ============================================================
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
        td_imposta_3 = COALESCE((SELECT imposta    FROM #iva_riepilogo WHERE pos = 3), 0),
        td_codivaspeinc = COALESCE((SELECT codiva  FROM #iva_riepilogo WHERE pos = 1), 0)
    WHERE codditt = @codditt AND td_tipork = 'O'
      AND td_anno = @anno AND td_serie = @serie AND td_numord = @numord;

    -- ============================================================
    -- 6. Refresh saldi BCube — MANUALE, SOLO SULLE NUOVE RIGHE
    -- ============================================================
    -- NON possiamo chiamare bussp_bsorgsor9_faggiorn2 perche':
    --   a) bussp_aggkeyord9 fa INSERT (non MERGE) su keyord leggendo TUTTE
    --      le righe di movord dell'ordine -> PK violation sulle righe vecchie.
    --   b) bussp_aggproord9 itera su keyord x movord e SOMMA i delta per
    --      TUTTE le righe -> double-count di artpro/artprox/lotcpro per le
    --      righe vecchie gia' contabilizzate all'emissione originale.
    --
    -- Replichiamo qui la logica di faggiorn2 (ramo @tipodoc='O') scopandola
    -- alle sole righe con mo_riga > @riga_start (le nuove).
    -- Riferimento: bussp_aggkeyord9 + bussp_aggproord9 in UJET11.
    -- ============================================================

    -- 6a. INSERT keyord per le nuove righe (ramo 'O': ko_impeg=0, ko_ordin=1)
    INSERT INTO [UJET11].[dbo].[keyord] (
        codditt, ko_conto, ko_codart, ko_magaz, ko_datcons, ko_tipork,
        ko_serie, ko_numord, ko_riga, ko_anno, ko_commen,
        ko_impeg, ko_ordin, ko_lotto, ko_fase, ko_ubicaz,
        ko_commecap, ko_lottop, ko_commeca, ko_subcommeca, ko_rigaid
    )
    SELECT
        @codditt, td.td_conto, mo.mo_codart, mo.mo_magaz, mo.mo_datcons, mo.mo_tipork,
        mo.mo_serie, mo.mo_numord, mo.mo_riga, mo.mo_anno, mo.mo_commen,
        0, 1, mo.mo_lotto,
        CASE WHEN ar.ar_gesfasi = 'S' THEN mo.mo_fase ELSE 0 END,
        CASE WHEN ar.ar_gesubic = 'S' THEN mo.mo_ubicaz ELSE ' ' END,
        CASE WHEN ar.ar_gescomm = 'S' THEN mo.mo_commeca ELSE 0 END,
        CASE WHEN ar.ar_geslotti = 'S' THEN mo.mo_lotto ELSE 0 END,
        mo.mo_commeca, mo.mo_subcommeca, 1
    FROM [UJET11].[dbo].[movord] mo
    JOIN [UJET11].[dbo].[testord] td
      ON td.codditt = mo.codditt AND td.td_tipork = mo.mo_tipork
     AND td.td_anno = mo.mo_anno AND td.td_serie = mo.mo_serie AND td.td_numord = mo.mo_numord
    JOIN [UJET11].[dbo].[artico] ar
      ON ar.codditt = mo.codditt AND ar.ar_codart = mo.mo_codart
    WHERE mo.codditt = @codditt AND mo.mo_tipork = 'O'
      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
      AND mo.mo_riga > @riga_start;

    -- 6b. Ramo magaz2 (se movord ha mo_magaz2 <> 0 per le nuove righe)
    INSERT INTO [UJET11].[dbo].[keyord] (
        codditt, ko_conto, ko_codart, ko_magaz, ko_datcons, ko_tipork,
        ko_serie, ko_numord, ko_riga, ko_anno, ko_commen,
        ko_impeg, ko_ordin, ko_lotto, ko_fase, ko_ubicaz,
        ko_commecap, ko_lottop, ko_commeca, ko_subcommeca, ko_rigaid
    )
    SELECT
        @codditt, td.td_conto, mo.mo_codart, mo.mo_magaz2, mo.mo_datcons, mo.mo_tipork,
        mo.mo_serie, mo.mo_numord, mo.mo_riga, mo.mo_anno, mo.mo_commen,
        1, 0, mo.mo_lotto,
        CASE WHEN ar.ar_gesfasi = 'S' THEN mo.mo_fase ELSE 0 END,
        CASE WHEN ar.ar_gesubic = 'S' THEN mo.mo_ubicaz2 ELSE ' ' END,
        CASE WHEN ar.ar_gescomm = 'S' THEN mo.mo_commeca2 ELSE 0 END,
        CASE WHEN ar.ar_geslotti = 'S' THEN mo.mo_lotto ELSE 0 END,
        mo.mo_commeca2, mo.mo_subcommeca2, 2
    FROM [UJET11].[dbo].[movord] mo
    JOIN [UJET11].[dbo].[testord] td
      ON td.codditt = mo.codditt AND td.td_tipork = mo.mo_tipork
     AND td.td_anno = mo.mo_anno AND td.td_serie = mo.mo_serie AND td.td_numord = mo.mo_numord
    JOIN [UJET11].[dbo].[artico] ar
      ON ar.codditt = mo.codditt AND ar.ar_codart = mo.mo_codart
    WHERE mo.codditt = @codditt AND mo.mo_tipork = 'O'
      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
      AND mo.mo_riga > @riga_start
      AND mo.mo_magaz2 <> 0;

    -- 6c. Crea record artpro/artprox/lotcpro padre se mancanti (solo nuove righe)
    INSERT INTO [UJET11].[dbo].[artpro] (
        codditt, ap_codart, ap_magaz, ap_esist, ap_prenot, ap_ordin,
        ap_impeg, ap_carfor, ap_carpro, ap_carvar, ap_rescli, ap_scacli,
        ap_scapro, ap_scavar, ap_resfor, ap_giaini, ap_vprenot, ap_vordin,
        ap_vimpeg, ap_vcarfor, ap_vcarpro, ap_vcarvar, ap_vrescli, ap_vscacli,
        ap_vscapro, ap_vscavar, ap_vresfor, ap_vgiaini, ap_sommat, ap_daordi,
        ap_vdaordi, ap_fase, ap_ultagg
    )
    SELECT DISTINCT
        @codditt, ko.ko_codart, ko.ko_magaz, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ko.ko_fase, GETDATE()
    FROM [UJET11].[dbo].[keyord] ko
    JOIN [UJET11].[dbo].[movord] mo
      ON mo.codditt = ko.codditt AND mo.mo_tipork = ko.ko_tipork
     AND mo.mo_anno = ko.ko_anno AND mo.mo_serie = ko.ko_serie
     AND mo.mo_numord = ko.ko_numord AND mo.mo_riga = ko.ko_riga
    WHERE ko.codditt = @codditt AND ko.ko_tipork = 'O'
      AND ko.ko_anno = @anno AND ko.ko_serie = @serie AND ko.ko_numord = @numord
      AND mo.mo_riga > @riga_start
      AND NOT EXISTS (
        SELECT 1 FROM [UJET11].[dbo].[artpro] ap
        WHERE ap.codditt = @codditt AND ap.ap_codart = ko.ko_codart
          AND ap.ap_magaz = ko.ko_magaz AND ap.ap_fase = ko.ko_fase
      );

    INSERT INTO [UJET11].[dbo].[artprox] (
        codditt, apx_codart, apx_esist, apx_prenot, apx_ordin,
        apx_impeg, apx_giaini, apx_vprenot, apx_vordin, apx_vimpeg, apx_vgiaini,
        apx_qtalif, apx_vqtalif, apx_ultcos, apx_peucos, apx_ultpre, apx_dtulcar,
        apx_dtulsca, apx_daordi, apx_vdaordi, apx_fase, apx_ultagg
    )
    SELECT DISTINCT
        @codditt, ko.ko_codart, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        '1900/01/01', '1900/01/01', 0, 0, ko.ko_fase, GETDATE()
    FROM [UJET11].[dbo].[keyord] ko
    JOIN [UJET11].[dbo].[movord] mo
      ON mo.codditt = ko.codditt AND mo.mo_tipork = ko.ko_tipork
     AND mo.mo_anno = ko.ko_anno AND mo.mo_serie = ko.ko_serie
     AND mo.mo_numord = ko.ko_numord AND mo.mo_riga = ko.ko_riga
    WHERE ko.codditt = @codditt AND ko.ko_tipork = 'O'
      AND ko.ko_anno = @anno AND ko.ko_serie = @serie AND ko.ko_numord = @numord
      AND mo.mo_riga > @riga_start
      AND NOT EXISTS (
        SELECT 1 FROM [UJET11].[dbo].[artprox] apx
        WHERE apx.codditt = @codditt AND apx.apx_codart = ko.ko_codart AND apx.apx_fase = ko.ko_fase
      );

    INSERT INTO [UJET11].[dbo].[lotcpro] (
        codditt, lp_codart, lp_magaz, lp_commeca, lp_lotto, lp_fase, lp_ubicaz,
        lp_esist, lp_qtalif, lp_vqtalif, lp_giaini, lp_vgiaini,
        lp_prenot, lp_ordin, lp_impeg, lp_vprenot, lp_vordin, lp_vimpeg, lp_ultagg
    )
    SELECT DISTINCT
        @codditt, ko.ko_codart, ko.ko_magaz, ko.ko_commecap, ko.ko_lottop, ko.ko_fase, ko.ko_ubicaz,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, GETDATE()
    FROM [UJET11].[dbo].[keyord] ko
    JOIN [UJET11].[dbo].[movord] mo
      ON mo.codditt = ko.codditt AND mo.mo_tipork = ko.ko_tipork
     AND mo.mo_anno = ko.ko_anno AND mo.mo_serie = ko.ko_serie
     AND mo.mo_numord = ko.ko_numord AND mo.mo_riga = ko.ko_riga
    WHERE ko.codditt = @codditt AND ko.ko_tipork = 'O'
      AND ko.ko_anno = @anno AND ko.ko_serie = @serie AND ko.ko_numord = @numord
      AND mo.mo_riga > @riga_start
      AND NOT EXISTS (
        SELECT 1 FROM [UJET11].[dbo].[lotcpro] lp
        WHERE lp.codditt = @codditt AND lp.lp_codart = ko.ko_codart
          AND lp.lp_magaz = ko.ko_magaz AND lp.lp_commeca = ko.ko_commecap
          AND lp.lp_lotto = ko.ko_lottop AND lp.lp_fase = ko.ko_fase
          AND lp.lp_ubicaz = ko.ko_ubicaz
      );

    -- 6d. Accumula delta solo per le nuove righe in una temp table
    --     Formula: delta = (mo_quant - mo_quaeva) * ko_ordin (per ramo ko_impeg=0)
    --     Per ramo magaz2 (ko_impeg=1): va su impegnato invece di ordinato.
    CREATE TABLE #deltas_saldi (
        codart      VARCHAR(50),
        magaz       SMALLINT,
        fase        SMALLINT,
        commeca     INT,
        lotto       INT,
        ubicaz      VARCHAR(18),
        d_ordin     DECIMAL(27,9),
        d_vordin    MONEY,
        d_impeg     DECIMAL(27,9),
        d_vimpeg    MONEY
    );

    INSERT INTO #deltas_saldi (codart, magaz, fase, commeca, lotto, ubicaz, d_ordin, d_vordin, d_impeg, d_vimpeg)
    SELECT
        ko.ko_codart, ko.ko_magaz, ko.ko_fase, ko.ko_commecap, ko.ko_lottop, ko.ko_ubicaz,
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
      AND mo.mo_riga > @riga_start
      AND mo.mo_flevas = 'C'
      AND mo.mo_quant <> 0;

    -- 6e. Applica i delta aggregati su artpro
    UPDATE ap
    SET ap.ap_ordin  = ap.ap_ordin  + agg.d_ordin,
        ap.ap_impeg  = ap.ap_impeg  + agg.d_impeg,
        ap.ap_vordin = ap.ap_vordin + agg.d_vordin,
        ap.ap_vimpeg = ap.ap_vimpeg + agg.d_vimpeg,
        ap.ap_ultagg = GETDATE()
    FROM [UJET11].[dbo].[artpro] ap
    JOIN (
        SELECT codart, magaz, fase,
               SUM(d_ordin) AS d_ordin, SUM(d_vordin) AS d_vordin,
               SUM(d_impeg) AS d_impeg, SUM(d_vimpeg) AS d_vimpeg
        FROM #deltas_saldi GROUP BY codart, magaz, fase
    ) agg ON ap.ap_codart = agg.codart AND ap.ap_magaz = agg.magaz AND ap.ap_fase = agg.fase
    WHERE ap.codditt = @codditt;

    -- 6f. Applica delta su artprox (per codart + fase, non per magaz)
    UPDATE apx
    SET apx.apx_ordin  = apx.apx_ordin  + agg.d_ordin,
        apx.apx_impeg  = apx.apx_impeg  + agg.d_impeg,
        apx.apx_vordin = apx.apx_vordin + agg.d_vordin,
        apx.apx_vimpeg = apx.apx_vimpeg + agg.d_vimpeg,
        apx.apx_ultagg = GETDATE()
    FROM [UJET11].[dbo].[artprox] apx
    JOIN (
        SELECT codart, fase,
               SUM(d_ordin) AS d_ordin, SUM(d_vordin) AS d_vordin,
               SUM(d_impeg) AS d_impeg, SUM(d_vimpeg) AS d_vimpeg
        FROM #deltas_saldi GROUP BY codart, fase
    ) agg ON apx.apx_codart = agg.codart AND apx.apx_fase = agg.fase
    WHERE apx.codditt = @codditt;

    -- 6g. Applica delta su lotcpro (chiave completa)
    UPDATE lp
    SET lp.lp_ordin  = lp.lp_ordin  + agg.d_ordin,
        lp.lp_impeg  = lp.lp_impeg  + agg.d_impeg,
        lp.lp_vordin = lp.lp_vordin + agg.d_vordin,
        lp.lp_vimpeg = lp.lp_vimpeg + agg.d_vimpeg,
        lp.lp_ultagg = GETDATE()
    FROM [UJET11].[dbo].[lotcpro] lp
    JOIN (
        SELECT codart, magaz, commeca, lotto, fase, ubicaz,
               SUM(d_ordin) AS d_ordin, SUM(d_vordin) AS d_vordin,
               SUM(d_impeg) AS d_impeg, SUM(d_vimpeg) AS d_vimpeg
        FROM #deltas_saldi GROUP BY codart, magaz, commeca, lotto, fase, ubicaz
    ) agg ON lp.lp_codart = agg.codart AND lp.lp_magaz = agg.magaz
         AND lp.lp_commeca = agg.commeca AND lp.lp_lotto = agg.lotto
         AND lp.lp_fase = agg.fase AND lp.lp_ubicaz = agg.ubicaz
    WHERE lp.codditt = @codditt;

    -- Rilascia lock
    EXEC sp_releaseapplock @Resource = @lock_name;

    COMMIT TRANSACTION;

    -- ============================================================
    -- 7. Resultset di ritorno per Node.js
    -- ============================================================

    -- Resultset 1: testata aggiornata + dati fornitore (per PDF + frontend)
    SELECT
        @numord             AS numord,
        @anno               AS anno,
        @serie              AS serie,
        @td_conto           AS fornitore_codice,
        COALESCE(an.an_descr1, '')    AS fornitore_nome,
        COALESCE(an.an_indir, '')     AS fornitore_indirizzo,
        COALESCE(an.an_cap, '')       AS fornitore_cap,
        COALESCE(an.an_citta, '')     AS fornitore_citta,
        COALESCE(an.an_prov, '')      AS fornitore_prov,
        COALESCE(an.an_pariva, '')    AS fornitore_pariva,
        COALESCE(an.an_email, '')     AS fornitore_email,
        COALESCE(an.an_faxtlx, '')    AS fornitore_fax,
        COALESCE(an.an_porto, '')     AS porto,
        ''                            AS pagamento_descr,
        COALESCE(an.an_codpag, 0)     AS pagamento_codice,
        @tot_merce                    AS totale_merce,
        @tot_imposta                  AS totale_imposta,
        @tot_doc                      AS totale_documento,
        @oggi                         AS data_ordine
    FROM [UJET11].[dbo].[anagra] an
    WHERE an.an_conto = @td_conto;

    -- Resultset 2: TUTTE le righe dell'ordine (vecchie + nuove) + flag is_new
    -- Node.js usa is_new=1 per sapere quali inserire in ordini_emessi@163.
    -- Il PDF usa tutte le righe per mostrare l'ordine completo.
    SELECT
        mo.mo_riga              AS mo_riga,
        mo.mo_codart            AS mo_codart,
        mo.mo_descr             AS mo_descr,
        mo.mo_desint            AS mo_desint,
        mo.mo_unmis             AS mo_unmis,
        mo.mo_quant             AS mo_quant,
        mo.mo_prezzo            AS mo_prezzo,
        mo.mo_valore            AS mo_valore,
        mo.mo_datcons           AS mo_datcons,
        mo.mo_fase              AS mo_fase,
        mo.mo_magaz             AS mo_magaz,
        CASE WHEN mo.mo_riga > @riga_start THEN 1 ELSE 0 END AS is_new,
        ISNULL(a.ol_progr, 0)   AS ol_progr
    FROM [UJET11].[dbo].[movord] mo
    LEFT JOIN #articoli a ON a.mo_riga_new = mo.mo_riga
    WHERE mo.codditt = @codditt AND mo.mo_tipork = 'O'
      AND mo.mo_anno = @anno AND mo.mo_serie = @serie AND mo.mo_numord = @numord
    ORDER BY mo.mo_riga;

    -- Cleanup
    DROP TABLE #articoli;
    DROP TABLE #iva_lookup;
    DROP TABLE #iva_riepilogo;
    DROP TABLE #deltas_saldi;
END;
GO
