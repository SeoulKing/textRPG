import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const shelterChoices: ActionDefinition[] = [
  interactionFor("shelter", {
    id: "rest_light_at_shelter",
    label: "휴식하기",
    type: "rest",
    outcomeHint: "긴장을 조금 내려놓고 체력과 정신력을 추스른다. 밤을 넘기진 않지만 숨을 고를 수 있다.",
    effects: [
      { type: "change_stat", stat: "hp", value: 1 },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "log", message: "당신은 천막 구석에 몸을 기대고 잠시 숨을 고른다. 완전히 편하진 않지만 몸이 조금은 가벼워진다." },
    ],
    tags: ["recovery"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "sleep_at_shelter",
    label: "취침하기",
    type: "use",
    presentationMode: "always",
    outcomeHint: "오후 6시 전에는 아직 잘 수 없다는 안내만 본다. 이후에는 다음 날 아침 6시에 깨어나며 체력과 정신력이 조금 회복된다.",
    conditions: [{ type: "shelter_sleep_window" }],
    failureNote: "오후 6시 이후부터 잠자기를 이용할 수 있다.",
    failureEffects: [
      {
        type: "log",
        message: "아직 해가 지지 않았다. 잠자리에 들더라도 뒤척이기만 할 뿐이라, 저녁이 올 때까지는 눕지 않는 편이 낫다.",
      },
    ],
    effects: [
      { type: "log", message: "당신은 낡은 천막 아래 몸을 누이고, 잠깐이라도 제대로 눈을 붙여 보려 한다." },
      { type: "change_stat", stat: "hp", value: 1 },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "advance_to_daybreak" },
    ],
    tags: ["recovery", "sleep"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "open_shelter_crafting",
    label: "제작하기",
    type: "use",
    outcomeHint: "주워 온 재료를 펼쳐 놓고, 거처를 손보거나 식사를 만들 수 있는 레시피를 살핀다.",
    effects: [
      { type: "set_flag", flag: "shelter_crafting_open" },
      { type: "log", message: "당신은 모아 둔 자재를 천막 안쪽에 펼쳐 놓고, 지금 만들 수 있는 것들을 하나씩 따져 본다." },
    ],
    nextSceneId: "shelter_crafting_menu",
    tags: ["craft", "menu"],
    riskHint: "low",
  }),
  interactionFor("shelter", {
    id: "collect_rainwater_at_shelter",
    label: "물 확보하기",
    type: "use",
    outcomeHint: "오늘 고인 빗물을 병에 나눠 담아 물 한 병을 확보한다.",
    conditions: [
      { type: "flag", flag: "shelter_rain_bucket" },
      { type: "flag_not", flag: "rain_bucket_drawn_today" },
    ],
    effects: [
      { type: "add_item", itemId: "waterBottle", amount: 1 },
      { type: "set_flag", flag: "rain_bucket_drawn_today" },
      {
        type: "log",
        message: "당신은 천막 가장자리에 매달아 둔 물받이에 고인 빗물을 병에 조심스럽게 옮겨 담는다.",
      },
    ],
    tags: ["water", "resource"],
    riskHint: "low",
  }),
];

export const shelterLocation: LocationDefinition = {
  id: "shelter",
  name: "임시 거처",
  risk: "safe",
  imagePath: "assets/scenes/shelter.png",
  summary: "지친 생존자들이 잠시 숨을 고르고, 오늘 밤을 버틸 방법을 궁리하는 허술한 천막 거처다.",
  tags: ["hub", "safe", "rest"],
  traits: ["rest", "crafting", "cooking"],
  obtainableItemIds: ["emergencySnack", "waterBottle", "hotMeal", "rawRice", "vegetables", "woodPlank", "scrapMetal", "clothScrap"],
  residentIds: [],
  neighbors: ["convenience", "kitchen"],
  interactionChoices: shelterChoices,
  eventIds: [],
  links: {
    convenience: {
      note: "무너진 보도와 깨진 유리 조각을 밟으며 편의점 폐허 쪽으로 간다.",
      requiredFlag: "opening_seen",
      blockedReason: "먼저 마음을 다잡고 오늘을 버틸 이유부터 정해야 한다.",
    },
    kitchen: {
      note: "국물 냄새와 줄 선 사람들의 소리가 새어 나오는 급식소 쪽으로 향한다.",
      requiredFlag: "opening_seen",
      blockedReason: "먼저 오늘을 어떻게 버틸지 마음속으로라도 정리해야 한다.",
    },
  },
  stockNodes: [],
};
