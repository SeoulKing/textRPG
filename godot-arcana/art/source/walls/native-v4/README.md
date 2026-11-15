# 보존 이력 · v4

현재 활성 미술과 편집 방법은 [승인 성곽 조각](../assembled-v1/README.md)을 따릅니다. 아래는 교체 전 이력입니다.

# 아르카나 성벽 타일셋 v4

현재 활성 원본은 이 폴더의 `wall-kit.pxpen`입니다. v1~v3는 보존 이력입니다.
게임의 공유 TileSet은 `art/resources/native_wall_tileset.tres`, 실제 도시 배치는
`scenes/native_2d/plaza.tscn/Walls`입니다.

## 편집

Godot에서 광장 또는 `scenes/native_2d/wall_perimeter_demo.tscn`을 열고
**Walls → TileMap → Terrains → 성벽 · 연결 → Connect**를 선택합니다.
왼쪽 드래그로 칠하고 같은 Terrain의 오른쪽 버튼/지우개로 지웁니다.
가로·세로 직선, 네 모서리, 네 끝단, 독립·T자·십자까지 16상태가 연결됩니다.
방향별 그림이 있으므로 전치·이미지 회전 도구 대신 Terrain Connect를 사용합니다.

도시 배치와 예제는 같은 TileSet을 공유합니다. 저장 후 게임을 다시 실행하면
같은 셀로 표시·이동 충돌이 만들어집니다. 실행 중 편집기 변경을 실시간 동기화하지 않습니다.
서버 전투 지형은 아래 내보내기 명령 후 서버를 재시작해야 캐시가 갱신됩니다.

## 수정한 구조

- 바닥 격자는 기존 64×64 그대로이며, 벽 두께를 **32px에서 12px**로 줄였습니다.
  물리 코어도 ±6px입니다. 색만 바꿔 굵은 띠를 얇게 보이도록 처리하지 않습니다.
- 벽 본체 176px, 성가퀴 높이 16px, 전체 등록 높이 192px입니다.
  한 타일 이미지는 64×256, Texture Origin (0,96), 정렬 기준은 바닥 앞쪽 6px입니다.
- 모든 형상은 `geometry.json`과 같은 바닥 점유/높이 필드에서 제작합니다.
  연결되는 북·남 셀에 중복된 전면을 쌓지 않고, 실제 드러난 전면과 상단을 그립니다.
- 넓은 반복 아치와 액자형 띠를 기본 벽에서 제거했습니다. 석재 면, 얇은 상단,
  성가퀴를 사용하며, 연결 가장자리에는 두꺼운 테두리를 추가하지 않습니다.
- 새 재질 밑그림은 `sandstone-source.png`입니다. 타운하우스와 여관을 화풍·색 참조로
  생성한 뒤 정확한 타일 기하 위에 등록했습니다. PixelPen에서 내부 고립 도트를 보정하고
  원본 저장→재열기→투명 PNG 출력→게임용 리소스 저장까지 수행합니다.
- 모서리 충돌은 코어와 연결 팔별 직사각형입니다. 안쪽의 빈 공간을 한 사각형으로 막지 않습니다.
- 기존 도시에서 사용자가 칠한 셀은 재생성 때 보존합니다. 도시 전체의 새 외곽 배치는
  별도 편집 예제이며, 현재 도시의 남쪽 성벽 배치를 임의로 닫지 않습니다.

## 실제 Godot 제작 확인

리소스 생성에서 16개 Terrain 상태, 중간 삭제 후 끝단 갱신, 전체 삭제 후 충돌 0을 확인합니다.
32×24칸 외곽 예제는 네 방향·안쪽/바깥쪽 모서리·두 출입구를 포함합니다.
`renders/`는 그림 조립기가 아닌 Godot 4.5.1의 실제 2D 정지 출력입니다.

- `wall-building-native-scale.png`: 활성 타운하우스·주인공과 같은 원본 배율.
- `perimeter-overview.png`: 넓은 외곽과 건물, 안쪽 꺾임과 출입구.
- `actual-plaza-south-wall.png`: 현재 네이티브 게임 표시기를 사용한 남문.

정지 렌더에서는 main/API/저장을 시작하지 않고 World 로직과 입력을 비활성화합니다.
게임 플레이·브라우저 테스트·웹 내보내기는 실행하지 않았습니다.

## 재생성

프로젝트 루트에서 아래 순서로 실행합니다. PixelPen 원본이 있으면 수동 편집을 보존하고
그 원본을 출력합니다. `wall-atlas-prepared.png`는 최초 PixelPen 원본을 만드는 준비물입니다.

```powershell
node scripts/build-native-wall-tiles.cjs
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_native_wall_art.gd
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_native_wall_tiles.gd
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/export_combat_layout.gd
```

PixelPen 단일 레이어 원본은 `get_layer_image()`로 팔레트를 직접 출력하고 RGBA8로
변환합니다. 이 작업에서 `get_image()` 합성 출력을 그대로 PNG에 저장하면 투명 바탕이
불투명 검정이 되는 현상을 실제 Godot 렌더에서 발견했습니다. 현재 출력은 투명도를 보존합니다.

예제 초기화는 `author_native_wall_tiles.gd -- --reset-demo` 또는
`--reset-perimeter-demo`를 명시했을 때만 실행합니다.

