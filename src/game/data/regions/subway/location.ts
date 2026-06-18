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
];

export const subwayLocation = defineLocation({
  id: "subway",
  name: "지하철역",
  risk: "high",
  mapPosition: { q: 2, r: 0 },
  imagePath: "assets/scenes/subway.svg",
  summary: "전기가 끊긴 승강장과 어두운 역무실이 남은 지하철역이다. 신호 장비를 뜯어 쓸 수 있지만, 오래 머물수록 정신이 닳는다.",
  tags: ["signal", "underground", "day6"],
  traits: ["antenna", "metal", "stress"],
  obtainableItemIds: ["radioAntenna", "scrapMetal", "waterBottle"],
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
