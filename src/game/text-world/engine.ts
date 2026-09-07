import type { GameState } from "../schemas";
import type { TextWorld, WorldAction, WorldEvent } from "../schemas/text-world";
import { advanceGameSeconds } from "../rules";
import { adjacentZones, hasDoorKey, canReach, carriesLight, entityDetails, illuminated, pathOpen, worldRooms, visibleEntities, portalBetween } from "./world";

export function recordEvent(world: TextWorld, event: Omit<WorldEvent, "at">) {
  world.events.push({ ...event, at: world.elapsedSeconds });
  world.events = world.events.slice(-30);
}
const seconds: Record<WorldAction["type"], number> = { LOOK: 3, INSPECT: 5, MOVE: 5, POSTURE: 1, UNLOCK: 3, OPEN: 2, CLOSE: 2, TAKE: 3, LIGHT: 1, SURVEY: 5, LEAVE: 5 };
export function validateWorldAction(world: TextWorld, state: GameState, action: WorldAction): string | null {
  if (state.isGameOver || state.stageClear || !world.active) return "지금은 행동할 수 없다.";
  if (action.type === "LOOK") return null;
  if (action.type === "POSTURE") return action.posture ? null : "바꿀 자세가 정해지지 않았다.";
  if (action.type === "LEAVE") return world.player.zone === "office" ? null : "먼저 역무실로 돌아가야 한다.";
  if (action.type === "SURVEY") return illuminated(world, world.player.zone) ? null : "빛이 없어 안쪽을 살필 수 없다.";
  if (action.type === "MOVE" && action.target && worldRooms(world)[action.target]) {
    if (!adjacentZones(world.player.zone, world).includes(action.target)) return "그곳까지 바로 이어지는 길이 없다.";
    if (!pathOpen(world, world.player.zone, action.target)) return "닫힌 문이 길을 막고 있다.";
    if (!worldRooms(world)[action.target].light && !carriesLight(world) && !illuminated(world, action.target) && !world.visitedZones.includes(action.target)) return "그 너머는 어두워 길을 확인할 수 없다. 가지고 갈 조명이 필요하다.";
    return null;
  }
  const entity = action.target ? world.entities[action.target] : undefined;
  if (!entity || !visibleEntities(world).some(e => e.id === entity.id)) return "지금은 그 대상을 확인할 수 없다.";
  if (action.type === "MOVE") return null;
  if (!canReach(world, entity)) return "먼저 손이 닿는 곳까지 다가가야 한다.";
  const c = entity.components;
  switch (action.type) {
    case "UNLOCK": return !c.openable?.locked ? "잠겨 있지 않다." : !hasDoorKey(world, state, entity) ? "이 잠금장치에 맞는 열쇠를 가지고 있지 않다." : null;
    case "OPEN": return !c.openable ? "열 수 있는 구조가 아니다." : c.openable.locked ? "잠겨 있어 열리지 않는다." : c.openable.isOpen ? "이미 열려 있다." : null;
    case "CLOSE": return !c.openable?.isOpen ? "열려 있지 않다." : null;
    case "TAKE": return !c.portable || c.position.zone === "player" ? "집어 들 수 있는 물건이 아니다." : null;
    case "LIGHT": return c.light ? null : "불을 켤 수 있는 물건이 아니다.";
    case "INSPECT": return null;
  }
}
export function resolveWorldActions(world: TextWorld, state: GameState, actions: WorldAction[]) {
  let elapsedSeconds = 0;
  for (const action of actions) {
    const failure = validateWorldAction(world, state, action);
    if (failure) {
      recordEvent(world, { type: "STOPPED", targetId: action.target, attemptedAction: action.type, reason: failure, before: {}, after: {} });
      if (action.target && world.entities[action.target]?.components.openable?.locked) {
        world.observations[action.target] ??= { stages: [], collected: false };
        world.observations[action.target].blocked = failure;
      }
      return { elapsedSeconds, interrupted: true, discovery: false };
    }
    const e = action.target ? world.entities[action.target] : undefined;
    const c = e?.components;
    let before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
    switch (action.type) {
      case "LOOK": after = { recap: true }; break;
      case "INSPECT": {
        world.player.facing = e!.id;
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
        if (action.target && worldRooms(world)[action.target]) {
          const from = world.player.zone;
          world.player.zone = action.target;
          world.player.near = portalBetween(world, from, action.target)?.id ?? null;
          world.player.position = action.target === "office" ? "far-door" : action.target === "corridor" ? from === "office" ? "office-end" : "storage-end" : "entrance";
          world.player.facing = action.target === "office" ? "entrance" : action.target === "corridor" ? from === "office" ? "storage-end" : "office-end" : "far-wall";
        } else {
          world.player.near = e!.id; world.player.position = e!.id === "door" && world.player.zone === "corridor" ? "office-end" : entityDetails(world, e!).anchor ?? e!.id; world.player.facing = e!.id;
        }
        after = { ...world.player, name: e?.name ?? worldRooms(world)[world.player.zone].name, placement: e ? entityDetails(world, e).placement : undefined }; break;
      case "OPEN": case "CLOSE":
        before = { isOpen: c!.openable!.isOpen }; c!.openable!.isOpen = action.type === "OPEN";
        after = { isOpen: c!.openable!.isOpen, name: e!.name }; break;
      case "TAKE": {
        const parent = world.entities[c!.position.zone];
        before = { zone: c!.position.zone };
        if (parent?.components.container) parent.components.container.items = parent.components.container.items.filter(id => id !== e!.id);
        const item = c!.portable!;
        c!.position = { zone: item.itemId ? "collected" : "player" };
        if (item.itemId) state.inventory[item.itemId] = (state.inventory[item.itemId] ?? 0) + item.amount;
        else if (c!.light) world.player.heldToolId = e!.id;
        world.observations[e!.id] ??= { stages: ["outline", "surface"], collected: false };
        world.observations[e!.id].collected = true;
        if (parent?.components.container?.items.length === 0) {
          world.observations[parent.id] ??= { stages: ["outline", "surface", "interior"], collected: false };
          world.observations[parent.id].collected = true;
        }
        after = { zone: c!.position.zone, name: e!.name, amount: item.amount, itemId: item.itemId }; break;
      }
      case "LIGHT": before = { on: c!.light!.on }; c!.light!.on = !c!.light!.on; after = { on: c!.light!.on, name: e!.name }; break;
      case "LEAVE": before = { zone: world.player.zone }; world.active = false; after = { zone: "concourse" }; break;
    }
    recordEvent(world, { type: action.type, targetId: action.target, before, after });
    const elapsed = seconds[action.type]; world.elapsedSeconds += elapsed; elapsedSeconds += elapsed; advanceGameSeconds(state, elapsed);
    if (state.isGameOver || state.stageClear) return { elapsedSeconds, interrupted: true, discovery: false };
    // Revealing an unopened interior is a decision boundary, even for a future longer plan.
    const discovery = (action.type === "INSPECT" && Array.isArray(after.revealedIds) && after.revealedIds.length > 0) || (action.type === "OPEN" || action.type === "LIGHT") && visibleEntities(world).some(item => {
      const parent = world.entities[item.components.position.zone];
      return parent?.components.container && !world.observations[parent.id]?.stages.includes("interior");
    });
    if (discovery) return { elapsedSeconds, interrupted: false, discovery: true };
  }
  return { elapsedSeconds, interrupted: false, discovery: false };
}
