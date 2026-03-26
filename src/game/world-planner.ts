import { PHASES } from "./base-data";
import { validateRegistry } from "./data/registry";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { createUniqueDynamicLocationName, normalizeDynamicLocationNames } from "./dynamic-location-naming";
import { generateGeminiJson, geminiModel, hasGeminiConfig } from "./gemini-client";
import { buildRuntimeRegistry, getRuntimeLocationDefinition, mergeDynamicWorldRegistry } from "./runtime-registry";
import type {
  ActionDefinition,
  ChoiceDefinition,
  ContentRegistry,
  DayEvolutionPlan,
  DynamicWorldRegistry,
  Effect,
  GameState,
  GeneratedStoryBeat,
  GeneratedRegionPackage,
  GenerationGuardrails,
  NarrativeContinuationRequest,
  PlannedRegionSummary,
  WorldPlan,
} from "./schemas";
import {
  DayEvolutionPlanSchema,
  GeneratedStoryBeatSchema,
  GeneratedRegionPackageSchema,
  GenerationGuardrailsSchema,
  NarrativeContinuationRequestSchema,
  WorldPlanSchema,
} from "./schemas";

type PlannerInput = {
  gameId: string;
  state: GameState;
  registry: ContentRegistry;
  sourceLocationId: string;
  sourceFrontierActionId: string;
  sequence: number;
  recentLog: string[];
};

type StoryBeatPlannerInput = NarrativeContinuationRequest & {
  state: GameState;
  registry: ContentRegistry;
};

export interface WorldPlanner {
  generateRegionPackage(input: PlannerInput): Promise<GeneratedRegionPackage>;
  generateStoryBeat(request: StoryBeatPlannerInput): Promise<GeneratedStoryBeat>;
  planTomorrow(state: GameState, registry: ContentRegistry, gameId: string): Promise<WorldPlan["tomorrow"]>;
}

const ALLOWED_CONDITION_TYPES = [
  "has_item",
  "skill_gte",
  "flag",
  "flag_not",
  "location",
  "location_visited",
  "day_gte",
  "day_lt",
  "money_gte",
  "quest_state",
  "stock_item_gte",
  "stock_money_gte",
  "stock_item_lt",
  "stock_money_lt",
  "stock_node_discovered",
  "active_stock_node",
  "active_stock_node_not",
];

const ALLOWED_EFFECT_TYPES = [
  "change_stat",
  "set_flag",
  "clear_flag",
  "add_item",
  "remove_item",
  "change_money",
  "travel",
  "start_quest",
  "complete_quest",
  "log",
  "discover_stock_node",
  "focus_stock_node",
  "clear_stock_node_focus",
  "collect_stock_item",
  "collect_stock_item_all",
  "collect_stock_money",
  "collect_stock_money_all",
];

const CONTINUATION_TAG = "continuation";

type FrontierTheme = {
  slug: string;
  locationName: string;
  summary: string;
  introTitle: string;
  introParagraphs: string[];
  personName: string;
  personRole: string;
  personSummary: string;
  personRelation: string;
  personPersonality: string[];
  itemName: string;
  itemDescription: string;
  itemKind: "trade" | "material" | "ticket";
  itemTags: string[];
  stockName: string;
  stockSummary: string;
  staticItemId: string;
  staticItemQty: number;
  questTitle: string;
  questDescription: string;
  questReward: { type: "money"; amount: number } | { type: "add_item"; itemId: string; amount: number };
  eventTitle: string;
  eventSummary: string;
  frontierLabel: string;
  frontierOutcome: string;
  tomorrowSummary: string;
  tomorrowParagraphs: string[];
};

