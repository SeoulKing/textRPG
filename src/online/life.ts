import { ARCANA_HOME_LOCATION } from "../game/arcana-home";
import { COOKING_RECIPES, COOKING_MATERIAL_IDS, FOODS } from "../game/arcana-cooking";
export { COOKING_RECIPES, FOODS } from "../game/arcana-cooking";
import crypto from "node:crypto";
import { OnlineError } from "./accounts";
import { equipmentLoadout } from "./equipment";
import { arcanaStats } from "../game/arcana-combat";
import { initializeArcanaAbilities } from "../game/arcana-abilities";
import { skillMastery, trainArcanaSkill } from "../game/arcana-skill-training";
import { baseItems } from "../game/data/items";
import type { Actor, Point } from "./model";
import type { GameSession } from "../game/schemas";

export const CAMPFIRES: Record<string,{quality:string;minutes:number;cookSeconds:number}> = {
  campfire:{quality:"보통",minutes:30,cookSeconds:6},
  campfireFine:{quality:"양호",minutes:45,cookSeconds:4},
  campfireExcellent:{quality:"우수",minutes:60,cookSeconds:3},
};
export type Campfire = {id:string;itemId:string;ownerId:string;position:Point;expiresAt:number;area?:string};
export type LifeJob = {id:string;kind:"craft"|"cook";phase:"active"|"success"|"cancelled";startedAt:number;endsAt:number;origin:Point;campfireId?:string;recipeId?:string;homeKitchen?:boolean;itemId?:string;message:string};
export const DAILY_GATHER_LIMIT=3;
export const CRAFTING_RECIPES:Record<string,{name:string;ingredients:{itemId:string;count:number}[];results:readonly [string,string,string];count:number}>={
  campfire:{name:"모닥불",ingredients:[{itemId:"wood",count:5}],results:["campfire","campfireFine","campfireExcellent"],count:1},
  lumber:{name:"목재",ingredients:[{itemId:"treeBranch",count:2}],results:["wood","wood","wood"],count:3},
};
export const lifeActive=(job:LifeJob|undefined)=>job?.phase==="active";
export function initializeLife(game:GameSession) {
  const state=game.state;
  initializeArcanaAbilities(state);
  const life=state.arcanaLife ??= {hunger:100,elapsedMs:0,woodGranted:false,day:1,gatheredToday:0,cookedMeals:0,craftedItems:0,atHome:false,homeStorage:{},lastMessage:""};
  // Also normalize sessions retained in memory before the schema migration.
  life.day ??= 1;life.gatheredToday ??= 0;life.cookedMeals ??= 0;life.craftedItems ??= 0;life.atHome ??= false;life.lastMessage ??= "";
  life.homeStorage ??= {};
  if(!life.woodGranted) {state.inventory.wood=(state.inventory.wood||0)+30;life.woodGranted=true;}
  game.world.locationCards.arcana_home={...ARCANA_HOME_LOCATION,description:ARCANA_HOME_LOCATION.summary,source:"template",generatedAt:"static"};
  // Static cards must also be available for old content-version saves and WS rewards.
  for(const id of ["wood","riverFish",...COOKING_MATERIAL_IDS,...Object.keys(CAMPFIRES),...Object.keys(FOODS)]) {
    const definition=baseItems[id as keyof typeof baseItems];
    game.world.itemCards[id]={...definition,source:"template",generatedAt:"static"};
    if(FOODS[id]) {
      game.world.itemCards[id].name=FOODS[id].name+" · "+FOODS[id].quality;
      game.world.itemCards[id].description="허기 "+FOODS[id].hunger+" 회복";
      game.world.itemCards[id].effects={...game.world.itemCards[id].effects,hp:0,mind:0,energy:0};
      game.world.itemCards[id].useMinutes=0;
    }
  }
}
export function tickHunger(actor:Actor,seconds:number) {
  const life=actor.game.state.arcanaLife!;
  life.elapsedMs+=seconds*1000;
  const drain=Math.floor(life.elapsedMs/30000);
  if(drain) {life.hunger=Math.max(0,life.hunger-drain);life.elapsedMs-=drain*30000;}
}
export function lifeSkills(actor:Actor) {
  return ["crafting","cooking"].map(id=>{
    const mastery=skillMastery(actor.game.state,id);
    const t=mastery/100;
    return {id,name:id==="crafting"?"제작":"요리",mastery,xp:actor.game.state.arcanaCombat.skillTraining[id]?.xp || 0,chances:[85-75*t,14+26*t,1+49*t]};
  });
}
function requireCount(actor:Actor,id:string,count:number) {
  if((actor.game.state.inventory[id]||0)<count)throw new OnlineError("materials_required",id==="riverFish"?"낚시로 얻은 민물고기 1마리가 필요합니다.":(baseItems[id as keyof typeof baseItems]?.name || "해당 아이템")+" "+count+"개가 필요합니다.");
}
function consume(actor:Actor,id:string,count:number) {
  actor.game.state.inventory[id]-=count;
  if(actor.game.state.inventory[id]<=0)delete actor.game.state.inventory[id];
}
export function requireLifeReady(actor:Actor,allowHomeSeated=false) {
  const homeSeated=allowHomeSeated && actor.bench==="seated"
    && actor.game.state.arcanaLife?.atHome && actor.place.interior==="arcana_home:"+actor.character.id;
  if(!actor.game.state.flags.in_magic_world || actor.game.state.arcanaCombat.hp<=0 || (actor.bench && !homeSeated) || actor.game.state.npcDialogue.active || actor.game.state.subwayExpedition.active)
    throw new OnlineError("life_unavailable","현재 행동을 마친 뒤 이용해 주세요.");
}
export function transferHomeStorage(actor:Actor,deposit:boolean,itemId?:string,quantity?:number) {
  if(!itemId || quantity===undefined || !Number.isSafeInteger(quantity) || quantity<=0)
    throw new OnlineError("storage_quantity_required","옮길 아이템과 수량을 선택해 주세요.",400);
  if(deposit && itemId==="waterBottle")
    throw new OnlineError("storage_item_unavailable","보관할 수 없는 아이템입니다.",400);

  const state=actor.game.state,life=state.arcanaLife!;
  const source=deposit?state.inventory:life.homeStorage;
  const destination=deposit?life.homeStorage:state.inventory;
  const available=Object.hasOwn(source,itemId)?source[itemId]:0;
  if(available<quantity)
    throw new OnlineError("storage_quantity_unavailable",deposit?"소지품에 수량이 부족합니다.":"보관함에 수량이 부족합니다.");
  if(deposit) {
    const equipped=Object.values(equipmentLoadout(state)).filter(id=>id===itemId).length;
    const equippedTool=Number(itemId==="fishingRod" && state.flags.arcana_life_tool===itemId);
    if(available-equipped-equippedTool<quantity)
      throw new OnlineError("storage_item_equipped","장착 중인 아이템을 해제한 뒤 보관해 주세요.");
  }
  const total=(Object.hasOwn(destination,itemId)?destination[itemId]:0)+quantity;
  if(!Number.isSafeInteger(total))
    throw new OnlineError("storage_quantity_overflow","옮길 수 있는 수량을 초과했습니다.");

  const remaining=available-quantity;
  const nextSource={...source};
  if(remaining>0)nextSource[itemId]=remaining;else delete nextSource[itemId];
  const nextDestination={...destination,[itemId]:total};
  state.inventory=deposit?nextSource:nextDestination;
  state.arcanaLife={...life,homeStorage:deposit?nextDestination:nextSource};
}
export function beginLife(actor:Actor,kind:"craft"|"cook",campfire?:Campfire,recipeId?:string):LifeJob {
  requireLifeReady(actor);
  const selectedId=recipeId || (kind==="cook"?"grilledFish":"campfire");
  const recipe=kind==="cook"?cookingRecipe(selectedId):craftingRecipe(selectedId);
  for(const input of recipe.ingredients)requireCount(actor,input.itemId,input.count);
  const homeKitchen=kind==="cook" && actor.game.state.arcanaLife!.atHome && actor.place.interior==="arcana_home:"+actor.character.id;
  if(kind==="cook" && !homeKitchen && (!campfire || campfire.expiresAt<=Date.now() || actor.place.interior || Math.hypot(actor.position.x-campfire.position.x,actor.position.y-campfire.position.y)>26))
    throw new OnlineError("campfire_required","불이 켜진 모닥불 가까이에서 구워 주세요.");
  const duration=kind==="craft"?3:homeKitchen?4:CAMPFIRES[campfire!.itemId].cookSeconds;
  const now=Date.now();
  return {id:crypto.randomUUID(),kind,phase:"active",startedAt:now,endsAt:now+duration*1000,origin:{...actor.position},...(!homeKitchen && campfire?{campfireId:campfire.id}:{}),recipeId:selectedId,...(homeKitchen?{homeKitchen:true}:{}),message:recipe.name+(kind==="craft"?" 제작 중입니다.":" 조리 중입니다.")};
}
function craftingRecipe(id:string) {
  if(!Object.hasOwn(CRAFTING_RECIPES,id))throw new OnlineError("invalid_recipe","제작할 레시피를 선택해 주세요.");
  return CRAFTING_RECIPES[id];
}
function cookingRecipe(id:string) {
  if(!Object.hasOwn(COOKING_RECIPES,id))throw new OnlineError("invalid_recipe","요리할 레시피를 선택해 주세요.");
  return COOKING_RECIPES[id];
}
export function cancelLife(job:LifeJob|undefined,message="작업을 취소했습니다. 재료는 소모하지 않았습니다.") {
  if(!lifeActive(job))return;
  job!.phase="cancelled";job!.message=message;
}
export function completeLife(actor:Actor,job:LifeJob,random=Math.random) {
  if(!lifeActive(job))return;
  const skill=job.kind==="craft"?"crafting":"cooking";
  const t=skillMastery(actor.game.state,skill)/100,roll=random()*100;
  const tier=roll<85-75*t?0:roll<99-49*t?1:2;
  const recipe=job.kind==="cook"?cookingRecipe(job.recipeId || "grilledFish"):craftingRecipe(job.recipeId || "campfire");
  // Validate every ingredient before mutating inventory, including multi-material recipes.
  for(const input of recipe.ingredients)requireCount(actor,input.itemId,input.count);
  const itemId=recipe.results[tier],count=job.kind==="craft"?craftingRecipe(job.recipeId || "campfire").count:1;
  for(const input of recipe.ingredients)consume(actor,input.itemId,input.count);
  actor.game.state.inventory[itemId]=(actor.game.state.inventory[itemId]||0)+count;
  const xp=Math.min(100,Math.max(0,10000-(actor.game.state.arcanaCombat.skillTraining[skill]?.xp||0)));
  trainArcanaSkill(actor.game.state,skill,xp);
  const life=actor.game.state.arcanaLife!;
  if(job.kind==="cook")life.cookedMeals++;else life.craftedItems+=count;
  job.phase="success";job.itemId=itemId;
  const quality=CAMPFIRES[itemId]?.quality || FOODS[itemId]?.quality;
  job.message="+"+count+" "+recipe.name+(quality?" · "+quality:"")+" / "+(skill==="crafting"?"제작":"요리")+" 숙련 경험치 +"+xp;
  life.lastMessage=job.message;
}
/** Each personal day has three deterministic baskets; rest replenishes them. */
export function gatherLife(actor:Actor) {
  requireLifeReady(actor);
  if(actor.place.location!=="arcana_plaza" || actor.place.interior) {
    throw new OnlineError("gather_place_required","광장 야외의 안전한 곳에서 재료를 모아 주세요.");
  }
  const life=actor.game.state.arcanaLife!;
  if(life.gatheredToday>=DAILY_GATHER_LIMIT) {
    throw new OnlineError("gather_depleted","오늘 모을 재료는 다 모았습니다. 집이나 여관에서 하루를 마무리해 주세요.");
  }
  const foodId=life.gatheredToday%2===0?"mushroom":"potato";
  const rewards=[["wood",2],["treeBranch",2],[foodId,1]] as const;
  for(const [id,count] of rewards) {
    actor.game.state.inventory[id]=(actor.game.state.inventory[id]||0)+count;
  }
  const hungerSpent=Math.min(life.hunger,5);
  life.hunger-=hungerSpent;
  life.gatheredToday++;
  life.lastMessage="+2 목재 / +2 나뭇가지 / +1 "+baseItems[foodId].name
    +" · 오늘 채집 "+life.gatheredToday+" / "+DAILY_GATHER_LIMIT
    +(hungerSpent>0?" / 허기 -"+hungerSpent:"");
}
export function restLife(actor:Actor) {
  requireLifeReady(actor);
  const life=actor.game.state.arcanaLife!;
  const atHome=life.atHome && actor.place.interior==="arcana_home:"+actor.character.id;
  if(!atHome && actor.place.interior!=="arcana_inn") {
    throw new OnlineError("rest_place_required","집의 침실이나 여관에서 쉬어 주세요.");
  }
  const stats=arcanaStats(actor.game.state);
  actor.game.state.arcanaCombat.hp=stats.maxHp;
  actor.game.state.arcanaCombat.mp=stats.maxMp;
  if(life.gatheredToday>0) {
    const hungerSpent=Math.min(life.hunger,25);
    life.day++;
    life.gatheredToday=0;
    life.hunger-=hungerSpent;
    life.elapsedMs=0;
    life.lastMessage="푹 쉬고 "+life.day+"일째 아침을 맞았습니다. HP·MP 회복 / 채집 재료 재생"
      +(hungerSpent>0?" / 허기 -"+hungerSpent:"");
  } else {
    life.lastMessage="잠깐 쉬며 HP와 MP를 모두 회복했습니다. 채집을 한 뒤 쉬면 다음 날이 시작됩니다.";
  }
}
export function eatFish(actor:Actor,itemId:string,allowHomeSeated=false) {
  requireLifeReady(actor,allowHomeSeated);
  const food=FOODS[itemId],life=actor.game.state.arcanaLife!;
  if(!food)throw new OnlineError("invalid_food","먹을 수 있는 요리를 선택해 주세요.");
  requireCount(actor,itemId,1);
  if(life.hunger>=100)throw new OnlineError("hunger_full","이미 배가 부릅니다.");
  const before=life.hunger;
  life.hunger=Math.min(100,life.hunger+food.hunger);
  consume(actor,itemId,1);
  life.lastMessage=food.name+" 섭취 완료. 허기 +"+(life.hunger-before);
  return life.lastMessage;
}
export function placeCampfire(actor:Actor,itemId:string,position:Point):Campfire {
  requireLifeReady(actor);
  const definition=CAMPFIRES[itemId];
  if(!definition)throw new OnlineError("invalid_campfire","설치할 모닥불을 선택해 주세요.");
  requireCount(actor,itemId,1);
  consume(actor,itemId,1);
  return {id:crypto.randomUUID(),itemId,ownerId:actor.character.id,position:{...position},expiresAt:Date.now()+definition.minutes*60000};
}
