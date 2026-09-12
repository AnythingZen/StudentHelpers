// Records the Mastery Grove demo video — the team's submission video — by driving two
// real Chrome windows (teacher + student) through the whole product, then stitching
// one MP4 with ffmpeg and writing a timestamped voiceover script that matches it.
//
//   BASE_URL=https://mastery-grove-production.up.railway.app PDF=worksheet.pdf node scripts/walkthrough.mjs
//
// Env: BASE_URL (default http://localhost:3001) · OUT_DIR (default ./walkthrough-out)
//      PDF — worksheet to upload (else "Just a topic") · PACE — hold multiplier (default 1)
//      TARGET_S — length target in seconds (default 150) · HEADLESS=1 · SPAWN_WAIT_S (default 300)
// Needs: Google Chrome, and ffmpeg/ffprobe on PATH.
//
// Built for a strict 3-minute demo: a live presenter delivers the hook, this video
// carries ~2:30, a closing slide takes the rest. It is data-driven, so it works on ANY
// world the AI generates: it reads the world from the server, and finds right answers by
// trying stones — it never needs the answer key, which never reaches a browser. One
// question is played out in full on camera; the rest of the first mission is answered by
// the same student off camera ("A few answers later…"), so the edit stays honest and short.
// A second scripted student, Bea, answers through the same API so the teacher's roster
// has someone to flag — the script says so.
// Every caption and voiceover line is built from what actually happened, and each beat
// is held long enough to read its line aloud. If the world is sample data rather than
// AI output, the captions, the script and the filename all say so.

