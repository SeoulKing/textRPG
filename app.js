const STORAGE_KEY = "embers-below-save";
const PHASES = ["새벽", "아침", "낮", "저녁", "밤"];
const REAL_DAY_MS = 15 * 60 * 1000;
const PHASE_DURATION_MS = REAL_DAY_MS / PHASES.length;
const FULLNESS_TICK_MS = REAL_DAY_MS / 6;
const STARVATION_DAMAGE_MS = 60 * 1000;
const CLOCK_TICK_MS = 1000;

const STAT_META = {
  hp: { label: "체력", max: 10 },
  mind: { label: "정신력", max: 10 },
  fullness: { label: "포만감", max: 10 },
};

const SKILLS = {
  observation: {
    name: "관찰",
    description: "숨은 단서와 위험 신호를 남보다 먼저 읽어냅니다.",
  },
  survival: {
    name: "생존",
    description: "험한 장소에서 체력 소모를 줄이고 거친 상황을 버텨냅니다.",
  },
  barter: {
    name: "흥정",
    description: "거래와 협상에서 손해를 덜 보고 정보도 더 쉽게 얻습니다.",
  },
};

const ITEMS = {
  ration: {
    name: "건조 식량",
    description: "포만감을 3 회복합니다.",
    usable: true,
    use(state) {
      adjustStat(state, "fullness", 3);
      state.starvationElapsedMs = 0;
      addLog(state, "건조 식량을 먹고 다시 움직일 힘을 냈다.");
      return "거친 맛이지만 속이 조금은 든든해졌다.";
    },
  },
  painkillers: {
    name: "진통제",
    description: "체력을 2 회복합니다.",
    usable: true,
    use(state) {
      adjustStat(state, "hp", 2);
      addLog(state, "진통제를 삼키고 숨을 고른다.");
      return "몸의 결리는 통증이 조금 누그러졌다.";
    },
  },
  metroMap: {
    name: "정비 지도",
    description: "지하 통로와 병원 연결 동선을 파악할 수 있습니다.",
  },
  triageKey: {
    name: "분류실 열쇠",
    description: "병원 약품 보관 구역의 잠긴 문을 열 수 있습니다.",
  },
  antibiotics: {
    name: "항생제 팩",
    description: "캠프의 환자에게 꼭 필요한 약품입니다.",
  },
  filter: {
    name: "정수 필터",
    description: "쓸모 있는 교환품. 몇몇 인물이 다르게 반응할 수 있습니다.",
  },
};

const QUESTS = {
  medicineRun: {
    name: "약품 수색",
    summary: "캠프의 환자를 살리기 위해 항생제를 찾아 돌아와야 한다.",
  },
  easternGate: {
    name: "동쪽 길",
    summary: "캠프의 일을 마친 뒤 검문소 바깥으로 이어지는 길을 확인한다.",
  },
};

const LOCATIONS = {
  camp: {
    name: "생존자 캠프",
    risk: "안전",
    image: "assets/scenes/camp.svg",
    summary: "잔불과 천막이 이어진 작은 거점. 잠깐 숨을 돌릴 수 있는 몇 안 되는 장소다.",
    links: {
      mart: { cost: 1, note: "무너진 골목을 지나야 한다." },
      riverside: { cost: 1, note: "하천변 바람을 따라 남쪽으로 내려간다." },
      subway: { cost: 1, note: "끊긴 전광판 아래 계단으로 향한다." },
    },
  },
  mart: {
    name: "폐허 마트",
    risk: "낮음",
    image: "assets/scenes/mart.svg",
    summary: "유리 파편과 뒤집힌 진열대가 남은 생활 터전. 작은 보급품이 남아 있을 수 있다.",
    links: {
      camp: { cost: 1, note: "캠프 쪽 골목으로 되돌아간다." },
      subway: { cost: 1, note: "후문 쪽 골조를 타고 지하 역사로 이어진다." },
    },
  },
  riverside: {
    name: "하천변",
    risk: "보통",
    image: "assets/scenes/riverside.svg",
    summary: "흙탕물과 안개가 깔린 강변. 떠내려온 물건과 수상한 거래가 함께 모이는 곳이다.",
    links: {
      camp: { cost: 1, note: "캠프의 불빛을 향해 되돌아간다." },
      hospital: { cost: 1, note: "둑길 끝의 병원으로 이동한다." },
    },
  },
  subway: {
    name: "지하철 폐역",
    risk: "보통",
    image: "assets/scenes/subway.svg",
    summary: "전기가 끊긴 플랫폼과 어두운 정비 통로가 이어진다. 길을 알면 의외의 지름길이 된다.",
    links: {
      camp: { cost: 1, note: "캠프로 이어지는 계단을 올라간다." },
      mart: { cost: 1, note: "마트 후문과 닿아 있는 붕괴 통로로 향한다." },
      hospital: { cost: 1, note: "정비 통로를 따라 병원 쪽으로 이동한다." },
    },
  },
  hospital: {
    name: "폐허 병원",
    risk: "높음",
    image: "assets/scenes/hospital.svg",
    summary: "한때 사람을 살리던 건물이 이제는 불빛 하나 없이 서 있다. 필요한 약은 여기 있을 가능성이 높다.",
    links: {
      riverside: { cost: 1, note: "둑길을 따라 강변으로 내려간다." },
      subway: { cost: 1, note: "지하 정비 통로 쪽으로 빠져나간다." },
      checkpoint: {
        cost: 1,
        note: "병원 동쪽 담장을 돌아 검문소 잔해로 향한다.",
        require(state) {
          if (!state.flags.checkpointUnlocked) {
            return "캠프의 일을 마무리해야 동쪽 길이 열린다.";
          }
          return true;
        },
      },
    },
  },
  checkpoint: {
    name: "동쪽 검문소",
    risk: "봉쇄",
    image: "assets/scenes/checkpoint.svg",
    summary: "도시 밖으로 나가는 길목. 지금은 무너졌지만, 다음 이야기를 예고하는 장소다.",
    links: {
      hospital: { cost: 1, note: "병원 담장을 따라 되돌아간다." },
    },
  },
};

