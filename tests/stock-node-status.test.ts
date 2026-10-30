import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGameState } from "../src/game/rules";
import type { StoryChoice } from "../src/game/schemas";
import { getStockStateKey } from "../src/game/state-utils";
import { buildActionCatalogFromStoryChoices } from "../src/game/story-flow";

function storyChoice(
  id: string,
  effects: StoryChoice["effects"],
): StoryChoice {
  return {
    id,
    label: id,
    outcomeHint: "",
    serverActionHint: { type: "content_choice", choiceId: id },
    isAvailable: true,
    effects,
  };
}

test("depleted physical stock-node choices remain visible with a completion label", () => {
  const state = createInitialGameState();
  const enterShelf = storyChoice("go_to_convenience_shelf", [
    { type: "focus_stock_node", nodeId: "convenience_shelf" },
  ]);

  assert.equal(
    buildActionCatalogFromStoryChoices([enterShelf], state)[0]?.statusLabel,
    undefined,
  );

  state.stockState[
    getStockStateKey("convenience", "convenience_shelf", "cannedFood")
  ] = 0;

  const completed = buildActionCatalogFromStoryChoices([enterShelf], state)[0];
  assert.equal(completed?.label, "go_to_convenience_shelf");
  assert.equal(completed?.statusLabel, "탐색 완료");
  assert.equal(completed?.isAvailable, true);
});

test("direct collection choices do not receive the physical-space completion label", () => {
  const state = createInitialGameState();
  state.stockState[
    getStockStateKey("convenience", "convenience_shelf", "cannedFood")
  ] = 0;
  const collectShelf = storyChoice("collect_canned_food_from_shelf", [
    {
      type: "collect_stock_item_all",
      locationId: "convenience",
      nodeId: "convenience_shelf",
      itemId: "cannedFood",
    },
  ]);

  assert.equal(
    buildActionCatalogFromStoryChoices([collectShelf], state)[0]?.statusLabel,
    undefined,
  );
});