import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const OUT = resolve(process.env.OUT_DIR ?? 'walkthrough-out');
const PDF = process.env.PDF;
const PACE = Number(process.env.PACE ?? 1);
const TARGET_S = Number(process.env.TARGET_S ?? 150);
const SPAWN_WAIT_MS = Number(process.env.SPAWN_WAIT_S ?? 300) * 1000;
const SIZE = { width: 1280, height: 720 };
const WORDS_PER_SECOND = 2.7;                                  // natural narration pace
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const api = async (path, body) => (await fetch(`${BASE}${path}`, body === undefined ? undefined : {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})).json();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Concept names of the committed sample worlds — only used to detect, and label, a
// recording that didn't actually use the AI.
const SAMPLE_CONCEPTS = new Set(['mockWorld.json', 'mockWorldReading.json'].flatMap(f =>
  JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')).concepts.map(c => c.name)));

// ---------------- recording bookkeeping ----------------
const segments = [];                                           // { who, start, end, speed }
const beats = [];                                              // { who, t, title, sub, vo }
const clock = {};
const whoOf = new Map();
const now = who => (Date.now() - clock[who]) / 1000;
// The edit: an open segment per window. fastForward() cuts a wait (the AI thinking, a
// walk) into its own sped-up segment, so dead time doesn't eat the 2:30.
const open = {};
const startSeg = who => { open[who] = now(who); };
const endSeg = (who, speed = 1) => {
  if (open[who] != null && now(who) - open[who] > 0.05) segments.push({ who, start: open[who], end: now(who), speed });
  open[who] = null;
};
async function fastForward(who, speed, fn) {
  endSeg(who); startSeg(who);
  const out = await fn();
  endSeg(who, speed); startSeg(who);
  return out;
}

// Subtitle-style captions along the bottom, clear of the HUD, toasts and question card.
async function showCaption(page, title, sub) {
  await page.evaluate(([t, s]) => {
    let el = document.getElementById('__caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__caption';
      Object.assign(el.style, {
        position: 'fixed', bottom: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: '99999',
        background: 'rgba(10,18,14,.88)', color: '#fff', padding: '9px 20px', borderRadius: '12px',
        font: '700 19px system-ui, -apple-system, sans-serif', textAlign: 'center', maxWidth: '78%',
        pointerEvents: 'none', boxShadow: '0 6px 24px rgba(0,0,0,.35)', lineHeight: '1.3',
      });
      document.body.append(el);
    }
    el.innerHTML = '';
    el.append(Object.assign(document.createElement('div'), { textContent: t }));
    if (s) el.append(Object.assign(document.createElement('div'), { textContent: s, style: 'font-weight:500;font-size:14px;opacity:.85;margin-top:2px' }));
  }, [title, sub]);
}

/** A story beat: caption on screen, a voiceover line for the script, held long enough to say it. */
async function beat(page, title, sub = '', vo = '', minMs = 1800) {
  const who = whoOf.get(page);
  beats.push({ who, t: now(who), title, sub, vo });
  await showCaption(page, title, sub);
  const words = vo.trim() ? vo.trim().split(/\s+/).length : 0;
  await sleep(Math.max(minMs, (words / WORDS_PER_SECOND) * 1000 + 400) * PACE);
}

/** Caption without a hold, for moments that take their own time (walking, typing, the AI thinking). */
async function label(page, title, sub = '', vo = '') {
  const who = whoOf.get(page);
  beats.push({ who, t: now(who), title, sub, vo });
  await showCaption(page, title, sub);
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
  await sleep(250);
}

async function face(page, tree) {
  await page.evaluate(([a, b]) => window.__game.face(a, b), [tree.pos[0], tree.pos[2]]);
  await sleep(650);                                            // let the camera swing round
}

// Walk to a grove the way a player would: along the path, then across its bridge.
async function travelTo(page, concept) {
  const [cx, cz] = [concept.centre[0], concept.centre[2]];
  const [, pz] = await playerPos(page);
  await walkTo(page, 0, Math.min(pz, cz + 20));
  await walkTo(page, cx, cz + 17);
  await walkTo(page, cx, cz + 6);
}

const nextAnswer = (page, timeout = 90_000) => page.waitForResponse(
  r => r.url().includes('/api/answer') && r.request().method() === 'POST', { timeout }).then(r => r.json());

// Rubric points ("Says the denominator is…") rewritten as a student talking ("the
// denominator is…"). Pasting the teacher's explanation fails, rightly: the real grader
// spots copied notes.
function studentVoice(rubric) {
  const lines = rubric
    .filter(r => !/^does not\b/i.test(r.trim()))
    .map(r => r.trim()
      .replace(/^(says|states|explains|mentions|uses|writes|gives|points out|shows|notes|describes|defines|names|includes|identifies|recogni[sz]es|makes clear|offers|works (the example )?through)\s+(that\s+|how\s+)?/i, '')
      .replace(/\s*\(([^)]*)\)/g, ' $1')
      .replace(/:\s*/g, ' — ')
      .replace(/\.$/, ''))
    .filter(Boolean)
    .map(l => l[0].toLowerCase() + l.slice(1));
  return `Okay Mia, here's how I think about it. ${lines.join('. And ')}. Does that make sense?`;
}

// ---------------- on-camera answering ----------------
const known = new Map();                                       // root tree id → the choice index that was right
const rootOf = t => (t.spawnedFrom && !t.spawnedFrom.startsWith('quest:') ? t.spawnedFrom : t.id);

/**
 * A question played out on camera: stones, the fox, and — when it happens — a wrong answer,
 * the AI diagnosis, Professor Byte, the fox's calibration line, the sapling and the retry.
 * The recorder can't know the right answer, so it tries stones from the last option
 * backwards; the caller moves on to another question until a genuine wrong answer is shown.
 */
async function showcaseQuestion(page, tree, grove, first) {
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.stones().length > 0, null, { timeout: 8_000 });
  if (first) {
    await beat(page, `Quest: ${grove.questName}`, tree.citation ? clip(`📄 Worksheet p.${tree.citation.page} — every question cites its source`, 100) : '',
      `Press E, and answer stones rise — walk onto one to answer.${tree.citation ? ' Each question cites its worksheet page.' : ''}`);
  } else {
    await beat(page, `Quest: ${grove.questName}`, 'another tree', '', 1500);
  }
  const stones = await page.evaluate(() => window.__game.stones());
  const order = stones.map((_, i) => i).reverse();
  let wrongShown = false;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    await fastForward('student', k > 0 ? 2 : 1, async () => {
      if (k > 0) {                                             // step off before the next stone can count
        const [px, pz] = await playerPos(page);
        const dx = px - tree.pos[0], dz = pz - tree.pos[2], d = Math.hypot(dx, dz) || 1;
        await walkTo(page, px + (dx / d) * 2.2, pz + (dz / d) * 2.2);
      }
      await walkTo(page, stones[i][0], stones[i][1]);
      await page.waitForSelector('#fox:not([hidden])', { timeout: 10_000 });
      await face(page, tree);
    });
    if (first && k === 0) await beat(page, 'The fox asks: how sure are you?', 'confidence before every answer', 'The fox asks how sure you are.');
    let r = null;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      if (attempt > 0) {                                       // a request that never came back: step off, step on again
        console.warn(`answer on ${tree.id} stone ${i} got no response — retrying`);
        await fastForward('student', 3, async () => {
          await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 30_000 });
          const [px, pz] = await playerPos(page);
          const dx = px - tree.pos[0], dz = pz - tree.pos[2], d = Math.hypot(dx, dz) || 1;
          await walkTo(page, px + (dx / d) * 2.2, pz + (dz / d) * 2.2);
          await walkTo(page, stones[i][0], stones[i][1]);
          await page.waitForSelector('#fox:not([hidden])', { timeout: 10_000 });
        });
      }
      r = await fastForward('student', 3, async () => {         // the AI grading and diagnosing
        const response = nextAnswer(page, 30_000).catch(() => null);
        await page.keyboard.press(k === 0 ? 'Digit3' : 'Digit2');
        const res = await response;
        if (res) await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 90_000 });
        return res;
      });
    }
    if (!r) throw new Error(`no response to an answer on ${tree.id}`);
    if (r.correct) {
      known.set(rootOf(tree), i);
      if (wrongShown) {
        await beat(page, 'Right — the tree regrows', 'but the mission still says: come back to what you missed',
          'Retry, and the tree regrows — but the mission says come back later. That’s spaced practice.', 3000);
      } else {
        await beat(page, 'Right first time', `XP ${r.xp} · mastery ${Math.round(r.mastery * 100)}%`, '', 2200);
      }
      return { wrongShown };
    }
    if (!wrongShown) {
      wrongShown = true;
      const knownLabel = r.misconceptionId && r.misconceptionId !== 'unclassified';
      await beat(page, r.calibration === 'overconfident' ? 'Very sure — and wrong. The tree withers.' : 'Wrong — the tree withers',
        knownLabel ? clip(`AI diagnosis: “${r.misconceptionLabel}”`, 110) : 'Professor Byte asks a question back — never the answer',
        `${r.calibration === 'overconfident' ? 'Very sure, and wrong. ' : 'Wrong. '}The tree withers, the AI diagnoses why, and Professor Byte asks a question back — not the answer.`,
        5500);
      if (r.saplingId) {
        await beat(page, 'A sapling of the same question sprouts up the path', 'the fox reflects your confidence back to you',
          'A sapling of that question sprouts up the path.', 2000);
      }
    }
  }
  throw new Error(`no stone was correct for tree ${tree.id}`);
}

