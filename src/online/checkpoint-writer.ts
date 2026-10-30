import type { GameSession } from "../game/schemas";
import type { Actor, SharedWorld } from "./model";
import type { Death } from "./combat";
import type { OnlineStore } from "./store";
export type WorldCheckpoint = {world:SharedWorld;actors:Actor[]};
type Batch = {checkpoint:WorldCheckpoint;games:Map<string,GameSession>;deaths:Map<string,Death>;positions:Map<string,{place:Actor["place"];position:Actor["position"]}>;since:number};
/** A single in-flight commit plus one coalesced pending checkpoint; never writes live objects. */
export class CheckpointWriter {
  private pending:Batch|null=null;
  private running:Promise<void>|null=null;
  private error:Error|null=null;
  private started=0;
  constructor(private store:OnlineStore,private onError:(error:Error)=>void) {}
  get lagMs() {return this.started?Date.now()-this.started:0;}
  enqueue(checkpoint:WorldCheckpoint,games:GameSession[],deaths:Death[],retired:Actor[]=[]) {
    if(this.error)throw this.error;
    // Capture before yielding to DB I/O; later simulation cannot mutate this batch.
    const captured=structuredClone({checkpoint,games,deaths,retired});
    if(!this.pending)this.pending={checkpoint:captured.checkpoint,games:new Map(),deaths:new Map(),positions:new Map(),since:Date.now()};
    this.pending.checkpoint=captured.checkpoint;
    for(const game of captured.games)this.pending.games.set(game.id,game);
    for(const death of captured.deaths)this.pending.deaths.set(death.lifeId,death);
    for(const actor of [...captured.retired,...captured.checkpoint.actors])this.pending.positions.set(actor.character.id,{place:actor.place,position:actor.position});
    if(!this.running) {
      this.started=this.pending.since;
      // Defer transaction startup until the simulation queue has returned.
      this.running=Promise.resolve().then(()=>this.drain()).catch(error=>{
        this.error=error instanceof Error?error:new Error("Checkpoint failed");
        this.onError(this.error);
      }).finally(()=>{this.running=null;this.started=0;
        if(this.pending && !this.error) this.enqueue(this.pending.checkpoint,[...this.pending.games.values()],[],[]);});
    }
  }
  private async drain() {
    while(this.pending) {
      const batch=this.pending;this.pending=null;this.started=batch.since;
      await this.store.transaction(async tx=>{
        for(const death of batch.deaths.values()) {
          const key="main:"+death.lifeId;
          if(await tx.get("reward",key))throw new Error("Duplicate monster lifecycle: "+key);
          await tx.put("reward",key,{...death,at:Date.now()});
        }
        for(const game of batch.games.values())await tx.saveGame(game);
        for(const [id,position] of batch.positions)await tx.put("position",id,position);
        await tx.put("world","main",batch.checkpoint);
      });
    }
  }
  async flush() {while(this.running)await this.running;if(this.error)throw this.error;}
}
