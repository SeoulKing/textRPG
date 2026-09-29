import type { TextRoom } from "../schemas/text-world";

export function resourceTextRooms(): TextRoom[] {
  const site = (id: string, name: string, zone: string, siteId: string, placement: string, surface: string, posture: "standing" | "crouching" = "standing"): TextRoom["entities"][number] => ({
    id, name, description: surface, details: { anchor: id, placement, outline: name, surface, posture },
    components: { position: { zone }, resourceSite: { siteId } },
  });
  const driftwood: TextRoom["entities"][number] = {
    id: "river_driftwood", name: "밀려온 가지 더미", description: "물가의 가지들이 서로 엉켜 있다.",
    details: { anchor: "river_driftwood", placement: "낚싯자리 왼쪽의 물이 빠진 둔덕", outline: "밀려온 가지 더미", surface: "가지 사이에 아직 단단한 목재가 끼어 있다." },
    components: { position: { zone: "river_bank" }, container: { items: ["river_wood"], depletionBehavior: "disappear" } },
  };
  const wood: TextRoom["entities"][number] = { id: "river_wood", name: "목재", description: "가공할 수 있는 단단한 나무 조각이다.", details: { anchor: "river_driftwood", placement: "가지 더미 안", outline: "나무 조각", surface: "가공할 수 있는 단단한 나무 조각이다." }, components: { position: { zone: "river_driftwood" }, portable: { itemId: "wood", amount: 2 } } };
  return [
    { id: "forest_edge", name: "숲 · 가장자리", locationId: "forest", light: true,
      entryText: "무너진 울타리 곁의 흙길로 들어선다.", entryAnchor: "거처로 이어지는 숲길",
      layout: "거처로 이어지는 길을 등지면 좁은 흙길이 두 나무 사이로 이어진다. 길을 따라가면 덩굴이 자라는 숲 안쪽에 닿는다.",
      surface: "무너진 울타리와 젖은 낙엽 사이로 흙길이 이어진다.", neighbors: ["forest_inner"],
      sensory: [{ when: "ENTER", detail: "나뭇가지가 흔들리며 젖은 낙엽 냄새가 가까워진다." }],
      entities: [site("forest_timber", "쓰러진 나무", "forest_edge", "fallen_wood", "거처에서 내려오는 길 기준 왼쪽", "부러진 가지 사이에 마른 목재가 드러나 있다."),
        site("forest_debris", "낙엽 속 잔해", "forest_edge", "forest_debris", "거처에서 내려오는 길 기준 오른쪽", "젖은 낙엽 사이로 버려진 봉지와 부서진 자재의 모서리가 보인다.", "crouching")] },
    { id: "forest_inner", name: "숲 · 안쪽 덩굴길", locationId: "forest", light: true,
      entryText: "나무 사이의 좁은 길을 따라 덩굴이 드리운 안쪽으로 들어선다.", entryAnchor: "숲 가장자리로 이어지는 좁은 길",
      layout: "가장자리에서 들어오는 좁은 길은 숲 안쪽의 나무 사이로 이어진다. 지나온 방향으로 걸으면 숲 가장자리로 돌아갈 수 있다.",
      surface: "덩굴 아래로 젖은 흙과 낙엽이 드러난다.", neighbors: ["forest_edge"],
      entities: [site("forest_vines", "질긴 덩굴", "forest_inner", "vines", "가장자리에서 들어오는 길 기준 왼편", "길게 늘어진 덩굴 중 질긴 줄기를 골라 꼴 수 있다."),
        site("forest_bushes", "겹친 덤불", "forest_inner", "bushes", "가장자리에서 들어오는 길 기준 오른편", "잎과 줄기가 겹쳐 안쪽 바닥을 가리고 있다.", "crouching")] },
    { id: "river_bank", name: "강 · 무너진 제방 아래", locationId: "river", light: true,
      entryText: "콘크리트 둑길을 내려가 물이 닿는 자리 앞에 멈춘다.", entryAnchor: "숲과 편의점 쪽으로 올라가는 둑길",
      layout: "둑길에서 내려서면 바로 앞이 강물이다. 오른쪽에는 콘크리트 턱이 있고, 왼쪽으로는 물이 빠진 둔덕이 이어진다.",
      surface: "콘크리트가 끊어진 틈으로 젖은 흙이 드러난다.", neighbors: [],
      sensory: [{ when: "ENTER", detail: "흐르는 물이 제방 아래에 부딪히는 소리가 이어진다." }],
      entities: [site("river_fishing", "강둑의 낚싯자리", "river_bank", "fishing_pools", "둑길에서 내려오는 방향 기준 오른쪽", "콘크리트 턱에 낚싯줄이 고정되어 있고, 물 위로 당겨 올릴 만큼 여유가 남아 있다.", "crouching"), driftwood, wood] },
  ];
}

export function withDefaultResourceRooms(rooms: TextRoom[] | undefined, locations: Record<string, { resourceSites?: { id: string }[] }>): TextRoom[] | undefined {
  if (!rooms) return rooms;
  const existing = new Set(rooms.map(room => room.locationId));
  const additions = resourceTextRooms().filter(room => !existing.has(room.locationId) && room.entities.some(entity => entity.components.resourceSite && locations[room.locationId]?.resourceSites?.some(site => site.id === entity.components.resourceSite!.siteId)));
  return [...rooms, ...additions];
}
