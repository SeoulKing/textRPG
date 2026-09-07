const test=require('node:test');
const assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld,illuminated,visibleEntities,pathOpen,entityDetails}=require('../.server-dist/game/text-world/world');
const {resolveWorldActions,validateWorldAction}=require('../.server-dist/game/text-world/engine');
const {interactionOptions}=require('../.server-dist/game/text-world/affordances');
const {reconcileWorldInventory}=require('../.server-dist/game/text-world/interactions');
const {advanceWorldSimulation,emitMovementSound,audibleSounds}=require('../.server-dist/game/text-world/simulation');
const {directNarrative}=require('../.server-dist/game/text-world/perception');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {rootZone,relocateEntity}=require('../.server-dist/game/text-world/spatial');
function fixture(){
 const state=createInitialGameState();state.location='subway';state.textWorld=createSubwayTextWorld();
 const world=state.textWorld;world.player.near='crate';world.player.position='left-wall';world.player.facing='crate';
 world.entities.crate.components.openable.isOpen=true;world.observations.crate={stages:['outline','surface','interior'],collected:false,inspected:true};
 world.entities.door.components.openable={isOpen:true,locked:false};return {state,world};
}
function act(f,...actions){f.world.events=[];return resolveWorldActions(f.world,f.state,actions)}

