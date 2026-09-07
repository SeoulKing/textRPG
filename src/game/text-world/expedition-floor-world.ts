import type { ContentRegistry, GameState, ItemCard } from "../schemas";
import type { TextEntity, TextRoom } from "../schemas/text-world";
import { combatRewardsForFloor } from "../subway-encounter";
import { expeditionFloorIds, expeditionFloorReady } from "./expedition-floor-state";
import { transferCarriedEntities, materializeOwnedInventory } from "./inventory";
import { createSubwayTextWorld } from "./world";
import { carriedByPlayer } from "./spatial";

/** Materialize old native awards without crediting either ledger again. */
function materializeProvisionalItems(state: GameState, registry: ContentRegistry) {
  const w = state.textWorld!, e = state.subwayExpedition;
  for (const [itemId, amount] of Object.entries(e.carriedLoot)) {
    const represented = Object.values(w.entities).filter(x => x.expeditionLoot?.runNumber === e.runNumber && x.inventoryRegistered && x.components.portable?.itemId === itemId && carriedByPlayer(w,x)).reduce((n,x)=>n+x.components.portable!.amount,0);
    for (let i=represented;i<amount;i++) {
      let id = "provisional:"+e.runNumber+":"+itemId+":"+i, suffix=0;
      while(w.entities[id])id="provisional:"+e.runNumber+":"+itemId+":"+i+":"+(++suffix);
      const item = registry.items[itemId] as ItemCard | undefined;
      w.entities[id]={id,name:item?.name ?? itemId,description:item?.description ?? itemId,inventoryRegistered:true,expeditionLoot:{runNumber:e.runNumber,floorId:e.currentFloor!.id},
        components:{position:{zone:"player"},portable:{itemId,amount:1}}};
      w.observations[id]={stages:["outline","surface"],collected:true};
    }
  }
}

