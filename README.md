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

Su Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `dist`
- Deploy automatico a ogni push su `main`

---

## Struttura

```
src/
  data/promotions.json          unica fonte di verità
  data/promotions.schema.json   generato — dà autocomplete e validazione nell'editor
  lib/schema.ts                 zod + regole che attraversano più record
  lib/promotions.ts             caricamento, validazione, periodo corrente
  lib/series.ts                 costruzione dei segmenti a gradini
  lib/chart.ts                  scale, percorsi SVG, palette
  lib/format.ts                 formattazione numeri, date, requisiti di spesa
  lib/faq.ts                    sorgente unica per FAQ visibili e JSON-LD
  components/                   riquadri, tabelle, chip, SEO, piede
  pages/index.astro             la pagina
  pages/og.png.ts               immagine Open Graph generata a build time
  pages/sitemap.xml.ts          sitemap con lastmod dai dati, non dalla build
public/
  robots.txt  _headers  favicon.svg
functions/
  _middleware.ts                noindex su *.pages.dev (vedi sotto)
```

---

## Dominio e indicizzazione

Tutto il dominio vive in [`src/lib/site.ts`](src/lib/site.ts):

```ts
export const PRODUCTION_HOSTNAME = 'presentaunamico.pages.dev';
```

Quando arriva un dominio custom, cambia **solo quella riga**. Da quel momento
`functions/_middleware.ts` inizia da solo a servire `X-Robots-Tag: noindex` sul
sottodominio tecnico `*.pages.dev`, mentre il canonical continua a puntare al
dominio di produzione.

`public/_headers` **non può** fare questo lavoro: fa matching sul path e non
sull'host, quindi lo stesso header verrebbe servito su entrambi i domini. Per
questo il noindex vive in una Pages Function, che vede l'header `Host`.

Consigliato in aggiunta: attivato il dominio custom, disabilitare l'accesso al
sottodominio `*.pages.dev` dalle impostazioni del progetto Pages. Un alias che
non risponde non ha bisogno di essere deindicizzato.

---

## Stato dei dati

Il dataset iniziale (gennaio 2025 – agosto 2026) ha due provenienze diverse,
con affidabilità diverse:

- **Le date di scadenza dei periodi sono reali**, da elenco fornito. Tutti i
  periodi hanno `datesEstimated: false`.
- **Gli importi sono letti da grafici in formato immagine.** Sono attendibili,
  ma l'associazione valore → periodo per le carte diverse da Platino e Oro può
  essere sfasata di un periodo in qualche punto: va confermata a campione
  contro le immagini di origine.

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
