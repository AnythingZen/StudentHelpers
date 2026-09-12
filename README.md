# Mastery Grove

A teacher picks a subject, level and topic, then drops in a PDF worksheet or
pastes a link. It spawns a 3D forest of questions from that source. Students walk
the forest and answer trees. A wrong answer withers the tree — which then asks a
scaffolding question instead of giving the answer — and a sapling of the same
concept takes root further along the path. Recover, and the sapling asks you to
*teach* it. Master everything and the next level's grove unlocks. The teacher
watches a live heatmap of the forest keyed by *misconception*, not by miss-rate.

**Track 3 · Learning Science in the Loop.** Desktop web, keyboard + mouse.
7 hours, 3 builders.

**It is a game, not a quiz with trees.** Third-person blocky avatar, NPC tutors
who speak in the world instead of a chat box, a fox companion that asks how sure
you are before you answer, quest framing throughout, three progression bars
where XP is deliberately the least important, a shared Class World goal instead
of a leaderboard, and a teacher Deploy Quest button that drops a targeted
intervention into the student's forest live. See the game-layer section of
[docs/CONTRACT.md](docs/CONTRACT.md).

**Third person is decided at minute 30.** It is the only item on that list that
is expensive to retrofit, because it is a camera and controls decision.
Everything else is hour-5 polish and each piece is droppable.

**Two worlds, one engine, one world type — a forest with a palette swap. Never
a second biome:**

| World | Source | Role in the demo |
|---|---|---|
| **Maths · Primary 5 · Fractions** (MOE SG) | PDF worksheet | Carries the loop |
| **English · Primary 3 · Reading** | Public-domain book URL | Carries the breadth claim |

Fixtures for both are committed (`mockWorld.json`, `mockWorldReading.json`), so
all three builders can work against real-shaped data from minute 15.

---

## Read in this order

0. **[docs/START-HERE.md](docs/START-HERE.md)** — **first, every time.** Who is
   who, the commit-hash handshake, what changed since earlier drafts, and the
   skeleton-first failsafe. The docs were revised many times during planning, so
   assume any copy you read before the clock started is stale.
1. **[docs/CONTRACT.md](docs/CONTRACT.md)** — everyone, first, before any code.
   The shared data shape, the five endpoints, the rules all three of you must
   implement identically, and the cut list.
2. **Your own brief:**
   - **[docs/BUILDER-A-FOREST.md](docs/BUILDER-A-FOREST.md)** — three.js scene,
     movement, tree rendering, question card, the layout function.
   - **[docs/BUILDER-B-BRAIN.md](docs/BUILDER-B-BRAIN.md)** — PDF → world,
     misconception diagnosis, recall and explanation grading, Leitner scheduler.
   - **[docs/BUILDER-C-SPINE.md](docs/BUILDER-C-SPINE.md)** — express server,
     in-memory state, teacher console + heatmap, deployment, shipping.
3. **[docs/DEMO.md](docs/DEMO.md)** — the 7-hour phase plan, the 150-second demo
   script, the citations slide, and what to say when judges push back.

`mockWorld.json` and `mockWorldReading.json` are valid worlds. **Code against
them from minute 15** so nobody blocks on anybody.

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

## What we are deliberately NOT building

No auth, no accounts, no database, no multiplayer, no mobile, no touch, no
collisions, no physics. No avatar cosmetics, emotes, world decorations or badge
shelves. **One** companion with a real job, not four pets. No second biome, no
second game type, no syllabus abstraction layer. One student at a time.

The loop comes first: if 3:30–5:00 hasn't closed wither → diagnosis → sapling →
regrow, the game layer doesn't get started. A walking simulator with beautiful
bars loses to an ugly working loop.

## Why this wins the track

Every mechanic maps to a paper, and the code actually does what the paper says —
the sapling respawn is the spacing effect, free-recall trees are the testing
effect, `layout.ts` interleaves rather than blocks, and grove depth follows
Bloom's, and teach trees are the protege effect. Five citations on one slide,
each pointing at a real line of code.
See [docs/DEMO.md](docs/DEMO.md).

The PDF is the whole adoption story: the teacher uploads the worksheet she
already wrote, and every generated question carries the page and passage it came
from, so she can verify it. No content authoring, no accounts — just a room code
on the board.

**Sponsor note:** Epic is a children's reading platform, which is why a reading
world is in the demo. Never ingest, scrape or reproduce their licensed library,
and never imply a partnership — public-domain texts give the same demo with none
of that exposure.
