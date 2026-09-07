import type { GameState } from "../schemas";
import type { TextWorld, WorldAction } from "../schemas/text-world";
import { adjacentZones, hasDoorKey, carriesLight, illuminated, particle, portalBetween, worldRooms, visibleEntities, entityDetails } from "./world";

export type WorldOption = { id: string; label: string; hint: string; actions: WorldAction[]; importance: "major" | "minor" };
export function worldOptions(world: TextWorld, state: GameState): WorldOption[] {
  if (!world.active || state.isGameOver || state.stageClear) return [];
  const options: WorldOption[] = [];
  const add = (id: string, label: string, actions: WorldAction[], hint: string, importance: WorldOption["importance"] = "major") => options.push({ id, label, actions, hint, importance });
  const posture = (value: "standing" | "crouching"): WorldAction[] => world.player.posture === value ? [] : [{ type: "POSTURE", posture: value }];
  const approach = (id: string, value: "standing" | "crouching" = "standing"): WorldAction[] => [
    ...(world.player.near === id ? [] : [...posture("standing"), { type: "MOVE" as const, target: id }]),
    ...(world.player.near !== id && value === "crouching" ? [{ type: "POSTURE" as const, posture: value }] : world.player.near === id ? posture(value) : []),
  ];
  const visible = visibleEntities(world);
  for (const e of visible.filter(e => e.components.container)) {
    const c = e.components, observed = world.observations[e.id];
    if (observed?.blocked && c.openable?.locked) continue;
    const contentsKnown = observed?.stages.includes("interior");
    const remaining = c.container!.items.filter(id => world.entities[id]?.components.position.zone === e.id);
    if (remaining.length && contentsKnown) {
      const names = remaining.map(id => world.entities[id].name).join("과 ");
      add("collect:" + e.id, particle(names, "을", "를") + " 챙긴다",
        [...approach(e.id, "crouching"), ...(!c.openable?.isOpen ? [{ type: "OPEN" as const, target: e.id }] : []), ...remaining.map(target => ({ type: "TAKE" as const, target }))], "발견한 물건 수집");
    } else if (!contentsKnown && !observed?.collected && !(observed?.blocked && c.openable?.locked)) {
      add("explore:" + e.id, particle(e.name, "을", "를") + (c.openable?.isOpen ? " 들여다본다" : " 열어 안을 확인한다"),
        [...approach(e.id, "crouching"), { type: "INSPECT", target: e.id }, ...(!c.openable?.isOpen ? [{ type: "OPEN" as const, target: e.id }] : [])], "내부 탐색");
    }
  }
  const lamp = visible.find(e => e.components.light);
  for (const light of visible.filter(e => e.components.light)) {
    const held = light.components.position.zone === "player";
    if (!held && light.components.portable) {
      add("equip:" + light.id, entityDetails(world, light).placement + "의 " + particle(light.name, "을", "를") + " 집어 들어 켠다",
        [...approach(light.id), { type: "INSPECT", target: light.id }, { type: "TAKE", target: light.id }, ...(!light.components.light!.on ? [{ type: "LIGHT" as const, target: light.id }] : [])], "조명 휴대");
    } else if (!light.components.light!.on || !held) {
      add("light:" + light.id, particle(light.name, "을", "를") + (light.components.light!.on ? " 끈다" : " 켠다"),
        [...(held ? [] : approach(light.id)), { type: "LIGHT", target: light.id }], "조명 조작", !light.components.light!.on && !illuminated(world, world.player.zone) ? "major" : "minor");
    }
  }
  for (const entity of visible.filter(e => !e.components.container && !e.components.portal && !e.components.light && !world.entities[e.components.position.zone])) {
    if (entity.components.portable && entity.components.position.zone !== "player") {
      add("take:" + entity.id, particle(entity.name, "을", "를") + " 챙긴다", [...approach(entity.id), { type: "TAKE", target: entity.id }], "물건 수집");
    } else if (entity.components.position.zone !== "player" && !world.observations[entity.id]?.inspected && (!world.observations[entity.id]?.stages.includes("surface") || Object.values(world.entities).some(e => e.components.discovery?.inspectTargetId === entity.id))) {
      add("inspect:" + entity.id, particle(entity.name, "을", "를") + " 자세히 살핀다", [...approach(entity.id, entity.id === "floor" ? "crouching" : "standing"), { type: "INSPECT", target: entity.id }], "살펴보기");
    }
  }
  if (illuminated(world, world.player.zone) && world.player.zone !== "office" && !world.observations["zone:" + world.player.zone]?.stages.includes("surface")) {
    add("survey:" + world.player.zone, "빛을 움직여 벽과 바닥을 살핀다", [{ type: "SURVEY" }], "통로와 배치 확인");
  }
  for (const next of adjacentZones(world.player.zone, world)) {
    const portal = portalBetween(world, world.player.zone, next);
    if (portal?.components.openable?.locked) {
      if (hasDoorKey(world, state, portal)) {
        add("unlock:" + portal.id, "열쇠로 " + particle(portal.name, "을", "를") + " 연다",
          [...approach(portal.id), { type: "UNLOCK", target: portal.id }, { type: "OPEN", target: portal.id }], "잠금 해제");
      } else if (!world.observations[portal.id]?.blocked) {
        add("open:" + portal.id, particle(portal.name, "을", "를") + " 열어 본다",
          [...approach(portal.id), { type: "INSPECT", target: portal.id }, { type: "OPEN", target: portal.id }], "문 확인");
      }
      continue;
    }
    const carriedLamp = visible.find(e => e.components.light && e.components.position.zone === "player");
    const prepareLight = !worldRooms(world)[next].light && !illuminated(world, next) && !carriesLight(world) ? carriedLamp : undefined;
    const accessible = Boolean(prepareLight) || worldRooms(world)[next].light || carriesLight(world) || illuminated(world, next) || world.visitedZones.includes(next);
    if (portal?.components.openable && !portal.components.openable.isOpen && !accessible) {
      add("open:" + portal.id, particle(portal.name, "을", "를") + " 열어 길을 확인한다", [...approach(portal.id), { type: "INSPECT", target: portal.id }, { type: "OPEN", target: portal.id }], "복도 입구 확인");
    } else if (accessible) {
      const opening = portal?.components.openable && !portal.components.openable.isOpen;
      add("travel:" + next, (prepareLight ? particle(prepareLight.name, "을", "를") + " 켜고 " : "") + (opening ? particle(portal!.name, "을", "를") + " 열고 " : "") + (worldRooms(world)[next].name.split(" · ").at(-1)) + (next === "office" ? "로 돌아간다" : "로 이동한다"),
        [...posture("standing"), ...(prepareLight ? [{ type: "LIGHT" as const, target: prepareLight.id }] : []), ...(opening ? [...(world.player.near === portal.id ? [] : [{ type: "MOVE" as const, target: portal.id }]), { type: "OPEN" as const, target: portal.id }] : []), { type: "MOVE", target: next }], next === "office" || next === "corridor" && world.player.zone === "storage" ? "귀환" : "구역 이동", world.visitedZones.includes(next) && !opening ? "minor" : "major");
    }
  }
  // Keep a real exit in view; offer only available intentions without recap filler.
  const tail: WorldOption[] = [];
  if (world.player.zone === "office") tail.push({ id: "leave", label: "대합실로 돌아간다", hint: "탐색 마치기", actions: [...posture("standing"), { type: "LEAVE" }], importance: "minor" });
  if (lamp?.components.position.zone === "player" && lamp.components.light?.on && options.length + tail.length < 5) {
    add("light:" + lamp.id, "손에 든 " + particle(lamp.name, "을", "를") + " 끈다", [{ type: "LIGHT", target: lamp.id }], "조명 끄기", "minor");
  }
  // Collection and new exploration rank first. Travel remains present in these authored zones.
  const score = (option: WorldOption) => option.id.startsWith("collect:") ? 200 + (option.id.endsWith(":" + world.player.near) ? 20 : 0)
    : option.id.startsWith("unlock:") ? 150 : option.id.startsWith("take:") ? 110 : option.id.startsWith("equip:") ? 100 : option.id.startsWith("explore:") ? 80
    : option.id.startsWith("travel:") ? 70 : option.id.startsWith("open:") ? 65 : option.id.startsWith("survey:") ? 60 : option.id.startsWith("inspect:") ? 75 : 10;
  const ranked = options.sort((a, b) => score(b) - score(a));
  const routeOut = world.player.zone === "office" ? undefined : ranked.find(o => o.id === (world.player.zone === "storage" ? "travel:corridor" : "travel:office"));
  const selected = ranked.filter(o => o !== routeOut).slice(0, 5 - tail.length - (routeOut ? 1 : 0));
  return [...selected, ...(routeOut ? [routeOut] : []), ...tail];
}
