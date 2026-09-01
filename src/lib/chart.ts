import type { CardSeries, Segment } from './series.ts';
import { xDomain, yearTicks } from './series.ts';

/* -------------------------------------------------------------------------- */
/* Colore                                                                      */
/* -------------------------------------------------------------------------- */

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

export const lighten = (h: string, amount: number) =>
  toHex(hex(h).map((v) => v + (255 - v) * amount));

export const darken = (h: string, amount: number) => toHex(hex(h).map((v) => v * (1 - amount)));

/**
 * Varianti di colore per carta. Il sito ha un tema unico su fondo carta, quindi
 * una variante sola per ruolo: il colore identitario del dataset e' gia' portato
 * sopra 3:1 su chiaro, e la carta avorio non lo intacca in modo apprezzabile.
 *
 * Il colore identifica, non quantifica: sta nel campione accanto al nome e nel
 * tratto del grafico, mai nelle cifre — quelle restano inchiostro nero, al
 * massimo contrasto. Il presentatore e' informazione secondaria e deve apparire
 * tale: stessa tinta, piu' chiara. Il solo tratteggio non basta su schermi piccoli.
 */
export function palette(color: string) {
  return {
    line: color,
    referrer: lighten(color, 0.42),
    chip: color,
  };
}

/* -------------------------------------------------------------------------- */
/* Geometria                                                                   */
/* -------------------------------------------------------------------------- */

export interface Layout {
  width: number;
  plotHeight: number;
  stripHeight: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  gap: number;
  fontSize: number;
  fontSizeSmall: number;
  showAnnotations: boolean;
  showSpendLabels: boolean;
}

/**
 * Due varianti invece di una scalata via viewBox: uno scaling uniforme da 960 a
 * 360px porterebbe il testo a ~4px. Si alternano via CSS, restano entrambe nel
 * DOM (quindi entrambe leggibili dai crawler) e pesano pochi KB.
 */
// Il margine destro ospita solo il pallino terminale: il valore corrente vive
// nell'intestazione del riquadro, dove e' testo vero invece che etichetta SVG.
export const DESKTOP: Layout = {
  width: 960, plotHeight: 132, stripHeight: 26,
  marginLeft: 56, marginRight: 26, marginTop: 20, gap: 10,
  fontSize: 12, fontSizeSmall: 10,
  showAnnotations: true, showSpendLabels: true,
};

export const MOBILE: Layout = {
  width: 380, plotHeight: 82, stripHeight: 16,
  marginLeft: 38, marginRight: 16, marginTop: 12, gap: 7,
  fontSize: 10, fontSizeSmall: 8,
  showAnnotations: false, showSpendLabels: false,
};

export interface Scales {
  x: (t: number) => number;
  y: (v: number) => number;
  plotTop: number;
  plotBottom: number;
  plotLeft: number;
  plotRight: number;
  stripTop: number;
  stripBottom: number;
  height: number;
  yMax: number;
}

/** Estremo superiore "rotondo" per l'asse Y, che parte sempre da zero. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (max <= step * mag) return step * mag;
  }
  return 10 * mag;
}

export function scales(series: CardSeries, l: Layout): Scales {
  const plotTop = l.marginTop;
  const plotBottom = plotTop + l.plotHeight;
  const stripTop = plotBottom + l.gap;
  const stripBottom = stripTop + l.stripHeight;
  const plotLeft = l.marginLeft;
  const plotRight = l.width - l.marginRight;

  // L'asse Y parte SEMPRE da zero: su "quanti punti danno" un asse troncato
  // gonfia visivamente le variazioni ed e' una distorsione, non una scelta estetica.
  const yMax = niceMax(series.max);
  const span = plotRight - plotLeft;

  return {
    x: (t) => plotLeft + ((t - xDomain[0]) / (xDomain[1] - xDomain[0])) * span,
    y: (v) => plotBottom - (v / yMax) * l.plotHeight,
    plotTop, plotBottom, plotLeft, plotRight,
    stripTop, stripBottom,
    height: stripBottom + 2,
    yMax,
  };
}

/* -------------------------------------------------------------------------- */
/* Percorsi                                                                    */
/* -------------------------------------------------------------------------- */

const r = (n: number) => Math.round(n * 100) / 100;

