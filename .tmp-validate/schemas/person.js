"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtagonistCardSchema = exports.PersonCardSchema = void 0;
const zod_1 = require("zod");
exports.PersonCardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    role: zod_1.z.string(),
    personality: zod_1.z.array(zod_1.z.string()).min(1),
    relationToPlayer: zod_1.z.string(),
    inventoryItemIds: zod_1.z.array(zod_1.z.string()),
    locationId: zod_1.z.string(),
    summary: zod_1.z.string(),
    source: zod_1.z.enum(["template", "llm"]),
    generatedAt: zod_1.z.string(),
});
exports.ProtagonistCardSchema = zod_1.z.object({
    id: zod_1.z.literal("protagonist"),
    name: zod_1.z.string(),
    summary: zod_1.z.string(),
    inventoryItemIds: zod_1.z.array(zod_1.z.string()),
    usableSkillIds: zod_1.z.array(zod_1.z.string()),
    condition: zod_1.z.object({
        hp: zod_1.z.number().int().min(0).max(10),
        mind: zod_1.z.number().int().min(0).max(10),
        fullness: zod_1.z.number().int().min(0).max(10),
        money: zod_1.z.number().int().nonnegative(),
        locationId: zod_1.z.string(),
        day: zod_1.z.number().int().positive(),
        phaseIndex: zod_1.z.number().int().nonnegative(),
    }),
    source: zod_1.z.enum(["template", "llm"]),
    generatedAt: zod_1.z.string(),
});
