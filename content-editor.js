const ui = {
  tabs: Array.from(document.querySelectorAll("[data-tab]")),
  itemCount: document.querySelector("#itemCount"),
  recipeCount: document.querySelector("#recipeCount"),
  storyCount: document.querySelector("#storyCount"),
  listEyebrow: document.querySelector("#listEyebrow"),
  listTitle: document.querySelector("#listTitle"),
  searchInput: document.querySelector("#searchInput"),
  addButton: document.querySelector("#addButton"),
  entityList: document.querySelector("#entityList"),
  editorPanel: document.querySelector("#editorPanel"),
  saveButton: document.querySelector("#saveButton"),
  publishButton: document.querySelector("#publishButton"),
  saveState: document.querySelector("#saveState"),
  authGate: document.querySelector("#authGate"),
  authForm: document.querySelector("#authForm"),
  adminTokenInput: document.querySelector("#adminTokenInput"),
  authError: document.querySelector("#authError"),
  toast: document.querySelector("#toast"),
};

const ADMIN_TOKEN_STORAGE_KEY = "textrpg_content_studio_admin_token";

const state = {
  document: null,
  catalogs: {
    locations: [],
    quests: [],
    builtInItemIds: [],
    builtInRecipeIds: [],
  },
  tab: "stories",
  selectedId: null,
  selectedSceneId: null,
  selectedChoiceId: null,
  query: "",
  dirty: false,
  saving: false,
  publishing: false,
  status: {
    draftUpdatedAt: null,
    publishedAt: null,
    hasUnpublishedChanges: false,
  },
  adminToken: sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "",
};

const TAB_META = {
  items: { eyebrow: "ITEMS", title: "아이템", singular: "아이템" },
  recipes: { eyebrow: "RECIPES", title: "레시피", singular: "레시피" },
  stories: { eyebrow: "STORIES", title: "이벤트", singular: "이벤트" },
  locations: { eyebrow: "WORLD", title: "지역", singular: "지역" },
  people: { eyebrow: "CHARACTERS", title: "캐릭터", singular: "캐릭터" },
};

const CONDITION_TYPES = [
  ["has_item", "아이템 보유"],
  ["not_has_item", "아이템 미보유"],
  ["flag", "플래그 있음"],
  ["flag_not", "플래그 없음"],
  ["day_gte", "일차 이상"],
  ["day_lt", "일차 미만"],
  ["money_gte", "돈 이상"],
  ["stat_gte", "능력치 이상"],
  ["quest_state", "퀘스트 상태"],
  ["location_visited", "지역 방문"],
];

