const {inventoryLightControls,performInventoryLightAction}=require('../.server-dist/game/text-world/inventory-lights');
const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {createSubwayTextWorld,migrateTextWorld,illuminated}=require('../.server-dist/game/text-world/world');
const {performTextWorldAction,textWorldActions,textWorldScene}=require('../.server-dist/game/text-world');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
const {perceiveWorld,directNarrative}=require('../.server-dist/game/text-world/perception');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {reconcileWorldInventory}=require('../.server-dist/game/text-world/interactions');
const {transferCarriedEntities}=require('../.server-dist/game/text-world/inventory');
const {availableWorldOptions,worldOptions}=require('../.server-dist/game/text-world/choices');
const {resolveChoiceLabels}=require('../.server-dist/game/text-world/choice-labels');
const narrator=async c=>fallbackNarration(c);
function fixture(){const s=createInitialGameState();s.location='subway';s.textWorld=createSubwayTextWorld();const w=s.textWorld;w.player.near='crate';w.player.focusEntityId='crate';w.entities.crate.components.openable.isOpen=true;w.visitedZones=['office'];w.observations.crate={stages:['outline','surface','interior'],inspected:true,collected:false};return {s,w}}
function act(f,...actions){f.w.events=[];return resolveWorldActions(f.w,f.s,actions)}
async function start(){const s=createInitialGameState();s.location='subway';await performTextWorldAction(s,{type:'text_world',command:'enter'},'hands-test',narrator);return s}
async function choose(s,id){const selected=textWorldActions(s).find(o=>o.action.optionId===id);assert(selected,'missing '+id+': '+textWorldActions(s).map(o=>o.action.optionId));await performTextWorldAction(s,selected.action,'hands-test',narrator);return selected.action}

test('bundle collection records storage, separates ownership from hands, and stows without loss or replay',async()=>{
 const s=await start();await choose(s,'explore:crate');const w=s.textWorld,before={...s.inventory},clock=w.elapsedSeconds;
 await choose(s,'collect:crate');assert.equal(w.elapsedSeconds-clock,8);assert.deepEqual(w.events.filter(e=>['TAKE','STOW'].includes(e.type)).map(e=>[e.type,e.targetId]),[['TAKE','water'],['STOW','water'],['TAKE','scrap']]);
 assert.equal(s.inventory.waterBottle,(before.waterBottle??0)+1);assert.equal(s.inventory.scrapMetal,(before.scrapMetal??0)+2);
 const facts=perceiveWorld(w).filter(f=>f.kind==='entity');assert.equal(facts.find(f=>f.targetId==='water').data.stowed,true);assert.equal(facts.find(f=>f.targetId==='scrap').data.held,true);
 const inventory={...s.inventory},stow=await choose(s,'stow:scrap');assert.equal(w.player.heldItemId,null);assert.equal(interactionContext(w).mode,'EXPLORE');assert.deepEqual(s.inventory,inventory);
 assert(!worldOptions(w,s).some(o=>o.family==='PLACE_OBJECT'));await assert.rejects(performTextWorldAction(s,stow,'hands-test',narrator),/상황/);assert.deepEqual(s.inventory,inventory);
 const saved=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));assert.deepEqual(saved.inventory,inventory);assert.equal(saved.textWorld.player.heldItemId,null);assert.deepEqual(textWorldActions(saved),textWorldActions(s));
});

test('focusing another object keeps physical hands but removes placement and its false manipulation context',()=>{
 const f=fixture();act(f,{type:'TAKE',target:'water'});act(f,{type:'MOVE',target:'floor'},{type:'INSPECT',target:'floor'});
 assert.equal(f.w.player.heldItemId,'water');assert.equal(interactionContext(f.w).mode,'FOCUS');assert.equal(interactionContext(f.w).holdingEntityId,null);
 assert(!worldOptions(f.w,f.s).some(o=>o.family==='PLACE_OBJECT'));
 const context=directNarrative(f.w);assert.equal(context.interaction.holding,null);assert(perceiveWorld(f.w).some(f=>f.targetId==='water'&&f.data.held));
 act(f,{type:'HOLD',target:'water'});assert.equal(interactionContext(f.w).holdingEntityId,'water');assert(worldOptions(f.w,f.s).some(o=>o.family==='PLACE_OBJECT'));
});

