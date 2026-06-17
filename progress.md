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
- Added compatibility for stale clients that still POST `{ action: {...} }` to `/api/games/:gameId/actions`; the server now unwraps both old and current action payload shapes.
- Added global `Cache-Control: no-store` headers in `src/server.ts` so browsers stop hanging onto stale `index.html`, `app-api.js`, and API snapshots during active development.
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

- Bug fix: the bottom dock showed the Move tab as active on fresh load/new game because `index.html` hardcoded `class="dock-button active"` on the Move button.
- Removed the hardcoded active class and reset `client.isPanelOpen = false` in `createNewGame()` so starting a new game closes any open utility panel instead of leaving the Map/Move tab visually pressed.
- Verified locally in the in-app browser after reload and through Menu -> New Game: all dock buttons had `active=false`, `aria-expanded=false`, and `.panel-shell` stayed closed.
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
- Structure stabilization pass:
  split the LLM world planner into draft generation (`gemini-world-planner.ts`, `template-world-planner.ts`), fallback drafts, validation/guardrails, and compiler orchestration.
- The official dynamic narrative path is now:
  `NarrativeAnchorDraft / NarrativeSceneDraft -> narrative-compiler -> validated DynamicWorldRegistry patch`.
- Removed legacy planner outputs from the public `WorldPlanner` interface:
  no more `generateRegionPackage()` / `generateStoryBeat()` calls from `GameService`.
- Removed legacy `GameAction` request variants:
  only `travel`, `use_item`, `content_action`, and `content_choice` remain in `GameActionSchema`; stale `{ action: ... }` API wrapper compatibility remains in `src/server.ts`.
- Bumped server/client save version to v12 and moved the active client storage key to `ruined-seoul-stage1-game-id-v12`, with v11 treated as legacy client storage.
- Rewrote `OBJECT_MODEL.md` around the current real structure:
  narrative generation flow, static content flow, state mutation flow, and client render flow.
- LLM trace now separates `request`, `raw_draft`, `draft_validation`, `compiler_summary`, `compiled_result`, `fallback`, and `error`, including explicit fallback/error reasons.
- Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  API smoke: new game -> prologue -> quest accept -> convenience -> frontier anchor generation -> continuation scene generation.
  Regression smoke: shelter crafting button remains visible, convenience canned food collects all at once, register cash collects all at once.
- Gemini live generation was not observed in smoke because the test run went through the safe template fallback path; the trace clearly showed request/error/fallback/compiler stages.
- Cleaned `dynamic-location-naming.ts` so duplicate generated location qualifiers use readable Korean labels instead of corrupted text.
- Re-ran final verification after the naming cleanup:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  API smoke for frontier anchor + continuation passed again.
- Narrative director pass:
  LLM drafts now support richer director fields: `prose`, `tone`, `tension`, `dramaticQuestion`, `worldFacts`, `unresolvedQuestions`, `directorNotes`, and choice-level `storyPromise` / `risk`.
- The compiler now uses `prose` as the primary scene text and carries director memory through `NarrativeAnchorMemory`, so later continuation prompts can inherit facts, unresolved questions, tone, and tension.
- Gemini prompts were rewritten to treat the model as a TRPG game master/story director rather than a location-list generator.
- Template fallback scenes were expanded into longer, more novel-like prose so generated play does not collapse into very short placeholder text when Gemini fails.
- Verification after the narrative director pass:
  `npm.cmd run typecheck`
  `npm.cmd run build`
  `npm.cmd run content:validate`
  API smoke confirmed frontier anchor generation, continuation generation, director memory persistence, and continuation prose length over 300 characters.
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
- Detail-scene focus fix:
  `resolveSceneDefinition()` was reusing generic location scenes even after `activeStockNodeId` changed, so entering the kitchen scrap heap stayed on `kitchen_repeat_intro` and produced no harvest/return choices.
- Added focus-aware scene matching in `content-engine.ts` so when a stock-node detail view is active, only scenes with the matching `active_stock_node` condition can remain selected or be picked as candidates.
- Prologue quest affordance pass:
  rewrote `accept_first_canned_food_quest` so the second prologue choice now explicitly reads like accepting a quest, including a `퀘스트:` prefix that reuses the existing quest-button visual treatment in the client.
- Shelter action label normalization:
  updated the shelter hub and crafting-menu choice labels to a unified menu tone (`~하기`) so the temporary shelter reads like one consistent interaction list instead of mixing sentence-style and menu-style wording.
