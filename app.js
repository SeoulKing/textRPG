const STORAGE_KEY = "ruined-seoul-stage1-save";
const SAVE_VERSION = 5;
const PHASES = ["아침", "낮", "저녁", "밤", "새벽"];
const REAL_DAY_MS = 15 * 60 * 1000;
const PHASE_DURATION_MS = REAL_DAY_MS / PHASES.length;
const CLOCK_TICK_MS = 1000;
const AUTO_FULLNESS_TICK_MS = REAL_DAY_MS / 4;
const STARVATION_TICK_MS = REAL_DAY_MS / 2;

const STAT_META = {
  hp: { label: "체력", max: 10 },
  mind: { label: "정신력", max: 10 },
  fullness: { label: "포만감", max: 10 },
};

const SKILLS = {
  keenEye: {
    name: "눈썰미",
    description: "숨은 물자, 낙서, 이상한 기척을 먼저 발견합니다.",
  },
  endure: {
    name: "버티기",
    description: "거친 수색이나 이동에서 체력 손실을 덜 받습니다.",
  },
  barter: {
    name: "흥정",
    description: "거래 비용을 낮추고 사람들의 경계를 조금 더 빨리 풉니다.",
  },
};

const QUESTS = {
  meal: {
    name: "오늘 끼니 마련",
    summary: "오늘 하루를 버틸 먹을거리를 챙기거나 사 먹어야 한다.",
  },
  water: {
    name: "물 확보",
    summary: "마실 물이나 물통을 확보해 이동 여유를 만든다.",
  },
  rumor: {
    name: "생활권 확장",
    summary: "지하철역, 골목, 하천변에서 이상한 소문과 이동 경로를 모은다.",
  },
  anomaly: {
    name: "이상 징후 목격",
    summary: "3일차에 심해지는 불길한 조짐을 직접 확인한다.",
  },
  survive: {
    name: "3일 생존",
    summary: "3일차 밤까지 버틴 뒤, 새벽에 벌어질 사건을 맞이한다.",
  },
};

function fullnessLabel(value) {
  if (value >= 9) {
    return "완전 배부름";
  }
  if (value >= 7) {
    return "배부름";
  }
  if (value >= 4) {
    return "평범";
  }
  if (value >= 2) {
    return "배고픔";
  }
  if (value === 1) {
    return "매우 배고픔";
  }
  return "기력 없음";
}

const ACTION_COSTS = {
  snack: {
    fullnessChange: 1,
    starvationRelief: 1,
  },
  meal: {
    fullnessChange: 4,
    mindChange: 1,
    starvationRelief: 3,
  },
  cannedMeal: {
    fullnessChange: 2,
    starvationRelief: 2,
  },
  drink: {
    fullnessChange: 1,
    mindChange: 1,
    starvationRelief: 1,
  },
  medicine: {
    hpChange: 2,
  },
  move: {
  },
  light: {},
  search: {
  },
  work: {
  },
  scout: {
    mindChange: -1,
  },
  anomaly: {
    fullnessChange: -1,
    mindChange: -2,
    starvationPressure: 1,
  },
};

function joinSystemNoteLines(...groups) {
  return groups
    .flatMap((group) => (Array.isArray(group) ? group : [group]))
    .filter(Boolean)
    .join("\n");
}

function formatSignedNumber(value) {
  return `${value > 0 ? "+" : "-"}${Math.abs(value)}`;
}

function formatMoneyLine(amount) {
  return `${amount > 0 ? "+" : "-"} ${Math.abs(amount).toLocaleString()}원`;
}

function formatStatLine(statKey, delta) {
  return `${delta > 0 ? "+" : "-"} ${Math.abs(delta)} ${STAT_META[statKey].label}`;
}

function formatItemLine(itemId, count = 1, prefix = "+") {
  return `${prefix} ${count} ${ITEMS[itemId].name}`;
}

function formatSkillLine(skillId) {
  return `획득: ${SKILLS[skillId].name}`;
}

function formatUnlockLine(label) {
  return `해금: ${label}`;
}

function formatAlertLine(label) {
  return `경고: ${label}`;
}

function formatEventLine(label) {
  return `이벤트: ${label}`;
}

const ITEMS = {
  emergencySnack: {
    name: "비상식량",
    description: "바로 먹어 포만감을 1 회복합니다.",
    usable: true,
    use(state) {
      const note = applyAction(state, "snack", {
        note: "남겨 둔 비상식량을 조금 떼어 먹었다.",
      });
      markMealSecured(state);
      addLog(state, "비상식량으로 허기를 달랬다.");
      return note;
    },
  },
  cannedFood: {
    name: "캔 음식",
    description: "포만감을 2 회복합니다.",
    usable: true,
    use(state) {
      const note = applyAction(state, "cannedMeal", {
        note: "캔을 따서 차갑지만 든든한 식사를 했다.",
      });
      markMealSecured(state);
      addLog(state, "캔 음식을 먹었다.");
      return note;
    },
  },
  hotMeal: {
    name: "따뜻한 식사",
    description: "포만감 4, 정신력 1을 회복합니다.",
    usable: true,
    use(state) {
      const note = applyAction(state, "meal", {
        note: "따뜻한 국물과 밥이 속을 안정시켰다.",
      });
      markMealSecured(state);
      addLog(state, "따뜻한 식사를 챙겨 먹었다.");
      return note;
    },
  },
  waterBottle: {
    name: "물병",
    description: "포만감 1, 정신력 1을 회복합니다.",
    usable: true,
    use(state) {
      const note = applyAction(state, "drink", {
        note: "목을 적시자 정신이 조금 또렷해졌다.",
      });
      markWaterSecured(state);
      addLog(state, "물병을 비웠다.");
      return note;
    },
  },
  painRelief: {
    name: "진통제",
    description: "체력을 2 회복합니다.",
    usable: true,
    use(state) {
      const note = applyAction(state, "medicine", {
        note: "몸의 통증이 조금 누그러졌다.",
      });
      addLog(state, "진통제를 삼켰다.");
      return note;
    },
  },
  scrapBundle: {
    name: "교환용 잡화",
    description: "하천변이나 골목의 거래에서 쓸 수 있는 묶음입니다.",
  },
  rationTicket: {
    name: "배식권",
    description: "급식소에서 한 끼를 무료로 먹을 수 있습니다.",
  },
};

const LOCATIONS = {
  shelter: {
    name: "임시 거처",
    risk: "안전",
    image: "assets/scenes/camp.svg",
    summary: "천막과 담요, 깡통 난로가 모인 가장 안전한 거점이다. 잠을 잘 수 있는 유일한 장소다.",
    links: {
      convenience: { cost: 1, fullnessCost: 0, note: "무너진 횡단보도를 건너 편의점 잔해 쪽으로 간다." },
      kitchen: { cost: 1, fullnessCost: 0, note: "배식 줄이 생기는 급식소로 향한다." },
      alley: { cost: 1, fullnessCost: 1, note: "생활권 가장자리 골목을 따라 돈다." },
    },
  },
  convenience: {
    name: "편의점 잔해",
    risk: "낮음",
    image: "assets/scenes/mart.svg",
    summary: "반쯤 무너진 매장 안에 아직 못 챙긴 자잘한 물자가 남아 있다.",
    links: {
      shelter: { cost: 1, fullnessCost: 0, note: "거처 쪽 골목으로 돌아간다." },
      alley: { cost: 1, fullnessCost: 1, note: "상가 뒷골목으로 이어진다." },
      subway: { cost: 1, fullnessCost: 1, note: "인근 지하철역 입구로 내려간다." },
    },
  },
  kitchen: {
    name: "급식소",
    risk: "낮음",
    image: "assets/scenes/camp.svg",
    summary: "주민과 피란민이 뒤섞여 한 끼를 해결하는 배식 거점이다.",
    links: {
      shelter: { cost: 1, fullnessCost: 0, note: "거처 쪽으로 되돌아간다." },
      alley: { cost: 1, fullnessCost: 1, note: "낮은 담장을 따라 골목으로 빠진다." },
      riverside: { cost: 1, fullnessCost: 1, note: "하천변 쪽 산책로를 따라 내려간다." },
    },
  },
  alley: {
    name: "작은 상가 골목",
    risk: "낮음",
    image: "assets/scenes/checkpoint.svg",
    summary: "거래와 소문이 빠르게 돌고, 우회로도 가장 먼저 발견되는 생활권 중심 골목이다.",
    links: {
      shelter: { cost: 1, fullnessCost: 1, note: "잠자리가 있는 거처로 되돌아간다." },
      convenience: { cost: 1, fullnessCost: 1, note: "편의점 잔해 쪽으로 간다." },
      kitchen: { cost: 1, fullnessCost: 1, note: "급식소 쪽으로 걸음을 옮긴다." },
      subway: { cost: 1, fullnessCost: 1, note: "지하철역 입구가 보이는 큰길로 빠진다." },
      mart: {
        cost: 1,
        fullnessCost: 1,
        note: "골목 뒤편 우회로를 지나 폐마트로 향한다.",
        require(state) {
          if (!state.flags.alleyRouteOpened) {
            return "골목 우회로를 먼저 익혀야 폐마트까지 안전하게 갈 수 있다.";
          }
          return true;
        },
      },
    },
  },
  subway: {
    name: "지하철역",
    risk: "보통",
    image: "assets/scenes/subway.svg",
    summary: "정전된 역사 안엔 소문과 정비 통로, 그리고 설명하기 어려운 불안이 쌓여 있다.",
    links: {
      convenience: { cost: 1, fullnessCost: 1, note: "편의점 잔해 방향 출구로 올라간다." },
      alley: { cost: 1, fullnessCost: 1, note: "상가 골목 쪽 출구로 빠져나간다." },
      mart: { cost: 1, fullnessCost: 1, note: "폐마트 지하 주차장 방면으로 이동한다." },
      control: {
        cost: 1,
        fullnessCost: 1,
        note: "군 통제선 인근의 철조망 쪽으로 이동한다.",
        require(state) {
          if (!state.flags.controlLineOpened) {
            return "지금은 통제선 인근에 갈 이유도, 길도 확실하지 않다.";
          }
          return true;
        },
      },
    },
  },
  mart: {
    name: "폐마트",
    risk: "보통",
    image: "assets/scenes/mart.svg",
    summary: "큰 물건은 이미 털렸지만 창고와 셔터 안쪽엔 아직 쓸 만한 물자가 남아 있다.",
    links: {
      alley: { cost: 1, fullnessCost: 1, note: "골목 우회로로 되돌아간다." },
      subway: { cost: 1, fullnessCost: 1, note: "역사 하부 통로를 따라 이동한다." },
      riverside: { cost: 1, fullnessCost: 1, note: "하천변 옆 제방길로 빠진다." },
    },
  },
  riverside: {
    name: "하천변",
    risk: "보통",
    image: "assets/scenes/riverside.svg",
    summary: "물과 부유물이 모이는 대신, 소문과 수상한 거래도 가장 빨리 흐르는 곳이다.",
    links: {
      kitchen: { cost: 1, fullnessCost: 1, note: "급식소 뒤편 길로 되돌아간다." },
      mart: { cost: 1, fullnessCost: 1, note: "폐마트 방면 제방길을 따라간다." },
      control: {
        cost: 1,
        fullnessCost: 1,
        note: "군 통제선 인근으로 난 샛길을 따라간다.",
        require(state) {
          if (!state.flags.controlLineOpened) {
            return "통제선 쪽 분위기를 확실히 파악한 뒤에야 움직일 수 있다.";
          }
          return true;
        },
      },
    },
  },
  control: {
    name: "통제선 인근",
    risk: "봉쇄",
    image: "assets/scenes/checkpoint.svg",
    summary: "녹슨 철조망과 폐검문소 잔해 너머로 도시 외곽 하늘이 가장 잘 보이는 위험 지대다.",
    links: {
      subway: { cost: 1, fullnessCost: 1, note: "지하철역 방면으로 급히 물러난다." },
      riverside: { cost: 1, fullnessCost: 1, note: "하천변 제방길로 돌아간다." },
    },
  },
};

