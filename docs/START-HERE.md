# START HERE — read this before anything else

| Role | Who | Brief |
|---|---|---|
| **A — The Forest** | Roshan | [BUILDER-A-FOREST.md](BUILDER-A-FOREST.md) |
| **B — The Brain** | Zen | [BUILDER-B-BRAIN.md](BUILDER-B-BRAIN.md) |
| **C — The Spine** | repo owner | [BUILDER-C-SPINE.md](BUILDER-C-SPINE.md) |

These docs changed **many times** during planning. If you read any of them
before the clock started, assume your copy is stale.

---

## Step 1 — the handshake. Do this out loud before anyone writes code.

```bash
git checkout development && git pull
git log -1 --format='%h %s'
node -v                          # must be v22.12 or higher
```

All three of you say the hash **and** your Node version out loud. **If the hashes
don't match, stop.** If anyone is on Node 20, stop too — `ai@7` requires Node 22
and fails with an unhelpful error. See [TOOLING.md](TOOLING.md).
Somebody is building against an old contract, and it is much cheaper to find
that out at minute 2 than at the 2:30 integration.

---

## Step 2 — what changed, if you read an earlier version

> **Latest reviews — read yours:**
> [round 1 — Zen](reviews/b-brain-c348b5b.md) ·
> [round 2 — Zen and Roshan](reviews/round-2-zen-e479d07-roshan-9b2334b.md)
>
> **Canonical `shared/types.ts` is Zen's**, from `feature/b-brain`. Roshan and Zen
> each created one; don't merge them — Roshan switches imports to Zen's.
>
> **Two team decisions open:** which LLM provider runs the demo, and whether the
> Khan Academy scraper stays. Recommendations are in round 2.
>
> **Branches:** code goes on your `feature/*` branch. `development` takes merges at
> checkpoints only.

### Everyone

- **Set up [TOOLING.md](TOOLING.md) first** — Node 22.12+, and approve the two
  MCP servers (Context7, Playwright) Claude Code offers from `.mcp.json`.
- **Zen's first push was reviewed** — see
  [reviews/b-brain-c348b5b.md](reviews/b-brain-c348b5b.md). Five verified issues,
  a four-line fix proven red → green, and contract rulings everyone must follow:
  saplings don't count toward concept health; correct on a withered tree →
  `'regrown'`; next session clears every sapling; sapling IDs include the session;
  shared types use `Uint8Array`, never `Buffer`.
- **INTERACTIVE FIRST.** Judges are scoring interactivity, not just learning.
  Answering is no longer a 2D card that stops the game — **you walk into answer
  stones**. Locked groves sit behind **bridges you rebuild plank by plank** and
  then walk across. **Other players** share the forest (real second browser +
  seeded classmates, one list). Teach trees are **helping a stuck classmate,
  Mia**. These are core now, not hour-5 polish. See "Interactive first" in
  `CONTRACT.md`.
- **Eight endpoints**, not six: `POST` and `GET /api/presence/:worldId` are new.
- **HUD belongs to C** (`client/src/hud.ts`, `hud.css`), wired through A's
  `state.ts` event bus. Every other file in `client/` is A's.
- **Subject is maths, not chemistry.** MOE Singapore · Primary 5 · Fractions
  leads. Any mention of moles or molar mass is from a dead draft.
- **Two worlds, one engine.** Maths carries the demo loop; a Primary 3 English
  reading world proves the breadth. Always a forest — never a second biome.
- **It is a game, not a quiz.** Third-person avatar, NPC tutor, a fox, three
  bars, quest copy, Class World, Deploy Quest. See the "Interactive first" and
  game-layer sections of `CONTRACT.md`.
- **`World.status` exists** (`growing | ready | failed`). An earlier revision
  accidentally dropped it from the type.
- **No Khan Academy links.** Bot challenge plus JavaScript-rendered — it cannot
  work. Gutenberg, Wikipedia, OpenStax and public PDF URLs do.
- **Do not cite the Learning Pyramid** (the 90/75/50/30/20/10/5 chart). No
  traceable empirical source. The citations slide has the real ones.
- **Never touch the sponsor's library.** Epic's books are licensed. Use public
  domain texts only, and never imply a partnership.

### Roshan (A) — the one that matters most

- **Answer stones replace the question card** for `choice` trees: E to accept →
  four stones rise → walk into one → ~0.6s ring confirms. Card is the 3:30
  fallback. Use `CSS2DRenderer` for labels (verified in 0.186.0).
