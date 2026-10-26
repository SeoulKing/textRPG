const test=require('node:test'),assert=require('node:assert/strict');
const {worldRegistry,getEffectiveContentStudioDocument,buildWorldRegistryFromStudio,validateRegistry}=require('../.server-dist/game/data/registry');
const {createInitialGameState,performAction,advanceGameMinutes}=require('../.server-dist/game/rules');
const {resolveStoryFrame,buildActionCatalogFromStoryChoices}=require('../.server-dist/game/story-flow');
const {projectResourceSite,resourceAvailability,consumeResourceUse}=require('../.server-dist/game/resources');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {registerContentVersion,versionRegistry}=require('../.server-dist/game/content-versions');
const {normalizeGameSession}=require('../.server-dist/game/repository');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {GAME_MINUTE_MS}=require('../.server-dist/game/base-data');
const finiteRegistry=structuredClone(worldRegistry);
for(const l of Object.values(finiteRegistry.locations))for(const site of l.resourceSites??[])site.unlimited=false;
finiteRegistry.locations.river.resourceSites[0].recoveryMinutes=360;
function start(location='forest') {const s=createInitialGameState();s.contentVersionId=registerContentVersion(finiteRegistry);s.location=location;s.sceneId=location+'_repeat_intro';s.flags.opening_seen=true;s.stats={hp:10,mind:10,energy:15};return s}
const doAction=(s,actionId)=>performAction(s,{type:'content_action',actionId},{rng:()=>0});
const choices=s=>buildActionCatalogFromStoryChoices(resolveStoryFrame(s,buildRuntimeRegistry(s)).choices,s);
const site=(location,id)=>finiteRegistry.locations[location].resourceSites.find(s=>s.id===id);

test('manual and tool gathering consume the same finite site while keeping their distinct yields',()=>{
 let s=start();s.inventory={crudeAxe:1};
 doAction(s,'chop_wood_at_forest');doAction(s,'chop_wood_with_crude_axe');
 assert.equal(s.inventory.wood,8);assert.equal(s.resourceState.forest.fallen_wood.remaining,10);
 s=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));
 for(let i=0;i<10;i++)doAction(s,'chop_wood_at_forest');
 assert.equal(s.resourceState.forest.fallen_wood.remaining,0);
 for(const id of ['chop_wood_at_forest','chop_wood_with_crude_axe']){
  const row=choices(s).find(c=>c.id===id);assert(row);assert(!row.isAvailable);assert.equal(row.remainingUses,0);assert.match(row.statusLabel,/소진/);assert.match(row.outcomeHint,/다른 자원/);
  const before={inventory:structuredClone(s.inventory),time:s.worldElapsedMs,remaining:s.resourceState.forest.fallen_wood.remaining};
  assert.throws(()=>doAction(s,id),/모두 확인/);
  assert.deepEqual({inventory:s.inventory,time:s.worldElapsedMs,remaining:s.resourceState.forest.fallen_wood.remaining},before);
 }
 assert(choices(s).find(c=>c.id==='gather_cordage_at_forest').isAvailable);
 s.worldElapsedMs+=2*1440*GAME_MINUTE_MS;
 assert.equal(projectResourceSite(s,'forest',site('forest','fallen_wood')).remaining,0);
});

test('unsuccessful searches still spend an explored segment, but missing tools spend nothing',()=>{
 const s=start(),beforeInventory=structuredClone(s.inventory);
 assert.match(choices(s).find(c=>c.id==='search_forest_resources').outcomeHint,/빈손으로 끝날 수 있음/);
 assert(!choices(s).find(c=>c.id==='chop_wood_at_forest').outcomeHint.includes('빈손'));
 assert.throws(()=>doAction(s,'chop_wood_with_crude_axe'),/지금은/);
 assert.deepEqual(s.resourceState,{});assert.equal(s.worldElapsedMs,0);
 doAction(s,'search_forest_resources');assert.equal(s.resourceState.forest.forest_debris.remaining,5);
 assert.deepEqual(s.inventory,beforeInventory);assert.equal(s.worldElapsedMs,30*GAME_MINUTE_MS);
});

