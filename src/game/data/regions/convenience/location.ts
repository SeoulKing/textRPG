import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const convenienceChoices: ActionDefinition[] = [
  interactionFor("convenience", {
    id: "survey_convenience",
    label: "살펴보기",
    type: "search",
    outcomeHint: "무너진 가게 안을 더듬어, 아직 털리지 않은 진열대와 계산대, 자재가 남은 창고 쪽을 찾아낸다.",
    conditions: [{ type: "flag_not", flag: "convenience_materials_found" }],
    effects: [
      { type: "set_flag", flag: "convenience_shelf_found" },
      { type: "set_flag", flag: "convenience_register_found" },
      { type: "set_flag", flag: "convenience_materials_found" },
      { type: "discover_stock_node", nodeId: "convenience_shelf" },
      { type: "discover_stock_node", nodeId: "convenience_register" },
      { type: "discover_stock_node", nodeId: "convenience_supply_pile" },
      {
        type: "log",
        message:
          "당신은 무너진 가게 안쪽에서 아직 통조림이 남은 진열대, 서랍이 반쯤 열린 계산대, 그리고 창고 쪽에 쌓인 자재 더미까지 함께 찾아낸다.",
      },
      { type: "advance_time", phases: 1 },
    ],
    tags: ["survey"],
  }),
  interactionFor("convenience", {
    id: "push_beyond_convenience_ruins",
    label: "병원 쪽 길을 확인하기",
    type: "explore",
    outcomeHint: "편의점 뒤편 골목을 살펴 약품 냄새가 남은 작은 병원 쪽 단서를 확인한다.",
    conditions: [{ type: "flag_not", flag: "hospital_lead_checked" }],
    effects: [
      { type: "set_flag", flag: "hospital_lead_checked" },
      { type: "set_flag", flag: "known_hospital" },
      {
        type: "log",
        message: "당신은 편의점 뒤편 골목 끝에서 깨진 간판이 매달린 작은 병원 입구를 찾아낸다. 약품을 찾을 희망이 생겼다.",
      },
      { type: "advance_time", phases: 1 },
    ],
    tags: ["hint", "explore"],
    riskHint: "medium",
  }),
];

export const convenienceLocation: LocationDefinition = {
  id: "convenience",
  name: "편의점 폐허",
  risk: "low",
  imagePath: "assets/scenes/convenience.png",
  summary: "반쯤 무너진 가게 안에, 허기와 급박한 생활의 흔적이 아직 어지럽게 남아 있다.",
  tags: ["supplies", "early scavenging"],
  traits: ["food", "water", "cash", "salvage"],
  obtainableItemIds: ["emergencySnack", "cannedFood", "rawRice", "vegetables", "waterBottle", "woodPlank", "scrapMetal", "clothScrap"],
  residentIds: [],
  neighbors: ["shelter", "hospital"],
  interactionChoices: convenienceChoices,
  eventIds: [],
  links: {
    shelter: { note: "무심한 발걸음처럼 가장한 채 거처 쪽으로 되돌아간다." },
    hospital: {
      note: "편의점 뒤편 골목을 지나 약품 냄새가 희미하게 남은 병원 쪽으로 간다.",
    },
  },
  stockNodes: [
    {
      id: "convenience_shelf",
      name: "진열대",
      summary: "무너진 선반 안쪽에 아직 손이 닿지 않은 통조림 몇 개가 남아 있다.",
      money: 0,
      items: [{ itemId: "cannedFood", initialQuantity: 3 }],
    },
    {
      id: "convenience_register",
      name: "계산대",
      summary: "유리 파편과 먼지 속에 파묻힌 계산대 서랍 안쪽에 아직 회수되지 않은 잔돈이 남아 있다.",
      money: 1800,
      items: [],
    },
    {
      id: "convenience_supply_pile",
      name: "창고 자재 더미",
      summary: "반쯤 무너진 창고 쪽 선반 아래에 판자와 천, 금속 부품이 뒤엉켜 쌓여 있다.",
      money: 0,
      items: [
        { itemId: "woodPlank", initialQuantity: 3 },
        { itemId: "clothScrap", initialQuantity: 2 },
        { itemId: "scrapMetal", initialQuantity: 1 },
      ],
    },
  ],
};
