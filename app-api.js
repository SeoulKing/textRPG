const SAVED_GAME_ID_KEY = "ruined-seoul-stage1-manual-save-game-id-v1";
const LEGACY_STORAGE_KEYS = [
  "ruined-seoul-stage1-game-id",
  "ruined-seoul-stage1-game-id-v12",
  "ruined-seoul-stage1-game-id-v11",
  "ruined-seoul-stage1-game-id-v10",
  "ruined-seoul-stage1-game-id-v9",
  "ruined-seoul-stage1-game-id-v8",
  "ruined-seoul-stage1-game-id-v7",
];
const REAL_DAY_MS = 15 * 60 * 1000;
const GAME_MINUTE_MS = REAL_DAY_MS / (24 * 60);
const CLOCK_TICK_MS = 1000;
const TYPEWRITER_CHAR_DELAY = 20;
const TYPEWRITER_PARAGRAPH_DELAY = 260;
const ACTION_TRANSITION_ACTION_MS = 500;
const ACTION_TRANSITION_MOVEMENT_MS = 1000;
const ACTION_ASSET_PRELOAD_TIMEOUT_MS = 1200;
const TIME_ADVANCE_EMPHASIS_MS = 820;
const SQRT_3 = Math.sqrt(3);
const DEFAULT_HEX_COORDS = {
  shelter: { q: 0, r: 0 },
  convenience: { q: -1, r: 1 },
  kitchen: { q: 1, r: 0 },
  forest: { q: 0, r: 1 },
  subway: { q: 2, r: 0 },
  hospital: { q: -2, r: 2 },
  checkpoint: { q: 2, r: -2 },
};
const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
const MAP_ZOOM_MULTIPLIERS = [0.56, 0.68, 0.82, 1, 1.18, 1.42, 1.72, 2.08, 2.5];
const MAP_ZOOM_FIT_INDEX = 3;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currentHexDimensions() {
  if (window.matchMedia("(max-width: 620px)").matches) {
    const size = 42;
    return {
      size,
      padding: 28,
    };
  }

  return {
    size: 58,
    padding: 34,
  };
}

function locationHexCoord(location) {
  return location?.mapPosition || DEFAULT_HEX_COORDS[location?.id] || null;
}

function isHexNeighbor(left, right) {
  if (!left || !right) {
    return false;
  }
  return HEX_DIRECTIONS.some((direction) =>
    left.q + direction.q === right.q && left.r + direction.r === right.r
  );
}

function hexToPixel(q, r, size) {
  return {
    x: size * 1.5 * q,
    y: size * SQRT_3 * (r + q / 2),
  };
}

function hexPoints(cx, cy, size) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
  }).join(" ");
}

function buildBoardNodes(visible) {
  const nodes = [];
  const usedLocationIds = new Set();
  visible.forEach((location, locationId) => {
    const coord = locationHexCoord(location);
    if (!coord) {
      return;
    }
    nodes.push({ locationId, q: coord.q, r: coord.r });
    usedLocationIds.add(locationId);
  });

  const maxR = nodes.length ? Math.max(...nodes.map((node) => node.r)) : 0;
  Array.from(visible.keys())
    .filter((locationId) => !usedLocationIds.has(locationId))
    .forEach((locationId, index) => {
      nodes.push({
        locationId,
        q: index,
        r: maxR + 2 + Math.floor(index / 4),
      });
    });

  return nodes;
}

