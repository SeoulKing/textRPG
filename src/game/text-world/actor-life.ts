import type { ContentRegistry, GameState, ItemCard } from "../schemas";
import { ActorLifeSchema, type ActorLife } from "../schemas/actor";
import type { TextEntity, TextWorld, WorldEvent } from "../schemas/text-world";
import { NpcConversationMemorySchema } from "../schemas/npc-dialogue";
import { GAME_MINUTE_MS } from "../base-data";
import { runtimeSocialProfile, socialMemory } from "../npc-social";
import { recordEvent } from "./events";
import { ancestors, carriedByPlayer, passageBlockers, relocateEntity, rootZone } from "./spatial";
import { canReach, particle, portalBetween, visibleEntities, worldRooms } from "./world";

export type ActorTimeContext = { state: GameState; registry: ContentRegistry; clockOffsetMs: number; witnessed: boolean; causedBy?: string };
export function initializeActorLife(actor: TextEntity) {
  const c = actor.components.actor;
  if (c?.routine && !c.life) c.life = ActorLifeSchema.parse({ hunger: c.routine.initialHunger, fatigue: c.routine.initialFatigue, remainingSeconds: c.routine.decisionSeconds });
  return c?.life;
}
export function autonomousActors(world: TextWorld) {
  return Object.values(world.entities).filter(e => e.components.actor?.routine && e.components.actor.active !== false && !e.components.combatant).sort((a,b)=>a.id.localeCompare(b.id));
}
export function nextActorBoundary(world: TextWorld, context: ActorTimeContext) {
  return autonomousActors(world).map(actor => {
    const life=initializeActorLife(actor)!;
    const released=life.mode==="INTERACT" && context.state.npcDialogue.active?.npcId!==actor.components.actor!.npcId && !(context.witnessed && world.player.zone===rootZone(world,actor) && world.player.near===actor.id);
    const threats=currentThreats(world,actor), fresh=threats.some(e=>!life.threats.some(t=>t.zone===rootZone(world,e)&&t.until>world.elapsedSeconds));
    const engaged=context.state.npcDialogue.active?.npcId===actor.components.actor!.npcId && life.mode!=="INTERACT" && !threats.length && context.witnessed && world.player.zone===rootZone(world,actor) && world.player.near===actor.id;
    return released || fresh || engaged ? 1 : life.remainingSeconds || 1;
  });
}
function currentThreats(world:TextWorld,actor:TextEntity) { return visibleEntities(actorView(world,actor)).filter(e=>e.components.combatant?.hostile && e.components.combatant.hp>0); }
function actorView(world: TextWorld, actor: TextEntity): TextWorld {
  const life=initializeActorLife(actor)!;
  return {...world, player:{...world.player,zone:rootZone(world,actor),near:actor.components.position.relativeTo??null,position:actor.id,facing:null,relation:"near",coverId:null,posture:"standing",heldToolId:null,heldItemId:null},
    observations:Object.fromEntries(life.inspected.map(id=>[id,{stages:["outline","surface","interior"] as ("outline"|"surface"|"interior")[],inspected:true,collected:false}]))};
}
export function actorActivity(actor: TextEntity) {
  const mode=actor.components.actor?.life?.mode;
  return mode === "SEARCH_FOOD" ? "주변을 살피고 있다." : mode === "ESCAPE" ? "물러날 통로를 살피고 있다." : mode === "INTERACT" ? "가까운 거리에서 마주 보고 있다." : "자리에 머물며 쉬고 있다.";
}
function emit(world:TextWorld, actor:TextEntity, context:ActorTimeContext, event:Omit<WorldEvent,"at">, summary:string) {
  const seen=context.witnessed && visibleEntities(world).some(e=>e.id===actor.id);
  const seenDoor = event.type==="OPEN" && context.witnessed && visibleEntities(world).some(e=>e.id===event.targetId);
  if(event.type==="OPEN") event={...event,after:{...event.after,actorKnown:seen,actorName:seen?actor.name:undefined}};
  const recorded=recordEvent(world,{...event,origin:"simulation",actorId:actor.id,causedBy:context.causedBy,witnessed:event.witnessed??(seen||seenDoor)});
  const npcId=actor.components.actor!.npcId;
  const memory=NpcConversationMemorySchema.parse(context.state.npcDialogue.conversations[npcId]??{});
  memory.observations=[...memory.observations,{id:"self:"+actor.id+":"+recorded.id,worldId:worldRooms(world)[rootZone(world,actor)]?.locationId??context.state.location,sequence:Number(recorded.id!.split(":").at(-1)),
    atMs:Math.max(0,Math.round(context.clockOffsetMs+world.elapsedSeconds*GAME_MINUTE_MS/60)),sense:"self" as const,eventType:event.type,actorKnown:true,actorId:npcId,summary}].slice(-24);
  context.state.npcDialogue.conversations[npcId]=memory;
}
function setMode(world:TextWorld,actor:TextEntity,context:ActorTimeContext,mode:ActorLife["mode"]) {
  const life=initializeActorLife(actor)!;
  if(life.mode===mode)return;
  const before=life.mode;life.mode=mode;life.fatigueClock=0;
  emit(world,actor,context,{type:"ACTOR_ACTIVITY",targetId:actor.id,before:{mode:before},after:{name:actor.name,mode,detail:actorActivity(actor)}},actor.name+"의 현재 행동: "+actorActivity(actor));
}
/** Only real, traversable edges are used. A closed unlocked door costs its own action. */
function route(world:TextWorld,actor:TextEntity,destination:string,avoid=new Set(actor.components.actor?.life?.threats.filter(t=>t.until>world.elapsedSeconds).map(t=>t.zone))) {
  const from=rootZone(world,actor),allowed=new Set(actor.components.actor!.routine!.roamZones),queue=[[from]],seen=new Set<string>();
  while(queue.length){const path=queue.shift()!,zone=path.at(-1)!;if(zone===destination)return path;if(seen.has(zone))continue;seen.add(zone);
    for(const next of worldRooms(world)[zone]?.neighbors??[]){if(!allowed.has(next)||avoid.has(next)||seen.has(next))continue;const door=portalBetween(world,zone,next);
      if(door && (passageBlockers(world,door.id).length || door.components.openable?.locked))continue;queue.push([...path,next]);}
  }
  return null;
}
function walk(world:TextWorld,actor:TextEntity,destination:string,context:ActorTimeContext,avoid?:Set<string>) {
  const life=initializeActorLife(actor)!,from=rootZone(world,actor),path=route(world,actor,destination,avoid),next=path?.[1];
  if(!next)return false;
  const door=portalBetween(world,from,next);
  if(door?.components.openable?.isOpen===false){
    if(actor.components.position.relativeTo!==door.id){relocateEntity(world,actor,{zone:from,relativeTo:door.id,relation:"beside"});emit(world,actor,context,{type:"ACTOR_MOVE",targetId:actor.id,before:{zone:from},after:{zone:from,name:actor.name,destination:door.name+" 옆",reason:life.mode.toLowerCase()}},particle(actor.name,"이","가")+" 문 가까이 다가갔다.");life.remainingSeconds=5;return true;}
    door.components.openable.isOpen=true;if(door.components.openable.autoCloseSeconds!==undefined)door.components.openable.remainingOpenSeconds=door.components.openable.autoCloseSeconds;
    emit(world,actor,context,{type:"OPEN",targetId:door.id,before:{isOpen:false},after:{isOpen:true,name:door.name,actorName:actor.name}},particle(actor.name,"이","가")+" "+particle(door.name,"을","를")+" 열었다.");life.remainingSeconds=2;return true;}
  const beforeVisible=context.witnessed && visibleEntities(world).some(e=>e.id===actor.id);
  relocateEntity(world,actor,{zone:next});
  const witnessed=beforeVisible || context.witnessed && visibleEntities(world).some(e=>e.id===actor.id);
  emit(world,actor,context,{type:"ACTOR_MOVE",targetId:actor.id,witnessed,before:{zone:from},after:{zone:next,name:actor.name,destination:worldRooms(world)[next].name,reason:life.mode.toLowerCase()}},particle(actor.name,"이","가")+" "+worldRooms(world)[next].name+"로 이동했다.");
  life.remainingSeconds=5;return true;
}
function authorizedSource(world:TextWorld,actor:TextEntity,item:TextEntity,registry:ContentRegistry) {
  const tree=[item,...ancestors(world,item)];
  return !carriedByPlayer(world,item) && !tree.some(e=>e.inventoryRegistered || registry.locations[worldRooms(world)[rootZone(world,e)]?.locationId]?.stockNodes.some(n=>n.id===e.id) || e.components.stockNode || e.components.actor && e.components.actor.npcId!==actor.components.actor!.npcId || e.components.ownership && e.components.ownership.npcId!==actor.components.actor!.npcId);
}
function eat(world:TextWorld,actor:TextEntity,context:ActorTimeContext):boolean {
  const c=actor.components.actor!,routine=c.routine!,life=c.life!,profile=runtimeSocialProfile(c.npcId,context.registry);
  const memory=profile?socialMemory(context.state,profile):undefined;
  const personal=routine.foodItemIds.find(id=>(memory?.inventory[id]??0)>0);
  const view=actorView(world,actor);
  const ground=visibleEntities(view).filter(e=>e.components.portable && routine.foodItemIds.includes(e.components.portable.itemId??"") && authorizedSource(world,actor,e,context.registry)).sort((a,b)=>a.id.localeCompare(b.id))[0];
  const itemId=personal??ground?.components.portable?.itemId;if(!itemId)return false;
  if(!personal && !canReach(view,ground!)){
    setMode(world,actor,context,"SEARCH_FOOD");
    const zone=rootZone(world,actor);relocateEntity(world,actor,{zone,relativeTo:ground!.id,relation:"beside"});
    emit(world,actor,context,{type:"ACTOR_MOVE",targetId:actor.id,before:{zone},after:{zone,name:actor.name,destination:ground!.name+" 옆",reason:"search_food"}},particle(actor.name,"이","가")+" 식량 가까이 다가갔다.");life.remainingSeconds=5;return true;
  }
  if(personal){memory!.inventory[personal]--;memory!.inventoryInitialized=true;context.state.npcDialogue.conversations[c.npcId]=memory!;}
  else {const portable=ground!.components.portable!;if(portable.amount>1)portable.amount--;else {relocateEntity(world,ground!,{zone:"consumed"});for(const other of Object.values(world.entities))if(other.components.actor && other.components.position.relativeTo===ground!.id)relocateEntity(world,other,{zone:rootZone(world,other)});}}
  const name=(context.registry.items[itemId] as ItemCard | undefined)?.name??ground?.name??itemId;
  const hungerBefore=life.hunger;life.hunger=Math.max(0,life.hunger-routine.mealRelief);life.searched=[];life.remainingSeconds=5;
  emit(world,actor,context,{type:"NPC_CONSUME",targetId:actor.id,before:{hunger:hungerBefore},after:{name:actor.name,itemId,itemName:name,amount:1,sourceId:personal?undefined:ground!.id}},particle(actor.name,"이","가")+" "+name+" 1개를 먹었다.");
  setMode(world,actor,context,"REST");
  return true;
}
function forage(world:TextWorld,actor:TextEntity,context:ActorTimeContext) {
  const c=actor.components.actor!,life=c.life!,zone=rootZone(world,actor),view=actorView(world,actor);
  if(eat(world,actor,context))return;
  setMode(world,actor,context,"SEARCH_FOOD");
  const target=visibleEntities(view).filter(e=>e.components.container && !e.components.actor && authorizedSource(world,actor,e,context.registry) && !life.searched.includes(e.id)).sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(target){
    if(actor.components.position.relativeTo!==target.id){relocateEntity(world,actor,{zone,relativeTo:target.id,relation:"beside"});emit(world,actor,context,{type:"ACTOR_MOVE",targetId:actor.id,before:{zone},after:{zone,name:actor.name,destination:target.name+" 옆",reason:"search_food"}},particle(actor.name,"이","가")+" "+target.name+" 옆으로 다가갔다.");life.remainingSeconds=5;return;}
    const openable=target.components.openable;
    if(openable && !openable.isOpen && !openable.locked){openable.isOpen=true;if(openable.autoCloseSeconds!==undefined)openable.remainingOpenSeconds=openable.autoCloseSeconds;
      emit(world,actor,context,{type:"OPEN",targetId:target.id,before:{isOpen:false},after:{isOpen:true,name:target.name,actorName:actor.name}},particle(actor.name,"이","가")+" "+particle(target.name,"을","를")+" 열었다.");life.remainingSeconds=2;return;}
    life.searched.push(target.id);if(!openable?.locked && !life.inspected.includes(target.id))life.inspected.push(target.id);
    const detail=openable?.locked ? target.name+"의 잠금장치를 확인한다." : target.name+" 안쪽을 살핀다.";
    emit(world,actor,context,{type:"ACTOR_ACTIVITY",targetId:actor.id,before:{},after:{name:actor.name,mode:life.mode,detail}},particle(actor.name,"이","가")+" "+detail);life.remainingSeconds=5;return;
  }
  if(!life.searched.includes("zone:"+zone))life.searched.push("zone:"+zone);
  const next=c.routine!.roamZones.find(id=>!life.searched.includes("zone:"+id)&&route(world,actor,id));
  if(next && walk(world,actor,next,context))return;
  life.retryAt=world.elapsedSeconds+1200;life.searched=[];setMode(world,actor,context,"REST");
}
export function advanceActorLife(world:TextWorld,seconds:number,context:ActorTimeContext) {
  for(const actor of autonomousActors(world)){
    const c=actor.components.actor!,routine=c.routine!,life=initializeActorLife(actor)!;
    const hunger=life.hungerClock+seconds;life.hunger=Math.min(100,life.hunger+Math.floor(hunger/routine.hungerIntervalSeconds));life.hungerClock=hunger%routine.hungerIntervalSeconds;
    const fatigue=life.fatigueClock+seconds,interval=life.mode==="REST"?300:600;life.fatigue=Math.max(0,Math.min(100,life.fatigue+Math.floor(fatigue/interval)*(life.mode==="REST"?-1:1)));life.fatigueClock=fatigue%interval;
    const playerNear=context.witnessed && world.player.zone===rootZone(world,actor) && world.player.near===actor.id;
    if(life.mode==="INTERACT" && !playerNear && context.state.npcDialogue.active?.npcId!==c.npcId)life.remainingSeconds=0;
    const threats=currentThreats(world,actor);
    if(playerNear && !threats.length && context.state.npcDialogue.active?.npcId===c.npcId && life.mode!=="INTERACT")life.remainingSeconds=0;
    if(threats.some(e=>!life.threats.some(t=>t.zone===rootZone(world,e)&&t.until>world.elapsedSeconds)))life.remainingSeconds=0;
    life.remainingSeconds=Math.max(0,life.remainingSeconds-seconds);if(life.remainingSeconds>0)continue;life.remainingSeconds=routine.decisionSeconds;
    life.threats=life.threats.filter(t=>t.until>world.elapsedSeconds);
    for(const enemy of threats){const zone=rootZone(world,enemy);life.threats=life.threats.filter(t=>t.zone!==zone);life.threats.push({zone,until:world.elapsedSeconds+300});}
    if(threats.length){setMode(world,actor,context,"ESCAPE");const danger=new Set(life.threats.map(t=>t.zone));
      const destinations=[routine.homeZone,...routine.roamZones].filter(id=>!danger.has(id));const target=destinations.find(id=>route(world,actor,id,danger));if(target)walk(world,actor,target,context,danger);continue;}
    // Conversation reserves attention only while the participant is safe.
    if(context.state.npcDialogue.active?.npcId===c.npcId){setMode(world,actor,context,"INTERACT");continue;}
    if(playerNear){setMode(world,actor,context,"INTERACT");continue;}
    if(life.fatigue<70 && life.hunger>=60 && world.elapsedSeconds>=life.retryAt){forage(world,actor,context);continue;}
    setMode(world,actor,context,"REST");if(rootZone(world,actor)!==routine.homeZone)walk(world,actor,routine.homeZone,context);
  }
}
