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
    title: "지하철역 대합실",
    paragraphs: [
      "지하철역 입구는 낮에도 밤처럼 어둡다. 멈춘 에스컬레이터 아래 대합실에는 먼지와 쇳냄새가 고여 있고, 깨진 개찰구 너머 계단은 더 깊은 지하로 이어진다.",
      "대합실은 심층부보다 안전하다. 벽에 기대 숨을 고르고 가방과 장비를 정리한 뒤, 준비가 되면 지하 1층으로 내려갈 수 있다.",
      "역무실 쪽 벽에는 아직 통신 장비 일부가 남아 있다. 반대편 지상 출구는 구조대 무전 소문이 돌던 검문소 방향으로 이어진다.",
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
    title: "지하철역 대합실",
    paragraphs: [
      "어두운 대합실과 역무실은 여전히 숨을 죽이고 있다. 이곳에서는 심층 탐험에 앞서 숨을 고르고 장비와 가방을 정돈할 수 있다.",
      "깨진 개찰구 너머 계단은 지하 1층으로 내려가고, 반대편 지상 출구는 검문소 방향으로 열려 있다.",
    ],
    choiceIds: [],
    conditions: [
      { type: "location", locationId: "subway" },
      { type: "flag", flag: "intro_seen_subway" },
    ],
  },
  {
    id: "subway_platform_scrap",
    locationId: "subway",
    title: "승강장 자재",
    paragraphs: [
      "당신은 선로 가장자리로 몸을 낮추고, 떨어진 안내판 받침과 휘어진 좌석 프레임을 조심스럽게 잡아당긴다. 금속은 오래된 먼지와 기름때로 미끄럽지만, 아직 힘을 주면 뜯겨 나온다.",
      "승강장 끝에서 작은 소리가 한 번 튄다. 사람인지, 떨어진 돌인지 알 수 없어 잠시 숨을 죽인다. 아무도 나타나지 않자 당신은 챙긴 고철을 품에 끌어안고 다시 위로 올라온다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "subway" }],
  },
  {
    id: "subway_platform_cordage",
    locationId: "subway",
    title: "승강장 자재",
    paragraphs: [
      "손잡이 줄은 대부분 끊겨 있었지만, 일부는 아직 천장 고리에 매달린 채 흔들리고 있다. 당신은 발끝으로 균형을 잡고 남은 줄과 케이블을 끌어내린다.",
      "하나씩 묶어 보니 쓸 만한 길이가 나온다. 어둠 속에서 손바닥을 스치는 섬유와 피복의 감촉만이, 지금 손에 넣은 것이 실제 물건이라는 감각을 준다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "subway" }],
  },
  {
    id: "subway_platform_water",
    locationId: "subway",
    title: "승강장 자재",
    paragraphs: [
      "당신은 뒤집힌 의자 사이를 더듬다가 플라스틱 병이 굴러가는 둔한 소리를 듣는다. 손전등 없이 손끝만으로 좁은 틈을 더듬자, 먼지를 뒤집어쓴 물병 하나가 잡힌다.",
      "봉인은 뜯기지 않았다. 이곳의 공기와 달리 병 안의 물은 아직 조용하다. 당신은 그것을 가방 깊숙이 밀어 넣는다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "subway" }],
  },
  {
    id: "subway_platform_cut",
    locationId: "subway",
    title: "승강장 자재",
    paragraphs: [
      "낡은 광고판 아래쪽을 뜯어내는 순간, 숨겨져 있던 날카로운 금속 가장자리가 손등을 긁고 지나간다. 짧은 통증이 팔을 타고 올라오고, 피가 천천히 맺힌다.",
      "그래도 빈손은 아니다. 당신은 숨을 고르고 고철 조각 하나를 챙긴다. 이곳에서는 작은 실수도 대가를 요구한다는 사실만 더 분명해졌다.",
    ],
    choiceIds: [],
    conditions: [{ type: "location", locationId: "subway" }],
  },
];
