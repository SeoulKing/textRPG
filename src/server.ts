import "./load-env";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerArcanaCombatSocket } from "./arcana-combat-socket";
import staticPlugin from "@fastify/static";
import { z } from "zod";
import {
  applyPreparedContentStudioRegistry,
  getEffectiveContentStudioDocument,
  prepareContentStudioDocument,
  repairContentStudioQuestionMarkCorruption,
  validateContent,
  worldRegistry,
} from "./game/data/registry";
import {
  loadStoredContentStudioDocument,
} from "./game/content-studio";
import { ContentVersionStore } from "./game/content-versions";
import { createContentStudioStore } from "./game/content-studio-store";
import { GameActionSchema } from "./game/schemas";
import { FileGameRepository, type GameRepository } from "./game/repository";
import { PostgresGameRepository } from "./game/postgres-repository";
import { GameService } from "./game/service";
import { AuthController } from "./auth";
import { OnlineStore } from "./online/store";
import { ArcanaItemCatalog } from "./online/item-catalog";
import { OnlineAccounts, OnlineError } from "./online/accounts";
import { ArcanaWorld } from "./online/world";
import { registerOnlineRoutes } from "./online/routes";

const app = Fastify({
  logger: true,
  bodyLimit: 16 * 1024 * 1024,
});

const webRoot = path.resolve(__dirname, "..");
const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const repository: GameRepository = databaseUrl
  ? new PostgresGameRepository(databaseUrl, webRoot)
  : new FileGameRepository(webRoot);
const contentStudioStore = createContentStudioStore(databaseUrl, webRoot);
const gameService = new GameService(repository);
const contentVersions = new ContentVersionStore(databaseUrl, webRoot);
const onlineStore = new OnlineStore(databaseUrl, webRoot, repository);
const arcanaItemCatalog = new ArcanaItemCatalog(onlineStore,webRoot);
const onlineAccounts = new OnlineAccounts(onlineStore, repository, gameService);
const authController = new AuthController(onlineAccounts, gameService, repository);
const arcanaWorld = new ArcanaWorld(onlineStore, onlineAccounts, repository, gameService, arcanaItemCatalog);
onlineAccounts.onRevoke = id => arcanaWorld.revoke(id);
onlineAccounts.onCharactersChanged = ids => arcanaWorld.refreshCharacters(ids);
app.setErrorHandler((error, request, reply) => {
  if (error instanceof OnlineError) return reply.code(error.status).send({error:error.code,message:error.message});
  if (error instanceof z.ZodError) return reply.code(400).send({error:"invalid_request",message:"입력 내용을 확인해 주세요."});
  request.log.error(error);
  return reply.code((error as {statusCode?:number}).statusCode || 500).send({error:"request_failed",message:"요청을 처리하지 못했습니다."});
});
app.addHook("onClose", async () => { await arcanaWorld.stop(); await onlineStore.close(); });
const ActionRequestSchema = z.union([GameActionSchema, z.object({ action: GameActionSchema }).transform(value => value.action)]);