- Implemented the first dynamic-world expansion spine:
  `GameState` now persists `dynamicContent`, `worldPlan`, and `frontierState`, and new schemas live in `src/game/schemas/dynamic-world.ts`.
- Added `src/game/runtime-registry.ts` so runtime logic now merges seed registry + per-save dynamic registry and exposes frontier-expanded links from save state.
- Generalized static registry validation:
  `src/game/data/registry.ts` now exports `validateRegistry(registry)` so generated packages can be checked with the same structural rules as authored seed content.
- Added `src/game/world-planner.ts`:
  template fallback world planner + optional remote planner,
  generated region package schema/guardrails,
  deterministic region themes (`subway_gate`, `apartment_office`, `street_pharmacy`),
  and tomorrow-evolution planning.
- Rebuilt `src/game/rules.ts` around runtime registry lookups instead of hardcoded `baseLocations/baseItems/worldRegistry`.
  This includes dynamic quest syncing/rewards, dynamic stock-node resolution, dynamic travel validation, dynamic item usage, and applying `worldPlan.tomorrow` evolutions on day transition.
- Rebuilt `src/game/service.ts` around runtime registry + frontier expansion flow.
  `content_action` with `frontier` tag is now intercepted by the service:
  planner -> validate -> merge `dynamicContent` -> update `frontierState`/`worldPlan` -> move player -> optional entry event -> snapshot rebuild.
- Seed boundary actions added:
  `push_beyond_convenience_ruins`
  `push_beyond_kitchen_lane`
  so authored start regions remain fixed while frontier growth begins at explicit exits.
- Repository normalization now preserves generated ids instead of pruning them:
  dynamic locations/items/quests/scenes/events/stock state survive save/load,
  and item-card normalization allows dynamic inventory items.
- Content generator now reads from runtime registry, so generated locations / people / items produce cards through the existing pipeline without a parallel system.
- Runtime verification passed with direct `GameService` probes:
  1. prologue -> convenience frontier -> generated region package
  2. generated entry event surfaced a quest acceptance choice
  3. generated region actions (`inspect`, `talk`, `frontier`, `deliver`) rendered
  4. generated stock node could be entered and looted
  5. save/load preserved `dynamicContent.locations`
  6. day transition applied generated evolution flags
  7. generated frontier chained into a second dynamic region from the first generated region
- Validation / build checks passed after the dynamic-world implementation:
  `npm run typecheck`
  `npm run content:validate`
  `npm run build`
- Browser/server smoke check passed:
  restarted local server on port 3000,
  `/api/health` returned ok,
  and headless Edge DOM dump showed the game booting and rendering the prologue scene without client-side boot failure.
- Investigated the new `Failed to fetch` boot error after switching Gemini models.
  Root cause: startup card generation still hard-failed when Gemini fetch itself failed,
  so `POST /api/games` returned 500 before the client could open a session.
- Updated `src/game/content-generator.ts` so both Gemini and generic remote generators
  now fall back to the existing template generator on any per-card request failure.
  This keeps local/dev gameplay bootable even when the external model is unreachable.
- Updated Gemini defaults/documentation to `gemini-3.1-flash-lite-preview`
  in `src/game/gemini-client.ts`, `.env.example`, and `README.md`,
  and rebuilt `.server-dist` so the new default is actually used at runtime.
- Verification:
  `npm run typecheck`
  `npm run build`
  `npm run content:validate`
  all passed, and server logs now show `GET /api/games/:id/state` returning 200
  after the fallback change instead of the earlier Gemini-driven 500 crash.

- Added a dev-only LLM trace pipeline so frontier-generation requests and responses can be inspected from the live game UI.
- `StateSnapshot` now carries `devLlmTrace`, backed by the new in-memory trace helper in `src/game/dev-llm-trace.ts`.
- `src/game/gemini-client.ts` now records planner/card request payloads, raw Gemini responses, and explicit error/fallback messages without double-logging the same HTTP failure.
- Simplified live gameplay LLM responsibilities:
  `GameService` now uses the template generator for runtime location/person/item/event cards,
  so Gemini is no longer spammed for secondary card-polish requests after a frontier action.
  The planner is now the single LLM path that matters for expanding the world.
- Added a dev-only panel below the game in `index.html`, `styles.css`, and `app-api.js`
  that renders recent LLM traces with status, target, request body, raw response, and fallback/error notes.
- Hardened dynamic planner ingestion in `src/game/world-planner.ts`:
  added prompt guidance for Korean player-facing text,
  canonicalized common Gemini compact forms (`interactionChoices` as ids, `stockNodes` as ids with a top-level `registry.stockNodes` map),
  and merged partial/quirky Gemini payloads onto the authored fallback package before validation.
