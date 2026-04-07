-- ============================================================
-- SP: usp_AggiornaStatoInvioOrdine
-- Database: MRP (cross-database verso [UJET11].[dbo].*)
-- Scopo: Aggiorna lo stato di stampa/invio di un ordine
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'usp_AggiornaStatoInvioOrdine' AND type = 'P')
    DROP PROCEDURE dbo.usp_AggiornaStatoInvioOrdine;
GO

CREATE PROCEDURE dbo.usp_AggiornaStatoInvioOrdine
    @anno   SMALLINT,
    @serie  VARCHAR(3),
    @numord INT,
    @stato  VARCHAR(1),         -- 'S'=stampato/inviato, 'N'=non inviato
    @codditt VARCHAR(12) = 'UJET11'
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [UJET11].[dbo].[testord]
    SET td_flstam = @stato,
        td_ultagg = GETDATE()
    WHERE codditt = @codditt
      AND td_tipork = 'O'
      AND td_anno = @anno
      AND td_serie = @serie
      AND td_numord = @numord;

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR('Ordine O/%d/%s/%d non trovato', 16, 1, @anno, @serie, @numord);
        RETURN;
    END

    SELECT @anno AS anno, @serie AS serie, @numord AS numord, @stato AS stato;
END;
GO
