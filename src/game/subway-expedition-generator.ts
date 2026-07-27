import { createHash } from "node:crypto";
import { z } from "zod";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { generateGeminiJson, geminiModel, hasGeminiConfig } from "./gemini-client";
import {
  rollSubwayFloorLoot,
  SUBWAY_LOOT_TABLES,
  subwayLootItemDescription,
  subwayLootTableForDepth,
  type SubwayLootManifestSpot,
} from "./subway-loot";
import {
  SubwayFloorBundleSchema,
  SubwayMechanicsEnvelopeSchema,
  SubwayOutcomeMechanicsSchema,
  SubwayRunPlanSchema,
  SubwayStoryMemorySchema,
  type GameState,
  type SubwayExpeditionFloor,
  type SubwayFloorBundle,
  type SubwayMechanicsEnvelope,
  type SubwayOutcomeMechanics,
  type SubwayRunPlan,
  type SubwayStoryMemory,
} from "./schemas";

export const SUBWAY_EXPEDITION_PROMPT_VERSION = "subway-expedition-v2";
const MAX_REPAIR_ATTEMPTS = 2;
const TOTAL_GENERATION_ATTEMPTS = 1 + MAX_REPAIR_ATTEMPTS;

const StoryMemoryDraftSchema = z.object({
  facts: z.array(z.string().min(1).max(240)).max(8),
  unresolvedThreads: z.array(z.string().min(1).max(240)).max(6),
  resolvedThreads: z.array(z.string().min(1).max(240)).max(6),
  recentSummaries: z.array(z.string().min(1).max(280)).max(3),
  lastBridge: z.string().max(280),
}).strict();

const OutcomeVariantDraftSchema = z.object({
  title: z.string().min(1).max(80),
  paragraphs: z.array(z.string().min(1).max(600)).min(1).max(3),
  summary: z.string().min(1).max(240),
  mechanics: SubwayOutcomeMechanicsSchema,
  nextFloorBridge: z.string().min(1).max(280),
  facts: z.array(z.string().min(1).max(240)).max(6),
  unresolvedThreads: z.array(z.string().min(1).max(240)).max(5),
  resolvedThreads: z.array(z.string().min(1).max(240)).max(5),
}).strict();

const EventOptionDraftSchema = z.object({
  label: z.string().min(1).max(80),
  outcomeHint: z.string().min(1).max(180),
  approach: z.enum(["careful", "scavenge", "force", "observe"]),
  riskHint: z.enum(["low", "medium", "high"]),
  outcomes: z.object({
    clean: OutcomeVariantDraftSchema,
    costly: OutcomeVariantDraftSchema,
  }).strict(),
}).strict();

const LootSpotDraftSchema = z.object({
  slotId: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(260),
  searchHint: z.string().min(1).max(180),
  resultParagraphs: z.array(z.string().min(1).max(500)).min(1).max(3),
}).strict();

const FloorDraftSchema = z.object({
  title: z.string().min(1).max(60),
  paragraphs: z.array(z.string().min(1).max(600)).min(2).max(4),
  tensionSummary: z.string().min(1).max(160),
  storyBeat: z.string().min(1).max(280),
  memoryDelta: StoryMemoryDraftSchema,
  majorEvent: z.object({
    title: z.string().min(1).max(70),
    paragraphs: z.array(z.string().min(1).max(600)).min(1).max(3),
    resolutionGoal: z.string().min(1).max(180),
    options: z.array(EventOptionDraftSchema).min(2).max(3),
  }).strict(),
  lootSpots: z.array(LootSpotDraftSchema).length(3),
}).strict();

const RunPlanDraftSchema = z.object({
  premise: z.string().min(1).max(500),
  objective: z.string().min(1).max(300),
  tone: z.string().min(1).max(160),
  motifs: z.array(z.string().min(1).max(100)).min(2).max(5),
  coreMystery: z.string().min(1).max(300),
  escalationNotes: z.array(z.string().min(1).max(240)).min(3).max(6),
  facts: z.array(z.string().min(1).max(240)).max(8),
  unresolvedThreads: z.array(z.string().min(1).max(240)).min(1).max(6),
}).strict();

type FloorDraft = z.infer<typeof FloorDraftSchema>;
type RunPlanDraft = z.infer<typeof RunPlanDraftSchema>;

export type SubwayFloorGenerationInput = {
  gameId: string;
  state: GameState;
  depth: number;
  previousOutcome: string;
};

export type SubwayRunPlanGenerationInput = {
  gameId: string;
  state: GameState;
  runNumber?: number;
};

export type SubwayFloorBundleGenerationInput = {
  gameId: string;
  state: GameState;
  depth: number;
  previousOutcome: string;
  runPlan: SubwayRunPlan;
  runMemory: SubwayStoryMemory;
  lootManifest: SubwayLootManifestSpot[];
  mechanicsEnvelope: SubwayMechanicsEnvelope;
  mechanicsEnvelopeHash: string;
  contextHash: string;
};

export type SubwayFloorPreparationInput = SubwayFloorGenerationInput & {
  runPlan?: SubwayRunPlan | null;
  runMemory?: SubwayStoryMemory;
  lootManifest?: SubwayLootManifestSpot[];
  mechanicsEnvelope?: SubwayMechanicsEnvelope;
};

const zoneByDepth = (
  depth: number,
): SubwayExpeditionFloor["zone"] => {
  if (depth <= 3) return "platform";
  if (depth <= 5) return "train";
  if (depth <= 10) return "track";
  if (depth <= 15) return "maintenance";
  return "deep_tunnel";
};

const zoneBrief: Record<SubwayExpeditionFloor["zone"], string> = {
  concourse: "지상의 역 입구와 연결된 대합실·개찰구·안내소.",
  platform: "운행이 끊긴 승강장·계단·스크린도어와 승강장 부속 공간.",
  train: "승강장에 멈춰 선 버려진 객차·기관실·객차 연결부.",
  track: "선로·침목·환기구·인접 역 방향 터널과 선로변 대피 공간.",
  maintenance: "정비실·케이블 통로·기계실·폐쇄된 작업 구역.",
  deep_tunnel: "공식 노선 밖 공사용 터널·깊은 환승 통로·지하 설비 구역.",
};

const templateCopyByZone: Record<
  SubwayExpeditionFloor["zone"],
  {
    title: string;
    paragraphs: [string, string];
    tension: string;
    eventTitle: string;
    eventParagraph: string;
    eventGoal: string;
  }
