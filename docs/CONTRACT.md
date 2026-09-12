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

// What C hands to spawnWorld(). Accepted from Zen's review — the old signature
// spawnWorld(pdf: Buffer, ...) could not carry a URL or pasted text.
// Uint8Array, NOT Buffer: this file is imported by the browser client, and the
// vanilla-ts template's `tsc && vite build` has no Node types. Buffer is a
// Uint8Array subclass, so the server still passes a Buffer unchanged.
type SpawnInput =
  | { kind: 'pdf';    filename: string; data: Uint8Array }
  | { kind: 'url';    url: string }
  | { kind: 'text';   label: string; text: string }
  | { kind: 'prompt' };

// Where the world's content came from. Ingestion is DECOUPLED from world
// generation: everything downstream of the spawn call is identical for all four.
type Source =
  | { kind: 'pdf';    filename: string; pages: number }   // hero path, has provenance
  | { kind: 'text';   label: string; chars: number }      // pasted lesson content
  | { kind: 'prompt'; text: string }                      // topic only, no provenance
  | { kind: 'url';    url: string; title: string };       // reading world uses this; never Khan

interface World {
  worldId: string;            // 4-char room code, e.g. "OAK7"
  syllabus: Syllabus;
  subject: string;            // display string, "Primary 5 Mathematics — Fractions"
  source: Source;
  status: 'growing' | 'ready' | 'failed';   // polling flips growing -> ready
  sessionIndex: number;       // 0 on spawn, +1 per /next-session
  concepts: Concept[];        // a concept === a grove
  misconceptions: Misconception[];
  trees: Tree[];
}

interface Concept {
  id: string;                 // "c1"
  name: string;               // "Comparing and ordering unlike fractions"
  questName: string;          // "The Fraction Bridge" — B generates it at spawn
  bloom: Bloom;
  syllabusRef: string;        // "P5 · Fractions · Comparing fractions with unlike denominators"
  level: string;              // "Primary 5" — may be ABOVE the world's level (see ladder)
  prerequisites: string[];    // concept ids — THIS IS THE WORLD MODEL
  centre: [number, number, number];  // grove centre; set by A's layout fn
}

