// Boots C's server. Runs on the fallback brain by default so the demo always
// works; set BRAIN=zen to put Builder B's brain in front, with the fallback
// catching any call that throws or times out.

import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { withFallback, type Brain } from './brain.js';
import { createFallbackBrain, freshWorld, loadFixture } from './fallbackBrain.js';

// Local secrets: server/.env, then the repo-root .env Builder B's CLI also reads.
// Node's built-in loader never overrides a variable that is already set, so values
// from the host (e.g. Railway's variables) always win in production.
for (const file of ['../.env', '../../.env']) {
  try { process.loadEnvFile(fileURLToPath(new URL(file, import.meta.url))); }
  catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
}

const PORT = Number(process.env.PORT ?? 3001);
// 240s: a first spawn of a scanned worksheet OCRs every page (~135s for a 36-page
// exam, per Builder B) before the model runs. Cached re-spawns take ~45s.
const SPAWN_TIMEOUT_MS = Number(process.env.SPAWN_TIMEOUT_SECONDS ?? 240) * 1000;
const fallback = createFallbackBrain();

async function loadZenBrain(): Promise<Brain | null> {
  if (process.env.BRAIN !== 'zen') return null;
  try {
    const mod = await import(new URL('../brain/index.ts', import.meta.url).href);
    const names = ['spawnWorld', 'diagnose', 'gradeRecall', 'gradeExplanation', 'focusQuest'] as const;
    const missing = names.filter(n => typeof mod[n] !== 'function');
    if (missing.length) throw new Error(`missing exports: ${missing.join(', ')}`);
    return { name: 'zen', ...Object.fromEntries(names.map(n => [n, mod[n]])) } as Brain;
  } catch (err) {
    console.error(`[brain] could not load Zen's brain (${(err as Error).message}) — using the fallback brain`);
    return null;
  }
}

const zen = await loadZenBrain();
const brain = zen ? withFallback(zen, fallback, { spawnTimeoutMs: SPAWN_TIMEOUT_MS, callTimeoutMs: 15_000 }) : fallback;
const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const clientDir = dir('../../backup-client/dist');

const { app, store } = createApp({
  brain,
  // The route's own timeout is a little longer than the brain's, so a slow model
  // falls back to the (clearly labelled) sample world instead of failing outright.
  spawnTimeoutMs: SPAWN_TIMEOUT_MS + 30_000,
  demoSeed: process.env.DEMO_SEED === '0' ? null : undefined,
  // One origin, no CORS: the built web app (student forest at /, teacher console at
  // /teacher — `extensions` maps /teacher to teacher.html).
  mount: a => { if (existsSync(clientDir)) a.use('/', express.static(clientDir, { extensions: ['html'] })); },
});

// The two demo worlds, always present with their fixture room codes.
store.put({ ...freshWorld(loadFixture('maths')), worldId: 'OAK7', generatedBy: 'sample' });
store.put({ ...freshWorld(loadFixture('reading')), worldId: 'FERN', generatedBy: 'sample' });

app.listen(PORT, () => {
  console.log(`Mastery Grove server on http://localhost:${PORT}`);
  console.log(`  brain:   ${brain.name}${zen ? ` (${process.env.LLM_PROVIDER ?? 'zai'})` : process.env.BRAIN === 'zen' ? '' : '  — set BRAIN=zen for the real AI'}`);
  const built = existsSync(clientDir) ? '' : '   (run: npm run build --prefix backup-client)';
  console.log(`  student: http://localhost:${PORT}/?room=OAK7&name=Alex${built}`);
  console.log(`  teacher: http://localhost:${PORT}/teacher?room=OAK7${built}`);
  console.log(`  rooms:   OAK7 (Primary 5 Maths) · FERN (Primary 3 Reading)`);
});
