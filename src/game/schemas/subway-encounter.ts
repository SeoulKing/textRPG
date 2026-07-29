import { z } from "zod";

const BUILT_IN_ACTION_TOKENS = [
  "fight",
  "talk",
  "flee",
  "observe",
  "careful",
  "force",
  "close_attack",
  "throw_improvised",
  "guard",
] as const;

const builtInActionTokenSet = new Set<string>(BUILT_IN_ACTION_TOKENS);

function normalizeLegacyActionToken(value: unknown) {
  if (value === "strike") return "close_attack";
  if (value === "throw_debris") return "throw_improvised";
  return value;
}

export const SubwayEncounterActionIdSchema = z.string().min(1).max(100).refine(
  (token) =>
    builtInActionTokenSet.has(token) ||
    /^use_item:[A-Za-z][A-Za-z0-9_-]*$/.test(token),
  "Unknown subway situation action token.",
);

export const SubwaySituationKindSchema = z.enum([
  "combat",
  "social",
  "hazard",
]);

export const SubwayEncounterStageSchema = z.preprocess(
  (value) => value === "combat" ? "active" : value,
  z.enum(["opening", "active", "resolved"]),
);

export const SubwayEncounterResolutionSchema = z.enum([
  "victory",
  "talked_down",
  "escaped",
  "resolved",
  "failed",
  "player_defeated",
]);

export const SubwayEncounterChoiceSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const choice = raw as Record<string, unknown>;
  return {
    actionToken: normalizeLegacyActionToken(
      choice.actionToken ?? choice.actionId,
    ),
    label: choice.label,
    postChoiceNarrative: choice.postChoiceNarrative,
  };
}, z.object({
  actionToken: SubwayEncounterActionIdSchema,
  label: z.string().min(1).max(80),
  postChoiceNarrative: z.array(z.string().min(1).max(600)).min(1).max(2).optional(),
}).strict());

export const SubwayEncounterSceneSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const scene = raw as Record<string, unknown>;
  return {
    scenarioId: scene.scenarioId ?? "legacy-subway-situation",
    turnNumber: scene.turnNumber ?? 0,
    kind: scene.kind ?? "combat",
    phase: scene.phase === "combat" ? "active" : (scene.phase ?? "active"),
    title: scene.title,
    paragraphs: scene.paragraphs,
    choices: scene.choices,
    source: scene.source,
    generatedAt: scene.generatedAt,
  };
}, z.object({
  scenarioId: z.string().min(1),
  turnNumber: z.number().int().nonnegative(),
  kind: SubwaySituationKindSchema,
  phase: z.enum(["opening", "active", "resolved"]),
  title: z.string().min(1).max(80),
  paragraphs: z.array(z.string().min(1).max(600)).min(1).max(3),
  choices: z.array(SubwayEncounterChoiceSchema).max(4),
  source: z.literal("llm"),
  generatedAt: z.string(),
}).strict());

export const SubwayEncounterRollsSchema = z.object({
  action: z.number().int().min(1).max(100).nullable(),
  counter: z.number().int().min(1).max(100).nullable(),
}).strict();

export const SubwayEncounterTurnResultSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const result = raw as Record<string, unknown>;
  return {
    ...result,
    selectedActionToken: normalizeLegacyActionToken(
      result.selectedActionToken ?? result.selectedActionId,
    ),
    stageAfter:
      result.stageAfter === "combat" ? "active" : result.stageAfter,
    progressAfter: result.progressAfter ?? 0,
    failureCountAfter: result.failureCountAfter ?? 0,
    statChanges: result.statChanges ?? [],
    itemChanges: result.itemChanges ?? [],
    toolDurabilityChanges: result.toolDurabilityChanges ?? [],
    postChoiceNarrative: result.postChoiceNarrative ?? [],
  };
}, z.object({
  selectedActionToken: SubwayEncounterActionIdSchema,
  selectedLabel: z.string().min(1).max(80),
  success: z.boolean(),
  rolls: SubwayEncounterRollsSchema,
  damageDealt: z.number().int().nonnegative(),
  damageTaken: z.number().int().nonnegative(),
  minutes: z.number().int().nonnegative(),
  playerHpAfter: z.number().int().min(0).max(10),
  enemyHpAfter: z.number().int().nonnegative(),
  progressAfter: z.number().int().nonnegative(),
  failureCountAfter: z.number().int().nonnegative(),
  statChanges: z.array(z.object({
    stat: z.enum(["hp", "mind", "energy"]),
    amount: z.number().int().refine((amount) => amount !== 0),
  }).strict()).max(3),
  itemChanges: z.array(z.object({
    itemId: z.string().min(1),
    amount: z.number().int().refine((amount) => amount !== 0),
  }).strict()),
  toolDurabilityChanges: z.array(z.object({
    itemId: z.string().min(1),
    amount: z.number().int().refine((amount) => amount !== 0),
  }).strict()),
  postChoiceNarrative: z.array(z.string().min(1).max(600)).max(2),
  stageAfter: z.enum(["opening", "active", "resolved"]),
  resolution: SubwayEncounterResolutionSchema.nullable(),
  summary: z.string().min(1).max(240),
}).strict());

export const SubwayEncounterHistoryEntrySchema = z.object({
  turnNumber: z.number().int().positive(),
  result: SubwayEncounterTurnResultSchema,
}).strict();

export const SubwayEncounterEnemySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  maxHp: z.number().int().positive(),
  hp: z.number().int().nonnegative(),
  attack: z.number().int().positive(),
  description: z.string().min(1),
  traits: z.array(z.string().min(1)),
}).strict();

export const SubwayEncounterRewardItemSchema = z.object({
  itemId: z.string().min(1),
  amount: z.number().int().positive(),
}).strict();

export const SubwayEncounterStateSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const encounter = raw as Record<string, unknown>;
  const enemy = encounter.enemy as Record<string, unknown> | null | undefined;
  return {
    ...encounter,
    kind: encounter.kind ?? "combat",
    objective:
      encounter.objective ??
      (enemy?.name ? `${String(enemy.name)}에게서 살아남는다.` : "현재 상황을 해결한다."),
    stage: encounter.stage === "combat" ? "active" : encounter.stage,
    progress: encounter.progress ?? 0,
    targetProgress: encounter.targetProgress ?? 1,
    failureCount: encounter.failureCount ?? 0,
  };
}, z.object({
  id: z.string().min(1),
  kind: SubwaySituationKindSchema,
  objective: z.string().min(1),
  enemy: SubwayEncounterEnemySchema.nullable(),
  stage: z.enum(["opening", "active", "resolved"]),
  resolution: SubwayEncounterResolutionSchema.nullable(),
  turnNumber: z.number().int().nonnegative(),
  progress: z.number().int().nonnegative(),
  targetProgress: z.number().int().positive(),
  failureCount: z.number().int().nonnegative(),
  currentScene: SubwayEncounterSceneSchema.nullable(),
  history: z.array(SubwayEncounterHistoryEntrySchema).max(20),
  rewardItems: z.array(SubwayEncounterRewardItemSchema),
  rewardGranted: z.boolean(),
}).strict());

export type SubwayEncounterActionId = z.infer<typeof SubwayEncounterActionIdSchema>;
export type SubwaySituationKind = z.infer<typeof SubwaySituationKindSchema>;
export type SubwayEncounterStage = z.infer<typeof SubwayEncounterStageSchema>;
export type SubwayEncounterResolution = z.infer<typeof SubwayEncounterResolutionSchema>;
export type SubwayEncounterChoice = z.infer<typeof SubwayEncounterChoiceSchema>;
export type SubwayEncounterScene = z.infer<typeof SubwayEncounterSceneSchema>;
export type SubwayEncounterTurnResult = z.infer<typeof SubwayEncounterTurnResultSchema>;
export type SubwayEncounterState = z.infer<typeof SubwayEncounterStateSchema>;
