import crypto from "node:crypto";
import { CheckpointWriter } from "./checkpoint-writer";
import { PresenceFrame, PresenceDelta } from "./presence";
import { developmentConnectionLimit } from "./world-policy";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { GameRepository } from "../game/repository";
import type { GameService } from "../game/service";
import type { GameSession, GameAction } from "../game/schemas";
import { buildArcanaSpells } from "../game/arcana-spells";
import { spatialLayout, spatialMove } from "../game/arcana-spatial";
import { GAME_HOUR_MS, REAL_DAY_MS, PHASE_DURATION_MS } from "../game/base-data";
import { OnlineAccounts, OnlineError, type Character, type Principal } from "./accounts";
import { OnlineStore } from "./store";
import { newWorld, cast, tickCombat, type Death } from "./combat";
import { inField, samePlace, type Actor, type SharedWorld, type Place, type Point } from "./model";

type Connection = {sessionId:string;controller:string;send:(value:unknown)=>void;close:(code:number,reason:string)=>void};
type Checkpoint = {world:SharedWorld;actors:Actor[]};
type LayoutArea = {rectangles:{x:number;y:number;w:number;h:number}[];bounds:{x:number;y:number;w:number;h:number};spawn:Point;doors:{id:string;x:number;y:number;radius:number;arrival?:Point}[];walkable?:Record<string,boolean>;floorDomain?:{origin:Point;cellSize:number;cells:Record<string,boolean>}};
type Layouts = Record<string,LayoutArea>;
const copy=(p:Point)=>({...p});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** World mutations are serialized; immutable checkpoints commit on a separate ordered writer. */
export class ArcanaWorld {
  private world:SharedWorld=newWorld();
  private actors=new Map<string,Actor>();
  private connections=new Map<string,Connection>();
  private tail:Promise<unknown>=Promise.resolve();
  private timer:ReturnType<typeof setInterval>|null=null;
  private lastTick=Date.now();
  private lastSave=0;
  private ticks=0;
  private stopped=false;
  private starting:Promise<boolean>|null=null;
  private tickQueued=false;
  private failed=false;
  private layouts:Layouts={};
  private writer:CheckpointWriter;
  private retired=new Map<string,Actor>();
  private views=new WeakMap<Connection,PresenceDelta>();
  private spellCache=new WeakMap<Actor,{key:string;spells:ReturnType<typeof buildArcanaSpells>}>();
  private sentSpells=new WeakMap<Connection,unknown>();
  // One persistent world; this nullable limit is temporary development admission control.
  readonly capacity=developmentConnectionLimit();
  constructor(private store:OnlineStore,private accounts:OnlineAccounts,private repository:GameRepository,private games:GameService) {
    this.writer=new CheckpointWriter(store,error=>this.fail(error));
    const source=resolve(process.cwd(),"godot-arcana/art/export/online-layout.json");
    if(existsSync(source))this.layouts=JSON.parse(readFileSync(source,"utf8"));
  }
  private async serial<T>(operation:()=>Promise<T>):Promise<T> {
    const previous=this.tail;let release!:()=>void;this.tail=new Promise<void>(r=>release=r);await previous;
    try {if(this.stopped || this.failed || !this.store.healthy)throw new OnlineError("world_unavailable","세계 서버가 복구 중입니다. 잠시 후 다시 연결해 주세요.",503);return await operation();}
    finally {release();}
  }
  async start() {
    if(this.timer)return true;
    if(this.starting)return this.starting;
    this.starting=this.startOnce();
    try{return await this.starting;}finally{this.starting=null;}
  }
  private async startOnce() {
    if(!await this.store.acquireWorld())return false;
    const saved=await this.store.transaction(tx=>tx.get<Checkpoint>("world","main"));
    if(saved) {
      this.world=saved.world;
      this.world.elapsedMs+=Math.max(0,Date.now()-this.world.updatedAt);
      this.world.projectiles=[];this.world.meteors=[];this.world.barrages=[];
      for(const actor of saved.actors) {this.restoreShopPosition(actor);actor.disconnectedAt=Date.now();actor.lastMoveAt=Date.now();this.actors.set(actor.character.id,actor);}
    }
    this.lastTick=Date.now();
    this.timer=setInterval(()=>{if(this.tickQueued)return;this.tickQueued=true;void this.serial(()=>this.tick()).catch(error=>this.fail(error)).finally(()=>{this.tickQueued=false;});},50);
    this.timer.unref();
    return true;
  }
  private fail(error:unknown) {
    if(this.stopped)return;
    this.failed=true;
    if(this.timer)clearInterval(this.timer);
    for(const connection of this.connections.values())connection.close(1011,"World persistence unavailable");
    this.connections.clear();
    console.error("arcana world stopped:",error instanceof Error?error.message:"unknown");
  }
  private area(place:Place) {return this.layouts[place.interior+":"+place.floor] || this.layouts[place.interior] || this.layouts["outside"];}
  private validPoint(place:Place,point:Point) {
    const area=this.area(place);
    if(!area) return !place.interior && point.x>=32 && point.x<=1110 && point.y>=48 && point.y<=1400;
    const b=area.bounds;
    if(point.x<b.x || point.y<b.y || point.x>b.x+b.w || point.y>b.y+b.h)return false;
    if(area.walkable && !area.walkable[Math.round(point.x)+":"+Math.round(point.y)])return false;
    if(area.floorDomain) {
      const domain=area.floorDomain;
      for(const [dx,dy] of [[-3,-3],[3,-3],[3,3],[-3,3]]) {
        const x=Math.floor((point.x+dx-Math.sign(dx)*Math.SQRT1_2*.001-domain.origin.x)/domain.cellSize);
        const y=Math.floor((point.y+dy-Math.sign(dy)*Math.SQRT1_2*.001-domain.origin.y)/domain.cellSize);
        if(!domain.cells[x+":"+y])return false;
      }
    }
    return !area.rectangles.some(r=>point.x>=r.x-3 && point.x<=r.x+r.w+3 && point.y>=r.y-3 && point.y<=r.y+r.h+3);
  }
  private restoreShopPosition(actor:Actor) {
    if(actor.place.interior!=="arcana_shop" || this.validPoint(actor.place,actor.position))return;
    actor.position=copy(this.area(actor.place).spawn);
    actor.previous=copy(actor.position);actor.walking=false;
  }
  private move(actor:Actor,point:Point,speed=1) {
    const budget=Math.min(24*speed,(actor.moveCredit || 0)+48*speed*Math.min(.5,Math.max(0,(Date.now()-actor.lastMoveAt)/1000)));
    const before=copy(actor.position);
    const length=distance(actor.position,point),factor=Math.min(1,budget/Math.max(.001,length));
    const to={x:actor.position.x+(point.x-actor.position.x)*factor,y:actor.position.y+(point.y-actor.position.y)*factor};
    actor.position=this.resolveMove(actor.place,actor.position,to);
    actor.moveCredit=Math.max(0,budget-distance(before,actor.position));
    actor.walking=distance(actor.previous,actor.position)>.01;
    actor.lastMoveAt=Date.now();
  }
  private resolveMove(place:Place,from:Point,to:Point) {
    const destination=!place.interior?spatialMove(from,to,3):to;
    const result=copy(from),steps=Math.max(1,Math.ceil(distance(from,destination)));
    for(let i=1;i<=steps;i++) {
      const next={x:from.x+(destination.x-from.x)*i/steps,y:from.y+(destination.y-from.y)*i/steps};
      if(this.validPoint(place,{x:next.x,y:result.y}))result.x=next.x;
      if(this.validPoint(place,{x:result.x,y:next.y}))result.y=next.y;
    }
    return result;
  }
  private synchronize(actor:Actor) {
    const state=actor.game.state;
    state.flags.arcana_online=true;state.arcanaCombat.battle=null;state.activeClock={ownerId:null,heartbeatAt:0,sequence:0,paused:true};
    state.worldElapsedMs=this.world.elapsedMs;state.day=Math.floor(this.world.elapsedMs/REAL_DAY_MS)+1;
    state.phaseIndex=Math.min(4,Math.floor(this.world.elapsedMs%REAL_DAY_MS/PHASE_DURATION_MS));state.lastRealTimestamp=Date.now();
    actor.game.updatedAt=new Date().toISOString();
  }
  private async tick() {
    if(this.writer.lagMs>5000)throw new Error("Checkpoint backlog exceeded five seconds");
    const now=Date.now(),seconds=Math.min(.25,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;
    this.world.elapsedMs+=seconds*1000;this.world.updatedAt=now;this.world.revision++;
    for(const [id,actor] of this.actors) {
      const connection=this.connections.get(id);
      if(connection && (now-actor.lastSeen>40000 || now>actor.sessionExpires)) {connection.close(1001,"Heartbeat timeout");this.connections.delete(id);actor.disconnectedAt=now;}
      if(!connection && actor.disconnectedAt===null)actor.disconnectedAt=now;
      if(actor.disconnectedAt!==null && now-actor.disconnectedAt>=30000) await this.remove(id);
    }
    const beforeRevision=this.world.revision;
    const deaths:Death[]=[];tickCombat(this.world,this.actors,seconds,deaths);
    for(const actor of this.actors.values()) {this.synchronize(actor);actor.version++;}
    if(deaths.length || this.world.events.some(e=>e.id>beforeRevision && e.kind==="defeat") || now-this.lastSave>=1000)await this.persist(deaths);
    if(++this.ticks%2===0) {
      const frame=new PresenceFrame(this.actors.values(),this.world.events);
      for(const [id,connection] of this.connections) {
        const actor=this.actors.get(id);if(actor)connection.send({world:this.packet(actor,frame,connection)});
      }
    }
  }
  private async persist(deaths:Death[]=[]) {
    const actors=[...this.actors.values()],retired=[...this.retired.values()];
    for(const actor of actors)this.synchronize(actor);
    this.writer.enqueue({world:this.world,actors},[...retired,...actors].map(actor=>actor.game),deaths,retired);
    this.retired.clear();
    this.lastSave=Date.now();
  }
  async join(principal:Principal,controller:string,takeover=false) {
    if(!await this.start())throw new OnlineError("world_starting","세계 서버가 재시작 중입니다. 잠시 후 다시 입장해 주세요.",503);
    const character=await this.accounts.ensureCharacter(principal);
    return this.serial(async()=>{
      if(character.archived || (character.blockedUntil||0)>Date.now())throw new OnlineError("access_restricted","접속이 제한된 캐릭터입니다.",403);
      const existing=this.actors.get(character.id);
      if(existing) {
        const connection=this.connections.get(character.id);
        if(connection && existing.controller!==controller && !takeover)throw new OnlineError("already_connected","다른 창이나 기기에서 접속 중입니다. 현재 접속을 종료하고 이어받으시겠습니까?");
        if(connection) {connection.close(4001,"Connection taken over");this.connections.delete(character.id);}
        existing.controller=controller;existing.sessionId=principal.sessionId;existing.character=character;existing.disconnectedAt=this.connections.has(character.id)?null:Date.now();existing.lastSeen=Date.now();existing.sessionExpires=principal.expires;
        this.restoreShopPosition(existing);
        existing.accepted=0;existing.lastMoveAt=Date.now();
        return this.joinReply(existing);
      }
      if(this.capacity!==null && this.actors.size>=this.capacity)throw new OnlineError("world_full","개발 중 임시 동시 접속 제한("+this.capacity+"명)에 도달했습니다. 잠시 후 다시 입장해 주세요.");
      const game=await this.repository.loadGame(character.gameId);
      game.state.arcanaCombat.battle=null;game.state.location="arcana_plaza";game.state.flags.in_magic_world=true;
      const saved=await this.store.transaction(tx=>tx.get<{place:Place;position:Point}>("position",character.id));
      const place=saved?.place || {location:"arcana_plaza",interior:"",floor:0};
      const position=saved && this.validPoint(place,saved.position)?saved.position:copy(this.area(place)?.spawn || spatialLayout().spawn);
      game.state.location=place.location;
      const actor:Actor={character,game,place,position,previous:copy(position),direction:{x:0,y:1},walking:false,bench:"",gait:0,lastMoveAt:Date.now(),disconnectedAt:Date.now(),sessionId:principal.sessionId,controller,accepted:0,version:0,lastSeen:Date.now(),sessionExpires:principal.expires};
      this.actors.set(character.id,actor);this.synchronize(actor);
      await this.persist();
      return this.joinReply(actor);
    });
  }
  private joinReply(actor:Actor) {
    return {worldId:"main",characterId:actor.character.id,capacity:this.capacity,gameId:actor.game.id,snapshot:this.full(actor),world:this.packet(actor),position:actor.position,place:actor.place};
  }
  private fighting(actor:Actor) {
    const id=actor.character.id;
    return this.world.enemy.hp>0 && (this.world.enemy.contribution[id] || 0)>0 || this.world.projectiles.some(p=>p.ownerId===id) || this.world.meteors.some(p=>p.ownerId===id) || this.world.barrages.some(p=>p.ownerId===id);
  }
  private battle(actor:Actor) {
    if(!inField(actor))return null;
    const e=this.world.enemy;
    return {id:"world-main",online:true,selfCombat:this.fighting(actor),phase:e.behavior==="neutral" || e.hp<=0?"ready" as const:"battle" as const,enemyHp:e.hp,attackIn:e.attackIn,paused:false,log:[],
      spatial:{encounterId:"plaza_slime" as const,enemy:copy(e.position),home:copy(e.home),behavior:e.behavior,jumpFrom:e.jumpFrom,jumpTo:e.jumpTo,jumpHit:e.jumpHit,jumpElapsed:e.jumpElapsed,targetLocked:e.targetLocked,
        enemies:[e],primaryEnemyId:e.id,player:copy(actor.position),previousPlayer:copy(actor.previous),elapsed:this.world.elapsedMs/1000,revision:this.world.revision,projectiles:this.world.projectiles,meteors:this.world.meteors,barrage:null,
        events:this.world.events.filter(event=>!event.targetPlayerId || event.targetPlayerId===actor.character.id).map(event=>event.kind==="enemy_down" && event.actorId!==actor.character.id?{...event,rewards:undefined}:event)}};
  }
  full(actor:Actor) {
    this.synchronize(actor);const projected=structuredClone(actor.game);projected.state.arcanaCombat.battle=this.battle(actor);
    const personal={...projected.state,arcanaCombat:{...projected.state.arcanaCombat,battle:this.fighting(actor)?projected.state.arcanaCombat.battle:null}};
    return {...this.games.snapshotForOnline(projected),arcanaSpells:buildArcanaSpells(personal),online:true,onlineFighting:this.fighting(actor),characterId:actor.character.id,place:actor.place,position:actor.position,placeRevision:actor.placeRevision || 0};
  }
  private spells(actor:Actor) {
    const c=actor.game.state.arcanaCombat,fighting=this.fighting(actor);
    const key=JSON.stringify([c.skillTraining,c.learnedSpells,c.activeSkills,c.passiveSkills,c.level,c.xp,c.unlockedSchools,fighting,actor.game.state.npcDialogue.active,actor.game.state.subwayExpedition.active]);
    const cached=this.spellCache.get(actor);if(cached?.key===key)return cached.spells;
    const spells=buildArcanaSpells({...actor.game.state,arcanaCombat:{...c,battle:fighting?this.battle(actor):null}});
    this.spellCache.set(actor,{key,spells});return spells;
  }
  private compact(actor:Actor,sequence=actor.accepted) {
    this.synchronize(actor);
    const combat={...actor.game.state.arcanaCombat,battle:this.battle(actor)};
    const projected={...actor.game.state,arcanaCombat:combat};
    return {spatialCombat:true,online:true,place:actor.place,position:actor.position,placeRevision:actor.placeRevision || 0,sequence,worldRevision:this.world.revision,characterId:actor.character.id,arcanaSpells:this.spells(actor),
      onlineFighting:this.fighting(actor),
      state:{arcanaCombat:combat,activeClock:actor.game.state.activeClock,location:actor.game.state.location,money:actor.game.state.money,inventory:actor.game.state.inventory,flags:actor.game.state.flags,day:projected.day,phaseIndex:projected.phaseIndex,worldElapsedMs:projected.worldElapsedMs}};
  }
  packet(actor:Actor,frame=new PresenceFrame(this.actors.values(),this.world.events),connection?:Connection) {
    let view=connection?this.views.get(connection):undefined;
    if(!view){view=new PresenceDelta();if(connection)this.views.set(connection,view);}
    const self:Partial<ReturnType<ArcanaWorld["compact"]>>=this.compact(actor);
    if(connection) {
      const spells=self.arcanaSpells;
      if(this.sentSpells.get(connection)===spells)delete self.arcanaSpells;
      else this.sentSpells.set(connection,spells);
    }
    return {id:"main",revision:this.world.revision,elapsedMs:this.world.elapsedMs,count:this.actors.size,capacity:this.capacity,self,...view.update(frame,actor)};
  }
  async attach(principal:Principal,controller:string,connection:Connection) {
    const character=await this.accounts.character(principal);
    if(!character)throw new OnlineError("join_required","먼저 세계에 입장해 주세요.",401);
    return this.serial(async()=>{
      const actor=this.actors.get(character.id);
      if(!actor || actor.controller!==controller || actor.sessionId!==principal.sessionId)throw new OnlineError("join_required","세계 입장 정보를 다시 확인해 주세요.",401);
      if(this.connections.has(character.id))throw new OnlineError("already_connected","이미 연결된 창입니다.");
      this.connections.set(character.id,connection);actor.disconnectedAt=null;actor.lastSeen=Date.now();
      connection.send({ready:true,protocol:3,world:this.packet(actor,undefined,connection)});
      return character.id;
    });
  }
  disconnect(id:string,connection:Connection) {
    void this.serial(async()=>{if(this.connections.get(id)!==connection)return;this.connections.delete(id);const actor=this.actors.get(id);if(actor)actor.disconnectedAt=Date.now();}).catch(()=>undefined);
  }
  async command(id:string,connection:Connection,input:{sequence:number;position?:Point;direction?:Point;bench?:string;gait?:number;floor?:number;command?:string;aim?:Point;target?:Point;developerSpeed?:boolean;placeRevision?:number}) {
    return this.serial(async()=>{
      const actor=this.actors.get(id);
      if(!actor || this.connections.get(id)!==connection)throw new OnlineError("connection_replaced","접속이 다른 창으로 이전되었습니다.",401);
      if(input.sequence<=actor.accepted)return this.compact(actor);
      actor.lastSeen=Date.now();
      if(input.placeRevision!==undefined && input.placeRevision!==(actor.placeRevision || 0))return {...this.compact(actor),resync:true};
      // Validate on a copy so rejected commands consume no resources or movement.
      const combatInput=!!input.command && input.command!=="spatial_sync";
      const old={...actor,place:{...actor.place},position:copy(actor.position),previous:copy(actor.previous),direction:copy(actor.direction),game:combatInput?{...actor.game,state:structuredClone(actor.game.state)}:actor.game};
      const oldWorld=combatInput?structuredClone(this.world):null;
      const deaths:Death[]=[];
      try {
        const cooldown=actor.game.state.arcanaCombat.cooldowns;
        if(input.position && cooldown.dodge<=4.8 && !(cooldown.teleport===0 && actor.game.state.arcanaCombat.evadeSeconds>.1))this.move(actor,input.position,input.developerSpeed && process.env.NODE_ENV!=="production" ? 3 : 1);
        if(input.floor && input.floor!==actor.place.floor)this.changeFloor(actor,input.floor);
        if(input.direction)actor.direction=copy(input.direction);
        if(input.bench!==undefined)actor.bench=input.bench;
        if(input.gait!==undefined)actor.gait=input.gait;
        if(actor.pending && input.command && input.command!=="spatial_sync")throw new OnlineError("action_pending","현재 행동을 마친 뒤 사용해 주세요.");
        if(input.command)cast(this.world,actor,input.command,input.aim,input.target,deaths,(from,to)=>this.resolveMove(actor.place,from,to));
        actor.accepted=input.sequence;
        if(deaths.length)await this.persist(deaths);
        if(!input.command)return {accepted:input.sequence,worldRevision:this.world.revision};
        return this.compact(actor,input.sequence);
      } catch(error) {Object.assign(actor,old);if(oldWorld)this.world=oldWorld;throw error;}
    });
  }
  private changeFloor(actor:Actor,floor:number) {
    if(actor.place.interior!=="arcana_academy" || ![1,2].includes(floor))throw new OnlineError("invalid_floor","이동할 수 없는 층입니다.");
    const stair=actor.place.floor===1?{x:192,y:112}:{x:192,y:230};
    if(distance(actor.position,stair)>40)throw new OnlineError("stairs_required","계단 가까이에서 이동해 주세요.");
    actor.placeRevision=(actor.placeRevision || 0)+1;
    actor.place.floor=floor;actor.position=floor===1?{x:192,y:152}:{x:192,y:194};actor.previous=copy(actor.position);
  }
  async state(principal:Principal,gameId:string) {
    const owner=await this.accounts.authorize(gameId,principal);
    if(!owner.characterId)return null;
    return this.serial(async()=>{
      const actor=this.actors.get(owner.characterId!);
      if(actor)return this.full(actor);
      const session=await this.repository.loadGame(gameId);
      return {...this.games.snapshotForOnline(session),online:true};
    });
  }
  private async actorFor(principal:Principal,gameId:string) {
    const owner=await this.accounts.authorize(gameId,principal);
    const actor=owner.characterId?this.actors.get(owner.characterId):null;
    if(!actor || actor.sessionId!==principal.sessionId || !this.connections.has(actor.character.id))throw new OnlineError("join_required","아르카나 세계에 연결한 뒤 이용해 주세요.",401);
    return actor;
  }
  async personal(principal:Principal,gameId:string,action:GameAction) {
    if(action.type==="world_clock")return this.state(principal,gameId);
    const prepared=await this.serial(async()=>{
      const actor=await this.actorFor(principal,gameId);
      if(actor.pending)throw new OnlineError("action_pending","현재 행동을 마친 뒤 이용해 주세요.");
      if(action.type==="arcana_combat" && ["start","finish","pause","resume","retreat","spatial_sync","fireball","flame_wave","flame_guard","meteor","giant_fireball","flame_barrage","dodge","teleport","potion"].includes(action.command))throw new OnlineError("world_transport_required","아르카나 세계의 전투 연결을 사용해 주세요.",400);
      if((this.world.enemy.hp>0 && (this.world.enemy.contribution[actor.character.id] || 0)>0) || this.world.projectiles.some(p=>p.ownerId===actor.character.id) || this.world.meteors.some(p=>p.ownerId===actor.character.id) || this.world.barrages.some(p=>p.ownerId===actor.character.id))throw new OnlineError("combat_active","전투와 발사한 주문이 끝난 뒤 이용해 주세요.");
      if(action.type==="travel")this.validateTravel(actor,action.targetId);
      if(action.type==="arcana_combat" && action.command==="dev_sofa_rest" && process.env.NODE_ENV==="production")throw new OnlineError("development_only","개발 전용 기능입니다.",403);
      if(action.type==="academy_move") {
        const rooms:Record<string,Point & {floor:number}>={courtyard:{x:192,y:276,floor:1},hall:{x:192,y:222,floor:1},library:{x:88,y:151,floor:1},classroom:{x:284,y:171,floor:1},practice:{x:284,y:239,floor:1},headmaster:{x:96,y:170,floor:2},garden:{x:96,y:258,floor:2},observatory:{x:280,y:166,floor:2}};
        const room=rooms[action.roomId];
        if(actor.place.interior!=="arcana_academy" || !room || room.floor!==actor.place.floor || distance(actor.position,room)>60)throw new OnlineError("room_required","해당 층의 방 가까이에서 이용해 주세요.");
      }
      actor.pending=true;this.synchronize(actor);
      return {actor,baseline:structuredClone(actor.game),location:actor.game.state.location};
    });
    try {
      // LLM/network waits never hold the world's simulation queue.
      const result=await this.games.detachedOnlineAction(prepared.baseline,action);
      return await this.serial(async()=>{
        const actor=this.actors.get(prepared.actor.character.id);
        if(actor!==prepared.actor)throw new OnlineError("connection_changed","세계에 다시 입장한 뒤 진행을 확인해 주세요.");
        if(!result.state.flags.in_magic_world)throw new OnlineError("online_realm_only","온라인 캐릭터는 현재 아르카나에서만 활동할 수 있습니다.");
        const live=actor.game.state.arcanaCombat,base=prepared.baseline.state.arcanaCombat,next=result.state.arcanaCombat;
        next.hp=Math.max(0,Math.min(100,live.hp+next.hp-base.hp));
        next.mp=Math.max(0,Math.min(30,live.mp+next.mp-base.mp));
        next.cooldowns=live.cooldowns;next.guard=live.guard;next.evadeSeconds=live.evadeSeconds;
        actor.game=result;actor.pending=false;
        if(prepared.location!==result.state.location)this.arrive(actor,result.state.location);
        this.synchronize(actor);await this.persist();
        return this.full(actor);
      });
    } finally {
      await this.serial(async()=>{if(this.actors.get(prepared.actor.character.id)===prepared.actor)prepared.actor.pending=false;}).catch(()=>undefined);
    }
  }
  private validateTravel(actor:Actor,target:string) {
    if(target==="magic_city_entrance" || target==="shelter" || target==="arcana_return_portal")throw new OnlineError("online_realm_only","온라인 모험은 아르카나 안에서 계속됩니다.");
    const area=this.area(actor.place),nearDoor=area?.doors.some(d=>(d.id===target || (actor.place.interior && target==="arcana_plaza" && d.id==="exit")) && distance(actor.position,d)<=d.radius);
    if(!nearDoor)throw new OnlineError("entrance_required","출입구 가까이에서 이동해 주세요.");
  }
  private arrive(actor:Actor,location:string) {
    actor.placeRevision=(actor.placeRevision || 0)+1;
    const interior=["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy"].includes(location)?location:"";
    if(!interior && !actor.place.interior) { actor.place.location=location;return; }
    if(!interior && actor.place.interior) {
      const door=this.layouts.outside?.doors.find(d=>d.id===actor.place.interior);
      actor.position=door?copy(door.arrival || {x:door.x,y:door.y+12}):copy(spatialLayout().spawn);
    } else actor.position=copy(this.area({location,interior,floor:interior==="arcana_academy"?1:0})?.spawn || spatialLayout().spawn);
    actor.place={location,interior,floor:interior==="arcana_academy"?1:0};actor.previous=copy(actor.position);actor.lastMoveAt=Date.now();
  }
  private async remove(id:string) {
    const actor=this.actors.get(id);if(!actor)return;
    this.synchronize(actor);
    this.retired.set(id,structuredClone(actor));
    this.connections.get(id)?.close(1000,"Left world");this.connections.delete(id);this.actors.delete(id);
    delete this.world.enemy.contribution[id];
    this.world.projectiles=this.world.projectiles.filter(p=>p.ownerId!==id);this.world.meteors=this.world.meteors.filter(p=>p.ownerId!==id);this.world.barrages=this.world.barrages.filter(p=>p.ownerId!==id);
  }
  async save(principal:Principal,gameId:string) {
    return this.serial(async()=>{const actor=await this.actorFor(principal,gameId);await this.persist();return {exists:true,gameId,savedAt:actor.game.updatedAt,day:actor.game.state.day};}).then(async info=>{await this.writer.flush();return info;});
  }
  async leave(principal:Principal) {
    const character=await this.accounts.character(principal);
    if(character)await this.serial(async()=>{const actor=this.actors.get(character.id);if(actor?.sessionId===principal.sessionId){await this.remove(character.id);await this.persist();}});
    return {ok:true};
  }
  async revoke(sessionId:string) {
    await this.serial(async()=>{for(const actor of this.actors.values())if(actor.sessionId===sessionId) {this.connections.get(actor.character.id)?.close(4003,"Session ended");this.connections.delete(actor.character.id);actor.disconnectedAt=Date.now();}});
  }
  async refreshCharacters(ids:string[]) {
    await this.serial(async()=>{
      for(const actor of [...this.actors.values()])if(!ids.length || ids.includes(actor.character.id)) {
        const character=await this.store.transaction(tx=>tx.get<Character>("character",actor.character.id));
        if(!character || character.archived || (character.blockedUntil||0)>Date.now())await this.remove(actor.character.id);
        else actor.character=character;
      }
    });
  }
  async admin(characterId:string,seconds:number) {
    await this.store.transaction(async tx=>{const character=await tx.get<Character>("character",characterId);if(!character)throw new OnlineError("not_found","캐릭터가 없습니다.",404);await tx.put("character",characterId,{...character,blockedUntil:Date.now()+seconds*1000});});
    await this.serial(async()=>{await this.remove(characterId);await this.persist();});
  }
  async stop() {
    if(!this.timer || this.failed){await this.writer.flush();return;}
    if(this.timer)clearInterval(this.timer);this.timer=null;
    await this.serial(async()=>{for(const connection of this.connections.values())connection.close(1012,"Server restarting");this.connections.clear();for(const actor of this.actors.values())actor.disconnectedAt=Date.now();await this.persist();});
    this.stopped=true;
    await this.writer.flush();
  }
}
