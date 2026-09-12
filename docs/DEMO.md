# THE DEMO, THE CLOCK, AND THE CITATIONS

Builder C owns this file and holds the clock. Everyone reads it at minute 5 so
you all know what you are building toward.

**Two worlds, one engine. Maths leads, reading proves the breadth:**
- **Mathematics · Primary 5 · Fractions** — from a PDF worksheet. **Carries the
  loop**: a fraction error is legible in three seconds, and "they're comparing
  numerators" is a precise, checkable diagnosis a judge cannot dispute.
- **English · Primary 3 · Reading Comprehension** — from a public-domain book
  URL. **Carries the breadth claim** and the sponsor's domain, with its own
  heatmap and its own misconceptions.

**The game is the product.** The syllabus is a label that makes the content
defensible; it is not a feature to expand. One world type — a forest — with a
palette swap per subject. Never a second biome.

**Sponsor note:** Epic is a children's reading platform (40K+ kids' books), which
is why the reading world is in the demo at all. **Never ingest, scrape or
reproduce their library** — it is
licensed content — and never imply a partnership. Public-domain texts from
Project Gutenberg give the identical demo with none of that exposure.

---

## The 7-hour plan

| Time | Phase | What must be true at the end |
|---|---|---|
| **0:00–0:30** | **Lock** | `CONTRACT.md` read aloud. `mockWorld.json` committed. Vite + express scaffolds pushed. `development` + three feature branches. Cut list said out loud. |
| 0:30–2:30 | **Parallel slices** | **A:** walking around a forest built from the mock. **B:** one real PDF → valid world JSON in the console. **C:** three dropdowns + server up + heatmap rendering from the mock. |
| **2:30–3:30** | **Integration #1 — GO/NO-GO** | A real generated world renders in the 3D scene. *If A's scene can't render the mock at 2:30, A drops to 2.5D. C makes that call.* |
| 3:30–5:00 | **The loop closes** | Wrong answer → diagnosis → tree withers and speaks a scaffold → sapling respawns ahead → teacher heatmap updates live. Level-ladder gate opens on mastery. |
| 5:00–6:00 | **Juice** | Fog, ambient audio, sky shift, the regrow animation, the LEVEL UP banner, heatmap legibility. Stretch only if ahead: `.glb` environment, `ts-fsrs` health number, Deploy Focus Quest. **Polish wins hackathons more reliably than features.** |
| **6:00–6:30** | **Freeze + record** | Hard code freeze. Full-flow screen capture in hand. |
| 6:30–7:00 | **Rehearse** | Run it out loud three times. Timed. |

### The two non-negotiables

1. **2:30 fallback.** If the 3D scene cannot render `mockWorld.json`, Builder A
   switches to 2.5D top-down immediately. Same contract, same everything else.
   A 2.5D forest that works beats a 3D forest that doesn't.
2. **6:00 backup video.** Recorded, watched back once, and on the presenting
   laptop. Live demos fail. A team that calmly plays a video still wins.

---

## The demo — 150 seconds, and the slot is 3 minutes

Full loop in the maths world. Then a hard cut to reading. **Tell the loop once.**

**0:00 — the problem, in one sentence.**
> "Every AI homework tool helps a student finish tonight's work. We built one
> that finds out what they misunderstood — and makes them walk back to it."

**0:10 — the teacher spawns a world.**
Dropdowns: **Mathematics · Primary 5 · Fractions.** Drop a real P5 fractions
worksheet on it. The forest plants itself live: *"Reading your worksheet…
4 concepts found, planting 27 trees."* Room code: **OAK7**.
> "MOE Singapore syllabus, Primary 5. Imagine any syllabus — we've loaded this
> one. And that's her actual worksheet; she authored nothing."

**0:25 — the student joins and walks.**
Enter `OAK7`. First-person into a cool birch forest. Walk to a tree, press E,
answer it right. The canopy holds.
> "Groves are syllabus concepts. Walking deeper climbs Bloom's taxonomy."

**0:40 — the wrong answer. This is the whole product.**
> *"Which is larger: 3/4 or 5/8?"*

Answer **5/8**. **The tree withers on screen.** It doesn't say "Wrong!" — it asks
a question back:
> *"What would 3/4 look like written in eighths?"*

Hover the `📄 p.2` chip — the question traces to a line in the teacher's own PDF.
> "It classified the error — she's comparing numerators and ignoring the
> denominators — then scaffolded instead of answering."

Student solves it. Tree regrows.

**0:55 — spacing, made visible.**
Walk on. A sapling of that same concept has taken root further along the path.
> "That's distributed practice. Not a popup — the world itself."

**1:05 — teach the sapling. The beat that isn't a quiz.**
The sapling asks to be taught: *"Explain it to me and I'll grow."* The student
types how to compare two fractions with different denominators. Rubric points
tick off. The sapling grows into a full tree.
> "Explaining it to someone else is the strongest thing a learner can do. That's
> the protégé effect, and here it's the mechanic — not a badge."

**1:20 — the teacher already knows.**
Teacher console. The grove is amber. Hover it:
> **"11 students think 5/8 is larger than 3/4 — they're comparing numerators."**

