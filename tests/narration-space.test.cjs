const test = require('node:test'), assert = require('node:assert/strict');
const recorded = require('./fixtures/combat-room-narration.json');
const { inspectNarration, validateNarration, narrateTextWorld, renderNarration } = require('../.server-dist/game/text-world/narrator');
const { buildNarrationPrompt } = require('../.server-dist/game/text-world/narration-prompt');
const { observeAction } = require('../.server-dist/game/action-observation');
const { clearDevLlmTrace, getDevLlmTrace } = require('../.server-dist/game/dev-llm-trace');
const missing = ['light:depth_1_1_landing', 'layout:depth_1_1_landing', 'connection:depth_1_1_door'];

// This is the unedited response from the real move -> close -> opponent opens request.
test('recorded combat room response omits spatial facts, independently of valid action prose', () => {
 const {context, raw} = structuredClone(recorded);
 assert.deepEqual(inspectNarration(context, raw), {narration:null, issues:[{code:'missing_required_facts', factIds:missing}]});
 assert.equal(validateNarration(context, raw), null);
 const complete = {paragraphs:[
  {text:'수색 구역에서 철문을 지나 좁은 계단실로 들어선다. 안쪽으로 이어진 계단은 아래층을 향하고, 그 윤곽을 구별할 만큼 빛이 닿는다.', factIds:['result:0', ...missing]},
  {text:'지나온 철문을 닫는다. 곧 강도가 그 문을 다시 연다.', factIds:['result:1', 'result:2']},
 ], choiceLabels:raw.choiceLabels};
 assert.equal(inspectNarration(context, complete).narration.source, 'llm');
 assert.deepEqual(inspectNarration(context, complete).issues, []);
 const prompt=buildNarrationPrompt(context);
 assert.match(prompt,/requiredFacts의 ID가 모두/);
 assert.match(prompt,/ID만 붙여 누락된 서술을 대신하지 않는다/);
 assert.match(prompt,/문을 지났다는 말만으로 이 정보를 대신하지 않는다/);
});

test('diagnostics distinguish missing facts, invented references, bad structure, and contradictory prose', () => {
 const {context, raw} = structuredClone(recorded);
 raw.paragraphs[1].factIds.push('entity:invented-key');
 assert.deepEqual(inspectNarration(context,raw).issues, [
  {code:'unknown_fact_ids',factIds:['entity:invented-key']}, {code:'missing_required_facts',factIds:missing},
 ]);
 assert.deepEqual(inspectNarration(context,{paragraphs:'broken'}).issues,[{code:'invalid_schema'}]);
 raw.paragraphs[0].text+=' 몸을 낮춘다.';
 assert(inspectNarration(context,raw).issues.some(i=>i.code==='contradictory_action'));
});

