import { z } from "zod";
import { baseItems } from "./data/items";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { geminiModel } from "./gemini-client";
import {
  SubwayChoiceIntentSchema,
  SubwayChoicePrimaryIntentSchema,
  SubwayChoiceStyleSchema,
  SubwaySituationKindSchema,
  type GameState,
  type SubwayChoiceIntent,
  type SubwayEncounterActor,
  type SubwayEncounterChoice,
  type SubwayEncounterScene,
  type SubwayEncounterState,
  type SubwayEncounterTurnResult,
  type SubwayGenerationDiagnostics,
  type SubwayPendingThreat,
  type SubwaySituationKind,
} from "./schemas";
import { subwaySituationActionCatalog } from "./subway-encounter";
import { withoutRepeatedSubwayNarrative } from "./subway-narrative";
import {
  generateSubwayRoleJson,
  hasSubwayRoleConfig,
  type SubwayRoleClient,
} from "./subway-role-pipeline";

export const SUBWAY_ENCOUNTER_PROMPT_VERSION = "subway-server-combat-narrative-v5";

export type SubwayEncounterGenerationInput = {
  gameId: string;
  state: GameState;
  latestServerResult?: SubwayEncounterTurnResult | null;
};

export type SubwayEncounterGenerationResult = {
  scene: SubwayEncounterScene;
  eventKind: SubwaySituationKind;
  actor: SubwayEncounterActor | null;
  pendingThreat: SubwayPendingThreat | null;
  storyHooks: string[];
  diagnostics: SubwayGenerationDiagnostics;
};

export type SubwayEncounterSceneGenerator = (
  input: SubwayEncounterGenerationInput,
) => Promise<SubwayEncounterGenerationResult>;

const RawChoiceEffectSchema = z.object({
  type: SubwayChoicePrimaryIntentSchema.optional(),
  action: SubwayChoicePrimaryIntentSchema.optional(),
  description: z.string().max(300).optional(),
  approach: SubwayChoiceStyleSchema.optional(),
  itemId: z.string().min(1).max(80).optional(),
}).passthrough();

const RawThreatSchema = z.object({
  kind: z.enum(["attack", "pressure", "hazard", "escape"]),
  target: z.enum(["player", "environment", "exit"]),
  method: z.string().min(1).max(240),
}).passthrough();

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function asStrings(raw: unknown, max: number, maxLength: number) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.slice(0, maxLength))
    .slice(0, max);
}

function highestLikelihood(
  likelihoods: { combat: number; social: number; hazard: number },
): SubwaySituationKind {
  return (Object.entries(likelihoods) as Array<[SubwaySituationKind, number]>)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "hazard";
}

function defaultActor(
  kind: SubwaySituationKind,
  encounterId: string,
): SubwayEncounterActor | null {
  if (kind === "hazard") return null;
  return {
    id: `${encounterId}:actor`,
    name: kind === "combat" ? "지하 통로의 약탈자" : "경계하는 생존자",
    appearance: kind === "combat"
      ? "낡은 방한복을 걸치고 손에 짧은 쇠막대를 쥐고 있다."
      : "두꺼운 외투 깃을 세우고 일정한 거리를 유지한다.",
    personality: "쉽게 속내를 드러내지 않고 주변을 예민하게 살핀다.",
    motive: kind === "combat"
      ? "자신이 차지한 통로와 물자를 지키려 한다."
      : "낯선 사람에게서 자신과 동료를 보호하려 한다.",
    relationship: 0,
  };
}

function defaultChoiceSpecs(kind: SubwaySituationKind, opening: boolean): Array<{
  label: string;
  intent: SubwayChoiceIntent;
}> {
  if (kind === "combat") {
    return opening
      ? [
          { label: "기습한다", intent: { primary: "attack", style: "forceful", target: "enemy" } },
          { label: "말을 건다", intent: { primary: "persuade", style: "empathetic", target: "actor" } },
          { label: "물러난다", intent: { primary: "retreat", style: "quick", target: "exit" } },
        ]
      : [
          { label: "공격한다", intent: { primary: "attack", style: "forceful", target: "enemy" } },
          { label: "공격을 막는다", intent: { primary: "defend", style: "careful", target: "self" } },
          { label: "옆으로 피한다", intent: { primary: "evade", style: "quick", target: "environment" } },
        ];
  }
  if (kind === "social") {
    return [
      { label: "차분히 설득한다", intent: { primary: "persuade", style: "empathetic", target: "actor" } },
      { label: "의도를 살핀다", intent: { primary: "observe", style: "careful", target: "actor" } },
      { label: "대화에서 물러난다", intent: { primary: "retreat", style: "quick", target: "exit" } },
    ];
  }
  return [
    { label: "주변을 살핀다", intent: { primary: "observe", style: "careful", target: "environment" } },
    { label: "조심스럽게 건넌다", intent: { primary: "interact", style: "careful", target: "environment" } },
    { label: "진입로로 물러난다", intent: { primary: "retreat", style: "quick", target: "exit" } },
  ];
}

