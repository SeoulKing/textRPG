const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,performAction}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld,migrateTextWorld}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const {worldOptions}=require('../.server-dist/game/text-world/choices');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {reconcileWorldInventory}=require('../.server-dist/game/text-world/inventory-state');
const {transferCarriedEntities}=require('../.server-dist/game/text-world/inventory');
const {relocateEntity,carriedByPlayer}=require('../.server-dist/game/text-world/spatial');
const {activityInputsAvailable}=require('../.server-dist/game/activity');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');

test.beforeEach(t=>t.mock.method(global,'fetch',async()=>{throw Error('External generation disabled for container tests')}));
function item(id,itemId,amount,zone,name=id){return {id,name,description:name,components:{position:{zone},portable:{itemId,amount}}}}
function fixture(closed=false){const s=createInitialGameState();s.inventory={};s.location='subway';s.textWorld=createSubwayTextWorld();const w=s.textWorld;
 w.entities.case_alpha={...item('case_alpha',null,1,'office','휴대 용기'),components:{position:{zone:'office'},portable:{itemId:null,amount:1},container:{items:[],capacity:30},openable:{isOpen:!closed,locked:false},physical:{mass:1,volume:4,movable:true,supportCapacity:10}}};
 w.player.near='case_alpha';w.player.focusEntityId='case_alpha';w.visitedZones=['office'];return {s,w}}
function inside(f,entity,parent='case_alpha'){f.w.entities[entity.id]=entity;relocateEntity(f.w,entity,{zone:parent,relation:'inside'})}
function act(f,...actions){f.w.events=[];return resolveWorldActions(f.w,f.s,actions)}
function takeNearby(f,id){f.w.player.near=id;const result=act(f,{type:'TAKE',target:id});assert(!result.interrupted);return result}
function takeChild(f,id,parent='case_alpha'){f.w.player.near=parent;return act(f,{type:'TAKE',target:id})}

test('a closed portable container can be taken whole without exposing or awarding its unknown contents',()=>{
 const f=fixture(true);inside(f,item('hidden_food','cannedFood',2,'case_alpha','숨겨진 건빵'));
 const choice=worldOptions(f.w,f.s).find(o=>o.id==='take:case_alpha');assert(choice);assert(!act(f,...choice.actions).interrupted);assert.equal(f.s.inventory.cannedFood??0,0);assert(carriedByPlayer(f.w,f.w.entities.hidden_food));
 assert(!JSON.stringify(directNarrative(f.w)).includes('숨겨진 건빵'));assert(!f.w.entities.hidden_food.inventoryRegistered);
 const reveal=act(f,{type:'OPEN',target:'case_alpha'},{type:'TAKE',target:'hidden_food'});assert(reveal.discovery);assert.equal(f.s.inventory.cannedFood??0,0);const context=directNarrative(f.w);assert(context.requiredFacts.some(f=>f.kind==='contents'&&f.data.items.some(i=>i.id==='hidden_food')));
 assert(worldOptions(f.w,f.s).some(o=>o.id==='collect:case_alpha'));assert(!takeChild(f,'hidden_food').interrupted);assert.equal(f.s.inventory.cannedFood,2);assert(act(f,{type:'TAKE',target:'hidden_food'}).interrupted);assert.equal(f.s.inventory.cannedFood,2);
});

test('putting a collected material inside a carried container preserves stock and withdrawal is not another reward',()=>{
 const f=fixture();takeNearby(f,'case_alpha');f.w.entities.material=item('material','wood',3,'office','목재');takeNearby(f,'material');
 const before={...f.s.inventory};f.w.player.near='case_alpha';assert(!act(f,{type:'PUT',target:'material',destination:'case_alpha',relation:'inside'}).interrupted);assert.deepEqual(f.s.inventory,before);assert.equal(f.w.entities.material.components.position.zone,'case_alpha');
 reconcileWorldInventory(f.s);assert.equal(f.w.entities.material.components.position.zone,'case_alpha');assert.equal(f.s.inventory.wood,3);
 assert(!takeChild(f,'material').interrupted);assert.deepEqual(f.s.inventory,before);assert.deepEqual(f.w.events.find(e=>e.type==='TAKE').after.inventoryDelta,{});assert.match(fallbackNarration(directNarrative(f.w)).paragraphs.join(' '),/꺼내 손에 든다/);
});

