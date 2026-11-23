import type { GameState } from "./schemas";
import { appendLogEntry } from "./state-utils";

export const SLIME_QUEST_ID = "arcana_inn_slimes";
export const FISH_QUEST_ID = "arcana_inn_supper";
const FISH_QUEST_REWARD = 5;
export function slimeQuestProgress(state: GameState): number {
  return Math.min(10, Math.max(0, Number(state.flags.arcana_inn_slime_kills) || 0));
}
export function awardSlimeLoot(state: GameState) {
  const rewards = { slimeMucus: 1, money: 0, xp: 0 };
  state.inventory.slimeMucus = (state.inventory.slimeMucus ?? 0) + rewards.slimeMucus;
  if (state.quests[SLIME_QUEST_ID] === "active") state.flags.arcana_inn_slime_kills = Math.min(10, slimeQuestProgress(state) + 1);
  return rewards;
}
export function performSlimeQuest(state: GameState, claim: boolean) {
  if (state.location !== "arcana_inn" || state.arcanaCombat.battle) throw new Error("전투를 마친 뒤 여관 주인에게 이야기해 주세요.");
  const status = state.quests[SLIME_QUEST_ID];
  if (!claim) {
    if (status === "active" || status === "completed") throw new Error("이미 수락하거나 완료한 의뢰입니다.");
    state.quests[SLIME_QUEST_ID] = "active";
    state.flags.arcana_inn_slime_kills = 0;
    appendLogEntry(state, "여관 퀘스트판에서 마르텐의 슬라임 퇴치 의뢰를 받았다. 슬라임 10마리 처치 후 보고 · 보상 10골드");
    return;
  }
  if (status !== "active" || slimeQuestProgress(state) < 10) throw new Error("의뢰를 받은 뒤 슬라임 10마리를 처치해 주세요.");
  state.quests[SLIME_QUEST_ID] = "completed";
  state.money += 10;
  appendLogEntry(state, "마르텐에게 슬라임 10마리 처치를 보고했다. 의뢰 보상 +10골드");
}
export function performFishQuest(state: GameState, claim: boolean) {
  if (state.location !== "arcana_inn" || state.arcanaCombat.battle) {
    throw new Error("전투를 마친 뒤 여관 주인에게 이야기해 주세요.");
  }
  const status = state.quests[FISH_QUEST_ID];
  if (!claim) {
    if (status === "active" || status === "completed") throw new Error("이미 수락하거나 완료한 의뢰입니다.");
    state.quests[FISH_QUEST_ID] = "active";
    appendLogEntry(state, "마르텐의 저녁상 의뢰를 받았다. 여관에 민물고기 한 마리를 가져다주기로 했다.");
    return;
  }
  if (status !== "active") throw new Error("여관 의뢰판에서 저녁상 의뢰를 먼저 받아 주세요.");
  const fish = state.inventory.riverFish ?? 0;
  if (fish < 1) throw new Error("마르텐에게 건넬 민물고기 한 마리가 필요합니다.");
  if (fish === 1) delete state.inventory.riverFish;
  else state.inventory.riverFish = fish - 1;
  state.quests[FISH_QUEST_ID] = "completed";
  state.money += FISH_QUEST_REWARD;
  appendLogEntry(state, `마르텐에게 민물고기 한 마리를 건넸다. 의뢰 보상 +${FISH_QUEST_REWARD}골드`);
}

export function fishQuestCard(state: GameState) {
  const status = state.quests[FISH_QUEST_ID] ?? "inactive";
  const ownedAmount = Math.max(0, state.inventory.riverFish ?? 0);
  const readyToReport = status === "active" && ownedAmount >= 1;
  return {
    id: FISH_QUEST_ID,
    name: "마르텐의 저녁상",
    summary: "마르텐이 여관 손님에게 낼 민물고기 한 마리를 구합니다.",
    status,
    objectives: [],
    requirements: [{
      itemId: "riverFish",
      name: "민물고기",
      amount: 1,
      ownedAmount: status === "completed" ? 1 : ownedAmount,
      met: status === "completed" || ownedAmount >= 1,
      sourceHints: ["분수 광장 남서쪽 연못에서 낚을 수 있습니다."],
    }],
    readyToReport,
    reportTo: "여관 · 여관 주인 마르텐",
    rewardText: `${FISH_QUEST_REWARD}골드`,
    nextStep: status === "completed" ? "마르텐에게 민물고기를 건넸습니다."
      : status === "inactive" ? "여관 의뢰판에서 의뢰를 받으세요."
      : readyToReport ? "여관 접수대의 마르텐에게 민물고기를 건네세요."
      : "분수 광장 남서쪽 연못에서 민물고기 한 마리를 낚으세요.",
  };
}

export function slimeQuestCard(state: GameState) {
  const status = state.quests[SLIME_QUEST_ID] ?? "inactive";
  return {
    objectives: [{ name: "슬라임 처치", amount: 10, ownedAmount: status === "completed" ? 10 : slimeQuestProgress(state) }],
    readyToReport: status === "active" && slimeQuestProgress(state) >= 10,
    reportTo: "여관 · 여관 주인 마르텐", rewardText: "10골드",
    id: SLIME_QUEST_ID, name: "마르텐의 슬라임 퇴치", summary: "여관 주인의 의뢰 · 슬라임 10마리 처치 후 보고 · 보상 10골드", status,
    nextStep: status === "completed" ? "보상 10골드 수령 완료" : status === "inactive" ? "여관 퀘스트판에서 의뢰를 받으세요." : `슬라임 ${slimeQuestProgress(state)}/10마리 처치 · 여관 주인에게 보고하세요.` };
}