type AllowedChoiceIntent = {
  id: string;
  instruction: string;
  intent: SubwayChoiceIntent;
};

function allowedChoiceIntents(
  input: SubwayEncounterGenerationInput,
  kind: SubwaySituationKind,
): AllowedChoiceIntent[] {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  let options: AllowedChoiceIntent[];
  if (kind === "combat" && encounter.stage === "opening") {
    options = [
      {
        id: "attack",
        instruction: "상대가 대비하기 전에 먼저 공격한다.",
        intent: { primary: "attack", style: "forceful", target: "enemy" },
      },
      {
        id: "persuade",
        instruction: "상대에게 침착하게 말을 걸어 물러나게 한다.",
        intent: { primary: "persuade", style: "empathetic", target: "actor" },
      },
      {
        id: "retreat",
        instruction: "진입로 쪽으로 물러나 상황에서 벗어난다.",
        intent: { primary: "retreat", style: "quick", target: "exit" },
      },
    ];
  } else if (kind === "combat") {
    options = [
      {
        id: "attack_forceful",
        instruction: "가까이 붙어 힘으로 공격한다.",
        intent: { primary: "attack", style: "forceful", target: "enemy" },
      },
      {
        id: "attack_quick",
        instruction: "주변 물건이나 빈틈을 이용해 빠르게 공격한다.",
        intent: { primary: "attack", style: "quick", target: "enemy" },
      },
      {
        id: "defend",
        instruction: "상대의 다음 공격을 막아 낸다.",
        intent: { primary: "defend", style: "careful", target: "self" },
      },
      {
        id: "persuade",
        instruction: "싸움을 멈추도록 상대를 설득한다.",
        intent: { primary: "persuade", style: "empathetic", target: "actor" },
      },
      {
        id: "retreat",
        instruction: "거리를 벌리고 진입로 쪽으로 도망친다.",
        intent: { primary: "retreat", style: "quick", target: "exit" },
      },
    ];
  } else if (kind === "social") {
    options = [
      {
        id: "persuade",
        instruction: "상대의 말을 듣고 현실적인 합의점을 제시한다.",
        intent: { primary: "persuade", style: "empathetic", target: "actor" },
      },
      {
        id: "observe",
        instruction: "상대의 말투와 행동을 관찰해 의도를 알아낸다.",
        intent: { primary: "observe", style: "careful", target: "actor" },
      },
      {
        id: "pressure",
        instruction: "강하게 압박해 상대가 물러나게 한다.",
        intent: { primary: "interact", style: "forceful", target: "actor" },
      },
      {
        id: "retreat",
        instruction: "대화를 포기하고 안전한 길로 물러난다.",
        intent: { primary: "retreat", style: "quick", target: "exit" },
      },
    ];
  } else {
    options = [
      {
        id: "observe",
        instruction: "주변 흔적과 구조를 살펴 위험의 규칙을 찾는다.",
        intent: { primary: "observe", style: "careful", target: "environment" },
      },
      {
        id: "interact_careful",
        instruction: "안전한 발판과 손잡이를 확인하며 조심스럽게 통과한다.",
        intent: { primary: "interact", style: "careful", target: "environment" },
      },
      {
        id: "interact_forceful",
        instruction: "위험 구간을 힘과 속도로 밀어붙여 돌파한다.",
        intent: { primary: "interact", style: "forceful", target: "environment" },
      },
      {
        id: "retreat",
        instruction: "현재 경로를 포기하고 진입 지점으로 물러난다.",
        intent: { primary: "retreat", style: "quick", target: "exit" },
      },
    ];
  }

  return options;
}

function adaptChoiceWriterOutput(
  raw: unknown,
  allowedIntents: AllowedChoiceIntent[],
) {
  const source = asRecord(raw);
  const choices = Array.isArray(source.choices) ? source.choices : [];
  const allowed = new Map(allowedIntents.map((entry) => [entry.id, entry]));
  const usedIntentIds = new Set<string>();
  return choices.slice(0, 6).flatMap((candidate) => {
    const choice = asRecord(candidate);
    const intentId = typeof choice.intentId === "string"
      ? choice.intentId.trim()
      : "";
    const selected = allowed.get(intentId);
    if (!selected || usedIntentIds.has(intentId)) {
      return [];
    }
    usedIntentIds.add(intentId);
    return [{
      label: choice.label,
      effect: {
        type: selected.intent.primary,
        approach: selected.intent.style,
        itemId: selected.intent.itemId,
        description: choice.effectDescription,
      },
      intent: selected.intent,
      postChoiceScene: choice.postChoiceScene,
    }];
  }).slice(0, 3);
}