// ---------------- hands-on challenges: the cake and the bridge ----------------
async function serveChallenge(page, key) {
  await page.click('#challenge-serve');
  await page.waitForSelector('#fox:not([hidden])', { timeout: 8_000 });
  return fastForward('student', 2, async () => {
    const response = nextAnswer(page, 30_000);
    await page.keyboard.press(key);
    return response;
  });
}

/** Build a fraction with real pieces, clicked in the 3D world. On the cake, show the classic mistake first. */
async function playChallenge(page, tree, showMistake) {
  const m = tree.model;
  const answer = (m.parts * m.num) / m.den;
  const thing = m.shape === 'cake' ? 'slices' : 'planks';
  await fastForward('student', 2, async () => { await approach(page, tree); await face(page, tree); });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.challengeOpen(), null, { timeout: 8_000 });
  await sleep(1100);                                           // the camera swings down to the table
  await beat(page, m.shape === 'cake' ? `Hands-on: serve ${m.num}/${m.den} of the cake` : `Checkpoint: build ${m.num}/${m.den} of the bridge`,
    `${m.parts} equal ${thing} — click them to choose`,
    m.shape === 'cake' ? 'Some questions you build with real things. Serve two thirds of a cake cut into six slices.'
      : 'A checkpoint: build three quarters of the bridge.', 2600);
  const click = async i => {
    const [x, y] = await page.evaluate(n => window.__game.pieceScreen(n), i);
    await page.mouse.click(x, y);
    await sleep(420);
  };
  if (showMistake) {
    for (let i = 0; i < m.num; i++) await click(i);            // the classic mistake: the top number as pieces
    const r = await serveChallenge(page, 'Digit3');
    await sleep(700);
    await beat(page, `${m.num} ${thing}, very sure — wrong`, clip(`the mistake, named: “${r.misconceptionLabel}”`, 110),
      'Two slices, very sure — wrong. The game names the mistake, and Byte asks: how many slices make one third?', 4500);
    for (let i = m.num; i < answer; i++) await click(i);
  } else {
    for (let i = 0; i < answer; i++) await click(i);
  }
  const r = await serveChallenge(page, 'Digit2');
  if (!r.correct) throw new Error(`challenge ${tree.id} not solved`);
  await sleep(500);
  await beat(page, `Exactly ${m.num}/${m.den} — ${answer} of ${m.parts} ${thing}`, m.shape === 'cake' ? `${m.num}/${m.den} is the same as ${answer}/${m.parts}` : 'checkpoint cleared',
    m.shape === 'cake' ? 'Four slices: exactly two thirds — the same as four sixths.' : 'Six planks. Checkpoint cleared.', 2400);
  await page.waitForFunction(() => !window.__game.challengeOpen(), null, { timeout: 8_000 });
}

