# Wall layout v3

- 기준: 승인된 wall-layout-v1.png의 벽면 배치, 사용자가 첨부한 boundary-reference.png의 연속 경계 구조. 기존 마법 잡화점 디자인·방 크기·카메라는 유지합니다.
- boundary-master.png는 현재 U형 저벽 원본입니다. 새 tall pillar를 추가하지 않고 완결된 코너와 출입구 끝단으로 마감합니다.
- layout.json은 바닥 점유 가로/깊이와 앞쪽 중앙 배치점의 원본입니다. 기본 단위·투영 규칙은 ARCANA_ART_GUIDE.md를 따릅니다.
- node scripts/build-shop-boundary-v3.cjs가 그림 등록과 shop_interior.gd의 LAYOUT 상수를 갱신합니다. 나머지 장면 코드와 가구 수동 원본을 재작성하지 않습니다.
- 런타임 표시와 collision_rects는 동일 LAYOUT을 사용합니다. 인물 접지의 국소 보정과 가구 점유는 구분합니다.
- 경계 외곽은 장식·벽 두께 때문에 방 점유를 넘을 수 있습니다. 바닥 앞모서리는 shop_floor.gdshader에서 저벽 코너와 맞게 가립니다.
- 현재 원본은 image_gen에서 제작하고 64px/월드 단위의 등록과 공통 팔레트로 출력했습니다. raw 생성 이미지는 수치상 투영 적합 판정의 증거가 아닙니다.
- cabinet-projection.svg/png/json은 수식 기반 투영 참조의 사용 예입니다. 방법·출처는 godot-arcana/art/ASSET_AUTHORING_METHOD.md를 따릅니다.
- 재제작: 경계 빌더 → export-arcana-shop.ps1 → render-arcana-shop.ps1 → promote-arcana-shop.ps1. 수동 보정 원본은 재실행 전에 보존합니다.
