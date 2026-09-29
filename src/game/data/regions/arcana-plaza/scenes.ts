import type { SceneDefinition } from "../../../schemas";

export const arcanaPlazaSceneDefinitions: SceneDefinition[] = [
  {
    id: "arcana_plaza_first_intro",
    locationId: "arcana_plaza",
    title: "아르카나 광장",
    paragraphs: [
      "포탈을 빠져나오자 중력이 잠깐 방향을 잃는다. 발밑에는 은빛 돌로 짠 광장이 펼쳐지고, 하늘에는 달 세 개와 거꾸로 흐르는 별무리가 걸려 있다. 망토를 두른 사람들과 작은 날개를 가진 짐승들이 아무렇지 않게 당신 곁을 스쳐 간다.",
      "이 세계에서 정신력이라 부르던 감각은 마력을 담는 그릇으로 바뀐다. 이제 푸른 수치는 MP다. 광장 가장자리에는 달빛 약초가 자라고, 허공의 룬에서는 비전 가루를 얻을 수 있으며, 중앙의 작업대에서는 이 세계만의 레시피를 사용할 수 있다.",
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
      "아르카나 광장의 별빛은 시간과 상관없이 일정하다. 달빛 약초는 분수 주변에서 은빛 잎을 흔들고, 부유 룬은 손을 뻗으면 닿을 듯 천천히 회전한다.",
      "현실의 생존 도구 대신 마법 재료와 MP가 이곳의 선택을 결정한다. 더 깊은 도시로 향할 준비는 비전 작업대에서 시작할 수 있다.",
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
