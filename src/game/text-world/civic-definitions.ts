import type { ContentStudioDocument } from "../content-studio";
import type { ContentRegistry } from "../schemas";
import type { TextEntity, TextRoom } from "../schemas/text-world";

const object = (id: string, name: string, zone: string, placement: string, surface: string, components: Omit<TextEntity["components"], "position"> = {}): TextRoom["entities"][number] => ({
  id, name, description: surface, details: { anchor: id, placement, outline: name, surface }, components: { position: { zone }, ...components },
});
export function kitchenTextRooms(): TextRoom[] {
  const zone = "kitchen_serving";
  return [{ id: zone, locationId: "kitchen", name: "급식소 · 배식 공간", light: true,
    entryText: "빈 그릇을 든 사람들이 선 줄을 따라 급식소 안으로 들어선다.", entryAnchor: "거리로 이어지는 급식소 입구",
    layout: "급식소 입구 정면에 배식대가 있고 노파가 그 옆을 지키고 있다. 입구 기준 왼쪽, 배식줄 옆 구석에는 폐자재 더미가 쌓여 있다. 식재료 상자는 배식대 뒤쪽에 놓여 있다.",
    surface: "사람들이 빈 그릇을 들고 배식대 앞으로 줄을 서 있다.", neighbors: [],
    sensory: [{ when: "ENTER", detail: "묵은 국 냄새가 남아 있다." }],
    entities: [
      object("kitchen_serving_counter", "배식대", zone, "급식소 입구 정면", "배식대에서는 돈이나 배급표를 내고 식사를 받을 수 있고, 배식 일을 거들 수도 있다.",
        { physical: { mass: 40, volume: 15, movable: false, opaque: true, blocksPassage: false, supportCapacity: 10 }, interactionPoint: { directFromEntry: true, requiresInspection: false, actions: [{ actionId: "buy_meal_at_kitchen", role: "trade" }, { actionId: "buy_crowded_meal_at_kitchen", role: "trade" }, { actionId: "exchange_ration_ticket_at_kitchen", role: "trade" }, { actionId: "help_kitchen_queue", role: "work" }] } }),
      object("kitchen_old_cook", "노파", zone, "입구 정면의 배식대 옆", "노파가 배식줄을 살피고 있다.",
        { actor: { npcId: "oldCook" }, interactionPoint: { directFromEntry: true, requiresInspection: false, actions: [{ actionId: "deliver_canned_food_to_old_cook", role: "delivery" }] } }),
      object("kitchen_scrap_heap", "폐자재 더미", zone, "급식소 입구 기준 왼쪽의 배식줄 옆 구석", "배식줄 옆 구석에 폐자재가 한데 얽혀 있다.",
        { stockNode: { nodeId: "kitchen_scrap_heap" }, container: { items: [] } }),
      object("kitchen_ingredient_crate", "식재료 상자", zone, "입구 정면 배식대 뒤쪽", "배식대 뒤쪽에 낡은 작은 상자가 놓여 있다.",
        { stockNode: { nodeId: "kitchen_ingredient_crate" }, physical: { mass: 3, volume: 6, movable: true, opaque: true, blocksPassage: false, supportCapacity: 3 }, container: { items: [], capacity: 10 }, openable: { isOpen: false, locked: false } }),
    ] }];
}
export function checkpointTextRooms(): TextRoom[] {
  const zone = "checkpoint_yard";
  return [{ id: zone, locationId: "checkpoint", name: "검문소 · 초소 앞", light: true,
    entryText: "부서진 지하 출구를 나와 뒤집힌 차단봉이 남은 검문소로 들어선다.", entryAnchor: "지하철역으로 이어지는 부서진 지하 출구",
    layout: "지하 출구를 등지면 정면에 뒤집힌 차단봉과 빈 초소가 있고, 오른쪽 안쪽에 통신 차량이 멈춰 서 있다. 초소 옆에는 낡은 안내판과 무전 기록이 남아 있다.",
    surface: "뒤집힌 차단봉과 비어 있는 초소, 멈춰 선 통신 차량이 늘어서 있다.", neighbors: [],
    sensory: [{ when: "ENTER", detail: "바람이 차단봉을 흔든다." }],
    entities: [
      object("checkpoint_radio_truck", "통신 차량", zone, "지하 출구 기준 오른쪽 안쪽", "통신 차량의 출입문 가장자리에 먼지가 내려앉아 있다.",
        { stockNode: { nodeId: "checkpoint_radio_truck" }, physical: { mass: 1500, volume: 300, movable: false, opaque: true, blocksPassage: false }, container: { items: [] }, openable: { isOpen: true, locked: false } }),
      object("checkpoint_radio_records", "무전 기록", zone, "지하 출구 정면 초소 옆", "낡은 안내판 옆에 무전 기록이 남아 있다. 내용을 맞춰 읽어 볼 수 있다.",
        { interactionPoint: { actions: [{ actionId: "monitor_rescue_frequency", role: "information" }] } }),
      object("checkpoint_perimeter", "초소 주변", zone, "지하 출구 정면의 차단봉과 초소 주변", "뒤집힌 차단봉과 빈 초소 사이에 잔해가 널려 있다. 날카로운 금속 끝을 피해 주변을 정찰할 수 있다.",
        { interactionPoint: { actions: [{ actionId: "patrol_checkpoint_perimeter", role: "work" }] } }),
    ] }];
}
/** Add native places to old registries while respecting authored rooms and removed bindings. */
export function withDefaultCivicRooms<T extends Pick<ContentRegistry, "textRooms" | "locations" | "actions" | "people">>(registry: T): T {
  if (!registry.textRooms) return registry;
  const rooms = [...registry.textRooms];
  for (const [locationId, definitions] of [["kitchen", kitchenTextRooms], ["checkpoint", checkpointTextRooms]] as const) {
    const location = registry.locations[locationId];
    if (!location || rooms.some(room => room.locationId === locationId)) continue;
    const added = definitions();
    for (const room of added) room.entities = room.entities.filter(entity => {
      if (entity.components.stockNode && !location.stockNodes.some(n => n.id === entity.components.stockNode!.nodeId)) return false;
      if (entity.components.actor && !registry.people[entity.components.actor.npcId]) return false;
      const point = entity.components.interactionPoint;
      if (point) { point.actions = point.actions.filter(a => registry.actions[a.actionId]?.locationIds.includes(locationId)); if (!point.actions.length) delete entity.components.interactionPoint; }
      return true;
    });
    rooms.push(...added);
  }
  return { ...registry, textRooms: rooms };
}
export function withCivicDocumentDefaults(document: ContentStudioDocument): ContentStudioDocument {
  const registry = withDefaultCivicRooms({ textRooms: document.textRooms,
    locations: Object.fromEntries(document.locations.map(l => [l.id, l])), people: Object.fromEntries(document.people.map(p => [p.id, p])),
    actions: Object.fromEntries([...document.locations.flatMap(l => l.interactionChoices), ...document.stories.flatMap(s => s.actions)].map(a => [a.id, a])) });
  return { ...document, textRooms: registry.textRooms };
}
