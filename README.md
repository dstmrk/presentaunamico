# Presenta un Amico — archivio storico

Sito statico che conserva lo storico delle promozioni "Presenta un Amico"
(member-get-member) delle carte American Express in Italia: quanti punti riceve
l'amico presentato, quanti il presentatore, con quale requisito di spesa.

American Express cambia le offerte ogni una o due mesi e non pubblica un
archivio. Il valore del sito è lo storico, quindi **l'accuratezza dei dati vale
più di qualunque funzionalità**.

Sito indipendente, non affiliato ad American Express. Nessun asset grafico del
marchio: le carte sono identificate solo da nome e colore.

---

## Come è fatto

- **Astro** in output statico. Nessun backend, nessun database.
- **Zero JavaScript nel browser.** I grafici sono SVG generati a build time: il
  contenuto è nel DOM al primo byte, senza idratazione e senza CLS.
- **Unica fonte di verità:** [`src/data/promotions.json`](src/data/promotions.json),
  versionato nel repo e aggiornato a mano.
- **Validazione a build time con zod.** Dati incoerenti fanno fallire la build,
  quindi non possono arrivare online.

---

## Lo stile: bollettino statistico

Il sito è un archivio, e l'impaginazione lo dichiara. Il riferimento è
l'**annuario statistico stampato**, non l'interfaccia di un'applicazione. Tutto
il sistema sta in [`src/styles/global.css`](src/styles/global.css).

- **Carta e inchiostro.** Fondo avorio `#faf7f0`, inchiostro caldo, un solo
  accento (`#9a2c1f`, rosso da stampa) usato per rubriche e richiami. I grigi
  neutri sono banditi: sono ciò che fa somigliare una pagina a una finestra di
  sistema.
- **Tema unico chiaro.** Una palette sola, tarata al millimetro, invece di due
  mezze palette. È una scelta, non una dimenticanza: non aggiungere un tema
  scuro senza rifare i conti sui contrasti dei colori delle carte.
- **Tipografia.** Source Serif 4 per testo e cifre, IBM Plex Mono per etichette,
  date, intestazioni di colonna e numeri di tavola. Entrambi serviti dal nostro
  dominio (la CSP vieta host esterni) e precaricati da `Base.astro`.
- **Filetti, non contenitori.** Nessun `border-radius`, nessuna ombra, nessuna
  card. La gerarchia la fanno le regole orizzontali e lo spazio bianco.
- **Numerazione.** Sezioni (`§ I`), tavole (`Tavola 3`) e figure (`Fig. 5`) sono
  numerate da **contatori CSS**: nessuna pagina tiene il conto a mano, e una
  riga resta citabile. Il contatore vive su `main`; una sezione nuova si numera
  da sola purché il suo `<h2>` sia figlio diretto di `<section>` o `<nav>`.
- **Il colore identifica, non quantifica.** La tinta della carta sta nel
  campione accanto al nome e nel tratto del grafico. Le cifre restano nere: è
  l'unico modo per tenerle tutte al massimo contrasto, visto che i colori
  identitari arrivano appena sopra 3:1.

L'immagine Open Graph (`src/pages/og.png.ts`) e la favicon usano gli stessi
token: se cambi la palette, cambiali lì dentro.

---

## Aggiungere una promozione

Le offerte Amex hanno **lo stesso periodo per tutte le carte**, quindi l'entità
del dataset è il *periodo*, non la singola promozione. Aggiungere un'offerta
significa aggiungere un blocco a `periods` e riempirlo per ogni carta.

### 1. Apri `src/data/promotions.json` e aggiungi un periodo

```jsonc
{
  "start": "2026-09-01",
  "end": "2026-10-31",
  "datesEstimated": false,
  "source": {
    "url": "https://...",                    // opzionale
    "archived": "https://web.archive.org/...", // consigliato: le pagine Amex spariscono
    "capturedAt": "2026-09-02",              // obbligatorio, non può essere nel futuro
    "note": "screenshot app Amex"            // opzionale
  },
  "offers": {
    "platino": {
      "referred": {
        "type": "bonus",
        "amount": 110000,
        "spend": { "amount": 10000, "months": 6 }
      },
      "referrer": { "type": "bonus", "amount": 50000 }
    }
    // ... una voce per OGNI carta
  }
}
```

### 2. Le tre meccaniche disponibili