test('dropping and reclaiming a nested loaded container transfers every registered amount once',()=>{
 const f=fixture();takeNearby(f,'case_alpha');f.w.entities.pouch={...item('pouch',null,1,'office','작은 용기'),components:{position:{zone:'office'},portable:{itemId:null,amount:1},openable:{isOpen:true,locked:false},container:{items:[],capacity:10}}};takeNearby(f,'pouch');
 f.w.entities.material=item('material','wood',2,'office','목재');takeNearby(f,'material');f.w.player.near='pouch';act(f,{type:'PUT',target:'material',destination:'pouch',relation:'inside'});act(f,{type:'HOLD',target:'pouch'},{type:'PUT',target:'pouch',destination:'case_alpha',relation:'inside'});
 const before={...f.s.inventory};assert.equal(before.wood,2);act(f,{type:'HOLD',target:'case_alpha'},{type:'DROP',target:'case_alpha'});assert.equal(f.s.inventory.wood??0,0);assert.equal(f.w.entities.material.components.position.zone,'pouch');
 takeNearby(f,'case_alpha');assert.deepEqual(f.s.inventory,before);assert.equal(f.w.entities.pouch.components.position.zone,'case_alpha');assert.equal(f.w.events.find(e=>e.type==='TAKE').after.containedItems.find(i=>i.id==='material').amount,2);
});

test('crafting uses registered contained wood, removes only its consumed amount, and leaves unknown wood untouched',()=>{
 const f=fixture();takeNearby(f,'case_alpha');f.w.entities.material=item('material','wood',2,'office','목재');takeNearby(f,'material');f.w.player.near='case_alpha';act(f,{type:'PUT',target:'material',destination:'case_alpha',relation:'inside'});
 inside(f,item('hidden_wood','wood',5,'case_alpha','아직 살피지 않은 목재'));act(f,{type:'CLOSE',target:'case_alpha'});reconcileWorldInventory(f.s);
 f.s.location='shelter';f.w.active=false;Object.assign(f.s.flags,{opening_seen:true,shelter_crafting_open:true,shelter_crafting_intro_seen:true});f.s.sceneId='shelter_crafting_menu_repeat';f.s.stats={hp:10,mind:10,energy:15};
 const recipe=buildRuntimeRegistry(f.s).choices.craft_firewood;assert(activityInputsAvailable(recipe,f.s));performAction(f.s,{type:'content_choice',choiceId:'craft_firewood'});assert.equal(f.s.lastActivity.status,'completed');assert.equal(f.s.inventory.wood,1);assert.equal(f.s.inventory.firewood,4);
 assert.equal(f.w.entities.material.components.portable.amount,1);assert.equal(f.w.entities.material.components.position.zone,'case_alpha');assert.equal(f.w.entities.hidden_wood.components.portable.amount,5);assert.equal(f.w.entities.hidden_wood.inventoryRegistered,false);
 performAction(f.s,{type:'content_choice',choiceId:'craft_firewood'});assert.equal(f.s.inventory.wood??0,0);assert.equal(f.w.entities.material.components.position.zone,'consumed');assert(!f.w.entities.case_alpha.components.container.items.includes('material'));assert(f.w.entities.case_alpha.components.container.items.includes('hidden_wood'));
});

test('consuming the container preserves its contents and uncollected contents still require a collection decision',()=>{
 const f=fixture();f.w.entities.case_alpha.components.portable.itemId='wood';inside(f,item('hidden_food','cannedFood',2,'case_alpha','남은 식량'));takeNearby(f,'case_alpha');
 f.w.entities.material=item('material','scrapMetal',2,'office','고철');takeNearby(f,'material');f.w.player.near='case_alpha';act(f,{type:'PUT',target:'material',destination:'case_alpha',relation:'inside'});act(f,{type:'CLOSE',target:'case_alpha'});reconcileWorldInventory(f.s);
 f.s.inventory.wood=0;reconcileWorldInventory(f.s);assert.equal(f.w.entities.case_alpha.components.position.zone,'consumed');assert.equal(f.w.entities.material.components.position.zone,'player');assert.equal(f.s.inventory.scrapMetal,2);assert.equal(f.s.inventory.cannedFood??0,0);
 assert.equal(f.w.entities.hidden_food.components.position.zone,'player');assert.equal(f.w.entities.hidden_food.inventoryRegistered,false);assert(worldOptions(f.w,f.s).some(o=>o.id==='take:hidden_food'));assert(!act(f,{type:'TAKE',target:'hidden_food'}).interrupted);assert.equal(f.s.inventory.cannedFood,2);
 reconcileWorldInventory(f.s);assert.equal(f.s.inventory.scrapMetal,2);assert.equal(f.s.inventory.cannedFood,2);
});