test('fishing opportunities recover in virtual time while away; reads and saves do not bank extra recovery',()=>{
 let s=start('river');
 for(let i=0;i<4;i++)doAction(s,'fish_at_river');
 let row=choices(s).find(c=>c.id==='fish_at_river');assert(!row.isAvailable);assert.equal(row.remainingUses,0);assert.match(row.outcomeHint,/240분/);
 const untouched=JSON.stringify(s.resourceState);
 for(let i=0;i<4;i++){choices(s);projectResourceSite(s,'river',site('river','fishing_pools'));}
 assert.equal(JSON.stringify(s.resourceState),untouched);
 performAction(s,{type:'travel',targetId:'forest'});
 advanceGameMinutes(s,200);s=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));
 assert.equal(projectResourceSite(s,'river',site('river','fishing_pools')).remaining,0);
 performAction(s,{type:'travel',targetId:'river'});advanceGameMinutes(s,10);
 row=choices(s).find(c=>c.id==='fish_at_river');assert(row.isAvailable);assert.equal(row.remainingUses,1);
 doAction(s,'fish_at_river');assert.equal(s.resourceState.river.fishing_pools.remaining,0);
 assert.equal(resourceAvailability(s,finiteRegistry.actions.fish_at_river,finiteRegistry).recoveryMinutes,330);
 // A long absence fills capacity, not an unbounded bank that instantly restores a new use.
 s.worldElapsedMs+=1440*GAME_MINUTE_MS;s.stats={hp:10,mind:10,energy:15};
 doAction(s,'fish_at_river');assert.equal(s.resourceState.river.fishing_pools.remaining,3);
});

test('custom site IDs, costs and recovery intervals work without adding a location-specific rule',()=>{
 const s=start(),registry=structuredClone(worldRegistry);
 registry.locations.forest.resourceSites=[{id:'custom_reedbed',name:'갈대 군락',capacity:3,recoveryMinutes:60}];
 const action={...registry.actions.gather_cordage_at_forest,resourceUse:{siteId:'custom_reedbed',cost:2}};
 let available=resourceAvailability(s,action,registry);assert.equal(available.remainingUses,1);consumeResourceUse(s,action,available);
 available=resourceAvailability(s,action,registry);assert.equal(available.remainingUses,0);assert.equal(available.recoveryMinutes,60);
 advanceGameMinutes(s,30);assert.equal(resourceAvailability(s,action,registry).recoveryMinutes,30);
 advanceGameMinutes(s,30);available=resourceAvailability(s,action,registry);assert.equal(available.remainingUses,1);consumeResourceUse(s,action,available);assert.equal(s.resourceState.forest.custom_reedbed.remaining,0);
 s.location='shelter';assert.throws(()=>resourceAvailability(s,action,registry),/현재 장소/);
});

test('an interrupted gathering activity reserves one site use without awarding material after death',()=>{
 const s=start();s.stats.hp=1;s.conditions.injury={level:1,damageProgress:.99};
 doAction(s,'chop_wood_at_forest');assert(s.isGameOver);assert(s.worldElapsedMs<30*GAME_MINUTE_MS);
 assert.equal(s.inventory.wood??0,0);assert.equal(s.resourceState.forest.fallen_wood.remaining,11);
});

test('legacy saves gain absent resource fields without resetting inventory, progress or archived content',()=>{
 const archived=structuredClone(worldRegistry);
 archived.scenes.forest_chop_result_1.paragraphs[0]="당신은 마른 나무와 부서진 가지를 골라 칼날을 세운다. 젖지 않은 부분만 따로 떼어 내자, 손에 들 만한 판자들이 묵직하게 모인다.";
 for(const l of Object.values(archived.locations)){delete l.resourceSites;for(const a of l.interactionChoices)delete a.resourceUse;}
 for(const a of Object.values(archived.actions))delete a.resourceUse;
 const version=registerContentVersion(archived),s=start();s.contentVersionId=version;s.inventory.wood=17;delete s.resourceState;
 const session=normalizeGameSession({id:'resource-legacy',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:s,world:{}});
 assert.deepEqual(session.state.resourceState,{});assert.equal(session.state.inventory.wood,17);
 const registry=buildRuntimeRegistry(session.state);assert.equal(registry.actions.chop_wood_at_forest.resourceUse.siteId,'fallen_wood');validateRegistry(registry);
 assert(!/칼날|판자/.test(registry.scenes.forest_chop_result_1.paragraphs[0]));
 assert.deepEqual(versionRegistry(version),archived);
 doAction(session.state,'chop_wood_at_forest');
 const restored=normalizeGameSession(JSON.parse(JSON.stringify(session)));assert.deepEqual(restored.state.resourceState,{});assert.equal(restored.state.inventory.wood,20);
});

