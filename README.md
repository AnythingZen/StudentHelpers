# Mastery Grove

A teacher drops in a PDF worksheet. It spawns a 3D forest of questions from that
document. Students walk the forest and answer trees. A wrong answer withers the
tree — which then asks a scaffolding question instead of giving the answer — and
a sapling of the same concept takes root further along the path. The teacher
watches a live heatmap of the forest keyed by *misconception*, not by miss-rate.

**Track 3 · Learning Science in the Loop.** Desktop web, keyboard + mouse.
7 hours, 3 builders.

---

## Read in this order

1. **[docs/CONTRACT.md](docs/CONTRACT.md)** — everyone, first, before any code.
   The shared data shape, the five endpoints, the rules all three of you must
   implement identically, and the cut list.
2. **Your own brief:**
   - **[docs/BUILDER-A-FOREST.md](docs/BUILDER-A-FOREST.md)** — three.js scene,
     movement, tree rendering, question card, the layout function.
   - **[docs/BUILDER-B-BRAIN.md](docs/BUILDER-B-BRAIN.md)** — PDF → world,
     misconception diagnosis, recall grading, Leitner scheduler.
   - **[docs/BUILDER-C-SPINE.md](docs/BUILDER-C-SPINE.md)** — express server,
     in-memory state, teacher console + heatmap, deployment, shipping.
3. **[docs/DEMO.md](docs/DEMO.md)** — the 7-hour phase plan, the 90-second demo
   script, the citations slide, and what to say when judges push back.

`mockWorld.json` is a valid world. **Code against it from minute 15** so nobody
blocks on anybody.

---

## Minute 0 to 30 — the Lock

Do these in order and do not skip one:

1. All three read `docs/CONTRACT.md`. Say the cut list out loud.
2. `git checkout development` → each builder cuts `feature/a-forest`,
   `feature/b-brain`, `feature/c-spine`.
3. A scaffolds `client/` (Vite), C scaffolds `server/` (express), B scaffolds
   `server/brain/`.
4. `cp .env.example server/.env` and put the real `ANTHROPIC_API_KEY` in it.
5. B starts the PDF call **immediately**. It is the one piece most likely to
   surprise you; everything else has a mock.

## Integration points

Merge to `development` at **2:30**, **3:30** and **5:00**. Nothing else merges.

**2:30 is the go/no-go.** If the 3D scene cannot render `mockWorld.json`,
Builder A drops to 2.5D top-down. Builder C makes that call.

## Two things that are not optional

- **The 2:30 fallback.** A 2.5D forest that works beats a 3D forest that doesn't.
- **The backup video at 6:00.** Recorded, watched back, on the presenting laptop.

---

## Why this wins the track

Every mechanic maps to a paper, and the code actually does what the paper says —
the sapling respawn is the spacing effect, free-recall trees are the testing
effect, `layout.ts` interleaves rather than blocks, and grove depth follows
Bloom's. Four citations on one slide, each pointing at a real line of code.
See [docs/DEMO.md](docs/DEMO.md).

The PDF is the whole adoption story: the teacher uploads the worksheet she
already wrote, and every generated question carries the page and passage it came
from, so she can verify it. No content authoring, no accounts — just a room code
on the board.
