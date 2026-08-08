/**
 * Genera src/data/promotions.json da una tabella compatta.
 *
 * PERCHE' ESISTE QUESTO SCRIPT
 * Il dataset iniziale e' stato ricostruito leggendo tre grafici in formato
 * immagine (gli unici dati disponibili). I VALORI sono leggibili con buona
 * confidenza; le DATE dei periodi no: sono state ricostruite assumendo confini
 * di mese, ed e' per questo che ogni periodo porta datesEstimated: true.
 *
 * Questo file e' la documentazione dell'estrazione, non la fonte di verita':
 * la fonte di verita' e' il JSON generato, che da qui in avanti si aggiorna
 * a mano. Rilanciare `npm run data` SOVRASCRIVE il JSON: usarlo solo per
 * rigenerare da zero, non per aggiungere una promozione.
 *
 * Quando arriveranno le date reali: correggerle nel JSON e togliere il flag.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data/promotions.json');

/* -------------------------------------------------------------------------- */

const cards = [
  // Membership Rewards
  { id: 'platino',          name: 'Platino',          fullName: 'American Express Platino',           group: 'mr',       reward: 'mr',      color: '#8A8A8E', order: 1 },
  { id: 'oro',              name: 'Oro',              fullName: 'American Express Oro',               group: 'mr',       reward: 'mr',      color: '#B8912F', order: 2 },
  { id: 'verde',            name: 'Verde',            fullName: 'American Express Verde',             group: 'mr',       reward: 'mr',      color: '#3F7D53', order: 3 },
  { id: 'italo',            name: 'Italo',            fullName: 'American Express Italo',             group: 'mr',       reward: 'mr',      color: '#9B1B30', order: 4 },
  { id: 'explora',          name: 'Explora',          fullName: 'American Express Explora',           group: 'mr',       reward: 'mr',      color: '#7C8791', order: 5 },
  // Business
  { id: 'platino-business', name: 'Platino Business', fullName: 'American Express Platino Business',  group: 'business', reward: 'mr',      color: '#6E7276', order: 1 },
  { id: 'oro-business',     name: 'Oro Business',     fullName: 'American Express Oro Business',      group: 'business', reward: 'mr',      color: '#A07C1F', order: 2 },
  { id: 'business',         name: 'Business',         fullName: 'American Express Business',          group: 'business', reward: 'mr',      color: '#4A7C59', order: 3 },
  // Altre
  { id: 'payback',          name: 'Payback',          fullName: 'American Express Payback',           group: 'other',    reward: 'payback', color: '#1667B8', order: 1 },
  { id: 'payback-plus',     name: 'Payback Plus',     fullName: 'American Express Payback Plus',      group: 'other',    reward: 'payback', color: '#9B1B30', order: 2 },
  { id: 'blu',              name: 'Blu',              fullName: 'American Express Blu',               group: 'other',    reward: 'eur',     color: '#1B6CA8', order: 3 },
] as const;

/**
 * Confini dei periodi. RICOSTRUITI: i grafici di origine hanno tick trimestrali,
 * quindi la posizione dei punti da' il mese ma non il giorno. Assunti confini di
 * mese e contiguita' (un'offerta c'e' sempre, quindi non esistono buchi reali).
 */
const periods = [
  ['2025-01-01', '2025-01-31'],
  ['2025-02-01', '2025-02-28'],
  ['2025-03-01', '2025-03-31'],
  ['2025-04-01', '2025-04-30'],
  ['2025-05-01', '2025-05-31'],
  ['2025-06-01', '2025-06-30'],
  ['2025-07-01', '2025-08-31'],
  ['2025-09-01', '2025-10-31'],
  ['2025-11-01', '2025-12-31'],
  ['2026-01-01', '2026-02-28'],
  ['2026-03-01', '2026-04-30'],
  ['2026-05-01', '2026-06-30'],
  ['2026-07-01', '2026-07-31'],
  ['2026-08-01', '2026-08-31'],
] as const;

/**
 * Una riga per carta, una colonna per periodo.
 * Tupla: [punti invitato, punti presentatore | null, spesa | null, mesi | null]
 * `null` sull'intera cella = dato non leggibile dal grafico di origine.
 */
type Cell = [number, number | null, number | null, number | null] | null;

