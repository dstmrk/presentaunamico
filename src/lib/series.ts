import { periods, domain } from './promotions.ts';
import { maxValueOf, type Card, type OfferSide, type Period } from './schema.ts';
import { spendOf } from './format.ts';

const dayMs = 86_400_000;
export const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDay = (iso: string) => new Date(toTime(iso) + dayMs).toISOString().slice(0, 10);

/**
 * Un segmento = una promozione che vale per un intervallo, non un punto in
 * transito verso il successivo. Modellare l'intervallo esplicitamente (x0 → x1)
 * invece di due punti da interpolare e' cio' che rende impossibile disegnare
 * per sbaglio una linea che scende dolcemente da 180k a 100k.
 *
 * `x1` e' il giorno DOPO la fine del periodo: cosi' l'ultimo giorno di validita'
 * e' incluso nel tratto e l'ultima promozione non si prolunga all'infinito
 * verso il bordo destro.
 */
export interface Segment {
  period: Period;
  x0: number;
  x1: number;
  /** null = dato non rilevato per questa carta in questo periodo. */
  side: OfferSide | null;
  value: number | null;
  /** true per il cashback percentuale: il valore e' un massimo, non un importo certo. */
  capped: boolean;
  spend: { amount: number; months?: number } | undefined;
}

export interface CardSeries {
  card: Card;
  referred: Segment[];
  referrer: Segment[];
  /** Massimo fra le due serie, per la scala Y del riquadro. */
  max: number;
  /** Ultimo segmento con dato: alimenta il valore corrente a destra. */
  latest: Segment | null;
  hasReferrer: boolean;
}

function segmentsFor(cardId: string, which: 'referred' | 'referrer'): Segment[] {
  return periods.map((period) => {
    const offer = period.offers[cardId];
    const side = offer ? offer[which] : null;
    return {
      period,
      x0: toTime(period.start),
      x1: toTime(addDay(period.end)),
      side,
      value: side ? maxValueOf(side) : null,
      capped: side?.type === 'rate',
      spend: side ? spendOf(side) : undefined,
    };
  });
}

export function buildSeries(card: Card): CardSeries {
  const referred = segmentsFor(card.id, 'referred');
  const referrer = segmentsFor(card.id, 'referrer');

  const values = [...referred, ...referrer]
    .map((s) => s.value)
    .filter((v): v is number => v !== null);

  const latest = [...referred].reverse().find((s) => s.value !== null) ?? null;

  return {
    card,
    referred,
    referrer,
    max: values.length > 0 ? Math.max(...values) : 0,
    latest,
    hasReferrer: referrer.some((s) => s.value !== null),
  };
}

export const allSeries = new Map<string, CardSeries>();

export const xDomain: [number, number] = [toTime(domain.start), toTime(addDay(domain.end))];

/** Primo gennaio di ogni anno interno al dominio: separatori discreti sull'asse X. */
export function yearTicks(): { time: number; year: number }[] {
  const first = new Date(xDomain[0]).getUTCFullYear();
  const last = new Date(xDomain[1]).getUTCFullYear();
  const ticks: { time: number; year: number }[] = [];
  for (let y = first; y <= last; y++) {
    const t = Date.UTC(y, 0, 1);
    if (t > xDomain[0] && t < xDomain[1]) ticks.push({ time: t, year: y });
  }
  return ticks;
}

/** Tick trimestrali per l'asse condiviso in fondo a ogni gruppo. */
export function quarterTicks(): { time: number; label: string; major: boolean }[] {
  const out: { time: number; label: string; major: boolean }[] = [];
  const start = new Date(xDomain[0]);
  let y = start.getUTCFullYear();
  let m = Math.floor(start.getUTCMonth() / 3) * 3;
  for (;;) {
    const t = Date.UTC(y, m, 1);
    if (t > xDomain[1]) break;
    if (t >= xDomain[0]) {
      const label = m === 0 ? String(y) : ['gen', 'apr', 'lug', 'ott'][m / 3]!;
      out.push({ time: t, label, major: m === 0 });
    }
    m += 3;
    if (m > 9) { m = 0; y++; }
  }
  return out;
}
