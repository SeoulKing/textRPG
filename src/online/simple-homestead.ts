import { z } from "zod";
import type { GameState } from "../game/schemas/game-state";
import { OnlineError } from "./accounts";
import { prepareVillageDelivery, VillageProgressSchema, villageView } from "./simple-homestead-village";

export const SIMPLE_HOMESTEAD_ACTIONS = [
  "plant", "water", "harvest", "rest", "explore", "strike",
  "skill", "guard", "befriend", "retreat", "switch", "claim", "plant_herb", "treat",
  "care", "deliver",
] as const;

export interface SimpleHomesteadAction {
  action: typeof SIMPLE_HOMESTEAD_ACTIONS[number];
  revision: number;
  plot?: number;
  spiritId?: string;
  encounter?: string;
  requestId?: string;
}

export type SimpleHomesteadArea = "home" | "forest" | "village";

type Element = "ember" | "leaf" | "water";
type Intent = "strike" | "skill" | "guard";
type TurnAction = "strike" | "skill" | "guard" | "treat" | "switch";

const partySpecies = ["embertail", "mossantler", "ripplescale", "ashwing"] as const;
const guardianId = "oakkeeper";
const spiritIds = [...partySpecies, guardianId] as const;
type SpiritId = typeof spiritIds[number];
type PlotStage = "empty" | "seed" | "sprout" | "ready";
type Crop = "starberry" | "moonleaf";

const standardEnemyPower = { strike: 3, skill: 5 };
const guardianEnemyPower = { strike: 4, skill: 7 };

const spirits: Record<SpiritId, {
  name: string;
  element: Element;
  maxHp: number;
  skillName: string;
  pattern: readonly [Intent, ...Intent[]];
  enemyPower?: { strike: number; skill: number };
}> = {
  embertail: { name: "잔불꼬리", element: "ember", maxHp: 24, skillName: "잔불 튀기기", pattern: ["strike"] },
  mossantler: { name: "이끼뿔", element: "leaf", maxHp: 18, skillName: "덩굴 휘감기", pattern: ["strike", "skill", "guard"] },
  ripplescale: {
    name: "물비늘", element: "water", maxHp: 22, skillName: "물결 들이치기",
    pattern: ["skill", "guard", "strike"], enemyPower: { ...standardEnemyPower, skill: 7 },
  },
  ashwing: {
    name: "잿불날개", element: "ember", maxHp: 20, skillName: "재꽃 피우기",
    pattern: ["guard", "strike", "skill"], enemyPower: { ...standardEnemyPower, strike: 5 },
  },
  oakkeeper: {
    name: "참나무지기", element: "leaf", maxHp: 32, skillName: "뿌리 내리치기",
    pattern: ["guard", "strike", "skill", "skill"], enemyPower: guardianEnemyPower,
  },
};