function createInitialState() {
  const now = Date.now();
  return {
    sceneId: "opening",
    location: "camp",
    day: 1,
    phaseIndex: 1,
    worldElapsedMs: PHASE_DURATION_MS,
    lastRealTimestamp: now,
    hungerElapsedMs: 0,
    starvationElapsedMs: 0,
    isGameOver: false,
    gameOverReason: "",
    stats: {
      hp: 8,
      mind: 7,
      fullness: 6,
    },
    money: 12,
    skills: [],
    inventory: {},
    flags: {},
    quests: {
      medicineRun: "inactive",
      easternGate: "inactive",
    },
    log: ["잔불 아래에서 눈을 떴다."],
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

function addSkill(state, skillId) {
  if (!state.skills.includes(skillId)) {
    state.skills.push(skillId);
  }
}

function adjustStat(state, statKey, amount) {
  const max = STAT_META[statKey].max;
  const nextValue = Math.max(0, Math.min(max, state.stats[statKey] + amount));
  state.stats[statKey] = nextValue;
}

function addLog(state, message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 12);
}

function setClockFromElapsed(state) {
  const totalElapsed = Math.max(PHASE_DURATION_MS, state.worldElapsedMs || PHASE_DURATION_MS);
  state.worldElapsedMs = totalElapsed;
  state.day = Math.floor(totalElapsed / REAL_DAY_MS) + 1;
  state.phaseIndex = Math.min(
    PHASES.length - 1,
    Math.floor((totalElapsed % REAL_DAY_MS) / PHASE_DURATION_MS),
  );
}

function phaseLabel(state) {
  return `${state.day}일차 ${PHASES[state.phaseIndex]}`;
}

function triggerGameOver(state, reason) {
  if (state.isGameOver) {
    return;
  }

  state.isGameOver = true;
  state.gameOverReason = reason;
  state.systemNote = reason;
  addLog(state, `게임 오버: ${reason}`);
}

function syncRealTimeClock(state, options = {}) {
  const { captureNotes = true, now = Date.now() } = options;
  const previousPhase = phaseLabel(state);
  const notes = [];
  let changed = false;

  if (state.isGameOver) {
    state.lastRealTimestamp = now;
    return { changed: false, note: "" };
  }

  const elapsed = Math.max(0, now - (state.lastRealTimestamp || now));
  state.lastRealTimestamp = now;

  if (elapsed === 0) {
    return { changed: false, note: "" };
  }

  state.worldElapsedMs = Math.max(PHASE_DURATION_MS, (state.worldElapsedMs || PHASE_DURATION_MS) + elapsed);
  setClockFromElapsed(state);

  if (phaseLabel(state) !== previousPhase) {
    changed = true;
  }

  state.hungerElapsedMs = (state.hungerElapsedMs || 0) + elapsed;
  while (state.hungerElapsedMs >= FULLNESS_TICK_MS && !state.isGameOver) {
    state.hungerElapsedMs -= FULLNESS_TICK_MS;
    if (state.stats.fullness > 0) {
      adjustStat(state, "fullness", -1);
      changed = true;
      if (captureNotes) {
        if (state.stats.fullness === 4) {
          notes.push("슬슬 허기가 몰려온다. 하루에 두 끼 정도는 챙겨야 버틸 수 있다.");
        } else if (state.stats.fullness === 2) {
          notes.push("배가 비기 시작한다. 곧 식사를 해야 한다.");
        } else if (state.stats.fullness === 0) {
          notes.push("포만감이 바닥났다. 이제부터 굶주림이 체력을 조금씩 깎기 시작한다.");
        }
      }
    }
  }

  if (state.stats.fullness === 0) {
    state.starvationElapsedMs = (state.starvationElapsedMs || 0) + elapsed;
  } else {
    state.starvationElapsedMs = 0;
  }

  while (state.stats.fullness === 0 && state.starvationElapsedMs >= STARVATION_DAMAGE_MS && !state.isGameOver) {
    state.starvationElapsedMs -= STARVATION_DAMAGE_MS;
    adjustStat(state, "hp", -1);
    changed = true;

    if (state.stats.hp <= 0) {
      triggerGameOver(state, "굶주림 끝에 더는 버티지 못했다.");
      notes.push(state.gameOverReason);
      break;
    }

    if (captureNotes) {
      notes.push("굶주림으로 체력이 조금씩 깎이고 있다.");
    }
  }

  if (!state.isGameOver && state.stats.hp <= 0) {
    triggerGameOver(state, "상처가 겹쳐 더는 버틸 수 없었다.");
    changed = true;
    notes.push(state.gameOverReason);
  }

  if (!notes.length && changed && captureNotes && phaseLabel(state) !== previousPhase) {
    notes.push(`현재 시간: ${phaseLabel(state)}`);
  }

  return {
    changed,
    note: notes[notes.length - 1] || "",
  };
}

function advanceTime(state, steps = 1) {
  syncRealTimeClock(state, { captureNotes: false });
  const pace = steps > 1 ? "움직이는 동안에도" : "행동하는 동안에도";
  return `${pace} 실제 시간은 계속 흐른다. 현재 시간: ${phaseLabel(state)}`;
}

function setQuest(state, questId, nextStatus) {
  state.quests[questId] = nextStatus;
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
      const note = advanceTime(state, link.cost || 1);
      addLog(state, `${LOCATIONS[fromId].name}에서 ${LOCATIONS[toId].name}(으)로 이동했다.`);
      return {
        to: `${toId}_hub`,
        note,
      };
    },
  };
}

function hubTravelChoices(locationId) {
  return Object.keys(LOCATIONS[locationId].links).map((targetId) => travelChoice(locationId, targetId));
}