const FRONTIER_THEMES: FrontierTheme[] = [
  {
    slug: "subway_gate",
    locationName: "지하철역 입구",
    summary: "깨진 에스컬레이터와 멈춘 전광판 사이로, 지하로 이어지는 어두운 계단과 버려진 짐들이 입을 벌리고 있다.",
    introTitle: "멈춰 선 역사 입구",
    introParagraphs: [
      "지하철역 입구는 먼지와 종잇조각이 맴도는 바람 속에 입을 다문 채 서 있다.",
      "\"내려갈 생각이면 발밑부터 봐.\" 계단 옆에 웅크린 청년이 낮게 말한다. \"사람들이 급히 버리고 간 것 중 쓸 만한 게 아직 남아 있어.\"",
    ],
    personName: "역 입구를 지키는 청년",
    personRole: "지하 통로 감시자",
    personSummary: "밤마다 역사 입구를 지키며, 밑으로 내려가는 사람들의 발걸음을 유심히 살피는 청년이다.",
    personRelation: "경계심은 남아 있지만, 쓸 만한 정보를 거래하듯 흘려 준다.",
    personPersonality: ["과묵함", "신중함", "눈썰미"],
    itemName: "절연 케이블 꾸러미",
    itemDescription: "역사 설비 틈에서 뜯어낸 케이블 다발이다. 묶음째 들고 다니면 거래나 간단한 보강에 요긴하다.",
    itemKind: "material",
    itemTags: ["전선", "재료", "지하철"],
    stockName: "매표소 금속 캐비닛",
    stockSummary: "깨진 강화유리 안쪽에 뒤집힌 금속 캐비닛이 있다. 누군가 서둘러 뒤지다 남긴 물건이 아직 걸려 있다.",
    staticItemId: "waterBottle",
    staticItemQty: 1,
    questTitle: "역사 아래 남은 꾸러미",
    questDescription: "역 입구를 지키는 청년이 매표소 캐비닛 안에 남은 케이블 꾸러미를 챙겨 달라고 부탁했다.",
    questReward: { type: "money", amount: 900 },
    eventTitle: "계단 끝의 기척",
    eventSummary: "역사 입구를 훑어보던 당신 앞에, 이곳을 먼저 차지한 청년 하나가 말을 건넨다. 아래로 내려가려면 먼저 남은 물자를 챙기라는 눈치다.",
    frontierLabel: "더 안쪽 승강장으로 나아가기",
    frontierOutcome: "역사 안쪽의 어둠을 더 밀고 들어가며, 아직 드러나지 않은 구역을 연다.",
    tomorrowSummary: "밤사이 누군가 더 다녀간 듯, 역사 입구의 공기가 한층 거칠어졌다.",
    tomorrowParagraphs: [
      "역사 입구 바닥엔 밤사이 더 많은 발자국이 겹쳐 있다.",
      "\"어제보다 아래가 더 시끄러워졌어.\" 청년이 굳은 얼굴로 말한다.",
    ],
  },
  {
    slug: "apartment_office",
    locationName: "아파트 관리실",
    summary: "유리문이 반쯤 깨진 관리실 안에는 공구함과 입주민 공지가 어지럽게 흩어져 있다.",
    introTitle: "비어 있는 관리실",
    introParagraphs: [
      "관리실 천장 형광등은 죽은 채지만, 창문 틈으로 드는 빛이 흩어진 서류와 공구 자국을 또렷이 비춘다.",
      "\"전부 가져가진 말아 줘.\" 안쪽 책상 곁에 남은 관리인이 말한다. \"필요한 것 하나만 먼저 찾아 주면 나도 길을 열어 주지.\"",
    ],
    personName: "관리실에 남은 관리인",
    personRole: "아파트 관리 담당",
    personSummary: "사람들이 빠져나간 건물을 끝까지 지키려는 듯, 공용 설비와 잠금장치를 챙기고 있는 중년 관리인이다.",
    personRelation: "쉽게 마음을 열지는 않지만, 약속을 지키는 사람에겐 분명한 보답을 해 준다.",
    personPersonality: ["완고함", "성실함", "책임감"],
    itemName: "예비 자물쇠 세트",
    itemDescription: "관리실 서랍 깊숙한 곳에 남은 예비 자물쇠와 번호표 묶음이다. 거래나 거처 보강에 값이 난다.",
    itemKind: "trade",
    itemTags: ["관리실", "자물쇠", "거래"],
    stockName: "공구함 아래 서랍",
    stockSummary: "공구함 아래 얇은 서랍이 삐걱거리며 열리고, 서류 더미 아래 남은 물건들이 드러난다.",
    staticItemId: "cannedFood",
    staticItemQty: 1,
    questTitle: "관리실 서랍의 예비품",
    questDescription: "관리인이 공구함 아래 서랍에 남은 예비 자물쇠 세트를 찾아 달라고 했다.",
    questReward: { type: "add_item", itemId: "waterBottle", amount: 1 },
    eventTitle: "문패가 흔들리는 소리",
    eventSummary: "관리실 문패가 바람에 부딪혀 달그락거리는 사이, 안쪽에 남아 있던 관리인이 당신을 불러 세운다.",
    frontierLabel: "복도 끝 비상계단으로 나아가기",
    frontierOutcome: "관리실을 넘어 더 깊은 생활 구역으로 발을 들이며, 새 경계를 연다.",
    tomorrowSummary: "밤새 누군가 문을 더 억지로 열어 본 듯, 관리실 안쪽이 한층 거칠게 흐트러졌다.",
    tomorrowParagraphs: [
      "서류 더미와 공구 자국이 어제보다 더 어지럽다.",
      "\"늦기 전에 챙길 건 챙겨야 해.\" 관리인이 낮고 빠르게 말한다.",
    ],
  },
  {
    slug: "street_pharmacy",
    locationName: "약국 셔터 앞",
    summary: "반쯤 내려온 셔터와 깨진 진열창 너머로, 약통과 전단지가 바닥에 흩어져 있다.",
    introTitle: "닫힌 약국 앞",
    introParagraphs: [
      "약국 셔터는 끝까지 내려오지 못한 채 비스듬히 걸려 있다.",
      "\"안쪽 선반까지는 손을 넣을 수 있어.\" 셔터 곁을 지키던 자원봉사자가 속삭인다. \"대신 쓸 만한 상비품 하나는 내게도 돌려줘.\"",
    ],
    personName: "약국 앞 자원봉사자",
    personRole: "응급 물자 정리 담당",
    personSummary: "주변 사람들에게 약품과 붕대를 나눠 주며, 최소한의 질서를 붙들려는 자원봉사자다.",
    personRelation: "피곤해 보이지만, 약속을 어기지 않는 사람에겐 금세 말투가 부드러워진다.",
    personPersonality: ["차분함", "실용적", "인내심"],
    itemName: "응급 붕대 꾸러미",
    itemDescription: "약국 안쪽 선반에서 겨우 꺼낸 붕대 꾸러미다. 치료보단 거래와 지원에 더 알맞다.",
    itemKind: "trade",
    itemTags: ["약국", "붕대", "지원"],
    stockName: "셔터 아래 낮은 선반",
    stockSummary: "바닥 가까운 선반이 간신히 손이 닿는 높이로 드러나 있다. 남겨진 상비품이 몇 가지 끼어 있다.",
    staticItemId: "painRelief",
    staticItemQty: 1,
    questTitle: "셔터 밑의 응급 꾸러미",
    questDescription: "자원봉사자가 셔터 아래 남은 응급 붕대 꾸러미를 찾아 달라고 부탁했다.",
    questReward: { type: "money", amount: 700 },
    eventTitle: "셔터 아래로 새는 빛",
    eventSummary: "거의 닫힌 약국 셔터 아래로 빛 한 줄기가 새고, 그 틈을 지키던 자원봉사자가 당신에게 조용히 말을 건다.",
    frontierLabel: "골목 안쪽 진료실로 나아가기",
    frontierOutcome: "약국 뒤편의 더 깊은 공간으로 나아가며 새로운 구역을 연다.",
    tomorrowSummary: "약국 셔터 아래로 흘러나오던 빛이 줄고, 안쪽은 더 손탄 흔적으로 가라앉아 있다.",
    tomorrowParagraphs: [
      "셔터 가장자리에 묻은 먼지와 손자국이 어제보다 또렷하다.",
      "\"늦게 오면 남는 게 없어.\" 자원봉사자가 한숨 섞인 목소리로 중얼거린다.",
    ],
  },
];

export const DEFAULT_GENERATION_GUARDRAILS = GenerationGuardrailsSchema.parse({
  requiredIdPrefix: "dyn_",
  maxStatDeltaPerEffect: 2,
  maxItemAmountPerEffect: 3,
  maxMoneyDeltaPerEffect: 2500,
  maxStockQuantity: 4,
  forbiddenEffectTypes: ["set_scene", "advance_to_daybreak"],
  allowedQuestObjectiveTypes: ["obtain_item", "return_to_npc", "reach_location", "flag", "daily_flag"],
  allowedQuestRewardTypes: ["money", "add_item", "set_flag"],
});

