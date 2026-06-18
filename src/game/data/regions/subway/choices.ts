import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";
import { collectStockItemChoiceParts, leaveStockNodeChoiceParts } from "../../stock-node-choice-helpers";

const signalBox = { locationId: "subway", nodeId: "subway_signal_box" } as const;

export const subwayChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "collect_radio_antenna_from_subway",
    label: "무전기 안테나를 떼어 낸다",
    outcomeHint: "신호함 안쪽에 고정된 접이식 안테나를 떼어 낸다. 구조 신호 장비의 두 번째 핵심 부품이다.",
    ...collectStockItemChoiceParts({
      ...signalBox,
      itemId: "radioAntenna",
      extraEffects: [{ type: "change_stat", stat: "mind", value: -1 }],
      logMessage: "당신은 녹슨 나사를 비틀어 무전기 안테나를 떼어 낸다. 어둠 속 금속음이 한동안 귀에 남는다.",
      minutes: 15,
    }),
    riskHint: "high",
  }),
  sceneChoice({
    id: "collect_scrap_from_subway",
    label: "신호함 고철을 챙긴다",
    outcomeHint: "신호함 안의 금속 브래킷과 나사를 제작 재료로 챙긴다.",
    ...collectStockItemChoiceParts({
      ...signalBox,
      itemId: "scrapMetal",
      logMessage: "당신은 신호함 안쪽의 금속 브래킷과 나사를 챙긴다.",
      minutes: 15,
    }),
    riskHint: "medium",
  }),
  sceneChoice({
    id: "collect_water_from_subway",
    label: "미개봉 물병을 챙긴다",
    outcomeHint: "역무실 책상 아래 굴러 들어간 물병을 꺼낸다.",
    ...collectStockItemChoiceParts({
      ...signalBox,
      itemId: "waterBottle",
      logMessage: "당신은 책상 아래 굴러 들어간 미개봉 물병을 꺼낸다.",
      minutes: 15,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "leave_subway_signal_box",
    label: "역무실 밖으로 물러선다",
    outcomeHint: "신호함에서 손을 떼고 다시 승강장 쪽으로 물러선다.",
    ...leaveStockNodeChoiceParts(signalBox.nodeId, "당신은 신호함 문을 닫고 어두운 승강장 쪽으로 물러선다."),
    riskHint: "low",
  }),
];
