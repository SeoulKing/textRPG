import type { GameState } from "../schemas";
import type { TextEntity, TextWorld } from "../schemas/text-world";
import { audibleSounds } from "./simulation";
import { recordEvent } from "./events";
import { illuminated, visibleEntities, pathOpen, portalBetween, worldRooms } from "./world";
import { currentCover, type CoverRelation, carriedByPlayer, passageBlockers, rootZone } from "./spatial";

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
  if(!world || !enemy)return {spatial:false,reachable:true,coverId:undefined as string|undefined,coverName:undefined as string|undefined,coverRelation:undefined as CoverRelation|undefined,counterPenalty:0};
  const cover=currentCover(world), protectedBy=cover?.entity;
  return {spatial:true,reachable:rootZone(world,enemy)===world.player.zone,coverId:protectedBy?.id,coverName:protectedBy?.name,coverRelation:cover?.relation,counterPenalty:protectedBy?30:0};
}
/** Concealment affects new visual information; known nearby danger still uses the cover combat rule. */
export function combatCanSeePlayer(world: TextWorld, enemy: TextEntity) {
  const cover=currentCover(world);
  return rootZone(world,enemy)===world.player.zone && illuminated(world,world.player.zone)
    && !cover;
}
function pursuitPath(world: TextWorld, from: string, to: string) {
  const queue=[[from]],seen=new Set<string>();
  while(queue.length){const path=queue.shift()!,at=path.at(-1)!;if(at===to)return path;if(seen.has(at))continue;seen.add(at);
    for(const next of worldRooms(world)[at]?.neighbors??[]){const portal=portalBetween(world,at,next);
      if(!seen.has(next)&&(!portal || !portal.components.openable?.locked && !passageBlockers(world,portal.id).length))queue.push([...path,next]);
    }
  }
  return null;
}
/** Perception selects a remembered destination. Movement/opening consumes one response, never also an attack. */
export function advanceCombatOpponent(state: GameState, before?: GameState) {
  const world=state.textWorld,enemy=combatOpponent(state);if(!world||!enemy)return false;
  const from=rootZone(world,enemy),awareness=enemy.components.combatant!.awareness??={lastKnownPlayerZone:from};
  const seesPlayer=combatCanSeePlayer(world,enemy),priorEnemy=before?.textWorld?.entities[enemy.id];
  const sawPlayerBefore=Boolean(before?.textWorld && priorEnemy && combatCanSeePlayer(before.textWorld,priorEnemy));
  const departure=world.events.find(e=>e.type==="MOVE" && e.before.zone===from && e.after.zone!==from);
  if(departure && (sawPlayerBefore || !before && illuminated(world,from) && !["behind","under"].includes(String(departure.before.relation))))awareness.lastKnownPlayerZone=String(departure.after.zone);
  const view:TextWorld={...world,player:{...world.player,zone:from,relation:"near",coverId:null,posture:"standing"}};
  const heard=new Set(audibleSounds(view).map(sound=>sound.id));
  const sequence=(id:string)=>Number(id.split(":").at(-1));
  const sound=(world.simulation?.sounds??[]).filter(sound=>heard.has(sound.id)&&sound.sourceId!==enemy.id&&sequence(sound.id)>(awareness.lastHeardSequence??-1)).sort((a,b)=>sequence(b.id)-sequence(a.id))[0];
  if(sound)awareness.lastHeardSequence=sequence(sound.id);
  if(seesPlayer){awareness.lastKnownPlayerZone=world.player.zone;delete awareness.investigation;}
  else if(sound && !(sawPlayerBefore && world.events.some(e=>e.type==="THROW")))awareness.investigation={zone:sound.zone,targetId:sound.sourceId};
  const investigation=awareness.investigation,to=investigation?.zone??awareness.lastKnownPlayerZone;
  if(!to)return false;
  const witnessed=visibleEntities(world).some(e=>e.id===enemy.id);
  if(from===to){
    if(!investigation)return false;
    const target=world.entities[investigation.targetId??""];
    enemy.components.position={zone:from,...(target && !carriedByPlayer(world,target)&&rootZone(world,target)===from?{relativeTo:target.id,relation:"beside" as const}:{})};
    if(enemy.details)enemy.details.placement=target && !carriedByPlayer(world,target)?target.name+" 옆":"소리가 난 자리";
    delete awareness.investigation;
    recordEvent(world,{type:"ACTOR_MOVE",origin:"simulation",witnessed,actorId:enemy.id,targetId:enemy.id,before:{zone:from},after:{zone:from,name:enemy.name,destination:target&&!carriedByPlayer(world,target)?target.name+"이 떨어진 자리":"이 공간",reason:"sound"}});
    return true;
  }
  const path=pursuitPath(world,from,to),next=path?.[1];if(!next)return false;
  const portal=portalBetween(world,from,next),door=portal?.components.openable;
  if(portal&&door&&!door.isOpen){
    door.isOpen=true;if(door.autoCloseSeconds!==undefined)door.remainingOpenSeconds=door.autoCloseSeconds;
    recordEvent(world,{type:"OPEN",origin:"simulation",witnessed:witnessed||visibleEntities(world).some(e=>e.id===portal.id),actorId:enemy.id,targetId:portal.id,before:{isOpen:false},after:{isOpen:true,name:portal.name,actorName:enemy.name}});
    return true;
  }
  enemy.components.position={zone:next};if(enemy.details)enemy.details.placement="이 공간의 통로 쪽";
  if(investigation&&next===to)delete awareness.investigation;
  recordEvent(world,{type:"ACTOR_MOVE",origin:"simulation",witnessed:witnessed||visibleEntities(world).some(e=>e.id===enemy.id),actorId:enemy.id,targetId:enemy.id,before:{zone:from},after:{zone:next,name:enemy.name,destination:worldRooms(world)[next].name,...(investigation?{reason:"sound"}:{})}});
  return true;
}
