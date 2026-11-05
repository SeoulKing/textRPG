# 여관 퀘스트판 · PixelPen v1

- 승인: concept-v2의 인게임 도트 방향 + 사용자 지정 바닥 점유 가로 2 × 세로 1타일.
- 원본: `inn-quest-board.pxpen`. PixelPen native indexed layer에 개별 픽셀·사각형·다각형을 기록하여 제작했습니다. GUI 브러시 수동 조작은 아닙니다. 생성 시안을 축소한 이미지가 아닙니다.
- 출력: `../../../export/inn-quest-board/inn-quest-board.png`. 128×160, 64px/월드 단위, 발 기준 (64,128), 투명 배경·최근접·이진 알파. `preview.png`는 4배 확대 검토용입니다.
- 바닥 점유: 월드 2×1 = 내비게이션 32×16. 캔버스의 높이는 세워진 게시판 높이와 투영된 발 깊이를 포함합니다.
- 제작: `tools/author_inn_quest_board.gd`가 PixelPen 저장 → 재읽기 → PNG 내보내기를 수행합니다. 수동 편집 뒤 이 스크립트를 재실행해 덮어쓰지 마십시오.
- 배치: `scripts/inn_lobby.gd`. 접수대 왼쪽, 출입구·계단 경로와 분리. 실제 위치·충돌·상호작용 좌표는 출력 manifest 참조.
- 상호작용: 게시판에서 마르텐의 의뢰 수락. 수락 뒤 10마리 집계, 마르텐에게 보고하여 10골드 1회 수령. 기존 의뢰 진행 상태 보존.
- 확인: PixelPen 저장본 재읽기·PNG 출력·확대 이미지 확인. 게임 실행·브라우저·웹 내보내기는 수행하지 않았습니다.

- 구문 확인: inn_lobby.gd 통과. main.gd 전체 의존성 확인은 기존 heroine-run-reference-v15 PNG의 미가져오기 상태로 막혔으며 반복 실행하지 않았습니다.
