import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor } from "../../location-helpers";

export const magicCityEntranceChoices: ActionDefinition[] = [
  interactionFor("magic_city_entrance", {
    id: "enter_magic_city_portal_first",
    label: "포탈을 통과한다",
    type: "explore",
    outcomeHint: "현실 세계를 뒤로하고 포탈 너머의 마법도시로 넘어간다. 최초 통과 시 {{item:manaShard|을를}} 얻는다.",
    conditions: [{ type: "flag_not", flag: "magic_world_entered_once" }],
    effects: [
      { type: "set_flag", flag: "magic_world_entered_once" },
      { type: "set_flag", flag: "in_magic_world" },
      { type: "add_item", itemId: "manaShard", amount: 1 },
      { type: "travel", locationId: "arcana_plaza" },
      {
        type: "log",
        message: "당신은 푸른 포탈을 통과했다. 폐허의 소음이 끊기고, 손안에는 차가운 {{item:manaShard|이가}} 남았다.",
      },
      { type: "advance_time", minutes: 5 },
    ],
    nextSceneId: "arcana_plaza_first_intro",
    tags: ["portal", "expansion", "realm-transition"],
    riskHint: "medium",
  }),
  interactionFor("magic_city_entrance", {
    id: "enter_magic_city_portal_again",
    label: "포탈을 통과한다",
    type: "explore",
    outcomeHint: "푸른 포탈을 타고 마법도시의 아르카나 광장으로 이동한다.",
    conditions: [{ type: "flag", flag: "magic_world_entered_once" }],
    effects: [
      { type: "set_flag", flag: "in_magic_world" },
      { type: "travel", locationId: "arcana_plaza" },
      { type: "log", message: "당신은 익숙해진 마력의 떨림을 견디며 다시 포탈 너머로 발을 내디딘다." },
      { type: "advance_time", minutes: 5 },
    ],
    nextSceneId: "arcana_plaza_repeat_intro",
    tags: ["portal", "expansion", "realm-transition"],
    riskHint: "low",
  }),
];

export const magicCityEntranceLocation = defineLocation({
  id: "magic_city_entrance",
  name: "마법도시 입구",
  risk: "medium",
  mapPosition: { q: -1, r: 0 },
  imagePath: "assets/scenes/magic-city-entrance.svg",
  summary: "편의점 폐허 옥상 위, 현실의 하늘을 찢고 열린 푸른 포탈. 너머에서는 별빛과 종소리가 흘러온다.",
  tags: ["portal", "fantasy", "expansion", "realm:reality"],
  traits: ["realm gateway", "unstable magic", "one-way threshold"],
  obtainableItemIds: ["manaShard"],
  neighbors: ["shelter", "convenience"],
  interactionChoices: magicCityEntranceChoices,
  links: {
    shelter: {
      note: "포탈 앞 골목을 빠져나와 임시 거처로 돌아간다.",
    },
    convenience: {
      note: "옥상 계단을 내려가 편의점 폐허 안쪽으로 돌아간다.",
    },
  },
});
