import type { TextRoom } from "../schemas/text-world";

export function textRoomIssues(rooms: TextRoom[], itemIds: Set<string>) {
  const issues: { id: string; message: string }[] = [];
  const add = (id: string, message: string) => issues.push({ id, message });
  const roomIds = new Set(rooms.map(room => room.id));
  const all = rooms.flatMap(room => room.entities);
  const entities = new Map(all.map(entity => [entity.id, entity]));
  if (rooms.length !== 3 || !["office", "corridor", "storage"].every(id => roomIds.has(id))) add("office", "역무실·정비 복도·정비 창고의 방 구성을 유지해 주세요.");
  const rootOf = (id: string) => {
    const seen = new Set<string>(); let at = entities.get(id);
    while (at) { if (seen.has(at.id)) return null; seen.add(at.id); const owner: string = at.components.position.zone; if (roomIds.has(owner)) return owner; at = entities.get(owner); }
    return null;
  };
  const ids = new Set<string>();
  const portals = new Set<string>();
  for (const room of rooms) {
    if (!room.name.trim()) add(room.id, "방 이름을 입력해 주세요.");
    for (const next of room.neighbors) if (!roomIds.has(next) || next === room.id || !rooms.find(r => r.id === next)?.neighbors.includes(room.id)) add(room.id, "연결된 방은 서로 왕복할 수 있어야 합니다.");
    for (const entity of room.entities) {
      const c = entity.components, parent = entities.get(c.position.zone);
      const label = entity.name || entity.id;
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(entity.id) || ["player", "collected", "__proto__", "constructor", "prototype"].includes(entity.id) || roomIds.has(entity.id) || ids.has(entity.id)) add(room.id, `엔티티 ID '${entity.id}'가 중복되었거나 사용할 수 없습니다.`);
      ids.add(entity.id);
      if (!entity.name.trim() || !entity.details.placement.trim()) add(room.id, `${label}: 이름과 배치를 입력해 주세요.`);
      if (rootOf(entity.id) !== room.id || parent && (c.position.relation === "on" ? parent.components.physical?.supportCapacity === undefined : !parent.components.container?.items.includes(entity.id))) add(room.id, label + ": 배치할 방이나 보관함을 확인해 주세요. 순환 배치는 사용할 수 없습니다.");
      if (c.position.relativeTo && (!entities.has(c.position.relativeTo) || rootOf(c.position.relativeTo) !== room.id || c.position.relativeTo === entity.id)) add(room.id, label + ": 상대 배치 대상은 같은 방의 다른 사물이어야 합니다.");
      if (c.openable?.locked && c.openable.isOpen) add(room.id, `${label}: 잠긴 물체는 닫힌 상태로 설정해 주세요.`);
      if (c.openable?.keyId && !entities.get(c.openable.keyId)?.components.portable) add(room.id, label + ": 잠금 해제에 사용할 열쇠 엔티티를 확인해 주세요.");
      if (c.discovery) {
        const target = entities.get(c.discovery.inspectTargetId);
        if (!c.portable || !target || target.id === entity.id || target.components.position.zone !== room.id || target.components.discovery) add(room.id, label + ": 먼저 자세히 살필 대상을 같은 방의 사물로 설정해 주세요.");
      }
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
