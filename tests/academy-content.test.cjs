const test = require("node:test");
const assert = require("node:assert/strict");
const { GameService } = require("../.server-dist/game/service");
const { GameStateSchema } = require("../.server-dist/game/schemas");
const { createInitialGameState } = require("../.server-dist/game/rules");
const { worldRegistry } = require("../.server-dist/game/data/registry");
const { buildRuntimeRegistry } = require("../.server-dist/game/runtime-registry");
const { registerContentVersion, versionRegistry } = require("../.server-dist/game/content-versions");
const { withAcademyContent } = require("../.server-dist/game/academy-content");
const { academyScenes } = require("../.server-dist/game/data/regions/arcana-academy/scenes");
const { academyChoices } = require("../.server-dist/game/data/regions/arcana-academy/choices");
const { academyPeople } = require("../.server-dist/game/data/regions/arcana-academy/people");
const { academyQuests } = require("../.server-dist/game/data/regions/arcana-academy/quests");
const { fallbackNarration } = require("../.server-dist/game/text-world/narrator");
const { createNpcDialogueGenerator } = require("../.server-dist/game/npc-dialogue-pipeline");

function fixture() {
  let stored, snapshot;
  const repo = {
    withGameLock: async (_id, fn) => fn(),
    loadGame: async () => structuredClone(stored),
    saveGame: async session => { stored = JSON.parse(JSON.stringify(session)); stored.state = GameStateSchema.parse(stored.state); },
    getTemplate: async () => undefined, saveTemplate: async () => {}, saveProtagonistTemplate: async () => {},
    appendGenerationLog: async () => {}, appendActionLog: async () => {},
  };
  const dialogue = createNpcDialogueGenerator(async () => { throw Error("Unexpected dialogue request"); }, () => false);
  const service = new GameService(repo, undefined, undefined, undefined, dialogue, async context => fallbackNarration(context));
  return {
    service,
    get snapshot() { return snapshot; },
    async start() {
      snapshot = await service.createGame("arcana");
      snapshot = await service.performAction(snapshot.gameId, { type: "travel", targetId: "arcana_academy" });
    },
    async choose(id) {
      const row = snapshot.availableActions.find(row => row.isAvailable && [row.id, row.action.choiceId, row.action.actionId].includes(id));
      assert.ok(row, `Not offered: ${id}; offered: ${snapshot.availableActions.map(row => row.id).join(", ")}`);
      snapshot = await service.performAction(snapshot.gameId, row.action);
      return snapshot;
    },
    async move(roomId) {
      const room = snapshot.academyMap?.rooms.find(room => room.id === roomId);
      assert.ok(room?.action, `Room is not enterable: ${roomId}; ${room?.lockedReason}`);
      snapshot = await service.performAction(snapshot.gameId, room.action);
      assert.equal(snapshot.academyMap.currentRoomId, roomId);
      return snapshot;
    },
    async reload() { snapshot = await service.getState(snapshot.gameId); return snapshot; },
    async action(action) { snapshot = await service.performAction(snapshot.gameId, action); return snapshot; },
  };
}
async function finishLessons(f) {
  await f.move("headmaster");
  await f.choose("academy_enroll");
  await f.move("classroom");
  assert.equal(f.snapshot.state.flags.academy_theory_completed, undefined);
  await f.choose("academy_attend_theory");
  await f.move("practice");
  assert.equal(f.snapshot.state.flags.academy_practical_passed, undefined);
  await f.choose("academy_open_practical");
  await f.choose("academy_push_outer");
  assert.equal(f.snapshot.state.flags.academy_practical_passed, undefined);
  await f.choose("academy_trace_inner");
  await f.move("library");
  await f.choose("academy_library_orientation");
  await f.move("headmaster");
  await f.choose("academy_report_orientation");
}
test("school lessons require enrollment, allow a failed practice retry, and reward one report", async () => {
  const f = fixture(); await f.start();
  assert.equal(f.snapshot.availableActions.length, 3);
  await f.choose("academy_open_curriculum");
  assert.ok(!f.snapshot.availableActions.some(row => row.action.choiceId === "academy_attend_theory"));
  await f.choose("academy_return_courtyard");
  const before = f.snapshot.state.inventory.manaPotion ?? 0;
  await finishLessons(f);
  assert.equal(f.snapshot.state.quests.academy_first_lesson, "completed");
  assert.equal(f.snapshot.state.inventory.manaPotion, before + 1);
  assert.ok(f.snapshot.state.systemNoteEntries.some(entry => entry.type === "item" && entry.itemId === "manaPotion"));
  const inventory = structuredClone(f.snapshot.state.inventory);
  await f.reload(); assert.deepEqual(f.snapshot.state.inventory, inventory);
  await f.choose("academy_return_courtyard"); await f.choose("academy_visit_headmaster");
  assert.ok(!f.snapshot.availableActions.some(row => row.action.choiceId === "academy_report_orientation"));
  await assert.rejects(() => f.action({ type: "content_choice", choiceId: "academy_report_orientation" }));
});

