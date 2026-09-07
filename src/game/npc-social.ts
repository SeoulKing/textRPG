import type { ActionChoice, ContentRegistry, GameAction, GameState, ItemCard } from "./schemas";
import { NpcConversationMemorySchema } from "./schemas/npc-dialogue";
import { getNpcDialogueProfile, type NpcDialogueProfile } from "./data/npc-dialogue-profiles";
import { buildRuntimeRegistry } from "./runtime-registry";
import { applyEffect } from "./state-utils";
import { advanceGameSeconds } from "./rules";
import { reconcileWorldInventory } from "./text-world/inventory-state";
import { particle } from "./text-world/world";

export function runtimeSocialProfile(npcId: string, registry: ContentRegistry): NpcDialogueProfile | null {
  const profile = getNpcDialogueProfile(npcId);
  const person = registry.people[npcId] as { name: string; role: string; personality: string[]; relationToPlayer: string; locationId: string; summary: string } | undefined;
  if (!person) return null;
  return { ...profile, id: npcId, name: person.name, identity: person.summary || person.role,
    homeLocationId: person.locationId, personality: person.personality, initialRelationship: person.relationToPlayer,
    speechStyle: profile?.speechStyle ?? ["설정된 성격에 맞는 차분한 존댓말을 쓴다."],
    visibleDetails: profile?.visibleDetails ?? [], knowledgeScope: profile?.knowledgeScope ?? ["현재 지내는 장소와 실제로 목격하거나 들은 일"] };
}
export function socialMemory(state: GameState, profile: NpcDialogueProfile) {
  const memory = NpcConversationMemorySchema.parse(state.npcDialogue.conversations[profile.id] ?? {});
  if (!memory.inventoryInitialized) memory.inventory = { ...profile.initialInventory };
  return memory;
}
export function npcSocialActions(state: GameState, registry: ContentRegistry = buildRuntimeRegistry(state)): ActionChoice[] {
  const active = state.npcDialogue.active, profile = active && runtimeSocialProfile(active.npcId, registry);
  if (!active || !profile || profile.homeLocationId !== state.location || state.isGameOver || state.stageClear) return [];
  const memory = socialMemory(state, profile), choices: ActionChoice[] = [];
  const itemName = (id: string) => (registry.items[id] as ItemCard | undefined)?.name;
  const offer = (id: string, label: string, hint: string, command: "give" | "trade", data: { itemId?: string; offerId?: string }) => choices.push({
    id: "npc-social:" + active.turnNumber + ":" + id, label, outcomeHint: hint, showOutcomeHint: true, isAvailable: true,
    choiceThought: command === "give" ? "조금 나눠 줘도 괜찮겠지." : "서로 필요한 걸 바꾸면 되겠지.", choiceThoughtSource: "template",
    loading: { durationMs: 500, transitionType: "activity" },
    action: { type: "npc_dialogue", command, npcId: active.npcId, turnNumber: active.turnNumber, ...data },
  });
  for (const trade of profile.trades ?? []) if (memory.affinity >= trade.minAffinity && (state.inventory[trade.give.itemId] ?? 0) >= trade.give.amount && (memory.inventory[trade.receive.itemId] ?? 0) >= trade.receive.amount && itemName(trade.give.itemId) && itemName(trade.receive.itemId)) {
    offer(trade.id, `${itemName(trade.give.itemId)} ${trade.give.amount}개와 ${itemName(trade.receive.itemId)} ${trade.receive.amount}개를 맞바꾼다`, "물물교환 · 5초", "trade", { offerId: trade.id });
  }
  for (const itemId of profile.acceptedGifts ?? []) if ((state.inventory[itemId] ?? 0) > 0 && itemName(itemId)) {
    offer("give:" + itemId, `${profile.name}에게 ${itemName(itemId)} 하나를 건넨다`, `${itemName(itemId)} -1 · 5초`, "give", { itemId });
  }
  return choices;
}
export type NpcSocialOutcome = { kind: "give" | "trade"; paragraph: string; affinity: number; npcName: string; given: { itemId: string; name: string; amount: number }; received?: { itemId: string; name: string; amount: number } };
export function performNpcSocialAction(state: GameState, action: Extract<GameAction, { type: "npc_dialogue" }>, registry: ContentRegistry): NpcSocialOutcome {
  const active = state.npcDialogue.active;
  if (!active || active.npcId !== action.npcId || action.turnNumber !== active.turnNumber) throw new Error("이미 지난 대화 선택지입니다.");
  const offered = npcSocialActions(state, registry).find(choice => choice.action.type === "npc_dialogue" && choice.action.command === action.command && choice.action.itemId === action.itemId && choice.action.offerId === action.offerId);
  if (!offered) throw new Error("현재 상황에서는 선택할 수 없는 행동입니다.");
  const profile = runtimeSocialProfile(action.npcId, registry)!, memory = socialMemory(state, profile);
  const trade = action.command === "trade" ? profile.trades!.find(trade => trade.id === action.offerId)! : undefined;
  const given = { ...(trade?.give ?? { itemId: action.itemId!, amount: 1 }), name: (registry.items[trade?.give.itemId ?? action.itemId!] as ItemCard).name };
  const received = trade && { ...trade.receive, name: (registry.items[trade.receive.itemId] as ItemCard).name };
  applyEffect({ type: "remove_item", itemId: given.itemId, amount: given.amount }, state);
  memory.inventory[given.itemId] = (memory.inventory[given.itemId] ?? 0) + given.amount;
  if (received) {
    memory.inventory[received.itemId] -= received.amount;
    applyEffect({ type: "add_item", itemId: received.itemId, amount: received.amount }, state);
  } else memory.affinity = Math.min(10, memory.affinity + 1);
  memory.inventoryInitialized = true;
  const paragraph = `${given.name} ${given.amount}개를 건네자 ${particle(profile.name,"이","가")} 받아 든다.` + (received ? ` 대신 ${received.name} ${received.amount}개를 받아 챙긴다.` : "");
  memory.observations = [...memory.observations, { id: "exchange:" + active.npcId + ":" + active.turnNumber, worldId: state.location, sequence: active.turnNumber, atMs: state.worldElapsedMs, sense: "exchange" as const, eventType: action.command, actorKnown: true, summary: paragraph }].slice(-24);
  state.npcDialogue.conversations[profile.id] = memory;
  reconcileWorldInventory(state);advanceGameSeconds(state, 5);
  return { kind: trade ? "trade" : "give", paragraph, affinity: memory.affinity, npcName: profile.name, given, ...(received ? { received } : {}) };
}