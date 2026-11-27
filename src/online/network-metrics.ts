import { performance } from "node:perf_hooks";

/** Bounded numeric measurements; no accounts, action payloads or credentials. */
export class NetworkMetrics {
  private values=new Map<string,{values:number[];next:number;total:number}>();
  private cached:Record<string,unknown>={};
  private cachedAt=-Infinity;
  constructor(private capacity=256) {}
  record(name:string,value:number) {
    if(!Number.isFinite(value) || value<0)return;
    let entry=this.values.get(name);
    if(!entry){entry={values:[],next:0,total:0};this.values.set(name,entry);}
    if(entry.values.length<this.capacity)entry.values.push(value);
    else {entry.values[entry.next]=value;entry.next=(entry.next+1)%this.capacity;}
    entry.total++;
  }
  snapshot() {
    const now=performance.now();
    if(now-this.cachedAt<1000)return this.cached;
    const result:Record<string,unknown>={};
    for(const [name,entry] of this.values) {
      const sorted=[...entry.values].sort((a,b)=>a-b);
      if(!sorted.length)continue;
      const q=(fraction:number)=>Math.round(sorted[Math.ceil((sorted.length-1)*fraction)]*100)/100;
      result[name]={samples:sorted.length,total:entry.total,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)};
    }
    this.cachedAt=now;this.cached=result;return result;
  }
}