function stripCodeFence(raw: string) {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapGeneratedPackageCandidate(candidate: unknown): Record<string, unknown> {
  if (Array.isArray(candidate)) {
    const firstObject = candidate.find((entry) => isRecord(entry));
    return firstObject ? unwrapGeneratedPackageCandidate(firstObject) : {};
  }

  if (!isRecord(candidate)) {
    return {};
  }

  if (!("registry" in candidate) && "payload" in candidate) {
    return unwrapGeneratedPackageCandidate(candidate.payload);
  }

  if (!("registry" in candidate) && "fallback" in candidate) {
    return unwrapGeneratedPackageCandidate(candidate.fallback);
  }

  return structuredClone(candidate);
}

function mergeGeneratedPackageValue<T>(fallbackValue: T, candidateValue: unknown): T {
  if (candidateValue === undefined) {
    return structuredClone(fallbackValue);
  }

  if (Array.isArray(fallbackValue) && Array.isArray(candidateValue)) {
    const fallbackHasIds = fallbackValue.every((entry) => isRecord(entry) && typeof entry.id === "string");
    if (fallbackHasIds) {
      return fallbackValue.map((fallbackEntry, index) => {
        const matchedCandidate = candidateValue.find((entry) => isRecord(entry) && entry.id === (fallbackEntry as { id: string }).id)
          ?? candidateValue[index];
        return mergeGeneratedPackageValue(fallbackEntry, matchedCandidate);
      }) as T;
    }
    return (candidateValue.length > 0 ? structuredClone(candidateValue) : structuredClone(fallbackValue)) as T;
  }

  if (isRecord(fallbackValue) && isRecord(candidateValue)) {
    const merged = structuredClone(fallbackValue);
    Object.entries(candidateValue).forEach(([key, value]) => {
      const fallbackEntry = (fallbackValue as Record<string, unknown>)[key];
      (merged as Record<string, unknown>)[key] = key in fallbackValue
        ? mergeGeneratedPackageValue(fallbackEntry, value)
        : structuredClone(value);
    });
    return merged as T;
  }

  return structuredClone(candidateValue) as T;
}

function mergeGeneratedPackageOntoFallback(fallback: GeneratedRegionPackage, candidate: unknown) {
  const unwrappedCandidate = unwrapGeneratedPackageCandidate(candidate);
  return mergeGeneratedPackageValue(fallback, unwrappedCandidate);
}

function mergeGeneratedStoryBeatOntoFallback(fallback: GeneratedStoryBeat, candidate: unknown) {
  const unwrappedCandidate = unwrapGeneratedPackageCandidate(candidate);
  return mergeGeneratedPackageValue(fallback, unwrappedCandidate);
}

function validateGeneratedStoryBeat(
  request: StoryBeatPlannerInput,
  rawBeat: GeneratedStoryBeat,
) {
  const parsed = GeneratedStoryBeatSchema.parse(rawBeat);

  ensureDynId(parsed.id, `story beat '${parsed.id}'`);
  ensureDynId(parsed.patch.sceneId, `story beat scene '${parsed.patch.sceneId}'`);
  if (parsed.locationId !== request.locationId) {
    throw new Error(`Story beat location '${parsed.locationId}' must match '${request.locationId}'.`);
  }
  if (parsed.anchorLocationId !== request.anchorLocationId) {
    throw new Error(`Story beat anchor '${parsed.anchorLocationId}' must match '${request.anchorLocationId}'.`);
  }
  if (parsed.sourceSceneId !== request.sourceSceneId) {
    throw new Error(`Story beat source scene '${parsed.sourceSceneId}' must match '${request.sourceSceneId}'.`);
  }
  if (parsed.sourceTriggerId !== request.trigger.id) {
    throw new Error(`Story beat trigger '${parsed.sourceTriggerId}' must match '${request.trigger.id}'.`);
  }

  Object.keys(parsed.patch.registry.items).forEach((itemId) => {
    if (!request.registry.items[itemId]) {
      throw new Error(`Story beat cannot introduce new item '${itemId}'.`);
    }
  });
  Object.keys(parsed.patch.registry.locations).forEach((locationId) => {
    if (locationId !== request.locationId) {
      throw new Error(`Story beat cannot create or patch location '${locationId}'.`);
    }
  });
  Object.keys(parsed.patch.registry.people).forEach((personId) => ensureDynId(personId, `story beat person '${personId}'`));
  Object.keys(parsed.patch.registry.quests).forEach((questId) => ensureDynId(questId, `story beat quest '${questId}'`));
  Object.keys(parsed.patch.registry.actions).forEach((actionId) => ensureDynId(actionId, `story beat action '${actionId}'`));
  Object.keys(parsed.patch.registry.choices).forEach((choiceId) => ensureDynId(choiceId, `story beat choice '${choiceId}'`));
  Object.keys(parsed.patch.registry.events).forEach((eventId) => ensureDynId(eventId, `story beat event '${eventId}'`));
  Object.keys(parsed.patch.registry.scenes).forEach((sceneId) => ensureDynId(sceneId, `story beat scene '${sceneId}'`));

  validateGeneratedEffects(parsed.patch.immediateEffects, `story beat '${parsed.id}' immediate`);
  if (parsed.patch.immediateEffects.some((effect) => effect.type === "travel")) {
    throw new Error(`Story beat '${parsed.id}' cannot travel to another location directly.`);
  }

  Object.values(parsed.patch.registry.actions).forEach(validateGeneratedAction);
  Object.values(parsed.patch.registry.choices).forEach(validateGeneratedChoice);

  const mergedDynamic = mergeDynamicWorldRegistry(request.state.dynamicContent, parsed.patch.registry);
  const mergedRegistry = buildRuntimeRegistry({ dynamicContent: mergedDynamic });
  validateRegistry(mergedRegistry);

  const scene = mergedRegistry.scenes[parsed.patch.sceneId];
  if (!scene) {
    throw new Error(`Story beat scene '${parsed.patch.sceneId}' was not defined.`);
  }
  if (scene.locationId !== request.locationId) {
    throw new Error(`Story beat scene '${parsed.patch.sceneId}' must stay inside '${request.locationId}'.`);
  }

  return parsed;
}

function ensureDynId(id: string, source: string) {
  if (!id.startsWith(DEFAULT_GENERATION_GUARDRAILS.requiredIdPrefix)) {
    throw new Error(`${source} must start with '${DEFAULT_GENERATION_GUARDRAILS.requiredIdPrefix}'.`);
  }
}

function validateGeneratedEffects(effects: Effect[], source: string) {
  for (const effect of effects) {
    if (DEFAULT_GENERATION_GUARDRAILS.forbiddenEffectTypes.includes(effect.type)) {
      throw new Error(`${source} uses forbidden effect '${effect.type}'.`);
    }
    if (effect.type === "set_flag" || effect.type === "clear_flag") {
      ensureDynId(effect.flag, `${source} flag`);
    }
    if (effect.type === "change_stat" && Math.abs(effect.value) > DEFAULT_GENERATION_GUARDRAILS.maxStatDeltaPerEffect) {
      throw new Error(`${source} exceeds stat delta guardrail.`);
    }
    if ((effect.type === "add_item" || effect.type === "remove_item") && effect.amount > DEFAULT_GENERATION_GUARDRAILS.maxItemAmountPerEffect) {
      throw new Error(`${source} exceeds item amount guardrail.`);
    }
    if (effect.type === "change_money" && Math.abs(effect.amount) > DEFAULT_GENERATION_GUARDRAILS.maxMoneyDeltaPerEffect) {
      throw new Error(`${source} exceeds money delta guardrail.`);
    }
  }
}

function validateGeneratedAction(action: ActionDefinition) {
  ensureDynId(action.id, `action '${action.id}'`);
  validateGeneratedEffects(action.effects, `action '${action.id}'`);
  validateGeneratedEffects(action.failureEffects, `action '${action.id}' failure`);
}

function validateGeneratedChoice(choice: ChoiceDefinition) {
  ensureDynId(choice.id, `choice '${choice.id}'`);
  validateGeneratedEffects(choice.effects, `choice '${choice.id}'`);
  validateGeneratedEffects(choice.failureEffects, `choice '${choice.id}' failure`);
}

function validateGeneratedPackage(
  state: GameState,
  registry: ContentRegistry,
  rawPackage: GeneratedRegionPackage,
) {
  const canonicalized = canonicalizeGeneratedPackage(rawPackage);
  const parsed = GeneratedRegionPackageSchema.parse(canonicalized);
  const normalizedRegistry = normalizeDynamicLocationNames(
    parsed.registry,
    Object.values(registry.locations).map((location) => location.name),
  );
  const normalized = {
    ...parsed,
    registry: normalizedRegistry,
    title: normalizedRegistry.locations[parsed.locationId]?.name ?? parsed.title,
  };

  ensureDynId(normalized.locationId, `location '${normalized.locationId}'`);
  ensureDynId(normalized.frontierActionId, `frontier action '${normalized.frontierActionId}'`);
  if (normalized.entryEventId) {
    ensureDynId(normalized.entryEventId, `entry event '${normalized.entryEventId}'`);
  }

  Object.keys(normalized.registry.locations).forEach((id) => ensureDynId(id, `location '${id}'`));
  Object.keys(normalized.registry.items).forEach((id) => ensureDynId(id, `item '${id}'`));
  Object.keys(normalized.registry.people).forEach((id) => ensureDynId(id, `person '${id}'`));
  Object.keys(normalized.registry.quests).forEach((id) => ensureDynId(id, `quest '${id}'`));
  Object.keys(normalized.registry.skills).forEach((id) => ensureDynId(id, `skill '${id}'`));
  Object.keys(normalized.registry.actions).forEach((id) => ensureDynId(id, `action '${id}'`));
  Object.keys(normalized.registry.choices).forEach((id) => ensureDynId(id, `choice '${id}'`));
  Object.keys(normalized.registry.events).forEach((id) => ensureDynId(id, `event '${id}'`));
  Object.keys(normalized.registry.scenes).forEach((id) => ensureDynId(id, `scene '${id}'`));

  Object.values(normalized.registry.actions).forEach(validateGeneratedAction);
  Object.values(normalized.registry.choices).forEach(validateGeneratedChoice);

  Object.values(normalized.registry.locations).forEach((location) => {
    location.stockNodes.forEach((node) => {
      if (node.money > DEFAULT_GENERATION_GUARDRAILS.maxMoneyDeltaPerEffect) {
        throw new Error(`stock node '${node.id}' exceeds money guardrail.`);
      }
      node.items.forEach((item) => {
        if (item.initialQuantity > DEFAULT_GENERATION_GUARDRAILS.maxStockQuantity) {
          throw new Error(`stock node '${node.id}' exceeds stock guardrail.`);
        }
      });
    });
  });

  Object.values(normalized.registry.quests).forEach((quest) => {
    ensureDynId(quest.id, `quest '${quest.id}'`);
    quest.objectives.forEach((objective) => {
      if (!DEFAULT_GENERATION_GUARDRAILS.allowedQuestObjectiveTypes.includes(objective.type)) {
        throw new Error(`quest '${quest.id}' uses unsupported objective '${objective.type}'.`);
      }
    });
    quest.rewards.forEach((reward) => {
      if (!DEFAULT_GENERATION_GUARDRAILS.allowedQuestRewardTypes.includes(reward.type)) {
        throw new Error(`quest '${quest.id}' uses unsupported reward '${reward.type}'.`);
      }
    });
  });

  if (normalized.tomorrowEvolution) {
    ensureDynId(normalized.tomorrowEvolution.id, `evolution '${normalized.tomorrowEvolution.id}'`);
  }

  const mergedDynamic = mergeDynamicWorldRegistry(state.dynamicContent, normalized.registry);
  const mergedRegistry = buildRuntimeRegistry({ dynamicContent: mergedDynamic });
  validateRegistry(mergedRegistry);

  if (!registry.locations[normalized.sourceLocationId]) {
    throw new Error(`Unknown source location '${normalized.sourceLocationId}'.`);
  }

  return normalized;
}

function canonicalizeGeneratedPackage(rawPackage: GeneratedRegionPackage) {
  const draft = structuredClone(rawPackage) as GeneratedRegionPackage & {
    registry: DynamicWorldRegistry & {
      stockNodes?: Record<string, unknown>;
    };
  };
  const dynamicRegistry = draft.registry as DynamicWorldRegistry & {
    actions?: Record<string, ActionDefinition>;
    stockNodes?: Record<string, unknown>;
  };
  const topLevelStockNodes = dynamicRegistry.stockNodes && typeof dynamicRegistry.stockNodes === "object"
    ? dynamicRegistry.stockNodes
    : {};

  Object.values(draft.registry.locations ?? {}).forEach((location) => {
    location.interactionChoices = (location.interactionChoices ?? []).map((entry) => {
      if (typeof entry !== "string") {
        return entry;
      }
      return dynamicRegistry.actions?.[entry] ?? entry;
    }) as typeof location.interactionChoices;

    location.stockNodes = (location.stockNodes ?? []).map((entry) => {
      if (typeof entry !== "string") {
        return entry;
      }
      const mapped = topLevelStockNodes[entry];
      return mapped && typeof mapped === "object" ? structuredClone(mapped) : entry;
    }) as typeof location.stockNodes;
  });

  delete dynamicRegistry.stockNodes;
  return draft;
}

function buildQuestRewardSummary(theme: FrontierTheme) {
  if (theme.questReward.type === "money") {
    return `${theme.questReward.amount}원을 받는다.`;
  }
  return `${theme.questReward.itemId} ${theme.questReward.amount}개를 받는다.`;
}

function buildPlannedSummary(input: PlannerInput, locationId: string, title: string, summary: string): PlannedRegionSummary {
  return {
    locationId,
    sourceLocationId: input.sourceLocationId,
    sourceFrontierActionId: input.sourceFrontierActionId,
    title,
    summary,
    createdDay: input.state.day,
  };
}

function beatSlugFor(locationId: string) {
  return locationId.replace(/^dyn_location_\d+_/, "") || locationId.replace(/[^a-z0-9_]+/gi, "_");
}

function buildNarrativeChoice(
  choice: Pick<ChoiceDefinition, "id" | "label" | "outcomeHint"> & Partial<Omit<ChoiceDefinition, "id" | "label" | "outcomeHint">>,
) {
  return defineChoice({
    tags: [],
    ...choice,
  });
}

function buildFallbackStoryBeat(request: StoryBeatPlannerInput): GeneratedStoryBeat {
  const slug = beatSlugFor(request.anchorLocationId);
  const beatId = `dyn_beat_${request.sequence}_${slug}`;
  const sceneId = `dyn_scene_${request.sequence}_${slug}_beat`;
  const continueChoiceId = `dyn_choice_${request.sequence}_${slug}_continue`;
  const returnChoiceId = `dyn_choice_${request.sequence}_${slug}_return`;
  const stashChoiceId = `dyn_choice_${request.sequence}_${slug}_stash`;
  const stashTakenFlag = `${beatId}_stash_taken`;
  const currentLocation = request.registry.locations[request.locationId];
  const likelyItemId = currentLocation.obtainableItemIds.find((itemId) => !itemId.startsWith("emergencySnack"))
    ?? currentLocation.obtainableItemIds[0]
    ?? "waterBottle";
  const likelyItemName = (request.registry.items[likelyItemId] as { name?: string } | undefined)?.name ?? likelyItemId;
  const isTalkBeat = request.trigger.tags.includes("talk");
  const isSearchBeat = request.trigger.tags.includes("search");
  const sceneTitle = isTalkBeat
    ? `${request.anchorLocationName}의 숨은 사정`
    : isSearchBeat
      ? `${request.anchorLocationName} 안쪽 흔적`
      : `${request.anchorLocationName}의 다음 기척`;
  const sceneParagraphs = isTalkBeat
    ? [
        `${request.anchorLocationName} 안쪽 공기는 여전히 가라앉아 있지만, 상대는 방금 전보다 조금 더 긴 문장으로 상황을 풀어 놓는다.`,
        `짧은 대화 사이로 이 장소가 단순한 통로가 아니라, 저마다 사정을 숨긴 사람들이 버티고 있는 생활 공간이라는 사실이 선명해진다.`,
      ]
    : isSearchBeat
      ? [
          `${request.anchorLocationName}의 손이 닿지 않던 구석에는 급히 뒤집힌 흔적과 함께 아직 살펴볼 만한 여지가 남아 있다.`,
          `허둥지둥 휩쓸고 지나간 자국 사이로, 무엇을 먼저 건드릴지에 따라 다음 상황이 달라질 것 같은 기척이 선다.`,
        ]
      : [
          `${request.anchorLocationName}의 다음 구획으로 시선을 옮기자, 방금 전에는 보이지 않던 단서와 움직임이 천천히 윤곽을 드러낸다.`,
          `지금 어떤 쪽으로 발을 옮기느냐에 따라 이 지역의 다음 이야기가 갈라질 듯하다.`,
        ];

  const continueChoice = buildNarrativeChoice({
    id: continueChoiceId,
    label: isTalkBeat ? "조금 더 깊게 이야기를 이어간다" : "조금 더 안쪽을 살펴본다",
    outcomeHint: `${request.anchorLocationName} 안의 다음 상황을 이어서 만든다.`,
    tags: [CONTINUATION_TAG],
  });
  const returnChoice = buildNarrativeChoice({
    id: returnChoiceId,
    label: "직전 상황으로 돌아간다",
    outcomeHint: "바로 전 장면으로 물러나 다시 판단한다.",
    nextSceneId: request.sourceSceneId,
  });
  const stashChoice = buildNarrativeChoice({
    id: stashChoiceId,
    label: `${likelyItemName}을 챙긴다`,
    outcomeHint: `눈에 들어온 ${likelyItemName}을 챙겨 다음 선택의 여지를 넓힌다.`,
    conditions: [{ type: "flag_not", flag: stashTakenFlag }],
    effects: [
      { type: "set_flag", flag: stashTakenFlag },
      { type: "add_item", itemId: likelyItemId, amount: 1 },
      { type: "log", message: `${request.anchorLocationName} 안쪽에서 ${likelyItemName}을 챙겼다.` },
    ],
  });

  return GeneratedStoryBeatSchema.parse({
    id: beatId,
    locationId: request.locationId,
    anchorLocationId: request.anchorLocationId,
    sourceSceneId: request.sourceSceneId,
    sourceTriggerId: request.trigger.id,
    summary: `${request.anchorLocationName} 안에서 ${request.trigger.label} 이후의 다음 상황이 열린다.`,
    patch: {
      sceneId,
      immediateEffects: [],
      registry: {
        locations: {},
        items: {},
        people: {},
        quests: {},
        skills: {},
        actions: {},
        choices: {
          [continueChoiceId]: continueChoice,
          [returnChoiceId]: returnChoice,
          [stashChoiceId]: stashChoice,
        },
        events: {},
        scenes: {
          [sceneId]: {
            id: sceneId,
            locationId: request.locationId,
            title: sceneTitle,
            paragraphs: sceneParagraphs,
            choiceIds: [stashChoiceId, continueChoiceId, returnChoiceId],
            conditions: [],
            suppressLocationInteractions: true,
          },
        },
      },
    },
  });
}

function defineAction(
  action: Pick<ActionDefinition, "id" | "label" | "type" | "outcomeHint" | "locationIds"> &
    Partial<Omit<ActionDefinition, "id" | "label" | "type" | "outcomeHint" | "locationIds">>,
): ActionDefinition {
  return {
    visibility: "scene",
    presentationMode: "when_conditions_met",
    conditions: [],
    effects: [],
    failureEffects: [],
    tags: [],
    ...action,
  };
}

function defineChoice(
  choice: Pick<ChoiceDefinition, "id" | "label" | "outcomeHint"> &
    Partial<Omit<ChoiceDefinition, "id" | "label" | "outcomeHint">>,
): ChoiceDefinition {
  return {
    presentationMode: "when_conditions_met",
    conditions: [],
    effects: [],
    failureEffects: [],
    hidden: false,
    ...choice,
  };
}

function buildTomorrowPlanFromDynamicWorld(state: GameState): WorldPlan["tomorrow"] {
  const evolutions = Object.values(state.dynamicContent.locations)
    .filter((location) => location.id.startsWith("dyn_"))
    .map((location) => {
      const introScene = Object.values(state.dynamicContent.scenes).find(
        (scene) => scene.locationId === location.id && !scene.conditions.some((condition) => condition.type === "active_stock_node"),
      );
      return DayEvolutionPlanSchema.parse({
        id: `${location.id}_day${state.day + 1}_evolution`,
        packageLocationId: location.id,
        day: state.day + 1,
        summary: `${location.name}의 분위기가 하루 사이에 조금 더 거칠어질 예정이다.`,
        updates: [
          {
            type: "location_text",
            locationId: location.id,
            summary: `${location.summary} 밤사이 누군가 더 훑고 지나간 흔적이 남아 있다.`,
          },
          ...(introScene
            ? [{
                type: "scene_text" as const,
                sceneId: introScene.id,
                paragraphs: [...introScene.paragraphs, "하루가 지나자, 남은 사람들의 표정은 한층 더 날카로워졌다."],
              }]
            : []),
          {
            type: "set_flag" as const,
            flag: `${location.id}_day${state.day + 1}_settled`,
          },
        ],
      });
    });

  if (evolutions.length === 0) {
    return {
      day: state.day + 1,
      evolutions: [],
      notes: ["아직 진화시킬 동적 지역이 없다."],
    };
  }

  return {
    day: state.day + 1,
    evolutions,
    notes: evolutions.map((evolution) => evolution.summary),
  };
}

function markPackageSource(pkg: GeneratedRegionPackage, source: "llm" | "template") {
  const next = structuredClone(pkg);
  const location = next.registry.locations[next.locationId];
  if (!location) {
    return next;
  }

  const marker = source === "llm" ? "planner:llm" : "planner:template";
  location.traits = location.traits.filter((trait) => trait !== "planner:llm" && trait !== "planner:template");
  location.traits.push(marker);
  return next;
}

function plannerGuidancePayload(input: PlannerInput) {
  return {
    existingItemIds: Object.keys(input.registry.items),
    existingPersonIds: Object.keys(input.registry.people),
    existingLocationIds: Object.keys(input.registry.locations),
    existingQuestIds: Object.keys(input.registry.quests),
    allowedConditionTypes: ALLOWED_CONDITION_TYPES,
    allowedEffectTypes: ALLOWED_EFFECT_TYPES,
    guardrails: DEFAULT_GENERATION_GUARDRAILS,
    hardRules: [
      "Every referenced id must either already exist in the current registry or be declared inside registry of this package.",
      "Do not reference undeclared itemId, npcId, locationId, questId, sceneId, eventId, actionId, or choiceId.",
      "All new ids must start with dyn_.",
      "Generated content cannot use set_scene or advance_to_daybreak.",
      "If you create a new item and reference it in a quest reward or objective, declare that item in registry.items first.",
      "Prefer reusing existing static items like waterBottle, cannedFood, painRelief, rationTicket, rawRice, vegetables, woodPlank, scrapMetal, clothScrap when possible.",
      "Write all player-facing strings in Korean.",
      "location.interactionChoices must contain full action objects, and location.stockNodes must contain full stock node objects.",
    ],
  };
}

function storyBeatGuidancePayload(request: StoryBeatPlannerInput) {
  const currentLocation = request.registry.locations[request.locationId];
  const localPeople = Object.values(request.registry.people)
    .filter((person): person is { id: string; name: string; role: string; summary: string; locationId: string } =>
      Boolean(person) &&
      person !== null &&
      typeof person === "object" &&
      "locationId" in person &&
      person.locationId === request.locationId,
    )
    .map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      summary: person.summary,
    }));

  return {
    existingItemIds: Object.keys(request.registry.items),
    allowedConditionTypes: ALLOWED_CONDITION_TYPES,
    allowedEffectTypes: ALLOWED_EFFECT_TYPES,
    guardrails: DEFAULT_GENERATION_GUARDRAILS,
    currentLocation: currentLocation
      ? {
          id: currentLocation.id,
          name: currentLocation.name,
          summary: currentLocation.summary,
          stockNodes: currentLocation.stockNodes.map((node) => ({
            id: node.id,
            name: node.name,
          })),
        }
      : null,
    localPeople,
    hardRules: [
      "Keep the anchor location exactly as given. Do not rename or replace it.",
      "This continuation must stay inside the same location. Do not create or travel to a new map location.",
      "Do not create new items. Reuse only item ids that already exist in existingItemIds.",
      "Return 2 to 4 natural Korean choices for the current scene.",
      `Choices or actions that should continue the story again must include the '${CONTINUATION_TAG}' tag.`,
      "If this is a detail scene inside the current location, set scene.suppressLocationInteractions to true.",
      "At least one choice should stabilize or return the player from the current micro-situation.",
    ],
  };
}

