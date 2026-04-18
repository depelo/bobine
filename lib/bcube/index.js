/**
 * lib/bcube — Anti-Corruption Layer per dbo.* di BCube (UJET11).
 *
 * Tutti i punti dell'app GB2 che leggono entità di dominio da BCube dovrebbero
 * passare di qui. Il layer:
 *  - normalizza nomi spezzati su piu colonne (ar_descr + ar_desint → nome)
 *  - traduce codici BCube usando le tabelle canoniche (_Politica)
 *  - centralizza la cache delle tabelle di lookup (immutabili nel ciclo del processo)
 *
 * Uso tipico:
 *
 *   const bcube = require('../../lib/bcube');
 *
 *   // bootstrap (in server.js, una volta sola dopo aver creato i pool)
 *   await bcube.politica.loadPolitica(poolUjet11);
 *
 *   // in un endpoint:
 *   const articolo = await bcube.articolo.findByCodart(pool, '0010862', sql);
 *   //  → { codart, descr, desint, nome, politica:{codice,nome,mode,categoria,descr}, ... }
 *
 *   // oppure se hai gia una riga grezza da una query con JOIN:
 *   const art = bcube.articolo.normalize(rigaArtico);
 */

module.exports = {
    politica: require('./politica'),
    articolo: require('./articolo'),
};
