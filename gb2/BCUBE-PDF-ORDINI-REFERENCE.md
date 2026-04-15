# RIFERIMENTO COMPLETO: Generazione PDF Ordini Fornitore BCube

**Destinatario:** IA che sviluppa GB2 (Gabriele 2.0)
**Fonte:** Analisi del codice sorgente decompilato BCube (C# / .NET) in D:\Sorgenti_BCube
**Data:** 10 Aprile 2026
**Autore:** Analisi automatica del codice decompilato BCube

---

## SCOPO DI QUESTO DOCUMENTO

Questo documento descrive in dettaglio come il gestionale BCube genera i PDF
degli ordini fornitore ("Ordine d'Acquisto"). L'obiettivo e permetterti di
replicare **fedelmente** il layout e il contenuto dei PDF BCube nel modulo
`pdfOrdine.js` di GB2, senza avere accesso diretto al codice sorgente BCube
ne al template Crystal Reports (`bsorgsor.rpt`).

Ogni informazione e classificata come:
- **CERTO** = trovato esplicitamente nel codice decompilato con riferimento file:riga
- **DEDOTTO** = ricavato indirettamente dal codice o dai PDF di esempio

---

## ERRATA CORRIGE (Verifiche su BCUBE2 del 10/04/2026)

Le seguenti correzioni sono state apportate dopo verifica diretta sul database
di produzione BCUBE2, confrontando i dati con i 4 PDF reali (ENCAPLAST 239/F,
MAOSHENG 269/F, DEALFA 276/F, PLASTOTECNICA 115/F):

| # | Errore originale | Correzione | Come verificato |
|---|-----------------|------------|-----------------|
| 1 | `( XX )` = td_codpaga | `( XX )` = **ANAGRA.an_categ** (categoria fornitore) | Confronto 4 fornitori: an_categ corrisponde perfettamente ai numeri nei PDF |
| 2 | td_imballo esiste in TESTORD | **td_imballo NON ESISTE** (228 colonne verificate) | Query INFORMATION_SCHEMA su BCUBE2 |
| 3 | td_valuta e VARCHAR | td_valuta e **SMALLINT** (0=EUR, 20=USD) | Verificato su testord + tabvalu |
| 4 | an_nazione come campo nazione | Il campo e **an_nazion1** (VARCHAR 3), ma e NULL per tutti i fornitori inclusi quelli esteri | Verificato su 4 fornitori |
| 5 | td_porto contiene la descrizione | td_porto e un **CODICE** (varchar 3). Descrizione in **TABPORT.tb_desport** | "1"=FRANCO, "3"=FRANCO C/ADD.FATT., "I"=F.O.B. WUHAN |
| 6 | "Rif. fornitore" fonte sconosciuta | Tabella **CODARFO**: caf_codarfo + caf_desnote | Match perfetto su tutti i 4 ordini |
| 7 | mo_lotto e VARCHAR | mo_lotto e **INT** | Verificato su ordine MAOSHENG |
| 8 | Distinzione Italia/Estero da td_valuta | td_valuta NON basta: fornitori TR e PAK comprano in EUR (valuta=0). Regola corretta basata su an_nazion1 + an_prov + an_pariva | Verificato su 1994 fornitori |
| 9 | Due P.IVA = due ragioni sociali | ERA UN ERRORE nel Crystal Report estero. P.IVA corretta: 03766750545. Corretto da Fabrizio | Confermato da Fabrizio |
| 10 | "GRATIS" da campo DB | TESTO FISSO hardcodato nel Crystal Report, non esiste campo imballo | Confermato dalla Design View Crystal |

**Risposte ottenute da Fabrizio (10/04/2026):**
- La doppia P.IVA era un ERRORE nel report estero, ora corretto
- Propone colonne custom HH_ in ANAGRA con ms_description per template report/email
- Ha dato accesso al Crystal Reports Designer per analisi diretta

**Report Crystal analizzati:**
- `Ujetorfo.rpt` — ordini fornitore Italia (layout completo, D.Lgs 231, shelf-life, firma)
- `Ujetorfo_ing.rpt` — ordini fornitore Italia/inglese (stesse formule di Ujetorfo)
- `Ujetorfv.rpt` — ordini fornitore estero/valuta (layout semplificato, banca da anagra)

---

## 0B. CLASSIFICAZIONE FORNITORI IT / UE / EXTRA_UE

### Analisi su 1994 fornitori (tipo F) in BCUBE2

| Categoria | Conteggio | Criterio di identificazione |
|-----------|-----------|----------------------------|
| Italiani certi | 1642 | an_nazion1 vuoto + an_prov compilata (2 char, sigla provincia) |
| Interni/Fittizi | 201 | an_nazion1 vuoto + an_prov vuota + an_pariva vuota (dogane, reparti, stabilimenti) |
| UE | 36 | an_nazion1 in lista paesi UE |
| Extra-UE | 69 | an_nazion1 in lista paesi non-UE |
| Esteri senza nazione | ~46 | an_nazion1 vuoto + an_prov vuota + citta straniera (es. MAOSHENG, SAAF) |

### Campi DB usati per la classificazione

- `an_nazion1` (VARCHAR 3): codice nazione BCube — compilato SOLO per esteri (105/1994).
  I fornitori italiani hanno SEMPRE an_nazion1 vuoto.
- `an_prov` (VARCHAR 2): sigla provincia italiana — presente per 1642 fornitori italiani.
- `an_pariva` (VARCHAR): P.IVA — 11 cifre numeriche = italiana. Formato diverso = estera.
- `an_estcodiso` (VARCHAR 3): codice ISO nazione — compilato solo per 55 fornitori UE.

### Codici nazione BCube → classificazione

**UE:** F (Francia), E (Spagna), DE (Germania), NL (Olanda), FIN (Finlandia),
L (Lussemburgo), P (Portogallo), PL (Polonia), CZ (Rep. Ceca), IRL (Irlanda), EW (Estonia)

**Extra-UE:** TR (Turchia), CH (Svizzera), PAK (Pakistan), SR (Serbia),
TN (Tunisia), USA, GB (Regno Unito post-Brexit)

### ATTENZIONE: td_valuta NON e sufficiente come criterio

Verificato su ordini reali 2024-2026: fornitori turchi (TR) e pakistani (PAK)
hanno ordini con td_valuta=0 (EUR). Solo 5 fornitori cinesi/arabi usano
td_valuta=20 (USD). Quindi la valuta cattura solo un sottoinsieme degli esteri.

### Regola di classificazione automatica (per deploy colonna)

```
SE an_nazion1 e compilata:
  SE an_nazion1 IN ('F','E','DE','NL','FIN','L','P','PL','CZ','IRL','EW',
                    'A','B','BG','HR','DK','GR','H','LT','LV','M','RO','SK','SLO','S')
    → 'UE'
  ALTRIMENTI
    → 'EXTRA_UE'

SE an_nazion1 e vuota:
  SE an_prov compilata (2 char)
    → 'IT'
  SE an_prov vuota E an_pariva vuota
    → 'IT'  (interni/fittizi — trattali come italiani)
  SE an_prov vuota E an_pariva compilata:
    SE an_pariva e 11 cifre numeriche
      → 'IT'  (P.IVA italiana)
    ALTRIMENTI
      → 'EXTRA_UE'  (P.IVA estera senza nazione compilata)
```

### Impatto sul report PDF

| Classificazione | Report Crystal | Layout |
|----------------|---------------|--------|
| IT | Ujetorfo.rpt | Intestazione completa, D.Lgs 231, shelf-life, firma, banca da testord |
| UE | Ujetorfo.rpt | Come Italia (stessi obblighi fiscali UE) |
| EXTRA_UE (EUR) | Ujetorfo.rpt | ⚠️ ANCHE extra-UE usa template IT se fattura in EUR |
| EXTRA_UE (valuta estera) | Ujetorfv.rpt | Solo ordini in USD/CNY/GBP/ecc., banca da anagra |

**⚠️ DISCRIMINANTE REALE** (verificata su BCUBE2 produzione, ordine 281/F/2026
NURTEKS TEKSTIL Turchia): la scelta del template NON è `HH_TipoReport`/`an_nazion1`
ma è la **valuta dell'ordine** (`td_valuta`):
  - `td_valuta = 0` (EUR) → Ujetorfo.rpt (IT completo)
  - `td_valuta != 0` (valuta estera) → Ujetorfv.rpt (EX semplificato)

Il nome stesso del file Crystal conferma: `Ujetorfv` = "Ordini Fornitore Valuta".
Un fornitore turco pagato in EUR riceve comunque il footer IT con shelf-life e
D.Lgs 231 (come visto su NURTEKS).

### Colonna custom proposta (da Fabrizio)

Nome: `HH_ReportLayout` (o simile con prefisso HH_)
Tipo: VARCHAR(10)
Valori: 'IT', 'UE', 'EXTRA_UE'
Default: calcolato dalla regola sopra al primo deploy
ms_description: "GB2: layout report PDF ordine fornitore (IT/UE/EXTRA_UE)"
Tabella: ANAGRA (su BCUBE2.UJET11 — attenzione: tabella condivisa con BCube!)

---

## 1. ARCHITETTURA PDF IN BCUBE

### 1.1 Stack tecnologico
- **Template report:** Crystal Reports (file `bsorgsor.rpt`, variante multi-doc `bsorgsox.rpt`) [CERTO: CLE__CRPE.cs:3085-3089]
- **Engine:** Crystal Reports .NET (CrystalDecisions.CrystalReports.Engine.dll) + wrapper legacy CRPE32 [CERTO: CLE__CRPE.cs:1-18]
- **Modello dati:** PULL model — il report contiene query SQL embedded, la connessione DB viene impostata a runtime [CERTO: CRPE_NET.cs:1245-1356]
- **Export PDF:** 3 metodi supportati [CERTO: CRPE_NET.cs:2891-3000]:
  1. Crystal Reports nativo `ExportToDisk(ExportFormatType.PortableDocFormat)`
  2. Microsoft Print to PDF (stampante virtuale)
  3. PDFCreator (stampante virtuale)

### 1.2 Flusso di chiamata
```
FRMORGSOR.tlbStampaPdf_ItemClick()          [FRMORGSOR.cs:26382]
  |
  +-> CLEORGSOR.RitornaDataTablePerStampaSuReport()  [CLEORGSOR.cs:9820]
  |     Recupera td_tipork, td_anno, td_serie, td_numord, td_scorpo, td_valuta
  |     da TESTORD per l'ordine corrente
  |
  +-> CLEORGSOR.GetQueryStampaPdf()                  [CLEORGSOR.cs:9580]
  |     oppure GetQueryStampaPdfNewMultiSel() per multi-selezione
  |     Costruisce query SQL per alimentare il report
  |
  +-> CLEORGSOR.GetOParStampaPDF()                   [CLEORGSOR.cs:9883]
  |     Crea oggetto CLE__CLDP con tutti i parametri:
  |       strPar1 = "BSORGSOR"  (identificativo report)
  |       strPar2 = formula Crystal filtro multi-doc
  |       strPar3 = formula Crystal filtro singolo doc
  |       strPar4 = query SQL multi-doc
  |       strPar5 = query SQL singolo doc
  |       strParam = "Stampa ordini"
  |       ctlPar2 = DataTable formule (name, num, str, data)
  |
  +-> FRMPDGENP (form generazione PDF)               [FRMPDGENP.cs]
        |
        +-> FRMPDGENP.AvviaStampa()                  [FRMPDGENP.cs:5046]
              |
              +-> CLE__CRPE.ReportPEInit()            [CLE__CRPE.cs:568]
              |     Carica bsorgsor.rpt (cerca prima in RptDir\Pers\, poi RptDir\)
              |     Imposta connessione SQL Server a runtime
              |     Applica Selection Formula + Formula Fields
              |
              +-> CLE__CRPE.ReportPDF()               [CLE__CRPE.cs:3626]
              |     Esporta in PDF su disco
              |
              +-> CLEPDGENP.CalcolaNomefile()          [CLEPDGENP.cs:1397]
                    Costruisce nome file con template token
```

### 1.3 Nome file PDF [CERTO: CLEPDGENP.cs:1397-2282]
Il nome file viene costruito con token sostituiti a runtime:
```
#TIPODOC + #ANNODOC + #SERIEDOC + #NUMDOC + #CONTO + #RAGSOC + #DATAELAB
```
**Esempio reale:** `OrdineForn2026F00027620017683DEALFA SRL20260403.PDF`
Dove:
- `OrdineForn` = tipo documento
- `2026` = anno
- `F` = serie
- `000276` = numero ordine (6 cifre, zero-padded)
- `20017683` = codice conto fornitore
- `DEALFA SRL` = ragione sociale
- `20260403` = data elaborazione YYYYMMDD

**Nota per GB2:** Il vostro formato attuale `OrdineForn2025A000123.pdf` e incompleto.
Mancano: codice conto, ragione sociale, data elaborazione.

---

## 2. QUERY SQL CHE ALIMENTA IL REPORT

### 2.1 Query di selezione documenti [CERTO: CLDORGSOR.cs:3048-3061]
```sql
SELECT td_tipork  AS tipork,
       td_anno    AS anno,
       td_serie   AS serie,
       td_numord  AS numero,
       td_conto   AS conto,
       td_valuta  AS valuta,
       td_scorpo  AS scorpo,
       td_codagen AS agente,
       td_coddest AS destin
FROM testord
WHERE codditt = 'UJET11'
  AND td_tipork = 'O'
  AND td_anno = 2026
  AND td_serie = 'F'
  AND td_numord = 276
ORDER BY td_valuta, td_scorpo, td_tipork, td_anno, td_serie, td_numord
```

### 2.2 Formula di selezione Crystal Reports [CERTO: CLEORGSOR.cs:9899]
Il report Crystal applica questo filtro interno per le righe:
```
{MOVORD.codditt} = 'UJET11'
AND {MOVORD.mo_stasino} <> 'N'
AND {TESTORD.td_magaz2} <> {KEYORD.ko_magaz}
AND {MOVORD.mo_anno} = |anno|
AND {MOVORD.mo_numord} = |numero|
AND {MOVORD.mo_serie} = |serie|
AND {MOVORD.mo_tipork} = |tipork|
```
**Nota per GB2:** Il filtro `mo_stasino <> 'N'` esclude righe annullate.
Il filtro `td_magaz2 <> ko_magaz` e un filtro su magazzini — probabilmente
non rilevante per voi, ma tenetelo presente.

### 2.3 Tabelle coinvolte nel report Crystal [CERTO: derivato dalle query in CLDORGSOR.cs:85-100]

Il report `bsorgsor.rpt` fa JOIN su queste tabelle:

| Tabella     | Alias/Uso        | JOIN                                                    |
|-------------|------------------|---------------------------------------------------------|
| TESTORD     | Testata ordine   | Tabella principale                                      |
| MOVORD      | Righe ordine     | codditt + mo_tipork + mo_anno + mo_serie + mo_numord    |
| KEYORD      | Chiavi ordine    | Filtro magazzino (ko_magaz)                             |
| ANAGRA      | Anagrafica forn. | td_conto = an_conto                                    |
| DESTDIV     | Dest. diverse    | td_contodest = dd_conto AND td_coddest = dd_coddest    |
| TABPAGA     | Tab. pagamenti   | td_codpaga = tb_codpaga                                |
| TABMAGA     | Tab. magazzini   | td_magaz = tb_codmaga                                  |
| COMMESS     | Commesse         | td_commeca = co_comme                                  |

---

## 3. MAPPATURA COMPLETA CAMPI PDF -> DATABASE

### 3.1 Sezione INTESTAZIONE (parte alta del PDF)

#### Blocco destinatario (colonna destra nel PDF BCube)

| Campo visualizzato           | Tabella.Colonna         | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| "Destinatario :"             | —                       | CERTO   | Label fissa                                            |
| Nome fornitore               | ANAGRA.an_descr1        | CERTO   | JOIN: td_conto = an_conto                              |
| Indirizzo                    | ANAGRA.an_indir         | CERTO   | FRMORGSOR.cs:19704                                     |
| CAP + Citta + (Prov)         | ANAGRA.an_cap, an_citta, an_prov | CERTO |                                                |
| "Fax :"                      | ANAGRA.an_faxtlx        | CERTO   | Campo fax/telex dell'anagrafica                        |
| Numero tra parentesi `( 54 )`| ANAGRA.an_categ         | VERIFICATO | Categoria fornitore. Verificato su BCUBE2: ENCAPLAST=52, PLASTOTECNICA=50, DEALFA=54, MAOSHENG=54. Match perfetto coi PDF. **NON e td_codpaga** (l'analisi originale era errata) |
| "GRATIS" (in alto a destra)  | **CAMPO INESISTENTE**   | CORRETTO   | td_imballo NON ESISTE in testord (228 colonne verificate). Probabilmente hardcodato nel template Crystal Reports. **DA CONFERMARE con Gabriele/Fabrizio** |

#### Blocco "Luogo di destinazione" (sotto il destinatario)

| Campo visualizzato           | Tabella.Colonna         | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| "Luogo di destinazione :"   | —                       | CERTO   | Label fissa                                            |
| Nome destinazione            | DESTDIV.dd_nomdest      | CERTO   | CLDORGSOR.cs:386-441, JOIN: td_contodest=dd_conto, td_coddest=dd_coddest |
| CAP + Citta + (Prov)         | DESTDIV.dd_capdest, dd_locdest, dd_provdest | DEDOTTO | Campi standard DESTDIV |
| Indirizzo destinazione       | DESTDIV.dd_inddest      | CERTO   | CLDORGSOR.cs:386-441                                   |

**ATTENZIONE:** Nel PDF DEALFA, il luogo di destinazione mostra citta "MONZA (MI)"
mentre il destinatario mostra "MONZA (MB)". Sono dati diversi: destinatario da ANAGRA,
luogo di destinazione da DESTDIV. A volte coincidono, a volte no.

#### Blocco dati azienda (colonna sinistra nel PDF BCube)

| Campo                        | Fonte                   | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| Logo U.Jet                   | File immagine           | CERTO   | Caricato da oApp.ImgDir (CLE__CRPE.cs:73)              |
| Nome azienda                 | Hardcodato nel .rpt     | DEDOTTO | "U. Jet  s.r.l."                                      |
| Indirizzo, CAP, citta        | Hardcodato nel .rpt     | DEDOTTO | Due versioni: con PEC/Website/SDI (Italia) e senza (estero) |
| Tel, Fax                     | Hardcodato nel .rpt     | DEDOTTO |                                                        |
| Mail, PEC, Website           | Hardcodato nel .rpt     | DEDOTTO | Solo versione "Italia"                                 |
| Cap.Soc., REA, Registro      | Hardcodato nel .rpt     | DEDOTTO | Due versioni diverse nei PDF                           |
| Codice SDI                   | Hardcodato nel .rpt     | DEDOTTO | "1N74KED" — solo versione "Italia"                     |

**SCOPERTA IMPORTANTE — Due versioni di intestazione azienda:**
Dai PDF di esempio emergono DUE layout distinti:

**Versione A (Italia — DEALFA e PLASTOTECNICA):**
```
U. Jet s.r.l.
via san Francescuccio de' Mietitori, 32
06083 Bastia Umbra (PG)
Tel: (075) 8004025 r.a. - Fax: (075) 8004180
Mail: info@ujet.it
PEC: ujet.pec@pec.it
Website: www.ujet.it
Cap.Soc. Eur 200.000 i.v. - R.E.A. PG n. 312389
Registro Imprese di Perugia, P.IVA e Cod. Fisc. IT 03766750545
Codice destinatario univoco (SDI): 1N74KED
```

**Versione B (Estero — MAOSHENG):**
```
U. Jet s.r.l.
Via San Francescuccio de' Mietitori, 32
06083 BASTIA UMBRA (PG)
Tel.: (075) 8004025 r.a. - Fax (075) 8004180

Cap.Soc. Eur 93.600 i.v. - R.E.A. PG n. 137849
Registro Imprese di Perugia, P.IVA e Cod. Fisc. IT 01388750547
Meccanografico PG 002092 - C/C Post. 12731063
```

[VERIFICATO] Il campo nazione in ANAGRA si chiama an_nazion1 (varchar 3), NON an_nazione.
Pero per tutti e 4 i fornitori analizzati (incluso MAOSHENG, cinese) an_nazion1 e NULL.
Anche an_estcodiso (codice ISO) e NULL per tutti. Quindi la distinzione Italia/Estero
probabilmente si basa sulla VALUTA dell'ordine (td_valuta: 0=EUR, altro=Estero).
Verificato: MAOSHENG ha td_valuta=20 (USD), gli altri hanno td_valuta=0 (EUR).
Notare che cambiano anche: Cap.Soc., P.IVA, REA, e vengono rimossi Mail/PEC/Website/SDI.
Le due intestazioni sembrano riferirsi a DUE RAGIONI SOCIALI DIVERSE della stessa azienda.
**DA CONFERMARE con Gabriele/Fabrizio.**

### 3.2 Sezione TITOLO E METADATI

#### Titolo ordine

| Campo                        | Tabella.Colonna         | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| "Ordine d'Acquisto n. XXX/F del DD/MM/YYYY" | TESTORD.td_numord, td_serie, td_datord | CERTO | CLEORGSOR.cs:9580 |
| "Rif. / Ref."                | TESTORD.td_riferim      | CERTO   | FRMORGSOR.cs:19768 — campo testo libero max 50 char    |

#### Griglia metadati (sotto il titolo)

| Campo PDF                    | Tabella.Colonna         | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| "conto"                      | TESTORD.td_conto        | CERTO   | Codice numerico fornitore (es. 20017683)               |
| "pagamento / terms"          | TABPAGA.tb_despaga      | CERTO   | JOIN: td_codpaga = tb_codpaga. Es: "RI.BA. 60 GG. F.M." |
| "banca d'appoggio / bank"    | TESTORD.td_banc1        | CERTO   | FRMORGSOR.cs:19704 — Testo libero 50 char. Es: "INTESA SANPAOLO SPA - MONZA" |
| "spedizione a mezzo del"     | (label fissa)           | CERTO   | Solo etichetta, il valore e vuoto nei PDF di esempio   |
| "vettore"                    | TESTORD.td_vettor       | CERTO   | Codice vettore, FK a tabella codici 304 per descrizione |
| "porto"                      | TESTORD.td_porto → TABPORT.tb_desport | VERIFICATO | td_porto e un CODICE (varchar 3): "1"=FRANCO, "3"=FRANCO C/ADD.FATT., "I"=F.O.B. WUHAN. JOIN: td_porto = tb_codport su tabport |
| "valuta"                     | TESTORD.td_valuta → TABVALU.tb_nomvalu | VERIFICATO | td_valuta e SMALLINT (codice numerico): 0=EUR, 20=USD. Descrizione estesa in tabvalu.tb_nomvalu ("Euro", "Dollaro Usa"). Nel PDF il totale mostra tb_desvalu ("EUR", "USD") |
| "imballo / packaging"        | **CAMPO INESISTENTE**   | CORRETTO | td_imballo NON ESISTE. Probabilmente hardcodato nel Crystal Reports |

**Nota per GB2:** La colonna "banca d'appoggio" e la piu vistosamente mancante
nel vostro PDF attuale. E un campo di TESTORD (td_banc1), NON dell'anagrafica.
Viene copiata dall'anagrafica al momento della creazione ordine ma poi e
indipendente. La vostra SP gia inserisce td_banc1 e td_banc2 da anagra.

#### Etichette colonne tabella (variano per versione Italia/Estero)

**Versione Italia:**
```
Cod.articolo | Descrizione   | UM   | Quantita  | Prezzo     | Sconti   | Data Spedizione | Note
Our Code     | Description   | Unit | Quantity  | Unit Price | Discount | Shipping Date   | Remarks
```

**Versione Estero:**
```
Cod.articolo | Descrizione   | UM   | Q.ta      | Prezzo     | Sconti   | Cons.           | Note
Our Code     | Description   | Unit | Quantity  | Unit Price | Disc.    | Deliv.time      | Remarks
```

[DEDOTTO] La differenza e nel Crystal Report che usa formule condizionali per
cambiare le etichette delle colonne in base alla nazionalita/valuta.

### 3.3 Sezione TABELLA ARTICOLI (righe ordine)

| Campo PDF                    | Tabella.Colonna         | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| Codice articolo              | MOVORD.mo_codart        | CERTO   |                                                        |
| Descrizione (riga 1)         | MOVORD.mo_descr         | CERTO   | Descrizione principale articolo                        |
| Descrizione (righe aggiunt.) | MOVORD.mo_desint        | CERTO   | Descrizione integrativa, sotto la principale           |
| Ulteriori righe descrizione  | (vedi sotto)            | DEDOTTO | Testo aggiuntivo come specifiche tecniche              |
| UM                           | MOVORD.mo_unmis         | CERTO   | Es: PZ, MQ                                            |
| Quantita                     | MOVORD.mo_quant         | CERTO   | Formato: 10.000,00 (separatore migliaia punto, decimali virgola) |
| Prezzo                       | MOVORD.mo_prezzo        | CERTO   | 4 decimali. Formato: 0,0383                           |
| Sconti                       | MOVORD.mo_scont1 .. mo_scont6 | CERTO | Fino a 6 livelli sconto. FRMORGSOR.cs form binding |
| Data Spedizione              | MOVORD.mo_datcons       | CERTO   | Data consegna per riga. Formato: DD/MM/YYYY            |
| N.B. (note riga)             | MOVORD.mo_note          | CERTO   | CLDORGSOR.cs riferimenti a td_note/mo_note. Appare sotto la descrizione nella cella |
| "Riferimenti fornitore:"     | CODARFO.caf_codarfo + caf_desnote | VERIFICATO | Tabella CODARFO: caf_codarfo = codice art. fornitore, caf_desnote = note confez. JOIN: caf_conto=fornitore, caf_codart=articolo. Verificato: art 0062938 x DEALFA → "GA02D027" + "crt. 2000 pz." |
| "LOT" (lotto)                | MOVORD.mo_lotto         | CERTO   | Visibile nel PDF estero: "LOT 360411163"               |

#### Campo "Riferimenti fornitore" — RISOLTO

[VERIFICATO su BCUBE2] La tabella e **CODARFO** (CODice ARticolo FOrnitore):

```
codditt       VARCHAR(12)   Codice ditta ('UJET11')
caf_conto     INT           Codice fornitore (FK -> anagra.an_conto)
caf_codart    VARCHAR(50)   Codice articolo interno
caf_codarfo   VARCHAR(50)   Codice articolo del fornitore
caf_desnote   VARCHAR(50)   Note confezionamento
```

JOIN: `codditt='UJET11' AND caf_conto = fornitore AND caf_codart = articolo`

**Verifiche eseguite:**
- Art 0062938 x DEALFA(20017683) → codarfo="GA02D027", desnote="crt.  2000  pz." ✓
- Art 0072050 x DEALFA(20017683) → codarfo="ME1SF555", desnote=null ✓
- Art 0073279 x DEALFA(20017683) → codarfo="ME5S0785", desnote=null ✓
- Art 0066512 x ENCAPLAST(20011361) → codarfo="7549211868", desnote="conf. pz. 250" ✓

Tutti corrispondono esattamente ai PDF. Nel PDF il campo appare come:
`Riferimenti fornitore: {caf_codarfo}    {caf_desnote}`

#### Campo "LOT" (lotto)

[VERIFICATO] Nel PDF estero (MAOSHENG) ogni riga mostra "LOT 360411163".
Il campo e MOVORD.mo_lotto (tipo INT, non VARCHAR). Verificato su BCUBE2:
ordine 269/F/2026 (MAOSHENG) ha lotti 360411163, 360411173, ..., 360411263.
I lotti sono numerici progressivi assegnati da BCube alla creazione dell'ordine.

### 3.4 Sezione NOTE E TOTALE (parte bassa del PDF)

| Campo PDF                    | Tabella.Colonna         | Stato   | Note                                                   |
|------------------------------|-------------------------|---------|--------------------------------------------------------|
| "note / remarks"             | TESTORD.td_note         | CERTO   | CLDORGSOR.cs:1346,1354. Es: "TELEFONARE AL PRONTO"    |
| "totale ordine"              | Calcolato               | CERTO   | Somma di (mo_quant * mo_prezzo) per tutte le righe     |
| Simbolo valuta + totale      | TESTORD.td_valuta       | CERTO   | Es: "EUR 1.377,73" oppure "USD 50.440,00"              |
| "Distinti saluti / Regards"  | —                       | CERTO   | Testo fisso                                            |
| Nome azienda                 | —                       | CERTO   | "U.Jet s.r.l." oppure "U.JET s.r.l." (varia)          |
| Nome firmatario              | Formula Crystal o campo | DEDOTTO | "Pietro Tardioli" — potrebbe essere da impostazione    |
| Firma autografa              | Immagine nel .rpt       | CERTO   | Immagine PNG/JPG della firma, solo versione Italia     |
| "Mod. 105/2"                 | —                       | CERTO   | Codice modulo fisso, in basso a sinistra ogni pagina   |

#### Note legali — Due versioni

**Versione Italia (DEALFA, PLASTOTECNICA):**
```
SI AVVERTE CHE, QUALORA QUESTO ORDINE NON VENISSE CONFERMATO ENTRO 8 GIORNI
DALLA DATA DI INVIO, SI CONSIDERANO ACCETTATE TUTTE LE CONDIZIONI IN ESSO
CONTENUTE.
IMPORTANTE: Indicare sempre il numero d'ordine sia in fattura che nelle bolle
di consegna.
P.O. Number must be indicated on invoice - delivery note.

Per i dispositivi in ordine si chiede di inviare lotti preferibilmente univoci,
tassativamente con il massimo di residuo di vita, quantomeno mai inferiore ai
2/3 della sua shelf-life.

Il fornitore dichiara di conoscere il contenuto del Decreto Legislativo 8 giugno
2001 n. 231 [...]
```

**Versione Estero (MAOSHENG):**
```
SI AVVERTE CHE, QUALORA CODESTO ORDINE NON VENISSE CONFERMATO ENTRO 8 GIORNI
DALLA DATA DI INVIO, TUTTE LE CONDIZIONI IN ESSO CONTENUTE SI CONSIDERANO
ACCETTATE.
IMPORTANTE: Indicare sempre il numero d'ordine sia in fattura che nelle bolle
di consegna.
P.O. Number must be indicated on invoice - delivery note.
INVIARE FATTURA IN DUPLICE COPIA.
```

[DEDOTTO] La versione estero:
- Usa "CODESTO" invece di "QUESTO"
- NON include il paragrafo shelf-life
- NON include il paragrafo D.Lgs. 231/2001
- Aggiunge "INVIARE FATTURA IN DUPLICE COPIA"

### 3.5 Paginazione multi-pagina

[CERTO da PDF esempio] Il PDF MAOSHENG ha 3 pagine. Su OGNI pagina viene
ristampato:
- Header completo (logo + dati azienda + destinatario)
- Titolo ordine con numero e data
- Griglia metadati (conto, pagamento, porto, valuta, ecc.)
- Header colonne tabella articoli

Questo e il comportamento standard di Crystal Reports (Page Header ripetuto).

**Nota per GB2:** Il vostro `pdfOrdine.js` attuale NON ristampa l'header sulle
pagine successive. Quando fate `doc.addPage()` alla riga 281, dovreste richiamare
la funzione di rendering header + intestazione tabella prima di continuare con
le righe.

---

## 4. ANALISI GAP — COSA MANCA IN GB2

### 4.1 Campi mancanti nella stored procedure `usp_CreaOrdineFornitore`

La SP gia inserisce correttamente in TESTORD:
- td_banc1, td_banc2, td_codbanc (banca) ✓
- td_codpaga (pagamento) ✓
- td_porto ✓
- td_abi, td_cab ✓

**Ma il Resultset 1 (ritorno per il PDF) NON restituisce questi campi:**

| Campo necessario per PDF     | Presente nel resultset? | Azione richiesta                                       |
|------------------------------|------------------------|--------------------------------------------------------|
| Banca d'appoggio (td_banc1)  | NO                     | Aggiungere al SELECT del resultset 1                   |
| Codice pagamento (td_codpaga)| SOLO come @forn_codpag | Gia presente come `pagamento_codice`, OK               |
| Riferimento (td_riferim)     | NO                     | Non inserito dalla SP. Aggiungere campo e parametro?   |
| Vettore (td_vettor)          | NO                     | Non inserito dalla SP. Aggiungere se necessario        |
| Imballo                      | N/A                    | td_imballo NON ESISTE in testord. "GRATIS" e hardcodato nel Crystal |
| Note testata (td_note)       | NO                     | Non inserito dalla SP. Aggiungere campo e parametro    |
| Valuta descrizione           | NO                     | Il resultset dice solo td_valuta code, non descrizione |
| Luogo destinazione           | NO                     | JOIN a DESTDIV non fatto                               |

**Il Resultset 2 (righe) NON restituisce:**

| Campo necessario per PDF     | Presente nel resultset? | Azione richiesta                                       |
|------------------------------|------------------------|--------------------------------------------------------|
| Note riga (mo_note)          | NO                     | Aggiungere al SELECT del resultset 2                   |
| Lotto (mo_lotto)             | NO                     | Aggiungere al SELECT del resultset 2                   |
| Sconti (mo_scont1..6)        | NO                     | Aggiungere se si gestiscono sconti                     |
| Rif. fornitore               | NO                     | Tabella CODARFO: JOIN su caf_conto + caf_codart → caf_codarfo + caf_desnote |

### 4.2 Campi mancanti nella route GET /ordine-pdf/:anno/:serie/:numord

La query inline in gb2Routes.js:2682-2696 NON legge:

| Campo              | Come aggiungerlo                                              |
|--------------------|---------------------------------------------------------------|
| td_banc1           | Aggiungere `t.td_banc1 AS banca_appoggio` al SELECT          |
| td_riferim         | Aggiungere `t.td_riferim AS riferimento` al SELECT            |
| td_note            | Aggiungere `t.td_note AS note_ordine` al SELECT               |
| td_valuta          | Aggiungere `t.td_valuta AS valuta` al SELECT                  |
| imballo            | NON ESISTE in testord — hardcodare "GRATIS" nel PDF           |
| td_vettor          | Aggiungere `t.td_vettor` + JOIN per descrizione               |
| Dest. diversa      | LEFT JOIN destdiv + campi dd_nomdest, dd_inddest, dd_locdest  |

La query righe in gb2Routes.js:2719-2724 NON legge:

| Campo              | Come aggiungerlo                                              |
|--------------------|---------------------------------------------------------------|
| mo_note            | Aggiungere `mo_note` al SELECT                                |
| mo_lotto           | Aggiungere `mo_lotto` al SELECT                               |
| mo_scont1..mo_scont6 | Aggiungere se necessario                                    |

### 4.3 Differenze di layout nel pdfOrdine.js

| # | Differenza                          | Dettaglio                                                |
|---|-------------------------------------|----------------------------------------------------------|
| 1 | **Layout invertito**                | BCube: logo+azienda a SX, destinatario a DX. Voi: invertito |
| 2 | **Nessun logo**                     | BCube ha il logo U.Jet in alto a sinistra                |
| 3 | **Manca luogo di destinazione**     | BCube ha un box separato "Luogo di destinazione" da DESTDIV |
| 4 | **Manca banca d'appoggio**          | Campo testuale td_banc1, molto visibile nel PDF BCube    |
| 5 | **Manca Rif./Ref.**                 | Campo riferimento td_riferim                             |
| 6 | **Manca vettore**                   | Campo td_vettor con descrizione                          |
| 7 | **Manca imballo**                   | Sempre "GRATIS" nel BCube                                |
| 8 | **Manca numero cod. pagamento**     | Il `( 54 )` accanto al nome fornitore                    |
| 9 | **Manca colonna Note/Remarks**      | BCube ha una colonna note nella tabella articoli         |
| 10| **Manca campo N.B. per riga**       | Sotto ogni articolo, BCube mostra note specifiche        |
| 11| **Manca "Riferimenti fornitore"**   | Codice articolo del fornitore sotto ogni riga            |
| 12| **Manca valuta nel totale**         | BCube mostra "EUR 1.377,73" non solo "1.377,73"          |
| 13| **Manca note ordine**              | Campo libero per note personalizzate (es. "TELEFONARE AL PRONTO") |
| 14| **Manca firma autografa**           | BCube ha un'immagine della firma                         |
| 15| **Header non ripetuto su pag. 2+** | BCube ristampa l'intero header su ogni pagina            |
| 16| **Manca versione estero**           | Layout diverso per fornitori esteri (intestazione + note legali) |
| 17| **Separazione righe tabella**       | BCube ha bordi riquadro, voi avete solo linee sottili    |

---

## 5. TABELLE DATABASE DETTAGLIATE

### 5.1 TESTORD — Colonne rilevanti per il PDF [CERTO: CLDORGSOR.cs e FRMORGSOR.cs]

```
codditt         VARCHAR     Codice ditta ('UJET11')
td_tipork       VARCHAR(1)  Tipo documento ('O' = ordine fornitore)
td_anno         SMALLINT    Anno
td_serie        VARCHAR(3)  Serie (es. 'F')
td_numord       INT         Numero ordine progressivo
td_conto        INT         Codice fornitore (FK -> anagra.an_conto)
td_datord       DATETIME    Data ordine
td_datcons      DATETIME    Data consegna prevista
td_codpaga      SMALLINT    Codice condizioni pagamento (FK -> tabpaga.tb_codpaga)
td_porto        VARCHAR     Porto/resa (es. 'FRANCO', 'F.O.B. WUHAN')
td_valuta       SMALLINT    Codice valuta numerico (0=EUR, 20=USD, FK -> tabvalu.tb_codvalu)
td_scorpo       VARCHAR     Scorporo
td_riferim      VARCHAR(50) Riferimento ordine (campo "Rif. / Ref.")
td_banc1        VARCHAR(50) Banca appoggio - descrizione (es. "INTESA SANPAOLO SPA - MONZA")
td_banc2        VARCHAR(50) Banca appoggio - filiale
td_codbanc      SMALLINT    Codice banca
td_abi          INT         Codice ABI
td_cab          INT         Codice CAB
td_vettor       INT/VARCHAR Codice vettore (FK -> tabella 304)
td_imballo      **NON ESISTE** — il "GRATIS" nel PDF e probabilmente hardcodato nel Crystal Report
td_spediz       VARCHAR     Spedizione a mezzo di
td_note         TEXT/VARCHAR Note testata ordine (campo "note / remarks")
td_codagen      INT         Codice agente
td_coddest      INT         Codice destinazione diversa (FK -> destdiv.dd_coddest)
td_contodest    INT         Conto destinazione (FK -> destdiv.dd_conto)
td_magaz        SMALLINT    Magazzino principale
td_magaz2       SMALLINT    Magazzino secondario
td_commeca      VARCHAR     Commessa
td_totmerce     MONEY       Totale merce
td_totlordo     MONEY       Totale lordo
td_totdoc       MONEY       Totale documento
td_flevas       VARCHAR(1)  Flag evasione ('N'=no, 'S'=si, 'C'=completo)
td_flstam       VARCHAR(1)  Flag stampato ('N'=no, 'S'=si)
td_tipobf       INT         Tipo bolla/fattura
td_blocco       VARCHAR(1)  Bloccato
td_sospeso      VARCHAR(1)  Sospeso
```

### 5.2 MOVORD — Colonne rilevanti per il PDF [CERTO]

```
codditt         VARCHAR     Codice ditta
mo_tipork       VARCHAR(1)  Tipo documento ('O')
mo_anno         SMALLINT    Anno
mo_serie        VARCHAR(3)  Serie
mo_numord       INT         Numero ordine
mo_riga         INT         Numero riga
mo_codart       VARCHAR(50) Codice articolo interno
mo_descr        VARCHAR     Descrizione articolo
mo_desint       VARCHAR(40) Descrizione integrativa
mo_unmis        VARCHAR(3)  Unita di misura (PZ, MQ, etc.)
mo_quant        DECIMAL     Quantita ordinata
mo_prezzo       DECIMAL     Prezzo unitario (4 decimali)
mo_valore       MONEY       Valore riga (quant * prezzo)
mo_datcons      DATETIME    Data consegna riga
mo_scont1..6    DECIMAL     Sconti (fino a 6 livelli)
mo_note         TEXT/VARCHAR Note specifiche per riga (campo "N.B.")
mo_lotto        INT         Codice lotto (numerico, es. 360411163)
mo_stasino      VARCHAR(1)  Stato riga ('S'=attiva, 'N'=annullata)
mo_codiva       SMALLINT    Codice IVA
mo_fase         SMALLINT    Fase di produzione
mo_magaz        SMALLINT    Magazzino
mo_controp      INT         Conto partita (FK)
mo_contocontr   INT         Conto contropartita
mo_flevas       VARCHAR(1)  Flag evasione riga
```

### 5.3 ANAGRA — Colonne usate [CERTO]

```
an_conto        INT         Codice conto (PK)
an_descr1       VARCHAR     Ragione sociale
an_indir        VARCHAR     Indirizzo
an_cap          VARCHAR     CAP
an_citta        VARCHAR     Citta
an_prov         VARCHAR     Provincia
an_nazion1      VARCHAR(3)  Nazione (ATTENZIONE: NULL per tutti i fornitori verificati, anche esteri)
an_estcodiso    VARCHAR(3)  Codice ISO nazione (anche questo NULL per tutti i fornitori verificati)
an_categ        SMALLINT    Categoria fornitore — e il numero ( XX ) mostrato nel PDF accanto al destinatario
an_faxtlx       VARCHAR     Fax
an_email        VARCHAR     Email
an_pariva       VARCHAR     Partita IVA
an_codpag       SMALLINT    Codice pagamento default
an_porto        VARCHAR     Porto default
an_banc1        VARCHAR     Banca default
an_banc2        VARCHAR     Filiale banca default
an_abi          INT         ABI default
an_cab          INT         CAB default
an_codbanc      SMALLINT    Codice banca default
```

### 5.4 DESTDIV — Destinazioni diverse [CERTO: CLDORGSOR.cs:386-441]

```
codditt         VARCHAR     Codice ditta
dd_conto        INT         Codice conto
dd_coddest      INT         Codice destinazione
dd_nomdest      VARCHAR     Nome destinazione
dd_inddest      VARCHAR     Indirizzo destinazione
dd_locdest      VARCHAR     Localita
dd_capdest      VARCHAR     CAP
dd_provdest     VARCHAR     Provincia
```
JOIN: `testord.td_contodest = destdiv.dd_conto AND testord.td_coddest = destdiv.dd_coddest`

### 5.5 TABPAGA — Tabella pagamenti [CERTO: CLDORGSOR.cs:191]

```
tb_codpaga      SMALLINT    Codice pagamento (PK)
tb_despaga      VARCHAR     Descrizione (es. "RI.BA. 60 GG. F.M.")
```
JOIN: `testord.td_codpaga = tabpaga.tb_codpaga`

**Nota:** nella vostra route usate `tb_descr` come alias ma nel BCube il campo
si chiama `tb_despaga`. Verificate quale nome esiste nel vostro DB.

### 5.6 TABVALU — Tabella valute [VERIFICATO]

```
tb_codvalu      SMALLINT    Codice valuta numerico (PK, es. 0, 20)
tb_desvalu      VARCHAR     Sigla breve (es. 'EUR', 'USD') — usata nel totale PDF
tb_nomvalu      VARCHAR(20) Nome esteso (es. 'Euro (prima EU)', 'Dollaro Usa') — usato come label "valuta" nel PDF
tb_ndec         SMALLINT    Numero decimali (2 per EUR e USD)
```
JOIN: `testord.td_valuta = tabvalu.tb_codvalu`
Valori noti: 0=EUR, 20=USD.

### 5.7 TABPORT — Tabella porto/resa [VERIFICATO]

```
codditt         VARCHAR(12) Codice ditta
tb_codport      VARCHAR(3)  Codice porto (PK, es. '1', '3', 'I')
tb_desport      VARCHAR     Descrizione (es. 'FRANCO', 'FRANCO C/ADD.FATT.', 'F.O.B. WUHAN')
```
JOIN: `testord.td_porto = tabport.tb_codport`

### 5.8 CODARFO — Cross-reference articolo/fornitore [VERIFICATO]

```
codditt         VARCHAR(12) Codice ditta ('UJET11')
caf_conto       INT         Codice fornitore (FK -> anagra.an_conto)
caf_codart      VARCHAR(50) Codice articolo interno
caf_codarfo     VARCHAR(50) Codice articolo del fornitore
caf_desnote     VARCHAR(50) Note confezionamento (es. 'crt. 2000 pz.', 'conf. pz. 250')
```
JOIN: `codditt='UJET11' AND caf_conto = td_conto AND caf_codart = mo_codart`
Nel PDF appare come: "Riferimenti fornitore: {caf_codarfo}    {caf_desnote}"

---

## 6. FORMULE CRYSTAL REPORTS — LOGICA BUSINESS COMPLETA

Estratte dal Crystal Reports Designer il 10/04/2026 (Ujetorfo_ing.rpt).
File completo con commenti: `Gabriele2.0/temp/formule crystall ujetfor_ing.txt`

### 6.0 Riepilogo formule e loro scopo

| Formula | Scopo | Logica sintetica |
|---------|-------|------------------|
| @ABICAB | Banca appoggio | `td_banc1 + ' - ' + td_banc2` |
| @CATEGORIA | Warning categoria | Se `an_categ=0` → "CATEGORIA FORNITORE ERRATA", altrimenti vuoto. Il numero `( XX )` usa direttamente `an_categ` |
| @CITTAPROV | Indirizzo fornitore | `CAP CITTA (PROV)` — omette provincia se vuota |
| @CodAlt | Codice alternativo | `artico.ar_codalt` tra parentesi, vuoto se "D" o vuoto |
| @CODARFO | Cod. articolo fornitore (breve) | `"Cod.vostro: " + caf_codarfo` se presente |
| @CodArt | Codice articolo | `mo_codart`, vuoto se "D" (riga descrizione libera) |
| @CONTO | Verifica fornitore | Confronta col listino: se mismatch → "FORNITORE NON CORRETTO" |
| @Conver | Fattore conversione UM | `"1 PZ = 2000 MQ"` se UM ordine ≠ UM base. Usa `artico.ar_conver` |
| @Data | Data consegna riga | `mo_datcons` formattata DD/MM/YYYY, vuota per righe "D" |
| @DD1CITTAPROV | CAP+Citta dest. diversa 1 | Da `destdiv.dd_capdest, dd_locdest, dd_prodest` |
| @DD2CITTAPROV | CAP+Citta dest. diversa 2 | Da `destdiv1.*` (seconda destinazione) |
| @DESAZ | Placeholder | Contiene solo `'prova'` — probabilmente disabilitato |
| @FAX | Fax fornitore | `an_faxtlx` con eccezione hardcoded per art "E11720" |
| @IMPORTO | Valore netto riga | `quant × prezzo × (100-sconto1)/100 × (100-sconto2)/100 × (100-sconto3)/100` |
| @IND_DEST | Indirizzo dest. diversa | `destdiv.dd_inddest` se non null |
| @INTESTDESTINAZIONE | Label destinazione | Mostra "Luogo di destinazione :" solo se @NOMDEST1 non vuoto |
| @INTESTDESTINDIV | Label dest. diversa 2 | Mostra "Destinazione diversa :" solo se @NOMDEST2 non vuoto |
| @mycodarfo | Rif. fornitore (completo) | `"Riferimenti fornitore: " + caf_codarfo` se presente |
| @NOMDEST1 | Nome dest. diversa 1 | `destdiv.dd_nomdest` se non null |
| @NOMDEST2 | Nome dest. diversa 2 | `destdiv1.dd_nomdest`, "Idem" se null |
| @NUMSERIE | Numero/Serie | `"276/F"` — `ToText(td_numord,0) + '/' + td_serie` |
| @PREZZO | Prezzo condizionale | Mostra `mo_prezzo` solo se @PREZZOINBOLLA='S' |
| @PREZZOINBOLLA | Flag prezzo visibile | Costante `'S'` (sempre visibile) |
| @QUANT | Quantita | `mo_quant` se UM coincidono, altrimenti `mo_colli` |
| @TIPODOC | Titolo ordine | `"Ordine d'Acquisto n° 276/F del 03/04/2026"` |
| @TIPORK | Tipo documento | O→"Ordine d'Acquisto", H→"Ordine di produzione", Q→"Preventivo", R→"Conferma d'Ordine", X→"Impegno di trasferimento", Y→"Impegno di produzione" |
| @TRASP | Trasporto a cura di | D→"Destinatario", V→"Vettore", M→"Mittente" |
| @UM | Unita di misura | `mo_ump` se UM coincidono, altrimenti `mo_unmis`. Vuota per righe "D" |

### 6.0.1 Scoperte importanti dalle formule

1. **Codice articolo "D"** = riga di DESCRIZIONE LIBERA (senza articolo). Molte formule la gestiscono: @CodArt, @Data, @UM, @QUANT diventano vuoti. Nel nostro PDF dobbiamo gestire questo caso.

2. **@IMPORTO usa 3 sconti in cascata** (non sommati): `quant × prezzo × (1-sc1%) × (1-sc2%) × (1-sc3%)`. La SP attuale non gestisce sconti.

3. **@QUANT usa mo_colli** quando le UM differiscono (mo_unmis ≠ mo_ump). Noi attualmente usiamo solo mo_quant.

4. **@Conver** mostra il fattore di conversione dall'articolo (`artico.ar_conver`). Campo utile da aggiungere.

5. **Righe "E11720"** hanno un trattamento speciale hardcoded (fax francese, niente destinazione). Probabilmente un caso specifico U.Jet da ignorare nel nostro PDF.

6. **@CONTO verifica il fornitore** contro una vista listini (`View_7750_Listini_per_ujetorfo`). E' un controllo di coerenza — nel nostro PDF possiamo ometterlo o replicarlo come warning.

7. **Due destinazioni diverse** supportate (destdiv + destdiv1). Il nostro PDF attualmente ne supporta solo una.

8. **"GRATIS" confermato testo fisso** nel template — non c'e nessuna formula per l'imballo.

9. **an_note + an_note2** nel footer: note del fornitore dall'anagrafica (oltre a td_note dell'ordine).

---

## 7. FORMATTAZIONE NUMERI E DATE NEI PDF BCUBE

### 6.1 Quantita [CERTO da PDF]
- Separatore migliaia: punto
- Separatore decimali: virgola
- Decimali: 2 (Italia) o 0 (Estero, es. "70.000" senza decimali)
- Esempi: `10.000,00` / `360,00` / `70.000` / `150.000`

### 6.2 Prezzi [CERTO da PDF]
- 4 decimali sempre
- Esempi: `0,0383` / `1,5387` / `0,0210`

### 6.3 Totali [CERTO da PDF]
- 2 decimali
- Con simbolo valuta PRIMA del numero
- Esempi: `EUR  1.377,73` / `USD 50.440,00`

### 6.4 Date [CERTO da PDF]
- Formato: DD/MM/YYYY
- Esempi: `20/04/2026` / `05/05/2026`

---

## 7. PRIORITA DI INTERVENTO SUGGERITE

### Alta priorita (impatto visivo immediato)
1. Invertire il layout: azienda a SX con logo, destinatario a DX
2. Aggiungere il blocco "Luogo di destinazione" da DESTDIV
3. Aggiungere la griglia metadati completa (banca, rif., vettore, imballo)
4. Aggiungere il numero pagamento `( XX )` accanto al nome fornitore
5. Aggiungere valuta al totale (es. "EUR 1.377,73")
6. Ristampare l'header completo su ogni pagina

### Media priorita (completezza dati)
7. Aggiungere colonna "Note/Remarks" alla tabella articoli
8. Aggiungere campo "N.B." sotto ogni riga articolo (da mo_note)
9. Aggiungere campo "note / remarks" testata (da td_note)
10. Supportare versione estero (layout + note legali diverse)

### Bassa priorita (finitura)
11. Aggiungere firma autografa (immagine)
12. Aggiungere logo U.Jet
13. Aggiungere "Riferimenti fornitore" per riga
14. Bordi riquadro attorno alle righe tabella
15. Campo LOT per ordini esteri

---

## 8. QUERY SQL SUGGERITE PER ARRICCHIRE I RESULTSET

### 8.1 Query testata arricchita (per route GET /ordine-pdf)
```sql
SELECT
    t.td_numord       AS numord,
    t.td_anno         AS anno,
    t.td_serie        AS serie,
    t.td_conto        AS fornitore_codice,
    t.td_datord       AS data_ordine,
    t.td_codpaga      AS pagamento_codice,
    t.td_porto        AS porto,
    t.td_valuta       AS valuta_codice,
    t.td_banc1        AS banca_appoggio,
    t.td_riferim      AS riferimento,
    t.td_note         AS note_ordine,
    -- td_imballo NON ESISTE — hardcodare 'GRATIS'
    t.td_vettor       AS vettore_codice,
    t.td_totmerce     AS totale_merce,
    t.td_totdoc       AS totale_documento,
    t.td_totdoc - t.td_totmerce AS totale_imposta,

    -- Fornitore (ANAGRA)
    a.an_descr1       AS fornitore_nome,
    a.an_indir        AS fornitore_indirizzo,
    a.an_cap          AS fornitore_cap,
    a.an_citta        AS fornitore_citta,
    a.an_prov         AS fornitore_prov,
    a.an_pariva       AS fornitore_pariva,
    a.an_email        AS fornitore_email,
    a.an_faxtlx       AS fornitore_fax,
    a.an_nazion1      AS fornitore_nazione,
    a.an_categ        AS fornitore_categ,      -- il ( XX ) nel PDF

    -- Pagamento (TABPAGA)
    p.tb_despaga      AS pagamento_descr,

    -- Porto (TABPORT)
    pt.tb_desport     AS porto_descr,

    -- Valuta (TABVALU)
    v.tb_desvalu      AS valuta_sigla,         -- 'EUR', 'USD'
    v.tb_nomvalu      AS valuta_nome,          -- 'Euro (prima EU)', 'Dollaro Usa'

    -- Destinazione diversa (DESTDIV)
    d.dd_nomdest      AS dest_nome,
    d.dd_inddest      AS dest_indirizzo,
    d.dd_capdest      AS dest_cap,
    d.dd_locdest      AS dest_citta,
    d.dd_prodest      AS dest_prov

FROM dbo.testord t
LEFT JOIN dbo.anagra  a  ON t.td_conto     = a.an_conto
LEFT JOIN dbo.tabpaga p  ON t.td_codpaga   = p.tb_codpaga
LEFT JOIN dbo.tabport pt ON t.codditt      = pt.codditt AND t.td_porto = pt.tb_codport
LEFT JOIN dbo.tabvalu v  ON t.td_valuta    = v.tb_codvalu
LEFT JOIN dbo.destdiv d  ON t.codditt      = d.codditt
                         AND t.td_contodest = d.dd_conto
                         AND t.td_coddest   = d.dd_coddest
WHERE t.codditt  = 'UJET11'
  AND t.td_tipork = 'O'
  AND t.td_anno   = @anno
  AND t.td_serie  = @serie
  AND t.td_numord = @numord
```

### 8.2 Query righe arricchita
```sql
SELECT
    mo_riga,
    mo_codart,
    mo_descr,
    mo_desint,
    mo_unmis,
    mo_quant,
    mo_prezzo,
    mo_valore,
    mo_datcons,
    mo_fase,
    mo_magaz,
    mo_note,
    mo_lotto,
    mo_scont1, mo_scont2, mo_scont3, mo_scont4, mo_scont5, mo_scont6
FROM dbo.movord
WHERE codditt   = 'UJET11'
  AND mo_tipork  = 'O'
  AND mo_anno    = @anno
  AND mo_serie   = @serie
  AND mo_numord  = @numord
  AND mo_stasino <> 'N'   -- ESCLUDI RIGHE ANNULLATE
ORDER BY mo_riga
```

---

## 9. NOTE SULLA TABELLA PAGAMENTI

**Attenzione incoerenza:** nel codice BCube la tabella si chiama `tabpaga` con
campo `tb_despaga` (CLDORGSOR.cs:191). Nella vostra SP usate due nomi diversi:
- `codpaga` con campo `cp_descr` (gb2Routes.js riga 181)
- `tabpaga` con campo `tp_descr` (fallback, riga 184)
- nella route GET usate `tabpaga` con campo `tb_descr` (riga 2707)

Verificate quale tabella e quale campo esiste realmente nel vostro DB UJET11.
Il nome corretto nel BCube e: tabella `tabpaga`, campo `tb_despaga`.

---

## 10. FILE SORGENTE BCUBE ANALIZZATI

Per riferimento, ecco i file decompilati che hanno contribuito a questa analisi:

| File                                          | Contenuto                                    |
|-----------------------------------------------|----------------------------------------------|
| D:\Sorgenti_BCube\BNORGSOR\CLEORGSOR.cs       | Business logic ordini fornitore              |
| D:\Sorgenti_BCube\BNORGSOR\CLDORGSOR.cs       | Data access layer ordini fornitore           |
| D:\Sorgenti_BCube\BNORGSOR\FRMORGSOR.cs       | Form UI ordini fornitore                     |
| D:\Sorgenti_BCube\BN__CRPE\CLE__CRPE.cs       | Wrapper Crystal Reports                      |
| D:\Sorgenti_BCube\BN__CRPE\CRPE_NET.cs        | Crystal Reports .NET wrapper                 |
| D:\Sorgenti_BCube\BNPDGENP\FRMPDGENP.cs       | Form generazione PDF                         |
| D:\Sorgenti_BCube\BNPDGENP\CLEPDGENP.cs       | Business logic generazione PDF               |
| D:\Sorgenti_BCube\BN__STD\CLE__APP.cs         | Classe applicazione (percorsi RptDir, ecc.)  |