function buildHexBoardLayout(nodes) {
  const dimensions = currentHexDimensions();
  const inset = {
    top: dimensions.padding,
    right: dimensions.padding,
    bottom: dimensions.padding,
    left: dimensions.padding,
  };
  const layoutNodes = nodes.length ? nodes : [{ locationId: "fallback", q: 0, r: 0 }];
  const rawPositions = layoutNodes.map((node) => {
    const { x, y } = hexToPixel(node.q, node.r, dimensions.size);
    return {
      locationId: node.locationId,
      x,
      y,
    };
  });

  const minLeft = Math.min(...rawPositions.map((position) => position.x - dimensions.size));
  const maxRight = Math.max(...rawPositions.map((position) => position.x + dimensions.size));
  const minTop = Math.min(...rawPositions.map((position) => position.y - dimensions.size));
  const maxBottom = Math.max(...rawPositions.map((position) => position.y + dimensions.size));
  const positionsMap = new Map(rawPositions.map((position) => [position.locationId, {
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

function mapAvailableSize() {
  const panelWidth = dom.panelContent?.clientWidth || Math.min(window.innerWidth - 32, 520);
  const isMobile = window.matchMedia("(max-width: 620px)").matches;
  return {
    width: Math.max(250, panelWidth - 34),
    height: isMobile ? 286 : 368,
  };
}

function mapFitScale(boardLayout) {
  const available = mapAvailableSize();
  const widthScale = available.width / Math.max(1, boardLayout.pixelWidth);
  const heightScale = available.height / Math.max(1, boardLayout.pixelHeight);
  return clampNumber(Math.min(widthScale, heightScale), 0.46, 1.24);
}

function currentMapScale(boardLayout) {
  const multiplier = MAP_ZOOM_MULTIPLIERS[client.mapZoomIndex] ?? 1;
  return clampNumber(mapFitScale(boardLayout) * multiplier, 0.32, 2.75);
}

function alignHexMapViewport(boardLayout, mapScale, currentLocationId) {
  const board = dom.panelContent?.querySelector(".hex-map-board");
  const scrollSpace = dom.panelContent?.querySelector(".hex-map-scroll-space");
  const canvas = dom.panelContent?.querySelector(".hex-map-canvas");
  if (!board || !scrollSpace || !canvas) {
    return;
  }

  const currentPosition = boardLayout.positions.get(currentLocationId);
  const focusCurrent = client.mapZoomIndex > MAP_ZOOM_FIT_INDEX && currentPosition;
  const canvasLeft = scrollSpace.offsetLeft + canvas.offsetLeft;
  const canvasTop = scrollSpace.offsetTop + canvas.offsetTop;
  const targetX = canvasLeft + (focusCurrent ? currentPosition.x * mapScale : canvas.offsetWidth / 2);
  const targetY = canvasTop + (focusCurrent ? currentPosition.y * mapScale : canvas.offsetHeight / 2);
  const nextLeft = targetX - board.clientWidth / 2;
  const nextTop = targetY - board.clientHeight / 2;
  board.scrollLeft = clampNumber(nextLeft, 0, Math.max(0, board.scrollWidth - board.clientWidth));
  board.scrollTop = clampNumber(nextTop, 0, Math.max(0, board.scrollHeight - board.clientHeight));
}

const PANEL_CONFIG = {
  map: {
    title: "이동",
  },
  inventory: {
    title: "아이템",
  },
  status: {
    title: "상태",
  },
  quests: {
    title: "퀘스트",
  },
  log: {
    title: "기록",
  },
  itemCodex: {
    title: "아이템 도감",
  },
  menu: {
    title: "메뉴",
  },
};

const ITEM_KIND_LABELS = {
  material: "재료",
  tool: "도구",
  food: "음식",
  drink: "음료",
  medicine: "약품",
  ticket: "교환권",
  trade: "거래품",
};
const ITEM_KIND_ORDER = ["material", "tool", "food", "drink", "medicine", "ticket", "trade"];

const STATUS_DETAILS = {
  hp: {
    title: "체력",
    max: 10,
    note: "부상을 견디고 움직일 수 있는 힘",
  },
  mind: {
    title: "정신력",
    max: 10,
    note: "불안과 피로 속에서도 판단을 유지하는 힘",
  },
  energy: {
    title: "기력",
    max: 15,
    note: "시간이 지나면 줄어들고 음식으로 회복 가능",
  },
};

function isMagicWorldState(state = currentState()) {
  return Boolean(state?.flags?.in_magic_world);
}

function statusDetailFor(statKey, state = currentState()) {
  if (statKey === "mind" && isMagicWorldState(state)) {
    return {
      title: "MP",
      max: 10,
      note: "마법과 룬을 다룰 때 소모되는 마력",
    };
  }
  return STATUS_DETAILS[statKey];
}

const dom = {
  homeScreen: document.querySelector("#home-screen"),
  homeNewGame: document.querySelector("#home-new-game"),
  homeContinue: document.querySelector("#home-continue"),
  homeFullscreenPlay: document.querySelector("#home-fullscreen-play"),
  homeSaveStatus: document.querySelector("#home-save-status"),
  homeAuthStatus: document.querySelector("#home-auth-status"),
  homeKakaoLogin: document.querySelector("#home-kakao-login"),
  homeLogout: document.querySelector("#home-logout"),
  appShell: document.querySelector(".app-shell"),
  statusStrip: document.querySelector(".status-strip"),
  hpStatus: document.querySelector("#hp-status"),
  hpFill: document.querySelector("#hp-fill"),
  mindStatus: document.querySelector("#mind-status"),
  mindFill: document.querySelector("#mind-fill"),
  energyStatus: document.querySelector("#energy-status"),
  energyFill: document.querySelector("#energy-fill"),
  timeStatus: document.querySelector(".status-time"),
  timeIndicator: document.querySelector("#time-indicator"),
  encounterStatus: document.querySelector("#encounter-status"),
  encounterStatusName: document.querySelector("#encounter-status-name"),
  encounterHealth: document.querySelector("#encounter-health"),
  encounterHealthValue: document.querySelector("#encounter-health-value"),
  encounterBuildSummary: document.querySelector("#encounter-build-summary"),
  statusPopover: document.querySelector("#status-popover"),
  sceneFrame: document.querySelector(".scene-frame"),
  sceneArt: document.querySelector("#scene-art"),
  sceneAnimation: document.querySelector("#scene-animation"),
  sceneDevSource: document.querySelector("#scene-dev-source"),
  sceneText: document.querySelector("#scene-text"),
  systemNote: document.querySelector("#system-note"),
  questCompletion: null,
  choices: document.querySelector("#choices"),
  choiceTemplate: document.querySelector("#choice-template"),
  gameOverScreen: null,
  panelShell: document.querySelector(".panel-shell"),
  panelTitle: document.querySelector("#panel-title"),
  panelContent: document.querySelector("#panel-content"),
  dockButtons: Array.from(document.querySelectorAll(".dock-button")),
};

let activeSceneDirector = null;
let sceneDirectorLoadError = null;
const sceneDirectorReady = import("./client/graphics/scene-director.js")
  .then(({ SceneDirector }) => {
    activeSceneDirector = new SceneDirector({
      canvas: dom.sceneAnimation,
      host: dom.sceneFrame,
    });
    return activeSceneDirector;
  })
  .catch((error) => {
    sceneDirectorLoadError = error instanceof Error ? error.message : String(error);
    throw error;
  });

const sceneDirector = {
  preloadShelter() {
    return sceneDirectorReady.then((director) => director.preloadShelter());
  },
  showShelterAtStation(station, options) {
    return sceneDirectorReady.then((director) =>
      director.showShelterAtStation(station, options)
    );
  },
  moveShelterActor(station, options) {
    return sceneDirectorReady.then((director) =>
      director.moveShelterActor(station, options)
    );
  },
  hideShelter() {
    activeSceneDirector?.hideShelter();
    dom.sceneAnimation.hidden = true;
    dom.sceneFrame.classList.remove("has-shelter-scene-visual");
  },
  snapshot() {
    if (sceneDirectorLoadError) {
      return {
        engine: "phaser",
        state: "error",
        error: sceneDirectorLoadError,
      };
    }
    return activeSceneDirector?.snapshot() ?? {
      engine: "phaser",
      state: "loading",
    };
  },
};

const client = {
  isHomeVisible: true,
  activePanel: "map",
  isPanelOpen: false,
  snapshot: null,
  gameId: "",
  saveInfo: null,
  authInfo: null,
  hasUnsavedProgress: false,
  menuStatusMessage: "",
  geminiTestInFlight: false,
  geminiTestStatus: null,
  lastFetchedAt: 0,
  syncTimer: null,
  mapHint: "",
  mapZoomIndex: MAP_ZOOM_FIT_INDEX,
  activeMapDetailKey: null,
  activeStatusPopoverKey: null,
  activeStatusPanelView: "status",
  activeStatusDetailKey: null,
  activeInventoryDetailKey: null,
  inventoryScrollTop: 0,
  activeCraftingRecipeDetailId: null,
  isCompletedQuestGroupOpen: false,
  actionInFlight: false,
  fullscreenLaunchInFlight: false,
  pendingAction: null,
  pendingActionElement: null,
  pendingActionSceneElement: null,
  pendingActionStatusElement: null,
  pendingActionProgressElement: null,
  pendingActionDisabledControls: [],
  actionTransitionMessage: "",
  actionTransitionStartedAt: 0,
  actionTransitionDurationMs: 0,
  sceneRenderToken: 0,
  activeSceneTimer: null,
  activeSceneTimerResolve: null,
  activeAnimatedStory: null,
  activeAnimatedSystemNote: null,
  activeStoryAnimationOptions: null,
  isSceneTyping: false,
  justCreatedGame: false,
  renderedSystemNote: "",
  renderedSystemNoteKey: "",
  renderedStorySurfaceId: "",
  questCelebrationTimer: null,
  renderedWorldElapsedMs: null,
  timeAdvanceTimer: null,
};

const TRANSIENT_SCROLLBAR_HIDE_MS = 700;
const transientScrollbars = new WeakMap();

function attachTransientScrollbarPart(element, state, axis) {
  const key = axis === "horizontal" ? "horizontal" : "vertical";
  if (state[key]?.isConnected) {
    return;
  }

  const scrollbar = document.createElement("span");
  scrollbar.className = `transient-scrollbar is-${key}`;
  scrollbar.setAttribute("aria-hidden", "true");
  element.append(scrollbar);
  state[key] = scrollbar;
}

function updateTransientScrollbar(element, shouldShow = false) {
  const state = transientScrollbars.get(element);
  if (!state) {
    return;
  }

  attachTransientScrollbarPart(element, state, "vertical");
  if (state.hasHorizontal) {
    attachTransientScrollbarPart(element, state, "horizontal");
  }

  const inset = 4;
  const hasVertical = element.scrollHeight > element.clientHeight + 1;
  const hasHorizontal = state.hasHorizontal && element.scrollWidth > element.clientWidth + 1;

  if (state.vertical) {
    state.vertical.hidden = !hasVertical;
    if (hasVertical) {
      const trackHeight = Math.max(1, element.clientHeight - inset * 2);
      const maxScrollTop = Math.max(1, element.scrollHeight - element.clientHeight);
      const thumbHeight = clampNumber(
        Math.round((element.clientHeight / element.scrollHeight) * trackHeight),
        32,
        trackHeight,
      );
      const thumbTop = inset + Math.round((element.scrollTop / maxScrollTop) * Math.max(0, trackHeight - thumbHeight));
      state.vertical.style.height = `${thumbHeight}px`;
      state.vertical.style.top = `${element.scrollTop + thumbTop}px`;
    }
  }

  if (state.horizontal) {
    state.horizontal.hidden = !hasHorizontal;
    if (hasHorizontal) {
      const trackWidth = Math.max(1, element.clientWidth - inset * 2);
      const maxScrollLeft = Math.max(1, element.scrollWidth - element.clientWidth);
      const thumbWidth = clampNumber(
        Math.round((element.clientWidth / element.scrollWidth) * trackWidth),
        32,
        trackWidth,
      );
      const thumbLeft = inset + Math.round((element.scrollLeft / maxScrollLeft) * Math.max(0, trackWidth - thumbWidth));
      state.horizontal.style.width = `${thumbWidth}px`;
      state.horizontal.style.left = `${element.scrollLeft + thumbLeft}px`;
    }
  }

  if (!shouldShow || (!hasVertical && !hasHorizontal)) {
    return;
  }

  element.classList.add("is-scrolling");
  window.clearTimeout(state.hideTimer);
  state.hideTimer = window.setTimeout(() => {
    element.classList.remove("is-scrolling");
  }, TRANSIENT_SCROLLBAR_HIDE_MS);
}

function setupTransientScrollbar(element, options = {}) {
  if (!element) {
    return;
  }

  element.classList.add("transient-scroll-host");

  let state = transientScrollbars.get(element);
  if (!state) {
    state = {
      hasHorizontal: Boolean(options.horizontal),
      hideTimer: 0,
      horizontal: null,
      vertical: null,
    };
    transientScrollbars.set(element, state);
    element.addEventListener("scroll", () => updateTransientScrollbar(element, true), { passive: true });
  } else {
    state.hasHorizontal = state.hasHorizontal || Boolean(options.horizontal);
  }

  window.requestAnimationFrame(() => updateTransientScrollbar(element));
}

function hideScrollbarChrome(element) {
  if (!element) {
    return;
  }

  element.classList.add("transient-scroll-host");
  element.classList.remove("is-scrolling");
  element.querySelectorAll(".transient-scrollbar").forEach((scrollbar) => {
    scrollbar.remove();
  });
}

function refreshTransientScrollbars() {
  hideScrollbarChrome(dom.appShell);
  setupTransientScrollbar(dom.panelContent);
  document.querySelectorAll(".inventory-list-scroll").forEach((list) => {
    setupTransientScrollbar(list);
  });
  document.querySelectorAll(".hex-map-board").forEach((board) => {
    hideScrollbarChrome(board);
  });
}

function currentState() {
  return client.snapshot?.state || null;
}

function currentLocationCard() {
  const locationId = currentState()?.location;
  return client.snapshot?.visibleLocations.find((entry) => entry.id === locationId) || null;
}

function projectedWorldElapsedMs() {
  const state = currentState();
  if (!state) {
    return 0;
  }
  return state.worldElapsedMs || 0;
}

function clockLabelFromElapsed(worldElapsedMs) {
  const elapsedInDay = ((worldElapsedMs % REAL_DAY_MS) + REAL_DAY_MS) % REAL_DAY_MS;
  const totalMinutes = Math.floor((elapsedInDay / GAME_MINUTE_MS) + 1e-7);
  const shiftedMinutes = (totalMinutes + 6 * 60) % (24 * 60);
  const hours = String(Math.floor(shiftedMinutes / 60)).padStart(2, "0");
  const minutes = String(shiftedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function gameClockLabel() {
  return clockLabelFromElapsed(projectedWorldElapsedMs());
}

function survivalTimeSummary(snapshot) {
  const elapsedMs = Math.max(0, snapshot?.state?.worldElapsedMs || 0);
  const totalMinutes = Math.floor((elapsedMs / GAME_MINUTE_MS) + 1e-7);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) {
    parts.push(`${days}일`);
  }
  if (hours > 0) {
    parts.push(`${hours}시간`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}분`);
  }

  return {
    reached: `${snapshot?.day || snapshot?.state?.day || 1}일차 ${clockLabelFromElapsed(elapsedMs)}`,
    total: parts.join(" "),
  };
}

function formatMinutesLabel(totalMinutes) {
  const minutesValue = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutesValue / 60);
  const minutes = minutesValue % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}시간`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}분`);
  }
  return parts.join(" ");
}

function gameOverDetails(snapshot) {
  const reason = snapshot?.state?.gameOverReason || "더 이상 생존을 이어갈 수 없습니다.";
  const survival = survivalTimeSummary(snapshot);

  return { reason, survival };
}

function gameOverScreenElement() {
  if (dom.gameOverScreen) {
    return dom.gameOverScreen;
  }

  const screen = document.createElement("section");
  screen.id = "game-over-screen";
  screen.className = "game-over-screen";
  screen.setAttribute("aria-live", "assertive");
  screen.hidden = true;
  document.body.appendChild(screen);
  dom.gameOverScreen = screen;
  return screen;
}

function renderGameOverScreen() {
  const screen = gameOverScreenElement();
  const snapshot = client.snapshot;
  if (!snapshot?.state?.isGameOver) {
    screen.hidden = true;
    screen.classList.remove("is-visible");
    screen.innerHTML = "";
    return;
  }

  const { reason, survival } = gameOverDetails(snapshot);
  screen.innerHTML = `
    <div class="game-over-content">
      <p class="game-over-kicker">생존 종료</p>
      <h1>게임오버</h1>
      <p class="game-over-reason">${escapeHtml(reason)}</p>
      <div class="game-over-records" aria-label="생존 기록">
        <div>
          <span>도달 시각</span>
          <strong>${escapeHtml(survival.reached)}</strong>
        </div>
        <div>
          <span>버틴 시간</span>
          <strong>${escapeHtml(survival.total)}</strong>
        </div>
      </div>
      <button class="game-over-action" data-game-over-action="new-game" type="button">새 게임</button>
    </div>
  `;
  screen.hidden = false;
  window.requestAnimationFrame(() => screen.classList.add("is-visible"));
}

function riskLabel(risk) {
  const labels = {
    safe: "안전",
    low: "낮음",
    medium: "중간",
    high: "높음",
  };
  return labels[risk] || risk;
}

function formatDurationMinutes(value) {
  const totalMinutes = Math.max(0, Math.round(Number(value) || 0));
  if (totalMinutes <= 0) {
    return "";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}시간`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}분`);
  }
  return parts.join(" ");
}

function pairKey(left, right) {
  return [left, right].sort().join("::");
}

function hexLabelMarkup(name) {
  const words = String(name).split(/\s+/).filter(Boolean);
  const lines = words.length > 1 ? words : [String(name)];
  const startDy = lines.length > 1 ? -4 : 5;
  return lines.map((line, index) =>
    `<tspan x="0" dy="${index === 0 ? startDy : 17}">${escapeHtml(line)}</tspan>`
  ).join("");
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

function waitForMilliseconds(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, durationMs));
  });
}

function shelterStationForAction(action) {
  if (action?.type === "content_action") {
    if (["open_shelter_crafting", "open_shelter_crafting_repeat"].includes(action.actionId)) {
      return "crafting";
    }
    if (["open_shelter_cooking", "open_shelter_cooking_repeat"].includes(action.actionId)) {
      return "cooking";
    }
  }
  if (
    action?.type === "content_choice"
    && ["leave_shelter_crafting", "leave_shelter_cooking"].includes(action.choiceId)
  ) {
    return "rest";
  }
  return null;
}

function isCookingMenuSnapshot(snapshot) {
  return Boolean(snapshot?.availableActions?.some((choice) =>
    choice.id === "leave_shelter_cooking"
  ));
}

function isCraftingMenuSnapshot(snapshot) {
  return Boolean(snapshot?.availableActions?.some((choice) =>
    choice.id === "leave_shelter_crafting"
  ));
}

function shelterStationForSnapshot(snapshot) {
  if (isCookingMenuSnapshot(snapshot)) {
    return "cooking";
  }
  if (isCraftingMenuSnapshot(snapshot)) {
    return "crafting";
  }
  return "rest";
}

function isShelterSnapshot(snapshot) {
  return snapshot?.state?.location === "shelter";
}

function showShelterSceneVisual(station) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  sceneDirector.showShelterAtStation(station, { reduceMotion }).catch((error) => {
    console.warn(error);
    sceneDirector.hideShelter();
  });
}

function playShelterStationTransition(station) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return sceneDirector.moveShelterActor(station, {
    reduceMotion,
  }).catch((error) => {
    console.warn(error);
    sceneDirector.hideShelter();
  });
}

function syncShelterSceneVisual(snapshot) {
  if (shelterStationForAction(client.pendingAction)) {
    return;
  }
  if (isShelterSnapshot(snapshot)) {
    showShelterSceneVisual(shelterStationForSnapshot(snapshot));
    return;
  }
  sceneDirector.hideShelter();
}

function isMovementAction(action, loading = null) {
  if (!action) {
    return false;
  }
  if (action.type === "travel") {
    return true;
  }
  if (action.type === "subway_expedition") {
    return ["start", "descend", "return"].includes(action.command);
  }

  const actionId = action.actionId || action.choiceId || "";
  return actionId === "start_subway_expedition" ||
    loading?.transitionType === "region_travel";
}

function usesRegionTravelOverlay(action, loading = null) {
  return action?.type === "travel" ||
    loading?.transitionType === "region_travel";
}

function actionTransitionDurationMs(action, loading = null) {
  if (isMovementAction(action, loading)) {
    return ACTION_TRANSITION_MOVEMENT_MS;
  }
  if (action?.type === "use_item") {
    return ACTION_TRANSITION_ACTION_MS;
  }
  if (action?.type === "subway_expedition" && action.command === "search_loot") {
    return ACTION_TRANSITION_ACTION_MS;
  }
  if (!loading) {
    return 0;
  }
  return Number.isFinite(loading.durationMs)
    ? Math.max(0, loading.durationMs)
    : ACTION_TRANSITION_ACTION_MS;
}

function actionTransitionMessage(action, loading = null) {
  if (!action) {
    return "행동하는 중…";
  }

  if (action.type === "travel") {
    const destination = client.snapshot?.visibleLocations?.find(
      (location) => location.id === action.targetId,
    );
    return destination
      ? `${destination.name} 쪽으로 이동하는 중…`
      : "이동하는 중…";
  }
  if (action.type === "use_item") {
    return "아이템을 사용하는 중…";
  }
  if (action.type === "subway_expedition") {
    const messages = {
      start: "지하 1층으로 내려가는 중…",
      choose: "상황에 대응하는 중…",
      resolve_event: "상황에 대응하는 중…",
      encounter_choice: "선택 결과를 판정하고 다음 상황을 구성하는 중…",
      acknowledge_encounter: "상황 결과를 확인하는 중…",
      acknowledge_result: "결과를 정리하는 중…",
      descend: "다음 층으로 내려가는 중…",
      return: "대합실로 돌아가는 중…",
    };
    return messages[action.command] || "지하철역을 탐색하는 중…";
  }
  if (loading?.transitionType === "region_travel") {
    return "이동하는 중…";
  }

  const actionId = action.actionId || action.choiceId || "";
  if (/^(collect_|buy_|exchange_|deliver_)/.test(actionId)) {
    return "물건을 챙기는 중…";
  }
  if (/^(search_|survey_|inspect_|listen_|ask_|explore_)/.test(actionId)) {
    return "주변을 살피는 중…";
  }
  if (/^(craft_|assemble_|cook_)/.test(actionId)) {
    return "손을 움직이는 중…";
  }
  if (/^(rest_|sleep_)/.test(actionId)) {
    return "숨을 고르는 중…";
  }
  if (action.type === "content_choice") {
    return "선택의 결과가 이어지는 중…";
  }
  return "행동하는 중…";
}

function pendingActionControls() {
  return Array.from(document.querySelectorAll([
    ".choice-button",
    ".crafting-choice-select",
    ".crafting-choice-submit",
    "[data-map-travel]",
    "[data-use-item]",
    "[data-hex-location]",
    ".dock-button",
  ].join(",")));
}

function beginActionTransition(action, triggerElement, durationMs, loading = null) {
  const control = triggerElement instanceof Element
    ? triggerElement.closest("button, [role='button']")
    : null;
  const anchor = control instanceof HTMLElement
    ? control.closest(
        ".crafting-choice-card, .inventory-detail-slot, .inventory-card, .map-destination-detail, .choice-button",
      ) || control
    : null;
  const craftingNameTarget = control instanceof HTMLElement
    && control.matches(".crafting-choice-submit")
    && anchor instanceof HTMLElement
    ? anchor.querySelector(".crafting-choice-select")
    : null;
  const visualTarget = action?.type === "use_item"
    && anchor instanceof HTMLElement
    && anchor.matches(".inventory-detail-slot, .inventory-card")
    ? anchor
    : craftingNameTarget instanceof HTMLElement
      ? craftingNameTarget
      : control;
  const isMovement = isMovementAction(action, loading);
  const usesOverlay = usesRegionTravelOverlay(action, loading);
  const message = usesOverlay
    ? actionTransitionMessage(action, loading)
    : "";
  const usesInlineSurfaceFill = visualTarget instanceof HTMLElement
    && visualTarget.matches(".choice-button, .inventory-card, .inventory-detail-slot");
  const status = message ? document.createElement("p") : null;
  if (status) {
    status.className = "action-transition-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = message;
  }

  client.pendingActionElement = visualTarget;
  client.pendingActionStatusElement = status;
  client.actionTransitionStartedAt = Date.now();
  client.actionTransitionDurationMs = durationMs;
  client.actionTransitionMessage = message;

  client.pendingActionDisabledControls = pendingActionControls().map((element) => ({
    element,
    disabled: "disabled" in element ? Boolean(element.disabled) : null,
    ariaDisabled: element.getAttribute("aria-disabled"),
  }));
  client.pendingActionDisabledControls.forEach(({ element }) => {
    if ("disabled" in element) {
      element.disabled = true;
    }
    element.setAttribute("aria-disabled", "true");
  });

  if (message) {
    const sceneTransition = document.createElement("div");
    sceneTransition.className = "scene-action-transition";
    sceneTransition.classList.toggle("is-movement", isMovement);
    sceneTransition.setAttribute("role", "status");
    sceneTransition.setAttribute("aria-live", "polite");

    const card = document.createElement("div");
    card.className = "scene-action-transition-card";

    const kicker = document.createElement("span");
    kicker.className = "scene-action-transition-kicker";
    kicker.textContent = isMovement ? "이동" : "행동";
    card.appendChild(kicker);
    card.appendChild(status);

    const progressTrack = document.createElement("span");
    progressTrack.className = "action-transition-progress";
    progressTrack.setAttribute("aria-hidden", "true");
    const progressFill = document.createElement("span");
    progressFill.className = "action-transition-progress-fill";
    progressFill.style.animationDuration = `${durationMs}ms`;
    progressTrack.appendChild(progressFill);
    card.appendChild(progressTrack);
    sceneTransition.appendChild(card);
    document.body.appendChild(sceneTransition);

    dom.sceneFrame.classList.add("is-action-in-progress");
    dom.sceneFrame.setAttribute("aria-busy", "true");
    client.pendingActionSceneElement = sceneTransition;
    client.pendingActionStatusElement = status;
    client.pendingActionProgressElement = progressTrack;
  } else if (visualTarget instanceof HTMLElement) {
    const progressTrack = document.createElement("span");
    progressTrack.className = "action-transition-progress";
    progressTrack.classList.toggle("is-choice-surface-fill", usesInlineSurfaceFill);
    progressTrack.setAttribute("aria-hidden", "true");
    const progressFill = document.createElement("span");
    progressFill.className = "action-transition-progress-fill";
    progressFill.style.animationDuration = `${durationMs}ms`;
    progressTrack.appendChild(progressFill);
    visualTarget.appendChild(progressTrack);
    visualTarget.classList.add("is-action-pending");
    visualTarget.classList.toggle("is-choice-surface-pending", usesInlineSurfaceFill);
    client.pendingActionProgressElement = progressTrack;
  }
}

function finishActionTransition() {
  client.pendingActionStatusElement?.remove();
  client.pendingActionProgressElement?.remove();
  client.pendingActionSceneElement?.remove();
  client.pendingActionElement?.classList.remove("is-action-pending");
  client.pendingActionElement?.classList.remove("is-choice-surface-pending");
  dom.sceneFrame.classList.remove("is-action-in-progress");
  dom.sceneFrame.removeAttribute("aria-busy");
  client.pendingActionDisabledControls.forEach(({ element, disabled, ariaDisabled }) => {
    if (!element.isConnected) {
      return;
    }
    if (disabled !== null && "disabled" in element) {
      element.disabled = disabled;
    }
    if (ariaDisabled === null) {
      element.removeAttribute("aria-disabled");
    } else {
      element.setAttribute("aria-disabled", ariaDisabled);
    }
  });

  client.pendingActionElement = null;
  client.pendingActionSceneElement = null;
  client.pendingActionStatusElement = null;
  client.pendingActionProgressElement = null;
  client.pendingActionDisabledControls = [];
  client.actionTransitionMessage = "";
  client.actionTransitionStartedAt = 0;
  client.actionTransitionDurationMs = 0;
}

function snapshotLocationCard(snapshot) {
  const locationId = snapshot?.state?.location;
  return snapshot?.visibleLocations?.find((entry) => entry.id === locationId) || null;
}

function preloadImage(source) {
  if (!source) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
    image.src = source;
    if (image.complete) {
      resolve();
    }
  });
}

async function preloadNextSceneAssets(snapshot) {
  const location = snapshotLocationCard(snapshot);
  const imageSources = new Set([
    location?.imagePath,
    snapshot?.currentScene?.imagePath,
  ].filter(Boolean));
  if (imageSources.size === 0) {
    return;
  }

  await Promise.race([
    Promise.all(Array.from(imageSources, preloadImage)),
    waitForMilliseconds(ACTION_ASSET_PRELOAD_TIMEOUT_MS),
  ]);
}

function clearLegacyGameIds() {
  LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

function emptySaveInfo(gameId = "") {
  return {
    exists: false,
    gameId,
    savedAt: null,
    label: "저장된 게임 없음",
    day: null,
    timeLabel: null,
  };
}

function savedGameId() {
  return window.localStorage.getItem(SAVED_GAME_ID_KEY) || "";
}

function isLoggedIn() {
  return Boolean(client.authInfo?.user);
}

function activeHomeSaveInfo() {
  if (isLoggedIn()) {
    return client.authInfo?.saveInfo || emptySaveInfo();
  }
  return client.saveInfo || emptySaveInfo(savedGameId());
}

function activeSavedGameId() {
  const info = activeHomeSaveInfo();
  return info.exists ? info.gameId : "";
}

function currentSaveStatusLabel() {
  if (!client.gameId || client.hasUnsavedProgress) {
    return "저장 전";
  }
  const info = isLoggedIn() ? (client.authInfo?.saveInfo || client.saveInfo) : client.saveInfo;
  if (info?.exists && info.gameId === client.gameId) {
    return info.label || "저장됨";
  }
  return "저장 전";
}

function stopBackgroundSync() {
  if (client.syncTimer) {
    window.clearInterval(client.syncTimer);
    client.syncTimer = null;
  }
}

function startBackgroundSync() {
  if (client.syncTimer) {
    return;
  }
  client.syncTimer = window.setInterval(backgroundSync, 10000);
}

function showGameScreen() {
  client.isHomeVisible = false;
  dom.homeScreen.hidden = true;
  dom.appShell.hidden = false;
  document.body.classList.remove("home-active");
  startBackgroundSync();
}

async function requestGameFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    return true;
  }

  const root = document.documentElement;
  try {
    if (typeof root.requestFullscreen === "function") {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
      } catch (error) {
        if (!(error instanceof TypeError)) {
          throw error;
        }
        await root.requestFullscreen();
      }
      return true;
    }

    if (typeof root.webkitRequestFullscreen === "function") {
      await root.webkitRequestFullscreen();
      return true;
    }
  } catch (error) {
    console.info("전체화면을 열 수 없어 일반 화면으로 게임을 시작합니다.", error);
  }
  return false;
}

function renderHomeScreen() {
  const info = activeHomeSaveInfo();
  dom.homeSaveStatus.textContent = info.exists ? info.label : "저장된 게임 없음";
  dom.homeContinue.disabled = !info.exists;
  dom.homeContinue.setAttribute("aria-disabled", info.exists ? "false" : "true");
  dom.homeFullscreenPlay.setAttribute(
    "aria-label",
    info.exists ? "저장 게임을 전체화면으로 이어하기" : "새 게임을 전체화면으로 시작하기",
  );

  const user = client.authInfo?.user;
  const kakaoConfigured = Boolean(client.authInfo?.kakaoConfigured);
  if (user) {
    dom.homeAuthStatus.textContent = `${user.nickname || "카카오 사용자"} 계정으로 로그인 중`;
    dom.homeKakaoLogin.hidden = true;
    dom.homeKakaoLogin.setAttribute("aria-disabled", "true");
    dom.homeLogout.hidden = false;
  } else {
    dom.homeAuthStatus.textContent = kakaoConfigured
      ? "로그인하면 다른 기기에서도 저장을 이어갈 수 있습니다."
      : "카카오 로그인을 쓰려면 서버에 KAKAO_REST_API_KEY를 설정해야 합니다.";
    dom.homeKakaoLogin.hidden = false;
    dom.homeKakaoLogin.setAttribute("aria-disabled", kakaoConfigured ? "false" : "true");
    dom.homeLogout.hidden = true;
  }
}

async function refreshAuthInfo() {
  try {
    client.authInfo = await api("/api/auth/me");
  } catch (_error) {
    client.authInfo = {
      kakaoConfigured: false,
      user: null,
      saveInfo: null,
    };
  }
  renderHomeScreen();
  return client.authInfo;
}

async function refreshHomeSaveInfo() {
  if (isLoggedIn()) {
    client.saveInfo = client.authInfo?.saveInfo || emptySaveInfo();
    renderHomeScreen();
    return client.saveInfo;
  }

  const gameId = savedGameId();
  if (!gameId) {
    client.saveInfo = emptySaveInfo();
    renderHomeScreen();
    return client.saveInfo;
  }

  try {
    const info = await api(`/api/games/${gameId}/save`);
    if (!info.exists) {
      window.localStorage.removeItem(SAVED_GAME_ID_KEY);
      client.saveInfo = emptySaveInfo();
    } else {
      client.saveInfo = info;
    }
  } catch (_error) {
    window.localStorage.removeItem(SAVED_GAME_ID_KEY);
    client.saveInfo = emptySaveInfo();
  }
  renderHomeScreen();
  return client.saveInfo;
}

async function showHomeScreen() {
  stopBackgroundSync();
  clearSceneAnimation();
  resetTimeAdvancePresentation();
  client.isHomeVisible = true;
  client.gameId = "";
  client.snapshot = null;
  client.actionInFlight = false;
  client.menuStatusMessage = "";
  dom.appShell.hidden = true;
  dom.homeScreen.hidden = false;
  document.body.classList.add("home-active");
  await refreshAuthInfo();
  await refreshHomeSaveInfo();
}

async function createNewGame() {
  const snapshot = await api("/api/games", {
    method: "POST",
    body: {},
  });
  resetTimeAdvancePresentation();
  client.gameId = snapshot.gameId;
  client.snapshot = snapshot;
  client.lastFetchedAt = Date.now();
  client.activePanel = "map";
  client.isPanelOpen = false;
  client.mapHint = "";
  client.activeInventoryDetailKey = null;
  client.inventoryScrollTop = 0;
  client.activeCraftingRecipeDetailId = null;
  client.isCompletedQuestGroupOpen = false;
  client.justCreatedGame = true;
  client.hasUnsavedProgress = true;
  client.menuStatusMessage = "저장 전";
  client.renderedStorySurfaceId = "";
  hideSystemNote();
  renderGameOverScreen();
  clearLegacyGameIds();
  showGameScreen();
}

async function restartGameFromOverlay() {
  if (client.actionInFlight) {
    return;
  }
  client.actionInFlight = true;
  clearSceneAnimation();
  try {
    await createNewGame();
    client.actionInFlight = false;
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
  } finally {
    client.actionInFlight = false;
  }
}

function needsFreshGame(snapshot) {
  // saveVersion은 서버 저장 데이터의 스키마 버전입니다. 서버가 이전 저장을
  // 정규화하므로 브라우저가 버전 차이만으로 새 게임을 만들면 안 됩니다.
  // 특히 순차 배포 중 구 클라이언트와 새 서버가 잠시 섞일 때 무한 재시작이 됩니다.
  return !snapshot || !snapshot.state;
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

async function continueSavedGame() {
  const gameId = activeSavedGameId();
  if (!gameId || client.actionInFlight) {
    return;
  }

  client.actionInFlight = true;
  try {
    const snapshot = await api(isLoggedIn() ? "/api/auth/save/restore" : `/api/games/${gameId}/restore`, {
      method: "POST",
      body: {},
    });
    resetTimeAdvancePresentation();
    client.gameId = snapshot.gameId;
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
    client.activePanel = "map";
    client.isPanelOpen = false;
    client.mapHint = "";
    client.activeInventoryDetailKey = null;
    client.inventoryScrollTop = 0;
    client.activeCraftingRecipeDetailId = null;
    client.isCompletedQuestGroupOpen = false;
    client.justCreatedGame = false;
    client.hasUnsavedProgress = false;
    client.menuStatusMessage = "";
    client.renderedStorySurfaceId = "";
    if (isLoggedIn()) {
      await refreshAuthInfo();
      client.saveInfo = client.authInfo?.saveInfo || emptySaveInfo();
    } else {
      client.saveInfo = await api(`/api/games/${client.gameId}/save`);
    }
    showGameScreen();
    render({
      animateScene: shouldAnimateScene({
        source: "bootstrap",
        previousSnapshot: null,
        nextSnapshot: client.snapshot,
      }),
    });
  } catch (error) {
    if (!isLoggedIn()) {
      window.localStorage.removeItem(SAVED_GAME_ID_KEY);
    }
    await refreshHomeSaveInfo();
    window.alert(error instanceof Error ? error.message : "이어하기를 시작하지 못했습니다.");
  } finally {
    client.actionInFlight = false;
  }
}

async function saveCurrentGameFromMenu() {
  if (!client.gameId || client.actionInFlight) {
    return;
  }

  const previousSavedGameId = activeSavedGameId();
  if (previousSavedGameId && previousSavedGameId !== client.gameId) {
    const confirmed = window.confirm("기존 저장을 현재 게임으로 덮어쓸까요?");
    if (!confirmed) {
      return;
    }
  }

  client.actionInFlight = true;
  try {
    const info = await api(`/api/games/${client.gameId}/save`, {
      method: "POST",
      body: {},
    });
    if (isLoggedIn()) {
      await refreshAuthInfo();
      client.saveInfo = client.authInfo?.saveInfo || info;
    } else {
      window.localStorage.setItem(SAVED_GAME_ID_KEY, client.gameId);
      client.saveInfo = info;
    }
    client.hasUnsavedProgress = false;
    client.menuStatusMessage = "저장했습니다.";
    renderPanel();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "저장하지 못했습니다.");
  } finally {
    client.actionInFlight = false;
  }
}

async function testGeminiConnectionFromMenu() {
  if (client.geminiTestInFlight) {
    return;
  }

  client.geminiTestInFlight = true;
  client.geminiTestStatus = {
    type: "pending",
    message: "Gemini API 연결을 확인하고 있습니다.",
  };
  renderPanel();

  try {
    const result = await api("/api/gemini/test", {
      method: "POST",
      body: {},
    });
    client.geminiTestStatus = {
      type: result.supportsGenerateContent ? "success" : "warning",
      message: result.supportsGenerateContent
        ? result.message
        : `${result.message} · generateContent 미지원`,
    };
  } catch (error) {
    client.geminiTestStatus = {
      type: "error",
      message: error instanceof Error
        ? error.message
        : "Gemini API 연결을 확인하지 못했습니다.",
    };
  } finally {
    client.geminiTestInFlight = false;
    renderPanel();
  }
}

function currentSceneId(snapshot = client.snapshot) {
  return snapshot?.currentScene?.id || "";
}

function isDeveloperMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("dev") === "0") {
    return false;
  }
  if (params.get("dev") === "1") {
    return true;
  }
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function renderSceneDevSource(snapshot) {
  if (!dom.sceneDevSource) {
    return;
  }
  const source = snapshot?.currentScene?.devSource;
  if (!isDeveloperMode() || !source) {
    dom.sceneDevSource.hidden = true;
    dom.sceneDevSource.textContent = "";
    return;
  }

  dom.sceneDevSource.hidden = false;
  dom.sceneDevSource.textContent = `DEV scene: ${source.path} · ${source.id}`;
}

function systemNoteKey(snapshot, note) {
  if (!snapshot || !note) {
    return "";
  }
  const state = snapshot.state || {};
  return [
    snapshot.gameId || client.gameId || "",
    state.location || "",
    state.sceneId || "",
    state.worldElapsedMs ?? "",
    note,
  ].join("::");
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

function storyAnimationSurfaceId(snapshot) {
  if (!snapshot) {
    return "";
  }
  if (isEventStoryActive(snapshot)) {
    return `event:${snapshot.latestEvent.id}`;
  }
  if (snapshot.state?.npcDialogue?.active) {
    return `dialogue:${currentSceneId(snapshot)}`;
  }
  const expedition = snapshot.state?.subwayExpedition;
  if (expedition?.active && expedition.currentFloor) {
    return `subway:${currentSceneId(snapshot)}`;
  }
  return `scene:${currentSceneDefinitionId(snapshot)}`;
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
    paragraphs: (snapshot.currentScene.paragraphs || []).filter((paragraph) => String(paragraph).trim()),
  };
}

function normalizePostChoiceNarrative(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((paragraph) => String(paragraph).trim())
    .filter(Boolean)
    .slice(0, 2);
}

function beginPostChoiceNarrative(paragraphs, append = false) {
  clearSceneAnimation();
  const story = { headline: "", paragraphs };
  const token = client.sceneRenderToken;
  return animateStoryText(story, token, null, {
    append,
    scrollToStart: append,
    revealChoices: false,
  });
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

  if (source === "newGame") {
    return true;
  }

  if (previousSnapshot && storyAnimationSurfaceId(previousSnapshot) !== storyAnimationSurfaceId(nextSnapshot)) {
    return true;
  }

  const introFlag = currentSceneIntroFlag(nextSnapshot);
  if (!introFlag) {
    return false;
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

function shouldContinueLocationStory(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot?.currentScene || !nextSnapshot?.currentScene
    || !previousSnapshot.gameId || previousSnapshot.gameId !== nextSnapshot.gameId
    || !previousSnapshot.state?.location
    || previousSnapshot.state.location !== nextSnapshot.state?.location
    || previousSnapshot.state.subwayExpedition?.active
    || nextSnapshot.state.subwayExpedition?.active) {
    return false;
  }
  return storySurfaceId(previousSnapshot) !== storySurfaceId(nextSnapshot)
    || JSON.stringify(buildStoryDisplay(previousSnapshot)) !== JSON.stringify(buildStoryDisplay(nextSnapshot));
}

function availableActionsSignature(snapshot) {
  const list = snapshot?.availableActions ?? [];
  // id만 보면 라벨·힌트만 바뀐 서버 응답에서 actionsChanged가 false가 되어 선택지 DOM이 갱신되지 않는다.
  return list
    .map((choice) => `${choice.id}:${choice.label}:${choice.outcomeHint ?? ""}:${choice.showOutcomeHint ? "1" : "0"}:${choice.isAvailable ? "1" : "0"}:${choice.statusLabel ?? ""}:${choice.remainingUses ?? ""}:${JSON.stringify(choice.loading || null)}:${JSON.stringify(choice.craftingRecipe || null)}:${JSON.stringify(choice.postChoiceNarrative || null)}`)
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
    client.activeSceneTimerResolve = resolve;
    client.activeSceneTimer = window.setTimeout(() => {
      client.activeSceneTimer = null;
      client.activeSceneTimerResolve = null;
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
  if (client.activeSceneTimerResolve) {
    const resolveActiveStep = client.activeSceneTimerResolve;
    client.activeSceneTimerResolve = null;
    resolveActiveStep();
  }
  client.activeAnimatedStory = null;
  client.activeAnimatedSystemNote = null;
  client.activeStoryAnimationOptions = null;
  client.isSceneTyping = false;
  dom.sceneFrame.classList.remove("is-story-typing");
}

function resetSceneScrollOnMobile() {
  if (!window.matchMedia("(max-width: 620px)").matches) {
    return;
  }
  window.requestAnimationFrame(() => {
    dom.appShell.scrollTop = 0;
  });
}

function syncMobileChoiceZoneHeight() {
  if (!window.matchMedia("(max-width: 620px)").matches || !dom.choices.childElementCount) {
    document.documentElement.style.removeProperty("--mobile-choice-zone-height");
    return;
  }

  window.requestAnimationFrame(() => {
    const choiceZoneHeight = Math.ceil(dom.choices.getBoundingClientRect().height);
    document.documentElement.style.setProperty(
      "--mobile-choice-zone-height",
      `${choiceZoneHeight}px`,
    );
  });
}

function createSceneStoryBlock(append) {
  const hasHistory = append && dom.sceneText.childElementCount > 0;
  if (!append) {
    dom.sceneText.replaceChildren();
    client.renderedSystemNoteKey = "";
  }
  dom.sceneText.classList.toggle("has-story-history", hasHistory);
  const block = document.createElement("div");
  block.className = "scene-story-block";
  const prose = document.createElement("div");
  prose.className = "scene-prose";
  block.appendChild(prose);
  createSceneSystemNote(block);
  dom.sceneText.appendChild(block);
  return block;
}

function createSceneSystemNote(block) {
  // Completed notes stay with their prose; only the newest note announces updates.
  dom.systemNote.removeAttribute("id");
  dom.systemNote.removeAttribute("role");
  dom.systemNote.classList.remove("is-entering");
  const note = document.createElement("div");
  note.id = "system-note";
  note.className = "system-note";
  note.setAttribute("role", "status");
  note.hidden = true;
  block.appendChild(note);
  dom.systemNote = note;
  client.renderedSystemNote = "";
  return note;
}

function scrollSceneStoryToStart(block) {
  window.requestAnimationFrame(() => {
    if (!block.isConnected || dom.sceneText.lastElementChild !== block) {
      return;
    }
    const isMobile = window.matchMedia("(max-width: 620px)").matches;
    const viewportTop = isMobile ? dom.appShell.getBoundingClientRect().top : 0;
    const scrollTop = isMobile ? dom.appShell.scrollTop : window.scrollY;
    const top = Math.max(0, scrollTop + block.getBoundingClientRect().top - viewportTop - 12);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    (isMobile ? dom.appShell : window).scrollTo({ top, behavior });
  });
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

async function animateStoryText(
  story,
  token,
  systemNotePayload = null,
  options = {},
) {
  const append = options.append === true;
  const revealChoices = options.revealChoices !== false;
  const block = createSceneStoryBlock(append);
  const prose = block.querySelector(".scene-prose");
  client.activeAnimatedStory = story;
  client.activeAnimatedSystemNote = systemNotePayload;
  client.activeStoryAnimationOptions = { append, revealChoices, block, scrollToStart: options.scrollToStart === true };
  client.isSceneTyping = true;
  dom.sceneFrame.classList.add("is-story-typing");
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");
  if (options.scrollToStart) {
    scrollSceneStoryToStart(block);
  }

  if (story.headline) {
    if (token !== client.sceneRenderToken) {
      return;
    }
    const headlineElement = document.createElement("p");
    headlineElement.className = "scene-headline";
    prose.appendChild(headlineElement);
    const headlineDone = await typeParagraph(headlineElement, story.headline, token);
    if (!headlineDone) {
      return;
    }
    await scheduleSceneStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  for (const paragraph of story.paragraphs) {
    if (token !== client.sceneRenderToken) {
      return;
    }
    const paragraphElement = document.createElement("p");
    prose.appendChild(paragraphElement);
    const completed = await typeParagraph(paragraphElement, paragraph, token);
    if (!completed) {
      return;
    }
    await scheduleSceneStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  if (token === client.sceneRenderToken) {
    client.isSceneTyping = false;
    dom.sceneFrame.classList.remove("is-story-typing");
    client.activeAnimatedStory = null;
    client.activeAnimatedSystemNote = null;
    client.activeStoryAnimationOptions = null;
    if (systemNotePayload?.note) {
      renderSystemNote(
        systemNotePayload.note,
        systemNotePayload.key,
        systemNotePayload.entries,
      );
    }
    if (revealChoices) {
      renderChoices();
    }
  }
}

function skipSceneTyping() {
  const story = client.activeAnimatedStory;
  const systemNotePayload = client.activeAnimatedSystemNote;
  const animationOptions = client.activeStoryAnimationOptions || {};
  if (!client.isSceneTyping || !story) {
    return false;
  }
  clearSceneAnimation();
  const headlineBlock = story.headline
    ? `<p class="scene-headline">${escapeHtml(story.headline)}</p>`
    : "";
  const storyHtml =
    headlineBlock + story.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  // Replace only the typing block so history stays intact and partial text is not duplicated.
  animationOptions.block.querySelector(".scene-prose").innerHTML = storyHtml;
  if (animationOptions.scrollToStart) {
    scrollSceneStoryToStart(animationOptions.block);
  }
  if (systemNotePayload?.note) {
    renderSystemNote(
      systemNotePayload.note,
      systemNotePayload.key,
      systemNotePayload.entries,
    );
  }
  if (animationOptions.revealChoices !== false) {
    renderChoices();
    dom.choices.classList.remove("revealed");
    void dom.choices.offsetWidth;
    dom.choices.classList.add("revealed");
  }
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

function itemEffectHintHtml(effects = {}, useMinutes = 0) {
  const mindLabel = isMagicWorldState() ? "MP" : "정신력";
  const effectParts = [
    { key: "hp", label: "체력", className: "item-hp-hint" },
    { key: "mind", label: mindLabel, className: "item-mind-hint" },
    { key: "energy", label: "기력", className: "item-energy-hint" },
  ].flatMap(({ key, label, className }) => {
    const value = effects[key] ?? 0;
    if (value === 0) {
      return [];
    }
    const signedValue = value > 0 ? `+${value}` : String(value);
    return [`<span class="${className}">${signedValue} ${label}</span>`];
  });
  for (const [key, label] of [["injuryRelief", "부상"], ["infectionRelief", "감염"]]) {
    if (effects[key] > 0) effectParts.push(`<span class="item-hp-hint">${label} -${effects[key]}단계</span>`);
  }
  if (effects.infectionRelief > 0) effectParts.push('<span class="item-time-hint">다음 감염 악화까지 6시간</span>');
  if (useMinutes && useMinutes > 0) {
    effectParts.push(`<span class="item-time-hint">+ ${formatMinutesLabel(useMinutes)}</span>`);
  }

  return effectParts.length
    ? `<span class="item-effect-list">${effectParts.join(" ")}</span>`
    : "";
}

function itemDurabilityHintHtml(item, state) {
  if (item.kind !== "tool" || !item.maxDurability) {
    return "";
  }

  const current = state.toolDurability?.[item.id] ?? item.maxDurability;
  return `<span class="item-effect-list"><span class="item-durability-hint">내구도 ${current}/${item.maxDurability}</span></span>`;
}

function craftingRecipeMetaHtml(recipe, { showEffect = true } = {}) {
  if (!recipe) {
    return "";
  }

  const prerequisites = recipe.prerequisites || [];
  const requirements = recipe.requirements || [];
  const prerequisiteHtml = prerequisites.length
    ? `
      <span class="crafting-recipe-row is-prerequisite">
        <span class="crafting-recipe-label">조건</span>
        <span class="crafting-recipe-token-list">
          ${prerequisites.map((entry) => `
            <span class="crafting-recipe-token ${entry.met ? "is-met" : "is-missing"}">
              ${escapeHtml(entry.label)} ${entry.met ? "충족" : "필요"}
            </span>
          `).join("")}
        </span>
      </span>
    `
    : "";
  const requirementsHtml = requirements.length
    ? `
      <span class="crafting-recipe-row is-requirements">
        <span class="crafting-recipe-label">필요 재료</span>
        <span class="crafting-recipe-token-list">
          ${requirements.map((entry) => `
            <span class="crafting-recipe-token ${entry.met ? "is-met" : "is-missing"}">
              ${escapeHtml(entry.name)} (${entry.ownedAmount}/${entry.requiredAmount})
            </span>
          `).join("")}
        </span>
      </span>
    `
    : "";
  const effectHtml = showEffect
    ? `
      <span class="crafting-recipe-row is-effect">
        <span class="crafting-recipe-label">효과</span>
        <span class="crafting-recipe-effect">${escapeHtml(recipe.effect)}</span>
      </span>
    `
    : "";

  return `
    <span class="crafting-recipe-detail">
      ${effectHtml}
      ${prerequisiteHtml}
      ${requirementsHtml}
    </span>
  `;
}

function renderCraftingChoices(snapshot, { isCookingMenu = false } = {}) {
  const recipeChoices = snapshot.availableActions.filter((choice) =>
    !["leave_shelter_crafting", "leave_shelter_cooking"].includes(choice.id) && choice.craftingRecipe
  );
  const otherChoices = snapshot.availableActions.filter((choice) =>
    ["leave_shelter_crafting", "leave_shelter_cooking"].includes(choice.id) || !choice.craftingRecipe
  );
  const selectedChoice = recipeChoices.find((choice) => choice.id === client.activeCraftingRecipeDetailId) || recipeChoices[0] || null;
  client.activeCraftingRecipeDetailId = selectedChoice?.id || null;

  if (selectedChoice?.craftingRecipe) {
    const detail = document.createElement("section");
    detail.className = `crafting-recipe-panel${isCookingMenu ? " is-cooking-menu" : ""}`;
    detail.setAttribute("aria-live", "polite");
    const detailHeadMeta = isCookingMenu
      ? `<span class="crafting-recipe-effect">${escapeHtml(selectedChoice.craftingRecipe.effect)}</span>`
      : `
        <span class="crafting-recipe-state ${selectedChoice.isAvailable ? "is-met" : "is-missing"}">
          ${selectedChoice.isAvailable ? "제작 가능" : "재료 부족"}
        </span>
      `;
    detail.innerHTML = `
      <div class="crafting-recipe-panel-head">
        <strong>${escapeHtml(selectedChoice.label)}</strong>
        ${detailHeadMeta}
      </div>
      ${craftingRecipeMetaHtml(selectedChoice.craftingRecipe, { showEffect: !isCookingMenu })}
    `;
    dom.choices.appendChild(detail);
  }

  const createCraftButton = (choice, { menuFooter = false } = {}) => {
    const craftButton = document.createElement("button");
    craftButton.className = [
      "inline-action",
      "crafting-choice-submit",
      menuFooter ? "is-recipe-menu-submit" : "",
    ].filter(Boolean).join(" ");
    craftButton.type = "button";
    craftButton.textContent = menuFooter
      ? isCookingMenu ? "요리하기" : "제작하기"
      : choice.craftingRecipe.actionLabel || "제작";
    craftButton.disabled = client.actionInFlight;
    craftButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitAction(
        choice.action,
        craftButton,
        choice.loading,
        choice.postChoiceNarrative,
      );
    });
    return craftButton;
  };

  const recipeGrid = document.createElement("div");
  recipeGrid.className = "crafting-recipe-grid";

  recipeChoices.forEach((choice) => {
    const card = document.createElement("article");
    card.className = [
      "crafting-choice-card",
      choice.isAvailable ? "is-recipe-available" : "is-recipe-unavailable",
      choice.id === client.activeCraftingRecipeDetailId ? "is-active" : "",
    ].filter(Boolean).join(" ");

    const selectButton = document.createElement("button");
    selectButton.className = "crafting-choice-select";
    selectButton.type = "button";
    selectButton.setAttribute("aria-pressed", choice.id === client.activeCraftingRecipeDetailId ? "true" : "false");
    selectButton.innerHTML = `<span class="crafting-recipe-name">${escapeHtml(choice.label)}</span>`;
    selectButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      client.activeCraftingRecipeDetailId = choice.id;
      renderChoices();
    });

    card.appendChild(selectButton);
    recipeGrid.appendChild(card);
  });

  dom.choices.appendChild(recipeGrid);

  let recipeMenuExitButton = null;

  otherChoices.forEach((choice) => {
    const fragment = dom.choiceTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    const label = fragment.querySelector(".choice-label");
    const status = fragment.querySelector(".choice-status");
    const remaining = fragment.querySelector(".choice-remaining");
    const meta = fragment.querySelector(".choice-meta");
    const isRecipeMenuExit = [
      "leave_shelter_crafting",
      "leave_shelter_cooking",
    ].includes(choice.id);
    if (isRecipeMenuExit) {
      button.classList.add("is-recipe-menu-exit");
    }
    label.textContent = choice.label;
    status.textContent = choice.statusLabel || "";
    status.hidden = !choice.statusLabel;
    const hasRemainingUses = Number.isInteger(choice.remainingUses);
    remaining.textContent = hasRemainingUses ? `남은 횟수: ${choice.remainingUses}회` : "";
    remaining.hidden = !hasRemainingUses;
    const outcomeHint = choice.outcomeHint || "";
    const shouldShowOutcomeHint = Boolean(choice.showOutcomeHint && outcomeHint);
    meta.textContent = shouldShowOutcomeHint ? outcomeHint : "";
    meta.hidden = !shouldShowOutcomeHint;
    button.disabled = client.actionInFlight || choice.isAvailable === false;
    button.addEventListener("click", () => submitAction(
      choice.action,
      button,
      choice.loading,
      choice.postChoiceNarrative,
    ));
    if (isRecipeMenuExit) {
      recipeMenuExitButton = button;
    } else {
      dom.choices.appendChild(fragment);
    }
  });

  if (recipeMenuExitButton) {
    const footer = document.createElement("div");
    footer.className = "recipe-menu-footer";
    footer.appendChild(recipeMenuExitButton);
    if (selectedChoice) {
      footer.appendChild(createCraftButton(selectedChoice, { menuFooter: true }));
    }
    dom.choices.appendChild(footer);
  }
}

function hideSystemNote() {
  dom.systemNote.hidden = true;
  dom.systemNote.innerHTML = "";
  dom.systemNote.classList.remove("is-entering");
  client.renderedSystemNote = "";
  client.renderedSystemNoteKey = "";
}

function isElapsedTimeSystemNoteToken(value) {
  return /^\+\s*(?:(?:\d+시간)(?:\s+\d+분)?|\d+분)$/.test(value);
}

function structuredSystemNoteToken(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (entry.type === "text" && typeof entry.text === "string") {
    const toneClass = entry.tone === "positive"
      ? " is-positive"
      : entry.tone === "negative"
        ? " is-negative"
        : "";
    return { text: entry.text, className: toneClass };
  }
  if (
    entry.type === "damage" &&
    typeof entry.target === "string" &&
    Number.isFinite(entry.amount)
  ) {
    return {
      text: `${entry.target}: ${entry.amount}피해`,
      className: " is-damage",
    };
  }
  if (entry.type === "time" && Number.isFinite(entry.minutes)) {
    const hours = Math.floor(entry.minutes / 60);
    const minutes = entry.minutes % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}시간`);
    if (minutes > 0) parts.push(`${minutes}분`);
    return { text: `+${parts.join(" ")}`, className: "" };
  }
  if (
    entry.type === "delta" &&
    typeof entry.label === "string" &&
    Number.isFinite(entry.amount)
  ) {
    const sign = entry.amount > 0 ? "+" : "-";
    const amount = Math.abs(entry.amount);
    const text = entry.subject === "money"
      ? `${sign}${amount.toLocaleString("ko-KR")}${entry.label}`
      : entry.subject === "durability"
        ? `${entry.label} 내구도 ${sign}${amount}`
        : `${sign}${amount} ${entry.label}`;
    return {
      text,
      className: entry.amount > 0 ? " is-positive" : " is-negative",
    };
  }
  return null;
}

function renderSystemNote(note, noteKey = "", entries = []) {
  if (!note || (noteKey && noteKey === client.renderedSystemNoteKey)) {
    return;
  }

  // Another result on the same scene is also history, not a replacement.
  if (!dom.systemNote.hidden) {
    createSceneSystemNote(dom.systemNote.parentElement);
  }
  const changed = note !== client.renderedSystemNote;
  const structuredParts = Array.isArray(entries)
    ? entries.map(structuredSystemNoteToken).filter(Boolean)
    : [];
  const parts = structuredParts.length > 0
    ? structuredParts.map((part) =>
        `<span class="system-note-token${part.className}">${escapeHtml(part.text)}</span>`
      )
    : note.split(" / ").flatMap((part) => {
        const trimmed = part.trim();
        const legacyItemParts = trimmed.split(",").map((itemPart) => itemPart.trim());
        const legacyItems = legacyItemParts.map((itemPart) => {
          const matched = itemPart.match(/^(.+?)\s+(\d+)개$/);
          return matched
            ? { name: matched[1].trim(), amount: Number(matched[2]) }
            : null;
        });
        if (
          legacyItems.length > 0 &&
          legacyItems.every((item) => item && item.name && item.amount > 0)
        ) {
          return legacyItems.map((item) =>
            `<span class="system-note-token is-positive">${escapeHtml(`+${item.amount} ${item.name}`)}</span>`
          );
        }
        if (isElapsedTimeSystemNoteToken(trimmed)) {
          return [`<span class="system-note-token">${escapeHtml(trimmed)}</span>`];
        }
        if (/^(?:강도|나):\s*\d+\s*피해$/.test(trimmed)) {
          return [`<span class="system-note-token is-damage">${escapeHtml(trimmed)}</span>`];
        }
        if (trimmed.startsWith("+")) {
          return [`<span class="system-note-token is-positive">${escapeHtml(trimmed)}</span>`];
        }
        if (trimmed.startsWith("-")) {
          return [`<span class="system-note-token is-negative">${escapeHtml(trimmed)}</span>`];
        }
        return [`<span class="system-note-token">${escapeHtml(trimmed)}</span>`];
      });

  // The active story block owns the note from creation, including while typing.
  dom.systemNote.hidden = false;
  dom.systemNote.innerHTML = parts.join("");
  if (changed) {
    dom.systemNote.classList.remove("is-entering");
    void dom.systemNote.offsetWidth;
    dom.systemNote.classList.add("is-entering");
  }
  client.renderedSystemNote = note;
  client.renderedSystemNoteKey = noteKey;
}

function completedQuestChanges(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || !nextSnapshot) {
    return [];
  }

  const previousQuests = new Map((previousSnapshot.quests || []).map((quest) => [quest.id, quest.status]));
  return (nextSnapshot.quests || []).filter((quest) =>
    quest.status === "completed" && previousQuests.get(quest.id) !== "completed"
  );
}

function questCompletionElement() {
  if (dom.questCompletion) {
    return dom.questCompletion;
  }

  const element = document.createElement("aside");
  element.className = "quest-completion-burst";
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  document.body.appendChild(element);
  dom.questCompletion = element;
  return element;
}

function showQuestCompletionBurst(completedQuests) {
  if (!completedQuests.length) {
    return;
  }

  const quest = completedQuests[0];
  const element = questCompletionElement();
  window.clearTimeout(client.questCelebrationTimer);
  element.innerHTML = `
    <span class="quest-completion-kicker">퀘스트 완료</span>
    <strong>${escapeHtml(quest.name)}</strong>
  `;
  element.hidden = false;
  element.classList.remove("is-visible");
  void element.offsetWidth;
  element.classList.add("is-visible");
  client.questCelebrationTimer = window.setTimeout(() => {
    element.classList.remove("is-visible");
    window.setTimeout(() => {
      if (!element.classList.contains("is-visible")) {
        element.hidden = true;
      }
    }, 220);
  }, 2600);
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
  const detail = STATUS_DETAILS[statKey];
  const value = `${snapshot.stats[statKey]} / ${detail.max}`;

  dom.statusPopover.innerHTML = `
    <strong>${detail.title}</strong>
    <p>${value}</p>
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

function statusSeverityClass(value) {
  if (value <= 3) {
    return "is-danger";
  }
  if (value <= 5) {
    return "is-warning";
  }
  return "";
}

function applyStatusSeverity(element, value) {
  element.classList.remove("is-warning", "is-danger");
  const severityClass = statusSeverityClass(value);
  if (severityClass) {
    element.classList.add(severityClass);
  }
}

function resetTimeAdvancePresentation() {
  if (client.timeAdvanceTimer !== null) {
    window.clearTimeout(client.timeAdvanceTimer);
    client.timeAdvanceTimer = null;
  }
  dom.timeStatus?.classList.remove("is-time-advanced");
  client.renderedWorldElapsedMs = null;
}

function emphasizeAdvancedTime() {
  if (!dom.timeStatus) {
    return;
  }
  if (client.timeAdvanceTimer !== null) {
    window.clearTimeout(client.timeAdvanceTimer);
  }
  dom.timeStatus.classList.remove("is-time-advanced");
  void dom.timeStatus.offsetWidth;
  dom.timeStatus.classList.add("is-time-advanced");
  client.timeAdvanceTimer = window.setTimeout(() => {
    dom.timeStatus?.classList.remove("is-time-advanced");
    client.timeAdvanceTimer = null;
  }, TIME_ADVANCE_EMPHASIS_MS);
}

function renderEncounterStatus(state) {
  const progress = state?.subwayExpedition?.currentFloorProgress;
  const encounter = progress?.encounter;
  const isVisible = Boolean(
    state?.subwayExpedition?.active &&
    encounter &&
    ["encounter", "encounter_result"].includes(progress.phase),
  );

  document.body.classList.toggle("has-active-encounter", isVisible);
  dom.encounterStatus.hidden = !isVisible;
  if (!isVisible) {
    return;
  }

  const isCombat = Boolean(encounter.enemy);
  const value = isCombat
    ? Math.max(0, encounter.enemy.hp)
    : Math.max(0, encounter.progress || 0);
  const maxValue = isCombat
    ? Math.max(1, encounter.enemy.maxHp)
    : Math.max(1, encounter.targetProgress || 1);
  const name = isCombat
    ? encounter.enemy.name
    : encounter.kind === "social"
      ? "대화 진행"
      : "위험 돌파";
  dom.encounterStatusName.textContent = name;
  dom.encounterHealth.max = maxValue;
  dom.encounterHealth.value = Math.min(value, maxValue);
  dom.encounterHealth.setAttribute(
    "aria-label",
    isCombat
      ? `${name} 체력 ${value} / ${maxValue}`
      : `${name} ${value} / ${maxValue}`,
  );
  dom.encounterHealthValue.textContent = `${value}/${maxValue}`;
  const skillNames = {
    power_strike: "강타",
    improvised_mastery: "임기응변",
    iron_guard: "철벽",
    second_wind: "재정비",
    silver_tongue: "협상가",
    escape_route: "퇴로 확보",
  };
  const runBuild = state.subwayExpedition?.runBuild;
  const skillSummary = Object.entries(runBuild?.skillRanks || {})
    .filter(([, rank]) => Number(rank) > 0)
    .map(([skillId, rank]) => `${skillNames[skillId] || skillId} ${rank}`)
    .join(" · ");
  dom.encounterBuildSummary.textContent = [
    `지하 ${state.subwayExpedition.depth}층`,
    `승리 ${runBuild?.victories || 0}회`,
    skillSummary,
  ].filter(Boolean).join(" · ");
}

function renderStatusBar() {
  const snapshot = currentState();
  if (!snapshot) {
    return;
  }

  renderEncounterStatus(snapshot);
  const badges = document.querySelector("#condition-badges");
  const conditions = client.snapshot?.conditionCards || [];
  badges.hidden = conditions.length === 0;
  const badgeMarkup = conditions.map(condition => `<button type="button" class="condition-badge ${condition.level >= 3 ? "is-critical" : ""}" data-condition-detail aria-label="${condition.label} Lv${condition.level} 상세 보기">${condition.label} Lv${condition.level}</button>`).join("");
  if (badges.dataset.rendered !== badgeMarkup) {
    badges.dataset.rendered = badgeMarkup;
    badges.innerHTML = badgeMarkup;
    badges.querySelectorAll("[data-condition-detail]").forEach(button => button.addEventListener("click", (event) => {
      event.stopPropagation();
      client.isPanelOpen = true;
      client.activePanel = "status";
      client.activeStatusPanelView = "status";
      renderPanel();
    }));
  }
  const hpMax = STATUS_DETAILS.hp.max;
  const mindDetail = statusDetailFor("mind", snapshot);
  const mindMax = mindDetail.max;
  const energyMax = STATUS_DETAILS.energy.max;
  dom.hpFill.style.width = `${Math.max(0, Math.min(100, (snapshot.stats.hp / hpMax) * 100))}%`;
  dom.mindFill.style.width = `${Math.max(0, Math.min(100, (snapshot.stats.mind / mindMax) * 100))}%`;
  dom.energyFill.style.width = `${Math.max(0, Math.min(100, (snapshot.stats.energy / energyMax) * 100))}%`;
  dom.hpStatus.setAttribute("aria-label", `체력 ${snapshot.stats.hp} / ${hpMax}`);
  dom.mindStatus.setAttribute("aria-label", `${mindDetail.title} ${snapshot.stats.mind} / ${mindMax}`);
  dom.mindStatus.classList.toggle("is-magic-stat", isMagicWorldState(snapshot));
  const mindIcon = dom.mindStatus.querySelector(".status-icon");
  const mindHiddenLabel = dom.mindStatus.querySelector(".visually-hidden");
  if (mindIcon) {
    mindIcon.textContent = isMagicWorldState(snapshot) ? "✦" : "🧠";
  }
  if (mindHiddenLabel) {
    mindHiddenLabel.textContent = mindDetail.title;
  }
  dom.energyStatus.setAttribute("aria-label", `기력 ${snapshot.stats.energy} / ${energyMax}`);
  applyStatusSeverity(dom.hpStatus, snapshot.stats.hp);
  applyStatusSeverity(dom.mindStatus, snapshot.stats.mind);
  applyStatusSeverity(dom.energyStatus, snapshot.stats.energy);
  const nextWorldElapsedMs = Math.max(0, snapshot.worldElapsedMs || 0);
  const didTimeAdvance = client.renderedWorldElapsedMs !== null
    && nextWorldElapsedMs > client.renderedWorldElapsedMs;
  dom.timeIndicator.textContent = `${snapshot.day}일차 ${gameClockLabel()}`;
  client.renderedWorldElapsedMs = nextWorldElapsedMs;
  if (didTimeAdvance) {
    emphasizeAdvancedTime();
  }

  if (client.activeStatusPopoverKey) {
    openStatusPopover(client.activeStatusPopoverKey, { toggle: false });
  }
}

function renderChoices() {
  const snapshot = client.snapshot;
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed", "is-crafting-menu", "is-cooking-menu");
  dom.sceneFrame.classList.remove("is-cooking-menu");
  if (!snapshot) {
    syncMobileChoiceZoneHeight();
    return;
  }
  const pendingAction = client.pendingAction;
  const isGeneratingSubwayFloor = client.actionInFlight && (
    pendingAction?.type === "subway_expedition" &&
      (pendingAction.command === "start" || pendingAction.command === "descend") ||
    pendingAction?.type === "content_action" &&
      pendingAction.actionId === "start_subway_expedition"
  );
  if (isGeneratingSubwayFloor) {
    const loading = document.createElement("p");
    loading.className = "empty-state";
    loading.textContent = "준비된 지하 구간으로 이동하고 있습니다…";
    loading.setAttribute("aria-live", "polite");
    dom.choices.appendChild(loading);
  }
  if (snapshot.state.isGameOver) {
    dom.choices.classList.add("revealed");
    syncMobileChoiceZoneHeight();
    return;
  }

  const isRecipeMenu = snapshot.availableActions.some((choice) => choice.craftingRecipe);
  const isCookingMenu = snapshot.availableActions.some((choice) => choice.id === "leave_shelter_cooking");
  if (isRecipeMenu) {
    dom.choices.classList.add("is-crafting-menu");
    dom.choices.classList.toggle("is-cooking-menu", isCookingMenu);
    dom.sceneFrame.classList.toggle("is-cooking-menu", isCookingMenu);
    renderCraftingChoices(snapshot, { isCookingMenu });
    dom.choices.classList.add("revealed");
    syncMobileChoiceZoneHeight();
    return;
  }

  snapshot.availableActions.forEach((choice) => {
    const fragment = dom.choiceTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    const label = fragment.querySelector(".choice-label");
    const status = fragment.querySelector(".choice-status");
    const remaining = fragment.querySelector(".choice-remaining");
    const meta = fragment.querySelector(".choice-meta");
    const isQuestChoice = choice.label.startsWith("퀘스트:");
    label.textContent = choice.label;
    status.textContent = choice.statusLabel || "";
    status.hidden = !choice.statusLabel;
    const hasRemainingUses = Number.isInteger(choice.remainingUses);
    remaining.textContent = hasRemainingUses ? `남은 횟수: ${choice.remainingUses}회` : "";
    remaining.hidden = !hasRemainingUses;
    const outcomeHint = choice.outcomeHint || "";
    const shouldShowOutcomeHint = Boolean(choice.showOutcomeHint && outcomeHint);
    meta.textContent = shouldShowOutcomeHint ? outcomeHint : "";
    meta.hidden = !shouldShowOutcomeHint;
    button.classList.toggle("is-quest", isQuestChoice);
    button.disabled = client.actionInFlight || choice.isAvailable === false;
    button.addEventListener("click", () => submitAction(
      choice.action,
      button,
      choice.loading,
      choice.postChoiceNarrative,
    ));
    dom.choices.appendChild(fragment);
  });

  dom.choices.classList.add("revealed");
  syncMobileChoiceZoneHeight();
}

function renderScene(animateText = true, appendStory = false, scrollToStart = false) {
  const snapshot = client.snapshot;
  const scene = snapshot?.currentScene;
  const location = currentLocationCard();
  if (!snapshot || !scene || !location) {
    return;
  }

  const story = buildStoryDisplay(snapshot);
  const surfaceId = storySurfaceId(snapshot);
  const previousRenderedNoteKey = client.renderedSystemNoteKey;
  const surfaceChanged = Boolean(client.renderedStorySurfaceId && client.renderedStorySurfaceId !== surfaceId);
  if (surfaceChanged && !appendStory) {
    resetSceneScrollOnMobile();
  }

  // Existing saves can retain the original forest asset path.
  const sceneImagePath = location.imagePath === "assets/scenes/forest.svg"
    ? "assets/scenes/forest-pencil-charcoal.png"
    : location.imagePath;
  dom.sceneArt.src = sceneImagePath || "assets/scenes/camp.svg";
  syncShelterSceneVisual(snapshot);
  renderSceneDevSource(snapshot);
  const systemNote = snapshot.state.systemNote || "";
  const currentSystemNoteKey = systemNoteKey(snapshot, systemNote);
  const isCarriedNote =
    (surfaceChanged || appendStory) && Boolean(systemNote) && currentSystemNoteKey === previousRenderedNoteKey;
  const systemNotePayload = systemNote && !isCarriedNote
    ? {
        key: currentSystemNoteKey,
        note: systemNote,
        entries: snapshot.state.systemNoteEntries || [],
      }
    : null;
  const isSameRenderedSurface =
    client.renderedStorySurfaceId === surfaceId && dom.sceneText.childElementCount > 0;
  client.renderedStorySurfaceId = surfaceId;

  if (isSameRenderedSurface && !appendStory) {
    if (!client.isSceneTyping) {
      if (systemNotePayload?.note) {
        renderSystemNote(
          systemNotePayload.note,
          systemNotePayload.key,
          systemNotePayload.entries,
        );
      }
      renderChoices();
    }
    return;
  }

  clearSceneAnimation();
  if (!animateText) {
    const headlineBlock = story.headline
      ? `<p class="scene-headline">${escapeHtml(story.headline)}</p>`
      : "";
    const storyHtml =
      headlineBlock + story.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    const block = createSceneStoryBlock(appendStory);
    block.querySelector(".scene-prose").innerHTML = storyHtml;
    if (scrollToStart) {
      scrollSceneStoryToStart(block);
    }
    if (systemNotePayload?.note) {
      renderSystemNote(
        systemNotePayload.note,
        systemNotePayload.key,
        systemNotePayload.entries,
      );
    }
    renderChoices();
    return;
  }

  const token = client.sceneRenderToken;
  animateStoryText(story, token, systemNotePayload, {
    append: appendStory,
    scrollToStart,
    revealChoices: true,
  });
}

function locationMap() {
  const visible = new Map(client.snapshot.visibleLocations.map((entry) => [entry.id, entry]));
  const states = new Map(client.snapshot.mapEntries.map((entry) => [entry.locationId, entry]));
  return { visible, states };
}

function setupHexMapHighlight(stage) {
  if (!stage) return;

  // SVG siblings paint in DOM order. Draw the outline after every tile so
  // neighboring fills and strokes cannot cover any of its six edges.
  const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  outline.setAttribute("class", "hex-tile-outline");
  outline.setAttribute("aria-hidden", "true");
  stage.appendChild(outline);

  let hoveredTile = stage.querySelector(".hex-tile:hover");
  let focusedTile = stage.querySelector(".hex-tile:focus-visible");
  const syncOutline = () => {
    const tile = hoveredTile || (focusedTile?.matches(":focus-visible") ? focusedTile : null);
    const shape = tile?.querySelector(".hex-tile-shape");
    outline.classList.toggle("is-visible", Boolean(shape));
    if (!shape) return;
    outline.setAttribute("points", shape.getAttribute("points"));
    outline.setAttribute("transform", tile.getAttribute("transform") || "");
  };

  stage.querySelectorAll(".hex-tile").forEach((tile) => {
    tile.addEventListener("pointerenter", () => { hoveredTile = tile; syncOutline(); });
    tile.addEventListener("pointerleave", () => { hoveredTile = null; syncOutline(); });
    tile.addEventListener("focus", () => { focusedTile = tile; syncOutline(); });
    tile.addEventListener("blur", () => { focusedTile = null; syncOutline(); });
  });
  syncOutline();
}

function renderMapPanel() {
  const snapshot = client.snapshot;
  if (!snapshot) {
    return;
  }
  if (snapshot.state.subwayExpedition?.active) {
    const expedition = snapshot.state.subwayExpedition;
    dom.panelContent.innerHTML = `
      <section class="map-detail-slot">
        <div class="map-detail-head">
          <div>
            <p class="meta-label">지하철 심층 탐험 중</p>
            <h3>현재 ${expedition.depth}층</h3>
          </div>
          <span class="tag tag-route">최고 ${expedition.deepestDepth}층</span>
        </div>
        <p>지상 지도로 이동하려면 현재 장면에서 귀환을 선택해야 합니다. 귀환하기 전의 물자는 임시 전리품입니다.</p>
      </section>
    `;
    return;
  }

  const currentLocation = currentLocationCard();
  const { visible, states } = locationMap();
  const boardNodes = buildBoardNodes(visible);
  const boardLayout = buildHexBoardLayout(boardNodes);
  const mapScale = currentMapScale(boardLayout);
  const scaledMapWidth = Math.round(boardLayout.pixelWidth * mapScale);
  const scaledMapHeight = Math.round(boardLayout.pixelHeight * mapScale);
  const mapFocusGutter = client.mapZoomIndex > MAP_ZOOM_FIT_INDEX
    ? clampNumber(Math.round(84 * mapScale), 108, 180)
    : 0;
  const scrollSpaceWidth = scaledMapWidth + (mapFocusGutter * 2);
  const scrollSpaceHeight = scaledMapHeight + (mapFocusGutter * 2);
  const mapBoardHeight = clampNumber(scaledMapHeight + 24, 214, 390);
  const mapZoomPercent = Math.round(mapScale * 100);
  const canZoomOut = client.mapZoomIndex > 0;
  const canZoomIn = client.mapZoomIndex < MAP_ZOOM_MULTIPLIERS.length - 1;
  const edgeKeys = new Set();
  const edgeMarkup = Array.from(visible.values()).flatMap((location) => {
    const fromPosition = boardLayout.positions.get(location.id);
    if (!fromPosition) {
      return [];
    }

    return (location.neighbors || []).flatMap((neighborId) => {
      if (!visible.has(neighborId)) {
        return [];
      }
      const edgeKey = pairKey(location.id, neighborId);
      if (edgeKeys.has(edgeKey)) {
        return [];
      }
      const neighbor = visible.get(neighborId);
      const fromCoord = locationHexCoord(location);
      const toCoord = locationHexCoord(neighbor);
      if (fromCoord && toCoord && !isHexNeighbor(fromCoord, toCoord)) {
        return [];
      }
      const toPosition = boardLayout.positions.get(neighborId);
      if (!toPosition) {
        return [];
      }
      edgeKeys.add(edgeKey);
      const leftState = states.get(location.id);
      const rightState = states.get(neighborId);
      const isActiveRoute = Boolean(leftState?.isCurrent || rightState?.isCurrent);
      return `
        <line
          class="hex-route-line ${isActiveRoute ? "is-active" : ""}"
          x1="${fromPosition.x}"
          y1="${fromPosition.y}"
          x2="${toPosition.x}"
          y2="${toPosition.y}"
        />
      `;
    });
  }).join("");

  const tileMarkup = boardNodes.map((node) => {
    const position = boardLayout.positions.get(node.locationId) || { x: 0, y: 0 };
    const location = visible.get(node.locationId);
    const state = states.get(node.locationId);
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
      !state.isCurrent && !state.isAdjacent && !state.isReachable ? "is-known" : "",
    ].filter(Boolean).join(" ");

    return `
      <g
        class="${classes}"
        data-hex-location="${node.locationId}"
        role="button"
        tabindex="${state.isCurrent || state.isReachable || state.isAdjacent ? "0" : "-1"}"
        aria-label="${escapeHtml(location.name)}"
        transform="translate(${position.x} ${position.y})"
      >
        <polygon class="hex-tile-shape" points="${hexPoints(0, 0, boardLayout.dimensions.size)}"></polygon>
        <text class="hex-tile-name" text-anchor="middle">${hexLabelMarkup(location.name)}</text>
        <title>${escapeHtml(location.name)}</title>
      </g>
    `;
  }).join("");

  const hexMapDefs = `
    <defs>
      <linearGradient id="hex-fill-default" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f9fbfb"></stop>
        <stop offset="100%" stop-color="#e4ebee"></stop>
      </linearGradient>
      <linearGradient id="hex-fill-reachable" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d5dee4"></stop>
        <stop offset="100%" stop-color="#aebdc7"></stop>
      </linearGradient>
      <linearGradient id="hex-fill-reachable-hover" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#c8d6dd"></stop>
        <stop offset="100%" stop-color="#9fb3be"></stop>
      </linearGradient>
      <linearGradient id="hex-fill-current" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3b927b"></stop>
        <stop offset="100%" stop-color="#236451"></stop>
      </linearGradient>
      <linearGradient id="hex-fill-known" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f6f8f8"></stop>
        <stop offset="100%" stop-color="#dfe7ea"></stop>
      </linearGradient>
      <linearGradient id="hex-fill-locked" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#646a70"></stop>
        <stop offset="100%" stop-color="#3d4349"></stop>
      </linearGradient>
      <filter id="hex-shadow-soft" x="-28%" y="-28%" width="156%" height="156%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#1f2937" flood-opacity="0.12"></feDropShadow>
      </filter>
      <filter id="hex-shadow-current" x="-32%" y="-32%" width="164%" height="164%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#1f4e42" flood-opacity="0.18"></feDropShadow>
      </filter>
    </defs>
  `;

  const travelEntries = snapshot.mapEntries
    .filter((entry) => visible.has(entry.locationId))
    .filter((entry) => !entry.isCurrent && (entry.isReachable || entry.isAdjacent))
    .sort((left, right) => {
      const leftDistance = left.routeDistance || 99;
      const rightDistance = right.routeDistance || 99;
      return leftDistance - rightDistance;
    })
    .map((entry) => ({
      entry,
      location: visible.get(entry.locationId),
    }))
    .filter(({ location }) => Boolean(location));
  const activeTravelEntry = travelEntries.some(({ entry }) => entry.locationId === client.activeMapDetailKey)
    ? client.activeMapDetailKey
    : travelEntries[0]?.entry.locationId ?? null;
  client.activeMapDetailKey = activeTravelEntry;
  const selectedTravel = travelEntries.find(({ entry }) => entry.locationId === client.activeMapDetailKey);

  const travelCards = travelEntries
    .map(({ entry, location }) => {
      const travelLabel = formatDurationMinutes(entry.travelMinutes);
      const routeTag = entry.isReachable && travelLabel
        ? `<span class="tag tag-route">${travelLabel}</span>`
        : "";
      const isSelected = entry.locationId === client.activeMapDetailKey;
      return `
        <article
          class="map-card map-card-compact map-destination-card ${entry.isReachable ? "is-reachable" : "is-locked"} ${entry.isAdjacent ? "is-adjacent" : "is-distant"} ${isSelected ? "is-selected" : ""}"
          data-map-detail="${entry.locationId}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected ? "true" : "false"}"
        >
          <div class="map-meta">
            <h3>${location.name}</h3>
            <div class="map-card-tags">
              <span class="tag">${riskLabel(location.risk)}</span>
              ${routeTag}
              ${entry.isReachable ? "" : `<span class="tag tag-muted">이동 불가</span>`}
            </div>
          </div>
        </article>
      `;
    }).join("");
  const selectedTravelLabel = selectedTravel?.entry.isReachable
    ? formatDurationMinutes(selectedTravel.entry.travelMinutes)
    : "";
  const selectedTravelRouteTag = selectedTravelLabel
    ? `<span class="tag tag-route">${selectedTravelLabel}</span>`
    : "";
  const mapDetailSlot = selectedTravel
    ? `
      <section class="map-detail-slot" aria-live="polite">
        <div class="map-detail-head">
          <div>
            <p class="meta-label">선택한 목적지</p>
            <h3>${selectedTravel.location.name}</h3>
          </div>
          <div class="map-card-tags">
            <span class="tag">${riskLabel(selectedTravel.location.risk)}</span>
            ${selectedTravelRouteTag}
          </div>
        </div>
        <p>${selectedTravel.location.summary}</p>
        ${selectedTravel.entry.isReachable ? "" : `<small class="tiny">${selectedTravel.entry.reason || "아직 이동할 수 없는 경로다."}</small>`}
        <button
          class="map-travel-action ${selectedTravel.entry.isReachable ? "" : "is-disabled"}"
          data-map-travel="${selectedTravel.entry.locationId}"
          type="button"
          ${selectedTravel.entry.isReachable ? "" : "disabled"}
        >
          ${selectedTravel.entry.isReachable ? "이동" : "이동 불가"}
        </button>
      </section>
    `
    : `<p class="empty-state">지금 이동할 수 있는 장소가 없다.</p>`;

  dom.panelContent.innerHTML = `
    <section class="hex-map-shell">
      <div class="hex-map-board" style="height:${mapBoardHeight}px;">
        <div class="hex-map-scroll-space" style="width:${scrollSpaceWidth}px; height:${scrollSpaceHeight}px;">
          <div class="hex-map-canvas" style="width:${scaledMapWidth}px; height:${scaledMapHeight}px; left:${mapFocusGutter}px; top:${mapFocusGutter}px;">
            <svg
              class="hex-map-stage"
              viewBox="0 0 ${boardLayout.pixelWidth} ${boardLayout.pixelHeight}"
              style="--hex-size:${boardLayout.dimensions.size}px;"
              role="img"
              aria-label="지역 지도"
            >
              ${hexMapDefs}
              ${edgeMarkup}
              ${tileMarkup}
            </svg>
          </div>
        </div>
      </div>

      <div class="hex-map-toolbar" aria-label="지도 확대 축소">
        <button class="map-zoom-button" data-map-zoom="out" type="button" aria-label="지도 축소" ${canZoomOut ? "" : "disabled"}>−</button>
        <span class="map-zoom-value">${mapZoomPercent}%</span>
        <button class="map-zoom-button" data-map-zoom="in" type="button" aria-label="지도 확대" ${canZoomIn ? "" : "disabled"}>+</button>
        <button class="map-zoom-button map-zoom-fit" data-map-zoom="fit" type="button" aria-label="지도 맞춤">맞춤</button>
      </div>

      <div class="map-list">
        ${travelCards}
      </div>

      ${mapDetailSlot}
    </section>
  `;

  setupHexMapHighlight(dom.panelContent.querySelector(".hex-map-stage"));
  alignHexMapViewport(boardLayout, mapScale, currentLocation.id);
  refreshTransientScrollbars();

  dom.panelContent.querySelectorAll("[data-map-zoom]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const direction = button.dataset.mapZoom;
      if (direction === "out") {
        client.mapZoomIndex = Math.max(0, client.mapZoomIndex - 1);
      } else if (direction === "in") {
        client.mapZoomIndex = Math.min(MAP_ZOOM_MULTIPLIERS.length - 1, client.mapZoomIndex + 1);
      } else {
        client.mapZoomIndex = MAP_ZOOM_FIT_INDEX;
      }
      if (typeof button.blur === "function") {
        button.blur();
      }
      renderMapPanel();
    });
  });

  dom.panelContent.querySelectorAll("[data-hex-location]").forEach((tile) => {
    const activateTile = () => {
      const locationId = tile.dataset.hexLocation;
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
        submitAction({ type: "travel", targetId: locationId }, tile);
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
    };

    tile.addEventListener("click", activateTile);
    tile.addEventListener("pointerup", () => {
      if (typeof tile.blur === "function") {
        tile.blur();
      }
    });
    tile.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      activateTile();
    });
  });

  dom.panelContent.querySelectorAll("[data-map-detail]").forEach((card) => {
    card.addEventListener("click", () => {
      client.activeMapDetailKey = card.dataset.mapDetail;
      client.mapHint = "";
      renderMapPanel();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      client.activeMapDetailKey = card.dataset.mapDetail;
      client.mapHint = "";
      renderMapPanel();
    });
  });

  dom.panelContent.querySelectorAll("[data-map-travel]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      client.mapHint = "";
      submitAction({ type: "travel", targetId: button.dataset.mapTravel }, button);
    });
  });
}

function canUseTreatmentItem(item, state = currentState()) {
  const effects = item.effects || {};
  if (!effects.injuryRelief && !effects.infectionRelief) return true;
  return Boolean((effects.injuryRelief > 0 && state?.conditions?.injury?.level > 0)
    || (effects.infectionRelief > 0 && state?.conditions?.infection?.level > 0));
}

function renderInventoryPanel() {
  const snapshot = client.snapshot;
  const itemCards = snapshot.inventoryCards || [];
  const moneyDetailKey = "money";
  const inventoryDetails = new Map([
    [moneyDetailKey, {
      name: "돈",
      lines: [{ text: "한 끼를 사고, 필요한 물건을 마련하는 데 쓰는 현금이다." }],
      itemId: null,
      isUsable: false,
    }],
  ]);

  itemCards.forEach((item) => {
    const detailLines = [{ text: item.description }];
    if (!canUseTreatmentItem(item, snapshot.state)) detailLines.push({ text: "치료할 부상 또는 감염이 없습니다." });
    const effectHintHtml = ["food", "drink", "medicine"].includes(item.kind)
      ? itemEffectHintHtml(item.effects, item.useMinutes)
      : "";
    if (effectHintHtml) {
      detailLines.push({ html: effectHintHtml });
    }
    const durabilityHintHtml = itemDurabilityHintHtml(item, snapshot.state);
    if (durabilityHintHtml) {
      detailLines.push({ html: durabilityHintHtml });
    }
    inventoryDetails.set(item.id, {
      name: item.name,
      lines: detailLines,
      itemId: item.id,
      isUsable: ["food", "drink", "medicine"].includes(item.kind) && canUseTreatmentItem(item, snapshot.state),
    });
  });

  if (!inventoryDetails.has(client.activeInventoryDetailKey)) {
    client.activeInventoryDetailKey = itemCards[0]?.id || moneyDetailKey;
  }

  const isMoneyActive = client.activeInventoryDetailKey === moneyDetailKey;
  const selectInventoryDetail = (detailKey) => {
    client.activeInventoryDetailKey = detailKey;
    renderInventoryPanel();
  };
  const bindInventoryPanelInteractions = () => {
    const scrollArea = dom.panelContent.querySelector(".inventory-list-scroll");
    if (scrollArea) {
      scrollArea.scrollTop = client.inventoryScrollTop;
      scrollArea.addEventListener("scroll", () => {
        client.inventoryScrollTop = scrollArea.scrollTop;
      }, { passive: true });
      setupTransientScrollbar(scrollArea);
    }

    dom.panelContent.querySelectorAll("[data-inventory-detail]").forEach((card) => {
      card.addEventListener("click", () => {
        if (client.actionInFlight) {
          return;
        }
        selectInventoryDetail(card.dataset.inventoryDetail);
      });
      card.addEventListener("keydown", (event) => {
        if (client.actionInFlight) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        selectInventoryDetail(card.dataset.inventoryDetail);
      });
    });

    dom.panelContent.querySelectorAll("[data-use-item]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        submitAction({ type: "use_item", itemId: button.dataset.useItem }, button);
      });
    });
  };
  const moneyCard = `
    <article
      class="info-card inventory-card ${isMoneyActive ? "is-active" : ""}"
      data-inventory-detail="${moneyDetailKey}"
      role="button"
      tabindex="0"
      aria-pressed="${isMoneyActive ? "true" : "false"}"
    >
      <div class="inventory-card-head">
        <h3>돈</h3>
        <span class="tag">${snapshot.state.money.toLocaleString()}원</span>
      </div>
    </article>
  `;

  const renderedItemCards = itemCards.map((item) => {
    const count = snapshot.state.inventory[item.id] || 0;
    const isActive = client.activeInventoryDetailKey === item.id;
    return `
      <article
        class="info-card inventory-card ${isActive ? "is-active" : ""}"
        data-inventory-detail="${item.id}"
        role="button"
        tabindex="0"
        aria-controls="inventory-detail-slot"
        aria-pressed="${isActive ? "true" : "false"}"
      >
        <div class="inventory-card-head">
          <h3>${escapeHtml(item.name)} ${count > 1 ? `x${count}` : ""}</h3>
        </div>
      </article>
    `;
  });

  const renderInventoryGrid = (cards) => {
    const columns = [[], []];
    cards.forEach((card, index) => {
      columns[index % 2].push(card);
    });

    return `
      <div class="panel-grid inventory-grid">
        <div class="inventory-column">${columns[0].join("")}</div>
        <div class="inventory-column">${columns[1].join("")}</div>
      </div>
    `;
  };
  const renderInventoryDetailSlot = () => {
    const detail = inventoryDetails.get(client.activeInventoryDetailKey);
    return `
      <section
        class="inventory-detail-slot"
        id="inventory-detail-slot"
        aria-label="선택한 아이템 상세"
        aria-live="polite"
      >
        <div class="inventory-detail-copy">
          <strong class="inventory-detail-name">${escapeHtml(detail?.name || "아이템")}</strong>
          <div class="inventory-detail-lines">
            ${(detail?.lines || [{ text: "아이템을 선택하면 설명이 표시된다." }]).map((line) => `
              <p>${line.html ? line.html : escapeHtml(line.text)}</p>
            `).join("")}
          </div>
        </div>
        ${detail?.isUsable ? `
          <button
            class="inline-action inventory-use-action"
            data-use-item="${detail.itemId}"
            type="button"
            aria-label="${escapeHtml(detail.name)} 사용"
          >사용</button>
        ` : ""}
      </section>
    `;
  };

  dom.panelContent.innerHTML = `
    <div class="inventory-panel-layout">
      <div class="inventory-list-scroll" aria-label="보유 아이템 목록">
        ${renderInventoryGrid([moneyCard, ...renderedItemCards])}
        ${itemCards.length === 0 ? `<p class="empty-state">지금 가진 물건이 없다.</p>` : ""}
      </div>
      ${renderInventoryDetailSlot()}
    </div>
  `;

  bindInventoryPanelInteractions();
}

function combatSkillDetailsMarkup(combat) {
  if (!combat) return "";
  const statLabel = `공격 +${combat.attackBonus} · 명중 +${combat.hitChanceBonus}%p · 회피 +${combat.evasionBonus}%p`;
  return `
    <details class="combat-skill-details">
      <summary aria-label="${escapeHtml(statLabel)}. 성장 단계 펼치기">${escapeHtml(statLabel)}</summary>
      <div class="combat-skill-growth">
        <p>공격 시 +${escapeHtml(combat.turnXp)} XP. 적의 위협을 방어·회피해도 같은 경험치를 얻습니다. 빗나가거나 방어에 실패해도 쌓이며, 승리하면 +${escapeHtml(combat.victoryXp)} XP를 추가로 얻습니다.</p>
        <table>
          <caption>레벨별 누적 보너스</caption>
          <thead><tr><th scope="col">레벨</th><th scope="col">누적 XP</th><th scope="col">공격</th><th scope="col">명중</th><th scope="col">회피</th></tr></thead>
          <tbody>${(combat.tiers || []).map(tier => `<tr><th scope="row">Lv.${escapeHtml(tier.level)}</th><td>${escapeHtml(tier.totalXp)}</td><td>+${escapeHtml(tier.attackBonus)}</td><td>+${escapeHtml(tier.hitChanceBonus)}%p</td><td>+${escapeHtml(tier.evasionBonus)}%p</td></tr>`).join("")}</tbody>
        </table>
        <p>공격 보너스는 공격 피해에 더해집니다. 명중률은 최대 ${escapeHtml(combat.hitChanceCap)}%이며, 회피 보너스만큼 적의 반격 명중 확률이 낮아집니다. 전투 숙련도는 탐험을 마치고 돌아와도 유지됩니다.</p>
      </div>
    </details>
  `;
}

function skillsPanelMarkup() {
  const skills = client.snapshot.skills || [];
  const skillProgress = client.snapshot.skillProgress || [];

  if (!skillProgress.length && !skills.length) {
    return `<p class="empty-state">아직 얻은 생존 방식이 없다.</p>`;
  }

  return `
    <div class="skills-panel">
      ${skillProgress.length ? `
        <section class="skill-section" aria-label="숙련도">
          <h3 class="skill-section-title">숙련도</h3>
          <div class="panel-grid skill-progress-grid">
            ${skillProgress.map((skill) => {
              const isMaxLevel = Boolean(skill.isMaxLevel);
              const progressPercent = Math.max(0, Math.min(100, Number(skill.progressPercent) || 0));
              const xpIntoLevel = Math.max(0, Number(skill.xpIntoLevel) || 0);
              const xpForNextLevel = Math.max(0, Number(skill.xpForNextLevel) || 0);
              const effectPercent = Math.max(0, Number(skill.effectPercent) || 0);
              const skillName = skill.name
                || (skill.id === "collection" ? "수집" : skill.id === "exploration" ? "탐색" : skill.id === "fishing" ? "낚시" : skill.id === "combat" ? "전투" : skill.id);
              const effectLabel = skill.id === "collection"
                ? `시간 -${effectPercent}%`
                : skill.id === "exploration" || skill.id === "fishing"
                  ? `성공률 +${effectPercent}%`
                  : `효과 ${effectPercent}%`;
              const xpLabel = isMaxLevel ? "MAX" : `${xpIntoLevel} / ${xpForNextLevel} XP`;
              const compactXpLabel = isMaxLevel ? "MAX" : `${xpIntoLevel}/${xpForNextLevel}`;
              const meterValue = isMaxLevel ? 100 : progressPercent;
              const meterMax = isMaxLevel ? 100 : Math.max(1, xpForNextLevel);
              const meterNow = isMaxLevel ? 100 : Math.min(xpIntoLevel, meterMax);

              return `
                <article class="info-card skill-progress-card is-${escapeHtml(skill.id)}">
                  <div class="skill-progress-compact-row">
                    <h3>${escapeHtml(skillName)}</h3>
                    ${skill.combat ? "" : `<span class="skill-progress-effect">${escapeHtml(effectLabel)}</span>`}
                    <span class="skill-level-badge ${isMaxLevel ? "is-max" : ""}">
                      ${isMaxLevel ? "MAX" : `Lv.${skill.level}`}
                    </span>
                    <div
                      class="skill-xp-meter"
                      role="progressbar"
                      aria-label="${escapeHtml(`${skillName} 경험치`)}"
                      aria-valuemin="0"
                      aria-valuemax="${meterMax}"
                      aria-valuenow="${meterNow}"
                      aria-valuetext="${escapeHtml(xpLabel)}"
                    >
                      <span style="width:${meterValue}%"></span>
                    </div>
                    <strong class="skill-xp-value">${compactXpLabel}</strong>
                  </div>
                  ${combatSkillDetailsMarkup(skill.combat)}
                </article>
              `;
            }).join("")}
          </div>
        </section>
      ` : ""}
      ${skills.length ? `
        <section class="skill-section legacy-skills-section" aria-label="보유 특성">
          <h3 class="skill-section-title">보유 특성</h3>
          <div class="panel-grid">
            ${skills.map((skill) => `
              <article class="info-card legacy-skill-card">
                <h3>${escapeHtml(skill.name)}</h3>
                <p>${escapeHtml(skill.description)}</p>
              </article>
            `).join("")}
          </div>
        </section>
      ` : ""}
    </div>
  `;
}

function renderSkillsPanel() {
  dom.panelContent.innerHTML = skillsPanelMarkup();
}

function healthConditionDetailsMarkup() {
  const conditions = client.snapshot?.conditionCards || [];
  if (!conditions.length) return "";
  return `<section class="condition-details" aria-label="부상과 감염 상세">${conditions.map(condition => `
    <article class="condition-detail-card ${condition.level >= 3 ? "is-critical" : ""}">
      <strong>${condition.label} Lv${condition.level}</strong>
      ${condition.level >= 4 ? '<p>Lv4 도달 · 생존 종료</p>' : `
      <p>다음 체력 −1까지 ${formatMinutesLabel(condition.nextDamageMinutes)}</p>
      ${condition.nextWorseningMinutes === null ? '' : `<p>다음 악화까지 ${formatMinutesLabel(condition.nextWorseningMinutes)}</p>`}
      <p>${condition.kind === "injury" ? "붕대" : "항생제"} 1개로 1단계 치료</p>
      ${condition.level === 3 ? '<p class="condition-warning">한 단계 더 쌓이면 체력과 관계없이 생존 종료됩니다.</p>' : ''}`}
    </article>`).join("")}<p class="status-detail-note">게임 시간이 흐를 때 진행됩니다. 취침 중에는 피해와 감염 악화가 25% 속도로 진행됩니다.</p></section>`;
}

function statusDetailMarkup() {
  const snapshot = client.snapshot;
  const state = snapshot.state;
  const stats = [
    {
      key: "hp",
      value: state.stats.hp,
    },
    {
      key: "mind",
      value: state.stats.mind,
    },
    {
      key: "energy",
      value: state.stats.energy,
    },
  ];

  return `
    ${healthConditionDetailsMarkup()}
    <div class="status-detail-stack">
      ${stats.map((stat) => {
        const detail = statusDetailFor(stat.key, state);
        const isActive = client.activeStatusDetailKey === stat.key;
        const fillPercent = Math.max(0, Math.min(100, (stat.value / detail.max) * 100));
        return `
          <div class="status-detail-row-wrap">
            <button
              class="status-detail-row is-${stat.key} ${isActive ? "is-active" : ""}"
              data-status-detail="${stat.key}"
              type="button"
              aria-expanded="${isActive ? "true" : "false"}"
            >
              <span class="status-detail-title">${detail.title}</span>
              <span class="status-detail-meter" aria-hidden="true">
                <span style="width:${fillPercent}%"></span>
              </span>
              <span class="status-detail-value">${stat.value} / ${detail.max}</span>
            </button>
            ${isActive ? `<p class="status-detail-note">${detail.note}</p>` : ""}
          </div>
        `;
      }).join("")}
    </div>
    <div class="status-summary-grid status-summary-grid-single">
      <article class="info-card status-summary-card">
        <h3>돈</h3>
        <p>${state.money.toLocaleString()}원</p>
      </article>
    </div>
  `;
}

function renderStatusPanel() {
  const activeView = client.activeStatusPanelView || "status";
  dom.panelContent.innerHTML = `
    <div class="panel-switch">
      <button
        class="panel-switch-button ${activeView === "status" ? "active" : ""}"
        data-status-view="status"
        type="button"
      >상태</button>
      <button
        class="panel-switch-button ${activeView === "skills" ? "active" : ""}"
        data-status-view="skills"
        type="button"
      >스킬</button>
    </div>
    ${activeView === "skills" ? skillsPanelMarkup() : statusDetailMarkup()}
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

function questRequirementsMarkup(quest) {
  const requirements = quest.requirements || [];
  if (!requirements.length) {
    return "";
  }

  return `
    <div class="quest-requirements" aria-label="필요한 아이템">
      ${requirements.map((requirement) => `
        <div class="quest-requirement ${requirement.met ? "is-met" : ""}">
          <span class="quest-requirement-check" aria-hidden="true">${requirement.met ? "✓" : ""}</span>
          <span class="quest-requirement-name">${requirement.name}</span>
          <span class="quest-requirement-count">${Math.min(requirement.ownedAmount, requirement.amount)} / ${requirement.amount}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function questCardMarkup(quest) {
  const isCompleted = quest.status === "completed";
  return `
    <article class="quest-card ${isCompleted ? "is-completed" : ""}">
      <div class="quest-card-head">
        <h3>${quest.name}</h3>
        <div class="quest-card-actions">
          <span class="tag">${questStatusLabel(quest.status)}</span>
        </div>
      </div>
      <div class="quest-card-body">
        <p>${quest.summary}</p>
        ${questRequirementsMarkup(quest)}
      </div>
    </article>
  `;
}

function completedQuestGroupMarkup(completedQuests) {
  if (!completedQuests.length) {
    return "";
  }

  const isOpen = client.isCompletedQuestGroupOpen;
  return `
    <section class="quest-completed-group">
      <button
        class="quest-completed-toggle"
        data-completed-quests-toggle
        type="button"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span>완료한 퀘스트</span>
        <span class="tag">${completedQuests.length}개</span>
        <span class="quest-completed-toggle-label">${isOpen ? "접기" : "펼치기"}</span>
      </button>
      <div class="quest-completed-list" ${isOpen ? "" : "hidden"}>
        ${completedQuests.map((quest) => questCardMarkup(quest)).join("")}
      </div>
    </section>
  `;
}

function renderQuestsPanel() {
  const visibleQuests = (client.snapshot.quests || []).filter((quest) => quest.status !== "inactive");
  if (!visibleQuests.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 받은 퀘스트가 없다.</p>`;
    return;
  }

  const completedQuests = visibleQuests.filter((quest) => quest.status === "completed");
  const activeQuests = visibleQuests.filter((quest) => quest.status !== "completed");

  dom.panelContent.innerHTML = `
    <div class="quest-panel-stack">
      ${activeQuests.length ? `
        <div class="panel-grid">
          ${activeQuests.map((quest) => questCardMarkup(quest)).join("")}
        </div>
      ` : ""}
      ${completedQuestGroupMarkup(completedQuests)}
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

function itemCatalogEffectHtml(item) {
  const effectHtml = itemEffectHintHtml(item.effects || {}, item.useMinutes || 0);
  if (effectHtml) {
    return effectHtml;
  }
  if (item.kind === "tool" && item.maxDurability) {
    return `<span class="item-effect-list"><span class="item-durability-hint">내구도 ${item.maxDurability}</span></span>`;
  }
  return "";
}

function renderItemCodexPanel() {
  const snapshot = client.snapshot;
  const items = snapshot?.itemCatalog || [];
  if (!items.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">등록된 아이템이 없습니다.</p>`;
    return;
  }

  const grouped = new Map();
  items.forEach((item) => {
    const kind = item.kind || "trade";
    if (!grouped.has(kind)) {
      grouped.set(kind, []);
    }
    grouped.get(kind).push(item);
  });

  const orderedKinds = [
    ...ITEM_KIND_ORDER.filter((kind) => grouped.has(kind)),
    ...Array.from(grouped.keys()).filter((kind) => !ITEM_KIND_ORDER.includes(kind)).sort(),
  ];

  dom.panelContent.innerHTML = `
    <div class="item-codex">
      ${orderedKinds.map((kind) => {
        const kindItems = grouped.get(kind).slice().sort((left, right) => left.name.localeCompare(right.name));
        return `
          <section class="item-codex-section">
            <div class="item-codex-heading">
              <h3>${escapeHtml(ITEM_KIND_LABELS[kind] || kind)}</h3>
              <span class="tag">${kindItems.length}개</span>
            </div>
            <div class="item-codex-list">
              ${kindItems.map((item) => {
                const ownedCount = snapshot.state.inventory[item.id] || 0;
                const effectHtml = itemCatalogEffectHtml(item);
                return `
                  <article class="item-codex-card ${ownedCount > 0 ? "is-owned" : ""}">
                    <div class="item-codex-card-head">
                      <h4>${escapeHtml(item.name)}</h4>
                      <div class="item-codex-tags">
                        <span class="tag">${escapeHtml(ITEM_KIND_LABELS[item.kind] || item.kind)}</span>
                        ${ownedCount > 0 ? `<span class="tag tag-route">보유 ${ownedCount}</span>` : ""}
                      </div>
                    </div>
                    <p>${escapeHtml(item.description)}</p>
                    ${effectHtml ? `<div class="item-codex-effects">${effectHtml}</div>` : ""}
                    ${item.tags?.length ? `
                      <div class="item-codex-tags">
                        ${item.tags.map((tag) => `<span class="tag tag-muted">${escapeHtml(tag)}</span>`).join("")}
                      </div>
                    ` : ""}
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderMenuPanel() {
  const statusLabel = currentSaveStatusLabel();
  const statusMessage = client.menuStatusMessage
    ? `<p class="menu-status-message">${escapeHtml(client.menuStatusMessage)}</p>`
    : "";
  const geminiStatus = client.geminiTestStatus
    ? `
      <p
        class="menu-api-status ${escapeHtml(client.geminiTestStatus.type)}"
        role="status"
      >${escapeHtml(client.geminiTestStatus.message)}</p>
    `
    : "";
  const llmDiagnostics = isDeveloperMode()
    ? (client.snapshot?.devLlmTrace || [])
      .filter((entry) => entry.scope === "subway")
      .slice(0, 4)
    : [];
  const llmDiagnosticsHtml = llmDiagnostics.length
    ? `
      <section class="menu-llm-diagnostics" aria-label="LLM 생성 진단">
        <strong>DEV · 최근 LLM 생성 진단</strong>
        ${llmDiagnostics.map((entry) => `
          <p class="${escapeHtml(entry.status)}">
            <span>${escapeHtml(entry.stage)}</span>
            ${escapeHtml(entry.message)}
            ${entry.errorReason
              ? `<small>${escapeHtml(entry.errorReason)}</small>`
              : ""}
          </p>
        `).join("")}
      </section>
    `
    : "";
  dom.panelContent.innerHTML = `
    <div class="menu-actions">
      <div class="menu-save-card">
        <span class="menu-save-label">저장 상태</span>
        <strong>${escapeHtml(statusLabel)}</strong>
        ${statusMessage}
      </div>
      <button class="menu-action primary" data-menu-action="save" type="button">
        <span>저장하기</span>
      </button>
      <button class="menu-action" data-menu-action="home" type="button">
        <span>홈으로</span>
      </button>
      <button class="menu-action" data-menu-action="log" type="button">
        <span>기록</span>
      </button>
      <button class="menu-action" data-menu-action="item-codex" type="button">
        <span>아이템 도감</span>
      </button>
      <button
        class="menu-action"
        data-menu-action="test-gemini"
        type="button"
        ${client.geminiTestInFlight ? 'disabled aria-busy="true"' : ""}
      >
        <span>${client.geminiTestInFlight ? "Gemini 연결 확인 중…" : "Gemini API 연결 테스트"}</span>
      </button>
      ${geminiStatus}
      ${llmDiagnosticsHtml}
      <button class="menu-action danger" data-menu-action="new-game" type="button">
        <span>새 게임</span>
      </button>
    </div>
  `;
}

function renderPanel() {
  const config = PANEL_CONFIG[client.activePanel];
  dom.panelTitle.textContent = config.title;
  dom.panelContent.classList.toggle(
    "inventory-panel-content",
    client.activePanel === "inventory",
  );
  if (client.activePanel === "map") {
    renderMapPanel();
  } else if (client.activePanel === "inventory") {
    renderInventoryPanel();
  } else if (client.activePanel === "status") {
    renderStatusPanel();
  } else if (client.activePanel === "quests") {
    renderQuestsPanel();
  } else if (client.activePanel === "log") {
    renderLogPanel();
  } else if (client.activePanel === "itemCodex") {
    renderItemCodexPanel();
  } else {
    renderMenuPanel();
  }
  dom.panelShell.classList.toggle("is-open", client.isPanelOpen);
  dom.panelShell.setAttribute("aria-hidden", client.isPanelOpen ? "false" : "true");
  dom.dockButtons.forEach((button) => {
    const isMenuContent = client.activePanel === "menu" || client.activePanel === "log" || client.activePanel === "itemCodex";
    const isActive = client.isPanelOpen && (
      button.dataset.panel === client.activePanel ||
      (button.dataset.panel === "menu" && isMenuContent)
    );
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-expanded", isActive ? "true" : "false");
  });
  refreshTransientScrollbars();
}

function render(options = {}) {
  if (!client.snapshot) {
    return;
  }
  renderStatusBar();
  renderScene(
    options.animateScene !== false,
    options.appendScene === true,
    options.scrollSceneToStart === true,
  );
  renderPanel();
  renderGameOverScreen();
  client.justCreatedGame = false;
}

async function submitAction(
  action,
  triggerElement = null,
  loading = null,
  postChoiceNarrative = null,
) {
  if (!client.gameId || client.actionInFlight) {
    return;
  }
  if (client.snapshot?.state?.isGameOver) {
    renderGameOverScreen();
    return;
  }
  client.actionInFlight = true;
  client.pendingAction = action;
  const immediateNarrative = normalizePostChoiceNarrative(postChoiceNarrative);
  const hasImmediateNarrative = immediateNarrative.length > 0;
  const transitionDurationMs = hasImmediateNarrative && !loading
    ? 0
    : actionTransitionDurationMs(action, loading);
  const shouldShowTransition = transitionDurationMs > 0;
  const previousSnapshot = client.snapshot;
  try {
    const requestResultPromise = api(`/api/games/${client.gameId}/actions`, {
      method: "POST",
      body: action,
    })
      .then(async (snapshot) => {
        await preloadNextSceneAssets(snapshot);
        return { snapshot, error: null };
      })
      .catch((error) => ({ snapshot: null, error }));
    const shelterStation = shelterStationForAction(action);
    const shelterSceneVisualPromise = shelterStation
      ? playShelterStationTransition(shelterStation)
      : Promise.resolve();
    if (isMovementAction(action, loading)) {
      client.isPanelOpen = false;
      renderPanel();
      resetSceneScrollOnMobile();
    }
    if (shouldShowTransition) {
      beginActionTransition(action, triggerElement, transitionDurationMs, loading);
    }
    const transitionPromise = waitForMilliseconds(transitionDurationMs);
    const immediateNarrativePromise = hasImmediateNarrative
      ? transitionPromise.then(() => beginPostChoiceNarrative(
          immediateNarrative,
          !isMovementAction(action, loading) && !previousSnapshot.state.subwayExpedition?.active,
        ))
      : Promise.resolve();
    const [{ snapshot, error }] = await Promise.all([
      requestResultPromise,
      transitionPromise,
      shelterSceneVisualPromise,
    ]);
    if (error) {
      throw error;
    }
    await immediateNarrativePromise;
    if (needsFreshGame(snapshot)) {
      finishActionTransition();
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
    const didMove = previousSnapshot?.state?.location &&
      snapshot?.state?.location &&
      previousSnapshot.state.location !== snapshot.state.location;
    const newlyCompletedQuests = completedQuestChanges(previousSnapshot, snapshot);
    const continueLocationStory = shouldContinueLocationStory(previousSnapshot, snapshot);
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
    client.mapHint = "";
    client.hasUnsavedProgress = true;
    client.menuStatusMessage = "";
    if (didMove) {
      client.isPanelOpen = false;
    }
    finishActionTransition();
    client.actionInFlight = false;
    client.pendingAction = null;
    render({
      animateScene: hasImmediateNarrative
        ? true
        : shouldAnimateScene({
            source: "action",
            previousSnapshot,
            nextSnapshot: snapshot,
          }),
      appendScene: hasImmediateNarrative || continueLocationStory,
      scrollSceneToStart: continueLocationStory,
    });
    showQuestCompletionBurst(newlyCompletedQuests);
    if (didMove) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "액션 처리에 실패했습니다.");
    clearSceneAnimation();
    client.renderedStorySurfaceId = "";
    finishActionTransition();
    client.actionInFlight = false;
    client.pendingAction = null;
    render({ animateScene: false });
  } finally {
    finishActionTransition();
    client.actionInFlight = false;
    client.pendingAction = null;
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
    const newlyCompletedQuests = completedQuestChanges(previousSnapshot, effectiveSnapshot);
    if (surfaceChanged || noteChanged || actionsChanged) {
      render({
        animateScene: shouldAnimateScene({
          source: "backgroundSync",
          previousSnapshot,
          nextSnapshot: effectiveSnapshot,
        }),
      });
      showQuestCompletionBurst(newlyCompletedQuests);
      return;
    }
    renderStatusBar();
    showQuestCompletionBurst(newlyCompletedQuests);
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
  await showHomeScreen();
  refreshTransientScrollbars();
  window.setInterval(() => {
    renderStatusBar();
  }, CLOCK_TICK_MS);
}

dom.dockButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextPanel = button.dataset.panel;
    if (nextPanel === "status" && client.activePanel !== "status") {
      client.activeStatusPanelView = "status";
      client.activeStatusDetailKey = null;
    }
    client.isPanelOpen = client.activePanel === nextPanel ? !client.isPanelOpen : true;
    client.activePanel = nextPanel;
    renderPanel();
  });
});

["hp", "mind", "energy"].forEach((statKey) => {
  const button = dom[`${statKey}Status`];
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openStatusPopover(statKey);
  });
});

document.addEventListener("pointerup", (event) => {
  const target = event.target instanceof Element
    ? event.target.closest("button, a, [role='button'], [data-map-detail], [data-map-travel], [data-inventory-detail], [data-status-detail]")
    : null;
  if (target && typeof target.blur === "function") {
    target.blur();
  }
}, { passive: true });

document.addEventListener("click", (event) => {
  const clickedElement = event.target instanceof Element ? event.target : null;
  const gameOverAction = clickedElement?.closest("[data-game-over-action]");
  if (gameOverAction) {
    event.preventDefault();
    restartGameFromOverlay();
    return;
  }

  if (!dom.statusPopover.hidden && !dom.statusPopover.contains(event.target)) {
    closeStatusPopover();
  }

  if (!client.isPanelOpen) {
    return;
  }
  const eventPath = typeof event.composedPath === "function" ? event.composedPath() : [];
  const startedInPanel = eventPath.includes(dom.panelShell) || dom.panelShell.contains(event.target);
  const startedInDock = eventPath.some((node) =>
    node instanceof Element && node.classList.contains("utility-dock")
  ) || clickedElement?.closest(".utility-dock");
  if (startedInPanel || startedInDock) {
    return;
  }
  client.isPanelOpen = false;
  renderPanel();
});

window.addEventListener("resize", () => {
  syncMobileChoiceZoneHeight();
  refreshTransientScrollbars();
  if (client.isPanelOpen && client.activePanel === "map") {
    renderMapPanel();
  }
});
window.addEventListener("orientationchange", () => {
  syncMobileChoiceZoneHeight();
  refreshTransientScrollbars();
  if (client.isPanelOpen && client.activePanel === "map") {
    renderMapPanel();
  }
});

dom.sceneFrame.addEventListener("click", (event) => {
  if (event.target.closest(".choice-button, .dock-button, .inline-action, .ghost-button")) {
    return;
  }
  skipSceneTyping();
});

async function startNewGameFromMenu() {
  const confirmed = window.confirm(
    client.hasUnsavedProgress
      ? "저장하지 않은 진행은 이어하기에 반영되지 않습니다. 새 게임을 시작할까요?"
      : "새 게임을 시작할까요?",
  );
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
}

async function goHomeFromMenu() {
  if (client.hasUnsavedProgress) {
    const confirmed = window.confirm("저장하지 않은 진행은 이어하기에 반영되지 않습니다. 홈으로 돌아갈까요?");
    if (!confirmed) {
      return;
    }
  }
  await showHomeScreen();
}

async function startNewGameFromHome() {
  if (client.actionInFlight) {
    return;
  }
  client.actionInFlight = true;
  clearSceneAnimation();
  try {
    await createNewGame();
    client.actionInFlight = false;
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
  } finally {
    client.actionInFlight = false;
  }
}

dom.homeNewGame.addEventListener("click", startNewGameFromHome);

dom.homeContinue.addEventListener("click", () => {
  continueSavedGame();
});

dom.homeFullscreenPlay.addEventListener("click", async () => {
  if (client.actionInFlight || client.fullscreenLaunchInFlight) {
    return;
  }

  client.fullscreenLaunchInFlight = true;
  dom.homeFullscreenPlay.disabled = true;
  try {
    const shouldContinue = activeHomeSaveInfo().exists;
    await requestGameFullscreen();
    if (shouldContinue) {
      await continueSavedGame();
    } else {
      await startNewGameFromHome();
    }
  } finally {
    client.fullscreenLaunchInFlight = false;
    dom.homeFullscreenPlay.disabled = false;
  }
});

dom.homeLogout.addEventListener("click", async () => {
  if (client.actionInFlight) {
    return;
  }
  client.actionInFlight = true;
  try {
    await api("/api/auth/logout", {
      method: "POST",
      body: {},
    });
    client.authInfo = null;
    await refreshAuthInfo();
    await refreshHomeSaveInfo();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "로그아웃하지 못했습니다.");
  } finally {
    client.actionInFlight = false;
  }
});

dom.panelContent.addEventListener("click", (event) => {
  const statusViewButton = event.target.closest("[data-status-view]");
  if (statusViewButton) {
    client.activeStatusPanelView = statusViewButton.dataset.statusView;
    if (client.activeStatusPanelView !== "status") {
      client.activeStatusDetailKey = null;
    }
    client.activePanel = "status";
    client.isPanelOpen = true;
    renderPanel();
    return;
  }

  const statusDetailButton = event.target.closest("[data-status-detail]");
  if (statusDetailButton) {
    const nextDetailKey = statusDetailButton.dataset.statusDetail;
    client.activeStatusDetailKey =
      client.activeStatusDetailKey === nextDetailKey ? null : nextDetailKey;
    client.activePanel = "status";
    client.isPanelOpen = true;
    renderPanel();
    return;
  }

  const completedQuestsToggleButton = event.target.closest("[data-completed-quests-toggle]");
  if (completedQuestsToggleButton) {
    client.isCompletedQuestGroupOpen = !client.isCompletedQuestGroupOpen;
    client.activePanel = "quests";
    client.isPanelOpen = true;
    renderPanel();
    return;
  }

  const actionButton = event.target.closest("[data-menu-action]");
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.menuAction;
  if (action === "save") {
    saveCurrentGameFromMenu();
    return;
  }
  if (action === "home") {
    goHomeFromMenu();
    return;
  }
  if (action === "log") {
    client.activePanel = "log";
    client.isPanelOpen = true;
    renderPanel();
    return;
  }
  if (action === "item-codex") {
    client.activePanel = "itemCodex";
    client.isPanelOpen = true;
    renderPanel();
    return;
  }
  if (action === "test-gemini") {
    testGeminiConnectionFromMenu();
    return;
  }
  if (action === "new-game") {
    startNewGameFromMenu();
  }
});

window.render_game_to_text = () => JSON.stringify({
  mode: client.isHomeVisible ? "home" : "game",
  gameId: client.gameId || null,
  savedGameId: savedGameId() || null,
  isLoggedIn: isLoggedIn(),
  authUser: client.authInfo?.user || null,
  saveInfo: client.saveInfo,
  accountSaveInfo: client.authInfo?.saveInfo || null,
  hasUnsavedProgress: client.hasUnsavedProgress,
  activePanel: client.activePanel,
  sceneId: client.snapshot?.currentScene?.id || null,
  location: client.snapshot?.state?.location || null,
  day: client.snapshot?.state?.day || null,
  time: client.snapshot ? gameClockLabel() : null,
  skillProgress: (client.snapshot?.skillProgress || []).map((skill) => ({
    id: skill.id,
    level: skill.level,
    totalXp: skill.totalXp,
    nextTarget: skill.isMaxLevel
      ? "MAX"
      : Number(skill.totalXp) - Number(skill.xpIntoLevel) + Number(skill.xpForNextLevel),
    effectPercent: skill.effectPercent,
  })),
  subwayExpedition: client.snapshot?.state?.subwayExpedition || null,
  actionTransition: client.actionInFlight
    ? {
        message: client.actionTransitionMessage,
        elapsedMs: Math.max(0, Date.now() - client.actionTransitionStartedAt),
        durationMs: client.actionTransitionDurationMs,
        action: client.pendingAction,
      }
    : null,
  sceneVisual: dom.sceneFrame.classList.contains("has-shelter-scene-visual")
    ? sceneDirector.snapshot()
    : null,
});

sceneDirector.preloadShelter().catch((error) => console.warn(error));
bootstrap().catch((error) => {
  console.error(error);
  dom.homeScreen.hidden = false;
  dom.appShell.hidden = true;
  document.body.classList.add("home-active");
  dom.homeSaveStatus.textContent = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  dom.homeContinue.disabled = true;
  dom.sceneText.innerHTML = `<p>서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
  dom.panelContent.innerHTML = `<p class="empty-state">API 서버가 필요합니다.</p>`;
});