test('stored items must be taken in hand before placement, with exact amounts across repeated take and store',()=>{
 const f=fixture(),base=f.s.inventory.waterBottle??0;act(f,{type:'TAKE',target:'water'},{type:'STOW',target:'water'});const clock=f.w.elapsedSeconds;
 assert(act(f,{type:'DROP',target:'water'}).interrupted);assert.equal(f.w.elapsedSeconds,clock);assert.equal(f.s.inventory.waterBottle,base+1);
 act(f,{type:'HOLD',target:'water'},{type:'PUT',target:'water',destination:'crate',relation:'on'});assert.equal(f.s.inventory.waterBottle,base);assert.equal(f.w.entities.water.components.position.relation,'on');
 act(f,{type:'TAKE',target:'water'},{type:'STOW',target:'water'},{type:'HOLD',target:'water'});assert.equal(f.s.inventory.waterBottle,base+1);assert.equal(f.w.player.heldItemId,'water');
});

test('storing a light turns it off; restoring visibility uses an actual hold and switch without collection',()=>{
 const f=fixture();f.w.player.near='lamp';act(f,{type:'TAKE',target:'lamp'},{type:'LIGHT',target:'lamp'});f.w.rooms.office.light=false;
 const inventory={...f.s.inventory};assert(illuminated(f.w,'office'));assert.equal(act(f,{type:'STOW',target:'lamp'}).elapsedSeconds,3);assert(!illuminated(f.w,'office'));assert.equal(f.w.player.heldToolId,null);
 const prose=fallbackNarration(directNarrative(f.w)).paragraphs.join(' ');assert.match(prose,/끄고 챙겨 둔다/);
 const choices=worldOptions(f.w,f.s);assert(!choices.some(o=>/^(equip|hold):lamp$/.test(o.id)));
 performInventoryLightAction(f.s,{type:'item_light',...inventoryLightControls(f.s)[0],on:true});assert(illuminated(f.w,'office'));assert.equal(f.w.player.heldToolId,'lamp');assert.equal(f.w.player.heldItemId,null);assert.deepEqual(f.s.inventory,inventory);assert(!f.w.events.some(e=>e.type==='TAKE'));
});

test('a light and one item remain distinct; storing or consuming one does not make the other a manipulation choice',()=>{
 const f=fixture();f.w.player.near='lamp';act(f,{type:'TAKE',target:'lamp'});f.w.player.near='crate';act(f,{type:'TAKE',target:'water'});
 assert.equal(f.w.player.heldToolId,'lamp');assert.equal(f.w.player.heldItemId,'water');assert.equal(interactionContext(f.w).holdingEntityId,'water');
 f.s.inventory.waterBottle=0;reconcileWorldInventory(f.s);assert.equal(f.w.player.heldItemId,null);assert.equal(f.w.entities.water.components.position.zone,'consumed');assert.equal(f.w.player.heldToolId,'lamp');assert.equal(f.w.player.manipulating,false);
 assert(!availableWorldOptions(f.w,f.s).some(o=>o.id==='hold:water'));assert(!worldOptions(f.w,f.s).some(o=>o.family==='PLACE_OBJECT'));
});

