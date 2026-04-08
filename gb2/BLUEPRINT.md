# MRP BLUEPRINT — Documento Architetturale

**Progetto:** Migrazione MRP Access → Applicazione Web
**Data:** 2 Aprile 2026 | **Fonte:** MRP.accdb (~14MB)

> AUTOSUFFICIENTE: contiene tutta la conoscenza estratta. Usabile in chat fresca senza file grezzi.

---

## 1. SORGENTI DATI

### SQL Server UJET11 (BCube) (45 tabelle)
`anagra`, `artfasi`, `artico_cube`, `dbo___MMTIPORK`, `dbo___MOTIPORK`, `dbo__Controllo tempi old`, `dbo__NOMCOMB`, `dbo__Risorse_CDL`, `dbo__Storico_Giacenze`, `dbo__Storico_Magazzino_2006`, `dbo__Storico_Magazzino_2007`, `dbo_allole`, `dbo_anagra`, `dbo_artacce`, `dbo_artfasi`, `dbo_artico_cube`, `dbo_artmaga`, `dbo_artpro_SQL`, `dbo_cicli`, `dbo_distbas`, `dbo_HH_ARTFASI`, `dbo_keymag`, `dbo_lavcent`, `dbo_listprod_cube`, `dbo_movdis_SQL`, `dbo_movmag`, `dbo_movord`, `dbo_tabcent`, `dbo_tabgmer`, `dbo_tabmaga`, `dbo_tabsgme`, `dbo_testmag`, `dbo_testord`, `dbo_testord1`, `dbo_ujet_tipo`, `dbo_View_32_Scarichi 2008`, `dbo_VIEW_Esistenza confezionati da sterilizzare`, `dbo_VIEW_impegni di produzione aperti`, `distbas`, `HH_ARTPRO_SQL`, `movdis_SQL`, `ordlist_cube`, `tabmaga`, `testord`, `zzdispsca_sql`

### SQL Server APP (10 tabelle)
`artico`, `dbo_artico`, `dbo_artpro`, `dbo_listprod`, `dbo_movdis`, `HH_ARTPRO`, `listprod`, `movdis`, `ordlist`, `zzdispsca`

### MRP_be.mdb (fileserver) (16 tabelle)
`_tempi ciclo per taglio`, `Articolo`, `classi`, `Classificazione articoli`, `CmpPacchi`, `Department`, `Employees`, `Gruppo`, `Impegno`, `Location`, `PrdPacchi`, `Rprod`, `ScMin_ScMinCalc`, `Stenditore`, `tempi ciclo per taglio`, `Tprod`

### Tabelle locali Access (16 tabelle)
`P_ORDLIST`, `Tab_15`, `tab_15_tmp`, `tab_15_tmp_com`, `Tab_15_Tot`, `Tab_15_Tot_com`, `tab_graf_01`, `tab_graf_02`, `tab_graf_03`, `tab_graf_04`, `tblMileage`, `ttblLettersMerge`, `zstblQBFFields`, `zstblQBFLetters`, `zstblQBFSource`, `zstblQBFVersion`

---
## 2. STRUTTURA TABELLE

### UJET11

**`anagra`** (src: `dbo.anagra`)

**`artfasi`** (src: `dbo.artfasi`)

**`artico_cube`** (src: `dbo.artico`)

**`dbo___MMTIPORK`** (src: `dbo.__MMTIPORK`)

**`dbo___MOTIPORK`** (src: `dbo.__MOTIPORK`)

**`dbo__Controllo tempi old`** (src: `dbo._Controllo tempi old`)

**`dbo__NOMCOMB`** (src: `dbo._NOMCOMB`)

**`dbo__Risorse_CDL`** (src: `dbo._Risorse_CDL`)

**`dbo__Storico_Giacenze`** (src: `dbo._Storico_Giacenze`)

**`dbo__Storico_Magazzino_2006`** (src: `dbo._Storico_Magazzino_2006`)

**`dbo__Storico_Magazzino_2007`** (src: `dbo._Storico_Magazzino_2007`)

**`dbo_allole`** (src: `dbo.allole`)

**`dbo_anagra`** (src: `dbo.anagra`)

**`dbo_artacce`** (src: `dbo.artacce`)

**`dbo_artfasi`** (src: `dbo.artfasi`)

**`dbo_artico_cube`** (src: `dbo.artico`)

**`dbo_artmaga`** (src: `dbo.artmaga`)

**`dbo_artpro_SQL`** (src: `dbo.artpro`)

**`dbo_cicli`** (src: `dbo.cicli`)

**`dbo_distbas`** (src: `dbo.distbas`)

**`dbo_HH_ARTFASI`** (src: `dbo.HH_ARTFASI`)

**`dbo_keymag`** (src: `dbo.keymag`)

**`dbo_lavcent`** (src: `dbo.lavcent`)

**`dbo_listprod_cube`** (src: `dbo.listprod`)

**`dbo_movdis_SQL`** (src: `dbo.movdis`)

**`dbo_movmag`** (src: `dbo.movmag`)

**`dbo_movord`** (src: `dbo.movord`)

**`dbo_tabcent`** (src: `dbo.tabcent`)

**`dbo_tabgmer`** (src: `dbo.tabgmer`)

**`dbo_tabmaga`** (src: `dbo.tabmaga`)

**`dbo_tabsgme`** (src: `dbo.tabsgme`)

**`dbo_testmag`** (src: `dbo.testmag`)

**`dbo_testord`** (src: `dbo.testord`)

**`dbo_testord1`** (src: `dbo.testord`)

**`dbo_ujet_tipo`** (src: `dbo.ujet_tipo`)

**`dbo_View_32_Scarichi 2008`** (src: `dbo.View_32_Scarichi 2008`)

**`dbo_VIEW_Esistenza confezionati da sterilizzare`** (src: `dbo.VIEW_Esistenza confezionati da sterilizzare`)

**`dbo_VIEW_impegni di produzione aperti`** (src: `dbo.VIEW_impegni di produzione aperti`)

**`distbas`** (src: `dbo.distbas`)

**`HH_ARTPRO_SQL`** (src: `dbo.HH_ARTPRO`)

**`movdis_SQL`** (src: `dbo.movdis`)

**`ordlist_cube`** (src: `dbo.ordlist`)

**`tabmaga`** (src: `dbo.tabmaga`)

**`testord`** (src: `dbo.testord`)

**`zzdispsca_sql`** (src: `dbo.zzdispsca`)

### APP

**`artico`** (src: `dbo.artico`)

**`dbo_artico`** (src: `dbo.artico`)

**`dbo_artpro`** (src: `dbo.artpro`)

**`dbo_listprod`** (src: `dbo.listprod`)

**`dbo_movdis`** (src: `dbo.movdis`)

**`HH_ARTPRO`** (src: `dbo.HH_ARTPRO`)

**`listprod`** (src: `dbo.listprod`)

**`movdis`** (src: `dbo.movdis`)

**`ordlist`** (src: `dbo.ordlist`)

**`zzdispsca`** (src: `dbo.zzdispsca`)

### MRP_BE

**`_tempi ciclo per taglio`** (src: `_tempi ciclo per taglio`)

**`Articolo`** (src: `Articolo`)

**`classi`** (src: `classi`)

**`Classificazione articoli`** (src: `Classificazione articoli`)

**`CmpPacchi`** (src: `CmpPacchi`)

**`Department`** (src: `Department`)

**`Employees`** (src: `Employees`)

**`Gruppo`** (src: `Gruppo`)

**`Impegno`** (src: `Impegno`)

**`Location`** (src: `Location`)

**`PrdPacchi`** (src: `PrdPacchi`)

**`Rprod`** (src: `Rprod`)

**`ScMin_ScMinCalc`** (src: `ScMin_ScMinCalc`)

**`Stenditore`** (src: `Stenditore`)

**`tempi ciclo per taglio`** (src: `tempi ciclo per taglio`)

**`Tprod`** (src: `Tprod`)

### LOCALE

**`P_ORDLIST`**

**`Tab_15`**

**`tab_15_tmp`**

**`tab_15_tmp_com`**

**`Tab_15_Tot`**

**`Tab_15_Tot_com`**

**`tab_graf_01`**

**`tab_graf_02`**

**`tab_graf_03`**

**`tab_graf_04`**

**`tblMileage`**

**`ttblLettersMerge`**

**`zstblQBFFields`**

**`zstblQBFLetters`**

**`zstblQBFSource`**

**`zstblQBFVersion`**

---
## 3. MODULI FUNZIONALI

### Modulo 1: Scorte Minime
Calcolo scorta minima da consumi, gg riordino, std vs calc, grafico storico.

**Form:**
- `frm_scmin_lista` [RS=`qry_scmin_lista` | 17txt/1cbo/4btn | sub:Form.frm_grafic_scmin]
  Campi: mm_codart, mm_fase, ar_codalt, SommaDimm_quant, ar_ggriorC, scmin_std, ar_polriord, ar_gesfasi
- `frm_scmin_lista_all` [RS=`qry_scmin_lista_Con_calcoli` | 19txt/4cbo/5btn]
  Campi: mm_codart, mm_fase, ar_codalt, SommaDimm_quant, ar_ggrior, scmin_std, ar_polriord, ar_gesfasi
- `frm_scmin_lista_all_sort` [5txt/3cbo/3btn | sub:Form.Sottomaschera qry_scmin_lista_Con_calcoli1]
- `frm_grafic_scmin` [0txt/0cbo/0btn]
- `frm_artico_scmin` [RS=`artico` | 5txt/1cbo/1btn]
  Campi: ar_codart, ar_descr, ar_scomin, ar_ggrior
- `frm_hh_artfasi_scmin` [RS=`dbo_HH_artfasi` | 9txt/1cbo/1btn]
  Campi: HH_af_codart, HH_af_fase, HH_af_ggrior

**Query (18):** `qry_Crea_Scmin_Scmic_calc`, `qry_del_ScMin_ScMin_Calc`, `qry_grafico_scminstd`, `qry_grafico_scminstd old`, `qry_hh_ggrior_scmin`, `qry_magaz_storico`, `qry_media_esistenza`, `qry_scarichi_qta`, `qry_scarichi_xx_mesi`, `qry_scarichi_xx_mesi_var`, `qry_scmin_art`, `qry_scmin_lista`, `qry_scmin_lista_Con_calcoli`, `qry_scmin_lista_Con_calcoli1`, `qry_scmin_lista_con_colcoli0`, `qry_scmin_liste_prod`, `qry_scmin_lprod`, `qry_sel_ScMin_ScMin_calc`

### Modulo 2: Analisi Consumi
Drill-down: anno→trimestre→mese. Due percorsi: per fase e per articolo.

**Form:**
- `frm_Consumi` [RS=`SELECT dbo_distbas.db_coddb, dbo_artico.ar_codalt, dbo_artic` | 4txt/1cbo/1btn | sub:Form.frm_consumi_diba]
  Campi: db_coddb, ar_codalt, ar_descr
- `frm_consumi_anno` [RS=`SELECT qry_sel_consumi_anno.Codart, qry_sel_consumi_anno.Fas` | 5txt/1cbo/1btn | sub:Form.frm_Consumi_Trim]
  Campi: Anno, UM, SommaDiQtà, SommaDiValore
- `frm_Consumi_Trim` [RS=`SELECT qry_sel_consumi_trim.Codart, qry_sel_consumi_trim.Fas` | 5txt/1cbo/1btn | sub:Form.frm_consumi_mese]
  Campi: Trim, UM, SommaDiQtà, SommaDiValore
- `frm_consumi_mese` [RS=`SELECT qry_sel_consumi_mese.Codart, qry_sel_consumi_mese.Fas` | 5txt/1cbo/1btn]
  Campi: mesew, UM, SommaDiQtà, SommaDiValore
- `frm_Consumi_ART` [1txt/4cbo/1btn | sub:Form.frm_consumi_annoART]
- `frm_consumi_annoART` [RS=`SELECT qry_sel_consumi_anno.Codart, qry_sel_consumi_anno.Ann` | 6txt/1cbo/1btn | sub:Form.frm_Consumi_TrimART]
  Campi: Anno, UM, SommaDiQtà, SommaDiValore, Fase
- `frm_consumi_param` [0txt/4cbo/2btn]
- `frm_consumi_diba` [RS=`SELECT movdis.md_coddb, movdis.md_riga, movdis.md_codfigli, ` | 5txt/1cbo/1btn | sub:Form.frm_consumi_anno]
  Campi: md_fasefigli, ar_codalt, ar_descr, md_codfigli

**Query (5):** `qry_sel_consumi`, `qry_sel_consumi_anno`, `qry_sel_consumi_diba`, `qry_sel_consumi_mese`, `qry_sel_consumi_trim`

### Modulo 3: Tempi Lavorazione C/Terzi
TU eff vs std, deviazione, analisi per terzista. Pipeline Tab_15.

**Form:**
- `frm_lista_mov` [RS=`qry_lista_mov` | 22txt/3cbo/5btn]
  Campi: mm_codart, mm_fase, ar_codalt, ar_descr, an_descr1, mm_serie, mm_numdoc, mm_anno
- `frm_lista_mov_art_fase` [4txt/3cbo/4btn | sub:Form.frm_Tab_15A]
- `frm_lista_mov_x_articolo` [RS=`qry_lista_mov_new_old_union` | 24txt/1cbo/2btn]
  Campi: mm_codart, ar_codalt, ar_descr, nome_terz, mm_serie, mm_numdoc, mm_anno, tm_datdoc
- `frm_Tab_15A` [RS=`SELECT Tab_15_Tot.mm_codart, dbo_artico.ar_descr FROM Tab_15` | 3txt/0cbo/0btn | sub:Form.frm_Tab_15_Tot]
  Campi: mm_codart, ar_descr
- `frm_Tab_15_Tot` [RS=`SELECT [Tab_15_Tot].[mm_codart], [Tab_15_Tot].[mm_fase], [Ta` | 12txt/0cbo/0btn | sub:Form.frm_Tab_15_Tot_Cor]
  Campi: mm_codart, mm_fase, nrec, lotto_min, lotto_max, Lotto_medio
- `frm_Tab_15_Tot_Cor` [RS=`SELECT Tab_15_Tot_Com.mm_codart, Tab_15_Tot_Com.mm_fase, Tab` | 13txt/0cbo/0btn | sub:Form.frm_Tab_15_det]
  Campi: mm_codart, mm_fase, nrec, lotto_min, lotto_max, Lotto_medio, an_descr1
- `frm_Tab_15_det` [RS=`SELECT Tab_15.tm_datdoc, Tab_15.an_descr1, Tab_15.mm_anno, T` | 15txt/0cbo/0btn]
  Campi: tm_datdoc, an_descr1, mm_anno, mm_serie, mm_numdoc, mm_riga, mm_codart, mm_fase
- `Frm_TempiTaglio` [RS=`qry_TempiTaglio` | 30txt/1cbo/1btn]
  Campi: Classe, descrizione, RPrd_PF, af_fase, af_descr, ar_descr, ar_codalt, RPrd_anno

**Query (29):** `01_Totale tempi per classe`, `Articoli con taglio non classificati`, `qry_lista_mov`, `qry_lista_mov_new_old_union`, `qry_lista_mov_new_old_union_nozero`, `qry_lista_mov_new_old_union_nozero_old`, `qry_lista_mov_old`, `qry_lista_mov_old_union`, `qry_lista_mov_union`, `qry_minmaxstd`, `qry_nrec_min_max_media`, `qry_nrec_min_max_media1`, `qry_TempiTaglio`, `qry_union_new_old`, `Query_ATTRIBUZIONE TEMPI STD TAGLIO A CICLI`, `query_crea_tab15`, `query_crea_tab15_artfase`, `query_crea_tab15_artfase_com`, `query_crea_tab15_tmp`, `query_crea_tab15_tmp_com`, `query_crea_tab15_tot`, `Query_Crezione tabella tempi per taglio`, `query_del_tab15`, `query_del_tab15_tmp`, `query_del_tab15_tmp_com`, `query_del_tab15_tot`, `query_del_tab15_tot_com`, `query_sel_tab15_artfase`, `query_tab15_rag`

### Modulo 4: Distinte Base / TreeView
Navigazione gerarchica distinte e cicli. Usava TList7.

**Form:**
- `frmTreeArtPro` [1txt/0cbo/3btn]
- `frmTreeArtProHH` [1txt/0cbo/9btn]
- `frmTreeRMP` [1txt/0cbo/2btn]
- `frmTreeRMPcomp` [1txt/0cbo/10btn]
- `frmTreeRMPcompHH` [1txt/0cbo/10btn]
- `frmListProd` [RS=`qryEstArt_list` | 11txt/0cbo/2btn]
  Campi: ol_codart, ar_descr, ar_codalt, ol_datcons, Conf_gen, an_descr1, cb_modesrk, SommaDiol_quant
- `frmListProdPadre` [RS=`qryEstArt_ListPadre` | 15txt/0cbo/0btn]
  Campi: ordlist_1.ol_codart, artico_1.ar_descr, artico_1.ar_codalt, ordlist.ol_fase, ordlist.ol_magaz, ol_datcons, conf_gen, an_descr1

**Query (6):** `qry_listprod`, `QryImpiego`, `qrylistprod`, `QryNumImp`, `qryproartdb`, `qryprogart`

### Modulo 5: Ordini Produzione
Tprod/Rprod, ordini Albatex, budget gruppo, ordini fornitori.

**Form:**
- `frmTprod` [RS=`Tprod` | 11txt/2cbo/11btn | sub:Form.frmRprod_Tprod]
  Campi: TPrd_anno, TPrd_num, TPrd_Stn_id, TPrd_TmpStesa, TPrd_TmpDisegno, TPrd_TmpTaglio, TPrd_TmpConf, TPrd_Note
- `frmRprod_Tprod` [RS=`Rprod` | 19txt/3cbo/2btn]
  Campi: RPrd_riga, RPrd_riford_anno, RPPd_riford_serie, RPrd_riford_num, RPrd_riford_riga, RPrd_Lotto, RPrd_UmStesa, RPrd_Stesa
- `frmOrdProd` [RS=`qryEstArt_ord` | 18txt/0cbo/3btn]
  Campi: ar_descr, ar_codalt, ar_sostit, ar_sostituito, ar_inesaur, mo_anno, mo_serie, mo_numord
- `frm_ordini_albatex` [RS=`qry_ordini_albatex` | 16txt/2cbo/1btn]
  Campi: gr_descr, gr_budget, td_anno, td_serie, td_numord, tot_qta_ord, tot_qta_evasa, cb_modesrk
- `frm_ordini_for` [RS=`qry_OrdFor` | 15txt/4cbo/2btn]
  Campi: mo_codart, mo_unmis, mo_descr, mo_datcons, mo_quant, mo_quaeva, cb_modesrk, an_descr1
- `frmImpiego` [RS=`Impegno` | 5txt/1cbo/2btn]
  Campi: Cod_Prod, ArtAlt, Descrizione, Num_Cmp
