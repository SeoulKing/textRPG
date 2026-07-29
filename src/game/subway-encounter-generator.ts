import { z } from "zod";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import {
  generateGeminiJson,
  geminiModel,
  hasGeminiConfig,
} from "./gemini-client";
import { subwaySituationActionCatalog } from "./subway-encounter";
import {
  SubwayEncounterActionIdSchema,
  SubwayEncounterSceneSchema,
  type GameState,
  type SubwayEncounterActionId,
  type SubwayEncounterScene,
  type SubwayEncounterTurnResult,
} from "./schemas";

export const SUBWAY_ENCOUNTER_PROMPT_VERSION = "subway-situation-v4";
const TOTAL_ATTEMPTS = 3;

const EncounterTurnDraftSchema = z.object({
  scenarioId: z.string().min(1).max(140),
  turnNumber: z.number().int().nonnegative(),
  kind: z.enum(["combat", "social", "hazard"]),
  phase: z.enum(["opening", "active", "resolved"]),
  title: z.string().min(1).max(80),
  paragraphs: z.array(z.string().min(1).max(600)).min(1).max(3),
  choices: z.array(z.object({
    actionToken: SubwayEncounterActionIdSchema,
    label: z.string().min(1).max(24),
    postChoiceNarrative: z.array(z.string().min(1).max(600)).min(1).max(2),
  }).strict()).max(4),
}).strict();

type EncounterTurnDraft = z.infer<typeof EncounterTurnDraftSchema>;

export type SubwayEncounterGenerationInput = {
  gameId: string;
  state: GameState;
  latestServerResult?: SubwayEncounterTurnResult | null;
};

export type SubwayEncounterSceneGenerator = (
  input: SubwayEncounterGenerationInput,
) => Promise<SubwayEncounterScene>;

const ENCOUNTER_SYSTEM_PROMPT = `당신은 붕괴한 서울의 현실적인 지하철 생존 텍스트 RPG를 진행하는 장면 작가입니다.
서버가 확정한 현재 상황과 직전 판정을 이어 받아, 다음 상황 묘사와 허용된 선택지를 구조화된 한국어 JSON으로 작성합니다.

[역할 분리]
- 당신은 이야기와 선택지의 자연스러운 표현만 담당합니다.
- 서버만 성공 여부, 확률, 피해, 체력, 정신력, 기력, 시간, 아이템, 내구도, 보상, 진행도와 상황 종료를 결정합니다.
- 서버가 제공한 scenario와 latestServerResult는 절대적인 사실입니다.

[절대 규칙]
1. scenarioId, turnNumber, kind, phase는 scenario 값을 글자와 숫자까지 그대로 복사하십시오.
2. latestServerResult가 있으면 selectedLabel을 플레이어가 실제로 선택했고 summary가 실제로 일어났다는 사실을 다음 장면에 자연스럽게 반영하십시오. latestServerResult.postChoiceNarrative는 이미 화면에 출력된 문장이므로 반복하지 말고 그 직후부터 이어 쓰십시오.
3. choices의 actionToken은 allowedActions에 있는 값만 사용하고 중복하지 마십시오. actionToken의 intent를 다른 행동으로 바꾸지 마십시오.
4. opening과 active 단계에서는 2~4개 선택지를 작성하십시오. 단, mandatoryActionTokens가 있으면 모두 정확히 한 번 포함하십시오.
5. resolved 단계에서는 choices를 빈 배열로 반환하십시오. 서버가 확정한 결말을 반영하고, 플레이어가 소란이 끝난 현재 층을 정돈하며 숨을 고르는 모습까지 자연스럽게 마무리하십시오.
6. 피해 수치, 체력 수치, 성공 확률, 경과 시간, 보상, 아이템 획득, 선택지 힌트를 title, paragraphs, label, postChoiceNarrative에 쓰지 마십시오. 해당 정보는 서버 UI가 따로 표시합니다.
7. 플레이어가 보유하지 않은 물건이나 allowedActions에 없는 도구를 만들지 마십시오. use_item 토큰은 해당 itemId의 실제 물건만 사용하십시오.
8. 다음 층 이동, 대합실 귀환, 파밍, 수색 종료를 선택지로 만들지 마십시오. 이것들은 상황 종료 뒤 서버가 제공합니다.
9. combat은 서버가 제공한 enemy 한 명만 사용합니다. 지원군, 새 적, 괴물, 마법, 초자연 현상을 추가하지 마십시오.
10. social과 hazard에서도 서버 objective를 바꾸거나 이미 해결됐다고 앞당겨 쓰지 마십시오.
11. 최근 기록과 같은 문장·행동 묘사를 반복하지 말고, 현재 층의 환경과 회차 미스터리를 이어 가십시오.
12. 플레이어가 아직 고르지 않은 선택을 title이나 paragraphs에서 이미 실행한 것처럼 서술하지 마십시오.
13. 각 label은 "기습한다", "설득한다", "후퇴한다"처럼 행동만 나타내는 짧은 문장으로 쓰십시오. combat opening의 fight label은 정확히 "기습한다"로 쓰십시오.
14. 각 postChoiceNarrative는 해당 버튼을 누른 직후 즉시 보여 줄 짧은 1~2개 문단입니다. actionToken의 행동을 실제로 시작하는 모습만 쓰고, 성공·실패·피해·상대 반응·판정 결과는 확정하지 마십시오.
15. requiredOutputShape에 없는 키를 만들지 말고 JSON만 반환하십시오.`;

