import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Primitive                                                                   */
/* -------------------------------------------------------------------------- */

/** Data ISO calendariale reale: "2025-02-30" deve fallire, non essere accettata. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'formato data non valido, atteso YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'data inesistente nel calendario');

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id non valido: usare kebab-case minuscolo');

/**
 * Requisito di spesa a carico dell'amico presentato.
 * `months` e' la finestra entro cui la spesa va completata.
 */
const spendRequirement = z.object({
  amount: z.number().positive('la spesa richiesta deve essere > 0'),
  /** Opzionale: alcune fonti riportano l'importo senza la finestra temporale. */
  months: z.number().int().min(1).max(24).optional(),
});

/* -------------------------------------------------------------------------- */
/* Meccaniche del premio                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Unione discriminata sulla MECCANICA, non sulla valuta.
 *
 * `bonus` : importo una tantum, eventualmente subordinato a un requisito di spesa.
 *           `spend.amount` e' una SOGLIA DA RAGGIUNGERE.
 * `rate`  : percentuale di cashback per N mesi fino a un tetto di spesa.
 *           `spendCap` e' un TETTO OLTRE IL QUALE NON MATURA PIU' NULLA.
 *
 * I due numeri si somigliano ma hanno significato opposto: tenerli in campi
 * distinti e' cio' che impedisce alle etichette del grafico di mentire.
 * Il massimo ottenibile da un `rate` non si memorizza, si deriva (vedi
 * maxValueOf) cosi' non puo' divergere dai fattori che lo compongono.
 */
const bonusOffer = z.object({
  type: z.literal('bonus'),
  amount: z.number().int().min(0, 'i punti non possono essere negativi'),
  spend: spendRequirement.optional(),
});

const rateOffer = z.object({
  type: z.literal('rate'),
  rate: z.number().positive().max(1, 'la percentuale va espressa come frazione (0.05 = 5%)'),
  months: z.number().int().min(1).max(24),
  spendCap: z.number().positive(),
});

export const offerSide = z.discriminatedUnion('type', [bonusOffer, rateOffer]);

/**
 * Offerta di una carta in un periodo.
 * `null` = dato non rilevato, DICHIARATO come tale. La differenza fra "non lo so"
 * e "l'ho dimenticato" e' l'intera differenza fra un archivio e un mucchio di numeri.
 */
const cardOffer = z
  .object({
    referred: offerSide,
    referrer: offerSide.nullable(),
  })
  .nullable();

/* -------------------------------------------------------------------------- */
/* Entita'                                                                     */
/* -------------------------------------------------------------------------- */

export const rewardKind = z.enum(['mr', 'payback', 'eur']);
export const cardGroup = z.enum(['mr', 'business', 'other']);

const card = z.object({
  id: slug,
  name: z.string().min(1),
  fullName: z.string().min(1),
  group: cardGroup,
  reward: rewardKind,
  /** Colore identitario. Le varianti effettive per grafico e chip si derivano in chart.ts. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int().min(0),
});

const source = z.object({
  url: z.string().url().optional(),
  archived: z.string().url().optional(),
  capturedAt: isoDate,
  note: z.string().optional(),
});

/**
 * Il PERIODO e' l'entita' portante, non la singola promozione: le offerte Amex
 * hanno lo stesso periodo per tutte le carte. Modellando cosi', le sovrapposizioni
 * per carta diventano impossibili per costruzione invece che da validare.
 */
const period = z.object({
  start: isoDate,
  /**
   * `null` = periodo ancora in corso, SENZA una data di fine dichiarata dalla
   * fonte. Succede quando la pagina ufficiale mostra l'offerta "base" fra due
   * promozioni datate, senza la nota "valida dal ... al ...". Solo l'ULTIMO
   * periodo del dataset puo' averla: un periodo chiuso ha sempre una fine.
   */
  end: isoDate.nullable(),
  /** true quando le date sono una ricostruzione, non una lettura diretta della fonte. */
  datesEstimated: z.boolean().default(false),
  source,
  /** Chiave = card.id. Ogni carta deve comparire: assente = errore, null = buco dichiarato. */
  offers: z.record(slug, cardOffer),
});

export const datasetSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  cards: z.array(card).min(1),
  periods: z.array(period).min(1),
});

export type Dataset = z.infer<typeof datasetSchema>;
export type Card = z.infer<typeof card>;
export type Period = z.infer<typeof period>;
export type CardOffer = NonNullable<z.infer<typeof cardOffer>>;
export type OfferSide = z.infer<typeof offerSide>;
export type RewardKind = z.infer<typeof rewardKind>;
export type CardGroup = z.infer<typeof cardGroup>;

/* -------------------------------------------------------------------------- */
/* Derivazioni                                                                 */
/* -------------------------------------------------------------------------- */

/** Valore massimo ottenibile, in unita' del premio. Per `rate` e' un MASSIMO, non un importo certo. */
export function maxValueOf(side: OfferSide): number {
  return side.type === 'bonus' ? side.amount : side.rate * side.spendCap;
}

