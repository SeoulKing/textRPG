"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldStateSchema = void 0;
const zod_1 = require("zod");
exports.WorldStateSchema = zod_1.z.object({
    currentTime: zod_1.z.string(),
    currentDay: zod_1.z.number().int().positive(),
    phaseIndex: zod_1.z.number().int().nonnegative(),
    globalFlags: zod_1.z.array(zod_1.z.string()),
    unlockedLocationIds: zod_1.z.array(zod_1.z.string()),
    visitedLocationIds: zod_1.z.array(zod_1.z.string()),
    worldElapsedMs: zod_1.z.number().int().nonnegative(),
});