// ---------------- off-camera answering ("A few answers later…") ----------------
async function answerRight(room, tree, playerId, name) {
  const root = rootOf(tree);
  if (tree.kind === 'model') {                                 // the count is the arithmetic in the question
    const r = await api('/api/answer', { worldId: room, treeId: tree.id, response: (tree.model.parts * tree.model.num) / tree.model.den, confidence: 'medium', playerId, name });
    return Boolean(r.correct);
  }
  if (tree.kind === 'choice') {
    const n = tree.choices?.length ?? 0;
    const order = known.has(root) ? [known.get(root), ...[...Array(n).keys()].filter(i => i !== known.get(root))] : [...Array(n).keys()];
    for (const i of order) {
      const r = await api('/api/answer', { worldId: room, treeId: tree.id, response: i, confidence: 'medium', playerId, name });
      if (r.error) return false;
      if (r.correct) { known.set(root, i); return true; }
    }
    return false;
  }
  const response = tree.kind === 'teach' ? studentVoice(tree.rubric ?? []) : tree.explanation;
  return Boolean((await api('/api/answer', { worldId: room, treeId: tree.id, response, confidence: 'medium', playerId, name })).correct);
}

/** The same student finishes the rest of a mission through the real API, until only the reflection is left. */
async function finishMissionOffCamera(room, conceptId, playerId, name) {
  for (let round = 0; round < 8; round++) {
    const st = await api(`/api/state/${room}?playerId=${playerId}`);
    const mission = st.me.missions.find(m => m.conceptId === conceptId);
    if (mission.ready) return true;
    const trees = st.world.trees.filter(t => t.conceptId === conceptId);
    for (const o of mission.objectives.filter(x => !x.done && x.kind !== 'reflect')) {
      if (o.kind === 'review') {
        for (const t of trees.filter(t => t.state === 'sapling' || (t.spawnedFrom === null && t.state !== 'healthy'))) await answerRight(room, t, playerId, name);
        continue;
      }
      const kind = { answer: 'choice', recall: 'recall', teach: 'teach', model: 'model' }[o.kind];
      const pool = trees.filter(t => (o.kind === 'focus' ? t.spawnedFrom?.startsWith('quest:') : t.spawnedFrom === null && t.kind === kind) && t.leitnerBox < 2);
      for (const t of pool.slice(0, o.target - o.progress)) await answerRight(room, t, playerId, name);
    }
  }
  const st = await api(`/api/state/${room}?playerId=${playerId}`);
  return st.me.missions.find(m => m.conceptId === conceptId).ready;
}

