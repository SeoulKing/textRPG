import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const shelterChoices: ActionDefinition[] = [
  interactionFor("shelter", {
    id: "rest_light_at_shelter",
    label: "휴식한다",
    type: "rest",
    outcomeHint: "긴장을 조금 풀고 체력과 정신을 추스른다. 밤까지 잠들지는 않는다.",
    effects: [
      { type: "change_stat", stat: "hp", value: 1 },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "log", message: "당신은 천막 구석에 잠시 누워 숨을 고른다. 완전히 잠들지는 않지만 몸이 조금 가벼워진다." },
    ],
    tags: ["recovery"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "sleep_at_shelter",
    label: "잠자기",
    type: "use",
    presentationMode: "always",
    outcomeHint: "오후 6시(게임 시계) 이전에는 눌러도 잠들 수 없고 안내만 본다. 이후에는 다음날 아침 6시에 깨어난다.",
    conditions: [{ type: "shelter_sleep_window" }],
    failureNote: "오후 6시 이후부터 잠자기를 이용할 수 있다.",
    failureEffects: [
      {
        type: "log",
        message:
          "아직 해가 지지 않았다. 잠자리는 상단 시계 기준 오후 6시가 지나야 이용할 수 있고, 잠들면 다음날 아침 6시에 깨어난다.",
      },
    ],
    effects: [
      { type: "log", message: "당신은 덧댄 천 너머로 새어 들어오는 한기를 느끼며 눈을 감는다." },
      { type: "advance_to_daybreak" },
    ],
    tags: ["recovery", "sleep"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "cook_at_shelter",
    label: "요리하기",
    type: "use",
    outcomeHint: "가진 재료로 무언가를 끓이거나 볶을 수 있게 될 예정이다. (레시피는 추후 정의)",
    effects: [
      {
        type: "log",
        message:
          "작은 화로 앞에 앉았지만, 어떤 재료를 어떤 순서로 쓸지 아직 정해진 규칙이 없다. 요리법을 정리한 뒤 다시 시도해야 할 것 같다.",
      },
    ],
    tags: ["food", "craft", "cooking_placeholder"],
    riskHint: "low",
  }),
];

export const shelterLocation: LocationDefinition = {
  id: "shelter",
  name: "임시 거처",
  risk: "safe",
  imagePath: "assets/scenes/shelter.png",
  summary: "지친 생존자들이 잠시 등을 기대고 초라하지만 바깥보다는 먼지와 악취가 덜한 쉼을 공유하는 곳이다.",
  tags: ["hub", "safe", "rest"],
  traits: ["rest", "cooking", "rumor gathering"],
  obtainableItemIds: ["emergencySnack", "waterBottle"],
  residentIds: [],
  neighbors: ["convenience", "kitchen"],
  interactionChoices: shelterChoices,
  eventIds: [],
  links: {
    convenience: {
      note: "무너진 보도와 깨진 유리 조각을 밟으며 편의점 쪽으로 간다.",
      requiredFlag: "opening_seen",
      blockedReason: "먼저 마음을 다잡고 오늘을 버틸 이유를 정해야 한다.",
    },
    kitchen: {
      note: "연기 냄새와 줄의 웅성임이 섞여 있는 급식소 방향으로 발걸음을 옮긴다.",
      requiredFlag: "opening_seen",
      blockedReason: "먼저 숨을 고르고 오늘을 버틸 이유부터 정해야 한다.",
    },
  },
  stockNodes: [],
};