const RESERVED_SYSTEM_UI_PATTERN =
  /(?:보상|획득|내구도|힌트|성공\s*\d+\s*%|명중\s*\d+\s*%|반격\s*\d+\s*%|\d+\s*피해|체력\s*\d+\s*\/\s*\d+|\+\s*\d+\s*분|-\s*\d+\s*(?:체력|정신력|기력))/i;
const EXIT_CHOICE_PATTERN =
  /(?:다음\s*층|내려간다|대합실|귀환|파밍|수색을?\s*(?:마친|끝))/i;

function zodErrors(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
}

function validateDraft(
  raw: unknown,
  expected: {
    scenarioId: string;
    turnNumber: number;
    kind: "combat" | "social" | "hazard";
    phase: "opening" | "active" | "resolved";
  },
  allowedActionIds: SubwayEncounterActionId[],
  mandatoryActionTokens: SubwayEncounterActionId[],
) {
  const parsed = EncounterTurnDraftSchema.safeParse(raw);
  if (!parsed.success) return { draft: null, errors: zodErrors(parsed.error) };

  const errors: string[] = [];
  if (parsed.data.scenarioId !== expected.scenarioId) {
    errors.push("scenarioId must exactly match the server scenario.");
  }
  if (parsed.data.turnNumber !== expected.turnNumber) {
    errors.push("turnNumber must exactly match the server turn.");
  }
  if (parsed.data.kind !== expected.kind) {
    errors.push("kind must exactly match the server situation kind.");
  }
  if (parsed.data.phase !== expected.phase) {
    errors.push("phase must exactly match the server situation phase.");
  }

  const narrativeText = [
    parsed.data.title,
    ...parsed.data.paragraphs,
    ...parsed.data.choices.map((choice) => choice.label),
    ...parsed.data.choices.flatMap((choice) => choice.postChoiceNarrative),
  ].join("\n");
  if (RESERVED_SYSTEM_UI_PATTERN.test(narrativeText)) {
    errors.push("narrative and labels must not contain mechanics, hints, time, damage, or rewards.");
  }
  if (parsed.data.choices.some((choice) => EXIT_CHOICE_PATTERN.test(choice.label))) {
    errors.push("LLM choices must not contain descent, return, farming, or floor completion actions.");
  }

  const allowed = new Set(allowedActionIds);
  const seen = new Set<SubwayEncounterActionId>();
  parsed.data.choices.forEach((choice, index) => {
    if (!allowed.has(choice.actionToken)) {
      errors.push(`choices[${index}].actionToken '${choice.actionToken}' is not allowed.`);
    }
    if (seen.has(choice.actionToken)) {
      errors.push(`choices[${index}].actionToken '${choice.actionToken}' is duplicated.`);
    }
    seen.add(choice.actionToken);
    if (
      expected.kind === "combat" &&
      expected.phase === "opening" &&
      choice.actionToken === "fight" &&
      choice.label !== "기습한다"
    ) {
      errors.push("the opening fight label must be exactly '기습한다'.");
    }
  });

  if (expected.phase === "resolved") {
    if (parsed.data.choices.length !== 0) {
      errors.push("resolved situation choices must be empty.");
    }
  } else {
    if (parsed.data.choices.length < 2 || parsed.data.choices.length > 4) {
      errors.push("opening and active choices must contain 2 to 4 actions.");
    }
    mandatoryActionTokens.forEach((token) => {
      if (!seen.has(token)) errors.push(`choices must include mandatory token '${token}'.`);
    });
  }
  return { draft: errors.length === 0 ? parsed.data : null, errors };
}