> = {
  concourse: {
    title: "불 꺼진 대합실",
    paragraphs: [
      "깨진 개찰구 너머로 먼지와 젖은 종이 냄새가 엉겨 있다.",
      "닫힌 안내소와 매점 사이로 지하로 내려가는 계단이 이어진다.",
    ],
    tension: "지상과 가깝지만 시야를 가리는 잔해가 많다.",
    eventTitle: "막혀 버린 개찰구",
    eventParagraph: "넘어진 철제 셔터와 개찰구가 통로를 막고 있다. 소리를 크게 내지 않고 길을 확보해야 한다.",
    eventGoal: "개찰구 너머의 통로를 확보한다.",
  },
  platform: {
    title: "멈춰 선 승강장",
    paragraphs: [
      "운행이 끊긴 열차가 승강장 한쪽을 비스듬히 막고 있다. 깨진 스크린도어 사이로 축축한 바람이 분다.",
      "바닥에는 급히 버리고 간 짐과 정비 도구가 흩어져 있지만, 먼저 승강장 중앙의 위험을 처리해야 한다.",
    ],
    tension: "시야가 트인 승강장에는 몸을 숨길 곳이 적다.",
    eventTitle: "승강장을 가로막은 붕괴물",
    eventParagraph: "천장 마감재와 철제 프레임이 무너져 통로를 막았다. 잔해 위쪽에서는 아직 작은 파편이 떨어진다.",
    eventGoal: "추가 붕괴를 피하면서 승강장 통행로를 연다.",
  },
  train: {
    title: "버려진 객차",
    paragraphs: [
      "객차 안은 넘어져 쌓인 좌석과 짐가방 때문에 한 사람이 겨우 지나갈 만큼 좁다.",
      "반쯤 열린 연결문 뒤로 쓸 만한 물건들이 보이지만, 객차를 점거한 위험부터 해결해야 한다.",
    ],
    tension: "좁은 객차에서는 퇴로가 쉽게 막힌다.",
    eventTitle: "안쪽에서 잠긴 연결문",
    eventParagraph: "뒤틀린 연결문이 통로를 막고 있고, 문 너머에서는 불규칙한 발소리가 들린다.",
    eventGoal: "객차의 위협을 확인하고 다음 연결부를 확보한다.",
  },
  track: {
    title: "환기구 아래 선로",
    paragraphs: [
      "선로를 따라갈수록 지상의 소음이 사라지고 축축한 바람만 환기구를 지난다.",
      "침목 사이에는 누군가 급히 버린 물건이 남아 있지만 불안정한 선로부터 통과해야 한다.",
    ],
    tension: "귀환 거리가 길어져 작은 부상도 치명적일 수 있다.",
    eventTitle: "무너지는 침목 구간",
    eventParagraph: "침수된 바닥 위로 낡은 침목 몇 개가 기울어 있다. 잘못 디디면 배수로 아래로 떨어질 수 있다.",
    eventGoal: "선로의 위험 구간을 안전하게 통과한다.",
  },
  maintenance: {
    title: "폐쇄된 정비 구역",
    paragraphs: [
      "두꺼운 방화문 너머에는 낡은 작업등과 부품 선반이 줄지어 있다.",
      "작업 구역에는 쓸 만한 설비가 남았지만 최근까지 누군가 머문 흔적도 선명하다.",
    ],
    tension: "깊은 정비 구역에는 사람과 붕괴 위험이 함께 도사린다.",
    eventTitle: "정비실을 지키는 생존자",
    eventParagraph: "굶주린 생존자 둘이 공구를 쥔 채 통로를 막고 있다. 겁에 질렸지만 순순히 물러날 상태는 아니다.",
    eventGoal: "정비실을 통과할 방법을 마련한다.",
  },
  deep_tunnel: {
    title: "지도 밖의 심층 터널",
    paragraphs: [
      "공식 노선도에 표시되지 않은 공사용 터널이 아래로 길게 기울어져 있다.",
      "벽에는 오래된 대피 표식과 최근 그어진 화살표가 겹쳐 있고, 손대지 않은 설비가 어둠 속에 남아 있다.",
    ],
    tension: "심층부의 보상은 크지만 귀환에 필요한 여력이 빠르게 줄어든다.",
    eventTitle: "침수된 공사 통로",
    eventParagraph: "차가운 물이 허리 높이까지 차오른 통로에서 끊어진 전선이 간헐적으로 불꽃을 튀긴다.",
    eventGoal: "감전과 침수를 피해 반대편 작업대로 건너간다.",
  },
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function hashValue(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function compactInventory(state: GameState) {
  return Object.entries(state.inventory)
    .filter(([, amount]) => amount > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, amount]) => ({ itemId, amount }));
}

function llmEnabled() {
  return hasGeminiConfig() && process.env.ENABLE_LLM_SUBWAY_EXPEDITION !== "false";
}

function generationErrorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function zodErrors(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
}

function assertPositiveDepth(depth: number) {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`Subway floor depth must be a positive integer; received ${depth}.`);
  }
}

const knownLootItemIds = new Set(
  SUBWAY_LOOT_TABLES.flatMap((table) => table.entries.map((entry) => entry.itemId)),
);

function validateAndCloneLootManifest(manifest: SubwayLootManifestSpot[]) {
  if (manifest.length !== 3) {
    throw new Error(`Subway loot manifest must contain exactly 3 spots; received ${manifest.length}.`);
  }

  const slotIds = new Set<string>();
  return manifest.map((spot, spotIndex) => {
    if (!spot.slotId || slotIds.has(spot.slotId)) {
      throw new Error(`Subway loot manifest has a missing or duplicate slotId at index ${spotIndex}.`);
    }
    slotIds.add(spot.slotId);

    const itemIds = new Set<string>();
    const contents = spot.contents.map((entry, entryIndex) => {
      if (!knownLootItemIds.has(entry.itemId)) {
        throw new Error(`Unknown subway loot item '${entry.itemId}' at ${spot.slotId}[${entryIndex}].`);
      }
      if (!Number.isInteger(entry.amount) || entry.amount < 1) {
        throw new Error(`Invalid subway loot amount at ${spot.slotId}[${entryIndex}].`);
      }
      if (itemIds.has(entry.itemId)) {
        throw new Error(`Duplicate subway loot item '${entry.itemId}' in ${spot.slotId}.`);
      }
      itemIds.add(entry.itemId);
      return { itemId: entry.itemId, amount: entry.amount };
    });

    return { slotId: spot.slotId, contents };
  });
}

export function buildSubwayFloorLootManifest(
  state: GameState,
  depth: number,
  random: () => number = Math.random,
) {
  assertPositiveDepth(depth);
  return validateAndCloneLootManifest(rollSubwayFloorLoot(state, depth, random));
}

