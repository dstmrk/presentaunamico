/**
 * Configurazione di dominio e identita' del sito.
 *
 * PRODUCTION_HOSTNAME e' l'unico posto da cambiare il giorno in cui si passa a
 * un dominio custom: canonical, sitemap, Open Graph e URL nel JSON-LD si
 * spostano tutti di conseguenza.
 *
 * Nota: il canonical e' sempre ASSOLUTO e sempre su questo host, a prescindere
 * da dove la pagina viene servita. E' quello che tiene fuori dall'indice i
 * deploy di anteprima su *.pages.dev, che dichiarano la produzione come URL
 * canonico invece di competerci.
 */
export const PRODUCTION_HOSTNAME = 'presentaunamico.pages.dev';

export const SITE_URL = `https://${PRODUCTION_HOSTNAME}`;

export const SITE_NAME = 'Presenta un Amico';

export const SITE_TITLE =
  'Presenta un Amico American Express: storico punti e offerte';

export const SITE_DESCRIPTION =
  'Quanti punti Membership Rewards da il Presenta un Amico Amex? Offerte aggiornate per Platino, Oro, Verde, Italo, Explora, Business, Payback e Blu, con requisiti di spesa e storico completo.';

export const SITE_LOCALE = 'it_IT';

/**
 * Link di presentazione personale ("Presenta un Amico") di chi tiene
 * l'archivio, usato dalla sezione "Sostieni l'archivio".
 *
 * REGOLA. Finche' questa costante e' una stringa vuota il sito non mostra la
 * sezione e il colophon continua a dichiarare che non esiste nessun link di
 * presentazione: le due cose devono restare vere insieme, sempre. E' l'unico
 * punto da cambiare per accendere o spegnere tutto.
 *
 * Il link si prende dall'Area Riservata American Express (App o sito) ed e'
 * personale: cambiarlo qui e' l'unica manutenzione che richiede.
 *
 * REFERRAL_CARD e' il nome della carta su cui il link e' generato, perche' la
 * pagina di destinazione propone quella e il lettore ha diritto di sapere in
 * anticipo che puo' cambiarla in fase di richiesta.
 */
export const REFERRAL_URL: string = '';

export const REFERRAL_CARD = 'Platino';

export const hasReferral = REFERRAL_URL.trim().length > 0;

/** Regolamento ufficiale del programma: la fonte da citare accanto al link. */
export const REFERRAL_TERMS_URL =
  'https://www.americanexpress.com/it-it/chi-siamo/legal/termes-et-conditions/presenta-un-amico/';
