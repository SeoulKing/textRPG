import type { GameState } from "../schemas";
import type { TextWorld, WorldAction, WorldEvent } from "../schemas/text-world";
import { advanceGameSeconds } from "../rules";
import { handledEntityId, heldInSlot, holdEntity, isHeld, normalizeHands, releaseHand } from "./hands";
import { inventoryRegistered, inventoryTreeAvailable, transferInventoryOwnership } from "./inventory-state";
import { carriedByPlayer, passageBlockers, rootZone } from "./spatial";
import { recordEvent } from "./events";
import { applyToolUse, materializeTool, toolTechniques, validateToolUse } from "./tool-rules";
import { observeWorldEvent, propertyOwner, synchronizeWorldActors } from "./observers";
import { applyRepair, validateRepair } from "./structure-rules";
import { advanceWorldSimulation, emitMovementSound } from "./simulation";
import { applyInteraction, interactionTypes, validateInteraction } from "./interactions";
export { recordEvent } from "./events";
import { adjacentZones, hasDoorKey, canReach, carriesLight, entityDetails, illuminated, pathOpen, worldRooms, visibleEntities, portalBetween } from "./world";

const seconds: Record<WorldAction["type"], number> = { LOOK: 3, INSPECT: 5, MOVE: 5, POSTURE: 1, UNLOCK: 3, OPEN: 2, CLOSE: 2, TAKE: 3, HOLD: 2, STOW: 2, LIGHT: 1, SURVEY: 5, LEAVE: 5, PUSH: 8, PUT: 3, DROP: 2, WAIT: 5, HIDE: 2, DEFOCUS: 2, FOCUS: 1, USE_TOOL: 20, REPAIR: 30 };
export function validateWorldAction(world: TextWorld, state: GameState, action: WorldAction): string | null {
  if (state.isGameOver || state.stageClear || !world.active) return "지금은 행동할 수 없다.";
  if (interactionTypes.has(action.type)) return validateInteraction(world, state, action);
  if (action.type === "DEFOCUS") return ((world.player.focusEntityId === undefined ? world.player.near : world.player.focusEntityId) || world.player.manipulating) ? null : "이미 주변을 살피고 있다.";
  if (action.type === "LOOK") return null;
  if (action.type === "POSTURE") return action.posture ? null : "바꿀 자세가 정해지지 않았다.";
  if (action.type === "LEAVE") return world.player.zone === "office" || worldRooms(world)[world.player.zone]?.optionalEntry ? null : "먼저 탐색 입구로 돌아가야 한다.";
  if (action.type === "SURVEY") return illuminated(world, world.player.zone) ? null : "빛이 없어 안쪽을 살필 수 없다.";
  if (action.type === "MOVE" && action.target && worldRooms(world)[action.target]) {
    if (worldRooms(world)[action.target].outsideExploration) return "탐색을 마치고 바깥 구역으로 나가야 한다.";
    if (!adjacentZones(world.player.zone, world).includes(action.target)) return "그곳까지 바로 이어지는 길이 없다.";
    if (!pathOpen(world, world.player.zone, action.target)) return "닫힌 문이나 문 앞의 사물이 길을 막고 있다.";
    if (!worldRooms(world)[action.target].light && !carriesLight(world) && !illuminated(world, action.target) && !world.visitedZones.includes(action.target)) return "그 너머는 어두워 길을 확인할 수 없다. 가지고 갈 조명이 필요하다.";
    return null;
  }
  const entity = action.target ? world.entities[action.target] : undefined;
  if (!entity || !visibleEntities(world).some(e => e.id === entity.id)) return "지금은 그 대상을 확인할 수 없다.";
  if (action.type === "MOVE" || action.type === "FOCUS") return null;
  if (!canReach(world, entity)) return "먼저 손이 닿는 곳까지 다가가야 한다.";
  const c = entity.components;
  switch (action.type) {
    case "UNLOCK": return !c.openable?.locked ? "잠겨 있지 않다." : !hasDoorKey(world, state, entity) ? "이 잠금장치에 맞는 열쇠를 가지고 있지 않다." : null;
    case "OPEN": return !c.openable ? "열 수 있는 구조가 아니다." : c.openable.locked ? "잠겨 있어 열리지 않는다." : c.openable.isOpen ? "이미 열려 있다." : null;
    case "CLOSE": return c.structure?.integrity === 0 ? "구조가 부서져 다시 닫을 수 없다." : !c.openable?.isOpen ? "열려 있지 않다." : passageBlockers(world, entity.id).length ? "문 앞의 사물이 닫히는 길을 막고 있다." : null;
    case "USE_TOOL": return validateToolUse(world, state, action);
    case "REPAIR": return validateRepair(world, state, action);
    case "TAKE": return !c.portable || c.position.zone === "player" && inventoryRegistered(world, entity) ? "집어 들 수 있는 물건이 아니다." : !inventoryTreeAvailable(world, state, entity) ? "지금 지닌 수량이 부족하다." : null;
    case "HOLD": case "STOW": {
      if (!c.portable || c.position.zone !== "player") return "먼저 지니고 있는 물건이어야 한다.";
      if (!inventoryRegistered(world, entity)) return "먼저 확인한 물건을 챙겨야 한다.";
      if (c.portable.itemId && (state.inventory[c.portable.itemId] ?? 0) < c.portable.amount) return "지금 지닌 수량이 부족하다.";
      return action.type === "HOLD" ? handledEntityId(world) === entity.id ? "이미 그 물건을 다루고 있다." : null : !isHeld(world, entity.id) ? "이미 챙겨 둔 물건이다." : null;
    }
    case "LIGHT": return c.position.zone === "player" && !isHeld(world, entity.id) ? "조명을 먼저 손에 꺼내 들어야 한다." : !c.light ? "불을 켤 수 있는 물건이 아니다." : !c.light.on && c.light.fuelSeconds === 0 ? "조명의 에너지가 다해 켤 수 없다." : null;
    case "INSPECT": return null;
  }
  return "지원하지 않는 행동이다.";
}
export function resolveWorldActions(world: TextWorld, state: GameState, actions: WorldAction[], options: { advanceTime?: boolean } = {}) {
  let elapsedSeconds = 0;
  normalizeHands(world);
  for (const action of actions) {
    const handlingAttention = world.player.focusEntityId;
    let failure = validateWorldAction(world, state, action);
    if (!failure && (action.type === "USE_TOOL" || action.type === "REPAIR" && action.toolItemId)) {
      const tool = materializeTool(world, state, action.toolItemId!);
      if (!isHeld(world, tool.id)) {
        const preparation = resolveWorldActions(world, state, [{ type: "HOLD", target: tool.id }], options);
        elapsedSeconds += preparation.elapsedSeconds;
        if (preparation.interrupted) return { elapsedSeconds, interrupted: true, discovery: false };
      }
      failure = validateWorldAction(world, state, action);
    }
    if (!failure && (action.type === "TAKE" || action.type === "HOLD")) {
      const previous = heldInSlot(world, world.entities[action.target!]);
      if (previous && previous !== action.target) {
        const prepared = resolveWorldActions(world, state, [{ type: "STOW", target: previous }], options);
        elapsedSeconds += prepared.elapsedSeconds;
        if (prepared.interrupted) {
          recordEvent(world, { type: "STOPPED", targetId: action.target, attemptedAction: action.type, reason: "물건을 챙겨 둔 뒤에는 더 움직일 수 없다.", before: {}, after: {} });
          return { elapsedSeconds, interrupted: true, discovery: false };
        }
        failure = validateWorldAction(world, state, action);
      }
    }
    if (failure) {
      recordEvent(world, { type: "STOPPED", targetId: action.target, attemptedAction: action.type, reason: failure, before: {}, after: {} });
      if (action.target && world.entities[action.target]?.components.openable?.locked) {
        world.observations[action.target] ??= { stages: [], collected: false };
        world.observations[action.target].blocked = failure;
      }
      return { elapsedSeconds, interrupted: true, discovery: false };
    }
    synchronizeWorldActors(world, state);
    const visibleBefore = new Set(visibleEntities(world).map(e => e.id));
    const e = action.target ? world.entities[action.target] : undefined;
    const c = e?.components;
    const ownerNpcId = propertyOwner(world, e);
    let before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
    let actionSound: ReturnType<typeof applyToolUse>["sound"] | undefined;
    if (["MOVE", "FOCUS", "INSPECT", "DEFOCUS"].includes(action.type)) world.player.placementTargetId = null;
    switch (action.type) {
      case "REPAIR": {
        const repaired = applyRepair(world, state, action); before = repaired.before; after = repaired.after;
        const recipe = c!.structure!.repair!;
        if (recipe.sound) actionSound = { sourceId: e!.id, zone: rootZone(world, e!), ...recipe.sound, remainingSeconds: recipe.seconds + 12 };
        world.player.focusEntityId = e!.id; world.player.facing = e!.id; break;
      }
      case "PUSH": case "PUT": case "DROP": case "WAIT": case "HIDE": {
        const result = applyInteraction(world, state, action); before = result.before; after = result.after; break;
      }
      case "FOCUS": before = { focusEntityId: world.player.focusEntityId }; world.player.focusEntityId = e!.id; world.player.facing = e!.id; world.player.manipulating = false; after = { focusEntityId: e!.id, name: e!.name }; break;
      case "DEFOCUS": before = { focusEntityId: world.player.focusEntityId ?? world.player.near }; after = { focusEntityId: null, name: world.entities[String(before.focusEntityId)]?.name ?? world.entities[world.player.heldItemId ?? world.player.heldToolId ?? ""]?.name }; world.player.focusEntityId = null; world.player.manipulating = false; world.player.facing = "far-end"; break;
      case "LOOK": after = { recap: true }; break;
      case "INSPECT": {
        world.player.facing = e!.id; world.player.focusEntityId = e!.id; world.player.manipulating = false;
        world.observations[e!.id] ??= { stages: [], collected: false };
        const firstInspection = !world.observations[e!.id].inspected;
        world.observations[e!.id].inspected = true;
        after = { stage: "surface", name: e!.name, revealedIds: firstInspection ? Object.values(world.entities).filter(item => item.components.discovery?.inspectTargetId === e!.id).map(item => item.id) : [] };
        break;
      }
      case "UNLOCK": {
        before = { locked: true }; c!.openable!.locked = false;
        if (world.observations[e!.id]) delete world.observations[e!.id].blocked;
        after = { locked: false, name: e!.name, keyId: c!.openable!.keyId, keyName: world.entities[c!.openable!.keyId!]?.name };
        break;
      }
      case "USE_TOOL": {
        const result = applyToolUse(world, state, action); before = result.before; after = result.after; actionSound = result.sound;
        world.player.focusEntityId = e!.id; world.player.facing = e!.id; break;
      }
      case "SURVEY": {
        world.player.facing = "far-end";
        const id = "zone:" + world.player.zone;
        world.observations[id] ??= { stages: ["outline"], collected: false };
        if (!world.observations[id].stages.includes("surface")) world.observations[id].stages.push("surface");
        after = { zone: world.player.zone, stage: "surface" }; break;
      }
      case "POSTURE":
        before = { posture: world.player.posture }; world.player.posture = action.posture!; after = { posture: world.player.posture }; break;
      case "MOVE":
        before = { ...world.player };
        world.player.relation = "near"; world.player.coverId = null;
        if (action.target && worldRooms(world)[action.target]) {
          const from = world.player.zone;
          world.player.zone = action.target; world.player.focusEntityId = null; world.player.manipulating = false;
          world.player.near = portalBetween(world, from, action.target)?.id ?? null;
          const arrival = worldRooms(world)[action.target].arrivals?.[from];
          world.player.position = arrival?.position ?? "entrance";
          world.player.facing = arrival?.facing ?? "far-end";
        } else {
          world.player.near = e!.id; world.player.focusEntityId = e!.id; world.player.manipulating = false; world.player.position = e!.id === "door" && world.player.zone === "corridor" ? "office-end" : entityDetails(world, e!).anchor ?? e!.id; world.player.facing = e!.id;
        }
        after = { ...world.player, name: e?.name ?? worldRooms(world)[world.player.zone].name, placement: e ? entityDetails(world, e).placement : undefined, arrivalText: !e ? worldRooms(world)[world.player.zone].arrivals?.[String(before.zone)]?.text : undefined }; break;
      case "OPEN": case "CLOSE":
        before = { isOpen: c!.openable!.isOpen }; c!.openable!.isOpen = action.type === "OPEN";
        if (action.type === "OPEN" && c!.openable!.autoCloseSeconds !== undefined) c!.openable!.remainingOpenSeconds = c!.openable!.autoCloseSeconds;
        after = { isOpen: c!.openable!.isOpen, name: e!.name }; break;
      case "TAKE": {
        const parent = world.entities[c!.position.zone];
        before = { zone: c!.position.zone, relation: c!.position.relation, carried: carriedByPlayer(world, e!), inventoryRegistered: inventoryRegistered(world, e!) };
        if (parent?.components.container) parent.components.container.items = parent.components.container.items.filter(id => id !== e!.id);
        const item = c!.portable!;
        const transfer = transferInventoryOwnership(world, state, e!, { zone: "player" }, true);
        holdEntity(world, e!, handlingAttention);
        world.observations[e!.id] ??= { stages: ["outline", "surface"], collected: false };
        world.observations[e!.id].collected = true;
        if (parent?.components.container?.items.length === 0) {
          world.observations[parent.id] ??= { stages: ["outline", "surface", "interior"], collected: false };
          world.observations[parent.id].collected = true;
          if (parent.components.container.depletionBehavior === "disappear" && !Object.values(world.entities).some(entity => entity.components.position.zone === parent.id)) parent.components.position = { zone: "depleted" };
        }
        after = { zone: c!.position.zone, name: e!.name, amount: item.amount, itemId: item.itemId, held: true, ...transfer }; break;
      }
      case "HOLD":
        before = { held: isHeld(world, e!.id), zone: "player" };
        holdEntity(world, e!, handlingAttention);
        after = { held: true, zone: "player", name: e!.name }; break;
      case "STOW":
        before = { held: true, on: c!.light?.on, zone: "player" };
        releaseHand(world, e!.id);
        if (c!.light) c!.light.on = false;
        if (world.player.focusEntityId === e!.id) { world.player.focusEntityId = null; world.player.facing = "far-end"; }
        after = { held: false, stowed: true, on: c!.light?.on, zone: "player", name: e!.name }; break;
      case "LIGHT": before = { on: c!.light!.on }; c!.light!.on = !c!.light!.on; after = { on: c!.light!.on, name: e!.name }; break;
      case "LEAVE": before = { zone: world.player.zone }; world.active = false; after = { zone: worldRooms(world)[world.player.zone]?.optionalEntry ? state.location : "concourse", exitText: worldRooms(world)[world.player.zone]?.optionalEntry?.exitText }; break;
    }
    if (["HOLD", "TAKE"].includes(action.type) && e?.components.portable?.itemId && e.toolDurability !== undefined) state.toolDurability[e.components.portable.itemId] = e.toolDurability;
    const event = recordEvent(world, { type: action.type, targetId: action.target, before: { ...before, ...(ownerNpcId ? { ownerNpcId } : {}) }, after });
    if (action.type === "PUSH") emitMovementSound(world, action.target!, event.id);
    if (actionSound) {
      const soundEvent = recordEvent(world, { type: "SOUND", origin: "simulation", actorId: action.target, targetId: action.target, causedBy: event.id, witnessed: false, before: {}, after: {} });
      world.simulation!.sounds.push({ id: soundEvent.id!, ...actionSound });
    }
    for (const stimulus of [event, ...world.events.filter(e => e.type === "SOUND" && e.causedBy === event.id)]) observeWorldEvent(world, state, stimulus);
    const elapsed = options.advanceTime === false ? 0 : action.type === "WAIT" ? action.durationSeconds ?? 5 : action.type === "REPAIR" ? c!.structure!.repair!.seconds : action.type === "USE_TOOL" ? toolTechniques[action.technique!].seconds : seconds[action.type] + (action.type === "STOW" && before.on ? 1 : 0);
    if (elapsed) elapsedSeconds += advanceGameSeconds(state, elapsed, { actionWorld: world, causedBy: event.id });
    else advanceWorldSimulation(world, 0, event.id);
    if (state.isGameOver || state.stageClear) return { elapsedSeconds, interrupted: true, discovery: false };
    // Revealing an unopened interior is a decision boundary, even for a future longer plan.
    const discovery = (["INSPECT", "USE_TOOL"].includes(action.type) && Array.isArray(after.revealedIds) && after.revealedIds.length > 0) || ["OPEN", "LIGHT", "PUT", "DROP", "WAIT", "USE_TOOL"].includes(action.type) && visibleEntities(world).some(item => {
      const parent = world.entities[item.components.position.zone];
      return !visibleBefore.has(item.id) && parent?.components.container && !world.observations[parent.id]?.stages.includes("interior");
    });
    if (discovery) return { elapsedSeconds, interrupted: false, discovery: true };
  }
  return { elapsedSeconds, interrupted: false, discovery: false };
}
