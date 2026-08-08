import { SITE_URL } from '../lib/site.ts';
import { lastUpdated } from '../lib/promotions.ts';

export const prerender = true;

/**
 * Sitemap scritta a mano invece che con @astrojs/sitemap: con una manciata di
 * URL l'integrazione aggiunge una dipendenza per generare quattro righe, e
 * qui serve il controllo esatto su lastmod (che deve riflettere l'ultimo
 * aggiornamento dei DATI, non della build).
 */
const pages = [{ path: '/', priority: '1.0', changefreq: 'weekly' }];

export function GET() {
  const urls = pages
    .map(
      ({ path, priority, changefreq }) => `  <url>
    <loc>${SITE_URL}${path === '/' ? '' : path}</loc>
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
