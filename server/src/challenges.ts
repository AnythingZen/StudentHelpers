// Hands-on challenges: build a fraction out of real objects instead of picking an
// option. A cake to cut and serve in the first fractions grove, a bridge to lay in
// the next — the checkpoint before the path goes on. Generated and graded here,
// deterministically: the answer is a count, so grading is instant and needs no AI.

import type { Misconception, ServerWorld, TreeWithAnswer } from './contract.js';
import { distance, type Vec3 } from './layout.js';
import { orderedConcepts } from './progress.js';

const FRACTIONS = /fraction/i;
const SPECS = [
  { shape: 'cake', parts: 6, num: 2, den: 3 },
  { shape: 'bridge', parts: 8, num: 3, den: 4 },
] as const;

const isAboutFractions = (w: ServerWorld) =>
  FRACTIONS.test(`${w.syllabus.topic} ${w.subject}`) || w.concepts.some(c => FRACTIONS.test(`${c.name} ${c.questName}`));

// A clear spot beside the grove: far enough from every tree that the answer stones
// rising in front of a tree (up to ~5 units out) never overlap the prop, off the path,
// clear of the bridges, and as close to the grove as that allows.
function spotNear(world: ServerWorld, trees: TreeWithAnswer[], centre: Vec3, shape: 'cake' | 'bridge'): Vec3 {
  const gap = shape === 'cake' ? 7 : 8.5;
  const bridges = world.concepts.filter(c => c.prerequisites.length > 0).map(c => [c.centre[0], c.centre[2] + 11] as const);
  let best: Vec3 | null = null, bestScore = Infinity;
  for (const r of [7, 8.5, 10, 11.5, 13]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c: Vec3 = [centre[0] + Math.cos(a) * r, 0, centre[2] + Math.sin(a) * r];
      if (Math.abs(c[0]) < (shape === 'cake' ? 5 : 7) || Math.abs(c[0]) > 28) continue;       // off the path, inside the clearing
      if (bridges.some(([bx, bz]) => Math.abs(c[0] - bx) < 8 && Math.abs(c[2] - bz) < 6)) continue;
      if (!trees.every(t => distance(c, t.pos) >= gap)) continue;
      const score = r + Math.abs(c[0]) * 0.15;
      if (score < bestScore) { best = c; bestScore = score; }
    }
  }
  return best ?? [centre[0] + (centre[0] >= 0 ? 14 : -14), 0, centre[2]];
}

export function addChallenges(world: ServerWorld): ServerWorld {
  if (!isAboutFractions(world) || world.trees.some(t => t.kind === 'model')) return world;
  const groves = orderedConcepts(world).slice(0, SPECS.length);
  const trees = [...world.trees];
  const misconceptions: Misconception[] = [...world.misconceptions];
  groves.forEach((grove, i) => {
    const { shape, parts, num, den } = SPECS[i]!;
    const id = `${grove.id}-${shape}`;
    const answer = (parts * num) / den;
    const thing = shape === 'cake' ? 'slices' : 'planks';
    trees.push({
      id, conceptId: grove.id, kind: 'model', pos: spotNear(world, trees, grove.centre, shape),
      question: shape === 'cake'
        ? `Serve ${num}/${den} of the cake. It is cut into ${parts} equal slices.`
        : `Lay ${num}/${den} of the bridge. It needs ${parts} equal planks.`,
      explanation: `${parts} ${thing} split into ${den} equal groups is ${parts / den} each, so ${num}/${den} is ${num} × ${parts / den} = ${answer} ${thing}.`,
      citation: null, state: 'healthy', leitnerBox: 1, spawnedFrom: null,
      model: { shape, parts, num, den }, answerIndex: answer,
    });
    misconceptions.push(
      { id: `${id}-numerator`, conceptId: grove.id, label: `Counts the top number as pieces — takes ${num} ${thing} for ${num}/${den} of ${parts}` } as Misconception,
      { id: `${id}-denominator`, conceptId: grove.id, label: `Counts the bottom number as pieces — takes ${den} ${thing} for ${num}/${den} of ${parts}` } as Misconception,
    );
  });
  return { ...world, trees, misconceptions };
}

/** Grade a hands-on answer: the number of pieces the student chose. */
export function gradeModel(tree: TreeWithAnswer, count: number): { correct: boolean; misconceptionId: string | null; hint: string | null } {
  const m = tree.model!;
  const thing = m.shape === 'cake' ? 'slices' : 'planks';
  if (count === tree.answerIndex) return { correct: true, misconceptionId: null, hint: null };
  const each = m.parts / m.den;
  const hint = `There are ${m.parts} ${thing} in ${m.den} equal groups. How many ${thing} make 1/${m.den}? So how many make ${m.num}/${m.den}?`;
  if (count === m.num) return { correct: false, misconceptionId: `${tree.id}-numerator`, hint };
  if (count === m.den) return { correct: false, misconceptionId: `${tree.id}-denominator`, hint };
  return { correct: false, misconceptionId: 'unclassified', hint: count > (tree.answerIndex ?? 0) ? `That's more than ${m.num}/${m.den}. If 1/${m.den} is ${each} ${thing}, how many is ${m.num}/${m.den}?` : hint };
}
