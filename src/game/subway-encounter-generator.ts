import { baseItems } from "./data/items";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { geminiModel } from "./gemini-client";
import {
  type GameState,
  type SubwayChoiceIntent,
  type SubwayEncounterActor,
  type SubwayEncounterChoice,
  type SubwayEncounterScene,
  type SubwayEncounterState,
  type SubwayEncounterTurnResult,
  type SubwayGenerationDiagnostics,
  type SubwayPendingThreat,
  type SubwaySituationKind,
} from "./schemas";
import { subwaySituationActionCatalog } from "./subway-encounter";
import { defaultSubwayChoiceThought } from "./subway-choice-thoughts";
import { validChoiceThought } from "./text-world/choice-thoughts";
import {
  generateSubwayRoleJson,
  hasSubwayRoleConfig,
  type SubwayRoleClient,
} from "./subway-role-pipeline";

export const SUBWAY_ENCOUNTER_PROMPT_VERSION = "subway-scene-and-thoughts-v6";

export type SubwayEncounterGenerationInput = {
  gameId: string;
  state: GameState;
  latestServerResult?: SubwayEncounterTurnResult | null;
};

export type SubwayEncounterGenerationResult = {
  scene: SubwayEncounterScene;
  eventKind: SubwaySituationKind;
  actor: SubwayEncounterActor | null;
  pendingThreat: SubwayPendingThreat | null;
  storyHooks: string[];
  diagnostics: SubwayGenerationDiagnostics;
};

export type SubwayEncounterSceneGenerator = (
  input: SubwayEncounterGenerationInput,
) => Promise<SubwayEncounterGenerationResult>;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function asStrings(raw: unknown, max: number, maxLength: number) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.slice(0, maxLength))
    .slice(0, max);
}

function defaultActor(
  kind: SubwaySituationKind,
  encounterId: string,
): SubwayEncounterActor | null {
  if (kind === "hazard") return null;
  return {
    id: `${encounterId}:actor`,
    name: kind === "combat" ? "지하 통로의 약탈자" : "경계하는 생존자",
    appearance: kind === "combat"
      ? "낡은 방한복을 걸치고 손에 짧은 쇠막대를 쥐고 있다."
      : "두꺼운 외투 깃을 세우고 일정한 거리를 유지한다.",
    personality: "쉽게 속내를 드러내지 않고 주변을 예민하게 살핀다.",
    motive: kind === "combat"
      ? "자신이 차지한 통로와 물자를 지키려 한다."
      : "낯선 사람에게서 자신과 동료를 보호하려 한다.",
    relationship: 0,
  };
}

function serverIntentForAction(
  actionToken: string,
): SubwayChoiceIntent {
  if (actionToken.startsWith("use_item:")) {
    const itemId = actionToken.slice("use_item:".length);
    const item = (baseItems as Record<string, { kind?: string }>)[itemId];
    return {
      primary: "use_item",
      style: "careful",
      target:
        itemId === "makeshiftShield"
          ? "self"
          : item?.kind === "tool" ? "enemy" : "self",
      itemId,
    };
  }
  switch (actionToken) {
    case "fight":
    case "close_attack":
      return { primary: "attack", style: "forceful", target: "enemy" };
    case "throw_improvised":
      return { primary: "attack", style: "quick", target: "enemy" };
    case "guard":
      return { primary: "defend", style: "careful", target: "self" };
    case "talk":
      return { primary: "persuade", style: "empathetic", target: "actor" };
    case "flee":
      return { primary: "retreat", style: "quick", target: "exit" };
    case "observe":
      return { primary: "observe", style: "careful", target: "environment" };
    case "force":
      return { primary: "interact", style: "forceful", target: "environment" };
    default:
      return { primary: "interact", style: "careful", target: "environment" };
  }
}

