# 선택1번 강물 · 네이티브 도트 재작성과 하이라이트 레이어
사용자 요청(2026-11-02): 선택1번의 색/인상은 유지하고, 확대되어 보이는 수면을 주변 장소와 같은 묘사 밀도로 보강하며, 상단 레이어에서 밝은 부분이 움직이게 합니다. 후속 지시로 PixelPen 격자에서 픽셀 단위로 구성합니다.

## 편집 원본
- base.pxpen:448×448,2개 레이어. Depth는 승인된 맑은 청색 팔레트로 새 인덱스 좌표를 작성했고, Fine은1픽셀 윤곽/가는 물결/붙어 있는 어두운 밑면입니다.
- highlights.pxpen:448×448,16프레임·8fps,프레임별2개 레이어(Cyan shoulder/Bright crest). 승인 수면의 밝은 가로 구간을 가이드로 잡아 얇은 물결 모양을 다시 작성했습니다. 도트가 커졌다 잦아드는 단계와 한 픽셀 이동을 함께 사용합니다.
- 물색16색+투명1색은 기존1번 수면에서 취했습니다. 새 원본에는 평면PNG를 통째로 import하지 않았으며 set_index_on_color_map으로 픽셀 인덱스를 작성하고 저장·재열기·PNG/RES 출력을 수행했습니다. PixelPen UI에서 손으로 그렸다는 뜻은 아닙니다.
- 기존 이미지는 형태/색 가이드로 읽었습니다. 같은 월드 면적의 물결 빈도를2배로 잡고, 굵은 덩어리를1픽셀 경계와 세부 물결로 보강했습니다. 이미지 캔버스를 크게 늘리거나 노드를 확대해서 밀도가 올라간 것으로 처리하지 않습니다.

## 실제 연결과 출력
- city_river_quarter.tscn의 Water는64×64 TileMapLayer,448×448 재질7×7타일입니다. 기존320개 셀·배치·충돌·낚시 기하를 유지합니다.
- HighlightFlow는 같은 격자/위치의 별도 투명 TileMapLayer(z=-29)입니다. 기존 밝은 물결 위치를 기반으로 한16프레임을 선택하며 수면 전체 UV는 움직이지 않습니다. 과거 RippleDots는 보존하되 새 레이어가 있으면 숨깁니다. 등불 반사는 기존 원본을 유지합니다.
- 아틀라스는1792×1792(4×4프레임)이며 각 프레임은448×448입니다. TileSet의64px 타일을 프레임마다 선택합니다. 모든 자산과 노드 Scale은1입니다.
- 동작/효과 줄이기는 하이라이트0번 프레임으로 정지합니다. 하이라이트는 물 미술의 일부이므로 정지 상태에서도 남깁니다.
- runtime제어는 native_2d_river.gd입니다. river_fishing_geometry.gd 상속은 보존합니다.

## 재출력
pwsh -NoProfile -File scripts/run-city-river.ps1 -Action Pixels
- author_river_pixels.gd는 새 원본이 없을 때만 인덱스 픽셀을 작성합니다. 기존 PixelPen 수동 원본이 있으면 그것을 재열어 출력합니다.
- 상단 레이어가 이미 있으면 저장된 셀을 새로 칠하지 않습니다. 바닥/다리/석축 위치와 이동/낚시 판정도 건드리지 않습니다.
- 가이드 추적 좌표와 감사는 art-studies/regions/arcana-city-center/source/river-pixel-v5/highlight-plan.json 및 pixelpen-audit.json에 있습니다. nativeIndexedAssignments는 작성 기록이며 미술 품질 점수가 아닙니다.
