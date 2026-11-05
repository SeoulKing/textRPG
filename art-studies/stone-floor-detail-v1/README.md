# 상세 돌바닥 타일 세트 · 2026-10-31

사용자는 concept-v1.png의 디테일을 승인하고 같은 품질의 타일 제작과 게임 적용을 요청했습니다. 내장 image_gen으로 돌 재질 밑그림을 만든 뒤, 기존 승인 그림의 청금 모자이크를 분리하고 PixelPen에서 원본을 저장·재열기·PNG 출력했습니다. 생성 지시는 tiles-prompt.txt이며 최초 시안 지시는 prompt.txt입니다.

## 원본과 규격

- 편집 원본: ../../godot-arcana/art/source/stone-floor-v1/stone-pattern.pxpen, ornament-connectors.pxpen.
- 최종 PNG 및 Godot 직접 텍스처: ../../godot-arcana/art/export/stone-floor-v1/.
- 64 원본 px/월드 단위, 정사각형 픽셀, 최근접 표시, Scale (1,1). 기존 정면형 3/4 시점을 유지합니다.
- 돌 패턴 512×512px는 8×8단위입니다. 128×128px 타일 16칸을 4×4 패턴으로 등록했습니다. 돌 크기·모서리 마모·잔균열·기공·줄눈 음영을 원본 밀도에서 표현합니다.
- 서로 다른 그림 경계는 최소 오차 절단으로 연결해 흐린 크로스페이드 대신 돌 재질을 유지했습니다. PixelPen에서 저대비 고립 도트 19개를 보정했습니다.
- 청금 장식은 128×128px 16종입니다. 방향 비트는 오른쪽1/아래2/왼쪽4/위8이며, 0은 독립 별 메달입니다. 직선·막다른 끝·모서리·T자·십자 연결을 포함합니다.
- 재질별 인덱스 팔레트는 준비 단계 최대192색, 무디더링으로 승인 원화의 석재 명암을 보존합니다. 원본 내장 명암과 기존 게임의 공통 햇빛은 별도로 적용됩니다.

## Godot 편집

[타일 세트](../../godot-arcana/art/resources/stone_floor_tileset.tres), [편집 예제](../../godot-arcana/scenes/ground/stone_floor_kit.tscn).

예제의 StonePattern과 LapisGold는 기본 TileMapLayer입니다. 기본 돌은 TileMap의 Patterns에 저장한 4×4 패턴으로 칠합니다. 16개 돌 조각은 이 패턴 안에서 연결되는 조각이므로 무작위로 섞지 않습니다. 장식은 atlas의 방향 연결을 골라 별도 레이어에 칠합니다. 충돌은 없습니다. 예제 장면과 PixelPen 원본이 이미 있으면 제작 도구는 사용자의 수동 편집을 보존합니다.

## 현재 게임 연결

도시 원본은 ../../godot-arcana/scenes/native_2d/plaza.tscn의 Ground/PaintedFloor입니다. native_2d_stone_ground.gdshader가 최종 stone-pattern.res를 512px 주기로 반복합니다. 도시 전체를 타일 노드 수천 개로 재생성하지 않고, 편집용 타일 세트와 같은 그림을 기존 바닥 표시기에 연결했습니다.

청금 천체 문양은 현재 도시 바닥 원화의 벡터 기하에서 추출한 ornament-mask-left/right를 사용해 유지합니다. 석재와 금색을 RGB 임계값으로 추측하면 별의 옅은 부분이 손상되므로 정확한 알파 마스크로 분리했습니다. 원래 벡터의 돌바닥은 제외하고 천체 장식·정원 테두리를 보존합니다. 분수 모자이크는 기존 별도 자산입니다. 바닥의 점유·정원·잔디/흙 전환은 기존 배치 정의를 사용합니다.

작업 중 다른 도시 구성 변경이 진행되어 현재 plaza-composed 바닥을 기준으로 마스크를 추출했습니다. 그 구성을 변경하지 않았습니다. 원화의 장식 위치가 바뀌면 마스크도 다시 제작해야 합니다.

## 재제작

1. node scripts/prepare-stone-floor.cjs
2. Godot --headless --path godot-arcana --script res://tools/author_stone_floor.gd
3. node scripts/prepare-stone-ornament-masks.cjs
4. Godot --headless --path godot-arcana --script res://tools/package_stone_masks.gd
5. node scripts/apply-stone-floor.cjs
6. scripts/build-godot-arcana.ps1로 원본 프로젝트의 웹 내보내기를 수행합니다.

기존 PixelPen 원본이 있으면 1번 준비 이미지를 바꿔도 최종 원본을 덮어쓰지 않습니다. 원본 미술 수정은 PixelPen에서 합니다.

## 확인 범위

- pixelpen-audit.json: 원본 저장·재열기·출력, 크기, 보정 기록.
- render/before-plaza.png와 render/final-plaza.png: 저장 장면의 같은 위치·원본 배율 오프라인 GPU 미술 출력입니다. 제작 중 도시 바닥 원화도 별도 변경됐으므로 두 그림의 다른 구성 차이를 이 작업의 변경으로 해석하지 않습니다.
- 실제 플레이·브라우저 조작은 요청에 따라 실행하지 않았습니다.

웹 반영: 원본 프로젝트의 Godot4.5.1 단일 스레드Web 내보내기와 독립 PCK 장면·스크립트 로딩을 완료했습니다. godot-web 및 .server-dist/godot의 raw/gzip 산출물을 갱신했고, PCK 94100268바이트 / SHA256 `e87f23c9d384b4085318d6c230099ffc56d4a18c594c92c62798a0774a685e69`가 전용 출력·로컬 제공 두 경로에서 일치합니다. 자세한 인계 정보는 delivery.json입니다.
