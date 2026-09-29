const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {GameService}=require('../.server-dist/game/service');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {DIALOGUE_EXCHANGE_SECONDS}=require('../.server-dist/game/text-world/conversation-flow');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
test.beforeEach(t=>{t.mock.method(global,'fetch',async()=>{throw Error('No provider requests in conversation interruption tests')});process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';});
function fixture(){
 const state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro',inventory:{cannedFood:2},stats:{hp:10,mind:10,energy:15}});state.flags.opening_seen=true;
 let saved={id:'conversation-interruption',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},dialogues=0,narrations=0,writes=0,lastInput;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s));writes++;},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,undefined,async input=>{dialogues++;lastInput=structuredClone(input);return fallback(input)},async c=>{narrations++;return fallbackNarration(c)});
 return {service,poll:()=>service.getState(saved.id),choose:(action,id)=>service.performAction(saved.id,action,{requestId:id}),get saved(){return structuredClone(saved)},get state(){return saved.state},get calls(){return {dialogues,narrations}},get writes(){return writes},get input(){return lastInput},edit:fn=>fn(saved.state)};
}
async function talking(f){const entry=await f.poll(),talk=entry.availableActions.find(o=>o.action.optionId==='talk:shumi');assert(talk);return f.choose(talk.action,'start-talk');}
const reply=snap=>snap.availableActions.find(o=>o.action.type==='npc_dialogue'&&o.action.command==='choose').action;
function hostile(s){s.textWorld.entities.enemy={id:'enemy',name:'위협하는 사람',description:'위협하는 사람이다.',components:{position:{zone:'concourse'},combatant:{encounterId:'test',hostile:true,hp:5,maxHp:5}}};}
function lamp(s,seconds){const w=s.textWorld;w.rooms.concourse.light=false;w.entities.test_lamp={id:'test_lamp',name:'작은 조명',description:'작은 조명이다.',components:{position:{zone:'concourse'},light:{on:true,fuelSeconds:seconds}}};}

test('a safe reply advances virtual time once, reserves the NPC, and polling or duplicate delivery advances nothing',async()=>{
 const f=fixture(),snap=await talking(f),action=reply(snap),before=f.state.textWorld.elapsedSeconds,calls=f.calls;
 const result=await f.choose(action,'reply-once');assert.equal(f.state.textWorld.elapsedSeconds-before,DIALOGUE_EXCHANGE_SECONDS);assert.equal(f.state.npcDialogue.active.turnNumber,1);assert.equal(f.calls.dialogues,calls.dialogues+1);assert.equal(f.calls.narrations,calls.narrations);assert.equal(f.state.textWorld.entities.shumi_presence.components.actor.life.mode,'INTERACT');
 const after=f.saved;await f.choose(action,'reply-once');assert.deepEqual(f.saved,after);await f.poll();assert.equal(f.state.worldElapsedMs,after.state.worldElapsedMs);assert.equal(f.calls.dialogues,calls.dialogues+1);assert(result.availableActions.every(o=>o.action.type==='npc_dialogue'));
});

test('an imminent light failure interrupts at its boundary and releases useful world actions without another generation',async()=>{
 const f=fixture(),snap=await talking(f);f.edit(s=>lamp(s,31));const before=f.state.textWorld.elapsedSeconds,calls=f.calls,exchanges=f.state.npcDialogue.conversations.shumi.exchanges.length;
 const result=await f.choose(reply(snap),'light-interruption');assert.equal(f.state.textWorld.elapsedSeconds-before,21);assert.equal(f.state.textWorld.entities.test_lamp.components.light.fuelSeconds,10);assert.equal(f.state.npcDialogue.active,null);assert.equal(f.state.npcDialogue.departure.reason,'interrupted');assert.deepEqual(f.calls,calls);assert.equal(f.state.npcDialogue.conversations.shumi.exchanges.length,exchanges);
 assert.match(result.currentScene.paragraphs.join(' '),/조명이 곧 꺼질/);assert.equal(result.currentScene.paragraphs.length,1);assert(!result.currentScene.paragraphs.join(' ').includes('움직임을 멈춘다'));assert(result.availableActions.length);assert(result.availableActions.every(o=>o.action.type!=='npc_dialogue'));assert.equal(interactionContext(f.state.textWorld).mode,'THREAT');
 const after=f.saved;await f.choose(reply(snap),'light-interruption');assert.deepEqual(f.saved,after);await f.poll();assert.deepEqual(f.calls,calls);assert.equal(f.state.worldElapsedMs,after.state.worldElapsedMs);const polled=f.saved;await assert.rejects(f.choose(reply(snap),'stale-reply'));assert.deepEqual(f.saved,polled);
});

