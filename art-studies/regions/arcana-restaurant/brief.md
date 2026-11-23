# 아르카나 식당

사용자가 승인한 항구 브런치 카페 시안(`exec-f7292c87-1593-41b2-a69d-5a7ac2ba2030.png`)을 Blender로 제작해 기존 식당에 연결합니다. 시안의 아치창 두 개, 항구 전망, 창가 2인석 두 자리, 4인석, 공용 식탁, 조리대와 바닥형 식기장을 사용합니다. 식물은 화분과 꽃병에 배치합니다.

## 모델과 배치 원본

| 모델 | Blender 원본 | Godot 배치 |
| --- | --- | --- |
| 마루, 아치 개구부, 문턱, 러그 | `room.blend` | `restaurant_3d.tscn`의 `Room/Building` |
| 아치창, 부두와 돛단배 전망 | `windows.blend` | `Room/ArchedWindows`, `Room/HarborViews` |
| 조리대, 식기장, 빵 진열대, 서빙 카트 | `service.blend` | `restaurant_furniture.tscn`의 주방·보조 가구 |
| 라탄 의자, 창가 2인용 식탁, 4인용 식탁, 공용 식탁 | `dining.blend` | `restaurant_furniture.tscn`의 개별 가구 |

`godot-arcana/art/source/restaurant-brunch/` 아래에 건축은 `architecture/`, 홀 가구는 `furniture/dining/`, 주방 가구는 `furniture/kitchen/`으로 나눴습니다. 최초 모델을 재현할 때는 `scripts/blender/author_restaurant_{room,windows,service,dining}.py`를 Blender 5.3에서 실행합니다. 수동 수정 후에는 각 Blender 원본에서 같은 GLB 경로로 내보냅니다. 화덕, 입구 러그와 벽등은 내 집 모델을 재사용합니다.

## 타일과 이동

1 Blender 미터는 1 Godot 타일입니다. 실내 바닥의 X/Z 범위는 14×12단위입니다. 화면 앞의 동·남쪽 외곽은 폭 1타일의 바닥 높이 마감으로 표시하고, 문턱은 남쪽 X 6~8에 놓습니다. 가구의 바닥 중앙을 피벗으로 사용합니다. 가구를 이동할 때는 [식당 가구 씬](../../../godot-arcana/scenes/restaurant_furniture.tscn)에서 `position`과 `tile_footprint`를 설정합니다. `tile_footprint`는 회전 후 월드 X/Z에 놓이는 칸 수이며, 점유 사각형의 모서리는 정수 셀 경계에 놓습니다.

라탄 의자와 창가 2인용 식탁은 각각 바닥 중심을 피벗으로 하는 1×1타일 가구입니다. 4인용 식탁은 2×2타일, 공용 식탁은 3×2타일을 차지합니다. 각 의자와 식탁을 독립 노드로 놓아 같은 식탁에 속한 의자도 개별로 이동할 수 있습니다.

종류별 크기·수량·차단 면적은 [식당 가구와 점유 면적](furniture-catalog.md)에 기록합니다. 플레이어가 사용하는 꾸미기 모드는 [가구 배치 시스템 설계](../../../docs/arcana-furniture-placement.md)를 기준으로 구현합니다.

[식당 타일 배치](../../../godot-arcana/scripts/restaurant_tile_layout.gd)가 같은 가구 씬에서 클라이언트와 서버 내보내기에 쓸 점유 영역을 읽습니다. [식당 원래 배치](../../../godot-arcana/scenes/native_2d/restaurant.tscn)에서 진입점과 출구 좌표를 유지하고 `counter`의 사용 위치를 새 조리대 앞에 맞춥니다. 새 경계나 배치로 막힌 기존 온라인 저장 위치는 입장 위치로 복구합니다. 마루판의 폭과 절단 위치는 바닥 장식에만 사용합니다.

## 적용 확인

Godot 4.7.2에서 GLB를 가져오고 실제 식당 씬을 정지 렌더해 창 개구부, 항구 풍경, 가구 접지, 벽과 마루의 이음을 확인했습니다. 온라인 레이아웃은 기존 내보내기 도구로 생성한 식당 항목을 적용합니다. 실제 조작과 웹 패키지 실행은 사용자 플레이 확인 범위입니다.