class TemplateWorldPlanner implements WorldPlanner {
  async generateRegionPackage(input: PlannerInput) {
    const theme = FRONTIER_THEMES[(input.sequence - 1) % FRONTIER_THEMES.length];
    const sourceLocation = getRuntimeLocationDefinition(input.state, input.registry, input.sourceLocationId);
    const locationName = createUniqueDynamicLocationName(
      theme.locationName,
      Object.values(input.registry.locations).map((location) => location.name),
      input.sequence,
    );
    const locationId = `dyn_location_${input.sequence}_${theme.slug}`;
    const personId = `dyn_person_${input.sequence}_${theme.slug}`;
    const questId = `dyn_quest_${input.sequence}_${theme.slug}`;
    const itemId = `dyn_item_${input.sequence}_${theme.slug}`;
    const introSceneId = `dyn_scene_${input.sequence}_${theme.slug}_intro`;
    const entryEventId = `dyn_event_${input.sequence}_${theme.slug}_arrival`;
    const entryChoiceId = `dyn_choice_${input.sequence}_${theme.slug}_accept`;
    const focusActionId = `dyn_action_${input.sequence}_${theme.slug}_inspect`;
    const talkActionId = `dyn_action_${input.sequence}_${theme.slug}_talk`;
    const frontierActionId = `dyn_action_${input.sequence}_${theme.slug}_frontier`;
    const nodeId = `dyn_stock_${input.sequence}_${theme.slug}`;
    const fullSceneId = `dyn_scene_${input.sequence}_${theme.slug}_stock_full`;
    const emptySceneId = `dyn_scene_${input.sequence}_${theme.slug}_stock_empty`;
    const collectChoiceId = `dyn_choice_${input.sequence}_${theme.slug}_collect`;
    const leaveChoiceId = `dyn_choice_${input.sequence}_${theme.slug}_leave`;
    const questAcceptedFlag = `${questId}_accepted`;
    const questDeliveredFlag = `${questId}_delivered`;
    const deliverActionId = `dyn_action_${input.sequence}_${theme.slug}_deliver`;

    const inspectAction = defineAction({
      id: focusActionId,
      label: `${theme.stockName} 살펴보기`,
      type: "search",
      locationIds: [locationId],
      outcomeHint: "남아 있는 물자를 직접 뒤져 본다.",
      effects: [
        { type: "focus_stock_node", nodeId },
        { type: "log", message: `${theme.stockName} 쪽으로 몸을 낮춰 안을 훑어본다.` },
      ],
      tags: ["dynamic", "search", CONTINUATION_TAG],
    });
    const talkAction = defineAction({
      id: talkActionId,
      label: `${theme.personName}에게 말 걸기`,
      type: "talk",
      locationIds: [locationId],
      outcomeHint: "이곳에 남은 사람의 반응과 사정을 더 듣는다.",
      effects: [{ type: "log", message: `"${theme.personName}"은(는) 짧게 고개를 끄덕이며 당신을 경계 어린 눈빛으로 살핀다.` }],
      tags: ["dynamic", "talk", CONTINUATION_TAG],
    });
    const frontierAction = defineAction({
      id: frontierActionId,
      label: theme.frontierLabel,
      type: "explore",
      locationIds: [locationId],
      outcomeHint: theme.frontierOutcome,
      effects: [{ type: "log", message: `${locationName} 너머의 더 깊은 구역을 향해 발걸음을 옮긴다.` }],
      tags: ["dynamic", "frontier"],
    });
    const deliverAction = defineAction({
      id: deliverActionId,
      label: "찾은 물건을 건네기",
      type: "talk",
      locationIds: [locationId],
      presentationMode: "always",
      outcomeHint: `${theme.itemName}를 건네고 보상을 받는다.`,
      conditions: [
        { type: "has_item", itemId, amount: 1 },
        { type: "flag", flag: questAcceptedFlag },
        { type: "flag_not", flag: questDeliveredFlag },
      ],
      failureNote: "아직 건넬 물건을 찾지 못했다.",
      failureEffects: [{ type: "log", message: `${theme.personName}에게 넘길 물건이 아직 손에 없다.` }],
      effects: [
        { type: "remove_item", itemId, amount: 1 },
        ...(theme.questReward.type === "money"
          ? [{ type: "change_money", amount: theme.questReward.amount } satisfies Effect]
          : [{ type: "add_item", itemId: theme.questReward.itemId, amount: theme.questReward.amount } satisfies Effect]),
        { type: "set_flag", flag: questDeliveredFlag },
        { type: "complete_quest", questId },
        { type: "log", message: `${theme.personName}에게 ${theme.itemName}를 건네고 ${buildQuestRewardSummary(theme)}` },
      ],
      tags: ["dynamic", "quest"],
    });

    const acceptQuestChoice = defineChoice({
      id: entryChoiceId,
      label: `퀘스트 수락하기: ${theme.questTitle}`,
      outcomeHint: `${theme.personName}의 부탁을 받아들이고 이곳을 뒤지기 시작한다.`,
      effects: [
        { type: "start_quest", questId },
        { type: "set_flag", flag: questAcceptedFlag },
        { type: "log", message: `${theme.personName}의 부탁을 받아들였다. 이제 ${theme.stockName} 안쪽을 뒤져 ${theme.itemName}를 찾아야 한다.` },
      ],
      nextSceneId: introSceneId,
    });
    const collectChoice = defineChoice({
      id: collectChoiceId,
      label: "남은 물건을 전부 챙기기",
      outcomeHint: `${theme.itemName}와 남은 보조 물자를 한 번에 챙긴다.`,
      effects: [
        { type: "collect_stock_item_all", locationId, nodeId, itemId },
        { type: "collect_stock_item_all", locationId, nodeId, itemId: theme.staticItemId },
        { type: "log", message: `${theme.stockName} 안에 남은 물건을 쓸어 담아 챙겼다.` },
      ],
      nextSceneId: emptySceneId,
    });
    const leaveChoice = defineChoice({
      id: leaveChoiceId,
      label: `${locationName} 쪽으로 물러나기`,
      outcomeHint: "세부 위치에서 빠져나와 상위 공간으로 돌아간다.",
      effects: [{ type: "clear_stock_node_focus" }],
      nextSceneId: introSceneId,
    });

    const registry: DynamicWorldRegistry = {
      items: {
        [itemId]: {
          id: itemId,
          name: theme.itemName,
          description: theme.itemDescription,
          kind: theme.itemKind,
          rarity: "uncommon",
          price: 900,
          tags: theme.itemTags,
          effects: { hp: 0, mind: 0, fullness: 0, starvationRelief: 0 },
        },
      },
      people: {
        [personId]: {
          id: personId,
          name: theme.personName,
          role: theme.personRole,
          personality: theme.personPersonality,
          relationToPlayer: theme.personRelation,
          inventoryItemIds: [],
          locationId,
          summary: theme.personSummary,
        },
      },
      quests: {
        [questId]: {
          id: questId,
          title: theme.questTitle,
          description: theme.questDescription,
          type: "discovery",
          objectives: [{ type: "obtain_item", itemId, amount: 1 }],
          rewards: [theme.questReward],
          prerequisites: [{ type: "flag", flag: questAcceptedFlag }],
          relatedNpcIds: [personId],
          relatedLocationIds: [locationId],
        },
      },
      skills: {},
      locations: {
        [locationId]: {
          id: locationId,
          name: locationName,
          risk: "low",
          imagePath: null,
          summary: theme.summary,
          tags: ["dynamic", "frontier", sourceLocation.id],
          traits: ["generated", "scavenge", "story"],
          obtainableItemIds: [itemId, theme.staticItemId],
          residentIds: [personId],
          neighbors: [sourceLocation.id],
          interactionChoices: [inspectAction, talkAction, frontierAction, deliverAction],
          eventIds: [entryEventId],
          links: {
            [sourceLocation.id]: {
              note: `${sourceLocation.name} 쪽으로 되돌아갈 수 있다.`,
            },
          },
          stockNodes: [
            {
              id: nodeId,
              name: theme.stockName,
              summary: theme.stockSummary,
              money: 0,
              items: [
                { itemId, initialQuantity: 1 },
                { itemId: theme.staticItemId, initialQuantity: theme.staticItemQty },
              ],
            },
          ],
        },
      },
      actions: {
        [focusActionId]: inspectAction,
        [talkActionId]: talkAction,
        [frontierActionId]: frontierAction,
        [deliverActionId]: deliverAction,
      },
      choices: {
        [entryChoiceId]: acceptQuestChoice,
        [collectChoiceId]: collectChoice,
        [leaveChoiceId]: leaveChoice,
      },
      events: {
        [entryEventId]: {
          id: entryEventId,
          locationId,
          title: theme.eventTitle,
          summary: theme.eventSummary,
          startSceneId: introSceneId,
          sceneIds: [introSceneId],
          triggerConditions: [{ type: "flag_not", flag: `event_seen_${entryEventId}` }],
          choiceIds: [entryChoiceId],
          once: true,
          priority: 10,
        },
      },
      scenes: {
        [introSceneId]: {
          id: introSceneId,
          eventId: entryEventId,
          locationId,
          title: theme.introTitle,
          paragraphs: theme.introParagraphs,
          choiceIds: [],
          conditions: [],
          introFlag: `${locationId}_intro_seen`,
        },
        [fullSceneId]: {
          id: fullSceneId,
          locationId,
          title: theme.stockName,
          paragraphs: [
            `${theme.stockName} 안에는 ${theme.itemName}와 함께 ${theme.staticItemId === "waterBottle" ? "물병" : theme.staticItemId === "cannedFood" ? "통조림" : "기본 물자"}가 남아 있다.`,
            "눈앞에 있는 물건은 많지 않지만, 지금은 한 묶음도 생존의 무게를 바꾼다.",
          ],
          choiceIds: [collectChoiceId, leaveChoiceId],
          conditions: [
            { type: "active_stock_node", nodeId },
            { type: "stock_item_gte", locationId, nodeId, itemId, amount: 1 },
          ],
        },
        [emptySceneId]: {
          id: emptySceneId,
          locationId,
          title: `빈 ${theme.stockName}`,
          paragraphs: [
            `${theme.stockName} 안쪽은 이미 비어 있다.`,
            "더 챙길 만한 것은 없고, 이제 상위 공간으로 돌아가는 편이 낫다.",
          ],
          choiceIds: [leaveChoiceId],
          conditions: [
            { type: "active_stock_node", nodeId },
            { type: "stock_item_lt", locationId, nodeId, itemId, amount: 1 },
          ],
        },
      },
    };

    const tomorrowEvolution: DayEvolutionPlan = DayEvolutionPlanSchema.parse({
      id: `dyn_evolution_${input.sequence}_${theme.slug}_day${input.state.day + 1}`,
      packageLocationId: locationId,
      day: input.state.day + 1,
      summary: theme.tomorrowSummary,
      updates: [
        {
          type: "location_text",
          locationId,
          summary: `${theme.summary} 밤사이 누군가 더 손대고 지나간 자국이 남아 있다.`,
          traits: ["generated", "scarred", "story"],
        },
        {
          type: "scene_text",
          sceneId: introSceneId,
          paragraphs: theme.tomorrowParagraphs,
        },
        {
          type: "set_flag",
          flag: `${locationId}_day${input.state.day + 1}_evolved`,
        },
      ],
    });

    return markPackageSource(validateGeneratedPackage(input.state, input.registry, {
      locationId,
      sourceLocationId: input.sourceLocationId,
      sourceFrontierActionId: input.sourceFrontierActionId,
      frontierActionId,
      title: locationName,
      summary: theme.summary,
      entryEventId,
      registry,
      tomorrowEvolution,
    }), "template");
  }

