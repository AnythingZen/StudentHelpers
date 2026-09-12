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
// carries 2:30, a closing slide takes the rest. It is data-driven, so it works on ANY
// world the AI generates: it reads the world from the server, and finds right answers by
// trying stones — it never needs the answer key, which never reaches a browser. One
// question is played out in full on camera; the rest of that grove is answered by the
// same student off camera ("A few answers later…"), so the edit stays honest and short.
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

const nextAnswer = page => page.waitForResponse(
  r => r.url().includes('/api/answer') && r.request().method() === 'POST', { timeout: 90_000 }).then(r => r.json());

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
/**
 * A question played out on camera: stones, the fox, and — when it happens — a wrong answer,
 * the AI diagnosis, Professor Byte, the sapling and the retry. The recorder can't know the
 * right answer, so it tries stones from the last option backwards; the caller moves on to
 * another question until a genuine wrong answer has been shown.
 */
async function showcaseQuestion(page, tree, grove, first) {
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.stones().length > 0, null, { timeout: 8_000 });
  if (first) {
    await beat(page, `Quest: ${grove.questName}`, tree.citation ? clip(`📄 Worksheet p.${tree.citation.page} — every question cites its source`, 100) : '',
      `Walk up to a tree and accept its quest. Answer stones rise — you answer by walking onto one.${tree.citation ? ' And every question shows the page of the worksheet it came from.' : ''}`);
  } else {
    await beat(page, `Quest: ${grove.questName}`, 'another tree', '', 1500);
  }
  const stones = await page.evaluate(() => window.__game.stones());
  const order = stones.map((_, i) => i).reverse();
  let wrongShown = false;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (k > 0) {                                               // step off before the next stone can count
      const [px, pz] = await playerPos(page);
      const dx = tree.pos[0] - px, dz = tree.pos[2] - pz, d = Math.hypot(dx, dz) || 1;
      await walkTo(page, px + (dx / d) * 1.8, pz + (dz / d) * 1.8);
    }
    await walkTo(page, stones[i][0], stones[i][1]);
    await page.waitForSelector('#fox:not([hidden])', { timeout: 10_000 });
    await face(page, tree);
    if (first && k === 0) await beat(page, 'The fox asks: how sure are you?', '', 'The fox asks how sure you are — so the game can tell a guess from a real misunderstanding.');
    const response = nextAnswer(page);
    await page.keyboard.press(k === 0 ? 'Digit3' : 'Digit2');
    const r = await response;
    await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 90_000 });
    if (r.correct) {
      const bars = `XP ${r.xp} · mastery ${Math.round(r.mastery * 100)}% · retention ${Math.round(r.retention * 100)}%`;
      if (wrongShown) {
        await beat(page, 'Right — the tree regrows', bars,
          'Try again, get it right, and the tree grows back. XP jumps — but mastery only moves when you actually understand.');
      } else {
        await beat(page, 'Right first time — a plank for the bridge', bars,
          first ? 'Right answers add planks to the bridge that leads to the next grove.' : '', 2200);
      }
      return { wrongShown };
    }
    if (!wrongShown) {
      wrongShown = true;
      const known = r.misconceptionId && r.misconceptionId !== 'unclassified';
      await beat(page, r.calibration === 'overconfident' ? 'Confident — and wrong. The tree withers.' : 'Wrong — the tree withers',
        known ? clip(`AI diagnosis: “${r.misconceptionLabel}”`, 110) : 'Professor Byte asks a question back — never the answer',
        known
          ? `Wrong, and confident about it. The tree withers, the AI diagnoses the exact misconception — ${r.misconceptionLabel} — and Professor Byte asks a question back instead of giving the answer.`
          : 'Wrong, and confident about it. The tree withers, and Professor Byte asks a guiding question instead of giving the answer.',
        5500);
      if (r.saplingId) {
        await beat(page, 'A sapling of the same idea sprouts up the path', 'spaced practice, built into the world',
          'A sapling of the same idea sprouts further up the path — spaced practice, built into the world.');
      }
    }
  }
  throw new Error(`no stone was correct for tree ${tree.id}`);
}

