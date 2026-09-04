/* Read-only index: organization never changes authored IDs or execution data. */
function studioGraphNodes(story) {
  return [...story.scenes, ...(story.native ? story.actions.map(action=>({...action,title:action.label,paragraphs:[],graphAction:true})) : [])];
}
function studioSearchValue(value, document) {
  return JSON.stringify(value).replace(/\{\{item:([^|}]+)(?:\|[^}]+)?\}\}/g, (match,id)=>document.items.find(item=>item.id===id)?.name??id).toLowerCase();
}
function studioStoryPeople(story, people) {
  const text = JSON.stringify([story.title, story.scenes, story.actions]);
  return people.filter(person => story.personIds?.includes(person.id) || text.includes(`"${person.id}"`) || [person.name, person.name.split(/\s+/)[0]].some(name => name.length > 1 && text.includes(name)));
}
function studioStorySearchText(story, document) {
  return studioSearchValue([story, document.locations.find(l => l.id === story.locationId)?.name, studioStoryPeople(story, document.people).map(p => p.name)], document);
}
function studioSceneCategory(story, scene) {
  if (!story.native || story.native === 'event') return '주요 이야기';
  if (scene.choices.some(c => c.craftingRecipe) || /crafting|cooking|workbench/.test(scene.id)) return '제작·요리';
  if (scene.conditions.some(c => c.type === 'active_stock_node')) return '탐색·수집';
  if (scene.introFlag || /(?:first_intro|repeat_intro|repeat_prequest|repeat_postquest|prologue_repeat)$/.test(scene.id)) return '지역 소개';
  return '사건·행동 결과';
}
function studioLibraryGroups(document) {
  const groups = new Map();
  for (const story of document.stories) {
    for (const scene of story.scenes) {
      const category = studioSceneCategory(story, scene);
      const title = story.native === 'region' ? scene.title : story.title;
      const key = JSON.stringify([story.id, category, title]);
      if (!groups.has(key)) groups.set(key, { story, title, category, scenes: [], people: studioStoryPeople(story, document.people) });
      groups.get(key).scenes.push(scene);
    }
    if (!story.scenes.length) groups.set(story.id, { story, title: story.title, category: '주요 이야기', scenes: [], people: studioStoryPeople(story, document.people) });
  }
  return [...groups.values()].map(group=>({...group,people:studioStoryPeople({...group.story,scenes:group.scenes,actions:[]},document.people)}));
}
function studioContentLinks(document) {
  const scenes = document.stories.flatMap(story => story.scenes.map(scene => ({story, scene})));
  const edges = [];
  const add = (source, sceneId, label, conditional = false) => {
    const target = scenes.find(row => row.scene.id === sceneId);
    if (target) edges.push({ ...source, to: sceneId, targetStoryId: target.story.id, label, conditional });
  };
  for (const story of document.stories) {
    const sources = [...story.scenes.flatMap(scene => scene.choices.map(choice => ({ scene, choice }))), ...story.actions.map(choice => ({ choice }))];
    for (const {scene, choice} of sources) {
      const source = { from: scene?.id ?? choice.id, storyId: story.id, choiceId: choice.id, action: !scene };
      if (choice.nextSceneId) add(source, choice.nextSceneId, choice.label);
      const targetStory = document.stories.find(s => s.id === (choice.nextStoryId ?? choice.nextEventId));
      if (targetStory?.scenes[0]) add(source, targetStory.scenes[0].id, choice.label);
      const walk = (effects, random = false) => {
        for (const effect of effects ?? []) {
          if (effect.type === 'set_scene') add(source, effect.sceneId, choice.label, random);
          if (effect.type === 'set_random_scene') for (const row of scenes.filter(r => effect.sceneIds ? effect.sceneIds.includes(r.scene.id) : r.scene.tags?.includes(effect.tag))) add(source, row.scene.id, `${choice.label} · 무작위 결과`, true);
          if (effect.type === 'focus_stock_node') for (const row of scenes.filter(r => r.scene.conditions.some(c => c.type === 'active_stock_node' && c.nodeId === effect.nodeId))) add(source, row.scene.id, `${choice.label} · 남은 수량에 따라`, true);
          if (effect.type === 'random_outcome') effect.outcomes.forEach(outcome => walk(outcome.effects, true));
        }
      };
      walk(choice.effects);
      walk(choice.failureEffects, true);
    }
  }
  return edges.filter((edge, i) => edges.findIndex(other => other.from === edge.from && other.to === edge.to && other.choiceId === edge.choiceId && other.conditional === edge.conditional) === i);
}
if (typeof module !== 'undefined') module.exports = { studioLibraryGroups, studioStoryPeople, studioStorySearchText, studioContentLinks };

