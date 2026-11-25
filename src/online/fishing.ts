import { baseItems } from "../game/data/items";

import { OnlineError } from "./accounts";
import type { Actor } from "./model";
import { skillMastery, trainArcanaSkill } from "../game/arcana-skill-training";

type Rect = {x:number;y:number;w:number;h:number};
export type FishingGeometry = {mode?:"pond"|"river";profile?:"plaza";water:Rect[];excluded:Rect[]};
const contains=(r:Rect,p:{x:number;y:number})=>p.x>=r.x && p.y>=r.y && p.x<r.x+r.w && p.y<r.y+r.h;
function castTarget(stance:Pick<Actor,"position"|"direction">, plazaFishing:boolean, geometry?:FishingGeometry) {
  if(!geometry)return null;
  const onBridge=(p:{x:number;y:number})=>geometry.excluded.some(rect=>contains(rect,p));
  const wet=(p:{x:number;y:number})=>geometry.water.some(r=>{
    if(!contains(r,p))return false;
    if(geometry.mode!=="pond")return true;
    const dx=(p.x-r.x)*2/r.w-1,dy=(p.y-r.y)*2/r.h-1;
    return dx*dx+dy*dy<1;
  }) && !onBridge(p);
  const length=Math.hypot(stance.direction.x,stance.direction.y);
  if(length<.001 || wet(stance.position) || (plazaFishing && onBridge(stance.position)))return null;
  const direction={x:stance.direction.x/length,y:stance.direction.y/length};
  let landing:{x:number;y:number}|null=null;
  let reach=64;
  for(let d=16;d<=reach;d+=2) {
    const p={x:stance.position.x+direction.x*d,y:stance.position.y+direction.y*d};
    if(!wet(p) || !wet({x:p.x+direction.x*6,y:p.y+direction.y*6})) {
      if(landing)break;
      continue;
    }
    if(!plazaFishing)return p;
    if(!landing)reach=Math.min(reach,d+24);
    landing=p;
  }
  return landing;
}
export function ensureFishingRod(actor:Actor) {
  const {flags,inventory}=actor.game.state;
  actor.game.world.itemCards.fishingRod ??= {...baseItems.fishingRod,source:"template",generatedAt:new Date().toISOString()};
  if(!flags.arcana_fishing_rod_received) {
    inventory.fishingRod=Math.max(1,inventory.fishingRod || 0);
    flags.arcana_fishing_rod_received=true;
  }
  if(!(inventory.fishingRod>0) && flags.arcana_life_tool==="fishingRod")flags.arcana_life_tool="";
}
export function equipFishingRod(actor:Actor,equip:boolean) {
  ensureFishingRod(actor);
  if(actor.pending || actor.game.state.npcDialogue.active || actor.game.state.subwayExpedition.active || actor.game.state.arcanaCombat.hp<=0)
    throw new OnlineError("equipment_unavailable","현재 행동을 마친 뒤 장비를 바꿔 주세요.");
  if(equip && !(actor.game.state.inventory.fishingRod>0))throw new OnlineError("rod_required","나무 낚싯대가 필요합니다.");
  actor.game.state.flags.arcana_life_tool=equip?"fishingRod":"";
}
export type Fishing = {
  phase: "waiting"|"bite"|"reeling"|"success"|"escaped";
  textPond?:boolean;
  id:string; pond:boolean; plazaFishing?:boolean; castStartedAt:number; phaseStartedAt:number; origin:{x:number;y:number}; bobber:{x:number;y:number}; direction:{x:number;y:number}; age: number; biteAt: number; held: boolean; bar: number; velocity: number;
  fish: number; target: number; turnIn: number; progress: number; width: number;
  lost: number; xp: number; message: string;
};
export const fishingActive = (f: Fishing|undefined) => !!f && ["waiting","bite","reeling"].includes(f.phase);
const waitForBite=(plazaFishing:boolean)=>plazaFishing?7+Math.random()*6:2.3+Math.random()*2.5;

function changePhase(f: Fishing, phase: Fishing["phase"], message: string) {
  f.phase=phase;
  f.phaseStartedAt=Date.now();
  f.age=0;
  f.message=message;
}

