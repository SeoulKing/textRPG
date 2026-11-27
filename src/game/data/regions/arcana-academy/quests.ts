import type { QuestDefinition } from "../../../schemas";

export const academyQuests: QuestDefinition[] = [
  {
    id: "academy_first_lesson", title: "마법학교의 첫 수업", type: "side",
    description: "청강생으로 등록한 뒤 기초 이론과 수정 실습을 마치고, 도서관 이용 안내를 들은 다음 교장에게 보고한다.",
    prerequisites: [{ type: "flag", flag: "academy_enrolled" }],
    objectives: [{ type: "flag", flag: "academy_orientation_complete" }], requiredItems: [],
    rewards: [{ type: "add_item", itemId: "manaPotion", amount: 1 }, { type: "add_item", itemId: "moonHerb", amount: 2 }],
    guidance: {
      gathering: "학교의 수업·도서관 메뉴에서 리네의 기초 이론, 수정 실습, 노엘의 도서관 안내를 마친 뒤 교장실로 간다.",
      ready: "교장실에서 첫 수업을 마쳤다고 보고한다.",
      completion: { kind: "choice", id: "academy_report_orientation", locationId: "arcana_academy" },
    }, relatedNpcIds: ["academy_headmaster", "academy_instructor", "academy_librarian"], relatedLocationIds: ["arcana_academy"],
  },
  {
    id: "academy_silent_observatory", title: "빛이 멎은 관측탑", type: "side",
    description: "노엘의 의뢰를 받아 관측탑의 천문판을 살피고, 기록에 맞게 세 고리를 정렬한 다음 도서관에 결과를 전한다.",
    prerequisites: [{ type: "flag", flag: "academy_observatory_accepted" }],
    objectives: [{ type: "flag", flag: "academy_observatory_reported" }], requiredItems: [],
    rewards: [{ type: "add_item", itemId: "manaShard", amount: 1 }, { type: "add_item", itemId: "arcaneDust", amount: 2 }],
    guidance: {
      gathering: "도서관에서 관측탑으로 올라가 천문판을 관찰한다. 초승달에서 보름달을 거쳐 별을 향한다는 관리 기록을 참고한다.",
      ready: "도서관으로 돌아가 노엘에게 다시 켜진 관측등에 관해 보고한다.",
      completion: { kind: "choice", id: "academy_report_observatory", locationId: "arcana_academy" },
    }, relatedNpcIds: ["academy_librarian", "stella"], relatedLocationIds: ["arcana_academy"],
  },
];
