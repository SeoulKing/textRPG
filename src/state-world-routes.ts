import type { FastifyInstance } from "fastify";
import type { GameRepository } from "./game/repository";
import { StateWorldService } from "./game/state-world/service";
import { InvalidCommand } from "./game/state-world/actions";

export function registerStateWorldRoutes(app: FastifyInstance, repository: GameRepository) {
  const service = new StateWorldService(repository);
  app.post("/api/state-world/games", () => service.create());
  app.get<{ Params: { gameId: string }; Querystring: { page?: string } }>("/api/state-world/games/:gameId", async (request, reply) => {
    const page = Number(request.query.page ?? 0);
    if (!Number.isSafeInteger(page) || page < 0) return reply.code(400).send({ message: "페이지 번호가 올바르지 않습니다." });
    try { return await service.get(request.params.gameId, page); }
    catch (error) { return reply.code(error instanceof InvalidCommand ? 400 : 404).send({ message: error instanceof Error ? error.message : "저장을 불러오지 못했습니다." }); }
  });
  app.post<{ Params: { gameId: string } }>("/api/state-world/games/:gameId/actions", async (request, reply) => {
    try { return await service.act(request.params.gameId, request.body); }
    catch (error) {
      if (!(error instanceof InvalidCommand)) throw error;
      return reply.code(409).send({ message: error.message });
    }
  });
}