- **Bridges replace fog walls** for locked groves, planks from prerequisite
  health.
- **`players.ts`** renders the presence list at 500ms with lerping.
- **Mia at teach trees**, input in her speech bubble.
- **You no longer build the HUD** — emit events from `state.ts`; C renders.
- **THIRD PERSON. Decide at minute 30.** Visible blocky avatar, camera trailing
  behind. If you read an early draft, it said first-person — that is wrong now,
  and it is the only decision on your list that is painful to change later.
- **Three tree kinds:** `choice` (answer stones), `recall` (one stone + a
  speech-bubble input), `teach` (Mia, stuck at the tree — you help her).
- **Two skins** from one lookup table: maths = cool birch, English = warm oak.
- **Level-ladder grove:** deepest, gated, fires **NEW AREA UNLOCKED**.
- **Hour 5 polish, cut from the back:** Professor Byte walks over → fox mesh →
  skins. Bars and quest copy are C's HUD now, not yours.
- **Two fixtures:** `mockWorld.json` (maths) and `mockWorldReading.json`.

### Zen (B)

- **Spawn prompt now also returns `questName` per concept** — the most-seen
  string in the game.
- **`gradeExplanation`'s encouragement is Mia's dialogue**, not a sapling's.
- **Six exports, not four:** `spawnWorld`, `diagnose`, `gradeRecall`,
  `gradeExplanation`, `focusQuest`, `schedule`.
- **`spawnWorld` takes a `Syllabus`, not a subject string**, and branches on
  `source.kind`: `pdf | url | text | prompt`. One pipeline, ~6 lines of branch.
- **`generateObject` is not the current API.** Use `generateText` / `streamText`
  with `Output.object`. `mediaType`, not `mimeType`.
- **The spawn prompt must ask for one concept from the level above** — the level
  ladder. The model will not produce it unless asked.
- **Confidence calibration** is a comparison, not a model call.
- **Citations API + structured output = HTTP 400.** You found this; the plan was
  wrong. Model writes `{ page, quote }`; the server verifies the quote is really on
  that page. Snippet in your brief.

### C

- **Presence endpoints** with three seeded classmates, one of them Mia standing
  at a teach tree.
- **You own the HUD** — bars, quest toasts, banners, the fox's confidence prompt
  on keys 1/2/3.
- Four input tabs, two subjects, maths spawned live, reading pre-spawned.
- `POST /api/answer` branches three ways: `recall`, `teach`, `choice`.
- Class World bar, Deploy Quest route, and the three bars on `/api/state`.
- Retention is a **proxy** — say so; never imply it is FSRS.

---

## Step 3 — the build failsafe. Not "build from scratch": skeleton first.

The failsafe is not a backup copy of the project. It is building in an order
where **`development` always runs a demo**, even when a segment is broken.

**Minute 10 — `shared/types.ts`.** The interfaces from `CONTRACT.md`, as real
TypeScript, committed and then frozen. This is what actually protects you from
stale context: if someone's code is built against an old version of the
contract, **the compiler fails**, instead of a person noticing at 2:30.

**Minute 0–45 — C builds a walking skeleton**, end to end, entirely with fakes:
- `server/` serves both fixtures on `GET /api/state` and answers
  `POST /api/answer` in the real response shape with canned values
  (`BRAIN_MOCK=1`).
- `client/` renders the fixture world as plain boxes you can walk around, and
  calls those endpoints.

Ugly, but it runs. Then **each builder replaces one fake with real code**,
behind the same interface. Roshan swaps boxes for the forest. Zen swaps canned
answers for real diagnosis. C swaps fixtures for real spawning.

What that buys you, concretely:

| If this fails… | …the demo still runs on |
|---|---|
| Zen's AI pipeline | the fixtures + `fallbackWorld.json` |
| Roshan's 3D scene | the 2.5D fallback, same contract |
| C's PDF upload | the "just a topic" tab |
| The venue wifi | `BRAIN_MOCK=1` and the backup video |

**Never merge anything that breaks the skeleton.** If `development` doesn't run
after a merge, revert the merge first and debug second.

---

## Step 4 — check the hackathon rules before writing any code

Many hackathons require all **code** to be written during the event, while
planning documents are fine. Everything in this repo so far is planning docs and
two JSON fixtures. **Confirm the rules before committing any application code
early** — including `shared/types.ts` and the skeleton. If pre-written code is
not allowed, all of Step 3 happens at minute 0, which is exactly where it is
scheduled anyway.
