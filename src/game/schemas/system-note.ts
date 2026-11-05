import { z } from "zod";

const SystemNoteDeltaSubjectSchema = z.enum([
  "item",
  "stat",
  "money",
  "durability",
]);

export const SystemNoteEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().min(1),
    tone: z.enum(["neutral", "positive", "negative"]).default("neutral"),
  }).strict(),
  z.object({
    type: z.literal("delta"),
    subject: SystemNoteDeltaSubjectSchema,
    label: z.string().min(1),
    amount: z.number().refine((value) => value !== 0),
    itemId: z.string().min(1).optional(),
  }).strict().refine((entry) => entry.subject === "stat" || Number.isSafeInteger(entry.amount), {
    path: ["amount"],
    message: "아이템, 돈, 내구도 변화량은 정수여야 합니다.",
  }),
  z.object({
    type: z.literal("damage"),
    target: z.string().min(1),
    amount: z.number().int().positive(),
  }).strict(),
  z.object({
    type: z.literal("time"),
    minutes: z.number().int().positive(),
  }).strict(),
]);

export const SystemNoteEntriesSchema = z.array(SystemNoteEntrySchema).max(24);

export type SystemNoteEntry = z.infer<typeof SystemNoteEntrySchema>;
