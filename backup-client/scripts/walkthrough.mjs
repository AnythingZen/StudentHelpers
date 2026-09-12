// Records the demo walkthrough — and the team's backup video — by driving two real
// Chrome windows (teacher + student) through the whole loop, then stitching the
// recordings into one MP4 with ffmpeg.
//
//   BASE_URL=https://mastery-grove-production.up.railway.app node scripts/walkthrough.mjs
//
// Env: BASE_URL (default http://localhost:3001), OUT_DIR (default ./walkthrough-out),
//      PDF (a worksheet to upload; falls back to "Just a topic"), HEADLESS=1.
// Needs: Google Chrome installed, ffmpeg on PATH for the final MP4.
// Uses a freshly spawned room, so the OAK7 / FERN demo worlds are never touched.

import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const OUT = resolve(process.env.OUT_DIR ?? 'walkthrough-out');
const PDF = process.env.PDF;
const SIZE = { width: 1280, height: 720 };
const fixture = JSON.parse(readFileSync(new URL('../../mockWorld.json', import.meta.url), 'utf8'));
const treePos = id => { const t = fixture.trees.find(x => x.id === id); return [t.pos[0], t.pos[2]]; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---------------- helpers ----------------
const segments = [];          // { who, start, end } in seconds from that recording's start
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
    if (s) el.append(Object.assign(document.createElement('div'), { textContent: s, style: 'font-weight:500;font-size:15px;opacity:.8;margin-top:3px' }));
  }, [title, sub]);
}

async function walkTo(page, x, z, timeout = 20_000) {
  await page.evaluate(([a, b]) => window.__game.walkTo(a, b), [x, z]);
  await page.waitForFunction(() => window.__game.arrived(), null, { timeout });
}

// Stand just in front of a tree, on the side facing the path and the entrance.
async function approach(page, id) {
  const [tx, tz] = treePos(id);
  const dx = -tx, dz = 3, len = Math.hypot(dx, dz) || 1;
  await walkTo(page, tx + (dx / len) * 2.4, tz + (dz / len) * 2.4);
  await sleep(300);
}

async function face(page, id) {
  const [tx, tz] = treePos(id);
  await page.evaluate(([a, b]) => window.__game.face(a, b), [tx, tz]);
  await sleep(700);                                                     // camera swings round
}

async function answerOnStone(page, index, confidenceKey, treeId) {
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.stones().length > 0, null, { timeout: 5_000 });
  await sleep(700);                                                     // let the stones rise on camera
  const stones = await page.evaluate(() => window.__game.stones());
  await walkTo(page, stones[index][0], stones[index][1]);
  await page.waitForSelector('#fox:not([hidden])', { timeout: 5_000 });
  await face(page, treeId);
  await page.keyboard.press(confidenceKey);
  await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 10_000 });
  await sleep(1400);
}

async function typeInBubble(page, text) {
  await page.keyboard.press('KeyE');
  const box = await page.waitForSelector('.bubble textarea', { timeout: 5_000 });
  await sleep(700);
  await box.focus();
  await page.keyboard.type(text, { delay: 18 });
  await sleep(400);
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 10_000 });
}

// ---------------- the run ----------------
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1', args: ['--window-size=1300,800'] });
const teacherCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/teacher`, size: SIZE } });
const studentCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/student`, size: SIZE } });
let failure = null;