function appendValidationTrace(gameId: string, target: string, errors: string[]) {
  appendDevLlmTraceForGame(gameId, {
    scope: "subway",
    target,
    stage: "draft_validation",
    model: geminiModel(),
    status: errors.length > 0 ? "error" : "success",
    request: "",
    response: "",
    message: errors.length > 0
      ? "지하철 상황 LLM 응답이 서버 규칙을 통과하지 못했습니다."
      : "지하철 상황 LLM 응답이 서버 규칙을 통과했습니다.",
    errorReason: errors.join(" | "),
  });
}

function compactHistory(state: GameState) {
  const encounter = state.subwayExpedition.currentFloorProgress.encounter;
  return (encounter?.history ?? []).slice(-6).map((entry) => ({
    turnNumber: entry.turnNumber,
    selectedActionToken: entry.result.selectedActionToken,
    selectedLabel: entry.result.selectedLabel,
    serverSummary: entry.result.summary,
    playerHpAfter: entry.result.playerHpAfter,
    enemyHpAfter: entry.result.enemyHpAfter,
    progressAfter: entry.result.progressAfter,
  }));
}

function requiredOutputShape(
  encounter: NonNullable<GameState["subwayExpedition"]["currentFloorProgress"]["encounter"]>,
  allowedActions: ReturnType<typeof subwaySituationActionCatalog>,
) {
  return {
    scenarioId: encounter.id,
    turnNumber: encounter.turnNumber,
    kind: encounter.kind,
    phase: encounter.stage,
    title: "현재 상황의 짧은 한국어 제목",
    paragraphs: [
      encounter.stage === "resolved"
        ? "직전 선택과 서버 판정을 반영한 상황의 결말"
        : "직전 선택과 서버 판정을 반영한 현재 상황 묘사",
      encounter.stage === "resolved"
        ? "소란이 끝난 현재 층을 정돈하고 숨을 고르는 마무리 묘사"
        : "필요하면 다음 행동 직전의 거리·소리·표정·구조 묘사",
    ],
    choices: encounter.stage === "resolved"
      ? []
      : allowedActions.slice(0, 4).map((action) => ({
          actionToken: action.actionToken,
          label: action.actionToken === "fight"
            ? "기습한다"
            : "intent를 현재 상황에 맞게 표현한 짧은 행동 문구",
          postChoiceNarrative: [
            "선택 직후 해당 행동을 시작하는 모습을 보여 주되 판정 결과는 확정하지 않는 문단",
          ],
        })),
  };
}