const bonusRows: Record<string, Cell[]> = {
  platino: [
    [180000, 100000,  4000, null], [100000, 100000,  3000, null], [250000, 100000,  6000, null],
    [120000,  90000,  3000, null], [250000, 100000,  6000, null], [100000,  50000,  3000, null],
    [120000, 100000,  3000, null], [120000, 100000,  5000, null], [125000,  35000,  6000, null],
    [110000,  50000, 10000, 6],    [180000,  50000, 12000, 6],    [110000,  50000, 10000, 6],
    [180000,  75000, 12000, 6],    [110000,  50000, 10000, 6],
  ],
  oro: [
    [ 75000,  38000,  3500, null], [ 35000,  45000,  2000, null], [100000,  50000,  3500, null],
    [ 38000,  38000,  2000, null], [ 30000,  25000,  2000, null], [ 35000,  35000,  2000, null],
    [ 38000,  38000,  2000, null], [ 38000,  38000,  2000, null], [ 35000,  15000,  2000, null],
    [ 17500,  20000,  2000, 6],    [ 36000,  20000,  4000, 6],    [ 17500,  17500,  2000, 6],
    [ 36000,  20000,  4000, 6],    [ 17500,  20000,  2000, 6],
  ],
  verde: [
    [ 30000,  20000,  1000, null], [ 10000,  25000,  1500, null], [ 12500,  20000,  1500, null],
    [ 10000,  15000,  1500, null], [ 10000,  12000,  1500, null], [ 10000,  12000,  1500, null],
    [ 10000,  12500,  1500, null], [ 10000,  12500,  1500, null], [ 10000,   8000,  1500, null],
    [  5000,   5000,  1000, 6],    [ 10000,   6500,  1000, 6],    [  5000,   5000,  1000, 6],
    [ 10000,   6500,  1000, 6],    [  5000,   5000,  1000, 6],
  ],
  italo: [
    [ 30000,   null,  1000, null], [  6000,  10000,  1500, null], [ 12000,  20000,  1500, null],
    [  6000,  10000,  1500, null], [  6000,  10000,  1500, null], [  6000,  10000,  1500, null],
    [  6000,  10000,  1500, null], [  6000,  10000,  1500, null], [  6000,  10000,  1500, null],
    [  4000,   4000,  1000, 6],    [  8000,   5000,  1000, 6],    [  4000,   3500,  1000, 6],
    [  8000,   5000,  1000, 6],    [  4000,   3500,  1000, 6],
  ],
  explora: [
    [  5000,   null,   300, null], [  5000,   null,   300, null], [  5000,   null,  1500, null],
    [  5000,   null,  1500, null], [  5000,   null,  1500, null], [  5000,   null,  1500, null],
    [  5000,   null,  1500, null], [  5000,   null,  1500, null], [  5000,   null,  1500, null],
    [  2000,   1000,  1000, 6],    [  2000,   1000,  1000, 6],    [  2000,   1000,  1000, 6],
    [  2000,   1000,  1000, 6],    [  2000,   1000,  1000, 6],
  ],
  'platino-business': [
    [500000,  50000,  6000, null], [500000,  50000,  6000, null], [250000,  50000,  6000, null],
    [250000,  50000,  6000, null], [150000,  75000,  6000, null], [150000,  75000,  6000, null],
    [150000,  75000,  6000, null], [150000,  75000,  6000, null], [125000,  75000,  6000, null],
    [140000,  50000, 12000, 6],    [205000,  50000, 15000, 6],    [140000,  50000, 12000, 6],
    [205000,  60000, 15000, 6],    [140000,  50000, 12000, 6],
  ],
  'oro-business': [
    [250000,  50000,  5000, null], [250000,  50000,  5000, null], [ 75000,  45000,  4000, null],
    [ 75000,  45000,  4000, null], [ 37000,  30000,  5000, null], [ 37000,  30000,  5000, null],
    [ 40000,  25000,  4000, null], [ 40000,  25000,  4000, null], [ 30000,  22000,  4000, null],
    [ 25000,  20000,  4000, 6],    [ 45000,  22000,  8000, 6],    [ 22000,  15000,  4000, 6],
    [ 47000,  22000,  8000, 6],    [ 25000,  18000,  4000, 6],
  ],
  business: [
    [ 37000,  50000,  3000, null], [ 37000,  50000,  3000, null], [ 37000,  50000,  3000, null],
    [ 32000,  50000,  3000, null], [ 32000,  50000,  3000, null], [ 10000,  30000,  3000, null],
    [ 10000,  25000,  3000, null], [ 10000,  22000,  3000, null], [ 10000,  20000,  3000, null],
    [  5000,   3000,  2000, 6],    [ 10000,   4000,  2000, 6],    [  5000,   3000,  2000, 6],
    [ 10000,   4000,  2000, 6],    [  5000,   3000,  2000, 6],
  ],
  payback: [
    [ 12000,   5000,  1000, null], [  2000,   5000,   500, null], [  6000,  20000,  1000, null],
    [  2000,  15000,   500, null], [  2000,   5000,   500, null], [  2000,   5000,   500, null],
    [  2000,   5000,   500, null], [  2000,   5000,   500, null], [  2000,   5000,   500, null],
    [  1000,   1000,  1000, 6],    [  1000,   1000,  1000, 6],    [  1000,   1000,  1000, 6],
    [  1000,   1000,  1000, 6],    [  1000,   1000,  1000, 6],
  ],
  'payback-plus': [
    [ 16000,   null,  1500, null], [  2000,   null,   500, null], [  2000,   null,   500, null],
    [  2000,   null,   500, null], [  2000,   null,   500, null], [  2000,   null,   500, null],
    [  2000,   null,   500, null], [  2000,   null,   500, null], [  2000,   6000,   500, null],
    [  2000,   1000,  1000, 6],    [  2000,   1000,  1000, 6],    [  2000,   1000,  1000, 6],
    [  2000,   1000,  1000, 6],    [  2000,   1000,  1000, 6],
  ],
};

