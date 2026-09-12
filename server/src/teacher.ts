// The teacher console's numbers. Everything is derived from the answer-event log
// on top of a clearly-marked demo seed, so the heatmap has a class in it on stage.

import type { AnswerEvent, ServerWorld } from './contract.js';
import { bars, conceptHealth, isLocked, UNLOCK_THRESHOLD } from './schedule.js';

export interface DemoSeed {
  cohort: number;
  classMastered: number;
  goal: string;
  // Keyed by misconception id. Only matches worlds built from the committed
  // fixtures; a world from a real model has different ids and shows real data only.
  misconceptions: Record<string, { count: number; students: number }>;
}

export const DEMO_SEED: DemoSeed = {
  cohort: 45,
  classMastered: 36,
  goal: 'The Castle Library',
  misconceptions: {
    m3: { count: 11, students: 11 }, m5: { count: 6, students: 6 }, m7: { count: 4, students: 4 },
    rm2: { count: 9, students: 9 }, rm3: { count: 5, students: 5 },
  },
};

export const EMPTY_SEED: DemoSeed = { cohort: 1, classMastered: 0, goal: 'The Castle Library', misconceptions: {} };

export function teacherView(world: ServerWorld, events: AnswerEvent[], seed: DemoSeed) {
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
      const s = seed.misconceptions[m.id];
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
