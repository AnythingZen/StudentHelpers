// Leitner scheduler + wither/sapling rule. Pure and synchronous — no API calls,
// no mutation. Semantics must stay identical to what A renders (CONTRACT.md).

import type { World, Tree } from '../../shared/types.js';

const MAX_SAPLINGS = 2;

// Saplings are excluded: one mistake must not knock 40% off a 4-tree bridge.
export function conceptHealth(world: World, conceptId: string): number {
  const trees = world.trees.filter(t => t.conceptId === conceptId && t.spawnedFrom === null);
  if (trees.length === 0) return 0;
  const alive = trees.filter(t => t.state === 'healthy' || t.state === 'regrown').length;
  return alive / trees.length;
}

export function schedule(world: World, treeId: string, correct: boolean): World {
  const trees = world.trees.map(t => ({ ...t }));
  const tree = trees.find(t => t.id === treeId);
  if (!tree) return world;

  if (correct) {
    tree.leitnerBox = Math.min(3, tree.leitnerBox + 1) as 1 | 2 | 3;
    tree.state = tree.state === 'withered' ? 'regrown' : 'healthy';
    // Correct on a sapling regrows its parent.
    const parent = tree.spawnedFrom && trees.find(t => t.id === tree.spawnedFrom);
    if (parent) parent.state = 'regrown';
    return { ...world, trees };
  }

  const wasRetired = tree.leitnerBox === 3;
  tree.state = 'withered';
  tree.leitnerBox = 1;

  // Saplings chain back to the original tree; the cap is per parent per session.
  // Session is baked into the id so a sapling can never collide with one from
  // an earlier session.
  const rootId = tree.spawnedFrom ?? tree.id;
  const existing = trees.filter(t => t.spawnedFrom === rootId).length;
  if (!wasRetired && existing < MAX_SAPLINGS) {
    trees.push({
      ...tree,
      id: `${rootId}-s${world.sessionIndex}-${existing + 1}`,
      pos: [0, 0, 0],            // A's layout fn places it further along the path
      state: 'sapling',
      leitnerBox: 1,
      spawnedFrom: rootId,
    });
  }
  return { ...world, trees };
}

// Distributed practice: review queue (box 1 + 2) comes back healthy near the
// entrance (A re-lays out), every sapling is cleared whatever state it reached,
// box 3 stays retired as-is.
export function nextSession(world: World): World {
  const trees = world.trees
    .filter(t => t.spawnedFrom === null)
    .map(t => (t.leitnerBox === 3 ? { ...t } : { ...t, state: 'healthy' as const }));
  return { ...world, sessionIndex: world.sessionIndex + 1, trees };
}
