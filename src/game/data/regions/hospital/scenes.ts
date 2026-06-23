import type { SceneDefinition } from "../../../schemas";

export const hospitalSceneDefinitions: SceneDefinition[] = [
  {
    id: "hospital_medicine_cabinet_scene",
    locationId: "hospital",
    title: "약품 보관함",
    paragraphs: [
      "휘어진 철제 보관함 안에는 급히 뒤져 간 손자국이 남아 있다. 그래도 안쪽 칸에는 아직 쓸 만한 약품과 천 조각, 수액줄, 묵직한 배터리가 남아 있다.",
      "복도 바깥에서 누군가 낮게 앓는 소리가 들린다. 오래 머물수록 이곳의 공기는 몸보다 마음을 먼저 눌러 온다.",
    ],
    choiceIds: [
      "collect_radio_battery_from_hospital",
      "collect_pain_relief_from_hospital",
      "collect_cloth_from_hospital",
      "collect_cordage_from_hospital",
      "leave_hospital_medicine_cabinet",
    ],
    conditions: [
      { type: "location", locationId: "hospital" },
      { type: "active_stock_node", nodeId: "hospital_medicine_cabinet" },
    ],
  },
  {
    id: "hospital_first_intro",
    locationId: "hospital",
    title: "작은 병원",
    paragraphs: [
      "병원 유리문은 반쯤 깨져 있고, 접수대 위에는 이름표가 뒤집힌 채 먼지를 뒤집어쓰고 있다. 소독약 냄새는 아직 남아 있지만, 그 냄새가 더 이상 안전을 뜻하지는 않는다.",
      "벽 한쪽에는 오래된 구조 무전기 안내문이 붙어 있다. 전원 부품만 찾는다면, 구조 신호를 보낼 준비에 한 걸음 가까워질 수 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "hospital" },
      { type: "flag_not", flag: "intro_seen_hospital" },
    ],
    introFlag: "intro_seen_hospital",
  },
  {
    id: "hospital_repeat_intro",
    locationId: "hospital",
    title: "작은 병원",
    paragraphs: [
      "깨진 로비는 여전히 조용하지 않다. 약품 보관함과 임시 처치대 사이에서, 오늘 챙길 것과 견딜 것을 골라야 한다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "hospital" },
      { type: "flag", flag: "intro_seen_hospital" },
    ],
  },
];
