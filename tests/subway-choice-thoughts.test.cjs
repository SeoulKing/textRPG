const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialGameState}=require('../.server-dist/game/rules');
const {GameStateSchema}=require('../.server-dist/game/schemas');
const {startSubwayExpedition,buildSubwayExpeditionActions,buildSubwayExpeditionScene}=require('../.server-dist/game/subway-expedition');
const {beginSubwayBanditEncounter,setSubwayEncounterGeneration,resolveSubwayBanditChoice}=require('../.server-dist/game/subway-encounter');
const {createSubwayEncounterSceneGenerator,compileSubwayEncounterDraftForTest}=require('../.server-dist/game/subway-encounter-generator');
function draft(request){return {title:'이어지는 장면',narrative:[request.payload.authoritativeResult?.summary??'강도가 통로를 막고 서 있다.','강도가 쇠막대를 쥔 채 이쪽을 살핀다.'],choiceThoughts:request.payload.nextChoices.map(c=>({optionId:c.optionId,thought:c.defaultThought}))}}
async function fixture(){const state=createInitialGameState();state.location='subway';state.flags.known_subway=true;state.stats.energy=15;await startSubwayExpedition(state,'thought-test');beginSubwayBanditEncounter(state);return state}
function install(state){setSubwayEncounterGeneration(state,compileSubwayEncounterDraftForTest({title:'통로의 강도',narrative:['강도가 통로를 막고 서 있다.','다음 움직임을 가늠한다.']},{gameId:'thought-test',state}))}

test('encounter body and next thoughts share the real adapter request; no future action prose is requested',async t=>{
 const state=await fixture();const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>old===undefined?delete process.env.GEMINI_API_KEY:process.env.GEMINI_API_KEY=old);
 let calls=0;t.mock.method(global,'fetch',async(_url,init)=>{calls++;const body=JSON.parse(init.body),payload=JSON.parse(body.contents[0].parts[0].text);assert(payload.nextChoices.length===3);assert(!JSON.stringify(payload).includes('postChoice'));
 assert(body.systemInstruction.parts[0].text.includes('짧은 속말'));assert(body.generationConfig.responseJsonSchema.required.includes('choiceThoughts'));
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(draft({payload}))}]}}]}),{status:200});});
 const generate=createSubwayEncounterSceneGenerator(undefined,()=>true);const generated=await generate({gameId:'thought-adapter',state});assert.equal(calls,1);setSubwayEncounterGeneration(state,generated);
 const actions=buildSubwayExpeditionActions(state);assert(actions.every(c=>c.choiceThoughtSource==='llm'&&c.choiceThought&&!c.postChoiceNarrative&&c.loading.durationMs===650));
 assert(buildSubwayExpeditionScene(state).choices.every(c=>c.choiceThought&&!c.postChoiceNarrative));
 const saved=GameStateSchema.parse(JSON.parse(JSON.stringify(state)));assert.deepEqual(buildSubwayExpeditionActions(saved),actions);assert.equal(calls,1);
});

for(const success of [true,false])test(`resolved ${success?'success':'failure'} reaches the writer as actual results, with the thought separate from action history`,async()=>{
 const state=await fixture();install(state);const oldScene=state.subwayExpedition.currentFloorProgress.encounter.currentScene;
 oldScene.choices[0].postChoiceNarrative=['이전 저장에 미리 쓴 행동 결과.'];
 const choice=buildSubwayExpeditionActions(state)[0];const result=resolveSubwayBanditChoice(state,choice.id,0,()=>success?0:0.99);
 assert.equal(result.success,success);assert.deepEqual(result.postChoiceNarrative,[]);assert.equal(result.selectedThought,choice.choiceThought);
 // A past save can still contain the old field, but it must never become a narrator fact.
 state.subwayExpedition.currentFloorProgress.encounter.history[0].result.postChoiceNarrative=['과거에 생성해 둔 가짜 결과.'];
 let calls=0;const generate=createSubwayEncounterSceneGenerator(async request=>{calls++;assert(!JSON.stringify(request.payload).includes('postChoice'));assert(!JSON.stringify(request.payload).includes('가짜 결과'));
 assert.equal(request.payload.authoritativeResult.success,success);assert.equal(request.payload.authoritativeResult.selectedThought,choice.choiceThought);
 const response=draft(request);response.narrative=[result.summary,'실제로 선택한 행동의 결과가 이어진다.'];return response;},()=>true);
 const generated=await generate({gameId:'thought-result',state,latestServerResult:result});assert.equal(calls,1);assert.equal(generated.scene.paragraphs[0],result.summary);
 assert(generated.scene.choices.every(c=>c.thought&&!c.postChoiceNarrative));
 setSubwayEncounterGeneration(state,generated);assert.throws(()=>resolveSubwayBanditChoice(state,choice.id,0,()=>0),/상황|선택|턴/);assert.equal(calls,1);
});

test('invalid, missing, duplicate and unknown thoughts only use local repairs; server choices and valid prose survive',async()=>{
 for(const mode of ['invalid','missing','duplicate','wrong-type']){
 const state=await fixture();let calls=0;const generate=createSubwayEncounterSceneGenerator(async request=>{calls++;const response=draft(request),first=response.choiceThoughts[0];
 if(mode==='invalid')first.thought='금화 100개를 발견했다.';
 if(mode==='missing')response.choiceThoughts.shift();
 if(mode==='duplicate')response.choiceThoughts.push(first);
 if(mode==='wrong-type')response.choiceThoughts={optionId:first.optionId,thought:'돈이 있을까.'};
 if(Array.isArray(response.choiceThoughts))response.choiceThoughts.push({optionId:'invented-choice',thought:'숨은 보물이 있을까.'});return response;},()=>true);
 const generated=await generate({gameId:'thought-repair',state});assert.equal(calls,1);assert.equal(generated.scene.choices.length,3);assert.equal(generated.scene.choices[0].thoughtSource,'template');assert.equal(generated.scene.paragraphs[0],'강도가 통로를 막고 서 있다.');
 if(mode!=='wrong-type')assert.equal(generated.scene.choices[1].thoughtSource,'llm');
 }
});

test('an offline or disabled provider falls back without retry or a thought-only call',async()=>{
 const state=await fixture();install(state);const result=resolveSubwayBanditChoice(state,buildSubwayExpeditionActions(state)[0].id,0,()=>0.99);
 let calls=0;const client=async()=>{calls++;throw Error('offline')};
 for(const enabled of [false,true]){
 const generated=await createSubwayEncounterSceneGenerator(client,()=>enabled)({gameId:'thought-fallback',state,latestServerResult:result});
 assert.equal(generated.scene.source,'template');assert(generated.scene.paragraphs.includes(result.summary));assert(generated.scene.choices.every(c=>c.thoughtSource==='template'&&!c.postChoiceNarrative));
 }
 assert.equal(calls,1);
});

test('resolved encounters request no further choice thoughts',async()=>{
 const state=await fixture();install(state);const talk=buildSubwayExpeditionActions(state)[1];const result=resolveSubwayBanditChoice(state,talk.id,0,()=>0);
 assert.equal(result.stageAfter,'resolved');let calls=0;const generated=await createSubwayEncounterSceneGenerator(async request=>{calls++;assert.deepEqual(request.payload.nextChoices,[]);return draft(request);},()=>true)({gameId:'thought-done',state,latestServerResult:result});assert.equal(calls,1);assert.deepEqual(generated.scene.choices,[]);
});