// ---------------- off-camera answering ("A few answers later…") ----------------
/** The same student answers the rest of the grove through the real API until its bridge opens. */
async function finishGroveOffCamera(room, world, grove, playerId) {
  const trees = world.trees.filter(t => t.conceptId === grove.id && t.spawnedFrom === null && t.kind !== 'teach');
  for (const tree of trees) {
    const st = await api(`/api/state/${room}`);
    const base = st.world.trees.filter(t => t.conceptId === grove.id && t.spawnedFrom === null);
    if (base.filter(t => t.leitnerBox >= 2).length / base.length >= 0.6) return true;
    if (st.world.trees.find(t => t.id === tree.id)?.leitnerBox >= 2) continue;
    if (tree.kind === 'choice') {
      for (let i = 0; i < tree.choices.length; i++) {
        const r = await api('/api/answer', { worldId: room, treeId: tree.id, response: i, confidence: 'medium', playerId });
        if (r.correct) break;
      }
    } else {
      await api('/api/answer', { worldId: room, treeId: tree.id, response: tree.explanation, playerId });
    }
  }
  const st = await api(`/api/state/${room}`);
  const base = st.world.trees.filter(t => t.conceptId === grove.id && t.spawnedFrom === null);
  return base.filter(t => t.leitnerBox >= 2).length / base.length >= 0.6;
}

async function typeInBubble(page, text) {
  await page.keyboard.press('KeyE');
  const box = await page.waitForSelector('.bubble textarea', { timeout: 8_000 });
  await sleep(500);
  await box.focus();
  await page.keyboard.type(clip(text, 260), { delay: 9 });
  await sleep(300);
  const response = nextAnswer(page);
  await page.keyboard.press('Control+Enter');
  const r = await response;
  await page.waitForFunction(() => !window.__game.busy(), null, { timeout: 90_000 });
  return r;
}

