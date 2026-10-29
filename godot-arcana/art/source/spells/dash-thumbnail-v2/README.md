# 대시 아이콘 · 승인 후보 2번

2026-10-29 사용자가 approved-candidates.png의 2번을 승인했습니다.
남색 단순 인물, 왼쪽 하늘색 잔상, 두 청색 속도선을 유지합니다.

- 편집 원본: dash.pxpen (PixelPen 1.1.4, 64×64, 투명 배경+3색, 사방 최소 8픽셀 여백, 이진 알파)
- 승인 원화: approved-candidates.png, 우상단 후보 2번; 선택 영역 [724,125,570,330]
- 제작: tools/trace_dash_thumbnail.gd에서 원화 윤곽·색을 5×5 셀 투표로 색 인덱스 전사 → PixelPenProject 저장 → ProjectPacker 재열기 → PNG 출력
- 게임 연결: art/export/spells/dash.png, quickslot_icon.gd의 dodge 공통 텍스처
- 출력: dash.png와 최근접 6배 dash-preview.png; pixels.json에 좌표·팔레트·재열기 기록 보존
- 기존 아이콘: previous-dash.png에 보존
- 이후 수정은 dash.pxpen을 PixelPen에서 편집·PNG 출력한 뒤 게임용 경로로 복사합니다. 최초 전사 스크립트를 수동 편집 후 재실행하지 않습니다.
- author-heroine-dash.py --sync도 이 저장된 PNG를 복사하며 아이콘을 캐릭터 프레임으로 되돌리지 않습니다.

대시 애니메이션·거리·쿨타임·기술 ID는 변경하지 않았습니다. 브라우저 플레이 검증은 사용자 확인 범위입니다.
2026-10-29 규격 수정: 모든 스킬 아이콘 원본은 64×64 투명 PNG로 통일합니다. 이전 48×48 편집본은 dash-48px.pxpen/png에 보존했습니다. 승인 원화를 64×64 목표 격자에 다시 전사했으며 48×48 이미지를 늘리지 않았습니다.