function defaultPostChoice(label: string) {
  const action = label.replace(/[.。]$/, "");
  return [
    `나는 망설임을 접고 ${action} 쪽으로 움직였다.`,
    "주변의 소리와 시선이 한순간 그 움직임을 따라붙었다.",
  ];
}

function serverIntentForAction(
  actionToken: string,
): SubwayChoiceIntent {
  if (actionToken.startsWith("use_item:")) {
    const itemId = actionToken.slice("use_item:".length);
    const item = (baseItems as Record<string, { kind?: string }>)[itemId];
    return {
      primary: "use_item",
      style: "careful",
      target:
        itemId === "makeshiftShield"
          ? "self"
          : item?.kind === "tool" ? "enemy" : "self",
      itemId,
    };
  }
  switch (actionToken) {
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
    case "observe":
      return { primary: "observe", style: "careful", target: "environment" };
    case "force":
      return { primary: "interact", style: "forceful", target: "environment" };
    default:
      return { primary: "interact", style: "careful", target: "environment" };
  }
}

function serverChoiceLabel(
  actionToken: string,
  opening: boolean,
) {
  if (actionToken.startsWith("use_item:")) {
    const itemId = actionToken.slice("use_item:".length);
    const name =
      (baseItems as Record<string, { name?: string }>)[itemId]?.name ?? itemId;
    return `${name}을 사용한다`;
  }
  switch (actionToken) {
    case "fight":
      return "빈틈을 노려 먼저 공격한다";
    case "close_attack":
      return "가까이 붙어 공격한다";
    case "throw_improvised":
      return "주변 물건을 던진다";
    case "guard":
      return "공격을 막고 빈틈을 기다린다";
    case "talk":
      return opening
        ? "무기를 내리라고 설득한다"
        : "싸움을 멈추라고 설득한다";
    case "flee":
      return opening
        ? "계단 쪽으로 물러난다"
        : "거리를 벌리고 후퇴한다";
    case "observe":
      return "상대와 주변을 살핀다";
    case "force":
      return "힘으로 밀어붙인다";
    default:
      return "조심스럽게 움직인다";
  }
}

function serverPostChoiceNarrative(
  actionToken: string,
  label: string,
) {
  if (actionToken.startsWith("use_item:")) {
    return [
      `나는 시선을 상대에게 둔 채 ${label.replace(/[.。]$/, "")}.`,
      "손안의 물건을 고쳐 쥐는 동안 발밑의 진동과 상대의 숨소리가 한층 선명해졌다.",
    ];
  }
  switch (actionToken) {
    case "fight":
    case "close_attack":
      return [
        "나는 호흡을 짧게 끊고 상대의 빈틈을 향해 몸을 밀어 넣었다.",
        "신발 밑에서 모래가 밀리며 둘 사이의 거리가 단숨에 사라졌다.",
      ];
    case "throw_improvised":
      return [
        "나는 발치의 단단한 조각을 움켜쥐고 상대의 움직임을 따라 팔을 휘둘렀다.",
        "날아간 물체가 어둠을 가르는 동안 상대의 어깨와 시선이 동시에 흔들렸다.",
      ];
    case "guard":
      return [
        "나는 무게중심을 낮추고 팔과 어깨로 급소를 가렸다.",
        "퇴로를 등지지 않은 채 상대의 손목과 무기 끝이 움직이는 순간을 기다렸다.",
      ];
    case "talk":
      return [
        "나는 공격할 듯 굳어 있던 자세를 풀지 않은 채 낮은 목소리로 말을 건넸다.",
        "쇳소리와 거친 숨 사이로 짧은 문장이 파고들자 상대의 시선이 미세하게 움직였다.",
      ];
    case "flee":
      return [
        "나는 상대에게 등을 완전히 보이지 않은 채 계단 쪽으로 발을 옮겼다.",
        "거리를 재며 물러나는 동안 깨진 타일과 난간의 위치를 빠르게 눈에 담았다.",
      ];
    default:
      return defaultPostChoice(label);
  }
}

