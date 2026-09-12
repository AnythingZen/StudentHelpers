// The seam between C's server and whatever generates content.
// Shaped like Builder B's exports so Zen's brain plugs straight in.

import type {
  Diagnosis, Explanation, ServerWorld, SpawnInput, Syllabus, TreeWithAnswer,
} from './contract.js';

export interface Brain {
  readonly name: string;
  spawnWorld(input: SpawnInput, syllabus: Syllabus, onPartial: (w: Partial<ServerWorld>) => void): Promise<ServerWorld>;
  diagnose(tree: TreeWithAnswer, response: string | number, world: ServerWorld): Promise<Diagnosis>;
  gradeRecall(tree: TreeWithAnswer, text: string): Promise<{ correct: boolean; why: string }>;
  gradeExplanation(tree: TreeWithAnswer, text: string): Promise<Explanation>;
  focusQuest(world: ServerWorld, misconceptionId: string): Promise<TreeWithAnswer[]>;
}

export class TimeoutError extends Error {}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

export interface FallbackOptions {
  spawnTimeoutMs: number;
  callTimeoutMs: number;
  log?: (msg: string) => void;
}

// Every call tries the primary brain; any throw or timeout silently uses the
// fallback for that call only. The student never sees an error screen — the
// server logs loudly instead. This is the backup, working per request.
export function withFallback(primary: Brain, fallback: Brain, opts: FallbackOptions): Brain {
  const log = opts.log ?? ((m: string) => console.error(m));
  const guard = async <T>(label: string, ms: number, a: () => Promise<T>, b: () => Promise<T>): Promise<T> => {
    try {
      return await withTimeout(a(), ms, `${primary.name}.${label}`);
    } catch (err) {
      log(`[brain] ${primary.name}.${label} failed (${(err as Error).message}) — using ${fallback.name}`);
      return b();
    }
  };
  return {
    name: `${primary.name}+${fallback.name}`,
    // Partial output from a primary that later fails is discarded by the caller
    // when the fallback's final world replaces it, so onPartial is safe to share.
    spawnWorld: (i, s, on) => guard('spawnWorld', opts.spawnTimeoutMs,
      () => primary.spawnWorld(i, s, on), () => fallback.spawnWorld(i, s, on)),
    diagnose: (t, r, w) => guard('diagnose', opts.callTimeoutMs,
      () => primary.diagnose(t, r, w), () => fallback.diagnose(t, r, w)),
    gradeRecall: (t, x) => guard('gradeRecall', opts.callTimeoutMs,
      () => primary.gradeRecall(t, x), () => fallback.gradeRecall(t, x)),
    gradeExplanation: (t, x) => guard('gradeExplanation', opts.callTimeoutMs,
      () => primary.gradeExplanation(t, x), () => fallback.gradeExplanation(t, x)),
    focusQuest: (w, m) => guard('focusQuest', opts.spawnTimeoutMs,
      () => primary.focusQuest(w, m), () => fallback.focusQuest(w, m)),
  };
}
