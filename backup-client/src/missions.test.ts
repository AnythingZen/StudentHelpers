import { describe, expect, it } from 'vitest';
import type { Tree, World } from '../../server/src/contract';
import { beaconTree, judgmentFeedback } from './missions';
import type { PlayerProgress } from './net';

const tree = (id: string, kind: Tree['kind'], pos: [number, number, number], over: Partial<Tree> = {}): Tree => ({
  id, conceptId: 'c1', pos, kind, question: '?', explanation: '', citation: null, state: 'healthy', leitnerBox: 1, spawnedFrom: null, ...over,
});
const world = (trees: Tree[]) => ({ trees } as unknown as World<Tree>);
const me = (objectives: Array<{ kind: string; done: boolean }>) => ({
  current: 'c1',
  missions: [{ conceptId: 'c1', objectives: objectives.map(o => ({ ...o, label: '', progress: 0, target: 1 })) }],
} as unknown as PlayerProgress);

describe('beaconTree', () => {
  it('points at the nearest unanswered tree for the first unfinished objective', () => {
    const w = world([tree('far', 'choice', [0, 0, -30]), tree('near', 'choice', [0, 0, -5]), tree('r', 'recall', [0, 0, -1])]);
    expect(beaconTree(w, me([{ kind: 'answer', done: false }, { kind: 'recall', done: false }]), { x: 0, z: 0 })?.id).toBe('near');
    expect(beaconTree(w, me([{ kind: 'answer', done: true }, { kind: 'recall', done: false }]), { x: 0, z: 0 })?.id).toBe('r');
  });

  it('skips trees already answered right, and sends a missed question to its sapling', () => {
    const w = world([tree('t1', 'choice', [0, 0, -2], { leitnerBox: 2 }), tree('t1-s0-1', 'choice', [0, 0, -40], { state: 'sapling', spawnedFrom: 't1' })]);
    expect(beaconTree(w, me([{ kind: 'answer', done: false }]), { x: 0, z: 0 })).toBeNull();
    expect(beaconTree(w, me([{ kind: 'review', done: false }]), { x: 0, z: 0 })?.id).toBe('t1-s0-1');
  });

  it('has nothing to point at once only the reflection is left', () => {
    expect(beaconTree(world([tree('t', 'choice', [0, 0, 0])]), me([{ kind: 'reflect', done: false }]), { x: 0, z: 0 })).toBeNull();
  });
});

describe('judgmentFeedback', () => {
  it('names over- and under-confidence', () => {
    expect(judgmentFeedback(4, 0.4)).toMatch(/second look/);
    expect(judgmentFeedback(1, 0.9)).toMatch(/more than you think/);
    expect(judgmentFeedback(3, 1)).toMatch(/know what you know/);
  });
});