- This changed the observed frontier behavior:
  before the fix, frontier generation often ended as `planner:template` after `initial -> validation -> repair -> fallback`;
  after the fix, the same convenience frontier probe completed as `planner:llm` with a single successful `generatedRegionPackage:1:initial` trace entry.
- Verification:
  `node --check app-api.js`
  `npm run typecheck`
  `npm run build`
  `npm run content:validate`
  all passed.
- Runtime verification against the restarted local server:
  `POST /api/games` succeeded,
  prologue -> convenience -> `push_beyond_convenience_ruins` created `dyn_location_1_subway_gate`,
  the resulting location carried `planner:llm`,
  and the state snapshot included one successful LLM trace with non-empty request/response bodies.

- 2026-03-25 continuation-generation update:
  split dynamic generation into frontier region packages plus same-location narrative beats.
- Added `narrativeState` to saves with beat history and pregenerated cache, and bumped save/client version to `10`.
- Added `GeneratedStoryBeat`, `NarrativeContinuationRequest`, and pregenerated cache schemas so the planner can build the next scene inside the current dynamic location without adding a new map node.
- Dynamic frontier intro actions like inspect/talk now carry the `continuation` tag; `GameService` intercepts those before normal rules execution and asks the planner for a same-location beat.
- Generated beat scenes set `suppressLocationInteractions` so detail scenes behave like micro-locations inside the same map location.
- Implemented immediate post-beat pre-generation for the next continuation trigger, stored in `state.narrativeState.pregenerated`, and verified cache hits by checking trace count stays flat when the cached continuation is used.
- Strengthened `mergeDynamicWorldRegistry()` so repeated same-location patches merge location arrays instead of overwriting the whole dynamic location object.
- Fixed a new save corruption race caused by background pre-generation: `saveGame()` now writes game files atomically through unique temp files before rename/copy.
- Runtime probe verified:
  `convenience -> push_beyond_convenience_ruins -> dyn intro -> accept quest -> inspect`
  keeps the player in the same `dyn_location_*`,
  swaps only the scene,
  and exposes continuation choices like `continue` / `return` instead of creating another map tile.
- Dev trace now distinguishes planner calls as `region:*` and `beat:*`.
- Playwright UI automation is still blocked in this workspace because `node_modules/playwright` is not installed.
- 10일 구조 대기 생존 MVP 전환 작업 진행:
  `advance_time` 효과와 행동 시간 진행을 추가했고, 10일차 구조 판정은 `rescue_signal_ready`를 기준으로 처리하도록 만들었다.
- 새 무전기 부품 아이템을 추가했다:
  `radioBattery`, `radioAntenna`, `radioTransmitter`.
- 임시 거처 제작 메뉴에 `assemble_rescue_radio`를 추가해 세 부품 + 고철 2 + 천 조각 1로 구조 신호를 준비할 수 있게 했다.
- 병원, 지하철역, 검문소 region module을 추가하고 정적 registry에 연결했다.
- 사용자의 자유도 피드백을 반영해 병원/지하철역/검문소는 날짜나 플래그로 막지 않고, 안내 선택지와 일차별 로그로만 흐름을 잡도록 수정했다.
- 하단 목표바 시안은 사용자가 원하지 않아 제거했다. 구조 목표 안내는 퀘스트, 로그, 지역 단서, 제작 메뉴 문구 중심으로 유지한다.
- README, `.env.example`, `OBJECT_MODEL.md`, `WORLD_DESIGN.md`를 업데이트해 LLM 월드 플래너가 기본이 아니라 명시적 opt-in임을 기록했다.
- 검증 결과:
  `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build` 통과.
  API 스모크에서 병원 배터리, 지하철역 안테나, 검문소 송신기를 모아 임시 거처에서 구조 신호 조립까지 성공했다.
  10일차까지 넘겼을 때 `stageClear=true`와 구조 성공 `systemNote`가 유지되는 것을 확인했다.
  브라우저 새로고침 확인 결과 목표바는 없고, 이동 지도에 임시 거처/편의점 폐허/급식소/검문소/지하철역/작은 병원이 모두 표시된다.

- 2026-06-17 movement-discovery update:
  initial map knowledge now starts with shelter, convenience ruins, and kitchen only.
  Hospital, subway, and checkpoint no longer auto-appear from day hints or shelter links.
  Each later tile is learned through authored exploration actions from adjacent regions:
  convenience -> hospital, kitchen -> subway, subway -> checkpoint.
  Verified by API smoke probes plus `npm.cmd run content:validate` and `npm.cmd run build`.
  Follow-up verification also passed `npm.cmd run typecheck`, browser reload confirmed only the three starting locations are visible,
  and corrected API action-shape probes confirmed the discovery chain.

