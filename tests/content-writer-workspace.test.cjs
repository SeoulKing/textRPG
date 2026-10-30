const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tools = require('../content-writer-tools');
const base = () => ({ stories:[{id:'story',title:'이야기',scenes:[{id:'start',title:'시작',choices:[{id:'shared',label:'선택',effects:[],conditions:[],nextSceneId:'end'}]},{id:'end',title:'끝',choices:[{id:'shared',label:'선택',effects:[],conditions:[],nextSceneId:'end'}]}],actions:[]}],items:[],locations:[],people:[],recipes:[] });
test('undo/redo restores whole shared references, text, ordering and connections; new edit clears redo', () => {
  const doc=base(), original=structuredClone(doc), history=tools.history(doc,{selectedSceneId:'start'});
  doc.stories[0].scenes.forEach(s=>s.choices[0].label='함께 수정');history.record(doc,{selectedSceneId:'start'});
  doc.stories[0].scenes[0].choices=[];history.record(doc,{selectedSceneId:'start'});
  let restored=history.move(-1);assert.equal(restored.document.stories[0].scenes[0].choices[0].label,'함께 수정');
  restored=history.move(-1);assert.deepEqual(restored.document,original);
  restored=history.move(1);assert.equal(restored.document.stories[0].scenes[1].choices[0].nextSceneId,'end');
  restored.document.stories[0].title='새 분기';history.record(restored.document,{});assert.equal(history.canRedo,false);
});
test('typing is coalesced per input, structural edits stay separate and history is bounded',()=>{
  const doc=base(), h=tools.history(doc,{},4), input={};
  doc.stories[0].title='가';h.record(doc,{},input,1);doc.stories[0].title='가나';h.record(doc,{},input,100);
  assert.equal(h.move(-1).document.stories[0].title,'이야기');h.move(1);
  for(let i=0;i<8;i++){doc.stories[0].title=String(i);h.record(doc,{},undefined,200+i);}
  let count=0;while(h.move(-1))count++;assert.equal(count,3);
});
test('entering an editor updates the undo destination without creating a document change',()=>{
  const doc=base(),h=tools.history(doc,{library:true});h.visit({library:false,selectedSceneId:'start'});
  doc.stories[0].title='집필';h.record(doc,{library:false,selectedSceneId:'start'});
  assert.deepEqual(h.move(-1).selection,{library:false,selectedSceneId:'start'});
});
test('choice clone is independent and movement is bounded',()=>{
  const original=base().stories[0].scenes[0].choices[0];original.effects=[{type:'random_outcome',outcomes:[{effects:[{type:'add_item',itemId:'waterBottle',amount:2}]}]}];
  const clone=tools.duplicateChoice(original,'independent');clone.effects[0].outcomes[0].effects[0].amount=4;
  assert.equal(original.effects[0].outcomes[0].effects[0].amount,2);assert.equal(clone.id,'independent');
  const rows=[original,clone];assert.equal(tools.move(rows,0,-1),false);tools.move(rows,1,-1);assert.equal(rows[0],clone);
});
test('simple destinations are exclusive and branching choices can rejoin without changing effects',()=>{
  const a={id:'a',effects:[{type:'add_item',itemId:'waterBottle',amount:2}],endsStory:true},b={id:'b',effects:[]};
  const effects=structuredClone(a.effects);tools.connect(a,'scene','merge');tools.connect(b,'scene','merge');
  assert.equal(a.nextSceneId,b.nextSceneId);assert.equal(a.endsStory,undefined);assert.deepEqual(a.effects,effects);
  tools.connect(a,'story','nextStory');assert.equal(a.nextSceneId,undefined);tools.connect(a,'end');assert.equal(a.nextStoryId,undefined);assert.equal(a.endsStory,true);
});
test('advanced random/failed routes are never discarded by the simple destination picker',()=>{
  const choice={effects:[{type:'random_outcome',outcomes:[{effects:[{type:'set_scene',sceneId:'branch'}]}]}],failureEffects:[]};
  const before=structuredClone(choice);assert.equal(tools.destination(choice),'advanced');assert.throws(()=>tools.connect(choice,'end'));assert.deepEqual(choice,before);
  assert.equal(tools.destination({effects:[],failureEffects:[{type:'travel',locationId:'forest'}]}),'advanced');
});
test('publish comparison includes added/deleted choices once and ignores object key ordering',()=>{
  const before=base(),after=structuredClone(before);after.stories[0].scenes.forEach(s=>s.choices[0].label='고침');
  const changes=tools.changes(before,after);assert.equal(changes.filter(c=>c.kind==='선택지').length,1);assert.equal(changes.filter(c=>c.kind==='이야기').length,1);
  after.stories[0].scenes.forEach(s=>s.choices=[]);assert.equal(tools.changes(before,after).find(c=>c.kind==='선택지').type,'삭제');
  const reordered=structuredClone(before),story=reordered.stories[0];reordered.stories[0]={scenes:story.scenes,actions:story.actions,title:story.title,id:story.id};
  assert.deepEqual(tools.changes(before,reordered),[]);
  assert.equal(tools.sharedScenes(before,'shared').length,2);
});
test('library search, filters, expanded variants and scroll are restored',()=>{
  const source=fs.readFileSync(require.resolve('../content-writer-workspace'),'utf8');
  const state={query:'기존 원고',tab:'stories'},writer={library:true,libraryCategory:'지역 소개',librarySource:'existing',filterLocation:'forest',filterPerson:'npc',filterStatus:'ready'};
  const ui={searchInput:{},editorPanel:{scrollTop:27},entityList:{scrollTop:45}}, window={scrollY:380,scrollTo({top}){this.scrollY=top;}};
  const context=vm.createContext({state,writer,ui,window,$$:()=>[], $:()=>null});vm.runInContext(source,context);
  context.captureWriterLibrary();state.query='';writer.libraryCategory='';window.scrollY=0;ui.editorPanel.scrollTop=0;
  context.restoreWriterLibrary();context.restoreWriterLibraryScroll();assert.equal(state.query,'기존 원고');assert.equal(writer.libraryCategory,'지역 소개');assert.equal(window.scrollY,380);assert.equal(ui.editorPanel.scrollTop,27);
});
test('IME keeps draft text in place without history, autosave or list redraw until composition ends',()=>{
  const source=fs.readFileSync(require.resolve('../content-writer'),'utf8').split('function writerMatches')[0];
  const doc=base(), input={dataset:{w:'text'},tagName:'TEXTAREA',value:'한',addEventListener(name,fn){this[name]=fn;}}, target={text:''};
  let records=0,timers=0,redraws=0;
  const context=vm.createContext({state:{document:doc,tab:'stories',selectedId:'story',selectedSceneId:'start',selectedChoiceId:'shared'},ui:{},localStorage:{getItem:()=>null},escapeHtml:String,document:{querySelectorAll:()=>[input]},clearTimeout(){},setTimeout(){timers++;},drawGraph(){redraws++;},renderList(){redraws++;},updateWriterHistoryButtons(){},refreshWriterCardSummaries(){},refreshRegionResultSummaries(){},writerSelection:()=>({}),structuredClone,StudioWriterTools:tools});
  vm.runInContext(source+'\nglobalThis.testWriter=writer;globalThis.markDirty=writerChanged;',context);
  context.testWriter.composing=true;context.testWriter.history={record(){records++;}};context.bindWriter({querySelectorAll:()=>[input],matches:()=>false},target);
  input.input();input.value='한글';input.input();assert.equal(target.text,'한글');assert.equal(records,0);assert.equal(timers,0);assert.equal(redraws,0);
  context.testWriter.composing=false;context.writerChanged();assert.equal(records,1);assert.equal(timers,1);
});
