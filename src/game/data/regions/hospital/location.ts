import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor, stockNode } from "../../location-helpers";

export const hospitalChoices: ActionDefinition[] = [
  interactionFor("hospital", {
    id: "go_to_hospital_medicine_cabinet",
    label: "약품 보관함으로 간다",
    type: "search",
    outcomeHint: "깨진 접수대 뒤 약품 보관함을 열어, 남은 약과 {{item:radioBattery|을를}} 확인한다.",
    effects: [
      { type: "focus_stock_node", nodeId: "hospital_medicine_cabinet" },
      { type: "log", message: "당신은 깨진 접수대 뒤로 몸을 낮춰 약품 보관함 앞에 선다." },
    ],
    tags: ["medicine", "signal", "search"],
    riskHint: "medium",
  }),
  interactionFor("hospital", {
    id: "receive_hospital_first_aid",
    label: "응급 처치를 받는다",
    type: "use",
    outcomeHint: "-1,800원 / +2 체력 / +15분",
    showOutcomeHint: true,
    conditions: [{ type: "money_gte", amount: 1800 }],
    effects: [
      { type: "change_money", amount: -1800 },
      { type: "change_stat", stat: "hp", value: 2 },
      { type: "log", message: "당신은 남은 소독약과 붕대로 상처를 묶는다. 몸은 조금 나아졌지만, 병원 바닥의 신음은 오래 남는다." },
      { type: "advance_time", minutes: 15 },
    ],
    tags: ["medicine", "recovery"],
    riskHint: "low",
  }),
  interactionFor("hospital", {
    id: "help_hospital_triage",
    label: "임시 처치대를 돕는다",
    type: "use",
    outcomeHint: "기력 -1 / 보상: {{item:painRelief}}·{{item:clothScrap}}·{{item:cordage}}·간단한 처치 중 하나 / +35분",
    showOutcomeHint: true,
    conditions: [{ type: "stat_gte", stat: "energy", value: 1 }],
    effects: [
      { type: "change_stat", stat: "energy", value: -1 },
      { type: "advance_time", minutes: 35 },
      {
        type: "random_outcome",
        outcomes: [
          {
            weight: 30,
            effects: [
              { type: "add_item", itemId: "painRelief", amount: 1 },
              { type: "log", message: "당신은 임시 처치대를 돕고 {{item:painRelief}} 한 알을 받았다." },
              { type: "set_scene", sceneId: "hospital_triage_pain_relief" },
            ],
          },
          {
            weight: 30,
            effects: [
              { type: "add_item", itemId: "clothScrap", amount: 1 },
              { type: "log", message: "당신은 더러운 붕대 더미를 정리하다가 쓸 만한 {{item:clothScrap}} 하나를 챙겼다." },
              { type: "set_scene", sceneId: "hospital_triage_cloth" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "add_item", itemId: "cordage", amount: 1 },
              { type: "log", message: "당신은 수액줄을 걷어 내고 묶는 데 쓸 만한 {{item:cordage}} 하나를 얻었다." },
              { type: "set_scene", sceneId: "hospital_triage_cordage" },
            ],
          },
          {
            weight: 20,
            effects: [
              { type: "change_stat", stat: "hp", value: 1 },
              { type: "log", message: "당신은 처치대를 도운 대가로 짧은 소독과 붕대 교체를 받았다." },
              { type: "set_scene", sceneId: "hospital_triage_treatment" },
            ],
          },
        ],
      },
    ],
    tags: ["medicine", "work", "repeatable", "resource"],
    riskHint: "medium",
  }),
];

export const hospitalLocation = defineLocation({
  id: "hospital",
  name: "작은 병원",
  risk: "medium",
  mapPosition: { q: -2, r: 2 },
  imagePath: "assets/scenes/hospital.svg",
  summary: "깨진 유리와 소독약 냄새, 낮은 신음이 뒤섞인 작은 병원이다. 아직 쓸 만한 약품과 전원 부품이 남아 있다.",
  tags: ["medicine", "signal", "day4"],
  traits: ["first aid", "battery", "stress", "triage work"],
  obtainableItemIds: ["painRelief", "clothScrap", "cordage", "radioBattery"],
  neighbors: ["convenience", "river"],
  interactionChoices: hospitalChoices,
  links: {
    convenience: { note: "병원 뒤편 골목을 거슬러 편의점 폐허 쪽으로 돌아간다." },
    river: { note: "병원 옆 무너진 제방 계단을 따라 강가로 내려간다." },
  },
  stockNodes: [
    stockNode({
      id: "hospital_medicine_cabinet",
      name: "약품 보관함",
      summary: "잠금장치가 휘어진 철제 보관함 안에 진통제와 천 조각, 묵직한 무전기 배터리가 남아 있다.",
      items: [
        { itemId: "painRelief", initialQuantity: 2 },
        { itemId: "clothScrap", initialQuantity: 2 },
        { itemId: "cordage", initialQuantity: 2 },
        { itemId: "radioBattery", initialQuantity: 1 },
      ],
    }),
  ],
});
