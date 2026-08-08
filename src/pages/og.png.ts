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
const font = (weight: 400 | 700) =>
  readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`));

/** Nessun asset grafico American Express: solo testo, colori e forme nostre. */
const h = (type: string, props: Record<string, unknown>) => ({ type, props });

function highlights() {
  const source = currentPeriod;
  // Stesso ordine della pagina: consumer prima, poi business, poi le altre.
  return groups.flatMap((g) => g.cards).slice(0, 6).map((card) => {
    const offer = source?.offers[card.id] ?? lastKnownOffer(card.id)?.offer ?? null;
    return {
      name: card.name,
      color: palette(card.color).chipDark,
      value: offer ? formatValue(maxValueOf(offer.referred), card.reward) : 'n/d',
    };
  });
}

export async function GET() {
  const last = periods[periods.length - 1]!;
  const subtitle = currentPeriod
    ? `Periodo ${formatDate(currentPeriod.start)} – ${formatDate(currentPeriod.end)}`
    : `Ultimo periodo rilevato: fino al ${formatDate(last.end)}`;

  const svg = await satori(
    h('div', {
      style: {
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
        backgroundColor: '#101216', color: '#e9ecf1', padding: '64px',
        fontFamily: 'Inter', justifyContent: 'space-between',
      },
      children: [
        h('div', {
          style: { display: 'flex', flexDirection: 'column' },
          children: [
            h('div', {
              style: { fontSize: '22px', color: '#79828f', letterSpacing: '0.12em', textTransform: 'uppercase' },
              children: SITE_NAME,
            }),
            h('div', {
              style: { fontSize: '62px', fontWeight: 700, lineHeight: 1.1, marginTop: '18px', maxWidth: '980px' },
              children: 'Presenta un Amico American Express: lo storico dei punti',
            }),
            h('div', {
              style: { fontSize: '26px', color: '#a2abba', marginTop: '20px' },
              children: subtitle,
            }),
          ],
        }),
        h('div', {
          style: { display: 'flex', gap: '14px', flexWrap: 'wrap' },
          children: highlights().map((c) =>
            h('div', {
              style: {
                display: 'flex', flexDirection: 'column', padding: '16px 20px',
                borderRadius: '14px', backgroundColor: '#171a21',
                borderLeft: `5px solid ${c.color}`, minWidth: '170px',
              },
              children: [
                h('div', { style: { fontSize: '20px', color: '#a2abba' }, children: c.name }),
                h('div', { style: { fontSize: '30px', fontWeight: 700, marginTop: '4px' }, children: c.value }),
              ],
            }),
          ),
        }),
        h('div', {
          style: { fontSize: '20px', color: '#79828f' },
          children: 'Sito indipendente, non affiliato ad American Express',
        }),
      ],
    }) as never,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: font(400), weight: 400, style: 'normal' },
        { name: 'Inter', data: font(700), weight: 700, style: 'normal' },
      ],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
}
