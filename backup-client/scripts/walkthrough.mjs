// Records the demo walkthrough — and the team's backup video — by driving two real
// Chrome windows (teacher + student) through the whole loop, then stitching the
// recordings into one MP4 with ffmpeg.
//
//   BASE_URL=https://mastery-grove-production.up.railway.app PDF=worksheet.pdf node scripts/walkthrough.mjs
//
// Env: BASE_URL (default http://localhost:3001) · OUT_DIR (default ./walkthrough-out)
//      PDF — worksheet to upload (else "Just a topic") · HEADLESS=1 · SPAWN_WAIT_S (default 300)
// Needs: Google Chrome, and ffmpeg on PATH for the final MP4.
//
// Data-driven, so it works on ANY world the AI generates: it reads the world from
// the server, picks trees by concept and kind, and finds right answers by trying
// stones — it never needs the answer key (which never reaches a browser). Every
// caption is written from what actually happened. If the world is the committed
// sample data rather than AI output, the video and its filename say so.

import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const OUT = resolve(process.env.OUT_DIR ?? 'walkthrough-out');
const PDF = process.env.PDF;
const SPAWN_WAIT_MS = Number(process.env.SPAWN_WAIT_S ?? 300) * 1000;
const SIZE = { width: 1280, height: 720 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async path => (await fetch(`${BASE}${path}`)).json();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Concept names of the committed sample worlds — used only to detect, and label, a
// recording that didn't actually use the AI.
const SAMPLE_CONCEPTS = new Set(['mockWorld.json', 'mockWorldReading.json'].flatMap(f =>
  JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')).concepts.map(c => c.name)));

// ---------------- recording bookkeeping ----------------
const segments = [];                                         // { who, start, end, speed }
const clock = {};
const now = who => (Date.now() - clock[who]) / 1000;

async function caption(page, title, sub = '') {
  await page.evaluate(([t, s]) => {
    let el = document.getElementById('__caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__caption';
      Object.assign(el.style, {
        position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: '99999',
        background: 'rgba(12,22,16,.9)', color: '#fff', padding: '12px 22px', borderRadius: '14px',
        font: '700 21px system-ui, -apple-system, sans-serif', textAlign: 'center', maxWidth: '82%',
        pointerEvents: 'none', boxShadow: '0 8px 30px rgba(0,0,0,.35)', lineHeight: '1.3',
      });
      document.body.append(el);
    }
    el.innerHTML = '';
    el.append(Object.assign(document.createElement('div'), { textContent: t }));
    if (s) el.append(Object.assign(document.createElement('div'), { textContent: s, style: 'font-weight:500;font-size:15px;opacity:.85;margin-top:3px' }));
  }, [title, sub]);
}

// ---------------- student movement ----------------
async function walkTo(page, x, z, timeout = 40_000) {
  await page.evaluate(([a, b]) => window.__game.walkTo(a, b), [x, z]);
  await page.waitForFunction(() => window.__game.arrived(), null, { timeout });
}
const playerPos = page => page.evaluate(() => { const p = window.__game.player(); return [p.x, p.z]; });

// Stand in front of a tree, on the side facing the path and the entrance.
async function approach(page, tree) {
  const [tx, tz] = [tree.pos[0], tree.pos[2]];
  const len = Math.hypot(tx, 3) || 1;
  await walkTo(page, tx + (-tx / len) * 2.4, tz + (3 / len) * 2.4);
  await sleep(300);
}

async function face(page, tree) {
  await page.evaluate(([a, b]) => window.__game.face(a, b), [tree.pos[0], tree.pos[2]]);
  await sleep(700);                                          // let the camera swing round
}

// Walk to a grove the way a player would: along the path, then across its bridge.
async function travelTo(page, concept) {
  const [cx, cz] = [concept.centre[0], concept.centre[2]];
  const [, pz] = await playerPos(page);
  await walkTo(page, 0, Math.min(pz, cz + 20));
  await walkTo(page, cx, cz + 17);
  await walkTo(page, cx, cz + 6);
}

const nextAnswer = page => page.waitForResponse(
  r => r.url().includes('/api/answer') && r.request().method() === 'POST', { timeout: 90_000 }).then(r => r.json());

// ---------------- answering ----------------
let shownWrongBeat = false;
let shownSapling = false;

/** Try stones in order until one is right. Captions follow what actually happened. */
async function answerChoice(page, tree, grove) {
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.stones().length > 0, null, { timeout: 8_000 });
  await caption(page, `Quest: ${grove.questName}`, clip(tree.question, 110));
  await sleep(1300);
  const stones = await page.evaluate(() => window.__game.stones());
  for (let i = 0; i < stones.length; i++) {
    if (i > 0) {                                             // step off before the next stone can count
      const [px, pz] = await playerPos(page);
      const dx = tree.pos[0] - px, dz = tree.pos[2] - pz, d = Math.hypot(dx, dz) || 1;
      await walkTo(page, px + (dx / d) * 1.8, pz + (dz / d) * 1.8);
    }
    await walkTo(page, stones[i][0], stones[i][1]);
    await page.waitForSelector('#fox:not([hidden])', { timeout: 10_000 });
    await face(page, tree);
    const response = nextAnswer(page);
    await page.keyboard.press(i === 0 ? 'Digit3' : 'Digit2');
    const r = await response;
    await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 90_000 });
    if (r.correct) {
      await caption(page, r.treeState === 'regrown' ? 'Right answer — the tree regrows' : 'Right — a plank for the bridge',
        `${Math.round(r.conceptHealth * 100)}% of ${grove.questName} mastered · XP ${r.xp}`);
      await sleep(2300);
      return r;
    }
    if (!shownWrongBeat) {
      shownWrongBeat = true;
      await caption(page, r.calibration === 'overconfident' ? 'A confident wrong answer — the tree withers' : 'A wrong answer — the tree withers',
        clip(`Diagnosed: “${r.misconceptionLabel}” · Professor Byte asks a question back, never the answer`, 150));
      await sleep(6000);
    } else {
      await caption(page, 'Not that one — try another stone', r.misconceptionLabel ? clip(`Diagnosed: “${r.misconceptionLabel}”`, 120) : '');
      await sleep(2300);
    }
    if (r.saplingId && !shownSapling) {
      shownSapling = true;
      await caption(page, 'A sapling of the same concept takes root further up the path', 'Distributed practice — made visible in the world');
      await sleep(2800);
    }
  }
  throw new Error(`no stone was correct for tree ${tree.id}`);
}