function showStoryLibrary() {
  synchronizeSharedChoices(); restoreWriterLibrary(); writer.library = true; state.tab = 'stories'; renderShell(); restoreWriterLibraryScroll();
}
function librarySceneSummary(scene) {
  const text = scene.blocks ? scene.blocks.map(b => b.text).join(' ') : scene.paragraphs.join(' ');
  return resolveItemTextPreview(text);
}
function libraryVariantLabel(scene, index) {
  const stock = scene.conditions.filter(c => ['stock_item_gte', 'stock_item_lt', 'stock_money_gte', 'stock_money_lt'].includes(c.type));
  if (stock.length) return stock.map(c => {
    const name = state.document.items.find(item => item.id === c.itemId)?.name ?? '돈';
    return `${name} ${c.amount}${c.itemId ? '개' : '원'} ${c.type.endsWith('gte') ? '이상' : '미만'}`;
  }).join(' · ');
  if (scene.introFlag) return '처음 방문';
  if (/repeat_intro|repeat_prequest|repeat_postquest/.test(scene.id)) return '다시 방문';
  return scene.conditions.length ? scene.conditions.map(conditionLabel).join(' · ') : `장면 ${index + 1}`;
}
function renderStoryLibrary() {
  const all = studioLibraryGroups(state.document);
  const query = state.query.trim().toLowerCase();
  const groups = all.filter(group => writerMatches(group.story))
    .filter(group => !writer.filterPerson || group.people.some(person=>person.id===writer.filterPerson))
    .filter(group => !writer.libraryCategory || group.category === writer.libraryCategory)
    .filter(group => !writer.librarySource || (writer.librarySource === 'existing' ? !!group.story.native : !group.story.native))
    .filter(group => !query || studioSearchValue([group.title, group.scenes, group.story.title, group.people.map(p=>p.name), state.document.locations.find(l=>l.id===group.story.locationId)?.name],state.document).includes(query));
  const actions=state.document.locations.flatMap(location=>studioRegionActions(state.document,location.id))
    .filter(entry=>!entry.story||writerMatches(entry.story))
    .filter(entry=>!writer.filterLocation||entry.locationId===writer.filterLocation)
    .filter(()=>!writer.libraryCategory||writer.libraryCategory==='지역 선택지')
    .filter(()=>writer.librarySource!=='authored')
    .filter(entry=>!query||studioSearchValue([entry.action,state.document.locations.find(location=>location.id===entry.locationId)?.name],state.document).includes(query));
  const categories = ['지역 선택지','주요 이야기','지역 소개','탐색·수집','제작·요리','사건·행동 결과'];
  ui.editorPanel.innerHTML = `<div class="writer-header"><div><span class="eyebrow">STORY LIBRARY</span><h2>이야기 모아보기</h2><p>기존 월드의 원고와 새 이야기를 지역별로 찾아보세요. 장면을 누르면 바로 편집할 수 있습니다.</p></div>${btn('새 이벤트 쓰기','libraryNew','primary')}</div>
    <div class="story-library"><div class="library-summary"><strong>${state.document.stories.filter(s=>s.native).length}개 기존 묶음</strong><span>원고 ${state.document.stories.reduce((n,s)=>n+s.scenes.length,0)}개</span><span>지역 행동 ${state.document.stories.reduce((n,s)=>n+s.actions.length,0)}개</span></div>
    <div class="library-controls"><label class="field"><span>원고·선택지 검색</span><input type="search" id="librarySearch" placeholder="예: 노파, 구조 신호, 낚시" value="${esc(state.query)}"></label><label class="field"><span>콘텐츠</span><select id="librarySource">${options([['','전체'],['existing','기존 이야기'],['authored','작성한 이야기']],writer.librarySource??'')}</select></label></div>
    <div class="library-categories" aria-label="이야기 분류">${['',...categories].map(category=>`<button type="button" class="pill-button ${(writer.libraryCategory??'')===category?'active':''}" data-library-category="${esc(category)}" aria-pressed="${(writer.libraryCategory??'')===category}">${esc(category||'전체')}</button>`).join('')}</div>
    <p class="muted" role="status">${groups.length}개 이야기와 ${actions.length}개 지역 선택지를 표시합니다. 같은 제목의 상황별 원고는 함께 묶었습니다.</p>
    ${groups.length||actions.length ? state.document.locations.map(location=> {
      const local=groups.filter(g=>g.story.locationId===location.id); const localActions=actions.filter(entry=>entry.locationId===location.id);if(!local.length&&!localActions.length)return '';
      return `<section class="library-region"><div class="section-title"><h3>${esc(location.name)}</h3><span class="badge">${local.length}개 이야기 · ${localActions.length}개 지역 선택지</span></div>${localActions.length?`<div class="region-choice-grid library-actions">${regionActionCards(localActions)}</div>`:""}<div class="library-grid">${local.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)).map(group=>`<article class="library-card"><div class="entity-meta"><span class="badge">${esc(group.category)}</span><span class="badge">${group.story.native?'기존 원고':'작성한 원고'}</span></div><h4>${esc(resolveItemTextPreview(group.title))}</h4><p>${esc((group.scenes[0]?librarySceneSummary(group.scenes[0]):'첫 장면을 작성해 주세요.').slice(0,125))}</p><small>${group.scenes.length}개 장면 · ${group.scenes.reduce((n,s)=>n+s.choices.length,0)}개 장면 선택지${group.story.actions.length?` · 지역 선택지 ${group.story.actions.length}개 공유`:""}${group.people.length?' · '+esc(group.people.map(p=>p.name).join(', ')):''}</small>
        ${group.scenes.length===1?`<button class="button ghost small" data-library-story="${esc(group.story.id)}" data-library-scene="${esc(group.scenes[0].id)}">원고 열기 →</button>`:group.scenes.length?`<details><summary>장면 ${group.scenes.length}개 펼치기</summary>${group.scenes.map((scene,i)=>`<button class="library-scene" data-library-story="${esc(group.story.id)}" data-library-scene="${esc(scene.id)}"><strong>${esc(resolveItemTextPreview(scene.title))}</strong><small>${esc(libraryVariantLabel(scene,i))}</small><span>${esc(librarySceneSummary(scene).slice(0,95))}</span></button>`).join('')}</details>`:`<button class="button ghost small" data-library-story="${esc(group.story.id)}">이벤트 열기 →</button>`}</article>`).join('')}</div></section>`;
    }).join('') : '<div class="empty-array">조건에 맞는 이야기가 없습니다. 검색어나 분류를 바꿔 주세요.</div>'}</div>`;
  const searchLibrary = e => { state.query=e.target.value;ui.searchInput.value=state.query;if(e.isComposing||writer.composing)return;const cursor=e.target.selectionStart;renderList();const input=$('#librarySearch');input.focus({preventScroll:true});try{input.setSelectionRange(cursor,cursor);}catch{} };
  $('#librarySearch').oninput = searchLibrary;
  $('#librarySearch').addEventListener('compositionend', e => { setTimeout(() => { if(e.target.isConnected)searchLibrary(e); },0); });
  $('#librarySource').onchange = e => { writer.librarySource=e.target.value;renderStoryLibrary(); };
  $$('[data-library-category]').forEach(button=>button.onclick=()=>{writer.libraryCategory=button.dataset.libraryCategory;renderStoryLibrary();});
  $$('[data-library-story]').forEach(button=>button.onclick=()=>{writer.graphMode='scene';writer.mobilePane='manuscript';go('stories',button.dataset.libraryStory,button.dataset.libraryScene);});
  $$('[data-region-action]').forEach(button=>button.onclick=()=>openRegionAction(button.dataset.actionLocation,button.dataset.regionAction));
  listen('libraryNew',writerAddEntity);
}
function renderLegacySceneContext(story, scene) {
  if(!story.native || !scene)return;
  const sectionRoot=document.createElement('section');sectionRoot.className='form-section legacy-scene-context';
  const incoming=studioContentLinks(state.document).filter(edge=>edge.to===scene.id);
  sectionRoot.innerHTML=`<div class="section-title"><h3>이 장면이 나오는 흐름</h3></div>${incoming.length?incoming.map((edge,i)=>`<button class="related-link" data-incoming="${i}">${esc(resolveItemTextPreview(edge.label))}<span>${edge.conditional?'조건별 결과':'이어서'}</span></button>`).join(''):'<p class="muted">지역 방문 또는 아래 조건에 따라 표시되는 장면입니다.</p>'}<details><summary>장면 표시 조건 ${scene.conditions.length}개</summary>${scene.conditions.map(c=>`<p class="muted">${esc(conditionLabel(c))}</p>`).join('')||'<p class="muted">별도 조건 없음</p>'}</details>`;
  $('#sceneInfo')?.closest('.form-section')?.before(sectionRoot);
  $$('[data-incoming]',sectionRoot).forEach(button=>button.onclick=()=>{
    const edge=incoming[Number(button.dataset.incoming)];go('stories',edge.storyId,edge.action?undefined:edge.from,edge.action?undefined:edge.choiceId);
    if(edge.action){const picker=$('#nativeAction');if(picker){picker.value=edge.choiceId;picker.onchange();$('#nativeActionEditor').scrollIntoView({block:'center'});}}
  });
}