function serverEncounterChoices(
  input: SubwayEncounterGenerationInput,
): SubwayEncounterChoice[] {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  if (encounter.stage === "resolved") return [];
  const opening = encounter.stage === "opening";
  return subwaySituationActionCatalog(input.state, encounter)
    .slice(0, 20)
    .map((entry, index) => {
      const label = serverChoiceLabel(entry.actionToken, opening);
      return {
        id:
          `${encounter.id}:${encounter.turnNumber}:server:${index + 1}:` +
          entry.actionToken.replace(":", "-"),
        label,
        effectDescription: entry.mechanicalHint,
        postChoiceNarrative: serverPostChoiceNarrative(
          entry.actionToken,
          label,
        ),
        intent: serverIntentForAction(entry.actionToken),
        legacyActionToken: entry.actionToken,
      };
    });
}

function serverPendingThreat(
  encounter: SubwayEncounterState,
  resolved: boolean,
): SubwayPendingThreat | null {
  if (resolved) return null;
  const kind = encounter.kind;
  const enemyTraits = new Set(encounter.enemy?.traits ?? []);
  const combatMethod = enemyTraits.has("boss")
    ? "구역 지배자가 퇴로를 막으며 무거운 결정타를 준비한다."
    : enemyTraits.has("agile")
      ? "상대가 기둥 뒤로 몸을 흘리며 사각에서 파고들 틈을 노린다."
      : enemyTraits.has("armored")
        ? "상대가 보호구를 앞세워 거리를 좁히며 묵직한 타격을 준비한다."
        : enemyTraits.has("heavy")
          ? "상대가 무기를 크게 당겨 다음 한 번에 힘을 집중한다."
          : "상대가 무기를 고쳐 쥐고 다음 빈틈을 노린다.";
  return {
    id: `${encounter.id}:threat:${encounter.turnNumber}`,
    kind:
      kind === "combat" ? "attack" : kind === "social" ? "pressure" : "hazard",
    target: kind === "combat" ? "player" : "environment",
    method:
      kind === "combat"
        ? combatMethod
        : kind === "social"
          ? "상대의 경계가 높아지며 대화의 주도권을 빼앗으려 한다."
          : "불안정한 구조물이 흔들리며 다음 움직임을 재촉한다.",
    profile:
      kind === "combat"
        ? "standard_attack"
        : kind === "social"
          ? "social_pressure"
          : "environmental_hazard",
  };
}

