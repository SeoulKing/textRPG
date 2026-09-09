import type { ContentRegistry, Effect, GameState } from "./schemas";
import { evaluateCondition, getStockStateKey } from "./state-utils";
import { resourceAvailability } from "./resources";
import { resolveItemText } from "./item-text";

function yieldsItem(effects: Effect[], itemId: string): boolean {
  return effects.some(effect => effect.type === "add_item" && effect.itemId === itemId
    || effect.type === "random_outcome" && effect.outcomes.some(outcome => yieldsItem(outcome.effects, itemId)));
}
const itemName = (registry: ContentRegistry, id: string) => String((registry.items[id] as { name?: string } | undefined)?.name ?? id);

/** Advice is drawn from known places and disclosed stock, never from a hidden loot manifest. */
export function materialSourceHints(state: GameState, registry: ContentRegistry, itemId: string, recipeSceneIds: string[]): string[] {
  const hints: { text: string; priority: number; key: string }[] = [];
  const seenRecipes = new Set<string>();
  for (const sceneId of recipeSceneIds) {
    const scene = registry.scenes[sceneId];
    if (!scene || !(state.flags['visited_' + scene.locationId] || scene.locationId === state.location)) continue;
    for (const id of scene.choiceIds) {
      if (seenRecipes.has(id)) continue;
      seenRecipes.add(id);
      const recipe = registry.choices[id];
      if (!recipe?.effects.some(e => e.type === "add_item" && e.itemId === itemId)) continue;
      const inputs = recipe.conditions.filter(c => c.type === "has_item" && c.itemId !== itemId);
      if (!inputs.length || recipe.hidden || recipe.presentationMode !== "always" && !recipe.conditions.every(c => evaluateCondition(c, { ...state, location: scene.locationId }))) continue;
      const materials = inputs.slice(0, 3).map(c => c.type === "has_item" ? `${itemName(registry, c.itemId)} ${c.amount}개` : "").join(" · ");
      hints.push({ key: 'recipe:' + id, priority: 0, text: `${registry.locations[scene.locationId].name}에서 ${materials}로 제작` });
    }
  }
  for (const location of Object.values(registry.locations)) {
    if (!(state.flags['visited_' + location.id] || state.location === location.id)) continue;
    const localState = { ...state, location: location.id };
    for (const action of location.interactionChoices) {
      if (!action.resourceUse || !action.conditions.every(c => evaluateCondition(c, localState)) || !yieldsItem(action.effects, itemId)) continue;
      const available = resourceAvailability(localState, action, registry)!;
      const suffix = available.site.unlimited ? action.effects.some(e => e.type === "random_outcome") ? '수색 결과에 따라 획득' : '반복 채집 가능'
        : available.remainingUses === 0 ? available.recoveryMinutes ? `${available.recoveryMinutes}분 뒤 재개` : '소진'
        : action.effects.some(e => e.type === "random_outcome") ? `수색 결과에 따라 획득 · ${available.remainingUses}회 남음` : `${available.remainingUses}회 남음`;
      hints.push({ key: location.id + ':' + available.site.id, priority: available.remainingUses === 0 ? 3 : 1, text: `${location.name} · ${resolveItemText(action.label, registry)} (${suffix})` });
    }
    for (const node of location.stockNodes) {
      if (!state.discoveredStockNodeIds.includes(node.id)) continue;
      const item = node.items.find(item => item.itemId === itemId);
      if (!item) continue;
      const quantity = state.stockState[getStockStateKey(location.id, node.id, itemId)] ?? item.initialQuantity;
      hints.push({ key: location.id + ':' + node.id, priority: quantity ? 1 : 3, text: `${location.name} · ${node.name} (${quantity ? quantity + '개 남음' : '수집 완료'})` });
    }
  }
  const seen = new Set<string>();
  return hints.sort((a, b) => a.priority - b.priority).filter(hint => {
    if (seen.has(hint.key)) return false;
    seen.add(hint.key);return true;
  }).slice(0, 2).map(hint => hint.text);
}
