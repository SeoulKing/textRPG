import { baseItems } from "../data/items";
import { buildRuntimeRegistry } from "../runtime-registry";
import type { GameState, ItemCard } from "../schemas";
import type { TextEntity, TextWorld, WorldAction } from "../schemas/text-world";
import { isHeld, releaseHand } from "./hands";
import { inventoryRegistered, inventoryTreeAvailable, transferInventoryOwnership } from "./inventory-state";
import { carriedByPlayer, childrenOf, rootZone } from "./spatial";
import { pathOpen, portalBetween, visibleEntities, worldRooms } from "./world";

export function throwProfile(state: GameState, entity: TextEntity) {
  const id = entity.components.portable?.itemId;
  const item = id ? buildRuntimeRegistry(state).items[id] as ItemCard | undefined : undefined;
  return entity.components.throwable ?? item?.throwable ?? (id ? baseItems[id as keyof typeof baseItems]?.throwable : undefined);
}
export function throwLanding(world: TextWorld, destination: string | undefined) {
  if (!destination) return;
  const rooms=worldRooms(world), room=rooms[destination], visible=visibleEntities(world);
  if (room && !room.outsideExploration) {
    if (destination !== world.player.zone) {
      const portal=portalBetween(world,world.player.zone,destination);
      if (!rooms[world.player.zone].neighbors.includes(destination) || !portal || !visible.some(e=>e.id===portal.id) || !pathOpen(world,world.player.zone,destination)) return;
    }
    return {zone:destination, name:room.name.split(" · ").at(-1)+" 바닥"};
  }
  const target=world.entities[destination];
  if (target && visible.some(e=>e.id===destination) && !carriedByPlayer(world,target) && rootZone(world,target)===world.player.zone && !target.components.combatant && !target.components.actor)
    return {zone:world.player.zone, relativeTo:target.id, relation:"beside" as const, name:target.name+" 옆 바닥"};
}
export function validateThrow(world: TextWorld, state: GameState, action: WorldAction): string | null {
  const source=world.entities[action.target??""];
  if (!source?.components.portable || source.components.position.zone!=="player" || !isHeld(world,source.id) || !inventoryRegistered(world,source)) return "던질 물건을 실제로 지니고 손에 들어야 한다.";
  if (!inventoryTreeAvailable(world,state,source)) return "지금 지닌 수량이 부족하다.";
  const profile=throwProfile(state,source);
  if (!profile || Math.max(profile.unitMass, (source.components.physical?.mass ?? 0) / source.components.portable.amount)>2 || childrenOf(world,source.id).length || source.components.container && source.components.portable.amount>1) return "지금은 그 물건을 안전하게 던질 수 없다.";
  if (action.destination===source.id || !throwLanding(world,action.destination)) return "막히지 않은 통로와 확인할 수 있는 착지 지점이 필요하다.";
  return null;
}
/** One projectile, one physical identity and one ownership transfer; throwing is not an attack roll. */
export function applyThrow(world: TextWorld, state: GameState, action: WorldAction) {
  const source=world.entities[action.target!]!, profile=throwProfile(state,source)!, landing=throwLanding(world,action.destination)!;
  const before={zone:source.components.position.zone,launchZone:world.player.zone,amount:source.components.portable!.amount};
  let projectile=source;
  if (source.components.portable!.amount>1) {
    let id=source.id+":throw:"+(world.simulation?.nextEventId??0),suffix=0;
    while(world.entities[id])id=source.id+":throw:"+(world.simulation?.nextEventId??0)+":"+(++suffix);
    projectile=structuredClone(source);projectile.id=id;projectile.components.portable!.amount=1;
    projectile.origin={worldId:worldRooms(world)[world.player.zone].locationId,entityId:id};
    source.components.portable!.amount--;world.entities[id]=projectile;
  }
  delete projectile.components.discovery;
  const {name:destinationName,...position}=landing;
  const transfer=transferInventoryOwnership(world,state,projectile,position);
  if(projectile===source)releaseHand(world,source.id);
  if(projectile.details) {projectile.details.anchor=landing.relativeTo??landing.zone;projectile.details.placement=destinationName;}
  world.observations[projectile.id]={stages:["outline","surface"],collected:false};
  return {before,after:{name:source.name,amount:1,itemId:projectile.components.portable!.itemId,projectileId:projectile.id,zone:landing.zone,destinationName,soundDescription:profile.sound.description,...transfer},
    sound:{sourceId:projectile.id,zone:landing.zone,...profile.sound,remainingSeconds:15}};
}