function inferPrimaryIntent(
  text: string,
  fallback: SubwayChoiceIntent["primary"],
) {
  const rules: Array<[RegExp, SubwayChoiceIntent["primary"]]> = [
    [/(?:후퇴|물러|도망|달아|빠져나|떠난)/i, "retreat"],
    [/(?:설득|대화|말을|타협|달래|진정|호소)/i, "persuade"],
    [/(?:방어|막아|막는|받아내|버틴|웅크)/i, "defend"],
    [/(?:회피|피하|옆으로|몸을 날려)/i, "evade"],
    [/(?:관찰|살핀|주시|듣는다|흔적|확인)/i, "observe"],
    [/(?:공격|기습|휘두르|찌르|때리|돌진|덮친|맞서)/i, "attack"],
    [/(?:사용|꺼내|마신|먹는|도구)/i, "use_item"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? fallback;
}

function inferStyle(
  text: string,
  primary: SubwayChoiceIntent["primary"],
): SubwayChoiceIntent["style"] {
  if (/(?:속이|유인|함정|기만|주의를 돌|허를 찌)/i.test(text)) return "cunning";
  if (/(?:재빨리|순식간|빠르게|달려|급히)/i.test(text)) return "quick";
  if (/(?:달래|공감|사정을|진심|안심)/i.test(text)) return "empathetic";
  if (/(?:조심|천천히|신중|살피며)/i.test(text)) return "careful";
  if (primary === "persuade") return "empathetic";
  if (primary === "retreat" || primary === "evade") return "quick";
  if (primary === "attack") return "forceful";
  return "careful";
}

function targetForPrimary(
  primary: SubwayChoiceIntent["primary"],
  kind: SubwaySituationKind,
): SubwayChoiceIntent["target"] {
  if (primary === "attack") return "enemy";
  if (primary === "persuade") return "actor";
  if (primary === "defend" || primary === "use_item") return "self";
  if (primary === "retreat") return "exit";
  if (primary === "observe" && kind === "social") return "actor";
  return "environment";
}

function compileChoices(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
  kind: SubwaySituationKind,
) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  if (encounter.stage === "resolved") {
    return { choices: [] as SubwayEncounterChoice[], repaired: 0, dropped: 0 };
  }

  const source = Array.isArray(raw) ? raw.slice(0, 4) : [];
  const choices: SubwayEncounterChoice[] = [];
  const seenLabels = new Set<string>();
  let repaired = Array.isArray(raw) ? 0 : 1;
  let dropped = 0;
  const defaults = defaultChoiceSpecs(kind, encounter.stage === "opening");

  source.forEach((candidate, index) => {
    const choice = asRecord(candidate);
    if (typeof choice.label !== "string" || !choice.label.trim()) {
      dropped += 1;
      return;
    }
    const normalizedLabel = choice.label.trim().slice(0, 80);
    if (seenLabels.has(normalizedLabel)) {
      dropped += 1;
      return;
    }
    const effect = RawChoiceEffectSchema.safeParse(choice.effect);
    const legacyIntent = SubwayChoiceIntentSchema.safeParse(choice.intent);
    const effectDescription = effect.success
      ? effect.data.description?.trim().slice(0, 300) ?? ""
      : typeof choice.effect === "string"
        ? choice.effect.trim().slice(0, 300)
        : "";
    const fallbackIntent = defaults[index % defaults.length]!.intent;
    const intentText = `${normalizedLabel} ${effectDescription}`;
    const primary = effect.success
      ? effect.data.type ?? effect.data.action ??
        (legacyIntent.success
          ? legacyIntent.data.primary
          : inferPrimaryIntent(intentText, fallbackIntent.primary))
      : legacyIntent.success
        ? legacyIntent.data.primary
        : inferPrimaryIntent(intentText, fallbackIntent.primary);
    const itemId = effect.success
      ? effect.data.itemId
      : legacyIntent.success
        ? legacyIntent.data.itemId
        : undefined;
    if (
      primary === "use_item" &&
      (!itemId || (input.state.inventory[itemId] ?? 0) <= 0)
    ) {
      dropped += 1;
      return;
    }
    const style = effect.success
      ? effect.data.approach ??
        (legacyIntent.success
          ? legacyIntent.data.style
          : inferStyle(intentText, primary))
      : legacyIntent.success
        ? legacyIntent.data.style
        : inferStyle(intentText, primary);
    const intent: SubwayChoiceIntent = {
      primary,
      style,
      target: legacyIntent.success
        ? legacyIntent.data.target
        : targetForPrimary(primary, kind),
      ...(legacyIntent.success && legacyIntent.data.secondary
        ? { secondary: legacyIntent.data.secondary }
        : {}),
      ...(primary === "use_item" && itemId ? { itemId } : {}),
    };
    if (!effect.success || (!effect.data.type && !effect.data.action)) {
      repaired += 1;
    }
    seenLabels.add(normalizedLabel);
    let narrative = asStrings(
      choice.postChoiceScene ??
        choice.postChoiceNarrative ??
        choice.afterScene,
      2,
      600,
    );
    if (narrative.length === 0) {
      narrative = defaultPostChoice(normalizedLabel);
      repaired += 1;
    }
    choices.push({
      id: `${encounter.id}:${encounter.turnNumber}:choice:${index + 1}`,
      label: normalizedLabel,
      effectDescription,
      postChoiceNarrative: narrative,
      intent,
    });
  });

  if (choices.length < 2) {
    for (const fallback of defaults) {
      if (choices.length >= 3) break;
      if (seenLabels.has(fallback.label)) continue;
      const index = choices.length + 1;
      choices.push({
        id: `${encounter.id}:${encounter.turnNumber}:fallback:${index}`,
        label: fallback.label,
        effectDescription: "",
        postChoiceNarrative: defaultPostChoice(fallback.label),
        intent: fallback.intent,
      });
      seenLabels.add(fallback.label);
      repaired += 1;
    }
  }

  return { choices, repaired, dropped };
}

function compileThreat(
  raw: unknown,
  kind: SubwaySituationKind,
  encounterId: string,
  turnNumber: number,
  resolved: boolean,
) {
  if (resolved) return { threat: null, repaired: 0 };
  const freeformMethod = typeof raw === "string"
    ? raw.trim().slice(0, 240)
    : "";
  const parsed = RawThreatSchema.safeParse(raw);
  const allowedKind = kind === "combat"
    ? "attack"
    : kind === "social"
      ? "pressure"
      : "hazard";
  if (freeformMethod || (parsed.success && parsed.data.kind === allowedKind)) {
    return {
      threat: {
        id: `${encounterId}:threat:${turnNumber}`,
        kind: allowedKind,
        target: parsed.success
          ? parsed.data.target
          : kind === "combat" ? "player" : "environment",
        method: freeformMethod || (parsed.success ? parsed.data.method : ""),
        profile: kind === "combat"
          ? "standard_attack"
          : kind === "social"
            ? "social_pressure"
            : "environmental_hazard",
      } satisfies SubwayPendingThreat,
      repaired: 0,
    };
  }
  return {
    threat: {
      id: `${encounterId}:threat:${turnNumber}`,
      kind: allowedKind,
      target: kind === "combat" ? "player" : "environment",
      method: kind === "combat"
        ? "상대가 무기를 고쳐 쥐고 다음 빈틈을 노린다."
        : kind === "social"
          ? "상대의 경계가 높아지며 대화의 주도권을 빼앗으려 한다."
          : "불안정한 구조물이 흔들리며 다음 움직임을 재촉한다.",
      profile: kind === "combat"
        ? "standard_attack"
        : kind === "social"
          ? "social_pressure"
          : "environmental_hazard",
    } satisfies SubwayPendingThreat,
    repaired: 1,
  };
}

function compileGeneration(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
  latencyMs: number,
  requestError: string | null,
): SubwayEncounterGenerationResult {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const data = asRecord(raw);
  const sceneData = asRecord(data.scene);
  const eventKind = encounter.kind;
  let repaired = requestError ? 1 : 0;
  const actor = authoritativeActor(input);

  const fallbackTitle = input.latestServerResult
    ? "선택의 결과"
    : eventKind === "combat"
      ? "통로를 막은 그림자"
      : eventKind === "social"
        ? "경계하는 생존자"
        : "불안정한 통로";
  const rawTitle = data.title ?? sceneData.title;
  const title = typeof rawTitle === "string" && rawTitle.trim()
    ? rawTitle.trim().slice(0, 80)
    : fallbackTitle;
  if (title === fallbackTitle) repaired += 1;

  let paragraphs = asStrings(
    data.narrative ??
      data.paragraphs ??
      sceneData.narrative ??
      sceneData.paragraphs,
    4,
    600,
  );
  if (paragraphs.length === 0) {
    paragraphs = input.latestServerResult
      ? [
          input.latestServerResult.summary,
          encounter.stage === "resolved"
            ? "소란이 가라앉고 다음 길을 고를 여유가 생겼다."
            : "상황은 아직 끝나지 않았고, 다음 움직임이 필요하다.",
        ]
      : [
          eventKind === "combat"
            ? `${actor?.name ?? "낯선 약탈자"}가 통로 한가운데에서 길을 막는다.`
            : eventKind === "social"
              ? `${actor?.name ?? "낯선 생존자"}가 거리를 둔 채 이쪽을 살핀다.`
              : "앞쪽 구조물이 불안정하게 흔들리며 안전한 길을 가늠하기 어렵다.",
        ];
    repaired += 1;
  }

  const originalParagraphCount = paragraphs.length;
  paragraphs = withoutRepeatedSubwayNarrative(
    paragraphs,
    input.latestServerResult?.postChoiceNarrative ?? [],
  );
  if (paragraphs.length < originalParagraphCount) {
    repaired += originalParagraphCount - paragraphs.length;
  }
  if (paragraphs.length === 0 && input.latestServerResult) {
    paragraphs = [input.latestServerResult.summary];
    repaired += 1;
  }

  const choices = serverEncounterChoices(input);
  const pendingThreat = serverPendingThreat(
    encounter,
    encounter.stage === "resolved",
  );
  const storyHooks: string[] = [];
  const fallback = Boolean(requestError) || Object.keys(data).length === 0;

  return {
    scene: {
      scenarioId: encounter.id,
      turnNumber: encounter.turnNumber,
      kind: eventKind,
      phase: encounter.stage,
      title,
      paragraphs,
      choices,
      source: fallback ? "template" : "mixed",
      generatedAt: new Date().toISOString(),
    },
    eventKind,
    actor,
    pendingThreat,
    storyHooks,
    diagnostics: {
      latencyMs,
      repairedFieldCount: repaired,
      droppedChoiceCount: 0,
      fallback,
      errorReason: requestError,
    },
  };
}

function compactHistory(state: GameState) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter;
  return (encounter?.history ?? []).slice(-6).map((entry) => ({
    selectedIntent: entry.result.selectedIntent,
    selectedLabel: entry.result.selectedLabel,
    selectedEffect: entry.result.selectedEffectDescription,
    postChoiceScene: entry.result.postChoiceNarrative,
    authoritativeSummary: entry.result.summary,
  }));
}