function serverChoiceLabel(
  actionToken: string,
  opening: boolean,
) {
  if (actionToken.startsWith("use_item:")) {
    const itemId = actionToken.slice("use_item:".length);
    const name =
      (baseItems as Record<string, { name?: string }>)[itemId]?.name ?? itemId;
    return `${name}을 사용한다`;
  }
  switch (actionToken) {
    case "fight":
      return "빈틈을 노려 먼저 공격한다";
    case "close_attack":
      return "가까이 붙어 공격한다";
    case "throw_improvised":
      return "주변 물건을 던진다";
    case "guard":
      return "공격을 막고 빈틈을 기다린다";
    case "talk":
      return opening
        ? "무기를 내리라고 설득한다"
        : "싸움을 멈추라고 설득한다";
    case "flee":
      return opening
        ? "계단 쪽으로 물러난다"
        : "거리를 벌리고 후퇴한다";
    case "observe":
      return "상대와 주변을 살핀다";
    case "force":
      return "힘으로 밀어붙인다";
    default:
      return "조심스럽게 움직인다";
  }
}

function serverEncounterChoices(
  input: SubwayEncounterGenerationInput,
  rawThoughts: unknown = [],
): SubwayEncounterChoice[] {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  if (encounter.stage === "resolved") return [];
  const opening = encounter.stage === "opening";
  return subwaySituationActionCatalog(input.state, encounter)
    .slice(0, 20)
    .map((entry, index) => {
      const label = serverChoiceLabel(entry.actionToken, opening);
      const id = `${encounter.id}:${encounter.turnNumber}:server:${index + 1}:` + entry.actionToken.replace(":", "-");
      const matches = Array.isArray(rawThoughts) ? rawThoughts.filter(raw => asRecord(raw).optionId === id) : [];
      const thought = matches.length === 1 ? asRecord(matches[0]).thought : undefined;
      const valid = validChoiceThought(thought);
      return {
        id,
        label,
        effectDescription: entry.mechanicalHint,
        thought: valid ? thought : defaultSubwayChoiceThought(serverIntentForAction(entry.actionToken)),
        thoughtSource: valid ? "llm" : "template",
        intent: serverIntentForAction(entry.actionToken),
        legacyActionToken: entry.actionToken,
      };
    });
}

function serverPendingThreat(
  encounter: SubwayEncounterState,
  resolved: boolean,
): SubwayPendingThreat | null {
  if (resolved) return null;
  const kind = encounter.kind;
  const enemyTraits = new Set(encounter.enemy?.traits ?? []);
  const combatMethod = enemyTraits.has("boss")
    ? "구역 지배자가 퇴로를 막으며 무거운 결정타를 준비한다."
    : enemyTraits.has("agile")
      ? "상대가 기둥 뒤로 몸을 흘리며 사각에서 파고들 틈을 노린다."
      : enemyTraits.has("armored")
        ? "상대가 보호구를 앞세워 거리를 좁히며 묵직한 타격을 준비한다."
        : enemyTraits.has("heavy")
          ? "상대가 무기를 크게 당겨 다음 한 번에 힘을 집중한다."
          : "상대가 무기를 고쳐 쥐고 다음 빈틈을 노린다.";
  return {
    id: `${encounter.id}:threat:${encounter.turnNumber}`,
    kind:
      kind === "combat" ? "attack" : kind === "social" ? "pressure" : "hazard",
    target: kind === "combat" ? "player" : "environment",
    method:
      kind === "combat"
        ? combatMethod
        : kind === "social"
          ? "상대의 경계가 높아지며 대화의 주도권을 빼앗으려 한다."
          : "불안정한 구조물이 흔들리며 다음 움직임을 재촉한다.",
    profile:
      kind === "combat"
        ? "standard_attack"
        : kind === "social"
          ? "social_pressure"
          : "environmental_hazard",
  };
}

