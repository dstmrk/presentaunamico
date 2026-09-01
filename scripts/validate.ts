/**
 * Valida src/data/promotions.json senza fare partire tutta la build.
 * `npm run validate` — da lanciare dopo aver aggiunto un periodo.
 */
import { periods, cards, currentPeriod } from '../src/lib/promotions.ts';
import { formatDate, formatEnd } from '../src/lib/format.ts';

// L'import sopra lancia se i dati sono incoerenti: arrivare qui significa che
// il dataset e' valido.
console.log(`✓ promotions.json valido — ${cards.length} carte, ${periods.length} periodi`);
console.log(`  copertura: ${periods[0]!.start} → ${formatEnd(periods[periods.length - 1]!.end)}`);
console.log(
  currentPeriod
    ? `  periodo corrente: ${formatDate(currentPeriod.start)} – ${formatEnd(currentPeriod.end)}`
    : `  ⚠︎ nessun periodo copre oggi: il sito mostrera' "periodo non ancora rilevato"`,
);
