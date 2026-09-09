import { itemLedger } from "../item-ledgers";
import type { GameAction, GameState } from "../schemas";
import type { TextWorld } from "../schemas/text-world";
import { applySystemNote } from "../rules";
import { setSystemNote } from "../system-note";
import { isHeld } from "./hands";
import { carriedByPlayer } from "./spatial";
import { inventoryRegistered, reconcileWorldInventory } from "./inventory-state";
import { resolveWorldActions } from "./engine";
import { directNarrative, rememberNarration } from "./perception";
import { fallbackNarration } from "./narrator";

function lightWorlds(state: GameState): [string, TextWorld][] {
  return [...(state.textWorld ? [["subway", state.textWorld] as [string, TextWorld]] : []), ...Object.entries(state.locationTextWorlds)];
}

export function inventoryLightControls(state: GameState) {
  return lightWorlds(state).flatMap(([worldId, world]) => Object.values(world.entities).flatMap(entity => {
    const { light, portable, position } = entity.components;
    if (!light || !portable?.itemId || !inventoryRegistered(world, entity) || !carriedByPlayer(world, entity) || (itemLedger(state,entity)[portable.itemId] ?? 0) < portable.amount) return [];
    const reason = position.zone !== "player" ? "보관한 용기에서 먼저 꺼내 주세요." : light.fuelSeconds === 0 ? "전원이 소진되었습니다." : undefined;
    return [{ worldId, entityId: entity.id, itemId: portable.itemId, name: entity.name, revision: world.revision,
      on: light.on, canTurnOn: !reason, reason }];
  }));
}

/** A desired state plus revision makes delayed/double clicks unable to toggle it back. */
export function performInventoryLightAction(state: GameState, action: Extract<GameAction, { type: "item_light" }>, deferNarration=false) {
  if (state.isGameOver || state.stageClear) throw new Error("지금은 아이템을 조작할 수 없습니다.");
  reconcileWorldInventory(state);
  const control = inventoryLightControls(state).find(c => c.worldId === action.worldId && c.entityId === action.entityId);
  if (!control) throw new Error("가지고 있는 조명이 아닙니다.");
  if (control.revision !== action.revision) throw new Error("상황이 바뀌었습니다. 아이템 상태를 다시 확인해 주세요.");
  if (control.on === action.on) return;
  const world = lightWorlds(state).find(([id]) => id === action.worldId)![1];
  if (world.entities[action.entityId].components.position.zone !== "player" || action.on && !control.canTurnOn)
    throw new Error(control.reason ?? "지금은 조작할 수 없습니다.");
  const before = structuredClone(state), wasActive = world.active;
  const inScene = wasActive && action.worldId === state.location;
  const attention = { focusEntityId: world.player.focusEntityId, facing: world.player.facing, manipulating: world.player.manipulating, placementTargetId: world.player.placementTargetId };
  world.events = [];
  // A carried object remains usable from the inventory outside its original room.
  world.active = true;
  let result;
  try {
    result = resolveWorldActions(world, state, [
      ...(action.on && !isHeld(world, action.entityId) ? [{ type: "HOLD" as const, target: action.entityId }] : []),
      { type: "LIGHT", target: action.entityId },
    ]);
  } finally {
    world.active = wasActive;
    Object.assign(world.player, attention);
  }
  world.revision++;
  world.choiceLabels = {};
  applySystemNote(before, state);
  setSystemNote(state, [...state.systemNoteEntries.filter(entry => entry.type !== "time"),
    { type: "text", text: control.name + (world.entities[action.entityId].components.light!.on ? " 켜짐" : " 꺼짐") + " · +" + result.elapsedSeconds + "초", tone: "neutral" }]);
  if (inScene && !deferNarration) {
    world.lastIntent = { id: "inventory-light:" + action.entityId, label: control.name + (action.on ? " 켜기" : " 끄기"), importance: "minor" };
    const context = directNarrative(world), rendered = fallbackNarration(context);
    world.sceneRevision++;
    world.lastParagraphs = rendered.paragraphs;
    world.lastParagraphSources = undefined;
    world.source = rendered.source;
    rememberNarration(world, context, rendered.usedFactIds, rendered.paragraphs);
  }
}