function compileGeneration(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
  latencyMs: number,
  requestError: string | null,
): SubwayEncounterGenerationResult {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const data = asRecord(raw);
  const sceneData = asRecord(data.scene);
  const eventKind = encounter.kind;
  let repaired = requestError ? 1 : 0;
  const actor = authoritativeActor(input);

  const fallbackTitle = input.latestServerResult
    ? "선택의 결과"
    : eventKind === "combat"
      ? "통로를 막은 그림자"
      : eventKind === "social"
        ? "경계하는 생존자"
        : "불안정한 통로";
  const rawTitle = data.title ?? sceneData.title;
  const title = typeof rawTitle === "string" && rawTitle.trim()
    ? rawTitle.trim().slice(0, 80)
    : fallbackTitle;
  if (title === fallbackTitle) repaired += 1;

  let paragraphs = asStrings(
    data.narrative ??
      data.paragraphs ??
      sceneData.narrative ??
      sceneData.paragraphs,
    4,
    600,
  );
  if (paragraphs.length === 0) {
    paragraphs = input.latestServerResult
      ? [
          input.latestServerResult.summary,
          encounter.stage === "resolved"
            ? "소란이 가라앉고 다음 길을 고를 여유가 생겼다."
            : "상황은 아직 끝나지 않았고, 다음 움직임이 필요하다.",
        ]
      : [
          eventKind === "combat"
            ? `${actor?.name ?? "낯선 약탈자"}가 통로 한가운데에서 길을 막는다.`
            : eventKind === "social"
              ? `${actor?.name ?? "낯선 생존자"}가 거리를 둔 채 이쪽을 살핀다.`
              : "앞쪽 구조물이 불안정하게 흔들리며 안전한 길을 가늠하기 어렵다.",
        ];
    repaired += 1;
  }

  const choices = serverEncounterChoices(input, requestError ? [] : data.choiceThoughts);
  const pendingThreat = serverPendingThreat(
    encounter,
    encounter.stage === "resolved",
  );
  const storyHooks: string[] = [];
  const fallback = Boolean(requestError) || Object.keys(data).length === 0;

  return {
    scene: {
      scenarioId: encounter.id,
      turnNumber: encounter.turnNumber,
      kind: eventKind,
      phase: encounter.stage,
      title,
      paragraphs,
      choices,
      source: fallback ? "template" : "mixed",
      generatedAt: new Date().toISOString(),
    },
    eventKind,
    actor,
    pendingThreat,
    storyHooks,
    diagnostics: {
      latencyMs,
      repairedFieldCount: repaired,
      droppedChoiceCount: 0,
      fallback,
      errorReason: requestError,
    },
  };
}

function compactHistory(state: GameState) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter;
  return (encounter?.history ?? []).slice(-6).map((entry) => ({
    selectedIntent: entry.result.selectedIntent,
    selectedLabel: entry.result.selectedLabel,
    selectedEffect: entry.result.selectedEffectDescription,
    authoritativeSummary: entry.result.summary,
  }));
}

function conditionLabel(value: number, healthy: number) {
  if (value <= Math.max(2, Math.floor(healthy * 0.25))) return "위태로움";
  if (value <= Math.floor(healthy * 0.55)) return "지침";
  return "버틸 만함";
}

function authoritativeActor(input: SubwayEncounterGenerationInput) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  if (encounter.kind === "hazard") {
    return null;
  }
  if (encounter.actor) {
    return encounter.actor;
  }
  if (encounter.enemy) {
    return {
      id: `${encounter.id}:actor`,
      name: encounter.enemy.name,
      appearance: encounter.enemy.description,
      personality: "경계심이 강하고 자신의 우위를 쉽게 포기하지 않는다.",
      motive: encounter.objective,
      relationship: 0,
    } satisfies SubwayEncounterActor;
  }
  return defaultActor(encounter.kind, encounter.id);
}

function storyBrief(input: SubwayEncounterGenerationInput) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const floor = input.state.subwayExpedition.currentFloor!;
  return {
    place: {
      depth: floor.depth,
      zone: floor.zone,
      title: floor.title,
      environment: floor.paragraphs.slice(0, 3),
      mood: floor.tensionSummary,
    },
    eventKind: encounter.kind,
    objective: encounter.objective,
    actor: authoritativeActor(input),
    incomingPressure: encounter.pendingThreat?.method ?? "",
    playerCondition: {
      body: conditionLabel(input.state.stats.hp, 10),
      mind: conditionLabel(input.state.stats.mind, 10),
      energy: conditionLabel(input.state.stats.energy, 15),
    },
    memory: {
      facts: input.state.subwayExpedition.storyMemory.facts.slice(-6),
      knownActors:
        input.state.subwayExpedition.storyMemory.knownActors.slice(-4),
      unresolvedThreads:
        input.state.subwayExpedition.storyMemory.unresolvedThreads.slice(-4),
      recentSummaries:
        input.state.subwayExpedition.storyMemory.recentSummaries.slice(-3),
    },
  };
}

