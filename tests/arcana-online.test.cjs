const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs/promises");
const path=require("node:path");
const os=require("node:os");
const {OnlineStore}=require("../.server-dist/online/store");
const {OnlineAccounts}=require("../.server-dist/online/accounts");
const {ArcanaWorld}=require("../.server-dist/online/world");
const {newWorld,cast,tickCombat,rewardShares}=require("../.server-dist/online/combat");
const {createInitialGameState}=require("../.server-dist/game/rules");
const {spatialLayout}=require("../.server-dist/game/arcana-spatial");

async function fixture() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"arcana-online-"));
  const saved=new Map();
  const repository={
    saveGame:async game=>{saved.set(game.id,structuredClone(game));},
    loadGame:async id=>{if(!saved.has(id))throw new Error("not found");return structuredClone(saved.get(id));},
    loadManualGameForUser:async()=>null,
  };
  const games={
    createGame:async()=>{const id=crypto.randomUUID(),at=new Date().toISOString();const game={id,createdAt:at,updatedAt:at,state:createInitialGameState("arcana"),world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};await repository.saveGame(game);return {gameId:id,state:game.state};},
    detachedOnlineAction:async(source,action)=>{const game=structuredClone(source);if(action.type==="travel")game.state.location=action.targetId;return game;},
    snapshotForOnline:game=>({gameId:game.id,state:game.state}),
  };
  const runtime=process.env.RUNTIME_DIR;delete process.env.RUNTIME_DIR;
  const store=new OnlineStore(undefined,directory,repository);
  if(runtime!==undefined)process.env.RUNTIME_DIR=runtime;
  await store.init();
  const accounts=new OnlineAccounts(store,repository,games);
  const oldDeveloping=process.env.ARCANA_DEVELOPMENT_ACCESS;process.env.ARCANA_DEVELOPMENT_ACCESS="true";
  const oldCapacity=process.env.ARCANA_DEV_CONNECTION_LIMIT;process.env.ARCANA_DEV_CONNECTION_LIMIT="4";
  const world=new ArcanaWorld(store,accounts,repository,games);
  if(oldDeveloping===undefined)delete process.env.ARCANA_DEVELOPMENT_ACCESS;else process.env.ARCANA_DEVELOPMENT_ACCESS=oldDeveloping;
  if(oldCapacity===undefined)delete process.env.ARCANA_DEV_CONNECTION_LIMIT;else process.env.ARCANA_DEV_CONNECTION_LIMIT=oldCapacity;
  const guest=()=>({id:crypto.randomUUID(),accountId:null,sessionId:crypto.randomUUID(),expires:Date.now()+86400000});
  const dispose=async()=>{await world.stop();await store.close();if(!directory.startsWith(path.join(os.tmpdir(),"arcana-online-")))throw new Error("Unsafe cleanup target");await fs.rm(directory,{recursive:true,force:true});};
  return {store,accounts,world,guest,dispose};
}

