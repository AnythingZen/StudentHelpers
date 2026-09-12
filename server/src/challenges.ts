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

// A clear spot in the grove, on the path side so the student walks past it.
function spotNear(world: ServerWorld, trees: TreeWithAnswer[], centre: Vec3): Vec3 {
  const toPath = centre[0] > 0 ? -1 : 1;
  const offsets: Array<[number, number]> = [[5, 3], [5, -1], [6, 6], [3, 7], [7, 1], [2, -6], [8, -4], [-5, 3], [-6, -3]];
  const candidates = offsets.map(([dx, dz]) => [centre[0] + dx * toPath, 0, centre[2] + dz] as Vec3);
  return candidates.find(c => trees.every(t => distance(c, t.pos) >= 3.2)) ?? candidates[0]!;
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
      id, conceptId: grove.id, kind: 'model', pos: spotNear(world, trees, grove.centre),
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
