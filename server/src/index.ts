// Boots C's server. Runs on the fallback brain by default so the demo always
// works; set BRAIN=zen to put Builder B's brain in front, with the fallback
// catching any call that throws or times out.

import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { withFallback, type Brain } from './brain.js';
import { createFallbackBrain, freshWorld, loadFixture } from './fallbackBrain.js';

const PORT = Number(process.env.PORT ?? 3001);
const SPAWN_TIMEOUT_MS = Number(process.env.SPAWN_TIMEOUT_SECONDS ?? 90) * 1000;
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
const teacherDir = dir('../teacher');
const clientDir = dir('../../backup-client/dist');

const { app, store } = createApp({
  brain,
  spawnTimeoutMs: SPAWN_TIMEOUT_MS,
  demoSeed: process.env.DEMO_SEED === '0' ? null : undefined,
  mount: a => {
    if (existsSync(teacherDir)) a.use('/teacher', express.static(teacherDir));
    if (existsSync(clientDir)) a.use('/', express.static(clientDir));
  },
});

// The two demo worlds, always present with their fixture room codes.
store.put({ ...freshWorld(loadFixture('maths')), worldId: 'OAK7' });
store.put({ ...freshWorld(loadFixture('reading')), worldId: 'FERN' });

app.listen(PORT, () => {
  console.log(`Mastery Grove server on http://localhost:${PORT}`);
  console.log(`  brain:   ${brain.name}`);
  console.log(`  student: http://localhost:${PORT}/${existsSync(clientDir) ? '' : '   (build backup-client first)'}`);
  console.log(`  teacher: http://localhost:${PORT}/teacher/${existsSync(teacherDir) ? '' : '   (no teacher console yet)'}`);
  console.log(`  rooms:   OAK7 (Primary 5 Maths) · FERN (Primary 3 Reading)`);
});
