const test = require('node:test'), assert = require('node:assert/strict');
const {GameService} = require('../.server-dist/game/service');
const {createInitialGameState,refreshLocationKnowledge} = require('../.server-dist/game/rules');
const {normalizeGameSession} = require('../.server-dist/game/repository');
const {currentTextWorld} = require('../.server-dist/game/text-world');
const {fallbackNarration,narrateTextWorld,renderNarration,validateNarration,hasContradictoryAction} = require('../.server-dist/game/text-world/narrator');
const {compactNarrativeContext,buildNarrationPrompt,needsGeneratedNarration} = require('../.server-dist/game/text-world/narration-prompt');
const {observeAction} = require('../.server-dist/game/action-observation');
const {completedParagraphs,readGeminiStream} = require('../.server-dist/game/gemini-stream');
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(location='subway',seed){
 const state=createInitialGameState();state.location=location;state.sceneId=location+'_repeat_intro';state.flags.opening_seen=true;refreshLocationKnowledge(state);
 let saved=seed??{id:'stream-test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state,world:{locationCards:{},personCards:{},itemCards:{},eventCards:{},sceneCards:{},protagonistCard:null}};
 let writes=0,logs=0,narrator=fallbackNarration,context;
 const repo={withGameLock:async(_id,f)=>f(),loadGame:async()=>normalizeGameSession(structuredClone(saved)),saveGame:async s=>{saved=JSON.parse(JSON.stringify(s));writes++;},getTemplate:async()=>undefined,saveTemplate:async()=>{},saveProtagonistTemplate:async()=>{},appendGenerationLog:async()=>{},appendActionLog:async()=>{logs++;}};
 const makeService=()=>new GameService(repo,undefined,undefined,undefined,undefined,async(c,id)=>{context=c;return narrator(c,id)});
 const service=makeService();
 return {service,makeService,repo,get saved(){return saved},get writes(){return writes},get logs(){return logs},get context(){return context},set narrator(n){narrator=n}};
}
async function entered(f){let snap=await f.service.getState('stream-test');if(snap.state.location==='subway')snap=await f.service.performAction('stream-test',chosen(snap,'travel:office'));return snap;}
function chosen(snap,id){const row=snap.availableActions.find(c=>c.action.optionId===id);assert(row,id);return row.action;}
function draft(c){
 const results=c.requiredFacts.filter(f=>f.kind==='result'),others=c.requiredFacts.filter(f=>f.kind!=='result');
 const first=fallbackNarration({...c,requiredFacts:results,optionalFacts:[],paragraphCount:{min:1,max:1}});
 const last=fallbackNarration({...c,results:[],requiredFacts:others,optionalFacts:[],paragraphCount:{min:1,max:1}});
 return {paragraphs:[{text:first.paragraphs[0],factIds:first.usedFactIds},{text:last.paragraphs[0],factIds:last.usedFactIds}],choiceLabels:[]};
}
function mockStream(t,{gate,corruptTail=false,failTail=false}={}){
 let calls=0,request;
 t.mock.method(global,'fetch',async(url,init)=>{
  calls++;request=JSON.parse(init.body);const c=JSON.parse(request.contents[0].parts[0].text).context,raw=draft(c);
  assert(validateNarration(c,raw),'fixture itself must faithfully represent the scene');
  assert.match(url,/:streamGenerateContent\?alt=sse$/);
  const prefix='{"paragraphs":['+JSON.stringify(raw.paragraphs[0])+',';
  if(corruptTail)raw.paragraphs[1].factIds=['invented:secret'];
  const tail=JSON.stringify(raw.paragraphs[1])+'],"choiceLabels":[]}';
  const enc=new TextEncoder(),frame=text=>'data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n';
  return new Response(new ReadableStream({async start(controller){
   controller.enqueue(enc.encode(frame(prefix)));
   if(gate)await gate.promise;
   if(failTail){controller.error(new Error('stream interrupted'));return;}
   controller.enqueue(enc.encode(frame(tail)));
   controller.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{finishReason:'STOP'}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:50,thoughtsTokenCount:0}})+'\n\n'));
   controller.close();
  }}),{headers:{'content-type':'text/event-stream'}});
 });
 return {get calls(){return calls},get request(){return request}};
}
test.beforeEach(t=>{const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-placeholder';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);t.mock.method(global,'fetch',async()=>{throw Error('Unexpected external request in streaming regression tests')});});

test('a validated first paragraph arrives before completion; duplicate requests and reload recovery never replay collection',async t=>{
 const f=fixture(),snap=await entered(f);f.narrator=narrateTextWorld;
 const gate=deferred(),first=deferred(),mock=mockStream(t,{gate}),events=[];let timing,done=false;
 const action=chosen(snap,'explore:crate'),before=structuredClone(f.saved),writes=f.writes;
 const pending=f.service.performAction('stream-test',action,{requestId:'stream-request-0001',onParagraph:e=>{events.push(e);first.resolve()},onTiming:v=>timing=v}).then(s=>{done=true;return s});
 await first.promise;
 assert.equal(done,false);assert.equal(f.writes,writes);assert.equal(events.length,1);assert.deepEqual(f.saved,before);
 const duplicate=f.service.performAction('stream-test',action,{requestId:'stream-request-0001'});
 gate.resolve();const result=await pending,replayed=await duplicate;
 assert.deepEqual(events.map(e=>e.text),result.currentScene.paragraphs);assert.deepEqual(replayed.currentScene,result.currentScene);
 assert.equal(mock.calls,1);assert.equal(f.writes,writes+1);assert.equal(timing.providerCalls,1);assert(timing.firstParagraphMs<=timing.totalMs);assert.equal(timing.inputTokens,100);
 assert.deepEqual((await f.makeService().recoverAction('stream-test','stream-request-0001')).currentScene,result.currentScene);
 await assert.rejects(f.service.performAction('stream-test',{...action,optionId:'collect:crate'},{requestId:'stream-request-0001'}),/이미 처리/);
 await assert.rejects(f.service.performAction('stream-test',action),/상황이 바뀌/);
 // Collection itself is protected, not only a discovery which changes no inventory.
 f.narrator=fallbackNarration;const collect=chosen(result,'collect:crate');const inventory=structuredClone(f.saved.state.inventory);
 const collected=await f.service.performAction('stream-test',collect,{requestId:'stream-request-0002'});
 const finalInventory=structuredClone(f.saved.state.inventory);assert.notDeepEqual(finalInventory,inventory);
 await f.makeService().performAction('stream-test',collect,{requestId:'stream-request-0002'});
 assert.deepEqual(f.saved.state.inventory,finalInventory);assert.deepEqual((await f.service.recoverAction('stream-test','stream-request-0002')).currentScene,collected.currentScene);
});

for(const failure of ['corruptTail','failTail'])test(failure+': preserve published prose and append only missing facts without another provider request',async t=>{
 const f=fixture(),snap=await entered(f);f.narrator=narrateTextWorld;
 const gate=deferred(),first=deferred(),events=[],mock=mockStream(t,{gate,[failure]:true});let timing;
 const pending=f.service.performAction('stream-test',chosen(snap,'explore:crate'),{onParagraph:e=>{events.push(e);first.resolve()},onTiming:v=>timing=v});
 await first.promise;const firstText=events[0].text;gate.resolve();const result=await pending;
 assert.equal(mock.calls,1);assert.equal(result.currentScene.paragraphs[0],firstText);assert.equal(events[0].source,'llm');assert.equal(events.at(-1).source,'template');
 assert.deepEqual(result.currentScene.paragraphSources,['llm','template']);assert.equal(timing.narration,'mixed');
 assert(!result.currentScene.paragraphs.join(' ').includes('invented:'));assert.match(result.currentScene.paragraphs.join(' '),/물병/);
 assert.equal(result.currentScene.paragraphs.filter(p=>p===firstText).length,1);
});

test('known item manipulation costs zero Gemini calls, but new discoveries and threats still request prose',async t=>{
 const f=fixture('convenience');let snap=await entered(f);
 for(const id of ['explore:convenience_food_crate','collect:convenience_food_crate','explore:convenience_register'])snap=await f.service.performAction('stream-test',chosen(snap,id));
 f.narrator=narrateTextWorld;let calls=0;t.mock.method(global,'fetch',async()=>{calls++;throw Error('must not call')});
 assert(!snap.availableActions.some(c=>c.action.optionId?.startsWith('hold:')));const bread=snap.exploration.targets.flatMap(t=>t.actions).find(c=>c.action.optionId?.startsWith('hold:')&&c.label.includes('빵'));assert(bread);let timing;
 const next=await f.service.performAction('stream-test',bread.action,{onTiming:v=>timing=v});
 assert.equal(calls,0);assert.equal(timing.providerCalls,0);assert.equal(next.currentScene.paragraphs.length,1);assert.equal(timing.fallbackReason,'routine_action');
 const context=f.context;assert.equal(needsGeneratedNarration(context),false);
 assert(needsGeneratedNarration({...context,requiredFacts:[...context.requiredFacts,{id:'discovered:key',kind:'entity',data:{discovered:true}}]}));
 assert(needsGeneratedNarration({...context,interaction:{...context.interaction,mode:'THREAT'}}));
 const compact=compactNarrativeContext({...context,knownFacts:[{id:'unrelated',kind:'entity',targetId:'other-room',data:{}}]});assert.deepEqual(compact.knownFacts,[]);assert.deepEqual(compact.recentScenes,context.recentScenes);
 assert(buildNarrationPrompt(context).includes('HOLD'));assert(!buildNarrationPrompt(context).includes('SERVICE의'));
});

test('JSON paragraph extraction ignores braces, escapes, incomplete objects, and other properties',()=>{
 const first={text:'"문" {앞}의 빛',factIds:['a']},second={text:'다음',factIds:['b']};
 const raw=JSON.stringify({paragraphs:[first,second],choiceLabels:[]});
 assert.deepEqual(completedParagraphs(raw.slice(0,raw.indexOf(',{"text":"다음"'))),[first]);
 assert.deepEqual(completedParagraphs(raw),[first,second]);assert.deepEqual(completedParagraphs('{"choiceLabels":[{}],"paragraphs":[] }'),[]);
});

test('discovery prompts and paragraph validation prevent the ungrounded rice bag seen in the real stream',async()=>{
 const f=fixture('convenience'),snap=await entered(f);
 await f.service.performAction('stream-test',chosen(snap,'explore:convenience_food_crate'));
 const c=f.context;assert.match(buildNarrationPrompt(c),/발견과 수집 모두/);
 assert(hasContradictoryAction(c,'보관함 안에서 쌀 한 봉지가 드러난다.'));
 const raw=draft(c);raw.paragraphs[1].text+=' 쌀 한 봉지가 보인다.';assert.equal(validateNarration(c,raw),null);
});

test('SSE and browser transport survive byte-sized Korean UTF-8 chunks and reject missing completion',async()=>{
 const enc=new TextEncoder();function response(text){const bytes=enc.encode(text);return new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close()}}));}
 const frame='data: '+JSON.stringify({candidates:[{content:{parts:[{text:'한글'}]},finishReason:'STOP'}]})+'\r\n\r\n';
 let delta;assert.equal((await readGeminiStream(response(frame),text=>delta=text)).rawText,'한글');assert.equal(delta,'한글');
 const {readActionStream}=await import('../action-stream-client.mjs');const events=[];
 const lines=[{type:'accepted',requestId:'id'},{type:'paragraph',index:0,text:'한글 문단',source:'llm'},{type:'complete',snapshot:{gameId:'g'}}].map(JSON.stringify).join('\n');
 assert.equal((await readActionStream(response(lines),e=>events.push(e),'id')).gameId,'g');assert.equal(events[1].text,'한글 문단');
 await assert.rejects(readActionStream(response(lines.split('\n').slice(0,2).join('\n'))),/연결이 끊겼/);
});

