import crypto from "node:crypto";
import { spatialLayout, sweptCircle, circleIntersectsCone, spatialMove, spatialWall, spatialRoute } from "../game/arcana-spatial";
import { ARCANA_SPELLS, DODGE_EFFECT_SECONDS, isArcanaSpell, effectiveSpell, spellMagnitude, spendSpell, tickSpellTimers, tryEvadeAttack, absorbArcanaDamage, castFlameGuard, clearFlameGuard } from "../game/arcana-spells";
import { GAME_HOUR_MS } from "../game/base-data";
import { awardSlimeLoot } from "../game/arcana-economy";
import { trainArcanaSkill } from "../game/arcana-skill-training";
import { fireballSpecialization } from "../game/arcana-skill-tree";
import { MEADOW_BOUNDS, MEADOW_ENEMY_HOME } from "../game/arcana-meadow";
import { OnlineError } from "./accounts";
import { combatArea, type Actor, type CombatArea, type CombatArena, type Point, type SharedEnemy, type SharedWorld, type WorldEvent, type Shot } from "./model";
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const copy=(p:Point)=>({...p});
const mix=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const PLAZA_FIREBALL_COOLDOWN_MS = 1800;
const SLIME_RECOVERY_SECONDS = 1.2;
const SLIME_COUNTER_DAMAGE_FRACTION = 0.5;
const SLIME_LEAP_WINDUP = 3;
const SLIME_LEAP_MIN_RANGE = 18;
const SLIME_HIT_WALL_PROBE = 0.1;
const SLIME_HOP_DURATION = 0.32;
const SLIME_HOP_REST = 0.45;
const SLIME_CHASE_HOP_DISTANCE = 28;
const SLIME_FLEE_HEALTH_FRACTION = 1 / 3;
const SLIME_FLEE_DISTANCE = 24;
const SLIME_FLEE_DURATION = 0.44;
const SLIME_CONTACT_DAMAGE = 3;
const SLIME_CONTACT_INTERVAL_MS = 1000;
const MEADOW_OX_RADIUS = 10;
const MEADOW_OX_WINDUP = 1.6;
const MEADOW_OX_CHARGE_SECONDS = 0.55;
const MEADOW_OX_RECOVERY = 1.2;
const MEADOW_OX_CHARGE_RANGE = 60;
const MEADOW_OX_RESPAWN_MS = 8000;
type SlimeAction = Exclude<NonNullable<SharedEnemy["slimeAction"]>, "charge">;

export function plazaFireballCooldown(world: SharedWorld, actor: Actor) {
  if (actor.place.location !== "arcana_plaza" || combatArea(actor) !== "plaza") return undefined;
  return {
    durationSeconds: PLAZA_FIREBALL_COOLDOWN_MS / 1000,
    remainingSeconds: Math.max(0, (actor.plazaFireballReadyAtMs ?? 0) - world.elapsedMs) / 1000,
  };
}

export function enemyActionTiming(action: SharedEnemy["slimeAction"]) {
  const tuning = spatialLayout().tuning;
  switch (action) {
    case "leap": return { windupDuration: SLIME_LEAP_WINDUP, actionDuration: tuning.jumpDuration,
      recoveryDuration: SLIME_RECOVERY_SECONDS, dangerRadius: tuning.enemyRadius + tuning.playerRadius };
    case "hop": return { actionDuration: SLIME_HOP_DURATION };
    case "flee": return { actionDuration: SLIME_FLEE_DURATION };
    case "charge": return { windupDuration: MEADOW_OX_WINDUP, actionDuration: MEADOW_OX_CHARGE_SECONDS,
      recoveryDuration: MEADOW_OX_RECOVERY, dangerRadius: MEADOW_OX_RADIUS + tuning.playerRadius };
    default: return {};
  }
}

export function newEnemy(area: CombatArea = "plaza"): SharedEnemy {
  const meadow = area === "meadow";
  const home = copy(meadow ? MEADOW_ENEMY_HOME : spatialLayout().home);
  const maxHp = meadow ? 42 : 30;
  return {id:meadow ? "meadow-ox" : "slime_0",lifeId:crypto.randomUUID(),position:copy(home),home,hp:maxHp,maxHp,attackIn:6,behavior:"neutral",jumpFrom:copy(home),jumpTo:copy(home),jumpHit:false,jumpElapsed:0,recoveryElapsed:0,hopCooldown:0,hasFled:false,targetLocked:false,rewarded:false,respawnAt:0,contribution:{},targetId:null};
}

export function beginEnemyChase(enemy: SharedEnemy, area: CombatArea) {
  if (enemy.hp <= 0 || enemy.behavior !== "neutral") return;
  enemy.behavior = "chase";
  enemy.attackIn = area === "plaza" ? SLIME_LEAP_WINDUP : spatialLayout().tuning.attackInterval;
}
export function combatArena(world: SharedWorld, area: CombatArea): CombatArena {
  if (area === "plaza") return world;
  return world.meadowCombat ??= {enemy:newEnemy("meadow"),projectiles:[],meteors:[],barrages:[]};
}

