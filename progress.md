Original prompt: 편의점 폐허에 진열대 말고 다른 곳도 추가해보자. 계산대를 추가하고 돈을 파밍할 수 있게 하자

- Goal: add a second convenience-store stock node for the cash register and let the player collect money from it through the same scene/choice flow.
- Plan: extend stock-node data to support money, wire new money stock conditions/effects, add convenience register scenes/choices, then verify with runtime probes.
- Added money-aware stock-node support:
  `StockNodeDefinition` now has `money`, and new condition/effect variants support `stock_money_gte`, `stock_money_lt`, and `collect_stock_money`.
- Updated runtime helpers and save normalization so money stock is persisted in `stockState` just like item stock.
- Added `convenience_register` to the convenience store with `money: 1800`.
- Reworked `survey_convenience` so it discovers both the shelf and the register, and made it recover gracefully for existing saves that had already found the shelf but not the register.
- Added convenience choices and scenes for:
  `go_to_convenience_register`
  `collect_cash_from_register`
  `leave_convenience_register`
  plus `convenience_register_full`, `convenience_register_low`, and `convenience_register_empty`.
- Verified with a runtime probe:
  convenience intro -> `survey_convenience`
  after survey -> `go_to_convenience_shelf`, `go_to_convenience_register`
  register collects increased money `6500 -> 7100 -> 7700 -> 8300`
  after the third collection the scene became `convenience_register_empty` and only `leave_convenience_register` remained.
- `npm run typecheck`, `npm run build`, and `npm run content:validate` all passed.
- Playwright-based UI verification was not run because `node_modules/playwright` is not present in this workspace.
- Refactored region authoring into `src/game/data/regions/`:
  `shelter/`, `convenience/`, and `kitchen/` now each own their `location.ts`, `choices.ts`, `scenes.ts`, and `events.ts`.
- Top-level `src/game/data/locations.ts`, `choices.ts`, `scenes.ts`, and `events.ts` are now aggregation-only entrypoints so the engine import surface stays stable.
- Updated `OBJECT_MODEL.md` to reflect the new region-module structure and to point edits at `src/game/data/regions/<지역>/...`.
- Removed the kitchen action labeled `배식 줄의 분위기를 읽는다` from `src/game/data/regions/kitchen/location.ts` so the soup kitchen no longer surfaces that ambient-read choice.
- Re-ran `npm run typecheck`, `npm run build`, and `npm run content:validate` after the kitchen choice removal; all passed.
- Restarted the local server after rebuilding so the currently running game reflects the updated kitchen action list immediately.
- Implemented a first-pass crafting loop centered on the shelter:
  added material items `woodPlank`, `scrapMetal`, `clothScrap`, added salvage stock nodes to convenience and kitchen, and turned shelter into a craft hub with wall patch / brazier / rain bucket upgrades.
- `sleep_at_shelter` now grants base recovery and gets an extra recovery bonus when `shelter_wall_patch` is built.
- `cook_at_shelter` is now a real action after `shelter_brazier` is built; it consumes `rawRice`, `vegetables`, and `woodPlank` to create `hotMeal`, and shows a failure note/log when ingredients are missing.
- `collect_rainwater_at_shelter` becomes available after `shelter_rain_bucket` is built, grants one `waterBottle`, and resets on day transition.
- Inventory UI no longer renders `사용` buttons for non-consumables, so materials stay visible without looking edible/usable.
- Validation and runtime checks passed:
  `npm run typecheck`
  `npm run build`
  `npm run content:validate`
  direct runtime probe through `.server-dist` confirmed salvage -> crafting -> rain bucket reset -> cooking -> improved sleep flow.
- API smoke test against the restarted local server passed:
  after convenience survey, available actions included `go_to_convenience_shelf`, `go_to_convenience_register`, and `go_to_convenience_supply_pile`.
- Playwright-based UI verification is still blocked because `node_modules/playwright` is not present in this workspace.
- Follow-up bug fix:
  material collection was working in state, but the UI stayed on the generic location scene because `convenience_scene_discovered` did not exclude `convenience_supply_pile` focus and kitchen intro scenes stayed valid after salvage discovery.
- Fixed scene gating so the player now actually enters the salvage scenes:
  `go_to_convenience_supply_pile` now resolves to `convenience_supply_pile_*` scenes,
  `search_kitchen_backroom` now transitions out of kitchen intro/repeat into `kitchen_salvage_discovered`,
  and `go_to_kitchen_scrap_heap` opens the heap scene with harvest choices.
