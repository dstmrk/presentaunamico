import { cards, currentPeriod, periods, today } from './promotions.ts';
import { maxValueOf } from './schema.ts';

const dayMs = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysBetweenInclusive = (start: string, end: string) =>
  Math.round((toTime(end) - toTime(start)) / dayMs) + 1;

/**
 * Soglie della fascia di qualita'. "Molto bassa"/"molto alta" sono un
 * discostamento (percentile), non il minimo/massimo assoluto: un solo
 * outlier storico non deve bloccare la fascia per anni. "Bassa"/"alta"
 * misurano lo scarto dalla media degli ultimi 12 mesi, pesata sui giorni
 * di calendario di ogni periodo (non sul numero di periodi): un periodo
 * di 40 giorni deve pesare piu' di uno di 8, altrimenti la media premia
 * le promozioni brevi e frequenti rispetto a quelle lunghe.
 */
const LOW_PERCENTILE = 0.1;
const HIGH_PERCENTILE = 0.9;
const BELOW_MEAN = 0.1;
const ABOVE_MEAN = 0.1;

export type QualityLevel = 'molto-bassa' | 'bassa' | 'media' | 'alta' | 'molto-alta';

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  'molto-bassa': 'molto bassa',
  bassa: 'bassa',
  media: 'media',
  alta: 'alta',
  'molto-alta': 'molto alta',
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
  start: string;
  end: string;
  days: number;
}

/** Storico pesato sui giorni: un periodo aperto conta fino a oggi, non oltre. */
function samplesFor(cardId: string, which: 'referred' | 'referrer'): Sample[] {
  const out: Sample[] = [];
  for (const period of periods) {
    if (period.start > today) continue;
    const offer = period.offers[cardId];
    if (!offer) continue;
    const side = offer[which];
    if (!side) continue;
    const end = period.end && period.end < today ? period.end : today;
    const days = daysBetweenInclusive(period.start, end);
    if (days <= 0) continue;
    out.push({ value: maxValueOf(side), start: period.start, end, days });
  }
  return out;
}

function weightedPercentile(samples: Sample[], pct: number): number {
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const totalDays = sorted.reduce((sum, s) => sum + s.days, 0);
  const target = totalDays * pct;
  let cumulative = 0;
  for (const s of sorted) {
    cumulative += s.days;
    if (cumulative >= target) return s.value;
  }
  return sorted[sorted.length - 1]!.value;
}

function weightedMeanLast12Months(samples: Sample[]): number | null {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const since = from.toISOString().slice(0, 10);

  let totalDays = 0;
  let totalValue = 0;
  for (const s of samples) {
    const start = s.start < since ? since : s.start;
    if (start > s.end) continue;
    const days = daysBetweenInclusive(start, s.end);
    totalDays += days;
    totalValue += days * s.value;
  }
  return totalDays > 0 ? totalValue / totalDays : null;
}

/**
 * Fascia dell'offerta attuale rispetto al proprio storico. `null` quando
 * manca il dato o l'offerta e' a zero: un'offerta inattiva non e' "bassa",
 * e' fuori mercato, e come tale va segnalata altrove, non con un giudizio
 * di qualita' che lascerebbe intendere che conviene aspettare un rialzo.
 */
export function qualityOf(
  cardId: string,
  which: 'referred' | 'referrer',
  currentValue: number | null,
): Quality | null {
  if (currentValue === null || currentValue === 0) return null;

  const samples = samplesFor(cardId, which);
  if (samples.length === 0) return null;

  const low = weightedPercentile(samples, LOW_PERCENTILE);
  const high = weightedPercentile(samples, HIGH_PERCENTILE);
  if (currentValue <= low) return level('molto-bassa');
  if (currentValue >= high) return level('molto-alta');

  const mean = weightedMeanLast12Months(samples);
  if (mean === null) return level('media');
  if (currentValue < mean * (1 - BELOW_MEAN)) return level('bassa');
  if (currentValue > mean * (1 + ABOVE_MEAN)) return level('alta');
  return level('media');
}

function level(l: QualityLevel): Quality {
  return { level: l, label: QUALITY_LABELS[l] };
}

/**
 * Media (non pesata) delle fasce di tutte le carte attive, referred e
 * referrer insieme, arrotondata alla fascia piu' vicina. E' un'indicazione
 * di massima: comprime undici carte in un solo giudizio, quindi puo'
 * nascondere divergenze forti fra una carta e l'altra — il dettaglio per
 * carta resta la fonte di verita'.
 */
export function globalQuality(): Quality | null {
  if (!currentPeriod) return null;

  const scores: number[] = [];
  for (const card of cards) {
    const offer = currentPeriod.offers[card.id];
    if (!offer) continue;

    const referred = qualityOf(card.id, 'referred', maxValueOf(offer.referred));
    if (referred) scores.push(QUALITY_SCORE[referred.level]);

    if (offer.referrer) {
      const referrer = qualityOf(card.id, 'referrer', maxValueOf(offer.referrer));
      if (referrer) scores.push(QUALITY_SCORE[referrer.level]);
    }
  }

  if (scores.length === 0) return null;
  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const rounded = Math.min(5, Math.max(1, Math.round(average)));
  return level(QUALITY_BY_SCORE.get(rounded)!);
}
