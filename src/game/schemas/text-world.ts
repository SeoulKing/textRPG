import { z } from "zod";

export const TextEntityDetailsSchema = z.object({
  anchor: z.string(), placement: z.string(), outline: z.string(), surface: z.string(),
  touch: z.string().optional(), interior: z.string().optional(),
});
export const TextEntitySchema = z.object({
  id: z.string(), name: z.string(), description: z.string(),
  details: TextEntityDetailsSchema.optional(),
  components: z.object({
    position: z.object({ zone: z.string() }),
    openable: z.object({ isOpen: z.boolean(), locked: z.boolean(), keyId: z.string().optional() }).optional(),
    discovery: z.object({ inspectTargetId: z.string() }).optional(),
    container: z.object({ items: z.array(z.string()) }).optional(),
    portal: z.object({ from: z.string(), to: z.string() }).optional(),
    light: z.object({ on: z.boolean() }).optional(),
    portable: z.object({ itemId: z.string().nullable(), amount: z.number().int().positive(), unit: z.string().optional() }).optional(),
  }),
});
export const TextRoomSchema = z.object({
  id: z.string().min(1), name: z.string(), locationId: z.string().min(1),
  light: z.boolean(), layout: z.string(), surface: z.string(),
  neighbors: z.array(z.string()),
  sensory: z.array(z.object({ when: z.enum(["ENTER", "MOVE", "SURVEY"]), detail: z.string() })).optional(),
  entities: z.array(TextEntitySchema.extend({ details: TextEntityDetailsSchema })),
});
export type TextRoom = z.infer<typeof TextRoomSchema>;
const FactSchema = z.object({ id: z.string(), kind: z.string(), targetId: z.string().optional(), data: z.record(z.string(), z.unknown()) });
export const WorldEventSchema = z.object({
  type: z.enum(["ENTER", "MOVE", "POSTURE", "INSPECT", "UNLOCK", "OPEN", "CLOSE", "TAKE", "LIGHT", "LOOK", "SURVEY", "LEAVE", "STOPPED", "STORY"]),
  at: z.number(), targetId: z.string().optional(),
  before: z.record(z.string(), z.unknown()).default({}), after: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().optional(), attemptedAction: z.string().optional(),
});
export const TextWorldSchema = z.object({
  version: z.literal(2), active: z.boolean(), revision: z.number().int().nonnegative(), elapsedSeconds: z.number().int().nonnegative(),
  player: z.object({ zone: z.string(), near: z.string().nullable(), position: z.string(), facing: z.string().nullable(),
    posture: z.enum(["standing", "crouching"]), heldToolId: z.string().nullable() }),
  entities: z.record(z.string(), TextEntitySchema),
  rooms: z.record(z.string(), TextRoomSchema.omit({ entities: true })).optional(),
  observations: z.record(z.string(), z.object({ stages: z.array(z.enum(["outline", "surface", "interior"])),
    collected: z.boolean().default(false), inspected: z.boolean().optional(), blocked: z.string().optional() })),
  visitedZones: z.array(z.string()),
  knowledge: z.record(z.string(), z.object({ fact: FactSchema, signature: z.string(), observedAt: z.number() })),
  narrated: z.record(z.string(), z.string()), events: z.array(WorldEventSchema).max(30),
  recentScenes: z.array(z.object({ zone: z.string(), intent: z.string(), paragraphs: z.array(z.string()) })).max(3),
  lastIntent: z.object({ id: z.string(), label: z.string(), importance: z.enum(["major", "minor"]) }),
  lastParagraphs: z.array(z.string()).min(1), source: z.enum(["template", "llm"]), sceneRevision: z.number().int().nonnegative(),
});
export type TextEntity = z.infer<typeof TextEntitySchema>;
export type TextWorld = z.infer<typeof TextWorldSchema>;
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type WorldAction = { type: Exclude<WorldEvent["type"], "ENTER" | "STOPPED" | "STORY">; target?: string; posture?: "standing" | "crouching" };
export type WorldFact = z.infer<typeof FactSchema>;
export type NarrativeContext = {
  voice: { person: "first"; selfReference: "나"; tense: "present"; omitSubject: true };
  intent: TextWorld["lastIntent"];
  location: { id: string; name: string; lighting: "lit" | "dark"; firstVisit: boolean };
  player: TextWorld["player"] & { positionLabel: string; facingLabel: string; heldTool: { name: string; on: boolean } | null };
  results: WorldEvent[];
  requiredFacts: WorldFact[];
  optionalFacts: WorldFact[];
  knownFacts: WorldFact[];
  recentScenes: TextWorld["recentScenes"];
  paragraphCount: { min: number; max: number };
};
