import type { ContentRegistry, GameState } from "./schemas";
import { arcanaAcademyLocation } from "./data/regions/arcana-academy/location";
import { academyChoices } from "./data/regions/arcana-academy/choices";
import { academyScenes } from "./data/regions/arcana-academy/scenes";
import { academyPeople } from "./data/regions/arcana-academy/people";
import { academyQuests } from "./data/regions/arcana-academy/quests";
import { baseItems } from "./data/items";

/** Upgrade the old empty school in published Studio documents and pinned saves, without changing their archived content. */
export function withAcademyContent(registry: ContentRegistry): ContentRegistry {
  const school = registry.locations.arcana_academy;
  if (registry.scenes.arcana_academy_intro?.tags?.includes("academy:content-v2") && school
    && registry.choices.academy_accept_observatory?.nextSceneId === "academy_observatory_accepted"
    && academyScenes.every(scene => registry.scenes[scene.id]) && academyChoices.every(choice => registry.choices[choice.id])
    && academyQuests.every(quest => registry.quests[quest.id])
    && Object.keys(academyPeople).every(id => registry.people[id] && school.residentIds.includes(id))
    && arcanaAcademyLocation.obtainableItemIds.every(id => registry.items[id] && school.obtainableItemIds.includes(id))
    && arcanaAcademyLocation.neighbors.every(id => registry.locations[id]?.neighbors.includes("arcana_academy"))) return registry;
  const locations = { ...registry.locations }, people = { ...registry.people }, scenes = { ...registry.scenes };
  const choices = { ...registry.choices }, quests = { ...registry.quests }, items = { ...registry.items };
  for (const person of Object.values(academyPeople)) people[person.id] ??= structuredClone(person);
  for (const choice of academyChoices) {
    const legacyAcceptance = choice.id === "academy_accept_observatory" && choices[choice.id]?.nextSceneId === "academy_observatory";
    if (!choices[choice.id] || legacyAcceptance) choices[choice.id] = structuredClone(choice);
  }
  for (const scene of academyScenes) {
    const existing = scenes[scene.id];
    const emptyIntro = scene.id === "arcana_academy_intro" && existing?.choiceIds.length === 1 && existing.choiceIds[0] === "leave_arcana_place";
    if (!existing || emptyIntro || existing.tags?.includes("academy:content-v1")) scenes[scene.id] = structuredClone(scene);
  }
  for (const quest of academyQuests) quests[quest.id] ??= structuredClone(quest);
  for (const id of arcanaAcademyLocation.obtainableItemIds) items[id] ??= structuredClone(baseItems[id as keyof typeof baseItems]);
  const previous = locations.arcana_academy ?? arcanaAcademyLocation;
  locations.arcana_academy = { ...previous,
    summary: previous.summary.includes("푸른 첨탑과 천문 관측탑") ? arcanaAcademyLocation.summary : previous.summary,
    residentIds: [...new Set([...previous.residentIds, ...Object.keys(academyPeople).filter(id => (people[id] as { locationId?: string } | undefined)?.locationId === "arcana_academy")])],
    obtainableItemIds: [...new Set([...previous.obtainableItemIds, ...arcanaAcademyLocation.obtainableItemIds])],
  };
  for (const id of arcanaAcademyLocation.neighbors) {
    const neighbor = locations[id];
    if (neighbor && !neighbor.neighbors.includes("arcana_academy")) locations[id] = { ...neighbor,
      neighbors: [...neighbor.neighbors, "arcana_academy"], links: { ...neighbor.links, arcana_academy: { note: "학교 앞뜰로 이어지는 돌길을 따라간다." } } };
  }
  return { ...registry, locations, people, scenes, choices, quests, items };
}

export function academyKnownFacts(state: GameState): string[] {
  if (state.location !== "arcana_academy") return [];
  const facts: [string, string, string][] = [
    ["academy_enrolled", "플레이어는 청강생으로 등록했다.", "플레이어는 아직 청강 등록을 하지 않았다."],
    ["academy_stella_met", "플레이어와 스텔라는 서로 소개하고 친구가 되기로 했다.", "플레이어와 스텔라는 아직 서로 소개하지 않았다."],
    ["academy_stella_partner", "스텔라와 함께 공책을 살피고 다음에도 같이 공부하기로 했다.", "스텔라와 공부 약속이나 동행을 정한 적은 없다."],
    ["academy_practical_passed", "플레이어는 학교 수정의 제어 실습을 통과했다.", "플레이어는 제어 실습을 아직 통과하지 않았다."],
    ["academy_orientation_complete", "첫 수업 결과를 교장에게 보고하고 보상을 받았다.", "첫 수업 완료 보고와 보상 수령은 아직 하지 않았다."],
    ["academy_observatory_accepted", "관측탑 점검 의뢰를 수락했다.", "관측탑 의뢰는 아직 수락하지 않았다."],
    ["academy_observatory_repaired", "관측탑의 고리를 맞춰 관측등을 다시 켰다.", "관측탑을 수리한 적은 아직 없다."],
    ["academy_observatory_reported", "노엘에게 관측탑을 보고하고 보상을 받았다.", "관측탑 결과 보고와 보상 수령은 아직 하지 않았다."],
  ];
  return facts.map(([flag, yes, no]) => state.flags[flag] ? yes : no);
}