const forestTrails = [
  { id: "moss-log", name: "이끼 덮인 고목", hint: "덩굴이 여기저기 뻗어 있습니다. 잎 정령이 다녀간 흔적입니다.", spirit: "mossantler" },
  { id: "shallow-ford", name: "얕은 여울", hint: "물살을 거슬러 잔물결이 번집니다. 물비늘의 첫 기술이 강합니다.", spirit: "ripplescale" },
  { id: "warm-ashrock", name: "따뜻한 잿바위", hint: "바위틈에서 온기가 느껴집니다. 잿불날개는 먼저 방어하고 강한 기본 공격을 합니다.", spirit: "ashwing" },
] as const;
const guardianTrail = {
  id: "old-oak",
  name: "오래된 참나무",
  hint: "꺼진 등불 아래에서 강한 잎 정령이 길을 지킵니다.",
  spirit: guardianId,
} as const;
const advantagedAgainst: Record<Element, Element> = { ember: "leaf", leaf: "water", water: "ember" };
const saveFlag = "arcana_simple_homestead_v1";
const openingMessage = "잔불꼬리가 함께합니다. 밭에 씨앗을 심거나 숲에서 야생 정령을 찾아보세요.";
const maximumBond = 2;
const emberFocusDamage = 1;
const emberBondDamage = 2;
const mossSkillHealing = 2;
const mossBondHealing = 3;
const rippleSkillReduction = 1;
const ashwingGuardRatio = 0.75;
const treatmentHealing = 6;
const maximumDuelLog = 5;
const skillTraits: Record<typeof partySpecies[number], string> = {
  embertail: `집중 중 방어 적용 전 기술 피해 ${emberFocusDamage} 증가`,
  mossantler: `기술 사용 시 체력 최대 ${mossSkillHealing} 회복`,
  ripplescale: `기술 사용 턴 반격 피해 ${rippleSkillReduction} 감소`,
  ashwing: `상대가 방어할 때 기술 피해 ${ashwingGuardRatio * 100}% 적용`,
};
const skillBonuses: Record<typeof partySpecies[number], string> = {
  embertail: `방어 적용 전 기술 피해 ${emberBondDamage} 증가`,
  mossantler: `자신의 체력 ${mossBondHealing} 회복`,
  ripplescale: "이번 턴에 받는 반격 피해 절반",
  ashwing: "상대의 방어 무시",
};

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duelImpactSchema = z.object({
  allyName: z.string().min(1).max(64),
  enemyName: z.string().min(1).max(64),
  dealt: counter,
  received: counter,
  healed: counter,
  allyFainted: z.boolean(),
  enemyDefeated: z.boolean(),
});
const duelFinishSchema = z.object({
  kind: z.enum(["victory", "defeat", "recruit", "retreat"]),
  enemyName: z.string().min(1).max(64),
  seedsGained: counter,
  berriesSpent: counter,
  bond: z.object({ name: z.string().min(1).max(64), level: counter.min(1).max(maximumBond) }).optional(),
  guardianRestored: z.boolean(),
});
const spiritSchema = z.object({ id: z.enum(spiritIds), hp: counter });
const companionSchema = spiritSchema.extend({
  id: z.enum(partySpecies),
  bond: counter.max(maximumBond).default(0),
  lastCaredDay: counter.default(0),
});
const plotSchema = z.object({
  stage: z.enum(["empty", "seed", "sprout", "ready"]),
  watered: z.boolean(),
  crop: z.enum(["starberry", "moonleaf"]).nullable().optional(),
}).transform(plot => ({ ...plot, crop: plot.stage === "empty" ? null : plot.crop ?? "starberry" }));
const homesteadSchema = z.object({
  revision: counter,
  day: counter.min(1),
  seeds: counter,
  berries: counter,
  herbs: counter.default(0),
  plots: z.array(plotSchema).length(3),
  party: z.array(companionSchema).min(1).max(partySpecies.length),
  active: z.enum(spiritIds),
  battle: z.object({
    enemy: spiritSchema,
    enemyPower: z.object({ strike: counter.min(1), skill: counter.min(1) }).optional(),
    turn: counter.min(1),
    focused: z.boolean(),
    skillReady: z.boolean().default(true),
    skillTraitsEnabled: z.boolean().default(false),
  }).nullable(),
  duelLog: z.array(z.object({
    turn: counter.min(1),
    action: z.string(),
    result: z.string(),
    impact: duelImpactSchema.optional(),
    finish: duelFinishSchema.optional(),
  })).max(maximumDuelLog).default([]),
  expeditions: counter,
  wins: counter,
  harvested: z.boolean().optional(),
  questClaimed: z.boolean().default(false),
  herbHarvested: z.boolean().default(false),
  guardianDefeated: z.boolean().default(false),
  village: VillageProgressSchema,
  message: z.string(),
}).transform(state => ({
  ...state,
  harvested: state.harvested ?? (state.berries > 0 || state.party.length > 1),
})).refine(({ party, active, battle }) => (
  party.some(spirit => spirit.id === active) &&
  new Set(party.map(spirit => spirit.id)).size === party.length &&
  party.every(spirit => spirit.hp <= spirits[spirit.id].maxHp) &&
  (!battle || (battle.enemy.hp > 0 && battle.enemy.hp <= spirits[battle.enemy.id].maxHp &&
    party.some(spirit => spirit.id === active && spirit.hp > 0)))
));

type Homestead = z.infer<typeof homesteadSchema>;
type Spirit = z.infer<typeof spiritSchema>;
type Companion = z.infer<typeof companionSchema>;
type Battle = NonNullable<Homestead["battle"]>;
type DuelImpact = z.infer<typeof duelImpactSchema>;
type DuelFinish = z.infer<typeof duelFinishSchema>;

interface SpiritView {
  id: string;
  name: string;
  element: Element;
  hp: number;
  maxHp: number;
  skillName: string;
}

interface TurnOutcome {
  dealt: number;
  received: number;
  healed: number;
  remainingHp: number;
  enemyDefeated: boolean;
  actorFainted: boolean;
}

interface BattlePreview {
  strike: TurnOutcome;
  skill: TurnOutcome | null;
  guard: TurnOutcome;
  treat: TurnOutcome | null;
  switches: Record<string, TurnOutcome>;
}

export interface SimpleHomesteadView {
  revision: number;
  day: number;
  seeds: number;
  berries: number;
  herbs: number;
  plots: { index: number; stage: PlotStage; watered: boolean; crop: Crop | null }[];
  party: (SpiritView & { bond: number; skillTrait: string; skillBonus: string; canCare: boolean })[];
  active: string;
  battle: {
    enemy: SpiritView & { recruitable: boolean };
    turn: number;
    intent: Intent;
    intentLabel: string;
    focused: boolean;
    skillReady: boolean;
    skillTraitsEnabled: boolean;
    befriendBelowHp: number;
    canBefriend: boolean;
    preview: BattlePreview;
  } | null;
  duelLog: Homestead["duelLog"];
  encounters: { id: string; name: string; hint: string }[];
  quest: {
    harvested: boolean;
    recruited: boolean;
    won: boolean;
    claimed: boolean;
    canClaim: boolean;
  };
  chapter: {
    herbsUnlocked: boolean;
    herbHarvested: boolean;
    guardianDefeated: boolean;
  };
  village: ReturnType<typeof villageView>;
  wins: number;
  message: string;
}

