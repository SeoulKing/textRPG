Original prompt: Implement a location-stock-based first farming quest where the player moves to the convenience store ruins, discovers a shelf, gathers up to three canned foods from real diminishing stock, and completes a single persistent first-food quest.

- Added stock node definitions to location content and new stock/focus condition/effect variants to the game schemas.
- Added runtime stock state, discovered stock nodes, and active stock node tracking to game state.
- Reworked quests so only `first_canned_food` remains and it completes from the persistent `first_canned_food_secured` flag.
- Rewrote convenience scenes and scene choices around `survey -> shelf discovered -> shelf focus -> collect from diminishing stock`.
- Normalizing saves now prunes invalid stock state and upgrades old saves into the new structure.
- Verified through the live API flow that convenience stock starts at 3, drops to 2/1/0 after each collection, hides the collect action at 0, and completes `first_canned_food` on the first can.
- `npm run typecheck`, `npm run build`, and compiled `validateContent()` all pass.
- The `develop-web-game` Playwright client could not run here because the `playwright` package is not installed in this workspace or skill environment.
- Updated the client typing animation rule to be scene-revisit aware: new scenes still animate, but already-seen scenes render immediately when revisited.
- Fixed a client regression where action responses re-rendered choice buttons while `actionInFlight` was still true, leaving every new choice disabled.
- System notes are now generated from actual state deltas in a unified format such as `+ 1 정신력 / - 1 물병`, with positive tokens intended for green styling and negative tokens for red styling in the client.
- System notes now persist until a newer note replaces them, and the note chip replays a `fade-up` entrance only when the text actually changes.
- Reworked the shelter intro so the first quest is offered as a one-time scene choice, starts on acceptance, and still completes cleanly if the player reaches convenience first.
- Quest panel UI now hides inactive quests and translates status labels into Korean display text such as `진행 중` and `완료`.
- System notes now render as multiple chips: one change per chip, with multiple changes appearing side-by-side in a row instead of one chip with slash-separated text.
- Quest-prefixed choices now render with a distinct highlighted style so the initial quest pickup stands out from ordinary actions.
- Map panel chrome was reduced: the explanatory tag/hint block is gone, location rows are slimmer, and travel buttons were removed in favor of clicking the reachable location rows or hex tiles directly.
- The map board now sizes itself from active location slots only, which visually centers the shelter hex within the three-region mini-map instead of letting empty template slots skew the layout.
- Refined the mini-map centering again by normalizing against the active tiles' full bounds, not just max coordinates, and added a little more bottom padding so the board no longer feels cramped underneath the hexes.
- Removed the hard-coded three-location map filter: the mini-map now builds from whatever visible/map-entry locations exist, keeps known template placements, and falls back to auto spillover slots for any future locations that have not been given explicit coordinates yet.
- Added a small upward visual bias to the hex stage itself so the tile cluster sits a bit higher inside the map board and preserves more perceived breathing room underneath, even as the map grows.
- Reworked the log panel into a slim single-line timeline: each log entry now stores a Korean `timestampLabel + message` pair, legacy English string logs are normalized into Korean on load, and the client renders time and content side-by-side instead of repeating a generic "기록" card title.

- Wired the user-supplied PNG scene art into `shelter`, `convenience`, and `kitchen`, and refreshed location-card caching so both new games and existing saves can pick up updated `imagePath` values instead of staying on the older SVG art.
- Expanded the client-side scene preservation logic so background sync no longer auto-swaps any same-location scene while the player is still idle there; the displayed scene now stays put until the player acts or leaves.
- Refactored scene progression so the server now keeps the currently presented narrative fixed until a successful player action occurs, then advances to the next narrative step. The service layer now explicitly assembles `current narrative -> available choices -> next narrative after action`, and intro flags are consumed on action success instead of on render.
- Added scene-link debugging around the explicit scene object flow: the UI now shows the current `scene id`, and each available choice/action exposes its resolved `nextSceneId` so we can verify scene-to-scene wiring directly.
- Reframed the opening as a real `prologue_event` with chained scenes (`prologue_opening -> prologue_old_woman_visit -> shelter_first_intro`). While a scene belongs to an event, only scene-authored choices are shown; location actions unlock only after the event exits into the normal shelter flow.
- Confirmed a stale local server on port 3000 was still serving the pre-event build (`activeEventId: null`, shelter actions visible in `prologue_opening`). Rebuilt, restarted the local server, and re-verified that a fresh `/api/games` response now returns `activeEventId: "prologue_event"` with only `opening_commit` available for `prologue_opening`.

TODO
- If browser persistence still feels sticky, clear old local storage keys and confirm a fresh v8 game starts automatically.
- If we want screenshot-based regression checks later, install `playwright` or add a browser automation path that can click DOM buttons in this project.
