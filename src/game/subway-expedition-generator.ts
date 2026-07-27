import { z } from "zod";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { generateGeminiJson, geminiModel, hasGeminiConfig } from "./gemini-client";
import {
  rollSubwayFloorLoot,
  subwayLootItemDescription,
  subwayLootTableForDepth,
  type SubwayLootManifestSpot,
} from "./subway-loot";
import type {
  GameState,
  SubwayExpeditionApproach,
  SubwayExpeditionFloor,
} from "./schemas";

const EventOptionDraftSchema = z.object({
  label: z.string().min(1).max(80),
  outcomeHint: z.string().min(1).max(180),
  approach: z.enum(["careful", "scavenge", "force", "observe"]),
  riskHint: z.enum(["low", "medium", "high"]),
});

const FloorDraftSchema = z.object({
  title: z.string().min(1).max(60),
  paragraphs: z.array(z.string().min(1).max(500)).min(2).max(4),
  tensionSummary: z.string().min(1).max(140),
  majorEvent: z.object({
    title: z.string().min(1).max(70),
    paragraphs: z.array(z.string().min(1).max(500)).min(1).max(3),
    resolutionGoal: z.string().min(1).max(160),
    options: z.array(EventOptionDraftSchema).min(2).max(3),
  }),
  lootSpots: z.array(z.object({
    slotId: z.string().min(1),
    name: z.string().min(1).max(60),
    description: z.string().min(1).max(240),
    searchHint: z.string().min(1).max(160),
  })).length(3),
});

type FloorDraft = z.infer<typeof FloorDraftSchema>;

