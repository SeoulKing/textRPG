# 침대 v2 · 1×3칸

사용자 지시에 따라 기존 침대를 폭 1칸·길이 3칸으로 수정했습니다. 원본 v1은 보존했습니다.

- PixelPen 원본: `bed.pxpen`. Godot / PixelPen 네이티브 API로 기존 인덱스 레이어를 재배치하고 별 자수를 다시 그린 뒤 저장·재열기·PNG 출력을 완료했습니다. GUI 브러시 조작은 아닙니다.
- 캔버스 112×272, 발 (56,250), 점유 1×3 월드 칸, 공통 64px/단위. 깊이·전체 높이는 유지하고 폭만 줄였습니다. 기둥 두께는 유지하고 가로 부재·침구 중앙 폭을 줄였습니다.
- 출력: `res://art/export/bed-stardew-v2/bed.png`.
- 3D 배치: `res://scenes/props/bed_narrow.tscn`. 앞쪽 중앙이 루트이며 -Z 방향으로 3칸 뻗습니다. 물리 충돌도 1×3칸입니다.
- 2D 배치: `res://scenes/props/bed_narrow_2d.tscn`, `res://art/export/bed-stardew-v2/bed_tileset.tres`. 기존 반 칸 편집 격자에서는 2×6셀을 확보합니다.
- 기존 방의 별도 내비게이션에 연결하려면 manifest의 footprintWorldRect를 방 배치 데이터에도 등록합니다. 실제 방 배치·웹 산출물은 변경하지 않았습니다.
- 재제작: `pwsh -File scripts/author-arcana-bed-narrow.ps1`. 기존 v2 원본이 있으면 중단해 수동 편집을 보존합니다.
- `preview-4x.png`는 최근접 4배 출력이며 `scale-comparison.png`는 기존 미술 렌더러·기본 카메라에서 주인공 옆에 둔 오프라인 크기 비교입니다. 게임·브라우저 테스트는 실행하지 않았습니다.
