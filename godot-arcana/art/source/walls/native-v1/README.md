# 보존된 성벽 v1~v3

현재 활성 타일셋 미술과 제작 절차는 [v4](../native-v4/README.md)를 따릅니다. 아래는 교체 전 이력입니다.

# 성벽 · 실제 편집용 타일셋 v1

편집 원본은 `scenes/native_2d/plaza.tscn`의 **Walls (TileMapLayer)** 입니다.
작은 조립 예제는 `scenes/native_2d/wall_tiles_demo.tscn`이며, 둘 다
`art/resources/native_wall_tileset.tres`를 공유합니다.

## Godot에서 칠하고 지우기

1. 장면을 열고 **Walls** 노드를 선택합니다.
2. 하단 **TileMap → Terrains**에서 **성벽 · 연결**을 고르고 **Connect**로 드래그합니다.
3. 가로에서 세로로 꺾으면 모서리가 자동으로 선택됩니다. 같은 Terrain 도구에서
   지우개 또는 오른쪽 버튼으로 셀을 지우면 빈 칸과 인접 끝단을 다시 연결합니다.
4. 저장한 뒤 게임을 다시 실행하면 해당 셀의 표시와 이동 충돌이 함께 적용됩니다.
   실행 중 편집기의 변경을 게임에 실시간 동기화하는 기능은 제공하지 않습니다.

**Tiles** 탭에서 개별 타일을 직접 고르는 방식도 가능합니다. 방향별 타일이 모두
있으므로 그림 회전 대신 원하는 방향의 항목을 고릅니다. 단순 Tiles 브러시는 주변
모양을 자동 갱신하지 않으므로, 벽을 늘이거나 줄일 때는 Terrain Connect를 사용합니다.

| 형태 | 아틀라스 좌표 (열, 행) |
| --- | --- |
| 가로 / 세로 직선 | (1, 1) / (2, 2) |
| 동남 / 서남 모서리 | (3, 0) / (2, 1) |
| 동북 / 서북 모서리 | (1, 2) / (0, 3) |
| 동 / 남 / 서 / 북으로 연결되는 끝 | (1, 0) / (2, 0) / (0, 1) / (0, 2) |
| 독립 / 십자 | (0, 0) / (3, 3) |

## 제작 규격과 연결

- 네이티브 2D 원본 배율 1:1, 바닥 격자 64×64, 벽 두께 32px, 벽면 높이 192px입니다.
  그림은 64×256이며 Texture Origin (0,96)으로 바닥 셀 위에 등록합니다.
  바닥 격자는 현재 네이티브 도시 좌표를 사용하며 화면 세로를 압축하지 않습니다.
- 가로·세로·모서리·끝·독립·T자·십자의 16가지 측면 연결 상태를 등록했습니다.
  경계 픽셀·석재 줄눈·상단 마감은 동일한 좌표와 반복 위상을 사용합니다.
- 원본은 `scripts/build-native-wall-tiles.cjs`의 픽셀 제작 코드입니다.
  생성 결과는 이 폴더의 `wall-atlas.png`, `manifest.json`, `joined-preview.png`입니다.
  밑그림은 `stone-relief-source-v2.png`이며 재질을 정확한 타일 기하에 등록했습니다. 현재 미술 편집 원본은 `wall-coping-v3.pxpen`입니다. 부조 원본 `wall-relief-v2.pxpen`은 보존합니다. PixelPen의 인덱스 도트 보정·저장·재열기·PNG 출력을 수행했습니다.
- 타운하우스·여관을 참조한 황금빛 석재, 조각 부조, 청금색 프리즈와 상·하단 몰딩을 적용했습니다. 낮은 성가퀴는 상단에 포함하며, 독립 기둥·문·깃발은 이번 세트에 포함하지 않습니다.
- 충돌은 TileSet 물리 레이어 0의 직사각형 조각들입니다. 모서리 안쪽의 빈 부분을
  큰 사각형 하나로 막지 않습니다. 논리 게임 좌표는 원본 픽셀을 4로 나눕니다.
- 게임 표시기는 같은 저장 셀에서 표시 노드를 파생해 기존 인물 깊이 정렬과 가림 알파에
  연결합니다. 편집 원본과 배치 정보는 기본 TileMapLayer 한 곳에서 관리합니다.
- 옛 광장의 성벽 Sprite2D 24개와 고정 wall_rectangles는 활성 광장에서 제거했습니다.
  과거 3D용 성벽 자산은 별도 참조 이력이 있어 보관합니다.

## 상단 마감 보정 v3

두꺼운 밝은 테두리를 지적한 사용자 요청으로 상단을 다시 그렸습니다. 모서리를 감싼
밝은 면을 낮은 채도의 돌 보행로로 바꾸고, 가장자리 마감선은 1~2px로 줄였습니다.
바닥 돌줄눈과 가로·세로 방향의 낮은 성가퀴를 추가했습니다. 16종 모두 같은 격자와
접합 좌표를 사용하며 성가퀴는 그림에만 추가되어 기존 바닥 충돌을 바꾸지 않습니다.
PixelPen의 v3 원본 저장·재열기·PNG 출력 후 게임용 텍스처를 갱신했습니다.
재출력은 `tools/refine_native_wall_coping.gd` 또는 `tools/polish_native_wall_tiles.gd`로
기존 v3 원본을 내보내고, `tools/author_native_wall_tiles.gd`로 리소스를 갱신합니다.

## 미술 보정 v2

기존 단순 벽돌은 주변 건물과 묘사량·명암 차이가 크다는 사용자 지적으로 교체했습니다.
실제 야외 타운하우스와 여관을 입력 참조로 새 석재 재질 밑그림을 만들고,
64×256 타일 16종의 접합 기하는 그대로 사용했습니다. PixelPen에서 내부 고립 도트
1,376개를 보정했으며 접합 가장자리는 보정에서 제외했습니다. 편집 원본 저장·재열기와
최종 PNG 출력 후 게임용 리소스를 갱신했습니다. 그림을 바꾸며 배치·충돌을 재설정하지 않았습니다.
`joined-preview.png`는 최종 타일을 조립한 비교 자료이며 실제 게임 화면은 아닙니다.

PixelPen 원본을 직접 수정한 뒤에는 `tools/polish_native_wall_tiles.gd`로 출력합니다.
이미 있는 편집 원본은 다시 생성하지 않습니다. 이어 `tools/author_native_wall_tiles.gd`를
실행하면 게임의 공유 타일 텍스처를 갱신합니다.

## 재생성

```powershell
node scripts/build-native-wall-tiles.cjs
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/polish_native_wall_tiles.gd
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_native_wall_tiles.gd
```

미술·TileSet 재생성은 이미 타일맵으로 전환된 광장의 수동 칠하기를 보존합니다.
예제 장면도 기본적으로 보존하며, 예제 초기화는 명시적으로 `-- --reset-demo`를 덧붙일 때만 수행합니다.

광장을 편집한 뒤 서버 전투 지형을 갱신하려면 다음 명령을 사용합니다. 정상 웹 빌드도
이 내보내기를 실행합니다. 실행 중인 서버의 지형 캐시에는 서버 재시작이 필요합니다.

```powershell
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/export_combat_layout.gd
```

Godot 4.5.1의 실제 Terrain Connect API로 조립 예제를 생성하고 남문 셀을 삭제하여
리소스를 저장했습니다. 저장 리소스 로드·물리 조각 추출·관련 스크립트 구문 확인과
서버 지형 내보내기를 완료했습니다. 편집기 마우스 조작·게임 플레이·브라우저 테스트는 실행하지 않았습니다.