test('source-target rules move a loaded object, block and clear a passage, and carry contents with it',()=>{
 const f=fixture(),{world:w,state:s}=f;const inventory={...s.inventory};
 const move=act(f,{type:'PUSH',target:'crate',destination:'door',relation:'blocking'});assert(!move.interrupted);assert.equal(move.elapsedSeconds,8);
 assert.equal(w.entities.water.components.position.zone,'crate');assert.equal(rootZone(w,w.entities.water),'office');assert.equal(pathOpen(w,'office','corridor'),false);
 assert.match(entityDetails(w,w.entities.crate).placement,/철문.*막는/);assert.match(validateWorldAction(w,s,{type:'MOVE',target:'corridor'}),/사물/);
 const offered=interactionOptions(w,s);assert(offered.some(o=>o.actions.some(a=>a.type==='PUSH'&&a.relation==='beside')));
 act(f,{type:'PUSH',target:'crate',destination:'door',relation:'beside'});assert(pathOpen(w,'office','corridor'));assert.deepEqual(s.inventory,inventory);
});
test('mass includes contents and capacity failures do not mutate inventory or containment',()=>{
 const f=fixture(),w=f.world;w.player.pushCapacity=12;
 const before=structuredClone(w.entities);assert(act(f,{type:'PUSH',target:'crate',destination:'door',relation:'blocking'}).interrupted);assert.deepEqual(w.entities,before);assert.equal(w.elapsedSeconds,0);
 w.entities.lamp.components.position={zone:'player'};w.player.heldToolId='lamp';w.entities.crate.components.container.capacity=3;
 assert(act(f,{type:'PUT',target:'lamp',destination:'crate',relation:'inside'}).interrupted);assert.equal(w.entities.lamp.components.position.zone,'player');
});
test('a placed light is occluded by every opaque closed ancestor; a transparent container still transmits light',()=>{
 const f=fixture(),w=f.world;w.rooms.office.light=false;w.entities.lamp.components.position={zone:'player'};w.entities.lamp.components.light.on=true;w.player.heldToolId='lamp';
 assert(illuminated(w,'office'));assert(!act(f,{type:'PUT',target:'lamp',destination:'crate',relation:'inside'}).interrupted);
 assert.equal(w.player.heldToolId,null);assert(illuminated(w,'office'));
 act(f,{type:'CLOSE',target:'crate'});assert(!illuminated(w,'office'));assert(!visibleEntities(w).some(e=>e.id==='lamp'));
 w.entities.crate.components.physical.opaque=false;assert(illuminated(w,'office'));assert(visibleEntities(w).some(e=>e.id==='lamp'));
 // A nested portable container is a normal composite entity, with no special object ID.
 w.entities.pouch={id:'pouch',name:'주머니 모양 용기',description:'접을 수 있는 용기다.',components:{position:{zone:'crate',relation:'inside'},openable:{isOpen:false,locked:false},container:{items:[]},portable:{itemId:null,amount:1}}};
 relocateEntity(w,w.entities.lamp,{zone:'pouch',relation:'inside'});assert(!illuminated(w,'office'));assert.equal(rootZone(w,w.entities.lamp),'office');
 assert.throws(()=>relocateEntity(w,w.entities.crate,{zone:'pouch',relation:'inside'}),/자신의 안쪽/);
});
test('support differs from containment: closing a lid does not hide a lamp placed on top',()=>{
 const f=fixture(),w=f.world;w.rooms.office.light=false;w.entities.lamp.components.position={zone:'player'};w.entities.lamp.components.light.on=true;w.player.heldToolId='lamp';
 assert(!act(f,{type:'PUT',target:'lamp',destination:'crate',relation:'on'}).interrupted);act(f,{type:'CLOSE',target:'crate'});
 assert(illuminated(w,'office'));assert(visibleEntities(w).some(e=>e.id==='lamp'));assert(!w.entities.crate.components.container.items.includes('lamp'));
});
test('taking, placing and retaking conserves resources and consumed carried stacks cannot be dropped again',()=>{
 const f=fixture(),w=f.world,s=f.state,initial=s.inventory.waterBottle??0;
 act(f,{type:'TAKE',target:'water'});assert.equal(s.inventory.waterBottle,initial+1);assert.equal(w.entities.water.components.position.zone,'player');
 act(f,{type:'PUT',target:'water',destination:'crate',relation:'inside'});assert.equal(s.inventory.waterBottle,initial);assert.equal(w.entities.water.components.position.zone,'crate');
 act(f,{type:'TAKE',target:'water'});assert.equal(s.inventory.waterBottle,initial+1);
 s.inventory.waterBottle=0;reconcileWorldInventory(s);assert.equal(w.entities.water.components.position.zone,'consumed');
 assert(act(f,{type:'DROP',target:'water'}).interrupted);assert.equal(s.inventory.waterBottle,0);assert(GameStateSchema.safeParse(s).success);
});
test('virtual time updates emit deterministic causal events and survive save and split advances',()=>{
 const f=fixture(),w=f.world;w.entities.lamp.components.light={on:true,fuelSeconds:7};w.entities.door.components.openable.remainingOpenSeconds=4;
 const split=structuredClone(w);advanceWorldSimulation(w,10,'action-root');advanceWorldSimulation(split,3,'action-root');advanceWorldSimulation(split,7,'action-root');
 assert.deepEqual(w,split);assert.equal(w.elapsedSeconds,10);assert.equal(w.entities.lamp.components.light.on,false);assert(!w.entities.door.components.openable.isOpen);
 assert.deepEqual(w.events.map(e=>[e.type,e.at,e.causedBy]),[['AUTO_CLOSE',4,'action-root'],['LIGHT_EXPIRED',7,'action-root']]);
 const restored=GameStateSchema.parse({...f.state,textWorld:w}).textWorld;advanceWorldSimulation(restored,5);assert.equal(restored.events.length,2);
});
test('a blocker holds a self-closing door open until the object is moved away',()=>{
 const f=fixture(),w=f.world;w.entities.door.components.openable.remainingOpenSeconds=2;
 act(f,{type:'PUSH',target:'crate',destination:'door',relation:'blocking'});assert(w.entities.door.components.openable.isOpen);assert.equal(w.entities.door.components.openable.remainingOpenSeconds,0);
 act(f,{type:'PUSH',target:'crate',destination:'door',relation:'beside'});assert(!w.entities.door.components.openable.isOpen);assert(w.events.some(e=>e.type==='AUTO_CLOSE'&&e.causedBy===w.events[0].id));
});
test('unseen environmental sources remain private while audible propagation is anonymous and attenuated by doors',()=>{
 const f=fixture(),w=f.world;w.entities.secretSource={id:'secretSource',name:'숨겨진 발신 장치',description:'숨은 세부',details:{anchor:'corner',placement:'창고 구석',outline:'장치',surface:'비밀 표면',movementSound:'금속이 바닥을 긁는 소리가 난다.'},components:{position:{zone:'storage'},light:{on:true,fuelSeconds:1}}};
 w.entities.door.components.openable.isOpen=false;emitMovementSound(w,'secretSource');advanceWorldSimulation(w,2);
 const sound=audibleSounds(w)[0];assert(sound);assert.equal(sound.intensity,'muffled');assert(!('sourceId' in sound));assert(!('sourceName' in sound));
 const context=directNarrative(w),encoded=JSON.stringify(context);assert(!/secretSource|숨겨진 발신 장치|비밀 표면|숨은 세부/.test(encoded));assert(!context.results.some(e=>e.type==='LIGHT_EXPIRED'));assert(context.optionalFacts.some(f=>f.kind==='sound'));
});
test('default result prose observes opening before contents, while preserving the selected B style contract',()=>{
 const f=fixture(),w=f.world;w.entities.crate.components.openable.isOpen=false;w.observations.crate={stages:['outline'],collected:false};
 act(f,{type:'INSPECT',target:'crate'},{type:'OPEN',target:'crate'});const rendered=fallbackNarration(directNarrative(w)).paragraphs.join(' ');
 assert(rendered.indexOf('연다')<rendered.indexOf('미개봉 물병'));
});

