const test = require('node:test'), assert = require('node:assert/strict');
const {createInitialGameState} = require('../.server-dist/game/rules');
const {GameStateSchema} = require('../.server-dist/game/schemas');
const {createSubwayTextWorld} = require('../.server-dist/game/text-world/world');
const {resolveWorldActions, validateWorldAction} = require('../.server-dist/game/text-world/engine');
const {interactionOptions} = require('../.server-dist/game/text-world/affordances');
function fixture(tool='crudeAxe', target='door') {
 const state=createInitialGameState();state.location='subway';state.textWorld=createSubwayTextWorld();
 state.inventory[tool]=1;state.toolDurability[tool]=tool==='crudeAxe'?8:10;state.stats.energy=15;
 const world=state.textWorld;world.player.near=target;world.player.position=world.entities[target].details.anchor;
 world.observations[target]={stages:['outline','surface'],collected:false,inspected:true};
 return {state,world};
}
function use(f, tool='crudeAxe', target='door', technique='strike') {return resolveWorldActions(f.world,f.state,[{type:'USE_TOOL',target,toolItemId:tool,technique}]);}

test('key and prying unlock the same intact door with different costs and persistent lock damage',()=>{
 const key=fixture();key.state.inventory.ironDoorKey=1;
 const clean=resolveWorldActions(key.world,key.state,[{type:'UNLOCK',target:'door'},{type:'OPEN',target:'door'}]);
 assert.equal(clean.elapsedSeconds,5);assert(!key.world.entities.door.components.openable.lockBroken);
 const f=fixture('subwayBaton');const result=use(f,'subwayBaton','door','pry');assert(!result.interrupted);
 assert.equal(result.elapsedSeconds,22);assert.equal(f.state.stats.energy,14);assert.equal(f.state.toolDurability.subwayBaton,9);
 const door=GameStateSchema.parse(JSON.parse(JSON.stringify(f.state))).textWorld.entities.door.components;
 assert(door.openable.isOpen);assert(!door.openable.locked);assert(door.openable.lockBroken);assert.equal(door.structure.integrity,6);
 assert(f.world.events.some(e=>e.type==='SOUND'&&e.causedBy));assert.equal(f.state.inventory.subwayBaton,1);
});

test('partial strikes survive saves, consume exact costs and eventually prevent closing a destroyed door',()=>{
 let f=fixture();const initial=JSON.stringify(f.state);const offers=interactionOptions(f.world,f.state);
 assert(offers.some(o=>o.id==='tool:crudeAxe:door:strike'));assert.equal(JSON.stringify(f.state),initial,'projection must be pure');
 let seconds=0;
 for(let i=0;i<6;i++) {
  const result=use(f);assert(!result.interrupted);seconds+=result.elapsedSeconds;
  assert.equal(f.world.entities.door.components.structure.integrity,5-i);
  f.state=GameStateSchema.parse(JSON.parse(JSON.stringify(f.state)));f.world=f.state.textWorld;
 }
 assert.equal(seconds,122);assert.equal(f.state.stats.energy,3);assert.equal(f.state.toolDurability.crudeAxe,2);
 assert(f.world.entities.door.components.openable.isOpen);assert(validateWorldAction(f.world,f.state,{type:'CLOSE',target:'door'}));
 assert(!interactionOptions(f.world,f.state).some(o=>o.id.startsWith('tool:')&&o.id.includes(':door:')));
});

test('destructive discovery is offered and stops before collection; salvage cannot be awarded twice',()=>{
 const f=fixture('crudeAxe','crate');use(f,'crudeAxe','crate','cut');
 const next=interactionOptions(f.world,f.state).find(o=>o.id==='tool:crudeAxe:crate:cut');assert(next,'final revealing cut must remain selectable');
 const inventory={...f.state.inventory};const result=resolveWorldActions(f.world,f.state,[...next.actions,{type:'TAKE',target:'water'}]);
 assert(result.discovery);assert.deepEqual(f.state.inventory,inventory,'discovery is not collection');
 const salvageId='salvage:crate:woodPlank';assert(f.world.entities[salvageId]);assert.equal(f.world.entities.salvage,undefined);
 assert(!resolveWorldActions(f.world,f.state,[{type:'TAKE',target:salvageId}]).interrupted);
 assert.equal(f.state.inventory.woodPlank,(inventory.woodPlank??0)+1);
 const before=JSON.stringify(f.state.inventory);assert(use(f,'crudeAxe','crate','cut').interrupted);
 assert.equal(JSON.stringify(f.state.inventory),before);assert.equal(Object.keys(f.world.entities).filter(id=>id===salvageId).length,1);
});

test('tool conditions use arbitrary target material, reject unsupported work, and remove a tool on its last charge',()=>{
 const f=fixture('utilityKnife');const original=f.world.entities.door;
 f.world.entities.customScreen={id:'customScreen',name:'천막',description:'팽팽한 천이다.',details:{anchor:'entrance',surface:'팽팽한 천이다.'},components:{position:{zone:'office'},structure:{material:'fabric',integrity:2,maxIntegrity:2,resistance:1,salvage:[]}}};
 f.world.player.near='customScreen';f.world.observations.customScreen={stages:['surface'],collected:false};
 f.state.toolDurability.utilityKnife=1;
 assert(!use(f,'utilityKnife','customScreen','cut').interrupted);assert.equal(f.world.entities.customScreen.components.structure.integrity,1);
 assert.equal(f.state.inventory.utilityKnife??0,0);assert(!interactionOptions(f.world,f.state).some(o=>o.id.startsWith('tool:utilityKnife:')));
 const after={energy:f.state.stats.energy,integrity:original.components.structure.integrity};
 assert(use(f,'utilityKnife','customScreen','cut').interrupted);assert.equal(f.state.stats.energy,after.energy);
 const poor=fixture();poor.state.stats.energy=1;assert(use(poor).interrupted);assert.equal(poor.state.toolDurability.crudeAxe,8);
 assert(!interactionOptions(poor.world,poor.state).some(o=>o.id==='tool:crudeAxe:door:strike'));
});
