// Dev harness: spawn a world from the terminal and dump it to a file.
//   npx tsx cli.ts pdf  ./worksheet.pdf
//   npx tsx cli.ts url  https://www.gutenberg.org/cache/epub/14838/pg14838.txt   [--english]
//   npx tsx cli.ts text "pasted lesson content"
//   npx tsx cli.ts prompt
// Add --out fallbackWorld.json to write the result somewhere specific.

import { config } from 'dotenv';
config({ path: ['../.env', '../../.env'] });   // server/.env first, then repo root
import { readFile, writeFile } from 'node:fs/promises';
import { spawnWorld } from './spawn.js';
import type { SpawnInput, Syllabus } from '../../shared/types.js';

const [kind, payload, ...flags] = process.argv.slice(2);
const english = flags.includes('--english');
const out = flags[flags.indexOf('--out') + 1] || `world-${kind}.json`;

const syllabus: Syllabus = english
  ? { system: 'MOE-SG', level: 'Primary 3', subject: 'English', topic: 'Reading Comprehension' }
  : { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' };

const input: SpawnInput =
  kind === 'pdf'  ? { kind, filename: payload, data: await readFile(payload) } :
  kind === 'url'  ? { kind, url: payload } :
  kind === 'text' ? { kind, label: 'pasted', text: payload } :
                    { kind: 'prompt' };

const t0 = Date.now();
const world = await spawnWorld(input, syllabus, (w) => {
  process.stdout.write(`\r  growing… ${w.concepts?.length ?? 0} concepts, ${w.trees?.length ?? 0} trees`);
});
console.log(`\n  ready in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${world.concepts.length} concepts, ${world.misconceptions.length} misconceptions, ${world.trees.length} trees`);
for (const c of world.concepts) console.log(`  ${c.id} [${c.level}] ${c.name}  ← ${c.prerequisites.join(',') || '∅'}`);
await writeFile(out, JSON.stringify(world, null, 2));
console.log(`  wrote ${out}`);
