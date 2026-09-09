import { CommandSchema, type Command, type Observation, type Outcome, type World } from "./model";
import { accessNode, children, reachable, relocate } from "./world";
import { observe, rememberObservation } from "./observe";
import { render, signature } from "./render";

export class InvalidCommand extends Error {}
export const manipulationSeconds = { take: 2, open: 2, close: 2, unlock: 3 };
export function matchingKey(world: World, targetId: string) {
  const entity = world.entities.get(targetId)!;
  return children(world, world.player.inventoryId).some(e => e.quantity > 0 && e.definitionId === entity.keyDefinitionId);
}
export function validateCommand(world: World, command: Command, observation: Observation): Outcome {
  const invalid = (message: string): never => { throw new InvalidCommand(message); };
  if (command.type === "look" || command.type === "defocus") return { type: command.type, seconds: 0 };
  if (command.type === "move") {
    const exit = observation.facts.find(f => f.kind === "exit" && f.targetId === command.targetId);
    if (!exit) return invalid("지금 관측한 출구가 아닙니다.");
    const cost = reachable(world).get(command.targetId);
    if (cost === undefined) return invalid("이동 경로가 막혀 있습니다.");
    return { type: "move", targetId: command.targetId, name: exit.name, seconds: cost };
  }
  const entity = world.entities.get(command.targetId);
  const fact = observation.facts.find(f => f.kind === "object" && f.targetId === command.targetId);
  if (!entity || !fact) return invalid("현재 관측할 수 없는 대상입니다.");
  const definition = world.definitions.get(entity.definitionId)!;
  if (command.type === "approach") {
    const cost = reachable(world).get(accessNode(world, entity));
    if (cost === undefined) return invalid("접근 경로가 막혀 있습니다.");
    return { type: command.type, targetId: entity.id, name: fact.name, seconds: cost };
  }
  if (!fact.near || fact.status === "dark") return invalid("대상을 가까이에서 확인해야 합니다.");
  if (command.type === "take") {
    if (!definition.portable || entity.quantity <= 0 || world.placements.get(entity.id)!.parentId === world.player.inventoryId) return invalid("챙길 수 없는 대상입니다.");
    return { type: command.type, targetId: entity.id, name: definition.name, quantity: entity.quantity, unit: definition.unit, seconds: manipulationSeconds.take };
  }
  if (!definition.openable) return invalid("열고 닫을 수 없는 대상입니다.");
  if (command.type === "open" && entity.open || command.type === "close" && !entity.open || command.type === "unlock" && !entity.locked) return invalid("이미 상태가 바뀐 대상입니다.");
  if (command.type === "unlock" && !matchingKey(world, entity.id)) return invalid("맞는 열쇠를 소지하고 있지 않습니다.");
  return { type: command.type, targetId: entity.id, name: fact.name,
    failed: command.type === "open" && entity.locked ? "locked" : undefined, seconds: manipulationSeconds[command.type] };
}

/** Validation precedes every write. Only the target, event queue and current-room memory are touched. */
export function execute(world: World, raw: unknown, revision: number) {
  if (!Number.isSafeInteger(revision) || revision !== world.revision) throw new InvalidCommand("상황이 바뀌었습니다. 현재 선택지를 다시 확인해 주세요.");
  const parsed = CommandSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidCommand("올바른 구조화 명령이 아닙니다.");
  const command = parsed.data;
  const before = observe(world);
  const outcome = validateCommand(world, command, before);
  if (command.type === "move") { world.player.nodeId = command.targetId; world.player.focusId = null; }
  else if (command.type === "approach") { world.player.nodeId = accessNode(world, world.entities.get(command.targetId)!); world.player.focusId = command.targetId; }
  else if (command.type === "defocus") world.player.focusId = null;
  else if (command.type !== "look") {
    const entity = world.entities.get(command.targetId)!;
    if (command.type === "take") {
      const parent = world.placements.get(entity.id)!.parentId;
      relocate(world, { entityId: entity.id, parentId: world.player.inventoryId, relation: "in" });
      world.player.focusId = world.entities.has(parent) ? parent : null;
    } else {
      world.player.focusId = entity.id;
      if (command.type === "open" && !outcome.failed) entity.open = true;
      if (command.type === "close") entity.open = false;
      if (command.type === "unlock") entity.locked = false;
    }
  }
  world.elapsedSeconds += outcome.seconds;
  world.revision++;
  // Events are sorted on load; process only the due prefix. No wall-clock timer exists.
  if (outcome.seconds > 0) while (world.events[0]?.at <= world.elapsedSeconds) {
    const event = world.events.shift()!;
    if (event.type === "light") world.rooms.get(event.roomId)!.lit = event.lit;
    else world.entities.get(event.targetId)!.open = false;
  }
  const observation = observe(world);
  if (outcome.failed === "locked" || command.type === "unlock") {
    const fact = { id: "lock:" + outcome.targetId, kind: "lock" as const, targetId: outcome.targetId!, name: outcome.name!, locked: Boolean(outcome.failed) };
    world.memory.set(fact.id, { fact, observedAt: world.elapsedSeconds, revision: world.revision });
  }
  const rendered = render(observation, outcome, world.narrated);
  world.lastParagraphs = rendered.paragraphs;
  rememberObservation(world, observation);
  for (const fact of rendered.selected) world.narrated.set(fact.id, signature(fact));
  return { outcome, observation };
}
export function enterWorld(world: World) {
  const observation = observe(world);
  const rendered = render(observation, { type: "enter", seconds: 0 }, world.narrated);
  world.lastParagraphs = rendered.paragraphs;
  rememberObservation(world, observation);
  for (const fact of rendered.selected) world.narrated.set(fact.id, signature(fact));
  return observation;
}
