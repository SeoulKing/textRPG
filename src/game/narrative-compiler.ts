import {
  DayEvolutionPlanSchema,
  GeneratedRegionPackageWithMetaSchema,
  GeneratedStoryBeatSchema,
  NarrativeAnchorMemorySchema,
  NarrativeCompilerResultSchema,
  type ChoiceDefinition,
  type ContentRegistry,
  type DayEvolutionPlan,
  type Effect,
  type GameState,
  type GeneratedRegionPackage,
  type GeneratedStoryBeat,
  type NarrativeAnchorDraft,
  type NarrativeAnchorMemory,
  type NarrativeCompilerResult,
  type NarrativeContinuationRequest,
  type NarrativeDraftChoice,
  type NarrativeSceneDraft,
} from "./schemas";
import {
  canonicalizeItemText,
  itemTextReference,
} from "./item-text";

type PlannerLikeInput = {
  state: GameState;
  registry: ContentRegistry;
  sourceLocationId: string;
  sourceFrontierActionId: string;
  sequence: number;
  recentLog: string[];
};

type CompileAnchorInput = {
  draft: NarrativeAnchorDraft;
  plannerInput: PlannerLikeInput;
  plannerSource: "llm" | "template";
};

type CompileSceneInput = {
  draft: NarrativeSceneDraft;
  request: NarrativeContinuationRequest;
  registry: ContentRegistry;
  plannerSource: "llm" | "template";
};

const CONTINUATION_TAG = "continuation";
const FRONTIER_TAG = "frontier";