for(const blocked of [false,true])test('known danger outranks an active conversation, and escape respects real passages: blocked='+blocked,async()=>{
 const f=fixture(),snap=await talking(f);f.edit(s=>{hostile(s);if(blocked)s.textWorld.entities.escape_gate={id:'escape_gate',name:'연결문',description:'잠긴 연결문이다.',components:{position:{zone:'concourse'},portal:{from:'concourse',to:'office'},openable:{isOpen:false,locked:true}}};});
 const before=f.state.textWorld.elapsedSeconds,calls=f.calls,exchanges=f.state.npcDialogue.conversations.shumi.exchanges.length;
 const result=await f.choose(reply(snap),'danger');assert.equal(f.state.textWorld.elapsedSeconds-before,1);assert.equal(f.state.npcDialogue.active,null);assert.deepEqual(f.calls,calls);assert.equal(f.state.textWorld.entities.shumi_presence.components.actor.life.mode,'ESCAPE');assert.equal(f.state.textWorld.entities.shumi_presence.components.position.zone,blocked?'concourse':'office');assert.equal(f.state.npcDialogue.conversations.shumi.exchanges.length,exchanges);
 assert.match(result.currentScene.paragraphs.join(' '),/위협/);assert(result.availableActions.every(o=>o.action.type!=='npc_dialogue'));assert(f.state.textWorld.events.some(e=>e.type==='STOPPED'));assert.equal(f.state.textWorld.events.some(e=>e.type==='ACTOR_MOVE'),!blocked);
});

test('a completed gift is conserved when a light warning interrupts the reply, and retry never gives twice',async()=>{
 const f=fixture(),snap=await talking(f),give=snap.availableActions.find(o=>o.action.command==='give'&&o.action.itemId==='cannedFood');assert(give);f.edit(s=>lamp(s,14));const before=f.state.textWorld.elapsedSeconds,calls=f.calls;
 const result=await f.choose(give.action,'gift-interrupted');assert.equal(f.state.textWorld.elapsedSeconds-before,5);assert.equal(f.state.inventory.cannedFood,1);assert.equal(f.state.npcDialogue.conversations.shumi.inventory.cannedFood,1);assert.equal(f.state.npcDialogue.conversations.shumi.affinity,1);assert.equal(f.state.npcDialogue.active,null);assert.deepEqual(f.calls,calls);assert.match(result.currentScene.paragraphs.join(' '),/캔 음식 1개를 건네자/);assert.match(result.currentScene.paragraphs.join(' '),/조명이 곧 꺼질/);
 const after=f.saved;await f.choose(give.action,'gift-interrupted');assert.deepEqual(f.saved,after);await assert.rejects(f.choose(give.action,'gift-stale'));assert.deepEqual(f.saved,after);
});

test('a danger already present stops a proposed gift before any item or affinity transfer',async()=>{
 const f=fixture(),snap=await talking(f),give=snap.availableActions.find(o=>o.action.command==='give');assert(give);const inventory=structuredClone(f.state.inventory),memory=structuredClone(f.state.npcDialogue.conversations.shumi),calls=f.calls;f.edit(hostile);
 await f.choose(give.action,'gift-not-started');assert.deepEqual(f.state.inventory,inventory);assert.deepEqual(f.state.npcDialogue.conversations.shumi.inventory,memory.inventory);assert.equal(f.state.npcDialogue.conversations.shumi.affinity,memory.affinity);assert.deepEqual(f.calls,calls);
});

test('a restored conversation with an absent participant ends cleanly and a later nearby meeting starts fresh',async()=>{
 const f=fixture(),snap=await talking(f);f.edit(s=>{s.textWorld.entities.shumi_presence.components.position={zone:'office'};});const before=f.state.worldElapsedMs,calls=f.calls;
 const ended=await f.choose(reply(snap),'out-of-range');assert.equal(f.state.worldElapsedMs,before);assert.equal(f.state.npcDialogue.active,null);assert.deepEqual(f.calls,calls);assert.match(ended.currentScene.paragraphs.join(' '),/상대 곁/);
 f.edit(s=>{s.textWorld.entities.shumi_presence.components.position={zone:'concourse'};});const ready=await f.poll(),fresh=ready.availableActions.find(o=>o.action.optionId==='talk:shumi');assert(fresh);await f.choose(fresh.action,'reunited');assert.equal(f.state.npcDialogue.active.turnNumber,1);assert.equal(f.state.npcDialogue.conversations.shumi.visitCount,2);assert.equal(f.state.npcDialogue.conversations.shumi.exchanges.length,2);
});

test('invalid or stale dialogue requests cannot spend time, transfer items, or trigger a new interruption',async()=>{
 const f=fixture(),snap=await talking(f);f.edit(hostile);const before=f.saved,calls=f.calls;
 for(const action of [{...reply(snap),choiceId:'invented'},{...reply(snap),turnNumber:999},{type:'npc_dialogue',command:'give',npcId:'shumi',itemId:'cannedFood',turnNumber:999}]){await assert.rejects(f.choose(action,'invalid-'+JSON.stringify(action)));assert.deepEqual(f.saved,before);assert.deepEqual(f.calls,calls);}
});
