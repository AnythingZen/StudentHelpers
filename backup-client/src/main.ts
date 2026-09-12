// Builder C's student client. Join a room, follow your missions through the
// forest, answer by walking onto stones, help Mia, reflect, unlock the next grove.
import * as THREE from 'three';
import type { AnswerResponse, Concept, Tree, World } from '../../server/src/contract';
import { Avatar, makeFox, makeProfessorByte } from './avatar';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { askConfidence, banner, Bubble, calibrationLine, setBars, setPrompt, toast } from './hud';
import { askReflection, beaconTree, judgmentFeedback, renderMissionPanel } from './missions';
import { api, type PlayerProgress, type StateResponse } from './net';
import { openCreateWorld, openWorldList } from './worldMenu';
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
  for (const w of worlds.filter(x => x.status === 'ready').slice(-6)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${w.worldId} · ${w.level} ${w.topic}`;
    b.onclick = () => ($<HTMLInputElement>('join-room').value = w.worldId);
    $('rooms').append(b);
  }
}).catch(() => ($('join-error').textContent = "Can't reach the server — is it running on :3001?"));

document.querySelectorAll<HTMLButtonElement>('.role button').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.role button').forEach(b => b.classList.toggle('active', b === tab));
    document.querySelectorAll<HTMLElement>('[data-role]').forEach(el => (el.hidden = el.dataset.role !== tab.dataset.for));
  };
});

async function join(room: string, name: string): Promise<void> {
  try {
    const first = await api.state(room, playerId);
    store.set('mg-name', name);
    $('join').hidden = true;
    start(room, name, first);
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
function start(room: string, name: string, first: StateResponse): void {
  const initial: World<Tree> = first.world;
  let me: PlayerProgress | undefined = first.me;
  const forest = new ForestScene($('stage'));
  const { scene, camera, renderer } = forest;
  const canvas = renderer.domElement;
  const stones = new AnswerStones(scene);
  const bubble = new Bubble(scene);
  const avatar = new Avatar(0x2c6fa8);
  scene.add(avatar.group);
  // A tiny fox at your heel — its job is the confidence prompt.
  const fox = makeFox();
  scene.add(fox);
  const byte = makeProfessorByte();
  const byteTag = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label name-tag', textContent: 'Professor Byte' }));
  byteTag.position.y = 3.2;
  byte.group.add(byteTag);
  byte.group.visible = false;
  byteTag.visible = false;
  scene.add(byte.group);
  let byteHideAt = 0;
  // Stand him beside the tree, turned toward the student.
  const summonByte = (tree: Tree) => {
    const tx = tree.pos[0], tz = tree.pos[2];
    const away = new THREE.Vector3(pos.x - tx, 0, pos.z - tz).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);
    byte.group.position.set(tx + side.x * 1.9 + away.x * 0.8, 0, tz + side.z * 1.9 + away.z * 0.8);
    byte.group.rotation.y = Math.atan2(pos.x - byte.group.position.x, pos.z - byte.group.position.z);
    byte.group.visible = true;
    byteTag.visible = true;
    byteHideAt = performance.now() + 9500;
    return byte.group.position.clone().setY(3.9);
  };

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
        me: () => me,
        beacon: () => beaconTree(world, me!, { x: pos.x, z: pos.z })?.id ?? null,
      },
    });
  }

  $('hud').hidden = false;
  $('corner').hidden = false;
  $('hud-room').textContent = room;
  $('hud-subject').textContent = world.subject;
  setBars(first);
  forest.sync(world, me);
  $<HTMLButtonElement>('new-btn').onclick = () => openCreateWorld(name);
  $<HTMLButtonElement>('world-btn').onclick = () => openWorldList(room, name);

  const lockedFor = (conceptId: string) =>
    me ? !(me.missions.find(m => m.conceptId === conceptId)?.unlocked ?? true) : isLocked(world, conceptId);

  // ---- missions and reflection
  const prompted = new Set<string>();     // auto-open each mission's reflection once
  const drawMissions = () => { if (me) renderMissionPanel($('mission'), me, m => void reflectOn(m.conceptId)); };
  async function reflectOn(conceptId: string): Promise<void> {
    const mission = me?.missions.find(m => m.conceptId === conceptId);
    if (!mission || !mission.ready || mission.complete || busy) return;
    busy = true;
    prompted.add(conceptId);
    stones.clear(); bubble.close();
    document.exitPointerLock();
    try {
      const answer = await askReflection(mission);
      if (!answer) { toast('Keep practising — finish the mission from the panel when you\'re ready (R).', '', 4500); return; }
      const before = me;
      const res = await api.reflect({ worldId: room, playerId, name, conceptId, ...answer });
      toast(`🪞 ${judgmentFeedback(answer.rating, res.accuracy)}`, 'good', 7000);
      applyState(res, before);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }
  drawMissions();

  // First time in: three lines on how to play, then out of the way.
  if (params.get('tutorial') !== '0' && !store.get('mg-tutorial')) {
    $('tutorial').hidden = false;
    const close = () => { $('tutorial').hidden = true; store.set('mg-tutorial', '1'); window.removeEventListener('keydown', onKey, true); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey, true);
    $<HTMLButtonElement>('tutorial-go').onclick = close;
  } else {
    toast(`Welcome, ${name}. Follow the glowing beacon to your first tree.`, 'good', 5000);
  }

  const conceptOf = (t: Tree): Concept | undefined => world.concepts.find(c => c.id === t.conceptId);
  const typing = () => document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
  const locked = () => document.pointerLockElement === canvas;

  // ---- input
  window.addEventListener('keydown', e => {
    if (typing()) return;
    keys.add(e.code);
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyR' && me?.current) void reflectOn(me.current);
    if (e.code === 'Space') { e.preventDefault(); if (jumpT === 0) jumpT = 0.0001; }
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
      if (d <= INTERACT_RANGE && (!best || d < best.d)) best = { tree: t, locked: lockedFor(t.conceptId), d };
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
      const cite = tree.citation ? `  📄 p.${tree.citation.page}` : '';
      const text = await bubble.ask(new THREE.Vector3(tree.pos[0], 4.5, tree.pos[2]), 'From memory', `${tree.question}${cite}`, 'Type your answer…');
      // Retrieval first, then the fox asks how sure you are — a prediction made before any feedback.
      if (text) { bubble.close(); await submit(tree, text, await askConfidence()); } else busy = false;
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
      const res = await api.answer({ worldId: room, treeId: tree.id, response, confidence, playerId, name });
      react(tree, res);
      const line = tree.kind === 'teach' ? null : calibrationLine(confidence, res.correct);
      if (line) toast(line, res.correct ? 'good' : '', 5500);
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
    bubble.say(summonByte(tree), 'Professor Byte', lead + hint, 9000);
    toast(`⚠️ ${quest} is unstable`, 'bad');
    if (res.saplingId) toast(`🌱 A sapling of ${concept?.name ?? 'this idea'} took root further up the path`, '', 4500);
  }

  function applyState(s: StateResponse, before: PlayerProgress | undefined): void {
    world = s.world;
    me = s.me;
    setBars(s);
    for (const { conceptId, change } of forest.sync(world, me)) {
      const c = world.concepts.find(x => x.id === conceptId);
      if (change < 0 && c) toast(`🪵 A plank fell from the bridge to ${c.questName}`, 'bad');
    }
    for (const m of me?.missions ?? []) {
      const was = before?.missions.find(x => x.conceptId === m.conceptId);
      if (was && !was.complete && m.complete) banner(`✅ MISSION COMPLETE · ${m.questName}`, 3000);
      if (was && !was.unlocked && m.unlocked) {
        setTimeout(() => {
          if (m.level !== world.syllabus.level) banner(`🏰 NEW AREA UNLOCKED · ${m.level} ${m.name}`, 4500);
          else toast(`🌉 The bridge to ${m.questName} is complete — walk across`, 'good', 5000);
        }, 3100);
      }
    }
    drawMissions();
    // The moment a mission's work is done, ask for the reflection that finishes it.
    const ready = me?.missions.find(m => m.ready && !m.complete && m.unlocked);
    if (ready && !prompted.has(ready.conceptId) && !busy && !stones.open) setTimeout(() => void reflectOn(ready.conceptId), 1800);
  }

  async function refresh(): Promise<void> {
    applyState(await api.state(room, playerId), me);
  }

  // ---- polling: state every 2s, presence every 500ms
  const offline = () => {
    if (performance.now() - offlineToastAt > 10_000) { toast('Connection lost — retrying…', 'bad'); offlineToastAt = performance.now(); }
  };
  setInterval(() => { refresh().catch(offline); }, 2000);
  setInterval(() => {
    api.post(room, { playerId, name, pos: [pos.x, 0, pos.z], yaw: yaw + Math.PI }).catch(() => {});
    api.presence(room, playerId).then(({ players }) => {
      forest.syncPlayers(players);
      const real = players.filter(p => !p.seeded).length + 1;
      $('hud-online').textContent = `👥 ${real} online`;
    }).catch(() => {});
    const target = me && !stones.open ? beaconTree(world, me, { x: pos.x, z: pos.z }) : null;
    forest.setBeacon(target ? [target.pos[0], target.pos[2]] : null);
  }, 500);

  // ---- frame loop
  const timer = new THREE.Timer();
  timer.connect(document);
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let jumpT = 0;                           // seconds into a jump; 0 = on the ground

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

    avatar.group.position.copy(pos);
    if (jumpT > 0) {
      jumpT += dt;
      avatar.group.position.y = Math.max(0, Math.sin((jumpT / 0.55) * Math.PI) * 1.3);
      if (jumpT >= 0.55) jumpT = 0;
    }
    avatar.group.rotation.y = yaw + Math.PI;   // the model faces +Z
    avatar.animate(dt, speed);
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
      setPrompt(near.locked ? `🔒 ${quest} is locked — finish your current mission first`
        : near.tree.kind === 'teach' ? `E · Mia is stuck on ${quest}. Help her.`
        : near.tree.kind === 'recall' ? `E · Answer from memory — ${quest}`
        : `E · Quest: ${quest}`);
    }
    $('look-hint').hidden = locked() || bubble.open || params.get('debug') === '1';

    if (byte.group.visible && now > byteHideAt) { byte.group.visible = false; byteTag.visible = false; }
    if (byte.group.visible) byte.animate(dt, 0);
    forest.update(dt, t, now);
    forest.render();
  });
}
