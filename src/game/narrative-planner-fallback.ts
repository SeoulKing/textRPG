import { PHASES } from "./base-data";
import { getRuntimeLocationDefinition } from "./runtime-registry";
import type { DayEvolutionPlan, NarrativeAnchorDraft, NarrativeSceneDraft, WorldPlan } from "./schemas";
import { DayEvolutionPlanSchema, NarrativeAnchorDraftSchema, NarrativeSceneDraftSchema } from "./schemas";
import type { PlannerInput, StoryBeatPlannerInput } from "./narrative-planner-types";
import { validateNarrativeAnchorDraft, validateNarrativeSceneDraft } from "./narrative-planner-validation";

type FallbackTheme = {
  slug: string;
  title: string;
  summary: string;
  resident: {
    name: string;
    role: string;
    summary: string;
    relationToPlayer: string;
    personality: string[];
  };
  subareas: Array<{ name: string; summary: string }>;
  itemIds: string[];
};

const FALLBACK_THEMES: FallbackTheme[] = [
  {
    slug: "subway_gate",
    title: "지하철역 입구",
    summary: "무너진 에스컬레이터와 봉쇄 테이프 사이로 아직 내려갈 수 있는 통로가 남아 있다.",
    resident: {
      name: "입구를 지키는 청년",
      role: "지하 통로 감시자",
      summary: "역 아래로 내려간 사람들의 흔적을 기록하며 입구를 지키는 생존자다.",
      relationToPlayer: "경계심은 있지만 쓸 만한 물자나 정보를 맞바꿀 여지는 있다.",
      personality: ["신중함", "관찰력", "불신"],
    },
    subareas: [
      { name: "깨진 매표소", summary: "강화유리 아래로 작은 물자와 금속 조각이 흩어져 있다." },
      { name: "어두운 계단", summary: "지하로 이어지는 계단 끝에서 바람과 먼지 냄새가 올라온다." },
    ],
    itemIds: ["waterBottle", "scrapMetal"],
  },
  {
    slug: "apartment_office",
    title: "아파트 관리실",
    summary: "유리문이 반쯤 깨진 관리실 안에 공구함과 주민 공지가 뒤섞여 있다.",
    resident: {
      name: "관리실에 남은 관리인",
      role: "생활 구역 관리자",
      summary: "비어 가는 단지에서 마지막까지 장부와 공구를 챙기는 중년의 생존자다.",
      relationToPlayer: "필요한 일을 도와주면 단지 안쪽 길을 알려줄 수 있다.",
      personality: ["완고함", "성실함", "책임감"],
    },
    subareas: [
      { name: "공구함 아래 서랍", summary: "낡은 장갑과 철물 조각이 어지럽게 들어 있다." },
      { name: "비상 계단", summary: "단지 안쪽 동으로 이어지는 좁은 계단이다." },
    ],
    itemIds: ["woodPlank", "scrapMetal"],
  },
  {
    slug: "street_pharmacy",
    title: "약국 셔터 앞",
    summary: "반쯤 내려온 셔터와 깨진 진열창 사이로 약품 냄새와 먼지가 섞여 나온다.",
    resident: {
      name: "약품을 정리하는 자원봉사자",
      role: "응급 물자 정리 담당",
      summary: "남은 약품과 붕대를 사람들에게 나누기 위해 위험한 거리 끝에 머문다.",
      relationToPlayer: "무턱대고 믿지는 않지만, 질서를 지키는 사람에게는 협조적이다.",
      personality: ["차분함", "현실적", "인내심"],
    },
    subareas: [
      { name: "깨진 진열대", summary: "진통제 상자와 천 조각이 뒤섞인 채 바닥에 굴러다닌다." },
      { name: "골목 약품 창고", summary: "셔터 옆 좁은 골목 안쪽으로 잠긴 창고 문이 보인다." },
    ],
    itemIds: ["painRelief", "clothScrap"],
  },
];

