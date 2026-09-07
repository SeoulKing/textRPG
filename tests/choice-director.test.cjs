const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {performTextWorldAction,textWorldActions}=require('../.server-dist/game/text-world');
const {availableWorldOptions,worldOptions}=require('../.server-dist/game/text-world/choices');
const {interactionContext}=require('../.server-dist/game/text-world/interaction-context');
const {directChoices}=require('../.server-dist/game/text-world/choice-director');
const {fallbackNarration}=require('../.server-dist/game/text-world/narrator');
const {resolveChoiceNarratives}=require('../.server-dist/game/text-world/choice-narrative');
const {resolveWorldActions}=require('../.server-dist/game/text-world/engine');
const narrator=async c=>fallbackNarration(c);
async function start(){const s=createInitialGameState();s.location='subway';await performTextWorldAction(s,{type:'text_world',command:'enter'},'choice-test',narrator);return s;}
async function choose(s,id,n=narrator){const choice=textWorldActions(s).find(o=>o.action.optionId===id);assert(choice,'missing '+id+': '+textWorldActions(s).map(o=>o.action.optionId));await performTextWorldAction(s,choice.action,'choice-test',n);}

test('available capabilities are distinct from contextual slots, with no synonymous placement or movement rows',async()=>{
 const s=await start(),w=s.textWorld;const initial=worldOptions(w,s);assert(initial.length>=3&&initial.length<=5);assert.equal(new Set(initial.map(o=>o.family)).size,initial.length);
 await choose(s,'explore:crate');await choose(s,'collect:crate');
 const candidates=availableWorldOptions(w,s),shown=worldOptions(w,s);assert(candidates.filter(o=>o.id.startsWith('put:')||o.id.startsWith('drop:')).length>=3);
 assert.equal(shown.filter(o=>o.family==='PLACE_OBJECT').length,1);assert(shown.length>=3&&shown.length<=5);
 assert.equal(new Set(shown.map(o=>o.family)).size,shown.length);assert(shown.every(o=>o.slot));
});

test('explicit focus exit keeps physical position and survives save without restoring focus from proximity',async()=>{
 const s=await start(),w=s.textWorld;assert.equal(interactionContext(w).mode,'EXPLORE');
 await choose(s,'explore:crate');assert.equal(interactionContext(w).mode,'FOCUS');assert.equal(interactionContext(w).focusEntityId,'crate');
 const near=w.player.near,position=w.player.position;await choose(s,'defocus');assert.equal(w.player.near,near);assert.equal(w.player.position,position);assert.equal(interactionContext(w).mode,'EXPLORE');
 assert(availableWorldOptions(w,s).some(o=>o.id==='lid:crate'));assert(!worldOptions(w,s).some(o=>o.id==='lid:crate'));
 const restored=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));assert.equal(interactionContext(restored.textWorld).focusEntityId,null);assert.equal(interactionContext(restored.textWorld).mode,'EXPLORE');
});

test('only the currently handled item offers placement, including after focusing a compatible surface',async()=>{
 const s=await start(),w=s.textWorld;assert(!availableWorldOptions(w,s).some(o=>/^(put|drop):/.test(o.id)));
 await choose(s,'explore:crate');await choose(s,'collect:crate');const held=interactionContext(w).holdingEntityId;assert.equal(held,'scrap');assert.equal(interactionContext(w).mode,'MANIPULATE');
 assert(worldOptions(w,s).filter(o=>o.family==='PLACE_OBJECT').every(o=>o.actions.at(-1).target===held));
 const before={...s.inventory};const place=worldOptions(w,s).find(o=>o.family==='PLACE_OBJECT');await choose(s,place.id);assert.equal(s.inventory.scrapMetal,(before.scrapMetal??0)-2);
 assert.equal(interactionContext(w).holdingEntityId,null);
 // A carried light remains manipulable when attention shifts to a different compatible object.
 w.entities.lamp.components.position={zone:'player'};w.player.heldToolId='lamp';w.player.heldItemId=null;w.player.focusEntityId='crate';w.player.manipulating=false;
 assert.equal(interactionContext(w).mode,'MANIPULATE');assert(worldOptions(w,s).some(o=>o.family==='PLACE_OBJECT'));
});

