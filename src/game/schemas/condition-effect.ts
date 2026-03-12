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
]);

export const EffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("change_stat"), stat: z.enum(["hp", "mind", "fullness"]), value: z.number().int() }),
  z.object({ type: z.literal("set_flag"), flag: z.string() }),
  z.object({ type: z.literal("add_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("remove_item"), itemId: z.string(), amount: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("add_money"), amount: z.number().int() }),
  z.object({ type: z.literal("travel"), locationId: z.string() }),
]);

export type Condition = z.infer<typeof ConditionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