function themeFor(sequence: number) {
  return FALLBACK_THEMES[(Math.max(1, sequence) - 1) % FALLBACK_THEMES.length];
}

function slugForLocation(locationId: string) {
  return locationId
    .replace(/^dyn_location_\d+_/, "")
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "generated_place";
}

export function buildFallbackAnchorDraft(input: PlannerInput): NarrativeAnchorDraft {
  const theme = themeFor(input.sequence);
  const sourceLocation = getRuntimeLocationDefinition(input.state, input.registry, input.sourceLocationId);
  const frontierLabel =
    input.registry.actions[input.sourceFrontierActionId]?.label
    ?? input.registry.choices[input.sourceFrontierActionId]?.label
    ?? "바깥으로 나아가기";

  return validateNarrativeAnchorDraft(NarrativeAnchorDraftSchema.parse({
    id: `dyn_anchor_${input.sequence}_${theme.slug}`,
    title: theme.title,
    summary: `${sourceLocation.name} 바깥에서 이어지는 새 생존 구역. ${theme.summary}`,
    introTitle: `${theme.title}에 닿다`,
    introParagraphs: [
      `${sourceLocation.name}에서 "${frontierLabel}"를 선택하자, 무너진 서울의 소음이 한 겹 더 가까워진다.`,
      `${theme.summary}`,
      `"여기까지 온 사람이 또 있군요." ${theme.resident.name}이 낮은 목소리로 말한다. "안쪽으로 갈 생각이면 먼저 주변을 살펴보는 게 좋습니다."`,
    ],
    prose: [
      `${sourceLocation.name}에서 "${frontierLabel}"를 선택하자, 익숙한 임시 안전지대의 냄새가 등 뒤로 밀려난다. 발밑의 유리 조각이 작게 울리고, 서울은 대답 대신 더 깊은 어둠을 내민다.`,
      `${theme.summary} 이곳은 단순한 배경이 아니라 누군가가 하루를 버틴 자리이고, 누군가는 끝내 돌아오지 못한 자리다.`,
      `"여기까지 온 사람이 또 있군요." ${theme.resident.name}이 낮은 목소리로 말한다. "안쪽으로 갈 생각이면 먼저 주변을 살펴보는 게 좋습니다."`,
    ].join("\n\n"),
    anchorSummary: `${theme.title}: ${theme.summary}`,
    originContext: `${sourceLocation.name}에서 "${frontierLabel}"를 따라 도달한 새 앵커 지역`,
    tone: "차갑고 현실적인 서울 생존극",
    tension: "medium",
    dramaticQuestion: `${theme.title} 안쪽에 남은 것은 물자인가, 사람인가, 아니면 더 큰 위험인가?`,
    worldFacts: [
      `${theme.title}은 ${sourceLocation.name} 바깥에서 새로 확인된 생존 구역이다.`,
      `${theme.resident.name}은 이 지역의 안쪽 사정을 조금 알고 있다.`,
    ],
    unresolvedQuestions: [
      `${theme.subareas[1]?.name ?? "안쪽 통로"} 너머에 무엇이 있는지 아직 모른다.`,
      `${theme.resident.name}이 끝까지 숨기고 있는 사정이 있다.`,
    ],
    directorNotes: ["fallback anchor draft", "최소 1개의 frontier_exit을 보장한다."],
    residents: [theme.resident],
    subareas: theme.subareas,
    openThreads: [`${theme.title} 안쪽의 미확인 통로`, `${theme.resident.name}의 부탁`],
    choices: [
      {
        id: `dyn_choice_${input.sequence}_${theme.slug}_inspect`,
        label: `${theme.subareas[0]?.name ?? "주변"} 살펴보기`,
        intent: "inspect_detail",
        summary: "눈에 띄는 흔적과 남은 물자를 차분히 확인한다.",
        subareaName: theme.subareas[0]?.name,
        itemCategory: "material",
        tags: [],
      },
      {
        id: `dyn_choice_${input.sequence}_${theme.slug}_talk`,
        label: `${theme.resident.name}에게 말 걸기`,
        intent: "approach_person",
        summary: "이곳에서 무슨 일이 있었는지 묻고, 필요한 거래나 부탁이 있는지 확인한다.",
        relatedPersonName: theme.resident.name,
        opensThread: `${theme.resident.name}의 부탁`,
        tags: [],
      },
      {
        id: `dyn_choice_${input.sequence}_${theme.slug}_frontier`,
        label: `${theme.subareas[1]?.name ?? "안쪽 통로"}로 나아가기`,
        intent: "frontier_exit",
        summary: "이 지역의 경계를 넘어 더 깊은 서울의 다른 장소로 향한다.",
        subareaName: theme.subareas[1]?.name,
        tags: [],
      },
    ],
    suggestedItemIds: theme.itemIds,
  }));
}

