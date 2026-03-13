"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationCardSchema = void 0;
const zod_1 = require("zod");
const base_1 = require("./base");
exports.LocationCardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    risk: base_1.RiskSchema,
    summary: zod_1.z.string(),
    description: zod_1.z.string(),
    tags: zod_1.z.array(zod_1.z.string()),
    traits: zod_1.z.array(zod_1.z.string()),
    obtainableItemIds: zod_1.z.array(zod_1.z.string()),
    residentIds: zod_1.z.array(zod_1.z.string()),
    neighbors: zod_1.z.array(zod_1.z.string()),
    imagePath: zod_1.z.string().nullable(),
    source: zod_1.z.enum(["template", "llm"]),
    generatedAt: zod_1.z.string(),
    availableActionIds: zod_1.z.array(zod_1.z.string()).optional(),
    eventIds: zod_1.z.array(zod_1.z.string()).optional(),
});
