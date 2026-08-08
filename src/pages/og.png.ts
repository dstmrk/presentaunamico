import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

import { groups, currentPeriod, lastKnownOffer, periods } from '../lib/promotions.ts';
import { formatDate, formatValue } from '../lib/format.ts';
import { maxValueOf } from '../lib/schema.ts';
import { palette } from '../lib/chart.ts';
import { SITE_NAME } from '../lib/site.ts';

export const prerender = true;

const require = createRequire(import.meta.url);

// Satori legge woff/ttf, non woff2: qui servono i pacchetti statici, mentre la
// pagina usa la variabile. Sono gli stessi caratteri del sito, quindi la
// miniatura condivisa e la pagina aperta si somigliano davvero.
const serif = (weight: 400 | 600) =>
  readFileSync(require.resolve(`@fontsource/source-serif-4/files/source-serif-4-latin-${weight}-normal.woff`));
const mono = (weight: 400 | 600) =>
  readFileSync(require.resolve(`@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${weight}-normal.woff`));

/* Stessi token del foglio di stile: carta, inchiostro, un accento solo. */
const PAPER = '#faf7f0';
const INK = '#16130f';
const INK_SOFT = '#4a443b';
const INK_FAINT = '#736a5c';
const RULE = '#b9ae98';
const ACCENT = '#9a2c1f';

/** Nessun asset grafico American Express: solo testo, colori e forme nostre. */
const h = (type: string, props: Record<string, unknown>) => ({ type, props });

function highlights() {
  const source = currentPeriod;
  // Stesso ordine della pagina: consumer prima, poi business, poi le altre.
  return groups.flatMap((g) => g.cards).slice(0, 6).map((card) => {
    const offer = source?.offers[card.id] ?? lastKnownOffer(card.id)?.offer ?? null;
    return {
      name: card.name,
      color: palette(card.color).chip,
      value: offer ? formatValue(maxValueOf(offer.referred), card.reward) : 'n/d',
    };
  });
}

/** Riga di registro con puntini di guida, come nel prospetto in home. */
const ledgerRow = (c: { name: string; color: string; value: string }) =>
  h('div', {
    style: {
      display: 'flex', alignItems: 'center', width: '484px',
      paddingBottom: '9px', marginBottom: '9px',
      borderBottom: `1px solid ${RULE}`,
    },
    children: [
      h('div', {
        style: { display: 'flex', width: '6px', height: '22px', backgroundColor: c.color, marginRight: '12px' },
        children: [],
      }),
      h('div', { style: { fontSize: '26px', fontWeight: 600, color: INK }, children: c.name }),
      h('div', {
        // Satori non conosce `dotted`: `dashed` e' l'approssimazione piu' vicina
        // ai puntini di guida della pagina.
        style: { display: 'flex', flexGrow: 1, height: '20px', borderBottom: `2px dashed ${RULE}`, margin: '0 12px' },
        children: [],
      }),
      h('div', { style: { fontSize: '26px', fontWeight: 600, color: INK }, children: c.value }),
    ],
  });

export async function GET() {
  const last = periods[periods.length - 1]!;
  const subtitle = currentPeriod
    ? `Periodo ${formatDate(currentPeriod.start)} – ${formatDate(currentPeriod.end)}`
    : `Ultimo periodo rilevato: fino al ${formatDate(last.end)}`;

  const svg = await satori(
    h('div', {
      style: {
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
        backgroundColor: PAPER, color: INK, fontFamily: 'Source Serif 4',
      },
      children: [
        /* Filetto di testata: lo stesso bordo pesante che apre ogni pagina. */
        h('div', { style: { display: 'flex', height: '14px', backgroundColor: INK }, children: [] }),

        h('div', {
          style: {
            display: 'flex', flexDirection: 'column', flexGrow: 1,
            padding: '46px 64px 40px', justifyContent: 'space-between',
          },
          children: [
            h('div', {
              style: { display: 'flex', flexDirection: 'column' },
              children: [
                h('div', {
                  style: {
                    fontSize: '20px', fontFamily: 'IBM Plex Mono', fontWeight: 600,
                    color: ACCENT, letterSpacing: '0.19em', textTransform: 'uppercase',
                  },
                  children: `Archivio indipendente · ${SITE_NAME}`,
                }),
                h('div', {
                  style: {
                    fontSize: '60px', fontWeight: 600, lineHeight: 1.08,
                    marginTop: '20px', maxWidth: '900px', letterSpacing: '-0.022em',
                  },
                  children: 'Presenta un Amico American Express: lo storico dei punti',
                }),
                h('div', {
                  style: {
                    fontSize: '22px', fontFamily: 'IBM Plex Mono', color: INK_FAINT,
                    marginTop: '18px', paddingTop: '14px', borderTop: `1px solid ${RULE}`,
                  },
                  children: subtitle,
                }),
              ],
            }),

            h('div', {
              style: {
                display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
                width: '1000px', borderTop: `2px solid ${INK}`, paddingTop: '14px',
              },
              children: highlights().map(ledgerRow),
            }),

            h('div', {
              style: { fontSize: '19px', fontFamily: 'IBM Plex Mono', color: INK_SOFT },
              children: 'Sito indipendente, non affiliato ad American Express',
            }),
          ],
        }),
      ],
    }) as never,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Source Serif 4', data: serif(400), weight: 400, style: 'normal' },
        { name: 'Source Serif 4', data: serif(600), weight: 600, style: 'normal' },
        { name: 'IBM Plex Mono', data: mono(400), weight: 400, style: 'normal' },
        { name: 'IBM Plex Mono', data: mono(600), weight: 600, style: 'normal' },
      ],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
}
