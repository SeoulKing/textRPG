import { z } from "zod";

export const RiskSchema = z.enum(["안전", "낮음", "보통", "봉쇄"]);
