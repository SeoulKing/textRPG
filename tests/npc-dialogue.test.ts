import assert from "node:assert/strict";
import test from "node:test";

import { getNpcDialogueProfile } from "../src/game/data/npc-dialogue-profiles";
import { validateContent, worldRegistry } from "../src/game/data/registry";
import {
  createNpcDialogueGenerator,
  type NpcDialogueGenerationInput,
  type NpcDialogueGenerator,
  type NpcDialogueRoleClient,
  type NpcDialogueRoleRequest,
} from "../src/game/npc-dialogue-pipeline";
import type { GameRepository } from "../src/game/repository";
import { createInitialGameState } from "../src/game/rules";
import {
  GameStateSchema,
  type GameSession,
} from "../src/game/schemas";
import { GameService } from "../src/game/service";

function dialogueContext() {
  return {
    location: {
      id: "subway",
      name: "지하철역",
      summary: "어두운 대합실이다.",
      sceneTitle: "지하철역 대합실",
      sceneParagraphs: ["슈미가 개찰구 옆에 앉아 있다."],
    },
    player: {
      day: 1,
      phase: "morning",
      condition: { hp: 8, mind: 6, energy: 7 },
      recentLog: [],
    },
  };
}

function scriptedResult(
  input: NpcDialogueGenerationInput,
): Awaited<ReturnType<NpcDialogueGenerator>> {
  const situation = input.selectedChoice
    ? "슈미가 선택한 말을 듣고 라디오를 내려놓았다."
    : "슈미가 낯선 사람을 경계하며 고개를 들었다.";
  const dialogue = input.selectedChoice
    ? `그 말은 들었어요. ${input.selectedChoice.label}`
    : "무슨 일이세요?";
  const generatedAt = "2026-07-30T00:00:00.000Z";
  const choices = [1, 2, 3].map((index) => ({
    id:
      `npc-dialogue:${input.profile.id}:${input.turnNumber}:choice:${index}`,
    label: `답변 ${input.turnNumber}-${index}`,
    thought: "이 얘기를 조금 더 해 볼까.",
    thoughtSource: "llm" as const,
  }));
  return {
    scene: {
      npcId: input.profile.id,
      turnNumber: input.turnNumber,
      situation,
      dialogue,
      choices,
      source: "llm",
      generatedAt,
    },
    exchange: {
      turnNumber: input.turnNumber,
      playerChoice: input.selectedChoice,
      npcReply: { situation, dialogue },
      at: generatedAt,
    },
    diagnostics: {
      latencyMs: 1,
      fallback: false,
      errors: [],
    },
  };
}

function subwaySession(): GameSession {
  const state = createInitialGameState();
  state.location = "subway";
  state.sceneId = "subway_first_intro";
  state.flags.visited_subway = true;
  state.flags.known_subway = true;
  return {
    id: "npc-dialogue-test",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    state,
    world: {
      locationCards: {},
      personCards: {},
      itemCards: {},
      eventCards: {},
      sceneCards: {},
      protagonistCard: null,
    },
  };
}

function inMemoryRepository(initial: GameSession) {
  let stored = structuredClone(initial);
  const generationLogs: Array<Record<string, unknown>> = [];
  const repository = {
    withGameLock: async <T>(
      _gameId: string,
      operation: () => Promise<T>,
    ) => operation(),
    loadGame: async () => structuredClone(stored),
    saveGame: async (session: GameSession) => {
      stored = structuredClone(session);
    },
    getTemplate: async () => undefined,
    saveTemplate: async () => undefined,
    saveProtagonistTemplate: async () => undefined,
    appendGenerationLog: async (entry: Record<string, unknown>) => {
      generationLogs.push(entry);
    },
    appendActionLog: async () => undefined,
  } as unknown as GameRepository;
  return {
    repository,
    read: () => structuredClone(stored),
    generationLogs,
  };
}

