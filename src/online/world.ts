import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { NetworkMetrics } from "./network-metrics";
import { CAMPFIRES, FOODS, initializeLife, tickHunger, lifeSkills, beginLife, lifeActive, cancelLife, completeLife, eatFish, placeCampfire, type LifeJob } from "./life";
import { CheckpointWriter } from "./checkpoint-writer";
import { protectedTrade, operation, knownOperation, reserveOperation, completeOperation, type ActionOperation, type ActionReceipt } from "./action-receipts";
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
import { ArcanaItemCatalog } from "./item-catalog";
import { newWorld, cast, tickCombat, type Death } from "./combat";
import { inField, samePlace, type Actor, type SharedWorld, type Place, type Point } from "./model";

import { ensureFishingRod, equipFishingRod, startFishing, fishingInput, tickFishing, fishingActive, type Fishing } from "./fishing";
type Connection = {sessionId:string;controller:string;send:(value:unknown)=>void;sendState?:(build:()=>unknown)=>void;close:(code:number,reason:string)=>void};
type Checkpoint = {world:SharedWorld;actors:Actor[]};
type LayoutArea = {rectangles:{x:number;y:number;w:number;h:number}[];bounds:{x:number;y:number;w:number;h:number};spawn:Point;fishing?:import("./fishing").FishingGeometry;doors:{id:string;x:number;y:number;radius:number;arrival?:Point}[];walkable?:Record<string,boolean>;floorDomain?:{origin:Point;cellSize:number;cells:Record<string,boolean>}};
type Layouts = Record<string,LayoutArea>;
const copy=(p:Point)=>({...p});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** World mutations are serialized; immutable checkpoints commit on a separate ordered writer. */
export class ArcanaWorld {
  private world:SharedWorld=newWorld();
  private fishing=new Map<string,Fishing>();
  private lifeJobs=new Map<string,LifeJob>();
  private actors=new Map<string,Actor>();
  private operations=new Map<string,{fingerprint:string;promise:Promise<unknown>}>();
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
  private persistencePaused=false;
  private layouts:Layouts={};
  private writer:CheckpointWriter;
  private retired=new Map<string,Actor>();
  private views=new WeakMap<Connection,PresenceDelta>();
  private metrics=new NetworkMetrics();
  private queuedOperations=0;
  private eventStreams=new WeakMap<Connection,{sent:number;pending:Map<number,SharedWorld["events"][number]>}>();
  private spellCache=new WeakMap<Actor,{key:string;spells:ReturnType<typeof buildArcanaSpells>}>();
  private sentSpells=new WeakMap<Connection,unknown>();
  // One persistent world; this nullable limit is temporary development admission control.
  readonly capacity=developmentConnectionLimit();
  constructor(private store:OnlineStore,private accounts:OnlineAccounts,private repository:GameRepository,private games:GameService,private itemCatalog?:ArcanaItemCatalog) {
    this.writer=new CheckpointWriter(store,error=>this.fail(error));
    const source=resolve(process.cwd(),"godot-arcana/art/export/online-layout.json");
    if(existsSync(source))this.layouts=JSON.parse(readFileSync(source,"utf8"));
  }
  private async serial<T>(operation:()=>Promise<T>,allowSaveDelay=false):Promise<T> {
    const queuedAt=performance.now();this.queuedOperations++;
    const previous=this.tail;let release!:()=>void;this.tail=new Promise<void>(r=>release=r);await previous;
    const started=performance.now();this.queuedOperations--;
    this.metrics.record("queueWaitMs",started-queuedAt);
    try {if(this.stopped || this.failed || !this.store.healthy || (!allowSaveDelay && this.writer.lagMs>5000))throw new OnlineError("world_unavailable","세계 서버가 복구 중입니다. 잠시 후 다시 연결해 주세요.",503);return await operation();}
    finally {this.metrics.record("operationMs",performance.now()-started);release();}
  }
  private async waitForSave() {
    const started=performance.now();
    try {await this.writer.flush();}finally{this.metrics.record("durableReplyWaitMs",performance.now()-started);}
  }
  health() {
    const status=this.stopped?"stopped":this.failed || !this.store.healthy?"failed":this.writer.lagMs>5000?"saving":this.timer?"running":"idle";
    return {ok:status!=="stopped" && status!=="failed" && status!=="saving",status};
  }
  diagnostics() {
    let pendingEvents=0;
    for(const connection of this.connections.values())pendingEvents=Math.max(pendingEvents,this.eventStreams.get(connection)?.pending.size || 0);
    return {revision:this.world.revision,players:this.actors.size,connections:this.connections.size,queuedOperations:this.queuedOperations,pendingEvents,failed:this.failed,timing:this.metrics.snapshot(),persistence:this.writer.diagnostics()};
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
      this.world=saved.world;this.world.campfires ??= {};
      this.world.elapsedMs+=Math.max(0,Date.now()-this.world.updatedAt);
      this.world.projectiles=[];this.world.meteors=[];this.world.barrages=[];
      for(const actor of saved.actors) {initializeLife(actor.game);this.restoreLayoutPosition(actor);actor.disconnectedAt=Date.now();actor.lastMoveAt=Date.now();actor.pending=false;this.actors.set(actor.character.id,actor);}
    }
    this.lastTick=Date.now();
    this.timer=setInterval(()=>{if(this.tickQueued)return;this.tickQueued=true;void this.serial(async()=>{const started=performance.now();try{await this.tick();}finally{this.metrics.record("tickWorkMs",performance.now()-started);}},true).catch(error=>this.fail(error)).finally(()=>{this.tickQueued=false;});},50);
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
  private campfirePoint(actor:Actor,point:Point) {
    if(actor.place.interior || distance(actor.position,point)>48 || distance(actor.position,point)<12)return false;
    if(![-8,0,8].every(x=>[-8,0,8].every(y=>this.validPoint(actor.place,{x:point.x+x,y:point.y+y}))))return false;
    if(this.area(actor.place)?.doors.some(d=>distance(d,point)<d.radius+12))return false;
    if(Object.values(this.world.campfires || {}).some(f=>f.expiresAt>Date.now() && distance(f.position,point)<20))return false;
    return ![...this.actors.values()].some(a=>!a.place.interior && distance(a.position,point)<12);
  }
  private validPoint(place:Place,point:Point) {
    if(!place.interior && Object.values(this.world.campfires || {}).some(f=>f.expiresAt>Date.now() && distance(point,f.position)<10))return false;
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
  private restoreLayoutPosition(actor:Actor) {
    // Outdoor edits can put an older checkpoint inside new water/embankments.
    if((actor.place.interior && actor.place.interior!=="arcana_shop") || this.validPoint(actor.place,actor.position))return;
    actor.position=copy(this.area(actor.place).spawn);
    actor.previous=copy(actor.position);actor.walking=false;actor.bench="";
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
    ensureFishingRod(actor);
    const state=actor.game.state;
    state.flags.arcana_online=true;state.arcanaCombat.battle=null;state.activeClock={ownerId:null,heartbeatAt:0,sequence:0,paused:true};
    state.worldElapsedMs=this.world.elapsedMs;state.day=Math.floor(this.world.elapsedMs/REAL_DAY_MS)+1;
    state.phaseIndex=Math.min(4,Math.floor(this.world.elapsedMs%REAL_DAY_MS/PHASE_DURATION_MS));state.lastRealTimestamp=Date.now();
    actor.game.updatedAt=new Date().toISOString();
  }
  private async tick() {
    // A delayed commit (including after host sleep) pauses simulation until it drains.
    // Only an actual store/write error permanently stops the world.
    if(this.writer.lagMs>5000) {
      if(!this.persistencePaused)console.warn("arcana world paused: checkpoint backlog exceeded five seconds");
      this.persistencePaused=true;this.lastTick=Date.now();return;
    }
    if(this.persistencePaused) {
      this.persistencePaused=false;this.lastTick=Date.now();
      console.info("arcana world resumed: checkpoint backlog cleared");
    }
    const now=Date.now(),seconds=Math.min(.25,Math.max(0,(now-this.lastTick)/1000));this.metrics.record("tickGapMs",Math.max(0,now-this.lastTick));this.lastTick=now;
    this.world.elapsedMs+=seconds*1000;this.world.updatedAt=now;this.world.revision++;
    for(const [id,actor] of this.actors) {
      const connection=this.connections.get(id);
      if(connection && (now-actor.lastSeen>40000 || now>actor.sessionExpires)) {connection.close(1001,"Heartbeat timeout");this.connections.delete(id);actor.disconnectedAt=now;}
      if(!connection && actor.disconnectedAt===null)actor.disconnectedAt=now;
      if(actor.disconnectedAt!==null && now-actor.disconnectedAt>=30000) await this.remove(id);
    }
    const beforeRevision=this.world.revision;
    const deaths:Death[]=[];tickCombat(this.world,this.actors,seconds,deaths);
    this.world.campfires ??= {};
    for(const [id,fire] of Object.entries(this.world.campfires))if(fire.expiresAt<=now)delete this.world.campfires[id];
    let caughtFish=false;
    for(const actor of this.actors.values()) {
      const f=this.fishing.get(actor.character.id);
      if(fishingActive(f) && (!this.connections.has(actor.character.id) || this.fighting(actor) || actor.game.state.arcanaCombat.hp<=0))this.fishing.delete(actor.character.id);
      else if(f) caughtFish=tickFishing(actor,f,seconds) || caughtFish;
      if(this.connections.has(actor.character.id))tickHunger(actor,seconds);
      const job=this.lifeJobs.get(actor.character.id);
      if(lifeActive(job)) {
        const fire=job!.campfireId?this.world.campfires[job!.campfireId]:undefined;
        if(!this.connections.has(actor.character.id) || this.fighting(actor) || actor.game.state.arcanaCombat.hp<=0 || distance(actor.position,job!.origin)>.75 || (job!.kind==="cook" && (!fire || actor.place.interior || distance(actor.position,fire.position)>26))) {
          cancelLife(job,"작업이 중단되었습니다. 재료는 소모하지 않았습니다.");
        } else if(now>=job!.endsAt) {
          try {completeLife(actor,job!);caughtFish=true;} catch {cancelLife(job,"재료가 부족해 작업을 마치지 못했습니다.");}
        }
      }
      this.synchronize(actor);actor.version++;
    }
    if(caughtFish || deaths.length || this.world.events.some(e=>e.id>beforeRevision && e.kind==="defeat") || now-this.lastSave>=1000)await this.persist(deaths);
    if(++this.ticks%2===0) {
      const frame=new PresenceFrame(this.actors.values(),this.world.events);
      for(const [id,connection] of this.connections) {
        const actor=this.actors.get(id);if(!actor)continue;
        const stream=this.eventStream(connection);
        if(!inField(actor)){stream.pending.clear();stream.sent=this.world.revision;}
        else for(const event of this.visibleEvents(actor))if(event.id>stream.sent)stream.pending.set(event.id,event);
        // Bound transient-event memory. Durable inventory/reward state survives a resync.
        if(stream.pending.size>256){connection.close(1013,"Event backlog requires resync");continue;}
        const build=()=>this.connections.get(id)===connection?{world:this.packet(actor,frame,connection)}:null;
        if(connection.sendState)connection.sendState(build);
        else connection.send(build());
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
        initializeLife(existing.game);this.restoreLayoutPosition(existing);
        existing.accepted=0;existing.lastMoveAt=Date.now();
        return this.joinReply(existing);
      }
      if(this.capacity!==null && this.actors.size>=this.capacity)throw new OnlineError("world_full","개발 중 임시 동시 접속 제한("+this.capacity+"명)에 도달했습니다. 잠시 후 다시 입장해 주세요.");
      const game=await this.repository.loadGame(character.gameId);
      game.state.arcanaCombat.battle=null;game.state.location="arcana_plaza";game.state.flags.in_magic_world=true;
      const stored=await this.store.transaction(async tx=>({position:await tx.get<{place:Place;position:Point}>("position",character.id),receipts:await tx.get<ActionReceipt[]>("action_receipts",character.id)}));
      const saved=stored.position;
      const place=saved?.place || {location:"arcana_plaza",interior:"",floor:0};
      const position=saved && this.validPoint(place,saved.position)?saved.position:copy(this.area(place)?.spawn || spatialLayout().spawn);
      game.state.location=place.location;
      const actor:Actor={character,game,place,position,previous:copy(position),direction:{x:0,y:1},walking:false,bench:"",gait:0,lastMoveAt:Date.now(),disconnectedAt:Date.now(),sessionId:principal.sessionId,controller,accepted:0,version:0,lastSeen:Date.now(),sessionExpires:principal.expires};
      actor.actionReceipts=stored.receipts || [];
      initializeLife(actor.game);this.actors.set(character.id,actor);this.synchronize(actor);
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
  private eventStream(connection:Connection) {
    let stream=this.eventStreams.get(connection);
    if(!stream){stream={sent:0,pending:new Map()};this.eventStreams.set(connection,stream);}
    return stream;
  }
  private visibleEvents(actor:Actor) {
    return this.world.events.filter(event=>!event.targetPlayerId || event.targetPlayerId===actor.character.id).map(event=>event.kind==="enemy_down" && event.actorId!==actor.character.id?{...event,rewards:undefined}:event);
  }
  private eventsFor(actor:Actor) {
    const connection=this.connections.get(actor.character.id);
    const pending=connection?this.eventStreams.get(connection)?.pending:undefined;
    if(!pending?.size)return this.visibleEvents(actor);
    const events=new Map(pending);
    for(const event of this.visibleEvents(actor))events.set(event.id,event);
    return [...events.values()].sort((a,b)=>a.id-b.id);
  }
  private battle(actor:Actor) {
    if(!inField(actor))return null;
    const e=this.world.enemy;
    return {id:"world-main",online:true,selfCombat:this.fighting(actor),phase:e.behavior==="neutral" || e.hp<=0?"ready" as const:"battle" as const,enemyHp:e.hp,attackIn:e.attackIn,paused:false,log:[],
      spatial:{encounterId:"plaza_slime" as const,enemy:copy(e.position),home:copy(e.home),behavior:e.behavior,jumpFrom:e.jumpFrom,jumpTo:e.jumpTo,jumpHit:e.jumpHit,jumpElapsed:e.jumpElapsed,targetLocked:e.targetLocked,
        enemies:[e],primaryEnemyId:e.id,player:copy(actor.position),previousPlayer:copy(actor.previous),elapsed:this.world.elapsedMs/1000,revision:this.world.revision,projectiles:this.world.projectiles,meteors:this.world.meteors,barrage:null,
        events:this.eventsFor(actor)}};
  }
  full(actor:Actor) {
    this.synchronize(actor);const projected=structuredClone(actor.game);projected.state.arcanaCombat.battle=this.battle(actor);
    const personal={...projected.state,arcanaCombat:{...projected.state.arcanaCombat,battle:this.fighting(actor)?projected.state.arcanaCombat.battle:null}};
    return {...this.games.snapshotForOnline(projected),arcanaItemCatalog:this.itemCatalog?.list() ?? [],arcanaSpells:buildArcanaSpells(personal),online:true,onlineFighting:this.fighting(actor),fishing:this.fishing.get(actor.character.id) ?? null,lifeActivity:this.lifeJobs.get(actor.character.id) ?? null,lifeSkills:lifeSkills(actor),characterId:actor.character.id,place:actor.place,position:actor.position,placeRevision:actor.placeRevision || 0};
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
      onlineFighting:this.fighting(actor),fishing:this.fishing.get(actor.character.id) ?? null,lifeActivity:this.lifeJobs.get(actor.character.id) ?? null,lifeSkills:lifeSkills(actor),
      state:{arcanaLife:actor.game.state.arcanaLife,arcanaCombat:combat,activeClock:actor.game.state.activeClock,location:actor.game.state.location,money:actor.game.state.money,inventory:actor.game.state.inventory,flags:actor.game.state.flags,day:projected.day,phaseIndex:projected.phaseIndex,worldElapsedMs:projected.worldElapsedMs}};
  }
  packet(actor:Actor,frame=new PresenceFrame(this.actors.values(),this.world.events),connection?:Connection) {
    const started=performance.now();
    let view=connection?this.views.get(connection):undefined;
    if(!view){view=new PresenceDelta();if(connection)this.views.set(connection,view);}
    const self:Partial<ReturnType<ArcanaWorld["compact"]>>=this.compact(actor);
    if(connection) {
      const spells=self.arcanaSpells;
      if(this.sentSpells.get(connection)===spells)delete self.arcanaSpells;
      else this.sentSpells.set(connection,spells);
    }
    const packet={campfires:Object.values(this.world.campfires || {}).filter(f=>f.expiresAt>Date.now() && !actor.place.interior && distance(actor.position,f.position)<448),serverNow:Date.now(),id:"main",revision:this.world.revision,elapsedMs:this.world.elapsedMs,count:this.actors.size,capacity:this.capacity,self,...view.update(frame,actor)};
    if(connection){const stream=this.eventStream(connection);stream.sent=this.world.revision;stream.pending.clear();}
    this.metrics.record("snapshotBuildMs",performance.now()-started);
    return packet;
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
    void this.serial(async()=>{if(this.connections.get(id)!==connection)return;this.fishing.delete(id);cancelLife(this.lifeJobs.get(id));this.connections.delete(id);const actor=this.actors.get(id);if(actor)actor.disconnectedAt=Date.now();}).catch(()=>undefined);
  }
  async command(id:string,connection:Connection,input:{sequence:number;actionId?:string;position?:Point;direction?:Point;bench?:string;gait?:number;floor?:number;command?:string;aim?:Point;target?:Point;developerSpeed?:boolean;placeRevision?:number;itemId?:string;campfireId?:string;recipeId?:string}) {
    return this.serial(async()=>{
      const actor=this.actors.get(id);
      if(!actor || this.connections.get(id)!==connection)throw new OnlineError("connection_replaced","접속이 다른 창으로 이전되었습니다.",401);
      const op=input.command==="potion"?operation(input.actionId,{command:"potion"}):input.command?.startsWith("life_") && input.command!=="life_cancel"?operation(input.actionId,{command:input.command,itemId:input.itemId,campfireId:input.campfireId,recipeId:input.recipeId,target:input.target}):undefined;
      if(op && knownOperation(actor,op))return {...this.compact(actor),actionReceipt:{id:op.id,duplicate:true}};
      if(op)reserveOperation(actor,op);
      if(input.sequence<=actor.accepted)return this.compact(actor);
      actor.lastSeen=Date.now();
      if(input.placeRevision!==undefined && input.placeRevision!==(actor.placeRevision || 0))return {...this.compact(actor),resync:true};
      // Validate on a copy so rejected commands consume no resources or movement.
      const combatInput=!!input.command && input.command!=="spatial_sync";
      const old={...actor,actionReceipts:actor.actionReceipts?.slice(),place:{...actor.place},position:copy(actor.position),previous:copy(actor.previous),direction:copy(actor.direction),game:combatInput?{...actor.game,state:structuredClone(actor.game.state)}:actor.game};
      const oldWorld=combatInput?structuredClone(this.world):null;
      const deaths:Death[]=[];
      try {
        const cooldown=actor.game.state.arcanaCombat.cooldowns;
        if(!fishingActive(this.fishing.get(id)) && input.position && cooldown.dodge<=4.8 && !(cooldown.teleport===0 && actor.game.state.arcanaCombat.evadeSeconds>.1))this.move(actor,input.position,input.developerSpeed && process.env.NODE_ENV!=="production" ? 3 : 1);
        if(!fishingActive(this.fishing.get(id)) && input.floor && input.floor!==actor.place.floor)this.changeFloor(actor,input.floor);
        if(input.direction)actor.direction=copy(input.direction);
        if(input.bench!==undefined)actor.bench=input.bench;
        if(input.gait!==undefined)actor.gait=input.gait;
        if(actor.pending && input.command && input.command!=="spatial_sync")throw new OnlineError("action_pending","현재 행동을 마친 뒤 사용해 주세요.");
        if(lifeActive(this.lifeJobs.get(id)) && input.command && input.command!=="spatial_sync" && input.command!=="life_cancel")throw new OnlineError("life_active","현재 제작·요리를 마치거나 취소해 주세요.");
        if(input.command?.startsWith("life_")) {
          if(input.command==="life_cancel")cancelLife(this.lifeJobs.get(id));
          else {
            if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("life_unavailable","낚시와 전투를 마친 뒤 이용해 주세요.");
            if(input.command==="life_craft")this.lifeJobs.set(id,beginLife(actor,"craft"));
            else if(input.command==="life_cook")this.lifeJobs.set(id,beginLife(actor,"cook",(this.world.campfires || {})[input.campfireId || ""],input.recipeId));
            else if(input.command==="life_eat")eatFish(actor,input.itemId || "");
            else if(input.command==="life_place") {
              if(!input.target || !this.campfirePoint(actor,input.target))throw new OnlineError("invalid_placement","가까운 빈 땅에 설치해 주세요. 물·장애물·출입구와 겹칠 수 없습니다.");
              const fire=placeCampfire(actor,input.itemId || "",input.target);
              (this.world.campfires ??= {})[fire.id]=fire;
            }
          }
        } else if(input.command?.startsWith("fishing_")) {
          if(input.command==="fishing_equip" || input.command==="fishing_unequip") {
            if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("fishing_active","전투와 낚시를 마친 뒤 장비를 바꿔 주세요.");
            equipFishingRod(actor,input.command==="fishing_equip");
            await this.persist();
          } else if(input.command==="fishing_cancel")this.fishing.delete(id);
          else if(input.command==="fishing_cast") {
            if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("fishing_unavailable","현재 낚시나 전투를 먼저 마쳐 주세요.");
            this.fishing.set(id,startFishing(actor,this.area(actor.place)?.fishing));
          } else {
            const f=this.fishing.get(id);
            if(f && fishingActive(f))fishingInput(f,input.command==="fishing_press");
          }
        } else if(input.command) {
          if(input.command!=="spatial_sync" && fishingActive(this.fishing.get(id)))throw new OnlineError("fishing_active","낚시를 마친 뒤 사용해 주세요.");
          cast(this.world,actor,input.command,input.aim,input.target,deaths,(from,to)=>this.resolveMove(actor.place,from,to),input.actionId);
        }
        actor.accepted=input.sequence;
        if(op)completeOperation(actor,op);
        if(deaths.length || op || input.command?.startsWith("life_"))await this.persist(deaths);
        if(!input.command)return {accepted:input.sequence,worldRevision:this.world.revision};
        return {...this.compact(actor,input.sequence),actionId:input.actionId,...(op?{actionReceipt:{id:op.id,duplicate:false}}:{})};
      } catch(error) {Object.assign(actor,old);if(oldWorld)this.world=oldWorld;throw error;}
    }).then(async result=>{
      if((input.command==="potion" || input.command?.startsWith("life_")) && "actionReceipt" in result)await this.waitForSave();
      return result;
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
  async recoverOperation(principal:Principal,gameId:string,id:string) {
    const found=await this.serial(async()=>{
      const actor=await this.actorFor(principal,gameId);
      return {actor,receipt:actor.actionReceipts?.some(v=>v.id===id),pending:this.operations.has(actor.character.id+":"+id)};
    });
    if(found.receipt) {
      await this.waitForSave();
      return this.serial(async()=>({status:"completed",actionReceipt:{id,duplicate:true},snapshot:this.full(found.actor)}));
    }
    return {status:found.pending?"pending":"unknown"};
  }
  async personal(principal:Principal,gameId:string,action:GameAction,actionId?:string):Promise<unknown> {
    if(!protectedTrade(action))return this.personalOnce(principal,gameId,action);
    const op=operation(actionId,action);
    const owner=await this.accounts.authorize(gameId,principal);
    const key=owner.characterId+":"+op.id;
    const pending=this.operations.get(key);
    if(pending) {
      if(pending.fingerprint!==op.fingerprint)throw new OnlineError("action_id_conflict","다른 행동에 사용된 요청 번호입니다.",409);
      return pending.promise;
    }
    const promise=this.personalOnce(principal,gameId,action,op).then(async result=>{
      await this.waitForSave();
      return this.serial(async()=>({...this.full(await this.actorFor(principal,gameId)),actionReceipt:{id:op.id,duplicate:result!==null && "actionReceipt" in result && result.actionReceipt.duplicate}}));
    });
    this.operations.set(key,{fingerprint:op.fingerprint,promise});
    try{return await promise;}finally{this.operations.delete(key);}
  }
  private async personalOnce(principal:Principal,gameId:string,action:GameAction,op?:ActionOperation) {
    if(action.type==="world_clock")return this.state(principal,gameId);
    const prepared=await this.serial(async()=>{
      const actor=await this.actorFor(principal,gameId);
      if(op && knownOperation(actor,op))return {actor,baseline:structuredClone(actor.game),location:actor.game.state.location,duplicate:true};
      if(op)reserveOperation(actor,op);
      if(lifeActive(this.lifeJobs.get(actor.character.id)))throw new OnlineError("life_active","현재 제작·요리를 마치거나 취소해 주세요.");
      if(action.type==="use_item" && (FOODS[action.itemId] || CAMPFIRES[action.itemId]))throw new OnlineError("world_transport_required","요리와 모닥불은 세계 연결에서 사용해 주세요.");
      if(fishingActive(this.fishing.get(actor.character.id)))throw new OnlineError("fishing_active","낚시를 마친 뒤 이용해 주세요.");
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
    if("duplicate" in prepared)return {...this.full(prepared.actor),actionReceipt:{id:op!.id,duplicate:true}};
    try {
      // LLM/network waits never hold the world's simulation queue.
      let result:GameSession;
      const actionStarted=performance.now();
      try {result=await this.games.detachedOnlineAction(prepared.baseline,action);}
      catch(error) {if(op)throw new OnlineError("transaction_rejected",error instanceof Error?error.message:"거래를 처리하지 못했습니다.",400);throw error;}
      finally {this.metrics.record("personalActionMs",performance.now()-actionStarted);}
      return await this.serial(async()=>{
        const actor=this.actors.get(prepared.actor.character.id);
        if(actor!==prepared.actor)throw new OnlineError("connection_changed","세계에 다시 입장한 뒤 진행을 확인해 주세요.");
        if(!result.state.flags.in_magic_world)throw new OnlineError("online_realm_only","온라인 캐릭터는 현재 아르카나에서만 활동할 수 있습니다.");
        const live=actor.game.state.arcanaCombat,base=prepared.baseline.state.arcanaCombat,next=result.state.arcanaCombat;
        next.hp=Math.max(0,Math.min(100,live.hp+next.hp-base.hp));
        next.mp=Math.max(0,Math.min(30,live.mp+next.mp-base.mp));
        next.cooldowns=live.cooldowns;next.guard=live.guard;next.evadeSeconds=live.evadeSeconds;
        result.state.arcanaLife=actor.game.state.arcanaLife;actor.game=result;actor.pending=false;
        if(prepared.location!==result.state.location)this.arrive(actor,result.state.location);
        if(op)completeOperation(actor,op);
        this.synchronize(actor);await this.persist();
        return {...this.full(actor),...(op?{actionReceipt:{id:op.id,duplicate:false}}:{})};
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
    this.fishing.delete(id);this.lifeJobs.delete(id);
    this.retired.set(id,structuredClone(actor));
    this.connections.get(id)?.close(1000,"Left world");this.connections.delete(id);this.actors.delete(id);
    delete this.world.enemy.contribution[id];
    this.world.projectiles=this.world.projectiles.filter(p=>p.ownerId!==id);this.world.meteors=this.world.meteors.filter(p=>p.ownerId!==id);this.world.barrages=this.world.barrages.filter(p=>p.ownerId!==id);
  }
  async save(principal:Principal,gameId:string) {
    return this.serial(async()=>{const actor=await this.actorFor(principal,gameId);await this.persist();return {exists:true,gameId,savedAt:actor.game.updatedAt,day:actor.game.state.day};}).then(async info=>{await this.waitForSave();return info;});
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
    if(!this.timer || this.failed){await this.waitForSave();return;}
    if(this.timer)clearInterval(this.timer);this.timer=null;
    await this.serial(async()=>{for(const connection of this.connections.values())connection.close(1012,"Server restarting");this.connections.clear();for(const actor of this.actors.values())actor.disconnectedAt=Date.now();await this.persist();},true);
    this.stopped=true;
    await this.waitForSave();
  }
}
