"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EffectSchema = exports.ConditionSchema = void 0;
const zod_1 = require("zod");
exports.ConditionSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("has_item"), itemId: zod_1.z.string(), amount: zod_1.z.number().int().min(1).default(1) }),
    zod_1.z.object({ type: zod_1.z.literal("skill_gte"), skillId: zod_1.z.string(), value: zod_1.z.number().int() }),
    zod_1.z.object({ type: zod_1.z.literal("flag"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("flag_not"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("location"), locationId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("location_visited"), locationId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("day_gte"), value: zod_1.z.number().int().positive() }),
    zod_1.z.object({ type: zod_1.z.literal("day_lt"), value: zod_1.z.number().int().positive() }),
    zod_1.z.object({ type: zod_1.z.literal("money_gte"), amount: zod_1.z.number().int().nonnegative() }),
    zod_1.z.object({ type: zod_1.z.literal("quest_state"), questId: zod_1.z.string(), status: zod_1.z.enum(["inactive", "active", "completed"]) }),
]);
exports.EffectSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("change_stat"), stat: zod_1.z.enum(["hp", "mind", "fullness"]), value: zod_1.z.number().int() }),
    zod_1.z.object({ type: zod_1.z.literal("set_flag"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("clear_flag"), flag: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("add_item"), itemId: zod_1.z.string(), amount: zod_1.z.number().int().min(1).default(1) }),
    zod_1.z.object({ type: zod_1.z.literal("remove_item"), itemId: zod_1.z.string(), amount: zod_1.z.number().int().min(1).default(1) }),
    zod_1.z.object({ type: zod_1.z.literal("change_money"), amount: zod_1.z.number().int() }),
    zod_1.z.object({ type: zod_1.z.literal("travel"), locationId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("start_quest"), questId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("complete_quest"), questId: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("log"), message: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("set_scene"), sceneId: zod_1.z.string() }),
]);