async function typeInBubble(page, text) {
  await page.keyboard.press('KeyE');
  const box = await page.waitForSelector('.bubble textarea', { timeout: 8_000 });
  await sleep(700);
  await box.focus();
  await page.keyboard.type(clip(text, 280), { delay: 12 });
  await sleep(400);
  const response = nextAnswer(page);
  await page.keyboard.press('Control+Enter');
  const r = await response;
  await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 90_000 });
  return r;
}

async function helpMia(page, tree) {
  await approach(page, tree);
  await face(page, tree);
  await caption(page, 'Help a classmate: Mia is stuck', 'Explaining it to someone else is the strongest way to learn');
  const r = await typeInBubble(page, `${tree.explanation} ${(tree.rubric ?? []).join('. ')}`);
  const total = (tree.rubric ?? []).length;
  await caption(page, r.correct ? 'Mia gets it — the rubric shows what landed' : 'Mia is still unsure — the rubric shows what was missing',
    `${r.explanation?.hit.length ?? 0} of ${total} points hit · graded by the AI`);
  await sleep(4500);
}

/** Answer a grove's trees until its bridge opens (>= 60% mastered), Mia included. */
async function playGrove(page, room, world, grove, miaTree) {
  const trees = world.trees.filter(t => t.conceptId === grove.id && t.spawnedFrom === null);
  const ordered = [...trees.filter(t => t.kind === 'choice'), ...trees.filter(t => t.kind === 'recall')];
  for (const tree of ordered) {
    const st = await api(`/api/state/${room}`);
    const learned = trees.filter(t => (st.world.trees.find(x => x.id === t.id)?.leitnerBox ?? 1) >= 2).length / trees.length;
    if (learned >= 0.6) break;
    await approach(page, tree);
    if (tree.kind === 'choice') {
      await answerChoice(page, tree, grove);
    } else {
      await caption(page, 'A recall tree: answer from memory', clip(tree.question, 110));
      const r = await typeInBubble(page, tree.explanation);
      await caption(page, r.correct ? 'Recalled correctly — graded by the AI' : 'Not quite — the AI marks it and moves on', `XP ${r.xp}`);
      await sleep(2200);
    }
  }
  if (miaTree && miaTree.conceptId === grove.id) await helpMia(page, miaTree);
}