test('registered and unknown container contents survive save migration and cross-world ID remapping',()=>{
 const f=fixture();takeNearby(f,'case_alpha');f.w.entities.material=item('material','wood',2,'office');takeNearby(f,'material');f.w.player.near='case_alpha';act(f,{type:'PUT',target:'material',destination:'case_alpha',relation:'inside'});inside(f,item('hidden_food','cannedFood',1,'case_alpha'));reconcileWorldInventory(f.s);
 const saved=GameStateSchema.parse(JSON.parse(JSON.stringify(f.s)));saved.textWorld=migrateTextWorld(saved.textWorld);const destination=createSubwayTextWorld();destination.entities={material:item('material','wood',10,'office')};saved.locationTextWorlds.other=destination;
 const inventory={...saved.inventory};transferCarriedEntities(saved,destination);assert.deepEqual(saved.inventory,inventory);assert.equal(destination.entities['carried:subway:material'].components.position.zone,'case_alpha');assert(destination.entities.case_alpha.components.container.items.includes('carried:subway:material'));assert.equal(destination.entities.hidden_food.inventoryRegistered,false);
 transferCarriedEntities(saved,saved.textWorld);assert.equal(saved.textWorld.entities.material.components.position.zone,'case_alpha');assert.deepEqual(saved.inventory,inventory);reconcileWorldInventory(saved);assert.deepEqual(saved.inventory,inventory);
});

test('legacy loose stock remains counted while legacy nested uncollected items never refill inventory',()=>{
 const f=fixture();f.w.entities.case_alpha.components.position={zone:'player'};inside(f,item('unknown','waterBottle',3,'case_alpha'));f.w.entities.loose=item('loose','wood',2,'player');f.s.inventory.wood=1;
 reconcileWorldInventory(f.s);assert.equal(f.w.entities.loose.components.portable.amount,1);assert.equal(f.w.entities.loose.inventoryRegistered,true);assert.equal(f.w.entities.unknown.inventoryRegistered,false);assert.equal(f.s.inventory.waterBottle??0,0);
 const before=structuredClone(f.s);reconcileWorldInventory(f.s);assert.deepEqual(f.s,before);
});

test('visible choices place a held material into a focused carried container in one intention without moving the player',()=>{
 const f=fixture();f.w.rooms={office:{...f.w.rooms.office,neighbors:[]}};f.w.entities={case_alpha:f.w.entities.case_alpha,material:item('material','wood',2,'office','목재')};
 function choose(id){const choice=worldOptions(f.w,f.s).find(o=>o.id===id);assert(choice,'missing '+id+': '+worldOptions(f.w,f.s).map(o=>o.id));const result=act(f,...choice.actions);assert(!result.interrupted);directNarrative(f.w);return result}
 choose('take:case_alpha');choose('take:material');const position={zone:f.w.player.zone,position:f.w.player.position,near:f.w.player.near};
 choose('focus:case_alpha');assert.deepEqual({zone:f.w.player.zone,position:f.w.player.position,near:f.w.player.near},position);
 const placing=worldOptions(f.w,f.s).find(o=>o.id==='put:material:case_alpha:inside');assert(placing);assert.deepEqual(placing.actions.map(a=>a.type),['HOLD','PUT']);const saved=GameStateSchema.parse(JSON.parse(JSON.stringify(f.s)));assert(worldOptions(saved.textWorld,saved).some(o=>o.id===placing.id));
 choose('put:material:case_alpha:inside');const withdrawal=worldOptions(f.w,f.s).find(o=>o.id==='collect:case_alpha');assert(withdrawal);assert.match(withdrawal.label,/꺼내 손에 든다/);assert.equal(withdrawal.hint,'휴대 물건 꺼내기');assert.equal(f.s.inventory.wood,2);assert.equal(f.w.entities.material.components.position.zone,'case_alpha');assert.equal(f.w.player.placementTargetId,null);
});

test('items placed on a carried support remain retrievable through visible choices without another inventory award',()=>{
 const f=fixture();f.w.rooms={office:{...f.w.rooms.office,neighbors:[]}};f.w.entities={case_alpha:f.w.entities.case_alpha,material:item('material','wood',2,'office','목재')};takeNearby(f,'case_alpha');takeNearby(f,'material');f.w.player.focusEntityId='case_alpha';f.w.player.near='case_alpha';
 act(f,{type:'PUT',target:'material',destination:'case_alpha',relation:'on'});directNarrative(f.w);const before={...f.s.inventory};const reclaim=worldOptions(f.w,f.s).find(o=>o.id==='take:material');assert(reclaim);assert.match(reclaim.label,/다시 집어 든다/);assert(!act(f,...reclaim.actions).interrupted);assert.deepEqual(f.s.inventory,before);assert.equal(f.w.entities.material.components.position.zone,'player');
});
