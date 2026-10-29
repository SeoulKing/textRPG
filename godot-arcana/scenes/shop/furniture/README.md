# 상점 씬 편집

`res://scenes/shop_2d.tscn`이 실제 편집·표시 원본입니다. 별도 Projected2DPreview나 선택에 따른 화면 전환은 없습니다.

- Floor: 기존 목재·러그 바닥 아틀라스, TileSet 소스 100.
- HighWalls / LowWalls / Decorations: 실제 벽·문턱 타일맵. TileMap 패널의 소스 200에서 벽 조각을 골라 칠하거나 지웁니다. Godot의 scene tile을 사용해 타일 간격에 투영을 적용하면서 벽 그림의 높이는 유지합니다. 이 소스는 Terrain 자동 연결이 아닌 조각 선택 방식입니다.
- Furniture: 개별 가구 씬. 가구를 선택하고 W로 이동, Ctrl+D로 복제, Delete로 삭제합니다.
- Actors / Merchant: 카운터 배치에서 위치를 계산하는 상인입니다. 상인 위치는 카운터를 이동하여 바꿉니다.

모든 타일맵과 개별 가구의 편집 기준점은 상점 바닥 왼쪽 위입니다. 타일맵 Position은 (0, 0), Scale은 (1, 1)이며 가구 그림의 배치는 Offset으로 저장합니다. 반 칸 간격은 X 32px / Y 32px입니다. 실행 시 가구의 접지점으로 Y 정렬하고 원본 픽셀 비율을 유지합니다.

충돌과 거래·출입 위치는 같은 원본에서 계산합니다. 온라인 서버 반영은 저장 후 저장소 루트에서 `scripts/run-shop-2d.ps1 Sync`, `scripts/run-shop-2d.ps1 Layout`을 실행하여 데이터를 생성하고 서버를 재시작합니다.

`--rebuild-library`는 현재 벽 셀과 가구 위치를 보존하며 네이티브 벽 타일을 갱신합니다. 미술 정의는 `res://art/export/shop-2d/assets.json`을 공유합니다.