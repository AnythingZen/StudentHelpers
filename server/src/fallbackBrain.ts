// C's own brain: no API key, no network. Builds worlds from the committed
// fixtures and grades with deterministic rules. It exists so the demo runs even
// if Builder B's pipeline, the model provider or the venue wifi fails.
//
// Honest limits, on purpose: it cannot generate a world from an arbitrary PDF —
// it maps the chosen subject to a fixture — and its diagnosis and grading are
// heuristics, not a model. Good enough to keep the loop alive on stage.

import { readFileSync } from 'node:fs';
import type { Brain } from './brain.js';
import type {
  Bloom, Diagnosis, Explanation, ServerWorld, Source, SpawnInput, Syllabus, TreeWithAnswer,
} from './contract.js';

const FIXTURES = {
  maths: new URL('../../mockWorld.json', import.meta.url),
  reading: new URL('../../mockWorldReading.json', import.meta.url),
};

export function loadFixture(which: keyof typeof FIXTURES): ServerWorld {
  const { _comment: _ignored, ...world } = JSON.parse(readFileSync(FIXTURES[which], 'utf8'));
  return world as ServerWorld;
}

// A freshly spawned forest: every tree untouched. The fixtures deliberately
// include withered trees and saplings for visual development; a real spawn
// starts clean, and fixture saplings become ordinary base trees.
export function freshWorld(fixture: ServerWorld): ServerWorld {
  return {
    ...fixture,
    status: 'ready',
    sessionIndex: 0,
    trees: fixture.trees.map(t => ({ ...t, state: 'healthy', leitnerBox: 1, spawnedFrom: null })),
  };
}

const pickFixture = (s: Syllabus): keyof typeof FIXTURES =>
  /english|reading|literacy/i.test(`${s.subject} ${s.topic}`) ? 'reading' : 'maths';

function sourceFor(input: SpawnInput, s: Syllabus): Source {
  switch (input.kind) {
    case 'pdf': return { kind: 'pdf', filename: input.filename, pages: 0 };
    case 'url': return { kind: 'url', url: input.url, title: input.url };
    case 'text': return { kind: 'text', label: input.label, chars: input.text.length };
    case 'prompt': return { kind: 'prompt', text: `${s.level} ${s.subject} — ${s.topic}` };
  }
}

// ---------- text heuristics ----------

const STOP = new Set(('a an the and or but of to in on at for by with is are was were be been it its this that these those ' +
  'you your i we they he she them his her as so if then than do does did not no yes can could would should will ' +
  'just very really about into from what which who how why when where there here also only same').split(' '));
// "no", "yes", "same" and "not" carry meaning in answers; keep them out of STOP where it matters.
for (const keep of ['no', 'yes', 'same', 'not']) STOP.delete(keep);