const CATEGORY_ITEM_FALLBACKS = {
  food: ["cannedFood", "rawRice", "vegetables", "hotMeal"],
  drink: ["waterBottle"],
  medicine: ["painRelief"],
  trade: ["scrapBundle"],
  ticket: ["rationTicket"],
  material: ["woodPlank", "scrapMetal", "clothScrap"],
} as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function dynSlug(seed: string, fallback: string) {
  const slug = slugify(seed);
  return slug || fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function subareaIdsFromDraft(draft: { subareas?: Array<{ name: string }> }) {
  return uniqueStrings((draft.subareas ?? []).map((subarea) => `subarea:${dynSlug(subarea.name, "detail")}`));
}

function threadIdsFromDraft(draft: { openThreads?: string[] }) {
  return uniqueStrings((draft.openThreads ?? []).map((thread) => `thread:${dynSlug(thread, "thread")}`));
}

function firstText(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function normalizeChoiceLabel(choice: NarrativeDraftChoice, fallbackLabel: string) {
  const label = choice.label.trim();
  return label || fallbackLabel;
}

function inferItemIdFromHint(hint: string | undefined, registry: ContentRegistry) {
  const normalizedHint = (hint ?? "").trim().toLowerCase();
  if (!normalizedHint) {
    return null;
  }

  if (registry.items[normalizedHint]) {
    return normalizedHint;
  }

  const mappings: Array<[string[], string]> = [
    [["water", "생수", "물", "음료"], "waterBottle"],
    [["pain", "medicine", "약", "진통"], "painRelief"],
    [["rice", "쌀"], "rawRice"],
    [["vegetable", "vegetable", "채소"], "vegetables"],
    [["meal", "따뜻", "식사"], "hotMeal"],
    [["canned", "통조림", "캔", "식량"], "cannedFood"],
    [["ticket", "배식권"], "rationTicket"],
    [["trade", "잡화", "부품", "전자"], "scrapBundle"],
    [["wood", "판자", "목재"], "woodPlank"],
    [["metal", "고철", "금속", "철"], "scrapMetal"],
    [["cloth", "천", "옷감", "섬유"], "clothScrap"],
  ];

  for (const [tokens, itemId] of mappings) {
    if (tokens.some((token) => normalizedHint.includes(token))) {
      return registry.items[itemId] ? itemId : null;
    }
  }

  return null;
}

function itemIdsFromDraftChoice(choice: NarrativeDraftChoice, registry: ContentRegistry) {
  const ids: string[] = [];
  const hinted = inferItemIdFromHint(choice.itemHint, registry);
  if (hinted) {
    ids.push(hinted);
  }

  if (choice.itemCategory) {
    CATEGORY_ITEM_FALLBACKS[choice.itemCategory].forEach((itemId) => {
      if (registry.items[itemId]) {
        ids.push(itemId);
      }
    });
  }

  if ((choice.intent === "scavenge" || choice.intent === "take_known_item") && ids.length === 0) {
    CATEGORY_ITEM_FALLBACKS.material.forEach((itemId) => {
      if (registry.items[itemId]) {
        ids.push(itemId);
      }
    });
    CATEGORY_ITEM_FALLBACKS.food.forEach((itemId) => {
      if (registry.items[itemId]) {
        ids.push(itemId);
      }
    });
  }

  return uniqueStrings(ids);
}

function selectItemIdsFromDraft(
  draft: Pick<NarrativeAnchorDraft | NarrativeSceneDraft, "suggestedItemIds" | "choices">,
  registry: ContentRegistry,
  max = 3,
) {
  const selected: string[] = [];
  draft.suggestedItemIds.forEach((itemId) => {
    const direct = registry.items[itemId] ? itemId : inferItemIdFromHint(itemId, registry);
    if (direct) {
      selected.push(direct);
    }
  });
  draft.choices.forEach((choice) => {
    itemIdsFromDraftChoice(choice, registry).forEach((itemId) => selected.push(itemId));
  });
  return uniqueStrings(selected).slice(0, max);
}

function ensureFrontierDraftChoice(
  choices: NarrativeDraftChoice[],
  locationName: string,
  fallbackSeed: string,
) {
  if (choices.some((choice) => choice.intent === "frontier_exit")) {
    return choices;
  }

  const injected: NarrativeDraftChoice = {
    id: `${fallbackSeed}_frontier`,
    label: `${locationName}의 더 안쪽으로 나아간다`,
    intent: "frontier_exit",
    summary: `${locationName} 너머의 새로운 구역으로 이어지는 틈을 밀고 들어간다.`,
    outcomeHint: "이 길을 따라가면 완전히 새로운 장소로 넘어간다.",
    tags: [],
  };

  return [...choices, injected];

  return [
    ...choices,
    {
      id: `${fallbackSeed}_frontier`,
      label: `${locationName}의 더 안쪽으로 나아간다`,
      intent: "frontier_exit",
      summary: `${locationName} 너머의 새로운 구역으로 이어질 틈을 밀고 들어간다.`,
      outcomeHint: "이 길을 따라가면 완전히 새로운 장소로 넘어간다.",
      tags: [],
    },
  ];
}

function ensureRetreatDraftChoice(
  choices: NarrativeDraftChoice[],
  fallbackSeed: string,
) {
  if (choices.some((choice) => choice.intent === "retreat")) {
    return choices;
  }

  const injected: NarrativeDraftChoice = {
    id: `${fallbackSeed}_retreat`,
    label: "숨을 고르며 한걸음 물러선다",
    intent: "retreat",
    summary: "지금 장면에서 빠져나와 직전 안정된 상황으로 돌아간다.",
    outcomeHint: "위험을 더 키우지 않고 다시 상황을 정리한다.",
    tags: [],
  };

  return [...choices, injected];

  return [
    ...choices,
    {
      id: `${fallbackSeed}_retreat`,
      label: "숨을 고르며 한걸음 물러선다",
      intent: "retreat",
      summary: "지금 장면에서 빠져나와 직전 안정된 상황으로 돌아간다.",
      outcomeHint: "위험을 더 키우지 않고 다시 상황을 정리한다.",
      tags: [],
    },
  ];
}

function ensureFrontierDraftChoiceSafe(
  choices: NarrativeDraftChoice[],
  locationName: string,
  fallbackSeed: string,
) {
  if (choices.some((choice) => choice.intent === "frontier_exit")) {
    return choices;
  }

  const injected: NarrativeDraftChoice = {
    id: `${fallbackSeed}_frontier_safe`,
    label: `${locationName}의 더 안쪽으로 나아간다`,
    intent: "frontier_exit",
    summary: `${locationName} 너머의 새로운 구역으로 이어지는 틈을 밀고 들어간다.`,
    outcomeHint: "이 길을 따라가면 완전히 새로운 장소로 넘어간다.",
    tags: [],
  };
  return [...choices, injected];
}

function ensureRetreatDraftChoiceSafe(
  choices: NarrativeDraftChoice[],
  fallbackSeed: string,
) {
  if (choices.some((choice) => choice.intent === "retreat")) {
    return choices;
  }

  const injected: NarrativeDraftChoice = {
    id: `${fallbackSeed}_retreat_safe`,
    label: "숨을 고르며 한걸음 물러선다",
    intent: "retreat",
    summary: "지금 장면에서 빠져나와 직전 안정된 상황으로 돌아간다.",
    outcomeHint: "위험을 더 키우지 않고 다시 상황을 정리한다.",
    tags: [],
  };
  return [...choices, injected];
}

function buildChoiceTags(choice: NarrativeDraftChoice, selectedItemId: string | null) {
  const tags = new Set<string>(["dynamic", `intent:${choice.intent}`]);
  choice.tags.forEach((tag) => tags.add(tag));
  if (choice.intent !== "frontier_exit" && choice.intent !== "retreat") {
    tags.add(CONTINUATION_TAG);
  }
  if (choice.intent === "frontier_exit") {
    tags.add(FRONTIER_TAG);
  }
  if (choice.subareaName) {
    tags.add(`subarea:${dynSlug(choice.subareaName, "detail")}`);
  }
  if (choice.opensThread) {
    tags.add(`thread:${dynSlug(choice.opensThread, "thread")}`);
  }
  if (selectedItemId) {
    tags.add(`catalog_item:${selectedItemId}`);
  }
  return Array.from(tags);
}

function defineChoice(
  choice: Pick<ChoiceDefinition, "id" | "label" | "outcomeHint"> & Partial<Omit<ChoiceDefinition, "id" | "label" | "outcomeHint">>,
): ChoiceDefinition {
  return {
    presentationMode: "when_conditions_met",
    conditions: [],
    effects: [],
    failureEffects: [],
    hidden: false,
    tags: [],
    ...choice,
  };
}

function fallbackOutcomeHint(choice: NarrativeDraftChoice) {
  return firstText(choice.outcomeHint, choice.storyPromise, choice.summary, "상황을 앞으로 밀어낸다.");
}

function paragraphsFromDirectorText(prose: string, paragraphs: string[]) {
  const fromProse = prose
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return fromProse.length > 0 ? fromProse.slice(0, 5) : paragraphs;
}

function buildAnchorMemory(
  locationId: string,
  title: string,
  anchorSummary: string,
  originContext: string,
  subareaIds: string[],
  openThreadIds: string[],
  frontierExitIds: string[],
  source: "llm" | "template",
  director: {
    worldFacts?: string[];
    unresolvedQuestions?: string[];
    tone?: string;
    tension?: "low" | "medium" | "high";
    dramaticQuestion?: string;
    lastDirectorSummary?: string;
  } = {},
) {
  return NarrativeAnchorMemorySchema.parse({
    locationId,
    title,
    anchorSummary,
    originContext,
    subareaIds,
    openThreadIds,
    frontierExitIds,
    worldFacts: director.worldFacts ?? [],
    unresolvedQuestions: director.unresolvedQuestions ?? [],
    tone: director.tone ?? "",
    tension: director.tension ?? "medium",
    dramaticQuestion: director.dramaticQuestion ?? "",
    lastDirectorSummary: director.lastDirectorSummary ?? "",
    source,
  });
}

function buildCompilerResult(
  kind: "anchor" | "scene",
  summary: string,
  compiledSceneId: string,
  selectedItemIds: string[],
  frontierExitIds: string[],
  notes: string[] = [],
) {
  return NarrativeCompilerResultSchema.parse({
    kind,
    summary,
    notes,
    selectedItemIds,
    frontierExitIds,
    compiledSceneId,
  });
}

function anchorTomorrowEvolution(locationId: string, summary: string, day: number): DayEvolutionPlan {
  return DayEvolutionPlanSchema.parse({
    id: `${locationId}_day${day + 1}_evolution`,
    packageLocationId: locationId,
    day: day + 1,
    summary: `${summary} 하루가 지나며 분위기와 흔적이 조금 더 또렷하게 바뀔 예정이다.`,
    updates: [
      {
        type: "location_text",
        locationId,
        summary: `${summary} 밤사이 지나간 흔적이 더 선명해져, 이곳이 한 번 스쳐 지나갈 장소가 아니라는 느낌을 남긴다.`,
      },
      {
        type: "set_flag",
        flag: `${locationId}_day${day + 1}_settled`,
      },
    ],
  });
}

function frontierChoiceIds(choiceDefs: Record<string, ChoiceDefinition>) {
  return Object.values(choiceDefs)
    .filter((choice) => choice.tags?.includes(FRONTIER_TAG))
    .map((choice) => choice.id);
}

function buildAnchorOriginContext(input: PlannerLikeInput) {
  const frontierLabel =
    input.registry.actions[input.sourceFrontierActionId]?.label
    ?? input.registry.choices[input.sourceFrontierActionId]?.label
    ?? input.sourceFrontierActionId;
  const sourceName = input.registry.locations[input.sourceLocationId]?.name ?? input.sourceLocationId;
  return `${sourceName}에서 "${frontierLabel}"를 선택한 뒤 이어진 새 앵커 지역`;
}

export function compileNarrativeAnchorDraft({
  draft,
  plannerInput,
  plannerSource,
}: CompileAnchorInput): GeneratedRegionPackage {
  const slug = dynSlug(draft.id, `anchor_${plannerInput.sequence}`);
  const locationId = `dyn_location_${plannerInput.sequence}_${slug}`;
  const introSceneId = `dyn_scene_${plannerInput.sequence}_${slug}_intro`;
  const safeChoices = ensureFrontierDraftChoiceSafe(
    ensureRetreatDraftChoiceSafe([...draft.choices], `${locationId}_choice`),
    draft.title,
    `${locationId}_choice`,
  );
  const selectedItemIds = selectItemIdsFromDraft(draft, plannerInput.registry);
  const choiceDefs = Object.fromEntries(
    safeChoices.map((choice, index) => {
      const choiceId = choice.id?.startsWith("dyn_")
        ? choice.id
        : `dyn_choice_${plannerInput.sequence}_${slug}_${choice.intent}_${index + 1}`;
      const selectedItemId = itemIdsFromDraftChoice(choice, plannerInput.registry)[0] ?? selectedItemIds[0] ?? null;
      const tags = buildChoiceTags(choice, selectedItemId);
      const nextSceneId = choice.intent === "retreat" ? plannerInput.state.sceneId : undefined;
      const effects: Effect[] = choice.intent === "retreat"
        ? [{ type: "travel", locationId: plannerInput.sourceLocationId }]
        : [];

      return [choiceId, defineChoice({
        id: choiceId,
        label: normalizeChoiceLabel(
          {
            ...choice,
            label: canonicalizeItemText(choice.label, plannerInput.registry),
          },
          choice.intent === "frontier_exit"
            ? "더 안쪽으로 나아간다"
            : "상황을 더 밀어본다",
        ),
        outcomeHint: canonicalizeItemText(
          fallbackOutcomeHint(choice),
          plannerInput.registry,
        ),
        tags,
        riskHint: choice.risk,
        nextSceneId,
        effects,
      })];
    }),
  );

  const residentDefs = Object.fromEntries(
    draft.residents.slice(0, 2).map((resident, index) => {
      const personId = `dyn_person_${plannerInput.sequence}_${slug}_${index + 1}`;
      return [personId, {
        id: personId,
        name: resident.name,
        role: resident.role,
        personality: resident.personality,
        relationToPlayer: resident.relationToPlayer,
        inventoryItemIds: [],
        locationId,
        summary: resident.summary,
      }];
    }),
  );

  const subareaIds = subareaIdsFromDraft(draft);
  const openThreadIds = threadIdsFromDraft(draft);
  const frontierExitIds = frontierChoiceIds(choiceDefs);
  const originContext = firstText(draft.originContext, buildAnchorOriginContext(plannerInput));

  const pkg = GeneratedRegionPackageWithMetaSchema.parse({
    locationId,
    sourceLocationId: plannerInput.sourceLocationId,
    sourceFrontierActionId: plannerInput.sourceFrontierActionId,
    frontierActionId: frontierExitIds[0] ?? Object.keys(choiceDefs)[0],
    title: draft.title,
    summary: draft.summary,
    entryEventId: null,
    registry: {
      locations: {
        [locationId]: {
          id: locationId,
          name: draft.title,
          risk: plannerInput.registry.locations[plannerInput.sourceLocationId]?.risk === "high" ? "high" : "medium",
          imagePath: null,
          summary: draft.summary,
          tags: ["dynamic", "generated", "anchor-region"],
          traits: [plannerSource === "llm" ? "planner:llm" : "planner:template"],
          obtainableItemIds: selectedItemIds,
          residentIds: Object.keys(residentDefs),
          neighbors: [plannerInput.sourceLocationId],
          interactionChoices: [],
          eventIds: [],
          links: {
            [plannerInput.sourceLocationId]: {
              note: `${plannerInput.registry.locations[plannerInput.sourceLocationId]?.name ?? plannerInput.sourceLocationId}(으)로 돌아갈 수 있다.`,
            },
          },
          stockNodes: [],
        },
      },
      items: {},
      people: residentDefs,
      quests: {},
      skills: {},
      actions: {},
      choices: choiceDefs,
      events: {},
      scenes: {
          [introSceneId]: {
            id: introSceneId,
            locationId,
            title: canonicalizeItemText(
              draft.introTitle,
              plannerInput.registry,
            ),
            paragraphs: paragraphsFromDirectorText(
              draft.prose,
              draft.introParagraphs,
            ).map((paragraph) =>
              canonicalizeItemText(paragraph, plannerInput.registry),
            ),
            choiceIds: Object.keys(choiceDefs),
            conditions: [],
            suppressLocationInteractions: true,
        },
      },
    },
    tomorrowEvolution: anchorTomorrowEvolution(locationId, draft.summary, plannerInput.state.day),
    anchorMemory: buildAnchorMemory(
      locationId,
      draft.title,
      draft.anchorSummary,
      originContext,
      subareaIds,
      openThreadIds,
      frontierExitIds,
      plannerSource,
      {
        worldFacts: draft.worldFacts,
        unresolvedQuestions: uniqueStrings([...draft.unresolvedQuestions, ...draft.openThreads]),
        tone: draft.tone,
        tension: draft.tension,
        dramaticQuestion: draft.dramaticQuestion,
        lastDirectorSummary: draft.summary,
      },
    ),
    compiler: buildCompilerResult(
      "anchor",
      `${draft.title} 앵커 지역을 만들고 입장 씬과 연결 선택지를 컴파일했다.`,
      introSceneId,
      selectedItemIds,
      frontierExitIds,
      [
        frontierExitIds.length > 0
          ? "앵커 지역에 외부 확장 선택지를 최소 한 개 이상 보장했다."
          : "외부 확장 선택지를 자동 보강했다.",
      ],
    ),
  });

  return pkg as GeneratedRegionPackage;
}

function selectedItemIdFromTrigger(tags: string[], registry: ContentRegistry) {
  const direct = tags.find((tag) => tag.startsWith("catalog_item:"))?.slice("catalog_item:".length);
  if (direct && registry.items[direct]) {
    return direct;
  }
  return null;
}

function triggerIntent(tags: string[]) {
  return tags.find((tag) => tag.startsWith("intent:"))?.slice("intent:".length) ?? "";
}

function sceneImmediateEffects(
  draft: NarrativeSceneDraft,
  request: NarrativeContinuationRequest,
  registry: ContentRegistry,
  sceneSlug: string,
) {
  const effects: Effect[] = [];
  const notes: string[] = [];
  const triggerItemId = selectedItemIdFromTrigger(request.trigger.tags, registry);
  const intent = triggerIntent(request.trigger.tags);

  if ((intent === "scavenge" || intent === "take_known_item") && triggerItemId) {
    effects.push({ type: "add_item", itemId: triggerItemId, amount: 1 });
    effects.push({
      type: "log",
      message: `${request.anchorLocationName}에서 ${itemTextReference(triggerItemId, "을를")} 챙겼다.`,
    });
    notes.push(`선택 의도에 맞춰 ${triggerItemId} 1개를 즉시 지급했다.`);
  }

  if (intent === "rest_briefly") {
    effects.push({ type: "change_stat", stat: "mind", value: 1 });
    effects.push({ type: "log", message: `${request.anchorLocationName}에서 잠깐 숨을 고르며 마음을 추슬렀다.` });
    notes.push("짧은 휴식 선택에 따라 정신력을 1 회복했다.");
  }

  if (intent === "unlock_subarea") {
    const subareaFlag = `dyn_flag_${sceneSlug}_subarea_opened`;
    effects.push({ type: "set_flag", flag: subareaFlag });
    notes.push("새 세부 구역을 연 플래그를 기록했다.");
  }

  if (intent === "accept_task") {
    const threadFlag = `dyn_flag_${sceneSlug}_task_accepted`;
    effects.push({ type: "set_flag", flag: threadFlag });
    effects.push({ type: "log", message: `${request.anchorLocationName}에서 새로운 부탁을 받아들였다.` });
    notes.push("수락한 부탁을 플래그로 기록했다.");
  }

  if (intent === "trade") {
    effects.push({ type: "change_money", amount: 300 });
    effects.push({ type: "log", message: `${request.anchorLocationName}에서 작은 거래를 성사시켰다.` });
    notes.push("거래 선택에 따라 소량의 자금을 반영했다.");
  }

  if (intent === "approach_person") {
    effects.push({ type: "log", message: `${request.anchorLocationName}에서 누군가와 거리를 좁히며 다음 이야기를 열었다.` });
  }

  if (intent === "inspect_detail") {
    effects.push({ type: "log", message: `${request.anchorLocationName}의 세부 흔적을 더 가까이 살폈다.` });
  }

  if (effects.length === 0) {
    effects.push({ type: "log", message: `${request.anchorLocationName}에서 상황을 한 걸음 더 밀어 보았다.` });
  }

  return { effects, notes };
}

export function compileNarrativeSceneDraft({
  draft,
  request,
  registry,
  plannerSource,
}: CompileSceneInput): GeneratedStoryBeat {
  const slug = dynSlug(draft.id, `scene_${request.sequence}`);
  const sceneId = `dyn_scene_${request.sequence}_${slug}_detail`;
  const safeChoices = ensureFrontierDraftChoiceSafe(
    ensureRetreatDraftChoiceSafe([...draft.choices], `${sceneId}_choice`),
    request.anchorLocationName,
    `${sceneId}_choice`,
  );
  const selectedItemIds = selectItemIdsFromDraft(draft, registry);
  const choiceDefs = Object.fromEntries(
    safeChoices.map((choice, index) => {
      const choiceId = choice.id?.startsWith("dyn_")
        ? choice.id
        : `dyn_choice_${request.sequence}_${slug}_${choice.intent}_${index + 1}`;
      const selectedItemId = itemIdsFromDraftChoice(choice, registry)[0] ?? selectedItemIds[0] ?? null;
      const tags = buildChoiceTags(choice, selectedItemId);
      return [choiceId, defineChoice({
        id: choiceId,
        label: normalizeChoiceLabel(
          {
            ...choice,
            label: canonicalizeItemText(choice.label, registry),
          },
          choice.intent === "frontier_exit"
            ? "새 길로 발을 들인다"
            : "다음 상황을 이어간다",
        ),
        outcomeHint: canonicalizeItemText(
          fallbackOutcomeHint(choice),
          registry,
        ),
        tags,
        riskHint: choice.risk,
        nextSceneId: choice.intent === "retreat" ? request.sourceSceneId : undefined,
      })];
    }),
  );

  const { effects, notes } = sceneImmediateEffects(draft, request, registry, slug);
  const frontierExitIds = frontierChoiceIds(choiceDefs);
  const subareaIds = subareaIdsFromDraft(draft);
  const openThreadIds = threadIdsFromDraft(draft);

  return GeneratedStoryBeatSchema.parse({
    id: `dyn_beat_${request.sequence}_${slug}`,
    locationId: request.locationId,
    anchorLocationId: request.anchorLocationId,
    sourceSceneId: request.sourceSceneId,
    sourceTriggerId: request.trigger.id,
    summary: draft.summary,
    patch: {
      sceneId,
      immediateEffects: effects,
      registry: {
        locations: {},
        items: {},
        people: {},
        quests: {},
        skills: {},
        actions: {},
        choices: choiceDefs,
        events: {},
        scenes: {
          [sceneId]: {
            id: sceneId,
            locationId: request.locationId,
            title: canonicalizeItemText(draft.title, registry),
            paragraphs: paragraphsFromDirectorText(
              draft.prose,
              draft.paragraphs,
            ).map((paragraph) =>
              canonicalizeItemText(paragraph, registry),
            ),
            choiceIds: Object.keys(choiceDefs),
            conditions: [],
            suppressLocationInteractions: true,
          },
        },
      },
    },
    anchorMemory: buildAnchorMemory(
      request.anchorLocationId,
      request.anchorLocationName,
      request.anchorSummary,
      `scene:${request.sourceSceneId}`,
      uniqueStrings([...request.localSubareaIds, ...subareaIds]),
      uniqueStrings([...request.localOpenThreadIds, ...openThreadIds]),
      frontierExitIds,
      plannerSource,
      {
        worldFacts: uniqueStrings([...request.knownWorldFacts, ...draft.worldFacts]),
        unresolvedQuestions: uniqueStrings([
          ...request.unresolvedQuestions,
          ...draft.unresolvedQuestions,
          ...draft.openThreads,
        ]),
        tone: draft.tone || request.storyTone,
        tension: draft.tension,
        dramaticQuestion: draft.dramaticQuestion || request.dramaticQuestion,
        lastDirectorSummary: draft.summary,
      },
    ),
    compiler: buildCompilerResult(
      "scene",
      `${request.anchorLocationName} 안에서 다음 씬을 만들고 안정 선택지와 확장 선택지를 함께 유지했다.`,
      sceneId,
      selectedItemIds,
      frontierExitIds,
      notes,
    ),
  });
}