function startingHomestead(): Homestead {
  return {
    revision: 0,
    day: 1,
    seeds: 3,
    berries: 0,
    herbs: 0,
    plots: Array.from({ length: 3 }, () => ({ stage: "empty", watered: false, crop: null })),
    party: [{ id: "embertail", hp: spirits.embertail.maxHp, bond: 0, lastCaredDay: 0 }],
    active: "embertail",
    battle: null,
    duelLog: [],
    expeditions: 0,
    wins: 0,
    harvested: false,
    questClaimed: false,
    herbHarvested: false,
    guardianDefeated: false,
    village: VillageProgressSchema.parse(undefined),
    message: openingMessage,
  };
}

function readHomestead(flags: GameState["flags"]): Homestead {
  const saved = flags[saveFlag];
  if (saved === undefined) return startingHomestead();
  if (typeof saved === "string") {
    try {
      const result = homesteadSchema.safeParse(JSON.parse(saved));
      if (result.success) return result.data;
    } catch {
      // Keep the saved value intact when the homestead cannot be read.
    }
  }
  throw new OnlineError("simple_homestead_save", "밭과 정령의 저장 상태를 읽을 수 없습니다.");
}

function spiritView(spirit: Spirit): SpiritView {
  const { name, element, maxHp, skillName } = spirits[spirit.id];
  return { id: spirit.id, hp: spirit.hp, name, element, maxHp, skillName };
}

function enemyIntent(battle: Battle): Intent {
  const { pattern } = spirits[battle.enemy.id];
  return pattern[(battle.turn - 1) % pattern.length];
}

function duelMoveLabel(intent: Intent, skillName: string): string {
  return { strike: "기본 공격", skill: skillName, guard: "방어" }[intent];
}

function befriendThreshold(spirit: Spirit): number {
  return Math.floor(spirits[spirit.id].maxHp / 2);
}

function questView(state: Homestead): SimpleHomesteadView["quest"] {
  const { harvested, party, wins, questClaimed: claimed, battle } = state;
  const recruited = party.length > 1;
  const won = wins > 0;
  return { harvested, recruited, won, claimed, canClaim: harvested && recruited && won && !claimed && !battle };
}

function guardianAvailable(state: Homestead): boolean {
  return state.questClaimed && state.herbHarvested && !state.guardianDefeated;
}

function careBlockedReason(state: Homestead, spirit: Companion): string | null {
  if (state.battle) return "숲에서 진행 중인 전투를 먼저 마쳐 주세요.";
  if (spirit.bond === maximumBond) return "이 정령과의 유대가 이미 최고 단계입니다.";
  if (spirit.lastCaredDay === state.day) return "이 정령에게는 오늘 이미 별열매를 주었습니다.";
  if (state.berries === 0) return "건넬 별열매가 없습니다.";
  return null;
}

function projectHomestead(state: Homestead, inventory?: Readonly<GameState["inventory"]>): SimpleHomesteadView {
  const { revision, day, seeds, berries, herbs, plots, party, active, battle, duelLog, wins, message } = state;
  const trails = state.expeditions > 0 ? [...forestTrails] : [];
  const encounters = (guardianAvailable(state) ? [...trails, guardianTrail] : trails)
    .map(({ id, name, hint }) => ({ id, name, hint }));
  let battleView: SimpleHomesteadView["battle"] = null;
  const lead = battle ? party.find(spirit => spirit.id === active) : undefined;
  if (battle && lead) {
    const enemy = { ...spiritView(battle.enemy), recruitable: battle.enemy.id !== guardianId };
    const intent = enemyIntent(battle);
    const befriendBelowHp = befriendThreshold(battle.enemy);
    battleView = {
      enemy,
      turn: battle.turn,
      intent,
      intentLabel: duelMoveLabel(intent, enemy.skillName),
      focused: battle.focused,
      skillReady: battle.skillReady,
      skillTraitsEnabled: battle.skillTraitsEnabled,
      befriendBelowHp,
      canBefriend: enemy.recruitable && berries > 0 && enemy.hp <= befriendBelowHp && !party.some(spirit => spirit.id === enemy.id),
      preview: battlePreview(state, battle, lead),
    };
  }
  return {
    revision, day, seeds, berries, herbs, plots: plots.map((plot, index) => ({ index, ...plot })),
    party: party.map(spirit => ({
      ...spiritView(spirit),
      bond: spirit.bond,
      skillTrait: skillTraits[spirit.id],
      skillBonus: skillBonuses[spirit.id],
      canCare: careBlockedReason(state, spirit) === null,
    })),
    active, battle: battleView, duelLog, wins, message,
    encounters,
    quest: questView(state),
    chapter: { herbsUnlocked: state.questClaimed, herbHarvested: state.herbHarvested, guardianDefeated: state.guardianDefeated },
    village: villageView(state.village, state.guardianDefeated, day, inventory),
  };
}

