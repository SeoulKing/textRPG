# 낚시 v2 · 활성 연결

- 승인: art-studies/fishing-v2/concept-v1.png. 캐릭터·강의 기존 배치와 외형은 보존했습니다.
- 원본: godot-arcana/art/source/fishing-v2/refined/fishing-0..7.pxpen (8방향 × 중립/준비/들기/끌어올리기), tools.pxpen (도구·찌·물고기).
- 파생 기준: heroine-run-reference-v15/heroine-cast.png. 얼굴·의상·발 피벗을 유지하며 PixelPen IndexedColorImage에서 실제 손 도트 24곳을 보정하고 저장·재열기 후 출력했습니다. registration.json은 포즈별 손 접촉 좌표를 보관합니다. 상위 fishing-v2/*.pxpen은 초기 후보이며 활성 연결은 refined/입니다.
- 제작 도구: godot-arcana/tools/author_fishing.gd. 재실행은 보관한 PixelPen 원본을 읽으며 최초 작성·보정 규칙도 보존합니다. 최초 작업의 corrections 값과 재실행에서 바뀐 도트 수를 구분합니다.
- 출력: art/export/fishing-v2/heroine-fishing.res, tools.res 및 같은 이름 PNG. 전체 컨셉을 축소한 자산이 아닙니다.
- 표시: scripts/fishing_world_vfx.gd. 캐릭터 시트·도구·찌·물고기는 별개이며 줄·막대 휘어짐·파문 궤적은 픽셀 정렬한 런타임 도형입니다. 8방향 접촉 좌표, 던지기 포물선, 입질 잠김, 회수 궤적을 서버 낚시 상태에 연결합니다. 연출이 보상을 지급하지 않습니다.
- 판정: river_fishing_geometry.gd가 활성 강 TileMap의 실제 셀과 다리 상판을 읽습니다. export_online_layout.gd가 같은 영역을 서버용으로 내보냅니다. 클라이언트와 서버가 정규화된 전방 16..64 논리 픽셀에서 강물을 찾습니다.
- 장비: 기본 낚싯대는 최초 1회 지급, 수동 장착, 서버 저장, 전투 장착 칸과 별개. 소지품의 나무 낚싯대 선택 또는 장비 탭에서 장착·해제합니다.
- UI: 반응형 오른쪽 조작창, Space/E·터치 유지, 진행 중 화면 구도 조정. 기존 포획·숙련도 규칙은 유지합니다.
- 확인 범위: 원본/접촉 좌표/팔레트/저장·재열기·출력과 컴파일·웹 내보내기를 확인합니다. 사용자 저장을 조작하는 플레이 테스트와 브라우저 조작은 수행하지 않습니다. 시안 승인과 실제 플레이 연출에 대한 사용자의 최종 평가는 구분합니다.

## 후속 활성 미술
사용자가 fishing-v3-shoulder 비교판의 3번 MYSTIC을 선택했습니다. 현재 어깨 휴대·이동 몸/장비와 도구 아이콘은 godot-arcana/art/source/fishing-v3-mystic/README.md를 따릅니다. 이 문서의 v2 몸 시트는 낚시 중 준비·들기·끌어올리기 자세에 계속 사용하며, v2 도구 아이콘과 이동 중 숨김은 새 표시기로 대체했습니다.
