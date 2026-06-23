Original prompt: 편의점 폐허에 진열대 말고 다른 곳도 추가해보자. 계산대를 추가하고 돈을 파밍할 수 있게 하자

- 2026-06-22 opening rescue-goal rewrite:
  rewrote the opening into `열흘의 신호`, centered on a radio broadcast that gives the player a clear 10-day survival deadline and a reason to complete the rescue signal.
  changed the first opening choice to `퀘스트: 구조 신호 준비를 시작한다`, which sets `rescue_goal_accepted` and activates the `prepare_rescue_signal` quest.
  updated the old cook prologue scene so the first food errand follows naturally from the rescue premise: the player has to survive today in order to send the signal later.
  added save normalization so old saves that already passed the opening keep the rescue goal accepted and do not lose the main quest.
  Verification passed:
  `npm.cmd run content:validate`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  local API smoke confirmed a new game starts with `prepare_rescue_signal` inactive, then the first opening action changes it to active with system note `퀘스트 시작: 구조 신호 준비`.

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
  Server snapshots now return no available actions while `state.isGameOver` is true.
  Refined the client survival-time formatter so game-over prompt clock labels are computed without mutating `client.snapshot`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  local API smoke confirmed reachable map entries return `travelMinutes: 15` for one-route moves.
  focused runtime probe confirmed hp `1 -> 0`, `isGameOver=true`, non-empty reason, and `availableActions=0`.
  fake-DOM client probe confirmed one confirm prompt with `게임오버`, reached day/time, total survived time, `게임오버` scene badge, and no rendered choice buttons.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 collapsible item/status helper text:
  hid inventory helper descriptions by default, including the money card, and made each inventory card toggle its description below the card when selected.
  kept item use buttons separate from the card toggle so using an item does not also open/close its description.
  moved status helper notes below the selected status row so status and inventory panels share the same reveal direction.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-18 inventory card independent expansion:
  set the inventory grid/items to start alignment so opening one card's helper text no longer stretches the other card in the same row.
  Verified with `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.

- 2026-06-18 inventory masonry columns:
  changed the inventory panel from row-based grid cards to two independent column stacks, so opening a left-column item only moves cards below it in the left column and leaves the right column in place.
  Verified with `node --check app-api.js`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.

- 2026-06-18 status warning chip colors:
  changed the energy status icon from food to a lightning bolt.
  Added automatic status trigger severity backgrounds for hp, mind, and energy: values 5 or below use orange, and values 3 or below use red.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-18 inventory bottom detail slot:
  removed inline inventory description expansion and changed item cards to selection-only chips.
  Added a reserved bottom description slot in the inventory sheet, roughly one item-chip tall, where the selected item's helper text appears.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-18 elapsed-time system note:
  system notes now include the actual game-time elapsed by the resolved action as a token such as `+ 15분` or `+ 1시간 10분`.
  The note is derived from the `worldElapsedMs` delta after executing authored `advance_time`, `advance_to_daybreak`, and travel timing rather than hardcoded per choice.
  Verified with `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, `node --check app-api.js`,
  a travel runtime probe showing `이동: 편의점 폐허 / + 15분 / 신규 지역: 작은 병원`,
  a shelf collection probe showing `+ 15분 / + 3 캔 음식 / 퀘스트 완료: 첫 식량 확보`,
  and a formatter probe showing `+ 1시간 10분`.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 night strain double-hp fix:
  investigated reports that hp sometimes dropped by 2 when mind was already 0.
  Root cause: late-night `advanceByPhases()` applied direct hp -1 and mind -1 together; with mind already 0, the new spillover rule converted the mind loss into another hp -1.
  Changed the late-night penalty so it still applies hp -1, and only applies mind -1 when mind is above 0. This prevents one night-strain event from double-dipping hp through spillover.
  Verification passed:
  repro before fix showed hp `3 -> 1` and `- 2 체력`;
  after fix the same case showed hp `3 -> 2` and `- 1 체력`;
  mind-positive night strain still showed hp `3 -> 2`, mind `2 -> 1`;
  direct energy spillover with mind 0 still showed hp `3 -> 2`.
  `npm.cmd run typecheck`, `npm.cmd run content:validate`, and `npm.cmd run build` passed.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 compact status sheet rows:
  changed the bottom-sheet status view from large stat cards into one-line rows: stat name, meter, and numeric value remain visible.
  Removed the qualitative `양호` / `주의` / `위험` labels and removed time/location cards from the status list.
  Tapping a stat row toggles a small note above that row with the stat description; switching to skills clears the open note.
  Shared the same status description definitions with the top status popover.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, `git diff --check`, and HTTP 200 on `localhost:3000`.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 full-screen game-over overlay:
  replaced the game-over browser confirm prompt with an in-game full-screen overlay.
  The overlay covers the whole viewport above the fixed header/dock, emphasizes a large `게임오버` title, shows the game-over reason and survival records, and provides a `새 게임` button.
  The overlay new-game flow bypasses the menu confirmation and clears the in-flight flag before rendering the fresh save so choices are not left disabled.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, `git diff --check`, and HTTP 200 on `localhost:3000`.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 persistent system note until scene transition:
  changed system notes to stay visible until the story scene/event surface changes instead of dismissing on a timer.
  If the server clears `systemNote` while the player remains on the same surface, the client keeps the currently displayed note.
  Scene/surface transitions still clear carried notes immediately, while genuinely new notes for the new surface can render normally.
  System notes now render in normal story flow directly above the first narrative line, using the body text area while centering the note chips within that area.
  Slimmed their chips with reduced vertical padding and line-height.
  On mobile, unified the image-to-note and note-to-body spacing to the same 12px rhythm so the art and narrative block feel evenly separated.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, `git diff --check`, and HTTP 200 on `localhost:3000`.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 minute-based advance_time effects:
  changed the `advance_time` effect schema from `phases` to explicit game-time `minutes`.
  Runtime handling now calls `advanceByMinutes()` and multiplies by `GAME_MINUTE_MS`; the old `ACTION_TIME_UNIT_MS` constant was removed.
  Converted existing authored content from `{ type: "advance_time", phases: 1 }` to `{ type: "advance_time", minutes: 15 }`.
  Client system-note rendering now treats elapsed-time tokens such as `+ 15분` and `+ 1시간 15분` as neutral/default chips instead of positive green chips.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, `git diff --check`, HTTP 200 on `localhost:3000`, and a focused runtime probe confirming `collect_canned_food_from_shelf` advances exactly 15 game minutes.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-17 mobile choice tap polish:
  disabled the default mobile tap highlight on app buttons and prevented choice text selection/callout.
  Added an explicit `.choice-button:active` state that keeps the normal choice background instead of flashing a blue pressed color.
  Also aligned the client clock formatter with the 15-minute travel model by removing the old 10-minute rounding in `app-api.js`.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`,
  and an in-app browser style check confirming choice buttons use `touch-action: manipulation` and `user-select: none`.

- 2026-06-17 mobile viewport density pass:
  made the mobile status header fixed and flush to the top edge, matching the bottom dock's full-width attached feel.
  Removed outer mobile padding around the main story stage and made the scene frame fill the space between the fixed header and dock.
  Changed the mobile story body into a fixed-height flex column: narrative text scrolls internally while the choices stay pinned to the bottom of the scene area.
  Reduced mobile choice button height/padding and added mobile auto-scroll so long narrative text clips from the top while the user can scroll upward to read earlier text.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification could not run because the workspace still lacks the `playwright` package.

- 2026-06-17 mobile scroll area revision:
  changed the mobile scroll model again so only the top status header and bottom dock remain fixed.
  The scene image and narrative now scroll together in `.app-shell`; the choice list is excluded from that flow and fixed directly above the bottom dock.
  Added a reserved mobile choice-zone height to the scroll container so narrative content does not disappear behind fixed choices.
  Updated the mobile auto-scroll helper to scroll `.app-shell` instead of the narrative-only text box.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-17 mobile fixed-choice refinement:
  refined the mobile layout so the scrollable area is exactly the region from below the fixed status header to above the fixed choice area.
  Kept choices fixed above the bottom dock, but removed the choice area's visible panel treatment: no top border, no shadow, no gradient background.
  Reduced mobile choice buttons from 56px minimum height to 38px with tighter padding and line-height.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-18 mobile white background unification:
  removed the mobile-only gray/empty-looking surfaces by forcing `body`, `.app-shell`, `.story-shell`, `.story-stage`, `.scene-copy`, and `.choice-list` to white.
  Disabled the mobile `body::before` grid overlay and removed mobile header/dock shadows so the viewport reads as one continuous white surface.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-18 mobile choice full-height display:
  removed the mobile choice list's fixed `max-height` and internal scrolling so every choice button is displayed.
  Added `syncMobileChoiceZoneHeight()` to measure the rendered fixed choice area and feed that height into `--mobile-choice-zone-height`, keeping the story scroll region above the choices.
  Re-syncs choice height after rendering choices and on resize/orientation changes.
  Verified with `node --check app-api.js`, `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, HTTP 200 on `localhost:3000`, and `git diff --check`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-18 narrative font update:
  added a local-font `@font-face` stack for KoPub Batang/KoPubWorld Batang Medium and applied it to `.scene-text`.
  Set scene narrative text and its inline headline to `font-weight: 500`; fallback remains Batang/Malgun Gothic if KoPub is not installed locally.
  Verified with `git diff --check`, `npm.cmd run build`, and HTTP 200 on `localhost:3000`.

