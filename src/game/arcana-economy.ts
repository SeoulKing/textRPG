import type { GameState } from "./schemas";
import { appendLogEntry } from "./state-utils";

export const SLIME_QUEST_ID = "arcana_inn_slimes";
export function slimeQuestProgress(state: GameState): number {
  return Math.min(10, Math.max(0, Number(state.flags.arcana_inn_slime_kills) || 0));
}
export function awardSlimeLoot(state: GameState) {
  state.inventory.slimeMucus = (state.inventory.slimeMucus ?? 0) + 1;
  if (state.quests[SLIME_QUEST_ID] === "active") state.flags.arcana_inn_slime_kills = Math.min(10, slimeQuestProgress(state) + 1);
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
export function slimeQuestCard(state: GameState) {
  const status = state.quests[SLIME_QUEST_ID] ?? "inactive";
  return {
    objectives: [{ name: "슬라임 처치", amount: 10, ownedAmount: status === "completed" ? 10 : slimeQuestProgress(state) }],
    readyToReport: status === "active" && slimeQuestProgress(state) >= 10,
    reportTo: "여관 · 여관 주인 마르텐", rewardText: "10골드",
    id: SLIME_QUEST_ID, name: "마르텐의 슬라임 퇴치", summary: "여관 주인의 의뢰 · 슬라임 10마리 처치 후 보고 · 보상 10골드", status,
    nextStep: status === "completed" ? "보상 10골드 수령 완료" : status === "inactive" ? "여관 퀘스트판에서 의뢰를 받으세요." : `슬라임 ${slimeQuestProgress(state)}/10마리 처치 · 여관 주인에게 보고하세요.` };
}