const SYNONYMS: Record<string, string> = {
  top: 'numerator', bottom: 'denominator', bottoms: 'denominator', tops: 'numerator',
  bigger: 'larger', greater: 'larger', biggest: 'larger', smaller: 'less', fewer: 'less',
  alike: 'same', equal: 'same', match: 'same', matching: 'same', common: 'same',
  piece: 'part', pieces: 'part', parts: 'part', shaking: 'trembling', quickly: 'fast',
};

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/\d+\/\d+|[a-z]+|\d+/g) ?? [])
    .map(w => SYNONYMS[w] ?? w)
    .map(w => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .map(w => SYNONYMS[w] ?? w)
    .filter(w => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
}

const NUMBERISH = /\d/;

// ---------- the brain ----------

const HINTS: Record<Bloom, string[]> = {
  remember: [
    'What does the question ask you to recall — can you say it in your own words first?',
    'Before you pick again, what do you already know is true here?',
  ],
  understand: [
    'What would have to be true for your answer to be right? Is it?',
    'Can you explain to yourself why that answer might not fit?',
  ],
  apply: [
    'What is the very first step if you work it through slowly?',
    'Try it with smaller numbers first — what happens?',
  ],
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export interface FallbackBrainOptions {
  plantDelayMs?: number;   // pause between tree batches so the forest visibly grows
}

export function createFallbackBrain(opts: FallbackBrainOptions = {}): Brain {
  const delay = opts.plantDelayMs ?? 250;
  const sleep = (ms: number) => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());

  return {
    name: 'fallback',

    async spawnWorld(input, syllabus, onPartial) {
      const base = freshWorld(loadFixture(pickFixture(syllabus)));
      const world: ServerWorld = {
        ...base,
        syllabus,
        subject: `${syllabus.level} ${syllabus.subject} — ${syllabus.topic}`,
        source: sourceFor(input, syllabus),
      };
      onPartial({ concepts: world.concepts, misconceptions: world.misconceptions, trees: [] });
      for (let n = 4; n < world.trees.length + 4; n += 4) {
        await sleep(delay);
        onPartial({ trees: world.trees.slice(0, Math.min(n, world.trees.length)) });
      }
      return world;
    },

    async diagnose(tree, response, world): Promise<Diagnosis> {
      const candidates = world.misconceptions.filter(m => m.conceptId === tree.conceptId && m.id !== 'unclassified');
      if (candidates.length === 0) {
        return { misconceptionId: 'unclassified', confidence: 0, scaffoldHint: HINTS.understand[0]!, evidence: 'no misconceptions for concept' };
      }
      // For choice trees, spread different wrong options across the concept's
      // misconceptions so the heatmap isn't one bar. A heuristic, labelled as such.
      const slot = typeof response === 'number' ? response : hash(String(response));
      const m = candidates[slot % candidates.length]!;
      const bloom = world.concepts.find(c => c.id === tree.conceptId)?.bloom ?? 'understand';
      const pool = HINTS[bloom];
      return {
        misconceptionId: m.id,
        confidence: 0.5,
        scaffoldHint: pool[hash(tree.id) % pool.length]!,
        evidence: 'rule-based fallback diagnosis',
      };
    },

    async gradeRecall(tree, text) {
      const key = [...new Set(tokens(tree.answerText ?? ''))];
      const said = new Set(tokens(text));
      if (key.length === 0 || said.size === 0) return { correct: false, why: 'no answer given' };
      const numbersOk = key.filter(k => NUMBERISH.test(k)).every(k => said.has(k));
      const overlap = key.filter(k => said.has(k)).length / key.length;
      const correct = numbersOk && overlap >= 0.4;
      return {
        correct,
        why: correct ? 'covers the key idea' : numbersOk ? 'missing the key idea' : 'the numbers do not match',
      };
    },

    async gradeExplanation(tree, text): Promise<Explanation> {
      const rubric = tree.rubric ?? [];
      const said = new Set(tokens(text));
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const hit: string[] = [];
      const missing: string[] = [];
      for (const item of rubric) {
        const itemTokens = tokens(item).filter(t => t.length >= 4 || NUMBERISH.test(t));
        (itemTokens.some(t => said.has(t)) ? hit : missing).push(item);
      }
      const passed = wordCount >= 8 && hit.length >= Math.ceil(rubric.length / 2);
      return {
        passed,
        hit,
        missing,
        encouragement: passed
          ? 'Oh! That makes sense now — thank you for explaining it!'
          : "Hmm, I'm still a bit stuck. Could you explain it another way?",
      };
    },

    async focusQuest(world, misconceptionId) {
      const m = world.misconceptions.find(x => x.id === misconceptionId);
      if (!m) return [];
      const taken = new Set(world.trees.map(t => t.id));
      return world.trees
        .filter(t => t.conceptId === m.conceptId && t.spawnedFrom === null)
        .slice(0, 5)
        .map((t, i) => {
          let id = `${misconceptionId}-focus${world.sessionIndex}-${i + 1}`;
          while (taken.has(id)) id += 'x';
          taken.add(id);
          return { ...t, id, state: 'healthy' as const, leitnerBox: 1 as const, spawnedFrom: null };
        });
    },
  };
}