export function buildSubwayMechanicsEnvelope(depth: number): SubwayMechanicsEnvelope {
  assertPositiveDepth(depth);

  const envelope = depth <= 10
    ? {
        clean: [
          { minutes: 55, energyCost: 1, statChanges: [] },
          { minutes: 45, energyCost: 1, statChanges: [] },
          { minutes: 30, energyCost: 2, statChanges: [] },
        ],
        costly: [
          { minutes: 60, energyCost: 2, statChanges: [{ stat: "mind" as const, amount: -1 }] },
          { minutes: 45, energyCost: 2, statChanges: [{ stat: "hp" as const, amount: -1 }] },
          { minutes: 30, energyCost: 3, statChanges: [{ stat: "hp" as const, amount: -1 }] },
        ],
      }
    : depth <= 20
      ? {
          clean: [
            { minutes: 65, energyCost: 2, statChanges: [] },
            { minutes: 50, energyCost: 2, statChanges: [] },
            { minutes: 35, energyCost: 3, statChanges: [] },
          ],
          costly: [
            { minutes: 70, energyCost: 3, statChanges: [{ stat: "mind" as const, amount: -1 }] },
            { minutes: 55, energyCost: 3, statChanges: [{ stat: "hp" as const, amount: -1 }] },
            {
              minutes: 40,
              energyCost: 3,
              statChanges: [
                { stat: "hp" as const, amount: -1 },
                { stat: "mind" as const, amount: -1 },
              ],
            },
          ],
        }
      : {
          clean: [
            { minutes: 75, energyCost: 2, statChanges: [] },
            { minutes: 60, energyCost: 3, statChanges: [] },
            { minutes: 45, energyCost: 3, statChanges: [] },
          ],
          costly: [
            {
              minutes: 80,
              energyCost: 3,
              statChanges: [
                { stat: "hp" as const, amount: -1 },
                { stat: "mind" as const, amount: -1 },
              ],
            },
            { minutes: 65, energyCost: 3, statChanges: [{ stat: "hp" as const, amount: -2 }] },
            { minutes: 50, energyCost: 3, statChanges: [{ stat: "mind" as const, amount: -2 }] },
          ],
        };

  return SubwayMechanicsEnvelopeSchema.parse(envelope);
}

export function hashSubwayMechanicsEnvelope(envelope: SubwayMechanicsEnvelope) {
  return hashValue(SubwayMechanicsEnvelopeSchema.parse(envelope));
}

export type SubwayFloorContextHashInput = Omit<
  SubwayFloorBundleGenerationInput,
  "gameId" | "contextHash"
>;

export function buildSubwayFloorContextHash(input: SubwayFloorContextHashInput) {
  return hashValue({
    promptVersion: SUBWAY_EXPEDITION_PROMPT_VERSION,
    model: geminiModel(),
    depth: input.depth,
    previousOutcome: input.previousOutcome,
    runPlan: input.runPlan,
    runMemory: input.runMemory,
    stats: input.state.stats,
    inventory: compactInventory(input.state),
    carriedLoot: input.state.subwayExpedition.carriedLoot,
    recentHistory: input.state.subwayExpedition.history.slice(-5),
    lootManifest: input.lootManifest,
    mechanicsEnvelopeHash: input.mechanicsEnvelopeHash,
  });
}

function emptyStoryMemory(): SubwayStoryMemory {
  return SubwayStoryMemorySchema.parse({});
}

export function buildTemplateSubwayRunPlan(
  input: number | { runNumber?: number; generatedAt?: string } = {},
): SubwayRunPlan {
  const options = typeof input === "number" ? { runNumber: input } : input;
  const runNumber = options.runNumber ?? 0;
  return SubwayRunPlanSchema.parse({
    runNumber,
    premise: "대합실 아래의 폐쇄 구간에서 최근 작동한 정비 방송과 사람의 흔적이 함께 발견된다.",
    objective: "흔적의 주인을 확인하며 귀환할 수 있는 경로와 생존 물자를 확보한다.",
    tone: "차갑고 현실적인 서울 지하 생존극. 작은 소음과 제한된 체력이 긴장을 만든다.",
    motifs: ["끊어진 안내 방송", "젖은 발자국", "붉은 정비 표시"],
    coreMystery: "폐쇄된 심층 구간의 정비 방송을 누가 다시 켰으며, 왜 아래층으로 유도하고 있는가?",
    escalationNotes: [
      "초반에는 오래된 흔적과 최근 흔적이 섞여 있다는 사실을 드러낸다.",
      "중반에는 누군가 이동 경로를 의도적으로 표시했다는 증거를 더한다.",
      "심층에서는 흔적의 주인과 붕괴 위험이 같은 경로에서 충돌하게 만든다.",
    ],
    facts: [
      "지하철 운행은 완전히 중단되었다.",
      "대합실은 정비와 귀환을 위한 안전 구역이며 심층 사건의 무대가 아니다.",
    ],
    unresolvedThreads: [
      "폐쇄된 심층 구간의 정비 방송을 누가 다시 켰는가?",
      "붉은 정비 표시는 누구를 아래층으로 이끄는가?",
    ],
    source: "template",
    generatedAt: options.generatedAt ?? nowIso(),
  });
}

export function prepareSubwayFloorGeneration(
  input: SubwayFloorPreparationInput,
): SubwayFloorBundleGenerationInput {
  assertPositiveDepth(input.depth);
  const state = structuredClone(input.state);
  const expectedRunNumber = state.subwayExpedition.active
    ? state.subwayExpedition.runNumber
    : state.subwayExpedition.runNumber + 1;
  const runPlan = SubwayRunPlanSchema.parse(
    input.runPlan ??
      state.subwayExpedition.runPlan ??
      buildTemplateSubwayRunPlan(expectedRunNumber),
  );
  const runMemory = SubwayStoryMemorySchema.parse(
    input.runMemory ?? state.subwayExpedition.storyMemory ?? emptyStoryMemory(),
  );
  const lootManifest = input.lootManifest
    ? validateAndCloneLootManifest(input.lootManifest)
    : buildSubwayFloorLootManifest(state, input.depth);
  const mechanicsEnvelope = SubwayMechanicsEnvelopeSchema.parse(
    input.mechanicsEnvelope ?? buildSubwayMechanicsEnvelope(input.depth),
  );
  const mechanicsEnvelopeHash = hashSubwayMechanicsEnvelope(mechanicsEnvelope);
  const hashInput: SubwayFloorContextHashInput = {
    state,
    depth: input.depth,
    previousOutcome: input.previousOutcome,
    runPlan,
    runMemory,
    lootManifest,
    mechanicsEnvelope,
    mechanicsEnvelopeHash,
  };

  return {
    gameId: input.gameId,
    ...hashInput,
    contextHash: buildSubwayFloorContextHash(hashInput),
  };
}

