const test=require('node:test'),assert=require('node:assert/strict');
const {createNpcDialogueGenerator,generateNpcDialogueRoleJson}=require('../.server-dist/game/npc-dialogue-pipeline');
const {buildNpcDialogueActions,buildNpcDialogueScene,applyNpcDialogueGeneration}=require('../.server-dist/game/npc-dialogue');
const {getNpcDialogueProfile}=require('../.server-dist/game/data/npc-dialogue-profiles');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const profile=getNpcDialogueProfile('shumi');
function input(){return{gameId:'npc-contract-test',profile,context:{location:{id:'subway',name:'지하철역',summary:'대합실',sceneTitle:'대합실',sceneParagraphs:['슈미가 있다.']},player:{day:1,phase:'morning',condition:{hp:7,mind:8,energy:10},recentLog:[]}},memory:{visitCount:0,exchanges:[]},visitCount:1,turnNumber:0,selectedChoice:null}}
function output(){return{situation:'말을 건네자 슈미가 고개를 든다.',dialogue:'무슨 일이세요?',choices:[{label:'라디오에 대해 묻는다',thought:'무슨 소식을 듣고 있을까.'},{label:'이곳에서 지내는지 묻는다',thought:'이곳 사정은 좀 알고 있을까.'},{label:'경계하지 않아도 된다고 말한다',thought:'말을 조금 더 해 보는 게 좋겠지.'}]}}
test('real Gemini adapter makes one mocked HTTP request for reply and three thoughts',async t=>{
 const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-placeholder';t.after(()=>previous===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=previous);
 const bodies=[];t.mock.method(global,'fetch',async(_url,init)=>{bodies.push(JSON.parse(init.body));return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(output())}]}}]})}});
 const result=await createNpcDialogueGenerator(generateNpcDialogueRoleJson,()=>true)(input());
 assert.equal(bodies.length,1);const request=bodies[0];assert.deepEqual(request.generationConfig.responseJsonSchema.required,['situation','dialogue','choices']);
 assert(!JSON.stringify(request).includes('postChoiceNarrative'));assert(!JSON.stringify(request).includes('openingApproachNarrative'));
 assert.match(request.systemInstruction.parts[0].text,/속말이며 입 밖에 한 대사가 아니다/);
 assert.equal(result.scene.source,'llm');assert.equal(result.scene.replySource,'llm');assert(result.scene.choices.every(c=>c.thoughtSource==='llm'&&!c.postChoiceNarrative));
});
test('network failure and an invalid reply each stop at one request and use a coherent full fallback',async()=>{
 for(const raw of [null,{...output(),situation:42}]){
  let calls=0;const result=await createNpcDialogueGenerator(async()=>{calls++;if(raw===null)throw Error('offline');return raw},()=>true)(input());
  assert.equal(calls,1);assert.equal(result.scene.source,'template');assert.equal(result.scene.replySource,'template');
  assert(result.scene.choices.every(c=>c.thoughtSource==='template'));assert.equal(result.scene.choices.length,3);
 }
});
test('invalid or duplicate choices keep a valid reply and use local choices without a second request',async()=>{
 for(const choices of [undefined,[output().choices[0]],Array(3).fill(output().choices[0])]){
  let calls=0;const result=await createNpcDialogueGenerator(async()=>{calls++;return{...output(),choices}},()=>true)(input());
  assert.equal(calls,1);assert.equal(result.scene.situation,output().situation);assert.equal(result.scene.replySource,'llm');assert.equal(result.scene.source,'mixed');
  assert(result.scene.choices.every(c=>c.thoughtSource==='template'));const state=createInitialGameState();applyNpcDialogueGeneration(state,result,{newVisit:true});assert.equal(buildNpcDialogueScene(state,profile).source,'llm');
 }
});
test('a speculative or malformed thought falls back independently of the valid reply and label',async()=>{
 const raw=output();raw.choices[0].thought='서랍에서 100원을 획득했다.';raw.choices[1].thought='물어본다. 대답을 듣는다.';
 const result=await createNpcDialogueGenerator(async()=>raw,()=>true)(input());
 assert.equal(result.scene.choices[0].label,raw.choices[0].label);assert.equal(result.scene.choices[0].thought,'무슨 소식을 듣고 있을까.');
 assert.equal(result.scene.choices[0].thoughtSource,'template');assert.equal(result.scene.choices[2].thoughtSource,'llm');assert.equal(result.scene.replySource,'llm');
});
test('old conversation saves retain memory while retired prewritten actions never reach the UI or the next model request',async()=>{
 const oldChoice={id:'old-choice',label:'라디오에 대해 묻는다',postChoiceNarrative:['이전 저장에 미리 쓴 동작.','미리 쓴 두 번째 문단.']};
 const state=createInitialGameState();state.npcDialogue={active:{npcId:'shumi',turnNumber:4,currentScene:{npcId:'shumi',turnNumber:4,situation:'슈미가 고개를 든다.',dialogue:'계속 말해 보세요.',choices:[oldChoice,{...oldChoice,id:'old-2'},{...oldChoice,id:'old-3'}],source:'llm',generatedAt:'old'}},conversations:{shumi:{visitCount:2,exchanges:[{turnNumber:4,playerChoice:oldChoice,npcReply:{situation:'슈미가 고개를 든다.',dialogue:'계속 말해 보세요.'},at:'old'}]}}};
 const loaded=GameStateSchema.parse(JSON.parse(JSON.stringify(state)));const actions=buildNpcDialogueActions(loaded);assert.equal(actions.length,4);
 assert(actions.every(c=>c.choiceThought&&!c.postChoiceNarrative));assert(loaded.npcDialogue.conversations.shumi.exchanges[0].playerChoice.postChoiceNarrative);
 const requests=[];const result=await createNpcDialogueGenerator(async r=>{requests.push(r);return output()},()=>true)({...input(),visitCount:2,turnNumber:5,memory:loaded.npcDialogue.conversations.shumi,selectedChoice:oldChoice});
 assert.equal(requests.length,1);assert(!JSON.stringify(requests[0]).includes('미리 쓴'));assert(!JSON.stringify(requests[0]).includes('postChoiceNarrative'));
 assert.equal(requests[0].payload.recentHistory[0].playerChoice.label,oldChoice.label);assert.equal(result.exchange.playerChoice.postChoiceNarrative,undefined);
 assert.equal(result.exchange.playerChoice.thought,'무슨 소식을 듣고 있을까.');
});


test('renamed profiles retain authored visible facts and use a local reply without a request when disabled',async()=>{
 let calls=0;const f=input();f.profile={...profile,name:'준'};f.visitCount=2;
 const result=await createNpcDialogueGenerator(async()=>{calls++;throw Error('disabled')},()=>false)(f);
 assert.equal(calls,0);assert.match(result.scene.situation,/준이 익숙한 얼굴/);assert(!result.scene.situation.includes('슈미'));
 assert(f.profile.visibleDetails.some(f=>f.includes('라디오')));assert.equal(f.profile.openingApproachNarrative,undefined);
});
