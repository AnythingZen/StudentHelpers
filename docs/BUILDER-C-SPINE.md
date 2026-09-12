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
  index.ts        express app, the 5 routes
  store.ts        the Map, room codes, answer keys held private
  teacher/
    index.html    teacher console
    console.ts    upload, room code, heatmap, next session
  .env.example
```

---

## Room codes

4 characters, pronounceable, unambiguous. `OAK7`, `FERN`, `MOSS`.
**No `0`/`O`, no `1`/`I`/`l`** — you will be reading this code out loud on stage
while someone types it. Generate from a curated syllable list, not random hex.

---

## The five routes. That is the whole backend.

### `POST /api/world`
Multipart: `pdf` + `subject`. Do this in order:
1. Validate: PDF mime type, **under 32 MB**, not encrypted. Reject cleanly with a
   readable message — a teacher will upload a password-protected PDF eventually.
2. Mint a room code, store `{ worldId, status: 'growing', trees: [] }`
3. **Return `{ worldId }` immediately.** Do not await generation.
4. In the background: `brain.spawnWorld(pdf, subject, onPartial)`, and on each
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
const correct = tree.kind === 'recall'
  ? (await brain.gradeRecall(tree, response as string)).correct
  : response === privateAnswers[treeId];

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

**1. Upload + room code.** Drop a PDF, pick a subject, get a big readable room
code. While `status === 'growing'`, show "Reading your worksheet… 6 concepts
found, planting 34 trees" — driven by the partials, so it feels alive.

**2. The forest heatmap.** Top-down 2D canvas of the same coordinates A uses —
one circle per grove at `concept.centre`, radius by tree count, colour by health:
green → amber → dead brown. Hovering a dead grove shows the concept name **and
the top misconception label with a count.**

> "9 students think molar mass is the same as molecular count"

**That sentence is the moment the judges remember.** A miss-rate says *9 students
got Q4 wrong* — a gradebook. A misconception label says *here is what to
reteach* — a lesson plan. Make the label big, make it readable from the back of
a room, and make sure it renders correctly before you polish anything else.

**3. Next Session button.** One click, calls `/api/next-session`, heatmap
visibly re-arranges with the weak groves pulled to the entrance.

Optional, if you're ahead at hour 5: a **Deploy Focus Quest** button that spawns
a 5-tree mini-world targeting only the weakest misconception. Closes the loop
teacher → student. Cut it without hesitation if you're behind.

---

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
| 0:30 | Express up, `GET /api/state` serving `mockWorld.json`, room codes minting |
| 1:15 | Teacher page renders the heatmap from the mock |
| 2:00 | `POST /api/answer` working against mock answers, `events[]` logging |
| **2:30** | **Integration #1: A polls your server, B's real world is in the store** |
| 3:00 | PDF upload → real spawn → "growing" progress on the teacher page |
| 3:30 | Diagnosis flowing through `/api/answer` into the heatmap |
| 4:00 | **Deployed to a URL** |
| 4:30 | Next Session working |
| 5:00 | Heatmap readable and pretty; misconception labels legible |
| **6:00** | **Code freeze. Record the backup video.** |
| 6:30 | Three timed rehearsals |

---

## Do not touch

`client/src/**` (A's) and `server/brain/**` (B's). You import `layout` from A
and the four functions from B. If you're writing a prompt, you're doing B's job.