test('transparent lids allow sight but prevent taking, and nested composite contents remain perceivable',()=>{
 const f=fixture(),w=f.world;w.entities.crate.components.openable.isOpen=false;w.entities.crate.components.physical.opaque=false;
 assert(visibleEntities(w).some(e=>e.id==='water'));
 const before=structuredClone(f.state.inventory);assert(act(f,{type:'TAKE',target:'water'}).interrupted);assert.deepEqual(f.state.inventory,before);
 const c=directNarrative(w);assert(c.requiredFacts.some(f=>f.kind==='contents'&&f.data.items.some(i=>i.id==='water')));
 w.entities.pocket={id:'pocket',name:'작은 용기',description:'안쪽에 놓인 용기다.',components:{position:{zone:'crate',relation:'inside'},container:{items:[]},openable:{isOpen:true,locked:false}}};w.entities.crate.components.container.items.push('pocket');
 assert.doesNotThrow(()=>directNarrative(w));
});

test('standing or stepping out of cover restores the actually occluded passage',()=>{
 const f=fixture(),w=f.world;act(f,{type:'PUSH',target:'crate',destination:'door',relation:'blocking'});
 assert(visibleEntities(w).some(e=>e.id==='door'));assert(interactionOptions(w,f.state).some(o=>o.id==='hide:crate'));
 act(f,{type:'HIDE',target:'crate'});assert.equal(w.player.posture,'crouching');assert(!visibleEntities(w).some(e=>e.id==='door'));
 assert.match(validateWorldAction(w,f.state,{type:'OPEN',target:'door'}),/확인할 수 없다/);
 const context=directNarrative(w);assert(context.requiredFacts.some(f=>f.id==='cover:crate'));
 const prose=fallbackNarration(context).paragraphs.join(' ');assert.match(prose,/통로가 가려/);assert(!prose.includes('상자 앞에 머문다'));
 assert(interactionOptions(w,f.state).some(o=>o.id==='emerge:crate'));
 act(f,{type:'POSTURE',posture:'standing'},{type:'MOVE',target:'crate'});assert(visibleEntities(w).some(e=>e.id==='door'));assert.equal(w.player.coverId,null);
});

test('arbitrary entity IDs use the same push, support, containment, reclaim and disclosure rules',()=>{
 const f=fixture(),w=f.world;const names={crate:'cart_alpha',door:'gate_beta',water:'parcel_gamma',scrap:'pieces_delta',lamp:'light_epsilon'};
 for(const [old,id]of Object.entries(names)){const e=w.entities[old];delete w.entities[old];e.id=id;e.name=id;w.entities[id]=e;}
 for(const e of Object.values(w.entities)){const c=e.components;c.position.zone=names[c.position.zone]??c.position.zone;if(c.container)c.container.items=c.container.items.map(id=>names[id]??id);}
 w.player.near='cart_alpha';w.observations={cart_alpha:{stages:['outline','surface','interior'],inspected:true,collected:false}};
 const initial=f.state.inventory.waterBottle??0;
 act(f,{type:'TAKE',target:'parcel_gamma'},{type:'PUT',target:'parcel_gamma',destination:'cart_alpha',relation:'on'});assert.equal(f.state.inventory.waterBottle??0,initial);
 act(f,{type:'PUSH',target:'cart_alpha',destination:'gate_beta',relation:'blocking'});assert(!pathOpen(w,'office','corridor'));assert.equal(rootZone(w,w.entities.parcel_gamma),'office');
 act(f,{type:'TAKE',target:'parcel_gamma'});assert.equal(f.state.inventory.waterBottle,initial+1);
 const context=directNarrative(w);const allowed=new Set([...context.requiredFacts,...context.optionalFacts].map(f=>f.id));assert(context.direction.beats.every(b=>[...b.resultFactIds,...b.detailFactIds].every(id=>allowed.has(id))));
});

