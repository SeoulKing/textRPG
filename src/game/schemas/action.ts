import { z } from "zod";
import { CombatPointSchema } from "./arcana-spatial";
import { ActivityDefinitionSchema } from "./activity";
import { ConditionSchema } from "./condition-effect";
import { EffectSchema } from "./condition-effect";
import { SkillUseSchema } from "./skill-progression";

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("academy_move"), roomId: z.string().min(1).max(40) }),
  z.object({ type: z.literal("world_clock"), command: z.enum(["tick", "pause"]), clientId: z.string().min(1).max(100), sequence: z.number().int().nonnegative().default(0) }),
  z.object({ type: z.literal("arcana_combat"), command: z.enum(["start", "fireball", "flame_wave", "flame_guard", "meteor", "giant_fireball", "flame_barrage", "dodge", "teleport", "potion", "retreat", "pause", "resume", "finish", "buy_potion", "buy_item", "sell_item", "rest", "spatial_sync", "learn_spell", "equip_spell", "invest_skill", "reset_skill_tree", "dev_sofa_rest"]), itemId: z.string().min(1).max(40).optional(), quantity: z.number().int().min(1).max(99).optional(), spellId: z.enum(["fireball", "flame_wave", "flame_guard", "meteor", "giant_fireball", "flame_barrage"]).optional(), nodeId: z.string().min(1).max(40).optional(), slotIndex: z.number().int().min(0).max(5).optional(), battleId: z.string().max(100).optional(), spatial: z.object({ encounterId: z.literal("plaza_slime"), clientId: z.string().min(1).max(100), sequence: z.number().int().nonnegative(), position: CombatPointSchema, aim: CombatPointSchema.optional(), target:CombatPointSchema.optional(), visibleEnemyIds:z.array(z.string().max(40)).max(64).optional(), paused: z.boolean().default(false), developerSpeed: z.boolean().default(false) }).optional() }),
  z.object({
    type: z.literal("text_world"),
    command: z.enum(["enter", "choose"]),
    optionId: z.string().min(1).max(100).optional(),
    revision: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("travel"), targetId: z.string() }),
  z.object({ type: z.literal("use_item"), itemId: z.string() }),
  z.object({ type: z.literal("item_light"), worldId: z.string(), entityId: z.string(), revision: z.number().int().nonnegative(), on: z.boolean() }),
  z.object({ type: z.literal("content_action"), actionId: z.string(), activityRevision: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("content_choice"), choiceId: z.string(), activityRevision: z.number().int().nonnegative().optional() }),
  z.object({
    type: z.literal("subway_expedition"),
    command: z.enum([
      "start",
      "choose",
      "resolve_event",
      "encounter_choice",
      "acknowledge_encounter",
      "choose_upgrade",
      "acknowledge_result",
      "search_loot",
      "finish_floor",
      "descend",
      "ascend",
      "return",
    ]),
    optionId: z.string().optional(),
    turnNumber: z.number().int().nonnegative().optional(),
    lootSpotId: z.string().optional(),
  }),
  z.object({
    type: z.literal("npc_dialogue"),
    command: z.enum(["start", "choose", "leave", "give", "trade"]),
    itemId: z.string().optional(), offerId: z.string().optional(),
    npcId: z.string().min(1).max(80),
    choiceId: z.string().min(1).max(160).optional(),
    turnNumber: z.number().int().nonnegative().optional(),
  }),
]);

export const ActionTypeSchema = z.enum(["travel", "search", "rest", "use", "talk", "explore"]);
export const ActionVisibilitySchema = z.enum(["scene", "event"]);
export const ActionPresentationModeSchema = z.enum(["when_conditions_met", "always"]);
export const ChoiceLoadingSchema = z.object({
  durationMs: z.number().int().nonnegative().optional(),
  transitionType: z.enum(["activity", "region_travel"]).optional(),
});

export const DailyLimitSchema = z.object({
  key: z.string().min(1),
  max: z.number().int().positive(),
});

export const ActionDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ActionTypeSchema,
  outcomeHint: z.string().default("Push the situation forward."),
  showOutcomeHint: z.boolean().optional(),
  loading: ChoiceLoadingSchema.optional(),
  visibility: ActionVisibilitySchema.default("scene"),
  presentationMode: ActionPresentationModeSchema.default("when_conditions_met"),
  locationIds: z.array(z.string()).default([]),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  failureEffects: z.array(EffectSchema).default([]),
  failureNote: z.string().optional(),
  systemNote: z.string().nullable().optional(),
  nextEventId: z.string().optional(),
  nextSceneId: z.string().optional(),
  dailyLimit: DailyLimitSchema.optional(),
  activity: ActivityDefinitionSchema.nullable().optional(),
  resourceUse: z.object({ siteId: z.string().min(1), cost: z.number().int().positive(), effort: z.string().min(1).optional(), directFromEntry: z.boolean().optional() }).nullable().optional(),
  tags: z.array(z.string()).default([]),
  riskHint: z.enum(["low", "medium", "high"]).optional(),
  skillUse: SkillUseSchema.optional(),
});

export type GameAction = z.infer<typeof GameActionSchema>;
export type ChoiceLoading = z.infer<typeof ChoiceLoadingSchema>;
export type DailyLimit = z.infer<typeof DailyLimitSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
