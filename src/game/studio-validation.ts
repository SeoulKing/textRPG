import { z } from "zod";
import type { Effect } from "./schemas/condition-effect";
import { getEffectiveContentStudioDocument, buildWorldRegistryFromStudio, validateRegistry } from "./data/registry";
import { parseContentStudioDocument, type ContentStudioDocument } from "./content-studio";

export type StudioIssue = { severity: "error" | "warning"; tab: string; id: string; sceneId?: string; choiceId?: string; message: string };
export function inspectStudio(input: unknown) {
  const issues: StudioIssue[] = [];
  let document: ContentStudioDocument;
  try { document = getEffectiveContentStudioDocument(parseContentStudioDocument(input)); }
  catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(i => `${i.path.join(" / ")}: ${i.message}`).join("\n") : String(error);
    return { issues: [{ severity: "error", tab: "stories", id: "", message }] as StudioIssue[] };
  }
  const locations = new Set(document.locations.map(l => l.id));
  const people = new Set(document.people.map(p => p.id));
  const stories = new Map(document.stories.map(s => [s.id, s]));
  const scenes = new Map(document.stories.flatMap(s => s.scenes.map(scene => [scene.id, { story: s, scene }] as const)));
  const choices = new Set(document.stories.flatMap(s => s.scenes.flatMap(scene => scene.choices.map(c => c.id))));
  const items = new Set(document.items.map(i => i.id));
  const coordinates = new Map<string, string>();
  const issue = (target: Omit<StudioIssue, "message" | "severity">, message: string, severity: StudioIssue["severity"] = "error") => issues.push({ ...target, message, severity });
  for (const location of document.locations) {
    const target = { tab: "locations", id: location.id };
    if (!location.name.trim()) issue(target, "지역 이름을 입력해 주세요.");
    if (location.mapPosition) {
      const key = `${location.tags.find(tag => tag.startsWith("realm:")) ?? "realm:seoul"}:${location.mapPosition.q},${location.mapPosition.r}`;
      if (coordinates.has(key)) issue(target, `지도 위치가 '${coordinates.get(key)}' 지역과 겹칩니다.`);
      coordinates.set(key, location.name);
    }
    for (const id of new Set([...location.neighbors, ...Object.keys(location.links)])) if (!locations.has(id)) issue(target, "연결한 지역이 삭제되었거나 존재하지 않습니다.");
    if (![...scenes.values()].some(s => s.scene.locationId === location.id)) issue(target, "지역에 첫 장면을 추가해 주세요.");
  }
  for (const person of document.people) {
    if (!person.name.trim()) issue({ tab: "people", id: person.id }, "캐릭터 이름을 입력해 주세요.");
    if (!locations.has(person.locationId)) issue({ tab: "people", id: person.id }, "캐릭터가 머무를 지역을 선택해 주세요.");
  }
  function references(value: unknown, target: Omit<StudioIssue, "message" | "severity">) {
    if (Array.isArray(value)) return value.forEach(v => references(v, target));
    if (!value || typeof value !== "object") return;
    for (const [key, val] of Object.entries(value)) {
      const known = key === "itemId" ? items : key === "speakerId" ? new Set([...people, "protagonist"]) : key === "nextSceneId" || key === "sceneId" ? scenes : key === "nextStoryId" || key === "storyId" ? stories : key === "locationId" ? locations : null;
      if (typeof val === "string" && val && known && !known.has(val)) issue(target, `연결한 ${key === "itemId" ? "아이템" : key === "speakerId" ? "캐릭터" : "콘텐츠"} '${val}'을 찾을 수 없습니다.`);
      if (key === 'sceneIds' && Array.isArray(val)) for (const sceneId of val) if (typeof sceneId === 'string' && !scenes.has(sceneId)) issue(target, '장면 묶음의 원고를 찾을 수 없습니다: ' + sceneId);
      references(val, target);
    }
  }
  for (const story of document.stories) {
    const target = { tab: "stories", id: story.id };
    if (!story.title.trim()) issue(target, "이벤트 제목을 입력해 주세요.");
    if (!story.scenes.length && story.native !== "region") issue(target, "시작 장면을 추가해 주세요.");
    if (story.prerequisite?.choiceId && !choices.has(story.prerequisite.choiceId)) issue(target, "이전에 한 선택의 연결이 끊어졌습니다.");
    references(story.conditions, target); references(story.prerequisite, target); references(story.actions, target);
    for (const personId of story.personIds) if (!people.has(personId)) issue(target, "등장인물의 연결이 끊어졌습니다.");
    for (const scene of story.scenes) {
      const st = { ...target, sceneId: scene.id };
      if (!story.native && !(scene.blocks ? scene.blocks.some(b => b.text.trim()) : scene.paragraphs.some(p => p.trim()))) issue(st, "장면의 원고를 작성해 주세요.");
      references(scene.blocks, st); references(scene.conditions, st);
      for (const choice of scene.choices) {
        const ct = { ...st, choiceId: choice.id };
        if (!choice.label.trim()) issue(ct, "선택지 문구를 입력해 주세요.");
        references(choice, ct);
        const next = choice.nextSceneId ? scenes.get(choice.nextSceneId) : null;
        if (next && next.scene.locationId !== scene.locationId && !choice.effects.some(e => e.type === "travel" && e.locationId === next.scene.locationId)) issue(ct, "다른 지역의 장면은 '다음 이벤트'로 연결하거나 이동 효과를 추가해 주세요.");
        if (choice.nextStoryId && stories.get(choice.nextStoryId)?.enabled === false) issue(ct, "비활성 이벤트로 연결되어 있습니다.");
      }
    }
    if (!story.native && story.scenes.length) {
      const reached = new Set<string>(); const visit = (id: string) => {
        if (reached.has(id)) return; reached.add(id);
        scenes.get(id)?.scene.choices.forEach(c => {
          if (c.nextSceneId) visit(c.nextSceneId);
          const visitEffects = (effects: Effect[]) => effects.forEach(effect => {
            if (effect.type === "set_scene") visit(effect.sceneId);
            if (effect.type === "set_random_scene") {
              const ids = effect.sceneIds ?? [...scenes.values()].filter(row => row.scene.tags?.includes(effect.tag)).map(row => row.scene.id);
              ids.forEach(visit);
            }
            if (effect.type === "random_outcome") effect.outcomes.forEach(outcome => visitEffects(outcome.effects));
          });
          visitEffects(c.effects);
        });
      };
      visit(story.scenes[0].id);
      story.scenes.filter(s => !reached.has(s.id)).forEach(s => issue({ ...target, sceneId: s.id }, "시작 장면에서 도달하는 연결이 없습니다.", "warning"));
      story.scenes.filter(s => !s.terminal && !s.choices.length).forEach(s => issue({ ...target, sceneId: s.id }, "선택지 또는 종료 설정을 추가해 주세요."));
    }
  }
  references(document.recipes, { tab: "recipes", id: "" });
  try { validateRegistry(buildWorldRegistryFromStudio(document)); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/(?:story|scene|choice|location|action|event):([^\s:]+)/);
    const id = match?.[1] ?? "";
    const story = document.stories.find(s => s.id === id || s.scenes.some(sc => sc.id === id || sc.choices.some(c => c.id === id)) || s.actions.some(a => a.id === id));
    issue({ tab: story ? "stories" : "locations", id: story?.id ?? id, sceneId: story?.scenes.find(sc => sc.id === id || sc.choices.some(c => c.id === id))?.id }, `콘텐츠 연결을 확인해 주세요: ${message}`);
  }
  return { document, issues };
}
