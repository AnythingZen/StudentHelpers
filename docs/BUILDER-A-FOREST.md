# BUILDER A — THE FOREST

**You own everything the student sees.** Heaviest lift, give this to the
strongest graphics person. If your segment doesn't render, there is no demo —
which is why you have a mandatory fallback at 2:30.

**Read `docs/CONTRACT.md` first.** You code against `mockWorld.json` from
minute 15 and you never wait on Builder B.

---

## Your stack

```bash
npm create vite@latest client -- --template vanilla-ts
cd client && npm i three@0.186.0 && npm i -D @types/three@0.186.0
```

Import addons like this — **verified** against the 0.186.0 exports map:

```ts
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
```

Not `three/examples/jsm/...`. That path works but `three/addons/*` is the
supported alias and needs no Vite config.

---

## Your files

```
client/
  index.html
  src/
    main.ts          scene bootstrap, render loop
    scene.ts         ground, sky, fog, lights
    tree.ts          buildTree(state, seed) -> THREE.Group
    layout.ts        THE LAYOUT FUNCTION — see below, it's yours
    player.ts        PointerLockControls + WASD
    proximity.ts     distance check -> which tree am I at
    questionCard.ts  the answer overlay (choice + recall)
    api.ts           poll GET /api/state, POST /api/answer
    state.ts         local mirror of the World object
```

---

## Trees from primitives. Do not import models.

40 lines and it reads as a stylised forest:

- trunk: `CylinderGeometry` — brown, slightly tapered
- foliage: 2–3 stacked `ConeGeometry`, each narrower and higher
- per-tree deterministic jitter from a seed (the tree id): scale 0.8–1.3,
  Y-rotation, hue shift ±8% on the green

`MeshLambertMaterial` is enough. One `DirectionalLight` + one `AmbientLight`.
`flatShading: true` gives you the blocky look for free.

### Skins — one lookup table, not a second world

There is **one world type: a forest.** Do not build a second biome. What varies
is a constants table keyed off `world.syllabus.subject` — ground and foliage
palette, fog colour and density, ambient track, trunk and canopy silhouette:

| Subject | Skin |
|---|---|
| Mathematics | cool birch — pale trunks, blue-grey fog, crisp light |
| English | warm autumn oak — amber canopy, golden haze |

Same geometry, same code path, different constants. ~15 minutes, and it reads as
a different world in three seconds. Both fixtures are committed —
`mockWorld.json` (Maths, Primary 5) and `mockWorldReading.json` (English,
Primary 3) — so you can check both skins render before B's pipeline is live.

**Asset loading is a 90-minute sink for zero judge points** — scaling,
licensing, material debugging. There are `.glb` files available if you get
ahead; that is an **hour-5 stretch behind a flag**, never on the critical path.

### The four visual states — this is your most important work

| State | Look |
|---|---|
| `healthy` | full green canopy, upright |
| `withered` | grey-brown, cones shrunk to ~40%, tilted, leaves on the ground |
| `sapling` | small bright-green single cone, gentle bob |
| `regrown` | full canopy + a brief glow/scale-pop when it transitions |

The wither and the regrow are the two moments the whole demo turns on. Spend
your polish hour here, not on the sky.

---

## `layout.ts` — you own this, B does not

B returns concepts and trees with **no positions**. You assign them. Signature:

```ts
export function layout(world: World): World   // fills concept.centre and tree.pos
```

Rules:
- Each concept is a **grove**: a cluster of its trees within ~8 units of `centre`
- Groves sit along a path running down −Z. The player spawns at `[0,0,10]`
- **Bloom order by depth**: `remember` groves nearest the entrance, then
  `understand`, then `apply` deeper in. Walking deeper = climbing Bloom's.
- **Interleave**: do not put all of one concept's trees consecutively along the
  path. Mixed order beats blocked order (Rohrer & Taylor 2007 — it's on our
  citations slide, so make the code actually do it).
- **Locked groves** (`prerequisites` unsatisfied, see CONTRACT) render dark,
  desaturated, with a low fog wall, and the proximity trigger ignores them.
- **The level-ladder grove** — exactly one concept has `level` above the world's
  own (Primary 6 in a Primary 5 world). Put it deepest, behind a visible gate,
  and make it look like a reward: taller trees, warmer light, visible from the
  path so the student wants it. When its prerequisites clear, the gate opens and
  you fire a **LEVEL UP · Primary 6 Fractions unlocked** banner.
  This is a demo beat the pitch leans on — a student climbing above their own
  grade. Make the banner big and give it a sound.
- `placeSapling(world, parentTreeId)` → a position further down the path,
  roughly 90 seconds of walking ahead of the player's current spot.
- `/api/next-session` re-layout: box-1 and box-2 trees move **near the entrance**.

Export `layout` and `placeSapling` cleanly — C imports them server-side so
positions are computed once and shared. Keep the file free of `three` imports
so it runs in Node.

---

## Movement and the avatar — THIRD PERSON. Decide at minute 30.

`PointerLockControls` for mouse-look, WASD to move, click-to-capture. But the
camera sits **behind and slightly above a visible avatar**, not in the player's
head.

This is the one decision on the whole list that is expensive to change later,
because it is camera plus controls. **Make it at minute 30 and do not revisit.**
A visible blocky avatar is the strongest single signal that this is a game and
not a web form — more than pets, bars or cosmetics.

