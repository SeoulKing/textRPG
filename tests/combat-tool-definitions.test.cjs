const test=require('node:test'),assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {createNpcDialogueGenerator}=require('../.server-dist/game/npc-dialogue-pipeline');
const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');
const {worldDeparturePlan}=require('../.server-dist/game/text-world/departure');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,sorted(v[k])])):v;
test.beforeEach(t=>{t.mock.method(global,'fetch',async()=>{throw Error('External requests disabled in concourse verification')});process.env.ENABLE_LLM_WORLD_PLANNER='false';process.env.ENABLE_LLM_BACKGROUND_GENERATION='false';});
async function fixture(setup=()=>{},narrator=fallbackNarration){
 const state=createInitialGameState();Object.assign(state,{location:'subway',sceneId:'subway_repeat_intro'});state.flags.opening_seen=true;state.stats={hp:9,mind:8,energy:15};await setup(state);
 let saved={id:'concourse-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},snap,renders=0,encounters=0,npc=0,seq=0;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(sorted(structuredClone(saved))),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s))},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const fallback=createNpcDialogueGenerator(undefined,()=>false);
 const service=new GameService(repo,undefined,undefined,async()=>{encounters++;throw Error('Template encounter')},async c=>{npc++;return fallback(c)},async c=>{renders++;return narrator(c)});
 const f={service,get state(){return saved.state},get world(){return saved.state.textWorld},get snap(){return snap},get renders(){return renders},get encounters(){return encounters},get npc(){return npc},
 get rows(){return [...snap.availableActions,...(snap.exploration?.generalActions??[]),...(snap.exploration?.targets??[]).flatMap(t=>t.actions)]},
 async poll(){snap=await service.getState(saved.id);return snap},
 async raw(action,requestId='concourse-'+(++seq)){snap=await service.performAction(saved.id,action,{requestId});return {action,requestId}},
 async choose(id){const row=f.rows.find(r=>r.action.optionId===id||r.action.command===id||r.id===id);assert(row,'not offered '+id+'; '+f.rows.map(r=>r.action.optionId||r.action.command));return f.raw(row.action)}};
 await f.poll();return f;
}

const {startSubwayExpedition,descendSubwayFloor}=require('../.server-dist/game/subway-expedition');
const {beginSubwaySituation}=require('../.server-dist/game/subway-encounter');
const {expeditionFloorIds}=require('../.server-dist/game/text-world/expedition-floor-state');
const {combatGeometry,advanceCombatOpponent}=require('../.server-dist/game/text-world/combat-space');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {buildNarrationPrompt}=require('../.server-dist/game/text-world/narration-prompt');
async function battle(setup=()=>{}){const f=await fixture(setup);await f.choose('focus:subway_depth_stairs');await f.choose('journey:start_subway_expedition');return f;}
function combatRow(f,primary){const choices=f.state.subwayExpedition.currentFloorProgress.encounter.currentScene.choices;return f.rows.find(r=>choices.some(c=>c.intent.primary===primary&&r.action.optionId==='combat:'+c.id));}
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {registerContentVersion}=require('../.server-dist/game/content-versions');
const {StudioItemSchema}=require('../.server-dist/game/content-studio');
const {combatTool}=require('../.server-dist/game/tool-combat');
const {validateWorldAction}=require('../.server-dist/game/text-world/engine');
function authorTools(state,definitions){const registry=structuredClone(buildRuntimeRegistry(state));for(const d of definitions){registry.items[d.id]=StudioItemSchema.parse({name:'시험 도구',description:'공간에 사용하는 도구.',kind:'tool',rarity:'common',price:0,tags:['도구'],effects:{},...d});state.inventory[d.id]=d.count??1;if(d.maxDurability)state.toolDurability[d.id]=d.maxDurability;}state.contentVersionId=registerContentVersion(registry);}
async function wield(f,id){const entity=Object.values(f.world.entities).find(e=>e.components.portable?.itemId===id&&e.components.position.zone==='player');assert(entity,id+' must be materialized');await f.choose('hold:'+entity.id);return entity.id;}
test('an authored tool can cut a physical structure and attack with its final charge, preserving a separate spare',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await battle(s=>authorTools(s,[{id:'workChisel',name:'작업 끌',maxDurability:2,count:2,toolCapabilities:{cut:2},combat:{kind:'attack',hitChance:95,damage:3,counterChance:40}}]));
 const ids=expeditionFloorIds(f.state),target=ids.prefix+'_cache1';await f.choose('explore:'+target);await f.choose('tool:workChisel:'+target+':cut');const selected=f.world.player.heldItemId;assert.equal(f.world.entities[selected].toolDurability,1);
 const before=f.renders;await f.choose('combat:tool-workChisel');const result=f.state.subwayExpedition.currentFloorProgress.encounter.history.at(-1).result;
 assert.equal(result.damageDealt,3);assert.equal(f.world.entities[selected].components.position.zone,'consumed');assert.equal(f.state.inventory.workChisel,1);assert.equal(f.renders,before+1);assert.equal(result.toolDurabilityChanges[0].itemId,'workChisel');
 const spare=Object.values(f.world.entities).find(e=>e.id!==selected&&e.components.portable?.itemId==='workChisel'&&e.components.position.zone==='player');assert(spare);assert.equal(spare.toolDurability,2);
});
test('cutting and striking capabilities make a new tool usable without adding its ID to an action table',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await battle(s=>authorTools(s,[{id:'scrapMallet',name:'고철 망치',maxDurability:3,toolCapabilities:{strike:2}}]));await wield(f,'scrapMallet');const row=f.rows.find(r=>r.action.optionId==='combat:tool-scrapMallet');assert(row);assert.match(row.outcomeHint,/명중 80%: 적 3피해/);await f.raw(row.action);assert.equal(f.state.subwayExpedition.currentFloorProgress.encounter.history.at(-1).result.damageDealt,3);assert.equal(f.state.toolDurability.scrapMallet,2);
});
test('an authored shield uses its guard chance and damage reduction instead of attacking',async t=>{
 t.mock.method(Math,'random',()=>.99);const f=await battle(s=>authorTools(s,[{id:'foldedGuard',name:'접이 방패',maxDurability:2,combat:{kind:'guard',successChance:60,damageReduction:2}}]));await wield(f,'foldedGuard');const row=f.rows.find(r=>r.action.optionId==='combat:tool-foldedGuard');assert(row);assert.match(row.label,/몸을 가린다/);assert.match(row.outcomeHint,/방어 성공 60%.*실패 피해 -2/);
 await f.raw(row.action);const result=f.state.subwayExpedition.currentFloorProgress.encounter.history.at(-1).result;assert.equal(result.success,false);assert.equal(result.damageDealt,0);assert.equal(result.damageTaken,0);assert.equal(f.state.toolDurability.foldedGuard,1);
});
test('explicit combat exclusion preserves work uses, and an unsupported tool cannot gain an attack',async t=>{
 const f=await battle(s=>authorTools(s,[{id:'crudeAxe',name:'작업 전용 도끼',maxDurability:8,toolCapabilities:{cut:3},combat:{kind:'none'}},{id:'flatPryBar',name:'벌림 막대',maxDurability:5,toolCapabilities:{pry:2}}]));
 await wield(f,'crudeAxe');assert(!f.rows.some(r=>r.action.optionId==='combat:tool-crudeAxe'));assert.equal(combatTool(f.state,'crudeAxe'),undefined);const target=expeditionFloorIds(f.state).prefix+'_cache1';await f.choose('explore:'+target);assert(f.rows.some(r=>r.action.optionId==='tool:crudeAxe:'+target+':cut'));
 await wield(f,'flatPryBar');assert(!f.rows.some(r=>r.action.optionId==='combat:tool-flatPryBar'));const before=JSON.stringify(f.state);await assert.rejects(f.raw({type:'text_world',command:'choose',optionId:'combat:tool-flatPryBar',revision:f.world.revision}),/선택할 수 없는/);assert.equal(JSON.stringify(f.state),before);
});
test('a tool defined without wear can attack without inventing a durability charge or consuming the item',async t=>{
 t.mock.method(Math,'random',()=>.7);const f=await battle(s=>authorTools(s,[{id:'steelGrip',name:'강철 손잡이',combat:{kind:'attack',hitChance:90,damage:2,counterChance:40}}]));const id=await wield(f,'steelGrip');const row=f.rows.find(r=>r.action.optionId==='combat:tool-steelGrip');assert(row);assert(!/내구도/.test(row.outcomeHint));await f.raw(row.action);
 assert.equal(f.state.inventory.steelGrip,1);assert.equal(f.world.entities[id].toolDurability,undefined);assert.deepEqual(f.state.subwayExpedition.currentFloorProgress.encounter.history.at(-1).result.toolDurabilityChanges,[]);
});
test('invalid authored combat values fail content parsing and valid profiles survive a normalized save',async()=>{
 const d={id:'safeTool',name:'시험 도구',description:'정의한 도구.',kind:'tool',rarity:'common',price:0,tags:[],effects:{},combat:{kind:'attack',hitChance:101,damage:2,counterChance:60}};assert(!StudioItemSchema.safeParse(d).success);assert(!StudioItemSchema.safeParse({...d,combat:{kind:'attack',hitChance:80,damage:0,counterChance:60}}).success);
 const f=await battle(s=>authorTools(s,[{id:'savedTool',name:'보관 도구',maxDurability:3,combat:{kind:'attack',hitChance:83,damage:2,counterChance:42}}]));await wield(f,'savedTool');const before=JSON.stringify(f.snap.availableActions);await f.poll();assert.equal(JSON.stringify(f.snap.availableActions),before);assert.deepEqual(combatTool(f.state,'savedTool').combat,{kind:'attack',hitChance:83,damage:2,counterChance:42});
});
