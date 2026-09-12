// Builder C's backup student client. Join a room, walk the forest, answer by
// walking onto stones, help Mia, watch bridges rebuild.
import * as THREE from 'three';
import type { AnswerResponse, Concept, Tree, World } from '../../server/src/contract';
import { Avatar, makeFox } from './avatar';
import { askConfidence, banner, Bubble, setBars, setPrompt, toast } from './hud';
import { api } from './net';
import { isLocked } from './rules';
import { AnswerStones } from './stones';
import { ForestScene } from './world3d';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const INTERACT_RANGE = 3.4;
const WALK = 6, SPRINT = 11;

const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};
// Per tab, so two tabs in the same room are two real players.
const playerId = store.get('mg-player') ?? `p-${Math.random().toString(36).slice(2, 10)}`;
store.set('mg-player', playerId);

// ---------------- join screen ----------------
const params = new URLSearchParams(location.search);
$<HTMLInputElement>('join-room').value = (params.get('room') ?? 'OAK7').toUpperCase();
$<HTMLInputElement>('join-name').value = store.get('mg-name') ?? '';
api.worlds().then(({ worlds }) => {
  for (const w of worlds.filter(x => x.status === 'ready')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${w.worldId} · ${w.subject}`;
    b.onclick = () => ($<HTMLInputElement>('join-room').value = w.worldId);
    $('rooms').append(b);
  }
}).catch(() => ($('join-error').textContent = "Can't reach the server — is it running on :3001?"));

async function join(room: string, name: string): Promise<void> {
  try {
    const first = await api.state(room);
    store.set('mg-name', name);
    $('join').hidden = true;
    start(room, name, first.world, first);
  } catch (err) {
    $('join').hidden = false;
    $('join-error').textContent = (err as Error).message;
  }
}

$<HTMLFormElement>('join').addEventListener('submit', e => {
  e.preventDefault();
  void join($<HTMLInputElement>('join-room').value.trim().toUpperCase(), $<HTMLInputElement>('join-name').value.trim() || 'Student');
});

// ?room=OAK7&name=Alex drops you straight into the 3D forest — no form. Handy for
// the demo laptop, a second player's tab, and automated screenshots.
if (params.get('name')) {
  $('join').hidden = true;
  void join((params.get('room') ?? 'OAK7').toUpperCase(), params.get('name')!.slice(0, 24));
}

// ---------------- the game ----------------
function start(room: string, name: string, initial: World<Tree>, bars: { xp: number; mastery: number; retention: number }): void {
  const forest = new ForestScene($('stage'));
  const { scene, camera, renderer } = forest;
  const canvas = renderer.domElement;
  const stones = new AnswerStones(scene);
  const bubble = new Bubble(scene);
  const me = new Avatar(0x2c6fa8);
  scene.add(me.group);
  // A tiny fox at your heel — its job is the confidence prompt.
  const fox = makeFox();
  scene.add(fox);

  let world = initial;
  const pos = new THREE.Vector3(0, 0, 12);
  let yaw = 0, pitch = 0.15;
  let busy = false;                       // an answer is in flight or a prompt is open
  let offlineToastAt = 0;
  const keys = new Set<string>();
  let autoTarget: THREE.Vector3 | null = null;   // ?debug=1 walkTo(), so recordings show real walking

  // ?debug=1 exposes a small hook for the automated walkthrough recorder
  // (scripts/walkthrough). Off by default; nothing here bypasses the server.
  if (params.get('debug') === '1') {
    Object.assign(window, {
      __game: {
        walkTo: (x: number, z: number) => { autoTarget = new THREE.Vector3(x, 0, z); },
        arrived: () => autoTarget === null,
        tree: (id: string) => world.trees.find(t => t.id === id) ?? null,
        stones: () => stones.positions(),
        player: () => ({ x: pos.x, z: pos.z }),
        // Turn to face a point, so a recording's camera shows what matters (the tree, Mia).
        face: (x: number, z: number) => { yaw = Math.atan2(-(x - pos.x), -(z - pos.z)); },
        busy: () => busy,
      },
    });
  }

  $('hud').hidden = false;
  $('hud-room').textContent = room;
  $('hud-subject').textContent = world.subject;
  setBars(bars);
  forest.sync(world);
  toast(`Welcome, ${name}. Walk to a tree and press E.`, 'good', 5000);

  const conceptOf = (t: Tree): Concept | undefined => world.concepts.find(c => c.id === t.conceptId);
  const typing = () => document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
  const locked = () => document.pointerLockElement === canvas;

  // ---- input
  window.addEventListener('keydown', e => {
    if (typing()) return;
    keys.add(e.code);
    if (e.code === 'KeyE') interact();
    if (e.code === 'Escape') { stones.clear(); bubble.close(); busy = false; }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('click', () => { if (!bubble.open) canvas.requestPointerLock(); });
  document.addEventListener('mousemove', e => {
    if (!locked()) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-0.25, Math.min(0.7, pitch + e.movementY * 0.002));
  });

  // ---- interaction
  function nearestTree(): { tree: Tree; locked: boolean } | null {
    let best: { tree: Tree; locked: boolean; d: number } | null = null;
    for (const t of world.trees) {
      const d = Math.hypot(t.pos[0] - pos.x, t.pos[2] - pos.z);
      if (d <= INTERACT_RANGE && (!best || d < best.d)) best = { tree: t, locked: isLocked(world, t.conceptId), d };
    }
    return best;
  }

  async function interact(): Promise<void> {
    if (busy || stones.open) return;
    const near = nearestTree();
    if (!near || near.locked) return;
    const { tree } = near;
    const quest = conceptOf(tree)?.questName ?? 'the grove';
    if (tree.kind === 'choice') {
      stones.show(tree, quest, pos);
      toast(`Quest accepted: ${quest}`);
      return;
    }
    busy = true;
    document.exitPointerLock();
    if (tree.kind === 'recall') {
      const text = await bubble.ask(new THREE.Vector3(tree.pos[0], 4.5, tree.pos[2]), 'From memory', tree.question, 'Type your answer…');
      if (text) await submit(tree, text); else busy = false;
      return;
    }
    // teach — Mia is stuck here, and you explain it to her
    const mia = forest.playerPos('seed-mia') ?? new THREE.Vector3(tree.pos[0], 0, tree.pos[2]);
    const text = await bubble.ask(mia.clone().setY(3.4), 'Mia', `I'm stuck on ${quest}… ${tree.question}`, 'Explain it to Mia…');
    if (text) await submit(tree, text); else busy = false;
  }

  async function submit(tree: Tree, response: number | string, confidence?: 'low' | 'medium' | 'high'): Promise<void> {
    busy = true;
    try {
      const res = await api.answer({ worldId: room, treeId: tree.id, response, confidence, playerId });
      react(tree, res);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'bad');
      stones.rearm();
    } finally {
      busy = false;
    }
  }

  function react(tree: Tree, res: AnswerResponse): void {
    const concept = conceptOf(tree);
    const quest = concept?.questName ?? 'the grove';
    const now = performance.now();
    setBars(res);

    if (tree.kind === 'teach') {
      if (res.explanation) bubble.showRubric(res.explanation.hit, res.explanation.missing, res.explanation.encouragement, 'Mia');
      if (res.correct) { forest.cheer('seed-mia', now); toast('💬 You helped Mia understand it. +25 XP', 'good'); }
      return;
    }
    if (res.correct) {
      stones.sink(now);
      bubble.close();
      const feedsABridge = world.concepts.some(c => c.prerequisites.includes(tree.conceptId));
      toast(res.treeState === 'regrown' ? `🌳 The tree regrows — ${quest} repaired` : feedsABridge ? '🔨 Bridge Repair +1' : '✓ Correct', 'good');
      return;
    }
    // Wrong: the tree withers in view and Professor Byte asks a question back.
    stones.rearm();
    const lead = res.calibration === 'overconfident' ? 'You were very sure about that one. ' : '';
    const hint = res.scaffoldHint ?? 'What is the question really asking you?';
    bubble.say(new THREE.Vector3(tree.pos[0], 5.2, tree.pos[2]), 'Professor Byte', lead + hint, 9000);
    toast(`⚠️ ${quest} is unstable`, 'bad');
    if (res.saplingId) toast(`🌱 A sapling of ${concept?.name ?? 'this idea'} took root further up the path`, '', 4500);
  }

  async function refresh(): Promise<void> {
    const before = world;
    const s = await api.state(room);
    world = s.world;
    setBars(s);
    for (const { conceptId, change } of forest.sync(world)) {
      const c = world.concepts.find(x => x.id === conceptId);
      if (change < 0 && c) toast(`🪵 A plank fell from the bridge to ${c.questName}`, 'bad');
    }
    for (const c of world.concepts) {
      if (isLocked(before, c.id) && !isLocked(world, c.id)) {
        if (c.level !== world.syllabus.level) banner(`🏰 NEW AREA UNLOCKED · ${c.level} ${c.name}`, 4500);
        else toast(`🌉 The bridge to ${c.questName} is complete — walk across`, 'good', 4500);
      }
    }
  }

  // ---- polling: state every 2s, presence every 500ms
  const offline = () => {
    if (performance.now() - offlineToastAt > 10_000) { toast('Connection lost — retrying…', 'bad'); offlineToastAt = performance.now(); }
  };
  setInterval(() => { refresh().catch(offline); }, 2000);
  setInterval(() => {
    api.post(room, { playerId, name, pos: [pos.x, 0, pos.z], yaw: yaw + Math.PI }).catch(() => {});
    api.presence(room, playerId).then(({ players }) => forest.syncPlayers(players)).catch(() => {});
  }, 500);

  // ---- frame loop
  const timer = new THREE.Timer();
  timer.connect(document);
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), camTarget = new THREE.Vector3();

  renderer.setAnimationLoop(ts => {
    timer.update(ts);
    const dt = Math.min(0.05, timer.getDelta());
    const t = timer.getElapsed();
    const now = performance.now();

    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(-forward.z, 0, forward.x);
    let moveX = 0, moveZ = 0;
    if (!typing() && !busy) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) { moveX += forward.x; moveZ += forward.z; }
      if (keys.has('KeyS') || keys.has('ArrowDown')) { moveX -= forward.x; moveZ -= forward.z; }
      if (keys.has('KeyD') || keys.has('ArrowRight')) { moveX += right.x; moveZ += right.z; }
      if (keys.has('KeyA') || keys.has('ArrowLeft')) { moveX -= right.x; moveZ -= right.z; }
    }
    if (autoTarget && moveX === 0 && moveZ === 0) {
      const dx = autoTarget.x - pos.x, dz = autoTarget.z - pos.z;
      if (Math.hypot(dx, dz) < 0.25) autoTarget = null;
      else {
        moveX = dx; moveZ = dz;
        // Turn smoothly toward where we're walking, so the camera follows naturally.
        const want = Math.atan2(-dx, -dz);
        const turn = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
        yaw += turn * Math.min(1, dt * 6);
      }
    }
    const len = Math.hypot(moveX, moveZ);
    const speed = len > 0 ? (keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT : WALK) : 0;
    if (len > 0) {
      const step = Math.min(speed * dt, autoTarget ? Math.hypot(autoTarget.x - pos.x, autoTarget.z - pos.z) : Infinity);
      pos.x += (moveX / len) * step; pos.z += (moveZ / len) * step;
    }
    pos.x = Math.max(-48, Math.min(48, pos.x));
    pos.z = Math.max(-140, Math.min(16, pos.z));

    me.group.position.copy(pos);
    me.group.rotation.y = yaw + Math.PI;   // the model faces +Z
    me.animate(dt, speed);
    fox.position.set(pos.x + right.x * 1.2 - forward.x * 0.4, Math.abs(Math.sin(t * 9)) * (speed ? 0.1 : 0), pos.z + right.z * 1.2 - forward.z * 0.4);
    fox.rotation.y = yaw + Math.PI;

    // Third person: the camera trails behind and slightly above the avatar.
    camTarget.set(pos.x - forward.x * 7, 3.2 + pitch * 4, pos.z - forward.z * 7);
    camera.position.lerp(camTarget, 1 - Math.exp(-dt * 8));
    camera.lookAt(pos.x + forward.x * 2, 1.8, pos.z + forward.z * 2);

    // Walk onto a stone to answer; the fox asks how sure you are first.
    const chosen = stones.update(dt, pos, now);
    if (chosen !== null && !busy) {
      const tree = world.trees.find(x => x.id === stones.treeId);
      // Not awaited: the frame loop must keep rendering while the fox waits for an answer.
      if (tree) { busy = true; void askConfidence().then(confidence => submit(tree, chosen, confidence)); }
    }

    // Prompt for whatever is in reach.
    const near = nearestTree();
    if (stones.open || bubble.open || busy || !near) setPrompt(null);
    else {
      const quest = conceptOf(near.tree)?.questName ?? 'the grove';
      setPrompt(near.locked ? `🔒 ${quest} is locked — rebuild the bridge first`
        : near.tree.kind === 'teach' ? `E · Mia is stuck on ${quest}. Help her.`
        : near.tree.kind === 'recall' ? `E · Answer from memory — ${quest}`
        : `E · Quest: ${quest}`);
    }
    $('look-hint').hidden = locked() || bubble.open || params.get('debug') === '1';

    forest.update(dt, t, now);
    forest.render();
  });
}
