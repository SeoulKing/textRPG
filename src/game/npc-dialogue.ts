import { npcSocialActions } from "./npc-social";
import type { ContentRegistry } from "./schemas";
import { defaultDialogueThought } from "./npc-dialogue-pipeline";
import { validChoiceThought } from "./text-world/choice-thoughts";
import { particle } from "./text-world/world";
import type { NpcDialogueProfile } from "./data/npc-dialogue-profiles";
import type { NpcDialogueGenerationResult } from "./npc-dialogue-pipeline";
import {
  NpcConversationMemorySchema,
  NpcDialogueStateSchema,
  type ActionChoice,
  type GameState,
  type NpcConversationMemory,
  type NpcDialoguePlayerChoice,
  type SceneCard,
} from "./schemas";

const MAX_STORED_EXCHANGES = 20;

export function npcDialogueMemory(
  state: GameState,
  npcId: string,
): NpcConversationMemory {
  return NpcConversationMemorySchema.parse(
    state.npcDialogue.conversations[npcId] ?? {},
  );
}

export function nextNpcDialogueTurn(memory: NpcConversationMemory) {
  const lastTurn = memory.exchanges.at(-1)?.turnNumber;
  return lastTurn === undefined ? 0 : lastTurn + 1;
}

export function selectNpcDialogueChoice(
  state: GameState,
  npcId: string,
  choiceId: string | undefined,
  turnNumber: number | undefined,
): NpcDialoguePlayerChoice {
  const active = state.npcDialogue.active;
  if (!active || active.npcId !== npcId) {
    throw new Error("현재 이 인물과 대화하고 있지 않습니다.");
  }
  if (turnNumber !== active.turnNumber) {
    throw new Error("이미 지난 대화 선택지입니다.");
  }
  const choice = active.currentScene.choices.find(
    (candidate) => candidate.id === choiceId,
  );
  if (!choice) {
    throw new Error("현재 대화에서 선택할 수 없는 답변입니다.");
  }
  return choice;
}

export function applyNpcDialogueGeneration(
  state: GameState,
  result: NpcDialogueGenerationResult,
  options: { newVisit: boolean },
) {
  const npcId = result.scene.npcId;
  const memory = npcDialogueMemory(state, npcId);
  const exchanges = [...memory.exchanges, result.exchange]
    .slice(-MAX_STORED_EXCHANGES);
  state.npcDialogue.conversations[npcId] = {
    ...memory,
    visitCount: memory.visitCount + (options.newVisit ? 1 : 0),
    exchanges,
  };
  delete state.npcDialogue.departure;
  state.npcDialogue.active = {
    npcId,
    turnNumber: result.scene.turnNumber,
    currentScene: result.scene,
  };
  state.npcDialogue = NpcDialogueStateSchema.parse(state.npcDialogue);
}

export function leaveNpcDialogue(state: GameState, npcId: string, name = npcId) {
  const active = state.npcDialogue.active;
  if (!active || active.npcId !== npcId) {
    throw new Error("현재 이 인물과 대화하고 있지 않습니다.");
  }
  state.npcDialogue.active = null;
  state.npcDialogue.departure = { npcId, locationId: state.location,
    paragraphs: ["짧게 인사를 건네고 " + particle(name, "과", "와") + "의 대화를 마친다."], generatedAt: new Date().toISOString() };
}

export function buildNpcDialogueScene(
  state: GameState,
  profile: NpcDialogueProfile | null,
): SceneCard | null {
  const active = state.npcDialogue.active;
  const departure = state.npcDialogue.departure;
  if (!active && departure?.locationId === state.location) return { id: "npc-dialogue:" + departure.npcId + ":departure:" + departure.generatedAt,
    locationId: state.location, title: "대화를 마치고", paragraphs: departure.paragraphs, choices: [],
    materialIds: { locationIds: [state.location], personIds: [departure.npcId], itemIds: [] }, source: "template", generatedAt: departure.generatedAt };
  if (!active || !profile || active.npcId !== profile.id) {
    return null;
  }
  const scene = active.currentScene;
  return {
    id: `npc-dialogue:${profile.id}:turn:${scene.turnNumber}`,
    locationId: state.location,
    title: `${profile.name}와의 대화`,
    paragraphs: [
      ...(scene.outcomeParagraph ? [scene.outcomeParagraph] : []),
      scene.situation,
      `“${scene.dialogue.replace(/^[“"]|[”"]$/g, "")}”`,
    ],
    choices: [],
    materialIds: {
      locationIds: [state.location],
      personIds: [profile.id],
      itemIds: [],
    },
    source: scene.replySource ?? (scene.source === "template" ? "template" : "llm"),
    generatedAt: scene.generatedAt,
  };
}

export function buildNpcDialogueActions(state: GameState, registry?: ContentRegistry): ActionChoice[] {
  const active = state.npcDialogue.active;
  if (!active) return [];
  const generated = active.currentScene.choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    outcomeHint: "",
    showOutcomeHint: false,
    loading: { durationMs: 500, transitionType: "activity" as const },
    choiceThought: validChoiceThought(choice.thought) ? choice.thought : defaultDialogueThought(choice.label),
    choiceThoughtSource: validChoiceThought(choice.thought) ? choice.thoughtSource ?? "template" : "template",
    action: {
      type: "npc_dialogue" as const,
      command: "choose" as const,
      npcId: active.npcId,
      choiceId: choice.id,
      turnNumber: active.turnNumber,
    },
    isAvailable: true,
  }));
  return [
    ...generated,
    ...npcSocialActions(state, registry).slice(0, 1),
    {
      id: `npc-dialogue:${active.npcId}:leave`,
      label: "대화를 마친다",
      outcomeHint: "",
      showOutcomeHint: false,
      loading: { durationMs: 500, transitionType: "activity" },
      choiceThought: "이쯤에서 얘기를 마쳐도 되겠지.",
      choiceThoughtSource: "template",
      action: {
        type: "npc_dialogue",
        command: "leave",
        npcId: active.npcId,
      },
      isAvailable: true,
    },
  ];
}

export function buildNpcDialogueStartAction(
  profile: NpcDialogueProfile,
): ActionChoice {
  return {
    id: `npc-dialogue:${profile.id}:start`,
    label: `${profile.name}와 대화하기`,
    outcomeHint: "",
    showOutcomeHint: false,
    loading: { durationMs: 500, transitionType: "activity" },
    choiceThought: "잠깐 말을 걸어 볼까.",
    choiceThoughtSource: "template",
    action: {
      type: "npc_dialogue",
      command: "start",
      npcId: profile.id,
    },
    isAvailable: true,
  };
}
