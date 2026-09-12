# THE CONTRACT — read this before you write a line

**Everyone reads this file. Nobody changes it without telling the other two in person.**

This is the one shared shape. All three segments parallelise off it. If it drifts,
you get three incompatible halves at 2:30 and the project dies.

---

## Project

**Mastery Grove** — a teacher drops in a PDF worksheet; it spawns a 3D forest of
questions. Students walk the forest. Wrong answers wither the tree and spawn a
sapling of the same concept further along the path. The teacher watches a live
misconception heatmap of the forest.

- **Track 3 · Learning Science in the Loop**
- **Desktop web only.** Keyboard + mouse. No touch, no mobile. It is a game.
- **7 hours, 3 builders.**

## Stack (versions verified — do not "upgrade" these mid-build)

| Package | Version | Who |
|---|---|---|
| `three` + `@types/three` | 0.186.0 | A |
| `vite` | 8.3.0 | A |
| `express` | 5.2.1 | C |
| `ai` | 7.0.99 | B |
| `@ai-sdk/anthropic` | 4.0.53 | B |
| `zod` | 4.6.2 | B, C |

TypeScript pinned `^5` (not 7 — the native rewrite is too new to debug on a clock).
Vitest pinned `^3` (not 5, same reason).

Import three.js addons as `three/addons/controls/PointerLockControls.js` —
verified present in the 0.186.0 exports map. Do not use `three/examples/jsm/...`.

Models: `claude-sonnet-5` with `effort: 'low'` for the hot path (diagnosis, grading).
`claude-opus-5` for world spawn and teacher intervention — runs once, wants quality.

---

## The world object

This is the whole data model. `mockWorld.json` at the repo root is a valid instance
of it — code against that from minute 15.

```ts
type Bloom     = 'remember' | 'understand' | 'apply';
type TreeState = 'healthy' | 'withered' | 'sapling' | 'regrown';
type TreeKind  = 'choice' | 'recall';

interface World {
  worldId: string;            // 4-char room code, e.g. "OAK7"
  subject: string;            // "Chemistry — Moles"
  status: 'growing' | 'ready' | 'failed';
  sourceDoc: { filename: string; pages: number };
  sessionIndex: number;       // 0 on spawn, +1 per /next-session
  concepts: Concept[];        // a concept === a grove
  misconceptions: Misconception[];
  trees: Tree[];
}

interface Concept {
  id: string;                 // "c1"
  name: string;               // "Molar mass"
  bloom: Bloom;
  prerequisites: string[];    // concept ids — THIS IS THE WORLD MODEL
  centre: [number, number, number];  // grove centre; set by A's layout fn
}

interface Misconception {
  id: string;                 // "m1"
  conceptId: string;
  label: string;              // "Confuses molar mass with molecular count"
}

interface Tree {
  id: string;                 // "t1"
  conceptId: string;
  pos: [number, number, number];     // set by A's layout fn
  kind: TreeKind;
  question: string;
  choices?: string[];         // kind === 'choice' only
  explanation: string;
  citation: { page: number; quote: string } | null;  // provenance from the PDF
  state: TreeState;
  leitnerBox: 1 | 2 | 3;
  spawnedFrom: string | null; // sapling → the tree id it respawned from
}
```

### Answers never reach the browser

`Tree` as sent to the client has **no answer field**. The server holds
`answerIndex` (choice) / `answerText` (recall) privately and grades in
`POST /api/answer`.

`mockWorld.json` *does* include `answerIndex` / `answerText` so Builder A can
develop offline. The real `GET /api/state` strips them. A: do not build UI that
depends on having the answer client-side.

---

## The four endpoints. That is the entire backend.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/world` | multipart: `pdf`, `subject` | `{ worldId }` immediately |
| `GET` | `/api/state/:worldId` | — | `{ status, world }` (answers stripped) |
| `POST` | `/api/answer` | `{ worldId, treeId, response }` | see below |
| `POST` | `/api/next-session/:worldId` | — | `{ world }` |
| `GET` | `/api/teacher/:worldId` | — | aggregate, see C's brief |