function conditionLabel(value: number, healthy: number) {
  if (value <= Math.max(2, Math.floor(healthy * 0.25))) return "위태로움";
  if (value <= Math.floor(healthy * 0.55)) return "지침";
  return "버틸 만함";
}

function authoritativeActor(input: SubwayEncounterGenerationInput) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  if (encounter.kind === "hazard") {
    return null;
  }
  if (encounter.actor) {
    return encounter.actor;
  }
  if (encounter.enemy) {
    return {
      id: `${encounter.id}:actor`,
      name: encounter.enemy.name,
      appearance: encounter.enemy.description,
      personality: "경계심이 강하고 자신의 우위를 쉽게 포기하지 않는다.",
      motive: encounter.objective,
      relationship: 0,
    } satisfies SubwayEncounterActor;
  }
  return defaultActor(encounter.kind, encounter.id);
}

function storyBrief(input: SubwayEncounterGenerationInput) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const floor = input.state.subwayExpedition.currentFloor!;
  return {
    place: {
      depth: floor.depth,
      zone: floor.zone,
      title: floor.title,
      environment: floor.paragraphs.slice(0, 3),
      mood: floor.tensionSummary,
    },
    eventKind: encounter.kind,
    objective: encounter.objective,
    actor: authoritativeActor(input),
    incomingPressure: encounter.pendingThreat?.method ?? "",
    playerCondition: {
      body: conditionLabel(input.state.stats.hp, 10),
      mind: conditionLabel(input.state.stats.mind, 10),
      energy: conditionLabel(input.state.stats.energy, 15),
    },
    memory: {
      facts: input.state.subwayExpedition.storyMemory.facts.slice(-6),
      knownActors:
        input.state.subwayExpedition.storyMemory.knownActors.slice(-4),
      unresolvedThreads:
        input.state.subwayExpedition.storyMemory.unresolvedThreads.slice(-4),
      recentSummaries:
        input.state.subwayExpedition.storyMemory.recentSummaries.slice(-3),
    },
  };
}