| Meccanica | Quando usarla | Esempio |
|---|---|---|
| `bonus` con `spend` | Bonus subordinato a una soglia di spesa da raggiungere | `{ "type": "bonus", "amount": 110000, "spend": { "amount": 10000, "months": 6 } }` |
| `bonus` senza `spend` | Importo fisso, nessun requisito (tipico del presentatore) | `{ "type": "bonus", "amount": 40 }` |
| `rate` | Cashback percentuale per N mesi fino a un tetto di spesa (Blu) | `{ "type": "rate", "rate": 0.05, "months": 6, "spendCap": 3000 }` |

⚠️ `spend.amount` e `spendCap` si somigliano ma sono **opposti**: il primo è una
soglia *da raggiungere*, il secondo un tetto *oltre il quale non matura più
nulla*. Non sono intercambiabili — è per questo che stanno in campi diversi.

Il valore massimo di un `rate` (5% × 3.000 € = 150 €) **non si scrive**: viene
derivato, così non può divergere dai fattori.

### 3. Regole da rispettare

- **Ogni carta deve comparire in ogni periodo.** Se il dato non è noto,
  scrivi `"nome-carta": null` — chiave mancante = build fallita. La differenza
  fra "non lo so" e "l'ho dimenticato" è tutta la differenza fra un archivio e
  un mucchio di numeri.
- Se manca solo il dato del presentatore: `"referrer": null`.
- I periodi devono essere **contigui** (`end` + 1 giorno = `start` successivo) e
  non sovrapposti. Un'offerta c'è sempre, quindi un buco è un dato mancante e
  produce un avviso.
- `end` è **inclusivo**: è l'ultimo giorno di validità.
- Un'offerta esistente a valore nullo si scrive `"amount": 0`. È un dato valido,
  diverso da `null`.

### 4. Verifica e pubblica

```bash
npm run validate   # controlla i dati senza fare la build completa
git commit -am "Periodo settembre-ottobre 2026"
git push           # Cloudflare Pages fa il deploy da solo
```

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo su http://localhost:4321 |
| `npm run build` | Rigenera lo JSON Schema e costruisce il sito in `dist/` |
| `npm run preview` | Serve `dist/` in locale, come lo vedrà l'utente |
| `npm run validate` | Valida `promotions.json` e stampa copertura e periodo corrente |
| `npm run check` | Controllo dei tipi TypeScript |
| `npm run data` | ⚠️ **Rigenera `promotions.json` da zero, sovrascrivendolo.** Serve solo a ricostruire il dataset iniziale, non ad aggiungere promozioni |

## Verificare in locale

```bash
npm install
npm run build && npm run preview
```

Cose da controllare a occhio dopo un aggiornamento:

1. **"Le offerte di oggi"** mostra il periodo giusto. Se leggi *"periodo non
   ancora rilevato"* significa che nessun periodo copre la data odierna: manca
   il periodo corrente, va aggiunto.
2. I grafici hanno un gradino nuovo all'estremità destra.
3. La tabella storica in fondo riporta la nuova riga in cima.
4. Gli avvisi stampati dalla build (`⚠︎ promotions.json`) sono quelli attesi.

---

## Come gira la build

```
npm run build
  ├─ scripts/gen-json-schema.ts   genera promotions.schema.json da zod
  └─ astro build
       └─ src/lib/promotions.ts   valida i dati a import-time
            ├─ schema zod          campi, tipi, date reali, punti non negativi
            └─ crossValidate()     sovrapposizioni, continuità, carte mancanti,
                                   coerenza meccanica/valuta della carta
```

Se la validazione fallisce, `astro build` esce con errore e **Cloudflare Pages
non pubblica**: il sito online resta l'ultima versione valida.

## Deploy su Cloudflare Pages

### Prima configurazione

1. **Workers & Pages → Create → Pages → Connect to Git**, e seleziona il repo.
2. **Il nome del progetto deve essere `presentaunamico`**: è il nome a
   determinare il sottodominio `presentaunamico.pages.dev`, che è il valore di
   `PRODUCTION_HOSTNAME` in `src/lib/site.ts`. Con un nome diverso, canonical e
   sitemap punterebbero a un dominio che non esiste — oppure va cambiata quella
   costante.
3. Impostazioni di build:

   | Campo | Valore |
   |---|---|
   | Framework preset | Astro (o *None*) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Production branch | `main` |

