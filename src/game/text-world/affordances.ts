import type { GameState, ItemCard } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import type { WorldOption } from "./choices";
import { handledEntityId, isHeld } from "./hands";
import { resolveWorldActions } from "./engine";
import { visibleEntities, particle } from "./world";
import { availableToolProfiles, toolTechniques, type ToolTechnique } from "./tool-rules";
import { buildRuntimeRegistry } from "../runtime-registry";

/** Compose source/target capabilities. No room ID, object ID or bespoke puzzle handler is required. */
export function interactionOptions(world: TextWorld, state: GameState): WorldOption[] {
  const visible = visibleEntities(world), offered: WorldOption[] = [];
  const tools = availableToolProfiles(state);
  const approach = (target: string): WorldAction[] => world.player.near === target ? [] : [
    ...(world.player.posture === "crouching" ? [{ type: "POSTURE" as const, posture: "standing" as const }] : []), { type: "MOVE", target },
  ];
  const add = (id: string, label: string, hint: string, actions: WorldAction[], importance: "major" | "minor" = "major") => {
    const projected = structuredClone(world), projectedState = structuredClone(state);
    projected.events = [];
    if (state.location === "subway") projectedState.textWorld = projected;
    else projectedState.locationTextWorlds[state.location] = projected;
    const outcome = resolveWorldActions(projected, projectedState, actions, { advanceTime: false });
    // Tool work may reveal contents; that is its final decision boundary, not a failure.
    if (!outcome.interrupted && (!outcome.discovery || actions.at(-1)?.type === "USE_TOOL")) offered.push({ id, label, hint, actions, importance });
  };
  for (const source of visible) {
    const c = source.components, known = world.observations[source.id];
    if (c.structure?.repair && c.structure.integrity < c.structure.maxIntegrity && known?.stages.includes("surface")) {
      const recipe = c.structure.repair, registry = buildRuntimeRegistry(state);
      const requirements = recipe.materials.map(cost => `${(registry.items[cost.itemId] as ItemCard | undefined)?.name ?? cost.itemId} ${cost.amount}`).join(" · ");
      const methods = recipe.tool ? tools.filter(tool => (tool.toolCapabilities?.[recipe.tool!.capability] ?? 0) >= recipe.tool!.power) : [undefined];
      for (const tool of methods) add("repair:" + source.id + (tool ? ":" + tool.id : ""), particle(source.name, "을", "를") + " 수리한다",
        requirements + ` · 조작 ${recipe.seconds}초 · 기력 ${recipe.energy}` + (tool?.maxDurability ? ` · ${tool.name} 내구도 1` : ""),
        [...approach(source.id), { type: "REPAIR", target: source.id, ...(tool ? { toolItemId: tool.id } : {}) }]);
    }
    if (c.structure?.integrity && known?.stages.includes("surface")) for (const tool of tools) {
      for (const technique of Object.keys(tool.toolCapabilities ?? {}) as ToolTechnique[]) {
        const method = toolTechniques[technique];
        const verb = technique === "pry" ? "의 잠금장치를 벌려 연다" : technique === "cut" ? "의 구조를 잘라 낸다" : "에 충격을 가한다";
        add("tool:" + tool.id + ":" + source.id + ":" + technique, particle(tool.name, "으로", "로") + " " + source.name + verb,
          "조작 " + method.seconds + "초 · 기력 " + method.energy + (tool.maxDurability ? " · 내구도 " + method.wear : "") + " · " + (technique === "cut" ? "작은 소음" : "큰 소음"),
          [...approach(source.id), { type: "USE_TOOL", target: source.id, toolItemId: tool.id, technique }]);
      }
    }
    if (c.portal && c.openable?.isOpen) add("close:" + source.id, particle(source.name, "을", "를") + " 닫는다", "통로 닫기", [...approach(source.id), { type: "CLOSE", target: source.id }], "minor");
    if (c.physical?.movable && (known?.inspected || known?.collected)) {
      for (const target of visible.filter(e => e.components.portal || e.id !== source.id && e.components.position.zone === world.player.zone && e.components.physical?.supportCapacity !== undefined)) {
        const releasing = c.position.relativeTo === target.id && c.position.relation === "blocking";
        if (target.components.portal && !releasing && !(c.position.relativeTo === target.id && c.position.relation === "beside")) add("push:" + source.id + ":" + target.id + ":beside", particle(source.name, "을", "를") + " " + target.name + " 옆으로 민다", "사물 배치 변경", [...approach(source.id), { type: "PUSH", target: source.id, destination: target.id, relation: "beside" }]);
        const relation = releasing || !target.components.portal ? "beside" : "blocking";
        if (c.position.relativeTo === target.id && c.position.relation === relation) continue;
        add("push:" + source.id + ":" + target.id + ":" + relation, particle(source.name, "을", "를") + (releasing ? " 옆으로 밀어 길을 비운다" : " " + target.name + (relation === "blocking" ? " 앞으로 민다" : " 옆으로 민다")), releasing ? "통로 확보" : "사물 배치 변경", [...approach(source.id), { type: "PUSH", target: source.id, destination: target.id, relation }]);
      }
    }
    if (c.position.relation === "blocking" && c.physical?.opaque && (known?.inspected || known?.collected)) {
      if (world.player.coverId === source.id && world.player.relation === "behind") add("emerge:" + source.id, source.name + " 뒤에서 몸을 일으켜 나온다", "시야 확보", [{ type: "POSTURE", posture: "standing" }, { type: "MOVE", target: source.id }], "minor");
      else add("hide:" + source.id, source.name + " 뒤로 몸을 낮춰 살핀다", "가림과 시야", [...approach(source.id), { type: "HIDE", target: source.id }]);
    }
    if (c.openable && known?.stages.includes("interior") && !c.openable.locked && !c.portal && (c.physical || c.container?.items.some(id => world.entities[id]?.components.light))) {
      const type = c.openable.isOpen ? "CLOSE" : "OPEN";
      add("lid:" + source.id, particle(source.name, "을", "를") + (type === "CLOSE" ? " 닫는다" : " 다시 연다"), "내부 가림 변경", [...approach(source.id), { type, target: source.id }], "minor");
    }
    if (c.portable && c.position.zone === "player" && !(c.light && c.portable.itemId)) {
      if (handledEntityId(world) !== source.id) add("hold:" + source.id, particle(source.name, "을", "를") + (isHeld(world, source.id) ? " 손에 고쳐 쥔다" : " 꺼내 손에 든다"), "휴대 물건 조작", [{ type: "HOLD", target: source.id }], "minor");
      if (!isHeld(world, source.id)) continue;
      add("stow:" + source.id, particle(source.name, "을", "를") + (c.light?.on ? " 끄고 챙겨 둔다" : " 챙겨 둔다"), "소지품 유지 · 손 비우기", [{ type: "STOW", target: source.id }], "minor");
      // The catalogue exposes every compatible destination; the director recommends the current focus.
      for (const target of visible.filter(e => e.id !== source.id && (e.components.container || e.components.physical?.supportCapacity !== undefined))) {
        for (const relation of ["inside", "on"] as const) {
          add("put:" + source.id + ":" + target.id + ":" + relation, particle(source.name, "을", "를") + " " + target.name + (relation === "inside" ? " 안에 넣는다" : " 위에 놓는다"), relation === "inside" ? "물건 담기" : "물건 내려놓기", [...approach(target.id), ...(handledEntityId(world) !== source.id ? [{ type: "HOLD" as const, target: source.id }] : []), { type: "PUT", target: source.id, destination: target.id, relation }]);
        }
      }
      add("drop:" + source.id, particle(source.name, "을", "를") + " 지금 자리 옆에 내려놓는다", "물건 내려놓기", [{ type: "DROP", target: source.id }]);
    }
  }
  const pending = visible.some(e => e.components.openable?.isOpen && e.components.openable.remainingOpenSeconds !== undefined || e.components.light?.on && e.components.light.fuelSeconds !== undefined);
  if (pending) add("wait", "잠시 기다리며 주변의 변화를 살핀다", "5초 경과", [{ type: "WAIT", durationSeconds: 5 }], "minor");
  return offered;
}
