// Other people in the forest. One list, two sources: real browsers posting their
// position, and seeded classmates the server animates. Clients can't tell them
// apart, so the stage demo still has a shared world if the real second player fails.

import type { Player, ServerWorld } from './contract.js';

type Vec3 = [number, number, number];
export interface PresenceUpdate { playerId: string; name: string; pos: Vec3; yaw: number }

export class PresenceBoard {
  private byWorld = new Map<string, Map<string, PresenceUpdate & { lastSeen: number }>>();
  constructor(private readonly staleMs = 3000) {}

  upsert(worldId: string, u: PresenceUpdate, now: number): void {
    if (!this.byWorld.has(worldId)) this.byWorld.set(worldId, new Map());
    this.byWorld.get(worldId)!.set(u.playerId, { ...u, lastSeen: now });
  }

  list(world: ServerWorld, now: number, excludePlayerId?: string): Player[] {
    const board = this.byWorld.get(world.worldId) ?? new Map();
    const real: Player[] = [];
    for (const [id, p] of board) {
      if (now - p.lastSeen > this.staleMs) { board.delete(id); continue; }
      if (id !== excludePlayerId) real.push({ playerId: id, name: p.name, pos: p.pos, yaw: p.yaw, seeded: false });
    }
    return [...real, ...seededClassmates(world, now)];
  }
}

const orbit = (centre: Vec3, radius: number, periodMs: number, phase: number, now: number, dir = 1) => {
  const a = dir * ((now / periodMs) * Math.PI * 2) + phase;
  const pos: Vec3 = [centre[0] + Math.cos(a) * radius, 0, centre[2] + Math.sin(a) * radius];
  // Facing the direction of travel along the circle.
  const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
  return { pos, yaw };
};

export function seededClassmates(world: ServerWorld, now: number): Player[] {
  if (world.concepts.length === 0) return [];
  const groves = [...world.concepts].sort((a, b) => b.centre[2] - a.centre[2]); // nearest the entrance first
  // Loop beside each grove, on the side away from the path, so classmates don't walk
  // through the student's camera while they stand at a tree.
  const beside = (c: Vec3): Vec3 => [c[0] + (c[0] >= 0 ? 13 : -13), 0, c[2]];
  const first = beside(groves[0]!.centre);
  const second = beside((groves[1] ?? groves[0]!).centre);
  const players: Player[] = [
    { playerId: 'seed-aisha', name: 'Aisha', seeded: true, ...orbit(first, 6, 60_000, 0, now) },
    { playerId: 'seed-weijie', name: 'Wei Jie', seeded: true, ...orbit(second, 7, 45_000, Math.PI, now, -1) },
  ];
  // Mia stands, stuck, at the first teach tree — the "help a classmate" beat.
  const teach = world.trees.find(t => t.kind === 'teach' && t.spawnedFrom === null);
  if (teach) {
    const pos: Vec3 = [teach.pos[0] + 1.6, 0, teach.pos[2] + 1.6];
    players.push({ playerId: 'seed-mia', name: 'Mia', seeded: true, pos,
      yaw: Math.atan2(teach.pos[0] - pos[0], teach.pos[2] - pos[2]) });
  }
  return players;
}
