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
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
```

`CSS2DRenderer` is **verified** in 0.186.0. It pins real HTML to world positions,
so answer-stone labels, nameplates and speech bubbles are crisp text with CSS,
not text textures. It is the reason stones and bubbles are cheap.

Not `three/examples/jsm/...`. That path works but `three/addons/*` is the
supported alias and needs no Vite config.

---

## Your files

```
client/
  index.html
  src/
    main.ts          scene bootstrap, render loop, both renderers
    scene.ts         ground, sky, fog, lights, skins
    tree.ts          buildTree(state, seed) -> THREE.Group
    stones.ts        answer stones: rise, label, stand-to-confirm ring
    bridge.ts        broken bridges, plank placement from concept health
    avatar.ts        blocky humanoid — used for you, NPCs, players, classmates
    players.ts       poll /api/presence at 500ms, lerp other avatars
    layout.ts        THE LAYOUT FUNCTION — see below, it's yours
    player.ts        PointerLockControls + WASD + third-person camera
    proximity.ts     which tree / stone / classmate am I at
    speech.ts        world-space speech bubbles with optional text input
    api.ts           poll GET /api/state, POST /api/answer
    state.ts         local mirror of World + subscribe(fn) event bus
```

**`hud.ts` and `hud.css` are C's, not yours.** You emit events from `state.ts`
(see the client seam in `CONTRACT.md`); C renders bars, toasts, banners and the
fox prompt. You never write HUD HTML, and C never touches the scene.

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
- **Locked groves sit across a gap with a broken bridge** — not a fog wall. See
  `bridge.ts` below. The gate is a place you walk to, and it fills plank by plank
  as the prerequisite concepts get healthier.
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

## Interactive first — this is the loop now, not polish

Judges are scoring **interactive**. The earlier plan answered every question
through a 2D card that stopped the game. That is gone. Read the
"Interactive first" section of `CONTRACT.md`; here is your half.

### 1. Answer stones — you answer by walking (core, ~35 min)

Proximity: nearest unlocked `choice` tree within **3 units** → soft prompt
"Press E to accept the quest."

On E: four stones **rise out of the ground** in a shallow arc in front of the
tree over ~0.4s. Each gets a `CSS2DObject` label with its answer. Pointer lock
**stays on**. You walk into one.

- Standing on a stone fills a ring over **~0.6s**. Step off and it drains. This
  is the thing that stops accidental answers when you're just walking past —
  do not skip it.
- Ring full → emit `needConfidence` (C's fox prompt resolves it) → POST the
  answer with the confidence.
- Correct: stones sink, tree pulses, a **plank flies to the nearest bridge**.
- Wrong: stones sink, **the tree withers in view**, a plank knocks loose, and
  Professor Byte walks over.

`recall` trees use the same stones idea with one stone and a speech bubble input.
`teach` trees are the classmate interaction, below.

**Fallback at 3:30:** if stones aren't solid, the overlay card is the answer UI.
Same POST, same results — you only lose the physicality.

### 2. Bridges — the gate is a place (core, ~30 min)

Every locked grove is across a gap. The bridge has `N` plank slots; filled planks
= `round(N × min(prereqHealth))`. Recompute on every state event:
- plank gained → drop it in from above with a thunk
- plank lost → it tilts and falls into the gap

When every slot is full the grove unlocks and you **walk across**. The level
ladder grove is just the final, longest bridge — when it completes, emit
`levelUp`.

**Fallback:** a bridge that is simply broken or whole. No per-plank animation.

### 3. Other people in the forest (core, ~25 min)

`players.ts` polls `GET /api/presence/:worldId` every **500ms** and renders each
entry with the same `avatar.ts` mesh plus a nameplate. **Lerp** toward the latest
position each frame, or they'll teleport. POST your own position on the same
cadence.

You don't care which players are real and which are seeded — it's one list.
Open a second browser in the same room and a real player walks in.

### 4. Help a classmate — teach trees (core, ~20 min)

A `teach` tree has a seeded classmate, **Mia**, standing at it with a
"stuck" idle (slumped, occasional head shake). Proximity prompt: *"Mia is stuck
on {questName}. Help her."* Her speech bubble opens with a text input — the
typing pause is deliberate; it's the reflective moment. Submit →
`gradeExplanation`. Pass → Mia straightens, jumps, her tree grows. Rubric points
tick off in the bubble as the result lands.

### Hour 5 — polish, cut from the back

1. **Professor Byte walks over** when a tree withers, turns to you, speaks the
   scaffold in a bubble, then stays in his grove. (~20 min)
2. **The fox mesh** trotting at your heel. The prompt itself is C's HUD. (~10 min)
3. **Skins** — the maths/English lookup table. (~15 min)

**Never:** avatar cosmetics, emotes, decorations, chat, collisions between
players, a second biome.

---

## Checkpoints

| Time | Must be true |
|---|---|
| 0:30 | Vite scaffold pushed, three.js importing, grey scene renders. **Third-person camera decided and stubbed.** |
| 1:15 | Ground + sky + fog, WASD + mouse look, avatar visible from behind |
| 2:00 | Forest built from `mockWorld.json`, groves visibly clustered |
| **2:30** | **GO/NO-GO — can you walk around a forest built from the mock?** |
| 3:00 | **Answer stones** rising and submitting against the mock, with the stand-to-confirm ring |
| 3:30 | Rendering a **real** generated world from `/api/state` |
| 4:30 | Wither + sapling + regrow all animating off real `/api/answer` |
| 4:15 | **Bridges** filling and losing planks off real state |
| 4:45 | **Other players** lerping from `/api/presence`; **Mia** teach interaction working |
| 5:00 | Loop closed *interactively*: walk into a stone → wither → plank lost → sapling → repair → cross |
| 5:00–6:00 | Polish, cut from the back: Byte walks over → fox mesh → skins |
| 6:00 | Polish frozen |

### Your fallbacks are not optional

Two of them now. **At 3:30, if answer stones aren't reliable, the overlay card
becomes the answer UI** — same POST, same results, you lose only the physicality.
And the one below.

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