export function simpleHomesteadView(flags: GameState["flags"], inventory?: Readonly<GameState["inventory"]>): SimpleHomesteadView {
  return projectHomestead(readHomestead(flags), inventory);
}

function tendPlot(state: Homestead, action: SimpleHomesteadAction): void {
  const index = action.plot;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= state.plots.length) {
    throw new OnlineError("simple_homestead_plot", "돌볼 밭을 골라 주세요.", 400);
  }
  const plot = state.plots[index];
  if (action.action === "plant" || action.action === "plant_herb") {
    const isHerb = action.action === "plant_herb";
    if (isHerb && !state.questClaimed) {
      throw new OnlineError("simple_homestead_herb", "숲의 첫 약속 보상을 받으면 달숨풀을 심을 수 있습니다.");
    }
    if (plot.stage !== "empty") throw new OnlineError("simple_homestead_plot", "빈 밭에 씨앗을 심을 수 있습니다.");
    if (state.seeds === 0) throw new OnlineError("simple_homestead_seeds", "씨앗이 없습니다. 숲에서 야생 정령을 이기면 씨앗을 얻습니다.");
    state.seeds--;
    plot.stage = "seed";
    plot.crop = isHerb ? "moonleaf" : "starberry";
    state.message = isHerb ? "달숨풀을 심었습니다. 물을 주고 하루 쉬면 수확할 수 있습니다."
      : "별열매 씨앗을 심었습니다. 물을 주고 쉬면 한 단계 자랍니다.";
    return;
  }
  if (action.action === "water") {
    if (plot.stage !== "seed" && plot.stage !== "sprout") {
      throw new OnlineError("simple_homestead_plot", "씨앗이나 새싹에 물을 줄 수 있습니다.");
    }
    if (plot.watered) throw new OnlineError("simple_homestead_plot", "오늘은 이미 물을 주었습니다.");
    plot.watered = true;
    state.message = "밭에 물을 주었습니다.";
    return;
  }
  if (plot.stage !== "ready") {
    throw new OnlineError("simple_homestead_plot", plot.crop === "moonleaf" ? "달숨풀이 아직 덜 자랐습니다." : "별열매가 아직 익지 않았습니다.");
  }
  state.seeds++;
  state.harvested = true;
  if (plot.crop === "moonleaf") {
    const firstHarvest = !state.herbHarvested;
    state.herbs++;
    state.herbHarvested = true;
    state.message = "씨앗 1개와 달숨풀 1개를 거뒀습니다.";
    if (firstHarvest) state.message += " 숲의 오래된 참나무로 가는 길이 열렸습니다.";
  } else {
    state.berries += 2;
    state.message = "수확했습니다. 씨앗 1개와 별열매 2개를 얻었습니다.";
  }
  plot.stage = "empty";
  plot.watered = false;
  plot.crop = null;
}

function restAtHome(state: Homestead): void {
  state.day++;
  for (const plot of state.plots) {
    if (plot.watered && plot.stage === "seed") plot.stage = plot.crop === "moonleaf" ? "ready" : "sprout";
    else if (plot.watered && plot.stage === "sprout") plot.stage = "ready";
    plot.watered = false;
  }
  for (const spirit of state.party) spirit.hp = spirits[spirit.id].maxHp;
  state.message = `${state.day}일째가 밝았습니다. 모든 정령의 체력이 회복되었습니다.`;
}

function claimQuest(state: Homestead): void {
  if (state.questClaimed) throw new OnlineError("simple_homestead_quest", "숲의 첫 약속 보상을 이미 받았습니다.");
  if (!questView(state).canClaim) {
    throw new OnlineError("simple_homestead_quest", "수확과 정령 영입, 전투 승리를 한 번씩 완료해 주세요.");
  }
  state.questClaimed = true;
  state.seeds += 2;
  state.berries++;
  state.message = "숲의 첫 약속을 마쳤습니다. 씨앗 2개와 별열매 1개를 받았습니다.";
}

