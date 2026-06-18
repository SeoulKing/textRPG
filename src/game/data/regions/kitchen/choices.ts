import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";
import { collectStockItemChoiceParts, leaveStockNodeChoiceParts } from "../../stock-node-choice-helpers";

const scrapHeap = { locationId: "kitchen", nodeId: "kitchen_scrap_heap" } as const;

export const kitchenChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "collect_scrap_from_kitchen_heap",
    label: "쓸 만한 고철을 챙긴다",
    outcomeHint: "덜 녹슨 금속 부품과 철판 조각을 한데 모아, 제작에 쓸 재료로 챙긴다.",
    ...collectStockItemChoiceParts({
      ...scrapHeap,
      itemId: "scrapMetal",
      logMessage: "당신은 덜 녹슨 금속 부품을 한데 그러모아 조심스럽게 챙긴다.",
      minutes: 15,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "collect_cloth_from_kitchen_heap",
    label: "질긴 천 조각을 챙긴다",
    outcomeHint: "찢긴 앞치마와 천 조각 중 아직 쓸 만한 부분만 골라 재료로 챙긴다.",
    ...collectStockItemChoiceParts({
      ...scrapHeap,
      itemId: "clothScrap",
      logMessage: "당신은 아직 질긴 천 조각만 골라 접어 품속에 넣는다.",
      minutes: 15,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "leave_kitchen_scrap_heap",
    label: "급식소로 돌아간다",
    outcomeHint: "폐자재 더미 앞에서 몸을 빼고 다시 급식소 메인 공간으로 돌아간다.",
    ...leaveStockNodeChoiceParts(scrapHeap.nodeId, "당신은 챙길 것을 추린 뒤 다시 배식줄이 보이는 급식소 쪽으로 물러선다."),
    riskHint: "low",
  }),
];
