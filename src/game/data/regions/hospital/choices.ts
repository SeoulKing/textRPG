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

export const hospitalChoiceDefinitions: ChoiceDefinition[] = [
  choice({
    id: "collect_radio_battery_from_hospital",
    label: "무전기 배터리를 챙긴다",
    outcomeHint: "묵직한 배터리를 가방 안쪽에 고정한다. 구조 신호 장비의 첫 핵심 부품이다.",
    conditions: [
      { type: "active_stock_node", nodeId: "hospital_medicine_cabinet" },
      { type: "stock_item_gte", locationId: "hospital", nodeId: "hospital_medicine_cabinet", itemId: "radioBattery", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "hospital", nodeId: "hospital_medicine_cabinet", itemId: "radioBattery" }),
      { type: "log", message: "당신은 보관함 깊숙한 곳에서 무전기 배터리를 꺼내 가방 안쪽에 고정한다." },
      { type: "advance_time", minutes: 15 },
    ],
    riskHint: "medium",
  }),
  choice({
    id: "collect_pain_relief_from_hospital",
    label: "진통제를 챙긴다",
    outcomeHint: "남은 진통제를 챙겨, 부상에 대비한다.",
    conditions: [
      { type: "active_stock_node", nodeId: "hospital_medicine_cabinet" },
      { type: "stock_item_gte", locationId: "hospital", nodeId: "hospital_medicine_cabinet", itemId: "painRelief", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "hospital", nodeId: "hospital_medicine_cabinet", itemId: "painRelief" }),
      { type: "log", message: "당신은 상자에 남은 진통제를 조심스럽게 챙긴다." },
      { type: "advance_time", minutes: 15 },
    ],
    riskHint: "low",
  }),
  choice({
    id: "collect_cloth_from_hospital",
    label: "붕대로 쓸 천을 챙긴다",
    outcomeHint: "깨끗한 천 조각을 챙겨 제작과 응급처치에 대비한다.",
    conditions: [
      { type: "active_stock_node", nodeId: "hospital_medicine_cabinet" },
      { type: "stock_item_gte", locationId: "hospital", nodeId: "hospital_medicine_cabinet", itemId: "clothScrap", amount: 1 },
    ],
    effects: [
      collectStockItemEffect({ locationId: "hospital", nodeId: "hospital_medicine_cabinet", itemId: "clothScrap" }),
      { type: "log", message: "당신은 아직 깨끗한 천 조각을 접어 넣는다." },
      { type: "advance_time", minutes: 15 },
    ],
    riskHint: "low",
  }),
  choice({
    id: "leave_hospital_medicine_cabinet",
    label: "보관함에서 물러선다",
    outcomeHint: "보관함 문을 조심히 닫고 병원 로비 쪽으로 돌아간다.",
    conditions: [{ type: "active_stock_node", nodeId: "hospital_medicine_cabinet" }],
    effects: [
      { type: "clear_stock_node_focus" },
      { type: "log", message: "당신은 보관함 문을 밀어 닫고 병원 로비 쪽으로 몸을 돌린다." },
    ],
    riskHint: "low",
  }),
];