export function newWorld():SharedWorld {return {id:"main",revision:0,elapsedMs:0,updatedAt:Date.now(),enemy:newEnemy(),projectiles:[],meteors:[],barrages:[],events:[]};}
export function event(world:SharedWorld,kind:WorldEvent["kind"],position:Point,extra:Partial<WorldEvent>={},area:CombatArea="plaza") {
  world.events.push({id:++world.revision,kind,position:copy(position),amount:0,...(area==="meadow"?{area}:{}),...extra});
  world.events=world.events.slice(-96);
}

function combatWall(area: CombatArea, from: Point, to: Point, radius: number) {
  if (area === "plaza") return spatialWall(from, to, radius);
  const {x, y, w, h} = MEADOW_BOUNDS;
  const left = x + radius, right = x + w - radius, top = y + radius, bottom = y + h - radius;
  if (from.x < left || from.x > right || from.y < top || from.y > bottom) return 0;
  const edgeX = to.x < left ? left : to.x > right ? right : undefined;
  const edgeY = to.y < top ? top : to.y > bottom ? bottom : undefined;
  if (edgeX === undefined && edgeY === undefined) return null;
  return Math.min(edgeX === undefined ? 1 : (edgeX - from.x) / (to.x - from.x), edgeY === undefined ? 1 : (edgeY - from.y) / (to.y - from.y));
}

function enemyRadius(area: CombatArea) {
  return area === "meadow" ? MEADOW_OX_RADIUS : spatialLayout().tuning.enemyRadius;
}

function projectile(world:SharedWorld,area:CombatArea,actor:Actor,id:"fireball"|"giant_fireball"|"flame_barrage",aim:Point,damage:number,targetId?:string,clientActionId?:string) {
  const t=spatialLayout().tuning, length=Math.hypot(aim.x,aim.y);
  if (length<.001) throw new OnlineError("invalid_aim","발사 방향을 선택해 주세요.",400);
  const arena = combatArena(world, area);
  const shot:Shot={clientActionId,id:crypto.randomUUID(),ownerId:actor.character.id,position:copy(actor.position),origin:copy(actor.position),direction:{x:aim.x/length,y:aim.y/length},remaining:effectiveSpell(actor.game.state,id).rangeTiles*t.tile,damage,spellId:id,radius:t.projectileRadius*(id==="giant_fireball"?2:1),hitIds:[],masteryAwarded:false,pierce:id==="fireball" && fireballSpecialization(actor.game.state,"reach")?3:1,explode:id==="fireball" && fireballSpecialization(actor.game.state,"burst"),targetId};
  if (area === "plaza" && actor.place.location === "arcana_plaza" && id === "fireball" && arena.enemy.hp > 0) {
    shot.plazaFireballEnemyLifeId = arena.enemy.lifeId;
  }
  arena.projectiles.push(shot);
  event(world,"cast",actor.position,{actorId:actor.character.id,projectileId:shot.id,spellId:shot.spellId,direction:shot.direction,clientActionId},area);
}
export type Death = {lifeId:string;winnerId:string} & NonNullable<WorldEvent["rewards"]>;
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
function slimeRecovering(enemy: SharedEnemy, area: CombatArea) {
  return area === "plaza" && enemy.behavior === "recover" && (enemy.slimeAction ?? "leap") === "leap";
}

