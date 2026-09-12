import { describe, it, expect } from 'vitest';
import { placeSapling, layoutReviews, placeNewTrees } from './layout.js';
import { schedule } from './schedule.js';
import { freshWorld, loadFixture } from './fallbackBrain.js';
import type { ServerWorld, TreeWithAnswer } from './contract.js';

const tree = (id: string, over: Partial<TreeWithAnswer> = {}): TreeWithAnswer => ({
  id, conceptId: 'c1', pos: [10, 0, -40], kind: 'choice', question: 'q', choices: ['a'], answerIndex: 0,
  explanation: 'e', citation: null, state: 'healthy', leitnerBox: 1, spawnedFrom: null, ...over,
});
const world = (trees: TreeWithAnswer[]): ServerWorld => ({
  worldId: 'T', subject: 's', status: 'ready', sessionIndex: 0,
  syllabus: { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' },
  source: { kind: 'prompt', text: 'x' }, concepts: [], misconceptions: [], trees,
});

describe('layout', () => {
  it('places a sapling further up the path than its parent', () => {
    let w = schedule(world([tree('t1')]), 't1', false);
    const sapId = w.trees.find(t => t.spawnedFrom === 't1')!.id;
    w = placeSapling(w, sapId);
    expect(w.trees.find(t => t.id === sapId)!.pos[2]).toBeLessThan(-40);
  });

  it('never plants a sapling on top of another tree', () => {
    // On the real maths fixture the first-choice spot for t4's sapling is exactly
    // where t15 (Mia's teach tree) stands.
    let w = freshWorld(loadFixture('maths'));
    w = schedule(w, 't4', false);
    const sapId = w.trees.find(t => t.spawnedFrom === 't4')!.id;
    w = placeSapling(w, sapId);
    const sap = w.trees.find(t => t.id === sapId)!;
    for (const t of w.trees.filter(x => x.id !== sapId)) {
      expect(Math.hypot(sap.pos[0] - t.pos[0], sap.pos[2] - t.pos[2])).toBeGreaterThanOrEqual(2.5);
    }
    expect(sap.pos[2]).toBeLessThan(w.trees.find(t => t.id === 't4')!.pos[2]);
  });

  it('brings answered, un-retired trees to the entrance and leaves the rest', () => {
    const w = layoutReviews(world([tree('a'), tree('b'), tree('c', { leitnerBox: 3 })]), new Set(['a', 'c']));
    expect(w.trees.find(t => t.id === 'a')!.pos[2]).toBeGreaterThan(-10);
    expect(w.trees.find(t => t.id === 'b')!.pos).toEqual([10, 0, -40]);
    expect(w.trees.find(t => t.id === 'c')!.pos).toEqual([10, 0, -40]);
  });

  it('gives every new tree a distinct slot near the entrance', () => {
    const ids = ['n1', 'n2', 'n3', 'n4', 'n5'];
    const w = placeNewTrees(world(ids.map(id => tree(id))), ids);
    const slots = w.trees.map(t => t.pos.join(','));
    expect(new Set(slots).size).toBe(5);
    w.trees.forEach(t => expect(t.pos[2]).toBeGreaterThan(-15));
  });
});
