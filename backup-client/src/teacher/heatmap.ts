// Pure maths for the teacher's top-down forest map: fit the world to the canvas,
// colour groves by health, and find which grove the pointer is over.

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Grove { conceptId: string; centre: [number, number]; radius: number; health: number }

export function computeBounds(points: Array<[number, number]>, pad = 12): Bounds {
  if (points.length === 0) return { minX: -30, maxX: 30, minZ: -120, maxZ: 15 };
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad };
}

/**
 * World (x, z) → canvas pixels, preserving aspect ratio. The entrance (largest z)
 * sits at the bottom and the deepest grove at the top, like walking up the page.
 */
export function projector(b: Bounds, width: number, height: number) {
  const scale = Math.min(width / (b.maxX - b.minX), height / (b.maxZ - b.minZ));
  const offX = (width - (b.maxX - b.minX) * scale) / 2;
  const offY = (height - (b.maxZ - b.minZ) * scale) / 2;
  return {
    scale,
    toCanvas: (x: number, z: number): [number, number] => [offX + (x - b.minX) * scale, offY + (z - b.minZ) * scale],
  };
}

const DEAD: [number, number, number] = [138, 90, 59];
const AMBER: [number, number, number] = [224, 164, 58];
const ALIVE: [number, number, number] = [63, 154, 95];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t));

/** 0 → dead brown, 0.5 → amber, 1 → green. Clamped. */
export function healthColour(health: number): string {
  const h = Math.max(0, Math.min(1, Number.isFinite(health) ? health : 0));
  const [r, g, b] = h < 0.5 ? mix(DEAD, AMBER, h / 0.5) : mix(AMBER, ALIVE, (h - 0.5) / 0.5);
  return `rgb(${r}, ${g}, ${b})`;
}

/** The grove under the pointer, preferring the nearest centre when circles overlap. */
export function groveAt(groves: Grove[], px: number, py: number, toCanvas: (x: number, z: number) => [number, number], scale: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const g of groves) {
    const [cx, cy] = toCanvas(g.centre[0], g.centre[1]);
    const d = Math.hypot(px - cx, py - cy);
    if (d <= g.radius * scale && (!best || d < best.d)) best = { id: g.conceptId, d };
  }
  return best?.id ?? null;
}
