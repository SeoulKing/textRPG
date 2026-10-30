import crypto from "node:crypto";
import { spatialLayout, sweptCircle, circleIntersectsCone, spatialMove, spatialWall, spatialRoute } from "../game/arcana-spatial";
import { ARCANA_SPELLS, isArcanaSpell, effectiveSpell, spellMagnitude, spendSpell, tickSpellTimers, absorbArcanaDamage, castFlameGuard, clearFlameGuard } from "../game/arcana-spells";
import { GAME_HOUR_MS } from "../game/base-data";
import { trainArcanaSkill } from "../game/arcana-skill-training";
import { fireballSpecialization } from "../game/arcana-skill-tree";
import { OnlineError } from "./accounts";
import { inField, type Actor, type Point, type SharedWorld, type WorldEvent, type Shot } from "./model";
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const copy=(p:Point)=>({...p});
const mix=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function newEnemy() {
  const home=copy(spatialLayout().home);
  return {id:"slime_0",lifeId:crypto.randomUUID(),position:copy(home),home,hp:30,maxHp:30,attackIn:6,behavior:"neutral" as const,jumpFrom:copy(home),jumpTo:copy(home),jumpHit:false,jumpElapsed:0,targetLocked:false,rewarded:false,respawnAt:0,contribution:{},targetId:null};
}
export function newWorld():SharedWorld {return {id:"main",revision:0,elapsedMs:0,updatedAt:Date.now(),enemy:newEnemy(),projectiles:[],meteors:[],barrages:[],events:[]};}
export function event(world:SharedWorld,kind:WorldEvent["kind"],position:Point,extra:Partial<WorldEvent>={}) {
  world.events.push({id:++world.revision,kind,position:copy(position),amount:0,...extra});
  world.events=world.events.slice(-96);
}
function projectile(world:SharedWorld,actor:Actor,id:"fireball"|"giant_fireball"|"flame_barrage",aim:Point,damage:number,targetId?:string) {
  const t=spatialLayout().tuning, length=Math.hypot(aim.x,aim.y);
  if (length<.001) throw new OnlineError("invalid_aim","발사 방향을 선택해 주세요.",400);
  const shot:Shot={id:crypto.randomUUID(),ownerId:actor.character.id,position:copy(actor.position),origin:copy(actor.position),direction:{x:aim.x/length,y:aim.y/length},remaining:effectiveSpell(actor.game.state,id).rangeTiles*t.tile,damage,spellId:id,radius:t.projectileRadius*(id==="giant_fireball"?2:1),hitIds:[],masteryAwarded:false,pierce:id==="fireball" && fireballSpecialization(actor.game.state,"reach")?3:1,explode:id==="fireball" && fireballSpecialization(actor.game.state,"burst"),targetId};
  world.projectiles.push(shot);
  event(world,"cast",actor.position,{actorId:actor.character.id,projectileId:shot.id,direction:shot.direction});
}
export type Death = {lifeId:string;winnerId:string;money:number;xp:number};
/** Strategy boundary for future boss encounters: distribute actual HP damage, never overkill. */
export function rewardShares(kind:"normal"|"boss",lastHit:string,contribution:Record<string,number>,total:number) {
  if (kind==="normal") return {[lastHit]:total};
  const entries=Object.entries(contribution).filter(([,damage])=>damage>0).sort(([a],[b])=>a.localeCompare(b));
  const sum=entries.reduce((n,[,damage])=>n+damage,0);
  const result:Record<string,number>={}; let used=0;
  for(const [id,damage] of entries) {result[id]=Math.floor(total*damage/sum);used+=result[id];}
  for(let i=0;used<total && entries.length;i++,used++) result[entries[i%entries.length][0]]++;
  return result;
}
function damage(world:SharedWorld,actor:Actor,amount:number,deaths:Death[],extra:Partial<WorldEvent>={}) {
  const e=world.enemy;
  if(e.hp<=0 || e.behavior==="return") return 0;
  const dealt=Math.min(e.hp,amount);
  e.hp-=dealt; e.contribution[actor.character.id]=(e.contribution[actor.character.id] || 0)+dealt;
  event(world,"hit",e.position,{amount:dealt,actorId:actor.character.id,enemyId:e.id,targetPosition:copy(e.position),...extra});
  if(e.behavior==="neutral") {e.behavior="chase";e.attackIn=spatialLayout().tuning.attackInterval;}
  if(e.hp===0 && !e.rewarded) {
    e.rewarded=true;e.respawnAt=Date.now()+30000;
    deaths.push({lifeId:e.lifeId,winnerId:actor.character.id,money:30,xp:0});
    actor.game.state.money+=30;
    event(world,"enemy_down",e.position,{actorId:actor.character.id,enemyId:e.id,rewards:{money:30,xp:0}});
  }
  return dealt;
}
export function cast(world:SharedWorld,actor:Actor,command:string,aim:Point|undefined,target:Point|undefined,deaths:Death[],resolveMove:(from:Point,to:Point)=>Point=(from,to)=>spatialMove(from,to,3)) {
  const state=actor.game.state,c=state.arcanaCombat,t=spatialLayout().tuning;
  if (command==="spatial_sync") return;
  if (command==="dodge" || command==="teleport") {
    if (c.cooldowns[command]>1e-8 || !aim || Math.hypot(aim.x,aim.y)<.001) throw new OnlineError("skill_unavailable","지금은 이동 기술을 사용할 수 없습니다.");
    const length=Math.hypot(aim.x,aim.y);
    const origin=copy(actor.position);
    const next={x:actor.position.x+aim.x/length*28,y:actor.position.y+aim.y/length*28};
    actor.position=resolveMove(actor.position,next);actor.previous=copy(actor.position);
    c.cooldowns[command]=command==="teleport"?0:5;c.evadeSkill=command;c.evadeSeconds=command==="dodge"?.8:.18;
    event(world,"evade",actor.position,{actorId:actor.character.id,targetPlayerId:actor.character.id,direction:aim,movement:command,sourcePosition:origin});
    return;
  }
  if(command==="potion") {
    if(c.cooldowns.potion>0 || c.mp>=30 || !(state.inventory.manaPotion>0)) throw new OnlineError("potion_unavailable","사용 가능한 포션을 확인해 주세요.");
    state.inventory.manaPotion--;c.mp=Math.min(30,c.mp+20);c.cooldowns.potion=5;
    return;
  }
  if(!isArcanaSpell(command)) throw new OnlineError("invalid_command","공용 전투에서 지원하지 않는 입력입니다.",400);
  if(!inField(actor) || actor.bench || state.npcDialogue.active) throw new OnlineError("combat_unavailable","현재 위치에서는 공격할 수 없습니다.");
  if(command==="flame_guard") {castFlameGuard(state);event(world,"guard",actor.position,{actorId:actor.character.id});return;}
  const spell=effectiveSpell(state,command),range=spell.rangeTiles*t.tile;
  if(world.enemy.behavior==="return") throw new OnlineError("enemy_returning","슬라임이 원래 자리로 돌아가고 있습니다.");
  if(command==="meteor") {
    if(!target || distance(actor.position,target)>range || spatialWall(actor.position,target,0)!==null) throw new OnlineError("invalid_target","사거리 안의 지점을 선택해 주세요.",400);
    spendSpell(state,command);
    const meteor={id:crypto.randomUUID(),ownerId:actor.character.id,position:copy(target),remaining:1,damage:spellMagnitude(state,command)};
    world.meteors.push(meteor);event(world,"meteor_warning",target,{actorId:actor.character.id,projectileId:meteor.id});
  } else if(command==="flame_barrage") {
    if(world.enemy.hp<=0 || distance(actor.position,world.enemy.position)>range || spatialWall(actor.position,world.enemy.position,0)!==null) throw new OnlineError("no_target","사거리 안에 적이 없습니다.");
    spendSpell(state,command);world.barrages.push({ownerId:actor.character.id,remaining:12,nextIn:0,damage:spellMagnitude(state,command)});
  } else {
    if(!aim || Math.hypot(aim.x,aim.y)<.001) throw new OnlineError("invalid_aim","발사 방향을 선택해 주세요.",400);
    spendSpell(state,command);
    if(command==="flame_wave") {
      event(world,"wave",actor.position,{actorId:actor.character.id,direction:aim});
      const e=world.enemy;
      if(circleIntersectsCone(actor.position,aim,e.position,t.enemyRadius,range,ARCANA_SPELLS.flame_wave.angle) && spatialWall(actor.position,e.position,0)===null) trainArcanaSkill(state,command,damage(world,actor,spellMagnitude(state,command),deaths));
    } else projectile(world,actor,command,aim,spellMagnitude(state,command));
  }
}
export function tickCombat(world:SharedWorld,actors:Map<string,Actor>,seconds:number,deaths:Death[]) {
  const t=spatialLayout().tuning,e=world.enemy;
  for(const actor of actors.values()) {
    const c=actor.game.state.arcanaCombat;
    tickSpellTimers(actor.game.state,seconds);c.evadeSeconds=Math.max(0,c.evadeSeconds-seconds);
    c.mp=Math.min(30,c.mp+seconds*1000/GAME_HOUR_MS*12);
  }
  if(e.hp<=0 && Date.now()>=e.respawnAt) {world.enemy=newEnemy();event(world,"reset",world.enemy.position);return;}
  const candidates=[...actors.values()].filter(a=>inField(a) && a.game.state.arcanaCombat.hp>0 && distance(a.position,e.position)<=t.chaseLimit && e.contribution[a.character.id]>0).sort((a,b)=>(e.contribution[b.character.id]||0)-(e.contribution[a.character.id]||0) || a.character.id.localeCompare(b.character.id));
  const target=candidates[0];
  e.targetId=target?.character.id || null;
  const before=copy(e.position);
  if(e.hp>0) {
    if(!target && e.behavior!=="neutral") {e.behavior="return";e.targetLocked=false;}
    if(e.behavior==="return") {
      e.position=spatialRoute(e.position,e.home,t.returnSpeed*seconds,t.enemyRadius);
      if(distance(e.position,e.home)<.5) {e.position=copy(e.home);e.hp=e.maxHp;e.behavior="neutral";e.contribution={};e.attackIn=t.attackInterval;event(world,"reset",e.position);}
    } else if(target) {
      if(e.behavior!=="attack") {
        e.attackIn=Math.max(0,e.attackIn-seconds);
        if(e.attackIn>3) {e.behavior="chase";if(distance(e.position,target.position)>t.jumpRange*.75)e.position=spatialRoute(e.position,target.position,t.chaseSpeed*seconds,t.enemyRadius);}
        else {
          e.behavior="prepare";
          if(!e.targetLocked) {
            e.jumpFrom=copy(e.position);
            const length=distance(e.position,target.position), destination=mix(e.position,target.position,Math.min(1,t.jumpRange/Math.max(.001,length)));
            e.jumpTo=spatialMove(e.position,destination,t.enemyRadius);
            if(e.attackIn<=1)e.targetLocked=true;
          }
          if(e.attackIn<=0) {e.behavior="attack";e.jumpElapsed=0;e.jumpHit=false;}
        }
      }
      if(e.behavior==="attack") {
        e.jumpElapsed=Math.min(t.jumpDuration,e.jumpElapsed+seconds);
        e.position=mix(e.jumpFrom,e.jumpTo,e.jumpElapsed/t.jumpDuration);
        if(!e.jumpHit && sweptCircle(before,e.position,target.previous,target.position,t.enemyRadius+t.playerRadius)!==null) {
          e.jumpHit=true;
          if(target.game.state.arcanaCombat.evadeSeconds>0) {trainArcanaSkill(target.game.state,target.game.state.arcanaCombat.evadeSkill,10);event(world,"evade",target.position,{targetPlayerId:target.character.id});}
          else {
            const result=absorbArcanaDamage(target.game.state,5);
            if(result.absorbed)event(world,"absorb",target.position,{amount:result.absorbed,targetPlayerId:target.character.id});
            if(result.hurt)event(world,"hurt",target.position,{amount:result.hurt,targetPlayerId:target.character.id});
            if(target.game.state.arcanaCombat.hp<=0) {
              target.game.state.arcanaCombat.hp=30;clearFlameGuard(target.game.state);
              target.position=copy(spatialLayout().spawn);target.previous=copy(target.position);target.place={location:"arcana_plaza",interior:"",floor:0};
              target.game.state.location="arcana_plaza";delete e.contribution[target.character.id];
              event(world,"defeat",target.position,{targetPlayerId:target.character.id});
            }
          }
        }
        if(e.jumpElapsed>=t.jumpDuration) {e.behavior="chase";e.attackIn=t.attackInterval-t.jumpDuration;e.targetLocked=false;e.jumpHit=false;}
      }
    }
  }
  for(const meteor of [...world.meteors]) {
    meteor.remaining-=seconds;
    if(meteor.remaining<=0) {
      const owner=actors.get(meteor.ownerId);
      event(world,"meteor",meteor.position,{actorId:meteor.ownerId,projectileId:meteor.id});
      if(owner && inField(owner) && distance(e.position,meteor.position)<=2*t.tile+t.enemyRadius && spatialWall(meteor.position,e.position,0)===null)damage(world,owner,meteor.damage,deaths);
      world.meteors=world.meteors.filter(m=>m.id!==meteor.id);
    }
  }
  for(const barrage of [...world.barrages]) {
    const owner=actors.get(barrage.ownerId);barrage.nextIn-=seconds;
    if(!owner || !inField(owner) || e.hp<=0 || distance(owner.position,e.position)>8*t.tile) barrage.remaining=0;
    if(barrage.remaining>0 && barrage.nextIn<=0) {projectile(world,owner!,"flame_barrage",{x:e.position.x-owner!.position.x,y:e.position.y-owner!.position.y},barrage.damage,e.id);barrage.remaining--;barrage.nextIn+=.2;}
    if(barrage.remaining===0)world.barrages=world.barrages.filter(b=>b!==barrage);
  }
  for(const shot of [...world.projectiles]) {
    const owner=actors.get(shot.ownerId);
    if(!owner || !inField(owner)) {world.projectiles=world.projectiles.filter(p=>p.id!==shot.id);continue;}
    if(shot.spellId==="flame_barrage" && e.hp>0) {const length=distance(shot.position,e.position);if(length>.001)shot.direction={x:(e.position.x-shot.position.x)/length,y:(e.position.y-shot.position.y)/length};}
    const travel=Math.min(shot.remaining,t.projectileSpeed*seconds),next={x:shot.position.x+shot.direction.x*travel,y:shot.position.y+shot.direction.y*travel};
    const wall=spatialWall(shot.position,next,shot.radius || t.projectileRadius),hit=e.hp>0 && !shot.hitIds.includes(e.id)?sweptCircle(shot.position,next,before,e.position,(shot.radius || t.projectileRadius)+t.enemyRadius):null;
    let spent=false;
    if(hit!==null && (wall===null || hit<wall)) {
      const dealt=damage(world,owner,shot.damage,deaths,{projectileId:shot.id,direction:shot.direction});
      if(dealt>0 && shot.spellId==="fireball" && !shot.masteryAwarded) {trainArcanaSkill(owner.game.state,"fireball",10);shot.masteryAwarded=true;}
      if(shot.explode)event(world,"explosion",e.position,{actorId:shot.ownerId,projectileId:shot.id});
      shot.hitIds.push(e.id);spent=shot.hitIds.length>=shot.pierce;
    }
    shot.position=next;shot.remaining-=travel;
    if(spent || wall!==null || shot.remaining<=0) {if(!spent)event(world,"miss",shot.position,{projectileId:shot.id});world.projectiles=world.projectiles.filter(p=>p.id!==shot.id);}
  }
  for(const actor of actors.values())actor.previous=copy(actor.position);
}
