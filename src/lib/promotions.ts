import raw from '../data/promotions.json';
import { datasetSchema, crossValidate, type Dataset } from './schema.ts';

/**
 * Punto unico di ingresso ai dati. La validazione avviene a import-time: se il
 * dataset e' incoerente questo modulo lancia, `astro build` muore e Cloudflare
 * Pages non pubblica nulla. E' il meccanismo per cui dati sbagliati non possono
 * arrivare online.
 */
function load(): Dataset {
  const parsed = datasetSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(radice)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `\n\npromotions.json non valido — build interrotta.\n${issues}\n\n` +
        `Correggi src/data/promotions.json e rilancia.\n`,
    );
  }

  const { errors, warnings } = crossValidate(parsed.data);

  if (warnings.length > 0) {
    console.warn(
      `\n⚠︎  promotions.json — ${warnings.length} avvisi (la build prosegue):\n` +
        warnings.map((w) => `  • ${w}`).join('\n') +
        '\n',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `\n\npromotions.json incoerente — build interrotta.\n` +
        errors.map((e) => `  • ${e}`).join('\n') +
        `\n\nCorreggi src/data/promotions.json e rilancia.\n`,
    );
  }

  return parsed.data;
}

export const dataset = load();

export const cards = [...dataset.cards].sort((a, b) => a.order - b.order);

/** Periodi in ordine cronologico crescente: tutto il resto assume quest'ordine. */
export const periods = [...dataset.periods].sort((a, b) => a.start.localeCompare(b.start));

export const cardById = new Map(cards.map((c) => [c.id, c]));

export const GROUP_LABELS = {
  mr: 'Carte con Membership Rewards',
  business: 'Carte Business',
  other: 'Altre carte',
} as const;

export const GROUP_ORDER = ['mr', 'business', 'other'] as const;

export const groups = GROUP_ORDER.map((group) => ({
  id: group,
  label: GROUP_LABELS[group],
  cards: cards.filter((c) => c.group === group),
})).filter((g) => g.cards.length > 0);

export const today = new Date().toISOString().slice(0, 10);

/**
 * Estremi dell'asse X, condivisi da tutti i grafici del sito.
 *
 * `end` usa "oggi" quando l'ultimo periodo e' ancora in corso (nessuna data
 * di fine dichiarata): e' un limite di disegno, non un'affermazione sui dati.
 */
export const domain = {
  start: periods[0]!.start,
  end: periods[periods.length - 1]!.end ?? today,
};

/**
 * Il periodo che contiene la data indicata, oppure null.
 *
 * Se oggi cade oltre l'ultimo periodo noto il risultato e' null, e la pagina
 * deve dire "periodo non ancora rilevato" invece di spacciare per corrente
 * l'ultima offerta registrata. E' l'errore che brucerebbe la credibilita' del
 * sito in un colpo solo, quindi la distinzione vive qui e non nei componenti.
 *
 * Un periodo con `end` null (in corso, senza data di fine dichiarata) copre
 * ogni data futura: e' esattamente il senso di "ancora in corso".
 */
export function periodAt(date: string) {
  return periods.find((p) => p.start <= date && (p.end === null || date <= p.end)) ?? null;
}

export const currentPeriod = periodAt(today);

/**
 * Quanti periodi promozionali sono terminati (o sono in corso) negli ultimi
 * dodici mesi. Serve a dire "ogni quanto cambiano le offerte" senza scriverlo
 * a mano: la cadenza si legge dai dati e si aggiorna da sola, cosi' aggiornare
 * il sito resta una questione di numeri e mai di frasi.
 */
export function periodsLastYear(at: string = today): number {
  const from = new Date(`${at}T00:00:00Z`);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const since = from.toISOString().slice(0, 10);
  return periods.filter((p) => (p.end === null || p.end >= since) && p.start <= at).length;
}

/** Ultimo periodo per cui esiste un dato su quella carta. */
export function lastKnownOffer(cardId: string) {
  for (let i = periods.length - 1; i >= 0; i--) {
    const offer = periods[i]!.offers[cardId];
    if (offer) return { period: periods[i]!, offer };
  }
  return null;
}

/** Data dell'ultimo aggiornamento dei dati, per JSON-LD e per la pagina. */
export const lastUpdated =
  periods.map((p) => p.source.capturedAt).sort().at(-1) ?? today;

/** Data di inizio della promozione piu' recente registrata, per il footer. */
export const latestPeriodStart = periods[periods.length - 1]!.start;