function calculateMorningFullness(sleepFullness) {
  if (sleepFullness >= 7) {
    return Math.max(0, sleepFullness - 1);
  }
  return sleepFullness;
}

function createInitialState() {
  const now = Date.now();
  const initialSleepFullness = 8;
  const morningFullness = calculateMorningFullness(initialSleepFullness);
  return {
    saveVersion: SAVE_VERSION,
    sceneId: "opening",
    location: "shelter",
    day: 1,
    phaseIndex: 0,
    worldElapsedMs: 0,
    lastRealTimestamp: now,
    autoFullnessElapsedMs: 0,
    starvationElapsedMs: 0,
    isGameOver: false,
    gameOverReason: "",
    stageClear: false,
    stats: {
      hp: 8,
      mind: 6,
      fullness: morningFullness,
    },
    money: 6500,
    skills: [],
    inventory: {
      emergencySnack: 1,
      waterBottle: 1,
    },
    flags: {
      visited_shelter: true,
    },
    quests: {
      meal: "active",
      water: "active",
      rumor: "inactive",
      anomaly: "inactive",
      survive: "active",
    },
    lastSleepFullness: initialSleepFullness,
    starvationLevel: 0,
    log: ["폐허가 된 서울에서 3일을 버텨야 한다."],
    systemNote: "",
  };
}

function hasSkill(state, skillId) {
  return state.skills.includes(skillId);
}

function hasItem(state, itemId, count = 1) {
  return (state.inventory[itemId] || 0) >= count;
}

function addItem(state, itemId, count = 1) {
  state.inventory[itemId] = (state.inventory[itemId] || 0) + count;
}

function removeItem(state, itemId, count = 1) {
  state.inventory[itemId] = Math.max(0, (state.inventory[itemId] || 0) - count);
  if (state.inventory[itemId] === 0) {
    delete state.inventory[itemId];
  }
}

function systemNoteSnapshot(state) {
  return {
    hp: state.stats.hp,
    mind: state.stats.mind,
    fullness: state.stats.fullness,
    money: state.money,
    skills: [...state.skills],
    inventory: JSON.stringify(state.inventory),
    isGameOver: state.isGameOver,
    stageClear: state.stageClear,
  };
}

function hasMeaningfulSystemNoteChange(before, state) {
  if (!before) {
    return true;
  }
  return before.hp !== state.stats.hp
    || before.mind !== state.stats.mind
    || before.fullness !== state.stats.fullness
    || before.money !== state.money
    || before.inventory !== JSON.stringify(state.inventory)
    || before.skills.join("|") !== state.skills.join("|")
    || before.isGameOver !== state.isGameOver
    || before.stageClear !== state.stageClear;
}

function addSkill(state, skillId) {
  if (!state.skills.includes(skillId)) {
    state.skills.push(skillId);
  }
}

function adjustStat(state, statKey, amount) {
  const max = STAT_META[statKey].max;
  state.stats[statKey] = Math.max(0, Math.min(max, state.stats[statKey] + amount));
}

function addLog(state, message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 14);
}

