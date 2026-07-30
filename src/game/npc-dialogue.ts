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
    visitCount: memory.visitCount + (options.newVisit ? 1 : 0),
    exchanges,
  };
  state.npcDialogue.active = {
    npcId,
    turnNumber: result.scene.turnNumber,
    currentScene: result.scene,
  };
  state.npcDialogue = NpcDialogueStateSchema.parse(state.npcDialogue);
}

export function leaveNpcDialogue(state: GameState, npcId: string) {
  const active = state.npcDialogue.active;
  if (!active || active.npcId !== npcId) {
    throw new Error("현재 이 인물과 대화하고 있지 않습니다.");
  }
  state.npcDialogue.active = null;
}

export function buildNpcDialogueScene(
  state: GameState,
  profile: NpcDialogueProfile | null,
): SceneCard | null {
  const active = state.npcDialogue.active;
  if (!active || !profile || active.npcId !== profile.id) {
    return null;
  }
  const scene = active.currentScene;
  return {
    id: `npc-dialogue:${profile.id}:turn:${scene.turnNumber}`,
    locationId: state.location,
    title: `${profile.name}와의 대화`,
    paragraphs: [
      scene.situation,
      `“${scene.dialogue.replace(/^[“"]|[”"]$/g, "")}”`,
    ],
    choices: [],
    materialIds: {
      locationIds: [state.location],
      personIds: [profile.id],
      itemIds: [],
    },
    source: scene.source === "template" ? "template" : "llm",
    generatedAt: scene.generatedAt,
  };
}

export function buildNpcDialogueActions(state: GameState): ActionChoice[] {
  const active = state.npcDialogue.active;
  if (!active) return [];
  const generated = active.currentScene.choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    outcomeHint: "",
    showOutcomeHint: false,
    loading: {},
    postChoiceNarrative: choice.postChoiceNarrative,
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
    {
      id: `npc-dialogue:${active.npcId}:leave`,
      label: "대화를 마친다",
      outcomeHint: "",
      showOutcomeHint: false,
      postChoiceNarrative: [
        "당신은 짧게 인사를 건네고 슈미와의 대화를 마쳤다.",
      ],
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
    loading: {},
    postChoiceNarrative: [...profile.openingApproachNarrative],
    action: {
      type: "npc_dialogue",
      command: "start",
      npcId: profile.id,
    },
    isAvailable: true,
  };
}
