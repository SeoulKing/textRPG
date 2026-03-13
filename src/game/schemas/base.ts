import { z } from "zod";

export const RiskSchema = z.enum(["safe", "low", "medium", "high"]);
