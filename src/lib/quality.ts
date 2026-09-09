import { cards, currentPeriod, periods, today } from './promotions.ts';
import { maxValueOf } from './schema.ts';

const dayMs = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysBetweenInclusive = (start: string, end: string) =>
  Math.round((toTime(end) - toTime(start)) / dayMs) + 1;

function monthsBefore(iso: string, months: number): string {
  const d = new Date(toTime(iso));
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * La fascia risponde a una domanda sola: rispetto a un giorno qualsiasi
 * dell'ultimo anno, quanto vale l'offerta di oggi?
 *
 * Si misura come RANGO PERCENTILE pesato sui giorni di calendario, non come
 * scarto da una media. Il motivo e' nella forma dei dati: Amex alterna
 * settimane di "minimo" a periodi lunghi di promozione, quindi la media cade
 * in mezzo a due mode e non descrive nessuna delle due. Il rango invece dice
 * esattamente quel che serve — "meglio del 70% dei giorni" — e regge i
 * plateau, che qui sono la norma: mesi interi allo stesso identico valore.
 *
 * La finestra e' mobile a 12 mesi perche' le offerte calano nel tempo:
 * confrontare il 2026 con tutto lo storico dal 2025 marchierebbe "bassa"
 * ogni offerta per sempre, che e' vero in astratto e inutile in pratica.
 * Chi legge vuole sapere se conviene aspettare qualche settimana, non se il
 * 2025 fosse un'annata migliore.
 *
 * Il periodo in corso resta fuori dal riferimento: si confronta l'offerta di
 * oggi con quello che c'era prima, altrimenti una promozione lunga finisce
 * per giudicare se stessa e tende alla media da sola.
 */
const WINDOW_MONTHS = 12;

/** Sotto questa soglia lo storico e' troppo corto per un giudizio: meglio tacere. */
const MIN_REFERENCE_DAYS = 120;

/** Confini delle fasce ordinarie, in rango percentile. */
const LOW_RANK = 0.35;
const HIGH_RANK = 0.65;

/**
 * Gli estremi chiedono DUE condizioni insieme, ed e' questo a renderli rari.
 *
 * La prima e' ordinale: stare nel 5% di giorni peggiore o migliore dell'anno.
 * Da sola non basta, perche' in un mercato che scende ogni minimo di routine
 * e' anche un minimo storico: il rango direbbe "molto bassa" a ogni settimana
 * di magra, cioe' una volta al mese.
 *
 * La seconda e' di grandezza: distare almeno un fattore 2 dalla mediana
 * dell'anno — meta' o doppio, non "il 10% sotto la media". Cosi' "molto alta"
 * e "molto bassa" restano quel che le parole promettono, un'eccezione: sui
 * dati raccolti coprono circa un giorno su nove, contro i due giorni su tre
 * della versione precedente.
 */
const EXTREME_RANK = 0.05;
const EXTREME_FACTOR = 2;

export type QualityLevel = 'molto-bassa' | 'bassa' | 'media' | 'alta' | 'molto-alta';

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  'molto-bassa': 'molto bassa',
  bassa: 'bassa',
  media: 'media',
  alta: 'alta',
  'molto-alta': 'molto alta',
};

/**
 * Le stesse fasce riferite a piu' offerte insieme ("le offerte di oggi sono
 * ..."). Non e' il plurale meccanico di QUALITY_LABELS: al centro l'aggettivo
 * non regge il plurale e serve la locuzione.
 */
export const QUALITY_LABELS_PLURAL: Record<QualityLevel, string> = {
  'molto-bassa': 'molto basse',
  bassa: 'basse',
  media: 'nella media',
  alta: 'alte',
  'molto-alta': 'molto alte',
};

const QUALITY_SCORE: Record<QualityLevel, number> = {
  'molto-bassa': 1,
  bassa: 2,
  media: 3,
  alta: 4,
  'molto-alta': 5,
};

const QUALITY_BY_SCORE = Object.entries(QUALITY_SCORE).reduce(
  (acc, [level, score]) => acc.set(score, level as QualityLevel),
  new Map<number, QualityLevel>(),
);

export interface Quality {
  level: QualityLevel;
  label: string;
}

interface Sample {
  value: number;
  days: number;
}

/**
 * I giorni degli ultimi 12 mesi, raggruppati per valore dell'offerta. Entrano
 * solo i periodi gia' chiusi prima di oggi; di un periodo a cavallo della
 * finestra si contano i giorni dentro la finestra, non tutti.
 */