function studioRegionActions(document, locationId) {
  const entries = new Map();
  const localStories = document.stories.filter(story=>story.locationId===locationId);
  for (const action of document.locations.find(location=>location.id===locationId)?.interactionChoices??[]) entries.set(action.id,{action,story:localStories.find(story=>story.native==='region'),locationId});
  // Stored Studio actions override the imported location copy, just as the compiler does.
  for (const story of localStories) for (const action of story.actions) entries.set(action.id,{action,story,locationId});
  return [...entries.values()];
}
function studioSyncAction(document, action) {
  for (const story of document.stories) story.actions=story.actions.map(existing=>existing.id===action.id?action:existing);
  for (const location of document.locations) location.interactionChoices=location.interactionChoices.map(existing=>existing.id===action.id?action:existing);
}
function regionActionCards(entries) {
  return entries.map(({action,locationId})=> {
    const conditions=action.conditions.filter(condition=>condition.type!=='location');
    const minutes=action.effects.filter(effect=>effect.type==='advance_time').reduce((total,effect)=>total+effect.minutes,0);
    const outcomes=action.effects.filter(effect=>effect.type==='random_outcome').reduce((total,effect)=>total+effect.outcomes.length,0);
    return `<button type="button" class="region-choice-card ${writer.selectedActionId===action.id?'active':''}" data-region-action="${esc(action.id)}" data-action-location="${esc(locationId)}"><span class="region-choice-kind">지역 선택지</span><strong>${esc(resolveItemTextPreview(action.label))}</strong><span class="region-reward-summary" data-region-reward-summary>${esc(studioChoiceResultSummary(state.document,action))}</span><span>${esc(resolveItemTextPreview(action.outcomeHint||'이 지역에서 실행할 수 있는 행동입니다.'))}</span><small>${esc(conditions.length?conditions.map(conditionLabel).join(' · '):'별도 조건 없음')}${minutes?` · ${minutes}분 소요`:''}${outcomes?` · 결과 ${outcomes}가지`:''}</small><b>선택지 편집 →</b></button>`;
  }).join('');
}
function regionActionSection(entries, editorId, locationId) {
  return section('이 지역에서 할 수 있는 선택',`<p class="muted">게임에 표시되는 선택지입니다. 카드를 눌러 문구, 조건, 아이템 보상과 이어지는 결과를 편집하세요.</p><div class="region-choice-grid">${regionActionCards(entries)||'<p class="muted">등록된 지역 선택지가 없습니다. 아래 이벤트에서 새로운 이야기를 만들 수 있습니다.</p>'}</div><div id="${editorId}"></div>`, `<button type="button" class="button primary small" data-new-region-action="${esc(locationId??entries[0]?.locationId??'')}">선택지 추가</button>`);
}
function openRegionAction(locationId, actionId) {
  writer.selectedActionId=actionId;writer.mobilePane='manuscript';go('locations',locationId);
  $('#regionActionEditor')?.scrollIntoView({block:'start'});
  $('#regionActionEditor [data-w="label"]')?.focus({preventScroll:true});
}
function bindRegionActions(entries, root, editorId) {
  const create=root.querySelector("[data-new-region-action]");if(create)create.onclick=()=>addRegionAction(create.dataset.newRegionAction);
  const render = entry => {
    writer.selectedActionId=entry.action.id;
    $$('[data-region-action]',root).forEach(button=>button.classList.toggle('active',button.dataset.regionAction===entry.action.id));
    renderRegionActionEditor(entry,$(`#${editorId}`));
  };
  $$('[data-region-action]',root).forEach(button=>button.onclick=()=>{const entry=entries.find(row=>row.action.id===button.dataset.regionAction);if(entry){render(entry);$(`#${editorId}`).scrollIntoView({block:'start'});$(`#${editorId} [data-w="label"]`)?.focus({preventScroll:true});}});
  const selected=entries.find(entry=>entry.action.id===writer.selectedActionId);
  if(selected)render(selected);
}
function deleteRegionAction(entry) {
  if (writer.composing) return;
  const location = state.document.locations.find(row => row.id === entry.locationId);
  if (!location) return;
  const label = resolveItemTextPreview(entry.action.label);
  if (!window.confirm(`‘${label}’ 선택지를 ${location.name}에서 삭제하시겠습니까?\n\n이 지역에서 사용하는 선택지이며, 다른 지역의 같은 선택지와 연결된 결과 장면 원고는 유지됩니다. 실행 취소로 복원할 수 있습니다.`)) return;
  // Remove both stored copies so a later render or shared-action sync cannot restore it.
  location.interactionChoices = location.interactionChoices.filter(action => action.id !== entry.action.id);
  for (const story of state.document.stories) {
    if (story.locationId === location.id) story.actions = story.actions.filter(action => action.id !== entry.action.id);
  }
  writer.activeAction = null;
  writer.selectedActionId = null;
  markDirty(); renderEditor();
  showToast('이 지역의 선택지를 삭제했습니다. 실행 취소로 복원할 수 있습니다.');
}
function renderRegionActionEditor(entry, root) {
  const {action,story}=entry;
  writer.activeAction=action;
  const links=studioContentLinks(state.document).filter(link=>link.action&&link.choiceId===action.id);
  const outcomes=action.effects.filter(effect=>effect.type==='random_outcome').flatMap(effect=>effect.outcomes);
  const allScenes=state.document.stories.flatMap(owner=>owner.scenes.map(scene=>[scene.id,`${owner.title} / ${scene.title}`]));
  root.innerHTML=`<div class="region-action-heading"><h3>${esc(resolveItemTextPreview(action.label))} · 선택지 편집</h3><span class="badge">지역 전체에서 사용하는 선택지</span></div><div data-action-flow></div><div data-action-info class="field-grid">${field('선택지 문구','label',resolveItemTextPreview(action.label))}${field('보조 안내','outcomeHint',resolveItemTextPreview(action.outcomeHint))}${select('행동 종류','type',[['search','수색'],['explore','탐색'],['talk','대화'],['rest','휴식'],['use','사용'],['travel','이동']],action.type,false)}${check('게임에서 보상·결과 안내 표시','showOutcomeHint',action.showOutcomeHint??true)}${select('조건이 부족할 때','presentationMode',[['when_conditions_met','선택지 숨기기'],['always','선택지를 표시하고 실행 제한']],action.presentationMode,false)}</div><div class="field-grid"><label class="field"><span>적용 숙련도</span><select data-action-skill aria-label="적용 숙련도">${options([['','없음'],['fishing','낚시'],['exploration','탐색'],['collection','수집']],action.skillUse?.skillId??'')}</select></label><label class="field"><span>소요 시간 (분)</span><input type="number" min="0" max="1440" step="1" data-action-minutes aria-label="소요 시간" value="${action.effects.filter(effect=>effect.type==='advance_time').reduce((sum,effect)=>sum+effect.minutes,0)}"></label><label class="field"><span>하루 최대 실행 횟수 · 0은 제한 없음</span><input type="number" min="0" step="1" data-action-limit aria-label="하루 최대 실행 횟수" value="${action.dailyLimit?.max??0}"></label></div><div data-action-conditions>${arrayEditorHtml(action,'conditions','condition','실행 조건','모든 조건을 충족해야 실행됩니다.')}</div>
    <div data-action-outcomes></div>
    <details class="advanced"><summary>조건 미충족 시 결과</summary><div data-action-effects>${arrayEditorHtml(action,'failureEffects','effect','실패 시 결과','실행 조건을 충족하지 못한 경우의 결과입니다.')}</div></details>`;
  $('.region-action-heading',root).insertAdjacentHTML('beforeend',btn('선택지 삭제','deleteRegionAction','danger'));
  listen('deleteRegionAction',()=>deleteRegionAction(entry),root);
  renderActivityFlow(action,$('[data-action-flow]',root),story);
  bindWriter($('[data-action-info]',root),action,(key,value)=>{if(key==='nextSceneId'&&!value)delete action.nextSceneId;});
  $('[data-action-skill]',root).onchange=e=>{if(e.target.value)action.skillUse={skillId:e.target.value};else delete action.skillUse;markDirty();renderEditor();};
  $('[data-action-minutes]',root).oninput=e=>{if(!e.target.value||!e.target.validity.valid)return;studioReplaceEffects(action,['advance_time'],Number(e.target.value)?[{type:'advance_time',minutes:Number(e.target.value)}]:[]);markDirty();};
  $('[data-action-limit]',root).oninput=e=>{if(!e.target.value||!e.target.validity.valid)return;const max=Number(e.target.value);if(max)action.dailyLimit={key:action.dailyLimit?.key??`studio_daily_${action.id}`,max};else delete action.dailyLimit;markDirty();};
  renderOutcomeEditor(action,$('[data-action-outcomes]',root),story);
  bindArrayEditors($('[data-action-conditions]',root),action);
  bindArrayEditors($('[data-action-effects]',root),action);

  $$('[data-action-scene]',root).forEach(button=>button.onclick=()=>{writer.graphMode='scene';go('stories',button.dataset.actionStory,button.dataset.actionScene);$('#sceneInfo')?.scrollIntoView({block:'start'});});
  enableReferenceSearch(root);
  if(typeof syncLivePreviewEditor==='function')syncLivePreviewEditor();
}
if (typeof module !== 'undefined') Object.assign(module.exports,{studioRegionActions,studioSyncAction});
