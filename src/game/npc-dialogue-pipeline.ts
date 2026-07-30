import { z } from "zod";
import type { NpcDialogueProfile } from "./data/npc-dialogue-profiles";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import {
  generateGeminiJson,
  geminiModel,
  hasGeminiConfig,
} from "./gemini-client";
import {
  NpcDialogueExchangeSchema,
  NpcDialogueSceneSchema,
  type NpcConversationMemory,
  type NpcDialogueExchange,
  type NpcDialoguePlayerChoice,
  type NpcDialogueScene,
} from "./schemas";

export type NpcDialogueRole = "npc_reply" | "player_choices";

export type NpcDialogueRoleRequest = {
  gameId: string;
  role: NpcDialogueRole;
  target: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
};

export type NpcDialogueRoleClient = <T>(
  request: NpcDialogueRoleRequest,
) => Promise<T>;

export type NpcDialogueWorldContext = {
  location: {
    id: string;
    name: string;
    summary: string;
    sceneTitle: string;
    sceneParagraphs: string[];
  };
  player: {
    day: number;
    phase: string;
    condition: {
      hp: number;
      mind: number;
      energy: number;
    };
    recentLog: string[];
  };
};

export type NpcDialogueGenerationInput = {
  gameId: string;
  profile: NpcDialogueProfile;
  context: NpcDialogueWorldContext;
  memory: NpcConversationMemory;
  visitCount: number;
  turnNumber: number;
  selectedChoice: NpcDialoguePlayerChoice | null;
};

export type NpcDialogueGenerationResult = {
  scene: NpcDialogueScene;
  exchange: NpcDialogueExchange;
  diagnostics: {
    latencyMs: number;
    fallback: boolean;
    errors: string[];
  };
};

export type NpcDialogueGenerator = (
  input: NpcDialogueGenerationInput,
) => Promise<NpcDialogueGenerationResult>;

const NpcReplyRoleOutputSchema = z.object({
  situation: z.string().min(1).max(600),
  dialogue: z.string().min(1).max(600),
}).strict();

const PlayerChoicesRoleOutputSchema = z.object({
  choices: z.array(z.object({
    label: z.string().min(1).max(120),
    postChoiceNarrative: z.array(
      z.string().min(1).max(600),
    ).length(2),
  }).strict()).length(3),
}).strict();

const NPC_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["situation", "dialogue"],
  properties: {
    situation: { type: "string" },
    dialogue: { type: "string" },
  },
} satisfies Record<string, unknown>;

const PLAYER_CHOICES_JSON_SCHEMA = {
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
        required: ["label", "postChoiceNarrative"],
        properties: {
          label: { type: "string" },
          postChoiceNarrative: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: "string" },
          },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const NPC_REPLY_PROMPT = `당신은 폐허가 된 서울을 배경으로 한 생존 이야기 속 NPC 한 명을 연기합니다.
입력으로 받은 npcProfile의 성격, 말투, 첫 관계와 알고 있는 범위를 일관되게 지키세요.
상황 설명은 NPC의 작은 행동, 표정, 주변 환경의 변화가 드러나는 짧은 서술로 작성하세요.
dialogue에는 NPC가 실제로 말한 대사만 넣고 따옴표는 붙이지 마세요.
처음 만남과 재방문을 구분하고, recentHistory에 나온 대화는 기억해서 자연스럽게 이어 가세요.
selectedChoice가 있으면 플레이어가 그 말과 행동을 실제로 했다고 받아들이고 반응하세요.
NPC는 질문하거나 화제를 바꾸고, 오해하고, 머뭇거리거나 먼저 작은 이야기를 꺼낼 수 있습니다.
NPC가 플레이어 대신 말하거나 플레이어의 감정을 확정하지 마세요.
아이템, 보상, 피해, 능력치, 퀘스트 완료처럼 게임 상태를 바꾸는 결과는 선언하지 마세요.

반환 JSON:
{
  "situation": "NPC의 행동과 주변 상황을 보여 주는 짧은 서술",
  "dialogue": "NPC가 실제로 하는 대사"
}`;