export const createSubwayFloorGenerationSpec = prepareSubwayFloorGeneration;

function normalizedFloorInput(
  input: SubwayFloorBundleGenerationInput,
): SubwayFloorBundleGenerationInput {
  assertPositiveDepth(input.depth);
  const state = structuredClone(input.state);
  const runPlan = SubwayRunPlanSchema.parse(input.runPlan);
  const runMemory = SubwayStoryMemorySchema.parse(input.runMemory);
  const lootManifest = validateAndCloneLootManifest(input.lootManifest);
  const mechanicsEnvelope = SubwayMechanicsEnvelopeSchema.parse(input.mechanicsEnvelope);
  const mechanicsEnvelopeHash = hashSubwayMechanicsEnvelope(mechanicsEnvelope);
  if (input.mechanicsEnvelopeHash !== mechanicsEnvelopeHash) {
    throw new Error(
      `Subway mechanics envelope hash mismatch: expected ${mechanicsEnvelopeHash}, received ${input.mechanicsEnvelopeHash}.`,
    );
  }

  const hashInput: SubwayFloorContextHashInput = {
    state,
    depth: input.depth,
    previousOutcome: input.previousOutcome,
    runPlan,
    runMemory,
    lootManifest,
    mechanicsEnvelope,
    mechanicsEnvelopeHash,
  };
  const contextHash = buildSubwayFloorContextHash(hashInput);
  if (input.contextHash !== contextHash) {
    throw new Error(
      `Subway floor context hash mismatch: expected ${contextHash}, received ${input.contextHash}.`,
    );
  }

  return {
    gameId: input.gameId,
    ...hashInput,
    contextHash,
  };
}

function templateEventOptions(depth: number) {
  const baseRisk = depth >= 11 ? "high" as const : depth >= 4 ? "medium" as const : "low" as const;
  return [
    {
      label: "주변 구조를 살피며 안전한 해결책을 찾는다",
      outcomeHint: "시간을 더 쓰는 대신 위험을 낮춰 사건을 해결합니다.",
      approach: "careful" as const,
      riskHint: baseRisk,
    },
    {
      label: "소리와 흔적을 관찰해 약점을 찾아낸다",
      outcomeHint: "정신력을 붙잡고 상황의 빈틈을 이용합니다.",
      approach: "observe" as const,
      riskHint: depth >= 8 ? "high" as const : "medium" as const,
    },
    {
      label: "힘으로 장애물을 밀어붙인다",
      outcomeHint: "빠르게 해결하지만 부상과 탈진 위험이 큽니다.",
      approach: "force" as const,
      riskHint: "high" as const,
    },
  ];
}

function mechanicsSummary(mechanics: SubwayOutcomeMechanics) {
  const parts = [`${mechanics.minutes}분`, `기력 ${mechanics.energyCost} 소모`];
  mechanics.statChanges.forEach((change) => {
    const stat = change.stat === "hp" ? "체력" : "정신력";
    parts.push(`${stat} ${change.amount > 0 ? "+" : ""}${change.amount}`);
  });
  return parts.join(" / ");
}

function templateOutcome(
  copy: (typeof templateCopyByZone)[SubwayExpeditionFloor["zone"]],
  optionLabel: string,
  mechanics: SubwayOutcomeMechanics,
  variant: "clean" | "costly",
  depth: number,
) {
  const clean = variant === "clean";
  const summary = clean
    ? `${optionLabel}는 계획대로 통했고, 퇴로를 잃지 않은 채 통로를 확보했다.`
    : `${optionLabel}는 통했지만 예상보다 큰 소음과 충격을 감수해야 했다.`;
  return {
    title: clean ? "계획대로 열린 통로" : "대가를 치른 돌파",
    paragraphs: [
      clean
        ? `서두르지 않고 위험 요소를 하나씩 치우자 ${copy.eventTitle}의 막힘이 풀렸다. 뒤쪽 퇴로도 그대로 남아 있다.`
        : `마지막 장애물이 거칠게 무너지며 통로가 열렸다. 몸과 정신에 부담이 남았지만 더 머물 수는 없다.`,
      `${summary} 적용 결과는 ${mechanicsSummary(mechanics)}이다.`,
    ],
    summary,
    mechanics: structuredClone(mechanics),
    nextFloorBridge: `지하 ${depth}층의 사건 뒤편에서 더 아래로 이어지는 정비 표식과 계단이 드러났다.`,
    facts: [`지하 ${depth}층의 ${copy.eventTitle}은 통과할 수 있는 상태가 되었다.`],
    unresolvedThreads: [],
    resolvedThreads: [],
  };
}

function templateSpotName(manifest: SubwayLootManifestSpot, index: number) {
  const itemIds = manifest.contents.map((entry) => entry.itemId);
  if (itemIds.includes("radioAntenna")) return "벽면 통신 설비함";
  if (itemIds.includes("painRelief")) return "깨진 비상 구급함";
  if (itemIds.some((itemId) => ["waterBottle", "staleBread", "emergencySnack", "cannedFood"].includes(itemId))) {
    return "넘어진 매점 진열대";
  }
  if (itemIds.some((itemId) => ["scrapMetal", "cordage", "clothScrap"].includes(itemId))) {
    return "찌그러진 정비 공구함";
  }
  return ["잠긴 사물함", "뒤집힌 수납 상자", "먼지 쌓인 선반"][index] ?? "버려진 보관함";
}

function fixedLootResultLine(manifest: SubwayLootManifestSpot) {
  if (manifest.contents.length === 0) {
    return "수색 결과: 쓸 만한 물자 없음.";
  }
  const contents = manifest.contents
    .map((entry) => `${subwayLootItemDescription(entry.itemId).name} ${entry.amount}개`)
    .join(", ");
  return `수색 결과: ${contents}.`;
}