- 2026-06-18 narrative font fallback quality fix:
  local inspection showed KoPub is not installed on this Windows machine, so the scene text was falling through to the old Windows `Batang` font.
  Added a cleaner `NarrativeBatang` local font stack that tries KoPub first, then `HCR Batang`, then Malgun Gothic before legacy Batang.
  Added `text-rendering: optimizeLegibility` and `-webkit-font-smoothing: antialiased` to `.scene-text`.
  Verified with `git diff --check`, `npm.cmd run build`, and HTTP 200 on `localhost:3000`.

- 2026-06-18 bundled KoPub font:
  copied the user-provided `KoPub Batang Medium.ttf` into `assets/fonts/KoPubBatangMedium.ttf`.
  Updated the `NarrativeBatang` `@font-face` to load `/assets/fonts/KoPubBatangMedium.ttf` before local font fallbacks, so deployed builds use the same narrative font.
  Verified the static font route returns `HTTP 200 font/ttf` with the expected 6,414,208 byte file, plus `npm.cmd run build` and `git diff --check`.

- 2026-06-18 KoPub Light smoothing pass:
  added the user-provided `KoPub Batang Light.ttf` as `assets/fonts/KoPubBatangLight.ttf`.
  Registered it as `NarrativeBatang` weight 300 and switched `.scene-text` body copy from weight 500 to 300, with a slight font-size bump from 1.01rem to 1.04rem to reduce visible stair-stepping.
  Kept `.scene-text .scene-headline` at weight 500 so headings continue to use the bundled Medium font.
  Verified `/assets/fonts/KoPubBatangLight.ttf` returns `HTTP 200 font/ttf`, `npm.cmd run build`, `git diff --check`, and `/styles.css` contains the Light font URL.