/**
 * Blu premia in euro con una meccanica diversa: cashback percentuale con tetto
 * di spesa per l'invitato, accredito fisso per il presentatore.
 * Tupla: [percentuale | 0, mesi, tetto di spesa, accredito presentatore]
 */
const bluRow: Array<[number, number, number, number]> = [
  [0.05, 6, 3000,  40], [0.05, 6, 3000,  40], [0.05, 6, 3000,  80],
  [0.05, 6, 3000,  80], [0.05, 6, 3000,  40], [0.05, 6, 3000,  40],
  [0.05, 6, 3000,  40], [0.05, 6, 3000,  40], [0.05, 6, 3000,  40],
  [0.05, 6, 3000,  40], [0.05, 6, 3000,  40], [0,    6, 3000,   0],
  [0,    6, 3000,   0], [0,    6, 3000,   0],
];

/* -------------------------------------------------------------------------- */

type Side =
  | { type: 'bonus'; amount: number; spend?: { amount: number; months?: number } }
  | { type: 'rate'; rate: number; months: number; spendCap: number };

function bonus(amount: number, spend: number | null, months: number | null): Side {
  const side: Side = { type: 'bonus', amount };
  if (spend !== null) {
    side.spend = months !== null ? { amount: spend, months } : { amount: spend };
  }
  return side;
}

const out_periods = periods.map(([start, end], i) => {
  const offers: Record<string, unknown> = {};

  for (const [cardId, row] of Object.entries(bonusRows)) {
    const cell = row[i];
    offers[cardId] = cell === null || cell === undefined
      ? null
      : {
          referred: bonus(cell[0], cell[2], cell[3]),
          referrer: cell[1] === null ? null : bonus(cell[1], null, null),
        };
  }

  const [rate, months, cap, referrerEur] = bluRow[i]!;
  offers['blu'] = {
    // Cashback azzerato: l'offerta esiste comunque, a valore nullo.
    referred: rate > 0 ? { type: 'rate', rate, months, spendCap: cap } : { type: 'bonus', amount: 0 },
    referrer: { type: 'bonus', amount: referrerEur },
  };

  return {
    start,
    end,
    datesEstimated: true,
    source: {
      // Data di lettura degli screenshot. I grafici di origine dichiarano dati
      // "fino al 31 Aug 2026", ma quella e' la fine del periodo in corso, non
      // la data in cui sono stati letti: capturedAt non puo' stare nel futuro.
      capturedAt: '2026-08-08',
      note: 'Ricostruito dai grafici storici in formato immagine. Valori leggibili con buona confidenza; date dei periodi stimate assumendo confini di mese.',
    },
    offers,
  };
});

const dataset = {
  $schema: './promotions.schema.json',
  schemaVersion: 1,
  cards,
  periods: out_periods,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`Scritto ${out}: ${cards.length} carte × ${periods.length} periodi`);
