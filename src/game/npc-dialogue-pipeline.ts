import { z } from "zod";
import type { NpcDialogueProfile } from "./data/npc-dialogue-profiles";
import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { generateGeminiJson, geminiModel, hasGeminiConfig } from "./gemini-client";
import { particle } from "./text-world/world";
import { validChoiceThought } from "./text-world/choice-thoughts";
import {
  NpcDialogueExchangeSchema, NpcDialogueSceneSchema,
  type NpcConversationMemory, type NpcDialogueExchange, type NpcDialoguePlayerChoice, type NpcDialogueScene,
} from "./schemas";

export type NpcDialogueRole = "dialogue_turn";
export type NpcDialogueRoleRequest = { gameId: string; role: NpcDialogueRole; target: string; payload: Record<string, unknown>; timeoutMs?: number };
export type NpcDialogueRoleClient = <T>(request: NpcDialogueRoleRequest) => Promise<T>;
export type NpcDialogueWorldContext = {
  location: { id: string; name: string; summary: string; sceneTitle: string; sceneParagraphs: string[] };
  player: { day: number; phase: string; condition: { hp: number; mind: number; energy: number }; recentLog: string[] };
};
export type NpcDialogueGenerationInput = { gameId: string; profile: NpcDialogueProfile; context: NpcDialogueWorldContext;
  memory: NpcConversationMemory; visitCount: number; turnNumber: number; selectedChoice: NpcDialoguePlayerChoice | null };
export type NpcDialogueGenerationResult = { scene: NpcDialogueScene; exchange: NpcDialogueExchange;
  diagnostics: { latencyMs: number; fallback: boolean; errors: string[] } };
export type NpcDialogueGenerator = (input: NpcDialogueGenerationInput) => Promise<NpcDialogueGenerationResult>;

const ReplySchema = z.object({ situation: z.string().trim().min(1).max(600), dialogue: z.string().trim().min(1).max(600) });
const ChoiceSchema = z.object({ label: z.string().trim().min(1).max(120), thought: z.unknown().optional() });
const RESPONSE_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["situation", "dialogue", "choices"],
  properties: {
    situation: { type: "string" }, dialogue: { type: "string" },
    choices: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", additionalProperties: false,
      required: ["label", "thought"], properties: { label: { type: "string" }, thought: { type: "string" } } } },
  },
} satisfies Record<string, unknown>;
const DIALOGUE_PROMPT = [
  "폐허 서울의 NPC 대화 한 턴을 작성한다. NPC 반응과 다음 답변 세 개를 한 JSON으로 반환한다.",
  "npcProfile의 성격·말투·알고 있는 범위를 지킨다. 처음 만남과 재방문, 최근 대화를 구분한다.",
  "situation은 주어를 주로 생략한 한국어 1인칭 현재형 소설 문단이다. 선택한 질문이나 말이 전달되고 NPC가 반응하는 장면을 연결한다.",
  "selectedChoice.label은 지금 실제로 선택한 대화 의도다. 그 뜻을 지키고 새로운 약속·이동·수집·조작을 대신 결정하지 않는다.",
  "selectedChoice.thought는 대기 중 이미 표시한 속말이며 입 밖에 한 대사가 아니다. 이를 반복하거나 NPC가 들은 것처럼 반응하지 않는다.",
  "dialogue에는 그 장면에서 NPC가 실제로 하는 대사만 넣는다. 플레이어의 감정을 확정하지 않는다.",
  "사물·감각·공간은 npcProfile과 worldContext에 근거한다. 과거 대화는 대화 기억이며 현재 사물 배치를 증명하지 않는다.",
  "아이템 지급·돈 거래·피해·회복·퀘스트 완료 등 엔진 상태를 바꾸는 결과는 선언하지 않는다.",
  "choices는 방금 쓴 NPC 반응에 이어 질문·대답·화제 전환 중 서로 다른 대화 의도 세 개다. 같은 뜻을 말투만 바꿔 채우지 않는다.",
  "각 label은 짧은 답변 또는 말할 의도다. 각 thought는 상황에 맞는 8~30자 정도의 짧은 속말이다. 궁금증과 가벼운 의도만 담고 결과·감정·숨은 사실을 단정하지 않는다.",
  "앞으로 선택할 행동을 미리 서술하는 문단, NPC의 미래 반응, 선택 결과는 만들지 않는다. 선택지에는 label과 thought만 쓴다.",
  'JSON {situation,dialogue,choices:[{label,thought}]}만 반환한다.',
].join("\n");

export function hasNpcDialogueConfig() { return hasGeminiConfig(); }
export const generateNpcDialogueRoleJson: NpcDialogueRoleClient = async <T>(request: NpcDialogueRoleRequest) =>
  generateGeminiJson<T>(DIALOGUE_PROMPT, request.payload, {
    model: geminiModel(), temperature: 0.85, timeoutMs: request.timeoutMs,
    // Validate the two sections independently below so a bad choice never discards a valid reply or triggers a retry.
    responseJsonSchema: RESPONSE_JSON_SCHEMA,
    trace: { gameId: request.gameId, scope: "dialogue", target: request.target },
  });

