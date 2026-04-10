-- ============================================================
-- deploy_anagra_hh_tiporeport.sql
-- Aggiunge colonna HH_TipoReport a dbo.anagra (UJET11)
-- Usata da GB2 per scegliere il layout PDF ordini fornitore.
-- Valori: 'IT' (Italia), 'UE' (Unione Europea), 'EXTRA_UE'
--
-- NOTA: questo script gira DIRETTAMENTE su UJET11 (prova).
-- In produzione, le query vengono adattate a runtime con
-- naming cross-server ([BCUBE2].[UJET11].[dbo].[anagra]).
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.anagra')
      AND name = 'HH_TipoReport'
)
BEGIN
    ALTER TABLE dbo.anagra ADD HH_TipoReport VARCHAR(10) NULL;

    -- Proprieta estesa ms_description (documenta lo scopo della colonna)
    EXEC sp_addextendedproperty
        @name       = N'MS_Description',
        @value      = N'GB2: classificazione fornitore per layout PDF ordine (IT/UE/EXTRA_UE). Creata automaticamente da GB2.',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE',  @level1name = N'anagra',
        @level2type = N'COLUMN', @level2name = N'HH_TipoReport';

    PRINT 'Colonna HH_TipoReport aggiunta ad anagra.';
END
ELSE
BEGIN
    PRINT 'Colonna HH_TipoReport esiste gia.';
END
GO

-- ============================================================
-- Popola i valori NULL con la regola automatica.
-- Solo fornitori (an_tipo = 'F'). Non sovrascrive valori gia impostati.
--
-- Regola (verificata su 1994 fornitori BCUBE2, 10/04/2026):
--   1. an_nazion1 compilata + in lista UE        → 'UE'
--   2. an_nazion1 compilata + non in lista UE     → 'EXTRA_UE'
--   3. an_nazion1 vuota + an_prov compilata (2ch)  → 'IT'
--   4. an_nazion1 vuota + prov vuota + piva vuota  → 'IT' (interni/fittizi)
--   5. an_nazion1 vuota + prov vuota + piva 11 num → 'IT' (P.IVA italiana)
--   6. Tutto il resto                              → 'EXTRA_UE'
-- ============================================================

UPDATE dbo.anagra
SET HH_TipoReport = CASE
    -- Nazione compilata: UE o EXTRA_UE
    WHEN RTRIM(ISNULL(an_nazion1, '')) IN (
        'A','B','BG','CZ','DK','DE','EW','E','F','FIN','GR',
        'H','HR','IRL','L','LT','LV','M','NL','P','PL',
        'RO','S','SK','SLO'
    ) THEN 'UE'
    WHEN RTRIM(ISNULL(an_nazion1, '')) <> ''
        THEN 'EXTRA_UE'
    -- Nazione vuota + provincia compilata (sigla 2 char) = italiano
    WHEN LEN(RTRIM(ISNULL(an_prov, ''))) = 2
        THEN 'IT'
    -- Nazione vuota + provincia vuota + P.IVA vuota = interno/fittizio
    WHEN RTRIM(ISNULL(an_pariva, '')) = ''
        THEN 'IT'
    -- Nazione vuota + provincia vuota + P.IVA 11 cifre numeriche = italiano
    WHEN LEN(RTRIM(an_pariva)) = 11 AND ISNUMERIC(RTRIM(an_pariva)) = 1
        THEN 'IT'
    -- Tutto il resto = extra UE (esteri senza nazione compilata)
    ELSE 'EXTRA_UE'
END
WHERE an_tipo = 'F'
  AND HH_TipoReport IS NULL;

PRINT 'Classificazione fornitori completata.';
GO
