const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld,migrateTextWorld}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions,validateWorldAction}=require('../.server-dist/game/text-world/engine');
const {interactionOptions}=require('../.server-dist/game/text-world/affordances');
const {reconcileWorldInventory}=require('../.server-dist/game/text-world/inventory-state');
const {perceiveWorld}=require('../.server-dist/game/text-world/perception');
function fixture(target='crate') {
 const state=createInitialGameState();state.location='subway';state.textWorld=createSubwayTextWorld();state.stats.energy=15;
 state.inventory={crudeAxe:1,woodPlank:6,clothScrap:3,scrapMetal:4,cordage:2};state.toolDurability.crudeAxe=8;
 const world=state.textWorld;world.player.near=target;world.player.position=world.entities[target].details.anchor;
 world.observations[target]={stages:['surface'],inspected:true,collected:false};return {state,world};
}
function act(f,...actions){f.world.events=[];return resolveWorldActions(f.world,f.state,actions);}
const cut={type:'USE_TOOL',target:'crate',toolItemId:'crudeAxe',technique:'cut'};
const repair={type:'REPAIR',target:'crate'};
function reload(f){f.state=GameStateSchema.parse(JSON.parse(JSON.stringify(f.state)));f.world=f.state.textWorld;}

test('destroyed storage releases contents and cannot hold new items; paid repairs restore its physical function',()=>{
 const f=fixture();act(f,cut);const broken=act(f,cut);assert(broken.discovery);
 assert.deepEqual(f.world.entities.crate.components.container.items,[]);
 assert.equal(f.world.entities.water.components.position.zone,'office');
 assert(!perceiveWorld(f.world).some(fact=>fact.id==='contents:crate'||fact.id==='interior:crate'));
 assert(!act(f,{type:'TAKE',target:'water'}).interrupted);
 assert(validateWorldAction(f.world,f.state,{type:'PUT',target:'water',destination:'crate',relation:'inside'}));
 const before=JSON.stringify(f.state);assert(interactionOptions(f.world,f.state).some(o=>o.id==='repair:crate'));
 assert.equal(JSON.stringify(f.state),before,'reading repair options never consumes materials');
 const inventory={...f.state.inventory},energy=f.state.stats.energy;
 assert.equal(act(f,repair).elapsedSeconds,30);assert.equal(f.state.inventory.woodPlank,inventory.woodPlank-2);
 assert.equal(f.state.inventory.clothScrap,inventory.clothScrap-1);assert.equal(f.state.stats.energy,energy-1);
 reload(f);assert(f.world.entities.crate.components.physical.movable);assert.equal(f.world.entities.crate.components.physical.supportCapacity,5);
 assert(!validateWorldAction(f.world,f.state,{type:'PUT',target:'water',destination:'crate',relation:'inside'}));
 assert(!act(f,{type:'PUT',target:'water',destination:'crate',relation:'inside'}).interrupted);
 assert.equal(f.state.inventory.waterBottle??0,0);assert.equal(f.world.entities.crate.components.container.items.filter(id=>id==='water').length,1);
});

test('rebuild cycles leave distinct salvage stacks and cannot recreate old contents or pay out twice',()=>{
 const f=fixture();act(f,cut);act(f,cut);
 const first='salvage:crate:woodPlank';assert(f.world.entities[first]);
 act(f,repair);reload(f);act(f,cut);act(f,cut);
 const second=first+':2';assert(f.world.entities[first]);assert(f.world.entities[second]);
 assert.equal(f.world.entities.crate.components.structure.breakCount,2);
 assert.equal(Object.values(f.world.entities).filter(e=>e.id==='water').length,1);
 assert(!act(f,{type:'TAKE',target:first}).interrupted);assert(!act(f,{type:'TAKE',target:second}).interrupted);
 assert.equal(f.state.inventory.woodPlank,6,'two recovered planks offset only the two spent rebuilding');
 const before={...f.state.inventory};assert(act(f,cut).interrupted);assert.deepEqual(f.state.inventory,before);
});

test('repair consumes registered carried material stacks and rejects missing costs without mutation',()=>{
 const f=fixture();act(f,cut);
 f.world.entities.material={id:'material',name:'판자',description:'판자다.',inventoryRegistered:true,components:{position:{zone:'player'},portable:{itemId:'woodPlank',amount:6}}};
 act(f,repair);assert.equal(f.world.entities.material.components.portable.amount,4);
 act(f,cut);f.state.inventory.clothScrap=0;reconcileWorldInventory(f.state);
 const before={inventory:{...f.state.inventory},energy:f.state.stats.energy,time:f.world.elapsedSeconds,integrity:f.world.entities.crate.components.structure.integrity};
 assert(!interactionOptions(f.world,f.state).some(o=>o.id==='repair:crate'));assert(act(f,repair).interrupted);
 assert.deepEqual({inventory:{...f.state.inventory},energy:f.state.stats.energy,time:f.world.elapsedSeconds,integrity:f.world.entities.crate.components.structure.integrity},before);
});

