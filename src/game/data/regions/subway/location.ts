import type { ActionDefinition } from "../../../schemas";
import { defineLocation, interactionFor, stockNode } from "../../location-helpers";

export const subwayChoices: ActionDefinition[] = [
  interactionFor("subway", {
    id: "start_subway_expedition",
    label: "준비를 마치고 지하 1층으로 내려간다",
    type: "explore",
    outcomeHint: "+10분",
    showOutcomeHint: true,
    effects: [],
    tags: ["subway-expedition-start", "repeatable", "risk"],
    riskHint: "high",
  }),
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
    id: "trace_day6_station_notice",
    label: "6일차 역무실 안내문을 대조한다",
    type: "search",
    outcomeHint: "대합실의 구조 안내문에서 검문소 통신 차량의 위치를 확인한다. {{item:cordage}} 1개 / +90분",
    showOutcomeHint: true,
    conditions: [
      { type: "flag", flag: "day6_subway_hint" },
      { type: "flag_not", flag: "station_notice_checked" },
    ],
    effects: [
      { type: "advance_time", minutes: 90 },
      { type: "add_item", itemId: "cordage", amount: 1 },
      { type: "set_flag", flag: "station_notice_checked" },
      { type: "log", message: "대합실 안내문에 역무실 신호함의 안테나와 검문소 통신 차량의 위치가 함께 적혀 있다." },
    ],
    tags: ["hint", "signal", "resource"],
    riskHint: "low",
  }),];

export const subwayLocation = defineLocation({
  id: "subway",
  name: "지하철역",
  risk: "high",
  mapPosition: { q: 1, r: -1 },
  imagePath: "assets/scenes/subway.svg",
  summary: "지상과 연결된 대합실과 어두운 역무실이 남은 지하철역이다. 이곳에서 장비를 정비한 뒤 지하 1층부터 심층 탐험을 시작할 수 있다.",
  tags: ["signal", "underground", "day6"],
  traits: ["antenna", "concourse", "expedition staging"],
  residentIds: ["shumi"],
  obtainableItemIds: ["radioAntenna", "scrapMetal", "cordage", "waterBottle"],
  neighbors: ["shelter", "kitchen", "checkpoint"],
  interactionChoices: subwayChoices,
  links: {
    shelter: { note: "지상으로 올라가 왼쪽 아래의 임시 거처로 돌아간다." },
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
