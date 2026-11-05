import type { SceneDefinition } from "../../../schemas";

function scene(id: string, title: string, paragraphs: string[], choiceIds: string[]): SceneDefinition {
  return { id, title, paragraphs, choiceIds, locationId: "arcana_academy",
    conditions: [{ type: "location", locationId: "arcana_academy" }], tags: ["academy:content-v2"], suppressLocationInteractions: true };
}
const courtyard = "academy_return_courtyard", lessons = "academy_return_curriculum", library = "academy_return_library";
export const academyScenes: SceneDefinition[] = [
  scene("arcana_academy_intro", "아르카나 아카데미", [
    "식당 북쪽의 돌길을 따라 아치문을 지나니 분수 소리 대신 유리잔을 두드리는 듯한 맑은 울림이 들린다. 회랑 안 실습대 위에서 푸른 불꽃이 솟았다가, 갈색 머리 교수가 고리를 돌리자 손톱만 한 크기로 줄어든다.",
    "회랑 너머 정원의 돌벤치에서는 은발 학생이 무릎에 펼친 공책을 황급히 덮는다. 삐죽 나온 종이 끝에는 지워 쓴 별 문양이 겹쳐 있고, 머리핀의 작은 별이 고개를 드는 움직임에 흔들린다. 반대편 계단에는 교장실 푯말, 책 냄새가 나는 복도에는 도서관 안내가 걸려 있다.",
  ], ["academy_visit_headmaster", "academy_visit_stella", "academy_visit_stella_again", "academy_open_curriculum"]),
  scene("academy_headmaster", "에드윈의 교장실", [
    "문을 두드리자 안에서 들어오라는 목소리가 난다. 은테 안경을 쓴 노인이 서류 사이에 마른 잎 한 장을 끼우고 빈 의자 쪽으로 손을 펼친다. 잉크 묻은 소매는 걷어 올렸는데, 찻잔 받침에는 파랗게 번진 지문이 남아 있다.",
    "“교장 에드윈일세. 정식 입학을 정하기 전에 청강생으로 수업을 들어도 좋네. 비용은 받지 않아. 기초 이론과 제어 실습을 해 보고, 노엘에게 도서관 안내도 받아 두게. 마친 뒤 여기서 어떤 걸 배웠는지 들려주면 되고.”",
  ], ["academy_enroll", "academy_report_orientation", "academy_ask_school", courtyard]),
  scene("academy_school_history", "문이 열리는 방향", [
    "“이곳엔 다른 곳에서 온 학생도 있네.” 에드윈이 책상 위 두 개의 잔을 떨어뜨려 놓는다. 그 사이에 놓인 얇은 은고리가 포탈의 모양을 닮았다. “하지만 문이 이어져 있다는 것과, 저쪽 사정을 안다는 건 다른 일이지. 자네가 살던 곳을 내가 안다고 말할 순 없네.”",
    "그는 고리를 서랍에 넣고 실습 출석부를 펼친다. “큰 일을 해내고 싶어도 손앞의 작은 불빛부터 끌 줄 알아야 해. 리네가 그 부분은 깐깐하게 볼 걸세.”",
  ], ["academy_return_headmaster", "academy_open_curriculum", courtyard]),
  scene("academy_enrolled", "첫 출석부", [
    "청강생으로 등록하겠다고 하자 에드윈이 출석부를 돌려 내민다. 빈 줄에 이름을 적는 동안 펜촉을 따라 푸른 빛이 잠깐 번졌다가 종이 속으로 가라앉는다.",
    "“이제 수업을 들을 수 있네. 불꽃을 크게 만들었다고 서두르지 말고, 꺼야 할 때 껐는지 보게나.” 교장은 리네의 강의실과 도서관 방향을 차례로 짚어 준다.",
  ], ["academy_open_curriculum", "academy_visit_stella", "academy_visit_stella_again", courtyard]),
  scene("academy_orientation_reward", "교장의 작은 수료 인사", [
    "이론에서 배운 흐름과 수정 실습의 결과, 도서관에서 들은 규칙을 차례로 이야기한다. 에드윈은 출석부의 세 칸을 확인한 뒤 선반에서 작은 약병과 은빛 잎이 든 종이봉투를 꺼낸다.",
    "“첫 수업은 마쳤군. 포션과 약초는 필요한 때 쓰게. 자네 몫일세.” 물품을 건넨 교장이 창밖 관측탑을 올려다본다. “노엘이 저 등 때문에 애를 쓰더군. 관심이 있으면 어떤 일인지 직접 물어보게.”",
  ], ["academy_visit_library", "academy_visit_stella", "academy_visit_stella_again", courtyard]),
  scene("academy_stella", "돌벤치의 스텔라", [
    "은발 학생의 보랏빛 눈이 공책과 이쪽 얼굴을 번갈아 본다. 가까이서 보니 별 문양 몇 개가 선 밖으로 삐져나와 있고, 지우개 가루가 망토 자락에 붙어 있다.",
    "“틀린 부분 찾는 중이야. 낙서가 아니라.” 학생은 먼저 그렇게 말하고는 빈 벤치 자리를 조금 내준다. “앉을 거면 공책 밑은 조심해. 방금 지운 데라 손에 다 묻거든.”",
  ], ["academy_introduce_stella", "academy_study_with_stella", "academy_share_stella_success", "academy_ask_stella_school", courtyard]),
  scene("academy_stella_introduced", "별 머리핀의 친구", [
    "이름을 알려 주고 친구가 되고 싶다고 말하자, 학생은 공책을 덮던 손을 멈춘다. “친구 신청을 그렇게 똑바로 하는 사람도 있네.” 입가에 웃음이 번지며 별 머리핀이 다시 흔들린다. “난 스텔라. 나도 아직 기초과정이야. 잘 부탁해.”",
    "스텔라는 공책을 둘 사이로 돌려놓는다. 지워 낸 자리에 또렷한 원이 하나 남아 있다. “친구가 됐다고 숙제 정답부터 알려 달라는 건 아니지? 틀린 거 같이 찾는 건 좋아.”",
  ], ["academy_study_with_stella", "academy_ask_stella_school", courtyard]),
  scene("academy_stella_partner", "함께 보는 공책", [
    "같이 공부하자고 제안하니 스텔라가 공책 옆으로 자리를 옮긴다. 겹친 선을 하나씩 짚으며 어디에서 흐름이 끊기는지 함께 살핀다. 지워야 할 원을 찾자 스텔라는 펜을 들었다가 잠깐 이쪽을 본다.",
    "“이거 혼자 보고 있으면 자꾸 맞게 그렸다고 우기게 되더라.” 잘못 겹친 선을 지운 뒤 스텔라가 작게 웃는다. “다음에 막히면 또 같이 보자. 네 공책도 가져와. 나만 들키면 억울하니까.”",
  ], ["academy_open_curriculum", "academy_return_stella", courtyard]),
  scene("academy_stella_school", "스텔라의 학교 안내", [
    "“리네 교수님은 잘하면 잘했다고 해 줘. 딱 그만큼만.” 스텔라가 공책의 한 줄을 가리킨다. ‘출력을 줄인 판단은 적절함.’ 그 아래에는 본인이 그린 커다란 별표가 붙어 있다.",
    "“노엘 씨한테는 책을 어디서 찾는지 먼저 물어봐. 엉뚱한 서가를 뒤지면 한 시간도 금방 가.” 스텔라가 지붕 위 관측탑 쪽으로 시선을 옮긴다. “저 등도 요즘 안 켜져. 별 보는 수업 좋아하는데, 관리 기록부터 다시 보고 있대.”",
  ], ["academy_return_stella", "academy_visit_library", courtyard]),
  scene("academy_stella_success", "다시 켜진 별빛 이야기", [
    "천문판의 고리를 맞추자 관측등이 켜졌다고 이야기한다. 스텔라는 공책 위에 얹었던 펜을 내려놓고 탑을 올려다본다. 유리 지붕 아래에서 가느다란 빛이 반짝인다.",
    "“아, 그래서 켜졌구나.” 스텔라가 공책 한 귀퉁이에 작은 탑을 그린다. “다음 관측 수업엔 저기로 갈 수 있겠네. 네가 어느 고리부터 맞췄는지도 그때 알려 줘. 이번엔 내가 제대로 적을게.”",
  ], ["academy_return_stella", "academy_view_observatory", courtyard]),
  scene("academy_curriculum", "회랑의 수업 안내판", [
    "황동 안내판에는 ‘청강 등록은 교장실’, ‘기초 이론 다음 제어 실습’이라고 적혀 있다. 강의실에서 분필 긁는 소리가 나고, 옆 실습실 문에는 차단 고리를 확인하라는 짧은 문장이 붙어 있다.",
    "복도 끝 서가 앞에서는 노엘이 반납된 책에 얇은 종이를 끼우고 있다. 수업에 필요한 자료와 도서관 규칙은 그에게 물을 수 있다. 첫 수업의 세 항목을 마치면 교장에게 직접 보고해야 한다.",
  ], ["academy_attend_theory", "academy_open_practical", "academy_visit_library", courtyard]),
  scene("academy_theory", "리네의 기초 이론", [
    "리네는 분필로 두 원을 그리고 안쪽부터 바깥쪽으로 짧은 선을 잇는다. “흐름을 먼저 만들고, 출력을 나중에 올립니다. 실습용 수정은 학교에서 마력을 공급하니 자기 MP를 밀어 넣을 필요는 없어요.” 화살표가 끝나는 곳에 작은 차단 고리를 그린다.",
    "평원 전투 이야기가 나오자 교수는 칠판 한편에 파이어볼의 MP 소모와 재사용 대기를 적는다. “파이어볼은 MP 4를 쓰고 다시 쓰기까지 3초가 걸립니다. 슬라임이 도약을 준비하면 불꽃만 보지 말고 몸도 움직여야 해요. 회피는 다시 준비되는 데 5초가 필요합니다.” 강의를 마친 리네가 옆 실습실 문을 연다.",
  ], ["academy_open_practical", "academy_visit_library", lessons]),
  scene("academy_practical", "수정 제어 실습", [
    "리네가 실습대 가장자리의 차단 고리를 잠근다. 학교 마력으로 빛나는 수정 앞에 두 겹의 홈이 파여 있고, 안쪽 홈에서 시작한 가느다란 불빛이 중간에서 끊겨 있다.",
    "“안쪽부터 길을 이어 보세요. 한꺼번에 연결하면 차단 장치가 먼저 끊습니다. 밝기보다 끝까지 안정적으로 흐르는지가 과제예요.” 리네는 손잡이를 놓고 선택할 자리를 비워 준다.",
  ], ["academy_trace_inner", "academy_push_outer", lessons]),
  scene("academy_practical_retry", "차단 고리가 멎은 자리", [
    "바깥 고리부터 한 번에 잇자 빛이 넓게 번지는가 싶더니 차단 고리에서 딸깍 소리가 난다. 실습대의 불빛이 꺼지고, 리네가 수정을 받침에 다시 맞춘다.",
    "“다친 데는 없죠? 여기서 이 장치를 먼저 잠그는 이유예요.” 교수는 안쪽 홈을 분필 끝으로 짚는다. “안쪽부터 하나씩. 밝게 켜는 것과 흐름을 잇는 건 다릅니다.” 수정을 다시 연결하자 작은 불빛이 안쪽 홈으로 돌아온다.",
  ], ["academy_trace_inner", "academy_push_outer", lessons]),
  scene("academy_practical_passed", "끝까지 이어진 빛", [
    "안쪽 홈부터 천천히 길을 잇는다. 학교에서 공급하는 수정의 빛이 연결한 자리를 따라 고르게 돌고, 마지막 홈을 지날 때 작은 등 하나가 켜진다. 손잡이를 놓아도 차단 고리는 조용하다.",
    "리네가 실습 기록의 빈 칸에 확인 표시를 남긴다. “흐름이 안정됐어요. 여기까지 통과입니다. 실제 전투에서는 자기 MP를 써야 하니 이 빛의 크기와 혼동하지 마세요.”",
  ], ["academy_visit_library", "academy_visit_headmaster", lessons]),
  scene("academy_library", "노엘의 도서관", [
    "문을 밀자 돌바닥을 지나던 발소리가 두꺼운 융단에 묻힌다. 노엘은 반납대의 책등을 하나씩 맞추다가 소매에 꽂아 둔 붉은 책갈피를 빼 든다.",
    "“찾는 자료가 있으면 제목을 몰라도 괜찮아요. 무엇을 하려는지 말해 주세요.” 반납대 한쪽에는 관측탑 관리 기록이 펼쳐져 있다. 책장에 끼운 얇은 황동 띠에는 달과 별 모양이 차례로 새겨져 있다.",
  ], ["academy_library_orientation", "academy_read_observatory_request", "academy_report_observatory", "academy_view_observatory", lessons]),
  scene("academy_library_notes", "책을 찾는 순서", [
    "노엘을 따라 기초 마법 서가와 실습 기록이 놓인 칸을 확인한다. “책은 이 반납대에 두면 돼요. 원래 자리에 꽂으려다 다른 책 사이에 들어가면 찾기가 어려워져요.” 노엘이 얇은 안내철에 확인 표시를 한다.",
    "관측탑 기록 앞을 지나며 열린 쪽을 잠깐 본다. 초승달, 보름달, 별 아래에 세 개의 동그라미가 그려져 있다. 노엘은 책을 덮지 않고 황동 띠로 눌러 둔다. “탑의 등을 다시 켜려는데 이 부분이 실물과 안 맞네요. 첫 수업을 마친 뒤 관심 있으면 물어봐 주세요.”",
  ], ["academy_open_practical", "academy_visit_headmaster", library]),
  scene("academy_observatory_request", "빛이 멎은 관측탑", [
    "노엘이 관측탑의 천문판을 그린 쪽을 돌려 보여 준다. “동력이 없어진 건 아니에요. 아래 수정은 켜지는데 위 관측등까지 흐름이 닿지 않아요. 수업 때 움직인 고리가 제자리로 돌아오지 않은 것 같아요.”",
    "“관리 기록에는 초승달에서 보름달을 거쳐 별로 간다고 적혀 있어요. 탑에서 닳은 홈과 대조해 줄래요? 억지로 돌릴 필요는 없어요. 맞지 않으면 불빛만 꺼지게 차단해 뒀으니까.” 노엘은 나선계단 문을 열어 둔다.",
  ], ["academy_accept_observatory", "academy_resume_observatory", library]),
  scene("academy_observatory", "유리 지붕 아래 천문판", [
    "나선계단 끝에서 유리 지붕 아래로 나온다. 관측등은 꺼져 있지만 바닥 수정은 희미하게 빛나고, 그 앞 천문판에는 손으로 돌릴 수 있는 세 고리가 겹쳐 있다.",
    "각 고리에 달과 별 문양이 돌아가며 새겨져 있다. 받침의 황동 화살표는 아래 수정에서 시작해 관측등 쪽으로 향한다. 고리를 움직이기 전에 문양 주변의 닳은 홈을 가까이서 살필 수 있다.",
  ], ["academy_inspect_astrarium", "academy_align_astrarium", "academy_align_star_first", library]),
  scene("academy_observatory_clue", "황동에 남은 흐름", [
    "천문판을 가까이 들여다본다. 아래 수정에 가장 가까운 홈 옆에는 가느다란 초승달이, 가운데에는 둥근 달이 닳아 있다. 관측등으로 이어지는 마지막 홈 옆에 작은 별이 남아 있다.",
    "책에서 본 순서와 황동 화살표가 같은 방향을 가리킨다. 초승달에서 보름달을 거쳐 별로. 세 고리는 약간의 힘만 줘도 돌아가지만, 아직 화살표 위의 문양은 서로 맞지 않는다.",
  ], ["academy_align_astrarium", "academy_align_star_first", library]),
  scene("academy_observatory_retry", "켜지지 않는 관측등", [
    "별을 맨 앞에 맞추자 수정에서 나온 빛이 첫 고리까지만 번졌다가 잦아든다. 받침 안쪽의 차단 장치가 작게 울릴 뿐 관측등은 켜지지 않는다.",
    "손을 놓고 보니 황동 화살표는 여전히 초승달이 닳은 홈에서 시작한다. 관리 기록은 밝은 문양부터 놓으라는 뜻이 아니었다. 고리는 멀쩡하고 다시 맞출 수 있다.",
  ], ["academy_align_astrarium", "academy_inspect_astrarium", library]),
  scene("academy_observatory_repaired", "관측탑의 첫 불빛", [
    "초승달, 보름달, 별이 황동 화살표 위에 오도록 세 고리를 맞춘다. 바닥 수정에서 뻗은 빛이 첫 홈을 지나 가운데 고리를 돌고, 마지막 별에서 가늘게 모여 위로 오른다.",
    "유리 지붕 아래 관측등이 켜진다. 어둡던 바닥에 별 모양 빛이 하나씩 맺히고, 계단 아래에서 노엘이 무슨 일인지 올려다보는 기척이 난다. 내려가 어느 부분을 맞췄는지 알려 줄 수 있다.",
  ], [library, "academy_share_stella_success", courtyard]),
  scene("academy_observatory_reward", "노엘의 관리 기록", [
    "초승달부터 고리를 맞추자 등이 켜졌다고 설명한다. 노엘은 관리 기록의 지워진 화살표를 다시 긋고 실제 순서를 옆에 적는다. “이제 다음 사람이 고칠 때도 같은 데서 헤매지 않겠네요.”",
    "노엘이 작은 결정과 가루를 봉투에 나눠 건넨다. “약속한 점검 사례예요. 실습용 재료 중에서 따로 빼 뒀어요.” 나선계단 위에서 내려오는 빛이 반납대 모서리에 닿는다.",
  ], ["academy_view_observatory", "academy_share_stella_success", courtyard]),
  scene("academy_observatory_quiet", "다시 열린 관측탑", [
    "나선계단을 올라가니 관측등이 같은 밝기로 빛나고 있다. 세 고리는 황동 화살표 위에 가지런히 맞아 있고, 새로 쓴 관리 쪽지가 받침에 묶여 있다.",
    "유리 지붕 너머로 학교의 푸른 첨탑과 광장의 분수가 보인다. 별 모양 빛이 빈 의자 위에 천천히 돌아간다. 잠깐 둘러본 뒤 도서관이나 앞뜰로 내려갈 수 있다.",
  ], [library, "academy_share_stella_success", courtyard]),
  scene("academy_hall", "중앙 회랑", [
    "회랑의 아치 사이로 앞뜰의 물소리가 따라온다. 돌바닥에 길게 드리운 창살 그림자가 복도 갈림길에서 끊기고, 벽에는 교장실과 강의실 방향을 가리키는 황동 표지가 붙어 있다.",
    "한쪽 문 너머에서는 분필 긁는 소리가, 맞은편 실습실에서는 수정 받침이 맞물리는 작은 소리가 들린다. 도서관으로 이어지는 복도 끝에는 반납대가 보이고, 열린 아치 밖으로는 스텔라가 앉은 정원의 돌벤치가 보인다.",
  ], []),
  scene("academy_classroom", "기초 강의실", [
    "나무 책상들이 낮은 강단을 향해 나란히 놓여 있다. 칠판 위의 두 원은 안쪽에서 바깥쪽으로 이어지고, 리네는 화살표 끝에 걸린 분필 가루를 손끝으로 털어 낸다.",
    "“앉아도 좋아요. 기초 이론부터 들을 거면 지금 시작하죠.” 교수는 비어 있는 앞줄을 가리킨다. 창가에는 다음 실습에서 쓸 작은 공급 수정이 덮개 아래 놓여 있다.",
  ], ["academy_attend_theory"]),
  scene("academy_practice_room", "수정 실습실", [
    "두꺼운 실험대마다 공급 수정과 차단 고리가 한 쌍씩 놓여 있다. 창 아래의 받침에서는 약한 빛이 일정하게 돌고, 리네는 사용하지 않는 손잡이를 잠금 위치로 돌려놓는다.",
    "“실습을 시작하려면 이쪽 자리로 오세요. 학교의 공급 수정을 쓰지만 차단 장치는 먼저 확인합니다.” 벽에 걸린 기록철에는 이론과 실습을 구분한 칸이 나란히 있다.",
  ], ["academy_open_practical"]),
  scene("academy_observatory_accepted", "관측탑 점검 허가", [
    "천문판을 살펴보겠다고 하자 노엘이 펼쳐 둔 관리 기록을 계단 옆 받침에 옮겨 둔다. “위에서 보고 내려와도 여기서 다시 대조할 수 있어요. 억지로 움직이지만 마세요.”",
    "나선계단 문이 열린 채로 있고, 계단 위쪽에서 희미한 수정빛이 내려온다. 관측탑에 올라갈 준비가 되면 도서관 옆 계단을 따라가면 된다.",
  ], []),
];