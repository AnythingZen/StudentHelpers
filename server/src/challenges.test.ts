import { describe, expect, it } from 'vitest';
import { addChallenges, gradeModel } from './challenges.js';
import { freshWorld, loadFixture } from './fallbackBrain.js';

const maths = () => ({ ...freshWorld(loadFixture('maths')), worldId: 'OAK7' });

describe('hands-on challenges', () => {
  it('adds a cake challenge to the first fractions grove and a bridge checkpoint to the next, clear of other trees', () => {
    const w = addChallenges(maths());
    const models = w.trees.filter(t => t.kind === 'model');
    expect(models.map(t => [t.conceptId, t.model!.shape])).toEqual([['c1', 'cake'], ['c2', 'bridge']]);
    for (const m of models) {
      const { parts, num, den } = m.model!;
      expect(m.answerIndex).toBe((parts * num) / den);
      for (const t of w.trees.filter(x => x.id !== m.id)) expect(Math.hypot(t.pos[0] - m.pos[0], t.pos[2] - m.pos[2])).toBeGreaterThanOrEqual(3);
    }
    expect(w.misconceptions.some(m => m.conceptId === 'c1' && /numerator/i.test(m.label))).toBe(true);
    expect(addChallenges(w).trees.length).toBe(w.trees.length);          // idempotent
  });

  it('leaves worlds that are not about fractions alone', () => {
    const reading = { ...freshWorld(loadFixture('reading')), worldId: 'FERN' };
    expect(addChallenges(reading).trees.some(t => t.kind === 'model')).toBe(false);
  });

  it('grades by count and names the classic mistake with a question back', () => {
    const cake = addChallenges(maths()).trees.find(t => t.model?.shape === 'cake')!;   // 2/3 of 6
    expect(gradeModel(cake, 4).correct).toBe(true);
    const numerator = gradeModel(cake, 2);
    expect(numerator).toMatchObject({ correct: false, misconceptionId: `${cake.id}-numerator` });
    expect(numerator.hint).toMatch(/\?$/);
    expect(gradeModel(cake, 3).misconceptionId).toBe(`${cake.id}-denominator`);
    expect(gradeModel(cake, 5).misconceptionId).toBe('unclassified');
  });
});
