import type { SceneDefinition } from "../../../schemas";

export const arcanaPlazaSceneDefinitions: SceneDefinition[] = [
  {
    id: "arcana_plaza_first_intro",
    locationId: "arcana_plaza",
    title: "아르카나 광장",
    paragraphs: [
      "포탈을 빠져나오자 은빛 돌을 깐 광장이 시야 끝까지 넓게 펼쳐진다. 중앙 분수에서 쏟아지는 물소리 사이로 상인들의 호객 소리와 사람들의 웃음이 뒤섞이고, 망토를 두른 여행자들이 저마다의 길로 광장을 가로지른다. 가장자리에 늘어선 가판대마다 푸른 수정등이 빛나고, 아치형 회랑 너머의 첨탑과 창문에는 따뜻한 금빛이 하나둘 켜지고 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "arcana_plaza" },
      { type: "flag_not", flag: "intro_seen_arcana_plaza" },
    ],
    introFlag: "intro_seen_arcana_plaza",
  },
  {
    id: "arcana_plaza_repeat_intro",
    locationId: "arcana_plaza",
    title: "아르카나 광장",
    paragraphs: [
      "분수 둘레에는 쉬어 가는 사람들이 모여 있고, 가판대 사이로 물건을 구경하는 행렬이 느리게 흐른다. 머리 위를 맴도는 작은 빛무리가 젖은 돌바닥에 푸른 흔적을 비추고, 회랑 아래에서는 잔을 부딪치는 소리와 웃음이 새어 나온다. 널찍한 광장을 오가는 발걸음은 저녁이 깊어져도 좀처럼 줄지 않는다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "arcana_plaza" },
      { type: "flag", flag: "intro_seen_arcana_plaza" },
      { type: "flag_not", flag: "arcana_workbench_open" },
    ],
  },
  {
    id: "arcana_workbench_menu",
    locationId: "arcana_plaza",
    title: "비전 작업대",
    paragraphs: [
      "검은 유리로 만든 작업대 위에서 푸른 불꽃이 소리 없이 타오른다. 홈마다 마력의 흐름이 새겨져 있어 재료를 올려놓기만 해도 가능한 조합이 희미한 글자로 떠오른다.",
      "현실의 제작법은 이곳에서 통하지 않는다. 달빛 약초와 비전 가루, 마력 결정으로 포션과 마도구를 만들어야 한다.",
    ],
    choiceIds: ["brew_mana_potion", "craft_rune_compass", "leave_arcana_workbench"],
    conditions: [
      { type: "location", locationId: "arcana_plaza" },
      { type: "flag", flag: "arcana_workbench_open" },
      { type: "flag_not", flag: "intro_seen_arcana_workbench" },
    ],
    introFlag: "intro_seen_arcana_workbench",
    suppressLocationInteractions: true,
  },
  {
    id: "arcana_workbench_menu_repeat",
    locationId: "arcana_plaza",
    title: "비전 작업대",
    paragraphs: ["푸른 불꽃 위로 지금 만들 수 있는 마법 물품의 룬 도식이 떠오른다."],
    choiceIds: ["brew_mana_potion", "craft_rune_compass", "leave_arcana_workbench"],
    conditions: [
      { type: "location", locationId: "arcana_plaza" },
      { type: "flag", flag: "arcana_workbench_open" },
      { type: "flag", flag: "intro_seen_arcana_workbench" },
    ],
    suppressLocationInteractions: true,
  },
  {
    id: "arcana_moon_herb_result",
    locationId: "arcana_plaza",
    title: "달빛 약초",
    tags: ["arcana:result:moon-herb"],
    paragraphs: [
      "잎을 꺾자 맑은 종소리와 함께 은빛 수액이 맺힌다. 현실의 식물과 달리, 이 약초는 손안에서 차갑게 빛나며 마력의 흐름을 안정시킨다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "arcana_plaza" }],
  },
  {
    id: "arcana_dust_result",
    locationId: "arcana_plaza",
    title: "비전 가루",
    tags: ["arcana:result:arcane-dust"],
    paragraphs: [
      "룬의 마지막 획을 읽어 내자 문장이 작은 빛 알갱이로 부서진다. MP가 빠져나간 자리에 푸른 비전 가루가 한 줌 남는다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "arcana_plaza" }],
  },

];
