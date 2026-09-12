import { describe, expect, it } from 'vitest';
import type { AnswerEvent, ServerWorld } from './contract.js';
import { freshWorld, loadFixture } from './fallbackBrain.js';
import { playerProgress, roster, treesFor, type Reflection } from './progress.js';

// Fixture: c1 (t1 choice, t2 recall, t3 choice) → c2 (t4, t6 choice, t5 recall, t15 teach) → …
const world = (): ServerWorld => ({ ...freshWorld(loadFixture('maths')), worldId: 'OAK7' });

let ts = 0;
const ev = (treeId: string, correct: boolean, over: Partial<AnswerEvent> = {}): AnswerEvent => {
  const w = world();
  const t = w.trees.find(x => x.id === treeId);
  return {
    ts: ++ts, sessionIndex: 0, playerId: 'p1', treeId, conceptId: t?.conceptId ?? 'c1',
    kind: t?.kind ?? 'choice', correct, misconceptionId: correct ? null : 'm1', confidence: null, ...over,
  };
};
const reflect = (conceptId: string, playerId = 'p1'): Reflection =>
  ({ ts: ++ts, playerId, name: 'Alex', conceptId, rating: 3, note: '' });
const mission = (p: ReturnType<typeof playerProgress>, id: string) => p.missions.find(m => m.conceptId === id)!;
const objective = (p: ReturnType<typeof playerProgress>, id: string, kind: string) =>
  mission(p, id).objectives.find(o => o.kind === kind);

describe('missions', () => {
  it('builds each grove\'s mission from its own trees', () => {
    const p = playerProgress(world(), [], [], 'p1');
    expect(mission(p, 'c1').objectives.map(o => o.kind)).toEqual(['answer', 'recall', 'reflect']);
    expect(objective(p, 'c1', 'answer')!.target).toBe(2);
    expect(mission(p, 'c2').objectives.map(o => o.kind)).toEqual(['answer', 'recall', 'teach', 'reflect']);
    expect(p.current).toBe('c1');
    expect(mission(p, 'c1').unlocked).toBe(true);
    expect(mission(p, 'c2').unlocked).toBe(false);
  });

  it('only completes a mission after the student reflects, and that unlocks the next grove for them alone', () => {
    const events = [ev('t1', true), ev('t3', true), ev('t2', true)];
    const ready = playerProgress(world(), events, [], 'p1');
    expect(mission(ready, 'c1').ready).toBe(true);
    expect(mission(ready, 'c1').complete).toBe(false);
    expect(mission(ready, 'c2').unlocked).toBe(false);

    const done = playerProgress(world(), events, [reflect('c1')], 'p1');
    expect(mission(done, 'c1').complete).toBe(true);
    expect(mission(done, 'c2').unlocked).toBe(true);
    expect(done.current).toBe('c2');
    // Another student in the same forest still starts at the beginning.
    expect(mission(playerProgress(world(), events, [reflect('c1')], 'p2'), 'c2').unlocked).toBe(false);
  });

  it('spaced practice: a missed question is only fixed by coming back to it after other questions', () => {
    const immediate = [ev('t1', false), ev('t1', true)];
    expect(objective(playerProgress(world(), immediate, [], 'p1'), 'c1', 'review')).toMatchObject({ progress: 0, target: 1, done: false });

    const spaced = [ev('t1', false), ev('t1', true), ev('t3', true), ev('t1-s0-1', true)];
    expect(objective(playerProgress(world(), spaced, [], 'p1'), 'c1', 'review')).toMatchObject({ progress: 1, target: 1, done: true });
  });

  it('a mission with an unfixed miss is not ready to reflect on', () => {
    const events = [ev('t1', false), ev('t1', true), ev('t3', true), ev('t2', true)];
    expect(mission(playerProgress(world(), events, [], 'p1'), 'c1').ready).toBe(false);
  });

  it('adds the teacher\'s focus quest as an objective in that grove', () => {
    const w = world();
    const quest = { ...w.trees.find(t => t.id === 't1')!, id: 'q1', spawnedFrom: 'quest:m1' };
    const p = playerProgress({ ...w, trees: [...w.trees, quest] }, [], [], 'p1');
    expect(objective(p, 'c1', 'focus')).toMatchObject({ target: 1, done: false });
  });

  it('per-student bars: mastery is missions completed, calibration counts confidence against correctness', () => {
    const events = [ev('t1', true, { confidence: 'low' }), ev('t3', false, { confidence: 'high' }), ev('t2', true, { confidence: 'medium' })];
    const p = playerProgress(world(), events, [], 'p1');
    expect(p.mastery).toBe(0);
    expect(p.xp).toBe(20);
    expect(p.calibration).toEqual({ calibrated: 1, overconfident: 1, underconfident: 1 });
    const done = playerProgress(world(), [ev('t1', true), ev('t3', true), ev('t2', true)], [reflect('c1')], 'p1');
    expect(done.mastery).toBeCloseTo(1 / 5);
  });
});

