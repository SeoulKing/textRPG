import { z } from "zod";

export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("has_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("skill_gte"), skillId: z.string(), value: z.number().int() }),
  z.object({ type: z.literal("flag"), flag: z.string() }),
  z.object({ type: z.literal("flag_not"), flag: z.string() }),
  z.object({ type: z.literal("location"), locationId: z.string() }),
  z.object({ type: z.literal("location_visited"), locationId: z.string() }),
  z.object({ type: z.literal("day_gte"), value: z.number().int().positive() }),
  z.object({ type: z.literal("day_lt"), value: z.number().int().positive() }),
  z.object({ type: z.literal("money_gte"), amount: z.number().int().nonnegative() }),
  z.object({ type: z.literal("quest_state"), questId: z.string(), status: z.enum(["inactive", "active", "completed"]) }),
  z.object({
    type: z.literal("stock_item_gte"),
    locationId: z.string(),
    nodeId: z.string(),
    itemId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("stock_money_gte"),
    locationId: z.string(),
    nodeId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("stock_item_lt"),
    locationId: z.string(),
    nodeId: z.string(),
    itemId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("stock_money_lt"),
    locationId: z.string(),
    nodeId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({ type: z.literal("stock_node_discovered"), nodeId: z.string() }),
  z.object({ type: z.literal("active_stock_node"), nodeId: z.string() }),
  z.object({ type: z.literal("active_stock_node_not"), nodeId: z.string() }),
  z.object({ type: z.literal("shelter_sleep_window") }),
]);

const InstantEffectSchemas = [
  z.object({ type: z.literal("change_stat"), stat: z.enum(["hp", "mind", "energy"]), value: z.number().int() }),
  z.object({ type: z.literal("set_flag"), flag: z.string() }),
  z.object({ type: z.literal("clear_flag"), flag: z.string() }),
  z.object({ type: z.literal("add_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("remove_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("change_money"), amount: z.number().int() }),
  z.object({ type: z.literal("travel"), locationId: z.string() }),
  z.object({ type: z.literal("start_quest"), questId: z.string() }),
  z.object({ type: z.literal("complete_quest"), questId: z.string() }),
  z.object({ type: z.literal("log"), message: z.string() }),
  z.object({ type: z.literal("set_scene"), sceneId: z.string() }),
  z.object({ type: z.literal("set_random_scene"), tag: z.string() }),
  z.object({ type: z.literal("discover_stock_node"), nodeId: z.string() }),
  z.object({ type: z.literal("focus_stock_node"), nodeId: z.string() }),
  z.object({ type: z.literal("clear_stock_node_focus") }),
  z.object({
    type: z.literal("collect_stock_item"),
    locationId: z.string(),
    nodeId: z.string(),
    itemId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("collect_stock_item_all"),
    locationId: z.string(),
    nodeId: z.string(),
    itemId: z.string(),
  }),
  z.object({
    type: z.literal("collect_stock_money"),
    locationId: z.string(),
    nodeId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("collect_stock_money_all"),
    locationId: z.string(),
    nodeId: z.string(),
  }),
] as const;

const TimeEffectSchemas = [
  z.object({ type: z.literal("advance_time"), minutes: z.number().int().min(1).max(24 * 60).default(15) }),
  z.object({ type: z.literal("advance_to_daybreak") }),
] as const;

const BaseEffectSchemas = [...InstantEffectSchemas, ...TimeEffectSchemas] as const;
const RandomOutcomeEffectSchemas = InstantEffectSchemas;

export const BaseEffectSchema = z.discriminatedUnion("type", BaseEffectSchemas);
export const RandomOutcomeEffectSchema = z.discriminatedUnion("type", RandomOutcomeEffectSchemas);

export const EffectSchema = z.discriminatedUnion("type", [
  ...BaseEffectSchemas,
  z.object({
    type: z.literal("random_outcome"),
    outcomes: z.array(z.object({
      weight: z.number().positive(),
      effects: z.array(RandomOutcomeEffectSchema).default([]),
    })).min(1),
  }),
] as const);

export type Condition = z.infer<typeof ConditionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
