import type { SceneDefinition } from "../../../schemas";

export const checkpointSceneDefinitions: SceneDefinition[] = [
  {
    id: "checkpoint_radio_truck_scene",
    locationId: "checkpoint",
    title: "통신 차량",
    paragraphs: [
      "차량 문은 반쯤 열린 채 멈춰 있고, 내부에는 급히 빠져나간 사람들의 흔적이 그대로 남아 있다. 먼지 아래로 송신기 모듈, 응급 가방, 구겨진 배급표가 보인다.",
      "검문소 바깥에서는 바람이 차단봉을 흔든다. 오래 머물수록 이곳을 지나간 사람들의 긴장이 몸에 옮겨 붙는다.",
    ],
    choiceIds: [
      "collect_radio_transmitter_from_checkpoint",
      "collect_pain_relief_from_checkpoint",
      "collect_ration_ticket_from_checkpoint",
      "leave_checkpoint_radio_truck",
    ],
    conditions: [
      { type: "location", locationId: "checkpoint" },
      { type: "active_stock_node", nodeId: "checkpoint_radio_truck" },
    ],
  },
  {
    id: "checkpoint_first_intro",
    locationId: "checkpoint",
    title: "검문소",
    paragraphs: [
      "검문소는 도시의 끝처럼 보인다. 뒤집힌 차단봉, 비어 있는 초소, 멈춰 선 통신 차량이 한 줄로 늘어서 있다.",
      "어딘가에선 구조대가 이 구역을 훑고 지나간다는 말이 돌았다. 확실한 것은 없다. 하지만 신호를 보낼 장비를 완성하려면 이곳을 그냥 지나치기는 어렵다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "checkpoint" },
      { type: "flag_not", flag: "intro_seen_checkpoint" },
    ],
    introFlag: "intro_seen_checkpoint",
  },
  {
    id: "checkpoint_repeat_intro",
    locationId: "checkpoint",
    title: "검문소",
    paragraphs: [
      "버려진 초소와 통신 차량 사이로 먼지가 낮게 흐른다. 구조대가 온다는 말은 여전히 소문에 가깝지만, 이곳에는 그 소문을 붙잡을 만한 장비가 남아 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "checkpoint" },
      { type: "flag", flag: "intro_seen_checkpoint" },
    ],
  },
];
