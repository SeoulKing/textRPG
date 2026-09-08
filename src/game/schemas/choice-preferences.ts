import { z } from "zod";

// Small, save-local preference memory. It never changes action eligibility.
export const ChoicePreferencesSchema = z.object({
  scores: z.record(z.string().max(180), z.number().int().min(0).max(24))
    .refine(scores => Object.keys(scores).length <= 64),
  lastSelection: z.string().max(240),
});
