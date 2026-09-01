import { cards, currentPeriod, periods, periodsLastYear } from './promotions.ts';
import { formatDate, formatEnd, formatValue } from './format.ts';
import { maxValueOf } from './schema.ts';
import { hasReferral } from './site.ts';

/**
 * Sorgente unica per le FAQ visibili e per il JSON-LD FAQPage.
 * Tenerle separate significherebbe, prima o poi, markup strutturato che dice una
 * cosa e pagina che ne dice un'altra: e' una violazione delle linee guida sui
 * dati strutturati, oltre che un modo per mentire senza accorgersene.
 *
 * REGOLA DI SCRITTURA. Qui non si scrivono cifre a mano, e nemmeno affermazioni
 * che dipendono dalle cifre ("la Platino e' la piu' generosa", "le offerte sono
 * calate nel 2026"). Tutto cio' che cambia con una promozione nuova si calcola
 * dai dati: aggiornare il sito deve restare un lavoro su promotions.json, mai
 * una caccia alle frasi rimaste indietro.
 */
export interface FaqEntry {
  question: string;
  answer: string;
}

/** Carta con l'offerta piu' alta del periodo in corso dentro un gruppo. */
function topOffer(group: 'mr' | 'business') {
  if (!currentPeriod) return null;
  let best: { name: string; value: number } | null = null;
  for (const card of cards) {
    // Confronto solo a parita' di unita': punti Payback ed euro di cashback non
    // stanno sulla stessa scala dei Membership Rewards, e "la piu' generosa"
    // sarebbe una classifica fra grandezze diverse.
    if (card.group !== group || card.reward !== 'mr') continue;
    const offer = currentPeriod.offers[card.id];
    if (!offer) continue;
    const value = maxValueOf(offer.referred);
    // `name` e non `fullName`: la frase dice gia' "American Express", e "la
    // American Express Platino" e' un inciampo che nessuno pronuncerebbe.
    if (!best || value > best.value) best = { name: card.name, value };
  }
  return best ? `${best.name} (${formatValue(best.value, 'mr')} all'amico presentato)` : null;
}

/** Elenco in prosa: "Payback, Payback Plus e Blu". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

function cadence(): string {
  const recent = periodsLastYear();
  return recent >= 2
    ? `negli ultimi dodici mesi questo archivio ha registrato ${recent} periodi promozionali distinti`
    : `dal ${formatDate(periods[0]!.start)} questo archivio ha registrato ${periods.length} periodi promozionali distinti`;
}

export function buildFaq(): FaqEntry[] {
  const entries: FaqEntry[] = [];
  const period = currentPeriod;

  entries.push({
    question: 'Quanti punti da il Presenta un Amico American Express?',
    answer: period
      ? `Dipende dalla carta e dal periodo: American Express rivede le offerte di frequente e ${cadence()}. Gli importi del periodo in corso (${formatDate(period.start)} – ${formatEnd(period.end)}) sono elencati carta per carta in cima a questa pagina; quelli dei periodi precedenti nelle tavole storiche.`
      : `Dipende dalla carta e dal periodo: ${cadence()}. Il periodo attualmente in corso non e' ancora stato rilevato su questo sito: l'ultimo registrato si e' chiuso il ${formatEnd(periods[periods.length - 1]!.end)}.`,
  });

  const topMr = topOffer('mr');
  const topBusiness = topOffer('business');
  if (topMr) {
    entries.push({
      question: 'Qual e\' la carta che oggi da piu\' punti con il Presenta un Amico?',
      answer: `Nel periodo in corso, fra le carte consumer con Membership Rewards, e\' la ${topMr}.${topBusiness ? ` Fra le Business e\' la ${topBusiness}, che pero\' richiede una partita IVA e soglie di spesa maggiori.` : ''} La classifica cambia a ogni periodo.`,
    });
  }

  entries.push({
    question: 'Quanti punti prende chi presenta e quanti chi viene presentato?',
    answer:
      'Sono due importi distinti. L\'amico presentato riceve un bonus di benvenuto legato a un requisito di spesa da completare entro una finestra di mesi; il presentatore riceve un accredito separato, di norma senza spesa a suo carico. Nei grafici la linea piena e\' l\'amico presentato, quella tratteggiata il presentatore.',
  });

  entries.push({
    question: 'Quanti amici posso presentare? C\'e\' un limite ai punti che posso accumulare?',
    answer:
      'Si. Le condizioni ufficiali American Express fissano un tetto per anno solare e per titolare, non per singola carta: 300.000 punti Membership Rewards e 120.000 punti PAYBACK. Quanti amici servano per arrivarci dipende quindi da quanto vale l\'offerta della tua carta. Questo dato non fa parte della serie storica del sito: verificalo sulle condizioni ufficiali.',
  });

  const payback = cards.filter((c) => c.reward === 'payback');
  const cashback = cards.filter((c) => c.reward === 'eur');
  if (payback.length > 0 || cashback.length > 0) {
    const parts: string[] = [];
    if (payback.length > 0) {
      parts.push(
        `${nameList(payback.map((c) => c.name))} accredit${payback.length > 1 ? 'ano' : 'a'} punti Payback anziche' Membership Rewards: i due programmi non sono confrontabili e su questo sito hanno grafici separati.`,
      );
    }
    if (cashback.length > 0) {
      parts.push(
        `${nameList(cashback.map((c) => c.name))} riconosc${cashback.length > 1 ? 'ono' : 'e'} invece una percentuale di cashback per un periodo limitato e fino a un tetto di spesa: il valore indicato e' quindi un massimo, non un importo garantito.`,
      );
    }
    entries.push({
      question: 'Come funziona il Presenta un Amico sulle carte che non danno Membership Rewards?',
      answer: parts.join(' '),
    });
  }

  entries.push({
    question: 'I dati di questo sito sono ufficiali?',
    answer:
      'No. Questo e\' un sito indipendente, non affiliato ad American Express: i dati sono raccolti manualmente e possono contenere errori o ritardi. Prima di aderire a una promozione verifica sempre le condizioni sul sito ufficiale American Express o nella tua area riservata.',
  });

  // La domanda sul conflitto d'interessi compare solo quando il conflitto
  // esiste davvero: e' la stessa regola del colophon, in modo che pagina e
  // JSON-LD non possano dichiarare due cose diverse.
  if (hasReferral) {
    entries.push({
      question: 'Questo sito guadagna qualcosa se richiedo una carta?',
      answer:
        'Solo se parti dal link di presentazione in fondo alla home, dichiarato come tale: in quel caso American Express accredita dei punti a chi tiene l\'archivio. Il bonus del presentatore dipende dalla carta che possiede lui e non da quella che scegli tu, quindi le tavole e i confronti non cambiano. Non ci sono link di affiliazione, pubblicita\' o contenuti sponsorizzati.',
    });
  }

  return entries;
}

export const faq = buildFaq();
