const test=require('node:test');
const assert=require('node:assert/strict');
const {GameService}=require('../.server-dist/game/service');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {startSubwayExpedition,descendSubwayFloor}=require('../.server-dist/game/subway-expedition');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
function fixture(){
 const state=createInitialGameState();state.location='subway';state.sceneId='subway_first_intro';state.flags.known_subway=true;
 let stored={id:'request-budget-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}},saved;
 let narrations=0;
 const repository={withGameLock:async(_id,fn)=>fn(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=structuredClone(s)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{},saveManualGame:async s=>{saved=structuredClone(s);return{}},loadManualGame:async()=>({session:structuredClone(saved)})};
 const service=new GameService(repository,undefined,undefined,undefined,undefined,async c=>{narrations++;return fallbackNarration(c)});
 return {service,repository,get stored(){return stored},get narrations(){return narrations}};
}
async function withoutNetwork(fn){
 const oldFetch=global.fetch,keys=['GEMINI_API_KEY','ENABLE_LLM_SUBWAY_EXPEDITION','ENABLE_LLM_WORLD_PLANNER','ENABLE_LLM_BACKGROUND_GENERATION'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let requests=0;global.fetch=async()=>{requests++;throw Error('Real provider access is forbidden in this test')};
 process.env.GEMINI_API_KEY='unit-test-placeholder';process.env.ENABLE_LLM_SUBWAY_EXPEDITION='true';process.env.ENABLE_LLM_WORLD_PLANNER='false';delete process.env.ENABLE_LLM_BACKGROUND_GENERATION;
 try{await fn(()=>requests);assert.equal(requests,0,'No provider request may run in a passive flow');}
 finally{global.fetch=oldFetch;for(const key of keys)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
}
test('concourse polling, map, inventory, saving and restoring never spend a Gemini request by default',()=>withoutNetwork(async()=>{
 const f=fixture();let snapshot=await f.service.getState(f.stored.id);
 assert.equal(f.stored.state.subwayExpedition.nextFloorStatus,'ready');
 assert.equal(f.stored.state.subwayExpedition.preparedNextFloor.floor.source,'template');
 await f.service.getState(f.stored.id);await f.service.getMap(f.stored.id);await f.service.getInventory(f.stored.id);
 await f.service.saveManualGame(f.stored.id);await f.service.restoreManualGame(f.stored.id);
 await Promise.all([...f.service.subwayFloorGenerationTasks.values()]);
 assert.equal(f.narrations,0);
 snapshot=await f.service.performAction(f.stored.id,snapshot.availableActions.find(c=>c.action.optionId==='travel:office').action);
 assert.equal(f.narrations,1);await f.service.getState(f.stored.id);assert.equal(f.narrations,1);
 assert(snapshot.availableActions.some(c=>c.action.optionId==='explore:crate'));
}));
test('disabling speculative generation leaves the next floor usable and recovers saved generating/failed statuses',()=>withoutNetwork(async()=>{
 const f=fixture();await f.service.getState(f.stored.id);
 const state=f.stored.state,prepared=state.subwayExpedition.preparedNextFloor;
 await startSubwayExpedition(state,f.stored.id,prepared.floor,state.subwayExpedition.runPlan);
 state.subwayExpedition.currentFloorProgress.eventResolved=true;state.subwayExpedition.currentFloorProgress.phase='complete';
 await f.service.getState(f.stored.id);assert.equal(f.stored.state.subwayExpedition.nextFloorStatus,'ready');
 for(const status of ['generating','failed']){f.stored.state.subwayExpedition.nextFloorStatus=status;await f.service.getState(f.stored.id);assert.equal(f.stored.state.subwayExpedition.nextFloorStatus,'ready');}
 const next=f.stored.state.subwayExpedition.preparedNextFloor;assert.equal(next.targetDepth,2);
 await descendSubwayFloor(f.stored.state,f.stored.id,next.floor);assert.equal(f.stored.state.subwayExpedition.depth,2);
}));
test('unchosen story generation is skipped before loading or calling the planner',()=>withoutNetwork(async()=>{
 const f=fixture();let loaded=0,generated=0;
 f.repository.loadGame=async()=>{loaded++;return structuredClone(f.stored)};
 f.service.planner.generateSceneDraft=async()=>{generated++;throw Error('Unchosen story should not be generated')};
 await f.service.preGenerateNarrativeBeats(f.stored.id);
 assert.equal(loaded,0);assert.equal(generated,0);
}));