test('a disconnected stream consumer cannot cancel execution or prevent the committed receipt',async()=>{
 const f=fixture(),snap=await entered(f);const result=await f.service.performAction('stream-test',chosen(snap,'explore:crate'),{requestId:'disconnected-0001',onParagraph:()=>{throw Error('socket closed')}});
 assert.deepEqual((await f.makeService().recoverAction('stream-test','disconnected-0001')).currentScene,result.currentScene);
});

for (const failTail of [false,true]) test('an entry paragraph covering all required facts streams with a grounded optional continuation: '+failTail,{timeout:3000},async t=>{
 const f=fixture();await entered(f);const context=structuredClone(f.context),gate=deferred(),first=deferred(),events=[];
 const prose=fallbackNarration({...context,optionalFacts:[],paragraphCount:{min:1,max:1}});
 const p={text:prose.paragraphs[0],factIds:prose.usedFactIds};
 const q={text:'오른쪽 벽에는 작은 손전등이 보인다.',factIds:['entity:lamp']};
 assert(validateNarration(context,{paragraphs:[p,q]}));
 t.mock.method(global,'fetch',async()=>new Response(new ReadableStream({async start(c){const enc=new TextEncoder(),emit=text=>c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));
 emit('{"paragraphs":['+JSON.stringify(p)+',');await gate.promise;if(failTail){c.error(Error('lost tail'));return;}emit(JSON.stringify(q)+'],"choiceLabels":[]}');c.close();
 }}),{headers:{'content-type':'text/event-stream'}}));
 const pending=observeAction({onParagraph:e=>{events.push(e);first.resolve()}},()=>renderNarration(context,'entry-all-facts',narrateTextWorld));
 try {await first.promise;assert.equal(events[0].source,'llm');assert.equal(events[0].text,p.text);}finally{gate.resolve();}
 const result=await pending;assert.equal(result.paragraphs[0],p.text);assert.equal(result.paragraphs.length,2);
 assert(validateNarration(context,{paragraphs:result.paragraphs.map(text=>({text,factIds:result.usedFactIds}))}));
 if(!failTail)assert.equal(result.source,'llm');else assert.deepEqual(result.paragraphSources,['llm','template']);
});