How, cheaply: keep the controls object as the logical player position, put the
avatar `Group` at that position, face it along the look vector, and place the
camera at `position - lookDir * 6 + up * 2.5`. Lerp the camera toward that target
each frame so it trails rather than snaps.

The avatar is primitives: box torso, box head, four cylinder limbs, a walk bob
driven by a sine of distance travelled. **No rig, no animation library, no
imported model.** 30 minutes, and it changes how the whole thing reads.

Clamp the player to a square. **No collisions, no physics** — walking through
trunks is invisible in a 3-minute demo and collision costs you an hour.

Add Shift-to-sprint. You will thank yourself during rehearsal when you have to
cross the forest forty times.

## The game layer — hour 5, in this order, each one droppable

Read the game-layer section of `CONTRACT.md` for the shared definitions. Yours:

**1. NPCs (~25 min).** One blocky NPC per grove with a nameplate — **Professor
Byte**. Same primitives as the avatar, different palette. He idles, turns to
face you when you are near, and **never follows you.** The scaffold hint comes
out of a world-space speech bubble above him instead of a card. Same API text —
it just comes from a character's mouth now. This is what makes the AI visible as
an agent rather than a text box.

**2. The three bars (~20 min).** HUD overlay, stacked, from `/api/state`:

```
XP         ███████████░░  grey    — grows fast, means least
MASTERY    █████████░░░░  bright  — the real thing
RETENTION  ███████░░░░░░  bright  — a proxy, see CONTRACT
```

XP must look *less* important than the other two. The pitch line is "the game
rewards the second bar", so the UI has to earn it.

**3. Quest copy (~10 min, zero code).** Never show "Question 4 of 27". Use the
quest table in `CONTRACT.md`: *Quest accepted: the Fraction Bridge* · *⚠️ The
Fraction Bridge is unstable* · *🔨 Bridge Repair +1* · *🏆 FRACTION MASTER* ·
*⚔️ Memory Quest available* · *🏰 NEW AREA UNLOCKED*. Pure text, biggest
feel-per-minute on the whole list.

**4. The fox (~15 min).** One companion that trots near the avatar. Before any
answer it asks **"How sure are you?"** — low / medium / high. Send it with the
answer. That is metacognitive calibration, a real Track 3 mechanic. One pet with
a job beats four pets with cosmetics. **No owl, no turtle, no octopus.**

**Never build:** avatar cosmetics, emotes, world decorations, badge shelves,
multiplayer, a second biome.

**The loop comes first.** If 3:30–5:00 has not closed wither → diagnosis →
sapling → regrow, you do not start the game layer. A walking simulator with
beautiful bars loses to an ugly working loop.

---

## Proximity + question card

Every frame, find the nearest unlocked tree within **3 units**. Show a soft
prompt ("Press E"). On E, open the card and release pointer lock.

The card renders from the tree:

- `kind: 'choice'` → the question + 4 clickable choices
- `kind: 'recall'` → the question + a text input and a submit button.
  ~25% of trees are recall. Recognition is not retrieval — this is what makes
  the Roediger & Karpicke citation honest.
- `kind: 'teach'` → the question + a **larger** textarea. Frame it as the sapling
  asking to be taught: *"Explain it to me and I'll grow."* Same submit path as
  recall. Show `tree.rubric[]` as soft checkmarks that tick as the grader comes
  back. This is the one card that should feel different from a quiz — give it
  room, and animate the sapling growing into a full tree on success.
  **Build this at 4:30**, after the main loop closes. It is droppable.
- If `tree.citation` exists, show a small `📄 p.{page}` chip. Hovering shows the
  quote from the teacher's own worksheet. **Do not skip this** — it's the
  answer to "did the AI make this up?"

`POST /api/answer` and render the reply:

- `correct: true` → card closes, tree animates to `healthy`/`regrown`
- `correct: false` → the tree withers **in view**, and the card shows
  `scaffoldHint` as the tree "speaking". It is a question, never an answer.
  Then a "Try again" button. No score, no red X, no "Wrong!".

Then a toast when `saplingId` comes back: *"A sapling of {concept} has taken
root further along the path."*

---

## Checkpoints

| Time | Must be true |
|---|---|
| 0:30 | Vite scaffold pushed, three.js importing, grey scene renders. **Third-person camera decided and stubbed.** |
| 1:15 | Ground + sky + fog, WASD + mouse look, avatar visible from behind |
| 2:00 | Forest built from `mockWorld.json`, groves visibly clustered |
| **2:30** | **GO/NO-GO — can you walk around a forest built from the mock?** |
| 3:00 | Proximity trigger + question card, wired to the mock |
| 3:30 | Rendering a **real** generated world from `/api/state` |
| 4:30 | Wither + sapling + regrow all animating off real `/api/answer` |
| 5:00 | Locked groves render dark and refuse entry |
| 5:00–6:00 | Game layer in order: NPCs → three bars → quest copy → fox |
| 6:00 | Polish frozen |

### Your fallback is not optional

**If at 2:30 the 3D scene cannot render the mock world, you stop and drop to
2.5D** — a top-down orthographic camera, trees as sprites or flat cones,
arrow-key movement. Same contract, same everything else. The team still ships.

Call it yourself. Nobody will be annoyed; they'll be relieved. A 2.5D forest
that works beats a 3D forest that doesn't, and the judges never see your
`camera` config.

---

## Do not touch

`server/**`, any prompt, anything with an API key. You never need
`ANTHROPIC_API_KEY`. If you find yourself wanting it, you're doing B's job.