test("a thrown transaction rolls back both ownership and world checkpoint",async()=>{
  const f=await fixture();
  try {
    await assert.rejects(f.store.transaction(async tx=>{await tx.put("world","main",{revision:4});await tx.put("game-owner","secret",{ownerId:"someone"});throw new Error("abort");}));
    assert.equal(await f.store.transaction(tx=>tx.get("world","main")),null);
    assert.equal(await f.store.transaction(tx=>tx.get("game-owner","secret")),null);
  } finally {await f.dispose();}
});
test("verified equal email links providers, unverified equal email does not",async()=>{
  const f=await fixture();
  try {
    const kakao=await f.accounts.resolveIdentity({provider:"kakao",subject:"k1",email:"same@example.com",verified:true},null,false);
    const google=await f.accounts.resolveIdentity({provider:"google",subject:"g1",email:"same@example.com",verified:true},null,false);
    const other=await f.accounts.resolveIdentity({provider:"google",subject:"g2",email:"same@example.com",verified:false},null,false);
    assert.equal(kakao,google);assert.notEqual(kakao,other);
  } finally {await f.dispose();}
});
test("guest promotion keeps character identity and game; existing registered character wins",async()=>{
  const f=await fixture();
  try {
    const guest=f.guest(),character=await f.accounts.ensureCharacter(guest);
    const id=await f.accounts.resolveIdentity({provider:"google",subject:"one",email:null,verified:false},guest,false);
    const principal={...guest,id,accountId:id};
    assert.equal((await f.accounts.character(principal)).id,character.id);
    assert.equal((await f.accounts.character(principal)).gameId,character.gameId);
    const next=f.guest(),nextCharacter=await f.accounts.ensureCharacter(next);
    await f.accounts.resolveIdentity({provider:"google",subject:"one",email:null,verified:false},next,false);
    assert.equal((await f.accounts.character(principal)).id,character.id);
    assert.equal((await f.accounts.character(next)).id,nextCharacter.id);
    await assert.rejects(f.accounts.authorize(character.gameId,next),error=>error.code==="game_not_found");
  } finally {await f.dispose();}
});
test("character names are unique ignoring case under concurrent registration",async()=>{
  const f=await fixture();
  try {
    const ids=await Promise.all(["a","b"].map(subject=>f.accounts.resolveIdentity({provider:"google",subject,email:null,verified:false},null,false)));
    const users=ids.map(id=>({...f.guest(),id,accountId:id}));
    const results=await Promise.allSettled(users.map((p,i)=>f.accounts.register(p,i?"Hero":"hero")));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(results.filter(r=>r.status==="rejected" && r.reason.code==="name_taken").length,1);
  } finally {await f.dispose();}
});
test("linking two existing characters requires explicit selection and archives the other",async()=>{
  const f=await fixture();
  try {
    const first=await f.accounts.resolveIdentity({provider:"google",subject:"g",email:null,verified:false},null,false);
    const second=await f.accounts.resolveIdentity({provider:"kakao",subject:"k",email:null,verified:false},null,false);
    const a={...f.guest(),id:first,accountId:first},b={...f.guest(),id:second,accountId:second};
    const ca=await f.accounts.ensureCharacter(a),cb=await f.accounts.ensureCharacter(b);
    await f.accounts.resolveIdentity({provider:"kakao",subject:"k",email:null,verified:false},a,true);
    assert.equal((await f.accounts.choices(a)).length,2);
    await assert.rejects(f.accounts.ensureCharacter(a),e=>e.code==="character_choice_required");
    await f.accounts.selectCharacter(a,ca.id);
    assert.equal((await f.accounts.character(a)).id,ca.id);
    assert.equal((await f.store.transaction(tx=>tx.get("character",cb.id))).archived,true);
  } finally {await f.dispose();}
});
test("parallel admissions reserve exactly four slots and leaving returns a slot",async()=>{
  const f=await fixture();
  try {
    const guests=Array.from({length:5},()=>f.guest());
    const results=await Promise.allSettled(guests.map((p,i)=>f.world.join(p,"controller-"+i)));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,4);
    const denied=results.findIndex(r=>r.status==="rejected");
    assert.equal(results[denied].reason.code,"world_full");
    const admitted=results.findIndex(r=>r.status==="fulfilled");
    await f.world.leave(guests[admitted]);
    assert.equal((await f.world.join(guests[denied],"controller-retry")).worldId,"main");
  } finally {await f.dispose();}
});
test("normal monster rewards go to last hit once, boss strategy conserves total",()=>{
  const world=newWorld(),home=spatialLayout().home;
  function actor(id) {
    const state=createInitialGameState("arcana");state.money=0;
    state.arcanaCombat.learnedSpells=["fireball","flame_wave"];
    state.arcanaCombat.activeSkills=["fireball","flame_wave",null,null,null,null];
    return {character:{id},game:{state},position:{x:home.x-12,y:home.y},previous:{x:home.x-12,y:home.y},place:{location:"arcana_plaza",interior:"",floor:0},bench:""};
  }
  const a=actor("first"),b=actor("last"),actors=new Map([["first",a],["last",b]]),deaths=[];
  cast(world,a,"flame_wave",{x:1,y:0},undefined,deaths);
  assert.ok(world.enemy.hp>0 && world.enemy.hp<30);
  cast(world,b,"fireball",{x:1,y:0},undefined,deaths);
  for(let i=0;i<30;i++)tickCombat(world,actors,.05,deaths);
  assert.equal(deaths.length,1);assert.equal(deaths[0].winnerId,"last");
  assert.equal(a.game.state.money,0);assert.equal(b.game.state.money,30);
  assert.deepEqual(rewardShares("normal","last",{first:10,last:20},30),{last:30});
  const shares=rewardShares("boss","last",{first:10,last:20},31);
  assert.equal(shares.first+shares.last,31);assert.ok(shares.last>shares.first);
});