function damage(world:SharedWorld,area:CombatArea,actor:Actor,amount:number,deaths:Death[],extra:Partial<WorldEvent>={},recoveringAtImpact?:boolean) {
  const e=combatArena(world,area).enemy;
  if(e.hp<=0 || e.behavior==="return") return 0;
  const isSlimeCounter = recoveringAtImpact ?? slimeRecovering(e, area);
  const baseDealt = Math.min(e.hp, amount);
  const dealt = isSlimeCounter
    ? Math.min(e.hp, amount + Math.floor(amount * SLIME_COUNTER_DAMAGE_FRACTION))
    : baseDealt;
  e.hp-=dealt; e.contribution[actor.character.id]=(e.contribution[actor.character.id] || 0)+dealt;
  event(world,"hit",e.position,{
    amount:dealt,actorId:actor.character.id,enemyId:e.id,enemyLifeId:e.lifeId,targetPosition:copy(e.position),...extra,
    ...(isSlimeCounter ? { slimeCounterBonus: dealt - baseDealt } : {}),
  },area);
  beginEnemyChase(e, area);
  if(e.hp===0 && !e.rewarded) {
    e.rewarded=true;e.respawnAt=Date.now()+(area==="meadow"?MEADOW_OX_RESPAWN_MS:0);
    const state = actor.game.state;
    const rewards: NonNullable<WorldEvent["rewards"]> = area === "meadow" ? { rawMeat: 1, money: 0, xp: 0 } : awardSlimeLoot(state);
    if (rewards.rawMeat) state.inventory.rawMeat = (state.inventory.rawMeat ?? 0) + rewards.rawMeat;
    deaths.push({lifeId:e.lifeId,winnerId:actor.character.id,...rewards});
    event(world,"enemy_down",extra.targetPosition ?? e.position,{actorId:actor.character.id,enemyId:e.id,rewards},area);
  }
  return dealt;
}
export function cast(world:SharedWorld,actor:Actor,command:string,aim:Point|undefined,target:Point|undefined,deaths:Death[],resolveMove:(from:Point,to:Point)=>Point=(from,to)=>spatialMove(from,to,3),clientActionId?:string,targetLifeId?:string) {
  const state=actor.game.state,c=state.arcanaCombat,t=spatialLayout().tuning;
  const area= combatArea(actor);
  if (command==="spatial_sync") return;
  if (command==="dodge" || command==="teleport") {
    if (c.cooldowns[command]>1e-8 || !aim || Math.hypot(aim.x,aim.y)<.001) throw new OnlineError("skill_unavailable","지금은 이동 기술을 사용할 수 없습니다.");
    const length=Math.hypot(aim.x,aim.y);
    const origin=copy(actor.position);
    const next={x:actor.position.x+aim.x/length*28,y:actor.position.y+aim.y/length*28};
    actor.position=resolveMove(actor.position,next);actor.previous=copy(actor.position);
    c.cooldowns[command]=command==="teleport"?0:5;c.evadeSkill=command;c.evadeSeconds=command==="dodge"?DODGE_EFFECT_SECONDS:.18;
    event(world,"evade",actor.position,{actorId:actor.character.id,targetPlayerId:actor.character.id,direction:aim,movement:command,sourcePosition:origin},area);
    return;
  }
  if(command==="potion") {
    if(c.cooldowns.potion>0 || c.mp>=30 || !(state.inventory.manaPotion>0)) throw new OnlineError("potion_unavailable","사용 가능한 포션을 확인해 주세요.");
    state.inventory.manaPotion--;c.mp=Math.min(30,c.mp+20);c.cooldowns.potion=5;
    return;
  }
  if(!isArcanaSpell(command)) throw new OnlineError("invalid_command","공용 전투에서 지원하지 않는 입력입니다.",400);
  if(!area || actor.bench || state.npcDialogue.active) throw new OnlineError("combat_unavailable","현재 위치에서는 공격할 수 없습니다.");
  const arena=combatArena(world,area),e=arena.enemy;
  if(command==="flame_guard") {castFlameGuard(state);event(world,"guard",actor.position,{actorId:actor.character.id,clientActionId},area);return;}
  const plazaSlime = area === "plaza" && actor.place.location === "arcana_plaza";
  if (command === "flame_wave" && plazaSlime && targetLifeId !== undefined && (e.hp <= 0 || e.lifeId !== targetLifeId)) {
    throw new OnlineError("slime_unavailable", "슬라임의 상태가 바뀌었습니다. 다시 선택해 주세요.");
  }
  const spell=effectiveSpell(state,command),range=spell.rangeTiles*t.tile;
  if(e.behavior==="return") throw new OnlineError("enemy_returning",area==="meadow"?"진흙코 뿔소가 원래 자리로 돌아가고 있습니다.":"슬라임이 원래 자리로 돌아가고 있습니다.");
  if(command==="meteor") {
    if(!target || distance(actor.position,target)>range || combatWall(area,actor.position,target,0)!==null) throw new OnlineError("invalid_target","사거리 안의 지점을 선택해 주세요.",400);
    spendSpell(state,command);
    const meteor={clientActionId,id:crypto.randomUUID(),ownerId:actor.character.id,position:copy(target),remaining:1,damage:spellMagnitude(state,command)};
    arena.meteors.push(meteor);event(world,"meteor_warning",target,{actorId:actor.character.id,projectileId:meteor.id,clientActionId},area);
  } else if(command==="flame_barrage") {
    if(e.hp<=0 || distance(actor.position,e.position)>range || combatWall(area,actor.position,e.position,0)!==null) throw new OnlineError("no_target","사거리 안에 적이 없습니다.");
    spendSpell(state,command);arena.barrages.push({clientActionId,ownerId:actor.character.id,remaining:12,nextIn:0,damage:spellMagnitude(state,command)});
  } else {
    if(!aim || Math.hypot(aim.x,aim.y)<.001) throw new OnlineError("invalid_aim","발사 방향을 선택해 주세요.",400);
    const fireballCooldown = command === "fireball" ? plazaFireballCooldown(world, actor) : undefined;
    if (fireballCooldown && fireballCooldown.remainingSeconds > 0) {
      throw new OnlineError("skill_unavailable", "파이어볼 재사용 대기 중입니다.");
    }
    spendSpell(state,command);
    if(command==="flame_wave") {
      const wallProbe = plazaSlime ? SLIME_HIT_WALL_PROBE : 0;
      const inCone = circleIntersectsCone(actor.position, aim, e.position, enemyRadius(area), range, ARCANA_SPELLS.flame_wave.angle);
      const hitsEnemy = inCone && combatWall(area, actor.position, e.position, wallProbe) === null;
      event(world, "wave", actor.position, {
        actorId: actor.character.id, direction: aim, clientActionId,
        ...(plazaSlime && e.hp > 0 && !hitsEnemy ? {
          enemyLifeId: e.lifeId, missReason: inCone ? "obstacle" : "outside_cone",
        } : {}),
      }, area);
      if (hitsEnemy) trainArcanaSkill(state, command, damage(world, area, actor, spellMagnitude(state, command), deaths));
    } else {
      projectile(world,area,actor,command,aim,spellMagnitude(state,command),undefined,clientActionId);
      if (fireballCooldown) actor.plazaFireballReadyAtMs = world.elapsedMs + PLAZA_FIREBALL_COOLDOWN_MS;
    }
  }
}
function chooseSlimeAction(enemy: SharedEnemy, target: Actor) {
  const tuning = spatialLayout().tuning;
  const gap = distance(enemy.position, target.position);
  const attackReady = enemy.attackIn <= SLIME_LEAP_WINDUP;
  const leapIdeal = (SLIME_LEAP_MIN_RANGE + tuning.jumpRange) / 2;
  const fleeTo = !enemy.hasFled && enemy.hp <= enemy.maxHp * SLIME_FLEE_HEALTH_FRACTION
    ? fleeEndpoint(enemy, target.position) : undefined;
  const scores: { action: SlimeAction; score: number; destination?: Point }[] = [
    { action: "flee", score: fleeTo ? 1 : 0, destination: fleeTo },
    { action: "leap", score: attackReady && gap >= SLIME_LEAP_MIN_RANGE && gap <= tuning.jumpRange
      && spatialWall(enemy.position, target.position, tuning.enemyRadius) === null
      ? 0.48 + 0.38 * Math.max(0, 1 - Math.abs(gap - leapIdeal) / Math.max(1, leapIdeal - SLIME_LEAP_MIN_RANGE)) : 0 },
    { action: "hop", score: enemy.hopCooldown <= 0 ? 0.25 : 0 },
  ];
  const best = scores.reduce((current, option) => option.score > current.score ? option : current);
  return best.score > 0 ? best : undefined;
}

