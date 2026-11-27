import { FOREST_LOCATION, WOODCUTTING_AXE } from "../game/arcana-forest";
import { ARCANA_HOME_LOCATION } from "../game/arcana-home";
import { COOKING_RECIPES, FOODS, type CookingRecipe } from "../game/arcana-cooking";
export { COOKING_RECIPES, FOODS } from "../game/arcana-cooking";
import crypto from "node:crypto";
import { OnlineError } from "./accounts";
import { equipmentLoadout } from "./equipment";
import { arcanaStats } from "../game/arcana-combat";
import { initializeArcanaAbilities } from "../game/arcana-abilities";
import { skillMastery, trainArcanaSkill } from "../game/arcana-skill-training";
import { baseItems } from "../game/data/items";
import type { Actor, Point, SharedWorld } from "./model";
import type { GameSession } from "../game/schemas";

export const CAMPFIRES: Record<string,{quality:string;minutes:number;cookSeconds:number}> = {
  campfire:{quality:"보통",minutes:30,cookSeconds:6},
  campfireFine:{quality:"양호",minutes:45,cookSeconds:4},
  campfireExcellent:{quality:"우수",minutes:60,cookSeconds:3},
};
export type Campfire = {id:string;itemId:string;ownerId:string;position:Point;expiresAt:number;area?:string};
export type LifeJob = {
  id:string;
  kind:"craft"|"cook";
  phase:"active"|"success"|"cancelled";
  startedAt:number;
  endsAt:number;
  origin:Point;
  campfireId?:string;
  recipeId?:string;
  homeKitchen?:boolean;
  itemId?:string;
  quantity?:number;
  completed?:number;
  resultCounts?:Record<string,number>;
  message:string;
};
export const DAILY_GATHER_LIMIT=3;
export const MAX_LIFE_QUANTITY=20;
const CRAFT_SECONDS = 3;
const HOME_COOK_SECONDS = 4;
export const CRAFTING_RECIPES: Record<string, CookingRecipe & { count: number }> = {
  lumber:{name:"목재",ingredients:[{itemId:"treeBranch",count:2}],results:["wood","wood","wood"],count:3},
  campfire:{name:"모닥불",ingredients:[{itemId:"wood",count:5}],results:["campfire","campfireFine","campfireExcellent"],count:1},
};

function recipeIngredientTotals(recipe: CookingRecipe) {
  const totals: Record<string, number> = {};
  for (const { itemId, count } of recipe.ingredients) totals[itemId] = (totals[itemId] ?? 0) + count;
  return totals;
}

function recipeCatalog(recipes: Record<string, CookingRecipe & { count?: number }>) {
  return Object.entries(recipes).map(([id, recipe]) => ({
    id,
    name: recipe.name,
    ingredients: recipeIngredientTotals(recipe),
    results: recipe.results,
    count: recipe.count ?? 1,
    qualityRoll: recipe.results.some(itemId => itemId !== recipe.results[0]),
  }));
}

