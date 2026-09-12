// Source -> World. One call: concepts, prerequisite DAG, misconceptions, trees.
// The only branch on input.kind is how the user message is built.

import { streamText, Output, type TextPart, type FilePart } from 'ai';
import { readFile } from 'node:fs/promises';
import type { World, Syllabus, Source, SpawnInput, Tree, Concept } from '../../shared/types.js';
import { WorldSpawnSchema, type WorldSpawn, type SpawnTree } from './schemas.js';
import { SPAWN_PROMPT } from './prompts.js';
import { fetchSource } from './source.js';
import { smart, spawnOptions, pdfToPages, isAnthropic, jsonSchemaHint } from './llm.js';

const MIN_PDF_CHARS = 200;   // below this the PDF is almost certainly a scan

export async function spawnWorld(
  input: SpawnInput,
  syllabus: Syllabus,
  onPartial: (w: Partial<World>) => void,
): Promise<World> {
  const { source, content, pages } = await buildMessage(input);
  const base = emptyWorld(syllabus, source);

  if (process.env.BRAIN_MOCK === '1') {
    const fixture = JSON.parse(await readFile(new URL('./__tests__/fixtures/spawn.json', import.meta.url), 'utf8'));
    return toWorld(base, fixture);
  }

  const result = streamText({
    model: smart(),
    output: Output.object({ schema: WorldSpawnSchema }),
    messages: [{ role: 'user', content: [{ type: 'text', text: SPAWN_PROMPT(syllabus, source) + jsonSchemaHint(WorldSpawnSchema) }, ...content] }],
    ...spawnOptions(),
  });

  for await (const partial of result.partialOutputStream) {
    onPartial(toWorld(base, partial as Partial<WorldSpawn>, true));
  }
  const world = toWorld(base, await result.output);
  return pages ? verifyCitations(world, pages) : world;
}

// The ~6-line branch. Everything else is shared. `pages` is the per-page
// extracted text, returned for citation verification.
async function buildMessage(input: SpawnInput): Promise<{ source: Source; content: (TextPart | FilePart)[]; pages?: string[] }> {
  switch (input.kind) {
    case 'pdf':
      return pdfMessage(input.filename, input.data);
    case 'url': {
      if (/\.pdf(\?|$)/i.test(input.url))
        return pdfMessage(input.url, new Uint8Array(await (await fetch(input.url)).arrayBuffer()));
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

// Claude reads the PDF itself (page images, so stacked fractions and scans
// work). A text-only model gets the cleaned per-page text instead.
async function pdfMessage(filename: string, data: Uint8Array) {
  const pages = await pdfToPages(data);
  const chars = pages.reduce((n, p) => n + p.length, 0);
  const source: Source = { kind: 'pdf', filename, pages: pages.length };
  if (isAnthropic())
    return { source, pages, content: [{ type: 'file' as const, data, mediaType: 'application/pdf', filename }] };
  if (chars < MIN_PDF_CHARS)
    throw new Error(`"${filename}" has almost no extractable text (${chars} chars over ${pages.length} pages) — it looks scanned. Paste the text, pick a topic, or set LLM_PROVIDER=anthropic.`);
  return { source, pages, content: [{ type: 'text' as const, text: pages.map((p, i) => `<page n="${i + 1}">\n${p}\n</page>`).join('\n\n') }] };
}

// The model writes citations; the server checks each quote really appears on
// the page it names. Letters and digits only — extraction loses stacked
// fraction bars ("3\n4" vs "3/4"), so whitespace/punctuation must not count.
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function verifyCitations(world: World, pages: string[]): World {
  return { ...world, trees: world.trees.map(t => {
    const c = t.citation;
    if (!c) return t;
    const page = pages[c.page - 1];
    if (page && norm(page).includes(norm(c.quote))) return t;
    console.warn(`[brain] dropped unverifiable citation on ${t.id} (p${c.page}): "${c.quote.slice(0, 60)}"`);
    return { ...t, citation: null };
  }) };
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
    .map(c => ({ ...c, questName: c.questName ?? c.name, bloom: c.bloom ?? 'understand', syllabusRef: c.syllabusRef ?? '',
                 level: c.level ?? base.syllabus.level, prerequisites: c.prerequisites ?? [], centre: [0, 0, 0] }));
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