  async generateStoryBeat(request: StoryBeatPlannerInput) {
    return validateGeneratedStoryBeat(request, buildFallbackStoryBeat(request));
  }

  async planTomorrow(state: GameState, _registry: ContentRegistry, _gameId: string) {
    return buildTomorrowPlanFromDynamicWorld(state);
  }
}

class RemoteWorldPlanner implements WorldPlanner {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallback: TemplateWorldPlanner,
  ) {}

  private async generateJson<T>(schemaName: string, payload: Record<string, unknown>) {
    const response = await fetch(this.apiUrl.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You generate JSON only for a survival text RPG. Stay inside the provided schema and existing action/condition/effect vocabulary. Never invent new schema keys. All generated ids must start with dyn_.",
          },
          {
            role: "user",
            content: JSON.stringify({ schemaName, payload }),
          },
        ],
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(`World planner request failed: ${response.status}`);
    }

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("World planner returned no content.");
    }
    return JSON.parse(stripCodeFence(content)) as T;
  }

  async generateRegionPackage(input: PlannerInput) {
    const fallback = await this.fallback.generateRegionPackage(input);
    try {
      return markPackageSource(validateGeneratedPackage(
        input.state,
        input.registry,
        await this.generateJson<GeneratedRegionPackage>("generatedRegionPackage", {
          fallback,
          currentDay: input.state.day,
          currentPhase: PHASES[input.state.phaseIndex],
          sourceLocationId: input.sourceLocationId,
          sourceFrontierActionId: input.sourceFrontierActionId,
          recentLog: input.recentLog,
        }),
      ), "llm");
    } catch {
      return fallback;
    }
  }

  async generateStoryBeat(request: StoryBeatPlannerInput) {
    const fallback = await this.fallback.generateStoryBeat(request);
    const payload = NarrativeContinuationRequestSchema.parse({
      gameId: request.gameId,
      locationId: request.locationId,
      anchorLocationId: request.anchorLocationId,
      anchorLocationName: request.anchorLocationName,
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
      lineageSceneIds: request.lineageSceneIds,
      sequence: request.sequence,
    });

    try {
      return validateGeneratedStoryBeat(
        request,
        mergeGeneratedStoryBeatOntoFallback(
          fallback,
          await this.generateJson<GeneratedStoryBeat>("generatedStoryBeat", {
            fallback,
            request: payload,
          }),
        ),
      );
    } catch {
      return fallback;
    }
  }

  async planTomorrow(state: GameState, registry: ContentRegistry, gameId: string) {
    const fallback = await this.fallback.planTomorrow(state, registry, gameId);
    try {
      return WorldPlanSchema.shape.tomorrow.parse(
        await this.generateJson("worldTomorrowPlan", {
          fallback,
          currentDay: state.day,
          dynamicLocations: Object.keys(state.dynamicContent.locations),
          recentLog: state.log.slice(0, 6).map((entry) => entry.message),
        }),
      );
    } catch {
      return fallback;
    }
  }
}

