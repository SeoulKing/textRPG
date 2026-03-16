import type { EventDefinition } from "../schemas";

export const eventDefinitions: EventDefinition[] = [
  {
    id: "prologue_event",
    locationId: "shelter",
    title: "프롤로그",
    summary: "살아남겠다고 마음먹는 순간부터, 노파의 방문과 거처의 첫인상까지 이어지는 초반 이벤트.",
    startSceneId: "prologue_opening",
    sceneIds: ["prologue_opening", "prologue_old_woman_visit", "shelter_first_intro"],
    triggerConditions: [],
    choiceIds: [],
    once: true,
    priority: 100,
  },
];
