const test=require('node:test'),assert=require('node:assert/strict');
const recorded=require('./fixtures/npc-consumption-narration.json');
const {inspectNarration,validateNarration,fallbackNarration,renderNarration,narrateTextWorld}=require('../.server-dist/game/text-world/narrator');
const {buildNarrationPrompt}=require('../.server-dist/game/text-world/narration-prompt');
const {observeAction}=require('../.server-dist/game/action-observation');
const {getDevLlmTrace}=require('../.server-dist/game/dev-llm-trace');
const error={code:'missing_event_outcome',factIds:['result:1'],detail:'unreported_actor_consumption'};
const stale={code:'contradictory_event_outcome',factIds:['result:1'],detail:'consumed_food_still_held'};

test('the recorded Gemini response claims every fact ID but omits the NPC consumption',()=>{
 const {context,raw}=structuredClone(recorded);
 assert(context.requiredFacts.every(f=>raw.paragraphs.some(p=>p.factIds.includes(f.id))));
 assert.deepEqual(inspectNarration(context,raw),{narration:null,issues:[error,stale]});
 const prompt=buildNarrationPrompt(context);assert.match(prompt,/실제로 먹은 사건/);assert.match(prompt,/최근 선물 장면보다 이번 필수 결과/);
});

test('ordinary Korean consumption wording preserves the actor without fixing paragraph roles',()=>{
 for(const meal of ['슈미가 캔 음식 1개를 먹고 그 자리에 머물며 쉰다.','슈미는 캔 음식 하나를 먹는다. 그 자리에 머물며 쉰다.','캔 음식 한 개를 먹은 슈미가 그 자리에서 쉰다.','슈미가 캔 음식 한 개로 식사를 마치고 쉰다.','슈미가 캔 음식 한 개를 비우고 쉰다.','슈미가 캔 음식을 살핀다. 그는 한 개를 먹고 쉰다.']){
  const {context,raw}=structuredClone(recorded);raw.paragraphs[0].text='개찰구 너머 계단 앞으로 다가간다. '+meal;
  assert.deepEqual(inspectNarration(context,raw).issues,[],meal);
 }
});

test('wanting, denying, receiving or the player eating cannot stand in for the named NPC eating',()=>{
 for(const meal of ['슈미가 캔 음식 한 개를 먹고 싶어 한다.','슈미가 캔 음식 한 개를 안 먹는다.','슈미가 캔 음식 한 개를 먹은 건 아니다.','슈미에게서 받은 캔 음식 한 개를 먹는다.','내가 캔 음식 한 개를 먹는 사이 슈미가 음식을 쥔 채 쉰다.','슈미가 캔 음식 한 개를 들어 보인다. 캔 음식을 먹는다.']){
  const {context,raw}=structuredClone(recorded);raw.paragraphs[0].text='개찰구 너머 계단 앞으로 다가간다. '+meal;
  assert(inspectNarration(context,raw).issues.some(i=>i.code==='missing_event_outcome'),meal);
 }
});

test('one actor eating cannot cover another actor consumption fact',()=>{
 const {context,raw}=structuredClone(recorded),other=structuredClone(context.results[1]);
 other.actorId=other.targetId='cook';other.after.name='노파';context.results.push(other);context.requiredFacts.push({id:'result:4',kind:'result',targetId:'cook',data:other});
 raw.paragraphs[0].text='개찰구 너머 계단 앞으로 다가간다. 슈미가 음식을 들고 있고, 노파가 캔 음식 한 개를 먹는다.';
 raw.paragraphs[0].factIds.push('result:4');assert.deepEqual(inspectNarration(context,raw).issues,[error]);
});

test('fallback joins one NPC meal and its rest while preserving amounts and separate actors',()=>{
 const context=structuredClone(recorded.context);context.results[1].after.amount=2;context.requiredFacts.find(f=>f.id==='result:1').data.after.amount=2;
 const result=fallbackNarration(context),text=result.paragraphs.join(' ');
 assert.match(text,/슈미가 캔 음식 2개를 먹고 그 자리에 머물며 쉰다/);assert.equal((text.match(/슈미가/g)||[]).length,1);assert.equal(result.paragraphs.length,2);
 assert(validateNarration(context,{paragraphs:result.paragraphs.map(text=>({text,factIds:result.usedFactIds}))}));
 const separate=structuredClone(recorded.context);separate.requiredFacts.find(f=>f.id==='result:2').data.actorId='another';
 assert.match(fallbackNarration(separate).paragraphs.join(' '),/먹는다[.]/);
});

