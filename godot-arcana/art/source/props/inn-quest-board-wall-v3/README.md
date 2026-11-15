# 게시판 재질 보정 v3

사용자 요청: 게시판을 여관 계산대·주변 가구와 어울리게 다시 제작합니다. 기존 벽걸이 배치와 기능을 유지합니다.

- 비교 기준: art/export/inn-lobby/counter.png와 사용자의 여관 화면.
- 생성 원화: 프로젝트 art-studies/inn-quest-board/material-v3/master.png (1313×1198). 이 파일은 게임용 원본 픽셀 수와 다르며 동일 해상도 증거로 제시하지 않습니다.
- 현재 편집 원본: inn-quest-board.png (128×160). 게임 출력도 동일한128×160이며 발(64,128),64px/단위,벽걸이 위치(14,1.1,4.05),충돌 없음은 유지합니다.
- 실제 그림 영역: (6,15)에서116×107. 이전보다 굵은 검은 구획선을 낮추고 목재·황동·천·종이의 명암과 모서리를 계산대 기준으로 보정했습니다.
- 제작: node scripts/package-inn-quest-board-v3.cjs. 원화의 도트 변환 및 경계 검사 후 원본 크기와4배 최근접 비교에서 확인했습니다. 자동 정리가 제거한 고립 알파 픽셀은0개였습니다.
- 기존 v2 PixelPen 원본은 보존했습니다. v3의 편집 원본은 현재 PNG이며 이를 v2 PixelPen에서 제작한 것처럼 설명하지 않습니다.
- before-after-4x.png는 왼쪽 이전/오른쪽 수정의 동일4배 비교입니다. native-preview.png도4배 최근접 출력입니다.
- 실제 게임 렌더러: tools/render_inn_board_material.gd, scripts/render-inn-board-material.ps1. board-counter-comparison.png는 계산대·벽면과 함께 확인한 정지 출력입니다.
- Godot 가져오기와Web 패키지 생성·raw/gzip 반영을 완료했습니다. 브라우저 플레이는 실행하지 않았습니다.
- 큰 생성 원화, 네이티브 게임 출력, 정지 게임 렌더를 구별하여 제시합니다.
