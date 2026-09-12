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
| 0:30–2:30 | **Parallel slices** | **A:** third-person camera decided at 0:30, then walking a forest built from the mock with a visible avatar. **B:** one real PDF → valid world JSON in the console. **C:** dropdowns + server up + heatmap rendering from the mock. |
| **2:30–3:30** | **Integration #1 — GO/NO-GO** | A real generated world renders in the 3D scene. *If A's scene can't render the mock at 2:30, A drops to 2.5D. C makes that call.* |
| 3:30–5:00 | **The loop closes — interactively** | You answer by **walking into a stone**. Wrong → tree withers → a plank falls from the bridge → sapling ahead → repair → plank returns. **Other players** walk the forest. **Mia** is stuck at a teach tree and you help her. Heatmap updates live. *Stones fall back to the card if not solid by 3:30.* |
| 5:00–6:00 | **Polish** | Cut from the back of this list, never the front: Professor Byte walks over → the fox → Class World bar → **Deploy Quest** → skins → fog and ambient audio. Interactivity is already in the loop by now; this hour is about feel. |
| **6:00–6:30** | **Freeze + record** | Hard code freeze. Full-flow screen capture in hand. |
| 6:30–7:00 | **Rehearse** | Run it out loud three times. Timed. |

### The two non-negotiables

1. **2:30 fallback.** If the 3D scene cannot render `mockWorld.json`, Builder A
   switches to 2.5D top-down immediately. Same contract, same everything else.
   A 2.5D forest that works beats a 3D forest that doesn't.
2. **6:00 backup video.** Recorded, watched back once, and on the presenting
   laptop. Live demos fail. A team that calmly plays a video still wins.

---

## The demo — ~165 seconds. The slot is 3 minutes.

**Judges are scoring interactive.** So the demo should look like someone
*playing*, not someone clicking through a quiz. Nobody touches the mouse to
answer a question in this entire script — you walk.

**0:00 — the hook.**
> "Every AI homework tool helps a student finish tonight's work. We built one
> that finds out what they misunderstood — and makes them walk back to it."

**0:12 — the teacher spawns a world.**
Dropdowns: **Mathematics · Primary 5 · Fractions.** Drop a real P5 worksheet.
The forest plants itself live. Room code: **OAK7**.
> "MOE Singapore syllabus. Imagine any syllabus — we've loaded this one. That's
> her actual worksheet; she authored nothing."

**0:25 — two players walk in.** *(Second browser window, already open.)*
Enter `OAK7` on both. Two blocky avatars, third person, a fox at your heel.
Three classmates are already wandering the forest.
> "It's a shared world. That other avatar is a real second player — and those
> three are classmates working through the same worksheet."

**0:40 — accept a quest.** Walk to a tree, press E:
> **Quest accepted: The Fraction Bridge**

Four stones **rise out of the ground**, each with an answer floating above it.
> *"Which is larger: 3/4 or 5/8?"*

**0:48 — the wrong answer, physically.**
The fox asks: *how sure are you?* → press **3**, high.
**Walk onto the 5/8 stone.** The ring fills. The stones sink — the tree
**withers** — and on the bridge ahead, **a plank tilts and falls into the gap**.
Professor Byte walks over, turns to you:
> *"You were very sure about that one. What would 3/4 look like written in
> eighths?"*

> "It diagnosed the error — comparing numerators — and noticed she was
> confident while wrong. Then it scaffolded. It never gave the answer."

Hover `📄 p.2` — it traces to the teacher's own worksheet.

**1:08 — repair.** Walk onto the right stone. **The plank flies back into the
bridge** with a thunk. *🔨 Bridge Repair +1.* Point at the bars:
> "XP jumped. Mastery barely moved. The game rewards the second bar."

**1:20 — help a classmate.**
A sapling of the same concept has sprouted up the path — and **Mia** is standing
at it, stuck.
> *"Mia is stuck on The Fraction Bridge. Help her."*

Type how you compare unlike fractions into her speech bubble. Rubric points tick.
Mia straightens up, jumps — *"Oh! So you make the bottoms the same first!"* —
and her tree grows.
> "Explaining it to someone else is the strongest thing a learner can do — so we
> put someone in the world who needs you to explain it."

**1:38 — cross.** The bridge is whole. **Walk across it.**
> "Mastery is the only key. You don't unlock the next grove by answering ten
> questions; you unlock it by rebuilding the bridge."

**1:48 — the teacher already knows.**
Teacher console. Hover the amber grove:
> **"11 students think 5/8 is larger than 3/4 — they're comparing numerators."**

> 🏰 **The class is unlocking the Castle Library — 81%**

> "Not a gradebook — a lesson plan. And nobody is ranked against anybody."

**2:00 — Deploy Quest.** Click **Deploy.** Cut back to the forest: five new trees
rise near the entrance, targeting only that misconception.
> "Student game, AI diagnosis, teacher intervention, student mastery — the whole
> circuit, in four seconds."

**2:12 — the climb.** Across the final, longest bridge:
**🏰 NEW AREA UNLOCKED · Primary 6 Fractions.**
> "A Primary 3 child who clears Primary 5 fractions walks into Primary 6.
> Nobody has to promote them."

**2:22 — same engine, different subject.** Cut to **FERN**: English · Primary 3,
warm autumn oak, spawned from a public-domain book URL. Its own heatmap.
> "A book instead of a worksheet. Same engine. The syllabus is the container."

**2:35 — close.**
> "Other tools help a student finish homework tonight. This one knows what
> they'll have forgotten by Thursday."

### Rehearsal note on the second browser

The two-player beat is the most impressive moment in the demo **and** the one
most likely to go wrong live. Open both windows before you start, in the same
room, and check both avatars are visible. If the real second player isn't
showing, **don't mention it** — the three seeded classmates are already walking
around and the line still works: *"It's a shared world."*

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
| **Metacognitive monitoring** — learners are poor judges of their own knowing, and calibration improves learning | Dunlosky & Metcalfe on metacognition | The fox's confidence prompt; a high-confidence wrong answer changes the scaffold |

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
Every question carries the page and passage it came from, and the server checks
that exact quote really appears on that page of the teacher's document before the
world is built. If it can't find it, the citation is dropped rather than shown.
Hover any question to see the teacher's own text.

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

## Future work — not built today

- **An activity backlog for educators.** A running record of what each student
  did in the game — which groves they entered, where they got stuck, which
  misconceptions recurred, what they explained to classmates — so the educator
  can step in and help using that data. The per-event `events[]` log C already
  keeps is exactly the data this would read, so nothing today blocks it.

The stance behind it: **the AI supports educators; it doesn't replace them.** The
game diagnoses and surfaces what's happening; the educator decides what to do
about it.

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
