import { RETIRED_ACTION_IDS } from "./content-retirements";
import type { ContentRegistry } from "./schemas/content";

const retiredFoodIds = new Set(["wildGreens", "greensSoup", "forestStew"]);
const cookingSceneIds = ["shelter_cooking_menu", "shelter_cooking_menu_repeat"];
const craftingSceneIds = ["shelter_crafting_menu", "shelter_crafting_menu_repeat"];
const processingIds = ["craft_wood_plank", "craft_firewood"];

function replaceItemReferences<T>(value: T, from: string, to: string, field = ""): T {
  if (typeof value === "string") {
    if (["itemId", "obtainableItemIds", "inventoryItemIds"].includes(field)) {
      return (value === from ? to : value) as T;
    }
    return value.replace(new RegExp(`\\{\\{item:${from}(?=[|}])`, "g"), `{{item:${to}`)
      .replace(/산나물/g, "채소") as T;
  }
  if (Array.isArray(value)) return value.map(entry => replaceItemReferences(entry, from, to, field)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
      [key, replaceItemReferences(entry, from, to, key)],
    )) as T;
  }
  return value;
}

/** Upgrade the explicitly changed survival catalog while leaving the archived version intact. */
export function applySurvivalCatalogUpdates(registry: ContentRegistry, current: ContentRegistry): ContentRegistry {
  const hasRetiredFood = [...retiredFoodIds].some(id => registry.items[id]);
  const needsWoodProcessing = !registry.items.firewood && Boolean(current.items.firewood);
  const hasRetiredRecipes = ["cook_greens_soup", "cook_forest_stew"].some(id => registry.choices[id] || registry.actions[id]);
  const hasLegacyCookingIngredients = ["cook_at_shelter", "cook_rice_porridge", "cook_grilled_fish"].some(id =>
    registry.choices[id]?.conditions.some(condition =>
      condition.type === "has_item" && ["woodPlank", "wildGreens"].includes(condition.itemId),
    ),
  );
  if (!hasRetiredFood && !needsWoodProcessing && !hasRetiredRecipes && !hasLegacyCookingIngredients) return registry;

  const updated = replaceItemReferences(registry, "wildGreens", "vegetables");
  for (const id of retiredFoodIds) delete updated.items[id];
  for (const id of ["vegetables", "meat", "wood", "woodPlank", "firewood"]) {
    if (current.items[id]) updated.items[id] = current.items[id];
  }

  const cookingIds = [...new Set(cookingSceneIds.flatMap(id => current.scenes[id]?.choiceIds ?? []))]
    .filter(id => !RETIRED_ACTION_IDS.has(id) && current.choices[id]);
  for (const id of [...cookingIds, ...processingIds]) {
    if (current.choices[id]) updated.choices[id] = structuredClone(current.choices[id]);
  }
  // The surviving recipes may introduce an item absent from a much older save.
  for (const [id, item] of Object.entries(current.items)) {
    if (!updated.items[id]) updated.items[id] = item;
  }
  for (const id of cookingSceneIds) {
    if (updated.scenes[id] && current.scenes[id]) {
      updated.scenes[id].choiceIds = current.scenes[id].choiceIds.filter(choiceId => cookingIds.includes(choiceId));
    }
  }
  for (const id of craftingSceneIds) {
    const scene = updated.scenes[id];
    if (scene) scene.choiceIds = [...new Set([...processingIds.filter(id => updated.choices[id]), ...scene.choiceIds])];
  }
  for (const id of ["chop_wood_at_forest", "chop_wood_with_crude_axe"]) {
    if (updated.actions[id]) {
      updated.actions[id] = replaceItemReferences(updated.actions[id], "woodPlank", "wood");
    }
  }
  for (const location of Object.values(updated.locations)) {
    location.obtainableItemIds = [...new Set(location.obtainableItemIds.filter(id => !retiredFoodIds.has(id)))];
    const additions = location.id === "forest" ? ["wood"] : location.id === "shelter" ? ["wood", "firewood"] : [];
    location.obtainableItemIds.push(...additions.filter(id => !location.obtainableItemIds.includes(id)));
    location.interactionChoices = location.interactionChoices.map(action => updated.actions[action.id] ?? action);
    location.stockNodes.forEach(node => {
      node.items = node.items.filter(item => !retiredFoodIds.has(item.itemId));
    });
  }
  return updated;
}