> "Not 'eleven students got question four wrong.' That's a gradebook. This is a
> lesson plan."

Click **Next Session** — the weak grove slides to the forest entrance.

**1:35 — the climb.**
Back in the forest, the deep gate opens: **LEVEL UP · Primary 6 Fractions
unlocked.**
> "Mastery is the only key in this game. A Primary 3 child who clears Primary 5
> fractions walks straight into Primary 6 — nobody has to promote them."

**1:50 — the hard cut. Same engine, different subject.**
Switch to room **FERN**: **English · Primary 3 · Reading Comprehension**, a warm
autumn oak forest, spawned from a public-domain book URL — *The Tale of Peter
Rabbit*. Show its heatmap:
> **"9 students are guessing words from spelling instead of context."**

> "Same engine, same diagnosis, same forest. A book instead of a worksheet,
> Primary 3 instead of Primary 5. The syllabus is just the container."

**2:05 — close on the science.**
The citations slide. Last line:
> "Other tools help a student finish homework tonight. This one knows what
> they'll have forgotten by Thursday."

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
| **Learning by teaching** — explaining to another learner beats reviewing | Fiorella & Mayer; Chi et al. on self-explanation | `teach` trees: the sapling asks to be taught, and grows on a graded explanation |

**Do not put the Learning Pyramid on a slide** — the 90/75/50/30/20/10/5 figures
have no traceable empirical source and the chart is widely criticised. At an
event that asks for citations it is a liability. **Dunlosky et al. (2013)** is
the citation you want for "which techniques actually work": it rates practice
testing and distributed practice as high utility, which is exactly what we
built, and rates rereading and highlighting as low. The mechanic is well
supported; that particular chart is not.

The free-recall trees matter more than they look. Roediger & Karpicke's effects
are strongest for *generative* retrieval, not four-option recognition — a judge
who knows the paper will check. Real recall questions are what make the citation
honest rather than decorative.

Our advisor studied learning theory formally and offered to back the science in
the pitch. **Take her up on it before you present** — a second pair of eyes on
this slide is free credibility.

---

## What to say when they ask

**"Isn't this just gamified flashcards?"**
Flashcards decay on a timer you can't see. Here the forest *is* the memory
state — a student can look at the treeline and see what they're losing. And the
schedule isn't the student's to game: it's driven by a diagnosed misconception,
not by whether they clicked "I knew that."

**"What about Khan Academy?"**
Khan Academy has mastery tracking and practice, and does it well. Two things it
doesn't do: it doesn't classify a wrong answer into a *named misconception* a
teacher can act on, and it isn't a world a child wants to re-enter. We're not
competing on content library — we're a game layer that any syllabus drops into.

**"What does the AI actually do?"**
Three things, all structured, none of them a chatbot: it reads the teacher's PDF
into a concept graph with a prerequisite DAG mapped to syllabus outcomes; it
classifies each wrong answer into that document's own misconception taxonomy — a
constrained enum, so it cannot invent a label; and it scaffolds with a question
instead of an answer. The classification is what makes 45 students aggregatable
into one heatmap.

**"How do I know it didn't hallucinate the questions?"**
Every question carries the page and passage it came from, using Claude's document
citations. Hover any question to see the teacher's own text.

**"Why Singapore MOE?"**
Because it's a published national syllabus, so our content is checkable, and
Singapore Maths is taught internationally. US standards vary district by district
with no clean published spec — that's a data problem, not a product one, and we
weren't going to fake it in 7 hours.

**"Who pays for this?"**
Parents first, as after-school practice — the level ladder is built for exactly
that buyer, the parent who wants to see their child climb ahead of their grade.
Schools are the slower, stickier second motion. We're not pitching a business
today; we're proving the loop works.

---

**"Where does this go next?"** *(have this ready — judges always ask)*
Ingestion is decoupled from the world, so anything that describes a topic can
fill it. Today that's three paths: a PDF, pasted lesson text, or just a topic
from the syllabus. Next is any server-rendered source page, with the same
page-level provenance. A syllabus is the container; the game is the product.

**Do not say "paste a Khan Academy link."** We checked: Khan Academy sits behind
a bot challenge and is JavaScript-rendered, and Claude's web fetch tool doesn't
read JS-rendered pages. It would take a headless-browser scraper to get in.
If a judge asks specifically, say that — knowing exactly why something doesn't
work reads as competence. Claiming it works and getting caught does not.

---

## Known limits — say these before a judge finds them

Honesty scores better than polish here, and every one of these was a deliberate
trade to ship in 7 hours:

- One room, one worksheet at a time; state is in memory and dies on restart.
- One syllabus system, one subject, one topic. The container is real; the library
  is not stocked.
- Misconception taxonomy is generated per document and unvalidated by a teacher —
  a real deployment needs teacher review before it drives instruction.
- Leitner 3-box, not a full FSRS/SM-2 scheduler. Right timescale for a single
  session, too coarse for weeks.
- Cohort numbers in the heatmap are seeded for the demo; the pipeline behind them
  is real and per-event.
- No accessibility work. A keyboard-and-mouse 3D world excludes students, and a
  real version needs the 2.5D mode as a first-class option, not a fallback.
