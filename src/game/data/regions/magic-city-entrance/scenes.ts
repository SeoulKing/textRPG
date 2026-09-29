import type { SceneDefinition } from "../../../schemas";

export const magicCityEntranceSceneDefinitions: SceneDefinition[] = [
  {
    id: "magic_city_entrance_first_intro",
    locationId: "magic_city_entrance",
    title: "마법도시 입구",
    paragraphs: [
      "편의점 옥상은 더 이상 서울의 일부처럼 보이지 않는다. 녹슨 물탱크와 끊어진 전선 사이에 거대한 푸른 고리가 서 있고, 고리 안쪽으로는 밤하늘 아래 떠 있는 첨탑과 금빛 창문들이 비친다.",
      "포탈의 표면이 숨 쉬듯 흔들릴 때마다 폐허의 먼지가 별가루로 바뀌어 허공으로 올라간다. 이 문턱을 넘으면 지금까지의 생존 규칙과는 전혀 다른 세계가 시작될 것 같다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "magic_city_entrance" },
      { type: "flag_not", flag: "intro_seen_magic_city_entrance" },
    ],
    introFlag: "intro_seen_magic_city_entrance",
  },
  {
    id: "magic_city_entrance_repeat_intro",
    locationId: "magic_city_entrance",
    title: "마법도시 입구",
    paragraphs: [
      "푸른 포탈은 편의점 옥상 위에서 조용히 회전하고 있다. 현실의 잿빛 하늘과 포탈 너머의 별빛이 얇은 막 하나를 사이에 두고 맞닿아 있다.",
      "손을 가까이 대자 피부 아래로 미세한 마력이 흐른다. 너머로 가려면 이제 한 걸음이면 충분하다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "magic_city_entrance" },
      { type: "flag", flag: "intro_seen_magic_city_entrance" },
    ],
  },
];