function referenceDays(cardId: string, which: 'referred' | 'referrer'): Sample[] {
  const since = monthsBefore(today, WINDOW_MONTHS);
  const out: Sample[] = [];

  for (const period of periods) {
    if (period.end === null || period.end >= today) continue;
    const offer = period.offers[cardId];
    if (!offer) continue;
    const side = offer[which];
    if (!side) continue;

    const start = period.start < since ? since : period.start;
    if (start > period.end) continue;

    out.push({ value: maxValueOf(side), days: daysBetweenInclusive(start, period.end) });
  }

  return out;
}

const totalDays = (samples: Sample[]) => samples.reduce((sum, s) => sum + s.days, 0);

/**
 * Rango percentile pesato sui giorni, con i pari contati a meta'.
 *
 * La correzione sui pari e' il pezzo che non si puo' togliere: senza, un
 * valore che copre da solo mezzo anno finirebbe a rango 0 (nessun giorno
 * sotto di lui) e verrebbe letto come il minimo storico, mentre e'
 * esattamente l'offerta normale.
 */
function weightedRank(samples: Sample[], value: number): number {
  let below = 0;
  let equal = 0;
  for (const s of samples) {
    if (s.value < value) below += s.days;
    else if (s.value === value) equal += s.days;
  }
  return (below + equal / 2) / totalDays(samples);
}

/** Mediana pesata sui giorni: il valore del giorno "di mezzo" dell'anno. */
function weightedMedian(samples: Sample[]): number {
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const half = totalDays(sorted) / 2;
  let cumulative = 0;
  for (const s of sorted) {
    cumulative += s.days;
    if (cumulative >= half) return s.value;
  }
  return sorted[sorted.length - 1]!.value;
}

/**
 * Fascia dell'offerta attuale rispetto ai 12 mesi precedenti. `null` quando
 * manca il dato, quando l'offerta e' a zero o quando lo storico e' troppo
 * corto.
 *
 * Un'offerta a zero non e' "bassa", e' fuori mercato, e come tale va
 * segnalata altrove: chiamarla bassa lascerebbe intendere che conviene
 * aspettare un rialzo. Uno storico corto non e' un giudizio prudente da
 * dare a mezza voce, e' un giudizio che non si puo' dare.
 */
export function qualityOf(
  cardId: string,
  which: 'referred' | 'referrer',
  currentValue: number | null,
): Quality | null {
  if (currentValue === null || currentValue === 0) return null;

  const samples = referenceDays(cardId, which);
  if (totalDays(samples) < MIN_REFERENCE_DAYS) return null;

  const rank = weightedRank(samples, currentValue);
  const median = weightedMedian(samples);

  if (rank < EXTREME_RANK && currentValue * EXTREME_FACTOR <= median) return level('molto-bassa');
  if (rank > 1 - EXTREME_RANK && currentValue >= median * EXTREME_FACTOR) return level('molto-alta');
  if (rank < LOW_RANK) return level('bassa');
  if (rank > HIGH_RANK) return level('alta');
  return level('media');
}

function level(l: QualityLevel, labels = QUALITY_LABELS): Quality {
  return { level: l, label: labels[l] };
}

/**
 * Media delle fasce di tutte le carte attive, arrotondata alla fascia piu'
 * vicina. Ogni carta pesa uno: i due lati (presentato e presentatore) si
 * mediano prima fra loro, cosi' una carta di cui conosciamo anche il
 * presentatore non conta il doppio di una di cui conosciamo solo un lato.
 *
 * E' un'indicazione di massima: comprime undici carte in un solo giudizio,
 * quindi puo' nascondere divergenze forti fra una carta e l'altra — il
 * dettaglio per carta resta la fonte di verita'. Gli estremi qui sono ancora
 * piu' rari che sulla singola carta, e giustamente: perche' oggi sia "molto
 * alta" non basta una carta fuori scala, devono esserlo quasi tutte.
 */
export function globalQuality(): Quality | null {
  if (!currentPeriod) return null;

  const perCard: number[] = [];
  for (const card of cards) {
    const offer = currentPeriod.offers[card.id];
    if (!offer) continue;

    const sides: number[] = [];
    const referred = qualityOf(card.id, 'referred', maxValueOf(offer.referred));
    if (referred) sides.push(QUALITY_SCORE[referred.level]);

    if (offer.referrer) {
      const referrer = qualityOf(card.id, 'referrer', maxValueOf(offer.referrer));
      if (referrer) sides.push(QUALITY_SCORE[referrer.level]);
    }

    if (sides.length > 0) perCard.push(sides.reduce((sum, s) => sum + s, 0) / sides.length);
  }

  if (perCard.length === 0) return null;
  const average = perCard.reduce((sum, s) => sum + s, 0) / perCard.length;
  const rounded = Math.min(5, Math.max(1, Math.round(average)));
  return level(QUALITY_BY_SCORE.get(rounded)!, QUALITY_LABELS_PLURAL);
}