for(const streamed of [true, false]) test('recorded omission is repaired once and traced without a second request; streamed='+streamed, async t => {
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';
 t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const {context,raw}=structuredClone(recorded),before=structuredClone(context),events=[];
 const gameId='combat-coverage-'+streamed;clearDevLlmTrace(gameId);let calls=0,timing;
 t.mock.method(global,'fetch',async(url)=>{
  calls++;
  if(!streamed)return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(raw)}]},finishReason:'STOP'}]});
  assert.match(url,/:streamGenerateContent\?alt=sse$/);
  const enc=new TextEncoder();
  return new Response(new ReadableStream({start(c){
   const chunks=['{"paragraphs":[',JSON.stringify(raw.paragraphs[0])+',',JSON.stringify(raw.paragraphs[1])+'],"choiceLabels":'+JSON.stringify(raw.choiceLabels)+'}'];
   for(const text of chunks)c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));
   c.enqueue(enc.encode('data: {"candidates":[{"finishReason":"STOP"}]}\n\n'));c.close();
  }}),{headers:{'content-type':'text/event-stream'}});
 });
 const result=await observeAction({...(streamed?{onParagraph:e=>events.push(e)}:{}),onTiming:t=>timing=t},()=>renderNarration(context,gameId,narrateTextWorld));
 assert.equal(calls,1);assert.equal(timing.providerCalls,1);assert.equal(timing.fallbackReason,'invalid_narration');
 assert.deepEqual(context,before);assert.equal(result.source,'template');
 assert(validateNarration(context,{paragraphs:result.paragraphs.map(text=>({text,factIds:result.usedFactIds}))}));
 for(const id of missing)assert(result.usedFactIds.includes(id));
 assert.match(result.paragraphs.join(' '),/빛/);assert.match(result.paragraphs.join(' '),/아래층/);assert.match(result.paragraphs.join(' '),/수색 구역/);
 if(streamed){
  assert.deepEqual(events.map(e=>e.text),result.paragraphs);
  assert.deepEqual(events.map(e=>e.source),['llm','llm','template']);
  assert.deepEqual(result.paragraphs.slice(0,2),raw.paragraphs.map(p=>p.text));
  assert.equal(timing.narration,'mixed');
 }
 const trace=getDevLlmTrace(gameId),diagnostic=trace.find(e=>e.stage==='draft_validation'),request=trace.find(e=>e.stage==='request');
 assert(diagnostic);assert(request);assert.equal(trace.length,2);
 assert.deepEqual(JSON.parse(diagnostic.errorReason),[{code:'missing_required_facts',factIds:missing}]);
 assert.deepEqual(JSON.parse(diagnostic.response),raw);assert.deepEqual(JSON.parse(request.response),raw);
 assert.equal(diagnostic.status,'fallback');
});

test('the second real response cannot stream invented reach through a closed door',async t=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const context=structuredClone(recorded.context),raw=structuredClone(recorded.afterCoveragePromptRaw),events=[];let calls=0;
 assert.deepEqual(inspectNarration(context,raw).issues,[{code:'missing_required_facts',factIds:[missing[0]]},{code:'contradictory_action',detail:'unsupported_reach'}]);
 t.mock.method(global,'fetch',async()=>{calls++;const enc=new TextEncoder();return new Response(new ReadableStream({start(c){
  for(const text of ['{"paragraphs":['+JSON.stringify(raw.paragraphs[0])+',',JSON.stringify(raw.paragraphs[1])+'],"choiceLabels":[]}'])c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));c.close();
 }}),{headers:{'content-type':'text/event-stream'}})});
 const result=await observeAction({onParagraph:e=>events.push(e)},()=>renderNarration(context,'combat-reach-regression',narrateTextWorld));
 assert.equal(calls,1);assert.deepEqual(events.map(e=>e.source),['llm','template']);
 assert.equal(result.paragraphs[0],raw.paragraphs[0].text);assert(!result.paragraphs.join(' ').includes('손을 뻗'));
 assert.match(result.paragraphs.join(' '),/강도가 계단실 철문을 연다/);
 assert(validateNarration(context,{paragraphs:result.paragraphs.map(text=>({text,factIds:result.usedFactIds}))}));
 const explicit=structuredClone(context);explicit.optionalFacts.push({id:'response:reach',kind:'sensory',data:{action:'OPEN',detail:'문틈 너머로 손을 뻗는다.'}});
 assert(!inspectNarration(explicit,raw).issues.some(i=>i.code==='contradictory_action'));
});

test('fact-first paragraphs remain free to mix actions and space while streaming a complete scene',async t=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const context=structuredClone(recorded.context),events=[];let calls=0;
 const raw={paragraphs:[
  {factIds:['result:0',...missing],text:'수색 구역에서 철문을 지나 좁은 계단실로 들어선다. 안쪽으로 내려가는 계단이 빛을 받아 보인다.'},
  {factIds:['result:1','result:2'],text:'계단실 철문을 닫지만 곧 강도가 그 문을 다시 연다.'},
 ],choiceLabels:[]};
 t.mock.method(global,'fetch',async(_url,init)=>{calls++;const request=JSON.parse(init.body);
  assert.deepEqual(Object.keys(request.generationConfig.responseJsonSchema.properties.paragraphs.items.properties),['factIds','text']);
  const enc=new TextEncoder();return new Response(new ReadableStream({start(c){
   for(const text of ['{"paragraphs":['+JSON.stringify(raw.paragraphs[0])+',',JSON.stringify(raw.paragraphs[1])+'],"choiceLabels":[]}'])c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));c.close();
  }}),{headers:{'content-type':'text/event-stream'}});
 });
 const result=await observeAction({onParagraph:e=>events.push(e)},()=>renderNarration(context,'combat-complete-order',narrateTextWorld));
 assert.equal(calls,1);assert.equal(result.source,'llm');assert.deepEqual(result.paragraphs,raw.paragraphs.map(p=>p.text));
 assert.deepEqual(events.map(e=>e.source),['llm','llm']);assert.deepEqual(events.map(e=>e.text),result.paragraphs);
});

