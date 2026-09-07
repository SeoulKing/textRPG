import { z } from "zod";

const PhysicalSchema = z.object({ mass: z.number().nonnegative(), volume: z.number().positive().default(1), movable: z.boolean().default(false), opaque: z.boolean().default(true), blocksPassage: z.boolean().default(false), supportCapacity: z.number().nonnegative().optional() });
const MaterialCostSchema = z.object({ itemId: z.string(), amount: z.number().int().positive() });

export const TextEntityDetailsSchema = z.object({
  anchor: z.string(), placement: z.string(), outline: z.string(), surface: z.string(),
  touch: z.string().optional(), interior: z.string().optional(),
  movementSound: z.string().optional(), posture: z.enum(["standing", "crouching"]).optional(),
  responses: z.array(z.object({ when: z.enum(["OPEN", "CLOSE", "UNLOCK", "INSPECT", "TAKE"]), detail: z.string() })).optional(),
});
export const TextEntitySchema = z.object({
  id: z.string(), name: z.string(), description: z.string(),
  inventoryRegistered: z.boolean().optional(),
  expeditionLoot: z.object({ runNumber: z.number().int().nonnegative(), floorId: z.string() }).optional(),
  toolDurability: z.number().int().nonnegative().optional(),
  origin: z.object({ worldId: z.string(), entityId: z.string() }).optional(),
  details: TextEntityDetailsSchema.optional(),
  components: z.object({
    actor: z.object({ npcId: z.string(), active: z.boolean().optional() }).optional(),
    craftingStorage: z.boolean().optional(),
    workstation: z.object({ kinds: z.array(z.enum(["craft", "cook", "build"])).min(1), durationMultiplier: z.number().min(0.25).max(1) }).optional(),
    ownership: z.object({ npcId: z.string() }).optional(),
    expeditionCache: z.object({ floorId: z.string(), lootSpotId: z.string(), searchMinutes: z.number().positive() }).optional(),
    expeditionRoute: z.object({ command: z.enum(["descend", "ascend", "return"]), floorId: z.string() }).optional(),
    stockNode: z.object({ nodeId: z.string().min(1) }).optional(),
    interactionPoint: z.object({ requiresInspection: z.boolean().optional(), actions: z.array(z.object({ actionId: z.string().min(1), role: z.enum(["work", "care", "trade", "information", "delivery", "journey"]) })).min(1) }).optional(),
    resourceSite: z.object({ siteId: z.string().min(1), unlimited: z.boolean().optional(), remaining: z.number().int().nonnegative().optional(), capacity: z.number().int().positive().optional(), recoveryMinutes: z.number().positive().optional(), missingTools: z.array(z.string()).optional() }).optional(),
    position: z.object({ zone: z.string(), relativeTo: z.string().optional(), relation: z.enum(["beside", "blocking", "on", "inside"]).optional() }),
    physical: PhysicalSchema.optional(),
    structure: z.object({ material: z.enum(["wood", "metal", "fabric", "stone"]), integrity: z.number().int().nonnegative(), maxIntegrity: z.number().int().positive(), resistance: z.number().int().positive(), salvage: z.array(MaterialCostSchema).default([]),
      breakCount: z.number().int().nonnegative().optional(), intactPhysical: PhysicalSchema.optional(),
      repair: z.object({ materials: z.array(MaterialCostSchema).min(1), seconds: z.number().int().positive(), energy: z.number().int().positive(), effort: z.string().min(1), sound: z.object({ description: z.string().min(1), intensity: z.number().min(0).max(1) }).optional(), tool: z.object({ capability: z.enum(["pry", "cut", "strike"]), power: z.number().int().positive() }).optional() }).optional(),
    }).optional(),
    openable: z.object({ isOpen: z.boolean(), locked: z.boolean(), keyId: z.string().optional(), lockBroken: z.boolean().optional(), autoCloseSeconds: z.number().int().positive().optional(), remainingOpenSeconds: z.number().int().nonnegative().optional() }).optional(),
    discovery: z.object({ inspectTargetId: z.string() }).optional(),
    container: z.object({ items: z.array(z.string()), capacity: z.number().positive().optional(), depletionBehavior: z.enum(["remain", "disappear"]).optional() }).optional(),
    portal: z.object({ from: z.string(), to: z.string() }).optional(),
    light: z.object({ on: z.boolean(), fuelSeconds: z.number().int().nonnegative().optional(), spill: z.number().min(0).max(1).optional() }).optional(),
    portable: z.object({ itemId: z.string().nullable(), amount: z.number().int().positive(), unit: z.string().optional() }).optional(),
  }),
});
export const TextRoomSchema = z.object({
  id: z.string().min(1), name: z.string(), locationId: z.string().min(1),
  outsideExploration: z.boolean().optional(),
  regionalExit: z.boolean().optional(),
  optionalEntry: z.object({ label: z.string().min(1), exitLabel: z.string().min(1), exitText: z.string().min(1), requiredFlag: z.string().optional() }).optional(),
  light: z.boolean(), layout: z.string(), surface: z.string(),
  entryText: z.string().optional(), entryAnchor: z.string().optional(),
  arrivals: z.record(z.string(), z.object({ position: z.string().min(1), facing: z.string().optional(), text: z.string().optional() })).optional(),
  neighbors: z.array(z.string()),
  sensory: z.array(z.object({ when: z.enum(["ENTER", "MOVE", "SURVEY"]), detail: z.string() })).optional(),
  entities: z.array(TextEntitySchema.omit({ inventoryRegistered: true }).extend({ details: TextEntityDetailsSchema })),
});
export type TextRoom = z.infer<typeof TextRoomSchema>;
const FactSchema = z.object({ id: z.string(), kind: z.string(), targetId: z.string().optional(), data: z.record(z.string(), z.unknown()) });
export const WorldEventSchema = z.object({
  type: z.enum(["ENTER", "MOVE", "POSTURE", "INSPECT", "UNLOCK", "OPEN", "CLOSE", "TAKE", "HOLD", "STOW", "LIGHT", "LOOK", "SURVEY", "LEAVE", "STOPPED", "STORY", "PUSH", "PUT", "DROP", "WAIT", "HIDE", "SOUND", "LIGHT_EXPIRED", "AUTO_CLOSE", "DEFOCUS", "FOCUS", "WORK", "SERVICE", "USE_TOOL", "REPAIR", "NPC_REACTION"]),
  id: z.string().optional(), actorId: z.string().optional(), causedBy: z.string().optional(),
  origin: z.enum(["player", "simulation"]).optional(), witnessed: z.boolean().optional(),
  at: z.number(), targetId: z.string().optional(),
  before: z.record(z.string(), z.unknown()).default({}), after: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().optional(), attemptedAction: z.string().optional(),
});
export const TextWorldSchema = z.object({
  version: z.literal(2), active: z.boolean(), revision: z.number().int().nonnegative(), elapsedSeconds: z.number().int().nonnegative(),
  player: z.object({ zone: z.string(), near: z.string().nullable(), position: z.string(), facing: z.string().nullable(),
    posture: z.enum(["standing", "crouching"]), heldToolId: z.string().nullable(),
    placementTargetId: z.string().nullable().optional(),
    focusEntityId: z.string().nullable().optional(), heldItemId: z.string().nullable().optional(), manipulating: z.boolean().optional(),
    relation: z.enum(["near", "behind", "under"]).optional(), coverId: z.string().nullable().optional(), pushCapacity: z.number().positive().optional() }),
  entities: z.record(z.string(), TextEntitySchema),
  rooms: z.record(z.string(), TextRoomSchema.omit({ entities: true })).optional(),
  observations: z.record(z.string(), z.object({ stages: z.array(z.enum(["outline", "surface", "interior"])),
    collected: z.boolean().default(false), inspected: z.boolean().optional(), blocked: z.string().optional() })),
  visitedZones: z.array(z.string()),
  knowledge: z.record(z.string(), z.object({ fact: FactSchema, signature: z.string(), observedAt: z.number() })),
  narrated: z.record(z.string(), z.string()), events: z.array(WorldEventSchema).max(30),
  recentScenes: z.array(z.object({ zone: z.string(), intent: z.string(), paragraphs: z.array(z.string()) })).max(3),
  simulation: z.object({ fractionalSeconds: z.number().min(0).max(1).optional(), nextEventId: z.number().int().nonnegative().default(0), sounds: z.array(z.object({ id: z.string(), sourceId: z.string().optional(), zone: z.string(), description: z.string(), remainingSeconds: z.number().nonnegative(), intensity: z.number().min(0).max(1) })).default([]) }).optional(),
  choiceHistory: z.array(z.object({ revision: z.number().int(), signature: z.string(), shownIds: z.array(z.string()), chosenId: z.string(), families: z.array(z.string()) })).max(3).optional(),
  choiceLabels: z.record(z.string(), z.object({ canonical: z.string(), text: z.string(), thought: z.string().max(60).optional(), thoughtSource: z.enum(["template", "llm"]).optional() })).optional(),
  // Read older saves; new scenes remove these unused prewritten leads.
  choiceNarratives: z.record(z.string(), z.object({ label: z.string(), choiceLabel: z.string().optional(), text: z.string().min(1).max(160), source: z.enum(["template", "llm"]) })).optional(),
  lastIntent: z.object({ id: z.string(), label: z.string(), thought: z.string().max(60).optional(), importance: z.enum(["major", "minor"]) }),
  lastParagraphs: z.array(z.string()).min(1), source: z.enum(["template", "llm"]), sceneRevision: z.number().int().nonnegative(),
  lastParagraphSources: z.array(z.enum(["llm", "template"])).max(3).optional(),
  lastRequest: z.object({ id: z.string().max(100), actionKey: z.string().max(1000), revision: z.number().int().nonnegative() }).optional(),
});
export type TextEntity = z.infer<typeof TextEntitySchema>;
export type TextWorld = z.infer<typeof TextWorldSchema>;
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type WorldAction = { type: "MOVE" | "POSTURE" | "INSPECT" | "UNLOCK" | "OPEN" | "CLOSE" | "TAKE" | "HOLD" | "STOW" | "LIGHT" | "LOOK" | "SURVEY" | "LEAVE" | "PUSH" | "PUT" | "DROP" | "WAIT" | "HIDE" | "DEFOCUS" | "FOCUS" | "USE_TOOL" | "REPAIR"; target?: string; toolItemId?: string; technique?: "pry" | "cut" | "strike"; destination?: string; relation?: "beside" | "blocking" | "on" | "inside" | "behind" | "under"; durationSeconds?: number; posture?: "standing" | "crouching" };
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
  nextChoices?: { id: string; label: string; family?: string; selectionSignature?: string; targetId?: string; defaultThought?: string; labelNames?: string[] }[];
  alreadyDisplayed?: string[];
  interaction?: { mode: "EXPLORE" | "FOCUS" | "MANIPULATE" | "THREAT"; focus: string | null; holding: string | null; goal: string; threat: string | null };
  direction?: { focusTargetId?: string; beats: { role: "approach" | "contact" | "reveal" | "change" | "aftermath"; resultFactIds: string[]; detailFactIds: string[] }[] };
};
