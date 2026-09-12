# BUILDER C — THE SPINE

**You own the server, the teacher, and the demo itself.** Your segment is the
smallest to build and the most important to get right, because you are also the
person who makes sure the team actually ships.

**Read `docs/CONTRACT.md` first.** You are the only one who calls into
`server/brain/`, and the only one who holds state.

---

## Your stack

```bash
npm i express@5.2.1 zod@4.6.2 multer
```

No database. No ORM. No Supabase. No auth. **State is a plain JS object.**

```ts
const worlds = new Map<string, World>();   // that's the entire persistence layer
```

If someone suggests adding Postgres "just for the sessions", the answer is no.
A DB costs you schema, migrations, env keys and an hour, and buys nothing for a
single-room demo.

---

## Your files

```
server/
  index.ts        express app, the 8 routes
  store.ts        the Map, room codes, answer keys held private
  teacher/
    index.html    teacher console
    console.ts    upload, room code, heatmap, next session
  .env.example

client/src/
  hud.ts          YOURS — bars, quest toasts, banners, fox prompt
  hud.css         YOURS
```

---

## Room codes

4 characters, pronounceable, unambiguous. `OAK7`, `FERN`, `MOSS`.
**No `0`/`O`, no `1`/`I`/`l`** — you will be reading this code out loud on stage
while someone types it. Generate from a curated syllable list, not random hex.

---

## The eight routes. That is the whole backend.

### `POST /api/world`
Multipart: `pdf` + `system` + `level` + `subject` + `topic` (the three dropdowns
plus the fixed system). Do this in order:
1. Validate: PDF mime type, **under 32 MB**, not encrypted. Reject cleanly with a
   readable message — a teacher will upload a password-protected PDF eventually.
2. Mint a room code, store `{ worldId, status: 'growing', trees: [] }`
3. **Return `{ worldId }` immediately.** Do not await generation.
4. In the background: `brain.spawnWorld(input, syllabus, onPartial)` — `input` is a
   `SpawnInput` built from the request — and on each
   partial, run `layout()` over what exists and merge into the store so polling
   clients see the forest planting itself.
5. On completion: `status = 'ready'`. On failure or **90-second timeout**: load
   `fallbackWorld.json`, set `status = 'ready'`, log loudly to your console but
   **show nothing to the user.**

That last point is the difference between a demo and an incident.

### `GET /api/state/:worldId`
Returns `{ status, world }`. **Strip `answerIndex` and `answerText`.** Write one
`toClientWorld(world)` function and use it on every response — this is the only
place answers can leak, so keep it to one place.

Clients poll this every 2s. No websockets, no SSE.

### `POST /api/answer`
`{ worldId, treeId, response }`. This route owns the whole loop:

```ts
const correct =
  tree.kind === 'recall' ? (await brain.gradeRecall(tree, response as string)).correct
: tree.kind === 'teach'  ? (await brain.gradeExplanation(tree, response as string)).passed
:                          response === privateAnswers[treeId];

let diagnosis = null;
if (!correct) diagnosis = await brain.diagnose(tree, response, world);

const next = brain.schedule(world, treeId, correct);   // pure — withers, spawns sapling
if (diagnosis?.saplingId) layout.placeSapling(next, treeId);
worlds.set(worldId, next);

return {
  correct,
  treeState: next.trees.find(t => t.id === treeId)!.state,
  misconceptionId:    diagnosis?.misconceptionId ?? null,
  misconceptionLabel: labelFor(diagnosis?.misconceptionId) ?? null,
  scaffoldHint:       diagnosis?.scaffoldHint ?? null,
  saplingId,
  conceptHealth: healthOf(next, tree.conceptId),
};
```

Grading is **server-side, always**. The client never sees an answer key.

Also append to an `events[]` log on the world: `{ ts, treeId, conceptId,
misconceptionId, correct }`. The heatmap and every number on the teacher console
derives from that log — build it once, read it everywhere.

### `POST /api/next-session/:worldId`
`sessionIndex++`, box-1 and box-2 trees → `healthy`, saplings cleared, then
re-layout with the review queue **near the entrance**. Returns the new world.
This is your demo's second act: proof the system remembers across sessions.

### `POST /api/presence/:worldId` and `GET /api/presence/:worldId`

Other people in the forest — a core interactive feature, not polish. A plain
`Map<playerId, { name, pos, yaw, lastSeen }>` per world. POST upserts, GET
returns everyone seen in the last 3s **plus three seeded classmates**:

```ts
{ players: [{ playerId, name, pos, yaw, seeded }] }
```

Seeded classmates walk slow wander loops you compute server-side from the clock
— `pos = centre + [cos(t/9), 0, sin(t/9)] * radius` is plenty. One of them, **Mia**,
stands still at a `teach` tree instead, looking stuck.

Clients poll this at **500ms**, separately from state. It's tiny and in memory.
On stage, a second browser window in the same room shows up as a real player.
If that ever misbehaves, the seeded classmates are still walking around.

### `GET /api/teacher/:worldId`
Aggregate from `events[]`:

```ts
{
  roomCode, subject, sessionIndex, studentCount,
  concepts: [{ id, name, bloom, health, attempts, missRate, locked }],
  misconceptions: [{ id, label, conceptId, count, studentCount }],  // sorted desc
  heatmap: [{ conceptId, centre: [x,z], radius, health }],
  weakest: { conceptId, misconceptionId, count },
}
```

---

## The teacher console — your demo money shot

Plain HTML + a canvas. No React, no framework. Three things on one screen:

**1. Pick the syllabus, then upload.** Three dropdowns, populated from B's
`syllabus.json`: **Subject → Level → Topic**. Two subjects only:

- **Mathematics · Primary 5 · Fractions** — spawned from a PDF worksheet.
  **This one carries the demo loop.**
