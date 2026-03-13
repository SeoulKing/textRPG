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
    type: z.literal("stock_item_lt"),
    locationId: z.string(),
    nodeId: z.string(),
    itemId: z.string(),
    amount: z.number().int().min(1).default(1),
  }),
  z.object({ type: z.literal("stock_node_discovered"), nodeId: z.string() }),
  z.object({ type: z.literal("active_stock_node"), nodeId: z.string() }),
  z.object({ type: z.literal("active_stock_node_not"), nodeId: z.string() }),
]);

export const EffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("change_stat"), stat: z.enum(["hp", "mind", "fullness"]), value: z.number().int() }),
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
]);

export type Condition = z.infer<typeof ConditionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
