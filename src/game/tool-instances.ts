import type { GameState } from "./schemas";
import type { TextEntity, TextWorld } from "./schemas/text-world";
import { carriedByPlayer, relocateEntity } from "./text-world/spatial";

export function toolInstances(state: GameState, itemId: string) {
  const worlds = [state.textWorld, ...Object.values(state.locationTextWorlds)].filter((world): world is TextWorld => Boolean(world));
  return worlds.flatMap(world => Object.values(world.entities).filter(entity => entity.inventoryRegistered && entity.components.portable?.itemId === itemId && carriedByPlayer(world, entity)).map(entity=>({world,entity})))
    .sort((a,b)=> Number(b.world.player.heldItemId === b.entity.id) - Number(a.world.player.heldItemId === a.entity.id) || (a.entity.toolDurability ?? Infinity) - (b.entity.toolDurability ?? Infinity) || a.entity.id.localeCompare(b.entity.id));
}
/** Materialize newly crafted tools separately from older, stored or already carried tools. */
export function setToolInstanceDurability(state: GameState, itemId: string, value: number, name: string) {
  const existing = toolInstances(state, itemId);
  for (const {entity} of existing) entity.toolDurability ??= state.toolDurability[itemId] ?? value;
  const missing = (state.inventory[itemId] ?? 0) - existing.filter(({entity})=>!entity.expeditionLoot).reduce((n,{entity})=>n+entity.components.portable!.amount,0);
  const world = state.location === "subway" ? state.textWorld : state.locationTextWorlds[state.location];
  if (missing > 0 && world) {
    for (let i=0;i<missing;i++) {
      let sequence=0,id="crafted-tool:"+itemId+":"+state.activityRevision+":"+i;
      while(world.entities[id])id="crafted-tool:"+itemId+":"+state.activityRevision+":"+i+":"+(++sequence);
      const entity: TextEntity = {id,name,description:name,inventoryRegistered:true,toolDurability:value,components:{position:{zone:"player"},portable:{itemId,amount:1}}};
      world.entities[id]=entity;world.observations[id]={stages:["outline","surface"],collected:true};
    }
  } else if (!missing && existing[0]) existing[0].entity.toolDurability=value;
  state.toolDurability[itemId] = toolInstances(state,itemId)[0]?.entity.toolDurability ?? value;
}
export function damageToolInstance(state: GameState, itemId: string, next: number) {
  const active=toolInstances(state,itemId)[0];
  if(!active)return;
  active.entity.toolDurability=Math.max(0,next);
  if(next<=0){
    if(active.entity.components.portable!.amount>1){active.entity.components.portable!.amount--;delete active.entity.toolDurability;}
    else relocateEntity(active.world,active.entity,{zone:"consumed"});
  }
}

/** Changing the selected/held tool is not wear; compare the same physical identities. */
export function physicalToolWear(before: GameState, after: GameState, itemId: string) {
  const worlds = (state: GameState) => [state.textWorld, ...Object.values(state.locationTextWorlds)].filter((world): world is TextWorld => Boolean(world));
  const prior = worlds(before).flatMap(world=>Object.values(world.entities).filter(e=>e.components.portable?.itemId===itemId).map(entity=>({world,entity})));
  const current = worlds(after).flatMap(world=>Object.values(world.entities).filter(e=>e.components.portable?.itemId===itemId).map(entity=>({world,entity})));
  if (!prior.length && !current.length) return undefined;
  let broken=false, spent=0;
  for (const {entity} of current) {
    const previous=prior.find(p=>p.entity.id===entity.id && p.entity.origin?.worldId===entity.origin?.worldId);
    const old=previous?.entity.toolDurability ?? (previous && carriedByPlayer(previous.world,previous.entity) ? before.toolDurability[itemId] : undefined);
    if(old===undefined || entity.toolDurability===undefined)continue;
    if(old>0 && entity.toolDurability===0)broken=true;
    else spent+=Math.max(0,old-entity.toolDurability);
  }
  return {broken,spent};
}
