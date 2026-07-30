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

export const SubwaySituationKindSchema = z.enum(["combat", "social", "hazard"]);
export const SubwayChoicePrimaryIntentSchema = z.enum([
  "attack",
  "defend",
  "evade",
  "persuade",
  "observe",
  "interact",
  "use_item",
  "retreat",
]);
export const SubwayChoiceStyleSchema = z.enum([
  "forceful",
  "careful",
  "quick",
  "cunning",
  "empathetic",
]);
export const SubwayChoiceTargetSchema = z.enum([
  "enemy",
  "actor",
  "self",
  "environment",
  "exit",
]);

export const SubwayChoiceIntentSchema = z.object({
  primary: SubwayChoicePrimaryIntentSchema,
  style: SubwayChoiceStyleSchema,
  target: SubwayChoiceTargetSchema,
  secondary: SubwayChoicePrimaryIntentSchema.optional(),
  itemId: z.string().min(1).max(80).optional(),
}).strict();

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

function legacyIntent(actionToken: unknown) {
  const token = normalizeLegacyActionToken(actionToken);
  if (typeof token !== "string") {
    return { primary: "observe", style: "careful", target: "environment" };
  }
  if (token.startsWith("use_item:")) {
    return {
      primary: "use_item",
      style: "careful",
      target: "enemy",
      itemId: token.slice("use_item:".length),
    };
  }
  switch (token) {
    case "fight":
    case "close_attack":
      return { primary: "attack", style: "forceful", target: "enemy" };
    case "throw_improvised":
      return { primary: "attack", style: "quick", target: "enemy" };
    case "guard":
      return { primary: "defend", style: "careful", target: "self" };
    case "talk":
      return { primary: "persuade", style: "empathetic", target: "actor" };
    case "flee":
      return { primary: "retreat", style: "quick", target: "exit" };
    case "force":
      return { primary: "interact", style: "forceful", target: "environment" };
    case "careful":
      return { primary: "interact", style: "careful", target: "environment" };
    default:
      return { primary: "observe", style: "careful", target: "environment" };
  }
}

export const SubwayEncounterChoiceSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const choice = raw as Record<string, unknown>;
  const actionToken = normalizeLegacyActionToken(
    choice.legacyActionToken ?? choice.actionToken ?? choice.actionId,
  );
  const fallbackId = typeof actionToken === "string"
    ? `legacy:${actionToken}`
    : undefined;
  return {
    id: choice.id ?? choice.choiceId ?? fallbackId,
    label: choice.label,
    effectDescription: choice.effectDescription ??
      (
        choice.effect &&
        typeof choice.effect === "object" &&
        typeof (choice.effect as Record<string, unknown>).description === "string"
          ? (choice.effect as Record<string, unknown>).description
          : ""
      ),
    postChoiceNarrative: choice.postChoiceNarrative ??
      choice.postChoiceScene ??
      (typeof choice.label === "string"
        ? [`나는 ${choice.label.replace(/[.。]$/, "")} 쪽으로 움직이기 시작했다.`]
        : []),
    intent: choice.intent ?? legacyIntent(actionToken),
    legacyActionToken: actionToken,
  };
}, z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(80),
  effectDescription: z.string().max(300).default(""),
  postChoiceNarrative: z.array(z.string().min(1).max(600)).min(1).max(2),
  intent: SubwayChoiceIntentSchema,
  legacyActionToken: SubwayEncounterActionIdSchema.optional(),
}).strict());

export const SubwayEncounterSceneSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const scene = raw as Record<string, unknown>;
  return {
    scenarioId: scene.scenarioId ?? "legacy-subway-situation",
    turnNumber: scene.turnNumber ?? 0,
    kind: scene.kind ?? "combat",
    phase: scene.phase === "combat" ? "active" : (scene.phase ?? "active"),
    title: scene.title,
    paragraphs: scene.paragraphs,
    choices: scene.choices,
    source: scene.source ?? "llm",
    generatedAt: scene.generatedAt,
  };
}, z.object({
  scenarioId: z.string().min(1),
  turnNumber: z.number().int().nonnegative(),
  kind: SubwaySituationKindSchema,
  phase: z.enum(["opening", "active", "resolved"]),
  title: z.string().min(1).max(80),
  paragraphs: z.array(z.string().min(1).max(600)).min(1).max(4),
  choices: z.array(SubwayEncounterChoiceSchema).max(4),
  source: z.enum(["llm", "mixed", "template"]),
  generatedAt: z.string(),
}).strict());

export const SubwayEncounterRollsSchema = z.object({
  action: z.number().int().min(1).max(100).nullable(),
  counter: z.number().int().min(1).max(100).nullable(),
}).strict();

export const SubwayEncounterTurnResultSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const result = raw as Record<string, unknown>;
  const selectedActionToken = normalizeLegacyActionToken(
    result.selectedActionToken ?? result.selectedActionId,
  );
  return {
    ...result,
    selectedChoiceId:
      result.selectedChoiceId ??
      (typeof selectedActionToken === "string" ? `legacy:${selectedActionToken}` : "legacy:unknown"),
    selectedIntent: result.selectedIntent ?? legacyIntent(selectedActionToken),
    selectedActionToken,
    stageAfter: result.stageAfter === "combat" ? "active" : result.stageAfter,
    progressAfter: result.progressAfter ?? 0,
    failureCountAfter: result.failureCountAfter ?? 0,
    relationshipChange: result.relationshipChange ?? 0,
    selectedEffectDescription: result.selectedEffectDescription ?? "",
    statChanges: result.statChanges ?? [],
    itemChanges: result.itemChanges ?? [],
    toolDurabilityChanges: result.toolDurabilityChanges ?? [],
    postChoiceNarrative: result.postChoiceNarrative ?? [],
  };
}, z.object({
  selectedChoiceId: z.string().min(1).max(160),
  selectedIntent: SubwayChoiceIntentSchema,
  selectedEffectDescription: z.string().max(300).default(""),
  selectedActionToken: SubwayEncounterActionIdSchema.optional(),
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
  relationshipChange: z.number().int().min(-100).max(100),
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

export const SubwayEncounterActorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  appearance: z.string().min(1).max(300),
  personality: z.string().min(1).max(200),
  motive: z.string().min(1).max(200),
  relationship: z.number().int().min(-100).max(100).default(0),
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

export const SubwayEventLikelihoodsSchema = z.object({
  combat: z.number().int().min(0).max(100),
  social: z.number().int().min(0).max(100),
  hazard: z.number().int().min(0).max(100),
}).strict();

export const SubwayPendingThreatSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["attack", "pressure", "hazard", "escape"]),
  target: z.enum(["player", "environment", "exit"]),
  method: z.string().min(1).max(240),
  profile: z.enum([
    "standard_attack",
    "social_pressure",
    "environmental_hazard",
    "escape_attempt",
  ]),
}).strict();

export const SubwayGenerationDiagnosticsSchema = z.object({
  latencyMs: z.number().int().nonnegative(),
  repairedFieldCount: z.number().int().nonnegative(),
  droppedChoiceCount: z.number().int().nonnegative(),
  fallback: z.boolean(),
  errorReason: z.string().max(1000).nullable(),
}).strict();

export const SubwayEncounterRewardItemSchema = z.object({
  itemId: z.string().min(1),
  amount: z.number().int().positive(),
}).strict();

export const SubwayEncounterStateSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const encounter = raw as Record<string, unknown>;
  const enemy = encounter.enemy as Record<string, unknown> | null | undefined;
  const kind = encounter.kind ?? "combat";
  const fallbackLikelihoods = kind === "combat"
    ? { combat: 100, social: 0, hazard: 0 }
    : kind === "social"
      ? { combat: 20, social: 60, hazard: 20 }
      : { combat: 20, social: 20, hazard: 60 };
  return {
    ...encounter,
    kind,
    objective:
      encounter.objective ??
      (enemy?.name ? `${String(enemy.name)}에게서 살아남는다.` : "현재 상황을 해결한다."),
    actor: encounter.actor ?? (enemy ? {
      id: enemy.id ?? "legacy-actor",
      name: enemy.name ?? "낯선 생존자",
      appearance: enemy.description ?? "지하 통로에 서 있는 인물이다.",
      personality: "경계심이 강하다.",
      motive: "자신의 영역을 지키려 한다.",
      relationship: 0,
    } : null),
    eventLikelihoods: encounter.eventLikelihoods ?? fallbackLikelihoods,
    dangerTier: encounter.dangerTier ?? 1,
    pendingThreat: encounter.pendingThreat ?? null,
    lastGenerationDiagnostics: encounter.lastGenerationDiagnostics ?? null,
    stage: encounter.stage === "combat" ? "active" : encounter.stage,
    progress: encounter.progress ?? 0,
    targetProgress: encounter.targetProgress ?? 1,
    failureCount: encounter.failureCount ?? 0,
  };
}, z.object({
  id: z.string().min(1),
  kind: SubwaySituationKindSchema,
  objective: z.string().min(1),
  actor: SubwayEncounterActorSchema.nullable(),
  enemy: SubwayEncounterEnemySchema.nullable(),
  eventLikelihoods: SubwayEventLikelihoodsSchema,
  dangerTier: z.number().int().positive().max(10),
  pendingThreat: SubwayPendingThreatSchema.nullable(),
  lastGenerationDiagnostics: SubwayGenerationDiagnosticsSchema.nullable(),
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
export type SubwayChoicePrimaryIntent = z.infer<typeof SubwayChoicePrimaryIntentSchema>;
export type SubwayChoiceStyle = z.infer<typeof SubwayChoiceStyleSchema>;
export type SubwayChoiceIntent = z.infer<typeof SubwayChoiceIntentSchema>;
export type SubwayEncounterStage = z.infer<typeof SubwayEncounterStageSchema>;
export type SubwayEncounterResolution = z.infer<typeof SubwayEncounterResolutionSchema>;
export type SubwayEncounterChoice = z.infer<typeof SubwayEncounterChoiceSchema>;
export type SubwayEncounterScene = z.infer<typeof SubwayEncounterSceneSchema>;
export type SubwayEncounterTurnResult = z.infer<typeof SubwayEncounterTurnResultSchema>;
export type SubwayEncounterActor = z.infer<typeof SubwayEncounterActorSchema>;
export type SubwayPendingThreat = z.infer<typeof SubwayPendingThreatSchema>;
export type SubwayEventLikelihoods = z.infer<typeof SubwayEventLikelihoodsSchema>;
export type SubwayGenerationDiagnostics = z.infer<typeof SubwayGenerationDiagnosticsSchema>;
export type SubwayEncounterState = z.infer<typeof SubwayEncounterStateSchema>;
