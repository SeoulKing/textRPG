import type { ChoiceDefinition } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";

export const arcanaPlazaChoiceDefinitions: ChoiceDefinition[] = [
  sceneChoice({
    id: "brew_mana_potion",
    label: "{{item:manaPotion}}",
    outcomeHint: "효과: MP +4. 필요 재료: {{item:moonHerb}} 2 / {{item:arcaneDust}} 1. 연금 시간 20분.",
    showOutcomeHint: true,
    presentationMode: "always",
    conditions: [
      { type: "has_item", itemId: "moonHerb", amount: 2 },
      { type: "has_item", itemId: "arcaneDust", amount: 1 },
    ],
    failureNote: "{{item:moonHerb}} 2개와 {{item:arcaneDust}} 1개가 필요하다.",
    failureEffects: [
      { type: "log", message: "{{item:manaPotion|을를}} 만들려면 {{item:moonHerb}} 두 줌과 룬에서 응축한 {{item:arcaneDust}} 한 줌이 필요하다." },
    ],
    effects: [
      { type: "remove_item", itemId: "moonHerb", amount: 2 },
      { type: "remove_item", itemId: "arcaneDust", amount: 1 },
      { type: "add_item", itemId: "manaPotion", amount: 1 },
      { type: "advance_time", minutes: 20 },
      { type: "log", message: "은빛 약초와 {{item:arcaneDust|이가}} 푸른 액체로 녹아들며 {{item:manaPotion}} 한 병이 완성됐다." },
    ],
    nextSceneId: "arcana_workbench_menu_repeat",
    riskHint: "low",
  }),
  sceneChoice({
    id: "craft_rune_compass",
    label: "{{item:runeCompass}}",
    outcomeHint: "효과: 마법도시의 숨은 길 탐색용 마도구. 필요 재료: {{item:manaShard}} 1 / {{item:arcaneDust}} 2. 제작 시간 30분.",
    showOutcomeHint: true,
    presentationMode: "always",
    conditions: [
      { type: "has_item", itemId: "manaShard", amount: 1 },
      { type: "has_item", itemId: "arcaneDust", amount: 2 },
    ],
    failureNote: "{{item:manaShard}} 1개와 {{item:arcaneDust}} 2개가 필요하다.",
    failureEffects: [
      { type: "log", message: "{{item:runeCompass}}의 중심에는 포탈에서 얻은 {{item:manaShard|과와}} {{item:arcaneDust}} 두 줌이 필요하다." },
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
