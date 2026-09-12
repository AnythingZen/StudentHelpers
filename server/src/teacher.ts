// The teacher console's numbers. Everything is derived from the answer-event log
// on top of a clearly-marked demo seed, so the heatmap has a class in it on stage.

import type { AnswerEvent, ServerWorld } from './contract.js';
import { bars, conceptHealth, isLocked, UNLOCK_THRESHOLD } from './schedule.js';

export interface DemoSeed {
  cohort: number;
  classMastered: number;
  goal: string;
  // Keyed by the misconception's exact LABEL, not its id: a model-generated world
  // reuses ids like "m3" for entirely different misconceptions, and keying by id
  // would stamp fake class counts onto real labels.
  misconceptions: Record<string, { count: number; students: number }>;
}

export const DEMO_SEED: DemoSeed = {
  cohort: 45,
  classMastered: 36,
  goal: 'The Castle Library',
  misconceptions: {
    'Compares fractions by numerator alone, so 5/8 > 3/4': { count: 11, students: 11 },
    'Adds numerators and denominators separately: 1/2 + 1/3 = 2/5': { count: 6, students: 6 },
    'Takes the fraction of the wrong whole': { count: 4, students: 4 },
    'Guesses a word from how it looks rather than from the sentence around it': { count: 9, students: 9 },
    'Reports what a character did instead of why — literal instead of inferential': { count: 5, students: 5 },
  },
};

export const EMPTY_SEED: DemoSeed = { cohort: 1, classMastered: 0, goal: 'The Castle Library', misconceptions: {} };

export function teacherView(world: ServerWorld, events: AnswerEvent[], demoSeed: DemoSeed) {
  // The seeded class only applies to the committed sample worlds. Anything the AI
  // generated shows real, live numbers and nothing else.
  const seed = world.misconceptions.some(m => demoSeed.misconceptions[m.label]) ? demoSeed : EMPTY_SEED;
  const players = new Set(events.map(e => e.playerId));
  const concepts = world.concepts.map(c => {
    const own = events.filter(e => e.conceptId === c.id);
    const wrong = own.filter(e => !e.correct).length;
    return {
      id: c.id, name: c.name, questName: c.questName, bloom: c.bloom, level: c.level,
      health: conceptHealth(world, c.id), locked: isLocked(world, c.id),
      attempts: own.length, missRate: own.length === 0 ? 0 : wrong / own.length,
    };
  });

  const misconceptions = world.misconceptions
    .filter(m => m.id !== 'unclassified')
    .map(m => {
      const real = events.filter(e => e.misconceptionId === m.id);
      const s = seed.misconceptions[m.label];
      return {
        id: m.id, label: m.label, conceptId: m.conceptId,
        count: (s?.count ?? 0) + real.length,
        studentCount: (s?.students ?? 0) + new Set(real.map(e => e.playerId)).size,
      };
    })
    .filter(m => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const heatmap = world.concepts.map(c => ({
    conceptId: c.id,
    centre: [c.centre[0], c.centre[2]] as [number, number],
    radius: 4 + world.trees.filter(t => t.conceptId === c.id && t.spawnedFrom === null).length * 1.2,
    health: conceptHealth(world, c.id),
  }));

  const top = misconceptions[0];
  const { mastery } = bars(world, events);
  const mastered = Math.min(seed.cohort, seed.classMastered + (mastery >= UNLOCK_THRESHOLD ? 1 : 0));

  return {
    roomCode: world.worldId, subject: world.subject, sessionIndex: world.sessionIndex, status: world.status,
    studentCount: Math.max(seed.cohort, players.size),
    demoSeeded: seed !== EMPTY_SEED,
    concepts, misconceptions, heatmap,
    weakest: top ? { conceptId: top.conceptId, misconceptionId: top.id, label: top.label, count: top.count } : null,
    classWorld: { goal: seed.goal, mastered, total: seed.cohort, percent: Math.round((100 * mastered) / seed.cohort) },
  };
}