const craftingCatalog = recipeCatalog(CRAFTING_RECIPES);
const cookingCatalog = recipeCatalog(COOKING_RECIPES);
const productionRecipes = [...craftingCatalog, ...cookingCatalog];
const materialIds = new Set(productionRecipes.flatMap(recipe => Object.keys(recipe.ingredients)));
const lifeItemIds = new Set([
  WOODCUTTING_AXE, ...materialIds, ...Object.keys(CAMPFIRES), ...Object.keys(FOODS),
  ...productionRecipes.flatMap(recipe => recipe.results),
]);
export const LIFE_CATALOG = {
  crafting: craftingCatalog,
  cooking: cookingCatalog,
  campfires: CAMPFIRES,
  foods: FOODS,
  materials: Object.fromEntries([...materialIds].map(id => [id, baseItems[id as keyof typeof baseItems].name] as const)),
  maxQuantity: MAX_LIFE_QUANTITY,
  craftSeconds: CRAFT_SECONDS,
  homeCookSeconds: HOME_COOK_SECONDS,
} as const;

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
  for(const id of lifeItemIds) {
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
  if((actor.game.state.inventory[id]||0)<count)throw new OnlineError("materials_required",id==="riverFish"?"낚시로 얻은 민물고기 "+count+"마리가 필요합니다.":(baseItems[id as keyof typeof baseItems]?.name || "해당 아이템")+" "+count+"개가 필요합니다.");
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
export function beginLife(actor:Actor,kind:"craft"|"cook",campfire?:Campfire,recipeId?:string,quantity=1):LifeJob {
  requireLifeReady(actor);
  if(!Number.isSafeInteger(quantity) || quantity<1 || quantity>MAX_LIFE_QUANTITY)
    throw new OnlineError("life_quantity_required","작업 횟수는 1~"+MAX_LIFE_QUANTITY+"회로 선택해 주세요.",400);
  const selectedId=recipeId || (kind==="cook"?"grilledFish":"campfire");
  const recipe=kind==="cook"?cookingRecipe(selectedId):craftingRecipe(selectedId);
  for(const [itemId,count] of Object.entries(recipeIngredientTotals(recipe)))requireCount(actor,itemId,count*quantity);
  const homeKitchen=kind==="cook" && actor.game.state.arcanaLife!.atHome && actor.place.interior==="arcana_home:"+actor.character.id;
  if(kind==="cook" && !homeKitchen && (!campfire || campfire.expiresAt<=Date.now() || actor.place.interior || Math.hypot(actor.position.x-campfire.position.x,actor.position.y-campfire.position.y)>26))
    throw new OnlineError("campfire_required","불이 켜진 모닥불 가까이에서 구워 주세요.");
  const duration=kind==="craft"?CRAFT_SECONDS:homeKitchen?HOME_COOK_SECONDS:CAMPFIRES[campfire!.itemId].cookSeconds;
  const now=Date.now();
  return {
    id:crypto.randomUUID(),kind,recipeId:selectedId,phase:"active",origin:{...actor.position},
    startedAt:now,endsAt:now+duration*1000,quantity,completed:0,resultCounts:{},
    ...(!homeKitchen && campfire?{campfireId:campfire.id}:{}),
    ...(homeKitchen?{homeKitchen:true}:{}),
    message:recipe.name+(kind==="craft"?" 제작 중입니다.":" 조리 중입니다."),
  };
}
function craftingRecipe(id:string) {
  if(!Object.hasOwn(CRAFTING_RECIPES,id))throw new OnlineError("invalid_recipe","제작할 레시피를 선택해 주세요.");
  return CRAFTING_RECIPES[id];
}
function cookingRecipe(id:string) {
  if(!Object.hasOwn(COOKING_RECIPES,id))throw new OnlineError("invalid_recipe","요리할 레시피를 선택해 주세요.");
  return COOKING_RECIPES[id];
}
export function cancelLife(job:LifeJob|undefined,reason="작업을 취소했습니다.") {
  if(job?.phase!=="active")return;
  job.phase="cancelled";
  const completed=job.completed ?? 0;
  job.message=completed>0
    ? reason+" "+completed+" / "+job.quantity+"회 완료. 완성품과 숙련도는 유지됩니다."
    : reason+" 재료는 소모하지 않았습니다.";
}
export function completeLife(actor:Actor,job:LifeJob,random=Math.random) {
  if(!lifeActive(job))return;
  const skill=job.kind==="craft"?"crafting":"cooking";
  const t=skillMastery(actor.game.state,skill)/100,roll=random()*100;
  const tier=roll<85-75*t?0:roll<99-49*t?1:2;
  const craft=job.kind==="craft"?craftingRecipe(job.recipeId || "campfire"):null;
  const recipe=craft??cookingRecipe(job.recipeId || "grilledFish");
  const state=actor.game.state;
  const itemId=recipe.results[tier],count=craft?.count??1;
  // Stage the entire serving on a copy, including when a recipe returns one of its inputs.
  const inventory={...state.inventory};
  for(const [ingredient,needed] of Object.entries(recipeIngredientTotals(recipe))) {
    requireCount(actor,ingredient,needed);
    const remaining=inventory[ingredient]-needed;
    if(remaining)inventory[ingredient]=remaining;
    else delete inventory[ingredient];
  }
  const produced=(inventory[itemId] ?? 0)+count;
  if(!Number.isSafeInteger(produced))throw new OnlineError("life_result_capacity","완성한 물품을 소지품에 더 담을 수 없습니다.");
  inventory[itemId]=produced;
  state.inventory=inventory;
  const xp=Math.min(100,Math.max(0,10000-(actor.game.state.arcanaCombat.skillTraining[skill]?.xp||0)));
  trainArcanaSkill(actor.game.state,skill,xp);
  const life=actor.game.state.arcanaLife!;
  if(job.kind==="cook")life.cookedMeals=Math.min(Number.MAX_SAFE_INTEGER,life.cookedMeals+1);
  else life.craftedItems=Math.min(Number.MAX_SAFE_INTEGER,life.craftedItems+count);
  job.completed=(job.completed ?? 0)+1;
  job.resultCounts ??= {};
  job.resultCounts[itemId]=(job.resultCounts[itemId] || 0)+count;
  job.itemId=itemId;
  const quantity=job.quantity ?? 1;
  job.phase=job.completed>=quantity?"success":"active";
  if(job.phase==="active") {
    const duration=job.endsAt-job.startedAt;
    job.startedAt=Date.now();
    job.endsAt=job.startedAt+duration;
  }
  const quality=CAMPFIRES[itemId]?.quality || FOODS[itemId]?.quality;
  job.message="+"+count+" "+recipe.name+(quality?" · "+quality:"")+" / "+(skill==="crafting"?"제작":"요리")+" 숙련 경험치 +"+xp;
  if(quantity>1) {
    const progress=job.completed+" / "+quantity+"회 완료";
    if(job.phase==="success") {
      const summary=Object.entries(job.resultCounts).map(([id,total])=>{
        const resultQuality=CAMPFIRES[id]?.quality || FOODS[id]?.quality;
        return "+"+total+" "+recipe.name+(resultQuality?" · "+resultQuality:"");
      }).join(" / ");
      job.message=progress+" · "+summary;
    } else job.message=progress+" · "+job.message;
  }
  life.lastMessage=job.message;
}
const TEXT_FOREST_TREE_ID = "forest_trees";
const FOREST_TREE_HEALTH = 100;
const FOREST_TREE_RESPAWN_MS = 60_000;

export type ForestTreeGeometry = {position: Point; radius: number};

function forestChopDamage(actor: Actor) {
  const strength = actor.game.state.arcanaAbilities?.strength ?? 10;
  const difference = strength - 10;
  return Math.max(8, Math.min(FOREST_TREE_HEALTH, 20 + difference * (difference > 0 ? 5 : 2)));
}

export function forestTreeState(world: SharedWorld, actor: Actor, treeId: string) {
  const tree = world.forestTrees?.[treeId];
  const health = tree?.health ?? FOREST_TREE_HEALTH;
  const damage = forestChopDamage(actor);
  return {
    id: treeId,
    health,
    maxHealth: FOREST_TREE_HEALTH,
    hitsRemaining: Math.ceil(health / damage),
    hitsRequired: Math.ceil(FOREST_TREE_HEALTH / damage),
    felled: health === 0,
    respawnAt: tree?.respawnAt ?? 0,
    revision: tree?.revision ?? 0,
    lastHitBy: tree?.lastHitBy ?? null,
    lastHitAt: tree?.lastHitAt ?? null,
  };
}

export function regrowForestTree(world: SharedWorld, treeId: string) {
  const trees = world.forestTrees;
  const tree = trees?.[treeId];
  if (trees && tree?.health === 0) {
    trees[treeId] = {...tree, health: FOREST_TREE_HEALTH, respawnAt: 0, lastHitBy: null, lastHitAt: null};
  }
}

export function chopForestWood(actor: Actor, world: SharedWorld, treeId: string, tree: ForestTreeGeometry | undefined,
  textAtTimber: boolean, now = Date.now()) {
  requireLifeReady(actor);
  if (actor.place.location !== FOREST_LOCATION || actor.place.interior) {
    throw new OnlineError("forest_required", "연못가 숲에서 벌목해 주세요.");
  }
  if (textAtTimber && treeId !== TEXT_FOREST_TREE_ID) {
    throw new OnlineError("forest_text_tree_required", "심플 모드에서는 벌목지의 참나무를 선택해 주세요.");
  }
  if (!tree || !Number.isFinite(tree.position.x) || !Number.isFinite(tree.position.y)
      || !Number.isFinite(tree.radius) || tree.radius <= 0) {
    throw new OnlineError("forest_tree_unavailable", "벌목지 정보를 불러오고 있습니다. 잠시 후 다시 이용해 주세요.", 503);
  }
  if (!textAtTimber) {
    const distance = Math.hypot(actor.position.x - tree.position.x, actor.position.y - tree.position.y);
    if (distance > tree.radius) {
      throw new OnlineError("forest_tree_out_of_reach", "참나무에 가까이 다가가 벌목해 주세요.");
    }
  }
  const state = actor.game.state;
  if (equipmentLoadout(state).mainHand !== WOODCUTTING_AXE) {
    throw new OnlineError("woodcutting_axe_required", "주무기에 벌목용 도끼를 장착해 주세요.");
  }
  const before = forestTreeState(world, actor, treeId);
  if (before.felled) {
    throw new OnlineError("forest_tree_felled", "참나무가 쓰러졌습니다. 새 나무가 자라면 다시 벌목할 수 있습니다.");
  }

  // The serialized world command saves tree damage and the last hit's reward together.
  const health = Math.max(0, before.health - forestChopDamage(actor));
  (world.forestTrees ??= {})[treeId] = {
    health,
    respawnAt: health === 0 ? now + FOREST_TREE_RESPAWN_MS : 0,
    revision: before.revision + 1,
    lastHitBy: actor.character.id,
    lastHitAt: now,
  };
  const after = forestTreeState(world, actor, treeId);
  if (after.felled) {
    state.inventory.wood = (state.inventory.wood ?? 0) + 1;
    state.arcanaLife!.lastMessage = "+1 목재";
  } else {
    state.arcanaLife!.lastMessage = `참나무를 ${after.hitsRemaining}번 더 찍으면 쓰러집니다.`;
  }
  return after;
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
