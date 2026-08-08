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
 * Confini dei periodi: date di scadenza REALI delle promozioni, fornite
 * direttamente. `end` e' la scadenza, `start` il giorno dopo la precedente.
 *
 * NOTA SULLA GRIGLIA. Non tutte le scadenze valgono per tutte le carte: il
 * 26/06/2025 e' una scadenza "solo Oro e Platino". La griglia dei periodi e'
 * quindi l'UNIONE di tutti i confini; le carte che in quella data non hanno
 * cambiato offerta ripetono semplicemente lo stesso valore su due periodi
 * consecutivi. Il grafico a gradini lo rende senza artefatti — due valori
 * uguali di fila sono una linea orizzontale continua, senza scalino.
 *
 * Il dataset parte dal 01/01/2025; le scadenze del 2024 (29/05, 25/07 solo
 * business, 03/09, 09/10, 07/11 e 31/12 solo Blu) restano fuori copertura.
 */
/**
 * Griglia "grossolana": una colonna per ogni valore leggibile nei grafici.
 * Resta la base per le carte e le serie che nessuna fonte esterna copre.
 */
const chartPeriods = [
  ['2025-01-01', '2025-01-15'],
  ['2025-01-16', '2025-02-12'],
  ['2025-02-13', '2025-03-26'],
  ['2025-03-27', '2025-05-05'],
  ['2025-05-06', '2025-06-18'],
  ['2025-06-19', '2025-06-26'], // scadenza solo Oro e Platino
  ['2025-06-27', '2025-07-30'],
  ['2025-07-31', '2025-09-30'],
  ['2025-10-01', '2025-11-26'],
  ['2025-11-27', '2026-03-10'],
  ['2026-03-11', '2026-04-21'],
  ['2026-04-22', '2026-06-02'],
  ['2026-06-03', '2026-07-14'],
  ['2026-07-15', '2026-08-31'],
] as const;

/**
 * Griglia definitiva. Dal 27/11/2025 in poi arriva da un archivio pubblico di
 * terze parti che documenta anche le FINESTRE BREVI di raccordo — quelle in cui
 * l'offerta scende a un livello base per 7-10 giorni fra una promozione forte e
 * la successiva. I grafici di origine non le risolvono e l'elenco di scadenze
 * fornito non le contiene, perche' registrano solo le promozioni principali.
 *
 * Sono cinque finestre (27/1-5/2, 11-17/3, 22-29/4, 3-10/6, 15-22/7) e
 * spiegano anche la discrepanza vista sulle condizioni ufficiali, che datano
 * l'offerta in corso al 23 luglio e non al 15.
 */
const periods = [
  ['2025-01-01', '2025-01-15'],
  ['2025-01-16', '2025-02-12'],
  ['2025-02-13', '2025-03-26'],
  ['2025-03-27', '2025-05-05'],
  ['2025-05-06', '2025-06-18'],
  ['2025-06-19', '2025-06-26'],
  ['2025-06-27', '2025-07-30'],
  ['2025-07-31', '2025-09-30'],
  ['2025-10-01', '2025-11-26'],
  ['2025-11-27', '2026-01-26'],
  ['2026-01-27', '2026-02-05'],
  ['2026-02-06', '2026-03-10'],
  ['2026-03-11', '2026-03-17'],
  ['2026-03-18', '2026-04-21'],
  ['2026-04-22', '2026-04-29'],
  ['2026-04-30', '2026-06-02'],
  ['2026-06-03', '2026-06-10'],
  ['2026-06-11', '2026-07-14'],
  ['2026-07-15', '2026-07-22'],
  ['2026-07-23', '2026-08-31'],
] as const;

/**
 * Da quale colonna dei grafici attinge ogni periodo definitivo.
 * I periodi 2026 nati dalla suddivisione ereditano la lettura del grafico che
 * copriva l'intero intervallo: per le serie che l'archivio non documenta (Italo,
 * Payback, Payback Plus, Blu e tutti i valori del presentatore) quella lettura
 * resta l'unica osservazione disponibile, ed e' un'osservazione che copriva
 * davvero tutto lo span.
 */
const CHART_COLUMN_OF: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, // 2025: corrispondenza uno a uno
  9, 9, 9,                   // 27/11-26/1, 27/1-5/2, 6/2-10/3
  10, 10,                    // 11-17/3, 18/3-21/4
  11, 11,                    // 22-29/4, 30/4-2/6
  12, 12,                    // 3-10/6, 11/6-14/7
  13, 13,                    // 15-22/7, 23/7-31/8
];

