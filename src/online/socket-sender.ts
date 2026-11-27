import { performance } from "node:perf_hooks";
import { NetworkMetrics } from "./network-metrics";

type Socket = {readonly readyState:number;readonly bufferedAmount:number;send(data:string,callback:(error?:Error)=>void):void;close(code:number,reason:string):void};
type Reliable = {json:string;bytes:number;enqueued:number};
type State = {build:()=>unknown;since:number};
const SOFT_BUFFER_BYTES=64*1024;
const HARD_BUFFER_BYTES=1024*1024;
const MAX_RELIABLE_BYTES=1024*1024;
const MAX_RELIABLE_MESSAGES=64;
const MAX_WAIT_MS=10000;

/** Reliable replies are FIFO. Only one unsent world-state producer is retained. */
export class WorldSocketSender {
  private reliable:Reliable[]=[];
  private reliableBytes=0;
  private state:State|null=null;
  private sending=false;
  private disposed=false;
  private retry:ReturnType<typeof setTimeout>|null=null;
  private blockedAt=0;
  private lastWarning=-Infinity;
  private lastTelemetry=-Infinity;
  private metrics=new NetworkMetrics();
  private sentBytes=0;
  private sentMessages=0;
  private coalescedStates=0;
  private lastRateAt=performance.now();
  private rateBytes=0;
  private rateMessages=0;
  private bytesPerSecond=0;
  private messagesPerSecond=0;
  constructor(private socket:Socket,private worldMetrics:()=>unknown,private warn:(event:string,detail:unknown)=>void) {}
  send(value:unknown) {
    if(this.disposed || this.socket.readyState!==1)return;
    const started=performance.now();
    let json:string;
    try {json=JSON.stringify(value);}catch {this.fail("Reply serialization failed");return;}
    if(typeof json!=="string")return;
    const bytes=Buffer.byteLength(json);
    this.metrics.record("replyEncodeMs",performance.now()-started);
    if(this.reliable.length>=MAX_RELIABLE_MESSAGES || this.reliableBytes+bytes>MAX_RELIABLE_BYTES){this.fail("Reliable queue exceeded limit");return;}
    this.reliable.push({json,bytes,enqueued:performance.now()});this.reliableBytes+=bytes;
    this.flush();
  }
  sendState(build:()=>unknown) {
    if(this.disposed || this.socket.readyState!==1)return;
    if(this.state){this.state.build=build;this.coalescedStates++;}
    else this.state={build,since:performance.now()};
    this.flush();
  }
  diagnostics() {
    const now=performance.now(),elapsed=now-this.lastRateAt;
    if(elapsed>=1000) {
      this.bytesPerSecond=Math.round(this.rateBytes*1000/elapsed);
      this.messagesPerSecond=Math.round(this.rateMessages*1000/elapsed*10)/10;
      this.rateBytes=0;this.rateMessages=0;this.lastRateAt=now;
    }
    return {writing:this.sending,blockedMs:this.blockedAt?Math.round(now-this.blockedAt):0,bufferedBytes:this.socket.bufferedAmount,reliableMessages:this.reliable.length,reliableBytes:this.reliableBytes,statePending:!!this.state,stateWaitMs:this.state?Math.round(now-this.state.since):0,reliableWaitMs:this.reliable.length?Math.round(now-this.reliable[0].enqueued):0,coalescedStates:this.coalescedStates,sentBytes:this.sentBytes,sentMessages:this.sentMessages,bytesPerSecond:this.bytesPerSecond,messagesPerSecond:this.messagesPerSecond,timing:this.metrics.snapshot()};
  }
  dispose() {
    this.disposed=true;
    if(this.retry)clearTimeout(this.retry);
    this.retry=null;this.state=null;this.reliable=[];this.reliableBytes=0;
  }
  private fail(reason:string) {
    this.warn("arcana network queue closed",{reason,...this.diagnostics()});
    this.dispose();this.socket.close(1013,reason);
  }
  private schedule() {
    if(this.retry || this.disposed)return;
    this.retry=setTimeout(()=>{this.retry=null;this.flush();},25);this.retry.unref();
  }
  private flush() {
    if(this.disposed || this.socket.readyState!==1)return;
    if(!this.reliable.length && !this.state)return;
    const now=performance.now();
    const oldest=Math.min(this.reliable[0]?.enqueued ?? now,this.state?.since ?? now);
    if(this.socket.bufferedAmount>HARD_BUFFER_BYTES || now-oldest>MAX_WAIT_MS){this.fail("Slow connection requires resync");return;}
    if(this.sending || this.socket.bufferedAmount>SOFT_BUFFER_BYTES) {
      if(!this.blockedAt)this.blockedAt=now;
      if(now-this.blockedAt>500 && now-this.lastWarning>10000) {
        this.lastWarning=now;this.warn("arcana network backlog",this.diagnostics());
      }
      this.schedule();return;
    }
    this.blockedAt=0;
    let json:string,queuedAt:number;
    if(this.reliable.length) {
      const entry=this.reliable.shift()!;this.reliableBytes-=entry.bytes;
      json=entry.json;queuedAt=entry.enqueued;
      this.metrics.record("reliableQueueMs",now-queuedAt);
    } else {
      const state=this.state!;this.state=null;queuedAt=state.since;
      const started=performance.now();
      let value:unknown;
      try {value=state.build();}catch {this.fail("World state build failed");return;}
      if(value===null || value===undefined){this.flush();return;}
      try {json=JSON.stringify(value);}catch {this.fail("World state serialization failed");return;}
      this.metrics.record("stateBuildMs",performance.now()-started);
      this.metrics.record("stateQueueMs",now-queuedAt);
    }
    const telemetry=now-this.lastTelemetry>=1000;
    if(json.endsWith("}")) {
      const extra:Record<string,unknown>={deliveryTiming:{queueMs:Math.round((now-queuedAt)*100)/100}};
      if(telemetry){extra.network={serverNow:Date.now(),transport:this.diagnostics(),world:this.worldMetrics()};this.lastTelemetry=now;}
      json=json.slice(0,-1)+","+JSON.stringify(extra).slice(1);
    }
    const bytes=Buffer.byteLength(json),started=performance.now();
    this.sentBytes+=bytes;this.sentMessages++;this.rateBytes+=bytes;this.rateMessages++;
    this.sending=true;
    try {
      this.socket.send(json,error=>{
        this.sending=false;
        this.metrics.record("socketWriteMs",performance.now()-started);
        if(this.disposed)return;
        if(error){this.fail("Socket write failed");return;}
        this.flush();
      });
      // A callback can wait for a stalled peer; keep queue age limits running.
      if(this.reliable.length || this.state)this.schedule();
    }catch {this.sending=false;this.fail("Socket write failed");}
  }
}