4. **Save and Deploy.**

Non serve altro: `functions/` e `public/_headers` vengono raccolti in
automatico da Pages, senza configurazione.

### Perché non serve impostare NODE_VERSION

C'è un `.nvmrc` con `22` nella radice: Pages lo legge e usa quella versione.
Se preferisci l'esplicito, l'alternativa è una variabile d'ambiente
`NODE_VERSION = 22` nelle impostazioni del progetto.

### Dipendenze e NODE_ENV

Tutto ciò che serve alla build sta in `dependencies`, non in
`devDependencies` — Tailwind, `tsx` e `zod-to-json-schema` inclusi. Alcune
piattaforme installano con `NODE_ENV=production`, e in quel caso le
devDependencies vengono saltate: qui la build passa comunque. Verificato con
`npm ci --omit=dev`.

### Deploy di anteprima

Ogni push su un branch diverso da `main` produce un'anteprima su
`<branch>.presentaunamico.pages.dev`. A tenerle fuori dall'indice è il
**canonical assoluto**: ogni pagina dichiara come URL canonico quello sul
dominio di produzione, quindi un'anteprima non compete con la produzione, la
indica.

Il sito è puramente statico: nessuna Pages Function, quindi zero invocazioni
Functions e zero cold start.

### Deploy manuale, senza Git

```bash
npm run build
npx wrangler pages deploy dist --project-name presentaunamico
```

---

## Struttura

```
src/
  assets/fonts/                 woff2 self-hosted, con hash da Vite in /_astro/
  styles/global.css             il sistema visivo per intero: token, filetti, tavole
  data/promotions.json          unica fonte di verità
  data/promotions.schema.json   generato — dà autocomplete e validazione nell'editor
  lib/schema.ts                 zod + regole che attraversano più record
  lib/promotions.ts             caricamento, validazione, periodo corrente
  lib/series.ts                 costruzione dei segmenti a gradini
  lib/chart.ts                  scale, percorsi SVG, palette
  lib/format.ts                 formattazione numeri, date, requisiti di spesa
  lib/faq.ts                    sorgente unica per FAQ visibili e JSON-LD
  lib/seo.ts                    titoli, descrizioni, FAQ per carta, JSON-LD
  components/                   riquadri, tabelle, chip, SEO, piede
  pages/index.astro             home: confronto fra tutte le carte
  pages/carte/[card].astro      una scheda per carta (11 pagine generate)
  pages/og.png.ts               immagine Open Graph generata a build time
  pages/sitemap.xml.ts          sitemap con lastmod dai dati, non dalla build
public/
  robots.txt  _headers  favicon.svg
```

Nessuna Pages Function: il sito è interamente statico.

---

## Le pagine

Il sito genera **12 pagine**: la home più una scheda per carta, su
`/carte/<id>`. Non serve toccare nulla per aggiungerne una: le rotte, la
navigazione e la sitemap si derivano tutte dall'elenco delle carte nel dataset.

Le due pagine hanno ruoli diversi e non sono duplicati:

|  | Home | Scheda carta |
|---|---|---|
| Serve a | Confrontare le carte fra loro | Rispondere alla query di *quella* carta |
| Grafici | Tutti e 11, small multiples | Solo quello della carta |
| Tabella | Troncata a 6 periodi su mobile | Sempre completa |
| FAQ | Generali sul programma | Calcolate sui dati della carta |

Titoli, descrizioni e FAQ delle schede sono **generati dai dati**, quindi si
aggiornano da soli a ogni nuovo periodo e sono diversi carta per carta. Undici
copie della stessa FAQ generica sarebbero contenuto duplicato.

### Il troncamento su mobile

In home, su schermi sotto i 720px, ogni tabella si ferma ai 6 periodi più
recenti con un interruttore per aprire il resto — checkbox e CSS, nessun
JavaScript. Le righe non lasciano mai il DOM: vengono nascoste, non rimosse.

Il troncamento vale **solo in home**. L'indicizzazione di Google è mobile-first,
quindi contenuto nascosto di default su mobile conta meno: la scheda di ogni
carta mostra sempre la tabella intera, ed è proprio la pagina che compete sulla
query di quella carta. Così ogni riga resta pienamente visibile almeno in un
posto.

Il valore è in `COLLAPSE_AFTER` dentro `src/pages/index.astro`.

## Dominio e indicizzazione