// ---------------- the run ----------------
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1', args: ['--window-size=1300,800'] });
const teacherCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/teacher`, size: SIZE } });
const studentCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/student`, size: SIZE } });
let failure = null;
let usedSample = false;

try {
  const brainName = (await api('/api/health')).brain;
  const aiConnected = brainName.startsWith('zen');
  console.log(`server brain: ${brainName}`);
  if (!aiConnected) console.warn('⚠️  The server is on the fallback brain — this video will show SAMPLE data, and say so.');

  // ===== Scene 1 — the teacher spawns a world =====
  const teacher = await teacherCtx.newPage();
  clock.teacher = Date.now();
  await teacher.goto(`${BASE}/teacher.html`);
  let s = now('teacher');
  await caption(teacher, 'Mastery Grove', 'A 3D learning game generated from a teacher’s own worksheet');
  await sleep(3000);
  const usingPdf = Boolean(PDF && existsSync(PDF));
  await caption(teacher, usingPdf ? '1 · The teacher picks the syllabus and uploads a worksheet' : '1 · The teacher picks the syllabus and a topic',
    'MOE Singapore · Primary 5 · Mathematics · Fractions');
  await sleep(1500);
  if (usingPdf) await teacher.setInputFiles('#pdf', PDF);
  else await teacher.click('.tabs button[data-kind="prompt"]');
  await sleep(1200);
  await teacher.click('#spawn');
  await teacher.waitForFunction(() => document.getElementById('room-code').textContent !== '—', null, { timeout: 60_000 });
  const room = (await teacher.textContent('#room-code')).trim();
  await caption(teacher,
    aiConnected ? 'The AI reads the worksheet and grows a forest from it' : 'Building a forest from SAMPLE data — the AI brain is not connected',
    `Room code ${room} — students join with it`);
  await sleep(3000);
  segments.push({ who: 'teacher', start: s, end: now('teacher'), speed: 1 });

  // Generation can take a minute or more: record it, then speed it up in the edit.
  const waitStart = now('teacher');
  await teacher.waitForFunction(() => /Ready|failed/.test(document.getElementById('spawn-status').textContent), null, { timeout: SPAWN_WAIT_MS });
  const waited = now('teacher') - waitStart;
  const speed = Math.max(1, Math.round(waited / 6));
  if (waited > 1) segments.push({ who: 'teacher', start: waitStart, end: now('teacher'), speed });

  const state = await api(`/api/state/${room}`);
  if (state.status !== 'ready') throw new Error(`world ${room} is ${state.status}`);
  const world = state.world;
  usedSample = world.generatedBy === 'sample' || world.concepts.every(c => SAMPLE_CONCEPTS.has(c.name));
  if (usedSample) console.warn('\n⚠️  This world is the committed SAMPLE data, not AI output. The video will say so.\n');
  s = now('teacher');
  await caption(teacher,
    usedSample ? `${world.trees.length} questions — SAMPLE DATA, the AI brain is not connected`
      : `A forest grew from the worksheet: ${world.concepts.length} groves, ${world.trees.length} questions`,
    speed > 1 ? `Generation shown ×${speed} faster` : 'Groves are syllabus concepts; deeper groves are locked');
  await sleep(4000);
  segments.push({ who: 'teacher', start: s, end: now('teacher'), speed: 1 });
  console.log(`room ${room}: ${world.concepts.length} concepts, ${world.trees.length} trees${usedSample ? ' (SAMPLE DATA)' : ''}`);

  // ===== Scene 2 — a student plays =====
  const student = await studentCtx.newPage();
  clock.student = Date.now();
  await student.goto(`${BASE}/?room=${room}&name=Alex&debug=1`);
  await student.waitForFunction(() => window.__game, null, { timeout: 30_000 });
  s = now('student');
  await caption(student, '2 · A student joins and walks into the forest', 'Answer by walking onto a stone — the fox asks how sure you are first');
  await sleep(1500);

  const root = world.concepts.find(c => c.prerequisites.length === 0);
  const next = world.concepts.find(c => c.prerequisites.length > 0 && c.prerequisites.every(p => p === root.id));
  const miaTree = world.trees.find(t => t.kind === 'teach' && t.spawnedFrom === null);   // where the server stands Mia

  await walkTo(student, 0, root.centre[2] + 12);
  await playGrove(student, room, world, root, miaTree);
  if (next) {
    await caption(student, '3 · Mastery rebuilt the bridge — the next grove unlocks', 'Not "answer ten questions": demonstrate mastery');
    await sleep(1800);
    await travelTo(student, next);
    const first = world.trees.find(t => t.conceptId === next.id && t.spawnedFrom === null && t.kind === 'choice');
    if (first) { await approach(student, first); await answerChoice(student, first, next); }
    if (miaTree?.conceptId === next.id) await helpMia(student, miaTree);
  }
  segments.push({ who: 'student', start: s, end: now('student'), speed: 1 });

  // ===== Scene 3 — the teacher already knows, and acts =====
  await teacher.bringToFront();
  await sleep(2500);                                         // let the console poll
  const view = await api(`/api/teacher/${room}`);
  const top = view.misconceptions[0];
  s = now('teacher');
  await caption(teacher, '4 · The teacher sees what was misunderstood — live',
    top ? clip(`“${top.label}” · ${top.count} student${top.count === 1 ? '' : 's'} · a lesson plan, not a gradebook`, 150) : 'No misconceptions yet');
  await sleep(5500);
  if (top) {
    await caption(teacher, '5 · Deploy Quest: the teacher chooses the intervention', 'Focus trees for that misconception appear in the student’s forest');
    await sleep(1200);
    await teacher.click('.misconceptions li:first-child .deploy');
    await teacher.waitForSelector('.toast', { timeout: 90_000 });
    await sleep(3500);
  }
  await caption(teacher, '6 · Next Session: the Memory Quest', 'Trees answered today come back to the entrance next time');
  await sleep(1200);
  await teacher.click('#next-session');
  await teacher.waitForSelector('.toast', { timeout: 20_000 });
  await sleep(3500);
  await caption(teacher, 'Other tools help students finish homework tonight.', 'Mastery Grove knows what they’ll have forgotten by Thursday.');
  await sleep(4500);
  segments.push({ who: 'teacher', start: s, end: now('teacher'), speed: 1 });
} catch (err) {
  failure = err;
  console.error('walkthrough stopped:', err.message);
}

