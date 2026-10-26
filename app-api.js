import { readActionStream } from "./action-stream-client.mjs";
import { assetUrl, queueAssets, pauseAssetWarmup, prioritizeAsset } from "./client/asset-loader.mjs";

const SAVED_GAME_ID_KEY = "ruined-seoul-stage1-manual-save-game-id-v1";
const PENDING_ACTION_KEY = "textrpg-pending-text-action-v1";
const LEGACY_STORAGE_KEYS = [
  "ruined-seoul-stage1-game-id",
  "ruined-seoul-stage1-game-id-v12",
  "ruined-seoul-stage1-game-id-v11",
  "ruined-seoul-stage1-game-id-v10",
  "ruined-seoul-stage1-game-id-v9",
  "ruined-seoul-stage1-game-id-v8",
  "ruined-seoul-stage1-game-id-v7",
];
const REAL_DAY_MS = 30 * 60 * 1000;
const clockClientId = crypto.randomUUID();
let clockSequence = 0;
const GAME_MINUTE_MS = REAL_DAY_MS / (24 * 60);
const CLOCK_TICK_MS = 1000;
const TYPEWRITER_CHAR_DELAY = 20;
const TYPEWRITER_PARAGRAPH_DELAY = 260;
const ACTION_TRANSITION_ACTION_MS = 1000;
const ACTION_TRANSITION_MOVEMENT_MS = 1000;
const ACTION_ASSET_PRELOAD_TIMEOUT_MS = 1200;
const SCENE_IMAGE_CACHE_LIMIT = 8;
const sceneImageCache = new Map();
const preparedScenePresentations = new WeakMap();
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
// Landmark cells retain the original 4 x 3 terrain atlas ordering.
const MAP_TERRAIN_CELLS = {
  shelter: 0,
  convenience: 1,
  kitchen: 2,
  forest: 3,
  subway: 4,
  hospital: 5,
  checkpoint: 6,
  magic_city_entrance: 7,
  arcana_plaza: 8,
  arcana_hunting_ground: 9,
};

// Alpha bounds measured from each sprite; fit the complete object inside the hex.
const MAP_LANDMARK_BOUNDS = [
  [24, 97, 333, 251], [377, 55, 347, 307], [724, 68, 362, 294], [1086, 66, 334, 296],
  [47, 433, 283, 291], [387, 362, 337, 335], [743, 362, 343, 362], [1086, 362, 335, 351],
  [27, 724, 335, 310], [362, 737, 360, 292], [748, 724, 338, 298], [1086, 810, 312, 187],
];

// Magic locations share the reality map's hex layout, ground layer and selection states.
const MAGIC_MAP_LANDMARKS = {
  arcana_plaza: { file: "fountain", bounds: [24, 85, 1205, 1054] },
  arcana_shop: { file: "shop", bounds: [101, 85, 1106, 1054] },
  arcana_inn: { file: "inn", bounds: [91, 70, 1097, 1092] },
  arcana_restaurant: { file: "restaurant", bounds: [70, 50, 1114, 1166] },
  arcana_return_portal: { file: "portal", bounds: [262, 47, 803, 1160] },
};

// A seven-cell downtown is painted once; logical cells remain selectable.
const ARCANA_DOWNTOWN_LOCATIONS = new Set([
  "arcana_plaza", "arcana_shop", "arcana_inn",
  "arcana_restaurant", "arcana_return_portal", "arcana_city_gate", "arcana_academy",
]);

function hexTerrainMarkup(locationId, size) {
  const magicLandmark = MAGIC_MAP_LANDMARKS[locationId];
  const cell = MAP_TERRAIN_CELLS[locationId] ?? 10;
  const bounds = magicLandmark?.bounds || MAP_LANDMARK_BOUNDS[cell];
  const href = assetUrl(magicLandmark
    ? "assets/arcana-map/sprites/" + magicLandmark.file + ".png"
    : "assets/map-landmarks-v2.png");
  const imageWidth = magicLandmark ? 1254 : 1448;
  const imageHeight = magicLandmark ? 1254 : 1086;
  const shadowMarkup = magicLandmark
    ? '<ellipse cx="0" cy="' + (size * 0.48) + '" rx="' + (size * 0.44) + '" ry="' + (size * 0.09)
      + '" fill="#655546" opacity=".19" filter="url(#map-landmark-contact)" />'
    : "";

  return '<g class="hex-tile-art" aria-hidden="true">' + shadowMarkup + '<svg x="' + (-size * 0.65)
    + '" y="' + (-size * 0.58) + '" width="' + (size * 1.3) + '" height="' + (size * 1.16)
    + '" viewBox="' + bounds.join(" ") + '" preserveAspectRatio="xMidYMid meet" overflow="hidden">'
    + '<image href="' + href + '" width="' + imageWidth + '" height="' + imageHeight + '" /></svg></g>';
}

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
  const viewport = dom.panelContent?.querySelector(".hex-map-viewport");
  const panelWidth = viewport?.clientWidth || dom.panelContent?.clientWidth || Math.min(window.innerWidth, 520);
  const panelHeight = dom.panelContent?.clientHeight || Math.min(window.innerHeight * 0.62, 620);
  const viewportHeight = viewport?.clientHeight || Math.max(100, panelHeight - 160);
  return {
    width: Math.max(120, panelWidth - 24),
    height: Math.max(80, viewportHeight - 24),
  };
}

function mapFitScale(boardLayout) {
  const available = mapAvailableSize();
  const widthScale = available.width / Math.max(1, boardLayout.pixelWidth);
  const heightScale = available.height / Math.max(1, boardLayout.pixelHeight);
  return clampNumber(Math.min(widthScale, heightScale), 0.18, 1.24);
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
  exploration: { title: "주변과 물건" },
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
    note: "시간이 지나면 줄어들고 음식으로 회복합니다. 기력 0으로 보낸 시간이 12시간 쌓이면 탈진 +1단계, Lv4에서는 생존이 끝납니다. 기력을 회복하면 진행이 멈춥니다.",
  },
};

function isMagicWorldState(state = currentState()) {
  return Boolean(state?.flags?.in_magic_world);
}

function usesArcanaStatus(state = currentState()) { return Boolean(state?.flags?.in_magic_world && state.arcanaCombat && !state.magicDungeon?.run); }
function magicExperience(state = currentState()) {
  if (!isMagicWorldState(state)) return null;
  const inDungeon = Boolean(state.magicDungeon?.run);
  const growth = inDungeon ? state.magicDungeon : state.arcanaCombat;
  if (!growth) return null;
  const capped = inDungeon && growth.level >= 50;
  const max = capped ? 1 : (inDungeon ? 40 : 30) + (growth.level - 1) * 15;
  return { level: growth.level, value: capped ? 1 : growth.xp, max, capped };
}
function statusValue(statKey, state = currentState()) {
  const experience = statKey === "energy" ? magicExperience(state) : null;
  if (experience) return experience.value;
  if (statKey === "power") return 10 + (state.arcanaCombat.level - 1) * 2;
  const value = usesArcanaStatus(state) && statKey !== "energy" ? state.arcanaCombat[statKey === "mind" ? "mp" : "hp"] : state.stats[statKey];
  return Math.round(value * 10) / 10;
}
function arcanaFireballDamage(state = currentState()) {
  return Math.floor(statusValue("power", state) * 0.5);
}
function statusDetailFor(statKey, state = currentState()) {
  const experience = statKey === "energy" ? magicExperience(state) : null;
  if (experience) return { title: "경험치", max: experience.max, valueText: experience.capped ? "MAX" : null,
    note: experience.capped ? "최고 레벨 Lv." + experience.level : "Lv." + experience.level + " · 다음 레벨까지 경험치 " + Math.max(0, experience.max - experience.value) + " 필요" };
  if (usesArcanaStatus(state)) {
    const c = state.arcanaCombat;
    if (statKey === "power") return { title: "마력", max: null, note: "파이어볼 피해 = 마력 " + statusValue("power", state) + " × 50% = " + arcanaFireballDamage(state) };
    if (statKey === "hp") return { title: "HP", max: 100 + (c.level - 1) * 10, note: "여관에서 체력을 회복할 수 있습니다." };
    if (statKey === "mind") return { title: "MP", max: 30 + (c.level - 1) * 3, note: "게임 시간당 MP " + c.manaRegenPerHour + " 회복 · 마나 포션으로 20 회복" };
  }
  if (statKey === "mind" && isMagicWorldState(state)) return { title: "MP", max: 10, note: "마법과 룬을 다룰 때 소모되는 마력" };
  return STATUS_DETAILS[statKey];
}
function statusDisplayValue(statKey, state = currentState()) {
  const detail = statusDetailFor(statKey, state);
  return detail.valueText || (detail.max === null ? String(statusValue(statKey, state)) : statusValue(statKey, state) + " / " + detail.max);
}

const dom = {
  homeScreen: document.querySelector("#home-screen"),
  homeNewGame: document.querySelector("#home-new-game"),
  homeArcanaStart: document.querySelector("#home-arcana-start"),
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
  explorationToggle: document.querySelector("#exploration-toggle"),
  choiceTemplate: document.querySelector("#choice-template"),
  gameOverScreen: null,
  panelShell: document.querySelector(".panel-shell"),
  panelContent: document.querySelector("#panel-content"),
  dockButtons: Array.from(document.querySelectorAll(".dock-button")),
};

let activeSceneDirector = null;
let sceneDirectorLoadError = null;
let sceneDirectorPromise = null;
function ensureSceneDirector() {
  return sceneDirectorPromise ??= import("./client/graphics/scene-director.js")
  .then(({ SceneDirector }) => {
    activeSceneDirector = new SceneDirector({
      canvas: dom.sceneAnimation,
      host: dom.sceneFrame,
    });
    return activeSceneDirector;
  })
  .catch((error) => {
    sceneDirectorLoadError = error instanceof Error ? error.message : String(error);
    sceneDirectorPromise = null;
    throw error;
  });
}

