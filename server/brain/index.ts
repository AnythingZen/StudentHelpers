// Builder B's public surface. C imports from here and nowhere else.
// Everything is stateless: World in, World (or a verdict) out.

export { spawnWorld } from './spawn.js';
export { schedule, nextSession, conceptHealth } from './schedule.js';
export { diagnose, gradeRecall, gradeExplanation, calibration } from './diagnose.js';
export { focusQuest, growFromSource } from './grow.js';
export type { Fetched } from './source.js';
