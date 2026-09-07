import { z } from "zod";

export const NpcDialoguePlayerChoiceSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(120),
  thought: z.string().max(60).optional(),
  thoughtSource: z.enum(["template", "llm"]).optional(),
  // Read old conversation saves; new choices never generate or present this field.
  postChoiceNarrative: z.array(z.string().min(1).max(600)).min(1).max(2).optional(),
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
  replySource: z.enum(["llm", "template"]).optional(),
  generatedAt: z.string(),
  outcomeParagraph: z.string().optional(),
}).strict();

export const NpcDialogueExchangeSchema = z.object({
  turnNumber: z.number().int().nonnegative(),
  playerChoice: NpcDialoguePlayerChoiceSchema.nullable(),
  npcReply: NpcDialogueReplySchema,
  at: z.string(),
}).strict();

export const NpcObservationSchema = z.object({
  id: z.string(), worldId: z.string(), sequence: z.number().int().nonnegative(), atMs: z.number().nonnegative(),
  sense: z.enum(["seen", "heard", "exchange"]), eventType: z.string(), actorKnown: z.boolean(),
  summary: z.string(), targetId: z.string().optional(), targetName: z.string().optional(),
}).strict();
export const NpcConversationMemorySchema = z.object({
  affinity: z.number().int().min(-10).max(10).default(0),
  observations: z.array(NpcObservationSchema).max(24).default([]),
  observedSequences: z.record(z.string(), z.number().int().nonnegative()).default({}),
  inventory: z.record(z.string(), z.number().int().nonnegative()).default({}),
  inventoryInitialized: z.boolean().default(false),
  visitCount: z.number().int().nonnegative().default(0),
  exchanges: z.array(NpcDialogueExchangeSchema).max(20).default([]),
}).strict();

export const NpcDialogueActiveSchema = z.object({
  npcId: z.string().min(1).max(80),
  turnNumber: z.number().int().nonnegative(),
  currentScene: NpcDialogueSceneSchema,
}).strict();

export const NpcDialogueStateSchema = z.object({
  lastRequest: z.object({ id: z.string(), actionKey: z.string(), npcId: z.string(), turnNumber: z.number().int() }).optional(),
  departure: z.object({ npcId: z.string(), locationId: z.string(), paragraphs: z.array(z.string()).min(1), generatedAt: z.string() }).optional(),
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