test('fact IDs alone cannot legitimize invented brightness, an unfinished close, or an unperformed pursuit',()=>{
 const context=structuredClone(recorded.context),raw=structuredClone(recorded.afterFactFirstRaw);
 const issue=()=>inspectNarration(context,raw).issues;
 assert.deepEqual(issue(),[{code:'contradictory_action',detail:'unsupported_brightness'}]);
 raw.paragraphs[0].text=raw.paragraphs[0].text.replace('환한 빛 아래로 ','빛이 닿는 곳에 ');
 assert.deepEqual(issue(),[{code:'contradictory_action',detail:'unfinished_close'}]);
 raw.paragraphs[1].text=raw.paragraphs[1].text.replace('닫으려던 순간','닫았지만');
 assert.deepEqual(issue(),[{code:'contradictory_action',detail:'unperformed_actor_move'}]);
 raw.paragraphs[1].text=raw.paragraphs[1].text.replace('뒤따라온 ','');
 assert.deepEqual(issue(),[]);
 // Authored brightness and a real movement event are permitted, not globally banned expressions.
 raw.paragraphs[0].text=recorded.afterFactFirstRaw.paragraphs[0].text;
 raw.paragraphs[1].text=recorded.afterFactFirstRaw.paragraphs[1].text.replace('닫으려던 순간','닫았지만');
 context.optionalFacts.push({id:'ambient:authored-bright',kind:'sensory',data:{detail:'환한 빛이 닿는다.'}});
 context.results.splice(1,0,{type:'ACTOR_MOVE',actorId:context.results[2].actorId,before:{zone:'depth_1_1_room'},after:{zone:'depth_1_1_landing'}});
 assert.deepEqual(issue(),[]);
});

test('a formally complete but ungrounded real response is rejected before its first paragraph is published',async t=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const context=structuredClone(recorded.context),raw=structuredClone(recorded.afterFactFirstRaw),events=[];let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;const enc=new TextEncoder();return new Response(new ReadableStream({start(c){
  for(const text of ['{"paragraphs":['+JSON.stringify(raw.paragraphs[0])+',',JSON.stringify(raw.paragraphs[1])+'],"choiceLabels":[]}'])c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));c.close();
 }}),{headers:{'content-type':'text/event-stream'}})});
 const result=await observeAction({onParagraph:e=>events.push(e)},()=>renderNarration(context,'combat-semantic-regression',narrateTextWorld));
 assert.equal(calls,1);assert.equal(result.source,'template');assert(events.length>0&&events.every(e=>e.source==='template'));
 assert.deepEqual(events.map(e=>e.text),result.paragraphs);
 assert(!/환한|닫으려던|뒤따라온/.test(result.paragraphs.join(' ')));
 assert.match(result.paragraphs.join(' '),/철문을 닫는다/);assert.match(result.paragraphs.join(' '),/강도가 계단실 철문을 연다/);
 assert(validateNarration(context,{paragraphs:result.paragraphs.map(text=>({text,factIds:result.usedFactIds}))}));
 assert.deepEqual(JSON.parse(getDevLlmTrace('combat-semantic-regression').find(t=>t.stage==='draft_validation').errorReason),[{code:'contradictory_action',detail:'unsupported_brightness'}]);
});
