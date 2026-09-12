// Per-student progress. The forest is shared by the class (trees, Leitner boxes,
// the teacher's heatmap); each student's path through it is derived from their
// own answer events and reflections. That's what makes it a class of individuals:
// everyone plays in one world, and every student has their own missions, unlocks,
// bars and forest state.

import type { AnswerEvent, Calibration, Player, ServerWorld, TreeWithAnswer } from './contract.js';

export interface Reflection {
  ts: number;
  playerId: string;
  name: string;
  conceptId: string;
  rating: 1 | 2 | 3 | 4;       // judgment of learning: 1 still confused … 4 could teach it
  note: string;
}

export type ObjectiveKind = 'answer' | 'recall' | 'teach' | 'model' | 'focus' | 'review' | 'reflect';
export interface Objective { kind: ObjectiveKind; label: string; progress: number; target: number; done: boolean }

export interface Mission {
  conceptId: string;
  name: string;
  questName: string;
  level: string;
  objectives: Objective[];
  ready: boolean;      // everything but the reflection is done
  complete: boolean;   // reflected — sticky, so a later focus quest never re-locks a grove
  unlocked: boolean;
}

export interface PlayerProgress {
  playerId: string;
  missions: Mission[];
  current: string | null;
  completed: number;
  total: number;
  xp: number;
  mastery: number;
  retention: number;
  calibration: Record<Calibration, number>;
  memoryQuest: { progress: number; target: number } | null;
}

const SAPLING_ID = /-s\d+-\d+$/;
const isQuest = (t: { spawnedFrom: string | null }) => t.spawnedFrom?.startsWith('quest:') ?? false;
const isSapling = (t: { spawnedFrom: string | null }) => t.spawnedFrom !== null && !isQuest(t);

// A sapling is the same question as its root. Saplings are cleared each session,
// so fall back to the id pattern for events about trees that no longer exist.
function rootResolver(world: ServerWorld) {
  const byId = new Map(world.trees.map(t => [t.id, t]));
  return (treeId: string): string => {
    const t = byId.get(treeId);
    if (t) return isSapling(t) ? t.spawnedFrom! : t.id;
    return treeId.replace(SAPLING_ID, '');
  };
}