test("슈미는 지하철역 거주자로 등록되고 콘텐츠 참조가 유효하다", () => {
  validateContent();
  assert.equal(
    (worldRegistry.people.shumi as { name?: string } | undefined)?.name,
    "슈미",
  );
  assert.ok(worldRegistry.locations.subway?.residentIds.includes("shumi"));
  assert.equal(getNpcDialogueProfile("shumi")?.homeLocationId, "subway");
});

test("한 요청으로 NPC 반응과 다음 속말을 받고 미리 작성한 서사는 문맥에 넣지 않는다", async () => {
 const profile=getNpcDialogueProfile("shumi");assert.ok(profile);
 const requests:NpcDialogueRoleRequest[]=[];
 const client:NpcDialogueRoleClient=async<T>(request:NpcDialogueRoleRequest)=>{requests.push(request);return {situation:"슈미가 고개를 들어 이쪽을 살핀다.",dialogue:"무슨 일이세요?",choices:[
 {label:"이곳에서 지내는지 묻는다",thought:"이곳 사정은 좀 알고 있을까."},
 {label:"라디오에 대해 묻는다",thought:"무슨 소식을 듣고 있을까."},
 {label:"경계하지 않아도 된다고 말한다",thought:"말을 조금 더 해 보는 게 좋겠지."}]} as T;};
 const generator=createNpcDialogueGenerator(client,()=>true);
 const input={gameId:"dialogue-one-call",profile,context:dialogueContext(),memory:{visitCount:0,exchanges:[]},visitCount:1,turnNumber:0,selectedChoice:null};
 const opening=await generator(input);assert.equal(requests.length,1);assert.equal(requests[0].role,"dialogue_turn");
 assert.equal(opening.scene.choices.length,3);assert(opening.scene.choices.every(c=>c.thought&&!c.postChoiceNarrative));
 const selected=opening.scene.choices[0];await generator({...input,turnNumber:1,selectedChoice:selected,memory:{visitCount:1,exchanges:[opening.exchange]}});
 assert.equal(requests.length,2);assert.deepEqual(requests[1].payload.selectedChoice,{label:selected.label,thought:selected.thought});
 assert(!JSON.stringify(requests).includes("postChoiceNarrative"));assert(!JSON.stringify(requests).includes("openingApproachNarrative"));
 assert.equal((requests[0].payload.npcProfile as {speechStyle:string[]}).speechStyle[0],"차갑고 거리감 있는 존댓말을 사용한다.");
});

test("AI 역할 실패 시에도 슈미 기본 대사와 세 답변으로 계속한다", async () => {
  const profile = getNpcDialogueProfile("shumi");
  assert.ok(profile);
  const generator = createNpcDialogueGenerator(
    async () => {
      throw new Error("role failed");
    },
    () => true,
  );

  const result = await generator({
    gameId: "dialogue-fallback-test",
    profile,
    context: dialogueContext(),
    memory: { visitCount: 0, exchanges: [] },
    visitCount: 1,
    turnNumber: 0,
    selectedChoice: null,
  });

  assert.equal(result.scene.source, "template");
  assert.equal(result.scene.choices.length, 3);
  assert.equal(result.diagnostics.fallback, true);
  assert.equal(result.diagnostics.errors.length, 1);
});

