import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor, stockNode } from "../../location-helpers";

export const subwayChoices: ActionDefinition[] = [
  interactionFor("subway", {
    id: "go_to_subway_signal_box",
    label: "역무실 신호함으로 간다",
    type: "search",
    outcomeHint: "어두운 역무실 안 신호함을 열어 안테나와 남은 자재를 확인한다.",
    effects: [
      { type: "focus_stock_node", nodeId: "subway_signal_box" },
      { type: "log", message: "당신은 불 꺼진 역무실 안쪽으로 들어가 신호함 앞에 선다." },
    ],
    tags: ["signal", "search"],
    riskHint: "medium",
  }),
  interactionFor("subway", {
    id: "salvage_subway_platform",
    label: "승강장 자재를 회수한다",
    type: "search",
    outcomeHint: "기력 -1 / 보상: 고철 조각·끈 묶음·물병 중 하나 / 위험: 체력 -1 / +40분",
    showOutcomeHint: true,
    conditions: [{ type: "stat_gte", stat: "energy", value: 1 }],
    effects: [
      { type: "change_stat", stat: "energy", value: -1 },
      { type: "advance_time", minutes: 40 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 45,
            effects: [
              { type: "add_item", itemId: "scrapMetal", amount: 2 },
              { type: "log", message: "당신은 승강장 아래에서 쓸 만한 고철 조각 두 개를 뜯어냈다." },
              { type: "set_scene", sceneId: "subway_platform_scrap" },
            ],
          },
          {
            weight: 25,
            effects: [
              { type: "add_item", itemId: "cordage", amount: 1 },
              { type: "log", message: "당신은 끊어진 손잡이 줄과 케이블을 묶어 끈 묶음 하나를 챙겼다." },
              { type: "set_scene", sceneId: "subway_platform_cordage" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "waterBottle", amount: 1 },
              { type: "log", message: "당신은 의자 아래 굴러 들어간 물병 하나를 찾아냈다." },
              { type: "set_scene", sceneId: "subway_platform_water" },
            ],
          },
          {
            weight: 10,
            effects: [
              { type: "change_stat", stat: "hp", value: -1 },
              { type: "add_item", itemId: "scrapMetal", amount: 1 },
              { type: "log", message: "당신은 날카로운 금속에 손을 긁혔지만 고철 조각 하나는 건졌다." },
              { type: "set_scene", sceneId: "subway_platform_cut" },
            ],
          },
        ],
      },
    ],
    tags: ["salvage", "resource", "repeatable", "risk"],
    riskHint: "high",
  }),
];

export const subwayLocation = defineLocation({
  id: "subway",
  name: "지하철역",
  risk: "high",
  mapPosition: { q: 2, r: 0 },
  imagePath: "assets/scenes/subway.svg",
  summary: "전기가 끊긴 승강장과 어두운 역무실이 남은 지하철역이다. 신호 장비를 뜯어 쓸 수 있지만, 오래 머물수록 정신이 닳는다.",
  tags: ["signal", "underground", "day6"],
  traits: ["antenna", "metal", "stress", "platform salvage"],
  obtainableItemIds: ["radioAntenna", "scrapMetal", "cordage", "waterBottle"],
  neighbors: ["kitchen", "checkpoint"],
  interactionChoices: subwayChoices,
  links: {
    kitchen: { note: "급식소 뒤편 계단으로 되돌아간다." },
    checkpoint: {
      note: "반대편 출구를 지나 구조대 무전 소문이 도는 검문소 쪽으로 간다.",
    },
  },
  stockNodes: [
    stockNode({
      id: "subway_signal_box",
      name: "역무실 신호함",
      summary: "벽면 신호함 안에 접이식 안테나와 고철 조각, 미개봉 물병 하나가 끼어 있다.",
      items: [
        { itemId: "radioAntenna", initialQuantity: 1 },
        { itemId: "scrapMetal", initialQuantity: 2 },
        { itemId: "waterBottle", initialQuantity: 1 },
      ],
    }),
  ],
});
