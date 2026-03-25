const STORAGE_KEY = "ruined-seoul-stage1-game-id-v9";
const LEGACY_STORAGE_KEYS = [
  "ruined-seoul-stage1-game-id",
  "ruined-seoul-stage1-game-id-v8",
  "ruined-seoul-stage1-game-id-v7",
];
const REAL_DAY_MS = 15 * 60 * 1000;
const CLOCK_TICK_MS = 1000;
const TYPEWRITER_CHAR_DELAY = 20;
const TYPEWRITER_PARAGRAPH_DELAY = 260;
const CLIENT_SAVE_VERSION = 9;
const HEX_RATIO = Math.sqrt(3) / 2;
const DEV_OBJECT_BADGES = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

const HEX_BOARD_TEMPLATE = [
  { slotId: "northwest", col: 0, row: 0, locationId: null },
  { slotId: "shelter", col: 1, row: 0, locationId: "shelter" },
  { slotId: "northeast", col: 2, row: 0, locationId: null },
  { slotId: "convenience", col: 0, row: 1, locationId: "convenience" },
  { slotId: "alley", col: 1, row: 1, locationId: null },
  { slotId: "kitchen", col: 2, row: 1, locationId: "kitchen" },
  { slotId: "control", col: 3, row: 1, locationId: null },
  { slotId: "subway", col: 0, row: 2, locationId: null },
  { slotId: "hospital", col: 1, row: 2, locationId: null },
  { slotId: "mart", col: 2, row: 2, locationId: null },
  { slotId: "riverside", col: 3, row: 2, locationId: null },
];

function currentHexDimensions() {
  if (window.matchMedia("(max-width: 620px)").matches) {
    const width = 92;
    return {
      width,
      height: Math.round(width * HEX_RATIO),
      padding: 14,
    };
  }

  const width = 116;
  return {
    width,
    height: Math.round(width * HEX_RATIO),
    padding: 18,
  };
}

function buildBoardSlots(visible, states) {
  const occupiedTemplateSlots = HEX_BOARD_TEMPLATE.filter((slot) => {
    if (!slot.locationId) {
      return false;
    }
    return visible.has(slot.locationId) || states.has(slot.locationId);
  });
  const usedLocationIds = new Set(occupiedTemplateSlots.map((slot) => slot.locationId));
  const spilloverStartRow = HEX_BOARD_TEMPLATE.reduce((maxRow, slot) => Math.max(maxRow, slot.row), 0) + 1;
  const extraLocationIds = Array.from(new Set([
    ...states.keys(),
    ...visible.keys(),
  ])).filter((locationId) => locationId && !usedLocationIds.has(locationId));
  const extraSlots = extraLocationIds.map((locationId, index) => ({
    slotId: `auto-${locationId}`,
    locationId,
    col: index % 4,
    row: spilloverStartRow + Math.floor(index / 4),
  }));

  return [...occupiedTemplateSlots, ...extraSlots];
}

function buildHexBoardLayout(slots) {
  const dimensions = currentHexDimensions();
  const stepX = dimensions.width * 0.75;
  const stepY = dimensions.height;
  const inset = {
    top: dimensions.padding,
    right: dimensions.padding,
    bottom: dimensions.padding,
    left: dimensions.padding,
  };
  const layoutSlots = slots.length ? slots : HEX_BOARD_TEMPLATE.filter((slot) => slot.locationId);
  const positions = layoutSlots.map((slot) => {
    const x = (dimensions.width / 2) + (slot.col * stepX);
    const y = (dimensions.height / 2) + (slot.row * stepY) + ((slot.col % 2) * (dimensions.height / 2));
    return {
      slotId: slot.slotId,
      locationId: slot.locationId,
      x: Math.round(x),
      y: Math.round(y),
    };
  });
  const layoutPositions = positions.length ? positions : [{
    slotId: "fallback",
    locationId: null,
    x: Math.round(dimensions.width / 2),
    y: Math.round(dimensions.height / 2),
  }];
  const minLeft = Math.min(...layoutPositions.map((position) => position.x - (dimensions.width / 2)), 0);
  const maxRight = Math.max(...layoutPositions.map((position) => position.x + (dimensions.width / 2)), dimensions.width);
  const minTop = Math.min(...layoutPositions.map((position) => position.y - (dimensions.height / 2)), 0);
  const maxBottom = Math.max(...layoutPositions.map((position) => position.y + (dimensions.height / 2)), dimensions.height);
  const positionsMap = new Map(positions.map((position) => [position.slotId, {
    x: Math.round(position.x - minLeft + inset.left),
    y: Math.round(position.y - minTop + inset.top),
  }]));

  return {
    dimensions,
    pixelWidth: Math.ceil((maxRight - minLeft) + inset.left + inset.right),
    pixelHeight: Math.ceil((maxBottom - minTop) + inset.top + inset.bottom),
    positions: positionsMap,
  };
}