function authoritativeResultPayload(input: SubwayEncounterGenerationInput) {
  const result = input.latestServerResult;
  if (!result) return null;
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const playerHpChange =
    result.statChanges.find((change) => change.stat === "hp")?.amount ?? 0;
  return {
    enemyName: encounter.enemy?.name ?? encounter.actor?.name ?? "상대",
    selectedLabel: result.selectedLabel,
    selectedIntent: result.selectedIntent,
    selectedEffect: result.selectedEffectDescription,
    selectedThought: result.selectedThought,
    success: result.success,
    rolls: result.rolls,
    damageDealt: result.damageDealt,
    damageTaken: result.damageTaken,
    playerHpBefore: result.playerHpAfter - playerHpChange,
    playerHpAfter: result.playerHpAfter,
    enemyHpBefore: result.enemyHpAfter + result.damageDealt,
    enemyHpAfter: result.enemyHpAfter,
    minutes: result.minutes,
    statChanges: result.statChanges,
    itemChanges: result.itemChanges,
    toolDurabilityChanges: result.toolDurabilityChanges,
    relationshipChange: result.relationshipChange,
    stageAfter: result.stageAfter,
    resolution: result.resolution,
    rewards:
      result.resolution === "victory"
        ? encounter.rewardItems
        : [],
    summary: result.summary,
  };
}

function fallbackNarrativeDraft(input: SubwayEncounterGenerationInput) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const actor = authoritativeActor(input);
  if (input.latestServerResult) {
    return {
      title: encounter.stage === "resolved" ? "상황의 결말" : "선택의 결과",
      narrative: [
        input.latestServerResult.summary,
        encounter.stage === "resolved"
          ? "소란이 가라앉고 다음 길을 고를 여유가 생겼다."
          : "상황은 아직 끝나지 않았고, 다음 움직임이 필요하다.",
      ],
      nextSceneHook: "",
      storyHooks: [],
    };
  }
  return {
    title: encounter.kind === "combat"
      ? "통로를 막은 그림자"
      : encounter.kind === "social"
        ? "경계하는 생존자"
        : "불안정한 통로",
    narrative: [
      encounter.kind === "combat"
        ? `${actor?.name ?? "낯선 약탈자"}가 지하 통로 한가운데에서 길을 막는다.`
        : encounter.kind === "social"
          ? `${actor?.name ?? "낯선 생존자"}가 거리를 둔 채 이쪽을 살핀다.`
          : "앞쪽 구조물이 불안정하게 흔들리며 안전한 길을 가늠하기 어렵다.",
      encounter.kind === "combat"
        ? "금속이 바닥을 스치는 소리가 울리고, 상대의 시선은 이쪽의 손과 발을 번갈아 훑는다."
        : encounter.kind === "social"
          ? "짧은 침묵 사이로 서로의 숨소리만 남고, 먼저 거리를 좁히는 쪽을 기다리는 긴장이 이어진다."
          : "먼지와 작은 파편이 계속 떨어지는 가운데, 어느 발판이 버틸지 빠르게 판단해야 한다.",
    ],
    nextSceneHook: "",
    storyHooks: [],
  };
}

function usableNarrativeDraft(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
) {
  const data = asRecord(raw);
  const fallback = fallbackNarrativeDraft(input);
  const narrative = asStrings(data.narrative ?? data.paragraphs, 4, 600);
  return {
    title: typeof data.title === "string" && data.title.trim()
      ? data.title.trim().slice(0, 80)
      : fallback.title,
    narrative: narrative.length > 0 ? narrative : fallback.narrative,
    nextSceneHook:
      typeof data.nextSceneHook === "string"
        ? data.nextSceneHook.trim().slice(0, 240)
        : fallback.nextSceneHook,
    storyHooks: asStrings(data.storyHooks, 3, 200),
  };
}

