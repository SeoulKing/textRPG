const test=require("node:test");
const assert=require("node:assert/strict");
const {PresenceFrame,PresenceDelta}=require("../.server-dist/online/presence");
const {CheckpointWriter}=require("../.server-dist/online/checkpoint-writer");
function actor(id,x,y=100) {return {character:{id,name:id},position:{x,y},direction:{x:0,y:1},place:{location:"arcana_plaza",interior:"",floor:0},walking:false,bench:"",gait:0,disconnectedAt:null,game:{id,state:{money:0,arcanaCombat:{guard:{amount:0,seconds:0}}}}};}
test("nearby player baselines, unchanged frames, movement and removals",()=>{
 const viewer=actor("self",100),near=actor("near",200),far=actor("far",1000),view=new PresenceDelta();
 const frame=()=>new PresenceFrame([viewer,near,far],[]);
 const first=view.update(frame(),viewer);
 assert.equal(first.playersDelta,false);assert.deepEqual(first.players.map(p=>p.id).sort(),["near","self"]);
 assert.deepEqual(view.update(frame(),viewer).players,[]);
 near.position.x=220;
 assert.deepEqual(view.update(frame(),viewer).players.map(p=>p.id),["near"]);
 near.position.x=525;
 assert.deepEqual(view.update(frame(),viewer).removedPlayers,[]);
 near.position.x=550;
 assert.deepEqual(view.update(frame(),viewer).removedPlayers,["near"]);
 near.position.x=500;assert.deepEqual(view.update(frame(),viewer).players,[]);
 near.position.x=200;assert.deepEqual(view.update(frame(),viewer).players.map(p=>p.id),["near"]);
 const reconnect=new PresenceDelta().update(frame(),viewer);
 assert.equal(reconnect.playersDelta,false);assert.equal(reconnect.players.length,2);
});
test("different indoor floors never share player projections",()=>{
 const viewer=actor("self",100),other=actor("other",100),view=new PresenceDelta();
 viewer.place={location:"arcana_academy",interior:"arcana_academy",floor:1};other.place={...viewer.place};
 view.update(new PresenceFrame([viewer,other],[]),viewer);
 other.place.floor=2;
 assert.deepEqual(view.update(new PresenceFrame([viewer,other],[]),viewer).removedPlayers,["other"]);
});
test("slow persistence coalesces snapshots without blocking producers or losing deaths/departures",async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const commits=[];let calls=0;
 const store={transaction:async operation=>{if(++calls===1)await gate;const writes=[];await operation({get:async()=>null,put:async(kind,id,value)=>writes.push({kind,id,value}),saveGame:async game=>writes.push({kind:"game",id:game.id,value:game})});commits.push(writes);}};
 const errors=[],writer=new CheckpointWriter(store,error=>errors.push(error));
 const first=actor("one",100),retired=actor("left",300);
 const cp=revision=>({world:{id:"main",revision},actors:[first]});
 writer.enqueue(cp(1),[first.game],[]);
 await Promise.resolve();
 first.game.state.money=30;
 writer.enqueue(cp(2),[first.game,retired.game],[{lifeId:"a",winnerId:"one",money:30,xp:0}],[retired]);
 first.game.state.money=60;
 writer.enqueue(cp(3),[first.game],[{lifeId:"b",winnerId:"one",money:30,xp:0}]);
 first.game.state.money=999;
 assert.equal(commits.length,0); // The producer kept accepting simulation states while DB was blocked.
 release();await writer.flush();
 assert.equal(errors.length,0);assert.equal(commits.length,2);
 assert.equal(commits[0].find(w=>w.kind==="game").value.state.money,0);
 const last=commits[1];
 assert.equal(last.find(w=>w.kind==="world").value.world.revision,3);
 assert.equal(last.find(w=>w.kind==="game" && w.id==="one").value.state.money,60);
 assert.equal(last.filter(w=>w.kind==="reward").length,2);
 assert.ok(last.some(w=>w.kind==="game" && w.id==="left"));
 assert.ok(last.some(w=>w.kind==="position" && w.id==="left"));
});
test("checkpoint failure is observable by flush and stops accepting new snapshots",async()=>{
 const errors=[],writer=new CheckpointWriter({transaction:async()=>{throw new Error("database down");}},e=>errors.push(e));
 const checkpoint={world:{id:"main",revision:1},actors:[]};
 writer.enqueue(checkpoint,[],[]);
 await assert.rejects(writer.flush(),/database down/);
 assert.equal(errors.length,1);
 assert.throws(()=>writer.enqueue(checkpoint,[],[]),/database down/);
});