test('a prefix without a safe fallback is deferred, while the valid complete scene remains LLM prose',{timeout:3000},async t=>{
 const f=fixture();await entered(f);const context={...f.context,optionalFacts:[]};const prose=fallbackNarration({...context,paragraphCount:{min:1,max:1}});
 const p={text:prose.paragraphs[0],factIds:prose.usedFactIds};const q={text:'역무실의 배치가 눈에 들어온다.',factIds:['layout:office']};
 const gate=deferred(),started=deferred(),events=[];
 t.mock.method(global,'fetch',async()=>new Response(new ReadableStream({async start(c){const enc=new TextEncoder(),emit=text=>c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));
 emit('{"paragraphs":['+JSON.stringify(p)+',');started.resolve();await gate.promise;emit(JSON.stringify(q)+'],"choiceLabels":[]}');c.close();
 }}),{headers:{'content-type':'text/event-stream'}}));
 const pending=observeAction({onParagraph:e=>events.push(e)},()=>renderNarration(context,'deferred-entry',narrateTextWorld));
 await started.promise;await tick();assert.equal(events.length,0);gate.resolve();const result=await pending;
 assert.equal(result.source,'llm');assert.deepEqual(result.paragraphs,[p.text,q.text]);
});

test('an inferred wall hook is removed while an authored attachment is preserved',async()=>{
 const f=fixture();await entered(f);const c=structuredClone(f.context),text='오른쪽 벽에는 작은 손전등이 걸려 있다.';
 const raw={paragraphs:[{text:'대합실에서 역무실 안으로 들어선다.',factIds:c.requiredFacts.map(f=>f.id)},{text,factIds:['entity:lamp']}]};
 assert.equal(validateNarration(c,raw).paragraphs[1],'오른쪽 벽에는 작은 손전등이 보인다.');
 c.optionalFacts.find(f=>f.id==='entity:lamp').data.outline='벽에 걸려 있는 작은 손전등';
 assert.equal(validateNarration(c,raw).paragraphs[1],text);
});
