// The entire persistence layer. In memory on purpose — see docs/TOOLING.md for
// why this must run as one persistent process, never serverless.

import type { AnswerEvent, ServerWorld } from './contract.js';
import type { Reflection } from './progress.js';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export class WorldStore {
  private worlds = new Map<string, ServerWorld>();
  private events = new Map<string, AnswerEvent[]>();
  private pending = new Map<string, Promise<void>>();
  private reflections = new Map<string, Reflection[]>();

  codes(): Set<string> { return new Set(this.worlds.keys()); }
  list(): ServerWorld[] { return [...this.worlds.values()]; }
  put(world: ServerWorld): void { this.worlds.set(world.worldId, world); }
  get(worldId: string): ServerWorld | undefined { return this.worlds.get(worldId); }

  require(worldId: string): ServerWorld {
    const w = this.worlds.get(worldId);
    if (!w) throw new HttpError(404, `No world with room code ${worldId}`);
    return w;
  }

  update(worldId: string, fn: (w: ServerWorld) => ServerWorld): ServerWorld {
    const next = fn(this.require(worldId));
    this.worlds.set(worldId, next);
    return next;
  }

  addEvent(worldId: string, e: AnswerEvent): void {
    if (!this.events.has(worldId)) this.events.set(worldId, []);
    this.events.get(worldId)!.push(e);
  }
  eventsFor(worldId: string): AnswerEvent[] { return this.events.get(worldId) ?? []; }

  // One reflection per student per grove; a second one replaces the first.
  addReflection(worldId: string, r: Reflection): void {
    const list = (this.reflections.get(worldId) ?? []).filter(x => !(x.playerId === r.playerId && x.conceptId === r.conceptId));
    this.reflections.set(worldId, [...list, r]);
  }
  reflectionsFor(worldId: string): Reflection[] { return this.reflections.get(worldId) ?? []; }

  setPending(worldId: string, p: Promise<void>): void { this.pending.set(worldId, p); }
  async settled(worldId: string): Promise<void> { await this.pending.get(worldId); }
}