test("대화는 무료로 이어지고 종료 뒤 재방문해도 최근 기억을 유지한다", async () => {
  const session = subwaySession();
  const store = inMemoryRepository(session);
  const generationInputs: NpcDialogueGenerationInput[] = [];
  const dialogueGenerator: NpcDialogueGenerator = async (input) => {
    generationInputs.push(structuredClone(input));
    return scriptedResult(input);
  };
  const service = new GameService(
    store.repository,
    undefined,
    undefined,
    undefined,
    dialogueGenerator,
  );

  const initial = await service.getState(session.id);
  const startAction = initial.availableActions.find(
    (choice) => choice.label === "슈미와 대화하기",
  );
  assert.ok(startAction);
  assert.deepEqual(startAction.loading, {durationMs:500,transitionType:"activity"});
  const elapsedBefore = initial.state.worldElapsedMs;
  const statsBefore = structuredClone(initial.state.stats);

  const opening = await service.performAction(session.id, startAction.action);
  assert.equal(opening.currentScene.title, "슈미와의 대화");
  assert.equal(opening.availableActions.length, 4);
  assert.equal(opening.availableActions.at(-1)?.label, "대화를 마친다");
  assert.ok(
    opening.availableActions.slice(0, 3).every(
      (choice) =>
        !choice.postChoiceNarrative && Boolean(choice.choiceThought) &&
        choice.loading !== undefined,
    ),
  );
  assert.equal(opening.availableActions.at(-1)?.loading?.durationMs, 500);
  assert.equal(opening.state.worldElapsedMs, elapsedBefore);
  assert.deepEqual(opening.state.stats, statsBefore);
  assert.equal(generationInputs[0]?.visitCount, 1);
  assert.equal(generationInputs[0]?.selectedChoice, null);

  const firstAnswer = opening.availableActions[0]!;
  const next = await service.performAction(session.id, firstAnswer.action);
  assert.equal(next.state.npcDialogue.active?.turnNumber, 1);
  assert.equal(next.availableActions.length, 4);
  assert.equal(next.state.worldElapsedMs, elapsedBefore);
  assert.deepEqual(next.state.stats, statsBefore);
  assert.deepEqual(
    generationInputs[1]?.selectedChoice?.thought,
    firstAnswer.choiceThought,
  );

  await assert.rejects(
    () => service.performAction(session.id, {
      type: "travel",
      targetId: "shelter",
    }),
    /대화를 먼저 마쳐야/,
  );
  await assert.rejects(
    () => service.performAction(session.id, {
      ...firstAnswer.action,
      type: "npc_dialogue",
      command: "choose",
      npcId: "shumi",
      turnNumber: 0,
    }),
    /이미 지난 대화 선택지/,
  );

  const leaveAction = next.availableActions.at(-1)!;
  const returned = await service.performAction(session.id, leaveAction.action);
  assert.equal(returned.state.npcDialogue.active, null);
  assert.equal(returned.state.flags.intro_seen_subway, true);
  assert.equal(returned.state.sceneId, "subway_repeat_intro");
  assert.ok(
    returned.currentScene.paragraphs.every(
      (paragraph) => !paragraph.startsWith("지하철역 입구는 낮에도 밤처럼"),
    ),
  );
  assert.ok(
    returned.availableActions.some(
      (choice) => choice.label === "슈미와 대화하기",
    ),
  );
  assert.match(returned.currentScene.paragraphs.join(" "),/대화를 마친다/);
  const reloaded=await service.getState(session.id);assert.deepEqual(reloaded.currentScene.paragraphs,returned.currentScene.paragraphs);assert.equal(generationInputs.length,2);
  const persisted = store.read();
  assert.equal(
    persisted.state.npcDialogue.conversations.shumi?.visitCount,
    1,
  );
  assert.equal(
    persisted.state.npcDialogue.conversations.shumi?.exchanges.length,
    2,
  );

  const revisitAction = returned.availableActions.find(
    (choice) => choice.label === "슈미와 대화하기",
  )!;
  await service.performAction(session.id, revisitAction.action);
  assert.equal(generationInputs[2]?.visitCount, 2);
  assert.equal(generationInputs[2]?.memory.exchanges.length, 2);
  assert.equal(generationInputs[2]?.turnNumber, 2);
  assert.equal(store.generationLogs.at(-1)?.kind, "npcDialogue");
});

test("기존 저장 상태에는 빈 NPC 대화 상태가 자동으로 추가된다", () => {
  const legacy = structuredClone(createInitialGameState()) as
    unknown as Record<string, unknown>;
  delete legacy.npcDialogue;

  const parsed = GameStateSchema.parse(legacy);
  assert.deepEqual(parsed.npcDialogue, {
    active: null,
    conversations: {},
  });
});