describe('each student sees their own forest', () => {
  it('withers and regrows trees from that student\'s answers only, and hides other students\' saplings', () => {
    const w = world();
    const sapling = { ...w.trees.find(t => t.id === 't1')!, id: 't1-s0-1', spawnedFrom: 't1', state: 'sapling' as const, ownerId: 'p2' };
    const shared: ServerWorld = { ...w, trees: [...w.trees.map(t => t.id === 't1' ? { ...t, state: 'withered' as const } : t), sapling] };
    const mine = treesFor(shared, [ev('t3', false), ev('t2', true)], 'p1');
    expect(mine.find(t => t.id === 't1')!.state).toBe('healthy');     // p2's miss isn't p1's
    expect(mine.find(t => t.id === 't3')!.state).toBe('withered');
    expect(mine.find(t => t.id === 't2')!.leitnerBox).toBe(2);
    expect(mine.some(t => t.id === 't1-s0-1')).toBe(false);
    expect(treesFor(shared, [ev('t1', false, { playerId: 'p2' })], 'p2').some(t => t.id === 't1-s0-1')).toBe(true);
    const regrown = treesFor(shared, [ev('t3', false), ev('t3', true)], 'p1');
    expect(regrown.find(t => t.id === 't3')!.state).toBe('regrown');
  });
});

describe('teacher roster', () => {
  it('lists real students with their mission, accuracy, calibration and a status flag', () => {
    const events = [
      ev('t1', true, { name: 'Alex' }), ev('t3', true), ev('t2', true),
      ev('t1', false, { playerId: 'p2', name: 'Bea', confidence: 'high', misconceptionId: 'm1' }),
      ev('t3', false, { playerId: 'p2', confidence: 'high', misconceptionId: 'm1' }),
      ev('t1', false, { playerId: 'p2', confidence: 'high', misconceptionId: 'm1' }),
    ];
    const online = [
      { playerId: 'p1', name: 'Alex', pos: [0, 0, 0] as [number, number, number], yaw: 0, seeded: false },
      { playerId: 'seed-aisha', name: 'Aisha', pos: [0, 0, 0] as [number, number, number], yaw: 0, seeded: true },
      { playerId: 'p3', name: 'Cy', pos: [0, 0, 0] as [number, number, number], yaw: 0, seeded: false },
    ];
    const rows = roster(world(), events, [reflect('c1')], online, 10_000);
    expect(rows.map(r => r.name).sort()).toEqual(['Alex', 'Bea', 'Cy']);
    const alex = rows.find(r => r.name === 'Alex')!;
    expect(alex).toMatchObject({ online: true, missionsComplete: 1, accuracy: 1, status: 'on-track' });
    expect(alex.currentMission?.conceptId).toBe('c2');
    const bea = rows.find(r => r.name === 'Bea')!;
    expect(bea.status).toBe('stuck');
    expect(bea.calibration.overconfident).toBe(3);
    expect(bea.lastMisconception).toBeTruthy();
    expect(rows.find(r => r.name === 'Cy')!.status).toBe('not-started');
  });
});
