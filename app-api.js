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
    title: "?´ë™",
    subtitle: "ì§€ê¸??Œì•…???´ë™ ê²½ë¡œë¥?ì§€?„ë¡œ ?•ë¦¬?ˆìŠµ?ˆë‹¤.",
  },
  inventory: {
    title: "?„ì´??,
    subtitle: "ê°€ì§?ë¬¼ê±´ê³??ˆì„ ?•ì¸?˜ê³  ë°”ë¡œ ?¬ìš©?????ˆìŠµ?ˆë‹¤.",
  },
  skills: {
    title: "?¤í‚¬",
    subtitle: "?„ì¬ ë³´ìœ  ì¤‘ì¸ ?ì¡´ ë°©ì‹?…ë‹ˆ??",
  },
  quests: {
    title: "?˜ìŠ¤??,
    subtitle: "?¤ëŠ˜ ë²„í‹°ê¸??„í•´ ?„ìš”???°ì„ ?œìœ„?…ë‹ˆ??",
  },
  log: {
    title: "ê¸°ë¡",
    subtitle: "ìµœê·¼ ? íƒê³??´ë™ ê¸°ë¡?…ë‹ˆ??",
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

/** ë©”ì¸ ?œì‚¬ê°€ ?´ë²¤??ì¹´ë“œ(? íƒì§€ ?¬í•¨)ë¥?????true ??buildSnapshotê³??™ì¼ ì¡°ê±´ */
function isEventStoryActive(snapshot) {
  const ev = snapshot?.latestEvent;
  return Boolean(ev && Array.isArray(ev.choices) && ev.choices.length > 0);
}

/** ???´ë²¤???„í™˜Â·backgroundSync ë³´ì¡´ ?ë³„???œë©´ ??*/
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

  // ?´ë²¤?????‰ì‹œ ???„í™˜ ???´ì „ ??ì¹´ë“œë§?ë¶™ì¡???ë©´ ë³µê? ì§í›„ ë³¸ë¬¸???´ê¸‹?œë‹¤.
  if (storySurfaceId(previousSnapshot) !== storySurfaceId(nextSnapshot)) {
    return false;
  }

  // ê°™ì? ?´ë²¤???œë©´?´ë©´ ë³¸ë¬¸?€ latestEvent ê¸°ì??´ë¼ ??ì¹´ë“œ id ë³€?”ë§Œ?¼ë¡œ???Šì? ?ŠëŠ”??
  if (isEventStoryActive(previousSnapshot) && isEventStoryActive(nextSnapshot)) {
    return true;
  }

  // ê°™ì? ??ì¹´ë“œ ??? ì§œÂ·?˜ì´ì¦ˆÂ·ìº??ë²„ì „ ?¬í•¨)???Œë§Œ ?´ì „ ë³¸ë¬¸??? ì??œë‹¤.
  return currentSceneId(previousSnapshot) === currentSceneId(nextSnapshot);
}

function availableActionsSignature(snapshot) {
  const list = snapshot?.availableActions ?? [];
  // idë§?ë³´ë©´ ?¼ë²¨Â·?ŒíŠ¸ë§?ë°”ë€??œë²„ ?‘ë‹µ?ì„œ actionsChangedê°€ falseê°€ ?˜ì–´ ? íƒì§€ DOM??ê°±ì‹ ?˜ì? ?ŠëŠ”??
  return list
    .map((choice) => `${choice.id}:${choice.label}:${choice.outcomeHint ?? ""}:${choice.isAvailable ? "1" : "0"}`)
    .join("|");
}

