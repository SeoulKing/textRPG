# Compact shop room · active v2

- 승인 기준: 기존 concept-v1.png의 마법 잡화점 디자인과 2026-10-29 사용자의 공간 압축·방 전용 바닥 제작 지시.
- 원본: floor-master.png, back-wall-master.png, props-master.png 및 각 prompt.txt. back-wall-v2.png는 앞벽 절단의 64px/단위 중간 원본입니다.
- 제작: `node scripts/build-shop-room-v2.cjs`. 최종 자산과 좌표 등록은 상위 manifest.json을 따릅니다. 수동 보정한 출력은 재생성 전에 보존합니다.
- 바닥: 896×576 전체를 14×9 월드 범위에 한 번만 표시합니다. 반복·타일맵·별도 늘린 러그가 없습니다. 러그·문턱·창 빛·외곽 인레이가 원본 안에서 함께 설계되어 있습니다.
- 뒷벽: 904×246(좌우/상하 투명 여백 각4px), 실제 벽 폭896px=14단위. 발(452,242).
- 낮은 좌우 벽: 각48×456, 발(24,452). 낮은 앞벽 양쪽은 각352×48, 발(176,44). 앞벽 가운데3단위를 출입구로 비웁니다.
- 약초 작업대:200×88, 발(100,84). 포장·여행용품 묶음:136×99, 발(68,95).
- 가구·상인·바닥의 공통 밀도64px/단위를 유지합니다. 현재 상인96×136/발(48,116)/실제 높이99px는 변경하지 않았습니다.
- 방의 실제 X/Z 범위:(5,4)~(19,13). 상인 상호작용 논리좌표(192,141), 출구(192,205), 입장(192,189). 충돌은 shop_interior.gd에서 같은 배치를 따릅니다.
- 기존 가구를 중앙 뒷벽3개와 좌우 앞쪽2개로 재배치하고, 전시대2개·작업대·포장 묶음·가방·화분으로 주변을 채웠습니다. 중앙 통로와 기존 매매 경로는 유지합니다.
- 바닥은 shop_floor.gdshader의 repeat_disable 샘플러와 UV로 한 번만 읽습니다. 인물과 가구는 독립 자산이며 좌우/앞벽과 함께 기존 반투명 가림 경로를 사용합니다.
- 재제작 단계: 위 아트 제작 → `pwsh -File scripts/export-arcana-shop.ps1` → `pwsh -File scripts/render-arcana-shop.ps1` → `pwsh -File scripts/promote-arcana-shop.ps1`.
- previous-shop-inventory.gd와 previous-overview.png는 공간 압축 전 비교 자료입니다. 현재 게임 원본으로 사용하지 않습니다.
- 실제 게임 렌더 정지 출력은 상위 shop-overview.png와 merchant-counter.png입니다. 브라우저와 플레이·매매 테스트는 별도 요청 없이 실행하지 않았습니다.