const PANEL_CONFIG = {
  map: {
    title: "이동",
    subtitle: "지금 파악한 이동 경로를 지도로 정리했습니다.",
  },
  inventory: {
    title: "아이템",
    subtitle: "가진 물건과 돈을 확인하고 바로 사용할 수 있습니다.",
  },
  skills: {
    title: "스킬",
    subtitle: "현재 보유 중인 생존 방식입니다.",
  },
  quests: {
    title: "퀘스트",
    subtitle: "오늘 버티기 위해 필요한 우선순위입니다.",
  },
  log: {
    title: "기록",
    subtitle: "최근 선택과 이동 기록입니다.",
  },
};

const dom = {
  statusStrip: document.querySelector(".status-strip"),
  hpStatus: document.querySelector("#hp-status"),
  hpFill: document.querySelector("#hp-fill"),
  mindStatus: document.querySelector("#mind-status"),
  mindFill: document.querySelector("#mind-fill"),
  fullnessStatus: document.querySelector("#fullness-status"),
  fullnessFill: document.querySelector("#fullness-fill"),
  timeIndicator: document.querySelector("#time-indicator"),
  statusPopover: document.querySelector("#status-popover"),
  sceneFrame: document.querySelector(".scene-frame"),
  sceneArt: document.querySelector("#scene-art"),
  sceneLocationBadge: document.querySelector("#scene-location-badge"),
  sceneRiskBadge: document.querySelector("#scene-risk-badge"),
  sceneDebugBadge: document.querySelector("#scene-debug-badge"),
  sceneText: document.querySelector("#scene-text"),
  systemNote: document.querySelector("#system-note"),
  choices: document.querySelector("#choices"),
  choiceTemplate: document.querySelector("#choice-template"),
  panelShell: document.querySelector(".panel-shell"),
  panelTitle: document.querySelector("#panel-title"),
  panelSubtitle: document.querySelector("#panel-subtitle"),
  panelContent: document.querySelector("#panel-content"),
  dockButtons: Array.from(document.querySelectorAll(".dock-button")),
  newGameButton: document.querySelector("#new-game-button"),
};

const client = {
  activePanel: "map",
  snapshot: null,
  gameId: window.localStorage.getItem(STORAGE_KEY) || "",
  lastFetchedAt: 0,
  syncTimer: null,
  mapHint: "",
  activeStatusPopoverKey: null,
  actionInFlight: false,
  sceneRenderToken: 0,
  activeSceneTimer: null,
  activeAnimatedStory: null,
  isSceneTyping: false,
  justCreatedGame: false,
  renderedSystemNote: "",
};

function currentState() {
  return client.snapshot?.state || null;
}

function currentLocationCard() {
  const locationId = currentState()?.location;
  return client.snapshot?.visibleLocations.find((entry) => entry.id === locationId) || null;
}

function isDynamicId(id) {
  return String(id || "").startsWith("dyn_");
}

function buildDevBadgeText({ id, source, packageTraits = [] }) {
  if (!DEV_OBJECT_BADGES) {
    return "";
  }

  const parts = [];
  if (id) {
    parts.push(isDynamicId(id) ? "dynamic" : "seed");
  }
  if (packageTraits.includes("planner:llm")) {
    parts.push("llm-package");
  } else if (packageTraits.includes("planner:template")) {
    parts.push("template-package");
  }
  if (source) {
    parts.push(source);
  }
  return parts.join(" / ");
}

function buildDevBadgeMarkup(entry, fallback = {}) {
  const badgeText = buildDevBadgeText({
    id: entry?.id || fallback.id || entry?.locationId || fallback.locationId || "",
    source: entry?.source || fallback.source || "",
    packageTraits: [
      ...(Array.isArray(entry?.traits) ? entry.traits : []),
      ...(Array.isArray(entry?.tags) ? entry.tags : []),
      ...(Array.isArray(fallback?.traits) ? fallback.traits : []),
      ...(Array.isArray(fallback?.tags) ? fallback.tags : []),
    ],
  });
  if (!badgeText) {
    return "";
  }

  return `<span class="dev-badge">${escapeHtml(badgeText)}</span>`;
}

function projectedWorldElapsedMs() {
  const state = currentState();
  if (!state) {
    return 0;
  }
  const elapsedSinceFetch = Date.now() - client.lastFetchedAt;
  return state.worldElapsedMs + Math.max(0, elapsedSinceFetch);
}