function preserveDisplayedSceneSnapshot(previousSnapshot, nextSnapshot) {
  return {
    ...nextSnapshot,
    currentScene: previousSnapshot.currentScene,
    // ?œë²„???‰ë™ ëª©ë¡?€ ??ƒ ë°˜ì˜?œë‹¤. ?´ì „ ?¤ëƒ…?·ì„ ? ì??????˜ì´ì¦ˆë§Œ ë°”ë€?backgroundSync ??
    // ??scene ì¹´ë“œ?€ ?¨ê»˜ ë²„íŠ¼ë§??¡ì? ì±„ë¡œ ?¨ëŠ” ë¬¸ì œë¥?ë§‰ëŠ”??
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
      title: "ì²´ë ¥",
      value: `${snapshot.stats.hp} / 10`,
      note: "ë¶€?ì„ ê²¬ë””ê³??€ì§ì¼ ???ˆëŠ” ?íƒœ?…ë‹ˆ??",
    },
    mind: {
      title: "?•ì‹ ??,
      value: `${snapshot.stats.mind} / 10`,
      note: "ë¶ˆì•ˆê³??¼ë¡œ ?ì—?œë„ ?ë‹¨??? ì??˜ëŠ” ?˜ì…?ˆë‹¤.",
    },
    fullness: {
      title: "?¬ë§Œê°?,
      value: `${snapshot.stats.fullness} / 10`,
      note: "?œê°„??ì§€?˜ë©´ ì¤„ì–´?¤ê³ , ?Œì‹ê³?ë¬¼ë¡œ ?Œë³µ?©ë‹ˆ??",
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
  dom.hpStatus.setAttribute("aria-label", `ì²´ë ¥ ${snapshot.stats.hp} / 10`);
  dom.mindStatus.setAttribute("aria-label", `?•ì‹ ??${snapshot.stats.mind} / 10`);
  dom.fullnessStatus.setAttribute("aria-label", `?¬ë§Œê°?${snapshot.stats.fullness} / 10`);
  dom.timeIndicator.textContent = `${snapshot.day}?¼ì°¨ ${gameClockLabel()}`;

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
    const isQuestChoice = choice.label.startsWith("?˜ìŠ¤??");
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
  dom.sceneRiskBadge.textContent = isEventStoryActive(snapshot) ? "?´ë²¤?? : location.risk;
  const eventId = currentEventId(snapshot);
  const actionCount = snapshot.availableActions?.length ?? 0;
  const actionIds = (snapshot.availableActions ?? []).map((c) => c.id).join(", ");
  dom.sceneDebugBadge.textContent = eventId
    ? `event: ${eventId} / scene: ${currentSceneDefinitionId(snapshot)} / actions: ${actionCount} [${actionIds}]`
    : `scene: ${currentSceneDefinitionId(snapshot)} / actions: ${actionCount} [${actionIds}]`;
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
      ? "?„ì¬ ?„ì¹˜"
      : state.isControlled
        ? "?µì œ??
        : state.isReachable
          ? "?´ë™ ê°€??
          : state.isVisited
            ? "ë°©ë¬¸??
            : "";

    return `
      <button
        class="${classes}"
        data-hex-location="${slot.locationId}"
        type="button"
        style="left:${position.x}px; top:${position.y}px; width:${boardLayout.dimensions.width}px; min-height:${boardLayout.dimensions.height}px;"
      >
        <span class="hex-tile-body">
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
          <p>${location.summary}</p>
          ${entry.isReachable ? "" : `<small class="tiny">${entry.reason || "?´ë™ ë¶ˆê?"}</small>`}
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
        client.mapHint = `${location.name}???´ë? ë¨¸ë¬¼???ˆë‹¤.`;
        renderPanel();
        return;
      }
      if (entry.isReachable) {
        client.mapHint = "";
        submitAction({ type: "travel", targetId: locationId });
        return;
      }
      if (entry.isControlled) {
        client.mapHint = entry.reason || "?„ì§ ?´ë™?????†ë‹¤.";
        renderPanel();
        return;
      }
      if (entry.isAdjacent) {
        client.mapHint = entry.reason || "?„ì§ ?´ë™?????†ëŠ” ê²½ë¡œ??";
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
        <h3>??/h3>
        <span class="tag">${snapshot.state.money.toLocaleString()}??/span>
      </div>
      <p>???¼ë? ?¬ê³ , ?„ìš”??ë¬¼ê±´??ë§ˆë ¨?˜ëŠ” ???°ëŠ” ?„ê¸ˆ?´ë‹¤.</p>
    </article>
  `;

  if (itemCards.length === 0) {
    dom.panelContent.innerHTML = `
      <div class="panel-grid">${moneyCard}</div>
      <p class="empty-state">ì§€ê¸?ê°€ì§?ë¬¼ê±´???†ë‹¤.</p>
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
                ${isUsable ? `<button class="inline-action" data-use-item="${item.id}" type="button">?¬ìš©</button>` : ""}
              </div>
            </div>
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
    dom.panelContent.innerHTML = `<p class="empty-state">?„ì§ ?»ì? ?ì¡´ ë°©ì‹???†ë‹¤.</p>`;
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
    return "ì§„í–‰ ì¤?;
  }
  if (status === "completed") {
    return "?„ë£Œ";
  }
  return "?€ê¸?;
}

function renderQuestsPanel() {
  const visibleQuests = (client.snapshot.quests || []).filter((quest) => quest.status !== "inactive");
  if (!visibleQuests.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">?„ì§ ë°›ì? ?˜ìŠ¤?¸ê? ?†ë‹¤.</p>`;
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
          <p>${quest.summary}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderLogPanel() {
  const logs = client.snapshot.state.log || [];
  if (!logs.length) {
    dom.panelContent.innerHTML = `<p class="empty-state">?„ì§ ?¨ê²¨ì§?ê¸°ë¡???†ìŠµ?ˆë‹¤.</p>`;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="log-list">
      ${logs.map((entry) => {
        const timestampLabel = typeof entry === "string"
          ? `${client.snapshot.day}?¼ì°¨ ${gameClockLabel()}`
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
    window.alert(error instanceof Error ? error.message : "?¡ì…˜ ì²˜ë¦¬???¤íŒ¨?ˆìŠµ?ˆë‹¤.");
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
    throw new Error("?œë²„ ?íƒœê°€ ?¬ë°”ë¥´ì? ?ŠìŠµ?ˆë‹¤.");
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
  const confirmed = window.confirm("??ê²Œì„???œì‘?˜ë©´ ?„ì¬ ì§„í–‰ ì¤‘ì¸ ?¸ì…˜ ?€?????¸ì…˜??ë§Œë“¤?´ì§‘?ˆë‹¤.");
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
    window.alert(error instanceof Error ? error.message : "??ê²Œì„???œì‘?˜ì? ëª»í–ˆ?µë‹ˆ??");
  }
});

bootstrap().catch((error) => {
  console.error(error);
  dom.sceneText.innerHTML = `<p>?œë²„???°ê²°?˜ì? ëª»í–ˆ?µë‹ˆ?? ? ì‹œ ???¤ì‹œ ?œë„??ì£¼ì„¸??</p>`;
  dom.panelContent.innerHTML = `<p class="empty-state">API ?œë²„ê°€ ?„ìš”?©ë‹ˆ??</p>`;
});

