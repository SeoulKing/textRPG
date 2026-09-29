const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseContentStudioDocument, loadStoredContentStudioDocument, StudioStorySchema } = require('../.server-dist/game/content-studio');
const { getEffectiveContentStudioDocument, buildWorldRegistryFromStudio, applyPreparedContentStudioRegistry, worldRegistry } = require('../.server-dist/game/data/registry');
const { inspectStudio } = require('../.server-dist/game/studio-validation');
const { StudioPreviewService } = require('../.server-dist/game/studio-preview');
const { ContentVersionStore, registerContentVersion, currentContentVersionId } = require('../.server-dist/game/content-versions');
const { createContentStudioStore, StudioConflict } = require('../.server-dist/game/content-studio-store');
const { createInitialGameState, performAction, syncScene, refreshLocationKnowledge } = require('../.server-dist/game/rules');
const { buildRuntimeRegistry } = require('../.server-dist/game/runtime-registry');
const { normalizeGameSession, FileGameRepository } = require('../.server-dist/game/repository');
const { GameService } = require('../.server-dist/game/service');
const { resolveStoryFrame } = require('../.server-dist/game/story-flow');
const { evaluateCondition } = require('../.server-dist/game/state-utils');
function fixture() {
  const doc = getEffectiveContentStudioDocument();
  const location = structuredClone(doc.locations.find(l => l.id === 'forest'));
  Object.assign(location, { id:'writer_region', name:'작가의 마을', summary:'새로운 마을이다.', mapPosition:{q:20,r:20}, neighbors:['shelter'], links:{shelter:{note:'거처로 돌아간다.'}}, interactionChoices:[], eventIds:[], stockNodes:[], residentIds:['writer_npc'], discoveryConditions:[{type:'location_visited',locationId:'shelter'}] });
  doc.locations.push(location);
  const shelter=doc.locations.find(l=>l.id==='shelter');shelter.links.writer_region={note:'마을로 간다.'};shelter.neighbors.push('writer_region');
  doc.people.push({id:'writer_npc',name:'작가 NPC',role:'주민',personality:['다정함'],relationToPlayer:'처음 만남',inventoryItemIds:[],locationId:'writer_region',summary:'물자를 나눠 준다.'});
  const story=StudioStorySchema.parse({id:'writer_story',title:'보급품',locationId:'writer_region',entryLabel:'주민에게 말을 건다',once:true,personIds:['writer_npc'],scenes:[{id:'writer_start',locationId:'writer_region',title:'만남',paragraphs:[],blocks:[{speakerId:'writer_npc',text:'필요한 만큼 가져가세요.'}],choices:[{id:'writer_reward',label:'보급품을 받는다',outcomeHint:'',once:true,conditions:[{type:'has_item',itemId:'scrapMetal',amount:1}],effects:[{type:'remove_item',itemId:'scrapMetal',amount:1},{type:'add_item',itemId:'waterBottle',amount:2},{type:'add_item',itemId:'cannedFood',amount:1}],nextSceneId:'writer_end'},{id:'writer_decline',label:'사양한다',outcomeHint:'',endsStory:true}]},{id:'writer_end',locationId:'writer_region',title:'감사',paragraphs:['꾸러미를 챙긴다.'],terminal:true,choices:[{id:'writer_finish',label:'마친다',outcomeHint:'',endsStory:true}]}]});
  const opening=StudioStorySchema.parse({id:'writer_region_opening',title:'마을 기본 장면',locationId:'writer_region',entryLabel:'',native:'region',scenes:[{id:'writer_region_intro',locationId:'writer_region',title:'마을',paragraphs:['마을 입구다.'],choices:[]}]});
  const follow=StudioStorySchema.parse({id:'writer_follow',title:'다음 날의 만남',locationId:'kitchen',entryLabel:'다시 만난다',once:true,prerequisite:{storyId:'writer_story'},conditions:[{type:'day_gte',value:2}],scenes:[{id:'writer_follow_start',locationId:'kitchen',title:'재회',paragraphs:['다시 만나 반갑다.'],terminal:true,choices:[{id:'writer_follow_finish',label:'돌아간다',outcomeHint:'',endsStory:true}]}]});
  doc.stories.push(opening,story,follow);return parseContentStudioDocument(doc);
}
function activate(doc) { const registry=buildWorldRegistryFromStudio(doc);registerContentVersion(registry,true);applyPreparedContentStudioRegistry(registry);return registry; }
function inStory(doc, inventory={scrapMetal:1}) {const registry=activate(doc);const state=createInitialGameState();state.location='writer_region';state.sceneId='writer_region_intro';state.flags.opening_seen=true;state.inventory=inventory;refreshLocationKnowledge(state);performAction(state,{type:'content_action',actionId:'studio_story_writer_story'});return {state,registry};}