function gameClockLabel(state) {
  const elapsedInDay = ((state.worldElapsedMs || 0) % REAL_DAY_MS + REAL_DAY_MS) % REAL_DAY_MS;
  const totalMinutes = Math.floor((elapsedInDay / REAL_DAY_MS) * 24 * 60);
  const shiftedMinutes = (totalMinutes + 6 * 60) % (24 * 60);
  const roundedMinutes = Math.floor(shiftedMinutes / 10) * 10;
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minutes = String(roundedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function phaseLabel(state) {
  return `${state.day}일차 ${gameClockLabel(state)}`;
}

function dayKey(day, name) {
  return `day${day}_${name}`;
}

function activeDayKey(state, name) {
  return dayKey(state.day, name);
}

function setClockFromElapsed(state) {
  const totalElapsed = Math.max(0, state.worldElapsedMs || 0);
  state.worldElapsedMs = totalElapsed;
  state.day = Math.floor(totalElapsed / REAL_DAY_MS) + 1;
  state.phaseIndex = Math.min(
    PHASES.length - 1,
    Math.floor((totalElapsed % REAL_DAY_MS) / PHASE_DURATION_MS),
  );
}

function appendMindAtmosphere(state, paragraphs) {
  if (state.stats.mind <= 2) {
    paragraphs.push("머릿속이 자꾸 어긋난다. 멀쩡한 철근 소리도 누군가 속삭이는 것처럼 들린다.");
  } else if (state.stats.mind <= 4) {
    paragraphs.push("사소한 금속음에도 신경이 곤두선다. 도시가 조용할수록 더 불안하다.");
  }
}

function markMealSecured(state) {
  state.flags[activeDayKey(state, "mealSecured")] = true;
  syncQuestState(state);
}

function markWaterSecured(state) {
  state.flags[activeDayKey(state, "waterSecured")] = true;
  syncQuestState(state);
}

function syncQuestState(state) {
  state.quests.meal = state.flags[activeDayKey(state, "mealSecured")] ? "completed" : "active";
  state.quests.water = state.flags[activeDayKey(state, "waterSecured")] ? "completed" : "active";
  state.quests.rumor = state.day >= 2 ? (state.flags.rumorHeard ? "completed" : "active") : "inactive";
  state.quests.anomaly = state.day >= 3 ? (state.flags.anomalyWitnessed ? "completed" : "active") : "inactive";
  state.quests.survive = state.stageClear ? "completed" : "active";
}

function triggerGameOver(state, reason) {
  if (state.isGameOver || state.stageClear) {
    return;
  }
  state.isGameOver = true;
  state.gameOverReason = reason;
  state.systemNote = joinSystemNoteLines(formatEventLine("게임 오버"), reason);
  addLog(state, `게임 오버: ${reason}`);
}

function relieveStarvation(state, amount = 1) {
  state.starvationLevel = Math.max(0, (state.starvationLevel || 0) - amount);
}

function applyAutomaticFullnessDecay(state, elapsed, notes) {
  if (elapsed <= 0 || state.stageClear || state.isGameOver) {
    return false;
  }

  let changed = false;
  state.autoFullnessElapsedMs = (state.autoFullnessElapsedMs || 0) + elapsed;

  while (state.autoFullnessElapsedMs >= AUTO_FULLNESS_TICK_MS && !state.isGameOver) {
    state.autoFullnessElapsedMs -= AUTO_FULLNESS_TICK_MS;
    if (state.stats.fullness <= 0) {
      continue;
    }

    const previousStats = { ...state.stats };
    adjustStat(state, "fullness", -1);
    collectThresholdNotes(previousStats, state, notes);
    changed = true;
  }

  return changed;
}

function applyTimeBasedStarvation(state, elapsed, notes) {
  if (state.stats.fullness > 0) {
    state.starvationElapsedMs = 0;
    return false;
  }

  let changed = false;
  state.starvationElapsedMs = (state.starvationElapsedMs || 0) + elapsed;

  while (state.starvationElapsedMs >= STARVATION_TICK_MS && !state.isGameOver) {
    state.starvationElapsedMs -= STARVATION_TICK_MS;
    applyStarvationPressure(state, 1, notes);
    changed = true;
  }

  return changed;
}

function handleDayTransition(state, newDay, notes) {
  const sleptFullness = state.stats.fullness;
  const morningFullness = calculateMorningFullness(sleptFullness);
  const previousDay = newDay - 1;

  state.lastSleepFullness = sleptFullness;
  state.stats.fullness = morningFullness;
  state.autoFullnessElapsedMs = 0;
  state.starvationElapsedMs = 0;

  if (sleptFullness === 0) {
    state.starvationLevel += 1;
  } else if (sleptFullness >= 6) {
    relieveStarvation(state, 1);
  }

  state.flags[dayKey(newDay, "mealSecured")] = false;
  state.flags[dayKey(newDay, "waterSecured")] = false;

  const decay = sleptFullness - morningFullness;
  if (decay > 0) {
    notes.push(formatStatLine("fullness", -decay));
  }

  addLog(state, `${newDay}일차 아침이 되었다.`);

  if (newDay <= 3) {
    state.location = "shelter";
    state.sceneId = morningSceneId(newDay);
    notes.push(formatEventLine(`${newDay}일차 시작`));
  } else {
    state.stageClear = true;
    state.sceneId = "gate_opening";
    notes.push(formatEventLine("게이트 개방"));
  }

  syncQuestState(state);
  finalizeCriticalStates(state, notes);
}

function syncRealTimeClock(state, options = {}) {
  const { now = Date.now() } = options;
  const previousDay = state.day;
  const previousPhase = state.phaseIndex;
  const notes = [];

  if (state.isGameOver || state.stageClear) {
    state.lastRealTimestamp = now;
    return { changed: false, note: "" };
  }

  const elapsed = Math.max(0, now - (state.lastRealTimestamp || now));
  state.lastRealTimestamp = now;

  if (elapsed === 0) {
    return { changed: false, note: "" };
  }

  state.worldElapsedMs = Math.max(0, (state.worldElapsedMs || 0) + elapsed);
  let changed = applyAutomaticFullnessDecay(state, elapsed, notes);
  changed = applyTimeBasedStarvation(state, elapsed, notes) || changed;
  setClockFromElapsed(state);

  changed = state.day !== previousDay || state.phaseIndex !== previousPhase || changed;

  if (state.day !== previousDay) {
    for (let nextDay = previousDay + 1; nextDay <= state.day; nextDay += 1) {
      handleDayTransition(state, nextDay, notes);
      if (state.isGameOver || state.stageClear) {
        break;
      }
    }
  }

  return {
    changed,
    note: joinSystemNoteLines(notes),
  };
}

function collectThresholdNotes(previousStats, nextState, notes) {
  if (previousStats.fullness > 2 && nextState.stats.fullness <= 2 && nextState.stats.fullness > 0) {
    notes.push(formatAlertLine("허기 심화"));
  }
  if (previousStats.fullness > 0 && nextState.stats.fullness === 0) {
    notes.push(formatAlertLine("포만감 0"));
  }
  if (previousStats.mind > 3 && nextState.stats.mind <= 3 && nextState.stats.mind > 0) {
    notes.push(formatAlertLine("정신력 저하"));
  }
}

function applyStarvationPressure(state, amount, notes) {
  if (state.stats.fullness > 0 || amount <= 0) {
    return;
  }

  state.starvationLevel += amount;
  if (state.starvationLevel >= 6) {
    adjustStat(state, "hp", -1);
    state.starvationLevel = Math.max(4, state.starvationLevel - 2);
    notes.push(formatAlertLine("장기 굶주림"));
  }
}

function finalizeCriticalStates(state, notes) {
  if (!state.isGameOver && state.stats.mind <= 0) {
    triggerGameOver(state, "불길한 도시의 소음에 정신이 무너져 버렸다.");
    notes.push(state.systemNote);
  } else if (!state.isGameOver && state.stats.hp <= 0) {
    triggerGameOver(state, "상처와 탈진이 겹쳐 더는 버티지 못했다.");
    notes.push(state.systemNote);
  }
}

function applyStateChanges(state, changes = {}) {
  const {
    fullnessChange = 0,
    mindChange = 0,
    hpChange = 0,
    moneyChange = 0,
    starvationPressure = 0,
    starvationRelief = 0,
    summaryLines = [],
    note = "",
  } = changes;
  const previousStats = { ...state.stats };
  const previousMoney = state.money;
  const notes = [];

  if (fullnessChange !== 0) {
    adjustStat(state, "fullness", fullnessChange);
  }
  if (mindChange !== 0) {
    adjustStat(state, "mind", mindChange);
  }
  if (hpChange !== 0) {
    adjustStat(state, "hp", hpChange);
  }
  if (moneyChange !== 0) {
    state.money = Math.max(0, state.money + moneyChange);
  }
  if (state.stats.fullness > 0) {
    state.starvationElapsedMs = 0;
  }
  if (starvationRelief > 0) {
    relieveStarvation(state, starvationRelief);
  }
  if (state.stats.fullness === 0 && (starvationPressure > 0 || fullnessChange < 0)) {
    applyStarvationPressure(state, starvationPressure || 1, notes);
  }

  collectThresholdNotes(previousStats, state, notes);
  syncQuestState(state);
  finalizeCriticalStates(state, notes);

  const deltaLines = [...summaryLines];
  const hpDelta = state.stats.hp - previousStats.hp;
  const mindDelta = state.stats.mind - previousStats.mind;
  const fullnessDelta = state.stats.fullness - previousStats.fullness;
  const moneyDelta = state.money - previousMoney;

  if (moneyDelta !== 0) {
    deltaLines.push(formatMoneyLine(moneyDelta));
  }
  if (hpDelta !== 0) {
    deltaLines.push(formatStatLine("hp", hpDelta));
  }
  if (mindDelta !== 0) {
    deltaLines.push(formatStatLine("mind", mindDelta));
  }
  if (fullnessDelta !== 0) {
    deltaLines.push(formatStatLine("fullness", fullnessDelta));
  }

  return joinSystemNoteLines(deltaLines, notes);
}

function buildActionChanges(actionType, overrides = {}) {
  return {
    ...(ACTION_COSTS[actionType] || {}),
    ...overrides,
  };
}

function applyAction(state, actionType, overrides = {}) {
  return applyStateChanges(state, buildActionChanges(actionType, overrides));
}

function morningSceneId(day) {
  return `day${day}_morning`;
}

function locationSceneId(locationId) {
  return `${locationId}_hub`;
}

function findBreakfastItem(state) {
  const priority = ["emergencySnack", "cannedFood", "hotMeal"];
  return priority.find((itemId) => hasItem(state, itemId)) || null;
}

function breakfastChoiceText(state) {
  const itemId = findBreakfastItem(state);
  if (!itemId) {
    return "남은 비상식량이 없다";
  }
  return `${ITEMS[itemId].name}을 먹는다`;
}

function breakfastChoiceMeta(state) {
  const itemId = findBreakfastItem(state);
  if (!itemId) {
    return "당장 먹을 것이 없다";
  }
  return `소지한 ${ITEMS[itemId].name}을 사용한다`;
}

function useBreakfastItem(state) {
  const itemId = findBreakfastItem(state);
  if (!itemId) {
    return "남은 식량이 없다.";
  }
  const note = ITEMS[itemId].use(state);
  removeItem(state, itemId, 1);
  return note;
}

function runSleep(state) {
  if (state.flags[activeDayKey(state, "slept")]) {
    return {
      to: "shelter_hub",
      note: "",
    };
  }

  const sleptFullness = state.stats.fullness;

  if (sleptFullness >= 5) {
    adjustStat(state, "hp", 1);
  }
  adjustStat(state, "mind", sleptFullness >= 4 ? 2 : 1);

  addLog(state, `${state.day}일차 ${PHASES[state.phaseIndex]}에 임시 거처에서 잠을 청했다.`);

  const sleepLines = [];
  if (sleptFullness >= 5) {
    sleepLines.push(formatStatLine("hp", 1));
  }
  sleepLines.push(formatStatLine("mind", sleptFullness >= 4 ? 2 : 1));

  const nextDay = state.day + 1;
  const transitionNotes = [];
  state.worldElapsedMs = Math.max(0, (nextDay - 1) * REAL_DAY_MS);
  setClockFromElapsed(state);
  handleDayTransition(state, nextDay, transitionNotes);
  state.lastRealTimestamp = Date.now();

  return {
    to: state.sceneId,
    note: joinSystemNoteLines(sleepLines, transitionNotes),
  };
}

function travelChoice(fromId, toId) {
  const link = LOCATIONS[fromId].links[toId];
  return {
    text: `${LOCATIONS[toId].name}로 이동한다`,
    meta: link.note,
    require(state) {
      if (!link.require) {
        return true;
      }
      return link.require(state);
    },
    resolve(state) {
      state.location = toId;
      state.flags[`visited_${toId}`] = true;
      const note = applyAction(state, "light", {
        note: `이동: ${LOCATIONS[toId].name}`,
      });
      addLog(state, `${LOCATIONS[fromId].name}에서 ${LOCATIONS[toId].name}(으)로 이동했다.`);
      return {
        to: locationSceneId(toId),
        note,
      };
    },
  };
}

function hubTravelChoices(locationId) {
  return Object.keys(LOCATIONS[locationId].links).map((targetId) => travelChoice(locationId, targetId));
}

function searchAvailable(state) {
  return state.phaseIndex < 3 ? true : "밤에는 깊은 수색보다 거처로 돌아가는 편이 안전하다.";
}

function sleepAvailable(state) {
  return state.phaseIndex >= 2 ? true : "아직 낮이다. 조금 더 움직여도 된다.";
}

function currentQuestHint() {
  if (state.isGameOver) {
    return "게임 오버: 새 게임으로 다시 시작하세요.";
  }
  if (state.stageClear) {
    return "3일을 버텨 냈다. 이제 문이 열린 뒤의 세계가 남아 있다.";
  }
  if (state.stats.mind <= 2) {
    return "정신이 위태롭다. 물을 마시고 안전한 곳에서 숨을 고르는 편이 낫다.";
  }
  if (state.stats.fullness <= 1) {
    return "당장 먹을 것이 필요하다. 오늘 끼니를 놓치면 다음 행동이 거칠어진다.";
  }
  if (state.phaseIndex >= 3 && state.location !== "shelter") {
    return "밤이 깊었다. 임시 거처로 돌아가 잠자리를 확보하는 편이 안전하다.";
  }
  if (state.day === 1 && !state.flags.day1_mealSecured) {
    return "우선 오늘 끼니부터 마련하자. 편의점 잔해나 급식소가 가장 빠르다.";
  }
  if (state.day === 1 && !state.flags.day1_waterSecured) {
    return "마실 물도 필요하다. 급식소나 하천변 쪽에서 물을 챙길 수 있다.";
  }
  if (state.day === 2 && !state.flags.rumorHeard) {
    return "생활권을 넓혀 수상한 소문을 모아야 한다. 지하철역과 하천변이 특히 이상하다.";
  }
  if (state.day === 3 && !state.flags.anomalyWitnessed) {
    return "하늘과 도시가 심상치 않다. 지하철역, 하천변, 통제선 인근을 확인해보자.";
  }
  if (state.day === 3 && state.flags.anomalyWitnessed && !state.flags.controlLineScouted) {
    return "이상 징후를 봤다면 통제선 쪽을 확인해야 한다. 밤이 오기 전에 동선을 잡자.";
  }
  if (state.phaseIndex >= 2) {
    return "해가 기운다. 오늘 밤 식사와 잠자리를 정리해 두는 편이 좋다.";
  }
  return "장소를 옮기며 탐색, 거래, 식사, 휴식을 조합해 오늘 하루를 버텨야 한다.";
}

const SCENES = {
  opening: {
    location: "shelter",
    title: "폐허 서울, 1일차 아침",
    text(state) {
      return [
        "새벽의 찬 공기가 천막 틈으로 스며든다. 포성은 잠시 멎었지만, 폐허가 된 서울은 여전히 사람을 살게 두지 않겠다는 얼굴로 아침을 맞고 있다.",
        "속은 이미 오래전에 비어 있었고, 밤새 웅크린 몸은 쉽게 펴지지 않는다. 그래도 오늘을 버티면 내일이 오고, 내일을 버티면 또 하루를 살아낼 수 있다.",
        "먹을 것과 돈을 구하고, 무너지지 않은 마음으로 하루를 밀고 나가야 한다. 어떤 방식으로 살아남아 왔는지가 이제 이 사흘의 모양을 정하게 된다.",
      ];
    },
    choices: [
      {
        text: "작은 흔적부터 읽어내는 쪽이다",
        meta: "눈썰미, 정신력 +1",
        resolve(state) {
          addSkill(state, "keenEye");
          adjustStat(state, "mind", 1);
          addLog(state, "살아남는 방식으로 눈썰미를 택했다.");
          return {
            to: "day1_morning",
            note: joinSystemNoteLines(formatSkillLine("keenEye"), formatStatLine("mind", 1)),
          };
        },
      },
      {
        text: "상처를 견디며 버티는 데 익숙하다",
        meta: "버티기, 체력 +1",
        resolve(state) {
          addSkill(state, "endure");
          adjustStat(state, "hp", 1);
          addLog(state, "살아남는 방식으로 버티기를 택했다.");
          return {
            to: "day1_morning",
            note: joinSystemNoteLines(formatSkillLine("endure"), formatStatLine("hp", 1)),
          };
        },
      },
      {
        text: "사람과 물건을 맞바꾸는 법을 안다",
        meta: "흥정, 돈 +2500",
        resolve(state) {
          addSkill(state, "barter");
          state.money += 2500;
          addLog(state, "살아남는 방식으로 흥정을 택했다.");
          return {
            to: "day1_morning",
            note: joinSystemNoteLines(formatSkillLine("barter"), "+ 2,500원"),
          };
        },
      },
    ],
  },
  day1_morning: {
    location: "shelter",
    title: "아침 첫 선택",
    text(state) {
      return [
        "배 속이 비어 있다는 사실이 잠에서 깨자마자 느껴진다. 오늘 하루를 시작하기 전에 무얼 할지 정해야 한다.",
        "천막 한쪽에는 마지막 비상식량과 물병이 남아 있다. 하지만 지금 먹어 버리면 밤에 후회할 수도 있다.",
      ];
    },
    choices(state) {
      return [
        {
          text: breakfastChoiceText(state),
          meta: breakfastChoiceMeta(state),
          require(currentState) {
            return findBreakfastItem(currentState) ? true : "남은 비상식량이 없다.";
          },
          resolve(currentState) {
            return {
              to: "shelter_hub",
              note: useBreakfastItem(currentState),
            };
          },
        },
        {
          text: "아껴 두고 나중을 본다",
          meta: "지금은 참는다",
          resolve(state) {
            addLog(state, "아침 식량을 아껴 두기로 했다.");
            return {
              to: "shelter_hub",
              note: "",
            };
          },
        },
        {
          text: "밖에서 먹을 것을 구한다",
          meta: "탐색과 거래로 해결한다",
          resolve(state) {
            addLog(state, "아침부터 밖에서 식량을 구하기로 했다.");
            return {
              to: "shelter_hub",
              note: "",
            };
          },
        },
      ];
    },
  },
  day2_morning: {
    location: "shelter",
    title: "2일차 아침, 생활권이 넓어진다",
    text(state) {
      return [
        `어젯밤 포만감 ${state.lastSleepFullness}로 누웠고, 아침에는 ${state.stats.fullness}만 남았다. 하루를 넘기자 생활권 바깥 소문이 더 선명하게 들려오기 시작한다.`,
        "누군가는 지하철역 안쪽에서 전기 같은 소리를 들었다고 하고, 누군가는 하천변에서 밤마다 물결 색이 이상하다고 수군댄다.",
      ];
    },
    choices(state) {
      return [
        {
          text: breakfastChoiceText(state),
          meta: breakfastChoiceMeta(state),
          require(currentState) {
            return findBreakfastItem(currentState) ? true : "당장 먹을 만한 비축분이 없다.";
          },
          resolve(currentState) {
            return {
              to: "shelter_hub",
              note: useBreakfastItem(currentState),
            };
          },
        },
        {
          text: "굶주린 채 바로 나간다",
          meta: "생활권 확장을 우선한다",
          resolve(state) {
            addLog(state, "2일차 아침, 식량을 아끼고 바로 밖으로 나갔다.");
            return {
              to: "shelter_hub",
              note: "",
            };
          },
        },
      ];
    },
  },
  day3_morning: {
    location: "shelter",
    title: "3일차 아침, 도시의 결이 달라진다",
    text(state) {
      return [
        `어젯밤 ${state.lastSleepFullness}로 잠들었고, 아침에는 ${state.stats.fullness}만 남았다. 익숙한 허기인데도 오늘은 다른 종류의 긴장이 섞여 있다.`,
        "거처 바깥 하늘빛이 평소보다 탁하고, 먼 건물 사이로 이유를 설명하기 어려운 떨림 같은 것이 한 번씩 지나간다.",
      ];
    },
    choices(state) {
      return [
        {
          text: breakfastChoiceText(state),
          meta: breakfastChoiceMeta(state),
          require(currentState) {
            return findBreakfastItem(currentState) ? true : "남겨 둔 먹을 것이 없다.";
          },
          resolve(currentState) {
            return {
              to: "shelter_hub",
              note: useBreakfastItem(currentState),
            };
          },
        },
        {
          text: "식사는 미루고 징후부터 확인한다",
          meta: "오늘은 도시가 먼저 신경 쓰인다",
          resolve(state) {
            addLog(state, "3일차 아침, 식사를 미루고 이상 징후부터 확인하기로 했다.");
            return {
              to: "shelter_hub",
              note: "",
            };
          },
        },
      ];
    },
  },
  shelter_hub: {
    location: "shelter",
    title(state) {
      return state.phaseIndex >= 3 ? "임시 거처, 잠들기 전" : "임시 거처";
    },
    text(state) {
      const paragraphs = [
        "작은 난로와 낡은 침낭, 끊어진 전선으로 엮은 문이 이곳을 겨우 거처처럼 보이게 만든다. 완전한 안전은 아니지만 적어도 잠을 청할 수는 있다.",
      ];

      if (state.day === 1) {
        paragraphs.push("첫날의 목표는 단순하다. 오늘 먹을 것과 물, 그리고 밤까지 버틸 최소한의 여유를 마련하는 것.");
      } else if (state.day === 2) {
        paragraphs.push("이제 단순히 한 끼를 잇는 것만으로는 모자라다. 생활권 바깥에서 들려오는 소문이 점점 무시하기 어려워진다.");
      } else {
        paragraphs.push("3일차가 되자 거처 안 공기까지 낯설게 느껴진다. 누구도 큰 소리로 말하지 않지만 모두 하늘을 자주 올려다본다.");
      }

      if (state.phaseIndex >= 2) {
        paragraphs.push("해가 기울었다. 오늘 밤 어디에서 잠들지, 얼마나 먹은 채로 눕는지가 내일 컨디션을 좌우한다.");
      }

      appendMindAtmosphere(state, paragraphs);
      return paragraphs;
    },
    choices(state) {
      const choices = [
        {
          text: "가방과 침낭을 정리하며 숨을 고른다",
          meta: "정신력 +1",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "light", {
              mindChange: 1,
              note: "조용히 짐을 정리하자 호흡이 조금 가라앉았다.",
            });
            addLog(currentState, "임시 거처에서 숨을 골랐다.");
            return { to: "shelter_hub", note };
          },
        },
        {
          text: "오늘의 우선순위를 다시 정리한다",
          meta: "상황 정리",
          resolve(currentState) {
            let hint = "";
            if (currentState.day === 1) {
              hint = "편의점 잔해와 급식소는 첫날 식량 확보에 가장 안정적이다. 물은 급식소나 하천변에서 챙길 수 있다.";
            } else if (currentState.day === 2) {
              hint = "지하철역, 하천변, 골목에서 소문을 주워 모아야 한다. 폐마트 우회로도 아직 쓸 만하다.";
            } else {
              hint = "오늘은 이상 징후를 직접 봐야 한다. 지하철역과 하천변, 통제선 인근이 핵심이다.";
            }
            addLog(currentState, "우선순위를 다시 정리했다.");
            return { to: "shelter_hub", note: "" };
          },
        },
        {
          text: "잠자리에 든다",
          meta: "거처에서 한 번 잠을 자고 몸을 추스른다",
          require: sleepAvailable,
          resolve: runSleep,
        },
      ];

      return choices.concat(hubTravelChoices("shelter"));
    },
  },
  convenience_hub: {
    location: "convenience",
    title: "편의점 잔해",
    text(state) {
      const paragraphs = [
        "유리문은 깨져 있고 계산대 주변엔 먼지가 켜켜이 앉아 있다. 그래도 작은 물자는 누군가 미처 다 챙기지 못한 채 남아 있다.",
      ];
      if (!state.flags.convenienceSearched) {
        paragraphs.push("선반 구석과 계산대 아래를 빠르게 훑어 보면 오늘 첫 끼 분량은 건질 수 있을지도 모른다.");
      } else {
        paragraphs.push("눈에 띄는 곳은 이미 훑었지만, 냉장고 잔해나 박스 더미엔 아직 손댈 구석이 있다.");
      }
      appendMindAtmosphere(state, paragraphs);
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "계산대 아래와 선반 끝을 뒤진다",
          meta: "식량이나 현금을 찾을 수 있다",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "search", {
              moneyChange: !currentState.flags.convenienceSearched ? 1800 : 700,
              summaryLines: !currentState.flags.convenienceSearched
                ? [formatItemLine("cannedFood", 1)]
                : [],
              note: !currentState.flags.convenienceSearched
                ? "구겨진 봉투 사이에서 캔 음식과 약간의 현금을 챙겼다."
                : "남은 건 적었지만 주머니에 넣을 만한 잔돈은 조금 있었다.",
            });
            if (!currentState.flags.convenienceSearched) {
              currentState.flags.convenienceSearched = true;
              addItem(currentState, "cannedFood", 1);
            }
            addLog(currentState, "편의점 잔해를 뒤져 보급품을 찾았다.");
            return { to: "convenience_hub", note };
          },
        },
        {
          text: "냉장고 잔해와 박스 더미를 확인한다",
          meta: "물이나 약을 건질 수 있다",
          require: searchAvailable,
          resolve(currentState) {
            let hpLoss = 0;
            if (!hasSkill(currentState, "endure") && !currentState.flags.convenienceBoxChecked) {
              hpLoss = -1;
            }
            const note = applyAction(currentState, "search", {
              hpChange: hpLoss,
              summaryLines: !currentState.flags.convenienceBoxChecked
                ? [formatItemLine("waterBottle", 1), formatItemLine("emergencySnack", 1)]
                : [],
              note: !currentState.flags.convenienceBoxChecked
                ? "젖은 박스 속에서 물병과 비상식량을 건졌다."
                : "축축한 상자 더미에서 쓸 만한 건 거의 없었다.",
            });
            if (!currentState.flags.convenienceBoxChecked) {
              currentState.flags.convenienceBoxChecked = true;
              addItem(currentState, "waterBottle", 1);
              addItem(currentState, "emergencySnack", 1);
            }
            addLog(currentState, "편의점 잔해의 박스 더미를 살폈다.");
            return { to: "convenience_hub", note };
          },
        },
        {
          text: "근처 떠돌이와 짧게 거래한다",
          meta: hasSkill(state, "barter") ? "돈 -1200, 비상식량 1" : "돈 -1800, 비상식량 1",
          require(currentState) {
            const cost = hasSkill(currentState, "barter") ? 1200 : 1800;
            return currentState.money >= cost ? true : "현금이 모자라 거래를 붙일 수 없다.";
          },
          resolve(currentState) {
            const cost = hasSkill(currentState, "barter") ? 1200 : 1800;
            const note = applyAction(currentState, "light", {
              moneyChange: -cost,
              summaryLines: [formatItemLine("emergencySnack", 1)],
            });
            addItem(currentState, "emergencySnack", 1);
            addLog(currentState, "편의점 근처 떠돌이와 식량을 교환했다.");
            return {
              to: "convenience_hub",
              note,
            };
          },
        },
      ].concat(hubTravelChoices("convenience"));
    },
  },
  kitchen_hub: {
    location: "kitchen",
    title: "급식소",
    text(state) {
      const paragraphs = [
        "큰 냄비에서 김이 오르고, 종이컵을 든 사람들이 짧은 줄을 만든다. 여기선 현금보다 서로의 사정을 얼마나 알고 있느냐가 더 중요할 때도 있다.",
      ];
      if (!state.flags[activeDayKey(state, "mealSecured")]) {
        paragraphs.push("오늘 첫 제대로 된 끼니를 해결하기 가장 쉬운 곳이다.");
      }
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "배식 줄에 서서 한 끼를 해결한다",
          meta: hasItem(state, "rationTicket")
            ? "배식권 사용, 포만감 +4, 정신력 +1"
            : hasSkill(state, "barter")
              ? "돈 -1200, 포만감 +4, 정신력 +1"
              : "돈 -1600, 포만감 +4, 정신력 +1",
          require(currentState) {
            if (currentState.flags[activeDayKey(currentState, "kitchenMeal")]) {
              return "오늘 배식은 이미 한 번 받았다.";
            }
            if (hasItem(currentState, "rationTicket")) {
              return true;
            }
            const cost = hasSkill(currentState, "barter") ? 1200 : 1600;
            return currentState.money >= cost ? true : "한 끼 값을 낼 현금이 부족하다.";
          },
          resolve(currentState) {
            const usedTicket = hasItem(currentState, "rationTicket");
            const mealCost = usedTicket ? 0 : hasSkill(currentState, "barter") ? 1200 : 1600;
            if (usedTicket) {
              removeItem(currentState, "rationTicket", 1);
            }
            currentState.flags[activeDayKey(currentState, "kitchenMeal")] = true;
            markMealSecured(currentState);
            const note = applyAction(currentState, "meal", {
              moneyChange: -mealCost,
              summaryLines: usedTicket ? [formatItemLine("rationTicket", 1, "-")] : [],
              note: "뜨끈한 국과 밥이 속을 안정시켰다.",
            });
            addLog(currentState, "급식소에서 한 끼를 해결했다.");
            return { to: "kitchen_hub", note };
          },
        },
        {
          text: "배식 보조를 하며 오늘 몫을 번다",
          meta: "돈 +1000 또는 배식권 획득",
          require: searchAvailable,
          resolve(currentState) {
            currentState.flags[activeDayKey(currentState, "kitchenHelp")] = true;
            addItem(currentState, "rationTicket", 1);
            const note = applyAction(currentState, "work", {
              moneyChange: 1000,
              summaryLines: [formatItemLine("rationTicket", 1)],
              note: "배식 보조를 마치고 배식권 한 장과 약간의 현금을 받았다.",
            });
            addLog(currentState, "급식소에서 배식 보조를 했다.");
            return { to: "kitchen_hub", note };
          },
        },
        {
          text: "물통을 채워 둔다",
          meta: "물병 1 획득",
          require(currentState) {
            if (currentState.flags[activeDayKey(currentState, "waterFilled")]) {
              return "오늘은 이미 물통을 한 번 채웠다.";
            }
            return searchAvailable(currentState);
          },
          resolve(currentState) {
            currentState.flags[activeDayKey(currentState, "waterFilled")] = true;
            addItem(currentState, "waterBottle", 1);
            markWaterSecured(currentState);
            const note = applyAction(currentState, "light", {
              summaryLines: [formatItemLine("waterBottle", 1)],
              note: "물통 하나를 채워 두자 이동 여유가 조금 생겼다.",
            });
            addLog(currentState, "급식소에서 물통을 채웠다.");
            return { to: "kitchen_hub", note };
          },
        },
      ].concat(hubTravelChoices("kitchen"));
    },
  },
  alley_hub: {
    location: "alley",
    title: "작은 상가 골목",
    text(state) {
      const paragraphs = [
        "깨진 간판과 방치된 자전거 사이로 사람들이 짧게 말을 주고받는다. 이 골목에선 정보가 물자만큼 중요하다.",
      ];
      if (!state.flags.alleyRouteOpened) {
        paragraphs.push("안쪽 우회로를 익혀 두면 폐마트 쪽으로도 안전하게 드나들 수 있을 것이다.");
      }
      if (state.day >= 2 && !state.flags.rumorHeard) {
        paragraphs.push("오늘은 골목에서 들려오는 수군거림이 평소보다 많다.");
      }
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "우회 골목과 샛길을 익힌다",
          meta: "폐마트 해금",
          require(currentState) {
            if (currentState.flags.alleyRouteOpened) {
              return "이미 우회로는 머릿속에 익혀 뒀다.";
            }
            return searchAvailable(currentState);
          },
          resolve(currentState) {
            currentState.flags.alleyRouteOpened = true;
            const note = applyAction(currentState, "search", {
              summaryLines: [formatUnlockLine("폐마트 우회로")],
              note: "",
            });
            addLog(currentState, "상가 골목의 우회로를 익혔다.");
            return { to: "alley_hub", note };
          },
        },
        {
          text: "빈집과 버려진 점포를 뒤진다",
          meta: "잡화나 식량을 찾을 수 있다",
          require: searchAvailable,
          resolve(currentState) {
            let hpLoss = 0;
            if (!hasSkill(currentState, "endure") && !currentState.flags.alleyLooted) {
              hpLoss = -1;
            }
            const note = applyAction(currentState, "search", {
              hpChange: hpLoss,
              moneyChange: currentState.flags.alleyLooted ? 500 : 0,
              summaryLines: !currentState.flags.alleyLooted
                ? [formatItemLine("scrapBundle", 1), formatItemLine("emergencySnack", 1)]
                : [],
              note: !currentState.flags.alleyLooted
                ? "먼지 쌓인 집 안에서 교환용 잡화와 비상식량을 챙겼다."
                : "쓸 만한 건 거의 사라졌지만 구석에서 동전 몇 개를 더 챙겼다.",
            });
            if (!currentState.flags.alleyLooted) {
              currentState.flags.alleyLooted = true;
              addItem(currentState, "scrapBundle", 1);
              addItem(currentState, "emergencySnack", 1);
            }
            addLog(currentState, "골목 안쪽 빈집을 수색했다.");
            return { to: "alley_hub", note };
          },
        },
        {
          text: "떠돌이 상인과 소문을 교환한다",
          meta: state.day >= 2 ? "소문 획득 가능" : "식량과 정보를 맞바꾼다",
          resolve(currentState) {
            const lines = [];
            if (hasItem(currentState, "scrapBundle")) {
              removeItem(currentState, "scrapBundle", 1);
              const rewardItem = hasSkill(currentState, "barter") ? "hotMeal" : "cannedFood";
              addItem(currentState, rewardItem, 1);
              lines.push(formatItemLine("scrapBundle", 1, "-"));
              lines.push(formatItemLine(rewardItem, 1));
            }

            if (currentState.day >= 2 && !currentState.flags.rumorHeard) {
              currentState.flags.rumorHeard = true;
              lines.push("획득: 소문");
            }

            syncQuestState(currentState);
            addLog(currentState, "골목 상인과 정보를 맞바꿨다.");
            return { to: "alley_hub", note: joinSystemNoteLines(lines) };
          },
        },
      ].concat(hubTravelChoices("alley"));
    },
  },
  subway_hub: {
    location: "subway",
    title: "지하철역",
    text(state) {
      const paragraphs = [
        "역사 안은 지나치게 조용하다. 전광판은 죽어 있는데도, 어딘가에선 아주 약한 떨림 같은 것이 반복된다.",
      ];
      if (!state.flags.subwayOfficeChecked) {
        paragraphs.push("역무실이나 정비함에 남은 자료는 생활권 확장에 도움이 될 수 있다.");
      }
      if (state.day >= 3) {
        paragraphs.push("오늘은 플랫폼 끝 어둠이 평소보다 진하게 느껴진다.");
      }
      appendMindAtmosphere(state, paragraphs);
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "역무실 서랍과 지도함을 뒤진다",
          meta: "물자와 경로 정보 확보",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "search", {
              summaryLines: !currentState.flags.subwayOfficeChecked
                ? [formatItemLine("painRelief", 1), formatUnlockLine("통제선 경로")]
                : [],
              note: !currentState.flags.subwayOfficeChecked
                ? "낡은 정비 메모와 진통제를 챙겼다. 통제선 인근으로 이어지는 출구 표시도 눈에 남는다."
                : "중요한 건 이미 챙겼고, 더 건질 건 거의 없다.",
            });
            if (!currentState.flags.subwayOfficeChecked) {
              currentState.flags.subwayOfficeChecked = true;
              addItem(currentState, "painRelief", 1);
              currentState.flags.subwayRouteKnown = true;
            }
            addLog(currentState, "지하철역 역무실을 살폈다.");
            return { to: "subway_hub", note };
          },
        },
        {
          text: "플랫폼 끝 소문을 따라간다",
          meta: "정신력 -1, 2일차 이후 소문 획득",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "scout", {
              summaryLines: currentState.day >= 2 && !currentState.flags.rumorHeard
                ? ["획득: 소문"]
                : [],
              note: currentState.day >= 2 && !currentState.flags.rumorHeard
                ? "금속음 사이에서 누군가 낮게 수군대는 듯한 환청을 들었다. 같은 이야기를 들은 사람이 더 있다는 소문도 확인했다."
                : "바람과 금속이 뒤엉킨 소리가 귀에 남는다.",
            });
            if (currentState.day >= 2) {
              currentState.flags.rumorHeard = true;
            }
            syncQuestState(currentState);
            addLog(currentState, "지하철역 플랫폼 끝까지 다녀왔다.");
            return { to: "subway_hub", note };
          },
        },
        {
          text: "정비 터널 끝의 빛을 확인한다",
          meta: "포만감 -1, 정신력 -2, 3일차 이상 징후",
          require(currentState) {
            if (currentState.day < 3) {
              return "아직은 단순한 소문 수준이라 굳이 더 깊게 들어갈 이유가 없다.";
            }
            if (currentState.flags.subwayAnomalySeen) {
              return "이미 그 빛을 봤다. 다시 확인해도 섬뜩할 뿐이다.";
            }
            return searchAvailable(currentState);
          },
          resolve(currentState) {
            currentState.flags.subwayAnomalySeen = true;
            currentState.flags.anomalyWitnessed = true;
            currentState.flags.controlLineOpened = true;
            const note = applyAction(currentState, "anomaly", {
              summaryLines: ["획득: 이상 징후", formatUnlockLine("통제선 인근")],
              note: "",
            });
            addLog(currentState, "지하철역에서 이상한 섬광을 목격했다.");
            return { to: "subway_hub", note };
          },
        },
      ].concat(hubTravelChoices("subway"));
    },
  },
  mart_hub: {
    location: "mart",
    title: "폐마트",
    text(state) {
      const paragraphs = [
        "넓은 매장 안엔 먼지와 파편이 쌓였지만, 생활 물자 규모만큼은 아직 다른 장소보다 낫다.",
      ];
      if (!state.flags.martFoodLooted) {
        paragraphs.push("통조림 코너와 무너진 창고만 잘 뒤져도 오늘 먹을 몫은 확보할 수 있을지 모른다.");
      }
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "통조림 코너와 진열대 잔해를 훑는다",
          meta: "캔 음식 확보",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "search", {
              summaryLines: !currentState.flags.martFoodLooted
                ? [formatItemLine("cannedFood", 2)]
                : [formatItemLine("emergencySnack", 1)],
              note: !currentState.flags.martFoodLooted
                ? "넘어진 진열대 뒤에서 캔 음식 두 개를 건졌다."
                : "이미 털린 자리가 많아 이번엔 작은 간식거리만 더 챙겼다.",
            });
            if (!currentState.flags.martFoodLooted) {
              currentState.flags.martFoodLooted = true;
              addItem(currentState, "cannedFood", 2);
            } else {
              addItem(currentState, "emergencySnack", 1);
            }
            addLog(currentState, "폐마트 식량 코너를 수색했다.");
            return { to: "mart_hub", note };
          },
        },
        {
          text: "약국 셔터 틈을 벌려 들어간다",
          meta: "진통제 확보 가능",
          require: searchAvailable,
          resolve(currentState) {
            const hpLoss = !hasSkill(currentState, "endure") && !currentState.flags.martClinicChecked ? -1 : 0;
            const note = applyAction(currentState, "search", {
              hpChange: hpLoss,
              summaryLines: !currentState.flags.martClinicChecked
                ? [formatItemLine("painRelief", 1)]
                : [],
              note: !currentState.flags.martClinicChecked
                ? "약국 셔터 안쪽에서 진통제를 건졌다."
                : "남은 건 거의 없지만 찢긴 거즈 몇 장만 굴러다닌다.",
            });
            if (!currentState.flags.martClinicChecked) {
              currentState.flags.martClinicChecked = true;
              addItem(currentState, "painRelief", 1);
            }
            addLog(currentState, "폐마트 약국 셔터를 확인했다.");
            return { to: "mart_hub", note };
          },
        },
        {
          text: "무너진 창고와 계산실을 훑는다",
          meta: "현금이나 교환품을 얻을 수 있다",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "search", {
              moneyChange: !currentState.flags.martCashLooted ? 2200 : 400,
              summaryLines: !currentState.flags.martCashLooted
                ? [formatItemLine("scrapBundle", 1)]
                : [],
              note: !currentState.flags.martCashLooted
                ? "계산실 금고는 비어 있었지만 구겨진 현금과 잡화 묶음은 남아 있었다."
                : "쓸 만한 현금은 거의 없고 허탕친 기분만 남는다.",
            });
            if (!currentState.flags.martCashLooted) {
              currentState.flags.martCashLooted = true;
              addItem(currentState, "scrapBundle", 1);
            }
            addLog(currentState, "폐마트 창고와 계산실을 살폈다.");
            return { to: "mart_hub", note };
          },
        },
      ].concat(hubTravelChoices("mart"));
    },
  },
  riverside_hub: {
    location: "riverside",
    title: "하천변",
    text(state) {
      const paragraphs = [
        "제방 아래 흙탕물은 느리게 흐르지만, 이곳의 공기는 늘 더 빠르게 변한다. 거래도, 소문도, 불길한 징후도 먼저 흘러온다.",
      ];
      if (state.day >= 2 && !state.flags.rumorHeard) {
        paragraphs.push("오늘은 노점상과 부유물 주변에 이상한 이야기가 유난히 많다.");
      }
      if (state.day >= 3) {
        paragraphs.push("물결 끝에 희미하게 번지는 빛이 자꾸 시야에 밟힌다.");
      }
      appendMindAtmosphere(state, paragraphs);
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "떠내려온 상자와 부유물을 건진다",
          meta: "물병과 잡화 확보",
          require: searchAvailable,
          resolve(currentState) {
            const note = applyAction(currentState, "search", {
              summaryLines: !currentState.flags.riversideLooted
                ? [formatItemLine("waterBottle", 1), formatItemLine("scrapBundle", 1)]
                : [formatItemLine("emergencySnack", 1)],
              note: !currentState.flags.riversideLooted
                ? "젖은 상자 안에서 물병과 교환용 잡화를 건졌다."
                : "쓸 만한 것은 줄었지만 비상식량 한 조각 정도는 챙길 수 있었다.",
            });
            if (!currentState.flags.riversideLooted) {
              currentState.flags.riversideLooted = true;
              addItem(currentState, "waterBottle", 1);
              addItem(currentState, "scrapBundle", 1);
              markWaterSecured(currentState);
            } else {
              addItem(currentState, "emergencySnack", 1);
            }
            addLog(currentState, "하천변 부유물을 뒤졌다.");
            return { to: "riverside_hub", note };
          },
        },
        {
          text: "임시 노점상과 거래하거나 소문을 묻는다",
          meta: hasSkill(state, "barter") ? "돈 -1400 또는 소문 획득" : "돈 -2000 또는 소문 획득",
          resolve(currentState) {
            const lines = [];
            const tradeCost = hasSkill(currentState, "barter") ? 1400 : 2000;
            if (currentState.money >= (hasSkill(currentState, "barter") ? 1400 : 2000)) {
              currentState.money -= tradeCost;
              addItem(currentState, "cannedFood", 1);
              lines.push(formatMoneyLine(-tradeCost));
              lines.push(formatItemLine("cannedFood", 1));
            } else if (hasItem(currentState, "scrapBundle")) {
              removeItem(currentState, "scrapBundle", 1);
              addItem(currentState, "hotMeal", 1);
              lines.push(formatItemLine("scrapBundle", 1, "-"));
              lines.push(formatItemLine("hotMeal", 1));
            }

            if (currentState.day >= 2 && !currentState.flags.rumorHeard) {
              currentState.flags.rumorHeard = true;
              lines.push("획득: 소문");
            }
            syncQuestState(currentState);
            addLog(currentState, "하천변 노점상에게 말을 걸었다.");
            return { to: "riverside_hub", note: joinSystemNoteLines(lines) };
          },
        },
        {
          text: "물가에 번지는 빛을 끝까지 확인한다",
          meta: "포만감 -1, 정신력 -2, 3일차 이상 징후",
          require(currentState) {
            if (currentState.day < 3) {
              return "아직은 단순한 반사광처럼 보일 뿐이다.";
            }
            if (currentState.flags.riversideAnomalySeen) {
              return "이미 그 빛을 확인했다.";
            }
            return searchAvailable(currentState);
          },
          resolve(currentState) {
            currentState.flags.riversideAnomalySeen = true;
            currentState.flags.anomalyWitnessed = true;
            currentState.flags.controlLineOpened = true;
            const note = applyAction(currentState, "anomaly", {
              summaryLines: ["획득: 이상 징후", formatUnlockLine("통제선 인근")],
              note: "",
            });
            addLog(currentState, "하천변에서 이상한 빛의 정체를 목격했다.");
            return { to: "riverside_hub", note };
          },
        },
      ].concat(hubTravelChoices("riverside"));
    },
  },
  control_hub: {
    location: "control",
    title: "통제선 인근",
    text(state) {
      const paragraphs = [
        "철조망과 무너진 검문소 잔해가 바람에 울린다. 여기선 도시 외곽 하늘이 유난히 가깝게 보인다.",
      ];
      if (!state.flags.controlLineScouted) {
        paragraphs.push("불길한 빛의 방향을 끝까지 확인하려면 이곳을 직접 봐야 한다.");
      }
      appendMindAtmosphere(state, paragraphs);
      return paragraphs;
    },
    choices(state) {
      return [
        {
          text: "철조망 사이를 정찰한다",
          meta: "정신력 -1",
          require: searchAvailable,
          resolve(currentState) {
            currentState.flags.controlLineScouted = true;
            const note = applyAction(currentState, "scout", {
              summaryLines: [formatUnlockLine("통제선 정찰 기록")],
              note: "",
            });
            addLog(currentState, "통제선 인근을 정찰했다.");
            return { to: "control_hub", note };
          },
        },
        {
          text: "갈라진 하늘을 끝까지 바라본다",
          meta: "3일차 밤이면 Stage 1 종료",
          require(currentState) {
            if (currentState.day < 3) {
              return "아직 결론을 내릴 만한 순간은 아니다.";
            }
            if (!currentState.flags.anomalyWitnessed) {
              return "먼저 이상 징후를 직접 확인해야 한다.";
            }
            if (currentState.phaseIndex < 2) {
              return "해가 더 기울어야 하늘의 변화가 선명해진다.";
            }
            return true;
          },
          resolve(currentState) {
            currentState.stageClear = true;
            currentState.flags.controlLineScouted = true;
            syncQuestState(currentState);
            addLog(currentState, "통제선 인근에서 하늘이 찢어지는 순간을 목격했다.");
            return {
              to: "gate_opening",
              note: joinSystemNoteLines(formatEventLine("게이트 개방"), "Stage 1 종료"),
            };
          },
        },
      ].concat(hubTravelChoices("control"));
    },
  },
  gate_opening: {
    location(state) {
      return state.location;
    },
    title: "4일차 새벽, 문이 열린다",
    text(state) {
      return [
        "밤이 완전히 가라앉을 즈음, 서울의 하늘 한가운데가 유리처럼 금 가기 시작한다. 소리보다 먼저 공기가 갈라지고, 그 틈에서 설명할 수 없는 빛이 쏟아진다.",
        "사흘 동안 버틴 생존의 감각은 여기까지였다. 이제부터는 폐허 서울의 일상이 아니라, 열려 버린 문 너머의 세계가 삶 전체를 바꿔 놓을 것이다.",
      ];
    },
    choices: [
      {
        text: "무너지는 하늘을 끝까지 지켜본다",
        meta: "Stage 1 마무리",
        resolve(state) {
          addLog(state, "게이트 개방을 목격하며 Stage 1을 마쳤다.");
          return {
            to: "stage1_clear",
            note: formatEventLine("Stage 1 종료"),
          };
        },
      },
    ],
  },
  stage1_clear: {
    location(state) {
      return state.location;
    },
    title: "Stage 1 종료",
    text: [
      "폐허가 된 서울에서의 3일 생존은 끝났다. 먹을 것과 물, 잠자리와 소문을 붙잡고 버틴 끝에 세계는 완전히 다른 국면으로 넘어간다.",
      "Stage 2에서는 각성 이후의 선택, 열린 게이트, 더 넓어진 탐험과 세력 구도가 이어질 수 있다.",
    ],
    choices: [],
  },
};

