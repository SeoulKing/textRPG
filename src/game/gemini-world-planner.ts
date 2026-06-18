import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { generateGeminiJson, geminiModel } from "./gemini-client";
import type { ContentRegistry, GameState, NarrativeAnchorDraft, NarrativeSceneDraft, WorldPlan } from "./schemas";
import { NarrativeContinuationRequestSchema, WorldPlanSchema } from "./schemas";
import type { PlannerInput, StoryBeatPlannerInput, WorldPlanner } from "./narrative-planner-types";
import { buildTomorrowPlanFromDynamicWorld } from "./narrative-planner-fallback";
import {
  markDraftPlannerSource,
  validateNarrativeAnchorDraft,
  validateNarrativeSceneDraft,
} from "./narrative-planner-validation";
import { TemplateWorldPlanner } from "./template-world-planner";

function compactLocation(registry: PlannerInput["registry"], locationId: string) {
  const location = registry.locations[locationId];
  if (!location) {
    return { id: locationId };
  }
  return {
    id: location.id,
    name: location.name,
    summary: location.summary,
    risk: location.risk,
    tags: location.tags,
  };
}

function compactInventory(state: PlannerInput["state"]) {
  return Object.entries(state.inventory)
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => ({ itemId, amount }));
}

function plannerGuidancePayload(input: PlannerInput) {
  const frontier =
    input.registry.actions[input.sourceFrontierActionId]
    ?? input.registry.choices[input.sourceFrontierActionId];
  return {
    day: input.state.day,
    phaseIndex: input.state.phaseIndex,
    currentLocation: compactLocation(input.registry, input.sourceLocationId),
    selectedFrontier: {
      id: input.sourceFrontierActionId,
      label: frontier?.label ?? input.sourceFrontierActionId,
      outcomeHint: frontier?.outcomeHint ?? "",
      tags: frontier?.tags ?? [],
    },
    playerState: {
      hp: input.state.stats.hp,
      mind: input.state.stats.mind,
      energy: input.state.stats.energy,
      money: input.state.money,
      inventory: compactInventory(input.state),
    },
    recentLog: input.recentLog.slice(-8),
    existingDynamicLocations: Object.values(input.state.dynamicContent.locations).map((location) => ({
      id: location.id,
      name: location.name,
      summary: location.summary,
    })),
    rules: [
      "당신은 지역 목록 생성기가 아니라 TRPG 게임마스터입니다. 이 프런티어 이후 플레이어가 처음 마주할 강한 장면을 씁니다.",
      "새 지역은 서울 아포칼립스 배경에 어울리는 앵커 지역 1개입니다.",
      "프런티어 문구는 힌트일 뿐이며, 고정 목적지는 아닙니다. 단, 직전 장소와 감정적으로 이어져야 합니다.",
      "prose에는 유저가 바로 읽을 2~5문단의 소설형 장면을 씁니다. 사람의 대사는 따옴표를 사용합니다.",
      "worldFacts와 unresolvedQuestions에는 다음 장면들이 이어받아야 할 canonical memory를 적습니다.",
      "선택지는 3~4개이며 최소 1개는 frontier_exit intent여야 합니다.",
      "각 선택지는 storyPromise로 '이걸 누르면 어떤 이야기 방향으로 가는지'를 분명히 약속합니다.",
      "아이템은 새 id를 만들지 말고 suggestedItemIds에는 기존 catalog id만 넣습니다.",
      "저수준 effects, conditions, action schema는 만들지 않습니다.",
    ],
  };
}

function storyBeatGuidancePayload(request: StoryBeatPlannerInput) {
  return {
    day: request.state.day,
    phaseIndex: request.state.phaseIndex,
    anchorLocation: {
      id: request.anchorLocationId,
      name: request.anchorLocationName,
      summary: request.anchorSummary,
    },
    sourceScene: {
      id: request.sourceSceneId,
      title: request.sourceSceneTitle,
      paragraphs: request.sourceSceneParagraphs,
    },
    selectedChoice: request.trigger,
    recentLog: request.recentLog.slice(-8),
    localMemory: {
      scenes: request.localSceneIds.slice(-8),
      people: request.localPeopleIds,
      stockNodes: request.localStockNodeIds,
      subareas: request.localSubareaIds,
      openThreads: request.localOpenThreadIds,
      knownWorldFacts: request.knownWorldFacts,
      unresolvedQuestions: request.unresolvedQuestions,
      storyTone: request.storyTone,
      currentTension: request.currentTension,
      dramaticQuestion: request.dramaticQuestion,
      lineage: request.lineageSceneIds,
    },
    playerState: {
      hp: request.state.stats.hp,
      mind: request.state.stats.mind,
      energy: request.state.stats.energy,
      money: request.state.money,
      inventory: compactInventory(request.state),
      activeQuestIds: request.activeQuestIds,
    },
    rules: [
      "당신은 선택지 결과를 처리하는 게임마스터입니다. 방금 선택이 만든 감정적 결과를 먼저 보여준 뒤 다음 선택을 엽니다.",
      "현재 앵커 지역 안에서 이어지는 다음 씬만 만듭니다.",
      "새 맵 location은 만들지 않습니다.",
      "prose에는 유저가 바로 읽을 2~5문단의 소설형 장면을 씁니다. 사람의 대사는 따옴표를 사용합니다.",
      "기존 knownWorldFacts, unresolvedQuestions, storyTone을 적극적으로 이어받습니다.",
      "sceneGoal, dramaticQuestion, worldFacts, unresolvedQuestions를 갱신해 다음 장면이 단절되지 않게 합니다.",
      "선택지는 3~4개이며 최소 1개는 frontier_exit intent여야 합니다.",
      "각 선택지는 storyPromise로 '이걸 누르면 어떤 이야기 방향으로 가는지'를 분명히 약속합니다.",
      "기계적 효과는 쓰지 말고, 선택지 의도와 서사 힌트만 작성합니다.",
      "모든 플레이어 노출 문장은 한국어로 작성합니다.",
    ],
  };
}

