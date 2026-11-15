import { COOKING_RECIPES, COOKING_MATERIAL_IDS, FOODS } from "../game/arcana-cooking";
export { COOKING_RECIPES, FOODS } from "../game/arcana-cooking";
import crypto from "node:crypto";
import { OnlineError } from "./accounts";
import { skillMastery, trainArcanaSkill } from "../game/arcana-skill-training";
import { baseItems } from "../game/data/items";
import type { Actor, Point } from "./model";
import type { GameSession } from "../game/schemas";

export const CAMPFIRES: Record<string,{quality:string;minutes:number;cookSeconds:number}> = {
  campfire:{quality:"보통",minutes:30,cookSeconds:6},
  campfireFine:{quality:"양호",minutes:45,cookSeconds:4},
  campfireExcellent:{quality:"우수",minutes:60,cookSeconds:3},
};
export type Campfire = {id:string;itemId:string;ownerId:string;position:Point;expiresAt:number};
export type LifeJob = {id:string;kind:"craft"|"cook";phase:"active"|"success"|"cancelled";startedAt:number;endsAt:number;origin:Point;campfireId?:string;recipeId?:string;itemId?:string;message:string};
export const lifeActive=(job:LifeJob|undefined)=>job?.phase==="active";
export function initializeLife(game:GameSession) {
  const state=game.state;
  const life=state.arcanaLife ??= {hunger:100,elapsedMs:0,woodGranted:false};
  if(!life.woodGranted) {state.inventory.wood=(state.inventory.wood||0)+30;life.woodGranted=true;}
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
  if((actor.game.state.inventory[id]||0)<count)throw new OnlineError("materials_required",id==="wood"?"목재 5개가 필요합니다.":id==="riverFish"?"낚시로 얻은 민물고기 1마리가 필요합니다.":(baseItems[id as keyof typeof baseItems]?.name || "해당 아이템")+" "+count+"개가 필요합니다.");
}
function consume(actor:Actor,id:string,count:number) {
  actor.game.state.inventory[id]-=count;
  if(actor.game.state.inventory[id]<=0)delete actor.game.state.inventory[id];
}
export function requireLifeReady(actor:Actor) {
  if(!actor.game.state.flags.in_magic_world || actor.game.state.arcanaCombat.hp<=0 || actor.bench || actor.game.state.npcDialogue.active || actor.game.state.subwayExpedition.active)
    throw new OnlineError("life_unavailable","현재 행동을 마친 뒤 이용해 주세요.");
}
export function beginLife(actor:Actor,kind:"craft"|"cook",campfire?:Campfire,recipeId="grilledFish"):LifeJob {
  requireLifeReady(actor);
  const recipe=kind==="cook"?cookingRecipe(recipeId):undefined;
  const ingredients=recipe?.ingredients || [{itemId:"wood",count:5}];
  for(const input of ingredients)requireCount(actor,input.itemId,input.count);
  if(kind==="cook" && (!campfire || campfire.expiresAt<=Date.now() || actor.place.interior || Math.hypot(actor.position.x-campfire.position.x,actor.position.y-campfire.position.y)>26))
    throw new OnlineError("campfire_required","불이 켜진 모닥불 가까이에서 구워 주세요.");
  const duration=kind==="craft"?3:CAMPFIRES[campfire!.itemId].cookSeconds;
  const now=Date.now();
  return {id:crypto.randomUUID(),kind,phase:"active",startedAt:now,endsAt:now+duration*1000,origin:{...actor.position},...(campfire?{campfireId:campfire.id}:{}),...(recipe?{recipeId}:{}),message:kind==="craft"?"모닥불을 만들고 있습니다.":recipe!.name+" 조리 중입니다."};
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
  const recipe=job.kind==="cook"?cookingRecipe(job.recipeId || "grilledFish"):undefined;
  const ingredients=recipe?.ingredients || [{itemId:"wood",count:5}];
  // Validate every ingredient before mutating inventory, including multi-material recipes.
  for(const input of ingredients)requireCount(actor,input.itemId,input.count);
  const itemId=(recipe?.results || ["campfire","campfireFine","campfireExcellent"])[tier];
  for(const input of ingredients)consume(actor,input.itemId,input.count);
  actor.game.state.inventory[itemId]=(actor.game.state.inventory[itemId]||0)+1;
  const xp=Math.min(100,Math.max(0,10000-(actor.game.state.arcanaCombat.skillTraining[skill]?.xp||0)));
  trainArcanaSkill(actor.game.state,skill,xp);
  job.phase="success";job.itemId=itemId;
  job.message="+1 "+(job.kind==="craft"?"모닥불":recipe!.name)+" · "+(CAMPFIRES[itemId]?.quality || FOODS[itemId].quality)+" / "+(skill==="crafting"?"제작":"요리")+" 숙련 경험치 +"+xp;
}
export function eatFish(actor:Actor,itemId:string) {
  requireLifeReady(actor);
  const food=FOODS[itemId],life=actor.game.state.arcanaLife!;
  if(!food)throw new OnlineError("invalid_food","먹을 수 있는 요리를 선택해 주세요.");
  requireCount(actor,itemId,1);
  if(life.hunger>=100)throw new OnlineError("hunger_full","이미 배가 부릅니다.");
  const before=life.hunger;
  life.hunger=Math.min(100,life.hunger+food.hunger);
  consume(actor,itemId,1);
  return food.name+" 섭취 완료. 허기 +"+(life.hunger-before);
}
export function placeCampfire(actor:Actor,itemId:string,position:Point):Campfire {
  requireLifeReady(actor);
  const definition=CAMPFIRES[itemId];
  if(!definition)throw new OnlineError("invalid_campfire","설치할 모닥불을 선택해 주세요.");
  requireCount(actor,itemId,1);
  consume(actor,itemId,1);
  return {id:crypto.randomUUID(),itemId,ownerId:actor.character.id,position:{...position},expiresAt:Date.now()+definition.minutes*60000};
}