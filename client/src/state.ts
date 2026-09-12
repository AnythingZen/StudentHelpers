import type { Concept, Tree, World } from '../../shared/types';

export function isLocked(world: World, concept: Concept) {
  return concept.prerequisites.some((id) => conceptHealth(world, id) < 0.6);
}

export function conceptHealth(world: World, conceptId: string) {
  const trees = world.trees.filter((tree) => tree.conceptId === conceptId);
  if (!trees.length) return 0;
  return trees.filter((tree) => tree.state === 'healthy' || tree.state === 'regrown').length / trees.length;
}

export function byId(world: World, treeId: string): Tree | undefined {
  return world.trees.find((tree) => tree.id === treeId);
}
