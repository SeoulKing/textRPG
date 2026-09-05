import { z } from "zod";

export const NpcDialoguePlayerChoiceSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(120),
  postChoiceNarrative: z.array(z.string().min(1).max(600)).min(1).max(2),
}).strict();

export const NpcDialogueReplySchema = z.object({
  situation: z.string().min(1).max(600),
  dialogue: z.string().min(1).max(600),
}).strict();

export const NpcDialogueSceneSchema = z.object({
  npcId: z.string().min(1).max(80),
  turnNumber: z.number().int().nonnegative(),
  situation: z.string().min(1).max(600),
  dialogue: z.string().min(1).max(600),
  choices: z.array(NpcDialoguePlayerChoiceSchema).length(3),
  source: z.enum(["llm", "mixed", "template"]),
  generatedAt: z.string(),
}).strict();

export const NpcDialogueExchangeSchema = z.object({
  turnNumber: z.number().int().nonnegative(),
  playerChoice: NpcDialoguePlayerChoiceSchema.nullable(),
  npcReply: NpcDialogueReplySchema,
  at: z.string(),
}).strict();

export const NpcConversationMemorySchema = z.object({
  visitCount: z.number().int().nonnegative().default(0),
  exchanges: z.array(NpcDialogueExchangeSchema).max(20).default([]),
}).strict();

export const NpcDialogueActiveSchema = z.object({
  npcId: z.string().min(1).max(80),
  turnNumber: z.number().int().nonnegative(),
  currentScene: NpcDialogueSceneSchema,
}).strict();

export const NpcDialogueStateSchema = z.object({
  active: NpcDialogueActiveSchema.nullable().default(null),
  conversations: z.record(
    z.string(),
    NpcConversationMemorySchema,
  ).default({}),
}).strict().default({
  active: null,
  conversations: {},
});

export type NpcDialoguePlayerChoice = z.infer<
  typeof NpcDialoguePlayerChoiceSchema
>;
export type NpcDialogueReply = z.infer<typeof NpcDialogueReplySchema>;
export type NpcDialogueScene = z.infer<typeof NpcDialogueSceneSchema>;
export type NpcDialogueExchange = z.infer<typeof NpcDialogueExchangeSchema>;
export type NpcConversationMemory = z.infer<
  typeof NpcConversationMemorySchema
>;
export type NpcDialogueState = z.infer<typeof NpcDialogueStateSchema>;
