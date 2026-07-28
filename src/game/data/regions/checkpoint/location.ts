import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor, stockNode } from "../../location-helpers";

export const checkpointChoices: ActionDefinition[] = [
  interactionFor("checkpoint", {
    id: "go_to_checkpoint_radio_truck",
    label: "통신 차량으로 간다",
    type: "search",
    outcomeHint: "검문소 안쪽에 버려진 통신 차량을 뒤져 송신기와 구조대 흔적을 확인한다.",
    effects: [
      { type: "focus_stock_node", nodeId: "checkpoint_radio_truck" },
      { type: "log", message: "검문소 안쪽의 통신 차량 문을 열고, 아직 남은 장비가 있는지 확인했다." },
    ],
    tags: ["signal", "search"],
    riskHint: "high",
  }),
  interactionFor("checkpoint", {
    id: "monitor_rescue_frequency",
    label: "구조 주파수 확인하기",
    type: "search",
    outcomeHint: "낡은 안내판과 무전 기록을 맞춰 구조대가 10일차 아침 근처에 이 지역을 훑는다는 소문을 확인한다.",
    conditions: [{ type: "flag_not", flag: "rescue_frequency_confirmed" }],
    effects: [
      { type: "set_flag", flag: "rescue_frequency_confirmed" },
      { type: "change_stat", stat: "mind", value: 1 },
      { type: "log", message: "검문소의 무전 기록에서 10일차 아침 구조대가 이 구역을 수색할 가능성을 확인했다. 신호만 준비되면 된다." },
      { type: "advance_time", minutes: 15 },
    ],
    tags: ["hint", "signal"],
    riskHint: "medium",
  }),
  interactionFor("checkpoint", {
    id: "patrol_checkpoint_perimeter",
    label: "초소 주변을 정찰한다",
    type: "search",
    outcomeHint: "기력 -1 / 보상: {{item:scrapMetal}}·{{item:cordage}}·{{item:rationTicket}} 중 하나 / 위험: 체력 -1 / +35분",
    showOutcomeHint: true,
    conditions: [{ type: "stat_gte", stat: "energy", value: 1 }],
    effects: [
      { type: "change_stat", stat: "energy", value: -1 },
      { type: "advance_time", minutes: 35 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 35,
            effects: [
              { type: "add_item", itemId: "scrapMetal", amount: 2 },
              { type: "log", message: "검문소 차단봉 아래에서 쓸 만한 {{item:scrapMetal}} 두 개를 뜯어냈다." },
              { type: "set_scene", sceneId: "checkpoint_perimeter_scrap" },
            ],
          },
          {
            weight: 25,
            effects: [
              { type: "add_item", itemId: "cordage", amount: 1 },
              { type: "log", message: "초소 주변의 끊어진 케이블과 포장 끈을 묶어 {{item:cordage}} 하나를 챙겼다." },
              { type: "set_scene", sceneId: "checkpoint_perimeter_cordage" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "rationTicket", amount: 1 },
              { type: "log", message: "비어 있는 초소 서랍에서 구겨진 {{item:rationTicket}} 한 장을 찾아냈다." },
              { type: "set_scene", sceneId: "checkpoint_perimeter_ticket" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "change_stat", stat: "hp", value: -1 },
              { type: "log", message: "무너진 차단봉을 넘다 다리를 긁혔다. 검문소의 잔해는 아직 날카롭다." },
              { type: "set_scene", sceneId: "checkpoint_perimeter_injury" },
            ],
          },
        ],
      },
    ],
    tags: ["patrol", "salvage", "risk", "repeatable"],
    riskHint: "high",
  }),
];

export const checkpointLocation = defineLocation({
  id: "checkpoint",
  name: "검문소",
  risk: "high",
  mapPosition: { q: 3, r: 0 },
  imagePath: "assets/scenes/checkpoint.svg",
  summary: "뒤집힌 차단봉과 버려진 통신 차량이 남은 검문소다. 구조대의 무전 흔적과 송신기 부품을 찾을 수 있다.",
  tags: ["signal", "rescue", "tension"],
  traits: ["transmitter", "rescue rumor", "danger", "perimeter patrol"],
  obtainableItemIds: ["radioTransmitter", "painRelief", "rationTicket", "scrapMetal", "cordage"],
  neighbors: ["subway"],
  interactionChoices: checkpointChoices,
  links: {
    subway: { note: "부서진 지하 출구를 통해 지하철역 쪽으로 내려간다." },
  },
  stockNodes: [
    stockNode({
      id: "checkpoint_radio_truck",
      name: "통신 차량",
      summary: "먼지가 내려앉은 통신 차량 안쪽에 송신기 모듈과 응급 가방, 배급표 한 장이 남아 있다.",
      items: [
        { itemId: "radioTransmitter", initialQuantity: 1 },
        { itemId: "painRelief", initialQuantity: 1 },
        { itemId: "rationTicket", initialQuantity: 1 },
      ],
    }),
  ],
});
