"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskSchema = void 0;
const zod_1 = require("zod");
exports.RiskSchema = zod_1.z.enum(["safe", "low", "medium", "high"]);
