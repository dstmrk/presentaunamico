/**
 * Cloudflare Pages Function eseguita su ogni richiesta.
 *
 * Perche' non basta public/_headers: quel file fa matching sul PATH, non
 * sull'host, e Pages serve gli stessi header sia sul dominio custom sia sul
 * sottodominio *.pages.dev. Metterci dentro un noindex spegnerebbe entrambi.
 * Qui invece l'header Host e' leggibile, quindi il noindex si puo' applicare
 * al solo dominio tecnico.
 *
 * OGGI e' inerte: PRODUCTION_HOSTNAME e' presentaunamico.pages.dev, quindi
 * nessuna richiesta viene marcata noindex. Il giorno in cui in src/lib/site.ts
 * si mette un dominio custom, questo si accende da solo.
 *
 * Consigliato in aggiunta: una volta attivo il dominio custom, disabilitare
 * l'accesso al sottodominio *.pages.dev dalle impostazioni del progetto Pages.
 * Un alias che non risponde non ha bisogno di essere deindicizzato.
 */

/// <reference types="@cloudflare/workers-types" />

// Duplicato da src/lib/site.ts: le Pages Functions vengono compilate a parte e
// non condividono il grafo dei moduli del sito. Tenerli allineati.
const PRODUCTION_HOSTNAME = 'presentaunamico.pages.dev';

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const response = await context.next();
  const host = new URL(context.request.url).hostname;

  if (host !== PRODUCTION_HOSTNAME && host.endsWith('.pages.dev')) {
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
};