const SCENES = {
  opening: {
    location: "camp",
    title: "잔불 아래에서 눈을 뜬다",
    text: [
      "해가 막 올라오려는 시간, 캠프 바깥에서 금속이 부딪히는 소리가 희미하게 들린다. 천막 사이를 스치는 바람에는 연기 냄새와 눅눅한 흙냄새가 함께 섞여 있다.",
      "오늘은 약품을 찾으러 나가야 한다. 떠나기 전에, 어떤 방식으로 살아남아 왔는지부터 정해야 한다.",
    ],
    choices: [
      {
        text: "낯선 기척부터 읽는다",
        meta: "관찰 +1, 정신력 +1",
        resolve(state) {
          addSkill(state, "observation");
          adjustStat(state, "mind", 1);
          state.flags.origin = "observer";
          addLog(state, "살아남는 방식: 관찰");
          return {
            to: "camp_intro",
            note: "작은 흔적과 단서를 놓치지 않는 감각이 몸에 배어 있다.",
          };
        },
      },
      {
        text: "몸으로 버티는 쪽이 익숙하다",
        meta: "생존 +1, 체력 +1",
        resolve(state) {
          addSkill(state, "survival");
          adjustStat(state, "hp", 1);
          state.flags.origin = "survivor";
          addLog(state, "살아남는 방식: 생존");
          return {
            to: "camp_intro",
            note: "상처를 견디고 움직이는 법을 먼저 배워왔다.",
          };
        },
      },
      {
        text: "사람과 거래하는 법을 안다",
        meta: "흥정 +1, 돈 +6",
        resolve(state) {
          addSkill(state, "barter");
          state.money += 6;
          state.flags.origin = "broker";
          addLog(state, "살아남는 방식: 흥정");
          return {
            to: "camp_intro",
            note: "말 한마디와 눈빛 하나로도 판세를 바꾸는 법을 안다.",
          };
        },
      },
    ],
  },
  camp_intro: {
    location: "camp",
    title: "캠프의 부탁",
    text: [
      "천막 가장자리에서 미라가 기다리고 있다. 밤새 열이 오른 재희를 살리려면 오늘 안에 항생제를 구해야 한다고 한다.",
      "캠프 안에서는 이미 가진 약이 바닥났고, 남아 있을 만한 곳은 폐허 병원뿐이다. 다만 병원까지 가는 길은 하나가 아니다.",
    ],
    choices: [
      {
        text: "약품을 찾으러 나선다",
        meta: "주 퀘스트 시작",
        resolve(state) {
          setQuest(state, "medicineRun", "active");
          state.flags.questAccepted = true;
          addLog(state, "퀘스트 시작: 약품 수색");
          return {
            to: "camp_hub",
            note: "미라는 병원에 가기 전, 게시판과 주변 소문부터 확인해보라고 조언했다.",
          };
        },
      },
    ],
  },
  camp_hub: {
    location: "camp",
    title(state) {
      if (state.flags.questCompleted) {
        return "숨을 고른 캠프";
      }
      return "생존자 캠프";
    },
    text(state) {
      const paragraphs = [
        "깨어진 버스 옆에 세운 천막들 사이로 아침빛이 비스듬히 내려앉는다. 캠프는 조용하지만, 모두가 오늘 하루를 버틸 자원을 계산하고 있다는 긴장감이 퍼져 있다.",
      ];

      if (state.flags.medicineSecured && !state.flags.questCompleted) {
        paragraphs.push("가방 안의 항생제 팩이 묵직하게 느껴진다. 이제 미라에게 돌아가면 된다.");
      } else if (!state.flags.boardChecked) {
        paragraphs.push("급하게 나서기 전에 게시판과 사람들 입에서 흘러나오는 정보들을 모아두는 편이 좋다.");
      } else {
        paragraphs.push("캠프 바깥으로 나가기 전에 장비와 동선을 다시 점검할 수 있다.");
      }

      return paragraphs;
    },
    choices(state) {
      const choices = [];

      if (!state.flags.boardChecked) {
        choices.push({
          text: "캠프 게시판을 훑어본다",
          meta: "병원으로 가는 힌트를 정리한다",
          to: "camp_board",
        });
      }

      choices.push({
        text: "미라와 짧게 이야기한다",
        meta: "현재 상황과 힌트를 다시 확인한다",
        to: "camp_mira",
      });

      if (state.flags.medicineSecured && !state.flags.questCompleted) {
        choices.push({
          text: "미라에게 항생제를 건넨다",
          meta: "퀘스트 완료, 보상 획득",
          to: "camp_turnin",
        });
      }

      choices.push({
        text: "모닥불 곁에서 잠깐 쉰다",
        meta: "체력 +2, 정신력 +1, 포만감 +2",
        resolve(state) {
          adjustStat(state, "hp", 2);
          adjustStat(state, "mind", 1);
          adjustStat(state, "fullness", 2);
          const note = advanceTime(state, 1);
          addLog(state, "캠프 모닥불 곁에서 숨을 골랐다.");
          return {
            to: "camp_rest",
            note,
          };
        },
      });

      return choices.concat(hubTravelChoices("camp"));
    },
  },
  camp_board: {
    location: "camp",
    title: "찢긴 메모와 입소문",
    text: [
      "게시판에는 제대로 붙어 있는 종이보다 절반쯤 뜯긴 쪽지가 더 많다. 그 사이에서 쓸 만한 내용 몇 가지가 눈에 들어온다.",
      "지하철 폐역 쪽 정비실에 예전 도면이 남아 있다는 말, 하천변의 브로커가 병원 분류실 열쇠를 만져본 적 있다는 말, 그리고 병원 상층부에는 아직 약품이 남아 있을 수 있다는 소문이다.",
    ],
    choices: [
      {
        text: "기억해두고 준비를 마친다",
        meta: "캠프로 돌아간다",
        resolve(state) {
          state.flags.boardChecked = true;
          addLog(state, "병원으로 가는 단서를 게시판에서 정리했다.");
          return {
            to: "camp_hub",
            note: "정비 지도나 분류실 열쇠를 확보하면 병원 수색이 훨씬 쉬워질 것이다.",
          };
        },
      },
    ],
  },
  camp_mira: {
    location: "camp",
    title: "미라의 조언",
    text(state) {
      const paragraphs = [
        "미라는 작은 금속 컵을 쥔 채 말한다. 병원에는 약이 남아 있을 거라고, 다만 정면만 보고 들어가면 괜히 다치기 쉽다고.",
      ];

      if (state.flags.subwayMapFound) {
        paragraphs.push("정비 지도를 찾았다는 말을 꺼내자 미라는 고개를 끄덕인다. 병원 상층으로 들어갈 때 도움이 될 거라고 한다.");
      } else if (state.flags.brokerMet) {
        paragraphs.push("하천변 브로커를 만났다면 분류실 열쇠 얘기를 들었을지도 모른다. 병원 약품실을 여는 또 다른 방법이다.");
      } else {
        paragraphs.push("지하철 폐역이나 하천변에서 먼저 길을 열어보라고 한다. 병원은 준비 없이 들어가기엔 너무 크고 너무 조용하다.");
      }

      return paragraphs;
    },
    choices: [
      {
        text: "고개를 끄덕이고 돌아선다",
        meta: "캠프로 돌아간다",
        to: "camp_hub",
      },
    ],
  },
  camp_rest: {
    location: "camp",
    title: "잔불 곁의 짧은 휴식",
    text: [
      "끓는 물 냄비에서 올라오는 김과 장작 타는 소리가 잠깐이나마 긴장을 밀어낸다. 완전히 안전한 곳은 아니지만, 적어도 지금만큼은 숨을 돌릴 수 있다.",
    ],
    choices: [
      {
        text: "다시 준비를 점검한다",
        meta: "캠프 허브로 돌아간다",
        to: "camp_hub",
      },
    ],
  },
  camp_turnin: {
    location: "camp",
    title: "겨우 붙잡은 숨",
    text: [
      "미라는 항생제 팩을 받아 들자마자 재희가 누운 천막 쪽으로 뛰어간다. 얼마 지나지 않아 캠프 곳곳에 조용한 안도의 기색이 번진다.",
      "고생한 대가로 약간의 현금과 식량을 건네받았다. 그리고 병원 동쪽 검문소 쪽 길을 살펴봐도 좋겠다는 말을 듣는다.",
    ],
    choices: [
      {
        text: "조용히 숨을 고른다",
        meta: "보상 획득, 동쪽 길 해금",
        resolve(state) {
          if (hasItem(state, "antibiotics")) {
            removeItem(state, "antibiotics", 1);
          }
          state.money += 14;
          addItem(state, "ration", 1);
          state.flags.questCompleted = true;
          state.flags.checkpointUnlocked = true;
          setQuest(state, "medicineRun", "completed");
          setQuest(state, "easternGate", "active");
          addLog(state, "퀘스트 완료: 약품 수색");
          return {
            to: "camp_hub",
            note: "캠프가 조금은 안정을 되찾았다. 이제 병원 동쪽 검문소까지 나가볼 수 있다.",
          };
        },
      },
    ],
  },
  mart_hub: {
    location: "mart",
    title: "폐허 마트",
    text(state) {
      const paragraphs = [
        "형광등이 모두 죽은 매장 안에는 깨진 냉장고와 뒤엉킨 쇼핑 카트만 남아 있다. 그래도 누군가 훑고 지나간 흔적이 오래되지는 않았다.",
      ];

      if (!state.flags.martFirstLoot) {
        paragraphs.push("빠르게 챙길 수 있는 보급품이 아직 남아 있을지도 모른다.");
      } else {
        paragraphs.push("눈에 띄는 건 대부분 이미 털렸지만, 깊숙한 곳은 여전히 긴장을 부른다.");
      }

      return paragraphs;
    },
    choices() {
      return [
        {
          text: "계산대 주변을 뒤진다",
          meta: "식량이나 잔돈을 찾을 수 있다",
          resolve(state) {
            if (!state.flags.martFirstLoot) {
              state.flags.martFirstLoot = true;
              addItem(state, "ration", 2);
              state.money += 4;
              addLog(state, "폐허 마트에서 식량과 잔돈을 건졌다.");
              return {
                to: "mart_result",
                note: "먼지 속에 남아 있던 건조 식량 두 묶음과 구겨진 현금을 챙겼다.",
              };
            }
            adjustStat(state, "mind", -1);
            addLog(state, "폐허 마트는 이미 여러 번 털린 상태였다.");
            return {
              to: "mart_result",
              note: "뒤집힌 서랍과 찢긴 영수증만 남아 있다. 허탕친 기분이 썩 좋지 않다.",
            };
          },
        },
        {
          text: "냉장 창고 쪽으로 들어간다",
          meta: "상처를 입을 수도 있지만 의약품을 건질 수 있다",
          resolve(state) {
            let note = "";
            if (!state.flags.martPainkillers) {
              state.flags.martPainkillers = true;
              addItem(state, "painkillers", 1);
              note = "얼어붙은 선반 뒤에서 진통제 한 통을 건졌다.";
            } else {
              note = "이미 누군가 훑고 간 자리뿐이다.";
            }

            if (!hasSkill(state, "survival")) {
              adjustStat(state, "hp", -1);
              note += " 깨진 유리에 손을 베여 체력이 조금 깎였다.";
            }

            addLog(state, "마트 냉장 창고를 조사했다.");
            return {
              to: "mart_result",
              note,
            };
          },
        },
        {
          text: "후문의 낙서를 살펴본다",
          meta: "지하 역사로 이어지는 흔적을 발견한다",
          resolve(state) {
            state.flags.martToSubwayHint = true;
            addLog(state, "마트 후문에서 지하 역사 쪽 흔적을 확인했다.");
            return {
              to: "mart_result",
              note: "낡은 화살표와 발자국이 지하철 폐역 쪽으로 이어져 있다. 위험할수록 사람들이 지나간다.",
            };
          },
        },
      ].concat(hubTravelChoices("mart"));
    },
  },
  mart_result: {
    location: "mart",
    title: "매장 안의 메아리",
    text: [
      "잠깐의 정적 뒤로 먼지가 가라앉는다. 여기서 더 시간을 쓰기 전에 다음 동선을 정하는 편이 좋다.",
    ],
    choices: [
      {
        text: "마트를 다시 둘러본다",
        meta: "폐허 마트 허브로 돌아간다",
        to: "mart_hub",
      },
    ],
  },
  riverside_hub: {
    location: "riverside",
    title: "하천변",
    text(state) {
      const paragraphs = [
        "흙탕물이 느리게 흐르고, 녹슨 가드레일 아래엔 밤새 떠내려온 쓰레기가 걸려 있다. 멀리서 누군가 거래를 흥정하는 낮은 목소리도 들린다.",
      ];

      if (!state.flags.filterFound) {
        paragraphs.push("물가 쪽에 뒤집힌 작은 보트가 보여 안쪽을 살펴볼 만하다.");
      }

      return paragraphs;
    },
    choices() {
      return [
        {
          text: "뒤집힌 보트를 조사한다",
          meta: "교환용 아이템이나 보급품을 얻을 수 있다",
          resolve(state) {
            if (!state.flags.filterFound) {
              state.flags.filterFound = true;
              addItem(state, "filter", 1);
              addItem(state, "ration", 1);
              addLog(state, "하천변 보트에서 정수 필터를 찾았다.");
              return {
                to: "riverside_result",
                note: "배 밑에 숨겨진 가방에서 정수 필터와 식량 한 묶음을 꺼냈다.",
              };
            }

            return {
              to: "riverside_result",
              note: "축축한 밧줄과 오래된 잡동사니뿐이다. 이제 쓸 만한 건 다 챙긴 듯하다.",
            };
          },
        },
        {
          text: "브로커 서윤을 찾는다",
          meta: "열쇠나 병원 정보를 거래할 수 있다",
          to: "riverside_broker",
        },
      ].concat(hubTravelChoices("riverside"));
    },
  },
  riverside_broker: {
    location: "riverside",
    title: "강변의 브로커",
    text(state) {
      const paragraphs = [
        "서윤은 젖은 장갑을 벗으며 당신을 위아래로 훑어본다. 병원 분류실에서 쓰던 열쇠 하나를 가지고 있는데, 공짜로 줄 생각은 없어 보인다.",
      ];

      if (hasItem(state, "triageKey")) {
        paragraphs.push("이미 손에 넣은 열쇠를 다시 꺼낼 필요는 없다. 서윤은 이제 대신 병원 내부 경로만 짧게 짚어준다.");
      } else if (hasSkill(state, "barter")) {
        paragraphs.push("흥정에 능숙한 사람에게는 말을 조금 더 길게 섞는다. 가격도 확실히 낮아질 기세다.");
      }

      return paragraphs;
    },
    choices(state) {
      const choices = [];

      if (!hasItem(state, "triageKey")) {
        choices.push({
          text: hasSkill(state, "barter")
            ? "말을 붙여 값싸게 열쇠를 받아낸다"
            : "돈을 내고 분류실 열쇠를 산다",
          meta: hasSkill(state, "barter") ? "돈 -3, 분류실 열쇠 획득" : "돈 -6, 분류실 열쇠 획득",
          require(currentState) {
            const cost = hasSkill(currentState, "barter") ? 3 : 6;
            if (currentState.money < cost) {
              return "돈이 부족하다.";
            }
            return true;
          },
          resolve(currentState) {
            const cost = hasSkill(currentState, "barter") ? 3 : 6;
            currentState.money -= cost;
            addItem(currentState, "triageKey", 1);
            currentState.flags.brokerMet = true;
            addLog(currentState, "브로커 서윤에게서 분류실 열쇠를 확보했다.");
            return {
              to: "riverside_result",
              note: "서윤은 열쇠를 넘기며 병원 1층 분류실 문이 아직 잠겨 있을 거라고 말한다.",
            };
          },
        });
      }

      choices.push({
        text: "병원 쪽 사정을 더 묻는다",
        meta: "힌트를 얻고 돌아간다",
        resolve(currentState) {
          currentState.flags.brokerMet = true;
          addLog(currentState, "서윤에게서 병원 경로에 대한 힌트를 들었다.");
          return {
            to: "riverside_result",
            note: "서윤은 병원 상층부는 정비 통로 쪽이 낫고, 약품 보관실은 열쇠만 있으면 조용히 들를 수 있다고 알려준다.",
          };
        },
      });

      choices.push({
        text: "이야기를 마치고 물러난다",
        meta: "하천변 허브로 돌아간다",
        to: "riverside_hub",
      });

      return choices;
    },
  },
  riverside_result: {
    location: "riverside",
    title: "물비린내 속 결심",
    text: [
      "하천변의 바람이 축축한 냄새를 몰고 지나간다. 이제 필요한 건 더 오래 머무는 게 아니라, 얻은 걸 어디에 쓸지 판단하는 일이다.",
    ],
    choices: [
      {
        text: "다시 주변을 살핀다",
        meta: "하천변 허브로 돌아간다",
        to: "riverside_hub",
      },
    ],
  },
  subway_hub: {
    location: "subway",
    title: "지하철 폐역",
    text(state) {
      const paragraphs = [
        "전광판은 죽어 있고, 플랫폼 끝은 칠흑같이 어둡다. 그래도 바닥의 먼지 위에는 사람 발자국이 희미하게 겹쳐 있다.",
      ];

      if (!state.flags.subwayMapFound) {
        paragraphs.push("역무실이나 정비실 어딘가엔 옛 도면이 남아 있을 수 있다.");
      } else {
        paragraphs.push("정비 지도 덕분에 이곳은 더 이상 미지의 공간이 아니다.");
      }

      return paragraphs;
    },
    choices() {
      return [
        {
          text: "역무실 서랍을 뒤진다",
          meta: "정비 지도를 찾을 수 있다",
          resolve(state) {
            if (!state.flags.subwayMapFound) {
              state.flags.subwayMapFound = true;
              addItem(state, "metroMap", 1);
              addLog(state, "지하철 폐역에서 정비 지도를 확보했다.");
              return {
                to: "subway_result",
                note: "찢긴 매뉴얼 아래 깔린 정비 지도를 펼치자 병원으로 이어지는 통로가 눈에 들어온다.",
              };
            }

            return {
              to: "subway_result",
              note: "서랍 속엔 오래된 배선도와 먼지뿐이다. 중요한 건 이미 챙겼다.",
            };
          },
        },
        {
          text: "플랫폼 끝 소리를 따라간다",
          meta: "작은 자원을 얻거나 정신력을 잃을 수 있다",
          resolve(state) {
            if (!state.flags.subwayCache) {
              state.flags.subwayCache = true;
              addItem(state, "ration", 1);
              adjustStat(state, "mind", -1);
              addLog(state, "플랫폼 끝에서 낡은 배낭을 발견했다.");
              return {
                to: "subway_result",
                note: "소리의 정체는 금속판이 흔들리는 것이었다. 그 옆 배낭에서 식량 한 묶음을 챙겼지만, 긴장감에 정신력이 조금 소모됐다.",
              };
            }

            adjustStat(state, "mind", -1);
            return {
              to: "subway_result",
              note: "이제는 바람 소리만 들린다. 괜히 긴장만 더해진다.",
            };
          },
        },
      ].concat(hubTravelChoices("subway"));
    },
  },
  subway_result: {
    location: "subway",
    title: "침묵하는 승강장",
    text: [
      "아무리 조용한 곳이라도 오래 서 있으면 소음보다 더 피곤한 침묵이 쌓인다. 다음 행동을 정해야 한다.",
    ],
    choices: [
      {
        text: "역 안을 다시 둘러본다",
        meta: "지하철 폐역 허브로 돌아간다",
        to: "subway_hub",
      },
    ],
  },
  hospital_hub: {
    location: "hospital",
    title(state) {
      return state.flags.medicineSecured ? "폐허 병원, 돌아갈 이유" : "폐허 병원";
    },
    text(state) {
      const paragraphs = [
        "병원 로비는 어둡고 넓다. 깨진 접수대, 넘어간 휠체어, 오래된 안내 표지판이 하나의 장면처럼 굳어 있다.",
      ];

      if (state.flags.medicineSecured) {
        paragraphs.push("이미 필요한 약은 확보했다. 더 오래 머물수록 이곳이 요구하는 대가는 커질 뿐이다.");
      } else {
        paragraphs.push("약품은 분류실이나 상층 병동 어딘가에 남아 있을 가능성이 높다.");
      }

      return paragraphs;
    },
    choices(state) {
      const choices = [
        {
          text: "접수대를 조사한다",
          meta: "진통제나 단서를 찾을 수 있다",
          resolve(currentState) {
            if (!currentState.flags.hospitalReceptionLoot) {
              currentState.flags.hospitalReceptionLoot = true;
              addItem(currentState, "painkillers", 1);
              addLog(currentState, "병원 접수대에서 진통제를 챙겼다.");
              return {
                to: "hospital_result",
                note: "넘어진 서랍 사이에서 유통기한이 아슬아슬한 진통제를 한 통 찾았다.",
              };
            }

            return {
              to: "hospital_result",
              note: "찢긴 차트와 먼지뿐이다. 접수대에선 더 건질 게 없어 보인다.",
            };
          },
        },
        {
          text: "상층 병동으로 올라간다",
          meta: "정비 지도나 관찰이 있으면 유리하다",
          require(currentState) {
            if (currentState.flags.medicineSecured) {
              return "이미 약을 확보했다.";
            }
            if (hasItem(currentState, "metroMap") || hasSkill(currentState, "observation")) {
              return true;
            }
            return "병동 구조를 파악할 단서가 부족하다.";
          },
          resolve(currentState) {
            currentState.flags.medicineSecured = true;
            addItem(currentState, "antibiotics", 1);
            if (!hasSkill(currentState, "survival")) {
              adjustStat(currentState, "hp", -1);
            }
            addLog(currentState, "병원 상층 병동에서 항생제를 확보했다.");
            return {
              to: "hospital_result",
              note: "무너진 계단을 돌아 올라간 병동 보관함 안에서 항생제 팩을 찾아냈다. 돌아갈 이유는 충분하다.",
            };
          },
        },
        {
          text: "분류실 잠금문을 연다",
          meta: "분류실 열쇠가 필요하다",
          require(currentState) {
            if (currentState.flags.medicineSecured) {
              return "이미 약을 확보했다.";
            }
            if (!hasItem(currentState, "triageKey")) {
              return "분류실 열쇠가 없다.";
            }
            return true;
          },
          resolve(currentState) {
            currentState.flags.medicineSecured = true;
            addItem(currentState, "antibiotics", 1);
            addLog(currentState, "분류실 약품 보관함에서 항생제를 확보했다.");
            return {
              to: "hospital_result",
              note: "열쇠가 잠금장치에 정확히 들어맞았다. 안쪽 약품 보관함에서 찾던 항생제를 꺼낼 수 있었다.",
            };
          },
        },
      ];

      return choices.concat(hubTravelChoices("hospital"));
    },
  },
  hospital_result: {
    location: "hospital",
    title: "병원의 정적",
    text: [
      "건물 어딘가에서 금속이 긁히는 소리가 한번 울리고 다시 침묵이 내려앉는다. 이곳은 오래 머무를수록 상상력보다 현실이 먼저 닳아간다.",
    ],
    choices: [
      {
        text: "로비를 다시 살핀다",
        meta: "병원 허브로 돌아간다",
        to: "hospital_hub",
      },
    ],
  },
  checkpoint_hub: {
    location: "checkpoint",
    title: "동쪽 검문소",
    text: [
      "무너진 차단기와 녹슨 철망 너머로 도시 바깥 도로가 길게 뻗어 있다. 지금은 잔해뿐이지만, 분명 다음 여정의 시작점이 될 장소다.",
      "캠프의 급한 불을 껐다는 사실이 이제야 실감난다. 여기서부터는 또 다른 장이 열릴 수 있다.",
    ],
    choices: [
      {
        text: "멀어진 도로를 한참 바라본다",
        meta: "다음 챕터를 예고하는 장면",
        resolve(state) {
          setQuest(state, "easternGate", "completed");
          addLog(state, "동쪽 검문소에 도달했다.");
          return {
            to: "checkpoint_end",
            note: "MVP 종료 지점입니다. 다음 단계에서는 검문소 너머 지역과 장기 진행을 확장할 수 있습니다.",
          };
        },
      },
      travelChoice("checkpoint", "hospital"),
    ],
  },
  checkpoint_end: {
    location: "checkpoint",
    title: "다음 장으로 이어지는 문턱",
    text: [
      "잔해 너머 길은 아직 닫혀 있지만, 이제 이 세계가 얼마나 넓어질 수 있는지는 분명해졌다.",
      "여기서부터는 새로운 지역, 세력, 장기 생존 시스템을 덧붙여 진짜 오픈월드 텍스트 RPG로 넓혀갈 수 있다.",
    ],
    choices: [
      {
        text: "병원 쪽으로 되돌아간다",
        meta: "계속 탐색한다",
        to: "hospital_hub",
      },
      {
        text: "캠프로 돌아가 마무리한다",
        meta: "현재 MVP 루프를 반복 플레이한다",
        resolve(state) {
          state.location = "camp";
          const note = advanceTime(state, 1);
          addLog(state, "검문소에서 캠프로 돌아왔다.");
          return {
            to: "camp_hub",
            note,
          };
        },
      },
    ],
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
      title: "쓰러진 몸",
      text: [
        state.gameOverReason || "체력이 바닥나 더는 움직일 수 없었다.",
        "새 게임 버튼을 눌러 다시 시작할 수 있다.",
      ],
      choices: [],
      image: LOCATIONS[state.location].image,
      risk: "게임 오버",
    };
  }

  const source = SCENES[sceneId];
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