export async function generateSubwayEncounterScene(
  input: SubwayEncounterGenerationInput,
): Promise<SubwayEncounterScene> {
  if (!hasGeminiConfig()) {
    throw new Error("지하철 상황을 진행하려면 GEMINI_API_KEY가 설정되어 있어야 합니다.");
  }
  const encounter = input.state.subwayExpedition.currentFloorProgress.encounter;
  const floor = input.state.subwayExpedition.currentFloor;
  if (!encounter || !floor) throw new Error("LLM에 전달할 지하철 상황 상태가 없습니다.");

  const allowedActions = subwaySituationActionCatalog(input.state, encounter);
  const allowedActionIds = allowedActions.map((action) => action.actionToken);
  const mandatoryActionTokens =
    floor.depth === 1 && encounter.stage === "opening"
      ? (["fight", "talk", "flee"] as SubwayEncounterActionId[])
      : [];
  const expected = {
    scenarioId: encounter.id,
    turnNumber: encounter.turnNumber,
    kind: encounter.kind,
    phase: encounter.stage,
  };
  let validatorErrors: string[] = [];

  for (let attempt = 1; attempt <= TOTAL_ATTEMPTS; attempt += 1) {
    const target = `situation:${encounter.id}:turn:${encounter.turnNumber}:attempt:${attempt}`;
    let raw: unknown;
    try {
      raw = await generateGeminiJson<unknown>(
        ENCOUNTER_SYSTEM_PROMPT,
        {
          schemaName: "StructuredSubwaySituationTurn",
          promptVersion: SUBWAY_ENCOUNTER_PROMPT_VERSION,
          attempt,
          repair: attempt === 1
            ? null
            : {
                validatorErrors,
                instruction: "검증 오류를 모두 고쳐 전체 JSON을 다시 생성하십시오.",
              },
          floor: {
            depth: floor.depth,
            title: floor.title,
            zone: floor.zone,
            environment: floor.paragraphs,
            tension: floor.tensionSummary,
          },
          scenario: {
            id: encounter.id,
            kind: encounter.kind,
            phase: encounter.stage,
            turnNumber: encounter.turnNumber,
            objective: encounter.objective,
            enemy: encounter.enemy,
            progress: encounter.progress,
            targetProgress: encounter.targetProgress,
            failureCount: encounter.failureCount,
            resolution: encounter.resolution,
          },
          player: {
            hp: input.state.stats.hp,
            mind: input.state.stats.mind,
            energy: input.state.stats.energy,
          },
          storyMemory: input.state.subwayExpedition.storyMemory,
          latestServerResult: input.latestServerResult ?? null,
          recentHistory: compactHistory(input.state),
          allowedActions: allowedActions.map(({ actionToken, intent }) => ({
            actionToken,
            intent,
          })),
          mandatoryActionTokens,
          requiredOutputShape: requiredOutputShape(encounter, allowedActions),
        },
        {
          model: geminiModel(),
          temperature: 0.75,
          timeoutMs: 25_000,
          trace: { gameId: input.gameId, scope: "subway", target },
        },
      );
    } catch (error) {
      validatorErrors = [error instanceof Error ? error.message : String(error)];
      appendValidationTrace(input.gameId, target, validatorErrors);
      if (attempt < TOTAL_ATTEMPTS) continue;
      throw new Error(
        `지하철 상황 장면 생성에 ${TOTAL_ATTEMPTS}회 실패했습니다: ${validatorErrors.join(" | ")}`,
      );
    }

    const result = validateDraft(
      raw,
      expected,
      allowedActionIds,
      mandatoryActionTokens,
    );
    validatorErrors = result.errors;
    appendValidationTrace(input.gameId, target, validatorErrors);
    if (result.draft) {
      return SubwayEncounterSceneSchema.parse({
        ...result.draft,
        source: "llm",
        generatedAt: new Date().toISOString(),
      });
    }
  }
  throw new Error(
    `지하철 상황 장면 생성에 ${TOTAL_ATTEMPTS}회 실패했습니다: ${validatorErrors.join(" | ")}`,
  );
}

export function validateSubwayEncounterDraftForTest(
  raw: unknown,
  stage: "opening" | "active" | "resolved",
  options: {
    kind?: "combat" | "social" | "hazard";
    scenarioId?: string;
    turnNumber?: number;
    allowedActionIds?: SubwayEncounterActionId[];
    mandatoryActionTokens?: SubwayEncounterActionId[];
  } = {},
) {
  const kind = options.kind ?? "combat";
  const allowedActionIds = options.allowedActionIds ??
    (stage === "opening"
      ? ["fight", "talk", "flee"]
      : stage === "active"
        ? ["close_attack", "throw_improvised", "guard", "talk", "flee"]
        : []);
  return validateDraft(
    raw,
    {
      scenarioId: options.scenarioId ?? "test-scenario",
      turnNumber: options.turnNumber ?? 0,
      kind,
      phase: stage,
    },
    allowedActionIds,
    options.mandatoryActionTokens ?? [],
  );
}
