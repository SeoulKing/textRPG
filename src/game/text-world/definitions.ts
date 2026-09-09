import { ActorRoutineSchema } from "../schemas/actor";
import type { TextEntity, TextRoom, TextWorld } from "../schemas/text-world";

// Directions are tied to the entrance, never to whichever way the player turns.
export const subwayZones: Record<string, { name: string; light: boolean; layout: string; surface: string }> = {
  concourse: { name: "지하철역 · 대합실", light: true, layout: "지상 계단에서 내려온 입구 오른쪽으로 역무실이 이어지고, 정면에는 개찰구가 있다.", surface: "지상 계단과 역무실 입구, 지하층으로 내려가는 계단이 대합실에서 갈라진다." },
  office: { name: "지하철역 · 옆쪽 역무실", light: true,
    layout: "대합실에서 들어오는 입구를 기준으로 길쭉한 역무실이 이어진다.",
    surface: "입구로 들어오는 빛이 양쪽 벽과 방 안쪽까지 닿는다." },
  corridor: { name: "지하철역 · 정비 복도", light: false,
    layout: "곧은 복도의 한쪽 끝은 역무실로, 반대쪽 끝은 창고로 이어진다.",
    surface: "양쪽 벽 사이의 바닥은 평평하고, 창고 입구까지 이어지는 통로에 장애물은 없다." },
  storage: { name: "지하철역 · 정비 창고", light: false,
    layout: "복도에서 들어오는 창고 입구 양옆에 빈 선반이 있다.",
    surface: "선반의 칸은 비어 있고, 방 안쪽까지 바닥이 드러나 있다." },
};
export const details: Record<string, NonNullable<TextEntity["details"]>> = {
  shumi_presence: { anchor: "pillar", placement: "지상 계단 입구 기준 정면 개찰구의 왼쪽 기둥 아래", outline: "슈미", surface: "작은 라디오를 지니고 있다." },
  subway_depth_stairs: { anchor: "depth-stairs", placement: "지상 계단 입구 기준 정면 개찰구 너머", outline: "지하층 계단", surface: "개찰구 너머로 지하 1층에 내려가는 계단이 이어진다.", posture: "standing" },
  crate: { anchor: "left-wall", placement: "역무실 입구 기준 왼쪽 벽 아래", outline: "낮은 나무 상자", surface: "뚜껑 한쪽이 갈라져 있고 잠금장치는 없다.", touch: "뚜껑 가장자리의 나뭇결이 거칠다.", interior: "나무로 된 바닥과 안쪽 면이 드러난다.", movementSound: "나무 밑면이 바닥을 긁는 소리가 난다." },
  lamp: { anchor: "right-wall", placement: "역무실 입구 기준 오른쪽 벽", outline: "작은 손전등", surface: "몸통 옆에 엄지로 누르는 스위치가 있다.", touch: "금속 몸통이 손바닥에 차갑게 닿는다." },
  door: { anchor: "far-door", placement: "역무실 입구 맞은편 / 복도의 역무실 쪽 끝", outline: "철문", surface: "경첩에 녹이 슬어 있다.", touch: "손잡이가 단단하고 차갑다.", responses: [
    { when: "UNLOCK", detail: "열쇠를 돌리자 잠금장치 안에서 작게 딸깍하는 소리가 난다." },
    { when: "OPEN", detail: "문이 벌어지는 동안 녹슨 경첩이 낮게 삐걱거린다." },
  ] },
  floor: { anchor: "floor", placement: "입구와 철문 사이", outline: "먼지가 내려앉은 바닥", surface: "바닥의 이음새에 먼지가 얇게 쌓여 있다.", touch: "바닥이 손끝에 단단하고 차갑게 닿는다." },
  doorKey: { anchor: "floor", placement: "철문 앞 바닥의 이음새", outline: "작은 금속 열쇠", surface: "납작한 손잡이와 톱니가 있는 작은 금속 열쇠다.", touch: "얇은 금속이 손가락 사이에 차갑게 닿는다.", posture: "crouching" },
  cache: { anchor: "far-wall", placement: "창고 입구 맞은편 벽 아래", outline: "낮은 철제 공구 보관함", surface: "바닥에 고정되어 있고 잠금장치는 없다.", touch: "뚜껑 테두리가 매끈하고 차갑다.", interior: "철제 바닥과 안쪽 면이 드러난다." },
  water: { anchor: "crate", placement: "나무 상자 안", outline: "미개봉 물병", surface: "마개가 봉인되어 있다." },
  scrap: { anchor: "crate", placement: "나무 상자 안", outline: "고철 조각 두 개", surface: "작은 금속 조각이 나란히 놓여 있다." },
  food: { anchor: "cache", placement: "공구 보관함 안", outline: "캔 음식", surface: "캔이 조금 찌그러져 있지만 밀봉되어 있다." },
};
/** Add physical capabilities to the original box while preserving edited components and all progress. */
export function upgradeWorldPhysics(entities: TextEntity[]) {
  const crate = entities.find(e => e.id === "crate" && e.components.container && e.components.openable);
  if (crate && !crate.components.physical) {
    crate.components.physical = { mass: 12, volume: 8, movable: true, opaque: true, blocksPassage: true, supportCapacity: 5 };
    if (crate.details && !crate.details.movementSound) crate.details.movementSound = details.crate.movementSound;
  }
  if (crate && crate.description === details.crate.surface) {
    crate.components.structure ??= { material: "wood", integrity: 4, maxIntegrity: 4, resistance: 1, salvage: [{ itemId: "woodPlank", amount: 1 }] };
    if (crate.components.structure.material === "wood") {
      crate.components.structure.repair ??= { materials: [{ itemId: "woodPlank", amount: 2 }, { itemId: "clothScrap", amount: 1 }], seconds: 30, energy: 1, effort: "새 판자를 대고 천으로 이음새를 단단히 감는다." };
      crate.components.structure.intactPhysical ??= crate.components.structure.integrity > 0 ? structuredClone(crate.components.physical) : { mass: 12, volume: 8, movable: true, opaque: true, blocksPassage: true, supportCapacity: 5 };
    }
  }
  const door = entities.find(e => e.id === "door" && e.components.portal && e.description === details.door.surface);
  if (door) {
    door.components.structure ??= { material: "metal", integrity: 6, maxIntegrity: 6, resistance: 3, salvage: [] };
    if (door.components.structure.material === "metal") door.components.structure.repair ??= { materials: [{ itemId: "scrapMetal", amount: 2 }, { itemId: "cordage", amount: 1 }], seconds: 45, energy: 2, effort: "휘어진 부분을 두드려 맞추고 고철을 덧대어 끈으로 고정한다.", sound: { description: "고철을 두드리는 소리가 난다.", intensity: .7 }, tool: { capability: "strike", power: 3 } };
  }
}
export function defaultTextRooms(): TextRoom[] {
  const entity = (id: string, name: string, zone: string, extra: Omit<TextEntity["components"], "position"> = {}): TextEntity => ({
    id, name, description: details[id].surface, details: structuredClone(details[id]), components: { position: { zone }, ...extra },
  });
  const entities = [
    entity("subway_depth_stairs", "지하층 계단", "concourse", { interactionPoint: { requiresInspection: false, actions: [{ actionId: "start_subway_expedition", role: "journey" }] } }),
    entity("shumi_presence", "슈미", "concourse", { actor: { npcId: "shumi", routine: ActorRoutineSchema.parse({ homeZone:"concourse", roamZones:["concourse","office"] }) } }),
    entity("crate", "나무 상자", "office", { physical: { mass: 12, volume: 8, movable: true, opaque: true, blocksPassage: true, supportCapacity: 5 }, openable: { isOpen: false, locked: false }, container: { items: ["water", "scrap"] } }),
    entity("door", "철문", "office", { openable: { isOpen: false, locked: true, keyId: "doorKey" }, portal: { from: "office", to: "corridor" } }),
    ...officePuzzleEntities(),
    entity("lamp", "손전등", "office", { portable: { itemId: "flashlight", amount: 1 }, light: { on: false } }),
    entity("water", "미개봉 물병", "crate", { portable: { itemId: "waterBottle", amount: 1 } }),
    entity("scrap", "고철 조각", "crate", { portable: { itemId: "scrapMetal", amount: 2 } }),
    entity("cache", "공구 보관함", "storage", { openable: { isOpen: false, locked: false }, container: { items: ["food"] } }),
    entity("food", "캔 음식", "cache", { portable: { itemId: "cannedFood", amount: 1 } }),
  ];
  upgradeWorldPhysics(entities);
  return Object.entries(subwayZones).map(([id, room]): TextRoom => ({
    sensory: id === "office" ? [{ when: "ENTER", detail: "대합실에서 들어오는 빛이 입구 쪽 바닥에 길게 걸쳐 있다." }]
      : id === "corridor" ? [{ when: "MOVE", detail: "단단한 바닥을 딛는 발소리가 좁은 벽 사이에서 짧게 되돌아온다." }]
      : id === "storage" ? [{ when: "ENTER", detail: "창고 안의 공기가 서늘하게 느껴진다." }] : [],
    arrivals: id === "office" ? { concourse: { position: "entrance", facing: "far-door", text: "대합실에서 역무실 입구로 발을 들인다." }, corridor: { position: "far-door", facing: "entrance", text: "정비 복도에서 철문을 지나 역무실로 돌아온다." } }
      : id === "corridor" ? { office: { position: "office-end", facing: "storage-end", text: "철문을 지나 정비 복도의 역무실 쪽 끝으로 들어선다." }, storage: { position: "storage-end", facing: "office-end", text: "창고에서 나와 정비 복도의 창고 쪽 끝에 선다." } }
      : id === "concourse" ? { office: { position: "office-entrance", facing: "concourse", text: "역무실 입구를 지나 대합실로 나온다." } } : undefined,
    id, ...room, locationId: "subway", regionalExit: id === "concourse" || undefined, neighbors: id === "concourse" ? ["office"] : id === "office" ? ["concourse", "corridor"] : id === "corridor" ? ["office", "storage"] : ["corridor"],
    entities: entities.filter(e => e.components.position.zone === id || entities.find(parent => parent.id === e.components.position.zone)?.components.position.zone === id)
      .map(e => ({ ...e, details: e.details! })),
  }));
}