function evaluateChoice(choice, state) {
  if (state.isGameOver) {
    return { enabled: false, reason: "게임 오버 상태입니다. 새 게임으로 다시 시작하세요." };
  }
  if (!choice.require) {
    return { enabled: true, reason: "" };
  }
  const result = choice.require(state);
  if (result === true || result === undefined || result === null) {
    return { enabled: true, reason: "" };
  }
  return {
    enabled: false,
    reason: typeof result === "string" ? result : "조건이 맞지 않는다.",
  };
}

function materializeScene(sceneId, state) {
  if (state.isGameOver) {
    return {
      id: "game_over",
      locationId: state.location,
      title: "버티지 못했다",
      text: [
        state.gameOverReason || "더는 움직일 수 없었다.",
        "새 게임 버튼을 눌러 다시 시작할 수 있다.",
      ],
      choices: [],
      image: LOCATIONS[state.location].image,
      risk: "게임 오버",
    };
  }

  const source = SCENES[sceneId] || SCENES[locationSceneId(state.location)] || SCENES.shelter_hub;
  const locationId = typeof source.location === "function" ? source.location(state) : source.location;
  return {
    id: sceneId,
    locationId,
    title: typeof source.title === "function" ? source.title(state) : source.title,
    text: typeof source.text === "function" ? source.text(state) : source.text,
    choices: typeof source.choices === "function" ? source.choices(state) : source.choices,
    image: LOCATIONS[locationId].image,
    risk: LOCATIONS[locationId].risk,
  };
}