export function buildFallbackSceneDraft(request: StoryBeatPlannerInput): NarrativeSceneDraft {
  const slug = slugForLocation(request.anchorLocationId);
  const isTalk = request.trigger.tags.includes("intent:approach_person");
  const isScavenge = request.trigger.tags.includes("intent:scavenge") || request.trigger.tags.includes("intent:take_known_item");
  const title = isTalk
    ? `${request.anchorLocationName}의 낮은 대화`
    : isScavenge
      ? `${request.anchorLocationName}의 숨은 물자`
      : `${request.anchorLocationName}의 다음 장면`;

  const paragraphs = isTalk
    ? [
        `"갑자기 믿어 달라는 말은 하지 않겠습니다." 상대는 잠깐 주변을 살핀 뒤 목소리를 낮춘다. 말투는 차분하지만, 손가락은 주머니 속 무언가를 계속 만지작거린다.`,
        `"다만 이곳에서 오래 버티려면, 사람들이 어디로 사라졌는지 정도는 알아 둬야 합니다." 그 말이 끝나자마자 멀리서 얇은 금속음이 한 번 울린다. 대화는 정보 교환이 아니라, 서로가 서로를 위험에 끌어들일지 재는 저울처럼 느껴진다.`,
        `상대는 당신의 얼굴보다 가방과 손끝을 더 오래 본다. 배고픔, 피로, 물자 부족. 이 세계에서 진심은 말보다 먼저 그런 것들로 새어 나온다.`,
      ]
    : isScavenge
      ? [
          `손전등 없이도 보이는 가까운 틈 사이에 쓸 만한 물자가 남아 있다. 먼지는 오래 앉아 있었지만, 그 위로 최근에 긁힌 자국이 겹쳐 있다.`,
          `무리해서 더 뒤지면 소리가 커질 수 있다. 이곳에서 큰 소리는 언제나 부르는 대상이 있다. 사람일 수도 있고, 사람이 아니게 된 무언가일 수도 있다.`,
          `지금 챙길 수 있는 것만 정리하고 다음 판단을 해야 한다. 욕심을 내면 더 많은 것을 얻을 수도 있지만, 이 서울에서는 보통 무언가를 더 얻는 순간 더 큰 대가도 같이 따라온다.`,
        ]
      : [
          `${request.trigger.label} 뒤로, ${request.anchorLocationName}의 공기가 조금 달라진다. 방금 전까지는 배경처럼 보였던 벽의 얼룩과 바닥의 발자국이, 이제는 누군가 일부러 남긴 문장처럼 이어져 보인다.`,
          `멀리서 바람이 지나가며 비닐 조각을 흔든다. 그 작은 소리에도 몸이 먼저 반응한다는 사실이, 이곳에 오래 머물수록 사람이 얼마나 쉽게 짐승처럼 변해 가는지를 알려 준다.`,
          `아직 모든 것이 드러난 것은 아니다. 오히려 선택을 하나 할 때마다 이 지역은 더 많은 질문을 꺼내 놓는다. 지금 필요한 것은 정답이 아니라, 다음 위험을 감당할 방향이다. 멈춰 서면 조금 더 안전할지도 모르지만, 아무것도 고르지 않는 것 역시 이 세계에서는 하나의 선택이 된다.`,
        ];

  return validateNarrativeSceneDraft(NarrativeSceneDraftSchema.parse({
    id: `dyn_scene_draft_${request.sequence}_${slug}`,
    title,
    summary: `${request.anchorLocationName}에서 "${request.trigger.label}" 이후 이어지는 상황.`,
    prose: paragraphs.join("\n\n"),
    paragraphs,
    sceneGoal: `${request.trigger.label} 선택의 감정적 결과를 보여주고, 다음 결정을 더 어렵게 만든다.`,
    tone: request.storyTone || "차갑고 현실적인 서울 생존극",
    tension: request.currentTension,
    dramaticQuestion: request.dramaticQuestion || `${request.anchorLocationName}에서 다음으로 드러날 진짜 문제는 무엇인가?`,
    worldFacts: [
      `${request.anchorLocationName}에서 "${request.trigger.label}" 이후 상황이 변했다.`,
    ],
    unresolvedQuestions: [
      "방금 드러난 단서가 안전한 길인지, 함정인지 아직 확실하지 않다.",
    ],
    directorNotes: ["fallback scene draft", "현재 location 안에서만 이어진다."],
    subareas: [
      { name: "새로 드러난 틈", summary: "조심히 몸을 낮추면 지나갈 수 있을 만큼 열린 좁은 공간이다." },
    ],
    openThreads: ["이 지역 안쪽으로 이어지는 단서"],
    choices: [
      {
        id: `dyn_choice_${request.sequence}_${slug}_inspect`,
        label: "새로 드러난 흔적 살펴보기",
        intent: "inspect_detail",
        summary: "방금 드러난 흔적을 더 가까이 확인한다.",
        subareaName: "새로 드러난 틈",
        tags: [],
      },
      {
        id: `dyn_choice_${request.sequence}_${slug}_take`,
        label: "챙길 수 있는 물자 정리하기",
        intent: "take_known_item",
        summary: "지금 눈앞에서 안전하게 가져갈 수 있는 물자를 챙긴다.",
        itemCategory: isScavenge ? "material" : "food",
        tags: [],
      },
      {
        id: `dyn_choice_${request.sequence}_${slug}_frontier`,
        label: "새로 열린 길을 따라 다른 구역으로 나아가기",
        intent: "frontier_exit",
        summary: "현재 지역의 경계를 넘어 또 다른 앵커 지역으로 향한다.",
        subareaName: "새로 드러난 틈",
        tags: [],
      },
    ],
    suggestedItemIds: isScavenge ? ["woodPlank", "scrapMetal", "clothScrap"] : ["cannedFood", "waterBottle"],
  }));
}

export function buildTomorrowPlanFromDynamicWorld(state: { day: number; dynamicContent: { locations: Record<string, { id: string; name: string; summary: string }> } }): WorldPlan["tomorrow"] {
  const day = state.day + 1;
  const evolutions: DayEvolutionPlan[] = Object.values(state.dynamicContent.locations)
    .slice(0, 4)
    .map((location) => DayEvolutionPlanSchema.parse({
      id: `${location.id}_day${day}_evolution`,
      packageLocationId: location.id,
      day,
      summary: `${location.name}의 분위기가 하루 동안 조금 변한다.`,
      updates: [
        {
          type: "location_text",
          locationId: location.id,
          summary: `${location.summary} 시간이 지나며 사람들의 흔적과 위험 신호가 조금 더 선명해졌다.`,
        },
      ],
    }));

  return {
    day,
    evolutions,
    notes: evolutions.length > 0
      ? evolutions.map((evolution) => evolution.summary)
      : [`${day}일차 ${PHASES[0]} 기준, 아직 진화시킬 동적 지역이 없습니다.`],
  };
}
