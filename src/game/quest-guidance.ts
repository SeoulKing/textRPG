import type { ContentRegistry, GameState, QuestDefinition } from "./schemas";
import { evaluateCondition } from "./state-utils";
import { activityConditionState } from "./work-environment";
import { activityInputsAvailable } from "./activity";
import { resolveItemText } from "./item-text";
import { materialSourceHints } from "./material-guidance";

export function questCompletionDefinition(quest: QuestDefinition, registry: ContentRegistry) {
  const ref = quest.guidance?.completion;
  return ref ? ref.kind === "choice" ? registry.choices[ref.id] : registry.actions[ref.id] : undefined;
}
export function validateQuestGuidance(quest: QuestDefinition, registry: ContentRegistry) {
  const ref = quest.guidance?.completion;
  if (!ref) return;
  const definition = questCompletionDefinition(quest, registry);
  if (!registry.locations[ref.locationId] || !definition) throw new Error("quest:" + quest.id + " guidance references an unknown completion action or location.");
  const inPlace = ref.kind === "action"
    ? !registry.actions[ref.id].locationIds.length || registry.actions[ref.id].locationIds.includes(ref.locationId)
    : Object.values(registry.scenes).some(scene => scene.locationId === ref.locationId && scene.choiceIds.includes(ref.id));
  if (!inPlace) throw new Error("quest:" + quest.id + " guidance completion belongs to another location.");
}
/** Add only missing native guidance, keeping edited quests and explicit opt-outs intact. */
export function withQuestGuidanceDefaults(registry: ContentRegistry, baseline: ContentRegistry): ContentRegistry {
  return { ...registry, quests: Object.fromEntries(Object.entries(registry.quests).map(([id, value]) => {
    const quest = value as QuestDefinition;
    const original = baseline.quests[id] as QuestDefinition | undefined;
    if (quest.guidance !== undefined || !original?.guidance || JSON.stringify(quest.objectives) !== JSON.stringify(original.objectives)) return [id, quest];
    const upgraded = { ...quest, guidance: structuredClone(original.guidance) };
    try { validateQuestGuidance(upgraded, registry); } catch { return [id, quest]; }
    return [id, upgraded];
  })) };
}

/** Display the requirements of the actual completion operation; never inspect hidden container contents. */
export function questProgressFields(state: GameState, quest: QuestDefinition, registry: ContentRegistry, recipeSceneIds: string[] = []) {
  const definition = questCompletionDefinition(quest, registry), required = new Map<string, number>();
  const need = (id: string, amount: number) => required.set(id, Math.max(required.get(id) ?? 0, amount));
  if (definition) {
    const costs: Record<string, number> = {};
    for (const effect of definition.effects) {
      if (effect.type === "remove_item") costs[effect.itemId] = (costs[effect.itemId] ?? 0) + effect.amount;
      if (effect.type === "damage_tool") need(effect.itemId, 1);
    }
    Object.entries(costs).forEach(([id, amount]) => need(id, amount));
    definition.conditions.forEach(condition => { if (condition.type === "has_item") need(condition.itemId, condition.amount); });
  } else {
    quest.requiredItems.forEach(item => need(item.itemId, item.amount));
    quest.objectives.forEach(objective => { if (objective.type === "obtain_item") need(objective.itemId, objective.amount); });
  }
  const status = state.quests[quest.id] ?? "inactive", completed = status === "completed";
  const workState = definition ? activityConditionState(definition, { ...state, location: quest.guidance?.completion.locationId ?? state.location }) : state;
  const requirements = [...required].map(([itemId, amount]) => {
    const ownedAmount = completed ? amount : workState.inventory[itemId] ?? 0;
    return { itemId, name: String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId), amount, ownedAmount, met: ownedAmount >= amount,
      sourceHints: status === "active" && ownedAmount < amount ? materialSourceHints(state, registry, itemId, recipeSceneIds) : [] };
  });
  if (status !== "active" || !quest.guidance || !definition) return { requirements };
  const localState = workState;
  const materialsReady = requirements.every(item => item.met);
  const ready = materialsReady && definition.conditions.every(condition => evaluateCondition(condition, localState)) && activityInputsAvailable(definition, localState);
  const text = ready ? quest.guidance.ready : materialsReady && requirements.length > 0
    ? "재료는 모였다. 목적지에서 사용할 도구와 남은 작업 조건을 확인한다."
    : quest.guidance.gathering;
  return { requirements, nextStep: resolveItemText(text, registry) };
}

/** Presentation only: readiness still comes from the real report operation. */
export function arcanaQuestPresentation(state: GameState, quest: QuestDefinition, registry: ContentRegistry) {
  if (!quest.id.startsWith("academy_")) return {};
  const names: Record<string, string> = {
    academy_theory_completed: "기초 이론",
    academy_practical_passed: "수정 실습",
    academy_library_briefed: "도서관 안내",
    academy_astrarium_inspected: "천문판 조사",
    academy_observatory_repaired: "천문판 고리 정렬",
  };
  const definition = questCompletionDefinition(quest, registry);
  const completed = state.quests[quest.id] === "completed";
  const localState = definition ? activityConditionState(definition, {
    ...state, location: quest.guidance?.completion.locationId ?? state.location,
  }) : state;
  const objectives = Object.entries(names)
    .filter(([flag]) => definition?.conditions.some(condition => condition.type === "flag" && condition.flag === flag)
      || (quest.id === "academy_silent_observatory" && flag === "academy_astrarium_inspected"))
    .map(([flag, name]) => ({ name, amount: 1, ownedAmount: completed || evaluateCondition({ type: "flag", flag }, state) ? 1 : 0 }));
  const readyToReport = state.quests[quest.id] === "active" && !!definition
    && definition.conditions.every(condition => evaluateCondition(condition, localState))
    && activityInputsAvailable(definition, localState);
  const rewardText = quest.rewards.flatMap(reward => {
    if (reward.type === "money") return [`${reward.amount}골드`];
    if (reward.type === "add_item") return [`${(registry.items[reward.itemId] as { name?: string } | undefined)?.name ?? reward.itemId} × ${reward.amount}`];
    return [];
  }).join(" · ");
  return { objectives, readyToReport, rewardText,
    reportTo: quest.id === "academy_first_lesson" ? "마법학교 교장실 · 교장" : "마법학교 도서관 · 노엘" };
}