/** Un `rate` promette un tetto, non una cifra: il grafico deve marcarlo diversamente. */
export function isCapped(side: OfferSide): boolean {
  return side.type === 'rate';
}

/* -------------------------------------------------------------------------- */
/* Validazione incrociata                                                      */
/* -------------------------------------------------------------------------- */

const dayMs = 86_400_000;
const toUTC = (s: string) => Date.parse(`${s}T00:00:00Z`);
const nextDay = (s: string) => new Date(toUTC(s) + dayMs).toISOString().slice(0, 10);

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Regole che zod da solo non puo' esprimere perche' attraversano piu' record.
 * Gli errori fanno fallire la build; i warning no, ma vanno stampati forte:
 * pubblicare dati incompleti e' legittimo, pubblicarli senza saperlo no.
 */
export function crossValidate(data: Dataset): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Carte ---------------------------------------------------------------
  const ids = new Set<string>();
  for (const c of data.cards) {
    if (ids.has(c.id)) errors.push(`carta duplicata: "${c.id}"`);
    ids.add(c.id);
  }

  const orders = data.cards.map((c) => `${c.group}/${c.order}`);
  const dupOrder = orders.find((o, i) => orders.indexOf(o) !== i);
  if (dupOrder) errors.push(`due carte condividono gruppo e order: ${dupOrder}`);

  // --- Periodi -------------------------------------------------------------
  const sorted = [...data.periods].sort((a, b) => toUTC(a.start) - toUTC(b.start));
  const today = new Date().toISOString().slice(0, 10);

  for (const [i, p] of sorted.entries()) {
    const label = `periodo ${p.start} → ${p.end ?? 'in corso'}`;

    if (p.end !== null && toUTC(p.start) > toUTC(p.end)) {
      errors.push(`${label}: start successivo a end`);
    }
    if (p.end === null && i !== sorted.length - 1) {
      errors.push(`${label}: end null (periodo "in corso") ma non e' l'ultimo periodo del dataset`);
    }
    if (toUTC(p.source.capturedAt) > toUTC(today)) {
      errors.push(`${label}: source.capturedAt e' nel futuro (${p.source.capturedAt})`);
    }

    // Ogni carta deve comparire esplicitamente. Chiave mancante = svista.
    for (const c of data.cards) {
      if (!(c.id in p.offers)) {
        errors.push(
          `${label}: manca la carta "${c.id}". Se il dato non e' noto scrivere "${c.id}": null.`,
        );
      }
    }
    for (const key of Object.keys(p.offers)) {
      if (!ids.has(key)) errors.push(`${label}: offerta per carta inesistente "${key}"`);
    }

    // Coerenza fra meccanica dell'offerta e valuta della carta.
    for (const [cardId, offer] of Object.entries(p.offers)) {
      if (!offer) continue;
      const c = data.cards.find((x) => x.id === cardId);
      if (!c) continue;
      for (const [side, value] of [
        ['referred', offer.referred],
        ['referrer', offer.referrer],
      ] as const) {
        if (value?.type === 'rate' && c.reward !== 'eur') {
          errors.push(
            `${label}: "${cardId}".${side} usa una percentuale di cashback ma la carta premia in "${c.reward}"`,
          );
        }
      }
    }
  }

  // Sovrapposizioni e continuita' fra periodi consecutivi. Un `prev` con
  // end null e' gia' segnalato sopra (deve essere l'ultimo): qui si salta,
  // per non produrre un secondo errore fuorviante sullo stesso dato.
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.end === null) continue;
    if (toUTC(cur.start) <= toUTC(prev.end)) {
      errors.push(
        `periodi sovrapposti: ${prev.start} → ${prev.end} e ${cur.start} → ${cur.end ?? 'in corso'}`,
      );
    } else if (cur.start !== nextDay(prev.end)) {
      // Un'offerta c'e' sempre: un buco fra periodi e' un dato mancante, non un vuoto reale.
      warnings.push(
        `buco fra ${prev.end} e ${cur.start}: un'offerta c'e' sempre, quindi qui manca un periodo`,
      );
    }
  }

  // Buchi dichiarati: utili da vedere in aggregato quando si aggiorna il dataset.
  const holes = new Map<string, number>();
  const referrerHoles = new Map<string, number>();
  for (const p of sorted) {
    for (const [cardId, offer] of Object.entries(p.offers)) {
      if (offer === null) holes.set(cardId, (holes.get(cardId) ?? 0) + 1);
      else if (offer.referrer === null) {
        referrerHoles.set(cardId, (referrerHoles.get(cardId) ?? 0) + 1);
      }
    }
  }
  for (const [cardId, n] of holes) {
    warnings.push(`"${cardId}": ${n} periodi senza alcun dato (dichiarati null)`);
  }
  for (const [cardId, n] of referrerHoles) {
    warnings.push(`"${cardId}": ${n} periodi senza il dato del presentatore`);
  }

  return { errors, warnings };
}