test('version 1 migrates without changing IDs, effects, menus or native paragraph text',()=>{
 const raw=loadStoredContentStudioDocument();const migrated=parseContentStudioDocument({...raw,version:1});assert.equal(migrated.version,2);
 const effective=getEffectiveContentStudioDocument(migrated);assert.deepEqual(inspectStudio(effective).issues,[]);
 const r1=buildWorldRegistryFromStudio(raw),r2=buildWorldRegistryFromStudio(effective);assert.deepEqual(r1,r2);
 const orphan=effective.stories.find(s=>s.native==='region');const old=orphan.scenes[0];old.paragraphs=['작가가 바꾼 기존 원고'];assert.deepEqual(buildWorldRegistryFromStudio(effective).scenes[old.id].paragraphs,['작가가 바꾼 기존 원고']);
});
test('region connects, NPC speaks authored lines, multiple rewards and costs execute once',()=>{
 const doc=fixture();assert.deepEqual(inspectStudio(doc).issues,[]);const {state,registry}=inStory(doc);
 assert.equal(state.flags.known_writer_region,true);assert.equal(registry.locations.writer_region.residentIds[0],'writer_npc');assert.match(registry.scenes.writer_start.paragraphs[0],/작가 NPC: “필요한 만큼 가져가세요.”/);
 performAction(state,{type:'content_choice',choiceId:'writer_reward'});assert.equal(state.inventory.waterBottle,2);assert.equal(state.inventory.cannedFood,1);assert.equal(state.inventory.scrapMetal??0,0);assert.equal(state.flags.studio_completed_writer_story,true);
 assert.match(state.systemNote,/\+2 물병/);assert.throws(()=>performAction(state,{type:'content_choice',choiceId:'writer_reward'}));assert.equal(state.inventory.waterBottle,2);
 performAction(state,{type:'content_choice',choiceId:'writer_finish'});assert.equal(state.sceneId,'writer_region_intro');assert.throws(()=>performAction(state,{type:'content_action',actionId:'studio_story_writer_story'}));
 const entry=registry.actions.studio_story_writer_follow;state.location='kitchen';state.sceneId='';syncScene(state);assert.equal(entry.conditions.every(c=>evaluateCondition(c,state)),false);state.day=2;state.worldElapsedMs=require('../.server-dist/game/base-data').REAL_DAY_MS;assert.equal(entry.conditions.every(c=>evaluateCondition(c,state)),true);performAction(state,{type:'content_action',actionId:entry.id});assert.equal(state.sceneId,'writer_follow_start');
});
test('unmet requirements and unavailable scene choices cannot grant rewards',()=>{
 const {state}=inStory(fixture(),{});assert.throws(()=>performAction(state,{type:'content_choice',choiceId:'writer_reward'}));assert.equal(state.inventory.waterBottle,undefined);
 const scene=buildRuntimeRegistry(state).scenes.writer_start;state.sceneId='writer_region_intro';state.inventory.scrapMetal=1;assert.throws(()=>performAction(state,{type:'content_choice',choiceId:scene.choiceIds[0]}));assert.equal(state.inventory.waterBottle,undefined);
});
test('immediate event links travel to the target and preserve the next entry conditions',()=>{
 const doc=fixture();const choice=doc.stories.find(s=>s.id==='writer_story').scenes[0].choices[1];choice.nextStoryId='writer_follow';delete choice.endsStory;
 const target=doc.stories.find(s=>s.id==='writer_follow');delete target.prerequisite;target.conditions=[];
 const {state}=inStory(doc);performAction(state,{type:'content_choice',choiceId:choice.id});assert.equal(state.location,'kitchen');assert.equal(state.sceneId,'writer_follow_start');
});
test('invalid links, item rewards, empty drafts and intentional loops produce useful diagnostics',()=>{
 const doc=fixture(),story=doc.stories.find(s=>s.id==='writer_story');story.scenes[0].choices[0].effects.push({type:'add_item',itemId:'missing',amount:1});
 assert(inspectStudio(doc).issues.some(i=>i.choiceId==='writer_reward'&&i.message.includes('아이템')));
 story.scenes[0].choices[0].effects.pop();story.scenes[0].choices[1].nextSceneId='writer_start';delete story.scenes[0].choices[1].endsStory;assert(!inspectStudio(doc).issues.some(i=>i.severity==='error'));
 story.scenes[0].blocks[0].text='';assert.doesNotThrow(()=>parseContentStudioDocument(doc));assert(inspectStudio(doc).issues.some(i=>i.message.includes('원고')));
});
test('preview uses the real reward engine without touching the live registry or saves',()=>{
 const doc=fixture();const live=JSON.stringify(worldRegistry);const preview=new StudioPreviewService();let p=preview.start(doc,{storyId:'writer_story',inventory:{scrapMetal:1},day:1});
 assert.equal(p.sceneId,'writer_start');p=preview.step(p.id,{action:{type:'content_choice',choiceId:'writer_reward'}});assert.equal(p.inventory.waterBottle,2);assert.equal(p.inventory.cannedFood,1);assert.deepEqual(p.trace.map(t=>t.label),['보급품을 받는다']);assert.equal(JSON.stringify(worldRegistry),live);
 p=preview.step(p.id,{action:{type:'content_choice',choiceId:'writer_finish'}});
 p=preview.step(p.id,{setup:{locationId:'kitchen',day:1}});assert(p.unmet.some(c=>c.label==='다시 만난다'));
 p=preview.step(p.id,{setup:{day:2}});assert.equal(p.day,2);
 p=preview.step(p.id,{action:{type:'content_action',actionId:'studio_story_writer_follow'}});assert.equal(p.sceneId,'writer_follow_start');assert.equal(JSON.stringify(worldRegistry),live);
});
test('draft writes detect stale tabs, preserve incomplete scenes, and atomically publish',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'textrpg-studio-'));const store=createContentStudioStore(undefined,root);await store.init();const doc=fixture();doc.stories.find(s=>s.id==='writer_story').scenes[0].blocks[0].text='';
 const first=await store.saveDraft(doc,null);const writes=await Promise.allSettled([store.saveDraft(doc,first.updatedAt),store.saveDraft(doc,first.updatedAt)]);assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert(writes.find(r=>r.status==='rejected').reason instanceof StudioConflict);
 const current=await store.load('draft');await store.publish(fixture(),current.updatedAt);const restart=createContentStudioStore(undefined,root);assert.equal((await restart.load('published')).document.version,2);
});
test('published versions survive restart, legacy normalization and manual save restore',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'textrpg-versions-'));const docA=fixture();const regA=activate(docA);const archives=new ContentVersionStore(undefined,root);await archives.init(regA);const oldId=currentContentVersionId();
 const repo=new FileGameRepository(root);await repo.init();const service=new GameService(repo);const game=await service.createGame();const session=await repo.loadGame(game.gameId);session.state.location='writer_region';session.state.sceneId='writer_region_intro';session.state.inventory={waterBottle:2};await repo.saveGame(session);await repo.saveManualGame(session,new Date().toISOString());
 const docB=structuredClone(docA);docB.items.find(i=>i.id==='waterBottle').name='새 물병';docB.people.find(p=>p.id==='writer_npc').name='새 인물';const regB=buildWorldRegistryFromStudio(docB);await archives.archive(regB);activate(docB);
 assert.equal(buildRuntimeRegistry((await repo.loadGame(session.id)).state).items.waterBottle.name,'물병');assert.equal(buildRuntimeRegistry(createInitialGameState()).items.waterBottle.name,'새 물병');
 const legacy=structuredClone(session);delete legacy.state.contentVersionId;assert.equal(normalizeGameSession(legacy).state.contentVersionId,oldId);
 await service.restoreManualGame(session.id);assert.equal((await repo.loadGame(session.id)).state.contentVersionId,oldId);
 const script=`const {ContentVersionStore}=require('./.server-dist/game/content-versions');const {FileGameRepository}=require('./.server-dist/game/repository');const {buildRuntimeRegistry}=require('./.server-dist/game/runtime-registry');const fs=require('node:fs');(async()=>{const root=process.argv[1],registry=JSON.parse(fs.readFileSync(process.argv[2]));await new ContentVersionStore(undefined,root).init(registry);const repo=new FileGameRepository(root);const game=await repo.loadGame(process.argv[3]);process.stdout.write(buildRuntimeRegistry(game.state).items.waterBottle.name);})().catch(e=>{console.error(e);process.exit(1)});`;
 const file=path.join(root,'new-registry.json');await fs.writeFile(file,JSON.stringify(regB));assert.equal(execFileSync(process.execPath,['-e',script,root,file,session.id],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}),'물병');
});

