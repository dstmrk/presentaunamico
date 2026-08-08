/**
 * Genera src/data/promotions.schema.json da zod.
 *
 * Non serve alla build: serve a chi aggiorna i dati. Con il riferimento
 * "$schema" in cima al JSON, l'editor autocompleta i campi e segnala l'errore
 * mentre scrivi, invece che tre minuti dopo in CI. Il rischio vero di questo
 * progetto non e' lo schema sbagliato, e' che aggiornare diventi noioso.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { datasetSchema } from '../src/lib/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data/promotions.schema.json');

const jsonSchema = zodToJsonSchema(datasetSchema, {
  name: 'PromotionsDataset',
  $refStrategy: 'none',
});

writeFileSync(out, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf8');
console.log(`Scritto ${out}`);
