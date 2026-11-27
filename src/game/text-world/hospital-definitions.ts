import type { ContentStudioDocument } from "../content-studio";
import type { ContentRegistry } from "../schemas";
import type { TextEntity, TextRoom } from "../schemas/text-world";

export function hospitalTextRooms(): TextRoom[] {
  const object = (id: string, name: string, zone: string, placement: string, surface: string, components: Omit<TextEntity["components"], "position"> = {}) => ({
    id, name, description: surface, details: { anchor: id, placement, outline: name, surface },
    components: { position: { zone }, ...components },
  });
  return [
    { id: "hospital_reception", locationId: "hospital", name: "작은 병원 · 접수실", light: true,
      entryText: "유리 조각이 흩어진 병원 입구를 지나 접수실에 들어선다.", entryAnchor: "거리로 이어지는 병원 입구",
      layout: "병원 입구를 기준으로 정면에 깨진 접수대가 있다. 약품 보관함은 접수대 뒤쪽 아래에, 구조 방송 안내는 왼쪽 벽에 붙어 있다. 접수대 오른쪽의 열린 통로는 임시 처치실로 이어진다.",
      surface: "입구 바닥에는 깨진 유리 조각이 흩어져 있다.", neighbors: ["hospital_triage"],
      sensory: [{ when: "ENTER", detail: "소독약 냄새가 남아 있고, 처치실 쪽에서 낮은 신음이 들린다." }],
      entities: [
        { ...object("hospital_cabinet", "약품 보관함", "hospital_reception", "병원 입구 정면의 접수대 뒤쪽 아래", "철제 보관함의 잠금장치가 휘어져 있다.",
          { stockNode: { nodeId: "hospital_medicine_cabinet" }, container: { items: [] }, openable: { isOpen: false, locked: false } }),
          details: { anchor: "hospital_cabinet", placement: "병원 입구 정면의 접수대 뒤쪽 아래", outline: "낮은 철제 약품 보관함", surface: "철제 보관함의 잠금장치가 휘어져 있다.", posture: "crouching" } },
        object("hospital_reception_desk", "접수대", "hospital_reception", "병원 입구 정면", "깨진 접수대 위에는 먼지가 앉은 명패가 뒤집혀 있다."),
        object("hospital_radio_notice", "구조 방송 안내", "hospital_reception", "병원 입구 기준 왼쪽 벽", "오래된 구조 방송 안내가 벽에 붙어 있다."),
      ] },
    { id: "hospital_triage", locationId: "hospital", name: "작은 병원 · 임시 처치실", light: true,
      entryText: "접수대 오른쪽의 통로를 지나 임시 처치실에 들어선다.", entryAnchor: "접수실로 이어지는 통로",
      layout: "접수실에서 이어지는 통로 앞에 임시 처치대가 있다. 그 옆으로 사람들이 누워 있고, 돌아가는 길은 들어온 통로다.",
      surface: "처치대에는 소독약과 붕대가 놓여 있다.", neighbors: ["hospital_reception"],
      sensory: [{ when: "ENTER", detail: "누워 있는 사람들의 낮은 신음 사이로 소독약 냄새가 남아 있다." }],
      entities: [object("hospital_triage_table", "임시 처치대", "hospital_triage", "접수실 통로에서 바로 앞",
        "처치대 주변에서는 사람들의 이름을 적고 붕대를 정리하고 있다. 남은 소독약으로 응급 처치를 받거나 일손을 보탤 수 있다.",
        { interactionPoint: { actions: [{ actionId: "receive_hospital_first_aid", role: "care" }, { actionId: "help_hospital_triage", role: "work" }] } })] },
  ];
}
/** Existing versions gain the authored region only when its original bindings still exist. Custom rooms win. */
export function withDefaultHospitalRooms<T extends Pick<ContentRegistry, "textRooms" | "locations" | "actions">>(registry: T): T {
  if (!registry.textRooms || registry.textRooms.some(room => room.locationId === "hospital")) return registry;
  if (!registry.locations.hospital?.stockNodes.some(node => node.id === "hospital_medicine_cabinet")) return registry;
  const rooms = hospitalTextRooms();
  for (const entity of rooms.flatMap(room => room.entities)) {
    const point = entity.components.interactionPoint;
    if (point) {
      point.actions = point.actions.filter(a => registry.actions[a.actionId]?.locationIds.includes("hospital"));
      if (!point.actions.length) delete entity.components.interactionPoint;
    }
  }
  return { ...registry, textRooms: [...registry.textRooms, ...rooms] };
}


export function withHospitalDocumentDefaults(document: ContentStudioDocument): ContentStudioDocument {
  const registry = withDefaultHospitalRooms({ textRooms: document.textRooms, locations: Object.fromEntries(document.locations.map(l => [l.id, l])),
    actions: Object.fromEntries([...document.locations.flatMap(l => l.interactionChoices), ...document.stories.flatMap(s => s.actions)].map(a => [a.id, a])) });
  return { ...document, textRooms: registry.textRooms };
}
