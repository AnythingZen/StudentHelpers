// Builder C's Express app: the contract's endpoints over an in-memory store.
// createApp() takes its dependencies so tests can inject a brain and a clock.

import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Brain } from './brain.js';
import { withTimeout } from './brain.js';
import { toClientWorld } from './clientWorld.js';
import type {
  AnswerResponse, Calibration, Confidence, Explanation, ServerWorld, SourceKind, SpawnInput, Syllabus,
} from './contract.js';
import { ensureLayout, layoutReviews, placeNewTrees, placeSapling } from './layout.js';
import { PresenceBoard } from './presence.js';
import { mintRoomCode } from './roomCode.js';
import { bars, conceptHealth, isLocked, nextSession, schedule } from './schedule.js';
import { HttpError, WorldStore } from './store.js';
import { DEMO_SEED, EMPTY_SEED, teacherView, type DemoSeed } from './teacher.js';

const MAX_PDF_BYTES = 32 * 1024 * 1024;   // Anthropic's request limit
const MAX_TEXT_CHARS = 200_000;
const MIN_ANSWER = 1;
const MAX_ANSWER = 4_000;

export interface AppDeps {
  brain: Brain;
  store?: WorldStore;
  presence?: PresenceBoard;
  now?: () => number;
  spawnTimeoutMs?: number;
  demoSeed?: DemoSeed | null;
  log?: (msg: string) => void;
  // Registered after the API routes but before the error handlers, e.g. static files.
  mount?: (app: express.Express) => void;
}

const vec3 = z.tuple([z.number(), z.number(), z.number()])
  .refine(v => v.every(Number.isFinite), 'position must be finite numbers');

const syllabusFields = z.object({
  system: z.literal('MOE-SG').default('MOE-SG'),
  level: z.string().trim().min(1).max(40),
  subject: z.string().trim().min(1).max(60),
  topic: z.string().trim().min(1).max(80),
  sourceKind: z.enum(['pdf', 'url', 'text', 'prompt']),
  url: z.string().trim().max(2000).optional(),
  text: z.string().max(MAX_TEXT_CHARS).optional(),
  label: z.string().trim().max(120).optional(),
});

const answerBody = z.object({
  worldId: z.string().min(1),
  treeId: z.string().min(1),
  response: z.union([z.number(), z.string()]),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  playerId: z.string().trim().min(1).max(40).optional(),
});

const presenceBody = z.object({
  playerId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(24),
  pos: vec3,
  yaw: z.number().refine(Number.isFinite, 'yaw must be finite'),
});