function leapEndpoint(position: Point, target: Point): Point {
  const { jumpRange } = spatialLayout().tuning;
  const length = distance(position, target);
  return landingEndpoint(position, mix(position, target, Math.min(1, jumpRange / Math.max(.001, length))));
}

function landingEndpoint(position: Point, end: Point): Point {
  const obstacle = spatialWall(position, end, spatialLayout().tuning.enemyRadius);
  if (obstacle === null) return end;
  // Slime movement interpolates a straight segment to the landing point.
  return mix(position, end, Math.max(0, obstacle - .75 / Math.max(.75, distance(position, end))));
}

function hopEndpoint(position: Point, target: Point): Point {
  const { jumpRange, enemyRadius } = spatialLayout().tuning;
  const gap = distance(position, target);
  const blocked = spatialWall(position, target, enemyRadius) !== null;
  if (gap > jumpRange || blocked) {
    const step = blocked ? 16 : SLIME_CHASE_HOP_DISTANCE;
    return landingEndpoint(position, spatialRoute(position, target, step, enemyRadius));
  }
  const heading = gap > .001 ? { x: (target.x - position.x) / gap, y: (target.y - position.y) / gap } : { x: 0, y: 1 };
  const inward = gap < SLIME_LEAP_MIN_RANGE ? -4 : 4;
  for (const side of [1, -1]) {
    const end = { x: position.x + heading.x * inward - heading.y * 14 * side, y: position.y + heading.y * inward + heading.x * 14 * side };
    if (spatialWall(position, end, enemyRadius) === null) return end;
  }
  return copy(position);
}

function fleeEndpoint(enemy: SharedEnemy, target: Point): Point | undefined {
  const { chaseLimit } = spatialLayout().tuning;
  const start = enemy.position;
  const gap = distance(start, target);
  const heading = gap > .001 ? Math.atan2(start.y - target.y, start.x - target.x) : Math.PI / 2;
  const homeLimit = Math.max(chaseLimit, distance(start, enemy.home));
  for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2.5, -Math.PI / 2.5]) {
    const angle = heading + turn;
    const end = landingEndpoint(start, {
      x: start.x + Math.cos(angle) * SLIME_FLEE_DISTANCE,
      y: start.y + Math.sin(angle) * SLIME_FLEE_DISTANCE,
    });
    const retreatGap = distance(end, target);
    if (retreatGap >= gap + SLIME_FLEE_DISTANCE / 3 && retreatGap <= chaseLimit
      && distance(end, enemy.home) <= homeLimit) return end;
  }
  return undefined;
}

function canReceiveCombatHit(actor: Actor, area: CombatArea) {
  return actor.disconnectedAt === null && combatArea(actor) === area && actor.game.state.arcanaCombat.hp > 0;
}

function isSlimeCombatParticipant(enemy: SharedEnemy, actor: Actor) {
  return canReceiveCombatHit(actor, "plaza") && enemy.contribution[actor.character.id] !== undefined;
}

