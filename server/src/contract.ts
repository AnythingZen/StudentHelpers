// The data contract from docs/CONTRACT.md, as C's own copy.
//
// Deliberately self-contained rather than importing ../../shared/types.ts: two
// conflicting copies of that file exist on different branches right now, and this
// server has to keep running as the team's backup even if neither is merged.
// No Node-only types (e.g. Buffer) — the backup client imports this file too.

export type Bloom = 'remember' | 'understand' | 'apply';
export type TreeState = 'healthy' | 'withered' | 'sapling' | 'regrown';
export type TreeKind = 'choice' | 'recall' | 'teach';
export type Confidence = 'low' | 'medium' | 'high';
export type Calibration = 'overconfident' | 'underconfident' | 'calibrated';
export type WorldStatus = 'growing' | 'ready' | 'failed';
export type SourceKind = 'pdf' | 'url' | 'text' | 'prompt';

export interface Syllabus {
  system: 'MOE-SG';
  level: string;
  subject: string;
  topic: string;
}

export type Source =
  | { kind: 'pdf'; filename: string; pages: number }
  | { kind: 'text'; label: string; chars: number }
  | { kind: 'prompt'; text: string }
  | { kind: 'url'; url: string; title: string };

// What the server hands a brain to spawn from. Uint8Array, not Buffer — see header.
export type SpawnInput =
  | { kind: 'pdf'; filename: string; data: Uint8Array }
  | { kind: 'url'; url: string }
  | { kind: 'text'; label: string; text: string }
  | { kind: 'prompt' };

export interface Concept {
  id: string;
  name: string;
  questName: string;
  bloom: Bloom;
  syllabusRef: string;
  level: string;
  prerequisites: string[];
  centre: [number, number, number];
}

export interface Misconception {
  id: string;
  conceptId: string;
  label: string;
}

export interface Tree {
  id: string;
  conceptId: string;
  pos: [number, number, number];
  kind: TreeKind;
  question: string;
  choices?: string[];
  rubric?: string[];
  explanation: string;
  citation: { page: number; quote: string } | null;
  state: TreeState;
  leitnerBox: 1 | 2 | 3;
  spawnedFrom: string | null;
}

// Server-side only. The answer key never reaches a browser.
export interface TreeWithAnswer extends Tree {
  answerIndex?: number;
  answerText?: string;
}

export interface World<T extends Tree = Tree> {
  worldId: string;
  syllabus: Syllabus;
  subject: string;
  source: Source;
  status: WorldStatus;
  sessionIndex: number;
  concepts: Concept[];
  misconceptions: Misconception[];
  trees: T[];
}

export type ServerWorld = World<TreeWithAnswer>;

export interface Bars {
  xp: number;
  mastery: number;
  retention: number;
}

export interface AnswerResponse extends Bars {
  correct: boolean;
  treeState: TreeState;
  misconceptionId: string | null;
  misconceptionLabel: string | null;
  scaffoldHint: string | null;
  saplingId: string | null;
  conceptHealth: number;
  calibration: Calibration | null;
  // Present for teach trees only — Mia's reaction and which rubric points landed.
  explanation?: Explanation;
}

export interface Diagnosis {
  misconceptionId: string;
  confidence: number;
  scaffoldHint: string;
  evidence: string;
}

export interface Explanation {
  passed: boolean;
  hit: string[];
  missing: string[];
  encouragement: string;
}

export interface Player {
  playerId: string;
  name: string;
  pos: [number, number, number];
  yaw: number;
  seeded: boolean;
}

// One answer, as logged. Every teacher-console number is derived from these.
export interface AnswerEvent {
  ts: number;
  playerId: string;
  treeId: string;
  conceptId: string;
  kind: TreeKind;
  correct: boolean;
  misconceptionId: string | null;
  confidence: Confidence | null;
}