function normalizeLoadedState(parsed, base) {
  const nextState = {
    ...base,
    ...parsed,
    stats: {
      ...base.stats,
      ...(parsed.stats || {}),
    },
    inventory: parsed.inventory || {},
    flags: parsed.flags || {},
    quests: {
      ...base.quests,
      ...(parsed.quests || {}),
    },
    skills: parsed.skills || [],
    log: parsed.log || [],
    systemNote: parsed.systemNote || "",
  };
  nextState.lastRealTimestamp = Date.now();
  setClockFromElapsed(nextState);
  syncQuestState(nextState);
  return nextState;
}

function loadState() {
  const base = createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return base;
    }
    const parsed = JSON.parse(raw);
    if (parsed.saveVersion !== SAVE_VERSION) {
      return base;
    }
    return normalizeLoadedState(parsed, base);
  } catch (error) {
    return base;
  }
}

function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const state = loadState();
let activePanel = "map";
let activeStatusPopoverKey = null;

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
  panelTitle: document.querySelector("#panel-title"),
  panelSubtitle: document.querySelector("#panel-subtitle"),
  panelContent: document.querySelector("#panel-content"),
  dockButtons: Array.from(document.querySelectorAll(".dock-button")),
  newGameButton: document.querySelector("#new-game-button"),
};