async function replay(t,{streamed,raw=recorded.raw,firstMustPublish=false,sceneContext=recorded.context}){
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const context=structuredClone(sceneContext),before=structuredClone(context),events=[];let calls=0,timing,release;
 const early=new Promise(resolve=>release=resolve);
 t.mock.method(global,'fetch',async()=>{
  calls++;
  if(!streamed)return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(raw)}]},finishReason:'STOP'}]});
  const enc=new TextEncoder();return new Response(new ReadableStream({async start(c){
   const send=text=>c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));
   send('{"paragraphs":['+JSON.stringify(raw.paragraphs[0])+',');
   if(firstMustPublish)await early;
   send(raw.paragraphs.slice(1).map(p=>JSON.stringify(p)).join(',')+'],"choiceLabels":'+JSON.stringify(raw.choiceLabels)+'}');c.close();
  }}),{headers:{'content-type':'text/event-stream'}});
 });
 const gameId='outcome-'+t.name;
 const result=await observeAction({...(streamed?{onParagraph:e=>{events.push(e);release();}}:{}),onTiming:t=>timing=t},()=>renderNarration(context,gameId,narrateTextWorld));
 assert.equal(calls,1);assert.equal(timing.providerCalls,1);assert.deepEqual(context,before);
 return {result,events,timing,trace:getDevLlmTrace(gameId)};
}

for(const streamed of [false,true])test('repair only the erroneous paragraph and preserve valid prose, one request; streamed='+streamed,{timeout:10000},async t=>{
 const raw=structuredClone(recorded.raw);raw.paragraphs[0].factIds=['result:0','result:1','result:2'];raw.paragraphs[1].factIds=['result:3','surface:subway_depth_stairs'];
 const {result,events,timing,trace}=await replay(t,{streamed,raw,firstMustPublish:streamed});
 assert.deepEqual(result.paragraphSources,['template','llm']);assert.equal(result.paragraphs[1],recorded.raw.paragraphs[1].text);
 assert.match(result.paragraphs[0],/슈미가 캔 음식 1개를 먹고/);assert(!result.paragraphs.join(' ').includes('받아 쥔 채'));
 assert.equal(timing.narration,'mixed');assert.equal(timing.fallbackReason,'repaired_event_outcome');
 assert.deepEqual(result.usedFactIds.sort(),recorded.context.requiredFacts.map(f=>f.id).sort());
 const diagnostic=trace.find(e=>e.stage==='draft_validation');assert.deepEqual(JSON.parse(diagnostic.errorReason),[error,stale]);assert.deepEqual(JSON.parse(diagnostic.response),raw);
 if(streamed){assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.text),result.paragraphs);assert.deepEqual(events.map(e=>e.source),['template','llm']);}
});

test('a previously published good prefix stays intact when a later paragraph needs outcome repair',async t=>{
 const raw=structuredClone(recorded.raw);
 raw.paragraphs=[{text:'개찰구 너머 계단 앞으로 다가간다.',factIds:['result:0']},{text:'슈미는 캔 음식 한 개를 들고 쉬고 있다. 가까이서 살피니 지하 1층으로 내려가는 계단이 이어진다.',factIds:['result:1','result:2','result:3','surface:subway_depth_stairs']}];
 const {result,events}=await replay(t,{streamed:true,raw,firstMustPublish:true});assert.deepEqual(result.paragraphSources,['llm','template']);assert.equal(result.paragraphs[0],raw.paragraphs[0].text);assert.deepEqual(events.map(e=>e.text),result.paragraphs);assert.match(result.paragraphs[1],/먹고/);
});

test('outcome repair cannot launder other invented facts into a published paragraph',async t=>{
 const raw=structuredClone(recorded.raw);raw.paragraphs[0].text+=' 환한 빛이 비친다.';
 const {result,events}=await replay(t,{streamed:true,raw});assert(!result.paragraphs.join(' ').includes('환한'));assert(events.every(e=>e.source==='template'));assert.match(result.paragraphs.join(' '),/먹고/);
});

for(const streamed of [false,true])test('unaltered live response with misplaced fact IDs cannot publish food still held after consumption; streamed='+streamed,async t=>{
 const {result,events}=await replay(t,{streamed});assert(result.paragraphs.every(p=>!p.includes('받아 쥔 채')));assert.match(result.paragraphs.join(' '),/먹/);assert.equal((result.paragraphs.join(' ').match(/먹/g)||[]).length,1);assert.deepEqual(result.paragraphSources??result.paragraphs.map(()=>result.source),['template','template']);if(streamed)assert.deepEqual(events.map(e=>e.source),['template','template']);
});