test('legacy duplicate lamp references migrate idempotently and travel preserves carried stacks without awards',()=>{
 const f=fixture();f.w.player.near='lamp';act(f,{type:'TAKE',target:'lamp'});f.w.player.near='crate';act(f,{type:'TAKE',target:'water'},{type:'STOW',target:'water'});
 f.w.player.heldItemId='lamp';f.w.player.manipulating=false;const normalized=migrateTextWorld(f.w);assert.equal(normalized.player.heldItemId,null);assert.equal(normalized.player.heldToolId,'lamp');assert.deepEqual(migrateTextWorld(normalized),normalized);
 f.s.textWorld=normalized;const destination=createSubwayTextWorld();destination.entities={lamp:{id:'lamp',name:'별개의 고정 물건',description:'자리',components:{position:{zone:'office'}}}};f.s.locationTextWorlds.test=destination;const inventory={...f.s.inventory};
 transferCarriedEntities(f.s,destination);assert.equal(destination.player.heldToolId,'carried:subway:lamp');assert.equal(destination.player.heldItemId,null);assert.equal(destination.entities.water.components.position.zone,'player');assert.deepEqual(f.s.inventory,inventory);
 transferCarriedEntities(f.s,normalized);assert.equal(normalized.player.heldToolId,'lamp');assert.equal(normalized.player.heldItemId,null);assert.deepEqual(f.s.inventory,inventory);
});

test('a closing container can interrupt a replacement after stowing without losing or awarding items',()=>{
 const f=fixture();act(f,{type:'TAKE',target:'water'});f.w.entities.crate.components.openable.remainingOpenSeconds=1;
 const inventory={...f.s.inventory},result=act(f,{type:'TAKE',target:'scrap'});assert(result.interrupted);assert.equal(result.elapsedSeconds,2);
 assert.deepEqual(f.w.events.map(e=>e.type),['STOW','AUTO_CLOSE','STOPPED']);assert.equal(f.w.entities.scrap.components.position.zone,'crate');assert.equal(f.w.entities.water.components.position.zone,'player');assert.deepEqual(f.s.inventory,inventory);
});

test('changing lights in darkness keeps the old beam until the replacement is held and switched on',()=>{
 const f=fixture();f.w.player.near='lamp';act(f,{type:'TAKE',target:'lamp'},{type:'LIGHT',target:'lamp'});f.w.rooms.office.light=false;
 f.w.entities.reserve={id:'reserve',name:'예비 조명',description:'꺼져 있는 조명',components:{position:{zone:'office'},light:{on:false},portable:{itemId:null,amount:1}}};f.w.player.near='reserve';
 const option=availableWorldOptions(f.w,f.s).find(o=>o.id==='equip:reserve');assert(option);assert(!act(f,...option.actions).interrupted);assert.equal(f.w.player.heldItemId,'lamp');assert.equal(f.w.player.heldToolId,'reserve');assert(illuminated(f.w,'office'));
 const saved=migrateTextWorld(f.w);assert.equal(saved.player.heldItemId,'lamp');assert.equal(saved.player.heldToolId,'reserve');
 act(f,{type:'STOW',target:'reserve'});assert.equal(f.w.player.heldToolId,'lamp');assert.equal(f.w.player.heldItemId,null);assert(illuminated(f.w,'office'));
 act(f,{type:'HOLD',target:'reserve'},{type:'LIGHT',target:'reserve'});
 assert(!act(f,{type:'STOW',target:'lamp'}).interrupted);assert(illuminated(f.w,'office'));assert.equal(f.w.player.heldToolId,'reserve');assert.equal(f.w.entities.lamp.components.position.zone,'player');
});

test('wording cannot turn storage into dropping or holding into acquiring a new reward',()=>{
 const context={nextChoices:[{id:'stow:water',label:'물병을 챙겨 둔다',family:'HANDLE',defaultThought:'일단 챙겨 두자.',labelNames:['물병']},{id:'hold:water',label:'물병을 꺼내 손에 든다',family:'HANDLE',defaultThought:'이걸 쓰면 어떨까.',labelNames:['물병']}]};
 const labels=resolveChoiceLabels(context,[{optionId:'stow:water',label:'물병을 바닥에 내려놓는다'},{optionId:'hold:water',label:'물병을 집어 챙긴다'}]);assert.deepEqual(labels.map(l=>l.label),context.nextChoices.map(c=>c.label));
});