const TYPEWRITER_CHAR_DELAY = 35;
const TYPEWRITER_PARAGRAPH_DELAY = 260;
const SYSTEM_NOTE_ANIMATION_MS = 220;

let sceneRenderToken = 0;
let activeSceneTimer = null;
let isSceneTyping = false;
let activeAnimatedScene = null;
let activeSystemNoteTimer = null;
let mapNodeHint = "";

function clearSceneAnimation() {
  sceneRenderToken += 1;
  if (activeSceneTimer !== null) {
    clearTimeout(activeSceneTimer);
    activeSceneTimer = null;
  }
  isSceneTyping = false;
  activeAnimatedScene = null;
}

function clearSystemNoteAnimation() {
  if (activeSystemNoteTimer !== null) {
    clearTimeout(activeSystemNoteTimer);
    activeSystemNoteTimer = null;
  }
  dom.systemNote.style.animation = "";
  dom.systemNote.style.visibility = "";
}

function scheduleStep(callback, delay) {
  return new Promise((resolve) => {
    activeSceneTimer = setTimeout(() => {
      activeSceneTimer = null;
      callback();
      resolve();
    }, delay);
  });
}

async function typeParagraph(paragraphElement, text, token) {
  paragraphElement.classList.add("typing");
  for (let index = 1; index <= text.length; index += 1) {
    if (token !== sceneRenderToken) {
      return false;
    }
    paragraphElement.textContent = text.slice(0, index);
    const currentChar = text[index - 1];
    const delay = /[.!?]/.test(currentChar)
      ? TYPEWRITER_CHAR_DELAY + 40
      : /[,;:]/.test(currentChar)
        ? TYPEWRITER_CHAR_DELAY + 20
        : TYPEWRITER_CHAR_DELAY;
    await scheduleStep(() => {}, delay);
  }
  paragraphElement.classList.remove("typing");
  return token === sceneRenderToken;
}

