/**
 * Lettura delle condizioni ufficiali "Presenta un amico" di American Express.
 *
 * PERCHE' SI PUO' FARE COSI'
 * La pagina e' HTML servito dal server: tabelle vere, testo vero, nessun
 * rendering lato client. Basta `fetch` e qualche espressione regolare, senza
 * browser headless e senza dipendenze nuove.
 *
 * PRINCIPIO DI FONDO: MEGLIO ROMPERSI CHE INDOVINARE.
 * Il valore del sito e' l'accuratezza dello storico. Un parser che di fronte a
 * una riga inattesa tira via il tira-via ("non l'ho capita, la salto") produce
 * dati sbagliati senza che nessuno se ne accorga: e' il modo piu' rapido per
 * bruciare la credibilita' dell'archivio. Quindi qui ogni riga non riconosciuta,
 * ogni valore non interpretabile e ogni contraddizione interna alla pagina
 * lanciano `AmexParseError`. Il controllo giornaliero fallisce, arriva una
 * notifica, un umano guarda. E' il comportamento voluto.
 *
 * Questo modulo NON tocca il dataset: legge la pagina e restituisce cio' che
 * c'e' scritto. Il confronto con `promotions.json` sta in `watch-amex.ts`.
 */

export const SOURCE_URL =
  'https://www.americanexpress.com/it-it/chi-siamo/legal/termes-et-conditions/presenta-un-amico/';

export class AmexParseError extends Error {
  override name = 'AmexParseError';
}

/* -------------------------------------------------------------------------- */
/* Tipi                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Un lato dell'offerta come lo scrive Amex. Deliberatamente piu' povero di
 * `OfferSide`: la pagina esprime solo bonus in punti, eventualmente con soglia
 * di spesa. Se un giorno comparisse un cashback percentuale (la meccanica di
 * Blu) il parser lancerebbe invece di forzarlo in questa forma.
 */
export type ParsedSide = {
  type: 'bonus';
  amount: number;
  spend?: { amount: number; months: number };
};

export type Snapshot = {
  /** Giorno in cui la pagina e' stata letta (UTC). */
  fetchedAt: string;
  /**
   * Inizio e fine dell'offerta, dalla nota "valida per le richieste effettuate
   * dal … al …". `null` quando la pagina non porta quella nota: capita quando
   * l'offerta e' quella "base" fra due promozioni datate, e in quel caso non
   * si inventano ne' l'inizio ne' la fine (vedi `parseValidity`).
   */
  start: string | null;
  end: string | null;
  /** Data della tabella ("aggiornata al …"), quando presente. Serve da riscontro su `start`. */
  tableUpdatedAt: string | null;
  /** "Data di decorrenza" del regolamento: cambia raramente, non e' il periodo dell'offerta. */
  effectiveFrom: string | null;
  /** Chiave = card.id del dataset. Contiene solo le carte presenti in pagina. */
  offers: Record<string, { referred: ParsedSide; referrer: ParsedSide | null }>;
  /** Carte la cui riga porta l'asterisco, cioe' quelle a cui la nota con le date si riferisce. */
  dated: string[];
  /** Osservazioni non bloccanti, da mostrare a chi legge il report. */
  notes: string[];
};

/* -------------------------------------------------------------------------- */
/* Fetch                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Scarica la pagina. Gli User-Agent "da script" vengono serviti male da parecchi
 * CDN, quindi ci si presenta come un browser: e' una lettura pubblica di una
 * pagina pubblica, non un aggiramento di controlli.
 */
