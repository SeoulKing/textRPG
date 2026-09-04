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
import { MAX_SKILL_LEVEL, FISHING_EFFECT_PER_LEVEL_PERCENT, SKILL_EFFECT_PER_LEVEL_PERCENT } from "./game/skill-progression";
import { inspectStudio } from "./game/studio-validation";
import { StudioPreviewService } from "./game/studio-preview";
import { ContentVersionStore, registerContentVersion } from "./game/content-versions";
import { StudioConflict, createContentStudioStore } from "./game/content-studio-store";
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
const studioPreview = new StudioPreviewService();
app.addHook("onClose", async () => studioPreview.dispose());
const authController = new AuthController(repository, gameService);
const contentStudioEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_CONTENT_STUDIO === "true";
const graphicsPreviewEnabled = process.env.NODE_ENV !== "production";
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
  await contentVersions.init(worldRegistry);
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
  await app.register(staticPlugin, {
    root: path.join(webRoot, "client"),
    prefix: "/client/",
    decorateReply: false,
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
  app.get("/vendor/phaser.mjs", async (_request, reply) => {
    reply.type("application/javascript; charset=utf-8");
    return readFile(path.join(webRoot, "node_modules", "phaser", "dist", "phaser.esm.min.js"), "utf8");
  });
  app.get("/styles.css", async (_request, reply) => {
    reply.type("text/css; charset=utf-8");
    return readFile(path.join(webRoot, "styles.css"), "utf8");
  });

  if (graphicsPreviewEnabled) {
    app.get("/graphics-preview", async (_request, reply) => {
      reply.type("text/html; charset=utf-8");
      return readFile(path.join(webRoot, "graphics-preview.html"), "utf8");
    });
  }

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

    app.get("/content-story-library.js", async (_request, reply) => { reply.type("application/javascript; charset=utf-8"); return readFile(path.join(webRoot, "content-story-library.js"), "utf8"); });
    app.get("/content-scene-pool.js", async (_request, reply) => { reply.type("application/javascript; charset=utf-8"); return readFile(path.join(webRoot, "content-scene-pool.js"), "utf8"); });
    app.get("/content-outcome-editor.js", async (_request, reply) => { reply.type("application/javascript; charset=utf-8"); return readFile(path.join(webRoot, "content-outcome-editor.js"), "utf8"); });
    app.get("/content-writer.js", async (_request, reply) => { reply.type("application/javascript; charset=utf-8"); return readFile(path.join(webRoot, "content-writer.js"), "utf8"); });
    for (const file of ["content-item-text.js", "content-writer-tools.js", "content-writer-workspace.js", "content-writer-preview.js"]) {
      app.get(`/${file}`, async (_request, reply) => { reply.type("application/javascript; charset=utf-8"); return readFile(path.join(webRoot, file), "utf8"); });
    }
    app.get("/api/content-studio/published", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) return;
      const published = await contentStudioStore.load("published");
      return { document: getEffectiveContentStudioDocument(published?.document ?? loadStoredContentStudioDocument()), publishedAt: published?.publishedAt ?? null };
    });
    app.post<{ Body: unknown }>("/api/content-studio/validate", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) return;
      return { issues: inspectStudio(request.body).issues };
    });
    app.post<{ Body: { document: unknown; setup?: unknown } }>("/api/content-studio/preview", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) return;
      try { return studioPreview.start(request.body.document, request.body.setup); }
      catch (error) { return reply.code(400).send({ message: error instanceof Error ? error.message : "시험 플레이 오류" }); }
    });
    app.post<{ Params: { id: string }; Body: unknown }>("/api/content-studio/preview/:id", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) return;
      try { return studioPreview.step(request.params.id, request.body); }
      catch (error) { return reply.code(400).send({ message: error instanceof Error ? error.message : "시험 플레이 오류" }); }
    });
    app.delete<{ Params: { id: string } }>("/api/content-studio/preview/:id", async (request, reply) => {
      if (!requireContentStudioAdmin(request, reply)) return;
      studioPreview.close(request.params.id);
      return { ok:true };
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
          probabilityRules: { maxLevel: MAX_SKILL_LEVEL, fishing: FISHING_EFFECT_PER_LEVEL_PERCENT, exploration: SKILL_EFFECT_PER_LEVEL_PERCENT },
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
        const prepared = { document: migrated };
        const expected = request.headers["if-match"] === "none" ? null : request.headers["if-match"] as string | undefined;
        if (expected === undefined) return reply.code(428).send({ message: "최신 초안을 불러온 뒤 저장해 주세요." });
        const stored = await contentStudioStore.saveDraft(prepared.document, expected);
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
        reply.code(error instanceof StudioConflict ? 409 : 400);
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
        const inspection = inspectStudio(migrated);
        if (inspection.issues.some(issue => issue.severity === "error")) return reply.code(400).send({ message: "공개 전에 오류를 수정해 주세요.", issues: inspection.issues });
        const prepared = prepareContentStudioDocument(migrated);
        const expected = request.headers["if-match"] === "none" ? null : request.headers["if-match"] as string | undefined;
        if (expected === undefined) return reply.code(428).send({ message: "최신 초안을 불러온 뒤 공개해 주세요." });
        await contentVersions.archive(prepared.registry);
        const stored = await contentStudioStore.publish(prepared.document, expected);
        registerContentVersion(prepared.registry, true);
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
        reply.code(error instanceof StudioConflict ? 409 : 400);
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
