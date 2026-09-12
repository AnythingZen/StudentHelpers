import * as THREE from 'three';
import type { Tree, World } from '../../shared/types';
import { isLocked } from './state';

export function closestTree(world: World, position: THREE.Vector3): Tree | null {
  let nearest: Tree | null = null; let distance = 3;
  for (const tree of world.trees) {
    const concept = world.concepts.find((item) => item.id === tree.conceptId)!;
    if (isLocked(world, concept)) continue;
    const d = position.distanceTo(new THREE.Vector3(...tree.pos));
    if (d < distance) { distance = d; nearest = tree; }
  }
  return nearest;
}
