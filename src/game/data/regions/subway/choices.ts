import type { ChoiceDefinition } from "../../../schemas";
import { collectStockItemEffect } from "../../stock-node-choice-helpers";

type ChoiceInput = Omit<ChoiceDefinition, "conditions" | "hidden" | "presentationMode" | "failureEffects"> &
  Partial<Pick<ChoiceDefinition, "conditions" | "hidden" | "presentationMode" | "failureEffects">>;

function choice(definition: ChoiceInput): ChoiceDefinition {
  return {
    conditions: [],
    hidden: false,
    presentationMode: "when_conditions_met",
    failureEffects: [],
    ...definition,
  };
}

export const subwayChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "collect_radio_antenna_from_subway",
    label: "무전기 안테나를 떼어 낸다",
    outcomeHint: "신호함 안쪽에 고정된 접이식 안테나를 떼어 낸다. 구조 신호 장비의 두 번째 핵심 부품이다.",
    conditions: [
      { type: "active_stock_node", nodeId: "subway_signal_box" },
      { type: "stock_item_gte", locationId: "subway", nodeId: "subway_signal_box", itemId: "radioAntenna", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "subway", nodeId: "subway_signal_box", itemId: "radioAntenna" }),
      { type: "change_stat", stat: "mind", value: -1 },
      { type: "log", message: "당신은 녹슨 나사를 비틀어 무전기 안테나를 떼어 낸다. 어둠 속 금속음이 한동안 귀에 남는다." },
      { type: "advance_time", phases: 1 },
    ],
    riskHint: "high",
  }),
  choice({
    id: "collect_scrap_from_subway",
    label: "신호함 고철을 챙긴다",
    outcomeHint: "신호함 안의 금속 브래킷과 나사를 제작 재료로 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "subway_signal_box" },
      { type: "stock_item_gte", locationId: "subway", nodeId: "subway_signal_box", itemId: "scrapMetal", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "subway", nodeId: "subway_signal_box", itemId: "scrapMetal" }),
      { type: "log", message: "당신은 신호함 안쪽의 금속 브래킷과 나사를 챙긴다." },
      { type: "advance_time", phases: 1 },
    ],
    riskHint: "medium",
  }),
  choice({
    id: "collect_water_from_subway",
    label: "미개봉 물병을 챙긴다",
    outcomeHint: "역무실 책상 아래 굴러 들어간 물병을 꺼낸다.",
    conditions: [
      { type: "active_stock_node", nodeId: "subway_signal_box" },
      { type: "stock_item_gte", locationId: "subway", nodeId: "subway_signal_box", itemId: "waterBottle", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "subway", nodeId: "subway_signal_box", itemId: "waterBottle" }),
      { type: "log", message: "당신은 책상 아래 굴러 들어간 미개봉 물병을 꺼낸다." },
      { type: "advance_time", phases: 1 },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_subway_signal_box",
    label: "역무실 밖으로 물러선다",
    outcomeHint: "신호함에서 손을 떼고 다시 승강장 쪽으로 물러선다.",
    conditions: [{ type: "active_stock_node", nodeId: "subway_signal_box" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 신호함 문을 닫고 어두운 승강장 쪽으로 물러선다." },
    ],
    riskHint: "low",
  }),
];