// Path order: prerequisites first, then nearest the entrance.
export function orderedConcepts(world: ServerWorld) {
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;            // a cycle from the model: don't recurse forever
    seen.add(id);
    const c = world.concepts.find(x => x.id === id);
    const d = c && c.prerequisites.length ? 1 + Math.max(...c.prerequisites.map(p => depthOf(p, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  return [...world.concepts].sort((a, b) => depthOf(a.id) - depthOf(b.id) || b.centre[2] - a.centre[2]);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function playerProgress(world: ServerWorld, events: AnswerEvent[], reflections: Reflection[], playerId: string): PlayerProgress {
  const root = rootResolver(world);
  const own = events.filter(e => e.playerId === playerId);
  const reflected = new Set(reflections.filter(r => r.playerId === playerId).map(r => r.conceptId));
  const correctRoots = new Set(own.filter(e => e.correct).map(e => root(e.treeId)));

  const build = (conceptId: string): Omit<Mission, 'unlocked'> => {
    const c = world.concepts.find(x => x.id === conceptId)!;
    const base = world.trees.filter(t => t.conceptId === conceptId && t.spawnedFrom === null);
    const quests = world.trees.filter(t => t.conceptId === conceptId && isQuest(t));
    const hits = (trees: TreeWithAnswer[]) => trees.filter(t => correctRoots.has(t.id)).length;
    const objectives: Objective[] = [];
    const add = (kind: ObjectiveKind, label: string, progress: number, target: number) =>
      objectives.push({ kind, label, progress: Math.min(progress, target), target, done: progress >= target });

    const choice = base.filter(t => t.kind === 'choice');
    if (choice.length) {
      const n = Math.min(3, choice.length);
      add('answer', `Answer ${plural(n, 'question')} right`, hits(choice), n);
    }
    const recall = base.filter(t => t.kind === 'recall');
    if (recall.length) add('recall', 'Answer one from memory', hits(recall), 1);
    const teach = base.filter(t => t.kind === 'teach');
    if (teach.length) add('teach', 'Help Mia understand it', hits(teach), 1);
    const model = base.filter(t => t.kind === 'model');
    if (model.length) add('model', model[0]!.model?.shape === 'bridge' ? 'Checkpoint: build the bridge' : 'Hands-on: serve the cake', hits(model), model.length);
    if (quests.length) {
      const n = Math.min(2, quests.length);
      add('focus', `Your teacher's focus quest (${plural(n, 'tree')})`, hits(quests), n);
    }

    // Spaced practice: a miss is fixed by a correct answer that comes AFTER at least
    // one other question. Retrying on the spot regrows the tree, but the mission
    // still sends you back to it later — that's the sapling up the path.
    const missed = new Map<string, boolean>();
    own.forEach((e, i) => {
      if (e.conceptId !== conceptId || e.kind === 'teach') return;
      const r = root(e.treeId);
      if (!e.correct) { missed.set(r, false); return; }
      if (!missed.has(r) || missed.get(r)) return;
      let lastWrong = -1;
      for (let j = i - 1; j >= 0; j--) if (root(own[j]!.treeId) === r && !own[j]!.correct) { lastWrong = j; break; }
      const spaced = own.slice(lastWrong + 1, i).some(x => root(x.treeId) !== r);
      if (spaced) missed.set(r, true);
    });
    if (missed.size) {
      const fixed = [...missed.values()].filter(Boolean).length;
      add('review', `Come back to what you missed`, fixed, missed.size);
    }

    const ready = objectives.every(o => o.done);
    const complete = reflected.has(conceptId);
    add('reflect', 'Reflect: how well do you know it?', complete ? 1 : 0, 1);
    return { conceptId, name: c.name, questName: c.questName, level: c.level, objectives, ready: ready || complete, complete };
  };

  const built = new Map(orderedConcepts(world).map(c => [c.id, build(c.id)]));
  const missions: Mission[] = [...built.values()].map(m => ({
    ...m,
    unlocked: world.concepts.find(c => c.id === m.conceptId)!.prerequisites.every(p => built.get(p)?.complete ?? true),
  }));
  const completed = missions.filter(m => m.complete).length;

  // Retention: questions answered right more than once, spaced apart (another question
  // in between, or a later session) — out of every question answered right at all.
  const spacedRight = new Set<string>();
  own.forEach((e, i) => {
    if (!e.correct) return;
    const r = root(e.treeId);
    const earlier = own.slice(0, i).findIndex(x => x.correct && root(x.treeId) === r);
    if (earlier === -1) return;
    const between = own.slice(earlier + 1, i).some(x => root(x.treeId) !== r);
    if (between || own[earlier]!.sessionIndex !== e.sessionIndex) spacedRight.add(r);
  });

  const calibration: Record<Calibration, number> = { calibrated: 0, overconfident: 0, underconfident: 0 };
  for (const e of own) {
    if (!e.confidence) continue;
    if (e.confidence === 'high' && !e.correct) calibration.overconfident++;
    else if (e.confidence === 'low' && e.correct) calibration.underconfident++;
    else calibration.calibrated++;
  }

  // Memory Quest: after the teacher starts a new session, bring back what this
  // student got right before and ask for it again.
  let memoryQuest: PlayerProgress['memoryQuest'] = null;
  if (world.sessionIndex > 0) {
    const earlier = new Set(own.filter(e => e.correct && e.sessionIndex < world.sessionIndex && e.kind !== 'teach').map(e => root(e.treeId)));
    const target = Math.min(3, earlier.size);
    if (target > 0) {
      const now = new Set(own.filter(e => e.correct && e.sessionIndex === world.sessionIndex).map(e => root(e.treeId)));
      memoryQuest = { progress: Math.min(target, [...earlier].filter(r => now.has(r)).length), target };
    }
  }

  return {
    playerId, missions,
    current: missions.find(m => m.unlocked && !m.complete)?.conceptId ?? null,
    completed, total: missions.length,
    xp: own.reduce((s, e) => s + (e.correct ? (e.kind === 'teach' ? 25 : 10) : 0), 0) + completed * 20,
    mastery: missions.length ? completed / missions.length : 0,
    retention: correctRoots.size ? spacedRight.size / correctRoots.size : 0,
    calibration, memoryQuest,
  };
}

/** The forest as one student sees it: their own withered/regrown trees and saplings. */
export function treesFor(world: ServerWorld, events: AnswerEvent[], playerId: string): TreeWithAnswer[] {
  const root = rootResolver(world);
  const own = events.filter(e => e.playerId === playerId && e.sessionIndex === world.sessionIndex);
  const everRight = new Set(events.filter(e => e.playerId === playerId && e.correct).map(e => root(e.treeId)));
  return world.trees
    .filter(t => !isSapling(t) || !t.ownerId || t.ownerId === playerId)
    .map(t => {
      if (isSapling(t)) return t;
      let lastWrong = -1, lastRight = -1;
      own.forEach((e, i) => { if (root(e.treeId) === t.id) { if (e.correct) lastRight = i; else lastWrong = i; } });
      const state = lastWrong > lastRight ? 'withered' : lastWrong >= 0 ? 'regrown' : 'healthy';
      return { ...t, state, leitnerBox: everRight.has(t.id) && state !== 'withered' ? 2 : 1 };
    });
}

export type StudentStatus = 'not-started' | 'on-track' | 'stuck' | 'overconfident' | 'finished';
export interface StudentRow {
  playerId: string;
  name: string;
  online: boolean;
  status: StudentStatus;
  currentMission: { conceptId: string; questName: string; done: number; total: number } | null;
  missionsComplete: number;
  missionsTotal: number;
  answers: number;
  accuracy: number;
  calibration: Record<Calibration, number>;
  lastMisconception: string | null;
  lastReflection: { questName: string; rating: number; note: string } | null;
  lastActive: number | null;
}

export function roster(world: ServerWorld, events: AnswerEvent[], reflections: Reflection[], online: Player[], _now: number): StudentRow[] {
  const names = new Map<string, string>();
  for (const e of events) if (e.name) names.set(e.playerId, e.name);
  for (const r of reflections) names.set(r.playerId, r.name);
  const live = online.filter(p => !p.seeded);
  for (const p of live) names.set(p.playerId, p.name);
  const ids = new Set([...events.map(e => e.playerId), ...reflections.map(r => r.playerId), ...live.map(p => p.playerId)]);
  ids.delete('anonymous');

  return [...ids].map(playerId => {
    const own = events.filter(e => e.playerId === playerId);
    const p = playerProgress(world, events, reflections, playerId);
    const current = p.missions.find(m => m.conceptId === p.current);
    const recent = own.slice(-4);
    const repeatedMisconception = recent.filter(e => e.misconceptionId && e.misconceptionId !== 'unclassified')
      .some((e, _i, arr) => arr.filter(x => x.misconceptionId === e.misconceptionId).length >= 2);
    const lastThreeWrong = own.length >= 3 && own.slice(-3).every(e => !e.correct);
    const recentOver = own.slice(-5).filter(e => e.confidence === 'high' && !e.correct).length;
    const status: StudentStatus = own.length === 0 && p.completed === 0 ? 'not-started'
      : p.completed === p.total ? 'finished'
      : lastThreeWrong || repeatedMisconception ? 'stuck'
      : recentOver >= 2 ? 'overconfident'
      : 'on-track';
    const lastMiss = [...own].reverse().find(e => e.misconceptionId && e.misconceptionId !== 'unclassified');
    const lastRefl = reflections.filter(r => r.playerId === playerId).at(-1);
    return {
      playerId,
      name: names.get(playerId) ?? 'Student',
      online: live.some(x => x.playerId === playerId),
      status,
      currentMission: current ? {
        conceptId: current.conceptId, questName: current.questName,
        done: current.objectives.filter(o => o.done).length, total: current.objectives.length,
      } : null,
      missionsComplete: p.completed, missionsTotal: p.total,
      answers: own.length,
      accuracy: own.length ? own.filter(e => e.correct).length / own.length : 0,
      calibration: p.calibration,
      lastMisconception: lastMiss ? world.misconceptions.find(m => m.id === lastMiss.misconceptionId)?.label ?? null : null,
      lastReflection: lastRefl ? {
        questName: world.concepts.find(c => c.id === lastRefl.conceptId)?.questName ?? '', rating: lastRefl.rating, note: lastRefl.note,
      } : null,
      lastActive: own.at(-1)?.ts ?? null,
    };
  }).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}
