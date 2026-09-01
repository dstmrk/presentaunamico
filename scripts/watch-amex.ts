/**
 * Controllo giornaliero delle condizioni ufficiali Amex.
 *
 *   npm run watch            # legge la pagina e dice cosa cambierebbe
 *   npm run watch -- --apply # scrive le novita' in src/data/promotions.json
 *   npm run watch -- --html tmp/pagina.html   # legge un file locale (test)
 *
 * COSA FA E COSA NON FA
 * Confronta la pagina con l'ULTIMO periodo del dataset e propone la modifica
 * minima che rende il dataset coerente con quanto pubblicato oggi. Non tocca
 * mai i periodi passati, con una sola eccezione dichiarata: se Amex ha fatto
 * partire l'offerta corrente PRIMA della fine che avevamo registrato, l'ultimo
 * periodo viene accorciato (vedi `plan`, caso "anticipo"). Era una previsione,
 * la pagina e' un'osservazione, e l'osservazione vince.
 *
 * Le carte che la pagina non copre (Blu, che ha un regolamento separato) NON
 * vengono riportate dal periodo precedente: finiscono a `null`, cioe' "non
 * rilevato", e il report lo dice a chiare lettere. Trascinare un valore vecchio
 * su un periodo nuovo significherebbe inventare un dato, che e' esattamente
 * cio' che questo archivio non deve fare.
 *
 * Ogni esito viene classificato come di ROUTINE o DA RIVEDERE (vedi `isRoutine`):
 * e' cio' che permette al controllo giornaliero di pubblicare da solo le letture
 * noiose e di fermarsi, aprendo una PR, su tutte le altre.
 *
 * Uscita: 0 se non c'e' nulla da fare o se la modifica e' stata applicata,
 * 1 se serve un umano (pagina illeggibile, anomalia, dataset che non valida).
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchTerms, parseTerms, SOURCE_URL, AmexParseError, type Snapshot, type ParsedSide } from './amex-terms.ts';
import { datasetSchema, crossValidate, type Dataset, type Period, type OfferSide } from '../src/lib/schema.ts';
import { describeOffer } from '../src/lib/format.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data/promotions.json');

/* -------------------------------------------------------------------------- */
/* Argomenti                                                                   */
/* -------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('help')) {
  console.log(
    [
      'Uso: npm run watch -- [opzioni]',
      '',
      '  --apply         scrive le modifiche in src/data/promotions.json',
      '  --html <file>   legge un file HTML locale invece della pagina Amex',
      '  --url <url>     legge un URL diverso da quello ufficiale',
      '',
      `Fonte predefinita: ${SOURCE_URL}`,
    ].join('\n'),
  );
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Confronto                                                                   */
/* -------------------------------------------------------------------------- */

