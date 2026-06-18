import type { SceneDefinition } from "../../../schemas";
import { forestResultSceneTags } from "./result-scene-tags";

const forestLocationCondition = [{ type: "location" as const, locationId: "forest" }];

export const forestSceneDefinitions: SceneDefinition[] = [
  {
    id: "forest_first_intro",
    locationId: "forest",
    title: "숲",
    paragraphs: [
      "임시 거처 아래쪽으로 내려가자, 무너진 울타리가 젖은 낙엽 사이로 희미하게 이어진다. 바람이 가지를 흔들 때마다 먼지와 빗물 냄새가 섞여 올라오고, 오래전에 버려진 벤치와 안내판이 나무 그림자에 반쯤 묻혀 있다.",
      "깊은 숲은 아니지만 손을 대면 쓸 만한 것들이 있다. 마른 가지를 잘라 목재로 묶을 수도 있고, 낙엽과 폐허 사이를 뒤져 남은 물자를 찾을 수도 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "forest" },
      { type: "flag_not", flag: "intro_seen_forest" },
    ],
    introFlag: "intro_seen_forest",
  },
  {
    id: "forest_repeat_intro",
    locationId: "forest",
    title: "숲",
    paragraphs: [
      "숲은 여전히 축축하고 조용하다. 발밑의 낙엽은 얇게 꺼지고, 나무 사이로는 임시 거처와 편의점 폐허, 급식소 쪽 길이 희미하게 갈라져 보인다.",
      "시간을 들이면 자원을 얻을 수 있다. 다만 숲이 언제나 무언가를 내어 주는 것은 아니다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "forest" },
      { type: "flag", flag: "intro_seen_forest" },
    ],
  },
  {
    id: "forest_chop_result_1",
    locationId: "forest",
    title: "벌목",
    tags: [forestResultSceneTags.chop],
    paragraphs: [
      "당신은 마른 나무와 부서진 가지를 골라 칼날을 세운다. 젖지 않은 부분만 따로 떼어 내자, 손에 들 만한 판자들이 묵직하게 모인다.",
      "팔에는 뻐근한 힘이 남았지만 성과는 분명하다. 오늘 밤 불을 피우거나 거처를 손보는 데 쓸 수 있을 것이다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_chop_result_2",
    locationId: "forest",
    title: "벌목",
    tags: [forestResultSceneTags.chop],
    paragraphs: [
      "넘어진 가로수의 마른 부분을 찾아내자, 톱니처럼 갈라진 나무껍질이 손끝에 걸린다. 당신은 쓸 만한 부분만 잘라 한쪽에 차곡차곡 쌓는다.",
      "작은 숲은 금세 다시 조용해진다. 남은 것은 젖은 흙 냄새와 등에 멘 목재의 무게뿐이다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_chop_result_3",
    locationId: "forest",
    title: "벌목",
    tags: [forestResultSceneTags.chop],
    paragraphs: [
      "당신은 무너진 울타리 너머로 들어가 아직 단단한 목재만 골라낸다. 갈라진 끝을 다듬고 끈으로 묶자, 제법 쓸 만한 자재가 품에 안긴다.",
      "짧은 작업이었지만 숨은 가빠진다. 그래도 빈손으로 돌아가는 것보다는 훨씬 낫다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_nothing_result_1",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchNothing],
    paragraphs: [
      "당신은 숲의 가장자리를 오래 뒤졌지만, 가져갈 만한 물건을 찾지 못한다.",
      "젖은 낙엽과 깨진 플라스틱만 손끝에 묻어난다. 시간은 흘렀고, 숲은 아무것도 내어 주지 않았다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_nothing_result_2",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchNothing],
    paragraphs: [
      "비닐봉지와 빈 깡통을 들춰 보지만 안에는 쓸 만한 것이 없다. 누군가 먼저 지나간 흔적만 오래 남아 있다.",
      "당신은 손에 묻은 흙을 털어 낸다. 오늘 이 자리에서는 더 건질 것이 없어 보인다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_canned_food_result_1",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchCannedFood],
    paragraphs: [
      "젖은 낙엽 아래에서 둔탁한 금속 소리가 난다. 손으로 흙을 걷어 내자, 찌그러졌지만 아직 밀봉된 캔 음식 하나가 모습을 드러낸다.",
      "라벨은 거의 지워졌지만 내용물이 중요하다. 당신은 캔을 품 안쪽에 밀어 넣는다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_canned_food_result_2",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchCannedFood],
    paragraphs: [
      "버려진 배낭 안쪽에서 작은 캔 하나가 굴러 나온다. 녹은 조금 슬었지만, 뚜껑은 아직 단단히 붙어 있다.",
      "당장 먹을 수 있는 것은 무엇이든 귀하다. 당신은 무게를 확인한 뒤 조심스럽게 챙긴다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_wood_result_1",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchWood],
    paragraphs: [
      "무너진 안내판 뒤쪽에서 아직 쓸 만한 목재 판자 하나를 뜯어낸다.",
      "비에 젖긴 했지만 썩지는 않았다. 말려 두면 거처를 손보거나 불을 피우는 데 도움이 될 것이다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_wood_result_2",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchWood],
    paragraphs: [
      "낡은 벤치 밑판 하나가 아직 쓸 만하다. 당신은 못을 비틀어 빼고 판자를 조심스럽게 들어낸다.",
      "손바닥에 나무 가시가 스치지만 큰 상처는 아니다. 쓸 만한 자재 하나가 더 생겼다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_metal_result_1",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchMetal],
    paragraphs: [
      "대피소 안내판 받침대 근처에서 휘어진 금속 조각 하나를 발견한다.",
      "손에 묵직하게 걸리는 감촉이 있다. 모아 두면 수리나 제작에 충분히 보탬이 될 만하다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_metal_result_2",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchMetal],
    paragraphs: [
      "부서진 이동식 펜스 아래에서 떨어져 나온 금속 부품 하나가 반짝인다.",
      "모서리는 날카롭지만, 천으로 감싸면 들고 갈 수 있다. 당신은 조심해서 배낭에 넣는다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_cloth_result_1",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchCloth],
    paragraphs: [
      "찢어진 방수포 사이에서 아직 질긴 천 조각 하나를 잘라 낸다.",
      "젖은 부분을 털어 내자 생각보다 상태가 나쁘지 않다. 묶거나 덧대는 데 쓸 수 있겠다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
  {
    id: "forest_search_cloth_result_2",
    locationId: "forest",
    title: "수색",
    tags: [forestResultSceneTags.searchCloth],
    paragraphs: [
      "나뭇가지에 걸린 낡은 외투 소매에서 쓸 만한 천 조각을 뜯어낸다.",
      "먼지와 빗물이 배어 있지만 찢김은 덜하다. 당신은 접어서 다른 물자 사이에 끼워 넣는다.",
    ],
    choiceIds: [],
    conditions: forestLocationCondition,
  },
];
