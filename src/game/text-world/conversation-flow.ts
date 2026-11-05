import type { GameState } from "../schemas";
import type { TextWorld } from "../schemas/text-world";
import { NpcConversationMemorySchema } from "../schemas/npc-dialogue";
import { advanceGameSeconds } from "../rules";
import { nearbyWorldNpc } from "./observers";
import { interactionContext } from "./interaction-context";
import { recordEvent } from "./events";
import { directNarrative, rememberNarration } from "./perception";
import { fallbackNarration } from "./narrator";

// Game time for one short exchange, independent of provider latency and UI animation.
export const DIALOGUE_EXCHANGE_SECONDS = 30;
export function conversationObstacle(state: GameState, world: TextWorld | null | undefined, npcId: string): string | null {
  if (state.isGameOver || state.stageClear) return state.gameOverReason || "더는 대화를 이어갈 수 없다.";
  if (!world?.active) return null;
  const threat = interactionContext(world, state).threat;
  if (threat?.kind === "hostile") return "위협에 대응해야 해 대화가 끊긴다.";
  if (threat?.kind === "darkness") return "주변을 구별하기 어려워 대화를 잠시 멈춘다.";
  if (threat?.kind === "light_expiring") return "조명이 곧 꺼질 상태라 대화를 잠시 멈춘다.";
  if (threat?.kind === "door_closing") return "문이 곧 닫힐 상황이라 대화를 잠시 멈춘다.";
  const actor = nearbyWorldNpc(world, npcId);
  if (!actor || actor.components.actor?.active === false) return "상대 곁에서 대화를 이어갈 수 없는 상황이다.";
  if (actor.components.actor?.life?.mode === "ESCAPE") return "상대가 물러나고 있어 대화를 이어갈 수 없다.";
  return null;
}

/** Check each simulated second so a short interruption cannot consume the entire exchange. */
export function advanceConversation(state: GameState, world: TextWorld | null | undefined, npcId: string, seconds = DIALOGUE_EXCHANGE_SECONDS) {
  const obstacle = conversationObstacle(state, world, npcId);
  if (obstacle) {
    // Let an already visible danger produce the actor's real one-second reaction.
    if (world?.active && !state.isGameOver && !state.stageClear && interactionContext(world, state).threat?.kind === "hostile")
      advanceGameSeconds(state, 1, { actionWorld: world });
    return obstacle;
  }
  for (let remaining = seconds; remaining > 0; remaining--) {
    advanceGameSeconds(state, 1, world?.active ? { actionWorld: world } : {});
    const interrupted = conversationObstacle(state, world, npcId);
    if (interrupted) return interrupted;
  }
  return null;
}

/** Finish on engine facts, without buying another dialogue or narration request. */
export function interruptConversation(state: GameState, world: TextWorld | null | undefined, npcId: string, reason: string, completed: string[] = []) {
  const turn = state.npcDialogue.active?.turnNumber ?? -1;
  state.npcDialogue.active = null;
  let paragraphs = [...completed, reason];
  if (world?.active) {
    const actor = Object.values(world.entities).find(e => e.components.actor?.npcId === npcId);
    recordEvent(world, { type: "STOPPED", targetId: actor?.id, attemptedAction: "NPC_DIALOGUE", reason, before: {}, after: { npcId, interrupted: true } });
    const changedSpace = world.events.some(e => e.witnessed !== false && ["ACTOR_MOVE", "OPEN", "AUTO_CLOSE", "LIGHT_EXPIRED"].includes(e.type));
    world.lastIntent = { id: "conversation:interrupted", label: "대화를 이어가려다 중단한다", importance: changedSpace ? "major" : "minor" };
    const context = directNarrative(world), narration = fallbackNarration(context);
    paragraphs = [...completed, ...narration.paragraphs];
    world.lastParagraphs = paragraphs;
    world.lastParagraphSources = paragraphs.map(() => "template");
    world.source = "template";world.sceneRevision++;
    rememberNarration(world, context, narration.usedFactIds, paragraphs);
  }
  state.npcDialogue.departure = { npcId, locationId: state.location, paragraphs, reason: "interrupted", generatedAt: new Date().toISOString() };
  const memory = NpcConversationMemorySchema.parse(state.npcDialogue.conversations[npcId] ?? {});
  memory.observations = [...memory.observations, { id: "dialogue-interrupted:" + npcId + ":" + turn + ":" + (world?.revision ?? state.worldElapsedMs), worldId: state.location,
    sequence: Math.max(0, turn), atMs: state.worldElapsedMs, sense: "exchange" as const, eventType: "dialogue_interrupted", actorKnown: true, summary: reason }].slice(-24);
  state.npcDialogue.conversations[npcId] = memory;
}
