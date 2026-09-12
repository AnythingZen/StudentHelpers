// Leitner scheduler, wither/sapling rules, concept health and the three bars.
// Pure and synchronous: no I/O, no mutation. Every rule here is from
// docs/CONTRACT.md plus the rulings in docs/reviews/.

import type { AnswerEvent, Bars, ServerWorld, TreeWithAnswer } from './contract.js';

const MAX_SAPLINGS_PER_SESSION = 2;
export const UNLOCK_THRESHOLD = 0.6;

export function schedule(world: ServerWorld, treeId: string, correct: boolean): ServerWorld {
  if (!world.trees.some(t => t.id === treeId)) return world;
  const trees = world.trees.map(t => ({ ...t }));
  const tree = trees.find(t => t.id === treeId)!;

  if (correct) {
    tree.leitnerBox = Math.min(3, tree.leitnerBox + 1) as 1 | 2 | 3;
    tree.state = tree.state === 'withered' ? 'regrown' : 'healthy';
    const parent = tree.spawnedFrom ? trees.find(t => t.id === tree.spawnedFrom) : undefined;
    if (parent) parent.state = 'regrown';
    return { ...world, trees };
  }

  const wasRetired = tree.leitnerBox === 3;
  tree.state = 'withered';
  tree.leitnerBox = 1;

  // Saplings chain back to the original tree, so the cap is per original parent.
  // nextSession() clears every sapling, which scopes this count to one session.
  const rootId = tree.spawnedFrom ?? tree.id;
  const existing = trees.filter(t => t.spawnedFrom === rootId).length;
  if (!wasRetired && existing < MAX_SAPLINGS_PER_SESSION) {
    const sapling: TreeWithAnswer = {
      ...tree,
      // Session in the id: without it, a sapling kept from a previous session and a
      // new one can share an id, and find(id) silently updates the wrong tree.
      id: `${rootId}-s${world.sessionIndex}-${existing + 1}`,
      pos: [...tree.pos] as [number, number, number], // the server's layout moves it up the path
      state: 'sapling',
      leitnerBox: 1,
      spawnedFrom: rootId,
    };
    trees.push(sapling);
  }
  return { ...world, trees };
}

export function nextSession(world: ServerWorld): ServerWorld {
  const trees = world.trees
    // Every sapling, whatever its state. A repaired sapling is 'healthy', so
    // filtering on state === 'sapling' would let it survive forever.
    .filter(t => t.spawnedFrom === null)
    .map(t => (t.leitnerBox === 3 ? { ...t } : { ...t, state: 'healthy' as const }));
  return { ...world, sessionIndex: world.sessionIndex + 1, trees };
}

const baseTrees = (world: ServerWorld, conceptId: string) =>
  world.trees.filter(t => t.conceptId === conceptId && t.spawnedFrom === null);

// Demonstrated mastery: the share of a concept's base trees the student has
// actually answered correctly (Leitner box 2+). Saplings never count.
//
// The contract originally counted 'healthy' + 'regrown' trees. Every tree starts
// 'healthy', so an untouched concept scored 1.0: every locked grove — the level
// ladder included — was unlocked from minute one, and a correct answer on a
// healthy tree added nothing, so bridges could never gain a plank. Proven by
// schedule.test.ts failing 6 tests under that rule.
export function conceptHealth(world: ServerWorld, conceptId: string): number {
  const trees = baseTrees(world, conceptId);
  if (trees.length === 0) return 0;
  return trees.filter(t => t.leitnerBox >= 2).length / trees.length;
}

export function isLocked(world: ServerWorld, conceptId: string): boolean {
  const concept = world.concepts.find(c => c.id === conceptId);
  if (!concept) return false;
  return concept.prerequisites.some(p => conceptHealth(world, p) < UNLOCK_THRESHOLD);
}

export function bars(world: ServerWorld, events: AnswerEvent[]): Bars {
  const xp = events.reduce((sum, e) => sum + (e.correct ? (e.kind === 'teach' ? 25 : 10) : 0), 0);
  const mastery = world.concepts.length === 0
    ? 0
    : world.concepts.reduce((sum, c) => sum + conceptHealth(world, c.id), 0) / world.concepts.length;
  const learned = world.trees.filter(t => t.spawnedFrom === null && t.leitnerBox >= 2);
  const retention = learned.length === 0 ? 0 : learned.filter(t => t.leitnerBox === 3).length / learned.length;
  return { xp, mastery, retention };
}