async function bootstrap() {
  if (process.env.NODE_ENV === "production" && (!databaseUrl || !process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32 || !process.env.PUBLIC_BASE_URL?.startsWith("https://"))) throw new Error("Production requires PostgreSQL, AUTH_SECRET (32+ characters), and HTTPS PUBLIC_BASE_URL");
  await repository.init();
  await onlineStore.init();
  await arcanaItemCatalog.init();
  await contentStudioStore.init();

  const [storedPublished, storedDraft] = await Promise.all([
    contentStudioStore.load("published"),
    contentStudioStore.load("draft"),
  ]);
  if (storedPublished) {
    const repairedPublished = repairContentStudioQuestionMarkCorruption(
      storedPublished.document,
    );
    const repairedDraft = storedDraft
      ? repairContentStudioQuestionMarkCorruption(storedDraft.document)
      : null;
    if (repairedPublished.repairedFields > 0) {
      await contentStudioStore.publish(repairedPublished.document);
      app.log.warn(
        { repairedFields: repairedPublished.repairedFields },
        "Repaired question-mark corruption in published content studio data.",
      );
    }
    if (repairedDraft && repairedDraft.repairedFields > 0) {
      await contentStudioStore.saveDraft(repairedDraft.document);
      app.log.warn(
        { repairedFields: repairedDraft.repairedFields },
        "Repaired question-mark corruption in draft content studio data.",
      );
    }
    applyPreparedContentStudioRegistry(
      prepareContentStudioDocument(repairedPublished.document).registry,
    );
  } else {
    const seed = prepareContentStudioDocument(loadStoredContentStudioDocument());
    await contentStudioStore.publish(seed.document);
    applyPreparedContentStudioRegistry(seed.registry);
  }
  await contentVersions.init(worldRegistry);
  validateContent();

  app.addHook("onSend", async (request, reply, payload) => {
    const pathname = request.url.split("?", 1)[0];
    const isStaticAsset = pathname.startsWith("/assets/") || pathname.startsWith("/client/") || pathname.startsWith("/vendor/") || /^\/godot\/.+\.(wasm|pck|js|png|svg)$/.test(pathname);
    if (pathname.startsWith("/godot/")) {
      reply.header("Vary", [reply.getHeader("Vary"), "Accept-Encoding"].filter(Boolean).join(", "));
    }
    const isNarrativeStream = String(reply.getHeader("content-type") ?? "").startsWith("application/x-ndjson");
    // Revalidate stable URLs so Studio image replacements appear on the next load.
    // Static files retain their ETag/Last-Modified and can return an empty 304.
    const immutable = /^\/assets\/optimized\/[\w-]+-[a-f0-9]{16}\.(webp|woff2)$/.test(pathname);
    reply.header("Cache-Control", immutable && reply.statusCode < 400
      ? "public, max-age=31536000, immutable"
      : isStaticAsset && reply.statusCode < 400
      ? "public, max-age=0, must-revalidate"
      : isNarrativeStream ? "no-store, no-transform" : "no-store");
    if (pathname.startsWith("/assets/unity-preview/Build/") && pathname.endsWith(".br")) {
      reply.header("Content-Encoding", "br");
      if (pathname.endsWith(".js.br")) reply.type("application/javascript");
      else if (pathname.endsWith(".wasm.br")) reply.type("application/wasm");
      else if (pathname.endsWith(".json.br")) reply.type("application/json");
      else reply.type("application/octet-stream");
    }
    return payload;
  });

  await app.register(websocket, { options: { maxPayload: 16 * 1024, perMessageDeflate: false } });
  app.get("/api/arcana/items",async () => arcanaItemCatalog.summary());
  registerOnlineRoutes(app, onlineAccounts, authController, arcanaWorld);
  registerArcanaCombatSocket(app, gameService);
  await app.register(cors, {
    origin: (origin, callback) => {
      const allowed = (process.env.ALLOWED_ORIGINS || process.env.PUBLIC_BASE_URL || "").split(",").map(value => value.trim());
      callback(null, !origin || allowed.includes(origin) || (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)));
    },
    credentials: true,
  });

  await app.register(staticPlugin, {
    root: path.join(webRoot, "assets"),
    prefix: "/assets/",
  });
  // Godot Compatibility / single-thread export needs no cross-origin isolation.
  await app.register(staticPlugin, {
    root: process.env.NODE_ENV === "production" && existsSync(path.join(webRoot, ".server-dist", "godot"))
      ? path.join(webRoot, ".server-dist", "godot") : path.join(webRoot, "godot-web"),
    prefix: "/godot/",
    preCompressed: true,
    decorateReply: false,
  });
  app.get("/", async (_request, reply) => reply.redirect("/godot/"));
  app.get("/account.html", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await readFile(path.join(webRoot,"account.html"),"utf8")));
  app.get("/account.js", async (_request, reply) => reply.type("application/javascript").send(await readFile(path.join(webRoot,"account.js"),"utf8")));
  app.get("/index.html", async (_request, reply) => reply.redirect("/godot/"));
  for (const route of ["/unity-web", "/unity-preview"]) {
    app.get(route, async (_request, reply) => {
      reply.type("text/html; charset=utf-8");
      return readFile(path.join(webRoot, "unity-preview.html"), "utf8");
    });
  }
  app.get("/api/health", async (_request, reply) => {
    const world=arcanaWorld.health();
    return reply.code(world.ok?200:503).send({
      ok: world.ok,
      service: "arcana",
      arcanaProtocol: 3,
      arcanaLocationRevision: 1,
      world,
    });
  });

  app.get("/api/auth/me", async (request, reply) => {
    return authController.status(request, reply);
  });

  app.get("/api/auth/kakao/start", async (request, reply) => {
    return authController.startKakaoLogin(request, reply);
  });

  app.get("/api/auth/kakao/callback", async (request, reply) => {
    return authController.handleKakaoCallback(request, reply);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    return authController.logout(request, reply);
  });

  app.post<{ Body: unknown }>("/api/games", async (request, reply) => {
    const parsed = z.object({
      startAt: z.literal("arcana").default("arcana"),
    }).safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_start_location", details: z.treeifyError(parsed.error) };
    }
    const started = performance.now();
    const issued = await onlineAccounts.guest(request, reply);
    const character = await onlineAccounts.ensureCharacter(issued.principal);
    const snapshot = await gameService.getState(character.gameId);
    reply.header("Server-Timing", `game;dur=${(performance.now() - started).toFixed(1)}`);
    return snapshot;
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/state", async (request) => {
    const principal = await onlineAccounts.require(request);
    return await arcanaWorld.state(principal, request.params.gameId) || gameService.getState(request.params.gameId);
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/map", async (request) => {
    return gameService.getMap(request.params.gameId);
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/inventory", async (request) => {
    return gameService.getInventory(request.params.gameId);
  });

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/save", async (request) => {
    return gameService.getManualSave(request.params.gameId);
  });

  app.post<{ Params: { gameId: string } }>("/api/games/:gameId/save", async (request, reply) => {
    try {
      const principal = await onlineAccounts.require(request);
      return await arcanaWorld.save(principal, request.params.gameId);
    } catch (error) {
      reply.code(400);
      return {
        error: "save_failed",
        message: error instanceof Error ? error.message : "저장하지 못했습니다.",
      };
    }
  });

  app.post<{ Params: { gameId: string } }>("/api/games/:gameId/restore", async () => {
    throw new OnlineError("online_restore_disabled", "공용 세계의 진행은 과거 저장으로 되돌릴 수 없습니다.", 403);
  });

  app.post<{
    Params: { gameId: string };
    Body: unknown;
  }>("/api/games/:gameId/actions", async (request, reply) => {
    const parsed = ActionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: "invalid_action",
        details: z.treeifyError(parsed.error),
      };
    }

    const principal = await onlineAccounts.require(request);
    return arcanaWorld.personal(principal, request.params.gameId, parsed.data, typeof request.headers["x-action-id"] === "string" ? request.headers["x-action-id"] : undefined);
  });

  app.get<{ Params: { gameId: string; requestId: string } }>("/api/games/:gameId/actions/:requestId", async (request, reply) => {
    const principal = await onlineAccounts.require(request);
    return arcanaWorld.recoverOperation(principal,request.params.gameId,request.params.requestId);
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen({
    port,
    host: "0.0.0.0",
  });
}

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  void app.close().then(() => process.exit(0), error => { app.log.error(error); process.exit(1); });
});

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
