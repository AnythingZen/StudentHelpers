// Server-side positioning for trees the server creates after spawn: saplings,
// the next-session review queue, and Deploy Quest trees. The path runs down -Z
// from the entrance; the player spawns at [0, 0, 10].

import type { ServerWorld, TreeWithAnswer } from './contract.js';

type Vec3 = [number, number, number];
const ENTRANCE_Z = -2;
const SAPLING_AHEAD = 12;     // roughly 90 seconds of walking further up the path

const withPos = (w: ServerWorld, pos: Map<string, Vec3>): ServerWorld => ({
  ...w,
  trees: w.trees.map(t => (pos.has(t.id) ? { ...t, pos: pos.get(t.id)! } : t)),
});

// An arc of slots across the path near the entrance, left and right alternately.
function entranceArc(count: number, z = ENTRANCE_Z): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;   // mirrored pairs: +2.5, -2.5, +5.5, -5.5 …
    const step = Math.floor(i / 2);
    return [side * (2.5 + step * 3), 0, z - step * 1.5] as Vec3;
  });
}

export function placeSapling(world: ServerWorld, saplingId: string): ServerWorld {
  const sap = world.trees.find(t => t.id === saplingId);
  const parent = sap?.spawnedFrom ? world.trees.find(t => t.id === sap.spawnedFrom) : undefined;
  if (!sap || !parent) return world;
  const n = world.trees.filter(t => t.spawnedFrom === parent.id).indexOf(sap);
  const side = n % 2 === 0 ? 3 : -3;
  return withPos(world, new Map([[saplingId, [parent.pos[0] + side, 0, parent.pos[2] - SAPLING_AHEAD]]]));
}

// Trees answered last session and not yet retired come back to the entrance as
// the Memory Quest. Untouched trees stay in their groves — they aren't reviews.
export function layoutReviews(world: ServerWorld, reviewIds: Set<string>): ServerWorld {
  const reviews = world.trees.filter(t => reviewIds.has(t.id) && t.leitnerBox < 3 && t.spawnedFrom === null);
  const slots = entranceArc(reviews.length);
  return withPos(world, new Map(reviews.map((t, i) => [t.id, slots[i]!])));
}

export function placeNewTrees(world: ServerWorld, ids: string[]): ServerWorld {
  const slots = entranceArc(ids.length, ENTRANCE_Z - 4);
  return withPos(world, new Map(ids.map((id, i) => [id, slots[i]!])));
}

export const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export type { Vec3, TreeWithAnswer };

// A world from a real model arrives with no positions ([0,0,0] everywhere).
// Give it a walkable layout: groves down the path in Bloom order (remember at the
// entrance, apply deepest), level-ladder concepts last, trees in a ring per grove.
const zero = (v: Vec3) => v[0] === 0 && v[1] === 0 && v[2] === 0;
const BLOOM_DEPTH = { remember: 0, understand: 1, apply: 2 } as const;

export function ensureLayout(world: ServerWorld): ServerWorld {
  const needsGroves = world.concepts.length > 0 && world.concepts.every(c => zero(c.centre));
  const concepts = needsGroves
    ? [...world.concepts]
        .sort((a, b) =>
          Number(a.level !== world.syllabus.level) - Number(b.level !== world.syllabus.level) ||
          BLOOM_DEPTH[a.bloom] - BLOOM_DEPTH[b.bloom])
        .map((c, i) => ({ ...c, centre: [i % 2 === 0 ? 10 : -10, 0, -18 - i * 22] as Vec3 }))
    : world.concepts;
  const centreOf = new Map(concepts.map(c => [c.id, c.centre]));
  const ringIndex = new Map<string, number>();
  const trees = world.trees.map(t => {
    if (!zero(t.pos)) return t;
    const i = ringIndex.get(t.conceptId) ?? 0;
    ringIndex.set(t.conceptId, i + 1);
    const c = centreOf.get(t.conceptId) ?? [0, 0, -18];
    const a = i * 2.4; // golden-angle-ish spread so trees don't line up
    return { ...t, pos: [c[0] + Math.cos(a) * (3 + i * 0.6), 0, c[2] + Math.sin(a) * (3 + i * 0.6)] as Vec3 };
  });
  return { ...world, concepts: world.concepts.map(c => concepts.find(x => x.id === c.id)!), trees };
}
