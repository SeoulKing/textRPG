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
  {
    id: "hospital_triage_pain_relief",
    locationId: "hospital",
    title: "임시 처치대",
    paragraphs: [
      "당신은 접수대 옆에 누운 사람들의 이름을 받아 적고, 젖은 천으로 피가 굳은 손을 닦아 준다. 누군가는 고맙다는 말 대신 눈만 감고, 누군가는 숨을 고르는 데 온 힘을 쓴다.",
      "일을 마치자 처치대의 남자가 작은 종이 포장을 하나 건넨다. 진통제 한 알. 지금 이곳에서는 돈보다 직접적인 대가다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "hospital" }],
  },
  {
    id: "hospital_triage_cloth",
    locationId: "hospital",
    title: "임시 처치대",
    paragraphs: [
      "더러운 붕대와 아직 쓸 수 있는 천을 가르는 일은 생각보다 오래 걸린다. 피가 밴 것은 한쪽으로, 마른 것은 다시 접어 상자에 넣는다.",
      "남은 천 조각 하나를 챙겨도 된다는 허락이 떨어진다. 거처의 틈을 막거나 새 붕대로 쓰기에는 충분한 길이다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "hospital" }],
  },
  {
    id: "hospital_triage_cordage",
    locationId: "hospital",
    title: "임시 처치대",
    paragraphs: [
      "당신은 침대 난간에 엉킨 수액줄과 고정끈을 하나씩 풀어낸다. 플라스틱은 뻣뻣하고 손끝에는 소독약 냄새가 오래 남는다.",
      "버려질 줄 묶음 몇 개가 손에 남는다. 제대로 묶어 두면 도구 손잡이를 감거나 임시 고정을 할 때 쓸 수 있을 것이다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "hospital" }],
  },
  {
    id: "hospital_triage_treatment",
    locationId: "hospital",
    title: "임시 처치대",
    paragraphs: [
      "환자들을 옮기는 일을 돕고 나자 팔과 어깨가 무겁게 내려앉는다. 그래도 처치대 주변은 조금 정돈되고, 누군가 누울 자리가 하나 더 생긴다.",
      "\"잠깐 앉아.\"",
      "낡은 의자가 밀려오고, 소독약이 상처 위를 지나간다. 따끔한 통증 뒤에 붕대가 감기자 몸이 조금은 다시 말을 듣는다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "hospital" }],
  },
];