// Videos are only written when their context closes.
const teacherVideo = await teacherCtx.pages()[0]?.video()?.path();
const studentVideo = await studentCtx.pages()[0]?.video()?.path();
await teacherCtx.close();
await studentCtx.close();
await browser.close();
writeFileSync(`${OUT}/segments.json`, JSON.stringify({ segments, teacherVideo, studentVideo, usedSample }, null, 2));

// ---------------- stitch ----------------
if (spawnSync('ffmpeg', ['-version']).status !== 0 || segments.length === 0) {
  console.log('nothing stitched — raw recordings are in', OUT);
  process.exit(failure ? 1 : 0);
}
const source = { teacher: teacherVideo, student: studentVideo };
const parts = segments.map((seg, i) => {
  const out = `${OUT}/part${i}.mp4`;
  const filters = seg.speed > 1 ? [`setpts=(PTS-STARTPTS)/${seg.speed}`, 'fps=30'] : ['fps=30'];
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, seg.start)), '-to', String(seg.end),
    '-i', source[seg.who], '-vf', filters.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
  if (r.status !== 0) throw new Error(`ffmpeg trim failed: ${r.stderr}`);
  return out;
});
writeFileSync(`${OUT}/parts.txt`, parts.map(p => `file '${p}'`).join('\n'));
const final = `${OUT}/mastery-grove-walkthrough${usedSample ? '-SAMPLE-DATA' : ''}.mp4`;
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${OUT}/parts.txt`, '-c', 'copy', final]);
if (r.status !== 0) throw new Error(`ffmpeg concat failed: ${r.stderr}`);
console.log(`\nwalkthrough: ${final}${failure ? '  (partial — see the error above)' : ''}`);
process.exit(failure ? 1 : 0);