function targetContact(from: Point, to: Point, actor: Actor, radius: number, area: CombatArea = "plaza") {
  const at = sweptCircle(from, to, actor.previous, actor.position, radius);
  if (at === null) return null;
  const sourcePosition = mix(from, to, at);
  const position = mix(actor.previous, actor.position, at);
  return combatWall(area, sourcePosition, position, SLIME_HIT_WALL_PROBE) === null
    ? { fraction: at, sourcePosition, position } : null;
}

type PlayerContact = NonNullable<ReturnType<typeof targetContact>>;

function hitPlayer(
  world: SharedWorld,
  target: Actor,
  amount: number,
  contact: PlayerContact,
  tickSeconds: number,
  { area, awardEvadeTraining, hitSource }: { area: CombatArea; awardEvadeTraining: boolean; hitSource?: WorldEvent["hitSource"] },
) {
  const state = target.game.state;
  const secondsUntilImpact = contact.fraction * tickSeconds;
  const hitEvent = { targetPlayerId: target.character.id, sourcePosition: contact.sourcePosition, ...(hitSource ? { hitSource } : {}) };
  // A resolved attack takes priority over body contact in the same tick.
  target.slimeContactReadyAtMs = world.elapsedMs + SLIME_CONTACT_INTERVAL_MS;
  if (tryEvadeAttack(state.arcanaCombat, secondsUntilImpact)) {
    const skill = state.arcanaCombat.evadeSkill;
    if (awardEvadeTraining) trainArcanaSkill(state, skill, 10);
    event(world, "evade", contact.position, { ...hitEvent, evadeSkill: skill }, area);
    return;
  }
  if (state.arcanaCombat.guard.seconds <= secondsUntilImpact + 1e-8) clearFlameGuard(state);
  const result = absorbArcanaDamage(state, amount);
  if (result.absorbed) event(world, "absorb", contact.position, { ...hitEvent, amount: result.absorbed }, area);
  if (result.hurt) event(world, "hurt", contact.position, { ...hitEvent, amount: result.hurt }, area);
  if (state.arcanaCombat.hp <= 0) {
    state.arcanaCombat.hp = 30;
    clearFlameGuard(state);
    target.position = copy(spatialLayout().spawn);
    target.previous = copy(target.position);
    target.place = { location: "arcana_plaza", interior: "", floor: 0 };
    state.location = "arcana_plaza";
    if (area === "meadow") {
      target.placeRevision = (target.placeRevision ?? 0) + 1;
      target.walking = false;
      target.moveCredit = 0;
      target.lastMoveAt = Date.now();
    }
    delete combatArena(world, area).enemy.contribution[target.character.id];
    // A defeat is displayed at the destination after the server moves the actor.
    event(world, "defeat", target.position, hitEvent);
  }
}

function tickSlimeContact(world: SharedWorld, actors: Map<string, Actor>, before: Point, radius: number, seconds: number) {
  const enemy = world.enemy;
  if (enemy.hp <= 0 || enemy.behavior === "neutral" || enemy.behavior === "return") return;
  for (const actor of actors.values()) {
    if (!isSlimeCombatParticipant(enemy, actor) || world.elapsedMs < (actor.slimeContactReadyAtMs ?? 0)) continue;
    const contact = targetContact(before, enemy.position, actor, radius);
    if (contact !== null) hitPlayer(world, actor, SLIME_CONTACT_DAMAGE, contact, seconds,
      { area: "plaza", awardEvadeTraining: false, hitSource: "slime_contact" });
  }
}

function finishSlimeAction(enemy: SharedEnemy, target: Actor | undefined) {
  enemy.slimeAction = undefined;
  enemy.behavior = target ? "chase" : "return";
  enemy.recoveryElapsed = 0;
  enemy.jumpHit = false;
  enemy.targetLocked = false;
}