- 2026-06-18 transient system note clearing:
  fixed `applySystemNote()` so reward/status tokens are cleared when the next action produces no new system note.
  This prevents notes like `+ 1800원` from lingering after leaving the register or moving into another scene.
  Game-over and stage-clear notes still keep their existing protected behavior.
  Verified with `npm.cmd run typecheck`, `npm.cmd run content:validate`, `npm.cmd run build`, `git diff --check`, and a focused runtime probe confirming register cash collection shows a positive money note while leaving the register clears `systemNote`.

- 2026-06-18 survival stat spillover rule:
  added shared stat-change behavior so negative fullness at 0 spills into mind, and negative mind at 0 spills into hp.
  Content `change_stat` effects and internal rule adjustments now share this same helper.
  Auto fullness pressure no longer skips the tick at fullness 0; it attempts the fullness decrement and lets the spillover rule apply.
  Starvation level/status can still accumulate while fullness is 0, but the old extra starvation hp tick was removed so hp loss follows the requested fullness -> mind -> hp chain.
  Mind reaching 0 is no longer an immediate game-over condition; hp reaching 0 remains the game-over trigger.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  focused content-effect probe confirmed fullness 0 spills to mind, fullness+mind 0 spills to hp, and hp 0 triggers game over.
  focused auto-time probe confirmed auto fullness pressure at fullness 0 spills to mind, and at fullness+mind 0 spills to hp/game over.
  fake-DOM client probe confirmed one `게임오버` confirm prompt with reached day/time, total survived time, `게임오버` scene badge, and no rendered choice buttons.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 fullness-to-energy rename:
  renamed the survival resource from `fullness` to `energy` across runtime state, item effects, schemas, planner/card payloads, frontend DOM ids/classes, and docs.
  Player-facing labels now use `기력`; system-note stat deltas report `기력`.
  Renamed depletion bookkeeping from starvation wording to exhaustion wording (`autoEnergyElapsedMs`, `exhaustionElapsedMs`, `exhaustionLevel`, `exhaustionRelief`, `AUTO_ENERGY_TICK_MS`, `EXHAUSTION_TICK_MS`).
  Repository normalization still migrates legacy save keys into the new energy fields without leaving legacy terms in normal state output.
  Verified no `fullness` / `포만감` / `hunger` / `starvation` occurrences remain in active app/source/docs search results.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  runtime probes confirmed energy spillover and hp-zero game over.
  legacy save probe confirmed old resource keys migrate to `energy` / exhaustion fields.
  legacy item-effect probe confirmed old resource/easing keys migrate to `energy` / `exhaustionRelief`.
  fake-DOM client probe confirmed `기력 0 / 10` aria label and game-over confirm prompt.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 forest resource region:
  added a new `forest` region at map position `{ q: 0, r: 1 }`, visually below the temporary shelter.
  The forest is known from the start and links both ways with adjacent shelter, convenience ruins, and soup kitchen locations.
  Added repeatable forest actions:
  `chop_wood_at_forest` spends 30 game minutes and grants `woodPlank +3`;
  `search_forest_resources` spends 30 game minutes and rolls weighted outcomes: 30% nothing, 10% canned food, 20% wood plank, 20% scrap metal, 20% cloth scrap.
  Added a reusable `random_outcome` effect type for authored probabilistic rewards, keeping nested random outcomes limited to non-time effects so action time still comes from normal `advance_time` data.
  Added `assets/scenes/forest.svg` for the forest scene.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  runtime probe confirmed forest links/actions, shelter/convenience/kitchen -> forest travel, chopping note `+ 30분 / + 3 목재 판자`, and all five deterministic search outcomes.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 energy max 15:
  raised the energy stat maximum from 10 to 15 while keeping hp and mind capped at 10.
  Updated runtime stat clamping, save normalization, GameState/Player/Protagonist schemas, and frontend status bars/popovers/detail rows so energy displays as `/ 15`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  runtime probe confirmed energy `14 + 5 -> 15`, schema accepts energy 15 and rejects 16, while hp/mind still cap at 10.
  Localhost API smoke returned a new game successfully and the client code contains the energy `max: 15` UI definition.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 forest randomized result scenes:
  changed forest repeat actions so their body text varies by selecting from authored scene variants after the action resolves.
  Added scene-level `tags` and a `set_random_scene` effect for authored content. It selects from currently valid scenes that share the requested tag, so actions no longer list candidate scene ids directly.
  Reworked `chop_wood_at_forest` so it always spends 30 minutes and grants `woodPlank +3`, then randomly shows one of the scenes tagged `forest:result:chop`.
  Reworked `search_forest_resources` to keep the original outcome odds exactly intact: 30% nothing, 10% canned food, 20% wood plank, 20% scrap metal, 20% cloth scrap. Each outcome now chooses only its narrative scene variant by result tag.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  runtime probe confirmed chop scene variants with unchanged `+ 3 woodPlank`, deterministic search rolls for all five outcomes with result-specific scene variants, and no remaining candidate scene id list in the forest action file.
  `git diff --check` passed with only existing CRLF normalization warnings.
  Playwright web-game client remains unavailable because `node_modules/playwright` is not installed.

