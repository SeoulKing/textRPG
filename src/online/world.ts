import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { NetworkMetrics } from "./network-metrics";
import { CAMPFIRES, FOODS, initializeLife, tickHunger, lifeSkills, requireLifeReady, transferHomeStorage, gatherLife, chopForestWood, forestTreeState, regrowForestTree, restLife, beginLife, lifeActive, cancelLife, completeLife, eatFish, placeCampfire, type Campfire, type ForestTreeGeometry, type LifeJob } from "./life";
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
import { FOREST_LOCATION } from "../game/arcana-forest";
import { MEADOW_ARRIVAL, MEADOW_BOUNDS, MEADOW_LOCATION } from "../game/arcana-meadow";
import { plazaEngagementPoint, spatialLayout, spatialMove, sweptCircle } from "../game/arcana-spatial";
import { REAL_DAY_MS, PHASE_DURATION_MS, PHASES } from "../game/base-data";
import { OnlineAccounts, OnlineError, type Character, type Principal } from "./accounts";
import { OnlineStore } from "./store";
import { ArcanaItemCatalog } from "./item-catalog";
import { ArcanaWearableSlotSchema } from "../game/schemas/arcana-item";
import type { HomeFurnitureCell, HomeFurnitureLayout, HomeFurnitureRotation } from "../game/schemas/game-state";
import { ensureStarterEquipment, equipmentLoadout, setEquipment } from "./equipment";
import { newEnemy, newWorld, cast, tickCombat, combatArena, enemyActionTiming, beginEnemyChase, plazaFireballCooldown, type Death } from "./combat";
import { academyMoveBlockedReason } from "../game/academy-navigation";
import { combatArea, isWorldMapField, placeArea, samePlace, type Actor, type CombatArea, type SavedPosition, type SharedEnemy, type SharedWorld, type Place, type Point } from "./model";

import { ensureFishingRod, equipFishingRod, startFishing, fishingInput, tickFishing, fishingActive, type Fishing } from "./fishing";
import { applySimpleHomesteadAction, simpleHomesteadView, type SimpleHomesteadAction } from "./simple-homestead";
import { advanceInnSupply, innMenuOpen, innSupplyView, tradeInnSupply, type InnSupplyRequest } from "./inn-supply";
import { furnitureFixture, homeFurnitureValidator, homeFurnitureView, migrateHomeFurniture, previewHomeFurniture, resolveHomeGeometry, type HomeFurnitureCatalog, type HomeFurnitureRect } from "./home-furniture";
type Connection = {sessionId:string;controller:string;send:(value:unknown)=>void;sendState?:(build:()=>unknown)=>void;close:(code:number,reason:string)=>void};
type CombatEventStream = {area:CombatArea;sent:number;pending:Map<number,SharedWorld["events"][number]>};
type SavedEnemy = Omit<SharedEnemy, "slimeAction" | "recoveryElapsed" | "hopCooldown" | "hasFled"> & {
  slimeAction?: SharedEnemy["slimeAction"] | "spread";
  recoveryElapsed?: number;
  hopCooldown?: number;
  hasFled?: boolean;
};
type Checkpoint = {world:Omit<SharedWorld, "enemy"> & {enemy:SavedEnemy};actors:Actor[]};
type TextPlace = "home_bed"|"home_kitchen"|"home_storage"|"academy_stairs"|"forest_trees";
type ForestTreeLayout = ForestTreeGeometry & {rectangles:HomeFurnitureRect[]};
type LayoutArea = {layoutId?:string;circles?:{localRadius:number;inverse:[number,number,number,number,number,number]}[];rooms?:Record<string,Point>;stairs?:Point;stairArrival?:Point;rectangles:HomeFurnitureRect[];bounds:HomeFurnitureRect;spawn:Point;fishing?:import("./fishing").FishingGeometry;doors:{id:string;x:number;y:number;radius:number;arrival?:Point}[];walkable?:Record<string,boolean>;floorDomain?:{origin:Point;cellSize:number;cells:Record<string,boolean>};furniture?:HomeFurnitureCatalog;forestTrees?:Record<string,ForestTreeLayout>};
type Layouts = Record<string,LayoutArea>;
type HomeFurnitureInput = {
  furnitureId?: string;
  layoutRevision?: number;
  furnitureOperation?: "place" | "store";
  furnitureCell?: HomeFurnitureCell;
  furnitureRotation?: HomeFurnitureRotation;
};
type WorldInput = HomeFurnitureInput & {
  sequence:number;actionId?:string;position?:Point;direction?:Point;bench?:string;gait?:number;floor?:number;textPlace?:TextPlace;
  command?:string;aim?:Point;target?:Point;targetLifeId?:string;developerSpeed?:boolean;placeRevision?:number;itemId?:string;
  quantity?:number;campfireId?:string;recipeId?:string;equipmentSlot?:typeof ArcanaWearableSlotSchema.options[number];treeId?:string;
};
const copy=(p:Point)=>({...p});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const inForest=(place:Place)=>place.location===FOREST_LOCATION && !place.interior;
const atInn = (place: Place) => place.location === "arcana_inn" && place.interior === "arcana_inn";
const hitsRect=(point:Point,rect:HomeFurnitureRect)=>point.x>=rect.x-3 && point.x<=rect.x+rect.w+3 && point.y>=rect.y-3 && point.y<=rect.y+rect.h+3;
const FOREST_TIMBER_OAK = "forest_trees";
const meadowArea:LayoutArea={bounds:MEADOW_BOUNDS,spawn:MEADOW_ARRIVAL,rectangles:[],doors:[]};
const homeCommands=new Set([
  "life_cook","life_craft","life_eat","life_rest","life_cancel","life_home_leave",
  "life_storage_open","life_storage_deposit","life_storage_withdraw",
  "equipment_set","fishing_equip","fishing_unequip","spatial_sync",
]);
const homeFurnitureCommands = new Set(["home_furniture_state", "home_furniture_preview", "home_furniture_update"]);
const homeInterior = (id: string) => "arcana_home:" + id;
function hasFurniture(area?: LayoutArea): area is LayoutArea & { furniture: HomeFurnitureCatalog } {
  return !!area?.furniture;
}

function worldCalendar(elapsedMs: number) {
  return {
    day: Math.floor(elapsedMs / REAL_DAY_MS) + 1,
    phaseIndex: Math.min(PHASES.length - 1, Math.floor(elapsedMs % REAL_DAY_MS / PHASE_DURATION_MS)),
  };
}

