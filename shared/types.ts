// Shared data shape. Copied verbatim from docs/CONTRACT.md — FROZEN.
// Changing anything here requires telling both other builders out loud.

export type Bloom     = 'remember' | 'understand' | 'apply';
export type TreeState = 'healthy' | 'withered' | 'sapling' | 'regrown';
export type TreeKind  = 'choice' | 'recall' | 'teach';
export type Confidence = 'low' | 'medium' | 'high';
export type Calibration = 'overconfident' | 'underconfident' | 'calibrated';

export interface Syllabus {
  system: 'MOE-SG';           // one system today. Do not generalise this.
  level: string;              // "Primary 5"
  subject: string;            // "Mathematics"
  topic: string;              // "Fractions"
}

// Where the world's content came from. Ingestion is decoupled from generation.
export type Source =
  | { kind: 'pdf';    filename: string; pages: number }
  | { kind: 'text';   label: string; chars: number }
  | { kind: 'prompt'; text: string }
  | { kind: 'url';    url: string; title: string };

// What C hands to spawnWorld(). Mirrors Source, plus the payload itself.
export type SpawnInput =
  | { kind: 'pdf';    filename: string; data: Uint8Array }   // Node passes a Buffer; Uint8Array keeps A's vite build clean
  | { kind: 'url';    url: string }
  | { kind: 'text';   label: string; text: string }
  | { kind: 'prompt' };                                   // syllabus is the whole input

export interface World {
  worldId: string;            // 4-char room code, e.g. "OAK7"
  syllabus: Syllabus;
  subject: string;            // display string, "Primary 5 Mathematics — Fractions"
  source: Source;
  status: 'growing' | 'ready' | 'failed';   // polling flips growing -> ready
  sessionIndex: number;       // 0 on spawn, +1 per /next-session
  concepts: Concept[];        // a concept === a grove
  misconceptions: Misconception[];
  trees: Tree[];
}

export interface Concept {
  id: string;                 // "c1"
  name: string;
  questName: string;          // "The Fraction Bridge" — B generates it at spawn
  bloom: Bloom;
  syllabusRef: string;        // "P5 · Fractions · Comparing fractions with unlike denominators"
  level: string;              // may be ABOVE the world's level (the level ladder)
  prerequisites: string[];    // concept ids — THIS IS THE WORLD MODEL
  centre: [number, number, number];  // set by A's layout fn
}

export interface Misconception {
  id: string;                 // "m1"
  conceptId: string;
  label: string;
}

export interface Tree {
  id: string;                 // "t1"
  conceptId: string;
  pos: [number, number, number];     // set by A's layout fn
  kind: TreeKind;
  question: string;
  choices?: string[];         // kind === 'choice' only
  rubric?: string[];          // kind === 'teach' only
  explanation: string;
  citation: { page: number; quote: string } | null;
  state: TreeState;
  leitnerBox: 1 | 2 | 3;
  spawnedFrom: string | null; // sapling → the tree id it respawned from
}

// Server-side only. Never sent to the browser; GET /api/state strips these.
export interface TreeWithAnswer extends Tree {
  answerIndex?: number;       // kind === 'choice'
  answerText?: string;        // kind === 'recall'
}

export interface Diagnosis {
  misconceptionId: string;    // one of world.misconceptions[].id, or 'unclassified'
  confidence: number;         // 0..1
  scaffoldHint: string;       // a QUESTION, never the answer
  evidence: string;
}

export interface Explanation {
  passed: boolean;
  hit: string[];
  missing: string[];
  encouragement: string;
}

// A <-> C seam: other players in the same world, polled every 500ms.
export interface Presence {
  playerId: string;
  name: string;
  pos: [number, number, number];
  yaw: number;
  seeded: boolean;            // server-side classmate, not a real client
}

export interface AnswerResponse {
  correct: boolean;
  treeState: TreeState;
  misconceptionId: string | null;
  misconceptionLabel: string | null;
  scaffoldHint: string | null;
  saplingId: string | null;
  conceptHealth: number;
  xp: number;
  mastery: number;
  retention: number;
  calibration: Calibration | null;
}
// The older, smaller result shape Builder A's client was written against. Kept as a
// subset so A's client keeps compiling; the server always returns the full AnswerResponse.
export type AnswerResult = Omit<AnswerResponse, 'xp' | 'mastery' | 'retention' | 'calibration'>;

// Client event bus (A's scene <-> C's network layer).
export type GameEvent =
  | { type: 'state';     world: World; xp: number; mastery: number; retention: number }
  | { type: 'answered';  result: AnswerResult }
  | { type: 'questStart'; conceptId: string; questName: string }
  | { type: 'plankPlaced' | 'plankLost'; conceptId: string }
  | { type: 'levelUp';   conceptId: string }
  | { type: 'needConfidence'; treeId: string; resolve: (c: Confidence) => void };
