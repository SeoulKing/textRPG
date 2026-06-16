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

export const checkpointChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "collect_radio_transmitter_from_checkpoint",
    label: "무전기 송신기 챙기기",
    outcomeHint: "통신 차량 안쪽의 송신기 모듈을 떼어낸다. 구조 신호 장비의 마지막 핵심 부품이다.",
    conditions: [
      { type: "active_stock_node", nodeId: "checkpoint_radio_truck" },
      { type: "stock_item_gte", locationId: "checkpoint", nodeId: "checkpoint_radio_truck", itemId: "radioTransmitter", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "checkpoint", nodeId: "checkpoint_radio_truck", itemId: "radioTransmitter" }),
      { type: "change_stat", stat: "mind", value: -1 },
      { type: "log", message: "검문소 통신 차량에서 무전기 송신기를 떼어냈다. 손끝은 떨렸지만, 구조 신호를 완성할 가능성이 또렷해졌다." },
      { type: "advance_time", phases: 1 },
    ],
    riskHint: "high",
  }),
  choice({
    id: "collect_pain_relief_from_checkpoint",
    label: "응급 약품 챙기기",
    outcomeHint: "버려진 응급 가방에서 쓸 만한 진통제를 챙긴다.",
    conditions: [
      { type: "active_stock_node", nodeId: "checkpoint_radio_truck" },
      { type: "stock_item_gte", locationId: "checkpoint", nodeId: "checkpoint_radio_truck", itemId: "painRelief", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "checkpoint", nodeId: "checkpoint_radio_truck", itemId: "painRelief" }),
      { type: "log", message: "검문소 응급 가방에서 아직 쓸 수 있는 진통제를 챙겼다." },
      { type: "advance_time", phases: 1 },
    ],
    riskHint: "medium",
  }),
  choice({
    id: "collect_ration_ticket_from_checkpoint",
    label: "배급표 챙기기",
    outcomeHint: "책상 위에 남은 배급표를 챙긴다. 급식소에서 아직 통할 수도 있다.",
    conditions: [
      { type: "active_stock_node", nodeId: "checkpoint_radio_truck" },
      { type: "stock_item_gte", locationId: "checkpoint", nodeId: "checkpoint_radio_truck", itemId: "rationTicket", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "checkpoint", nodeId: "checkpoint_radio_truck", itemId: "rationTicket" }),
      { type: "log", message: "검문소 책상 위에서 구겨진 배급표를 챙겼다." },
      { type: "advance_time", phases: 1 },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_checkpoint_radio_truck",
    label: "통신 차량에서 물러나기",
    outcomeHint: "차량 문을 조심히 닫고 검문소 바깥으로 물러난다.",
    conditions: [{ type: "active_stock_node", nodeId: "checkpoint_radio_truck" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "통신 차량에서 물러나 검문소 바깥 상황을 다시 살폈다." },
    ],
    riskHint: "low",
  }),
];