test("development access permits naming without social login",async()=>{
  const prior=process.env.ARCANA_DEVELOPMENT_ACCESS;process.env.ARCANA_DEVELOPMENT_ACCESS="true";
  const f=await fixture();
  try {const named=await f.accounts.register(f.guest(),"개발테스트");assert.equal(named.name,"개발테스트");}
  finally {if(prior===undefined)delete process.env.ARCANA_DEVELOPMENT_ACCESS;else process.env.ARCANA_DEVELOPMENT_ACCESS=prior;await f.dispose();}
});
test("logout revokes the server token and notifies its world connection",async()=>{
 const f=await fixture();
 try {
  const headers={};const reply={getHeader:key=>headers[key],header:(key,value)=>{headers[key]=value;return reply;}};
  const request={ip:"127.0.0.1",headers:{}};
  const issued=await f.accounts.guest(request,reply);
  request.headers.cookie=headers["set-cookie"][0].split(";")[0];
  assert.equal((await f.accounts.current(request)).id,issued.principal.id);
  let revoked;f.accounts.onRevoke=async id=>{revoked=id;};
  await f.accounts.logout(request,reply);
  assert.equal(await f.accounts.current(request),null);assert.equal(revoked,issued.principal.sessionId);
 } finally {await f.dispose();}
});

test("four is a temporary development admission limit, not world capacity",()=>{
 const {developmentConnectionLimit}=require("../.server-dist/online/world-policy");
 assert.equal(developmentConnectionLimit(true,undefined),4);
 assert.equal(developmentConnectionLimit(true,"128"),128);
 assert.equal(developmentConnectionLimit(false,"4"),null);
 assert.equal(developmentConnectionLimit(false,"invalid"),null);
 assert.throws(()=>developmentConnectionLimit(true,"0"));
 assert.throws(()=>developmentConnectionLimit(true,"4.5"));
});

test("buildings are locations in the same world and reject stale outdoor movement",async()=>{
 const f=await fixture();
 try {
  const principal=f.guest(),controller="one-world-controller";
  const joined=await f.world.join(principal,controller);
  const connection={sessionId:principal.sessionId,controller,send:()=>{},close:()=>{}};
  const id=await f.world.attach(principal,controller,connection);
  const actor=f.world.actors.get(id);
  const door=f.world.layouts.outside.doors.find(d=>d.id==="arcana_shop");
  actor.position={x:door.x,y:door.y};
  const oldPosition={...actor.position};
  const inside=await f.world.personal(principal,joined.gameId,{type:"travel",targetId:"arcana_shop"});
  assert.equal(inside.place.interior,"arcana_shop");
  assert.equal(f.world.connections.get(id),connection);
  assert.equal(f.world.actors.size,1);
  assert.equal(inside.placeRevision,1);
  const arrived={...actor.position};
  const stale=await f.world.command(id,connection,{sequence:1,placeRevision:0,position:oldPosition});
  assert.equal(stale.resync,true);assert.deepEqual(actor.position,arrived);
  const exit=f.world.area(actor.place).doors.find(d=>d.id==="exit");
  actor.position={x:exit.x,y:exit.y};
  const outside=await f.world.personal(principal,joined.gameId,{type:"travel",targetId:"arcana_plaza"});
  assert.equal(outside.place.interior,"");assert.equal(outside.placeRevision,2);
  assert.equal(f.world.connections.get(id),connection);
 } finally {await f.dispose();}
});
