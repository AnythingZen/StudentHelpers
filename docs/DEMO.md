# THE DEMO, THE CLOCK, AND THE CITATIONS

Builder C owns this file and holds the clock. Everyone reads it at minute 5 so
you all know what you are building toward.

---

## The 7-hour plan

| Time | Phase | What must be true at the end |
|---|---|---|
| **0:00–0:30** | **Lock** | `CONTRACT.md` read aloud. `mockWorld.json` committed. Vite + express scaffolds pushed. `development` + three feature branches. Cut list said out loud. |
| 0:30–2:30 | **Parallel slices** | **A:** walking around a forest built from the mock. **B:** one real PDF → valid world JSON in the console. **C:** server up, teacher heatmap rendering from the mock. |
| **2:30–3:30** | **Integration #1 — GO/NO-GO** | A real generated world renders in the 3D scene. *If A's scene can't render the mock at 2:30, A drops to 2.5D. C makes that call.* |
| 3:30–5:00 | **The loop closes** | Wrong answer → diagnosis → tree withers and speaks a scaffold → sapling respawns ahead → teacher heatmap updates live. |
| 5:00–6:00 | **Juice** | Fog, ambient audio, sky shift, the regrow animation, heatmap legibility. Stretch only if ahead: `.glb` environment, `ts-fsrs` health number, Deploy Focus Quest. **Polish wins hackathons more reliably than features.** |
| **6:00–6:30** | **Freeze + record** | Hard code freeze. Full-flow screen capture in hand. |
| 6:30–7:00 | **Rehearse** | Run it out loud three times. Timed. |

### The two non-negotiables

1. **2:30 fallback.** If the 3D scene cannot render `mockWorld.json`, Builder A
   switches to 2.5D top-down immediately. Same contract, same everything else.
   A 2.5D forest that works beats a 3D forest that doesn't.
2. **6:00 backup video.** Recorded, watched back once, and on the presenting
   laptop. Live demos fail. A team that calmly plays a video still wins.

---

## The 90-second demo

Run it in this order. Do not improvise; you have rehearsed this three times.

**0:00 — the problem, in one sentence.**
> "Every AI homework tool helps students finish work. We built one that finds out
> what they misunderstood — and makes them come back to it."

**0:10 — the teacher spawns a world.**
Drag a real chemistry worksheet onto the teacher console. The forest plants
itself live: *"Reading your worksheet… 4 concepts found, planting 27 trees."*
A room code appears: **OAK7**.
> "This is her actual Friday worksheet. She didn't author anything."

**0:25 — the student joins and walks.**
Enter `OAK7`. First-person, into the forest. Walk to a tree, press E, answer it
right. The canopy holds.
> "Groves are concepts. Walking deeper moves up Bloom's taxonomy."

**0:40 — the wrong answer. This is the whole product.**
Answer one wrong. **The tree withers on screen.** It doesn't say "Wrong!" — it
asks a question back:
> *"What are the units of molar mass?"*

Hover the `📄 p.2` chip — the question traces to a passage in the teacher's own
PDF.
> "It diagnosed the misconception, then scaffolded instead of answering."

Student solves it. Tree regrows.

**0:55 — spacing, made visible.**
Walk on. A sapling of that same concept has taken root further along the path.
> "That's distributed practice. Not a popup — the world itself."

**1:05 — the teacher already knows.**
Cut to the teacher console. The grove is amber. Hover it:
> **"9 students think molar mass is the same as molecular count."**

> "Not 'nine students got question four wrong.' That's a gradebook. This is a
> lesson plan."

Click **Next Session** — the weak grove slides to the forest entrance.

**1:20 — close on the science.**
The citations slide. Say the last line:
> "Other tools help students finish homework tonight. This one knows what they'll
> have forgotten by Thursday."

---

## The citations slide — one slide, four lines

The brief explicitly asks for research. Most teams won't bring any. Each line
maps to a mechanic that is *actually implemented* — say that out loud, it's the
difference between citing a paper and applying one.

| Finding | Source | Where it is in the build |
|---|---|---|
| **Spacing effect** — distributed practice beats massed practice for retention | Cepeda, Pashler, Vul, Wixted & Rohrer (2006), *Psychological Bulletin* 132(3) | The sapling respawn, and review trees pulled to the entrance next session |
| **Testing effect** — retrieval attempts produce more durable learning than re-reading | Roediger & Karpicke (2006), *Psychological Science* 17(3) | Every tree is a retrieval attempt; ~25% are free-recall, not multiple choice |
| **Interleaving** — mixed concept order beats blocked order | Rohrer & Taylor (2007), *Instructional Science* 35 | `layout.ts` interleaves concepts along the path rather than grouping them |
| **Bloom's taxonomy** — ordered cognitive demand | Anderson & Krathwohl (2001) | Grove depth: `remember` at the entrance → `understand` → `apply` deepest |

The free-recall trees matter more than they look. Roediger & Karpicke's effects
are strongest for *generative* retrieval, not four-option recognition — a judge
who knows the paper will check. Having real recall questions is what makes the
citation honest rather than decorative.

---

## What to say when they ask

**"Isn't this just gamified flashcards?"**
Flashcards decay on a timer you can't see. Here the forest *is* the memory
state — a student can look at the treeline and see what they're losing. And the
schedule isn't the student's to game: it's derived from a diagnosed
misconception, not from whether they clicked "I knew that."

**"What does the AI actually do?"**
Three things, all structured, none of them a chatbot: it reads the teacher's PDF
into a concept graph with a prerequisite DAG; it classifies each wrong answer
into that document's own misconception taxonomy — a constrained enum, so it
can't invent a label; and it scaffolds with a question instead of an answer.
The classification is what makes 45 students aggregatable into one heatmap.

**"How do I know it didn't hallucinate the questions?"**
Every question carries the page and passage it came from, using Claude's
document citations. Hover any question to see the teacher's own text.

**"Could a teacher really use this on Monday?"**
That's the whole design. She uploads the worksheet she already wrote. No content
authoring, no setup, no accounts — a room code on the board.

---

## Known limits — say these before a judge finds them

Honesty scores better than polish here, and every one of these was a deliberate
trade to ship in 7 hours:

- One room, one worksheet at a time; state is in memory and dies on restart.
- Misconception taxonomy is generated per document and unvalidated by a teacher —
  a real deployment needs teacher review before it drives instruction.
- Leitner 3-box, not a full FSRS/SM-2 scheduler. Right timescale for a single
  session, too coarse for weeks.
- Cohort numbers in the heatmap are seeded for the demo; the pipeline behind them
  is real and per-event.
- No accessibility work. A keyboard-and-mouse 3D world excludes students, and a
  real version needs the 2.5D mode as a first-class option, not a fallback.
