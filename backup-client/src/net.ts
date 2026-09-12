// Every call to C's server. Errors come back as readable messages from the API.
import type { AnswerResponse, Bars, Confidence, Player, Tree, World } from '../../server/src/contract';
import type { teacherView } from '../../server/src/teacher';

export type TeacherView = ReturnType<typeof teacherView>;

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

  // ---- teacher
  teacher: (worldId: string) => call<TeacherView>(`/api/teacher/${worldId}`),
  nextSession: (worldId: string) => call<StateResponse & { reviewCount: number }>(`/api/next-session/${worldId}`, { method: 'POST' }),
  deployQuest: (worldId: string, misconceptionId: string) =>
    call<{ addedTreeIds: string[] }>(`/api/deploy-quest/${worldId}`, { method: 'POST', body: JSON.stringify({ misconceptionId }) }),
  // Multipart: the browser must set the content-type boundary itself, so no JSON header here.
  spawn: async (form: FormData): Promise<{ worldId: string }> => {
    const res = await fetch('/api/world', { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `Spawn failed (${res.status})`);
    return body as { worldId: string };
  },
};