function loadState() {
  const base = createInitialState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return base;
    }
    const parsed = JSON.parse(raw);
    const nextState = {
      ...base,
      ...parsed,
      stats: {
        ...base.stats,
        ...parsed.stats,
      },
      inventory: parsed.inventory || {},
      flags: parsed.flags || {},
      quests: {
        ...base.quests,
        ...parsed.quests,
      },
      skills: parsed.skills || [],
      log: parsed.log || [],
      systemNote: parsed.systemNote || "",
    };

    nextState.lastRealTimestamp = Date.now();
    setClockFromElapsed(nextState);
    return nextState;
  } catch (error) {
    return base;
  }
}

function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const state = loadState();
let activePanel = "map";

const dom = {
  hpValue: document.querySelector("#hp-value"),
  hpFill: document.querySelector("#hp-fill"),
  mindValue: document.querySelector("#mind-value"),
  mindFill: document.querySelector("#mind-fill"),
  fullnessValue: document.querySelector("#fullness-value"),
  fullnessFill: document.querySelector("#fullness-fill"),
  moneyValue: document.querySelector("#money-value"),
  timeIndicator: document.querySelector("#time-indicator"),
  questHint: document.querySelector("#quest-hint"),
  sceneArt: document.querySelector("#scene-art"),
  sceneLocationBadge: document.querySelector("#scene-location-badge"),
  sceneRiskBadge: document.querySelector("#scene-risk-badge"),
  sceneTitle: document.querySelector("#scene-title"),
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

const TYPEWRITER_CHAR_DELAY = 18;
const TYPEWRITER_PARAGRAPH_DELAY = 180;

let sceneRenderToken = 0;
let activeSceneTimer = null;

function clearSceneAnimation() {
  sceneRenderToken += 1;
  if (activeSceneTimer !== null) {
    clearTimeout(activeSceneTimer);
    activeSceneTimer = null;
  }
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
    const delay = /[.!?。]/.test(currentChar)
      ? TYPEWRITER_CHAR_DELAY + 40
      : /[,;:、]/.test(currentChar)
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
  dom.sceneText.innerHTML = "";
  dom.choices.innerHTML = "";
  dom.choices.classList.remove("revealed");

  for (const paragraph of scene.text) {
    if (token !== sceneRenderToken) {
      return;
    }

    const paragraphElement = document.createElement("p");
    dom.sceneText.appendChild(paragraphElement);
    const completed = await typeParagraph(paragraphElement, paragraph, token);
    if (!completed) {
      return;
    }

    await scheduleStep(() => {}, TYPEWRITER_PARAGRAPH_DELAY);
  }

  if (token === sceneRenderToken) {
    renderChoices(scene);
  }
}

function currentQuestHint() {
  if (state.isGameOver) {
    return "게임 오버: 새 게임으로 다시 시작하세요.";
  }

  if (state.quests.medicineRun === "active" && !state.flags.medicineSecured) {
    return "주 퀘스트: 병원에서 항생제를 찾아야 한다.";
  }
  if (state.flags.medicineSecured && !state.flags.questCompleted) {
    return "주 퀘스트: 캠프로 돌아가 항생제를 전달해야 한다.";
  }
  if (state.quests.easternGate === "active") {
    return "새 목표: 병원 동쪽 검문소까지 나가본다.";
  }
  return "캠프의 숨통은 잠시 트였다. 더 넓은 세계가 남아 있다.";
}

function renderStatusBar() {
  Object.entries(STAT_META).forEach(([key, meta]) => {
    const value = state.stats[key];
    const fill = `${(value / meta.max) * 100}%`;
    const valueLabel = `${value} / ${meta.max}`;
    dom[`${key}Value`].textContent = valueLabel;
    dom[`${key}Fill`].style.width = fill;
  });

  dom.moneyValue.textContent = `${state.money}원`;
  dom.timeIndicator.textContent = phaseLabel(state);
  dom.questHint.textContent = currentQuestHint();
}

function renderScene(animateText = true) {
  const scene = materializeScene(state.sceneId, state);
  dom.sceneArt.src = scene.image;
  dom.sceneLocationBadge.textContent = LOCATIONS[scene.locationId].name;
  dom.sceneRiskBadge.textContent = scene.risk;
  dom.sceneTitle.textContent = scene.title;

  clearSceneAnimation();

  if (animateText) {
    const token = sceneRenderToken;
    animateSceneText(scene, token);
  } else {
    dom.sceneText.innerHTML = scene.text.map((paragraph) => `<p>${paragraph}</p>`).join("");
    renderChoices(scene);
  }

  if (state.systemNote) {
    dom.systemNote.hidden = false;
    dom.systemNote.textContent = state.systemNote;
  } else {
    dom.systemNote.hidden = true;
    dom.systemNote.textContent = "";
  }
}

function renderMapPanel() {
  const currentLocation = state.location;
  const cards = Object.entries(LOCATIONS).map(([locationId, location]) => {
    const travel = LOCATIONS[currentLocation].links[locationId];
    const classes = ["map-card"];
    const isCurrent = currentLocation === locationId;
    if (isCurrent) {
      classes.push("current");
    }

    let actionMarkup = "";
    if (isCurrent) {
      actionMarkup = `<div class="tag-row"><span class="tag">현재 위치</span></div>`;
    } else if (travel) {
      const availability = !travel.require ? true : travel.require(state);
      if (availability === true) {
        actionMarkup = `<div class="map-actions"><button class="inline-action" data-travel-target="${locationId}" type="button">이동</button></div>`;
      } else {
        actionMarkup = `<div class="map-actions"><button class="inline-action secondary" type="button" disabled>${availability}</button></div>`;
      }
    } else {
      actionMarkup = `<div class="tag-row"><span class="tag">직접 연결되지 않음</span></div>`;
    }

    return `
      <article class="${classes.join(" ")}">
        <div class="map-meta">
          <h3>${location.name}</h3>
          <span class="tag">${location.risk}</span>
        </div>
        <p>${location.summary}</p>
        ${actionMarkup}
      </article>
    `;
  }).join("");

  dom.panelContent.innerHTML = `<div class="panel-grid">${cards}</div>`;
  dom.panelContent.querySelectorAll("[data-travel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const choice = travelChoice(state.location, button.dataset.travelTarget);
      handleChoice(choice);
    });
  });
}

