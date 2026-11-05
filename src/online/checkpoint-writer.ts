import { performance } from "node:perf_hooks";
import { NetworkMetrics } from "./network-metrics";
import type { GameSession } from "../game/schemas";
import type { Actor, SharedWorld } from "./model";
import type { Death } from "./combat";
import type { OnlineStore } from "./store";
import type { ActionReceipt } from "./action-receipts";
export type WorldCheckpoint = {world:SharedWorld;actors:Actor[]};
type Batch = {receipts:Map<string,ActionReceipt[]>;checkpoint:WorldCheckpoint;games:Map<string,GameSession>;deaths:Map<string,Death>;positions:Map<string,{place:Actor["place"];position:Actor["position"]}>;since:number};
/** A single in-flight commit plus one coalesced pending checkpoint; never writes live objects. */
export class CheckpointWriter {
  private pending:Batch|null=null;
  private running:Promise<void>|null=null;
  private error:Error|null=null;
  private started=0;
  private metrics=new NetworkMetrics();
  private commits=0;
  private coalesced=0;
  private lastCommitAt=0;
  constructor(private store:OnlineStore,private onError:(error:Error)=>void) {}
  get lagMs() {return this.started?Date.now()-this.started:0;}
  diagnostics() {
    return {lagMs:this.lagMs,saving:!!this.running,pending:!!this.pending,pendingAgeMs:this.pending?Date.now()-this.pending.since:0,commits:this.commits,coalesced:this.coalesced,lastCommitAt:this.lastCommitAt,failed:!!this.error,timing:this.metrics.snapshot()};
  }
  enqueue(checkpoint:WorldCheckpoint,games:GameSession[],deaths:Death[],retired:Actor[]=[]) {
    if(this.error)throw this.error;
    // Capture before yielding to DB I/O; later simulation cannot mutate this batch.
    const capturedAt=performance.now();
    const captured=structuredClone({checkpoint,games,deaths,retired});
    this.metrics.record("captureMs",performance.now()-capturedAt);
    if(this.pending)this.coalesced++;
    if(!this.pending)this.pending={receipts:new Map(),checkpoint:captured.checkpoint,games:new Map(),deaths:new Map(),positions:new Map(),since:Date.now()};
    this.pending.checkpoint=captured.checkpoint;
    for(const game of captured.games)this.pending.games.set(game.id,game);
    for(const death of captured.deaths)this.pending.deaths.set(death.lifeId,death);
    for(const actor of [...captured.retired,...captured.checkpoint.actors])this.pending.positions.set(actor.character.id,{place:actor.place,position:actor.position});
    for(const actor of [...captured.retired,...captured.checkpoint.actors])if(actor.actionReceipts)this.pending.receipts.set(actor.character.id,actor.actionReceipts);
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
      const commitStarted=performance.now();
      this.metrics.record("saveQueueMs",Date.now()-batch.since);
      await this.store.transaction(async tx=>{
        for(const death of batch.deaths.values()) {
          const key="main:"+death.lifeId;
          if(await tx.get("reward",key))throw new Error("Duplicate monster lifecycle: "+key);
          await tx.put("reward",key,{...death,at:Date.now()});
        }
        for(const game of batch.games.values())await tx.saveGame(game);
        for(const [id,position] of batch.positions)await tx.put("position",id,position);
        for(const [id,receipts] of batch.receipts)await tx.put("action_receipts",id,receipts);
        await tx.put("world","main",batch.checkpoint);
      });
      this.metrics.record("commitMs",performance.now()-commitStarted);
      this.commits++;this.lastCommitAt=Date.now();
    }
  }
  async flush() {while(this.running)await this.running;if(this.error)throw this.error;}
}