const sceneDirector = {
  preloadShelter() {
    return ensureSceneDirector().then((director) => director.preloadShelter());
  },
  showShelterAtStation(station, options) {
    return ensureSceneDirector().then((director) =>
      director.showShelterAtStation(station, options)
    );
  },
  moveShelterActor(station, options) {
    return ensureSceneDirector().then((director) =>
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
  explorationTargetId: null,
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
  syncInFlight: false,
  syncFailures: 0,
  syncRetryAt: 0,
  apiRetryAt: 0,
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
  lastActionTiming: null,
  sceneImageSource: "",
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
  const live = !document.hidden && !client.isHomeVisible && !state.activeClock?.paused && state.activeClock?.ownerId === clockClientId;
  return (state.worldElapsedMs || 0) + (live ? Math.min(5000, Math.max(0, Date.now() - (client.lastFetchedAt || Date.now()))) : 0);
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

function rateLimitError(retryAt) {
  const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  const error = new Error(`요청이 잠시 제한되었습니다. ${seconds}초 뒤 다시 시도해 주세요.`);
  error.status = 429;
  error.retryAt = retryAt;
  return error;
}

async function api(path, options = {}) {
  if (Date.now() < client.apiRetryAt) throw rateLimitError(client.apiRetryAt);
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
      const retryAt = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(retryAfter);
      client.apiRetryAt = Math.max(client.apiRetryAt, Number.isFinite(retryAt) ? Math.max(Date.now() + 1000, retryAt) : Date.now() + 30000);
      console.warn(`HTTP 429: ${options.method || "GET"} ${path}`);
      throw rateLimitError(client.apiRetryAt);
    }
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.headers.get("content-type")?.includes("application/x-ndjson")
    ? readActionStream(response, options.onEvent, options.headers?.["X-Action-Id"])
    : response.json();
}

async function requestTextWorldAction(action, onEvent) {
  const gameId = client.gameId, requestId = crypto.randomUUID();
  let settled = false;
  try { window.sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({ gameId, requestId })); } catch { /* Storage may be disabled. */ }
  try {
    const snapshot = await api(`/api/games/${gameId}/actions`, { method: "POST", body: action,
      headers: { Accept: "application/x-ndjson", "X-Action-Id": requestId }, onEvent });
    settled = true;
    return snapshot;
  } catch (error) {
    // Read the committed receipt after a lost connection; never execute the action again here.
    if (!error.status) {
      try { const snapshot = await api(`/api/games/${gameId}/actions/${requestId}`); settled = true; return snapshot; }
      catch (recoveryError) { settled = recoveryError.status === 404; }
    }
    if (error.status >= 400 && error.status < 500) settled = true;
    throw error;
  } finally {
    if (settled) try { window.sessionStorage.removeItem(PENDING_ACTION_KEY); } catch { /* Storage may be disabled. */ }
  }
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
  // Existing content sends the former 500 ms default; render it with the current pacing.
  const activityDuration = Number.isFinite(loading?.durationMs)
    ? loading.durationMs === 500 ? ACTION_TRANSITION_ACTION_MS : Math.max(0, loading.durationMs)
    : ACTION_TRANSITION_ACTION_MS;
  if (isMovementAction(action, loading)) {
    return ACTION_TRANSITION_MOVEMENT_MS;
  }
  if (action?.type === "text_world" || action?.type === "npc_dialogue") {
    return activityDuration;
  }
  if (action?.type === "use_item" || action?.type === "item_light") {
    return ACTION_TRANSITION_ACTION_MS;
  }
  if (action?.type === "subway_expedition" && ["search_loot", "encounter_choice"].includes(action.command)) {
    return activityDuration;
  }
  if (!loading) {
    return 0;
  }
  return activityDuration;
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
  if (action.type === "use_item" || action.type === "item_light") {
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
    "#exploration-toggle",
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
  const visualTarget = ["use_item", "item_light"].includes(action?.type)
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
    visualTarget.setAttribute("aria-busy", "true");
    visualTarget.classList.toggle("is-choice-surface-pending", usesInlineSurfaceFill);
    client.pendingActionProgressElement = progressTrack;
  }
}

function finishActionTransition() {
  client.pendingActionStatusElement?.remove();
  client.pendingActionProgressElement?.remove();
  client.pendingActionSceneElement?.remove();
  client.pendingActionElement?.classList.remove("is-action-pending");
  client.pendingActionElement?.removeAttribute("aria-busy");
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

function sceneImageSource(location) {
  // Use the same address for prediction, preloading, and display of old saves.
  const source = location?.imagePath || "assets/scenes/camp.svg";
  return assetUrl(source.replace(/^\/?assets\/scenes\/forest\.svg$/, "assets/scenes/forest-pencil-charcoal.png"));
}

function preloadImage(source) {
  source = prioritizeAsset(source);
  if (!source) return Promise.resolve(null);
  const cached = sceneImageCache.get(source);
  if (cached) {
    sceneImageCache.delete(source);
    sceneImageCache.set(source, cached);
    return cached.promise;
  }
  const image = new Image();
  const entry = { image, ready: false, promise: null };
  entry.promise = new Promise((resolve) => {
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      if (!image.naturalWidth) {
        if (sceneImageCache.get(source) === entry) sceneImageCache.delete(source);
        resolve(null);
        return;
      }
      // Retain the decoded image itself so displaying it does not start another load.
      if (typeof image.decode === "function") await image.decode().catch(() => undefined);
      entry.ready = true;
      resolve(image);
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    image.src = source;
    if (image.complete) Promise.resolve().then(finish);
  });
  sceneImageCache.set(source, entry);
  while (sceneImageCache.size > SCENE_IMAGE_CACHE_LIMIT) {
    sceneImageCache.delete(sceneImageCache.keys().next().value);
  }
  return entry.promise;
}

function displaySceneImage(source) {
  client.sceneImageSource = source;
  const show = (image) => {
    if (client.sceneImageSource !== source) return;
    if (!image) {
      dom.sceneArt.hidden = true;
      return;
    }
    if (image !== dom.sceneArt) {
      for (const { name, value } of Array.from(dom.sceneArt.attributes)) {
        if (name !== "src") image.setAttribute(name, value);
      }
      dom.sceneArt.replaceWith(image);
      dom.sceneArt = image;
    }
    dom.sceneArt.hidden = false;
  };
  const cached = sceneImageCache.get(source);
  if (cached?.ready) {
    show(cached.image);
    return;
  }
  // After the loading deadline, show the text without a wrong location image.
  dom.sceneArt.hidden = true;
  void preloadImage(source).then(show);
}

function preloadActionSceneAssets(action, snapshot) {
  const targetId = action?.type === "travel" ? action.targetId : snapshot?.state?.location;
  const location = snapshot?.visibleLocations?.find((entry) => entry.id === targetId);
  if (location) void preloadImage(sceneImageSource(location));
}

async function preloadNextSceneAssets(snapshot) {
  let timer;
  try {
    await Promise.race([
      preloadImage(sceneImageSource(snapshotLocationCard(snapshot))),
      new Promise((resolve) => {
        timer = window.setTimeout(resolve, ACTION_ASSET_PRELOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function prepareScenePresentation(snapshot) {
  let prepared = preparedScenePresentations.get(snapshot);
  if (!prepared) {
    prepared = { story: buildStoryDisplay(snapshot), choices: null, recipeDetailId: null };
    preparedScenePresentations.set(snapshot, prepared);
  }
  if (!prepared.choices || prepared.recipeDetailId !== client.activeCraftingRecipeDetailId) {
    prepared.choices = buildChoicePresentation(snapshot);
    prepared.recipeDetailId = client.activeCraftingRecipeDetailId;
  }
  return prepared;
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
  client.syncTimer = window.setInterval(backgroundSync, 1000);
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
    console.info("전체화면으로 전환하지 못했습니다.", error);
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
    "전체화면",
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
  pauseVisibleGame();
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

async function createNewGame(startAt = "shelter") {
  pauseAssetWarmup(true);
  void preloadImage(startAt === "arcana" ? "assets/scenes/arcana-plaza.png" : "assets/scenes/shelter.png");
  const snapshot = await api("/api/games", {
    method: "POST",
    body: { startAt },
  }).finally(() => pauseAssetWarmup(false));
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
  // 텍스트 탐색은 기본 sceneId를 유지하므로 결과 장면의 revision으로 구분한다.
  if (currentSceneId(snapshot).startsWith("text-world:")) {
    return `scene:${currentSceneId(snapshot)}`;
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
      source: ev.source,
    };
  }
  return {
    headline: "",
    paragraphs: (snapshot.currentScene.paragraphs || []).filter((paragraph) => String(paragraph).trim()),
    source: new Set(snapshot.currentScene.paragraphSources).size > 1 ? "mixed" : snapshot.currentScene.source,
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

function beginPostChoiceNarrative(paragraphs, append = false, source = "template", keepChoices = false) {
  clearSceneAnimation();
  const story = { headline: "", paragraphs, source };
  const token = client.sceneRenderToken;
  return animateStoryText(story, token, null, {
    append,
    scrollToStart: append,
    revealChoices: false,
    keepChoices,
  });
}

function captureSceneHistory() {
  return {
    blocks: [...dom.sceneText.children], systemNote: dom.systemNote,
    noteKey: client.renderedSystemNoteKey,
    hasHistory: dom.sceneText.classList.contains("has-story-history"),
  };
}

function restoreSceneHistory(saved) {
  dom.sceneText.replaceChildren(...saved.blocks);
  dom.sceneText.classList.toggle("has-story-history", saved.hasHistory);
  dom.systemNote = saved.systemNote;
  dom.systemNote.id = "system-note";
  dom.systemNote.setAttribute("role", "status");
  client.renderedSystemNoteKey = saved.noteKey;
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
  if (nextSnapshot?.state?.magicDungeon?.run) return false;
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
  if (nextSnapshot?.state?.magicDungeon?.run || previousSnapshot?.state?.magicDungeon?.run || nextSnapshot?.state?.arcanaCombat?.battle || previousSnapshot?.state?.arcanaCombat?.battle) return false;
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
    || previousSnapshot.state.location !== nextSnapshot.state?.location) {
    return false;
  }
  const before = previousSnapshot.state.subwayExpedition;
  const after = nextSnapshot.state.subwayExpedition;
  if (before?.active || after?.active) {
    if (!before?.active || !after?.active || before.runNumber !== after.runNumber
      || !before.currentFloor?.id || before.currentFloor.id !== after.currentFloor?.id) return false;
  }
  return storySurfaceId(previousSnapshot) !== storySurfaceId(nextSnapshot)
    || JSON.stringify(buildStoryDisplay(previousSnapshot)) !== JSON.stringify(buildStoryDisplay(nextSnapshot));
}

function availableActionsSignature(snapshot) {
  const list = snapshot?.availableActions ?? [];
  // id만 보면 라벨·힌트만 바뀐 서버 응답에서 actionsChanged가 false가 되어 선택지 DOM이 갱신되지 않는다.
  return list
    .map((choice) => `${choice.id}:${choice.label}:${choice.outcomeHint ?? ""}:${choice.showOutcomeHint ? "1" : "0"}:${choice.isAvailable ? "1" : "0"}:${choice.statusLabel ?? ""}:${choice.remainingUses ?? ""}:${JSON.stringify(choice.loading || null)}:${JSON.stringify(choice.craftingRecipe || null)}:${JSON.stringify(choice.postChoiceNarrative || null)}:${choice.postChoiceNarrativeSource ?? ""}:${choice.choiceThought ?? ""}:${choice.action?.activityRevision ?? choice.serverActionHint?.activityRevision ?? ""}`)
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
  if (client.snapshot?.state?.magicDungeon?.run || !window.matchMedia("(max-width: 620px)").matches || !dom.choices.childElementCount) {
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

function createSceneStoryBlock(append, source, continueBlock = false) {
  const previousBlock = append && continueBlock ? dom.sceneText.lastElementChild : null;
  const hasHistory = append && dom.sceneText.childElementCount > 0;
  if (!append) {
    dom.sceneText.replaceChildren();
    client.renderedSystemNoteKey = "";
  }
  dom.sceneText.classList.toggle("has-story-history", hasHistory);
  const block = document.createElement("div");
  block.className = previousBlock ? "scene-story-continuation" : "scene-story-block";
  if (source === "llm" || source === "template" || source === "mixed") {
    const sourceLabel = document.createElement("div");
    sourceLabel.className = `scene-narrative-source is-${source}`;
    sourceLabel.textContent = source === "mixed" ? "LLM 생성 · 기본 서사 보완" : source === "llm" ? "LLM 생성" : "기본 서사";
    sourceLabel.title = source === "mixed" ? "검사를 통과한 생성 문단은 유지하고, 필요한 부분을 기본 서사로 보완했습니다." : source === "llm"
      ? "LLM이 생성한 서사입니다."
      : "게임에 정의된 기본 서사입니다. 재확인이나 생성 실패 시에도 사용합니다.";
    block.appendChild(sourceLabel);
  }
  // Reading space belongs to the outer block; prose and all results share natural height.
  const content = document.createElement("div");
  content.className = "scene-story-content";
  const prose = document.createElement("div");
  prose.className = "scene-prose";
  content.appendChild(prose);
  createSceneSystemNote(content);
  block.appendChild(content);
  (previousBlock || dom.sceneText).appendChild(block);
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
  const block = createSceneStoryBlock(append, story.source, options.continueBlock === true);
  const prose = block.querySelector(".scene-prose");
  client.activeAnimatedStory = story;
  client.activeAnimatedSystemNote = systemNotePayload;
  client.activeStoryAnimationOptions = { append, revealChoices, block, scrollToStart: options.scrollToStart === true };
  client.isSceneTyping = true;
  dom.sceneFrame.classList.add("is-story-typing");
  if (!options.keepChoices) {
    dom.choices.innerHTML = "";
    dom.choices.classList.remove("revealed");
  }
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
  // The reading position was aligned when the action started. Skipping only completes its text.
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
  for (const [key, label] of [["injuryRelief", "부상"], ["infectionRelief", "감염"], ["exhaustionRelief", "탈진"]]) {
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
              ${escapeHtml(entry.name)} (${entry.ownedAmount}/${entry.requiredAmount})${entry.storedAmount ? ` · 보관함 ${entry.storedAmount}` : ""}
            </span>
          `).join("")}
        </span>
      </span>
    `
    : "";
  const sourceRows = requirements.filter(entry => !entry.met && entry.sourceHints?.length);
  const sourceHtml = sourceRows.length ? `<span class="crafting-recipe-row is-sources"><span class="crafting-recipe-label">준비 방법</span><span class="crafting-recipe-source-list">${sourceRows.map(entry => `<span>${escapeHtml(entry.name)}: ${entry.sourceHints.map(escapeHtml).join(" / ")}</span>`).join("")}</span></span>` : "";
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
      ${sourceHtml}
    </span>
  `;
}

function buildCraftingChoices(snapshot, container, { isCookingMenu = false } = {}) {
  const recipeChoices = snapshot.availableActions.filter((choice) =>
    !["leave_shelter_crafting", "leave_shelter_cooking"].includes(choice.id) && choice.craftingRecipe
  );
  const otherChoices = snapshot.availableActions.filter((choice) =>
    ["leave_shelter_crafting", "leave_shelter_cooking"].includes(choice.id) || !choice.craftingRecipe
  );
  const selectedChoice = recipeChoices.find((choice) => choice.id === client.activeCraftingRecipeDetailId) || recipeChoices[0] || null;
  const selectedRecipeId = selectedChoice?.id || null;

  if (selectedChoice?.craftingRecipe) {
    const detail = document.createElement("section");
    detail.className = `crafting-recipe-panel${isCookingMenu ? " is-cooking-menu" : ""}`;
    detail.setAttribute("aria-live", "polite");
    const detailHeadMeta = isCookingMenu
      ? `<span class="crafting-recipe-effect">${escapeHtml(selectedChoice.craftingRecipe.effect)}</span>`
      : `
        <span class="crafting-recipe-state ${selectedChoice.isAvailable ? "is-met" : "is-missing"}">
          ${escapeHtml(selectedChoice.statusLabel || (selectedChoice.isAvailable ? "제작 가능" : "조건 미충족"))}
        </span>
      `;
    detail.innerHTML = `
      <div class="crafting-recipe-panel-head">
        <strong>${escapeHtml(selectedChoice.label)}</strong>
        ${detailHeadMeta}
      </div>
      ${craftingRecipeMetaHtml(selectedChoice.craftingRecipe, { showEffect: !isCookingMenu })}
    `;
    container.appendChild(detail);
  }

  const createCraftButton = (choice, { menuFooter = false } = {}) => {
    const craftButton = document.createElement("button");
    craftButton.className = [
      "inline-action",
      "crafting-choice-submit",
      menuFooter ? "is-recipe-menu-submit" : "",
    ].filter(Boolean).join(" ");
    craftButton.type = "button";
    craftButton.disabled = choice.isAvailable === false;
    craftButton.textContent = menuFooter
      ? isCookingMenu ? "요리하기" : "제작하기"
      : choice.craftingRecipe.actionLabel || "제작";
    craftButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitAction(
        choice.action,
        craftButton,
        choice.loading,
        choice.postChoiceNarrative,
        choice.postChoiceNarrativeSource,
        choice.choiceThought,
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
      choice.id === selectedRecipeId ? "is-active" : "",
    ].filter(Boolean).join(" ");

    const selectButton = document.createElement("button");
    selectButton.className = "crafting-choice-select";
    selectButton.type = "button";
    selectButton.setAttribute("aria-pressed", choice.id === selectedRecipeId ? "true" : "false");
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

  container.appendChild(recipeGrid);

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
    button.disabled = choice.isAvailable === false;
    button.addEventListener("click", () => submitAction(
      choice.action,
      button,
      choice.loading,
      choice.postChoiceNarrative,
      choice.postChoiceNarrativeSource,
      choice.choiceThought,
    ));
    if (isRecipeMenuExit) {
      recipeMenuExitButton = button;
    } else {
      container.appendChild(fragment);
    }
  });

  if (recipeMenuExitButton) {
    const footer = document.createElement("div");
    footer.className = "recipe-menu-footer";
    footer.appendChild(recipeMenuExitButton);
    if (selectedChoice) {
      footer.appendChild(createCraftButton(selectedChoice, { menuFooter: true }));
    }
    container.appendChild(footer);
  }
  return selectedRecipeId;
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
  const detail = statusDetailFor(statKey, snapshot);
  const value = statusDisplayValue(statKey, snapshot);

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

  window.ArcanaCombatUI?.updateChoices(client.snapshot, client.actionInFlight);
  if (window.ArcanaCombatUI) window.ArcanaCombatUI.onAction = action => submitAction(action);
  window.MagicDungeonUI?.render(snapshot);
  window.MagicDungeonUI?.updateChoices(client.snapshot, client.actionInFlight);
  if (window.MagicDungeonUI) window.MagicDungeonUI.onAction = action => submitAction(action);

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
  const hpMax = statusDetailFor("hp", snapshot).max;
  const hpValue = statusValue("hp", snapshot), mindValue = statusValue("mind", snapshot);
  const mindDetail = statusDetailFor("mind", snapshot);
  const mindMax = mindDetail.max;
  const energyDetail = statusDetailFor("energy", snapshot);
  const energyMax = energyDetail.max, energyValue = statusValue("energy", snapshot);
  const experience = magicExperience(snapshot);
  dom.hpFill.style.width = `${Math.max(0, Math.min(100, (hpValue / hpMax) * 100))}%`;
  dom.mindFill.style.width = `${Math.max(0, Math.min(100, (mindValue / mindMax) * 100))}%`;
  dom.energyFill.style.width = `${Math.max(0, Math.min(100, (energyValue / energyMax) * 100))}%`;
  dom.hpStatus.setAttribute("aria-label", `체력 ${hpValue} / ${hpMax}`);
  dom.mindStatus.setAttribute("aria-label", `${mindDetail.title} ${mindValue} / ${mindMax}`);
  dom.mindStatus.classList.toggle("is-magic-stat", isMagicWorldState(snapshot));
  const mindHiddenLabel = dom.mindStatus.querySelector(".visually-hidden");
  if (mindHiddenLabel) {
    mindHiddenLabel.textContent = mindDetail.title;
  }
  dom.energyStatus.setAttribute("aria-label", energyDetail.title + " " + statusDisplayValue("energy", snapshot) + (experience ? " · Lv." + experience.level : ""));
  dom.energyStatus.classList.toggle("is-experience", Boolean(experience));
  const energyHiddenLabel = dom.energyStatus.querySelector(".visually-hidden");
  if (energyHiddenLabel) energyHiddenLabel.textContent = energyDetail.title;
  applyStatusSeverity(dom.hpStatus, hpValue / hpMax * 10);
  applyStatusSeverity(dom.mindStatus, mindValue / mindMax * 10);
  applyStatusSeverity(dom.energyStatus, experience ? 15 : snapshot.stats.energy);
  const nextWorldElapsedMs = Math.max(0, snapshot.worldElapsedMs || 0);
  const didTimeAdvance = client.renderedWorldElapsedMs !== null
    && nextWorldElapsedMs > client.renderedWorldElapsedMs;
  const clockLabel = gameClockLabel();
  const [clockHours, clockMinutes] = clockLabel.split(":").map(Number);
  const dayProgress = ((clockHours * 60 + clockMinutes) / (24 * 60)) * 100;
  dom.timeIndicator.textContent = `D${snapshot.day} ${clockLabel}`;
  dom.timeStatus.style.setProperty("--day-progress", `${dayProgress}%`);
  client.renderedWorldElapsedMs = nextWorldElapsedMs;
  if (didTimeAdvance && client.pendingAction && client.pendingAction.type !== "world_clock") {
    emphasizeAdvancedTime();
  }

  if (client.activeStatusPopoverKey) {
    openStatusPopover(client.activeStatusPopoverKey, { toggle: false });
  }
}

function buildChoicePresentation(snapshot) {
  const element = document.createDocumentFragment();
  const isRecipeMenu = snapshot.availableActions.some((choice) => choice.craftingRecipe);
  const isCookingMenu = snapshot.availableActions.some((choice) => choice.id === "leave_shelter_cooking");
  const presentation = { element, isRecipeMenu, isCookingMenu, selectedRecipeId: null };
  if (snapshot.state.isGameOver) return presentation;
  if (isRecipeMenu) {
    presentation.selectedRecipeId = buildCraftingChoices(snapshot, element, { isCookingMenu });
    return presentation;
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
    if (choice.action?.type === "magic_dungeon") button.dataset.dungeonChoice = choice.id;
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
    button.disabled = choice.isAvailable === false;
    button.addEventListener("click", () => submitAction(
      choice.action,
      button,
      choice.loading,
      choice.postChoiceNarrative,
      choice.postChoiceNarrativeSource,
      choice.choiceThought,
    ));
    element.appendChild(fragment);
  });

  return presentation;
}

function renderChoices() {
  const snapshot = client.snapshot;
  if (window.ArcanaCombatUI?.updateChoices(snapshot, client.actionInFlight)) {
    syncMobileChoiceZoneHeight();
    return;
  }
  if (window.MagicDungeonUI?.updateChoices(snapshot, client.actionInFlight)) {
    syncMobileChoiceZoneHeight();
    return;
  }
  if (dom.explorationToggle) dom.explorationToggle.disabled = client.actionInFlight || client.isSceneTyping;
  dom.choices.replaceChildren();
  dom.choices.classList.remove("revealed", "is-crafting-menu", "is-cooking-menu");
  dom.sceneFrame.classList.remove("is-cooking-menu");
  if (!snapshot) {
    syncMobileChoiceZoneHeight();
    return;
  }
  const prepared = prepareScenePresentation(snapshot);
  const presentation = prepared.choices;
  prepared.choices = null; // The fragment is consumed when attached to the live document.
  if (presentation.isRecipeMenu) {
    client.activeCraftingRecipeDetailId = presentation.selectedRecipeId;
    dom.choices.classList.add("is-crafting-menu");
    dom.choices.classList.toggle("is-cooking-menu", presentation.isCookingMenu);
    dom.sceneFrame.classList.toggle("is-cooking-menu", presentation.isCookingMenu);
  }
  const pendingAction = client.pendingAction;
  const isGeneratingSubwayFloor = client.actionInFlight && (
    pendingAction?.type === "subway_expedition" && ["start", "descend"].includes(pendingAction.command) ||
    pendingAction?.type === "content_action" && pendingAction.actionId === "start_subway_expedition"
  );
  if (isGeneratingSubwayFloor && !snapshot.state.isGameOver) {
    const status = document.createElement("p");
    status.className = "empty-state";
    status.textContent = "준비된 지하 구간으로 이동하고 있습니다…";
    status.setAttribute("aria-live", "polite");
    dom.choices.appendChild(status);
  }
  dom.choices.appendChild(presentation.element);
  if (client.actionInFlight) {
    dom.choices.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  }
  dom.choices.classList.add("revealed");
  syncMobileChoiceZoneHeight();
}

function renderScene(animateText = true, appendStory = false, scrollToStart = false, continueActionStory = false) {
  const snapshot = client.snapshot;
  const scene = snapshot?.currentScene;
  const location = currentLocationCard();
  if (!snapshot || !scene || !location) {
    return;
  }

  document.body.classList.toggle("in-arcana-combat", Boolean(snapshot.state.arcanaCombat?.battle));
  if (!snapshot.state.arcanaCombat?.battle) dom.sceneText.parentElement.querySelector(":scope > .arcana-combat")?.remove();
  if (snapshot.state.arcanaCombat?.battle) {
    clearSceneAnimation();
    window.ArcanaCombatUI.render(snapshot, dom.sceneText);
    client.renderedStorySurfaceId = scene.id;
    hideSystemNote(); renderChoices(); return;
  }
  if (snapshot.state.magicDungeon?.run) {
    clearSceneAnimation();
    if (client.renderedStorySurfaceId !== scene.id) {
      window.MagicDungeonUI.renderNarrative(snapshot, dom.sceneText);
      client.renderedStorySurfaceId = scene.id;
    }
    renderSceneDevSource(snapshot);
    if (snapshot.state.systemNote) renderSystemNote(snapshot.state.systemNote, systemNoteKey(snapshot, snapshot.state.systemNote), snapshot.state.systemNoteEntries || []);
    else hideSystemNote();
    renderChoices();
    return;
  }

  const story = prepareScenePresentation(snapshot).story;
  const surfaceId = storySurfaceId(snapshot);
  const previousRenderedNoteKey = client.renderedSystemNoteKey;
  const surfaceChanged = Boolean(client.renderedStorySurfaceId && client.renderedStorySurfaceId !== surfaceId);
  if (surfaceChanged && !appendStory) {
    resetSceneScrollOnMobile();
  }

  displaySceneImage(sceneImageSource(location));
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
    const block = createSceneStoryBlock(appendStory, story.source, continueActionStory);
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
    continueBlock: continueActionStory,
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
  if (snapshot.state.magicDungeon?.run) {
    const run = snapshot.state.magicDungeon.run;
    dom.panelContent.innerHTML = `<section class="map-detail-slot"><div class="map-detail-head"><h3>별빛 회랑 ${run.floor}층</h3></div><p>던전 본문의 갈림길에서 다음 경로를 선택할 수 있습니다. 귀환해 전리품을 정산한 뒤 아르카나 광장과 서울 지도로 돌아갈 수 있습니다.</p></section>`;
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
  const isDowntownMap = isMagicWorldState(snapshot.state) && visible.has("arcana_plaza");
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
      isDowntownMap && ARCANA_DOWNTOWN_LOCATIONS.has(node.locationId) ? "is-city" : "",
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
        ${isDowntownMap && ARCANA_DOWNTOWN_LOCATIONS.has(node.locationId) ? "" : hexTerrainMarkup(node.locationId, boardLayout.dimensions.size)}
        <polygon class="hex-tile-shape" points="${hexPoints(0, 0, boardLayout.dimensions.size)}"></polygon>
        <title>${escapeHtml(location.name)}</title>
      </g>
    `;
  }).join("");

  // Draw the current border after every tile so neighboring grid lines cannot cover it.
  const currentMapPosition = boardLayout.positions.get(currentLocation.id);
  const currentTileOutline = currentMapPosition && !(isDowntownMap && ARCANA_DOWNTOWN_LOCATIONS.has(currentLocation.id))
    ? `<polygon class="hex-current-outline" points="${hexPoints(currentMapPosition.x, currentMapPosition.y, boardLayout.dimensions.size)}" aria-hidden="true"></polygon>`
    : "";
  const revealedTerrain = boardNodes.map((node) => {
    const position = boardLayout.positions.get(node.locationId);
    return position
      ? `<polygon points="${hexPoints(position.x, position.y, boardLayout.dimensions.size * 1.015)}" fill="white" />`
      : "";
  }).join("");
  const downtownPosition = isDowntownMap ? boardLayout.positions.get("arcana_plaza") : null;
  const downtownExtent = boardLayout.dimensions.size * 5.3;
  const cityGroundMarkup = downtownPosition
    ? '<image href="' + assetUrl("assets/map-arcana-downtown-v2.png") + '" x="' + (downtownPosition.x - downtownExtent / 2)
      + '" y="' + (downtownPosition.y - downtownExtent / 2)
      + '" width="' + downtownExtent + '" height="' + downtownExtent
      + '" preserveAspectRatio="xMidYMid meet"'
      + (ARCANA_DOWNTOWN_LOCATIONS.has(currentLocation.id) ? ' filter="url(#map-city-current)"' : "") + ' />'
    : "";
  const hexMapDefs = `
    <defs>
      <pattern id="map-ground" patternUnits="userSpaceOnUse" width="132" height="132">
        <svg width="132" height="132" viewBox="300 200 100 100" overflow="hidden">
          <image href="${assetUrl("assets/map-terrain-v1.png")}" width="400" height="300" preserveAspectRatio="none" />
        </svg>
      </pattern>
      <filter id="map-city-current" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="1.1" result="expanded" />
        <feComposite in="expanded" in2="SourceAlpha" operator="out" result="outline" />
        <feFlood flood-color="#f4ce6b" result="gold" />
        <feComposite in="gold" in2="outline" operator="in" result="border" />
        <feMerge><feMergeNode in="border" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
<filter id="map-landmark-contact" x="-35%" y="-80%" width="170%" height="260%"><feGaussianBlur stdDeviation="1.6" /></filter>
      <filter id="map-frontier-soften" x="-5%" y="-5%" width="110%" height="110%">
        <feGaussianBlur stdDeviation="1.8" />
      </filter>
      <mask id="map-revealed-terrain" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"
        x="0" y="0" width="${boardLayout.pixelWidth}" height="${boardLayout.pixelHeight}" style="mask-type: luminance;">
        <rect width="${boardLayout.pixelWidth}" height="${boardLayout.pixelHeight}" fill="black" />
        <g filter="url(#map-frontier-soften)">${revealedTerrain}</g>
      </mask>
    </defs>
  `;
  const mapGroundMarkup = `
    <g aria-hidden="true" pointer-events="none">

      <rect width="${boardLayout.pixelWidth}" height="${boardLayout.pixelHeight}"
        fill="url(#map-ground)" mask="url(#map-revealed-terrain)" />
      ${cityGroundMarkup}
    </g>
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
  const selectedPosition = selectedTravel ? boardLayout.positions.get(selectedTravel.entry.locationId) : null;
  const selectedTileOutline = selectedPosition
    ? `<polygon class="hex-selected-outline" points="${hexPoints(selectedPosition.x, selectedPosition.y, boardLayout.dimensions.size * .93)}" aria-hidden="true"></polygon>`
    : "";

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
              ${isSelected ? `<span class="tag tag-selected">선택</span>` : ""}
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
      <section class="map-detail-slot" aria-live="polite" aria-label="선택한 목적지">
        <div class="map-detail-head">
          <div>
            <span class="map-selection-label">선택한 장소</span>
            <h3>${selectedTravel.location.name}</h3>
          </div>
          <div class="map-card-tags">
            <span class="tag">${riskLabel(selectedTravel.location.risk)}</span>
            ${selectedTravelRouteTag}
          </div>
        </div>
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

  const previousDestinationScroll = dom.panelContent.querySelector(".map-list")?.scrollLeft || 0;
  dom.panelContent.innerHTML = `
    <section class="hex-map-shell">
      <div class="hex-map-viewport">
        <div class="hex-map-board">
          <div class="hex-map-scroll-space" style="width:${scrollSpaceWidth}px; height:${scrollSpaceHeight}px;">
            <div class="hex-map-canvas" style="width:${scaledMapWidth}px; height:${scaledMapHeight}px; left:${mapFocusGutter}px; top:${mapFocusGutter}px;">
              <svg class="hex-map-stage"
                viewBox="0 0 ${boardLayout.pixelWidth} ${boardLayout.pixelHeight}"
                style="--hex-size:${boardLayout.dimensions.size}px;" role="img" aria-label="${isMagicWorldState(snapshot.state) ? "마법세계 지도" : "현실세계 지도"}">
                ${hexMapDefs}
                ${mapGroundMarkup}
                ${edgeMarkup}
                ${tileMarkup}
                ${currentTileOutline}
                ${selectedTileOutline}
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
      </div>
      ${mapDetailSlot}
      <div class="map-list" aria-label="목적지 목록">${travelCards}</div>
    </section>
  `;
  dom.panelContent.querySelector(".map-list").scrollLeft = previousDestinationScroll;

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
    tile.setAttribute("aria-pressed", String(tile.dataset.hexLocation === client.activeMapDetailKey));
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
        client.activeMapDetailKey = locationId;
        renderMapPanel();
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
  const itemIconPaths = {
    emergencySnack: "assets/items/emergency-snack.png",
    waterBottle: "assets/items/water-bottle.png",
    cannedFood: "assets/items/canned-food.png",
    hotMeal: "assets/items/hot-meal.png",
    painRelief: "assets/items/pain-relief.png",
    scrapBundle: "assets/items/scrap-bundle.png",
    rationTicket: "assets/items/ration-ticket.png",
    woodPlank: "assets/items/wood-plank.png",
    scrapMetal: "assets/items/scrap-metal.png",
    clothScrap: "assets/items/cloth-scrap.png",
    cordage: "assets/items/cordage.png",
    crudeAxe: "assets/items/crude-axe.png",
    utilityKnife: "assets/items/utility-knife.png",
    dentedPot: "assets/items/dented-pot.png",
    rawRice: "assets/items/raw-rice.png",
    vegetables: "assets/items/vegetables.png",
    wildGreens: "assets/items/wild-greens.png",
    staleBread: "assets/items/stale-bread.png",
    ricePorridge: "assets/items/rice-porridge.png",
    greensSoup: "assets/items/greens-soup.png",
    forestStew: "assets/items/forest-stew.png",
    manaShard: "assets/items/mana-shard.png",
    moonHerb: "assets/items/moon-herb.png",
    arcaneDust: "assets/items/arcane-dust.png",
    manaPotion: "assets/items/mana-potion.png",
    runeCompass: "assets/items/rune-compass.png",
    radioBattery: "assets/items/radio-battery.png",
    radioAntenna: "assets/items/radio-antenna.png",
    radioTransmitter: "assets/items/radio-transmitter.png",
  };
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
    const provisional = snapshot.state.subwayExpedition?.active ? snapshot.state.subwayExpedition.carriedLoot[item.id] || 0 : 0;
    if (provisional) detailLines.push({ text: `${provisional}개는 이번 탐사에서 챙긴 물건입니다. 귀환하면 계속 보관할 수 있습니다.` });
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
      lights: (snapshot.inventoryLights || []).filter(light => light.itemId === item.id),
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

    dom.panelContent.querySelectorAll("[data-inventory-light]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const light = (snapshot.inventoryLights || [])[Number(button.dataset.inventoryLight)];
        if (light) submitAction({ type: "item_light", worldId: light.worldId, entityId: light.entityId, revision: light.revision, on: !light.on }, button);
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
      class="info-card inventory-card has-item-icon ${isMoneyActive ? "is-active" : ""}"
      data-inventory-detail="${moneyDetailKey}" aria-label="돈 ${snapshot.state.money.toLocaleString()}원" title="돈"
      role="button"
      tabindex="0"
      aria-pressed="${isMoneyActive ? "true" : "false"}"
    >
      <div class="inventory-card-head">
        <img class="inventory-item-icon" src="assets/items/money.png" width="24" height="24" alt="" draggable="false">
        <div class="inventory-item-copy">
          <h3>돈</h3>
          <span class="tag">${snapshot.state.money.toLocaleString()}원</span>
        </div>
      </div>
    </article>
  `;

  const renderedItemCards = itemCards.map((item) => {
    const count = (snapshot.state.inventory[item.id] || 0) + (snapshot.state.subwayExpedition?.active ? snapshot.state.subwayExpedition.carriedLoot[item.id] || 0 : 0);
    const isActive = client.activeInventoryDetailKey === item.id;
    return `
      <article
        class="info-card inventory-card ${itemIconPaths[item.id] ? "has-item-icon" : ""} ${isActive ? "is-active" : ""}"
        data-inventory-detail="${item.id}" aria-label="${escapeHtml(item.name)} ${count}개" title="${escapeHtml(item.name)}"
        role="button"
        tabindex="0"
        aria-controls="inventory-detail-slot"
        aria-pressed="${isActive ? "true" : "false"}"
      >
        <div class="inventory-card-head">
          ${itemIconPaths[item.id] ? `
            <img class="inventory-item-icon" src="${itemIconPaths[item.id]}" width="24" height="24" alt="" draggable="false">
            <div class="inventory-item-copy">
              <h3>${escapeHtml(item.name)}</h3>
              <span class="tag">×${count}</span>
            </div>
          ` : `<h3>${escapeHtml(item.name)} ${count > 1 ? `x${count}` : ""}</h3>`}
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
        ${(detail?.lights || []).map(light => `
          <div class="inventory-light-control">
            <span>${light.on ? "켜짐" : "꺼짐"}${light.reason ? " · " + escapeHtml(light.reason) : ""}</span>
            <button class="inline-action inventory-use-action" type="button"
              data-inventory-light="${(snapshot.inventoryLights || []).indexOf(light)}"
              aria-label="${escapeHtml(light.name)} ${light.on ? "끄기" : "켜기"}"
              ${!light.on && !light.canTurnOn ? "disabled" : ""}>${light.on ? "끄기" : "켜기"}</button>
          </div>
        `).join("")}
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
      ${usesArcanaStatus() ? `<section class="skill-section"><h3 class="skill-section-title">마법 스킬</h3><div class="arcana-stat-growth"><strong>파이어볼</strong> · 피해 ${arcanaFireballDamage()} (마력의 50%)<br>MP 4 · 재사용 3초</div></section>` : ""}
      ${!isMagicWorldState() && skillProgress.length ? `
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
  return `<section class="condition-details" aria-label="상태 이상 상세">${conditions.map(condition => `
    <article class="condition-detail-card ${condition.level >= 3 ? "is-critical" : ""}">
      <strong>${condition.label} Lv${condition.level}</strong>
      ${condition.level >= 4 ? '<p>Lv4 도달 · 생존 종료</p>' : `
      ${condition.kind === "exhaustion" ? `<p>${condition.nextWorseningMinutes === null ? "기력이 남아 있어 탈진 진행이 멈춰 있습니다." : "기력 0으로 보낸 시간이 쌓이고 있습니다."}</p>` : `<p>다음 체력 −1까지 ${formatMinutesLabel(condition.nextDamageMinutes)}</p>`}
      ${condition.nextWorseningMinutes === null ? '' : `<p>다음 악화까지 ${formatMinutesLabel(condition.nextWorseningMinutes)}</p>`}
      <p>${condition.kind === "exhaustion" ? "음식의 탈진 회복 효과로 누적된 피로를 줄일 수 있습니다. 휴식만으로는 낫지 않습니다." : `${condition.kind === "injury" ? "붕대" : "항생제"} 1개로 1단계 치료`}</p>
      ${condition.level === 3 ? '<p class="condition-warning">한 단계 더 쌓이면 체력과 관계없이 생존 종료됩니다.</p>' : ''}`}
    </article>`).join("")}<p class="status-detail-note">게임 시간이 흐를 때 진행됩니다. 취침 중 부상·감염은 25% 속도로 진행됩니다. 탈진은 기력 0으로 보낸 시간이 그대로 쌓입니다.</p></section>`;
}

function statusDetailMarkup() {
  const snapshot = client.snapshot;
  const state = snapshot.state;
  const stats = [
    {
      key: "hp",
      value: statusValue("hp", state),
    },
    {
      key: "mind",
      value: statusValue("mind", state),
    },
    {
      key: "energy",
      value: statusValue("energy", state),
    },
  ];
  if (usesArcanaStatus(state)) stats.push({ key: "power", value: statusValue("power", state) });

  return `
    ${healthConditionDetailsMarkup()}
    <div class="status-detail-stack">
      ${stats.map((stat) => {
        const detail = statusDetailFor(stat.key, state);
        const isActive = client.activeStatusDetailKey === stat.key;
        const fillPercent = detail.max ? Math.max(0, Math.min(100, (stat.value / detail.max) * 100)) : 0;
        const isExperience = stat.key === "energy" && Boolean(magicExperience(state));
        return `
          <div class="status-detail-row-wrap">
            <button
              class="status-detail-row is-${stat.key} ${isExperience ? "is-experience" : ""} ${isActive ? "is-active" : ""}"
              data-status-detail="${stat.key}"
              type="button"
              aria-expanded="${isActive ? "true" : "false"}"
            >
              <span class="status-detail-title">${detail.title}</span>
              ${detail.max ? `<span class="status-detail-meter" aria-hidden="true"><span style="width:${fillPercent}%"></span></span>` : `<span class="status-detail-spacer" aria-hidden="true"></span>`}
              <span class="status-detail-value">${statusDisplayValue(stat.key, state)}</span>
            </button>
            ${isActive ? `<p class="status-detail-note">${detail.note}</p>` : ""}
          </div>
        `;
      }).join("")}
    </div>
    ${usesArcanaStatus(state) ? `<div class="status-mana-regeneration"><span>시간당 마나 재생</span><strong>+${Number(state.arcanaCombat.manaRegenPerHour).toLocaleString("ko-KR")} MP</strong></div>` : ""}
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
          <span class="quest-requirement-name">${escapeHtml(requirement.name)}</span>
          <span class="quest-requirement-count">${Math.min(requirement.ownedAmount, requirement.amount)} / ${requirement.amount}</span>
          ${!requirement.met && requirement.sourceHints?.length ? `<span class="quest-source-hints">${requirement.sourceHints.map(hint => escapeHtml(hint)).join("<br>")}</span>` : ""}
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
        <h3>${escapeHtml(quest.name)}</h3>
        <div class="quest-card-actions">
          <span class="tag">${questStatusLabel(quest.status)}</span>
        </div>
      </div>
      <div class="quest-card-body">
        <p>${escapeHtml(quest.summary)}</p>
        ${!isCompleted && quest.nextStep ? `<p class="quest-next-step"><strong>다음 단계</strong><span>${escapeHtml(quest.nextStep)}</span></p>` : ""}
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
  const state = client.snapshot.state;
  const goal = client.snapshot.survivalGoal;
  const resultLabels = {
    pending: `${goal.daysRemaining}일 남음`,
    signal: "구조 신호 전달 · 첫 장 완료",
    missed: "구조 신호 기회 놓침 · 여정 계속",
  };
  const dayLead = state.flags.day8_checkpoint_hint && !state.flags.rescue_route_checked
    ? "검문소에서 구조 경로를 확인할 수 있습니다."
    : state.flags.day6_subway_hint && !state.flags.station_notice_checked
      ? "지하철역 대합실의 안내문을 살펴보세요."
      : state.flags.day4_hospital_hint && !state.flags.hospital_records_checked
        ? "작은 병원에서 피난 기록을 대조할 수 있습니다."
        : state.flags.day2_refugee_crowd
          ? "급식소 배식줄이 붐빕니다. 일거리와 식사 값을 확인하세요."
          : "편의점과 급식소에서 식량을 찾고 거처에서 생활 도구를 마련하세요.";
  const chapterCard = `<article class="info-card chapter-goal-card">
    <header class="chapter-goal-header">
      <h3>첫 10일 · 구조 준비</h3>
      <span class="chapter-goal-deadline">${escapeHtml(resultLabels[state.chapterOneResult] || resultLabels.pending)}</span>
    </header>
    <div class="chapter-goal-equipment">
      <div class="chapter-goal-status"><span>신호 장비</span><strong>${goal.signalReady ? "준비 완료" : "미완성"}</strong></div>
      <ul class="chapter-goal-parts">${goal.signalParts.map((part) => `<li class="${part.owned ? "is-owned" : ""}"><span>${escapeHtml(part.name)}</span><span class="chapter-goal-part-state" role="img" aria-label="${part.owned ? "확보" : "미확보"}">${part.owned ? "✓" : ""}</span></li>`).join("")}</ul>
    </div>
    <p class="chapter-goal-hint">${escapeHtml(dayLead)}</p>
  </article>`;
  if (!visibleQuests.length) {
    dom.panelContent.innerHTML = chapterCard;
    return;
  }

  const completedQuests = visibleQuests.filter((quest) => quest.status === "completed");
  const activeQuests = visibleQuests.filter((quest) => quest.status !== "completed");

  dom.panelContent.innerHTML = `
    <div class="quest-panel-stack">
      <div class="panel-grid">${chapterCard}</div>
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

function renderExplorationPanel() {
  const exploration = client.snapshot?.exploration;
  if (!exploration) { dom.panelContent.innerHTML = '<p class="empty-state">지금은 살펴볼 공간이 없습니다.</p>'; return; }
  const targets = [{ id: "", name: "통로와 주변", placement: exploration.roomName, actions: exploration.generalActions }, ...exploration.targets];
  const selected = targets.find(t => t.id === client.explorationTargetId) || targets.find(t => t.actions.length) || targets[0];
  client.explorationTargetId = selected.id;
  dom.panelContent.innerHTML = `<div class="exploration-targets" aria-label="살펴볼 대상">${targets.map((target, index) => `<button type="button" data-exploration-target="${index}" aria-pressed="${target.id === selected.id}" ${client.actionInFlight ? "disabled" : ""}>${escapeHtml(target.name)}</button>`).join("")}</div>
    <p class="exploration-placement">${escapeHtml(selected.placement)}</p><div class="choice-list exploration-actions"></div>`;
  const list = dom.panelContent.querySelector(".exploration-actions");
  if (!selected.actions.length) list.innerHTML = '<p class="empty-state">지금 이 대상에 할 수 있는 별도 행동은 없습니다.</p>';
  selected.actions.forEach(choice => {
    const fragment = dom.choiceTemplate.content.cloneNode(true), button = fragment.querySelector("button");
    fragment.querySelector(".choice-label").textContent = choice.label;
    fragment.querySelector(".choice-meta").textContent = choice.outcomeHint || "";
    for (const selector of [".choice-status", ".choice-remaining"]) fragment.querySelector(selector).hidden = true;
    button.disabled = client.actionInFlight || choice.isAvailable === false;
    button.addEventListener("click", () => {
      if (client.actionInFlight) return;
      const pendingChoice = button.cloneNode(true);
      dom.choices.replaceChildren(pendingChoice);
      dom.choices.classList.add("revealed");
      client.isPanelOpen = false;
      renderPanel();
      syncMobileChoiceZoneHeight();
      submitAction(choice.action, pendingChoice, choice.loading, null, "template", choice.choiceThought);
    });
    list.appendChild(fragment);
  });
  dom.panelContent.querySelectorAll("[data-exploration-target]").forEach(button => button.addEventListener("click", () => {
    if (client.actionInFlight) return;
    client.explorationTargetId = targets[Number(button.dataset.explorationTarget)].id;
    renderExplorationPanel();
  }));
}

function renderPanel() {
  if (dom.explorationToggle) {
    dom.explorationToggle.hidden = !client.snapshot?.exploration;
    dom.explorationToggle.disabled = client.actionInFlight || client.isSceneTyping;
    dom.explorationToggle.setAttribute("aria-expanded", String(client.isPanelOpen && client.activePanel === "exploration"));
  }
  const config = PANEL_CONFIG[client.activePanel];
  dom.panelShell.setAttribute("aria-label", config.title);
  dom.panelShell.classList.toggle("is-map-panel", client.activePanel === "map");
  dom.panelContent.classList.toggle("map-panel-content", client.activePanel === "map");
  dom.panelContent.classList.toggle(
    "inventory-panel-content",
    client.activePanel === "inventory",
  );
  if (client.isPanelOpen) {
  if (client.activePanel === "exploration") {
    renderExplorationPanel();
  } else if (client.activePanel === "map") {
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

let warmedLocationKey = "";
function warmNearbyAssets(snapshot) {
  const location = snapshotLocationCard(snapshot);
  if (!location) return;
  const key = snapshot.gameId + ":" + location.id + ":" + location.imagePath;
  if (warmedLocationKey === key) return;
  warmedLocationKey = key;
  const arcana = location.id.startsWith("arcana_");
  const near = (location.neighbors || []).map(id => snapshot.visibleLocations.find(entry => entry.id === id)).filter(Boolean);
  const monsters = arcana ? ["arcana-slime.png", "arcana-slime-prepare.png", "arcana-slime-hit.png", "arcana-slime-dead.png"].map(name => "assets/monsters/" + name) : [];
  const maps = ["assets/map-terrain-v1.png", "assets/map-landmarks-v2.png", ...(arcana ? ["assets/map-arcana-downtown-v2.png"] : [])];
  // Fetch bytes gradually; decode only images that are about to be displayed.
  void preloadImage(sceneImageSource(location)).then(() => {
    if (warmedLocationKey !== key) return;
    const combat = /plain|hunting/.test(location.id);
    queueAssets([...(combat ? monsters : []), ...maps, ...near.map(sceneImageSource), ...(!combat ? monsters : [])], { replace: true });
  });
}

function render(options = {}) {
  if (!client.actionInFlight) pauseAssetWarmup(false);
  if (!client.snapshot) {
    return;
  }
  renderStatusBar();
  renderScene(
    options.animateScene !== false,
    options.appendScene === true,
    options.scrollSceneToStart === true,
    options.continueActionStory === true,
  );
  renderPanel();
  renderGameOverScreen();
  warmNearbyAssets(client.snapshot);
  client.justCreatedGame = false;
}

async function submitAction(
  action,
  triggerElement = null,
  loading = null,
  postChoiceNarrative = null,
  postChoiceNarrativeSource = "template",
  choiceThought = null,
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
  // Keep retired action leads out of history; the chosen thought introduces the actual result.
  const continuousNarrative = ["text_world", "npc_dialogue", "subway_expedition", "item_light"].includes(action.type)
    || Number.isInteger(action.activityRevision);
  const hasChoiceThought = typeof choiceThought === "string" && Boolean(choiceThought.trim());
  const immediateNarrative = hasChoiceThought ? [`‘${choiceThought.trim()}’`]
    : continuousNarrative ? [] : normalizePostChoiceNarrative(postChoiceNarrative);
  const hasImmediateNarrative = immediateNarrative.length > 0;
  const savedHistory = continuousNarrative || hasChoiceThought ? captureSceneHistory() : null;
  let presentingAction = true;
  const transitionDurationMs = hasImmediateNarrative && !hasChoiceThought && !loading
    ? 0
    : actionTransitionDurationMs(action, loading);
  const shouldShowTransition = transitionDurationMs > 0;
  const previousSnapshot = client.snapshot;
  const timing = { action: action.type, startedAt: performance.now() };
  const mark = (key) => { timing[key] = Math.round(performance.now() - timing.startedAt); };
  client.lastActionTiming = timing;
  const streamedParagraphs = [];
  let paragraphQueue = Promise.resolve(), immediateNarrativePromise = Promise.resolve();
  let previousParagraphSource = null;
  const onStreamEvent = event => {
    if (event.type === "complete") { timing.server = event.timing; return; }
    if (event.type !== "paragraph") return;
    streamedParagraphs.push(event.text);
    if (streamedParagraphs.length === 1) mark("firstParagraphReceivedMs");
    paragraphQueue = paragraphQueue.then(async () => {
      await immediateNarrativePromise;
      if (!presentingAction) return;
      if (event.index === 0) mark("firstParagraphDisplayedMs");
      clearSceneAnimation();
      const source = event.source === previousParagraphSource ? null : event.source;
      previousParagraphSource = event.source;
      await animateStoryText({ headline: "", paragraphs: [event.text], source }, client.sceneRenderToken, null, {
        append: true, continueBlock: hasChoiceThought || event.index > 0,
        scrollToStart: !hasChoiceThought && event.index === 0, revealChoices: false, keepChoices: true,
      });
    });
  };
  try {
    pauseAssetWarmup(true);
    preloadActionSceneAssets(action, previousSnapshot);
    const requestResultPromise = (action.type === "text_world" ? requestTextWorldAction(action, onStreamEvent) : api(`/api/games/${client.gameId}/actions`, {
      method: "POST",
      body: action,
    }))
      .then(async (snapshot) => {
        mark("responseMs");
        if (streamedParagraphs.length) {
          const finalParagraphs = snapshot.currentScene.paragraphs;
          if (streamedParagraphs.some((text, i) => text !== finalParagraphs[i])) throw new Error("표시한 서사와 저장된 결과가 일치하지 않습니다.");
          for (let i = streamedParagraphs.length; i < finalParagraphs.length; i++) onStreamEvent({ type: "paragraph", index: i, text: finalParagraphs[i], source: snapshot.currentScene.paragraphSources?.[i] ?? snapshot.currentScene.source });
        }
        const assetsReady = preloadNextSceneAssets(snapshot);
        prepareScenePresentation(snapshot);
        mark("preparedMs");
        void assetsReady.then(() => mark("assetsMs")).catch(() => undefined);
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
    // Narrative generation already supplies the wait; its fill must not delay an early result.
    const transitionPromise = continuousNarrative || hasChoiceThought
      ? Promise.resolve() : waitForMilliseconds(transitionDurationMs);
    const beginNarrative = () => presentingAction ? beginPostChoiceNarrative(
      immediateNarrative,
      !isMovementAction(action, loading) && (hasChoiceThought || !previousSnapshot.state.subwayExpedition?.active),
      hasChoiceThought ? null : postChoiceNarrativeSource,
      hasChoiceThought,
    ) : undefined;
    immediateNarrativePromise = hasImmediateNarrative
      ? hasChoiceThought ? beginNarrative() : transitionPromise.then(beginNarrative)
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
    await paragraphQueue;
    mark("presentationReadyMs");
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
    if (streamedParagraphs.length) client.renderedStorySurfaceId = storySurfaceId(snapshot);
    render({
      animateScene: streamedParagraphs.length ? false : hasImmediateNarrative
        ? true
        : shouldAnimateScene({
            source: "action",
            previousSnapshot,
            nextSnapshot: snapshot,
          }),
      appendScene: !streamedParagraphs.length && ((hasImmediateNarrative && (!hasChoiceThought || !didMove)) || continueLocationStory),
      scrollSceneToStart: !streamedParagraphs.length && continueLocationStory && !hasChoiceThought,
      continueActionStory: !streamedParagraphs.length && hasChoiceThought && !didMove,
    });
    mark("renderedMs");
    timing.renderWorkMs = timing.renderedMs - timing.presentationReadyMs;
    showQuestCompletionBurst(newlyCompletedQuests);
    if (didMove) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    presentingAction = false;
    window.alert(error instanceof Error ? error.message : "액션 처리에 실패했습니다.");
    clearSceneAnimation();
    if (savedHistory) restoreSceneHistory(savedHistory);
    else client.renderedStorySurfaceId = "";
    finishActionTransition();
    client.actionInFlight = false;
    client.pendingAction = null;
    render({ animateScene: false });
  } finally {
    presentingAction = false;
    finishActionTransition();
    client.actionInFlight = false;
    pauseAssetWarmup(false);
    client.pendingAction = null;
  }
}

async function backgroundSync() {
  if (!client.gameId || client.isHomeVisible || document.hidden || client.actionInFlight || client.syncInFlight ||
      Date.now() < Math.max(client.syncRetryAt, client.apiRetryAt)) {
    renderStatusBar();
    return;
  }
  client.syncInFlight = true;
  const gameId = client.gameId;
  const snapshotAtRequest = client.snapshot;
  try {
    const snapshot = await api(`/api/games/${gameId}/actions`, { method: "POST", body: { type: "world_clock", command: "tick", clientId: clockClientId, sequence: ++clockSequence } });
    client.syncFailures = 0;
    client.syncRetryAt = 0;
    // A late poll must not overwrite a newer action or a different game.
    if (client.gameId !== gameId || client.isHomeVisible || client.actionInFlight || client.snapshot !== snapshotAtRequest) return;
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
    if (effectiveSnapshot.state.arcanaCombat?.battle) window.ArcanaCombatUI?.render(effectiveSnapshot, dom.sceneText);
    if (client.isPanelOpen && client.activePanel === "status") renderStatusPanel();
    showQuestCompletionBurst(newlyCompletedQuests);
  } catch (error) {
    client.syncFailures = Math.min(client.syncFailures + 1, 5);
    client.syncRetryAt = Math.max(error.retryAt || 0, Date.now() + Math.min(120000, 10000 * 2 ** client.syncFailures));
    renderStatusBar();
  } finally {
    client.syncInFlight = false;
  }
}

function pauseVisibleGame() {
  if (!client.gameId || client.isHomeVisible) return;
  void fetch("/api/games/" + client.gameId + "/actions", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive: true,
    body: JSON.stringify({ type: "world_clock", command: "pause", clientId: clockClientId, sequence: ++clockSequence }) }).catch(() => {});
  if (client.snapshot?.state?.activeClock) client.snapshot.state.activeClock.paused = true;
}
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseVisibleGame(); else void backgroundSync(); });
window.addEventListener("pagehide", pauseVisibleGame);

async function bootstrap() {
  clearLegacyGameIds();
  const health = await api("/api/health");
  if (!health.ok) {
    throw new Error("서버 상태가 올바르지 않습니다.");
  }
  await showHomeScreen();
  let pending;
  try { pending = JSON.parse(window.sessionStorage.getItem(PENDING_ACTION_KEY) || "null"); } catch { /* No recoverable receipt. */ }
  if (pending?.gameId && pending?.requestId) {
    let settled = false;
    try {
      const snapshot = await api(`/api/games/${encodeURIComponent(pending.gameId)}/actions/${encodeURIComponent(pending.requestId)}`);
      settled = true;
      client.gameId = snapshot.gameId;
      client.snapshot = snapshot;
      client.lastFetchedAt = Date.now();
      client.hasUnsavedProgress = true;
      showGameScreen();
      render({ animateScene: false });
    } catch (error) { settled = error.status === 404; }
    finally { if (settled) try { window.sessionStorage.removeItem(PENDING_ACTION_KEY); } catch { /* Optional storage. */ } }
  }
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
  if (startedInPanel || startedInDock || eventPath.includes(dom.explorationToggle)) {
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

async function startNewGameFromHome(startAt = "shelter") {
  if (client.actionInFlight) {
    return;
  }
  client.actionInFlight = true;
  clearSceneAnimation();
  try {
    await createNewGame(startAt);
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

dom.homeNewGame.addEventListener("click", () => startNewGameFromHome());
dom.homeArcanaStart.addEventListener("click", () => startNewGameFromHome("arcana"));

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
    await requestGameFullscreen();
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

dom.explorationToggle.addEventListener("click", () => {
  if (client.actionInFlight || client.isSceneTyping || !client.snapshot?.exploration) return;
  client.isPanelOpen = !(client.isPanelOpen && client.activePanel === "exploration");
  client.activePanel = "exploration";
  renderPanel();
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
  energy: client.snapshot?.state?.stats?.energy ?? null,
  preparedMeal: client.snapshot?.state?.preparedMeal ?? null,
  toolDurability: client.snapshot?.state?.toolDurability ?? {},
  chapterOneResult: client.snapshot?.state?.chapterOneResult ?? null,
  survivalGoal: client.snapshot?.survivalGoal ?? null,
  skillProgress: (client.snapshot?.skillProgress || []).map((skill) => ({
    id: skill.id,
    level: skill.level,
    totalXp: skill.totalXp,
    nextTarget: skill.isMaxLevel
      ? "MAX"
      : Number(skill.totalXp) - Number(skill.xpIntoLevel) + Number(skill.xpForNextLevel),
    effectPercent: skill.effectPercent,
  })),
  arcanaCombat: client.snapshot?.state?.arcanaCombat || null,
  activeClock: client.snapshot?.state?.activeClock || null,
  subwayExpedition: client.snapshot?.state?.subwayExpedition || null,
  lastActionTiming: client.lastActionTiming,
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

// Shelter animation is initialized only when its scene is actually displayed.
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


/* Arcana uses server outcomes and interpolates only visible countdowns. */
(() => {
  let latest = null, receivedAt = 0, busy = false, sceneTarget = null, battleKey = '', choiceKey = '';
  const fmt = n => String(Math.round(n * 10) / 10);
  const ENEMY_MAX_HP = 30;
  const ATTACK_PREPARATION_SECONDS = 3;
  const ATTACK_WARNING_SECONDS = 1;
  const DAMAGE_DELAY_MS = 600;
  const DAMAGE_CATCHUP_MS = 500;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let healthTrail = null, playerHealthTrail = null, meterFrame = 0, slimeHitUntil = 0;
  const SLIME_PORTRAITS = {
    idle: 'assets/monsters/arcana-slime.png',
    prepare: 'assets/monsters/arcana-slime-prepare.png',
    hit: 'assets/monsters/arcana-slime-hit.png',
    dead: 'assets/monsters/arcana-slime-dead.png',
  };
  // Regional warmup fetches these before combat without competing with the home screen.

  function trailHpAt(now, trail = healthTrail) {
    if (!trail) return 0;
    if (now < trail.holdUntil) return trail.fromHp;
    if (reducedMotion.matches) return trail.hp;
    const progress = Math.min(1, (now - trail.holdUntil) / DAMAGE_CATCHUP_MS);
    return trail.fromHp + (trail.hp - trail.fromHp) * progress;
  }
  function displayedEnemyHp(now = performance.now()) {
    if (!healthTrail) return 0;
    return now < (healthTrail.impactAt || 0) ? healthTrail.beforeHp : healthTrail.hp;
  }
  function rememberHealth(battle, now) {
    if (!battle) {
      window.ArcanaFireballFX?.cancel();
      healthTrail = null; slimeHitUntil = 0;
      window.cancelAnimationFrame(meterFrame); meterFrame = 0;
      return;
    }
    const hp = Math.max(0, Math.min(ENEMY_MAX_HP, battle.enemyHp));
    if (!healthTrail || healthTrail.battleId !== battle.id) {
      window.ArcanaFireballFX?.cancel();
      healthTrail = { battleId: battle.id, hp, fromHp: hp, holdUntil: 0 };
      slimeHitUntil = 0;
    } else if (hp < healthTrail.hp) {
      const beforeHp = displayedEnemyHp(now);
      const fromHp = Math.max(beforeHp, trailHpAt(now));
      const effect = window.ArcanaFireballFX?.play({
        source: document.querySelector('[data-arcana-command="fireball"]'),
        target: sceneTarget?.querySelector('.arcana-enemy-portrait'),
        damage: healthTrail.hp - hp,
        onImpact: () => {
          if (healthTrail?.battleId !== battle.id) return;
          refreshMeters();
          updateSlimePortrait(battle);
        },
      });
      const impactAt = effect?.impactAt ?? now;
      slimeHitUntil = hp > 0 ? impactAt + DAMAGE_DELAY_MS : 0;
      healthTrail = { battleId: battle.id, hp, beforeHp, fromHp, impactAt, holdUntil: impactAt + DAMAGE_DELAY_MS };
    } else if (hp > healthTrail.hp) {
      healthTrail = { battleId: battle.id, hp, fromHp: hp, holdUntil: 0 };
      slimeHitUntil = 0;
    }
  }
  function rememberPlayerHealth(state, now) {
    const combat = state?.arcanaCombat, battle = combat?.battle;
    if (!battle) { playerHealthTrail = null; return; }
    const maxHp = 100 + (combat.level - 1) * 10;
    const hp = Math.max(0, Math.min(maxHp, combat.hp));
    if (!playerHealthTrail || playerHealthTrail.battleId !== battle.id || playerHealthTrail.maxHp !== maxHp) {
      playerHealthTrail = { battleId: battle.id, maxHp, hp, fromHp: hp, holdUntil: 0 };
    } else if (hp < playerHealthTrail.hp) {
      const fromHp = Math.max(playerHealthTrail.hp, trailHpAt(now, playerHealthTrail));
      playerHealthTrail = { battleId: battle.id, maxHp, hp, fromHp, holdUntil: now + DAMAGE_DELAY_MS };
    } else if (hp > playerHealthTrail.hp) {
      playerHealthTrail = { battleId: battle.id, maxHp, hp, fromHp: hp, holdUntil: 0 };
    }
  }
  function paintPlayerHealth(now) {
    const meter = sceneTarget?.querySelector('[data-arcana-player-meter]');
    const trail = playerHealthTrail;
    if (!meter || !trail || trail.battleId !== latest?.state.arcanaCombat?.battle?.id) return;
    const trailHp = Math.max(trail.hp, trailHpAt(now, trail));
    meter.querySelector('[data-arcana-player-hp-fill]').style.transform = 'scaleX(' + trail.hp / trail.maxHp + ')';
    meter.querySelector('[data-arcana-player-hp-trail]').style.transform = 'scaleX(' + trailHp / trail.maxHp + ')';
    setMeterAttribute(meter, 'aria-valuemax', trail.maxHp);
    setMeterAttribute(meter, 'aria-valuenow', trail.hp);
    setMeterAttribute(meter, 'aria-valuetext', fmt(trail.hp) + ' / ' + trail.maxHp);
    write('[data-arcana-player-hp]', fmt(trail.hp) + ' / ' + trail.maxHp);
  }
  function attackPresentation(now = performance.now()) {
    const battle = latest?.state.arcanaCombat?.battle;
    const fighting = battle?.phase === 'battle';
    const paused = Boolean(battle?.paused || latest?.state.activeClock?.paused || document.hidden);
    // Stop at zero until an authoritative snapshot starts the next attack cycle.
    const dt = paused ? 0 : Math.max(0, (now - receivedAt) / 1000);
    const remaining = Math.max(0, (battle?.attackIn || 0) - dt);
    const preparing = fighting && !paused && remaining > 0 && remaining <= ATTACK_PREPARATION_SECONDS;
    const warning = preparing && remaining <= ATTACK_WARNING_SECONDS;
    const text = battle?.phase === 'ready' ? '준비되면 전투를 시작하세요.'
      : battle?.phase === 'victory' ? '슬라임을 처치했습니다.'
      : battle?.phase === 'defeat' ? '광장으로 귀환했습니다. 여관에서 회복할 수 있습니다.'
      : paused ? '일시정지 · 재개하면 이어집니다.'
      : remaining <= 0 ? '도약 결과 확인 중…'
      : warning ? '도약 임박' : preparing ? '도약 준비 중' : '';
    return { fighting, paused, remaining, preparing, warning, text };
  }
  function setMeterAttribute(element, name, value) {
    const text = String(value);
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
  const ACTION_COOLDOWN_SECONDS = { fireball: 3, dodge: 5 };
  function paintCooldownMeters(now) {
    const battle = latest?.state.arcanaCombat?.battle;
    document.querySelector('#choices')?.querySelectorAll('[data-arcana-cooldown]').forEach(meter => {
      const command = meter.dataset.arcanaCooldown;
      const cooldown = remaining(command, now);
      meter.hidden = battle?.phase !== 'battle' || cooldown <= .001;
      meter.querySelector('.arcana-cooldown-fill').style.transform =
        'scaleX(' + Math.min(1, cooldown / ACTION_COOLDOWN_SECONDS[command]) + ')';
    });
  }
  function paintMeters(now = performance.now()) {
    paintCooldownMeters(now);
    paintPlayerHealth(now);
    const battle = latest?.state.arcanaCombat?.battle;
    const hpMeter = sceneTarget?.querySelector('[data-arcana-enemy-meter]');
    if (!battle || !hpMeter || healthTrail?.battleId !== battle.id) return;
    const hp = displayedEnemyHp(now);
    const trailHp = Math.max(hp, trailHpAt(now));
    hpMeter.querySelector('[data-arcana-hp-fill]').style.transform = 'scaleX(' + hp / ENEMY_MAX_HP + ')';
    hpMeter.querySelector('[data-arcana-hp-trail]').style.transform = 'scaleX(' + trailHp / ENEMY_MAX_HP + ')';
    setMeterAttribute(hpMeter, 'aria-valuenow', hp);
    setMeterAttribute(hpMeter, 'aria-valuetext', fmt(hp) + ' / ' + ENEMY_MAX_HP);
    write('[data-arcana-enemy-hp]', fmt(hp) + ' / ' + ENEMY_MAX_HP);
    sceneTarget.querySelector('.arcana-opponent')?.classList.toggle('is-defeated', hp <= 0);
    const attack = attackPresentation(now);
    const attackMeter = sceneTarget.querySelector('[data-arcana-attack-meter]');
    if (attackMeter) {
      attackMeter.hidden = !attack.fighting || attack.remaining > ATTACK_PREPARATION_SECONDS;
      const fraction = Math.min(1, attack.remaining / ATTACK_PREPARATION_SECONDS);
      attackMeter.querySelector('[data-arcana-attack-fill]').style.transform = 'scaleX(' + fraction + ')';
      setMeterAttribute(attackMeter, 'aria-valuenow', Math.round(fraction * 100));
      setMeterAttribute(attackMeter, 'aria-valuetext', attack.text);
    }
    sceneTarget.querySelector('.arcana-opponent')?.classList.toggle('is-warning', attack.warning);
    write('[data-arcana-intent]', attack.text);
  }
  function metersNeedAnimation(now) {
    const attack = attackPresentation(now);
    const trailing = [healthTrail, playerHealthTrail].some(trail => trail && trail.fromHp > trail.hp
      && now < trail.holdUntil + (reducedMotion.matches ? 0 : DAMAGE_CATCHUP_MS));
    return !document.hidden && Boolean(sceneTarget?.querySelector('[data-arcana-enemy-meter]'))
      && Boolean(latest?.state.arcanaCombat?.battle)
      && ((attack.fighting && !attack.paused && (attack.remaining > 0
        || Object.keys(ACTION_COOLDOWN_SECONDS).some(command => remaining(command, now) > .001))) || trailing);
  }
  function animateMeters(now) {
    meterFrame = 0;
    if (document.hidden) return;
    paintMeters(now);
    if (metersNeedAnimation(now)) meterFrame = window.requestAnimationFrame(animateMeters);
  }
  function refreshMeters() {
    const now = performance.now();
    paintMeters(now);
    if (!meterFrame && metersNeedAnimation(now)) meterFrame = window.requestAnimationFrame(animateMeters);
  }
  function remember(snapshot) {
    if (latest !== snapshot) {
      const now = performance.now();
      rememberHealth(snapshot?.state.arcanaCombat?.battle, now);
      rememberPlayerHealth(snapshot?.state, now);
      latest = snapshot; receivedAt = now;
    }
  }
  function elapsed() {
    if (!latest || document.hidden || latest.state.activeClock?.paused) return 0;
    return Math.min(5, (performance.now() - receivedAt) / 1000);
  }
  function remaining(command, now = performance.now()) {
    const c = latest?.state.arcanaCombat, b = c?.battle;
    const paused = b?.paused || latest?.state.activeClock?.paused || document.hidden;
    const dt = paused ? 0 : Math.min(5, Math.max(0, (now - receivedAt) / 1000));
    return Math.max(0, (c?.cooldowns[command] || 0) - dt);
  }
  function write(selector, value) {
    const el = sceneTarget?.querySelector(selector);
    if (el && el.textContent !== value) el.textContent = value;
  }
  function updateSlimePortrait(battle) {
    const portrait = sceneTarget?.querySelector('.arcana-enemy-portrait');
    if (!portrait) return;
    const now = performance.now();
    const state = displayedEnemyHp(now) <= 0 ? 'dead' : now >= (healthTrail?.impactAt || 0) && now < slimeHitUntil ? 'hit' : attackPresentation().preparing ? 'prepare' : 'idle';
    if (portrait.dataset.state === state) return;
    portrait.dataset.state = state;
    portrait.src = assetUrl(SLIME_PORTRAITS[state]);
    portrait.alt = state === 'dead' ? '힘을 잃고 납작하게 쓰러진 슬라임'
      : state === 'hit' ? '공격을 받아 움찔하는 슬라임' : state === 'prepare' ? '몸을 낮게 압축해 도약을 준비하는 슬라임' : '반투명한 초록빛 슬라임';
  }
  function update() {
    const c = latest?.state.arcanaCombat, b = c?.battle;
    if (!b) return;
    const maxMp = 30 + (c.level - 1) * 3;
    const mp = Math.min(maxMp, c.mp + elapsed() * c.manaRegenPerHour / 75);
    refreshMeters();
    updateSlimePortrait(b);
    write('[data-arcana-feedback]', b.log.at(-1) || '');
    document.querySelector('#choices')?.querySelectorAll('[data-arcana-command]').forEach(button => {
      const cmd = button.dataset.arcanaCommand, cooldown = remaining(cmd);
      const unavailable = cmd === 'fireball' ? mp < 4 : cmd === 'potion' ? !(latest.state.inventory.manaPotion > 0) || mp >= maxMp : false;
      button.disabled = busy || cooldown > .001 || unavailable;
      const label = button.querySelector('[data-action-state]');
      if (label) label.textContent = cooldown > .001 ? ACTION_COOLDOWN_SECONDS[cmd] ? '재사용 대기' : cooldown.toFixed(1) + '초' : unavailable ? cmd === 'fireball' ? 'MP 부족' : latest.state.inventory.manaPotion ? 'MP 가득 참' : '포션 없음' : cmd === 'potion' ? (latest.state.inventory.manaPotion || 0) + '개' : '';
    });
  }
  function render(snapshot, target) {
    remember(snapshot); sceneTarget = target.parentElement;
    const c = snapshot.state.arcanaCombat, b = c?.battle;
    if (!b) { battleKey = ''; choiceKey = ''; return; }
    // Preserve meter layers through victory so the final damage trail can finish.
    const key = b.id;
    if (battleKey !== key || !sceneTarget.querySelector(':scope > .arcana-combat')) {
      battleKey = key;
      const card = document.createElement('div');
      card.innerHTML = '<section class="arcana-combat" aria-label="슬라임 전투"><section class="arcana-player-vitals" aria-label="내 체력"><div class="arcana-player-heading"><strong>내 체력</strong><span data-arcana-player-hp></span></div><div class="arcana-hp-meter arcana-player-hp-meter" data-arcana-player-meter role="progressbar" aria-label="내 체력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span class="arcana-hp-trail" data-arcana-player-hp-trail aria-hidden="true"></span><span class="arcana-hp-fill" data-arcana-player-hp-fill aria-hidden="true"></span></div></section><section class="arcana-opponent" aria-label="조우한 슬라임"><img class="arcana-enemy-portrait" src="assets/monsters/arcana-slime.png" width="104" height="104" alt="반투명한 초록빛 슬라임" draggable="false"><div class="arcana-enemy-stats"><div class="arcana-enemy-heading"><strong>슬라임</strong><span data-arcana-enemy-hp></span></div><div class="arcana-hp-meter" data-arcana-enemy-meter role="progressbar" aria-label="슬라임 체력" aria-valuemin="0" aria-valuemax="30" aria-valuenow="30"><span class="arcana-hp-trail" data-arcana-hp-trail aria-hidden="true"></span><span class="arcana-hp-fill" data-arcana-hp-fill aria-hidden="true"></span></div><div class="arcana-attack-meter" data-arcana-attack-meter role="progressbar" aria-label="슬라임 공격까지 남은 준비" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" hidden><span class="arcana-attack-fill" data-arcana-attack-fill aria-hidden="true"></span></div><p class="arcana-intent" data-arcana-intent></p></div></section></section>';
      sceneTarget.querySelector(':scope > .arcana-combat')?.remove();
      target.before(card.firstElementChild);
      target.innerHTML = '<p class="arcana-feedback" data-arcana-feedback></p>';
    }
    update();
  }
  function updateChoices(snapshot, inFlight) {
    remember(snapshot); busy = inFlight;
    const b = snapshot?.state.arcanaCombat?.battle, target = document.querySelector('#choices');
    if (!b || !target) { choiceKey = ''; sceneTarget?.querySelector(':scope > .arcana-combat')?.remove(); return false; }
    const actions = snapshot.availableActions || [], key = b.id + ':' + b.phase + ':' + b.paused;
    if (choiceKey !== key || !target.querySelector('[data-arcana-command]')) {
      choiceKey = key; target.innerHTML = ''; target.classList.add('revealed');
      actions.forEach(a => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'choice-button arcana-action';
        button.dataset.arcanaCommand = a.action.command;
        const outcomeHint = a.action.command === 'start' ? '' : a.outcomeHint;
        const cooldownMarkup = ACTION_COOLDOWN_SECONDS[a.action.command]
          ? '<span class="arcana-cooldown" data-arcana-cooldown="' + a.action.command + '" aria-hidden="true" hidden><span class="arcana-cooldown-fill"></span></span>' : '';
        button.innerHTML = '<span class="arcana-action-title">' + escapeHtml(a.label) + '<span data-action-state></span></span>' + (outcomeHint ? '<small>' + escapeHtml(outcomeHint) + '</small>' : '') + cooldownMarkup;
        button.addEventListener('click', () => {
          const current = latest.availableActions.find(c=>c.action.command===button.dataset.arcanaCommand);
          if (!button.disabled && current) window.ArcanaCombatUI.onAction?.(current.action);
        }); target.append(button);
      });
    }
    update(); return true;
  }
  window.ArcanaCombatUI = { render, updateChoices, onAction: null };
  window.setInterval(() => { if (!document.hidden) update(); }, 100);
})();
