const test = require('node:test'), assert = require('node:assert/strict');
const {createInitialGameState} = require('../.server-dist/game/rules');
const {performTextWorldAction, textWorldActions} = require('../.server-dist/game/text-world');
const {fallbackNarration} = require('../.server-dist/game/text-world/narrator');
const {createSubwayTextWorld, migrateTextWorld, canReach} = require('../.server-dist/game/text-world/world');
const {resolveWorldActions} = require('../.server-dist/game/text-world/engine');
const {directNarrative, perceiveWorld} = require('../.server-dist/game/text-world/perception');
const {directChoices} = require('../.server-dist/game/text-world/choice-director');
const {availableWorldOptions} = require('../.server-dist/game/text-world/choices');
const {inventoryLightControls, performInventoryLightAction} = require('../.server-dist/game/text-world/inventory-lights');
const ids = s => textWorldActions(s).map(o => o.action.optionId);
const render = async c => fallbackNarration(c);
async function initial() { const s=createInitialGameState();s.location='subway';s.sceneId='subway_first_intro';s.flags.known_subway=true;await performTextWorldAction(s,{type:'text_world',command:'enter'},'door-flow',render);return s; }
async function choose(s,id) { const row=textWorldActions(s).find(o=>o.action.optionId===id);assert(row,'not visible: '+id+'; '+ids(s));await performTextWorldAction(s,row.action,'door-flow',render); }
function reload(s) { s.textWorld=migrateTextWorld(JSON.parse(JSON.stringify(s.textWorld))); }

test('a blocked door leads straight to visible surroundings, discovery, collection, unlocking and the lit corridor',async()=>{
 const s=await initial();assert(!JSON.stringify(s.textWorld.lastParagraphs).includes('열쇠'));
 await choose(s,'open:door');assert(s.textWorld.events.some(e=>e.type==='STOPPED'));assert(ids(s).includes('inspect:floor'));
 assert(!ids(s).includes('open:door'),'do not offer the same known failure');
 reload(s);await choose(s,'inspect:floor');assert(ids(s).includes('take:doorKey'));assert.equal(s.inventory.ironDoorKey??0,0);
 assert.equal(s.textWorld.player.posture,'crouching');const time=s.textWorld.elapsedSeconds;
 reload(s);await choose(s,'take:doorKey');assert.equal(s.inventory.ironDoorKey,1);assert.equal(s.textWorld.elapsedSeconds-time,3);
 assert.equal(s.textWorld.player.posture,'crouching');assert(!s.textWorld.events.some(e=>['MOVE','POSTURE'].includes(e.type)));
 assert.equal(ids(s)[0],'unlock:door');reload(s);await choose(s,'unlock:door');
 assert.equal(s.textWorld.entities.door.components.openable.locked,false);assert.equal(s.textWorld.entities.door.components.openable.isOpen,true);
 assert.equal(s.textWorld.player.zone,'office');assert(!ids(s).includes('travel:corridor'));
 await choose(s,'equip:lamp');const light=inventoryLightControls(s)[0];assert(light);performInventoryLightAction(s,{type:'item_light',...light,on:true});
 assert(ids(s).includes('travel:corridor'));await choose(s,'travel:corridor');await choose(s,'travel:office');
 assert.equal(s.inventory.ironDoorKey,1);assert(s.textWorld.entities.door.components.openable.isOpen);
});

test('usable locks retain a progress slot even while focusing on a stocked container with a different held item',async()=>{
 const s=await initial();await choose(s,'inspect:floor');await choose(s,'take:doorKey');
 await choose(s,'explore:crate');await choose(s,'collect:crate');
 assert.equal(ids(s)[0],'unlock:door');assert.notEqual(s.textWorld.player.heldItemId,'doorKey');
 await choose(s,'unlock:door');assert(s.textWorld.entities.door.components.openable.isOpen);
});

test('blocked-door information selection does not inspect hidden rewards to choose a surface',async()=>{
 const s=await initial();await choose(s,'open:door');const w=s.textWorld;
 delete w.entities.doorKey;w.choiceHistory=[];
 assert(directChoices(w,s,availableWorldOptions(w,s)).some(o=>o.id==='inspect:floor'));
 assert(!JSON.stringify(textWorldActions(s)).includes('열쇠'));
});

test('discovery grants reach only at the observed host and the same physical anchor',()=>{
 const w=createSubwayTextWorld();w.player.near='floor';w.player.position='floor';w.player.posture='crouching';
 assert(!canReach(w,w.entities.doorKey));w.observations.floor={stages:['surface'],inspected:true,collected:false};assert(canReach(w,w.entities.doorKey));
 w.entities.doorKey.details.anchor='far-wall';assert(!canReach(w,w.entities.doorKey));
});

test('authored sensory responses follow successful operations and preserve edited or legacy content',()=>{
 const s=createInitialGameState(),w=createSubwayTextWorld();w.player.near='door';
 assert(!perceiveWorld(w).some(f=>f.id.startsWith('response:')));
 resolveWorldActions(w,s,[{type:'OPEN',target:'door'}]);assert(!perceiveWorld(w).some(f=>f.id.startsWith('response:')));
 s.inventory.ironDoorKey=1;w.events=[];resolveWorldActions(w,s,[{type:'UNLOCK',target:'door'},{type:'OPEN',target:'door'}]);
 const c=directNarrative(w);assert(c.optionalFacts.some(f=>f.id.startsWith('response:door:')));
 assert.match(fallbackNarration(c).paragraphs.join(' '),/딸깍|삐걱/);
 delete w.entities.door.details.responses;assert(perceiveWorld(w).some(f=>f.id.startsWith('response:door:')),'old unedited saves inherit the response');
 w.entities.door.description='소리 없이 미끄러지는 문이다.';assert(!perceiveWorld(w).some(f=>f.id.startsWith('response:door:')),'an edited door does not inherit rusty hinges');
});