function mergeObject<T extends Record<string, unknown>>(fallback: T, candidate: unknown): T {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return fallback;
  }
  const raw = candidate as Partial<T>;
  return {
    ...fallback,
    ...raw,
    choices: Array.isArray(raw.choices) ? raw.choices.slice(0, 4) : fallback.choices,
    residents: Array.isArray(raw.residents) ? raw.residents.slice(0, 2) : fallback.residents,
    subareas: Array.isArray(raw.subareas) ? raw.subareas.slice(0, 4) : fallback.subareas,
    openThreads: Array.isArray(raw.openThreads) ? raw.openThreads.slice(0, 4) : fallback.openThreads,
    worldFacts: Array.isArray(raw.worldFacts) ? raw.worldFacts.slice(0, 8) : fallback.worldFacts,
    unresolvedQuestions: Array.isArray(raw.unresolvedQuestions) ? raw.unresolvedQuestions.slice(0, 8) : fallback.unresolvedQuestions,
    directorNotes: Array.isArray(raw.directorNotes) ? raw.directorNotes.slice(0, 8) : fallback.directorNotes,
    suggestedItemIds: Array.isArray(raw.suggestedItemIds) ? raw.suggestedItemIds.slice(0, 3) : fallback.suggestedItemIds,
  };
}

function errorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class GeminiWorldPlanner implements WorldPlanner {
  constructor(private readonly fallback: TemplateWorldPlanner = new TemplateWorldPlanner()) {}

  private async generateJson<T>(
    gameId: string,
    target: string,
    schemaName: string,
    payload: Record<string, unknown>,
  ) {
    return generateGeminiJson<T>(
      `You are the story director for a Korean survival text RPG set in ruined Seoul.
Return JSON only.
You are a TRPG game master first and a schema writer second.
Generate vivid narrative drafts, not low-level engine effects.
Never invent schema keys outside the requested draft schema.
Write all player-facing strings in Korean.
Use frontier context as a hint, not a fixed destination.
Do not create brand new item ids. Refer only to existing catalog ids or broad item hints/categories.
Anchor drafts must include at least one frontier_exit choice.
Scene drafts must stay inside the same anchor location and also include at least one frontier_exit choice.
Write prose like a bleak, grounded survival novel: sensory detail, concrete stakes, and quoted dialogue when people speak.
The prose field is the primary scene text. Make it 2 to 5 paragraphs, not a short template summary.
Use worldFacts, unresolvedQuestions, dramaticQuestion, tension, and directorNotes as story memory for later turns.
Choices should feel concrete, exploratory, morally or materially distinct, and grounded in the immediate situation.
Return valid JSON only.`,
      { schemaName, payload },
      {
        model: geminiModel(),
        temperature: 0.9,
        trace: {
          gameId,
          scope: "planner",
          target,
        },
      },
    );
  }

  async generateAnchorDraft(input: PlannerInput): Promise<NarrativeAnchorDraft> {
    const fallback = await this.fallback.generateAnchorDraft(input);
    try {
      const raw = await this.generateJson<unknown>(input.gameId, `region:${input.sequence}:request`, "NarrativeAnchorDraft", {
        fallback,
        frontierContext: plannerGuidancePayload(input),
      });
      appendDevLlmTraceForGame(input.gameId, {
        scope: "planner",
        target: `region:${input.sequence}:raw-draft`,
        stage: "raw_draft",
        model: geminiModel(),
        status: "success",
        request: "",
        response: JSON.stringify(raw, null, 2),
        message: "Gemini가 새 앵커 지역 초안을 반환했습니다.",
      });
      const merged = mergeObject(fallback as unknown as Record<string, unknown>, raw);
      const validated = markDraftPlannerSource(validateNarrativeAnchorDraft(merged), "llm");
      appendDevLlmTraceForGame(input.gameId, {
        scope: "planner",
        target: `region:${input.sequence}:draft-validation`,
        stage: "draft_validation",
        model: geminiModel(),
        status: "success",
        request: "",
        response: JSON.stringify(validated, null, 2),
        message: "앵커 지역 초안 검증을 통과했습니다.",
      });
      return validated;
    } catch (error) {
      appendDevLlmTraceForGame(input.gameId, {
        scope: "planner",
        target: `region:${input.sequence}:fallback`,
        stage: "fallback",
        model: geminiModel(),
        status: "fallback",
        request: "",
        response: JSON.stringify(fallback, null, 2),
        message: "앵커 지역 초안 생성 또는 검증에 실패해 템플릿 초안을 사용했습니다.",
        errorReason: errorReason(error),
      });
      return fallback;
    }
  }

  async generateSceneDraft(request: StoryBeatPlannerInput): Promise<NarrativeSceneDraft> {
    const fallback = await this.fallback.generateSceneDraft(request);
    const safeRequest = NarrativeContinuationRequestSchema.parse({
      gameId: request.gameId,
      locationId: request.locationId,
      anchorLocationId: request.anchorLocationId,
      anchorLocationName: request.anchorLocationName,
      anchorSummary: request.anchorSummary,
      sourceSceneId: request.sourceSceneId,
      sourceSceneTitle: request.sourceSceneTitle,
      sourceSceneParagraphs: request.sourceSceneParagraphs,
      trigger: request.trigger,
      recentLog: request.recentLog,
      inventoryItemIds: request.inventoryItemIds,
      activeQuestIds: request.activeQuestIds,
      localSceneIds: request.localSceneIds,
      localPeopleIds: request.localPeopleIds,
      localStockNodeIds: request.localStockNodeIds,
      localSubareaIds: request.localSubareaIds,
      localOpenThreadIds: request.localOpenThreadIds,
      knownWorldFacts: request.knownWorldFacts,
      unresolvedQuestions: request.unresolvedQuestions,
      storyTone: request.storyTone,
      currentTension: request.currentTension,
      dramaticQuestion: request.dramaticQuestion,
      lineageSceneIds: request.lineageSceneIds,
      sequence: request.sequence,
    });

    try {
      const raw = await this.generateJson<unknown>(
        request.gameId,
        `beat:${request.sequence}:request`,
        "NarrativeSceneDraft",
        {
          fallback,
          continuationContext: {
            request: safeRequest,
            plannerGuidance: storyBeatGuidancePayload(request),
          },
        },
      );
      appendDevLlmTraceForGame(request.gameId, {
        scope: "planner",
        target: `beat:${request.sequence}:raw-draft`,
        stage: "raw_draft",
        model: geminiModel(),
        status: "success",
        request: "",
        response: JSON.stringify(raw, null, 2),
        message: "Gemini가 다음 씬 초안을 반환했습니다.",
      });
      const merged = mergeObject(fallback as unknown as Record<string, unknown>, raw);
      const validated = markDraftPlannerSource(validateNarrativeSceneDraft(merged), "llm");
      appendDevLlmTraceForGame(request.gameId, {
        scope: "planner",
        target: `beat:${request.sequence}:draft-validation`,
        stage: "draft_validation",
        model: geminiModel(),
        status: "success",
        request: "",
        response: JSON.stringify(validated, null, 2),
        message: "다음 씬 초안 검증을 통과했습니다.",
      });
      return validated;
    } catch (error) {
      appendDevLlmTraceForGame(request.gameId, {
        scope: "planner",
        target: `beat:${request.sequence}:fallback`,
        stage: "fallback",
        model: geminiModel(),
        status: "fallback",
        request: "",
        response: JSON.stringify(fallback, null, 2),
        message: "다음 씬 초안 생성 또는 검증에 실패해 템플릿 초안을 사용했습니다.",
        errorReason: errorReason(error),
      });
      return fallback;
    }
  }

  async planTomorrow(state: GameState, _registry: ContentRegistry, gameId: string): Promise<WorldPlan["tomorrow"]> {
    const fallback = buildTomorrowPlanFromDynamicWorld(state);
    try {
      return WorldPlanSchema.shape.tomorrow.parse(
        await this.generateJson(gameId, `worldTomorrowPlan:day${state.day + 1}:request`, "WorldTomorrowPlan", {
          fallback,
          currentDay: state.day,
          dynamicLocations: Object.keys(state.dynamicContent.locations),
          recentLog: state.log.slice(-6).map((entry) => entry.message),
        }),
      );
    } catch (error) {
      appendDevLlmTraceForGame(gameId, {
        scope: "planner",
        target: `worldTomorrowPlan:day${state.day + 1}:fallback`,
        stage: "fallback",
        model: geminiModel(),
        status: "fallback",
        request: "",
        response: JSON.stringify(fallback, null, 2),
        message: "내일 월드 플랜 생성에 실패해 템플릿 플랜을 사용했습니다.",
        errorReason: errorReason(error),
      });
      return fallback;
    }
  }
}