function exploreForest(state: Homestead, encounter: string | undefined): void {
  if (!state.party.some(spirit => spirit.hp > 0)) {
    throw new OnlineError("simple_homestead_exhausted", "집에서 쉬면 정령의 체력이 회복됩니다.");
  }
  let enemy: SpiritId = forestTrails[state.expeditions % forestTrails.length].spirit;
  if (encounter !== undefined) {
    const chosen = encounter === guardianTrail.id && guardianAvailable(state) ? guardianTrail
      : state.expeditions > 0 && forestTrails.find(candidate => candidate.id === encounter);
    if (!chosen) throw new OnlineError("simple_homestead_encounter", "지금 탐색할 수 있는 숲길을 골라 주세요.");
    enemy = chosen.spirit;
  }
  if (enemy !== guardianId) state.expeditions++;
  const definition = spirits[enemy];
  state.battle = {
    enemy: { id: enemy, hp: definition.maxHp },
    enemyPower: { ...(definition.enemyPower ?? standardEnemyPower) },
    turn: 1,
    focused: false,
    skillReady: true,
    skillTraitsEnabled: true,
  };
  state.duelLog = [];
  state.message = enemy === guardianId ? "참나무지기가 등불 앞을 막아섰습니다. 상대의 예고를 보고 행동을 고르세요."
    : `야생 정령 ${spirits[enemy].name} 발견. 상대의 예고를 보고 행동을 고르세요.`;
}

function skillDamage(attacker: Spirit, recipient: Spirit, base: number): number {
  const from = spirits[attacker.id].element;
  const to = spirits[recipient.id].element;
  if (advantagedAgainst[from] === to) return Math.floor(base * 1.5);
  if (advantagedAgainst[to] === from) return Math.floor(base / 2);
  return base;
}

function isInjured(spirit: Companion | undefined): spirit is Companion {
  return spirit !== undefined && spirit.hp > 0 && spirit.hp < spirits[spirit.id].maxHp;
}

function healingAmount(spirit: Spirit, amount: number): number {
  return Math.min(amount, spirits[spirit.id].maxHp - spirit.hp);
}

function assessTurn(battle: Battle, actor: Companion, action: TurnAction) {
  const { enemy } = battle;
  const intent = enemyIntent(battle);
  const skill = action === "skill" ? actor.id : undefined;
  const bondedSkill = actor.bond === maximumBond ? skill : undefined;
  const traitSkill = battle.skillTraitsEnabled ? skill : undefined;
  const bypassedGuard = intent === "guard" && bondedSkill === "ashwing";
  const guardedByBond = intent !== "guard" && bondedSkill === "ripplescale";

  let dealt = 0;
  let traitDamageBonus = 0;
  if (action === "strike" || action === "skill") {
    const base = action === "skill" ? skillDamage(actor, enemy, 6) : 4;
    const damage = base + (battle.focused ? 2 : 0) + (bondedSkill === "embertail" ? emberBondDamage : 0);
    const guardRatio = intent === "guard" && !bypassedGuard ? 0.5 : 1;
    const focusDamage = traitSkill === "embertail" && battle.focused ? emberFocusDamage : 0;
    const traitGuardRatio = traitSkill === "ashwing" && guardRatio === 0.5 ? ashwingGuardRatio : guardRatio;
    dealt = Math.min(enemy.hp, Math.floor((damage + focusDamage) * traitGuardRatio));
    traitDamageBonus = Math.max(0, dealt - Math.floor(damage * guardRatio));
  }
  let healed = 0;
  if (bondedSkill === "mossantler") healed = healingAmount(actor, mossBondHealing);
  else if (traitSkill === "mossantler") healed = healingAmount(actor, mossSkillHealing);
  if (action === "treat") healed = healingAmount(actor, treatmentHealing);

  const enemyDefeated = dealt === enemy.hp;
  let received = 0;
  let traitDamagePrevented = 0;
  if (!enemyDefeated && intent !== "guard") {
    const power = battle.enemyPower ?? (enemy.id === guardianId ? guardianEnemyPower : standardEnemyPower);
    const damage = intent === "skill" ? skillDamage(enemy, actor, power.skill) : power.strike;
    const dampenedByTrait = traitSkill === "ripplescale" && !guardedByBond;
    let reducedDamage = damage;
    if (action === "guard" || guardedByBond) reducedDamage = Math.floor(damage / 2);
    else if (dampenedByTrait) reducedDamage = Math.max(0, damage - rippleSkillReduction);
    received = Math.min(actor.hp + healed, reducedDamage);
    if (dampenedByTrait) traitDamagePrevented = Math.min(actor.hp + healed, damage) - received;
  }
  const remainingHp = actor.hp + healed - received;
  const outcome: TurnOutcome = { dealt, received, healed, remainingHp, enemyDefeated, actorFainted: remainingHp === 0 };
  return { outcome, intent, bondedSkill, bypassedGuard, guardedByBond, traitDamageBonus, traitDamagePrevented };
}

function duelImpact(battle: Battle, actor: Companion, outcome: TurnOutcome): DuelImpact {
  const { dealt, received, healed, actorFainted, enemyDefeated } = outcome;
  return {
    allyName: spirits[actor.id].name,
    enemyName: spirits[battle.enemy.id].name,
    dealt, received, healed, allyFainted: actorFainted, enemyDefeated,
  };
}