- 2026-06-18 item use time:
  added optional `useMinutes` to item cards and set `cannedFood.useMinutes = 10`.
  `use_item` now advances game time by the item's authored `useMinutes` value after applying the item effects.
  Inventory details show `사용 시간: 10분` for items that define a use duration, and cached item cards are merged with runtime item fields so old template cache entries still surface the new duration.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  runtime probe confirmed using canned food changes the clock from `06:00` to `06:10` and system note shows `+ 10분 / + 5 기력 / - 1 캔 음식`; using water still does not advance time because its duration is not authored yet.

- 2026-06-18 region authoring cleanup:
  added `defineRegion()` so region modules can omit empty `choices` and `events` arrays.
  removed empty event files from checkpoint, convenience, forest, hospital, kitchen, and subway, and removed forest's empty choices file.
  added shared `sceneChoice()` so scene-choice files no longer duplicate the same defaults for `conditions`, `hidden`, `presentationMode`, and `failureEffects`.
  added `src/game/data/regions/README.md` with the minimal region file layout, `defineRegion()`, `sceneChoice()`, and random-scene tag authoring examples.
  updated `OBJECT_MODEL.md` so the documented region structure matches the current optional `choices.ts` / `events.ts` model.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  `git diff --check` passed with only existing CRLF normalization warnings.

- 2026-06-18 stock node choice cleanup:
  expanded `stock-node-choice-helpers.ts` with active/inactive stock-node conditions, collect-item choice parts, and leave-stock-node choice parts.
  converted convenience, hospital, kitchen, subway, and checkpoint stock-node choices to reuse the shared helper shape while preserving each authored reward, cost, time, and log message.
  This keeps location files focused on "what happens here" instead of repeating boilerplate for stock-node availability and collection bookkeeping.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  `git diff --check` passed with only existing CRLF normalization warnings.
  runtime probes confirmed hospital pain relief, kitchen scrap pile, subway antenna, convenience shelf, and convenience supply pile actions still apply their expected inventory/time/system notes.

- 2026-06-18 location authoring helper cleanup:
  replaced the old `location-interaction-helpers.ts` with `location-helpers.ts`.
  Added `defineLocation()` so region `location.ts` files no longer repeat empty `residentIds`, `interactionChoices`, `eventIds`, and `stockNodes` defaults.
  Added `stockNode()` so resource containers can omit default `money: 0` and `items: []` fields.
  Converted shelter, convenience, kitchen, forest, hospital, subway, and checkpoint location definitions to the new helper style.
  Updated `OBJECT_MODEL.md` and `src/game/data/regions/README.md` to document `defineLocation()`, `interactionFor()`, and `stockNode()` as the current region-authoring path.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  `git diff --check` passed with only existing CRLF normalization warnings.
  runtime probe confirmed built `baseLocations` still expose expected interaction counts, event arrays, and stock-node money/item defaults.

- 2026-06-18 effect schema duplication cleanup:
  refactored `src/game/schemas/condition-effect.ts` so shared immediate effects are defined once in `InstantEffectSchemas`.
  `BaseEffectSchemas` now composes immediate effects plus explicit time effects, while `RandomOutcomeEffectSchemas` reuses only immediate effects.
  This keeps the existing design where an action owns time cost and a `random_outcome` only varies the result.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  runtime schema probe confirmed a normal `{ type: "advance_time" }` effect is valid, while nested `advance_time` inside `random_outcome` is rejected.

- 2026-06-18 item authoring helper cleanup:
  added `src/game/data/item-helpers.ts` with `defineItem()`.
  Item definitions now get default zero effects automatically, so materials, trade goods, tickets, and radio parts no longer repeat `hp/mind/energy/exhaustionRelief: 0`.
  Converted `src/game/data/items.ts` to the new helper style while preserving existing item ids, kinds, prices, tags, effects, and canned-food `useMinutes: 10`.
  Added `src/game/data/README.md` as a data-authoring entry point and linked it from `OBJECT_MODEL.md`.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  `git diff --check` passed with only existing CRLF normalization warnings.
  runtime item probe confirmed `cannedFood` keeps `energy: 5`, `exhaustionRelief: 2`, and `useMinutes: 10`, while `scrapMetal` and `radioBattery` receive zero-filled effects.

