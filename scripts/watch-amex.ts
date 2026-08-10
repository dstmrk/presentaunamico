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

type Plan = {
  /** Cosa succede al dataset. */
  kind: 'nessuna-novita' | 'aggiorna-periodo' | 'nuovo-periodo' | 'pagina-vecchia';
  /** Righe del report, gia' in italiano e gia' ordinate. */
  lines: string[];
  /** Avvisi che chi rivede la modifica deve leggere prima di approvarla. */
  warnings: string[];
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
  const warnings: string[] = [...snap.notes];

  /** Differenze fra le offerte della pagina e quelle di un periodo del dataset. */
  function offerDiff(period: Period): string[] {
    const out: string[] = [];
    for (const [id, parsed] of Object.entries(snap.offers)) {
      const reward = rewardOf.get(id);
      if (!reward) {
        warnings.push(`la pagina riporta "${id}", che nel dataset non esiste come carta`);
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
      warnings.push(
        `carte non presenti nella pagina, registrate come "non rilevato": ${missing.join(', ')}. ` +
          `Vanno completate a mano prima di considerare chiuso il periodo.`,
      );
    }
    return offers;
  }

  const source = () => ({
    url: SOURCE_URL,
    capturedAt: snap.fetchedAt,
    note: 'Condizioni ufficiali American Express, lette automaticamente da scripts/watch-amex.ts.',
  });

  /* --- La pagina precede l'ultimo periodo noto ---------------------------- */
  if (snap.start < latest.start) {
    return {
      kind: 'pagina-vecchia',
      headline: `la pagina mostra un'offerta (dal ${snap.start}) precedente all'ultimo periodo noto (dal ${latest.start})`,
      lines: [
        "Nessuna azione: quasi sempre e' una copia in cache servita dal CDN.",
        "Se si ripete per piu' giorni di fila, vale la pena guardare la pagina a mano.",
      ],
      warnings,
    };
  }

  /* --- Stesso periodo: eventuale correzione in corsa ---------------------- */
  if (snap.start === latest.start) {
    const diffs = offerDiff(latest);
    const endChanged = latest.end !== snap.end;

    if (diffs.length === 0 && !endChanged && !latest.datesEstimated) {
      return {
        kind: 'nessuna-novita',
        headline: `nessuna novita': offerta dal ${snap.start} al ${snap.end} invariata`,
        lines: [],
        warnings,
      };
    }

    if (endChanged) {
      lines.push(`fine periodo: ${latest.end} → ${snap.end}`);
      warnings.push(
        latest.end < snap.end
          ? "l'offerta e' stata prorogata: la fine del periodo si sposta in avanti"
          : "l'offerta chiude prima del previsto: la fine del periodo si sposta indietro",
      );
    }
    if (latest.datesEstimated) lines.push('date: da stimate a confermate dalla fonte');
    lines.push(...diffs);
    if (diffs.length > 0) {
      warnings.push(
        "i valori sono cambiati DENTRO un periodo gia' registrato: verificare che non si tratti " +
          'invece di un periodo nuovo che la pagina non ha ancora datato.',
      );
    }

    latest.end = snap.end;
    latest.datesEstimated = false;
    latest.source = source();
    for (const [id, parsed] of Object.entries(snap.offers)) {
      if (!rewardOf.has(id)) continue;
      latest.offers[id] = { referred: parsed.referred as OfferSide, referrer: parsed.referrer as OfferSide | null };
    }

    return {
      kind: 'aggiorna-periodo',
      headline: `periodo ${snap.start} → ${snap.end} aggiornato dalla fonte`,
      lines,
      warnings,
      next,
    };
  }

  /* --- Periodo nuovo ------------------------------------------------------ */
  if (snap.start <= latest.end) {
    // La nuova offerta parte prima della fine che avevamo registrato: quella
    // fine era una previsione presa dalla pagina di allora, questa e' un'osservazione.
    warnings.push(
      `l'offerta corrente parte il ${snap.start}, prima della fine registrata per il periodo ` +
        `precedente (${latest.end}): il periodo ${latest.start} → ${latest.end} viene accorciato ` +
        `al ${prevDay(snap.start)}. Controllare che sia davvero andata cosi'.`,
    );
    lines.push(`periodo precedente: fine ${latest.end} → ${prevDay(snap.start)}`);
    latest.end = prevDay(snap.start);
  } else if (snap.start !== nextDay(latest.end)) {
    warnings.push(
      `fra il ${latest.end} e il ${snap.start} resta scoperto un intervallo: un'offerta c'e' ` +
        `sempre, quindi in mezzo e' esistito un periodo che non abbiamo mai osservato. ` +
        `Va ricostruito a mano (di solito e' una finestra breve di raccordo).`,
    );
  }

  const created: Period = {
    start: snap.start,
    end: snap.end,
    datesEstimated: false,
    source: source(),
    offers: offersFromPage(),
  };

  lines.push(`nuovo periodo ${created.start} → ${created.end}`);
  lines.push(...offerDiff(latest).map((l) => `  ${l}`));
  periods.push(created);

  return {
    kind: 'nuovo-periodo',
    headline: `nuova offerta dal ${created.start} al ${created.end}`,
    lines,
    warnings,
    next,
  };
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

/** Riga per riga su stdout e, quando gira in Actions, nel riepilogo del job. */
function report(result: Plan, snap: Snapshot, applied: boolean) {
  const out: string[] = [];
  out.push(`Fonte letta il ${snap.fetchedAt}: offerta dal ${snap.start} al ${snap.end}`);
  if (snap.tableUpdatedAt) out.push(`Tabella dichiarata aggiornata al ${snap.tableUpdatedAt}`);
  out.push('');
  out.push(result.headline);
  if (result.lines.length > 0) {
    out.push('');
    out.push(...result.lines.map((l) => `  ${l}`));
  }
  if (result.warnings.length > 0) {
    out.push('');
    out.push('Da verificare:');
    out.push(...result.warnings.map((w) => `  ⚠︎ ${w}`));
  }
  if (result.next) {
    out.push('');
    out.push(applied ? 'src/data/promotions.json aggiornato.' : 'Nessuna scrittura: rilancia con --apply.');
  }

  console.log(out.join('\n'));

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      `## Condizioni Amex — ${snap.fetchedAt}\n\n${result.headline}\n\n` +
        (result.lines.length ? '```\n' + result.lines.join('\n') + '\n```\n\n' : '') +
        (result.warnings.length ? result.warnings.map((w) => `> ⚠︎ ${w}`).join('\n>\n') + '\n' : ''),
    );
  }

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(
      output,
      [
        `changed=${applied ? 'true' : 'false'}`,
        `kind=${result.kind}`,
        `headline=${result.headline}`,
        `period=${snap.start}_${snap.end}`,
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