export function startFishing(actor: Actor, geometry?:FishingGeometry, textPond=false): Fishing {
  ensureFishingRod(actor);
  if(!(actor.game.state.inventory.fishingRod>0) || actor.game.state.flags.arcana_life_tool!=="fishingRod")
    throw new OnlineError("rod_required","소지품 → 장비에서 나무 낚싯대를 장착해 주세요.");
  const pond=geometry?.mode==="pond";
  const plazaFishing=geometry?.profile==="plaza" || pond;
  let stance:Pick<Actor,"position"|"direction">=actor;
  if(textPond) {
    const water=geometry?.water[0];
    if(actor.place.location!=="arcana_plaza" || actor.place.interior || !plazaFishing || !water)
      throw new OnlineError("pond_required","광장 연못에서 낚시해 주세요.");
    // Use the authored plaza water for this cast without moving the actor.
    stance={position:{x:water.x+water.w/2,y:water.y-16},direction:{x:0,y:1}};
  }
  const bobber=castTarget(stance,plazaFishing,geometry);
  if (actor.place.interior || !actor.game.state.flags.in_magic_world || !bobber)
    throw new OnlineError("river_required", "물가에 서서 수면을 바라봐 주세요.");
  if (actor.game.state.arcanaCombat.hp<=0 || actor.bench || actor.game.state.npcDialogue.active || actor.game.state.subwayExpedition.active)
    throw new OnlineError("fishing_unavailable", "현재 행동을 마친 뒤 낚시해 주세요.");
  actor.walking=false;
  const now=Date.now();
  return {id:crypto.randomUUID(),pond,plazaFishing,textPond,castStartedAt:now,phaseStartedAt:now,origin:{...stance.position},bobber,direction:{...stance.direction},phase:"waiting",age:0,biteAt:waitForBite(plazaFishing),held:false,bar:.35,velocity:0,fish:.45,target:.45,turnIn:0,progress:.3,width:.26+skillMastery(actor.game.state,"fishing")*.0012,lost:0,xp:0,message:"찌를 던졌습니다. 입질을 기다려 주세요."};
}
export function fishingInput(f: Fishing, pressed: boolean) {
  // Only a new press hooks the fish; holding before the bite cannot auto-hook.
  if (pressed && !f.held) {
    if (f.phase==="waiting") changePhase(f,"escaped","너무 일찍 챘습니다.");
    else if (f.phase==="bite") changePhase(f,"reeling","누르면 상승 · 떼면 하강");
  }
  f.held=pressed;
}
export function tickFishing(actor: Actor, f: Fishing, seconds: number): boolean {
  if (!fishingActive(f)) return false;
  const plazaFishing=f.plazaFishing ?? f.pond;
  f.age+=seconds;
  if(f.phase==="waiting" && f.age>=f.biteAt) changePhase(f,"bite","입질! 지금 챔질하세요!");
  else if(f.phase==="bite" && f.age>(plazaFishing?3:1.4)) {
    if(plazaFishing) {
      f.biteAt=waitForBite(true);
      changePhase(f,"waiting","찌가 다시 떠올랐습니다. 다음 입질을 기다립니다.");
    } else changePhase(f,"escaped","입질을 놓쳤습니다.");
  }
  else if(f.phase==="reeling") {
    // Fixed small steps make the handling independent of command frequency and tick jitter.
    for(let remaining=seconds;remaining>1e-6;) {
      const dt=Math.min(1/60,remaining);remaining-=dt;
      f.turnIn-=dt;
      if(f.turnIn<=0) {f.target=.08+Math.random()*.84;f.turnIn=.55+Math.random()*.8;}
      f.fish+=Math.sign(f.target-f.fish)*Math.min(Math.abs(f.target-f.fish),(.16+Math.abs(f.target-f.fish)*.4)*dt);
      f.velocity=Math.max(-.65,Math.min(.65,f.velocity+(f.held?1.5:-1.2)*dt));
      f.bar+=f.velocity*dt;
      const half=f.width/2;
      if(f.bar<half) {f.bar=half;f.velocity=0;}
      if(f.bar>1-half) {f.bar=1-half;f.velocity=0;}
      const caught=Math.abs(f.fish-f.bar)<=half;
      f.progress=Math.max(0,Math.min(1,f.progress+(caught ? .2 : -.15)*dt));
      if(!caught)f.lost+=dt;
      if(f.progress===1) {
        f.xp=Math.min(f.lost<.3?40:25,Math.max(0,10000-(actor.game.state.arcanaCombat.skillTraining.fishing?.xp || 0)));
        actor.game.state.inventory.riverFish=(actor.game.state.inventory.riverFish || 0)+1;
        trainArcanaSkill(actor.game.state,"fishing",f.xp);
        changePhase(f,"success",`민물고기 +1 · 낚시 숙련 경험치 +${f.xp}${f.lost<.3?" · 완벽한 포획!":""}`);
        return true;
      }
      if(f.progress===0) {changePhase(f,"escaped","물고기가 빠져나갔습니다.");break;}
    }
    if(f.phase==="reeling" && f.age>=24) changePhase(f,"escaped","줄이 느슨해져 물고기를 놓쳤습니다.");
  }
  return false;
}