- 2026-06-18 time effect execution boundary cleanup:
  added `isTimeEffect()` in `state-utils.ts` and changed `rules.ts` definition execution to use it for `advance_time` / `advance_to_daybreak`.
  `applyEffect()` now throws if a time effect is passed directly, preventing silent no-op behavior when adding future rules.
  Updated `OBJECT_MODEL.md` to document that time effects belong to the rules layer, while immediate effects and `random_outcome` belong to `state-utils.applyEffect()`.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `node --check app-api.js`
  `git diff --check` passed with only existing CRLF normalization warnings.
  runtime probe confirmed direct `applyEffect({ type: "advance_time" })` throws, while normal travel plus forest chopping still advances time and grants `woodPlank +3`.

- 2026-06-22 old-cook canned-food quest flow:
  changed the first canned-food quest into the old cook's request instead of completing immediately at the convenience shelf.
  collecting shelf cans now starts/updates the quest, and completion requires returning to the soup kitchen with three canned foods.
  added a soup-kitchen delivery interaction where the old cook takes three cans, returns one can as the player's share, and rewards 3000 money.
  added a dedicated reward scene and a client-side quest-complete burst animation so completed quests feel more visible.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `node --check app-api.js`
  `npm.cmd run build`
  `git diff --check`
  runtime probe confirmed shelf collection leaves the quest active with 3 cans, then old-cook delivery completes the quest with 1 can, +3000 money, and the reward scene.

- 2026-06-22 scene authoring dev source:
  added `currentScene.devSource` to scene snapshots so local/dev play shows the source scene file and scene id for the currently rendered narrative.
  the browser now displays a small `DEV scene: <path> · <sceneId>` strip on `localhost`, `127.0.0.1`, `::1`, or with `?dev=1`; `?dev=0` hides it.
  clarified the old cook's quest-giving prose so she explicitly asks the player to bring three canned foods back to her at the soup kitchen.
  clarified the quest choice label, outcome hint, and log message with the same target.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  API smoke confirmed `prologue_old_woman_visit` reports `src/game/data/regions/shelter/scenes.ts` and the updated quest text.
  in-app browser confirmed the dev source strip and updated quest choice are visible on `http://127.0.0.1:3000/`.

- 2026-06-22 inventory energy hint:
  item detail hints now show energy gain as `+n 기력` for usable food/drink/medicine items whose runtime `effects.energy` is positive.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  in-app browser confirmed the water bottle detail shows `+1 기력` in the item panel.

- 2026-06-22 inventory stat effect line:
  item detail hints now show all visible stat effects from `effects.hp`, `effects.mind`, and `effects.energy` instead of only energy.
  Effects render as a separate bottom line below the item description; mind is blue, energy is yellow, and hp uses a red tone.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  in-app browser confirmed hot meal shows `+1 정신력 +4 기력` on one bottom effect line with the expected blue/yellow colors.

- 2026-06-22 hospital first-aid hint:
  made the hospital `receive_hospital_first_aid` action show its outcome hint in the choice UI.
  clarified the hint as `1,800원을 내고 응급 처치를 받는다. +2 체력, -1 정신력, +15분.`
  Verification passed:
  `npm.cmd run content:validate`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  in-app browser confirmed the hint appears under `응급 처치를 받는다` on `hospital_repeat_intro`.

- 2026-06-22 hospital first-aid mind cost removal:
  removed the `-1 mind` effect from hospital first aid.
  simplified the first-aid hint to `-1,800원 / +2 체력 / +15분`.
  Verification passed:
  `npm.cmd run content:validate`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  in-app browser confirmed the updated hint on `hospital_repeat_intro`.

- 2026-06-22 quest sheet requirements:
  added per-quest `requirements` to the state snapshot and populated `prepare_rescue_signal` with radio battery, radio antenna, radio transmitter, scrap metal x2, and cloth scrap x1 progress.
  updated the quest sheet so completed quests are collapsed by default and can be expanded/collapsed with a small button.
  rendered required item checks under the structure signal quest description with owned/needed counts and completion marks.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  HTTP 200 from `http://127.0.0.1:3000/`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-22 choice hint authoring policy:
  kept choice effect hints as an authoring policy instead of adding an automatic formatter.
  documented the visible `outcomeHint` convention in `src/game/data/regions/README.md`: costs/spent resources first, gains/recovery next, time last.
  after user clarification, reverted the over-eager soup-kitchen and forest `outcomeHint` text edits and left this as a forward-looking authoring policy only.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check` passed with only existing CRLF normalization warnings.
  API smoke had confirmed the temporary edited hints before they were reverted.

- 2026-06-22 completed quest group collapse:
  replaced per-completed-quest folding with a single `완료한 퀘스트` group at the bottom of the quest sheet.
  Active quests stay visible above, while completed quests are hidden behind the group toggle with a completed-count chip.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  HTTP 200 from `http://127.0.0.1:3000/`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-22 completed quest group hidden fix:
  fixed the completed quest group not visually collapsing because `.quest-completed-list { display: grid; }` overrode the `hidden` attribute.
  Added an explicit `.quest-completed-list[hidden] { display: none; }` rule.
  Verification passed:
  `npm.cmd run build`
  `git diff --check`
  HTTP 200 from `http://127.0.0.1:3000/`.