function gameClockLabel() {
  const elapsedInDay = ((projectedWorldElapsedMs() % REAL_DAY_MS) + REAL_DAY_MS) % REAL_DAY_MS;
  const totalMinutes = Math.floor((elapsedInDay / REAL_DAY_MS) * 24 * 60);
  const shiftedMinutes = (totalMinutes + 6 * 60) % (24 * 60);
  const roundedMinutes = Math.floor(shiftedMinutes / 10) * 10;
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minutes = String(roundedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
}

function clearLegacyGameIds() {
  LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

async function createNewGame() {
  const snapshot = await api("/api/games", {
    method: "POST",
    body: {},
  });
  client.gameId = snapshot.gameId;
  client.snapshot = snapshot;
  client.lastFetchedAt = Date.now();
  client.activePanel = "map";
  client.mapHint = "";
  client.justCreatedGame = true;
  clearLegacyGameIds();
  window.localStorage.setItem(STORAGE_KEY, client.gameId);
}

function needsFreshGame(snapshot) {
  return !snapshot || !snapshot.state || snapshot.state.saveVersion !== CLIENT_SAVE_VERSION;
}

async function loadGameState() {
  if (!client.gameId) {
    await createNewGame();
    return;
  }

  try {
    const snapshot = await api(`/api/games/${client.gameId}/state`);
    if (needsFreshGame(snapshot)) {
      await createNewGame();
      return;
    }
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
    client.justCreatedGame = false;
  } catch (_error) {
    await createNewGame();
  }
}

function currentSceneId(snapshot = client.snapshot) {
  return snapshot?.currentScene?.id || "";
}

/** 메인 서사가 이벤트 카드(선택지 포함)를 쓸 때 true — buildSnapshot과 동일 조건 */
function isEventStoryActive(snapshot) {
  const ev = snapshot?.latestEvent;
  return Boolean(ev && Array.isArray(ev.choices) && ev.choices.length > 0);
}

/** 씬/이벤트 전환·backgroundSync 보존 판별용 표면 키 */
function storySurfaceId(snapshot) {
  if (!snapshot) {
    return "";
  }
  if (isEventStoryActive(snapshot)) {
    return `event:${snapshot.latestEvent.id}`;
  }
  return `scene:${currentSceneId(snapshot)}`;
}

function splitSummaryToParagraphs(summary) {
  if (!summary) {
    return [];
  }
  return String(summary)
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function buildStoryDisplay(snapshot) {
  if (!snapshot?.currentScene) {
    return { headline: "", paragraphs: [] };
  }
  if (isEventStoryActive(snapshot)) {
    const ev = snapshot.latestEvent;
    return {
      headline: ev.title || "",
      paragraphs: splitSummaryToParagraphs(ev.summary),
    };
  }
  return {
    headline: "",
    paragraphs: snapshot.currentScene.paragraphs || [],
  };
}

function currentSceneDefinitionId(snapshot = client.snapshot) {
  return snapshot?.state?.sceneId || "";
}

function currentEventId(snapshot = client.snapshot) {
  return snapshot?.state?.activeEventId || snapshot?.currentScene?.eventId || "";
}

function currentSceneIntroFlag(snapshot = client.snapshot) {
  return snapshot?.currentScene?.introFlag || "";
}

function hasConsumedIntroFlag(snapshot, introFlag) {
  return Boolean(introFlag) && Boolean(snapshot?.state?.flags?.[introFlag]);
}

function shouldAnimateScene({ source, previousSnapshot, nextSnapshot }) {
  if (source === "bootstrap" || source === "backgroundSync") {
    return false;
  }

  const nextEventOn = isEventStoryActive(nextSnapshot);
  const prevEventOn = previousSnapshot ? isEventStoryActive(previousSnapshot) : false;
  const nextEvId = nextSnapshot?.latestEvent?.id || "";
  const prevEvId = previousSnapshot?.latestEvent?.id || "";

  if (nextEventOn && nextEvId) {
    if (!prevEventOn || nextEvId !== prevEvId) {
      return true;
    }
  }

  const introFlag = currentSceneIntroFlag(nextSnapshot);
  if (!introFlag) {
    return false;
  }

  if (source === "newGame") {
    return true;
  }

  return !hasConsumedIntroFlag(previousSnapshot, introFlag);
}

function shouldPreserveDisplayedScene(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot?.currentScene || !nextSnapshot?.currentScene) {
    return false;
  }

  if (previousSnapshot?.state?.location !== nextSnapshot?.state?.location) {
    return false;
  }

  // 이벤트 ↔ 평시 씬 전환 시 이전 씬 카드만 붙잡아 두면 복귀 직후 본문이 어긋난다.
  if (storySurfaceId(previousSnapshot) !== storySurfaceId(nextSnapshot)) {
    return false;
  }

  // 같은 이벤트 표면이면 본문은 latestEvent 기준이라 씬 카드 id 변화만으로는 끊지 않는다.
  if (isEventStoryActive(previousSnapshot) && isEventStoryActive(nextSnapshot)) {
    return true;
  }

  // 같은 씬 카드 키(날짜·페이즈·캐시 버전 포함)일 때만 이전 본문을 유지한다.
  return currentSceneId(previousSnapshot) === currentSceneId(nextSnapshot);
}

function availableActionsSignature(snapshot) {
  const list = snapshot?.availableActions ?? [];
  // id만 보면 라벨·힌트만 바뀐 서버 응답에서 actionsChanged가 false가 되어 선택지 DOM이 갱신되지 않는다.
  return list
    .map((choice) => `${choice.id}:${choice.label}:${choice.outcomeHint ?? ""}:${choice.isAvailable ? "1" : "0"}`)
    .join("|");
}

function preserveDisplayedSceneSnapshot(previousSnapshot, nextSnapshot) {
  return {
    ...nextSnapshot,
    currentScene: previousSnapshot.currentScene,
    // 서버의 행동 목록은 항상 반영한다. 이전 스냅샷을 유지할 때(페이즈만 바뀐 backgroundSync 등)
    // 옛 scene 카드와 함께 버튼만 낡은 채로 남는 문제를 막는다.
    availableActions: nextSnapshot.availableActions,
  };
}

function scheduleSceneStep(callback, delay) {
  return new Promise((resolve) => {
    client.activeSceneTimer = window.setTimeout(() => {
      client.activeSceneTimer = null;
      callback();
      resolve();
    }, delay);
  });
}

function clearSceneAnimation() {
  client.sceneRenderToken += 1;
  if (client.activeSceneTimer !== null) {
    window.clearTimeout(client.activeSceneTimer);
    client.activeSceneTimer = null;
  }
  client.activeAnimatedStory = null;
  client.isSceneTyping = false;
}

async function typeParagraph(paragraphElement, text, token) {
  paragraphElement.classList.add("typing");
  for (let index = 1; index <= text.length; index += 1) {
    if (token !== client.sceneRenderToken) {
      return false;
    }
    paragraphElement.textContent = text.slice(0, index);
    const currentChar = text[index - 1];
    const delay = /[.!?]/.test(currentChar)
      ? TYPEWRITER_CHAR_DELAY + 40
      : /[,;:]/.test(currentChar)
        ? TYPEWRITER_CHAR_DELAY + 20
        : TYPEWRITER_CHAR_DELAY;
    await scheduleSceneStep(() => {}, delay);
  }
  paragraphElement.classList.remove("typing");
  return token === client.sceneRenderToken;
}

async function animateStoryText(story, token) {
  client.activeAnimatedStory = story;
  client.isSceneTyping = true;
  dom.sceneText.innerHTML = "";
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");

  if (story.headline) {
    if (token !== client.sceneRenderToken) {
      client.isSceneTyping = false;
      client.activeAnimatedStory = null;
      return;
    }
    const headlineElement = document.createElement("p");
    headlineElement.className = "scene-headline";
    dom.sceneText.appendChild(headlineElement);
    const headlineDone = await typeParagraph(headlineElement, story.headline, token);
    if (!headlineDone) {
      client.isSceneTyping = false;
      client.activeAnimatedStory = null;
      return;
    }
    await scheduleSceneStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  for (const paragraph of story.paragraphs) {
    if (token !== client.sceneRenderToken) {
      client.isSceneTyping = false;
      client.activeAnimatedStory = null;
      return;
    }
    const paragraphElement = document.createElement("p");
    dom.sceneText.appendChild(paragraphElement);
    const completed = await typeParagraph(paragraphElement, paragraph, token);
    if (!completed) {
      client.isSceneTyping = false;
      client.activeAnimatedStory = null;
      return;
    }
    await scheduleSceneStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  if (token === client.sceneRenderToken) {
    client.isSceneTyping = false;
    client.activeAnimatedStory = null;
    renderChoices();
  }
}

function skipSceneTyping() {
  const story = client.activeAnimatedStory;
  if (!client.isSceneTyping || !story) {
    return false;
  }
  clearSceneAnimation();
  const headlineBlock = story.headline
    ? `<p class="scene-headline">${escapeHtml(story.headline)}</p>`
    : "";
  dom.sceneText.innerHTML =
    headlineBlock + story.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  renderChoices();
  return true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSystemNote(note) {
  if (!note) {
    dom.systemNote.hidden = true;
    dom.systemNote.innerHTML = "";
    dom.systemNote.classList.remove("is-entering");
    client.renderedSystemNote = "";
    return;
  }

  const changed = note !== client.renderedSystemNote;
  const parts = note.split(" / ").map((part) => {
    const trimmed = part.trim();
    if (trimmed.startsWith("+")) {
      return `<span class="system-note-token is-positive">${escapeHtml(trimmed)}</span>`;
    }
    if (trimmed.startsWith("-")) {
      return `<span class="system-note-token is-negative">${escapeHtml(trimmed)}</span>`;
    }
    return `<span class="system-note-token">${escapeHtml(trimmed)}</span>`;
  });

  dom.systemNote.hidden = false;
  dom.systemNote.innerHTML = parts.join("");
  if (changed) {
    dom.systemNote.classList.remove("is-entering");
    void dom.systemNote.offsetWidth;
    dom.systemNote.classList.add("is-entering");
  }
  client.renderedSystemNote = note;
}

function openStatusPopover(statKey, options = {}) {
  const snapshot = currentState();
  const { toggle = true } = options;
  const trigger = dom[`${statKey}Status`];
  if (!trigger || !snapshot) {
    return;
  }

  if (toggle && client.activeStatusPopoverKey === statKey && !dom.statusPopover.hidden) {
    closeStatusPopover();
    return;
  }

  client.activeStatusPopoverKey = statKey;
  const detail = {
    hp: {
      title: "체력",
      value: `${snapshot.stats.hp} / 10`,
      note: "부상을 견디고 움직일 수 있는 상태입니다.",
    },
    mind: {
      title: "정신력",
      value: `${snapshot.stats.mind} / 10`,
      note: "불안과 피로 속에서도 판단을 유지하는 힘입니다.",
    },
    fullness: {
      title: "포만감",
      value: `${snapshot.stats.fullness} / 10`,
      note: "시간이 지나면 줄어들고, 음식과 물로 회복합니다.",
    },
  }[statKey];

  dom.statusPopover.innerHTML = `
    <strong>${detail.title}</strong>
    <p>${detail.value}</p>
    <p>${detail.note}</p>
  `;

  const stripRect = dom.statusStrip.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const left = Math.max(12, triggerRect.left - stripRect.left);
  dom.statusPopover.style.left = `${left}px`;
  dom.statusPopover.hidden = false;
}

function closeStatusPopover() {
  client.activeStatusPopoverKey = null;
  dom.statusPopover.hidden = true;
  dom.statusPopover.innerHTML = "";
}

function renderStatusBar() {
  const snapshot = currentState();
  if (!snapshot) {
    return;
  }

  dom.hpFill.style.width = `${snapshot.stats.hp * 10}%`;
  dom.mindFill.style.width = `${snapshot.stats.mind * 10}%`;
  dom.fullnessFill.style.width = `${snapshot.stats.fullness * 10}%`;
  dom.hpStatus.setAttribute("aria-label", `체력 ${snapshot.stats.hp} / 10`);
  dom.mindStatus.setAttribute("aria-label", `정신력 ${snapshot.stats.mind} / 10`);
  dom.fullnessStatus.setAttribute("aria-label", `포만감 ${snapshot.stats.fullness} / 10`);
  dom.timeIndicator.textContent = `${snapshot.day}일차 ${gameClockLabel()}`;

  if (client.activeStatusPopoverKey) {
    openStatusPopover(client.activeStatusPopoverKey, { toggle: false });
  }
}

function renderChoices() {
  const snapshot = client.snapshot;
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");
  if (!snapshot) {
    return;
  }

  snapshot.availableActions.forEach((choice) => {
    const fragment = dom.choiceTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    const label = fragment.querySelector(".choice-label");
    const meta = fragment.querySelector(".choice-meta");
    const isCraftingMenu = currentSceneDefinitionId(snapshot) === "shelter_crafting_menu";
    const isCraftingRecipe = isCraftingMenu && choice.id !== "leave_shelter_crafting";
    const isQuestChoice = choice.label.startsWith("퀘스트:");
    label.textContent = choice.label;
    meta.textContent = choice.nextSceneId
      ? `${choice.outcomeHint} -> ${choice.nextSceneId}`
      : choice.outcomeHint;
    button.classList.toggle("is-quest", isQuestChoice);
    button.classList.toggle("is-crafting-option", isCraftingRecipe);
    button.classList.toggle("is-recipe-available", isCraftingRecipe && choice.isAvailable);
    button.classList.toggle("is-recipe-unavailable", isCraftingRecipe && !choice.isAvailable);
    button.disabled = client.actionInFlight;
    button.addEventListener("click", () => submitAction(choice.action));
    dom.choices.appendChild(fragment);
  });

  dom.choices.classList.add("revealed");
}

function renderScene(animateText = true) {
  const snapshot = client.snapshot;
  const scene = snapshot?.currentScene;
  const location = currentLocationCard();
  if (!snapshot || !scene || !location) {
    return;
  }

  const story = buildStoryDisplay(snapshot);

  dom.sceneArt.src = location.imagePath || "assets/scenes/camp.svg";
  dom.sceneLocationBadge.textContent = location.name;
  dom.sceneRiskBadge.textContent = isEventStoryActive(snapshot) ? "이벤트" : location.risk;
  const eventId = currentEventId(snapshot);
  const actionCount = snapshot.availableActions?.length ?? 0;
  const actionIds = (snapshot.availableActions ?? []).map((c) => c.id).join(", ");
  const debugText = eventId
    ? `event: ${eventId} / scene: ${currentSceneDefinitionId(snapshot)} / actions: ${actionCount} [${actionIds}]`
    : `scene: ${currentSceneDefinitionId(snapshot)} / actions: ${actionCount} [${actionIds}]`;
  const debugBadges = DEV_OBJECT_BADGES
    ? [
        buildDevBadgeMarkup(location),
        buildDevBadgeMarkup({ id: scene.locationId || location.id, source: scene.source }),
      ].filter(Boolean).join("")
    : "";
  dom.sceneDebugBadge.innerHTML = `${debugBadges}<span class="scene-debug-text">${escapeHtml(debugText)}</span>`;
  renderSystemNote(snapshot.state.systemNote || "");

  clearSceneAnimation();
  if (!animateText) {
    const headlineBlock = story.headline
      ? `<p class="scene-headline">${escapeHtml(story.headline)}</p>`
      : "";
    dom.sceneText.innerHTML =
      headlineBlock + story.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    renderChoices();
    return;
  }

  const token = client.sceneRenderToken;
  animateStoryText(story, token);
}

function locationMap() {
  const visible = new Map(client.snapshot.visibleLocations.map((entry) => [entry.id, entry]));
  const states = new Map(client.snapshot.mapEntries.map((entry) => [entry.locationId, entry]));
  return { visible, states };
}

function renderMapPanel() {
  const snapshot = client.snapshot;
  if (!snapshot) {
    return;
  }

  const currentLocation = currentLocationCard();
  const { visible, states } = locationMap();
  const boardSlots = buildBoardSlots(visible, states);
  const boardLayout = buildHexBoardLayout(boardSlots);

  const tileMarkup = boardSlots.map((slot) => {
    const position = boardLayout.positions.get(slot.slotId) || { x: 0, y: 0 };
    const location = visible.get(slot.locationId);
    const state = states.get(slot.locationId);
    if (!location || !state) {
      return "";
    }
    const classes = [
      "hex-tile",
      state.isCurrent ? "is-current" : "",
      state.isAdjacent ? "is-adjacent" : "",
      state.isReachable ? "is-reachable" : "",
      state.isVisited ? "is-visited" : "",
      state.isControlled ? "is-controlled" : "",
      state.isAdjacent && !state.isReachable ? "is-locked" : "",
      !state.isCurrent && !state.isAdjacent ? "is-known" : "",
    ].filter(Boolean).join(" ");

    const meta = state.isCurrent
      ? "현재 위치"
      : state.isControlled
        ? "통제됨"
        : state.isReachable
          ? "이동 가능"
          : state.isVisited
            ? "방문함"
            : "";

    return `
      <button
        class="${classes}"
        data-hex-location="${slot.locationId}"
        type="button"
        style="left:${position.x}px; top:${position.y}px; width:${boardLayout.dimensions.width}px; min-height:${boardLayout.dimensions.height}px;"
      >
        <span class="hex-tile-body">
          ${buildDevBadgeMarkup(location)}
          <span class="hex-tile-risk">${location.risk}</span>
          <span class="hex-tile-name">${location.name}</span>
          ${meta ? `<span class="hex-tile-meta">${meta}</span>` : ""}
        </span>
      </button>
    `;
  }).join("");

  const adjacentCards = snapshot.mapEntries
    .filter((entry) => visible.has(entry.locationId))
    .filter((entry) => entry.isAdjacent && !entry.isCurrent)
    .map((entry) => {
      const location = visible.get(entry.locationId);
      if (!location) {
        return "";
      }
      return `
        <article
          class="map-card map-card-compact ${entry.isReachable ? "is-reachable" : "is-locked"}"
          ${entry.isReachable ? `data-travel-card="${entry.locationId}"` : ""}
        >
          <div class="map-meta">
            <h3>${location.name}</h3>
            <span class="tag">${location.risk}</span>
          </div>
          ${buildDevBadgeMarkup(location)}
          <p>${location.summary}</p>
          ${entry.isReachable ? "" : `<small class="tiny">${entry.reason || "이동 불가"}</small>`}
        </article>
      `;
    }).join("");

  dom.panelContent.innerHTML = `
    <section class="hex-map-shell">
      <article class="map-card map-current-card">
        <div class="map-meta">
          <h3>${currentLocation.name}</h3>
          <span class="tag">${currentLocation.risk}</span>
        </div>
        ${buildDevBadgeMarkup(currentLocation)}
        <p>${currentLocation.summary}</p>
      </article>

      <div class="hex-map-board">
        <div
          class="hex-map-stage"
          style="width:${boardLayout.pixelWidth}px; height:${boardLayout.pixelHeight}px; --hex-width:${boardLayout.dimensions.width}px; --hex-height:${boardLayout.dimensions.height}px;"
        >
          ${tileMarkup}
        </div>
      </div>

      <div class="map-list">
        ${adjacentCards}
      </div>
    </section>
  `;

  dom.panelContent.querySelectorAll("[data-hex-location]").forEach((button) => {
    button.addEventListener("click", () => {
      const locationId = button.dataset.hexLocation;
      const entry = states.get(locationId);
      const location = visible.get(locationId);
      if (!entry || !location) {
        return;
      }
      if (entry.isCurrent) {
        client.mapHint = `${location.name}에 이미 머물러 있다.`;
        renderPanel();
        return;
      }
      if (entry.isReachable) {
        client.mapHint = "";
        submitAction({ type: "travel", targetId: locationId });
        return;
      }
      if (entry.isControlled) {
        client.mapHint = entry.reason || "아직 이동할 수 없다.";
        renderPanel();
        return;
      }
      if (entry.isAdjacent) {
        client.mapHint = entry.reason || "아직 이동할 수 없는 경로다.";
        renderPanel();
      }
    });
  });

  dom.panelContent.querySelectorAll("[data-travel-card]").forEach((card) => {
    card.addEventListener("click", () => {
      client.mapHint = "";
      submitAction({ type: "travel", targetId: card.dataset.travelCard });
    });
  });
}

function renderInventoryPanel() {
  const snapshot = client.snapshot;
  const itemCards = snapshot.inventoryCards || [];
  const moneyCard = `
    <article class="info-card inventory-card">
      <div class="inventory-card-head">
        <h3>돈</h3>
        <span class="tag">${snapshot.state.money.toLocaleString()}원</span>
      </div>
      <p>한 끼를 사고, 필요한 물건을 마련하는 데 쓰는 현금이다.</p>
    </article>
  `;

  if (itemCards.length === 0) {
    dom.panelContent.innerHTML = `
      <div class="panel-grid">${moneyCard}</div>
      <p class="empty-state">지금 가진 물건이 없다.</p>
    `;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${moneyCard}
      ${itemCards.map((item) => {
        const count = snapshot.state.inventory[item.id] || 0;
        const isUsable = item.kind === "food" || item.kind === "drink" || item.kind === "medicine";
        return `
          <article class="info-card inventory-card">
            <div class="inventory-card-head">
              <h3>${item.name} ${count > 1 ? `x${count}` : ""}</h3>
              <div class="item-actions">
                ${isUsable ? `<button class="inline-action" data-use-item="${item.id}" type="button">사용</button>` : ""}
              </div>
            </div>
            ${buildDevBadgeMarkup(item)}
            <p>${item.description}</p>
          </article>
        `;
      }).join("")}
    </div>
  `;

  dom.panelContent.querySelectorAll("[data-use-item]").forEach((button) => {
    button.addEventListener("click", () => {
      submitAction({ type: "use_item", itemId: button.dataset.useItem });
    });
  });
}

function renderSkillsPanel() {
  const skills = client.snapshot.skills || [];
  if (!skills.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 얻은 생존 방식이 없다.</p>`;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${skills.map((skill) => `
        <article class="info-card">
          <h3>${skill.name}</h3>
          <p>${skill.description}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function questStatusLabel(status) {
  if (status === "active") {
    return "진행 중";
  }
  if (status === "completed") {
    return "완료";
  }
  return "대기";
}

function renderQuestsPanel() {
  const visibleQuests = (client.snapshot.quests || []).filter((quest) => quest.status !== "inactive");
  if (!visibleQuests.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 받은 퀘스트가 없다.</p>`;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${visibleQuests.map((quest) => `
        <article class="quest-card">
          <div class="map-meta">
            <h3>${quest.name}</h3>
            <span class="tag">${questStatusLabel(quest.status)}</span>
          </div>
          ${buildDevBadgeMarkup(quest)}
          <p>${quest.summary}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderLogPanel() {
  const logs = client.snapshot.state.log || [];
  if (!logs.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 남겨진 기록이 없습니다.</p>`;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="log-list">
      ${logs.map((entry) => {
        const timestampLabel = typeof entry === "string"
          ? `${client.snapshot.day}일차 ${gameClockLabel()}`
          : entry.timestampLabel;
        const message = typeof entry === "string" ? entry : entry.message;
        return `
        <article class="log-line">
          <span class="log-time">${timestampLabel}</span>
          <p class="log-message">${message}</p>
        </article>
      `;
      }).join("")}
    </div>
  `;
}

function renderPanel() {
  const config = PANEL_CONFIG[client.activePanel];
  dom.panelTitle.textContent = config.title;
  dom.panelSubtitle.textContent = config.subtitle;
  if (client.activePanel === "map") {
    renderMapPanel();
  } else if (client.activePanel === "inventory") {
    renderInventoryPanel();
  } else if (client.activePanel === "skills") {
    renderSkillsPanel();
  } else if (client.activePanel === "quests") {
    renderQuestsPanel();
  } else {
    renderLogPanel();
  }
  dom.dockButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === client.activePanel);
  });
}

function render(options = {}) {
  if (!client.snapshot) {
    return;
  }
  renderStatusBar();
  renderScene(options.animateScene !== false);
  renderPanel();
  client.justCreatedGame = false;
}

async function submitAction(action) {
  if (!client.gameId || client.actionInFlight) {
    return;
  }
  client.actionInFlight = true;
  const previousSnapshot = client.snapshot;
  try {
    const snapshot = await api(`/api/games/${client.gameId}/actions`, {
      method: "POST",
      body: action,
    });
    if (needsFreshGame(snapshot)) {
      await createNewGame();
      render({
        animateScene: shouldAnimateScene({
          source: "newGame",
          previousSnapshot: null,
          nextSnapshot: client.snapshot,
        }),
      });
      return;
    }
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
    client.mapHint = "";
    client.actionInFlight = false;
    render({
      animateScene: shouldAnimateScene({
        source: "action",
        previousSnapshot,
        nextSnapshot: snapshot,
      }),
    });
    if (action?.type === "travel") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "액션 처리에 실패했습니다.");
  } finally {
    client.actionInFlight = false;
  }
}

async function backgroundSync() {
  if (!client.gameId || client.actionInFlight) {
    renderStatusBar();
    return;
  }
  try {
    const snapshot = await api(`/api/games/${client.gameId}/state`);
    if (needsFreshGame(snapshot)) {
      await createNewGame();
      render({
        animateScene: shouldAnimateScene({
          source: "newGame",
          previousSnapshot: null,
          nextSnapshot: client.snapshot,
        }),
      });
      return;
    }
    const previousSnapshot = client.snapshot;
    const previousSurfaceId = storySurfaceId(previousSnapshot);
    const previousNote = previousSnapshot?.state?.systemNote;
    const effectiveSnapshot = shouldPreserveDisplayedScene(previousSnapshot, snapshot)
      ? preserveDisplayedSceneSnapshot(previousSnapshot, snapshot)
      : snapshot;
    client.snapshot = effectiveSnapshot;
    client.lastFetchedAt = Date.now();
    const surfaceChanged = previousSurfaceId !== storySurfaceId(effectiveSnapshot);
    const noteChanged = previousNote !== effectiveSnapshot.state.systemNote;
    const actionsChanged =
      availableActionsSignature(previousSnapshot) !== availableActionsSignature(effectiveSnapshot);
    if (surfaceChanged || noteChanged || actionsChanged) {
      render({
        animateScene: shouldAnimateScene({
          source: "backgroundSync",
          previousSnapshot,
          nextSnapshot: effectiveSnapshot,
        }),
      });
      return;
    }
    renderStatusBar();
  } catch (_error) {
    renderStatusBar();
  }
}

async function bootstrap() {
  clearLegacyGameIds();
  const health = await api("/api/health");
  if (!health.ok) {
    throw new Error("서버 상태가 올바르지 않습니다.");
  }
  await loadGameState();
  render({
    animateScene: shouldAnimateScene({
      source: client.justCreatedGame ? "newGame" : "bootstrap",
      previousSnapshot: null,
      nextSnapshot: client.snapshot,
    }),
  });
  client.syncTimer = window.setInterval(backgroundSync, 10000);
  window.setInterval(() => renderStatusBar(), CLOCK_TICK_MS);
}

dom.dockButtons.forEach((button) => {
  button.addEventListener("click", () => {
    client.activePanel = button.dataset.panel;
    renderPanel();
    if (client.activePanel === "map" && dom.panelShell) {
      dom.panelShell.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
});

["hp", "mind", "fullness"].forEach((statKey) => {
  const button = dom[`${statKey}Status`];
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openStatusPopover(statKey);
  });
});

document.addEventListener("click", (event) => {
  if (dom.statusPopover.hidden) {
    return;
  }
  if (dom.statusPopover.contains(event.target)) {
    return;
  }
  closeStatusPopover();
});

dom.sceneFrame.addEventListener("click", (event) => {
  if (event.target.closest(".choice-button, .dock-button, .inline-action, .ghost-button")) {
    return;
  }
  skipSceneTyping();
});

dom.newGameButton.addEventListener("click", async () => {
  const confirmed = window.confirm("새 게임을 시작하면 현재 진행 중인 세션 대신 새 세션이 만들어집니다.");
  if (!confirmed) {
    return;
  }
  clearSceneAnimation();
  try {
    await createNewGame();
    render({
      animateScene: shouldAnimateScene({
        source: "newGame",
        previousSnapshot: null,
        nextSnapshot: client.snapshot,
      }),
    });
  } catch (error) {
    console.error(error);
    window.alert(error instanceof Error ? error.message : "새 게임을 시작하지 못했습니다.");
  }
});

bootstrap().catch((error) => {
  console.error(error);
  dom.sceneText.innerHTML = `<p>서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
  dom.panelContent.innerHTML = `<p class="empty-state">API 서버가 필요합니다.</p>`;
});