function battlePreview(state: Homestead, battle: Battle, active: Companion): BattlePreview {
  const switches = Object.fromEntries(state.party
    .filter(spirit => spirit.id !== active.id && spirit.hp > 0)
    .map(spirit => [spirit.id, assessTurn(battle, spirit, "switch").outcome] as const));

  return {
    strike: assessTurn(battle, active, "strike").outcome,
    skill: battle.skillReady ? assessTurn(battle, active, "skill").outcome : null,
    guard: assessTurn(battle, active, "guard").outcome,
    treat: state.herbs > 0 && isInjured(active) ? assessTurn(battle, active, "treat").outcome : null,
    switches,
  };
}

function increaseBond(state: Homestead, spirit: Companion): void {
  if (spirit.bond === maximumBond) return;
  spirit.bond++;
  state.message += ` ${spirits[spirit.id].name}의 유대가 ${spirit.bond}단계로 올랐습니다.`;
  if (spirit.bond === maximumBond) {
    state.message += ` 이제 정령 기술에 유대 효과가 적용됩니다. (${skillBonuses[spirit.id]})`;
  }
}

function careForSpirit(state: Homestead, spiritId: string | undefined): void {
  const spirit = state.party.find(companion => companion.id === spiritId);
  if (!spirit) throw new OnlineError("simple_homestead_care", "별열매를 줄 동료 정령을 골라 주세요.");
  const blocked = careBlockedReason(state, spirit);
  if (blocked) throw new OnlineError("simple_homestead_care", blocked);

  state.berries--;
  spirit.lastCaredDay = state.day;
  state.message = `${spirits[spirit.id].name}에게 별열매 1개를 건넸습니다.`;
  increaseBond(state, spirit);
}

function enemyTurn(state: Homestead, battle: Battle, active: Spirit, intent: Intent, received: number): void {
  const enemy = spirits[battle.enemy.id];
  state.message += ` ${enemy.name}의 ${duelMoveLabel(intent, enemy.skillName)}.`;
  if (intent !== "guard") {
    active.hp -= received;
    state.message += ` ${spirits[active.id].name}의 체력이 ${received} 줄었습니다.`;
  }
  battle.turn++;
  if (active.hp > 0) return;

  state.message += " 선두 정령이 쓰러졌습니다.";
  const replacement = state.party.find(spirit => spirit.hp > 0);
  if (replacement) {
    state.active = replacement.id;
    battle.focused = false;
    state.message += ` ${spirits[replacement.id].name} 출전.`;
    return;
  }

  state.battle = null;
  state.message += " 모든 정령이 지쳤습니다. 집에서 쉬면 다시 탐색할 수 있습니다.";
}

function befriendSpirit(state: Homestead, battle: Battle): void {
  const { enemy } = battle;
  const { id, hp } = enemy;
  if (id === guardianId) {
    throw new OnlineError("simple_homestead_befriend", "참나무지기는 숲을 지키는 정령으로 동료가 될 수 없습니다.");
  }
  if (state.party.some(spirit => spirit.id === id)) {
    throw new OnlineError("simple_homestead_befriend", "이미 같은 종류의 정령과 함께하고 있습니다.");
  }
  if (state.berries === 0) throw new OnlineError("simple_homestead_befriend", "건넬 별열매가 없습니다.");
  if (hp > befriendThreshold(enemy)) {
    throw new OnlineError("simple_homestead_befriend", `상대 체력이 ${befriendThreshold(enemy)} 이하여야 합니다.`);
  }
  state.berries--;
  state.party.push({ id, hp, bond: 0, lastCaredDay: 0 });
  state.battle = null;
  state.message = `${spirits[id].name} 합류. 별열매 1개를 건넸습니다.`;
}