export type SubwayFloorGenerationInput = {
  gameId: string;
  state: GameState;
  depth: number;
  previousOutcome: string;
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

const fallbackCopyByZone: Record<
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

function fallbackEventOptions(depth: number): FloorDraft["majorEvent"]["options"] {
  const baseRisk = depth >= 11 ? "high" : depth >= 4 ? "medium" : "low";
  return [
    {
      label: "주변 구조를 살피며 안전한 해결책을 찾는다",
      outcomeHint: "시간을 더 쓰는 대신 위험을 낮춰 사건을 해결합니다.",
      approach: "careful",
      riskHint: baseRisk,
    },
    {
      label: "소리와 흔적을 관찰해 약점을 찾아낸다",
      outcomeHint: "정신력을 붙잡고 상황의 빈틈을 이용합니다.",
      approach: "observe",
      riskHint: depth >= 8 ? "high" : "medium",
    },
    {
      label: "힘으로 장애물을 밀어붙인다",
      outcomeHint: "빠르게 해결하지만 부상과 탈진 위험이 큽니다.",
      approach: "force",
      riskHint: "high",
    },
  ];
}

function fallbackSpotName(manifest: SubwayLootManifestSpot, index: number) {
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

function fallbackLootSpots(manifest: SubwayLootManifestSpot[]): FloorDraft["lootSpots"] {
  return manifest.map((spot, index) => {
    const name = fallbackSpotName(spot, index);
    return {
      slotId: spot.slotId,
      name,
      description: `${name}은(는) 먼지와 잔해에 반쯤 가려져 있다. 겉만 봐서는 안에 쓸 만한 것이 남았는지 알 수 없다.`,
      searchHint: "15분을 들여 내부를 수색합니다. 내용물은 확인한 뒤 임시 전리품에 담깁니다.",
    };
  });
}

function buildFallbackDraft(depth: number, manifest: SubwayLootManifestSpot[]): FloorDraft {
  const zone = zoneByDepth(depth);
  const copy = fallbackCopyByZone[zone];
  return {
    title: copy.title,
    paragraphs: copy.paragraphs,
    tensionSummary: copy.tension,
    majorEvent: {
      title: copy.eventTitle,
      paragraphs: [copy.eventParagraph],
      resolutionGoal: copy.eventGoal,
      options: fallbackEventOptions(depth),
    },
    lootSpots: fallbackLootSpots(manifest),
  };
}

function normalizeEventOptions(
  options: FloorDraft["majorEvent"]["options"],
  fallback: FloorDraft["majorEvent"]["options"],
) {
  const seenApproaches = new Set<SubwayExpeditionApproach>();
  const normalized = options.filter((option) => {
    if (seenApproaches.has(option.approach)) {
      return false;
    }
    seenApproaches.add(option.approach);
    return true;
  });
  for (const option of fallback) {
    if (normalized.length >= 3) break;
    if (seenApproaches.has(option.approach)) continue;
    seenApproaches.add(option.approach);
    normalized.push(option);
  }
  return normalized.slice(0, 3);
}

function normalizeLootSpotDrafts(
  drafts: FloorDraft["lootSpots"],
  fallback: FloorDraft["lootSpots"],
  manifest: SubwayLootManifestSpot[],
) {
  const draftBySlot = new Map(drafts.map((spot) => [spot.slotId, spot]));
  return manifest.map((manifestSpot, index) => {
    const draft = draftBySlot.get(manifestSpot.slotId) ?? fallback[index];
    return {
      id: manifestSpot.slotId,
      name: draft.name,
      description: draft.description,
      searchHint: draft.searchHint,
      contents: manifestSpot.contents.map((entry) => ({ ...entry })),
    };
  });
}

function finalizeFloor(
  depth: number,
  draft: FloorDraft,
  fallback: FloorDraft,
  manifest: SubwayLootManifestSpot[],
  source: "template" | "llm",
): SubwayExpeditionFloor {
  const options = normalizeEventOptions(draft.majorEvent.options, fallback.majorEvent.options);
  return {
    id: `subway-floor-${depth}-${Date.now()}`,
    depth,
    zone: zoneByDepth(depth),
    title: draft.title,
    paragraphs: draft.paragraphs,
    tensionSummary: draft.tensionSummary,
    majorEvent: {
      title: draft.majorEvent.title,
      paragraphs: draft.majorEvent.paragraphs,
      resolutionGoal: draft.majorEvent.resolutionGoal,
      options: options.map((option, index) => ({
        id: `event-${depth}-${index + 1}`,
        label: option.label,
        outcomeHint: option.outcomeHint,
        approach: option.approach,
        riskHint: option.riskHint,
      })),
    },
    lootSpots: normalizeLootSpotDrafts(draft.lootSpots, fallback.lootSpots, manifest),
    source,
    generatedAt: new Date().toISOString(),
  };
}

function compactInventory(state: GameState) {
  return Object.entries(state.inventory)
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => ({ itemId, amount }));
}

function llmEnabled() {
  return hasGeminiConfig() && process.env.ENABLE_LLM_SUBWAY_EXPEDITION !== "false";
}

function generationErrorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function promptLootManifest(manifest: SubwayLootManifestSpot[]) {
  return manifest.map((spot) => ({
    slotId: spot.slotId,
    fixedContents: spot.contents.map((entry) => ({
      ...subwayLootItemDescription(entry.itemId),
      amount: entry.amount,
    })),
  }));
}

function requiredOutputShape(manifest: SubwayLootManifestSpot[]) {
  return {
    title: "이 층만의 구체적인 한국어 제목",
    paragraphs: ["층 도입 묘사 첫 문단", "층 도입 묘사 둘째 문단"],
    tensionSummary: "이 층의 핵심 긴장 한 문장",
    majorEvent: {
      title: "이 층의 큰 사건 제목",
      paragraphs: ["큰 사건을 보여 주는 구체적인 묘사"],
      resolutionGoal: "플레이어가 해결해야 할 목표",
      options: [
        {
          label: "안전성을 우선하는 사건 해결 행동",
          outcomeHint: "시간을 더 쓰는 대신 위험을 줄이는 접근",
          approach: "careful",
          riskHint: "low",
        },
        {
          label: "주변 자원이나 구조물을 활용하는 사건 해결 행동",
          outcomeHint: "현장의 물건을 활용하는 균형 잡힌 접근",
          approach: "scavenge",
          riskHint: "medium",
        },
        {
          label: "빠르지만 위험한 사건 해결 행동",
          outcomeHint: "힘으로 밀어붙이는 고위험 접근",
          approach: "force",
          riskHint: "high",
        },
      ],
    },
    lootSpots: manifest.map((spot) => ({
      slotId: spot.slotId,
      name: "내용물과 공간에 어울리는 파밍 지점 이름",
      description: "내용물을 확정해서 밝히지 않는 외형과 주변 단서",
      searchHint: "수색 행동을 설명하는 한 문장",
    })),
  };
}

export async function generateSubwayFloor(
  input: SubwayFloorGenerationInput,
): Promise<SubwayExpeditionFloor> {
  const lootManifest = rollSubwayFloorLoot(input.state, input.depth);
  const fallback = buildFallbackDraft(input.depth, lootManifest);
  if (!llmEnabled()) {
    return finalizeFloor(input.depth, fallback, fallback, lootManifest, "template");
  }

  const expedition = input.state.subwayExpedition;
  const recentHistory = expedition.history.slice(-5).map((entry) => ({
    depth: entry.depth,
    title: entry.title,
    selectedChoice: entry.choiceLabel,
    outcome: entry.outcome,
  }));
  const lootTable = subwayLootTableForDepth(input.depth);

  try {
    const raw = await generateGeminiJson<unknown>(
      `당신은 붕괴한 서울을 배경으로 하는 현실적인 생존 텍스트 RPG의 지하철 층 설계자입니다.
당신의 역할은 아이템을 결정하는 것이 아니라, 서버가 이미 판정한 층 구조와 전리품을 설득력 있는 장면으로 포장하는 것입니다.

[절대 규칙]
1. 요청받은 깊이의 지하철 구간 한 층만 만드십시오.
2. requiredEnvironment가 이번 층의 물리적 배경입니다. 더 깊은 구역을 앞당겨 등장시키지 마십시오.
3. 초자연 현상, 마법, 괴물, 무한 열차를 사용하지 마십시오. 위험은 붕괴, 침수, 화재, 어둠, 부상, 약탈자, 겁먹은 생존자, 소음, 부족한 자원에서 나옵니다.
4. 한 층은 도입 공간, 큰 사건 exactly 1개, 파밍 지점 exactly 3개로 구성합니다.
5. majorEvent는 플레이어가 파밍을 시작하기 전에 해결해야 하는 그 층의 중심 장애물입니다.
6. majorEvent.options는 사건을 해결하는 서로 다른 방법 3개입니다. 다음 층 이동, 귀환, 파밍 행동을 넣지 마십시오.
7. approach는 careful, scavenge, force, observe 중 중복 없이 사용하십시오. riskHint는 low, medium, high 중 하나입니다.
8. lootManifest의 slotId를 하나씩 정확히 사용해 lootSpots 3개를 만드십시오. slotId를 바꾸거나 누락하거나 추가하지 마십시오.
9. fixedContents는 서버가 확률표로 이미 확정한 결과입니다. 아이템 종류와 수량을 추가·삭제·교체하지 마십시오.
10. fixedContents가 자연스럽게 들어 있을 법한 상자, 선반, 사물함, 설비함, 가방 등으로 각 지점을 포장하십시오. 빈 목록이면 비어 있거나 쓸모없는 물건만 남은 장소로 표현하십시오.
11. lootSpots의 설명에서는 내용물을 노골적으로 확정해 말하지 말고, 수색할 가치가 있어 보이는 시각적 단서만 제공하십시오.
12. 수치 효과, 피해량, 성공 여부, 추가 보상을 만들지 마십시오. 모든 판정은 서버가 담당합니다.
13. 이전 층과 최근 기록을 이어받되 같은 사건, 용기, 문장을 반복하지 마십시오.
14. 모든 플레이어 노출 문장은 자연스러운 한국어로 작성하고 지정된 JSON 키 외의 키를 만들지 마십시오.
JSON만 반환하십시오.`,
      {
        schemaName: "StructuredSubwayFloorDraft",
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
          inventory: compactInventory(input.state),
        },
        expedition: {
          runNumber: expedition.runNumber,
          carriedLoot: expedition.carriedLoot,
          previousOutcome: input.previousOutcome,
          recentHistory,
        },
        lootManifest: promptLootManifest(lootManifest),
        requiredOutputShape: requiredOutputShape(lootManifest),
      },
      {
        model: geminiModel(),
        temperature: 0.85,
        timeoutMs: 25_000,
        trace: {
          gameId: input.gameId,
          scope: "subway",
          target: `floor:${input.depth}`,
        },
      },
    );
    const parsed = FloorDraftSchema.parse(raw);
    return finalizeFloor(input.depth, parsed, fallback, lootManifest, "llm");
  } catch (error) {
    appendDevLlmTraceForGame(input.gameId, {
      scope: "subway",
      target: `floor:${input.depth}:fallback`,
      stage: "fallback",
      model: geminiModel(),
      status: "fallback",
      request: "",
      response: JSON.stringify(fallback, null, 2),
      message: "구조형 지하철 층 생성에 실패해 안전한 템플릿 층을 사용했습니다.",
      errorReason: generationErrorReason(error),
    });
    return finalizeFloor(input.depth, fallback, fallback, lootManifest, "template");
  }
}
