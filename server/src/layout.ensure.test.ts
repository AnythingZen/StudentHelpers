import { describe, it, expect } from 'vitest';
import { ensureLayout } from './layout.js';
import { freshWorld, loadFixture } from './fallbackBrain.js';

describe('ensureLayout', () => {
  it('leaves an already-positioned world alone', () => {
    const w = freshWorld(loadFixture('maths'));
    expect(ensureLayout(w)).toEqual(w);
  });

  it('lays out a model-generated world: groves down the path in Bloom order, level ladder last, no stacked trees', () => {
    const src = freshWorld(loadFixture('maths'));
    const w = ensureLayout({
      ...src,
      concepts: src.concepts.map(c => ({ ...c, centre: [0, 0, 0] as [number, number, number] })),
      trees: src.trees.map(t => ({ ...t, pos: [0, 0, 0] as [number, number, number] })),
    });
    const z = (id: string) => w.concepts.find(c => c.id === id)!.centre[2];
    expect(z('c1')).toBeGreaterThan(z('c3'));          // remember before apply
    expect(Math.min(...w.concepts.filter(c => c.id !== 'c5').map(c => c.centre[2]))).toBeGreaterThan(z('c5'));
    expect(new Set(w.trees.map(t => t.pos.join(','))).size).toBe(w.trees.length);
  });
});
