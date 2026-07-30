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
    ).min(1).max(2),
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
            minItems: 1,
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
postChoiceNarrative는 버튼을 누른 직후 플레이어가 그 말이나 행동을 시작하는 모습만 묘사하세요.
NPC의 다음 반응, 성공·실패, 아이템, 보상, 피해, 능력치 변화는 확정하지 마세요.
목록 밖의 키는 만들지 마세요.

반환 JSON:
{
  "choices": [
    {
      "label": "플레이어의 짧고 자연스러운 답변",
      "postChoiceNarrative": ["플레이어가 답하거나 행동을 시작하는 짧은 서술"]
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
        "당신은 개찰구 주변을 둘러본 뒤, 이곳에서의 생활에 대해 조심스럽게 물었다.",
      ],
    },
    {
      label: "경계할 필요는 없다고 말한다",
      postChoiceNarrative: [
        "당신은 빈손을 보인 채 한 걸음 물러서서, 해칠 생각이 없다고 말했다.",
      ],
    },
    {
      label: "라디오에 대해 묻는다",
      postChoiceNarrative: [
        "당신은 슈미의 무릎 위에 놓인 작은 라디오로 시선을 옮겼다.",
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