test('terminal scenes without authored choices offer a working exit',()=>{
 const doc=fixture();doc.stories.find(s=>s.id==='writer_story').scenes[1].choices=[];
 const {state,registry}=inStory(doc);performAction(state,{type:'content_choice',choiceId:'writer_reward'});
 const exit=registry.scenes.writer_end.choiceIds[0];assert.equal(registry.choices[exit].label,'이벤트 마치기');
 performAction(state,{type:'content_choice',choiceId:exit});assert.equal(state.sceneId,'writer_region_intro');
});

test('preview can start at a selected scene without changing entry rules or the live registry',()=>{
 const doc=fixture(),story=doc.stories.find(s=>s.id==='writer_story');story.conditions=[{type:'day_gte',value:5}];
 const live=JSON.stringify(worldRegistry),document=JSON.stringify(doc),preview=new StudioPreviewService();
 const normal=preview.start(doc,{storyId:story.id,day:1});assert.notEqual(normal.sceneId,'writer_start');
 const direct=preview.start(doc,{storyId:story.id,sceneId:'writer_end',day:1});assert.equal(direct.sceneId,'writer_end');assert.equal(direct.canUndo,false);
 assert.throws(()=>preview.start(doc,{storyId:story.id,sceneId:'writer_follow_start'}),/이벤트 안/);
 story.scenes[1].conditions=[{type:'day_gte',value:3}];assert.throws(()=>preview.start(doc,{storyId:story.id,sceneId:'writer_end',day:1}),/시험 조건/);story.scenes[1].conditions=[];
 assert.equal(JSON.stringify(worldRegistry),live);assert.equal(JSON.stringify(doc),document);
});
test('preview undo restores rewards, costs, once flags, stats, trace and setup changes atomically',()=>{
 const preview=new StudioPreviewService(),start=preview.start(fixture(),{storyId:'writer_story',inventory:{scrapMetal:1},day:1});
 assert.throws(()=>preview.step(start.id,{undo:true}),/되돌릴/);
 const chosen=preview.step(start.id,{action:{type:'content_choice',choiceId:'writer_reward'}});assert.equal(chosen.inventory.waterBottle,2);assert.equal(chosen.canUndo,true);
 let back=preview.step(start.id,{undo:true});assert.equal(back.sceneId,start.sceneId);assert.deepEqual(back.inventory,start.inventory);assert.deepEqual(back.stats,start.stats);assert.deepEqual(back.trace,[]);assert.equal(back.canUndo,false);
 const again=preview.step(start.id,{action:{type:'content_choice',choiceId:'writer_reward'}});assert.equal(again.inventory.waterBottle,2);
 const shifted=preview.step(start.id,{setup:{day:3,inventory:{waterBottle:7}}});assert.equal(shifted.day,3);
 back=preview.step(start.id,{undo:true});assert.equal(back.day,1);assert.deepEqual(back.inventory,again.inventory);assert.deepEqual(back.trace,again.trace);
 assert.throws(()=>preview.step(start.id,{undo:true,action:{type:'content_choice',choiceId:'writer_finish'}}));
 assert.throws(()=>preview.step(start.id,{action:{type:'content_choice',choiceId:'missing'}}));
 back=preview.step(start.id,{undo:true});assert.equal(back.sceneId,start.sceneId);assert.equal(back.canUndo,false);
});
