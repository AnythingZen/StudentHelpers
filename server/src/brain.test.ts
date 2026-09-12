import { describe, it, expect } from 'vitest';
import { withFallback, withTimeout, TimeoutError, type Brain } from './brain.js';
import { createFallbackBrain, freshWorld, loadFixture } from './fallbackBrain.js';

const fallback = createFallbackBrain({ plantDelayMs: 0 });
const w = freshWorld(loadFixture('maths'));
const t1 = w.trees[0]!;

const fake = (over: Partial<Brain>): Brain => ({ ...fallback, name: 'zen', ...over });

describe('withTimeout', () => {
  it('rejects with TimeoutError when the promise is too slow', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'slow')).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('withFallback — the backup, per call', () => {
  const opts = (logs: string[]) => ({ spawnTimeoutMs: 50, callTimeoutMs: 50, log: (m: string) => logs.push(m) });

  it('uses the primary when it works', async () => {
    const primary = fake({ gradeRecall: async () => ({ correct: true, why: 'from zen' }) });
    const logs: string[] = [];
    const r = await withFallback(primary, fallback, opts(logs)).gradeRecall(t1, 'x');
    expect(r.why).toBe('from zen');
    expect(logs).toHaveLength(0);
  });

  it('uses the fallback when the primary throws, and says so in the log', async () => {
    const primary = fake({ diagnose: async () => { throw new Error('GLM 500'); } });
    const logs: string[] = [];
    const d = await withFallback(primary, fallback, opts(logs)).diagnose(t1, 1, w);
    expect(d.evidence).toContain('fallback');
    expect(logs[0]).toContain('GLM 500');
  });

  it('uses the fallback when the primary hangs past the timeout', async () => {
    const primary = fake({ spawnWorld: () => new Promise(() => {}) });
    const logs: string[] = [];
    const world = await withFallback(primary, fallback, opts(logs))
      .spawnWorld({ kind: 'prompt' }, w.syllabus, () => {});
    expect(world.trees.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('timed out');
  });
});