- `frm_schedeprod` [RS=`Q_schede_prod` | 2txt/0cbo/0btn]
  Campi: ao_nomedoc
- `frm_buget_consul` [RS=`qry_totord_albatex_gruppo` | 8txt/1cbo/1btn]
  Campi: gr_id, gr_descr, gr_budget, tot_qta_evasa, tot_qta_ord

**Query (22):** `LimitEnterEditProductList`, `LimitProductList`, `LimitProductList_PFDBFS`, `Q_schede_prod`, `qry_AGG_P_ORDLIST`, `qry_Del_P_ORDLIST`, `qry_frmTprod`, `qry_OrdFor`, `qry_ordini_albatex`, `qry_OrdProd_albatex`, `qry_totord_albatex`, `qry_totord_albatex_gruppo`, `qryEstArt_ord`, `qryEstArt_ordPadre`, `qryordlist`, `qryordlist senza corrispondenza con  dbo_artpro`, `qryordlist1`, `qrySchedaProduzione`, `qty_OrdProd_Albatex_Verify`, `qty_OrdProd_Albatex_Verify senza corrispondenza con  Articolo`, `Work Order`, `WorkOrderStatusChart`

### Modulo 6: Anagrafica
Articoli, gruppi, classificazione, esauriti/sostituiti.

**Form:**
- `frm_articolo` [RS=`Articolo` | 3txt/3cbo/1btn]
  Campi: ar_articolo, ar_gr_id
- `frm_Gruppo` [RS=`Gruppo` | 4txt/1cbo/2btn]
  Campi: gr_id, gr_descr, gr_budget
- `frm_Gruppo_Art` [RS=`Gruppo` | 4txt/1cbo/1btn | sub:Form.frm_Gruppo_art_sub]
  Campi: gr_id, gr_budget, gr_descr
- `frm_esaurito` [RS=`SELECT artico.ar_codart, artico.ar_codalt, artico.ar_descr, ` | 15txt/1cbo/1btn]
  Campi: ar_codart, ar_sostit, artico.ar_codalt, artico.ar_descr, ar_inesaur, ar_sostituito, artico.ar_codalt, ar_descri1
- `frm_RiCerca` [2txt/3cbo/0btn]
- `prdpacchi` [RS=`PrdPacchi` | 5txt/2cbo/10btn | sub:Form.CmpPacchi Sottomaschera]
  Campi: prd_codart, prd_codalt, prd_descr, prd_desint
- `Frm_Stenditore` [RS=`Stenditore` | 3txt/1cbo/3btn]
  Campi: Stn_id, Stn_des

**Query (8):** `<Mov_Mag_Articolo_Fase>`, `02_TU per classe`, `03_Articoli prodotti non presenti su classific`, `artico senza corrispondenza con  dbo_artpro`, `CentroLavoro`, `Qry_accgruppo`, `Qry_articolo`, `QryArticolo`

---
## 4. QUERY SQL COMPLETE

### SCORTE_MINIME

**`qry_Crea_Scmin_Scmic_calc`** (APPEND)
```sql
INSERT INTO ScMin_ScMinCalc ( mm_codart, mm_fase, scarichi, mediagg, scmin_calc, ar_scomin, ar_polriord, ar_ggrior, ar_gesfasi )
SELECT qry_scarichi_qta.mm_codart, qry_scarichi_qta.mm_fase, ([SommaDimm_quant]) AS scarichi, ([SommaDimm_quant]/180) AS mediagg, IIf(Round(([SommaDimm_quant]/180)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))=0,1,Round(([SommaDimm_quant]/180)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))) AS scmin_calc, qry_scarichi_qta.ar_scominC, qry_scarichi_qta.ar_polriord, qry_scarichi_qta.ar_ggriorC, qry_scarichi_qta.ar_gesfasi
FROM qry_scarichi_qta;
```

**`qry_del_ScMin_ScMin_Calc`** (DELETE)
```sql
DELETE ScMin_ScMinCalc.*
FROM ScMin_ScMinCalc;
```

**`qry_grafico_scminstd`** (SELECT)
```sql
SELECT dbo__Storico_Giacenze.dataelab AS data, dbo__Storico_Giacenze.codart AS mm_codart, dbo__Storico_Giacenze.Fase AS mm_fase, dbo__Storico_Giacenze.Esistenza, Round([Esi_med]) AS Esistenza_Media, Round([scmin_std]) AS scmin, Round([scmin_cal]) AS scmin_calc
FROM (Qry_01_calcolo_scorta_minima_calcolata INNER JOIN dbo__Storico_Giacenze ON (Qry_01_calcolo_scorta_minima_calcolata.mm_codart = dbo__Storico_Giacenze.codart) AND (Qry_01_calcolo_scorta_minima_calcolata.mm_fase = dbo__Storico_Giacenze.Fase)) INNER JOIN qry_media_esistenza ON (Qry_01_calcolo_scorta_minima_calcolata.mm_codart = qry_media_esistenza.codart) AND (Qry_01_calcolo_scorta_minima_calcolata.mm_fase = qry_media_esistenza.Fase)
WHERE (((dbo__Storico_Giacenze.codart)=Forms!frm_scmin_lista!mm_codart) And ((dbo__Storico_Giacenze.Fase)=Forms!frm_scmin_lista!mm_fase));
```

**`qry_grafico_scminstd old`** (SELECT)
```sql
SELECT dbo__Storico_Giacenze.dataelab AS data, qry_scmin_lista.mm_codart, qry_scmin_lista.mm_fase, dbo__Storico_Giacenze.Esistenza, First(Round([Esi_med])) AS Esistenza_Media, IIf(IsNull([scmin_std]) Or IsEmpty([scmin_std]),0,[scmin_std]) AS scmin, IIf(Round(([SommaDimm_quant]/Forms!frm_scmin_lista!gg_analisi)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))=0,1,Round(([SommaDimm_quant]/Forms!frm_scmin_lista!gg_analisi)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))) AS scmin_calc
FROM (qry_scmin_lista INNER JOIN dbo__Storico_Giacenze ON (qry_scmin_lista.mm_fase = dbo__Storico_Giacenze.Fase) AND (qry_scmin_lista.mm_codart = dbo__Storico_Giacenze.codart)) INNER JOIN qry_media_esistenza ON (dbo__Storico_Giacenze.Fase = qry_media_esistenza.Fase) AND (dbo__Storico_Giacenze.codart = qry_media_esistenza.codart)
GROUP BY dbo__Storico_Giacenze.dataelab, qry_scmin_lista.mm_codart, qry_scmin_lista.mm_fase, dbo__Storico_Giacenze.Esistenza, IIf(IsNull([scmin_std]) Or IsEmpty([scmin_std]),0,[scmin_std]), IIf(Round(([SommaDimm_quant]/Forms!frm_scmin_lista!gg_analisi)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))=0,1,Round(([SommaDimm_quant]/Forms!frm_scmin_lista!gg_analisi)*IIf([ar_ggriorC]=0,1,[ar_ggriorC])))
HAVING (((qry_scmin_lista.mm_codart)=Forms!frm_scmin_lista!mm_codart) And ((qry_scmin_lista.mm_fase)=Forms!frm_scmin_lista!mm_fase))
ORDER BY dbo__Storico_Giacenze.dataelab, qry_scmin_lista.mm_codart, qry_scmin_lista.mm_fase;
```

**`qry_hh_ggrior_scmin`** (SELECT)
```sql
SELECT dbo_HH_artfasi.HH_af_codart, dbo_HH_artfasi.HH_af_fase, dbo_HH_artfasi.HH_af_ggrior, dbo_listprod.lp_quant AS HH_lp_quant, dbo_listprod.lp_codlpro
FROM dbo_HH_artfasi INNER JOIN dbo_listprod ON (dbo_HH_artfasi.HH_af_fase = dbo_listprod.lp_fase) AND (dbo_HH_artfasi.HH_af_codart = dbo_listprod.lp_codart)
WHERE (((dbo_listprod.lp_codlpro)=1001))
ORDER BY dbo_HH_artfasi.HH_af_codart, dbo_HH_artfasi.HH_af_fase;
```

**`qry_magaz_storico`** (UNION)
```sql
SELECT dbo__Storico_Magazzino_2006.codart, dbo__Storico_Magazzino_2006.Fase, CDate(Left([dataelab],10)) AS data, dbo__Storico_Magazzino_2006.Esistenza, dbo__Storico_Magazzino_2006.Sett
FROM dbo__Storico_Magazzino_2006
WHERE (((dbo__Storico_Magazzino_2006.IDMaga) In (1,101,9999)))
ORDER BY dbo__Storico_Magazzino_2006.codart, dbo__Storico_Magazzino_2006.Fase, CDate(Left([dataelab],10))
UNION SELECT dbo__Storico_Magazzino_2007.codart, dbo__Storico_Magazzino_2007.Fase, CDate(Left([dataelab],10)) AS data, dbo__Storico_Magazzino_2007.Esistenza, dbo__Storico_Magazzino_2007.Sett
FROM dbo__Storico_Magazzino_2007
WHERE (((dbo__Storico_Magazzino_2007.IDMaga) In (1,101,9999)));
```

**`qry_media_esistenza`** (SELECT)
```sql
SELECT Avg(dbo__Storico_Giacenze.Esistenza) AS Esi_med, dbo__Storico_Giacenze.codart, dbo__Storico_Giacenze.Fase
FROM dbo__Storico_Giacenze
WHERE (((dbo__Storico_Giacenze.dataelab)>=Date()-par_ggAnalisi()))
GROUP BY dbo__Storico_Giacenze.codart, dbo__Storico_Giacenze.Fase
HAVING (((dbo__Storico_Giacenze.codart)=Forms!frm_scmin_lista!mm_codart) And ((dbo__Storico_Giacenze.Fase)=Forms!frm_scmin_lista!mm_fase));
```

**`qry_scarichi_qta`** (SELECT)
```sql
SELECT qry_scarichi_xx_mesi_var.mm_codart, qry_scarichi_xx_mesi_var.mm_fase, Sum(qry_scarichi_xx_mesi_var.mm_quant) AS SommaDimm_quant, IIf([ar_ggrior]>0,[ar_ggrior],IIf([hh_af_ggrior]>0,[hh_af_ggrior],0)) AS ar_ggriorC, IIf([ar_scomin]>0,[ar_scomin],IIf([hh_lp_quant]>0,[hh_lp_quant],0)) AS ar_scominC, artico.ar_polriord, artico.ar_gesfasi, artico.ar_ultfase, Avg(qry_scarichi_xx_mesi_var.mm_quant) AS Med_esi
FROM (qry_scarichi_xx_mesi_var INNER JOIN artico ON qry_scarichi_xx_mesi_var.mm_codart = artico.ar_codart) LEFT JOIN qry_hh_ggrior_scmin ON (qry_scarichi_xx_mesi_var.mm_fase = qry_hh_ggrior_scmin.HH_af_fase) AND (qry_scarichi_xx_mesi_var.mm_codart = qry_hh_ggrior_scmin.HH_af_codart)
GROUP BY qry_scarichi_xx_mesi_var.mm_codart, qry_scarichi_xx_mesi_var.mm_fase, IIf([ar_ggrior]>0,[ar_ggrior],IIf([hh_af_ggrior]>0,[hh_af_ggrior],0)), IIf([ar_scomin]>0,[ar_scomin],IIf([hh_lp_quant]>0,[hh_lp_quant],0)), artico.ar_polriord, artico.ar_gesfasi, artico.ar_ultfase
ORDER BY qry_scarichi_xx_mesi_var.mm_codart, qry_scarichi_xx_mesi_var.mm_fase;
```

**`qry_scarichi_xx_mesi`** (SELECT)
```sql
SELECT dbo_movmag.mm_tipork, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_keymag.km_aammgg, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_movmag.mm_quant, dbo_movmag.mm_valore
FROM dbo_movmag INNER JOIN dbo_keymag ON (dbo_movmag.codditt = dbo_keymag.codditt) AND (dbo_movmag.mm_tipork = dbo_keymag.km_tipork) AND (dbo_movmag.mm_anno = dbo_keymag.km_anno) AND (dbo_movmag.mm_serie = dbo_keymag.km_serie) AND (dbo_movmag.mm_numdoc = dbo_keymag.km_numdoc) AND (dbo_movmag.mm_riga = dbo_keymag.km_riga)
WHERE (((dbo_keymag.km_aammgg)>=Date()-180) AND ((dbo_movmag.mm_magaz) In (1,101,9999)) AND ((dbo_keymag.km_carscar)=-1) AND ((Val([mm_codart]))>0))
ORDER BY dbo_movmag.mm_tipork, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_keymag.km_aammgg;
```

**`qry_scarichi_xx_mesi_var`** (SELECT)
```sql
SELECT dbo_movmag.mm_codart, dbo_movmag.mm_fase, Sum(dbo_movmag.mm_quant) AS mm_quant
FROM dbo_movmag INNER JOIN dbo_keymag ON (dbo_movmag.mm_tipork = dbo_keymag.km_tipork) AND (dbo_movmag.mm_anno = dbo_keymag.km_anno) AND (dbo_movmag.mm_serie = dbo_keymag.km_serie) AND (dbo_movmag.mm_numdoc = dbo_keymag.km_numdoc) AND (dbo_movmag.mm_riga = dbo_keymag.km_riga)
WHERE (((dbo_keymag.km_aammgg)>=Date()-par_ggAnalisi()) AND ((dbo_movmag.mm_magaz) In (1,101,9999)) AND ((dbo_keymag.km_carscar)=-1))
GROUP BY dbo_movmag.mm_codart, dbo_movmag.mm_fase
ORDER BY dbo_movmag.mm_codart, dbo_movmag.mm_fase;
```

**`qry_scmin_art`** (SELECT)
```sql
SELECT qry_scarichi_qta.mm_codart, qry_scarichi_qta.mm_fase, ([SommaDimm_quant]) AS scarichi, ([SommaDimm_quant]/180) AS mediagg, IIf(Round(([SommaDimm_quant]/180)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))=0,1,Round(([SommaDimm_quant]/180)*IIf([ar_ggriorC]=0,1,[ar_ggriorC]))) AS scmin_calc, qry_scarichi_qta.ar_scominC, qry_scarichi_qta.ar_polriord, qry_scarichi_qta.ar_ggriorC, qry_scarichi_qta.ar_gesfasi, qry_scarichi_qta.ar_ultfase, Int([Med_esi]) AS Medesi_int
FROM qry_scarichi_qta;
```

**`qry_scmin_lista`** (SELECT)
```sql
SELECT qry_scarichi_xx_mesi_var.mm_codart, qry_scarichi_xx_mesi_var.mm_fase, qry_scarichi_xx_mesi_var.mm_quant AS SommaDimm_quant, IIf([ar_gesfasi]="N",[ar_ggrior],[hh_af_ggrior]) AS ar_ggriorC, IIf([ar_gesfasi]="N",artico.ar_scomin,qry_scmin_liste_prod.lp_quant) AS scmin_std, artico.ar_descr, artico.ar_codalt, artico.ar_gesfasi, artico.ar_polriord, artfasi.af_descr
FROM (dbo_HH_artfasi RIGHT JOIN ((artico INNER JOIN qry_scarichi_xx_mesi_var ON artico.ar_codart = qry_scarichi_xx_mesi_var.mm_codart) LEFT JOIN qry_scmin_liste_prod ON (qry_scarichi_xx_mesi_var.mm_codart = qry_scmin_liste_prod.lp_codart) AND (qry_scarichi_xx_mesi_var.mm_fase = qry_scmin_liste_prod.lp_fase)) ON (dbo_HH_artfasi.HH_af_fase = qry_scarichi_xx_mesi_var.mm_fase) AND (dbo_HH_artfasi.HH_af_codart = qry_scarichi_xx_mesi_var.mm_codart)) LEFT JOIN artfasi ON (qry_scarichi_xx_mesi_var.mm_codart = artfasi.af_codart) AND (qry_scarichi_xx_mesi_var.mm_fase = artfasi.af_fase)
WHERE (((artico.ar_polriord)="M"))
GROUP BY qry_scarichi_xx_mesi_var.mm_codart, qry_scarichi_xx_mesi_var.mm_fase, qry_scarichi_xx_mesi_var.mm_quant, IIf([ar_gesfasi]="N",[ar_ggrior],[hh_af_ggrior]), IIf([ar_gesfasi]="N",artico.ar_scomin,qry_scmin_liste_prod.lp_quant), artico.ar_descr, artico.ar_codalt, artico.ar_gesfasi, artico.ar_polriord, artfasi.af_descr
ORDER BY qry_scarichi_xx_mesi_var.mm_codart, qry_scarichi_xx_mesi_var.mm_fase;
```

**`qry_scmin_lista_Con_calcoli`** (SELECT)
```sql
SELECT qry_scmin_lista.mm_codart, qry_scmin_lista.mm_fase, qry_scmin_lista.ar_codalt, artico.ar_polriord, artico.ar_gesfasi, qry_scmin_lista.SommaDimm_quant, qry_scmin_lista.ar_ggriorC AS ar_ggrior, qry_scmin_lista.scmin_std, Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior]) AS scmin_calc, [scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior])) AS Delta, ([scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior])))/IIf([scmin_std]>0,[scmin_std],IIf([scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior]))<>0,[scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior])),1)) AS [Delta%], qry_scmin_lista.ar_descr, qry_scmin_lista.af_descr
FROM qry_scmin_lista INNER JOIN artico ON qry_scmin_lista.mm_codart = artico.ar_codart;
```

**`qry_scmin_lista_Con_calcoli1`** (SELECT)
```sql
SELECT qry_scmin_lista.mm_codart, qry_scmin_lista.mm_fase, qry_scmin_lista.ar_codalt, artico.ar_polriord, artico.ar_gesfasi, qry_scmin_lista.SommaDimm_quant, qry_scmin_lista.ar_ggriorC AS ar_ggrior, qry_scmin_lista.scmin_std, Round(([SommaDimm_quant]/Par_ggAnalisi())*IIf([ar_ggrior]>0,[ar_ggrior],0)) AS scmin_calc, IIf([scmin_std]>0 And [scmin_calc]>0,[scmin_std]-[scmin_calc],0) AS Delta, [delta]/IIf([scmin_calc]<>0,[scmin_calc],1) AS [Delta%], qry_scmin_lista.ar_descr, qry_scmin_lista.af_descr
FROM qry_scmin_lista INNER JOIN artico ON qry_scmin_lista.mm_codart = artico.ar_codart
WHERE (((artico.ar_gesfasi)="N"))
ORDER BY Round(Abs(([scmin_std]-Round(([SommaDimm_quant]/Par_ggAnalisi())*IIf([ar_ggrior]>0,[ar_ggrior],0)))/IIf(Round(([SommaDimm_quant]/Par_ggAnalisi())*IIf([ar_ggrior]>0,[ar_ggrior],0))<>0,Round(([SommaDimm_quant]/Par_ggAnalisi())*IIf([ar_ggrior]>0,[ar_ggrior],0)),1)),4) DESC;
```

