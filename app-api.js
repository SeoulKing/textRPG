const STORAGE_KEY = "ruined-seoul-stage1-game-id";
const REAL_DAY_MS = 15 * 60 * 1000;
const CLOCK_TICK_MS = 1000;
const TYPEWRITER_CHAR_DELAY = 35;
const TYPEWRITER_PARAGRAPH_DELAY = 260;
const HEX_RATIO = Math.sqrt(3) / 2;
const ACTIVE_LOCATION_IDS = new Set(["shelter", "convenience", "kitchen"]);

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

function buildHexBoardLayout() {
  const dimensions = currentHexDimensions();
  const stepX = dimensions.width * 0.75;
  const stepY = dimensions.height;
  const positions = HEX_BOARD_TEMPLATE.map((slot) => {
    const x = (dimensions.width / 2) + (slot.col * stepX);
    const y = (dimensions.height / 2) + (slot.row * stepY) + ((slot.col % 2) * (dimensions.height / 2));
    return {
      slotId: slot.slotId,
      x: Math.round(x),
      y: Math.round(y),
    };
  });
  const maxX = Math.max(...positions.map((position) => position.x), 0);
  const maxY = Math.max(...positions.map((position) => position.y), 0);

  return {
    dimensions,
    pixelWidth: Math.ceil(maxX + (dimensions.width / 2)),
    pixelHeight: Math.ceil(maxY + (dimensions.height / 2)),
    positions: new Map(positions.map((position) => [position.slotId, {
      x: position.x,
      y: position.y,
    }])),
  };
}

