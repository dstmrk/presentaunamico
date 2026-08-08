import { cards, currentPeriod, periods } from './promotions.ts';
import { describeOffer, formatDate, formatValue } from './format.ts';
import { maxValueOf } from './schema.ts';

/**
 * Sorgente unica per le FAQ visibili e per il JSON-LD FAQPage.
 * Tenerle separate significherebbe, prima o poi, markup strutturato che dice una
 * cosa e pagina che ne dice un'altra: e' una violazione delle linee guida sui
 * dati strutturati, oltre che un modo per mentire senza accorgersene.
 */
export interface FaqEntry {
  question: string;
  answer: string;
}

function currentTop(): string {
  const period = currentPeriod;
  if (!period) {
    const last = periods[periods.length - 1]!;
    return `L'ultimo periodo rilevato si e' chiuso il ${formatDate(last.end)} e il periodo successivo non e' ancora stato registrato su questo sito.`;
  }
  const rows = cards
    .map((c) => {
      const offer = period.offers[c.id];
      if (!offer) return null;
      return `${c.name}: ${formatValue(maxValueOf(offer.referred), c.reward)}`;
    })
    .filter(Boolean);
  return `Nel periodo in corso (${formatDate(period.start)} – ${formatDate(period.end)}): ${rows.join('; ')}.`;
}

export function buildFaq(): FaqEntry[] {
  const platino = cards.find((c) => c.id === 'platino');
  const platinoOffer = currentPeriod && platino ? currentPeriod.offers[platino.id] : null;

  return [
    {
      question: 'Quanti punti da il Presenta un Amico American Express?',
      answer:
        `Dipende dalla carta e dal periodo: le offerte cambiano ogni una o due mesi. ${currentTop()}`,
    },
    {
      question: 'Quanti punti prende chi presenta e quanti chi viene presentato?',
      answer:
        'Sono due importi distinti. L\'amico presentato riceve un bonus di benvenuto subordinato a un requisito di spesa da completare entro un numero di mesi; il presentatore riceve un accredito separato, di norma senza requisito di spesa a suo carico. Su questo sito le due cifre sono sempre mostrate separate: la linea piena e\' l\'amico presentato, quella tratteggiata il presentatore.',
    },
    {
      question: 'Qual e\' la carta che oggi da piu\' punti con il Presenta un Amico?',
      answer: platinoOffer
        ? `Fra le carte consumer con Membership Rewards la Platino e\' storicamente la piu\' generosa: nel periodo in corso offre ${describeOffer(platinoOffer.referred, 'mr')} all'amico presentato. Le carte Business arrivano a importi piu\' alti ma richiedono una partita IVA e soglie di spesa maggiori.`
        : 'Storicamente la Platino e le carte Business offrono gli importi piu\' alti, a fronte pero\' di requisiti di spesa proporzionalmente maggiori. Il confronto periodo per periodo e\' nei grafici e nella tabella storica.',
    },
    {
      question: 'Quanti amici posso presentare? C\'e\' un limite ai punti che posso accumulare?',
      answer:
        'Si. Le condizioni ufficiali American Express fissano un tetto per anno solare e per titolare, non per singola carta: 300.000 punti Membership Rewards e 120.000 punti PAYBACK. Il numero di amici presentabili non e\' quindi fisso, dipende da quanto vale l\'offerta della tua carta: con un accredito da 50.000 punti si arriva al tetto Membership Rewards con sei presentazioni andate a buon fine, con uno da 3.500 punti ne servono molte di piu\'. Questo dato non fa parte della serie storica del sito ed e\' aggiornato alla data indicata nel piede della pagina: verificalo sulle condizioni ufficiali.',
    },
    {
      question: 'Le offerte Presenta un Amico cambiano nel tempo?',
      answer:
        'Si, e spesso: American Express rivede le offerte ogni una o due mesi e non pubblica un archivio delle promozioni passate. Questo sito esiste per conservare quello storico. Nel 2026 si osserva un movimento doppio: gli importi in punti sono calati e contemporaneamente i requisiti di spesa sono saliti, con finestre di 6 mesi.',
    },
    {
      question: 'Il requisito di spesa vale anche per chi presenta?',
      answer:
        'No. La soglia di spesa e\' a carico dell\'amico presentato, che deve raggiungerla entro la finestra prevista per ottenere il bonus di benvenuto. Il presentatore riceve il proprio accredito senza dover spendere nulla di aggiuntivo.',
    },
    {
      question: 'Come funziona il Presenta un Amico sulle carte che non danno Membership Rewards?',
      answer:
        'Payback e Payback Plus accreditano punti Payback anziche\' Membership Rewards: i due programmi non sono confrontabili e su questo sito hanno grafici separati con la loro unita\'. La Blu funziona ancora diversamente: all\'amico presentato riconosce una percentuale di cashback per un periodo limitato e fino a un tetto di spesa, quindi il valore indicato e\' un massimo ottenibile e non un importo garantito.',
    },
    {
      question: 'I dati di questo sito sono ufficiali?',
      answer:
        'No. Questo e\' un sito indipendente, non affiliato ad American Express. I dati sono raccolti manualmente e possono contenere errori, ritardi o imprecisioni: le date dei periodi piu\' vecchi sono in parte ricostruite. Prima di aderire a una promozione verifica sempre le condizioni sul sito ufficiale American Express o nella tua area riservata.',
    },
  ];
}

export const faq = buildFaq();