const PLAYER_CHOICES_PROMPT = `당신은 NPC 대화 장면에서 플레이어가 고를 자연스러운 답변을 만드는 작가입니다.
현재 NPC의 대사와 상황, 최근 대화 기록을 읽고 서로 다른 답변 세 개를 만드세요.
세 답변은 같은 뜻을 말투만 바꾼 것이 아니라 태도와 화제의 방향이 달라야 합니다.
label은 플레이어가 실제로 할 짧은 말이나 행동으로 작성하세요.
postChoiceNarrative는 정확히 두 문단으로 작성하세요.
두 문단은 하나의 장면처럼 자연스럽게 이어져야 합니다.
두 문단 모두 플레이어의 말과 행동, 시선과 거리, 주변 사물과 소리 중 장면에 필요한 요소를 자유롭게 섞어 상황을 풍부하게 전달하세요.
첫 문단은 행동, 둘째 문단은 배경처럼 문단별 역할을 고정하지 말고 선택지마다 묘사의 순서와 호흡을 다르게 만드세요.
두 문단은 플레이어의 선택이 NPC에게 전달되는 순간에서 끝내세요.
현재 장면에 이미 나온 NPC의 위치나 소지품은 배경으로 언급할 수 있지만, 선택 이후 NPC가 새로 움직이거나 말하거나 표정을 바꾸거나 감정을 느끼는 모습은 쓰지 마세요.
NPC의 다음 반응은 별도의 npc_reply 역할이 작성하므로 미리 암시하거나 확정하지 마세요.
성공·실패, 아이템, 보상, 피해, 능력치 변화도 확정하지 마세요.
목록 밖의 키는 만들지 마세요.

반환 JSON:
{
  "choices": [
    {
      "label": "플레이어의 짧고 자연스러운 답변",
      "postChoiceNarrative": [
        "선택한 말과 행동, 주변 상황이 자연스럽게 섞인 첫 문단",
        "같은 장면을 다른 감각과 움직임으로 끊김 없이 이어 가는 두 번째 문단"
      ]
    }
  ]
}`;

const ROLE_DEFINITIONS = {
  npc_reply: {
    systemPrompt: NPC_REPLY_PROMPT,
    temperature: 0.9,
    responseSchema: NpcReplyRoleOutputSchema,
    responseJsonSchema: NPC_REPLY_JSON_SCHEMA,
  },
  player_choices: {
    systemPrompt: PLAYER_CHOICES_PROMPT,
    temperature: 0.85,
    responseSchema: PlayerChoicesRoleOutputSchema,
    responseJsonSchema: PLAYER_CHOICES_JSON_SCHEMA,
  },
} satisfies Record<NpcDialogueRole, {
  systemPrompt: string;
  temperature: number;
  responseSchema: z.ZodType;
  responseJsonSchema: Record<string, unknown>;
}>;

export function hasNpcDialogueConfig() {
  return hasGeminiConfig();
}

export const generateNpcDialogueRoleJson: NpcDialogueRoleClient = async <T>(
  request: NpcDialogueRoleRequest,
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
        scope: "dialogue",
        target: request.target,
      },
    },
  );
  return output as T;
};

function recentHistory(memory: NpcConversationMemory) {
  return memory.exchanges.slice(-8).map((exchange) => ({
    turnNumber: exchange.turnNumber,
    playerChoice: exchange.playerChoice
      ? {
          label: exchange.playerChoice.label,
          postChoiceNarrative: exchange.playerChoice.postChoiceNarrative,
        }
      : null,
    npcReply: exchange.npcReply,
  }));
}

function fallbackReply(input: NpcDialogueGenerationInput) {
  if (!input.selectedChoice) {
    return {
      situation:
        input.visitCount <= 1
          ? "슈미는 라디오를 무릎 위에 내려놓고, 아직 경계를 풀지 않은 채 당신을 바라봤다."
          : "슈미는 익숙한 얼굴을 확인하듯 잠시 당신을 살핀 뒤 라디오의 음량을 낮췄다.",
      dialogue:
        input.visitCount <= 1
          ? "무슨 일이세요? 여기 구경하러 내려온 건 아닐 텐데요."
          : "또 오셨네요. 이번에는 무슨 일인데요?",
    };
  }
  return {
    situation:
      "슈미는 당신의 말을 끝까지 듣고도 바로 대답하지 않았다. 손끝으로 라디오 모서리를 한 번 두드린 뒤 시선을 들었다.",
    dialogue:
      "말씀은 들었어요. 그렇다고 제가 바로 믿겠다는 뜻은 아니니까, 계속 말해 보세요.",
  };
}

