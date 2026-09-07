import { carriedByPlayer } from "./spatial";
import { isHeld } from "./hands";
import { interactionContext } from "./interaction-context";
import { directScene } from "./director";
import { audibleSounds } from "./simulation";
import type { NarrativeContext, TextWorld, WorldFact } from "../schemas/text-world";
import { entityDetails, illuminated, worldRooms, visibleEntities, particle } from "./world";

export function perceiveWorld(world: TextWorld): WorldFact[] {
  const facts: WorldFact[] = [], zone = world.player.zone;
  const add = (id: string, kind: string, data: Record<string, unknown>, targetId?: string) => facts.push({ id, kind, data, targetId });
  const lit = illuminated(world, zone);
  const placement = (e: TextWorld["entities"][string]) => e.components.portal && e.components.portal.to === zone ? worldRooms(world)[e.components.portal.from].name.split(" · ").at(-1) + "로 통하는 쪽" : entityDetails(world, e).placement.split(" / ")[0];
  add("light:" + zone, "lighting", { lit }, zone);
  if (lit) {
    const placements = visibleEntities(world).filter(e => e.components.position.zone === zone)
      .map(e => placement(e) + "에는 " + particle(e.name, "이", "가") + " 보인다.");
    const moved = Object.values(world.entities).some(e => e.components.position.zone === zone && e.components.position.relativeTo);
    const layout = [...(moved ? [] : [worldRooms(world)[zone].layout]), ...placements].join(" ");
    add("layout:" + zone, "layout", { layout, geometry: moved ? layout : worldRooms(world)[zone].layout }, zone);
    if (world.observations["zone:" + zone]?.stages.includes("surface")) add("surface:" + zone, "surface", { detail: worldRooms(world)[zone].surface }, zone);
  }
  for (const sound of audibleSounds(world)) add("sound:" + sound.id, "sound", sound, sound.sourceId);
  for (const [i, sensory] of (worldRooms(world)[zone].sensory ?? []).entries()) {
    const triggered = world.events.some(e => e.type === sensory.when || sensory.when === "ENTER" && e.type === "MOVE" && e.before.zone !== e.after.zone);
    if (triggered) add("ambient:" + zone + ":" + i, "sensory", { detail: sensory.detail }, zone);
  }
  for (const e of visibleEntities(world)) {
    const c = e.components;
    if (world.entities[c.position.zone]?.components.container && !c.container && c.position.relation !== "on") continue;
    const carried = c.position.zone === "player", held = isHeld(world, e.id), near = world.player.near === e.id;
    const discovered = world.events.some(event => Array.isArray(event.after.revealedIds) && event.after.revealedIds.includes(e.id));
    add("entity:" + e.id, "entity", { name: e.name, placement: held ? "손에 들고 있음" : carried ? "지니고 있음" : placement(e),
      isOpen: c.openable?.isOpen, locked: near ? c.openable?.locked : undefined, discovered, on: c.light?.on, held, carried, stowed: carried && !held }, e.id);
    if (c.resourceSite && near && world.observations[e.id]?.inspected) add("resource:" + e.id, "resource", {
      name: e.name, unlimited: c.resourceSite.unlimited, remaining: c.resourceSite.remaining, capacity: c.resourceSite.capacity,
      recoveryMinutes: c.resourceSite.recoveryMinutes, missingTools: c.resourceSite.missingTools ?? [],
    }, e.id);
    if (c.portal) add("connection:" + e.id, "connection", { name: e.name, from: worldRooms(world)[c.portal.from].name.split(" · ").at(-1), to: worldRooms(world)[c.portal.to].name.split(" · ").at(-1) }, e.id);
    if (lit && (near || held || discovered)) {
      add("surface:" + e.id, "surface", { name: e.name, detail: c.openable?.locked ? e.description.replace("잠금장치는 없다.", "잠겨 있다.") : e.description }, e.id);
      // Touch is offered only when this turn actually handles the object.
      if (entityDetails(world, e).touch && world.events.some(event => event.targetId === e.id && ["TAKE", "HOLD", "STOW", "UNLOCK", "OPEN", "CLOSE", "LIGHT"].includes(event.type)))
        add("touch:" + e.id, "sensory", { name: e.name, detail: entityDetails(world, e).touch }, e.id);
    }
    if (lit && (near || carriedByPlayer(world, e)) && (!c.openable || c.openable.isOpen || c.physical?.opaque === false) && c.container) {
      const items = visibleEntities(world).filter(item => c.container!.items.includes(item.id));
      add("contents:" + e.id, "contents", { name: e.name, items: items.map(item => ({ id: item.id, name: item.name, amount: item.components.portable?.amount ?? 1, unit: item.components.portable?.unit, detail: item.description })) }, e.id);
      if (entityDetails(world, e).interior) add("interior:" + e.id, "sensory", { name: e.name, detail: entityDetails(world, e).interior }, e.id);
    }
  }
  if (world.player.relation === "behind" && world.player.posture === "crouching") {
    const cover = world.entities[world.player.coverId ?? ""];
    if (cover?.components.position.relation === "blocking") add("cover:" + cover.id, "surface", { detail: cover.name + " 뒤로 몸을 낮춘 자리에서는 그 앞을 지나는 통로가 가려진다." }, cover.id);
  }
  for (const entity of visibleEntities(world).filter(e => e.components.portal && e.components.openable?.isOpen)) {
    const portal = entity.components.portal!, to = portal.from === zone ? portal.to : portal.from;
    if (!illuminated(world, to)) add("threshold:" + to, "threshold", { dark: true, from: zone, to, name: entity.name, destination: worldRooms(world)[to].name }, entity.id);
  }
  return facts;
}
export function directNarrative(world: TextWorld): NarrativeContext {
  const observations = perceiveWorld(world);
  const firstVisit = !world.visitedZones.includes(world.player.zone);
  const perceivedEvents = world.events.filter(event => event.witnessed !== false);
  const requiredFacts: WorldFact[] = perceivedEvents.map((event, i) => ({ id: "result:" + i, kind: "result", targetId: event.targetId, data: { ...event } }));
  const optionalFacts: WorldFact[] = [];
  const recap = world.lastIntent.id === "overview";
  const entered = world.events.some(e => e.type === "ENTER" || e.type === "MOVE" && e.before.zone !== e.after.zone);
  const currentIds = new Set(observations.map(f => f.id));
  const knownFacts = Object.values(world.knowledge).filter(k => !currentIds.has(k.fact.id)).map(k => ({ ...k.fact, data: { ...k.fact.data, previouslyObserved: true, currentlyVisible: false } }));
  for (const fact of observations) {
    const previous = world.knowledge[fact.id];
    const signature = JSON.stringify(fact.data);
    const changed = previous?.signature !== signature;
    const stage = fact.kind === "surface" ? "surface" : fact.kind === "contents" ? "interior" : fact.kind === "entity" ? "outline" : null;
    const stages = fact.targetId ? world.observations[fact.targetId]?.stages ?? [] : [];
    const newlyObserved = stage ? !stages.includes(stage) : !previous;
    const resourceStatusChanged = !previous || (Number(previous.fact.data.remaining) === 0) !== (Number(fact.data.remaining) === 0) || JSON.stringify(previous.fact.data.missingTools) !== JSON.stringify(fact.data.missingTools);
    const mandatory = (fact.kind === "resource" && (resourceStatusChanged || world.events.some(e => e.targetId === fact.targetId && e.type === "INSPECT"))) || (fact.id.startsWith("cover:") && changed) || (fact.kind === "entity" && fact.data.discovered === true) || (fact.kind === "layout" && (entered && firstVisit || newlyObserved || recap)) || (fact.kind === "contents" && (changed || newlyObserved || recap)) ||
      (fact.kind === "surface" && world.events.some(e => (newlyObserved && e.targetId === fact.targetId && e.type === "INSPECT") || (e.type === "SURVEY" && fact.targetId === world.player.zone))) ||
      (fact.kind === "lighting" && (changed || recap)) || (fact.kind === "threshold" && world.events.some(e => e.targetId === fact.targetId && e.type === "OPEN")) ||
      (fact.kind === "connection" && (recap || world.events.some(e => e.targetId === fact.targetId || e.type === "MOVE" && e.before.zone !== e.after.zone)));
    if (mandatory || recap && fact.kind === "entity") requiredFacts.push(fact);
    else if (fact.kind !== "layout" && (changed || (fact.kind === "sensory" && world.events.some(e => e.targetId === fact.targetId && ["OPEN", "INSPECT", "LIGHT"].includes(e.type))) || fact.data.held)) optionalFacts.push(fact);
    world.knowledge[fact.id] = { fact, signature, observedAt: world.elapsedSeconds };
    if (stage && fact.targetId) {
      world.observations[fact.targetId] ??= { stages: [], collected: false };
      if (!world.observations[fact.targetId].stages.includes(stage)) world.observations[fact.targetId].stages.push(stage);
    }
  }
  // A recap may mention remembered contents only as past knowledge, never as a fresh view through a closed lid.
  if (recap) for (const fact of knownFacts.filter(f => f.kind === "contents" && world.entities[f.targetId!]?.components.position.zone === world.player.zone)) requiredFacts.push(fact);
  if (firstVisit) world.visitedZones.push(world.player.zone);
  const held = world.player.heldToolId ? world.entities[world.player.heldToolId] : undefined;
  const anchors: Record<string, string> = { entrance: worldRooms(world)[world.player.zone].entryAnchor ?? (world.player.zone === "office" ? "대합실로 통하는 입구" : "이 방으로 들어온 입구"), "far-door": "역무실 안쪽 철문 앞", "office-end": "복도의 역무실 쪽 끝", "storage-end": "복도의 창고 쪽 끝", "far-wall": "입구 맞은편 벽", "far-end": "공간의 반대쪽 끝" };
  const near = world.player.near ? world.entities[world.player.near] : undefined;
  const positionLabel = world.player.relation === "behind" && world.player.coverId ? world.entities[world.player.coverId].name + " 뒤" : anchors[world.player.position] ?? (near ? entityDetails(world, near).placement + "의 " + near.name + " 앞" : "현재 자리");
  const facingLabel = world.entities[world.player.facing ?? ""]?.name ?? anchors[world.player.facing ?? ""] ?? "주변";
  const interaction = interactionContext(world);
  return directScene({
    interaction: { mode: interaction.mode, focus: world.entities[interaction.focusEntityId ?? ""]?.name ?? null, holding: world.entities[interaction.holdingEntityId ?? ""]?.name ?? null, goal: interaction.goal, threat: interaction.threat?.kind ?? null },
    voice: { person: "first", selfReference: "나", tense: "present", omitSubject: true },
    intent: world.lastIntent,
    location: { id: world.player.zone, name: worldRooms(world)[world.player.zone].name, lighting: illuminated(world, world.player.zone) ? "lit" : "dark", firstVisit },
    player: { ...world.player, positionLabel, facingLabel, heldTool: held ? { name: held.name, on: Boolean(held.components.light?.on) } : null },
    results: structuredClone(perceivedEvents), requiredFacts, optionalFacts, knownFacts,
    recentScenes: structuredClone(world.recentScenes), paragraphCount: world.lastIntent.importance === "major" ? { min: 2, max: 3 } : { min: 1, max: 1 },
  }, world.narrated);
}
export function rememberNarration(world: TextWorld, context: NarrativeContext, usedFactIds: string[], paragraphs: string[]) {
  for (const fact of [...context.requiredFacts, ...context.optionalFacts]) if (usedFactIds.includes(fact.id) && world.knowledge[fact.id]) world.narrated[fact.id] = world.knowledge[fact.id].signature;
  world.recentScenes = [...world.recentScenes, { zone: world.player.zone, intent: context.intent.label, paragraphs: [...(context.alreadyDisplayed ?? []), ...paragraphs] }].slice(-3);
}
