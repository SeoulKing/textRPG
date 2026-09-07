import { withDefaultResourceRooms } from "./text-world/resource-definitions";
import { correctGatheringScene } from "./gathering-prose";
import type { ContentStudioDocument } from "./content-studio";
import type { ActionDefinition, ContentRegistry, LocationDefinition } from "./schemas";

function locationDefaults(location: LocationDefinition, baseline: ContentRegistry) {
  const sites = baseline.locations[location.id]?.resourceSites;
  return location.resourceSites === undefined && sites
    ? { ...location, resourceSites: structuredClone(sites) } : location;
}
function actionDefaults(action: ActionDefinition, baseline: ContentRegistry, locations: Record<string, LocationDefinition>) {
  const use = baseline.actions[action.id]?.resourceUse;
  if (action.resourceUse && use?.effort && action.resourceUse.effort === undefined && action.resourceUse.siteId === use.siteId) return { ...action, resourceUse: { ...action.resourceUse, effort: use.effort } };
  return action.resourceUse === undefined && use && action.locationIds.length > 0 && action.locationIds.every(id => locations[id]?.resourceSites?.some(site => site.id === use.siteId))
    ? { ...action, resourceUse: { ...use } } : action;
}

/** Fill only absent engine fields. Authored quantities, finite-site settings and explicit opt-outs stay intact. */
export function withResourceCatalogDefaults(registry: ContentRegistry, baseline: ContentRegistry): ContentRegistry {
  const locations = Object.fromEntries(Object.entries(registry.locations).map(([id, location]) => [id, locationDefaults(location, baseline)]));
  const actions = Object.fromEntries(Object.entries(registry.actions).map(([id, action]) => [id, actionDefaults(action, baseline, locations)]));
  for (const [id, location] of Object.entries(locations)) {
    if (location.interactionChoices.some(action => actions[action.id] !== action)) locations[id] = { ...location, interactionChoices: location.interactionChoices.map(action => actions[action.id] ?? action) };
  }
  return { ...registry, locations, actions, textRooms: withDefaultResourceRooms(registry.textRooms, locations) };
}

export function withResourceDocumentDefaults(document: ContentStudioDocument, baseline: ContentRegistry): ContentStudioDocument {
  const locations = Object.fromEntries(document.locations.map(location => [location.id, locationDefaults(location, baseline)]));
  return {
    ...document,
    textRooms: withDefaultResourceRooms(document.textRooms, locations)!,
    locations: Object.values(locations).map(location => ({ ...location, interactionChoices: location.interactionChoices.map(action => actionDefaults(action, baseline, locations)) })),
    stories: document.stories.map(story => ({ ...story, scenes: story.scenes.map(correctGatheringScene), actions: story.actions.map(action => actionDefaults(action, baseline, locations)) })),
  };
}
