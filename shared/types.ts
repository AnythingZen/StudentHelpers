export type Bloom = 'remember' | 'understand' | 'apply';
export type TreeState = 'healthy' | 'withered' | 'sapling' | 'regrown';
export type TreeKind = 'choice' | 'recall';

export interface Syllabus { system: 'MOE-SG'; level: string; subject: string; topic: string }
export type Source =
  | { kind: 'pdf'; filename: string; pages: number }
  | { kind: 'text'; label: string; chars: number }
  | { kind: 'prompt'; text: string }
  | { kind: 'url'; url: string; title: string };
export interface Concept {
  id: string; name: string; bloom: Bloom; syllabusRef: string; level: string;
  prerequisites: string[]; centre: [number, number, number];
}
export interface Misconception { id: string; conceptId: string; label: string }
export interface Tree {
  id: string; conceptId: string; pos: [number, number, number]; kind: TreeKind;
  question: string; choices?: string[]; explanation: string;
  citation: { page: number; quote: string } | null; state: TreeState;
  leitnerBox: 1 | 2 | 3; spawnedFrom: string | null;
}
export interface World {
  worldId: string; syllabus: Syllabus; subject: string; source: Source;
  sessionIndex: number; concepts: Concept[]; misconceptions: Misconception[]; trees: Tree[];
}
export interface AnswerResult {
  correct: boolean; treeState: TreeState; misconceptionId: string | null;
  misconceptionLabel: string | null; scaffoldHint: string | null; saplingId: string | null;
  conceptHealth: number;
}
