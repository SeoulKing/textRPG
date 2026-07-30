import { z } from "zod";
import {
  generateGeminiJson,
  geminiModel,
  hasGeminiConfig,
} from "./gemini-client";

export type SubwayGenerationRole =
  | "opening_scene"
  | "result_scene"
  | "choices";

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
  narrative: z.array(z.string().min(1).max(600)).min(1).max(4),
  nextSceneHook: z.string().max(240).optional(),
  storyHooks: z.array(z.string().min(1).max(200)).max(3).optional(),
}).strict();

const SubwayChoiceRoleOutputSchema = z.object({
  choices: z.array(z.object({
    intentId: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    effectDescription: z.string().max(300),
    postChoiceScene: z.array(z.string().min(1).max(600)).min(1).max(2),
  }).strict()).length(3),
}).strict();

const NARRATIVE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "narrative"],
  properties: {
    title: { type: "string" },
    narrative: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
    },
    nextSceneHook: { type: "string" },
    storyHooks: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
    },
  },
} satisfies Record<string, unknown>;

const CHOICE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choices"],
  properties: {
    choices: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "intentId",
          "label",
          "effectDescription",
          "postChoiceScene",
        ],
        properties: {
          intentId: { type: "string" },
          label: { type: "string" },
          effectDescription: { type: "string" },
          postChoiceScene: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string" },
          },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const OPENING_SCENE_WRITER_PROMPT = `당신은 지하철 생존 이야기의 장면 서사 작가입니다.
서버가 확정한 장소, 사건 종류, 인물과 사실만 사용해 플레이어가 처음 마주한 장면을 묘사하세요.
선택지, 행동 효과, 확률, 피해, 보상, 성공·실패는 만들지 마세요.
서버가 준 사실을 바꾸거나 새로운 적과 아이템을 추가하지 마세요.
두세 문단으로 공간의 감각, 상대의 현재 행동, 당장 해결해야 할 긴장을 보여 주세요.

반환 JSON:
{
  "title": "짧고 인상적인 제목",
  "narrative": ["현재 장면의 서사", "감각과 인물 반응을 더한 문단"],
  "nextSceneHook": "지금 대응하지 않으면 이어질 상대 또는 환경의 움직임",
  "storyHooks": ["이 장면에서 생긴 단서나 미해결 질문"]
}`;

const RESULT_SCENE_WRITER_PROMPT = `당신은 지하철 생존 이야기의 결과 서사 작가입니다.
서버가 확정한 직전 선택과 실제 판정 결과를 이미 벌어진 사실로 받아들이고 다음 장면만 묘사하세요.
선택지, 새로운 효과, 확률, 피해, 보상, 성공·실패 판정을 만들지 마세요.
수치와 결과를 뒤집지 말고, 선택 직후 서사 다음 문장부터 자연스럽게 이어 쓰세요.
상황이 해결됐다면 그 결말을 분명히 보여 주고, 계속된다면 달라진 거리·태도·위협을 보여 주세요.

반환 JSON:
{
  "title": "결과를 반영한 짧은 제목",
  "narrative": ["확정 결과가 드러나는 문단", "다음 상태를 보여 주는 문단"],
  "nextSceneHook": "상황이 계속될 때만 다음 행동을 재촉하는 움직임",
  "storyHooks": ["새로 확인된 사실이나 해결된 단서"]
}`;

const CHOICE_WRITER_PROMPT = `당신은 지하철 생존 이야기의 선택지 작가입니다.
완성된 현재 장면과 그 장면이 남긴 nextSceneHook을 읽고, 서버가 제공한 allowedIntents 안에서 서로 다른 선택지 세 개를 만드세요.
intentId는 allowedIntents의 id를 그대로 복사해야 하며 새로운 의도나 효과를 만들면 안 됩니다.
label은 장면의 구체적인 사물·거리·인물 반응을 활용한 짧은 행동 문장으로 씁니다.
effectDescription은 그 행동이 이야기에서 노리는 목적만 한 문장으로 씁니다. 수치, 확률, 피해, 시간, 보상은 쓰지 마세요.
postChoiceScene은 버튼을 누른 직후 행동을 시작하는 모습만 한두 문장으로 쓰고, 성공이나 실패를 확정하지 마세요.
같은 intentId나 사실상 같은 행동을 반복하지 마세요.

반환 JSON:
{
  "choices": [
    {
      "intentId": "allowedIntents에 있는 id",
      "label": "짧고 구체적인 행동",
      "effectDescription": "이 행동이 이야기에서 노리는 목적",
      "postChoiceScene": ["행동을 시작하는 첫 문장", "결과 직전의 둘째 문장"]
    }
  ]
}`;

const ROLE_DEFINITIONS = {
  opening_scene: {
    systemPrompt: OPENING_SCENE_WRITER_PROMPT,
    temperature: 0.85,
    responseSchema: SubwayNarrativeRoleOutputSchema,
    responseJsonSchema: NARRATIVE_RESPONSE_JSON_SCHEMA,
  },
  result_scene: {
    systemPrompt: RESULT_SCENE_WRITER_PROMPT,
    temperature: 0.75,
    responseSchema: SubwayNarrativeRoleOutputSchema,
    responseJsonSchema: NARRATIVE_RESPONSE_JSON_SCHEMA,
  },
  choices: {
    systemPrompt: CHOICE_WRITER_PROMPT,
    temperature: 0.7,
    responseSchema: SubwayChoiceRoleOutputSchema,
    responseJsonSchema: CHOICE_RESPONSE_JSON_SCHEMA,
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