test('Studio defaults preserve authored quantities and explicit overrides and validate bad site references',()=>{
 const document=getEffectiveContentStudioDocument();const forest=document.locations.find(l=>l.id==='forest');
 forest.resourceSites.find(s=>s.id==='fallen_wood').capacity=7;forest.resourceSites.find(s=>s.id==='fallen_wood').unlimited=false;
 const action=document.stories.find(s=>s.id==='native_region_forest').actions.find(a=>a.id==='chop_wood_at_forest');
 action.effects.find(e=>e.type==='add_item').amount=9;action.resourceUse.cost=2;
 const before=structuredClone(document),registry=buildWorldRegistryFromStudio(document);validateRegistry(registry);assert.deepEqual(document,before);
 assert.equal(registry.locations.forest.resourceSites.find(s=>s.id==='fallen_wood').capacity,7);assert.equal(registry.locations.forest.resourceSites.find(s=>s.id==='fallen_wood').unlimited,false);assert.equal(registry.actions.chop_wood_at_forest.resourceUse.cost,2);assert.equal(registry.actions.chop_wood_at_forest.effects.find(e=>e.type==='add_item').amount,9);
 action.resourceUse=null;assert.equal(buildWorldRegistryFromStudio(document).actions.chop_wood_at_forest.resourceUse,null);
 registry.actions.chop_wood_at_forest.resourceUse.siteId='missing';assert.throws(()=>validateRegistry(registry),/unavailable resource site/);
});


test('native repeatable sites ignore legacy depletion without counters, recovery waits or archive mutations',()=>{
 const archived=structuredClone(worldRegistry);
 for(const l of Object.values(archived.locations))for(const site of l.resourceSites??[])delete site.unlimited;
 archived.locations.river.resourceSites[0].recoveryMinutes=360;
 for(const a of Object.values(archived.actions))if(a.resourceUse)delete a.resourceUse.directFromEntry;
 for(const l of Object.values(archived.locations))for(const a of l.interactionChoices)if(a.resourceUse)delete a.resourceUse.directFromEntry;
 const version=registerContentVersion(archived),s=createInitialGameState();s.contentVersionId=version;s.inventory.wood=17;
 const registry=buildRuntimeRegistry(s);validateRegistry(registry);
 for(const [location,id]of [['forest','chop_wood_at_forest'],['forest','chop_wood_with_crude_axe'],['forest','gather_cordage_at_forest'],['forest','search_forest_resources'],['forest','search_bushes_with_utility_knife'],['river','fish_at_river']]){
  s.location=location;const action=registry.actions[id];assert(action?.resourceUse,id);
  s.resourceState[location]??={};s.resourceState[location][action.resourceUse.siteId]={remaining:0,updatedAtMinutes:0,recoveryProgressMinutes:0};
  const before=JSON.stringify(s);
  for(let i=0;i<100;i++){const available=resourceAvailability(s,action,registry);assert.equal(available.site.unlimited,true);assert.equal(available.remainingUses,undefined);assert.equal(available.recoveryMinutes,undefined);assert.equal(available.exhaustedHint,'');consumeResourceUse(s,action,available);}
  assert.equal(JSON.stringify(s),before);
 }
 assert.equal(registry.actions.chop_wood_at_forest.resourceUse.directFromEntry,true);assert.equal(registry.actions.fish_at_river.resourceUse.directFromEntry,true);
 assert.deepEqual(versionRegistry(version),archived);
});