- 2026-06-22 generic quest item requirements:
  added `requiredItems` to quest definitions so any item-gated quest can surface the same item checklist UI used by `prepare_rescue_signal`.
  `buildQuestRequirements()` now reads quest `requiredItems` and also includes any `obtain_item` objectives automatically.
  Added item requirements for `first_canned_food` (`cannedFood x3`) and moved `prepare_rescue_signal` requirements into quest content data instead of hardcoding them in the service.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  HTTP 200 from `http://127.0.0.1:3000/`.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-22 shelter crafting visible recipe hints:
  enabled `showOutcomeHint` on all shelter crafting recipes so the crafting menu now shows each recipe's required materials/prerequisites and completed effect under the button.
  Covered `craft_shelter_wall_patch`, `craft_shelter_brazier`, `craft_shelter_rain_bucket`, `cook_at_shelter`, and `assemble_rescue_radio`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  direct TSX smoke confirmed all five recipe definitions have `showOutcomeHint: true` and non-empty hints.
  local API smoke created a new game, opened `shelter_crafting_menu`, and confirmed all five crafting actions return `showOutcomeHint: true` with non-empty hints.
  `git diff --check` passed with only existing CRLF normalization warnings.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-22 shelter crafting recipe cards:
  turned shelter crafting choices into recipe-style cards: recipe labels no longer use `제작하기`/`조리하기`/`조립하기`, and each recipe shows a small `제작` action pill like the inventory `사용` button.
  added `craftingRecipe` metadata to action choices with effect text, optional prerequisites, and required materials carrying `ownedAmount`, `requiredAmount`, and `met`.
  the crafting UI now renders effect first, then prerequisites if any, then material chips like `목재 판자 (0/1)`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  service smoke and local API smoke confirmed all five shelter recipes return labels, effect text, actionLabel `제작`, and material counts.
  `rg` confirmed `제작하기`, `조리하기`, `조립하기`, and `완성하면` no longer remain in the shelter crafting files touched for this UI.
  Playwright web-game verification still cannot run because the workspace lacks the `playwright` package.

- 2026-06-22 shelter crafting row compacting:
  kept the required-material chip style unchanged, but made the crafting recipe `효과` and `조건` rows keep their label and value on the same line on mobile.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run build`
  `git diff --check` passed with only existing CRLF normalization warnings.

- 2026-06-22 movement sheet travel time tags:
  added `travelMinutes` to map entries, calculated from the same `TRAVEL_DURATION_MS` value used by actual travel execution.
  movement list cards now show time cost such as `15분` / `30분` instead of route-count labels like `2구간`.
  Verification passed so far:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`

- 2026-06-22 shelter crafting selected detail:
  changed the crafting menu from showing every recipe's full detail inline to a compact recipe list plus one selected recipe detail panel.
  Recipe rows now select the detail panel, while the separate small `제작` button submits the crafting action.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  local API smoke confirmed the shelter crafting menu still returns five recipes plus the leave action.

