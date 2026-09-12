import { describe, it, expect } from 'vitest';
import { toClientWorld } from './clientWorld.js';
import type { ServerWorld } from './contract.js';

describe('toClientWorld', () => {
  it('strips every answer key and keeps everything else', () => {
    const world: ServerWorld = {
      worldId: 'OAK7', subject: 's', status: 'ready', sessionIndex: 0,
      syllabus: { system: 'MOE-SG', level: 'Primary 5', subject: 'Mathematics', topic: 'Fractions' },
      source: { kind: 'prompt', text: 'x' }, concepts: [], misconceptions: [],
      trees: [
        { id: 'a', conceptId: 'c1', pos: [0, 0, 0], kind: 'choice', question: 'q', choices: ['x', 'y'],
          answerIndex: 1, explanation: 'e', citation: null, state: 'healthy', leitnerBox: 1, spawnedFrom: null },
        { id: 'b', conceptId: 'c1', pos: [0, 0, 0], kind: 'recall', question: 'q', answerText: 'secret',
          explanation: 'e', citation: null, state: 'healthy', leitnerBox: 1, spawnedFrom: null },
      ],
    };
    const client = toClientWorld(world);
    const json = JSON.stringify(client);
    expect(json).not.toContain('answerIndex');
    expect(json).not.toContain('answerText');
    expect(json).not.toContain('secret');
    expect(client.trees[0]).toMatchObject({ id: 'a', choices: ['x', 'y'] });
    expect(world.trees[0]).toHaveProperty('answerIndex', 1); // input untouched
  });
});
