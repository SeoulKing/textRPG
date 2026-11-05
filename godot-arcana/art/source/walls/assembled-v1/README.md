# 승인된 완성 성곽에서 추출한 조립 타일셋

현재 활성 성벽은 이 폴더의 미술 원본과 `art/resources/assembled_wall_tileset.tres`입니다.
사용자는 전체 성곽 외형을 보고 “좋아 이거로 가보자”로 승인했습니다.
이전 native-v1~v4는 보존 이력입니다.

## Godot에서 편집

1. `res://scenes/native_2d/wall_assembled_demo.tscn` 또는
   `wall_assembled_expanded_demo.tscn`을 엽니다.
2. **Walls**를 선택하고 하단 **TileMap → Patterns**를 엽니다.
3. 이름이 붙은 직선·모서리·입구 조각을 선택해 한 번씩 찍습니다.
   성곽 전체를 한 번에 찍는 원형/확장형 패턴도 있습니다.
4. 지울 때는 해당 조각을 놓은 **기준 칸**에 지우개/오른쪽 버튼을 사용합니다.
   한 조각은 그래픽이 여러 칸에 걸쳐도 하나의 기준 칸에 등록된 타일입니다.
   기준 칸을 포함해 영역 선택 후 삭제하는 방식도 사용할 수 있습니다.

기존 Terrain Connect의16마스크를 다시 그리지 않았습니다. 승인된 완성본의 외형을
유지하기 위해 **조각 또는 완성 성곽을 골라 배치하는 방식**으로 등록했습니다.
임의 연속 드래그를 하면 큰 조각이 겹칠 수 있습니다. 같은 조각을 이어 놓을 간격은
앞 반복128px(8칸), 앞 연결112px(7칸), 세로 반복160px(10칸)입니다.
뒤 반복 벽은 폭304px이지만 끝 기둥64px을 공유하므로 **240px(15칸) 간격**으로 놓습니다.
편집 배치 격자는16×16이며 그림/노드 배율은1입니다.

## 원본과 추출

- 승인 그림: `art-studies/city-walls/enclosure-master-v1/enclosure-concept.png`.
- 이진 알파 기준으로 낮은 알파의 가장자리 잡색만 정리했습니다. 원본 파일은 보존합니다.
- 전체를 같은 **0.75배 최근접 배율**로 옮긴 `enclosure-master.png`가 제작 기준입니다.
  앞/뒤·좌/우를 다르게 늘리지 않습니다.
- 원본 재조립17항목과 반복/연장7항목, 총24항목을 등록했습니다.
  원본17항목으로 재조립할 때 승인 그림의 불투명 픽셀 누락은0개입니다.
- `manifest.json`에 각 원본 자르기 좌표, 아틀라스 좌표, 원점, 충돌,
  원형/확장형 배치를 함께 저장합니다.
- 최종 PixelPen 원본: **`wall-kit-final.pxpen`**.
  이전 `wall-kit.pxpen`, `wall-kit-v2.pxpen`은 접합 보정 전 이력입니다.
- `atlas-prepared.png`는 준비물, `atlas.png`는 PixelPen 저장·재열기 후 출력입니다.
  원형을 복원하는 조각은 유지하고 반복형에서만 접합 도트를 보정했습니다.
  뒤 반복 구간은 완전한 기둥을 공유하도록 추출해 반쪽 기둥이 반복되는 문제를 없앴습니다.
- 게임 텍스처는 `art/export/walls/assembled-wall-atlas.res`이며,
  TileSet·물리 폴리곤과 함께 활성 광장에 연결됩니다.

## 활성 게임과 확인 범위

`scenes/native_2d/plaza.tscn/Walls`는 같은 TileSet의 앞 벽·모서리·입구 조각32개를 사용합니다.
남문과 기존 성벽의 가로 범위를 유지합니다. 기존 노드 그룹과 다른 사용자 배치는 보존했습니다.
게임의 깊이 정렬·반투명 가림은 저장된 같은 셀에서 만든 표시를 사용합니다.
삭제된 기준 칸에는 해당 조각의 고정 충돌이 남지 않습니다. 서버 전투 지형도 갱신했습니다.

`renders/original.png`, `expanded.png`, `actual-plaza.png`는 실제 Godot 정지 출력입니다.
게임 입력·네트워크·저장을 시작하지 않고 리소스 로드·원형 재조립·확장 접합·광장 표시를 확인했습니다.
편집기 마우스 조작·게임 플레이·웹 내보내기는 이번 범위에서 실행하지 않았습니다.

## 재제작과 내보내기

프로젝트 루트에서 다음 순서로 실행합니다.

```powershell
node scripts/build-assembled-wall-art.cjs
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_assembled_wall_art.gd
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/author_assembled_wall_tiles.gd
& ./.runtime/godot/Godot_v4.5.1-stable_win64_console.exe --headless --path godot-arcana --script res://tools/export_combat_layout.gd
```

수동 PixelPen 원본이 있으면 다시 만들지 않고 그 원본을 출력합니다.
기존 예제의 수동 칠하기도 보존합니다. 제작 초기 예제로 재설정할 때만
`author_assembled_wall_tiles.gd -- --reset-demo`를 사용합니다.
`apply_assembled_walls_to_plaza.gd`는 현재 남쪽 성벽을 초기 배치로 바꾸는 명시적 이전 도구이며
일반 재생성에서 실행하지 않습니다.