function resolveTurn(state: Homestead, battle: Battle, action: "strike" | "skill" | "guard"): DuelImpact {
  const active = state.party.find(spirit => spirit.id === state.active && spirit.hp > 0);
  if (!active) throw new OnlineError("simple_homestead_exhausted", "전투에 나설 정령이 없습니다.");
  if (action === "skill" && !battle.skillReady) {
    throw new OnlineError("simple_homestead_skill", "정령 기술을 다시 쓰려면 한 턴을 기다려 주세요.");
  }
  const { outcome, intent, bondedSkill, bypassedGuard, guardedByBond, traitDamageBonus, traitDamagePrevented } = assessTurn(battle, active, action);
  const { dealt, healed, received, enemyDefeated } = outcome;
  battle.skillReady = action !== "skill";
  const { enemy } = battle;
  if (action === "guard") {
    battle.focused = true;
    state.message = "방어 자세를 취했습니다. 다음 공격의 피해가 2 증가합니다.";
  } else {
    battle.focused = false;
    enemy.hp -= dealt;
    state.message = `${spirits[enemy.id].name}의 체력이 ${dealt} 줄었습니다.`;
    if (bondedSkill === "embertail") state.message += ` 유대 효과로 기술 피해가 ${emberBondDamage} 증가했습니다.`;
    if (bypassedGuard) state.message += " 유대 효과로 상대의 방어를 무시했습니다.";
    if (traitDamageBonus > 0) {
      state.message += active.id === "embertail"
        ? ` 집중한 잔불이 피해를 ${traitDamageBonus} 더 주었습니다.`
        : ` 재꽃이 방어를 일부 뚫어 피해를 ${traitDamageBonus} 더 주었습니다.`;
    }
    if (healed > 0) {
      active.hp += healed;
      state.message += bondedSkill === "mossantler"
        ? ` 유대 효과로 체력을 ${healed} 회복했습니다.`
        : ` 덩굴이 체력을 ${healed} 회복했습니다.`;
    }
    if (enemyDefeated) {
      state.battle = null;
      state.wins++;
      state.seeds++;
      if (enemy.id === guardianId) {
        state.guardianDefeated = true;
        state.message += " 오래된 참나무에 등불이 다시 켜졌습니다. 씨앗 1개를 얻었으며 광장에서 마을 의뢰가 열렸습니다.";
      } else {
        state.message += " 전투에서 이겨 씨앗 1개를 얻었습니다.";
      }
      increaseBond(state, active);
      return duelImpact(battle, active, outcome);
    }
  }
  if (guardedByBond) state.message += " 유대 효과로 이번 턴에 받는 반격 피해가 절반으로 줄었습니다.";
  if (traitDamagePrevented > 0) state.message += ` 물결이 반격 피해를 ${traitDamagePrevented} 줄였습니다.`;
  enemyTurn(state, battle, active, intent, received);
  return duelImpact(battle, active, outcome);
}

function treatSpirit(state: Homestead): DuelImpact | undefined {
  const active = state.party.find(spirit => spirit.id === state.active);
  if (!isInjured(active)) {
    throw new OnlineError("simple_homestead_treat", "체력이 남아 있고 상처 입은 선두 정령에게 달숨풀을 쓸 수 있습니다.");
  }
  if (state.herbs === 0) throw new OnlineError("simple_homestead_treat", "쓸 달숨풀이 없습니다.");

  const { battle } = state;
  const turn = battle ? assessTurn(battle, active, "treat") : undefined;
  const healed = turn?.outcome.healed ?? healingAmount(active, treatmentHealing);
  active.hp += healed;
  state.herbs--;
  state.message = `달숨풀 1개를 써서 ${spirits[active.id].name}의 체력을 ${healed} 회복했습니다.`;
  if (battle && turn) {
    battle.skillReady = true;
    enemyTurn(state, battle, active, turn.intent, turn.outcome.received);
    return duelImpact(battle, active, turn.outcome);
  }
  return undefined;
}

function switchSpirit(state: Homestead, spiritId: string | undefined): { name: string; impact?: DuelImpact } {
  const entering = state.party.find(spirit => spirit.id === spiritId && spirit.hp > 0);
  if (!entering) throw new OnlineError("simple_homestead_switch", "체력이 남은 동료 정령을 골라 주세요.");
  if (entering.id === state.active) throw new OnlineError("simple_homestead_switch", "이미 함께 나선 정령입니다.");
  const { name } = spirits[entering.id];
  state.active = entering.id;
  state.message = `${name} 출전.`;
  const { battle } = state;
  if (!battle) return { name };

  const { outcome, intent } = assessTurn(battle, entering, "switch");
  battle.focused = false;
  battle.skillReady = true;
  enemyTurn(state, battle, entering, intent, outcome.received);
  return { name, impact: duelImpact(battle, entering, outcome) };
}