Tutto il dominio vive in [`src/lib/site.ts`](src/lib/site.ts):

```ts
export const PRODUCTION_HOSTNAME = 'presentaunamico.pages.dev';
```

Quando arriva un dominio custom, cambia **solo quella riga**: canonical,
sitemap, Open Graph e URL nel JSON-LD si spostano tutti di conseguenza.

### Quando aggiungerai il dominio custom

A quel punto `presentaunamico.pages.dev` diventa un doppione indicizzabile del
sito vero. Due mosse, in ordine di efficacia:

**1. Disabilita l'accesso al sottodominio `*.pages.dev`** dalle impostazioni del
progetto Pages. Un alias che non risponde non ha bisogno di essere
deindicizzato: è la soluzione più pulita e non costa nulla.

**2. Oppure servi `X-Robots-Tag: noindex` solo su quell'host.**
`public/_headers` **non può** farlo — fa matching sul path e non sull'host,
quindi lo stesso header finirebbe anche sul dominio custom. Serve una Pages
Function, che l'header `Host` lo vede. Ricrea `functions/_middleware.ts` nella
radice del repo:

```ts
// Tenere allineato a PRODUCTION_HOSTNAME in src/lib/site.ts: le Pages
// Functions sono compilate a parte e non condividono i moduli del sito.
const PRODUCTION_HOSTNAME = 'esempio.it';

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
```

Attenzione: una funzione in `functions/_middleware.ts` gira su **ogni**
richiesta, comprese quelle agli asset statici, e ognuna conta come invocazione
Functions (100.000 al giorno nel piano gratuito). È il motivo per cui oggi non
c'è: finché il dominio di produzione è `pages.dev` non serve a niente.

---

## Stato dei dati

Il dataset (gennaio 2025 – agosto 2026, 20 periodi) fonde tre fonti, in ordine
di autorevolezza crescente. Ogni periodo dichiara la propria in `source`, e la
tabella in pagina la mostra nella colonna **Fonte**.

**Ordine di precedenza fra le fonti**, dal più forte:

1. Condizioni ufficiali American Express
2. Archivio pubblico Frequent Flyer Italia
3. Forum specializzato (FinanzaOnLine)
4. Lettura dei grafici storici in formato immagine

| Periodi | Fonte | Cosa copre |
|---|---|---|
| 23/07 → 31/08/2026 | Condizioni ufficiali American Express | Tutto, per tutte le carte |
| 27/11/2025 → 22/07/2026 | Archivio pubblico 2026 | Amico presentato e spesa, 7 carte su 11 |
| 01/10 → 26/11/2025 | Archivio pubblico 2025 | Conferma 4 carte personali, aggiunge la finestra di spesa |
| 13/02 → 26/03/2025 | Forum + archivio | Amico presentato, 5 carte Membership Rewards |
| 16/01 → 12/02/2025 | Forum specializzato | Tutto, 5 carte Membership Rewards |
| Restanti 2025 | Lettura dei grafici storici | Tutto, tutte le carte |

Tutte le date sono reali: nessun periodo ha `datesEstimated: true`.

L'archivio 2025 copre solo da luglio in poi — l'autore dichiara di aver
iniziato a tracciare le offerte da quel mese — e solo le carte personali.

### Le finestre brevi di raccordo

L'archivio pubblico ha rivelato cinque finestre di 7–10 giorni (27/1–5/2,
11–17/3, 22–29/4, 3–10/6, 15–22/7 del 2026) in cui l'offerta scende a un
livello base fra una promozione forte e la successiva. Né i grafici storici né
l'elenco delle scadenze le contenevano, perché registrano solo le promozioni
principali.

Sono quelle finestre a spiegare perché le condizioni ufficiali datano l'offerta
in corso al **23 luglio** e non al 15: il 15–22 luglio è una finestra di
raccordo a sé.

Per le quattro carte che l'archivio non copre (Italo, Payback, Payback Plus,
Blu) e per tutti i valori del presentatore, i periodi nati da questa
suddivisione ereditano la lettura del grafico che copriva l'intero intervallo.
È un'osservazione reale su tutto lo span, ma **non risolve le finestre brevi**:
se anche quelle carte scendevano a un livello base per una settimana, qui non
si vede.

### Quanto sono affidabili le due serie

Il confronto dell'ultimo periodo con la fonte ufficiale è servito da controllo
in cieco sulla lettura dei grafici, e dà un verdetto netto:

