import { awardSlimeLoot } from "./arcana-economy";
import { fireballSpecialization } from "./arcana-skill-tree";
import { trainArcanaSkill } from "./arcana-skill-training";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { GameState } from "./schemas";
import type { ArcanaSpatial, SpatialEnemy, CombatPoint as Point } from "./schemas/arcana-spatial";
import { appendLogEntry } from "./state-utils";
import { ARCANA_SPELLS, isUltimate, type ArcanaSpellId, effectiveSpell, absorbArcanaDamage, clearFlameGuard, spellMagnitude, spendSpell, tickSpellTimers } from "./arcana-spells";

type Battle = NonNullable<GameState["arcanaCombat"]["battle"]>;
type Layout = { home: Point; spawn: Point; rectangles: { x: number; y: number; w: number; h: number }[]; circles: (Point & { radius: number; localRadius: number; inverse: number[] })[]; bounds: { x: number; y: number; w: number; h: number }; tuning: { tile: number; range: number; projectileSpeed: number; projectileRadius: number; enemyRadius: number; playerRadius: number; chaseLimit: number; chaseSpeed: number; returnSpeed: number; jumpRange: number; jumpDuration: number; attackInterval: number } };
let cachedLayout: Layout | undefined;
export function spatialLayout(): Layout {
  return cachedLayout ??= JSON.parse(readFileSync(resolve(process.cwd(), "godot-arcana/art/export/combat-layout.json"), "utf8"));
}
const copy = (p: Point): Point => ({ x: p.x, y: p.y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function towards(a: Point, b: Point, budget: number): Point { return mix(a, b, Math.min(1, budget / Math.max(1e-9, distance(a, b)))); }
// Relative swept circles prevent fast projectiles and crossing actors tunnelling.
export function sweptCircle(a: Point, b: Point, c: Point, d: Point, radius: number): number | null {
  const x = a.x - c.x, y = a.y - c.y, vx = b.x - a.x - d.x + c.x, vy = b.y - a.y - d.y + c.y;
  const cc = x*x + y*y - radius*radius, aa = vx*vx + vy*vy;
  if (cc <= 0) return 0;
  if (aa < 1e-12) return null;
  const bb = 2*(x*vx+y*vy), disc = bb*bb-4*aa*cc;
  if (disc < 0) return null;
  const t = (-bb-Math.sqrt(disc))/(2*aa);
  return t >= 0 && t <= 1 ? t : null;
}
function blocked(p: Point, radius: number): boolean {
  const l = spatialLayout(), bounds = l.bounds;
  if (p.x < bounds.x+radius || p.y < bounds.y+radius || p.x > bounds.x+bounds.w-radius || p.y > bounds.y+bounds.h-radius) return true;
  return l.circles.some(c => {
    const [xx,xy,yx,yy,ox,oy] = c.inverse;
    return Math.hypot(xx*p.x+yx*p.y+ox,xy*p.x+yy*p.y+oy) < c.localRadius+radius*Math.max(Math.hypot(xx,xy),Math.hypot(yx,yy));
  }) || l.rectangles.some(r => {
    const x = Math.max(r.x,Math.min(r.x+r.w,p.x)), y = Math.max(r.y,Math.min(r.y+r.h,p.y));
    return Math.hypot(p.x-x,p.y-y) < radius;
  });
}
function move(a: Point, b: Point, radius: number): Point {
  let result = copy(a);
  const steps = Math.max(1,Math.ceil(distance(a,b)/1.0));
  for (let i=1;i<=steps;i++) {
    const next = mix(a,b,i/steps);
    if (!blocked(next,radius)) result = next;
    else {
      const x = {x:next.x,y:result.y}, y = {x:result.x,y:next.y};
      if (!blocked(x,radius)) result = x;
      if (!blocked(y,radius)) result = y;
    }
  }
  return result;
}
function wallFraction(a: Point, b: Point, radius: number): number | null {
  const steps = Math.max(1,Math.ceil(distance(a,b)/.75));
  for (let i=0;i<=steps;i++) if (blocked(mix(a,b,i/steps),radius)) return i/steps;
  return null;
}
export function spatialEvent(b: Battle, kind: ArcanaSpatial["events"][number]["kind"], position: Point, amount = 0, projectileId?: string, direction?: Point, rewards?: { xp: number; money: number; slimeMucus?: number }, targetPosition?: Point, enemyId?: string) {
  const s = b.spatial!;
  s.events.push({ id: ++s.revision, kind, position:copy(position), amount, ...(projectileId ? {projectileId} : {}), ...(direction ? {direction:copy(direction)} : {}), ...(rewards ? {rewards} : {}), ...(targetPosition ? {targetPosition:copy(targetPosition)} : {}),...(enemyId ? {enemyId}: {}) });
  s.events = s.events.slice(-32);
}
export function createSpatialBattle(state: GameState, player: Point) {
  const home = spatialLayout().home;
  if (blocked(player, 3) || distance(player,home)>spatialLayout().tuning.chaseLimit) throw new Error("슬라임 가까이의 이동 가능한 위치에서 사용해 주세요.");
  state.arcanaCombat.battle = { id:randomUUID(),phase:"ready",enemyHp:30,attackIn:6,paused:false,log:[],spatial:{ encounterId:"plaza_slime",enemy:copy(home),home:copy(home),player:copy(player),previousPlayer:copy(player),behavior:"neutral",jumpFrom:copy(home),jumpTo:copy(home),jumpHit:false,jumpElapsed:0,targetLocked:false,elapsed:0,revision:0,enemies:[],primaryEnemyId:"slime_0",meteors:[],barrage:null,projectiles:[],events:[] } };
  // Combat activates the slime already visible in the plaza.
  ensureSpatialEnemies(state.arcanaCombat.battle!);

}
export function acceptSpatialPosition(state: GameState, point: Point, seconds: number, resume = false, speedMultiplier = 1) {
  const s = state.arcanaCombat.battle?.spatial;
  if (!s) return;
  const t = spatialLayout().tuning;
  s.previousPlayer = copy(s.player);
  // The client animates toward the authoritative dash endpoint for .18s.
  // Ignore intermediate predicted positions so sync cannot pull it backwards.
  if (state.arcanaCombat.cooldowns.dodge > 4.8 || state.arcanaCombat.cooldowns.teleport > 4.84) return;
  // A reconnect cannot teleport an active fighter through the enemy or terrain.
  const maxMove = resume && s.behavior === "neutral" ? Infinity : 48*speedMultiplier*Math.min(.5,Math.max(0,seconds))+.75;
  s.player = move(s.player,towards(s.player,point,maxMove),3);
}
export function moveSpatialSkill(state: GameState, aim: Point) {
  const b = state.arcanaCombat.battle, s = b?.spatial;
  if (!s) return;
  const length = Math.hypot(aim.x, aim.y);
  if (length < .001) throw new Error("대시 방향을 선택해 주세요.");
  s.previousPlayer = copy(s.player);
  s.player = move(s.player, { x: s.player.x + aim.x / length * 28, y: s.player.y + aim.y / length * 28 }, 3);
}
function makeEnemy(id:string, point:Point):SpatialEnemy {
  return {id,position:copy(point),home:copy(point),hp:30,maxHp:30,attackIn:6,behavior:"neutral",jumpFrom:copy(point),jumpTo:copy(point),jumpHit:false,jumpElapsed:0,targetLocked:false,rewarded:false};
}
export function ensureSpatialEnemies(b:Battle) {
  const s=b.spatial;
  if (!s) return;
  if (!s.enemies.length) s.enemies=[{...makeEnemy("slime_0",s.home),position:copy(s.enemy),hp:b.enemyHp,attackIn:b.attackIn,behavior:s.behavior,jumpFrom:copy(s.jumpFrom),jumpTo:copy(s.jumpTo),jumpHit:s.jumpHit,jumpElapsed:s.jumpElapsed,targetLocked:s.targetLocked,rewarded:b.enemyHp<=0}];
  // Repair saved plaza encounters created with two unintended extra slimes.
  // Keep the displayed primary enemy's health, position and attack progress.
  if (s.encounterId === "plaza_slime" && s.enemies.length > 1) {
    const primary = s.enemies.find(e => e.id === s.primaryEnemyId) ?? s.enemies[0];
    s.enemies = [primary];
    selectProjection(b, primary);
  }
  for (const p of s.projectiles) {p.hitIds ??=[];p.spellId ??="fireball";p.pierce ??=1;p.explode ??=false;p.masteryAwarded ??=false;}
}
function selectProjection(b:Battle,e:SpatialEnemy) {
  const s=b.spatial!;
  s.primaryEnemyId=e.id;s.enemy=copy(e.position);s.home=copy(e.home);s.behavior=e.behavior;s.jumpFrom=copy(e.jumpFrom);s.jumpTo=copy(e.jumpTo);s.jumpHit=e.jumpHit;s.jumpElapsed=e.jumpElapsed;s.targetLocked=e.targetLocked;b.enemyHp=e.hp;b.attackIn=e.attackIn;
}
function storeProjection(b:Battle,e:SpatialEnemy) {
  const s=b.spatial!;
  e.position=copy(s.enemy);e.hp=b.enemyHp;e.attackIn=b.attackIn;e.behavior=s.behavior;e.jumpFrom=copy(s.jumpFrom);e.jumpTo=copy(s.jumpTo);e.jumpHit=s.jumpHit;e.jumpElapsed=s.jumpElapsed;e.targetLocked=s.targetLocked;
}
function refreshProjection(b:Battle) {const s=b.spatial!; const e=s.enemies.find(enemy=>enemy.hp>0) ?? s.enemies[0];if(e) selectProjection(b,e);}
export function returnSpatialBattle(b:Battle) {
  const s=b.spatial!;
  ensureSpatialEnemies(b);
  s.projectiles=[];s.meteors=[];s.barrage=null;
  for(const e of s.enemies) if(e.hp>0) {e.behavior="return";e.targetLocked=false;e.jumpHit=false;}
  s.behavior="return";s.targetLocked=false;s.jumpHit=false;b.phase="ready";b.attackIn=6;
  spatialEvent(b,"return",s.enemy);
}
function validTargets(b:Battle, origin:Point, range:number) {
  return b.spatial!.enemies.filter(e=>e.hp>0 && e.behavior!=="return" && distance(origin,e.position)<=range && wallFraction(origin,e.position,0)===null);
}
function nextBarrageTarget(b:Battle, origin:Point) {
  return validTargets(b,origin,8*spatialLayout().tuning.tile).filter(e=>!b.spatial!.visibleEnemyIds || b.spatial!.visibleEnemyIds.includes(e.id)).sort((a,b)=>a.hp-b.hp || distance(origin,a.position)-distance(origin,b.position))[0];
}
function projectile(state:GameState, id:"fireball"|"giant_fireball"|"flame_barrage", direction:Point, damage:number,targetId?:string) {
  const b=state.arcanaCombat.battle!,s=b.spatial!,t=spatialLayout().tuning;
  const length=Math.hypot(direction.x,direction.y);
  const p={id:randomUUID(),position:copy(s.player),origin:copy(s.player),direction:{x:length>.001?direction.x/length:1,y:length>.001?direction.y/length:0},remaining:effectiveSpell(state,id).rangeTiles*t.tile,damage,spellId:id,radius:t.projectileRadius*(id==="giant_fireball"?2:1),hitIds:[] as string[],masteryAwarded:false,pierce:id==="fireball" && fireballSpecialization(state,"reach")?3:1,explode:id==="fireball" && fireballSpecialization(state,"burst"),...(targetId?{targetId}:{})};
  s.projectiles.push(p);spatialEvent(b,"cast",s.player,0,p.id,p.direction);
}
export function castSpatialFireball(state:GameState,aim:Point) {
  const b=state.arcanaCombat.battle!,s=b.spatial!;
  if(b.paused || s.behavior==="return" || ["victory","defeat"].includes(b.phase)) throw new Error("현재는 마법을 발사할 수 없습니다.");
  if(Math.hypot(aim.x,aim.y)<.001) throw new Error("발사 방향을 선택해 주세요.");
  ensureSpatialEnemies(b);spendSpell(state,"fireball");projectile(state,"fireball",aim,spellMagnitude(state,"fireball"));
}
export function castSpatialUltimate(state:GameState,id:ArcanaSpellId,aim?:Point,target?:Point) {
  const b=state.arcanaCombat.battle!,s=b.spatial!,range=8*spatialLayout().tuning.tile;
  if(!isUltimate(id) || b.paused || s.behavior==="return" || ["victory","defeat"].includes(b.phase)) throw new Error("현재는 궁극기를 사용할 수 없습니다.");
  ensureSpatialEnemies(b);
  const targets=validTargets(b,s.player,range).sort((a,b)=>distance(s.player,a.position)-distance(s.player,b.position));
  if(id==="meteor") {
    const point=target ?? targets[0]?.position;
    if(!point || distance(s.player,point)>range+.01 || blocked(point,0) || wallFraction(s.player,point,0)!==null) throw new Error("사거리 안의 유효한 낙하 지점을 선택해 주세요.");
    spendSpell(state,id);const meteor={id:randomUUID(),position:copy(point),remaining:1,damage:spellMagnitude(state,id)};
    s.meteors.push(meteor);spatialEvent(b,"meteor_warning",point,0,meteor.id);
  } else if(id==="giant_fireball") {
    const direction=aim ?? (targets[0]?{x:targets[0].position.x-s.player.x,y:targets[0].position.y-s.player.y}:undefined);
    if(!direction || Math.hypot(direction.x,direction.y)<.001) throw new Error("유효한 발사 방향을 선택해 주세요.");
    spendSpell(state,id);projectile(state,id,direction,spellMagnitude(state,id));
  } else {
    if(!nextBarrageTarget(b,s.player)) throw new Error("사거리 안에 보이는 적이 없습니다.");
    spendSpell(state,id);s.barrage={remaining:12,nextIn:0,damage:spellMagnitude(state,id)};
  }
}
function damageEnemy(state:GameState,b:Battle,e:SpatialEnemy,amount:number,projectileId?:string,direction?:Point,impact?:Point) {
  if(e.hp<=0 || e.behavior==="return") return 0;
  const damage=Math.min(e.hp,amount);e.hp=Math.max(0,e.hp-amount);
  spatialEvent(b,"hit",impact ?? e.position,damage,projectileId,direction,undefined,e.position,e.id);
  if(e.behavior==="neutral") {e.behavior="chase";e.attackIn=spatialLayout().tuning.attackInterval;b.phase="battle";}
  if(e.hp<=0 && !e.rewarded) {
    e.rewarded=true;awardSlimeLoot(state);
    spatialEvent(b,"enemy_down",e.position,0,undefined,undefined,{xp:0,money:0,slimeMucus:1},undefined,e.id);
  }
  return damage;
}
function finishVictory(state:GameState,b:Battle) {
  const s=b.spatial!;if(s.enemies.some(e=>e.hp>0) || b.phase==="victory") return;
  b.phase="victory";b.paused=true;s.projectiles=[];s.meteors=[];s.barrage=null;clearFlameGuard(state);
  appendLogEntry(state,"슬라임 무리를 처치했다. 처치한 적마다 슬라임의 점액질 1개를 획득했다.");
  spatialEvent(b,"victory",s.enemy);refreshProjection(b);
}
// Exact closest point on a circular sector, including its two radial edges.
export function circleIntersectsCone(origin: Point, direction: Point, center: Point, radius: number, range: number, angleDegrees = 90) {
  const dx = center.x-origin.x, dy = center.y-origin.y, length = Math.hypot(direction.x,direction.y);
  if (length < .001) return false;
  const x = (dx*direction.x+dy*direction.y)/length;
  const y = Math.abs((dy*direction.x-dx*direction.y)/length);
  const half = angleDegrees*Math.PI/360, d = Math.hypot(x,y);
  if (Math.atan2(y,x) <= half) return d <= range+radius;
  const along = Math.max(0,Math.min(range,x*Math.cos(half)+y*Math.sin(half)));
  return Math.hypot(x-along*Math.cos(half),y-along*Math.sin(half)) <= radius;
}
export function castSpatialFlameWave(state: GameState, aim: Point) {
  const b = state.arcanaCombat.battle!, s = b.spatial!, t = spatialLayout().tuning;
  if (b.paused || s.behavior === "return" || ["victory","defeat"].includes(b.phase)) throw new Error("현재는 마법을 발사할 수 없습니다.");
  const length = Math.hypot(aim.x,aim.y);
  if (length < .001) throw new Error("발사 방향을 선택해 주세요.");
  const direction = {x:aim.x/length,y:aim.y/length};
  spendSpell(state,"flame_wave");
  spatialEvent(b,"wave",s.player,0,undefined,direction);
  ensureSpatialEnemies(b);
  let contribution=0;
  for(const e of s.enemies) if(circleIntersectsCone(s.player,direction,e.position,t.enemyRadius,effectiveSpell(state,"flame_wave").rangeTiles*t.tile,ARCANA_SPELLS.flame_wave.angle) && wallFraction(s.player,e.position,0)===null) contribution+=damageEnemy(state,b,e,spellMagnitude(state,"flame_wave"));
  trainArcanaSkill(state,"flame_wave",contribution);finishVictory(state,b);refreshProjection(b);
}
export function tickSpatialCombat(state: GameState, seconds: number) {
  const b = state.arcanaCombat.battle!, s = b.spatial!, c = state.arcanaCombat, t = spatialLayout().tuning;
  if (b.paused || b.phase === "victory" || b.phase === "defeat") return;
  ensureSpatialEnemies(b);
  const start = copy(s.previousPlayer), end = copy(s.player);
  let elapsed = 0;
  while (elapsed < seconds-1e-8) {
    const dt = Math.min(1/60,seconds-elapsed), playerBefore = mix(start,end,elapsed/Math.max(seconds,1e-9));
    elapsed += dt; s.elapsed += dt; s.revision++;
    const player = mix(start,end,elapsed/Math.max(seconds,1e-9));
    tickSpellTimers(state,dt);
    const evading = c.evadeSeconds > 0;
    c.evadeSeconds = Math.max(0,c.evadeSeconds-dt);
    const beforePositions = new Map(s.enemies.map(e=>[e.id,copy(e.position)]));
    for (const enemy of s.enemies) {
      if(enemy.hp<=0) continue;
      selectProjection(b,enemy);
    if (!["neutral","return"].includes(s.behavior) && distance(player,s.enemy) > t.chaseLimit) { clearFlameGuard(state); returnSpatialBattle(b); }
    const enemyBefore = copy(s.enemy);
    if (s.behavior === "return") {
      const destination = towards(s.enemy,s.home,t.returnSpeed*dt);
      s.enemy = move(s.enemy,destination,t.enemyRadius);
      // Collision-following fallback avoids getting stuck on a corner on the return path.
      if (distance(s.enemy,destination) > .1) s.enemy = returnWaypoint(s.enemy,s.home,t.returnSpeed*dt,t.enemyRadius);
      if (distance(s.enemy,s.home)<.5) {
        s.enemy = copy(s.home); b.enemyHp = 30; s.behavior = "neutral"; s.targetLocked = false;
        spatialEvent(b,"reset",s.enemy);
      }
    } else if (b.phase === "battle") {
      if (s.behavior !== "attack") {
        b.attackIn = Math.max(0,b.attackIn-dt);
        if (b.attackIn > 3) {
          s.behavior = "chase";
          if (distance(s.enemy,player)>t.jumpRange*.75) s.enemy = returnWaypoint(s.enemy,player,t.chaseSpeed*dt,t.enemyRadius);
        } else {
          s.behavior = "prepare";
          if (!s.targetLocked) {
            s.jumpFrom = copy(s.enemy);
            const target = towards(s.enemy,player,t.jumpRange), wall = wallFraction(s.enemy,target,t.enemyRadius);
            s.jumpTo = wall === null ? target : mix(s.enemy,target,Math.max(0,wall-1/Math.max(1,distance(s.enemy,target))));
            if (b.attackIn <= 1) s.targetLocked = true;
          }
          // The first damaging movement begins after the complete six-second grace.
          if (b.attackIn <= 1e-8) { s.behavior = "attack"; s.jumpElapsed = 0; }
        }
      }
      if (s.behavior === "attack") {
        s.jumpElapsed = Math.min(t.jumpDuration,s.jumpElapsed+dt);
        s.enemy = mix(s.jumpFrom,s.jumpTo,s.jumpElapsed/t.jumpDuration);
        if (!s.jumpHit && sweptCircle(enemyBefore,s.enemy,playerBefore,player,t.enemyRadius+t.playerRadius) !== null) {
          s.jumpHit = true;
          if (evading) { trainArcanaSkill(state,c.evadeSkill,10); spatialEvent(b,"evade",player); }
          else {
            const damage = absorbArcanaDamage(state,5);
            if (damage.absorbed) spatialEvent(b,"absorb",player,damage.absorbed);
            if (damage.hurt) spatialEvent(b,"hurt",player,damage.hurt);
            if (c.hp <= 0) {
              b.phase = "defeat"; b.paused = true; s.projectiles = [];
              clearFlameGuard(state);
              c.hp = 30;
              state.location = "arcana_plaza"; state.sceneId = "arcana_plaza_repeat_intro"; state.activeEventId = null;
              s.player = copy(spatialLayout().spawn); s.previousPlayer = copy(s.player);
              appendLogEntry(state,"슬라임에게 패배해 광장으로 귀환했다. 스킬 숙련도는 유지된다.");
              spatialEvent(b,"defeat",player); break;
            }
          }
        }
        if (s.jumpElapsed >= t.jumpDuration) {
          b.attackIn = t.attackInterval-t.jumpDuration;
          s.targetLocked = false; s.jumpHit = false; s.behavior = "chase";
        }
      }
    }
      storeProjection(b,enemy);
    }
    if(b.phase === "defeat") {s.meteors=[];s.barrage=null;break;}
    refreshProjection(b);
    for(const meteor of [...s.meteors]) {
      meteor.remaining=Math.max(0,meteor.remaining-dt);
      if(meteor.remaining<=1e-8) {
        spatialEvent(b,"meteor",meteor.position,0,meteor.id);
        for(const e of s.enemies) if(distance(e.position,meteor.position)<=2*t.tile+t.enemyRadius && wallFraction(meteor.position,e.position,0)===null) damageEnemy(state,b,e,meteor.damage);
        s.meteors=s.meteors.filter(m=>m.id!==meteor.id);
      }
    }
    if(s.barrage) {
      s.barrage.nextIn-=dt;
      while(s.barrage && s.barrage.nextIn<=1e-8 && s.barrage.remaining>0) {
        const target=nextBarrageTarget(b,player);
        if(target) projectile(state,"flame_barrage",{x:target.position.x-player.x,y:target.position.y-player.y},s.barrage.damage,target.id);
        s.barrage.remaining--;s.barrage.nextIn+=.2;
        if(!s.barrage.remaining) s.barrage=null;
      }
    }
    for(const p of [...s.projectiles]) {
      if(p.spellId==="flame_barrage") {
        const current=s.enemies.find(e=>e.id===p.targetId && e.hp>0 && e.behavior!=="return" && distance(player,e.position)<=8*t.tile);
        const target=current ?? nextBarrageTarget(b,player);
        if(!target) {s.projectiles=s.projectiles.filter(q=>q.id!==p.id);spatialEvent(b,"miss",p.position,0,p.id);continue;}
        p.targetId=target.id;
        const length=distance(p.position,target.position);
        if(length>.001) p.direction={x:(target.position.x-p.position.x)/length,y:(target.position.y-p.position.y)/length};
      }
      const travel=Math.min(p.remaining,t.projectileSpeed*dt), next={x:p.position.x+p.direction.x*travel,y:p.position.y+p.direction.y*travel};
      const radius=p.radius ?? t.projectileRadius, wall=wallFraction(p.position,next,radius);
      const hits=s.enemies.filter(e=>e.hp>0 && e.behavior!=="return" && !p.hitIds.includes(e.id)).map(e=>({e,fraction:sweptCircle(p.position,next,beforePositions.get(e.id) ?? e.position,e.position,t.enemyRadius+radius)})).filter((hit):hit is {e:SpatialEnemy;fraction:number} => hit.fraction!==null && (wall===null || hit.fraction<wall)).sort((a,b)=>a.fraction-b.fraction);
      let spent=false;
      for(const hit of hits) {
        if(hit.e.hp<=0) continue;
        const impact=mix(p.position,next,hit.fraction);
        let contribution=damageEnemy(state,b,hit.e,p.damage,p.id,p.direction,impact);
        p.hitIds.push(hit.e.id);
        if(p.explode) {
          spatialEvent(b,"explosion",hit.e.position,0,p.id);
          for(const e of s.enemies) if(e.id!==hit.e.id && distance(e.position,hit.e.position)<=t.tile+t.enemyRadius && wallFraction(hit.e.position,e.position,0)===null) contribution+=damageEnemy(state,b,e,Math.floor(p.damage*.5));
        }
        if(p.spellId==="fireball" && contribution>0 && !p.masteryAwarded) {trainArcanaSkill(state,"fireball",10);p.masteryAwarded=true;}
        if(p.hitIds.length>=p.pierce) {spent=true;break;}
      }
      p.position=next;p.remaining=Math.max(0,p.remaining-travel);
      if(spent || wall!==null || p.remaining<=1e-8) {
        if(!spent) spatialEvent(b,"miss",wall===null?next:mix({x:next.x-p.direction.x*travel,y:next.y-p.direction.y*travel},next,wall),0,p.id);
        s.projectiles=s.projectiles.filter(q=>q.id!==p.id);
      }
    }
    finishVictory(state,b);refreshProjection(b);
    if(!s.enemies.some(e=>e.hp>0)) break;
  }
  s.previousPlayer = copy(s.player);
}
// Cache the same footprint grid for pursuit and return. A* is only needed when
// the direct segment is blocked, rather than rebuilding a visibility graph per step.
const routeCache = new Map<string, Point[]>();
let navigation: boolean[] | undefined;
function returnWaypoint(from: Point, goal: Point, budget: number, radius: number): Point {
  if (wallFraction(from,goal,radius) === null) return move(from,towards(from,goal,budget),radius);
  const tile = 8, l = spatialLayout(), width = Math.ceil((l.bounds.x+l.bounds.w)/tile), height = Math.ceil((l.bounds.y+l.bounds.h)/tile);
  const center = (id: number): Point => ({x:(id%width+.5)*tile,y:(Math.floor(id/width)+.5)*tile});
  navigation ??= Array.from({length:width*height},(_,id) => !blocked(center(id),radius+1));
  const cell = (p: Point) => Math.max(0,Math.min(height-1,Math.floor(p.y/tile)))*width+Math.max(0,Math.min(width-1,Math.floor(p.x/tile)));
  const start = cell(from), end = cell(goal), key = start+":"+end;
  let route = routeCache.get(key);
  if (!route) {
    const open = [start], costs = new Map<number,number>([[start,0]]), previous = new Map<number,number>(), visited = new Set<number>();
    let finish = start, best = distance(from,goal);
    while (open.length && visited.size < 12000) {
      open.sort((a,b) => costs.get(b)!+distance(center(b),goal)-costs.get(a)!-distance(center(a),goal));
      const at = open.pop()!;
      if (visited.has(at)) continue;
      visited.add(at);
      const remaining = distance(center(at),goal);
      if (remaining < best) { best = remaining; finish = at; }
      if (at === end || remaining < tile) { finish = at; break; }
      const x = at%width, y = Math.floor(at/width);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = x+dx, ny = y+dy, next = ny*width+nx;
        if (nx<0 || ny<0 || nx>=width || ny>=height || !navigation[next] || visited.has(next)) continue;
        if (dx && dy && (!navigation[y*width+nx] || !navigation[ny*width+x])) continue;
        const cost = costs.get(at)!+Math.hypot(dx,dy)*tile;
        if (cost < (costs.get(next) ?? Infinity)) { costs.set(next,cost); previous.set(next,at); open.push(next); }
      }
    }
    route = [];
    for (let at = finish; at !== start && previous.has(at); at = previous.get(at)!) route.unshift(center(at));
    if (routeCache.size>=256) routeCache.clear();
    routeCache.set(key,route);
  }
  // Look ahead only through collision-free segments; never cut obstacle corners.
  let waypoint: Point | undefined;
  for (const point of route) { if (wallFraction(from,point,radius)!==null) break; waypoint = point; }
  return waypoint ? move(from,towards(from,waypoint,budget),radius) : move(from,towards(from,center(start),budget),radius);
}

// Shared-world simulation uses the same collision and path rules.
export { move as spatialMove, wallFraction as spatialWall, returnWaypoint as spatialRoute };