/**
 * Indice (0-based) del periodo che scade il 26/06/2025 e le uniche carte per
 * cui quella scadenza esiste. Per tutte le altre, il valore del periodo 5 e'
 * per forza identico a quello del periodo 4: l'offerta in corso attraversava
 * quella data senza interruzioni.
 */
const ORO_PLATINO_ONLY_INDEX = 5;
const ORO_PLATINO_ONLY_CARDS = new Set(['oro', 'platino']);

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
  // Il calo da 32k a 10k era stato letto sul periodo 5, ma quella scadenza
  // (26/06/2025) vale solo per Oro e Platino: per Business e' spostato al
  // periodo 6. E' l'unica riga corretta dal vincolo invece che dall'immagine.
  business: [
    [ 37000,  50000,  3000, null], [ 37000,  50000,  3000, null], [ 37000,  50000,  3000, null],
    [ 32000,  50000,  3000, null], [ 32000,  50000,  3000, null], [ 32000,  50000,  3000, null],
    [ 10000,  30000,  3000, null], [ 10000,  25000,  3000, null], [ 10000,  22000,  3000, null],
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

/**
 * ARCHIVIO PUBBLICO 2026 — valori dell'AMICO PRESENTATO e requisiti di spesa.
 *
 * Fonte di terze parti che si e' rivelata affidabile: sull'ultimo periodo
 * combacia esattamente con le condizioni ufficiali American Express. Copre
 * pero' solo sette carte (niente Italo, Payback, Payback Plus, Blu) e solo la
 * serie dell'amico presentato: sul presentatore non dice nulla.
 *
 * Le offerte ruotano fra tre livelli ricorrenti piu' quello di fine 2025.
 * Tupla per carta: [punti, spesa richiesta].
 */
type Profile = Record<string, [number, number]>;

const P_BASE: Profile = {
  platino: [50000, 6000], oro: [15000, 2000], verde: [5000, 1000], explora: [2000, 1000],
  'platino-business': [60000, 8000], 'oro-business': [20000, 4000], business: [5000, 2000],
};
const P_MID: Profile = {
  platino: [110000, 10000], oro: [17500, 2000], verde: [5000, 1000], explora: [2000, 1000],
  'platino-business': [140000, 12000], 'oro-business': [25000, 4000], business: [5000, 2000],
};
const P_HIGH: Profile = {
  platino: [180000, 12000], oro: [35000, 4000], verde: [10000, 1000], explora: [2000, 1000],
  'platino-business': [210000, 15000], 'oro-business': [45000, 8000], business: [10000, 2000],
};
const P_LATE_2025: Profile = {
  platino: [100000, 3500], oro: [30000, 2000], verde: [10000, 1500], explora: [5000, 1500],
  'platino-business': [90000, 6000], 'oro-business': [30000, 4000], business: [10000, 3000],
};

/** Profilo e finestra di spesa per ogni periodo dal 27/11/2025 (indice 9) in poi. */
const ARCHIVE_FROM_INDEX = 9;
const ARCHIVE_SEQUENCE: { profile: Profile; months: number }[] = [
  { profile: P_LATE_2025, months: 3 }, // 27/11/2025 – 26/01/2026: unica con 3 mesi
  { profile: P_BASE, months: 6 },      // 27/01 – 05/02
  { profile: P_MID, months: 6 },       // 06/02 – 10/03
  { profile: P_BASE, months: 6 },      // 11/03 – 17/03
  { profile: P_HIGH, months: 6 },      // 18/03 – 21/04
  { profile: P_BASE, months: 6 },      // 22/04 – 29/04
  { profile: P_MID, months: 6 },       // 30/04 – 02/06
  { profile: P_BASE, months: 6 },      // 03/06 – 10/06
  { profile: P_HIGH, months: 6 },      // 11/06 – 14/07
  { profile: P_BASE, months: 6 },      // 15/07 – 22/07
  { profile: P_MID, months: 6 },       // 23/07 – 31/08
];

const ARCHIVE_SOURCE_URL =
  'https://www.frequentflyeritalia.com/american-express-promozioni-presenta-un-amico/';

const ARCHIVE_2025_SOURCE_URL =
  'https://www.frequentflyeritalia.com/american-express-promozioni-presenta-un-amico-2025/';

/**
 * CORREZIONI PUNTUALI SUL 2025 — amico presentato.
 * Chiave: indice di periodo → id carta → [punti, spesa, mesi].
 *
 * Ordine di precedenza adottato, dal piu' forte: condizioni ufficiali Amex →
 * archivio Frequent Flyer Italia → forum specializzato → lettura dei grafici.
 *
 * Periodo 2 (13/02 → 26/03/2025): la lettura dei grafici dava Platino 250k,
 * Verde 12,5k e Italo 12k. Sia l'archivio sia il forum indicano 180k per la
 * Platino, e il forum completa la riga con Verde 30k e Italo 24k. Due fonti
 * contro una lettura di pixel: vincono le fonti. Oro (100k) ed Explora (5k)
 * combaciavano gia'.
 *
 * Periodo 8 (01/10 → 26/11/2025): l'archivio conferma tutti e quattro i valori
 * gia' presenti e aggiunge la finestra di spesa, che i grafici non riportavano.
 */
const CORRECTIONS_2025: Record<number, Record<string, [number, number, number | null]>> = {
  2: {
    platino: [180000, 6000, null],
    verde: [30000, 1500, null],
    italo: [24000, 1500, null],
  },
  8: {
    platino: [125000, 6000, 3],
    oro: [35000, 2000, 3],
    verde: [10000, 1500, 3],
    explora: [5000, 1500, 3],
  },
};

/**
 * L'archivio 2025 e quello 2026 si contraddicono sulla spesa della Platino nel
 * periodo 27/11/2025 → 26/01/2026: 3.000 EUR il primo, 3.500 EUR il secondo.
 * Prevale il 2025, scritto mentre l'offerta era in corso; quello del 2026 e'
 * una tabella retrospettiva.
 */
const LATE_2025_PLATINO_SPEND = 3000;

/** Fonti puntuali per singoli periodi del 2025. */
const PERIOD_SOURCES: Record<number, { url: string; note: string }> = {
  1: {
    url: 'https://forum.finanzaonline.com/threads/amex-platino-oro-verde-italo-explora-inviti-illimitati-presentato-100k-35k-10k-6k-5k-mr-presentatore-100k-mr-scadenza-12-02-2025.2068995/',
    note: 'Offerta riportata per esteso su forum specializzato; combacia con la lettura dei grafici su tutte e cinque le carte, presentatore incluso.',
  },
  2: {
    url: 'https://forum.finanzaonline.com/threads/amex-platino-oro-verde-italo-explora-inviti-illimitati-presentato-180k-100k-30k-24k-5k-mr-presentatore-100k-mr-scadenza-26-03-2025.2071042/',
    note: 'Valori dell\'amico presentato da forum specializzato, corroborati dall\'archivio pubblico sulla Platino (180.000 punti entro il 26 marzo 2025). Sostituiscono la lettura dei grafici su Platino, Verde e Italo.',
  },
  8: {
    url: ARCHIVE_2025_SOURCE_URL,
    note: 'Archivio pubblico 2025: conferma i valori letti dai grafici per le quattro carte personali e aggiunge la finestra di spesa di 3 mesi.',
  },
};

/**
 * CORREZIONI DA FONTE UFFICIALE — ultimo periodo (23/07 → 31/08/2026).
 *
 * Il confronto con le condizioni pubblicate da American Express ha confermato
 * TUTTI i valori dell'amico presentato e TUTTI i requisiti di spesa, dieci
 * carte su dieci: la lettura dei grafici e' affidabile su quelle serie.
 *
 * Ha invece smentito cinque valori del presentatore — proprio le serie che nei
 * grafici di origine stavano schiacciate contro il fondo di un asse troncato.
 * Qui la fonte ufficiale sostituisce la lettura dell'immagine.
 *
 * Vale solo per l'ultimo periodo: per i precedenti non esiste una fonte
 * equivalente, quindi i valori del presentatore restano quelli letti dai
 * grafici, con la stessa incertezza.
 */
const OFFICIAL_LAST_PERIOD_REFERRER: Record<string, number> = {
  verde: 3500,
  italo: 2500,
  business: 3500,
  'oro-business': 20000,
  'platino-business': 60000,
  // Confermati senza modifiche: platino 50000, oro 20000, explora 1000,
  // payback 1000, payback-plus 1000.
};

const OFFICIAL_SOURCE_URL =
  'https://www.americanexpress.com/it-it/chi-siamo/legal/termes-et-conditions/presenta-un-amico/';

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

// Il vincolo strutturale sulla scadenza "solo Oro e Platino": per ogni altra
// carta l'offerta attraversava quel confine, quindi i due periodi devono per
// forza portare gli stessi numeri. Verificarlo qui evita che una lettura
// sbagliata dell'immagine entri nel dataset senza che nessuno se ne accorga.
for (const [cardId, row] of Object.entries(bonusRows)) {
  if (ORO_PLATINO_ONLY_CARDS.has(cardId)) continue;
  const before = JSON.stringify(row[ORO_PLATINO_ONLY_INDEX - 1]);
  const after = JSON.stringify(row[ORO_PLATINO_ONLY_INDEX]);
  if (before !== after) {
    throw new Error(
      `"${cardId}": il 26/06/2025 e' una scadenza solo per Oro e Platino, ` +
        `ma i periodi ${ORO_PLATINO_ONLY_INDEX - 1} e ${ORO_PLATINO_ONLY_INDEX} ` +
        `hanno valori diversi (${before} vs ${after}).`,
    );
  }
}

/**
 * Fusione delle tre fonti, in ordine di autorevolezza crescente:
 *   1. lettura dei grafici          — copre tutto, ma e' la piu' debole
 *   2. archivio pubblico 2026       — sovrascrive l'amico presentato dal 27/11/2025
 *   3. condizioni ufficiali Amex    — sovrascrivono il presentatore nell'ultimo periodo
 */
const out_periods = periods.map(([start, end], i) => {
  const offers: Record<string, unknown> = {};
  const col = CHART_COLUMN_OF[i]!;
  const isLast = i === periods.length - 1;
  const archive = i >= ARCHIVE_FROM_INDEX ? ARCHIVE_SEQUENCE[i - ARCHIVE_FROM_INDEX] : undefined;

  for (const [cardId, row] of Object.entries(bonusRows)) {
    const cell = row[col];
    if (cell === null || cell === undefined) {
      offers[cardId] = null;
      continue;
    }

    const correction = CORRECTIONS_2025[i]?.[cardId];
    const fromArchive = archive?.profile[cardId];

    let referred: Side;
    if (correction) {
      referred = bonus(correction[0], correction[1], correction[2]);
    } else if (fromArchive) {
      // L'unico punto in cui i due archivi si contraddicono.
      const spend =
        i === ARCHIVE_FROM_INDEX && cardId === 'platino' ? LATE_2025_PLATINO_SPEND : fromArchive[1];
      referred = bonus(fromArchive[0], spend, archive!.months);
    } else {
      referred = bonus(cell[0], cell[2], cell[3]);
    }

    const referrerAmount = (isLast ? OFFICIAL_LAST_PERIOD_REFERRER[cardId] : undefined) ?? cell[1];

    offers[cardId] = {
      referred,
      referrer: referrerAmount === null ? null : bonus(referrerAmount, null, null),
    };
  }

  const [rate, months, cap, referrerEur] = bluRow[col]!;
  offers['blu'] = {
    // Cashback azzerato: l'offerta esiste comunque, a valore nullo.
    referred: rate > 0 ? { type: 'rate', rate, months, spendCap: cap } : { type: 'bonus', amount: 0 },
    referrer: { type: 'bonus', amount: referrerEur },
  };

  return {
    start,
    end,
    // Le date sono quelle reali di scadenza delle promozioni, non piu' stimate.
    datesEstimated: false,
    source: isLast
      ? {
          url: OFFICIAL_SOURCE_URL,
          capturedAt: '2026-08-08',
          note: 'Condizioni ufficiali American Express: valori dell\'amico presentato e requisiti di spesa confermati per tutte le carte, valori del presentatore presi da qui.',
        }
      : archive
        ? {
            url: ARCHIVE_SOURCE_URL,
            capturedAt: '2026-08-08',
            note: 'Archivio pubblico delle offerte: valori dell\'amico presentato e requisiti di spesa. I valori del presentatore restano quelli letti dai grafici.',
          }
      : PERIOD_SOURCES[i]
        ? { ...PERIOD_SOURCES[i]!, capturedAt: '2026-08-08' }
        : {
            // Data di lettura degli screenshot. I grafici di origine dichiarano
            // dati "fino al 31 Aug 2026", ma quella e' la fine del periodo in
            // corso, non la data di lettura: capturedAt non puo' stare nel futuro.
            capturedAt: '2026-08-08',
            note: 'Importi letti dai grafici storici in formato immagine; date di scadenza dei periodi da elenco fornito.',
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
