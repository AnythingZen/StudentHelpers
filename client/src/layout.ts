import type { Bloom, Tree, World } from '../../shared/types';

const depth: Record<Bloom, number> = { remember: 0, understand: 1, apply: 2 };
const hash = (value: string) => [...value].reduce((n, char) => ((n << 5) - n + char.charCodeAt(0)) | 0, 7) >>> 0;

/** Pure, Node-safe spatial layout shared with the server. */
export function layout(world: World): World {
  const next = structuredClone(world);
  const baseLevel = Number.parseInt(next.syllabus.level.replace(/\D/g, ''), 10);
  const concepts = [...next.concepts].sort((a, b) => {
    const aAbove = Number.parseInt(a.level.replace(/\D/g, ''), 10) > baseLevel;
    const bAbove = Number.parseInt(b.level.replace(/\D/g, ''), 10) > baseLevel;
    return Number(aAbove) - Number(bAbove) || depth[a.bloom] - depth[b.bloom];
  });
  concepts.forEach((concept, index) => {
    const above = Number.parseInt(concept.level.replace(/\D/g, ''), 10) > baseLevel;
    concept.centre = [index % 2 ? 12 : -10, 0, -18 - index * 24 - (above ? 12 : 0)];
  });
  for (const tree of next.trees) {
    const concept = next.concepts.find((item) => item.id === tree.conceptId)!;
    const seed = hash(tree.id); const angle = (seed % 628) / 100; const radius = 3 + (seed % 500) / 250;
    tree.pos = [concept.centre[0] + Math.cos(angle) * radius, 0, concept.centre[2] + Math.sin(angle) * radius];
  }
  return next;
}

export function placeSapling(world: World, parentTreeId: string): [number, number, number] {
  const parent = world.trees.find((tree) => tree.id === parentTreeId);
  if (!parent) return [0, 0, -30];
  return [parent.pos[0] + 2, 0, parent.pos[2] - 18];
}