async function typeInBubble(page, text) {
  await page.keyboard.press('KeyE');
  const box = await page.waitForSelector('.bubble textarea', { timeout: 8_000 });
  await sleep(500);
  await box.focus();
  await page.keyboard.type(clip(text, 260), { delay: 9 });
  await sleep(300);
  return fastForward('student', 3, async () => {                 // the AI grading the explanation
    const response = nextAnswer(page);
    await page.keyboard.press('Control+Enter');
    const r = await response;
    await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 90_000 });
    return r;
  });
}

async function helpMia(student, miaTree) {
  startSeg('student');
  await fastForward('student', 2, async () => { await approach(student, miaTree); await face(student, miaTree); });
  await label(student, 'Mia is stuck — help her', 'teaching someone else is one of the strongest ways to learn',
    'Mia is stuck. Teaching her is one of the best ways to learn.');
  const r = await typeInBubble(student, studentVoice(miaTree.rubric ?? []));
  await beat(student, r.correct ? 'Mia gets it' : 'Mia is still unsure', `${r.explanation?.hit.length ?? 0} of ${(miaTree.rubric ?? []).length} rubric points hit · graded by the AI`,
    r.correct ? 'The AI grades the explanation against a rubric.' : 'The AI grades the explanation against a rubric, and shows what was missing.', 3000);
  endSeg('student');
}

// ---------------- the run ----------------
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1', args: ['--window-size=1300,800'] });
const teacherCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/teacher`, size: SIZE } });
const studentCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/student`, size: SIZE } });
await teacherCtx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
let failure = null;
let usedSample = false;
let brainName = '?';
let beaPresence = null;

