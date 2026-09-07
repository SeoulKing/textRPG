import type { TextRoom } from "../schemas/text-world";

export function textRoomIssues(rooms: TextRoom[], itemIds: Set<string>) {
  const issues: { id: string; message: string }[] = [];
  const add = (id: string, message: string) => issues.push({ id, message });
  const roomIds = new Set(rooms.map(room => room.id));
  const all = rooms.flatMap(room => room.entities);
  const entities = new Map(all.map(entity => [entity.id, entity]));
  if (rooms.some(room => room.locationId === "subway") && !["office", "corridor", "storage"].every(id => roomIds.has(id))) add("office", "역무실·정비 복도·정비 창고의 방 구성을 유지해 주세요.");
  const rootOf = (id: string) => {
    const seen = new Set<string>(); let at = entities.get(id);
    while (at) { if (seen.has(at.id)) return null; seen.add(at.id); const owner: string = at.components.position.zone; if (roomIds.has(owner)) return owner; at = entities.get(owner); }
    return null;
  };
  if (roomIds.size !== rooms.length) add("", "탐색 구역 ID가 중복되었습니다.");
  const ids = new Set<string>();
  const portals = new Set<string>();
  for (const room of rooms) {
    if (!room.name.trim()) add(room.id, "방 이름을 입력해 주세요.");
    for (const from of Object.keys(room.arrivals ?? {})) if (!room.neighbors.includes(from)) add(room.id, "도착 위치의 출발 방은 연결된 이웃 방이어야 합니다.");
    for (const next of room.neighbors) if (!roomIds.has(next) || next === room.id || (!rooms.find(r => r.id === next)?.neighbors.includes(room.id) || rooms.find(r => r.id === next)?.locationId !== room.locationId)) add(room.id, "연결된 방은 서로 왕복할 수 있어야 합니다.");
    for (const entity of room.entities) {
      const c = entity.components, parent = entities.get(c.position.zone);
      const label = entity.name || entity.id;
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(entity.id) || ["player", "collected", "__proto__", "constructor", "prototype"].includes(entity.id) || roomIds.has(entity.id) || ids.has(entity.id)) add(room.id, `엔티티 ID '${entity.id}'가 중복되었거나 사용할 수 없습니다.`);
      ids.add(entity.id);
      if (!entity.name.trim() || !entity.details.placement.trim()) add(room.id, `${label}: 이름과 배치를 입력해 주세요.`);
      if (rootOf(entity.id) !== room.id || parent && (c.position.relation === "on" ? parent.components.physical?.supportCapacity === undefined : !parent.components.container?.items.includes(entity.id))) add(room.id, label + ": 배치할 방이나 보관함을 확인해 주세요. 순환 배치는 사용할 수 없습니다.");
      if (c.position.relativeTo && (!entities.has(c.position.relativeTo) || rootOf(c.position.relativeTo) !== room.id || c.position.relativeTo === entity.id)) add(room.id, label + ": 상대 배치 대상은 같은 방의 다른 사물이어야 합니다.");
      if (c.openable?.locked && c.openable.isOpen) add(room.id, `${label}: 잠긴 물체는 닫힌 상태로 설정해 주세요.`);
      if (c.structure) {
        if (c.structure.integrity > c.structure.maxIntegrity) add(room.id, label + ": 남은 구조 내구도가 최대치를 넘을 수 없습니다.");
        if (c.structure.integrity === 0 && (c.openable && !c.openable.isOpen || c.physical?.blocksPassage)) add(room.id, label + ": 부서진 구조가 문이나 통로를 막을 수 없습니다.");
        if (new Set(c.structure.salvage.map(s => s.itemId)).size !== c.structure.salvage.length) add(room.id, label + ": 해체 재료는 아이템별로 한 번만 정의해 주세요.");
        for (const drop of c.structure.salvage) if (!itemIds.has(drop.itemId)) add(room.id, label + ": 해체 재료 아이템을 찾을 수 없습니다.");
        const repair = c.structure.repair;
        if (repair) {
          if (c.structure.integrity === 0 && c.physical && !c.structure.intactPhysical) add(room.id, label + ": 부서진 사물을 수리하려면 원래 물성 정보가 필요합니다.");
          if (new Set(repair.materials.map(cost => cost.itemId)).size !== repair.materials.length) add(room.id, label + ": 수리 재료는 아이템별로 한 번만 정의해 주세요.");
          for (const cost of repair.materials) if (!itemIds.has(cost.itemId)) add(room.id, label + ": 수리 재료 아이템을 찾을 수 없습니다.");
        }
      }
      if (c.openable?.keyId && !entities.get(c.openable.keyId)?.components.portable) add(room.id, label + ": 잠금 해제에 사용할 열쇠 엔티티를 확인해 주세요.");
      if (c.discovery) {
        const target = entities.get(c.discovery.inspectTargetId);
        if (!c.portable || !target || target.id === entity.id || target.components.position.zone !== room.id || target.components.discovery) add(room.id, label + ": 먼저 자세히 살필 대상을 같은 방의 사물로 설정해 주세요.");
      }
      if (c.stockNode && (!c.container || c.portable || c.resourceSite)) add(room.id, label + ": 재고 노드는 휴대할 수 없는 보관함에 연결해 주세요.");
      if (c.interactionPoint && new Set(c.interactionPoint.actions.map(a => a.actionId)).size !== c.interactionPoint.actions.length) add(room.id, label + ": 연결된 행동이 중복되었습니다.");
      if (c.craftingStorage && (!c.container || c.stockNode || c.portable)) add(room.id, label + ": 작업 재료 보관은 일반 고정 보관함에만 설정해 주세요.");
      if (c.workstation && (c.portable || new Set(c.workstation.kinds).size !== c.workstation.kinds.length)) add(room.id, label + ": 작업대는 휴대할 수 없으며 작업 종류가 중복되면 안 됩니다.");
      if (c.container) {
        if (c.portal) add(room.id, label + ": 문은 보관함으로 사용할 수 없습니다.");
        if (new Set(c.container.items).size !== c.container.items.length) add(room.id, `${label}: 내용물이 중복되어 있습니다.`);
        for (const id of c.container.items) {
          const child = entities.get(id);
          if (!child || child.components.position.zone !== entity.id || child.components.position.relation === "on" || child.components.portal) add(room.id, label + ": 내용물 '" + id + "'의 포함 관계를 확인해 주세요.");
        }
      }
      if (c.portable?.itemId && !itemIds.has(c.portable.itemId)) add(room.id, `${label}: 지급할 아이템을 찾을 수 없습니다.`);
      if (c.light && c.portal) add(room.id, label + ": 문 자체는 광원으로 사용할 수 없습니다.");
      if (c.openable && !c.container && !c.portal) add(room.id, `${label}: 여닫기는 보관함이나 문에 설정해 주세요.`);
      if (c.portal) {
        const { from, to } = c.portal;
        const pair = [from, to].sort().join(":");
        if (!c.openable || c.portable || from !== room.id || !room.neighbors.includes(to) || from === to || portals.has(pair)) add(room.id, `${label}: 문은 현재 방과 연결된 다른 방 사이에 하나만 배치해 주세요.`);
        portals.add(pair);
      }
    }
  }
  return issues;
}