export function applySimpleHomesteadAction(
  flags: GameState["flags"],
  action: SimpleHomesteadAction,
  area: SimpleHomesteadArea,
  inventory: GameState["inventory"] = {},
): SimpleHomesteadView {
  const state = readHomestead(flags);
  if (!Number.isSafeInteger(action.revision) || action.revision !== state.revision) {
    throw new OnlineError("simple_homestead_revision", "밭이나 전투 상태가 바뀌었습니다. 화면을 갱신해 다시 선택해 주세요.", 409);
  }

  const { battle, seeds, berries, guardianDefeated } = state;
  const duel = battle && { turn: battle.turn, enemyId: battle.enemy.id };
  const lead = spirits[state.active];
  const leadCompanion = duel ? state.party.find(spirit => spirit.id === state.active) : undefined;
  const previousBond = leadCompanion?.bond ?? 0;
  let duelAction: string | undefined;
  let impact: DuelImpact | undefined;
  let delivery: { itemId: string; remaining: number } | undefined;
  switch (action.action) {
    case "plant":
    case "plant_herb":
    case "water":
    case "harvest":
    case "rest":
    case "claim":
      if (area !== "home") throw new OnlineError("simple_homestead_home", "내 집에서 할 수 있는 행동입니다.");
      if (state.battle) throw new OnlineError("simple_homestead_battle", "숲에서 진행 중인 전투를 먼저 마쳐 주세요.");
      if (action.action === "rest") restAtHome(state);
      else if (action.action === "claim") claimQuest(state);
      else tendPlot(state, action);
      break;
    case "care":
      if (area !== "home") throw new OnlineError("simple_homestead_home", "내 집에서 동료 정령에게 별열매를 줄 수 있습니다.");
      careForSpirit(state, action.spiritId);
      break;
    case "deliver": {
      if (area !== "village") throw new OnlineError("simple_homestead_village", "광장에서 마을 의뢰를 완료할 수 있습니다.");
      if (state.battle) throw new OnlineError("simple_homestead_battle", "숲에서 진행 중인 전투를 먼저 마쳐 주세요.");
      if (!action.requestId) throw new OnlineError("simple_homestead_request", "납품할 의뢰를 골라 주세요.", 400);
      const plan = prepareVillageDelivery(state.village, state.guardianDefeated, state.day, inventory, action.requestId);
      delivery = { itemId: plan.itemId, remaining: inventory[plan.itemId] - plan.quantity };
      state.village = plan.progress;
      state.seeds += plan.seeds;
      state.berries += plan.berries;
      state.herbs += plan.herbs;
      state.message = plan.message;
      break;
    }
    case "switch": {
      if (area === "village") throw new OnlineError("simple_homestead_switch", "내 집이나 연못가 숲에서 동료 정령을 교대할 수 있습니다.");
      if (state.battle && area !== "forest") throw new OnlineError("simple_homestead_forest", "숲에서 전투 중인 정령을 교대할 수 있습니다.");
      const switched = switchSpirit(state, action.spiritId);
      duelAction = `${switched.name} 교대`;
      impact = switched.impact;
      break;
    }
    case "explore":
      if (area !== "forest") throw new OnlineError("simple_homestead_forest", "숲에서 야생 정령을 탐색할 수 있습니다.");
      if (state.battle) throw new OnlineError("simple_homestead_battle", "진행 중인 전투를 먼저 마쳐 주세요.");
      exploreForest(state, action.encounter);
      break;
    case "treat":
      if (area !== "forest") throw new OnlineError("simple_homestead_forest", "숲에서 할 수 있는 행동입니다.");
      impact = treatSpirit(state);
      duelAction = `${lead.name} · 달숨풀 먹이기`;
      break;
    case "strike":
    case "skill":
    case "guard":
    case "befriend":
    case "retreat":
      if (area !== "forest") throw new OnlineError("simple_homestead_forest", "숲에서 할 수 있는 행동입니다.");
      if (!state.battle) throw new OnlineError("simple_homestead_battle", "숲을 탐색해 야생 정령을 먼저 찾아 주세요.");
      if (action.action === "retreat") {
        state.battle = null;
        state.message = "전투에서 물러났습니다.";
        duelAction = `${lead.name} · 물러나기`;
      } else if (action.action === "befriend") {
        befriendSpirit(state, state.battle);
        duelAction = `${lead.name} · 별열매 건네기`;
      } else {
        impact = resolveTurn(state, state.battle, action.action);
        duelAction = `${lead.name} · ${duelMoveLabel(action.action, lead.skillName)}`;
      }
      break;
    default:
      throw new OnlineError("simple_homestead_action", "할 수 없는 행동입니다.", 400);
  }

  if (duel && duelAction !== undefined) {
    const entry: Homestead["duelLog"][number] = {
      turn: duel.turn,
      action: duelAction,
      result: state.message,
      ...(impact ? { impact } : {}),
    };
    if (!state.battle) {
      let kind: DuelFinish["kind"] = "defeat";
      if (action.action === "retreat") kind = "retreat";
      else if (action.action === "befriend") kind = "recruit";
      else if (impact?.enemyDefeated) kind = "victory";

      entry.finish = {
        kind,
        enemyName: spirits[duel.enemyId].name,
        seedsGained: state.seeds - seeds,
        berriesSpent: berries - state.berries,
        guardianRestored: !guardianDefeated && state.guardianDefeated,
      };
      if (kind === "victory" && leadCompanion && leadCompanion.bond > previousBond) {
        entry.finish.bond = { name: lead.name, level: leadCompanion.bond };
      }
    }
    state.duelLog.push(entry);
    state.duelLog = state.duelLog.slice(-maximumDuelLog);
  }
  state.revision++;
  const nextInventory = delivery ? { ...inventory, [delivery.itemId]: delivery.remaining } : inventory;
  const view = projectHomestead(state, nextInventory);
  const saved = JSON.stringify(state);
  if (delivery) {
    if (delivery.remaining === 0) delete inventory[delivery.itemId];
    else inventory[delivery.itemId] = delivery.remaining;
  }
  flags[saveFlag] = saved;
  return view;
}
