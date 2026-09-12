# Review — `feature/b-brain` @ `c348b5b` (Zen)

Reviewed by checking out the branch in isolation, running the tests, type-checking,
and reproducing edge cases the tests don't cover. **Nothing on `feature/b-brain`
was edited** — these are Zen's files, so the fixes are Zen's to make.

## Summary

Solid foundation. **10/10 tests pass, `tsc --noEmit` is clean**, and `schedule`
is genuinely pure and non-mutating. Two deviations from the contract are **good
calls and are accepted** into `CONTRACT.md`. But there are **five verified
problems**, two of which would break demo beats and one of which would break the
deploy build.

| # | Finding | Severity | Owner |
|---|---|---|---|
| 1 | `Buffer` in `shared/types.ts` breaks A's `tsc && vite build` | **High** — fails at deploy, invisible in `vite dev` | Zen |
| 2 | Duplicate sapling IDs across sessions | **High** — `find(id)` updates the wrong tree | Zen |
| 3 | No sapling spawns in session 2 | **High** — kills the Memory Quest / spacing beat | Zen |
| 4 | Retrying a withered tree → `'healthy'`, not `'regrown'` | Medium — regrow animation never plays (demo 1:08) | contract gap, now resolved |
| 5 | One wrong answer drops a 4-tree concept to 0.60 health | Medium — bridges lose ~40% of planks per mistake | contract gap, now resolved |

## Accepted deviations — good calls

- **`SpawnInput` as the first argument to `spawnWorld`.** The old contract
  signature `spawnWorld(pdf: Buffer, …)` could not carry a URL or pasted text.
  Correct, necessary, and flagged clearly in the commit message. `CONTRACT.md`
  now matches.
- **`server/brain/` as its own npm package.** Better than the contract's plan —
  it means `server/package.json` stays single-owner. **C: your server's install
  and deploy must also run `npm ci --prefix server/brain`,** or `ai` won't
  resolve at runtime.
- `TreeWithAnswer` for server-only answer keys is a clean way to keep answers
  out of the browser type.

---

## 1. `Buffer` in shared types breaks the client build

`shared/types.ts:26` — `{ kind: 'pdf'; filename: string; data: Buffer }`.

Roshan's client imports `shared/types.ts`. The real `vanilla-ts` template builds
with `tsc && vite build` and its tsconfig loads only `"types": ["vite/client"]`.
Reproduced in a fresh scaffold:

```
src/probe/types.ts(26,47): error TS2591: Cannot find name 'Buffer'.
```

`vite dev` strips types without checking, so this works fine all day locally
and **fails the first time anyone runs a production build — at deploy.**

**Fix:** `data: Uint8Array`. Node's `Buffer` is a subclass of `Uint8Array`, so B
still passes a `Buffer` with no other changes.

## 2 + 3. Sapling cap isn't session-scoped, and `nextSession` misses repaired saplings

Root cause, `schedule.ts:34-35` and `:52-54`:
- The cap counts **every** tree with `spawnedFrom === rootId`, across all sessions.
- `nextSession` removes only trees whose `state === 'sapling'`. A sapling that was
  answered becomes `'healthy'` or `'withered'` and **survives forever**.

Reproduced:

```
DUPLICATE IDS -> t4:withered  t4-s2:healthy  t4-s2:sapling
SESSION-2     -> no sapling spawned   (t4-s1:healthy  t4-s2:healthy already count as 2)
```

Sequence for the duplicate: wrong on `t4` → `t4-s1`; wrong on `t4` again →
`t4-s2`; repair via `t4-s2`; `nextSession` clears `t4-s1` but keeps `t4-s2`;
session-2 wrong on `t4` → `existing = 1` → new id `t4-s2` again.

Your existing test *"box 1 + 2 → healthy, saplings cleared"* only covers
saplings still in `'sapling'` state, which is why this slipped through.

**Fix:**
- `nextSession` removes **every** tree with `spawnedFrom !== null`, whatever its state.
- IDs include the session so they can never collide:
  `` `${rootId}-s${world.sessionIndex}-${n}` ``.
- The cap then naturally counts only this session's saplings.

## 4. Retrying a withered tree should regrow it — contract resolved

`schedule.ts:22` sets `state = 'healthy'` on every correct answer. The demo's
repair beat is retrying the *same* withered tree, and A only plays the regrow
animation on `'regrown'`.

This was a genuine gap in the contract, not a mistake. **Resolved:** a correct
answer on a `withered` tree → `'regrown'`. Correct on `healthy` stays `'healthy'`.

## 5. Saplings in the health denominator — contract resolved

```
HEALTH AFTER ONE WRONG (4 trees) -> 0.60   (would be 0.75 without the sapling)
```

