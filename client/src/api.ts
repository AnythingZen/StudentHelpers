import mock from '../../mockWorld.json';
import type { AnswerResult, World } from '../../shared/types';

export async function getWorld(worldId = 'OAK7'): Promise<World> {
  try {
    const response = await fetch(`/api/state/${worldId}`);
    if (!response.ok) throw new Error('API unavailable');
    const data = await response.json(); return data.world as World;
  } catch { return structuredClone(mock) as unknown as World; }
}

export async function answer(world: World, treeId: string, response: number | string): Promise<AnswerResult> {
  try {
    const request = await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worldId: world.worldId, treeId, response }) });
    if (!request.ok) throw new Error('API unavailable'); return request.json() as Promise<AnswerResult>;
  } catch {
    const raw = (mock.trees as Array<{ id: string; answerIndex?: number; answerText?: string }>).find((item) => item.id === treeId)!;
    const correct = typeof response === 'number' ? response === raw.answerIndex : response.trim().length > 20;
    return { correct, treeState: correct ? 'healthy' : 'withered', misconceptionId: correct ? null : 'unclassified', misconceptionLabel: correct ? null : 'Try checking what each denominator means.', scaffoldHint: correct ? null : 'What does each denominator tell you about the size of one part?', saplingId: correct ? null : 'new-sapling', conceptHealth: correct ? 1 : .5 };
  }
}