function meadowEngagementPoint(enemy: Point, player: Point, validPoint: (point: Point) => boolean) {
  const gap = distance(enemy, player);
  if (gap >= 24 && gap <= 64 && validPoint(player)) return player;
  const heading = gap > .001 ? Math.atan2(player.y - enemy.y, player.x - enemy.x) : Math.PI / 2;
  for (let step = 0; step < 8; step++) {
    const angle = heading + step * Math.PI / 4;
    const point = {x:enemy.x+Math.cos(angle)*40,y:enemy.y+Math.sin(angle)*40};
    if (validPoint(point)) return point;
  }
  return undefined;
}
const previousPlazaHomeArrivals: Point[]=[
  {x:2168,y:2247.67993164063},
  {x:2150.56005859375,y:2097.76000976563},
];
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
  private homeGeometry = new WeakMap<Actor, { saved?: HomeFurnitureLayout; area: LayoutArea }>();
  private pendingHomeFurniture = new WeakMap<Actor, { previous?: HomeFurnitureLayout }>();
  private writer:CheckpointWriter;
  private retired=new Map<string,Actor>();
  private views=new WeakMap<Connection,PresenceDelta>();
  private metrics=new NetworkMetrics();
  private queuedOperations=0;
  private eventStreams=new WeakMap<Connection,CombatEventStream>();
  private spellCache=new WeakMap<Actor,{key:string;spells:ReturnType<typeof buildArcanaSpells>}>();
  private sentSpells=new WeakMap<Connection,unknown>();
  private sentAccountState=new WeakMap<Connection,{signature:string;sentAt:number}>();
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
  private async waitForTradeSave() {
    try {
      await this.waitForSave();
    } catch {
      throw new OnlineError("world_unavailable", "거래 결과를 아직 확인할 수 없습니다. 다시 연결한 뒤 확인해 주세요.", 503);
    }
  }
  private requireTradePersistence() {
    if (!this.health().ok) {
      throw new OnlineError("world_unavailable", "세계 서버가 복구 중입니다. 잠시 후 다시 연결해 주세요.", 503);
    }
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
      const {slimeAction, recoveryElapsed = 0, hopCooldown = 0, hasFled = false, ...storedEnemy}=saved.world.enemy;
      const enemy:SharedEnemy={...storedEnemy,recoveryElapsed,hopCooldown,hasFled};
      if(slimeAction==="spread") {
        // Resume combat without replaying a removed action or restoring health.
        if(["prepare","attack","recover"].includes(enemy.behavior))enemy.behavior="chase";
        enemy.jumpFrom=copy(enemy.position);enemy.jumpTo=copy(enemy.position);enemy.jumpElapsed=0;
        enemy.jumpHit=false;enemy.targetLocked=false;enemy.recoveryElapsed=0;
        enemy.attackIn=spatialLayout().tuning.attackInterval;
      } else {
        enemy.slimeAction=slimeAction ?? (["prepare","attack","recover"].includes(enemy.behavior) ? "leap" : undefined);
      }
      this.world={...saved.world,enemy,campfires:saved.world.campfires ?? {}};
      this.world.projectiles=[];this.world.meteors=[];this.world.barrages=[];
      if(this.world.meadowCombat) {
        this.world.meadowCombat.projectiles=[];
        this.world.meadowCombat.meteors=[];
        this.world.meadowCombat.barrages=[];
      }
      if(this.layouts.outside?.layoutId==="plaza_v2" && distance(this.world.enemy.home,spatialLayout().home)>.01) {
        this.world.enemy=newEnemy();
      }
      for(const actor of saved.actors) {initializeLife(actor.game);this.restoreLayoutPosition(actor);actor.disconnectedAt=Date.now();actor.lastMoveAt=Date.now();actor.pending=false;this.actors.set(actor.character.id,actor);}
    }
    this.lastTick=Date.now();
    if(saved)this.advanceWorldClock(this.lastTick);
    else this.world.updatedAt=this.lastTick;
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
  private area(place:Place, homeOwner?: Actor) {
    if(!place.interior && isWorldMapField(place.location))return this.layouts[place.location] ?? meadowArea;
    if (!place.interior.startsWith(homeInterior(""))) {
      return this.layouts[place.interior+":"+place.floor] || this.layouts[place.interior] || this.layouts["outside"];
    }
    const base = this.layouts.arcana_home;
    const owner = homeOwner ?? this.actors.get(place.interior.slice(homeInterior("").length));
    if (!hasFurniture(base) || !owner || place.interior !== homeInterior(owner.character.id)) return base;
    const saved = owner.game.state.arcanaLife?.homeFurniture;
    const cached = this.homeGeometry.get(owner);
    if (cached && cached.saved === saved) return cached.area;
    const area = { ...base, ...resolveHomeGeometry(base, saved) };
    this.homeGeometry.set(owner, { saved, area });
    return area;
  }
  private homeFurnitureProjection(actor: Actor, includePending = false) {
    const area = this.layouts.arcana_home;
    const life = actor.game.state.arcanaLife;
    if (!hasFurniture(area) || !life?.atHome || actor.place.location !== "arcana_home" ||
        actor.place.interior !== homeInterior(actor.character.id)) return undefined;
    const pending = this.pendingHomeFurniture.get(actor);
    return homeFurnitureView(area.furniture, pending && !includePending ? pending.previous : life.homeFurniture);
  }
  private campfireInPlace(fire:Campfire,place:Place) {return !place.interior && (fire.area ?? "outside")===placeArea(place);}
  private campfirePoint(actor:Actor,point:Point) {
    if(actor.place.interior || distance(actor.position,point)>48 || distance(actor.position,point)<12)return false;
    if(isWorldMapField(actor.place.location) && distance(point,this.area(actor.place).spawn)<20)return false;
    if(![-8,0,8].every(x=>[-8,0,8].every(y=>this.validPoint(actor.place,{x:point.x+x,y:point.y+y}))))return false;
    if(this.area(actor.place)?.doors.some(d=>distance(d,point)<d.radius+12))return false;
    if(Object.values(this.world.campfires || {}).some(f=>this.campfireInPlace(f,actor.place) && f.expiresAt>Date.now() && distance(f.position,point)<20))return false;
    return ![...this.actors.values()].some(a=>samePlace(a.place,actor.place) && distance(a.position,point)<12);
  }
  private validPoint(place:Place,point:Point,homeOwner?:Actor) {
    if(!place.interior && Object.values(this.world.campfires || {}).some(f=>this.campfireInPlace(f,place) && f.expiresAt>Date.now() && distance(point,f.position)<10))return false;
    const area=this.area(place,homeOwner);
    if(!area) return !place.interior && point.x>=32 && point.x<=1110 && point.y>=48 && point.y<=1400;
    const b=area.bounds;
    if(point.x<b.x || point.y<b.y || point.x>b.x+b.w || point.y>b.y+b.h)return false;
    if(area.circles?.some(circle=>{
      const [xx,xy,yx,yy,ox,oy]=circle.inverse;
      const padding=3*Math.max(Math.hypot(xx,xy),Math.hypot(yx,yy));
      return Math.hypot(xx*point.x+yx*point.y+ox,xy*point.x+yy*point.y+oy)<circle.localRadius+padding;
    }))return false;
    if(area.walkable && !area.walkable[Math.round(point.x)+":"+Math.round(point.y)])return false;
    if(area.floorDomain) {
      const domain=area.floorDomain;
      for(const [dx,dy] of [[-3,-3],[3,-3],[3,3],[-3,3]]) {
        const x=Math.floor((point.x+dx-Math.sign(dx)*Math.SQRT1_2*.001-domain.origin.x)/domain.cellSize);
        const y=Math.floor((point.y+dy-Math.sign(dy)*Math.SQRT1_2*.001-domain.origin.y)/domain.cellSize);
        if(!domain.cells[x+":"+y])return false;
      }
    }
    if(area.rectangles.some(rect=>hitsRect(point,rect)))return false;
    return !area.forestTrees || !Object.entries(area.forestTrees).some(([id,tree])=>
      this.world.forestTrees?.[id]?.health!==0 && tree.rectangles.some(rect=>hitsRect(point,rect)));
  }
  private restoreLayoutPosition(actor:Actor) {
    const home = this.layouts.arcana_home;
    const life = actor.game.state.arcanaLife;
    if (life?.homeFurniture && hasFurniture(home)) {
      life.homeFurniture = migrateHomeFurniture(home, life.homeFurniture);
    }
    if(!actor.place.interior && this.layouts.outside?.layoutId==="plaza_v2" && actor.place.location!=="arcana_plaza" && !isWorldMapField(actor.place.location)) {
      actor.place={location:"arcana_plaza",interior:"",floor:0};
      actor.game.state.location=actor.place.location;
      actor.placeRevision=(actor.placeRevision || 0)+1;
    }
    // Private homes are persistent places and never share a presence bucket.
    if(life?.atHome) {
      actor.place={location:"arcana_home",interior:homeInterior(actor.character.id),floor:0};
      actor.game.state.location="arcana_home";
      if(home && !this.validPoint(actor.place,actor.position,actor)) {
        actor.position=copy(home.spawn);
        actor.walking=false;
        actor.bench="";
      }
      actor.previous=copy(actor.position);return;
    }
    if(actor.place.location==="arcana_home" || actor.place.interior.startsWith("arcana_home:")) {
      actor.place={location:"arcana_plaza",interior:"",floor:0};actor.position=copy(this.area(actor.place).spawn);actor.game.state.location="arcana_plaza";
    }
    if(inForest(actor.place)) {
      const forest=this.area(actor.place);
      if(forest?.layoutId && actor.positionLayoutId!==forest.layoutId) {
        actor.position=copy(forest.spawn);
        actor.previous=copy(forest.spawn);
        actor.walking=false;
        actor.bench="";
        actor.positionLayoutId=forest.layoutId;
      }
    }
    // Layout edits can put an older checkpoint inside new terrain or furniture.
    const interior=actor.place.interior;
    const usesTileInn=interior==="arcana_inn" && this.layouts.arcana_inn?.layoutId==="inn_tiles_v1";
    const usesTileRestaurant=interior==="arcana_restaurant" && this.layouts.arcana_restaurant?.layoutId==="restaurant_tiles_v1";
    if((interior && !usesTileInn && !usesTileRestaurant && !["arcana_shop","arcana_academy"].includes(interior)) || this.validPoint(actor.place,actor.position))return;
    actor.position=this.recoverBlockedPosition(actor.place,actor.position);
    actor.previous=copy(actor.position);actor.walking=false;actor.bench="";
  }
  private recoverBlockedPosition(place:Place, saved:Point):Point {
    const area=this.area(place);
    const spawn=area?.spawn ?? spatialLayout().spawn;
    if(place.interior || area?.layoutId!=="plaza_v2")return copy(spawn);
    const bounds=area.bounds;
    const center={
      x:Math.max(bounds.x,Math.min(saved.x,bounds.x+bounds.w)),
      y:Math.max(bounds.y,Math.min(saved.y,bounds.y+bounds.h)),
    };
    if(this.validPoint(place,center))return center;
    // Search the nearby ground first, retaining the closest valid point across square rings.
    let closest=copy(spawn);
    let bestDistance=this.validPoint(place,spawn)?distance(center,spawn):Infinity;
    const consider=(dx:number,dy:number)=>{
      const d=Math.hypot(dx,dy);
      if(d>=bestDistance)return;
      const candidate={x:center.x+dx,y:center.y+dy};
      if(this.validPoint(place,candidate)){closest=candidate;bestDistance=d;}
    };
    const spacing=4;
    for(let radius=spacing;radius<bestDistance && radius<=Math.max(bounds.w,bounds.h);radius+=spacing) {
      for(let offset=-radius;offset<=radius;offset+=spacing) {
        consider(offset,-radius);
        consider(offset,radius);
        if(Math.abs(offset)<radius){consider(-radius,offset);consider(radius,offset);}
      }
    }
    return closest;
  }
  private move(actor:Actor,point:Point,speed=1) {
    const budget=Math.min(24*speed,(actor.moveCredit || 0)+48*speed*Math.min(.5,Math.max(0,(Date.now()-actor.lastMoveAt)/1000)));
    const before=copy(actor.position);
    const length=distance(actor.position,point),factor=Math.min(1,budget/Math.max(.001,length));
    const to={x:actor.position.x+(point.x-actor.position.x)*factor,y:actor.position.y+(point.y-actor.position.y)*factor};
    actor.position=this.resolveMove(actor.place,actor.position,to);
    actor.moveCredit=Math.max(0,budget-distance(before,actor.position));
    actor.walking=distance(before,actor.position)>.01;
    actor.lastMoveAt=Date.now();
  }
  private resolveMove(place:Place,from:Point,to:Point) {
    const destination=!place.interior && !isWorldMapField(place.location) && this.layouts.outside?.layoutId!=="plaza_v2"?spatialMove(from,to,3):to;
    const result=copy(from),steps=Math.max(1,Math.ceil(distance(from,destination)));
    const dx=(destination.x-from.x)/steps,dy=(destination.y-from.y)/steps;
    for(let i=0;i<steps;i++) {
      if(dx && this.validPoint(place,{x:result.x+dx,y:result.y}))result.x+=dx;
      if(dy && this.validPoint(place,{x:result.x,y:result.y+dy}))result.y+=dy;
    }
    return result;
  }
  private synchronize(actor:Actor) {
    ensureFishingRod(actor);
    ensureStarterEquipment(actor);
    const state=actor.game.state;
    state.flags.arcana_online=true;state.arcanaCombat.battle=null;state.activeClock={ownerId:null,heartbeatAt:0,sequence:0,paused:true};
    const {day,phaseIndex}=worldCalendar(this.world.elapsedMs);
    state.worldElapsedMs=this.world.elapsedMs;state.day=day;
    state.phaseIndex=phaseIndex;state.lastRealTimestamp=Date.now();
    actor.game.updatedAt=new Date().toISOString();
  }
  private advanceWorldClock(now:number) {
    const clockAt=Math.max(now,this.world.updatedAt);
    this.world.elapsedMs+=clockAt-this.world.updatedAt;
    this.world.updatedAt=clockAt;
    const {day,phaseIndex}=worldCalendar(this.world.elapsedMs);
    const menuOpen=innMenuOpen(this.world.elapsedMs);
    const supply=advanceInnSupply(this.world.innSupply,day,menuOpen);
    this.world.innSupply=supply;
    return {day,phaseIndex,menuOpen,supply};
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
    const now=Date.now(),gapMs=Math.max(0,now-this.lastTick);
    const seconds=Math.min(.25,gapMs/1000);
    this.metrics.record("tickGapMs",gapMs);this.lastTick=now;
    // Simulation steps are capped; the shared calendar follows wall-clock time.
    this.advanceWorldClock(now);
    this.world.revision++;
    for(const [id,actor] of this.actors) {
      const connection=this.connections.get(id);
      if(connection && (now-actor.lastSeen>40000 || now>actor.sessionExpires)) {connection.close(1001,"Heartbeat timeout");this.connections.delete(id);actor.disconnectedAt=now;}
      if(!connection && actor.disconnectedAt===null)actor.disconnectedAt=now;
      if(actor.disconnectedAt!==null && now-actor.disconnectedAt>=30000) await this.remove(id);
    }
    for(const [id,tree] of Object.entries(this.world.forestTrees ?? {})) {
      if(!tree.respawnAt || tree.respawnAt>now)continue;
      const rectangles=this.layouts[FOREST_LOCATION]?.forestTrees?.[id]?.rectangles ?? [];
      const occupied=[...this.actors.values()].some(actor=>inForest(actor.place) && rectangles.some(rect=>hitsRect(actor.position,rect)));
      if(!occupied)regrowForestTree(this.world,id);
    }
    const beforeRevision=this.world.revision;
    const deaths:Death[]=[];tickCombat(this.world,this.actors,seconds,deaths);
    this.world.campfires ??= {};
    for(const [id,fire] of Object.entries(this.world.campfires))if(fire.expiresAt<=now)delete this.world.campfires[id];
    let lifeRewardGranted=false;
    for(const actor of this.actors.values()) {
      const f=this.fishing.get(actor.character.id);
      if(fishingActive(f) && (!this.connections.has(actor.character.id) || this.fighting(actor) || actor.game.state.arcanaCombat.hp<=0))this.fishing.delete(actor.character.id);
      else if(f) lifeRewardGranted=tickFishing(actor,f,seconds) || lifeRewardGranted;
      if(this.connections.has(actor.character.id))tickHunger(actor,seconds);
      const job=this.lifeJobs.get(actor.character.id);
      if(lifeActive(job)) {
        const fire=job!.campfireId?this.world.campfires[job!.campfireId]:undefined;
        if(!this.connections.has(actor.character.id) || this.fighting(actor) || actor.game.state.arcanaCombat.hp<=0 || distance(actor.position,job!.origin)>.75 || (job!.kind==="cook" && (job!.homeKitchen?!(actor.game.state.arcanaLife?.atHome && actor.place.interior==="arcana_home:"+actor.character.id):(!fire || !this.campfireInPlace(fire,actor.place) || distance(actor.position,fire.position)>26)))) {
          cancelLife(job,"작업이 중단되었습니다.");
        } else if(now>=job!.endsAt) {
          try {completeLife(actor,job!);lifeRewardGranted=true;} catch {cancelLife(job,"재료가 부족해 작업을 마치지 못했습니다.");}
        }
      }
      this.synchronize(actor);actor.version++;
    }
    if(lifeRewardGranted || deaths.length || this.world.events.some(e=>e.id>beforeRevision && e.kind==="defeat") || now-this.lastSave>=1000)await this.persist(deaths);
    if(++this.ticks%2===0) {
      const frame=new PresenceFrame(this.actors.values(),this.world.events,this.fishing);
      for(const [id,connection] of this.connections) {
        const actor=this.actors.get(id);if(!actor)continue;
        const stream=this.fieldEventStream(actor);
        if(stream) {
          for(const event of this.visibleEvents(actor,stream.sent))stream.pending.set(event.id,event);
          // Bound transient-event memory. Durable inventory/reward state survives a resync.
          if(stream.pending.size>256){connection.close(1013,"Event backlog requires resync");continue;}
        }
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
      const stored=await this.store.transaction(async tx=>({position:await tx.get<SavedPosition>("position",character.id),receipts:await tx.get<ActionReceipt[]>("action_receipts",character.id)}));
      const saved=stored.position;
      const place=saved?.place || {location:"arcana_plaza",interior:"",floor:0};
      let position=copy(this.area(place)?.spawn || spatialLayout().spawn);
      if(saved)position=place.interior===homeInterior(character.id) || this.validPoint(place,saved.position)
        ?saved.position:this.recoverBlockedPosition(place,saved.position);
      game.state.location=place.location;
      const actor:Actor={character,game,place,position,positionLayoutId:saved?.positionLayoutId,previous:copy(position),direction:{x:0,y:1},walking:false,bench:"",gait:0,lastMoveAt:Date.now(),disconnectedAt:Date.now(),sessionId:principal.sessionId,controller,accepted:0,version:0,lastSeen:Date.now(),sessionExpires:principal.expires};
      initializeLife(actor.game);this.restoreLayoutPosition(actor);
      actor.actionReceipts=stored.receipts || [];
      this.actors.set(character.id,actor);this.synchronize(actor);
      await this.persist();
      return this.joinReply(actor);
    });
  }
  private joinReply(actor:Actor) {
    return {worldId:"main",characterId:actor.character.id,capacity:this.capacity,gameId:actor.game.id,snapshot:this.full(actor),world:this.packet(actor),position:actor.position,place:actor.place};
  }
  private fighting(actor:Actor) {
    const area=combatArea(actor);
    if(!area)return false;
    const arena=combatArena(this.world,area);
    const id=actor.character.id;
    return arena.enemy.hp>0 && arena.enemy.contribution[id]!==undefined || arena.projectiles.some(p=>p.ownerId===id) || arena.meteors.some(p=>p.ownerId===id) || arena.barrages.some(p=>p.ownerId===id);
  }
  private engageFieldEnemy(actor:Actor,area:CombatArea) {
    const meadow=area==="meadow";
    if (combatArea(actor)!==area || actor.place.location!==(meadow?MEADOW_LOCATION:"arcana_plaza") || actor.bench
      || actor.game.state.arcanaCombat.hp<=0 || actor.game.state.npcDialogue.active) {
      throw new OnlineError("combat_unavailable",meadow?"뿔소 초원에서 진흙코 뿔소를 선택해 주세요.":"분수 광장에서 슬라임을 선택해 주세요.");
    }
    const enemy=combatArena(this.world,area).enemy;
    if (enemy.hp<=0 || enemy.behavior==="return") {
      throw new OnlineError(meadow?"enemy_unavailable":"slime_unavailable",meadow?"진흙코 뿔소가 돌아온 뒤 다시 선택해 주세요.":"슬라임이 돌아온 뒤 다시 선택해 주세요.");
    }
    if (this.fighting(actor)) return;
    const validPoint = (point: Point) => this.validPoint(actor.place, point);
    let arrival: Point | undefined;
    if (meadow) {
      arrival = meadowEngagementPoint(enemy.position, actor.position, validPoint);
    } else {
      const fixedLeap = enemy.behavior === "prepare" && enemy.targetLocked && (enemy.slimeAction ?? "leap") === "leap";
      const movingOnFixedPath = enemy.behavior === "attack" || fixedLeap;
      const { enemyRadius, playerRadius } = spatialLayout().tuning;
      const contactRadius = enemyRadius + playerRadius;
      arrival = plazaEngagementPoint(enemy.position, point =>
        validPoint(point) && (!movingOnFixedPath || sweptCircle(enemy.position, enemy.jumpTo, point, point, contactRadius) === null));
      if (!arrival && movingOnFixedPath && plazaEngagementPoint(enemy.position, validPoint)) {
        throw new OnlineError("slime_path_busy", "슬라임의 이동이 끝나면 다시 선택해 주세요.");
      }
    }
    if (!arrival) throw new OnlineError(meadow?"enemy_unreachable":"slime_unreachable",meadow?"진흙코 뿔소에게 다가갈 자리가 없습니다.":"슬라임에게 다가갈 자리가 없습니다.");
    actor.position=arrival;
    actor.previous=copy(arrival);
    actor.walking=false;
    actor.moveCredit=0;
    actor.lastMoveAt=Date.now();
    actor.placeRevision=(actor.placeRevision || 0)+1;
    // A participant can draw aggro before dealing any damage.
    enemy.contribution[actor.character.id]=0;
    beginEnemyChase(enemy,area);
    this.world.revision++;
  }
  private retreat(actor:Actor) {
    const area=combatArea(actor);
    if(!area || !this.fighting(actor))return;
    const enemy=combatArena(this.world,area).enemy;
    if(enemy.hp>0 && enemy.behavior!=="return"
      && distance(actor.position,enemy.position)<=spatialLayout().tuning.chaseLimit) {
      throw new OnlineError("retreat_in_range",area==="meadow"?"진흙코 뿔소에게서 조금 더 멀어져야 합니다.":"슬라임에게서 조금 더 멀어져야 합니다.");
    }
    this.clearCombatParticipation(actor.character.id);
  }
  private clearCombatParticipation(id:string) {
    for(const arena of [this.world,this.world.meadowCombat]) {
      if(!arena)continue;
      delete arena.enemy.contribution[id];
      arena.projectiles=arena.projectiles.filter(projectile=>projectile.ownerId!==id);
      arena.meteors=arena.meteors.filter(meteor=>meteor.ownerId!==id);
      arena.barrages=arena.barrages.filter(barrage=>barrage.ownerId!==id);
    }
  }
  private fieldEventStream(actor:Actor) {
    const connection=this.connections.get(actor.character.id);
    if(!connection)return;
    const area=combatArea(actor);
    if(!area) {
      this.eventStreams.delete(connection);
      return;
    }
    let stream=this.eventStreams.get(connection);
    if(!stream || stream.area!==area) {
      // Start each field visit with current HP, without replaying earlier hit effects.
      const pending=new Map<number,SharedWorld["events"][number]>();
      if(stream) {
        for(const event of this.world.events) {
          if(event.id>stream.sent && event.kind==="defeat" && event.targetPlayerId===actor.character.id)pending.set(event.id,event);
        }
      }
      stream={area,sent:this.world.revision,pending};
      this.eventStreams.set(connection,stream);
    }
    return stream;
  }
  private visibleEvents(actor:Actor,after:number) {
    const area=combatArea(actor);
    return this.world.events.filter(event=>event.id>after && (event.area ?? "plaza")===area && (!event.targetPlayerId || event.targetPlayerId===actor.character.id)).map(event=>event.kind==="enemy_down" && event.actorId!==actor.character.id?{...event,rewards:undefined}:event);
  }
  private eventsFor(actor:Actor,stream:CombatEventStream) {
    const fresh=this.visibleEvents(actor,stream.sent);
    if(!stream.pending.size)return fresh;
    const events=new Map(stream.pending);
    for(const event of fresh)events.set(event.id,event);
    return [...events.values()].sort((a,b)=>a.id-b.id);
  }
  private battle(actor:Actor) {
    const stream=this.fieldEventStream(actor);
    const area=combatArea(actor);
    if(!area)return null;
    const arena=combatArena(this.world,area);
    const {hopCooldown: _hopCooldown, hasFled: _hasFled, ...e}=arena.enemy;
    const actionTiming=enemyActionTiming(e.slimeAction);
    const fireballCooldown=plazaFireballCooldown(this.world,actor);
    return {id:area==="meadow"?"world-meadow":"world-main",online:true,selfCombat:this.fighting(actor),phase:e.behavior==="neutral" || e.hp<=0?"ready" as const:"battle" as const,enemyHp:e.hp,attackIn:e.attackIn,paused:false,log:[],
      spatial:{encounterId:area==="meadow"?"meadow_ox" as const:"plaza_slime" as const,enemy:copy(e.position),home:copy(e.home),behavior:e.behavior,jumpFrom:e.jumpFrom,jumpTo:e.jumpTo,jumpHit:e.jumpHit,jumpElapsed:e.jumpElapsed,targetLocked:e.targetLocked,recoveryElapsed:e.recoveryElapsed,slimeAction:e.slimeAction,...actionTiming,
        ...(fireballCooldown?{plazaFireballCooldown:fireballCooldown}:{}),
        enemies:[{...e,...actionTiming}],primaryEnemyId:e.id,player:copy(actor.position),previousPlayer:copy(actor.previous),elapsed:this.world.elapsedMs/1000,revision:this.world.revision,projectiles:arena.projectiles,meteors:arena.meteors,barrage:null,
        events:stream?this.eventsFor(actor,stream):[]}};
  }
  private forestProjection(actor:Actor) {
    if(!inForest(actor.place))return {};
    const forestTree=forestTreeState(this.world,actor,FOREST_TIMBER_OAK);
    const forestTrees:Record<string,ReturnType<typeof forestTreeState>>={};
    for(const [id,tree] of Object.entries(this.world.forestTrees ?? {})) {
      if(tree.lastHitAt!==null)forestTrees[id]=forestTreeState(this.world,actor,id);
    }
    return {forestTree,forestTrees,forestHitsRequired:forestTree.hitsRequired};
  }
  full(actor:Actor) {
    this.synchronize(actor);const projected=structuredClone(actor.game);projected.state.arcanaCombat.battle=this.battle(actor);
    if (projected.state.arcanaLife) delete projected.state.arcanaLife.homeFurniture;
    const personal={...projected.state,arcanaCombat:{...projected.state.arcanaCombat,battle:this.fighting(actor)?projected.state.arcanaCombat.battle:null}};
    return {...this.games.snapshotForOnline(projected),...this.forestProjection(actor),arcanaItemCatalog:this.itemCatalog?.list() ?? [],arcanaEquipment:equipmentLoadout(personal),arcanaSpells:buildArcanaSpells(personal),online:true,onlineFighting:this.fighting(actor),fishing:this.fishing.get(actor.character.id) ?? null,lifeActivity:this.lifeJobs.get(actor.character.id) ?? null,lifeSkills:lifeSkills(actor),characterId:actor.character.id,place:actor.place,position:actor.position,placeRevision:actor.placeRevision || 0,homeFurniture:this.homeFurnitureProjection(actor)};
  }
  private spells(actor:Actor) {
    const c=actor.game.state.arcanaCombat,fighting=this.fighting(actor);
    const key=JSON.stringify([c.skillTraining,c.learnedSpells,c.activeSkills,c.passiveSkills,c.level,c.xp,c.unlockedSchools,fighting,actor.game.state.npcDialogue.active,actor.game.state.subwayExpedition.active]);
    const cached=this.spellCache.get(actor);if(cached?.key===key)return cached.spells;
    const spells=buildArcanaSpells({...actor.game.state,arcanaCombat:{...c,battle:fighting?this.battle(actor):null}});
    this.spellCache.set(actor,{key,spells});return spells;
  }
  private compact(actor:Actor,connection?:Connection) {
    this.synchronize(actor);
    const combat={...actor.game.state.arcanaCombat,battle:this.battle(actor)};
    const projected={...actor.game.state,arcanaCombat:combat};
    const spells=this.spells(actor);
    const life = actor.game.state.arcanaLife;
    const playingLife = life?.homeFurniture ? { ...life, homeFurniture: undefined } : life;
    return {spatialCombat:true,online:true,arcanaEquipment:equipmentLoadout(projected),place:actor.place,position:actor.position,placeRevision:actor.placeRevision || 0,sequence:actor.accepted,worldRevision:this.world.revision,characterId:actor.character.id,arcanaSpells:connection && this.sentSpells.get(connection)===spells?undefined:spells,
      onlineFighting:this.fighting(actor),fishing:this.fishing.get(actor.character.id) ?? null,lifeActivity:this.lifeJobs.get(actor.character.id) ?? null,lifeSkills:lifeSkills(actor),...this.forestProjection(actor),
      state:{arcanaLife:playingLife,arcanaCombat:combat,activeClock:actor.game.state.activeClock,location:actor.game.state.location,money:actor.game.state.money,inventory:actor.game.state.inventory,flags:actor.game.state.flags,day:projected.day,phaseIndex:projected.phaseIndex,worldElapsedMs:projected.worldElapsedMs}};
  }
  private stateForPacket(state:ReturnType<ArcanaWorld["compact"]>["state"],connection?:Connection) {
    if(!connection)return state;
    const {inventory,flags,money,activeClock,...liveState}=state;
    const signature=JSON.stringify([inventory,flags,money,activeClock]);
    const last=this.sentAccountState.get(connection),now=performance.now();
    // Refresh the baseline periodically as an HTTP snapshot can arrive after a world frame.
    if(last?.signature===signature && now-last.sentAt<2000)return liveState;
    this.sentAccountState.set(connection,{signature,sentAt:now});
    return state;
  }
  packet(actor:Actor,frame=new PresenceFrame(this.actors.values(),this.world.events,this.fishing),connection?:Connection,includeHomeFurniture=!connection) {
    const started=performance.now();
    let view=connection?this.views.get(connection):undefined;
    if(!view){view=new PresenceDelta();if(connection)this.views.set(connection,view);}
    const self=this.compact(actor,connection);
    if(connection && self.arcanaSpells)this.sentSpells.set(connection,self.arcanaSpells);
    const packet={campfires:Object.values(this.world.campfires || {}).filter(f=>f.expiresAt>Date.now() && this.campfireInPlace(f,actor.place) && distance(actor.position,f.position)<448),serverNow:Date.now(),id:"main",revision:this.world.revision,elapsedMs:this.world.elapsedMs,count:this.actors.size,capacity:this.capacity,self:{...self,state:this.stateForPacket(self.state,connection),homeFurniture:includeHomeFurniture?this.homeFurnitureProjection(actor):undefined},...view.update(frame,actor)};
    const stream=connection && this.eventStreams.get(connection);
    if(stream){stream.sent=this.world.revision;stream.pending.clear();}
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
      if (this.pendingHomeFurniture.has(actor)) await this.waitForSave();
      this.connections.set(character.id,connection);actor.disconnectedAt=null;actor.lastSeen=Date.now();
      connection.send({ready:true,protocol:3,world:this.packet(actor,undefined,connection,true)});
      return character.id;
    });
  }
  disconnect(id:string,connection:Connection) {
    void this.serial(async()=>{if(this.connections.get(id)!==connection)return;this.fishing.delete(id);cancelLife(this.lifeJobs.get(id));this.connections.delete(id);const actor=this.actors.get(id);if(actor)actor.disconnectedAt=Date.now();}).catch(()=>undefined);
  }
  async command(id:string,connection:Connection,input:WorldInput) {
    return this.serial(async()=>{
      const actor=this.actors.get(id);
      if(!actor || this.connections.get(id)!==connection)throw new OnlineError("connection_replaced","접속이 다른 창으로 이전되었습니다.",401);
      if (input.command && homeFurnitureCommands.has(input.command)) return this.editHomeFurniture(actor, connection, input);
      const lifeCommand=input.command?.startsWith("life_");
      const storageOpen=input.command==="life_storage_open";
      const op=input.command==="potion"?operation(input.actionId,{command:"potion"}):input.command==="equipment_set"
        ?operation(input.actionId,{command:input.command,slot:input.equipmentSlot,itemId:input.itemId})
        :lifeCommand && input.command!=="life_cancel" && !storageOpen?operation(input.actionId,{command:input.command,itemId:input.itemId,quantity:input.quantity,campfireId:input.campfireId,recipeId:input.recipeId,target:input.target,textPlace:input.textPlace,treeId:input.treeId}):undefined;
      if(op && knownOperation(actor,op))return {...this.compact(actor,connection),homeFurniture:input.command==="life_home_enter"?this.homeFurnitureProjection(actor,true):undefined,actionReceipt:{id:op.id,duplicate:true}};
      if(op)reserveOperation(actor,op);
      if(input.sequence<=actor.accepted)return this.compact(actor,connection);
      actor.lastSeen=Date.now();
      if(input.placeRevision!==undefined && input.placeRevision!==(actor.placeRevision || 0))return {...this.compact(actor,connection),resync:true};
      // Validate on a copy so rejected commands consume no resources or movement.
      const combatInput=!!input.command && input.command!=="spatial_sync";
      const old={...actor,plazaFireballReadyAtMs:actor.plazaFireballReadyAtMs,actionReceipts:actor.actionReceipts?.slice(),place:{...actor.place},position:copy(actor.position),previous:copy(actor.previous),direction:copy(actor.direction),game:combatInput?{...actor.game,state:structuredClone(actor.game.state)}:actor.game};
      const oldWorld=combatInput?structuredClone(this.world):null;
      const deaths:Death[]=[];
      try {
        const atHome=actor.game.state.arcanaLife?.atHome;
        if(atHome && input.command && !homeCommands.has(input.command)) {
          throw new OnlineError("home_action_required","집에서는 요리·제작·식사·휴식·보관과 장비 변경을 할 수 있습니다. 외출 후 이용해 주세요.");
        }
        const combat=actor.game.state.arcanaCombat,cooldown=combat.cooldowns;
        // Ignore position samples during the movement animation, independent of a spent dodge.
        const settlingAfterMove=cooldown.teleport===0 &&
          (combat.evadeSkill==="dodge" ? cooldown.dodge>5-.7 : combat.evadeSeconds>.1);
        const textPondCast=input.command==="fishing_cast_text_pond";
        if(!textPondCast && !fishingActive(this.fishing.get(id))) {
          if(input.floor && input.floor!==actor.place.floor)this.changeFloor(actor,input.floor,input.textPlace);
          else if(input.position && cooldown.dodge<=4.8 && !settlingAfterMove)this.move(actor,input.position,input.developerSpeed && process.env.NODE_ENV!=="production" ? 3 : 1);
          if(input.direction)actor.direction=copy(input.direction);
          if(input.bench!==undefined)actor.bench=input.bench;
          if(input.gait!==undefined)actor.gait=input.gait;
        }
        if(actor.pending && input.command && input.command!=="spatial_sync")throw new OnlineError("action_pending","현재 행동을 마친 뒤 사용해 주세요.");
        if(lifeActive(this.lifeJobs.get(id)) && input.command && input.command!=="spatial_sync" && input.command!=="life_cancel")throw new OnlineError("life_active","현재 제작·요리를 마치거나 취소해 주세요.");
        if(lifeCommand) {
          if(input.command==="life_cancel")cancelLife(this.lifeJobs.get(id));
          else {
            if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("life_unavailable","낚시와 전투를 마친 뒤 이용해 주세요.");
            if(input.command==="life_gather")gatherLife(actor);
            else if(input.command==="life_chop_wood") {
              const treeId=input.treeId ?? FOREST_TIMBER_OAK;
              const trees=this.layouts[FOREST_LOCATION]?.forestTrees;
              chopForestWood(actor,this.world,treeId,trees && Object.hasOwn(trees,treeId)?trees[treeId]:undefined,input.textPlace==="forest_trees");
            }
            else if(input.command==="life_rest") {
              if(atHome)this.requireHomeFeature(actor,"home_bed",input.textPlace);
              restLife(actor);
            }
            else if(input.command==="life_home_enter")this.enterHome(actor);
            else if(input.command==="life_home_leave")this.leaveHome(actor);
            else if(storageOpen || input.command==="life_storage_deposit" || input.command==="life_storage_withdraw") {
              requireLifeReady(actor);
              this.requireHomeFeature(actor,"home_storage",input.textPlace);
              if(!storageOpen)transferHomeStorage(actor,input.command==="life_storage_deposit",input.itemId,input.quantity);
            }
            else if(input.command==="life_craft")this.lifeJobs.set(id,beginLife(actor,"craft",undefined,input.recipeId,input.quantity));
            else if(input.command==="life_cook") {
              if(atHome)this.requireHomeFeature(actor,"home_kitchen",input.textPlace);
              const fire=(this.world.campfires || {})[input.campfireId || ""];
              this.lifeJobs.set(id,beginLife(actor,"cook",fire && this.campfireInPlace(fire,actor.place)?fire:undefined,input.recipeId,input.quantity));
            }
            else if(input.command==="life_eat") {
              const homeSeated=!!atHome && actor.bench==="seated";
              if(homeSeated)this.requireHomeFeature(actor,"home_sofa");
              eatFish(actor,input.itemId || "",homeSeated);
            }
            else if(input.command==="life_place") {
              if(!input.target || !this.campfirePoint(actor,input.target))throw new OnlineError("invalid_placement","가까운 빈 땅에 설치해 주세요. 물·장애물·출입구와 겹칠 수 없습니다.");
              const fire=placeCampfire(actor,input.itemId || "",input.target);
              if(isWorldMapField(actor.place.location))fire.area=actor.place.location;
              (this.world.campfires ??= {})[fire.id]=fire;
            } else throw new OnlineError("invalid_life_command","이용할 생활 행동을 다시 선택해 주세요.");
          }
        } else if(input.command==="equipment_set") {
          if(!input.equipmentSlot)throw new OnlineError("equipment_slot_required","장착 부위를 선택해 주세요.",400);
          if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("equipment_unavailable","전투와 낚시를 마친 뒤 장비를 바꿔 주세요.");
          setEquipment(actor,input.equipmentSlot,input.itemId);
        } else if(input.command?.startsWith("fishing_")) {
          if(input.command==="fishing_equip" || input.command==="fishing_unequip") {
            if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("fishing_active","전투와 낚시를 마친 뒤 장비를 바꿔 주세요.");
            equipFishingRod(actor,input.command==="fishing_equip");
            await this.persist();
          } else if(input.command==="fishing_cancel")this.fishing.delete(id);
          else if(input.command==="fishing_cast" || textPondCast) {
            if(fishingActive(this.fishing.get(id)) || this.fighting(actor))throw new OnlineError("fishing_unavailable","현재 낚시나 전투를 먼저 마쳐 주세요.");
            this.fishing.set(id,startFishing(actor,this.area(actor.place)?.fishing,textPondCast));
          } else {
            const f=this.fishing.get(id);
            if(f && fishingActive(f))fishingInput(f,input.command==="fishing_press");
          }
        } else if(input.command) {
          if(input.command!=="spatial_sync" && fishingActive(this.fishing.get(id)))throw new OnlineError("fishing_active","낚시를 마친 뒤 사용해 주세요.");
          if(input.command==="engage_plaza_slime")this.engageFieldEnemy(actor,"plaza");
          else if(input.command==="engage_meadow_ox")this.engageFieldEnemy(actor,"meadow");
          else if(input.command==="retreat")this.retreat(actor);
          else cast(this.world,actor,input.command,input.aim,input.target,deaths,(from,to)=>this.resolveMove(actor.place,from,to),input.actionId,input.targetLifeId);
        }
        actor.accepted=input.sequence;
        if(op)completeOperation(actor,op);
        if(deaths.length || op || (lifeCommand && !storageOpen))await this.persist(deaths);
        if(!input.command)return {accepted:input.sequence,worldRevision:this.world.revision};
        return {...this.compact(actor,connection),actionId:input.actionId,homeFurniture:input.command==="life_home_enter"?this.homeFurnitureProjection(actor,true):undefined,...(op?{actionReceipt:{id:op.id,duplicate:false}}:{})};
      } catch(error) {Object.assign(actor,old);if(oldWorld)this.world=oldWorld;throw error;}
    }).then(async result=>{
      if (!("actionReceipt" in result)) return result;
      if (input.command === "home_furniture_update") {
        const owner = this.actors.get(id);
        const pending = owner && this.pendingHomeFurniture.get(owner);
        try {
          await this.waitForSave();
        } finally {
          if (owner && pending && this.pendingHomeFurniture.get(owner) === pending) this.pendingHomeFurniture.delete(owner);
        }
      } else if (input.command === "potion" || input.command === "equipment_set" || input.command?.startsWith("life_")) {
        await this.waitForSave();
      }
      return result;
    });
  }
  private async editHomeFurniture(actor: Actor, connection: Connection, input: WorldInput) {
    const life = actor.game.state.arcanaLife;
    if (!life?.atHome || actor.place.location !== "arcana_home" || actor.place.interior !== homeInterior(actor.character.id)) {
      throw new OnlineError("home_required", "내 집 안에서 이용해 주세요.");
    }
    const area = this.layouts.arcana_home;
    if (!hasFurniture(area)) throw new OnlineError("home_layout_unavailable", "집의 배치 정보가 준비 중입니다.", 503);

    const response = (includePending = false) => ({
      ...this.compact(actor, connection), homeFurniture: this.homeFurnitureProjection(actor, includePending),
    });
    if (input.placeRevision !== undefined && input.placeRevision !== (actor.placeRevision || 0)) {
      return { ...response(), resync: true, error: "home_furniture_place", message: "집에 다시 들어온 뒤 꾸미기를 열어 주세요." };
    }
    const saved = life.homeFurniture;
    const revision = saved?.layoutRevision ?? 0;
    const { furnitureId, furnitureCell, furnitureRotation, furnitureOperation } = input;
    const update = input.command === "home_furniture_update";
    const place = furnitureOperation === "place";
    const op = update ? operation(input.actionId, {
      command: input.command, furnitureId, layoutRevision: input.layoutRevision, furnitureOperation,
      ...(place ? { furnitureCell, furnitureRotation } : {}),
    }) : undefined;
    if (op && knownOperation(actor, op)) {
      return { ...response(true), actionReceipt: { id: op.id, duplicate: true } };
    }
    if (this.pendingHomeFurniture.has(actor)) {
      return { ...response(), error: "home_furniture_pending", message: "앞선 가구 배치를 저장하고 있습니다." };
    }
    if (input.sequence <= actor.accepted) {
      return { ...response(), error: "home_furniture_input", message: "배치 정보를 새로 확인해 주세요." };
    }
    if (input.command === "home_furniture_state") {
      actor.accepted = input.sequence;
      actor.lastSeen = Date.now();
      return response();
    }
    if (input.layoutRevision !== revision) {
      return { ...response(), error: "home_furniture_revision", message: "집 배치가 바뀌었습니다. 새 배치에서 다시 선택해 주세요." };
    }
    requireLifeReady(actor);
    if (input.bench || actor.pending || lifeActive(this.lifeJobs.get(actor.character.id)) ||
        fishingActive(this.fishing.get(actor.character.id)) || this.fighting(actor)) {
      throw new OnlineError("home_furniture_unavailable", "진행 중인 행동을 마친 뒤 집을 꾸며 주세요.");
    }
    if (!furnitureId || !furnitureFixture(area.furniture, furnitureId)) {
      throw new OnlineError("home_furniture_missing", "집에서 옮길 가구를 골라 주세요.", 400);
    }

    // Use the last movement sample without moving the actor on a rejected edit.
    const proposed = { ...actor };
    if (input.position) this.move(proposed, input.position, input.developerSpeed && process.env.NODE_ENV !== "production" ? 3 : 1);
    proposed.accepted = input.sequence;
    proposed.lastSeen = Date.now();
    if (!op) {
      const preview = previewHomeFurniture(area, saved, proposed.position, furnitureId);
      Object.assign(actor, proposed);
      return { ...response(), homeFurniturePreview: preview };
    }
    if (!furnitureOperation || (place && (!furnitureCell || furnitureRotation === undefined))) {
      throw new OnlineError("home_furniture_selection", "가구를 놓을 칸과 방향을 골라 주세요.", 400);
    }
    if (!Number.isSafeInteger(revision + 1)) throw new OnlineError("home_furniture_revision", "집 배치 버전을 갱신할 수 없습니다.");
    const validator = homeFurnitureValidator(area, saved, proposed.position, furnitureId);
    const reason = place ? validator.place(furnitureCell!, furnitureRotation!) : validator.store();
    if (reason) throw new OnlineError("home_furniture_invalid", reason, 400);
    const assetId = area.furniture.fixtures[furnitureId].assetId;
    const next: HomeFurnitureLayout = {
      gridVersion: area.furniture.gridVersion,
      layoutRevision: revision + 1,
      overrides: { ...saved?.overrides, [furnitureId]: place
        ? { kind: "placed", assetId, cell: furnitureCell!, rotation: furnitureRotation! }
        : { kind: "stored", assetId } },
    };
    const previous = { ...actor, actionReceipts: actor.actionReceipts?.slice() };
    const pending = { previous: saved };
    try {
      reserveOperation(actor, op);
      proposed.actionReceipts = actor.actionReceipts;
      Object.assign(actor, proposed);
      actor.game.state.arcanaLife = { ...life, homeFurniture: next };
      completeOperation(actor, op);
      this.pendingHomeFurniture.set(actor, pending);
      await this.persist();
    } catch (error) {
      this.pendingHomeFurniture.delete(actor);
      actor.game.state.arcanaLife = life;
      Object.assign(actor, previous);
      throw error;
    }
    return { ...response(true), actionId: op.id, actionReceipt: { id: op.id, duplicate: false } };
  }
  private requireHomeFeature(actor:Actor,id:string,textPlace?:TextPlace) {
    if(!actor.game.state.arcanaLife?.atHome || actor.place.interior!=="arcana_home:"+actor.character.id) {
      throw new OnlineError("home_required","내 집 안에서 이용해 주세요.");
    }
    const feature=this.area(actor.place)?.doors.find(d=>d.id===id);
    if(!feature) {
      throw new OnlineError("home_layout_unavailable","집의 공간 정보가 준비 중입니다. 잠시 후 다시 이용해 주세요.");
    }
    if(textPlace!==id && distance(actor.position,feature)>feature.radius) {
      if(id==="home_storage")throw new OnlineError("home_room_required","보관함 가까이에서 이용해 주세요.");
      throw new OnlineError("home_room_required",id==="home_bed"?"침대 가까이에서 쉬어 주세요.":id==="home_sofa"?"안락의자에 앉아서 식사해 주세요.":"조리 설비 가까이에서 요리해 주세요.");
    }
  }
  private enterHome(actor:Actor) {
    requireLifeReady(actor);
    if(actor.place.location!=="arcana_plaza" || actor.place.interior) {
      throw new OnlineError("home_entrance_required","광장 야외에서 내 집으로 돌아가 주세요.");
    }
    if(!this.layouts.arcana_home) {
      throw new OnlineError("home_layout_unavailable","집의 공간 정보가 준비 중입니다. 잠시 후 다시 이용해 주세요.");
    }
    const life=actor.game.state.arcanaLife!;
    const door=this.area(actor.place)?.doors.find(entry=>entry.id==="arcana_home");
    life.homeReturn=door?.arrival && distance(actor.position,door)<=door.radius
      && this.validPoint(actor.place,door.arrival)?copy(door.arrival):copy(actor.position);
    life.atHome=true;
    life.lastMessage="내 집에 돌아왔습니다. 주방에서 요리하고 거실에서 제작하거나 침실에서 쉬어 보세요.";
    actor.place={location:"arcana_home",interior:"arcana_home:"+actor.character.id,floor:0};
    actor.game.state.location="arcana_home";
    actor.position=copy(this.layouts.arcana_home.spawn);
    actor.previous=copy(actor.position);
    actor.walking=false;
    actor.bench="";
    actor.moveCredit=0;
    actor.lastMoveAt=Date.now();
    actor.placeRevision=(actor.placeRevision || 0)+1;
  }
  private leaveHome(actor:Actor) {
    requireLifeReady(actor);
    const life=actor.game.state.arcanaLife!;
    if(!life.atHome || actor.place.interior!=="arcana_home:"+actor.character.id) {
      throw new OnlineError("home_required","지금은 집 안에 있지 않습니다.");
    }
    actor.place={location:"arcana_plaza",interior:"",floor:0};
    const plaza=this.area(actor.place);
    const movedDoor=plaza.doors.find(entry=>entry.id==="arcana_home");
    // A player who saved inside the house can still have its former porch as their return point.
    const savedReturn=life.homeReturn;
    const returnPoint=savedReturn && previousPlazaHomeArrivals.some(previous=>distance(savedReturn,previous)<.05)
      ?movedDoor?.arrival || savedReturn:savedReturn;
    actor.position=returnPoint
      ?(this.validPoint(actor.place,returnPoint)?copy(returnPoint):this.recoverBlockedPosition(actor.place,returnPoint))
      :copy(plaza.spawn);
    life.atHome=false;
    life.lastMessage="집에서 나와 광장으로 돌아왔습니다.";
    actor.game.state.location="arcana_plaza";
    actor.previous=copy(actor.position);
    actor.walking=false;
    actor.bench="";
    actor.moveCredit=0;
    actor.lastMoveAt=Date.now();
    actor.placeRevision=(actor.placeRevision || 0)+1;
  }
  private changeFloor(actor:Actor,floor:number,textPlace?:TextPlace) {
    if(actor.place.interior!=="arcana_academy" || ![1,2].includes(floor))throw new OnlineError("invalid_floor","이동할 수 없는 층입니다.");
    const stair=this.area(actor.place)?.stairs;
    if(textPlace==="academy_stairs") {
      const blocked=academyMoveBlockedReason(actor.game.state);
      if(blocked || actor.pending || lifeActive(this.lifeJobs.get(actor.character.id)) || this.fighting(actor))
        throw new OnlineError("stairs_unavailable",blocked || "진행 중인 행동을 마친 뒤 이동해 주세요.");
    }
    if(!stair || (textPlace!=="academy_stairs" && distance(actor.position,stair)>40))throw new OnlineError("stairs_required","계단 가까이에서 이동해 주세요.");
    const destination={...actor.place,floor};
    const arrival=this.area(destination)?.stairArrival;
    if(!arrival || !this.validPoint(destination,arrival))throw new OnlineError("invalid_floor","계단 도착점을 사용할 수 없습니다.");
    actor.placeRevision=(actor.placeRevision || 0)+1;
    actor.place=destination;actor.position=copy(arrival);actor.previous=copy(arrival);
  }
  async state(principal:Principal,gameId:string) {
    const owner=await this.accounts.authorize(gameId,principal);
    if(!owner.characterId)return null;
    return this.serial(async()=>{
      const actor=this.actors.get(owner.characterId!);
      if(actor)return this.full(actor);
      const session=await this.repository.loadGame(gameId);
      if (session.state.arcanaLife) delete session.state.arcanaLife.homeFurniture;
      return {...this.games.snapshotForOnline(session),online:true};
    });
  }
  private async actorFor(principal:Principal,gameId:string) {
    const owner=await this.accounts.authorize(gameId,principal);
    const actor=owner.characterId?this.actors.get(owner.characterId):null;
    if(!actor || actor.sessionId!==principal.sessionId || !this.connections.has(actor.character.id))throw new OnlineError("join_required","아르카나 세계에 연결한 뒤 이용해 주세요.",401);
    return actor;
  }
  private canTradeAtInn(actor: Actor) {
    const state = actor.game.state;
    return atInn(actor.place) && state.flags.in_magic_world === true && state.arcanaCombat.hp > 0
      && !state.npcDialogue.active && !state.subwayExpedition.active && !actor.bench && !actor.pending
      && !lifeActive(this.lifeJobs.get(actor.character.id)) && !fishingActive(this.fishing.get(actor.character.id));
  }
  async innSupply(principal: Principal, gameId: string, controller: string, request?: InnSupplyRequest) {
    const result = await this.serial(async () => {
      const actor = await this.actorFor(principal, gameId);
      if (actor.controller !== controller) {
        throw new OnlineError("connection_replaced", "접속이 다른 창으로 이전되었습니다.", 401);
      }
      const { day, phaseIndex, menuOpen, supply } = this.advanceWorldClock(Date.now());
      const canTrade = this.canTradeAtInn(actor);
      if (!request) {
        const atPlaza = actor.place.location === "arcana_plaza" && !actor.place.interior;
        if (!atInn(actor.place) && !atPlaza) {
          throw new OnlineError("inn_supply_location", "분수 광장이나 여관에서 식재료 주문을 확인해 주세요.");
        }
        return { innSupply: innSupplyView(supply, actor.game.state, phaseIndex, menuOpen, canTrade) };
      }

      const op = operation(request.actionId, { type: "inn_supply", action: request.action, day: request.day });
      const duplicate = knownOperation(actor, op);
      if (!duplicate) {
        this.requireTradePersistence();
        if (!atInn(actor.place)) {
          throw new OnlineError("inn_supply_location", "여관으로 들어가 마르텐에게 거래해 주세요.");
        }
        if (request.day !== day) {
          throw new OnlineError("inn_supply_day", "여관 주문 날짜가 바뀌었습니다. 오늘 주문을 확인해 주세요.");
        }
        if (!canTrade) {
          throw new OnlineError("inn_supply_unavailable", "진행 중인 행동을 마친 뒤 여관을 이용해 주세요.");
        }
        reserveOperation(actor, op);
        this.synchronize(actor);
        tradeInnSupply(supply, actor.game.state, menuOpen, request.action);
        completeOperation(actor, op);
        this.world.revision++;
        // Shared stock, the character's game, and its receipt enter the same checkpoint transaction.
        await this.persist();
      }

      return {
        actionReceipt: { id: op.id, duplicate },
        innSupply: innSupplyView(supply, actor.game.state, phaseIndex, menuOpen, canTrade),
        snapshot: this.full(actor),
        worldRevision: this.world.revision,
      };
    });
    // The accepted response survives a disconnect or controller handover while its write is outstanding.
    if (result.actionReceipt) await this.waitForTradeSave();
    return result;
  }
  async simpleHomestead(principal: Principal, gameId: string, controller: string, action?: SimpleHomesteadAction) {
    const homestead = await this.serial(async () => {
      const actor = await this.actorFor(principal, gameId);
      if (actor.controller !== controller) {
        throw new OnlineError("connection_replaced", "접속이 다른 창으로 이전되었습니다.", 401);
      }
      const { place, game } = actor;
      const atHome = place.location === "arcana_home" && place.interior === `arcana_home:${actor.character.id}` && game.state.arcanaLife?.atHome;
      const atForest = place.location === FOREST_LOCATION && !place.interior;
      const atVillage = place.location === "arcana_plaza" && !place.interior;
      if (!atHome && !atForest && !atVillage) {
        throw new OnlineError("homestead_area_required", "내 집, 연못가 숲 또는 분수 광장에서 이용해 주세요.");
      }
      const { flags, inventory } = game.state;
      if (!action) return simpleHomesteadView(flags, inventory);
      if (actor.pending || lifeActive(this.lifeJobs.get(actor.character.id)) || fishingActive(this.fishing.get(actor.character.id)) || this.fighting(actor)) {
        throw new OnlineError("homestead_unavailable", "진행 중인 행동이 끝난 뒤 다시 이용해 주세요.");
      }
      const area = atHome ? "home" : atForest ? "forest" : "village";
      const result = applySimpleHomesteadAction(flags, action, area, inventory);
      await this.persist();
      return result;
    });
    if (action) await this.waitForSave();
    return { homestead };
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
      if(actor.game.state.arcanaLife?.atHome)throw new OnlineError("home_action_required","집에서 외출한 뒤 이용해 주세요.");
      if(lifeActive(this.lifeJobs.get(actor.character.id)))throw new OnlineError("life_active","현재 제작·요리를 마치거나 취소해 주세요.");
      if(action.type==="use_item" && (FOODS[action.itemId] || CAMPFIRES[action.itemId]))throw new OnlineError("world_transport_required","요리와 모닥불은 세계 연결에서 사용해 주세요.");
      if(fishingActive(this.fishing.get(actor.character.id)))throw new OnlineError("fishing_active","낚시를 마친 뒤 이용해 주세요.");
      if(actor.pending)throw new OnlineError("action_pending","현재 행동을 마친 뒤 이용해 주세요.");
      if(action.type==="arcana_combat" && ["engage_plaza_slime","start","finish","pause","resume","retreat","spatial_sync","fireball","flame_wave","flame_guard","meteor","giant_fireball","flame_barrage","dodge","teleport","potion"].includes(action.command))throw new OnlineError("world_transport_required","아르카나 세계의 전투 연결을 사용해 주세요.",400);
      if(this.fighting(actor))throw new OnlineError("combat_active","전투와 발사한 주문이 끝난 뒤 이용해 주세요.");
      if(action.type==="travel")this.validateTravel(actor,action.targetId,action.textMode);
      if(action.type==="arcana_combat" && action.command==="dev_sofa_rest" && process.env.NODE_ENV==="production")throw new OnlineError("development_only","개발 전용 기능입니다.",403);
      if(action.type==="academy_move") {
        const room=this.area(actor.place)?.rooms?.[action.roomId];
        if(actor.place.interior!=="arcana_academy" || !room || (!action.textMode && distance(actor.position,room)>40))throw new OnlineError("room_required","해당 층의 방 가까이에서 이용해 주세요.");
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
        next.cooldowns=live.cooldowns;next.guard=live.guard;next.evadeSkill=live.evadeSkill;next.evadeSeconds=live.evadeSeconds;
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
  private validateTravel(actor:Actor,target:string,textMode=false) {
    if(target==="magic_city_entrance" || target==="shelter" || target==="arcana_return_portal")throw new OnlineError("online_realm_only","온라인 모험은 아르카나 안에서 계속됩니다.");
    const {interior,floor,location}=actor.place;
    if(isWorldMapField(location) || isWorldMapField(target)) {
      const viaPlaza=(location==="arcana_plaza" && isWorldMapField(target)) || (isWorldMapField(location) && target==="arcana_plaza");
      const forestRoute=location===FOREST_LOCATION || target===FOREST_LOCATION;
      const atDoor=forestRoute && this.area(actor.place)?.doors.some(door=>
        (door.id===target || (door.id==="exit" && location===FOREST_LOCATION)) && distance(actor.position,door)<=door.radius);
      if(!interior && viaPlaza && (textMode || atDoor))return;
      throw new OnlineError("entrance_required",forestRoute?"월드맵에서 연못가 숲과 분수 광장 사이를 이동해 주세요.":"월드맵에서 분수 광장과 뿔소 초원 사이를 이동해 주세요.");
    }
    const area=interior ? this.layouts[interior+":"+floor] ?? this.layouts[interior] : this.layouts.outside;
    const nearDoor=area?.doors.some(d=>(d.id===target || (interior && target==="arcana_plaza" && d.id==="exit")) && (textMode || distance(actor.position,d)<=d.radius));
    if(!nearDoor)throw new OnlineError("entrance_required","출입구 가까이에서 이동해 주세요.");
  }
  private arrive(actor:Actor,location:string) {
    actor.placeRevision=(actor.placeRevision || 0)+1;
    const interior=["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy"].includes(location)?location:"";
    if(isWorldMapField(location) || isWorldMapField(actor.place.location)) {
      actor.place={location,interior,floor:interior==="arcana_academy"?1:0};
      const area=this.area(actor.place);
      actor.positionLayoutId=inForest(actor.place)?area?.layoutId:undefined;
      const spawn=area?.spawn ?? spatialLayout().spawn;
      actor.position=this.validPoint(actor.place,spawn)?copy(spawn):this.recoverBlockedPosition(actor.place,spawn);
      actor.previous=copy(actor.position);
      actor.walking=false;
      actor.bench="";
      actor.moveCredit=0;
      actor.lastMoveAt=Date.now();
      return;
    }
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
    this.clearCombatParticipation(id);
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
