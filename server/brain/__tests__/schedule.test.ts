import { describe, it, expect } from 'vitest';
import { schedule, nextSession, conceptHealth } from '../schedule.js';
import type { World, Tree } from '../../../shared/types.js';

function tree(over: Partial<Tree> = {}): Tree {
  return {
    id: 't1', conceptId: 'c1', pos: [0, 0, 0], kind: 'choice',
    question: 'q', choices: ['a', 'b'], explanation: 'e', citation: null,
    state: 'healthy', leitnerBox: 1, spawnedFrom: null, ...over,
  };
}

function world(trees: Tree[]): World {
  return {
    worldId: 'TEST', sessionIndex: 0,
    syllabus: { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' },
    subject: 'P5 Maths', source: { kind: 'prompt', text: 'fractions' }, status: 'ready',
    concepts: [{ id: 'c1', name: 'c', bloom: 'remember', syllabusRef: '', level: 'Primary 5', prerequisites: [], centre: [0, 0, 0] }],
    misconceptions: [], trees,
  };
}

const find = (w: World, id: string) => w.trees.find(t => t.id === id)!;
const saplingsOf = (w: World, id: string) => w.trees.filter(t => t.spawnedFrom === id);

describe('schedule — Leitner', () => {
  it('correct on healthy box-1 → box 2, stays healthy, no sapling', () => {
    const w = schedule(world([tree()]), 't1', true);
    expect(find(w, 't1')).toMatchObject({ state: 'healthy', leitnerBox: 2 });
    expect(w.trees).toHaveLength(1);
  });

  it('correct caps at box 3', () => {
    const w = schedule(world([tree({ leitnerBox: 3 })]), 't1', true);
    expect(find(w, 't1').leitnerBox).toBe(3);
  });

  it('wrong on healthy → withered, box 1, sapling spawned with spawnedFrom', () => {
    const w = schedule(world([tree({ leitnerBox: 2 })]), 't1', false);
    expect(find(w, 't1')).toMatchObject({ state: 'withered', leitnerBox: 1 });
    const [s] = saplingsOf(w, 't1');
    expect(s).toMatchObject({ state: 'sapling', conceptId: 'c1', leitnerBox: 1, spawnedFrom: 't1' });
    expect(s.id).not.toBe('t1');
    expect(s.question).toBe('q');
  });

  it('correct on sapling → parent regrown, sapling healthy', () => {
    let w = schedule(world([tree()]), 't1', false);
    const s = saplingsOf(w, 't1')[0];
    w = schedule(w, s.id, true);
    expect(find(w, 't1').state).toBe('regrown');
    expect(find(w, s.id).state).toBe('healthy');
  });

  it('wrong on sapling → second sapling; third wrong spawns none (max 2)', () => {
    let w = schedule(world([tree()]), 't1', false);
    const s1 = saplingsOf(w, 't1')[0];
    w = schedule(w, s1.id, false);
    expect(saplingsOf(w, 't1')).toHaveLength(2);
    const s2 = saplingsOf(w, 't1')[1];
    w = schedule(w, s2.id, false);
    expect(saplingsOf(w, 't1')).toHaveLength(2);
    expect(find(w, s2.id).state).toBe('withered');
  });

  it('box 3 is retired: wrong answer does not respawn', () => {
    const w = schedule(world([tree({ leitnerBox: 3 })]), 't1', false);
    expect(w.trees).toHaveLength(1);
    expect(find(w, 't1').state).toBe('withered');
  });

  it('does not mutate its input', () => {
    const before = world([tree()]);
    const snapshot = JSON.stringify(before);
    schedule(before, 't1', false);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('conceptHealth', () => {
  it('= (healthy + regrown) / total for that concept', () => {
    const w = world([
      tree({ id: 'a', state: 'healthy' }),
      tree({ id: 'b', state: 'regrown' }),
      tree({ id: 'c', state: 'withered' }),
      tree({ id: 'd', state: 'sapling' }),
      tree({ id: 'e', conceptId: 'c2', state: 'withered' }),
    ]);
    expect(conceptHealth(w, 'c1')).toBe(0.5);
  });
  it('is 0 for a concept with no trees', () => {
    expect(conceptHealth(world([]), 'c1')).toBe(0);
  });
});

describe('nextSession', () => {
  it('box 1 + 2 → healthy, saplings cleared, sessionIndex + 1, box 3 untouched', () => {
    let w = schedule(world([tree(), tree({ id: 't2', leitnerBox: 3, state: 'withered' })]), 't1', false);
    w = nextSession(w);
    expect(w.sessionIndex).toBe(1);
    expect(w.trees.some(t => t.state === 'sapling')).toBe(false);
    expect(find(w, 't1').state).toBe('healthy');
    expect(find(w, 't2').state).toBe('withered');
  });
});