- Runtime verification after the fix confirmed:
  convenience survey -> `go_to_convenience_supply_pile`
  supply pile focus -> `collect_wood_from_supply_pile`, `collect_cloth_from_supply_pile`, `collect_metal_from_supply_pile`
  after collecting wood -> inventory contained `woodPlank=1`
  kitchen search -> `go_to_kitchen_scrap_heap`
  heap focus -> `collect_scrap_from_kitchen_heap`, `collect_cloth_from_kitchen_heap`
- Template cache recovery hardening:
  `.runtime/templates.json` became corrupted with extra trailing JSON fragments, which caused `POST /api/games` to fail with `Unexpected non-whitespace character after JSON`.
- Added recovery in `FileGameRepository` so template writes are now atomic (`templates.json.tmp` -> rename/copy fallback), and corrupted `templates.json` files are backed up to `templates.json.corrupt-<timestamp>.json` before resetting to `emptyTemplateStore`.
- Verified the recovery path:
  the broken `.runtime/templates.json` was backed up,
  a clean cache file was regenerated,
  and `POST /api/games` succeeded again immediately after restart.
- Convenience salvage collection tweak:
  the convenience supply pile no longer requires repeated clicks per material type for wood/cloth.
- Added a new `collect_stock_item_all` effect so authored content can mean “take all remaining of this item from this node” without hardcoding inflated amounts.
- Updated `collect_wood_from_supply_pile` and `collect_cloth_from_supply_pile` to use the new effect.
- Runtime verification confirmed:
  one click on wood yielded `woodPlank: 3`,
  one click on cloth yielded `clothScrap: 2`,
  and the supply-pile scene advanced to the next remaining-material state correctly.
- Convenience register collection tweak:
  the cash register no longer requires three clicks to empty.
- Added `collect_stock_money_all` so authored content can mean “take all remaining money from this node” without tying the action to a fixed amount.
- Updated `collect_cash_from_register` to use the new effect.
- Runtime verification confirmed:
  `convenience_register_full` -> one click on `collect_cash_from_register` ->
  money `6500 -> 8300` ->
  scene changed directly to `convenience_register_empty`.
- Detail-focus flow cleanup:
  while focused on a stock node (for example `kitchen_scrap_heap`), the engine now treats that as a detail sublocation and suppresses top-level location interactions.
- Updated `resolveStoryFrame()` so `activeStockNodeId` behaves like opening a box/container:
  only the focused node's scene choices are shown until the player backs out.
- Runtime verification confirmed:
  at `kitchen_scrap_heap_full`, the available choices are only
  `collect_scrap_from_kitchen_heap`, `collect_cloth_from_kitchen_heap`, and `leave_kitchen_scrap_heap`;
  `buy_meal_at_kitchen` no longer appears while inside the heap detail view.
- Unified stock-node item pickup behavior:
  authored stock-item collection choices now use `src/game/data/stock-node-choice-helpers.ts` so one rule decides whether an item is taken one-by-one or all at once.
- Exception rule is now explicit in one place:
  `cannedFood` stays per-pickup, while salvage/material items default to `collect_stock_item_all`.
- Updated convenience and kitchen stock-node choices to go through the helper instead of manually mixing `collect_stock_item` and `collect_stock_item_all`.
- Runtime verification confirmed:
  one click on `collect_canned_food_from_shelf` yields `cannedFood: 1` with shelf stock `3 -> 2`,
  one click on `collect_scrap_from_kitchen_heap` yields `scrapMetal: 2` with heap stock `2 -> 0`,
  one click on `collect_cloth_from_kitchen_heap` yields `clothScrap: 2` with heap stock `2 -> 0`,
  and one click on `collect_metal_from_supply_pile` empties the remaining convenience scrap metal in one action.
- Validation rerun passed after the helper refactor:
  `npm run typecheck`
  `npm run content:validate`
  `npm run build`
- Follow-up rule change:
  the temporary `cannedFood` exception was removed, so stock-node item pickup is now fully uniform.
- `collectStockItemEffect()` now always resolves to `collect_stock_item_all`, which means shelf food, salvage piles, and future stock-node items all empty their remaining stack in one action.
- Runtime verification confirmed:
  one click on `collect_canned_food_from_shelf` now yields `cannedFood: 3` with shelf stock `3 -> 0`,
  and `collect_scrap_from_kitchen_heap` still yields `scrapMetal: 2` with heap stock `2 -> 0`.
- Convenience narrative pass:
  rewrote `src/game/data/regions/convenience/choices.ts` and `src/game/data/regions/convenience/scenes.ts` so the text now matches the take-all behavior.
- The shelf scenes now explicitly tell the player how many cans are in front of them:
  `convenience_shelf_three` says there are 3 cans,
  `convenience_shelf_two` says 2 remain,
  `convenience_shelf_one` says the last single can remains,
  and the empty scene reflects that everything in view was already taken.