const PANEL_CONFIG = {
  map: {
    title: "이동",
    subtitle: "지금 갈 수 있는 세 지역만 남겨 두었습니다.",
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
  activeAnimatedScene: null,
  isSceneTyping: false,
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
  window.localStorage.setItem(STORAGE_KEY, client.gameId);
}

async function loadGameState() {
  if (!client.gameId) {
    await createNewGame();
    return;
  }

  try {
    const snapshot = await api(`/api/games/${client.gameId}/state`);
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
  } catch (_error) {
    await createNewGame();
  }
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
  client.activeAnimatedScene = null;
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

async function animateSceneText(scene, token) {
  client.activeAnimatedScene = scene;
  client.isSceneTyping = true;
  dom.sceneText.innerHTML = "";
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");

  for (const paragraph of scene.paragraphs) {
    if (token !== client.sceneRenderToken) {
      client.isSceneTyping = false;
      client.activeAnimatedScene = null;
      return;
    }
    const paragraphElement = document.createElement("p");
    dom.sceneText.appendChild(paragraphElement);
    const completed = await typeParagraph(paragraphElement, paragraph, token);
    if (!completed) {
      client.isSceneTyping = false;
      client.activeAnimatedScene = null;
      return;
    }
    await scheduleSceneStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  if (token === client.sceneRenderToken) {
    client.isSceneTyping = false;
    client.activeAnimatedScene = null;
    renderChoices();
  }
}

function skipSceneTyping() {
  const scene = client.activeAnimatedScene;
  if (!client.isSceneTyping || !scene) {
    return false;
  }
  clearSceneAnimation();
  dom.sceneText.innerHTML = scene.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
  renderChoices();
  return true;
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
    label.textContent = choice.label;
    meta.textContent = choice.outcomeHint;
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

  dom.sceneArt.src = location.imagePath || "assets/scenes/camp.svg";
  dom.sceneLocationBadge.textContent = location.name;
  dom.sceneRiskBadge.textContent = location.risk;
  dom.systemNote.hidden = !snapshot.state.systemNote;
  dom.systemNote.textContent = snapshot.state.systemNote || "";

  clearSceneAnimation();
  if (!animateText) {
    dom.sceneText.innerHTML = scene.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
    renderChoices();
    return;
  }

  const token = client.sceneRenderToken;
  animateSceneText(scene, token);
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
  const boardLayout = buildHexBoardLayout();

  const tileMarkup = HEX_BOARD_TEMPLATE.map((slot) => {
    if (!slot.locationId || !ACTIVE_LOCATION_IDS.has(slot.locationId)) {
      return "";
    }
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
          <span class="hex-tile-risk">${location.risk}</span>
          <span class="hex-tile-name">${location.name}</span>
          ${meta ? `<span class="hex-tile-meta">${meta}</span>` : ""}
        </span>
      </button>
    `;
  }).join("");

  const adjacentCards = snapshot.mapEntries
    .filter((entry) => ACTIVE_LOCATION_IDS.has(entry.locationId))
    .filter((entry) => entry.isAdjacent && !entry.isCurrent)
    .map((entry) => {
      const location = visible.get(entry.locationId);
      if (!location) {
        return "";
      }
      return `
        <article class="map-card ${entry.isReachable ? "" : "is-locked"}">
          <div class="map-meta">
            <h3>${location.name}</h3>
            <span class="tag">${location.risk}</span>
          </div>
          <p>${location.summary}</p>
          <div class="map-actions">
            ${entry.isReachable
              ? `<button class="inline-action" data-travel-target="${entry.locationId}" type="button">이동</button>`
              : `<button class="inline-action secondary" type="button" disabled>${entry.reason || "이동 불가"}</button>`}
          </div>
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

      <div class="tag-row">
        <span class="tag">현재 플레이 가능 지역 3곳</span>
        <span class="tag">하얀 타일은 바로 이동 가능</span>
        <span class="tag">빈 슬롯은 사용하지 않음</span>
      </div>

      <p class="map-node-hint">${client.mapHint || "임시 거처, 편의점 잔해, 급식소만 이동할 수 있습니다."}</p>

      <div class="panel-grid">
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

  dom.panelContent.querySelectorAll("[data-travel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      client.mapHint = "";
      submitAction({ type: "travel", targetId: button.dataset.travelTarget });
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
        return `
          <article class="info-card inventory-card">
            <div class="inventory-card-head">
              <h3>${item.name} ${count > 1 ? `x${count}` : ""}</h3>
              <div class="item-actions">
                <button class="inline-action" data-use-item="${item.id}" type="button">사용</button>
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

function renderQuestsPanel() {
  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${client.snapshot.quests.map((quest) => `
        <article class="quest-card">
          <div class="map-meta">
            <h3>${quest.name}</h3>
            <span class="tag">${quest.status}</span>
          </div>
          <p>${quest.summary}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderLogPanel() {
  const logs = client.snapshot.state.log || [];
  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${logs.map((entry) => `
        <article class="log-card">
          <h3>기록</h3>
          <p>${entry}</p>
        </article>
      `).join("")}
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
}

async function submitAction(action) {
  if (!client.gameId || client.actionInFlight) {
    return;
  }
  client.actionInFlight = true;
  try {
    const snapshot = await api(`/api/games/${client.gameId}/actions`, {
      method: "POST",
      body: action,
    });
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
    client.mapHint = "";
    render({ animateScene: true });
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
    const previousSceneId = client.snapshot?.currentScene?.id;
    const previousNote = client.snapshot?.state?.systemNote;
    client.snapshot = snapshot;
    client.lastFetchedAt = Date.now();
    const sceneChanged = previousSceneId !== snapshot.currentScene.id;
    const noteChanged = previousNote !== snapshot.state.systemNote;
    if (sceneChanged || noteChanged) {
      render({ animateScene: false });
      return;
    }
    renderStatusBar();
  } catch (_error) {
    renderStatusBar();
  }
}

async function bootstrap() {
  const health = await api("/api/health");
  if (!health.ok) {
    throw new Error("서버 상태가 올바르지 않습니다.");
  }
  await loadGameState();
  render({ animateScene: true });
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
  await createNewGame();
  render({ animateScene: true });
});

bootstrap().catch((error) => {
  console.error(error);
  dom.sceneText.innerHTML = `<p>서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
  dom.panelContent.innerHTML = `<p class="empty-state">API 서버가 필요합니다.</p>`;
});
