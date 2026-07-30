import "./load-env";
import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
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
  BUILT_IN_RECIPE_MENUS,
  loadStoredContentStudioDocument,
  migrateRenamedItemTextReferences,
} from "./game/content-studio";
import { createContentStudioStore } from "./game/content-studio-store";
import { baseItems } from "./game/data/items";
import { GameActionSchema } from "./game/schemas";
import { FileGameRepository, type GameRepository } from "./game/repository";
import { PostgresGameRepository } from "./game/postgres-repository";
import { GameService } from "./game/service";
import { AuthController } from "./auth";
import {
  hasGeminiConfig,
  testGeminiConnection,
} from "./game/gemini-client";

const app = Fastify({
  logger: true,
});

const webRoot = path.resolve(__dirname, "..");
const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const repository: GameRepository = databaseUrl
  ? new PostgresGameRepository(databaseUrl, webRoot)
  : new FileGameRepository(webRoot);
const contentStudioStore = createContentStudioStore(databaseUrl, webRoot);
const gameService = new GameService(repository);
const authController = new AuthController(repository, gameService);
const contentStudioEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_CONTENT_STUDIO === "true";
const contentStudioAdminToken = process.env.CONTENT_STUDIO_ADMIN_TOKEN?.trim() || "";
const ActionRequestSchema = z.union([
  GameActionSchema,
  z.object({
    action: GameActionSchema,
  }).transform((value) => value.action),
]);

function tokensMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireContentStudioAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!databaseUrl && process.env.NODE_ENV === "production") {
    reply.code(503).send({
      error: "content_studio_database_required",
      message: "온라인 콘텐츠를 영구 저장하려면 데이터베이스 연결이 필요합니다.",
    });
    return false;
  }
  if (!contentStudioAdminToken && process.env.NODE_ENV !== "production") {
    return true;
  }
  if (!contentStudioAdminToken) {
    reply.code(503).send({
      error: "content_studio_not_configured",
      message: "온라인 콘텐츠 스튜디오 관리자 비밀번호가 설정되지 않았습니다.",
    });
    return false;
  }

  const authorization = request.headers.authorization || "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!suppliedToken || !tokensMatch(suppliedToken, contentStudioAdminToken)) {
    reply.code(401).send({
      error: "content_studio_unauthorized",
      message: "관리자 비밀번호를 확인해 주세요.",
    });
    return false;
  }
  return true;
}

async function loadCurrentContentStudioDocument() {
  const [draft, published] = await Promise.all([
    contentStudioStore.load("draft"),
    contentStudioStore.load("published"),
  ]);
  return draft?.document ?? published?.document ?? loadStoredContentStudioDocument();
}

