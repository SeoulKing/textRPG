# 식당 가구와 점유 면적

[식당 가구 씬](../../../godot-arcana/scenes/restaurant_furniture.tscn)에서 1타일은 1 Godot 단위입니다. 아래 크기는 X 방향 가로×Z 방향 깊이이며, 점유 칸 수는 이동을 차단하는 셀을 셌습니다.

## 바닥 가구

| 종류 | 가구 | 개당 점유 | 수량 | 차단 합계 | 모델 |
| --- | --- | --- | ---: | ---: | --- |
| 홀 | 라탄 의자 | 1×1 | 14 | 14칸 | `dining-chair.glb` |
| 홀 | 2인용 식탁 | 1×1 | 2 | 2칸 | `dining-window.glb` |
| 홀 | 4인용 식탁 | 2×2 | 1 | 4칸 | `dining-four.glb` |
| 홀 | 공용 식탁 | 3×2 | 1 | 6칸 | `dining-shared.glb` |
| 주방 | 화덕 | 3×2 | 1 | 6칸 | 내 집 `kitchen-hearth.glb` 재사용 |
| 주방 | 조리대 | 6×2 | 1 | 12칸 | `service-counter.glb` |
| 주방 | 식기장 | 5×1 | 1 | 5칸 | `service-hutch.glb` |
| 주방 | 빵 진열대 | 2×1 | 1 | 2칸 | `service-sideboard.glb` |
| 주방 | 서빙 카트와 올리브 화분 | 2×1 | 1 | 2칸 | `service-cart.glb` |
| **합계** | | | **23** | **53칸** | |

의자는 약 0.47×0.52단위, 2인용 식탁은 약 0.88×0.80단위 크기의 모델을 1×1칸에 놓았습니다. 창가 좌석 한 자리에는 식탁 1칸과 의자 2칸을 씁니다. 4인석은 식탁 4칸과 의자 4칸, 공용석은 식탁 6칸과 의자 6칸을 씁니다. 에스프레소 기계, 식탁 위 접시와 꽃병 등은 각 부모 모델에 포함됩니다.

## 건축과 장식

| 구분 | 항목 | 크기·수량 | 바닥 판정 |
| --- | --- | --- | --- |
| 건축 | 실내 바닥 | 14×12단위 | 전체 바닥 영역 |
| 건축 | 화면 앞 동·남쪽 경계 띠 | 폭 1단위 | 이동 경계 밖 바닥 높이 마감 |
| 건축 | 출입 문턱 | 2×1단위, 1개 | 출입 연결면 |
| 건축 | 아치창과 항구 전망 | 개구부 폭 2.10단위, 높이 2.05단위, 2개 | 서쪽 벽과 창 안에 배치 |
| 벽 장식 | 벽등 | 2개 | 바닥 차단 0칸 |
| 바닥 장식 | 카운터 러너 | 6.40×0.84단위, 1개 | 통행 가능 |
| 바닥 장식 | 공용 식탁 러그 | 3.50×3.60단위, 1개 | 통행 가능 |
| 바닥 장식 | 입구 러그 | 1개 | 통행 가능 |

바닥 셀 168칸 가운데 가구가 점유하지 않은 셀은 115칸입니다. 입구·등장 위치·조리대가 이어지는 중앙 동선은 통행을 위해 확보합니다. 미점유 셀 수를 설치 가능 수량으로 사용할 때는 이 동선과 사용 위치를 별도로 제외합니다.

## 원본 폴더

| 분류 | 파일 | 폴더 |
| --- | --- | --- |
| 건축 | `room.blend`, `windows.blend`, 실내·창·항구 전망 GLB | [architecture](../../../godot-arcana/art/source/restaurant-brunch/architecture) |
| 홀 가구 | `dining.blend`, 의자와 크기별 식탁 GLB | [furniture/dining](../../../godot-arcana/art/source/restaurant-brunch/furniture/dining) |
| 주방 가구 | `service.blend`, 조리대·식기장·진열대·카트 GLB | [furniture/kitchen](../../../godot-arcana/art/source/restaurant-brunch/furniture/kitchen) |
| 재사용 | 화덕, 벽등, 입구 러그 | [player-home-campus-a](../../../godot-arcana/art/source/player-home-campus-a) |

공통 설치·회전·저장 규칙은 [가구 배치 시스템 설계](../../../docs/arcana-furniture-placement.md)를 따릅니다.