`POST /api/world` returns the room code **straight away** and generates in the
background. `status` goes `growing` → `ready` and `trees[]` grows as generation
streams. Clients poll `GET /api/state` every 2s — so the forest visibly plants
itself. No SSE, no websockets.

`response` in `/api/answer` is `number` (choice index) or `string` (recall text).

### `POST /api/answer` response

```ts
{
  correct: boolean;
  treeState: TreeState;              // new state of the answered tree
  misconceptionId: string | null;    // null when correct
  misconceptionLabel: string | null;
  scaffoldHint: string | null;       // a QUESTION, never the answer
  saplingId: string | null;          // new sapling spawned further up the path
  conceptHealth: number;             // 0..1 for the answered tree's concept
}
```

---

## Rules everyone implements the same way

**Concept health** = `(healthy + regrown) / total` over that concept's trees.

**Grove locking** — a concept is locked if any prerequisite's health < `0.6`.
Locked groves render dark and refuse the proximity trigger. This is the
mastery gate: you do not walk into Stoichiometry until Molar Mass is alive.

**Leitner, 3 boxes.** Box 1 = due this session. Box 2 = due next session.
Box 3 = retired. Correct → box + 1 (max 3). Wrong → back to box 1.

**The wither/sapling rule** — the core mechanic, get it identical on both sides:
1. Wrong answer → that tree `state = 'withered'`, `leitnerBox = 1`
2. Server spawns a sapling: same `conceptId`, new id, `spawnedFrom` = parent id,
   `state = 'sapling'`, positioned **further along the path** (A's layout picks
   the spot — roughly 90 seconds of walking ahead)
3. Correct on the sapling → parent becomes `'regrown'`, sapling → `'healthy'`
4. Wrong on the sapling → spawn one more, max 2 saplings per parent per session

**Next session** — `/api/next-session` increments `sessionIndex`, moves every
box-1 and box-2 tree to `'healthy'` but re-lays them out **near the entrance**,
and clears saplings. That is distributed practice, made spatial.

---

## Ownership — do not edit another builder's files

| Area | Owner |
|---|---|
| `client/` — scene, movement, rendering, question UI, layout fn | **A** |
| `server/brain/` — all AI calls, prompts, schemas, scheduler | **B** |
| `server/` — express app, state store, routes, teacher console | **C** |
| `docs/`, `mockWorld.json` | shared, announce changes |

`server/brain/index.ts` exports exactly these, and C only ever calls these:

```ts
spawnWorld(pdf: Buffer, subject: string, onPartial: (w: Partial<World>) => void): Promise<World>
diagnose(tree: Tree, response: string|number, world: World): Promise<Diagnosis>
gradeRecall(tree: Tree, text: string): Promise<{ correct: boolean; why: string }>
schedule(world: World, treeId: string, correct: boolean): World   // pure, Leitner
```

`schedule` is **pure and synchronous** — no API calls. That makes it the one
piece with real unit tests (see B's brief).

---

## Git

- `development` is the integration branch. Never commit to `main`.
- `feature/a-forest`, `feature/b-brain`, `feature/c-spine`.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`.
- Commit every meaningful piece, not at the end. Never commit `.env`.
- Merge to `development` at each integration checkpoint (2:30, 3:30, 5:00).

## Env

`ANTHROPIC_API_KEY` in `server/.env`, never committed. `.env.example` is committed.

---

## The cut list — say this out loud at minute 5

No auth. No accounts. No database. No multiplayer. No mobile. No touch. No
collision detection. No physics engine. No inventory. No NPC dialogue trees. No
avatars. No pets. No imported 3D models (hour-5 stretch only). One PDF. One
subject. One student at a time.

If someone starts building one of these, stop them.
