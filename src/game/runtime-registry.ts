import { worldRegistry } from "./data/registry";
import type {
  ContentRegistry,
  DynamicWorldRegistry,
  FrontierSlot,
  GameState,
  LinkDefinition,
  LocationDefinition,
  QuestDefinition,
} from "./schemas";

export const emptyDynamicWorldRegistry: DynamicWorldRegistry = {
  locations: {},
  items: {},
  people: {},
  quests: {},
  skills: {},
  actions: {},
  choices: {},
  events: {},
  scenes: {},
};

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function mergeDynamicWorldRegistry(
  base: DynamicWorldRegistry,
  addition: DynamicWorldRegistry,
): DynamicWorldRegistry {
  return {
    locations: { ...base.locations, ...addition.locations },
    items: { ...base.items, ...addition.items },
    people: { ...base.people, ...addition.people },
    quests: { ...base.quests, ...addition.quests },
    skills: { ...base.skills, ...addition.skills },
    actions: { ...base.actions, ...addition.actions },
    choices: { ...base.choices, ...addition.choices },
    events: { ...base.events, ...addition.events },
    scenes: { ...base.scenes, ...addition.scenes },
  };
}

export function buildRuntimeRegistry(
  stateOrDynamic?: Pick<GameState, "dynamicContent"> | DynamicWorldRegistry | null,
): ContentRegistry {
  const dynamicContent =
    !stateOrDynamic
      ? emptyDynamicWorldRegistry
      : "dynamicContent" in stateOrDynamic
        ? stateOrDynamic.dynamicContent
        : stateOrDynamic;

  return {
    items: { ...worldRegistry.items, ...dynamicContent.items },
    people: { ...worldRegistry.people, ...dynamicContent.people },
    locations: { ...worldRegistry.locations, ...dynamicContent.locations },
    quests: { ...worldRegistry.quests, ...dynamicContent.quests },
    skills: { ...worldRegistry.skills, ...dynamicContent.skills },
    actions: { ...worldRegistry.actions, ...dynamicContent.actions },
    choices: { ...worldRegistry.choices, ...dynamicContent.choices },
    events: { ...worldRegistry.events, ...dynamicContent.events },
    scenes: { ...worldRegistry.scenes, ...dynamicContent.scenes },
  };
}

function expandedFrontierSlots(state: Pick<GameState, "frontierState"> | null | undefined, locationId: string) {
  if (!state) {
    return [];
  }
  return Object.values(state.frontierState.slots).filter(
    (slot) => slot.sourceLocationId === locationId && slot.generatedLocationId && slot.status === "expanded",
  );
}

function frontierLinksFromSlots(slots: FrontierSlot[]) {
  return Object.fromEntries(
    slots.flatMap((slot) =>
      slot.generatedLocationId
        ? [[
            slot.generatedLocationId,
            {
              note: slot.note || "새롭게 열린 길이다.",
            } satisfies LinkDefinition,
          ]]
        : [],
    ),
  );
}

export function getRuntimeLocationDefinition(
  state: Pick<GameState, "frontierState"> | null | undefined,
  registry: ContentRegistry,
  locationId: string,
): LocationDefinition {
  const location = registry.locations[locationId];
  if (!location) {
    throw new Error(`Unknown location '${locationId}'.`);
  }

  const slots = expandedFrontierSlots(state, locationId);
  const extraLinks = frontierLinksFromSlots(slots);
  const extraNeighbors = Object.keys(extraLinks);

  return {
    ...location,
    neighbors: dedupeStrings([...location.neighbors, ...extraNeighbors]),
    links: { ...location.links, ...extraLinks },
  };
}

export function getRuntimeLinkedLocationIds(
  state: Pick<GameState, "frontierState"> | null | undefined,
  registry: ContentRegistry,
  locationId: string,
) {
  return Object.keys(getRuntimeLocationDefinition(state, registry, locationId).links);
}

export function getQuestDefinitions(registry: ContentRegistry): QuestDefinition[] {
  return Object.values(registry.quests) as QuestDefinition[];
}
