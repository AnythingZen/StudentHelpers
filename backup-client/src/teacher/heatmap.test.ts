import { describe, it, expect } from 'vitest';
import { computeBounds, groveAt, healthColour, projector } from './heatmap';

describe('computeBounds', () => {
  it('wraps every point with padding', () => {
    expect(computeBounds([[0, -18], [14, -38], [-12, -60]], 10)).toEqual({ minX: -22, maxX: 24, minZ: -70, maxZ: -8 });
  });
  it('has a sensible default for an empty world that is still growing', () => {
    const b = computeBounds([]);
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxZ).toBeGreaterThan(b.minZ);
  });
});

describe('projector', () => {
  const b = { minX: -50, maxX: 50, minZ: -150, maxZ: 50 };
  const { toCanvas, scale } = projector(b, 400, 800);

  it('keeps the whole world inside the canvas, preserving aspect ratio', () => {
    for (const [x, z] of [[-50, -150], [50, 50], [0, 0]] as const) {
      const [px, py] = toCanvas(x, z);
      expect(px).toBeGreaterThanOrEqual(0); expect(px).toBeLessThanOrEqual(400);
      expect(py).toBeGreaterThanOrEqual(0); expect(py).toBeLessThanOrEqual(800);
    }
    expect(scale).toBe(4);
  });

  it('puts the entrance at the bottom and deeper groves higher up', () => {
    expect(toCanvas(0, 10)[1]).toBeGreaterThan(toCanvas(0, -100)[1]);
  });
});

describe('healthColour', () => {
  it('runs dead brown → amber → green and clamps out-of-range values', () => {
    expect(healthColour(0)).toBe('rgb(138, 90, 59)');
    expect(healthColour(0.5)).toBe('rgb(224, 164, 58)');
    expect(healthColour(1)).toBe('rgb(63, 154, 95)');
    expect(healthColour(-3)).toBe(healthColour(0));
    expect(healthColour(9)).toBe(healthColour(1));
    expect(healthColour(Number.NaN)).toBe(healthColour(0));
  });
});

describe('groveAt', () => {
  const identity = (x: number, z: number): [number, number] => [x, z];
  const groves = [
    { conceptId: 'a', centre: [0, 0] as [number, number], radius: 10, health: 0 },
    { conceptId: 'b', centre: [15, 0] as [number, number], radius: 10, health: 0 },
  ];
  it('finds the grove under the pointer, the nearest one where circles overlap', () => {
    expect(groveAt(groves, 1, 0, identity, 1)).toBe('a');
    expect(groveAt(groves, 9, 0, identity, 1)).toBe('b');
    expect(groveAt(groves, 0, 40, identity, 1)).toBeNull();
  });
});
