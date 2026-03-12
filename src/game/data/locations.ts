/**
 * 장소 기본 데이터
 */

type LinkDefinition = {
  note: string;
  requiredFlag?: string;
  blockedReason?: string;
};

export type BaseLocation = {
  id: string;
  name: string;
  risk: "안전" | "낮음" | "보통" | "봉쇄";
  imagePath: string;
  summary: string;
  tags: string[];
  traits: string[];
  obtainableItemIds: string[];
  residentIds: string[];
  links: Record<string, LinkDefinition>;
};

export const baseLocations: Record<string, BaseLocation> = {
  shelter: {
    id: "shelter",
    name: "임시 거처",
    risk: "안전",
    imagePath: "assets/scenes/camp.svg",
    summary: "천막과 담요, 깡통 난로가 모인 가장 안전한 거점이다.",
    tags: ["거점", "수면", "안전"],
    traits: ["휴식 가능", "비교적 안전", "정보 정리"],
    obtainableItemIds: ["emergencySnack", "waterBottle"],
    residentIds: [],
    links: {
      convenience: { note: "무너진 횡단보도를 건너 편의점 잔해 쪽으로 간다." },
      kitchen: { note: "배식 줄이 생기는 급식소로 향한다." },
      alley: { note: "생활권 가장자리 골목을 따라 돈다." },
      hospital: { note: "멀리 보이는 폐병원 건물 쪽 골목을 따라 간다." },
    },
  },
  convenience: {
    id: "convenience",
    name: "편의점 잔해",
    risk: "낮음",
    imagePath: "assets/scenes/mart.svg",
    summary: "반쯤 무너진 매장 안에 자잘한 물자가 남아 있다.",
    tags: ["식량", "초기 수색"],
    traits: ["초기 수색", "소형 물자", "낮은 위험"],
    obtainableItemIds: ["emergencySnack", "cannedFood", "rawRice", "vegetables", "waterBottle"],
    residentIds: [],
    links: {
      shelter: { note: "거처 쪽 골목으로 돌아간다." },
      alley: { note: "상가 뒷골목으로 이어진다." },
      subway: { note: "인근 지하철역 입구로 내려간다." },
    },
  },
  kitchen: {
    id: "kitchen",
    name: "급식소",
    risk: "낮음",
    imagePath: "assets/scenes/camp.svg",
    summary: "주민과 피란민이 뒤섞여 한 끼를 해결하는 배식 거점이다.",
    tags: ["식사", "물"],
    traits: ["배식", "물 확보", "요리", "소문 교류"],
    obtainableItemIds: ["hotMeal", "waterBottle", "rationTicket", "rawRice", "vegetables"],
    residentIds: ["oldCook"],
    links: {
      shelter: { note: "거처 쪽으로 되돌아간다." },
      alley: { note: "낮은 담장을 따라 골목으로 빠진다." },
      riverside: { note: "하천변 쪽 산책로를 따라 내려간다." },
    },
  },
  alley: {
    id: "alley",
    name: "작은 상가 골목",
    risk: "낮음",
    imagePath: "assets/scenes/checkpoint.svg",
    summary: "거래와 소문이 빠르게 도는 생활권 중심 골목이다.",
    tags: ["거래", "소문", "루트 해금"],
    traits: ["거래 중심", "소문 수집", "우회로"],
    obtainableItemIds: ["scrapBundle", "cannedFood"],
    residentIds: ["alleyBroker"],
    links: {
      shelter: { note: "잠자리가 있는 거처로 되돌아간다." },
      convenience: { note: "편의점 잔해 쪽으로 간다." },
      kitchen: { note: "급식소 쪽으로 걸음을 옮긴다." },
      subway: { note: "지하철역 입구가 보이는 큰길로 빠진다." },
      mart: { note: "골목 뒤편 우회로를 지나 폐마트로 향한다." },
      hospital: { note: "무너진 병원 건물 쪽 골목을 따라 간다." },
    },
  },
  subway: {
    id: "subway",
    name: "지하철역",
    risk: "보통",
    imagePath: "assets/scenes/subway.svg",
    summary: "정전된 역사 안엔 소문과 불안이 겹겹이 쌓여 있다.",
    tags: ["소문", "이상 징후"],
    traits: ["이상 징후", "어두운 통로", "경계 필요"],
    obtainableItemIds: ["painRelief", "scrapBundle"],
    residentIds: ["subwayWatcher"],
    links: {
      convenience: { note: "편의점 잔해 방향 출구로 올라간다." },
      alley: { note: "상가 골목 쪽 출구로 빠져나간다." },
      mart: { note: "폐마트 지하 주차장 방면으로 이동한다." },
      hospital: { note: "병원 연결 지하 통로로 빠진다." },
      control: {
        note: "군 통제선 인근의 철조망 쪽으로 이동한다.",
        requiredFlag: "controlLineOpened",
        blockedReason: "지금은 통제선 인근에 갈 이유도, 길도 확실하지 않다.",
      },
    },
  },
  mart: {
    id: "mart",
    name: "폐마트",
    risk: "보통",
    imagePath: "assets/scenes/mart.svg",
    summary: "창고와 셔터 안쪽엔 아직 쓸 만한 물자가 남아 있다.",
    tags: ["식량", "약품", "돈"],
    traits: ["대형 수색", "은닉 물자", "중간 위험"],
    obtainableItemIds: ["cannedFood", "rawRice", "vegetables", "painRelief", "scrapBundle", "waterBottle"],
    residentIds: [],
    links: {
      alley: { note: "골목 우회로로 되돌아간다." },
      subway: { note: "역사 하부 통로를 따라 이동한다." },
      riverside: { note: "하천변 옆 제방길로 빠진다." },
    },
  },
  riverside: {
    id: "riverside",
    name: "하천변",
    risk: "보통",
    imagePath: "assets/scenes/riverside.svg",
    summary: "물과 부유물이 모이는 대신, 수상한 거래도 빨리 흐르는 곳이다.",
    tags: ["물", "거래", "이상 징후"],
    traits: ["물자 부유", "비공식 거래", "불안한 기척"],
    obtainableItemIds: ["waterBottle", "scrapBundle", "rationTicket"],
    residentIds: ["riversideTrader"],
    links: {
      kitchen: { note: "급식소 뒤편 길로 되돌아간다." },
      mart: { note: "폐마트 방면 제방길을 따라간다." },
      control: {
        note: "군 통제선 인근으로 난 샛길을 따라간다.",
        requiredFlag: "controlLineOpened",
        blockedReason: "통제선 쪽 분위기를 확실히 파악한 뒤에야 움직일 수 있다.",
      },
    },
  },
  control: {
    id: "control",
    name: "통제선 인근",
    risk: "봉쇄",
    imagePath: "assets/scenes/checkpoint.svg",
    summary: "녹슨 철조망과 폐검문소 잔해 너머로 외곽 하늘이 가장 잘 보이는 위험 지대다.",
    tags: ["위험", "최종 정찰"],
    traits: ["봉쇄 구역", "높은 긴장", "최종 단서"],
    obtainableItemIds: [],
    residentIds: [],
    links: {
      subway: { note: "지하철역 방면으로 급히 물러난다." },
      riverside: { note: "하천변 제방길로 돌아간다." },
    },
  },
  hospital: {
    id: "hospital",
    name: "폐병원",
    risk: "보통",
    imagePath: "assets/scenes/checkpoint.svg",
    summary: "정전된 병원 건물. 응급실과 약국 잔해에 아직 쓸 만한 의약품이 남아 있다.",
    tags: ["약품", "수색"],
    traits: ["의약품 수색", "어두운 복도", "경계 필요"],
    obtainableItemIds: ["painRelief", "waterBottle"],
    residentIds: [],
    links: {
      shelter: { note: "거처 쪽 골목으로 되돌아간다." },
      alley: { note: "골목 쪽 출구로 빠져나간다." },
      subway: { note: "지하철역 연결 통로로 되돌아간다." },
    },
  },
};