function renderChoices(scene) {
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");

  scene.choices.forEach((choice) => {
    const availability = evaluateChoice(choice, state);
    const fragment = dom.choiceTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    const label = fragment.querySelector(".choice-label");
    const meta = fragment.querySelector(".choice-meta");
    label.textContent = choice.text;
    meta.textContent = availability.enabled
      ? (choice.meta || "선택을 실행합니다.")
      : availability.reason;
    button.disabled = !availability.enabled;
    button.addEventListener("click", () => handleChoice(choice));
    dom.choices.appendChild(fragment);
  });

  dom.choices.classList.add("revealed");
}

async function animateSceneText(scene, token) {
  activeAnimatedScene = scene;
  isSceneTyping = true;
  dom.sceneText.innerHTML = "";
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");

  for (const paragraph of scene.text) {
    if (token !== sceneRenderToken) {
      isSceneTyping = false;
      activeAnimatedScene = null;
      return;
    }
    const paragraphElement = document.createElement("p");
    dom.sceneText.appendChild(paragraphElement);
    const completed = await typeParagraph(paragraphElement, paragraph, token);
    if (!completed) {
      isSceneTyping = false;
      activeAnimatedScene = null;
      return;
    }
    await scheduleStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  if (token === sceneRenderToken) {
    isSceneTyping = false;
    activeAnimatedScene = null;
    renderChoices(scene);
  }
}

function skipSceneTyping() {
  if (!isSceneTyping || !activeAnimatedScene) {
    return false;
  }

  const scene = activeAnimatedScene;
  clearSceneAnimation();
  dom.sceneText.innerHTML = scene.text.map((paragraph) => `<p>${paragraph}</p>`).join("");
  renderChoices(scene);
  return true;
}

function playSystemNoteAnimation() {
  dom.systemNote.style.animation = "none";
  void dom.systemNote.offsetWidth;
  dom.systemNote.style.animation = "fade-up 220ms ease";
}

function showSystemNoteWithDelay(note, onShown) {
  clearSystemNoteAnimation();
  if (!note) {
    dom.systemNote.hidden = true;
    dom.systemNote.textContent = "";
    if (onShown) {
      onShown();
    }
    return;
  }

  dom.systemNote.hidden = false;
  dom.systemNote.textContent = note;
  dom.systemNote.style.visibility = "hidden";

  activeSystemNoteTimer = setTimeout(() => {
    activeSystemNoteTimer = null;
    dom.systemNote.style.visibility = "visible";
    playSystemNoteAnimation();
    if (onShown) {
      activeSceneTimer = setTimeout(() => {
        activeSceneTimer = null;
        onShown();
      }, SYSTEM_NOTE_ANIMATION_MS);
    }
  }, 0);
}

function statusDetail(state, statKey) {
  if (statKey === "hp") {
    return {
      title: "체력",
      detail: `${state.stats.hp} / ${STAT_META.hp.max}`,
      note: "상처와 탈진을 버티는 힘이다.",
    };
  }
  if (statKey === "mind") {
    return {
      title: "정신력",
      detail: `${state.stats.mind} / ${STAT_META.mind.max}`,
      note: "불안과 이상 징후를 견디는 상태다.",
    };
  }
  return {
    title: "포만감",
    detail: `${fullnessLabel(state.stats.fullness)} (${state.stats.fullness} / ${STAT_META.fullness.max})`,
    note: "시간이 지나면 자동으로 줄어들고, 식사로 회복된다.",
  };
}

function statusTriggerFor(statKey) {
  return dom[`${statKey}Status`] || null;
}

function closeStatusPopover() {
  activeStatusPopoverKey = null;
  dom.statusPopover.hidden = true;
  dom.statusPopover.innerHTML = "";
}

function openStatusPopover(statKey, options = {}) {
  const { toggle = true } = options;
  const trigger = statusTriggerFor(statKey);
  if (!trigger) {
    return;
  }

  if (toggle && activeStatusPopoverKey === statKey && !dom.statusPopover.hidden) {
    closeStatusPopover();
    return;
  }

  activeStatusPopoverKey = statKey;
  const info = statusDetail(state, statKey);
  dom.statusPopover.innerHTML = `
    <strong>${info.title}</strong>
    <p>${info.detail}</p>
    <p>${info.note}</p>
  `;

  const stripRect = dom.statusStrip.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const left = Math.max(12, triggerRect.left - stripRect.left);
  dom.statusPopover.style.left = `${left}px`;
  dom.statusPopover.hidden = false;
}

function renderStatusBar() {
  const hpValue = state.stats.hp;
  dom.hpFill.style.width = `${(hpValue / STAT_META.hp.max) * 100}%`;
  dom.hpStatus.setAttribute("aria-label", `체력 ${hpValue} / ${STAT_META.hp.max}`);

  const mindValue = state.stats.mind;
  dom.mindFill.style.width = `${(mindValue / STAT_META.mind.max) * 100}%`;
  dom.mindStatus.setAttribute("aria-label", `정신력 ${mindValue} / ${STAT_META.mind.max}`);

  const fullnessValue = state.stats.fullness;
  dom.fullnessFill.style.width = `${(fullnessValue / STAT_META.fullness.max) * 100}%`;
  dom.fullnessStatus.setAttribute("aria-label", `포만감 ${fullnessLabel(fullnessValue)} ${fullnessValue} / ${STAT_META.fullness.max}`);

  dom.timeIndicator.textContent = gameClockLabel(state);

  if (activeStatusPopoverKey) {
    openStatusPopover(activeStatusPopoverKey, { toggle: false });
  }
}

function renderScene(animateText = true) {
  const scene = materializeScene(state.sceneId, state);
  dom.sceneArt.src = scene.image;
  dom.sceneLocationBadge.textContent = LOCATIONS[scene.locationId].name;
  dom.sceneRiskBadge.textContent = scene.risk;

  clearSceneAnimation();
  if (animateText) {
    const token = sceneRenderToken;
    dom.sceneText.innerHTML = "";
    dom.choices.innerHTML = "";
    dom.choices.classList.remove("revealed");
    showSystemNoteWithDelay(state.systemNote, () => {
      if (token === sceneRenderToken) {
        animateSceneText(scene, token);
      }
    });
  } else {
    isSceneTyping = false;
    activeAnimatedScene = null;
    dom.sceneText.innerHTML = scene.text.map((paragraph) => `<p>${paragraph}</p>`).join("");
    renderChoices(scene);
    showSystemNoteWithDelay(state.systemNote);
  }
}

function evaluateTravelLink(link, state) {
  if (!link || !link.require) {
    return { reachable: true, reason: "" };
  }
  const result = link.require(state);
  if (result === true || result === undefined || result === null) {
    return { reachable: true, reason: "" };
  }
  return {
    reachable: false,
    reason: typeof result === "string" ? result : "이동 조건이 맞지 않는다.",
  };
}

const HEX_TILE_LAYOUT = {
  shelter: { col: 1, row: 0 },
  convenience: { col: 0, row: 1 },
  kitchen: { col: 2, row: 1 },
  control: { col: 3, row: 1 },
  alley: { col: 1, row: 1 },
  subway: { col: 0, row: 2 },
  mart: { col: 2, row: 2 },
  riverside: { col: 3, row: 2 },
};

function buildHexMapData(state) {
  const currentLocationId = state.location;
  const currentLocation = LOCATIONS[currentLocationId];
  const adjacentEntries = Object.entries(currentLocation.links).map(([targetId, link]) => {
    const availability = evaluateTravelLink(link, state);
    return {
      locationId: targetId,
      location: LOCATIONS[targetId],
      link,
      reachable: availability.reachable,
      reason: availability.reason,
      visited: !!state.flags[`visited_${targetId}`],
    };
  });

  const adjacentMap = new Map(adjacentEntries.map((entry) => [entry.locationId, entry]));
  const visibleIds = new Set([currentLocationId, ...adjacentMap.keys()]);

  Object.keys(LOCATIONS).forEach((locationId) => {
    if (state.flags[`visited_${locationId}`]) {
      visibleIds.add(locationId);
    }
  });

  const tiles = Object.entries(LOCATIONS).map(([locationId, location]) => {
    const adjacent = adjacentMap.get(locationId);
    const isCurrent = locationId === currentLocationId;
    const isAdjacent = !!adjacent;
    const isLocked = isAdjacent && !adjacent.reachable;
    const isReachable = isAdjacent && adjacent.reachable;
    const visited = !!state.flags[`visited_${locationId}`] || isCurrent;
    const isVisible = visibleIds.has(locationId);

    return {
      locationId,
      location,
      layout: HEX_TILE_LAYOUT[locationId],
      isCurrent,
      isAdjacent,
      isLocked,
      isReachable,
      visited,
      isVisible,
      note: adjacent?.link?.note || "",
      reason: adjacent?.reason || "",
    };
  });

  return {
    currentLocation,
    tiles,
    adjacentEntries,
  };
}

function renderMapPanel() {
  const {
    currentLocation,
    tiles,
    adjacentEntries,
  } = buildHexMapData(state);

  const tileMarkup = tiles.filter((tile) => tile.isVisible).map((tile) => {
    const classes = [
      "hex-tile",
      tile.isCurrent ? "is-current" : "",
      tile.isAdjacent ? "is-adjacent" : "",
      tile.isReachable ? "is-reachable" : "",
      tile.isLocked ? "is-locked" : "",
      tile.visited ? "is-visited" : "",
      !tile.isCurrent && !tile.isAdjacent ? "is-known" : "",
    ].filter(Boolean).join(" ");
    const tileMeta = tile.isCurrent
      ? "현재 위치"
      : tile.isLocked
        ? "잠김"
        : tile.isReachable
          ? "이동 가능"
          : tile.visited
            ? "방문함"
            : "";
    const metaMarkup = tileMeta ? `<span class="hex-tile-meta">${tileMeta}</span>` : "";
    return `
      <button
        class="${classes}"
        data-hex-location="${tile.locationId}"
        type="button"
        style="--hex-col:${tile.layout.col}; --hex-row:${tile.layout.row}; --hex-col-odd:${tile.layout.col % 2};"
      >
        <span class="hex-tile-body">
          <span class="hex-tile-risk">${tile.location.risk}</span>
          <span class="hex-tile-name">${tile.location.name}</span>
          ${metaMarkup}
        </span>
      </button>
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
        ${tileMarkup}
      </div>

      <div class="tag-row">
        <span class="tag">채워진 타일: 현재 위치</span>
        <span class="tag">밝은 타일: 바로 이동 가능</span>
        <span class="tag">사선 타일: 조건 부족</span>
        <span class="tag">옅은 타일: 방문한 생활권</span>
      </div>

      <p class="map-node-hint">${mapNodeHint || "인접한 타일만 바로 이동할 수 있습니다."}</p>

      <div class="panel-grid">
        ${adjacentEntries.map((entry) => `
          <article class="map-card ${entry.reachable ? "" : "is-locked"}">
            <div class="map-meta">
              <h3>${entry.location.name}</h3>
              <span class="tag">${entry.location.risk}</span>
            </div>
            <p>${entry.link.note}</p>
            ${entry.reachable
              ? `<div class="map-actions"><button class="inline-action" data-travel-target="${entry.locationId}" type="button">이동</button></div>`
              : `<div class="map-actions"><button class="inline-action secondary" type="button" disabled>${entry.reason}</button></div>`}
          </article>
        `).join("")}
      </div>
    </section>
  `;

  dom.panelContent.querySelectorAll("[data-hex-location]").forEach((button) => {
    button.addEventListener("click", () => {
      const locationId = button.dataset.hexLocation;
      const tile = tiles.find((entry) => entry.locationId === locationId);
      if (!tile) {
        return;
      }
      if (tile.isCurrent) {
        mapNodeHint = `${tile.location.name}에 머물고 있다.`;
        renderPanel();
        return;
      }
      if (tile.isReachable) {
        mapNodeHint = "";
        const choice = travelChoice(state.location, locationId);
        handleChoice(choice);
        return;
      }
      if (tile.isLocked) {
        mapNodeHint = tile.reason || "아직 이동할 수 없는 경로입니다.";
        renderPanel();
        return;
      }
      mapNodeHint = `${tile.location.name}은 지금 위치에서 바로 닿지 않는 생활권이다.`;
      renderPanel();
    });
  });

  dom.panelContent.querySelectorAll("[data-travel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      mapNodeHint = "";
      const choice = travelChoice(state.location, button.dataset.travelTarget);
      handleChoice(choice);
    });
  });
}

