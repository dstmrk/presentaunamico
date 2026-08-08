import type { Card } from './schema.ts';
import { maxValueOf } from './schema.ts';
import { cards, currentPeriod, domain, lastKnownOffer, lastUpdated, periods } from './promotions.ts';
import { describeOffer, formatDate, formatSpendProse, formatValue, spendOf } from './format.ts';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from './site.ts';
import { faq, type FaqEntry } from './faq.ts';

export const cardPath = (card: Card) => `/carte/${card.id}`;
export const absolute = (path: string) => `${SITE_URL}${path === '/' ? '' : path}`;

/* -------------------------------------------------------------------------- */
/* Titoli e descrizioni                                                        */
/* -------------------------------------------------------------------------- */

export function cardTitle(card: Card): string {
  return `Presenta un Amico Amex ${card.name}: quanti punti e storico`;
}

export function cardHeading(card: Card): string {
  return `Presenta un Amico ${card.fullName}: quanti punti danno oggi`;
}

/**
 * Descrizione costruita sui valori correnti: cambia a ogni aggiornamento dei
 * dati, il che e' esattamente il segnale che questo sito ha da offrire.
 */
export function cardDescription(card: Card): string {
  const offer = currentPeriod?.offers[card.id] ?? null;
  if (!offer) {
    return `Storico completo delle offerte Presenta un Amico per la ${card.fullName}: punti all'amico presentato, punti al presentatore e requisiti di spesa, periodo per periodo dal ${formatDate(domain.start)}.`;
  }
  const referred = formatValue(maxValueOf(offer.referred), card.reward);
  const spend = formatSpendProse(spendOf(offer.referred));
  const referrer = offer.referrer
    ? ` e ${formatValue(maxValueOf(offer.referrer), card.reward)} al presentatore`
    : '';
  return `Presenta un Amico con la ${card.fullName}: oggi ${referred} all'amico presentato${spend ? ` spendendo ${spend}` : ''}${referrer}. Storico completo delle offerte precedenti.`;
}

/* -------------------------------------------------------------------------- */
/* FAQ per carta                                                               */
/* -------------------------------------------------------------------------- */

/** Periodo in cui la carta ha offerto di piu' all'amico presentato. */
export function bestEver(card: Card) {
  let best: { value: number; period: (typeof periods)[number] } | null = null;
  for (const period of periods) {
    const offer = period.offers[card.id];
    if (!offer) continue;
    const value = maxValueOf(offer.referred);
    if (!best || value > best.value) best = { value, period };
  }
  return best;
}

/** Quante volte il valore all'amico presentato e' cambiato nella copertura. */
export function changeCount(card: Card): number {
  let changes = 0;
  let prev: number | null = null;
  for (const period of periods) {
    const offer = period.offers[card.id];
    if (!offer) continue;
    const value = maxValueOf(offer.referred);
    if (prev !== null && value !== prev) changes++;
    prev = value;
  }
  return changes;
}

/**
 * FAQ specifiche della carta, derivate dai dati. Sono diverse pagina per pagina
 * proprio perche' calcolate: undici copie della stessa FAQ generica sarebbero
 * contenuto duplicato, e non aiuterebbero nessuno.
 */
export function cardFaq(card: Card): FaqEntry[] {
  const offer = currentPeriod?.offers[card.id] ?? null;
  const fallback = offer ? null : lastKnownOffer(card.id);
  const best = bestEver(card);
  const changes = changeCount(card);

  const entries: FaqEntry[] = [];

  entries.push({
    question: `Quanti punti da il Presenta un Amico con la ${card.fullName}?`,
    answer: offer
      ? `Nel periodo in corso (${formatDate(currentPeriod!.start)} – ${formatDate(currentPeriod!.end)}) l'amico presentato riceve ${describeOffer(offer.referred, card.reward)}${offer.referrer ? `, mentre il presentatore riceve ${describeOffer(offer.referrer, card.reward)}` : ''}.`
      : `Il periodo attualmente in corso non e' ancora stato rilevato. L'ultima offerta registrata${fallback ? ` si e' chiusa il ${formatDate(fallback.period.end)} e prevedeva ${describeOffer(fallback.offer.referred, card.reward)} per l'amico presentato` : ''}.`,
  });

  if (best) {
    const bestSpend = formatSpendProse(spendOf(best.period.offers[card.id]!.referred));
    entries.push({
      question: `Qual e' stata l'offerta migliore della ${card.fullName}?`,
      answer: `Nel periodo coperto da questo archivio il massimo per l'amico presentato e' stato ${formatValue(best.value, card.reward)}, dal ${formatDate(best.period.start)} al ${formatDate(best.period.end)}${bestSpend ? `, spendendo ${bestSpend}` : ''}.`,
    });
  }

  entries.push({
    question: `Ogni quanto cambia l'offerta della ${card.fullName}?`,
    answer: `Spesso. Dal ${formatDate(domain.start)} a oggi questo archivio ha registrato ${periods.length} periodi promozionali distinti, e l'importo per l'amico presentato e' cambiato ${changes} volte.`,
  });

  return entries;
}

/* -------------------------------------------------------------------------- */
/* JSON-LD                                                                     */
/* -------------------------------------------------------------------------- */

const organization = { '@type': 'Organization', name: SITE_NAME, url: SITE_URL };

function webPage(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    inLanguage: 'it-IT',
    dateModified: lastUpdated,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
}

function faqPage(entries: FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

function dataset(name: string, description: string, url: string, measured: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    inLanguage: 'it-IT',
    dateModified: lastUpdated,
    temporalCoverage: `${domain.start}/${domain.end}`,
    keywords: ['presenta un amico', 'American Express', 'Membership Rewards', 'member get member', 'referral', 'punti'],
    variableMeasured: measured,
    creator: organization,
  };
}

export function indexJsonLd() {
  const url = absolute('/');
  return [
    webPage(SITE_TITLE, SITE_DESCRIPTION, url),
    dataset(
      'Storico delle promozioni Presenta un Amico American Express Italia',
      'Serie storica dei punti Membership Rewards, punti Payback e cashback offerti dalle promozioni member-get-member American Express in Italia, con i requisiti di spesa associati.',
      url,
      cards.map((c) => c.fullName),
    ),
    faqPage(faq),
  ];
}

export function cardJsonLd(card: Card, faq: FaqEntry[]) {
  const url = absolute(cardPath(card));
  return [
    webPage(cardTitle(card), cardDescription(card), url),
    dataset(
      `Storico Presenta un Amico — ${card.fullName}`,
      `Serie storica delle offerte Presenta un Amico della ${card.fullName}: punti all'amico presentato, punti al presentatore e requisito di spesa, periodo per periodo.`,
      url,
      [`${card.fullName} — amico presentato`, `${card.fullName} — presentatore`, 'Requisito di spesa'],
    ),
    faqPage(faq),
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Presenta un Amico', item: absolute('/') },
        { '@type': 'ListItem', position: 2, name: card.fullName, item: url },
      ],
    },
  ];
}