**`qry_scmin_lista_con_colcoli0`** (SELECT)
```sql
SELECT qry_scmin_lista.mm_codart, qry_scmin_lista.mm_fase, qry_scmin_lista.ar_codalt, artico.ar_polriord, artico.ar_gesfasi, qry_scmin_lista.SommaDimm_quant, qry_scmin_lista.ar_ggriorC AS ar_ggrior, qry_scmin_lista.scmin_std, Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior]) AS scmin_calc, [scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior])) AS Delta, ([scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior])))/IIf([scmin_std]>0,[scmin_std],IIf([scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior]))<>0,[scmin_std]-(Round(([SommaDimm_quant]/Par_ggAnalisi())*[ar_ggrior])),1)) AS [Delta%], qry_scmin_lista.ar_descr, qry_scmin_lista.af_descr
FROM qry_scmin_lista INNER JOIN artico ON qry_scmin_lista.mm_codart = artico.ar_codart
WHERE (((artico.ar_gesfasi)="S"));
```

**`qry_scmin_liste_prod`** (SELECT)
```sql
SELECT dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_quant
FROM dbo_listprod
WHERE (((dbo_listprod.lp_codlpro)=1001))
GROUP BY dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_quant
ORDER BY dbo_listprod.lp_codart, dbo_listprod.lp_fase;
```

**`qry_scmin_lprod`** (SELECT)
```sql
SELECT qry_scarichi_qta.mm_codart, qry_scarichi_qta.mm_fase, qry_scarichi_qta.SommaDimm_quant AS scarichi, Round([SommaDimm_quant]/180) AS mediagg, dbo_listprod.lp_quant AS ar_scomin, IIf(Round(([SommaDimm_quant]/180)*IIf([ar_ggrior]=0,1,[ar_ggrior]))=0,1,Round(([SommaDimm_quant]/180)*IIf([ar_ggrior]=0,1,[ar_ggrior]))) AS scmin_calc, qry_scarichi_qta.ar_ggriorC AS ar_ggrior, qry_scarichi_qta.ar_polriord, qry_scarichi_qta.ar_polriord, qry_scarichi_qta.ar_gesfasi, qry_scarichi_qta.ar_ultfase, dbo_listprod.lp_codlpro
FROM qry_scarichi_qta INNER JOIN dbo_listprod ON (qry_scarichi_qta.mm_codart = dbo_listprod.lp_codart) AND (qry_scarichi_qta.mm_fase = dbo_listprod.lp_fase)
WHERE (((dbo_listprod.lp_codlpro)=1001));
```

**`qry_sel_ScMin_ScMin_calc`** (SELECT)
```sql
SELECT ScMin_ScMinCalc.mm_codart, ScMin_ScMinCalc.mm_fase, ScMin_ScMinCalc.scarichi, ScMin_ScMinCalc.mediagg, ScMin_ScMinCalc.scmin_calc, ScMin_ScMinCalc.ar_scomin, ScMin_ScMinCalc.ar_polriord, ScMin_ScMinCalc.ar_ggrior, ScMin_ScMinCalc.ar_gesfasi
FROM ScMin_ScMinCalc;
```

### CONSUMI

**`qry_sel_consumi`** (SELECT)
```sql
SELECT [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Codice_old AS Espr1, [dbo_View_32_Scarichi 2008].Articolo AS Espr2, [dbo_View_32_Scarichi 2008].UM, Sum([dbo_View_32_Scarichi 2008].Qt�) AS SommaDiQt�, Sum([dbo_View_32_Scarichi 2008].Valore) AS SommaDiValore
FROM [dbo_View_32_Scarichi 2008]
WHERE ((([dbo_View_32_Scarichi 2008].Codart)<>"EPAL" And ([dbo_View_32_Scarichi 2008].Codart)<>"D") And (([dbo_View_32_Scarichi 2008].Datadoc)>Date()-365))
GROUP BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Codice_old, [dbo_View_32_Scarichi 2008].Articolo, [dbo_View_32_Scarichi 2008].UM
ORDER BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase;
```

**`qry_sel_consumi_anno`** (SELECT)
```sql
SELECT [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].UM, Sum([dbo_View_32_Scarichi 2008].Qt�) AS SommaDiQt�, Sum([dbo_View_32_Scarichi 2008].Valore) AS SommaDiValore
FROM [dbo_View_32_Scarichi 2008]
GROUP BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].UM
ORDER BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno;
```

**`qry_sel_consumi_diba`** (SELECT)
```sql
SELECT movdis.md_coddb, movdis.md_riga, movdis.md_codfigli, movdis.md_fasefigli, dbo_artico.ar_codalt, dbo_artico.ar_descr, movdis.md_dtfival
FROM movdis INNER JOIN dbo_artico ON (movdis.codditt = dbo_artico.codditt) AND (movdis.md_codfigli = dbo_artico.ar_codart)
GROUP BY movdis.md_coddb, movdis.md_riga, movdis.md_codfigli, movdis.md_fasefigli, dbo_artico.ar_codalt, dbo_artico.ar_descr, movdis.md_dtfival
HAVING (((movdis.md_dtfival)>Date()))
ORDER BY movdis.md_coddb, movdis.md_riga;
```

**`qry_sel_consumi_mese`** (SELECT)
```sql
SELECT [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].Trim, [dbo_View_32_Scarichi 2008].Mese, [dbo_View_32_Scarichi 2008].UM, Sum([dbo_View_32_Scarichi 2008].Qt�) AS SommaDiQt�, Sum([dbo_View_32_Scarichi 2008].Valore) AS SommaDiValore
FROM [dbo_View_32_Scarichi 2008]
GROUP BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].Trim, [dbo_View_32_Scarichi 2008].Mese, [dbo_View_32_Scarichi 2008].UM
ORDER BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].Trim, [dbo_View_32_Scarichi 2008].Mese;
```

**`qry_sel_consumi_trim`** (SELECT)
```sql
SELECT [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].Trim, [dbo_View_32_Scarichi 2008].UM, Sum([dbo_View_32_Scarichi 2008].Qt�) AS SommaDiQt�, Sum([dbo_View_32_Scarichi 2008].Valore) AS SommaDiValore
FROM [dbo_View_32_Scarichi 2008]
GROUP BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].Trim, [dbo_View_32_Scarichi 2008].UM
ORDER BY [dbo_View_32_Scarichi 2008].Codart, [dbo_View_32_Scarichi 2008].Fase, [dbo_View_32_Scarichi 2008].Anno, [dbo_View_32_Scarichi 2008].Trim;
```

### TEMPI_LAVORAZIONE

**`01_Totale tempi per classe`** (SELECT)
```sql
SELECT [Classificazione articoli].Classe, classi.descrizione, Sum(Hour([RPrd_Tmptot])+Minute([RPrd_Tmptot])/60+Second([RPrd_Tmptot])/3600) AS Tempo, Sum(Rprod.RPrd_Pezzi) AS Pezzi
FROM Tprod INNER JOIN (classi INNER JOIN ([Classificazione articoli] INNER JOIN Rprod ON [Classificazione articoli].codart = Rprod.RPrd_PF) ON classi.classe = [Classificazione articoli].Classe) ON (Tprod.TPrd_num = Rprod.RPrd_num) AND (Tprod.TPrd_anno = Rprod.RPrd_anno)
WHERE (((Tprod.TPrd_data)>#1/1/2007#))
GROUP BY [Classificazione articoli].Classe, classi.descrizione;
```

**`Articoli con taglio non classificati`** (SELECT)
```sql
SELECT [Classificazione articoli].Tipologia, [Classificazione articoli].Articolo, [Classificazione articoli].codart, [Classificazione articoli].Classe
FROM [Classificazione articoli]
WHERE ((([Classificazione articoli].Classe) Is Null))
ORDER BY [Classificazione articoli].Tipologia;
```

**`qry_lista_mov`** (SELECT)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_anagra.an_descr1, dbo_testmag.tm_conto2, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, dbo_lavcent.lce_tempese, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese, dbo_cicli.dd_dtinval, dbo_cicli.dd_dtfival, dbo_movmag.mm_note
FROM ((((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2 = dbo_anagra.an_conto) ON (dbo_movmag.mm_numdoc = dbo_testmag.tm_numdoc) AND (dbo_movmag.mm_serie = dbo_testmag.tm_serie) AND (dbo_movmag.mm_anno = dbo_testmag.tm_anno) AND (dbo_movmag.mm_tipork = dbo_testmag.tm_tipork)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart = dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_riga = dbo_lavcent.lce_riga) AND (dbo_movmag.mm_numdoc = dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_serie = dbo_lavcent.lce_serie) AND (dbo_movmag.mm_anno = dbo_lavcent.lce_anno) AND (dbo_movmag.mm_tipork = dbo_lavcent.lce_tipork)) INNER JOIN dbo_cicli ON (dbo_lavcent.lce_codlavo = dbo_cicli.dd_codlavo) AND (dbo_movmag.mm_fase = dbo_cicli.dd_fase) AND (dbo_movmag.mm_codart = dbo_cicli.dd_coddb)) LEFT JOIN dbo_testord ON (dbo_movmag.mm_ornum = dbo_testord.td_numord) AND (dbo_movmag.mm_orserie = dbo_testord.td_serie) AND (dbo_movmag.mm_oranno = dbo_testord.td_anno) AND (dbo_movmag.mm_ortipo = dbo_testord.td_tipork)
WHERE (((dbo_cicli.dd_dtinval)<=[td_datord]) AND ((dbo_cicli.dd_dtfival)>=[td_datord]) AND ((dbo_movmag.mm_tipork)="T"))
ORDER BY dbo_anagra.an_descr1, dbo_movmag.mm_anno DESC , dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase;
```

**`qry_lista_mov_new_old_union`** (UNION)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_anagra.an_descr1 AS nome_terz, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, IIf([lce_qtaes]>0,[lce_tempese]/[lce_qtaes],0) AS tlav, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese
FROM (((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2=dbo_anagra.an_conto) ON (dbo_movmag.mm_tipork=dbo_testmag.tm_tipork) AND (dbo_movmag.mm_anno=dbo_testmag.tm_anno) AND (dbo_movmag.mm_serie=dbo_testmag.tm_serie) AND (dbo_movmag.mm_numdoc=dbo_testmag.tm_numdoc)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart=dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_tipork=dbo_lavcent.lce_tipork) AND (dbo_movmag.mm_anno=dbo_lavcent.lce_anno) AND (dbo_movmag.mm_serie=dbo_lavcent.lce_serie) AND (dbo_movmag.mm_numdoc=dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_riga=dbo_lavcent.lce_riga)) INNER JOIN dbo_cicli ON (dbo_movmag.mm_codart=dbo_cicli.dd_coddb) AND (dbo_movmag.mm_fase=dbo_cicli.dd_fase) AND (dbo_lavcent.lce_codlavo=dbo_cicli.dd_codlavo)
WHERE (((dbo_movmag.mm_codart)=getpar_codart()) AND ((dbo_movmag.mm_fase)=getpar_fase())  AND ((dbo_movmag.mm_tipork)="T") )
ORDER BY dbo_anagra.an_descr1, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase;
UNION SELECT [dbo__Controllo tempi old].Datadoc, [dbo__Controllo tempi old].Terzista AS nome_terz, [dbo__Controllo tempi old].Anno, [dbo__Controllo tempi old].Serie, [dbo__Controllo tempi old].Numdoc, [dbo__Controllo tempi old].Riga,  [dbo__Controllo tempi old].Codart, [dbo__Controllo tempi old].Fase, [dbo__Controllo tempi old].Cod_old, [dbo__Controllo tempi old].Descrizione, [dbo__Controllo tempi old].[TU eff] AS tlav, [dbo__Controllo tempi old].Qt�, [dbo__Controllo tempi old].[TU std] AS dd_tempese
FROM [dbo__Controllo tempi old]
WHERE ((([dbo__Controllo tempi old].Codart)=getpar_codart()));
```

**`qry_lista_mov_new_old_union_nozero`** (SELECT)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_anagra.an_descr1, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, IIf([lce_qtaes]>0,[lce_tempese]/[lce_qtaes],0) AS tlav, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese, dbo_movmag.mm_lotto, dbo_movmag.mm_note
FROM (((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2 = dbo_anagra.an_conto) ON (dbo_movmag.mm_tipork = dbo_testmag.tm_tipork) AND (dbo_movmag.mm_anno = dbo_testmag.tm_anno) AND (dbo_movmag.mm_serie = dbo_testmag.tm_serie) AND (dbo_movmag.mm_numdoc = dbo_testmag.tm_numdoc)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart = dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_tipork = dbo_lavcent.lce_tipork) AND (dbo_movmag.mm_anno = dbo_lavcent.lce_anno) AND (dbo_movmag.mm_serie = dbo_lavcent.lce_serie) AND (dbo_movmag.mm_numdoc = dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_riga = dbo_lavcent.lce_riga)) INNER JOIN dbo_cicli ON (dbo_movmag.mm_codart = dbo_cicli.dd_coddb) AND (dbo_movmag.mm_fase = dbo_cicli.dd_fase) AND (dbo_lavcent.lce_codlavo = dbo_cicli.dd_codlavo)
WHERE (((dbo_testmag.tm_datdoc)<=Date()) AND ((IIf([lce_qtaes]>0,[lce_tempese]/[lce_qtaes],0))>0) AND ((dbo_cicli.dd_tempese)>0) AND ((dbo_movmag.mm_tipork)="T") AND ((dbo_cicli.dd_dtfival)>=Date()))
ORDER BY dbo_anagra.an_descr1, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase;
```

**`qry_lista_mov_new_old_union_nozero_old`** (UNION)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_anagra.an_descr1, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, IIf([lce_qtaes]>0,[lce_tempese]/[lce_qtaes],0) AS tlav, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese,mm_lotto,dbo_movmag.mm_note
FROM (((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2=dbo_anagra.an_conto) ON (dbo_movmag.mm_tipork=dbo_testmag.tm_tipork) AND (dbo_movmag.mm_anno=dbo_testmag.tm_anno) AND (dbo_movmag.mm_serie=dbo_testmag.tm_serie) AND (dbo_movmag.mm_numdoc=dbo_testmag.tm_numdoc)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart=dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_tipork=dbo_lavcent.lce_tipork) AND (dbo_movmag.mm_anno=dbo_lavcent.lce_anno) AND (dbo_movmag.mm_serie=dbo_lavcent.lce_serie) AND (dbo_movmag.mm_numdoc=dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_riga=dbo_lavcent.lce_riga)) INNER JOIN dbo_cicli ON (dbo_movmag.mm_codart=dbo_cicli.dd_coddb) AND (dbo_movmag.mm_fase=dbo_cicli.dd_fase) AND (dbo_lavcent.lce_codlavo=dbo_cicli.dd_codlavo)
WHERE ((( dbo_testmag.tm_datdoc)<=date()) AND ((IIf([lce_qtaes]>0,[lce_tempese]/[lce_qtaes],0))>0) AND ((dbo_cicli.dd_tempese)>0) AND ((dbo_movmag.mm_tipork)="T"))
ORDER BY dbo_anagra.an_descr1, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase
UNION SELECT [dbo__Controllo tempi old].Datadoc, [dbo__Controllo tempi old].Anno, [dbo__Controllo tempi old].Serie, [dbo__Controllo tempi old].Numdoc, [dbo__Controllo tempi old].Riga, [dbo__Controllo tempi old].Terzista, [dbo__Controllo tempi old].Codart, [dbo__Controllo tempi old].Fase, [dbo__Controllo tempi old].Cod_old, [dbo__Controllo tempi old].Descrizione, [dbo__Controllo tempi old].[TU eff] AS tlav, [dbo__Controllo tempi old].Qt�, [dbo__Controllo tempi old].[TU std] AS dd_tempese, [dbo__Controllo tempi old].[TU std] AS lotto,[dbo__Controllo tempi old].[note] AS note_a
FROM [dbo__Controllo tempi old]
WHERE ((([dbo__Controllo tempi old].[TU eff])>0) and ([dbo__controllo tempi old].[datadoc]<= date()));
```

**`qry_lista_mov_old`** (SELECT)
```sql
SELECT [dbo__Controllo tempi old].Datadoc, [dbo__Controllo tempi old].Anno, [dbo__Controllo tempi old].Serie, [dbo__Controllo tempi old].Numdoc, [dbo__Controllo tempi old].Riga, [dbo__Controllo tempi old].Terzista, [dbo__Controllo tempi old].Codart, [dbo__Controllo tempi old].Fase, [dbo__Controllo tempi old].Cod_old, [dbo__Controllo tempi old].Descrizione, [dbo__Controllo tempi old].[Tempo eff], [dbo__Controllo tempi old].Qt�, [dbo__Controllo tempi old].[TU std]
FROM [dbo__Controllo tempi old];
```

**`qry_lista_mov_old_union`** (SELECT)
```sql
SELECT [dbo__Controllo tempi old].Datadoc, [dbo__Controllo tempi old].Terzista AS nome_terz, [dbo__Controllo tempi old].Anno, [dbo__Controllo tempi old].Serie, [dbo__Controllo tempi old].Numdoc, [dbo__Controllo tempi old].Riga, [dbo__Controllo tempi old].Codart, [dbo__Controllo tempi old].Fase, [dbo__Controllo tempi old].Cod_old, [dbo__Controllo tempi old].Descrizione, [dbo__Controllo tempi old].[TU eff] AS tlav, [dbo__Controllo tempi old].Qt�, [dbo__Controllo tempi old].[TU std] AS dd_tempese
FROM [dbo__Controllo tempi old]
WHERE ((([dbo__Controllo tempi old].Codart)=getpar_codart()))
ORDER BY [dbo__Controllo tempi old].Datadoc, [dbo__Controllo tempi old].Terzista, [dbo__Controllo tempi old].Anno, [dbo__Controllo tempi old].Serie, [dbo__Controllo tempi old].Numdoc, [dbo__Controllo tempi old].Riga;
```

