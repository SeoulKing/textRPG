import { validateRegistry } from "./data/registry";
import { normalizeDynamicLocationNames } from "./dynamic-location-naming";
import { buildRuntimeRegistry, mergeDynamicWorldRegistry } from "./runtime-registry";
import type {
  ContentRegistry,
  DynamicWorldRegistry,
  Effect,
  GameState,
  GeneratedRegionPackage,
  GeneratedStoryBeat,
  NarrativeAnchorDraft,
  NarrativeDraftChoice,
  NarrativeSceneDraft,
} from "./schemas";
import {
  GeneratedRegionPackageWithMetaSchema,
  GeneratedStoryBeatSchema,
  NarrativeAnchorDraftSchema,
  NarrativeSceneDraftSchema,
} from "./schemas";
import type { PlannerSource, StoryBeatPlannerInput } from "./narrative-planner-types";

const DYN_PREFIX = "dyn_";
const MAX_STAT_DELTA = 2;
const MAX_ITEM_AMOUNT = 3;
const MAX_MONEY_DELTA = 1200;
const MAX_STOCK_QUANTITY = 4;
const FORBIDDEN_GENERATED_EFFECTS = new Set(["set_scene", "set_random_scene", "advance_to_daybreak", "advance_time"]);

function startsDyn(id: string) {
  return id.startsWith(DYN_PREFIX);
}

function ensureDynId(id: string, source: string) {
  if (!startsDyn(id)) {
    throw new Error(`${source} must use a dyn_* id. Received '${id}'.`);
  }
}

function frontierChoice(seed: string, locationName: string): NarrativeDraftChoice {
  return {
    id: `${seed}_frontier_exit`,
    label: `${locationName} 바깥의 다른 길로 나아가기`,
    intent: "frontier_exit",
    summary: `${locationName}의 경계를 넘어 아직 확인하지 못한 서울의 다른 공간으로 이동한다.`,
    outcomeHint: "새로운 앵커 지역이 생성되고 지도에 편입된다.",
    tags: [],
  };
}

function keepChoiceBounds(choices: NarrativeDraftChoice[], required: NarrativeDraftChoice) {
  const next = choices.slice(0, 4);
  if (next.some((choice) => choice.intent === required.intent)) {
    return next;
  }
  if (next.length >= 4) {
    return [...next.slice(0, 3), required];
  }
  return [...next, required];
}

export function validateNarrativeAnchorDraft(raw: unknown): NarrativeAnchorDraft {
  const preliminary = raw as Partial<NarrativeAnchorDraft>;
  const choices = Array.isArray(preliminary.choices) ? preliminary.choices.slice(0, 4) : [];
  const parsed = NarrativeAnchorDraftSchema.parse({ ...preliminary, choices });
  return NarrativeAnchorDraftSchema.parse({
    ...parsed,
    choices: keepChoiceBounds(parsed.choices, frontierChoice(parsed.id, parsed.title)),
  });
}

export function validateNarrativeSceneDraft(raw: unknown): NarrativeSceneDraft {
  const preliminary = raw as Partial<NarrativeSceneDraft>;
  const choices = Array.isArray(preliminary.choices) ? preliminary.choices.slice(0, 4) : [];
  const parsed = NarrativeSceneDraftSchema.parse({ ...preliminary, choices });
  return NarrativeSceneDraftSchema.parse({
    ...parsed,
    choices: keepChoiceBounds(parsed.choices, frontierChoice(parsed.id, parsed.title)),
  });
}

export function markDraftPlannerSource<T extends { id: string }>(draft: T, source: PlannerSource): T {
  const suffix = source === "llm" ? "_llm" : "_template";
  if (draft.id.endsWith(suffix)) {
    return draft;
  }
  return {
    ...draft,
    id: `${draft.id}${suffix}`,
  };
}

export function plannerSourceFromDraftId(draftId: string): PlannerSource {
  return draftId.endsWith("_template") ? "template" : "llm";
}

function validateGeneratedEffect(effect: Effect, source: string) {
  if (FORBIDDEN_GENERATED_EFFECTS.has(effect.type)) {
    throw new Error(`${source} may not use generated effect '${effect.type}'.`);
  }

  if (effect.type === "change_stat" && Math.abs(effect.value) > MAX_STAT_DELTA) {
    throw new Error(`${source} stat delta is too large: ${effect.value}.`);
  }

  if ((effect.type === "add_item" || effect.type === "remove_item") && effect.amount > MAX_ITEM_AMOUNT) {
    throw new Error(`${source} item amount is too large: ${effect.amount}.`);
  }

  if (effect.type === "change_money" && Math.abs(effect.amount) > MAX_MONEY_DELTA) {
    throw new Error(`${source} money delta is too large: ${effect.amount}.`);
  }

  if ((effect.type === "set_flag" || effect.type === "clear_flag") && !startsDyn(effect.flag)) {
    throw new Error(`${source} generated flags must be dyn_*: ${effect.flag}.`);
  }
}

