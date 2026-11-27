import { performance } from "node:perf_hooks";
import { NetworkMetrics } from "./network-metrics";
import type { GameSession } from "../game/schemas";
import type { Actor, SavedPosition, SharedWorld } from "./model";
import type { Death } from "./combat";
import type { OnlineStore } from "./store";
import type { ActionReceipt } from "./action-receipts";
import { appendPlazaHistory, plazaMarketHistoryKind, type PlazaHistoryEntry, type PlazaHistoryWrite } from "./plaza-market-history";
export type WorldCheckpoint = {world:SharedWorld;actors:Actor[]};
type Batch = {
  checkpoint: WorldCheckpoint;
  games: Map<string, GameSession>;
  deaths: Map<string, Death>;
  positions: Map<string, SavedPosition>;
  receipts: Map<string, ActionReceipt[]>;
  marketHistory: Map<string, PlazaHistoryEntry[]>;
  since: number;
  through: number;
};
type CheckpointWaiter = { ticket: number; resolve: () => void; reject: (error: Error) => void };
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
  private latestTicket=0;
  private committedThrough=0;
  private waiters=new Set<CheckpointWaiter>();
  constructor(private store:OnlineStore,private onError:(error:Error)=>void) {}
  get lagMs() {return this.started?Date.now()-this.started:0;}
  get queuedThrough() {return this.latestTicket;}
  diagnostics() {
    return {lagMs:this.lagMs,saving:!!this.running,pending:!!this.pending,pendingAgeMs:this.pending?Date.now()-this.pending.since:0,commits:this.commits,coalesced:this.coalesced,lastCommitAt:this.lastCommitAt,failed:!!this.error,timing:this.metrics.snapshot()};
  }
  enqueue(checkpoint:WorldCheckpoint,games:GameSession[],deaths:Death[],retired:Actor[]=[],history:readonly PlazaHistoryWrite[]=[]) {
    if(this.error)throw this.error;
    // Capture before yielding to DB I/O; later simulation cannot mutate this batch.
    const capturedAt=performance.now();
    const captured=structuredClone({checkpoint,games,deaths,retired,history});
    this.metrics.record("captureMs",performance.now()-capturedAt);
    const ticket=++this.latestTicket;
    if(this.pending)this.coalesced++;
    if(!this.pending)this.pending={receipts:new Map(),checkpoint:captured.checkpoint,games:new Map(),deaths:new Map(),positions:new Map(),marketHistory:new Map(),since:Date.now(),through:ticket};
    this.pending.checkpoint=captured.checkpoint;
    this.pending.through=ticket;
    for(const game of captured.games)this.pending.games.set(game.id,game);
    for(const death of captured.deaths)this.pending.deaths.set(death.lifeId,death);
    for(const actor of [...captured.retired,...captured.checkpoint.actors])this.pending.positions.set(actor.character.id,{place:actor.place,position:actor.position,positionLayoutId:actor.positionLayoutId});
    for(const actor of [...captured.retired,...captured.checkpoint.actors])if(actor.actionReceipts)this.pending.receipts.set(actor.character.id,actor.actionReceipts);
    for (const { characterId, entry } of captured.history) {
      const entries = this.pending.marketHistory.get(characterId);
      if (entries) entries.push(entry);
      else this.pending.marketHistory.set(characterId, [entry]);
    }
    this.startDrain();
    return ticket;
  }
  private startDrain() {
    if(this.running || !this.pending || this.error)return;
    this.started=this.pending.since;
    // Defer transaction startup until the simulation queue has returned.
    this.running=Promise.resolve().then(()=>this.drain()).catch(error=>{
      this.error=error instanceof Error?error:new Error("Checkpoint failed");
      for(const waiter of this.waiters)waiter.reject(this.error);
      this.waiters.clear();
      this.onError(this.error);
    }).finally(()=>{
      this.running=null;this.started=0;
      this.startDrain();
    });
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
        for (const [id, additions] of batch.marketHistory) {
          const previous = await tx.get<PlazaHistoryEntry[]>(plazaMarketHistoryKind, id) ?? [];
          await tx.put(plazaMarketHistoryKind, id, appendPlazaHistory(previous, additions));
        }
        await tx.put("world","main",batch.checkpoint);
      });
      this.metrics.record("commitMs",performance.now()-commitStarted);
      this.commits++;this.lastCommitAt=Date.now();
      this.committedThrough=batch.through;
      for(const waiter of this.waiters) {
        if(waiter.ticket>this.committedThrough)continue;
        this.waiters.delete(waiter);
        waiter.resolve();
      }
    }
  }
  /** Wait for the commit that covers this ticket without waiting for later queued writes. */
  waitThrough(ticket: number): Promise<void> {
    if(!Number.isSafeInteger(ticket) || ticket<0 || ticket>this.latestTicket) {
      return Promise.reject(new RangeError("Invalid checkpoint ticket"));
    }
    if(ticket<=this.committedThrough)return Promise.resolve();
    if(this.error)return Promise.reject(this.error);
    return new Promise<void>((resolve,reject)=>{
      this.waiters.add({ticket,resolve,reject});
    });
  }
  async flush() {while(this.running)await this.running;if(this.error)throw this.error;}
}
