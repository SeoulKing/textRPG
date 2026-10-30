const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState,refreshLocationKnowledge}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {currentTextWorld,performTextWorldAction,textWorldActions,textWorldScene}=require('../.server-dist/game/text-world');
const {ensureConvenienceWorld}=require('../.server-dist/game/text-world/convenience');
const {buildRuntimeRegistry}=require('../.server-dist/game/runtime-registry');
const {fallbackNarration,narrateTextWorld,validateNarration}=require('../.server-dist/game/text-world/narrator');
const {resolveChoiceLabels}=require('../.server-dist/game/text-world/choice-labels');
function initial(location){const s=createInitialGameState();s.location=location;s.sceneId=location+'_first_intro';refreshLocationKnowledge(s);return s}
async function enter(s,n){if(s.location==='convenience')await ensureConvenienceWorld(s,buildRuntimeRegistry(s),n,'choice-test');else await performTextWorldAction(s,{type:'text_world',command:'enter'},'choice-test',n)}
function response(c){const n=fallbackNarration(c);return {paragraphs:n.paragraphs.map(text=>({text,factIds:n.usedFactIds})),choiceLabels:c.nextChoices.map(o=>({optionId:o.id,thought:o.defaultThought.replace('남아 있을까','남아 있으려나'),label:o.id==='explore:crate'?o.label.replace('열어 안을 확인한다','열어 안을 들여다본다'):o.label}))}}
for(const location of ['subway','convenience'])test(location+': complete result and labels use one request, with no pregenerated prose in new or old saves',async t=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-placeholder';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 const contexts=[];t.mock.method(global,'fetch',async(_url,init)=>{const body=JSON.parse(init.body),c=JSON.parse(body.contents[0].parts[0].text).context;contexts.push(c);
 assert(!c.alreadyDisplayed?.length);assert(c.nextChoices.every(o=>!('actionLead' in o)&&!('actions' in o)));
 assert.deepEqual(body.generationConfig.responseJsonSchema.properties.choiceLabels.items.required,['optionId','label','thought']);
 assert(body.systemInstruction.parts[0].text.includes('감각과 시선이 머무는 한국어 소설체'));assert(!body.systemInstruction.parts[0].text.includes('이미 표시된 행동 한 줄'));assert(!body.systemInstruction.parts[0].text.includes('선택을 시작하는 순간까지만'));
 return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(response(c))}]}}]})}});
 let s=initial(location);await enter(s,narrateTextWorld);assert.equal(contexts.length,1);assert.equal(currentTextWorld(s).source,'llm');
 const choices=textWorldActions(s);assert(choices.every(o=>!o.postChoiceNarrative&&o.choiceThought&&o.choiceThoughtSource==='llm'));assert(textWorldScene(s).choices.every(o=>!o.postChoiceNarrative));
 if(location==='subway')assert.equal(choices.find(c=>c.action.optionId==='explore:crate').label,'나무 상자를 열어 안을 들여다본다');
 currentTextWorld(s).choiceNarratives={old:{label:'old',text:'삭제된 선행 서사.',source:'llm'}};
 s=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));assert.deepEqual(textWorldActions(s),choices);assert.equal(contexts.length,1);
 const selected=choices.find(c=>c.action.optionId.startsWith('explore:'));await performTextWorldAction(s,selected.action,'choice-test',narrateTextWorld);
 assert.equal(contexts.length,2);assert.equal(contexts[1].intent.thought,selected.choiceThought);assert.equal(currentTextWorld(s).choiceNarratives,undefined);assert(!JSON.stringify(currentTextWorld(s).recentScenes).includes('삭제된 선행 서사'));
 assert(textWorldActions(s).some(c=>c.action.optionId.startsWith('collect:')));await assert.rejects(performTextWorldAction(s,selected.action,'choice-test',narrateTextWorld),/상황이 바뀌/);assert.equal(contexts.length,2);
});
test('invalid, duplicate or absent labels fall back independently without losing the valid full scene',async()=>{
 const s=initial('subway');let c;await enter(s,async context=>{c=context;return fallbackNarration(c)});const raw=response(c),id=c.nextChoices[0].id;
 raw.choiceLabels=[{optionId:id,label:'금반지를 챙긴다'},{optionId:id,label:'금반지를 챙긴다'},{optionId:'hidden:secret',label:'비밀을 연다'}];
 const rendered=validateNarration(c,raw);assert(rendered);assert.equal(rendered.source,'llm');assert(rendered.choiceLabels.every(o=>o.source==='template'));
 assert.deepEqual(resolveChoiceLabels(c,{}).map(o=>o.label),c.nextChoices.map(o=>o.label));
});
test('provider failure uses a complete local scene and local labels without a retry or extra lead call',async t=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-placeholder';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 let calls=0;t.mock.method(global,'fetch',async()=>{calls++;throw Error('offline')});const s=initial('subway');await enter(s,narrateTextWorld);
 assert.equal(calls,1);assert.equal(currentTextWorld(s).source,'template');assert(textWorldActions(s).every(o=>o.label&&!o.postChoiceNarrative));
});

const {defaultChoiceThought,validChoiceThought}=require('../.server-dist/game/text-world/choice-thoughts');
test('inner thoughts express curiosity without announcing the unobserved result or acting twice',()=>{
 const {createSubwayTextWorld}=require('../.server-dist/game/text-world/world');const world=createSubwayTextWorld();world.entities.counter={id:'counter',name:'계산대',description:'서랍',components:{position:{zone:'office'}}};
 assert.equal(defaultChoiceThought(world,{id:'focus:counter',label:'계산대로 다가간다',targetId:'counter'}),'돈이 좀 있을래나.');
 for(const t of ['돈이 좀 있을래나.','아직 쓸 만한 게 남아 있으려나.','챙겨 두면 쓸 일이 있겠지.'])assert(validChoiceThought(t));
 for(const t of ['서랍에 돈이 있다.','1800원을 발견했다.','계산대로 다가간다.','몸을 낮춘다.','열쇠를 획득했다.','돈이 있을까? 상자를 연다.'])assert(!validChoiceThought(t));
});
