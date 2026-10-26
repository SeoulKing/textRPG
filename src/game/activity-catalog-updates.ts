import { planActivity } from "./activity";
import type { ActionDefinition, ChoiceDefinition, ContentRegistry } from "./schemas";
import type { ContentStudioDocument } from "./content-studio";

function withDefault<T extends ActionDefinition | ChoiceDefinition>(definition: T, baseline: ContentRegistry): T {
  const original = baseline.choices[definition.id] ?? baseline.actions[definition.id];
  if (definition.activity !== undefined || !original?.activity || !definition.effects.some(e => e.type === "advance_time")) return definition;
  const migrated = { ...definition, activity: { ...original.activity } };
  try { planActivity(migrated); } catch { return definition; }
  return migrated;
}
/** Migrate only absent execution metadata, preserving Studio quantities, time and opt-outs. */
export function withActivityCatalogDefaults(registry: ContentRegistry, baseline: ContentRegistry): ContentRegistry {
  const additions = Object.values(baseline.actions).filter(action => action.activity?.kind === "rest" && !registry.actions[action.id] && action.locationIds.some(id => registry.locations[id]));
  const actions = Object.fromEntries([...Object.entries(registry.actions).map(([id, action]) => [id, withDefault(action, baseline)]), ...additions.map(action => [action.id, structuredClone(action)])]);
  return { ...registry, actions,
    choices: Object.fromEntries(Object.entries(registry.choices).map(([id, choice]) => [id, withDefault(choice, baseline)])),
    locations: Object.fromEntries(Object.entries(registry.locations).map(([id, location]) => [id, { ...location, interactionChoices: [...location.interactionChoices.map(action => actions[action.id] ?? action), ...additions.filter(action => action.locationIds.includes(id)).map(action => actions[action.id])] }])),
  };
}
export function withActivityDocumentDefaults(document: ContentStudioDocument, baseline: ContentRegistry): ContentStudioDocument {
  const existing = new Set([...document.locations.flatMap(location => location.interactionChoices.map(action => action.id)), ...document.stories.flatMap(story => story.actions.map(action => action.id))]);
  const additions = Object.values(baseline.actions).filter(action => action.activity?.kind === "rest" && !existing.has(action.id));
  return { ...document,
    locations: document.locations.map(location => ({ ...location, interactionChoices: [...location.interactionChoices.map(action => withDefault(action, baseline)), ...additions.filter(action => action.locationIds.includes(location.id)).map(action => structuredClone(action))] })),
    recipes: document.recipes.map(recipe => withDefault(recipe, baseline)),
    stories: document.stories.map(story => ({ ...story, actions: [...story.actions.map(action => withDefault(action, baseline)), ...additions.filter(action => story.native === "region" && action.locationIds.includes(story.locationId)).map(action => structuredClone(action))],
      scenes: story.scenes.map(scene => ({ ...scene, choices: scene.choices.map(choice => withDefault(choice, baseline)) })) })),
  };
}
