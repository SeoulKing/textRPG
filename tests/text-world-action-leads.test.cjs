const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialGameState, refreshLocationKnowledge } = require('../.server-dist/game/rules');
const { GameStateSchema, ActionChoiceSchema, StoryChoiceSchema } = require('../.server-dist/game/schemas');
const { currentTextWorld, performTextWorldAction, textWorldActions, textWorldScene } = require('../.server-dist/game/text-world');
const { ensureConvenienceWorld } = require('../.server-dist/game/text-world/convenience');
const { buildRuntimeRegistry } = require('../.server-dist/game/runtime-registry');
const { fallbackNarration, narrateTextWorld, validateNarration } = require('../.server-dist/game/text-world/narrator');
const { resolveChoiceNarratives } = require('../.server-dist/game/text-world/choice-narrative');
const fallback = async c => fallbackNarration(c);
function stateAt(location) { const s=createInitialGameState();s.location=location;s.sceneId=location+'_first_intro';refreshLocationKnowledge(s);return s; }
async function enter(s,n) {
  if(s.location==='convenience') await ensureConvenienceWorld(s,buildRuntimeRegistry(s),n,'lead-test');
  else await performTextWorldAction(s,{type:'text_world',command:'enter'},'lead-test',n);
}
function rawNarration(c) { const n=fallbackNarration(c);return {paragraphs:n.paragraphs.map(text=>({text,factIds:n.usedFactIds})),choiceNarratives:c.nextChoices.map(o=>({optionId:o.id,text:o.actionLead.replace('시선을 모은다','시선을 둔다')}))}; }

for(const location of ['subway','convenience']) test(location+': one provider request renders results and all next leads, which survive saves without extra requests',async t=>{
  const oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-placeholder';
  t.after(()=>{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey});
  const contexts=[];
  t.mock.method(global,'fetch',async(_url,init)=>{
    const body=JSON.parse(init.body),c=JSON.parse(body.contents[0].parts[0].text).context;contexts.push(c);
    assert(body.systemInstruction.parts[0].text.includes('반복·인용·의역하지 않고'));
    assert.deepEqual(body.generationConfig.responseJsonSchema.properties.choiceNarratives.items.properties.optionId.enum,c.nextChoices.map(o=>o.id));
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(rawNarration(c))}]}}]})};
  });
  let s=stateAt(location);await enter(s,narrateTextWorld);
  assert.equal(contexts.length,1);assert.equal(currentTextWorld(s).source,'llm');
  assert(!/미개봉 물병|고철|1800|쌀/.test(JSON.stringify(contexts[0].nextChoices)));
  let choices=textWorldActions(s);assert.equal(choices.length,contexts[0].nextChoices.length);
  for(const choice of choices){assert.equal(ActionChoiceSchema.parse(choice).postChoiceNarrative.length,1);assert.equal(choice.postChoiceNarrativeSource,'llm');}
  for(const choice of textWorldScene(s).choices) assert.equal(StoryChoiceSchema.parse(choice).postChoiceNarrativeSource,'llm');
  s=GameStateSchema.parse(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(textWorldActions(s),choices);assert.equal(contexts.length,1);
  const selected=choices.find(c=>c.action.optionId.startsWith('explore:'));
  await performTextWorldAction(s,selected.action,'lead-test',narrateTextWorld);
  assert.equal(contexts.length,2);assert.deepEqual(contexts[1].alreadyDisplayed,selected.postChoiceNarrative);
  assert(!currentTextWorld(s).lastParagraphs.join(' ').includes(selected.postChoiceNarrative[0]));
  assert(currentTextWorld(s).recentScenes.at(-1).paragraphs.includes(selected.postChoiceNarrative[0]));
  assert(textWorldActions(s).some(c=>c.action.optionId.startsWith('collect:')));
  await assert.rejects(performTextWorldAction(s,selected.action,'lead-test',narrateTextWorld),/상황이 바뀌/);
  assert.equal(contexts.length,2);
  const saved=structuredClone(s);delete currentTextWorld(s).choiceNarratives;
  const legacy=GameStateSchema.parse(s);assert(textWorldActions(legacy).every(c=>c.postChoiceNarrativeSource==='template'));
  assert.deepEqual(legacy.inventory,saved.inventory);assert.equal(currentTextWorld(legacy).revision,currentTextWorld(saved).revision);
});

test('invalid/missing/duplicate choice leads fall back independently without discarding valid result prose',async()=>{
  const s=stateAt('subway');let context;
  await enter(s,async c=>{context=c;return fallbackNarration(c)});
  const ids=context.nextChoices.map(o=>o.id),raw=rawNarration(context);
  raw.choiceNarratives=[{optionId:ids[0],text:'상자를 열자 미개봉 물병을 발견한다.'},{optionId:ids[1],text:context.nextChoices[1].actionLead},{optionId:ids[1],text:context.nextChoices[1].actionLead},{optionId:'hidden:secret',text:'비밀을 발견한다.'}];
  const rendered=validateNarration(context,raw);assert(rendered);assert.equal(rendered.source,'llm');assert.equal(rendered.choiceNarratives.length,ids.length);
  assert(rendered.choiceNarratives.every(c=>c.source==='template'));
  assert(resolveChoiceNarratives(context,{broken:true}).every(c=>c.source==='template'));
  context.alreadyDisplayed=['상자를 살피려고 손을 뻗는다.'];
  raw.paragraphs[0].text=context.alreadyDisplayed[0]+' '+raw.paragraphs[0].text;
  const continued=validateNarration(context,raw);assert(continued);assert(!continued.paragraphs.join(' ').includes(context.alreadyDisplayed[0]));
});

test('provider failure keeps usable local leads and results, with no retry',async t=>{
  const oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-placeholder';
  t.after(()=>{if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey});
  let calls=0;t.mock.method(global,'fetch',async()=>{calls++;throw new Error('mock timeout')});
  const s=stateAt('subway');await enter(s,narrateTextWorld);
  assert.equal(calls,1);assert.equal(currentTextWorld(s).source,'template');assert(textWorldActions(s).every(c=>c.postChoiceNarrative?.length===1&&c.postChoiceNarrativeSource==='template'));
});