**`qry_lista_mov_union`** (SELECT)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_anagra.an_descr1 AS nome_terz, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, IIf([lce_qtaes]>0,[lce_tempese]/[lce_qtaes],0) AS tlav, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese
FROM (((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2 = dbo_anagra.an_conto) ON (dbo_movmag.mm_numdoc = dbo_testmag.tm_numdoc) AND (dbo_movmag.mm_serie = dbo_testmag.tm_serie) AND (dbo_movmag.mm_anno = dbo_testmag.tm_anno) AND (dbo_movmag.mm_tipork = dbo_testmag.tm_tipork)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart = dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_riga = dbo_lavcent.lce_riga) AND (dbo_movmag.mm_numdoc = dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_serie = dbo_lavcent.lce_serie) AND (dbo_movmag.mm_anno = dbo_lavcent.lce_anno) AND (dbo_movmag.mm_tipork = dbo_lavcent.lce_tipork)) INNER JOIN dbo_cicli ON (dbo_lavcent.lce_codlavo = dbo_cicli.dd_codlavo) AND (dbo_movmag.mm_fase = dbo_cicli.dd_fase) AND (dbo_movmag.mm_codart = dbo_cicli.dd_coddb)
WHERE (((dbo_movmag.mm_codart)=getpar_codart()) AND ((dbo_movmag.mm_fase)=getpar_fase()) AND ((dbo_movmag.mm_tipork)="T"))
ORDER BY dbo_anagra.an_descr1, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase;
```

**`qry_minmaxstd`** (SELECT)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_anagra.an_descr1, dbo_testmag.tm_conto2, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, dbo_lavcent.lce_tempese, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese, dbo_cicli.dd_dtinval, dbo_cicli.dd_dtfival, dbo_movmag.mm_note
FROM ((((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2 = dbo_anagra.an_conto) ON (dbo_movmag.mm_numdoc = dbo_testmag.tm_numdoc) AND (dbo_movmag.mm_serie = dbo_testmag.tm_serie) AND (dbo_movmag.mm_anno = dbo_testmag.tm_anno) AND (dbo_movmag.mm_tipork = dbo_testmag.tm_tipork)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart = dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_riga = dbo_lavcent.lce_riga) AND (dbo_movmag.mm_numdoc = dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_serie = dbo_lavcent.lce_serie) AND (dbo_movmag.mm_anno = dbo_lavcent.lce_anno) AND (dbo_movmag.mm_tipork = dbo_lavcent.lce_tipork)) INNER JOIN dbo_cicli ON (dbo_lavcent.lce_codlavo = dbo_cicli.dd_codlavo) AND (dbo_movmag.mm_fase = dbo_cicli.dd_fase) AND (dbo_movmag.mm_codart = dbo_cicli.dd_coddb)) LEFT JOIN dbo_testord ON (dbo_movmag.mm_ornum = dbo_testord.td_numord) AND (dbo_movmag.mm_orserie = dbo_testord.td_serie) AND (dbo_movmag.mm_oranno = dbo_testord.td_anno) AND (dbo_movmag.mm_ortipo = dbo_testord.td_tipork)
WHERE (((dbo_cicli.dd_dtinval)<=[td_datord]) AND ((dbo_cicli.dd_dtfival)>=[td_datord]) AND ((dbo_movmag.mm_tipork)="T"))
ORDER BY dbo_anagra.an_descr1, dbo_movmag.mm_anno DESC , dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_movmag.mm_codart, dbo_movmag.mm_fase;
```

**`qry_nrec_min_max_media`** (SELECT)
```sql
SELECT Count(*) AS nrec, Min([tlav]) AS min_tlav, Max([tlav]) AS max_tlav, Sum([tlav]) AS t_tlav, Avg([tlav]) AS media, Sum([lce_qtaes]) AS t_qta, Min([lce_qtaes]) AS min_qta, Max([lce_qtaes]) AS max_qta, DVarP("tlav","qry_lista_mov_new_old_union_nozero") AS Var, DStDevP("tlav","qry_lista_mov_new_old_union_nozero") AS Dev
FROM qry_lista_mov_new_old_union_nozero;
```

**`qry_nrec_min_max_media1`** (SELECT)
```sql
SELECT Count(*) AS nrec, Min([tlav]) AS min_tlav, Max([tlav]) AS max_tlav, Sum([tlav]) AS t_tlav, Avg([tlav]) AS media, Sum([lce_qtaes]) AS t_qta, Min([lce_qtaes]) AS min_qta, Max([lce_qtaes]) AS max_qta, DVarP("tlav","qry_lista_mov_new_old_union_nozero") AS Var, DStDevP("tlav","qry_lista_mov_new_old_union_nozero") AS Dev
FROM qry_lista_mov_new_old_union_nozero;
```

**`qry_TempiTaglio`** (SELECT)
```sql
SELECT [Classificazione articoli].Classe, classi.descrizione, Rprod.RPrd_anno, Rprod.RPrd_num, Rprod.RPrd_riga, Rprod.RPrd_riford_anno, Rprod.RPPd_riford_serie, Rprod.RPrd_riford_num, Rprod.RPrd_riford_riga, Rprod.RPrd_PF, Rprod.RPrd_Lotto, Rprod.RPrd_MP, Rprod.RPrd_Classe, Rprod.RPrd_UmStesa, Rprod.RPrd_Stesa, Rprod.RPrd_UmStrati, Rprod.RPrd_Strati, Rprod.RPrd_Pezzi, Rprod.Rprd_TmpPMP, Rprod.RPrd_TmpStesa, Rprod.RPrd_TmpDisegno, Rprod.RPrd_TmpTaglio, Rprod.RPrd_TmpConf, Rprod.RPrd_Tmptot, Rprod.RPrd_Note, artfasi.af_fase, artfasi.af_descr, artico.ar_codalt, artico.ar_descr, (Hour([rprd_tmptot])+(((Minute([rprd_tmptot])*60)+Second([rprd_tmptot]))/3600))/[RPrd_Pezzi] AS tlav
FROM (((Rprod LEFT JOIN [Classificazione articoli] ON Rprod.RPrd_PF = [Classificazione articoli].codart) INNER JOIN artfasi ON Rprod.RPrd_PF = artfasi.af_codart) LEFT JOIN classi ON [Classificazione articoli].Classe = classi.classe) INNER JOIN artico ON artfasi.af_codart = artico.ar_codart
WHERE (((artfasi.af_fase)=10))
ORDER BY [Classificazione articoli].Classe, Rprod.RPrd_anno, Rprod.RPrd_num, Rprod.RPrd_riga, Rprod.RPrd_riford_anno;
```

**`qry_union_new_old`** (UNION)
```sql
SELECT dbo_testmag.tm_datdoc, dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga, dbo_anagra.an_descr1, dbo_movmag.mm_codart, dbo_movmag.mm_fase, dbo_artico.ar_codalt, dbo_artico.ar_descr, dbo_lavcent.lce_tempese, dbo_lavcent.lce_qtaes, dbo_cicli.dd_tempese
FROM (((dbo_movmag INNER JOIN (dbo_testmag INNER JOIN dbo_anagra ON dbo_testmag.tm_conto2=dbo_anagra.an_conto) ON (dbo_movmag.mm_tipork=dbo_testmag.tm_tipork) AND (dbo_movmag.mm_anno=dbo_testmag.tm_anno) AND (dbo_movmag.mm_serie=dbo_testmag.tm_serie) AND (dbo_movmag.mm_numdoc=dbo_testmag.tm_numdoc)) INNER JOIN dbo_artico ON dbo_movmag.mm_codart=dbo_artico.ar_codart) INNER JOIN dbo_lavcent ON (dbo_movmag.mm_tipork=dbo_lavcent.lce_tipork) AND (dbo_movmag.mm_anno=dbo_lavcent.lce_anno) AND (dbo_movmag.mm_serie=dbo_lavcent.lce_serie) AND (dbo_movmag.mm_numdoc=dbo_lavcent.lce_numdoc) AND (dbo_movmag.mm_riga=dbo_lavcent.lce_riga)) INNER JOIN dbo_cicli ON (dbo_movmag.mm_codart=dbo_cicli.dd_coddb) AND (dbo_movmag.mm_fase=dbo_cicli.dd_fase) AND (dbo_lavcent.lce_codlavo=dbo_cicli.dd_codlavo)
WHERE (((dbo_movmag.mm_fase)=[Forms]![frm_lista_mov]![mm_fase]) AND ((dbo_movmag.mm_tipork)="T"))
ORDER BY dbo_movmag.mm_anno, dbo_movmag.mm_serie, dbo_movmag.mm_numdoc, dbo_movmag.mm_riga;
UNION SELECT [dbo__Controllo tempi old].Datadoc, [dbo__Controllo tempi old].Anno, [dbo__Controllo tempi old].Serie, [dbo__Controllo tempi old].Numdoc, [dbo__Controllo tempi old].Riga, [dbo__Controllo tempi old].Terzista, [dbo__Controllo tempi old].Codart, [dbo__Controllo tempi old].Fase, [dbo__Controllo tempi old].Cod_old, [dbo__Controllo tempi old].Descrizione, [dbo__Controllo tempi old].[Tempo eff], [dbo__Controllo tempi old].Qt�, [dbo__Controllo tempi old].[TU std]
FROM [dbo__Controllo tempi old];
```

**`Query_ATTRIBUZIONE TEMPI STD TAGLIO A CICLI`** (SELECT)
```sql
SELECT dbo_cicli.dd_coddb, [_tempi ciclo per taglio].codart, dbo_cicli.dd_tempese, [_tempi ciclo per taglio].TU, dbo_cicli.dd_codlavo, dbo_cicli.dd_codcent, dbo_artico.ar_critico, dbo_tabcent.tb_descent, dbo_tablavo.tb_deslavo AS Espr1
FROM dbo_tablavo, (dbo_artico INNER JOIN (dbo_cicli INNER JOIN [_tempi ciclo per taglio] ON dbo_cicli.dd_coddb = [_tempi ciclo per taglio].codart) ON dbo_artico.ar_codart = dbo_cicli.dd_coddb) INNER JOIN dbo_tabcent ON dbo_cicli.dd_codcent = dbo_tabcent.tb_codcent
WHERE (((dbo_cicli.dd_tempese)=0) AND ((dbo_cicli.dd_codcent)=1) AND ((dbo_artico.ar_critico)="s") AND ((dbo_cicli.dd_dtfival)>Date()));
```

**`query_crea_tab15`** (APPEND)
```sql
INSERT INTO Tab_15 ( mm_codart, mm_fase, tm_datdoc, an_descr1, mm_anno, mm_serie, mm_numdoc, mm_riga, ar_codalt, ar_descr, tlav, lce_qtaes, dd_tempese, mm_note )
SELECT qry_lista_mov_new_old_union_nozero.mm_codart, qry_lista_mov_new_old_union_nozero.mm_fase, qry_lista_mov_new_old_union_nozero.tm_datdoc, qry_lista_mov_new_old_union_nozero.an_descr1, qry_lista_mov_new_old_union_nozero.mm_anno, qry_lista_mov_new_old_union_nozero.mm_serie, qry_lista_mov_new_old_union_nozero.mm_numdoc, qry_lista_mov_new_old_union_nozero.mm_riga, qry_lista_mov_new_old_union_nozero.ar_codalt, qry_lista_mov_new_old_union_nozero.ar_descr, qry_lista_mov_new_old_union_nozero.tlav, qry_lista_mov_new_old_union_nozero.lce_qtaes, qry_lista_mov_new_old_union_nozero.dd_tempese, qry_lista_mov_new_old_union_nozero.mm_note
FROM qry_lista_mov_new_old_union_nozero
WHERE (((qry_lista_mov_new_old_union_nozero.tm_datdoc)>=[Maschere]![frm_lista_mov_art_fase]![data_da]) AND (([Maschere]![frm_lista_mov_art_fase]![data_da])<=[Maschere]![frm_lista_mov_art_fase]![Data_A]))
ORDER BY qry_lista_mov_new_old_union_nozero.mm_codart, qry_lista_mov_new_old_union_nozero.mm_fase, qry_lista_mov_new_old_union_nozero.tm_datdoc;
```

**`query_crea_tab15_artfase`** (APPEND)
```sql
INSERT INTO Tab_15_Tot ( mm_codart, mm_fase, nrec, Tempo_std, min_tlav, max_tlav, Media_pond, devstd, lotto_min, lotto_max, Lotto_medio )
SELECT Tab_15.mm_codart, Tab_15.mm_fase, tab_15_tmp.nrec, [dd_tempese]*1 AS Tempo_std, Min(Tab_15.tlav) AS min_tlav, Max(Tab_15.tlav) AS max_tlav, Sum([TLAV]*[LCE_QTAES])/Sum([LCE_QTAES]) AS Media_pond, Sqr(Sum(([tlav]-[tmp])^2)/[nrec]) AS devstd, Min(Tab_15.lce_qtaes) AS lotto_min, Max(Tab_15.lce_qtaes) AS lotto_max, Avg(Tab_15.lce_qtaes) AS Lotto_medio
FROM Tab_15 INNER JOIN tab_15_tmp ON (Tab_15.mm_codart = tab_15_tmp.mm_codart) AND (Tab_15.mm_fase = tab_15_tmp.mm_fase)
GROUP BY Tab_15.mm_codart, Tab_15.mm_fase, tab_15_tmp.nrec, [dd_tempese]*1
ORDER BY Tab_15.mm_codart, Tab_15.mm_fase;
```

**`query_crea_tab15_artfase_com`** (APPEND)
```sql
INSERT INTO Tab_15_Tot_com ( mm_codart, mm_fase, an_descr1, nrec, Tempo_std, min_tlav, max_tlav, Media_pond, devstd, lotto_min, lotto_max, Lotto_medio )
SELECT Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.an_descr1, tab_15_tmp_com.nrec, [dd_tempese]*1 AS Tempo_std, Min(Tab_15.tlav) AS min_tlav, Max(Tab_15.tlav) AS max_tlav, Sum([TLAV]*[LCE_QTAES])/Sum([LCE_QTAES]) AS Media_pond, Sqr(Sum(([tlav]-[tmp])^2)/[nrec]) AS devstd, Min(Tab_15.lce_qtaes) AS lotto_min, Max(Tab_15.lce_qtaes) AS lotto_max, Avg(Tab_15.lce_qtaes) AS Lotto_medio
FROM Tab_15 INNER JOIN tab_15_tmp_com ON (Tab_15.mm_fase = tab_15_tmp_com.mm_fase) AND (Tab_15.an_descr1 = tab_15_tmp_com.an_descr1) AND (Tab_15.mm_codart = tab_15_tmp_com.mm_codart)
GROUP BY Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.an_descr1, tab_15_tmp_com.nrec, [dd_tempese]*1
ORDER BY Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.an_descr1;
```

**`query_crea_tab15_tmp`** (APPEND)
```sql
INSERT INTO tab_15_tmp ( mm_codart, mm_fase, tmp, nrec )
SELECT Tab_15.mm_codart, Tab_15.mm_fase, Sum([TLAV]*[LCE_QTAES])/Sum([LCE_QTAES]) AS tmp, Count(*) AS nrec
FROM Tab_15
GROUP BY Tab_15.mm_codart, Tab_15.mm_fase
ORDER BY Tab_15.mm_codart, Tab_15.mm_fase;
```

**`query_crea_tab15_tmp_com`** (APPEND)
```sql
INSERT INTO tab_15_tmp_com ( mm_codart, mm_fase, an_descr1, tmp, nrec )
SELECT Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.an_descr1, Sum([TLAV]*[LCE_QTAES])/Sum([LCE_QTAES]) AS tmp, Count(*) AS nrec
FROM Tab_15
GROUP BY Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.an_descr1
ORDER BY Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.an_descr1;
```

**`query_crea_tab15_tot`** (MAKE TABLE)
```sql
SELECT Count(*) AS nrec, Min([tlav]) AS min_tlav, Max([tlav]) AS max_tlav, Sum([tlav]) AS t_tlav, Avg([tlav]) AS media, Sum([lce_qtaes]) AS t_qta, Min([lce_qtaes]) AS min_qta, Max([lce_qtaes]) AS max_qta, DVarP("tlav","TAB_15") AS Var, DStDevP("tlav","TAB_15") AS Dev INTO Tab_15_Tot
FROM Tab_15;
```

**`Query_Crezione tabella tempi per taglio`** (MAKE TABLE)
```sql
SELECT [Classificazione articoli].codart, [02_TU per classe].Classe, [02_TU per classe].TU INTO [tempi ciclo per taglio]
FROM [02_TU per classe] INNER JOIN [Classificazione articoli] ON [02_TU per classe].Classe = [Classificazione articoli].Classe
ORDER BY [Classificazione articoli].codart;
```

**`query_del_tab15`** (DELETE)
```sql
DELETE Tab_15.*
FROM Tab_15;
```

**`query_del_tab15_tmp`** (DELETE)
```sql
DELETE tab_15_tmp.*
FROM tab_15_tmp;
```

**`query_del_tab15_tmp_com`** (DELETE)
```sql
DELETE tab_15_tmp_com.*
FROM tab_15_tmp_com;
```

**`query_del_tab15_tot`** (DELETE)
```sql
DELETE Tab_15_Tot.*
FROM Tab_15_Tot;
```

**`query_del_tab15_tot_com`** (DELETE)
```sql
DELETE Tab_15_Tot_Com.*
FROM Tab_15_Tot_Com;
```

**`query_sel_tab15_artfase`** (SELECT)
```sql
SELECT Tab_15.mm_codart, Tab_15.mm_fase, tab_15_tmp.nrec, Min(Tab_15.tlav) AS min_tlav, Max(Tab_15.tlav) AS max_tlav, Sum([TLAV]*[LCE_QTAES])/Sum([LCE_QTAES]) AS Media_pond, Sqr(Sum(([tlav]-[tmp])^2)/[nrec]) AS devstd, Min(Tab_15.lce_qtaes) AS lotto_min, Max(Tab_15.lce_qtaes) AS lotto_max, Avg(Tab_15.lce_qtaes) AS Lotto_medio, [dd_tempese]*1 AS Tempo_std
FROM Tab_15 INNER JOIN tab_15_tmp ON (Tab_15.mm_codart = tab_15_tmp.mm_codart) AND (Tab_15.mm_fase = tab_15_tmp.mm_fase)
GROUP BY Tab_15.mm_codart, Tab_15.mm_fase, tab_15_tmp.nrec, [dd_tempese]*1
ORDER BY Tab_15.mm_codart, Tab_15.mm_fase;
```

**`query_tab15_rag`** (SELECT)
```sql
SELECT Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.dd_tempese, Tab_15.lce_qtaes
FROM Tab_15
GROUP BY Tab_15.mm_codart, Tab_15.mm_fase, Tab_15.dd_tempese, Tab_15.lce_qtaes;
```

### DISTINTE_BASE

**`qry_listprod`** (SELECT)
```sql
SELECT dbo_listprod.lp_codlpro, dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_quant
FROM dbo_listprod
WHERE (((dbo_listprod.lp_codlpro)=[numero]) AND ((dbo_listprod.lp_codart)=[codart]) AND ((dbo_listprod.lp_fase)=[fase]));
```

**`QryImpiego`** (SELECT)
```sql
SELECT dbo_movdis.md_coddb, dbo_artico_1.ar_descr, dbo_artico_1.ar_codalt
FROM ((dbo_movdis LEFT JOIN dbo_artfasi ON (dbo_movdis.md_fasefigli = dbo_artfasi.af_fase) AND (dbo_movdis.md_codfigli = dbo_artfasi.af_codart)) INNER JOIN dbo_artico ON dbo_movdis.md_codfigli = dbo_artico.ar_codart) INNER JOIN dbo_artico AS dbo_artico_1 ON dbo_movdis.md_coddb = dbo_artico_1.ar_codart
WHERE (((dbo_movdis.md_codfigli) In ("0010157","0060440","0060443")) AND ((dbo_artico_1.ar_gruppo)=15))
ORDER BY dbo_movdis.md_coddb;
```

