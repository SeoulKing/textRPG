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
  {
    id: "checkpoint_perimeter_scrap",
    locationId: "checkpoint",
    title: "초소 주변 정찰",
    paragraphs: [
      "당신은 뒤집힌 차단봉 아래로 몸을 낮추고, 바닥에 박힌 금속 부품을 하나씩 흔들어 본다. 오래된 볼트는 쉽게 풀리지 않지만, 녹슨 연결부는 힘을 주자 마른 소리를 내며 떨어진다.",
      "차량 잔해 너머에서 바람이 한 번 길게 분다. 당신은 소리에 귀를 기울인 뒤 쓸 만한 고철 조각들을 챙겨 초소 그늘로 물러난다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "checkpoint" }],
  },
  {
    id: "checkpoint_perimeter_cordage",
    locationId: "checkpoint",
    title: "초소 주변 정찰",
    paragraphs: [
      "초소 뒤편에는 끊어진 케이블과 포장 끈이 흙먼지 속에 엉켜 있다. 당신은 쓸 수 있는 부분만 골라내며 손가락으로 매듭을 풀고, 너무 삭은 것은 그 자리에 버린다.",
      "모아 둔 끈 묶음은 보기보다 단단하다. 임시 수리나 짐을 묶는 데는 충분히 버틸 것이다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "checkpoint" }],
  },
  {
    id: "checkpoint_perimeter_ticket",
    locationId: "checkpoint",
    title: "초소 주변 정찰",
    paragraphs: [
      "당신은 문이 반쯤 열린 초소 안쪽을 더듬어 낡은 서랍을 당긴다. 먼지와 빈 탄피 사이에서 구겨진 종이 한 장이 손끝에 걸린다.",
      "배식권이다. 누가 왜 이곳에 두고 갔는지는 알 수 없지만, 아직 도장이 번지지 않았다. 굶주린 줄 앞에서는 충분히 통할 만한 약속이다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "checkpoint" }],
  },
  {
    id: "checkpoint_perimeter_injury",
    locationId: "checkpoint",
    title: "초소 주변 정찰",
    paragraphs: [
      "당신은 무너진 차단봉을 넘다가 균형을 잃는다. 휘어진 금속 끝이 다리를 스치고, 짧고 뜨거운 통증이 뒤늦게 올라온다.",
      "큰 상처는 아니지만 피가 배어 나온다. 검문소는 비어 있어도, 날카로운 잔해만큼은 아직 사람을 붙잡을 힘이 남아 있다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "checkpoint" }],
  },
];