// ---------------- the run ----------------
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1', args: ['--window-size=1300,800'] });
const teacherCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/teacher`, size: SIZE } });
const studentCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: `${OUT}/student`, size: SIZE } });
let failure = null;
let usedSample = false;
let brainName = '?';

try {
  brainName = (await api('/api/health')).brain;
  const aiConnected = brainName.startsWith('zen');
  console.log(`server brain: ${brainName}`);
  if (!aiConnected) console.warn('⚠️  The server is on the fallback brain — this video will show SAMPLE data, and say so.');

  // ===== Scene 1 — the teacher spawns a world =====
  const teacher = await teacherCtx.newPage();
  whoOf.set(teacher, 'teacher');
  clock.teacher = Date.now();
  await teacher.goto(`${BASE}/teacher.html`);
  let s = now('teacher');
  const usingPdf = Boolean(PDF && existsSync(PDF));
  if (usingPdf) await teacher.setInputFiles('#pdf', PDF);
  else await teacher.click('.tabs button[data-kind="prompt"]');
  await beat(teacher, 'The teacher uploads the worksheet she already uses', 'MOE Singapore · Primary 5 Maths · or paste a link, paste text, or pick a topic',
    'A teacher picks the syllabus — MOE Singapore, Primary 5 maths — and uploads the worksheet she already uses.');
  await teacher.click('#spawn');
  await teacher.waitForFunction(() => document.getElementById('room-code').textContent !== '—', null, { timeout: 60_000 });
  const room = (await teacher.textContent('#room-code')).trim();
  await label(teacher, aiConnected ? 'The AI reads it and grows a forest' : 'Building a forest from SAMPLE data — AI brain not connected',
    `Room code ${room}`, aiConnected ? 'The AI reads every page and turns it into a world: concepts become groves, questions become trees.' : '');
  await sleep(3200);
  segments.push({ who: 'teacher', start: s, end: now('teacher'), speed: 1 });

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
  s = now('teacher');
  await beat(teacher,
    usedSample ? `${plural(world.trees.length, 'question')} — SAMPLE DATA, AI brain not connected`
      : `${plural(world.concepts.length, 'grove')} and ${plural(world.trees.length, 'question')}, generated from the worksheet`,
    [speed > 1 ? `generation shown ×${speed}` : '', ladder ? `deepest grove: ${ladder.level}, locked until mastery` : ''].filter(Boolean).join(' · '),
    usedSample ? '' : `${plural(world.concepts.length, 'grove')}, ${plural(world.trees.length, 'question')}.${ladder ? ` The deepest grove is ${ladder.level} — locked until you've earned it.` : ''}`);
  segments.push({ who: 'teacher', start: s, end: now('teacher'), speed: 1 });
  console.log(`room ${room}: ${world.concepts.length} concepts, ${world.trees.length} trees${usedSample ? ' (SAMPLE DATA)' : ''}`);

  // ===== Scene 2 — a student plays =====
  const student = await studentCtx.newPage();
  whoOf.set(student, 'student');
  clock.student = Date.now();
  await student.goto(`${BASE}/?room=${room}&name=Alex&debug=1`);
  await student.waitForFunction(() => window.__game, null, { timeout: 30_000 });
  const playerId = await student.evaluate(() => sessionStorage.getItem('mg-player'));
  s = now('student');

  const root = world.concepts.find(c => c.prerequisites.length === 0);
  const next = world.concepts.find(c => c.prerequisites.length > 0 && c.prerequisites.every(p => p === root.id));
  const miaTree = world.trees.find(t => t.kind === 'teach' && t.spawnedFrom === null);   // where the server stands Mia
  const showcaseTrees = world.trees.filter(t => t.conceptId === root.id && t.spawnedFrom === null && t.kind === 'choice').slice(0, 3);

  await label(student, 'A student joins and walks into the forest', 'classmates share the world · XP, mastery and retention top-left',
    'A student joins with the room code. It’s a shared 3D world — classmates are exploring too.');
  await walkTo(student, 0, root.centre[2] + 12);
  for (const [n, tree] of showcaseTrees.entries()) {          // until a real wrong answer is on camera
    await approach(student, tree);
    if ((await showcaseQuestion(student, tree, root, n === 0)).wrongShown) break;
  }
  segments.push({ who: 'student', start: s, end: now('student'), speed: 1 });

  // Mia first if she's in this grove, then the rest of the grove off camera.
  if (miaTree?.conceptId === root.id) {
    s = now('student');
    await approach(student, miaTree);
    await face(student, miaTree);
    await label(student, 'Mia is stuck — help her', 'teaching someone else is one of the strongest ways to learn',
      'A classmate is stuck. Explaining it to Mia — teaching — is one of the strongest ways to learn it yourself.');
    const r = await typeInBubble(student, studentVoice(miaTree.rubric ?? []));
    await beat(student, r.correct ? 'Mia gets it' : 'Mia is still unsure', `${r.explanation?.hit.length ?? 0} of ${(miaTree.rubric ?? []).length} rubric points hit · graded by the AI`,
      r.correct ? 'The AI checks the explanation against a rubric — and Mia gets it.' : 'The AI checks the explanation against a rubric, and shows what was missing.', 3500);
    segments.push({ who: 'student', start: s, end: now('student'), speed: 1 });
  }

  if (next) {
    const opened = await finishGroveOffCamera(room, world, root, playerId);
    if (!opened) throw new Error(`could not open the bridge to ${next.questName}`);
    await sleep(2600);                                         // let the client poll the new state
    s = now('student');
    await beat(student, 'A few answers later — the bridge is complete', 'locked groves only open through demonstrated mastery',
      'A few answers later, the bridge is complete. Groves only unlock through demonstrated mastery — not by clicking through questions.');
    await travelTo(student, next);
    segments.push({ who: 'student', start: s, end: now('student'), speed: 1 });
    if (miaTree?.conceptId === next.id) {
      s = now('student');
      await approach(student, miaTree);
      await face(student, miaTree);
      await label(student, 'Mia is stuck — help her', 'teaching someone else is one of the strongest ways to learn',
        'A classmate is stuck. Explaining it to Mia — teaching — is one of the strongest ways to learn it yourself.');
      const r = await typeInBubble(student, studentVoice(miaTree.rubric ?? []));
      await beat(student, r.correct ? 'Mia gets it' : 'Mia is still unsure', `${r.explanation?.hit.length ?? 0} of ${(miaTree.rubric ?? []).length} rubric points hit · graded by the AI`,
        r.correct ? 'The AI checks the explanation against a rubric — and Mia gets it.' : 'The AI checks the explanation against a rubric, and shows what was missing.', 3500);
      segments.push({ who: 'student', start: s, end: now('student'), speed: 1 });
    }
  }

  // ===== Scene 3 — the teacher already knows, and acts =====
  await teacher.bringToFront();
  await sleep(2500);                                           // let the console poll
  const view = await api(`/api/teacher/${room}`);
  const top = view.misconceptions[0];
  s = now('teacher');
  await beat(teacher, 'The teacher sees what was misunderstood — live',
    top ? clip(`“${top.label}” · ${plural(top.count, 'student')}`, 110) : 'the map shows which groves are struggling',
    top ? `Meanwhile the teacher sees it live — not who got question four wrong, but what they misunderstood: ${top.label}.` : 'Meanwhile the teacher sees, live, which groves are struggling.',
    4000);
  if (top) {
    await teacher.click('.misconceptions li:first-child .deploy');
    await teacher.waitForSelector('.toast', { timeout: 90_000 });
    await beat(teacher, 'Deploy Quest: the teacher chooses the intervention', 'focus trees appear in the students’ forest',
      'One click sends a focus quest on that misconception into the students’ forest. The AI drafts it — the teacher decides.');
  }
  await teacher.click('#next-session');
  await teacher.waitForSelector('.toast', { timeout: 20_000 });
  await beat(teacher, 'Next session: the Memory Quest', 'what was answered today comes back to the entrance',
    'Next session, today’s trees come back as a Memory Quest — so it’s still there on Thursday.');
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
