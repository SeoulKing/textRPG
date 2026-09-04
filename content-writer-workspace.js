/* Manuscript-first presentation. Existing advanced editors keep their original bindings. */
function writerSelection() {
  return { tab: state.tab, selectedId: state.selectedId, selectedSceneId: state.selectedSceneId, selectedChoiceId: state.selectedChoiceId, library: writer.library };
}
function updateWriterHistoryButtons() {
  $$('[data-history]').forEach(button => button.disabled = writer.composing || !(button.dataset.history === 'undo' ? writer.history?.canUndo : writer.history?.canRedo));
}
function restoreWriterHistory(direction) {
  if (writer.composing) return;
  const snapshot = writer.history?.move(direction);
  if (!snapshot) return;
  const scroll = window.scrollY;
  state.document = snapshot.document;
  const { library, ...selection } = snapshot.selection;
  Object.assign(state, selection); writer.library = library; writer.activeAction = null;
  writer.restoring = true;
  try { markDirty(); renderShell(); } finally { writer.restoring = false; }
  window.scrollTo({ top: scroll }); updateWriterHistoryButtons();
  showToast(direction < 0 ? '실행을 취소했습니다.' : '다시 실행했습니다.');
}
function installWriterWorkspace() {
  const toolbar = document.createElement('div'); toolbar.className = 'history-toolbar';
  toolbar.innerHTML = '<button type="button" class="button ghost small" data-history="undo" title="Ctrl+Z" disabled>실행 취소</button><button type="button" class="button ghost small" data-history="redo" title="Ctrl+Shift+Z / Ctrl+Y" disabled>다시 실행</button>';
  $('.topbar-actions').prepend(toolbar);
  $$('[data-history]', toolbar).forEach(button => button.onclick = () => restoreWriterHistory(button.dataset.history === 'undo' ? -1 : 1));
  const remember = () => writer.history?.visit(writerSelection());
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('keydown', event => {
    remember();
    if (event.isComposing || writer.composing || $('#writerModal') || event.target.closest?.('#writerLivePreview') || event.target.matches?.('input[type="search"], .reference-search, [data-new-scene-title]') || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') { event.preventDefault(); restoreWriterHistory(key === 'y' || event.shiftKey ? 1 : -1); }
  }, true);
  document.addEventListener('input', event => {
    // The element identity groups typing, but never groups structural button actions.
    writer.inputGroup = event.target;
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
function renderWriterSceneNav() {
  $('#writerSceneNav')?.remove();
  const story = state.tab === 'stories' && !writer.library ? selectedEntity() : null;
  $('.content-list-panel').classList.toggle('has-scene-nav', Boolean(story));
  if (!story) return;
  const nav = document.createElement('nav'); nav.id = 'writerSceneNav'; nav.setAttribute('aria-label', '현재 이야기의 장면');
  nav.innerHTML = `<div class="section-title"><strong>${esc(story.title)}</strong>${btn('＋ 장면', 'navAddScene')}</div>${story.scenes.map((scene, index) => `<button type="button" class="scene-nav-item ${scene.id === state.selectedSceneId ? 'active' : ''}" data-nav-scene="${esc(scene.id)}" ${scene.id === state.selectedSceneId ? 'aria-current="true"' : ''}><span>${index + 1}. ${esc(resolveItemTextPreview(scene.title || '제목 없는 장면'))}</span><small>${esc(sceneVariantName(story, scene) || (scene.terminal ? '종료 장면' : `${scene.choices.length}개 선택지`))}</small></button>`).join('')}`;
  ui.entityList.before(nav);
  $$('[data-nav-scene]', nav).forEach(button => button.onclick = () => go('stories', story.id, button.dataset.navScene));
  listen('navAddScene', () => { const scene = newScene(story.locationId); story.scenes.push(scene); go('stories', story.id, scene.id); markDirty(); }, nav);
}
function writerChoiceSummary(choice) {
  const result=studioChoiceResultSummary(state.document,choice);
  const minutes=(choice.effects??[]).filter(effect=>effect.type==='advance_time').reduce((sum,effect)=>sum+effect.minutes,0);
  return [result,minutes?`${minutes}분 경과`:'',choice.failureEffects?.length?`조건 미충족 결과 ${choice.failureEffects.length}개`:''].filter(Boolean).join(' · ');
}
function choiceDestinationMarkup(story, choice) {
  const mode = StudioWriterTools.destination(choice);
  const entries = [['','진행 방식 선택'],['scene','기존 장면 연결'],['new','새 장면 만들기'],['story','다른 이벤트 연결'],['end','이야기 종료']];
  if (mode === 'advanced') entries.unshift(['advanced','기존 고급 실행 규칙 유지']);
  return `<label class="field"><span>다음 진행</span><select data-route-mode>${options(entries, mode)}</select></label><div data-route-target>${mode === 'scene' ? `<label class="field"><span>이어지는 장면</span><select data-route-scene>${options(story.scenes.map(scene => [scene.id, `${scene.title}${sceneVariantName(story, scene) ? ` · ${sceneVariantName(story, scene)}` : ''}`]), choice.nextSceneId)}</select></label>` : mode === 'story' ? `<label class="field"><span>이어지는 이벤트</span><select data-route-story>${options(storyEntries(), choice.nextStoryId ?? choice.nextEventId)}</select></label>` : `<p class="muted">${mode === 'end' ? '현재 이벤트의 완료를 기록하고 마칩니다.' : mode === 'advanced' ? '조건·확률 결과 안의 이동도 그대로 실행됩니다. 상세 설정에서 확인하세요.' : '연결을 정하기 전까지 기존 실행 동작을 유지합니다.'}</p>`}</div>`;
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
    target.innerHTML = `<label class="field"><span>${mode === 'scene' ? '이어지는 장면' : '이어지는 이벤트'}</span><select data-route-${mode}>${options(mode === 'scene' ? story.scenes.map(scene => [scene.id, scene.title]) : storyEntries(), '', true)}</select></label>`;
    $('select', target).onchange = event => commit(mode, event.target.value);
  };
  const scenePicker = $('[data-route-scene]', root), storyPicker = $('[data-route-story]', root);
  if (scenePicker) scenePicker.onchange = event => commit('scene', event.target.value);
  if (storyPicker) storyPicker.onchange = event => commit('story', event.target.value);
}
function enhanceStoryWorkspace(story, scene, selectedChoice) {
  const pane = $('.manuscript-pane');
  const settings = document.createElement('details'); settings.className = 'story-settings';
  settings.innerHTML = '<summary>이야기 설정 · 제목, 지역, 발생 조건</summary>';
  settings.open = writer.openSettings?.has(story.id) ?? false;
  settings.ontoggle = () => { writer.openSettings ??= new Set(); if (settings.open) writer.openSettings.add(story.id); else writer.openSettings.delete(story.id); };
  for (const node of [$('#storyInfo')?.closest('.form-section'), $('#prerequisite')?.closest('.form-section'), $('#storyConditions')]) if (node) settings.append(node);
  $('.scene-tabs')?.closest('.form-section')?.remove();
  const regionActions = $('#nativeActionEditor')?.closest('.form-section');
  if (regionActions) {
    const regional = document.createElement('details'); regional.className = 'story-settings region-action-details'; regional.innerHTML = '<summary>이 지역의 공통 행동 편집</summary>';
    regional.append(regionActions); pane.append(regional);
  }
  pane.prepend(settings);
  const manuscript = $('#sceneInfo')?.closest('.form-section');
  if (manuscript) {
    manuscript.classList.add('primary-manuscript');
    // Only the title is in the writing path. Scene execution settings remain accessible.
    const sceneSettings = document.createElement('details'); sceneSettings.className = 'scene-settings'; sceneSettings.innerHTML = '<summary>장면 실행 설정</summary>';
    $$('.check-field', $('#sceneInfo')).forEach(node => sceneSettings.append(node));
    manuscript.append(sceneSettings);
    const context = document.createElement('details'); context.className = 'scene-context';
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
          markDirty(); renderEditor(); $(`[data-block-text="${target}"]`)?.focus({ preventScroll: true });
        }; controls.insertBefore(button, $('[data-remove-block]', controls));
      }
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
    const cards = document.createElement('div'); cards.className = 'writer-choice-cards';
    scene.choices.forEach((choice, index) => {
      const refs = StudioWriterTools.sharedScenes(state.document, choice.id);
      const card = document.createElement('article'); card.className = 'writer-choice-card'; card.dataset.choiceCard = choice.id;
      card.innerHTML = `<div class="choice-card-heading"><strong>선택 ${index + 1}</strong><div class="writer-toolbar">${btn('복제','cardClone')}${btn('위로','cardUp')}${btn('아래로','cardDown')}${btn('삭제','cardDelete')}</div></div><label class="field choice-label"><span>플레이어가 누를 문구</span><input data-card-label value="${esc(choice.label)}"></label><p class="choice-conditions">${esc(choice.conditions.map(conditionLabel).join(' · ') || '조건 없음')}</p><p class="choice-result" data-result-summary>${esc(writerChoiceSummary(choice))}</p>${refs.length > 1 ? `<details class="shared-choice"><summary>공통 선택지 · 적용되는 장면 ${refs.length}개</summary><p class="muted">수정하면 아래 모든 장면에 반영됩니다. 독립적으로 바꾸려면 복제하세요.</p>${refs.map((ref, i) => `<button type="button" class="related-link" data-shared-ref="${i}">${esc(ref.title)}</button>`).join('')}</details>` : ''}<div class="choice-card-route">${choiceDestinationMarkup(story, choice)}</div><details class="choice-card-details"><summary>상세 조건·보상·확률 설정</summary><div data-card-detail></div></details>`;
      const deleteButton = $('[data-do="cardDelete"]', card);
      deleteButton.textContent = '선택지 삭제';
      deleteButton.classList.replace('ghost', 'danger');
      deleteButton.setAttribute('aria-label', `선택 ${index + 1} 삭제`);
      $('[data-card-label]', card).oninput = event => { choice.label = event.target.value; synchronizeSharedChoices(choice); markDirty(); };
      bindChoiceDestination($('.choice-card-route', card), story, choice);
      $$('[data-shared-ref]', card).forEach(button => button.onclick = () => { const ref = refs[Number(button.dataset.sharedRef)]; go('stories', ref.storyId, ref.sceneId, choice.id); });
      const details = $('.choice-card-details', card);
      if (choice.id === selectedChoice?.id && oldEditor) $('[data-card-detail]', card).append(oldEditor);
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
  const toolbar = $('.writer-header .writer-toolbar');
  toolbar.insertAdjacentHTML('afterbegin', btn('미리보기 보기','readNow') + (scene ? btn('현재 장면 시험','previewScene') : ''));
  listen('readNow', () => showWriterReading(story, scene));
  listen('previewScene', () => openPreview(story, scene.id, true));
  $('#writerIssues') && flowDetails.before($('#writerIssues'));
  renderWriterSceneNav(); updateWriterHistoryButtons();
}
function refreshWriterCardSummaries() {
  const story = state.tab === 'stories' ? selectedEntity() : null;
  const scene = story?.scenes.find(scene => scene.id === state.selectedSceneId);
  if (!scene) return;
  $$('[data-choice-card]').forEach(card => {
    const choice = scene.choices.find(choice => choice.id === card.dataset.choiceCard);
    if (!choice) return;
    $('[data-result-summary]', card).textContent = writerChoiceSummary(choice);
    $('.choice-conditions', card).textContent = choice.conditions.map(conditionLabel).join(' · ') || '조건 없음';
  });
}
function showWriterReading(story, scene) {
  if (!scene) return;
  if (state.selectedId!==story.id || state.selectedSceneId!==scene.id) go('stories',story.id,scene.id);
  syncLivePreviewEditor(); setLivePreviewPane('preview');
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
    modal('공개 전 변경 검토', `<p>현재 공개본과 비교한 변경 ${changes.length}건입니다. 공통 선택지는 ID별로 한 번 표시됩니다.</p><p class="muted">초안 자동 저장과는 별개입니다. 공개해도 기존 세이브는 바뀌지 않습니다.</p><div class="publish-changes">${changes.map(change => `<details class="publish-change"><summary><span class="badge">${esc(change.type)} · ${esc(change.kind)}</span> ${esc(change.name)}</summary><div class="change-columns"><div><strong>공개본</strong><pre>${esc(JSON.stringify(change.before ?? null, null, 2))}</pre></div><div><strong>이번 공개</strong><pre>${esc(JSON.stringify(change.after ?? null, null, 2))}</pre></div></div></details>`).join('') || '<p>공개본과 동일합니다.</p>'}</div>${btn('변경 확인 후 공개','confirmPublish','primary')}`, dialog => {
      listen('confirmPublish', async () => {
        if (revision !== writer.revision) { dialog.close(); showToast('검토 중 원고가 바뀌었습니다. 최신 변경을 다시 확인해 주세요.', true); return; }
        if (state.saving || state.publishing) return showToast('현재 저장이 끝난 뒤 공개해 주세요.');
        dialog.close(); await writerSave(true, false, true);
      }, dialog);
    });
  } catch (error) { showToast(error.message, true); }
  finally { writer.reviewLoading = false; }
}
