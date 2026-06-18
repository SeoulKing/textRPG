import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";
import { collectStockItemChoiceParts, leaveStockNodeChoiceParts } from "../../stock-node-choice-helpers";

const medicineCabinet = { locationId: "hospital", nodeId: "hospital_medicine_cabinet" } as const;

export const hospitalChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "collect_radio_battery_from_hospital",
    label: "무전기 배터리를 챙긴다",
    outcomeHint: "묵직한 배터리를 가방 안쪽에 고정한다. 구조 신호 장비의 첫 핵심 부품이다.",
    ...collectStockItemChoiceParts({
      ...medicineCabinet,
      itemId: "radioBattery",
      logMessage: "당신은 보관함 깊숙한 곳에서 무전기 배터리를 꺼내 가방 안쪽에 고정한다.",
      minutes: 15,
    }),
    riskHint: "medium",
  }),
  sceneChoice({
    id: "collect_pain_relief_from_hospital",
    label: "진통제를 챙긴다",
    outcomeHint: "남은 진통제를 챙겨, 부상에 대비한다.",
    ...collectStockItemChoiceParts({
      ...medicineCabinet,
      itemId: "painRelief",
      logMessage: "당신은 상자에 남은 진통제를 조심스럽게 챙긴다.",
      minutes: 15,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "collect_cloth_from_hospital",
    label: "붕대로 쓸 천을 챙긴다",
    outcomeHint: "깨끗한 천 조각을 챙겨 제작과 응급처치에 대비한다.",
    ...collectStockItemChoiceParts({
      ...medicineCabinet,
      itemId: "clothScrap",
      logMessage: "당신은 아직 깨끗한 천 조각을 접어 넣는다.",
      minutes: 15,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "leave_hospital_medicine_cabinet",
    label: "보관함에서 물러선다",
    outcomeHint: "보관함 문을 조심히 닫고 병원 로비 쪽으로 돌아간다.",
    ...leaveStockNodeChoiceParts(medicineCabinet.nodeId, "당신은 보관함 문을 밀어 닫고 병원 로비 쪽으로 몸을 돌린다."),
    riskHint: "low",
  }),
];