function templateLootSpots(manifest: SubwayLootManifestSpot[]): FloorDraft["lootSpots"] {
  return manifest.map((spot, index) => {
    const name = templateSpotName(spot, index);
    const hasLoot = spot.contents.length > 0;
    return {
      slotId: spot.slotId,
      name,
      description: `${name}은(는) 먼지와 잔해에 반쯤 가려져 있다. 겉만 봐서는 안에 쓸 만한 것이 남았는지 알 수 없다.`,
      searchHint: "내부를 수색해 고정된 내용물을 확인하고 임시 전리품에 담습니다.",
      resultParagraphs: [
        hasLoot
          ? `${name} 안쪽의 잔해를 걷어 내자 보존된 물자가 드러났다. 확인한 물건을 빠짐없이 챙겼다.`
          : `${name} 안쪽까지 확인했지만 먼지와 망가진 잡동사니뿐이었다.`,
        fixedLootResultLine(spot),
      ],
    };
  });
}

function buildTemplateFloorDraft(input: SubwayFloorBundleGenerationInput): FloorDraft {
  const zone = zoneByDepth(input.depth);
  const copy = templateCopyByZone[zone];
  const options = templateEventOptions(input.depth).map((option, index) => ({
    ...option,
    outcomes: {
      clean: templateOutcome(
        copy,
        option.label,
        input.mechanicsEnvelope.clean[index % input.mechanicsEnvelope.clean.length],
        "clean",
        input.depth,
      ),
      costly: templateOutcome(
        copy,
        option.label,
        input.mechanicsEnvelope.costly[index % input.mechanicsEnvelope.costly.length],
        "costly",
        input.depth,
      ),
    },
  }));
  const storyBeat = `지하 ${input.depth}층에서 ${copy.eventTitle}을 마주하고, 더 아래로 이어지는 최근 흔적을 확인한다.`;
  return FloorDraftSchema.parse({
    title: copy.title,
    paragraphs: copy.paragraphs,
    tensionSummary: copy.tension,
    storyBeat,
    memoryDelta: {
      facts: [`지하 ${input.depth}층에는 ${copy.eventTitle}이 통로를 막고 있다.`],
      unresolvedThreads: [],
      resolvedThreads: [],
      recentSummaries: [storyBeat],
      lastBridge: input.runMemory.lastBridge,
    },
    majorEvent: {
      title: copy.eventTitle,
      paragraphs: [copy.eventParagraph],
      resolutionGoal: copy.eventGoal,
      options,
    },
    lootSpots: templateLootSpots(input.lootManifest),
  });
}

function compileFloorBundle(
  input: SubwayFloorBundleGenerationInput,
  draft: FloorDraft,
  source: "template" | "llm",
): SubwayFloorBundle {
  const lootBySlot = new Map(input.lootManifest.map((spot) => [spot.slotId, spot]));
  const id = `subway-floor-${input.runPlan.runNumber}-${input.depth}-${source}-${input.contextHash.slice(0, 12)}`;
  return SubwayFloorBundleSchema.parse({
    id,
    depth: input.depth,
    zone: zoneByDepth(input.depth),
    title: draft.title,
    paragraphs: draft.paragraphs,
    tensionSummary: draft.tensionSummary,
    storyBeat: draft.storyBeat,
    memoryDelta: draft.memoryDelta,
    majorEvent: {
      title: draft.majorEvent.title,
      paragraphs: draft.majorEvent.paragraphs,
      resolutionGoal: draft.majorEvent.resolutionGoal,
      options: draft.majorEvent.options.map((option, index) => ({
        id: `event-${input.depth}-${index + 1}`,
        label: option.label,
        outcomeHint: option.outcomeHint,
        approach: option.approach,
        riskHint: option.riskHint,
        outcomes: option.outcomes,
      })),
    },
    lootSpots: draft.lootSpots.map((spot) => ({
      id: spot.slotId,
      name: spot.name,
      description: spot.description,
      searchHint: spot.searchHint,
      resultParagraphs: spot.resultParagraphs,
      contents: structuredClone(lootBySlot.get(spot.slotId)?.contents ?? []),
    })),
    source,
    promptVersion: SUBWAY_EXPEDITION_PROMPT_VERSION,
    mechanicsEnvelopeHash: input.mechanicsEnvelopeHash,
    contextHash: input.contextHash,
    generatedAt: nowIso(),
  });
}

export function buildTemplateSubwayFloorBundle(
  rawInput: SubwayFloorBundleGenerationInput,
): SubwayFloorBundle {
  const input = normalizedFloorInput(rawInput);
  return compileFloorBundle(input, buildTemplateFloorDraft(input), "template");
}

function canonicalMechanics(mechanics: SubwayOutcomeMechanics) {
  return stableJson({
    ...mechanics,
    statChanges: [...mechanics.statChanges].sort((left, right) => left.stat.localeCompare(right.stat)),
  });
}

function mechanicsIsAllowed(
  mechanics: SubwayOutcomeMechanics,
  allowed: SubwayOutcomeMechanics[],
) {
  const candidate = canonicalMechanics(mechanics);
  return allowed.some((entry) => canonicalMechanics(entry) === candidate);
}

function sameNarrative(
  left: FloorDraft["majorEvent"]["options"][number]["outcomes"]["clean"],
  right: FloorDraft["majorEvent"]["options"][number]["outcomes"]["costly"],
) {
  return stableJson({
    title: left.title,
    paragraphs: left.paragraphs,
    summary: left.summary,
  }) === stableJson({
    title: right.title,
    paragraphs: right.paragraphs,
    summary: right.summary,
  });
}

function validateFloorDraftAgainstEngine(
  draft: FloorDraft,
  input: SubwayFloorBundleGenerationInput,
) {
  const errors: string[] = [];
  const seenApproaches = new Set<string>();
  const seenLabels = new Set<string>();

  draft.majorEvent.options.forEach((option, index) => {
    if (seenApproaches.has(option.approach)) {
      errors.push(`majorEvent.options[${index}].approach duplicates '${option.approach}'.`);
    }
    seenApproaches.add(option.approach);
    if (seenLabels.has(option.label)) {
      errors.push(`majorEvent.options[${index}].label is duplicated.`);
    }
    seenLabels.add(option.label);

    if (!mechanicsIsAllowed(option.outcomes.clean.mechanics, input.mechanicsEnvelope.clean)) {
      errors.push(
        `majorEvent.options[${index}].outcomes.clean.mechanics is not an exact clean envelope member.`,
      );
    }
    if (!mechanicsIsAllowed(option.outcomes.costly.mechanics, input.mechanicsEnvelope.costly)) {
      errors.push(
        `majorEvent.options[${index}].outcomes.costly.mechanics is not an exact costly envelope member.`,
      );
    }
    if (sameNarrative(option.outcomes.clean, option.outcomes.costly)) {
      errors.push(
        `majorEvent.options[${index}] must have distinct clean and costly outcome narratives.`,
      );
    }
  });

  const manifestBySlot = new Map(input.lootManifest.map((spot) => [spot.slotId, spot]));
  const seenSlots = new Set<string>();
  draft.lootSpots.forEach((spot, index) => {
    if (seenSlots.has(spot.slotId)) {
      errors.push(`lootSpots[${index}].slotId duplicates '${spot.slotId}'.`);
    }
    seenSlots.add(spot.slotId);
    const manifestSpot = manifestBySlot.get(spot.slotId);
    if (!manifestSpot) {
      errors.push(`lootSpots[${index}].slotId '${spot.slotId}' is not in the fixed manifest.`);
      return;
    }
    const requiredLine = fixedLootResultLine(manifestSpot);
    const finalParagraph = spot.resultParagraphs.at(-1);
    if (finalParagraph !== requiredLine) {
      errors.push(
        `lootSpots[${index}].resultParagraphs must end with the exact paragraph '${requiredLine}'.`,
      );
    }
  });
  input.lootManifest.forEach((spot) => {
    if (!seenSlots.has(spot.slotId)) {
      errors.push(`lootSpots is missing fixed manifest slot '${spot.slotId}'.`);
    }
  });

  return errors;
}