You implemented the contract literally — `(healthy + regrown) / total` — and the
contract was wrong. With bridges now built from health, one mistake knocking out
40% of a bridge reads as broken, and 0.60 is exactly the lock threshold.

**Resolved:** concept health **excludes saplings** (`spawnedFrom !== null`) from
both numerator and denominator. Your existing health test has no saplings in it,
so it passes unchanged.

---

## The contract moved after you started — not your fault

You built against `d47638e`. These landed later and need adding to
`shared/types.ts` — announce the change out loud, since it's frozen:

- `Concept.questName: string`
- presence: `{ playerId, name, pos, yaw, seeded }`
- the client event bus `GameEvent` union (A ↔ C seam)
- `spawnWorld`'s encouragement text is now Mia's dialogue

## Verified fix — four lines

Checked red → green in an isolated checkout of `c348b5b`, not just reasoned about:

- the five tests below **all fail** on `c348b5b`
- with this diff applied, **all 15 pass — your original 10 unchanged** — and
  `tsc --noEmit` is still clean

```diff
 export function conceptHealth(world: World, conceptId: string): number {
-  const trees = world.trees.filter(t => t.conceptId === conceptId);
+  const trees = world.trees.filter(t => t.conceptId === conceptId && t.spawnedFrom === null);

   if (correct) {
     tree.leitnerBox = Math.min(3, tree.leitnerBox + 1) as 1 | 2 | 3;
-    tree.state = 'healthy';
+    tree.state = tree.state === 'withered' ? 'regrown' : 'healthy';

-      id: `${rootId}-s${existing + 1}`,
+      id: `${rootId}-s${world.sessionIndex}-${existing + 1}`,

   const trees = world.trees
-    .filter(t => t.state !== 'sapling')
+    .filter(t => t.spawnedFrom === null)
```

Plus the separate one-word type fix for finding 1: `data: Buffer` → `data: Uint8Array`
in `shared/types.ts`.

## Paste-ready tests for `__tests__/schedule.test.ts`

Self-contained — they don't depend on your existing helpers.

```ts
import { describe, it, expect } from 'vitest';
import { schedule, nextSession, conceptHealth } from '../schedule.js';
import type { World, Tree } from '../../../shared/types.js';

const mk = (id: string, over: Partial<Tree> = {}): Tree => ({
  id, conceptId: 'c1', pos: [0, 0, 0], kind: 'choice', question: 'q',
  choices: ['a', 'b'], explanation: 'e', citation: null, state: 'healthy',
  leitnerBox: 1, spawnedFrom: null, ...over,
});
const mkWorld = (trees: Tree[]): World => ({
  worldId: 'T', subject: 's', status: 'ready', sessionIndex: 0,
  syllabus: { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' },
  source: { kind: 'prompt', text: 'x' }, concepts: [], misconceptions: [], trees,
});

describe('review fixes — c348b5b', () => {
  it('sapling ids never collide across sessions', () => {
    let w = mkWorld([mk('t4')]);
    w = schedule(w, 't4', false);
    w = schedule(w, 't4', false);
    const second = w.trees.find(t => t.spawnedFrom === 't4' && t.id !== w.trees[1].id)!;
    w = schedule(w, second.id, true);
    w = nextSession(w);
    w = schedule(w, 't4', false);
    const ids = w.trees.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nextSession clears every sapling, answered or not', () => {
    let w = mkWorld([mk('t4')]);
    w = schedule(w, 't4', false);
    const sap = w.trees.find(t => t.spawnedFrom === 't4')!;
    w = schedule(w, sap.id, true);           // repaired -> no longer 'sapling' state
    w = nextSession(w);
    expect(w.trees.filter(t => t.spawnedFrom !== null)).toHaveLength(0);
  });

  it('a new session can spawn saplings again', () => {
    let w = mkWorld([mk('t4')]);
    w = schedule(w, 't4', false);
    const s1 = w.trees.find(t => t.spawnedFrom === 't4')!;
    w = schedule(w, s1.id, false);
    const s2 = w.trees.find(t => t.spawnedFrom === 't4' && t.id !== s1.id)!;
    w = schedule(w, s2.id, true);
    w = nextSession(w);
    const before = w.trees.length;
    w = schedule(w, 't4', false);
    expect(w.trees.length).toBe(before + 1);
  });

  it('correct on a withered tree regrows it', () => {
    let w = mkWorld([mk('t4')]);
    w = schedule(w, 't4', false);
    w = schedule(w, 't4', true);
    expect(w.trees.find(t => t.id === 't4')!.state).toBe('regrown');
  });

  it('concept health excludes saplings', () => {
    let w = mkWorld([mk('a'), mk('b'), mk('c'), mk('d')]);
    w = schedule(w, 'a', false);
    expect(conceptHealth(w, 'c1')).toBeCloseTo(0.75);
  });
});
```
