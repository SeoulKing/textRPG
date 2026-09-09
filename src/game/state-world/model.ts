import { z } from "zod";

const id = z.string().min(1).max(100);
const seconds = z.number().int().nonnegative();
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), targetId: id }).strict(),
  z.object({ type: z.literal("approach"), targetId: id }).strict(),
  z.object({ type: z.literal("take"), targetId: id }).strict(),
  z.object({ type: z.literal("open"), targetId: id }).strict(),
  z.object({ type: z.literal("close"), targetId: id }).strict(),
  z.object({ type: z.literal("unlock"), targetId: id }).strict(),
  z.object({ type: z.literal("look") }).strict(),
  z.object({ type: z.literal("defocus") }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;
export const DefinitionSchema = z.object({
  id, name: z.string().min(1), unit: z.string().default("개"), major: z.boolean(),
  portable: z.boolean(), surface: z.boolean(), container: z.boolean(), openable: z.boolean(),
  description: z.string(),
});
export const EntitySchema = z.object({
  id, definitionId: id, quantity: seconds,
  accessNodeId: id.optional(), placementLabel: z.string().optional(),
  open: z.boolean().optional(), locked: z.boolean().optional(), keyDefinitionId: id.optional(),
  concealed: z.boolean().default(false), contentsOccluded: z.boolean().default(false),
});
export const PlacementSchema = z.object({ entityId: id, parentId: id, relation: z.enum(["in", "on"]) });
export const RoomSchema = z.object({ id, name: z.string(), atmosphere: z.string(), lit: z.boolean() });
export const NodeSchema = z.object({ id, roomId: id, name: z.string() });
export const EdgeSchema = z.object({ id, from: id, to: id, seconds, blocked: z.boolean().default(false), gateId: id.optional() });
const ItemFactSchema = z.object({ id, name: z.string(), quantity: seconds, unit: z.string() });
export const FactSchema = z.object({
  id, targetId: id, kind: z.enum(["room", "object", "contents", "exit", "lock"]),
  name: z.string(), description: z.string().optional(), nodeId: id.optional(),
  near: z.boolean().optional(), portable: z.boolean().optional(), openable: z.boolean().optional(),
  open: z.boolean().optional(), quantity: seconds.optional(), unit: z.string().optional(),
  status: z.enum(["visible", "empty", "dark", "closed", "occluded", "partial", "far"]).optional(),
  items: z.array(ItemFactSchema).optional(), locked: z.boolean().optional(),
});
export type Fact = z.infer<typeof FactSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Definition = z.infer<typeof DefinitionSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export const MemorySchema = z.object({ fact: FactSchema, observedAt: seconds, revision: seconds });
const EventSchema = z.discriminatedUnion("type", [
  z.object({ id, at: seconds, type: z.literal("light"), roomId: id, lit: z.boolean() }),
  z.object({ id, at: seconds, type: z.literal("close"), targetId: id }),
]);
export const SnapshotSchema = z.object({
  version: z.literal(1), contentVersion: z.string().min(1), revision: seconds, elapsedSeconds: seconds,
  definitions: z.array(DefinitionSchema), entities: z.array(EntitySchema), placements: z.array(PlacementSchema),
  rooms: z.array(RoomSchema), nodes: z.array(NodeSchema), edges: z.array(EdgeSchema),
  player: z.object({ nodeId: id, focusId: id.nullable(), inventoryId: id, health: seconds }),
  memory: z.array(MemorySchema), narrated: z.array(z.tuple([id, z.string()])),
  events: z.array(EventSchema), lastParagraphs: z.array(z.string()),
  lastRequest: z.object({ id, revision: seconds, commandKey: z.string() }).optional(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type World = Omit<Snapshot, "definitions" | "entities" | "placements" | "rooms" | "nodes" | "edges" | "memory" | "narrated"> & {
  definitions: Map<string, Definition>; entities: Map<string, Entity>; placements: Map<string, Placement>;
  rooms: Map<string, Snapshot["rooms"][number]>; nodes: Map<string, Snapshot["nodes"][number]>;
  edges: Map<string, Edge>; memory: Map<string, Snapshot["memory"][number]>; narrated: Map<string, string>;
  index: { children: Map<string, Set<string>>; edges: Map<string, Edge[]>; roomNodes: Map<string, string[]> };
};
export type Observation = { roomId: string; nodeId: string; focusId: string | null; facts: Fact[]; inventory: Fact[] };
export type Outcome = { type: Command["type"] | "enter"; targetId?: string; name?: string; quantity?: number; unit?: string; failed?: "locked"; seconds: number };
export type Choice = { id: string; label: string; seconds: number; command: Command; revision: number };
