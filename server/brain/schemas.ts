// Zod schemas for every structured LLM output. The spawn schema is what the
// model EMITS — positions, states and Leitner boxes are ours to fill (spawn.ts),
// so they are deliberately absent here.

import { z } from 'zod';

export const Bloom = z.enum(['remember', 'understand', 'apply']);

export const SpawnConcept = z.object({
  id: z.string().describe('c1, c2, ... in order'),
  name: z.string(),
  bloom: Bloom,
  syllabusRef: z.string().describe('"P5 · Fractions · <named syllabus outcome>"'),
  level: z.string().describe('"Primary 5"; exactly one concept sits one level above the world'),
  prerequisites: z.array(z.string()).describe('concept ids; a DAG; entry concept has none'),
});

export const SpawnMisconception = z.object({
  id: z.string().describe('m1, m2, ...'),
  conceptId: z.string(),
  label: z.string().describe('specific and diagnostic, never vague'),
});

export const SpawnTree = z.object({
  id: z.string().describe('t1, t2, ...'),
  conceptId: z.string(),
  kind: z.enum(['choice', 'recall', 'teach']),
  question: z.string(),
  choices: z.array(z.string()).optional().describe('exactly 4, kind === choice only'),
  answerIndex: z.number().int().optional().describe('kind === choice only'),
  answerText: z.string().optional().describe('kind === recall only'),
  rubric: z.array(z.string()).optional().describe('kind === teach only; 3-4 points a good explanation hits'),
  explanation: z.string().describe('explains the reasoning, not just the answer'),
  citation: z.object({ page: z.number().int(), quote: z.string() }).nullable(),
});

export const WorldSpawnSchema = z.object({
  concepts: z.array(SpawnConcept),
  misconceptions: z.array(SpawnMisconception),
  trees: z.array(SpawnTree),
});
export type WorldSpawn = z.infer<typeof WorldSpawnSchema>;
export type SpawnTree = z.infer<typeof SpawnTree>;

// diagnose(): the enum is built per world so the model cannot invent a label.
export const DiagnosisSchema = (misconceptionIds: string[]) =>
  z.object({
    misconceptionId: z.enum(['unclassified', ...misconceptionIds]),
    confidence: z.number().min(0).max(1),
    scaffoldHint: z.string().describe('one sentence, a QUESTION, never the answer'),
    evidence: z.string(),
  });

export const GradeSchema = z.object({
  correct: z.boolean(),
  why: z.string(),
});

export const ExplanationSchema = z.object({
  passed: z.boolean(),
  hit: z.array(z.string()),
  missing: z.array(z.string()),
  encouragement: z.string().describe('one sentence in the sapling\'s voice; never a grade'),
});

// growFromSource() / focusQuest(): trees only, placed into an EXISTING concept.
export const TreesSchema = z.object({ trees: z.array(SpawnTree) });