function renderInventoryPanel() {
  const itemEntries = Object.entries(state.inventory);
  const moneyCard = `
    <article class="info-card inventory-card">
      <div class="inventory-card-head">
        <h3>돈</h3>
        <span class="tag">${state.money.toLocaleString()}원</span>
      </div>
      <p>생활권 안에서 식사, 거래, 작은 일을 해결할 때 쓰는 현금이다.</p>
    </article>
  `;
  if (itemEntries.length === 0) {
    dom.panelContent.innerHTML = `
      <div class="panel-grid">
        ${moneyCard}
      </div>
      <p class="empty-state">챙겨 둔 물건이 아직 없습니다.</p>
    `;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${moneyCard}
      ${itemEntries.map(([itemId, count]) => {
        const item = ITEMS[itemId];
        const useAction = item.usable
          ? `<div class="item-actions"><button class="inline-action" data-use-item="${itemId}" type="button">사용</button></div>`
          : `<span class="tag">소지 수량 ${count}</span>`;
        return `
          <article class="info-card inventory-card">
            <div class="inventory-card-head">
              <h3>${item.name} x${count}</h3>
              ${useAction}
            </div>
            <p>${item.description}</p>
          </article>
        `;
      }).join("")}
    </div>
  `;

  dom.panelContent.querySelectorAll("[data-use-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.useItem;
      if (!hasItem(state, itemId) || !ITEMS[itemId].usable) {
        return;
      }
      const beforeSnapshot = systemNoteSnapshot(state);
      const note = ITEMS[itemId].use(state);
      removeItem(state, itemId, 1);
      if (hasMeaningfulSystemNoteChange(beforeSnapshot, state) && note) {
        state.systemNote = note;
      }
      render({ animateScene: false });
    });
  });
}

function renderSkillsPanel() {
  if (state.skills.length === 0) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 선택한 생존 방식이 없습니다.</p>`;
    return;
  }
  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${state.skills.map((skillId) => `
        <article class="info-card">
          <h3>${SKILLS[skillId].name}</h3>
          <p>${SKILLS[skillId].description}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderQuestsPanel() {
  const cards = Object.entries(QUESTS).map(([questId, quest]) => {
    const status = state.quests[questId];
    const statusLabel = status === "completed" ? "완료" : status === "active" ? "진행 중" : "잠김";
    return `
      <article class="quest-card">
        <div class="map-meta">
          <h3>${quest.name}</h3>
          <span class="tag">${statusLabel}</span>
        </div>
        <p>${quest.summary}</p>
      </article>
    `;
  }).join("");
  dom.panelContent.innerHTML = `<div class="panel-grid">${cards}</div>`;
}

function renderLogPanel() {
  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${state.log.map((entry) => `
        <article class="log-card">
          <h3>기록</h3>
          <p>${entry}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPanel() {
  const panelConfig = {
    map: {
      title: "지도",
      subtitle: "생활권 안의 장소와 현재 이동 가능 여부를 확인합니다.",
      render: renderMapPanel,
    },
    inventory: {
      title: "아이템",
      subtitle: "음식, 물, 약, 교환품을 정리하고 바로 사용할 수 있습니다.",
      render: renderInventoryPanel,
    },
    skills: {
      title: "스킬",
      subtitle: "현재 가진 생존 방식이 탐색과 거래 결과에 영향을 줍니다.",
      render: renderSkillsPanel,
    },
    quests: {
      title: "퀘스트",
      subtitle: "영웅 서사가 아니라, 당장 살아남기 위한 우선순위를 보여 줍니다.",
      render: renderQuestsPanel,
    },
    log: {
      title: "기록",
      subtitle: "방금까지의 생존 선택과 사건 흐름을 되짚습니다.",
      render: renderLogPanel,
    },
  };

  const selected = panelConfig[activePanel];
  dom.panelTitle.textContent = selected.title;
  dom.panelSubtitle.textContent = selected.subtitle;
  selected.render();
  dom.dockButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === activePanel);
  });
}

function render(options = {}) {
  const { animateScene = true } = options;
  renderStatusBar();
  renderScene(animateScene);
  renderPanel();
  saveState(state);
}

function handleChoice(choice) {
  const beforeClockSnapshot = systemNoteSnapshot(state);
  const clockUpdate = syncRealTimeClock(state);
  if (clockUpdate.changed) {
    if (hasMeaningfulSystemNoteChange(beforeClockSnapshot, state) && clockUpdate.note) {
      state.systemNote = clockUpdate.note;
    }
    render({ animateScene: false });
    return;
  }

  if (state.isGameOver) {
    render({ animateScene: false });
    return;
  }

  const availability = evaluateChoice(choice, state);
  if (!availability.enabled) {
    return;
  }

  const beforeChoiceSnapshot = systemNoteSnapshot(state);
  let outcome = choice;
  if (choice.resolve) {
    outcome = choice.resolve(state);
  }

  if (outcome.note && hasMeaningfulSystemNoteChange(beforeChoiceSnapshot, state)) {
    state.systemNote = outcome.note;
  }
  if (outcome.to) {
    state.sceneId = outcome.to;
  }

  render();
}

dom.dockButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activePanel = button.dataset.panel;
    renderPanel();
  });
});

["hp", "mind", "fullness"].forEach((statKey) => {
  const button = statusTriggerFor(statKey);
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

dom.newGameButton.addEventListener("click", () => {
  const confirmed = window.confirm("새 게임을 시작하면 현재 진행 상황이 모두 초기화됩니다.");
  if (!confirmed) {
    return;
  }
  clearSceneAnimation();
  Object.assign(state, createInitialState());
  activePanel = "map";
  render();
});

syncQuestState(state);
syncRealTimeClock(state, { captureNotes: false });

window.setInterval(() => {
  const beforeTickSnapshot = systemNoteSnapshot(state);
  const clockUpdate = syncRealTimeClock(state);
  if (clockUpdate.changed) {
    if (hasMeaningfulSystemNoteChange(beforeTickSnapshot, state) && clockUpdate.note) {
      state.systemNote = clockUpdate.note;
    }
    render({ animateScene: false });
    return;
  }

  renderStatusBar();
  saveState(state);
}, CLOCK_TICK_MS);

render({ animateScene: !state.isGameOver });