class GeminiWorldPlanner implements WorldPlanner {
  constructor(private readonly fallback: TemplateWorldPlanner) {}

  private async generateJson<T>(
    gameId: string,
    target: string,
    schemaName: string,
    payload: Record<string, unknown>,
  ) {
    return generateGeminiJson<T>(
      `You generate JSON only for a survival text RPG.
Stay inside the provided schema and existing action/condition/effect vocabulary.
Never invent new schema keys.
All generated ids must start with dyn_.
Every referenced id must either already exist in the current registry or be declared inside the package registry itself.
If you create a new item and use it in a quest objective, reward, stock node, or effect, define it in registry.items first.
Write all player-facing strings in Korean.
location.interactionChoices must contain full action objects, and location.stockNodes must contain full stock node objects.
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

  async generateRegionPackage(input: PlannerInput) {
    const fallback = await this.fallback.generateRegionPackage(input);
    try {
      const initialAttempt = await this.generateJson<unknown>(input.gameId, `region:${input.sequence}:initial`, "generatedRegionPackage", {
        fallback,
        currentDay: input.state.day,
        currentPhase: PHASES[input.state.phaseIndex],
        sourceLocationId: input.sourceLocationId,
        sourceFrontierActionId: input.sourceFrontierActionId,
        recentLog: input.recentLog,
        plannerGuidance: plannerGuidancePayload(input),
      });
      const mergedInitialAttempt = mergeGeneratedPackageOntoFallback(fallback, initialAttempt);

      try {
        return markPackageSource(validateGeneratedPackage(
          input.state,
          input.registry,
          mergedInitialAttempt,
        ), "llm");
      } catch (validationError) {
        appendDevLlmTraceForGame(input.gameId, {
          scope: "planner",
          target: `region:${input.sequence}:validation`,
          model: geminiModel(),
          status: "error",
          request: "",
          response: "",
          message: validationError instanceof Error ? validationError.message : "Initial generated package validation failed.",
        });
        const repairAttempt = await this.generateJson<unknown>(input.gameId, `region:${input.sequence}:repair`, "generatedRegionPackageRepair", {
          fallback,
          previousAttempt: initialAttempt,
          validationError: validationError instanceof Error ? validationError.message : "Unknown validation error",
          currentDay: input.state.day,
          currentPhase: PHASES[input.state.phaseIndex],
          sourceLocationId: input.sourceLocationId,
          sourceFrontierActionId: input.sourceFrontierActionId,
          recentLog: input.recentLog,
          plannerGuidance: plannerGuidancePayload(input),
        });
        const mergedRepairAttempt = mergeGeneratedPackageOntoFallback(fallback, repairAttempt);

        return markPackageSource(validateGeneratedPackage(
          input.state,
          input.registry,
          mergedRepairAttempt,
        ), "llm");
      }
    } catch (error) {
      appendDevLlmTraceForGame(input.gameId, {
        scope: "planner",
        target: `region:${input.sequence}:fallback`,
        model: geminiModel(),
        status: "fallback",
        request: "",
        response: "",
        message: error instanceof Error ? error.message : "Gemini planner failed, using template package.",
      });
      return fallback;
    }
  }

  async generateStoryBeat(request: StoryBeatPlannerInput) {
    const fallback = await this.fallback.generateStoryBeat(request);
    const payload = NarrativeContinuationRequestSchema.parse({
      gameId: request.gameId,
      locationId: request.locationId,
      anchorLocationId: request.anchorLocationId,
      anchorLocationName: request.anchorLocationName,
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
      lineageSceneIds: request.lineageSceneIds,
      sequence: request.sequence,
    });

    try {
      const initialAttempt = await this.generateJson<unknown>(
        request.gameId,
        `beat:${request.sequence}:initial`,
        "generatedStoryBeat",
        {
          fallback,
          request: payload,
          plannerGuidance: storyBeatGuidancePayload(request),
        },
      );
      const mergedInitialAttempt = mergeGeneratedStoryBeatOntoFallback(fallback, initialAttempt);

      try {
        return validateGeneratedStoryBeat(request, mergedInitialAttempt);
      } catch (validationError) {
        appendDevLlmTraceForGame(request.gameId, {
          scope: "planner",
          target: `beat:${request.sequence}:validation`,
          model: geminiModel(),
          status: "error",
          request: "",
          response: "",
          message: validationError instanceof Error ? validationError.message : "Initial generated story beat validation failed.",
        });
        const repairAttempt = await this.generateJson<unknown>(
          request.gameId,
          `beat:${request.sequence}:repair`,
          "generatedStoryBeatRepair",
          {
            fallback,
            previousAttempt: initialAttempt,
            validationError: validationError instanceof Error ? validationError.message : "Unknown validation error",
            request: payload,
            plannerGuidance: storyBeatGuidancePayload(request),
          },
        );
        return validateGeneratedStoryBeat(request, mergeGeneratedStoryBeatOntoFallback(fallback, repairAttempt));
      }
    } catch (error) {
      appendDevLlmTraceForGame(request.gameId, {
        scope: "planner",
        target: `beat:${request.sequence}:fallback`,
        model: geminiModel(),
        status: "fallback",
        request: "",
        response: "",
        message: error instanceof Error ? error.message : "Gemini story beat failed, using template beat.",
      });
      return fallback;
    }
  }

  async planTomorrow(state: GameState, registry: ContentRegistry, gameId: string) {
    const fallback = await this.fallback.planTomorrow(state, registry, gameId);
    try {
      return WorldPlanSchema.shape.tomorrow.parse(
        await this.generateJson(gameId, `worldTomorrowPlan:day${state.day + 1}`, "worldTomorrowPlan", {
          fallback,
          currentDay: state.day,
          dynamicLocations: Object.keys(state.dynamicContent.locations),
          recentLog: state.log.slice(0, 6).map((entry) => entry.message),
        }),
      );
    } catch (error) {
      appendDevLlmTraceForGame(gameId, {
        scope: "planner",
        target: `worldTomorrowPlan:day${state.day + 1}:fallback`,
        model: geminiModel(),
        status: "fallback",
        request: "",
        response: "",
        message: error instanceof Error ? error.message : "Gemini tomorrow planner failed, using template plan.",
      });
      return fallback;
    }
  }
}

export function createWorldPlanner() {
  const fallback = new TemplateWorldPlanner();
  if (hasGeminiConfig()) {
    return new GeminiWorldPlanner(fallback);
  }

  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4.1-mini";

  if (!apiUrl || !apiKey) {
    return fallback;
  }

  return new RemoteWorldPlanner(apiUrl, apiKey, model, fallback);
}

export function summarizeWorldPlan(state: GameState) {
  const tomorrow = buildTomorrowPlanFromDynamicWorld(state);
  return tomorrow?.notes ?? [];
}

export function buildPlannedRegionSummary(input: PlannerInput, pkg: GeneratedRegionPackage) {
  return buildPlannedSummary(input, pkg.locationId, pkg.title, pkg.summary);
}
