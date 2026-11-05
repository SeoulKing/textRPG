# 승인된 도심 가로 강
사용자 참조와 source/river-v1/concept-v1.png를 기준으로 2026-11-02 “아주 좋아” 승인을 받았습니다.

- 활성 배치: scenes/native_2d/plaza.tscn → Placements/RiverQuarter → city_river_quarter.tscn. 이후 위치·모양 수정은 저장 장면에서 진행합니다. 모든 노드 Scale(1,1)입니다.
- 원본: bridge.pxpen(320×511), bank.pxpen(512×56), water-calm.pxpen(512×512). PixelPen에서 고립 픽셀·석축 접합을 보정하고 저장·재열기·PNG 및 압축 Texture2D 출력을 수행했습니다. UI에서 손으로 도트를 그렸다고 보고하지 않습니다.
- 이전 water.pxpen은 조밀한 초기 수면 후보이며 현재 사용하지 않습니다.
- 게임 출력: art/export/city-river-v1/의 같은 이름 PNG·RES. 실제 연결은 RES 3개입니다.
- 제작 입력·프롬프트·참조·규격·GPU 출력: art-studies/regions/arcana-city-center/source/river-v1/. 생성 원본은 각각 별도 다리·석축·수면 자산입니다. 큰 시안 전체를 줄여 게임 배경으로 쓰지 않습니다.
- 재출력: node scripts/prepare-city-river.cjs → pwsh -NoProfile -File scripts/run-city-river.ps1 -Action Author. 준비 PNG는 초기 수입용이며 기존 수동 PixelPen 원본을 덮어쓰지 않습니다. 네이티브 원본이 있으면 그것을 다시 열어 출력합니다.
- 다리 원본의 반복 돌바닥 구간을 줄여 320×511으로 구성했습니다. 수평/수직 픽셀 비율은 동일하며 세로로 눌러 짧게 만들지 않습니다.
- 물은 동서 방향으로 흐르고 중앙 다리는 남북 통행입니다. 물·석축 충돌은 WaterBoundary의 두 Rect2에 함께 보관하며 클라이언트/서버 내보내기가 같은 원본을 읽습니다. 논리 통행 폭은 X553..599이며 양쪽 충돌 여유 3을 뺀 곳에서 통행합니다.
- 물결은 native_2d_river.gdshader가 원본 픽셀 격자에서 움직입니다. native_2d_river.gd는 게임 시계·저녁·효과 줄이기·동작 줄이기를 따릅니다. 물·다리 바닥·낮은 석축은 별도 지면 레이어이며 기존 가로등과 화단은 기존 자산을 재사용합니다.
- 초기 배치 도구 place-city-river.cjs는 이미 연결된 씬을 재생성하지 않도록 중단합니다. 최종 배치 원본은 저장된 두 quarter 씬과 plaza.tscn이며 초기 도구 재실행으로 수동 편집을 덮지 않습니다.
- 웹: scripts/build-arcana-online.ps1 → scripts/publish-plaza-build.ps1. 고유 stage에서 빌드하고 raw/gzip 로컬 산출물을 함께 교체합니다. 공개 배포는 별도입니다.