- 2026-06-17 hex map visual polish:
  added SVG gradients and softer SVG-native drop shadows for map hex tiles.
  Tile fills now follow the actual polygon shape instead of reading like a flat clipped rectangle.
  Verified with `node --check app-api.js`, `npm.cmd run build`, and an in-app browser screenshot.

- 2026-06-17 location entry gameplay cleanup:
  removed the extra `survey_convenience` step and the explicit route-check actions for hospital/subway/checkpoint discovery.
  Convenience now shows concrete subarea choices immediately on arrival: shelf, register, and supply pile.
  Adjacent-region discovery now happens when the previous region is reached:
  convenience reveals hospital, kitchen reveals subway, and subway reveals checkpoint.
  Arrival prose now carries those route clues directly.
  Also renamed target-specific search buttons to `...으로 간다` where appropriate.
  Verified with `npm.cmd run content:validate`, `npm.cmd run typecheck`, `npm.cmd run build`,
  API smoke checks, and a browser reload showing the updated convenience scene and choices.

- 2026-06-17 system note discovery feedback:
  system notes now compare previous/next known or visited locations and emit `신규 지역: <location name>` whenever a new region becomes known.
  API smoke checks verified:
  convenience -> `신규 지역: 작은 병원`,
  kitchen -> `신규 지역: 지하철역`,
  subway -> `신규 지역: 검문소`.
  `npm.cmd run typecheck`, `npm.cmd run content:validate`, and `npm.cmd run build` passed.

- 2026-06-17 system note detail reduction:
  removed stock-node level `발견: ...`, `확인: ...`, and stock-focus fallback notes from system feedback.
  System notes still report major changes like movement, newly known regions, stat/resource/item deltas, and quest state.
  API smoke check verified entering the convenience shelf no longer emits detail-level notes,
  while collecting canned food still reports item/fullness/quest changes.

- 2026-06-17 movement bottom-sheet behavior:
  `submitAction()` now compares previous and next location ids and closes the utility bottom sheet whenever an action actually changes location.
  Verified in the in-app browser by opening the Move panel at convenience, traveling to shelter, and confirming `.panel-shell.is-open=false`
  with all dock buttons inactive after movement.

- 2026-06-17 scene typing animation fix:
  `shouldAnimateScene()` no longer requires `introFlag` before animating.
  It now compares the previous and next authored scene/event surface, so detail scenes like shelf/register/supply pile also type out when entered.
  Verified with `node --check app-api.js`, `npm.cmd run build`, and in-app browser interaction:
  entering the register scene produced `.typing=true` immediately after click.

- 2026-06-17 kitchen prose formatting:
  split the kitchen first-intro dialogue `"다음 사람, 빨리."` into its own paragraph,
  with the following narration moved to a separate paragraph for a more novel-like reading rhythm.
  Verified with `npm.cmd run content:validate` and `npm.cmd run build`.

- 2026-06-17 inventory panel compact grid:
  item cards in the bottom-sheet inventory panel now use an `inventory-grid` class and render two cards per row on mobile.
  Verified with `npm.cmd run build` and in-app browser DOM checks:
  the inventory grid computed as two columns, the first two cards shared a row, there was no horizontal overflow, and console error count was 0.
  The web-game Playwright client remains unavailable because this workspace still has no local `node_modules/playwright`.

- 2026-06-17 status/skills bottom-sheet split:
  replaced the bottom dock `스킬` button with `상태`.
  The new status panel includes a top two-way switch: `상태` on the left and `스킬` on the right.
  `상태` shows hp/mind/fullness detail cards plus time, location, and money; `스킬` reuses the current skill-card list.
  Verified with `npm.cmd run build`, `node --check app-api.js`, and a localhost 200 response.
  In-app browser automation could not complete visual verification because the Browser webview timed out while attaching, and local `node_modules/playwright` is still absent.

- 2026-06-17 status/skills switch polish:
  removed the visible outer switch container styling and tablist semantics from the `상태/스킬` selector.
  The selector now renders as two standalone buttons with their own borders and active state.
  Verified with `node --check app-api.js`, `npm.cmd run build`, and the served `styles.css` response.