test('a rebuilt door stays unlocked, can close again, and tool requirements and wear are enforced',()=>{
 const f=fixture('door');f.world.entities.door.components.structure.integrity=1;
 act(f,{type:'USE_TOOL',target:'door',toolItemId:'crudeAxe',technique:'strike'});
 assert(f.world.entities.door.components.openable.lockBroken);
 const required={type:'REPAIR',target:'door',toolItemId:'crudeAxe'};
 assert(validateWorldAction(f.world,f.state,{type:'REPAIR',target:'door'}));
 const wear=f.state.toolDurability.crudeAxe;const outcome=act(f,required);assert(!outcome.interrupted);assert.equal(outcome.elapsedSeconds,45);
 assert.equal(f.state.toolDurability.crudeAxe,wear-1);reload(f);
 assert(f.world.entities.door.components.openable.isOpen);assert(!f.world.entities.door.components.openable.locked);
 assert(f.world.entities.door.components.openable.lockBroken);assert(!act(f,{type:'CLOSE',target:'door'}).interrupted);
});

test('legacy broken storage is normalized once without recreating salvage or consuming inventory',()=>{
 const f=fixture();f.world.entities.crate.components.structure.integrity=0;
 f.world.entities.crate.components.openable={isOpen:true,locked:false};
 Object.assign(f.world.entities.crate.components.physical,{movable:false,opaque:false,blocksPassage:false,supportCapacity:undefined});
 delete f.world.entities.crate.components.structure.intactPhysical;delete f.world.entities.crate.components.structure.repair;
 f.world=migrateTextWorld(JSON.parse(JSON.stringify(f.world)));f.state.textWorld=f.world;
 assert.equal(f.world.entities.water.components.position.zone,'office');assert.equal(f.world.entities.crate.components.structure.intactPhysical.supportCapacity,5);
 assert(!Object.keys(f.world.entities).some(id=>id.startsWith('salvage:')));
 const once=JSON.parse(JSON.stringify(f.world));assert.deepEqual(JSON.parse(JSON.stringify(migrateTextWorld(f.world))),once);
});
test('custom structures use the same repair rules and aggregate duplicated legacy costs before executing',()=>{
 const f=fixture();const custom=structuredClone(f.world.entities.crate);custom.id='custom_beam';custom.name='들보';custom.components.container=undefined;custom.components.openable=undefined;
 custom.components.structure.integrity=1;custom.components.structure.repair.materials=[{itemId:'woodPlank',amount:4},{itemId:'woodPlank',amount:4}];
 f.world.entities.custom_beam=custom;f.world.player.near='custom_beam';f.world.observations.custom_beam={stages:['surface'],collected:false};
 const action={type:'REPAIR',target:'custom_beam'};
 assert(validateWorldAction(f.world,f.state,action));assert(!interactionOptions(f.world,f.state).some(o=>o.id==='repair:custom_beam'));
 f.state.inventory.woodPlank=8;assert(!act(f,action).interrupted);assert.equal(f.state.inventory.woodPlank??0,0);
 const event=f.world.events.find(e=>e.type==='REPAIR');assert.equal(event.after.inventoryDelta.woodPlank,-8);assert.equal(custom.components.structure.integrity,4);
});

test('the last tool charge completes a repair, clears the hand and records authored work noise',()=>{
 const f=fixture('door');f.world.entities.door.components.structure.integrity=2;f.state.toolDurability.crudeAxe=1;
 assert(!act(f,{type:'REPAIR',target:'door',toolItemId:'crudeAxe'}).interrupted);
 assert.equal(f.state.inventory.crudeAxe??0,0);assert.equal(f.world.player.heldItemId,null);
 const event=f.world.events.find(e=>e.type==='REPAIR');assert(event.after.toolBroken);
 assert(f.world.events.some(e=>e.type==='SOUND'&&e.causedBy===event.id));
 const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
 const {directNarrative}=require('../.server-dist/game/text-world/perception');
 const prose=fallbackNarration(directNarrative(f.world)).paragraphs.join(' ');
 assert.match(prose,/더는 쓸 수 없다/);assert.match(prose,/손본다/);
});