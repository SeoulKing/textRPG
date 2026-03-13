"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerSchema = void 0;
const zod_1 = require("zod");
exports.PlayerSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    hp: zod_1.z.number().int().min(0).max(10),
    sanity: zod_1.z.number().int().min(0).max(10),
    hunger: zod_1.z.number().int().min(0).max(10),
    money: zod_1.z.number().int().nonnegative(),
    inventory: zod_1.z.record(zod_1.z.string(), zod_1.z.number().int().nonnegative()),
    skills: zod_1.z.array(zod_1.z.string()),
    flags: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.boolean(), zod_1.z.number(), zod_1.z.string()])),
    statusEffects: zod_1.z.array(zod_1.z.string()).default([]),
});