const deployBody = z.object({ misconceptionId: z.string().min(1) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`);
  }
  return r.data;
}

const param = (req: Request, name: string) => String(req.params[name] ?? '').toUpperCase();

function calibrationOf(confidence: Confidence | undefined, correct: boolean): Calibration | null {
  if (!confidence) return null;
  if (confidence === 'high' && !correct) return 'overconfident';
  if (confidence === 'low' && correct) return 'underconfident';
  return 'calibrated';
}

function requireReady(world: ServerWorld): void {
  if (world.status !== 'ready') throw new HttpError(409, `World ${world.worldId} is still ${world.status}`);
}

function spawnInputFrom(kind: SourceKind, fields: z.infer<typeof syllabusFields>, file?: Express.Multer.File): SpawnInput {
  switch (kind) {
    case 'pdf': {
      if (!file) throw new HttpError(400, 'Choose a PDF to upload.');
      const head = file.buffer.subarray(0, 5).toString('latin1');
      if (head !== '%PDF-') throw new HttpError(400, "That file isn't a PDF.");
      // Encrypted PDFs declare an /Encrypt dictionary in the trailer.
      if (file.buffer.includes('/Encrypt')) {
        throw new HttpError(422, 'This PDF is password-protected. Save an unprotected copy, or paste the text instead.');
      }
      return { kind: 'pdf', filename: file.originalname || 'worksheet.pdf', data: new Uint8Array(file.buffer) };
    }
    case 'url': {
      let u: URL;
      try { u = new URL(fields.url ?? ''); } catch { throw new HttpError(400, 'Enter a full link, starting with https://'); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Only web links (http or https) are supported.');
      return { kind: 'url', url: u.toString() };
    }
    case 'text': {
      const text = fields.text?.trim() ?? '';
      if (text.length < 20) throw new HttpError(400, 'Paste a little more text — at least a couple of sentences.');
      return { kind: 'text', label: fields.label || 'Pasted text', text };
    }
    case 'prompt':
      return { kind: 'prompt' };
  }
}

export function createApp(deps: AppDeps) {
  const store = deps.store ?? new WorldStore();
  const presence = deps.presence ?? new PresenceBoard();
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.error(m));
  const seed = deps.demoSeed === null ? EMPTY_SEED : (deps.demoSeed ?? DEMO_SEED);
  const { brain } = deps;
  const upload = multer({ limits: { fileSize: MAX_PDF_BYTES, files: 1 } });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const stateOf = (world: ServerWorld) => ({
    status: world.status,
    world: toClientWorld(world),
    ...bars(world, store.eventsFor(world.worldId)),
  });

  app.get('/api/health', (_req, res) => { res.json({ ok: true, brain: brain.name, worlds: store.list().length }); });

  app.get('/api/worlds', (_req, res) => {
    res.json({ worlds: store.list().map(w => ({ worldId: w.worldId, subject: w.subject, status: w.status, trees: w.trees.length })) });
  });

  // ---- POST /api/world — returns the room code immediately; the forest grows in the background
  app.post('/api/world', upload.single('pdf'), (req, res) => {
    const fields = parse(syllabusFields, req.body ?? {});
    const syllabus: Syllabus = { system: 'MOE-SG', level: fields.level, subject: fields.subject, topic: fields.topic };
    const input = spawnInputFrom(fields.sourceKind, fields, req.file);
    const worldId = mintRoomCode(store.codes());

    store.put({
      worldId, syllabus, status: 'growing', sessionIndex: 0,
      subject: `${syllabus.level} ${syllabus.subject} — ${syllabus.topic}`,
      source: input.kind === 'pdf' ? { kind: 'pdf', filename: input.filename, pages: 0 }
        : input.kind === 'url' ? { kind: 'url', url: input.url, title: input.url }
        : input.kind === 'text' ? { kind: 'text', label: input.label, chars: input.text.length }
        : { kind: 'prompt', text: `${syllabus.level} ${syllabus.subject} — ${syllabus.topic}` },
      concepts: [], misconceptions: [], trees: [],
    });

    const job = (async () => {
      try {
        const final = await withTimeout(
          brain.spawnWorld(input, syllabus, partial => {
            const current = store.get(worldId);
            if (current?.status === 'growing') store.put(ensureLayout({ ...current, ...partial, worldId, status: 'growing' }));
          }),
          deps.spawnTimeoutMs ?? 90_000, `spawn ${worldId}`,
        );
        store.put(ensureLayout({ ...final, worldId, status: 'ready', sessionIndex: 0 }));
      } catch (err) {
        log(`[world ${worldId}] spawn failed: ${(err as Error).message}`);
        store.update(worldId, w => ({ ...w, status: 'failed' }));
      }
    })();
    store.setPending(worldId, job);
    res.status(202).json({ worldId });
  });

  // ---- GET /api/state/:worldId
  app.get('/api/state/:worldId', (req, res) => {
    res.json(stateOf(store.require(param(req, 'worldId'))));
  });

  // ---- POST /api/answer — grades server-side, diagnoses, schedules, logs
  app.post('/api/answer', async (req, res) => {
    const body = parse(answerBody, req.body);
    const worldId = body.worldId.toUpperCase();
    const world = store.require(worldId);
    requireReady(world);
    const tree = world.trees.find(t => t.id === body.treeId);
    if (!tree) throw new HttpError(404, `No tree ${body.treeId} in ${worldId}`);
    if (isLocked(world, tree.conceptId)) {
      throw new HttpError(409, 'This grove is still locked — rebuild the bridge first.');
    }

    let correct: boolean;
    let explanation: Explanation | undefined;
    if (tree.kind === 'choice') {
      const n = body.response;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= (tree.choices?.length ?? 0)) {
        throw new HttpError(400, 'response must be the index of one of the choices');
      }
      correct = n === tree.answerIndex;
    } else {
      const text = typeof body.response === 'string' ? body.response.trim() : '';
      if (text.length < MIN_ANSWER || text.length > MAX_ANSWER) {
        throw new HttpError(400, `response must be ${MIN_ANSWER}–${MAX_ANSWER} characters of text`);
      }
      if (tree.kind === 'recall') {
        correct = (await brain.gradeRecall(tree, text)).correct;
      } else {
        explanation = await brain.gradeExplanation(tree, text);
        correct = explanation.passed;
      }
    }

    // Teach trees get Mia's reaction instead of a misconception diagnosis.
    const diagnosis = !correct && tree.kind !== 'teach' ? await brain.diagnose(tree, body.response, world) : null;

    // Re-read: another answer may have landed while we awaited the brain.
    const current = store.require(worldId);
    const before = new Set(current.trees.map(t => t.id));
    let next = schedule(current, tree.id, correct);
    const sapling = next.trees.find(t => !before.has(t.id));
    if (sapling) next = placeSapling(next, sapling.id);
    store.put(next);

    // A brain may return an id that isn't in this world; never put that on a heatmap.
    const known = diagnosis && current.misconceptions.some(m => m.id === diagnosis.misconceptionId);
    const misconceptionId = diagnosis ? (known ? diagnosis.misconceptionId : 'unclassified') : null;
    store.addEvent(worldId, {
      ts: now(), sessionIndex: current.sessionIndex, playerId: body.playerId ?? 'anonymous',
      treeId: tree.id, conceptId: tree.conceptId, kind: tree.kind, correct,
      misconceptionId, confidence: body.confidence ?? null,
    });

    const response: AnswerResponse = {
      correct,
      treeState: next.trees.find(t => t.id === tree.id)!.state,
      misconceptionId,
      misconceptionLabel: misconceptionId
        ? current.misconceptions.find(m => m.id === misconceptionId)?.label ?? 'Not sure yet — keep going'
        : null,
      scaffoldHint: diagnosis?.scaffoldHint ?? null,
      saplingId: sapling?.id ?? null,
      conceptHealth: conceptHealth(next, tree.conceptId),
      calibration: calibrationOf(body.confidence, correct),
      ...(explanation ? { explanation } : {}),
      ...bars(next, store.eventsFor(worldId)),
    };
    res.json(response);
  });

  // ---- POST /api/next-session/:worldId — the Memory Quest
  app.post('/api/next-session/:worldId', (req, res) => {
    const worldId = param(req, 'worldId');
    const world = store.require(worldId);
    requireReady(world);
    // Reviews are trees answered this session; saplings count toward their root tree.
    const rootOf = (id: string) => world.trees.find(t => t.id === id)?.spawnedFrom ?? id;
    const reviewIds = new Set(
      store.eventsFor(worldId).filter(e => e.sessionIndex === world.sessionIndex).map(e => rootOf(e.treeId)),
    );
    const next = layoutReviews(nextSession(world), reviewIds);
    store.put(next);
    res.json({ ...stateOf(next), reviewCount: [...reviewIds].filter(id => next.trees.some(t => t.id === id && t.leitnerBox < 3)).length });
  });

  // ---- GET /api/teacher/:worldId
  app.get('/api/teacher/:worldId', (req, res) => {
    const world = store.require(param(req, 'worldId'));
    res.json(teacherView(world, store.eventsFor(world.worldId), seed));
  });

  // ---- POST /api/deploy-quest/:worldId — the educator chooses; the brain drafts the trees
  app.post('/api/deploy-quest/:worldId', async (req, res) => {
    const worldId = param(req, 'worldId');
    const { misconceptionId } = parse(deployBody, req.body);
    const world = store.require(worldId);
    requireReady(world);
    if (!world.misconceptions.some(m => m.id === misconceptionId)) {
      throw new HttpError(404, `No misconception ${misconceptionId} in ${worldId}`);
    }
    const quest = await brain.focusQuest(world, misconceptionId);
    const current = store.require(worldId);
    const taken = new Set(current.trees.map(t => t.id));
    // Focus trees are today's practice, not part of the grove: marked like saplings
    // (spawnedFrom set) so they never dilute mastery — deploying an intervention must
    // not re-lock a grove the class had opened — and nextSession clears them.
    const added = quest
      .filter(t => !taken.has(t.id))
      .map(t => ({ ...t, state: 'healthy' as const, leitnerBox: 1 as const, spawnedFrom: `quest:${misconceptionId}` }));
    const withQuest: ServerWorld = { ...current, trees: [...current.trees, ...added] };
    store.put(placeNewTrees(withQuest, added.map(t => t.id)));
    res.json({ addedTreeIds: added.map(t => t.id) });
  });

  // ---- presence
  app.post('/api/presence/:worldId', (req, res) => {
    const world = store.require(param(req, 'worldId'));
    presence.upsert(world.worldId, parse(presenceBody, req.body), now());
    res.json({ ok: true });
  });

  app.get('/api/presence/:worldId', (req, res) => {
    const world = store.require(param(req, 'worldId'));
    const exclude = typeof req.query.playerId === 'string' ? req.query.playerId : undefined;
    res.json({ players: presence.list(world, now(), exclude) });
  });

  deps.mount?.(app);

  // ---- errors: always JSON, never a stack trace to the client
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: status === 413 ? 'That PDF is over 32 MB.' : err.message });
      return;
    }
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      res.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    log(`[server] ${(err as Error)?.stack ?? String(err)}`);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return { app, store, presence };
}