export async function fetchTerms(url = SOURCE_URL, attempts = 3): Promise<string> {
  let last: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
          'Accept-Language': 'it-IT,it;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const html = await res.text();
      // Una pagina di errore o un interstiziale antibot sono corti: meglio
      // accorgersene qui che scoprire piu' avanti "nessuna tabella trovata".
      if (html.length < 20_000) {
        throw new Error(`risposta troppo corta (${html.length} byte): pagina non attesa`);
      }
      return html;
    } catch (err) {
      last = err;
      if (i < attempts) {
        const wait = 2 ** i * 1000;
        console.warn(`  tentativo ${i}/${attempts} fallito (${describe(err)}), riprovo fra ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw new Error(`impossibile scaricare ${url}: ${describe(last)}`);
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* -------------------------------------------------------------------------- */
/* Normalizzazione del testo                                                   */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&euro;': '€',
  '&reg;': '',
};

/** Da frammento HTML a testo piatto: niente tag, niente entita', spazi normali. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’′]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tutto il testo della pagina, senza `<script>` e `<style>`. */
function pageText(html: string): string {
  return text(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '),
  );
}

/* -------------------------------------------------------------------------- */
/* Carte                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Da etichetta di riga a `card.id`.
 *
 * Amex elenca separatamente "Carta X" e "Carta di Credito X" (charge e revolving)
 * con lo stesso premio: il dataset ha una sola serie per prodotto, quindi le due
 * righe collassano sullo stesso id. Se un giorno riportassero valori diversi la
 * fusione diventerebbe una bugia, ed e' per questo che il conflitto e' un errore
 * bloccante (vedi `putRow`) e non un "vince l'ultima".
 */
const CARD_BY_LABEL: Record<string, string> = {
  verde: 'verde',
  oro: 'oro',
  platino: 'platino',
  explora: 'explora',
  italo: 'italo',
  payback: 'payback',
  'payback plus': 'payback-plus',
  business: 'business',
  'oro business': 'oro-business',
  'platino business': 'platino-business',
};

/**
 * Prodotti citati in pagina che il dataset non segue.
 *
 * Centurion e' su invito e non ha un'offerta pubblica; Blu ha un regolamento
 * separato (americanexpress.it/regolamento-amicoblu) e infatti non compare nelle
 * tabelle. Elencarli qui e' cio' che permette al parser di distinguere "riga che
 * non ci interessa" da "riga che non ho capito" — e di lanciare solo sulla seconda.
 */
const IGNORED_LABELS = new Set(['centurion', 'blu']);

function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[®™]/g, '')
    .replace(/american express/g, ' ')
    .replace(/\bcarta di credito\b/g, ' ')
    .replace(/\bcart[ae]\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Valori                                                                      */
/* -------------------------------------------------------------------------- */

/** "17.500" → 17500. Il punto e' separatore di migliaia, non decimale. */
function italianInt(raw: string): number {
  const n = Number(raw.replace(/\./g, ''));
  if (!Number.isInteger(n) || n < 0) {
    throw new AmexParseError(`numero non interpretabile: "${raw}"`);
  }
  return n;
}

const POINTS = /([\d.]+)\s*punti/i;
const SPEND = /spendendo\s*€?\s*([\d.]+)\s*(?:€\s*)?entro\s*(\d+)\s*mes/i;

/**
 * "17.500 punti spendendo €2.000 entro 6 mesi dall'emissione*" →
 * `{ type: 'bonus', amount: 17500, spend: { amount: 2000, months: 6 } }`.
 */
function parseSide(cell: string, where: string): ParsedSide {
  const points = POINTS.exec(cell);
  if (!points) {
    throw new AmexParseError(
      `${where}: nessun importo in punti in "${cell}". ` +
        `Se Amex ha cambiato meccanica (per esempio un cashback percentuale) ` +
        `il dato va inserito a mano e il parser va aggiornato.`,
    );
  }

  const side: ParsedSide = { type: 'bonus', amount: italianInt(points[1]!) };

  const spend = SPEND.exec(cell);
  if (spend) {
    side.spend = { amount: italianInt(spend[1]!), months: Number(spend[2]) };
  } else if (/spend|soglia/i.test(cell)) {
    // C'e' un requisito di spesa scritto in un modo che non riconosciamo:
    // registrarlo come "nessun requisito" falserebbe il confronto fra periodi.
    throw new AmexParseError(
      `${where}: requisito di spesa presente ma non interpretabile in "${cell}"`,
    );
  }

  return side;
}

/* -------------------------------------------------------------------------- */
/* Date                                                                        */
/* -------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Verifica che la data esista davvero: "31 aprile" deve fallire, non slittare al 1° maggio. */
function checkedIso(y: number, m: number, d: number, where: string): string {
  const s = iso(y, m, d);
  const parsed = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) {
    throw new AmexParseError(`${where}: data inesistente nel calendario (${d}/${m}/${y})`);
  }
  return s;
}

/** "13/11/2025" → "2025-11-13". */
function parseNumericDate(raw: string, where: string): string {
  const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(raw.trim());
  if (!m) throw new AmexParseError(`${where}: data non riconosciuta "${raw}"`);
  return checkedIso(Number(m[3]), Number(m[2]), Number(m[1]), where);
}

/**
 * Il periodo di validita' dell'offerta, dalla nota a pie' di tabella.
 *
 * Amex la scrive in prosa e con l'anno una volta sola: "dal 23 luglio al 31
 * agosto 2026". Piu' raramente compare in forma numerica. Sono coperte entrambe,
 * ed entrambe le forme ammettono il mese sottinteso sull'estremo iniziale
 * ("dal 3 al 17 marzo 2026").
 *
 * QUANDO LA NOTA NON C'E'. Non e' un errore di per se': e' lo stato in cui la
 * pagina mostra l'offerta "base", quella che resta attiva fra una promozione
 * datata e la successiva. Inventare una data qui violerebbe il principio del
 * modulo (vedi l'intestazione del file), quindi si restituisce `{ start: null,
 * end: null }` e la decisione — aprire un periodo senza fine, aspettare, o
 * altro — spetta a chi chiama (`watch-amex.ts`), che ha anche il contesto del
 * dataset per prenderla.
 */
function parseValidity(all: string): { start: string | null; end: string | null } {
  const where = 'periodo di validita\'';

  // Forma discorsiva: dal [g] [mese?] [anno?] al [g] [mese] [anno]
  const prose =
    /richieste\s+effettuate\s+dal\s+(\d{1,2})\s*°?\s*([a-zàèéìòù]+)?\s*(\d{4})?\s*al\s+(\d{1,2})\s*°?\s*([a-zàèéìòù]+)\s*(\d{4})/i.exec(
      all,
    );

  if (prose) {
    const [, d1, m1, y1, d2, m2, y2] = prose;
    const endMonth = MONTHS[m2!.toLowerCase()];
    if (!endMonth) throw new AmexParseError(`${where}: mese sconosciuto "${m2}"`);

    const startMonth = m1 ? MONTHS[m1.toLowerCase()] : endMonth;
    if (!startMonth) throw new AmexParseError(`${where}: mese sconosciuto "${m1}"`);

    const endYear = Number(y2);
    // L'anno d'inizio, quando non e' scritto, e' quello di fine — salvo che il
    // periodo scavalchi il capodanno (dal 20 dicembre al 10 gennaio 2027).
    const startYear = y1
      ? Number(y1)
      : startMonth > endMonth
        ? endYear - 1
        : endYear;

    return {
      start: checkedIso(startYear, startMonth, Number(d1), where),
      end: checkedIso(endYear, endMonth, Number(d2), where),
    };
  }

  // Forma numerica: dal 23/07/2026 al 31/08/2026
  const numeric =
    /richieste\s+effettuate\s+dal\s+(\d{1,2}[/.]\d{1,2}[/.]\d{4})\s+al\s+(\d{1,2}[/.]\d{1,2}[/.]\d{4})/i.exec(
      all,
    );

  if (numeric) {
    return {
      start: parseNumericDate(numeric[1]!, where),
      end: parseNumericDate(numeric[2]!, where),
    };
  }

  return { start: null, end: null };
}

/* -------------------------------------------------------------------------- */
/* Tabelle                                                                     */
/* -------------------------------------------------------------------------- */

type Row = { label: string; value: string; starred: boolean };

function tables(html: string): { header: string; rows: Row[] }[] {
  const out: { header: string; rows: Row[] }[] = [];

  for (const [table] of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows: Row[] = [];
    let header = '';

    for (const [tr] of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...tr.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((m) => ({
        head: m[1]!.toLowerCase() === 'h',
        text: text(m[2]!),
      }));
      if (cells.length < 2) continue;

      if (cells.every((c) => c.head) || /^prodotto/i.test(cells[0]!.text)) {
        header = cells.map((c) => c.text).join(' | ');
        continue;
      }

      const value = cells[1]!.text;
      rows.push({
        label: cells[0]!.text,
        value: value.replace(/\*+/g, '').trim(),
        starred: value.includes('*'),
      });
    }

    if (rows.length > 0) out.push({ header, rows });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                      */
/* -------------------------------------------------------------------------- */

export function parseTerms(html: string, fetchedAt = new Date().toISOString().slice(0, 10)): Snapshot {
  const all = pageText(html);
  const found = tables(html);

  const pick = (needle: RegExp, what: string) => {
    const matches = found.filter((t) => needle.test(t.header));
    if (matches.length === 0) {
      throw new AmexParseError(
        `tabella "${what}" non trovata (${found.length} tabelle in pagina: ` +
          `${found.map((t) => t.header || '(senza intestazione)').join(' / ')})`,
      );
    }
    if (matches.length > 1) {
      throw new AmexParseError(`piu' di una tabella "${what}": non so quale usare`);
    }
    return matches[0]!;
  };

  // L'ordine delle due tabelle in pagina non e' garantito, il testo delle
  // intestazioni si'. "presentato" e' prefisso di "presentatore", da cui il
  // lookahead negativo: senza, la tabella del presentato ne selezionerebbe due.
  const referrerTable = pick(/premio per il presentatore/i, 'premio per il presentatore');
  const referredTable = pick(/premio per il presentato(?!re)/i, 'premio per il presentato');

  const draft: Record<string, { referred?: ParsedSide; referrer?: ParsedSide }> = {};
  const dated = new Set<string>();
  const notes: string[] = [];
  const seen = new Map<string, string>();

  /** Registra una riga, rifiutando due letture diverse dello stesso prodotto. */
  function putRow(row: Row, side: 'referred' | 'referrer') {
    const label = normalizeLabel(row.label);
    if (!label) return;

    if (IGNORED_LABELS.has(label)) {
      notes.push(`riga ignorata (prodotto fuori dataset): "${row.label}"`);
      return;
    }

    const id = CARD_BY_LABEL[label];
    if (!id) {
      throw new AmexParseError(
        `prodotto non riconosciuto nella tabella "${side}": "${row.label}" (normalizzato: "${label}"). ` +
          `Se Amex ha aggiunto o rinominato una carta, aggiorna CARD_BY_LABEL in scripts/amex-terms.ts ` +
          `e, se serve, aggiungi la carta al dataset.`,
      );
    }

    const parsed = parseSide(row.value, `${id}.${side}`);
    const key = `${id}.${side}`;
    const fingerprint = JSON.stringify(parsed);
    const previous = seen.get(key);

    if (previous !== undefined && previous !== fingerprint) {
      throw new AmexParseError(
        `"${id}" compare piu' volte nella tabella "${side}" con valori diversi ` +
          `(${previous} vs ${fingerprint}): il dataset ha una sola serie per prodotto, ` +
          `quindi qui serve una decisione umana.`,
      );
    }
    seen.set(key, fingerprint);
    (draft[id] ??= {})[side] = parsed;

    if (row.starred) dated.add(id);
  }

  for (const row of referredTable.rows) putRow(row, 'referred');
  for (const row of referrerTable.rows) putRow(row, 'referrer');

  if (Object.keys(draft).length === 0) {
    throw new AmexParseError('tabelle trovate ma nessuna riga utile: pagina probabilmente cambiata');
  }

  const offers: Snapshot['offers'] = {};
  for (const [id, entry] of Object.entries(draft)) {
    // Il dataset non sa rappresentare un presentato senza offerta (`referred`
    // non e' nullable): se una carta comparisse solo fra i presentatori, meglio
    // fermarsi che inventare.
    if (!entry.referred) {
      throw new AmexParseError(
        `"${id}" compare solo nella tabella del presentatore: manca l'offerta del presentato`,
      );
    }
    offers[id] = { referred: entry.referred, referrer: entry.referrer ?? null };
  }

  const { start, end } = parseValidity(all);
  if (start === null) {
    notes.push(
      `nessuna nota "Offerta valida per le richieste effettuate dal … al …" in pagina: ` +
        `probabile offerta base, senza una finestra promozionale datata.`,
    );
  } else if (start > end!) {
    throw new AmexParseError(`periodo incoerente: inizio ${start} successivo alla fine ${end}`);
  }

  const updated = /aggiornat[ao]\s+al\s+(\d{1,2}[/.]\d{1,2}[/.]\d{4})/i.exec(all);
  const tableUpdatedAt = updated ? parseNumericDate(updated[1]!, 'data della tabella') : null;

  // Riscontro incrociato: le due date dicono la stessa cosa in due punti diversi
  // della pagina. Quando divergono di solito e' Amex ad aver aggiornato una
  // tabella senza toccare la nota — chi rivede il diff deve saperlo. Senza una
  // nota di validita' (start null) non c'e' niente con cui confrontare.
  if (tableUpdatedAt && start !== null && tableUpdatedAt !== start) {
    notes.push(
      `la tabella si dichiara "aggiornata al ${tableUpdatedAt}" ma la nota data l'offerta ` +
        `dal ${start}: verificare quale delle due e' la data buona`,
    );
  }

  const decorrenza = /data\s+di\s+decorrenza:?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{4})/i.exec(all);

  return {
    fetchedAt,
    start,
    end,
    tableUpdatedAt,
    effectiveFrom: decorrenza ? parseNumericDate(decorrenza[1]!, 'data di decorrenza') : null,
    offers,
    dated: [...dated],
    notes,
  };
}
