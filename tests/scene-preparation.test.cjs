const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Fastify = require('fastify');
const staticPlugin = require('@fastify/static');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app-api.js'), 'utf8');
function functions(names, globals) {
  const snippets = names.map(name => {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert(start >= 0, name);
    const rest = source.slice(start);
    const end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  });
  const context = vm.createContext(globals);
  vm.runInContext(snippets.join('\n'), context);
  return context;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function imageHarness() {
  const images = [];
  class Image {
    constructor() { this.events = {}; this.complete = false; this.naturalWidth = 0; this.attributes = []; images.push(this); }
    addEventListener(type, callback) { this.events[type] = callback; }
    decode() { this.decodes = (this.decodes || 0) + 1; return Promise.resolve(); }
    setAttribute(name, value) { this.attributes.push({name, value}); }
    replaceWith(image) { this.replacement = image; }
    load(ok = true) { this.complete = true; this.naturalWidth = ok ? 768 : 0; this.events[ok ? 'load' : 'error'](); }
  }
  const sceneImageCache = new Map();
  const dom = {sceneArt: new Image()};
  dom.sceneArt.attributes.push({name:'id', value:'scene-art'}, {name:'alt', value:'현재 장면 일러스트'});
  images.length = 0;
  const context = functions(['sceneImageSource','snapshotLocationCard','preloadImage','displaySceneImage','preloadActionSceneAssets','preloadNextSceneAssets'], {
    Image, sceneImageCache, SCENE_IMAGE_CACHE_LIMIT:2, ACTION_ASSET_PRELOAD_TIMEOUT_MS:5,
    client:{}, dom, window:{setTimeout,clearTimeout},
  });
  return {context, images, sceneImageCache, dom};
}
test('predicted old-save forest image is decoded once and reused for display and revisit', async () => {
  const h = imageHarness();
  const snapshot = {state:{location:'shelter'}, visibleLocations:[{id:'forest',imagePath:'assets/scenes/forest.svg'}]};
  h.context.preloadActionSceneAssets({type:'travel',targetId:'forest'}, snapshot);
  assert.equal(h.images.length,1);
  const source = 'assets/scenes/forest-pencil-charcoal.png';
  assert.equal(h.images[0].src,source);
  const first = h.context.preloadImage(source);
  assert.equal(first,h.context.preloadImage(source));
  h.images[0].load(); await first;
  h.context.displaySceneImage(source);
  assert.equal(h.dom.sceneArt,h.images[0]);
  assert.equal(h.dom.sceneArt.hidden,false);
  assert.equal(h.dom.sceneArt.decodes,1);
  assert(h.dom.sceneArt.attributes.some(entry=>entry.name==='id' && entry.value==='scene-art'));
  h.context.displaySceneImage(source);
  assert.equal(h.images.length,1);
});
test('late images cannot replace a newer scene; failed loads can recover and cache is bounded', async () => {
  const h = imageHarness();
  h.context.displaySceneImage('old.png');
  h.context.displaySceneImage('new.png');
  h.images[1].load(); await flush();
  const current = h.dom.sceneArt;
  h.images[0].load(); await flush();
  assert.equal(h.dom.sceneArt,current);
  const failed = h.context.preloadImage('failed.png');
  h.images[2].load(false); assert.equal(await failed,null);
  assert(!h.sceneImageCache.has('failed.png'));
  const recovered = h.context.preloadImage('failed.png');
  h.images[3].load(); assert.equal(await recovered,h.images[3]);
  assert(h.sceneImageCache.size<=2);
});
test('a stalled image cannot hold the result indefinitely and can appear when ready', async () => {
  const h = imageHarness();
  await h.context.preloadNextSceneAssets({state:{location:'forest'},visibleLocations:[{id:'forest',imagePath:'slow.png'}]});
  assert.equal(h.images.length,1);
  h.context.displaySceneImage('slow.png');
  assert.equal(h.dom.sceneArt.hidden,true);
  h.images[0].load(); await flush();
  assert.equal(h.dom.sceneArt,h.images[0]);
  assert.equal(h.dom.sceneArt.hidden,false);
});

function actionHarness(withLead = false) {
  const response = deferred(), transition = deferred(), lead = deferred();
  const events=[];
  const previous = {state:{location:'shelter'},currentScene:{id:'old'}};
  const next = {state:{location:withLead?'shelter':'forest'},currentScene:{id:'next'}};
  const client={gameId:'test',snapshot:previous,actionInFlight:false};
  const noop=()=>{};
  const context=functions(['submitAction'],{
    client, performance:{now:()=>events.length*10},
    normalizePostChoiceNarrative:value=>value??[], actionTransitionDurationMs:()=>withLead?500:1000,
    captureSceneHistory:()=>({history:true}),restoreSceneHistory:()=>events.push('restore'),
    beginPostChoiceNarrative:(paragraphs,append,source,keepChoices)=>{events.push('lead:'+source);assert.equal(append,true);assert.equal(keepChoices,withLead);return lead.promise},
    dom:{choices:{innerHTML:'choices',classList:{remove(){}}}},
    preloadActionSceneAssets:()=>events.push('predict'), api:()=>{events.push('request');return response.promise;},
    preloadNextSceneAssets:async()=>events.push('assets'), prepareScenePresentation:()=>events.push('prepare'),
    shelterStationForAction:()=>null,isMovementAction:()=>false,beginActionTransition:(_a,_trigger,_duration,_loading,thought)=>{events.push('transition');client.waitingThought=thought},
    waitForMilliseconds:()=>transition.promise, needsFreshGame:()=>false, completedQuestChanges:()=>[],
    shouldContinueLocationStory:()=>withLead,shouldAnimateScene:()=>true, finishActionTransition:noop,markActionAwaitingResponse:()=>events.push("awaiting"),
    render:options=>{events.push('render');client.renderOptions=options;},renderGameOverScreen:noop,showQuestCompletionBurst:noop,clearSceneAnimation:noop,
    window:{scrollTo:noop,alert:()=>events.push('error')},
  });
  return {context,client,previous,next,response,transition,lead,events};
}
test('click starts prediction and request immediately; response prepares UI before transition ends', async () => {
  const h=actionHarness();
  const action={type:'travel',targetId:'forest'};
  const pending=h.context.submitAction(action);
  assert.deepEqual(h.events,['predict','request','transition']);
  await h.context.submitAction(action);
  assert.equal(h.events.filter(e=>e==='request').length,1);
  h.response.resolve(h.next); await flush();
  assert(h.events.includes('prepare'));
  assert(!h.events.includes('render'));
  assert.equal(h.client.snapshot,h.previous);
  h.transition.resolve(); await pending;
  assert.equal(h.client.snapshot,h.next);
  assert.equal(h.client.actionInFlight,false);
  assert(h.client.lastActionTiming.preparedMs<=h.client.lastActionTiming.presentationReadyMs);
  assert.equal(h.events.filter(e=>e==='render').length,1);
});
test('slow and failed responses do not reveal speculative results or replay the action', async () => {
  const h=actionHarness();
  const pending=h.context.submitAction({type:'travel',targetId:'forest'});
  h.transition.resolve(); await flush();
  assert.equal(h.client.snapshot,h.previous);
  assert(!h.events.includes('render'));
  h.response.reject(new Error('offline')); await pending;
  assert.equal(h.client.snapshot,h.previous);
  assert.equal(h.client.actionInFlight,false);
  assert.equal(h.events.filter(e=>e==='request').length,1);
  assert(h.events.includes('error'));
});
test('prepared choices follow snapshot and recipe selection, without changing live selection', () => {
  let built=0;
  const client={activeCraftingRecipeDetailId:'recipe-a'};
  const context=functions(['prepareScenePresentation'],{
    client, preparedScenePresentations:new WeakMap(),
    buildStoryDisplay:snapshot=>snapshot.story,
    buildChoicePresentation:()=>({build:++built}),
  });
  const snapshot={story:{paragraphs:['결과']}};
  const first=context.prepareScenePresentation(snapshot);
  assert.equal(client.activeCraftingRecipeDetailId,'recipe-a');
  assert.equal(context.prepareScenePresentation(snapshot).choices,first.choices);
  client.activeCraftingRecipeDetailId='recipe-b';
  context.prepareScenePresentation(snapshot); assert.equal(built,2);
  first.choices=null;
  context.prepareScenePresentation(snapshot); assert.equal(built,3);
  context.prepareScenePresentation({...snapshot}); assert.equal(built,4);
});
test('closed panels skip content work and rebuild from current state when opened', () => {
  const rendered=[];
  const element={classList:{toggle(){}},setAttribute(){}};
  const client={isPanelOpen:false,activePanel:'map'};
  const context=functions(['renderPanel'],{
    client,PANEL_CONFIG:{map:{title:'지도'},inventory:{title:'가방'}},
    dom:{panelTitle:{},panelContent:element,panelShell:element,dockButtons:[]},
    renderMapPanel:()=>rendered.push('map'),renderInventoryPanel:()=>rendered.push('inventory'),refreshTransientScrollbars(){},
  });
  context.renderPanel(); assert.deepEqual(rendered,[]);
  client.isPanelOpen=true; context.renderPanel(); assert.deepEqual(rendered,['map']);
  client.isPanelOpen=false; client.activePanel='inventory'; context.renderPanel();
  assert.deepEqual(rendered,['map']);
  client.isPanelOpen=true; context.renderPanel(); assert.deepEqual(rendered,['map','inventory']);
});
test('static files use conditional HTTP caching; API and missing assets remain no-store', async t => {
  const app=Fastify();
  t.after(()=>app.close());
  const server=fs.readFileSync(path.join(__dirname,'../src/server.ts'),'utf8');
  const start=server.indexOf('  app.addHook("onSend",');
  const end=server.indexOf('\n  await app.register(cors',start);
  vm.runInNewContext(server.slice(start,end),{app});
  await app.register(staticPlugin,{root:path.resolve(__dirname,'../assets'),prefix:'/assets/'});
  app.get('/api/state',async()=>({ok:true}));
  const asset=await app.inject('/assets/scenes/camp.svg');
  assert.equal(asset.statusCode,200);
  assert.equal(asset.headers['cache-control'],'public, max-age=0, must-revalidate');
  assert(asset.headers.etag);
  const cached=await app.inject({url:'/assets/scenes/camp.svg',headers:{'if-none-match':asset.headers.etag}});
  assert.equal(cached.statusCode,304);
  assert.equal(cached.body,'');
  assert.equal((await app.inject('/api/state')).headers['cache-control'],'no-store');
  assert.equal((await app.inject('/assets/missing.svg')).headers['cache-control'],'no-store');
});

test('state refresh persists the current protagonist in its session without shared-template writes', async () => {
  const {GameService}=require('../.server-dist/game/service');
  let stored, saves=0;
  const repository={
    withGameLock:async (_id,operation)=>operation(),
    getTemplate:async()=>undefined,
    saveTemplate:async()=>{},
    saveProtagonistTemplate:async()=>{throw new Error('Unnecessary shared template write');},
    appendGenerationLog:async()=>{},appendActionLog:async()=>{},
    saveGame:async session=>{stored=structuredClone(session);saves++;},
    loadGame:async()=>structuredClone(stored),
  };
  const planner={planTomorrow:async state=>({day:state.day+1,regions:[],notes:[]})};
  const service=new GameService(repository,undefined,planner);
  const initial=await service.createGame();
  stored.state.stats.hp=5;
  stored.state.money=123;
  const refreshed=await service.getState(initial.gameId);
  assert.equal(refreshed.protagonist.condition.hp,refreshed.state.stats.hp);
  assert.equal(refreshed.protagonist.condition.money,123);
  assert.deepEqual(stored.world.protagonistCard,refreshed.protagonist);
  assert.equal(saves,2);
});


for(const actionType of ['text_world','npc_dialogue','subway_expedition']) {
test(actionType+': exploration keeps the current scene and chosen row until one complete result is ready',async()=>{
 const h=actionHarness(true),action={type:actionType,command:'choose',optionId:'explore:crate',revision:1};
 const pending=h.context.submitAction(action,null,{durationMs:500},['이전 저장의 선행 서사.'],'llm','돈이 좀 있을래나.');
 assert.deepEqual(h.events,['predict','request','transition']);assert.equal(h.context.dom.choices.innerHTML,'choices');assert.equal(h.client.waitingThought,'돈이 좀 있을래나.');
 await h.context.submitAction(action);assert.equal(h.events.filter(e=>e==='request').length,1);
 h.response.resolve(h.next);await flush();assert(!h.events.includes('render'));
 h.transition.resolve();await pending;
 assert.equal(h.client.snapshot,h.next);assert.equal(h.client.renderOptions.appendScene,true);assert.equal(h.client.renderOptions.scrollSceneToStart,true);
 assert(!h.events.some(e=>e.startsWith('lead:')));assert.equal(h.context.dom.choices.innerHTML,'choices');
});
test(actionType+': a slow response keeps readable history and a pending selection without speculative prose',async()=>{
 const h=actionHarness(true),pending=h.context.submitAction({type:actionType},null,{durationMs:500},['이전 선행 서사.']);
 h.transition.resolve();await flush();assert(h.events.includes('awaiting'));assert(!h.events.includes('render'));assert.equal(h.client.snapshot,h.previous);
 h.response.resolve(h.next);await pending;assert.equal(h.events.filter(e=>e==='render').length,1);assert(!h.events.some(e=>e.startsWith('lead:')));
});
test(actionType+': a failed action retains reading history, clears the pending lock and never retries automatically',async()=>{
 const h=actionHarness(true),pending=h.context.submitAction({type:actionType},null,{durationMs:500},['이전 선행 서사.']);
 h.response.reject(new Error('stale revision'));h.transition.resolve();await pending;
 assert(h.events.includes('restore'));assert.equal(h.client.snapshot,h.previous);assert.equal(h.client.actionInFlight,false);
 assert(!h.events.some(e=>e.startsWith('lead:')));assert.equal(h.events.filter(e=>e==='request').length,1);
});


}

test('a new activity revision refreshes otherwise identical recipe buttons',()=>{
 const h=functions(['availableActionsSignature'],{});
 const first={availableActions:[{id:'make_item',label:'제작',outcomeHint:'10분',isAvailable:true,action:{type:'content_choice',choiceId:'make_item',activityRevision:0}}]};
 const next=structuredClone(first);next.availableActions[0].action.activityRevision=1;
 assert.notEqual(h.availableActionsSignature(first),h.availableActionsSignature(next));
 assert.equal(h.availableActionsSignature(next),h.availableActionsSignature(structuredClone(next)));
});

test('subway reading continues within one floor, while another floor or expedition starts a fresh scene',()=>{
 const h=functions(['shouldContinueLocationStory'],{storySurfaceId:s=>s.currentScene.id,buildStoryDisplay:s=>s.currentScene});
 const first={gameId:'game',currentScene:{id:'scene-0'},state:{location:'subway',subwayExpedition:{active:true,runNumber:1,currentFloor:{id:'floor-1'}}}};
 const next=structuredClone(first);next.currentScene.id='scene-1';assert.equal(h.shouldContinueLocationStory(first,next),true);
 const otherFloor=structuredClone(next);otherFloor.state.subwayExpedition.currentFloor.id='floor-2';assert.equal(h.shouldContinueLocationStory(first,otherFloor),false);
 const otherRun=structuredClone(next);otherRun.state.subwayExpedition.runNumber=2;assert.equal(h.shouldContinueLocationStory(first,otherRun),false);
 const finished=structuredClone(next);finished.state.subwayExpedition.active=false;assert.equal(h.shouldContinueLocationStory(first,finished),false);
 assert.equal(h.shouldContinueLocationStory(first,first),false);
});

test('work with an activity revision preserves history and shows its thought while waiting for the complete result',async()=>{
 const h=actionHarness(true),action={type:'content_choice',choiceId:'craft_firewood',activityRevision:0};
 const pending=h.context.submitAction(action,null,{durationMs:500},['구버전 미리 쓴 작업 문단.'],'template','이걸 만들어 두면 쓸 일이 있겠지.');
 assert.equal(h.client.waitingThought,'이걸 만들어 두면 쓸 일이 있겠지.');assert.equal(h.client.snapshot,h.previous);
 h.transition.resolve();await flush();assert(h.events.includes('awaiting'));assert(!h.events.some(e=>e.startsWith('lead:')));
 h.response.resolve(h.next);await pending;assert.equal(h.client.renderOptions.appendScene,true);assert.equal(h.client.renderOptions.scrollSceneToStart,true);assert.equal(h.events.filter(e=>e==='request').length,1);
});