const nextDay = (isoDate: string) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const prevDay = (isoDate: string) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Uguaglianza strutturale fra due lati dell'offerta, `null` compreso. */
const sameSide = (a: OfferSide | ParsedSide | null | undefined, b: OfferSide | ParsedSide | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Carte che la pagina legittimamente non copre.
 *
 * Blu ha un regolamento a parte (americanexpress.it/regolamento-amicoblu) e non
 * e' mai comparsa in queste tabelle: trovarla assente e' la normalita', non una
 * notizia. Se invece sparisse una carta che di solito c'e', quello e' un fatto
 * che merita un paio d'occhi — da cui la distinzione.
 */
const ASSENZE_ATTESE = new Set(['blu']);

type Plan = {
  /** Cosa succede al dataset. */
  kind: 'nessuna-novita' | 'aggiorna-periodo' | 'nuovo-periodo' | 'pagina-vecchia';
  /** Righe del report, gia' in italiano e gia' ordinate. */
  lines: string[];
  /** Tutto cio' che vale la pena leggere prima di approvare. */
  warnings: string[];
  /**
   * Il sottoinsieme di `warnings` che pretende un umano. Vuoto = lettura di
   * routine, e il controllo giornaliero puo' portarla in fondo da solo.
   */
  review: string[];
  /** Dataset risultante. Assente quando non c'e' nulla da scrivere. */
  next?: Dataset;
  /** Titolo di una riga, per commit e PR. */
  headline: string;
};

function plan(dataset: Dataset, snap: Snapshot): Plan {
  const next: Dataset = structuredClone(dataset);
  const periods = next.periods.sort((a, b) => a.start.localeCompare(b.start));
  const latest = periods[periods.length - 1]!;
  const rewardOf = new Map(next.cards.map((c) => [c.id, c.reward]));

  const lines: string[] = [];
  const warnings: string[] = [];
  const review: string[] = [];

  /** Avviso informativo: si legge nel report, non ferma nulla. */
  const nota = (msg: string) => warnings.push(msg);

  /** Avviso che pretende un umano: blocca il merge automatico. */
  const daRivedere = (msg: string) => {
    warnings.push(msg);
    review.push(msg);
  };

  // Il parser segnala solo cose davvero anomale (una riga per un prodotto che
  // non seguiamo, le due date della pagina in disaccordo): tutte da rivedere.
  for (const n of snap.notes) daRivedere(n);

  /** Differenze fra le offerte della pagina e quelle di un periodo del dataset. */
  function offerDiff(period: Period): string[] {
    const out: string[] = [];
    for (const [id, parsed] of Object.entries(snap.offers)) {
      const reward = rewardOf.get(id);
      if (!reward) {
        daRivedere(`la pagina riporta "${id}", che nel dataset non esiste come carta`);
        continue;
      }
      const current = period.offers[id] ?? null;
      for (const side of ['referred', 'referrer'] as const) {
        const now = current?.[side] ?? null;
        const then = parsed[side];
        if (sameSide(now, then)) continue;
        const before = now ? describeOffer(now, reward) : 'non rilevato';
        const after = then ? describeOffer(then as OfferSide, reward) : 'non rilevato';
        out.push(`${id} · ${side === 'referred' ? 'presentato' : 'presentatore'}: ${before} → ${after}`);
      }
    }
    return out.sort();
  }

  /** Le offerte della pagina nel formato del dataset, con `null` per cio' che non copre. */
  function offersFromPage(): Period['offers'] {
    const offers: Period['offers'] = {};
    const missing: string[] = [];

    for (const card of next.cards) {
      const parsed = snap.offers[card.id];
      if (parsed) {
        offers[card.id] = { referred: parsed.referred as OfferSide, referrer: parsed.referrer as OfferSide | null };
      } else {
        offers[card.id] = null;
        missing.push(card.id);
      }
    }

    if (missing.length > 0) {
      const inattese = missing.filter((id) => !ASSENZE_ATTESE.has(id));
      const msg =
        `carte non presenti nella pagina, registrate come "non rilevato": ${missing.join(', ')}. ` +
        `Vanno completate a mano prima di considerare chiuso il periodo.`;
      if (inattese.length > 0) daRivedere(`${msg} Inattese: ${inattese.join(', ')}.`);
      else nota(msg);
    }
    return offers;
  }

  const source = () => ({
    url: SOURCE_URL,
    capturedAt: snap.fetchedAt,
    note: 'Condizioni ufficiali American Express, lette automaticamente da scripts/watch-amex.ts.',
  });

  /* --- La pagina non porta date: offerta "base", senza finestra promozionale --
   *
   * Non e' un errore: e' lo stato che la pagina mostra fra una promozione datata
   * e la successiva. Cosa farne dipende da com'e' fatto l'ultimo periodo noto.
   */
  if (snap.start === null) {
    if (latest.end === null) {
      // Il periodo aperto in coda prosegue: stesso trattamento di "stesso
      // periodo" per un periodo chiuso, ma senza una fine da confrontare.
      const diffs = offerDiff(latest);
      if (diffs.length === 0) {
        return {
          kind: 'nessuna-novita',
          headline: `nessuna novita': periodo aperto dal ${latest.start} invariato`,
          lines: [],
          warnings,
          review,
        };
      }
      daRivedere(
        "i valori sono cambiati DENTRO il periodo aperto in coda: verificare che non si tratti " +
          'invece di una promozione nuova che la pagina non ha ancora datato.',
      );
      lines.push(...diffs);
      latest.source = source();
      for (const [id, parsed] of Object.entries(snap.offers)) {
        if (!rewardOf.has(id)) continue;
        latest.offers[id] = { referred: parsed.referred as OfferSide, referrer: parsed.referrer as OfferSide | null };
      }
      return {
        kind: 'aggiorna-periodo',
        headline: `periodo aperto dal ${latest.start}: valori aggiornati dalla fonte`,
        lines,
        warnings,
        review,
        next,
      };
    }

    // L'ultimo periodo noto ha una fine dichiarata, ma oggi la pagina non porta
    // piu' la nota con le date: si apre un nuovo periodo, contiguo al precedente,
    // SENZA fine. E' sempre da rivedere: non sappiamo quando finira', e non lo
    // inventiamo.
    daRivedere(
      `la pagina non riporta piu' la nota con le date della promozione: probabile ritorno ` +
        `all'offerta base. Si apre un nuovo periodo dal ${nextDay(latest.end)}, senza data di ` +
        `fine: andra' chiuso quando la pagina tornera' a datare l'offerta.`,
    );

    const created: Period = {
      start: nextDay(latest.end),
      end: null,
      datesEstimated: false,
      source: source(),
      offers: offersFromPage(),
    };

    lines.push(`nuovo periodo (senza fine) dal ${created.start}`);
    lines.push(...offerDiff(latest).map((l) => `  ${l}`));
    periods.push(created);

    return {
      kind: 'nuovo-periodo',
      headline: `nuova offerta, senza data di fine, dal ${created.start}`,
      lines,
      warnings,
      review,
      next,
    };
  }

  // Da qui in poi la pagina porta date esplicite: `snap.start`/`snap.end` non
  // sono null (`parseValidity` li restituisce sempre insieme).
  const snapStart = snap.start;
  const snapEnd = snap.end!;

  if (latest.end === null) {
    // Il periodo aperto in coda si chiude qui: la pagina ha finalmente datato
    // una promozione. E' sempre da rivedere: la data di chiusura non e' stata
    // osservata direttamente, si deduce dall'inizio della promozione nuova.
    if (snapStart < latest.start) {
      daRivedere(
        `la nuova offerta datata parte il ${snapStart}, prima dell'inizio del periodo aperto ` +
          `(${latest.start}): incoerente, va controllato a mano.`,
      );
      return {
        kind: 'pagina-vecchia',
        headline: `date incoerenti con il periodo aperto dal ${latest.start}`,
        lines: [],
        warnings,
        review,
      };
    }
    daRivedere(
      `il periodo aperto dal ${latest.start} si chiude al ${prevDay(snapStart)}: la pagina ha ` +
        `datato una nuova promozione a partire dal ${snapStart}.`,
    );
    lines.push(`periodo precedente: fine (nessuna, in corso) → ${prevDay(snapStart)}`);
    latest.end = prevDay(snapStart);
    // Prosegue sotto con la creazione del periodo nuovo, ora contiguo per
    // costruzione al periodo appena chiuso.
  } else {
    /* --- La pagina precede l'ultimo periodo noto -------------------------- */
    if (snapStart < latest.start) {
      return {
        kind: 'pagina-vecchia',
        headline: `la pagina mostra un'offerta (dal ${snapStart}) precedente all'ultimo periodo noto (dal ${latest.start})`,
        lines: [
          "Nessuna azione: quasi sempre e' una copia in cache servita dal CDN.",
          "Se si ripete per piu' giorni di fila, vale la pena guardare la pagina a mano.",
        ],
        warnings,
        review,
      };
    }

    /* --- Stesso periodo: eventuale correzione in corsa --------------------- */
    if (snapStart === latest.start) {
      const diffs = offerDiff(latest);
      const endChanged = latest.end !== snapEnd;

      if (diffs.length === 0 && !endChanged && !latest.datesEstimated) {
        return {
          kind: 'nessuna-novita',
          headline: `nessuna novita': offerta dal ${snapStart} al ${snapEnd} invariata`,
          lines: [],
          warnings,
          review,
        };
      }

      // Qui si riscrive un periodo GIA' PUBBLICATO, e riscrivere lo storico non e'
      // mai di routine: che sia una proroga o una correzione di valori, la decide
      // un umano. La regola per intero sta su `isRoutine`.
      if (endChanged) {
        lines.push(`fine periodo: ${latest.end} → ${snapEnd}`);
        daRivedere(
          latest.end! < snapEnd
            ? "l'offerta e' stata prorogata: la fine di un periodo gia' pubblicato si sposta in avanti"
            : "l'offerta chiude prima del previsto: la fine di un periodo gia' pubblicato si sposta indietro",
        );
      }
      if (latest.datesEstimated) {
        lines.push('date: da stimate a confermate dalla fonte');
        daRivedere('le date del periodo passano da stimate a confermate dalla fonte');
      }
      lines.push(...diffs);
      if (diffs.length > 0) {
        daRivedere(
          "i valori sono cambiati DENTRO un periodo gia' registrato: verificare che non si tratti " +
            'invece di un periodo nuovo che la pagina non ha ancora datato.',
        );
      }

      latest.end = snapEnd;
      latest.datesEstimated = false;
      latest.source = source();
      for (const [id, parsed] of Object.entries(snap.offers)) {
        if (!rewardOf.has(id)) continue;
        latest.offers[id] = { referred: parsed.referred as OfferSide, referrer: parsed.referrer as OfferSide | null };
      }

      return {
        kind: 'aggiorna-periodo',
        headline: `periodo ${snapStart} → ${snapEnd} aggiornato dalla fonte`,
        lines,
        warnings,
        review,
        next,
      };
    }
  }

  /* --- Periodo nuovo ------------------------------------------------------
   * Da qui `latest.end` non e' mai null: o lo era gia' all'ingresso e questa
   * pagina non l'ha toccato (ramo `else`), oppure e' stato appena chiuso pochi
   * righe sopra.
   */
  if (snapStart <= latest.end!) {
    // La nuova offerta parte prima della fine che avevamo registrato: quella
    // fine era una previsione presa dalla pagina di allora, questa e' un'osservazione.
    daRivedere(
      `l'offerta corrente parte il ${snapStart}, prima della fine registrata per il periodo ` +
        `precedente (${latest.end}): il periodo ${latest.start} → ${latest.end} viene accorciato ` +
        `al ${prevDay(snapStart)}. Controllare che sia davvero andata cosi'.`,
    );
    lines.push(`periodo precedente: fine ${latest.end} → ${prevDay(snapStart)}`);
    latest.end = prevDay(snapStart);
  } else if (snapStart !== nextDay(latest.end!)) {
    daRivedere(
      `fra il ${latest.end} e il ${snapStart} resta scoperto un intervallo: un'offerta c'e' ` +
        `sempre, quindi in mezzo e' esistito un periodo che non abbiamo mai osservato. ` +
        `Va ricostruito a mano (di solito e' una finestra breve di raccordo).`,
    );
  }

  const created: Period = {
    start: snapStart,
    end: snapEnd,
    datesEstimated: false,
    source: source(),
    offers: offersFromPage(),
  };

  lines.push(`nuovo periodo ${created.start} → ${created.end}`);
  lines.push(...offerDiff(latest).map((l) => `  ${l}`));
  periods.push(created);

  return {
    kind: 'nuovo-periodo',
    headline: `nuova offerta dal ${created.start} al ${created.end}`, // created.end qui non e' mai null
    lines,
    warnings,
    review,
    next,
  };
}

/**
 * Una lettura e' di ROUTINE — e allora il controllo giornaliero la porta in
 * fondo da solo — solo se aggiunge un periodo in coda senza toccare nulla di
 * gia' pubblicato e senza nessuna anomalia.
 *
 * La regola, in una riga: l'automazione puo' AGGIUNGERE allo storico, mai
 * RISCRIVERLO. Un periodo nuovo in coda e' un fatto che la pagina afferma per
 * intero e che nessun dato precedente contraddice; accorciare un periodo,
 * prorogarlo o correggerne i valori significa invece dire che cio' che il sito
 * ha pubblicato finora era sbagliato — ed e' una frase che deve pronunciare una
 * persona, non un cron.
 */
const isRoutine = (result: Plan) =>
  result.next !== undefined && result.kind === 'nuovo-periodo' && result.review.length === 0;

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

/** Riga per riga su stdout e, quando gira in Actions, nel riepilogo del job. */
function report(result: Plan, snap: Snapshot, applied: boolean) {
  const out: string[] = [];
  out.push(
    snap.start
      ? `Fonte letta il ${snap.fetchedAt}: offerta dal ${snap.start} al ${snap.end}`
      : `Fonte letta il ${snap.fetchedAt}: offerta senza date esplicite (nessuna nota di validita' in pagina)`,
  );
  if (snap.tableUpdatedAt) out.push(`Tabella dichiarata aggiornata al ${snap.tableUpdatedAt}`);
  out.push('');
  out.push(result.headline);
  if (result.lines.length > 0) {
    out.push('');
    out.push(...result.lines.map((l) => `  ${l}`));
  }
  const routine = isRoutine(result);

  if (result.warnings.length > 0) {
    out.push('');
    out.push('Da verificare:');
    out.push(...result.warnings.map((w) => `  ${result.review.includes(w) ? '⚠︎' : '·'} ${w}`));
  }
  if (result.next) {
    out.push('');
    out.push(applied ? 'src/data/promotions.json aggiornato.' : 'Nessuna scrittura: rilancia con --apply.');
    out.push(
      routine
        ? 'Lettura di routine: aggiunge un periodo in coda senza toccare lo storico.'
        : `Serve una revisione umana (${result.review.length} ${result.review.length === 1 ? 'motivo' : 'motivi'}).`,
    );
  }

  console.log(out.join('\n'));

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      `## Condizioni Amex — ${snap.fetchedAt}\n\n${result.headline}\n\n` +
        (result.next ? `**${routine ? 'Lettura di routine' : 'Serve una revisione umana'}**\n\n` : '') +
        (result.lines.length ? '```\n' + result.lines.join('\n') + '\n```\n\n' : '') +
        (result.warnings.length
          ? result.warnings.map((w) => `> ${result.review.includes(w) ? '⚠︎' : '·'} ${w}`).join('\n>\n') + '\n'
          : ''),
    );
  }

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(
      output,
      [
        `changed=${applied ? 'true' : 'false'}`,
        `kind=${result.kind}`,
        `routine=${routine ? 'true' : 'false'}`,
        `headline=${result.headline}`,
        `period=${snap.start ?? 'base'}_${snap.end ?? 'aperto'}`,
        // Multilinea: delimitatore esplicito, come vuole il protocollo di Actions.
        `review<<FINE_REVIEW`,
        ...result.review.map((r) => `- ${r}`),
        `FINE_REVIEW`,
      ].join('\n') + '\n',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

const issuesOf = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.map((i) => `  • ${i.path.join('.') || '(radice)'}: ${i.message}`).join('\n');

async function main() {
  const local = option('html');
  if (argv.includes('--html') && !local) throw new Error('--html richiede il percorso di un file');

  const html = local ? readFileSync(resolve(local), 'utf8') : await fetchTerms(option('url') ?? SOURCE_URL);
  const snap = parseTerms(html);

  // Si lavora sull'oggetto grezzo, non su quello che esce da zod: cosi' l'ordine
  // originale delle chiavi resta intatto e il diff mostra solo cio' che cambia
  // davvero, invece di riformattare venti periodi storici.
  const current = JSON.parse(readFileSync(DATA, 'utf8')) as Dataset;
  const before = datasetSchema.safeParse(current);
  if (!before.success) {
    throw new Error(
      `src/data/promotions.json non e' valido nemmeno prima di questo controllo:\n${issuesOf(before.error)}`,
    );
  }

  const result = plan(current, snap);

  if (!result.next) {
    report(result, snap, false);
    return;
  }

  // Si valida PRIMA di scrivere: un dataset rotto non deve mai toccare il disco,
  // perche' da li' finirebbe in un commit e la build morirebbe dopo, altrove.
  const after = datasetSchema.safeParse(result.next);
  if (!after.success) {
    throw new Error(`la modifica proposta non rispetta lo schema:\n${issuesOf(after.error)}`);
  }

  // Solo gli errori: gli avvisi di `crossValidate` sono in buona parte permanenti
  // (Blu senza dati, presentatori mai rilevati) e ripeterli ogni giorno sarebbe
  // rumore. Quelli che riguardano la modifica in corso li produce gia' `plan`.
  const { errors } = crossValidate(after.data);
  if (errors.length > 0) {
    throw new Error(
      `la modifica proposta renderebbe il dataset incoerente:\n` +
        errors.map((e) => `  • ${e}`).join('\n') +
        `\n\nProposta: ${result.headline}`,
    );
  }

  const applied = flag('apply');
  if (applied) writeFileSync(DATA, JSON.stringify(result.next, null, 2) + '\n');

  report(result, snap, applied);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    `\n✗ controllo delle condizioni Amex fallito\n\n${message}\n\n` +
      (err instanceof AmexParseError
        ? `La pagina non e' piu' come il parser se l'aspetta: va guardata a mano ` +
          `(${SOURCE_URL}) e va aggiornato scripts/amex-terms.ts.\n`
        : ''),
  );
  process.exitCode = 1;
});
