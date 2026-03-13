"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemCardSchema = exports.ItemEffectsSchema = void 0;
const zod_1 = require("zod");
exports.ItemEffectsSchema = zod_1.z.object({
    hp: zod_1.z.number().int().default(0),
    mind: zod_1.z.number().int().default(0),
    fullness: zod_1.z.number().int().default(0),
    starvationRelief: zod_1.z.number().int().default(0),
});
exports.ItemCardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    kind: zod_1.z.enum(["food", "drink", "medicine", "trade", "ticket"]),
    rarity: zod_1.z.enum(["common", "uncommon", "rare"]),
    price: zod_1.z.number().int().nonnegative(),
    tags: zod_1.z.array(zod_1.z.string()),
    effects: exports.ItemEffectsSchema,
    source: zod_1.z.enum(["template", "llm"]),
    generatedAt: zod_1.z.string(),
});
