import "./load-env";
import path from "node:path";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import { z } from "zod";
import { validateContent } from "./game/data/registry";
import { GameActionSchema } from "./game/schemas";
import { FileGameRepository, type GameRepository } from "./game/repository";
import { PostgresGameRepository } from "./game/postgres-repository";
import { GameService } from "./game/service";

const app = Fastify({
  logger: true,
});

const webRoot = path.resolve(__dirname, "..");
const repository: GameRepository = process.env.DATABASE_URL
  ? new PostgresGameRepository(process.env.DATABASE_URL, webRoot)
  : new FileGameRepository(webRoot);
const gameService = new GameService(repository);

async function bootstrap() {
  validateContent();
  await repository.init();

  await app.register(cors, {
    origin: true,
  });

  await app.register(staticPlugin, {
    root: path.join(webRoot, "assets"),
    prefix: "/assets/",
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return readFile(path.join(webRoot, "index.html"), "utf8");
  });
  app.get("/index.html", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return readFile(path.join(webRoot, "index.html"), "utf8");
  });
  app.get("/app-api.js", async (_request, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return readFile(path.join(webRoot, "app-api.js"), "utf8");
  });
  app.get("/vendor/honeycomb-grid.mjs", async (_request, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return readFile(path.join(webRoot, "node_modules", "honeycomb-grid", "dist", "honeycomb-grid.mjs"), "utf8");
  });
  app.get("/styles.css", async (_request, reply) => {
    reply.type("text/css; charset=utf-8");
    return readFile(path.join(webRoot, "styles.css"), "utf8");
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "textrpg",
  }));

  app.post("/api/games", async () => {
    return gameService.createGame();
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/state", async (request) => {
    return gameService.getState(request.params.gameId);
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/map", async (request) => {
    return gameService.getMap(request.params.gameId);
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/inventory", async (request) => {
    return gameService.getInventory(request.params.gameId);
  });

  app.post<{
    Params: { gameId: string };
    Body: unknown;
  }>("/api/games/:gameId/actions", async (request, reply) => {
    const parsed = GameActionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: "invalid_action",
        details: z.treeifyError(parsed.error),
      };
    }

    try {
      return await gameService.performAction(request.params.gameId, parsed.data);
    } catch (error) {
      reply.code(400);
      return {
        error: "action_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen({
    port,
    host: "0.0.0.0",
  });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