try {
  // ===== Scene 1 — the teacher spawns a world =====
  const teacher = await teacherCtx.newPage();
  clock.teacher = Date.now();
  await teacher.goto(`${BASE}/teacher.html`);
  let s = now('teacher');
  await caption(teacher, 'Mastery Grove', 'A 3D learning game spawned from a teacher’s own worksheet');
  await sleep(3000);
  await caption(teacher, '1 · The teacher picks the syllabus and drops in a worksheet', 'MOE Singapore · Primary 5 · Mathematics · Fractions');
  await sleep(1500);
  if (PDF && existsSync(PDF)) {
    await teacher.setInputFiles('#pdf', PDF);
  } else {
    await teacher.click('.tabs button[data-kind="prompt"]');
  }
  await sleep(1200);
  await teacher.click('#spawn');
  await teacher.waitForFunction(() => document.getElementById('room-code').textContent !== '—', null, { timeout: 30_000 });
  const room = (await teacher.textContent('#room-code')).trim();
  await caption(teacher, '…and the forest plants itself', `Room code ${room} — students join with it`);
  await teacher.waitForFunction(() => /Ready/.test(document.getElementById('spawn-status').textContent), null, { timeout: 90_000 });
  await sleep(3500);
  segments.push({ who: 'teacher', start: s, end: now('teacher') });
  console.log(`room ${room}`);

  // ===== Scene 2 — a student plays =====
  const student = await studentCtx.newPage();
  clock.student = Date.now();
  await student.goto(`${BASE}/?room=${room}&name=Alex&debug=1`);
  await student.waitForFunction(() => window.__game, null, { timeout: 30_000 });
  s = now('student');
  await caption(student, '2 · A student joins and walks into the forest', 'Groves are syllabus concepts — deeper groves are locked');
  await sleep(1500);
  await walkTo(student, 0, -6);

  await caption(student, '3 · Press E to accept a quest — answer stones rise', 'You answer by walking onto a stone');
  await approach(student, 't1');
  await caption(student, '3 · Walk onto a stone to answer', 'The fox asks first: how sure are you?');
  await answerOnStone(student, 0, 'Digit3', 't1');

  await caption(student, 'Recall trees: answer from memory', 'Graded on the server — the answer key never reaches the browser');
  await approach(student, 't2');
  await typeInBubble(student, 'No, it is the same amount - the top and bottom were both divided by 5');
  await sleep(1500);

  await caption(student, '4 · Every right answer adds a plank to the bridge');
  await approach(student, 't3');
  await answerOnStone(student, 0, 'Digit2', 't3');
  await caption(student, 'Mastery rebuilds the bridge — the next grove unlocks', 'Not answering ten questions: demonstrating mastery');
  await sleep(1800);
  await walkTo(student, 14, -21);
  await walkTo(student, 14, -31);                                     // across the bridge

  await caption(student, '5 · A confident wrong answer…', 'Which is larger: 3/4 or 5/8? — choosing 5/8, "very sure"');
  await approach(student, 't4');
  await answerOnStone(student, 0, 'Digit3', 't4');
  await caption(student, '…the tree withers, and Professor Byte asks a question back', 'The AI diagnosed the misconception — and never gives the answer');
  await sleep(4500);
  await caption(student, 'A sapling of the same concept takes root further up the path', 'Distributed practice — made visible in the world');
  await sleep(2500);
  const [sx, sz] = await student.evaluate(() => { const p = window.__game.player(); return [p.x, p.z]; });
  await walkTo(student, sx + 1.5, sz + 2.5);                            // step off the stones
  const stones = await student.evaluate(() => window.__game.stones());
  await caption(student, 'Try again — and the tree regrows');
  await walkTo(student, stones[1][0], stones[1][1]);
  await student.waitForSelector('#fox:not([hidden])', { timeout: 5_000 });
  await face(student, 't4');
  await student.keyboard.press('Digit2');
  await student.waitForFunction(() => !window.__game.busy(), null, { timeout: 10_000 });
  await sleep(2200);

  await caption(student, '6 · Help a classmate: Mia is stuck', 'Explaining it to someone else is the strongest way to learn');
  await approach(student, 't15');
  await face(student, 't15');
  await typeInBubble(student,
    "You can't compare the top numbers unless the bottom numbers match. Make a common denominator: 3/4 = 6/8, and 6/8 is bigger than 5/8.");
  await caption(student, 'Mia gets it — and the rubric shows what landed', '+25 XP · the protégé effect');
  await sleep(4500);
  segments.push({ who: 'student', start: s, end: now('student') });

  // ===== Scene 3 — the teacher already knows, and acts =====
  await teacher.bringToFront();
  await sleep(2500);                                                     // let the console poll
  s = now('teacher');
  await caption(teacher, '7 · The teacher already knows', 'Not "12 got question four wrong" — what they misunderstood. A lesson plan, not a gradebook.');
  await sleep(5000);
  await caption(teacher, '8 · Deploy Quest: the teacher chooses the intervention', 'Focus trees for that misconception appear in the student’s forest');
  await sleep(1500);
  await teacher.click('.misconceptions li:first-child .deploy');
  await teacher.waitForSelector('.toast', { timeout: 10_000 });
  await sleep(3500);
  await caption(teacher, '9 · Next Session: the Memory Quest', 'Trees answered today come back to the entrance next time');
  await sleep(1200);
  await teacher.click('#next-session');
  await teacher.waitForSelector('.toast', { timeout: 10_000 });
  await sleep(3500);
  await caption(teacher, 'Other tools help students finish homework tonight.', 'Mastery Grove knows what they’ll have forgotten by Thursday.');
  await sleep(4500);
  segments.push({ who: 'teacher', start: s, end: now('teacher') });
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
writeFileSync(`${OUT}/segments.json`, JSON.stringify({ segments, teacherVideo, studentVideo }, null, 2));

// ---------------- stitch ----------------
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
if (!ffmpeg || segments.length === 0) {
  console.log(ffmpeg ? 'no complete segments to stitch' : 'ffmpeg not found — raw recordings are in', OUT);
  process.exit(failure ? 1 : 0);
}
const source = { teacher: teacherVideo, student: studentVideo };
const parts = segments.map((seg, i) => {
  const out = `${OUT}/part${i}.mp4`;
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, seg.start)), '-to', String(seg.end),
    '-i', source[seg.who], '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '20', out]);
  if (r.status !== 0) throw new Error(`ffmpeg trim failed: ${r.stderr}`);
  return out;
});
writeFileSync(`${OUT}/parts.txt`, parts.map(p => `file '${p}'`).join('\n'));
const final = `${OUT}/mastery-grove-walkthrough.mp4`;
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${OUT}/parts.txt`, '-c', 'copy', final]);
if (r.status !== 0) throw new Error(`ffmpeg concat failed: ${r.stderr}`);
console.log(`\nwalkthrough: ${final}`);
process.exit(failure ? 1 : 0);