- The canned-food choice copy now also matches the mechanic:
  label -> `남은 통조림을 전부 챙긴다`
  outcome hint/log -> explicitly say the remaining cans are swept up in one action.
- Runtime verification confirmed the actual story frame content:
  shelf focus resolved to `convenience_shelf_three`,
  paragraphs mentioned `통조림 세 개`,
  the choice label was `남은 통조림을 전부 챙긴다`,
  and after taking it the scene changed to `convenience_shelf_empty`.
- Kitchen salvage flow simplification:
  removed the extra discovery step so the soup kitchen now exposes the scrap heap directly from the top-level location choices.
- Rewrote `src/game/data/regions/kitchen/location.ts`, `choices.ts`, and `scenes.ts` around the simpler flow:
  top-level kitchen actions now include `go_to_kitchen_scrap_heap`,
  the old `search_kitchen_backroom` action and `kitchen_salvage_found` gate are gone,
  and the temporary `kitchen_salvage_discovered` scene was removed.
- Runtime verification confirmed:
  at kitchen top level, available choices are now `buy_meal_at_kitchen` and `go_to_kitchen_scrap_heap`,
  and selecting the latter transitions immediately to `kitchen_scrap_heap_full` with only
  `collect_scrap_from_kitchen_heap`, `collect_cloth_from_kitchen_heap`, and `leave_kitchen_scrap_heap`.
- Kitchen return-label clarification:
  after emptying the scrap heap, the exit choice was still present in the data, but the wording was too container-focused.
- Updated `leave_kitchen_scrap_heap` so the player now sees an explicit top-level return:
  label -> `급식소로 돌아간다`
  outcome hint -> says it returns to the soup kitchen main space
  empty-heap scene text also now says the player can go straight back to the main area.
- Runtime verification confirmed:
  after collecting both kitchen heap resources, the empty scene still resolves with one action and that action now surfaces as
  `leave_kitchen_scrap_heap` -> `급식소로 돌아간다`.

- Shelter crafting flow refactor:
  the shelter now always exposes a top-level `제작하기` action, and crafting no longer depends on hidden location actions appearing only after materials are collected.
- Added scene-choice presentation support:
  `ChoiceDefinition` now supports `presentationMode`, `failureEffects`, and `failureNote`,
  `resolveSceneChoices()` now allows authored choices to stay visible even when conditions are not met,
  and `performAction()` now routes story choices through the same always-visible failure-aware execution flow.
- Rebuilt the shelter content around a dedicated crafting menu:
  `open_shelter_crafting` opens `shelter_crafting_menu`,
  the menu lists wall patch / brazier / rain bucket / cooking / leave actions,
  and each recipe now explains required materials plus what benefit it gives after completion.
- Recipe behavior is now authored instead of implied:
  missing materials keep the player in the crafting menu and show a recipe-specific failure note/log,
  successful crafting consumes materials, sets the shelter upgrade flag, and returns to the same crafting menu so multiple crafts can be chained.
- Runtime verification confirmed:
  shelter top level now includes `open_shelter_crafting`,
  entering it resolves to `shelter_crafting_menu`,
  each recipe surfaces its material requirements in `outcomeHint`,
  failed crafting writes the expected failure note without closing the menu,
  and successful wall-patch crafting consumed `woodPlank 1 + clothScrap 2` and set `shelter_wall_patch=true`.

- Crafting menu affordance pass:
  available actions now carry `isAvailable` from the server snapshot so the frontend can distinguish "visible but not currently executable" options from actually craftable ones.
- `buildActionCatalogFromStoryChoices()` now preserves per-choice availability,
  and scene/location story choice builders compute that from the current state instead of forcing the frontend to infer it from text.
- Shelter crafting UI polish:
  added a small status pill inside each recipe button and styled recipes so craftable ones render green while blocked recipes render in a more faded muted tone.
- Frontend refresh correctness:
  `availableActionsSignature()` now includes availability state, so a recipe turning from blocked to craftable immediately re-renders during action/background sync.
- Follow-up UI trim:
  removed the explicit `제작 가능` / `재료 부족` pill text from the shelter crafting menu and kept only the color treatment so the menu reads cleaner while still signaling availability.
- Hotfix:
  a PowerShell rewrite accidentally re-saved `app-api.js` with broken string encoding, which produced a browser-side syntax error and stopped the whole client from booting.
- Recovered `app-api.js` from the last good version, re-applied the intended "color only" crafting cue change, and verified the page boots again in headless Edge with the prologue scene rendered.