test('real perceived urgency prioritizes responding and retreating and suppresses ordinary item placement',async()=>{
 const s=await start(),w=s.textWorld;w.rooms.office.light=false;w.entities.lamp.components.position={zone:'player'};w.entities.lamp.components.light={on:true,fuelSeconds:4};w.player.heldToolId='lamp';w.player.heldItemId='lamp';w.player.manipulating=true;
 w.entities.reserve={...structuredClone(w.entities.lamp),id:'reserve',name:'예비등',components:{position:{zone:'office'},light:{on:false,fuelSeconds:100},portable:{itemId:null,amount:1}}};
 const context=interactionContext(w),choices=worldOptions(w,s);assert.equal(context.mode,'THREAT');assert.equal(context.threat.kind,'light_expiring');assert(choices.some(o=>o.id==='equip:reserve'));
 assert(!choices.some(o=>['PLACE_OBJECT','COLLECT','OPEN_CONTAINER'].includes(o.family)));assert(!choices.some(o=>o.id==='light:lamp'));assert(choices.some(o=>o.family==='RETREAT'));
 w.entities.lamp.components.light.fuelSeconds=100;w.entities.reserve.components.position.zone='storage';w.entities.reserve.components.light={on:true,fuelSeconds:2};assert.notEqual(interactionContext(w).mode,'THREAT');
});

test('mechanical obstruction exists internally but is shown only when it serves the current situation',async()=>{
 const s=await start(),w=s.textWorld;await choose(s,'explore:crate');assert(availableWorldOptions(w,s).some(o=>o.id==='push:crate:door:blocking'));assert(!worldOptions(w,s).some(o=>o.id==='push:crate:door:blocking'));
 w.entities.door.components.openable={isOpen:true,locked:false,remainingOpenSeconds:7};assert.equal(interactionContext(w).mode,'THREAT');assert(worldOptions(w,s).some(o=>o.id==='push:crate:door:blocking'));
});

test('repeated reads and schema normalization preserve selected IDs while a genuine new discovery can change them',async()=>{
 let s=await start(),w=s.textWorld;const ids=()=>worldOptions(w,s).map(o=>o.id);const original=ids();for(let i=0;i<5;i++)assert.deepEqual(ids(),original);
 s=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));w=s.textWorld;assert.deepEqual(ids(),original);
 w.revision++;assert.deepEqual(ids(),original); // Time/revision alone is not a new reason to rearrange the menu.
 const extra=structuredClone(w.entities.crate);extra.id='newCase';extra.name='새 보관함';extra.components.container.items=[];w.entities.newCase=extra;
 assert(ids().includes('explore:newCase'));assert.equal(w.choiceHistory.length,1);
});

test('selection labels can change wording, but action IDs and invalid target/direction wording remain controlled locally',async()=>{
 const s=await start();let context;
 await choose(s,'explore:crate',async c=>{context=c;return fallbackNarration(c);});
 const take=context.nextChoices.find(o=>o.id==='collect:crate');assert(take);
 const good=resolveChoiceNarratives(context,[{optionId:take.id,text:take.actionLead,label:'미개봉 물병과 고철 조각을 집어 챙긴다'}]);assert.equal(good.find(o=>o.optionId===take.id).label,'미개봉 물병과 고철 조각을 집어 챙긴다');
 const wrong=resolveChoiceNarratives(context,[{optionId:take.id,text:take.actionLead,label:'금반지를 집어 챙긴다'}]);assert.equal(wrong.find(o=>o.optionId===take.id).label,undefined);
 assert.equal(resolveChoiceNarratives(context,[{optionId:'unknown',text:take.actionLead,label:take.label}]).some(o=>o.optionId==='unknown'),false);
});
