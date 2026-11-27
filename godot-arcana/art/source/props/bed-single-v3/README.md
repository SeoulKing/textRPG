# 새 단일 침대 · 승인 시안 v3

사용자가 압축된 v2의 비례를 거절한 뒤 새로 생성한 1×3칸 침대 시안을 승인했습니다. 승인 원화는 `art-studies/props/bed-single-v3/concept.png`입니다. 이전 v1/v2 원본과 별도로 보존합니다.

- 새 시안 전체를 가로·세로 같은 배율로 원본 픽셀 밀도에 맞추고 PixelPen에서 재질별 인덱스 채색·고립 픽셀 정리·별·베개 주름·목재 하이라이트를 보정했습니다. v1/v2 침대 그림을 폭 방향으로 압축하거나 부분 재배치하지 않았습니다.
- 원본 `bed.pxpen`: Godot 4.5.1 / PixelPen 1.1.4 네이티브 API, 2개 레이어, 저장·재열기·PNG 출력 완료. GUI 브러시 조작은 아닙니다. 도트 마감 수치는 `pixelpen-audit.json`입니다.
- 캔버스 112×192, 발 (56,174), 바닥 1×3 월드 칸, 공통 64px/단위. 그림 범위와 실제 점유·충돌 영역을 구별합니다. 투명 알파와 최근접 표시를 사용합니다.
- 게임 PNG: `res://art/export/bed-single-v3/bed.png`.
- 3D 배치: `res://scenes/props/bed_single.tscn`. 루트는 앞쪽 중앙이며 -Z로 3칸 뻗습니다. 물리 충돌 1×3칸입니다.
- 2D 배치: `res://scenes/props/bed_single_2d.tscn` 또는 `res://art/export/bed-single-v3/bed_tileset.tres` 장면 타일입니다. 반 칸 편집 격자에서는 2×6셀을 확보합니다.
- 기존 방은 별도 내비게이션 사각형을 사용하므로 실제 방 배치 시 manifest의 footprintWorldRect를 방 배치 데이터에도 등록합니다. 현재 실제 방·기능·웹 산출물은 변경하지 않았습니다.
- `scale-comparison.png`: 기존 illustrated_prop 렌더러·yaw0°/하향45°·64px/단위에서 주인공과 나란히 출력한 오프라인 미술 비교입니다. 플레이·브라우저 테스트는 실행하지 않았습니다.

재제작: `node scripts/prepare-arcana-single-bed.cjs` → `pwsh -File scripts/author-arcana-single-bed.ps1`. 기존 `.pxpen`이 있으면 중단하여 수동 편집을 보존합니다. 후속 편집은 해당 원본을 PixelPen에서 열어 진행합니다.
