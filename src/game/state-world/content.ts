import { restoreWorld } from "./world";

export function createWorld() {
  const definition = (id: string, name: string, properties = {}) => ({
    id, name, major: false, portable: false, surface: false, container: false, openable: false, description: "", ...properties,
  });
  return restoreWorld({
    version: 1, contentVersion: "storehouse-1", revision: 0, elapsedSeconds: 0,
    definitions: [
      definition("shelf", "철제 선반", { major: true, surface: true }),
      definition("cabinet", "캐비닛", { major: true, container: true, openable: true }),
      definition("food", "통조림", { portable: true }), definition("key", "작은 열쇠", { portable: true }),
      definition("medicine", "구급약", { portable: true }),
    ],
    rooms: [
      { id: "room_01", name: "작은 창고", atmosphere: "좁은 창고에 들어와 있습니다.", lit: true },
      { id: "room_02", name: "바깥 복도", atmosphere: "창고 밖의 짧은 복도입니다.", lit: true },
    ],
    nodes: [
      { id: "entry", roomId: "room_01", name: "창고 입구" }, { id: "aisle", roomId: "room_01", name: "중앙 통로" },
      { id: "shelf_front", roomId: "room_01", name: "선반 앞" }, { id: "cabinet_front", roomId: "room_01", name: "캐비닛 앞" },
      { id: "hall", roomId: "room_02", name: "복도" },
    ],
    edges: [
      { id: "entry_aisle", from: "entry", to: "aisle", seconds: 2 },
      { id: "aisle_shelf", from: "aisle", to: "shelf_front", seconds: 3 },
      { id: "aisle_cabinet", from: "aisle", to: "cabinet_front", seconds: 3 },
      { id: "entry_hall", from: "entry", to: "hall", seconds: 4 },
    ],
    entities: [
      { id: "shelf_01", definitionId: "shelf", quantity: 1, accessNodeId: "shelf_front", placementLabel: "벽 쪽" },
      { id: "cabinet_01", definitionId: "cabinet", quantity: 1, accessNodeId: "cabinet_front", placementLabel: "맞은편", open: false, locked: true, keyDefinitionId: "key" },
      { id: "food_01", definitionId: "food", quantity: 2 },
      { id: "key_01", definitionId: "key", quantity: 1, accessNodeId: "hall", placementLabel: "복도 바닥" },
      { id: "medicine_01", definitionId: "medicine", quantity: 1 },
    ],
    placements: [
      { entityId: "shelf_01", parentId: "room_01", relation: "in" },
      { entityId: "cabinet_01", parentId: "room_01", relation: "in" },
      { entityId: "food_01", parentId: "shelf_01", relation: "on" },
      { entityId: "key_01", parentId: "room_02", relation: "in" },
      { entityId: "medicine_01", parentId: "cabinet_01", relation: "in" },
    ],
    player: { nodeId: "entry", focusId: null, inventoryId: "inventory", health: 10 },
    memory: [], narrated: [], events: [], lastParagraphs: [],
  });
}