function authoritativeResultPayload(input: SubwayEncounterGenerationInput) {
  const result = input.latestServerResult;
  if (!result) return null;
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const playerHpChange =
    result.statChanges.find((change) => change.stat === "hp")?.amount ?? 0;
  return {
    enemyName: encounter.enemy?.name ?? encounter.actor?.name ?? "상대",
    selectedLabel: result.selectedLabel,
    selectedIntent: result.selectedIntent,
    selectedEffect: result.selectedEffectDescription,
    postChoiceScene: result.postChoiceNarrative,
    success: result.success,
    rolls: result.rolls,
    damageDealt: result.damageDealt,
    damageTaken: result.damageTaken,
    playerHpBefore: result.playerHpAfter - playerHpChange,
    playerHpAfter: result.playerHpAfter,
    enemyHpBefore: result.enemyHpAfter + result.damageDealt,
    enemyHpAfter: result.enemyHpAfter,
    minutes: result.minutes,
    statChanges: result.statChanges,
    itemChanges: result.itemChanges,
    toolDurabilityChanges: result.toolDurabilityChanges,
    relationshipChange: result.relationshipChange,
    stageAfter: result.stageAfter,
    resolution: result.resolution,
    rewards:
      result.resolution === "victory"
        ? encounter.rewardItems
        : [],
    summary: result.summary,
  };
}

function fallbackNarrativeDraft(input: SubwayEncounterGenerationInput) {
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter!;
  const actor = authoritativeActor(input);
  if (input.latestServerResult) {
    return {
      title: encounter.stage === "resolved" ? "상황의 결말" : "선택의 결과",
      narrative: [
        input.latestServerResult.summary,
        encounter.stage === "resolved"
          ? "소란이 가라앉고 다음 길을 고를 여유가 생겼다."
          : "상황은 아직 끝나지 않았고, 다음 움직임이 필요하다.",
      ],
      nextSceneHook: "",
      storyHooks: [],
    };
  }
  return {
    title: encounter.kind === "combat"
      ? "통로를 막은 그림자"
      : encounter.kind === "social"
        ? "경계하는 생존자"
        : "불안정한 통로",
    narrative: [
      encounter.kind === "combat"
        ? `${actor?.name ?? "낯선 약탈자"}가 지하 통로 한가운데에서 길을 막는다.`
        : encounter.kind === "social"
          ? `${actor?.name ?? "낯선 생존자"}가 거리를 둔 채 이쪽을 살핀다.`
          : "앞쪽 구조물이 불안정하게 흔들리며 안전한 길을 가늠하기 어렵다.",
      encounter.kind === "combat"
        ? "금속이 바닥을 스치는 소리가 울리고, 상대의 시선은 이쪽의 손과 발을 번갈아 훑는다."
        : encounter.kind === "social"
          ? "짧은 침묵 사이로 서로의 숨소리만 남고, 먼저 거리를 좁히는 쪽을 기다리는 긴장이 이어진다."
          : "먼지와 작은 파편이 계속 떨어지는 가운데, 어느 발판이 버틸지 빠르게 판단해야 한다.",
    ],
    nextSceneHook: "",
    storyHooks: [],
  };
}

