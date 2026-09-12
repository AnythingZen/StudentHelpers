import { describe, it, expect } from 'vitest';
import { createFallbackBrain, loadFixture, freshWorld, tokens } from './fallbackBrain.js';
import { isLocked } from './schedule.js';
import type { ServerWorld, Syllabus } from './contract.js';

const brain = createFallbackBrain({ plantDelayMs: 0 });
const maths: Syllabus = { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' };
const english: Syllabus = { system: 'MOE-SG', level: 'Primary 3', subject: 'English', topic: 'Reading Comprehension' };
const tree = (w: ServerWorld, id: string) => w.trees.find(t => t.id === id)!;

describe('fixtures', () => {
  it('load without the _comment field', () => {
    expect(loadFixture('maths')).not.toHaveProperty('_comment');
  });

  it('a fresh world has every tree untouched, and the fixture saplings become base trees', () => {
    const w = freshWorld(loadFixture('maths'));
    expect(w.trees.every(t => t.state === 'healthy' && t.leitnerBox === 1 && t.spawnedFrom === null)).toBe(true);
    expect(w.trees).toHaveLength(loadFixture('maths').trees.length);
  });

  it('on the REAL maths fixture, the Primary 6 level-ladder grove is locked at spawn', () => {
    const w = freshWorld(loadFixture('maths'));
    const ladder = w.concepts.find(c => c.level !== w.syllabus.level)!;
    expect(ladder.level).toBe('Primary 6');
    expect(isLocked(w, ladder.id)).toBe(true);
    expect(isLocked(w, 'c2')).toBe(true);
    expect(isLocked(w, 'c1')).toBe(false);
  });
});

describe('fallback spawnWorld', () => {
  it('picks the maths or reading fixture from the syllabus', async () => {
    const m = await brain.spawnWorld({ kind: 'prompt' }, maths, () => {});
    const r = await brain.spawnWorld({ kind: 'prompt' }, english, () => {});
    expect(m.concepts.some(c => /fraction/i.test(c.name))).toBe(true);
    expect(r.concepts.some(c => /context/i.test(c.name))).toBe(true);
    expect(r.subject).toBe('Primary 3 English — Reading Comprehension');
  });

  it('reports concepts first, then a growing forest', async () => {
    const partials: Array<Partial<ServerWorld>> = [];
    const w = await brain.spawnWorld({ kind: 'prompt' }, maths, p => partials.push(p));
    expect(partials[0]!.concepts!.length).toBeGreaterThan(0);
    const counts = partials.filter(p => p.trees).map(p => p.trees!.length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts.at(-1)).toBe(w.trees.length);
  });

  it('records where the content came from', async () => {
    const w = await brain.spawnWorld({ kind: 'text', label: 'pasted', text: 'hello' }, maths, () => {});
    expect(w.source).toEqual({ kind: 'text', label: 'pasted', chars: 5 });
  });
});

describe('fallback diagnose', () => {
  it('classifies into a misconception of the same concept, with a question that does not leak the answer', async () => {
    const w = freshWorld(loadFixture('maths'));
    const t4 = tree(w, 't4'); // "Which is larger: 3/4 or 5/8?" — correct choice "3/4"
    const d = await brain.diagnose(t4, 0, w);
    const m = w.misconceptions.find(x => x.id === d.misconceptionId)!;
    expect(m.conceptId).toBe(t4.conceptId);
    expect(d.scaffoldHint.trim().endsWith('?')).toBe(true);
    expect(d.scaffoldHint).not.toContain(t4.choices![t4.answerIndex!]);
  });

  it('falls back to unclassified when a concept has no misconceptions', async () => {
    const w = { ...freshWorld(loadFixture('maths')), misconceptions: [] };
    expect((await brain.diagnose(tree(w, 't1'), 1, w)).misconceptionId).toBe('unclassified');
  });
});

describe('fallback gradeRecall', () => {
  const w = freshWorld(loadFixture('maths'));
  const t2 = tree(w, 't2'); // simplifying 10/15 to 2/3 — same amount

  it('accepts the key idea in the student\'s own words', async () => {
    const r = await brain.gradeRecall(t2, "No, it's the same amount — the top and bottom were both divided by 5");
    expect(r.correct).toBe(true);
  });

  it('rejects a wrong idea, an empty answer, and the right words with the wrong number', async () => {
    expect((await brain.gradeRecall(t2, 'yes it gets smaller')).correct).toBe(false);
    expect((await brain.gradeRecall(t2, '   ')).correct).toBe(false);
    expect((await brain.gradeRecall(t2, 'no, same amount, both divided by 3')).correct).toBe(false);
  });
});

describe('fallback gradeExplanation — helping Mia', () => {
  const w = freshWorld(loadFixture('maths'));
  const t15 = tree(w, 't15');

  it('passes a real explanation and reports which rubric points landed', async () => {
    const r = await brain.gradeExplanation(t15,
      "You can't compare the top numbers unless the bottom numbers match. Make a common denominator first: " +
      '3/4 = 6/8, and 6/8 is bigger than 5/8 because the denominator sets the size of each part.');
    expect(r.passed).toBe(true);
    expect(r.hit.length).toBeGreaterThanOrEqual(3);
    expect(r.encouragement.length).toBeGreaterThan(0);
  });

  it('does not pass a throwaway answer', async () => {
    const r = await brain.gradeExplanation(t15, 'just pick the bigger one');
    expect(r.passed).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});

describe('fallback focusQuest', () => {
  it('returns up to 5 untouched trees from the misconception\'s concept with unique new ids', async () => {
    const w = freshWorld(loadFixture('maths'));
    const quest = await brain.focusQuest(w, 'm3');
    expect(quest.length).toBeGreaterThan(0);
    expect(quest.length).toBeLessThanOrEqual(5);
    const existing = new Set(w.trees.map(t => t.id));
    for (const t of quest) {
      expect(t.conceptId).toBe('c2');
      expect(existing.has(t.id)).toBe(false);
      expect(t).toMatchObject({ state: 'healthy', leitnerBox: 1, spawnedFrom: null });
    }
  });

  it('returns nothing for an unknown misconception', async () => {
    expect(await brain.focusQuest(freshWorld(loadFixture('maths')), 'nope')).toEqual([]);
  });
});

describe('tokens', () => {
  it('keeps fractions whole and maps kid-words to the maths words', () => {
    expect(tokens('the top over the bottom is 3/4')).toEqual(['numerator', 'over', 'denominator', '3/4']);
  });
});