function tickSlime(world: SharedWorld, actors: Map<string, Actor>, seconds: number) {
  const enemy = world.enemy;
  if (enemy.hp <= 0 || enemy.behavior === "neutral") return;
  const tuning = spatialLayout().tuning;
  const candidates = [...actors.values()]
    .filter(actor => isSlimeCombatParticipant(enemy, actor) && distance(actor.position, enemy.position) <= tuning.chaseLimit)
    .sort((a, b) => enemy.contribution[b.character.id] - enemy.contribution[a.character.id] || a.character.id.localeCompare(b.character.id));
  // The chase limit governs target selection. A locked leap keeps the same target until it resolves.
  const lockedTarget = enemy.targetLocked && enemy.targetId ? actors.get(enemy.targetId) : undefined;
  const target = enemy.targetLocked
    ? (lockedTarget && isSlimeCombatParticipant(enemy, lockedTarget) ? lockedTarget : undefined)
    : candidates[0];
  if (!enemy.targetLocked) enemy.targetId = target?.character.id ?? null;
  enemy.hopCooldown = Math.max(0, enemy.hopCooldown - seconds);
  if (!target && !enemy.targetLocked && (enemy.behavior === "chase" || enemy.behavior === "prepare")) {
    finishSlimeAction(enemy, undefined);
  }

  if (enemy.behavior === "return") {
    enemy.position = spatialRoute(enemy.position, enemy.home, tuning.returnSpeed * seconds, tuning.enemyRadius);
    if (distance(enemy.position, enemy.home) < .5) {
      enemy.position = copy(enemy.home);
      enemy.hp = enemy.maxHp;
      enemy.lifeId = crypto.randomUUID();
      enemy.behavior = "neutral";
      enemy.contribution = {};
      enemy.attackIn = tuning.attackInterval;
      enemy.hopCooldown = 0;
      enemy.hasFled = false;
      event(world, "reset", enemy.position);
    }
    return;
  }

  const action = enemy.slimeAction ?? "leap";
  if (enemy.behavior !== "attack" || action !== "leap") {
    enemy.attackIn = Math.max(0, enemy.attackIn - seconds);
  }
  if (enemy.behavior === "recover") {
    enemy.recoveryElapsed = Math.min(SLIME_RECOVERY_SECONDS, enemy.recoveryElapsed + seconds);
    if (enemy.recoveryElapsed >= SLIME_RECOVERY_SECONDS) finishSlimeAction(enemy, target);
    return;
  }
  if (enemy.behavior === "prepare") {
    if (action === "leap" && !enemy.targetLocked && target) {
      enemy.jumpTo = leapEndpoint(enemy.position, target.position);
      if (enemy.attackIn <= 1) enemy.targetLocked = true;
    }
    if (enemy.attackIn > 0) return;
    enemy.behavior = "attack";
    enemy.jumpElapsed = 0;
    return;
  }
  if (enemy.behavior === "attack") {
    const duration = enemyActionTiming(action).actionDuration ?? tuning.jumpDuration;
    const before = enemy.position;
    enemy.jumpElapsed = Math.min(duration, enemy.jumpElapsed + seconds);
    enemy.position = mix(enemy.jumpFrom, enemy.jumpTo, enemy.jumpElapsed / duration);
    if (action === "leap" && target && !enemy.jumpHit) {
      const contact = targetContact(before, enemy.position, target, tuning.enemyRadius + tuning.playerRadius);
      if (contact !== null) {
        enemy.jumpHit = true;
        hitPlayer(world, target, 5, contact, seconds, { area: "plaza", awardEvadeTraining: true, hitSource: "slime_leap" });
      }
    }
    if (enemy.jumpElapsed >= duration) {
      if (action !== "leap") {
        enemy.hopCooldown = SLIME_HOP_REST;
        finishSlimeAction(enemy, target);
      } else {
        if (enemy.targetLocked && target?.place.location === "arcana_plaza" && !enemy.jumpHit) {
          event(world, "slime_leap_miss", enemy.position, {
            targetPlayerId: target.character.id, enemyId: enemy.id, enemyLifeId: enemy.lifeId,
          });
        }
        enemy.behavior = "recover";
        enemy.recoveryElapsed = 0;
        enemy.attackIn = tuning.attackInterval - duration;
        enemy.targetLocked = false;
        enemy.jumpHit = false;
      }
    }
    return;
  }
  if (!target) return;
  const next = chooseSlimeAction(enemy, target);
  if (!next) return;
  enemy.slimeAction = next.action;
  enemy.jumpFrom = copy(enemy.position);
  enemy.jumpTo = copy(enemy.position);
  enemy.jumpElapsed = 0;
  enemy.jumpHit = false;
  if (next.action === "leap") {
    enemy.jumpTo = leapEndpoint(enemy.position, target.position);
    enemy.attackIn = SLIME_LEAP_WINDUP;
    enemy.behavior = "prepare";
  } else {
    enemy.jumpTo = next.destination ?? hopEndpoint(enemy.position, target.position);
    enemy.hasFled ||= next.action === "flee";
    enemy.behavior = "attack";
  }
}

function meadowMove(from: Point, to: Point, budget: number) {
  const next = mix(from, to, Math.min(1, budget / Math.max(.001, distance(from, to))));
  const {x, y, w, h} = MEADOW_BOUNDS;
  return {
    x: Math.max(x + MEADOW_OX_RADIUS, Math.min(x + w - MEADOW_OX_RADIUS, next.x)),
    y: Math.max(y + MEADOW_OX_RADIUS, Math.min(y + h - MEADOW_OX_RADIUS, next.y)),
  };
}