test("observatory uses disclosed clues, can be retried, and grants no reward before reporting", async () => {
  const f = fixture(); await f.start(); await finishLessons(f);
  await f.choose("academy_visit_library"); await f.choose("academy_read_observatory_request");
  await f.choose("academy_accept_observatory");
  assert.equal(f.snapshot.academyMap.currentRoomId, "library");
  await f.move("observatory");
  assert.ok(!f.snapshot.availableActions.some(row => row.action.choiceId === "academy_align_astrarium"));
  await f.choose("academy_inspect_astrarium"); await f.choose("academy_align_star_first");
  assert.equal(f.snapshot.state.flags.academy_observatory_repaired, undefined);
  const before = f.snapshot.state.inventory.manaShard ?? 0;
  await f.choose("academy_align_astrarium");
  assert.equal(f.snapshot.state.inventory.manaShard ?? 0, before);
  assert.equal(f.snapshot.state.quests.academy_silent_observatory, "active");
  await f.choose("academy_return_library"); await f.choose("academy_report_observatory");
  assert.equal(f.snapshot.state.quests.academy_silent_observatory, "completed");
  assert.equal(f.snapshot.state.inventory.manaShard, before + 1);
  const inventory = structuredClone(f.snapshot.state.inventory);
  await f.reload(); assert.deepEqual(f.snapshot.state.inventory, inventory);
  await f.choose("academy_return_courtyard"); await f.choose("academy_open_curriculum"); await f.choose("academy_visit_library");
  assert.ok(!f.snapshot.availableActions.some(row => row.action.choiceId === "academy_report_observatory"));
});

test("Stella friendship is chosen, and her offline conversation starts only at her scene", async () => {
  const f = fixture(); await f.start();
  assert.equal(f.snapshot.state.flags.academy_stella_met, undefined);
  await assert.rejects(() => f.action({ type: "npc_dialogue", command: "start", npcId: "stella" }));
  await f.move("garden"); await f.choose("academy_introduce_stella");
  assert.equal(f.snapshot.state.flags.academy_stella_met, true);
  await f.choose("academy_study_with_stella");
  assert.equal(f.snapshot.state.flags.academy_stella_partner, true);
  await f.choose("academy_return_stella");
  const start = f.snapshot.availableActions.find(row => row.action.type === "npc_dialogue" && row.action.command === "start");
  assert.equal(start.action.npcId, "stella");
  await f.action(start.action);
  assert.match(f.snapshot.currentScene.paragraphs.join(" "), /공책/);
  assert.ok(f.snapshot.availableActions.some(row => /머리핀/.test(row.label)));
  const topic = f.snapshot.availableActions.find(row => /머리핀/.test(row.label)); await f.action(topic.action);
  assert.match(f.snapshot.currentScene.paragraphs.join(" "), /평범한 머리핀/);
});

