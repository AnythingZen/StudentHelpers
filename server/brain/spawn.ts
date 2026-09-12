// Source -> World. One call: concepts, prerequisite DAG, misconceptions, trees.
// The only branch on input.kind is how the user message is built.

import { streamText, Output, type TextPart } from 'ai';
import { readFile } from 'node:fs/promises';
import type { World, Syllabus, Source, SpawnInput, Tree, Concept } from '../../shared/types.js';
import { WorldSpawnSchema, type WorldSpawn, type SpawnTree } from './schemas.js';
import { SPAWN_PROMPT } from './prompts.js';
import { fetchSource } from './source.js';
import { smart, spawnOptions, pdfToPages } from './llm.js';

export async function spawnWorld(
  input: SpawnInput,
  syllabus: Syllabus,
  onPartial: (w: Partial<World>) => void,
): Promise<World> {
  const { source, content } = await buildMessage(input);
  const base = emptyWorld(syllabus, source);

  if (process.env.BRAIN_MOCK === '1') {
    const fixture = JSON.parse(await readFile(new URL('./__tests__/fixtures/spawn.json', import.meta.url), 'utf8'));
    return toWorld(base, fixture);
  }

  const result = streamText({
    model: smart(),
    output: Output.object({ schema: WorldSpawnSchema }),
    messages: [{ role: 'user', content: [{ type: 'text', text: SPAWN_PROMPT(syllabus, source) }, ...content] }],
    ...spawnOptions(),
  });

  for await (const partial of result.partialOutputStream) {
    onPartial(toWorld(base, partial as Partial<WorldSpawn>, true));
  }
  return toWorld(base, await result.output);
}

// The ~6-line branch. Everything else is shared.
async function buildMessage(input: SpawnInput): Promise<{ source: Source; content: TextPart[] }> {
  switch (input.kind) {
    case 'pdf': {
      const pages = await pdfToPages(input.data);
      return { source: { kind: 'pdf', filename: input.filename, pages: pages.length }, content: [{ type: 'text', text: pagesToText(pages) }] };
    }
    case 'url': {
      if (/\.pdf(\?|$)/i.test(input.url)) {
        const pages = await pdfToPages(Buffer.from(await (await fetch(input.url)).arrayBuffer()));
        return { source: { kind: 'pdf', filename: input.url, pages: pages.length }, content: [{ type: 'text', text: pagesToText(pages) }] };
      }
      const { title, text } = await fetchSource(input.url);
      return { source: { kind: 'url', url: input.url, title }, content: [{ type: 'text', text: `<document title="${title}">\n${text}\n</document>` }] };
    }
    case 'text':
      return { source: { kind: 'text', label: input.label, chars: input.text.length },
               content: [{ type: 'text', text: `<document>\n${input.text}\n</document>` }] };
    case 'prompt':
      return { source: { kind: 'prompt', text: '' }, content: [] };
  }
}

function pagesToText(pages: string[]): string {
  return pages.map((p, i) => `<page n="${i + 1}">\n${p.trim()}\n</page>`).join('\n\n');
}

function emptyWorld(syllabus: Syllabus, source: Source): World {
  return {
    worldId: roomCode(),            // C may overwrite with the code it already handed out
    syllabus,
    subject: `${syllabus.level} ${syllabus.subject} — ${syllabus.topic}`,
    source, status: 'growing', sessionIndex: 0,
    concepts: [], misconceptions: [], trees: [],
  };
}

// Model output -> World. Fills what the model doesn't emit: positions (A's
// layout fn), state, Leitner box. Partial streams may contain half-built
// objects, so anything without an id and a question is dropped.
function toWorld(base: World, spawn: Partial<WorldSpawn>, partial = false): World {
  const concepts: Concept[] = (spawn.concepts ?? [])
    .filter((c): c is WorldSpawn['concepts'][number] => !!c?.id && !!c.name)
    .map(c => ({ ...c, bloom: c.bloom ?? 'understand', syllabusRef: c.syllabusRef ?? '', level: c.level ?? base.syllabus.level,
                 prerequisites: c.prerequisites ?? [], centre: [0, 0, 0] }));
  const misconceptions = (spawn.misconceptions ?? []).filter(m => !!m?.id && !!m.label && !!m.conceptId) as World['misconceptions'];
  const trees = (spawn.trees ?? []).filter((t): t is SpawnTree => !!t?.id && !!t.question && !!t.conceptId).map(fillTree);
  return { ...base, status: partial ? 'growing' : 'ready', concepts, misconceptions, trees };
}

export function fillTree(t: SpawnTree): Tree {
  return { ...t, pos: [0, 0, 0], citation: t.citation ?? null, state: 'healthy', leitnerBox: 1, spawnedFrom: null };
}

function roomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789';
  return A[Math.random() * 24 | 0] + A[Math.random() * 24 | 0] + A[Math.random() * 24 | 0] + D[Math.random() * 8 | 0];
}
