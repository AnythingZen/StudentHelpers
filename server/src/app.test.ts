import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, topicHintFromUrl } from './app.js';
import { addChallenges } from './challenges.js';
import { withFallback } from './brain.js';
import { createFallbackBrain, freshWorld, loadFixture } from './fallbackBrain.js';
import type { Brain } from './brain.js';
import type { ServerWorld } from './contract.js';

let clock = 1_000_000;
const setup = (over: { brain?: Brain; world?: ServerWorld } = {}) => {
  const built = createApp({ brain: over.brain ?? createFallbackBrain({ plantDelayMs: 0 }), now: () => clock, log: () => {} });
  const world = over.world ?? { ...freshWorld(loadFixture('maths')), worldId: 'OAK7' };
  built.store.put(world);
  return { ...built, http: request(built.app), world };
};
beforeEach(() => { clock = 1_000_000; });

const reflect = (http: ReturnType<typeof request>, body: object) =>
  http.post('/api/reflect').send({ worldId: 'OAK7', playerId: 'p1', name: 'Alex', rating: 3, ...body });

const answer = (http: request.Agent | ReturnType<typeof request>, body: object) =>
  (http as ReturnType<typeof request>).post('/api/answer').send({ worldId: 'OAK7', playerId: 'p1', ...body });