**`qrylistprod`** (SELECT)
```sql
SELECT dbo_listprod.lp_codart, dbo_listprod.lp_quant, dbo_listprod.lp_fase, dbo_listprod.lp_codlpro
FROM dbo_listprod
WHERE (((dbo_listprod.lp_codart)=[my_codart]) AND ((dbo_listprod.lp_fase)=[my_fase]) AND ((dbo_listprod.lp_codlpro)=1001));
```

**`QryNumImp`** (SELECT)
```sql
SELECT Count(QryImpiego.md_coddb) AS Num_Cmp, First(QryImpiego.md_coddb) AS Cod_Prod, QryImpiego.dbo_artico_1.ar_codalt AS ArtAlt, QryImpiego.dbo_artico_1.ar_descr AS Descrizione
FROM QryImpiego
GROUP BY QryImpiego.dbo_artico_1.ar_codalt, QryImpiego.dbo_artico_1.ar_descr, QryImpiego.md_coddb
HAVING (((Count(QryImpiego.md_coddb))>1))
ORDER BY Count(QryImpiego.md_coddb) DESC , First(QryImpiego.md_coddb);
```

**`qryproartdb`** (SELECT)
```sql
SELECT dbo_artpro.ap_codart, dbo_artpro.ap_magaz, dbo_artpro.ap_fase, dbo_artpro.ap_esist, dbo_artpro.ap_prenot, dbo_artpro.ap_ordin, dbo_artpro.ap_impeg, artico.ar_codalt, artico.ar_descr
FROM dbo_artpro INNER JOIN artico ON dbo_artpro.ap_codart = artico.ar_codart
WHERE (((dbo_artpro.ap_codart)=[codart]) AND ((dbo_artpro.ap_magaz)=[codmag]) AND ((dbo_artpro.ap_fase)=[codfase]))
ORDER BY dbo_artpro.ap_codart, dbo_artpro.ap_magaz, dbo_artpro.ap_fase;
```

**`qryprogart`** (SELECT)
```sql
SELECT dbo_artpro.ap_codart, dbo_artpro.ap_magaz, dbo_artpro.ap_fase, qryordlist.MinDiol_datcons, dbo_artpro.ap_esist, dbo_artpro.ap_prenot, dbo_artpro.ap_ordin, dbo_artpro.ap_impeg, qryordlist.opc, qryordlist.op, qryordlist.ipc, qryordlist.ip, artico.ar_codalt, artico.ar_descr, artico.ar_unmis, artico.ar_scomin, artico.ar_scomax, artico.ar_minord, artico.ar_polriord, artico.ar_sublotto
FROM (dbo_artpro LEFT JOIN qryordlist ON (dbo_artpro.ap_fase = qryordlist.ol_fase) AND (dbo_artpro.ap_magaz = qryordlist.ol_magaz) AND (dbo_artpro.ap_codart = qryordlist.ol_codart)) LEFT JOIN artico ON dbo_artpro.ap_codart = artico.ar_codart
WHERE (((dbo_artpro.ap_codart)=[codart]))
ORDER BY dbo_artpro.ap_codart, dbo_artpro.ap_magaz, dbo_artpro.ap_fase, qryordlist.MinDiol_datcons;
```

### ORDINI_PRODUZIONE

**`LimitEnterEditProductList`** (SELECT)
```sql
SELECT artico.ar_codalt AS Espr1, artico.ar_descr AS Espr2, artico.ar_codart AS Espr3
FROM artico
WHERE (((artico.ar_coddb)<>"empty"))
ORDER BY artico.ar_codalt;
```

**`LimitProductList`** (SELECT)
```sql
SELECT artico.ar_codart AS Cod_Art, artico.ar_descr AS Descr_Art, artico.ar_codalt AS Cod_Art_Alt, artico.ar_ultfase AS Fase, artico.ar_sostituito, artico.ar_critico, artico.ar_blocco
FROM artico
WHERE (((artico.ar_blocco)<>"S"))
ORDER BY artico.ar_codart;
```

**`LimitProductList_PFDBFS`** (SELECT)
```sql
SELECT artico.ar_codart AS Cod_Art, artico.ar_descr AS Descr_Art, artico.ar_codalt AS Cod_Art_Alt, artico.ar_ultfase AS Fase
FROM artico
WHERE (((artico.ar_coddb)<>"empty") AND ((artico.ar_gesfasi)="S"))
ORDER BY artico.ar_codart;
```

**`Q_schede_prod`** (SELECT)
```sql
SELECT dbo_allole.ao_tipo, dbo_allole.ao_codice, dbo_allole.ao_tipodoc, dbo_allole.ao_annodoc, dbo_allole.ao_seriedoc, dbo_allole.ao_numdoc, dbo_allole.ao_argom, dbo_allole.ao_nomedoc
FROM dbo_allole;
```

**`qry_AGG_P_ORDLIST`** (APPEND)
```sql
INSERT INTO P_ORDLIST ( ol_codart, ol_magaz, ol_fase, ol_tipork, cb_modesrk, MinDiol_datcons, SommaDiol_quant, ol_stasino, ol_stato, opc, op, ipc, ip, tb_applotti, tb_appscmin )
SELECT ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_tipork, dbo___MOTIPORK.cb_modesrk, Min(ordlist.ol_datcons) AS MinDiol_datcons, Sum(ordlist.ol_quant) AS SommaDiol_quant, ordlist.ol_stasino, ordlist.ol_stato, Sum(IIf((([ol_tipork]="H") Or ([ol_tipork]="O")) And ([ol_stato]="S"),[ol_quant],0)) AS opc, Sum(IIf((([ol_tipork]="H") Or ([ol_tipork]="O")) And ([ol_stato]<>"S"),[ol_quant],0)) AS op, Sum(IIf(([ol_tipork]="Y") And ([ol_stato]="S"),[ol_quant],0)) AS ipc, Sum(IIf(([ol_tipork]="Y") And ([ol_stato]<>"S"),[ol_quant],0)) AS ip, tabmaga.tb_applotti, tabmaga.tb_appscmin
FROM (ordlist INNER JOIN dbo___MOTIPORK ON ordlist.ol_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN tabmaga ON ordlist.ol_magaz = tabmaga.tb_codmaga
GROUP BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_tipork, dbo___MOTIPORK.cb_modesrk, ordlist.ol_stasino, ordlist.ol_stato, tabmaga.tb_applotti, tabmaga.tb_appscmin
HAVING (((ordlist.ol_tipork)="H" Or (ordlist.ol_tipork)="O" Or (ordlist.ol_tipork)="Y"))
ORDER BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, Min(ordlist.ol_datcons);
```

**`qry_Del_P_ORDLIST`** (DELETE)
```sql
DELETE P_ORDLIST.*
FROM P_ORDLIST;
```

**`qry_frmTprod`** (SELECT)
```sql
SELECT dbo_testord.td_tipork, dbo_testord.td_anno, dbo_testord.td_serie, dbo_testord.td_numord, dbo_movord.mo_codart, dbo_movord.mo_riga, dbo_movord.mo_quant, dbo_movord_1.mo_codart, dbo_movord.mo_lotto
FROM (dbo_testord INNER JOIN dbo_movord ON (dbo_testord.td_numord = dbo_movord.mo_numord) AND (dbo_testord.td_serie = dbo_movord.mo_serie) AND (dbo_testord.td_anno = dbo_movord.mo_anno) AND (dbo_testord.td_tipork = dbo_movord.mo_tipork)) INNER JOIN dbo_movord AS dbo_movord_1 ON (dbo_movord.mo_riga = dbo_movord_1.mo_rigaor) AND (dbo_movord.mo_numord = dbo_movord_1.mo_numordor) AND (dbo_movord.mo_serie = dbo_movord_1.mo_serieor) AND (dbo_movord.mo_anno = dbo_movord_1.mo_annoor) AND (dbo_movord.mo_tipork = dbo_movord_1.mo_tiporkor)
WHERE (((dbo_testord.td_tipork)="H") And ((dbo_testord.td_anno)=Forms!frmTprod!frmRprod_Tprod!RPrd_riford_anno) And ((dbo_testord.td_serie)=Forms!frmTprod!frmRprod_Tprod!Rpd_riford_serie) And ((dbo_testord.td_numord)=Forms!frmTprod!frmRprod_Tprod!RPrd_riford_num) And ((dbo_movord.mo_riga)=Forms!frmTprod!frmRprod_Tprod!RPrd_riford_riga))
ORDER BY dbo_testord.td_tipork, dbo_testord.td_anno, dbo_testord.td_serie, dbo_testord.td_numord, dbo_movord.mo_codart, dbo_movord.mo_riga;
```

**`qry_OrdFor`** (SELECT)
```sql
SELECT dbo_movord.mo_datcons, dbo_movord.mo_codart, dbo_artico.ar_codalt, dbo_movord.mo_unmis, dbo_movord.mo_descr, dbo_movord.mo_quant, dbo_movord.mo_quaeva, dbo___MOTIPORK.cb_modesrk, dbo_anagra.an_descr1, dbo_movord.mo_flevas, dbo___MOTIPORK.cb_motipork, dbo_anagra.an_tipo
FROM (((dbo_movord INNER JOIN dbo___MOTIPORK ON dbo_movord.mo_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN dbo_artico ON dbo_movord.mo_codart = dbo_artico.ar_codart) INNER JOIN dbo_testord ON (dbo_movord.mo_numord = dbo_testord.td_numord) AND (dbo_movord.mo_serie = dbo_testord.td_serie) AND (dbo_movord.mo_anno = dbo_testord.td_anno) AND (dbo_movord.mo_tipork = dbo_testord.td_tipork) AND (dbo_movord.codditt = dbo_testord.codditt)) INNER JOIN dbo_anagra ON (dbo_testord.td_conto = dbo_anagra.an_conto) AND (dbo_testord.codditt = dbo_anagra.codditt)
WHERE (((dbo_movord.mo_codart)<>"D") AND ((dbo_movord.mo_flevas)="C") AND ((dbo___MOTIPORK.cb_motipork)="O"))
ORDER BY dbo_movord.mo_datcons, dbo_movord.mo_codart;
```

**`qry_ordini_albatex`** (SELECT)
```sql
SELECT Gruppo.gr_id, qry_OrdProd_albatex.td_anno, qry_OrdProd_albatex.td_serie, qry_OrdProd_albatex.td_numord, dbo_artico.ar_codart, qry_OrdProd_albatex.mo_quant AS tot_qta_ord, Gruppo.gr_budget, dbo_artico.ar_codalt, Gruppo.gr_descr, dbo_artico.ar_descr, qry_OrdProd_albatex.mo_quaeva AS tot_qta_evasa, dbo___MOTIPORK.cb_modesrk, qry_OrdProd_albatex.td_datord, qry_OrdProd_albatex.mo_fase, qry_OrdProd_albatex.mo_flevas
FROM Gruppo INNER JOIN (((Articolo INNER JOIN dbo_artico ON Articolo.ar_articolo = dbo_artico.ar_codart) INNER JOIN qry_OrdProd_albatex ON Articolo.ar_articolo = qry_OrdProd_albatex.mo_codart) INNER JOIN dbo___MOTIPORK ON qry_OrdProd_albatex.td_tipork = dbo___MOTIPORK.cb_motipork) ON Gruppo.gr_id = Articolo.ar_gr_id
ORDER BY Gruppo.gr_id, qry_OrdProd_albatex.td_anno, qry_OrdProd_albatex.td_serie, qry_OrdProd_albatex.td_numord, dbo_artico.ar_codart;
```

**`qry_OrdProd_albatex`** (SELECT)
```sql
SELECT dbo_testord.td_conto, dbo_testord.td_datord, dbo_testord.td_tipork, dbo_testord.td_anno, dbo_testord.td_serie, dbo_testord.td_numord, dbo_movord.mo_quant, dbo_movord.mo_quaeva, dbo_movord.mo_flevas, dbo_movord.mo_codart, dbo_movord.mo_magaz, dbo_movord.mo_fase
FROM (dbo_testord INNER JOIN dbo_movord ON (dbo_testord.td_tipork = dbo_movord.mo_tipork) AND (dbo_testord.td_anno = dbo_movord.mo_anno) AND (dbo_testord.td_serie = dbo_movord.mo_serie) AND (dbo_testord.td_numord = dbo_movord.mo_numord)) INNER JOIN dbo___MOTIPORK ON dbo_testord.td_tipork = dbo___MOTIPORK.cb_motipork
WHERE (((dbo_testord.td_conto)=20010775) AND ((dbo_testord.td_datord)>#7/1/2007#) AND ((dbo_testord.td_tipork)="H") AND ((dbo_movord.mo_magaz)=1));
```

**`qry_totord_albatex`** (SELECT)
```sql
SELECT Gruppo.gr_id, Sum(qry_OrdProd_albatex.mo_quant) AS tot_qta_ord, Gruppo.gr_budget, dbo_artico.ar_codart, dbo_artico.ar_codalt, Gruppo.gr_descr, dbo_artico.ar_descr, Sum(qry_OrdProd_albatex.mo_quaeva) AS tot_qta_evasa, qry_OrdProd_albatex.mo_fase, Sum(IIf(UCase([mo_flevas])="S",([mo_quaeva]),[mo_quant])) AS OrdCalc
FROM Gruppo INNER JOIN ((Articolo INNER JOIN dbo_artico ON Articolo.ar_articolo = dbo_artico.ar_codart) INNER JOIN qry_OrdProd_albatex ON Articolo.ar_articolo = qry_OrdProd_albatex.mo_codart) ON Gruppo.gr_id = Articolo.ar_gr_id
GROUP BY Gruppo.gr_id, Gruppo.gr_budget, dbo_artico.ar_codart, dbo_artico.ar_codalt, Gruppo.gr_descr, dbo_artico.ar_descr, qry_OrdProd_albatex.mo_fase
ORDER BY Gruppo.gr_id, dbo_artico.ar_codart;
```

**`qry_totord_albatex_gruppo`** (SELECT)
```sql
SELECT Gruppo.gr_id, Gruppo.gr_descr, Gruppo.gr_budget, Sum(qry_OrdProd_albatex.mo_quant) AS tot_qta_ord, Sum(qry_OrdProd_albatex.mo_quaeva) AS tot_qta_evasa, Sum(IIf(UCase([mo_flevas])="S",([mo_quaeva]),[mo_quant])) AS OrdCalc
FROM Gruppo INNER JOIN ((Articolo INNER JOIN dbo_artico ON Articolo.ar_articolo = dbo_artico.ar_codart) INNER JOIN qry_OrdProd_albatex ON Articolo.ar_articolo = qry_OrdProd_albatex.mo_codart) ON Gruppo.gr_id = Articolo.ar_gr_id
GROUP BY Gruppo.gr_id, Gruppo.gr_descr, Gruppo.gr_budget
ORDER BY Gruppo.gr_id;
```

**`qryEstArt_ord`** (SELECT)
```sql
SELECT artico.ar_codalt, dbo_movord.mo_tipork, dbo_artpro.ap_codart, dbo_artpro.ap_magaz, dbo_artpro.ap_fase, dbo_movord.mo_datcons, artico.ar_descr, dbo_movord.mo_anno, dbo_movord.mo_serie, dbo_movord.mo_numord, dbo_movord.mo_riga, dbo_movord.mo_quant, dbo_movord.mo_quaeva, dbo_movord.mo_flevas, anagra.an_descr1, dbo___MOTIPORK.cb_modesrk, artico.ar_sostit, artico.ar_sostituito, artico.ar_inesaur
FROM ((dbo_artpro INNER JOIN ((dbo_testord INNER JOIN anagra ON (dbo_testord.codditt = anagra.codditt) AND (dbo_testord.td_conto = anagra.an_conto)) INNER JOIN dbo_movord ON (dbo_testord.td_tipork = dbo_movord.mo_tipork) AND (dbo_testord.td_anno = dbo_movord.mo_anno) AND (dbo_testord.td_serie = dbo_movord.mo_serie) AND (dbo_testord.td_numord = dbo_movord.mo_numord)) ON (dbo_artpro.ap_codart = dbo_movord.mo_codart) AND (dbo_artpro.ap_magaz = dbo_movord.mo_magaz) AND (dbo_artpro.ap_fase = dbo_movord.mo_fase)) INNER JOIN dbo___MOTIPORK ON dbo_movord.mo_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN artico ON dbo_movord.mo_codart = artico.ar_codart
WHERE (((dbo_movord.mo_tipork)="H") AND ((dbo_movord.mo_flevas)<>"S")) OR (((dbo_movord.mo_tipork)="O") AND ((dbo_movord.mo_flevas)<>"S")) OR (((dbo_movord.mo_tipork)="R") AND ((dbo_movord.mo_flevas)<>"S")) OR (((dbo_movord.mo_tipork)="Y") AND ((dbo_movord.mo_flevas)<>"S"))
ORDER BY dbo_movord.mo_tipork, dbo_artpro.ap_codart, dbo_artpro.ap_magaz, dbo_artpro.ap_fase, dbo_movord.mo_datcons;
```

