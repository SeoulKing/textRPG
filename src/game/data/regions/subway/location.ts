import type { ActionDefinition, LocationDefinition } from "../../../schemas";
import { interactionFor } from "../../location-interaction-helpers";

export const subwayChoices: ActionDefinition[] = [
  interactionFor("subway", {
    id: "go_to_subway_signal_box",
    label: "역무실 신호함을 살핀다",
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
    id: "push_toward_checkpoint",
    label: "검문소 쪽 출구를 확인하기",
    type: "explore",
    outcomeHint: "지하철역 반대편 출구를 확인해 구조대 무전 소문이 도는 검문소 단서를 정리한다.",
    conditions: [{ type: "flag_not", flag: "checkpoint_lead_checked" }],
    effects: [
      { type: "set_flag", flag: "checkpoint_lead_checked" },
      { type: "set_flag", flag: "known_checkpoint" },
      { type: "change_stat", stat: "mind", value: -1 },
      { type: "log", message: "당신은 어두운 승강장을 지나 반대편 출구의 철문을 밀어 낸다. 멀리 검문소 확성기 소리가 희미하게 들린다." },
      { type: "advance_time", phases: 1 },
    ],
    tags: ["hint", "explore"],
    riskHint: "high",
  }),
];

export const subwayLocation: LocationDefinition = {
  id: "subway",
  name: "지하철역",
  risk: "high",
  imagePath: "assets/scenes/subway.svg",
  summary: "전기가 끊긴 승강장과 어두운 역무실이 남은 지하철역이다. 신호 장비를 뜯어 쓸 수 있지만, 오래 머물수록 정신이 닳는다.",
  tags: ["signal", "underground", "day6"],
  traits: ["antenna", "metal", "stress"],
  obtainableItemIds: ["radioAntenna", "scrapMetal", "waterBottle"],
  residentIds: [],
  neighbors: ["shelter", "kitchen", "checkpoint"],
  interactionChoices: subwayChoices,
  eventIds: [],
  links: {
    shelter: { note: "어둠을 등지고 임시 거처 쪽으로 올라간다." },
    kitchen: { note: "급식소 뒤편 계단으로 되돌아간다." },
    checkpoint: {
      note: "반대편 출구를 지나 구조대 무전 소문이 도는 검문소 쪽으로 간다.",
    },
  },
  stockNodes: [
    {
      id: "subway_signal_box",
      name: "역무실 신호함",
      summary: "벽면 신호함 안에 접이식 안테나와 고철 조각, 미개봉 물병 하나가 끼어 있다.",
      money: 0,
      items: [
        { itemId: "radioAntenna", initialQuantity: 1 },
        { itemId: "scrapMetal", initialQuantity: 2 },
        { itemId: "waterBottle", initialQuantity: 1 },
      ],
    },
  ],
};
