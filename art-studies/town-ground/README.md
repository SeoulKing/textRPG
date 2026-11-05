# 도시 지면 타일

승인 컨셉: approved-concept.png. 내장 image_gen 원본: source/materials.png.
정면형 3/4, yaw 0 / pitch 45, 64px/월드 단위, 1칸=64×45px, 기존 월드 LUT, 최근접·무밉맵·이진 알파 PNG입니다.
돌의 줄눈은 모든 연결/차분 타일에 공통인 64×45 위상으로 맞추며, 원화는 돌 안쪽의 저대비 재질에만 사용합니다. 경계 바깥은 투명해 실제 하위 레이어가 보입니다. 안쪽 모서리 반경은 인접 직선의 여백과 같습니다.

## Godot에서 사용

1. scenes/ground/city_ground.tscn을 2D 편집기로 엽니다.
2. Grass는 잔디, Soil은 흙길, Paving은 판석입니다. 모두 Godot 기본 TileMapLayer입니다.
3. Paving 선택 → TileMap의 Terrains → 상아색 판석 길 → Terrain Connect로 칠합니다. 47종이 직선·외곽·안쪽 모서리를 연결합니다. 기본 타일 차분은 Atlas에서 직접 고를 수도 있습니다.
4. Paving에서 칸을 지우면 아래 Grass가 드러납니다. 지운 주변의 경계는 Terrain Connect로 다시 칠해 연결합니다.
5. 저장하면 3D 편집기 미리보기에서 갱신되고, 게임은 다음 실행부터 같은 데이터를 읽습니다. 웹은 다시 내보내야 합니다.

격자 (0,0)은 월드 X/Z=(0,0), 한 칸은 1×1월드 단위입니다. 편집 레이어 변환·비기본 소스·대체 타일 변형은 지원하지 않습니다. 지도는 X/Z 양수 영역을 사용합니다. 타일에는 충돌이 없으며 건물·벽·이동 판정은 기존 것을 유지합니다. 분수의 파랑/금 상감은 별도 기존 바닥입니다.

## 재제작

- scripts/build-town-ground.cjs: 재질 → 58타일 PNG와 등록 JSON. 47종 판석 연결+4종 잔디+판석 중앙 추가3종+흙4종.
- tools/build_ground_tileset.gd: 공통 TileSet 재생성. 이미 저장된 city_ground.tscn은 덮어쓰지 않습니다. -- --reseed는 기존 칠한 맵을 교체하므로 초기 제작 때만 사용합니다.
- scripts/ground_tilemap.gd: TileMapLayer의 칸/아틀라스/재질 정보를 읽어 3D 바닥 셰이더에 전달합니다. 거대한 수천 개 스프라이트 대신 한 지면에서 표시합니다.
- scripts/render-ground-tiles.ps1: 저장·서버 호출 없이 실제 main.tscn의 정지 미술 출력을 만듭니다.

분수 주변 원래 곡선 광장은 격자 경계로 근사했습니다. 기존 plaza_radii/paved_areas는 초기 배치 생성의 바탕이며, 새 타일 지면 배치는 city_ground.tscn에서 편집합니다.

## 잔디 반복 무늬 보정 · 2026-10-29

기존 큰 풀 포기와 곡선 명암 대신 `source/grass-short.png`의 짧은 풀결을 사용합니다. 빌더에서 원화 중앙의 256×180 재질 영역을 128×90픽셀(64×45 타일 4장)로 필터링합니다. 일괄 명도 단계 축소는 사용하지 않고 원화의 풀잎 덩어리·색상·명암을 유지하며 대비만 90%로 조정한 뒤 기존 LUT에 맞춥니다. 나무·성벽 옆에서 지나치게 평평해지지 않도록 재질 묘사를 보존합니다. 고해상도 원화의 점을 최근접으로 추출하던 방식을 제거했습니다. 4종 차분의 외곽 스트립은 공통으로 유지합니다. 타일 크기·인덱스·판석·흙·저장된 배치는 유지합니다. 반복 검토 이미지는 `grass-repeat-preview.png`이며 게임 실행 화면과 구별합니다.

각 차분의 실제 크기 편집 파일은 `source/grass-tile-0.png`부터 `grass-tile-3.png`까지이며 모두 64×45픽셀입니다. `grass-pixel-preview.png`는 4장을 최근접 4배로 확대한 도트 확인용 이미지입니다.