function parseAndValidateFloorDraft(
  raw: unknown,
  input: SubwayFloorBundleGenerationInput,
) {
  const parsed = FloorDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { draft: null, errors: zodErrors(parsed.error) };
  }
  const errors = validateFloorDraftAgainstEngine(parsed.data, input);
  return {
    draft: errors.length === 0 ? parsed.data : null,
    errors,
  };
}

function appendDraftTrace(
  gameId: string,
  target: string,
  raw: unknown,
) {
  appendDevLlmTraceForGame(gameId, {
    scope: "subway",
    target,
    stage: "raw_draft",
    model: geminiModel(),
    status: "success",
    request: "",
    response: JSON.stringify(raw, null, 2),
    message: "지하철 구조형 초안을 수신했습니다.",
  });
}

function appendValidationTrace(
  gameId: string,
  target: string,
  errors: string[],
) {
  const valid = errors.length === 0;
  appendDevLlmTraceForGame(gameId, {
    scope: "subway",
    target,
    stage: "draft_validation",
    model: geminiModel(),
    status: valid ? "success" : "error",
    request: "",
    response: valid ? "[]" : JSON.stringify(errors, null, 2),
    message: valid
      ? "지하철 초안이 manifest와 mechanics envelope 검증을 통과했습니다."
      : "지하철 초안이 검증을 통과하지 못해 규칙 안쪽으로 재생성을 요청합니다.",
    errorReason: valid ? undefined : errors.join("\n"),
  });
}

function promptLootManifest(manifest: SubwayLootManifestSpot[]) {
  return manifest.map((spot) => ({
    slotId: spot.slotId,
    fixedContents: spot.contents.map((entry) => ({
      ...subwayLootItemDescription(entry.itemId),
      amount: entry.amount,
      requiredResultFact: `${subwayLootItemDescription(entry.itemId).name} ${entry.amount}개`,
    })),
    requiredResultLine: fixedLootResultLine(spot),
  }));
}

function promptRunPlan(plan: SubwayRunPlan) {
  return {
    runNumber: plan.runNumber,
    premise: plan.premise,
    objective: plan.objective,
    tone: plan.tone,
    motifs: plan.motifs,
    coreMystery: plan.coreMystery,
    escalationNotes: plan.escalationNotes,
    facts: plan.facts,
    unresolvedThreads: plan.unresolvedThreads,
  };
}

function requiredFloorOutputShape(input: SubwayFloorBundleGenerationInput) {
  const clean = input.mechanicsEnvelope.clean[0];
  const costly = input.mechanicsEnvelope.costly[0];
  return {
    title: "이 층만의 구체적인 한국어 제목",
    paragraphs: ["층 도입 묘사 첫 문단", "층 도입 묘사 둘째 문단"],
    tensionSummary: "이 층의 핵심 긴장 한 문장",
    storyBeat: "회차 전체 이야기에서 이 층이 담당하는 한 개의 진행 박자",
    memoryDelta: {
      facts: ["이 층에 들어온 순간 확정된 사실만"],
      unresolvedThreads: ["새로 열린 의문"],
      resolvedThreads: ["이번 층 도입만으로 실제 해소된 기존 의문"],
      recentSummaries: ["이 층 도입의 짧은 요약"],
      lastBridge: input.runMemory.lastBridge,
    },
    majorEvent: {
      title: "이 층의 큰 사건 제목",
      paragraphs: ["큰 사건을 보여 주는 구체적인 묘사"],
      resolutionGoal: "플레이어가 해결해야 할 목표",
      options: [
        {
          label: "사건 해결 행동",
          outcomeHint: "선택 전 보이는 접근 방식 설명",
          approach: "careful",
          riskHint: "low",
          outcomes: {
            clean: {
              title: "깔끔하게 해결된 결과 장면 제목",
              paragraphs: ["선택 결과 장면"],
              summary: "결과 요약",
              mechanics: clean,
              nextFloorBridge: "이 결과에서 다음 층으로 이어지는 문장",
              facts: ["이 결과로 확정된 사실"],
              unresolvedThreads: [],
              resolvedThreads: [],
            },
            costly: {
              title: "대가를 치른 결과 장면 제목",
              paragraphs: ["서로 다른 대가 결과 장면"],
              summary: "대가 결과 요약",
              mechanics: costly,
              nextFloorBridge: "이 결과에서 다음 층으로 이어지는 문장",
              facts: ["이 결과로 확정된 사실"],
              unresolvedThreads: [],
              resolvedThreads: [],
            },
          },
        },
        "같은 구조의 서로 다른 선택지 1~2개",
      ],
    },
    lootSpots: input.lootManifest.map((spot) => ({
      slotId: spot.slotId,
      name: "고정 내용물이 있을 법한 파밍 지점 이름",
      description: "수색 전 외형과 주변 단서",
      searchHint: "수색 행동 설명",
      resultParagraphs: [
        "고정 내용물과 정확히 일치하는 수색 결과 장면",
        fixedLootResultLine(spot),
      ],
    })),
  };
}