async function bootstrap() {
  await repository.init();
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
  validateContent();

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });

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

  if (contentStudioEnabled) {
    app.get("/content-editor", async (_request, reply) => {
      reply.type("text/html; charset=utf-8");
      return readFile(path.join(webRoot, "content-editor.html"), "utf8");
    });
    app.get("/content-editor.js", async (_request, reply) => {
      reply.type("application/javascript; charset=utf-8");
      return readFile(path.join(webRoot, "content-editor.js"), "utf8");
    });
    app.get("/content-editor.css", async (_request, reply) => {
      reply.type("text/css; charset=utf-8");
      return readFile(path.join(webRoot, "content-editor.css"), "utf8");
    });

    app.get("/api/content-studio", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) {
        return;
      }
      const [draft, published] = await Promise.all([
        contentStudioStore.load("draft"),
        contentStudioStore.load("published"),
      ]);
      const sourceDocument =
        draft?.document ??
        published?.document ??
        loadStoredContentStudioDocument();
      return {
        document: getEffectiveContentStudioDocument(sourceDocument),
        status: {
          draftUpdatedAt: draft?.updatedAt ?? null,
          publishedAt: published?.publishedAt ?? null,
          hasUnpublishedChanges: Boolean(
            draft &&
            (!published || JSON.stringify(draft.document) !== JSON.stringify(published.document)),
          ),
        },
        catalogs: {
          locations: Object.values(worldRegistry.locations).map((location) => ({
            id: location.id,
            name: location.name,
          })),
          quests: Object.values(worldRegistry.quests).map((quest) => {
            const entry = quest as { id: string; title?: string };
            return {
              id: entry.id,
              name: String(entry.title ?? entry.id),
            };
          }),
          builtInItemIds: Object.keys(baseItems),
          builtInRecipeIds: Object.keys(BUILT_IN_RECIPE_MENUS),
        },
      };
    });

    app.put<{ Body: unknown }>("/api/content-studio", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) {
        return;
      }
      try {
        const migrated = migrateRenamedItemTextReferences(
          request.body,
          await loadCurrentContentStudioDocument(),
        );
        const prepared = prepareContentStudioDocument(migrated);
        const stored = await contentStudioStore.saveDraft(prepared.document);
        return {
          ok: true,
          document: getEffectiveContentStudioDocument(prepared.document),
          status: {
            draftUpdatedAt: stored.updatedAt,
            publishedAt: (await contentStudioStore.load("published"))?.publishedAt ?? null,
            hasUnpublishedChanges: true,
          },
        };
      } catch (error) {
        reply.code(400);
        if (error instanceof z.ZodError) {
          return {
            error: "invalid_content",
            message: "입력한 콘텐츠 형식을 확인해 주세요.",
            details: z.treeifyError(error),
          };
        }
        return {
          error: "invalid_content",
          message: error instanceof Error ? error.message : "콘텐츠를 저장하지 못했습니다.",
        };
      }
    });

    app.post<{ Body: unknown }>("/api/content-studio/publish", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) {
        return;
      }
      try {
        const migrated = migrateRenamedItemTextReferences(
          request.body,
          await loadCurrentContentStudioDocument(),
        );
        const prepared = prepareContentStudioDocument(migrated);
        const stored = await contentStudioStore.publish(prepared.document);
        applyPreparedContentStudioRegistry(prepared.registry);
        return {
          ok: true,
          document: getEffectiveContentStudioDocument(prepared.document),
          status: {
            draftUpdatedAt: stored.updatedAt,
            publishedAt: stored.publishedAt,
            hasUnpublishedChanges: false,
          },
        };
      } catch (error) {
        reply.code(400);
        if (error instanceof z.ZodError) {
          return {
            error: "invalid_content",
            message: "입력한 콘텐츠 형식을 확인해 주세요.",
            details: z.treeifyError(error),
          };
        }
        return {
          error: "invalid_content",
          message: error instanceof Error ? error.message : "콘텐츠를 공개하지 못했습니다.",
        };
      }
    });
  }

  app.get("/api/health", async () => ({
    ok: true,
    service: "textrpg",
  }));

  app.post("/api/gemini/test", async (_request, reply) => {
    if (!hasGeminiConfig()) {
      reply.code(503);
      return {
        error: "gemini_not_configured",
        message: "GEMINI_API_KEY 환경변수가 필요합니다.",
      };
    }

    try {
      const result = await testGeminiConnection();
      const modelLabel = result.displayName || result.model;
      return {
        ok: true,
        ...result,
        message:
          `${modelLabel} 실제 생성 성공 · 생성 ${result.generationLatencyMs}ms` +
          ` · 전체 ${result.latencyMs}ms`,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Gemini API 연결을 확인하지 못했습니다.";
      app.log.warn({ message }, "Gemini connection test failed.");
      reply.code(502);
      return {
        error: "gemini_connection_failed",
        message,
      };
    }
  });

  app.get("/api/auth/me", async (request) => {
    return authController.status(request);
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

  app.post("/api/auth/save/restore", async (request, reply) => {
    const user = await authController.requireUser(request, reply);
    if (!user) {
      return {
        error: "auth_required",
        message: "로그인이 필요합니다.",
      };
    }

    try {
      return await gameService.restoreManualGameForUser(user.id);
    } catch (error) {
      reply.code(404);
      return {
        error: "restore_failed",
        message: error instanceof Error ? error.message : "이어하기를 시작하지 못했습니다.",
      };
    }
  });

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

  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/save", async (request) => {
    return gameService.getManualSave(request.params.gameId);
  });

  app.post<{ Params: { gameId: string } }>("/api/games/:gameId/save", async (request, reply) => {
    try {
      const user = await authController.currentUser(request);
      return await gameService.saveManualGame(request.params.gameId, user?.id ?? null);
    } catch (error) {
      reply.code(400);
      return {
        error: "save_failed",
        message: error instanceof Error ? error.message : "저장하지 못했습니다.",
      };
    }
  });

  app.post<{ Params: { gameId: string } }>("/api/games/:gameId/restore", async (request, reply) => {
    try {
      return await gameService.restoreManualGame(request.params.gameId);
    } catch (error) {
      reply.code(404);
      return {
        error: "restore_failed",
        message: error instanceof Error ? error.message : "이어하기를 시작하지 못했습니다.",
      };
    }
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