test('a complete correct response may place an event ID elsewhere, but it must not stream a prefix that would duplicate the event on failure',async t=>{
 const raw=structuredClone(recorded.raw);raw.paragraphs[0].text='개찰구 너머 계단 앞으로 다가간다. 슈미가 캔 음식 한 개를 먹고 쉰다.';
 const {result,events}=await replay(t,{streamed:true,raw});assert.equal(result.source,'llm');assert.deepEqual(result.paragraphs,raw.paragraphs.map(p=>p.text));assert.equal((events.map(e=>e.text).join(' ').match(/먹고/g)||[]).length,1);
});


test('the second real response explicitly preserves consumption and remains eligible for LLM rendering',async t=>{
 assert.deepEqual(inspectNarration(recorded.context,recorded.afterPromptRaw).issues,[]);
 const {result,events,timing}=await replay(t,{streamed:true,raw:recorded.afterPromptRaw,firstMustPublish:true});
 assert.equal(result.source,'llm');assert(events.every(e=>e.source==='llm'));assert.match(result.paragraphs.join(' '),/슈미가 캔 음식 1개를 먹으며/);assert.equal(timing.narration,'llm');
});

const projectedLive=require('./fixtures/narration-request-live.json');
const {hasUnclaimedEventOutcome,hasUnsupportedActorPosture,missingEventOutcomes}=require('../.server-dist/game/text-world/narrative-outcomes');

test('the new real response describes eating during observation; its problem is an invented sitting posture',()=>{
 assert.deepEqual(missingEventOutcomes(projectedLive.context,projectedLive.raw.paragraphs),[]);
 assert.deepEqual(inspectNarration(projectedLive.context,projectedLive.raw).issues,[{code:'contradictory_action',detail:'unsupported_actor_sitting'}]);
 assert(hasUnclaimedEventOutcome(projectedLive.context,projectedLive.raw.paragraphs[0]));
 for(const wording of ['슈미가 캔 음식 한 개를 먹는 동안 계단을 살핀다.','슈미가 캔 음식 한 개를 먹는 사이 계단을 살핀다.','슈미가 캔 음식 한 개를 먹는 중이다.'])assert.deepEqual(missingEventOutcomes(projectedLive.context,[{text:wording,factIds:['result:1']}]),[]);
 for(const wording of ['슈미가 캔 음식 한 개를 먹는 척한다.','슈미가 캔 음식 한 개를 안 먹는 동안 계단을 살핀다.'])assert.deepEqual(missingEventOutcomes(projectedLive.context,[{text:wording,factIds:['result:1']}]),['result:1']);
});

test('only the same actor observed posture can justify sitting, not generated history or another NPC',()=>{
 const c=structuredClone(projectedLive.context),raw=projectedLive.raw.paragraphs;
 c.recentScenes[0].paragraphs.push('슈미가 앉아 있다.');assert(hasUnsupportedActorPosture(c,raw));
 c.optionalFacts.push({id:'other:posture',kind:'npc_activity',targetId:'old_cook',data:{detail:'앉아 있다.'}});assert(hasUnsupportedActorPosture(c,raw));
 c.optionalFacts.push({id:'shumi:posture',kind:'npc_activity',targetId:'shumi_presence',data:{detail:'앉아 있다.'}});assert(!hasUnsupportedActorPosture(c,raw));
 assert(!hasUnsupportedActorPosture(projectedLive.context,[{text:'슈미가 캔 음식을 먹는다. 내가 앉아 있다.',factIds:['result:1']}]));
});

for(const streamed of [false,true])test('replay the unedited projected live response without invented posture, duplicated rest or another request: '+streamed,async t=>{
 const {result,events,timing}=await replay(t,{streamed,raw:projectedLive.raw,sceneContext:projectedLive.context});
 assert(!result.paragraphs.join(' ').includes('앉'));assert.equal((result.paragraphs.join(' ').match(/쉰다/g)||[]).length,1);assert.equal((result.paragraphs.join(' ').match(/먹고/g)||[]).length,1);
 assert.equal(timing.narration,'template');assert.equal(timing.providerCalls,1);assert(events.every(p=>p.source==='template'));
});

test('the same connected prose without the invented posture remains generated text',async t=>{
 const raw=structuredClone(projectedLive.raw);raw.paragraphs[1].text=raw.paragraphs[1].text.replace('자리에 앉아 ','');
 const {result,events,timing}=await replay(t,{streamed:true,raw,sceneContext:projectedLive.context});
 assert.equal(result.source,'llm');assert.deepEqual(result.paragraphs,raw.paragraphs.map(p=>p.text));assert(events.every(p=>p.source==='llm'));assert.equal(timing.narration,'llm');
});
