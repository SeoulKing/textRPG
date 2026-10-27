import type { ContentRegistry, GameState } from "./schemas";
import type { AcademyMap } from "./schemas/academy-map";

type Room = {
  id: string; name: string; summary: string; q: number; r: number;
  icon: AcademyMap["rooms"][number]["icon"]; sceneId: string; neighbors: string[];
  requirements?: { flag: string; reason: string }[];
};
const enrolled = { flag: "academy_enrolled", reason: "교장실에서 청강생 등록을 해 주세요." };
export const academyRooms: Room[] = [
  { id: "courtyard", name: "학교 앞뜰", summary: "광장과 학교를 잇는 아치문과 작은 분수가 있는 앞뜰.", q: -1, r: 1, icon: "gate", sceneId: "arcana_academy_intro", neighbors: ["hall"] },
  { id: "hall", name: "중앙 회랑", summary: "교장실과 교실, 도서관으로 길이 갈라지는 회랑.", q: 0, r: 0, icon: "arch", sceneId: "academy_hall", neighbors: ["courtyard", "headmaster", "classroom", "practice", "library", "garden"] },
  { id: "headmaster", name: "교장실", summary: "에드윈에게 등록을 신청하고 첫 수업 결과를 보고할 수 있다.", q: 0, r: -1, icon: "desk", sceneId: "academy_headmaster", neighbors: ["hall"] },
  { id: "classroom", name: "기초 강의실", summary: "리네 교수에게 마력 제어와 평원 전투의 기초를 배운다.", q: -1, r: 0, icon: "classroom", sceneId: "academy_classroom", neighbors: ["hall"], requirements: [enrolled] },
  { id: "practice", name: "수정 실습실", summary: "학교의 공급 수정으로 제어 실습을 하고 리네와 이야기할 수 있다.", q: 1, r: 0, icon: "crystal", sceneId: "academy_practice_room", neighbors: ["hall"], requirements: [enrolled, { flag: "academy_theory_completed", reason: "기초 강의실에서 이론 수업을 먼저 들어 주세요." }] },
  { id: "library", name: "도서관", summary: "노엘에게 도서관 안내를 받고 관측탑 점검 의뢰를 확인한다.", q: 1, r: -1, icon: "books", sceneId: "academy_library", neighbors: ["hall", "observatory"] },
  { id: "observatory", name: "천문 관측탑", summary: "도서관의 나선계단 위, 천문판과 관측등이 있는 공간.", q: 1, r: -2, icon: "telescope", sceneId: "academy_observatory", neighbors: ["library"], requirements: [{ flag: "academy_observatory_accepted", reason: "첫 수업을 마친 뒤 도서관에서 관측탑 의뢰를 수락해 주세요." }] },
  { id: "garden", name: "별빛 정원", summary: "돌벤치에서 스텔라와 이야기를 나누고 함께 공부할 수 있다.", q: 0, r: 1, icon: "garden", sceneId: "academy_stella", neighbors: ["hall"] },
];
const sceneRooms: Record<string, string> = {
  arcana_academy_intro: "courtyard", academy_hall: "hall", academy_curriculum: "hall",
  academy_headmaster: "headmaster", academy_school_history: "headmaster", academy_enrolled: "headmaster", academy_orientation_reward: "headmaster",
  academy_classroom: "classroom", academy_theory: "classroom",
  academy_practice_room: "practice", academy_practical: "practice", academy_practical_retry: "practice", academy_practical_passed: "practice",
  academy_stella: "garden", academy_stella_introduced: "garden", academy_stella_partner: "garden", academy_stella_school: "garden", academy_stella_success: "garden",
  academy_library: "library", academy_library_notes: "library", academy_observatory_request: "library", academy_observatory_accepted: "library", academy_observatory_reward: "library",
  academy_observatory: "observatory", academy_observatory_clue: "observatory", academy_observatory_retry: "observatory", academy_observatory_repaired: "observatory", academy_observatory_quiet: "observatory",
};
export function academyRoomId(state: GameState) { return sceneRooms[state.sceneId ?? ""] ?? "courtyard"; }
function entryScene(room: Room, state: GameState) {
  return room.id === "observatory" && state.flags.academy_observatory_repaired ? "academy_observatory_quiet" : room.sceneId;
}
function lockedReason(room: Room, state: GameState) { return room.requirements?.find(requirement => !state.flags[requirement.flag])?.reason ?? ""; }
function blockedReason(state: GameState) {
  if (state.isGameOver || state.stageClear) return "종료된 게임에서는 이동할 수 없습니다.";
  if (state.npcDialogue.active) return "대화를 먼저 마쳐 주세요.";
  if (state.arcanaCombat.battle || state.magicDungeon.run || state.subwayExpedition.active) return "현재 진행 중인 탐험을 먼저 마쳐 주세요.";
  return "";
}
function routeBetween(from: string, to: string, state: GameState) {
  const queue: string[][] = [[from]], seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!, last = path[path.length - 1];
    if (last === to) return path;
    for (const id of academyRooms.find(room => room.id === last)?.neighbors ?? []) {
      const room = academyRooms.find(room => room.id === id)!;
      if (seen.has(id) || lockedReason(room, state)) continue;
      seen.add(id); queue.push([...path, id]);
    }
  }
  return [];
}
export function buildAcademyMap(state: GameState, registry: ContentRegistry): AcademyMap | null {
  if (state.location !== "arcana_academy") return null;
  const currentRoomId = academyRoomId(state), blocked = blockedReason(state);
  return { currentRoomId, blockedReason: blocked, rooms: academyRooms.map(room => {
    const reason = lockedReason(room, state), route = reason ? [] : routeBetween(currentRoomId, room.id, state);
    const canEnter = !blocked && !reason && route.length > 0 && Boolean(registry.scenes[entryScene(room, state)])
      && (room.id !== currentRoomId || state.sceneId !== entryScene(room, state));
    return { id: room.id, name: room.name, summary: room.summary, q: room.q, r: room.r, icon: room.icon,
      neighbors: room.neighbors, isCurrent: room.id === currentRoomId, lockedReason: reason,
      route, minutes: Math.max(0, route.length - 1), action: canEnter ? { type: "academy_move" as const, roomId: room.id } : null };
  }) };
}
export function resolveAcademyMove(state: GameState, roomId: string, registry: ContentRegistry) {
  const map = buildAcademyMap(state, registry), room = academyRooms.find(room => room.id === roomId);
  if (!map || !room) throw new Error("현재 학교에서 이동할 수 있는 공간이 아닙니다.");
  const target = map.rooms.find(candidate => candidate.id === roomId)!;
  if (!target.action) throw new Error(map.blockedReason || target.lockedReason || "이미 이 공간에 있습니다.");
  return { sceneId: entryScene(room, state), minutes: target.minutes };
}
