import type { ServerWorld, Tree, World } from './contract.js';

// The ONLY place a world leaves the server. Answer keys stop here.
export function toClientWorld(world: ServerWorld): World<Tree> {
  return {
    ...world,
    trees: world.trees.map(({ answerIndex: _i, answerText: _t, ...tree }) => tree),
  };
}
