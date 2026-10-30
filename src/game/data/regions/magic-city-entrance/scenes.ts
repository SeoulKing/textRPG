import type { SceneDefinition } from "../../../schemas";

export const magicCityEntranceSceneDefinitions: SceneDefinition[] = [
  {
    id: "magic_city_entrance_first_intro",
    locationId: "magic_city_entrance",
    title: "마법도시 입구",
    paragraphs: [
      "바람이 지나갈 때마다 들판의 풀이 한쪽으로 눕는다. 그 한가운데 거대한 푸른 고리가 서 있고, 고리 안쪽으로는 별빛 아래 솟은 첨탑과 금빛 창문들이 비친다.",
      "포탈의 표면이 숨 쉬듯 흔들릴 때마다 풀잎 위로 푸른 빛이 번지고, 작은 빛무리가 허공으로 떠오른다. 이 문턱을 넘으면 지금까지의 생존 규칙과는 전혀 다른 세계가 시작될 것 같다.",
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
      "푸른 포탈은 들판 한가운데서 조용히 회전하고 있다. 바람에 흔들리는 풀잎 너머로, 현실의 하늘과 마법도시의 별빛이 얇은 막 하나를 사이에 두고 맞닿아 있다.",
      "손을 가까이 대자 피부 아래로 미세한 마력이 흐른다. 너머로 가려면 이제 한 걸음이면 충분하다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "magic_city_entrance" },
      { type: "flag", flag: "intro_seen_magic_city_entrance" },
    ],
  },
];