**`qryEstArt_ordPadre`** (SELECT)
```sql
SELECT dbo_movord.mo_codart, dbo_movord.mo_magaz, dbo_movord.mo_fase, artico.ar_codalt, artico.ar_descr, dbo_movord_1.mo_tipork, dbo_movord_1.mo_anno, dbo_movord_1.mo_serie, dbo_movord_1.mo_numord, dbo_movord_1.mo_riga, dbo_movord_1.mo_codart, artico_1.ar_codalt, artico_1.ar_descr, dbo___MOTIPORK_1.cb_modesrk, anagra.an_descr1, Sum(dbo_movord_1.mo_quant) AS SommaDimo_quant, Sum(dbo_movord_1.mo_quaeva) AS SommaDimo_quaeva, dbo_movord_1.mo_flevas, dbo_movord_1.mo_magaz, dbo_movord_1.mo_fase, dbo_movord_1.mo_datcons
FROM ((((((dbo_movord INNER JOIN dbo___MOTIPORK ON dbo_movord.mo_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN dbo_movord AS dbo_movord_1 ON (dbo_movord.mo_rigaor = dbo_movord_1.mo_riga) AND (dbo_movord.mo_numordor = dbo_movord_1.mo_numord) AND (dbo_movord.mo_serieor = dbo_movord_1.mo_serie) AND (dbo_movord.mo_annoor = dbo_movord_1.mo_anno) AND (dbo_movord.mo_tiporkor = dbo_movord_1.mo_tipork)) INNER JOIN dbo_testord ON (dbo_movord_1.mo_numord = dbo_testord.td_numord) AND (dbo_movord_1.mo_serie = dbo_testord.td_serie) AND (dbo_movord_1.mo_anno = dbo_testord.td_anno) AND (dbo_movord_1.mo_tipork = dbo_testord.td_tipork)) INNER JOIN anagra ON dbo_testord.td_conto = anagra.an_conto) INNER JOIN artico ON dbo_movord.mo_codart = artico.ar_codart) INNER JOIN artico AS artico_1 ON dbo_movord_1.mo_codart = artico_1.ar_codart) INNER JOIN dbo___MOTIPORK AS dbo___MOTIPORK_1 ON dbo_movord_1.mo_tipork = dbo___MOTIPORK_1.cb_motipork
GROUP BY dbo_movord.mo_codart, dbo_movord.mo_magaz, dbo_movord.mo_fase, artico.ar_codalt, artico.ar_descr, dbo_movord_1.mo_tipork, dbo_movord_1.mo_anno, dbo_movord_1.mo_serie, dbo_movord_1.mo_numord, dbo_movord_1.mo_riga, dbo_movord_1.mo_codart, artico_1.ar_codalt, artico_1.ar_descr, dbo___MOTIPORK_1.cb_modesrk, anagra.an_descr1, dbo_movord_1.mo_flevas, dbo_movord_1.mo_magaz, dbo_movord_1.mo_fase, dbo_movord_1.mo_datcons
HAVING (((dbo_movord_1.mo_flevas)="C"))
ORDER BY dbo_movord_1.mo_tipork, dbo_movord_1.mo_codart, dbo_movord_1.mo_magaz, dbo_movord_1.mo_fase, dbo_movord_1.mo_datcons;
```

**`qryordlist`** (SELECT)
```sql
SELECT ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_tipork, dbo___MOTIPORK.cb_modesrk, Min(ordlist.ol_datcons) AS MinDiol_datcons, Sum(ordlist.ol_quant) AS SommaDiol_quant, ordlist.ol_stasino, ordlist.ol_stato, Sum(IIf((([ol_tipork]="H") Or ([ol_tipork]="O")) And ([ol_stato]="S"),[ol_quant],0)) AS opc, Sum(IIf((([ol_tipork]="H") Or ([ol_tipork]="O")) And ([ol_stato]<>"S"),[ol_quant],0)) AS op, Sum(IIf(([ol_tipork]="Y") And ([ol_stato]="S"),[ol_quant],0)) AS ipc, Sum(IIf(([ol_tipork]="Y") And ([ol_stato]<>"S"),[ol_quant],0)) AS ip, tabmaga.tb_applotti, tabmaga.tb_appscmin
FROM (ordlist INNER JOIN dbo___MOTIPORK ON ordlist.ol_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN tabmaga ON ordlist.ol_magaz = tabmaga.tb_codmaga
GROUP BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_tipork, dbo___MOTIPORK.cb_modesrk, ordlist.ol_stasino, ordlist.ol_stato, tabmaga.tb_applotti, tabmaga.tb_appscmin
HAVING (((ordlist.ol_codart)="0060866") AND ((ordlist.ol_tipork)="H" Or (ordlist.ol_tipork)="O" Or (ordlist.ol_tipork)="Y"))
ORDER BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, Min(ordlist.ol_datcons);
```

**`qryordlist senza corrispondenza con  dbo_artpro`** (SELECT)
```sql
SELECT qryordlist.ol_codart, qryordlist.ol_magaz, qryordlist.ol_fase, qryordlist.ol_tipork, qryordlist.cb_modesrk, qryordlist.MinDiol_datcons, qryordlist.SommaDiol_quant, qryordlist.ol_stasino, qryordlist.ol_stato, qryordlist.opc, qryordlist.op, qryordlist.ipc, qryordlist.ip, qryordlist.tb_applotti, qryordlist.tb_appscmin, artico.ar_inesaur, qryordlist.MinDiol_datcons
FROM (qryordlist LEFT JOIN dbo_artpro ON (qryordlist.ol_codart = dbo_artpro.ap_codart) AND (qryordlist.ol_magaz = dbo_artpro.ap_magaz) AND (qryordlist.ol_fase = dbo_artpro.ap_fase)) INNER JOIN artico ON qryordlist.ol_codart = artico.ar_codart
WHERE (((dbo_artpro.ap_codart) Is Null));
```

**`qryordlist1`** (SELECT)
```sql
SELECT ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_tipork, dbo___MOTIPORK.cb_modesrk, Min(ordlist.ol_datcons) AS MinDiol_datcons, Sum(ordlist.ol_quant) AS SommaDiol_quant, ordlist.ol_stasino, ordlist.ol_stato, Sum(IIf((([ol_tipork]="H") Or ([ol_tipork]="O")) And ([ol_stato]="S"),[ol_quant],0)) AS opc, Sum(IIf((([ol_tipork]="H") Or ([ol_tipork]="O")) And ([ol_stato]<>"S"),[ol_quant],0)) AS op, Sum(IIf(([ol_tipork]="Y") And ([ol_stato]="S"),[ol_quant],0)) AS ipc, Sum(IIf(([ol_tipork]="Y") And ([ol_stato]<>"S"),[ol_quant],0)) AS ip, tabmaga.tb_applotti, tabmaga.tb_appscmin
FROM (ordlist INNER JOIN dbo___MOTIPORK ON ordlist.ol_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN tabmaga ON ordlist.ol_magaz = tabmaga.tb_codmaga
GROUP BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_tipork, dbo___MOTIPORK.cb_modesrk, ordlist.ol_stasino, ordlist.ol_stato, tabmaga.tb_applotti, tabmaga.tb_appscmin
HAVING (((ordlist.ol_tipork)="H" Or (ordlist.ol_tipork)="O" Or (ordlist.ol_tipork)="Y"))
ORDER BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, Min(ordlist.ol_datcons);
```

**`qrySchedaProduzione`** (SELECT)
```sql
SELECT dbo_testord.td_tipork, dbo_testord.td_anno, dbo_testord.td_serie, dbo_testord.td_numord, dbo_movord.mo_codart, dbo_movord.mo_riga, dbo_movord.mo_datcons, dbo_movord.mo_magaz, dbo_movord.mo_unmis, dbo_movord.mo_descr, dbo_movord.mo_colli, dbo_movord.mo_coleva, dbo_movord.mo_quant, dbo_movord.mo_quaeva, dbo_movord.mo_flevas, dbo_movord.mo_colpre, dbo_movord.mo_note, dbo_movord.mo_valore, dbo_movord.mo_ump, dbo_movord.mo_lotto, dbo_movord.mo_valoremm, dbo_movord.mo_fase, dbo_testord.td_conto, dbo_testord.td_datord, dbo_movord_1.mo_riga, dbo_movord_1.mo_codart, dbo_movord_1.mo_unmis, dbo_movord_1.mo_descr, dbo_movord_1.mo_colli, dbo_movord_1.mo_quant, dbo_movord_1.mo_ump, dbo_movord_1.mo_lotto, dbo_movord_1.mo_fase, dbo_artico.ar_codalt, dbo_artico.ar_qtacon2, dbo_artico.ar_reparto, dbo_artico.ar_gesfasi, dbo_artico_1.ar_codalt, dbo_anagra.an_descr1
FROM ((dbo_testord INNER JOIN dbo_anagra ON (dbo_testord.codditt = dbo_anagra.codditt) AND (dbo_testord.td_conto = dbo_anagra.an_conto)) INNER JOIN (dbo_movord INNER JOIN dbo_artico ON dbo_movord.mo_codart = dbo_artico.ar_codart) ON (dbo_testord.codditt = dbo_movord.codditt) AND (dbo_testord.td_tipork = dbo_movord.mo_tipork) AND (dbo_testord.td_anno = dbo_movord.mo_anno) AND (dbo_testord.td_serie = dbo_movord.mo_serie) AND (dbo_testord.td_numord = dbo_movord.mo_numord)) INNER JOIN (dbo_movord AS dbo_movord_1 INNER JOIN dbo_artico AS dbo_artico_1 ON dbo_movord_1.mo_codart = dbo_artico_1.ar_codart) ON (dbo_movord.codditt = dbo_movord_1.codditt) AND (dbo_movord.mo_tipork = dbo_movord_1.mo_tiporkor) AND (dbo_movord.mo_anno = dbo_movord_1.mo_annoor) AND (dbo_movord.mo_serie = dbo_movord_1.mo_serieor) AND (dbo_movord.mo_numord = dbo_movord_1.mo_numordor) AND (dbo_movord.mo_riga = dbo_movord_1.mo_rigaor)
WHERE (((dbo_testord.td_tipork)="H") AND ((dbo_testord.td_anno)=2006) AND ((dbo_testord.td_serie)="L") AND ((dbo_testord.td_numord)=1196))
ORDER BY dbo_testord.td_tipork, dbo_testord.td_anno, dbo_testord.td_serie, dbo_testord.td_numord, dbo_movord.mo_codart, dbo_movord.mo_riga;
```

**`qty_OrdProd_Albatex_Verify`** (SELECT)
```sql
SELECT dbo_testord.td_conto, dbo_testord.td_datord, dbo_testord.td_tipork, dbo_testord.td_anno, dbo_testord.td_serie, dbo_testord.td_numord, dbo_movord.mo_quant, dbo_movord.mo_quaeva, dbo_movord.mo_flevas, dbo_movord.mo_codart, dbo_movord.mo_fase, dbo_movord.mo_magaz
FROM (dbo_testord INNER JOIN dbo_movord ON (dbo_testord.td_tipork = dbo_movord.mo_tipork) AND (dbo_testord.td_anno = dbo_movord.mo_anno) AND (dbo_testord.td_serie = dbo_movord.mo_serie) AND (dbo_testord.td_numord = dbo_movord.mo_numord)) INNER JOIN dbo___MOTIPORK ON dbo_testord.td_tipork = dbo___MOTIPORK.cb_motipork
WHERE (((dbo_testord.td_conto)=20010775) AND ((dbo_testord.td_datord)>#7/1/2007#) AND ((dbo_testord.td_tipork)="H") AND ((dbo_movord.mo_magaz)=1));
```

**`qty_OrdProd_Albatex_Verify senza corrispondenza con  Articolo`** (SELECT)
```sql
SELECT qty_OrdProd_Albatex_Verify.td_conto, qty_OrdProd_Albatex_Verify.td_datord, qty_OrdProd_Albatex_Verify.td_tipork, qty_OrdProd_Albatex_Verify.td_anno, qty_OrdProd_Albatex_Verify.td_serie, qty_OrdProd_Albatex_Verify.td_numord, qty_OrdProd_Albatex_Verify.mo_quant, qty_OrdProd_Albatex_Verify.mo_quaeva, qty_OrdProd_Albatex_Verify.mo_flevas, qty_OrdProd_Albatex_Verify.mo_codart, artico.ar_codalt, artico.ar_descr, dbo___MOTIPORK.cb_modesrk
FROM ((qty_OrdProd_Albatex_Verify LEFT JOIN Articolo ON qty_OrdProd_Albatex_Verify.mo_codart = Articolo.ar_articolo) INNER JOIN dbo___MOTIPORK ON qty_OrdProd_Albatex_Verify.td_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN artico ON qty_OrdProd_Albatex_Verify.mo_codart = artico.ar_codart
WHERE (((Articolo.ar_articolo) Is Null));
```

**`Work Order`** (SELECT)
```sql
SELECT Employees_1.FirstName, [Work Type].WorkTypeDescription AS Espr1, Workorders.WorkorderNo AS Espr2, WorkStatus.WorkStatus AS Espr3, WarrantyContract.[Warranty/contract] AS Espr4, Assets.[Warranty/ContractExpiry] AS Espr5, WorkPriority.WorkPriority AS Espr6, Employees.FirstName, WorkTrade.WorkTrade AS Espr7, [Failure Cause].[Failure Cause Code] AS Espr8, [Failure Cause].[Failure Cause Description] AS Espr9, Employees.EmployeeNO, Workorders.AssetNo AS Espr10, Assets.AssetDescription AS Espr11, Workorders.LocationNo AS Espr12, Location.LocationDescription, Workorders.ProblemDescription AS Espr13, Workorders.DateReceived AS Espr14, Format([DateReceived],"dd/mm/yyyy") AS DR, Workorders.EstDateStart AS Espr15, Workorders.EstDateEnd AS Espr16, Workorders.ActDateStart AS Espr17, Workorders.ActDateEnd AS Espr18, Workorders.DateRequired AS Espr19, Workorders.DateHandover AS Espr20, Workorders.EstDuration AS Espr21, Workorders.ActionTaken AS Espr22, Workorders.FailureCauseCode AS Espr23, Workorders.EmployeeID2 AS Espr24, Workorders.CauseDescription AS Espr25, Workorders.PreventionTaken AS Espr26, Workorders.WOCost AS Espr27, Workorders.PMTarStartDate AS Espr28, Workorders.PMTarCompDate AS Espr29, Workorders.AsstartDate AS Espr30, Workorders.AssEndDate AS Espr31, Employees_2.FirstName
FROM Workorders, WorkStatus, Assets, Location, WorkPriority, WorkTrade, WarrantyContract, [Failure Cause], Employees, [Work Type], Employees AS Employees_1, Employees AS Employees_2;
```

**`WorkOrderStatusChart`** (SELECT)
```sql
SELECT Employees_1.FirstName, [Work Type].WorkTypeDescription AS Espr1, Workorders.WorkorderNo AS Espr2, WorkStatus.WorkStatus AS Espr3, WarrantyContract.[Warranty/contract] AS Espr4, Assets.[Warranty/ContractExpiry] AS Espr5, WorkPriority.WorkPriority AS Espr6, Employees.FirstName, WorkTrade.WorkTrade AS Espr7, [Failure Cause].[Failure Cause Code] AS Espr8, [Failure Cause].[Failure Cause Description] AS Espr9, Employees.EmployeeNO, Workorders.AssetNo AS Espr10, Assets.AssetDescription AS Espr11, Workorders.LocationNo AS Espr12, Location.LocationDescription, Workorders.ProblemDescription AS Espr13, Workorders.DateReceived AS Espr14, Format([DateReceived],"dd/mm/yyyy") AS DR, Workorders.EstDateStart AS Espr15, Workorders.EstDateEnd AS Espr16, Workorders.ActDateStart AS Espr17, Workorders.ActDateEnd AS Espr18, Workorders.DateRequired AS Espr19, Workorders.DateHandover AS Espr20, Workorders.EstDuration AS Espr21, Workorders.ActionTaken AS Espr22, Workorders.FailureCauseCode AS Espr23, Workorders.EmployeeID2 AS Espr24, Workorders.CauseDescription AS Espr25, Workorders.PreventionTaken AS Espr26, Workorders.WOCost AS Espr27, Workorders.PMTarStartDate AS Espr28, Workorders.PMTarCompDate AS Espr29, Workorders.AsstartDate AS Espr30, Workorders.AssEndDate AS Espr31
FROM Workorders, WorkStatus, Assets, Location, WorkPriority, WorkTrade, WarrantyContract, [Failure Cause], Employees, [Work Type], Employees AS Employees_1;
==========================================================
SEZIONE 2: STRUTTURA TABELLE
==========================================================
```

### ANAGRAFICA

**`<Mov_Mag_Articolo_Fase>`** (SELECT)
```sql
SELECT Tab_15_Tot.mm_codart, Tab_15_Tot.mm_fase, Tab_15_Tot.nrec, Tab_15_Tot.min_tlav, Tab_15_Tot.max_tlav, Tab_15_Tot.Media_pond, Tab_15_Tot.devstd, Tab_15_Tot.lotto_min, Tab_15_Tot.lotto_max, Tab_15_Tot.Lotto_medio, Tab_15_Tot.Tempo_std
FROM Tab_15_Tot;
```

**`02_TU per classe`** (SELECT)
```sql
SELECT [01_Totale tempi per classe].Classe, [01_Totale tempi per classe].descrizione, [Tempo]/[Pezzi] AS TU, [Tempo]/[Pezzi]*18.44 AS CU, [Tempo]/[Pezzi]*18.44*1936.27 AS [CU lire]
FROM [01_Totale tempi per classe];
```

**`03_Articoli prodotti non presenti su classific`** (SELECT)
```sql
SELECT [Classificazione articoli].Tipologia, Rprod.RPrd_PF, dbo_artico.ar_descr, [Classificazione articoli].Classe
FROM [Classificazione articoli] INNER JOIN (dbo_artico INNER JOIN Rprod ON dbo_artico.ar_codart = Rprod.RPrd_PF) ON [Classificazione articoli].codart = Rprod.RPrd_PF
GROUP BY [Classificazione articoli].Tipologia, Rprod.RPrd_PF, dbo_artico.ar_descr, [Classificazione articoli].Classe
HAVING ((([Classificazione articoli].Classe) Is Null));
```

**`artico senza corrispondenza con  dbo_artpro`** (SELECT)
```sql
SELECT artico.ar_codart, artico.ar_codalt, artico.ar_descr
FROM artico LEFT JOIN dbo_artpro ON artico.ar_codart = dbo_artpro.ap_codart
WHERE (((dbo_artpro.ap_codart) Is Null));
```

**`CentroLavoro`** (SELECT)
```sql
SELECT dbo_tabcent.tb_codcent AS Codice, dbo_tabcent.tb_descent AS Descrizione_Produzione, dbo__Risorse_CDL.ORGANICO AS Organico, FormatNumber([ORE_GG],2) AS [Ore/GG], FormatNumber([Tariffa_oraria],2) AS Tar_HH
FROM dbo_tabcent LEFT JOIN dbo__Risorse_CDL ON dbo_tabcent.tb_codcent = dbo__Risorse_CDL.CODCENT
ORDER BY dbo_tabcent.tb_descent;
```

**`Qry_accgruppo`** (APPEND)
```sql
INSERT INTO tbGroups
SELECT [tbGroups - BackUp].*
FROM [tbGroups - BackUp];
```

**`Qry_articolo`** (SELECT)
```sql
SELECT dbo_artico.ar_descr AS Descrizione, dbo_artico.ar_codart AS [Cod Art], dbo_artico.ar_codalt AS [Art Old], dbo_artpro.ap_fase, dbo_artfasi.af_descr AS [Descrzione Fase], Sum(dbo_artpro.ap_esist) AS Esistenza
FROM (dbo_artico INNER JOIN dbo_artpro ON dbo_artico.ar_codart = dbo_artpro.ap_codart) INNER JOIN dbo_artfasi ON (dbo_artico.ar_codart = dbo_artfasi.af_codart) AND (dbo_artico.ar_ultfase = dbo_artfasi.af_fase)
GROUP BY dbo_artico.ar_descr, dbo_artico.ar_codart, dbo_artico.ar_codalt, dbo_artpro.ap_fase, dbo_artfasi.af_descr, dbo_artico.ar_desint, dbo_artico.ar_ultfase, dbo_artico.ar_tipo
ORDER BY dbo_artico.ar_descr, dbo_artico.ar_codart, Last(dbo_artpro.ap_magaz);
```

