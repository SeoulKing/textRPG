import type { GameState } from "../schemas";
import type { TextEntity, TextWorld } from "../schemas/text-world";
import { recordEvent } from "./events";
import { pathOpen, portalBetween, worldRooms } from "./world";
import { canProvideCover, passageBlockers, rootZone } from "./spatial";

export function hostileEntities(world: TextWorld) {
  return Object.values(world.entities).filter(e=>e.components.combatant?.hostile && e.components.combatant.hp>0);
}
export function combatOpponent(state: GameState): TextEntity | undefined {
  const world=state.textWorld,encounter=state.subwayExpedition.currentFloorProgress.encounter;
  return world?.active && state.subwayExpedition.spatialMode && encounter ? Object.values(world.entities).find(e=>e.components.combatant?.encounterId===encounter.id && e.components.combatant.hostile) : undefined;
}
export function openWorldPath(world: TextWorld, from: string, to: string): string[] | null {
  const queue=[[from]],seen=new Set<string>();
  while(queue.length){const path=queue.shift()!,at=path.at(-1)!;if(at===to)return path;if(seen.has(at))continue;seen.add(at);
    for(const next of worldRooms(world)[at]?.neighbors??[])if(!seen.has(next)&&pathOpen(world,at,next))queue.push([...path,next]);
  }
  return null;
}
/** Cover and reach derive from current physical objects, never a generated success label. */
export function combatGeometry(state: GameState) {
  const world=state.textWorld,enemy=combatOpponent(state);
  if(!world || !enemy)return {spatial:false,reachable:true,coverId:undefined as string|undefined,coverName:undefined as string|undefined,counterPenalty:0};
  const cover=world.entities[world.player.coverId??""];
  const protectedBy=world.player.relation==="behind" && world.player.posture==="crouching" && cover && canProvideCover(world,cover) ? cover : undefined;
  return {spatial:true,reachable:rootZone(world,enemy)===world.player.zone,coverId:protectedBy?.id,coverName:protectedBy?.name,counterPenalty:protectedBy?30:0};
}
/** Moving or opening a door consumes this opponent's response; it cannot also strike through it. */
export function advanceCombatOpponent(state: GameState) {
  const world=state.textWorld,enemy=combatOpponent(state);if(!world||!enemy)return false;
  const from=rootZone(world,enemy),to=world.player.zone;if(from===to)return false;
  const path=openWorldPath(world,from,to);
  if(path?.[1]) {
    enemy.components.position={zone:path[1]};
    if(enemy.details)enemy.details.placement="이 공간의 통로 쪽";
    recordEvent(world,{type:"ACTOR_MOVE",origin:"simulation",witnessed:path[1]===to,actorId:enemy.id,targetId:enemy.id,before:{zone:from},after:{zone:path[1],name:enemy.name,destination:worldRooms(world)[path[1]].name}});
    return true;
  }
  const portal=portalBetween(world,from,to),door=portal?.components.openable;
  if(portal&&door&&!door.isOpen&&!door.locked&&!passageBlockers(world,portal.id).length){
    door.isOpen=true;
    if(door.autoCloseSeconds!==undefined)door.remainingOpenSeconds=door.autoCloseSeconds;
    recordEvent(world,{type:"OPEN",origin:"simulation",actorId:enemy.id,targetId:portal.id,before:{isOpen:false},after:{isOpen:true,name:portal.name,actorName:enemy.name}});
    return true;
  }
  return false;
}
