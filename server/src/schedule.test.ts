import { describe, it, expect } from 'vitest';
import { schedule, nextSession, conceptHealth, isLocked, bars } from './schedule.js';
import type { AnswerEvent, Concept, TreeWithAnswer, ServerWorld } from './contract.js';

const tree = (id: string, over: Partial<TreeWithAnswer> = {}): TreeWithAnswer => ({
  id, conceptId: 'c1', pos: [0, 0, 0], kind: 'choice', question: 'q', choices: ['a', 'b'],
  answerIndex: 0, explanation: 'e', citation: null, state: 'healthy', leitnerBox: 1,
  spawnedFrom: null, ...over,
});
const concept = (id: string, prerequisites: string[] = []): Concept => ({
  id, name: id, questName: id, bloom: 'remember', syllabusRef: '', level: 'Primary 5',
  prerequisites, centre: [0, 0, 0],
});
const world = (trees: TreeWithAnswer[], concepts: Concept[] = [concept('c1')]): ServerWorld => ({
  worldId: 'TEST', subject: 's', status: 'ready', sessionIndex: 0,
  syllabus: { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' },
  source: { kind: 'prompt', text: 'x' }, concepts, misconceptions: [], trees,
});
const find = (w: ServerWorld, id: string) => w.trees.find(t => t.id === id)!;
const saplingsOf = (w: ServerWorld, root: string) => w.trees.filter(t => t.spawnedFrom === root);

describe('schedule — Leitner boxes', () => {
  it('correct on an untouched tree → box 2, stays healthy, no sapling', () => {
    const w = schedule(world([tree('t1')]), 't1', true);
    expect(find(w, 't1')).toMatchObject({ leitnerBox: 2, state: 'healthy' });
    expect(w.trees).toHaveLength(1);
  });

  it('correct caps at box 3', () => {
    const w = schedule(world([tree('t1', { leitnerBox: 3 })]), 't1', true);
    expect(find(w, 't1').leitnerBox).toBe(3);
  });

  it('returns the world unchanged for an unknown tree id', () => {
    const w = world([tree('t1')]);
    expect(schedule(w, 'nope', true)).toBe(w);
  });

  it('does not mutate its input', () => {
    const w = world([tree('t1')]);
    const snapshot = JSON.stringify(w);
    schedule(w, 't1', false);
    expect(JSON.stringify(w)).toBe(snapshot);
  });
});

describe('schedule — wither, sapling, regrow', () => {
  it('wrong on healthy → withered, box 1, sapling of the same concept', () => {
    const w = schedule(world([tree('t1', { leitnerBox: 2 })]), 't1', false);
    expect(find(w, 't1')).toMatchObject({ state: 'withered', leitnerBox: 1 });
    const [sap] = saplingsOf(w, 't1');
    expect(sap).toMatchObject({ state: 'sapling', conceptId: 'c1', leitnerBox: 1, spawnedFrom: 't1' });
  });

  it('correct on a withered tree regrows it (review ruling 4)', () => {
    let w = schedule(world([tree('t1')]), 't1', false);
    w = schedule(w, 't1', true);
    expect(find(w, 't1').state).toBe('regrown');
  });

  it('correct on a sapling → parent regrown, sapling healthy', () => {
    let w = schedule(world([tree('t1')]), 't1', false);
    const sap = saplingsOf(w, 't1')[0]!;
    w = schedule(w, sap.id, true);
    expect(find(w, 't1').state).toBe('regrown');
    expect(find(w, sap.id).state).toBe('healthy');
  });

  it('max 2 saplings per parent per session', () => {
    let w = schedule(world([tree('t1')]), 't1', false);
    w = schedule(w, saplingsOf(w, 't1')[0]!.id, false);
    expect(saplingsOf(w, 't1')).toHaveLength(2);
    w = schedule(w, saplingsOf(w, 't1')[1]!.id, false);
    expect(saplingsOf(w, 't1')).toHaveLength(2);
  });

  it('box 3 is retired: a wrong answer withers but does not respawn', () => {
    const w = schedule(world([tree('t1', { leitnerBox: 3 })]), 't1', false);
    expect(find(w, 't1').state).toBe('withered');
    expect(saplingsOf(w, 't1')).toHaveLength(0);
  });

  it('sapling ids never collide across sessions (review finding 2)', () => {
    let w = schedule(world([tree('t1')]), 't1', false);
    w = schedule(w, 't1', false);
    w = schedule(w, saplingsOf(w, 't1')[1]!.id, true);
    w = nextSession(w);
    w = schedule(w, 't1', false);
    const ids = w.trees.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('nextSession', () => {
  it('clears every sapling whatever its state, resets non-retired trees, bumps the session', () => {
    let w = world([tree('t1'), tree('t2', { leitnerBox: 3, state: 'withered' })]);
    w = schedule(w, 't1', false);
    w = schedule(w, saplingsOf(w, 't1')[0]!.id, true); // repaired sapling is 'healthy', not 'sapling'
    w = nextSession(w);
    expect(w.trees.filter(t => t.spawnedFrom !== null)).toHaveLength(0);
    expect(find(w, 't1').state).toBe('healthy');
    expect(find(w, 't2').state).toBe('withered'); // retired trees are left as they are
    expect(w.sessionIndex).toBe(1);
  });

  it('a new session can spawn saplings again (review finding 3)', () => {
    let w = schedule(world([tree('t1')]), 't1', false);
    w = schedule(w, saplingsOf(w, 't1')[0]!.id, false);
    w = nextSession(w);
    w = schedule(w, 't1', false);
    expect(saplingsOf(w, 't1')).toHaveLength(1);
  });
});

describe('conceptHealth — demonstrated mastery, not absence of failure', () => {
  it('an untouched concept has zero health', () => {
    expect(conceptHealth(world([tree('a'), tree('b')]), 'c1')).toBe(0);
  });

  it('each correct answer adds a plank', () => {
    let w = world([tree('a'), tree('b'), tree('c'), tree('d')]);
    w = schedule(w, 'a', true);
    expect(conceptHealth(w, 'c1')).toBeCloseTo(0.25);
    w = schedule(w, 'b', true);
    expect(conceptHealth(w, 'c1')).toBeCloseTo(0.5);
  });

  it('a wrong answer on a learned tree knocks its plank out', () => {
    let w = world([tree('a', { leitnerBox: 2 }), tree('b', { leitnerBox: 2 })]);
    w = schedule(w, 'a', false);
    expect(conceptHealth(w, 'c1')).toBeCloseTo(0.5);
  });

  it('saplings never count, in numerator or denominator (review finding 5)', () => {
    let w = world([tree('a', { leitnerBox: 2 }), tree('b', { leitnerBox: 2 })]);
    w = schedule(w, 'a', false);
    w = schedule(w, saplingsOf(w, 'a')[0]!.id, true);
    expect(conceptHealth(w, 'c1')).toBeCloseTo(0.5);
  });
});

describe('isLocked — the mastery gate', () => {
  const gated = () => world(
    [tree('a'), tree('b'), tree('x', { conceptId: 'c2' })],
    [concept('c1'), concept('c2', ['c1'])],
  );

  it('a concept with no prerequisites is never locked', () => {
    expect(isLocked(gated(), 'c1')).toBe(false);
  });

  it('a dependent grove is LOCKED before its prerequisite has been learned', () => {
    // Under the contract's original health rule — untouched 'healthy' trees count
    // as alive — this was unlocked from minute one, including the level ladder.
    expect(isLocked(gated(), 'c2')).toBe(true);
  });

  it('unlocks once every prerequisite reaches 0.6', () => {
    let w = gated();
    w = schedule(w, 'a', true);
    expect(isLocked(w, 'c2')).toBe(true);   // 0.5
    w = schedule(w, 'b', true);
    expect(isLocked(w, 'c2')).toBe(false);  // 1.0
  });
});

describe('bars', () => {
  const ev = (over: Partial<AnswerEvent>): AnswerEvent => ({
    ts: 0, playerId: 'p', treeId: 't', conceptId: 'c1', kind: 'choice', correct: true,
    misconceptionId: null, confidence: null, ...over,
  });

  it('xp = 10 per correct answer + 25 per teach passed; wrong answers earn nothing', () => {
    const events = [ev({}), ev({}), ev({ correct: false }), ev({ kind: 'teach' })];
    expect(bars(world([tree('a')]), events).xp).toBe(45);
  });

  it('mastery is the mean concept health', () => {
    const w = world(
      [tree('a', { leitnerBox: 2 }), tree('b'), tree('x', { conceptId: 'c2' })],
      [concept('c1'), concept('c2')],
    );
    expect(bars(w, []).mastery).toBeCloseTo((0.5 + 0) / 2);
  });

  it('retention = of what has been learned, how much survived a later retrieval', () => {
    const w = world([tree('a', { leitnerBox: 3 }), tree('b', { leitnerBox: 2 }), tree('c')]);
    expect(bars(w, []).retention).toBeCloseTo(0.5);
    expect(bars(world([tree('a')]), []).retention).toBe(0);
  });
});
