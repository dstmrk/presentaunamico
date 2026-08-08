/**
 * Configurazione di dominio e identita' del sito.
 *
 * PRODUCTION_HOSTNAME e' l'unico posto da cambiare il giorno in cui si passa a
 * un dominio custom. Da quel momento il middleware in functions/_middleware.ts
 * inizia da solo a servire X-Robots-Tag: noindex su *.pages.dev, e il canonical
 * continua a puntare qui.
 */
export const PRODUCTION_HOSTNAME = 'presentaunamico.pages.dev';

export const SITE_URL = `https://${PRODUCTION_HOSTNAME}`;

export const SITE_NAME = 'Presenta un Amico';

export const SITE_TITLE =
  'Presenta un Amico American Express: storico punti e offerte';

export const SITE_DESCRIPTION =
  'Quanti punti Membership Rewards da il Presenta un Amico Amex? Offerte aggiornate per Platino, Oro, Verde, Italo, Explora, Business, Payback e Blu, con requisiti di spesa e storico completo.';

export const SITE_LOCALE = 'it_IT';
