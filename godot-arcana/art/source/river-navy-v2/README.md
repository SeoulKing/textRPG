# 2번 남청색 강 · 도트 프레임 흐름
사용자는 river-options-v1의2번을 선택하고, 바다 같은 반복 물결과 픽셀 선이 생기는 기존 효과 대신 도트로 흐르는 표현을 요청했습니다(2026-11-02).

- 활성 장면: scenes/native_2d/city_river_quarter.tscn. Water와 RippleDots는 실제64×64 TileMapLayer이며, Water는64×5칸입니다. 기존 강/다리 위치·크기·충돌은 유지했습니다.
- base.pxpen: 승인2번으로 생성한 별도 수면 밑그림을32색으로 정리하고 PixelPen 인덱스 픽셀을 보정한512×512 고정 바탕입니다.
- ripples.pxpen:64×512 캔버스에64×64 물결8종을 세로로 배치하고12프레임·6fps로 직접 인덱스 좌표를 작성한 PixelPen 애니메이션입니다. 짧은2~8픽셀 무늬가 한 픽셀씩 이동하고 밝기 단계로 나타났다 사라집니다.
- reflections.pxpen:64×128·12프레임·6fps의 짧은 등불 반사 도트입니다. 실제 북쪽 가로등 X 위치7곳에 표시합니다.
- 각 원본은 저장→재열기→PNG/압축 ImageTexture 출력 과정을 거쳤습니다. PixelPen UI에서 손으로 그렸다고 보고하지 않습니다. 최초 작성은 author_river_navy.gd가 인덱스 픽셀 좌표를 지정했으며, 이후 재출력은 저장된 수동 원본을 우선합니다.
- 런타임: native_2d_river.gd는 정적 수면은 이동하지 않고 RippleDots의 프레임 타일과 반사 Sprite2D.frame만 갱신합니다. 기존 UV 스크롤·사인 변형·절차적 긴 반사 선 셰이더는 연결하지 않습니다. 동작 줄이기는0번 프레임에 고정하고, 효과 끄기는 물결/반사를 숨깁니다.
- 도트 프레임은 지점별 위상을 달리해 동시에 깜빡이지 않게 했습니다. RippleDots의 저장된 셀만 재생하며 빈 곳을 런타임에서 채우지 않습니다.
- 제작 입력·생성 프롬프트·기존 장면 백업·네이티브 감사·실제 GPU 출력은 art-studies/regions/arcana-city-center/source/river-navy-v2/에 보존합니다.
- 재출력: node scripts/prepare-river-navy.cjs → pwsh -NoProfile -File scripts/run-city-river.ps1 -Action Navy. 이미 타일맵으로 전환된 장면은 재생성하지 않으므로 직접 칠한 셀과 배치를 보존합니다. 전체 게임을 이전 배치 도구로 다시 생성하지 않습니다.
- 출력: art/export/river-navy-v2/의 base.res·ripples.res·reflections.res. 같은 폴더의 TileSet .tres는 재사용용이며 현재 저장 장면에는 대응 TileSet이 내장되어 있습니다. frames/는 네이티브 프레임 PNG입니다.
- 오프라인 동작 프리뷰: render-source/river-flow.gif. 실제 main.tscn을 사용한 게임 표시기의24프레임 출력이며, 브라우저 플레이 검증과 다릅니다.