test("pinned empty-school saves gain all content without changing the archived registry or player state", () => {
  const legacy = structuredClone(worldRegistry);
  for (const scene of academyScenes) delete legacy.scenes[scene.id];
  for (const choice of academyChoices) delete legacy.choices[choice.id];
  for (const id of Object.keys(academyPeople)) delete legacy.people[id];
  for (const quest of academyQuests) delete legacy.quests[quest.id];
  legacy.locations.arcana_academy.residentIds = [];
  legacy.locations.arcana_academy.obtainableItemIds = [];
  legacy.scenes.arcana_academy_intro = { id: "arcana_academy_intro", locationId: "arcana_academy", title: "아르카나 아카데미", paragraphs: ["옛 입구"], choiceIds: ["leave_arcana_place"], conditions: [] };
  const archived = structuredClone(legacy), state = createInitialGameState();
  state.contentVersionId = registerContentVersion(legacy);
  const originalState = structuredClone(state), current = buildRuntimeRegistry(state);
  assert.equal(current.locations.arcana_academy.residentIds.length, 4);
  assert.ok(current.scenes.arcana_academy_intro.choiceIds.includes("academy_visit_headmaster"));
  assert.ok(current.quests.academy_silent_observatory);
  assert.deepEqual(versionRegistry(state.contentVersionId), archived);
  assert.deepEqual(legacy, archived); assert.deepEqual(state, originalState);
  assert.equal(withAcademyContent(current), current);
});
test("interior map enforces room gates and returns to neutral rooms without replaying lessons", async () => {
  const f = fixture(); await f.start();
  assert.equal(f.snapshot.academyMap.currentRoomId, "courtyard");
  assert.equal(f.snapshot.academyMap.rooms.length, 8);
  const classroom = f.snapshot.academyMap.rooms.find(room => room.id === "classroom");
  assert.equal(classroom.action, null); assert.match(classroom.lockedReason, /등록/);
  await assert.rejects(() => f.action({ type: "academy_move", roomId: "classroom" }), /등록/);
  const office = f.snapshot.academyMap.rooms.find(room => room.id === "headmaster");
  assert.deepEqual(office.route, ["courtyard", "hall", "headmaster"]); assert.equal(office.minutes, 2);
  await f.move("headmaster"); await f.choose("academy_enroll");
  await f.move("classroom");
  assert.equal(f.snapshot.currentScene.id, "academy_classroom");
  assert.equal(f.snapshot.state.flags.academy_theory_completed, undefined);
  assert.equal(f.snapshot.academyMap.rooms.find(room => room.id === "practice").action, null);
  await f.choose("academy_attend_theory");
  await f.move("classroom"); // Viewing the room again is not another lesson.
  assert.equal(f.snapshot.currentScene.id, "academy_classroom");
  await f.move("practice"); assert.equal(f.snapshot.currentScene.id, "academy_practice_room");
  assert.equal(f.snapshot.state.flags.academy_practical_passed, undefined);
  await f.reload(); assert.equal(f.snapshot.academyMap.currentRoomId, "practice");
  await assert.rejects(() => f.action({ type: "academy_move", roomId: "observatory" }), /의뢰/);
  await assert.rejects(() => f.action({ type: "academy_move", roomId: "nonexistent" }));
});

test("the room map filters movement rows while keeping only activities at their actual room", async () => {
  const { academyVisibleChoices } = await import("../client/academy-map.mjs");
  const row = id => ({ id, action: { type: "content_choice", choiceId: id } });
  const snapshot = { state: { npcDialogue: { active: null } }, academyMap: { currentRoomId: "hall" },
    availableActions: [row("academy_visit_library"), row("academy_attend_theory"), row("academy_open_practical"), row("academy_share_stella_success")] };
  assert.deepEqual(academyVisibleChoices(snapshot), []);
  snapshot.academyMap.currentRoomId = "classroom";
  assert.deepEqual(academyVisibleChoices(snapshot).map(row => row.id), ["academy_attend_theory"]);
  snapshot.academyMap.currentRoomId = "practice";
  assert.deepEqual(academyVisibleChoices(snapshot).map(row => row.id), ["academy_open_practical"]);
  snapshot.academyMap.currentRoomId = "garden";
  assert.deepEqual(academyVisibleChoices(snapshot).map(row => row.id), ["academy_share_stella_success"]);
  snapshot.academyMap = null; assert.equal(academyVisibleChoices(snapshot), snapshot.availableActions);
});