const test=require('node:test'),assert=require('node:assert/strict');
const {narrationRequest}=require('../.server-dist/game/text-world/narration-request');
const {compactNarrativeContext}=require('../.server-dist/game/text-world/narration-prompt');
const {directScene}=require('../.server-dist/game/text-world/director');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

for(const name of ['npc-consumption','combat-room','workbench'])test(name+': the provider receives every current fact once without losing outcome, viewpoint or continuity',()=>{
 const context=freeze(compactNarrativeContext(structuredClone(require('./fixtures/'+name+'-narration.json').context)));
 const before=JSON.stringify(context),request=JSON.parse(JSON.stringify(narrationRequest(context)));
 assert.equal(JSON.stringify(context),before);
 assert(!('results' in request));
 assert.deepEqual(request.requiredFacts,context.requiredFacts);
 assert.deepEqual(request.requiredFacts.filter(f=>f.kind==='result').map(f=>f.data),context.results);
 for(const key of ['optionalFacts','knownFacts','recentScenes','player','location','intent','interaction'])assert.deepEqual(request[key],context[key],key);
 assert.deepEqual(request.nextChoices,context.nextChoices.map(({selectionSignature,...option})=>option));
 assert.equal(request.paragraphCount.min,context.paragraphCount.min);assert.equal(request.paragraphCount.max,context.paragraphCount.max);
 assert(request.paragraphCount.preferred>=request.paragraphCount.min&&request.paragraphCount.preferred<=request.paragraphCount.max);
 const details=context.direction.beats.flatMap(b=>b.detailFactIds),links=request.direction.detailLinks;
 assert.deepEqual(links.flatMap(link=>link.detailFactIds),details);
 assert(links.every(link=>!('role' in link)&&link.detailFactIds.length));
 assert(JSON.stringify(request).length<before.length*0.86,'recorded scenes should save at least 14% of the context without deleting facts');
});

test('the object being inspected remains the narrative focus while a nearby NPC eats and rests',()=>{
 const context=structuredClone(require('./fixtures/npc-consumption-narration.json').context);
 context.optionalFacts=[{id:'detail:actor',kind:'surface',targetId:'shumi_presence',data:{detail:'기둥 곁에 있다.'}},{id:'detail:stairs',kind:'surface',targetId:'subway_depth_stairs',data:{detail:'아래층으로 이어진다.'}}];
 const directed=directScene(context);
 assert.equal(directed.direction.focusTargetId,'subway_depth_stairs');assert.equal(directed.optionalFacts[0].id,'detail:stairs');
 assert.deepEqual(directed.requiredFacts,context.requiredFacts);assert.deepEqual(directed.results,context.results);
 assert.deepEqual(narrationRequest(directed).direction.detailLinks.find(link=>link.detailFactIds.includes('surface:subway_depth_stairs')).resultFactIds,['result:3']);
});

test('waiting can shift attention to another actor without dropping the waiting action',()=>{
 const context=structuredClone(require('./fixtures/npc-consumption-narration.json').context);
 const wait={type:'WAIT',origin:'player',actorId:'player',at:10,before:{},after:{seconds:60}};
 context.results=[wait,...context.results.slice(1,3)];context.requiredFacts=[{id:'wait',kind:'result',data:wait},...context.requiredFacts.slice(1,3)];
 const directed=directScene(context);assert.equal(directed.direction.focusTargetId,'shumi_presence');
 assert.deepEqual(narrationRequest(directed).requiredFacts.map(f=>f.id),['wait','result:1','result:2']);
});

test('the primary collection keeps attention on its source rather than a simultaneous unrelated NPC',()=>{
 const context=structuredClone(require('./fixtures/npc-consumption-narration.json').context);
 const take={type:'TAKE',origin:'player',actorId:'player',targetId:'water',at:10,before:{zone:'crate'},after:{name:'물병',amount:1,inventoryDelta:{water:1}}};
 context.results=[take,...context.results.slice(1,3)];context.requiredFacts=[{id:'take',kind:'result',targetId:'water',data:take},...context.requiredFacts.slice(1,3)];
 assert.equal(directScene(context).direction.focusTargetId,'crate');
});

test('minor scenes remain one paragraph and next choices retain their exact executable identity',()=>{
 const context=structuredClone(require('./fixtures/workbench-narration.json').context);
 context.paragraphCount={min:1,max:1};delete context.direction;
 context.nextChoices=[{id:'choose:exact',label:'문을 연다',targetId:'door',family:'ACCESS',labelNames:['문'],defaultThought:'안쪽은 어떨까.',selectionSignature:'server-only'}];
 const request=narrationRequest(context);assert.deepEqual(request.paragraphCount,{min:1,max:1,preferred:1});assert(!('direction' in request));
 assert.deepEqual(request.nextChoices,[{id:'choose:exact',label:'문을 연다',targetId:'door',family:'ACCESS',labelNames:['문'],defaultThought:'안쪽은 어떨까.'}]);
});
