import type { TextWorld } from "../schemas/text-world";
import type { WorldOption } from "./choices";
import { interactionContext } from "./interaction-context";
import { visibleEntities, particle } from "./world";

export function focusOptions(world: TextWorld): WorldOption[] {
  const context = interactionContext(world), options: WorldOption[] = [];
  if (context.focusEntityId) options.push({ id: "defocus", label: world.entities[context.focusEntityId].name + "에서 시선을 돌린다", hint: "주변 탐색", actions: [{ type: "DEFOCUS" }], importance: "minor" });
  else if (context.mode === "MANIPULATE") options.push({ id: "defocus", label: "물건에서 시선을 떼고 주변을 살핀다", hint: "주변 탐색", actions: [{ type: "DEFOCUS" }], importance: "minor" });
  for (const entity of visibleEntities(world)) {
    if (entity.id === context.focusEntityId || entity.components.position.zone === "player" && !entity.components.container || world.entities[entity.components.position.zone]) continue;
    const c = entity.components, known = world.observations[entity.id];
    if (c.position.zone === "player") {
      options.push({ id: "focus:" + entity.id, label: particle(entity.name, "을", "를") + " 살핀다", hint: "휴대 용기 살펴보기", actions: [{ type: "FOCUS", target: entity.id }], importance: "minor" });
      continue;
    }
    if (c.resourceSite?.remaining === 0 && !c.resourceSite.recoveryMinutes && known?.inspected) continue;
    if ((known?.inspected || known?.stages.includes("interior")) && !c.container?.items.length && !c.openable && !c.light && !c.physical?.movable && c.physical?.supportCapacity === undefined && !c.portal && !c.resourceSite && !c.interactionPoint) continue;
    options.push({ id: "focus:" + entity.id, label: particle(entity.name, "으로", "로") + (world.player.near === entity.id ? " 다시 시선을 모은다" : " 다가간다"), hint: "관심 대상 변경", actions: [{ type: world.player.near === entity.id ? "FOCUS" : "MOVE", target: entity.id }], importance: "minor" });
  }
  return options;
}
