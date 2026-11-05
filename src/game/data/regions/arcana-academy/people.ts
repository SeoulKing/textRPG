export const academyPeople = {
  academy_headmaster: {
    id: "academy_headmaster", name: "에드윈", role: "아르카나 아카데미 교장",
    personality: ["침착함", "관찰을 중시함", "실수한 학생에게 다시 기회를 줌"],
    relationToPlayer: "학교를 찾아온 방문객이다. 등록과 수업 이수 여부는 실제 진행에 따른다.",
    inventoryItemIds: [], locationId: "arcana_academy",
    summary: "은테 안경과 잉크 묻은 소매가 눈에 띄는 노교장. 학생의 재능보다 실수 뒤에 무엇을 확인했는지 묻는다.",
  },
  stella: {
    id: "stella", name: "스텔라", role: "아르카나 아카데미 기초과정 학생",
    personality: ["밝고 장난기가 있음", "친구의 작은 변화를 잘 알아챔", "막히는 문제를 혼자 끌어안는 버릇"],
    relationToPlayer: "학교에서 처음 마주친 동기다. 서로 소개하거나 함께 공부하기로 한 일은 실제 선택에 따른다.",
    inventoryItemIds: [], locationId: "arcana_academy",
    summary: "스무 살의 은발 미소녀. 보랏빛 눈과 별 모양 머리핀이 인상적이다. 농담으로 실수를 넘기려 하지만 틀린 마법진을 끝내 고쳐 내는 성실한 학생이다.",
  },
  academy_instructor: {
    id: "academy_instructor", name: "리네", role: "기초 마법 실습 교수",
    personality: ["간결하고 엄격함", "안전을 먼저 확인함", "잘한 점을 구체적으로 짚어 줌"],
    relationToPlayer: "방문객 또는 청강생으로 만난다. 수업 이수 여부는 실제 기록에 따른다.",
    inventoryItemIds: [], locationId: "arcana_academy",
    summary: "짧게 묶은 갈색 머리의 실습 교수. 작은 불꽃으로도 실험대가 그을릴 수 있다며 항상 마력 차단 고리를 먼저 점검한다.",
  },
  academy_librarian: {
    id: "academy_librarian", name: "노엘", role: "도서관 사서 겸 관측탑 관리인",
    personality: ["조용함", "기록과 실물을 대조함", "낡은 물건을 쉽게 버리지 않음"],
    relationToPlayer: "도서관을 이용하러 온 사람이다. 관측탑 의뢰 수락과 해결 여부는 실제 진행에 따른다.",
    inventoryItemIds: [], locationId: "arcana_academy",
    summary: "붉은 책갈피를 소매에 꽂아 두는 사서. 책의 오탈자를 찾듯 관측탑의 고장 난 부품을 하나씩 대조한다.",
  },
} as const;