const EFFECT_TYPES = [
  ["add_item", "아이템 추가"],
  ["remove_item", "아이템 제거"],
  ["change_stat", "능력치 변경"],
  ["add_condition", "부상·감염 발생"],
  ["change_money", "돈 변경"],
  ["set_flag", "플래그 설정"],
  ["clear_flag", "플래그 해제"],
  ["advance_time", "시간 경과"],
  ["damage_tool", "도구 내구도 감소"],
  ["set_tool_durability", "도구 내구도 설정"],
  ["travel", "지역 이동"],
  ["set_scene", "씬 이동"],
  ["log", "기록 추가"],
  ["start_quest", "퀘스트 시작"],
  ["complete_quest", "퀘스트 완료"],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function options(entries, selected, includeEmpty = false) {
  const empty = includeEmpty ? '<option value="">선택 안 함</option>' : "";
  return empty + entries.map(([value, label]) =>
    `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
}

function itemOptions(selected, includeEmpty = false) {
  const entries = state.document.items
    .map((item) => [item.id, item.name])
    .sort((left, right) => left[1].localeCompare(right[1], "ko"));
  return options(entries, selected, includeEmpty);
}

function previewFinalConsonantIndex(value) {
  const lastCharacter = Array.from(String(value ?? "").trim())
    .reverse()
    .find((character) => /[가-힣A-Za-z0-9]/.test(character));
  if (!lastCharacter) return 0;
  const codePoint = lastCharacter.codePointAt(0) ?? 0;
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
    return (codePoint - 0xac00) % 28;
  }
  if (/\d/.test(lastCharacter)) {
    return ["0", "1", "3", "6", "7", "8"].includes(lastCharacter) ? 1 : 0;
  }
  return 0;
}

function previewParticle(name, rawParticle = "") {
  const particle = rawParticle.replaceAll("/", "").trim();
  const finalIndex = previewFinalConsonantIndex(name);
  if (particle === "으로로") {
    return finalIndex === 0 || finalIndex === 8 ? "로" : "으로";
  }
  const pairs = {
    은는: ["은", "는"],
    이가: ["이", "가"],
    을를: ["을", "를"],
    과와: ["과", "와"],
    이랑랑: ["이랑", "랑"],
    아야: ["아", "야"],
    이에요예요: ["이에요", "예요"],
  };
  const pair = pairs[particle];
  return pair ? pair[finalIndex === 0 ? 1 : 0] : "";
}

function resolveItemTextPreview(value) {
  return String(value ?? "").replace(
    /\{\{item:([A-Za-z0-9_-]+)(?:\|([^{}]+))?\}\}/g,
    (_reference, itemId, particle) => {
      const item = state.document?.items?.find((entry) => entry.id === itemId);
      const name = item?.name ?? itemId;
      return `${name}${previewParticle(name, particle)}`;
    },
  );
}

function itemReferencePicker(targetField) {
  return `
    <div class="item-reference-picker" data-item-reference-picker data-target-field="${escapeHtml(targetField)}">
      <span>아이템 이름 연결</span>
      <select data-item-reference-id aria-label="연결할 아이템">${itemOptions(state.document.items[0]?.id ?? "")}</select>
      <select data-item-reference-particle aria-label="붙일 조사">
        ${options([
          ["", "조사 없음"],
          ["을를", "을/를"],
          ["은는", "은/는"],
          ["이가", "이/가"],
          ["과와", "과/와"],
          ["으로로", "으로/로"],
        ], "")}
      </select>
      <button class="button ghost small" data-insert-item-reference type="button">현재 위치에 삽입</button>
    </div>
  `;
}

function itemReferenceTextField(label, field, value, extra = "") {
  return `<div class="item-reference-field ${extra}">${textField(label, field, value)}${itemReferencePicker(field)}</div>`;
}

function itemReferenceTextareaField(label, field, value, extra = "") {
  return `<div class="item-reference-field ${extra}">${textareaField(label, field, value)}${itemReferencePicker(field)}</div>`;
}

function bindItemReferencePickers(container) {
  container.querySelectorAll("[data-item-reference-picker]").forEach((picker) => {
    const target = container.querySelector(`[data-field="${picker.dataset.targetField}"]`);
    const itemSelect = picker.querySelector("[data-item-reference-id]");
    const particleSelect = picker.querySelector("[data-item-reference-particle]");
    const insertButton = picker.querySelector("[data-insert-item-reference]");
    if (!target || !itemSelect || !particleSelect || !insertButton) return;
    const itemEditor = typeof StudioItemTextEditor !== 'undefined' ? StudioItemTextEditor.mount(target,target.value,{key:`${state.selectedId}:legacy:${picker.dataset.targetField}`}) : null;

    insertButton.addEventListener("click", () => {
      const particle = particleSelect.value ? `|${particleSelect.value}` : "";
      const token = `{{item:${itemSelect.value}${particle}}}`;
      if (itemEditor) { itemEditor.insert(token); return; }
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.setRangeText(token, start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.focus();
    });
  });
}

function locationOptions(selected) {
  return options(
    state.catalogs.locations.map((location) => [location.id, location.name]),
    selected,
  );
}

function questOptions(selected) {
  return options(
    state.catalogs.quests.map((quest) => [quest.id, `${quest.name} · ${quest.id}`]),
    selected,
  );
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}`;
}

function tagsText(tags) {
  return (tags ?? []).join(", ");
}

function parseTags(value) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function collection() {
  return state.document?.[state.tab] ?? [];
}

function selectedEntity() {
  return collection().find((entry) => entry.id === state.selectedId) ?? null;
}

function markDirty() {
  state.dirty = true;
  if (typeof writerChanged === "function") writerChanged();
  ui.saveState.textContent = "저장되지 않은 변경사항";
  ui.saveState.className = "save-state dirty";
}

function markSaved() {
  state.dirty = false;
  if (state.status.hasUnpublishedChanges) {
    ui.saveState.textContent = "초안 저장됨 · 공개 대기";
    ui.saveState.className = "save-state dirty";
    return;
  }
  ui.saveState.textContent = state.status.publishedAt
    ? `게임에 공개됨 · ${new Date(state.status.publishedAt).toLocaleString("ko-KR")}`
    : "모든 변경사항 저장됨";
  ui.saveState.className = "save-state saved";
}

function studioFetch(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (state.adminToken) {
    headers.set("Authorization", `Bearer ${state.adminToken}`);
  }
  return fetch(url, { ...init, headers });
}

function showAuthGate(message = "") {
  ui.authError.textContent = message;
  ui.authGate.hidden = false;
  window.setTimeout(() => ui.adminTokenInput.focus(), 0);
}

function hideAuthGate() {
  ui.authGate.hidden = true;
  ui.authError.textContent = "";
}

function showToast(message, error = false) {
  ui.toast.textContent = message;
  ui.toast.className = `toast show${error ? " error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    ui.toast.className = "toast";
  }, error ? 6000 : 3000);
}

function entityName(entity) {
  if (["items", "locations", "people"].includes(state.tab)) return entity.name;
  if (state.tab === "recipes") return resolveItemTextPreview(entity.label);
  return entity.title;
}

function entityBadges(entity) {
  if (state.tab === "locations") return [`<span class="badge">연결 ${entity.neighbors.length}</span>`];
  if (state.tab === "people") return [`<span class="badge">${escapeHtml(entity.role)}</span>`];
  if (state.tab === "items") {
    return [
      `<span class="badge">${escapeHtml(entity.kind)}</span>`,
    ];
  }
  if (state.tab === "recipes") {
    return [
      `<span class="badge">${entity.menu === "crafting" ? "제작" : "요리"}</span>`,
      `<span class="badge accent">${entity.enabled ? "활성" : "비활성"}</span>`,
    ];
  }
  const location = state.catalogs.locations.find((entry) => entry.id === entity.locationId);
  return [
    `<span class="badge">${escapeHtml(location?.name ?? entity.locationId)}</span>`,
    `<span class="badge accent">${entity.enabled ? "활성" : "비활성"}</span>`,
  ];
}

function renderCounts() {
  document.querySelector("#locationCount").textContent = state.document.locations.length;
  document.querySelector("#personCount").textContent = state.document.people.length;
  state.catalogs.locations = state.document.locations;
  ui.itemCount.textContent = state.document.items.length;
  ui.recipeCount.textContent = state.document.recipes.length;
  ui.storyCount.textContent = state.document.stories.length;
}

function renderList() {
  ui.entityList.classList.toggle('writer-story-list', state.tab === 'stories');
  const normalizedQuery = state.query.trim().toLowerCase();
  const entries = collection()
    .filter(entry => typeof writerMatches !== "function" || writerMatches(entry))
    .filter((entry) => {
      const haystack = state.tab === "stories" ? studioStorySearchText(entry, state.document) : `${entry.id} ${entityName(entry)}`.toLowerCase();
      return !normalizedQuery || haystack.includes(normalizedQuery);
    })
    .sort((left, right) => entityName(left).localeCompare(entityName(right), "ko"));

  ui.entityList.innerHTML = entries.length
    ? entries.map((entry) => `
      <button class="entity-card ${state.tab === "items" ? "item-list-row" : ""} ${entry.id === state.selectedId ? "active" : ""}" data-select-id="${escapeHtml(entry.id)}" type="button">
        <strong>${escapeHtml(entityName(entry))}</strong>
        <span class="entity-id">${escapeHtml(entry.id)}</span>
        <span class="entity-meta">${entityBadges(entry).join("")}</span>
      </button>
    `).join("")
    : '<div class="empty-array">검색 결과가 없습니다.</div>';

  ui.entityList.querySelectorAll("[data-select-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.tab === "stories") writer.library = false;
      state.selectedId = button.dataset.selectId;
      state.selectedSceneId = null;
      state.selectedChoiceId = null;
      renderList();
      renderEditor();
    });
  });
}

function renderShell() {
  const meta = TAB_META[state.tab];
  ui.listEyebrow.textContent = meta.eyebrow;
  ui.listTitle.textContent = meta.title;
  ui.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab));
  renderCounts();
  if (typeof renderWriterFilters === "function") renderWriterFilters();
  renderList();
  renderEditor();
}

function textField(label, field, value, extra = "") {
  return `
    <label class="field ${extra}">
      <span>${label}</span>
      <input data-field="${field}" value="${escapeHtml(value)}" />
    </label>
  `;
}

function numberField(label, field, value, extra = "", optional = false) {
  return `
    <label class="field ${extra}">
      <span>${label}</span>
      <input type="number" data-field="${field}" data-mode="${optional ? "optional-number" : "number"}" value="${value ?? ""}" />
    </label>
  `;
}

function textareaField(label, field, value, extra = "") {
  return `
    <label class="field ${extra}">
      <span>${label}</span>
      <textarea data-field="${field}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function selectField(label, field, optionHtml, extra = "") {
  return `
    <label class="field ${extra}">
      <span>${label}</span>
      <select data-field="${field}">${optionHtml}</select>
    </label>
  `;
}

function checkboxField(label, field, checked) {
  return `
    <label class="check-field">
      <input type="checkbox" data-field="${field}" data-mode="checkbox" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function bindFields(container, target, afterChange = () => {}) {
  container.querySelectorAll("[data-field]").forEach((input) => {
    const eventName = input.tagName === "SELECT" || input.type === "checkbox" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const field = input.dataset.field;
      const mode = input.dataset.mode;
      if (mode === "checkbox") {
        target[field] = input.checked;
      } else if (mode === "number") {
        target[field] = Number(input.value || 0);
      } else if (mode === "optional-number") {
        if (input.value === "") delete target[field];
        else target[field] = Number(input.value);
      } else if (mode === "tags") {
        target[field] = parseTags(input.value);
      } else if (mode === "paragraphs") {
        target[field] = input.value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      } else if (mode === "optional") {
        if (input.value.trim()) target[field] = input.value.trim();
        else delete target[field];
      } else {
        target[field] = input.value;
      }
      markDirty();
      afterChange(field);
    });
  });
}

function editorHeader(kind, title, id, description) {
  return `
    <div class="editor-header">
      <div>
        <span class="eyebrow">${escapeHtml(kind)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p><code>${escapeHtml(id)}</code> · ${escapeHtml(description)}</p>
      </div>
      <button class="button danger small" id="deleteEntity" type="button">삭제 또는 초기화</button>
    </div>
  `;
}

function renderItem(item) {
  ui.editorPanel.innerHTML = `
    <div class="item-editor">
    ${editorHeader("ITEM", item.name, item.id, "게임 안에서 획득하고 사용할 수 있는 물건")}
    <div class="form-stack item-form-layout">
      <section class="form-section">
        <div class="section-title"><div><h3>기본 정보</h3><p>저장 데이터에서 사용하는 ID와 플레이어에게 보이는 정보를 정합니다.</p></div></div>
        <div class="field-grid">
          ${textField("아이템 ID", "id", item.id)}
          ${textField("이름", "name", item.name)}
          ${textareaField("설명", "description", item.description, "full")}
          ${selectField("분류", "kind", options([
            ["food", "음식"], ["drink", "음료"], ["medicine", "약품"], ["trade", "거래품"],
            ["ticket", "교환권"], ["material", "재료"], ["tool", "도구"],
          ], item.kind))}
          ${selectField("희귀도", "rarity", options([
            ["common", "일반"], ["uncommon", "고급"], ["rare", "희귀"],
          ], item.rarity))}
          ${numberField("기준 가격", "price", item.price)}
          ${textField("태그 · 쉼표로 구분", "tags", tagsText(item.tags))}
          ${numberField("사용 시간(분) · 비우면 즉시", "useMinutes", item.useMinutes, "", true)}
          ${numberField("최대 내구도 · 도구만 입력", "maxDurability", item.maxDurability, "", true)}
        </div>
      </section>
      <section class="form-section">
        <div class="section-title"><div><h3>직접 사용 효과</h3><p>음식·음료·약품을 사용할 때 적용되는 수치입니다.</p></div></div>
        <div class="effect-grid">
          ${[
            ["hp", "체력"],
            ["mind", "정신력"],
            ["energy", "기력"],
            ["exhaustionRelief", "탈진 완화"],
            ["injuryRelief", "부상 치료 단계"],
            ["infectionRelief", "감염 치료 단계"],
          ].map(([key, label]) => `
            <label class="metric">
              <span>${label}</span>
              <input type="number" data-item-effect="${key}" value="${item.effects[key] ?? 0}" />
            </label>
          `).join("")}
        </div>
      </section>
    </div>
    </div>
  `;

  bindFields(ui.editorPanel, item, (field) => {
    if (field === "id" || field === "name") {
      state.selectedId = item.id;
      renderList();
    }
  });
  ui.editorPanel.querySelector('[data-field="tags"]').dataset.mode = "tags";
  ui.editorPanel.querySelectorAll("[data-item-effect]").forEach((input) => {
    input.addEventListener("input", () => {
      item.effects[input.dataset.itemEffect] = Number(input.value || 0);
      markDirty();
    });
  });
  bindDelete(item);
}

function defaultCondition(type = "has_item") {
  const firstItem = state.document.items[0]?.id ?? "";
  const firstLocation = state.catalogs.locations[0]?.id ?? "shelter";
  const firstQuest = state.catalogs.quests[0]?.id ?? "";
  const defaults = {
    has_item: { type, itemId: firstItem, amount: 1 },
    not_has_item: { type, itemId: firstItem, amount: 1 },
    flag: { type, flag: "new_flag" },
    flag_not: { type, flag: "new_flag" },
    day_gte: { type, value: 1 },
    day_lt: { type, value: 2 },
    money_gte: { type, amount: 1000 },
    stat_gte: { type, stat: "energy", value: 1 },
    quest_state: { type, questId: firstQuest, status: "active" },
    location_visited: { type, locationId: firstLocation },
  };
  return defaults[type] ?? { type: "flag", flag: "new_flag" };
}

function defaultEffect(type = "add_item") {
  const firstItem = state.document.items[0]?.id ?? "";
  const firstLocation = state.catalogs.locations[0]?.id ?? "shelter";
  const firstQuest = state.catalogs.quests[0]?.id ?? "";
  const defaults = {
    add_item: { type, itemId: firstItem, amount: 1 },
    remove_item: { type, itemId: firstItem, amount: 1 },
    change_stat: { type, stat: "energy", value: 1 },
    add_condition: { type, condition: "injury", chancePercent: 0 },
    change_money: { type, amount: 1000 },
    set_flag: { type, flag: "new_flag" },
    clear_flag: { type, flag: "new_flag" },
    advance_time: { type, minutes: 15 },
    damage_tool: { type, itemId: firstItem, amount: 1 },
    set_tool_durability: { type, itemId: firstItem, value: 1 },
    travel: { type, locationId: firstLocation },
    set_scene: { type, sceneId: "scene_id" },
    log: { type, message: "새로운 일이 일어났다." },
    start_quest: { type, questId: firstQuest },
    complete_quest: { type, questId: firstQuest },
  };
  return defaults[type] ?? { type: "log", message: "새로운 일이 일어났다." };
}

function conditionParams(condition, index, arrayName) {
  const attr = (key, mode = "") =>
    `data-array="${arrayName}" data-index="${index}" data-key="${key}" ${mode ? `data-mode="${mode}"` : ""}`;
  switch (condition.type) {
    case "has_item":
    case "not_has_item":
      return `
        <select ${attr("itemId")}>${itemOptions(condition.itemId)}</select>
        <input type="number" min="1" ${attr("amount", "number")} value="${condition.amount ?? 1}" />
      `;
    case "flag":
    case "flag_not":
      return `<input ${attr("flag")} value="${escapeHtml(condition.flag)}" placeholder="플래그 ID" />`;
    case "day_gte":
    case "day_lt":
      return `<input type="number" min="1" ${attr("value", "number")} value="${condition.value}" />`;
    case "money_gte":
      return `<input type="number" min="0" ${attr("amount", "number")} value="${condition.amount}" />`;
    case "stat_gte":
      return `
        <select ${attr("stat")}>${options([["hp", "체력"], ["mind", "정신력"], ["energy", "기력"]], condition.stat)}</select>
        <input type="number" min="0" ${attr("value", "number")} value="${condition.value}" />
      `;
    case "quest_state":
      return `
        <select ${attr("questId")}>${questOptions(condition.questId)}</select>
        <select ${attr("status")}>${options([["inactive", "비활성"], ["active", "진행 중"], ["completed", "완료"]], condition.status)}</select>
      `;
    case "location_visited":
      return `<select ${attr("locationId")}>${locationOptions(condition.locationId)}</select>`;
    default:
      return `<textarea data-raw-array="${arrayName}" data-index="${index}">${escapeHtml(JSON.stringify(condition, null, 2))}</textarea>`;
  }
}

function effectParams(effect, index, arrayName) {
  const attr = (key, mode = "") =>
    `data-array="${arrayName}" data-index="${index}" data-key="${key}" ${mode ? `data-mode="${mode}"` : ""}`;
  switch (effect.type) {
    case "add_item":
    case "remove_item":
    case "damage_tool":
      return `
        <select ${attr("itemId")}>${itemOptions(effect.itemId)}</select>
        <input type="number" min="1" ${attr("amount", "number")} value="${effect.amount ?? 1}" />
      `;
    case "set_tool_durability":
      return `
        <select ${attr("itemId")}>${itemOptions(effect.itemId)}</select>
        <input type="number" min="0" ${attr("value", "number")} value="${effect.value ?? 0}" />
      `;
    case "add_condition":
      return `<select ${attr("condition")}>${options([["injury", "부상"], ["infection", "감염"]], effect.condition)}</select><input type="number" min="0" max="100" step="any" ${attr("chancePercent")} data-mode="number" value="${effect.chancePercent ?? 0}" aria-label="발생 확률 (%)"> <span>% · 발생 시 +1단계</span>`;
    case "change_stat":
      return `
        <select ${attr("stat")}>${options([["hp", "체력"], ["mind", "정신력"], ["energy", "기력"]], effect.stat)}</select>
        <input type="number" ${attr("value", "number")} value="${effect.value}" />
      `;
    case "change_money":
      return `<input type="number" ${attr("amount", "number")} value="${effect.amount}" />`;
    case "set_flag":
    case "clear_flag":
      return `<input ${attr("flag")} value="${escapeHtml(effect.flag)}" placeholder="플래그 ID" />`;
    case "advance_time":
      return `<input type="number" min="1" ${attr("minutes", "number")} value="${effect.minutes}" />`;
    case "travel":
      return `<select ${attr("locationId")}>${locationOptions(effect.locationId)}</select>`;
    case "set_scene":
      return `<input ${attr("sceneId")} value="${escapeHtml(effect.sceneId)}" placeholder="씬 ID" />`;
    case "log":
      return `<textarea ${attr("message")} placeholder="게임 기록에 남길 문장">${escapeHtml(effect.message)}</textarea>`;
    case "start_quest":
    case "complete_quest":
      return `<select ${attr("questId")}>${questOptions(effect.questId)}</select>`;
    default:
      return `<textarea data-raw-array="${arrayName}" data-index="${index}">${escapeHtml(JSON.stringify(effect, null, 2))}</textarea>`;
  }
}

function arrayEditorHtml(owner, arrayName, kind, title, description) {
  const entries = owner[arrayName] ?? [];
  const typeList = kind === "condition" ? CONDITION_TYPES : EFFECT_TYPES.filter(([type]) => !('weight' in owner) || !['advance_time', 'advance_to_daybreak', 'random_outcome'].includes(type));
  return `
    <section class="form-section">
      <div class="section-title">
        <div><h3>${title}</h3><p>${description}</p></div>
        <button class="button ghost small" data-add-array="${arrayName}" data-array-kind="${kind}" type="button">＋ 추가</button>
      </div>
      <div class="array-stack">
        ${entries.length ? entries.map((entry, index) => `
          <div class="inline-editor">
            <select data-array-type="${arrayName}" data-array-kind="${kind}" data-index="${index}">
              ${options(typeList, entry.type)}
            </select>
            <div class="params">
              ${kind === "condition"
                ? conditionParams(entry, index, arrayName)
                : effectParams(entry, index, arrayName)}
            </div>
            <button class="remove-row" data-remove-array="${arrayName}" data-index="${index}" type="button" aria-label="삭제">×</button>
          </div>
        `).join("") : '<div class="empty-array">아직 항목이 없습니다.</div>'}
      </div>
    </section>
  `;
}

function bindArrayEditors(container, owner) {
  container.querySelectorAll("[data-add-array]").forEach((button) => {
    button.addEventListener("click", () => {
      const arrayName = button.dataset.addArray;
      owner[arrayName] ??= [];
      owner[arrayName].push(button.dataset.arrayKind === "condition" ? defaultCondition() : defaultEffect());
      markDirty();
      renderEditor();
    });
  });

  container.querySelectorAll("[data-remove-array]").forEach((button) => {
    button.addEventListener("click", () => {
      owner[button.dataset.removeArray].splice(Number(button.dataset.index), 1);
      markDirty();
      renderEditor();
    });
  });

  container.querySelectorAll("[data-array-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const arrayName = select.dataset.arrayType;
      const index = Number(select.dataset.index);
      owner[arrayName][index] = select.dataset.arrayKind === "condition"
        ? defaultCondition(select.value)
        : defaultEffect(select.value);
      markDirty();
      renderEditor();
    });
  });

  container.querySelectorAll("[data-array][data-key]").forEach((input) => {
    const eventName = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const entry = owner[input.dataset.array][Number(input.dataset.index)];
      entry[input.dataset.key] = input.dataset.mode === "number" ? Number(input.value || 0) : input.value;
      markDirty();
    });
    const entry=owner[input.dataset.array][Number(input.dataset.index)];
    if(entry.type==='log' && input.dataset.key==='message' && typeof StudioItemTextEditor!=='undefined') {
      StudioItemTextEditor.mount(input,entry.message,{key:`${state.selectedId}:${owner.id??state.selectedChoiceId}:log:${input.dataset.array}:${input.dataset.index}`});
    }
  });

  container.querySelectorAll("[data-raw-array]").forEach((textarea) => {
    textarea.addEventListener("change", () => {
      try {
        owner[textarea.dataset.rawArray][Number(textarea.dataset.index)] = JSON.parse(textarea.value);
        markDirty();
        renderEditor();
      } catch {
        showToast("JSON 형식을 확인해 주세요.", true);
      }
    });
  });
}

function renderRecipe(recipe) {
  ui.editorPanel.innerHTML = `
    ${editorHeader("RECIPE", resolveItemTextPreview(recipe.label), recipe.id, recipe.menu === "crafting" ? "제작 메뉴에 노출되는 레시피" : "요리 메뉴에 노출되는 레시피")}
    <div class="form-stack">
      <section class="form-section">
        <div class="section-title"><div><h3>레시피 정보</h3><p>필요 조건과 결과 효과는 아래에서 순서대로 구성합니다.</p></div></div>
        <div class="field-grid">
          ${textField("레시피 ID", "id", recipe.id)}
          ${itemReferenceTextField("이름", "label", recipe.label)}
          ${selectField("메뉴", "menu", options([["crafting", "제작"], ["cooking", "요리"]], recipe.menu))}
          ${selectField("표시 방식", "presentationMode", options([
            ["when_conditions_met", "조건 충족 시만"], ["always", "항상 표시"],
          ], recipe.presentationMode))}
          ${itemReferenceTextareaField("보조 안내 · 수치 효과 없을 때", "outcomeHint", recipe.outcomeHint, "full")}
          ${textField("완료 후 이동할 씬 ID", "nextSceneId", recipe.nextSceneId ?? "")}
          ${textField("태그 · 쉼표로 구분", "tags", tagsText(recipe.tags))}
          <div class="field">
            <span>노출 상태</span>
            ${checkboxField("게임 메뉴에 표시", "enabled", recipe.enabled)}
            ${checkboxField("결과 안내 표시", "showOutcomeHint", recipe.showOutcomeHint ?? false)}
          </div>
        </div>
      </section>
      ${arrayEditorHtml(recipe, "conditions", "condition", "필요 조건", "보유 아이템, 시설, 퀘스트 상태처럼 레시피를 사용할 조건입니다.")}
      ${arrayEditorHtml(recipe, "effects", "effect", "완성 효과", "재료 소모, 결과물 지급, 시간 경과를 실행 순서대로 설정합니다.")}
      ${arrayEditorHtml(recipe, "failureEffects", "effect", "실패 효과", "조건이 부족한 상태에서 눌렀을 때 남길 기록이나 효과입니다.")}
    </div>
  `;

  ui.editorPanel.querySelector('[data-field="nextSceneId"]').dataset.mode = "optional";
  ui.editorPanel.querySelector('[data-field="tags"]').dataset.mode = "tags";
  bindItemReferencePickers(ui.editorPanel);
  bindFields(ui.editorPanel, recipe, (field) => {
    if (field === "id" || field === "label") {
      state.selectedId = recipe.id;
      renderList();
    }
    if (field === "menu" && !recipe.nextSceneId) {
      recipe.nextSceneId = recipe.menu === "crafting"
        ? "shelter_crafting_menu_repeat"
        : "shelter_cooking_menu_repeat";
    }
  });
  bindArrayEditors(ui.editorPanel, recipe);
  bindDelete(recipe);
}

function selectedStoryScene(story) {
  if (!state.selectedSceneId || !story.scenes.some((scene) => scene.id === state.selectedSceneId)) {
    state.selectedSceneId = story.scenes[0]?.id ?? null;
  }
  return story.scenes.find((scene) => scene.id === state.selectedSceneId) ?? null;
}

function selectedSceneChoice(scene) {
  if (!scene) return null;
  if (!state.selectedChoiceId || !scene.choices.some((choice) => choice.id === state.selectedChoiceId)) {
    state.selectedChoiceId = scene.choices[0]?.id ?? null;
  }
  return scene.choices.find((choice) => choice.id === state.selectedChoiceId) ?? null;
}

function renderStory(story) {
  const scene = selectedStoryScene(story);
  const choice = selectedSceneChoice(scene);
  ui.editorPanel.innerHTML = `
    ${editorHeader("STORY", story.title, story.id, "지역에서 시작해 씬과 선택지로 이어지는 이야기")}
    <div class="form-stack">
      <section class="form-section">
        <div class="section-title"><div><h3>이야기 진입</h3><p>아이템 이름은 연결 도구로 삽입하거나 직접 입력할 수 있으며, 저장할 때 ID 참조로 자동 변환됩니다.</p></div></div>
        <div class="field-grid">
          ${textField("이야기 ID", "id", story.id)}
          ${textField("관리용 제목", "title", story.title)}
          ${selectField("시작 지역", "locationId", locationOptions(story.locationId))}
          ${itemReferenceTextField("게임에 표시할 진입 버튼", "entryLabel", story.entryLabel)}
          ${itemReferenceTextareaField("진입 안내", "entryHint", story.entryHint, "full")}
          ${textField("태그 · 쉼표로 구분", "tags", tagsText(story.tags))}
          <div class="field full">${checkboxField("게임에 이야기 표시", "enabled", story.enabled)}</div>
        </div>
      </section>
      ${arrayEditorHtml(story, "conditions", "condition", "이야기 시작 조건", "일차, 플래그, 보유 아이템에 따라 진입 버튼 노출을 조절합니다.")}
      <section class="form-section">
        <div class="section-title">
          <div><h3>씬 구성</h3><p>씬 제목과 본문에 등장하는 아이템도 저장 시 현재 아이템 ID에 연결됩니다.</p></div>
          <button class="button ghost small" id="addScene" type="button">＋ 씬 추가</button>
        </div>
        <div class="scene-tabs">
          ${story.scenes.map((entry) => `
            <button class="pill-button ${entry.id === scene?.id ? "active" : ""}" data-scene-id="${escapeHtml(entry.id)}" type="button">${escapeHtml(entry.title)}</button>
          `).join("")}
        </div>
        ${scene ? `
          <div class="subeditor">
            <div class="field-grid">
              ${textField("씬 ID", "scene-id", scene.id)}
              ${itemReferenceTextField("씬 제목", "scene-title", scene.title)}
              ${itemReferenceTextareaField("본문 · 문단마다 줄바꿈", "scene-paragraphs", scene.paragraphs.join("\n"), "full")}
              ${textField("씬 태그 · 쉼표로 구분", "scene-tags", tagsText(scene.tags), "full")}
            </div>
            <div class="editor-actions">
              <button class="button danger small" id="deleteScene" type="button" ${story.scenes.length <= 1 ? "disabled" : ""}>현재 씬 삭제</button>
            </div>
          </div>
        ` : ""}
      </section>
      ${scene ? `
        <section class="form-section">
          <div class="section-title">
            <div><h3>선택지</h3><p>금액·능력치·아이템·내구도·시간은 효과에서 자동으로 요약됩니다. 보조 안내에는 이동·조사처럼 수치 효과가 없는 선택의 설명만 적습니다.</p></div>
            <button class="button ghost small" id="addChoice" type="button">＋ 선택지 추가</button>
          </div>
          <div class="choice-tabs">
            ${scene.choices.map((entry) => `
              <button class="pill-button ${entry.id === choice?.id ? "active" : ""}" data-choice-id="${escapeHtml(entry.id)}" type="button">${escapeHtml(resolveItemTextPreview(entry.label))}</button>
            `).join("") || '<span class="empty-array">선택지가 없습니다. 지역 행동은 계속 표시됩니다.</span>'}
          </div>
          ${choice ? `
            <div class="subeditor">
              <div class="field-grid">
                ${textField("선택지 ID", "choice-id", choice.id)}
                ${itemReferenceTextField("버튼 문구", "choice-label", choice.label)}
                ${itemReferenceTextareaField("보조 안내 · 수치 효과 없을 때", "choice-outcomeHint", choice.outcomeHint, "full")}
                ${textField("다음 씬 ID · 비워도 됨", "choice-nextSceneId", choice.nextSceneId ?? "")}
                ${textField("태그 · 쉼표로 구분", "choice-tags", tagsText(choice.tags), "full")}
                <div class="field full">${checkboxField("결과 안내 표시", "choice-showOutcomeHint", choice.showOutcomeHint ?? false)}</div>
              </div>
              <div class="editor-actions"><button class="button danger small" id="deleteChoice" type="button">현재 선택지 삭제</button></div>
            </div>
          ` : ""}
        </section>
      ` : ""}
      ${choice ? arrayEditorHtml(choice, "conditions", "condition", "선택지 조건", "이 선택지를 표시하거나 실행하기 위한 조건입니다.") : ""}
      ${choice ? arrayEditorHtml(choice, "effects", "effect", "선택지 효과", "아이템, 능력치, 시간, 플래그, 씬 이동 효과를 실행 순서대로 설정합니다.") : ""}
      ${choice ? arrayEditorHtml(choice, "failureEffects", "effect", "선택 실패 효과", "조건을 충족하지 못했을 때 실행할 효과입니다.") : ""}
    </div>
  `;

  bindItemReferencePickers(ui.editorPanel);
  ui.editorPanel.querySelector('[data-field="tags"]').dataset.mode = "tags";
  const storyInfoSection = ui.editorPanel.querySelector(".form-stack > .form-section");
  bindFields(storyInfoSection, story, (field) => {
    if (field === "id" || field === "title") {
      state.selectedId = story.id;
      renderList();
    }
    if (field === "locationId") {
      story.scenes.forEach((entry) => {
        entry.locationId = story.locationId;
      });
    }
  });
  bindArrayEditors(ui.editorPanel, story);

  ui.editorPanel.querySelectorAll("[data-scene-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSceneId = button.dataset.sceneId;
      state.selectedChoiceId = null;
      renderEditor();
    });
  });

  ui.editorPanel.querySelector("#addScene")?.addEventListener("click", () => {
    const id = makeId(`${story.id}_scene`);
    story.scenes.push({
      id,
      locationId: story.locationId,
      title: "새로운 장면",
      paragraphs: ["장면의 이야기를 입력하세요."],
      tags: [],
      conditions: [],
      choices: [],
    });
    state.selectedSceneId = id;
    state.selectedChoiceId = null;
    markDirty();
    renderEditor();
  });

  if (scene) {
    const sceneBindings = {
      "scene-id": "id",
      "scene-title": "title",
      "scene-paragraphs": "paragraphs",
      "scene-tags": "tags",
    };
    Object.entries(sceneBindings).forEach(([field, key]) => {
      const input = ui.editorPanel.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      input.removeAttribute("data-field");
      input.addEventListener("input", () => {
        if (key === "paragraphs") scene[key] = input.value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        else if (key === "tags") scene[key] = parseTags(input.value);
        else {
          scene[key] = input.value;
          if (key === "id") state.selectedSceneId = input.value;
        }
        markDirty();
      });
    });

    ui.editorPanel.querySelector("#deleteScene")?.addEventListener("click", () => {
      if (story.scenes.length <= 1) return;
      story.scenes = story.scenes.filter((entry) => entry !== scene);
      state.selectedSceneId = story.scenes[0].id;
      state.selectedChoiceId = null;
      markDirty();
      renderEditor();
    });

    ui.editorPanel.querySelectorAll("[data-choice-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedChoiceId = button.dataset.choiceId;
        renderEditor();
      });
    });

    ui.editorPanel.querySelector("#addChoice")?.addEventListener("click", () => {
      const id = makeId(`${scene.id}_choice`);
      scene.choices.push({
        id,
        label: "새로운 선택",
        outcomeHint: "이 선택의 결과를 입력하세요.",
        showOutcomeHint: true,
        presentationMode: "when_conditions_met",
        conditions: [],
        effects: [],
        failureEffects: [],
        tags: [],
        hidden: false,
      });
      state.selectedChoiceId = id;
      markDirty();
      renderEditor();
    });
  }

  if (choice) {
    const choiceBindings = {
      "choice-id": ["id", "text"],
      "choice-label": ["label", "text"],
      "choice-outcomeHint": ["outcomeHint", "text"],
      "choice-nextSceneId": ["nextSceneId", "optional"],
      "choice-tags": ["tags", "tags"],
      "choice-showOutcomeHint": ["showOutcomeHint", "checkbox"],
    };
    Object.entries(choiceBindings).forEach(([field, [key, mode]]) => {
      const input = ui.editorPanel.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      input.removeAttribute("data-field");
      const eventName = mode === "checkbox" ? "change" : "input";
      input.addEventListener(eventName, () => {
        if (mode === "checkbox") choice[key] = input.checked;
        else if (mode === "tags") choice[key] = parseTags(input.value);
        else if (mode === "optional") {
          if (input.value.trim()) choice[key] = input.value.trim();
          else delete choice[key];
        } else {
          choice[key] = input.value;
          if (key === "id") state.selectedChoiceId = input.value;
        }
        markDirty();
      });
    });
    bindArrayEditors(ui.editorPanel, choice);
    ui.editorPanel.querySelector("#deleteChoice")?.addEventListener("click", () => {
      scene.choices = scene.choices.filter((entry) => entry !== choice);
      state.selectedChoiceId = scene.choices[0]?.id ?? null;
      markDirty();
      renderEditor();
    });
  }

  bindDelete(story);
}

function bindDelete(entity) {
  ui.editorPanel.querySelector("#deleteEntity")?.addEventListener("click", () => {
    const builtIn = state.tab === "items"
      ? state.catalogs.builtInItemIds.includes(entity.id)
      : state.tab === "recipes"
        ? state.catalogs.builtInRecipeIds.includes(entity.id)
        : false;
    const action = builtIn ? "기본값으로 되돌릴까요?" : "완전히 삭제할까요?";
    if (!window.confirm(`${entityName(entity)}을(를) ${action}`)) return;
    state.document[state.tab] = collection().filter((entry) => entry !== entity);
    state.selectedId = null;
    markDirty();
    renderShell();
    if (builtIn) showToast("저장하면 기본값으로 되돌아갑니다.");
  });
}

function renderEditor() {
  const entity = selectedEntity();
  if (!entity) {
    ui.editorPanel.innerHTML = `
      <div class="empty-state">
        <span>◇</span>
        <h2>콘텐츠를 선택하세요</h2>
        <p>왼쪽 목록에서 편집할 항목을 고르거나 새 항목을 만드세요.</p>
      </div>
    `;
    return;
  }
  if (state.tab === "items") renderItem(entity);
  if (state.tab === "recipes") renderRecipe(entity);
  if (state.tab === "stories") renderStory(entity);
  if (state.tab === "locations") renderLocation(entity);
  if (state.tab === "people") renderPerson(entity);
  ui.editorPanel.querySelectorAll('[data-field="id"]').forEach(input => { input.readOnly = true; input.closest("label").hidden = true; });
}

function addEntity() {
  if (["stories", "locations", "people"].includes(state.tab)) return writerAddEntity();
  if (state.tab === "items") {
    const id = makeId("item");
    state.document.items.push({
      id,
      name: "새 아이템",
      description: "아이템 설명을 입력하세요.",
      kind: "material",
      rarity: "common",
      price: 0,
      tags: [],
      effects: { hp: 0, mind: 0, energy: 0, exhaustionRelief: 0 },
    });
    state.selectedId = id;
  } else if (state.tab === "recipes") {
    const id = makeId("recipe");
    state.document.recipes.push({
      id,
      label: "새 레시피",
      outcomeHint: "필요 재료와 결과를 설명하세요.",
      showOutcomeHint: true,
      presentationMode: "always",
      conditions: [],
      effects: [],
      failureEffects: [],
      hidden: false,
      tags: ["content-studio"],
      menu: "crafting",
      enabled: true,
      nextSceneId: "shelter_crafting_menu_repeat",
    });
    state.selectedId = id;
  } else {
    const id = makeId("story");
    const sceneId = `${id}_scene_1`;
    state.document.stories.push({
      id,
      title: "새로운 이야기",
      locationId: state.catalogs.locations[0]?.id ?? "shelter",
      entryLabel: "주변 이야기를 살핀다",
      entryHint: "새로운 이야기를 시작한다.",
      enabled: true,
      tags: ["content-studio"],
      conditions: [],
      scenes: [{
        id: sceneId,
        locationId: state.catalogs.locations[0]?.id ?? "shelter",
        title: "첫 장면",
        paragraphs: ["이야기의 첫 장면을 입력하세요."],
        tags: [],
        conditions: [],
        choices: [],
      }],
    });
    state.selectedId = id;
    state.selectedSceneId = sceneId;
    state.selectedChoiceId = null;
  }
  markDirty();
  renderShell();
}

async function save() { return writerSave(false); }
async function publish() { return writerSave(true); }

async function load() {
  try {
    const response = await studioFetch("/api/content-studio");
    const payload = await response.json();
    if (response.status === 401) {
      showAuthGate(payload.message);
      return false;
    }
    if (!response.ok) {
      showAuthGate(payload.message || "콘텐츠 스튜디오를 사용할 수 없습니다.");
      return false;
    }
    state.document = payload.document;
    state.catalogs = payload.catalogs;
    state.selectedId ??= state.document.stories.find(s => !s.native)?.id ?? state.document.stories[0]?.id;
    if (typeof writerLoaded === "function") writerLoaded();
    state.status = payload.status;
    markSaved();
    renderShell();
    hideAuthGate();
    return true;
  } catch (error) {
    ui.editorPanel.innerHTML = `
      <div class="empty-state">
        <span>!</span>
        <h2>콘텐츠를 불러오지 못했습니다</h2>
        <p>${escapeHtml(error instanceof Error ? error.message : "서버 상태를 확인해 주세요.")}</p>
      </div>
    `;
    showToast(error instanceof Error ? error.message : "불러오기 실패", true);
    return false;
  }
}

ui.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    state.selectedId = null;
    state.selectedSceneId = null;
    state.selectedChoiceId = null;
    state.query = "";
    ui.searchInput.value = "";
    renderShell();
  });
});

ui.searchInput.addEventListener("input", (event) => {
  state.query = ui.searchInput.value;
  if (event.isComposing) return;
  renderList();
});

document.querySelector("#listPanelToggle").addEventListener("click", (event) => {
  const collapsed = document.querySelector(".workspace").classList.toggle("list-collapsed");
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  event.currentTarget.textContent = collapsed ? "목록 펼치기" : "목록 접기";
});

ui.addButton.addEventListener("click", addEntity);
ui.saveButton.addEventListener("click", save);
ui.publishButton.addEventListener("click", publish);
ui.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = ui.adminTokenInput.value.trim();
  if (!token) return;
  state.adminToken = token;
  sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  ui.authError.textContent = "확인 중…";
  const loaded = await load();
  if (!loaded) {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    state.adminToken = "";
    ui.adminTokenInput.select();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});
