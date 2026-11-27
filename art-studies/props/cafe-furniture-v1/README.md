# 카페 의자와 파라솔 테이블

사용자가 승인한 `approved-concept.png`를 바탕으로 만든 편집 가능한 Blender 원본은 `cafe-furniture.blend`입니다. `Cafe_Chair`와 `Cafe_Parasol_Table` 컬렉션을 분리했으며, 각각 접지 중심이 원점이라 원본에서는 두 가구가 겹쳐 보입니다. Blender 아웃라이너에서 각 컬렉션을 숨겨 따로 편집할 수 있습니다.

Godot에 가져갈 3D 자산은 다음과 같습니다.

- `godot-arcana/art/source/cafe-furniture-v1/cafe-chair.glb`
- `godot-arcana/art/source/cafe-furniture-v1/cafe-parasol-table.glb`

각 GLB는 독립된 모델이며 바닥 중심이 원점입니다. 의자의 앞은 Blender에서 -Y, Godot에서 +Z이며 높이는 약 1.5 단위입니다. 테이블 상판 높이는 약 1 단위, 파라솔 폭은 약 2.7 단위입니다. Godot에서는 아래 두 씬을 3D 장면에 끌어다 놓을 수 있습니다. 테이블 씬에서 모델을 0.01단위 내려 받침을 바닥에 맞췄습니다. 충돌과 앉기 기능은 포함하지 않습니다.

- [카페 의자 씬](../../../godot-arcana/scenes/props/shared/cafe/cafe-chair.tscn)
- [파라솔 테이블 씬](../../../godot-arcana/scenes/props/shared/cafe/cafe-parasol-table.tscn)

현재 도시 본편은 2D이므로 이 3D GLB를 바로 2D 장면에 배치할 수는 없습니다. 2D에서 사용하려면 별도의 2D 자산 제작과 연결이 필요합니다. `preview.png`는 Blender에서 모델을 확인한 정지 렌더입니다.
