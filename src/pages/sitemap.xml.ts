import { cards, lastUpdated } from '../lib/promotions.ts';
import { absolute, cardPath } from '../lib/seo.ts';

export const prerender = true;

/**
 * Sitemap scritta a mano invece che con @astrojs/sitemap: serve il controllo
 * esatto su lastmod, che deve riflettere l'ultimo aggiornamento dei DATI e non
 * della build. Le pagine si derivano dal dataset, quindi aggiungere una carta
 * aggiorna la sitemap da solo.
 */
export function GET() {
  const pages = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    ...cards.map((card) => ({ path: cardPath(card), priority: '0.8', changefreq: 'weekly' })),
  ];

  const urls = pages
    .map(
      ({ path, priority, changefreq }) => `  <url>
    <loc>${absolute(path)}</loc>
    <lastmod>${lastUpdated}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
    )
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
