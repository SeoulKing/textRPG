const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getEffectiveContentStudioDocument, prepareContentStudioDocument } = require('../.server-dist/game/data/registry');
const { parseContentStudioDocument } = require('../.server-dist/game/content-studio');
const { createContentStudioStore } = require('../.server-dist/game/content-studio-store');
const { registerContentVersion } = require('../.server-dist/game/content-versions');
const { buildRuntimeRegistry } = require('../.server-dist/game/runtime-registry');
const { createInitialGameState } = require('../.server-dist/game/rules');
const { TextWorldSchema } = require('../.server-dist/game/schemas/text-world');
const { performTextWorldAction, textWorldActions } = require('../.server-dist/game/text-world');
const { fallbackNarration } = require('../.server-dist/game/text-world/narrator');
const { textRoomIssues } = require('../.server-dist/game/text-world/validation');
const { perceiveWorld } = require('../.server-dist/game/text-world/perception');
const { createSubwayTextWorld } = require('../.server-dist/game/text-world/world');
const { inspectStudio } = require('../.server-dist/game/studio-validation');
const tools = require('../content-writer-tools.js');
const fresh = () => getEffectiveContentStudioDocument(parseContentStudioDocument({ version: 2 }));
const narrator = async context => fallbackNarration(context);
async function choose(state,id) {
 if(!textWorldActions(state).some(c=>c.action.optionId===id)) { const release=textWorldActions(state).find(c=>c.action.optionId==="defocus"); if(release) await performTextWorldAction(state,release.action,"room-test",narrator); }
 const action = textWorldActions(state).find(c=>c.action.optionId===id)?.action;
 assert(action, 'missing '+id);
 await performTextWorldAction(state,action,'room-test',narrator);
}

test('legacy Studio documents expose authored rooms, and stored drafts retain edits after restart and publication',async()=>{
 const doc=fresh(), room=doc.textRooms.find(r=>r.id==='office');
 assert.deepEqual(room.entities.map(e=>e.id),['crate','door','floor','doorKey','lamp','water','scrap']);
 const crate=room.entities.find(e=>e.id==='crate'), water=room.entities.find(e=>e.id==='water'), lamp=room.entities.find(e=>e.id==='lamp');
 crate.name='붉은 보관함';crate.description='빨간 페인트가 벗겨져 있다.';crate.details.placement='입구 기준 중앙 벽';crate.details.anchor='center-wall';
 lamp.name='작업등';lamp.details.placement='입구 기준 낮은 선반';water.name='생수 묶음';water.components.portable.amount=4;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'room-studio-'));
 const store=createContentStudioStore(undefined,dir);await store.init();
 const saved=await store.saveDraft(doc,null);
 const restarted=createContentStudioStore(undefined,dir);const restored=(await restarted.load('draft')).document;
 assert.equal(restored.textRooms[0].entities[0].name,'붉은 보관함');
 assert(tools.changes(fresh(),restored).some(c=>c.kind==='방·엔티티'));
 await restarted.publish(restored,saved.updatedAt);
 const published=(await restarted.load('published')).document;
 const {registry}=prepareContentStudioDocument(published);
 const id=registerContentVersion(registry,false);
 const state=createInitialGameState();state.location='subway';state.sceneId='subway_first_intro';state.contentVersionId=id;
 const runtime=buildRuntimeRegistry(state);
 assert.equal(runtime.textRooms[0].entities[0].name,'붉은 보관함');
 await performTextWorldAction(state,{type:'text_world',command:'enter'},'room-test',narrator,runtime.textRooms);
 assert.match(state.textWorld.lastParagraphs.join(' '),/중앙 벽.*붉은 보관함/);
 assert(!JSON.stringify(perceiveWorld(state.textWorld)).includes('생수 묶음'));
 assert(textWorldActions(state).some(c=>c.label.includes('작업등')));
 await choose(state,'explore:crate');assert.match(state.textWorld.lastParagraphs.join(' '),/빨간 페인트/);
 const before=state.inventory.waterBottle??0;await choose(state,'collect:crate');assert.equal(state.inventory.waterBottle,before+4);
 state.textWorld=TextWorldSchema.parse(JSON.parse(JSON.stringify(state.textWorld)));
 await choose(state,'leave');await performTextWorldAction(state,{type:'text_world',command:'enter'},'room-test',narrator,fresh().textRooms);
 assert.equal(state.textWorld.entities.crate.name,'붉은 보관함');assert.equal(state.textWorld.entities.water.components.position.zone,'player');
 assert.equal(state.inventory.waterBottle,before+4);
});

test('renamed and newly added entities drive choices and narration without fixed entity IDs',async()=>{
 const doc=fresh(),room=doc.textRooms[0];
 const lamp=room.entities.find(e=>e.id==='lamp');lamp.id='workLight';lamp.name='작업등';
 const door=room.entities.find(e=>e.id==='door');door.id='sideDoor';door.name='옆문';
 const loose=structuredClone(room.entities.find(e=>e.id==='water'));loose.id='extraWater';loose.name='바닥의 물';loose.components.position.zone='office';loose.components.portable.itemId=null;room.entities.push(loose);
 const state=createInitialGameState();state.location='subway';
 await performTextWorldAction(state,{type:'text_world',command:'enter'},'room-test',narrator,doc.textRooms);
 await choose(state,'take:extraWater');await choose(state,'open:sideDoor');assert(!perceiveWorld(state.textWorld).some(f=>f.kind==='entity'&&f.data.held&&typeof f.data.on==='boolean'));await choose(state,'equip:workLight');
 await choose(state,'inspect:floor');await choose(state,'take:doorKey');await choose(state,'unlock:sideDoor');
 await choose(state,'travel:corridor');assert.equal(state.textWorld.player.zone,'corridor');
 assert.equal(state.textWorld.entities.sideDoor.components.openable.isOpen,true);
 assert(!state.textWorld.lastParagraphs.join(' ').includes('손전등'));
});

test('room validation rejects missing rewards, duplicate IDs and invalid containment before publication',()=>{
 const doc=fresh(),room=doc.textRooms[0],items=new Set(doc.items.map(i=>i.id));
 assert.deepEqual(textRoomIssues(doc.textRooms,items),[]);
 room.entities.find(e=>e.id==='water').components.portable.itemId='missing-item';
 room.entities.find(e=>e.id==='crate').components.container.items.push('ghost');
 room.entities.push(structuredClone(room.entities[0]));
 const issues=inspectStudio(doc).issues.filter(i=>i.tab==='textRooms');
 assert(issues.some(i=>i.message.includes('지급할 아이템')));assert(issues.some(i=>i.message.includes('ghost')));assert(issues.some(i=>i.message.includes('중복')));
 assert.throws(()=>prepareContentStudioDocument(doc));
});

test('deleting or moving authored entities changes the visible layout and never restores removed contents',()=>{
 const doc=fresh(),room=doc.textRooms[0];
 room.entities=room.entities.filter(e=>!['lamp','water'].includes(e.id));
 room.entities.find(e=>e.id==='crate').components.container.items=['scrap'];
 const world=createSubwayTextWorld(doc.textRooms);
 const facts=JSON.stringify(perceiveWorld(world));assert(!facts.includes('손전등'));assert(!world.entities.water);
 assert.deepEqual(textRoomIssues(doc.textRooms,new Set(doc.items.map(i=>i.id))),[]);
});