function renderInventoryPanel() {
  const itemEntries = Object.entries(state.inventory);
  if (itemEntries.length === 0) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 챙겨 둔 물건이 없습니다.</p>`;
    return;
  }

  dom.panelContent.innerHTML = `
    <div class="panel-grid">
      ${itemEntries.map(([itemId, count]) => {
        const item = ITEMS[itemId];
        const useAction = item.usable
          ? `<div class="item-actions"><button class="inline-action" data-use-item="${itemId}" type="button">사용</button></div>`
          : `<div class="tag-row"><span class="tag">소지 수량 ${count}</span></div>`;
        return `
          <article class="info-card">
            <h3>${item.name} x${count}</h3>
            <p>${item.description}</p>
            ${useAction}
          </article>
        `;
      }).join("")}
    </div>
  `;

  dom.panelContent.querySelectorAll("[data-use-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.useItem;
      if (!hasItem(state, itemId)) {
        return;
      }
      syncRealTimeClock(state, { captureNotes: false });
      if (state.isGameOver) {
        render({ animateScene: false });
        return;
      }
      const note = ITEMS[itemId].use(state);
      removeItem(state, itemId, 1);
      state.systemNote = note;
      render({ animateScene: false });
    });
  });
}

function renderSkillsPanel() {
  if (state.skills.length === 0) {
    dom.panelContent.innerHTML = `<p class="empty-state">아직 선택한 전문성이 없습니다.</p>`;
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
    const statusLabel = status === "completed" ? "완료" : status === "active" ? "진행 중" : "대기";
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
      subtitle: "이동 가능한 장소와 연결 상태를 확인할 수 있습니다.",
      render: renderMapPanel,
    },
    inventory: {
      title: "아이템",
      subtitle: "소지품을 확인하고 소모 아이템을 바로 사용할 수 있습니다.",
      render: renderInventoryPanel,
    },
    skills: {
      title: "스킬",
      subtitle: "지금 가진 전문성이 선택지와 판정에 영향을 줍니다.",
      render: renderSkillsPanel,
    },
    quests: {
      title: "퀘스트",
      subtitle: "현재 이야기의 큰 줄기와 진행 상태를 확인합니다.",
      render: renderQuestsPanel,
    },
    log: {
      title: "기록",
      subtitle: "방금까지 어떤 일이 있었는지 빠르게 되짚어볼 수 있습니다.",
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
  const clockUpdate = syncRealTimeClock(state);
  if (clockUpdate.note) {
    state.systemNote = clockUpdate.note;
  }
  if (state.isGameOver) {
    render({ animateScene: false });
    return;
  }

  const availability = evaluateChoice(choice, state);
  if (!availability.enabled) {
    return;
  }

  state.systemNote = "";
  let outcome = choice;
  if (choice.resolve) {
    outcome = choice.resolve(state);
  }

  if (outcome.note) {
    state.systemNote = outcome.note;
  }

  if (outcome.to) {
    state.sceneId = outcome.to;
  }

  if (state.stats.hp <= 0 && !state.isGameOver) {
    triggerGameOver(state, "상처와 탈진이 겹쳐 더는 버틸 수 없었다.");
  }

  render();
}

dom.dockButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activePanel = button.dataset.panel;
    renderPanel();
  });
});

dom.newGameButton.addEventListener("click", () => {
  const confirmed = window.confirm("새 게임을 시작하면 현재 진행 상황이 모두 초기화됩니다.");
  if (!confirmed) {
    return;
  }
  clearSceneAnimation();
  Object.assign(state, createInitialState());
  setClockFromElapsed(state);
  activePanel = "map";
  state.systemNote = "새 여정을 시작합니다.";
  render();
});

const startupClockUpdate = syncRealTimeClock(state, { captureNotes: false });
if (startupClockUpdate.changed && startupClockUpdate.note) {
  state.systemNote = startupClockUpdate.note;
}

window.setInterval(() => {
  const clockUpdate = syncRealTimeClock(state);
  if (clockUpdate.changed) {
    if (clockUpdate.note) {
      state.systemNote = clockUpdate.note;
    }
    render({ animateScene: false });
    return;
  }

  saveState(state);
}, CLOCK_TICK_MS);

render({ animateScene: !state.isGameOver });
