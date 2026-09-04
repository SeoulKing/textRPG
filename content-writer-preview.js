/* The preview has its own DOM, request queue and game history. It never loads a save. */
function livePreviewState() {
  return writer.livePreview ??= { id:null, frame:null, revision:-1, context:null, epoch:0, busy:false, timer:null,
    error:'', lastAttempt:'', follow:false, syncing:false, highlight:null, setup:null, settingsKey:'', pane:'editor' };
}
function livePreviewContext() {
  if (!state.document) return null;
  if (state.tab === 'stories' && !writer.library) {
    const story = selectedEntity(), scene = story?.scenes.find(scene => scene.id === state.selectedSceneId) ?? story?.scenes[0];
    return story ? {story, scene, location:state.document.locations.find(location => location.id === (scene?.locationId ?? story.locationId))} : null;
  }
  if (state.tab === 'locations') {
    const location = selectedEntity();
    if (!location) return null;
    const current = livePreviewState().frame;
    const owners = state.document.stories.filter(story => story.locationId === location.id);
    const story = owners.find(story => current?.locationId === location.id && story.scenes.some(scene => scene.id === (current.sourceSceneId ?? current.sceneId)))
      ?? owners.find(story => story.native === 'region') ?? owners[0];
    const scene = story?.scenes.find(scene => scene.id === (current?.sourceSceneId ?? current?.sceneId)) ?? story?.scenes[0];
    return {story,scene,location};
  }
  return null;
}
function livePreviewKey(context) { return context ? `${context.story?.id ?? ''}/${context.scene?.id ?? ''}/${context.location?.id ?? ''}` : ''; }
function closeLivePreviewSession(id) {
  if (id) studioFetch(`/api/content-studio/preview/${encodeURIComponent(id)}`, {method:'DELETE'}).catch(() => {});
}
function resetLivePreview() {
  const previous = writer.livePreview;
  if (previous) { clearTimeout(previous.timer); closeLivePreviewSession(previous.id); }
  writer.livePreview = null; writer.preview = null;
}
function installLivePreview() {
  const root = document.createElement('aside'); root.id = 'writerLivePreview'; root.className = 'live-preview-panel'; root.hidden = true;
  root.setAttribute('aria-label','게임 미리보기');
  root.innerHTML = `<header class="live-preview-header"><div><span class="eyebrow">LIVE PREVIEW</span><h2>게임 미리보기</h2></div></header>
    <p class="live-preview-status" role="status" data-live-status></p>
    <div class="live-preview-controls"><button type="button" class="button ghost small" data-live-undo>직전 단계</button><button type="button" class="button ghost small" data-live-restart>현재 장면부터 다시 시작</button><button type="button" class="button ghost small" data-live-refresh>다시 동기화</button></div>
    <details class="live-preview-settings"><summary>시험 조건 설정</summary><div data-live-settings></div></details>
    <div class="live-preview-scroll"><div data-live-body></div></div>`;
  ui.editorPanel.after(root);
  const tabs = document.createElement('div'); tabs.id = 'livePreviewTabs'; tabs.className = 'live-preview-tabs'; tabs.hidden = true;
  tabs.innerHTML = '<button type="button" class="button ghost" data-live-pane="editor" aria-pressed="true">원고 편집</button><button type="button" class="button ghost" data-live-pane="preview" aria-pressed="false">게임 미리보기</button>';
  ui.editorPanel.before(tabs);
  $$('[data-live-pane]',tabs).forEach(button => button.onclick = () => setLivePreviewPane(button.dataset.livePane));
  $('[data-live-restart]',root).onclick = () => requestLivePreview({restart:true});
  $('[data-live-undo]',root).onclick = () => requestLivePreview({undo:true});
  $('[data-live-refresh]',root).onclick = () => requestLivePreview({recover:true});
  root.addEventListener('click', event => {
    const choice = event.target.closest('[data-live-choice]'), edit = event.target.closest('[data-live-edit]'), block=event.target.closest('[data-live-block]');
    const live=livePreviewState();
    if (choice && !choice.disabled) {
      const entry=live.displayChoices?.[Number(choice.dataset.liveChoice)];
      if (entry?.action) requestLivePreview({action:entry.action});
    } else if (edit) {
      const entry=live.displayChoices?.[Number(edit.dataset.liveEdit)];
      if (entry?.editorTarget) editLivePreviewTarget(entry.editorTarget);
    } else if (block) {
      const context=live.context;
      if(context?.story && context.scene)editLivePreviewTarget({tab:'stories',id:context.story.id,sceneId:context.scene.id},Number(block.dataset.liveBlock));
    } else if (event.target.closest('[data-live-hidden-edit]') && live.highlight?.source) editLivePreviewTarget(live.highlight.source);
  });
  document.addEventListener('focusin', event => {
    if (!ui.editorPanel.contains(event.target)) return;
    const context=livePreviewContext(), live=livePreviewState();
    if (!context) return;
    const source=StudioItemTextEditor.sourceFor(event.target);
    const card=source.closest('[data-choice-card]'), paragraph=source.closest('[data-block-text]');
    if (card) live.highlight={kind:'choice',id:card.dataset.choiceCard,sceneId:context.scene?.id,source:{tab:'stories',id:context.story.id,sceneId:context.scene?.id,choiceId:card.dataset.choiceCard}};
    else if (paragraph) live.highlight={kind:'block',index:Number(paragraph.dataset.blockText),sceneId:context.scene?.id};
    else if (event.target.closest('#regionActionEditor, #nativeActionEditor') && writer.activeAction) live.highlight={kind:'action',id:writer.activeAction.id,sceneId:context.scene?.id,source:{tab:'locations',id:context.location.id,actionId:writer.activeAction.id}};
    else if (event.target.closest('#sceneInfo')) live.highlight={kind:'title',sceneId:context.scene?.id};
    else return;
    paintLivePreview();
  });
  document.addEventListener('compositionstart', event => { if(ui.editorPanel.contains(event.target))clearTimeout(livePreviewState().timer); },true);
  document.addEventListener('compositionend', event => { if(ui.editorPanel.contains(event.target))livePreviewChanged(); });
}
function setLivePreviewPane(pane) {
  livePreviewState().pane=pane; $('.workspace').dataset.livePane=pane;
  $$('[data-live-pane]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.livePane===pane)));
}
function syncLivePreviewEditor() {
  const root=$('#writerLivePreview'); if(!root)return;
  const context=livePreviewContext(), live=livePreviewState(), key=livePreviewKey(context);
  root.hidden=!context; $('#livePreviewTabs').hidden=!context;
  $('.workspace').classList.toggle('has-live-preview',Boolean(context));
  if (key!==livePreviewKey(live.context)) {
    live.epoch++; live.context=context; live.error=''; live.highlight=null;
    if(!live.syncing)live.follow=false;
  } else live.context=context;
  if(!context){clearTimeout(live.timer);return;}
  if(!live.setup)live.setup=defaultLivePreviewSetup(context);
  setLivePreviewPane(live.pane);
  renderLivePreviewSettings(); paintLivePreview();
  if(!live.syncing && live.lastAttempt!==`${writer.revision}:${key}` && (live.revision!==writer.revision || (live.frame?.sourceSceneId ?? live.frame?.sceneId)!==context.scene?.id))scheduleLivePreview(0);
}
function defaultLivePreviewSetup(context) {
  writer.previewSetups??=new Map();
  return structuredClone(writer.previewSetups.get(context.story?.id) ?? {day:1,inventory:{waterBottle:1},flags:{}});
}
function scheduleLivePreview(delay=350) {
  const live=livePreviewState(); clearTimeout(live.timer);
  if(!live.context || writer.composing)return;
  live.timer=setTimeout(()=>requestLivePreview(),delay);
}
function livePreviewChanged() {
  if(!$('#writerLivePreview'))return;
  const live=livePreviewState();
  // Re-resolve entities after edit undo: the old objects no longer belong to the document.
  const current=livePreviewContext();
  if(livePreviewKey(current)!==livePreviewKey(live.context)){syncLivePreviewEditor();return;}
  live.context=current;
  if(!live.context)return;
  paintLivePreview();
  if(!writer.composing)scheduleLivePreview();
}
async function requestLivePreview(command={}) {
  const live=livePreviewState(), context=live.context;
  if(!context || live.busy || writer.composing)return;
  if(command.restart && $('#livePreviewSetup') && !$('#livePreviewSetup').reportValidity())return;
  clearTimeout(live.timer);
  if(!context.story || !context.scene){live.error='장면을 추가하면 이곳에서 시험을 진행할 수 있습니다.';paintLivePreview();return;}
  const revision=writer.revision, epoch=live.epoch, key=livePreviewKey(context);
  const starting=!live.id || command.restart, oldId=live.id;
  let setup;
  live.busy=true; live.error=''; live.lastAttempt=`${revision}:${key}`; paintLivePreview();
  try {
    synchronizeSharedChoices();
    const snapshot=structuredClone(state.document);
    let body;
    if(starting){
      setup={...structuredClone(live.setup ?? defaultLivePreviewSetup(context)),storyId:context.story.id,sceneId:context.scene.id,locationId:context.scene.locationId};
      body={document:snapshot,setup};
    } else {
      body={document:snapshot};
      if(command.action)body.action=command.action;
      else if(command.undo)body.undo=true;
      else if(command.setup)body.setup=command.setup;
      else if(!live.follow && (live.frame?.sourceSceneId ?? live.frame?.sceneId)!==context.scene.id)body.jump={storyId:context.story.id,sceneId:context.scene.id};
    }
    const response=await studioFetch(starting?'/api/content-studio/preview':`/api/content-studio/preview/${encodeURIComponent(live.id)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.message ?? '미리보기를 갱신하지 못했습니다.');
    if(writer.livePreview!==live){if(starting)closeLivePreviewSession(result.id);return;}
    live.id=result.id; live.frame=result;
    if(starting){if(oldId && oldId!==result.id)closeLivePreviewSession(oldId);writer.previewSetups.set(context.story.id,structuredClone(setup));}
    if(command.setup)writer.previewSetups.set(context.story.id,structuredClone(live.setup));
    const shouldFollow=Boolean(command.action || command.undo || command.setup || command.recover || live.follow);
    if(epoch===live.epoch){
      live.follow=shouldFollow;
      if(revision===writer.revision && !writer.composing){
        live.revision=revision; live.visibleFrame=result; writer.preview=result;
        live.follow=false;
        if(shouldFollow && result.editorTarget) {
          live.syncing=true; live.scrollToScene=true;
          try { go(result.editorTarget.tab,result.editorTarget.id,result.editorTarget.sceneId); }
          finally { live.syncing=false; }
          $('.primary-manuscript',ui.editorPanel)?.scrollIntoView({block:'start'});
        }
        live.lastAttempt=`${revision}:${livePreviewKey(live.context)}`;
      }
    }
  } catch(error) {
    if(writer.livePreview===live && epoch===live.epoch && revision===writer.revision)live.error=error.message;
  } finally {
    live.busy=false;
    if(writer.livePreview===live){
      paintLivePreview(); drawGraph();
      // Never replay a failed action; only synchronize the latest document/navigation.
      if(live.context && (revision!==writer.revision || epoch!==live.epoch || live.follow) && !live.error)scheduleLivePreview(0);
      else if(live.context && (revision!==writer.revision || epoch!==live.epoch))scheduleLivePreview(0);
    }
  }
}
function livePreviewDefinition(choice,context) {
  if(choice.action?.type==='content_action')return studioRegionActions(state.document,context.location?.id).find(entry=>entry.action.id===choice.id)?.action;
  return context.scene?.choices.find(entry=>entry.id===choice.id);
}
function livePreviewSystemNote(frame) {
  if(!frame)return '';
  const entries=frame.systemNoteEntries??[];
  if(!entries.length)return frame.systemNote?`<p class="live-system-note">${esc(frame.systemNote)}</p>`:'';
  return `<div class="live-system-note">${entries.map(entry=>{
    let label='',tone='neutral';
    if(entry.type==='delta'){
      const name=entry.itemId?state.document.items.find(item=>item.id===entry.itemId)?.name??entry.label:entry.label;
      label=`${entry.amount>0?'+':''}${entry.amount} ${name}`;tone=entry.amount>0?'positive':'negative';
    }else if(entry.type==='damage'){label=`${entry.target} -${entry.amount}`;tone='negative';}
    else if(entry.type==='time')label=`+${entry.minutes}분`;
    else{label=entry.text??'';tone=['positive','negative'].includes(entry.tone)?entry.tone:'neutral';}
    return `<span class="live-note-chip ${tone}">${esc(label)}</span>`;
  }).join('')}</div>`;
}
function livePreviewParagraphs(context) {
  const name=id=>id==='protagonist'?'플레이어':state.document.people.find(person=>person.id===id)?.name??id;
  return (context.scene?.blocks ?? context.scene?.paragraphs?.map(text=>({text})) ?? []).map(block=>resolveItemTextPreview(block.speakerId?`${name(block.speakerId)}: “${block.text}”`:block.text));
}
function paintLivePreview() {
  const root=$('#writerLivePreview'), live=livePreviewState(), context=live.context;
  if(!root || !context || root.hidden)return;
  const frame=live.visibleFrame, sameScene=(frame?.sourceSceneId ?? frame?.sceneId)===context.scene?.id;
  const ready=sameScene && live.revision===writer.revision && !live.error && !writer.composing;
  const running=ready && !live.busy && !frame?.isGameOver;
  $('[data-live-status]',root).textContent=live.error ? `원고 표시 중 · 시험 진행 불가 — ${live.error}` : live.busy ? '최신 원고와 시험 상태를 반영하는 중…' : !ready ? '원고 표시 중 · 시험 준비 중' : frame.isGameOver ? '시험이 종료되었습니다. 다시 시작할 수 있습니다.' : '최신 원고 반영됨 · 선택하면 게임처럼 진행합니다.';
  $('[data-live-status]',root).classList.toggle('is-error',Boolean(live.error));
  $('[data-live-undo]',root).disabled=live.busy || !frame?.canUndo || writer.composing;
  $('[data-live-restart]',root).disabled=live.busy || writer.composing;
  $('[data-live-refresh]',root).disabled=live.busy || writer.composing;
  $('[data-live-refresh]',root).hidden=!live.error;
  const apply=$('[data-live-apply]',root);if(apply)apply.disabled=live.busy||writer.composing;
  let choices;
  if(sameScene && !live.error){
    choices=frame.choices.map(choice=>{
      const definition=livePreviewDefinition(choice,context);
      return {...choice,label:resolveItemTextPreview(definition?.label ?? choice.label)};
    });
  }else{
    choices=[...(context.scene?.choices ?? []).filter(choice=>!choice.hidden).map(choice=>({...choice,available:false,editorTarget:{tab:'stories',id:context.story.id,sceneId:context.scene.id,choiceId:choice.id}})),
      ...(!(context.scene?.suppressLocationInteractions ?? !context.story?.native) ? studioRegionActions(state.document,context.location?.id).map(({action})=>({...action,available:false,editorTarget:{tab:'locations',id:context.location.id,actionId:action.id}})) : [])];
  }
  live.displayChoices=choices;
  const highlight=live.highlight?.sceneId===context.scene?.id?live.highlight:null;
  const selected=highlight && ['choice','action'].includes(highlight.kind) ? (highlight.kind==='choice'?context.scene?.choices.find(choice=>choice.id===highlight.id):studioRegionActions(state.document,context.location?.id).find(entry=>entry.action.id===highlight.id)?.action) : null;
  const missing=selected && !choices.some(choice=>choice.id===selected.id);
  const unavailable=frame?.unmet?.find(entry=>entry.id===selected?.id);
  const reason=selected?.hidden?'숨김 설정':unavailable?.conditions?.length?unavailable.conditions.map(conditionLabel).join(' · '):unavailable?.reason??'현재 장면·시험 조건에서는 표시되지 않거나 아직 반영 중입니다.';
  const trail=frame?.trace ?? [], paragraphs=livePreviewParagraphs(context);
  const image=context.location?.imagePath || 'assets/scenes/camp.svg';
  const scroll=$('.live-preview-scroll',root), position=scroll.scrollTop;
  $('[data-live-body]',root).innerHTML=`<div class="live-position"><strong>${esc(context.location?.name ?? '지역 미정')} · ${frame?.day ?? live.setup?.day ?? 1}일째</strong><span>${esc(context.scene?.title || '새 장면')}</span>${frame?.stats?`<small>체력 ${frame.stats.hp} · 기력 ${frame.stats.energy} · 정신력 ${frame.stats.mind}</small>`:''}</div>
    <div class="live-path-summary">${esc(frame?.origin?.title ?? context.scene?.title ?? '시작 장면')}${trail.length?` → ${esc(trail.at(-1).label)} → ${esc(frame.title)}`:' · 시작'}</div>
    <details class="live-trail" ${live.trailOpen?'open':''}><summary>선택 경로 · ${trail.length}단계 전체 보기</summary><ol><li>${esc(frame?.origin?.title ?? context.scene?.title ?? '시작 장면')} <small>시작</small></li>${trail.map(entry=>`<li><span class="${entry.kind==='jump'?'direct-jump':''}">${esc(entry.label)}</span><strong>→ ${esc(entry.toTitle ?? entry.toSceneId ?? '')}</strong></li>`).join('')}</ol>${!sameScene&&frame?'<p class="muted">편집 위치로 이동을 준비 중입니다. 위 경로는 마지막으로 성공한 시험 기록입니다.</p>':''}</details>
    <article class="live-game-screen"><img class="live-scene-art" src="${esc(image)}" alt="${esc(context.location?.name ?? '현재 지역')} 장면"><div class="live-scene-copy"><h3 class="${highlight?.kind==='title'?'is-editing':''}">${esc(resolveItemTextPreview(context.scene?.title || '제목 없는 장면'))}</h3>
    <div class="live-scene-text">${paragraphs.map((text,index)=>`<div class="live-paragraph ${highlight?.kind==='block'&&highlight.index===index?'is-editing':''}"><p>${esc(text)||'<span class="muted">이 문단을 작성해 주세요.</span>'}</p><button type="button" class="live-edit-link" data-live-block="${index}" aria-label="문단 ${index+1} 편집">편집</button></div>`).join('')||'<p class="muted">장면 원고를 작성하면 이곳에 표시됩니다.</p>'}</div>
    ${sameScene ? livePreviewSystemNote(frame) : ''}
    <div class="live-game-choices">${choices.map((choice,index)=>`<div class="live-choice-row ${highlight?.id===choice.id?'is-editing':''}"><button type="button" class="live-choice-button" data-live-choice="${index}" ${running&&choice.available&&choice.action?'':'disabled'}><span>${esc(resolveItemTextPreview(choice.label))}</span>${choice.showOutcomeHint&&choice.outcomeHint?`<small>${esc(resolveItemTextPreview(choice.outcomeHint))}</small>`:''}${Number.isInteger(choice.remainingUses)?`<small>남은 횟수: ${choice.remainingUses}회</small>`:''}</button>${choice.editorTarget?`<button type="button" class="live-edit-link" data-live-edit="${index}" aria-label="${esc(resolveItemTextPreview(choice.label))} 편집">편집</button>`:''}</div>`).join('')||'<p class="muted">표시할 선택지가 없습니다.</p>'}</div></div></article>
    ${missing?`<section class="live-hidden-choice"><strong>편집 중인 선택지 · ${ready?'게임에서는 숨겨짐':'반영 대기 또는 표시 조건 확인'}</strong><p>${esc(resolveItemTextPreview(selected.label))}</p><small>${esc(reason)}</small><button type="button" class="button ghost small" data-live-hidden-edit>원본 편집</button></section>`:''}
    ${frame?`<details class="live-inventory"><summary>시험 소지품</summary>${Object.entries(frame.inventory??{}).filter(([,amount])=>amount>0).map(([id,amount])=>`<span class="badge">${esc(state.document.items.find(item=>item.id===id)?.name??id)} ${amount}개</span>`).join('')||'<p class="muted">소지품 없음</p>'}</details>`:''}`;
  $('.live-trail',root).ontoggle=event=>{live.trailOpen=event.target.open;};
  scroll.scrollTop=live.scrollToScene?0:position;live.scrollToScene=false;
  $$('[data-choice-card]',ui.editorPanel).forEach(card=>card.classList.toggle('preview-linked',highlight?.id===card.dataset.choiceCard));
}
function editLivePreviewTarget(target,blockIndex) {
  if(!target)return;
  if(target.tab==='locations' && target.actionId)openRegionAction(target.id,target.actionId);
  else go(target.tab,target.id,target.sceneId,target.choiceId);
  setLivePreviewPane('editor');
  let input;
  if(blockIndex!==undefined)input=$(`[data-block-text="${blockIndex}"]`,ui.editorPanel);
  else if(target.choiceId)input=$$('[data-choice-card]',ui.editorPanel).find(card=>card.dataset.choiceCard===target.choiceId)?.querySelector('[data-card-label]');
  const surface=StudioItemTextEditor.surface(input);surface?.scrollIntoView({block:'center'});surface?.focus({preventScroll:true});
}
function renderLivePreviewSettings(force=false) {
  const live=livePreviewState(), root=$('[data-live-settings]'), context=live.context;
  if(!root || !context)return;
  const key=context.story?.id ?? context.location?.id;
  if(!force && live.settingsKey===key && root.childElementCount)return;
  if(live.settingsKey!==key && writer.previewSetups?.has(context.story?.id))live.setup=defaultLivePreviewSetup(context);
  live.settingsKey=key;
  const setup=live.setup??=defaultLivePreviewSetup(context);
  setup.inventory??={};setup.flags??={};
  root.innerHTML=`<form id="livePreviewSetup"><p class="muted">시험에만 적용합니다. 적용 버튼은 입력한 일차·지역·소지품·진행 상태로 바꿉니다. 원고 수정만으로는 이미 받은 보상을 바꾸지 않습니다.</p><label class="field"><span>일차</span><input type="number" min="1" max="9" step="1" required data-live-day value="${setup.day??1}"></label>
    <label class="field"><span>시험 지역</span><select data-live-location>${options(locEntries(),setup.locationId??context.location?.id)}</select></label>
    <div class="live-setup-inventory">${Object.entries(setup.inventory??{}).map(([id,amount])=>`<label class="field"><span>${esc(state.document.items.find(item=>item.id===id)?.name??id)}</span><input type="number" min="0" step="1" required data-live-inventory="${esc(id)}" value="${amount}"></label>`).join('')}</div>
    <label class="field"><span>시험 아이템 추가</span><select data-live-item>${itemOptions('',true)}</select></label><button type="button" class="button ghost small" data-live-add-item>아이템 추가</button>
    <label class="field"><span>진행 상태 추가</span><select data-live-flag>${options(livePreviewFlagEntries(),'',true)}</select></label><button type="button" class="button ghost small" data-live-add-flag>진행 상태 추가</button>
    <p class="muted">상태 값은 true(완료), false(미완료), 숫자 또는 텍스트로 입력합니다. 목록에서 빼면 다음 적용에서 그 상태를 변경하지 않습니다.</p>
    ${Object.entries(setup.flags).map(([id,value])=>`<div class="live-setup-flag"><label class="field"><span>${esc(flagLabel(id))}</span><input data-live-flag-value="${esc(id)}" value="${esc(typeof value==='string'?JSON.stringify(value):String(value))}"></label><button type="button" class="button ghost small" data-live-remove-flag="${esc(id)}" aria-label="${esc(flagLabel(id))} 시험 설정에서 제외">제외</button></div>`).join('')}
    <button type="submit" class="button secondary small" data-live-apply>시험 조건 적용</button></form>`;
  const collect=()=>{
    setup.day=Number($('[data-live-day]',root).value);setup.locationId=$('[data-live-location]',root).value;
    $$('[data-live-inventory]',root).forEach(input=>setup.inventory[input.dataset.liveInventory]=Number(input.value));
    $$('[data-live-flag-value]',root).forEach(input=>{
      const text=input.value.trim();let value=text;
      try{const parsed=JSON.parse(text);if(['boolean','number','string'].includes(typeof parsed)&&Number.isFinite(typeof parsed==='number'?parsed:0))value=parsed;}catch{}
      setup.flags[input.dataset.liveFlagValue]=value;
    });
  };
  root.oninput=collect;root.onchange=collect;
  $('[data-live-add-item]',root).onclick=()=>{collect();const id=$('[data-live-item]',root).value;if(id){setup.inventory[id]=(setup.inventory[id]??0)+1;renderLivePreviewSettings(true);}};
  $('[data-live-add-flag]',root).onclick=()=>{collect();const id=$('[data-live-flag]',root).value;if(id){setup.flags[id]=true;renderLivePreviewSettings(true);}};
  $$('[data-live-remove-flag]',root).forEach(button=>button.onclick=()=>{collect();delete setup.flags[button.dataset.liveRemoveFlag];renderLivePreviewSettings(true);});
  $('form',root).onsubmit=event=>{event.preventDefault();if(!$('form',root).reportValidity())return;collect();requestLivePreview({setup:{day:setup.day,locationId:setup.locationId,inventory:structuredClone(setup.inventory),flags:structuredClone(setup.flags)}});};
}
function livePreviewFlagEntries() {
  const entries=new Map(flagEntries());entries.set('opening_seen','프롤로그 완료');
  const visit=value=>{
    if(!value || typeof value!=='object')return;
    if(typeof value.flag==='string' && !entries.has(value.flag))entries.set(value.flag,flagLabel(value.flag));
    Object.values(value).forEach(visit);
  };
  visit(state.document.stories);visit(state.document.locations);
  return [...entries];
}