function usableNarrativeDraft(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
) {
  const data = asRecord(raw);
  const fallback = fallbackNarrativeDraft(input);
  const narrative = asStrings(data.narrative ?? data.paragraphs, 4, 600);
  return {
    title: typeof data.title === "string" && data.title.trim()
      ? data.title.trim().slice(0, 80)
      : fallback.title,
    narrative: narrative.length > 0 ? narrative : fallback.narrative,
    nextSceneHook:
      typeof data.nextSceneHook === "string"
        ? data.nextSceneHook.trim().slice(0, 240)
        : fallback.nextSceneHook,
    storyHooks: asStrings(data.storyHooks, 3, 200),
  };
}

export function fallbackSubwayEncounterGeneration(
  input: SubwayEncounterGenerationInput,
  error: unknown,
  latencyMs = 0,
) {
  return compileGeneration(
    {},
    input,
    latencyMs,
    error instanceof Error ? error.message : String(error),
  );
}

export function createSubwayEncounterSceneGenerator(
  roleClient: SubwayRoleClient = generateSubwayRoleJson,
  roleConfigAvailable: () => boolean = hasSubwayRoleConfig,
): SubwayEncounterSceneGenerator {
  return async (input) => {
    const encounter =
      input.state.subwayExpedition.currentFloorProgress.encounter;
    const floor = input.state.subwayExpedition.currentFloor;
    if (!encounter || !floor) {
      throw new Error("LLM에 전달할 지하철 상황 상태가 없습니다.");
    }

    const startedAt = Date.now();
    const roleErrors: string[] = [];
    const sceneRole = input.latestServerResult
      ? "result_scene" as const
      : "opening_scene" as const;
    const sceneTarget =
      `${sceneRole}:${encounter.id}:turn:${encounter.turnNumber}`;
    let narrativeRaw: unknown = {};

    if (!roleConfigAvailable()) {
      roleErrors.push("Subway LLM role pipeline is not configured.");
    } else {
      try {
        narrativeRaw = await roleClient({
          gameId: input.gameId,
          role: sceneRole,
          target: sceneTarget,
          payload: {
            promptVersion: SUBWAY_ENCOUNTER_PROMPT_VERSION,
            storyBrief: storyBrief(input),
            previousScene: encounter.currentScene
              ? {
                  title: encounter.currentScene.title,
                  paragraphs: encounter.currentScene.paragraphs,
                }
              : null,
            authoritativeResult: authoritativeResultPayload(input),
            recentAuthoritativeHistory: compactHistory(input.state),
          },
          timeoutMs: 20_000,
        });
      } catch (error) {
        roleErrors.push(`${sceneRole}: ${
          error instanceof Error ? error.message : String(error)
          }`);
      }
    }

    const narrative = usableNarrativeDraft(narrativeRaw, input);
    const raw = {
      eventKind: encounter.kind,
      actor: authoritativeActor(input),
      title: narrative.title,
      narrative: narrative.narrative,
    };
    const requestError = roleErrors.length > 0 ? roleErrors.join(" | ") : null;
    const result = compileGeneration(
      raw,
      input,
      Date.now() - startedAt,
      requestError,
    );
    const target = `role-pipeline:${encounter.id}:turn:${encounter.turnNumber}`;
    appendDevLlmTraceForGame(input.gameId, {
      scope: "subway",
      target,
      stage: "draft_validation",
      model: geminiModel(),
      status: result.diagnostics.fallback ? "fallback" : "success",
      request: "",
      response: "",
      message:
        `${sceneRole} → ${
          encounter.stage === "resolved" ? "종료" : "server_choices"
        }: ` +
        `보완 ${result.diagnostics.repairedFieldCount}개, ` +
        `제거 선택지 ${result.diagnostics.droppedChoiceCount}개, ` +
        `fallback ${result.diagnostics.fallback ? "yes" : "no"}, ` +
        `${result.diagnostics.latencyMs}ms`,
      errorReason: result.diagnostics.errorReason ?? undefined,
    });
    return result;
  };
}

export const generateSubwayEncounterScene =
  createSubwayEncounterSceneGenerator();

export function compileSubwayEncounterDraftForTest(
  raw: unknown,
  input: SubwayEncounterGenerationInput,
) {
  return compileGeneration(raw, input, 0, null);
}