**`QryArticolo`** (SELECT)
```sql
SELECT dbo_artico.ar_codart AS Espr1, dbo_artico.ar_codalt AS Espr2, dbo_artico.ar_descr AS Espr3, dbo_artico.ar_tipo AS Espr4, dbo_artico.ar_desint AS Espr5
FROM dbo_artico
ORDER BY dbo_artico.ar_descr;
```

### GRAFICI

**`qry_graf_01`** (MAKE TABLE)
```sql
SELECT Avg(dbo__Storico_Giacenze.Esistenza) AS Esi_med, dbo__Storico_Giacenze.codart, dbo__Storico_Giacenze.Fase INTO tab_graf_01
FROM dbo__Storico_Giacenze
GROUP BY dbo__Storico_Giacenze.codart, dbo__Storico_Giacenze.Fase;
```

**`qry_graf_02`** (MAKE TABLE)
```sql
SELECT dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_quant INTO tab_graf_02
FROM dbo_listprod
WHERE (((dbo_listprod.lp_codlpro)=1001))
GROUP BY dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_quant
ORDER BY dbo_listprod.lp_codart, dbo_listprod.lp_fase;
```

**`qry_graf_03`** (MAKE TABLE)
```sql
SELECT dbo_movmag.mm_codart, dbo_movmag.mm_fase, Sum(dbo_movmag.mm_quant) AS mm_quant INTO tab_graf_03
FROM dbo_movmag INNER JOIN dbo_keymag ON (dbo_movmag.mm_tipork = dbo_keymag.km_tipork) AND (dbo_movmag.mm_anno = dbo_keymag.km_anno) AND (dbo_movmag.mm_serie = dbo_keymag.km_serie) AND (dbo_movmag.mm_numdoc = dbo_keymag.km_numdoc) AND (dbo_movmag.mm_riga = dbo_keymag.km_riga)
WHERE (((dbo_movmag.mm_magaz) In (1,101,9999)) AND ((dbo_keymag.km_carscar)=-1))
GROUP BY dbo_movmag.mm_codart, dbo_movmag.mm_fase
ORDER BY dbo_movmag.mm_codart, dbo_movmag.mm_fase;
```

**`qry_graf_04`** (MAKE TABLE)
```sql
SELECT tab_graf_03.mm_codart, tab_graf_03.mm_fase, tab_graf_03.mm_quant AS SommaDimm_quant, IIf([ar_gesfasi]="N",[ar_ggrior],[hh_af_ggrior]) AS ar_ggriorC, IIf([ar_gesfasi]="N",[artico].[ar_scomin],[tab_graf_02].[lp_quant]) AS scmin_std, artico.ar_descr, artico.ar_codalt, artico.ar_gesfasi, artico.ar_polriord, artfasi.af_descr INTO tab_graf_04
FROM (((tab_graf_03 INNER JOIN artico ON tab_graf_03.mm_codart = artico.ar_codart) LEFT JOIN dbo_HH_artfasi ON (tab_graf_03.mm_codart = dbo_HH_artfasi.HH_af_codart) AND (tab_graf_03.mm_fase = dbo_HH_artfasi.HH_af_fase)) LEFT JOIN artfasi ON (tab_graf_03.mm_codart = artfasi.af_codart) AND (tab_graf_03.mm_fase = artfasi.af_fase)) LEFT JOIN tab_graf_02 ON (tab_graf_03.mm_codart = tab_graf_02.lp_codart) AND (tab_graf_03.mm_fase = tab_graf_02.lp_fase)
WHERE (((artico.ar_polriord)="M"))
GROUP BY tab_graf_03.mm_codart, tab_graf_03.mm_fase, tab_graf_03.mm_quant, IIf([ar_gesfasi]="N",[ar_ggrior],[hh_af_ggrior]), IIf([ar_gesfasi]="N",[artico].[ar_scomin],[tab_graf_02].[lp_quant]), artico.ar_descr, artico.ar_codalt, artico.ar_gesfasi, artico.ar_polriord, artfasi.af_descr
ORDER BY tab_graf_03.mm_codart, tab_graf_03.mm_fase;
```

### ALTRO

**`<Mov_Mag_Art_Fase_Committente>`** (SELECT)
```sql
SELECT Tab_15_Tot_Com.mm_codart, Tab_15_Tot_Com.mm_fase, Tab_15_Tot_Com.an_descr1, Tab_15_Tot_Com.nrec, Tab_15_Tot_Com.min_tlav, Tab_15_Tot_Com.max_tlav, Tab_15_Tot_Com.Media_pond, Tab_15_Tot_Com.devstd, Tab_15_Tot_Com.lotto_min, Tab_15_Tot_Com.lotto_max, Tab_15_Tot_Com.Lotto_medio, Tab_15_Tot_Com.Tempo_std
FROM Tab_15_Tot_Com;
```

**`CreImpegni`** (APPEND)
```sql
INSERT INTO Impegno ( Num_Cmp, Cod_Prod, ArtAlt, Descrizione )
SELECT Count([%$##@_Alias].md_coddb) AS Num_Cmp, First([%$##@_Alias].md_coddb) AS Cod_Prod, [%$##@_Alias].dbo_artico_1.ar_codalt AS ArtAlt, [%$##@_Alias].dbo_artico_1.ar_descr AS Descrizione
FROM (SELECT dbo_movdis.md_coddb, dbo_artico_1.ar_descr, dbo_artico_1.ar_codalt FROM ((dbo_movdis LEFT JOIN dbo_artfasi ON (dbo_movdis.md_codfigli = dbo_artfasi.af_codart) AND (dbo_movdis.md_fasefigli = dbo_artfasi.af_fase)) INNER JOIN dbo_artico ON dbo_movdis.md_codfigli = dbo_artico.ar_codart) INNER JOIN dbo_artico AS dbo_artico_1 ON dbo_movdis.md_coddb = dbo_artico_1.ar_codart WHERE (((dbo_movdis.md_codfigli) In ("0010157","0060440","0060443")) AND ((dbo_artico_1.ar_gruppo)=15)) ORDER BY dbo_movdis.md_coddb)  AS [%$##@_Alias]
GROUP BY [%$##@_Alias].dbo_artico_1.ar_codalt, [%$##@_Alias].dbo_artico_1.ar_descr, [%$##@_Alias].md_coddb
HAVING (((Count([%$##@_Alias].md_coddb))>1))
ORDER BY Count([%$##@_Alias].md_coddb) DESC , First([%$##@_Alias].md_coddb);
```

**`Q_splist`** (SELECT)
```sql
SELECT P_ORDLIST.ol_codart, P_ORDLIST.ol_magaz, P_ORDLIST.ol_fase, Min(P_ORDLIST.MinDiol_datcons) AS MinDiol_datcons, Sum(P_ORDLIST.SommaDiol_quant) AS SommaDiSommaDiol_quant, Sum(P_ORDLIST.opc) AS opc, Sum(P_ORDLIST.op) AS op, Sum(P_ORDLIST.ipc) AS ipc, Sum(P_ORDLIST.ip) AS ip
FROM P_ORDLIST
GROUP BY P_ORDLIST.ol_codart, P_ORDLIST.ol_magaz, P_ORDLIST.ol_fase;
```

**`Qry_01_calcolo_scorta_minima_calcolata`** (SELECT)
```sql
SELECT tab_graf_04.mm_codart, tab_graf_04.mm_fase, [SommaDimm_quant]/Forms!frm_scmin_lista!gg_analisi*[ar_ggriorC] AS scmin_cal, tab_graf_04.scmin_std
FROM tab_graf_04;
```

**`Qry_accPart`** (APPEND)
```sql
INSERT INTO tbParts
SELECT [tbParts - BackUp].*
FROM [tbParts - BackUp];
```

**`qry_hh_artfasi`** (SELECT)
```sql
SELECT dbo_HH_artfasi.HH_af_codart, dbo_HH_artfasi.HH_af_fase, dbo_HH_artfasi.HH_af_ggrior, artfasi.af_descr, artico.ar_descr
FROM (dbo_HH_artfasi INNER JOIN artfasi ON (dbo_HH_artfasi.HH_af_codart = artfasi.af_codart) AND (dbo_HH_artfasi.HH_af_fase = artfasi.af_fase)) INNER JOIN artico ON dbo_HH_artfasi.HH_af_codart = artico.ar_codart;
```

**`qryEstArt_list`** (SELECT)
```sql
SELECT artico.ar_codalt, ordlist.ol_tipork AS mo_tipork, ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_datcons, artico.ar_descr, ordlist.ol_oranno, ordlist.ol_orserie, ordlist.ol_ornum, ordlist.ol_orriga, Sum(ordlist.ol_quant) AS SommaDiol_quant, anagra.an_descr1, dbo___MOTIPORK.cb_modesrk, ordlist.ol_stasino, ordlist.ol_ump, ordlist.ol_stato, ordlist.ol_perqta, IIf([ol_stato]="S","Conferm.","Generato") AS Conf_gen
FROM ((ordlist INNER JOIN dbo___MOTIPORK ON ordlist.ol_tipork = dbo___MOTIPORK.cb_motipork) INNER JOIN artico ON ordlist.ol_codart = artico.ar_codart) INNER JOIN anagra ON ordlist.ol_conto = anagra.an_conto
GROUP BY artico.ar_codalt, ordlist.ol_tipork, ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_datcons, artico.ar_descr, ordlist.ol_oranno, ordlist.ol_orserie, ordlist.ol_ornum, ordlist.ol_orriga, anagra.an_descr1, dbo___MOTIPORK.cb_modesrk, ordlist.ol_stasino, ordlist.ol_ump, ordlist.ol_stato, ordlist.ol_perqta, IIf([ol_stato]="S","Conferm.","Generato")
HAVING (((ordlist.ol_tipork)="H" Or (ordlist.ol_tipork)="O" Or (ordlist.ol_tipork)="R" Or (ordlist.ol_tipork)="Y"))
ORDER BY ordlist.ol_tipork, ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, ordlist.ol_datcons;
```

**`qryEstArt_listPadre`** (SELECT)
```sql
SELECT ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, artico.ar_codalt, artico.ar_descr, ordlist_1.ol_tipork, ordlist_1.ol_codart, artico_1.ar_codalt, artico_1.ar_descr, dbo___MOTIPORK_1.cb_modesrk, anagra.an_descr1, ordlist_1.ol_magaz, ordlist_1.ol_fase, ordlist.ol_datcons, IIf(ordlist_1.ol_stato="S","Conferm.","Generato") AS conf_gen, Sum(ordlist.ol_quant) AS SommaDiol_quant
FROM ((ordlist INNER JOIN (((ordlist AS ordlist_1 INNER JOIN artico AS artico_1 ON ordlist_1.ol_codart = artico_1.ar_codart) INNER JOIN anagra ON ordlist_1.ol_conto = anagra.an_conto) INNER JOIN dbo___MOTIPORK AS dbo___MOTIPORK_1 ON ordlist_1.ol_tipork = dbo___MOTIPORK_1.cb_motipork) ON ordlist.ol_progr = ordlist_1.ol_olprogr) INNER JOIN artico ON ordlist.ol_codart = artico.ar_codart) INNER JOIN dbo___MOTIPORK ON ordlist.ol_tipork = dbo___MOTIPORK.cb_motipork
GROUP BY ordlist.ol_codart, ordlist.ol_magaz, ordlist.ol_fase, artico.ar_codalt, artico.ar_descr, ordlist_1.ol_tipork, ordlist_1.ol_codart, artico_1.ar_codalt, artico_1.ar_descr, dbo___MOTIPORK_1.cb_modesrk, anagra.an_descr1, ordlist_1.ol_magaz, ordlist_1.ol_fase, ordlist.ol_datcons, IIf(ordlist_1.ol_stato="S","Conferm.","Generato")
ORDER BY ordlist_1.ol_tipork, ordlist_1.ol_codart, ordlist_1.ol_magaz, ordlist_1.ol_fase, ordlist.ol_datcons;
```

**`qrylistproFIND`** (SELECT)
```sql
SELECT dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_codlpro, dbo_listprod.lp_quant
FROM dbo_listprod
WHERE (((dbo_listprod.lp_codlpro)=1001))
ORDER BY dbo_listprod.lp_codart, dbo_listprod.lp_fase, dbo_listprod.lp_codlpro;
```

**`qryNextRec_Dlookup`** (SELECT)
```sql
SELECT tblMileage.id AS Espr1, tblMileage.Date AS Espr2, tblMileage.Odometer AS Espr3, DLookUp("[Odometer]","tblMileage","[ID] = " & [ID]+1) AS [Next Odometer], tblMileage.Gallons AS Espr4
FROM tblMileage;
```

**`qryNextRec_VBA`** (SELECT)
```sql
SELECT tblMileage.id AS Espr1, tblMileage.Date AS Espr2, tblMileage.Odometer AS Espr3, NextRecVal("ID",[ID],"Odometer") AS [Next Odometer], tblMileage.Gallons AS Espr4
FROM tblMileage;
```

**`qryPrevRec_Dlookup`** (SELECT)
```sql
SELECT tblMileage.id AS Espr1, tblMileage.Date AS Espr2, tblMileage.Odometer AS Espr3, DLookUp("[Odometer]","tblMileage","[ID] = " & [ID]-1) AS [Previous Odometer], tblMileage.Gallons AS Espr4
FROM tblMileage;
```

---
## 5. FORMULE E FUNZIONI CHIAVE

**Scorta minima calcolata:**
```
ScMin_Calc = Round((SommaDiQt / gg_analisi) * IIf(ar_ggriorC > 0, ar_ggriorC, 1))
Differenza = scmin_std - ScMin_Calc
```

**Tempo unitario lavorazione:**
```
TU = IIf(lce_qtaes > 0, lce_tempese / lce_qtaes, 0)
Media_pond = Sum(TU * lce_qtaes) / Sum(lce_qtaes)
DevStd = Sqr(Sum((TU - Media)^2) / nrec)
```

**Consumo giornaliero per ordini:** `[SommaDimm_quant] / gg_analisi * [ar_ggriorC]`

**Funzioni VBA:** `getpar_codart()`, `getpar_fase()`, `par_ggAnalisi()`, `gira_data()`

---
## 6. ARCHITETTURA APP WEB (implementazione attuale)

### 6.1 Stack tecnologico

| Layer | Tecnologia |
|--------|------------|
| Runtime / server | **Node.js** con **Express** (`express`, `cors`, `dotenv`) |
| Database | **mssql** (driver Microsoft SQL Server), pool lazy su due database |
| Frontend | **HTML5**, **JavaScript vanilla** (nessun framework UI), **Chart.js** da CDN per i grafici consumi |
| Stili | Foglio unico `public/css/mrp.css` (variabili CSS, layout, modali, split view, proposta ordini) |

### 6.2 Server e avvio

- **Entry point:** `server.js`
- **Porta:** `process.env.PORT` oppure **3100** di default; ascolto su `0.0.0.0`
- **Middleware:** `express.json()`, `cors()`, cartella statica `public/`
- **API:** prefisso **`/api/mrp`** → router `routes/mrpRoutes.js`
- **SPA / fallback:** ogni richiesta GET non sotto `/api` risponde con `public/mrp.html` (singola pagina con viste Parametri e Progressivi)

### 6.3 Struttura cartelle (rilevante per MRP)

```
progetto/
├── server.js
├── config/
│   └── db.js
├── routes/
│   └── mrpRoutes.js
└── public/
    ├── mrp.html
    ├── css/mrp.css
    └── js/
        ├── mrp-app.js
        ├── mrp-parametri.js
        ├── mrp-progressivi.js
        └── mrp-proposta.js
```

### 6.4 Connessioni database (`config/db.js`)

Due **ConnectionPool** distinti, stesso server (`DB_SERVER`), credenziali da variabili ambiente:

| Pool | Variabile `database` | Uso nell’app |
|------|----------------------|--------------|
| **UJET11** | `DB_UJET11` | Dati operativi ERP (anagrafiche, progressivi, ordini, distinta, proposte ordini fornitore). È il database effettivo “bcube2 / UJET11” in produzione. |
| **MRP** | `DB_MRP` | Pool dedicato; l’endpoint **`GET /health`** esegue `SELECT 1` anche qui per verificare la connettività. Le API MRP documentate sotto interrogano **principalmente UJET11** (`dbo.*`). |

**Cross-database consumi:** le query sui consumi usano esplicitamente **`Analisi_scorte.dbo.View_100_riep`** (stesso server SQL, database separato), tramite la connessione al pool UJET11.

Opzioni pool comuni: `encrypt: false`, `trustServerCertificate: true`, `enableArithAbort: true`.

### 6.5 Pattern architetturali

- **Backend:** modulo Express `Router` unico (`mrpRoutes.js`) con handler `async`, uso di `getPoolUJET11()` / `getPoolMRP()` e parametri `sql.NVarChar` / `sql.SmallInt`.
- **Frontend:** ogni file JS è un **IIFE** che espone un oggetto globale (`MrpApp`, `MrpParametri`, `MrpProgressivi`, `MrpProposta`). Nessun bundler: script caricati in ordine in `mrp.html`.
- **Stato:** `MrpApp.state` (articolo, parametri, ultimo payload progressivi); `MrpProgressivi` mantiene stato locale (cache espansioni, modali, BI consumi, tema accessibilità).

### 6.6 Variabili ambiente attese

`DB_SERVER`, `DB_UJET11`, `DB_MRP`, `DB_USER`, `DB_PASSWORD`, opzionale `PORT`.

---

## 7. API BACKEND (`/api/mrp/*`)

Tutti gli endpoint sono definiti in `routes/mrpRoutes.js`. Di seguito: metodo, path **relativo al router** (prefisso reale: `/api/mrp`).

### Helper condivisi (stesso file)

| Funzione | Ruolo | Dove viene usata |
|----------|--------|-------------------|
| **`caricaMRP(pool, codart, filtroMagaz, filtroFase)`** | Legge `artpro` + aggregati da `ordlist` (tipi H/O/Y) per un codice articolo; costruisce righe `magazzino` (con OPC/OP/IPC/IP e date consuntivo), righe `totale` per fase e opzionalmente `totale-cross-fase`. | `GET /progressivi`, `GET /progressivi/expand` |
| **`normalizzaMagazzinoPerChiave(mrpRighe)`** | Aggrega le righe `magazzino` duplicate per chiave `(magaz, fase)` in una riga con giacenze dalla prima riga “piena” e somma degli ordini. | Solo vista **esaurimento + sostitutivo** (`/progressivi`) per costruire il blocco combinato |
| **`costruisciCombinatoRighe(mapEsaur, mapSost, codEsaur, codSost)`** | Somma i numeri esaurimento + sostitutivo per stessa chiave mag/fase; rigenera totali per fase e cross-fase con `codart` sintetico `"{sost}+{esaur}"` e metadati `etichettaBlocco: 'combinato'`. | `/progressivi` quando presente sostitutivo |
| **`taggaMrpBlocco(mrpRighe, blocco, codLabel)`** | Imposta `etichettaBlocco` e `labelTotale` sulle righe totali (`esaurimento` / `sostitutivo`). | Dopo `caricaMRP` per i due blocchi MRP |
| **`buildGeneraleTotaleRow(combinatoRighe)`** | Produce una riga `tipo: 'generale-totale'` dai totali combinati (priorità `totale-cross-fase`). | `/progressivi` in scenario sostitutivo |
| **`getPoliticaRiordino(art)`** | Mappa `ar_polriord` in testo leggibile (M/F/L/N + dettagli scorta/lotto/descrizione interna). | Payload `politicaRiordino` e righe articolo in `/progressivi` |