try {
  brainName = (await api('/api/health')).brain;
  const aiConnected = brainName.startsWith('zen');
  console.log(`server brain: ${brainName}`);
  if (!aiConnected) console.warn('⚠️  The server is on the fallback brain — this video will show SAMPLE data, and say so.');

  // ===== Scene 1 — the teacher grows a world and shares it =====
  const teacher = await teacherCtx.newPage();
  whoOf.set(teacher, 'teacher');
  clock.teacher = Date.now();
  await teacher.goto(`${BASE}/teacher.html`);
  startSeg('teacher');
  const usingPdf = Boolean(PDF && existsSync(PDF));
  if (usingPdf) await teacher.setInputFiles('#pdf', PDF);
  else await teacher.click('.tabs button[data-kind="prompt"]');
  await beat(teacher, 'The teacher uploads the worksheet she already uses', 'any syllabus · or paste a link, paste text, or just name a topic',
    'A teacher uploads the worksheet she already uses.');
  await teacher.click('#spawn');
  await teacher.waitForFunction(() => document.getElementById('room-code').textContent !== '—', null, { timeout: 60_000 });
  const room = (await teacher.textContent('#room-code')).trim();
  await label(teacher, aiConnected ? 'The AI reads it and grows a world of missions' : 'Building a forest from SAMPLE data — AI brain not connected',
    `Room code ${room}`, aiConnected ? 'The AI reads it and grows a world: each concept a grove with a mission, each question a tree.' : '');
  await sleep(3000);
  endSeg('teacher');

  // Generation can take a minute or more: record it, then speed it up in the edit.
  const waitStart = now('teacher');
  await teacher.waitForFunction(() => /Ready|failed/.test(document.getElementById('spawn-status').textContent), null, { timeout: SPAWN_WAIT_MS });
  const waited = now('teacher') - waitStart;
  const speed = Math.max(1, Math.round(waited / 4));
  if (waited > 1) segments.push({ who: 'teacher', start: waitStart, end: now('teacher'), speed });

  const state = await api(`/api/state/${room}`);
  if (state.status !== 'ready') throw new Error(`world ${room} is ${state.status}`);
  const world = state.world;
  usedSample = world.generatedBy === 'sample' || world.concepts.every(c => SAMPLE_CONCEPTS.has(c.name));
  if (usedSample) console.warn('\n⚠️  This world is SAMPLE data, not AI output. The video will say so.\n');
  const ladder = world.concepts.find(c => c.level !== world.syllabus.level);
  startSeg('teacher');
  await teacher.click('#copy-link');
  await beat(teacher,
    usedSample ? `${plural(world.trees.length, 'question')} — SAMPLE DATA, AI brain not connected`
      : `${plural(world.concepts.length, 'mission')}, ${plural(world.trees.length, 'question')} — from the worksheet`,
    [speed > 1 ? `generation shown ×${speed}` : '', 'share one link or the room code'].filter(Boolean).join(' · '),
    usedSample ? '' : `${plural(world.concepts.length, 'mission')}, ${plural(world.trees.length, 'question')}. The teacher shares one link.`);
  endSeg('teacher');
  console.log(`room ${room}: ${world.concepts.length} concepts, ${world.trees.length} trees${usedSample ? ' (SAMPLE DATA)' : ''}`);

  // ===== Scene 2 — a student plays =====
  const student = await studentCtx.newPage();
  whoOf.set(student, 'student');
  clock.student = Date.now();
  await student.goto(`${BASE}/?room=${room}&name=Alex&debug=1`);
  await student.waitForFunction(() => window.__game, null, { timeout: 30_000 });
  const playerId = await student.evaluate(() => sessionStorage.getItem('mg-player'));
  startSeg('student');

  const first = (await api(`/api/state/${room}?playerId=${playerId}`)).me;
  const root = world.concepts.find(c => c.id === first.current);
  const nextMission = first.missions.find(m => m.conceptId !== root.id && world.concepts.find(c => c.id === m.conceptId).prerequisites.every(p => p === root.id));
  const next = nextMission && world.concepts.find(c => c.id === nextMission.conceptId);
  const miaTree = world.trees.find(t => t.kind === 'teach' && t.spawnedFrom === null);   // where the server stands Mia

  if (await student.$('#tutorial:not([hidden])')) {
    await beat(student, 'A student opens the link', 'first time in: how to play, in four lines',
      'A student opens it. Four lines explain how to play.', 2200);
    await student.keyboard.press('Enter');
  }
  await sleep(900);
  await beat(student, `Mission 1 of ${first.total}: ${root.questName}`, 'the panel says what to do · the beacon shows where',
    'A mission panel says what to do. A beacon shows where.', 2500);

  const tried = new Set();
  for (let n = 0; n < 3; n++) {                                // until a real wrong answer is on camera
    const beaconId = await student.evaluate(() => window.__game.beacon());
    const tree = world.trees.find(t => t.id === beaconId && !tried.has(t.id) && t.kind === 'choice')
      ?? world.trees.find(t => t.conceptId === root.id && t.spawnedFrom === null && t.kind === 'choice' && !tried.has(t.id));
    if (!tree) break;
    tried.add(tree.id);
    await fastForward('student', 2, () => approach(student, tree));
    if ((await showcaseQuestion(student, tree, root, n === 0)).wrongShown) break;
  }
  endSeg('student');

  const cake = world.trees.find(t => t.kind === 'model' && t.conceptId === root.id && t.spawnedFrom === null);
  if (cake) {
    startSeg('student');
    await playChallenge(student, cake, true);
    endSeg('student');
  }

  if (miaTree?.conceptId === root.id) await helpMia(student, miaTree);

  // The rest of the mission off camera; the reflection opens by itself when it's done.
  if (!(await finishMissionOffCamera(room, root.id, playerId, 'Alex'))) throw new Error(`could not finish mission ${root.questName}`);
  await student.waitForSelector('.modal.reflect', { timeout: 20_000 });
  await sleep(600);
  startSeg('student');
  await beat(student, 'A few answers later — reflect before moving on', 'metacognition: how well do I actually know this?',
    'A few answers later: every mission ends with a reflection. How well do I really know this?', 3000);
  await student.click('.ratings button:nth-child(3)');
  await sleep(500);
  await student.click('.modal.reflect textarea');
  await student.keyboard.type(clip(`I think ${root.name.toLowerCase()} is about ${(world.trees.find(t => t.conceptId === root.id && t.kind === 'recall')?.explanation ?? root.name).split(/[.;]/)[0].toLowerCase()}`, 120), { delay: 12 });
  await sleep(400);
  await student.click('.modal.reflect button[type=submit]');
  await sleep(1400);
  await beat(student, 'Mission complete — the student\'s rating meets reality', 'the next grove unlocks for this student',
    'Their rating is compared with how they actually did — and the next grove unlocks, for them.', 3500);
  endSeg('student');

  if (next) {
    startSeg('student');
    await label(student, `Across the bridge: ${next.questName}`, ladder ? `groves climb the syllabus, up to ${ladder.level}` : 'each grove is the next topic in the syllabus', '');
    await fastForward('student', 2, () => travelTo(student, next));
    endSeg('student');
    const bridge = world.trees.find(t => t.kind === 'model' && t.conceptId === next.id && t.spawnedFrom === null);
    if (bridge) {
      startSeg('student');
      await playChallenge(student, bridge, false);
      endSeg('student');
    }
    if (miaTree?.conceptId === next.id) await helpMia(student, miaTree);
  }

  startSeg('student');
  await student.click('#world-btn');
  await student.waitForSelector('.world-list button', { timeout: 10_000 });
  await beat(student, 'Switch syllabus any time: teleport to another world', '＋ grows a new world from a topic, link or PDF',
    'Students can teleport to another topic, or grow a new world.', 2500);
  await student.keyboard.press('Escape');
  endSeg('student');

  // A second student, Bea, playing through the same API: confident and wrong, twice over.
  const beaId = `bea-${Date.now().toString(36)}`;
  const beaPos = [root.centre[0] + 3, 0, root.centre[2] + 4];
  const beat2 = () => api(`/api/presence/${room}`, { playerId: beaId, name: 'Bea', pos: beaPos, yaw: 0 }).catch(() => {});
  await beat2();
  beaPresence = setInterval(beat2, 1000);
  const rootChoices = world.trees.filter(t => t.conceptId === root.id && t.spawnedFrom === null && t.kind === 'choice');
  for (let k = 0; k < 3; k++) {
    const t = rootChoices[k % rootChoices.length];
    const right = known.get(t.id);
    const wrong = right === undefined ? (t.choices.length - 1) : (right + 1) % t.choices.length;
    await api('/api/answer', { worldId: room, treeId: t.id, response: wrong, confidence: 'high', playerId: beaId, name: 'Bea' });
  }

  // ===== Scene 3 — the teacher sees every student, and acts =====
  await teacher.bringToFront();
  await sleep(2500);                                           // let the console poll
  await teacher.evaluate(() => window.scrollTo({ top: 0 }));
  const view = await api(`/api/teacher/${room}`);
  const bea = view.students.find(x => x.playerId === beaId);
  const top = view.misconceptions[0];
  startSeg('teacher');
  await beat(teacher, 'The teacher sees every student, live', bea ? clip(`Bea: ${bea.status === 'stuck' ? 'stuck' : bea.status}${bea.lastMisconception ? ` — “${bea.lastMisconception}”` : ''}`, 110) : 'mission, accuracy and confidence for each student',
    'The teacher sees every student live: mission, accuracy, confidence. Bea is flagged — confident, wrong, and stuck.',
    4000);
  if (top) {

    await beat(teacher, 'What the class misunderstands — not just who got it wrong', clip(`“${top.label}” · ${plural(top.studentCount ?? top.count, 'student')}`, 110),
      'Not just who got it wrong — what the class misunderstood.', 3500);
    await fastForward('teacher', 4, async () => {                // the AI drafting the focus trees
      await teacher.click('.misconceptions li:first-child .deploy');
      await teacher.waitForSelector('.toast', { timeout: 90_000 });
    });
    await beat(teacher, 'Deploy Quest: the teacher chooses the intervention', 'focus trees join that grove\'s mission for every student',
      'One click deploys a focus quest on it. The AI drafts; the teacher decides.');
  }
  await teacher.evaluate(() => document.getElementById('next-session').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(900);
  await teacher.click('#next-session');
  await teacher.waitForSelector('.toast', { timeout: 20_000 });
  await beat(teacher, 'Next session: the Memory Quest', 'last session\'s questions come back — distributed practice',
    'Next session, a Memory Quest brings back what each student learned.');
  endSeg('teacher');
} catch (err) {
  failure = err;
  console.error('walkthrough stopped:', err.message);
} finally {
  if (beaPresence) clearInterval(beaPresence);
}

// Videos are only written when their context closes.
const teacherVideo = await teacherCtx.pages()[0]?.video()?.path();
const studentVideo = await studentCtx.pages()[0]?.video()?.path();
await teacherCtx.close();
await studentCtx.close();
await browser.close();
writeFileSync(`${OUT}/segments.json`, JSON.stringify({ segments, beats, teacherVideo, studentVideo, usedSample }, null, 2));

// ---------------- stitch ----------------
if (spawnSync('ffmpeg', ['-version']).status !== 0 || segments.length === 0) {
  console.log('nothing stitched — raw recordings are in', OUT);
  process.exit(failure ? 1 : 0);
}
const source = { teacher: teacherVideo, student: studentVideo };
const duration = file => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).stdout.toString().trim());
const parts = segments.map((seg, i) => {
  const out = `${OUT}/part${i}.mp4`;
  const filters = seg.speed > 1 ? [`setpts=(PTS-STARTPTS)/${seg.speed}`, 'fps=30'] : ['fps=30'];
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, seg.start)), '-to', String(seg.end),
    '-i', source[seg.who], '-vf', filters.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
  if (r.status !== 0) throw new Error(`ffmpeg trim failed: ${r.stderr}`);
  return out;
});
writeFileSync(`${OUT}/parts.txt`, parts.map(p => `file '${p}'`).join('\n'));
const base = `mastery-grove-walkthrough${usedSample ? '-SAMPLE-DATA' : ''}`;
const final = `${OUT}/${base}.mp4`;
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${OUT}/parts.txt`, '-c', 'copy', final]);
if (r.status !== 0) throw new Error(`ffmpeg concat failed: ${r.stderr}`);

// ---------------- the voiceover script, timed to THIS video ----------------
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
let offset = 0;
const timed = [];
segments.forEach((seg, i) => {
  const len = duration(parts[i]);
  for (const b of beats) {
    if (b.who === seg.who && b.t >= seg.start - 0.05 && b.t <= seg.end) timed.push({ at: offset + Math.max(0, b.t - seg.start) / seg.speed, ...b });
  }
  offset += len;
});
timed.sort((a, b) => a.at - b.at);
const seen = new Set();
const rows = timed.filter(b => { const k = `${b.title}|${Math.round(b.at)}`; if (seen.has(k)) return false; seen.add(k); return true; });
const total = duration(final);
const overBy = Math.round(total - TARGET_S);
if (overBy > 0) console.warn(`\n⚠️  ${mmss(total)} is ${overBy}s over the ${mmss(TARGET_S)} target — lower PACE or trim beats.`);
const script = [
  `# Mastery Grove — voiceover script`,
  ``,
  `Timed to \`${base}.mp4\` — ${mmss(total)} (target ${mmss(TARGET_S)}${overBy > 0 ? `, **${overBy}s over**` : ', within target'}).`,
  `Recorded ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against ${BASE} · brain \`${brainName}\` · pace ×${PACE}.`,
  usedSample ? `\n> ⚠️ **SAMPLE DATA** — this recording did not use the AI brain. Do not submit it as the product demo.\n` : '',
  `> Bea, the flagged student on the teacher console, is a second student driven by the recorder through the same API as Alex.`,
  ``,
  `**Run of show (strict 3:00):** 0:00–0:15 live hook · 0:15–${mmss(15 + total)} this video · closing slide to 3:00.`,
  ``,
  `| Time | On screen | Voiceover |`,
  `|---|---|---|`,
  ...rows.map(b => `| ${mmss(b.at)} | **${b.title.replace(/\|/g, '/')}**${b.sub ? `<br>${b.sub.replace(/\|/g, '/')}` : ''} | ${b.vo ? b.vo.replace(/\|/g, '/') : '_(let it play)_'} |`),
  ``,
].join('\n');
writeFileSync(`${OUT}/${base}-script.md`, script);
console.log(`\nwalkthrough: ${final} (${mmss(total)})\nscript:      ${OUT}/${base}-script.md${failure ? '\n(partial — see the error above)' : ''}`);
process.exit(failure ? 1 : 0);
