import type { ContentRegistry } from "./schemas/content";

export const RETIRED_ACTION_IDS = new Set(["forage_forest_food", "cook_greens_soup", "cook_forest_stew"]);

/** Apply explicit action removals without rewriting archived content versions. */
export function omitRetiredActions(registry: ContentRegistry): ContentRegistry {
  const keep = (id: string) => !RETIRED_ACTION_IDS.has(id);
  return {
    ...registry,
    actions: Object.fromEntries(Object.entries(registry.actions).filter(([id]) => keep(id))),
    choices: Object.fromEntries(Object.entries(registry.choices).filter(([id]) => keep(id))),
    locations: Object.fromEntries(Object.entries(registry.locations).map(([id, location]) => [id, {
      ...location, interactionChoices: location.interactionChoices.filter(action => keep(action.id)),
    }])),
    scenes: Object.fromEntries(Object.entries(registry.scenes).map(([id, scene]) => [id, {
      ...scene, choiceIds: scene.choiceIds.filter(keep),
    }])),
  };
}
