# 맑은 청색 강 · 실제 인게임 후보1번
2026-11-02 사용자가 river-ingame-options-v4/ingame-5-options.png의1번을 선택했습니다.

- 활성 원본: base.pxpen. 후보 pixelpen/01.pxpen을 복사하여 저장·재열기·PNG/압축 Texture2D로 출력했습니다. 후보 materials/01.png와448×448 RGBA 픽셀 전체가 같음을 승격 도구에서 확인합니다.
- 재질:448×448,64×64타일7×7개. 출력은 art/export/river-clear-v4/base.png·base.res·base-tiles.tres입니다.
- 배치: scenes/native_2d/city_river_quarter.tscn/Water의 저장된320개 셀을 보존하고 TileSet과 atlas 좌표만 새 반복 재질에 맞춰 연결했습니다. 강·다리·석축 위치/크기와 충돌은 변경하지 않습니다.
- 기존24프레임 도트 흐름과 등불 반사는 river-daylight-v3 원본을 그대로 사용합니다. native_2d_river.gd의 현재 낚시 기하 상속과 제어는 변경하지 않았습니다.
- 승인·원본·비교·승격 기록은 art-studies/regions/arcana-city-center/source/river-ingame-options-v4/의 candidates.json·selected-01.json을 따릅니다.
- 승격 도구: pwsh -NoProfile -File scripts/run-city-river.ps1 -Action Choice1. 후보 픽셀과 달라진 네이티브 원본은 자동 덮어쓰지 않고 멈춥니다. 이후 별도로 수동 편집한 원본을 출력할 때는 해당 편집을 보존하여 내보냅니다.