describe('POST /api/world', () => {
  it('returns a room code at once, then the forest grows to ready', async () => {
    const { http, store } = setup();
    const res = await http.post('/api/world').field({ level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions', sourceKind: 'prompt' });
    expect(res.status).toBe(202);
    expect(res.body.worldId).toMatch(/^[A-Z0-9]{4}$/);
    await store.settled(res.body.worldId);
    const state = await http.get(`/api/state/${res.body.worldId}`);
    expect(state.body.status).toBe('ready');
    expect(state.body.world.trees.length).toBeGreaterThan(0);
  });

  it('never sends an answer key to the browser', async () => {
    const { http } = setup();
    const res = await http.get('/api/state/OAK7');
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('answerIndex');
    expect(json).not.toContain('answerText');
  });

  it('accepts a real-looking PDF', async () => {
    const { http, store } = setup();
    const res = await http.post('/api/world')
      .field({ level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions', sourceKind: 'pdf' })
      .attach('pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'worksheet.pdf');
    expect(res.status).toBe(202);
    await store.settled(res.body.worldId);
    expect(store.get(res.body.worldId)!.source).toMatchObject({ kind: 'pdf', filename: 'worksheet.pdf' });
  });

  it('rejects a missing PDF, a non-PDF, and an encrypted PDF with readable messages', async () => {
    const { http } = setup();
    const base = { level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions', sourceKind: 'pdf' };
    expect((await http.post('/api/world').field(base)).status).toBe(400);
    const notPdf = await http.post('/api/world').field(base).attach('pdf', Buffer.from('hello'), 'x.pdf');
    expect(notPdf.status).toBe(400);
    const locked = await http.post('/api/world').field(base)
      .attach('pdf', Buffer.from('%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF'), 'locked.pdf');
    expect(locked.status).toBe(422);
    expect(locked.body.error).toMatch(/password/i);
  });

  it('rejects a bad link, too little text, and missing syllabus fields', async () => {
    const { http } = setup();
    const base = { level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' };
    expect((await http.post('/api/world').field({ ...base, sourceKind: 'url', url: 'not a url' })).status).toBe(400);
    expect((await http.post('/api/world').field({ ...base, sourceKind: 'url', url: 'ftp://x.org/a' })).status).toBe(400);
    expect((await http.post('/api/world').field({ ...base, sourceKind: 'text', text: 'too short' })).status).toBe(400);
    expect((await http.post('/api/world').field({ sourceKind: 'prompt' })).status).toBe(400);
  });

  it('marks the world failed, not crashed, when the brain throws', async () => {
    const broken: Brain = { ...createFallbackBrain(), name: 'broken', spawnWorld: async () => { throw new Error('boom'); } };
    const { http, store } = setup({ brain: broken });
    const res = await http.post('/api/world').field({ level: 'P5', subject: 'Maths', topic: 'F', sourceKind: 'prompt' });
    await store.settled(res.body.worldId);
    expect((await http.get(`/api/state/${res.body.worldId}`)).body.status).toBe('failed');
  });
});

describe('POST /api/answer', () => {
  it('a correct choice adds XP and a plank', async () => {
    const { http } = setup();
    const res = await answer(http, { treeId: 't1', response: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ correct: true, treeState: 'healthy', xp: 10, saplingId: null, misconceptionId: null });
    expect(res.body.conceptHealth).toBeGreaterThan(0);
  });

  it('a confident wrong answer withers the tree, diagnoses it, and plants a sapling up the path', async () => {
    const { http, store } = setup();
    await answer(http, { treeId: 't1', response: 0 });
    await answer(http, { treeId: 't2', response: 'no, same amount, both divided by 5' });
    await answer(http, { treeId: 't3', response: 0 });
    expect((await reflect(http, { conceptId: 'c1' })).status).toBe(200); // p1's first mission done -> c2 unlocks
    const res = await answer(http, { treeId: 't4', response: 0, confidence: 'high' }); // 5/8 — wrong
    expect(res.body).toMatchObject({ correct: false, treeState: 'withered', calibration: 'overconfident' });
    expect(res.body.misconceptionLabel).toBeTruthy();
    expect(res.body.scaffoldHint).toMatch(/\?$/);
    const w = store.require('OAK7');
    const sap = w.trees.find(t => t.id === res.body.saplingId)!;
    expect(sap.pos[2]).toBeLessThan(w.trees.find(t => t.id === 't4')!.pos[2]);
  });

  it('retrying the withered tree correctly regrows it', async () => {
    const { http } = setup();
    for (const [treeId, response] of [['t1', 0], ['t3', 0], ['t2', 'no, same amount, both divided by 5']] as const) {
      await answer(http, { treeId, response });
    }
    await reflect(http, { conceptId: 'c1' });
    await answer(http, { treeId: 't4', response: 0 });
    expect((await answer(http, { treeId: 't4', response: 1 })).body.treeState).toBe('regrown');
  });

  it('refuses a tree in a locked grove', async () => {
    const { http } = setup();
    const res = await answer(http, { treeId: 't4', response: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked/i);
  });

  it('validates the response against the tree kind', async () => {
    const { http } = setup();
    expect((await answer(http, { treeId: 't1', response: 9 })).status).toBe(400);
    expect((await answer(http, { treeId: 't1', response: 'three quarters' })).status).toBe(400);
    expect((await answer(http, { treeId: 't2', response: 2 })).status).toBe(400);
    expect((await answer(http, { treeId: 'nope', response: 0 })).status).toBe(404);
    expect((await http.post('/api/answer').send({ worldId: 'ZZZZ', treeId: 't1', response: 0 })).status).toBe(404);
  });

  it('teaching Mia returns her reaction and which rubric points landed', async () => {
    const { http } = setup();
    for (const [treeId, response] of [['t1', 0], ['t3', 0], ['t2', 'no, same amount, both divided by 5']] as const) {
      await answer(http, { treeId, response });
    }
    await reflect(http, { conceptId: 'c1' });
    const res = await answer(http, { treeId: 't15', response:
      "You can't compare the top numbers unless the bottom numbers match. Make a common denominator: " +
      '3/4 = 6/8, and 6/8 is bigger than 5/8 because the denominator sets the size of each part.' });
    expect(res.body.correct).toBe(true);
    expect(res.body.explanation.encouragement).toBeTruthy();
    expect(res.body.xp).toBe(30 + 25 + 20); // 3 answers, Mia, and the finished first mission
  });

  it('returns JSON, not a crash, for malformed JSON', async () => {
    const { http } = setup();
    const res = await http.post('/api/answer').set('content-type', 'application/json').send('{"oops"');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('POST /api/next-session', () => {
  it('bumps the session and brings answered trees back to the entrance', async () => {
    const { http, store } = setup();
    await answer(http, { treeId: 't1', response: 0 });
    const res = await http.post('/api/next-session/OAK7');
    expect(res.status).toBe(200);
    expect(res.body.world.sessionIndex).toBe(1);
    expect(res.body.reviewCount).toBe(1);
    expect(store.require('OAK7').trees.find(t => t.id === 't1')!.pos[2]).toBeGreaterThan(-10);
  });
});

describe('GET /api/teacher', () => {
  it('shows the seeded class plus live answers, sorted by misconception', async () => {
    const { http } = setup();
    const res = await http.get('/api/teacher/OAK7');
    expect(res.body.misconceptions[0]).toMatchObject({ id: 'm3', count: 11 });
    expect(res.body.weakest.label).toMatch(/numerator/i);
    expect(res.body.classWorld).toMatchObject({ total: 45, mastered: 36 });
    expect(res.body.demoSeeded).toBe(true);
    expect(res.body.concepts.find((c: { id: string }) => c.id === 'c5').locked).toBe(true);
  });
});

describe('generatedBy — a sample world is never passed off as AI output', () => {
  it('labels a world from the fallback brain as sample', async () => {
    const { http, store } = setup();
    const res = await http.post('/api/world').field({ level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions', sourceKind: 'prompt' });
    await store.settled(res.body.worldId);
    expect((await http.get(`/api/state/${res.body.worldId}`)).body.world.generatedBy).toBe('sample');
  });

  it('labels a world from a real brain as ai', async () => {
    const fallback = createFallbackBrain({ plantDelayMs: 0 });
    const aiBrain: Brain = { ...fallback, name: 'zen', spawnWorld: async (i, s, on) => {
      const w = await fallback.spawnWorld(i, s, on);
      const { generatedBy: _ignored, ...fromModel } = w;       // a model's output carries no label
      return { ...fromModel, concepts: w.concepts.map(c => ({ ...c, name: `AI ${c.name}` })) };
    } };
    const { http, store } = setup({ brain: aiBrain });
    const res = await http.post('/api/world').field({ level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions', sourceKind: 'prompt' });
    await store.settled(res.body.worldId);
    expect((await http.get(`/api/state/${res.body.worldId}`)).body.world.generatedBy).toBe('ai');
  });
});

describe('demo seed honesty', () => {
  it('never attaches seeded class counts to an AI-generated world, even when ids collide', async () => {
    // A model-generated world reuses ids like "m3" for completely different misconceptions.
    const base = freshWorld(loadFixture('maths'));
    const ai: ServerWorld = {
      ...base, worldId: 'AIAI',
      misconceptions: base.misconceptions.map(m => ({ ...m, label: `AI-generated: ${m.id}` })),
    };
    const { http } = setup({ world: ai });
    const view = (await http.get('/api/teacher/AIAI')).body;
    expect(view.demoSeeded).toBe(false);
    expect(view.misconceptions).toEqual([]);          // no fake "11 students" on a real label
    expect(view.classWorld.total).toBe(1);
  });
});

describe('POST /api/deploy-quest', () => {
  it('adds new trees for one misconception near the entrance', async () => {
    const { http, store } = setup();
    const res = await http.post('/api/deploy-quest/OAK7').send({ misconceptionId: 'm3' });
    expect(res.status).toBe(200);
    expect(res.body.addedTreeIds.length).toBeGreaterThan(0);
    const w = store.require('OAK7');
    for (const id of res.body.addedTreeIds) expect(w.trees.find(t => t.id === id)!.pos[2]).toBeGreaterThan(-15);
    expect((await http.post('/api/deploy-quest/OAK7').send({ misconceptionId: 'nope' })).status).toBe(404);
  });
});

describe('Deploy Quest never punishes the class', () => {
  it('does not lower mastery or re-lock a grove, and its trees clear at the next session', async () => {
    const { http, store } = setup();
    for (const [treeId, response] of [['t1', 0], ['t3', 0], ['t2', 'no, same amount, both divided by 5']] as const) {
      await answer(http, { treeId, response });
    }
    const before = (await http.get('/api/teacher/OAK7')).body;
    const healthOf = (v: { concepts: Array<{ id: string; health: number; locked: boolean }> }, id: string) => v.concepts.find(c => c.id === id)!;
    expect(healthOf(before, 'c1').health).toBe(1);
    expect(healthOf(before, 'c2').locked).toBe(false);

    const res = await http.post('/api/deploy-quest/OAK7').send({ misconceptionId: 'm1' }); // m1 belongs to c1
    expect(res.body.addedTreeIds.length).toBeGreaterThan(0);
    const after = (await http.get('/api/teacher/OAK7')).body;
    expect(healthOf(after, 'c1').health).toBe(1);        // the intervention didn't dilute mastery
    expect(healthOf(after, 'c2').locked).toBe(false);    // …or re-lock the grove the student had opened

    await http.post('/api/next-session/OAK7');
    const ids = new Set(store.require('OAK7').trees.map(t => t.id));
    for (const id of res.body.addedTreeIds) expect(ids.has(id)).toBe(false);
  });
});

describe('presence', () => {
  it('lists real players and seeded classmates, including Mia, and forgets stale players', async () => {
    const { http } = setup();
    expect((await http.post('/api/presence/OAK7').send({ playerId: 'p2', name: 'Roshan', pos: [1, 0, 2], yaw: 0 })).status).toBe(200);
    let players = (await http.get('/api/presence/OAK7?playerId=p1')).body.players;
    expect(players.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['Roshan', 'Aisha', 'Wei Jie', 'Mia']));
    clock += 5_000;
    players = (await http.get('/api/presence/OAK7')).body.players;
    expect(players.some((p: { name: string }) => p.name === 'Roshan')).toBe(false);
  });

  it('rejects a bad position', async () => {
    const { http } = setup();
    expect((await http.post('/api/presence/OAK7').send({ playerId: 'p', name: 'x', pos: [1, 2], yaw: 0 })).status).toBe(400);
  });
});

describe('misc', () => {
  it('health, world list, and JSON 404s for unknown API routes', async () => {
    const { http } = setup();
    expect((await http.get('/api/health')).body).toMatchObject({ ok: true, brain: 'fallback' });
    expect((await http.get('/api/worlds')).body.worlds[0]).toMatchObject({ worldId: 'OAK7', status: 'ready' });
    const missing = await http.get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBeTruthy();
  });
});

describe('missions, per student', () => {
  it('a mission completes only through reflection, and unlocks the next grove for that student alone', async () => {
    const { http } = setup();
    expect((await reflect(http, { conceptId: 'c1' })).body.error).toMatch(/not yet/i);
    for (const [treeId, response] of [['t1', 0], ['t3', 0], ['t2', 'no, same amount, both divided by 5']] as const) {
      await answer(http, { treeId, response, name: 'Alex' });
    }
    const done = await reflect(http, { conceptId: 'c1', rating: 4, note: 'divide top and bottom by the same number' });
    expect(done.status).toBe(200);
    expect(done.body.accuracy).toBe(1);
    expect(done.body.me.missions.find((m: { conceptId: string }) => m.conceptId === 'c2').unlocked).toBe(true);
    expect((await answer(http, { treeId: 't4', response: 1 })).status).toBe(200);
    expect((await answer(http, { treeId: 't4', response: 1, playerId: 'p2' })).status).toBe(409);

    const state = await http.get('/api/state/OAK7?playerId=p1');
    expect(state.body.me.current).toBe('c2');
    expect(state.body.mastery).toBeCloseTo(1 / 5);
    expect(JSON.stringify(state.body)).not.toContain('answerIndex');
  });

  it('a student\'s sapling is theirs: other students don\'t see it', async () => {
    const { http } = setup();
    const res = await answer(http, { treeId: 't1', response: 2 });
    expect(res.body.saplingId).toBeTruthy();
    const mine = (await http.get('/api/state/OAK7?playerId=p1')).body.world.trees;
    const theirs = (await http.get('/api/state/OAK7?playerId=p2')).body.world.trees;
    expect(mine.some((t: { id: string }) => t.id === res.body.saplingId)).toBe(true);
    expect(theirs.some((t: { id: string }) => t.id === res.body.saplingId)).toBe(false);
    expect(theirs.find((t: { id: string }) => t.id === 't1').state).toBe('healthy');
  });

  it('the teacher sees each student: mission, status and last misconception', async () => {
    const { http } = setup();
    await answer(http, { treeId: 't1', response: 2, name: 'Alex', confidence: 'high' });
    await http.post('/api/presence/OAK7').send({ playerId: 'p9', name: 'Bea', pos: [0, 0, 0], yaw: 0 });
    const view = (await http.get('/api/teacher/OAK7')).body;
    const names = view.students.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual(['Alex', 'Bea']);
    const alex = view.students.find((s: { name: string }) => s.name === 'Alex');
    expect(alex.currentMission.conceptId).toBe('c1');
    expect(alex.calibration.overconfident).toBe(1);
    expect(alex.lastMisconception).toBeTruthy();
  });
});

describe('a link the AI cannot read', () => {
  it('grows a real world from the link\'s topic instead of passing off the sample, and tells the teacher', async () => {
    const fallback = createFallbackBrain({ plantDelayMs: 0 });
    const aiWorld = { ...freshWorld(loadFixture('maths')), generatedBy: undefined };
    const topics: string[] = [];
    const zen: Brain = {
      ...fallback, name: 'zen',
      spawnWorld: async (input, syllabus) => {
        if (input.kind === 'url') throw new Error('returned only 303 chars of text (JS-rendered page?)');
        topics.push(syllabus.topic);
        return aiWorld as ServerWorld;
      },
    };
    const { http, store } = setup({ brain: withFallback(zen, fallback, { spawnTimeoutMs: 1000, callTimeoutMs: 1000, log: () => {} }) });
    const res = await http.post('/api/world').field({
      level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions', sourceKind: 'url',
      url: 'https://www.khanacademy.org/math/arithmetic/fraction-arithmetic/arith-review-equivalent-fractions/a/equivalent-fractions',
    });
    await store.settled(res.body.worldId);
    const w = store.require(res.body.worldId);
    expect(w.generatedBy).toBe('ai');
    expect(topics).toEqual(['Fractions: equivalent fractions']);
    expect(w.notice).toMatch(/khanacademy\.org/);
    expect((await http.get(`/api/teacher/${w.worldId}`)).body.notice).toMatch(/generated from its topic/);
  });

  it('pulls topic words out of a link', () => {
    expect(topicHintFromUrl('https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3')).toBe('fractions');
    expect(topicHintFromUrl('https://en.wikipedia.org/wiki/Photosynthesis')).toBe('photosynthesis');
    expect(topicHintFromUrl('not a url')).toBe('');
  });
});

describe('hands-on challenges through the API', () => {
  it('grades the cake by count, diagnoses the numerator mistake, and counts toward the mission', async () => {
    const { http } = setup({ world: addChallenges({ ...freshWorld(loadFixture('maths')), worldId: 'OAK7' }) });
    const wrong = await answer(http, { treeId: 'c1-cake', response: 2, confidence: 'high' });
    expect(wrong.body).toMatchObject({ correct: false, misconceptionId: 'c1-cake-numerator', calibration: 'overconfident' });
    expect(wrong.body.misconceptionLabel).toMatch(/top number/);
    expect(wrong.body.scaffoldHint).toMatch(/\?$/);
    expect((await answer(http, { treeId: 'c1-cake', response: 7 })).status).toBe(400);
    expect((await answer(http, { treeId: 'c1-cake', response: 4 })).body.correct).toBe(true);
    const me = (await http.get('/api/state/OAK7?playerId=p1')).body.me;
    expect(me.missions[0].objectives.find((o: { kind: string }) => o.kind === 'model')).toMatchObject({ done: true });
  });
});