const FLOOR_SYSTEM_PROMPT = `당신은 붕괴한 서울을 배경으로 하는 현실적인 생존 텍스트 RPG의 지하철 심층 탐험 작가입니다.
서버가 이미 정한 전리품과 역학 수치를 바꾸지 않고, 현재 회차의 미스터리를 이어 가는 한 층과 모든 선택 결과 장면을 작성합니다.

[절대 규칙]
1. 요청받은 깊이의 지하철 구간 한 층만 작성하십시오. 대합실과 10일 구조 목표·엔딩을 변경하지 마십시오.
2. requiredEnvironment가 이번 층의 물리적 배경입니다. 더 깊은 구역을 앞당겨 등장시키지 마십시오.
3. 초자연 현상, 마법, 괴물, 무한 열차를 사용하지 마십시오. 위험은 붕괴, 침수, 화재, 어둠, 부상, 약탈자, 겁먹은 생존자, 소음, 부족한 자원에서 나옵니다.
4. 큰 사건은 정확히 1개, 사건 해결 선택지는 2~3개, 파밍 지점은 정확히 3개입니다.
5. 각 선택지는 clean과 costly 결과 장면을 모두 미리 작성하십시오. 두 장면의 제목·묘사·요약은 실제로 달라야 합니다.
6. 각 결과의 mechanics 객체는 mechanicsEnvelope의 같은 분류(clean 또는 costly)에 들어 있는 객체 하나를 키와 값까지 그대로 복사하십시오. 수치를 계산·혼합·보정·추가하지 마십시오.
7. approach는 careful, scavenge, force, observe 중 중복 없이 사용하십시오. 다음 층 이동, 귀환, 파밍을 사건 선택지로 만들지 마십시오.
8. lootManifest의 slotId를 각각 정확히 한 번 사용하십시오. slotId를 바꾸거나 누락하거나 추가하지 마십시오.
9. fixedContents는 엔진이 이미 확정한 유일한 보상입니다. 다른 아이템이나 수량을 만들지 말고, resultParagraphs 마지막에 requiredResultLine을 글자 그대로 포함하십시오.
10. 빈 fixedContents에는 쓸 만한 물자가 없다고 서술하고 requiredResultLine을 그대로 포함하십시오.
11. 수색 전 description은 내용물을 확정해 노출하지 말고, resultParagraphs에서만 고정 결과를 밝히십시오.
12. storyBeat와 memoryDelta에는 선택 전 확정되는 내용만 쓰십시오. 선택에 따라 달라지는 기억은 각 outcome의 facts/threads에 쓰십시오.
13. 이전 사실을 뒤집지 말고, 최근 층과 같은 사건·용기·문장을 반복하지 마십시오.
14. 모든 플레이어 노출 문장은 자연스러운 한국어로 쓰고 requiredOutputShape에 없는 키를 만들지 마십시오.
JSON만 반환하십시오.`;

async function requestValidatedFloorDraft(
  input: SubwayFloorBundleGenerationInput,
): Promise<FloorDraft> {
  const expedition = input.state.subwayExpedition;
  const lootTable = subwayLootTableForDepth(input.depth);
  let validatorErrors: string[] = [];

  for (let attempt = 1; attempt <= TOTAL_GENERATION_ATTEMPTS; attempt += 1) {
    const target = `floor:${input.depth}:attempt:${attempt}`;
    let raw: unknown;
    try {
      raw = await generateGeminiJson<unknown>(
        FLOOR_SYSTEM_PROMPT,
        {
          schemaName: "StructuredSubwayFloorBundleDraft",
          promptVersion: SUBWAY_EXPEDITION_PROMPT_VERSION,
          attempt,
          repair: attempt === 1
            ? null
            : {
                validatorErrors,
                instruction: "오류 각각을 고쳐 전체 JSON을 규칙 안쪽으로 다시 생성하십시오.",
              },
          contextHash: input.contextHash,
          depth: input.depth,
          section: {
            id: lootTable.id,
            minDepth: lootTable.minDepth,
            maxDepth: lootTable.maxDepth,
          },
          expectedZone: zoneByDepth(input.depth),
          requiredEnvironment: zoneBrief[zoneByDepth(input.depth)],
          player: {
            hp: input.state.stats.hp,
            mind: input.state.stats.mind,
            energy: input.state.stats.energy,
          },
          expedition: {
            runPlan: promptRunPlan(input.runPlan),
            memory: input.runMemory,
            carriedLootItemIds: Object.keys(expedition.carriedLoot)
              .filter((itemId) => (expedition.carriedLoot[itemId] ?? 0) > 0)
              .sort(),
            previousOutcome: input.previousOutcome,
            recentHistory: expedition.history.slice(-5).map((entry) => ({
              depth: entry.depth,
              title: entry.title,
              selectedChoice: entry.choiceLabel,
              outcome: entry.outcome,
            })),
          },
          lootManifest: promptLootManifest(input.lootManifest),
          mechanicsEnvelope: input.mechanicsEnvelope,
          mechanicsEnvelopeHash: input.mechanicsEnvelopeHash,
          requiredOutputShape: requiredFloorOutputShape(input),
        },
        {
          model: geminiModel(),
          temperature: 0.8,
          timeoutMs: 25_000,
          trace: {
            gameId: input.gameId,
            scope: "subway",
            target,
          },
        },
      );
    } catch (error) {
      validatorErrors = [`response: ${generationErrorReason(error)}`];
      appendValidationTrace(input.gameId, target, validatorErrors);
      if (error instanceof SyntaxError && attempt < TOTAL_GENERATION_ATTEMPTS) {
        continue;
      }
      throw error;
    }

    appendDraftTrace(input.gameId, target, raw);
    const result = parseAndValidateFloorDraft(raw, input);
    appendValidationTrace(input.gameId, target, result.errors);
    if (result.draft) {
      return result.draft;
    }
    validatorErrors = result.errors;
  }

  throw new Error(
    `Subway floor draft remained invalid after ${TOTAL_GENERATION_ATTEMPTS} attempts: ${validatorErrors.join(" | ")}`,
  );
}

export async function generateSubwayFloorBundle(
  rawInput: SubwayFloorBundleGenerationInput,
): Promise<SubwayFloorBundle> {
  const input = normalizedFloorInput(rawInput);
  if (!llmEnabled()) {
    return compileFloorBundle(input, buildTemplateFloorDraft(input), "template");
  }

  try {
    const draft = await requestValidatedFloorDraft(input);
    return compileFloorBundle(input, draft, "llm");
  } catch (error) {
    const fallback = buildTemplateFloorDraft(input);
    appendDevLlmTraceForGame(input.gameId, {
      scope: "subway",
      target: `floor:${input.depth}:fallback`,
      stage: "fallback",
      model: geminiModel(),
      status: "fallback",
      request: JSON.stringify({
        promptVersion: SUBWAY_EXPEDITION_PROMPT_VERSION,
        contextHash: input.contextHash,
        mechanicsEnvelopeHash: input.mechanicsEnvelopeHash,
      }),
      response: JSON.stringify(fallback, null, 2),
      message: "지하철 층 생성 또는 수리 검증에 실패해 표시된 템플릿 층을 사용했습니다.",
      errorReason: generationErrorReason(error),
    });
    return compileFloorBundle(input, fallback, "template");
  }
}

