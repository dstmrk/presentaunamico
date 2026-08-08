import { maxValueOf, type OfferSide, type RewardKind } from './schema.ts';

const nf = new Intl.NumberFormat('it-IT');
const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric' });

export const formatNumber = (n: number) => nf.format(n);

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export function formatShortDate(iso: string): string {
  return shortDateFmt.format(new Date(`${iso}T00:00:00Z`));
}

/** Unita' del premio, per intestazioni e assi. */
export const REWARD_UNIT: Record<RewardKind, string> = {
  mr: 'punti Membership Rewards',
  payback: 'punti Payback',
  eur: 'euro',
};

export const REWARD_UNIT_SHORT: Record<RewardKind, string> = {
  mr: 'punti',
  payback: 'punti',
  eur: '€',
};

/** Forma compatta per le annotazioni sul grafico: 180k, 17,5k, 40 €. */
export function formatCompact(value: number, reward: RewardKind): string {
  if (reward === 'eur') return `${nf.format(Math.round(value))} €`;
  if (value >= 1000) {
    const k = value / 1000;
    return `${nf.format(Number.isInteger(k) ? k : Number(k.toFixed(1)))}k`;
  }
  return nf.format(value);
}

/** Forma estesa per tabella e riepilogo. */
export function formatValue(value: number, reward: RewardKind): string {
  return reward === 'eur'
    ? `${nf.format(Math.round(value))} €`
    : `${nf.format(value)} ${REWARD_UNIT_SHORT[reward]}`;
}

/** Requisito di spesa: "12.000 € · 6 mesi". Il € distingue la soglia dai punti. */
export function formatSpend(spend: { amount: number; months?: number } | undefined): string | null {
  if (!spend) return null;
  const amount = `${nf.format(spend.amount)} €`;
  return spend.months ? `${amount} · ${spend.months} mesi` : amount;
}

/** Etichetta compatta per la striscia della spesa: "12k€ · 6m". */
export function formatSpendCompact(spend: { amount: number; months?: number } | undefined): string | null {
  if (!spend) return null;
  const k = spend.amount >= 1000 ? `${Number((spend.amount / 1000).toFixed(1))}k€` : `${spend.amount}€`;
  return spend.months ? `${k} · ${spend.months}m` : k;
}

export function spendOf(side: OfferSide) {
  return side.type === 'bonus' ? side.spend : { amount: side.spendCap, months: side.months };
}

/**
 * Descrizione testuale completa di un lato dell'offerta.
 * Per `rate` esplicita che si tratta di un MASSIMO e da dove viene: un tetto
 * presentato come importo certo sarebbe una bugia della stessa famiglia
 * dell'interpolazione lineare fra due promozioni.
 */
export function describeOffer(side: OfferSide, reward: RewardKind): string {
  if (side.type === 'bonus') {
    const base = formatValue(side.amount, reward);
    const spend = formatSpend(side.spend);
    return spend ? `${base} con ${spend} di spesa` : base;
  }
  const pct = `${Number((side.rate * 100).toFixed(2))}%`.replace('.', ',');
  const max = formatValue(maxValueOf(side), reward);
  return `${pct} di cashback per ${side.months} mesi, fino a ${nf.format(side.spendCap)} € di spesa (massimo ${max})`;
}

/** Valore da annotare sul grafico. I `rate` vanno prefissati con "max". */
export function annotateOffer(side: OfferSide, reward: RewardKind): string {
  const v = formatCompact(maxValueOf(side), reward);
  return side.type === 'rate' ? `max ${v}` : v;
}
