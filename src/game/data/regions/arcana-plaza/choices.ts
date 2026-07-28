import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";

export const arcanaPlazaChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "brew_mana_potion",
    label: "마나 포션",
    outcomeHint: "효과: MP +4. 필요 재료: 달빛 약초 2 / 비전 가루 1. 연금 시간 20분.",
    showOutcomeHint: true,
    presentationMode: "always",
    conditions: [
      { type: "has_item", itemId: "moonHerb", amount: 2 },
      { type: "has_item", itemId: "arcaneDust", amount: 1 },
    ],
    failureNote: "달빛 약초 2개와 비전 가루 1개가 필요하다.",
    failureEffects: [
      { type: "log", message: "마나 포션을 만들려면 달빛 약초 두 줌과 룬에서 응축한 비전 가루 한 줌이 필요하다." },
    ],
    effects: [
      { type: "remove_item", itemId: "moonHerb", amount: 2 },
      { type: "remove_item", itemId: "arcaneDust", amount: 1 },
      { type: "add_item", itemId: "manaPotion", amount: 1 },
      { type: "advance_time", minutes: 20 },
      { type: "log", message: "은빛 약초와 비전 가루가 푸른 액체로 녹아들며 마나 포션 한 병이 완성됐다." },
    ],
    nextSceneId: "arcana_workbench_menu_repeat",
    riskHint: "low",
  }),
  sceneChoice({
    id: "craft_rune_compass",
    label: "룬 나침반",
    outcomeHint: "효과: 마법도시의 숨은 길 탐색용 마도구. 필요 재료: 마력 결정 파편 1 / 비전 가루 2. 제작 시간 30분.",
    showOutcomeHint: true,
    presentationMode: "always",
    conditions: [
      { type: "has_item", itemId: "manaShard", amount: 1 },
      { type: "has_item", itemId: "arcaneDust", amount: 2 },
    ],
    failureNote: "마력 결정 파편 1개와 비전 가루 2개가 필요하다.",
    failureEffects: [
      { type: "log", message: "룬 나침반의 중심에는 포탈에서 얻은 마력 결정 파편과 비전 가루 두 줌이 필요하다." },
    ],
    effects: [
      { type: "remove_item", itemId: "manaShard", amount: 1 },
      { type: "remove_item", itemId: "arcaneDust", amount: 2 },
      { type: "add_item", itemId: "runeCompass", amount: 1 },
      { type: "advance_time", minutes: 30 },
      { type: "log", message: "결정 파편 둘레에 룬 고리를 고정하자, 나침반 바늘이 아직 열리지 않은 마법도시의 안쪽을 가리킨다." },
    ],
    nextSceneId: "arcana_workbench_menu_repeat",
    riskHint: "low",
  }),
  sceneChoice({
    id: "leave_arcana_workbench",
    label: "광장으로 돌아간다",
    outcomeHint: "마법 재료를 정리하고 아르카나 광장으로 돌아간다.",
    effects: [
      { type: "clear_flag", flag: "arcana_workbench_open" },
      { type: "log", message: "당신은 작업대의 푸른 촛불을 낮추고 남은 마법 재료를 챙긴다." },
    ],
    nextSceneId: "arcana_plaza_repeat_intro",
    riskHint: "low",
  }),
];
