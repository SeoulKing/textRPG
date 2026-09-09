const test=require('node:test'),assert=require('node:assert/strict');
const recorded=require('./fixtures/workbench-narration.json');
const {fallbackNarration,validateNarration,hasContradictoryAction,renderNarration,narrateTextWorld}=require('../.server-dist/game/text-world/narrator');
const {observeAction}=require('../.server-dist/game/action-observation');
const context=()=>structuredClone(recorded.context);
const movement='나무 판자를 대고 고철과 끈으로 가로대의 이음새를 고정한다.';
const effect='구조를 복원한 작업대를 사용하면 제작 시간이 20% 줄어든다.';
function draft(c,first=movement,last=effect){return {paragraphs:[{text:first,factIds:c.requiredFacts.filter(f=>f.kind==='result').map(f=>f.id)},{text:last,factIds:c.requiredFacts.filter(f=>f.kind!=='result').map(f=>f.id)}],choiceLabels:[]};}

test('recorded Gemini repair prose is rejected for invented wood textures and an omitted work effect',()=>{
 const c=context();assert(hasContradictoryAction(c,recorded.prose.join(' ')));assert.equal(validateNarration(c,draft(c,...recorded.prose)),null);
 assert.equal(validateNarration(c,draft(c,movement,'거처 작업대를 다시 쓸 수 있게 된다.')),null);
 assert(validateNarration(c,draft(c)));
 assert.equal(validateNarration(c,draft(c,movement,effect.replace('20%','30%'))),null);
 assert(validateNarration(c,draft(c,movement,'작업대에 재료를 받쳐 두니 제작에 드는 시간을 줄일 수 있다.')));
});

test('current authored textures allow natural wording; past narration and unrelated knowledge do not grant current evidence',()=>{
 const c=context();c.recentScenes.push({zone:c.location.id,intent:'old',paragraphs:['표면은 거칠고 매끄럽다.']});
 c.knownFacts.push({id:'old',kind:'surface',data:{detail:'거칠고 매끄러운 결'}});
 assert(hasContradictoryAction(c,'손끝에 거친 결이 닿는다.'));
 assert(hasContradictoryAction(c,'매끈한 표면이 드러난다.'));
 c.optionalFacts.find(f=>f.kind==='surface').data.detail='이음새의 나뭇결은 거칠다. 작업대 표면은 매끄럽다.';
 assert(!hasContradictoryAction(c,'손끝에 거친 결이 닿는다. 매끈한 표면이 드러난다.'));
 assert(validateNarration(c,draft(c,movement+' 손끝에 거친 결이 닿는다.',effect)));
});

for(const invalidFirst of [true,false])test('one streamed repair request recovers missing facts without publishing unsupported textures: '+invalidFirst,async t=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const c=context(),raw=draft(c,invalidFirst?recorded.prose[0]:movement,recorded.prose[1]);let calls=0;const events=[];
 t.mock.method(global,'fetch',async()=>{calls++;const enc=new TextEncoder();return new Response(new ReadableStream({start(controller){
  for(const text of ['{"paragraphs":['+JSON.stringify(raw.paragraphs[0])+',',JSON.stringify(raw.paragraphs[1])+'],"choiceLabels":[]}'])controller.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text}]}}]})+'\n\n'));
  controller.enqueue(enc.encode('data: {"candidates":[{"finishReason":"STOP"}]}\n\n'));controller.close();
 }}),{headers:{'content-type':'text/event-stream'}})});
 const result=await observeAction({onParagraph:e=>events.push(e)},()=>renderNarration(c,'recorded-repair',narrateTextWorld));
 assert.equal(calls,1);assert.equal(result.paragraphs.length,2);assert.deepEqual(events.map(e=>e.text),result.paragraphs);
 assert(!/거친|매끄러/.test(result.paragraphs.join(' ')));assert.match(result.paragraphs.join(' '),/제작 시간이 20% 줄어/);
 if(invalidFirst)assert(events.every(e=>e.source==='template'));else{assert.equal(events[0].text,movement);assert.deepEqual(events.map(e=>e.source),['llm','template']);}
 assert(validateNarration(c,{paragraphs:result.paragraphs.map(text=>({text,factIds:result.usedFactIds}))}));
});

test('facility fallback describes authored work kinds and does not promise a zero-percent speed bonus',()=>{
 const c=context(),facility=c.requiredFacts.find(f=>f.kind==='facility');facility.data.kinds=['cook','build'];
 assert.match(fallbackNarration(c).paragraphs.join(' '),/요리·건설 시간이 20% 줄어/);
 facility.data.durationMultiplier=1;const text=fallbackNarration(c).paragraphs.join(' ');assert.match(text,/요리·건설 작업을 할 수/);assert(!text.includes('0%'));
});