function tickMeadowOx(world: SharedWorld, enemy: SharedEnemy, actors: Map<string, Actor>, seconds: number) {
  if (enemy.hp <= 0 || enemy.behavior === "neutral") return;
  const {chaseLimit, chaseSpeed, returnSpeed, playerRadius, attackInterval} = spatialLayout().tuning;
  if (enemy.behavior === "return") {
    enemy.position = meadowMove(enemy.position, enemy.home, returnSpeed * seconds);
    if (distance(enemy.position, enemy.home) < .5) {
      enemy.position = copy(enemy.home);
      enemy.hp = enemy.maxHp;
      enemy.behavior = "neutral";
      enemy.contribution = {};
      enemy.attackIn = attackInterval;
      event(world, "reset", enemy.position, {}, "meadow");
    }
    return;
  }
  const participants = [...actors.values()].filter(actor => canReceiveCombatHit(actor, "meadow")
    && enemy.contribution[actor.character.id] !== undefined)
    .sort((a, b) => enemy.contribution[b.character.id] - enemy.contribution[a.character.id]
      || a.character.id.localeCompare(b.character.id));
  if (enemy.behavior === "attack") {
    const previous = enemy.position;
    enemy.jumpElapsed = Math.min(MEADOW_OX_CHARGE_SECONDS, enemy.jumpElapsed + seconds);
    enemy.position = mix(enemy.jumpFrom, enemy.jumpTo, enemy.jumpElapsed / MEADOW_OX_CHARGE_SECONDS);
    if (!enemy.jumpHit) {
      let firstContact: { actor: Actor; contact: PlayerContact } | undefined;
      for (const actor of participants) {
        const contact = targetContact(previous, enemy.position, actor, playerRadius + MEADOW_OX_RADIUS, "meadow");
        if (contact !== null && (!firstContact || contact.fraction < firstContact.contact.fraction)) {
          firstContact = { actor, contact };
        }
      }
      if (firstContact) {
        enemy.jumpHit = true;
        hitPlayer(world, firstContact.actor, 8, firstContact.contact, seconds, { area: "meadow", awardEvadeTraining: true });
      }
    }
    if (enemy.jumpElapsed >= MEADOW_OX_CHARGE_SECONDS) {
      enemy.behavior = "recover";
      enemy.recoveryElapsed = 0;
    }
    return;
  }
  // Chase range limits new targets. The charge path is already set during its windup.
  const chaseTarget = participants.find(actor => distance(actor.position, enemy.position) <= chaseLimit
    && distance(actor.position, enemy.home) <= chaseLimit);
  if (enemy.behavior === "recover") {
    enemy.recoveryElapsed = Math.min(MEADOW_OX_RECOVERY, enemy.recoveryElapsed + seconds);
    if (enemy.recoveryElapsed >= MEADOW_OX_RECOVERY) {
      finishSlimeAction(enemy, chaseTarget);
      enemy.attackIn = attackInterval - MEADOW_OX_CHARGE_SECONDS - MEADOW_OX_RECOVERY;
    }
    return;
  }
  const target = enemy.targetLocked ? participants.find(actor => actor.character.id === enemy.targetId) : chaseTarget;
  if (!target) {
    finishSlimeAction(enemy, undefined);
    enemy.targetId = null;
    return;
  }
  enemy.attackIn = Math.max(0, enemy.attackIn - seconds);
  if (enemy.behavior === "prepare") {
    if (enemy.attackIn <= 0) enemy.behavior = "attack";
    return;
  }
  const gap = distance(enemy.position, target.position);
  if (gap <= MEADOW_OX_CHARGE_RANGE && enemy.attackIn <= MEADOW_OX_WINDUP) {
    const heading = gap > .001 ? {x:(target.position.x-enemy.position.x)/gap,y:(target.position.y-enemy.position.y)/gap} : target.direction;
    enemy.jumpFrom = copy(enemy.position);
    enemy.jumpTo = meadowMove(enemy.position, {x:target.position.x+heading.x*8,y:target.position.y+heading.y*8}, MEADOW_OX_CHARGE_RANGE);
    enemy.jumpElapsed = 0;
    enemy.jumpHit = false;
    enemy.slimeAction = "charge";
    enemy.targetLocked = true;
    enemy.targetId = target.character.id;
    enemy.attackIn = MEADOW_OX_WINDUP;
    enemy.behavior = "prepare";
  } else if (gap > MEADOW_OX_CHARGE_RANGE * .75) {
    enemy.position = meadowMove(enemy.position, target.position, chaseSpeed * seconds);
  }
}

