import { samePlace, type Actor, type WorldEvent } from "./model";
import { fishingActive, type Fishing } from "./fishing";
export const PLAYER_ENTER_RADIUS=384;
export const PLAYER_LEAVE_RADIUS=448;
const CELL=256;
type VisibleFishing=Pick<Fishing,"id"|"phase"|"castStartedAt"|"phaseStartedAt"|"origin"|"bobber"|"direction">;
function visibleFishing(actor:Actor, fishing:Fishing|undefined, now:number):VisibleFishing|null {
  if(!fishing || actor.disconnectedAt!==null || actor.place.interior)return null;
  if(!fishingActive(fishing) && (now-fishing.phaseStartedAt>=2000 || Math.hypot(actor.position.x-fishing.origin.x,actor.position.y-fishing.origin.y)>.75))return null;
  const {id,phase,castStartedAt,phaseStartedAt,origin,bobber,direction}=fishing;
  return {id,phase,castStartedAt,phaseStartedAt,origin,bobber,direction};
}
type Projection={fishing:VisibleFishing|null;id:string;name:string;position:{x:number;y:number};direction:{x:number;y:number};walking:boolean;bench:string;gait:number;connected:boolean;movement?:WorldEvent;guard:{amount:number;seconds:number};cast:number};
function placeKey(actor:Actor) {return JSON.stringify([actor.place.interior?actor.place.location:"outside",actor.place.interior,actor.place.floor]);}
/** Rebuilt once per broadcast, shared by every observer. */
export class PresenceFrame {
  private cells=new Map<string,Actor[]>();
  private projections=new Map<string,Projection>();
  constructor(actors:Iterable<Actor>,events:WorldEvent[],fishing?:ReadonlyMap<string,Fishing>) {
    const now=Date.now();
    const movement=new Map<string,WorldEvent>(),casts=new Map<string,number>();
    for(const event of events)if(event.actorId) {
      if(event.movement)movement.set(event.actorId,event);
      if(event.kind==="cast")casts.set(event.actorId,event.id);
    }
    for(const actor of actors) {
      const key=this.cell(actor,Math.floor(actor.position.x/CELL),Math.floor(actor.position.y/CELL));
      const bucket=this.cells.get(key)||[];bucket.push(actor);this.cells.set(key,bucket);
      const id=actor.character.id;
      this.projections.set(id,{id,fishing:visibleFishing(actor,fishing?.get(id),now),name:actor.character.name || "방문자-"+id.slice(0,4),position:{...actor.position},direction:{...actor.direction},walking:actor.walking,bench:actor.bench,gait:actor.gait,connected:actor.disconnectedAt===null,movement:movement.get(id),guard:{...actor.game.state.arcanaCombat.guard},cast:casts.get(id)||0});
    }
  }
  private cell(actor:Actor,x:number,y:number) {return placeKey(actor)+":"+x+":"+y;}
  visible(viewer:Actor,previous:ReadonlySet<string>=new Set()) {
    const result:Projection[]=[];
    const {x,y}=viewer.position;
    for(let cy=Math.floor((y-PLAYER_LEAVE_RADIUS)/CELL);cy<=Math.floor((y+PLAYER_LEAVE_RADIUS)/CELL);cy++)
      for(let cx=Math.floor((x-PLAYER_LEAVE_RADIUS)/CELL);cx<=Math.floor((x+PLAYER_LEAVE_RADIUS)/CELL);cx++)
        for(const other of this.cells.get(this.cell(viewer,cx,cy)) || []) {
          const id=other.character.id,radius=previous.has(id)?PLAYER_LEAVE_RADIUS:PLAYER_ENTER_RADIUS;
          if(samePlace(viewer.place,other.place) && (id===viewer.character.id || Math.hypot(x-other.position.x,y-other.position.y)<=radius))result.push(this.projections.get(id)!);
        }
    return result;
  }
}
export class PresenceDelta {
  private known=new Map<string,string>();
  private initialized=false;
  update(frame:PresenceFrame,viewer:Actor) {
    const next=new Map<string,string>(),players:Projection[]=[],removedPlayers:string[]=[];
    for(const player of frame.visible(viewer,new Set(this.known.keys()))) {
      const fingerprint=JSON.stringify(player);next.set(player.id,fingerprint);
      if(!this.initialized || this.known.get(player.id)!==fingerprint)players.push(player);
    }
    for(const id of this.known.keys())if(!next.has(id))removedPlayers.push(id);
    const playersDelta=this.initialized;
    this.known=next;this.initialized=true;
    return {playersDelta,players,removedPlayers};
  }
}