function officePuzzleEntities(): TextEntity[] {
  return [
    { id: "floor", name: "바닥", description: details.floor.surface, details: structuredClone(details.floor), components: { position: { zone: "office" } } },
    { id: "doorKey", name: "철문 열쇠", description: details.doorKey.surface, details: structuredClone(details.doorKey), components: { position: { zone: "office" }, discovery: { inspectTargetId: "floor" }, portable: { itemId: "ironDoorKey", amount: 1 } } },
  ];
}
// Upgrade the original office once, retaining an already opened door and edited rooms.
export function upgradeOfficeDoor(entities: TextEntity[]): boolean {
  const door = entities.find(e => e.id === "door" && e.components.portal?.from === "office" && e.components.portal.to === "corridor");
  if (!door?.components.openable || door.components.openable.keyId || entities.some(e => ["floor", "doorKey"].includes(e.id))) return false;
  door.components.openable.keyId = "doorKey";
  door.components.openable.locked = !door.components.openable.isOpen;
  entities.push(...officePuzzleEntities());
  return true;
}

/** Connect legacy concourse rooms while retaining saved objects, actor positions and custom layouts. */
export function upgradeSubwayResidents(world: TextWorld) {
  if (!world.rooms?.office || world.rooms.office.locationId !== "subway") return;
  const boundary = defaultTextRooms().find(room => room.id === "concourse")!;
  if (!world.rooms.concourse) {
    const { entities, ...room } = boundary;
    world.rooms.concourse = room;
    if (!world.rooms.office.neighbors.includes(room.id)) world.rooms.office.neighbors.push(room.id);
  }
  if (world.rooms.concourse.layout === "개찰구 옆 기둥 아래에 슈미가 자리를 잡고 있다.") world.rooms.concourse.layout = boundary.layout;
  delete world.rooms.concourse.outsideExploration;
  world.rooms.concourse.regionalExit = true;
  if (!Object.values(world.entities).some(e => e.components.interactionPoint?.actions.some(a => a.actionId === "start_subway_expedition")) && !world.entities.subway_depth_stairs) world.entities.subway_depth_stairs = structuredClone(boundary.entities.find(e => e.id === "subway_depth_stairs")!);
  for (const actor of Object.values(world.entities)) if (actor.components.actor?.npcId === "shumi" && actor.description === details.shumi_presence.surface && actor.components.actor.routine === undefined) actor.components.actor.routine = ActorRoutineSchema.parse({ homeZone:"concourse", roamZones:["concourse","office"] });
  if (!Object.values(world.entities).some(e=>e.components.actor?.npcId === "shumi")) {
    const actor = structuredClone(boundary.entities.find(e => e.components.actor?.npcId === "shumi")!);let suffix=1;
    while (world.entities[actor.id]) actor.id = "shumi_presence_" + suffix++;
    world.entities[actor.id] = actor;
  }
}