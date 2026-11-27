# 밝은 청람색 강과 연결된 물결
사용자 후속 지시(2026-11-02): 색을 더 밝게 하고 흐름 애니메이션을 보강합니다. 기존 어두운 바탕과 작은 밝은 점이 밤하늘처럼 보인다는 피드백을 반영했습니다.

- 활성 원본: base.pxpen, ripples.pxpen, reflections.pxpen. base는 승인된 river-navy-v2/base.pxpen의 픽셀 인덱스와 그림 형태를 그대로 보존하고 팔레트만 밝은 청람색으로 수정한 사본입니다. 이전 원본은 덮어쓰지 않습니다.
- base512×512: 가장 어두운 색을 들어 올리고 반사 얼룩의 대비를 낮췄습니다. 별무리처럼 보이던 어두운 빈 영역과 밝은 점 대비를 줄입니다.
- ripples64×512: 물결8종,24프레임·8fps·3초 순환. 독립된1픽셀 반짝임 대신 짧고 납작한2~3픽셀 두께의 연결된 색 덩어리를 작성했습니다. 덩어리는 자라남→이동→잦아듦을 거치고, 한 픽셀을 두 프레임 동안 유지해 느린 한 방향 흐름을 만듭니다. 밝기·끝 모양·잔물결을 같은 덩어리에 연결했습니다.
- reflections64×128:24프레임. 조각이 갑자기 꺼졌다 켜지는 동작을 줄이고 반사 묶음이 함께 조금씩 움직이도록 했습니다. 낮 반사 밝기도 낮췄습니다.
- 모든 프레임은 PixelPen 인덱스 좌표로 작성하고 저장·재열기·PNG/RES 출력을 수행합니다. PixelPen UI에서 수작업으로 그렸다는 뜻은 아닙니다. 이미 저장된 원본이 있으면 재생성하지 않고 해당 원본을 출력합니다.
- 재출력: pwsh -NoProfile -File scripts/run-city-river.ps1 -Action Daylight. 제작 스크립트는 tools/author_river_daylight.gd입니다. 기존 Water/RippleDots 셀과 배치·충돌은 보존하고 텍스처/TileSet/프레임 원본만 연결합니다.
- runtime: native_2d_river.gd. 지점마다 저장한 위상과 물결 종류를 보존하며24프레임을 선택합니다. 수면 전체 스크롤·UV 변형은 사용하지 않고 동작/효과 줄이기 설정을 따릅니다.
- 실제 표시: scenes/native_2d/city_river_quarter.tscn의64×64 TileMapLayer2개와 반사 Sprite2D입니다. 새 TileSet은 art/export/river-daylight-v3/base-tiles.tres와 ripple-tiles.tres를 참조합니다.
- 입력 보존·팔레트 변경 기록·감사·실제 렌더는 art-studies/regions/arcana-city-center/source/river-daylight-v3/를 따릅니다. 검토용GIF는 게임 표시기의 오프라인 출력이며 플레이 테스트와 구별합니다.
