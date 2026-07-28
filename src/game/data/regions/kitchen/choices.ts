import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";
import { collectStockItemChoiceParts, leaveStockNodeChoiceParts } from "../../stock-node-choice-helpers";

const scrapHeap = { locationId: "kitchen", nodeId: "kitchen_scrap_heap" } as const;
const ingredientCrate = { locationId: "kitchen", nodeId: "kitchen_ingredient_crate" } as const;

export const kitchenChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "collect_rice_from_kitchen_crate",
    label: "{{item:rawRice|을를}} 챙긴다",
    outcomeHint: "상자 바닥에 남은 {{item:rawRice}} 봉지를 챙겨 거처 요리 재료로 쓴다.",
    ...collectStockItemChoiceParts({
      ...ingredientCrate,
      itemId: "rawRice",
      logMessage: "당신은 식재료 상자 안쪽의 {{item:rawRice}} 봉지를 조심스럽게 챙긴다.",
      minutes: 10,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "collect_vegetables_from_kitchen_crate",
    label: "{{item:vegetables|을를}} 챙긴다",
    outcomeHint: "시든 부분을 덜어 내고 아직 먹을 수 있는 {{item:vegetables|을를}} 챙긴다.",
    ...collectStockItemChoiceParts({
      ...ingredientCrate,
      itemId: "vegetables",
      logMessage: "당신은 시든 잎을 덜어 내고 아직 먹을 수 있는 {{item:vegetables}}만 골라 넣는다.",
      minutes: 10,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "collect_water_from_kitchen_crate",
    label: "{{item:waterBottle|을를}} 챙긴다",
    outcomeHint: "상자 구석에 남은 {{item:waterBottle|을를}} 챙긴다.",
    ...collectStockItemChoiceParts({
      ...ingredientCrate,
      itemId: "waterBottle",
      logMessage: "당신은 상자 구석의 뜯지 않은 {{item:waterBottle|을를}} 꺼내 배낭에 넣는다.",
      minutes: 5,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "leave_kitchen_ingredient_crate",
    label: "식재료 상자에서 물러난다",
    outcomeHint: "식재료 상자를 닫고 다시 급식소 메인 공간으로 돌아간다.",
    ...leaveStockNodeChoiceParts(ingredientCrate.nodeId, "당신은 식재료 상자를 닫고 배식줄이 보이는 자리로 물러난다."),
    riskHint: "low",
  }),
  sceneChoice({
    id: "collect_scrap_from_kitchen_heap",
    label: "쓸 만한 {{item:scrapMetal|을를}} 챙긴다",
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
    label: "질긴 {{item:clothScrap|을를}} 챙긴다",
    outcomeHint: "찢긴 앞치마와 {{item:clothScrap}} 중 아직 쓸 만한 부분만 골라 재료로 챙긴다.",
    ...collectStockItemChoiceParts({
      ...scrapHeap,
      itemId: "clothScrap",
      logMessage: "당신은 아직 질긴 {{item:clothScrap}}만 골라 접어 품속에 넣는다.",
      minutes: 15,
    }),
    riskHint: "low",
  }),
  sceneChoice({
    id: "collect_cordage_from_kitchen_heap",
    label: "{{item:cordage|을를}} 챙긴다",
    outcomeHint: "앞치마 끈과 포대끈을 풀어 묶어, 도구와 설비를 고정할 재료로 챙긴다.",
    ...collectStockItemChoiceParts({
      ...scrapHeap,
      itemId: "cordage",
      logMessage: "당신은 앞치마 끈과 포대끈을 풀어 한데 묶어 둔다.",
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