---

### 7.1 `GET /articoli/search`

- **Query:** `q` (testo), `field` ∈ `codart` \| `codalt` \| `descr`
- **Tabelle:** `dbo.artico` (TOP 50, `ORDER BY ar_descr`)
- **Risposta:** array di oggetti `{ ar_codart, ar_codalt, ar_descr, ar_tipo, ar_desint }`
- **Note:** `codart` usa prefisso `LIKE @term + '%'`; `codalt` e `descr` usano `'%' + term + '%'`

### 7.2 `GET /articoli/:codart/fasi`

- **Path:** `codart` articolo
- **Tabelle:** `dbo.artfasi` (`ORDER BY af_fase DESC`)
- **Risposta:** array `{ af_codart, af_fase, af_descr }`

### 7.3 `GET /magazzini`

- **Tabelle:** `dbo.tabmaga` (`tb_codmaga`, `tb_desmaga`)
- **Risposta:** array record magazzino
- **Nota:** l’endpoint esiste ma la maschera parametri usa oggi un **campo testo libero** `paramMagaz` senza popolamento da questa API

### 7.4 `GET /progressivi`

- **Query:** `codart` (obbligatorio), `magaz`, `fase` (filtri opzionali su `artpro` e `ordlist`)
- **Query NON lette dal backend:** `modo`, `sintetico` (inviati dal frontend ma **ignorati** — nessun riferimento in `mrpRoutes.js`)
- **Tabelle / viste:** `dbo.artico`, `dbo.artpro`, `dbo.tabmaga`, `dbo.artfasi`, `dbo.ordlist`, `dbo.movdis`, `dbo.artico` (join figli)
- **Logica principale:**
  - Carica anagrafica articolo radice.
  - Se `ar_inesaur = 'S'` e `ar_sostit` valorizzato, carica anagrafica sostitutivo e costruisce **tre blocchi MRP** (esaurimento, sostitutivo, combinato) + riga **`generale-totale`**.
  - Altrimenti un solo blocco MRP per l’articolo radice.
  - Figli di distinta (`movdis` dove `md_coddb = codart`): per ogni figlio, riga `componente` + `caricaMRP` del figlio (livello 1). Flag `espandibile` se esiste sotto-distinta; `scaduto` se `md_dtfival < oggi`.
- **Risposta JSON (struttura):**
  - `articolo` — record `artico` selezionato
  - `politicaRiordino` — stringa da `getPoliticaRiordino`
  - `righe` — array misto, tipi inclusi: `padre`, `magazzino`, `totale`, `totale-cross-fase`, `sostitutivo-header`, `componente`, `generale-totale` (solo scenario sostitutivo); campi numerici tipici: `esistenza`, `ordinato`, `impegnato`, `disponibilita`, `opc`, `op`, `ipc`, `ip`, `dataCons`, `livello`, `etichettaBlocco`, `labelTotale`, …
  - `sostitutivo` — presente solo se caricato il ramo sostitutivo

### 7.5 `GET /progressivi/expand`

- **Query:** `codart`, `livello` (default 1)
- **Tabelle:** come `caricaMRP` + `movdis`/`artico` per figli
- **Risposta:** `{ righe }` dove `righe` = righe MRP con `livello` richiesto + righe `componente` al livello `livello+1` (senza payload articolo radice)

### 7.6 `GET /ordini-dettaglio`

- **Query:** `codart` (obbligatorio), `magaz`, `fase` opzionali
- **Tabelle:** `movord`, `testord`, `anagra`, `artico`, `__MOTIPORK`
- **Filtri:** `mo_tipork IN ('H','O','R','Y')`, `mo_flevas <> 'S'`
- **Risposta:** array righe dettaglio ordine (alt, tipo, mag, fase, date, quantità, evaso, fornitore, descrizione tipo, flag articolo)

### 7.7 `GET /ordini-rmp`

- **Query:** `codart` (obbligatorio), `fase` (se assente o `'All'` non filtra per fase)
- **Tabelle:** `ordlist`, `__MOTIPORK`, `anagra`
- **Filtro tipi:** `ol_tipork IN ('H','O','R','Y')` — aggregazione per documento/riga con `MIN(ol_datcons)`, `SUM(ol_quant)`, badge testuale `conf_gen` (Confermato / Generato da `ol_stato`)
- **Risposta:** array di righe aggregate RMP

### 7.8 `GET /ordini-padre`

- **Query:** `codart`, `magaz`, `fase` (ultimi due opzionali)
- **Tabelle:** `movord` (self-join figlio→padre via `mo_*or`), `testord`, `anagra`, `artico`, `__MOTIPORK`
- **Condizione:** `mop.mo_flevas = 'C'` (ordine padre in corso)
- **Risposta:** righe con dati figlio (componente) e colonne `padre_*` per drill-through da impegno

### 7.9 `GET /consumi/sprint/:codart`

- **Cross-DB:** `Analisi_scorte.dbo.View_100_riep`
- **Filtri:** `Codart = :codart`, `Tipo_mov IN ('Vendite', 'Scarico_prod')`
- **KPI:** R12, YTD, LYTD (date interpretate con `CONVERT(..., 103)`)
- **Trend:** ultimi 24 mesi, aggregazione mensile (`Mese` formato `yyyy-MM`, `Totale`)
- **Risposta:** `{ kpi: { R12, YTD, LYTD }, trend: [...] }`

### 7.10 `GET /consumi/marathon/:codart`

- **Storico:** `View_100_riep`, ultimi 10 anni, raggruppamento per giorno (`DataMov`, `Qta`)
- **Previsionale / futuro:** `dbo.ordlist` con `ol_tipork = 'Y'`, `ol_datcons >= oggi`, somma `ol_quant` per giorno
- **Risposta:** `{ past: [...], future: [...] }`

### 7.11 `GET /consumi/sprint-multi`

- **Query:** `codarts` — stringa CSV (max **20** codici dopo split/trim)
- **Logica:** come sprint singolo ma `Codart IN (...)` su KPI e trend 24 mesi
- **Risposta:** `{ kpi, trend }` **accorpati** su tutti i codici

### 7.12 `GET /consumi/marathon-multi`

- **Query:** `codarts` CSV (max 20)
- **Risposta:** `past` da `View_100_riep` accorpata; `future` da `ordlist` impegni futuri accorpati

### 7.13 `GET /proposta-ordini`

- **Tabelle:** `ordlist` (`ol_tipork = 'O'` ordini fornitore), join `anagra`, `artico`, `artfasi`
- **Risposta:** array di righe con campi tra cui: `fornitore_codice`, `fornitore_nome`, `ol_codart`, dati anagrafica articolo, `ol_fase`, `fase_descr`, date consegna, colli, quantità, stato, magazzino, prezzo, `dt_min_ord` (da `ol_datord`)
- **Ordinamento:** fornitore, articolo, data consegna

### 7.14 `GET /health`

- **Azione:** `SELECT 1` su pool UJET11 e pool MRP
- **Risposta OK:** `{ status: 'ok', ujet11: true, mrp: true, timestamp: ISO }`
- **Errore:** `500` con `{ status: 'error', error }`

---

## 8. MODULI FRONTEND

### 8.1 `MrpApp` — `public/js/mrp-app.js`

- **Responsabilità:** orchestrazione, stato globale, navigazione tra viste, health check all’avvio.
- **API esposte:** `init()`, `switchView(viewName)`, oggetto `state`, costante `API_BASE` (`'/api/mrp'`).
- **Interazioni:** chiama `MrpParametri.init()` al DOM ready; le altre view ricevono `switchView` e leggono `state`.
- **Pattern:** listener su `.mrp-nav-btn` per mostrare `#view-{nome}` e stato attivo pulsante; `fetch /health` in console.

### 8.2 `MrpParametri` — `public/js/mrp-parametri.js`

- **Responsabilità:** maschera frmParRMP (tre combo articolo, fase, esecuzione query progressivi).
- **Pubblico:** `init()`, `caricaFasi(codart)` (usata anche da Proposta dopo click codice).
- **Interazioni:** `MrpApp.state`, `MrpProgressivi.render(data)`, `MrpApp.switchView('progressivi')`.
- **Pattern:** debounce 250 ms sulle combo; chiusura dropdown click-outside; `URLSearchParams` con `codart`, `magaz`, `fase`, `modo`, `sintetico` verso `/progressivi`.

### 8.3 `MrpProgressivi` — `public/js/mrp-progressivi.js`

- **Responsabilità:** rendering griglia “matrioska”, split view ad albero, espansione distinta on-demand, modali ordini/RMP/padre, modale consumi con Chart.js e drill-down BI, toggle scaduti e accessibilità, copia albero.
- **Pubblico:** `render(payload)` (unico export nel `return`).
- **Stato / cache interni:** `expandFetched` (chiavi espansione già caricate), `splitSostData` (segmentazione 3-blocchi), `consumiCache`, `biState` (granularità, filtro drill, YoY, colori anno), contesto modale ordini `currentModalContext`.
- **Interazioni:** `MrpApp`, `MrpParametri` (indiretto), API `/progressivi`, `/expand`, `/ordini-*`, `/consumi/*`; event delegation su `#tblProgressivi` e tabella split MRP.
- **Pattern:** righe DOM con classi per tipo riga; righe nidificate per MRP; fetch parallelo per RMP multi-codice quando il `codart` contiene `+` (combinato).

### 8.4 `MrpProposta` — `public/js/mrp-proposta.js`

- **Responsabilità:** pannello “Gestione Lista Ordini” nella colonna destra dei parametri; raggruppamento per fornitore; refresh manuale.
- **Pubblico:** `init()` (effetto collaterale: registrazione DOMContentLoaded).
- **Interazioni:** `waitForDB` via `/health` con retry; click su `.proposta-art-codart` popola parametri, `MrpParametri.caricaFasi`, simula click `btnEsegui`; usa `MrpApp` e `MrpParametri`.
- **Pattern:** `Map` fornitore → articolo → righe; HTML costruito con template string; escape XSS (`esc`, `escAttr`).

---

## 9. FUNZIONALITÀ IMPLEMENTATE (comportamento reale UI + API)

1. **Ricerca articolo** — Tre campi con dropdown (`codart`, `codalt`, `descr`) sincronizzati alla selezione; ricerca server-side con minimo 2 caratteri (debounce).
2. **Vista Progressivi (Griglia)** — Tabella flat con articolo radice, righe magazzino/fase, totali per fase, totale cross-fase, colonne OPC/OP/IPC/IP e disp. netta; figli distinta a livello 1 con matrioska espandibile.
3. **Vista Progressivi (Esplora / Split)** — Pannello sinistro ad albero, destra scheda dettaglio + tabella MRP + pannello “Ordini & Impegni” collassabile.
4. **Espansione distinta base** — On-demand verso `/progressivi/expand`, ricorsiva per livelli; cache `expandFetched` per non rifetchare.
5. **Articoli in esaurimento + sostitutivo** — Se `ar_inesaur = 'S'` e sostitutivo trovato: blocchi esaurimento, sostitutivo, combinato (somma per mag/fase), riga generale totale; in split view due alberi e riepilogo combinato dedicato (logica in `segmentProgressiviSostitutivo` e affini).
6. **Modale ordini/impegni** — Click su riga magazzino (classe dedicata); filtro “solo questo magazzino”; supporto `codart` con `+` (richieste parallele per più codici).
7. **Modale RMP** — Click su totali; righe da `/ordini-rmp` con badge Generato/Confermato; stesso supporto codici composti.
8. **Drill-through padre** — Pulsante in modale/split che chiama `/ordini-padre` e stack “indietro” nel modale.
9. **Analisi consumi (modale BI)** — Sprint: KPI R12/YTD/LYTD + trend 24 mesi; Marathon: 10 anni + serie futura da impegni; granularità anno→giorno; confronto YoY e color picker per anni; drill-down al click; zoom rotellina sul canvas.
10. **Consumi accorpati** — Endpoint `sprint-multi` / `marathon-multi` per selezione combinata esaurimento+sostitutivo.
11. **Proposta ordini fornitori** — Lista `ol_tipork = 'O'`, raggruppata per fornitore; click codice articolo apre progressivi; caricamento dopo health con retry.
12. **Componenti scaduti** — Checkbox toolbar; classe `show-scaduti` su `body`; badge/righe `scaduto` dalla API.
13. **Accessibilità** — Checkbox “Accessibilità” (palette/alto contrasto per utenti con discromatopsia — implementato via classi CSS).
14. **Export albero** — Pulsante copia testo strutturato degli elementi visibili della griglia negli appunti.

---

## 10. STRUTTURA FILE (linee indicative, da workspace)

```
progetto/
├── server.js                     # Entry point Express (~25 righe)
├── config/
│   └── db.js                     # Pool UJET11 + MRP (~60 righe)
├── routes/
│   └── mrpRoutes.js              # Tutte le API (~1250 righe)
├── public/
│   ├── mrp.html                  # SPA unica pagina (~384 righe)
│   ├── css/
│   │   └── mrp.css               # Stili (~1006 righe)
│   └── js/
│       ├── mrp-app.js            # Orchestratore (~60 righe)
│       ├── mrp-parametri.js      # Selezione articolo (~167 righe)
│       ├── mrp-progressivi.js    # Progressivi + modali (~2340 righe)
│       └── mrp-proposta.js       # Proposta ordini (~307 righe)
```

---

## 11. TABELLE / VISTE DB UTILIZZATE DALL’APP WEB

Solo oggetti effettivamente referenziati in `mrpRoutes.js` (oltre a `SELECT 1` su MRP per health).

### UJET11 (`dbo`)

| Oggetto | Uso |
|---------|-----|
| **artico** | Anagrafica articoli (ricerca, parametri, distinta, flags esaurimento/sostitutivo, proposta) |
| **artfasi** | Fasi per articolo; descrizione fase in proposta |
| **artpro** | Progressivi magazzino (esist, prenot, ordin, impeg) |
| **tabmaga** | Descrizione magazzino; lista magazzini (`/magazzini`) |
| **ordlist** | Aggregati OPC/OP/IPC/IP per progressivi; RMP; marathon futuro; proposta ordini fornitore (`ol_tipork = 'O'`) |
| **movord** | Dettaglio righe ordine modale; join a ordine padre |
| **testord** | Testata documento per modale ordini e padre |
| **anagra** | Ragione sociale fornitore/cliente |
| **__MOTIPORK** | Decodifica tipo operazione (`cb_motipork` → `cb_modesrk`) |
| **movdis** | Distinta base (figli, quantità, validità, espandibilità) |

### Analisi_scorte (cross-database)

| Oggetto | Uso |
|---------|-----|
| **dbo.View_100_riep** | Consumi storici: colonne usate nelle query includono `Codart`, `Date`, `Qtà`, `Tipo_mov` |

---

## 12. MAPPING VALORI CHIAVE

- **`ol_tipork` (ordlist / contesto MRP):**  
  - `'O'` = Ordine fornitore (proposta lista ordini)  
  - `'H'` = Ordine produzione  
  - `'Y'` = Impegno produzione  
  - `'R'` = incluso insieme a H/O/Y in dettaglio movord e RMP aggregato  
  - `'X'` = Proposta trasferimento (presente nel dominio dati storico Access; **non** incluso nelle aggregazioni `IN ('H','O','Y')` dei progressivi in `caricaMRP`)

- **`ol_stato`:** `'S'` = Confermato; vuoto o altro = trattato come **Generato** in UI (`conf_gen`)

- **`ar_inesaur`:** `'S'` = In esaurimento; attiva il flusso sostitutivo se `ar_sostit` è valorizzato e l’anagrafica del sostitutivo esiste

- **`ar_polriord`:** In **`getPoliticaRiordino`** sono mappati testualmente solo `'M'`, `'F'`, `'L'`, `'N'`; altri valori (es. **`'G'`**) compaiono come codice grezzo nella colonna politica progressivi. Nella **vista proposta ordini** il codice **`'G'`** viene mostrato con badge testuale “A fabb” (`mrp-proposta.js`)

- **`mo_flevas`:** `'S'` = Evaso (escluso da `/ordini-dettaglio` con `<>`); `'C'` = In corso (filtro su ordini padre)

- **Disp. netta (UI):** da numerici riga: **Disponibilità + OPC − IPC − IP** (helper `dispNettaFromNumerici` nel frontend; coerente con la logica di presentazione colonne MRP)

---

## 13. STATO SVILUPPO E TODO

### Completato (verificato nel codice)

- Infrastruttura Express, static file, router `/api/mrp`, doppio pool DB, health check
- Ricerca articoli e caricamento fasi
- Progressivi con distinta (livello 0+1 iniziale + expand), matrioska in griglia
- Split view esplora + dettaglio + ordini
- Scenario esaurimento / sostitutivo / combinato + generale totale
- Modali: dettaglio ordini, RMP, drill padre
- Consumi: sprint, marathon, multi, integrazione Chart.js e interazioni BI
- Proposta ordini fornitori in pagina parametri con raggruppamento fornitore

### Non implementato o non collegato

- Parametro **`modo`** (radio Access): nessun uso in backend; non altera le query
- Parametro **`sintetico`**: inviato ma ignorato dal backend
- **`magazzino`**: campo testo in maschera; **non** collegato a `GET /magazzini` né a dropdown
- **Scorte minime** (Modulo 1 blueprint Access)
- **Analisi consumi** tipo drill Access anno→trimestre→mese per fase/articolo (oltre al BI attuale su `View_100_riep`)
- **Tempi lavorazione / cicli / terzisti** (Modulo 3)
- **Ordini produzione Tprod/Rprod** (Modulo 5)
- **Workflow operativo** su proposta ordini (accetta/rigetta righe, note, email fornitore) — oggi solo consultazione e navigazione verso progressivi

### Note per sessioni AI future

- La **fonte di verità runtime** per endpoint e shape JSON è `routes/mrpRoutes.js`; per UI è `public/mrp.html` + `mrp-progressivi.js`.
- Le sezioni **1–5** di questo documento descrivono ancora il sistema **Access / SQL originale**; le sezioni **6–13** descrivono l’**applicazione web Node** attuale.