import { trainArcanaSkill } from "./arcana-skill-training";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { GameState } from "./schemas";
import type { ArcanaSpatial, CombatPoint as Point } from "./schemas/arcana-spatial";
import { appendLogEntry } from "./state-utils";
import { ARCANA_SPELLS, absorbArcanaDamage, clearFlameGuard, spellMagnitude, spendSpell, tickSpellTimers } from "./arcana-spells";

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
export function spatialEvent(b: Battle, kind: ArcanaSpatial["events"][number]["kind"], position: Point, amount = 0, projectileId?: string, direction?: Point, rewards?: { xp: number; money: number }, targetPosition?: Point) {
  const s = b.spatial!;
  s.events.push({ id: ++s.revision, kind, position:copy(position), amount, ...(projectileId ? {projectileId} : {}), ...(direction ? {direction:copy(direction)} : {}), ...(rewards ? {rewards} : {}), ...(targetPosition ? {targetPosition:copy(targetPosition)} : {}) });
  s.events = s.events.slice(-32);
}
export function createSpatialBattle(state: GameState, player: Point) {
  const home = spatialLayout().home;
  if (blocked(player, 3) || distance(player,home)>spatialLayout().tuning.chaseLimit) throw new Error("슬라임 가까이의 이동 가능한 위치에서 사용해 주세요.");
  state.arcanaCombat.battle = { id:randomUUID(),phase:"ready",enemyHp:30,attackIn:6,paused:false,log:[],spatial:{ encounterId:"plaza_slime",enemy:copy(home),home:copy(home),player:copy(player),previousPlayer:copy(player),behavior:"neutral",jumpFrom:copy(home),jumpTo:copy(home),jumpHit:false,jumpElapsed:0,targetLocked:false,elapsed:0,revision:0,projectiles:[],events:[] } };
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
export function returnSpatialBattle(b: Battle) {
  const s = b.spatial!;
  if (s.behavior === "return") return;
  s.behavior = "return"; s.projectiles = []; s.targetLocked = false; s.jumpHit = false;
  b.phase = "ready"; b.attackIn = 6;
  spatialEvent(b,"return",s.enemy);
}
export function castSpatialFireball(state: GameState, aim: Point) {
  const b = state.arcanaCombat.battle!, s = b.spatial!, c = state.arcanaCombat;
  if (b.paused || s.behavior === "return" || ["victory","defeat"].includes(b.phase)) throw new Error("현재는 마법을 발사할 수 없습니다.");
  const length = Math.hypot(aim.x,aim.y);
  if (length < .001) throw new Error("발사 방향을 선택해 주세요.");
  spendSpell(state,"fireball");
  const p = {id:randomUUID(),position:copy(s.player),direction:{x:aim.x/length,y:aim.y/length},remaining:spatialLayout().tuning.range,damage:spellMagnitude(state,"fireball")};
  s.projectiles.push(p);
  spatialEvent(b,"cast",s.player,0,p.id);
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
  if (!circleIntersectsCone(s.player,direction,s.enemy,t.enemyRadius,ARCANA_SPELLS.flame_wave.rangeTiles*t.tile,ARCANA_SPELLS.flame_wave.angle) || wallFraction(s.player,s.enemy,0) !== null) return;
  const damage = spellMagnitude(state,"flame_wave");
  trainArcanaSkill(state,"flame_wave",Math.min(b.enemyHp,damage));
  b.enemyHp = Math.max(0,b.enemyHp-damage);
  spatialEvent(b,"hit",s.enemy,damage);
  if (s.behavior === "neutral") { b.phase = "battle"; s.behavior = "chase"; b.attackIn = t.attackInterval; }
  if (b.enemyHp <= 0) victory(state,b);
}
function victory(state: GameState, b: Battle) {
  const c = state.arcanaCombat, s = b.spatial!;
  b.phase = "victory"; b.paused = true; s.projectiles = [];
  clearFlameGuard(state);
  state.money += 30;
  b.log.push("슬라임 처치 · 소지금 +30원");
  appendLogEntry(state,b.log.at(-1)!); spatialEvent(b,"victory",s.enemy,0,undefined,undefined,{xp:0,money:30});
}
export function tickSpatialCombat(state: GameState, seconds: number) {
  const b = state.arcanaCombat.battle!, s = b.spatial!, c = state.arcanaCombat, t = spatialLayout().tuning;
  if (b.paused || b.phase === "victory" || b.phase === "defeat") return;
  const start = copy(s.previousPlayer), end = copy(s.player);
  let elapsed = 0;
  while (elapsed < seconds-1e-8) {
    const dt = Math.min(1/60,seconds-elapsed), playerBefore = mix(start,end,elapsed/Math.max(seconds,1e-9));
    elapsed += dt; s.elapsed += dt; s.revision++;
    const player = mix(start,end,elapsed/Math.max(seconds,1e-9));
    tickSpellTimers(state,dt);
    const evading = c.evadeSeconds > 0;
    c.evadeSeconds = Math.max(0,c.evadeSeconds-dt);
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
    for (const p of [...s.projectiles]) {
      const travel = Math.min(p.remaining,t.projectileSpeed*dt), next = {x:p.position.x+p.direction.x*travel,y:p.position.y+p.direction.y*travel};
      const wall = wallFraction(p.position,next,t.projectileRadius);
      const hit = s.behavior !== "return" ? sweptCircle(p.position,next,enemyBefore,s.enemy,t.enemyRadius+t.projectileRadius) : null;
      if (hit !== null && (wall === null || hit < wall)) {
        const impact = mix(p.position,next,hit);
        trainArcanaSkill(state,"fireball",Math.min(b.enemyHp,p.damage));
        b.enemyHp = Math.max(0,b.enemyHp-p.damage);
        s.projectiles = s.projectiles.filter(q => q.id !== p.id);
        spatialEvent(b,"hit",impact,p.damage,p.id,p.direction,undefined,mix(enemyBefore,s.enemy,hit));
        if (s.behavior === "neutral") { b.phase = "battle"; s.behavior = "chase"; b.attackIn = t.attackInterval; }
        if (b.enemyHp <= 0) { victory(state,b); break; }
      } else {
        p.position = next; p.remaining = Math.max(0,p.remaining-travel);
        if (wall !== null || p.remaining <= 1e-8) {
          spatialEvent(b,"miss",wall === null ? next : mix({x:next.x-p.direction.x*travel,y:next.y-p.direction.y*travel},next,wall),0,p.id);
          s.projectiles = s.projectiles.filter(q => q.id !== p.id);
        }
      }
    }
    if (b.enemyHp <= 0) break;
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
