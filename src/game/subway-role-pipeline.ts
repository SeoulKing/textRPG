import { z } from "zod";
import {
  generateGeminiJson,
  geminiModel,
  hasGeminiConfig,
} from "./gemini-client";

export type SubwayGenerationRole =
  | "opening_scene"
  | "result_scene";

export type SubwayRoleRequest = {
  gameId: string;
  role: SubwayGenerationRole;
  target: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
};

export type SubwayRoleClient = <T>(
  request: SubwayRoleRequest,
) => Promise<T>;

const SubwayNarrativeRoleOutputSchema = z.object({
  title: z.string().min(1).max(80),
  narrative: z.array(z.string().min(1).max(600)).min(2).max(4),
  // Validate each thought separately so malformed thoughts do not discard a valid scene.
  choiceThoughts: z.unknown().optional(),
}).strict();

const NARRATIVE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "narrative", "choiceThoughts"],
  properties: {
    title: { type: "string" },
    choiceThoughts: { type: "array", items: { type: "object", required: ["optionId", "thought"], additionalProperties: false, properties: { optionId: { type: "string" }, thought: { type: "string" } } } },
    narrative: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
    },
  },
} satisfies Record<string, unknown>;

const THOUGHT_WRITER_PROMPT = `nextChoices는 서버가 확정한 행동이다. choiceThoughts에 각 optionId와 짧은 속말 thought를 함께 작성한다. 선택지가 없으면 빈 배열을 쓴다.
속말은 선택 직후 읽을 8~30자 정도의 일상적인 1인칭 궁금증이나 가벼운 의도 한 문장이다. 예: 돈이 좀 있을래나. 말이 통할 여지가 있을까.
defaultThought는 안전한 예시다. 숨겨진 물건·수량·성공·부상·행동 완료를 단정하지 않는다. 행동 묘사나 상대에게 실제로 말하는 대사로 쓰지 않는다. optionId와 행동은 변경하지 않는다.
본문은 주어를 주로 생략한 1인칭 현재형 한국어 소설체로 쓴다. 주어진 장소와 실제 행동·감각·변화만 연결하며 감정·새 사물·새 소리를 지어내지 않는다.`;

const OPENING_SCENE_WRITER_PROMPT = `당신은 지하철 생존 이야기의 장면 서사 작가입니다.
서버가 확정한 장소, 사건 종류, 인물과 사실만 사용해 플레이어가 처음 마주한 장면을 묘사하세요.
선택지, 행동 효과, 확률, 피해, 보상, 성공·실패는 만들지 마세요.
서버가 준 사실을 바꾸거나 새로운 적과 아이템을 추가하지 마세요.
두 문단 이상 네 문단 이하로 공간의 감각, 상대의 현재 행동, 당장 해결해야 할 긴장을 보여 주세요.

반환 JSON:
{
  "title": "짧고 인상적인 제목",
  "narrative": ["현재 장면의 서사", "감각과 인물 반응을 더한 문단"],
  "choiceThoughts": [{"optionId": "서버의 optionId", "thought": "말이 통할 여지가 있을까."}]
}`;

const RESULT_SCENE_WRITER_PROMPT = `당신은 지하철 생존 이야기의 결과 서사 작가입니다.
서버가 확정한 직전 선택과 실제 판정 결과를 바탕으로 실제 행동부터 그 결과까지 연결된 장면으로 묘사하세요.
선택지, 새로운 효과, 확률, 피해, 보상, 성공·실패 판정을 만들지 마세요.
authoritativeResult의 모든 값은 이미 서버에서 적용된 불변 사실입니다.
수치와 결과를 뒤집지 말고, 목록에 없는 공격·부상·회복·아이템·보상을 추가하지 마세요.
authoritativeResult.selectedThought는 클릭 때 보여 준 속말이며 행동 완료나 실제 발언이 아닙니다. 본문에서 반복하지 마세요.
행동 문장은 아직 표시되지 않았습니다. 실제 실행한 행동과 관찰부터 결과까지 자연스럽게 이어 쓰고, 두 문단 이상 네 문단 이하로 작성하세요.
상황이 해결됐다면 그 결말을 분명히 보여 주고, 계속된다면 달라진 거리·태도·위협을 보여 주세요.

반환 JSON:
{
  "title": "결과를 반영한 짧은 제목",
  "narrative": ["실제 행동과 확정 결과가 드러나는 문단", "다음 상태를 보여 주는 문단"],
  "choiceThoughts": [{"optionId": "서버의 optionId", "thought": "지금은 물러나는 게 좋겠지."}]
}`;

const ROLE_DEFINITIONS = {
  opening_scene: {
    systemPrompt: OPENING_SCENE_WRITER_PROMPT + "\n" + THOUGHT_WRITER_PROMPT,
    temperature: 0.85,
    responseSchema: SubwayNarrativeRoleOutputSchema,
    responseJsonSchema: NARRATIVE_RESPONSE_JSON_SCHEMA,
  },
  result_scene: {
    systemPrompt: RESULT_SCENE_WRITER_PROMPT + "\n" + THOUGHT_WRITER_PROMPT,
    temperature: 0.75,
    responseSchema: SubwayNarrativeRoleOutputSchema,
    responseJsonSchema: NARRATIVE_RESPONSE_JSON_SCHEMA,
  },
} satisfies Record<SubwayGenerationRole, {
  systemPrompt: string;
  temperature: number;
  responseSchema: z.ZodType;
  responseJsonSchema: Record<string, unknown>;
}>;

export function hasSubwayRoleConfig() {
  return hasGeminiConfig();
}

export const generateSubwayRoleJson: SubwayRoleClient = async <T>(
  request: SubwayRoleRequest,
) => {
  const definition = ROLE_DEFINITIONS[request.role];
  const output = await generateGeminiJson<unknown>(
    definition.systemPrompt,
    request.payload,
    {
      model: geminiModel(),
      temperature: definition.temperature,
      timeoutMs: request.timeoutMs,
      responseSchema: definition.responseSchema,
      responseJsonSchema: definition.responseJsonSchema,
      trace: {
        gameId: request.gameId,
        scope: "subway",
        target: request.target,
      },
    },
  );
  return output as T;
};