- 2026-06-22 shelter crafting submit guard:
  made the crafting recipe select button explicitly stop event propagation and only update the selected detail panel.
  made the separate `제작` button explicitly stop propagation before submitting the crafting action, so recipe-card selection cannot accidentally craft.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run build`

- 2026-06-22 hot meal crafting effect wording:
  removed the redundant `따뜻한 식사:` prefix from the selected crafting detail effect; the hot meal effect now reads `+1 정신력 / +4 기력`.
  Updated the fallback outcome/failure hint wording for the same recipe as well.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  local API smoke confirmed `cook_at_shelter.craftingRecipe.effect` returns `+1 정신력 / +4 기력`.

- 2026-06-22 rescue radio single-use crafting:
  added `quest_state prepare_rescue_signal active` to `assemble_rescue_radio` crafting conditions.
  filtered `assemble_rescue_radio` out of the shelter crafting menu once `prepare_rescue_signal` is no longer active or `rescue_signal_ready` is already set, while still showing it during the active quest even if materials are missing.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  service smoke confirmed the radio recipe appears before assembly, then disappears after assembly sets `rescue_signal_ready` and completes the quest.
  local API smoke confirmed a fresh active rescue-signal quest still shows the radio recipe.

- 2026-06-22 home screen and manual save:
  added a novel-cover style home screen with `새 게임` and disabled/enabled `이어하기` based on the last manual save slot.
  changed continuation to use only the explicit manual save slot, while keeping `game_sessions` as the live work session.
  added manual save APIs for save info, saving, and restoring, with both file storage and PostgreSQL support through `manual_saves`.
  moved save controls into the menu with `저장하기`, `홈으로`, `기록`, and `새 게임`, including unsaved-progress confirmation and overwrite confirmation for a different saved game.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  API smoke confirmed missing save info, manual save creation, action progress, and restore back to the saved scene.
  in-app browser smoke confirmed initial home, disabled `이어하기` without a save, new game entry, menu save status, home return, enabled `이어하기`, and restore into the saved game.

- 2026-06-22 Kakao login MVP:
  added REST API Kakao OAuth flow with signed HTTP-only app session cookies, CSRF state cookie, callback handling, and app logout.
  added `auth_users` plus owner-linked `manual_saves` so logged-in users get one account-based manual save slot while guest browser saves still work.
  added home-screen login status, Kakao login entry, logout button, and account-based `이어하기` restore.
  documented Kakao setup and Render environment variables: `PUBLIC_BASE_URL`, `AUTH_SECRET`, `KAKAO_REST_API_KEY`, and optional `KAKAO_CLIENT_SECRET`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  API smoke on port 3100 confirmed `/api/auth/me`, missing Kakao config behavior, authenticated account save, account save info, and account restore.
  in-app browser smoke on port 3100 confirmed the home login panel renders the missing-key state and `새 게임` still enters gameplay without console errors.

- 2026-06-22 home Kakao button polish:
  moved the home action block closer to the visual center of the cover screen and centered the auth panel.
  restyled the Kakao login link with the Kakao yellow container, dark label, rounded 12px shape, and speech-bubble symbol.

- 2026-06-22 system note time ordering:
  changed `summarizeSystemNote` so elapsed time tokens are appended after movement, new location, stat, money, item, and quest tokens.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  local API smoke confirmed shelter -> convenience travel now returns `이동: 편의점 폐허 / 신규 지역: 작은 병원 / + 15분`.

- 2026-06-22 crafting menu detail placement:
  moved the selected crafting recipe detail panel above the recipe choices.
  added a repeat crafting menu scene so the explanatory crafting intro appears only on the first crafting visit; subsequent crafting opens directly to the recipe list.
  Verification passed:
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  local API smoke confirmed first crafting opens `shelter_crafting_menu` with 2 paragraphs, then later crafting opens `shelter_crafting_menu_repeat` with no nonblank paragraphs and recipe metadata intact.

- 2026-06-23 mobile dock/map tap polish:
  swapped the bottom dock positions of `메뉴` and `이동`, so the dock order now starts with menu and ends with movement.
  disabled mobile tap/text selection highlighting on SVG hex map tiles and blur the tile after pointer activation to prevent the blue selection flash that did not match choice buttons.

- 2026-06-23 map zoom and global tap highlight polish:
  extended mobile tap-highlight prevention to all clickable button/link/card-style controls, including home/menu/status/inventory/map controls.
  added automatic fit scaling for the movement hex map so the full visible map defaults to fitting inside the panel.
  added map zoom controls (`−`, `맞춤`, `+`) that adjust the rendered SVG size while keeping zoomed-in maps scrollable.

- 2026-06-23 map zoom refinement:
  widened the map zoom range and moved the `맞춤` control to the right of `+`, so the toolbar now reads `− / percent / + / 맞춤`.
  changed `맞춤` to allow safe upscaling above 100%, reducing unused map-board whitespace while keeping tiles unclipped.
  changed zoomed-in map rendering to center the current location tile by adding zoom-only scroll gutter and aligning the map board from the top-left.
  increased hex tile label text to 15px on mobile while preserving the existing word-based line breaks.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  in-app browser mobile check confirmed fit mode renders at 111% without horizontal scroll, `+` zoom centers the current tile at `(157, 143)` against board center `(156, 143)`, and the toolbar order is `− / 130% / + / 맞춤` after zoom.

- 2026-06-23 movement list detail slot:
  simplified the movement destination list so each card shows only the destination name and compact tags.
  added a selected-destination detail slot below the list with the location description and a separate `이동` button.
  kept map hex tiles as direct travel controls, while list cards only change the selected detail.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  in-app browser mobile check confirmed selecting the `급식소` list card updates the detail while staying at `임시 거처`, and clicking the `급식소` map tile immediately travels to `급식소`.

- 2026-06-23 transient scrollbar polish:
  hid native scrollbars on the scrollable app shell, bottom-sheet content, and hex map board so they no longer reserve layout space.
  added transient overlay scroll indicators that appear while scrolling and fade shortly after scrolling stops, including horizontal support for zoomed map boards.

- 2026-06-23 map zoom scroll-space fix:
  replaced the zoomed map canvas margin gutter with an explicit `.hex-map-scroll-space` wrapper so enlarged maps no longer rely on flex item margins for scrollable area.
  updated viewport alignment to account for the wrapper offset before centering the current location tile.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  in-app browser mobile check confirmed the canvas margin is now `0px`, fit/zoom states remain centered within about 1px, and 200% zoom keeps the current tile near the board center.

- 2026-06-23 hidden map scrollbars:
  kept the hex map board scrollable but stopped attaching transient scrollbar indicators inside the tile map.
  added explicit native scrollbar hiding rules for `.hex-map-board` so zoomed maps do not show scroll chrome.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  in-app browser check confirmed zoomed map scroll dimensions remain larger than the viewport while `.hex-map-board` has no transient scrollbar nodes and uses `scrollbar-width: none`.

- 2026-06-23 menu panel clarity:
  removed backdrop blur from `.panel-shell` and made the bottom panel background fully opaque white so the menu no longer reads like a blurred translucent sheet.
  removed backdrop blur from the bottom dock as well to keep the dock visually crisp on mobile.
  Verification passed:
  `npm.cmd run build`
  Playwright web-game smoke could not run because the local skill script could not resolve the `playwright` package in this environment.

- 2026-06-23 system note placement:
  moved `#system-note` below `#scene-text` so system notes render after the narrative body and before choices.
  adjusted the system note margin for the new below-body placement.

