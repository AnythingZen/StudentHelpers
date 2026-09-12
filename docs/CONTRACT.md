# THE CONTRACT — read this before you write a line

**Everyone reads this file. Nobody changes it without telling the other two in person.**

This is the one shared shape. All three segments parallelise off it. If it drifts,
you get three incompatible halves at 2:30 and the project dies.

---

## Project

**Mastery Grove** — pick a syllabus, level and topic, drop in a PDF worksheet, and
it spawns a 3D forest of questions from that document. Students walk the forest.
Wrong answers wither the tree and spawn a sapling of the same concept further
along the path. Master a level and the next level's grove unlocks. The teacher
watches a live misconception heatmap of the forest.

- **Track 3 · Learning Science in the Loop**
- **Desktop web only.** Keyboard + mouse. No touch, no mobile. It is a game.
- **7 hours, 3 builders.**

## The syllabus anchor

The demo is anchored to **MOE Singapore · Primary 5 · Mathematics · Fractions.**

This is a deliberate scoping decision, not a limitation. A named national
syllabus is publicly documented and defensible — nobody can argue with whether
our content is "right." US standards vary district by district with no clean
published spec, so we don't go near them today.

The pitch line is: *"Imagine any syllabus. We've loaded this one."* The syllabus
is a **container** — the platform story. Say it in the pitch; **do not build it.**
One syllabus JSON, one subject, one level ladder, one topic. If someone starts
writing a syllabus abstraction layer at hour 2, stop them.

Fractions specifically, because the misconception literature there is the
best-documented of any school topic (whole-number bias: comparing numerators,
adding denominators). That is what feeds the Track 3 diagnosis story.

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
type TreeKind  = 'choice' | 'recall' | 'teach';

interface Syllabus {
  system: 'MOE-SG';           // one system today. Do not generalise this.
  level: string;              // "Primary 5" — the dial, see the level ladder below
  subject: string;            // "Mathematics"
  topic: string;              // "Fractions"
}

// Where the world's content came from. Ingestion is DECOUPLED from world
// generation: everything downstream of the spawn call is identical for all four.
type Source =
  | { kind: 'pdf';    filename: string; pages: number }   // hero path, has provenance
  | { kind: 'text';   label: string; chars: number }      // pasted lesson content
  | { kind: 'prompt'; text: string }                      // topic only, no provenance
  | { kind: 'url';    url: string; title: string };       // STRETCH — see B's brief

interface World {
  worldId: string;            // 4-char room code, e.g. "OAK7"
  syllabus: Syllabus;
  subject: string;            // display string, "Primary 5 Mathematics — Fractions"
  source: Source;
  sessionIndex: number;       // 0 on spawn, +1 per /next-session
  concepts: Concept[];        // a concept === a grove
  misconceptions: Misconception[];
  trees: Tree[];
}

interface Concept {
  id: string;                 // "c1"
  name: string;               // "Comparing and ordering unlike fractions"
  bloom: Bloom;
  syllabusRef: string;        // "P5 · Fractions · Comparing fractions with unlike denominators"
  level: string;              // "Primary 5" — may be ABOVE the world's level (see ladder)
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
  rubric?: string[];          // kind === 'teach' only — points the explanation must hit
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
Locked groves render dark and refuse the proximity trigger. This is the mastery
gate: you do not walk into adding unlike fractions until comparing them is alive.

**The level ladder** — one concept in the world sits at the level *above* the
world's own (`concept.level === 'Primary 6'` in a Primary 5 world). It is the
deepest grove, locked behind every P5 concept, and clearing it fires a
**LEVEL UP** — "Primary 6 Fractions unlocked."

This is one extra concept from the spawn call and one banner. It costs almost
nothing because the prerequisite DAG already gates it, and it buys the strongest
thing in the pitch: a student climbing *above* their own grade under their own
steam. A parent seeing "your Primary 3 child is clearing Primary 5 fractions" is
the moment the product sells itself.

**The game is the product; the syllabus is a label on it.** Do not spend build
time on syllabus breadth.

**Teach trees** (`kind: 'teach'`) — the highest-value mechanic and the only one
that is visibly not a quiz. A teach tree only appears on a **sapling** the
student has already recovered: it asks them to explain the concept in their own
words *so the sapling can grow*. B grades the explanation against
`tree.rubric[]` — does it actually address the misconception they had?

This is learning by teaching (the protégé effect), and it is the deepest thing
in the build. Schema goes in at minute 10; **grading is implemented at 4:30,
after the main loop closes.** Droppable without damage if you are behind.

**One world type. Always a forest.** Do not build a second biome or a second
game type. The forest metaphor carries all four mechanics — wither is
forgetting, saplings are spacing, forest health is mastery, dead patches are the
heatmap — and a second world type would need its own coherent metaphor for all
of them, plus double the work in A's segment, which is the riskiest.

What you *do* get is a **skin**, keyed off `syllabus.subject`, as a lookup table
of constants — ground and foliage palette, fog colour and density, ambient
track, trunk/canopy silhouette. Same geometry, same code. Roughly 15 minutes,
and it reads as a different world in three seconds.

| Subject | Skin |
|---|---|
| Mathematics | cool birch — pale trunks, blue-grey fog, crisp |
| English | warm autumn oak — amber canopy, golden haze |

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

### Conflict-free by construction

The split is designed so three people almost never touch the same file. Do not
rely on discipline for this — rely on the layout:

- **Three separate npm projects**: `client/package.json` (A) and
  `server/package.json` (C). Separate lockfiles mean A's installs can never
  conflict with B's or C's. There is **no root `package.json`.**
- **B does not edit `server/package.json`.** B tells C what to install; C runs it.
  That is the only shared manifest and it has exactly one owner.
- **`shared/types.ts`** holds the interfaces in this document. Whoever finishes
  reading the contract first writes it at minute 10, commits it, and then it is
  **frozen**. Changing it requires saying so out loud to both other builders.
  All three import from it; nobody edits it alone.
- **`mockWorld.json` is frozen after minute 15.** If it needs a field, the person
  who needs it announces the change before making it.
- **Fixed merge order at each checkpoint: A, then B, then C.** C merges last
  because C integrates. One person merges at a time; no simultaneous merges.
- Each builder's checkpoint work stays on their own feature branch until the
  checkpoint. No cross-branch cherry-picking.

If you find yourself resolving a conflict in someone else's file, stop and ask
them — it means an ownership line got crossed, and a conflict is the symptom
rather than the problem.

`server/brain/index.ts` exports exactly these, and C only ever calls these:

```ts
spawnWorld(pdf: Buffer, syllabus: Syllabus, onPartial: (w: Partial<World>) => void): Promise<World>
diagnose(tree: Tree, response: string|number, world: World): Promise<Diagnosis>
gradeRecall(tree: Tree, text: string): Promise<{ correct: boolean; why: string }>
gradeExplanation(tree: Tree, text: string): Promise<Explanation>  // teach trees, 4:30
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

**No second syllabus system. No second subject. No syllabus abstraction layer.**
One `syllabus.json`, one level ladder, one topic. "Imagine any syllabus" is a
sentence you say, not a feature you build.

If someone starts building one of these, stop them.
