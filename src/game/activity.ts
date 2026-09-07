import type { ActionDefinition, ChoiceDefinition, Effect, GameState } from "./schemas";
import { RestActivityDefinitionSchema, type RestActivityDefinition } from "./schemas/activity";
import { plannedRestMinutes, restDanger } from "./rest";

type WorkDefinition = Pick<ActionDefinition | ChoiceDefinition, "id" | "activity" | "effects">;
const cost = (effect: Effect) => effect.type === "remove_item" || effect.type === "damage_tool" || effect.type === "change_money" && effect.amount < 0;
const forbidden = new Set(["advance_to_daybreak", "travel", "focus_stock_node", "clear_stock_node_focus", "discover_stock_node", "collect_stock_item", "collect_stock_item_all", "collect_stock_money", "collect_stock_money_all"]);

/** The flat authoring effect list remains the single source of quantities and time. */
type ActivityPlan = { inputs: Effect[]; completion: Effect[]; minutes: number; itemCosts: Record<string, number>; tools: string[]; moneyCost: number; rest?: RestActivityDefinition };
export function planActivity(definition: WorkDefinition): ActivityPlan | null {
  if (!definition.activity) return null;
  if (definition.activity.kind === "rest") {
    if (definition.effects.some(effect => effect.type !== "log")) throw new Error(`${definition.id}: rest activity permits only completion logs; duration and recovery belong in its definition.`);
    return { inputs: [], completion: definition.effects, minutes: 0, itemCosts: {}, tools: [], moneyCost: 0, rest: RestActivityDefinitionSchema.parse(definition.activity) };
  }
  const inputs: Effect[] = [], completion: Effect[] = [];
  const itemCosts: Record<string, number> = {}, tools = new Set<string>();
  let minutes = 0, moneyCost = 0;
  for (const effect of definition.effects) {
    if (forbidden.has(effect.type)) throw new Error(`${definition.id}: activity cannot contain ${effect.type}.`);
    if (effect.type === "advance_time") { minutes += effect.minutes; continue; }
    if (effect.type === "random_outcome" && effect.outcomes.some(outcome => outcome.effects.some(nested => cost(nested) || forbidden.has(nested.type))))
      throw new Error(`${definition.id}: activity costs must be explicit, not hidden in a random outcome.`);
    (cost(effect) ? inputs : completion).push(effect);
    if (effect.type === "remove_item") itemCosts[effect.itemId] = (itemCosts[effect.itemId] ?? 0) + effect.amount;
    if (effect.type === "damage_tool") tools.add(effect.itemId);
    if (effect.type === "change_money" && effect.amount < 0) moneyCost -= effect.amount;
  }
  if (minutes <= 0 || minutes > 1440) throw new Error(`${definition.id}: activity requires 1–1440 minutes of work.`);
  if ([...tools].some(id => itemCosts[id])) throw new Error(`${definition.id}: a consumed ingredient cannot also be the working tool.`);
  return { inputs, completion, minutes, itemCosts, tools: [...tools], moneyCost };
}

/** Conditions are not an inventory transaction: repeated input lines must be summed as well. */
export function activityInputsAvailable(definition: WorkDefinition, state: GameState) {
  const plan = planActivity(definition);
  if (plan?.rest) return plannedRestMinutes(state, plan.rest) > 0 && !restDanger(state);
  return !plan || Object.entries(plan.itemCosts).every(([id, amount]) => (state.inventory[id] ?? 0) >= amount)
    && plan.tools.every(id => (state.inventory[id] ?? 0) > 0 && state.toolDurability[id] !== 0)
    && state.money >= plan.moneyCost;
}