/** Geometry and senses are authored engine data; generated loot text cannot introduce objects. */
export function ensureExpeditionFloor(state: GameState, registry: ContentRegistry) {
  if (!expeditionFloorReady(state)) return false;
  const e=state.subwayExpedition, floor=e.currentFloor!, p=e.currentFloorProgress, ids=expeditionFloorIds(state);
  const w=state.textWorld ??=createSubwayTextWorld(registry.textRooms);
  if (!w.rooms?.[ids.room]) {
    const entity=(id:string,name:string,zone:string,placement:string,surface:string,components:Omit<TextEntity["components"],"position">={}):TextEntity=>({id,name,description:surface,
      details:{anchor:id,placement,outline:name,surface},components:{position:{zone},...components}});
    const entities:TextEntity[]=[];
    const hosts=[
      entity(ids.prefix+"_cache0","벽면 보관함",ids.room,"입구 왼쪽 벽","금속으로 된 문짝과 손잡이가 보인다.",{physical:{mass:25,volume:12,movable:false,opaque:true,blocksPassage:false},openable:{isOpen:false,locked:false},container:{items:[]}}),
      entity(ids.prefix+"_cache1","나무 상자",ids.room,"방 가운데 바닥","나무 판자를 맞댄 상자에 뚜껑이 덮여 있다.",{physical:{mass:12,volume:8,movable:true,opaque:true,blocksPassage:true,supportCapacity:5},openable:{isOpen:false,locked:false},container:{items:[]},structure:{material:"wood",integrity:4,maxIntegrity:4,resistance:1,salvage:[]}}),
      entity(ids.prefix+"_cache2","철제 선반",ids.room,"입구 오른쪽 벽","선반 아래 칸은 그늘에 가려 가까이서 살펴야 한다.",{physical:{mass:30,volume:10,movable:false,opaque:false,blocksPassage:false,supportCapacity:15},container:{items:[]}})
    ];
    // Preserve the existing reward budget. Already-paid legacy victories get no second set.
    const rewards = !e.spatialMode && p.encounter?.rewardGranted ? [] : combatRewardsForFloor(state);
    const remaining = new Map(rewards.map(x=>[x.itemId,x.amount]));
    for (let i=0;i<hosts.length;i++) {
      const host=hosts[i],spot=floor.lootSpots[i];
      host.components.expeditionCache={floorId:floor.id,lootSpotId:spot.id,searchMinutes:floor.depth>=11?20:15};
      const stock = floor.depth===1 ? (rewards[i] ? [rewards[i]] : []) : spot.contents;
      for(const entry of stock){const amount=Math.min(entry.amount,remaining.get(entry.itemId)??0);remaining.set(entry.itemId,(remaining.get(entry.itemId)??0)-amount);if(amount&&!p.searchedLootSpotIds.includes(spot.id))addLoot(host,entry.itemId,amount);}
      if(p.searchedLootSpotIds.includes(spot.id)) {w.observations[host.id]={stages:["outline","surface","interior"],collected:false,inspected:true};if(host.components.openable)host.components.openable.isOpen=true;}
    }
    for(const [itemId,amount] of remaining) if(amount && !p.searchedLootSpotIds.length)addLoot(hosts[2],itemId,amount);
    function addLoot(host:TextEntity,itemId:string,amount:number){
      const item=registry.items[itemId] as ItemCard | undefined,id=host.id+"_"+itemId;
      const loot=entity(id,item?.name??itemId,host.id,host.name+" 안쪽",item?.description??itemId,{portable:{itemId,amount},discovery:{inspectTargetId:host.id}});
      if(itemId==="flashlight")loot.components.light={on:false};
      loot.expeditionLoot={runNumber:e.runNumber,floorId:floor.id};host.components.container!.items.push(id);entities.push(loot);
    }
    entities.push(...hosts,
      entity(ids.door,"계단실 철문",ids.room,"맞은편 벽","손잡이를 당겨 여닫는 철문이 계단실로 이어진다.",{portal:{from:ids.room,to:ids.landing},openable:{isOpen:true,locked:false}}),
      entity(ids.prefix+"_up","위층 계단",ids.room,"들어온 입구","들어온 계단을 따라 위로 돌아갈 수 있다.",{expeditionRoute:{command:floor.depth>1?"ascend":"return",floorId:floor.id}}),
      entity(ids.prefix+"_down","아래층 계단",ids.landing,"계단실 안쪽","아래층으로 꺾여 내려가는 계단이 있다.",{expeditionRoute:{command:"descend",floorId:floor.id}}));
    const rooms:TextRoom[]=[
      {id:ids.room,name:"지하 "+floor.depth+"층 · 수색 구역",locationId:"subway",light:true,layout:"들어온 계단을 기준으로 왼쪽 벽에는 보관함, 가운데에는 나무 상자, 오른쪽 벽에는 철제 선반이 있다. 맞은편 철문은 아래층 계단실로 이어진다.",surface:"천장의 비상등이 방과 계단실 입구를 비춘다.",neighbors:[ids.landing],entities:[],arrivals:{[ids.landing]:{position:"far-door",facing:"entrance",text:"계단실에서 철문을 지나 수색 구역으로 돌아온다."}}},
      {id:ids.landing,name:"지하 "+floor.depth+"층 · 계단실",locationId:"subway",light:true,layout:"철문 뒤쪽의 좁은 계단실에서 아래층으로 내려가는 계단이 이어진다.",surface:"계단실에도 비상등의 빛이 닿는다.",neighbors:[ids.room],entities:[],arrivals:{[ids.room]:{position:"entrance",facing:"stairs",text:"철문을 지나 계단실로 들어선다."}}}
    ];
    w.rooms??={};for(const {entities:_,...room} of rooms)w.rooms[room.id]=room;
    for(const x of entities)w.entities[x.id]=x;
  }
  e.spatialMode=true;
  transferCarriedEntities(state,w);
  materializeOwnedInventory(state,w,registry);materializeProvisionalItems(state,registry);
  const arriving=!w.active || ![ids.room,ids.landing].includes(w.player.zone);
  if(arriving){w.active=true;w.player={...w.player,zone:ids.room,near:null,position:"entrance",facing:"far-door",posture:"standing",relation:"near",coverId:null,focusEntityId:null,manipulating:false};}
  return arriving;
}
