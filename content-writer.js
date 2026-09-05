/* Writer workspace: forms and graph share the same Studio document. */
const writer = { library: true, libraryCategory: "", librarySource: "", revision: 0, timer: null, conflict: false, filterLocation: "", filterPerson: "", filterStatus: "", graphMode: "scene", zoom: 1, mobilePane: "manuscript", preview: null, issues: [], mode: localStorage.getItem("textrpg_writer_mode") === "advanced" ? "advanced" : "author", guide: null };
const esc = escapeHtml;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const btn = (label, action, style = "ghost") => `<button type="button" class="button ${style} small" data-do="${action}">${esc(label)}</button>`;
const field = (label, key, value, type = "text") => `<label class="field"><span>${esc(label)}</span><input data-w="${key}" type="${type}" value="${esc(value ?? "")}" ${type === "number" ? 'step="1"' : ""}></label>`;
const area = (label, key, value) => `<label class="field full"><span>${esc(label)}</span><textarea data-w="${key}">${esc(value ?? "")}</textarea></label>`;
const select = (label, key, entries, value, empty = true) => `<label class="field"><span>${esc(label)}</span><select data-w="${key}">${options(entries, value, empty)}</select></label>`;
const check = (label, key, value) => `<label class="check-field"><input type="checkbox" data-w="${key}" ${value ? "checked" : ""}> ${esc(label)}</label>`;
const section = (title, content, actions = "", className = "") => `<section class="form-section${className ? ` ${esc(className)}` : ''}"><div class="section-title"><h3>${esc(title)}</h3>${actions}</div>${content}</section>`;
const locEntries = () => state.document.locations.map(l => [l.id, l.name]);
const personEntries = () => state.document.people.map(p => [p.id, p.name]);
const storyEntries = () => state.document.stories.map(s => [s.id, s.title]);
function listen(action, fn, root = ui.editorPanel) { $$(`[data-do="${action}"]`, root).forEach(b => b.onclick = fn); }
function bindWriter(root, target, onChange = () => {}, persistent = true) {
  $$('[data-w]', root).forEach(input => {
    input.addEventListener(input.tagName === "SELECT" || input.type === "checkbox" ? "change" : "input", () => {
      const key = input.dataset.w;
      target[key] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
      onChange(key, target[key]);
      if (!persistent) return;
      markDirty();
      clearTimeout(writer.graphTimer); if (!writer.composing) writer.graphTimer = setTimeout(() => { drawGraph(); renderList(); refreshWriterCardSummaries(); }, 160);
    });
    if (persistent && root.matches('#storyInfo, #sceneInfo, #choiceInfo, [data-action-info]') && ['title','entryLabel','entryHint','label','outcomeHint'].includes(input.dataset.w)) {
      StudioItemTextEditor.mount(input,target[input.dataset.w],{key:`${target.id}:${input.dataset.w}`});
    }
  });
}
function writerChanged() {
  if(writer.activeAction)studioSyncAction(state.document,writer.activeAction);
  else synchronizeSharedChoices();
  writer.revision++;
  if (state.tab === "recipes") {
    const recipe = selectedEntity();
    if (recipe) { const { menu, enabled, ...choice } = recipe; for (const story of state.document.stories) for (const scene of story.scenes) scene.choices = scene.choices.map(c => c.id === choice.id ? structuredClone(choice) : c); }
  }
  clearTimeout(writer.timer);
  if (typeof StudioItemTextEditor !== 'undefined') StudioItemTextEditor.refresh();
  if (typeof livePreviewChanged === 'function') livePreviewChanged();
  if (writer.composing) return;
  if (!writer.restoring) writer.history?.record(state.document, writerSelection(), writer.inputGroup);
  updateWriterHistoryButtons();
  refreshWriterCardSummaries(); refreshRegionResultSummaries();
  if (!writer.conflict) writer.timer = setTimeout(() => writerSave(false, true), 1600);
}
function writerLoaded() { resetLivePreview(); writer.selectedActionId = null; writer.activeAction = null; writer.library = true; writer.conflict = false; writer.issues = []; writer.history = StudioWriterTools.history(state.document, writerSelection()); writer.libraryContext = null; writer.expandedChoice = null; clearTimeout(writer.timer); updateWriterHistoryButtons(); }
function synchronizeSharedChoices(editedChoice) {
  // Imported shared choices remain a single logical choice; only the currently edited instance wins.
  const story = state.document.stories.find(s => s.id === state.selectedId);
  const scene = story?.scenes.find(s => s.id === state.selectedSceneId);
  const choice = editedChoice ?? scene?.choices.find(c => c.id === state.selectedChoiceId);
  if (!choice) return;
  for (const st of state.document.stories) for (const sc of st.scenes) sc.choices = sc.choices.map(c => c.id === choice.id ? choice : c);
  const recipe = state.document.recipes.find(r => r.id === choice.id);
  if (recipe) Object.assign(recipe, choice);
}
async function writerSave(publishing = false, automatic = false, reviewed = false) {
  if (!state.document || state.saving || state.publishing || (automatic && (writer.conflict || !state.dirty))) return;
  if (writer.composing) return;
  if (publishing && !reviewed) return reviewWriterPublish();
  const invalid = ui.editorPanel.querySelector("input:invalid");
  if (invalid) { if (!automatic) { invalid.reportValidity(); showToast("수량과 숫자 입력을 확인해 주세요.", true); } return; }
  clearTimeout(writer.timer);
  synchronizeSharedChoices();
  const revision = writer.revision;
  const snapshot = structuredClone(state.document);
  state.saving = !publishing; state.publishing = publishing;
  ui.saveButton.disabled = ui.publishButton.disabled = true;
  ui.saveState.textContent = publishing ? "연결과 보상을 검사하고 공개하는 중…" : "초안 저장 중…";
  try {
    const response = await studioFetch(publishing ? "/api/content-studio/publish" : "/api/content-studio", {
      method: publishing ? "POST" : "PUT", headers: { "Content-Type": "application/json", "If-Match": state.status.draftUpdatedAt ?? "none" }, body: JSON.stringify(snapshot),
    });
    const payload = await response.json();
    if (response.status === 401) showAuthGate(payload.message);
    if (response.status === 409) writer.conflict = true;
    if (!response.ok) { if (payload.issues) showIssues(payload.issues); throw new Error(payload.message ?? "저장하지 못했습니다."); }
    state.status = payload.status;
    if (revision === writer.revision) markSaved();
    else { state.dirty = true; ui.saveState.textContent = "새 변경사항 저장 대기"; }
    if (publishing) showToast("공개했습니다. 새 게임부터 적용됩니다. 기존 세이브는 유지됩니다.");
    else if (!automatic) showToast("초안을 저장했습니다.");
  } catch (error) {
    ui.saveState.textContent = error.message; ui.saveState.className = "save-state dirty";
    showToast(error.message, true);
  } finally {
    state.saving = state.publishing = false; ui.saveButton.disabled = ui.publishButton.disabled = false;
    if (revision !== writer.revision && !writer.conflict) writer.timer = setTimeout(() => writerSave(false, true), 1600);
  }
}
function writerMatches(entity) {
  if (state.tab === "items") return !writer.filterItemKind || entity.kind === writer.filterItemKind;
  if (state.tab !== "stories") return true;
  return (!writer.filterLocation || entity.locationId === writer.filterLocation)
    && (!writer.filterStatus || entity.status === writer.filterStatus)
    && (!writer.filterPerson || studioStoryPeople(entity, state.document.people).some(p => p.id === writer.filterPerson));
}
function renderWriterFilters() {
  const root = $("#writerFilters");
  if (state.tab === "items") {
    root.innerHTML = `<div class="writer-filters">${select("아이템 종류", "filterItemKind", [
      ["", "전체"], ["food", "음식"], ["drink", "음료"], ["medicine", "약품"],
      ["trade", "거래품"], ["ticket", "교환권"], ["material", "재료"], ["tool", "도구"],
    ], writer.filterItemKind ?? "", false)}</div>`;
    $('[data-w="filterItemKind"]', root).onchange = (event) => {
      writer.filterItemKind = event.target.value;
      renderList();
    };
    return;
  }
  root.innerHTML = state.tab === "stories" ? `<div class="writer-filters">${select("지역", "filterLocation", locEntries(), writer.filterLocation)}${select("등장인물", "filterPerson", personEntries(), writer.filterPerson)}${select("작성 상태", "filterStatus", [["draft", "작성 중"], ["ready", "검토 완료"]], writer.filterStatus)}${btn("이야기 모아보기", "library")}${btn("전체 이야기 흐름", "overview")}</div>` : "";
  $$('[data-w]', root).forEach(input => input.onchange = () => { writer[input.dataset.w] = input.value; renderList(); });
  listen("library", showStoryLibrary, root); listen("overview", () => { captureWriterLibrary(); writer.library = false; state.selectedId ??= state.document.stories[0]?.id; writer.graphMode = "story"; writer.graphOpen = true; renderEditor(); $('.writer-flow')?.scrollIntoView({block:'start'}); }, root);
}
function go(tab, id, sceneId, choiceId) {
  captureWriterLibrary();
  const sameStory = !writer.library && state.tab === tab && state.selectedId === id;
  const scroll = sameStory ? window.scrollY : 0;
  synchronizeSharedChoices(); writer.library = false; state.tab = tab; state.selectedId = id; state.selectedSceneId = sceneId ?? null; state.selectedChoiceId = choiceId ?? null;
  if (choiceId) writer.expandedChoice = choiceId;
  renderShell(); window.scrollTo({top:scroll}); writer.history?.visit(writerSelection());
}
function newChoice(label = "새로운 선택") { return { id: makeId("choice"), label, outcomeHint: "", showOutcomeHint: true, presentationMode: "when_conditions_met", conditions: [], effects: [], failureEffects: [], hidden: false, tags: ["studio-authored"] }; }
function newScene(locationId, title = "새 장면") { return { id: makeId("scene"), locationId, title, paragraphs: [], blocks: [{ text: "" }], choices: [], conditions: [], tags: [] }; }
function newStory(locationId, personId) {
  const scene = newScene(locationId, "첫 장면");
  if (personId) scene.blocks[0].speakerId = personId;
  const result = { id: makeId("story"), title: "새 이야기", locationId, entryLabel: "이야기를 시작한다", entryHint: "", enabled: false, once: true, status: "draft", tags: [], conditions: [], personIds: personId ? [personId] : [], scenes: [scene], actions: [], layout: {} };
  state.document.stories.push(result); return result;
}
function modal(title, html, setup) {
  $("#writerModal")?.remove();
  const dialog = document.createElement("dialog"); dialog.id = "writerModal"; dialog.className = "writer-modal";
  dialog.innerHTML = `<header><h2>${esc(title)}</h2><button class="icon-button" aria-label="닫기" data-close>×</button></header><div class="modal-body">${html}</div>`;
  document.body.append(dialog); $('[data-close]',dialog).onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove()); dialog.showModal(); setup?.(dialog); return dialog;
}
function writerAddEntity() {
  if (state.tab === "locations") return regionWizard();
  if (state.tab === "people") {
    const person = { id: makeId("person"), name: "새 캐릭터", role: "주민", personality: ["신중함"], relationToPlayer: "처음 만나는 사이", inventoryItemIds: [], locationId: state.document.locations[0]?.id ?? "shelter", summary: "" };
    state.document.people.push(person); go("people", person.id); markDirty(); return;
  }
  const story = newStory(writer.filterLocation || "shelter"); writer.graphMode = "scene"; startStoryGuide(story, 1); go("stories", story.id, story.scenes[0].id); markDirty();
}
function regionWizard() {
  const draft = { name: "", summary: "", neighbor: state.document.locations[0]?.id ?? "shelter", opening: "" }; let step = 1;
  const draw = () => modal(`새 지역 만들기 · ${step}/3`, `<p class="muted">${["", "지역의 이름과 분위기를 정해 주세요.", "기존 월드에서 이어지는 길을 선택하세요.", "플레이어가 처음 보게 될 장면을 작성하세요."][step]}</p>${step === 1 ? field("지역 이름", "name", draft.name) + area("지역 소개", "summary", draft.summary) : step === 2 ? select("연결할 지역 · 왕복 이동", "neighbor", locEntries(), draft.neighbor, false) : area("첫 장면 원고", "opening", draft.opening)}<div class="writer-toolbar">${step > 1 ? btn("이전", "previous") : ""}${btn(step < 3 ? "다음" : "지역 만들기", "next", "primary")}</div>`, dialog => {
    bindWriter(dialog, draft, () => {}, false);
    listen("previous", () => { step--; draw(); },dialog);
    listen("next", () => {
      if (step === 1 && !draft.name.trim()) return showToast("지역 이름을 입력해 주세요.", true);
      if (step < 3) { step++; return draw(); }
      const neighbor = state.document.locations.find(l => l.id === draft.neighbor);
      if (!neighbor) return showToast("연결할 지역을 선택해 주세요.", true);
      const id = makeId("region"); const occupied = new Set(state.document.locations.filter(l => l.mapPosition).map(l => `${l.mapPosition.q},${l.mapPosition.r}`));
      let q = (neighbor.mapPosition?.q ?? 0) + 1, r = neighbor.mapPosition?.r ?? 0;
      while (occupied.has(`${q},${r}`)) q++;
      const location = { id, name: draft.name, summary: draft.summary, risk: "low", imagePath: null, mapPosition: { q, r }, tags: neighbor.tags.filter(tag=>tag.startsWith("realm:")), traits: [], obtainableItemIds: [], residentIds: [], neighbors: [neighbor.id], links: { [neighbor.id]: { note: `${neighbor.name}(으)로 돌아간다.` } }, interactionChoices: [], eventIds: [], stockNodes: [], monsters: [], discoveryConditions: [{ type: "location_visited", locationId: neighbor.id }] };
      neighbor.neighbors.push(id); neighbor.links[id] = { note: `${draft.name}(으)로 이동한다.` }; state.document.locations.push(location);
      const opening = newScene(id, `${draft.name}의 첫인상`); opening.paragraphs = [draft.opening || draft.summary || draft.name]; delete opening.blocks;
      state.document.stories.push({ ...newStoryShape(id), id: `region_story_${id}`, title: `${draft.name} · 기본 장면`, native: "region", once: false, scenes: [opening] });
      dialog.close(); go("locations", id); markDirty();
    },dialog);
  }); draw();
}
function newStoryShape(locationId) { return { title: "", locationId, entryLabel: "", entryHint: "", enabled: true, status: "draft", tags: [], conditions: [], personIds: [], actions: [], layout: {} }; }
function relatedLinks(stories) { return stories.map(s => `<button class="related-link" data-story="${esc(s.id)}">${esc(s.title)} <span>→</span></button>`).join("") || '<p class="muted">연결된 이벤트가 없습니다.</p>'; }
function bindRelated(root = ui.editorPanel) { $$('[data-story]',root).forEach(b=>b.onclick=()=>go("stories",b.dataset.story)); }
function renderLocation(location) {
  const entries=studioRegionActions(state.document,location.id);
  const related = state.document.stories.filter(s=>s.locationId===location.id);
  ui.editorPanel.innerHTML = `<div class="writer-header"><div><span class="eyebrow">WORLD</span><h2>${esc(location.name)}</h2><p>길, 등장인물, 이야기의 시작을 한곳에서 관리합니다.</p></div></div><div class="writer-single">${regionActionSection(entries,"regionActionEditor",location.id)}${section("지역 소개", `<div id="regionInfo" class="field-grid">${field("이름", "name", location.name)}${select("위험도", "risk", [["low","낮음"],["medium","보통"],["high","높음"]],location.risk,false)}${area("소개", "summary", location.summary)}${field("이미지 경로 · 선택", "imagePath", location.imagePath)}</div>`)}${section("월드 지도", `<p class="muted">기존 게임과 같은 헥사타일 지도입니다. 빈 타일을 선택하면 이동하며, 지도를 스크롤해 주변을 볼 수 있습니다.</p><div id="regionMap"></div><div id="positionFields" class="field-grid">${field("헥사 좌표 q", "q", location.mapPosition?.q ?? 0, "number")}${field("헥사 좌표 r", "r", location.mapPosition?.r ?? 0, "number")}</div>`)}${section("연결된 길", `<div id="regionLinks">${Object.keys(location.links).map(id=>`<div class="reward-row"><span>${esc(state.document.locations.find(l=>l.id===id)?.name ?? id)}</span><button class="button ghost small" data-unlink="${esc(id)}">연결 해제</button></div>`).join("")}</div>${select("새로 연결할 지역 · 왕복", "neighbor",locEntries().filter(([id])=>id!==location.id && !location.links[id]),"")}${btn("길 연결", "link")}`)}<div id="discovery">${arrayEditorHtml({ discoveryConditions: location.discoveryConditions ?? [] },"discoveryConditions","condition","발견 조건","모든 조건을 충족하면 지도에 표시됩니다. 조건이 없으면 바로 발견합니다.")}</div>${section("등장인물",state.document.people.filter(p=>p.locationId===location.id).map(p=>`<button class="related-link" data-person="${esc(p.id)}">${esc(p.name)} →</button>`).join("") || '<p class="muted">배치된 인물이 없습니다.</p>')}${section("지역의 이벤트",relatedLinks(related),btn("이벤트 추가","newStory"))}</div>`;
  bindRegionActions(entries,$("#regionActionEditor").closest(".form-section"),"regionActionEditor");
  bindWriter($("#regionInfo"),location,(key,value)=>{if(key==="imagePath"&&!value)location.imagePath=null;});
  location.mapPosition ??= {q:0,r:0}; bindWriter($("#positionFields"),location.mapPosition,()=>drawRegionMap(location));
  location.discoveryConditions ??= []; bindArrayEditors($("#discovery"),location);
  listen("link",()=>{const id=$('[data-w="neighbor"]').value;const other=state.document.locations.find(l=>l.id===id);if(!other)return;
    location.links[id]={note:`${other.name}(으)로 이동한다.`};other.links[location.id]={note:`${location.name}(으)로 이동한다.`};location.neighbors=[...new Set([...location.neighbors,id])];other.neighbors=[...new Set([...other.neighbors,location.id])];markDirty();renderEditor();});
  $$('[data-unlink]').forEach(b=>b.onclick=()=>{const other=state.document.locations.find(l=>l.id===b.dataset.unlink);delete location.links[b.dataset.unlink];location.neighbors=location.neighbors.filter(id=>id!==b.dataset.unlink);if(other){delete other.links[location.id];other.neighbors=other.neighbors.filter(id=>id!==location.id);}markDirty();renderEditor();});
  $$('[data-person]').forEach(b=>b.onclick=()=>go("people",b.dataset.person));bindRelated();listen("newStory",()=>{const story=newStory(location.id);startStoryGuide(story,1);go("stories",story.id,story.scenes[0].id);markDirty();});drawRegionMap(location);
}
function regionHexLayout(center, size = 46, radius = 3) {
  const height = Math.sqrt(3) * size;
  const padding = 8;
  const width = size * (3 * radius + 2) + padding * 2;
  const boardHeight = height * (2 * radius + 1) + padding * 2;
  const cells = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      // Same flat-top axial projection as app-api.js:hexToPixel.
      cells.push({
        q: center.q + dq, r: center.r + dr,
        x: width / 2 + size * 1.5 * dq,
        y: boardHeight / 2 + height * (dr + dq / 2),
      });
    }
  }
  return { cells, width, height: boardHeight, tileWidth: size * 2, tileHeight: height };
}
function drawRegionMap(location) {
  const root = $("#regionMap");
  if (!root) return;
  const realm = location.tags.find(t => t.startsWith("realm:")) ?? "realm:seoul";
  const points = state.document.locations.filter(l => l.mapPosition && (l.tags.find(t => t.startsWith("realm:")) ?? "realm:seoul") === realm);
  const layout = regionHexLayout(location.mapPosition ?? { q: 0, r: 0 });
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "헥사 월드 지도 · 빈 타일을 선택해 지역 이동");
  root.innerHTML = `<div class="region-hex-board" style="width:${layout.width}px;height:${layout.height}px;--tile-width:${layout.tileWidth}px;--tile-height:${layout.tileHeight}px">${layout.cells.map(({ q, r, x, y }) => {
    const at = points.find(l => l.mapPosition.q === q && l.mapPosition.r === r);
    const selected = at?.id === location.id;
    const occupied = at && !selected;
    const label = `${at?.name ?? "빈 타일"} · q ${q}, r ${r}${selected ? " · 현재 위치" : occupied ? " · 다른 지역이 사용 중" : " · 여기로 이동"}`;
    return `<button type="button" class="map-cell ${selected ? "selected" : ""}" style="left:${x}px;top:${y}px" data-q="${q}" data-r="${r}" aria-pressed="${selected}" aria-label="${esc(label)}" ${occupied ? "disabled" : ""} title="${esc(label)}"><span class="map-cell-name">${esc(at?.name ?? "＋")}</span><span class="map-cell-coord">${q}, ${r}</span></button>`;
  }).join("")}</div>`;
  $$('.map-cell', root).forEach(button => button.onclick = () => {
    if (button.disabled || button.getAttribute("aria-pressed") === "true") return;
    location.mapPosition = { q: Number(button.dataset.q), r: Number(button.dataset.r) };
    markDirty();
    renderEditor();
    $('#regionMap .selected')?.focus({ preventScroll: true });
  });
  root.scrollLeft = Math.max(0, (layout.width - root.clientWidth) / 2);
  root.scrollTop = Math.max(0, (layout.height - root.clientHeight) / 2);
}
function renderPerson(person) {
  const related=state.document.stories.filter(s=>studioStoryPeople(s,state.document.people).some(p=>p.id===person.id));
  ui.editorPanel.innerHTML=`<div class="writer-header"><div><span class="eyebrow">CHARACTER</span><h2>${esc(person.name)}</h2><p>인물 설정과 이 인물이 등장하는 이야기를 관리합니다.</p></div></div><div class="writer-single">${section("캐릭터 설정",`<div id="personInfo" class="field-grid">${field("이름","name",person.name)}${field("역할","role",person.role)}${select("머무는 지역","locationId",locEntries(),person.locationId,false)}${field("성격 · 쉼표로 구분","personalityText",person.personality.join(", "))}${area("소개","summary",person.summary)}${area("플레이어와의 관계","relationToPlayer",person.relationToPlayer)}</div>`)}${section("대화와 이벤트",relatedLinks(related),btn("대화 이벤트 만들기","newDialogue","primary"))}</div>`;
  bindWriter($("#personInfo"),person,(key,value)=>{if(key==="personalityText"){person.personality=value.split(",").map(x=>x.trim()).filter(Boolean);if(!person.personality.length)person.personality=[""];delete person.personalityText;}});
  bindRelated();listen("newDialogue",()=>{const story=newStory(person.locationId,person.id);story.title=`${person.name} · 대화`;story.entryLabel=`${person.name}에게 말을 건다`;startStoryGuide(story,1);go("stories",story.id,story.scenes[0].id);markDirty();});
}
renderStory = function(story) {
  const scene=story.scenes.find(s=>s.id===state.selectedSceneId)??story.scenes[0];state.selectedSceneId=scene?.id??null;
  const choice=scene?.choices.find(c=>c.id===state.selectedChoiceId)??scene?.choices[0];state.selectedChoiceId=choice?.id??null;
  story.layout??={};story.personIds??=[];story.actions??=[];
  const prerequisites=story.prerequisite??{};
  const prior=state.document.stories.find(s=>s.id===prerequisites.storyId);
  ui.editorPanel.innerHTML=`<div class="writer-header"><div><span class="eyebrow">STORY WORKSPACE</span><h2>${esc(story.title)}</h2><p>${story.native?"기존 월드 콘텐츠 · 연결과 실행 규칙을 보존하며 편집합니다.":"원고를 쓰고 선택지를 연결해 이야기를 완성하세요."}</p></div><div class="writer-toolbar">${btn("이야기 목록","library")}${btn("연결 검사","validate")}${btn("시험 플레이","preview","primary")}${btn("원고 내보내기","export")}</div></div><div class="writer-mobile-tabs">${btn("원고","manuscript")}${btn("흐름도","flow")}</div><div class="writer-workspace" data-pane="${writer.mobilePane}"><div class="manuscript-pane">
    ${story.actions.length?regionActionSection(story.actions.map(action=>({action,story,locationId:story.locationId})),"nativeActionEditor",story.locationId):""}
    ${section("이벤트 설정",`<div id="storyInfo" class="field-grid">${field("제목","title",story.title)}${select("발생 지역","locationId",locEntries(),story.locationId,false)}${field("게임에서 시작하는 버튼","entryLabel",story.entryLabel)}${select("작성 상태","status",[["draft","작성 중"],["ready","검토 완료"]],story.status,false)}${check("게임에 포함","enabled",story.enabled)}${story.native!=="region"?check("한 번만 발생","once",story.once??false):""}</div><div class="cast-picker">${story.personIds.map(id=>`<span class="badge">${esc(state.document.people.find(p=>p.id===id)?.name??id)} <button data-remove-person="${esc(id)}" aria-label="등장인물 제외">×</button></span>`).join("")}${select("등장인물 추가","cast",personEntries().filter(([id])=>!story.personIds.includes(id)),"")}</div>`)}
    ${section("이전 이야기와 연결",`<div id="prerequisite" class="field-grid">${select("먼저 진행할 이벤트","storyId",storyEntries().filter(([id])=>id!==story.id),prerequisites.storyId)}${select("필요한 진행 · 비우면 이벤트 완료","choiceId",prior?.scenes.flatMap(s=>s.choices.map(c=>[c.id,c.label]))??[],prerequisites.choiceId)}</div><p class="muted">이전 이야기 조건과 아래 발생 조건을 모두 충족하면 시작할 수 있습니다.</p>`)}
    <div id="storyConditions">${arrayEditorHtml(story,"conditions","condition","발생 조건","조건이 없으면 해당 지역에서 바로 시작할 수 있습니다.")}</div>
    ${section("장면",`<div class="scene-tabs">${story.scenes.map(s=>`<button type="button" class="pill-button ${s.id===scene?.id?"active":""}" data-scene="${esc(s.id)}">${esc(s.title||"제목 없는 장면")}</button>`).join("")}</div>`,btn("장면 추가","addScene"))}
    ${scene?section("장면 원고",`<div id="sceneInfo" class="field-grid">${field("장면 제목","title",scene.title)}${check("종료 장면 · 이벤트 완료 기록","terminal",scene.terminal)}${check("대화 중 지역 행동 숨기기","suppressLocationInteractions",scene.suppressLocationInteractions??!story.native)}</div><div id="storyBlocks">${(scene.blocks??scene.paragraphs.map(text=>({text}))).map((block,i)=>`<div class="dialogue-block" data-block="${i}"><div class="writer-toolbar"><select aria-label="화자" data-speaker="${i}">${options([["","설명문"],["protagonist","플레이어"],...personEntries()],block.speakerId??"")}</select><button class="button ghost small" data-remove-block="${i}" aria-label="문단 삭제">×</button></div><textarea aria-label="원고 문단 ${i+1}" data-block-text="${i}" placeholder="이 장면의 이야기 또는 대사를 입력하세요.">${esc(resolveItemTextPreview(block.text))}</textarea></div>`).join("")}</div><div class="writer-toolbar">${btn("문단·대사 추가","addBlock")}${!story.native?btn("장면 삭제","deleteScene"):""}</div>`):""}
    ${scene?section("플레이어의 선택",`<div class="choice-tabs">${scene.choices.map(c=>`<button class="pill-button ${c.id===choice?.id?"active":""}" data-choice="${esc(c.id)}">${esc(resolveItemTextPreview(c.label))}</button>`).join("")||(story.actions.length?'<p class="muted">이 장면에서는 위의 지역 선택지를 사용합니다. 이 장면만의 선택지도 추가할 수 있습니다.</p>':'<p class="muted">선택지를 추가해 이야기를 이어 주세요.</p>')}</div>`,btn("선택지 추가","addChoice")):""}
    ${choice?`<div id="choiceEditor">${section("선택지 내용",`<div id="choiceInfo" class="field-grid">${field("선택지 문구","label",resolveItemTextPreview(choice.label))}${field("보조 안내","outcomeHint",choice.outcomeHint)}${check("보상·결과 안내 표시","showOutcomeHint",choice.showOutcomeHint)}${check("한 번만 선택 가능","once",choice.once)}</div>`)}<div id="choiceOutcomeEditor"></div><div id="choiceRewards"></div><div id="choiceConditions">${arrayEditorHtml(choice,"conditions","condition","선택할 수 있는 조건","필요한 아이템과 이전 이야기 상태를 설정합니다.")}</div>${section("다음 이야기",`<div id="choiceConnection" class="field-grid">${select("다음 장면","nextSceneId",story.scenes.map(s=>[s.id,s.title]),choice.nextSceneId)}${select("다음 이벤트 · 다른 지역이면 이동 후 시작","nextStoryId",storyEntries(),choice.nextStoryId)}${check("이 선택으로 현재 이벤트 마치기","endsStory",choice.endsStory)}</div>${btn("새 장면을 만들고 연결","addConnected")}`)}<details class="advanced"><summary>조건 미충족 시 결과</summary><div id="choiceEffects">${arrayEditorHtml(choice,"failureEffects","effect","실패 시 결과","기존 콘텐츠의 실패 결과와 확률 결과를 보존합니다.")}</div></details>${btn("선택지 삭제","deleteChoice")}</div>`:""}
    ${story.actions.length?`<select id="nativeAction" hidden aria-hidden="true"><option value=""></option>${options(story.actions.map(a=>[a.id,a.label]),"")}</select>`:""}
    </div><aside class="flow-pane"><div class="graph-toolbar"><select id="graphMode" aria-label="흐름도 범위">${options([["scene","이벤트 내부"],["story","전체 이야기"]],writer.graphMode)}</select>${btn("−","zoomOut")}${btn("＋","zoomIn")}${btn("자동 정렬","arrange")}</div><p class="graph-legend"><span>── 즉시 연결</span><span>┄┄ 조건 충족 후</span></p><div id="storyGraph" class="story-graph"></div><div id="writerIssues"></div></aside></div>`;
  const info=$("#storyInfo");if(story.native)$('[data-w="locationId"]',info).disabled=true;
  info.insertAdjacentHTML('beforeend',area('이벤트 진입 안내','entryHint',story.entryHint??''));
  bindWriter(info,story,(key,value)=>{if(key==="locationId")story.scenes.forEach(s=>s.locationId=value);});
  $('[data-w="cast"]').onchange=e=>{if(e.target.value)story.personIds.push(e.target.value);markDirty();renderEditor();};
  $$('[data-remove-person]').forEach(b=>b.onclick=()=>{story.personIds=story.personIds.filter(id=>id!==b.dataset.removePerson);markDirty();renderEditor();});
  $$('[data-w]',$("#prerequisite")).forEach(input=>input.onchange=()=>{
    if(input.dataset.w==="storyId")story.prerequisite=input.value?{storyId:input.value}:undefined;
    else if(story.prerequisite){if(input.value)story.prerequisite.choiceId=input.value;else delete story.prerequisite.choiceId;}
    markDirty();renderEditor();
  });bindArrayEditors($("#storyConditions"),story);
  $$('[data-scene]').forEach(b=>b.onclick=()=>go("stories",story.id,b.dataset.scene));
  listen("addScene",()=>{const sc=newScene(story.locationId);story.scenes.push(sc);go("stories",story.id,sc.id);markDirty();});
  listen("library",showStoryLibrary);listen("validate",validateWriter);listen("preview",()=>openPreview(story));listen("export",exportDraft);
  listen("manuscript",()=>{writer.mobilePane="manuscript";$('.writer-workspace').dataset.pane=writer.mobilePane;});listen("flow",()=>{writer.mobilePane="flow";$('.writer-workspace').dataset.pane=writer.mobilePane;});
  if(scene){
    bindWriter($("#sceneInfo"),scene,(key,value)=>{
      if(key==="terminal"&&value&&!scene.choices.length&&!story.native){const c=newChoice("이야기를 마친다");c.endsStory=true;scene.choices.push(c);renderEditor();}
    });
    const ensureBlocks=()=>{scene.blocks??=scene.paragraphs.map(text=>({text}));return scene.blocks;};
    $$('[data-speaker]').forEach(input=>input.onchange=()=>{const block=ensureBlocks()[Number(input.dataset.speaker)];if(input.value)block.speakerId=input.value;else delete block.speakerId;markDirty();});
    $$('[data-block-text]').forEach(input=>{
      const index=Number(input.dataset.blockText);
      input.oninput=()=>{ensureBlocks()[index].text=input.value;markDirty();};
      StudioItemTextEditor.mount(input,scene.blocks?.[index]?.text??scene.paragraphs[index]??'',{key:`${scene.id}:block:${index}`});
    });
    $$('[data-remove-block]').forEach(b=>b.onclick=()=>{ensureBlocks().splice(Number(b.dataset.removeBlock),1);markDirty();renderEditor();});
    listen("addBlock",()=>{ensureBlocks().push({text:""});markDirty();renderEditor();});
    listen("deleteScene",()=>deleteScene(story,scene));
    listen("addChoice",()=>{const c=newChoice();scene.choices.push(c);state.selectedChoiceId=c.id;markDirty();renderEditor();});
    $$('[data-choice]').forEach(b=>b.onclick=()=>{synchronizeSharedChoices();state.selectedChoiceId=b.dataset.choice;renderEditor();});
  }
  if(choice){
    bindWriter($("#choiceInfo"),choice);bindArrayEditors($("#choiceConditions"),choice);bindArrayEditors($("#choiceEffects"),choice);
    renderOutcomeEditor(choice,document.querySelector("#choiceOutcomeEditor"),story);

    bindWriter($("#choiceConnection"),choice,(key,value)=>{
      if(!value)delete choice[key];
      if(key==="nextStoryId"&&value){delete choice.nextSceneId;delete choice.nextEventId;}
      if(key==="nextSceneId"&&value){delete choice.nextStoryId;delete choice.nextEventId;}
      if(key!=="endsStory"){synchronizeSharedChoices();renderEditor();}
    });
    listen("addConnected",()=>{const next=newScene(story.locationId);story.scenes.push(next);choice.nextSceneId=next.id;delete choice.nextStoryId;synchronizeSharedChoices();go("stories",story.id,next.id);markDirty();});
    listen("deleteChoice",()=>{const refs=state.document.stories.filter(s=>s.prerequisite?.choiceId===choice.id);if(refs.length)return showToast(`먼저 후속 이벤트 연결을 바꿔 주세요: ${refs.map(s=>s.title).join(", ")}`,true);scene.choices=scene.choices.filter(c=>c.id!==choice.id);state.selectedChoiceId=null;markDirty();renderEditor();});
  }
  const actionPicker=$("#nativeAction");if(actionPicker){
    const entries=story.actions.map(action=>({action,story,locationId:story.locationId}));
    bindRegionActions(entries,$('#nativeActionEditor').closest('.form-section'),'nativeActionEditor');
    actionPicker.onchange=()=>{const entry=entries.find(row=>row.action.id===actionPicker.value);if(entry){writer.selectedActionId=entry.action.id;const root=$('#nativeActionEditor');if(root.closest('details'))root.closest('details').open=true;renderRegionActionEditor(entry,root);}};
  }
  $('#graphMode').onchange=e=>{writer.graphMode=e.target.value;drawGraph();};listen("zoomIn",()=>{writer.zoom=Math.min(1.8,writer.zoom+.15);drawGraph();});listen("zoomOut",()=>{writer.zoom=Math.max(.35,writer.zoom-.15);drawGraph();});
  listen("arrange",()=>{const entities=writer.graphMode==="story"?state.document.stories:studioGraphNodes(story);const positions=writer.graphMode==="story"?state.document.layout:story.layout;entities.forEach((e,i)=>positions[e.id]={x:30+(i%3)*260,y:35+Math.floor(i/3)*170});markDirty();drawGraph();});enhanceStoryWorkspace(story,scene,choice);drawGraph();renderIssues();
};
function deleteScene(story,scene){
  const sources=studioContentLinks(state.document).filter(link=>link.to===scene.id&&link.from!==scene.id).map(link=>resolveItemTextPreview(link.label));
  if(sources.length)return showToast(`먼저 연결을 바꿔 주세요: ${sources.join(", ")}`,true);
  if(story.scenes.length===1)return showToast("시작 장면은 하나 이상 필요합니다.",true);
  story.scenes=story.scenes.filter(s=>s.id!==scene.id);state.selectedSceneId=null;markDirty();renderEditor();
}
function renderRewards(choice,root){
  const stocks=choice.effects.filter(effect=>studioStockReward(state.document,effect));
  const explanation=stocks.length?'보관 장소에서 가져오는 아이템도 여기에 표시됩니다. 가져온 만큼 그 장소에서 줄어들며, 비어 있으면 지급되지 않습니다.':('weight' in choice?'이 결과가 뽑혔을 때만 지급됩니다.':'정상 실행 시 확정 지급됩니다.');
  const moneyRows=choice.effects.map((effect,index)=>({effect,index})).filter(({effect})=>['collect_stock_money','collect_stock_money_all'].includes(effect.type));
  const hasItems=choice.effects.some(effect=>['add_item','collect_stock_item','collect_stock_item_all'].includes(effect.type));
  const hasCosts=choice.effects.some(effect=>effect.type==='remove_item');
  const rewardTitle='weight' in choice?'이 결과에서 얻는 아이템':'선택하면 얻는 아이템';
  const rewardActions=btn('아이템 추가','addReward','secondary')+btn('새 아이템 만들기','createReward');
  root.innerHTML=(hasItems?section(rewardTitle,`<p class="muted">${explanation} 필요한 아이템의 소모는 아래에서 따로 설정하세요.</p><div class="reward-list">${rewardRows(choice,'add_item')}</div><div class="writer-toolbar">${rewardActions}</div>`):writerEmptySection(rewardTitle,'보상 아이템 없음',rewardActions))
    +(moneyRows.length?section('얻는 돈',`<p class="muted">보관 장소에 남은 돈을 가져옵니다.</p>${moneyRows.map(({effect,index})=>stockRewardRow(effect,index)).join('')}`):'')
    +(hasCosts?section('소모하는 아이템',`<div class="reward-list">${rewardRows(choice,'remove_item')}</div>${btn('소모 아이템 추가','addCost')}`):writerEmptySection('소모하는 아이템','소모 없음',btn('소모 아이템 추가','addCost')));
  $$('[data-reward-amount]',root).forEach(input=>{const effect=choice.effects[Number(input.dataset.rewardAmount)];input.oninput=()=>{if(!input.validity.valid||!input.value||!choice.effects.includes(effect))return;effect.amount=Number(input.value);markDirty();};});
  $$('[data-reward-remove]',root).forEach(button=>{const effect=choice.effects[Number(button.dataset.rewardRemove)];button.onclick=()=>{const index=choice.effects.indexOf(effect);if(index>=0)choice.effects.splice(index,1);markDirty();renderRewards(choice,root);};});
  $$('[data-stock-mode]',root).forEach(input=>{const effect=choice.effects[Number(input.dataset.stockMode)];input.onchange=()=>{if(!choice.effects.includes(effect))return;studioSetStockRewardMode(effect,input.value,effect.amount??1);markDirty();renderRewards(choice,root);};});
  $$('[data-stock-initial]',root).forEach(input=>{const effect=choice.effects[Number(input.dataset.stockInitial)];input.oninput=()=>{
    if(!input.value||!input.validity.valid||!choice.effects.includes(effect))return;
    try {studioSetStockInitialQuantity(state.document,effect,Number(input.value));const reward=studioStockReward(state.document,effect);$('[data-stock-initial-summary]',input.closest('.stock-reward')).textContent=`처음 ${reward.initial.toLocaleString('ko-KR')}${reward.money?'원':'개'} · 실제 획득량은 남은 수량에 따라 달라집니다.`;markDirty();}
    catch(error){showToast(error.message,true);}
  };});
  listen('addReward',()=>itemPicker(choice,'add_item',()=>renderRewards(choice,root)),root);listen('addCost',()=>itemPicker(choice,'remove_item',()=>renderRewards(choice,root)),root);listen('createReward',()=>createRewardItem(choice,()=>renderRewards(choice,root)),root);
}
function stockRewardRow(effect,index){
  const reward=studioStockReward(state.document,effect),unit=reward.money?'원':'개',name=reward.name,source=reward.node?.name??'보관 장소';
  return `<div class="reward-row stock-reward" data-stock-reward="${index}"><div class="stock-reward-heading"><div><strong>${esc(name)}</strong><small>${esc(reward.item?.description??reward.node?.summary??'')}</small></div><button type="button" class="remove-row" data-reward-remove="${index}" aria-label="${esc(name)} 보상 제거">×</button></div><p class="stock-reward-source">${esc(reward.source)}에서 가져오기</p>${reward.missing?'<p class="field-error">아이템 또는 보관 장소 연결을 확인해 주세요.</p>':`<p class="stock-initial-summary" data-stock-initial-summary>처음 ${reward.initial.toLocaleString('ko-KR')}${unit} · 실제 획득량은 남은 수량에 따라 달라집니다.</p>`}<div class="stock-reward-settings"><label class="field"><span>가져오는 방식</span><select aria-label="${esc(name)} 가져오는 방식" data-stock-mode="${index}" ${reward.missing?'disabled':''}>${options([['all',reward.money?'남은 금액 전부':'남은 수량 전부'],['amount',reward.money?'최대 금액 지정':'최대 수량 지정']],reward.all?'all':'amount')}</select></label>${!reward.all?`<label class="field"><span>한 번에 최대</span><div><input type="number" min="1" step="1" data-reward-amount="${index}" aria-label="${esc(name)} 최대 ${reward.money?'금액':'수량'}" value="${effect.amount}"> ${unit}</div></label>`:''}</div>${!reward.all?'<p class="muted">남은 수량이 적으면 남아 있는 만큼만 가져옵니다.</p>':''}${!reward.missing?`<details class="stock-initial-settings"><summary>${esc(source)}의 처음 ${reward.money?'금액':'수량'} 설정</summary><label class="field"><span>새 게임에서 ${esc(source)}에 놓일 ${esc(name)}</span><div><input type="number" min="0" step="1" data-stock-initial="${index}" aria-label="${esc(source)} ${esc(name)} 처음 ${reward.money?'금액':'수량'}" value="${reward.initial}"> ${unit}</div></label><p class="muted">같은 보관 장소를 사용하는 선택지에 함께 적용됩니다. 시험 중 이미 가져간 수량은 유지되며, 처음부터 확인하려면 시험을 다시 시작하세요.</p></details>`:''}</div>`;
}
function rewardRows(choice,type){
  return choice.effects.map((effect,index)=>({effect,index})).filter(({effect})=>effect.type===type||(type==='add_item'&&['collect_stock_item','collect_stock_item_all'].includes(effect.type))).map(({effect,index})=>{
    if(studioStockReward(state.document,effect))return stockRewardRow(effect,index);
    const item=state.document.items.find(item=>item.id===effect.itemId);
    return `<div class="reward-row"><div><strong>${esc(item?.name??'연결이 끊어진 아이템')}</strong><small>${esc(item?.description??effect.itemId)}</small></div><label><input aria-label="${esc(item?.name??effect.itemId)} 수량" type="number" min="1" step="1" value="${effect.amount??1}" data-reward-amount="${index}"> 개</label><button type="button" class="remove-row" data-reward-remove="${index}" aria-label="아이템 제거">×</button></div>`;
  }).join('')||'<p class="muted">설정된 아이템이 없습니다.</p>';
}
function addReward(choice,type,itemId,amount=1){
  if(!studioAddItemReward(choice,type,itemId,amount)){showToast('이미 보관 장소에서 전부 가져오는 아이템입니다. 해당 행에서 가져오는 방식과 처음 수량을 수정하세요.');return;}
  markDirty();
}
function itemPicker(choice,type,done){
  modal(type==="add_item"?"얻는 아이템 선택":"소모하는 아이템 선택",'<input id="itemSearch" type="search" placeholder="아이템 이름 검색" aria-label="아이템 이름 검색"><div id="itemPickerResults"></div>',dialog=>{
    const render=()=>{const query=$('#itemSearch',dialog).value.toLowerCase();$('#itemPickerResults',dialog).innerHTML=state.document.items.filter(i=>i.name.toLowerCase().includes(query)).map(i=>`<button class="item-result" data-item="${esc(i.id)}"><strong>${esc(i.name)}</strong><small>${esc(i.description)}</small></button>`).join("");$$('[data-item]',dialog).forEach(b=>b.onclick=()=>{addReward(choice,type,b.dataset.item);dialog.close();done();});};$('#itemSearch',dialog).oninput=render;render();$('#itemSearch',dialog).focus();
  });
}
function createRewardItem(choice,done){
  const item={id:makeId("item"),name:"",description:"",kind:"material",rarity:"common",price:0,tags:[],effects:{hp:0,mind:0,energy:0,exhaustionRelief:0}};
  modal("새 보상 아이템",`<div id="quickItem" class="field-grid">${field("아이템 이름","name","")}${select("종류","kind",[["material","재료"],["food","음식"],["drink","음료"],["medicine","약품"],["trade","거래품"],["ticket","표"],["tool","도구"]],item.kind,false)}${area("설명","description","")}${field("가격","price",0,"number")}</div><p class="muted">기본 등급은 일반입니다. 생성 후 아이템 메뉴에서 사용 효과와 상세 설정을 편집할 수 있습니다.</p>${btn("아이템 생성 후 보상에 추가","create","primary")}`,dialog=>{bindWriter($('#quickItem',dialog),item,()=>{},false);listen("create",()=>{if(!item.name.trim())return showToast("이름을 입력해 주세요.",true);if(!Number.isInteger(item.price)||item.price<0)return showToast("가격은 0 이상의 정수로 입력해 주세요.",true);if(item.kind==="tool")item.maxDurability=10;state.document.items.push(item);addReward(choice,"add_item",item.id);dialog.close();done();renderCounts();},dialog);});
}
function conditionLabel(condition){
  const stock = studioStockConditionLabel(state.document,condition); if(stock)return stock;
  const item=state.document.items.find(i=>i.id===condition.itemId)?.name??condition.itemId;
  const loc=state.document.locations.find(l=>l.id===condition.locationId)?.name??condition.locationId;
  const labels={has_item:`${item} ${condition.amount??1}개 보유`,not_has_item:`${item} 미보유`,day_gte:`${condition.value}일째부터`,day_lt:`${condition.value}일째 이전`,location_visited:`${loc} 방문`,location:`${loc}에서`,money_gte:`${condition.amount}원 이상`,flag:flagLabel(condition.flag),flag_not:`${flagLabel(condition.flag)} 아님`};
  return labels[condition.type]??(CONDITION_TYPES.find(([id])=>id===condition.type)?.[1]??"추가 조건");
}
function flagEntries(){return [...new Map(state.document.stories.flatMap(s=>[[`studio_completed_${s.id}`,`${s.title} 완료`],...s.scenes.flatMap(sc=>sc.choices.map(c=>[`studio_chosen_${c.id}`,`${s.title} › ${resolveItemTextPreview(c.label)} 선택`]))])).entries()];}
function flagLabel(flag){
  const authored=flagEntries().find(([id])=>id===flag)?.[1];if(authored)return authored;
  const scenes=state.document.stories.flatMap(story=>story.scenes);
  const intro=scenes.find(scene=>scene.introFlag===flag);
  if(intro)return `${state.document.locations.find(location=>location.id===intro.locationId)?.name??intro.title} 첫 장면 확인`;
  const source=state.document.stories.flatMap(story=>[...story.actions,...story.scenes.flatMap(scene=>scene.choices)]).find(choice=>choice.effects.some(effect=>effect.type==='set_flag'&&effect.flag===flag));
  return source?`‘${resolveItemTextPreview(source.label)}’ 진행 후`:flag??'이야기 상태';
}
const originalConditionParams=conditionParams;
conditionParams=function(condition,index,arrayName){
  if(condition.type==="flag"||condition.type==="flag_not"){
    const entries=flagEntries();if(!entries.some(([id])=>id===condition.flag))entries.unshift([condition.flag,`기존 이야기 상태: ${condition.flag}`]);
    return `<select data-array="${arrayName}" data-index="${index}" data-key="flag">${options(entries,condition.flag)}</select>`;
  }
  if(condition.type==="location")return `<select data-array="${arrayName}" data-index="${index}" data-key="locationId">${locationOptions(condition.locationId)}</select>`;
  return originalConditionParams(condition,index,arrayName);
};
CONDITION_TYPES.find(([id])=>id==="flag")[1]="이전 선택 또는 이벤트 완료";CONDITION_TYPES.find(([id])=>id==="flag_not")[1]="아직 하지 않은 선택·이벤트";
CONDITION_TYPES.push(["location","현재 지역"]);
const originalDefaultCondition=defaultCondition;
defaultCondition=function(type){if(type==="location")return {type,locationId:state.document.locations[0]?.id??"shelter"};if(type==="flag"||type==="flag_not")return {type,flag:flagEntries()[0]?.[0]??"opening_seen"};return originalDefaultCondition(type);};
const originalArrayEditor=arrayEditorHtml;
arrayEditorHtml=function(owner,arrayName,kind,title,description){
  const types=kind==="condition"?CONDITION_TYPES:EFFECT_TYPES;
  for(const entry of owner[arrayName]??[])if(!types.some(([id])=>id===entry.type))types.push([entry.type,`기존 고급 설정 · ${entry.type}`]);
  return originalArrayEditor(owner,arrayName,kind,title,description);
};
const originalEffectParams=effectParams;
effectParams=function(effect,index,arrayName){if(effect.type==="set_scene")return `<select data-array="${arrayName}" data-index="${index}" data-key="sceneId">${options(state.document.stories.flatMap(s=>s.scenes.map(sc=>[sc.id,`${s.title} / ${sc.title}`])),effect.sceneId)}</select>`;return originalEffectParams(effect,index,arrayName);};
function drawGraph(){
  const root=$("#storyGraph");if(!root||state.tab!=="stories")return;
  const story=state.document.stories.find(s=>s.id===state.selectedId);if(!story)return;
  const overall=writer.graphMode==="story";const nodes=overall?state.document.stories:studioGraphNodes(story);
  const positions=overall?(state.document.layout??={}):(story.layout??={});
  const point=id=>positions[id]??{x:30+(nodes.findIndex(n=>n.id===id)%3)*260,y:35+Math.floor(nodes.findIndex(n=>n.id===id)/3)*170};
  const edges=[];
  const sceneOwners=new Map(state.document.stories.flatMap(s=>s.scenes.map(sc=>[sc.id,s.id])));
  const contentLinks=studioContentLinks(state.document);
  if(overall){
    for(const s of nodes)if(s.prerequisite)edges.push({from:s.prerequisite.storyId,to:s.id,conditional:true,label:s.prerequisite.choiceId?flagLabel(`studio_chosen_${s.prerequisite.choiceId}`):"완료 후"});
    for(const link of contentLinks)if(link.storyId!==link.targetStoryId)edges.push({from:link.storyId,to:link.targetStoryId,label:resolveItemTextPreview(link.label),conditional:link.conditional});
  }else for(const link of contentLinks)if(link.storyId===story.id&&link.targetStoryId===story.id)edges.push({...link,label:resolveItemTextPreview(link.label)});
  const width=Math.max(790,...nodes.map(n=>point(n.id).x+255));const height=Math.max(450,...nodes.map(n=>point(n.id).y+170));
  const paths=edges.filter(e=>nodes.some(n=>n.id===e.from)&&nodes.some(n=>n.id===e.to)).map(e=>{
    const a=point(e.from),b=point(e.to),x1=a.x+210,y1=a.y+58,x2=b.x,y2=b.y+58;
    const d=e.from===e.to?`M${x1},${y1} C${x1+90},${y1-150} ${x1-180},${y1-150} ${a.x+110},${a.y}`:`M${x1},${y1} C${x1+65},${y1} ${x2-65},${y2} ${x2},${y2}`;
    return `<g><path d="${d}" class="graph-edge ${e.conditional?"conditional":""}" marker-end="url(#arrow)"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-8}">${esc(e.label.length>18?e.label.slice(0,18)+"…":e.label)}</text></g>`;
  }).join("");
  const scroll={left:root.scrollLeft,top:root.scrollTop};
  root.innerHTML=`<div style="width:${width*writer.zoom}px;height:${height*writer.zoom}px"><div class="graph-canvas" style="width:${width}px;height:${height}px;transform:scale(${writer.zoom})"><svg class="graph-lines" width="${width}" height="${height}" aria-hidden="true"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#6b8054"/></marker></defs>${paths}</svg>${nodes.map((node,i)=>{const p=point(node.id);const selected=overall?node.id===state.selectedId:node.id===state.selectedSceneId;const visited=writer.preview?.trace.some(t=>t.sceneId===node.id);return `<article class="graph-node ${selected?"selected":""} ${visited?"visited":""}" style="left:${p.x}px;top:${p.y}px" data-node="${esc(node.id)}"><div class="node-handle" data-drag="${esc(node.id)}" title="끌어서 배치"><span>${overall?"이벤트":node.graphAction?"지역 행동":story.native?"기존 장면":i===0?"시작 장면":node.terminal?"종료 장면":"장면"}</span><span>⠿</span></div><button class="node-title" data-open-node="${esc(node.id)}">${esc(resolveItemTextPreview(node.title||"제목 없는 장면"))}</button><small>${overall?esc(state.document.locations.find(l=>l.id===node.locationId)?.name??""):esc((node.blocks?.[0]?.text??node.paragraphs[0]??"").slice(0,44))}</small>${overall&&node.conditions.length?`<small>${esc(node.conditions.map(conditionLabel).join(" · "))}</small>`:""}</article>`;}).join("")}</div></div>`;
  root.scrollLeft=scroll.left;root.scrollTop=scroll.top;
  $$('[data-open-node]',root).forEach(b=>b.onclick=()=>{if(overall){writer.graphMode="scene";go("stories",b.dataset.openNode);}else {const node=nodes.find(n=>n.id===b.dataset.openNode);go("stories",story.id,node.graphAction?undefined:node.id);if(node.graphAction){const picker=$("#nativeAction");picker.value=node.id;picker.onchange();$("#nativeActionEditor").scrollIntoView({block:"center"});}}});
  $$('[data-drag]',root).forEach(handle=>handle.onpointerdown=event=>{
    if(event.button!==0)return;event.preventDefault();const id=handle.dataset.drag,start=point(id),sx=event.clientX,sy=event.clientY;const card=handle.closest('.graph-node');handle.setPointerCapture(event.pointerId);
    handle.onpointermove=e=>{const x=Math.max(0,start.x+(e.clientX-sx)/writer.zoom),y=Math.max(0,start.y+(e.clientY-sy)/writer.zoom);positions[id]={x,y};card.style.left=`${x}px`;card.style.top=`${y}px`;};
    const finish=()=>{handle.onpointermove=null;handle.onpointerup=null;markDirty();drawGraph();};handle.onpointerup=finish;handle.onpointercancel=finish;
  });
}
async function validateWriter(){synchronizeSharedChoices();try{const response=await studioFetch('/api/content-studio/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.document)});const result=await response.json();if(!response.ok)throw new Error(result.message??'검사 실패');showIssues(result.issues);if(!result.issues.length)showToast("연결과 아이템 보상에 문제가 없습니다.");}catch(error){showToast(error.message,true);}}
function showIssues(issues){writer.issues=issues;renderIssues();if(!$('#writerIssues'))modal("콘텐츠 검사",issueMarkup(),bindIssues);}
function issueMarkup(){return writer.issues.length?writer.issues.map((issue,i)=>`<button class="studio-issue ${issue.severity}" data-issue="${i}"><strong>${issue.severity==='error'?'수정 필요':'확인 권장'}</strong><span>${esc(issue.message)}</span></button>`).join(''):'<p class="muted">연결 검사 결과가 여기에 표시됩니다.</p>';}
function renderIssues(){const root=$('#writerIssues');if(!root)return;root.innerHTML=issueMarkup();bindIssues(root);}
function bindIssues(root){$$('[data-issue]',root).forEach(b=>b.onclick=()=>{const issue=writer.issues[Number(b.dataset.issue)];$('#writerModal')?.close();go(issue.tab,issue.id,issue.sceneId,issue.choiceId);writer.mobilePane='manuscript';const pane=$('.writer-workspace');if(pane)pane.dataset.pane='manuscript';});}
function exportDraft(){const blob=new Blob([JSON.stringify(state.document,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='콘텐츠-스튜디오-초안.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function openPreview(story,sceneId,immediate=false){
  if(state.tab!=='stories'||state.selectedId!==story.id||(sceneId&&state.selectedSceneId!==sceneId))go('stories',story.id,sceneId);
  syncLivePreviewEditor();setLivePreviewPane('preview');
  if(immediate)return requestLivePreview({restart:true});
  const details=$('#writerLivePreview .live-preview-settings');if(details)details.open=true;
}
// Make navigating away from a shared native choice synchronize its other occurrences.
const originalRenderList=renderList;
renderList=function(){originalRenderList();if(state.tab==="stories"&&(writer.library||!selectedEntity()))renderStoryLibrary();renderWriterSceneNav();updateStudioAuthorMode();$$('[data-select-id]',ui.entityList).forEach(b=>b.addEventListener('click',()=>{captureWriterLibrary();synchronizeSharedChoices();},{capture:true}));};
const originalRenderEditor=renderEditor;
renderEditor=function(){const scroll=window.scrollY;StudioItemTextEditor.close();writer.activeAction=null;renderWriterSceneNav();if(state.tab==="stories"&&(writer.library||!selectedEntity())){renderStoryLibrary();updateStudioAuthorMode();syncLivePreviewEditor();return;}originalRenderEditor();updateStudioAuthorMode();enableReferenceSearch(ui.editorPanel);syncLivePreviewEditor();window.scrollTo({top:scroll});};
function enableReferenceSearch(root) {
  $$('select',root).filter(select=>select.options.length>9&&!select.hidden&&!select.dataset.referenceSearch&&!select.hasAttribute('data-array-type')).forEach(select=>{
    select.dataset.referenceSearch='true';
    const label=select.closest('label')?.querySelector('span')?.textContent?.trim();
    if(label)select.setAttribute('aria-label',label);
    const input=document.createElement('input'); input.type='search';input.placeholder='이름으로 찾기';input.className='reference-search';input.setAttribute('aria-label',label ? `${label} 이름 검색` : '연결 대상 이름 검색');
    select.before(input);input.oninput=()=>{const query=input.value.trim().toLowerCase();for(const option of select.options)option.hidden=Boolean(query)&&!option.textContent.toLowerCase().includes(query);};
  });
}
installOutcomeEditors();
installWriterWorkspace();
installLivePreview();
load();
