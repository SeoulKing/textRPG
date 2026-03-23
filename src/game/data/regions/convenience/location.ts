import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const convenienceChoices: ActionDefinition[] = [
  interactionFor("convenience", {
    id: "survey_convenience",
    label: "살펴보기",
    type: "search",
    outcomeHint: "무너진 가게 안을 더듬어, 아직 털리지 않은 진열대와 계산대 주변의 흔적을 찾아낸다.",
    conditions: [{ type: "flag_not", flag: "convenience_register_found" }],
    effects: [
      { type: "set_flag", flag: "convenience_shelf_found" },
      { type: "set_flag", flag: "convenience_register_found" },
      { type: "discover_stock_node", nodeId: "convenience_shelf" },
      { type: "discover_stock_node", nodeId: "convenience_register" },
      { type: "log", message: "당신은 무너진 가게 안쪽에서 아직 통조림이 남은 진열대와, 서랍이 반쯤 열린 계산대를 함께 찾아낸다." },
    ],
    tags: ["survey"],
  }),
];

export const convenienceLocation: LocationDefinition = {
  id: "convenience",
  name: "편의점 폐허",
  risk: "low",
  imagePath: "assets/scenes/convenience.png",
  summary: "반쯤 무너진 가게 안에, 허기와 급박한 생활의 흔적이 아직 어지럽게 남아 있다.",
  tags: ["supplies", "early scavenging"],
  traits: ["food", "water", "cash", "light danger"],
  obtainableItemIds: ["emergencySnack", "cannedFood", "rawRice", "vegetables", "waterBottle"],
  residentIds: [],
  neighbors: ["shelter"],
  interactionChoices: convenienceChoices,
  eventIds: [],
  links: {
    shelter: { note: "무심한 발걸음처럼 가장한 채 거처 쪽으로 되돌아간다." },
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
  ],
};