function tickArena(world:SharedWorld,area:CombatArea,actors:Map<string,Actor>,seconds:number,deaths:Death[]) {
  const arena=combatArena(world,area),t=spatialLayout().tuning,e=arena.enemy,radius=enemyRadius(area);
  if(e.hp<=0 && Date.now()>=e.respawnAt) {arena.enemy=newEnemy(area);event(world,"reset",arena.enemy.position,{},area);return;}
  const before=copy(e.position);
  const slimeWasReturning = area === "plaza" && e.behavior === "return";
  // Enemy motion is swept over the tick. Recovery begins at the end of the landing tick.
  const recoveryRemaining = slimeRecovering(e, area) ? SLIME_RECOVERY_SECONDS - e.recoveryElapsed : 0;
  if (area === "meadow") tickMeadowOx(world, e, actors, seconds);
  else {
    tickSlime(world, actors, seconds);
    if (!slimeWasReturning) tickSlimeContact(world, actors, before, radius + t.playerRadius, seconds);
  }
  for(const meteor of [...arena.meteors]) {
    const impactSeconds=Math.max(0,meteor.remaining);
    meteor.remaining-=seconds;
    if(meteor.remaining<=0) {
      const owner=actors.get(meteor.ownerId);
      const atImpact=mix(before,e.position,seconds>0 ? impactSeconds/seconds : 0);
      event(world,"meteor",meteor.position,{actorId:meteor.ownerId,projectileId:meteor.id},area);
      if(owner && combatArea(owner)===area && distance(atImpact,meteor.position)<=2*t.tile+radius && combatWall(area,meteor.position,atImpact,0)===null)
        damage(world,area,owner,meteor.damage,deaths,{targetPosition:atImpact},impactSeconds<recoveryRemaining);
      arena.meteors=arena.meteors.filter(m=>m.id!==meteor.id);
    }
  }
  for(const barrage of [...arena.barrages]) {
    const owner=actors.get(barrage.ownerId);barrage.nextIn-=seconds;
    if(!owner || combatArea(owner)!==area || e.hp<=0 || distance(owner.position,e.position)>8*t.tile) barrage.remaining=0;
    if(barrage.remaining>0 && barrage.nextIn<=0) {projectile(world,area,owner!,"flame_barrage",{x:e.position.x-owner!.position.x,y:e.position.y-owner!.position.y},barrage.damage,e.id,barrage.clientActionId?barrage.clientActionId+"-"+(13-barrage.remaining):undefined);barrage.remaining--;barrage.nextIn+=.2;}
    if(barrage.remaining===0)arena.barrages=arena.barrages.filter(b=>b!==barrage);
  }
  for(const shot of [...arena.projectiles]) {
    const owner=actors.get(shot.ownerId);
    if(!owner || combatArea(owner)!==area) {arena.projectiles=arena.projectiles.filter(p=>p.id!==shot.id);continue;}
    if(shot.spellId==="flame_barrage" && e.hp>0) {const length=distance(shot.position,e.position);if(length>.001)shot.direction={x:(e.position.x-shot.position.x)/length,y:(e.position.y-shot.position.y)/length};}
    const start = shot.position;
    const travel=Math.min(shot.remaining,t.projectileSpeed*seconds),next={x:start.x+shot.direction.x*travel,y:start.y+shot.direction.y*travel};
    const shotRadius = shot.radius || t.projectileRadius;
    const wall = combatWall(area, start, next, shotRadius);
    const shotEnemyLifeId = shot.plazaFireballEnemyLifeId;
    const sameEnemyLife = shotEnemyLifeId === undefined || shotEnemyLifeId === e.lifeId;
    const canHit = e.hp > 0 && sameEnemyLife && !slimeWasReturning
      && !(area === "plaza" && e.behavior === "return") && !shot.hitIds.includes(e.id);
    const travelSeconds = travel / t.projectileSpeed;
    const enemyAtTravelEnd = mix(before, e.position, seconds > 0 ? Math.min(1, travelSeconds / seconds) : 0);
    const hit = canHit ? sweptCircle(start, next, before, enemyAtTravelEnd, shotRadius + radius) : null;
    let spent=false;
    if(hit!==null && (wall===null || hit<wall)) {
      const targetPosition = mix(before, enemyAtTravelEnd, hit);
      const position = mix(mix(start, next, hit), targetPosition, shotRadius / (shotRadius + radius));
      const dealt=damage(world,area,owner,shot.damage,deaths,{projectileId:shot.id,direction:shot.direction,
        position,targetPosition},hit*travelSeconds<recoveryRemaining);
      if(dealt>0 && shot.spellId==="fireball" && !shot.masteryAwarded) {trainArcanaSkill(owner.game.state,"fireball",10);shot.masteryAwarded=true;}
      if(shot.explode)event(world,"explosion",position,{actorId:shot.ownerId,projectileId:shot.id},area);
      shot.hitIds.push(e.id);spent=shot.hitIds.length>=shot.pierce;
    }
    shot.position=next;shot.remaining-=travel;
    if (spent || wall !== null || shot.remaining <= 0) {
      if (!spent) {
        const reportMiss = shotEnemyLifeId !== undefined && sameEnemyLife && e.hp > 0 && shot.hitIds.length === 0;
        event(world, "miss", wall !== null ? mix(start, next, wall) : next, {
          projectileId: shot.id,
          ...(reportMiss ? {
            actorId: shot.ownerId, spellId: shot.spellId, enemyLifeId: shotEnemyLifeId,
            missReason: wall === null ? "range_exhausted" : "obstacle",
          } : {}),
        }, area);
      }
      arena.projectiles = arena.projectiles.filter(p => p.id !== shot.id);
    }
  }
}

export function tickCombat(world:SharedWorld,actors:Map<string,Actor>,seconds:number,deaths:Death[]) {
  tickArena(world,"plaza",actors,seconds,deaths);
  if (world.meadowCombat) tickArena(world,"meadow",actors,seconds,deaths);
  for(const actor of actors.values()) {
    const c=actor.game.state.arcanaCombat;
    tickSpellTimers(actor.game.state,seconds);c.evadeSeconds=Math.max(0,c.evadeSeconds-seconds);
    c.mp=Math.min(30,c.mp+seconds*1000/GAME_HOUR_MS*12);
    actor.previous=copy(actor.position);
  }
}