test('old collected entities reconcile to existing inventory without awarding resources again',()=>{
 const f=fixture(),w=f.world;w.entities.water.components.position={zone:'collected'};f.state.inventory.waterBottle=1;
 reconcileWorldInventory(f.state);assert.equal(w.entities.water.components.position.zone,'player');assert.equal(f.state.inventory.waterBottle,1);
 reconcileWorldInventory(f.state);assert.equal(f.state.inventory.waterBottle,1);
 f.state.inventory.waterBottle=0;reconcileWorldInventory(f.state);assert.equal(w.entities.water.components.position.zone,'consumed');
});

test('carried object graphs transfer across regions and ID collisions without changing inventory',()=>{
 const {transferCarriedEntities}=require('../.server-dist/game/text-world/inventory');
 const f=fixture(),s=f.state,w=f.world;act(f,{type:'TAKE',target:'water'});const before={...s.inventory};
 const destination=structuredClone(w);destination.entities={water:{id:'water',name:'같은 ID의 별개 사물',description:'고정 사물',components:{position:{zone:'office'}}}};destination.player.heldToolId=null;s.locationTextWorlds.convenience=destination;
 transferCarriedEntities(s,destination);assert(!w.entities.water);assert(destination.entities['carried:subway:water']);assert.deepEqual(s.inventory,before);
 transferCarriedEntities(s,w);assert(w.entities.water);assert(!destination.entities['carried:subway:water']);assert.deepEqual(s.inventory,before);
 assert.equal(GameStateSchema.safeParse(s).success,true);
});

test('partial plans stop on timed loss of access after preserving the completed approach and exact time',()=>{
 const f=fixture(),w=f.world;w.entities.crate.components.openable.remainingOpenSeconds=2;w.player.near=null;
 const before={...f.state.inventory};const result=act(f,{type:'MOVE',target:'crate'},{type:'TAKE',target:'water'});
 assert(result.interrupted);assert.equal(result.elapsedSeconds,5);assert.equal(w.player.near,'crate');assert.deepEqual(f.state.inventory,before);
 assert.deepEqual(w.events.map(e=>e.type),['MOVE','AUTO_CLOSE','STOPPED']);
});

test('published content accepts nested light/container components and rejects cycles',()=>{
 const {defaultTextRooms}=require('../.server-dist/game/text-world/definitions');const {textRoomIssues}=require('../.server-dist/game/text-world/validation');
 const rooms=defaultTextRooms(),office=rooms.find(r=>r.id==='office'),crate=office.entities.find(e=>e.id==='crate'),lamp=office.entities.find(e=>e.id==='lamp');
 lamp.components.position={zone:'crate',relation:'inside'};crate.components.container.items.push('lamp');crate.components.portable={itemId:null,amount:1};
 const ids=new Set(rooms.flatMap(r=>r.entities).map(e=>e.components.portable?.itemId).filter(Boolean));
 assert.deepEqual(textRoomIssues(rooms,ids),[]);
 crate.components.position={zone:'lamp',relation:'inside'};lamp.components.container={items:['crate']};assert(textRoomIssues(rooms,ids).some(i=>i.message.includes('순환')));
});

test('room editor preserves nested component graphs and distinguishes objects placed on top',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync('content-room-editor.js','utf8');const sandbox={};vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const room={id:'test_room',entities:[
  {id:'outer',components:{position:{zone:'test_room'},container:{items:[]},physical:{mass:5,volume:8,supportCapacity:3}}},
  {id:'inner',components:{position:{zone:'outer',relation:'inside'},container:{items:[]}}},
  {id:'light',components:{position:{zone:'inner',relation:'inside'},light:{on:true,fuelSeconds:12}}},
  {id:'top',components:{position:{zone:'outer',relation:'on'},portable:{itemId:null,amount:1}}}
 ]};
 sandbox.syncRoomContents(room);assert.deepEqual(room.entities[0].components.container.items,['inner']);assert.deepEqual(room.entities[1].components.container.items,['light']);
 assert.equal(Array.from(sandbox.roomEntityRows(room),e=>e.id).join(','),'outer,inner,light,top');assert.equal(room.entities[2].components.light.fuelSeconds,12);
});
