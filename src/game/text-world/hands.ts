import type { TextEntity, TextWorld } from "../schemas/text-world";

/** Carried is ownership; held is a hand slot. Looking elsewhere does not drop either slot. */
export function isHeld(world: TextWorld, id: string) {
  return world.entities[id]?.components.position.zone === "player"
    && (world.player.heldItemId === id || world.player.heldToolId === id);
}

export function heldInSlot(world: TextWorld, entity: TextEntity) {
  if (isHeld(world, entity.id)) return null;
  // A replacement light goes into the free hand before the previous light is put away.
  // With both hands occupied, store the item in the other hand, keeping the working light.
  const id = entity.components.light && !world.player.heldToolId ? null : world.player.heldItemId;
  return id && isHeld(world, id) ? id : null;
}

function handlingReference(world: TextWorld) {
  const focused = world.player.focusEntityId;
  if (focused && [world.player.heldItemId, world.player.heldToolId].includes(focused)) return focused;
  // Old saves kept attention on the source container after picking up its contents.
  return world.player.heldItemId ?? world.player.heldToolId ?? null;
}

export function handledEntityId(world: TextWorld) {
  const id = handlingReference(world);
  return world.player.manipulating && id && isHeld(world, id) ? id : null;
}

export function holdEntity(world: TextWorld, entity: TextEntity, attention = world.player.focusEntityId) {
  const destination = world.entities[attention ?? ""];
  world.player.placementTargetId = destination && destination.id !== entity.id && (destination.components.container || destination.components.physical?.supportCapacity !== undefined) ? destination.id : null;
  if (!isHeld(world, entity.id)) {
    if (entity.components.light) {
      if (world.player.heldToolId) world.player.heldItemId = world.player.heldToolId;
      world.player.heldToolId = entity.id;
    } else world.player.heldItemId = entity.id;
  }
  world.player.focusEntityId = entity.id;
  world.player.facing = entity.id;
  world.player.manipulating = true;
}

export function releaseHand(world: TextWorld, id: string) {
  const wasHandled = world.player.manipulating && handlingReference(world) === id;
  if (world.player.heldItemId === id) world.player.heldItemId = null;
  if (world.player.heldToolId === id) world.player.heldToolId = null;
  if (wasHandled) { world.player.manipulating = false; world.player.placementTargetId = null; }
  const remaining = world.entities[world.player.heldItemId ?? ""];
  if (!world.player.heldToolId && remaining?.components.light && remaining.components.position.zone === "player") {
    world.player.heldToolId = remaining.id;
    world.player.heldItemId = null;
  }
}

/** Preserve ownership and progress while repairing legacy duplicate or consumed hand references. */
export function normalizeHands(world: TextWorld) {
  world.player.heldItemId ??= null;
  world.player.placementTargetId ??= null;
  const item = world.entities[world.player.heldItemId ?? ""];
  if (item?.components.light && item.components.position.zone === "player" && (!world.player.heldToolId || world.player.heldToolId === item.id)) {
    world.player.heldToolId ??= item.id;
    world.player.heldItemId = null;
  }
  for (const slot of ["heldItemId", "heldToolId"] as const) {
    const id = world.player[slot];
    if (id && (!world.entities[id]?.components.portable || world.entities[id].components.position.zone !== "player")) {
      releaseHand(world, id);
      if (world.player.focusEntityId === id) world.player.focusEntityId = null;
    }
  }
  if (!handledEntityId(world)) world.player.manipulating = false;
}
