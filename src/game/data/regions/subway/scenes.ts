import type { SceneDefinition } from "../../../schemas";

export const subwaySceneDefinitions: SceneDefinition[] = [
  {
    id: "subway_signal_box_scene",
    locationId: "subway",
    title: "역무실 신호함",
    paragraphs: [
      "역무실 벽면 신호함은 억지로 열린 흔적이 있지만, 안쪽 부품까지 모두 털리지는 않았다. 접이식 안테나와 고철 조각, 책상 아래 굴러 들어간 물병이 보인다.",
      "승강장 쪽 어둠은 너무 깊어서, 시선을 오래 두면 누군가 이쪽을 보고 있는 듯한 착각이 든다.",
    ],
    choiceIds: [
      "collect_radio_antenna_from_subway",
      "collect_scrap_from_subway",
      "collect_water_from_subway",
      "leave_subway_signal_box",
    ],
    conditions: [
      { type: "location", locationId: "subway" },
      { type: "active_stock_node", nodeId: "subway_signal_box" },
    ],
  },
  {
    id: "subway_first_intro",
    locationId: "subway",
    title: "지하철역",
    paragraphs: [
      "지하철역 입구는 낮에도 밤처럼 어둡다. 멈춘 에스컬레이터 아래로 먼지와 쇳냄새가 고여 있고, 발소리는 생각보다 멀리 울린다.",
      "역무실 쪽 벽에는 아직 통신 장비 일부가 남아 있다. 구조 신호를 멀리 보내려면 안테나가 필요하다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "subway" },
      { type: "flag_not", flag: "intro_seen_subway" },
    ],
    introFlag: "intro_seen_subway",
  },
  {
    id: "subway_repeat_intro",
    locationId: "subway",
    title: "지하철역",
    paragraphs: [
      "어두운 승강장과 역무실은 여전히 숨을 죽이고 있다. 이곳에서 얻을 수 있는 건 분명 있지만, 오래 머물수록 마음이 먼저 닳는다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "subway" },
      { type: "flag", flag: "intro_seen_subway" },
    ],
  },
];