interface Misconception {
  id: string;                 // "m1"
  conceptId: string;
  label: string;              // "Compares fractions by numerator alone, so 5/8 > 3/4"
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

## The eight endpoints. That is the entire backend.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/world` | multipart: `system`, `level`, `subject`, `topic`, `sourceKind`, plus `pdf` **or** `url` **or** `text` | `{ worldId }` immediately |
| `GET` | `/api/state/:worldId` | — | `{ status, world, xp, mastery, retention }` (answers stripped) |
| `POST` | `/api/answer` | `{ worldId, treeId, response, confidence? }` | see below |
| `POST` | `/api/next-session/:worldId` | — | `{ world }` |
| `GET` | `/api/teacher/:worldId` | — | aggregate + Class World bar, see C's brief |
| `POST` | `/api/deploy-quest/:worldId` | `{ misconceptionId }` | `{ addedTreeIds }` — hour 5 |
| `POST` | `/api/presence/:worldId` | `{ playerId, name, pos, yaw }` | `{ ok }` — every 500ms |
| `GET` | `/api/presence/:worldId` | — | `{ players: [{ playerId, name, pos, yaw, seeded }] }` |

Presence is polled at **500ms**, separately from state at 2s, because positions
need to move smoothly and the payload is tiny. Clients **lerp** other players
toward their latest position. Seeded classmates are server-side entries in the
same list, marked `seeded: true`.

`sourceKind` is `'pdf' | 'url' | 'text' | 'prompt'`. For `prompt`, send none of
the three payload fields; the syllabus dropdowns are the whole input.

`POST /api/world` returns the room code **straight away** and generates in the
background. `status` goes `growing` → `ready` and `trees[]` grows as generation
streams. Clients poll `GET /api/state` every 2s — so the forest visibly plants
itself. No SSE, no websockets.

`response` in `/api/answer` is `number` (choice index) or `string` (recall or
explanation text). It also carries `confidence: 'low' | 'medium' | 'high'` from
the fox prompt — optional, omitted until the game layer lands at hour 5.

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
  xp: number;                        // see the game layer — grows fast, means least
  mastery: number;                   // 0..1, mean conceptHealth
  retention: number;                 // 0..1, share of trees in Leitner box 2 or 3
  calibration: 'overconfident' | 'underconfident' | 'calibrated' | null;
}
```

---

## Rules everyone implements the same way

**Concept health** = `(healthy + regrown) / total` over that concept's **base
trees only** — trees with `spawnedFrom === null`. Saplings never count, in either
the numerator or the denominator. (Counting them made one wrong answer on a
4-tree concept drop health 1.0 → 0.60, right at the lock threshold, and knock
out 40% of a bridge. See `docs/reviews/b-brain-c348b5b.md`.)

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
that is visibly not a quiz. A teach tree appears on a **sapling** of a concept
the student has already recovered, and **Mia, a seeded classmate, is standing at
it, stuck**. The student explains the concept to her. B grades the explanation
against `tree.rubric[]` — does it actually address the misconception? On a pass,
Mia's tree grows. See "Help a classmate" under *Interactive first*.

This is learning by teaching (the protégé effect), and it is the deepest thing
in the build. Schema goes in at minute 10; **grading is implemented at 4:30,
after the main loop closes.** Droppable without damage if you are behind.

## Interactive first — this is what the judges are scoring

The brief emphasises **interactive**, not just the learning. That changes the
priority order, not just the feature list.

**The problem with the earlier plan:** answering worked as walk to a tree →
press E → a 2D card covers the screen, pointer lock releases, **the game stops**
→ click → card closes. That is a quiz interrupting a game, on every question.
No amount of hour-5 polish fixes it, because it happens forty times per demo.

**The principle: the interaction IS the loop.** Answering is something the
avatar physically does. Gates are things you walk across. Other people are in
the forest with you. None of this is a separate "game layer" bolted on after —
it is how the core loop is built from the first pass.

### Core — not droppable, built in the loop window

**1. Answer stones — you answer by walking.** At a `choice` tree, press E: four
glowing stones rise out of the ground in an arc in front of the tree, each with
its answer floating above it (`CSS2DObject`). **Walk into one to answer.** A ring
fills over ~0.6s while you stand on it, so walking past a stone by accident
never submits. The game never stops, pointer lock never releases, the camera
never leaves the world.

**2. Bridges — the gate is a place.** Every locked grove sits across a gap with a
broken bridge. **One plank per unit of prerequisite health.** Correct answers
drop planks into place with a thunk; a withered tree knocks one loose. When the
bridge is whole, you walk across. This is the prerequisite DAG made physical,
and it is your original "the Fraction Bridge is unstable" idea, literally.
The level-ladder grove is simply the last bridge.

**3. Other people in the forest.** Other avatars walk the forest with you,
nameplates overhead. One list, two sources:
- **real players** — a second browser in the same room code posts its position
- **seeded classmates** — the server adds a few scripted ones on wander loops

The client renders one list and never knows which is which. On stage, open a
second browser window and a *real* second player appears. If that fails,
the seeded classmates are still there. Same code path either way.

**4. Help a classmate — teaching becomes social.** A `teach` tree is no longer a
text prompt. A seeded classmate — **Mia** — is standing at it, stuck: *"Mia is
stuck on the Fraction Bridge. Help her."* You explain; if it passes the rubric,
Mia's tree grows and she cheers. Same `gradeExplanation` call, same citation —
the protégé effect, now with an actual protégé in the world.

### What stays a pause, deliberately

`recall` and `teach` still need typing, and typing is a pause. That's fine: it is
the reflective moment, and it's pedagogically the right place to slow down. Make
it diegetic — the input sits in the NPC's or classmate's speech bubble, not a
modal over the screen.

### Fallbacks, same pattern as 3D → 2.5D

| If this isn't working by 3:30 | Fall back to |
|---|---|
| Answer stones | the overlay card (it's simpler, and it's already the recall/teach UI) |
| Real players | seeded classmates only |
| Plank-by-plank bridges | a bridge that is simply broken or whole |

---

## The game layer — this is a game, not a quiz with trees

The learning loop is the product, but the **feel** is what makes a judge want to
touch it. These are shared definitions so all three builders compute and name
the same things. Build order matters: see "what goes early" at the end.

### Avatar — third person. Decide this at minute 30, never later.

The student has a **visible blocky avatar** and the camera sits behind it.
This is the single strongest signal that this is a game and not a web form, and
it is the *only* item on this list that is expensive to retrofit, because it is a
camera and controls decision. Mouse-look stays on `PointerLockControls`; the
avatar mesh rides the controls position and the camera pulls back along the look
vector. Blocky humanoid from primitives — box torso, box head, cylinder limbs,
a walk bob. No rig, no animation library, no imported model.

### NPCs — the tutor is a character standing in the grove

The scaffold hint is not delivered by a tree and not by a chat box. **Professor
Byte** is a blocky NPC with a nameplate who stands in the grove and speaks in a
world-space bubble. Same text, same API response — it just comes out of a
character's mouth. That is what makes the AI visible as an agent.

Each grove gets one NPC. They idle and turn to face you. **When a tree withers,
Professor Byte walks over to you** and speaks — then stays in that grove, never
trailing you around the map. No dialogue trees, no branching conversation, no
voice.

### The companion — one pet, and it has a real job

**One** companion, a fox, that trots near the avatar. Before you answer any tree,
it asks: **"How sure are you?"** — three buttons, low / medium / high. That is
confidence rating, and comparing stated confidence against correctness is
**metacognitive calibration**, a real Track 3 mechanic with real literature
behind it.

One pet with a job beats four pets with cosmetics. Do not build owls, turtles or
octopuses.

### The three bars — the whole point of the pitch

```ts
xp        = 10 * correctAnswers + 25 * teachPassed        // grows fast, means little
mastery   = mean(conceptHealth) across the world           // 0..1, the real thing
retention = share of trees in Leitner box 2 or 3           // 0..1, a PROXY
```

Show all three in the HUD, stacked, with **XP visibly the least important**.
"The game rewards the second bar" is the line, so the UI has to earn it —
mastery and retention get the bright colour, XP gets grey.

**Retention is a proxy**, not a memory model. Say so if a judge asks; do not
imply it is FSRS. (`ts-fsrs` would give a real retrievability number and is a
stretch, not a promise.)

### Quest framing — free, and it changes everything

Pure copy, zero code. Never show "Question 4 of 27".

| Instead of | Say |
|---|---|
| Entering a grove | **Quest accepted: the Fraction Bridge** |
| A withered tree | **⚠️ The Fraction Bridge is unstable** |
| Answering again | **🔨 Bridge Repair +1** |
| Concept mastered | **🏆 FRACTION MASTER — bridge repaired** |
| Next session review | **⚔️ Memory Quest available** |
| Level ladder opening | **🏰 NEW AREA UNLOCKED** |

### Class World — a shared goal, never a leaderboard

A ranked list demotivates everyone below the top three. Instead, one shared bar:

> 🏰 **The class is unlocking the Castle Library** — 81%
> 37 / 45 students have mastered today's concept

Cohort numbers are seeded for the demo; the event pipeline behind them is real.

### Deploy Quest — the teacher closes the loop

On the teacher console: the weakest misconception, and a button that generates a
**5-tree focus quest** targeting only that misconception and drops it into the
world. Student game → AI diagnosis → teacher intervention → student mastery.
That is the full circuit, and it is the last beat of the demo.

### What goes early, and what waits

**Minute 30 (structural, painful later):** third-person camera + avatar mesh.

**Core loop window, 3:30–5:00 — interactive, not droppable:** answer stones,
bridges with planks, other players in the forest, help-a-classmate. These *are*
the loop now. Each has a fallback in the table above.

**Hour 5, polish (droppable in this order, cut from the back):**
Professor Byte walking over → the three bars → quest copy → Class World bar →
Deploy Quest → the fox's confidence prompt → skins.

**Never:** avatar cosmetics, emotes, world decorations, badge shelves, four
pets, chat, player-to-player physics, five subject worlds, a second biome.

**The loop still comes first — but the loop is now interactive by construction.**
Neither a walking simulator nor a quiz with a 3D background wins. The fix is not
more layers on top; it's that answering is something your body does in the world.

---

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
3. Correct on the sapling → parent becomes `'regrown'`, sapling → `'healthy'`.
   **Correct on a withered tree directly → `'regrown'`**, not `'healthy'` — the
   demo's repair beat retries the same tree, and A only animates on `'regrown'`.
   Correct on an already-healthy tree stays `'healthy'`.
4. Wrong on the sapling → spawn one more, max 2 saplings per parent **per session**.
5. **Sapling IDs include the session** — `` `${rootId}-s${sessionIndex}-${n}` `` — so
   they can never collide across sessions.

**Next session** — `/api/next-session` increments `sessionIndex`, moves every
box-1 and box-2 tree to `'healthy'` but re-lays them out **near the entrance**,
and clears **every** sapling — any tree with `spawnedFrom !== null`, whatever
state it's in. A repaired sapling is `'healthy'`, so filtering on
`state === 'sapling'` misses it and it survives forever. That is distributed
practice, made spatial.

---

## Ownership — do not edit another builder's files

| Area | Owner |
|---|---|
| `client/` — scene, avatar, trees, stones, bridges, NPCs, other players, layout fn | **A** |
| `client/src/hud.ts`, `client/src/hud.css` — bars, quest toasts, banners, fox prompt | **C** |
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

**The one client-side seam between A and C.** A's `client/src/state.ts` exports
`subscribe(fn)` and emits typed events; C's HUD subscribes and never touches the
scene. A never renders HUD HTML. Two separate files, one interface:

```ts
type GameEvent =
  | { type: 'state';     world: World; xp: number; mastery: number; retention: number }
  | { type: 'answered';  result: AnswerResult }
  | { type: 'questStart'; conceptId: string; questName: string }
  | { type: 'plankPlaced' | 'plankLost'; conceptId: string }
  | { type: 'levelUp';   conceptId: string }
  | { type: 'needConfidence'; treeId: string; resolve: (c: Confidence) => void };
```

`server/brain/index.ts` exports exactly these, and C only ever calls these:

```ts
spawnWorld(input: SpawnInput, syllabus: Syllabus, onPartial: (w: Partial<World>) => void): Promise<World>
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
