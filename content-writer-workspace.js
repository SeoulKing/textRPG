/* Manuscript-first presentation. Existing advanced editors keep their original bindings. */
function writerSelection() {
  return { tab: state.tab, selectedId: state.selectedId, selectedSceneId: state.selectedSceneId, selectedChoiceId: state.selectedChoiceId, library: writer.library };
}
function updateWriterHistoryButtons() {
  $$('[data-history]').forEach(button => button.disabled = writer.composing || !(button.dataset.history === 'undo' ? writer.history?.canUndo : writer.history?.canRedo));
}
function restoreWriterHistory(direction) {
  if (writer.composing) return;
  const itemBookmark = StudioItemTextEditor.bookmark();
  const snapshot = writer.history?.move(direction);
  if (!snapshot) return;
  const scroll = window.scrollY;
  state.document = snapshot.document;
  const { library, ...selection } = snapshot.selection;
  Object.assign(state, selection); writer.library = library; writer.activeAction = null;
  writer.restoring = true;
  try { markDirty(); renderShell(); } finally { writer.restoring = false; }
  window.scrollTo({ top: scroll }); updateWriterHistoryButtons(); StudioItemTextEditor.restore(itemBookmark);
  showToast(direction < 0 ? '실행을 취소했습니다.' : '다시 실행했습니다.');
}
function installWriterWorkspace() {
  const toolbar = document.createElement('div'); toolbar.className = 'history-toolbar';
  toolbar.innerHTML = '<button type="button" class="button ghost small" data-history="undo" title="Ctrl+Z" disabled>실행 취소</button><button type="button" class="button ghost small" data-history="redo" title="Ctrl+Shift+Z / Ctrl+Y" disabled>다시 실행</button>';
  $('.topbar-actions').prepend(toolbar);
  $$('[data-history]', toolbar).forEach(button => button.onclick = () => restoreWriterHistory(button.dataset.history === 'undo' ? -1 : 1));
  const remember = () => writer.history?.visit(writerSelection());
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('pointerdown', event => {
    $$('.writer-block-tools[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener('keydown', event => {
    remember();
    if (event.isComposing || writer.composing || $('#writerModal') || event.target.closest?.('#writerLivePreview') || event.target.matches?.('input[type="search"], .reference-search, [data-new-scene-title]') || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') { event.preventDefault(); restoreWriterHistory(key === 'y' || event.shiftKey ? 1 : -1); }
  }, true);
  document.addEventListener('input', event => {
    // The element identity groups typing, but never groups structural button actions.
    writer.inputGroup = event.studioHistoryBoundary ? undefined : event.target;
    clearTimeout(writer.inputGroupTimer);
    writer.inputGroupTimer = setTimeout(() => { writer.inputGroup = undefined; }, 0);
  }, true);
  document.addEventListener('compositionstart', event => {
    if(!ui.editorPanel.contains(event.target))return;
    writer.composing = true; clearTimeout(writer.timer); clearTimeout(writer.graphTimer); updateWriterHistoryButtons();
  }, true);
  document.addEventListener('compositionend', event => {
    if(!ui.editorPanel.contains(event.target))return;
    writer.composing = false;
    if (state.document && state.dirty) writerChanged();
    updateWriterHistoryButtons();
  });
  ui.tabs.forEach(tab => tab.addEventListener('click', () => {
    if (writer.library && state.tab === 'stories') captureWriterLibrary();
    synchronizeSharedChoices();
  }, true));
  installStudioResourceNavigation();
}
function installStudioResourceNavigation() {
  const nav = $('.section-nav');
  if (!nav || $('.resource-nav-group', nav)) return;
  const storyButton = $('[data-tab="stories"]', nav);
  const resourceButtons = ['locations','people','items','recipes'].map(tab => $(`[data-tab="${tab}"]`, nav)).filter(Boolean);
  const details = document.createElement('details'); details.className = 'resource-nav-group';
  details.innerHTML = '<summary>기존 자원</summary><div class="resource-nav-items"></div>';
  const items = $('.resource-nav-items', details);
  resourceButtons.forEach(button => items.append(button));
  if (storyButton) storyButton.after(details); else nav.prepend(details);
}
function setWriterMode(mode) {
  if (!['author','advanced'].includes(mode) || writer.mode === mode) return;
  synchronizeSharedChoices();
  writer.mode = mode;
  localStorage.setItem('textrpg_writer_mode', mode);
  if (mode === 'advanced') writer.guide = null;
  renderEditor();
}
function updateStudioAuthorMode() {
  const author = writer.mode !== 'advanced';
  const storyView = state.tab === 'stories' && !writer.library && Boolean(selectedEntity());
  document.body.classList.toggle('studio-author-mode', author);
  document.body.classList.toggle('studio-advanced-mode', !author);
  document.body.classList.toggle('studio-story-view', storyView);
  document.body.classList.toggle('studio-library-view', state.tab === 'stories' && !storyView);
  document.body.classList.toggle('studio-resource-view', state.tab !== 'stories');
  document.body.classList.toggle('studio-guide-active', author && storyView && writer.guide?.storyId === state.selectedId);
  if (state.tab === 'stories') {
    ui.listTitle.textContent = storyView ? '장면' : '이야기';
    ui.listEyebrow.textContent = '';
    ui.addButton.setAttribute('aria-label', '새 이야기 만들기');
    if (!storyView) {
      const header = $('.writer-header',ui.editorPanel);
      if (header && !$('.writer-mode-switch',header)) {
        const actions = document.createElement('div'); actions.className='writer-toolbar library-header-actions';
        actions.innerHTML=writerModeMarkup();
        const create=$('[data-do="libraryNew"]',header); if(create)actions.append(create);
        header.append(actions); bindWriterModeControls(actions);
      }
    }
  }
  const resources = $('.resource-nav-group');
  if (resources) resources.open = state.tab !== 'stories';
  const publishWide = $('.wide-label', ui.publishButton), publishNarrow = $('.narrow-label', ui.publishButton);
  if (publishWide) publishWide.textContent = author ? '검토 및 배포' : '게임에 배포';
  if (publishNarrow) publishNarrow.textContent = author ? '검토' : '배포';
  const previewTitle = $('.live-preview-header h2'); if (previewTitle) previewTitle.textContent = author ? '플레이어 화면' : '게임 미리보기';
}
function writerModeMarkup() {
  return `<div class="writer-mode-switch" role="group" aria-label="편집 방식"><button type="button" data-writer-mode="author" aria-pressed="${writer.mode !== 'advanced'}">작가 모드</button><button type="button" data-writer-mode="advanced" aria-pressed="${writer.mode === 'advanced'}">고급 모드</button></div>`;
}
function bindWriterModeControls(root) {
  $$('[data-writer-mode]', root).forEach(button => button.onclick = () => setWriterMode(button.dataset.writerMode));
}
function captureWriterLibrary() {
  if (!writer.library || state.tab !== 'stories') return;
  writer.libraryContext = { query: state.query, category: writer.libraryCategory, source: writer.librarySource,
    location: writer.filterLocation, person: writer.filterPerson, status: writer.filterStatus,
    scroll: window.scrollY, panelScroll: ui.editorPanel.scrollTop, listScroll: ui.entityList.scrollTop,
    open: $$('.library-card details[open]').map(detail => $('.library-scene', detail)?.dataset.libraryScene).filter(Boolean) };
}
function restoreWriterLibrary() {
  const context = writer.libraryContext;
  if (!context) return;
  state.query = context.query; ui.searchInput.value = context.query;
  Object.assign(writer, { libraryCategory: context.category, librarySource: context.source, filterLocation: context.location, filterPerson: context.person, filterStatus: context.status });
}
function restoreWriterLibraryScroll() {
  const context = writer.libraryContext;
  if (!context) return;
  $$('.library-card details').forEach(detail => detail.open = context.open.includes($('.library-scene', detail)?.dataset.libraryScene));
  ui.editorPanel.scrollTop = context.panelScroll; ui.entityList.scrollTop = context.listScroll; window.scrollTo({ top: context.scroll });
}
function sceneVariantName(story, scene) {
  if (story.scenes.filter(other => other.title === scene.title).length < 2) return '';
  return libraryVariantLabel(scene, story.scenes.indexOf(scene));
}
function authorChoiceDestinationReady(story, choice) {
  const mode = StudioWriterTools.destination(choice);
  if (mode === 'advanced' || mode === 'end') return true;
  if (mode === 'scene') return story.scenes.some(scene => scene.id === choice.nextSceneId);
  if (mode === 'story') return state.document.stories.some(candidate => candidate.id === (choice.nextStoryId ?? choice.nextEventId));
  return false;
}
function authorSceneStatus(story, scene) {
  const hasCopy = (scene.blocks ?? scene.paragraphs.map(text => ({text}))).some(block => String(block.text ?? '').trim());
  if (!hasCopy) return {key:'empty', label:'원고 필요'};
  if (!scene.terminal && !scene.choices.length && !(story.actions?.length)) return {key:'incomplete', label:'선택지 미완성'};
  if (!scene.choices.length && story.actions?.length) return {key:'copy', label:'원고 있음'};
  if (scene.choices.some(choice => !String(choice.label ?? '').trim() || !authorChoiceDestinationReady(story, choice))) return {key:'error', label:'연결 오류'};
  return {key:'complete', label:'완료'};
}
function renderWriterSceneNav() {
  $('#writerSceneNav')?.remove();
  const story = state.tab === 'stories' && !writer.library ? selectedEntity() : null;
  $('.content-list-panel').classList.toggle('has-scene-nav', Boolean(story));
  if (!story) return;
  const nav = document.createElement('nav'); nav.id = 'writerSceneNav'; nav.setAttribute('aria-label', '현재 이야기의 장면');
  nav.innerHTML = `<div class="section-title"><strong>${esc(story.title)}</strong>${btn('＋ 장면', 'navAddScene')}</div>${story.scenes.map((scene, index) => { const status = authorSceneStatus(story, scene); return `<button type="button" class="scene-nav-item ${scene.id === state.selectedSceneId ? 'active' : ''}" data-nav-scene="${esc(scene.id)}" ${scene.id === state.selectedSceneId ? 'aria-current="true"' : ''}><span>${index + 1}. ${esc(resolveItemTextPreview(scene.title || '제목 없는 장면'))}</span><small>${esc(sceneVariantName(story, scene) || (scene.terminal ? '종료 장면' : `${scene.choices.length}개 선택지`))}</small><em class="scene-status ${status.key}">${status.label}</em></button>`; }).join('')}`;
  ui.entityList.before(nav);
  $$('[data-nav-scene]', nav).forEach(button => button.onclick = () => go('stories', story.id, button.dataset.navScene));
  listen('navAddScene', () => { const scene = newScene(story.locationId); story.scenes.push(scene); go('stories', story.id, scene.id); markDirty(); }, nav);
}
function writerChoiceSummary(choice) {
  const result=studioChoiceResultSummary(state.document,choice);
  const minutes=(choice.effects??[]).filter(effect=>effect.type==='advance_time').reduce((sum,effect)=>sum+effect.minutes,0);
  return [result,minutes?`${minutes}분 경과`:'',choice.failureEffects?.length?`조건 미충족 결과 ${choice.failureEffects.length}개`:''].filter(Boolean).join(' · ');
}
function authorConditionText(condition) {
  const item = state.document.items.find(entry => entry.id === condition.itemId)?.name ?? '삭제된 아이템';
  const location = state.document.locations.find(entry => entry.id === condition.locationId)?.name ?? '삭제된 지역';
  const stat = {hp:'체력', mind:'정신력', energy:'기력'}[condition.stat] ?? '능력치';
  const progress = flagEntries().find(([id]) => id === condition.flag)?.[1];
  const labels = {
    has_item:`${item}을(를) ${condition.amount ?? 1}개 가지고 있을 때`,
    not_has_item:`${item}이(가) ${condition.amount ?? 1}개보다 적을 때`,
    day_gte:`${condition.value ?? 1}일째부터`, day_lt:`${condition.value ?? 1}일째 전까지`,
    money_gte:`돈을 ${(condition.amount ?? 0).toLocaleString('ko-KR')}원 이상 가지고 있을 때`,
    stat_gte:`${stat}이(가) ${condition.value ?? 0} 이상일 때`,
    location_visited:`${location}에 가 본 뒤`, location:`${location}에 있을 때`,
    flag:progress ? `${progress} 뒤` : '고급 이야기 조건을 충족했을 때',
    flag_not:progress ? `${progress} 전` : '보존된 고급 이야기 조건을 충족하지 않았을 때',
  };
  return labels[condition.type] ?? '고급 조건';
}
function authorEffectText(effect) {
  const item = state.document.items.find(entry => entry.id === effect.itemId)?.name ?? '삭제된 아이템';
  const location = state.document.locations.find(entry => entry.id === effect.locationId)?.name ?? '삭제된 지역';
  const stat = {hp:'체력', mind:'정신력', energy:'기력'}[effect.stat] ?? '능력치';
  const value = Number(effect.value ?? effect.amount ?? 0);
  const labels = {
    add_item:`${item} ${effect.amount ?? 1}개 받기`, remove_item:`${item} ${effect.amount ?? 1}개 사용`,
    change_stat:`${stat} ${value >= 0 ? '+' : ''}${value}`, change_money:`돈 ${value >= 0 ? '+' : ''}${value.toLocaleString('ko-KR')}원`,
    advance_time:`${effect.minutes ?? 0}분 경과`, travel:`${location}(으)로 이동`,
    log:effect.message ? `기록: ${effect.message}` : '기록 남기기',
  };
  return labels[effect.type] ?? '고급 결과';
}
function authorResultSummary(choice) {
  const results = (choice.effects ?? []).filter(effect => effect.type !== 'random_outcome').map(authorEffectText);
  const outcomeCount = (choice.effects ?? []).filter(effect => effect.type === 'random_outcome').reduce((total,effect)=>total+(effect.outcomes?.length ?? 0),0);
  if (outcomeCount) results.push(`확률에 따른 결과 ${outcomeCount}가지`);
  if (choice.failureEffects?.length) results.push(`조건을 못 맞췄을 때 결과 ${choice.failureEffects.length}개`);
  if (choice.endsStory) results.push('이야기 종료');
  return results.join(' · ') || '별도 결과 없음';
}
function authorAdvancedCount(choice) {
  let count = [...(choice.conditions ?? []), ...(choice.failureConditions ?? [])].filter(entry => !authorConditionIsSimple(entry)).length;
  count += [...(choice.effects ?? []), ...(choice.failureEffects ?? [])].filter(entry => !authorEffectIsSimple(entry)).length;
  if (choice.endsStory && (choice.nextSceneId || choice.nextStoryId || choice.nextEventId)) count++;
  return count;
}
function authorConditionIsSimple(condition) {
  if (['flag','flag_not'].includes(condition.type)) return flagEntries().some(([id]) => id === condition.flag);
  return ['has_item','not_has_item','day_gte','day_lt','money_gte','stat_gte','location_visited','location'].includes(condition.type);
}
function authorEffectIsSimple(effect) {
  return ['add_item','remove_item','change_stat','change_money','advance_time','travel','log','random_outcome'].includes(effect.type);
}
function authorChoiceDetailLabel(choice) {
  const outcomes=(choice.effects??[]).filter(effect=>effect.type==='random_outcome').reduce((total,effect)=>total+(effect.outcomes?.length??0),0);
  const advanced=authorAdvancedCount(choice);
  if (outcomes && advanced) return `확률 결과 ${outcomes}가지 · 고급 설정 ${advanced}개 보존`;
  if (outcomes) return `확률 결과 ${outcomes}가지와 세부 설정`;
  return advanced ? `고급 설정 ${advanced}개가 보존되어 있습니다` : '세부 조건·보상 설정';
}
function protectAuthorAdvancedRows(root, owner) {
  let hidden = 0;
  for (const [arrayName, simple] of [['conditions',authorConditionIsSimple],['failureConditions',authorConditionIsSimple],['effects',authorEffectIsSimple],['failureEffects',authorEffectIsSimple]]) {
    (owner[arrayName] ?? []).forEach((entry,index) => {
      if (simple(entry)) return;
      const control = $(`[data-array-type="${arrayName}"][data-index="${index}"]`,root) ?? $(`[data-array="${arrayName}"][data-index="${index}"]`,root);
      const row = control?.closest('.inline-editor');
      if (row) { row.hidden=true; hidden++; }
    });
  }
  if (hidden) root.insertAdjacentHTML('afterbegin', `<p class="author-preserved-note">고급 설정 ${hidden}개가 보존되어 있습니다. 내용은 고급 모드에서 확인하고 수정할 수 있습니다.</p>`);
}
function authorResourceField(id, label, entries, value) {
  return `<label class="field author-resource-field"><span>${esc(label)}</span><input type="search" data-resource-search="${esc(id)}" placeholder="이름으로 찾기" aria-label="${esc(label)} 검색"><select id="${esc(id)}">${options(entries, value)}</select></label>`;
}
function bindAuthorResourceSearch(root) {
  $$('[data-resource-search]', root).forEach(input => {
    const select = $(`#${CSS.escape(input.dataset.resourceSearch)}`, root);
    input.oninput = () => {
      const query = input.value.replaceAll(' ', '').toLowerCase();
      for (const option of select.options) option.hidden = Boolean(query) && !option.textContent.replaceAll(' ', '').toLowerCase().includes(query);
    };
  });
}
function openAuthorConditionBuilder(owner) {
  const kinds = [['has_item','아이템을 가지고 있을 때'],['not_has_item','아이템이 부족할 때'],['day_gte','특정 일차부터'],['day_lt','특정 일차 전까지'],['flag','이전 이야기를 본 뒤'],['flag_not','이전 이야기를 보기 전'],['location_visited','지역에 가 본 뒤'],['location','현재 지역이 맞을 때'],['money_gte','돈을 일정 금액 가지고 있을 때'],['stat_gte','능력치가 일정 수치 이상일 때']];
  modal('선택 조건 추가', `<form id="authorRuleForm"><label class="field"><span>언제 이 선택지를 보여 줄까요?</span><select id="authorRuleKind">${options(kinds,'has_item')}</select></label><div id="authorRuleFields"></div><div class="writer-toolbar"><button type="submit" class="button primary">조건 추가</button></div></form>`, dialog => {
    const kind = $('#authorRuleKind', dialog), fields = $('#authorRuleFields', dialog);
    const draw = () => {
      if (['has_item','not_has_item'].includes(kind.value)) fields.innerHTML = authorResourceField('authorRuleItem','아이템',state.document.items.map(item => [item.id,item.name]),state.document.items[0]?.id) + '<label class="field"><span>수량</span><input id="authorRuleAmount" type="number" min="1" value="1" required></label>';
      else if (['day_gte','day_lt'].includes(kind.value)) fields.innerHTML = '<label class="field"><span>일차</span><input id="authorRuleValue" type="number" min="1" value="1" required></label>';
      else if (['flag','flag_not'].includes(kind.value)) fields.innerHTML = authorResourceField('authorRuleProgress','이전 진행',flagEntries(),flagEntries()[0]?.[0]);
      else if (['location','location_visited'].includes(kind.value)) fields.innerHTML = authorResourceField('authorRuleLocation','지역',locEntries(),state.document.locations[0]?.id);
      else if (kind.value === 'money_gte') fields.innerHTML = '<label class="field"><span>필요한 돈</span><input id="authorRuleAmount" type="number" min="0" value="1000" required></label>';
      else fields.innerHTML = `<label class="field"><span>능력치</span><select id="authorRuleStat">${options([['hp','체력'],['mind','정신력'],['energy','기력']],'energy')}</select></label><label class="field"><span>최소 수치</span><input id="authorRuleValue" type="number" min="0" value="1" required></label>`;
      bindAuthorResourceSearch(fields);
    };
    kind.onchange = draw; draw();
    $('#authorRuleForm', dialog).onsubmit = event => {
      event.preventDefault();
      const type = kind.value; let condition = {type};
      if (['has_item','not_has_item'].includes(type)) condition = {type,itemId:$('#authorRuleItem',dialog)?.value ?? '',amount:Number($('#authorRuleAmount',dialog)?.value ?? 1)};
      else if (['day_gte','day_lt'].includes(type)) condition = {type,value:Number($('#authorRuleValue',dialog)?.value ?? 1)};
      else if (['flag','flag_not'].includes(type)) condition = {type,flag:$('#authorRuleProgress',dialog)?.value ?? ''};
      else if (['location','location_visited'].includes(type)) condition = {type,locationId:$('#authorRuleLocation',dialog)?.value ?? ''};
      else if (type === 'money_gte') condition = {type,amount:Number($('#authorRuleAmount',dialog)?.value ?? 0)};
      else condition = {type,stat:$('#authorRuleStat',dialog)?.value ?? 'energy',value:Number($('#authorRuleValue',dialog)?.value ?? 1)};
      if ((condition.itemId === '' || condition.flag === '' || condition.locationId === '')) return showToast('사용할 기존 자원을 선택해 주세요.', true);
      (owner.conditions ??= []).push(condition); writer.expandedChoice = null; synchronizeSharedChoices(owner); markDirty(); dialog.close(); renderEditor();
    };
  });
}
function openAuthorResultBuilder(owner) {
  const kinds = [['add_item','아이템 주기'],['remove_item','아이템 사용'],['change_stat','능력치 변경'],['change_money','돈 변경'],['advance_time','시간 경과'],['travel','지역 이동'],['log','플레이어 기록에 문장 남기기'],['complete_story','이야기를 마친 것으로 기록']];
  modal('플레이어 결과 추가', `<form id="authorResultForm"><label class="field"><span>선택한 뒤 무엇이 일어나나요?</span><select id="authorResultKind">${options(kinds,'add_item')}</select></label><div id="authorResultFields"></div><div class="writer-toolbar"><button type="submit" class="button primary">결과 추가</button></div></form>`, dialog => {
    const kind = $('#authorResultKind', dialog), fields = $('#authorResultFields', dialog);
    const draw = () => {
      if (['add_item','remove_item'].includes(kind.value)) fields.innerHTML = authorResourceField('authorResultItem','아이템',state.document.items.map(item => [item.id,item.name]),state.document.items[0]?.id) + '<label class="field"><span>수량</span><input id="authorResultAmount" type="number" min="1" value="1" required></label>';
      else if (kind.value === 'change_stat') fields.innerHTML = `<label class="field"><span>능력치</span><select id="authorResultStat">${options([['hp','체력'],['mind','정신력'],['energy','기력']],'energy')}</select></label><label class="field"><span>변화량</span><input id="authorResultValue" type="number" value="1" required></label>`;
      else if (kind.value === 'change_money') fields.innerHTML = '<label class="field"><span>변화 금액 · 줄어들면 음수</span><input id="authorResultAmount" type="number" value="1000" required></label>';
      else if (kind.value === 'advance_time') fields.innerHTML = '<label class="field"><span>흐르는 시간 · 분</span><input id="authorResultMinutes" type="number" min="1" value="15" required></label>';
      else if (kind.value === 'travel') fields.innerHTML = authorResourceField('authorResultLocation','이동할 지역',locEntries(),state.document.locations[0]?.id);
      else if (kind.value === 'log') fields.innerHTML = '<label class="field"><span>기록 문장</span><textarea id="authorResultMessage" required placeholder="플레이어가 확인할 짧은 문장"></textarea></label>';
      else fields.innerHTML = '<p class="author-rule-note">이 선택지를 실행하면 현재 이야기를 완료한 것으로 기록하고 종료합니다. 다음 장면 연결은 제거됩니다.</p>';
      bindAuthorResourceSearch(fields);
    };
    kind.onchange = draw; draw();
    $('#authorResultForm', dialog).onsubmit = event => {
      event.preventDefault(); const type = kind.value;
      try {
        if (type === 'complete_story') StudioWriterTools.connect(owner,'end');
        else {
          let effect = {type};
          if (['add_item','remove_item'].includes(type)) effect = {type,itemId:$('#authorResultItem',dialog)?.value ?? '',amount:Number($('#authorResultAmount',dialog)?.value ?? 1)};
          else if (type === 'change_stat') effect = {type,stat:$('#authorResultStat',dialog)?.value ?? 'energy',value:Number($('#authorResultValue',dialog)?.value ?? 0)};
          else if (type === 'change_money') effect = {type,amount:Number($('#authorResultAmount',dialog)?.value ?? 0)};
          else if (type === 'advance_time') effect = {type,minutes:Number($('#authorResultMinutes',dialog)?.value ?? 1)};
          else if (type === 'travel') effect = {type,locationId:$('#authorResultLocation',dialog)?.value ?? ''};
          else if (type === 'log') effect = {type,message:$('#authorResultMessage',dialog)?.value.trim() ?? ''};
          if (effect.itemId === '' || effect.locationId === '' || effect.message === '') return showToast('결과에 사용할 내용을 선택하거나 입력해 주세요.', true);
          (owner.effects ??= []).push(effect);
        }
        writer.expandedChoice = null; synchronizeSharedChoices(owner); markDirty(); dialog.close(); renderEditor();
      } catch (error) { showToast(error.message, true); }
    };
  });
}
function choiceDestinationMarkup(story, choice) {
  const mode = StudioWriterTools.destination(choice);
  const stock = studioStockDestinations(state.document, choice, story.locationId);
  const entries = [['','진행 방식 선택'],['scene','기존 장면 연결'],['new','새 장면 만들기'],['story','다른 이야기 연결'],['end','이야기 종료']];
  if (mode === 'advanced') {
    const travel=(choice.effects??[]).find(effect=>effect.type==='travel');
    const probability=(choice.effects??[]).some(effect=>effect.type==='random_outcome');
    const location=state.document.locations.find(entry=>entry.id===travel?.locationId)?.name;
    entries.unshift(['advanced',stock ? '남은 내용물에 따라 장면 연결' : probability ? '확률 결과에 따라 진행' : travel ? `${location ?? '선택한 지역'}(으)로 이동` : '보존된 고급 진행 사용']);
  }
  return `<label class="field"><span>다음 진행</span><select data-route-mode>${options(entries, mode)}</select></label><div data-route-target>${mode === 'scene' ? `<label class="field"><span>이어지는 장면</span><select data-route-scene>${options(story.scenes.map(scene => [scene.id, `${scene.title}${sceneVariantName(story, scene) ? ` · ${sceneVariantName(story, scene)}` : ''}`]), choice.nextSceneId)}</select></label>` : mode === 'story' ? `<label class="field"><span>이어지는 이야기</span><select data-route-story>${options(storyEntries(), choice.nextStoryId ?? choice.nextEventId)}</select></label>` : `<p class="muted">${mode === 'end' ? '현재 이야기의 완료를 기록하고 마칩니다.' : mode === 'advanced' ? (stock ? '위 상황 카드에서 조건별 연결을 확인하고 원고를 열 수 있습니다.' : '조건·확률 결과 안의 이동도 그대로 실행됩니다. 고급 모드에서 확인할 수 있습니다.') : '다음에 이어질 장면이나 종료를 정해 주세요.'}</p>`}</div>`;
}
function bindChoiceDestination(root, story, choice) {
  const commit = (mode, id) => {
    try { StudioWriterTools.connect(choice, mode, id); synchronizeSharedChoices(choice); markDirty(); renderEditor(); }
    catch (error) { showToast(error.message, true); }
  };
  $('[data-route-mode]', root).onchange = event => {
    const mode = event.target.value, target = $('[data-route-target]', root);
    if (mode === '' || mode === 'advanced') { root.innerHTML = choiceDestinationMarkup(story, choice); bindChoiceDestination(root, story, choice); return; }
    if (StudioWriterTools.hasAdvancedRoute(choice)) {
      showToast('상세 설정의 이동 규칙을 먼저 확인해 주세요. 고급 규칙은 자동으로 지우지 않습니다.', true);
      event.target.value = 'advanced'; return;
    }
    if (mode === 'end') return commit(mode);
    if (mode === 'new') {
      target.innerHTML = '<label class="field"><span>새 장면 제목</span><input data-new-scene-title placeholder="장면 제목"></label>' + btn('만들고 연결', 'cardNewScene');
      listen('cardNewScene', () => {
        const title = $('[data-new-scene-title]', target).value.trim();
        if (!title) return showToast('새 장면 제목을 입력해 주세요.', true);
        const next = newScene(story.locationId, title); story.scenes.push(next);
        StudioWriterTools.connect(choice, 'scene', next.id); synchronizeSharedChoices(choice); markDirty(); renderEditor();
      }, target); return;
    }
    target.innerHTML = `<label class="field"><span>${mode === 'scene' ? '이어지는 장면' : '이어지는 이야기'}</span><select data-route-${mode}>${options(mode === 'scene' ? story.scenes.map(scene => [scene.id, scene.title]) : storyEntries(), '', true)}</select></label>`;
    $('select', target).onchange = event => commit(mode, event.target.value);
  };
  const scenePicker = $('[data-route-scene]', root), storyPicker = $('[data-route-story]', root);
  if (scenePicker) scenePicker.onchange = event => commit('scene', event.target.value);
  if (storyPicker) storyPicker.onchange = event => commit('story', event.target.value);
}
function startStoryGuide(story, step = authorSuggestedGuideStep(story)) {
  writer.guide = {storyId:story.id, step:Math.max(1, Math.min(5, step))};
}
function authorSuggestedGuideStep(story) {
  const first = story.scenes[0];
  if (!story.title?.trim() || !state.document.locations.some(location => location.id === story.locationId)) return 1;
  if (!first?.title?.trim() || !(first.blocks ?? first.paragraphs.map(text => ({text}))).some(block => String(block.text ?? '').trim())) return 2;
  if (!first.choices.some(choice => String(choice.label ?? '').trim())) return 3;
  if (story.scenes.some(scene => scene.choices.some(choice => !authorChoiceDestinationReady(story, choice)))) return 4;
  return 5;
}
function authorStoryIssues(story) {
  const issues = [];
  if (!story.title?.trim()) issues.push({sceneId:null, text:'이야기 제목을 입력해 주세요.'});
  if (!state.document.locations.some(location => location.id === story.locationId)) issues.push({sceneId:null, text:'이야기가 시작될 기존 지역을 선택해 주세요.'});
  story.scenes.forEach((scene, index) => {
    const name = resolveItemTextPreview(scene.title || `장면 ${index + 1}`);
    const blocks = scene.blocks ?? scene.paragraphs.map(text => ({text}));
    if (!scene.title?.trim()) issues.push({sceneId:scene.id, text:`${name}: 장면 제목이 필요합니다.`});
    if (!blocks.some(block => String(block.text ?? '').trim())) issues.push({sceneId:scene.id, text:`${name}: 원고가 비어 있습니다.`});
    if (!scene.terminal && !scene.choices.length && !(story.actions?.length)) issues.push({sceneId:scene.id, text:`${name}: 다음 선택지 또는 종료 설정이 필요합니다.`});
    scene.choices.forEach((choice, choiceIndex) => {
      if (!String(choice.label ?? '').trim()) issues.push({sceneId:scene.id, choiceId:choice.id, text:`${name}의 선택 ${choiceIndex + 1}: 플레이어 문구가 필요합니다.`});
      if (!authorChoiceDestinationReady(story, choice)) issues.push({sceneId:scene.id, choiceId:choice.id, text:`${name}의 ‘${resolveItemTextPreview(choice.label || `선택 ${choiceIndex + 1}`)}’: 다음 진행을 정해 주세요.`});
    });
  });
  return issues;
}
function openAuthorCastPicker(story) {
  const selected = new Set(story.personIds ?? []);
  modal('등장인물 고르기', `<p class="muted">기존 인물을 검색해 이 이야기에 등장시킬 사람을 선택하세요.</p><input id="authorCastSearch" type="search" placeholder="이름이나 역할로 찾기" aria-label="등장인물 검색"><div class="author-resource-list" id="authorCastList"></div><div class="writer-toolbar"><button type="button" class="button primary" data-save-cast>선택한 인물 적용</button></div>`, dialog => {
    const draw = () => {
      const query = $('#authorCastSearch',dialog).value.replaceAll(' ','').toLowerCase();
      const rows = state.document.people.filter(person => `${person.name}${person.role}`.replaceAll(' ','').toLowerCase().includes(query));
      $('#authorCastList',dialog).innerHTML = rows.map(person => { const location = state.document.locations.find(entry => entry.id === person.locationId)?.name ?? '지역 미정'; return `<label class="author-resource-card"><input type="checkbox" value="${esc(person.id)}" ${selected.has(person.id)?'checked':''}><span><strong>${esc(person.name)}</strong><small>${esc(person.role || '역할 미정')} · ${esc(location)}</small></span></label>`; }).join('') || '<p class="muted">검색 결과가 없습니다.</p>';
      $$('input[type="checkbox"]',$('#authorCastList',dialog)).forEach(input => input.onchange = () => input.checked ? selected.add(input.value) : selected.delete(input.value));
    };
    $('#authorCastSearch',dialog).oninput = draw; draw();
    $('[data-save-cast]',dialog).onclick = () => { story.personIds = [...selected]; markDirty(); dialog.close(); renderEditor(); };
    $('#authorCastSearch',dialog).focus();
  });
}
function installWriterHeaderControls(header, story) {
  const toolbar = $('.writer-toolbar', header);
  if (!toolbar) return;
  toolbar.insertAdjacentHTML('afterbegin', writerModeMarkup());
  bindWriterModeControls(toolbar);
  if (writer.mode === 'advanced') return;
  $('[data-do="preview"]', toolbar)?.remove();
  const resume = !story.native && story.status === 'draft' && !story.enabled && writer.guide?.storyId !== story.id;
  if (resume) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary small'; button.textContent = '단계별 안내 열기';
    button.onclick = () => { startStoryGuide(story); renderEditor(); };
    $('.writer-mode-switch',toolbar).after(button);
  }
  const more = document.createElement('details'); more.className = 'writer-more-menu';
  more.innerHTML = '<summary>기타 작업</summary><div class="writer-more-actions"></div>';
  const actions = $('.writer-more-actions', more);
  $$('[data-do="library"],[data-do="validate"],[data-do="export"]', toolbar).forEach(button => actions.append(button));
  const undo = document.createElement('button'); undo.type='button'; undo.className='button ghost small'; undo.textContent='실행 취소'; undo.dataset.history='undo'; undo.onclick=()=>restoreWriterHistory(-1);
  const redo = document.createElement('button'); redo.type='button'; redo.className='button ghost small'; redo.textContent='다시 실행'; redo.dataset.history='redo'; redo.onclick=()=>restoreWriterHistory(1);
  actions.prepend(undo,redo); toolbar.append(more);
  more.addEventListener('keydown', event => { if (event.key === 'Escape') { more.open=false; $('summary',more).focus(); } });
}
function installAuthorCastControl(story, settings) {
  const cast = $('.cast-picker', settings); if (!cast) return;
  cast.innerHTML = `<div class="author-cast-list">${story.personIds.map(id => { const person=state.document.people.find(entry=>entry.id===id); return `<span class="badge">${esc(person?.name ?? '삭제된 등장인물')} <button type="button" data-author-remove-person="${esc(id)}" aria-label="${esc(person?.name ?? '등장인물')} 제외">×</button></span>`; }).join('') || '<span class="compact-empty-label">등장인물 없음</span>'}</div><button type="button" class="button ghost small" data-author-pick-cast>등장인물 고르기</button>`;
  $$('[data-author-remove-person]',cast).forEach(button => button.onclick = () => { story.personIds=story.personIds.filter(id=>id!==button.dataset.authorRemovePerson);markDirty();renderEditor(); });
  $('[data-author-pick-cast]',cast).onclick = () => openAuthorCastPicker(story);
}
function renderAuthorGuide(story, settings, manuscript, choiceSection, context, flowDetails) {
  if (writer.guide?.storyId !== story.id) return;
  const step = writer.guide.step;
  const labels = ['배경','첫 장면','선택지','분기','검토'];
  const guide = document.createElement('section'); guide.className = 'author-guide';
  guide.innerHTML = `<div class="author-guide-heading"><div><strong>새 이야기 만들기</strong><span>${step}/5 · ${labels[step-1]}</span></div><button type="button" class="button ghost small" data-guide-exit>단계 안내 닫기</button></div><ol>${labels.map((label,index)=>`<li class="${index+1===step?'active':index+1<step?'done':''}" ${index+1===step?'aria-current="step"':''}><span>${index+1}</span>${label}</li>`).join('')}</ol><p>${['','기존 지역과 등장인물을 고르고 이야기의 제목을 정해 주세요.','플레이어가 처음 읽을 장면의 제목과 원고를 작성해 주세요.','플레이어가 누를 문구와 결과를 만드세요.','각 선택 뒤에 새 장면, 기존 장면 합류, 다른 이야기 또는 종료를 연결하세요.','오른쪽에서 흐름을 읽어 보고 게임에 포함할 준비가 되었는지 확인하세요.'][step]}</p><div class="writer-toolbar">${step>1?'<button type="button" class="button ghost" data-guide-previous>이전</button>':''}${step<5?'<button type="button" class="button primary" data-guide-next>다음</button>':''}</div>`;
  $('.writer-header',ui.editorPanel).after(guide);
  settings.hidden = step !== 1;
  if (step === 1) [...settings.children].forEach(child => { if (!child.querySelector?.('#storyInfo') && child.id !== 'storyInfo') child.hidden=true; });
  manuscript.hidden = ![2,3].includes(step);
  if (choiceSection) choiceSection.hidden = ![3,4].includes(step);
  const pane = manuscript.closest('.manuscript-pane'); if (pane) pane.hidden = [1,5].includes(step);
  if (context) context.hidden = true;
  if (flowDetails) flowDetails.hidden = true;
  if (step === 4 && choiceSection) {
    const tasks=authorStoryIssues(story).filter(issue=>issue.choiceId || issue.text.includes('다음 선택지'));
    const branch=document.createElement('section'); branch.className='author-branch-tasks';
    branch.innerHTML=`<div class="section-title"><div><h3>이어 쓰기 작업</h3><p>${tasks.length?`${tasks.length}개 분기가 아직 이어지지 않았습니다.`:'모든 분기가 다음 장면이나 종료로 이어집니다.'}</p></div></div>${tasks.map((task,index)=>`<button type="button" data-branch-task="${index}">${esc(task.text)} <span>편집 →</span></button>`).join('')||'<p class="author-ready-message">✓ 이어지지 않은 분기가 없습니다.</p>'}`;
    choiceSection.before(branch);
    $$('[data-branch-task]',branch).forEach(button=>button.onclick=()=>{const task=tasks[Number(button.dataset.branchTask)];go('stories',story.id,task.sceneId,task.choiceId);});
  }
  if (step === 5) {
    const issues = authorStoryIssues(story);
    const review = document.createElement('section'); review.className='author-readiness';
    review.innerHTML = `<div class="section-title"><div><h3>공개 준비 확인</h3><p>${issues.length ? `${issues.length}가지를 마치면 게임에 포함할 수 있습니다.` : '이 이야기는 게임에 포함할 준비가 되었습니다.'}</p></div></div><div class="author-review-list">${issues.map((issue,index)=>`<button type="button" data-guide-issue="${index}"><span aria-hidden="true">○</span>${esc(issue.text)}</button>`).join('') || '<p class="author-ready-message">✓ 원고와 모든 분기 연결을 확인했습니다.</p>'}</div><div class="writer-toolbar"><button type="button" class="button ghost" data-guide-draft>초안으로 계속 작성</button><button type="button" class="button primary" data-guide-complete ${issues.length?'disabled':''}>검토 완료하고 게임에 포함</button></div>`;
    $('.writer-workspace',ui.editorPanel).before(review);
    $$('[data-guide-issue]',review).forEach(button => button.onclick = () => { const issue=issues[Number(button.dataset.guideIssue)]; writer.guide.step=issue.choiceId?4:issue.sceneId?2:1; if(issue.sceneId)go('stories',story.id,issue.sceneId,issue.choiceId); else renderEditor(); });
    $('[data-guide-draft]',review).onclick = () => { writer.guide=null; renderEditor(); };
    $('[data-guide-complete]',review).onclick = () => { story.status='ready'; story.enabled=true; writer.guide=null; markDirty(); renderEditor(); showToast('검토를 마쳤습니다. 다음 배포부터 게임에 포함됩니다.'); };
  }
  $('[data-guide-exit]',guide).onclick = () => { writer.guide=null; renderEditor(); };
  $('[data-guide-previous]',guide)?.addEventListener('click',()=>{writer.guide.step--;renderEditor();});
  $('[data-guide-next]',guide)?.addEventListener('click',()=>{
    const suggested=authorSuggestedGuideStep(story);
    if (suggested <= step && step < 4) return showToast(['','제목과 시작 지역을 확인해 주세요.','첫 장면 제목과 원고를 작성해 주세요.','선택지 문구를 하나 이상 작성해 주세요.'][step],true);
    if (step === 4 && authorStoryIssues(story).some(issue=>issue.choiceId || issue.text.includes('다음 선택지'))) return showToast('모든 장면에 선택지를 만들고 다음 진행을 정해 주세요.',true);
    writer.guide.step++; renderEditor();
  });
}
function enhanceStoryWorkspace(story, scene, selectedChoice) {
  updateStudioAuthorMode();
  const header = $('.writer-header', ui.editorPanel);
  installWriterHeaderControls(header, story);
  if (writer.mode === 'advanced') { renderWriterSceneNav(); updateWriterHistoryButtons(); return; }
  const pane = $('.manuscript-pane');
  pane.closest('.writer-workspace').classList.add('writer-flat-ui');
  header.classList.add('writer-flat-header');
  const origin = writer.connectionOrigin;
  if (origin?.targetSceneId === scene?.id) {
    const back = document.createElement('button'); back.type = 'button'; back.className = 'button ghost connection-back';
    back.textContent = `← ‘${origin.label}’ 연결로 돌아가기`;
    back.onclick = () => {
      writer.connectionOrigin = null;
      if (origin.action) openRegionAction(origin.locationId, origin.choiceId);
      else {
        go('stories', origin.storyId, origin.sceneId, origin.choiceId);
        $$('[data-choice-card]').find(card => card.dataset.choiceCard === origin.choiceId)?.scrollIntoView({block:'start'});
      }
    };
    pane.prepend(back);
  }
  const settings = document.createElement('section'); settings.className = 'story-settings writer-story-settings writer-flat-ui';
  settings.id = 'writerStorySettings'; settings.setAttribute('aria-label', '이야기 설정');
  settings.hidden = !(writer.openSettings?.has(story.id) ?? false);
  const settingsButton = document.createElement('button'); settingsButton.type = 'button'; settingsButton.className = 'button ghost small';
  settingsButton.textContent = '이야기 설정'; settingsButton.title = '제목, 지역, 발생 조건';
  settingsButton.setAttribute('aria-controls', settings.id); settingsButton.setAttribute('aria-expanded', String(!settings.hidden));
  settingsButton.onclick = () => {
    settings.hidden = !settings.hidden; settingsButton.setAttribute('aria-expanded', String(!settings.hidden));
    writer.openSettings ??= new Set();
    if (settings.hidden) writer.openSettings.delete(story.id); else writer.openSettings.add(story.id);
  };
  const title = $('h2', header), titleRow = document.createElement('div'); titleRow.className = 'writer-title-row';
  const stateLabel = document.createElement('span'); stateLabel.className = `author-story-state ${story.enabled && story.status === 'ready' ? 'ready' : 'draft'}`;
  stateLabel.textContent = `${story.status === 'ready' ? '검토 완료' : '작성 중'} · ${story.enabled ? '게임 포함' : '게임 미포함'}`;
  title.before(titleRow); titleRow.append(title, stateLabel, settingsButton);
  for (const node of [$('#storyInfo')?.closest('.form-section'), $('#prerequisite')?.closest('.form-section'), $('#storyConditions')]) if (node) settings.append(node);
  const storyHeading = $('h3', $('#storyInfo')?.closest('.form-section')); if (storyHeading) storyHeading.textContent = '이야기 배경';
  for (const key of ['status','enabled']) $('[data-w="'+key+'"]',settings)?.closest('label')?.classList.add('author-internal-field');
  installAuthorCastControl(story, settings);
  protectAuthorAdvancedRows($('#storyConditions',settings) ?? settings, story);
  $('.scene-tabs')?.closest('.form-section')?.remove();
  const regionActions = $('#nativeActionEditor')?.closest('.form-section');
  if (regionActions) {
    const regional = document.createElement('details'); regional.className = 'story-settings region-action-details'; regional.innerHTML = '<summary>이 지역의 공통 행동 편집</summary>';
    regional.append(regionActions); pane.append(regional);
  }
  header.after(settings);
  const manuscript = $('#sceneInfo')?.closest('.form-section');
  let context = null;
  if (manuscript) {
    manuscript.classList.add('primary-manuscript');
    $('.section-title', manuscript).insertAdjacentHTML('afterend', writerItemHelp());
    // Only the title is in the writing path. Scene execution settings remain accessible.
    const sceneSettings = document.createElement('details'); sceneSettings.className = 'scene-settings'; sceneSettings.innerHTML = '<summary>장면 실행 설정</summary>';
    $$('.check-field', $('#sceneInfo')).forEach(node => sceneSettings.append(node));
    manuscript.append(sceneSettings);
    context = document.createElement('details'); context.className = 'scene-context';
    const links = studioContentLinks(state.document), incoming = links.filter(link => link.to === scene.id), outgoing = links.filter(link => link.from === scene.id);
    const describe = link => {
      const from = state.document.stories.find(s => s.id === link.storyId);
      const to = state.document.stories.find(s => s.id === link.targetStoryId);
      return `${from?.scenes.find(s => s.id === link.from)?.title ?? from?.title ?? '지역 행동'} → ${to?.scenes.find(s => s.id === link.to)?.title ?? to?.title} · ${resolveItemTextPreview(link.label)}${link.conditional ? ' (조건별 결과)' : ''}`;
    };
    context.innerHTML = `<summary>장면 맥락 · 들어오는 연결 ${incoming.length} · 이어지는 연결 ${outgoing.length}${sceneVariantName(story, scene) ? ` · ${esc(sceneVariantName(story, scene))}` : ''}</summary>${[...incoming, ...outgoing].map((link, index) => `<button type="button" class="related-link" data-context-link="${index}">${esc(describe(link))}</button>`).join('') || '<p class="muted">직접 연결이 없습니다. 첫 장면 또는 지역 상황에 따라 표시됩니다.</p>'}<p class="muted">표시 조건: ${esc(scene.conditions.map(conditionLabel).join(' · ') || '없음')}</p>`;
    $$('[data-context-link]', context).forEach(button => button.onclick = () => {
      const index = Number(button.dataset.contextLink), link = [...incoming, ...outgoing][index];
      if (index < incoming.length) {
        go('stories', link.storyId, link.action ? undefined : link.from, link.choiceId);
        if (link.action) { const picker = $('#nativeAction'); if (picker) { picker.closest('.manuscript-pane').querySelector('.region-action-details').open = true; picker.value = link.choiceId; picker.onchange(); } }
      } else go('stories', link.targetStoryId, link.to);
    });
    manuscript.after(context);
    $$('[data-block]', manuscript).forEach(block => {
      const index = Number(block.dataset.block), controls = $('.writer-toolbar', block);
      const blocks = () => (scene.blocks ??= scene.paragraphs.map(text => ({ text })));
      for (const [label, action] of [['문단 복제','copy'],['위로','up'],['아래로','down']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button ghost small'; button.textContent = label; button.setAttribute('aria-label', `문단 ${index + 1} ${label}`);
        button.disabled = action === 'up' && index === 0 || action === 'down' && index === (scene.blocks ?? scene.paragraphs).length - 1;
        button.onclick = () => {
          const target = action === 'copy' ? index + 1 : index + (action === 'up' ? -1 : 1);
          if (action === 'copy') blocks().splice(target, 0, structuredClone(blocks()[index])); else StudioWriterTools.move(blocks(), index, action === 'up' ? -1 : 1);
          markDirty(); renderEditor(); StudioItemTextEditor.surface($(`[data-block-text="${target}"]`))?.focus({ preventScroll: true });
        }; controls.insertBefore(button, $('[data-remove-block]', controls));
      }
      // Move the existing buttons, preserving their bindings and history behavior.
      const menu = document.createElement('details'); menu.className = 'writer-block-tools';
      menu.innerHTML = `<summary aria-label="문단 ${index + 1} 도구">문단 도구</summary><div class="writer-block-actions" role="group" aria-label="문단 ${index + 1} 편집 작업"></div>`;
      const actions = $('.writer-block-actions', menu), remove = $('[data-remove-block]', controls);
      if (remove) remove.textContent = '문단 삭제';
      $$('button', controls).forEach(button => actions.append(button));
      menu.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.isComposing) return;
        event.preventDefault(); event.stopPropagation(); menu.open = false; $('summary', menu).focus();
      });
      menu.addEventListener('focusout', event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false; });
      controls.append(menu);
    });
  }
  const choiceSection = $('.choice-tabs')?.closest('.form-section');
  const oldEditor = $('#choiceEditor');
  if (oldEditor) {
    // Label and destination now live at the top of the card; everything else is the original editor.
    $('#choiceInfo [data-w="label"]')?.closest('label')?.remove();
    if (!StudioWriterTools.hasAdvancedRoute(selectedChoice)) $('#choiceConnection')?.closest('.form-section')?.remove();
    $$('[data-do="deleteChoice"]', oldEditor).forEach(button => button.remove());
  }
  if (choiceSection && scene) {
    choiceSection.classList.add('writer-choice-section');
    const cards = document.createElement('div'); cards.className = 'writer-choice-cards';
    scene.choices.forEach((choice, index) => {
      const refs = StudioWriterTools.sharedScenes(state.document, choice.id);
      const card = document.createElement('article'); card.className = 'writer-choice-card'; card.dataset.choiceCard = choice.id;
      card.innerHTML = `<div class="choice-card-heading"><strong>선택 ${index + 1}</strong><div class="writer-toolbar">${btn('복제','cardClone')}${btn('위로','cardUp')}${btn('아래로','cardDown')}${btn('삭제','cardDelete')}</div></div><label class="field choice-label"><span>플레이어가 누를 문구</span><input data-card-label value="${esc(choice.label)}"></label><dl class="author-choice-summary"><div><dt>선택 조건</dt><dd class="choice-conditions">${esc(choice.conditions.map(authorConditionText).join(' · ') || '조건 없음')}</dd></div><div><dt>플레이어 결과</dt><dd class="choice-result" data-result-summary>${esc(authorResultSummary(choice))}</dd></div></dl><div class="author-choice-actions"><button type="button" class="button ghost small" data-author-add-condition>조건 추가</button><button type="button" class="button ghost small" data-author-add-result>결과 추가</button></div>${refs.length > 1 ? `<details class="shared-choice"><summary>공통 선택지 · 적용되는 장면 ${refs.length}개</summary><p class="muted">수정하면 아래 모든 장면에 반영됩니다. 독립적으로 바꾸려면 복제하세요.</p>${refs.map((ref, i) => `<button type="button" class="related-link" data-shared-ref="${i}">${esc(ref.title)}</button>`).join('')}</details>` : ''}<div class="choice-card-route">${choiceDestinationMarkup(story, choice)}</div><details class="choice-card-details"><summary>${esc(authorChoiceDetailLabel(choice))}</summary><div data-card-detail></div></details>`;
      const deleteButton = $('[data-do="cardDelete"]', card);
      deleteButton.textContent = '선택지 삭제';
      deleteButton.classList.replace('ghost', 'danger');
      deleteButton.setAttribute('aria-label', `선택 ${index + 1} 삭제`);
      $('[data-card-label]', card).oninput = event => { choice.label = event.target.value; synchronizeSharedChoices(choice); markDirty(); };
      StudioItemTextEditor.mount($('[data-card-label]',card),choice.label,{key:`${scene.id}:${choice.id}:label`});
      $('[data-author-add-condition]',card).onclick = () => openAuthorConditionBuilder(choice);
      $('[data-author-add-result]',card).onclick = () => openAuthorResultBuilder(choice);
      bindChoiceDestination($('.choice-card-route', card), story, choice);
      const connections = document.createElement('div'); connections.dataset.stockConnection = choice.id;
      $('.choice-card-route',card).before(connections);
      renderStockDestinations(choice,connections,story);
      $$('[data-shared-ref]', card).forEach(button => button.onclick = () => { const ref = refs[Number(button.dataset.sharedRef)]; go('stories', ref.storyId, ref.sceneId, choice.id); });
      const details = $('.choice-card-details', card);
      if (choice.id === selectedChoice?.id && oldEditor) { $('[data-card-detail]', card).append(oldEditor); protectAuthorAdvancedRows(oldEditor, choice); }
      details.open = writer.expandedChoice === choice.id;
      details.ontoggle = () => {
        if (!details.isConnected) return;
        if (details.open && writer.expandedChoice !== choice.id) {
          synchronizeSharedChoices(); writer.expandedChoice = choice.id; state.selectedChoiceId = choice.id; renderEditor();
        } else if (!details.open && writer.expandedChoice === choice.id) writer.expandedChoice = null;
      };
      listen('cardClone', () => { const clone = StudioWriterTools.duplicateChoice(choice, makeId('choice')); scene.choices.splice(index + 1, 0, clone); state.selectedChoiceId = clone.id; markDirty(); renderEditor(); }, card);
      for (const [action, delta] of [['cardUp', -1], ['cardDown', 1]]) {
        const button = $(`[data-do="${action}"]`, card); button.disabled = index + delta < 0 || index + delta >= scene.choices.length;
        button.onclick = () => { StudioWriterTools.move(scene.choices, index, delta); markDirty(); renderEditor(); };
      }
      listen('cardDelete', () => {
        const linked = state.document.stories.filter(s => s.prerequisite?.choiceId === choice.id);
        if (linked.length && refs.length === 1) return showToast(`먼저 후속 이벤트 연결을 바꿔 주세요: ${linked.map(s => s.title).join(', ')}`, true);
        if (!window.confirm(`‘${resolveItemTextPreview(choice.label)}’ 선택지를 이 장면에서 삭제하시겠습니까?\n\n${refs.length > 1 ? '다른 장면의 공통 선택지는 유지됩니다. ' : ''}연결된 장면 원고는 삭제하지 않습니다. 실행 취소로 복원할 수 있습니다.`)) return;
        scene.choices.splice(index, 1); if (state.selectedChoiceId === choice.id) state.selectedChoiceId = null;
        markDirty(); renderEditor();
      }, card);
      cards.append(card);
    });
    $('.choice-tabs', choiceSection).replaceWith(cards);
  }
  const flow = $('.flow-pane'), flowDetails = document.createElement('details'); flowDetails.className = 'writer-flow';
  flowDetails.innerHTML = '<summary>흐름도 보기 · 장면과 분기 연결</summary>'; flow.before(flowDetails); flowDetails.append(flow);
  flowDetails.open = writer.graphOpen ?? false; flowDetails.ontoggle = () => { writer.graphOpen = flowDetails.open; if (flowDetails.open) drawGraph(); };
  $('.writer-mobile-tabs')?.remove();
  // Preview navigation uses the responsive tabs; all trial controls live in the panel.
  $('[data-do="preview"]', header)?.remove();
  compactWriterConditions(pane); compactWriterConditions(settings);
  $('#writerIssues') && flowDetails.before($('#writerIssues'));
  renderAuthorGuide(story, settings, manuscript, choiceSection, context, flowDetails);
  renderWriterSceneNav(); updateWriterHistoryButtons();
}
function writerItemHelp() {
  return '<p class="writer-item-help">문장에 <kbd>/아이템이름</kbd>을 입력해 연결하세요. Enter·Tab으로 선택하고 Esc로 닫습니다.</p>';
}
function writerEmptySection(title, message, actions) {
  return section(title, '', `<span class="compact-empty-label">${esc(message)}</span><div class="writer-toolbar">${actions}</div>`, 'compact-empty-editor');
}
function compactWriterConditions(root) {
  $$('[data-add-array][data-array-kind="condition"]', root).forEach(button => {
    const group = button.closest('.form-section');
    if (!group || group.classList.contains('compact-empty-editor') || !$('.array-stack > .empty-array', group)) return;
    group.classList.add('compact-empty-editor');
    button.insertAdjacentHTML('beforebegin', '<span class="compact-empty-label">조건 없음</span>');
    button.textContent = '조건 추가';
    button.setAttribute('aria-label', `${$('h3', group)?.textContent ?? '조건'} 추가`);
  });
}
function refreshWriterCardSummaries() {
  const story = state.tab === 'stories' ? selectedEntity() : null;
  const scene = story?.scenes.find(scene => scene.id === state.selectedSceneId);
  if (!scene) return;
  $$('[data-choice-card]').forEach(card => {
    const choice = scene.choices.find(choice => choice.id === card.dataset.choiceCard);
    if (!choice) return;
    $('[data-result-summary]', card).textContent = writer.mode === 'advanced' ? writerChoiceSummary(choice) : authorResultSummary(choice);
    $('.choice-conditions', card).textContent = (writer.mode === 'advanced' ? choice.conditions.map(conditionLabel) : choice.conditions.map(authorConditionText)).join(' · ') || '조건 없음';
    const connections = $('[data-stock-connection]',card);
    if (connections) renderStockDestinations(choice,connections,story);
  });
}
function showWriterReading(story, scene) {
  if (!scene) return;
  if (state.selectedId!==story.id || state.selectedSceneId!==scene.id) go('stories',story.id,scene.id);
  syncLivePreviewEditor(); setLivePreviewPane('preview');
}
function authorPublishSummary(changes) {
  let sceneChanges = 0, choiceAdds = 0, choiceChanges = 0, rewardChanges = 0;
  for (const change of changes) {
    if (change.kind === '이야기' && change.before && change.after) {
      const before = new Map((change.before.scenes ?? []).map(scene => [scene.id,scene]));
      const after = new Map((change.after.scenes ?? []).map(scene => [scene.id,scene]));
      for (const id of new Set([...before.keys(),...after.keys()])) if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) sceneChanges++;
    }
    if (change.kind === '선택지') {
      if (change.type === '추가') choiceAdds++; else choiceChanges++;
      const itemEffects = value => (value?.effects ?? []).filter(effect => ['add_item','remove_item','collect_stock_item','collect_stock_item_all'].includes(effect.type));
      if (JSON.stringify(itemEffects(change.before)) !== JSON.stringify(itemEffects(change.after))) rewardChanges++;
    }
  }
  const parts = [sceneChanges?`장면 ${sceneChanges}개 수정`:'',choiceAdds?`선택지 ${choiceAdds}개 추가`:'',choiceChanges?`선택지 ${choiceChanges}개 변경`:'',rewardChanges?`아이템 보상 ${rewardChanges}개 변경`:''].filter(Boolean);
  if (!parts.length && changes.length) parts.push(`콘텐츠 ${changes.length}개 변경`);
  return parts.join(' · ') || '공개본과 동일합니다.';
}
function authorChangeDetail(change) {
  if (change.type === '추가') return `${change.kind}을(를) 새로 추가합니다.`;
  if (change.type === '삭제') return `${change.kind}을(를) 게임에서 제거합니다.`;
  if (change.kind === '선택지') {
    const notes=[];
    if (change.before?.label !== change.after?.label) notes.push('플레이어 문구 수정');
    if (JSON.stringify(change.before?.conditions) !== JSON.stringify(change.after?.conditions)) notes.push('선택 조건 변경');
    if (JSON.stringify(change.before?.effects) !== JSON.stringify(change.after?.effects)) notes.push('플레이어 결과 변경');
    if (StudioWriterTools.destination(change.before ?? {}) !== StudioWriterTools.destination(change.after ?? {}) || change.before?.nextSceneId !== change.after?.nextSceneId || change.before?.nextStoryId !== change.after?.nextStoryId) notes.push('다음 진행 변경');
    return notes.join(' · ') || '선택지의 세부 설정을 수정합니다.';
  }
  if (change.kind === '이야기') {
    const beforeScenes=new Map((change.before?.scenes??[]).map(scene=>[scene.id,scene])), afterScenes=new Map((change.after?.scenes??[]).map(scene=>[scene.id,scene]));
    let added=0,removed=0,edited=0;
    for(const id of new Set([...beforeScenes.keys(),...afterScenes.keys()])) { if(!beforeScenes.has(id))added++; else if(!afterScenes.has(id))removed++; else if(JSON.stringify(beforeScenes.get(id))!==JSON.stringify(afterScenes.get(id)))edited++; }
    const notes=[added?`장면 ${added}개 추가`:'',removed?`장면 ${removed}개 삭제`:'',edited?`장면 ${edited}개 수정`:'',change.before?.enabled!==change.after?.enabled?(change.after?.enabled?'게임 포함으로 전환':'게임 미포함으로 전환'):''].filter(Boolean);
    return notes.join(' · ') || '이야기 설정을 수정합니다.';
  }
  return `${change.kind}의 이름이나 설정을 수정합니다.`;
}
async function reviewWriterPublish() {
  if (writer.reviewLoading) return;
  writer.reviewLoading = true;
  try {
    synchronizeSharedChoices();
    const response = await studioFetch('/api/content-studio/published');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? '공개본을 불러오지 못했습니다.');
    const revision = writer.revision;
    const changes = StudioWriterTools.changes(payload.document, state.document);
    const authorRows = changes.map(change => `<article class="publish-change author-publish-change"><div><span class="badge">${esc(change.type)} · ${esc(change.kind)}</span><strong>${esc(resolveItemTextPreview(change.name))}</strong></div><p>${esc(authorChangeDetail(change))}</p></article>`).join('') || '<p>공개본과 동일합니다.</p>';
    const advancedRows = changes.map(change => `<details class="publish-change"><summary><span class="badge">${esc(change.type)} · ${esc(change.kind)}</span> ${esc(change.name)}</summary><div class="change-columns"><div><strong>공개본</strong><pre>${esc(JSON.stringify(change.before ?? null, null, 2))}</pre></div><div><strong>이번 공개</strong><pre>${esc(JSON.stringify(change.after ?? null, null, 2))}</pre></div></div></details>`).join('') || '<p>공개본과 동일합니다.</p>';
    modal('공개 전 변경 검토', `<div class="publish-summary"><strong>${esc(authorPublishSummary(changes))}</strong><span>현재 공개본과 비교한 내용입니다.</span></div><p class="muted">초안 자동 저장과는 별개입니다. 공개해도 기존 세이브는 바뀌지 않습니다.</p><div class="publish-changes">${writer.mode === 'advanced' ? advancedRows : authorRows}</div>${btn('변경 확인 후 공개','confirmPublish','primary')}`, dialog => {
      listen('confirmPublish', async () => {
        if (revision !== writer.revision) { dialog.close(); showToast('검토 중 원고가 바뀌었습니다. 최신 변경을 다시 확인해 주세요.', true); return; }
        if (state.saving || state.publishing) return showToast('현재 저장이 끝난 뒤 공개해 주세요.');
        dialog.close(); await writerSave(true, false, true);
      }, dialog);
    });
  } catch (error) { showToast(error.message, true); }
  finally { writer.reviewLoading = false; }
}