- **English · Primary 3 · Reading Comprehension** — spawned from a public-domain
  Project Gutenberg book URL. Sponsor-aligned (Epic is children's reading) and
  it carries the breadth claim.

Two subjects at two levels is what proves the platform claim and the level dial
at once, and it costs you nothing but a second entry in the dropdown — both
fixtures are already committed. Keep it to three `<select>` elements. **No
syllabus editor, no third subject.**

**Both worlds are live at demo time.** Spawn the MATHS world on stage from the
PDF worksheet; have the READING world **already spawned and sitting in the room
list** so the cut to it is instant and cannot fail. Two rooms at once is also
just what a real classroom looks like.

Then choose how to feed it. **Four tabs, one endpoint:**

- **Upload PDF** — the maths path, and the richest provenance
- **Paste a link** — the reading path. Works on Project Gutenberg, Wikipedia,
  OpenStax, and any public PDF URL. **Does not work on Khan Academy** (bot
  challenge + JavaScript-rendered) — see B's brief. Keep an allowlist and test
  your demo URL beforehand.
- **Paste text** — a textarea; paste lesson content from anywhere
- **Just a topic** — nothing but the dropdowns; spawns from the syllabus alone

All four `POST /api/world`; only the `source` field differs. B's pipeline
branches internally, so you do not.

The tabs are worth 20 minutes: they're what make this look like a platform
rather than a PDF converter, and "just a topic" is your safety net if an upload
misbehaves on stage.

Then get a big readable room code. While `status === 'growing'`, show "Reading
your worksheet… 4 concepts found, planting 27 trees" — driven by the partials,
so it feels alive.

**2. The forest heatmap.** Top-down 2D canvas of the same coordinates A uses —
one circle per grove at `concept.centre`, radius by tree count, colour by health:
green → amber → dead brown. Hovering a dead grove shows the concept name **and
the top misconception label with a count.**

> "9 students think 5/8 is larger than 3/4 — they're comparing numerators"

**That sentence is the moment the judges remember.** A miss-rate says *9 students
got Q4 wrong* — a gradebook. A misconception label says *here is what to
reteach* — a lesson plan. Make the label big, make it readable from the back of
a room, and make sure it renders correctly before you polish anything else.

**3. Next Session button.** One click, calls `/api/next-session`, heatmap
visibly re-arranges with the weak groves pulled to the entrance.

**4. Class World — a shared goal, never a leaderboard.** One bar, not a ranking:

> 🏰 **The class is unlocking the Castle Library** — 81%
> 37 / 45 students have mastered today's concept

A ranked list demotivates everyone below the top three, and your own instinct on
that was right. Cohort numbers are seeded for the demo; the per-event pipeline
behind them is real. ~15 min.

**5. Deploy Quest — the last beat of the demo.** Show the weakest misconception
and a button. On click, call `brain.focusQuest(world, misconceptionId)`, run
`layout()` over the five returned trees, merge them into the world near the
entrance. The student's forest grows new trees within one 2s poll.

Student game → AI diagnosis → teacher intervention → student mastery. **Nothing
else in the build connects all four**, so this ranks above the skin and above
`ts-fsrs` if you are choosing. ~25 min.

**Also expose the three bars** on `/api/state` so A's HUD has something to read:

```ts
xp        = 10 * correctAnswers + 25 * teachPassed   // grows fast, means least
mastery   = mean(conceptHealth)                       // 0..1, the real thing
retention = share of trees in Leitner box 2 or 3      // 0..1, a PROXY
```

Retention is a **proxy**, not a memory model. Say so if asked; do not imply FSRS.

---

## You also own the HUD — `client/src/hud.ts` and `hud.css`

The only two files in `client/` that are yours. You **subscribe** to A's
`state.ts` event bus (see the client seam in `CONTRACT.md`) and never touch the
three.js scene. A never writes HUD HTML. That split keeps the busiest directory
in the project conflict-free.

What you render, all plain HTML + CSS over the canvas:

- **The three bars** — XP greyed, mastery and retention bright. "The game rewards
  the second bar" has to be visible at a glance.
- **Quest toasts** off `questStart`, `plankPlaced`, `plankLost` — *Quest
  accepted: The Fraction Bridge* · *🔨 Bridge Repair +1* · *⚠️ A plank fell*.
- **Banners** off `levelUp` — *🏰 NEW AREA UNLOCKED* — big, centred, with sound.
- **The fox's confidence prompt** off `needConfidence` — three big buttons, *low /
  medium / high*, keyboard `1 2 3` so pointer lock never has to release. Call
  `resolve(choice)`.

~45 minutes, and it's the layer judges read first. Keep it legible from the back
of a room.

## You own the walking skeleton — minute 0 to 45

Before anything is real, build the whole path with fakes: `server/` serves both
fixtures and answers `/api/answer` in the real response shape with canned values;
`client/` renders boxes and calls those endpoints. Hand it to Roshan and Zen at
0:45. Each of them then replaces one fake behind the same interface.

From that point **`development` must always run a demo.** If a merge breaks it,
revert the merge first and debug second. This is the project's failsafe — not a
backup copy, but a build order in which nothing is ever unrunnable.

## You also own shipping

Nobody else will do these, and every one of them has sunk a hackathon team:

- **Deployment.** Get it on a URL by hour 4, not hour 6. Serve A's Vite build as
  static files from express — one origin, no CORS to debug at 5:30.
- **`.env.example` committed**, real `.env` never.
- **The backup video at 6:00.** Screen-record the entire flow end to end. Hard
  requirement. Live demos die; a team that calmly plays a recording still wins.
- **The demo script** in `docs/DEMO.md` — you run rehearsals, you hold the clock.
- **Calling the 2:30 go/no-go.** If A's 3D scene can't render the mock, you are
  the one who says "switch to 2.5D now." Say it kindly and say it on time.
- **Merging to `development`** at 2:30, 3:30 and 5:00.

---

## Checkpoints

| Time | Must be true |
|---|---|
| 0:10 | `shared/types.ts` committed from the CONTRACT interfaces, then frozen |
| **0:45** | **Walking skeleton runs end to end on fakes** — server serves both fixtures and canned `/api/answer` responses; client renders boxes you can walk around. See `START-HERE.md`, step 3. |
| 1:15 | Teacher page renders the heatmap from the mock |
| 2:00 | `POST /api/answer` working against mock answers, `events[]` logging |
| **2:30** | **Integration #1: A polls your server, B's real world is in the store** |
| 3:00 | PDF upload → real spawn → "growing" progress on the teacher page |
| 3:30 | Diagnosis flowing through `/api/answer` into the heatmap |
| 3:45 | **Presence live** — seeded classmates walking; a second browser appears as a real player |
| 4:15 | **HUD** — three bars, quest toasts, fox prompt on keys 1/2/3 |
| 4:00 | **Deployed to a URL** |
| 4:30 | Next Session working |
| 5:00 | Heatmap readable and pretty; misconception labels legible |
| **6:00** | **Code freeze. Record the backup video.** |
| 6:30 | Three timed rehearsals |

---

## Do not touch

`client/src/**` except `hud.ts` / `hud.css` (A's), and `server/brain/**` (B's). You import `layout` from A
and the six functions from B. If you're writing a prompt, you're doing B's job.