export function defaultDialogueThought(label: string) {
  if (/라디오|신호|방송/.test(label)) return "무슨 소식을 듣고 있을까.";
  if (/경계|안심|믿/.test(label)) return "말을 조금 더 해 보는 게 좋겠지.";
  if (/지내|생활|이곳|여기/.test(label)) return "이곳 사정은 좀 알고 있을까.";
  return "이 얘기를 좀 더 해 볼까.";
}
function cleanChoice(choice: NpcDialoguePlayerChoice): NpcDialoguePlayerChoice {
  const valid = validChoiceThought(choice.thought);
  return { id: choice.id, label: choice.label, thought: valid ? choice.thought : defaultDialogueThought(choice.label),
    thoughtSource: valid ? choice.thoughtSource ?? "template" : "template" };
}
function recentHistory(memory: NpcConversationMemory) {
  return memory.exchanges.slice(-8).map(exchange => ({
    turnNumber: exchange.turnNumber,
    playerChoice: exchange.playerChoice ? { label: exchange.playerChoice.label } : null,
    npcReply: exchange.npcReply,
  }));
}
function fallbackReply(input: NpcDialogueGenerationInput) {
  const name = input.profile.name;
  if (!input.selectedChoice) return {
    situation: name + "에게 다가가 말을 건다. " + (input.visitCount <= 1 ? particle(name, "이", "가") + " 고개를 들어 이쪽을 살핀다." : particle(name, "이", "가") + " 익숙한 얼굴을 확인하듯 이쪽을 살핀다."),
    dialogue: input.visitCount <= 1 ? "무슨 일이세요? 여기 구경하러 내려온 건 아닐 텐데요." : "또 오셨네요. 이번에는 무슨 일인데요?",
  };
  return { situation: input.selectedChoice.label.replace(/[.!?]$/, "") + ". " + particle(name, "은", "는") + " 말을 끝까지 듣고 잠시 대답을 고른다.",
    dialogue: "말씀은 들었어요. 그렇다고 제가 바로 믿겠다는 뜻은 아니니까, 계속 말해 보세요." };
}
function fallbackChoices() {
  return ["여기서 어떻게 지내는지 물어본다", "경계할 필요는 없다고 말한다", "라디오에 대해 묻는다"]
    .map(label => ({ label, thought: defaultDialogueThought(label), thoughtSource: "template" as const }));
}

export function createNpcDialogueGenerator(
  roleClient: NpcDialogueRoleClient = generateNpcDialogueRoleJson,
  roleConfigAvailable: () => boolean = hasNpcDialogueConfig,
): NpcDialogueGenerator {
  return async input => {
    const startedAt = Date.now(), errors: string[] = [], configured = roleConfigAvailable();
    let reply = fallbackReply(input), replyFromLlm = false, choicesFromLlm = false;
    let choices: { label: string; thought: string; thoughtSource: "template" | "llm" }[] = fallbackChoices();
    if (!configured) errors.push("NPC dialogue LLM is not configured.");
    else {
      try {
        const profile = input.profile;
        const output = await roleClient<unknown>({ gameId: input.gameId, role: "dialogue_turn",
          target: "npc-dialogue:" + input.profile.id + ":turn:" + input.turnNumber,
          payload: { npcProfile: profile, worldContext: input.context, visitCount: input.visitCount, turnNumber: input.turnNumber,
            recentHistory: recentHistory(input.memory), selectedChoice: input.selectedChoice ? { label: input.selectedChoice.label, thought: cleanChoice(input.selectedChoice).thought } : null },
          timeoutMs: 20_000 });
        const data = output && typeof output === "object" ? output as Record<string, unknown> : {};
        const parsedReply = ReplySchema.safeParse(data);
        if (parsedReply.success) { reply = parsedReply.data; replyFromLlm = true; }
        else errors.push("dialogue_turn: invalid reply");
        const parsedChoices = z.array(ChoiceSchema).length(3).safeParse(data.choices);
        if (replyFromLlm && parsedChoices.success && new Set(parsedChoices.data.map(c => c.label)).size === 3) {
          choices = parsedChoices.data.map(choice => {
            const rawThought = choice.thought;
            const valid = validChoiceThought(rawThought);
            if (!valid) errors.push("dialogue_turn: invalid thought");
            return { label: choice.label, thought: valid ? rawThought : defaultDialogueThought(choice.label), thoughtSource: valid ? "llm" : "template" };
          });
          choicesFromLlm = true;
        } else errors.push("dialogue_turn: invalid choices");
      } catch (error) { errors.push("dialogue_turn: " + (error instanceof Error ? error.message : String(error))); }
    }
    const source = replyFromLlm && choicesFromLlm && choices.every(c => c.thoughtSource === "llm") ? "llm" : replyFromLlm || choicesFromLlm ? "mixed" : "template";
    const generatedAt = new Date().toISOString();
    const scene = NpcDialogueSceneSchema.parse({ npcId: input.profile.id, turnNumber: input.turnNumber, ...reply,
      choices: choices.map((choice, i) => ({ id: "npc-dialogue:" + input.profile.id + ":" + input.turnNumber + ":choice:" + (i + 1), ...choice })),
      source, replySource: replyFromLlm ? "llm" : "template", generatedAt });
    const exchange = NpcDialogueExchangeSchema.parse({ turnNumber: input.turnNumber,
      playerChoice: input.selectedChoice ? cleanChoice(input.selectedChoice) : null, npcReply: reply, at: generatedAt });
    const latencyMs = Date.now() - startedAt;
    appendDevLlmTraceForGame(input.gameId, { scope: "dialogue", target: "npc-dialogue:" + input.profile.id + ":turn:" + input.turnNumber,
      stage: "draft_validation", model: configured ? geminiModel() : "server-template", status: source === "llm" ? "success" : "fallback",
      request: "", response: "", message: "dialogue_turn · source " + source + " · " + latencyMs + "ms", errorReason: errors.length ? errors.join(" | ") : undefined });
    return { scene, exchange, diagnostics: { latencyMs, fallback: source !== "llm", errors } };
  };
}
export const generateNpcDialogue = createNpcDialogueGenerator();
