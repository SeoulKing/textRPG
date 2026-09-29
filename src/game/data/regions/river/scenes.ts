import type { SceneDefinition } from "../../../schemas";
import { riverResultSceneTags } from "./result-scene-tags";

const riverLocationCondition = [{ type: "location" as const, locationId: "river" }];

export const riverSceneDefinitions: SceneDefinition[] = [
  {
    id: "river_first_intro",
    locationId: "river",
    title: "강",
    paragraphs: [
      "편의점 폐허 아래의 콘크리트 비탈을 내려가자, 도시를 가르며 흐르는 강이 모습을 드러낸다. 물은 비가 그친 뒤에도 탁하고 빠르지만, 갈대가 밀집한 얕은 여울에는 작은 물고기들의 은빛 등이 간간이 번뜩인다.",
      "제방에 버려진 낚싯줄과 녹슨 바늘을 손보면 잠시 낚시를 해 볼 수 있다. 오래 머문다고 반드시 성과가 생기는 곳은 아니지만, 운이 따른다면 오늘 먹을 것을 마련할 수 있을 것이다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "river" },
      { type: "flag_not", flag: "intro_seen_river" },
    ],
    introFlag: "intro_seen_river",
  },
  {
    id: "river_repeat_intro",
    locationId: "river",
    title: "강",
    paragraphs: [
      "탁한 물살이 무너진 교각 아래를 쉼 없이 스쳐 간다. 갈대 사이의 잔물결을 살피면 물고기가 움직이는 자리를 다시 찾아볼 수 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "river" },
      { type: "flag", flag: "intro_seen_river" },
    ],
  },
  {
    id: "river_fishing_nothing_1",
    locationId: "river",
    title: "빈 물살",
    tags: [riverResultSceneTags.fishingNothing],
    paragraphs: [
      "줄 끝이 몇 번 가볍게 흔들렸지만 물살이 장난을 친 것뿐이었다. 기다림 끝에 건져 올린 바늘에는 젖은 수초만 길게 감겨 있다.",
      "당신은 미끼를 다시 챙기며 강의 흐름을 눈에 익힌다. 빈손이지만 다음에는 어느 여울을 노려야 할지 조금은 알 것 같다.",
    ],
    choiceIds: [],
    conditions: riverLocationCondition,
  },
  {
    id: "river_fishing_nothing_2",
    locationId: "river",
    title: "긴 기다림",
    tags: [riverResultSceneTags.fishingNothing],
    paragraphs: [
      "수면 아래로 그림자 하나가 스쳤지만 바늘 가까이 오지는 않는다. 강바람만 축축한 옷자락을 두드리고, 팽팽하던 줄은 이내 힘없이 늘어진다.",
      "시간만 흘렀다. 당신은 물고기가 흩어진 여울을 떠나 조금 더 잔잔한 자리를 살펴본다.",
    ],
    choiceIds: [],
    conditions: riverLocationCondition,
  },
  {
    id: "river_fishing_catch_1",
    locationId: "river",
    title: "첫 입질",
    tags: [riverResultSceneTags.fishingCatch],
    paragraphs: [
      "손가락에 감아 둔 줄이 갑자기 팽팽해진다. 물살을 거슬러 천천히 당기자 은빛 몸통이 수면을 깨고 강둑 위로 튀어 오른다.",
      "크지는 않지만 살이 단단한 {{item:riverFish}}다. 당신은 물기를 털고 도망치지 못하도록 가방 바깥쪽에 단단히 묶는다.",
    ],
    choiceIds: [],
    conditions: riverLocationCondition,
  },
  {
    id: "river_fishing_catch_2",
    locationId: "river",
    title: "은빛 비늘",
    tags: [riverResultSceneTags.fishingCatch],
    paragraphs: [
      "갈대 옆으로 미끼가 가라앉은 순간 줄이 옆으로 빠르게 달린다. 놓치지 않고 손목을 들어 올리자 물방울과 함께 {{item:riverFish}} 한 마리가 둑 위에 떨어진다.",
      "물고기는 거칠게 몸을 뒤튼다. 살아 있는 무게가 손바닥에 전해지자, 적어도 이번 기다림은 헛되지 않았다는 생각이 든다.",
    ],
    choiceIds: [],
    conditions: riverLocationCondition,
  },
  {
    id: "river_fishing_big_catch_1",
    locationId: "river",
    title: "물고기 떼",
    tags: [riverResultSceneTags.fishingBigCatch],
    paragraphs: [
      "얕은 여울 아래로 은빛 무리가 한꺼번에 몰려든다. 첫 마리를 건져 낸 뒤 미끼를 다시 던지자, 채 숨을 고르기도 전에 두 번째 입질이 손끝을 세게 잡아끈다.",
      "강둑 위에서 {{item:riverFish}} 두 마리가 나란히 펄떡인다. 보기 드문 행운이다. 당신은 물고기들을 놓치지 않게 갈대 줄기로 엮어 챙긴다.",
    ],
    choiceIds: [],
    conditions: riverLocationCondition,
  },
];