/** Sequenze di segmenti con dato e contigui fra loro: i buchi spezzano la linea. */
export function runsOf(segments: Segment[]): Segment[][] {
  const runs: Segment[][] = [];
  let cur: Segment[] = [];
  for (const s of segments) {
    if (s.value === null) {
      if (cur.length) runs.push(cur);
      cur = [];
      continue;
    }
    const prev = cur[cur.length - 1];
    if (prev && prev.x1 !== s.x0) {
      runs.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/**
 * Percorso a gradini. Ogni promozione e' un tratto orizzontale alla sua quota;
 * il passaggio alla successiva e' un salto verticale istantaneo, perche' e'
 * esattamente cio' che succede: il 31 vale una cifra, il 1 ne vale un'altra.
 */
export function stepPath(run: Segment[], s: Scales): string {
  const parts: string[] = [];
  run.forEach((seg, i) => {
    const y = s.y(seg.value!);
    if (i === 0) parts.push(`M${r(s.x(seg.x0))},${r(y)}`);
    else parts.push(`V${r(y)}`);
    parts.push(`H${r(s.x(seg.x1))}`);
  });
  return parts.join('');
}

/**
 * Come `stepPath`, ma isola l'ultimo tratto in un percorso a parte quando il
 * suo periodo non ha ancora una data di fine: quel tratto arriva fino a oggi,
 * non fino alla fine dichiarata di un'offerta, e va disegnato diverso (vedi
 * `.serie-*-open` in global.css) perche' e' una previsione, non un dato letto.
 * Senza questa distinzione un'offerta "standard" senza fine appare come un
 * gradino piatto indistinguibile dal resto, invece che come un tratto ancora
 * in corso.
 */
export function stepPathSplit(run: Segment[], s: Scales): { solid: string; openTail: string | null } {
  const last = run[run.length - 1];
  if (!last || last.period.end !== null) return { solid: stepPath(run, s), openTail: null };

  const closed = run.slice(0, -1);
  const openY = r(s.y(last.value!));
  const parts: string[] = [];
  closed.forEach((seg, i) => {
    const y = s.y(seg.value!);
    if (i === 0) parts.push(`M${r(s.x(seg.x0))},${r(y)}`);
    else parts.push(`V${r(y)}`);
    parts.push(`H${r(s.x(seg.x1))}`);
  });
  parts.push(closed.length > 0 ? `V${openY}` : `M${r(s.x(last.x0))},${openY}`);

  return {
    solid: parts.join(''),
    openTail: `M${r(s.x(last.x0))},${openY}H${r(s.x(last.x1))}`,
  };
}

/** Stessa spezzata, chiusa sulla base: da' peso visivo al riquadro anche a 86px. */
export function stepArea(run: Segment[], s: Scales): string {
  const first = run[0]!;
  const last = run[run.length - 1]!;
  return `${stepPath(run, s)}L${r(s.x(last.x1))},${r(s.plotBottom)}L${r(s.x(first.x0))},${r(s.plotBottom)}Z`;
}

/* -------------------------------------------------------------------------- */
/* Annotazioni                                                                 */
/* -------------------------------------------------------------------------- */

export interface Annotation {
  x: number;
  y: number;
  text: string;
  kind: 'max' | 'min' | 'current';
}

/**
 * Solo massimo, minimo e valore corrente. Etichettare ogni punto e' cio' che
 * rende illeggibili i grafici densi: il requisito di spesa vive nella striscia
 * sotto e nella tabella, non sovrapposto alla curva.
 */
export function annotations(series: CardSeries, s: Scales, label: (seg: Segment) => string): Annotation[] {
  const known = series.referred.filter((x) => x.value !== null);
  if (known.length === 0) return [];

  const max = known.reduce((a, b) => (b.value! > a.value! ? b : a));
  const min = known.reduce((a, b) => (b.value! < a.value! ? b : a));
  const out: Annotation[] = [];

  const at = (seg: Segment) => ({ x: (s.x(seg.x0) + s.x(seg.x1)) / 2, y: s.y(seg.value!) });

  if (max.value !== min.value) {
    out.push({ ...at(max), text: label(max), kind: 'max' });
    out.push({ ...at(min), text: label(min), kind: 'min' });
  }
  return out;
}

/** Cambi di requisito di spesa: si etichetta solo dove il valore cambia. */
export function spendChanges(segments: Segment[]): { seg: Segment; label: string }[] {
  const out: { seg: Segment; label: string }[] = [];
  let prev: string | null = null;
  for (const seg of segments) {
    const key = seg.spend ? `${seg.spend.amount}/${seg.spend.months ?? ''}` : null;
    if (key !== null && key !== prev) out.push({ seg, label: key });
    prev = key;
  }
  return out;
}

export const yearLines = () => yearTicks();