- 2026-06-17 route-aligned map positions:
  updated late-route map positions so the authored path reads spatially as kitchen -> subway -> checkpoint.
  `subway` moved to `{ q: 2, r: 0 }`, directly down-right from kitchen `{ q: 1, r: 0 }`.
  `checkpoint` moved to `{ q: 3, r: 0 }`, directly down-right from subway.
  Updated both the authored location definitions and the frontend fallback coordinates.
  Verified with `npm.cmd run content:validate`, `npm.cmd run build`, and `node --check app-api.js`.

- 2026-06-17 bottom-sheet stacking correction:
  adjusted the bottom sheet/menu ordering to work like PPT send-back/bring-front layering.
  The bottom sheet remains positioned above the dock when open, but its closed transform starts below the dock.
  `.dock-buttons` is now explicitly positioned with `z-index: 20`, while `.panel-shell` remains at `z-index: 19`, so the menu bar is the front layer and masks the sheet as it animates behind it.
  The dock background is opaque white to avoid the sheet showing through while passing behind the menu.
  Verified with `npm.cmd run build`, served CSS inspection, and selector checks.

- 2026-06-17 choice helper text restore:
  choice buttons now render `outcomeHint` as helper text under the main button label.
  Kitchen meal purchase copy now keeps the button label short and puts the cost/reward below it:
  `4,500원을 내고 따뜻한 식사 1개를 얻는다.`
  Verified with `node --check app-api.js`, `npm.cmd run content:validate`, `npm.cmd run build`, API smoke output,
  and an in-app browser reload at the kitchen scene.

- 2026-06-17 selective choice helper visibility:
  added optional `showOutcomeHint` plumbing through action/choice schemas, story choices, action catalogs, and the browser renderer.
  `outcomeHint` data remains authored for every choice, but the UI only displays it when `showOutcomeHint` is true.
  Enabled the visible helper text only for the two kitchen meal purchase actions.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`,
  and an in-app browser check: kitchen meal purchase showed the cost/reward helper, while `폐자재 더미로 간다` kept its hidden helper span.

- 2026-06-17 material stock rebalance:
  increased early crafting material availability in the convenience ruins and soup kitchen salvage piles.
  Convenience supply pile now starts with `clothScrap: 4` and `scrapMetal: 3` while keeping `woodPlank: 3`.
  Kitchen scrap heap now starts with `scrapMetal: 4` and `clothScrap: 4`.
  Verified with `npm.cmd run content:validate`, `npm.cmd run build`, `npm.cmd run typecheck`,
  built JS inspection, and API smoke checks confirming new-game collection totals:
  convenience `scrapMetal=3`, `clothScrap=4`; kitchen `scrapMetal=4`, `clothScrap=4`.

- 2026-06-17 travel time rebalance:
  replaced the old large "phase" travel cost with a 15-minute game-time travel duration per route segment.
  Hunger now ticks once per in-game hour (`AUTO_FULLNESS_TICK_MS = GAME_HOUR_MS`) instead of once per day phase.
  General authored `advance_time` actions now use 15-minute units as well, so scavenging/crafting no longer consumes a whole day phase.
  Travel now calls `advanceTravelTime()` directly and no longer applies the late-night hp/mind penalty through `advanceByPhases()`.
  Clock formatting no longer rounds down to 10-minute labels, so 15-minute movement displays accurately.
  Verified with `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, built JS inspection, and API smoke:
  one move produced `worldElapsedMs=9375` and kept fullness at 7; four moves produced `worldElapsedMs=37500` and fullness 6.

- 2026-06-17 multi-hop travel:
  changed travel validation from direct-link-only to shortest known unlocked route resolution.
  A travel action now walks each route segment in order, marking intermediate locations visited and applying the existing `TRAVEL_DURATION_MS` movement cost once per segment.
  Map entries now include `routeDistance` and `routePath`; reachable non-adjacent locations are selectable and show a route-distance tag such as `2구간`.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`,
  and a rules smoke test confirming shelter-to-subway multi-hop travel lands at `subway`, consumes two travel-duration units (`worldElapsedMs=18750`), and keeps `phaseIndex=0` / fullness 7.

- 2026-06-17 hp-zero game-over rule:
  added a final survival-outcome evaluation at the end of `performAction()` so any action/effect that leaves hp at 0 immediately marks the save as game over.
  Existing game-over saves now reject further server-side actions with the stored game-over reason.
  Added a client game-over prompt that shows the game-over reason, reached day/time, total survived time, and asks whether to start a new game.
  Game-over renders now hide normal choice buttons and label the scene badge as `게임오버`.
  Pending verification: run syntax/type/build checks and a focused runtime/UI probe for hp reaching 0.
