import type { ContentRegistry } from "../schemas";
import type { TextEntity, TextRoom } from "../schemas/text-world";

export function shelterTextRooms(): TextRoom[] {
  return [{ id: "shelter_work_corner", locationId: "shelter", name: "임시 거처 · 살림 자리", light: true,
    optionalEntry: { label: "거처의 보관함과 작업대를 살핀다", exitLabel: "살림 자리를 정리하고 돌아선다", exitText: "살림 자리에서 손을 떼고 천막 입구 쪽으로 돌아선다.", requiredFlag: "opening_seen" },
    entryText: "천막 안쪽으로 걸음을 옮겨 물건을 정리할 자리를 살핀다.", entryAnchor: "천막 입구", neighbors: [],
    layout: "천막 입구를 기준으로 왼쪽 바닥에 뚜껑 달린 보관함이 있고, 맞은편에는 판재를 받치는 작업대가 놓여 있다.",
    surface: "천막 입구로 들어온 빛이 보관함과 작업대에 닿는다.",
    entities: [
      { id: "shelter_storage", name: "거처 보관함", description: "자재와 식량을 정리해 둘 수 있는 뚜껑 달린 나무 보관함이다.",
        details: { anchor: "left-wall", placement: "천막 입구 기준 왼쪽 바닥", outline: "뚜껑 달린 보관함", surface: "잠금장치 없이 뚜껑을 여닫을 수 있다.", interior: "나무 바닥과 안쪽 면이 드러난다." },
        components: { position: { zone: "shelter_work_corner" }, container: { items: [], capacity: 100 }, openable: { isOpen: true, locked: false }, craftingStorage: true,
          physical: { mass: 12, volume: 10, movable: true, opaque: true, blocksPassage: false, supportCapacity: 5 } } },
      { id: "shelter_workbench", name: "거처 작업대", description: "앞면에 판자가 덧대어진 목재 작업대다. 가로대 사이로 몸을 낮춰 들어갈 공간이 있다.",
        details: { anchor: "far-wall", placement: "천막 입구 맞은편", outline: "목재 작업대", surface: "앞면의 판자와 가로대 사이에 몸을 낮춰 들어갈 공간이 있다.", touch: "판재 가장자리에 거친 나뭇결이 만져진다." },
        components: { position: { zone: "shelter_work_corner" }, workstation: { kinds: ["craft"], durationMultiplier: 0.8 },
          physical: { mass: 18, volume: 10, movable: false, opaque: false, blocksPassage: false, supportCapacity: 0 },
          structure: { material: "wood", integrity: 0, maxIntegrity: 5, resistance: 2, salvage: [],
            intactPhysical: { mass: 18, volume: 10, movable: false, opaque: true, blocksPassage: false, supportCapacity: 15, coverRelations: ["under"] },
            repair: { materials: [{ itemId: "woodPlank", amount: 2 }, { itemId: "scrapMetal", amount: 2 }, { itemId: "cordage", amount: 1 }], seconds: 600, energy: 1,
              effort: "앞면에 판재를 새로 대고 고철과 끈으로 가로대의 이음새를 단단히 고정한다." } } } },
    ] }];
}

/** Upgrade only the unchanged original workbench; preserve custom geometry and repair progress. */
export function upgradeShelterCover(entities: TextEntity[]) {
  const bench = entities.find(e => e.id === "shelter_workbench");
  const structure = bench?.components.structure, physical = structure?.intactPhysical;
  if (!bench || !bench.components.physical || bench.description !== "판재와 가로대를 연결한 목재 작업대다." || bench.details?.surface !== "판재 아래에 가로대와 이음새가 보인다."
    || !physical || physical.coverRelations !== undefined || physical.mass !== 18 || physical.volume !== 10 || physical.movable || physical.opaque || physical.supportCapacity !== 15) return;
  physical.opaque = true; physical.coverRelations = ["under"];
  if (structure!.integrity > 0 && bench.components.physical?.coverRelations === undefined) {
    bench.components.physical!.opaque = true; bench.components.physical!.coverRelations = ["under"];
  }
  bench.description = "앞면에 판자가 덧대어진 목재 작업대다. 가로대 사이로 몸을 낮춰 들어갈 공간이 있다.";
  bench.details.surface = "앞면의 판자와 가로대 사이에 몸을 낮춰 들어갈 공간이 있다.";
  if (structure!.repair?.effort === "판재를 새로 대고 고철과 끈으로 가로대의 이음새를 단단히 고정한다.") structure!.repair.effort = "앞면에 판재를 새로 대고 고철과 끈으로 가로대의 이음새를 단단히 고정한다.";
}

/** Old published registries gain the default room; authored shelter rooms keep precedence. */
export function withDefaultShelterRooms<T extends Pick<ContentRegistry, "textRooms" | "locations">>(registry: T): T {
  if (!registry.locations.shelter || registry.textRooms?.some(room => room.locationId === "shelter")) return registry;
  return { ...registry, textRooms: [...(registry.textRooms ?? []), ...shelterTextRooms()] };
}