function validateDynamicRegistryIds(dynamic: DynamicWorldRegistry) {
  Object.keys(dynamic.locations).forEach((id) => ensureDynId(id, "location"));
  Object.keys(dynamic.items).forEach((id) => ensureDynId(id, "item"));
  Object.keys(dynamic.people).forEach((id) => ensureDynId(id, "person"));
  Object.keys(dynamic.quests).forEach((id) => ensureDynId(id, "quest"));
  Object.keys(dynamic.skills).forEach((id) => ensureDynId(id, "skill"));
  Object.keys(dynamic.actions).forEach((id) => ensureDynId(id, "action"));
  Object.keys(dynamic.choices).forEach((id) => ensureDynId(id, "choice"));
  Object.keys(dynamic.events).forEach((id) => ensureDynId(id, "event"));
  Object.keys(dynamic.scenes).forEach((id) => ensureDynId(id, "scene"));

  Object.values(dynamic.actions).forEach((action) => {
    action.effects.forEach((effect) => validateGeneratedEffect(effect, `action:${action.id}`));
    action.failureEffects.forEach((effect) => validateGeneratedEffect(effect, `action:${action.id}:failure`));
  });
  Object.values(dynamic.choices).forEach((choice) => {
    choice.effects.forEach((effect) => validateGeneratedEffect(effect, `choice:${choice.id}`));
    choice.failureEffects.forEach((effect) => validateGeneratedEffect(effect, `choice:${choice.id}:failure`));
  });
  Object.values(dynamic.locations).forEach((location) => {
    location.stockNodes.forEach((node) => {
      if (node.money > MAX_MONEY_DELTA) {
        throw new Error(`stock node '${node.id}' money is too large: ${node.money}.`);
      }
      node.items.forEach((item) => {
        if (item.initialQuantity > MAX_STOCK_QUANTITY) {
          throw new Error(`stock node '${node.id}' quantity is too large: ${item.initialQuantity}.`);
        }
      });
    });
  });
}

function validateFrontierChoiceExists(registry: DynamicWorldRegistry, sceneId: string, source: string) {
  const scene = registry.scenes[sceneId];
  if (!scene) {
    throw new Error(`${source} compiled scene '${sceneId}' is missing.`);
  }
  const hasFrontier = scene.choiceIds.some((choiceId) => registry.choices[choiceId]?.tags?.includes("frontier"));
  if (!hasFrontier) {
    throw new Error(`${source} must include at least one reachable frontier choice.`);
  }
}

function validateMergedRegistry(state: GameState, patch: DynamicWorldRegistry, registry?: ContentRegistry) {
  const mergedDynamic = mergeDynamicWorldRegistry(state.dynamicContent, patch);
  const runtime = registry
    ? mergeDynamicRuntimeRegistry(registry, patch)
    : buildRuntimeRegistry({ dynamicContent: mergedDynamic });
  validateRegistry(runtime);
}

function mergeDynamicRuntimeRegistry(registry: ContentRegistry, patch: DynamicWorldRegistry): ContentRegistry {
  return {
    items: { ...registry.items, ...patch.items },
    people: { ...registry.people, ...patch.people },
    locations: { ...registry.locations, ...patch.locations },
    quests: { ...registry.quests, ...patch.quests },
    skills: { ...registry.skills, ...patch.skills },
    actions: { ...registry.actions, ...patch.actions },
    choices: { ...registry.choices, ...patch.choices },
    events: { ...registry.events, ...patch.events },
    scenes: { ...registry.scenes, ...patch.scenes },
  };
}

function normalizePackageLocationNames(state: GameState, pkg: GeneratedRegionPackage) {
  const merged = mergeDynamicWorldRegistry(state.dynamicContent, pkg.registry);
  const normalized = normalizeDynamicLocationNames(merged);
  const registry = structuredClone(pkg.registry);
  Object.keys(registry.locations).forEach((locationId) => {
    registry.locations[locationId] = normalized.locations[locationId] ?? registry.locations[locationId];
  });
  const mainLocation = registry.locations[pkg.locationId];
  return GeneratedRegionPackageWithMetaSchema.parse({
    ...pkg,
    title: mainLocation?.name ?? pkg.title,
    summary: mainLocation?.summary ?? pkg.summary,
    registry,
  });
}

export function validateCompiledRegionPackage(
  state: GameState,
  registry: ContentRegistry,
  rawPackage: GeneratedRegionPackage,
): GeneratedRegionPackage {
  const parsed = normalizePackageLocationNames(state, GeneratedRegionPackageWithMetaSchema.parse(rawPackage));
  ensureDynId(parsed.locationId, "region package location");
  validateDynamicRegistryIds(parsed.registry);
  validateFrontierChoiceExists(parsed.registry, parsed.compiler?.compiledSceneId ?? Object.keys(parsed.registry.scenes)[0] ?? "", "region package");
  validateMergedRegistry(state, parsed.registry, registry);
  return parsed;
}

export function validateCompiledStoryBeat(
  request: StoryBeatPlannerInput,
  rawBeat: GeneratedStoryBeat,
): GeneratedStoryBeat {
  const parsed = GeneratedStoryBeatSchema.parse(rawBeat);
  ensureDynId(parsed.id, "story beat");
  if (parsed.locationId !== request.locationId || parsed.anchorLocationId !== request.anchorLocationId) {
    throw new Error("story beat must stay inside the current anchor location.");
  }
  validateDynamicRegistryIds(parsed.patch.registry);
  parsed.patch.immediateEffects.forEach((effect) => validateGeneratedEffect(effect, `beat:${parsed.id}`));
  validateFrontierChoiceExists(parsed.patch.registry, parsed.patch.sceneId, "story beat");
  validateMergedRegistry(request.state, parsed.patch.registry, request.registry);
  return parsed;
}
