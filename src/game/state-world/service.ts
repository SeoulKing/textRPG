import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { GameRepository } from "../repository";
import type { GameSession } from "../schemas";
import { advanceGameSeconds, createInitialGameState } from "../rules";
import { CommandSchema } from "./model";
import { createWorld, enterWorld, execute, InvalidCommand, restoreWorld, snapshotWorld, viewWorld } from "./index";

export const ActionRequestSchema = z.object({
  requestId: z.string().uuid(), revision: z.number().int().nonnegative(), command: CommandSchema,
}).strict();
export class StateWorldService {
  private readonly tails = new Map<string, Promise<void>>();
  constructor(private readonly repository: GameRepository) {}
  private async locked<T>(gameId: string, action: () => Promise<T>): Promise<T> {
    if (!z.string().uuid().safeParse(gameId).success) throw new InvalidCommand("게임 ID가 올바르지 않습니다.");
    const previous = this.tails.get(gameId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => current);
    this.tails.set(gameId, tail);
    await previous.catch(() => undefined);
    try { return await this.repository.withGameLock(gameId, action); }
    finally { release(); if (this.tails.get(gameId) === tail) this.tails.delete(gameId); }
  }
  async create() {
    const world = createWorld(); enterWorld(world);
    const state = createInitialGameState();
    state.inventory = {}; // The new world's inventory is derived exclusively from placement relations.
    state.stateWorld = snapshotWorld(world);
    const now = new Date().toISOString();
    const session: GameSession = { id: randomUUID(), createdAt: now, updatedAt: now, state,
      world: { locationCards: {}, personCards: {}, itemCards: {}, eventCards: {}, sceneCards: {}, protagonistCard: null } };
    await this.repository.saveGame(session);
    return { gameId: session.id, ...viewWorld(world) };
  }
  async get(gameId: string, page = 0) {
    return this.locked(gameId, async () => {
      const session = await this.repository.loadGame(gameId);
      if (!session.state.stateWorld) throw new InvalidCommand("상태 기반 월드 저장이 아닙니다.");
      return { gameId, ...viewWorld(restoreWorld(session.state.stateWorld), page) };
    });
  }
  async act(gameId: string, raw: unknown) {
    const parsed = ActionRequestSchema.safeParse(raw);
    if (!parsed.success) throw new InvalidCommand("올바른 명령과 리비전, 요청 ID가 필요합니다.");
    const request = parsed.data;
    return this.locked(gameId, async () => {
      const started = performance.now();
      // Detached session: failed validation or storage never mutates a repository's cached object.
      const session = structuredClone(await this.repository.loadGame(gameId));
      if (!session.state.stateWorld) throw new InvalidCommand("상태 기반 월드 저장이 아닙니다.");
      const world = restoreWorld(session.state.stateWorld);
      const commandKey = JSON.stringify(request.command);
      if (world.lastRequest?.id === request.requestId) {
        if (world.lastRequest.commandKey !== commandKey || world.lastRequest.revision !== request.revision) throw new InvalidCommand("같은 요청 ID에 다른 명령을 사용할 수 없습니다.");
        return { gameId, ...viewWorld(world), replayed: true };
      }
      if (session.state.isGameOver || session.state.stageClear) throw new InvalidCommand("종료된 게임입니다.");
      const engineStart = performance.now();
      const result = execute(world, request.command, request.revision);
      let engineMs = performance.now() - engineStart;
      if (result.outcome.seconds > 0) advanceGameSeconds(session.state, result.outcome.seconds);
      world.player.health = session.state.stats.hp;
      world.lastRequest = { id: request.requestId, revision: request.revision, commandKey };
      session.state.stateWorld = snapshotWorld(world);
      session.updatedAt = new Date().toISOString();
      const viewStart = performance.now();
      const view = viewWorld(world);
      engineMs += performance.now() - viewStart;
      await this.repository.saveGame(session);
      return { gameId, ...view, timing: { engineMs, serverMs: performance.now() - started } };
    });
  }
}
