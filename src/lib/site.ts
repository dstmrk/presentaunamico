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
 * NON STA NEL REPO. Arriva dalla variabile d'ambiente REFERRAL_URL, impostata
 * su Cloudflare Pages (Settings -> Environment variables, sia Production sia
 * Preview se la si vuole vedere anche nelle anteprime). Il link finisce
 * comunque in chiaro nell'HTML pubblicato -- e' un link, non un segreto -- ma
 * cosi' non resta inciso per sempre nella storia di un repository pubblico.
 *
 * In locale si passa sulla riga di comando:
 *   REFERRAL_URL='https://...' npm run build
 * oppure si mette in un file .env, che e' gia' fuori dal versionamento.
 *
 * REGOLA. Finche' la variabile non c'e' il sito non mostra la sezione e il
 * colophon continua a dichiarare che non esiste nessun link di presentazione:
 * le due cose devono restare vere insieme, sempre. Una build senza variabile
 * e' quindi legittima e produce esattamente il sito di prima.
 */
export const REFERRAL_URL: string = (process.env.REFERRAL_URL ?? '').trim();

export const hasReferral = REFERRAL_URL.length > 0;

/**
 * Nome della carta su cui il link e' generato: la pagina di destinazione
 * propone quella, e il lettore ha diritto di saperlo in anticipo. Si cambia
 * con REFERRAL_CARD quando si cambia il link.
 */
export const REFERRAL_CARD = (process.env.REFERRAL_CARD ?? 'Platino').trim();

/** Regolamento ufficiale del programma: la fonte da citare accanto al link. */
export const REFERRAL_TERMS_URL =
  'https://www.americanexpress.com/it-it/chi-siamo/legal/termes-et-conditions/presenta-un-amico/';

/**
 * Le carte riconoscibili dallo slug del link di presentazione. Serve a un solo
 * scopo: impedire che REFERRAL_CARD e REFERRAL_URL si contraddicano.
 */
const CARD_BY_SLUG: Record<string, string> = {
  platinum: 'Platino',
  gold: 'Oro',
  green: 'Verde',
  explorer: 'Explora',
  italo: 'Italo',
  payback: 'Payback',
  blu: 'Blu',
};

/*
 * Validazione a caricamento del modulo, come per i dati delle promozioni: una
 * variabile d'ambiente sbagliata deve far fallire la build, non produrre una
 * pagina con un richiamo rotto o una nota che mente al lettore.
 *
 * Il controllo sullo slug e' volutamente permissivo: se American Express
 * cambia i nomi degli URL non vogliamo una build rossa per un motivo che non
 * riguarda il lettore. Fallisce solo quando lo slug e' uno di quelli noti e
 * dice una carta diversa da REFERRAL_CARD, che e' il caso in cui la nota
 * "il link si apre sulla richiesta di una Carta X" direbbe il falso.
 */
if (hasReferral) {
  let url: URL;
  try {
    url = new URL(REFERRAL_URL);
  } catch {
    throw new Error(`REFERRAL_URL non e' un URL valido: ${REFERRAL_URL}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`REFERRAL_URL deve essere https, non ${url.protocol}`);
  }

  const slug = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const expected = CARD_BY_SLUG[slug];
  if (expected && expected !== REFERRAL_CARD) {
    throw new Error(
      `REFERRAL_URL punta a "${slug}" (${expected}) ma REFERRAL_CARD dice "${REFERRAL_CARD}": ` +
        'la nota sulla carta proposta direbbe il falso. Allinea le due variabili.',
    );
  }
}
