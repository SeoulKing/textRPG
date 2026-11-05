import type { ChoiceDefinition, Condition, Effect } from "../../../schemas";
import { sceneChoice } from "../../scene-choice-helpers";

type Step = { conditions?: Condition[]; flags?: string[]; minutes?: number; effects?: Effect[]; hint?: string };
function option(id: string, label: string, nextSceneId: string, step: Step = {}): ChoiceDefinition {
  return sceneChoice({
    id, label, nextSceneId, outcomeHint: step.hint ?? "", showOutcomeHint: Boolean(step.hint), riskHint: "low",
    tags: ["academy-authored"], conditions: [{ type: "location", locationId: "arcana_academy" }, ...(step.conditions ?? [])],
    effects: [...(step.flags ?? []).map(flag => ({ type: "set_flag" as const, flag })), ...(step.effects ?? []),
      ...(step.minutes ? [{ type: "advance_time" as const, minutes: step.minutes }] : [])],
  });
}
const enrolled: Condition = { type: "flag", flag: "academy_enrolled" };
const notDone = (flag: string): Condition => ({ type: "flag_not", flag });
const done = (flag: string): Condition => ({ type: "flag", flag });

export const academyChoices: ChoiceDefinition[] = [
  option("academy_visit_headmaster", "교장실에서 에드윈을 만난다", "academy_headmaster", { flags: ["academy_headmaster_met"] }),
  option("academy_visit_stella", "앞뜰의 은발 학생에게 다가간다", "academy_stella", { conditions: [notDone("academy_stella_met")] }),
  option("academy_visit_stella_again", "앞뜰에서 스텔라를 만난다", "academy_stella", { conditions: [done("academy_stella_met")] }),
  option("academy_open_curriculum", "수업과 도서관을 살펴본다", "academy_curriculum"),
  option("academy_return_courtyard", "학교 앞뜰로 돌아간다", "arcana_academy_intro"),
  option("academy_enroll", "청강생으로 등록한다", "academy_enrolled", {
    conditions: [notDone("academy_enrolled")], flags: ["academy_enrolled"], minutes: 5, hint: "무료 등록 · 첫 수업 의뢰 시작 · 5분",
  }),
  option("academy_ask_school", "이 학교와 포탈에 관해 묻는다", "academy_school_history"),
  option("academy_return_headmaster", "교장에게 돌아간다", "academy_headmaster"),
  option("academy_report_orientation", "첫 수업을 마쳤다고 보고한다", "academy_orientation_reward", {
    conditions: [enrolled, done("academy_theory_completed"), done("academy_practical_passed"), done("academy_library_briefed"), notDone("academy_orientation_complete")],
    flags: ["academy_orientation_complete"], hint: "첫 수업 완료 · {{item:manaPotion}} 1개와 {{item:moonHerb}} 2개",
  }),
  option("academy_introduce_stella", "이름을 소개하고 친구가 되고 싶다고 말한다", "academy_stella_introduced", {
    conditions: [notDone("academy_stella_met")], flags: ["academy_stella_met"],
  }),
  option("academy_study_with_stella", "스텔라에게 함께 공부하자고 제안한다", "academy_stella_partner", {
    conditions: [done("academy_stella_met"), notDone("academy_stella_partner")], flags: ["academy_stella_partner"], minutes: 5,
  }),
  option("academy_ask_stella_school", "스텔라에게 학교생활에 관해 묻는다", "academy_stella_school"),
  option("academy_share_stella_success", "관측탑에서 있었던 일을 이야기한다", "academy_stella_success", {
    conditions: [done("academy_stella_met"), done("academy_observatory_repaired")],
  }),
  option("academy_return_stella", "스텔라 쪽으로 돌아간다", "academy_stella"),
  option("academy_attend_theory", "리네의 기초 이론을 듣는다", "academy_theory", {
    conditions: [enrolled], flags: ["academy_theory_completed"], minutes: 15, hint: "마력 제어와 평원 전투의 기초 · 15분",
  }),
  option("academy_open_practical", "수정 제어 실습에 참여한다", "academy_practical", {
    conditions: [enrolled, done("academy_theory_completed"), notDone("academy_practical_passed")],
  }),
  option("academy_trace_inner", "안쪽 홈부터 천천히 마력의 길을 잇는다", "academy_practical_passed", {
    conditions: [enrolled, done("academy_theory_completed"), notDone("academy_practical_passed")],
    flags: ["academy_practical_passed"], minutes: 15, hint: "학교의 실습용 수정으로 제어 연습 · 15분",
  }),
  option("academy_push_outer", "바깥 고리부터 한 번에 연결해 본다", "academy_practical_retry", {
    conditions: [enrolled, done("academy_theory_completed"), notDone("academy_practical_passed")], minutes: 5, hint: "차단 장치가 있는 연습대 · 5분",
  }),
  option("academy_return_curriculum", "회랑의 수업 안내판으로 돌아간다", "academy_curriculum"),
  option("academy_visit_library", "도서관에서 노엘을 만난다", "academy_library"),
  option("academy_library_orientation", "노엘에게 서가와 대출 규칙을 안내받는다", "academy_library_notes", {
    conditions: [notDone("academy_library_briefed")], flags: ["academy_library_briefed"], minutes: 5,
  }),
  option("academy_read_observatory_request", "빛이 멎은 관측탑에 관해 묻는다", "academy_observatory_request", {
    conditions: [done("academy_orientation_complete"), notDone("academy_observatory_reported")],
  }),
  option("academy_accept_observatory", "관측탑의 천문판을 살펴보겠다고 한다", "academy_observatory_accepted", {
    conditions: [done("academy_orientation_complete"), notDone("academy_observatory_accepted")],
    flags: ["academy_observatory_accepted"], hint: "관측탑 의뢰 시작 · 위 지도에서 관측탑으로 이동",
  }),
  option("academy_resume_observatory", "관측탑으로 올라간다", "academy_observatory", {
    conditions: [done("academy_observatory_accepted"), notDone("academy_observatory_repaired")], minutes: 5,
  }),
  option("academy_inspect_astrarium", "천문판의 문양과 닳은 홈을 관찰한다", "academy_observatory_clue", {
    conditions: [done("academy_observatory_accepted"), notDone("academy_observatory_repaired")],
    flags: ["academy_astrarium_inspected"], minutes: 5,
  }),
  option("academy_align_astrarium", "초승달·보름달·별 순서로 고리를 맞춘다", "academy_observatory_repaired", {
    conditions: [done("academy_observatory_accepted"), done("academy_astrarium_inspected"), notDone("academy_observatory_repaired")],
    flags: ["academy_observatory_repaired"], minutes: 10,
  }),
  option("academy_align_star_first", "별 문양을 맨 앞에 맞춰 본다", "academy_observatory_retry", {
    conditions: [done("academy_observatory_accepted"), done("academy_astrarium_inspected"), notDone("academy_observatory_repaired")], minutes: 5,
  }),
  option("academy_report_observatory", "노엘에게 관측등이 다시 켜졌다고 보고한다", "academy_observatory_reward", {
    conditions: [done("academy_observatory_repaired"), notDone("academy_observatory_reported")],
    flags: ["academy_observatory_reported"], hint: "관측탑 의뢰 완료 · {{item:manaShard}} 1개와 {{item:arcaneDust}} 2개",
  }),
  option("academy_return_library", "도서관의 노엘에게 돌아간다", "academy_library"),
  option("academy_view_observatory", "다시 켜진 관측등을 보러 간다", "academy_observatory_quiet", {
    conditions: [done("academy_observatory_reported")], minutes: 5,
  }),
];