function fallbackChoices(): Array<{
  label: string;
  postChoiceNarrative: string[];
}> {
  return [
    {
      label: "여기서 어떻게 지내는지 물어본다",
      postChoiceNarrative: [
        "당신은 휑한 개찰구와 기둥 아래 놓인 낡은 담요를 차례로 살피며, 슈미가 이곳에서 얼마나 지냈는지 조심스럽게 물었다.",
        "낮춘 목소리가 빈 대합실에 짧게 울렸고, 질문 끝에는 천장에서 떨어진 물방울 소리가 겹쳐 들었다.",
      ],
    },
    {
      label: "경계할 필요는 없다고 말한다",
      postChoiceNarrative: [
        "당신은 두 손을 천천히 들어 보인 채 개찰구 쪽으로 한 걸음 물러나, 해칠 생각이 없다고 차분히 말했다.",
        "일부러 비워 둔 거리 사이로 라디오 잡음이 흘렀고, 당신은 서두르지 않겠다는 듯 그 자리에 발을 멈췄다.",
      ],
    },
    {
      label: "라디오에 대해 묻는다",
      postChoiceNarrative: [
        "낡은 스피커에서 새어 나오는 잡음을 따라 시선을 내린 당신은, 슈미의 무릎 위 작은 라디오를 턱짓으로 가리켰다.",
        "당신은 저 기계로 어떤 신호를 듣는지 물으며 목소리를 낮췄고, 끊긴 주파수가 대답 대신 어두운 기둥 사이를 맴돌았다.",
      ],
    },
  ];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createNpcDialogueGenerator(
  roleClient: NpcDialogueRoleClient = generateNpcDialogueRoleJson,
  roleConfigAvailable: () => boolean = hasNpcDialogueConfig,
): NpcDialogueGenerator {
  return async (input) => {
    const startedAt = Date.now();
    const errors: string[] = [];
    const history = recentHistory(input.memory);
    let reply = fallbackReply(input);
    let choices = fallbackChoices();
    let replyFromLlm = false;
    let choicesFromLlm = false;

    if (!roleConfigAvailable()) {
      errors.push("NPC dialogue LLM is not configured.");
    } else {
      try {
        reply = await roleClient<typeof reply>({
          gameId: input.gameId,
          role: "npc_reply",
          target:
            `npc-dialogue:${input.profile.id}:reply:turn:${input.turnNumber}`,
          payload: {
            npcProfile: input.profile,
            worldContext: input.context,
            visitCount: input.visitCount,
            turnNumber: input.turnNumber,
            recentHistory: history,
            selectedChoice: input.selectedChoice
              ? {
                  label: input.selectedChoice.label,
                  postChoiceNarrative:
                    input.selectedChoice.postChoiceNarrative,
                }
              : null,
          },
          timeoutMs: 20_000,
        });
        replyFromLlm = true;
      } catch (error) {
        errors.push(`npc_reply: ${errorMessage(error)}`);
      }

      try {
        const choiceOutput = await roleClient<{
          choices: Array<{
            label: string;
            postChoiceNarrative: string[];
          }>;
        }>({
          gameId: input.gameId,
          role: "player_choices",
          target:
            `npc-dialogue:${input.profile.id}:choices:turn:${input.turnNumber}`,
          payload: {
            npcProfile: {
              id: input.profile.id,
              name: input.profile.name,
              initialRelationship: input.profile.initialRelationship,
            },
            worldContext: input.context,
            visitCount: input.visitCount,
            turnNumber: input.turnNumber,
            recentHistory: history,
            npcReply: reply,
          },
          timeoutMs: 15_000,
        });
        choices = choiceOutput.choices;
        choicesFromLlm = true;
      } catch (error) {
        errors.push(`player_choices: ${errorMessage(error)}`);
      }
    }

    const playerChoices = choices.map((choice, index) => ({
      id:
        `npc-dialogue:${input.profile.id}:${input.turnNumber}:choice:${index + 1}`,
      label: choice.label,
      postChoiceNarrative: choice.postChoiceNarrative,
    }));
    const source = replyFromLlm && choicesFromLlm
      ? "llm" as const
      : replyFromLlm || choicesFromLlm
        ? "mixed" as const
        : "template" as const;
    const generatedAt = new Date().toISOString();
    const scene = NpcDialogueSceneSchema.parse({
      npcId: input.profile.id,
      turnNumber: input.turnNumber,
      situation: reply.situation,
      dialogue: reply.dialogue,
      choices: playerChoices,
      source,
      generatedAt,
    });
    const exchange = NpcDialogueExchangeSchema.parse({
      turnNumber: input.turnNumber,
      playerChoice: input.selectedChoice,
      npcReply: reply,
      at: generatedAt,
    });
    const latencyMs = Date.now() - startedAt;

    appendDevLlmTraceForGame(input.gameId, {
      scope: "dialogue",
      target:
        `npc-dialogue:${input.profile.id}:pipeline:turn:${input.turnNumber}`,
      stage: "draft_validation",
      model: roleConfigAvailable() ? geminiModel() : "server-template",
      status: source === "llm" ? "success" : "fallback",
      request: "",
      response: "",
      message:
        `npc_reply → player_choices · source ${source} · ${latencyMs}ms`,
      errorReason: errors.length > 0 ? errors.join(" | ") : undefined,
    });

    return {
      scene,
      exchange,
      diagnostics: {
        latencyMs,
        fallback: source !== "llm",
        errors,
      },
    };
  };
}

export const generateNpcDialogue = createNpcDialogueGenerator();
