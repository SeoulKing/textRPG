const test=require('node:test'), assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameService}=require('../.server-dist/game/service');
const {GameStateSchema,GameActionSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld,illuminated}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const {reconcileWorldInventory}=require('../.server-dist/game/text-world/inventory-state');
const {availableWorldOptions}=require('../.server-dist/game/text-world/choices');
const {inventoryLightControls,performInventoryLightAction}=require('../.server-dist/game/text-world/inventory-lights');
const {transferCarriedEntities}=require('../.server-dist/game/text-world/inventory');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
let requests=0;test.beforeEach(t=>{requests=0;t.mock.method(global,'fetch',async()=>{requests++;throw Error('No external calls in inventory tests')})});test.afterEach(()=>assert.equal(requests,0));
function fixture(){const s=createInitialGameState();s.location='subway';s.flags.prologue_old_woman_seen=true;s.textWorld=createSubwayTextWorld();return s;}
function take(s){const w=s.textWorld;const option=availableWorldOptions(w,s).find(o=>o.id==='equip:lamp');assert(option);assert(!option.actions.some(a=>a.type==='LIGHT'));resolveWorldActions(w,s,option.actions);reconcileWorldInventory(s);}
function request(s,on){const c=inventoryLightControls(s)[0];assert(c);return GameActionSchema.parse({type:'item_light',...c,on});}
function switchLight(s,on){performInventoryLightAction(s,request(s,on));}

test('pickup registers an off flashlight; all repeated handling stays out of exploration choices',()=>{
 const s=fixture();take(s);assert.equal(s.inventory.flashlight,1);assert.equal(inventoryLightControls(s)[0].on,false);
 const inv=structuredClone(s.inventory),w=s.textWorld;w.player.near='crate';w.player.focusEntityId='crate';
 switchLight(s,true);assert.equal(w.player.focusEntityId,'crate');assert(inventoryLightControls(s)[0].on);
 assert(!availableWorldOptions(w,s).some(o=>/^(light|equip|hold|stow|put|drop):lamp/.test(o.id)));
 switchLight(s,false);assert.deepEqual(s.inventory,inv);assert(!inventoryLightControls(s)[0].on);assert.equal(w.player.focusEntityId,'crate');
});

test('old carried null-id lights migrate once while uncollected lights do not grant items',()=>{
 const s=fixture(),w=s.textWorld;w.entities.lamp.components.portable.itemId=null;reconcileWorldInventory(s);assert.equal(s.inventory.flashlight,undefined);
 w.entities.lamp.inventoryRegistered=true;w.entities.lamp.components.portable.itemId=null;w.entities.lamp.components.position.zone='player';w.entities.lamp.components.light.on=true;w.player.heldToolId='lamp';w.observations.lamp={stages:['outline','surface'],collected:true};
 reconcileWorldInventory(s);assert.equal(s.inventory.flashlight,1);assert(w.entities.lamp.components.light.on);reconcileWorldInventory(s);assert.equal(s.inventory.flashlight,1);
 const saved=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));reconcileWorldInventory(saved);assert.equal(saved.inventory.flashlight,1);assert(inventoryLightControls(saved)[0].on);
 assert(buildRuntimeRegistry(s).items.flashlight);
});

test('inventory control works in darkness and rejects stale clicks, exhausted power and unowned entities',()=>{
 const s=fixture();take(s);const w=s.textWorld;w.player.zone='corridor';w.player.near=null;w.player.focusEntityId=null;
 assert(!illuminated(w,'corridor'));const on=request(s,true);performInventoryLightAction(s,on);assert(illuminated(w,'corridor'));
 const after=JSON.stringify(s);assert.throws(()=>performInventoryLightAction(s,on),/상황이 바뀌/);assert.equal(JSON.stringify(s),after);
 switchLight(s,false);assert(!illuminated(w,'corridor'));switchLight(s,true);assert(illuminated(w,'corridor'));
 switchLight(s,false);w.entities.lamp.components.light.fuelSeconds=0;assert(!inventoryLightControls(s)[0].canTurnOn);assert.throws(()=>switchLight(s,true),/소진/);
 assert.throws(()=>performInventoryLightAction(s,{...request(s,true),entityId:'crate'}),/가지고/);
});

test('light state follows region transfer and remains controllable at a non-world location',()=>{
 const s=fixture();take(s);switchLight(s,true);const dest=createSubwayTextWorld();delete dest.entities.lamp;s.locationTextWorlds.river=dest;s.location='river';transferCarriedEntities(s,dest);
 assert.equal(inventoryLightControls(s)[0].worldId,'river');switchLight(s,false);assert.equal(s.inventory.flashlight,1);assert(!dest.entities.lamp.components.light.on);
 dest.active=false;s.location='shelter';switchLight(s,true);assert(dest.entities.lamp.components.light.on);assert.equal(dest.active,false);assert.equal(s.location,'shelter');
});

test('service exposes item controls during office exploration without a narrator request or duplicate reward',async()=>{
 const state=fixture();state.sceneId='subway_first_intro';state.flags.opening_seen=true;take(state);let calls=0;
 let stored={id:'inventory-light-service',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>structuredClone(stored),saveGame:async s=>{stored=structuredClone(s)},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{}};
 const svc=new GameService(repo,undefined,undefined,undefined,undefined,async c=>{calls++;return fallbackNarration(c)});
 let snap=await svc.getState(stored.id);assert(snap.inventoryCards.some(c=>c.id==='flashlight'));assert.equal(calls,0);
 const action={type:'item_light',...snap.inventoryLights[0],on:true};snap=await svc.performAction(stored.id,GameActionSchema.parse(action));assert(snap.inventoryLights[0].on);assert.equal(snap.state.inventory.flashlight,1);assert.equal(calls,0);
 await assert.rejects(()=>svc.performAction(stored.id,GameActionSchema.parse(action)),/상황이 바뀌/);
 snap=await svc.getState(stored.id);assert(snap.inventoryLights[0].on);assert.equal(calls,0);
});