export function fallbackSubwayEncounterGeneration(
  input: SubwayEncounterGenerationInput,
  error: unknown,
  latencyMs = 0,
) {
  return compileGeneration(
    {},
    input,
    latencyMs,
    error instanceof Error ? error.message : String(error),
  );
}

export function createSubwayEncounterSceneGenerator(
  roleClient: SubwayRoleClient = generateSubwayRoleJson,
  roleConfigAvailable: () => boolean = hasSubwayRoleConfig,
): SubwayEncounterSceneGenerator {
  return async (input) => {
    const encounter =
      input.state.subwayExpedition.currentFloorProgress.encounter;
    const floor = input.state.subwayExpedition.currentFloor;
    if (!encounter || !floor) {
      throw new Error("LLM에 전달할 지하철 상황 상태가 없습니다.");
    }

    const startedAt = Date.now();
    const roleErrors: string[] = [];
    const sceneRole = input.latestServerResult
      ? "result_scene" as const
      : "opening_scene" as const;
    const sceneTarget =
      `${sceneRole}:${encounter.id}:turn:${encounter.turnNumber}`;
    let narrativeRaw: unknown = {};

    if (!roleConfigAvailable()) {
      roleErrors.push("Subway LLM role pipeline is not configured.");
    } else {
      try {
        narrativeRaw = await roleClient({
          gameId: input.gameId,
          role: sceneRole,
          target: sceneTarget,
          payload: {
            promptVersion: SUBWAY_ENCOUNTER_PROMPT_VERSION,
            storyBrief: storyBrief(input),
            previousScene: encounter.currentScene
              ? {
                  title: encounter.currentScene.title,
                  paragraphs: encounter.currentScene.paragraphs,
                }
              : null,
            nextChoices: serverEncounterChoices(input).map(choice => ({ optionId: choice.id, label: choice.label, intent: choice.intent, defaultThought: choice.thought })),
            authoritativeResult: authoritativeResultPayload(input),
            recentAuthoritativeHistory: compactHistory(input.state),
          },
          timeoutMs: 20_000,
        });
      } catch (error) {
        roleErrors.push(`${sceneRole}: ${
          error instanceof Error ? error.message : String(error)
          }`);
      }
    }

    const narrative = usableNarrativeDraft(narrativeRaw, input);
    const raw = {
      eventKind: encounter.kind,
      actor: authoritativeActor(input),
      title: narrative.title,
      narrative: narrative.narrative,
      choiceThoughts: asRecord(narrativeRaw).choiceThoughts,
    };
    const requestError = roleErrors.length > 0 ? roleErrors.join(" | ") : null;
    const result = compileGeneration(
      raw,
      input,
      Date.now() - startedAt,
      requestError,
    );
    const target = `role-pipeline:${encounter.id}:turn:${encounter.turnNumber}`;
    appendDevLlmTraceForGame(input.gameId, {
      scope: "subway",
      target,
      stage: "draft_validation",
      model: geminiModel(),
      status: result.diagnostics.fallback ? "fallback" : "success",
      request: "",
      response: "",
      message:
        `${sceneRole} → ${
          encounter.stage === "resolved" ? "종료" : "server_choices"
        }: ` +
        `보완 ${result.diagnostics.repairedFieldCount}개, ` +
        `제거 선택지 ${result.diagnostics.droppedChoiceCount}개, ` +
        `fallback ${result.diagnostics.fallback ? "yes" : "no"}, ` +
        `${result.diagnostics.latencyMs}ms`,
      errorReason: result.diagnostics.errorReason ?? undefined,
    });
    return result;
  };
}

export const generateSubwayEncounterScene =
  createSubwayEncounterSceneGenerator();

export function compileSubwayEncounterDraftForTest(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
) {
  return compileGeneration(raw, input, 0, null);
}