const RUN_PLAN_SYSTEM_PROMPT = `당신은 붕괴한 서울을 배경으로 하는 현실적인 생존 텍스트 RPG의 지하철 회차 감독입니다.
지하철 심층 탐험 한 회차에서만 유지될 목표, 미스터리, 분위기, 반복 소재와 긴장 상승 방향을 설계하십시오.

[절대 규칙]
1. 이야기는 지하철 심층 탐험에만 적용됩니다. 지상의 대합실 정비 기능, 10일 구조 목표, 퀘스트, 엔딩을 만들거나 변경하지 마십시오.
2. 초자연 현상, 마법, 괴물, 무한 열차를 사용하지 마십시오.
3. 한 회차 안에서 여러 층에 걸쳐 조금씩 드러낼 수 있는 현실적인 핵심 미스터리 하나를 만드십시오.
4. escalationNotes는 초반·중반·심층의 상승 방향을 최소 3개로 제시하되 특정 층의 결과를 확정하지 마십시오.
5. facts는 회차 시작부터 참인 사실만, unresolvedThreads는 앞으로 확인할 질문만 담으십시오.
6. 자연스러운 한국어를 사용하고 requiredOutputShape에 없는 키를 만들지 마십시오.
JSON만 반환하십시오.`;

function requiredRunPlanOutputShape() {
  return {
    premise: "이번 탐험 회차의 출발 상황",
    objective: "이번 회차 안에서 추적할 목표",
    tone: "현실적인 생존극 분위기",
    motifs: ["반복 소재 1", "반복 소재 2", "반복 소재 3"],
    coreMystery: "여러 층에 걸쳐 드러날 핵심 의문",
    escalationNotes: ["초반 상승 방향", "중반 상승 방향", "심층 상승 방향"],
    facts: ["회차 시작부터 참인 사실"],
    unresolvedThreads: ["앞으로 확인할 질문"],
  };
}

async function requestValidatedRunPlanDraft(
  input: SubwayRunPlanGenerationInput,
  runNumber: number,
): Promise<RunPlanDraft> {
  let validatorErrors: string[] = [];
  for (let attempt = 1; attempt <= TOTAL_GENERATION_ATTEMPTS; attempt += 1) {
    const target = `run:${runNumber}:attempt:${attempt}`;
    let raw: unknown;
    try {
      raw = await generateGeminiJson<unknown>(
        RUN_PLAN_SYSTEM_PROMPT,
        {
          schemaName: "StructuredSubwayRunPlanDraft",
          promptVersion: SUBWAY_EXPEDITION_PROMPT_VERSION,
          runNumber,
          attempt,
          repair: attempt === 1
            ? null
            : {
                validatorErrors,
                instruction: "오류 각각을 고쳐 전체 JSON을 규칙 안쪽으로 다시 생성하십시오.",
              },
          player: {
            hp: input.state.stats.hp,
            mind: input.state.stats.mind,
            energy: input.state.stats.energy,
            deepestDepth: input.state.subwayExpedition.deepestDepth,
          },
          requiredOutputShape: requiredRunPlanOutputShape(),
        },
        {
          model: geminiModel(),
          temperature: 0.75,
          timeoutMs: 25_000,
          trace: {
            gameId: input.gameId,
            scope: "subway",
            target,
          },
        },
      );
    } catch (error) {
      validatorErrors = [`response: ${generationErrorReason(error)}`];
      appendValidationTrace(input.gameId, target, validatorErrors);
      if (error instanceof SyntaxError && attempt < TOTAL_GENERATION_ATTEMPTS) {
        continue;
      }
      throw error;
    }
    appendDraftTrace(input.gameId, target, raw);
    const parsed = RunPlanDraftSchema.safeParse(raw);
    validatorErrors = parsed.success ? [] : zodErrors(parsed.error);
    appendValidationTrace(input.gameId, target, validatorErrors);
    if (parsed.success) {
      return parsed.data;
    }
  }
  throw new Error(
    `Subway run plan remained invalid after ${TOTAL_GENERATION_ATTEMPTS} attempts: ${validatorErrors.join(" | ")}`,
  );
}

export async function generateSubwayRunPlan(
  input: SubwayRunPlanGenerationInput,
): Promise<SubwayRunPlan> {
  const runNumber = input.runNumber ?? (
    input.state.subwayExpedition.active
      ? input.state.subwayExpedition.runNumber
      : input.state.subwayExpedition.runNumber + 1
  );
  if (!Number.isInteger(runNumber) || runNumber < 0) {
    throw new Error(`Subway run number must be a non-negative integer; received ${runNumber}.`);
  }
  if (!llmEnabled()) {
    return buildTemplateSubwayRunPlan(runNumber);
  }

  try {
    const draft = await requestValidatedRunPlanDraft(input, runNumber);
    return SubwayRunPlanSchema.parse({
      runNumber,
      ...draft,
      source: "llm",
      generatedAt: nowIso(),
    });
  } catch (error) {
    const fallback = buildTemplateSubwayRunPlan(runNumber);
    appendDevLlmTraceForGame(input.gameId, {
      scope: "subway",
      target: `run:${runNumber}:fallback`,
      stage: "fallback",
      model: geminiModel(),
      status: "fallback",
      request: JSON.stringify({ promptVersion: SUBWAY_EXPEDITION_PROMPT_VERSION, runNumber }),
      response: JSON.stringify(fallback, null, 2),
      message: "지하철 회차 계획 생성 또는 수리 검증에 실패해 표시된 템플릿 계획을 사용했습니다.",
      errorReason: generationErrorReason(error),
    });
    return fallback;
  }
}

export async function generateSubwayFloor(
  input: SubwayFloorGenerationInput,
): Promise<SubwayExpeditionFloor> {
  const expectedRunNumber = input.state.subwayExpedition.active
    ? input.state.subwayExpedition.runNumber
    : input.state.subwayExpedition.runNumber + 1;
  const prepared = prepareSubwayFloorGeneration({
    ...input,
    runPlan:
      input.state.subwayExpedition.runPlan ??
      buildTemplateSubwayRunPlan(expectedRunNumber),
    runMemory: input.state.subwayExpedition.storyMemory ?? emptyStoryMemory(),
  });
  return generateSubwayFloorBundle(prepared);
}