- 2026-06-23 delayed system note timing:
  deferred system note rendering until after narrative typing completes, including the tap-to-skip path.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
- 2026-06-23 persistent system note until scene change:
  stopped clearing `#system-note` just because a same-scene render has no new note payload.
  System notes now stay with the current narrative body until the story surface changes; scene changes still clear the note before the next body starts typing.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  in-app browser check confirmed the first quest note stays visible after waiting on the same scene, then hides when the next scene begins typing.
  Playwright web-game smoke still cannot run because the local skill script cannot resolve the `playwright` package in this environment.

- 2026-06-23 item detail time token:
  removed the separate `사용 시간: ...` line from inventory item details.
  item use time now appears as a compact effect token after the resource effect, for example `+5 기력 + 10분`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  Playwright web-game smoke could not run because the local skill script still cannot resolve the `playwright` package in this environment.

- 2026-06-23 shelter recovery choice hints:
  enabled visible outcome hints for the shelter `휴식하기` and `취침하기` actions.
  `휴식하기` now shows `+1 체력 / +1 정신력 / +15분`.
  `취침하기` now shows `오후 6시 이후 / +1 체력 / +1 정신력 / 다음 날 06:00`.
  Verification passed:
  `npm.cmd run content:validate`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  `git diff --check`
  local API smoke confirmed both shelter actions return the new `outcomeHint` values with `showOutcomeHint: true`.
  Playwright web-game smoke could not run because the local skill script still cannot resolve the `playwright` package in this environment.
  in-app browser check confirmed the first quest action keeps `#system-note` hidden while `.scene-text .typing` exists, then shows `퀘스트 시작: 구조 신호 준비` after skipping the finished body text, with no console errors.

- 2026-06-23 tool durability farming expansion:
  added tool item support with `maxDurability`, `toolDurability` state normalization, `not_has_item`, `set_tool_durability`, and `damage_tool` effects.
  added 손도끼, 간이 칼, 찌그러진 냄비, 산나물, 눅눅한 빵, 숲죽, plus shelter crafting/cooking recipes.
  expanded forest farming with tool-based high-efficiency actions and tagged random result scenes, while leaving the existing 숲 `수색하기` probabilities untouched.
  added a convenience store food crate stock node with bread, water, and rice scenes.
  inventory item details now show tool durability as `내구도 current/max`.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  direct engine smoke confirmed axe crafting, axe chopping, axe breakage at 0 durability, forest stew cooking, and pot durability loss.

- 2026-06-23 prologue rerender loop fix:
  fixed `renderScene` so it no longer clears and restarts the narrative typewriter when the already-rendered story surface is unchanged.
  This prevents the prologue/current scene from appearing to restart endlessly during same-scene refreshes or sync updates.
  Verification passed:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  `git diff --check`
  local API smoke confirmed `prologue_opening -> prologue_old_woman_visit -> shelter_first_intro`.
  checked that the local server is serving the patched `app-api.js`.

- 2026-06-23 material/cooking economy pass:
  standardized the core crafting material economy around four basic materials: 목재 판자, 고철 조각, 천 조각, 끈 묶음.
  added `cordage` and wired it into shelter upgrades, tools, the rescue radio requirement, forest gathering, convenience/kitchen salvage, and hospital supply pickups.
  expanded the core cooking ingredient set around 물병, 쌀, 채소, 산나물 and added `묽은 죽` and `나물국` alongside `따뜻한 식사` and `숲죽`.
  added a kitchen ingredient crate stock node so rice, vegetables, and water can be found in an appropriate location.
  added `itemCatalog` to state snapshots and a menu `아이템 도감` panel showing all world items grouped by kind with owned counts, tags, effects, and tool durability.
  Verification passed so far:
  `node --check app-api.js`
  `npm.cmd run typecheck`
  `npm.cmd run content:validate`
  `npm.cmd run build`
  direct engine smoke confirmed kitchen ingredient pickup, forest cordage gathering, tool/cooking recipes, and item catalog presence.

- 2026-06-23 forest forage hint probability cleanup:
  removed explicit probability and miss-rate text from forest food forage choice hints.
  `먹을 것을 뒤진다` now shows only possible finds and time: `산나물 +1 / 눅눅한 빵 +1 / 천 조각 +1 / +30분`.
  `간이 칼로 덤불을 뒤진다` now shows possible finds, tool durability cost, and time without probabilities.
  added a region authoring note that choice hints should hide probabilities and miss chances.
  Verification passed:
  `npm.cmd run content:validate`
  `npm.cmd run typecheck`
  `npm.cmd run build`
  `git diff --check`
  local API smoke confirmed `forage_forest_food` returns the probability-free `outcomeHint` with `showOutcomeHint: true`.
  Playwright web-game smoke could not run because the local skill script still cannot resolve the `playwright` package in this environment.
