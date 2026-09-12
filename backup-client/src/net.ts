// Every call to C's server. Errors come back as readable messages from the API.
import type { AnswerResponse, Bars, Confidence, Player, Tree, World } from '../../server/src/contract';

export interface StateResponse extends Bars { status: World['status']; world: World<Tree> }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  worlds: () => call<{ worlds: Array<{ worldId: string; subject: string; status: string }> }>('/api/worlds'),
  state: (worldId: string) => call<StateResponse>(`/api/state/${worldId}`),
  answer: (body: { worldId: string; treeId: string; response: number | string; confidence?: Confidence; playerId: string }) =>
    call<AnswerResponse>('/api/answer', { method: 'POST', body: JSON.stringify(body) }),
  presence: (worldId: string, playerId: string) =>
    call<{ players: Player[] }>(`/api/presence/${worldId}?playerId=${encodeURIComponent(playerId)}`),
  post: (worldId: string, body: { playerId: string; name: string; pos: [number, number, number]; yaw: number }) =>
    call<{ ok: true }>(`/api/presence/${worldId}`, { method: 'POST', body: JSON.stringify(body) }),
};