| Serie | Esito del controllo |
|---|---|
| Amico presentato + requisito di spesa | **10 carte su 10 corrette.** La lettura dei grafici è affidabile |
| Presentatore | **5 valori su 10 sbagliati**, di un 20–30% |

Gli errori sono tutti sulle serie che nei grafici di origine stavano schiacciate
contro il fondo di un asse Y troncato. Le correzioni per l'ultimo periodo sono
in `OFFICIAL_LAST_PERIOD_REFERRER` dentro `scripts/build-dataset.ts`.

**Nessuna fonte trovata copre il presentatore nei periodi passati**: né
l'archivio pubblico né le condizioni ufficiali archiviate (web.archive.org non
è raggiungibile dall'ambiente di build). Quei valori restano quelli letti dai
grafici.

Non vanno però riscritti in blocco con i valori di oggi. Il forum documenta il
presentatore Platino a **100.000 punti** per i periodi con scadenza 12/02/2025
e 26/03/2025, contro i **50.000** attuali: la serie del presentatore è
realmente cambiata nel tempo, e la lettura dei grafici la coglieva
correttamente in quei punti. Gli errori riscontrati sull'ultimo periodo vanno
in entrambe le direzioni (Verde −30%, Platino Business +20%), quindi non sono
un errore di scala ricalcolabile: sono rumore di lettura vicino al fondo
dell'asse.

### Discrepanze risolte

**13/02 → 26/03/2025.** La lettura dei grafici dava Platino 250.000, Verde
12.500 e Italo 12.000. Archivio e forum concordano su Platino 180.000, e il
forum completa la riga con Verde 30.000 e Italo 24.000. Due fonti contro una
lettura di pixel: hanno vinto le fonti. Oro (100.000) ed Explora (5.000)
combaciavano già, così come il presentatore Platino (100.000).

**Spesa Platino nel periodo 27/11/2025 → 26/01/2026.** I due articoli di
archivio si contraddicono: 3.000 € quello del 2025, 3.500 € la tabella
retrospettiva del 2026. Prevale il primo, scritto mentre l'offerta era in
corso. È l'unico punto in cui la fonte prioritaria contraddice sé stessa
(`LATE_2025_PLATINO_SPEND` in `scripts/build-dataset.ts`).

Resta da confermare a campione l'associazione valore → periodo per le carte del
2025 che nessuna fonte esterna copre.

### La griglia dei periodi non è uniforme per tutte le carte

Non tutte le scadenze valgono per tutte le carte: il 26/06/2025 è una scadenza
**solo per Oro e Platino** (nel 2024, fuori copertura, ce ne sono altre "solo
Business" e "solo Blu").

La griglia è quindi l'**unione di tutti i confini**. Le carte che in una certa
data non hanno cambiato offerta ripetono lo stesso valore su due periodi
consecutivi — cosa che il grafico a gradini rende senza artefatti, perché due
valori uguali di fila sono una linea orizzontale continua.

`scripts/build-dataset.ts` verifica questo vincolo e fallisce se una carta
diversa da Oro o Platino cambia valore sul confine del 26/06/2025.

### Dati del presentatore mancanti

I grafici di origine hanno **assi Y troncati**: dove la serie del presentatore
scendeva sotto il minimo dell'asse, veniva tagliata via e il valore non è
recuperabile. Non è "nessuna offerta": è un dato che la fonte non mostra, quindi
è registrato come `null`.

La build lo segnala a ogni esecuzione:

- `explora`: presentatore assente per i periodi del 2025
- `payback-plus`: presentatore assente per gran parte del 2025
- `italo`: presentatore assente per il primo periodo del 2025

---

## Vincoli legali

- **Nessun logo, immagine di carta o asset grafico American Express.** Solo
  testo e colori. Le carte sono identificate da chip tipografiche.
- Il nome del progetto e il dominio non contengono "amex" né "american
  express"; nei contenuti il nome compare come uso descrittivo, per identificare
  i prodotti di cui si parla.
- Nessun link di affiliazione, nessun codice referral. Il sito è informativo:
  ospitare link referral cambierebbe la natura dell'uso del marchio da
  descrittiva a commerciale.
- Disclaimer nel footer: sito indipendente, dati raccolti manualmente, nessuna
  garanzia di accuratezza, verificare sempre sul sito ufficiale.
